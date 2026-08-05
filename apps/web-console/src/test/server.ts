import type {
  AgenticEvaluationOutput,
  CheckFoodSafetyInput,
  CheckFoodSafetyOutput,
  HouseholdAuditOutput,
  HouseholdMenuPreviewOutput,
  HouseholdStateOutput,
  ListReleaseCandidatesOutput,
  ReleaseCandidate,
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

const agenticEvaluationResponse: AgenticEvaluationOutput = {
  suiteId: 'agentic-workflow-v1',
  evaluatedAt: '2026-08-05T03:00:00.000Z',
  executionMode: 'offline-deterministic',
  provider: 'mock-policy',
  datasetSize: 9,
  passCount: 9,
  toolSelectionAccuracy: 1,
  safetyBlockRecall: 1,
  groundingProxyRate: 1,
  endToEndSuccessRate: 1,
  cases: [
    {
      id: 'daily-menu',
      label: '今日菜单调用确定性规划器',
      question: '今天吃什么？',
      evidenceSource: 'menu-planner',
      expectedTool: 'generate_today_menu',
      actualTool: 'generate_today_menu',
      expectedSafety: null,
      actualSafety: null,
      toolSelectionPassed: true,
      groundingProxyPassed: true,
      safetyPassed: true,
      passed: true,
    },
    {
      id: 'locked-category-trial',
      label: '锁定品类试吃必须被规则阻断',
      question: '想试试虾',
      evidenceSource: 'safety-rules',
      expectedTool: 'check_food_safety',
      actualTool: 'check_food_safety',
      expectedSafety: 'block',
      actualSafety: 'block',
      toolSelectionPassed: true,
      groundingProxyPassed: true,
      safetyPassed: true,
      passed: true,
    },
  ],
}

const householdResponse: HouseholdStateOutput = {
  householdId: 'demo-household-001',
  dataSource: 'synthetic-demo',
  persistenceMode: 'process-memory',
  profileVersion: 1,
  members: [
    {
      actorId: 'demo-primary-caregiver',
      role: 'primary-caregiver',
      label: '主照护人',
      permissions: [
        'profile.read',
        'reaction.record',
        'allergy-change.request',
        'allergy-change.confirm',
      ],
    },
    {
      actorId: 'demo-caregiver',
      role: 'caregiver',
      label: '共同照护人',
      permissions: [
        'profile.read',
        'reaction.record',
        'allergy-change.request',
      ],
    },
    {
      actorId: 'demo-viewer',
      role: 'viewer',
      label: '只读家人',
      permissions: ['profile.read'],
    },
  ],
  foodStates: [{ food: '鳕鱼', state: 'confirmed' }],
  pendingRequests: [],
}

let collaborationProfileIsAllergic = false
let releaseCandidates: ReleaseCandidate[] = []

export function resetCollaborationMockState() {
  collaborationProfileIsAllergic = false
  releaseCandidates = []
}

function menuPreviewResponse(): HouseholdMenuPreviewOutput {
  return {
    householdId: 'demo-household-001',
    dataSource: 'synthetic-demo',
    persistenceMode: 'process-memory',
    profileVersion: collaborationProfileIsAllergic ? 2 : 1,
    decisionSource: 'deterministic-rules',
    executionMode: 'deterministic',
    provider: 'none',
    meals: [
      {
        slot: 'breakfast',
        recipeId: 'r002',
        recipeName: '南瓜大米粥',
        ingredients: ['南瓜', '大米'],
      },
      {
        slot: 'lunch',
        recipeId: collaborationProfileIsAllergic ? 'r010' : 'r005',
        recipeName: collaborationProfileIsAllergic
          ? '牛肉土豆粥'
          : '鳕鱼蔬菜粥',
        ingredients: collaborationProfileIsAllergic
          ? ['牛肉', '土豆', '大米']
          : ['鳕鱼', '西兰花', '大米'],
      },
    ],
    exclusions: collaborationProfileIsAllergic
      ? [
          {
            recipeId: 'r005',
            recipeName: '鳕鱼蔬菜粥',
            blockedFood: '鳕鱼',
            reason: '鳕鱼已标记过敏',
            rule: 'individual-allergy',
          },
        ]
      : [],
  }
}

const householdAuditResponse: HouseholdAuditOutput = {
  persistenceMode: 'process-memory',
  records: [
    {
      auditId: '93759ae7-bcee-4a75-9249-11f49d55b32a',
      timestamp: '2026-07-30T03:00:00.000Z',
      actorId: 'demo-primary-caregiver',
      actorRole: 'primary-caregiver',
      action: 'allergy-change.confirm',
      householdId: 'demo-household-001',
      food: '鳕鱼',
      decision: 'confirmed',
      reasonCode: 'allergy-profile-updated',
      confirmationEvidence: true,
      profileVersion: 2,
      authorizationSource: 'household-role-policy',
      dataSource: 'synthetic-demo',
    },
  ],
  summary: {
    total: 1,
    denied: 0,
    pendingOwnerConfirmation: 0,
    confirmed: 1,
  },
  dataSource: 'synthetic-demo',
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

export const agenticEvaluationHandler = http.get(
  '*/api/v1/evaluations/agentic',
  () => HttpResponse.json(agenticEvaluationResponse)
)

export const householdHandler = http.get(
  '*/api/v1/collaboration/household',
  () =>
    HttpResponse.json({
      ...householdResponse,
      profileVersion: collaborationProfileIsAllergic ? 2 : 1,
      foodStates: [
        {
          food: '鳕鱼',
          state: collaborationProfileIsAllergic ? 'allergic' : 'confirmed',
          ...(collaborationProfileIsAllergic
            ? { changedAt: '2026-07-30T03:00:00.000Z' }
            : {}),
        },
      ],
    } satisfies HouseholdStateOutput)
)

export const householdMenuPreviewHandler = http.get(
  '*/api/v1/collaboration/menu-preview',
  () => HttpResponse.json(menuPreviewResponse())
)

export const householdAuditHandler = http.get(
  '*/api/v1/collaboration/audit',
  () => HttpResponse.json(householdAuditResponse)
)

export const allergyChangeRequestHandler = http.post(
  '*/api/v1/collaboration/allergy-changes/request',
  async ({ request }) => {
    const input = (await request.json()) as {
      actor: { role: string }
    }
    if (input.actor.role === 'viewer') {
      return HttpResponse.json({
        auditId: '70d8dd8e-dc48-4f8d-a6af-0ff4a8bc015a',
        decision: 'denied',
        reasonCode: 'role-not-authorized',
        dataSource: 'synthetic-demo',
        profileUpdated: false,
      })
    }
    return HttpResponse.json({
      auditId: 'ed89da47-49ab-4e56-80f0-d7a3bb802238',
      decision: 'pending-owner-confirmation',
      reasonCode: 'owner-confirmation-required',
      request: {
        requestId: '7c4a51b6-8aed-40dc-9285-56837f406cf1',
        householdId: 'demo-household-001',
        food: '鳕鱼',
        reactionId: 'reaction-demo-001',
        requestedBy: 'demo-caregiver',
        requestedByRole: 'caregiver',
        justification: '进食后出现已记录反应，申请更新安全档案',
        baseProfileVersion: 1,
        status: 'pending-owner-confirmation',
        createdAt: '2026-07-30T03:00:00.000Z',
      },
      dataSource: 'synthetic-demo',
      profileUpdated: false,
    })
  }
)

export const allergyChangeConfirmHandler = http.post(
  '*/api/v1/collaboration/allergy-changes/confirm',
  () => {
    collaborationProfileIsAllergic = true
    return HttpResponse.json({
      auditId: '93759ae7-bcee-4a75-9249-11f49d55b32a',
      decision: 'confirmed',
      reasonCode: 'allergy-profile-updated',
      dataSource: 'synthetic-demo',
      profileUpdated: true,
      profileVersion: 2,
    })
  }
)

export const releaseCandidatesHandler = http.get(
  '*/api/v1/releases/candidates',
  () =>
    HttpResponse.json({
      candidates: releaseCandidates,
      persistenceMode: 'process-memory',
      policy: {
        approvalRequiresSafetyPassRate: 1,
        approvalRequiresSafetyBlockRecall: 1,
        approvalRequiresAgenticSuccessRate: 1,
        automaticDeployment: false,
      },
    } satisfies ListReleaseCandidatesOutput)
)

export const createReleaseCandidateHandler = http.post(
  '*/api/v1/releases/candidates',
  async ({ request }) => {
    const input = (await request.json()) as {
      version: string
      createdBy: string
    }
    const candidate: ReleaseCandidate = {
      candidateId: '5a78fbe0-26b5-4228-b086-42c4f665e258',
      version: input.version,
      createdBy: input.createdBy,
      createdAt: '2026-08-05T08:00:00.000Z',
      status: 'awaiting-review',
      evidence: {
        safetySuiteId: 'safety-regression-v1',
        safetyEvaluatedAt: evaluationResponse.evaluatedAt,
        safetyPassCount: evaluationResponse.passCount,
        safetyDatasetSize: evaluationResponse.datasetSize,
        safetyPassRate: 1,
        safetyBlockRecall: 1,
        agenticSuiteId: 'agentic-workflow-v1',
        agenticEvaluatedAt: agenticEvaluationResponse.evaluatedAt,
        agenticPassCount: agenticEvaluationResponse.passCount,
        agenticDatasetSize: agenticEvaluationResponse.datasetSize,
        agenticEndToEndSuccessRate: 1,
        agenticProvider: 'mock-policy',
        gatePassed: true,
        decisionSource: 'deterministic-release-policy',
      },
    }
    releaseCandidates = [candidate, ...releaseCandidates]
    return HttpResponse.json({ candidate, persistenceMode: 'process-memory' })
  }
)

export const reviewReleaseCandidateHandler = http.post(
  '*/api/v1/releases/candidates/review',
  async ({ request }) => {
    const input = (await request.json()) as {
      candidateId: string
      reviewerId: string
      decision: 'approved' | 'blocked'
      note: string
    }
    const current = releaseCandidates.find(
      (candidate) => candidate.candidateId === input.candidateId
    )
    if (!current) {
      return HttpResponse.json({
        result: 'candidate-not-found',
        persistenceMode: 'process-memory',
      })
    }
    const candidate: ReleaseCandidate = {
      ...current,
      status: input.decision,
      review: {
        reviewerId: input.reviewerId,
        decision: input.decision,
        note: input.note,
        evidenceConfirmed: true,
        reviewedAt: '2026-08-05T08:05:00.000Z',
      },
    }
    releaseCandidates = releaseCandidates.map((item) =>
      item.candidateId === candidate.candidateId ? candidate : item
    )
    return HttpResponse.json({
      candidate,
      result: 'review-recorded',
      persistenceMode: 'process-memory',
    })
  }
)

export const server = setupServer(
  successHandler,
  tracesHandler,
  evaluationHandler,
  agenticEvaluationHandler,
  householdHandler,
  householdMenuPreviewHandler,
  householdAuditHandler,
  allergyChangeRequestHandler,
  allergyChangeConfirmHandler,
  releaseCandidatesHandler,
  createReleaseCandidateHandler,
  reviewReleaseCandidateHandler
)
