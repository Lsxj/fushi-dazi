/**
 * Journal tools (Day 3): record_meal_log / undo_meal_log.
 *
 * record_meal_log is a HARD GUARDRAIL — it MUST consult check_food_safety
 * first. Unsafe ingredients are blocked unless the user explicitly sets
 * consentToBypassSafety=true. Bypassed logs carry a [BYPASSED SAFETY] note
 * prefix for audit.
 *
 * consentToBypassSafety is a USER signal: the LLM is expected to extract it
 * from the user's natural-language input, never to invent it. The tool
 * description makes this clear to the LLM at registration time.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { recordMealLog, undoMealLog, SafetyBlockError } from '../domain/journal.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const recordMealLogInput = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Meal date (YYYY-MM-DD)'),
  mealIndex: z.number().int().min(0).max(9).describe('Index of the meal in that day (0-based)'),
  ingredients: z
    .array(z.string().min(1))
    .min(1)
    .describe('Foods the baby actually ate. Each is checked against the active baby profile.'),
  recipeId: z.string().optional().describe('Optional recipe id from generate_today_menu. If absent, a virtual recipe is built from ingredients.'),
  recipeName: z.string().optional().describe('Optional display name; ignored if recipeId resolves.'),
  portion: z
    .enum(['taste', 'small', 'half', 'full'])
    .describe('How much the baby ate. UI surface: taste=尝几口, small=尝几口 (legacy), half=半份, full=1份'),
  preference: z
    .enum(['love', 'dislike'])
    .nullable()
    .describe('Love/dislike signal. Required (use null when the user did not express one).'),
  note: z.string().optional().describe('Free-form note (e.g. "宝宝挺爱吃"). Bypassed logs get a [BYPASSED SAFETY] prefix prepended.'),
  eatenAt: z.string().optional().describe('Override the meal time as ISO string. Default: now.'),
  customDishName: z.string().optional().describe('User-given dish name (e.g. "鳕鱼泥+米糊"). Used when recipeId is absent.'),
  isCustom: z.boolean().optional().describe('Hint: marks the log as user-modified. Today, checkinMeal auto-detects via actualIngredients.'),
  consentToBypassSafety: z
    .boolean()
    .optional()
    .describe(
      'USER signal — the user explicitly accepted an unsafe verdict. ' +
        'Must be extracted from the user\'s natural-language input. ' +
        'The LLM MUST NOT invent this flag. ' +
        'Bypassed logs are audited with a [BYPASSED SAFETY] note prefix.'
    ),
}

const undoMealLogInput = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Meal date (YYYY-MM-DD)'),
  mealIndex: z.number().int().min(0).max(9).describe('Index of the meal in that day (0-based)'),
}

export function registerJournalTools(server: McpServer): void {
  server.tool(
    'record_meal_log',
    [
      'HARD GUARDRAIL — does NOT call an LLM.',
      'Record a meal the baby ate. Always runs check_food_safety first; unsafe ingredients are blocked unless the USER explicitly set consentToBypassSafety=true in this call.',
      'The LLM must extract consentToBypassSafety from the user\'s natural-language input only — it must never invent the flag. Bypassed logs carry a [BYPASSED SAFETY] note prefix for audit.',
    ].join(' '),
    recordMealLogInput,
    async (args) =>
      safeToolCall(
        () => recordMealLog(args),
        'record_meal_log blocked'
      )
  )

  server.tool(
    'undo_meal_log',
    'Undo a previously recorded meal. Restores fridge portions. Throws if no log exists for the given date+mealIndex.',
    undoMealLogInput,
    async (args) => safeToolCall(() => undoMealLog(args), 'undo_meal_log failed')
  )
}
