/**
 * Recipe resources (Day 2).
 *
 *   - fushi://profile            → BabyProfile + ageMonths + trying state
 *   - fushi://recipes/{categoryId} → applicable recipes in a category
 *
 * Resources are read-only views; mutation goes through tools.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readBabyProfile } from '../domain/profile.js'
import { listRecipes } from '../domain/recipes.js'

const textResult = (uri: string, data: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  ],
})

export function registerRecipeResources(server: McpServer): void {
  // fushi://profile — full profile snapshot
  server.resource(
    'fushi-profile',
    'fushi://profile',
    {
      description: 'Active baby profile + ageMonths + trying state + next recommendations',
      mimeType: 'application/json',
    },
    async (uri) => textResult(uri.href, readBabyProfile())
  )

  // fushi://recipes/{categoryId} — recipes in a single category, hard guardrailed
  server.resource(
    'fushi-recipes-by-category',
    new ResourceTemplate('fushi://recipes/{categoryId}', { list: undefined }),
    {
      description: 'Applicable recipes in a category (staple / protein / veg / fruit)',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const categoryId = String(vars.categoryId)
      const data = listRecipes({ mealCategory: categoryId as 'staple' | 'protein' | 'veg' | 'fruit' })
      return textResult(uri.href, data)
    }
  )
}
