/**
 * Provider factory.
 *
 * Reads ANTHROPIC_API_KEY from env. If set, returns a live Anthropic
 * client. If not, returns a mock. The decision is made once at server
 * startup; the choice is logged so it's visible in the demo.
 *
 * We deliberately do NOT make the LLM client hot-swappable per call —
 * that would let a tool quietly fall back from live to mock mid-demo.
 * The provider is a startup invariant.
 */
import { AnthropicClient } from './anthropic.js'
import { MockLLMClient } from './mock.js'
import type { LLMClient } from './client.js'

let _client: LLMClient | null = null

export function getLLMClient(): LLMClient {
  if (_client) return _client
  const key = process.env.ANTHROPIC_API_KEY
  if (key && key.trim().length > 0) {
    _client = new AnthropicClient(key)
    process.stderr.write('fushi-mcp: LLM provider = anthropic (live)\n')
  } else {
    _client = new MockLLMClient()
    process.stderr.write('fushi-mcp: LLM provider = mock (set ANTHROPIC_API_KEY for live)\n')
  }
  return _client
}

/** Test-only: reset the cached client. Not exported in the public API. */
export function _resetLLMClientForTest(): void {
  _client = null
}
