/**
 * Anthropic provider — uses the official @anthropic-ai/sdk.
 *
 * Activated when LLM_PROVIDER=anthropic (default). Default model is
 * claude-sonnet-4-5. Set ANTHROPIC_API_KEY in the cloud function env.
 */

'use strict'

const { LLMClient } = require('./client.js')

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

class AnthropicClient extends LLMClient {
  constructor(apiKey = ANTHROPIC_API_KEY) {
    super()
    if (!apiKey) {
      throw new Error('AnthropicClient: ANTHROPIC_API_KEY is not set. Configure in WeChat cloud function env vars.')
    }
    const Anthropic = require('@anthropic-ai/sdk')
    this.client = new Anthropic({ apiKey })
    this.model = ANTHROPIC_MODEL
    this.providerName = 'anthropic'
  }

  async chat(req) {
    const messages = (req.messages || []).map((m) => this._toAnthropicMessage(m))
    const tools = (req.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: 'object', properties: {} },
    }))
    const response = await this.client.messages.create({
      model: req.model || this.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.4,
      system: req.system,
      messages,
      ...(tools.length ? { tools } : {}),
    })
    const text = (response.content.find((b) => b.type === 'text') || { text: '' }).text
    const toolCalls = (response.content.filter((b) => b.type === 'tool_use') || []).map((b) => ({
      id: b.id,
      name: b.name,
      input: b.input || {},
    }))
    return {
      text,
      toolCalls,
      model: response.model,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
      provider: this.providerName,
    }
  }

  _toAnthropicMessage(m) {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '' }],
      }
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      return {
        role: 'assistant',
        content: m.tool_calls.map((tc) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input || {},
        })),
      }
    }
    return { role: m.role, content: m.content || '' }
  }
}

module.exports = { AnthropicClient, ANTHROPIC_MODEL }
