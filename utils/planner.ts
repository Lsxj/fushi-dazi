import { CATEGORIES, getCategoryByFood, getParentFood, getPrimaryMembers } from '../data/categories'
import { RECIPES, Recipe } from '../data/recipes'
import { findTaboosForIngredients, findTaboosAgainst, Taboo } from '../data/taboos'
import { getNutritionRule, meetsRequired } from './nutrition'
import { getIngredient } from '../data/ingredients'

export interface BabyProfile {
  babyName: string
  birthday?: string
  ageMonths: number
  mealsPerDay: number
  currentStatus: string
  statusSince?: string
  categoryAllergies: Record<string, CategoryAllergyState>
  individualExceptions: Record<string, IndividualException>
  confirmedFoods?: string[]
  // 真正"新引入"的食材记录 (welcome 一次性勾选的不算)
  // 排敏完成 / retry pass 时 push, 30 天后由消费方按 addedAt 自然过滤
  recentlyAddedFoods?: { name: string; addedAt: string }[]
  categorySchemaVersion?: number
}

export type FoodSafetyProfile = Pick<
  BabyProfile,
  | 'ageMonths'
  | 'currentStatus'
  | 'statusSince'
  | 'categoryAllergies'
  | 'individualExceptions'
  | 'confirmedFoods'
>

export interface CategoryAllergyState {
  state: string
  representative?: string
  passedDate?: string
  cooldownUntil?: string
  note?: string
  tryingFood?: string
  tryingStartDate?: string
  tryingDaysCompleted?: number
  tryingReplacedDates?: string[]
  // 排敏所需天数；现行规则统一为每种新食物至少 3 天，老数据字段继续兼容。
  tryingDaysRequired?: number
}

export const TRYING_DAYS_REQUIRED = 3
// 分类只用于导航，不能替代单种食物观察；同品类新成员同样至少 3 天。
export const TRYING_DAYS_INCATEGORY = 3

const CATEGORY_SCHEMA_VERSION = 2

/**
 * 把旧版合并分类迁移到新版分组。confirmedFoods 是权威食物级记录；
 * 新分组只有在确有已确认成员时才标记开放，避免把旧品类状态扩散成整组安全。
 */
export function reconcileCategorySchema(profile: BabyProfile): boolean {
  if (!profile.categoryAllergies) profile.categoryAllergies = {}
  if (!profile.individualExceptions) profile.individualExceptions = {}
  const states = profile.categoryAllergies
  const confirmed = new Set(profile.confirmedFoods || [])
  let changed = false

  const splitSource: Record<string, string> = {
    nightshade: 'gourd',
    fruitMelon: 'fruitLow',
    fruitStoneBerry: 'fruitLow',
    fruitCitrus: 'fruitHigh',
    mollusc: 'shrimp',
    peanut: 'nuts'
  }

  for (const cat of CATEGORIES) {
    if (states[cat.id]) continue
    const confirmedHere = getPrimaryMembers(cat.id).filter(name => confirmed.has(name))
    const source = states[splitSource[cat.id]]
    if (source?.state === 'trying' && source.tryingFood && cat.members.includes(source.tryingFood)) {
      states[cat.id] = { ...source }
      changed = true
      continue
    }
    if (confirmedHere.length > 0) {
      states[cat.id] = {
        state: 'open',
        representative: confirmedHere[0],
        passedDate: source?.passedDate
      }
      changed = true
      continue
    }
    if (source?.state === 'observation') {
      states[cat.id] = { ...source }
      changed = true
      continue
    }
    states[cat.id] = {
      state: !cat.noAllergyTracking && cat.recommendedMonth > profile.ageMonths + 6 ? 'locked' : (cat.noAllergyTracking ? 'open' : 'untried')
    }
    changed = true
  }

  // 若旧合并分类正在排的新食物已迁走，原分类回到由已确认食物决定的状态。
  for (const sourceId of ['gourd', 'fruitLow', 'fruitHigh', 'shrimp', 'nuts']) {
    const state = states[sourceId]
    if (!state?.tryingFood) continue
    const actualCat = getCategoryByFood(state.tryingFood)
    if (!actualCat || actualCat.id === sourceId) continue
    const sourceDef = CATEGORIES.find(c => c.id === sourceId)
    const confirmedHere = sourceDef ? getPrimaryMembers(sourceId).filter(name => confirmed.has(name)) : []
    states[sourceId] = confirmedHere.length > 0
      ? { state: 'open', representative: confirmedHere[0], passedDate: state.passedDate }
      : { state: 'untried' }
    changed = true
  }

  if (profile.categorySchemaVersion !== CATEGORY_SCHEMA_VERSION) {
    profile.categorySchemaVersion = CATEGORY_SCHEMA_VERSION
    changed = true
  }
  return changed
}

// 拿当前 trying 的所需天数（兼容老数据无 tryingDaysRequired 字段）
function getTryingDaysFor(cat: CategoryAllergyState): number {
  return cat.tryingDaysRequired || TRYING_DAYS_REQUIRED
}

