/**
 * Plan resources (Day 2).
 *
 *   - fushi://plan/today  → single-day plan (weeklyPlan[0] or freshly generated)
 *   - fushi://plan/week   → full weeklyPlan array
 *
 * These are read-only views; mutation goes through generate_today_menu /
 * regenerate_week_plan tools.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readJson } from '../shim/storage.js'
import { formatYmdDate } from '../domain/plan.js'
import type { DailyPlan } from '../domain/fushi-types.js'

const textResult = (uri: string, data: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  ],
})

/**
 * Read-only resources must not have side effects. We deliberately do NOT
 * auto-generate a missing today's plan here — that would be a write through
 * a read API, which (a) violates MCP's tool/resource split (clients trust
 * resources to be safe to read without confirm), (b) makes the same URI
 * return different data across sessions (non-deterministic), and (c) is a
 * classic interview trap that betrays shallow protocol understanding.
 *
 * If the resource is missing, the LLM should be told to call the
 * generate_today_menu tool (which IS allowed to write).
 */
function loadWeek(): DailyPlan[] {
  return readJson<DailyPlan[]>('weeklyPlan') ?? []
}

export function registerPlanResources(server: McpServer): void {
  // fushi://plan/today — today's plan from storage; missing => tell LLM to call the tool
  server.resource(
    'fushi-plan-today',
    'fushi://plan/today',
    {
      description: "Today's meal plan from storage. If missing, the LLM must call generate_today_menu (resources are read-only and have no side effects).",
      mimeType: 'application/json',
    },
    async (uri) => {
      const today = formatYmdDate(new Date())
      const existing = loadWeek().find((p) => p.date === today)
      if (existing) {
        return textResult(uri.href, { date: today, found: true, plan: existing })
      }
      return textResult(uri.href, {
        date: today,
        found: false,
        hint: 'No plan for today. Call generate_today_menu to create one.',
      })
    }
  )

  // fushi://plan/week — full week plan
  server.resource(
    'fushi-plan-week',
    'fushi://plan/week',
    {
      description: 'Full weekly plan array (read-only view of storage).',
      mimeType: 'application/json',
    },
    async (uri) => {
      const week = loadWeek()
      return textResult(uri.href, { count: week.length, plan: week })
    }
  )
}
