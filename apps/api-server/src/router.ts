import { apiContract } from '@fushi/contracts'
import type { SupportOperator } from '@fushi/contracts'
import { implement, ORPCError } from '@orpc/server'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { checkFoodsSafety } from '../../../utils/safety.js'
import { evaluateAgenticWorkflow } from '../../../utils/agentEvaluation.js'
import {
  createDemoOperatorSession,
  parseCloudBaseOperatorRoles,
  readCloudBaseOperatorSession,
  readOperatorSession,
  revokeOperatorSession,
} from './auth.js'
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
import {
  createReleaseCandidate,
  listReleaseCandidates,
  reviewReleaseCandidate,
} from './releases.js'
import {
  createSupportCase,
  listSupportCases,
  trackSupportCase,
  updateSupportCase,
} from './support.js'

interface ApiContext {
  authorization?: string
  cookie?: string
  setCookie?: (cookie: string) => void
}

const os = implement(apiContract).$context<ApiContext>()

async function resolveOperatorSession(context: ApiContext) {
  if (process.env.FUSHI_AUTH_MODE === 'cloudbase') {
    return readCloudBaseOperatorSession({
      authorization: context.authorization,
      envId: process.env.CLOUDBASE_ENV_ID ?? '',
      operatorRoles: parseCloudBaseOperatorRoles(process.env.FUSHI_ADMIN_OPERATORS),
    })
  }
  return readOperatorSession(context.cookie)
}

async function requireOperator(context: ApiContext): Promise<SupportOperator> {
  const session = await resolveOperatorSession(context)
  if (!session.authenticated || !session.operator) {
    throw new ORPCError('UNAUTHORIZED')
  }
  return session.operator
}

const getSession = os.auth.session.handler(({ context }) =>
  resolveOperatorSession(context)
)
const demoLogin = os.auth.demoLogin.handler(({ input, context }) => {
  const session = createDemoOperatorSession(input.operatorId)
  context.setCookie?.(session.cookie)
  return session.output
})
const logout = os.auth.logout.handler(({ context }) => {
  const session = revokeOperatorSession(context.cookie)
  context.setCookie?.(session.cookie)
  return session.output
})

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
const evaluateAgentic = os.evaluations.agentic.handler(() =>
  evaluateAgenticWorkflow()
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
const listCandidates = os.releases.candidates.handler(() =>
  listReleaseCandidates()
)
const createCandidate = os.releases.createCandidate.handler(({ input }) =>
  createReleaseCandidate(input)
)
const reviewCandidate = os.releases.reviewCandidate.handler(({ input }) =>
  reviewReleaseCandidate(input)
)
const createCase = os.support.createCase.handler(({ input }) =>
  createSupportCase(input)
)
const trackCase = os.support.trackCase.handler(({ input }) =>
  trackSupportCase(input)
)
const listCases = os.support.cases.handler(async ({ context }) => {
  await requireOperator(context)
  return listSupportCases(
    process.env.FUSHI_AUTH_MODE === 'cloudbase'
      ? 'cloudbase-access-token'
      : 'local-demo-session'
  )
})
const updateCase = os.support.updateCase.handler(async ({ input, context }) =>
  updateSupportCase({ ...input, actor: await requireOperator(context) })
)

export const router = os.router({
  auth: {
    session: getSession,
    demoLogin,
    logout,
  },
  safety: {
    check: checkFoodSafety,
  },
  observability: {
    traces: listTraces,
  },
  evaluations: {
    safety: evaluateSafety,
    agentic: evaluateAgentic,
  },
  collaboration: {
    household: getHousehold,
    menuPreview: getMenuPreview,
    requestAllergyChange: requestChange,
    confirmAllergyChange: confirmChange,
    audit: listCollaborationAudit,
  },
  releases: {
    candidates: listCandidates,
    createCandidate,
    reviewCandidate,
  },
  support: {
    createCase,
    trackCase,
    cases: listCases,
    updateCase,
  },
})
