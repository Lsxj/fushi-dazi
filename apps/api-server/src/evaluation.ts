import type {
  CheckFoodSafetyInput,
  SafetyEvaluationOutput,
} from '@fushi/contracts'

import { checkFoodsSafety } from '../../../utils/safety.js'

const baseProfile: CheckFoodSafetyInput['profile'] = {
  ageMonths: 10,
  currentStatus: 'normal',
  statusSince: '2026-04-01',
  categoryAllergies: {
    fish: {
      state: 'open',
      representative: '鳕鱼',
      passedDate: '2026-02-01',
    },
    leafy: {
      state: 'open',
      representative: '菠菜',
      passedDate: '2025-12-15',
    },
    tofu: {
      state: 'open',
      representative: '豆腐',
      passedDate: '2026-01-15',
    },
  },
  individualExceptions: {},
  confirmedFoods: ['鳕鱼', '菠菜', '豆腐'],
}

const evaluationCases: Array<{
  id: string
  label: string
  expectedSafe: boolean
  input: CheckFoodSafetyInput
}> = [
  {
    id: 'confirmed-food',
    label: '已确认食材正常放行',
    expectedSafe: true,
    input: { foods: ['鳕鱼'], profile: baseProfile },
  },
  {
    id: 'unknown-food',
    label: '未知食材必须阻断',
    expectedSafe: false,
    input: { foods: ['蜂蜜'], profile: baseProfile },
  },
  {
    id: 'individual-allergy',
    label: '个体过敏必须阻断',
    expectedSafe: false,
    input: {
      foods: ['鳕鱼'],
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
  },
  {
    id: 'soft-taboo',
    label: '软禁忌提醒但不误拦截',
    expectedSafe: true,
    input: { foods: ['菠菜', '豆腐'], profile: baseProfile },
  },
]

export function evaluateSafetyRules(): SafetyEvaluationOutput {
  const cases = evaluationCases.map((evaluationCase) => {
    const actualSafe = checkFoodsSafety(
      evaluationCase.input.foods,
      evaluationCase.input.profile
    ).safe

    return {
      id: evaluationCase.id,
      label: evaluationCase.label,
      expectedSafe: evaluationCase.expectedSafe,
      actualSafe,
      passed: actualSafe === evaluationCase.expectedSafe,
    }
  })
  const passCount = cases.filter((evaluationCase) => evaluationCase.passed).length
  const expectedBlocks = cases.filter(
    (evaluationCase) => !evaluationCase.expectedSafe
  )
  const correctlyBlocked = expectedBlocks.filter(
    (evaluationCase) => !evaluationCase.actualSafe
  ).length

  return {
    suiteId: 'safety-regression-v1',
    evaluatedAt: new Date().toISOString(),
    executionMode: 'deterministic',
    provider: 'none',
    datasetSize: cases.length,
    passCount,
    passRate: passCount / cases.length,
    safetyBlockRecall: correctlyBlocked / expectedBlocks.length,
    cases,
  }
}
