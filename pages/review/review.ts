import { getJournal, PREFERENCE_LABEL, PREFERENCE_EMOJI, PORTION_LABEL, PORTION_EMOJI, MealLog, Preference, getMealTime, combineTime, logMeal, unlogMeal } from '../../utils/journal'
import { getReactions, removeReaction, updateReaction, REACTION_TYPE_LABEL, REACTION_TYPE_EMOJI, SEVERITY_LABEL, ReactionLog } from '../../utils/reactions'
import { getWeekday, reconcileTryingReplaced, getTryingProgress, getCurrentTryingCategoryId, startTryingForFood, formatDate, regenerateKeepingLoggedToday, DailyPlan } from '../../utils/planner'
import { summarize7Days, buildTimeline, getFirstSeenMap, getIngredientEmoji, formatDelta, isFoodNew, WeekSummary, TimelineEvent } from '../../utils/reviewStats'
import { BabyProfile } from '../../utils/planner'
import { getCategoryByFood } from '../../data/categories'

// 与 profile.ts/index.ts 对齐: 启动排敏后让 weeklyPlan 把 trying food 排进菜单
function syncPlan(profile: BabyProfile) {
  const existingPlan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
  if (existingPlan.length > 0) {
    const newPlan = regenerateKeepingLoggedToday(profile, existingPlan)
    wx.setStorageSync('weeklyPlan', newPlan)
  }
}

// 找出 ingredients 里"可以启动排敏"的新食材
// 条件: 有 category + 该 category state 不是 trying + 该食材不在 confirmed/allergic/observation/introducing
// 返回去重后的食材名列表
function detectNewFoodsForTrying(profile: BabyProfile, ingredients: string[]): string[] {
  const confirmed = new Set(profile.confirmedFoods || [])
  const result: string[] = []
  const seen = new Set<string>()
  for (const ing of ingredients) {
    if (seen.has(ing)) continue
    seen.add(ing)
    if (confirmed.has(ing)) continue
    const ex = profile.individualExceptions[ing]
    if (ex) continue  // allergic / observation / introducing 都跳过
    const cat = getCategoryByFood(ing)
    if (!cat) continue  // 自定义食材没法启动排敏(分类库找不到)
    const catState = profile.categoryAllergies[cat.id]
    if (catState?.state === 'trying') continue  // 该品类已在排敏(可能就是这个食材)
    if (catState?.state === 'open' && catState.tryingFood === ing) continue  // 兜底
    result.push(ing)
  }
  return result
}

type FilterTab = 'all' | 'reaction' | 'newFood' | 'love' | 'noRecent'

