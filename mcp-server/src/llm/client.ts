/**
 * LLM client abstraction (Day 8).
 *
 * The whole fushi-mcp server is **rule-first, LLM-second**. The LLM is
 * the explainer, not the decision maker. To keep that boundary clean,
 * the LLM client lives in its own module and is only invoked from
 * tools that are explicitly about "narrate this to the parent" — not
 * from any guardrail or rule path.
 *
 * The interface is intentionally minimal: take a system prompt + a
 * short message history, return a string. If you need more (tool
 * calling, image input, streaming), you're probably drifting into
 * "the LLM is making decisions" territory — pause and reconsider.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  system: string
  messages: ChatMessage[]
  /** Optional model override. Provider chooses default if omitted. */
  model?: string
  /** Sampling temperature 0..1. Default 0.4 — calm, factual narration. */
  temperature?: number
  /** Max output tokens. Default 800. */
  maxTokens?: number
}

export interface ChatResponse {
  text: string
  /** Model actually used (useful for audit / debugging). */
  model: string
  /** Number of input + output tokens. Mock provider returns zeros. */
  usage: { inputTokens: number; outputTokens: number }
  /** Which provider served the request. */
  provider: 'anthropic' | 'mock'
}

export interface LLMClient {
  chat(req: ChatRequest): Promise<ChatResponse>
  /** Whether the client is live or mock. Tools can surface this to the user. */
  readonly mode: 'live' | 'mock'
}
