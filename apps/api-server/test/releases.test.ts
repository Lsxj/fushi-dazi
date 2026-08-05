import { beforeEach, describe, expect, it } from 'vitest'

import { evaluateAgenticWorkflow } from '../../../utils/agentEvaluation.js'
import { evaluateSafetyRules } from '../src/evaluation.js'
import { createMemoryReleaseStore } from '../src/release-store.js'
import {
  createReleaseCandidate,
  listReleaseCandidates,
  reviewReleaseCandidate,
  setReleaseStoreForTests,
} from '../src/releases.js'

describe('release candidate review workflow', () => {
  beforeEach(() => {
    setReleaseStoreForTests(createMemoryReleaseStore())
  })

  it('refuses approval when deterministic safety evidence fails', () => {
    const safety = evaluateSafetyRules()
    const created = createReleaseCandidate(
      { version: '1.2.0', createdBy: 'product-operator' },
      {
        safety: { ...safety, passCount: safety.passCount - 1, passRate: 0.75 },
        agentic: evaluateAgenticWorkflow(),
      }
    )

    const result = reviewReleaseCandidate({
      candidateId: created.candidate.candidateId,
      reviewerId: 'safety-reviewer',
      decision: 'approved',
      note: '已检查全部自动化证据',
      evidenceConfirmed: true,
    })

    expect(result.result).toBe('approval-denied-by-gate')
    expect(result.candidate?.status).toBe('awaiting-review')
    expect(listReleaseCandidates().candidates[0].review).toBeUndefined()
  })

  it('reports missing and already-reviewed candidates without overwriting audit evidence', () => {
    const missing = reviewReleaseCandidate({
      candidateId: '6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c',
      reviewerId: 'safety-reviewer',
      decision: 'blocked',
      note: '候选版本不存在',
      evidenceConfirmed: true,
    })
    const created = createReleaseCandidate({
      version: '1.2.0-rc.1',
      createdBy: 'product-operator',
    })
    const first = reviewReleaseCandidate({
      candidateId: created.candidate.candidateId,
      reviewerId: 'safety-reviewer',
      decision: 'blocked',
      note: '等待真机 provider 验证',
      evidenceConfirmed: true,
    })
    const replay = reviewReleaseCandidate({
      candidateId: created.candidate.candidateId,
      reviewerId: 'another-reviewer',
      decision: 'approved',
      note: '尝试覆盖原审核结论',
      evidenceConfirmed: true,
    })

    expect(missing.result).toBe('candidate-not-found')
    expect(first.result).toBe('review-recorded')
    expect(replay.result).toBe('already-reviewed')
    expect(replay.candidate?.review?.reviewerId).toBe('safety-reviewer')
  })

  it('captures evaluation evidence and records a human approval without deploying', () => {
    const created = createReleaseCandidate({
      version: '1.2.0',
      createdBy: 'product-operator',
    })
    const reviewed = reviewReleaseCandidate({
      candidateId: created.candidate.candidateId,
      reviewerId: 'safety-reviewer',
      decision: 'approved',
      note: '安全与工作流回归通过，批准进入人工发布步骤',
      evidenceConfirmed: true,
    })
    const list = listReleaseCandidates()

    expect(created.candidate.evidence).toMatchObject({
      gatePassed: true,
      decisionSource: 'deterministic-release-policy',
      agenticProvider: 'mock-policy',
    })
    expect(reviewed).toMatchObject({
      result: 'review-recorded',
      candidate: { status: 'approved' },
    })
    expect(list.policy.automaticDeployment).toBe(false)
    expect(list.candidates).toHaveLength(1)
  })
})
