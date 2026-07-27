/**
 * Review tool (Day 6): get_week_summary.
 *
 * Wraps fushi-ditu's summarize7Days to give the LLM a parent-facing
 * 4-card view: loves / new foods / reactions / dynamic nutrition gap.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getWeekSummary } from '../domain/review.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const getWeekSummaryInput = {
  refDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Reference date for the 7-day window (YYYY-MM-DD). Default: today.'),
}

export function registerReviewTools(server: McpServer): void {
  server.tool(
    'get_week_summary',
    'Summarize the last 7 days: love count, new foods, reactions, dynamic nutrition gap. refDate defaults to today.',
    getWeekSummaryInput,
    async (args) => safeToolCall(() => getWeekSummary(args), 'get_week_summary failed')
  )
}
