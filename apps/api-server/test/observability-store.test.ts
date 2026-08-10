import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createFileObservabilityStore,
  createMemoryObservabilityStore,
  parseObservabilityState,
} from '../src/observability-store.js'

const trace = {
  traceId: '8c3a2010-e3da-4fd0-a7e6-c2e760436ba8',
  timestamp: '2026-08-05T09:00:00.000Z',
  operation: 'safety.check' as const,
  executionMode: 'deterministic' as const,
  provider: 'none' as const,
  decisionSource: 'deterministic-rules' as const,
  status: 'blocked' as const,
  durationMs: 1.2,
  inputSummary: { foodCount: 1, profileStatus: 'normal' as const },
  outputSummary: {
    safe: false,
    passedCount: 0,
    blockedCount: 1,
    warningCount: 0,
    hardBlockCount: 1,
  },
}

describe('observability store', () => {
  it('rejects malformed persisted trace state', () => {
    expect(() => parseObservabilityState(null)).toThrow('root must be an object')
    expect(() => parseObservabilityState({ schemaVersion: 2, traces: [] })).toThrow(
      'failed validation'
    )
    expect(() => parseObservabilityState({ schemaVersion: 1, traces: [{}] })).toThrow(
      'failed validation'
    )
  })

  it('clones in-memory state at the storage boundary', () => {
    const store = createMemoryObservabilityStore({ schemaVersion: 1, traces: [trace] })
    const loaded = store.load()
    loaded.traces.length = 0

    expect(store.load().traces).toHaveLength(1)
  })

  it('atomically persists privacy-safe trace summaries to a private local file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fushi-observability-'))
    const filePath = join(directory, 'state.json')
    const store = createFileObservabilityStore(filePath)

    expect(store.load()).toEqual({ schemaVersion: 1, traces: [] })
    store.save({ schemaVersion: 1, traces: [trace] })

    expect(createFileObservabilityStore(filePath).load().traces).toEqual([trace])
    expect(readFileSync(filePath, 'utf8')).not.toContain('蜂蜜')

    writeFileSync(filePath, '{"schemaVersion":1,"traces":[{}]}')
    expect(() => store.load()).toThrow('failed validation')
  })
})
