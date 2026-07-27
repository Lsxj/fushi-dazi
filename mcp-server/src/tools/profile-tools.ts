/**
 * Profile tools (Day 1: read_baby_profile only).
 *
 * Day 5 will add: start_trying_food, complete_trying_food, abort_trying_food,
 * mark_food_allergic, enter_observation, start_introducing.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readBabyProfile } from '../domain/profile.js'
import { safeToolCall } from '../lib/tool-helpers.js'

export function registerProfileTools(server: McpServer): void {
  server.tool(
    'read_baby_profile',
    'Read the active baby profile: profile fields + ageMonths + trying state + next-recommendation list. Read-only.',
    {},
    async () => safeToolCall(() => readBabyProfile(), 'read_baby_profile failed')
  )
}