/**
 * Domain layer: reaction tools (record_reaction / analyze_suspect_foods).
 *
 * analyze_suspect_foods runs purely on rules — ZERO LLM — and emits a
 * `ruleTrace` so operators and developers can verify exactly
 * why each suspect was elevated or skipped:
 *
 *   - introducingChecked: ingredients currently in the 3-day introducing window
 *   - allergicSkipped: ingredients already marked allergic (never re-suspect)
 *   - confirmedSkipped: ingredients in the parent's confirmedFoods whitelist
 *   - tryingDayLabel: which day of the 3-day trying protocol we're on
 *
 * "Tell me which food caused this reaction" is not a pattern-match call to
 * an LLM. It's a deterministic rule walk over the
 * baby's profile + journal + the 72h traceback window.
 */
import { readJson, writeJson } from '../shim/storage.js'
import {
  addReaction,
  traceback72h,
  isSeverDirectAllergic,
  getReactions,
} from '../../../utils/reactions.js'
import { analyzeSuspects } from '../../../utils/observation.js'
import { getCategoryByFood } from '../../../data/categories.js'
import type {
  BabyProfile,
  ReactionType,
  ReactionSeverity,
  ReactionLog,
  AnalyzedSuspect,
  RuleTrace,
  MealLog,
} from './fushi-types.js'

function loadProfile(): BabyProfile {
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('reactions: no babyProfile found in store. Run seed first.')
  }
  return profile
}

