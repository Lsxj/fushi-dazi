import { BabyProfile, IndividualException } from './planner'
import { getCategoryByFood } from '../data/categories'
import { parseLocalDateMs } from './dateUtil'

const RECENT_INTRO_DAYS = 14
const COOLDOWN_DAYS = 7

export interface SuspectFood {
  name: string
  reason: string
  level: 'high' | 'medium' | 'low'
}

export function analyzeSuspects(
  profile: BabyProfile,
  ingredients: string[],
  reactionTime: string
): SuspectFood[] {
  const reactionMs = new Date(reactionTime).getTime()
  const recentCutoff = reactionMs - RECENT_INTRO_DAYS * 86400 * 1000
  const confirmed = new Set(profile.confirmedFoods || [])

  const suspects: SuspectFood[] = []
  const seen = new Set<string>()

  for (const ing of ingredients) {
    if (seen.has(ing)) continue
    seen.add(ing)

    const ex = profile.individualExceptions[ing]
    if (ex?.state === 'allergic') continue
    if (ex?.state === 'observation') {
      suspects.push({
        name: ing,
        reason: '此食物已在观察期,本次反应可能确认过敏',
        level: 'high'
      })
      continue
    }
    if (ex?.state === 'introducing') {
      suspects.push({
        name: ing,
        reason: '此食物正在 3 天引入观察期,首次反应可疑',
        level: 'high'
      })
      continue
    }

    const cat = getCategoryByFood(ing)
    const catState = cat ? profile.categoryAllergies[cat.id] : undefined
    const catName = cat?.name || '自定义食材'

    if (cat && catState?.state === 'trying' && catState.tryingFood === ing) {
      const daysRequired = catState.tryingDaysRequired || 3
      let dayLabel = '排敏中'
      if (catState.tryingStartDate) {
        const start = parseLocalDateMs(catState.tryingStartDate)
        const daysSince = Math.floor((reactionMs - start) / 86400000)
        const replacedCount = (catState.tryingReplacedDates || []).length
        const dayIndex = Math.max(1, daysSince + 1 - replacedCount)
        dayLabel = `排敏第 ${dayIndex}/${daysRequired} 天`
      }
      suspects.push({
        name: ing,
        reason: `${catName}${dayLabel},最高度可疑`,
        level: 'high'
      })
      continue
    }

    // 家长已确认的食材(welcome 勾选 / 排敏通过) → 不报"高度可疑"
    // 因为 passedDate 可能被后续 profile 操作覆盖, 但 confirmedFoods 是权威白名单
    const isConfirmed = confirmed.has(ing)
    if (isConfirmed) continue

    if (cat && catState?.passedDate) {
      const opened = parseLocalDateMs(catState.passedDate)
      const daysSinceOpen = (reactionMs - opened) / (86400 * 1000)

      if (opened > recentCutoff) {
        suspects.push({
          name: ing,
          reason: `${catName}近 ${Math.round(daysSinceOpen)} 天才开放,高度可疑`,
          level: 'high'
        })
      } else if (daysSinceOpen < 30) {
        suspects.push({
          name: ing,
          reason: `${catName}已稳定 ${Math.round(daysSinceOpen)} 天,可能性较低`,
          level: 'low'
        })
      }
      continue
    }

    // 兜底: 走到这里 = 未 confirmed + 未 allergic + 未 observation + 未 trying + 无 passedDate
    // 包含两种"从未引入过的食材": (a) 自定义食材(无 category) (b) 已知品类但完全未开放
    // 这种食材是最高度可疑的, 之前会被静默丢掉
    suspects.push({
      name: ing,
      reason: cat ? `${catName}尚未开放,首次出现,高度可疑` : '自定义食材,未在已确认清单,高度可疑',
      level: 'high'
    })
  }

  return suspects.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.level] - order[b.level]
  })
}

