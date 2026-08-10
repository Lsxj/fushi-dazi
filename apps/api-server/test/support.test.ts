import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemorySupportStore } from '../src/support-store.js'
import { createMemoryObservabilityStore } from '../src/observability-store.js'
import { recordSafetyTrace, setObservabilityStoreForTests } from '../src/observability.js'
import {
  createSupportCase,
  listSupportCases,
  setSupportStoreForTests,
  trackSupportCase,
  updateSupportCase,
} from '../src/support.js'

const input = {
  reason: 'unsafe-food-in-menu' as const,
  context: {
    clientVersion: '1.0.4',
    occurredAt: '2026-08-05T09:00:00.000Z',
    menuDate: '2026-08-06',
    profileVersion: 3,
  },
  consentToUploadDiagnostics: true as const,
}

describe('metadata-only support case workflow', () => {
  beforeEach(() => {
    setSupportStoreForTests(createMemorySupportStore())
    setObservabilityStoreForTests(createMemoryObservabilityStore())
  })

  it('does not reveal a case when the family tracking token is wrong', async () => {
    const created = await createSupportCase(input)
    const tracked = await trackSupportCase({
      caseId: created.case.caseId,
      trackingToken: '6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c',
    })

    expect(tracked).toEqual({ found: false, privacyMode: 'metadata-only' })
  })

  it('reports deterministic SLA targets and breaches without changing case state', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-05T09:00:00.000Z'))
      const created = await createSupportCase(input)
      vi.setSystemTime(new Date('2026-08-05T09:16:00.000Z'))

      const queue = await listSupportCases()

      expect(queue).toMatchObject({
        evaluatedAt: '2026-08-05T09:16:00.000Z',
        slaPolicy: {
          critical: { firstResponseMinutes: 15, resolutionMinutes: 240 },
        },
        summary: { slaBreached: 1 },
      })
      expect(queue.cases[0]).toMatchObject({
        caseId: created.case.caseId,
        status: 'new',
        caseVersion: 1,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects forged roles, stale versions and invalid transitions with audit evidence', async () => {
    const created = await createSupportCase(input)
    const forged = await updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'safety-reviewer' },
    })
    const stale = await updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 9,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const invalid = await updateSupportCase({
      action: 'close',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })

    expect(forged.result).toBe('identity-role-mismatch')
    expect(stale.result).toBe('case-version-conflict')
    expect(invalid.result).toBe('invalid-state-transition')
    const queue = await listSupportCases()
    expect(queue.auditRecords.filter((record) => record.decision === 'denied')).toHaveLength(3)
  })

  it('requires a safety reviewer to resolve a critical case', async () => {
    const created = await createSupportCase(input)
    const assigned = await updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const denied = await updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'fix-planned',
    })

    expect(denied.result).toBe('safety-reviewer-required')
    expect(denied.case?.status).toBe('investigating')

    const reviewerTooEarly = await updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      resolutionCode: 'fix-planned',
    })
    expect(reviewerTooEarly.result).toBe('invalid-state-transition')
  })

  it('blocks unsupported evidence and resolution without an investigation record', async () => {
    const created = await createSupportCase({
      ...input,
      context: {
        clientVersion: input.context.clientVersion,
        occurredAt: input.context.occurredAt,
      },
    })
    const assigned = await updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const unsupported = await updateSupportCase({
      action: 'record-investigation',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'insufficient-evidence',
      evidence: ['safety-trace-reference'],
    })
    const escalated = await updateSupportCase({
      action: 'escalate',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const unresolved = await updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: escalated.case!.caseVersion,
      actor: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      resolutionCode: 'no-defect-found',
    })

    expect(unsupported.result).toBe('evidence-unavailable')
    expect(unresolved.result).toBe('investigation-required')
    expect((await listSupportCases()).auditRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: 'denied', reasonCode: 'evidence-unavailable' }),
        expect.objectContaining({ decision: 'denied', reasonCode: 'investigation-required' }),
      ])
    )
  })

  it('rejects resolution codes that contradict the case or investigation', async () => {
    const privacyCase = (await createSupportCase({
      ...input,
      reason: 'request-cloud-data-deletion',
    })).case
    const privacyAssigned = await updateSupportCase({
      action: 'assign-self',
      caseId: privacyCase.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const privacyInvestigated = await updateSupportCase({
      action: 'record-investigation',
      caseId: privacyCase.caseId,
      expectedCaseVersion: privacyAssigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'privacy-request-validated',
      evidence: ['diagnostic-context'],
    })
    const wrongPrivacyResolution = await updateSupportCase({
      action: 'resolve',
      caseId: privacyCase.caseId,
      expectedCaseVersion: privacyInvestigated.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'fix-planned',
    })
    const acceptedPrivacyResolution = await updateSupportCase({
      action: 'resolve',
      caseId: privacyCase.caseId,
      expectedCaseVersion: privacyInvestigated.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'deletion-accepted',
    })

    const dataCase = (await createSupportCase({
      ...input,
      reason: 'inventory-not-updated',
    })).case
    const dataAssigned = await updateSupportCase({
      action: 'assign-self',
      caseId: dataCase.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const dataInvestigated = await updateSupportCase({
      action: 'record-investigation',
      caseId: dataCase.caseId,
      expectedCaseVersion: dataAssigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'insufficient-evidence',
      evidence: ['diagnostic-context'],
    })
    const prematureResolution = await updateSupportCase({
      action: 'resolve',
      caseId: dataCase.caseId,
      expectedCaseVersion: dataInvestigated.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'no-defect-found',
    })
    const deletionOnDataCase = await updateSupportCase({
      action: 'resolve',
      caseId: dataCase.caseId,
      expectedCaseVersion: dataInvestigated.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'deletion-accepted',
    })

    expect(wrongPrivacyResolution.result).toBe('resolution-incompatible')
    expect(acceptedPrivacyResolution).toMatchObject({
      result: 'updated',
      case: { status: 'resolved', resolutionCode: 'deletion-accepted' },
    })
    expect(prematureResolution.result).toBe('resolution-incompatible')
    expect(deletionOnDataCase.result).toBe('resolution-incompatible')
    expect(wrongPrivacyResolution.case?.status).toBe('investigating')
    expect(prematureResolution.case?.status).toBe('investigating')
  })

  it('accepts a trace as evidence only when the referenced execution exists', async () => {
    const traceId = '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8'
    const created = await createSupportCase({
      ...input,
      context: { ...input.context, traceId },
    })
    const assigned = await updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const missing = await updateSupportCase({
      action: 'record-investigation',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'confirmed-product-defect',
      evidence: ['safety-trace-reference'],
    })

    recordSafetyTrace({
      traceId,
      timestamp: '2026-08-05T09:00:00.000Z',
      operation: 'safety.check',
      executionMode: 'deterministic',
      provider: 'none',
      decisionSource: 'deterministic-rules',
      status: 'blocked',
      durationMs: 1.2,
      inputSummary: { foodCount: 1, profileStatus: 'normal' },
      outputSummary: {
        safe: false,
        passedCount: 0,
        blockedCount: 1,
        warningCount: 0,
        hardBlockCount: 1,
      },
    })
    const verified = await updateSupportCase({
      action: 'record-investigation',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'confirmed-product-defect',
      evidence: ['safety-trace-reference'],
    })

    expect(missing.result).toBe('evidence-unavailable')
    expect(verified).toMatchObject({
      result: 'updated',
      case: { investigation: { evidence: ['safety-trace-reference'] } },
    })
  })

  it('moves a family report through assignment, escalation, review and closure', async () => {
    const created = await createSupportCase(input)
    const assigned = await updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const investigated = await updateSupportCase({
      action: 'record-investigation',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'confirmed-product-defect',
      evidence: ['diagnostic-context', 'profile-version-reference', 'menu-date-reference'],
    })
    const escalated = await updateSupportCase({
      action: 'escalate',
      caseId: created.case.caseId,
      expectedCaseVersion: investigated.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const resolved = await updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: escalated.case!.caseVersion,
      actor: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      resolutionCode: 'fix-planned',
    })
    const closed = await updateSupportCase({
      action: 'close',
      caseId: created.case.caseId,
      expectedCaseVersion: resolved.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const tracked = await trackSupportCase({
      caseId: created.case.caseId,
      trackingToken: created.trackingToken,
    })

    expect(closed).toMatchObject({ result: 'updated', case: { status: 'closed', caseVersion: 6 } })
    expect(tracked).toMatchObject({ found: true, case: { status: 'closed', resolutionCode: 'fix-planned' } })
    expect(tracked.case?.investigation).toMatchObject({
      finding: 'confirmed-product-defect',
      evidence: ['diagnostic-context', 'profile-version-reference', 'menu-date-reference'],
    })
    expect(await listSupportCases()).toMatchObject({
      summary: { total: 1, unassigned: 0, criticalOpen: 0, escalated: 0 },
      identityMode: 'local-demo-session',
      privacyMode: 'metadata-only',
    })
  })

  it('returns not found for an unknown case mutation', async () => {
    const result = await updateSupportCase({
      action: 'assign-self',
      caseId: '6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c',
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    expect(result.result).toBe('case-not-found')
  })

  it('classifies noncritical reports and lets support resolve an investigated data issue', async () => {
    const reasons = [
      ['ai-safety-warning-missing', 'ai-quality', 'high'],
      ['inventory-not-updated', 'data-problem', 'medium'],
      ['profile-not-refreshed', 'data-problem', 'medium'],
      ['request-cloud-data-deletion', 'privacy-request', 'medium'],
    ] as const
    const created = await Promise.all(
      reasons.map(([reason]) => createSupportCase({ ...input, reason }))
    )
    reasons.forEach(([, category, severity], index) => {
      expect(created[index].case).toMatchObject({ category, severity })
    })

    const dataCase = created[1].case
    const assigned = await updateSupportCase({
      action: 'assign-self',
      caseId: dataCase.caseId,
      expectedCaseVersion: dataCase.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const investigated = await updateSupportCase({
      action: 'record-investigation',
      caseId: dataCase.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      finding: 'client-state-stale',
      evidence: ['diagnostic-context'],
    })
    const resolved = await updateSupportCase({
      action: 'resolve',
      caseId: dataCase.caseId,
      expectedCaseVersion: investigated.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'guidance-provided',
    })
    expect(resolved).toMatchObject({
      result: 'updated',
      case: { status: 'resolved', resolutionCode: 'guidance-provided' },
    })
  })
})
