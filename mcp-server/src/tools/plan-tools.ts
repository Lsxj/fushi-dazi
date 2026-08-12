/**
 * Plan tools (Day 2): generate_today_menu / replace_meal / regenerate_week_plan.
 *
 * generate_today_menu is a HARD GUARDRAIL — every emitted recipe is
 * isRecipeApplicable-verified a second time here, on top of the planner's
 * internal pool filter. replace_meal delegates to pickReplacementCandidates
 * which already enforces applicability. regenerate_week_plan trusts
 * regenerateKeepingLoggedToday's safe-passthrough (also planner-internal).
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { generateTodayMenu, replaceMeal, regenerateWeekPlan } from '../domain/plan.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const generateTodayMenuInput = {
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Target date (YYYY-MM-DD). Default: today'),
  mealsPerDay: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe('Override mealsPerDay. Default: profile.mealsPerDay'),
  includeFridgeBoost: z
    .boolean()
    .optional()
    .describe('Prioritize fridge ingredients. (Day 2: planner tiebreak only.)'),
}

const replaceMealInput = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date of the meal to replace (YYYY-MM-DD)'),
  mealIndex: z.number().int().min(0).max(9).describe('Index of the meal in that day (0-based)'),
  excludeRecipeIds: z
    .array(z.string())
    .optional()
    .describe('Recipe ids to skip — used by "再换一批" to avoid duplicates'),
  topN: z.number().int().min(1).max(10).optional().describe('How many candidates to return. Default 3.'),
}

const regenerateWeekPlanInput = {
  days: z
    .number()
    .int()
    .min(1)
    .max(14)
    .optional()
    .describe('Plan length in days. Default 7.'),
}

export function registerPlanTools(server: McpServer): void {
  server.tool(
    'generate_today_menu',
    [
      'HARD GUARDRAIL — does NOT call an LLM.',
      'Generate the day\'s menu: staples + protein + veg + fruit, balanced with fridge + nutrition rules.',
      'Every recipe is isRecipeApplicable-verified twice. Unsafe recipes never appear in output.',
    ].join(' '),
    generateTodayMenuInput,
    async (args) => safeToolCall(() => generateTodayMenu(args), 'generate_today_menu failed')
  )

  server.tool(
    'replace_meal',
    'Return top-N replacement candidates for a single meal. Each candidate is isRecipeApplicable-verified by the planner.',
    replaceMealInput,
    async (args) => safeToolCall(() => replaceMeal(args), 'replace_meal failed')
  )

  server.tool(
    'regenerate_week_plan',
    'Re-generate the week plan. By default keeps today\'s already-logged meals. Persists the new plan to storage.',
    regenerateWeekPlanInput,
    async (args) =>
      safeToolCall(() => regenerateWeekPlan(args), 'regenerate_week_plan failed')
  )
}