// 本地时区解析 'YYYY-MM-DD' → 当日 0:00 时间戳
// 不能用 new Date('YYYY-MM-DD')，那个按 UTC 解析，跟本地 setHours(0,0,0,0) 差时区
function parseLocalDate(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export interface IndividualException {
  state: 'allergic' | 'observation' | 'introducing'
  note?: string
  enteredAt?: string
  reasonReactionId?: string
  nextRetryDate?: string
  retryHistory?: { date: string; result: 'pass' | 'fail' }[]
}

export const MEMBER_INTRODUCE_DAYS = 3

export function calcAgeMonths(birthday: string, refDate?: Date): number {
  // 本地解析 YYYY-MM-DD, 避免 new Date(str) 走 UTC 在临界日期月龄偏 1
  const parts = birthday.slice(0, 10).split('-').map(Number)
  const birth = parts.length === 3 && !parts.some(isNaN)
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date(birthday)
  const ref = refDate || new Date()
  let months = (ref.getFullYear() - birth.getFullYear()) * 12 + (ref.getMonth() - birth.getMonth())
  if (ref.getDate() < birth.getDate()) months -= 1
  return Math.max(0, months)
}

export interface PlannedMeal {
  date: string
  mealIndex: number
  recipe: Recipe
  // 排敏「加料」: 这餐除了 recipe 之外, 额外喂 1 勺该食材(蒸熟压泥等)
  trialIngredient?: string
  trialMethod?: string
}

export interface DailyPlan {
  date: string
  meals: PlannedMeal[]
}

export function hasActiveGutReaction(): boolean {
  const reactions: any[] = wx.getStorageSync('reactions') || []
  const cutoff = Date.now() - 3 * 86400 * 1000
  return reactions.some(r =>
    r.type === 'gut' &&
    !r.resolvedAt &&
    new Date(r.occurredAt).getTime() >= cutoff
  )
}

// 近 5 天有未消退的便秘反应 (便秘通常持续 3-5 天才缓解, 窗口比 gut 长)
// 中国营养学会 2022 + AAP 2024: 便秘缓解期推荐增加纤维 + 水分, 避免精米米糊/过量奶
export function hasActiveConstipation(): boolean {
  const reactions: any[] = wx.getStorageSync('reactions') || []
  const cutoff = Date.now() - 5 * 86400 * 1000
  return reactions.some(r =>
    r.type === 'constipation' &&
    !r.resolvedAt &&
    new Date(r.occurredAt).getTime() >= cutoff
  )
}

export function isFoodSafeForBaby(foodName: string, profile: FoodSafetyProfile): { safe: boolean; reason?: string } {
  const exception = profile.individualExceptions[foodName]
  if (exception?.state === 'allergic') return { safe: false, reason: `${foodName}已标记过敏` }
  if (exception?.state === 'observation') return { safe: false, reason: `${foodName}处于观察期` }
  if (exception?.state === 'introducing') return { safe: false, reason: `${foodName}正在 3 天引入观察` }

  const category = getCategoryByFood(foodName)
  if (!category) return { safe: false, reason: `${foodName}未在分类库` }

  if (category.noAllergyTracking) return { safe: true }

  const cat = profile.categoryAllergies[category.id]
  if (!cat) return { safe: false, reason: `${category.name}未引入` }

  if (profile.currentStatus === 'postVaccine') {
    const confirmed = profile.confirmedFoods || []
    if (!confirmed.includes(foodName)) {
      return { safe: false, reason: `疫苗期间只用确认稳定的食物,${foodName}不在清单内` }
    }
    if (profile.statusSince && cat.passedDate && cat.passedDate >= profile.statusSince) {
      return { safe: false, reason: `${category.name}是在疫苗后开放的,等状态恢复正常再用` }
    }
  }

  if (cat.state === 'open') {
    // 同品类内白名单 gating：只有 confirmedFoods 里的成员才放行
    // 未确认成员仍需逐种观察至少 3 天。
    const confirmed = profile.confirmedFoods || []
    if (confirmed.includes(foodName)) return { safe: true }
    // 该品类的代表食物也视为已通过（welcome 时已 push 到 confirmedFoods，但兜底）
    if (cat.representative === foodName) return { safe: true }
    // 同源变体（鸡肝/鸡腿肉 → 鸡胸肉，猪肝/排骨 → 猪肉）：主食材通过即放行，
    // 不要求变体自己排敏——它们共享同一过敏原
    const parent = getParentFood(foodName)
    if (parent && (confirmed.includes(parent) || cat.representative === parent)) {
      return { safe: true }
    }
    // 兜底: 品类 state=open 但 confirmedFoods 和 representative 都空 (用户在 profile 切 open 选"逐个选"后未点食材确认),
    // 此时若整个品类完全没有任何"通过"食材, 放行品类第一个成员避免菜单生成空白
    const primaries = getPrimaryMembers(category.id)
    const confirmedInCat = primaries.filter(m => confirmed.includes(m))
    if (confirmedInCat.length === 0 && !cat.representative && primaries[0] === foodName) {
      return { safe: true }
    }
    return { safe: false, reason: `${foodName}还没单独尝试过，建议先排敏` }
  }
  if (cat.state === 'trying') {
    if (foodName === cat.tryingFood) return { safe: true }
    // 排敏中品类：已 confirmed 的同品类成员仍可用（不影响新成员排敏判断）
    const confirmed = profile.confirmedFoods || []
    if (confirmed.includes(foodName)) return { safe: true }
    return { safe: false, reason: `${category.name}排敏中,只能用${cat.tryingFood}或已确认食材` }
  }
  if (cat.state === 'observation') {
    return { safe: false, reason: `${category.name}处于观察期(${cat.note || '冷却中'})` }
  }
  if (cat.state === 'untried') return { safe: false, reason: `${category.name}未引入` }
  if (cat.state === 'locked') return { safe: false, reason: `${category.name}暂未到引入月龄` }

  return { safe: false }
}

export function getCurrentTryingCategoryId(profile: BabyProfile): string | null {
  for (const [id, cat] of Object.entries(profile.categoryAllergies)) {
    if (cat.state === 'trying') return id
  }
  return null
}

export function getTryingFood(profile: BabyProfile): string | null {
  for (const cat of Object.values(profile.categoryAllergies)) {
    if (cat.state === 'trying' && cat.tryingFood) return cat.tryingFood
  }
  return null
}

export function getTryingProgress(profile: BabyProfile): { food: string; categoryId: string; dayIndex: number; daysRequired: number; startDate: string } | null {
  for (const [id, cat] of Object.entries(profile.categoryAllergies)) {
    if (cat.state === 'trying' && cat.tryingFood && cat.tryingStartDate) {
      const start = parseLocalDate(cat.tryingStartDate)
      const today = new Date().setHours(0, 0, 0, 0)
      const daysSince = Math.floor((today - start) / 86400000)
      // 排敏日期 > 今天 → 还没开始
      if (daysSince < 0) return null
      const replacedCount = (cat.tryingReplacedDates || []).length
      const baseDaysRequired = getTryingDaysFor(cat)
      const daysRequired = baseDaysRequired + replacedCount
      // dayIndex 改为"实际已吃过 trying food 的不同日期数"
      // 若今天还没喂过 trying food, dayIndex 不递增, UI 显示"待喂"
      const journal: any[] = wx.getStorageSync('mealJournal') || []
      const validDates = new Set<string>()
      for (const log of journal) {
        if (log.date >= cat.tryingStartDate && (log.ingredients || []).includes(cat.tryingFood)) {
          validDates.add(log.date)
        }
      }
      const dayIndex = Math.min(validDates.size, daysRequired)
      return {
        food: cat.tryingFood,
        categoryId: id,
        dayIndex,
        daysRequired,
        startDate: cat.tryingStartDate
      }
    }
  }
  return null
}

// 排敏已启动但 startDate 还没到（如今日餐次都喂完，从明天才计第1天）
export function getTryingScheduledStart(profile: BabyProfile): { food: string; categoryId: string; startDate: string } | null {
  for (const [id, cat] of Object.entries(profile.categoryAllergies)) {
    if (cat.state === 'trying' && cat.tryingFood && cat.tryingStartDate) {
      const start = parseLocalDate(cat.tryingStartDate)
      const today = new Date().setHours(0, 0, 0, 0)
      const daysSince = Math.floor((today - start) / 86400000)
      if (daysSince < 0) {
        return { food: cat.tryingFood, categoryId: id, startDate: cat.tryingStartDate }
      }
    }
  }
  return null
}

export function checkTryingComplete(profile: BabyProfile): { categoryId: string; food: string } | null {
  const progress = getTryingProgress(profile)
  if (!progress) return null
  // 完成 = 实际已喂过 trying food 的天数达到顺延后的要求
  if (progress.dayIndex >= progress.daysRequired) {
    return { categoryId: progress.categoryId, food: progress.food }
  }
  return null
}

export function completeTrying(profile: BabyProfile, categoryId: string): BabyProfile {
  const cat = profile.categoryAllergies[categoryId]
  if (!cat || cat.state !== 'trying') return profile
  const food = cat.tryingFood
  // 同品类补食材：保留原 representative & passedDate，不被新 food 覆盖
  const isInCategoryAdd = !!cat.representative && cat.representative !== food
  profile.categoryAllergies[categoryId] = {
    state: 'open',
    representative: isInCategoryAdd ? cat.representative : food,
    passedDate: cat.passedDate || new Date().toISOString().slice(0, 10)
  }
  if (food) {
    // 排敏通过 → 清掉历史个体豁免 (observation/allergic 都被推翻),
    // 否则 isFoodSafeForBaby:102 最前面就 return "观察期" 拦截, 菜单/UI 仍显示观察期
    if (profile.individualExceptions[food]) {
      delete profile.individualExceptions[food]
    }
    if (!profile.confirmedFoods) profile.confirmedFoods = []
    if (!profile.confirmedFoods.includes(food)) {
      profile.confirmedFoods.push(food)
    }
    // 记入"新引入"列表(用于"新食材"标签判断)
    if (!profile.recentlyAddedFoods) profile.recentlyAddedFoods = []
    const today = new Date().toISOString().slice(0, 10)
    if (!profile.recentlyAddedFoods.find(f => f.name === food)) {
      profile.recentlyAddedFoods.push({ name: food, addedAt: today })
    }
  }
  return profile
}

export function abortTrying(profile: BabyProfile, categoryId: string): BabyProfile {
  const cat = profile.categoryAllergies[categoryId]
  if (!cat || cat.state !== 'trying') return profile

  // 判断"同品类内补食材"两条线索（任一成立即可）：
  // 1. 当前 cat 仍带 representative（且不是 tryingFood 自己）
  // 2. confirmedFoods 里同品类还有别的已通过食材（兜底历史脏数据 — 旧版 abort 抹掉了 representative）
  const confirmed = profile.confirmedFoods || []
  const catDef = CATEGORIES.find(c => c.id === categoryId)
  const otherConfirmedInCategory = !!catDef && catDef.members.some(
    m => m !== cat.tryingFood && confirmed.includes(m)
  )
  const hasRep = !!cat.representative && cat.representative !== cat.tryingFood
  const isInCategoryAdd = hasRep || otherConfirmedInCategory

  if (isInCategoryAdd) {
    // 优先用 cat.representative；fallback 到 confirmedFoods 里第一个同品类成员
    const rep = (cat.representative && cat.representative !== cat.tryingFood)
      ? cat.representative
      : (catDef?.members.find(m => m !== cat.tryingFood && confirmed.includes(m)) || cat.representative)
    profile.categoryAllergies[categoryId] = {
      state: 'open',
      representative: rep,
      passedDate: cat.passedDate || new Date().toISOString().slice(0, 10)
    }
  } else {
    profile.categoryAllergies[categoryId] = { state: 'untried' }
  }
  return profile
}

/**
 * 启动排敏（统一入口）：
 *  - 跨品类（state='untried'）→ 默认 3 天
 *  - 同品类内补食材（state='open'）→ 同样默认 3 天
 *  - 自动判断 startDate（hasUnloggedToday=true 用今日，否则明日）
 *  - 保留品类原有 representative/passedDate（同品类补食材场景）
 *  返回 { profile, daysRequired, startDate, isInCategoryAdd }；catId 已存在 trying 时返回 null
 */
export function startTryingForFood(
  profile: BabyProfile,
  categoryId: string,
  food: string,
  hasUnloggedToday: boolean,
  customDays?: number
): { profile: BabyProfile; daysRequired: number; startDate: string; isInCategoryAdd: boolean } | null {
  if (getCurrentTryingCategoryId(profile)) return null
  const existing = profile.categoryAllergies[categoryId] || { state: 'untried' }
  const isInCategoryAdd = existing.state === 'open'
  const daysRequired = customDays || (isInCategoryAdd ? TRYING_DAYS_INCATEGORY : TRYING_DAYS_REQUIRED)
  // 用本地 formatDate 而非 toISOString().slice(0,10), 否则凌晨 0-8 点 (北京 +8 区) 会拿到 UTC 昨天, 把排敏开始日定错
  const startDate = hasUnloggedToday
    ? formatDate(new Date())
    : formatDate(new Date(Date.now() + 86400000))
  profile.categoryAllergies[categoryId] = {
    ...existing,
    state: 'trying',
    tryingFood: food,
    tryingDaysRequired: daysRequired,
    tryingStartDate: startDate,
    tryingReplacedDates: []
  }
  return { profile, daysRequired, startDate, isInCategoryAdd }
}

// 自愈: 把 tryingReplacedDates 里那些「实际已吃过 trying food」的日期移除
// 修复历史脏数据 (旧版本在用户已喂过 trying food 的日期里仍 record 了 replaced)
// 返回 profile 是否被修改过的标记
export function reconcileTryingReplaced(profile: BabyProfile): boolean {
  let mutated = false
  for (const cat of Object.values(profile.categoryAllergies)) {
    if (cat.state !== 'trying' || !cat.tryingFood) continue
    const replaced = cat.tryingReplacedDates || []
    if (replaced.length === 0) continue
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const cleaned = replaced.filter(date =>
      !journal.some(l => l.date === date && (l.ingredients || []).includes(cat.tryingFood))
    )
    if (cleaned.length !== replaced.length) {
      cat.tryingReplacedDates = cleaned
      mutated = true
    }
  }
  return mutated
}

// 自愈: 排敏通过后, individualExceptions 里同名 observation 残留 → 删除
// (旧版 completeTrying 漏清理导致脏数据, 用户进入页面时自动修复)
// 保留 allergic: 严重过敏标记需用户主动从 profile 页改, 不主动清
export function reconcileExceptions(profile: BabyProfile): boolean {
  if (!profile.confirmedFoods || profile.confirmedFoods.length === 0) return false
  let changed = false
  for (const food of profile.confirmedFoods) {
    const ex = profile.individualExceptions[food]
    if (ex && ex.state === 'observation') {
      delete profile.individualExceptions[food]
      changed = true
    }
  }
  return changed
}

export function recordTryingReplaced(profile: BabyProfile, categoryId: string, date: string): BabyProfile {
  const cat = profile.categoryAllergies[categoryId]
  if (!cat || cat.state !== 'trying') return profile
  const replaced = cat.tryingReplacedDates || []
  if (!replaced.includes(date)) {
    cat.tryingReplacedDates = [...replaced, date]
  }
  return profile
}

export interface ApplicableOptions {
  // 排敏场景: 当前正在引入的目标食材名(如 '鳕鱼')
  // 传入后: 把这道菜当作"该食材的排敏基底"评估
  //   - 其他食材跟 target 的 hard 禁忌 → 阻断
  //   - 其他食材跟 target 的 soft 禁忌:
  //       无 mitigation → 阻断
  //       有 mitigation → 放行, warnings 返回提示
  introducing?: string
}

export interface ApplicableResult {
  applicable: boolean
  reason?: string
  warnings?: Taboo[]  // 可缓解的 soft 禁忌(给 UI 显示提示)
}

export function isRecipeApplicable(
  recipe: Recipe,
  profile: BabyProfile,
  options: ApplicableOptions = {}
): ApplicableResult {
  if (profile.ageMonths < recipe.applicableMonthRange[0]) {
    // 月龄不足时，检查"超龄食材"是否都被家长主动确认过（已通过排敏）。
    // 都 confirmed → 视为家长主动早引入，放行；否则仍 block。
    const confirmed = profile.confirmedFoods || []
    const blockedByAge = recipe.ingredients.filter(i => {
      const ing = getIngredient(i.name)
      return ing && profile.ageMonths < ing.applicableMonth
    })
    const allOverridden = blockedByAge.length > 0 && blockedByAge.every(i => confirmed.includes(i.name))
    if (!allOverridden) {
      return { applicable: false, reason: `月龄不足(需${recipe.applicableMonthRange[0]}月+)` }
    }
  }
  if (profile.ageMonths > recipe.applicableMonthRange[1]) {
    return { applicable: false, reason: `超过适用月龄` }
  }
  if (recipe.unsuitableStatus.includes(profile.currentStatus)) {
    return { applicable: false, reason: `当前状态不适合` }
  }
  if (hasActiveGutReaction()) {
    if (recipe.unsuitableStatus.includes('gut') ||
        recipe.nutritionTags.some(t => ['DHA', '海鲜', '虾', '蟹', '高纤维'].includes(t))) {
      return { applicable: false, reason: '近期有肠胃反应未消退,避免海鲜/高纤维' }
    }
  }
  // 便秘期: 避免低纤维精白米/过量奶制品 (中国营养学会 2022 + AAP), 鼓励高纤维高水分
  if (hasActiveConstipation()) {
    if (recipe.unsuitableStatus.includes('constipation') ||
        recipe.nutritionTags.some(t => ['低纤维', '精白米'].includes(t))) {
      return { applicable: false, reason: '便秘期间避免精米米糊/低纤维主食' }
    }
  }
  if (profile.currentStatus === 'postVaccine') {
    if (recipe.nutritionTags.some(t => ['DHA', '海鲜', '虾', '蟹'].includes(t))) {
      return { applicable: false, reason: '疫苗后避免海鲜/油脂' }
    }
  }
  for (const ing of recipe.ingredients) {
    // 排敏场景: target 食材本身就在引入中, 跳过 safety 检查避免「类别未开」误杀
    if (options.introducing && ing.name === options.introducing) continue
    const safety = isFoodSafeForBaby(ing.name, profile)
    if (!safety.safe) return { applicable: false, reason: safety.reason }
  }

  // 食材搭配禁忌检查 (分级处理)
  const ingredientNames = recipe.ingredients.map(i => i.name)
  const warnings: Taboo[] = []

  if (options.introducing) {
    // 排敏场景: 重点看"新食材 vs 其他食材"的禁忌
    const taboosAgainst = findTaboosAgainst(options.introducing, ingredientNames)
    for (const t of taboosAgainst) {
      if (t.level === 'hard') {
        return { applicable: false, reason: `排敏期禁忌:${t.reason}` }
      }
      if (t.level === 'soft') {
        if (!t.mitigation) {
          return { applicable: false, reason: `排敏期影响吸收:${t.reason}` }
        }
        warnings.push(t)
      }
    }
    // 基底内部 (非目标食材之间) 仍按日常规则 = 只 hard 阻断
    const baseOnly = ingredientNames.filter(n => n !== options.introducing)
    const baseTaboos = findTaboosForIngredients(baseOnly)
    const baseHard = baseTaboos.find(t => t.level === 'hard')
    if (baseHard) {
      return { applicable: false, reason: `食材搭配禁忌:${baseHard.reason}` }
    }
  } else {
    // 日常: 只 hard 阻断, soft 不阻断
    const taboos = findTaboosForIngredients(ingredientNames)
    const hard = taboos.find(t => t.level === 'hard')
    if (hard) {
      return { applicable: false, reason: `食材搭配禁忌:${hard.reason}` }
    }
  }

  return warnings.length > 0
    ? { applicable: true, warnings }
    : { applicable: true }
}

export function getApplicableRecipes(profile: BabyProfile): Recipe[] {
  return RECIPES.filter(r => isRecipeApplicable(r, profile).applicable)
}

// 排敏「加料」场景: 找出可作为基底的食谱(不含 target, 其他食材合格, 跟 target 无硬禁忌)
// 用法: 食谱库凑不出含 target 的整道菜时, 用基底+加料的方式排敏
export function findIntroducingBases(target: string, profile: BabyProfile, topN: number = 3): Recipe[] {
  return RECIPES
    .filter(r => !r.ingredients.some(i => i.name === target))
    .filter(r => isRecipeApplicable(r, profile, { introducing: target }).applicable)
    .slice(0, topN)
}

// 排敏期目标食材首次尝试的工艺指引(按 mainCategory 推, 后续可个别 override)
export function getFirstTryMethod(foodName: string): string {
  const cat = getCategoryByFood(foodName)
  if (!cat) return '少量(1-2勺)单独尝试'
  if (cat.id === 'peanut') return '用无颗粒花生酱/花生粉调稀，从少量开始；禁止整粒花生'
  if (cat.id === 'nuts') return '用细磨坚果粉或无颗粒坚果酱调稀；禁止整粒坚果'
  if (cat.id === 'sesame') return '用芝麻酱调稀，从少量开始'
  if (cat.id === 'dairy') return '用巴氏杀菌原味酸奶等少量尝试；1岁内不以牛奶替代母乳或配方奶'
  if (cat.id === 'fish' || cat.id === 'shrimp' || cat.id === 'mollusc') return '彻底煮熟，仔细去刺/壳后压泥，从少量开始'
  switch (cat.mainCategory) {
    case 'protein':
      // 蛋黄/蛋白特殊
      if (foodName.includes('蛋')) return '煮熟 1/4 个, 调稀'
      return '煮熟/蒸熟后压泥, 加 1 勺'
    case 'veg':
    case 'fruit':
      return '蒸熟搅泥, 加 1-2 勺'
    case 'staple':
      return '煮软/煮成糊, 加 1-2 勺'
    case 'oil':
    case 'condiment':
      return '少量(几滴)拌入'
    default:
      return '少量(1-2勺)单独尝试'
  }
}

// 把"加料"持久化到 weeklyPlan 指定餐次, 并清除该 target 在其他餐次上的旧加料标记
// 用于排敏启动后让首页那餐显示一行 chip
export function attachTrialIngredient(
  plans: DailyPlan[],
  date: string,
  mealIdx: number,
  target: string
): DailyPlan[] {
  const method = getFirstTryMethod(target)
  return plans.map(p => ({
    ...p,
    meals: p.meals.map((m, i) => {
      // 清掉同 target 的旧标记(防止旧排敏 slot 残留)
      if (m.trialIngredient === target && !(p.date === date && i === mealIdx)) {
        const { trialIngredient: _t, trialMethod: _m, ...rest } = m
        return rest as PlannedMeal
      }
      // 挂到指定餐次
      if (p.date === date && i === mealIdx) {
        return { ...m, trialIngredient: target, trialMethod: method }
      }
      return m
    })
  }))
}

// 排敏结束/中止时清除该 target 的所有加料标记
export function clearTrialIngredient(plans: DailyPlan[], target: string): DailyPlan[] {
  return plans.map(p => ({
    ...p,
    meals: p.meals.map(m => {
      if (m.trialIngredient === target) {
        const { trialIngredient: _t, trialMethod: _m, ...rest } = m
        return rest as PlannedMeal
      }
      return m
    })
  }))
}

// 给定 trying target 和 plan, 找出第一个"可以加料"的未喂餐次
// 优先今日, 没有则明日; 跳过含 target 的餐(已经天然在吃)和跟 target 有 hard 禁忌的餐
export function suggestTrialSlot(
  profile: BabyProfile,
  target: string,
  plans: DailyPlan[],
  today: string,
  loggedKeys: Set<string>
): { date: string; mealIdx: number; recipeName: string; warnings: Taboo[] } | null {
  const sorted = plans
    .filter(p => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const p of sorted) {
    for (let i = 0; i < p.meals.length; i++) {
      const m = p.meals[i]
      // mealJournal 用 mealIndex 字段(可能跟数组下标不一致), 必须用 m.mealIndex
      const key = `${p.date}-${m.mealIndex}`
      if (loggedKeys.has(key)) continue
      // 该餐已经含 target → 不需要加料
      if (m.recipe.ingredients.some(ing => ing.name === target)) continue
      // 跟 target 有 hard 或 unmitigated soft 禁忌的 → 不能加
      const taboos = findTaboosAgainst(target, m.recipe.ingredients.map(ing => ing.name))
      if (taboos.some(t => t.level === 'hard' || (t.level === 'soft' && !t.mitigation))) continue
      const warnings = taboos.filter(t => t.level === 'soft' && !!t.mitigation)
      return { date: p.date, mealIdx: m.mealIndex, recipeName: m.recipe.name, warnings }
    }
  }
  return null
}

// 给 UI 用: 单独查这道菜在排敏 X 时的提示警告(soft 可缓解)
export function getRecipeTabooWarnings(recipe: Recipe, introducing?: string): Taboo[] {
  const names = recipe.ingredients.map(i => i.name)
  if (introducing) {
    return findTaboosAgainst(introducing, names).filter(t => t.level === 'soft' && !!t.mitigation)
  }
  return findTaboosForIngredients(names).filter(t => t.level === 'soft' && !!t.mitigation)
}

export function diagnoseEmptyPlan(profile: BabyProfile): { reason: string; action: string; actionType: 'profile' | 'recipes' | 'wait' } {
  if (profile.ageMonths < 4) {
    return {
      reason: '宝宝还没到辅食月龄,建议 4-6 月龄再开始添加',
      action: '先以奶为主,等到 4 月龄后再回来',
      actionType: 'wait'
    }
  }

  const opened = Object.values(profile.categoryAllergies).filter(c => c.state === 'open' || c.state === 'trying')
  const openedCount = opened.length

  if (profile.ageMonths < 6 && openedCount === 0) {
    return {
      reason: '4-5 月龄可以开始尝试,推荐第一口高铁米粉',
      action: '去排敏档案点"高铁米粉",开始 3 天排敏',
      actionType: 'profile'
    }
  }

  if (openedCount === 0) {
    return {
      reason: '排敏档案里还没有任何已开放的食物',
      action: '去排敏档案勾选已经稳定吃过的食物',
      actionType: 'profile'
    }
  }

  if (openedCount < 2) {
    return {
      reason: `已开放品类太少(只有 ${openedCount} 类),不够组合菜单`,
      action: '去排敏档案多勾选几个品类,或者点"立即引入"试一个新的',
      actionType: 'profile'
    }
  }

  const applicable = getApplicableRecipes(profile)
  if (applicable.length === 0) {
    return {
      reason: `${profile.ageMonths} 月龄的宝宝当前安全清单凑不出现成食谱`,
      action: '试试食谱库手动浏览(可看不安全的),或多开放几个品类',
      actionType: 'recipes'
    }
  }

  return {
    reason: '系统暂时凑不出菜单',
    action: '试试调整餐次或重新生成',
    actionType: 'wait'
  }
}

function getPreferenceWeights(): Record<string, number> {
  const journal: any[] = wx.getStorageSync('mealJournal') || []
  const weights: Record<string, number> = {}
  for (const log of journal.slice(-30)) {
    if (!log.recipeId) continue
    if (log.preference === 'love') weights[log.recipeId] = (weights[log.recipeId] || 0) + 5
    if (log.preference === 'dislike') weights[log.recipeId] = (weights[log.recipeId] || 0) - 8
  }
  return weights
}

function pickByCoverage(
  applicable: Recipe[],
  recentIds: string[],
  requiredCategories: ('staple' | 'protein' | 'veg' | 'fruit')[],
  prefWeights: Record<string, number> = {},
  todayCovered: Set<string> = new Set(),
  todayIngredients: Set<string> = new Set()
): Recipe | null {
  const candidates = applicable.filter(r => !recentIds.slice(-5).includes(r.id))
  const pool = candidates.length > 0 ? candidates : applicable

  // 今日还缺的类别 = required 减去已覆盖的
  const stillNeeded = requiredCategories.filter(c => !todayCovered.has(c))
  // 主食必须出现（每餐都需要 carb）— 不被覆盖逻辑跳过
  const mustHave = new Set<string>(['staple'])

  const scored = pool.map(r => {
    let score = 0
    // 满足"今日还缺"的类别 → 高加分（鼓励补缺口）
    for (const cat of stillNeeded) {
      if (r.mealCategories.includes(cat)) score += 12
    }
    // 主食每餐都需要
    if (mustHave.has('staple') && r.mealCategories.includes('staple')) score += 8
    // 但如果今日已全覆盖（staple+protein+veg 都满足），这餐选啥都行 — 鼓励多样性
    if (stillNeeded.length === 0) {
      score += r.mealCategories.length * 3
    } else {
      // 还有缺口时，避免选已覆盖的"重复全餐"——降权
      const overlap = r.mealCategories.filter(c => todayCovered.has(c) && !stillNeeded.includes(c as any)).length
      score -= overlap * 2
    }
    // 跨餐食材去重：若食材跟今日其他餐重复，重罚
    const ingredientOverlap = r.ingredients.filter(i => todayIngredients.has(i.name)).length
    score -= ingredientOverlap * 6
    // 偏好权重
    score += (prefWeights[r.id] || 0)
    // 随机扰动避免每天同食谱
    score += Math.random() * 4
    return { r, score }
  }).sort((a, b) => b.score - a.score)

  return scored[0]?.r || null
}

export function generateWeeklyPlan(profile: BabyProfile, days: number = 7, startDate?: Date): DailyPlan[] {
  const start = startDate || new Date()
  const applicable = getApplicableRecipes(profile)

  if (applicable.length === 0) return []

  const tryingFood = getTryingFood(profile)
  const recipesWithTrying = tryingFood
    ? applicable.filter(r => r.ingredients.some(i => i.name === tryingFood))
    : []

  // 基于 tryingStartDate + 动态 daysRequired 算每天 isTryingDay
  // 覆盖"明天开始排敏"的场景（startDate > today）
  // 关键: tryingDaysRequired 必须 += replacedCount, 否则替换延期后 plan 第 N 天不塞 trying menu (getTryingProgress 同算法)
  let tryingStartTs = 0
  let tryingDaysRequired = TRYING_DAYS_REQUIRED
  if (tryingFood) {
    for (const cat of Object.values(profile.categoryAllergies)) {
      if (cat.state === 'trying' && cat.tryingFood === tryingFood && cat.tryingStartDate) {
        tryingStartTs = parseLocalDate(cat.tryingStartDate)
        const replacedCount = (cat.tryingReplacedDates || []).length
        tryingDaysRequired = getTryingDaysFor(cat) + replacedCount
        break
      }
    }
  }

  const recentRecipeIds: string[] = []
  const plan: DailyPlan[] = []
  const ironCountByWeek: Record<string, number> = {}
  const dhaCountByWeek: Record<string, number> = {}
  const organCountByWeek: Record<string, number> = {}
  const ORGAN_LIMIT_PER_WEEK = 1
  const prefWeights = getPreferenceWeights()

  for (let d = 0; d < days; d++) {
    const date = new Date(start)
    date.setDate(start.getDate() + d)
    const dateStr = formatDate(date)
    const weekKey = `${Math.floor(d / 7)}`
    if (!ironCountByWeek[weekKey]) ironCountByWeek[weekKey] = 0
    if (!dhaCountByWeek[weekKey]) dhaCountByWeek[weekKey] = 0
    if (!organCountByWeek[weekKey]) organCountByWeek[weekKey] = 0

    // d 这天距离 tryingStartDate 的天数，∈[0, TRYING_DAYS_REQUIRED) 视为排敏天
    const dayOffset = tryingStartTs > 0
      ? Math.round((parseLocalDate(dateStr) - tryingStartTs) / 86400000)
      : -1
    const isTryingDay = !!tryingFood && dayOffset >= 0 && dayOffset < tryingDaysRequired
    const meals: PlannedMeal[] = []
    let tryingPlacedToday = false
    // 今日已覆盖的类别 + 已用食材（跨餐均衡基础）
    const todayCovered = new Set<string>()
    const todayIngredients = new Set<string>()

    // 按月龄取营养规则（WHO + 中营养会 + AAP），不再写死阈值
    const nutritionRule = getNutritionRule(profile.ageMonths)

    for (let m = 0; m < profile.mealsPerDay; m++) {
      // required 来自营养规则，扩成 planner pickByCoverage 接受的类型
      const required: ('staple' | 'protein' | 'veg' | 'fruit')[] = [...nutritionRule.required]
      // 每周维度补充：铁/DHA 不够时强行加 protein 权重
      if (ironCountByWeek[weekKey] < nutritionRule.ironRichPerWeek - 3) required.push('protein')
      if (dhaCountByWeek[weekKey] < nutritionRule.dhaSourcesPerWeek) required.push('protein')

      let basePool = applicable
      if (organCountByWeek[weekKey] >= ORGAN_LIMIT_PER_WEEK) {
        basePool = basePool.filter(r => !r.nutritionTags.some(t => t === '内脏'))
      }

      let pool = basePool
      // 排敏餐默认放第一餐: 给一整天的反应观察窗口, 而非最后一餐 (反应可能要凌晨才出现, 不利于回溯)
      if (isTryingDay && !tryingPlacedToday && m === 0 && recipesWithTrying.length > 0) {
        pool = recipesWithTrying
      } else if (isTryingDay && !tryingPlacedToday && m === profile.mealsPerDay - 1 && recipesWithTrying.length > 0) {
        // 兜底: 万一第一餐 pickByCoverage 没选中含 trying 的菜, 最后一餐强塞
        pool = recipesWithTrying
      } else if (isTryingDay && tryingPlacedToday && tryingFood) {
        // 排敏天 + trying 已经放过: 其他餐主动避开 trying food
        // (1 顿足够建立观察窗口, 多顿含同食物反而拉高反应风险且不利于变量隔离)
        const withoutTrying = pool.filter(r => !r.ingredients.some(i => i.name === tryingFood))
        if (withoutTrying.length > 0) pool = withoutTrying
      }

      // 硬约束：按营养规则的 required，每餐必须全覆盖（除非排敏中放宽）
      // 排敏天允许引入新食物（可能是 protein-only 等单类），不强制满足全 required
      if (!isTryingDay) {
        const eligible = pool.filter(r => meetsRequired(r.mealCategories, nutritionRule))
        // 池子足够时启用硬约束；不够时回退到原 pool（避免空菜单）
        if (eligible.length >= 3) {
          pool = eligible
        }
      }

      const pick = pickByCoverage(pool, recentRecipeIds, required, prefWeights, todayCovered, todayIngredients)
      if (!pick) continue

      recentRecipeIds.push(pick.id)
      // 累计今日覆盖
      pick.mealCategories.forEach(c => todayCovered.add(c))
      pick.ingredients.forEach(i => todayIngredients.add(i.name))
      if (pick.nutritionTags.some(t => t === '铁')) ironCountByWeek[weekKey]++
      if (pick.nutritionTags.some(t => t === 'DHA')) dhaCountByWeek[weekKey]++
      if (pick.nutritionTags.some(t => t === '内脏')) organCountByWeek[weekKey]++
      if (tryingFood && pick.ingredients.some(i => i.name === tryingFood)) {
        tryingPlacedToday = true
      }

      meals.push({ date: dateStr, mealIndex: m, recipe: pick })
    }

    plan.push({ date: dateStr, meals })
  }

  return plan
}

/**
 * 替换单餐时考虑：
 *   - 月龄营养规则（getNutritionRule）→ 替换后仍满足每餐 required 三类
 *   - 当日其他餐次已覆盖的类别 / 食材 → 跨餐均衡（不重复，互补缺口）
 *   - 排敏中食物 → 不替换掉唯一含 tryingFood 的餐（除非用户明确确认）
 * 这是 index.ts/plan.ts 的 replaceMeal 统一调用入口。
 */
export function pickReplacement(
  profile: BabyProfile,
  dayPlan: DailyPlan,
  mealIdx: number
): Recipe | null {
  const applicable = getApplicableRecipes(profile)
  const oldRecipe = dayPlan.meals[mealIdx].recipe
  const candidates = applicable.filter(r => r.id !== oldRecipe.id)
  if (candidates.length === 0) return null

  // 当日其他餐次（不含本餐）的累计 covered/ingredients
  const otherCovered = new Set<string>()
  const otherIngredients = new Set<string>()
  for (let i = 0; i < dayPlan.meals.length; i++) {
    if (i === mealIdx) continue
    const m = dayPlan.meals[i]
    m.recipe.mealCategories.forEach(c => otherCovered.add(c))
    m.recipe.ingredients.forEach(ing => otherIngredients.add(ing.name))
  }

  // 月龄规则
  const rule = getNutritionRule(profile.ageMonths)
  const tryingFood = getTryingFood(profile)
  const isTryingDay = !!tryingFood
  const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood))

  // 硬约束：满足规则 required 的候选
  let pool = candidates
  if (!isTryingDay) {
    const eligible = pool.filter(r => meetsRequired(r.mealCategories, rule))
    if (eligible.length >= 3) pool = eligible
  }

  // 排敏期 pool 调整 (避免"全天都吃 trying food"):
  //   - 旧菜含 trying → 候选必须含 trying (维持排敏天合格)
  //   - 旧菜不含 trying → 候选也排除 trying (1 天 1 顿足够, 多了反而拉高反应风险)
  if (tryingFood) {
    if (oldUsesTrying) {
      const tryingPool = pool.filter(r => r.ingredients.some(i => i.name === tryingFood))
      if (tryingPool.length > 0) pool = tryingPool
    } else {
      const withoutTrying = pool.filter(r => !r.ingredients.some(i => i.name === tryingFood))
      if (withoutTrying.length > 0) pool = withoutTrying
    }
  }

  // required 扩展：当日缺口优先 — 把"其他餐还没覆盖的 required 类别"作为优先选
  const required: ('staple' | 'protein' | 'veg' | 'fruit')[] = [...rule.required]

  // pickByCoverage 用空 recentIds（替换场景不去重最近 5 餐，让选择面更宽）
  return pickByCoverage(pool, [], required, getPreferenceWeights(), otherCovered, otherIngredients)
}

