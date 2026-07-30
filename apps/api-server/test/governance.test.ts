import { call } from '@orpc/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearGovernanceState } from '../src/governance.js'
import { router } from '../src/router.js'

const demoRequest = {
  actor: {
    id: 'demo-safety-admin',
    role: 'safety-admin' as const,
  },
  action: 'profile.mark-allergic' as const,
  resource: {
    type: 'demo-profile' as const,
    id: 'demo-profile-001' as const,
  },
  evidence: {
    reactionId: 'reaction-demo-001',
  },
  justification: '根据已记录反应申请永久过敏标记',
}

describe('deterministic governance procedures', () => {
  beforeEach(() => clearGovernanceState())
  afterEach(() => vi.useRealTimers())

  it('publishes an honest mock identity policy', async () => {
    const policy = await call(router.governance.policy, {})

    expect(policy).toMatchObject({
      identityProvider: 'mock-demo',
      executionMode: 'simulation',
      externalMutationPerformed: false,
    })
    expect(
      policy.roles.find((role) => role.role === 'safety-admin')?.permissions
    ).toContain('profile.mark-allergic')
  })

  it('denies an unauthorized role and writes a metadata-only audit record', async () => {
    const result = await call(router.governance.requestAction, {
      ...demoRequest,
      actor: {
        id: 'demo-viewer',
        role: 'viewer',
      },
    })
    const audit = await call(router.governance.audit, {})

    expect(result).toMatchObject({
      decision: 'denied',
      reasonCode: 'role-not-authorized',
      externalMutationPerformed: false,
    })
    expect(audit).toMatchObject({
      privacyMode: 'metadata-only',
      summary: {
        total: 1,
        denied: 1,
      },
    })
    expect(JSON.stringify(audit)).not.toContain('reaction-demo-001')
    expect(JSON.stringify(audit)).not.toContain('永久过敏标记')
  })

  it('rejects a forged actor-to-role binding', async () => {
    const result = await call(router.governance.requestAction, {
      ...demoRequest,
      actor: {
        id: 'demo-viewer',
        role: 'safety-admin',
      },
    })

    expect(result).toMatchObject({
      decision: 'denied',
      reasonCode: 'identity-role-mismatch',
    })
  })

  it('requires and records explicit one-time confirmation without mutating externally', async () => {
    const request = await call(router.governance.requestAction, demoRequest)

    expect(request).toMatchObject({
      decision: 'confirmation-required',
      reasonCode: 'explicit-confirmation-required',
      externalMutationPerformed: false,
    })
    expect(request.confirmationToken).toBeDefined()

    const confirmed = await call(router.governance.confirmAction, {
      actor: demoRequest.actor,
      confirmationToken: request.confirmationToken!,
      consentToConfirmIrreversible: true,
    })
    const replay = await call(router.governance.confirmAction, {
      actor: demoRequest.actor,
      confirmationToken: request.confirmationToken!,
      consentToConfirmIrreversible: true,
    })
    const audit = await call(router.governance.audit, {})

    expect(confirmed).toMatchObject({
      decision: 'confirmed',
      reasonCode: 'explicit-confirmation-recorded',
      externalMutationPerformed: false,
    })
    expect(replay).toMatchObject({
      decision: 'denied',
      reasonCode: 'invalid-or-expired-token',
    })
    expect(audit.summary).toMatchObject({
      total: 3,
      denied: 1,
      awaitingConfirmation: 1,
      confirmed: 1,
    })
    expect(audit.records[1]?.confirmationEvidence).toBe(true)
  })

  it('rejects a confirmation token used by a different actor', async () => {
    const request = await call(router.governance.requestAction, demoRequest)
    const result = await call(router.governance.confirmAction, {
      actor: {
        id: 'demo-auditor',
        role: 'auditor',
      },
      confirmationToken: request.confirmationToken!,
      consentToConfirmIrreversible: true,
    })

    expect(result).toMatchObject({
      decision: 'denied',
      reasonCode: 'actor-mismatch',
    })
  })

  it('rejects a forged identity-role binding during confirmation', async () => {
    const request = await call(router.governance.requestAction, demoRequest)
    const result = await call(router.governance.confirmAction, {
      actor: {
        id: 'demo-viewer',
        role: 'safety-admin',
      },
      confirmationToken: request.confirmationToken!,
      consentToConfirmIrreversible: true,
    })

    expect(result).toMatchObject({
      decision: 'denied',
      reasonCode: 'identity-role-mismatch',
    })
  })

  it('rejects expired tokens and caps the audit trail at 100 records', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T00:00:00.000Z'))
    const request = await call(router.governance.requestAction, demoRequest)

    vi.setSystemTime(new Date('2026-07-30T00:06:00.000Z'))
    const expired = await call(router.governance.confirmAction, {
      actor: demoRequest.actor,
      confirmationToken: request.confirmationToken!,
      consentToConfirmIrreversible: true,
    })
    expect(expired.reasonCode).toBe('invalid-or-expired-token')

    for (let index = 0; index < 100; index += 1) {
      await call(router.governance.requestAction, {
        ...demoRequest,
        actor: {
          id: 'demo-viewer',
          role: 'viewer',
        },
      })
    }

    const audit = await call(router.governance.audit, {})
    expect(audit.records).toHaveLength(100)
  })
})
