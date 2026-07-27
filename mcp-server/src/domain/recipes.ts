/**
 * Domain layer: list_recipes / get_recipe.
 *
 * list_recipes: filter + warn over RECIPES.
 *   - ALWAYS runs isRecipeApplicable (guarded — unsafe never leaks through)
 *   - tabooCheck only controls whether soft taboo warnings are attached
 *
 * get_recipe: lookup by id + applicability verdict.
 */
import { readJson } from '../shim/storage.js'
import { filterApplicableRecipes, checkFoodsSafety } from './guardrails.js'
import { isRecipeApplicable } from '../../../utils/planner.js'
import { getRecipe, RECIPES, getApplicableByMealCategory } from '../../../data/recipes.js'
import { findTaboosForIngredients } from '../../../data/taboos.js'
import type { BabyProfile, Recipe, Taboo } from './fushi-types.js'

type MealCategory = 'staple' | 'protein' | 'veg' | 'fruit'
type TabooCheckLevel = 'soft' | 'hard' | 'all' | 'none'

export interface ListRecipesInput {
  ageMonths?: number
  mealCategory?: MealCategory
  excludeFoods?: string[]
  excludeRecipeIds?: string[]
  inFridgeOnly?: boolean
  tabooCheck?: TabooCheckLevel
}

export interface RecipeWithWarnings {
  recipe: Recipe
  warnings: Taboo[]
  inFridge?: { count: number; all: boolean; ingredientNames: string[] }
}

export interface ListRecipesOutput {
  recipes: RecipeWithWarnings[]
  totalConsidered: number
  filteredOut: { recipe: Recipe; reason: string }[]
}

/**
 * Filter RECIPES by the given criteria. Hard guardrail: unsafe recipes never
 * appear in `recipes`, regardless of tabooCheck.
 */
export function listRecipes(
  input: ListRecipesInput = {},
  profileOverride?: BabyProfile
): ListRecipesOutput {
  // Resolve profile: optional override > storage
  const profile = profileOverride ?? readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('list_recipes: no babyProfile found in store. Run seed first.')
  }

  // ageMonths override lets "宝宝 11 月了能吃什么" work without mutating storage
  const effectiveProfile: BabyProfile =
    input.ageMonths !== undefined ? { ...profile, ageMonths: input.ageMonths } : profile

  // Base pool
  let pool: Recipe[] = [...RECIPES]

  if (input.mealCategory) {
    pool = pool.filter((r) => r.mealCategories.includes(input.mealCategory!))
  }
  if (input.excludeRecipeIds && input.excludeRecipeIds.length > 0) {
    const excluded = new Set(input.excludeRecipeIds)
    pool = pool.filter((r) => !excluded.has(r.id))
  }
  if (input.excludeFoods && input.excludeFoods.length > 0) {
    const excluded = new Set(input.excludeFoods)
    pool = pool.filter((r) => !r.ingredients.some((i) => excluded.has(i.name)))
  }

  // Fridge: pre-compute names Set once
  const fridge: { name: string; portions: number }[] = readJson('fridge') ?? []
  const fridgeNames = new Set(fridge.map((f) => f.name))
  if (input.inFridgeOnly) {
    pool = pool.filter((r) =>
      r.ingredients.length > 0 && r.ingredients.every((i) => fridgeNames.has(i.name))
    )
  }

  // Apply hard guardrail
  const { applicable, blocked } = filterApplicableRecipes(pool, effectiveProfile)

  // Taboo warnings: tabooCheck controls whether we attach them; never blocks
  const tabooLevel: TabooCheckLevel = input.tabooCheck ?? 'soft'
  const recipesWithWarnings: RecipeWithWarnings[] = applicable.map((recipe) => {
    let warnings: Taboo[] = []
    if (tabooLevel !== 'none') {
      const ingredientNames = recipe.ingredients.map((i) => i.name)
      const all = findTaboosForIngredients(ingredientNames)
      warnings = all.filter((t) => {
        if (tabooLevel === 'hard') return t.level === 'hard'
        if (tabooLevel === 'soft') return t.level === 'soft'
        return t.level === 'hard' || t.level === 'soft' // 'all'
      })
    }
    const inFridgeIngredientNames = recipe.ingredients
      .map((i) => i.name)
      .filter((n) => fridgeNames.has(n))
    return {
      recipe,
      warnings,
      inFridge: {
        count: inFridgeIngredientNames.length,
        all: inFridgeIngredientNames.length === recipe.ingredients.length && recipe.ingredients.length > 0,
        ingredientNames: inFridgeIngredientNames,
      },
    }
  })

  return {
    recipes: recipesWithWarnings,
    totalConsidered: RECIPES.length,
    filteredOut: blocked,
  }
}

export interface GetRecipeInput {
  id: string
}

export interface GetRecipeOutput {
  recipe: Recipe
  applicable: boolean
  reason?: string
  warnings: Taboo[]
  safety: ReturnType<typeof checkFoodsSafety>
}

/**
 * Fetch a recipe by id. Verifies applicability for the active profile.
 * Includes per-ingredient safety so the LLM can show "鳕鱼 open+confirmed"
 * alongside the recipe body.
 */
export function getRecipeById(input: GetRecipeInput): GetRecipeOutput {
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('get_recipe: no babyProfile found in store. Run seed first.')
  }
  const recipe = getRecipe(input.id)
  if (!recipe) {
    throw new Error(`get_recipe: recipe "${input.id}" not found`)
  }

  // We use the same path the planner uses to evaluate recipes
  const applicability = isRecipeApplicable(recipe, profile)
  const ingredientNames = recipe.ingredients.map((i) => i.name)
  const safety = checkFoodsSafety(ingredientNames, profile)
  const warnings = applicability.warnings ?? []

  return {
    recipe,
    applicable: applicability.applicable,
    reason: applicability.reason,
    warnings,
    safety,
  }
}

// Re-exported for resources that want to filter by category
export { getApplicableByMealCategory }
