import type {
  AgenticEvaluationOutput,
  CreateReleaseCandidateInput,
  CreateReleaseCandidateOutput,
  ListReleaseCandidatesOutput,
  ReleaseCandidate,
  ReleaseEvidence,
  ReviewReleaseCandidateInput,
  ReviewReleaseCandidateOutput,
  SafetyEvaluationOutput,
} from '@fushi/contracts'
import { randomUUID } from 'node:crypto'

import { evaluateAgenticWorkflow } from '../../../utils/agentEvaluation.js'
import { evaluateSafetyRules } from './evaluation.js'
import {
  createFileReleaseStore,
  createMemoryReleaseStore,
  getDefaultReleaseStorePath,
  type ReleaseStore,
} from './release-store.js'

const MAX_RELEASE_CANDIDATES = 50
let releaseStore: ReleaseStore =
  process.env.NODE_ENV === 'test'
    ? createMemoryReleaseStore()
    : createFileReleaseStore(
        process.env.FUSHI_RELEASE_STORE_PATH ?? getDefaultReleaseStorePath()
      )
let candidates = releaseStore.load()

function persist(): void {
  releaseStore.save(candidates)
}

export function buildReleaseEvidence(
  safety: SafetyEvaluationOutput,
  agentic: AgenticEvaluationOutput
): ReleaseEvidence {
  const gatePassed =
    safety.passRate === 1 &&
    safety.safetyBlockRecall === 1 &&
    agentic.endToEndSuccessRate === 1
  return {
    safetySuiteId: safety.suiteId,
    safetyEvaluatedAt: safety.evaluatedAt,
    safetyPassCount: safety.passCount,
    safetyDatasetSize: safety.datasetSize,
    safetyPassRate: safety.passRate,
    safetyBlockRecall: safety.safetyBlockRecall,
    agenticSuiteId: agentic.suiteId,
    agenticEvaluatedAt: agentic.evaluatedAt,
    agenticPassCount: agentic.passCount,
    agenticDatasetSize: agentic.datasetSize,
    agenticEndToEndSuccessRate: agentic.endToEndSuccessRate,
    agenticProvider: agentic.provider,
    gatePassed,
    decisionSource: 'deterministic-release-policy',
  }
}

export function listReleaseCandidates(): ListReleaseCandidatesOutput {
  return {
    candidates: structuredClone(candidates),
    persistenceMode: releaseStore.mode,
    policy: {
      approvalRequiresSafetyPassRate: 1,
      approvalRequiresSafetyBlockRecall: 1,
      approvalRequiresAgenticSuccessRate: 1,
      automaticDeployment: false,
    },
  }
}

export function createReleaseCandidate(
  input: CreateReleaseCandidateInput,
  evaluations: {
    safety: SafetyEvaluationOutput
    agentic: AgenticEvaluationOutput
  } = {
    safety: evaluateSafetyRules(),
    agentic: evaluateAgenticWorkflow(),
  }
): CreateReleaseCandidateOutput {
  const candidate: ReleaseCandidate = {
    candidateId: randomUUID(),
    version: input.version,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    status: 'awaiting-review',
    evidence: buildReleaseEvidence(evaluations.safety, evaluations.agentic),
  }
  candidates = [candidate, ...candidates].slice(0, MAX_RELEASE_CANDIDATES)
  persist()
  return { candidate: structuredClone(candidate), persistenceMode: releaseStore.mode }
}

export function reviewReleaseCandidate(
  input: ReviewReleaseCandidateInput
): ReviewReleaseCandidateOutput {
  const index = candidates.findIndex((candidate) => candidate.candidateId === input.candidateId)
  if (index < 0) {
    return { result: 'candidate-not-found', persistenceMode: releaseStore.mode }
  }
  const current = candidates[index]
  if (current.status !== 'awaiting-review') {
    return {
      candidate: structuredClone(current),
      result: 'already-reviewed',
      persistenceMode: releaseStore.mode,
    }
  }
  if (input.decision === 'approved' && !current.evidence.gatePassed) {
    return {
      candidate: structuredClone(current),
      result: 'approval-denied-by-gate',
      persistenceMode: releaseStore.mode,
    }
  }
  const reviewed: ReleaseCandidate = {
    ...current,
    status: input.decision,
    review: {
      reviewerId: input.reviewerId,
      decision: input.decision,
      note: input.note,
      evidenceConfirmed: true,
      reviewedAt: new Date().toISOString(),
    },
  }
  candidates = candidates.map((candidate, candidateIndex) =>
    candidateIndex === index ? reviewed : candidate
  )
  persist()
  return {
    candidate: structuredClone(reviewed),
    result: 'review-recorded',
    persistenceMode: releaseStore.mode,
  }
}

export function setReleaseStoreForTests(store: ReleaseStore): void {
  releaseStore = store
  candidates = releaseStore.load()
}

export function clearReleaseState(): void {
  candidates = []
  persist()
}
