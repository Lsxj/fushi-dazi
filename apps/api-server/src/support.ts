import type {
  CreateSupportCaseInput,
  CreateSupportCaseOutput,
  ListSupportCasesOutput,
  SupportCase,
  SupportCaseAuditRecord,
  TrackSupportCaseInput,
  TrackSupportCaseOutput,
  UpdateSupportCaseInput,
  UpdateSupportCaseOutput,
} from '@fushi/contracts'
import { randomUUID } from 'node:crypto'

import {
  createFileSupportStore,
  createInitialSupportState,
  createMemorySupportStore,
  getDefaultSupportStorePath,
  type StoredSupportCase,
  type SupportPersistedState,
  type SupportStore,
} from './support-store.js'

const MAX_CASES = 200
const MAX_AUDIT_RECORDS = 1000
const roleByActor = {
  'demo-support-agent': 'support-agent',
  'demo-safety-reviewer': 'safety-reviewer',
} as const

let supportStore: SupportStore =
  process.env.NODE_ENV === 'test'
    ? createMemorySupportStore()
    : createFileSupportStore(
        process.env.FUSHI_SUPPORT_STORE_PATH ?? getDefaultSupportStorePath()
      )
let state = supportStore.load()

function persist(): void {
  supportStore.save(state)
}

function publicCase(storedCase: StoredSupportCase): SupportCase {
  const { trackingToken: _trackingToken, ...supportCase } = storedCase
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
    escalate: 'case-escalated',
    resolve: 'case-resolved',
    close: 'case-closed',
  }[action] as SupportCaseAuditRecord['action']
}

function recordAudit(
  input: Omit<SupportCaseAuditRecord, 'auditId' | 'timestamp' | 'privacyMode'>
): SupportCaseAuditRecord {
  const record: SupportCaseAuditRecord = {
    ...input,
    auditId: randomUUID(),
    timestamp: new Date().toISOString(),
    privacyMode: 'metadata-only',
  }
  state.auditRecords = [record, ...state.auditRecords].slice(0, MAX_AUDIT_RECORDS)
  persist()
  return record
}

export function createSupportCase(input: CreateSupportCaseInput): CreateSupportCaseOutput {
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
    trackingToken,
  }
  state.cases = [supportCase, ...state.cases].slice(0, MAX_CASES)
  const audit = recordAudit({
    caseId: supportCase.caseId,
    actorId: 'anonymous-family',
    actorRole: 'family-reporter',
    action: 'case-created',
    decision: 'allowed',
    toStatus: 'new',
    reasonCode: input.reason,
    caseVersion: 1,
  })
  return {
    case: publicCase(supportCase),
    trackingToken,
    auditId: audit.auditId,
    privacyMode: 'metadata-only',
  }
}

export function trackSupportCase(input: TrackSupportCaseInput): TrackSupportCaseOutput {
  const found = state.cases.find(
    (supportCase) =>
      supportCase.caseId === input.caseId && supportCase.trackingToken === input.trackingToken
  )
  return {
    ...(found ? { case: publicCase(found) } : {}),
    found: Boolean(found),
    privacyMode: 'metadata-only',
  }
}

export function listSupportCases(): ListSupportCasesOutput {
  const cases = state.cases.map(publicCase)
  return {
    cases,
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
    },
    auditRecords: structuredClone(state.auditRecords),
    persistenceMode: supportStore.mode,
    identityMode: 'mock-operator-directory',
    privacyMode: 'metadata-only',
  }
}

function denied(
  supportCase: StoredSupportCase,
  input: UpdateSupportCaseInput,
  result: Exclude<UpdateSupportCaseOutput['result'], 'updated' | 'case-not-found'>
): UpdateSupportCaseOutput {
  const audit = recordAudit({
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
  return {
    case: publicCase(supportCase),
    auditId: audit.auditId,
    result,
    persistenceMode: supportStore.mode,
  }
}

export function updateSupportCase(input: UpdateSupportCaseInput): UpdateSupportCaseOutput {
  const index = state.cases.findIndex((supportCase) => supportCase.caseId === input.caseId)
  if (index < 0) return { result: 'case-not-found', persistenceMode: supportStore.mode }
  const current = state.cases[index]
  if (roleByActor[input.actor.id] !== input.actor.role) {
    return denied(current, input, 'identity-role-mismatch')
  }
  if (current.caseVersion !== input.expectedCaseVersion) {
    return denied(current, input, 'case-version-conflict')
  }

  let nextStatus: SupportCase['status']
  if (input.action === 'assign-self' && current.status === 'new') {
    nextStatus = 'investigating'
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
    ...(input.action === 'resolve' ? { resolutionCode: input.resolutionCode } : {}),
  }
  state.cases = state.cases.map((supportCase, caseIndex) =>
    caseIndex === index ? updated : supportCase
  )
  const audit = recordAudit({
    caseId: updated.caseId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: actionName(input.action),
    decision: 'allowed',
    fromStatus: current.status,
    toStatus: updated.status,
    reasonCode: input.action === 'resolve' ? input.resolutionCode : input.action,
    caseVersion: updated.caseVersion,
  })
  return {
    case: publicCase(updated),
    auditId: audit.auditId,
    result: 'updated',
    persistenceMode: supportStore.mode,
  }
}

export function setSupportStoreForTests(store: SupportStore): void {
  supportStore = store
  state = supportStore.load()
}

export function clearSupportState(): void {
  state = createInitialSupportState()
  persist()
}
