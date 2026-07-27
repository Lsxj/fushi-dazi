import { ReactionType, ReactionSeverity, REACTION_TYPE_LABEL, REACTION_TYPE_EMOJI, addReaction, updateReaction, getReactions, traceback72h, isSeverDirectAllergic, ReactionLog } from '../../utils/reactions'
import { analyzeSuspects, enterObservation, markAllergic, SuspectFood } from '../../utils/observation'
import { BabyProfile, getWeekday } from '../../utils/planner'
import { getIngredientEmoji } from '../../utils/reviewStats'

const TYPE_OPTIONS = (Object.keys(REACTION_TYPE_LABEL) as ReactionType[]).map(v => ({
  value: v,
  label: REACTION_TYPE_LABEL[v],
  emoji: REACTION_TYPE_EMOJI[v]
}))

const SEVERITY_OPTIONS = [
  { value: 'mild', label: '轻微' },
  { value: 'moderate', label: '中度' },
  { value: 'severe', label: '严重' }
]

const TIME_OPTIONS = [
  { value: 'now', label: '刚刚' },
  { value: 'today_morning', label: '今天上午' },
  { value: 'today_afternoon', label: '今天下午' },
  { value: 'today_evening', label: '今天晚上' },
  { value: 'yesterday', label: '昨天' },
  { value: 'custom', label: '自定义' }
]

interface SuspectVM extends SuspectFood {
  levelLabel: string
  emoji: string
  // 用户对这条可疑食材选的动作: '' (未选) / 'observe' (7 天) / 'pause3' (3 天)
  action: '' | 'observe' | 'pause3'
}

const LEVEL_LABEL: Record<string, string> = { high: '高度可疑', medium: '中等', low: '可能性低' }

