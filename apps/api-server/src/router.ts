import { apiContract } from '@fushi/contracts'
import { implement } from '@orpc/server'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { checkFoodsSafety } from '../../../utils/safety.js'
import {
  confirmAllergyChange,
  getHouseholdMenuPreview,
  getHouseholdState,
  listHouseholdAudit,
  requestAllergyChange,
} from './collaboration.js'
import { evaluateSafetyRules } from './evaluation.js'
import {
  listSafetyTraces,
  recordSafetyTrace,
} from './observability.js'

const os = implement(apiContract)

const checkFoodSafety = os.safety.check.handler(({ input }) => {
  const traceId = randomUUID()
  const startedAt = performance.now()
  const result = checkFoodsSafety(input.foods, input.profile)
  const durationMs = Number((performance.now() - startedAt).toFixed(2))

  recordSafetyTrace({
    traceId,
    timestamp: new Date().toISOString(),
    operation: 'safety.check',
    executionMode: 'deterministic',
    provider: 'none',
    decisionSource: 'deterministic-rules',
    status: result.safe ? 'allowed' : 'blocked',
    durationMs,
    inputSummary: {
      foodCount: input.foods.length,
      profileStatus: input.profile.currentStatus,
    },
    outputSummary: {
      safe: result.safe,
      passedCount: result.results.filter((item) => item.safe).length,
      blockedCount: result.results.filter((item) => !item.safe).length,
      warningCount: result.tabooWarnings.length,
      hardBlockCount: result.tabooBlocks.length,
    },
  })

  return {
    ...result,
    traceId,
    durationMs,
    decisionSource: 'deterministic-rules' as const,
    profileSnapshot: {
      ageMonths: input.profile.ageMonths,
      currentStatus: input.profile.currentStatus,
    },
  }
})

const listTraces = os.observability.traces.handler(() => listSafetyTraces())
const evaluateSafety = os.evaluations.safety.handler(() =>
  evaluateSafetyRules()
)
const getHousehold = os.collaboration.household.handler(() =>
  getHouseholdState()
)
const getMenuPreview = os.collaboration.menuPreview.handler(() =>
  getHouseholdMenuPreview()
)
const requestChange = os.collaboration.requestAllergyChange.handler(
  ({ input }) => requestAllergyChange(input)
)
const confirmChange = os.collaboration.confirmAllergyChange.handler(
  ({ input }) => confirmAllergyChange(input)
)
const listCollaborationAudit = os.collaboration.audit.handler(() =>
  listHouseholdAudit()
)

export const router = os.router({
  safety: {
    check: checkFoodSafety,
  },
  observability: {
    traces: listTraces,
  },
  evaluations: {
    safety: evaluateSafety,
  },
  collaboration: {
    household: getHousehold,
    menuPreview: getMenuPreview,
    requestAllergyChange: requestChange,
    confirmAllergyChange: confirmChange,
    audit: listCollaborationAudit,
  },
})
