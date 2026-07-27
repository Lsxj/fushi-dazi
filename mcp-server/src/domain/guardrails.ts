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
import { isRecipeApplicable } from '../../../utils/planner.js'
export {
  checkFoodsSafety,
  type FoodSafetyResult,
  type SafetyCheckResult,
} from '../../../utils/safety.js'
import type { BabyProfile, Recipe } from './fushi-types.js'

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
