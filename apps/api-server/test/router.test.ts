import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { evaluateAgenticWorkflow } from '../../../utils/agentEvaluation.js'
import { clearSafetyTraces } from '../src/observability.js'
import { router } from '../src/router.js'
import { baseInput } from './fixtures.js'

describe('contract-first safety procedure', () => {
  beforeEach(() => clearSafetyTraces())

  it('rejects an unsafe or unknown food through deterministic rules', async () => {
    const result = await call(router.safety.check, {
      ...baseInput,
      foods: ['虾', '蜂蜜'],
    })

    expect(result.safe).toBe(false)
    expect(result.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
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

  it('records privacy-safe summaries without food names or notes', async () => {
    const check = await call(router.safety.check, {
      ...baseInput,
      foods: ['鳕鱼'],
      profile: {
        ...baseInput.profile,
        individualExceptions: {
          鳕鱼: {
            state: 'allergic',
            note: 'private-reaction-note',
          },
        },
      },
    })
    const traceReport = await call(router.observability.traces, {})

    expect(traceReport).toMatchObject({
      privacyMode: 'summary-only',
      summary: {
        total: 1,
        allowed: 0,
        blocked: 1,
      },
      traces: [
        {
          traceId: check.traceId,
          executionMode: 'deterministic',
          provider: 'none',
          status: 'blocked',
          inputSummary: {
            foodCount: 1,
            profileStatus: 'normal',
          },
          outputSummary: {
            safe: false,
            passedCount: 0,
            blockedCount: 1,
          },
        },
      ],
    })
    expect(JSON.stringify(traceReport)).not.toContain('鳕鱼')
    expect(JSON.stringify(traceReport)).not.toContain('private-reaction-note')
  })

  it('runs the fixed deterministic regression suite', async () => {
    const evaluation = await call(router.evaluations.safety, {})

    expect(evaluation).toMatchObject({
      suiteId: 'safety-regression-v1',
      executionMode: 'deterministic',
      provider: 'none',
      datasetSize: 4,
      passCount: 4,
      passRate: 1,
      safetyBlockRecall: 1,
    })
    expect(evaluation.cases.every((item) => item.passed)).toBe(true)

    const traces = await call(router.observability.traces, {})
    expect(traces.summary.total).toBe(0)
  })

  it('runs the offline agentic workflow evaluation without model calls', async () => {
    const evaluation = await call(router.evaluations.agentic, {})

    expect(evaluation).toMatchObject({
      suiteId: 'agentic-workflow-v1',
      executionMode: 'offline-deterministic',
      provider: 'mock-policy',
      datasetSize: 9,
      passCount: 9,
      toolSelectionAccuracy: 1,
      safetyBlockRecall: 1,
      groundingProxyRate: 1,
      endToEndSuccessRate: 1,
    })
    expect(evaluation.cases.every((item) => item.passed)).toBe(true)
  })

  it('reports routing and safety failures instead of hiding them', () => {
    const evaluation = evaluateAgenticWorkflow(() => null)

    expect(evaluation.passCount).toBe(0)
    expect(evaluation.toolSelectionAccuracy).toBe(0)
    expect(evaluation.safetyBlockRecall).toBe(0)
    expect(evaluation.groundingProxyRate).toBe(0)
    expect(evaluation.endToEndSuccessRate).toBe(0)
  })

  it('keeps only the latest 100 privacy-safe traces', async () => {
    for (let index = 0; index < 101; index += 1) {
      await call(router.safety.check, baseInput)
    }

    const traces = await call(router.observability.traces, {})

    expect(traces.traces).toHaveLength(100)
    expect(traces.summary).toMatchObject({
      total: 100,
      allowed: 100,
      blocked: 0,
    })
  })
})
