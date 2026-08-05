import {
  AllergyChangeRequestSchema,
  HouseholdAuditRecordSchema,
  type AllergyChangeRequest,
  type HouseholdAuditRecord,
  type HouseholdStateOutput,
} from '@fushi/contracts'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CollaborationPersistedState {
  schemaVersion: 1
  profileVersion: number
  foodState: HouseholdStateOutput['foodStates'][number]
  changeRequests: AllergyChangeRequest[]
  auditRecords: HouseholdAuditRecord[]
  knownReactionIds: string[]
}

export interface CollaborationStore {
  readonly mode: 'process-memory' | 'local-file'
  load(): CollaborationPersistedState
  save(state: CollaborationPersistedState): void
}

export function createInitialCollaborationState(): CollaborationPersistedState {
  return {
    schemaVersion: 1,
    profileVersion: 1,
    foodState: {
      food: '鳕鱼',
      state: 'confirmed',
    },
    changeRequests: [],
    auditRecords: [],
    knownReactionIds: ['reaction-demo-001'],
  }
}

function cloneState(
  state: CollaborationPersistedState
): CollaborationPersistedState {
  return structuredClone(state)
}

function parseFoodState(
  value: unknown
): HouseholdStateOutput['foodStates'][number] {
  if (!value || typeof value !== 'object') {
    throw new Error('collaboration store: foodState must be an object')
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.food !== 'string' ||
    (candidate.state !== 'confirmed' && candidate.state !== 'allergic') ||
    (candidate.changedAt !== undefined &&
      (typeof candidate.changedAt !== 'string' ||
        Number.isNaN(Date.parse(candidate.changedAt))))
  ) {
    throw new Error('collaboration store: invalid foodState')
  }
  return {
    food: candidate.food,
    state: candidate.state,
    ...(typeof candidate.changedAt === 'string'
      ? { changedAt: candidate.changedAt }
      : {}),
  }
}

export function parseCollaborationState(
  value: unknown
): CollaborationPersistedState {
  if (!value || typeof value !== 'object') {
    throw new Error('collaboration store: root must be an object')
  }
  const candidate = value as Record<string, unknown>
  const requests = AllergyChangeRequestSchema.array().safeParse(
    candidate.changeRequests
  )
  const audits = HouseholdAuditRecordSchema.array().safeParse(
    candidate.auditRecords
  )
  const knownReactionIds = Array.isArray(candidate.knownReactionIds)
    ? candidate.knownReactionIds.filter(
        (reactionId): reactionId is string =>
          typeof reactionId === 'string' && reactionId.length > 0
      )
    : []

  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.profileVersion !== 'number' ||
    !Number.isInteger(candidate.profileVersion) ||
    candidate.profileVersion < 1 ||
    !requests.success ||
    !audits.success ||
    knownReactionIds.length !==
      (Array.isArray(candidate.knownReactionIds)
        ? candidate.knownReactionIds.length
        : -1)
  ) {
    throw new Error('collaboration store: persisted state failed validation')
  }

  return {
    schemaVersion: 1,
    profileVersion: candidate.profileVersion,
    foodState: parseFoodState(candidate.foodState),
    changeRequests: requests.data,
    auditRecords: audits.data,
    knownReactionIds,
  }
}

export function createMemoryCollaborationStore(
  seed = createInitialCollaborationState()
): CollaborationStore {
  let state = cloneState(seed)
  return {
    mode: 'process-memory',
    load: () => cloneState(state),
    save: (nextState) => {
      state = cloneState(nextState)
    },
  }
}

export function createFileCollaborationStore(
  filePath: string
): CollaborationStore {
  return {
    mode: 'local-file',
    load: () => {
      try {
        return parseCollaborationState(
          JSON.parse(readFileSync(filePath, 'utf8')) as unknown
        )
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return createInitialCollaborationState()
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

export function getDefaultCollaborationStorePath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '.data',
    'collaboration-state.json'
  )
}
