import type {
  ListSafetyTracesOutput,
  SafetyTrace,
} from '@fushi/contracts'

import {
  createFileObservabilityStore,
  createMemoryObservabilityStore,
  getDefaultObservabilityStorePath,
  type ObservabilityStore,
} from './observability-store.js'

const MAX_TRACES = 100
const RETENTION_DAYS = 30
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

let observabilityStore: ObservabilityStore =
  process.env.NODE_ENV === 'test'
    ? createMemoryObservabilityStore()
    : createFileObservabilityStore(
        process.env.FUSHI_OBSERVABILITY_STORE_PATH ?? getDefaultObservabilityStorePath()
      )
let state = observabilityStore.load()

function persist(): void {
  observabilityStore.save(state)
}

function pruneExpired(referenceTime = Date.now()): void {
  const cutoff = referenceTime - RETENTION_MS
  const retained = state.traces.filter(
    (trace) => new Date(trace.timestamp).getTime() >= cutoff
  )
  if (retained.length !== state.traces.length) {
    state = { ...state, traces: retained }
    persist()
  }
}

pruneExpired()

export function recordSafetyTrace(trace: SafetyTrace): void {
  state.traces = [structuredClone(trace), ...state.traces].slice(0, MAX_TRACES)
  pruneExpired()
  persist()
}

export function listSafetyTraces(): ListSafetyTracesOutput {
  pruneExpired()
  const traces = state.traces
  const allowed = traces.filter((trace) => trace.status === 'allowed').length
  const blocked = traces.length - allowed
  const totalDuration = traces.reduce(
    (sum, trace) => sum + trace.durationMs,
    0
  )

  return {
    traces: [...traces],
    summary: {
      total: traces.length,
      allowed,
      blocked,
      averageDurationMs:
        traces.length === 0
          ? 0
          : Number((totalDuration / traces.length).toFixed(2)),
    },
    persistenceMode: observabilityStore.mode,
    retentionDays: RETENTION_DAYS,
    privacyMode: 'summary-only',
  }
}

export function findSafetyTrace(traceId: string): SafetyTrace | undefined {
  pruneExpired()
  const trace = state.traces.find((candidate) => candidate.traceId === traceId)
  return trace ? structuredClone(trace) : undefined
}

export function clearSafetyTraces(): void {
  state = { schemaVersion: 1, traces: [] }
  persist()
}

export function setObservabilityStoreForTests(store: ObservabilityStore): void {
  observabilityStore = store
  state = observabilityStore.load()
  pruneExpired()
}
