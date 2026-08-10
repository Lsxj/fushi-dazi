import type {
  CreateSupportCaseInput,
  CreateSupportCaseOutput,
  ListSupportCasesOutput,
  SupportCase,
  SupportCaseAuditRecord,
  SupportOperator,
  TrackSupportCaseInput,
  TrackSupportCaseOutput,
  UpdateSupportCaseInput,
  UpdateSupportCaseOutput,
} from '@fushi/contracts'
import { randomUUID } from 'node:crypto'

import { findSafetyTrace } from './observability.js'

import {
  createCloudBaseSupportStore,
  createFileSupportStore,
  createMemorySupportStore,
  getDefaultSupportStorePath,
  hashTrackingToken,
  type StoredSupportCase,
  type SupportStore,
} from './support-store.js'

export const SUPPORT_SLA_POLICY: ListSupportCasesOutput['slaPolicy'] = {
  critical: { firstResponseMinutes: 15, resolutionMinutes: 240 },
  high: { firstResponseMinutes: 60, resolutionMinutes: 480 },
  medium: { firstResponseMinutes: 240, resolutionMinutes: 1440 },
  low: { firstResponseMinutes: 480, resolutionMinutes: 2880 },
}
const demoRoleByActor: Record<string, SupportOperator['role']> = {
  'demo-support-agent': 'support-agent',
  'demo-safety-reviewer': 'safety-reviewer',
} as const

type AuthenticatedUpdateSupportCaseInput = UpdateSupportCaseInput & {
  actor: SupportOperator
}

function createConfiguredSupportStore(): SupportStore {
  if (process.env.NODE_ENV === 'test') return createMemorySupportStore()
  if (process.env.FUSHI_SUPPORT_STORE === 'cloudbase') {
    return createCloudBaseSupportStore({
      envId: process.env.CLOUDBASE_ENV_ID ?? '',
      ...(process.env.FUSHI_SUPPORT_COLLECTION
        ? { collectionName: process.env.FUSHI_SUPPORT_COLLECTION }
        : {}),
    })
  }
  return createFileSupportStore(
    process.env.FUSHI_SUPPORT_STORE_PATH ?? getDefaultSupportStorePath()
  )
}

let supportStore: SupportStore = createConfiguredSupportStore()

function publicCase(storedCase: StoredSupportCase): SupportCase {
  const { trackingTokenHash: _trackingTokenHash, ...supportCase } = storedCase
  return structuredClone(supportCase)
}

function classify(reason: CreateSupportCaseInput['reason']): Pick<SupportCase, 'category' | 'severity'> {
  switch (reason) {
    case 'unsafe-food-in-menu':
      return { category: 'menu-safety', severity: 'critical' }
    case 'ai-safety-warning-missing':
      return { category: 'ai-quality', severity: 'high' }
    case 'request-cloud-data-deletion':
      return { category: 'privacy-request', severity: 'medium' }
    default:
      return { category: 'data-problem', severity: 'medium' }
  }
}

function actionName(action: UpdateSupportCaseInput['action']): SupportCaseAuditRecord['action'] {
  return {
    'assign-self': 'case-assigned',
    'record-investigation': 'case-investigation-recorded',
    escalate: 'case-escalated',
    resolve: 'case-resolved',
    close: 'case-closed',
  }[action] as SupportCaseAuditRecord['action']
}

function createAudit(
  input: Omit<SupportCaseAuditRecord, 'auditId' | 'timestamp' | 'privacyMode'>
): SupportCaseAuditRecord {
  return {
    ...input,
    auditId: randomUUID(),
    timestamp: new Date().toISOString(),
    privacyMode: 'metadata-only',
  }
}

