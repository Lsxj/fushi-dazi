import {
  SupportCaseAuditRecordSchema,
  SupportCaseSchema,
  type SupportCase,
  type SupportCaseAuditRecord,
} from '@fushi/contracts'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type StoredSupportCase = SupportCase & { trackingToken: string }

export interface SupportPersistedState {
  schemaVersion: 1
  cases: StoredSupportCase[]
  auditRecords: SupportCaseAuditRecord[]
}

export interface SupportStore {
  readonly mode: 'process-memory' | 'local-file'
  load(): SupportPersistedState
  save(state: SupportPersistedState): void
}

export function createInitialSupportState(): SupportPersistedState {
  return { schemaVersion: 1, cases: [], auditRecords: [] }
}

function clone(state: SupportPersistedState): SupportPersistedState {
  return structuredClone(state)
}

export function parseSupportState(value: unknown): SupportPersistedState {
  if (!value || typeof value !== 'object') {
    throw new Error('support store: root must be an object')
  }
  const candidate = value as Record<string, unknown>
  const cases = Array.isArray(candidate.cases)
    ? candidate.cases.map((storedCase) => {
        if (!storedCase || typeof storedCase !== 'object') return null
        const parsed = SupportCaseSchema.safeParse(storedCase)
        const trackingToken = (storedCase as Record<string, unknown>).trackingToken
        if (
          !parsed.success ||
          typeof trackingToken !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trackingToken)
        ) {
          return null
        }
        return { ...parsed.data, trackingToken }
      })
    : []
  const audits = SupportCaseAuditRecordSchema.array().safeParse(candidate.auditRecords)
  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.cases) ||
    cases.some((storedCase) => storedCase === null) ||
    !audits.success
  ) {
    throw new Error('support store: persisted state failed validation')
  }
  return {
    schemaVersion: 1,
    cases: cases as StoredSupportCase[],
    auditRecords: audits.data,
  }
}

export function createMemorySupportStore(
  seed = createInitialSupportState()
): SupportStore {
  let state = clone(seed)
  return {
    mode: 'process-memory',
    load: () => clone(state),
    save: (nextState) => {
      state = clone(nextState)
    },
  }
}

export function createFileSupportStore(filePath: string): SupportStore {
  return {
    mode: 'local-file',
    load: () => {
      try {
        return parseSupportState(JSON.parse(readFileSync(filePath, 'utf8')) as unknown)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return createInitialSupportState()
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

export function getDefaultSupportStorePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'support-state.json')
}