Page({
  data: {
    editingId: '' as string,  // ?id=xxx 进入编辑模式时存 reaction id
    isEditing: false,

    typeOptions: TYPE_OPTIONS,
    selectedTypes: {} as Record<string, boolean>,
    severityOptions: SEVERITY_OPTIONS,
    severity: 'mild',
    timeOptions: TIME_OPTIONS,
    timeChoice: 'now',
    customTimeRange: [] as any[],
    customTimeIndex: [0, 0, 0],
    customTimeLabel: '',
    note: '',
    noteLength: 0,
    traceback: [] as any[],
    suspects: [] as SuspectVM[],
    willDirectAllergic: false
  },

  onLoad(query: any) {
    this.buildCustomTimeRange()
    if (query && query.id) {
      this.loadForEdit(query.id)
    } else {
      this.refreshTraceback()
    }
  },

  // 编辑模式: 加载现有 reaction 预填
  loadForEdit(id: string) {
    const existing = getReactions().find(r => r.id === id)
    if (!existing) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    const selectedTypes: Record<string, boolean> = {}
    selectedTypes[existing.type] = true

    // 用 occurredAt 推时间选项,简化为「自定义」
    this.setData({
      editingId: id,
      isEditing: true,
      selectedTypes,
      severity: existing.severity,
      timeChoice: 'now',  // 编辑模式下若时间未变,提交时优先用原 occurredAt
      note: existing.note || '',
      noteLength: (existing.note || '').length
    })
    this.updateWillDirectAllergic()
    // 用现有 reaction 的时间刷 traceback,并把 suspectedFoods 预选
    const reactionTime = existing.occurredAt
    this.refreshTracebackWith(reactionTime, existing.suspectedFoods || [])
  },

  buildCustomTimeRange() {
    const days: string[] = []
    const today = new Date()
    for (let i = 0; i < 4; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      days.push(`${d.getMonth() + 1}/${d.getDate()} 周${getWeekday(d.toISOString().slice(0, 10))}`)
    }
    const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}时`)
    const minutes = ['00', '15', '30', '45']
    this.setData({ customTimeRange: [days, hours, minutes] })
  },

  toggleType(e: any) {
    const v = e.currentTarget.dataset.value
    const cur = { ...this.data.selectedTypes }
    cur[v] = !cur[v]
    this.setData({ selectedTypes: cur })
    this.updateWillDirectAllergic()
  },

  setSeverity(e: any) {
    this.setData({ severity: e.currentTarget.dataset.value })
    this.updateWillDirectAllergic()
    // severity 变了 willDirectAllergic 也变, suspect 默认动作要重算
    this.recomputeSuspectActions()
  },

  updateWillDirectAllergic() {
    const types = Object.keys(this.data.selectedTypes).filter(k => this.data.selectedTypes[k])
    const direct = types.some(t => isSeverDirectAllergic(this.data.severity as ReactionSeverity, t as ReactionType))
    this.setData({ willDirectAllergic: direct })
  },

  setTime(e: any) {
    const v = e.currentTarget.dataset.value
    this.setData({ timeChoice: v })
    if (v !== 'custom') this.refreshTraceback()
  },

  onCustomTime(e: any) {
    this.setData({ customTimeIndex: e.detail.value })
    const [d, h, m] = e.detail.value
    const days = this.data.customTimeRange[0]
    const hours = this.data.customTimeRange[1]
    const minutes = this.data.customTimeRange[2]
    this.setData({ customTimeLabel: `${days[d]} ${hours[h]}${minutes[m]}` })
    this.refreshTraceback()
  },

  onNoteInput(e: any) {
    const value = e.detail.value
    this.setData({ note: value, noteLength: value.length })
  },

  resolveReactionTime(): string {
    const now = new Date()
    if (this.data.timeChoice === 'now') return now.toISOString()
    if (this.data.timeChoice === 'today_morning') {
      now.setHours(9, 0, 0, 0)
      return now.toISOString()
    }
    if (this.data.timeChoice === 'today_afternoon') {
      now.setHours(14, 0, 0, 0)
      return now.toISOString()
    }
    if (this.data.timeChoice === 'today_evening') {
      now.setHours(20, 0, 0, 0)
      return now.toISOString()
    }
    if (this.data.timeChoice === 'yesterday') {
      now.setDate(now.getDate() - 1)
      now.setHours(20, 0, 0, 0)
      return now.toISOString()
    }
    if (this.data.timeChoice === 'custom') {
      const [d, h, m] = this.data.customTimeIndex
      const today = new Date()
      today.setDate(today.getDate() - d)
      today.setHours(h, parseInt(['00', '15', '30', '45'][m], 10), 0, 0)
      return today.toISOString()
    }
    return now.toISOString()
  },

  refreshTraceback() {
    const reactionTime = this.resolveReactionTime()
    this.refreshTracebackWith(reactionTime, [])
  },

  refreshTracebackWith(reactionTime: string, preselectFoods: string[]) {
    const meals = traceback72h(reactionTime)

    const traceback = meals.map(m => {
      // 显示按"实际吃的时间"(eatenAt) 优先, 跟 traceback72h 窗口判断口径一致
      const t = new Date(m.eatenAt || m.loggedAt)
      const dateStr = `${t.getMonth() + 1}/${t.getDate()}`
      const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      return {
        key: `${m.date}-${m.mealIndex}`,
        timeLabel: `${dateStr} ${timeStr}`,
        recipeName: m.recipeName,
        ingsText: m.ingredients.join(' + ')
      }
    })

    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    const allIngs: string[] = []
    for (const m of meals) {
      for (const ing of m.ingredients) {
        if (!allIngs.includes(ing)) allIngs.push(ing)
      }
    }
    const preselectSet = new Set(preselectFoods)
    const suspects: SuspectVM[] = analyzeSuspects(profile, allIngs, reactionTime).map(s => {
      const wasSelected = preselectSet.has(s.name)
      let action: '' | 'observe' | 'pause3' = ''
      if (wasSelected) {
        action = 'observe'
      } else if (s.level === 'high') {
        action = 'observe'  // 默认勾选 + 观察期 7 天
      }
      return {
        ...s,
        levelLabel: LEVEL_LABEL[s.level],
        emoji: getIngredientEmoji(s.name),
        action
      }
    })

    this.setData({ traceback, suspects })
  },

  // severity 变化时,如果是 severe,suspects 的默认动作不变 (依然 observe), 但提交时会走 markAllergic
  recomputeSuspectActions() {
    // 占位: 未来若 severity 影响默认推荐动作可在这里调整
  },

  setSuspectAction(e: any) {
    const name = e.currentTarget.dataset.name as string
    const action = e.currentTarget.dataset.action as 'observe' | 'pause3'
    const suspects = this.data.suspects.map(s => {
      if (s.name !== name) return s
      // 同一动作再点 = 取消
      return { ...s, action: s.action === action ? '' as const : action }
    })
    this.setData({ suspects })
  },

  submit() {
    const types = Object.keys(this.data.selectedTypes).filter(k => this.data.selectedTypes[k]) as ReactionType[]
    if (types.length === 0) {
      wx.showToast({ title: '请选择至少一个反应类型', icon: 'none' })
      return
    }

    const reactionTime = this.resolveReactionTime()
    const checkedSuspects = this.data.suspects.filter(s => s.action !== '')
    const checkedNames = checkedSuspects.map(s => s.name)

    let profile: BabyProfile = wx.getStorageSync('babyProfile')

    if (this.data.isEditing && this.data.editingId) {
      // 编辑模式: 只更新第一条 reaction (单条编辑场景), 不重新触发 observation/allergic 副作用
      const existing = getReactions().find(r => r.id === this.data.editingId)
      if (!existing) {
        wx.showToast({ title: '记录已被删除', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      updateReaction(this.data.editingId, {
        // 编辑时不改 occurredAt (避免回溯漂移); type 取第一项 (UI 上单选编辑)
        type: types[0],
        severity: this.data.severity as ReactionSeverity,
        note: this.data.note,
        suspectedFoods: checkedNames
      })
      wx.showToast({ title: '已更新', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    // 新建模式: 每个 type 一条 ReactionLog
    const reactions: ReactionLog[] = []
    for (const type of types) {
      const reactionId = `r-${Date.now()}-${type}`
      const log: ReactionLog = {
        id: reactionId,
        occurredAt: reactionTime,
        type,
        severity: this.data.severity as ReactionSeverity,
        note: this.data.note,
        tracebackMeals: this.data.traceback.map((t: any) => {
          const meal = traceback72h(reactionTime).find(m => `${m.date}-${m.mealIndex}` === t.key)
          return meal ? { date: meal.date, mealIndex: meal.mealIndex, recipeName: meal.recipeName, ingredients: meal.ingredients } : null
        }).filter(Boolean),
        suspectedFoods: checkedNames
      }
      reactions.push(log)
      addReaction(log)
    }

    const isSevere = types.some(t => isSeverDirectAllergic(this.data.severity as ReactionSeverity, t))
    const reactionId = reactions[0].id
    for (const s of checkedSuspects) {
      if (isSevere) {
        profile = markAllergic(profile, s.name, reactionId)
      } else if (s.action === 'pause3') {
        profile = enterObservation(profile, s.name, reactionId, undefined, 3)
      } else {
        profile = enterObservation(profile, s.name, reactionId)
      }
    }

    wx.setStorageSync('babyProfile', profile)
    wx.removeStorageSync('weeklyPlan')

    if (types.includes('gut')) {
      wx.showToast({ title: '已记录,菜单将自动避开海鲜/高纤维', icon: 'none', duration: 2200 })
    }

    const observeCount = checkedSuspects.filter(s => s.action === 'observe').length
    const pauseCount = checkedSuspects.filter(s => s.action === 'pause3').length
    let tip = '已记录反应'
    if (isSevere && checkedNames.length > 0) {
      tip = `已确诊 ${checkedNames.length} 个食物为过敏(永久排除)`
    } else if (observeCount + pauseCount > 0) {
      const parts: string[] = []
      if (observeCount > 0) parts.push(`${observeCount} 个加观察期(7 天)`)
      if (pauseCount > 0) parts.push(`${pauseCount} 个暂停 3 天`)
      tip = `已为 ${parts.join('、')}`
    }
    wx.showToast({ title: tip, icon: 'none', duration: 2000 })

    setTimeout(() => {
      wx.navigateBack()
    }, 2000)
  },

  cancel() {
    wx.navigateBack()
  }
})
