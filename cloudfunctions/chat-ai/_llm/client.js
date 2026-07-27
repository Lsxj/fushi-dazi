/**
 * LLM client abstraction (chat-ai version, JS).
 *
 * Mirrors /Users/x7/fushi-ditu/mcp-server/src/llm/client.ts but in CommonJS
 * for the WeChat cloud function runtime. The interface is identical so
 * the mcp-server dev tool and the production cloud function share the
 * same tool-use loop semantics.
 *
 * Why an abstraction here:
 *   - Production: Anthropic is fine, but MiniMax/DeepSeek/Zhipu are all
 *     OpenAI-compatible — easy to swap if Anthropic pricing/availability
 *     becomes an issue.
 *   - Local dev: mock provider lets the full tool-use loop run without an
 *     API key (or network).
 *   - Interview: the boundary between "rule system" and "LLM" is the
 *     whole point — this module IS the boundary.
 */

'use strict'

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {string} [tool_call_id] - OpenAI tool result role='tool' needs this
 * @property {string} [name]         - tool name (Anthropic uses this; OpenAI ignores)
 * @property {Array<ToolCallRef>} [tool_calls] - OpenAI assistant tool_calls
 */

/**
 * @typedef {Object} ToolDef
 * @property {string} name
 * @property {string} description
 * @property {Object} parameters - JSON Schema for the tool input
 */

/**
 * @typedef {Object} ToolCallRef
 * @property {string} id
 * @property {string} name
 * @property {Object} input
 */

/**
 * @typedef {Object} ChatRequest
 * @property {string} system
 * @property {ChatMessage[]} messages
 * @property {ToolDef[]} [tools]
 * @property {string} [model]
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} text
 * @property {ToolCallRef[]} toolCalls
 * @property {string} model
 * @property {{inputTokens:number, outputTokens:number}} usage
 * @property {string} provider
 */

class LLMClient {
  /**
   * @param {ChatRequest} req
   * @returns {Promise<ChatResponse>}
   */
  async chat(req) {
    throw new Error('LLMClient.chat must be implemented by subclass')
  }
}

module.exports = { LLMClient }
