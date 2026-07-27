/**
 * Domain layer: get_week_summary.
 *
 * Wraps fushi-ditu's summarize7Days(profile, refDate). The 4-card layout
 * (loveCount / newFoodCount / reactionCount / nutrition gap) is what the
 * review page in fushi-ditu shows the parent. Surfacing it through MCP
 * lets the LLM narrate "this week, baby tried X new foods, loved Y,
 * reacted Z times" — useful for the Sunday check-in or a monthly
 * review prompt.
 */
import { readJson } from '../shim/storage.js'
import { summarize7Days, type WeekSummary } from '../../../utils/reviewStats.js'
import type { BabyProfile } from './fushi-types.js'

export interface GetWeekSummaryInput {
  /** Optional reference date (YYYY-MM-DD). Default: today. */
  refDate?: string
}

export interface GetWeekSummaryOutput extends WeekSummary {
  refDate: string
}

function parseRefDate(input: string | undefined): { refDate: string; date: Date } {
  if (!input) {
    const d = new Date()
    return { refDate: d.toISOString().slice(0, 10), date: d }
  }
  const [y, m, d] = input.split('-').map(Number)
  if (!y || !m || !d) {
    throw new Error(`get_week_summary: invalid refDate "${input}", expected YYYY-MM-DD`)
  }
  return { refDate: input, date: new Date(y, m - 1, d, 12, 0, 0, 0) }
}

export function getWeekSummary(input: GetWeekSummaryInput = {}): GetWeekSummaryOutput {
  const profile = readJson<BabyProfile>('babyProfile') ?? null
  const { refDate, date } = parseRefDate(input.refDate)
  const summary = summarize7Days(profile, date)
  return { ...summary, refDate }
}
