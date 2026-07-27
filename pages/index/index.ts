import { generateWeeklyPlan, regenerateFromToday, regenerateKeepingLoggedToday, regenerateTomorrowOnward, getNextRecommendation, formatDate, calcAgeMonths, BabyProfile, DailyPlan, getTryingProgress, getTryingScheduledStart, getCurrentTryingCategoryId, checkTryingComplete, completeTrying, abortTrying, diagnoseEmptyPlan, hasActiveGutReaction, hasActiveConstipation, getApplicableRecipes, getTryingFood, recordTryingReplaced, reconcileTryingReplaced, reconcileExceptions, pickReplacement, pickReplacementCandidates, startTryingForFood, suggestTrialSlot, getFirstTryMethod, attachTrialIngredient, clearTrialIngredient } from '../../utils/planner'
import { Recipe } from '../../data/recipes'
import { getFridge } from '../../utils/storage'
import { getNearExpiry, FridgeItem } from '../../utils/storage'
import { getIngredient } from '../../data/ingredients'
import { getMealLog, logMeal, setPreference, PREFERENCE_LABEL, PREFERENCE_EMOJI, PORTION_LABEL, PORTION_EMOJI, Preference, Portion, combineTime, getJournal, getMealTime } from '../../utils/journal'
import { getCategoryByFood, getParentFood } from '../../data/categories'
import { checkinMeal, uncheckinMeal } from '../../utils/checkin'
import { getReactions, setReactions, REACTION_TYPE_LABEL, SEVERITY_LABEL, ReactionLog } from '../../utils/reactions'
import { getDueRetryFoods, recordRetry, checkIntroducingComplete, completeIntroducing } from '../../utils/observation'
import { parseLocalDateMs, todayLocalStartMs, todayLocalStr, formatLocalDate, daysSinceDateStr } from '../../utils/dateUtil'

const POST_VACCINE_DAYS = 3
const RECENT_REACTION_HOURS = 24

// 与 review/profile 对齐: 启动排敏后让 weeklyPlan 把 trying food 排进菜单
function syncPlanForTrying(profile: BabyProfile) {
  const existingPlan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
  if (existingPlan.length > 0) {
    const newPlan = regenerateKeepingLoggedToday(profile, existingPlan)
    wx.setStorageSync('weeklyPlan', newPlan)
  }
}

// 找出 ingredients 里"可以启动排敏"的新食材 (与 review 同款)
function detectNewFoodsForTrying(profile: BabyProfile, ingredients: string[]): string[] {
  const confirmed = new Set(profile.confirmedFoods || [])
  const result: string[] = []
  const seen = new Set<string>()
  for (const ing of ingredients) {
    if (seen.has(ing)) continue
    seen.add(ing)
    if (confirmed.has(ing)) continue
    const ex = profile.individualExceptions[ing]
    if (ex) continue
    // 同源变体（鸡肝 → 鸡胸肉）：主食材已通过就不该再弹"要为鸡肝排敏吗"
    const parent = getParentFood(ing)
    if (parent && confirmed.has(parent)) continue
    const cat = getCategoryByFood(ing)
    if (!cat) continue
    const catState = profile.categoryAllergies[cat.id]
    if (catState?.state === 'trying') continue
    if (catState?.state === 'open' && catState.tryingFood === ing) continue
    result.push(ing)
  }
  return result
}

// 写入前先 snapshot 排敏进度, 用于 checkin/补记后告诉用户进度涨没涨
function snapshotTryingProgress(): ReturnType<typeof getTryingProgress> {
  const p: BabyProfile = wx.getStorageSync('babyProfile')
  return p ? getTryingProgress(p) : null
}

// 写入后比对 before, 如果 dayIndex 涨了或 daysRequired 减少了 (漏记被补 → replaced 清), 给带进度的 toast
// 否则按 default 显示原 toast
function toastWithTryingDelta(before: ReturnType<typeof getTryingProgress>, defaultTitle: string, defaultDuration = 800) {
  const p: BabyProfile = wx.getStorageSync('babyProfile')
  if (p && reconcileTryingReplaced(p)) {
    wx.setStorageSync('babyProfile', p)
  }
  const after = p ? getTryingProgress(p) : null
  let note = ''
  if (after && before && after.food === before.food) {
    if (after.dayIndex > before.dayIndex || before.daysRequired > after.daysRequired) {
      note = ` · 第 ${after.dayIndex}/${after.daysRequired} 天`
    }
  }
  wx.showToast({
    title: defaultTitle + note,
    icon: note ? 'none' : 'success',
    duration: note ? 1800 : defaultDuration
  })
}

type AdviceAction =
  | 'startTrying'
  | 'viewReactions'
  | 'endProtection'
  | 'confirmTrying'
  | 'abortTrying'
  | 'viewTomorrow'

const STAPLE_NAMES = new Set(['大米', '小米', '面条', '米粉', '燕麦', '麦片'])

const INGREDIENT_EMOJI: Record<string, string> = {
  '猪肉': '🥩', '牛肉': '🥩', '羊肉': '🥩',
  '鸡肉': '🍗', '鸡胸肉': '🍗', '鸭肉': '🍗',
  '鱼肉': '🐟', '三文鱼': '🐟', '鳕鱼': '🐟', '虾': '🦐',
  '鸡蛋': '🥚', '蛋黄': '🥚',
  '猪肝': '🫀', '鸡肝': '🫀',
  '胡萝卜': '🥕',
  '菠菜': '🥬', '娃娃菜': '🥬', '白菜': '🥬', '油菜': '🥬', '生菜': '🥬', '青菜': '🥬',
  '西兰花': '🥦', '芥蓝': '🥦',
  '南瓜': '🎃', '红薯': '🍠', '土豆': '🥔', '山药': '🥔',
  '苹果': '🍎', '香蕉': '🍌', '梨': '🍐', '蓝莓': '🫐', '草莓': '🍓', '橙子': '🍊',
  '大米': '🍚', '小米': '🌾', '面条': '🍜', '米粉': '🍚',
  '豆腐': '🟦', '酸奶': '🥛', '奶酪': '🧀'
}

function emojiFor(name: string): string {
  return INGREDIENT_EMOJI[name] || '🍽️'
}

function pickMainIngredient(ingredients: { name: string }[]): { name: string; emoji: string } {
  const main = ingredients.find(i => !STAPLE_NAMES.has(i.name)) || ingredients[0]
  return { name: main.name, emoji: emojiFor(main.name) }
}

function daysSincePurchase(item: FridgeItem): number {
  if (!item.purchaseDate) return 0
  const diff = (todayLocalStartMs() - parseLocalDateMs(item.purchaseDate)) / 86400000
  return Math.max(0, Math.floor(diff))
}

function daysUntilExpiry(item: FridgeItem): number {
  if (!item.expiryDate) return 0
  const diff = (parseLocalDateMs(item.expiryDate) - todayLocalStartMs()) / 86400000
  return Math.max(0, Math.floor(diff))
}

