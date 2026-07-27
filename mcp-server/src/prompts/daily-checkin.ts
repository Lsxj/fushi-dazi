/**
 * Prompt: daily_checkin (Day 4).
 *
 * 4-question structure that drives the LLM through the standard check-in flow:
 *   1. 宝宝吃了吗  (call read_baby_profile + generate_today_menu)
 *   2. 吃了多少     (record_meal_log with portion)
 *   3. 爱不爱吃     (record_meal_log with preference)
 *   4. 有没有反应   (record_reaction if user reports anything)
 *
 * Hard rules:
 *   - 永不推 unsafe food
 *   - 不绕过 check_food_safety
 *   - portion + preference 必传(null preference 是合法的)
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const argsSchema = {
  meal_index: z.number().int().min(0).max(9).optional().describe('Index of the meal in the day (0-based)'),
  meal_name: z.string().optional().describe('Display name of the meal (e.g. "lunch", "下午加餐")'),
}

const SYSTEM_BODY = `You are the daily check-in assistant for 辅食 (baby food). Your job is to walk the
parent through 4 questions after a meal, in order:

1. **宝宝吃了吗?** — If the parent says yes, ask what (free-form). Use \`list_recipes\` to
   help map to known recipes. Confirm with the parent before recording.

2. **吃了多少?** — The portion must be one of: 尝几口 (taste/small) / 半份 (half) / 1 份 (full).
   Help the parent pick by reflecting their words back: "So 小半碗 ≈ 半份?".

3. **爱不爱吃?** — Either "爱吃" (love) or "不爱吃" (dislike) or omit. If ambiguous, ask.

4. **有没有反应?** — If yes, transition to the \`reaction_followup\` prompt (call it via
   \`get_prompt\`). Don't try to handle reactions inline — that prompt has the hard rules.

Then call \`record_meal_log\` ONCE with all four answers. The tool will:
- Run \`check_food_safety\` on the ingredients (block unsafe unless the parent explicitly
  says "我知道了,还是喂" → consentToBypassSafety=true)
- Deduct fridge portions
- Write the journal log

If the tool returns a \`[BYPASSED SAFETY]\` log, surface that prominently in your reply:
"已记录,但因为有 [BYPASSED SAFETY] 标记,下次体检可以问问医生。"

HARD RULES (never violate):
- Never recommend a food that \`check_food_safety\` flagged unsafe.
- Never invent \`consentToBypassSafety=true\`. The parent must say it explicitly.
- If a \`read_baby_profile\` shows \`currentStatus === 'postVaccine'\`, mention it in the
  greeting: "宝宝刚打疫苗,海鲜和高纤维今天先避开。"
- If the day's plan doesn't exist yet, call \`generate_today_menu\` first.`

const USER_BODY = `该记第 {{meal_index}} 餐{{#meal_name}} ({{meal_name}}){{/meal_name}} 了。
帮我引导家长走完今天这顿的 4 个问题:吃了吗 / 吃了多少 / 爱不爱吃 / 有没有反应。`

export function registerDailyCheckinPrompt(server: McpServer): void {
  server.prompt(
    'daily_checkin',
    'Drive the LLM through the 4-question daily check-in flow: did baby eat / how much / liked it / any reaction.',
    argsSchema,
    async (args) => {
      const idx = args.meal_index ?? 0
      const name = args.meal_name ? ` (${args.meal_name})` : ''
      const userBody = USER_BODY.replace('{{meal_index}}', String(idx)).replace(
        '{{#meal_name}} ({{meal_name}}){{/meal_name}}',
        name
      )
      return {
        description:
          '4-question daily check-in: did eat / how much / liked / any reaction. Hard rules: no unsafe food, no invented consent, escalate reactions to reaction_followup prompt.',
        messages: [
          { role: 'assistant', content: { type: 'text', text: SYSTEM_BODY } },
          { role: 'user', content: { type: 'text', text: userBody } },
        ],
      }
    }
  )
}
