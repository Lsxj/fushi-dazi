import { call } from '@orpc/server'
import { describe, expect, it } from 'vitest'

import { router } from '../src/router.js'
import { baseInput } from './fixtures.js'

describe('contract-first safety procedure', () => {
  it('rejects an unsafe or unknown food through deterministic rules', async () => {
    const result = await call(router.safety.check, {
      ...baseInput,
      foods: ['虾', '蜂蜜'],
    })

    expect(result.safe).toBe(false)
    expect(result.decisionSource).toBe('deterministic-rules')
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          food: '虾',
          safe: false,
          categoryState: 'locked',
        }),
        expect.objectContaining({
          food: '蜂蜜',
          safe: false,
          reason: '蜂蜜未在分类库',
        }),
      ])
    )
  })

  it('returns a safe verdict and an auditable profile snapshot', async () => {
    const result = await call(router.safety.check, baseInput)

    expect(result).toMatchObject({
      safe: true,
      decisionSource: 'deterministic-rules',
      profileSnapshot: {
        ageMonths: 10,
        currentStatus: 'normal',
      },
      results: [
        {
          food: '鳕鱼',
          safe: true,
          categoryId: 'fish',
          categoryState: 'open',
        },
      ],
    })
  })

  it('returns mitigation warnings without silently blocking safe foods', async () => {
    const result = await call(router.safety.check, {
      ...baseInput,
      foods: ['菠菜', '豆腐'],
    })

    expect(result.safe).toBe(true)
    expect(result.tabooWarnings).toEqual([
      expect.objectContaining({
        foods: ['菠菜', '豆腐'],
        level: 'soft',
        mitigation: '菠菜先焯水 30 秒去草酸',
      }),
    ])
  })

  it('blocks an individual food that has been marked allergic', async () => {
    const result = await call(router.safety.check, {
      ...baseInput,
      foods: ['鳕鱼'],
      profile: {
        ...baseInput.profile,
        individualExceptions: {
          鳕鱼: {
            state: 'allergic',
            reasonReactionId: 'reaction-001',
          },
        },
      },
    })

    expect(result.safe).toBe(false)
    expect(result.results[0]).toMatchObject({
      food: '鳕鱼',
      safe: false,
      reason: '鳕鱼已标记过敏',
    })
  })
})
