import { MealLog, getJournal } from './journal'

export type ReactionType = 'gut' | 'rash' | 'vomit' | 'sleepy' | 'fever' | 'constipation'
export type ReactionSeverity = 'mild' | 'moderate' | 'severe'

export interface ReactionLog {
  id: string
  occurredAt: string
  type: ReactionType
  severity: ReactionSeverity
  note?: string
  tracebackMeals: { date: string; mealIndex: number; recipeName: string; ingredients: string[] }[]
  suspectedFoods: string[]
  resolvedAt?: string
}

export const REACTION_TYPE_LABEL: Record<ReactionType, string> = {
  gut: '拉稀',
  rash: '红疹',
  vomit: '呕吐',
  sleepy: '嗜睡',
  fever: '发烧',
  constipation: '便秘'
}

export const REACTION_TYPE_EMOJI: Record<ReactionType, string> = {
  gut: '💩',
  rash: '🩹',
  vomit: '🤢',
  sleepy: '😴',
  fever: '🌡️',
  constipation: '😣'
}

export const SEVERITY_LABEL: Record<ReactionSeverity, string> = {
  mild: '轻微',
  moderate: '中度',
  severe: '严重'
}

export function getReactions(): ReactionLog[] {
  return wx.getStorageSync('reactions') || []
}

export function setReactions(items: ReactionLog[]) {
  wx.setStorageSync('reactions', items)
}

export function addReaction(reaction: ReactionLog) {
  const all = getReactions()
  all.push(reaction)
  setReactions(all)
}

export function updateReaction(id: string, patch: Partial<ReactionLog>) {
  const all = getReactions()
  const idx = all.findIndex(r => r.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch }
    setReactions(all)
  }
}

export function removeReaction(id: string) {
  setReactions(getReactions().filter(r => r.id !== id))
}

export function traceback72h(reactionTime: string): MealLog[] {
  const reactionDate = new Date(reactionTime).getTime()
  const cutoff = reactionDate - 72 * 3600 * 1000
  return getJournal().filter(log => {
    // 优先 eatenAt (实际吃的时间), 回退 loggedAt
    // 补记一餐的 loggedAt = "现在" (晚于实际吃的时刻), 用它过滤会把"中午吃下午记"的餐挤出窗口外
    // 反应是吃了食物引发的, 应该用吃的时间做窗口判断
    const t = log.eatenAt || log.loggedAt
    const logTime = new Date(t).getTime()
    return logTime <= reactionDate && logTime >= cutoff
  })
}

export function isSeverDirectAllergic(severity: ReactionSeverity, type: ReactionType): boolean {
  if (severity === 'severe') return true
  if (type === 'vomit') return severity !== 'mild'
  return false
}
