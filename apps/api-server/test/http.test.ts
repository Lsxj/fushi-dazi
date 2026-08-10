import {
  AgenticEvaluationOutputSchema,
  CheckFoodSafetyInputSchema,
  CheckFoodSafetyOutputSchema,
  HouseholdAuditOutputSchema,
  HouseholdMenuPreviewOutputSchema,
  HouseholdStateOutputSchema,
  ListSafetyTracesOutputSchema,
  RequestAllergyChangeOutputSchema,
  CreateReleaseCandidateOutputSchema,
  ListReleaseCandidatesOutputSchema,
  ReviewReleaseCandidateOutputSchema,
  CreateSupportCaseOutputSchema,
  ListSupportCasesOutputSchema,
  UpdateSupportCaseOutputSchema,
  SafetyEvaluationOutputSchema,
} from '@fushi/contracts'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { clearOperatorSessionsForTests } from '../src/auth.js'
import { clearCollaborationState } from '../src/collaboration.js'
import { clearSafetyTraces } from '../src/observability.js'
import { clearReleaseState } from '../src/releases.js'
import { clearSupportState } from '../src/support.js'
import { getOpenAPISpec } from '../src/openapi.js'
import { baseInput } from './fixtures.js'

const app = createApp()
const supportIntakeApp = createApp({ routeScope: 'support-intake' })
const adminConsoleApp = createApp({
  routeScope: 'admin-console',
  allowedOrigins: ['https://console.example.com'],
})

