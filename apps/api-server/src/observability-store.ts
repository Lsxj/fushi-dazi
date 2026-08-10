import { SafetyTraceSchema, type SafetyTrace } from '@fushi/contracts'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ObservabilityPersistedState {
  schemaVersion: 1
  traces: SafetyTrace[]
}

export interface ObservabilityStore {
  readonly mode: 'process-memory' | 'local-file'
  load(): ObservabilityPersistedState
  save(state: ObservabilityPersistedState): void
}

export function createInitialObservabilityState(): ObservabilityPersistedState {
  return { schemaVersion: 1, traces: [] }
}

function clone(state: ObservabilityPersistedState): ObservabilityPersistedState {
  return structuredClone(state)
}

export function parseObservabilityState(value: unknown): ObservabilityPersistedState {
  if (!value || typeof value !== 'object') {
    throw new Error('observability store: root must be an object')
  }
  const candidate = value as Record<string, unknown>
  const traces = SafetyTraceSchema.array().safeParse(candidate.traces)
  if (candidate.schemaVersion !== 1 || !traces.success) {
    throw new Error('observability store: persisted state failed validation')
  }
  return { schemaVersion: 1, traces: traces.data }
}

export function createMemoryObservabilityStore(
  seed = createInitialObservabilityState()
): ObservabilityStore {
  let state = clone(seed)
  return {
    mode: 'process-memory',
    load: () => clone(state),
    save: (nextState) => {
      state = clone(nextState)
    },
  }
}

export function createFileObservabilityStore(filePath: string): ObservabilityStore {
  return {
    mode: 'local-file',
    load: () => {
      try {
        return parseObservabilityState(JSON.parse(readFileSync(filePath, 'utf8')) as unknown)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return createInitialObservabilityState()
        }
        throw error
      }
    },
    save: (state) => {
      mkdirSync(dirname(filePath), { recursive: true })
      const temporaryPath = `${filePath}.${process.pid}.tmp`
      writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      renameSync(temporaryPath, filePath)
    },
  }
}

export function getDefaultObservabilityStorePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'observability-state.json')
}
