import { getCategoryByFood } from '../data/categories'
import { findTaboosForIngredients, Taboo } from '../data/taboos'
import { FoodSafetyProfile, isFoodSafeForBaby } from './planner'

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
 * Shared deterministic food-safety boundary.
 *
 * It is intentionally runtime-agnostic and never calls an LLM. The mini-program,
 * MCP server, and HTTP API can all use this function without duplicating rules.
 */
export function checkFoodsSafety(
  foods: string[],
  profile: FoodSafetyProfile,
  context: { introducing?: string } = {}
): SafetyCheckResult {
  const results: FoodSafetyResult[] = []

  for (const food of foods) {
    if (context.introducing === food) {
      results.push({
        food,
        safe: true,
        reason: 'intentional trial-introduce target',
      })
      continue
    }

    const verdict = isFoodSafeForBaby(food, profile)
    const category = getCategoryByFood(food)
    results.push({
      food,
      safe: verdict.safe,
      reason: verdict.reason,
      categoryId: category?.id,
      categoryState: profile.categoryAllergies[category?.id ?? '']?.state,
    })
  }

  const taboos = findTaboosForIngredients(foods)
  const tabooWarnings = taboos.filter(
    (taboo) => taboo.level === 'soft' && !!taboo.mitigation
  )
  const tabooBlocks = taboos.filter((taboo) => taboo.level === 'hard')

  return {
    safe: results.every((result) => result.safe) && tabooBlocks.length === 0,
    results,
    tabooWarnings,
    tabooBlocks,
  }
}
