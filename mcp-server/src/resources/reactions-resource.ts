/**
 * Reactions resource (Day 4).
 *
 *   - fushi://reactions/{days} → reactions in the last N days + active ones
 *
 * Read-only view; mutations go through record_reaction.
 */
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getReactions } from '../../../utils/reactions.js'
import type { ReactionLog } from '../domain/fushi-types.js'

const textResult = (uri: string, data: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  ],
})

export function registerReactionsResource(server: McpServer): void {
  server.resource(
    'fushi-reactions-days',
    new ResourceTemplate('fushi://reactions/{days}', { list: undefined }),
    {
      description: 'Reactions in the last N days, plus active (unresolved) ones.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const raw = String(vars.days)
      const days = Number.parseInt(raw, 10)
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        throw new Error(`fushi://reactions/{days}: days must be 1..365, got "${raw}"`)
      }
      const all: ReactionLog[] = getReactions()
      const cutoff = Date.now() - days * 86400000
      const inWindow = all.filter((r) => new Date(r.occurredAt).getTime() >= cutoff)
      const active = all.filter((r) => !r.resolvedAt)
      return textResult(uri.href, {
        days,
        count: inWindow.length,
        activeCount: active.length,
        reactions: inWindow,
        activeReactions: active,
      })
    }
  )
}
