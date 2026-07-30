import type {
  ConfirmAllergyChangeInput,
  ConfirmAllergyChangeOutput,
  HouseholdAuditOutput,
  HouseholdAuditRecord,
  HouseholdRole,
  HouseholdStateOutput,
  RequestAllergyChangeInput,
  RequestAllergyChangeOutput,
} from '@fushi/contracts'
import { randomUUID } from 'node:crypto'

const HOUSEHOLD_ID = 'demo-household-001' as const
const MAX_AUDIT_RECORDS = 100
const knownReactionIds = new Set(['reaction-demo-001'])

const roleByActor: Record<string, HouseholdRole> = {
  'demo-primary-caregiver': 'primary-caregiver',
  'demo-caregiver': 'caregiver',
  'demo-viewer': 'viewer',
}

const changeRequests = new Map<
  string,
  NonNullable<RequestAllergyChangeOutput['request']>
>()
const auditRecords: HouseholdAuditRecord[] = []
let profileVersion = 1
let foodState: HouseholdStateOutput['foodStates'][number] = {
  food: '鳕鱼',
  state: 'confirmed',
}

function hasBoundRole(actorId: string, role: HouseholdRole): boolean {
  return roleByActor[actorId] === role
}

function recordAudit(
  input: Omit<
    HouseholdAuditRecord,
    | 'auditId'
    | 'timestamp'
    | 'authorizationSource'
    | 'dataSource'
    | 'profileVersion'
  >
): HouseholdAuditRecord {
  const record: HouseholdAuditRecord = {
    ...input,
    auditId: randomUUID(),
    timestamp: new Date().toISOString(),
    profileVersion,
    authorizationSource: 'household-role-policy',
    dataSource: 'synthetic-demo',
  }
  auditRecords.unshift(record)
  if (auditRecords.length > MAX_AUDIT_RECORDS) {
    auditRecords.length = MAX_AUDIT_RECORDS
  }
  return record
}

function denyRequest(
  input: RequestAllergyChangeInput,
  reasonCode: Extract<
    RequestAllergyChangeOutput['reasonCode'],
    | 'identity-role-mismatch'
    | 'role-not-authorized'
    | 'reaction-not-found'
    | 'pending-request-exists'
    | 'already-allergic'
  >
): RequestAllergyChangeOutput {
  const audit = recordAudit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: 'allergy-change.request',
    householdId: input.householdId,
    food: input.food,
    decision: 'denied',
    reasonCode,
    confirmationEvidence: false,
  })
  return {
    auditId: audit.auditId,
    decision: 'denied',
    reasonCode,
    dataSource: 'synthetic-demo',
    profileUpdated: false,
  }
}

export function getHouseholdState(): HouseholdStateOutput {
  return {
    householdId: HOUSEHOLD_ID,
    dataSource: 'synthetic-demo',
    profileVersion,
    members: [
      {
        actorId: 'demo-primary-caregiver',
        role: 'primary-caregiver',
        label: '主照护人',
        permissions: [
          'profile.read',
          'reaction.record',
          'allergy-change.request',
          'allergy-change.confirm',
        ],
      },
      {
        actorId: 'demo-caregiver',
        role: 'caregiver',
        label: '共同照护人',
        permissions: [
          'profile.read',
          'reaction.record',
          'allergy-change.request',
        ],
      },
      {
        actorId: 'demo-viewer',
        role: 'viewer',
        label: '只读家人',
        permissions: ['profile.read'],
      },
    ],
    foodStates: [{ ...foodState }],
    pendingRequests: [...changeRequests.values()].filter(
      (request) => request.status === 'pending-owner-confirmation'
    ),
  }
}

