/**
 * Prompt: reaction_followup (Day 4).
 *
 * Walks the LLM through a reaction follow-up:
 *   1. record_reaction  (capture the incident)
 *   2. analyze_suspect_foods  (rule-based, with ruleTrace)
 *   3. explain ruleTrace aloud to the parent
 *   4. apply the recommendation (markAllergic / enterObservation / monitor)
 *
 * Hard rules the LLM must respect:
 *   - HIGH suspect 7 days 内不推荐 retry
 *   - severe OR (vomit + moderate+) → recommend 儿科就诊 + 不建议家庭 retry
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const argsSchema = {
  reaction_type: z
    .enum(['gut', 'rash', 'vomit', 'sleepy', 'fever', 'constipation'])
    .describe('Type of the reaction the parent just reported'),
  severity: z.enum(['mild', 'moderate', 'severe']).describe('How severe the parent judges it'),
  occurred_at: z.string().describe('ISO timestamp of when the reaction started'),
}

const SYSTEM_BODY = `You are a careful, calm 辅食 (baby food) follow-up assistant.

When the parent reports a reaction, your job is to walk through it methodically:

1. **Record first** — call \`record_reaction\` with { type, severity, occurredAt, note }.
   The tool will pull 72h of meal logs and run rule-based suspect analysis. Wait for the response.

2. **Analyze** — call \`analyze_suspect_foods\` with the returned reaction.id. This re-runs the
   rules and returns a \`ruleTrace\` (introducingChecked, allergicSkipped, confirmedSkipped,
   tryingDayLabel). The ruleTrace is the audit trail — every suspect must be explainable by it.

3. **Explain aloud** — to the parent, restate the top suspect(s) AND narrate the ruleTrace:
   - "我把过去 3 天的菜都看了…" (you already did)
   - "排敏第 N/M 天的 X 是高度可疑,因为它正在首次引入观察期" (ruleTrace shows introducingChecked)
   - "已知过敏的 Y 被跳过,不会重复报告" (ruleTrace shows allergicSkipped)
   - "已稳定超过 30 天的 Z 可能性较低" (ruleTrace + suspect.level='low')

4. **Apply the recommendation** — the tool returns one of: markAllergic / pediatricCare /
   enterObservation / monitor. Translate it to a parent-facing next step:
   - markAllergic: "建议把 X 从菜单中下架,今天先不喂。"
   - pediatricCare: "呕吐中度以上,先去儿科看一下,回来再决定。"
   - enterObservation: "X 进入 7 天观察期,DD 日后可以再小份试一次。"
   - monitor: "先观察 24 小时,下次餐避开 X。"

HARD RULES (never violate):
- A HIGH suspect is NOT to be retried within 7 days.
- If the recommendation is \`pediatricCare\`, do NOT suggest home retry. Period.
- Never invent a suspect the tool didn't return. If suspects=[], say "目前没有明确可疑食材,
  建议持续观察 + 联系儿科"。
- Never call mark_food_allergic / enter_observation / start_trying_food without first showing
  the user the recommendation. These are state-mutating tools; the parent should consent.`

const USER_BODY = `我刚记录了一次反应:
- 类型: {{reaction_type}}
- 严重度: {{severity}}
- 发生时间: {{occurred_at}}

帮我看一下可能是哪个食材引起的,接下来该怎么办?`

export function registerReactionFollowupPrompt(server: McpServer): void {
  server.prompt(
    'reaction_followup',
    'Walk the LLM through recording a reaction, analyzing it with ruleTrace, and applying the recommendation safely.',
    argsSchema,
    async (args) => {
      const userBody = USER_BODY
        .replace('{{reaction_type}}', String(args.reaction_type))
        .replace('{{severity}}', String(args.severity))
        .replace('{{occurred_at}}', String(args.occurred_at))
      return {
        description:
          'Methodical reaction follow-up: record → analyze with ruleTrace → apply recommendation. Includes hard rules the LLM must respect.',
        messages: [
          { role: 'assistant', content: { type: 'text', text: SYSTEM_BODY } },
          { role: 'user', content: { type: 'text', text: userBody } },
        ],
      }
    }
  )
}
