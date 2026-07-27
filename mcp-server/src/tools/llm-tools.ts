/**
 * LLM tool (Day 8): narrate_week.
 *
 * The ONE tool that touches the LLM provider. It takes the structured
 * get_week_summary output and asks the LLM to narrate it for a parent.
 *
 * Hard rules baked into the system prompt:
 *   - NEVER invent numbers. If the structured data is missing, say so.
 *   - NEVER recommend a specific food. The narration is about *what
 *     happened*, not *what to do*. Action recommendations come from
 *     other tools (recommendations/next, generate_today_menu).
 *   - Match the parent's tone (concerned / curious / celebratory).
 *   - Use the parent's language (this server is zh-CN first; narration
 *     should reflect that).
 *
 * If the LLM provider is in 'mock' mode (no ANTHROPIC_API_KEY), the
 * tool still succeeds — the narration just becomes a deterministic
 * echo of the data, and we tell the user the mode in the response.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getWeekSummary } from '../domain/review.js'
import { getLLMClient } from '../llm/factory.js'
import { safeToolCall } from '../lib/tool-helpers.js'

const narrateWeekInput = {
  refDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Reference date for the 7-day window (YYYY-MM-DD). Default: today.'),
  tone: z
    .enum(['calm', 'celebratory', 'concerned'])
    .optional()
    .describe('Narrator tone. Default: calm.'),
}

export function registerLLMTools(server: McpServer): void {
  server.tool(
    'narrate_week',
    [
      'Narrate the last 7 days of feeding for a parent. Wraps get_week_summary with an LLM explanation.',
      'The LLM never invents numbers or recommends foods. If ANTHROPIC_API_KEY is not set, runs in mock mode (returns a deterministic echo).',
    ].join(' '),
    narrateWeekInput,
    async (args) =>
      safeToolCall(async () => {
        const summary = getWeekSummary({ refDate: args.refDate })
        const tone = args.tone ?? 'calm'
        const client = getLLMClient()
        const system = `你是一位细心、克制的辅食 (baby food) 周报叙述者。
家长会用日常语气读你的回复 — 不要写成临床报告。

HARD RULES (绝对不能违反):
- 数字必须从提供的 JSON 数据里来,不能编造。如果某个数字缺失,明确说"这个数据没有"。
- 不要推荐具体食材。叙述只说"发生了什么",推荐交给 recommendations/next 等其他工具。
- 不要用 emoji 替代文字。emoji 是装饰,不是信息。
- 不要超过 200 字。
- 用中文回复。
- 语气: ${tone}。${tone === 'concerned' ? '家长可能有担心,先承认情绪,再讲数据。' : ''}${tone === 'celebratory' ? '这周有好事,语气轻松,但仍要数据准确。' : ''}`

        const userMsg = `请基于以下 JSON 数据,给家长写一段本周辅食总结(JSON 已经是 get_week_summary 的输出,不要重新计算):
${JSON.stringify(summary, null, 2)}`

        const response = await client.chat({
          system,
          messages: [{ role: 'user', content: userMsg }],
        })

        return {
          summary,
          narration: response.text,
          provider: response.provider,
          model: response.model,
          mode: client.mode,
          usage: response.usage,
        }
      }, 'narrate_week failed')
  )
}
