/**
 * Fridge resource (Day 3).
 *
 *   - fushi://fridge → list_fridge output (items, urgent, lowStock)
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listFridge } from '../domain/fridge.js'

const textResult = (uri: string, data: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  ],
})

export function registerFridgeResource(server: McpServer): void {
  server.resource(
    'fushi-fridge',
    'fushi://fridge',
    {
      description: 'Fridge items + urgent (expiring soon) + low-stock (≤1 portion left).',
      mimeType: 'application/json',
    },
    async (uri) => textResult(uri.href, listFridge())
  )
}
