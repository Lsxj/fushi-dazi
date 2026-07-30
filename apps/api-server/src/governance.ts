import type {
  ConfirmGovernedActionInput,
  ConfirmGovernedActionOutput,
  GovernanceAuditOutput,
  GovernanceAuditRecord,
  GovernancePolicyOutput,
  GovernanceRole,
  RequestGovernedActionInput,
  RequestGovernedActionOutput,
} from '@fushi/contracts'
import { randomUUID } from 'node:crypto'

const MAX_AUDIT_RECORDS = 100
const CONFIRMATION_TTL_MS = 5 * 60 * 1000

const roleByDemoActor: Record<string, GovernanceRole> = {
  'demo-viewer': 'viewer',
  'demo-operator': 'operator',
  'demo-safety-admin': 'safety-admin',
  'demo-auditor': 'auditor',
}

const auditRecords: GovernanceAuditRecord[] = []
const confirmationChallenges = new Map<
  string,
  {
    actorId: string
    actorRole: GovernanceRole
    expiresAt: number
  }
>()

export function getGovernancePolicy(): GovernancePolicyOutput {
  return {
    identityProvider: 'mock-demo',
    executionMode: 'simulation',
    externalMutationPerformed: false,
    roles: [
      {
        role: 'viewer',
        label: '只读观察者',
        permissions: ['safety.report.read'],
      },
      {
        role: 'operator',
        label: '业务操作员',
        permissions: ['safety.report.read'],
      },
      {
        role: 'safety-admin',
        label: '安全管理员',
        permissions: [
          'safety.report.read',
          'profile.mark-allergic',
          'audit.export',
        ],
      },
      {
        role: 'auditor',
        label: '审计员',
        permissions: ['safety.report.read', 'audit.export'],
      },
    ],
    irreversibleActions: [
      {
        action: 'profile.mark-allergic',
        requiresExplicitConfirmation: true,
      },
    ],
  }
}

function recordAudit(
  input: Omit<
    GovernanceAuditRecord,
    | 'auditId'
    | 'timestamp'
    | 'authorizationSource'
    | 'identityProvider'
    | 'executionMode'
    | 'externalMutationPerformed'
  >
): GovernanceAuditRecord {
  const record: GovernanceAuditRecord = {
    ...input,
    auditId: randomUUID(),
    timestamp: new Date().toISOString(),
    authorizationSource: 'deterministic-rbac',
    identityProvider: 'mock-demo',
    executionMode: 'simulation',
    externalMutationPerformed: false,
  }

  auditRecords.unshift(record)
  if (auditRecords.length > MAX_AUDIT_RECORDS) {
    auditRecords.length = MAX_AUDIT_RECORDS
  }
  return record
}

function hasBoundRole(actorId: string, role: GovernanceRole): boolean {
  return roleByDemoActor[actorId] === role
}

export function requestGovernedAction(
  input: RequestGovernedActionInput
): RequestGovernedActionOutput {
  if (!hasBoundRole(input.actor.id, input.actor.role)) {
    const audit = recordAudit({
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: input.action,
      resourceType: input.resource.type,
      decision: 'denied',
      reasonCode: 'identity-role-mismatch',
      confirmationEvidence: false,
    })
    return {
      auditId: audit.auditId,
      decision: 'denied',
      reasonCode: 'identity-role-mismatch',
      identityProvider: 'mock-demo',
      executionMode: 'simulation',
      externalMutationPerformed: false,
    }
  }

  if (input.actor.role !== 'safety-admin') {
    const audit = recordAudit({
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: input.action,
      resourceType: input.resource.type,
      decision: 'denied',
      reasonCode: 'role-not-authorized',
      confirmationEvidence: false,
    })
    return {
      auditId: audit.auditId,
      decision: 'denied',
      reasonCode: 'role-not-authorized',
      identityProvider: 'mock-demo',
      executionMode: 'simulation',
      externalMutationPerformed: false,
    }
  }

  const confirmationToken = randomUUID()
  const expiresAt = Date.now() + CONFIRMATION_TTL_MS
  confirmationChallenges.set(confirmationToken, {
    actorId: input.actor.id,
    actorRole: input.actor.role,
    expiresAt,
  })
  const audit = recordAudit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: input.action,
    resourceType: input.resource.type,
    decision: 'confirmation-required',
    reasonCode: 'explicit-confirmation-required',
    confirmationEvidence: false,
  })

  return {
    auditId: audit.auditId,
    decision: 'confirmation-required',
    reasonCode: 'explicit-confirmation-required',
    confirmationToken,
    expiresAt: new Date(expiresAt).toISOString(),
    identityProvider: 'mock-demo',
    executionMode: 'simulation',
    externalMutationPerformed: false,
  }
}

export function confirmGovernedAction(
  input: ConfirmGovernedActionInput
): ConfirmGovernedActionOutput {
  const challenge = confirmationChallenges.get(input.confirmationToken)
  confirmationChallenges.delete(input.confirmationToken)

  let reasonCode: ConfirmGovernedActionOutput['reasonCode']
  if (!hasBoundRole(input.actor.id, input.actor.role)) {
    reasonCode = 'identity-role-mismatch'
  } else if (!challenge || challenge.expiresAt < Date.now()) {
    reasonCode = 'invalid-or-expired-token'
  } else if (
    challenge.actorId !== input.actor.id ||
    challenge.actorRole !== input.actor.role
  ) {
    reasonCode = 'actor-mismatch'
  } else {
    reasonCode = 'explicit-confirmation-recorded'
  }

  const confirmed = reasonCode === 'explicit-confirmation-recorded'
  const audit = recordAudit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: 'profile.mark-allergic',
    resourceType: 'demo-profile',
    decision: confirmed ? 'confirmed' : 'denied',
    reasonCode,
    confirmationEvidence: confirmed,
  })

  return {
    auditId: audit.auditId,
    decision: confirmed ? 'confirmed' : 'denied',
    reasonCode,
    identityProvider: 'mock-demo',
    executionMode: 'simulation',
    externalMutationPerformed: false,
  }
}

export function listGovernanceAudit(): GovernanceAuditOutput {
  return {
    records: [...auditRecords],
    summary: {
      total: auditRecords.length,
      denied: auditRecords.filter((record) => record.decision === 'denied')
        .length,
      awaitingConfirmation: auditRecords.filter(
        (record) => record.decision === 'confirmation-required'
      ).length,
      confirmed: auditRecords.filter(
        (record) => record.decision === 'confirmed'
      ).length,
    },
    privacyMode: 'metadata-only',
  }
}

export function clearGovernanceState(): void {
  auditRecords.length = 0
  confirmationChallenges.clear()
}
