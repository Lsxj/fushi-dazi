/**
 * Profile mutation tools (Day 5).
 *
 * Six tools that write to babyProfile.json. See domain/profile-mutations.ts
 * for the full guardrail rationale. The critical one is mark_food_allergic,
 * which uses z.literal(true) on consentToConfirmIrreversible so the LLM
 * can't bypass the user-consent gate by passing false or omitting it.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  startTryingFood,
  completeTryingFood,
  abortTryingFood,
  markFoodAllergic,
  enterObservation,
  startIntroducing,
} from '../domain/profile-mutations.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const startTryingFoodInput = {
  categoryId: z.string().min(1).describe('Category id to trial-introduce into (e.g. "shrimp", "egg")'),
  food: z.string().min(1).describe('Food name to trial-introduce as the category representative'),
  daysRequired: z
    .number()
    .int()
    .min(1)
    .max(14)
    .optional()
    .describe('Override days. Default: 3 for new-category, 2 for in-category add.'),
  hasUnloggedToday: z
    .boolean()
    .optional()
    .describe('Whether the user already fed this food today. If omitted, inferred from the journal.'),
}

const completeTryingFoodInput = {
  categoryId: z.string().min(1).describe('Category id whose trying window is complete'),
}

const abortTryingFoodInput = {
  categoryId: z.string().min(1).describe('Category id whose trying window to abort'),
}

const markFoodAllergicInput = {
  food: z.string().min(1).describe('Food to permanently mark allergic'),
  reactionId: z
    .string()
    .min(1)
    .describe('REQUIRED — id of a record_reaction. The allergy must be traceable to a specific incident.'),
  consentToConfirmIrreversible: z
    .literal(true)
    .describe(
      'MUST be exactly true. This is a one-way action: the food is filtered out of all future plans until manually reverted. ' +
        'The LLM must extract explicit "yes, mark permanent" consent from the user, not invent it.'
    ),
  note: z.string().optional().describe('Optional note (e.g. "严重红疹,儿科确诊")'),
}

const enterObservationInput = {
  food: z.string().min(1).describe('Food to enter 7-day observation'),
  daysOverride: z.number().int().min(1).max(30).optional().describe('Override the 7-day default'),
  reactionId: z
    .string()
    .min(1)
    .optional()
    .describe('Optional but recommended — id of a record_reaction that triggered this observation.'),
  note: z.string().optional().describe('Optional note'),
}

const startIntroducingInput = {
  food: z.string().min(1).describe('Food to introduce over 3 days (in-category add scenario)'),
}

export function registerProfileMutationTools(server: McpServer): void {
  server.tool(
    'start_trying_food',
    [
      'Start a 3-day (or 2-day for in-category add) trying window for a new food.',
      'Guards: blocked when another trying is in flight, post-vaccine status, or active gut reaction.',
    ].join(' '),
    startTryingFoodInput,
    async (args) => safeToolCall(() => startTryingFood(args), 'start_trying_food failed')
  )

  server.tool(
    'complete_trying_food',
    'Mark the trying window as complete. Promotes the food to confirmedFoods and the category to open. Guard: blocked if dayIndex < daysRequired.',
    completeTryingFoodInput,
    async (args) => safeToolCall(() => completeTryingFood(args), 'complete_trying_food failed')
  )

  server.tool(
    'abort_trying_food',
    'Cancel a trying window in progress. Returns the category to open (in-category add) or untried (cross-category).',
    abortTryingFoodInput,
    async (args) => safeToolCall(() => abortTryingFood(args), 'abort_trying_food failed')
  )

  server.tool(
    'mark_food_allergic',
    [
      'IRREVERSIBLE — mark a food as permanently allergic. The food is filtered out of all future plans.',
      'Two-layer guard: reactionId is REQUIRED (audit trail back to record_reaction) AND consentToConfirmIrreversible must be exactly true (user must explicitly confirm).',
    ].join(' '),
    markFoodAllergicInput,
    async (args) => safeToolCall(() => markFoodAllergic(args), 'mark_food_allergic failed')
  )

  server.tool(
    'enter_observation',
    'Enter a 7-day observation window for a food (default 7; override with daysOverride). Optionally reference a record_reaction for audit.',
    enterObservationInput,
    async (args) => safeToolCall(() => enterObservation(args), 'enter_observation failed')
  )

  server.tool(
    'start_introducing',
    'Start a 3-day introducing window for an in-category add. Runs check_food_safety first; blocked if unsafe.',
    startIntroducingInput,
    async (args) => safeToolCall(() => startIntroducing(args), 'start_introducing failed')
  )
}
