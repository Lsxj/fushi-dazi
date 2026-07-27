/**
 * McpServer factory + tool/resource registration.
 *
 * Day 1: 2 tools (read_baby_profile, check_food_safety).
 * Day 2: + 5 tools (list_recipes, get_recipe, generate_today_menu, replace_meal, regenerate_week_plan)
 *         + 4 resources (fushi://profile, recipes/{categoryId}, plan/today, plan/week).
 * Day 3: + 6 tools (record_meal_log, undo_meal_log, list_fridge, add_fridge_item, use_fridge_item, get_fridge_advice)
 *         + 3 resources (fushi://fridge, journal/{days}, journal/week).
 * Day 4: + 2 tools (record_reaction, analyze_suspect_foods) + 1 resource (reactions/{days})
 *         + 2 prompts (reaction_followup, daily_checkin).
 * Day 5: + 6 tools (start/complete/abort_trying_food, mark_food_allergic, enter_observation, start_introducing)
 *         + 2 resources (profile/trying-progress, recommendations/next)
 *         + 1 prompt (introduce_new_food).
 * Day 6: + 1 tool (get_week_summary). v0.5.0.
 * Day 8: + 1 tool (narrate_week) — wraps get_week_summary + LLM narration.
 *         LLM provider is in src/llm/ (anthropic SDK if ANTHROPIC_API_KEY,
 *         mock otherwise). v0.6.0 — interview-ready + LLM integration demo.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerProfileTools } from './tools/profile-tools.js'
import { registerRecipeTools } from './tools/recipe-tools.js'
import { registerPlanTools } from './tools/plan-tools.js'
import { registerJournalTools } from './tools/journal-tools.js'
import { registerFridgeTools } from './tools/fridge-tools.js'
import { registerReactionTools } from './tools/reaction-tools.js'
import { registerProfileMutationTools } from './tools/profile-mutation-tools.js'
import { registerReviewTools } from './tools/review-tools.js'
import { registerLLMTools } from './tools/llm-tools.js'
import { registerRecipeResources } from './resources/recipe-resources.js'
import { registerPlanResources } from './resources/plan-resources.js'
import { registerFridgeResource } from './resources/fridge-resource.js'
import { registerJournalResources } from './resources/journal-resource.js'
import { registerReactionsResource } from './resources/reactions-resource.js'
import { registerProfileExtraResources } from './resources/profile-extra-resources.js'
import { registerReactionFollowupPrompt } from './prompts/reaction-followup.js'
import { registerDailyCheckinPrompt } from './prompts/daily-checkin.js'
import { registerIntroduceNewFoodPrompt } from './prompts/introduce-new-food.js'

export interface FushiServerOptions {
  name?: string
  version?: string
}

export function createFushiServer(opts: FushiServerOptions = {}): McpServer {
  const server = new McpServer({
    name: opts.name ?? 'fushi-mcp',
    version: opts.version ?? '0.6.0',
  })

  // Tools
  registerProfileTools(server)
  registerRecipeTools(server)
  registerPlanTools(server)
  registerJournalTools(server)
  registerFridgeTools(server)
  registerReactionTools(server)
  registerProfileMutationTools(server)
  registerReviewTools(server)
  registerLLMTools(server)

  // Resources
  registerRecipeResources(server)
  registerPlanResources(server)
  registerFridgeResource(server)
  registerJournalResources(server)
  registerReactionsResource(server)
  registerProfileExtraResources(server)

  // Prompts
  registerReactionFollowupPrompt(server)
  registerDailyCheckinPrompt(server)
  registerIntroduceNewFoodPrompt(server)

  return server
}