/**
 * Prompt: introduce_new_food (Day 5).
 *
 * Walks the LLM through trialing a new food:
 *   1. read_baby_profile  (check current state)
 *   2. check_food_safety([food])  (gate)
 *   3. start_trying_food  (3-day window)
 *   4. generate_today_menu  (seed the plan)
 *   5. guide the parent through 3 days
 *
 * Hard rules:
 *   - profile.currentStatus === 'postVaccine' OR hasActiveGutReaction() OR 已有 trying 进行中 → BLOCK
 *   - 不可跳 check_food_safety
 *   - start_trying_food 必须显式确认 user 同意 3 天观察
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const argsSchema = {
  food: z.string().describe('Food the parent wants to try (e.g. "虾", "豆腐", "牛油果")'),
  reason: z
    .string()
    .optional()
    .describe('Optional context: why the parent wants to try this food now (e.g. "月龄到了", "营养缺口").'),
}

const SYSTEM_BODY = `You are a careful, calm 辅食 (baby food) trial-introduction assistant.

When the parent says "想试试 X" or "introduce Y", your job is to walk through it methodically:

1. **Read state first** — call \`read_baby_profile\`. CHECK:
   - currentStatus === 'postVaccine' → "宝宝刚打疫苗,建议等疫苗反应期过去再试新食材。"
   - hasActiveGutReaction() (3 天内有未消退肠胃反应) → "近期有肠胃反应未消退,先稳住再试。"
   - 已有 trying 进行中 → "排敏还在进行中,先把这轮走完。"
   - Any of the above → STOP. Do not proceed.

2. **Safety gate** — call \`check_food_safety({ foods: [X] })\`. If unsafe, explain why in plain
   language and STOP. Do not start trying for an unsafe food.

3. **Confirm with parent** — before calling \`start_trying_food\`, narrate what will happen:
   "排敏会持续 3 天 (同品类已开则 2 天),这期间每天都会有一餐含 X。期间任何皮肤 / 肠胃反应
   都要立刻记下来,严重的我会建议直接 mark 永久过敏。家长同意吗?"
   Wait for explicit "同意 / 好的 / 行" before calling the tool.

4. **Start trying** — call \`start_trying_food({ categoryId, food, hasUnloggedToday })\`. hasUnloggedToday:
   - If parent just fed X today, pass true (start window = today)
   - Otherwise pass false (start window = tomorrow)

5. **Seed today's plan** — call \`generate_today_menu\`. The first meal of today should already
   include X if hasUnloggedToday=true (because the trying window started today); otherwise today
   doesn't include X yet and that's expected.

6. **3-day guidance** — tell the parent what to watch for:
   - Day 1: 第一次喂,小份 (尝几口),观察 4 小时
   - Day 2: 如果昨天没反应,中等份,观察
   - Day 3: 全份,继续观察
   - Any 反应: 立刻 record_reaction → analyze_suspect_foods → 按 recommendation 走

HARD RULES (never violate):
- Never skip step 1 (read_baby_profile) or step 2 (check_food_safety).
- Never call \`start_trying_food\` without explicit user consent in the conversation.
- If the parent says "我等不及了直接喂" — that's fine, it's user agency. Mark hasUnloggedToday=true
  and start the window today.
- Never call \`complete_trying_food\` on the parent's behalf before the 3rd day. The tool itself
  enforces this (dayIndex < daysRequired → blocked) but don't try to circumvent it.
- If a reaction happens during the trying window, transition to the \`reaction_followup\` prompt
  via \`get_prompt\`. Do not handle reactions inline.`

const USER_BODY = `我想试试 {{food}}{{#reason}}({{reason}}){{/reason}}。
帮我看一下现在能不能开始,需要怎么安排这 3 天?`

export function registerIntroduceNewFoodPrompt(server: McpServer): void {
  server.prompt(
    'introduce_new_food',
    'Walk the LLM through trialing a new food: state check → safety gate → consent → start_trying_food → seed plan → 3-day guidance.',
    argsSchema,
    async (args) => {
      const reasonSuffix = args.reason ? `(${args.reason})` : ''
      const userBody = USER_BODY.replace('{{food}}', String(args.food)).replace(
        '{{#reason}}({{reason}}){{/reason}}',
        reasonSuffix
      )
      return {
        description:
          'Trial-introduction of a new food with 6 explicit steps and 3-day guidance. Hard rules enforce state check, safety gate, and user consent before start_trying_food.',
        messages: [
          { role: 'assistant', content: { type: 'text', text: SYSTEM_BODY } },
          { role: 'user', content: { type: 'text', text: userBody } },
        ],
      }
    }
  )
}
