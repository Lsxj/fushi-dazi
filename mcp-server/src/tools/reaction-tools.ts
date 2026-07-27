/**
 * Reaction tools (Day 4): record_reaction / analyze_suspect_foods.
 *
 * analyze_suspect_foods is the KILLER DEMO — it surfaces a ruleTrace so
 * the LLM (and the interviewer) can verify exactly which branch each
 * ingredient hit. Both tools are pure rules; they do not call any LLM.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { recordReaction, analyzeSuspectFoods } from '../domain/reactions.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const recordReactionInput = {
  type: z
    .enum(['gut', 'rash', 'vomit', 'sleepy', 'fever', 'constipation'])
    .describe('Reaction type'),
  severity: z.enum(['mild', 'moderate', 'severe']).describe('How severe'),
  occurredAt: z
    .string()
    .describe('ISO timestamp of when the reaction started. Used as the upper bound of the 72h traceback window.'),
  note: z.string().optional().describe('Optional free-form note (e.g. "拉稀 3 次,持续 2 小时")'),
  tracebackIngredients: z
    .array(z.string())
    .optional()
    .describe('User-supplied suspect hint. Merged with the 72h journal traceback before running the rule analysis.'),
}

const analyzeSuspectFoodsInput = {
  reactionId: z.string().describe('ID of a previously recorded reaction'),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Reserved: re-analyze as if "today" were this date.'),
}

export function registerReactionTools(server: McpServer): void {
  server.tool(
    'record_reaction',
    [
      'Record a reaction. Pulls 72h of meal logs, runs rule-based suspect analysis, and returns a recommendation (markAllergic / pediatricCare / enterObservation / monitor).',
      'Pure rules — no LLM involved.',
    ].join(' '),
    recordReactionInput,
    async (args) => safeToolCall(() => recordReaction(args), 'record_reaction failed')
  )

  server.tool(
    'analyze_suspect_foods',
    [
      'KILLER DEMO — re-run the suspect analysis for a recorded reaction and surface the ruleTrace (introducingChecked, allergicSkipped, confirmedSkipped, tryingDayLabel).',
      'Pure rules. The ruleTrace is what makes the verdict auditable.',
    ].join(' '),
    analyzeSuspectFoodsInput,
    async (args) => safeToolCall(() => analyzeSuspectFoods(args), 'analyze_suspect_foods failed')
  )
}