function rebuildPlan(profile: BabyProfile) {
  const existing: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
  const newPlan = regenerateKeepingLoggedToday(profile, existing)
  wx.setStorageSync('weeklyPlan', newPlan)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

Page({
  data: {
    babyName: '',
    birthday: '',
    today: '',
    ageMonths: 0,
    mealsPerDay: 0,
    editing: { name: false },
    todayDateLabel: '',
    tomorrowDateLabel: '',
    todayMeals: [] as any[],
    tomorrowMeals: [] as any[],
    todayCompleted: 0,
    todayProgressPct: 0,
    statusBarHeight: 0,
    navBarHeight: 88,
    tomorrowExpanded: false,
    tomorrowSummary: '',
    statusSheetVisible: false,
    currentStatus: 'normal' as string,
    statusVaccineHint: '',
    statusReactionBanner: '' as string,  // 反应未消退 → status sheet 顶部引导文案
    pills: [] as { label: string; kind: string }[],
    reactionCard: null as null | { count: number; latestNote: string; latestTime: string },
    reactionPromo: null as null | { title: string; desc: string },
    todayReactionEntry: '' as string,
    mealsTipText: '' as string,
    todayAdvice: null as null | {
      title: string
      desc: string
      chips: { icon: string; text: string }[]
      ctaPrimary: null | { label: string; action: AdviceAction; catId?: string; food?: string; daysRequired?: number }
      ctaSecondary: null | { label: string; action: AdviceAction }
      moreRecsCount?: number  // 推荐态：除 top1 还有几条可选
    },
    moreRecsSheetOpen: false,
    moreRecsList: [] as Array<{ catId: string; food: string; category: string; reason: string; daysRequired: number; isInCategory: boolean }>,
    tomorrowPrepText: '' as string,
    emptyDiagnosis: null as null | { reason: string; action: string; actionType: string },
    recommendations: [] as any[],
    recExpanded: false,
    recentReactions: 0,
    dueRetry: [] as { name: string; daysObs: number }[],
    trying: null as null | { food: string; categoryId: string; dayIndex: number; daysRequired: number; replacedCount: number },

    // 补一餐 sheet (与回顾页 manualSheet 同款, 内联避免 tab 跳变)
    manualOpen: false,
    manualIsEditing: false,
    manualEditDate: '',
    manualEditMealIndex: -1,
    manualDate: '',
    manualTime: '',
    manualDishName: '',
    manualIngChips: [] as string[],
    manualIngInput: '',
    manualIngSuggestions: [] as string[],
    manualPortion: '' as '' | 'taste' | 'small' | 'half' | 'full',
    manualNote: '',
    todayStr: '',

    // 换餐 sheet
    replaceSheetOpen: false,
    replaceCandidates: [] as Array<{ id: string; name: string; reason: string; ingredientsText: string; mitigationText: string; reasons: Array<{icon: string; text: string}>; prepTime: number; inFridgeAll: boolean }>,
    replaceSwapTargets: [] as Array<{ idx: number; mealLabel: string; name: string }>,
    replaceAltsExpanded: false,
    replaceCtx: null as null | { day: string; date: string; idx: number; mealLabel: string; oldName: string },
    // 「记录吃了」实际记录 sheet
    actualSheetOpen: false,
    actualSheetCtx: null as null | { idx: number; mealLabel: string; planName: string; planIngredientsText: string; isEditing: boolean },
    actualTime: '',  // HH:mm picker value
    actualDetailsOpen: false,  // 「+ 实际有调整」折叠区,默认收起;编辑态自动展开
    actualDishName: '',
    actualIngredients: [] as string[],
    actualIngredientChips: [] as Array<{ name: string; selected: boolean }>,
    actualPortion: '' as '' | 'taste' | 'small' | 'half' | 'full',
    actualNote: ''
  },

  onLoad() {
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menu = wx.getMenuButtonBoundingClientRect()
      const statusBarHeight = sys.statusBarHeight || 20
      // nav 内容区高度 = 胶囊按钮中心对齐高度
      const navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height
      this.setData({ statusBarHeight, navBarHeight })
    } catch (e) {
      this.setData({ statusBarHeight: 20, navBarHeight: 44 })
    }
  },

  onShow() {
    const setupDone = wx.getStorageSync('setupDone')
    const profile = wx.getStorageSync('babyProfile')
    if (!setupDone || !profile) {
      wx.reLaunch({ url: '/pages/welcome/welcome' })
      return
    }
    this.refresh()
  },

  refresh() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return

    // 自愈: 清理 tryingReplacedDates 里那些"用户实际已吃过 trying food"的脏数据
    if (reconcileTryingReplaced(profile)) {
      wx.setStorageSync('babyProfile', profile)
    }
    // 自愈: 已通过排敏 (in confirmedFoods) 的食物仍残留个体观察期 → 清掉
    if (reconcileExceptions(profile)) {
      wx.setStorageSync('babyProfile', profile)
    }

    let ageMonths = profile.ageMonths
    if (profile.birthday) {
      ageMonths = calcAgeMonths(profile.birthday)
      if (ageMonths !== profile.ageMonths) {
        profile.ageMonths = ageMonths
        wx.setStorageSync('babyProfile', profile)
      }
    }

    if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
      const days = (todayLocalStartMs() - parseLocalDateMs(profile.statusSince)) / 86400000
      if (days >= POST_VACCINE_DAYS) {
        profile.currentStatus = 'normal'
        profile.statusSince = undefined
        wx.setStorageSync('babyProfile', profile)
        rebuildPlan(profile)
      }
    }

    const completed = checkTryingComplete(profile)
    if (completed) {
      const updated = completeTrying(profile, completed.categoryId)
      wx.setStorageSync('babyProfile', updated)
      rebuildPlan(updated)
      wx.showToast({ title: `${completed.food} 排敏完成,已加入安全清单`, icon: 'none', duration: 2200 })
    }

    const introduceDone = checkIntroducingComplete(profile)
    if (introduceDone.length > 0) {
      let p = profile
      for (const food of introduceDone) {
        p = completeIntroducing(p, food)
      }
      wx.setStorageSync('babyProfile', p)
      rebuildPlan(p)
      wx.showToast({ title: `${introduceDone.join('、')} 引入完成,已加入安全清单`, icon: 'none', duration: 2400 })
    }

    let plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    if (!plan || plan.length === 0) {
      plan = generateWeeklyPlan(profile, 7)
      wx.setStorageSync('weeklyPlan', plan)
    }

    const today = formatDate(new Date())
    const tomorrow = formatDate(new Date(Date.now() + 86400000))

    // 一致性自检：trying 中但应排敏的目标日菜单不含 trying food → 自动 rebuild
    // 进行中（dayIndex≥1）查今日；未开始（startDate>today）查明日
    // 例外：用户已主动替换过那天 / 那天已挂"加料"标 → 尊重用户选择, 不强 rebuild
    const tryingFoodCheck = getTryingFood(profile)
    if (tryingFoodCheck) {
      const progressCheck = getTryingProgress(profile)
      const scheduledCheck = getTryingScheduledStart(profile)
      const targetDate = progressCheck ? today : (scheduledCheck ? tomorrow : '')
      if (targetDate) {
        const targetPlan = plan.find(p => p.date === targetDate)
        if (targetPlan) {
          const journalCheck: any[] = wx.getStorageSync('mealJournal') || []
          const loggedIdxCheck = new Set(journalCheck.filter(l => l.date === targetDate).map(l => l.mealIndex))
          const hasIt = targetPlan.meals.some(m =>
            m.recipe.ingredients.some(i => i.name === tryingFoodCheck) ||
            m.trialIngredient === tryingFoodCheck
          )
          const hasUnlogged = targetPlan.meals.some(m => !loggedIdxCheck.has(m.mealIndex))
          const tryingCatId = getCurrentTryingCategoryId(profile)
          const replacedDates = tryingCatId ? (profile.categoryAllergies[tryingCatId]?.tryingReplacedDates || []) : []
          const userActivelyReplaced = replacedDates.includes(targetDate)
          if (!hasIt && hasUnlogged && !userActivelyReplaced) {
            rebuildPlan(profile)
            plan = wx.getStorageSync('weeklyPlan') || []
          }
        }
      }
    }

    const todayDay = plan.find(p => p.date === today)
    const tomorrowDay = plan.find(p => p.date === tomorrow)
    const tomorrowMealsRaw = tomorrowDay?.meals || []

    const allReactions = getReactions()
    const now = Date.now()
    // 已消退 (resolvedAt) 的反应不再驱动「需观察」状态; 标记消退后 pill / banner 自动清除
    const recentReactions24h = allReactions.filter(r =>
      !r.resolvedAt && now - new Date(r.occurredAt).getTime() < RECENT_REACTION_HOURS * 3600 * 1000
    )
    const reactions72h = allReactions.filter(r =>
      !r.resolvedAt && now - new Date(r.occurredAt).getTime() < 72 * 3600 * 1000
    )
    const todayReactions = allReactions.filter(r => !r.resolvedAt && r.occurredAt.slice(0, 10) === today)
    const reactionMealKeys = new Set<string>()
    for (const r of allReactions) {
      for (const tm of r.tracebackMeals) {
        reactionMealKeys.add(`${tm.date}-${tm.mealIndex}`)
      }
    }

    // 计划餐的顺序和编号必须稳定，不能因打卡时间变化。
    // 否则上午较晚记录第一餐时，会排到尚未记录、虚拟时间较早的第二餐之后。
    const todayMealsEnriched = (todayDay?.meals || []).slice()
      .sort((a, b) => a.mealIndex - b.mealIndex)
      .map(m => {
      const log = getMealLog(today, m.mealIndex)
      const pref = log?.preference
      const planName = m.recipe.name
      const planIngredientsText = m.recipe.ingredients.map(i => `${i.name}${i.portions}份`).join(' + ')

      // 卡片显示的菜名/食材按状态切换
      // 未喂: 显示 "计划：xxx" + 计划食材
      // 已喂(按计划): 显示计划菜名 + 计划食材
      // 已喂(自定义): 显示实际菜名(若有)或实际食材 + 实际食材列表 + 计划副信息
      let headlineName = ''
      let detailText = ''
      let planHint = ''
      if (!log) {
        headlineName = `计划：${planName}`
        detailText = planIngredientsText
      } else if (log.isCustom) {
        const ings = log.ingredients || []
        const MAX_DISPLAY = 4
        const visible = ings.slice(0, MAX_DISPLAY).join('、')
        const actualIngText = ings.length > MAX_DISPLAY
          ? `${visible} 等 ${ings.length} 种`
          : visible
        // headlineName fallback: 没菜名 + 食材也长时, 只显示前 2 种
        const headlineFallback = ings.length > 2
          ? `${ings.slice(0, 2).join('、')} 等 ${ings.length} 种`
          : visible
        headlineName = log.customDishName || headlineFallback || planName
        detailText = log.customDishName ? actualIngText : ''
        planHint = `计划：${planName}`
      } else {
        headlineName = planName
        detailText = planIngredientsText
      }

      const logPortion = log?.portion as Portion | undefined
      const portionLabel = logPortion ? `${PORTION_EMOJI[logPortion]} ${PORTION_LABEL[logPortion]}` : ''
      return {
        ...m,
        logged: !!log,
        linkedReaction: reactionMealKeys.has(`${today}-${m.mealIndex}`),
        ingredientsText: planIngredientsText,
        preference: pref || '',
        preferenceLabel: pref ? `${PREFERENCE_EMOJI[pref]} ${PREFERENCE_LABEL[pref]}` : '',
        portionLabel,
        isCustomLog: !!log?.isCustom,
        headlineName,
        detailText,
        planHint,
        displayOrder: m.mealIndex + 1
      }
    })

    const tomorrowMealsEnriched = tomorrowMealsRaw.map(m => {
      const main = pickMainIngredient(m.recipe.ingredients)
      return {
        ...m,
        ingredientsText: m.recipe.ingredients.map(i => i.name).join(' + '),
        mainEmoji: main.emoji,
        mainName: main.name
      }
    })
    const tomorrowSummary = tomorrowMealsEnriched.length > 0
      ? `${tomorrowMealsEnriched.length} 顿 · ${tomorrowMealsEnriched.map(m => m.recipe.name).join(' / ')}`
      : ''

    const todayCompleted = todayMealsEnriched.filter(m => m.logged).length
    const todayProgressPct = todayMealsEnriched.length > 0
      ? Math.round((todayCompleted / todayMealsEnriched.length) * 100)
      : 0

    const todayPrep = this.computePrepForDate(tomorrowMealsRaw)
    const nearExpiry = getNearExpiry(2)

    const recs = getNextRecommendation(profile).map(r => ({
      categoryId: r.categoryId,
      category: r.category,
      reason: r.reason,
      foods: r.suggestedFoods,
      firstFood: r.firstFood,
      mode: r.mode,
      daysRequired: r.daysRequired
    }))

    // Hero pills 多状态并存：needObs / gut / postVaccine / 默认 normal
    const pills: { label: string; kind: string }[] = []
    if (recentReactions24h.length > 0) {
      pills.push({ label: '⚠️ 需观察', kind: 'needObs' })
    }
    if (hasActiveGutReaction() && recentReactions24h.length === 0) {
      pills.push({ label: '🤒 肠胃恢复中', kind: 'gut' })
    }
    if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
      const daysIn = Math.floor((now - parseLocalDateMs(profile.statusSince)) / 86400000) + 1
      pills.push({ label: `🛡️ 疫苗后第${daysIn}天`, kind: 'postVaccine' })
    }
    if (pills.length === 0) {
      pills.push({ label: '✓ 正常', kind: 'normal' })
    }

    // status sheet banner: 如果当前是反应驱动状态(需观察/肠胃恢复中), 提示用户去回顾页处理
    let statusReactionBanner = ''
    if (recentReactions24h.length > 0) {
      statusReactionBanner = '当前是「需观察」——反应未消退导致的。在记录页标记反应已消退后会自动清除。'
    } else if (hasActiveGutReaction()) {
      statusReactionBanner = '当前是「肠胃恢复中」——肠胃反应未消退。在记录页标记反应已消退后会自动清除。'
    }

    // 不适记录卡 — 双形态：reactionCard(已记录) 优先，否则 reactionPromo(引流入口)
    let reactionCard: null | { count: number; latestNote: string; latestTime: string } = null
    let reactionPromo: null | { title: string; desc: string } = null
    let todayReactionEntry = ''
    let mealsTipText = ''
    if (reactions72h.length > 0) {
      // 严重度优先（severe > moderate > mild），相同时取最近发生
      const SEV_RANK: Record<string, number> = { severe: 3, moderate: 2, mild: 1 }
      const sorted = [...reactions72h].sort((a, b) =>
        (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0) ||
        b.occurredAt.localeCompare(a.occurredAt)
      )
      const top = sorted[0]
      const topDate = top.occurredAt.slice(0, 10)
      const tLabel = topDate === today ? formatTime(top.occurredAt) : `${topDate.slice(5)} ${formatTime(top.occurredAt)}`
      const sevLabel = SEVERITY_LABEL[top.severity]
      const typeLabel = REACTION_TYPE_LABEL[top.type]
      const note = top.note ? top.note : `${sevLabel}${typeLabel}`
      reactionCard = {
        count: reactions72h.length,
        latestNote: note,
        latestTime: tLabel
      }
      todayReactionEntry = `近72h已记录${reactions72h.length}次`
      mealsTipText = '已根据不适记录回溯近 72h 食材，建议继续观察后续反馈哦~'
    } else {
      reactionPromo = {
        title: '宝宝不舒服？立即记一笔',
        desc: '搭子回溯近72h喂养，揪出可疑食材'
      }
      // 未全完成时给 onboarding 提示；全部喂完则不显示
      if (todayCompleted < todayMealsEnriched.length) {
        mealsTipText = '喂完顺手点个「饭后反馈」，下次菜单更懂宝宝～'
      }
    }

    // 今日营养覆盖（基于今日 todayMeals 的 mealCategories 合集）
    const todayNutritionCovered = new Set<string>()
    for (const m of todayMealsEnriched) {
      if (m.recipe && (m.recipe as any).mealCategories) {
        (m.recipe as any).mealCategories.forEach((c: string) => todayNutritionCovered.add(c))
      }
    }
    const requiredNutri = ['staple', 'protein', 'veg']
    const labelMap: Record<string, string> = { staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果' }
    const missing = requiredNutri.filter(c => !todayNutritionCovered.has(c))

    // 今日建议卡 — 优先级：反应 > 疫苗 > 排敏中 > 推荐 > 全引入完毕
    const todayAdvice = this.computeTodayAdvice({
      profile,
      todayReactions,
      recentReactions24h,
      recs,
      nearExpiry,
      tryingProgress: getTryingProgress(profile),
      nutritionMissing: missing.map(c => labelMap[c]),
      todayAllFed: todayCompleted >= todayMealsEnriched.length && todayMealsEnriched.length > 0,
      tomorrowHasTrying: tomorrowMealsEnriched.some((m: any) => {
        const tf = getTryingFood(profile)
        return tf && m.recipe.ingredients.some((i: any) => i.name === tf)
      })
    })

    // 明日预告今晚准备文案
    let tomorrowPrepText = ''
    if (todayPrep.length > 0) {
      const top = todayPrep[0]
      tomorrowPrepText = `今晚记得：${top.action}${top.ingredient}～`
      if (mealsTipText) {
        tomorrowPrepText += '，明日先保持熟悉食材，更稳妥'
      }
    }

    const tryingProgress = getTryingProgress(profile)
    const tryingVM = tryingProgress ? {
      food: tryingProgress.food,
      categoryId: tryingProgress.categoryId,
      dayIndex: tryingProgress.dayIndex,
      daysRequired: tryingProgress.daysRequired,
      replacedCount: (profile.categoryAllergies[tryingProgress.categoryId].tryingReplacedDates || []).length
    } : null

    const dueList = getDueRetryFoods(profile).map(item => {
      const days = item.ex.enteredAt
        ? Math.floor((now - parseLocalDateMs(item.ex.enteredAt)) / 86400000)
        : 7
      return { name: item.name, daysObs: days }
    })

    let statusVaccineHint = ''
    if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
      const daysIn = Math.floor((now - parseLocalDateMs(profile.statusSince)) / 86400000) + 1
      const remain = Math.max(0, POST_VACCINE_DAYS - daysIn + 1)
      statusVaccineHint = `第${daysIn}天，剩余${remain}天自动恢复`
    }

    this.setData({
      babyName: profile.babyName,
      birthday: profile.birthday || '',
      today,
      ageMonths,
      mealsPerDay: profile.mealsPerDay,
      currentStatus: profile.currentStatus || 'normal',
      statusVaccineHint,
      statusReactionBanner,
      emptyDiagnosis: (todayMealsEnriched.length === 0 && tomorrowMealsEnriched.length === 0) ? diagnoseEmptyPlan(profile) : null,
      todayMeals: todayMealsEnriched,
      tomorrowMeals: tomorrowMealsEnriched,
      tomorrowSummary,
      todayCompleted,
      todayProgressPct,
      todayDateLabel: this.todayDateLabelFormat(today),
      tomorrowDateLabel: this.todayDateLabelFormat(tomorrow),
      pills,
      reactionCard,
      reactionPromo,
      todayReactionEntry,
      mealsTipText,
      todayAdvice,
      tomorrowPrepText,
      recommendations: recs,
      recentReactions: recentReactions24h.length,
      dueRetry: dueList,
      trying: tryingVM
    })
  },

  todayDateLabelFormat(dateStr: string): string {
    // 本地解析 YYYY-MM-DD, 避免 new Date(str) 走 UTC 在非 +8 时区漂移到错的周几
    const parts = dateStr.slice(0, 10).split('-').map(Number)
    const d = parts.length === 3 && !parts.some(isNaN)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(dateStr)
    const week = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
    return `${dateStr.split('-')[1]}/${dateStr.split('-')[2]} ${week}`
  },

  computeTodayAdvice(ctx: {
    profile: BabyProfile
    todayReactions: ReactionLog[]
    recentReactions24h: ReactionLog[]
    recs: any[]
    nearExpiry: FridgeItem[]
    tryingProgress: ReturnType<typeof getTryingProgress>
    nutritionMissing?: string[]
    todayAllFed?: boolean
    tomorrowHasTrying?: boolean
  }): {
    title: string
    desc: string
    chips: { icon: string; text: string }[]
    ctaPrimary: null | { label: string; action: AdviceAction; catId?: string; food?: string; daysRequired?: number }
    ctaSecondary: null | { label: string; action: AdviceAction }
    moreRecsCount?: number
  } {
    const { profile, todayReactions, recs, nearExpiry, tryingProgress, nutritionMissing = [], todayAllFed = false, tomorrowHasTrying = false } = ctx
    const chips: { icon: string; text: string }[] = []

    const expiryChip = (f: FridgeItem): { icon: string; text: string } => {
      const dpast = daysSincePurchase(f)
      const icon = emojiFor(f.name)
      if (dpast >= 2) {
        return { icon, text: `${f.name}已放${dpast}天，建议优先吃` }
      }
      return { icon, text: `${f.name}还能放${daysUntilExpiry(f)}天` }
    }

    // 优先级 1：今天有反应记录
    if (todayReactions.length > 0) {
      const top = todayReactions[0]
      const sym = top.note || `${SEVERITY_LABEL[top.severity]}${REACTION_TYPE_LABEL[top.type]}`
      chips.push(
        { icon: '📋', text: '已回溯近72h食材' },
        { icon: '🌱', text: '明日先吃熟悉食材' }
      )
      if (nearExpiry.length > 0) chips.push(expiryChip(nearExpiry[0]))
      return {
        title: `记到 ${todayReactions.length} 次${sym}，今天先稳一稳`,
        desc: '继续吃熟悉的食材观察一下；明天先不加新食材，更稳妥。',
        chips,
        ctaPrimary: { label: '看看吃了啥', action: 'viewReactions' },
        ctaSecondary: null
      }
    }

    // 优先级 2：疫苗后保护
    if (profile.currentStatus === 'postVaccine' && profile.statusSince) {
      const daysIn = Math.floor((todayLocalStartMs() - parseLocalDateMs(profile.statusSince)) / 86400000) + 1
      const remain = Math.max(0, POST_VACCINE_DAYS - daysIn + 1)
      chips.push(
        { icon: '🛡️', text: '今天先吃熟悉食材' },
        { icon: '📅', text: remain > 0 ? `${remain}天后恢复新引入` : '明天可恢复新引入' }
      )
      if (nearExpiry.length > 0) chips.push(expiryChip(nearExpiry[0]))
      return {
        title: `疫苗后第 ${daysIn} 天，先吃熟食材`,
        desc: '疫苗期不加新食材，3 天后自动回到正常节奏。',
        chips,
        ctaPrimary: { label: '提前结束保护期', action: 'endProtection' },
        ctaSecondary: null
      }
    }

    // 优先级 3b：排敏已启动，但明天才开始（今日餐都喂完）
    const tryingScheduled = getTryingScheduledStart(profile)
    if (tryingScheduled && !tryingProgress) {
      const scheduledCat = profile.categoryAllergies[tryingScheduled.categoryId]
      const scheduledDays = scheduledCat?.tryingDaysRequired || 3
      const isInCategoryAdd = scheduledCat?.representative && scheduledCat.representative !== tryingScheduled.food
      chips.push(
        { icon: '📅', text: `明日第 1/${scheduledDays} 天` },
        { icon: '🌱', text: `明日餐次会含${tryingScheduled.food}` }
      )
      if (nearExpiry.length > 0) chips.push(expiryChip(nearExpiry[0]))
      const passLabel = isInCategoryAdd ? `加入安全清单` : '开放整类'
      return {
        title: `${tryingScheduled.food} 排敏，明日开始`,
        desc: `今日已喂完，从明天起观察 ${scheduledDays} 天没反应就${passLabel}。明日预告 ↓ 已自动安排 ${tryingScheduled.food}。`,
        chips,
        ctaPrimary: { label: '取消排敏', action: 'abortTrying' },
        ctaSecondary: null
      }
    }

    // 优先级 3：排敏中（接管原 alert-card 的进度+操作）
    if (tryingProgress) {
      const tryingCat = profile.categoryAllergies[tryingProgress.categoryId]
      const dayIndex = tryingProgress.dayIndex
      const daysRequired = tryingProgress.daysRequired
      const remainDays = Math.max(0, daysRequired - dayIndex)
      const replacedCount = (tryingCat.tryingReplacedDates || []).length
      const isInCategoryAdd = !!tryingCat.representative && tryingCat.representative !== tryingProgress.food
      const food = tryingProgress.food
      const passLabel = isInCategoryAdd ? `加入安全清单` : '开放整类'

      // 状态机:
      //   complete            — dayIndex >= daysRequired (满天数, 可确认)
      //   waitingFirst+canFeed— dayIndex=0 + 今天还有未喂餐 (待喂)
      //   waitingFirst+missed — dayIndex=0 + 今天都喂完没含 trying (今日错过)
      //   inProgress          — 0 < dayIndex < daysRequired (观察中)
      const isComplete = dayIndex >= daysRequired
      const isWaitingFirstFeed = dayIndex === 0
      const todayMissed = isWaitingFirstFeed && todayAllFed

      let title = ''
      let desc = ''
      if (isComplete) {
        title = `${food} 排敏期已满`
        desc = `已实际喂过 ${daysRequired} 天没反应，可以确认${passLabel}。`
        chips.push({ icon: '✓', text: '观察期已满，可确认' })
      } else if (todayMissed) {
        title = `${food} 排敏中（今日错过）`
        desc = tomorrowHasTrying
          ? `今天所有餐都喂完了，但都没含 ${food}。明日菜单已自动安排，记得给宝宝尝一次。`
          : `今天所有餐都喂完了，但都没含 ${food}。建议明天的菜单加上含 ${food} 的一餐。`
        chips.push({ icon: '🌅', text: tomorrowHasTrying ? `明天会喂 ${food}` : `去计划页给明天加上 ${food}` })
      } else if (isWaitingFirstFeed) {
        title = `${food} 排敏中（今日待喂）`
        desc = `还没喂过 ${food}。第一次吃后开始计观察期，观察 ${daysRequired} 天没反应就${passLabel}。`
        chips.push({ icon: '🍽', text: `今天先喂一次 ${food}` })
      } else {
        title = `${food} 排敏中 (第 ${dayIndex} / ${daysRequired} 天)`
        desc = `观察 ${daysRequired} 天没反应就${passLabel}。期间按现有食材搭配，明日维持熟悉组合。`
        chips.push({ icon: '🔍', text: `再观察${remainDays}天就通过` })
        chips.push({ icon: '🌱', text: '明日维持熟悉组合' })
      }
      if (replacedCount > 0 && !isComplete && !todayMissed) {
        chips.push({ icon: '🔁', text: `期间已替换 ${replacedCount} 顿（已计入）` })
      }
      if (nearExpiry.length > 0) chips.push(expiryChip(nearExpiry[0]))

      return {
        title,
        desc,
        chips,
        ctaPrimary: isComplete ? { label: '确认安全', action: 'confirmTrying' } : { label: '提前确认安全', action: 'confirmTrying' },
        ctaSecondary: { label: '停止排敏', action: 'abortTrying' }
      }
    }

    // 优先级 4：肠胃恢复中
    if (hasActiveGutReaction()) {
      chips.push(
        { icon: '🍵', text: '先吃稳定食物，避开海鲜/高纤维' },
        { icon: '🌿', text: '反应消退后自动恢复推荐' }
      )
      return {
        title: '肠胃在恢复，先吃稳的',
        desc: '海鲜和高纤维已经帮你避开了，等好了自动回正常推荐。',
        chips,
        ctaPrimary: { label: '宝宝已经好了', action: 'endProtection' },
        ctaSecondary: null
      }
    }

    // 优先级 4.5：便秘缓解 (依据中国营养学会 2022 + AAP 西梅金标准)
    if (hasActiveConstipation()) {
      chips.push(
        { icon: '🥒', text: '多吃西梅/火龙果/燕麦/紫薯' },
        { icon: '💧', text: '每餐间补充温水' },
        { icon: '🚫', text: '避开精米米糊/低纤维主食' }
      )
      return {
        title: '便秘恢复中，加点纤维和水',
        desc: '西梅含山梨醇是儿科推荐金标准；火龙果籽促肠动；燕麦/紫薯/熟透香蕉都能帮忙。',
        chips,
        ctaPrimary: { label: '宝宝已经好了', action: 'endProtection' },
        ctaSecondary: null
      }
    }

    // 优先级 5：可推荐引入 → CTA 直接开始排敏
    if (recs.length > 0) {
      const top = recs[0]
      const isInCategory = top.mode === 'newFoodInOpenCategory'
      const daysLabel = `${top.daysRequired}天观察`
      chips.push(
        { icon: isInCategory ? '🔁' : '✨', text: isInCategory ? `${top.category}里再补一个` : `${top.category}可以排敏了` },
        { icon: emojiFor(top.foods[0] || top.firstFood || ''), text: `推荐${top.foods.slice(0, 2).join('、')}` },
        { icon: '📅', text: daysLabel }
      )
      if (nearExpiry.length > 0) chips.push(expiryChip(nearExpiry[0]))
      const title = isInCategory
        ? `${top.category}里再加一个：${top.firstFood}`
        : `可尝试引入${top.category}`
      const desc = isInCategory
        ? `${top.foods.slice(0, 3).join('、')} 仍是新的食物，需要逐种观察至少 3 天。`
        : `${top.foods.slice(0, 3).join('、')} 适合今天先排敏，从代表食物开始。`
      return {
        title,
        desc,
        chips,
        ctaPrimary: {
          label: `开始排敏 ${top.firstFood}`,
          action: 'startTrying',
          catId: top.categoryId,
          food: top.firstFood,
          daysRequired: top.daysRequired
        },
        ctaSecondary: null,
        moreRecsCount: recs.length - 1
      }
    }

    // 默认：状态良好 — 引导用户去看明日菜单
    if (nutritionMissing.length === 0) {
      chips.push({ icon: '🥗', text: '主食·蛋白·蔬菜都齐了' })
    } else {
      chips.push({ icon: '💚', text: `今天还差${nutritionMissing.join('·')}` })
    }
    const fridge: FridgeItem[] = wx.getStorageSync('fridge') || []
    if (nearExpiry.length > 0) {
      chips.push(expiryChip(nearExpiry[0]))
    } else if (fridge.length === 0) {
      chips.push({ icon: '🛒', text: '冰箱已空，记得补货' })
    } else if (fridge.length >= 5) {
      chips.push({ icon: '🧊', text: `冰箱有 ${fridge.length} 种食材` })
    } else {
      chips.push({ icon: '🧊', text: `冰箱 ${fridge.length} 种，可补充` })
    }
    const title = nutritionMissing.length === 0 ? '今天搭得很均衡' : `今天差点${nutritionMissing.join('和')}`
    const desc = nutritionMissing.length === 0
      ? '继续这个节奏就好，等熟悉了再考虑引入新食材。'
      : `两餐合起来还差${nutritionMissing.join('、')}，明天的菜单可以补一下。`
    return {
      title,
      desc,
      chips,
      ctaPrimary: { label: '看看明日菜单', action: 'viewTomorrow' },
      ctaSecondary: null
    }
  },

  computePrepForDate(meals: { recipe: { ingredients: { name: string; portions: number }[] } }[]) {
    const totalPortions = new Map<string, number>()
    for (const meal of meals) {
      for (const ing of meal.recipe.ingredients) {
        totalPortions.set(ing.name, (totalPortions.get(ing.name) || 0) + ing.portions)
      }
    }

    const prepMap = new Map<string, { ingredient: string; action: string }>()
    for (const [name, portions] of totalPortions.entries()) {
      const ingDef = getIngredient(name)
      if (!ingDef) continue
      for (const step of ingDef.prepSteps) {
        if (step.hoursAhead >= 8) {
          const key = `${name}-${step.type}`
          const portionsLabel = portions > 1 ? `(${portions}份)` : ''
          if (!prepMap.has(key)) {
            prepMap.set(key, {
              ingredient: name + portionsLabel,
              action: step.description
            })
          }
        }
      }
    }
    return Array.from(prepMap.entries()).map(([key, v]) => ({ key, ...v }))
  },

  askPreference(e: any) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const today = this.data.today
    wx.showActionSheet({
      itemList: ['😋 爱吃', '😐 不爱吃', '清除标记'],
      success: (res) => {
        const choice: Preference | null = res.tapIndex === 0 ? 'love' : res.tapIndex === 1 ? 'dislike' : null
        setPreference(today, idx, choice)
        wx.showToast({ title: choice ? `已记录${PREFERENCE_LABEL[choice]}` : '已清除', icon: 'none', duration: 800 })
        this.refresh()
      }
    })
  },

  doCheckin(e: any) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const meal = this.data.todayMeals.find(m => m.mealIndex === idx)
    if (!meal) return
    const before = snapshotTryingProgress()
    checkinMeal(this.data.today, idx, meal.recipe)
    toastWithTryingDelta(before, '已扣库存', 600)
    this.refresh()
  },

  // 从最近 30 天 mealJournal 取使用频率最高的食材作为快捷建议 (与 review 同款)
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

  // "+ 补一餐" → 内联打开 manualSheet, 不再跳转
  addMealManual() {
    const now = new Date()
    const today = formatDate(now)
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    this.setData({
      manualOpen: true,
      manualIsEditing: false,
      manualEditDate: '',
      manualEditMealIndex: -1,
      manualDate: today,
      todayStr: today,
      manualTime: `${hh}:${mm}`,
      manualDishName: '',
      manualIngChips: [],
      manualIngInput: '',
      manualIngSuggestions: this.computeIngSuggestions([]),
      manualPortion: '',
      manualNote: ''
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
  onManualIngsConfirm() {
    this.addIngChipFromInput()
  },
  addIngChipFromInput() {
    const raw = (this.data.manualIngInput || '').trim()
    if (!raw) return
    const parts = raw.split(/[、,,\s]+/).map(s => s.trim()).filter(Boolean)
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
    const merged = this.data.manualIngChips.filter((c: string) => c !== name)
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
    const pending = (this.data.manualIngInput || '').trim()
    let ingredients = [...this.data.manualIngChips]
    if (pending) {
      const parts = pending.split(/[、,,\s]+/).map(s => s.trim()).filter(Boolean)
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

    const inferredPref: Preference | undefined =
      (portion === 'taste' || portion === 'small') ? 'dislike' :
      portion === 'full' ? 'love' :
      undefined
    const finalPref = inferredPref !== undefined ? inferredPref : existing?.preference

    const that = this
    const finalIngredients = ingredients.length > 0 ? ingredients : [dish]

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

    this.setData({ manualOpen: false, manualIsEditing: false })
    this.refresh()

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
          syncPlanForTrying(result.profile)
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
  },

  undoCheckin(e: any) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    uncheckinMeal(this.data.today, idx)
    wx.showToast({ title: '已撤销打卡', icon: 'none', duration: 800 })
    this.refresh()
  },

  // 点 "✓ 已喂完" 标签 → 二次确认后撤销打卡
  confirmUndoCheckin(e: any) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    wx.showModal({
      title: '撤销已喂完？',
      content: '会把这一餐恢复成未喂状态，已扣的库存会一起还原。',
      confirmText: '撤销',
      cancelText: '保留',
      success: (res) => {
        if (!res.confirm) return
        uncheckinMeal(this.data.today, idx)
        wx.showToast({ title: '已撤销', icon: 'none', duration: 800 })
        this.refresh()
      }
    })
  },

  // 点 meal-bowl 圆形图标 → 未喂直接打卡 / 已喂确认撤销
  openRecipe(e: any) {
    const id = e.currentTarget.dataset.id as string
    if (id) wx.navigateTo({ url: `/pages/recipe/recipe?id=${id}` })
  },

  // 打开「记录吃了」sheet — 已 logged 时自动进入编辑态, 预填旧记录
  openActualSheet(e: any) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const meal = this.data.todayMeals.find(m => m.mealIndex === idx)
    if (!meal) return
    const planIngredients = meal.recipe.ingredients.map((i: any) => i.name)
    const existingLog = getMealLog(this.data.today, idx)
    const isEditing = !!existingLog

    // 初始选中: 编辑态用 log.ingredients, 新建态用 plan.ingredients
    const initialSelected = isEditing
      ? (existingLog!.ingredients || [])
      : planIngredients

    // 食材候选 chips: log 现有 + plan + 最近 30 天常吃 top 6 (供点击切换);
    // confirmedFoods 全集不灌, 用户想加冷门食材走「+ 添加」输入
    const candidates: string[] = []
    const seen = new Set<string>()
    for (const n of initialSelected) {
      if (!seen.has(n)) { candidates.push(n); seen.add(n) }
    }
    for (const n of planIngredients) {
      if (!seen.has(n)) { candidates.push(n); seen.add(n) }
    }
    // 最近常吃 top 6 (与 review manualSheet 一致逻辑)
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const cutoff = Date.now() - 30 * 86400000
    const counter: Record<string, number> = {}
    for (const l of journal) {
      const t = l.eatenAt ? new Date(l.eatenAt).getTime() : (l.loggedAt ? new Date(l.loggedAt).getTime() : 0)
      if (t < cutoff) continue
      for (const ing of (l.ingredients || [])) {
        if (!ing || seen.has(ing)) continue
        counter[ing] = (counter[ing] || 0) + 1
      }
    }
    const recent = Object.entries(counter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n]) => n)
    for (const n of recent) {
      if (!seen.has(n)) { candidates.push(n); seen.add(n) }
    }
    const selectedSet = new Set(initialSelected)
    const chips = candidates.map(name => ({ name, selected: selectedSet.has(name) }))

    // 时间初值: 编辑态用现有 eatenAt 或 loggedAt; 新建态用当前时间
    let initialTime = ''
    if (isEditing && existingLog) {
      const t = new Date(existingLog.eatenAt || existingLog.loggedAt)
      initialTime = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    } else {
      const now = new Date()
      initialTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }

    this.setData({
      actualSheetOpen: true,
      actualSheetCtx: {
        idx,
        mealLabel: `第 ${idx + 1} 餐`,
        planName: meal.recipe.name,
        planIngredientsText: planIngredients.join('、'),
        isEditing
      },
      actualDishName: isEditing ? (existingLog!.customDishName || '') : '',
      actualIngredients: [...initialSelected],
      actualIngredientChips: chips,
      actualPortion: isEditing ? ((existingLog!.portion === 'small' ? 'taste' : existingLog!.portion) || '') : '',
      actualNote: isEditing ? (existingLog!.note || '') : '',
      actualTime: initialTime,
      // 编辑态: 之前有过 dish/note/食材改动 → 展开; 否则收起
      actualDetailsOpen: isEditing && !!(existingLog!.customDishName || existingLog!.note || existingLog!.isCustom)
    })
  },

  onActualTimeChange(e: any) {
    this.setData({ actualTime: e.detail.value })
  },

  toggleActualDetails() {
    this.setData({ actualDetailsOpen: !this.data.actualDetailsOpen })
  },

  // 从 sheet 跳食谱详情(看做法), 保持 sheet 状态不关 (返回时还在)
  openPlanRecipeFromSheet() {
    const ctx = this.data.actualSheetCtx
    if (!ctx) return
    const meal = this.data.todayMeals.find(m => m.mealIndex === ctx.idx)
    if (!meal) return
    wx.navigateTo({ url: `/pages/recipe/recipe?id=${meal.recipe.id}` })
  },

  closeActualSheet() {
    this.setData({ actualSheetOpen: false, actualSheetCtx: null, actualDishName: '', actualIngredients: [], actualIngredientChips: [], actualPortion: '', actualNote: '', actualTime: '', actualDetailsOpen: false })
  },

  // 「按计划记录」快捷按钮 — 重置成按计划版本
  saveAsPlanned() {
    const ctx = this.data.actualSheetCtx
    if (!ctx) return
    const meal = this.data.todayMeals.find(m => m.mealIndex === ctx.idx)
    if (!meal) return
    const before = snapshotTryingProgress()
    if (ctx.isEditing) {
      // 编辑场景: 直接覆盖 log 为"按计划"态(清掉 custom 字段), 不重扣库存
      // 保留首次记录的 loggedAt + 用户改过的 eatenAt, 不刷新时间
      const existing = getMealLog(this.data.today, ctx.idx)
      logMeal({
        date: this.data.today,
        mealIndex: ctx.idx,
        recipeId: meal.recipe.id,
        recipeName: meal.recipe.name,
        ingredients: meal.recipe.ingredients.map((i: any) => i.name),
        loggedAt: existing?.loggedAt || new Date().toISOString(),
        ...(existing?.eatenAt ? { eatenAt: existing.eatenAt } : {})
      })
    } else {
      checkinMeal(this.data.today, ctx.idx, meal.recipe)
    }
    toastWithTryingDelta(before, ctx.isEditing ? '已改为按计划' : '已按计划记录')
    this.closeActualSheet()
    this.refresh()
  },

  // 用户输入实际菜名
  inputActualDishName(e: any) {
    this.setData({ actualDishName: e.detail.value })
  },
  clearActualDishName() {
    this.setData({ actualDishName: '' })
  },

  // 点击食材 chip 切换选中态
  toggleActualIngredient(e: any) {
    const name = e.currentTarget.dataset.name as string
    const chips = this.data.actualIngredientChips.map(c =>
      c.name === name ? { ...c, selected: !c.selected } : c
    )
    const ingredients = chips.filter(c => c.selected).map(c => c.name)
    this.setData({ actualIngredientChips: chips, actualIngredients: ingredients })
  },

  // 弹原生输入框添加自定义食材 (不在 chip 候选里)
  addCustomIngredient() {
    const that = this
    wx.showModal({
      title: '添加食材',
      editable: true,
      placeholderText: '如 米糊 / 自制浓汤宝',
      success: (res) => {
        if (!res.confirm || !res.content) return
        const name = res.content.trim()
        if (!name) return
        const chips = [...that.data.actualIngredientChips]
        if (!chips.find(c => c.name === name)) {
          chips.push({ name, selected: true })
        } else {
          const i = chips.findIndex(c => c.name === name)
          chips[i] = { ...chips[i], selected: true }
        }
        const ingredients = chips.filter(c => c.selected).map(c => c.name)
        that.setData({ actualIngredientChips: chips, actualIngredients: ingredients })
      }
    })
  },

  setActualPortion(e: any) {
    const portion = e.currentTarget.dataset.portion as string
    this.setData({ actualPortion: portion })
  },

  inputActualNote(e: any) {
    this.setData({ actualNote: e.detail.value })
  },

  // 保存「实际记录」: 新建走 checkinMeal(扣库存), 编辑走 logMeal(不重扣)
  saveActualRecord() {
    const ctx = this.data.actualSheetCtx
    if (!ctx) return
    const meal = this.data.todayMeals.find(m => m.mealIndex === ctx.idx)
    if (!meal) return
    const dish = (this.data.actualDishName || '').trim()
    const ingredients = this.data.actualIngredients
    if (ingredients.length === 0 && !dish) {
      wx.showToast({ title: '至少记一个食材', icon: 'none' })
      return
    }
    const portion = this.data.actualPortion || undefined
    const note = (this.data.actualNote || '').trim() || undefined
    const isCustom = !!(dish || (ingredients.length > 0 && ingredients.join() !== meal.recipe.ingredients.map((i: any) => i.name).join()))

    // 编辑模式 + 计划本含 trying food + 实际记录里去掉了 trying food → 沉默扣排敏天, 弹确认
    if (ctx.isEditing) {
      const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
      const tryingFood = profile ? getTryingFood(profile) : null
      const planHasTrying = !!(tryingFood && meal.recipe.ingredients.some((i: any) => i.name === tryingFood))
      const actualHasTrying = !!(tryingFood && ingredients.includes(tryingFood))
      if (tryingFood && planHasTrying && !actualHasTrying) {
        const that = this
        wx.showModal({
          title: '从实际记录里去掉了排敏食材',
          content: `${tryingFood} 不在你勾选的实际食材里。如果保存,这天可能不计入排敏天,观察期或被延长。继续吗?`,
          confirmText: '仍然保存',
          cancelText: '我再看看',
          success: (res) => {
            if (res.confirm) that.doSaveActualLog(ctx, meal, dish, ingredients, portion, note, isCustom)
          }
        })
        return
      }
    }
    this.doSaveActualLog(ctx, meal, dish, ingredients, portion, note, isCustom)
  },

  doSaveActualLog(
    ctx: any,
    meal: any,
    dish: string,
    ingredients: string[],
    portion: any,
    note: any,
    isCustom: boolean
  ) {
    // 用户调过的时间 (HH:mm) → eatenAt; 没改时新建态用 now, 编辑态保留原值
    const time = (this.data.actualTime || '').trim()
    const eatenAt = time ? combineTime(this.data.today, time) : undefined
    const before = snapshotTryingProgress()

    // 根据份量自动推断 preference (代替独立的"饭后反馈"按钮):
    //   taste/small = 尝几口就不吃了 → dislike (UI 合并到「尝几口」, small 仅兼容历史 log)
    //   full = 吃完整份 → love
    //   half = 中性, 不写 preference
    const inferredPref: Preference | undefined =
      (portion === 'taste' || portion === 'small') ? 'dislike' :
      portion === 'full' ? 'love' :
      undefined

    if (ctx.isEditing) {
      // 编辑场景: 直接覆盖 log, 不重扣库存
      // 保留首次记录的 loggedAt 不动, 只通过 eatenAt 反映用户调整后的用餐时间
      const existing = getMealLog(this.data.today, ctx.idx)
      // 优先用 inferredPref (用户当前选的份量); 没推断出来时保留原 preference (编辑场景不抹掉)
      const finalPref = inferredPref !== undefined ? inferredPref : existing?.preference
      logMeal({
        date: this.data.today,
        mealIndex: ctx.idx,
        recipeId: meal.recipe.id,
        recipeName: meal.recipe.name,
        ingredients,
        loggedAt: existing?.loggedAt || new Date().toISOString(),
        ...(eatenAt ? { eatenAt } : (existing?.eatenAt ? { eatenAt: existing.eatenAt } : {})),
        ...(dish ? { customDishName: dish } : {}),
        ...(portion ? { portion } : {}),
        ...(note ? { note } : {}),
        ...(finalPref ? { preference: finalPref } : {}),
        ...(isCustom ? { isCustom: true } : {})
      })
      toastWithTryingDelta(before, '已更新记录', 900)
    } else {
      // 关键: 默认不动 (ingredients = plan, dish 空) 时不传 actualIngredients,
      // 否则 checkin.ts 看到 length > 0 就标 isCustom = true, 用户看到"修改过"假象
      checkinMeal(this.data.today, ctx.idx, meal.recipe, {
        customDishName: dish || undefined,
        ...(isCustom ? { actualIngredients: ingredients } : {}),
        portion,
        note,
        eatenAt
      })
      if (inferredPref) {
        setPreference(this.data.today, ctx.idx, inferredPref)
      }
      toastWithTryingDelta(before, isCustom ? '已记录' : '已按计划记录', 900)
    }
    this.closeActualSheet()
    this.refresh()
  },

  toggleMealLogged(e: any) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const meal = this.data.todayMeals.find(m => m.mealIndex === idx)
    if (!meal) return
    if (meal.logged) {
      this.confirmUndoCheckin(e)
    } else {
      // 点击碗图标也走「记录吃了」flow, 让用户能选实际吃了什么
      this.openActualSheet(e)
    }
  },

  // 点"换一个"：打开 sheet 显示 3 个候选
  replaceMeal(e: any) {
    const day = e.currentTarget.dataset.day as string
    const idx = parseInt(e.currentTarget.dataset.idx, 10)
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return

    const targetDate = day === 'today'
      ? this.data.today
      : formatDate(new Date(Date.now() + 86400000))

    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const dayPlan = plan.find(p => p.date === targetDate)
    if (!dayPlan) return

    const oldRecipe = dayPlan.meals[idx].recipe
    const fridgeNames = new Set<string>(getFridge().map(f => f.name))
    const candidates = pickReplacementCandidates(profile, dayPlan, idx, 3, fridgeNames)
    if (candidates.length === 0) {
      wx.showToast({ title: '暂无营养均衡的其他食谱', icon: 'none' })
      return
    }

    // 互换候选: 同日其他餐, 已喂的不能换
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const loggedIdx = new Set(journal.filter(l => l.date === targetDate).map(l => l.mealIndex))
    const swapTargets = dayPlan.meals
      .filter(m => m.mealIndex !== idx && !loggedIdx.has(m.mealIndex))
      .map(m => ({
        idx: m.mealIndex,
        mealLabel: `第 ${m.mealIndex + 1} 餐`,
        name: m.recipe.name
      }))

    this.setData({
      replaceSheetOpen: true,
      replaceAltsExpanded: false,
      replaceCandidates: candidates.map(c => ({
        id: c.recipe.id,
        name: c.recipe.name,
        reason: c.reason,
        reasons: c.reasons,
        prepTime: c.prepTime,
        inFridgeAll: c.inFridgeAll,
        ingredientsText: c.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + '),
        mitigationText: (c.warnings || []).map(w => `${w.foods.join('+')}：${w.mitigation || ''}`).join('；')
      })),
      replaceSwapTargets: swapTargets,
      replaceCtx: {
        day,
        date: targetDate,
        idx,
        mealLabel: `第 ${idx + 1} 餐`,
        oldName: oldRecipe.name
      }
    })
  },

  // 互换今日两餐: recipe + 加料标记一起换, mealIndex 不动
  swapMeals(e: any) {
    const targetIdx = parseInt(e.currentTarget.dataset.idx, 10)
    const ctx = this.data.replaceCtx
    if (!ctx) return
    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const dayPlan = plan.find(p => p.date === ctx.date)
    if (!dayPlan) return
    const a = dayPlan.meals.find(m => m.mealIndex === ctx.idx)
    const b = dayPlan.meals.find(m => m.mealIndex === targetIdx)
    if (!a || !b) return
    const tmp = { recipe: a.recipe, trialIngredient: a.trialIngredient, trialMethod: a.trialMethod }
    a.recipe = b.recipe; a.trialIngredient = b.trialIngredient; a.trialMethod = b.trialMethod
    b.recipe = tmp.recipe; b.trialIngredient = tmp.trialIngredient; b.trialMethod = tmp.trialMethod
    wx.setStorageSync('weeklyPlan', plan)
    wx.showToast({ title: `已互换 ${ctx.mealLabel} ↔ 第 ${targetIdx + 1} 餐`, icon: 'success', duration: 1200 })
    this.setData({ replaceSheetOpen: false, replaceCandidates: [], replaceSwapTargets: [], replaceCtx: null })
    this.refresh()
  },

  refreshReplaceCandidates() {
    const ctx = this.data.replaceCtx
    if (!ctx) return
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const dayPlan = plan.find(p => p.date === ctx.date)
    if (!dayPlan) return

    const fridgeNames = new Set<string>(getFridge().map(f => f.name))
    // 排除当前显示的 3 个,优先出新候选(池子不够时 planner 内部会降级)
    const currentIds = (this.data.replaceCandidates || []).map(c => c.id)
    const candidates = pickReplacementCandidates(profile, dayPlan, ctx.idx, 3, fridgeNames, currentIds)
    this.setData({
      replaceCandidates: candidates.map(c => ({
        id: c.recipe.id,
        name: c.recipe.name,
        reason: c.reason,
        ingredientsText: c.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + '),
        mitigationText: (c.warnings || []).map(w => `${w.foods.join('+')}：${w.mitigation || ''}`).join('；')
      }))
    })
  },

  closeReplaceSheet() {
    this.setData({ replaceSheetOpen: false, replaceCandidates: [], replaceSwapTargets: [], replaceAltsExpanded: false, replaceCtx: null })
  },

  toggleReplaceAlts() {
    this.setData({ replaceAltsExpanded: !this.data.replaceAltsExpanded })
  },

  stopPropagation() {},


  confirmReplacement(e: any) {
    const recipeId = e.currentTarget.dataset.id as string
    const ctx = this.data.replaceCtx
    if (!ctx) return

    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const dayPlan = plan.find(p => p.date === ctx.date)
    if (!dayPlan) return

    // 从最新 applicable 集合里找到选中的食谱
    const applicable = getApplicableRecipes(profile)
    const newRecipe: Recipe | undefined = applicable.find(r => r.id === recipeId)
    if (!newRecipe) {
      wx.showToast({ title: '食谱不可用', icon: 'none' })
      return
    }

    const oldRecipe = dayPlan.meals[ctx.idx].recipe
    const tryingFood = getTryingFood(profile)
    const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood))
    // 关键: 今天是否已经实际吃过 trying food (看 mealJournal 而不是 plan)
    // 已经吃过 → 这天排敏天已合格, 替换任何其他餐不影响观察进度, 不弹 modal 不 record
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const todayAlreadyAteTrying = !!(tryingFood && journal.some(l =>
      l.date === ctx.date && (l.ingredients || []).includes(tryingFood)
    ))
    const otherMealsHaveTrying = !!(tryingFood && dayPlan.meals.some((m, i) =>
      i !== ctx.idx && m.recipe.ingredients.some(ing => ing.name === tryingFood)
    ))
    // 替换为的新菜本身是否仍含 trying food: 如果是, 这天依然有 trying, 不算作废
    const newRecipeHasTrying = !!(tryingFood && newRecipe.ingredients.some(i => i.name === tryingFood))
    // 替换后这天是否还会有 trying food (= 新菜含 OR 其他餐含)
    const willStillHaveTryingAfter = newRecipeHasTrying || otherMealsHaveTrying

    const doReplace = () => {
      dayPlan.meals[ctx.idx].recipe = newRecipe
      const stillHasTrying = !!(tryingFood && dayPlan.meals.some(m =>
        m.recipe.ingredients.some(ing => ing.name === tryingFood)
      ))
      // 只在"今天没已吃过 trying + 替换后也没含 trying"时才算这天作废
      if (oldUsesTrying && !todayAlreadyAteTrying && !stillHasTrying && tryingFood) {
        const tryingCatId = getCurrentTryingCategoryId(profile)
        if (tryingCatId) {
          const updated = recordTryingReplaced(profile, tryingCatId, ctx.date)
          wx.setStorageSync('babyProfile', updated)
        }
      }
      wx.setStorageSync('weeklyPlan', plan)
      this.closeReplaceSheet()
      wx.showToast({ title: '已替换，营养已同步', icon: 'success', duration: 1200 })
      this.refresh()
    }

    // 弹"延长观察期"modal 的条件: old 含 trying + 今天没已吃过 + 替换后这天再也没 trying (新菜不含 + 其他餐不含)
    if (oldUsesTrying && !todayAlreadyAteTrying && !willStillHaveTryingAfter) {
      wx.showModal({
        title: '替换会延长观察期',
        content: `这一顿包含正在排敏的 ${tryingFood}，替换后这天不算排敏天，观察期会延长 1 天。继续吗?`,
        success: (res) => { if (res.confirm) doReplace() }
      })
    } else {
      doReplace()
    }
  },

  // 打开全部推荐 sheet
  openMoreRecsSheet() {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const allRecs = getNextRecommendation(profile)
    const list = allRecs.map(r => ({
      catId: r.categoryId,
      food: r.firstFood,
      category: r.category,
      reason: r.reason,
      daysRequired: r.daysRequired,
      isInCategory: r.mode === 'newFoodInOpenCategory'
    }))
    this.setData({ moreRecsSheetOpen: true, moreRecsList: list })
  },

  closeMoreRecsSheet() {
    this.setData({ moreRecsSheetOpen: false })
  },

  pickRecFromSheet(e: any) {
    const catId = e.currentTarget.dataset.catId as string
    const food = e.currentTarget.dataset.food as string
    const days = parseInt(e.currentTarget.dataset.days, 10) || 3
    this.setData({ moreRecsSheetOpen: false })
    this.startTryingFromAdvice(catId, food, days)
  },

  // 今日建议 CTA：dispatcher
  triggerAdvicePrimary() {
    const cta = this.data.todayAdvice?.ctaPrimary
    if (cta) this.dispatchAdviceAction(cta)
  },

  triggerAdviceSecondary() {
    const cta = this.data.todayAdvice?.ctaSecondary
    if (cta) this.dispatchAdviceAction(cta)
  },

  dispatchAdviceAction(cta: { label: string; action: AdviceAction; catId?: string; food?: string; daysRequired?: number }) {
    switch (cta.action) {
      case 'startTrying':
        if (cta.catId && cta.food) {
          this.startTryingFromAdvice(cta.catId, cta.food, cta.daysRequired || 3)
        } else {
          wx.showToast({ title: '推荐数据缺失，请去排敏档案手动启动', icon: 'none', duration: 1800 })
        }
        break
      case 'viewReactions':
        wx.navigateTo({ url: '/pages/reactions/reactions' })
        break
      case 'endProtection':
        // 疫苗/肠胃统一走 setStatusNormal（清 gut + 切 normal + rebuild）
        this.setStatusNormal()
        break
      case 'confirmTrying':
        this.confirmTryingEarly()
        break
      case 'abortTrying':
        this.abortTryingFood()
        break
      case 'viewTomorrow':
        wx.pageScrollTo({ selector: '.tomorrow-card', duration: 300 })
        break
    }
  },

  startTryingFromAdvice(catId: string, food: string, daysRequired: number = 3) {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const currentTrying = getCurrentTryingCategoryId(profile)
    if (currentTrying) {
      const tryingFood = profile.categoryAllergies[currentTrying]?.tryingFood
      wx.showToast({ title: `先完成 ${tryingFood} 排敏再引入新食物`, icon: 'none', duration: 1800 })
      return
    }
    // 从 mealJournal 直接算 (this.data.todayMeals 在 abort 后可能未及时刷新, 导致 stale)
    const todayDate = formatDate(new Date())
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const loggedIdxToday = new Set(journal.filter(l => l.date === todayDate).map(l => l.mealIndex))
    const planNow: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const todayPlanNow = planNow.find(p => p.date === todayDate)
    const hasUnloggedToday = !!todayPlanNow && todayPlanNow.meals.some(m => !loggedIdxToday.has(m.mealIndex))
    const result = startTryingForFood(profile, catId, food, hasUnloggedToday, daysRequired)
    if (!result) return
    wx.setStorageSync('babyProfile', result.profile)
    rebuildPlan(result.profile)
    this.refresh()

    // 启动后立刻看新菜单含 trying food 的餐数：让用户清楚是否真排进今日
    const newPlan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const todayStr = formatDate(new Date())
    const todayPlan = newPlan.find(p => p.date === todayStr)
    const todayCount = todayPlan ? todayPlan.meals.filter(m => m.recipe.ingredients.some(i => i.name === food)).length : 0
    const recipesWithTrying = getApplicableRecipes(profile).filter(r => r.ingredients.some(i => i.name === food)).length

    // 同品类内补食材时不会"开放整类"（品类原本就 open），只是该单食材通过
    const passLabel = result.isInCategoryAdd ? `${food} 加入安全清单` : '开放整类'
    if (hasUnloggedToday && todayCount > 0) {
      wx.showModal({
        title: `${food} 排敏已启动`,
        content: `今日有 ${todayCount} 餐含 ${food}，喂完后观察 ${daysRequired} 天没反应就${passLabel}。`,
        showCancel: false,
        confirmText: '看看菜单',
        success: (res) => {
          // 当前已在首页, 滚动定位到今日辅食卡
          if (res.confirm) wx.pageScrollTo({ selector: '.plan-card', duration: 300 })
        }
      })
    } else if (hasUnloggedToday && todayCount === 0) {
      // 今日凑不出含 food 的整道菜 → 找一个合适的未喂餐"加料"
      this.showTrialSlotModal(food, daysRequired, newPlan, todayStr)
    } else {
      // hasUnloggedToday=false：今日已喂完，trying 安排到明日
      const newPlanX: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
      const tomorrowStr = formatDate(new Date(Date.now() + 86400000))
      const tomorrowPlan = newPlanX.find(p => p.date === tomorrowStr)
      const tomorrowCount = tomorrowPlan ? tomorrowPlan.meals.filter(m => m.recipe.ingredients.some(i => i.name === food)).length : 0
      if (tomorrowCount > 0) {
        wx.showModal({
          title: `${food} 排敏，明日开始`,
          content: `明日 ${tomorrowCount} 餐含 ${food}，从明天起观察 ${daysRequired} 天。`,
          showCancel: false,
          confirmText: '知道了'
        })
      } else {
        // 明日也没含 food 的整道菜 → 同样用"加料"建议（从明日起找 slot）
        this.showTrialSlotModal(food, daysRequired, newPlanX, tomorrowStr)
      }
    }
  },

  // 排敏「加料」提示: 食谱库凑不出整道菜时，建议在某餐基底里加一勺 target
  showTrialSlotModal(food: string, daysRequired: number, plans: DailyPlan[], fromDate: string) {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const loggedKeys = new Set(journal.map(l => `${l.date}-${l.mealIndex}`))
    const slot = suggestTrialSlot(profile, food, plans, fromDate, loggedKeys)
    const method = getFirstTryMethod(food)

    if (!slot) {
      // 极端 fallback: 所有未喂餐都跟 target 有禁忌 → 让用户单独喂一小口
      wx.showModal({
        title: `${food} 排敏已启动`,
        content: `当前餐次都不太适合搭配 ${food}。建议单独喂 1 勺 ${food}（${method}），喂完后观察 ${daysRequired} 天没反应就通过。`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    // 持久化加料标记到那餐 → 首页会显示 chip
    const updatedPlans = attachTrialIngredient(plans, slot.date, slot.mealIdx, food)
    wx.setStorageSync('weeklyPlan', updatedPlans)
    this.refresh()

    // 文案 dayLabel 要跟"今天"比, 不能跟 fromDate 比 (今日已喂完时 fromDate=明日)
    const todayStr = formatDate(new Date())
    const tomorrowStr = formatDate(new Date(Date.now() + 86400000))
    let dayLabel = slot.date
    if (slot.date === todayStr) dayLabel = '今日'
    else if (slot.date === tomorrowStr) dayLabel = '明日'
    const mealLabel = `第 ${slot.mealIdx + 1} 餐`
    const warnLine = slot.warnings.length > 0
      ? `\n💡 提示: ${slot.warnings.map(w => w.mitigation).join('；')}`
      : ''
    wx.showModal({
      title: `${food} 排敏已启动`,
      content: `当前食谱凑不出含 ${food} 的整道菜。\n\n建议在${dayLabel}${mealLabel}「${slot.recipeName}」里加 1 勺 ${food}（${method}），喂完后观察 ${daysRequired} 天没反应就通过。${warnLine}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 一键调整明日：保留今日已发生的安排，重生成明日及之后
  adjustTomorrow() {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    // 「调整明日」只重排明天及之后, 不动今天 (含今天未喂的餐, 否则用户会发现今日菜单被偷改)
    const existing: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const newPlan = regenerateTomorrowOnward(profile, existing)
    wx.setStorageSync('weeklyPlan', newPlan)
    wx.showToast({ title: '已调整明日及之后', icon: 'success', duration: 1000 })
    this.refresh()
  },

  retryPass(e: any) {
    const name = e.currentTarget.dataset.name
    const profile = recordRetry(wx.getStorageSync('babyProfile'), name, 'pass')
    wx.setStorageSync('babyProfile', profile)
    rebuildPlan(wx.getStorageSync('babyProfile'))
    wx.showToast({ title: `${name} 重试通过,已恢复使用`, icon: 'success', duration: 1500 })
    this.refresh()
  },

  retryFail(e: any) {
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '确认仍过敏',
      content: `${name} 再次出现反应?将永久标记为过敏。`,
      success: (res) => {
        if (!res.confirm) return
        const profile = recordRetry(wx.getStorageSync('babyProfile'), name, 'fail')
        wx.setStorageSync('babyProfile', profile)
        rebuildPlan(wx.getStorageSync('babyProfile'))
        wx.showToast({ title: `${name} 已确诊过敏`, icon: 'none', duration: 1500 })
        this.refresh()
      }
    })
  },

  acceptRec(e: any) {
    const catId = e.currentTarget.dataset.catId
    const rep = e.currentTarget.dataset.rep
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return

    const currentTrying = getCurrentTryingCategoryId(profile)
    if (currentTrying) {
      const tryingFood = profile.categoryAllergies[currentTrying]?.tryingFood
      wx.showToast({ title: `先完成 ${tryingFood} 排敏再引入新食物`, icon: 'none', duration: 1800 })
      return
    }

    // 无论分组是否已开放，每一种新食物都独立观察至少 3 天。
    const existing = profile.categoryAllergies[catId] || { state: 'untried' }
    const days = existing.state === 'open' ? 2 : 3
    profile.categoryAllergies[catId] = {
      ...existing,
      state: 'trying',
      tryingFood: rep,
      tryingDaysRequired: days,
      tryingStartDate: new Date().toISOString().slice(0, 10),
      tryingReplacedDates: []
    }
    wx.setStorageSync('babyProfile', profile)
    rebuildPlan(profile)

    wx.showToast({ title: `${rep} 排敏开始(需观察${days}天)`, icon: 'none', duration: 1800 })
    this.refresh()
  },

  toggleRecExpand() {
    this.setData({ recExpanded: !this.data.recExpanded })
  },

  confirmTryingEarly() {
    const t = this.data.trying
    if (!t) return
    wx.showModal({
      title: '提前确认安全',
      content: `${t.food} 已观察 ${t.dayIndex} 天没反应,确认转为已开放?\n(建议至少观察满 3 天)`,
      success: (res) => {
        if (!res.confirm) return
        const profile: BabyProfile = wx.getStorageSync('babyProfile')
        const updated = completeTrying(profile, t.categoryId)
        wx.setStorageSync('babyProfile', updated)
        rebuildPlan(wx.getStorageSync('babyProfile'))
        // 排敏完成: 清掉加料标记(基底食谱完成排敏后会自然含该食材, chip 不再需要)
        const plansAfter: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
        wx.setStorageSync('weeklyPlan', clearTrialIngredient(plansAfter, t.food))
        wx.showToast({ title: `${t.food} 已加入安全清单`, icon: 'success' })
        this.refresh()
      }
    })
  },

  abortTryingFood() {
    // 直接从 profile 拿当前 trying，不依赖 this.data.trying
    // (scheduled-but-not-started 态下 this.data.trying 是 null)
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    const catId = getCurrentTryingCategoryId(profile)
    if (!catId) return
    const food = profile.categoryAllergies[catId]?.tryingFood || ''
    wx.showModal({
      title: '停止排敏',
      content: `停止 ${food} 排敏?该品类会回到"未引入"状态。`,
      confirmText: '停止',
      confirmColor: '#E57373',
      success: (res) => {
        if (!res.confirm) return
        const updated = abortTrying(profile, catId)
        wx.setStorageSync('babyProfile', updated)
        rebuildPlan(wx.getStorageSync('babyProfile'))
        // 中止排敏: 清掉加料标记
        const plansAfter: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
        wx.setStorageSync('weeklyPlan', clearTrialIngredient(plansAfter, food))
        wx.showToast({ title: '已停止排敏', icon: 'none' })
        this.refresh()
      }
    })
  },

  editName() {
    this.setData({ editing: { ...this.data.editing, name: true } })
  },

  commitName(e: any) {
    const value = (e.detail.value || '').trim()
    if (!value) {
      this.setData({ editing: { ...this.data.editing, name: false } })
      return
    }
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    profile.babyName = value
    wx.setStorageSync('babyProfile', profile)
    this.setData({
      babyName: value,
      editing: { ...this.data.editing, name: false }
    })
  },

  commitBirthday(e: any) {
    const value = e.detail.value
    if (!value) return
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    profile.birthday = value
    profile.ageMonths = calcAgeMonths(value)
    wx.setStorageSync('babyProfile', profile)
    rebuildPlan(wx.getStorageSync('babyProfile'))
    wx.showToast({ title: `已设置生日 ${value}`, icon: 'none', duration: 1200 })
    this.refresh()
  },

  commitMeals(e: any) {
    const value = parseInt(e.detail.value, 10) + 1
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    profile.mealsPerDay = value
    wx.setStorageSync('babyProfile', profile)
    rebuildPlan(wx.getStorageSync('babyProfile'))
    wx.showToast({ title: `已改为每日${value}顿`, icon: 'none', duration: 1200 })
    this.refresh()
  },

  noop() {},

  goReactions() {
    wx.navigateTo({ url: '/pages/reactions/reactions' })
  },

  toggleTomorrow() {
    this.setData({ tomorrowExpanded: !this.data.tomorrowExpanded })
  },

  openStatusSheet() {
    this.setData({ statusSheetVisible: true })
  },

  // 跳记录页 (从 status sheet banner 触发, 让用户标记反应消退)
  gotoReviewFromBanner() {
    this.setData({ statusSheetVisible: false })
    wx.switchTab({ url: '/pages/review/review' })
  },

  closeStatusSheet() {
    this.setData({ statusSheetVisible: false })
  },

  setStatusNormal() {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    profile.currentStatus = 'normal'
    profile.statusSince = undefined
    wx.setStorageSync('babyProfile', profile)

    // 用户主动切回"正常"→ 把未消退的 gut / constipation 反应标记 resolved
    const reactions = getReactions()
    const nowIso = new Date().toISOString()
    let mutated = false
    for (const r of reactions) {
      if ((r.type === 'gut' || r.type === 'constipation') && !r.resolvedAt) {
        r.resolvedAt = nowIso
        mutated = true
      }
    }
    if (mutated) setReactions(reactions)

    rebuildPlan(wx.getStorageSync('babyProfile'))
    wx.showToast({ title: '已切换为正常', icon: 'success', duration: 1000 })
    this.setData({ statusSheetVisible: false })
    this.refresh()
  },

  setStatusPostVaccine(e: any) {
    const date: string = e.detail.value
    if (!date) return
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return
    profile.currentStatus = 'postVaccine'
    profile.statusSince = date  // YYYY-MM-DD 本地, 不存 ISO 避免 UTC 偏移 (parseLocalDateMs 同时兼容旧 ISO 数据)
    wx.setStorageSync('babyProfile', profile)
    rebuildPlan(wx.getStorageSync('babyProfile'))
    wx.showToast({ title: `疫苗后保护已开启`, icon: 'success', duration: 1200 })
    this.setData({ statusSheetVisible: false })
    this.refresh()
  },

  onShareAppMessage() {
    return {
      title: '辅食搭子 - 帮你管好宝宝辅食',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '辅食搭子 - 帮你管好宝宝辅食'
    }
  }
})