export async function createSupportCase(
  input: CreateSupportCaseInput
): Promise<CreateSupportCaseOutput> {
  const now = new Date().toISOString()
  const trackingToken = randomUUID()
  const classification = classify(input.reason)
  const supportCase: StoredSupportCase = {
    caseId: randomUUID(),
    caseVersion: 1,
    ...classification,
    reason: input.reason,
    severity: classification.severity,
    status: 'new',
    source: 'mini-program',
    context: structuredClone(input.context),
    createdAt: now,
    updatedAt: now,
    trackingTokenHash: hashTrackingToken(trackingToken),
  }
  const audit = createAudit({
    caseId: supportCase.caseId,
    actorId: 'anonymous-family',
    actorRole: 'family-reporter',
    action: 'case-created',
    decision: 'allowed',
    toStatus: 'new',
    reasonCode: input.reason,
    caseVersion: 1,
  })
  await supportStore.createCase(supportCase, audit)
  return {
    case: publicCase(supportCase),
    trackingToken,
    auditId: audit.auditId,
    privacyMode: 'metadata-only',
  }
}

export async function trackSupportCase(
  input: TrackSupportCaseInput
): Promise<TrackSupportCaseOutput> {
  const candidate = await supportStore.findCase(input.caseId)
  const found = candidate?.trackingTokenHash === hashTrackingToken(input.trackingToken)
    ? candidate
    : undefined
  return {
    ...(found ? { case: publicCase(found) } : {}),
    found: Boolean(found),
    privacyMode: 'metadata-only',
  }
}

export async function listSupportCases(
  identityMode: ListSupportCasesOutput['identityMode'] = 'local-demo-session'
): Promise<ListSupportCasesOutput> {
  const state = await supportStore.list()
  const cases = state.cases.map(publicCase)
  const evaluatedAt = new Date().toISOString()
  const evaluatedAtMs = new Date(evaluatedAt).getTime()
  const slaBreached = cases.filter((supportCase) => {
    if (supportCase.status === 'resolved' || supportCase.status === 'closed') return false
    const target = SUPPORT_SLA_POLICY[supportCase.severity]
    const targetMinutes = supportCase.status === 'new'
      ? target.firstResponseMinutes
      : target.resolutionMinutes
    return evaluatedAtMs > new Date(supportCase.createdAt).getTime() + targetMinutes * 60_000
  }).length
  return {
    cases,
    evaluatedAt,
    slaPolicy: SUPPORT_SLA_POLICY,
    summary: {
      total: cases.length,
      unassigned: cases.filter((supportCase) => !supportCase.assignedTo).length,
      criticalOpen: cases.filter(
        (supportCase) =>
          supportCase.severity === 'critical' &&
          supportCase.status !== 'resolved' &&
          supportCase.status !== 'closed'
      ).length,
      escalated: cases.filter((supportCase) => supportCase.status === 'escalated').length,
      slaBreached,
    },
    auditRecords: structuredClone(state.auditRecords),
    persistenceMode: supportStore.mode,
    identityMode,
    privacyMode: 'metadata-only',
  }
}

async function denied(
  supportCase: StoredSupportCase,
  input: AuthenticatedUpdateSupportCaseInput,
  result: Exclude<UpdateSupportCaseOutput['result'], 'updated' | 'case-not-found'>
): Promise<UpdateSupportCaseOutput> {
  const audit = createAudit({
    caseId: supportCase.caseId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: actionName(input.action),
    decision: 'denied',
    fromStatus: supportCase.status,
    toStatus: supportCase.status,
    reasonCode: result,
    caseVersion: supportCase.caseVersion,
  })
  await supportStore.appendAudit(supportCase.caseId, audit)
  return {
    case: publicCase(supportCase),
    auditId: audit.auditId,
    result,
    persistenceMode: supportStore.mode,
  }
}

