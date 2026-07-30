import type {
  CheckFoodSafetyInput,
  CheckFoodSafetyOutput,
  GovernanceAuditOutput,
  GovernancePolicyOutput,
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

const governancePolicyResponse: GovernancePolicyOutput = {
  identityProvider: 'mock-demo',
  executionMode: 'simulation',
  externalMutationPerformed: false,
  roles: [
    {
      role: 'viewer',
      label: '只读观察者',
      permissions: ['safety.report.read'],
    },
    {
      role: 'operator',
      label: '业务操作员',
      permissions: ['safety.report.read'],
    },
    {
      role: 'safety-admin',
      label: '安全管理员',
      permissions: [
        'safety.report.read',
        'profile.mark-allergic',
        'audit.export',
      ],
    },
    {
      role: 'auditor',
      label: '审计员',
      permissions: ['safety.report.read', 'audit.export'],
    },
  ],
  irreversibleActions: [
    {
      action: 'profile.mark-allergic',
      requiresExplicitConfirmation: true,
    },
  ],
}

const governanceAuditResponse: GovernanceAuditOutput = {
  records: [
    {
      auditId: '93759ae7-bcee-4a75-9249-11f49d55b32a',
      timestamp: '2026-07-30T03:00:00.000Z',
      actorId: 'demo-safety-admin',
      actorRole: 'safety-admin',
      action: 'profile.mark-allergic',
      resourceType: 'demo-profile',
      decision: 'confirmed',
      reasonCode: 'explicit-confirmation-recorded',
      confirmationEvidence: true,
      authorizationSource: 'deterministic-rbac',
      identityProvider: 'mock-demo',
      executionMode: 'simulation',
      externalMutationPerformed: false,
    },
  ],
  summary: {
    total: 1,
    denied: 0,
    awaitingConfirmation: 0,
    confirmed: 1,
  },
  privacyMode: 'metadata-only',
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

export const governancePolicyHandler = http.get(
  '*/api/v1/governance/policy',
  () => HttpResponse.json(governancePolicyResponse)
)

export const governanceAuditHandler = http.get(
  '*/api/v1/governance/audit',
  () => HttpResponse.json(governanceAuditResponse)
)

export const governanceRequestHandler = http.post(
  '*/api/v1/governance/actions/request',
  async ({ request }) => {
    const input = (await request.json()) as {
      actor: { role: string }
    }
    if (input.actor.role !== 'safety-admin') {
      return HttpResponse.json({
        auditId: '70d8dd8e-dc48-4f8d-a6af-0ff4a8bc015a',
        decision: 'denied',
        reasonCode: 'role-not-authorized',
        identityProvider: 'mock-demo',
        executionMode: 'simulation',
        externalMutationPerformed: false,
      })
    }
    return HttpResponse.json({
      auditId: 'ed89da47-49ab-4e56-80f0-d7a3bb802238',
      decision: 'confirmation-required',
      reasonCode: 'explicit-confirmation-required',
      confirmationToken: '7c4a51b6-8aed-40dc-9285-56837f406cf1',
      expiresAt: '2026-07-30T03:05:00.000Z',
      identityProvider: 'mock-demo',
      executionMode: 'simulation',
      externalMutationPerformed: false,
    })
  }
)

export const governanceConfirmHandler = http.post(
  '*/api/v1/governance/actions/confirm',
  () =>
    HttpResponse.json({
      auditId: '93759ae7-bcee-4a75-9249-11f49d55b32a',
      decision: 'confirmed',
      reasonCode: 'explicit-confirmation-recorded',
      identityProvider: 'mock-demo',
      executionMode: 'simulation',
      externalMutationPerformed: false,
    })
)

export const server = setupServer(
  successHandler,
  tracesHandler,
  evaluationHandler,
  governancePolicyHandler,
  governanceAuditHandler,
  governanceRequestHandler,
  governanceConfirmHandler
)
