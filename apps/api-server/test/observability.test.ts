import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryObservabilityStore } from '../src/observability-store.js'
import {
  listSafetyTraces,
  recordSafetyTrace,
  setObservabilityStoreForTests,
} from '../src/observability.js'

function trace(timestamp: string, traceId: string) {
  return {
    traceId,
    timestamp,
    operation: 'safety.check' as const,
    executionMode: 'deterministic' as const,
    provider: 'none' as const,
    decisionSource: 'deterministic-rules' as const,
    status: 'blocked' as const,
    durationMs: 1,
    inputSummary: { foodCount: 1, profileStatus: 'normal' as const },
    outputSummary: {
      safe: false,
      passedCount: 0,
      blockedCount: 1,
      warningCount: 0,
      hardBlockCount: 1,
    },
  }
}

describe('persisted privacy-safe observability', () => {
  beforeEach(() => setObservabilityStoreForTests(createMemoryObservabilityStore()))

  it('removes summaries older than 30 days when loading persisted state', () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const store = createMemoryObservabilityStore({
      schemaVersion: 1,
      traces: [
        trace(expired, '2ec4233f-cd53-4076-9647-4a64f70eb06c'),
        trace(recent, '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8'),
      ],
    })

    setObservabilityStoreForTests(store)

    expect(listSafetyTraces()).toMatchObject({
      persistenceMode: 'process-memory',
      retentionDays: 30,
      summary: { total: 1, blocked: 1 },
      traces: [{ traceId: '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8' }],
    })
  })

  it('restores a recorded summary after the observability service reloads', () => {
    const store = createMemoryObservabilityStore()
    setObservabilityStoreForTests(store)
    recordSafetyTrace(
      trace(new Date().toISOString(), '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8')
    )

    setObservabilityStoreForTests(store)

    expect(listSafetyTraces().traces).toHaveLength(1)
  })
})