Page({
  data: {
    summary: null as null | (WeekSummary & {
      loveDeltaText: string
      newFoodDeltaText: string
      reactionDeltaText: string
    }),
    activeTab: 'all' as FilterTab,
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'reaction', label: '有观察' },
      { key: 'newFood', label: '新食材' },
      { key: 'love', label: '爱吃' },
      { key: 'noRecent', label: '最近未吃' }
    ],
    days: [] as Array<{
      date: string
      dateLabel: string
      weekday: string
      events: any[]
    }>,
    searchOpen: false,
    searchKeyword: '',
    fabMenuOpen: false,
    // 补记一餐 / 编辑记录 sheet
    manualOpen: false,
    manualIsEditing: false,
    manualEditDate: '',         // 编辑模式下原 log 的 date+mealIndex(用于定位)
    manualEditMealIndex: -1,
    manualDate: '',
    manualTime: '',
    manualDishName: '',
    manualIngredientsText: '', // 兼容字段(老数据), 实际改用 chips
    manualIngChips: [] as string[],
    manualIngInput: '',
    manualIngSuggestions: [] as string[],
    manualPortion: '' as '' | 'taste' | 'small' | 'half' | 'full',
    manualNote: '',
    todayStr: ''
  },

  // 从最近 30 天 mealJournal 取使用频率最高的食材作为快捷建议
  computeIngSuggestions(excludeChips: string[]): string[] {
    const logs = getJournal()
    const cutoff = Date.now() - 30 * 86400000
    const counter: Record<string, number> = {}
    for (const l of logs) {
      const t = getMealTime(l) ? new Date(getMealTime(l)).getTime() : 0
      if (t < cutoff) continue
      for (const ing of (l.ingredients || [])) {
        if (!ing) continue
        counter[ing] = (counter[ing] || 0) + 1
      }
    }
    const excludeSet = new Set(excludeChips)
    return Object.entries(counter)
      .filter(([name]) => !excludeSet.has(name))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name)
  },

  onShow() {
    this.refresh()
    if ((this as any).getTabBar) {
      const tb = (this as any).getTabBar()
      if (tb) tb.setData({ selected: 3 })
    }
  },

  setTab(e: any) {
    this.setData({ activeTab: e.currentTarget.dataset.key })
    this.refresh()
  },

  refresh() {
    // 与 index.ts 对齐: 进页时跑一次 reconcile, 清理"实际已吃过 trying food 但被错记 replaced"的脏日期
    // 否则 manualSheet 补记/编辑后 plan 页或 hero 卡的 daysRequired 会一直多算
    let profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (profile && reconcileTryingReplaced(profile)) {
      wx.setStorageSync('babyProfile', profile)
    }

    const allLogs = getJournal()
    const allReactions = getReactions()
    const firstSeen = getFirstSeenMap()
    profile = wx.getStorageSync('babyProfile')
    const summary = summarize7Days(profile)

    // 按 active tab filter
    const filterTab = this.data.activeTab
    let logs = allLogs
    let reactions = allReactions

    if (filterTab === 'reaction') {
      logs = []
    } else if (filterTab === 'newFood') {
      reactions = []
      logs = logs.filter(l => (l.ingredients || []).some(ing => isFoodNew(ing, l, firstSeen, profile)))
    } else if (filterTab === 'love') {
      reactions = []
      logs = logs.filter(l => l.preference === 'love')
    } else if (filterTab === 'noRecent') {
      // 不依赖时间筛: 按"最近 14 天未出现的食材代表" 兜底为空, 简化为只筛 7 天外的 log
      reactions = []
      const today = new Date()
      const cutoff = new Date(today.getTime() - 7 * 86400000)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      logs = logs.filter(l => l.date < cutoffStr)
    }

    // 搜索过滤
    const kw = (this.data.searchKeyword || '').trim().toLowerCase()
    if (kw) {
      logs = logs.filter(l => {
        const hay = [l.customDishName, l.recipeName, ...(l.ingredients || []), l.note || ''].join('|').toLowerCase()
        return hay.includes(kw)
      })
      reactions = reactions.filter(r => {
        const hay = [r.note || '', ...(r.suspectedFoods || [])].join('|').toLowerCase()
        return hay.includes(kw)
      })
    }

    const timeline = buildTimeline(logs, reactions)

    // 按日期分组
    const groupMap: Record<string, TimelineEvent[]> = {}
    for (const ev of timeline) {
      if (!groupMap[ev.date]) groupMap[ev.date] = []
      groupMap[ev.date].push(ev)
    }

    const days = Object.keys(groupMap)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({
        date,
        dateLabel: this.shortDate(date),
        weekday: getWeekday(date),
        events: groupMap[date].map(ev => this.enrichEvent(ev, firstSeen, profile))
      }))

    this.setData({
      summary: {
        ...summary,
        loveDeltaText: formatDelta(summary.loveDelta),
        newFoodDeltaText: formatDelta(summary.newFoodDelta),
        reactionDeltaText: formatDelta(summary.reactionDelta)
      },
      days
    })
  },

  enrichEvent(ev: TimelineEvent, firstSeen: Map<string, string>, profile: BabyProfile | null) {
    if (ev.type === 'meal') {
      const log = ev.payload as MealLog
      const ingsList = log.ingredients || []
      // 避免和下方 ingEmojis 行重复: isCustom 无 dish-name 时不再 join 食材当菜名,
      // 改用"自配餐"占位, 让食材只在 emoji 行展示一次
      let displayName = ''
      let ingredientsLabel = ''
      if (log.customDishName) {
        displayName = log.customDishName
      } else if (log.isCustom) {
        displayName = '自配餐'
      } else {
        displayName = log.recipeName
      }
      // 食材 emoji 行(去掉重复)
      const seen = new Set<string>()
      const ingEmojis: { name: string; emoji: string; isNew: boolean }[] = []
      for (const ing of ingsList) {
        if (seen.has(ing)) continue
        seen.add(ing)
        ingEmojis.push({
          name: ing,
          emoji: getIngredientEmoji(ing),
          isNew: isFoodNew(ing, log, firstSeen, profile)
        })
      }
      const hasNewFood = ingEmojis.some(i => i.isNew)
      return {
        type: 'meal',
        date: ev.date,
        timeLabel: ev.timeLabel,
        log,
        mealIndex: log.mealIndex,
        displayName,
        ingredientsLabel,
        ingEmojis,
        hasNewFood,
        portionEmoji: log.portion ? PORTION_EMOJI[log.portion] : '',
        portionLabel: log.portion ? PORTION_LABEL[log.portion] : '',
        prefEmoji: log.preference ? PREFERENCE_EMOJI[log.preference] : '',
        prefLabel: log.preference ? PREFERENCE_LABEL[log.preference] : '',
        note: log.note || ''
      }
    } else {
      const r = ev.payload as ReactionLog
      return {
        type: 'reaction',
        date: ev.date,
        timeLabel: ev.timeLabel,
        reaction: r,
        typeLabel: `${REACTION_TYPE_EMOJI[r.type]} ${REACTION_TYPE_LABEL[r.type]}`,
        severityLabel: SEVERITY_LABEL[r.severity],
        note: r.note || '',
        suspectedFoods: r.suspectedFoods || [],
        resolved: !!r.resolvedAt
      }
    }
  },

  shortDate(s: string) {
    const p = s.split('-')
    return `${p[1]}/${p[2]}`
  },

  // 时间 picker change: 修改 log.eatenAt
  onLogTimeChange(e: any) {
    const date = e.currentTarget.dataset.date as string
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const hhmm = e.detail.value as string
    const all = getJournal()
    const log = all.find(l => l.date === date && l.mealIndex === idx)
    if (!log) return
    log.eatenAt = combineTime(date, hhmm)
    logMeal(log)
    wx.showToast({ title: '已更新时间', icon: 'success', duration: 800 })
    this.refresh()
  },

  openLogMenu(e: any) {
    const date = e.currentTarget.dataset.date as string
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const that = this
    wx.showActionSheet({
      itemList: ['修改记录', '删除记录'],
      success: (res) => {
        if (res.tapIndex === 0) that.openManualSheetForEdit(date, idx)
        if (res.tapIndex === 1) that.confirmDeleteLog(date, idx)
      }
    })
  },

  confirmDeleteLog(date: string, idx: number) {
    const that = this
    // 删的这条 log 含正在排敏的食材? 如果是 + 这天没其他 log 含 trying → 沉默扣排敏天
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    const tryingFood = profile
      ? Object.values(profile.categoryAllergies).find(c => c.state === 'trying')?.tryingFood || null
      : null
    const log = getJournal().find(l => l.date === date && l.mealIndex === idx)
    const thisLogHasTrying = !!(tryingFood && log && (log.ingredients || []).includes(tryingFood))
    const otherLogsHaveTrying = tryingFood
      ? getJournal().some(l => l.date === date && l.mealIndex !== idx && (l.ingredients || []).includes(tryingFood))
      : false
    const willLoseTryingDay = thisLogHasTrying && !otherLogsHaveTrying

    const baseContent = willLoseTryingDay
      ? `这条记录里有正在排敏的「${tryingFood}」,这天没有其他餐含它。删除后这一天将不计入排敏天,观察期或被延长。`
      : '会从饮食日记里移除这一餐，无法撤销。'

    wx.showModal({
      title: willLoseTryingDay ? '删除会影响排敏进度' : '删除记录？',
      content: baseContent,
      confirmText: '删除',
      confirmColor: '#E57373',
      cancelText: '保留',
      success: (res) => {
        if (!res.confirm) return
        unlogMeal(date, idx)
        wx.showToast({ title: willLoseTryingDay ? '已删除,排敏天 -1' : '已删除', icon: 'none', duration: 1200 })
        that.refresh()
      }
    })
  },

  // 反应卡: 标记消退/撤销/删除
  openReactionMenu(e: any) {
    const id = e.currentTarget.dataset.id as string
    const that = this
    const reactions = getReactions()
    const r = reactions.find(x => x.id === id)
    if (!r) return
    const items: string[] = []
    if (r.resolvedAt) items.push('撤销消退')
    else items.push('标记已消退')
    items.push('删除反应')
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const choice = items[res.tapIndex]
        if (choice === '标记已消退') {
          updateReaction(id, { resolvedAt: new Date().toISOString() })
          wx.showToast({ title: '已标记消退', icon: 'success' })
          that.refresh()
        } else if (choice === '撤销消退') {
          updateReaction(id, { resolvedAt: undefined })
          wx.showToast({ title: '已撤销', icon: 'success' })
          that.refresh()
        } else if (choice === '删除反应') {
          wx.showModal({
            title: '删除反应？',
            content: '将从反应日志中移除，无法撤销。',
            confirmText: '删除',
            confirmColor: '#E57373',
            success: (cr) => {
              if (cr.confirm) {
                removeReaction(id)
                wx.showToast({ title: '已删除', icon: 'none' })
                that.refresh()
              }
            }
          })
        }
      }
    })
  },

  // 搜索
  openSearch() {
    this.setData({ searchOpen: true })
  },
  closeSearch() {
    // 只关 sheet, 不清 keyword (清除走 clearSearch)
    this.setData({ searchOpen: false })
  },
  onSearchInput(e: any) {
    this.setData({ searchKeyword: e.detail.value })
  },
  doSearch() {
    this.refresh()
    this.setData({ searchOpen: false })
  },
  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.refresh()
  },

  // FAB
  toggleFabMenu() {
    this.setData({ fabMenuOpen: !this.data.fabMenuOpen })
  },
  fabAddMeal() {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    this.setData({
      fabMenuOpen: false,
      manualOpen: true,
      manualIsEditing: false,
      manualEditDate: '',
      manualEditMealIndex: -1,
      manualDate: today,
      todayStr: today,
      manualTime: `${hh}:${mm}`,
      manualDishName: '',
      manualIngredientsText: '',
      manualIngChips: [],
      manualIngInput: '',
      manualIngSuggestions: this.computeIngSuggestions([]),
      manualPortion: '',
      manualNote: ''
    })
  },

  // 编辑某条已有 log: 用 manual sheet 预填数据
  openManualSheetForEdit(date: string, idx: number) {
    const log = getJournal().find(l => l.date === date && l.mealIndex === idx)
    if (!log) return
    const t = new Date(getMealTime(log))
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const chips = (log.ingredients || []).filter(Boolean)
    // 历史 small 数据归并到 taste(UI 上「尝几口」只剩这一档)
    const portion = (log.portion === 'small' ? 'taste' : log.portion) || ''
    this.setData({
      manualOpen: true,
      manualIsEditing: true,
      manualEditDate: date,
      manualEditMealIndex: idx,
      manualDate: date,
      todayStr: today,
      manualTime: `${hh}:${mm}`,
      manualDishName: log.customDishName || (log.recipeId?.startsWith('manual-') ? log.recipeName : ''),
      manualIngredientsText: chips.join('、'),
      manualIngChips: chips,
      manualIngInput: '',
      manualIngSuggestions: this.computeIngSuggestions(chips),
      manualPortion: portion as any,
      manualNote: log.note || ''
    })
  },

  closeManualSheet() {
    this.setData({ manualOpen: false, manualIsEditing: false })
  },
  onManualDateChange(e: any) {
    this.setData({ manualDate: e.detail.value })
  },
  onManualTimeChange(e: any) {
    this.setData({ manualTime: e.detail.value })
  },
  onManualDishInput(e: any) {
    this.setData({ manualDishName: e.detail.value })
  },
  onManualIngsInput(e: any) {
    this.setData({ manualIngInput: e.detail.value })
  },

  // 食材输入框 confirm (键盘上的"完成") = 把输入加进 chips
  onManualIngsConfirm() {
    this.addIngChipFromInput()
  },

  // 「+」按钮 / confirm 触发: 把输入框文本作为 chip 加入(支持顿号/逗号/空格批量)
  addIngChipFromInput() {
    const raw = (this.data.manualIngInput || '').trim()
    if (!raw) return
    const parts = raw.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean)
    const merged = [...this.data.manualIngChips]
    for (const p of parts) {
      if (!merged.includes(p)) merged.push(p)
    }
    this.setData({
      manualIngChips: merged,
      manualIngInput: '',
      manualIngSuggestions: this.computeIngSuggestions(merged)
    })
  },

  removeIngChip(e: any) {
    const name = e.currentTarget.dataset.name as string
    const merged = this.data.manualIngChips.filter(c => c !== name)
    this.setData({
      manualIngChips: merged,
      manualIngSuggestions: this.computeIngSuggestions(merged)
    })
  },

  pickIngSuggestion(e: any) {
    const name = e.currentTarget.dataset.name as string
    if (this.data.manualIngChips.includes(name)) return
    const merged = [...this.data.manualIngChips, name]
    this.setData({
      manualIngChips: merged,
      manualIngSuggestions: this.computeIngSuggestions(merged)
    })
  },
  setManualPortion(e: any) {
    this.setData({ manualPortion: e.currentTarget.dataset.portion as any })
  },
  onManualNoteInput(e: any) {
    this.setData({ manualNote: e.detail.value })
  },

  saveManualLog() {
    const dish = (this.data.manualDishName || '').trim()
    // 如果输入框还有未"+"的残留, 兜底自动收进 chips
    const pending = (this.data.manualIngInput || '').trim()
    let ingredients = [...this.data.manualIngChips]
    if (pending) {
      const parts = pending.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean)
      for (const p of parts) {
        if (!ingredients.includes(p)) ingredients.push(p)
      }
    }
    if (!dish && ingredients.length === 0) {
      wx.showToast({ title: '至少填菜名或一个食材', icon: 'none' })
      return
    }
    const portion = this.data.manualPortion || undefined
    const note = (this.data.manualNote || '').trim() || undefined
    const date = this.data.manualDate
    const time = this.data.manualTime || '12:00'
    const isEditing = this.data.manualIsEditing

    // 编辑: 用预存的原始 (editDate, editMealIndex) 定位; 新建: 按当天已有 logs 找最小未占用 mealIndex
    let idx: number
    if (isEditing) {
      idx = this.data.manualEditMealIndex
    } else {
      const usedIdx = new Set(getJournal().filter(l => l.date === date).map(l => l.mealIndex))
      let candidate = 0
      while (usedIdx.has(candidate)) candidate += 1
      idx = candidate
    }
    const existing = getJournal().find(l => l.date === date && l.mealIndex === idx)

    // 份量推断 preference (与首页 actualSheet 一致):
    //   taste/small = 尝几口就不吃 → dislike; full = 吃完整份 → love; half = 中性不写
    // 编辑场景: 推断不出来时保留原 preference (避免抹掉用户手动设置)
    const inferredPref: Preference | undefined =
      (portion === 'taste' || portion === 'small') ? 'dislike' :
      portion === 'full' ? 'love' :
      undefined
    const finalPref = inferredPref !== undefined ? inferredPref : existing?.preference

    const that = this
    const finalIngredients = ingredients.length > 0 ? ingredients : [dish]
    const doSave = () => {
      // 写入前快照排敏进度, 用于对比是否因这次补记产生变化
      const profileBefore: BabyProfile | null = wx.getStorageSync('babyProfile')
      const progressBefore = profileBefore ? getTryingProgress(profileBefore) : null

      logMeal({
        date,
        mealIndex: idx,
        recipeId: existing?.recipeId || `manual-${Date.now()}`,
        recipeName: existing?.recipeName || dish || ingredients.join('、'),
        ingredients: finalIngredients,
        loggedAt: existing?.loggedAt || new Date().toISOString(),
        eatenAt: combineTime(date, time),
        ...(dish ? { customDishName: dish } : {}),
        ...(portion ? { portion } : {}),
        ...(finalPref ? { preference: finalPref } : {}),
        ...(note ? { note } : {}),
        isCustom: true
      })

      // 写入后立刻自愈 + 重算, 这样 toast/modal 用的就是最新进度
      const profileAfter: BabyProfile | null = wx.getStorageSync('babyProfile')
      let progressNote = ''
      if (profileAfter) {
        if (reconcileTryingReplaced(profileAfter)) {
          wx.setStorageSync('babyProfile', profileAfter)
        }
        const progressAfter = getTryingProgress(profileAfter)
        if (progressAfter && progressBefore && progressAfter.food === progressBefore.food) {
          const dayDelta = progressAfter.dayIndex - progressBefore.dayIndex
          const reqDelta = progressBefore.daysRequired - progressAfter.daysRequired
          if (dayDelta > 0 || reqDelta > 0) {
            progressNote = `· 第 ${progressAfter.dayIndex}/${progressAfter.daysRequired} 天`
          }
        }
      }

      that.setData({ manualOpen: false, manualIsEditing: false })
      that.refresh()

      // 新食材检测: 只在当前没在排敏时弹 modal 询问启动 (避免跟现有排敏冲突)
      const newFoods = profileAfter && !getCurrentTryingCategoryId(profileAfter)
        ? detectNewFoodsForTrying(profileAfter, finalIngredients)
        : []

      if (newFoods.length > 0) {
        const food = newFoods[0]
        const cat = getCategoryByFood(food)!
        const rest = newFoods.slice(1)
        const restNote = rest.length > 0 ? `\n\n还有新食材: ${rest.join('、')}, 一次只能排敏一个, 下次再启动。` : ''
        wx.showModal({
          title: `新食材: ${food}`,
          content: `要现在开始 ${food}（${cat.name}）3 天排敏吗?\n接下来吃含 ${food} 的菜, 3 天没反应就加入安全清单。${restNote}`,
          confirmText: '开始排敏',
          cancelText: '先不',
          success: (res) => {
            if (!res.confirm) return
            const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
            if (!profile) return
            const today = formatDate(new Date())
            const journal: any[] = wx.getStorageSync('mealJournal') || []
            const loggedIdxToday = new Set(journal.filter(l => l.date === today).map(l => l.mealIndex))
            const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
            const todayPlan = plan.find(p => p.date === today)
            const hasUnloggedToday = !!todayPlan && todayPlan.meals.some(m => !loggedIdxToday.has(m.mealIndex))
            const result = startTryingForFood(profile, cat.id, food, hasUnloggedToday)
            if (!result) return
            wx.setStorageSync('babyProfile', result.profile)
            syncPlan(result.profile)
            wx.showToast({
              title: hasUnloggedToday ? `${food} 排敏已启动` : `${food} 排敏 明日开始`,
              icon: 'success',
              duration: 1800
            })
            that.refresh()
          }
        })
      } else {
        wx.showToast({
          title: `${isEditing ? '已更新' : '已补记'} ${progressNote}`.trim(),
          icon: progressNote ? 'none' : 'success',
          duration: progressNote ? 1800 : 800
        })
      }
    }
    doSave()
  },
  fabAddReaction() {
    this.setData({ fabMenuOpen: false })
    wx.navigateTo({ url: '/pages/reaction-new/reaction-new' })
  },

  // 导出
  exportRecords() {
    wx.showActionSheet({
      itemList: ['导出饮食日记', '导出反应日志', '导出全部'],
      success: (res) => {
        const scope = (['journal', 'reaction', 'all'] as const)[res.tapIndex]
        const text = this.buildExportText(scope)
        if (!text.trim()) {
          wx.showToast({ title: '暂无记录可导出', icon: 'none' })
          return
        }
        wx.setClipboardData({
          data: text,
          success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 1400 })
        })
      }
    })
  },

  buildExportText(scope: 'journal' | 'reaction' | 'all'): string {
    const today = new Date()
    const head = `辅食搭子 · 喂养记录 · 导出于 ${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}\n`
    const parts: string[] = [head]
    const allLogs = getJournal().sort((a, b) => b.date.localeCompare(a.date) || a.mealIndex - b.mealIndex)
    const allReactions = getReactions().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

    if (scope === 'journal' || scope === 'all') {
      parts.push('\n========== 饮食日记 ==========\n')
      if (allLogs.length === 0) {
        parts.push('(无记录)\n')
      } else {
        const groupMap: Record<string, MealLog[]> = {}
        for (const log of allLogs) {
          if (!groupMap[log.date]) groupMap[log.date] = []
          groupMap[log.date].push(log)
        }
        for (const date of Object.keys(groupMap).sort((a, b) => b.localeCompare(a))) {
          parts.push(`\n${this.shortDate(date)} 周${getWeekday(date)}`)
          for (const log of groupMap[date]) {
            const customTag = log.isCustom ? ' [实际]' : ''
            const pref = log.preference ? ` · ${PREFERENCE_EMOJI[log.preference]} ${PREFERENCE_LABEL[log.preference]}` : ''
            const portion = log.portion ? ` · ${PORTION_EMOJI[log.portion]} ${PORTION_LABEL[log.portion]}` : ''
            const dish = log.customDishName || log.recipeName
            const ings = (log.ingredients || []).join('、')
            parts.push(`  第${log.mealIndex + 1}餐 ${dish}${customTag}${pref}${portion}` + (ings ? `\n    食材: ${ings}` : ''))
            if (log.isCustom && log.customDishName) parts.push(`    计划: ${log.recipeName}`)
            if (log.note) parts.push(`    备注: ${log.note}`)
          }
          parts.push('')
        }
      }
    }

    if (scope === 'reaction' || scope === 'all') {
      parts.push('\n========== 反应日志 ==========\n')
      if (allReactions.length === 0) {
        parts.push('(无记录)\n')
      } else {
        for (const r of allReactions) {
          const t = new Date(r.occurredAt)
          const dateTime = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
          parts.push(`\n${dateTime} · ${REACTION_TYPE_EMOJI[r.type]} ${REACTION_TYPE_LABEL[r.type]} · ${SEVERITY_LABEL[r.severity]}`)
          if (r.note) parts.push(`  备注: ${r.note}`)
          if (r.suspectedFoods && r.suspectedFoods.length > 0) parts.push(`  可疑食材: ${r.suspectedFoods.join('、')}`)
          parts.push(r.resolvedAt ? `  状态: 已消退` : `  状态: 未消退`)
        }
      }
    }

    parts.push('\n----\n本记录由「辅食搭子」生成,仅供参考。')
    return parts.join('\n')
  }
})
