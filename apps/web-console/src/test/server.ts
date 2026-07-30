import type {
  CheckFoodSafetyInput,
  CheckFoodSafetyOutput,
  ListSafetyTracesOutput,
  SafetyEvaluationOutput,
} from '@fushi/contracts'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

function responseFor(input: CheckFoodSafetyInput): CheckFoodSafetyOutput {
  const allergicFoods = input.foods.filter(
    (food) => input.profile.individualExceptions[food]?.state === 'allergic'
  )
  const unconfirmedAfterVaccine = input.foods.filter(
    (food) =>
      input.profile.currentStatus === 'postVaccine' &&
      !input.profile.confirmedFoods?.includes(food)
  )
  const blocked = new Set([...allergicFoods, ...unconfirmedAfterVaccine])
  const hasSpinachTofu =
    input.foods.includes('菠菜') && input.foods.includes('豆腐')

  return {
    traceId: '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8',
    durationMs: 1.42,
    safe: blocked.size === 0,
    decisionSource: 'deterministic-rules',
    profileSnapshot: {
      ageMonths: input.profile.ageMonths,
      currentStatus: input.profile.currentStatus,
    },
    results: input.foods.map((food) => ({
      food,
      safe: !blocked.has(food),
      ...(blocked.has(food)
        ? {
            reason: allergicFoods.includes(food)
              ? `${food}已标记过敏`
              : `疫苗期间只用确认稳定的食物,${food}不在清单内`,
          }
        : { categoryId: food === '豆腐' ? 'tofu' : 'leafy' }),
    })),
    tabooWarnings: hasSpinachTofu
      ? [
          {
            foods: ['菠菜', '豆腐'],
            level: 'soft',
            reason: '草酸与钙结合形成草酸钙,降低钙吸收',
            mitigation: '菠菜先焯水 30 秒去草酸',
            source: 'NutritionConsensus',
          },
        ]
      : [],
    tabooBlocks: [],
  }
}

const traceResponse: ListSafetyTracesOutput = {
  traces: [
    {
      traceId: '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8',
      timestamp: '2026-07-30T02:30:00.000Z',
      operation: 'safety.check',
      executionMode: 'deterministic',
      provider: 'none',
      decisionSource: 'deterministic-rules',
      status: 'allowed',
      durationMs: 1.42,
      inputSummary: {
        foodCount: 2,
        profileStatus: 'normal',
      },
      outputSummary: {
        safe: true,
        passedCount: 2,
        blockedCount: 0,
        warningCount: 1,
        hardBlockCount: 0,
      },
    },
    {
      traceId: 'f2796a53-25fa-49b6-b0b3-5857a4f4f83c',
      timestamp: '2026-07-30T02:29:00.000Z',
      operation: 'safety.check',
      executionMode: 'deterministic',
      provider: 'none',
      decisionSource: 'deterministic-rules',
      status: 'blocked',
      durationMs: 0.86,
      inputSummary: {
        foodCount: 1,
        profileStatus: 'normal',
      },
      outputSummary: {
        safe: false,
        passedCount: 0,
        blockedCount: 1,
        warningCount: 0,
        hardBlockCount: 0,
      },
    },
  ],
  summary: {
    total: 2,
    allowed: 1,
    blocked: 1,
    averageDurationMs: 1.14,
  },
  privacyMode: 'summary-only',
}

const evaluationResponse: SafetyEvaluationOutput = {
  suiteId: 'safety-regression-v1',
  evaluatedAt: '2026-07-30T02:30:00.000Z',
  executionMode: 'deterministic',
  provider: 'none',
  datasetSize: 4,
  passCount: 4,
  passRate: 1,
  safetyBlockRecall: 1,
  cases: [
    ['confirmed-food', '已确认食材正常放行', true, true],
    ['unknown-food', '未知食材必须阻断', false, false],
    ['individual-allergy', '个体过敏必须阻断', false, false],
    ['soft-taboo', '软禁忌提醒但不误拦截', true, true],
  ].map(([id, label, expectedSafe, actualSafe]) => ({
    id: String(id),
    label: String(label),
    expectedSafe: Boolean(expectedSafe),
    actualSafe: Boolean(actualSafe),
    passed: expectedSafe === actualSafe,
  })),
}

export const successHandler = http.post(
  '*/api/v1/safety/check',
  async ({ request }) => {
    const input = (await request.json()) as CheckFoodSafetyInput
    return HttpResponse.json(responseFor(input))
  }
)

export const tracesHandler = http.get(
  '*/api/v1/observability/traces',
  () => HttpResponse.json(traceResponse)
)

export const evaluationHandler = http.get(
  '*/api/v1/evaluations/safety',
  () => HttpResponse.json(evaluationResponse)
)

export const server = setupServer(
  successHandler,
  tracesHandler,
  evaluationHandler
)
