export type Preference = 'love' | 'dislike'
export type Portion = 'taste' | 'small' | 'half' | 'full'

export interface MealLog {
  date: string
  mealIndex: number
  recipeId: string            // 关联的计划餐 id (即使用户改了实际菜)
  recipeName: string          // 计划餐名 (回退/统计用)
  ingredients: string[]       // 实际吃的食材 (反应回溯权威源, 默认 = plan.ingredients, 用户可改)
  loggedAt: string            // 打卡时刻 (不可改, 用作兜底)
  eatenAt?: string            // 用户调整后的用餐时间 ISO; 空时显示用 loggedAt
  preference?: Preference
  note?: string
  // 实际记录扩展
  customDishName?: string     // 用户输入的实际菜名 (如「鳕鱼泥+米糊」)。空 = 按计划
  portion?: Portion           // 份量
  isCustom?: boolean          // true = 用户改过计划 (UI 标记/统计用)
}

// 拿到展示用的用餐时间 (优先 eatenAt, 回退 loggedAt)
export function getMealTime(log: MealLog): string {
  return log.eatenAt || log.loggedAt
}

// 把 HH:mm 合并到 log.date 上, 生成新 ISO 串
export function combineTime(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).toISOString()
}

// UI 上份量只剩 3 档(尝几口 / 半份 / 1 份); type 保留 small 仅为兼容历史 log,
// small 显示时归并到「尝几口」, 编辑预填时也映射回 taste 高亮
export const PORTION_LABEL: Record<Portion, string> = {
  taste: '尝几口',
  small: '尝几口',
  half: '半份',
  full: '1份'
}

export const PORTION_EMOJI: Record<Portion, string> = {
  taste: '😊',
  small: '😊',
  half: '🥣',
  full: '🍚'
}

export const PREFERENCE_LABEL: Record<Preference, string> = {
  love: '爱吃',
  dislike: '不爱吃'
}

export const PREFERENCE_EMOJI: Record<Preference, string> = {
  love: '😋',
  dislike: '😐'
}

export function getJournal(): MealLog[] {
  return wx.getStorageSync('mealJournal') || []
}

export function setJournal(logs: MealLog[]) {
  wx.setStorageSync('mealJournal', logs)
}

export function logMeal(log: MealLog) {
  const all = getJournal()
  const idx = all.findIndex(l => l.date === log.date && l.mealIndex === log.mealIndex)
  if (idx >= 0) {
    all[idx] = log
  } else {
    all.push(log)
  }
  setJournal(all)
}

export function unlogMeal(date: string, mealIndex: number) {
  const all = getJournal().filter(l => !(l.date === date && l.mealIndex === mealIndex))
  setJournal(all)
}

export function isMealLogged(date: string, mealIndex: number): boolean {
  return getJournal().some(l => l.date === date && l.mealIndex === mealIndex)
}

export function getMealLog(date: string, mealIndex: number): MealLog | undefined {
  return getJournal().find(l => l.date === date && l.mealIndex === mealIndex)
}

export function setPreference(date: string, mealIndex: number, preference: Preference | null) {
  const log = getMealLog(date, mealIndex)
  if (!log) return
  if (preference === null) {
    delete log.preference
  } else {
    log.preference = preference
  }
  logMeal(log)
}
