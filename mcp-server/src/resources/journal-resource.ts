/**
 * Journal resources (Day 3).
 *
 *   - fushi://journal/{days}   → last N days of meal logs + newFoods
 *   - fushi://journal/week     → 7-day window
 *
 * Read-only view over fushi-ditu's mealJournal. No side effects.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getJournal } from '../../../utils/journal.js'
import { formatYmdDate } from '../domain/plan.js'
import type { MealLog } from '../domain/fushi-types.js'

const textResult = (uri: string, data: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  ],
})

interface WindowResult {
  days: number
  from: string
  to: string
  count: number
  logs: MealLog[]
  newFoods: string[]
}

function windowLogs(days: number): WindowResult {
  const all = getJournal()
  // We don't have parseLocalDateMs in mcp-server's domain; use Date math instead.
  // to = today; from = to - (days-1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fromMs = today.getTime() - (days - 1) * 86400000
  const fromDate = new Date(fromMs)
  const logs = all.filter((l) => {
    const t = new Date(l.date).getTime()
    return t >= fromMs && t <= today.getTime() + 86400000
  })
  // newFoods: ingredients not in the previous window
  const prevFrom = fromMs - days * 86400000
  const prevLogs = all.filter((l) => {
    const t = new Date(l.date).getTime()
    return t >= prevFrom && t < fromMs
  })
  const prevIngredients = new Set<string>()
  prevLogs.forEach((l) => l.ingredients.forEach((i) => prevIngredients.add(i)))
  const newFoods: string[] = []
  const seen = new Set<string>()
  logs.forEach((l) =>
    l.ingredients.forEach((i) => {
      if (!prevIngredients.has(i) && !seen.has(i)) {
        seen.add(i)
        newFoods.push(i)
      }
    })
  )
  return {
    days,
    from: formatYmdDate(fromDate),
    to: formatYmdDate(today),
    count: logs.length,
    logs,
    newFoods,
  }
}

export function registerJournalResources(server: McpServer): void {
  // fushi://journal/{days}
  server.resource(
    'fushi-journal-days',
    new ResourceTemplate('fushi://journal/{days}', { list: undefined }),
    {
      description: 'Last N days of meal logs (N from URI). Includes newFoods vs the prior N-day window.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const raw = String(vars.days)
      const days = Number.parseInt(raw, 10)
      if (!Number.isFinite(days) || days < 1 || days > 90) {
        throw new Error(`fushi://journal/{days}: days must be 1..90, got "${raw}"`)
      }
      return textResult(uri.href, windowLogs(days))
    }
  )

  // fushi://journal/week
  server.resource(
    'fushi-journal-week',
    'fushi://journal/week',
    {
      description: 'Last 7 days of meal logs.',
      mimeType: 'application/json',
    },
    async (uri) => textResult(uri.href, windowLogs(7))
  )
}
