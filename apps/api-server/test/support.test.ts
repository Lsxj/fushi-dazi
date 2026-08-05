import { beforeEach, describe, expect, it } from 'vitest'

import { createMemorySupportStore } from '../src/support-store.js'
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
  beforeEach(() => setSupportStoreForTests(createMemorySupportStore()))

  it('does not reveal a case when the family tracking token is wrong', () => {
    const created = createSupportCase(input)
    const tracked = trackSupportCase({
      caseId: created.case.caseId,
      trackingToken: '6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c',
    })

    expect(tracked).toEqual({ found: false, privacyMode: 'metadata-only' })
  })

  it('rejects forged roles, stale versions and invalid transitions with audit evidence', () => {
    const created = createSupportCase(input)
    const forged = updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'safety-reviewer' },
    })
    const stale = updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 9,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const invalid = updateSupportCase({
      action: 'close',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })

    expect(forged.result).toBe('identity-role-mismatch')
    expect(stale.result).toBe('case-version-conflict')
    expect(invalid.result).toBe('invalid-state-transition')
    expect(listSupportCases().auditRecords.filter((record) => record.decision === 'denied')).toHaveLength(3)
  })

  it('requires a safety reviewer to resolve a critical case', () => {
    const created = createSupportCase(input)
    const assigned = updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const denied = updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'fix-planned',
    })

    expect(denied.result).toBe('safety-reviewer-required')
    expect(denied.case?.status).toBe('investigating')

    const reviewerTooEarly = updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      resolutionCode: 'fix-planned',
    })
    expect(reviewerTooEarly.result).toBe('invalid-state-transition')
  })

  it('moves a family report through assignment, escalation, review and closure', () => {
    const created = createSupportCase(input)
    const assigned = updateSupportCase({
      action: 'assign-self',
      caseId: created.case.caseId,
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const escalated = updateSupportCase({
      action: 'escalate',
      caseId: created.case.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const resolved = updateSupportCase({
      action: 'resolve',
      caseId: created.case.caseId,
      expectedCaseVersion: escalated.case!.caseVersion,
      actor: { id: 'demo-safety-reviewer', role: 'safety-reviewer' },
      resolutionCode: 'fix-planned',
    })
    const closed = updateSupportCase({
      action: 'close',
      caseId: created.case.caseId,
      expectedCaseVersion: resolved.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const tracked = trackSupportCase({
      caseId: created.case.caseId,
      trackingToken: created.trackingToken,
    })

    expect(closed).toMatchObject({ result: 'updated', case: { status: 'closed', caseVersion: 5 } })
    expect(tracked).toMatchObject({ found: true, case: { status: 'closed', resolutionCode: 'fix-planned' } })
    expect(listSupportCases()).toMatchObject({
      summary: { total: 1, unassigned: 0, criticalOpen: 0, escalated: 0 },
      identityMode: 'mock-operator-directory',
      privacyMode: 'metadata-only',
    })
  })

  it('returns not found for an unknown case mutation', () => {
    const result = updateSupportCase({
      action: 'assign-self',
      caseId: '6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c',
      expectedCaseVersion: 1,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    expect(result.result).toBe('case-not-found')
  })

  it('classifies noncritical reports and lets support resolve an investigated data issue', () => {
    const reasons = [
      ['ai-safety-warning-missing', 'ai-quality', 'high'],
      ['inventory-not-updated', 'data-problem', 'medium'],
      ['profile-not-refreshed', 'data-problem', 'medium'],
      ['request-cloud-data-deletion', 'privacy-request', 'medium'],
    ] as const
    const created = reasons.map(([reason]) =>
      createSupportCase({ ...input, reason })
    )
    reasons.forEach(([, category, severity], index) => {
      expect(created[index].case).toMatchObject({ category, severity })
    })

    const dataCase = created[1].case
    const assigned = updateSupportCase({
      action: 'assign-self',
      caseId: dataCase.caseId,
      expectedCaseVersion: dataCase.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
    })
    const resolved = updateSupportCase({
      action: 'resolve',
      caseId: dataCase.caseId,
      expectedCaseVersion: assigned.case!.caseVersion,
      actor: { id: 'demo-support-agent', role: 'support-agent' },
      resolutionCode: 'guidance-provided',
    })
    expect(resolved).toMatchObject({
      result: 'updated',
      case: { status: 'resolved', resolutionCode: 'guidance-provided' },
    })
  })
})
