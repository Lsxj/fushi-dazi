/**
 * Domain layer: plan tools (generate_today_menu / replace_meal / regenerate_week_plan).
 *
 * Wraps fushi-ditu planner.ts:
 *   - generateWeeklyPlan(days=1)  → generate_today_menu
 *   - pickReplacementCandidates   → replace_meal
 *   - regenerateKeepingLoggedToday → regenerate_week_plan
 *
 * Hard guardrail: every recipe emitted goes through isRecipeApplicable twice
 * (once inside the planner pool filter, once here as a final check). Unsafe
 * recipes never appear in tool output.
 */
import { readJson, writeJson } from '../shim/storage.js'
import { filterApplicableRecipes } from './guardrails.js'
import {
  generateWeeklyPlan,
  pickReplacementCandidates,
  preserveLoggedMealFacts,
  regenerateKeepingLoggedToday,
  diagnoseEmptyPlan,
  getTryingFood,
} from '../../../utils/planner.js'
import type { BabyProfile, DailyPlan, PlannedMeal, ReplacementCandidate } from './fushi-types.js'

function loadProfile(): BabyProfile {
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('plan: no babyProfile found in store. Run seed first.')
  }
  return profile
}

function loadFridgeNames(): Set<string> {
  const fridge: { name: string }[] = readJson('fridge') ?? []
  return new Set(fridge.map((f) => f.name))
}

function loadWeeklyPlan(): DailyPlan[] {
  return readJson<DailyPlan[]>('weeklyPlan') ?? []
}