describe('Express + oRPC OpenAPI boundary', () => {
  beforeEach(async () => {
    clearOperatorSessionsForTests()
    clearSafetyTraces()
    clearCollaborationState()
    clearReleaseState()
    await clearSupportState()
  })

  it('serves health metadata that identifies the deterministic engine', async () => {
    const response = await request(app).get('/health').expect(200)

    expect(response.body).toEqual({
      status: 'ok',
      service: 'fushi-api-server',
      decisionSource: 'deterministic-rules',
    })
  })

  it('validates a successful HTTP response against the shared output schema', async () => {
    const response = await request(app)
      .post('/api/v1/safety/check')
      .set('Content-Type', 'application/json')
      .send(baseInput)
      .expect(200)

    expect(CheckFoodSafetyOutputSchema.parse(response.body)).toMatchObject({
      safe: true,
      decisionSource: 'deterministic-rules',
    })
  })

  it('rejects malformed and empty food inputs at the HTTP contract boundary', async () => {
    const emptyFoods = await request(app)
      .post('/api/v1/safety/check')
      .set('Content-Type', 'application/json')
      .send({ ...baseInput, foods: [] })

    const wrongType = await request(app)
      .post('/api/v1/safety/check')
      .set('Content-Type', 'application/json')
      .send({ ...baseInput, foods: [123] })

    expect(emptyFoods.status).toBe(400)
    expect(wrongType.status).toBe(400)
    expect(
      CheckFoodSafetyInputSchema.safeParse({ ...baseInput, foods: [] }).success
    ).toBe(false)
  })

  it('publishes the generated OpenAPI contract and caches the spec', async () => {
    const first = await getOpenAPISpec()
    const second = await getOpenAPISpec()
    const response = await request(app).get('/openapi.json').expect(200)

    expect(second).toBe(first)
    expect(response.body.info.title).toBe('辅食搭子 Safety API')
    expect(response.body.paths).toHaveProperty('/v1/safety/check')
    expect(response.body.paths).toHaveProperty('/v1/observability/traces')
    expect(response.body.paths).toHaveProperty('/v1/evaluations/safety')
    expect(response.body.paths).toHaveProperty('/v1/evaluations/agentic')
    expect(response.body.paths).toHaveProperty('/v1/collaboration/household')
    expect(response.body.paths).toHaveProperty(
      '/v1/collaboration/menu-preview'
    )
    expect(response.body.paths).toHaveProperty(
      '/v1/collaboration/allergy-changes/request'
    )
    expect(response.body.paths).toHaveProperty(
      '/v1/collaboration/allergy-changes/confirm'
    )
    expect(response.body.paths).toHaveProperty('/v1/collaboration/audit')
    expect(response.body.paths).toHaveProperty('/v1/releases/candidates')
    expect(response.body.paths).toHaveProperty('/v1/releases/candidates/review')
    expect(response.body.paths).toHaveProperty('/v1/support/cases')
    expect(response.body.paths).toHaveProperty('/v1/support/cases/track')
    expect(response.body.paths).toHaveProperty('/v1/support/cases/update')
    expect(response.body.paths).toHaveProperty('/v1/auth/session')
    expect(response.body.paths).toHaveProperty('/v1/auth/demo-login')
    expect(response.body.paths).toHaveProperty('/v1/auth/logout')
  })

  it('serves typed observability and evaluation reports', async () => {
    await request(app)
      .post('/api/v1/safety/check')
      .set('Content-Type', 'application/json')
      .send(baseInput)
      .expect(200)

    const traces = await request(app)
      .get('/api/v1/observability/traces')
      .expect(200)
    const evaluation = await request(app)
      .get('/api/v1/evaluations/safety')
      .expect(200)
    const agenticEvaluation = await request(app)
      .get('/api/v1/evaluations/agentic')
      .expect(200)

    expect(ListSafetyTracesOutputSchema.parse(traces.body).summary.total).toBe(
      1
    )
    expect(
      SafetyEvaluationOutputSchema.parse(evaluation.body).passRate
    ).toBe(1)
    expect(AgenticEvaluationOutputSchema.parse(agenticEvaluation.body)).toMatchObject({
      suiteId: 'agentic-workflow-v1',
      toolSelectionAccuracy: 1,
      safetyBlockRecall: 1,
      groundingProxyRate: 1,
      endToEndSuccessRate: 1,
    })
  })

  it('enforces household owner confirmation at the HTTP contract boundary', async () => {
    const household = await request(app)
      .get('/api/v1/collaboration/household')
      .expect(200)
    const changeRequest = await request(app)
      .post('/api/v1/collaboration/allergy-changes/request')
      .set('Content-Type', 'application/json')
      .send({
        actor: {
          id: 'demo-caregiver',
          role: 'caregiver',
        },
        householdId: 'demo-household-001',
        food: '鳕鱼',
        reactionId: 'reaction-demo-001',
        justification: '进食后出现已记录反应，申请更新安全档案',
        expectedProfileVersion: 1,
      })
      .expect(200)
    const missingConsent = await request(app)
      .post('/api/v1/collaboration/allergy-changes/confirm')
      .set('Content-Type', 'application/json')
      .send({
        actor: {
          id: 'demo-primary-caregiver',
          role: 'primary-caregiver',
        },
        householdId: 'demo-household-001',
        requestId: changeRequest.body.request.requestId,
        expectedProfileVersion: 1,
      })
    const falseConsent = await request(app)
      .post('/api/v1/collaboration/allergy-changes/confirm')
      .set('Content-Type', 'application/json')
      .send({
        actor: {
          id: 'demo-primary-caregiver',
          role: 'primary-caregiver',
        },
        householdId: 'demo-household-001',
        requestId: changeRequest.body.request.requestId,
        expectedProfileVersion: 1,
        consentToConfirmIrreversible: false,
      })
    const audit = await request(app)
      .get('/api/v1/collaboration/audit')
      .expect(200)

    expect(HouseholdStateOutputSchema.parse(household.body)).toMatchObject({
      dataSource: 'synthetic-demo',
      persistenceMode: 'process-memory',
    })
    expect(
      RequestAllergyChangeOutputSchema.parse(changeRequest.body).decision
    ).toBe('pending-owner-confirmation')
    expect(missingConsent.status).toBe(400)
    expect(falseConsent.status).toBe(400)
    expect(HouseholdAuditOutputSchema.parse(audit.body).summary.total).toBe(1)
  })

  it('serves a menu preview constrained by the current profile version', async () => {
    const response = await request(app)
      .get('/api/v1/collaboration/menu-preview')
      .expect(200)
    const preview = HouseholdMenuPreviewOutputSchema.parse(response.body)

    expect(preview).toMatchObject({
      profileVersion: 1,
      decisionSource: 'deterministic-rules',
      meals: [
        { slot: 'breakfast', recipeName: '南瓜大米粥' },
        { slot: 'lunch', recipeName: '鳕鱼蔬菜粥' },
      ],
    })
  })

  it('creates and reviews a release candidate through the typed boundary', async () => {
    const createdResponse = await request(app)
      .post('/api/v1/releases/candidates')
      .set('Content-Type', 'application/json')
      .send({ version: '1.2.0-rc.1', createdBy: 'product-operator' })
      .expect(200)
    const created = CreateReleaseCandidateOutputSchema.parse(createdResponse.body)
    const reviewedResponse = await request(app)
      .post('/api/v1/releases/candidates/review')
      .set('Content-Type', 'application/json')
      .send({
        candidateId: created.candidate.candidateId,
        reviewerId: 'safety-reviewer',
        decision: 'approved',
        note: '自动检查已核对，批准进入人工发布步骤',
        evidenceConfirmed: true,
      })
      .expect(200)
    const listResponse = await request(app)
      .get('/api/v1/releases/candidates')
      .expect(200)

    expect(ReviewReleaseCandidateOutputSchema.parse(reviewedResponse.body)).toMatchObject({
      result: 'review-recorded',
      candidate: { status: 'approved' },
    })
    expect(ListReleaseCandidatesOutputSchema.parse(listResponse.body)).toMatchObject({
      candidates: [{ version: '1.2.0-rc.1', status: 'approved' }],
      policy: { automaticDeployment: false },
    })
  })

  it('requires explicit diagnostic consent and serves an audited support workflow', async () => {
    const operator = request.agent(app)
    const withoutConsent = await request(app)
      .post('/api/v1/support/cases')
      .set('Content-Type', 'application/json')
      .send({
        reason: 'unsafe-food-in-menu',
        context: { clientVersion: '1.0.4', occurredAt: '2026-08-05T09:00:00.000Z' },
      })
    expect(withoutConsent.status).toBe(400)

    const createdResponse = await request(app)
      .post('/api/v1/support/cases')
      .set('Content-Type', 'application/json')
      .send({
        reason: 'unsafe-food-in-menu',
        context: { clientVersion: '1.0.4', occurredAt: '2026-08-05T09:00:00.000Z' },
        consentToUploadDiagnostics: true,
      })
      .expect(200)
    const created = CreateSupportCaseOutputSchema.parse(createdResponse.body)
    await request(app).get('/api/v1/support/cases').expect(401)
    await operator
      .post('/api/v1/auth/demo-login')
      .set('Content-Type', 'application/json')
      .send({ operatorId: 'demo-support-agent' })
      .expect(200)
    const updatedResponse = await operator
      .post('/api/v1/support/cases/update')
      .set('Content-Type', 'application/json')
      .send({
        action: 'assign-self',
        caseId: created.case.caseId,
        expectedCaseVersion: 1,
        actor: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      })
      .expect(200)
    const casesResponse = await operator.get('/api/v1/support/cases').expect(200)

    expect(UpdateSupportCaseOutputSchema.parse(updatedResponse.body)).toMatchObject({
      result: 'updated',
      case: { status: 'investigating', assignedTo: 'demo-support-agent' },
    })
    expect(ListSupportCasesOutputSchema.parse(casesResponse.body)).toMatchObject({
      summary: { total: 1, unassigned: 0, criticalOpen: 1 },
      identityMode: 'local-demo-session',
      privacyMode: 'metadata-only',
    })
  })

  it('limits the mini-program cloud function to support intake routes', async () => {
    await request(supportIntakeApp).get('/health').expect(200)
    await request(supportIntakeApp).get('/openapi.json').expect(404)
    await request(supportIntakeApp)
      .post('/api/v1/auth/demo-login')
      .set('Content-Type', 'application/json')
      .send({ operatorId: 'demo-support-agent' })
      .expect(404)
    await request(supportIntakeApp).get('/api/v1/support/cases').expect(404)

    const created = await request(supportIntakeApp)
      .post('/api/v1/support/cases')
      .set('Content-Type', 'application/json')
      .send({
        reason: 'unsafe-food-in-menu',
        context: {
          clientVersion: '1.0.4',
          occurredAt: '2026-08-05T09:00:00.000Z',
        },
        consentToUploadDiagnostics: true,
      })
      .expect(200)

    await request(supportIntakeApp)
      .post('/api/v1/support/cases/track')
      .set('Content-Type', 'application/json')
      .send({
        caseId: created.body.case.caseId,
        trackingToken: created.body.trackingToken,
      })
      .expect(200)
  })

  it('limits the admin cloud function to authenticated console routes', async () => {
    await request(adminConsoleApp).get('/health').expect(200)
    await request(adminConsoleApp).get('/openapi.json').expect(404)
    await request(adminConsoleApp)
      .post('/api/v1/auth/demo-login')
      .set('Content-Type', 'application/json')
      .send({ operatorId: 'demo-support-agent' })
      .expect(404)
    await request(adminConsoleApp)
      .post('/api/v1/support/cases')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(404)
    await request(adminConsoleApp).get('/api/v1/auth/session').expect(200)
    await request(adminConsoleApp).get('/api/v1/support/cases').expect(401)
  })

  it('allows credential headers only for an explicitly configured console origin', async () => {
    const allowed = await request(adminConsoleApp)
      .options('/api/v1/auth/session')
      .set('Origin', 'https://console.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(204)
    const rejected = await request(adminConsoleApp)
      .options('/api/v1/auth/session')
      .set('Origin', 'https://untrusted.example.com')
      .expect(403)

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://console.example.com'
    )
    expect(allowed.headers['access-control-allow-headers']).toContain(
      'Authorization'
    )
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('fails closed when cloud administrator configuration is missing', async () => {
    const previousMode = process.env.FUSHI_AUTH_MODE
    const previousEnvironment = process.env.CLOUDBASE_ENV_ID
    const previousOperators = process.env.FUSHI_ADMIN_OPERATORS
    process.env.FUSHI_AUTH_MODE = 'cloudbase'
    process.env.CLOUDBASE_ENV_ID = 'env-test'
    delete process.env.FUSHI_ADMIN_OPERATORS

    try {
      const session = await request(adminConsoleApp)
        .get('/api/v1/auth/session')
        .set('Authorization', 'Bearer forged')
        .expect(200)
      await request(adminConsoleApp)
        .get('/api/v1/support/cases')
        .set('Authorization', 'Bearer forged')
        .expect(401)

      expect(session.body).toMatchObject({
        authenticated: false,
        identityMode: 'cloudbase-access-token',
        sessionTransport: 'bearer-access-token',
      })
    } finally {
      if (previousMode === undefined) delete process.env.FUSHI_AUTH_MODE
      else process.env.FUSHI_AUTH_MODE = previousMode
      if (previousEnvironment === undefined) delete process.env.CLOUDBASE_ENV_ID
      else process.env.CLOUDBASE_ENV_ID = previousEnvironment
      if (previousOperators === undefined) delete process.env.FUSHI_ADMIN_OPERATORS
      else process.env.FUSHI_ADMIN_OPERATORS = previousOperators
    }
  })

  it('returns a structured 404 outside the contract router', async () => {
    const outside = await request(app).get('/missing').expect(404)
    const unmatchedApi = await request(app).get('/api/missing').expect(404)

    expect(outside.body).toEqual({ error: 'not_found' })
    expect(unmatchedApi.body).toEqual({ error: 'not_found' })
  })
})
