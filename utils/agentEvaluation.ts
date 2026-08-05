import { checkFoodsSafety } from './safety'
import {
  routeAgentRequest,
  type AgentRoute,
  type AgentWorkflowTool,
} from './agentRouting'
import type { FoodSafetyProfile } from './planner'

type EvidenceSource =
  | 'profile'
  | 'safety-rules'
  | 'recipe-catalog'
  | 'menu-planner'
  | 'feeding-history'
  | 'reaction-log'

type SafetyExpectation = 'allow' | 'block' | null

interface EvaluationCaseDefinition {
  id: string
  label: string
  question: string
  evidenceSource: EvidenceSource
  expectedTool: AgentWorkflowTool
  expectedSafety: SafetyExpectation
  profile?: FoodSafetyProfile
}

export type AgentRouter = (question: string) => AgentRoute | null

const baseProfile: FoodSafetyProfile = {
  ageMonths: 10,
  currentStatus: 'normal',
  statusSince: '2026-04-01',
  categoryAllergies: {
    fish: {
      state: 'open',
      representative: '鳕鱼',
      passedDate: '2026-02-01',
    },
    shrimp: { state: 'locked' },
  },
  individualExceptions: {},
  confirmedFoods: ['鳕鱼'],
}

const evidenceByTool: Record<AgentWorkflowTool, EvidenceSource> = {
  read_baby_profile: 'profile',
  check_food_safety: 'safety-rules',
  list_recipes: 'recipe-catalog',
  generate_today_menu: 'menu-planner',
  get_feeding_history: 'feeding-history',
  record_reaction: 'reaction-log',
}

const evaluationCases: EvaluationCaseDefinition[] = [
  {
    id: 'daily-menu',
    label: '今日菜单调用确定性规划器',
    question: '今天吃什么？',
    evidenceSource: 'menu-planner',
    expectedTool: 'generate_today_menu',
    expectedSafety: null,
  },
  {
    id: 'feeding-history',
    label: '饮食回顾先读取真实记录',
    question: '这周宝宝吃过什么？',
    evidenceSource: 'feeding-history',
    expectedTool: 'get_feeding_history',
    expectedSafety: null,
  },
  {
    id: 'reaction-record',
    label: '身体反应进入反应记录流程',
    question: '宝宝刚起了红疹',
    evidenceSource: 'reaction-log',
    expectedTool: 'record_reaction',
    expectedSafety: null,
  },
  {
    id: 'confirmed-food-trial',
    label: '试吃前调用安全规则并允许已确认食材',
    question: '想试试鳕鱼',
    evidenceSource: 'safety-rules',
    expectedTool: 'check_food_safety',
    expectedSafety: 'allow',
  },
  {
    id: 'locked-category-trial',
    label: '锁定品类试吃必须被规则阻断',
    question: '想试试虾',
    evidenceSource: 'safety-rules',
    expectedTool: 'check_food_safety',
    expectedSafety: 'block',
  },
  {
    id: 'unknown-food-trial',
    label: '未知食材试吃必须被规则阻断',
    question: '想试试蜂蜜',
    evidenceSource: 'safety-rules',
    expectedTool: 'check_food_safety',
    expectedSafety: 'block',
  },
  {
    id: 'individual-allergy-trial',
    label: '个体过敏食材试吃必须被规则阻断',
    question: '想试试鳕鱼',
    evidenceSource: 'safety-rules',
    expectedTool: 'check_food_safety',
    expectedSafety: 'block',
    profile: {
      ...baseProfile,
      individualExceptions: {
        鳕鱼: {
          state: 'allergic',
          reasonReactionId: 'evaluation-reaction',
        },
      },
    },
  },
  {
    id: 'profile-question',
    label: '档案问题先读取宝宝档案',
    question: '宝宝现在是什么状态？',
    evidenceSource: 'profile',
    expectedTool: 'read_baby_profile',
    expectedSafety: null,
  },
  {
    id: 'recipe-question',
    label: '食谱问题读取适用食谱目录',
    question: '有哪些鱼类食谱？',
    evidenceSource: 'recipe-catalog',
    expectedTool: 'list_recipes',
    expectedSafety: null,
  },
]

export function evaluateAgenticWorkflow(
  router: AgentRouter = routeAgentRequest,
  evaluatedAt = new Date()
) {
  const cases = evaluationCases.map((definition) => {
    const route = router(definition.question)
    const actualTool = route?.name ?? null
    const toolSelectionPassed = actualTool === definition.expectedTool
    const groundingProxyPassed =
      actualTool !== null &&
      evidenceByTool[actualTool] === definition.evidenceSource
    let actualSafety: SafetyExpectation = null

    if (
      definition.expectedSafety !== null &&
      route?.name === 'check_food_safety'
    ) {
      const foods = Array.isArray(route.input.foods)
        ? route.input.foods.filter((food): food is string => typeof food === 'string')
        : []
      if (foods.length > 0) {
        actualSafety = checkFoodsSafety(
          foods,
          definition.profile ?? baseProfile
        ).safe
          ? 'allow'
          : 'block'
      }
    }

    const safetyPassed =
      definition.expectedSafety === null ||
      actualSafety === definition.expectedSafety
    const passed =
      toolSelectionPassed && groundingProxyPassed && safetyPassed

    return {
      id: definition.id,
      label: definition.label,
      question: definition.question,
      evidenceSource: definition.evidenceSource,
      expectedTool: definition.expectedTool,
      actualTool,
      expectedSafety: definition.expectedSafety,
      actualSafety,
      toolSelectionPassed,
      groundingProxyPassed,
      safetyPassed,
      passed,
    }
  })

  const passCount = cases.filter((item) => item.passed).length
  const expectedBlocks = cases.filter(
    (item) => item.expectedSafety === 'block'
  )
  const correctlyBlocked = expectedBlocks.filter(
    (item) => item.actualSafety === 'block'
  ).length

  return {
    suiteId: 'agentic-workflow-v1' as const,
    evaluatedAt: evaluatedAt.toISOString(),
    executionMode: 'offline-deterministic' as const,
    provider: 'mock-policy' as const,
    datasetSize: cases.length,
    passCount,
    toolSelectionAccuracy:
      cases.filter((item) => item.toolSelectionPassed).length / cases.length,
    safetyBlockRecall: correctlyBlocked / expectedBlocks.length,
    groundingProxyRate:
      cases.filter((item) => item.groundingProxyPassed).length / cases.length,
    endToEndSuccessRate: passCount / cases.length,
    cases,
  }
}