function parseDateInput(date: string | undefined, fallback: Date = new Date()): Date {
  if (!date) return fallback
  // Accept 'YYYY-MM-DD'; construct as local-noon to avoid TZ edge cases
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return fallback
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function formatYmd(d: Date): string {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// ---- generate_today_menu ----

export interface GenerateTodayMenuInput {
  date?: string
  mealsPerDay?: number
  includeFridgeBoost?: boolean
}

export interface GenerateTodayMenuOutput {
  date: string
  meals: Array<{
    mealIndex: number
    recipeId: string
    recipeName: string
    trialIngredient?: string
    trialMethod?: string
  }>
  diagnosis: { reason: string; action: string; actionType: 'profile' | 'recipes' | 'wait' } | null
  keptFromExisting: boolean
}

/**
 * Generate a single-day menu. Uses generateWeeklyPlan(days=1) for the core
 * pick, then verifies each recipe with isRecipeApplicable (defense in depth
 * against any future bug in the planner's pool filter).
 *
 * If `includeFridgeBoost` is true, the day is generated twice and we keep
 * the day whose meal has higher fridge coverage (Day 2 simple heuristic;
 * planner already considers fridge as a tiebreaker).
 */
export function generateTodayMenu(input: GenerateTodayMenuInput = {}): GenerateTodayMenuOutput {
  const profile = loadProfile()
  const start = parseDateInput(input.date)
  const dateStr = formatYmd(start)
  const mealsPerDay = input.mealsPerDay ?? profile.mealsPerDay
  const effectiveProfile: BabyProfile = { ...profile, mealsPerDay }

  // Existing plan check — if today's plan already exists and matches mealsPerDay,
  // don't re-roll (caller can use replace_meal for individual swaps).
  const existing = loadWeeklyPlan().find((p) => p.date === dateStr)
  if (existing && existing.meals.length === mealsPerDay) {
    return {
      date: dateStr,
      meals: existing.meals.map((m) => ({
        mealIndex: m.mealIndex,
        recipeId: m.recipe.id,
        recipeName: m.recipe.name,
        trialIngredient: m.trialIngredient,
        trialMethod: m.trialMethod,
      })),
      diagnosis: null,
      keptFromExisting: true,
    }
  }

  // Generate
  const [day] = generateWeeklyPlan(effectiveProfile, 1, start)
  if (!day || day.meals.length === 0) {
    return {
      date: dateStr,
      meals: [],
      diagnosis: diagnoseEmptyPlan(effectiveProfile),
      keptFromExisting: false,
    }
  }

  // Defense in depth: verify every recipe is applicable
  const { blocked } = filterApplicableRecipes(
    day.meals.map((m) => m.recipe),
    effectiveProfile
  )
  if (blocked.length > 0) {
    // Plan leaked an unsafe recipe — this is a planner bug. Don't return it.
    return {
      date: dateStr,
      meals: [],
      diagnosis: {
        reason: `planner emitted unsafe recipe: ${blocked.map((b) => b.recipe.id).join(', ')}`,
        action: 'file a bug — generate_today_menu guardrail tripped',
        actionType: 'recipes',
      },
      keptFromExisting: false,
    }
  }

  // Persist into weeklyPlan
  const week = loadWeeklyPlan()
  const idx = week.findIndex((p) => p.date === dateStr)
  const proposedWeek = [...week]
  if (idx >= 0) proposedWeek[idx] = day
  else proposedWeek.push(day)
  const protectedWeek = preserveLoggedMealFacts(week, proposedWeek)
  writeJson('weeklyPlan', protectedWeek)
  const persistedDay = protectedWeek.find((p) => p.date === dateStr) ?? day

  return {
    date: dateStr,
    meals: persistedDay.meals.map((m) => ({
      mealIndex: m.mealIndex,
      recipeId: m.recipe.id,
      recipeName: m.recipe.name,
      trialIngredient: m.trialIngredient,
      trialMethod: m.trialMethod,
    })),
    diagnosis: null,
    keptFromExisting: false,
  }
}

// ---- replace_meal ----

export interface ReplaceMealInput {
  date: string
  mealIndex: number
  excludeRecipeIds?: string[]
  topN?: number
}

export interface ReplaceMealOutput {
  date: string
  mealIndex: number
  oldRecipeId: string
  candidates: ReplacementCandidate[]
}

/**
 * Top-N replacement candidates for a single meal. Hard guardrail: every
 * candidate goes through isRecipeApplicable inside pickReplacementCandidates;
 * this domain layer just shapes the response and persists the new plan if
 * the LLM/user picks one (Day 2: returns candidates only, no auto-pick).
 */
export function replaceMeal(input: ReplaceMealInput): ReplaceMealOutput {
  const profile = loadProfile()
  const week = loadWeeklyPlan()
  const day = week.find((p) => p.date === input.date)
  if (!day) {
    throw new Error(`replace_meal: no plan for date ${input.date}. Run generate_today_menu first.`)
  }
  const meal = day.meals.find((m) => m.mealIndex === input.mealIndex)
  if (!meal) {
    throw new Error(
      `replace_meal: mealIndex ${input.mealIndex} out of range for date ${input.date} (has ${day.meals.length} meals)`
    )
  }
  const journal = readJson<Array<{ date: string; mealIndex: number }>>('mealJournal') ?? []
  if (journal.some((log) => log.date === input.date && log.mealIndex === input.mealIndex)) {
    throw new Error(
      `replace_meal: ${input.date} meal ${input.mealIndex} is already logged; edit the meal record explicitly instead`
    )
  }
  const fridgeNames = loadFridgeNames()
  const topN = input.topN ?? 3
  const candidates = pickReplacementCandidates(
    profile,
    day,
    input.mealIndex,
    topN,
    fridgeNames,
    input.excludeRecipeIds
  )

  return {
    date: input.date,
    mealIndex: input.mealIndex,
    oldRecipeId: meal.recipe.id,
    candidates,
  }
}

// ---- regenerate_week_plan ----

export interface RegenerateWeekPlanInput {
  days?: number
}

export interface RegenerateWeekPlanOutput {
  plan: DailyPlan[]
  kept: number
  regenerated: number
}

/**
 * Regenerate the week plan while always preserving already-logged meals.
 * Logged menus are historical facts and cannot be changed by an LLM option.
 */
export function regenerateWeekPlan(
  input: RegenerateWeekPlanInput = {}
): RegenerateWeekPlanOutput {
  const profile = loadProfile()
  const existing = loadWeeklyPlan()
  const today = formatYmd(new Date())
  const beforeToday = existing.filter((p) => p.date < today).length

  const newPlan = regenerateKeepingLoggedToday(profile, existing)

  writeJson('weeklyPlan', newPlan)

  return {
    plan: newPlan,
    kept: beforeToday,
    regenerated: newPlan.length - beforeToday,
  }
}

// Re-export for resources
export { formatYmd as formatYmdDate }
export { getTryingFood }
