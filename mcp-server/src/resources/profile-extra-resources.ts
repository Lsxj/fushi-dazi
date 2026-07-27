/**
 * Profile resources (Day 5).
 *
 *   - fushi://profile/trying-progress   → { trying, scheduledStart, isComplete, nextRecommendations }
 *   - fushi://recommendations/next      → NextRecommendation[]
 *
 * Both are read-only views. Mutations go through start/complete/abort
 * trying tools and start_introducing.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readTryingProgress } from '../domain/profile-mutations.js'
import { getNextRecommendation } from '../../../utils/planner.js'
import { readJson } from '../shim/storage.js'
import type { BabyProfile } from '../domain/fushi-types.js'

const textResult = (uri: string, data: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  ],
})

export function registerProfileExtraResources(server: McpServer): void {
  server.resource(
    'fushi-profile-trying-progress',
    'fushi://profile/trying-progress',
    {
      description: 'Current trying state: trying window, scheduled start, completion, plus next recommendations.',
      mimeType: 'application/json',
    },
    async (uri) => textResult(uri.href, readTryingProgress())
  )

  server.resource(
    'fushi-recommendations-next',
    'fushi://recommendations/next',
    {
      description: 'Next recommended foods to trial-introduce (empty during trying / post-vaccine / active gut reaction).',
      mimeType: 'application/json',
    },
    async (uri) => {
      const profile = readJson<BabyProfile>('babyProfile')
      if (!profile) {
        throw new Error('fushi://recommendations/next: no babyProfile in store')
      }
      return textResult(uri.href, getNextRecommendation(profile))
    }
  )
}
