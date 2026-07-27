import { describe, expect, it } from 'vitest'

import {
  safeToolCall,
  toolErrorResult,
  toolTextResult,
} from '../../src/lib/tool-helpers.js'

describe('MCP tool result helpers', () => {
  it('serializes successful data into a readable text result', () => {
    expect(toolTextResult({ food: '鳕鱼', safe: true })).toEqual({
      content: [
        {
          type: 'text',
          text: '{\n  "food": "鳕鱼",\n  "safe": true\n}',
        },
      ],
    })
  })

  it('formats errors with and without a tool prefix', () => {
    expect(toolErrorResult('profile missing')).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'profile missing' }],
    })
    expect(toolErrorResult('profile missing', 'read_baby_profile')).toEqual({
      isError: true,
      content: [
        {
          type: 'text',
          text: 'read_baby_profile: profile missing',
        },
      ],
    })
  })

  it('normalizes synchronous and asynchronous tool success', async () => {
    await expect(safeToolCall(() => ({ count: 2 }))).resolves.toEqual(
      toolTextResult({ count: 2 })
    )
    await expect(safeToolCall(async () => ['鸡蛋', '豆腐'])).resolves.toEqual(
      toolTextResult(['鸡蛋', '豆腐'])
    )
  })

  it('turns thrown errors into MCP error results', async () => {
    await expect(
      safeToolCall(() => {
        throw new Error('unsafe food')
      }, 'check_food_safety')
    ).resolves.toEqual(toolErrorResult('unsafe food', 'check_food_safety'))
  })
})
