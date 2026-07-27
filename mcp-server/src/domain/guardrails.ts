/**
 * Guardrail single entry point.
 *
 * The whole point of this module: there is exactly one place that decides
 * "is this food safe for this baby right now". All mutating tools (record_meal_log,
 * generate_today_menu, replace_meal, start_trying_food) MUST go through here.
 *
 * Architectural rule: this layer NEVER calls an LLM. It is the hard rule that
 * sits behind any LLM-driven recommendation.
 */
import { isFoodSafeForBaby, isRecipeApplicable } from '../../../utils/planner.js'
import { findTaboosForIngredients } from '../../../data/taboos.js'
import { getCategoryByFood } from '../../../data/categories.js'
import type { BabyProfile, Recipe, Taboo } from './fushi-types.js'

export interface FoodSafetyResult {
  food: string
  safe: boolean
  reason?: string
  categoryId?: string
  categoryState?: string
}

export interface SafetyCheckResult {
  safe: boolean
  results: FoodSafetyResult[]
  tabooWarnings: Taboo[]
  tabooBlocks: Taboo[]
}

/**
 * Check whether each food in `foods` is safe given the baby's profile.
 * Always returns a structured result — never throws. Callers decide whether
 * to throw based on `safe`.
 *
 * Optional `ctx.introducing` is passed through to isRecipeApplicable-equivalent
 * gating (used when a parent is asking "can I trial-introduce X").
 */
export function checkFoodsSafety(
  foods: string[],
  profile: BabyProfile,
  ctx: { introducing?: string } = {}
): SafetyCheckResult {
  const results: FoodSafetyResult[] = []
  for (const food of foods) {
    if (ctx.introducing === food) {
      // The food the user is intentionally introducing — defer to recipe-layer gate.
      results.push({ food, safe: true, reason: 'intentional trial-introduce target' })
      continue
    }
    const r = isFoodSafeForBaby(food, profile)
    const cat = getCategoryByFood(food)
    results.push({
      food,
      safe: r.safe,
      reason: r.reason,
      categoryId: cat?.id,
      categoryState: profile.categoryAllergies[cat?.id ?? '']?.state,
    })
  }

  const tabooWarnings: Taboo[] = findTaboosForIngredients(foods).filter((t: Taboo) => t.level === 'soft' && !!t.mitigation)
  const tabooBlocks: Taboo[] = findTaboosForIngredients(foods).filter((t: Taboo) => t.level === 'hard')

  const allSafe = results.every((r) => r.safe) && tabooBlocks.length === 0

  return { safe: allSafe, results, tabooWarnings, tabooBlocks }
}

/**
 * Filter a recipe list down to those safe for this baby.
 * ALWAYS applied — `tabooCheck` only controls whether soft taboo warnings
 * are populated on the returned recipes, never whether unsafe recipes leak through.
 *
 * Day 1: only used by check_food_safety; Day 2 wires this into generate_today_menu
 * and replace_meal.
 */
export function filterApplicableRecipes(
  recipes: Recipe[],
  profile: BabyProfile
): { applicable: Recipe[]; blocked: { recipe: Recipe; reason: string }[] } {
  const applicable: Recipe[] = []
  const blocked: { recipe: Recipe; reason: string }[] = []
  for (const r of recipes) {
    const result = isRecipeApplicable(r, profile)
    if (result.applicable) applicable.push(r)
    else blocked.push({ recipe: r, reason: result.reason ?? 'inapplicable' })
  }
  return { applicable, blocked }
}