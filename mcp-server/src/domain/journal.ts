/**
 * Domain layer: journal tools (record_meal_log / undo_meal_log).
 *
 * THE central guardrail of the system: record_meal_log is the one place
 * that takes user-described foods and writes them into immutable storage
 * (mealJournal) AND deducts from the fridge. It MUST consult check_food_safety
 * first; unsafe verdicts are blocked unless the user has explicitly set
 * consentToBypassSafety=true in the call.
 *
 * The bypass flag is a USER signal: the LLM is expected to extract it from
 * the user's natural-language input, never to invent it. The MCP protocol
 * can't enforce that, so we make the audit trail unmistakable: bypassed logs
 * carry a `[BYPASSED SAFETY]` note prefix that's easy to grep and surface
 * in any review tool.
 *
 * Daily MealLog → fridge side-effects go through fushi-ditu's checkinMeal
 * (consumePortion) and uncheckinMeal (restorePortion), so inventory stays
 * consistent with what the user actually ate.
 */
import { readJson } from '../shim/storage.js'
import { checkFoodsSafety } from './guardrails.js'
import { checkinMeal, uncheckinMeal } from '../../../utils/checkin.js'
import { setPreference, getMealLog } from '../../../utils/journal.js'
import { getRecipe } from '../../../data/recipes.js'
import type {
  BabyProfile,
  Recipe,
  Portion,
  Preference,
  MealLog,
  SafetyCheckReport,
} from './fushi-types.js'

const BYPASS_PREFIX = '[BYPASSED SAFETY]'

export class SafetyBlockError extends Error {
  readonly safety: SafetyCheckReport
  constructor(safety: SafetyCheckReport) {
    super(
      `record_meal_log blocked: ${safety.flaggedFoods.length} unsafe food(s) and consentToBypassSafety was not set. ` +
        `Reasons: ${safety.reasons.join(' | ')}`
    )
    this.name = 'SafetyBlockError'
    this.safety = safety
  }
}

export interface RecordMealLogInput {
  date: string
  mealIndex: number
  ingredients: string[]
  recipeId?: string
  recipeName?: string
  portion: Portion
  preference: Preference | null
  note?: string
  eatenAt?: string
  customDishName?: string
  isCustom?: boolean
  /** MUST be set from user input, not invented by the LLM. */
  consentToBypassSafety?: boolean
}

export interface RecordMealLogOutput {
  log: MealLog
  consumed: { name: string; portions: number }[]
  safetyCheck: SafetyCheckReport
}

/**
 * Build a "virtual" Recipe when the user records a meal without a recipeId.
 * checkinMeal needs a Recipe; for custom logs we synthesize one with 1
 * portion per ingredient so consumePortion deducts correctly.
 */
function virtualRecipeFromIngredients(
  ingredients: string[],
  customDishName: string | undefined,
  recipeId: string | undefined
): Recipe {
  return {
    id: recipeId ?? `custom-${Date.now()}`,
    name: customDishName ?? '自定义',
    ingredients: ingredients.map((name) => ({ name, portions: 1 })),
    applicableMonthRange: [0, 36],
    unsuitableStatus: [],
    prepTimeMinutes: 0,
    difficulty: 'easy',
    steps: [],
    nutritionTags: [],
    mealCategories: ['staple'], // synthetic — bypasses isRecipeApplicable's required-rule check
  }
}

export function recordMealLog(input: RecordMealLogInput): RecordMealLogOutput {
  // 1. Load profile
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('record_meal_log: no babyProfile found in store. Run seed first.')
  }
  if (!input.ingredients || input.ingredients.length === 0) {
    throw new Error('record_meal_log: ingredients must be non-empty')
  }

  // 2. Safety gate — NEVER skip. This is the single chokepoint.
  const safety = checkFoodsSafety(input.ingredients, profile)
  const flagged = safety.results.filter((r) => !r.safe)
  const safetyReport: SafetyCheckReport = {
    bypassed: false,
    flaggedFoods: flagged.map((r) => ({ food: r.food, reason: r.reason ?? 'unknown' })),
    reasons: flagged.map((r) => `${r.food}: ${r.reason ?? 'unknown'}`),
  }

  if (flagged.length > 0) {
    if (!input.consentToBypassSafety) {
      // Hard block. Caller sees a structured error with the safety report.
      throw new SafetyBlockError(safetyReport)
    }
    // User explicitly bypassed — proceed but mark the audit trail.
    safetyReport.bypassed = true
  }

  // 3. Resolve recipe
  let recipe: Recipe
  if (input.recipeId) {
    const found = getRecipe(input.recipeId)
    if (!found) {
      throw new Error(`record_meal_log: recipe "${input.recipeId}" not found`)
    }
    recipe = found
  } else {
    recipe = virtualRecipeFromIngredients(input.ingredients, input.customDishName, input.recipeId)
  }

  // 4. Build override
  const override = {
    ...(input.customDishName ? { customDishName: input.customDishName } : {}),
    ...(input.ingredients.length > 0 ? { actualIngredients: input.ingredients } : {}),
    ...(input.portion ? { portion: input.portion } : {}),
    ...(input.note || safetyReport.bypassed
      ? {
          note: safetyReport.bypassed
            ? `${BYPASS_PREFIX} ${input.note ?? ''}`.trim()
            : input.note,
        }
      : {}),
    ...(input.eatenAt ? { eatenAt: input.eatenAt } : {}),
  }

  // 5. Persist (consumes fridge portions)
  const result = checkinMeal(input.date, input.mealIndex, recipe, override)

  // 6. Attach preference if provided (checkinMeal doesn't take it)
  if (input.preference) {
    setPreference(input.date, input.mealIndex, input.preference)
  }

  // Re-read the log so the response reflects the final state
  const finalLog: MealLog = {
    ...result.log,
    ...(input.preference ? { preference: input.preference } : {}),
  }

  return {
    log: finalLog,
    consumed: result.consumed,
    safetyCheck: safetyReport,
  }
}

export interface UndoMealLogInput {
  date: string
  mealIndex: number
}

export interface UndoMealLogOutput {
  date: string
  mealIndex: number
  removedLog: MealLog | null
  restored: { name: string; portions: number }[]
}

/**
 * Undo a previously recorded meal. Restores fridge portions through
 * fushi-ditu's uncheckinMeal (which knows about isCustom vs recipe-based
 * portions).
 */
export function undoMealLog(input: UndoMealLogInput): UndoMealLogOutput {
  const removedLog = getMealLog(input.date, input.mealIndex) ?? null
  if (!removedLog) {
    throw new Error(`undo_meal_log: no meal log for ${input.date} meal ${input.mealIndex}`)
  }
  uncheckinMeal(input.date, input.mealIndex)
  return {
    date: input.date,
    mealIndex: input.mealIndex,
    removedLog,
    // We don't easily know exactly what restorePortion did without re-reading
    // the recipe. For Day 3 simplicity, report the log's ingredients — the
    // user can verify by re-listing fridge. A future improvement is to
    // surface the actual restored amounts.
    restored: removedLog.ingredients.map((name) => ({ name, portions: 1 })),
  }
}
