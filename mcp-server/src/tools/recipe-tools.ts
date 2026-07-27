/**
 * Recipe tools: check_food_safety (Day 1) + list_recipes / get_recipe (Day 2).
 *
 * check_food_safety is a HARD GUARDRAIL tool — it NEVER calls an LLM.
 * It is the one path the LLM must consult before recommending any food.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { checkFoodSafety } from '../domain/safety.js'
import { listRecipes, getRecipeById } from '../domain/recipes.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const checkFoodSafetyInput = {
  foods: z
    .array(z.string().min(1))
    .min(1)
    .describe('Food names to check. Each food is evaluated independently.'),
  context: z
    .object({
      introducing: z
        .string()
        .optional()
        .describe(
          'Optional: name of a food the user is intentionally trial-introducing. That food is exempted from safety filtering.'
        ),
    })
    .optional(),
}

const listRecipesInput = {
  ageMonths: z
    .number()
    .int()
    .min(0)
    .max(36)
    .optional()
    .describe('Override the baby age for filtering. Default: profile.ageMonths'),
  mealCategory: z
    .enum(['staple', 'protein', 'veg', 'fruit'])
    .optional()
    .describe('Filter by meal category'),
  excludeFoods: z
    .array(z.string())
    .optional()
    .describe('Ingredient blacklist — recipes containing any are dropped'),
  excludeRecipeIds: z
    .array(z.string())
    .optional()
    .describe('Recipe id blacklist — used by "再换一批" to skip previous candidates'),
  inFridgeOnly: z
    .boolean()
    .optional()
    .describe('Only return recipes whose ingredients are all in the fridge'),
  tabooCheck: z
    .enum(['none', 'soft', 'hard', 'all'])
    .optional()
    .describe('Which taboo levels to surface as warnings. Unsafe recipes are NEVER returned regardless of this flag.'),
}

const getRecipeInput = {
  id: z.string().min(1).describe('Recipe id (e.g. "recipe_001")'),
}

export function registerRecipeTools(server: McpServer): void {
  server.tool(
    'check_food_safety',
    [
      'HARD GUARDRAIL — does NOT call an LLM.',
      'Check whether each food is safe for the active baby given their profile (allergy state, trying progress, taboo pairs, post-vaccine restrictions).',
      'Use this BEFORE recommending or recording any food. The LLM must never override an unsafe verdict.',
    ].join(' '),
    checkFoodSafetyInput,
    async (args) =>
      safeToolCall(
        () => checkFoodSafety({ foods: args.foods, context: args.context }),
        'check_food_safety failed'
      )
  )

  server.tool(
    'list_recipes',
    [
      'List recipes applicable to the active baby, with optional filters (age, category, exclude, fridge).',
      'Hard guardrail: recipes failing isRecipeApplicable are NEVER returned, regardless of tabooCheck.',
      'tabooCheck only controls whether soft/hard taboo warnings are attached.',
    ].join(' '),
    listRecipesInput,
    async (args) => safeToolCall(() => listRecipes(args), 'list_recipes failed')
  )

  server.tool(
    'get_recipe',
    'Fetch one recipe by id, with applicability verdict and per-ingredient safety check.',
    getRecipeInput,
    async (args) => safeToolCall(() => getRecipeById({ id: args.id }), 'get_recipe failed')
  )
}