export interface ReplacementReason {
  icon: string  // ✅ / ⚠ / 🧊 等
  text: string
}

export interface ReplacementCandidate {
  recipe: Recipe
  reason: string                     // 单行短语 (向后兼容)
  reasons: ReplacementReason[]       // 多行 ✅ 推荐理由 (新设计 hero 卡用)
  prepTime: number                   // 预计时间(分钟)
  inFridgeAll: boolean               // 食材是否全在冰箱
  inFridgeCount: number              // 冰箱命中数
  warnings: Taboo[]
}

/** 替换餐次的 top N 候选 + 推荐理由（首页/计划页"换一个" sheet 用） */
/** excludeIds: "再换一批"传入上次显示过的 id 列表, 优先返回新候选; 不够时再降级 */
export function pickReplacementCandidates(
  profile: BabyProfile,
  dayPlan: DailyPlan,
  mealIdx: number,
  topN: number = 3,
  fridgeNames?: Set<string>,
  excludeIds?: string[]
): ReplacementCandidate[] {
  const applicable = getApplicableRecipes(profile)
  const oldRecipe = dayPlan.meals[mealIdx].recipe
  let candidates = applicable.filter(r => r.id !== oldRecipe.id)
  if (candidates.length === 0) return []
  // 先 exclude 上次显示过的, 池子不够 topN 时再放回(避免再换一批一直无结果)
  if (excludeIds && excludeIds.length > 0) {
    const fresh = candidates.filter(r => !excludeIds.includes(r.id))
    if (fresh.length >= topN) candidates = fresh
  }

  const otherCovered = new Set<string>()
  const otherIngredients = new Set<string>()
  for (let i = 0; i < dayPlan.meals.length; i++) {
    if (i === mealIdx) continue
    const m = dayPlan.meals[i]
    m.recipe.mealCategories.forEach(c => otherCovered.add(c))
    m.recipe.ingredients.forEach(ing => otherIngredients.add(ing.name))
  }

  const rule = getNutritionRule(profile.ageMonths)
  const tryingFood = getTryingFood(profile)
  const isTryingDay = !!tryingFood

  let pool = candidates
  if (!isTryingDay) {
    const eligible = pool.filter(r => meetsRequired(r.mealCategories, rule))
    if (eligible.length >= topN) pool = eligible
  }

  const required: ('staple' | 'protein' | 'veg' | 'fruit')[] = [...rule.required]
  const stillNeeded = required.filter(c => !otherCovered.has(c))

  const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood))
  // 排敏期硬约束: 旧菜含 trying → 候选必须含 trying; 旧菜不含 trying → 候选排除 trying
  // (避免"换菜全是牛肉"或"换掉牛肉就再也回不去")
  if (isTryingDay && tryingFood) {
    if (oldUsesTrying) {
      const tryingOnly = pool.filter(r => r.ingredients.some(i => i.name === tryingFood))
      if (tryingOnly.length >= 1) pool = tryingOnly
    } else {
      const withoutTrying = pool.filter(r => !r.ingredients.some(i => i.name === tryingFood))
      if (withoutTrying.length >= 1) pool = withoutTrying
    }
  }
  const scored = pool.map(r => {
    let score = 0
    for (const cat of stillNeeded) {
      if (r.mealCategories.includes(cat)) score += 12
    }
    if (r.mealCategories.includes('staple')) score += 8
    if (stillNeeded.length === 0) {
      score += r.mealCategories.length * 3
    } else {
      const overlap = r.mealCategories.filter(c => otherCovered.has(c) && !stillNeeded.includes(c as any)).length
      score -= overlap * 2
    }
    const ingredientOverlap = r.ingredients.filter(i => otherIngredients.has(i.name)).length
    score -= ingredientOverlap * 6
    if (fridgeNames) {
      const fromFridge = r.ingredients.filter(i => fridgeNames!.has(i.name)).length
      score += fromFridge * 4
    }
    // 排敏期: 含 trying food 的候选优先(让用户看到该食材的更多搭配方案)
    // oldRecipe 本身含 trying → 强 boost(替换后维持当天排敏,避免延期)
    // oldRecipe 不含 trying → 弱 boost(让用户看到候选里有含 trying 的, 但不强制)
    const isTryingMeal = !!(tryingFood && r.ingredients.some(i => i.name === tryingFood))
    if (isTryingDay && isTryingMeal) {
      score += oldUsesTrying ? 50 : 28
    }
    score += Math.random() * 3 // 小扰动支撑「再换一批」
    return { r, score }
  }).sort((a, b) => b.score - a.score)

  // 算"最近 3 天用过的 recipe id" (用于"最近未重复"理由)
  const recentIds = new Set<string>()
  try {
    const allPlans: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const today = new Date()
    const cutoff = formatDate(new Date(today.getTime() - 3 * 86400000))
    const todayStr = formatDate(today)
    for (const day of allPlans) {
      if (day.date >= cutoff && day.date <= todayStr) {
        for (const m of day.meals) recentIds.add(m.recipe.id)
      }
    }
  } catch (_e) {}

  return scored.slice(0, topN).map(({ r }) => {
    const inFridgeIngredients = fridgeNames
      ? r.ingredients.filter(i => fridgeNames.has(i.name))
      : []
    const inFridgeCount = inFridgeIngredients.length
    const inFridgeAll = !!fridgeNames && r.ingredients.length > 0 && inFridgeCount === r.ingredients.length
    return {
      recipe: r,
      reason: genReplacementReason(r, stillNeeded, fridgeNames, otherIngredients),
      reasons: genReplacementReasons(r, stillNeeded, fridgeNames, otherIngredients, recentIds, tryingFood),
      prepTime: r.prepTimeMinutes,
      inFridgeAll,
      inFridgeCount,
      warnings: tryingFood ? getRecipeTabooWarnings(r, tryingFood) : []
    }
  })
}

