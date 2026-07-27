import { getReactions, removeReaction, updateReaction, REACTION_TYPE_LABEL, REACTION_TYPE_EMOJI, SEVERITY_LABEL } from '../../utils/reactions'
import { getWeekday } from '../../utils/planner'

interface ReactionVM {
  id: string
  timeOnly: string                // 14:32
  typesDisplay: string[]
  severity: string
  severityLabel: string
  note: string
  suspectedFoods: string[]
  tracebackCount: number
  resolved: boolean
  resolvedLabel: string
}

interface DayGroup {
  date: string
  dateLabel: string  // 5/14 周三
  events: ReactionVM[]
}

Page({
  data: {
    days: [] as DayGroup[],
    total: 0,
    unresolvedCount: 0
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const all = getReactions()
    all.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

    const groups: Record<string, DayGroup> = {}
    let unresolved = 0

    for (const r of all) {
      const t = new Date(r.occurredAt)
      const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      const dateLabel = `${t.getMonth() + 1}/${t.getDate()} 周${getWeekday(dateKey)}`
      const timeOnly = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      const resolvedLabel = r.resolvedAt
        ? new Date(r.resolvedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
        : ''

      const vm: ReactionVM = {
        id: r.id,
        timeOnly,
        typesDisplay: [`${REACTION_TYPE_EMOJI[r.type as keyof typeof REACTION_TYPE_EMOJI]} ${REACTION_TYPE_LABEL[r.type as keyof typeof REACTION_TYPE_LABEL]}`],
        severity: r.severity,
        severityLabel: SEVERITY_LABEL[r.severity as keyof typeof SEVERITY_LABEL],
        note: r.note || '',
        suspectedFoods: r.suspectedFoods || [],
        tracebackCount: (r.tracebackMeals || []).length,
        resolved: !!r.resolvedAt,
        resolvedLabel
      }
      if (!vm.resolved) unresolved++

      if (!groups[dateKey]) groups[dateKey] = { date: dateKey, dateLabel, events: [] }
      groups[dateKey].events.push(vm)
    }

    const days = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date))

    this.setData({
      days,
      total: all.length,
      unresolvedCount: unresolved
    })
  },

  editReaction(e: any) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/reaction-new/reaction-new?id=${id}` })
  },

  markResolved(e: any) {
    const id = e.currentTarget.dataset.id
    updateReaction(id, { resolvedAt: new Date().toISOString() })
    wx.showToast({ title: '已标记消退', icon: 'success' })
    this.refresh()
  },

  undoResolved(e: any) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '撤销消退标记',
      content: '反应将重新显示为"未消退"',
      success: (res) => {
        if (!res.confirm) return
        updateReaction(id, { resolvedAt: undefined })
        wx.showToast({ title: '已撤销', icon: 'success' })
        this.refresh()
      }
    })
  },

  confirmDelete(e: any) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除反应记录',
      content: '确认删除?(不会撤销已加的观察期)',
      success: (res) => {
        if (!res.confirm) return
        removeReaction(id)
        wx.showToast({ title: '已删除', icon: 'success' })
        this.refresh()
      }
    })
  }
})
