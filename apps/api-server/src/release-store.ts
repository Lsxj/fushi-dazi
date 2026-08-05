import {
  ReleaseCandidateSchema,
  type ReleaseCandidate,
} from '@fushi/contracts'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface ReleasePersistedState {
  schemaVersion: 1
  candidates: ReleaseCandidate[]
}

export interface ReleaseStore {
  readonly mode: 'process-memory' | 'local-file'
  load(): ReleaseCandidate[]
  save(candidates: ReleaseCandidate[]): void
}

function clone(candidates: ReleaseCandidate[]): ReleaseCandidate[] {
  return structuredClone(candidates)
}

export function parseReleaseState(value: unknown): ReleasePersistedState {
  if (!value || typeof value !== 'object') {
    throw new Error('release store: root must be an object')
  }
  const candidate = value as Record<string, unknown>
  const candidates = ReleaseCandidateSchema.array().safeParse(candidate.candidates)
  if (candidate.schemaVersion !== 1 || !candidates.success) {
    throw new Error('release store: persisted state failed validation')
  }
  return { schemaVersion: 1, candidates: candidates.data }
}

export function createMemoryReleaseStore(seed: ReleaseCandidate[] = []): ReleaseStore {
  let candidates = clone(seed)
  return {
    mode: 'process-memory',
    load: () => clone(candidates),
    save: (nextCandidates) => {
      candidates = clone(nextCandidates)
    },
  }
}

export function createFileReleaseStore(filePath: string): ReleaseStore {
  return {
    mode: 'local-file',
    load: () => {
      try {
        return parseReleaseState(JSON.parse(readFileSync(filePath, 'utf8')) as unknown).candidates
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return []
        }
        throw error
      }
    },
    save: (candidates) => {
      mkdirSync(dirname(filePath), { recursive: true })
      const temporaryPath = `${filePath}.${process.pid}.tmp`
      const state: ReleasePersistedState = { schemaVersion: 1, candidates }
      writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      renameSync(temporaryPath, filePath)
    },
  }
}

export function getDefaultReleaseStorePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'release-state.json')
}