function genId(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ---- record_reaction ----

export interface RecordReactionInput {
  type: ReactionType
  severity: ReactionSeverity
  occurredAt: string
  note?: string
  /** Optional: user-supplied "I suspect X" hint. We still run our own rule analysis. */
  tracebackIngredients?: string[]
}

export type RecommendationAction =
  | { action: 'markAllergic'; reason: string }
  | { action: 'pediatricCare'; reason: string }
  | { action: 'enterObservation'; reason: string; days: number }
  | { action: 'monitor'; reason: string }

export interface RecordReactionOutput {
  reaction: ReactionLog
  tracebackMeals: { date: string; mealIndex: number; recipeName: string; ingredients: string[] }[]
  initialSuspects: AnalyzedSuspect[]
  isSeverDirectAllergic: boolean
  recommendation: RecommendationAction
}

function recommend(
  severity: ReactionSeverity,
  type: ReactionType
): RecommendationAction {
  if (severity === 'severe') {
    return {
      action: 'markAllergic',
      reason: '严重反应 — 建议直接确诊为过敏,下次避免',
    }
  }
  if (type === 'vomit' && severity !== 'mild') {
    return {
      action: 'pediatricCare',
      reason: '呕吐中度以上 — 建议先看儿科,不要家庭重试',
    }
  }
  if (severity === 'moderate') {
    return {
      action: 'enterObservation',
      reason: '中度反应 — 进入 7 天观察期后再重试',
      days: 7,
    }
  }
  return {
    action: 'monitor',
    reason: '轻微反应 — 暂不标记,继续观察后续餐次',
  }
}

/**
 * Record a reaction the baby just had.
 *
 * 1. Pull 72h traceback meals from journal (uses eatenAt if present, falls
 *    back to loggedAt — important for back-filled meals).
 * 2. Run analyzeSuspects over the union of traceback ingredients + any
 *    user-supplied tracebackIngredients.
 * 3. Persist the reaction with traceback + initialSuspects attached.
 * 4. Return a recommendation based on severity/type.
 */
export function recordReaction(input: RecordReactionInput): RecordReactionOutput {
  const profile = loadProfile()

  // 1. 72h traceback
  const tracebackLogs = traceback72h(input.occurredAt)
  const tracebackMeals = tracebackLogs.map((l: MealLog) => ({
    date: l.date,
    mealIndex: l.mealIndex,
    recipeName: l.recipeName,
    ingredients: l.ingredients,
  }))

  // 2. Union of traceback ingredients + user hint
  const ingredientSet = new Set<string>()
  tracebackMeals.forEach((m) => m.ingredients.forEach((i) => ingredientSet.add(i)))
  ;(input.tracebackIngredients ?? []).forEach((i) => ingredientSet.add(i))
  const allIngredients = [...ingredientSet]

  // 3. Rule-based suspect analysis (zero LLM)
  const initialSuspectsRaw = analyzeSuspects(profile, allIngredients, input.occurredAt)
  const initialSuspects: AnalyzedSuspect[] = initialSuspectsRaw.map((s) => {
    const cat = getCategoryByFood(s.name)
    return {
      ...s,
      ...(cat?.id ? { categoryId: cat.id } : {}),
      ...(profile.categoryAllergies[cat?.id ?? '']?.state
        ? { categoryState: profile.categoryAllergies[cat?.id ?? '']?.state }
        : {}),
    }
  })

  // 4. Persist
  const reaction: ReactionLog = {
    id: genId(),
    occurredAt: input.occurredAt,
    type: input.type,
    severity: input.severity,
    ...(input.note ? { note: input.note } : {}),
    tracebackMeals,
    suspectedFoods: initialSuspects.map((s) => s.name),
  }
  addReaction(reaction)

  return {
    reaction,
    tracebackMeals,
    initialSuspects,
    isSeverDirectAllergic: isSeverDirectAllergic(input.severity, input.type),
    recommendation: recommend(input.severity, input.type),
  }
}

// ---- analyze_suspect_foods ----

export interface AnalyzeSuspectFoodsInput {
  reactionId: string
  asOfDate?: string
}

export interface AnalyzeSuspectFoodsOutput {
  reaction: ReactionLog
  suspects: AnalyzedSuspect[]
  ruleTrace: RuleTrace
  recommendation: RecommendationAction
}

/**
 * Re-run the suspect analysis for a previously recorded reaction and
 * surface the rule trace. This is the "show your work" tool the LLM,
 * operators, and developers can read to verify every classification.
 */
export function analyzeSuspectFoods(
  input: AnalyzeSuspectFoodsInput
): AnalyzeSuspectFoodsOutput {
  const profile = loadProfile()
  const all = getReactions()
  const reaction = all.find((r) => r.id === input.reactionId)
  if (!reaction) {
    throw new Error(`analyze_suspect_foods: reaction "${input.reactionId}" not found`)
  }

  // Re-derive ingredients from reaction.tracebackMeals (so this works even
  // if the journal has been edited since record_reaction ran), AND pull
  // any user-supplied tracebackIngredients back from reaction.suspectedFoods
  // (record_reaction stores them there). This is the union analyzer sees.
  const ingredientSet = new Set<string>()
  reaction.tracebackMeals.forEach((m) => m.ingredients.forEach((i) => ingredientSet.add(i)))
  reaction.suspectedFoods.forEach((i) => ingredientSet.add(i))
  const allIngredients = [...ingredientSet]

  const rawSuspects = analyzeSuspects(profile, allIngredients, reaction.occurredAt)

  // Build rule trace — walk the same rules fushi-ditu used and record which
  // ingredients hit which branch. This duplicates the logic slightly but
  // gives us a single source of truth for the "show your work" output.
  const ruleTrace: RuleTrace = {
    allergicSkipped: [],
    confirmedSkipped: [],
    introducingChecked: [],
    tryingDayLabel: null,
  }
  for (const ing of allIngredients) {
    const ex = profile.individualExceptions[ing]
    if (ex?.state === 'allergic') {
      ruleTrace.allergicSkipped.push(ing)
    } else if (ex?.state === 'introducing') {
      ruleTrace.introducingChecked.push(ing)
    }
    if (profile.confirmedFoods?.includes(ing)) {
      ruleTrace.confirmedSkipped.push(ing)
    }
  }
  // tryingDayLabel: any ingredient in active trying window?
  const reactionMs = new Date(reaction.occurredAt).getTime()
  for (const ing of allIngredients) {
    const cat = getCategoryByFood(ing)
    if (!cat) continue
    const catState = profile.categoryAllergies[cat.id]
    if (
      catState?.state === 'trying' &&
      catState.tryingFood === ing &&
      catState.tryingStartDate
    ) {
      const startMs = new Date(catState.tryingStartDate).getTime()
      const daysSince = Math.floor((reactionMs - startMs) / 86400000)
      const replacedCount = (catState.tryingReplacedDates || []).length
      const dayIndex = Math.max(1, daysSince + 1 - replacedCount)
      const daysRequired = catState.tryingDaysRequired ?? 3
      ruleTrace.tryingDayLabel = `排敏第 ${dayIndex}/${daysRequired} 天 (${cat.name})`
      break
    }
  }
  void input.asOfDate // reserved for future "as-of" re-analysis

  const suspects: AnalyzedSuspect[] = rawSuspects.map((s) => {
    const cat = getCategoryByFood(s.name)
    return {
      ...s,
      ...(cat?.id ? { categoryId: cat.id } : {}),
      ...(profile.categoryAllergies[cat?.id ?? '']?.state
        ? { categoryState: profile.categoryAllergies[cat?.id ?? '']?.state }
        : {}),
    }
  })

  return {
    reaction,
    suspects,
    ruleTrace,
    recommendation: recommend(reaction.severity, reaction.type),
  }
}
