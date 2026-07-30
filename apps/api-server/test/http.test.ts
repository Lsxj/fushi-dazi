import {
  CheckFoodSafetyInputSchema,
  CheckFoodSafetyOutputSchema,
  GovernanceAuditOutputSchema,
  GovernancePolicyOutputSchema,
  ListSafetyTracesOutputSchema,
  RequestGovernedActionOutputSchema,
  SafetyEvaluationOutputSchema,
} from '@fushi/contracts'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'
import { clearGovernanceState } from '../src/governance.js'
import { clearSafetyTraces } from '../src/observability.js'
import { getOpenAPISpec } from '../src/openapi.js'
import { baseInput } from './fixtures.js'

const app = createApp()

describe('Express + oRPC OpenAPI boundary', () => {
  beforeEach(() => {
    clearSafetyTraces()
    clearGovernanceState()
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
    expect(response.body.paths).toHaveProperty('/v1/governance/policy')
    expect(response.body.paths).toHaveProperty('/v1/governance/actions/request')
    expect(response.body.paths).toHaveProperty('/v1/governance/actions/confirm')
    expect(response.body.paths).toHaveProperty('/v1/governance/audit')
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

    expect(ListSafetyTracesOutputSchema.parse(traces.body).summary.total).toBe(
      1
    )
    expect(
      SafetyEvaluationOutputSchema.parse(evaluation.body).passRate
    ).toBe(1)
  })

  it('enforces governance confirmation at the HTTP contract boundary', async () => {
    const policy = await request(app).get('/api/v1/governance/policy').expect(200)
    const authorization = await request(app)
      .post('/api/v1/governance/actions/request')
      .set('Content-Type', 'application/json')
      .send({
        actor: {
          id: 'demo-safety-admin',
          role: 'safety-admin',
        },
        action: 'profile.mark-allergic',
        resource: {
          type: 'demo-profile',
          id: 'demo-profile-001',
        },
        evidence: {
          reactionId: 'reaction-demo-001',
        },
        justification: '根据已记录反应申请永久过敏标记',
      })
      .expect(200)
    const missingConsent = await request(app)
      .post('/api/v1/governance/actions/confirm')
      .set('Content-Type', 'application/json')
      .send({
        actor: {
          id: 'demo-safety-admin',
          role: 'safety-admin',
        },
        confirmationToken: authorization.body.confirmationToken,
      })
    const falseConsent = await request(app)
      .post('/api/v1/governance/actions/confirm')
      .set('Content-Type', 'application/json')
      .send({
        actor: {
          id: 'demo-safety-admin',
          role: 'safety-admin',
        },
        confirmationToken: authorization.body.confirmationToken,
        consentToConfirmIrreversible: false,
      })
    const audit = await request(app).get('/api/v1/governance/audit').expect(200)

    expect(GovernancePolicyOutputSchema.parse(policy.body).identityProvider).toBe(
      'mock-demo'
    )
    expect(
      RequestGovernedActionOutputSchema.parse(authorization.body).decision
    ).toBe('confirmation-required')
    expect(missingConsent.status).toBe(400)
    expect(falseConsent.status).toBe(400)
    expect(GovernanceAuditOutputSchema.parse(audit.body).summary.total).toBe(1)
  })

  it('returns a structured 404 outside the contract router', async () => {
    const outside = await request(app).get('/missing').expect(404)
    const unmatchedApi = await request(app).get('/api/missing').expect(404)

    expect(outside.body).toEqual({ error: 'not_found' })
    expect(unmatchedApi.body).toEqual({ error: 'not_found' })
  })
})
