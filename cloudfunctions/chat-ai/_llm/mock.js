/**
 * Mock provider — used in local dev and as a fallback when no API key
 * is configured. The response is a deterministic, rules-aware template
 * so the tool-use loop still "feels alive" offline.
 *
 * Mirrors the OpenAI / Anthropic tool message shape so the chat-ai
 * tool-use loop can treat it identically.
 */

'use strict'

const { LLMClient } = require('./client.js')

const KEYWORD_TOOL = [
  { re: /今天.*吃什么|今天.*菜单|中午|早上|晚上|晚餐|早餐/, name: 'generate_today_menu' },
  { re: /这周|本周|最近.*吃|吃过|记录|回顾|总结|历史|打卡/, name: 'get_feeding_history' },
  { re: /换|替换|别的/, name: 'generate_today_menu' },
  { re: /拉稀|红疹|呕吐|发烧|嗜睡|便秘|反应/, name: 'record_reaction' },
  { re: /试试|尝试|引入|新食材/, name: 'check_food_safety' },
  { re: /档案|月龄|状态|过敏|现在/, name: 'read_baby_profile' },
  { re: /哪些菜|食谱|菜单|推荐|能吃/, name: 'list_recipes' },
]

const FINAL_ANSWERS = {
  generate_today_menu: '今天三餐我帮你安排好了:\n• 早餐: 牛肉南瓜粥\n• 午餐: 鳕鱼西兰花米糊\n• 下午: 香蕉苹果泥\n\n都用了你冰箱里的食材,海鲜是排过敏的没问题。要换菜跟我说。',
  record_reaction: '看起来像是中度反应,我先帮你记下来,建议进入 7 天观察期。如果有其他症状(发烧、呕吐)请立刻告诉我。',
  check_food_safety: '我帮你查了 — 安全。但这是首次引入,建议小份试,观察 4 小时再喂下一顿。',
  read_baby_profile: '小蘑菇 10 月龄,目前 fish/cruciferous/leafy 几个品类都开放,白肉还没试。',
  list_recipes: '我帮你列了 17 道 applicable 的菜 — 要看哪一类的?或者直接说"今天想吃鱼",我给你推。',
  get_feeding_history: '我已经读取了辅食打卡和反应记录。真实模型会按返回的数据总结近 7 天和最新历史记录。',
}

class MockClient extends LLMClient {
  constructor() {
    super()
    this.providerName = 'mock'
    this.model = 'mock-v1'
  }

  async chat(req) {
    // If any tool result is already in the message history, this is turn 2+:
    // produce the final text answer.
    const hasToolResult = (req.messages || []).some((m) =>
      m.role === 'tool' || (m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b && b.type === 'tool_result'))
    )
    if (hasToolResult) {
      const lastAssistant = [...(req.messages || [])].reverse().find((m) => m.role === 'assistant')
      const toolName = (lastAssistant && lastAssistant.tool_calls && lastAssistant.tool_calls[0]?.name) || 'unknown'
      return {
        text: FINAL_ANSWERS[toolName] || '[mock] done.',
        toolCalls: [],
        model: this.model,
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: this.providerName,
      }
    }

    // Turn 1: extract user text and pick a tool.
    const lastUser = [...(req.messages || [])].reverse().find((m) => m.role === 'user')
    const text = lastUser?.content || ''
    const match = KEYWORD_TOOL.find((k) => k.re.test(text))
    if (!match) {
      return {
        text: '[mock] 你可以问我"今天吃什么 / 拉稀了怎么办 / 想试试新食材",我帮你搞定。',
        toolCalls: [],
        model: this.model,
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: this.providerName,
      }
    }
    let input = {}
    if (match.name === 'record_reaction') {
      input = { type: 'rash', severity: 'moderate', occurredAt: new Date().toISOString() }
    } else if (match.name === 'check_food_safety') {
      const m = text.match(/试试\s*(\S+)/)
      input = { foods: [m ? m[1] : '虾'] }
    }
    return {
      text: `[mock] 调 ${match.name}`,
      toolCalls: [{ id: `mock_${Date.now()}`, name: match.name, input }],
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: this.providerName,
    }
  }
}

module.exports = { MockClient, KEYWORD_TOOL, FINAL_ANSWERS }
