import { describe, expect, it } from 'vitest'

import { MockLLMClient } from '../../src/llm/mock.js'

describe('MockLLMClient', () => {
  it('returns deterministic, auditable metadata with the default model', async () => {
    const client = new MockLLMClient()
    const result = await client.chat({
      system: '只解释规则。\n不要替家长作决定。',
      messages: [
        { role: 'user', content: '第一条问题' },
        { role: 'assistant', content: '第一条回答' },
        { role: 'user', content: '今天能吃鳕鱼吗？' },
      ],
    })

    expect(client.mode).toBe('mock')
    expect(result.provider).toBe('mock')
    expect(result.model).toBe('mock-narration-v1')
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(result.text).toContain('只解释规则。 / 不要替家长作决定。')
    expect(result.text).toContain('今天能吃鳕鱼吗？')
    expect(result.text).not.toContain('第一条问题')
  })

  it('supports a custom model and an empty user history', async () => {
    const client = new MockLLMClient('portfolio-demo-v1')
    const result = await client.chat({
      system: 'a'.repeat(400),
      messages: [{ role: 'assistant', content: '暂无问题' }],
    })

    expect(result.model).toBe('portfolio-demo-v1')
    expect(result.text).toContain('a'.repeat(280))
    expect(result.text).not.toContain('a'.repeat(281))
    expect(result.text).toMatch(/Your question was:\n$/)
  })
})
