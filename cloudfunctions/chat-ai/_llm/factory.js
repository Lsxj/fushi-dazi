/**
 * LLM provider factory.
 *
 * Resolution order (highest priority first):
 *   1. LLM_PROVIDER env var (e.g. 'anthropic' | 'deepseek' | 'mock')
 *   2. Auto-detect from available API keys:
 *        - DEEPSEEK_API_KEY set       → deepseek
 *        - ANTHROPIC_API_KEY set      → anthropic
 *        - neither set                 → mock
 *   3. In cloud function runtime, if the chosen provider's key is missing,
 *      log a warning and fall back to mock so the function still serves
 *      requests (with keyword-matched canned answers).
 *
 * Adding a new provider:
 *   1. Add a file in _llm/ (e.g. zhipu.js) exporting a class that
 *      extends LLMClient.
 *   2. Add a case below.
 *   3. Add the SDK to package.json.
 *   4. Document the env vars in cloudfunctions/chat-ai/deploy.md.
 */

'use strict'

const { AnthropicClient } = require('./anthropic.js')
const { DeepSeekClient } = require('./deepseek.js')
const { MockClient } = require('./mock.js')

let _client = null

function getLLMClient() {
  if (_client) return _client
  const explicit = (process.env.LLM_PROVIDER || '').toLowerCase()
  const provider = explicit || inferProvider()

  // Cloud-function-safe: if the requested provider has no key, fall back
  // to mock instead of throwing. This way a fresh deploy (no env vars
  // set) still serves requests; just with keyword-based canned answers.
  if (provider === 'mock' || (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY && !process.env.DEEPSEEK_BASE_URL)) {
    process.stderr.write(`chat-ai: LLM provider = mock (${provider} requested but no key set)\n`)
    _client = new MockClient()
  } else if (provider === 'deepseek') {
    process.stderr.write('chat-ai: LLM provider = deepseek (OpenAI-compatible)\n')
    _client = new DeepSeekClient()
  } else if (provider === 'anthropic') {
    process.stderr.write('chat-ai: LLM provider = anthropic\n')
    _client = new AnthropicClient()
  } else {
    throw new Error(`chat-ai: unknown LLM_PROVIDER "${provider}". Use anthropic | deepseek | mock.`)
  }
  return _client
}

function inferProvider() {
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'mock'
}

/** Test-only: reset the cached client. */
function _resetLLMClientForTest() {
  _client = null
}

module.exports = { getLLMClient, _resetLLMClientForTest }
