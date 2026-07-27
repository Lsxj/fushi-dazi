/**
 * Anthropic provider — uses the official @anthropic-ai/sdk.
 *
 * Activated when ANTHROPIC_API_KEY is set. Default model is
 * claude-sonnet-4-5 (the mid-tier — cheap enough for narration, smart
 * enough to honor the system prompt's hard rules).
 *
 * This is the only place the SDK is touched. If we ever swap to a
 * different provider, the swap is one file.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ChatRequest, ChatResponse, LLMClient } from './client.js'

const DEFAULT_MODEL = 'claude-sonnet-4-5'
const DEFAULT_MAX_TOKENS = 800
const DEFAULT_TEMPERATURE = 0.4

export class AnthropicClient implements LLMClient {
  readonly mode = 'live' as const
  private client: Anthropic
  private defaultModel: string

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey })
    this.defaultModel = model
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const model = req.model ?? this.defaultModel
    const response = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: req.temperature ?? DEFAULT_TEMPERATURE,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    })
    // Extract text from the first text block. Anthropic returns content as
    // an array of typed blocks; for narration we only generate text.
    const firstText = response.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined
    return {
      text: firstText?.text ?? '',
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      provider: 'anthropic',
    }
  }
}
