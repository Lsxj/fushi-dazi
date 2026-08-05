/**
 * Mock provider — used in local dev and as a fallback when no API key
 * is configured. The response is a deterministic, rules-aware template
 * so the tool-use loop still "feels alive" offline.
 *
 * Mirrors the OpenAI / Anthropic tool message shape so the chat-ai
 * tool-use loop can treat it identically.
 */

'use strict'

const path = require('path')
const { LLMClient } = require('./client.js')
const FUSHI_ROOT = process.env.LOCAL === '1'
  ? path.resolve(__dirname, '../../..')
  : path.resolve(__dirname, '..', 'fushi-ditu')
const { routeAgentRequest } = require(path.join(FUSHI_ROOT, 'utils/agentRouting.js'))

const FINAL_ANSWERS = {
  generate_today_menu: '菜单工具已完成，具体结果以工具返回的数据为准。',
  record_reaction: '反应记录工具已完成，具体建议以规则结果为准。',
  read_baby_profile: '宝宝档案工具已完成，具体信息以工具返回的数据为准。',
  list_recipes: '适用食谱工具已完成，具体结果以工具返回的数据为准。',
  get_feeding_history: '饮食历史工具已完成，具体记录以工具返回的数据为准。',
}

function readLastToolResult(messages) {
  const toolMessage = [...(messages || [])].reverse().find((message) => message.role === 'tool')
  if (!toolMessage || typeof toolMessage.content !== 'string') return null
  try {
    return JSON.parse(toolMessage.content)
  } catch (_error) {
    return null
  }
}

function answerFromToolResult(toolName, result) {
  if (!result || typeof result !== 'object') {
    return toolName === 'check_food_safety'
      ? '本地 mock 没有拿到完整的安全规则结果，暂时不能判断是否适合尝试。'
      : '本地 mock 没有拿到完整的工具结果，暂时不能给出结论。'
  }
  if (toolName === 'check_food_safety') {
    if (typeof result.safe !== 'boolean') {
      return '本地 mock 没有拿到完整的安全规则结果，暂时不能判断是否适合尝试。'
    }
    if (result.safe) {
      return '确定性安全规则未发现阻断项。首次引入仍建议小份尝试，并按排敏流程观察。'
    }
    const reasons = Array.isArray(result.results)
      ? result.results.filter((item) => item && item.safe === false && item.reason).map((item) => item.reason)
      : []
    return `确定性安全规则已阻断这次尝试${reasons.length ? `：${reasons.join('；')}` : ''}。请不要喂食。`
  }
  if (toolName === 'generate_today_menu') {
    const names = Array.isArray(result.meals)
      ? result.meals.map((meal) => meal && meal.recipeName).filter(Boolean)
      : []
    return names.length
      ? `确定性菜单工具已生成：${names.join('、')}。具体安排以今日页为准。`
      : '确定性菜单工具没有找到适用菜单，请先核对宝宝档案与安全状态。'
  }
  if (toolName === 'list_recipes' && typeof result.count === 'number') {
    return `适用食谱工具返回 ${result.count} 道结果。可以继续告诉我想看哪一类。`
  }
  if (toolName === 'read_baby_profile') {
    const profile = result.profile && typeof result.profile === 'object' ? result.profile : result
    const name = typeof profile.babyName === 'string' ? profile.babyName : '宝宝'
    const age = typeof profile.ageMonths === 'number' ? `${profile.ageMonths} 月龄` : '月龄未记录'
    return `${name}，${age}。其他状态以档案工具返回的数据为准。`
  }
  if (toolName === 'get_feeding_history' && result.totals) {
    return `已读取饮食历史：共 ${result.totals.mealLogs || 0} 条打卡、${result.totals.reactions || 0} 条反应记录。`
  }
  if (toolName === 'record_reaction') {
    const reason = result.recommendation && result.recommendation.reason
    return `反应已记录${reason ? `：${reason}` : ''}。如症状严重或持续，请及时就医。`
  }
  return FINAL_ANSWERS[toolName] || '[mock] done.'
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
        text: answerFromToolResult(toolName, readLastToolResult(req.messages)),
        toolCalls: [],
        model: this.model,
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: this.providerName,
      }
    }

    // Turn 1: extract user text and pick a tool.
    const lastUser = [...(req.messages || [])].reverse().find((m) => m.role === 'user')
    const text = lastUser?.content || ''
    const route = routeAgentRequest(text)
    if (!route) {
      return {
        text: '[mock] 你可以问我"今天吃什么 / 拉稀了怎么办 / 想试试新食材",我帮你搞定。',
        toolCalls: [],
        model: this.model,
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: this.providerName,
      }
    }
    return {
      text: `[mock] 调 ${route.name}`,
      toolCalls: [{ id: `mock_${Date.now()}`, name: route.name, input: route.input }],
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0 },
      provider: this.providerName,
    }
  }
}

module.exports = { MockClient, FINAL_ANSWERS, answerFromToolResult }
