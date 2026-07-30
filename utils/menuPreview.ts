import { RECIPES, type Recipe } from '../data/recipes'
import { checkFoodsSafety } from './safety'
import type { FoodSafetyProfile } from './planner'

export interface MenuPreviewMeal {
  slot: 'breakfast' | 'lunch'
  recipeId: string
  recipeName: string
  ingredients: string[]
}

export interface MenuPreviewExclusion {
  recipeId: string
  recipeName: string
  blockedFood: string
  reason: string
  rule: 'individual-allergy' | 'food-safety'
}

export interface DeterministicMenuPreview {
  meals: MenuPreviewMeal[]
  exclusions: MenuPreviewExclusion[]
}

const candidateIdsBySlot = {
  breakfast: ['r002'],
  lunch: ['r005', 'r010'],
} satisfies Record<MenuPreviewMeal['slot'], string[]>

function getRequiredRecipe(recipeId: string): Recipe {
  const recipe = RECIPES.find((candidate) => candidate.id === recipeId)
  if (!recipe) {
    throw new Error(`menu preview recipe "${recipeId}" is missing`)
  }
  return recipe
}

/**
 * Builds a stable two-meal preview from real recipes.
 *
 * Candidate order represents product ranking only. Every candidate must pass
 * the shared deterministic safety boundary before it can enter the menu.
 */
export function generateDeterministicMenuPreview(
  profile: FoodSafetyProfile
): DeterministicMenuPreview {
  const meals: MenuPreviewMeal[] = []
  const exclusions: MenuPreviewExclusion[] = []

  for (const [slot, recipeIds] of Object.entries(candidateIdsBySlot) as [
    MenuPreviewMeal['slot'],
    string[],
  ][]) {
    for (const recipeId of recipeIds) {
      const recipe = getRequiredRecipe(recipeId)
      const ingredients = recipe.ingredients.map((ingredient) => ingredient.name)
      const safety = checkFoodsSafety(ingredients, profile)

      if (safety.safe) {
        meals.push({
          slot,
          recipeId: recipe.id,
          recipeName: recipe.name,
          ingredients,
        })
        break
      }

      const blocked = safety.results.find((result) => !result.safe)
      if (blocked) {
        exclusions.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          blockedFood: blocked.food,
          reason: blocked.reason ?? `${blocked.food}未通过安全规则`,
          rule:
            profile.individualExceptions[blocked.food]?.state === 'allergic'
              ? 'individual-allergy'
              : 'food-safety',
        })
      }
    }
  }

  return { meals, exclusions }
}