export async function updateSupportCase(
  input: AuthenticatedUpdateSupportCaseInput
): Promise<UpdateSupportCaseOutput> {
  const current = await supportStore.findCase(input.caseId)
  if (!current) return { result: 'case-not-found', persistenceMode: supportStore.mode }
  const expectedDemoRole = demoRoleByActor[input.actor.id]
  if (expectedDemoRole && expectedDemoRole !== input.actor.role) {
    return denied(current, input, 'identity-role-mismatch')
  }
  if (current.caseVersion !== input.expectedCaseVersion) {
    return denied(current, input, 'case-version-conflict')
  }

  if (input.action === 'record-investigation') {
    const unavailableEvidence = input.evidence.some((evidence) => {
      if (evidence === 'safety-trace-reference') {
        return !current.context.traceId || !findSafetyTrace(current.context.traceId)
      }
      if (evidence === 'profile-version-reference') return !current.context.profileVersion
      if (evidence === 'menu-date-reference') return !current.context.menuDate
      return false
    })
    if (unavailableEvidence) {
      return denied(current, input, 'evidence-unavailable')
    }
  }

  let nextStatus: SupportCase['status']
  if (input.action === 'assign-self' && current.status === 'new') {
    nextStatus = 'investigating'
  } else if (
    input.action === 'record-investigation' &&
    (current.status === 'investigating' || current.status === 'escalated')
  ) {
    nextStatus = current.status
  } else if (input.action === 'escalate' && current.status === 'investigating') {
    nextStatus = 'escalated'
  } else if (
    input.action === 'resolve' &&
    (current.status === 'investigating' || current.status === 'escalated')
  ) {
    if (current.severity === 'critical' && input.actor.role !== 'safety-reviewer') {
      return denied(current, input, 'safety-reviewer-required')
    }
    if (current.severity === 'critical' && current.status !== 'escalated') {
      return denied(current, input, 'invalid-state-transition')
    }
    if (!current.investigation) {
      return denied(current, input, 'investigation-required')
    }
    const privacyResolutionMatches =
      current.category === 'privacy-request'
        ? input.resolutionCode === 'deletion-accepted' &&
          current.investigation.finding === 'privacy-request-validated'
        : input.resolutionCode !== 'deletion-accepted' &&
          current.investigation.finding !== 'privacy-request-validated'
    if (
      !privacyResolutionMatches ||
      current.investigation.finding === 'insufficient-evidence'
    ) {
      return denied(current, input, 'resolution-incompatible')
    }
    nextStatus = 'resolved'
  } else if (input.action === 'close' && current.status === 'resolved') {
    nextStatus = 'closed'
  } else {
    return denied(current, input, 'invalid-state-transition')
  }

  const updated: StoredSupportCase = {
    ...current,
    caseVersion: current.caseVersion + 1,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    ...(input.action === 'assign-self' ? { assignedTo: input.actor.id } : {}),
    ...(input.action === 'record-investigation'
      ? {
          investigation: {
            finding: input.finding,
            evidence: [...input.evidence],
            recordedBy: input.actor.id,
            recordedRole: input.actor.role,
            recordedAt: new Date().toISOString(),
          },
        }
      : {}),
    ...(input.action === 'resolve' ? { resolutionCode: input.resolutionCode } : {}),
  }
  const audit = createAudit({
    caseId: updated.caseId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: actionName(input.action),
    decision: 'allowed',
    fromStatus: current.status,
    toStatus: updated.status,
    reasonCode:
      input.action === 'resolve'
        ? input.resolutionCode
        : input.action === 'record-investigation'
          ? input.finding
          : input.action,
    caseVersion: updated.caseVersion,
  })
  const replaced = await supportStore.replaceCase(current.caseVersion, updated, audit)
  if (!replaced) {
    const latest = await supportStore.findCase(input.caseId)
    if (!latest) return { result: 'case-not-found', persistenceMode: supportStore.mode }
    return denied(latest, input, 'case-version-conflict')
  }
  return {
    case: publicCase(updated),
    auditId: audit.auditId,
    result: 'updated',
    persistenceMode: supportStore.mode,
  }
}

export function setSupportStoreForTests(store: SupportStore): void {
  supportStore = store
}

export async function clearSupportState(): Promise<void> {
  await supportStore.clear()
}