export function requestAllergyChange(
  input: RequestAllergyChangeInput
): RequestAllergyChangeOutput {
  if (!hasBoundRole(input.actor.id, input.actor.role)) {
    return denyRequest(input, 'identity-role-mismatch')
  }
  if (input.actor.role === 'viewer') {
    return denyRequest(input, 'role-not-authorized')
  }
  if (!knownReactionIds.has(input.reactionId)) {
    return denyRequest(input, 'reaction-not-found')
  }
  if (foodState.food === input.food && foodState.state === 'allergic') {
    return denyRequest(input, 'already-allergic')
  }
  if (
    [...changeRequests.values()].some(
      (request) =>
        request.food === input.food &&
        request.status === 'pending-owner-confirmation'
    )
  ) {
    return denyRequest(input, 'pending-request-exists')
  }

  const request = {
    requestId: randomUUID(),
    householdId: HOUSEHOLD_ID,
    food: input.food,
    reactionId: input.reactionId,
    requestedBy: input.actor.id,
    requestedByRole: input.actor.role,
    justification: input.justification,
    status: 'pending-owner-confirmation' as const,
    createdAt: new Date().toISOString(),
  }
  changeRequests.set(request.requestId, request)
  const audit = recordAudit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: 'allergy-change.request',
    householdId: input.householdId,
    food: input.food,
    decision: 'pending-owner-confirmation',
    reasonCode: 'owner-confirmation-required',
    confirmationEvidence: false,
  })

  return {
    auditId: audit.auditId,
    decision: 'pending-owner-confirmation',
    reasonCode: 'owner-confirmation-required',
    request,
    dataSource: 'synthetic-demo',
    profileUpdated: false,
  }
}

function denyConfirmation(
  input: ConfirmAllergyChangeInput,
  reasonCode: Exclude<
    ConfirmAllergyChangeOutput['reasonCode'],
    'allergy-profile-updated'
  >,
  food = 'unknown'
): ConfirmAllergyChangeOutput {
  const audit = recordAudit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: 'allergy-change.confirm',
    householdId: input.householdId,
    food,
    decision: 'denied',
    reasonCode,
    confirmationEvidence: false,
  })
  return {
    auditId: audit.auditId,
    decision: 'denied',
    reasonCode,
    dataSource: 'synthetic-demo',
    profileUpdated: false,
    profileVersion,
  }
}

export function confirmAllergyChange(
  input: ConfirmAllergyChangeInput
): ConfirmAllergyChangeOutput {
  if (!hasBoundRole(input.actor.id, input.actor.role)) {
    return denyConfirmation(input, 'identity-role-mismatch')
  }
  if (input.actor.role !== 'primary-caregiver') {
    return denyConfirmation(input, 'owner-role-required')
  }
  if (input.consentToConfirmIrreversible !== true) {
    return denyConfirmation(input, 'explicit-confirmation-required')
  }

  const request = changeRequests.get(input.requestId)
  if (!request || request.status !== 'pending-owner-confirmation') {
    return denyConfirmation(input, 'invalid-request')
  }
  if (!knownReactionIds.has(request.reactionId)) {
    return denyConfirmation(input, 'reaction-not-found', request.food)
  }

  const changedAt = new Date().toISOString()
  profileVersion += 1
  foodState = {
    food: request.food,
    state: 'allergic',
    changedAt,
  }
  changeRequests.set(request.requestId, {
    ...request,
    status: 'confirmed',
    confirmedAt: changedAt,
  })
  const audit = recordAudit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: 'allergy-change.confirm',
    householdId: input.householdId,
    food: request.food,
    decision: 'confirmed',
    reasonCode: 'allergy-profile-updated',
    confirmationEvidence: true,
  })

  return {
    auditId: audit.auditId,
    decision: 'confirmed',
    reasonCode: 'allergy-profile-updated',
    dataSource: 'synthetic-demo',
    profileUpdated: true,
    profileVersion,
  }
}

export function listHouseholdAudit(): HouseholdAuditOutput {
  return {
    records: [...auditRecords],
    summary: {
      total: auditRecords.length,
      denied: auditRecords.filter((record) => record.decision === 'denied')
        .length,
      pendingOwnerConfirmation: auditRecords.filter(
        (record) => record.decision === 'pending-owner-confirmation'
      ).length,
      confirmed: auditRecords.filter(
        (record) => record.decision === 'confirmed'
      ).length,
    },
    dataSource: 'synthetic-demo',
  }
}

export function clearCollaborationState(): void {
  changeRequests.clear()
  auditRecords.length = 0
  profileVersion = 1
  foodState = {
    food: '鳕鱼',
    state: 'confirmed',
  }
  knownReactionIds.clear()
  knownReactionIds.add('reaction-demo-001')
}

export function removeSyntheticReactionEvidence(reactionId: string): void {
  knownReactionIds.delete(reactionId)
}