export function enterObservation(
  profile: BabyProfile,
  foodName: string,
  reactionId: string,
  note?: string,
  daysOverride?: number
): BabyProfile {
  const today = new Date()
  const days = typeof daysOverride === 'number' && daysOverride > 0 ? daysOverride : COOLDOWN_DAYS
  const retry = new Date(today.getTime() + days * 86400 * 1000)
  profile.individualExceptions[foodName] = {
    state: 'observation',
    enteredAt: today.toISOString().slice(0, 10),
    reasonReactionId: reactionId,
    nextRetryDate: retry.toISOString().slice(0, 10),
    note: note || (days < COOLDOWN_DAYS ? `反应后暂停 ${days} 天观察` : '反应后自动加观察期')
  }
  return profile
}

export function markAllergic(
  profile: BabyProfile,
  foodName: string,
  reactionId: string,
  note?: string
): BabyProfile {
  const today = new Date().toISOString().slice(0, 10)
  const existing = profile.individualExceptions[foodName]
  profile.individualExceptions[foodName] = {
    state: 'allergic',
    enteredAt: today,
    reasonReactionId: reactionId,
    note: note || '严重反应直接确诊',
    retryHistory: existing?.retryHistory
  }
  return profile
}

export function recordRetry(
  profile: BabyProfile,
  foodName: string,
  result: 'pass' | 'fail'
): BabyProfile {
  const today = new Date().toISOString().slice(0, 10)
  const ex = profile.individualExceptions[foodName]
  if (!ex) return profile

  const history = ex.retryHistory || []
  history.push({ date: today, result })

  if (result === 'pass') {
    delete profile.individualExceptions[foodName]
    if (!profile.confirmedFoods) profile.confirmedFoods = []
    if (!profile.confirmedFoods.includes(foodName)) {
      profile.confirmedFoods.push(foodName)
    }
    // 记入"新引入"列表
    if (!profile.recentlyAddedFoods) profile.recentlyAddedFoods = []
    if (!profile.recentlyAddedFoods.find(f => f.name === foodName)) {
      profile.recentlyAddedFoods.push({ name: foodName, addedAt: today })
    }
  } else {
    profile.individualExceptions[foodName] = {
      ...ex,
      state: 'allergic',
      note: `${history.length} 次反应,确诊过敏`,
      retryHistory: history
    }
  }
  return profile
}

export function getDueRetryFoods(profile: BabyProfile): { name: string; ex: IndividualException }[] {
  const today = new Date().toISOString().slice(0, 10)
  const result: { name: string; ex: IndividualException }[] = []
  for (const [name, ex] of Object.entries(profile.individualExceptions)) {
    if (ex.state === 'observation' && ex.nextRetryDate && ex.nextRetryDate <= today) {
      result.push({ name, ex })
    }
  }
  return result
}

const INTRODUCE_DAYS = 3

export function startIntroducing(profile: BabyProfile, foodName: string): BabyProfile {
  const today = new Date()
  const due = new Date(today.getTime() + INTRODUCE_DAYS * 86400 * 1000)
  profile.individualExceptions[foodName] = {
    state: 'introducing',
    enteredAt: today.toISOString().slice(0, 10),
    nextRetryDate: due.toISOString().slice(0, 10),
    note: `3 天引入观察`
  }
  return profile
}

export function checkIntroducingComplete(profile: BabyProfile): string[] {
  const today = new Date().toISOString().slice(0, 10)
  const completed: string[] = []
  for (const [name, ex] of Object.entries(profile.individualExceptions)) {
    if (ex.state === 'introducing' && ex.nextRetryDate && ex.nextRetryDate <= today) {
      completed.push(name)
    }
  }
  return completed
}

export function completeIntroducing(profile: BabyProfile, foodName: string): BabyProfile {
  delete profile.individualExceptions[foodName]
  if (!profile.confirmedFoods) profile.confirmedFoods = []
  if (!profile.confirmedFoods.includes(foodName)) {
    profile.confirmedFoods.push(foodName)
  }
  // 记入"新引入"列表
  if (!profile.recentlyAddedFoods) profile.recentlyAddedFoods = []
  const today = new Date().toISOString().slice(0, 10)
  if (!profile.recentlyAddedFoods.find(f => f.name === foodName)) {
    profile.recentlyAddedFoods.push({ name: foodName, addedAt: today })
  }
  return profile
}
