import { CATEGORIES, getAllMembers, getPrimaryMembers } from '../../data/categories'
import { BabyProfile, regenerateKeepingLoggedToday, DailyPlan, startTryingForFood, getCurrentTryingCategoryId, TRYING_DAYS_INCATEGORY, TRYING_DAYS_REQUIRED, formatDate, getApplicableRecipes } from '../../utils/planner'
import { addCustomFood, getCustomFoods, removeCustomFood } from '../../utils/customFoods'

function syncPlan(profile: BabyProfile) {
  const existingPlan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
  if (existingPlan.length > 0) {
    const newPlan = regenerateKeepingLoggedToday(profile, existingPlan)
    wx.setStorageSync('weeklyPlan', newPlan)
  }
}

const STATE_LABEL: Record<string, string> = {
  open: '已开放',
  trying: '排敏中',
  observation: '观察期',
  untried: '未引入',
  locked: '暂锁定'
}

const EXCEPTION_LABEL: Record<string, string> = {
  following: '跟随品类',
  allergic: '过敏',
  observation: '观察期',
  introducing: '引入观察'
}

Page({
  data: {
    categoryList: [] as any[],
    expandedIds: [] as string[],
    addingCatId: '',
    customInputValue: ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return

    const expandedIds = this.data.expandedIds
    const customSet = new Set(getCustomFoods().map(f => f.name))
    const confirmedSet = new Set(profile.confirmedFoods || [])

    // 全局是否已有正在排敏的食材（用于禁用 profile 页其他"排敏"按钮）
    const currentTryingCatId = getCurrentTryingCategoryId(profile)
    const currentTryingFood = currentTryingCatId
      ? profile.categoryAllergies[currentTryingCatId]?.tryingFood
      : null

    const catList = CATEGORIES.filter(cat => !cat.noAllergyTracking).map(cat => {
      const a = profile.categoryAllergies[cat.id] || { state: 'untried' }
      // 排敏管理只列 primary：同源变体跟随主食材，不需要（也不应该）单独排敏
      const allMembers = getPrimaryMembers(cat.id)
      const memberStates = allMembers.map(name => {
        const ex = profile.individualExceptions[name]
        const exState = ex?.state || 'following'
        const isCurrentlyTrying = currentTryingFood === name
        // 显示"排敏"按钮的条件：未确认 + 跟随品类 + 自己不在排 + 当前没有别的排敏
        const canStartTrying = !confirmedSet.has(name)
          && exState === 'following'
          && !isCurrentlyTrying
          && !currentTryingFood
          && a.state !== 'locked'
        const tryingDays = a.state === 'open' ? TRYING_DAYS_INCATEGORY : TRYING_DAYS_REQUIRED
        return {
          name,
          exceptionState: exState,
          exceptionLabel: EXCEPTION_LABEL[exState],
          isCustom: customSet.has(name),
          isConfirmed: confirmedSet.has(name),
          isCurrentlyTrying,
          canStartTrying,
          tryingDays
        }
      })
      const exceptionCount = memberStates.filter(m => m.exceptionState !== 'following').length
      const confirmedCount = memberStates.filter(m => m.isConfirmed).length

      return {
        id: cat.id,
        name: cat.name,
        commonAllergen: !!cat.commonAllergen,
        recommendedMonth: cat.recommendedMonth,
        representative: a.representative,
        note: a.note,
        state: a.state,
        stateLabel: STATE_LABEL[a.state] || '未引入',
        members: memberStates,
        expanded: expandedIds.includes(cat.id),
        exceptionCount,
        confirmedCount
      }
    })

    this.setData({ categoryList: catList })
  },

  toggleConfirmed(e: any) {
    const name = e.currentTarget.dataset.name
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    if (!profile.confirmedFoods) profile.confirmedFoods = []
    const isConfirmed = profile.confirmedFoods.includes(name)

    if (isConfirmed) {
      wx.showModal({
        title: '取消已确认',
        content: `${name} 将变回"跟随品类",疫苗后会被排除`,
        success: (res) => {
          if (!res.confirm) return
          profile.confirmedFoods = profile.confirmedFoods!.filter(f => f !== name)
          wx.setStorageSync('babyProfile', profile)
          syncPlan(profile)
          this.refresh()
        }
      })
      return
    }

    const ex = profile.individualExceptions[name]
    if (ex?.state === 'introducing') {
      wx.showToast({ title: `${name} 引入观察中,${ex.nextRetryDate} 后自动确认`, icon: 'none', duration: 2200 })
      return
    }

    // 每一种新食物都独立观察至少 3 天；分类状态不缩短观察期。
    const days = TRYING_DAYS_REQUIRED
    const tryingLabel = `开始排敏 (${days} 天观察)`

    wx.showActionSheet({
      itemList: ['吃过,直接确认安全', tryingLabel],
      success: (res) => {
        if (res.tapIndex === 0) {
          profile.confirmedFoods!.push(name)
          wx.setStorageSync('babyProfile', profile)
          syncPlan(profile)
          wx.showToast({ title: `${name} 已确认`, icon: 'success', duration: 800 })
          this.refresh()
        } else if (res.tapIndex === 1) {
          this.doStartTrying(name)
        }
      }
    })
  },

  // 主动排敏入口（统一走 startTryingForFood）
  startTryingMember(e: any) {
    const name = e.currentTarget.dataset.name as string
    this.doStartTrying(name)
  },

  doStartTrying(name: string) {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const currentTrying = getCurrentTryingCategoryId(profile)
    if (currentTrying) {
      const tryingFood = profile.categoryAllergies[currentTrying]?.tryingFood
      wx.showToast({ title: `先完成 ${tryingFood} 排敏再引入新食物`, icon: 'none', duration: 1800 })
      return
    }
    const cat = CATEGORIES.find(c => c.members.includes(name))
    if (!cat) {
      wx.showToast({ title: '该食材未在分类库', icon: 'none' })
      return
    }
    // 检查今日是否还有未喂餐（决定 startDate 是今日还是明日）
    const today = formatDate(new Date())
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const loggedIdx = new Set(journal.filter(l => l.date === today).map(l => l.mealIndex))
    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const todayPlan = plan.find(p => p.date === today)
    const hasUnloggedToday = !!todayPlan && todayPlan.meals.some(m => !loggedIdx.has(m.mealIndex))

    const result = startTryingForFood(profile, cat.id, name, hasUnloggedToday)
    if (!result) return
    wx.setStorageSync('babyProfile', result.profile)
    syncPlan(result.profile)
    this.refresh()

    // 启动后检查目标日菜单是否真含 trying food，给明确反馈
    const newPlan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const targetDate = hasUnloggedToday ? today : formatDate(new Date(Date.now() + 86400000))
    const targetPlan = newPlan.find(p => p.date === targetDate)
    const targetCount = targetPlan ? targetPlan.meals.filter(m => m.recipe.ingredients.some(i => i.name === name)).length : 0
    const recipesWithTrying = getApplicableRecipes(result.profile).filter(r => r.ingredients.some(i => i.name === name)).length
    const dayWord = hasUnloggedToday ? '今日' : '明日'

    if (targetCount > 0) {
      wx.showModal({
        title: `${name} 排敏${hasUnloggedToday ? '已启动' : '，明日开始'}`,
        content: `${dayWord}有 ${targetCount} 餐含 ${name}，喂完后观察 ${result.daysRequired} 天没反应就加入安全清单。`,
        showCancel: false,
        confirmText: hasUnloggedToday ? '看看菜单' : '知道了',
        success: (res) => {
          if (res.confirm && hasUnloggedToday) {
            wx.switchTab({ url: '/pages/index/index' })
          }
        }
      })
    } else if (recipesWithTrying === 0) {
      wx.showModal({
        title: `${name} 排敏已启动，但...`,
        content: `当前安全清单凑不出含 ${name} 的食谱。去食谱库手动加一道，或先开放更多基础品类。`,
        confirmText: '去食谱库',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/recipes/recipes' })
        }
      })
    } else {
      // 有适用食谱但菜单没塞中（generateWeeklyPlan 概率没命中 / 兜底逻辑问题）
      wx.showToast({
        title: `${name} 排敏 ${hasUnloggedToday ? '今天' : '明天'}开始 (${result.daysRequired}天观察)`,
        icon: 'success',
        duration: 1800
      })
    }
  },

  toggleCategory(e: any) {
    const id = e.currentTarget.dataset.id
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    if (!profile.categoryAllergies[id]) profile.categoryAllergies[id] = { state: 'untried' }
    const cur = profile.categoryAllergies[id].state
    if (cur === 'trying') {
      wx.showToast({ title: '排敏中，去首页停止排敏后再切换', icon: 'none', duration: 1800 })
      return
    }
    const cycle: Record<string, string> = {
      untried: 'open',
      open: 'observation',
      observation: 'locked',
      locked: 'untried'
    }
    const next = cycle[cur] || 'untried'

    // 切到 open 时拦截: 单切品类状态不会让食材进 confirmedFoods, 菜单不会变
    // 必须让用户明确选: 全部稳定 (批量加 confirmedFoods) / 自己逐个选
    if (next === 'open') {
      const cat = CATEGORIES.find(c => c.id === id)
      const catName = cat?.name || '该品类'
      // 批量加入只针对 primary，跟品类展开列表口径一致；variant 由 planner 的主食材放行逻辑覆盖
      const members = getPrimaryMembers(id)
      const alreadyConfirmed = new Set(profile.confirmedFoods || [])
      const toAdd = members.filter(m => !alreadyConfirmed.has(m))
      const that = this
      wx.showActionSheet({
        itemList: [
          `✅ ${catName} 下 ${toAdd.length || members.length} 种食材都稳定吃过 (批量加入)`,
          '🌱 我来逐个选 (只切状态,自动展开)'
        ],
        success: (res) => {
          profile.categoryAllergies[id].state = 'open'
          if (!profile.categoryAllergies[id].passedDate) {
            profile.categoryAllergies[id].passedDate = new Date().toISOString().slice(0, 10)
          }
          if (res.tapIndex === 0) {
            // 全部加入 confirmedFoods + 设个 representative
            if (!profile.confirmedFoods) profile.confirmedFoods = []
            for (const m of members) {
              if (!profile.confirmedFoods.includes(m)) profile.confirmedFoods.push(m)
            }
            if (!profile.categoryAllergies[id].representative && members.length > 0) {
              profile.categoryAllergies[id].representative = members[0]
            }
            wx.setStorageSync('babyProfile', profile)
            syncPlan(profile)
            that.refresh()
            wx.showToast({ title: `已加入 ${toAdd.length} 种食材`, icon: 'success', duration: 1200 })
          } else if (res.tapIndex === 1) {
            // 只切状态, 不加 confirmedFoods, 自动展开品类让用户看到食材列表
            wx.setStorageSync('babyProfile', profile)
            syncPlan(profile)
            const expanded = that.data.expandedIds.includes(id)
              ? that.data.expandedIds
              : [...that.data.expandedIds, id]
            that.setData({ expandedIds: expanded })
            that.refresh()
            wx.showToast({ title: '展开后逐个点食材右侧确认', icon: 'none', duration: 2200 })
          }
        },
        fail: () => {
          // 用户取消 actionSheet, 不切换
        }
      })
      return
    }

    profile.categoryAllergies[id].state = next
    // 切到 untried (完全重置) → 从 confirmedFoods 清掉该品类所有成员
    // 不然 isFoodSafeForBaby (planner:127) 会因为 confirmedFoods 命中提前 return safe,
    // 即使品类状态显示"未引入", 菜单依然会安排这些食材
    if (next === 'untried' && profile.confirmedFoods) {
      const cat = CATEGORIES.find(c => c.id === id)
      if (cat) {
        // 清理用全量（含 variant）：历史 confirmedFoods 里可能残留鸡肝/排骨，漏清会让 planner 提前放行
        const members = new Set(getAllMembers(id))
        profile.confirmedFoods = profile.confirmedFoods.filter(f => !members.has(f))
        // representative 也清掉, 避免 planner:125 兜底放行
        delete profile.categoryAllergies[id].representative
      }
    }
    wx.setStorageSync('babyProfile', profile)
    syncPlan(profile)
    this.refresh()
  },

  toggleExpand(e: any) {
    const id = e.currentTarget.dataset.id
    const expanded = this.data.expandedIds.includes(id)
    const next = expanded
      ? this.data.expandedIds.filter(x => x !== id)
      : [...this.data.expandedIds, id]
    this.setData({ expandedIds: next })
    this.refresh()
  },

  toggleException(e: any) {
    const name = e.currentTarget.dataset.name
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    const cur = profile.individualExceptions[name]?.state || 'following'
    const cycle: Record<string, string> = {
      following: 'observation',
      observation: 'allergic',
      allergic: 'following'
    }
    const next = cycle[cur]
    if (next === 'following') {
      delete profile.individualExceptions[name]
    } else {
      profile.individualExceptions[name] = { state: next as any }
    }
    wx.setStorageSync('babyProfile', profile)
    syncPlan(profile)
    this.refresh()
  },

  startAddCustom(e: any) {
    const catId = e.currentTarget.dataset.catId
    this.setData({ addingCatId: catId, customInputValue: '' })
  },

  onCustomInput(e: any) {
    this.setData({ customInputValue: e.detail.value })
  },

  cancelCustomFood() {
    this.setData({ addingCatId: '', customInputValue: '' })
  },

  confirmDeleteCustom(e: any) {
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '删除自定义食材',
      content: `确认删除"${name}"?`,
      success: (res) => {
        if (!res.confirm) return
        removeCustomFood(name)
        const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
        if (profile && profile.individualExceptions[name]) {
          delete profile.individualExceptions[name]
          wx.setStorageSync('babyProfile', profile)
        }
        wx.showToast({ title: '已删除', icon: 'success', duration: 700 })
        this.refresh()
      }
    })
  },

  confirmReset() {
    wx.showModal({
      title: '重置宝宝档案?',
      content: '会清空档案、计划、冰箱、日记和反应记录,无法恢复。',
      confirmText: '重置',
      confirmColor: '#E57373',
      success: (res) => {
        if (!res.confirm) return
        wx.removeStorageSync('babyProfile')
        wx.removeStorageSync('weeklyPlan')
        wx.removeStorageSync('fridge')
        wx.removeStorageSync('mealJournal')
        wx.removeStorageSync('reactions')
        wx.removeStorageSync('customFoods')
        wx.removeStorageSync('setupDone')
        wx.removeStorageSync('onboardingDone')
        wx.removeStorageSync('fridgeOnboardDismissed')
        wx.reLaunch({ url: '/pages/welcome/welcome' })
      }
    })
  },

  confirmCustomFood() {
    const name = (this.data.customInputValue || '').trim()
    const catId = this.data.addingCatId
    if (!name || !catId) {
      this.cancelCustomFood()
      return
    }
    const ok = addCustomFood({
      name,
      categoryId: catId,
      defaultStorage: 'refrigerated',
      shelfLifeDays: { refrigerated: 30 },
      servingGramsPerPortion: 10
    })
    if (ok) {
      wx.showToast({ title: `已添加 ${name}`, icon: 'success', duration: 800 })
      this.setData({ addingCatId: '', customInputValue: '' })
      this.refresh()
    } else {
      wx.showToast({ title: '已存在同名食材', icon: 'none' })
    }
  }
})