// 多行 ✅ 推荐理由 (hero 卡用), 跟 genReplacementReason 互补: 那个返回单行短语, 这个返回完整 facets
function genReplacementReasons(
  recipe: Recipe,
  stillNeeded: string[],
  fridgeNames: Set<string> | undefined,
  otherIngredients: Set<string>,
  recentIds: Set<string>,
  tryingFood: string | null
): ReplacementReason[] {
  const out: ReplacementReason[] = []
  const catLabel: Record<string, string> = { staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果' }

  if (fridgeNames) {
    const inFridge = recipe.ingredients.filter(i => fridgeNames.has(i.name))
    if (recipe.ingredients.length > 0 && inFridge.length === recipe.ingredients.length) {
      out.push({ icon: '✅', text: '冰箱已有全部食材' })
    } else if (inFridge.length > 0) {
      out.push({ icon: '✅', text: `冰箱已有 ${inFridge.length} 种食材` })
    }
  }

  const fills = recipe.mealCategories.filter(c => stillNeeded.includes(c))
  if (fills.length > 0) {
    out.push({ icon: '✅', text: `补今日缺的${fills.map(c => catLabel[c] || c).join('+')}` })
  }

  const ingredientOverlap = recipe.ingredients.filter(i => otherIngredients.has(i.name)).length
  if (ingredientOverlap === 0 && recipe.ingredients.length > 0) {
    out.push({ icon: '✅', text: '与其他餐不重复' })
  }

  if (recipe.id && !recentIds.has(recipe.id)) {
    out.push({ icon: '✅', text: '最近 3 天未重复' })
  }

  // 排敏期: 不含 trying food → "非新食材, 更稳妥"
  if (tryingFood && !recipe.ingredients.some(i => i.name === tryingFood)) {
    out.push({ icon: '✅', text: '非新食材，更稳妥' })
  }

  return out
}

function genReplacementReason(
  recipe: Recipe,
  stillNeeded: string[],
  fridgeNames?: Set<string>,
  _otherIngredients?: Set<string>
): string {
  const catLabel: Record<string, string> = { staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果' }
  // 1. 补今日缺口（信号最强）
  const fills = recipe.mealCategories.filter(c => stillNeeded.includes(c))
  if (fills.length > 0) {
    return `💡 补${fills.map(c => catLabel[c] || c).join('+')}`
  }
  // 2. 用冰箱
  if (fridgeNames) {
    const used = recipe.ingredients.map(i => i.name).filter(n => fridgeNames.has(n))
    if (used.length > 0) return `🧊 用冰箱里的${used[0]}`
  }
  // 3. 营养 tag
  const goodTags = recipe.nutritionTags.filter(t => ['DHA', '铁', '钙', '蛋白'].includes(t))
  if (goodTags.length > 0) return `🥗 补${goodTags[0]}`
  // 4. fallback
  return '🍽 搭配均衡'
}

export function regenerateFromToday(profile: BabyProfile, existingPlan: DailyPlan[]): DailyPlan[] {
  const today = formatDate(new Date())
  const past = existingPlan.filter(p => p.date < today)
  const todayAndFuture = existingPlan.filter(p => p.date >= today)
  const days = todayAndFuture.length || 7

  const startDate = todayAndFuture.length > 0 ? new Date(todayAndFuture[0].date) : new Date()
  const newFuturePlan = generateWeeklyPlan(profile, days, startDate)
  return [...past, ...newFuturePlan]
}

// 「调整明日」专用: 今天及之前的 plan 完全不动 (含未喂的餐), 只重新生成明天及之后
export function regenerateTomorrowOnward(profile: BabyProfile, existingPlan: DailyPlan[]): DailyPlan[] {
  const today = formatDate(new Date())
  const tomorrowMs = parseLocalDate(today) + 86400000
  const tomorrow = formatDate(new Date(tomorrowMs))
  const keep = existingPlan.filter(p => p.date <= today)
  const oldFuture = existingPlan.filter(p => p.date >= tomorrow)
  const futureDays = oldFuture.length || 6

  const newFuture = generateWeeklyPlan(profile, futureDays, new Date(tomorrowMs))

  // 保留旧 future plan 里的 trialIngredient 标记 (按 date+mealIndex 匹配)
  for (const oldDay of oldFuture) {
    const newDay = newFuture.find(p => p.date === oldDay.date)
    if (!newDay) continue
    for (const oldMeal of oldDay.meals) {
      if (!oldMeal.trialIngredient) continue
      const newMeal = newDay.meals[oldMeal.mealIndex]
      if (newMeal && !newMeal.trialIngredient) {
        newMeal.trialIngredient = oldMeal.trialIngredient
        newMeal.trialMethod = oldMeal.trialMethod
      }
    }
  }

  return [...keep, ...newFuture]
}

// 重新生成 plan，但今日已经 logged 的餐保留原食谱不被替换
export function regenerateKeepingLoggedToday(profile: BabyProfile, existingPlan: DailyPlan[]): DailyPlan[] {
  const today = formatDate(new Date())
  const journal: any[] = wx.getStorageSync('mealJournal') || []
  const loggedIdx = new Set(journal.filter(l => l.date === today).map(l => l.mealIndex))

  const oldTodayPlan = existingPlan.find(p => p.date === today)
  const newPlan = regenerateFromToday(profile, existingPlan)
  const todayIdx = newPlan.findIndex(p => p.date === today)

  // 还原 logged 餐
  if (oldTodayPlan && loggedIdx.size > 0 && todayIdx >= 0) {
    newPlan[todayIdx].meals = newPlan[todayIdx].meals.map((newMeal, i) => {
      const oldMeal = oldTodayPlan.meals[i]
      if (oldMeal && loggedIdx.has(oldMeal.mealIndex)) {
        return oldMeal
      }
      return newMeal
    })
  }

  // 保留旧 plan 里所有 trialIngredient 标记(按 date+mealIndex 匹配回新 plan)
  for (const oldDay of existingPlan) {
    const newDay = newPlan.find(p => p.date === oldDay.date)
    if (!newDay) continue
    for (const oldMeal of oldDay.meals) {
      if (!oldMeal.trialIngredient) continue
      const newMeal = newDay.meals[oldMeal.mealIndex]
      if (newMeal && !newMeal.trialIngredient) {
        newMeal.trialIngredient = oldMeal.trialIngredient
        newMeal.trialMethod = oldMeal.trialMethod
      }
    }
  }

  // 一致性检查：trying food 必须落到今日某餐（generateWeeklyPlan 强塞最后一餐，
  // 但若最后一餐已 logged 被还原 → trying food 就丢了，此时挪到第一个未 logged 餐）
  if (todayIdx >= 0) {
    const tryingFood = getTryingFood(profile)
    if (tryingFood) {
      const meals = newPlan[todayIdx].meals
      const hasIt = meals.some(m => m.recipe.ingredients.some(i => i.name === tryingFood))
      if (!hasIt) {
        const applicable = getApplicableRecipes(profile)
        const candidates = applicable.filter(r => r.ingredients.some(i => i.name === tryingFood))
        if (candidates.length > 0) {
          for (let i = 0; i < meals.length; i++) {
            if (!loggedIdx.has(meals[i].mealIndex)) {
              meals[i] = { ...meals[i], recipe: candidates[Math.floor(Math.random() * candidates.length)] }
              break
            }
          }
        }
      }
    }
  }

  return newPlan
}

export function formatDate(d: Date): string {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function getWeekday(dateStr: string): string {
  // new Date('YYYY-MM-DD') 走 UTC, 北京 +8 区可能偏 1 天 (UTC 0:00 == 本地 8:00, 周几没问题; 但 23:00 等极端时段会偏)
  // 用本地零点保证一致
  const parts = dateStr.slice(0, 10).split('-').map(Number)
  if (parts.length === 3 && !parts.some(isNaN)) {
    const d = new Date(parts[0], parts[1] - 1, parts[2])
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  }
  const d = new Date(dateStr)
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

export interface NextRecommendation {
  categoryId: string
  category: string
  reason: string
  suggestedFoods: string[]
  firstFood: string
  mode: 'newCategory' | 'newFoodInOpenCategory'
  daysRequired: number
}

export function getNextRecommendation(profile: BabyProfile): NextRecommendation[] {
  if (profile.currentStatus === 'postVaccine') return []
  if (hasActiveGutReaction()) return []
  if (getCurrentTryingCategoryId(profile)) {
    return []
  }

  const confirmed = profile.confirmedFoods || []
  const recommendations: (NextRecommendation & { priority: number })[] = []

  // 第一类：未引入的品类（跨品类排敏，3 天）
  for (const cat of CATEGORIES) {
    const status = profile.categoryAllergies[cat.id]
    if (!status || status.state !== 'untried') continue
    if (cat.recommendedMonth > profile.ageMonths) continue
    if (cat.representatives.length === 0) continue

    let priority = 100 - cat.recommendedMonth
    if (cat.riskLevel === 'low') priority += 10
    if (cat.commonAllergen) priority += 8

    let reason = `${cat.name}建议${cat.recommendedMonth}月+引入`
    if (cat.commonAllergen) reason += '，属于常见过敏原，一次只引入一种'

    recommendations.push({
      categoryId: cat.id,
      category: cat.name,
      reason,
      suggestedFoods: getPrimaryMembers(cat.id),
      firstFood: cat.representatives[0] || getPrimaryMembers(cat.id)[0],
      mode: 'newCategory',
      daysRequired: TRYING_DAYS_REQUIRED,
      priority
    })
  }

  // 第二类：已开放分组内还有未确认食材；分类仅用于导航，仍逐种观察 3 天。
  for (const cat of CATEGORIES) {
    if (cat.noAllergyTracking) continue
    const status = profile.categoryAllergies[cat.id]
    if (!status || status.state !== 'open') continue
    // 只推 primary：同源变体（鸡肝/排骨…）跟随主食材，不重复推荐。
    const unconfirmed = getPrimaryMembers(cat.id).filter(m => !confirmed.includes(m) && m !== status.representative)
    if (unconfirmed.length === 0) continue

    // 优先级低于跨品类（已开品类的扩展，没那么紧迫）
    let priority = 50 - cat.recommendedMonth
    if (cat.riskLevel === 'low') priority += 5

    recommendations.push({
      categoryId: cat.id,
      category: cat.name,
      reason: `已通过${status.representative || '某成员'}，下一种食物仍需单独观察`,
      suggestedFoods: unconfirmed,
      firstFood: unconfirmed[0],
      mode: 'newFoodInOpenCategory',
      daysRequired: TRYING_DAYS_INCATEGORY,
      priority
    })
  }

  return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 5)
    .map(({ priority, ...rest }) => rest)
}

export function aggregateShoppingList(plan: DailyPlan[]): { name: string; portions: number }[] {
  const map: Record<string, number> = {}
  for (const day of plan) {
    for (const meal of day.meals) {
      for (const ing of meal.recipe.ingredients) {
        map[ing.name] = (map[ing.name] || 0) + ing.portions
      }
    }
  }
  return Object.entries(map).map(([name, portions]) => ({ name, portions }))
}

export function aggregateShoppingListForFutureDays(plan: DailyPlan[], days: number): { name: string; portions: number }[] {
  const today = formatDate(new Date())
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + days)
  const targetStr = formatDate(targetDate)

  // 今天已 logged 的餐次: 库存在 checkin 时已扣过, 不应再算进采购需求
  const journal: any[] = wx.getStorageSync('mealJournal') || []
  const todayLoggedIdx = new Set<number>(
    journal.filter((l: any) => l.date === today).map((l: any) => l.mealIndex)
  )

  const map: Record<string, number> = {}
  for (const day of plan) {
    if (day.date < today || day.date >= targetStr) continue
    for (const meal of day.meals) {
      if (day.date === today && todayLoggedIdx.has(meal.mealIndex)) continue
      for (const ing of meal.recipe.ingredients) {
        map[ing.name] = (map[ing.name] || 0) + ing.portions
      }
    }
  }
  return Object.entries(map).map(([name, portions]) => ({ name, portions }))
}
