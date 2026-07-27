/**
 * DeepSeek (OpenAI-compatible) provider.
 *
 * DeepSeek's API is fully OpenAI-compatible: same `chat.completions.create`
 * shape, same `tools` array, same `tool_calls` response. We use the
 * official `openai` SDK with a custom baseURL, so this also works for
 * any other OpenAI-compatible provider (Zhipu GLM-4, MiniMax, etc.) —
 * just change BASE_URL and MODEL.
 *
 * Why DeepSeek first: cheapest OpenAI-compatible model with tool_use
 * in CN, ~¥1/1M tokens. Production fallback if Anthropic is unavailable.
 */

'use strict'

const { LLMClient } = require('./client.js')

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY

class DeepSeekClient extends LLMClient {
  constructor(apiKey = DEEPSEEK_API_KEY) {
    super()
    if (!apiKey) {
      throw new Error('DeepSeekClient: DEEPSEEK_API_KEY is not set. Configure in WeChat cloud function env vars.')
    }
    // Lazy-require so local mock mode doesn't pay the require() cost.
    const OpenAI = require('openai').default || require('openai')
    this.client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL })
    this.model = DEEPSEEK_MODEL
    this.providerName = 'deepseek'
  }

  async chat(req) {
    const messages = [
      { role: 'system', content: req.system },
      // Convert our internal ChatMessage shape to OpenAI's. The internal
      // shape is already close to OpenAI's — only `tool_calls` on
      // assistant turns and `role: 'tool'` results need mapping.
      ...(req.messages || []).map((m) => this._toOpenAIMessage(m)),
    ]
    const tools = (req.tools || []).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    }))

    const response = await this.client.chat.completions.create({
      model: req.model || this.model,
      messages,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 1024,
    })

    const choice = response.choices?.[0] || {}
    const msg = choice.message || {}
    const toolCalls = (msg.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeJsonParse(tc.function.arguments, {}),
    }))
    return {
      text: msg.content || '',
      toolCalls,
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      provider: this.providerName,
    }
  }

  _toOpenAIMessage(m) {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' }
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) },
        })),
      }
    }
    return { role: m.role, content: m.content || '' }
  }
}

function safeJsonParse(s, fallback) {
  if (!s) return fallback
  try {
    return JSON.parse(s)
  } catch (_e) {
    return fallback
  }
}

module.exports = { DeepSeekClient, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL }
