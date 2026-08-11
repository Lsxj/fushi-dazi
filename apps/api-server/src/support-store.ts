import {
  SupportCaseAuditRecordSchema,
  SupportCaseSchema,
  type SupportCase,
  type SupportCaseAuditRecord,
} from '@fushi/contracts'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_CASES = 200
const MAX_AUDIT_RECORDS = 1000
const DEFAULT_COLLECTION = 'support_cases'
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type StoredSupportCase = SupportCase & { trackingTokenHash: string }

export interface SupportPersistedState {
  schemaVersion: 1
  cases: StoredSupportCase[]
  auditRecords: SupportCaseAuditRecord[]
}

export interface SupportStore {
  readonly mode: 'process-memory' | 'local-file' | 'cloudbase'
  createCase(supportCase: StoredSupportCase, audit: SupportCaseAuditRecord): Promise<void>
  findCase(caseId: string): Promise<StoredSupportCase | undefined>
  list(): Promise<SupportPersistedState>
  appendAudit(caseId: string, audit: SupportCaseAuditRecord): Promise<boolean>
  replaceCase(
    expectedCaseVersion: number,
    supportCase: StoredSupportCase,
    audit: SupportCaseAuditRecord
  ): Promise<boolean>
  clear(): Promise<void>
}

export interface CloudBaseSupportStoreOptions {
  envId: string
  collectionName?: string
  accessKey?: string
}

interface CloudResult {
  data: unknown[]
}

interface CloudDocument {
  get(): Promise<CloudResult>
  set(data: Record<string, unknown>): Promise<unknown>
}

interface CloudTransaction {
  collection(name: string): { doc(id: string): CloudDocument }
}

interface CloudQuery {
  limit(value: number): CloudQuery
  get(): Promise<CloudResult>
}

interface CloudCollection extends CloudQuery {
  doc(id: string): CloudDocument
  orderBy(field: string, direction: 'asc' | 'desc'): CloudQuery
}

interface CloudDatabase {
  collection(name: string): CloudCollection
  runTransaction<T>(operation: (transaction: CloudTransaction) => Promise<T>): Promise<T>
}

interface CloudSupportDocument extends StoredSupportCase {
  auditRecords: SupportCaseAuditRecord[]
}

export function hashTrackingToken(trackingToken: string): string {
  return createHash('sha256').update(trackingToken, 'utf8').digest('hex')
}

export function createInitialSupportState(): SupportPersistedState {
  return { schemaVersion: 1, cases: [], auditRecords: [] }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function parseStoredSupportCase(value: unknown): StoredSupportCase | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const parsed = SupportCaseSchema.safeParse(candidate)
  if (!parsed.success) return null

  if (typeof candidate.trackingTokenHash === 'string' && TOKEN_HASH_PATTERN.test(candidate.trackingTokenHash)) {
    return { ...parsed.data, trackingTokenHash: candidate.trackingTokenHash }
  }

  // One-way migration for existing local preview files. The raw token is never
  // written again after the next successful save.
  if (typeof candidate.trackingToken === 'string' && UUID_PATTERN.test(candidate.trackingToken)) {
    return { ...parsed.data, trackingTokenHash: hashTrackingToken(candidate.trackingToken) }
  }
  return null
}

export function parseSupportState(value: unknown): SupportPersistedState {
  if (!value || typeof value !== 'object') {
    throw new Error('support store: root must be an object')
  }
  const candidate = value as Record<string, unknown>
  const cases = Array.isArray(candidate.cases)
    ? candidate.cases.map(parseStoredSupportCase)
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

function createStateStore(
  mode: 'process-memory' | 'local-file',
  load: () => SupportPersistedState,
  save: (state: SupportPersistedState) => void
): SupportStore {
  return {
    mode,
    createCase: async (supportCase, audit) => {
      const state = load()
      state.cases = [clone(supportCase), ...state.cases].slice(0, MAX_CASES)
      state.auditRecords = [clone(audit), ...state.auditRecords].slice(0, MAX_AUDIT_RECORDS)
      save(state)
    },
    findCase: async (caseId) => clone(load().cases.find((item) => item.caseId === caseId)),
    list: async () => clone(load()),
    appendAudit: async (caseId, audit) => {
      const state = load()
      if (!state.cases.some((item) => item.caseId === caseId)) return false
      state.auditRecords = [clone(audit), ...state.auditRecords].slice(0, MAX_AUDIT_RECORDS)
      save(state)
      return true
    },
    replaceCase: async (expectedCaseVersion, supportCase, audit) => {
      const state = load()
      const index = state.cases.findIndex((item) => item.caseId === supportCase.caseId)
      if (index < 0 || state.cases[index].caseVersion !== expectedCaseVersion) return false
      state.cases[index] = clone(supportCase)
      state.auditRecords = [clone(audit), ...state.auditRecords].slice(0, MAX_AUDIT_RECORDS)
      save(state)
      return true
    },
    clear: async () => save(createInitialSupportState()),
  }
}

export function createMemorySupportStore(seed = createInitialSupportState()): SupportStore {
  let state = clone(seed)
  return createStateStore(
    'process-memory',
    () => clone(state),
    (nextState) => {
      state = clone(nextState)
    }
  )
}

export function createFileSupportStore(filePath: string): SupportStore {
  const load = (): SupportPersistedState => {
    try {
      return parseSupportState(JSON.parse(readFileSync(filePath, 'utf8')) as unknown)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return createInitialSupportState()
      }
      throw error
    }
  }
  const save = (state: SupportPersistedState): void => {
    mkdirSync(dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.${process.pid}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(temporaryPath, filePath)
  }
  return createStateStore('local-file', load, save)
}

function parseCloudDocument(value: unknown): CloudSupportDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('support cloud store: document must be an object')
  }
  const candidate = value as Record<string, unknown>
  const supportCase = parseStoredSupportCase(candidate)
  const audits = SupportCaseAuditRecordSchema.array().safeParse(candidate.auditRecords)
  if (!supportCase || !audits.success) {
    throw new Error('support cloud store: document failed validation')
  }
  return { ...supportCase, auditRecords: audits.data }
}

function cloudDocument(supportCase: StoredSupportCase, audits: SupportCaseAuditRecord[]): Record<string, unknown> {
  return {
    ...clone(supportCase),
    auditRecords: clone(audits).slice(0, MAX_AUDIT_RECORDS),
  }
}

export function createCloudBaseSupportStore(
  options: CloudBaseSupportStoreOptions,
  databaseForTests?: unknown
): SupportStore {
  const envId = options.envId.trim()
  const collectionName = options.collectionName?.trim() || DEFAULT_COLLECTION
  const accessKey = options.accessKey?.trim()
  if (!envId) throw new Error('support cloud store: CLOUDBASE_ENV_ID is required')
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(collectionName)) {
    throw new Error('support cloud store: invalid collection name')
  }
  if (!databaseForTests && !accessKey) {
    throw new Error('support cloud store: CLOUDBASE_APIKEY is required')
  }

  let databasePromise = databaseForTests
    ? Promise.resolve(databaseForTests as CloudDatabase)
    : undefined
  const getDatabase = (): Promise<CloudDatabase> => {
    databasePromise ??= import('@cloudbase/js-sdk').then(({ default: cloudbase }) => {
      const app = cloudbase.init({ env: envId, accessKey })
      return app.database() as unknown as CloudDatabase
    })
    return databasePromise
  }

  async function getDocument(document: CloudDocument): Promise<CloudSupportDocument | undefined> {
    const result = await document.get()
    return result.data[0] === undefined ? undefined : parseCloudDocument(result.data[0])
  }

  return {
    mode: 'cloudbase',
    createCase: async (supportCase, audit) => {
      const database = await getDatabase()
      await database
        .collection(collectionName)
        .doc(supportCase.caseId)
        .set(cloudDocument(supportCase, [audit]))
    },
    findCase: async (caseId) => {
      const database = await getDatabase()
      const found = await getDocument(database.collection(collectionName).doc(caseId))
      if (!found) return undefined
      const { auditRecords: _auditRecords, ...supportCase } = found
      return supportCase
    },
    list: async () => {
      const database = await getDatabase()
      const result = await database
        .collection(collectionName)
        .orderBy('createdAt', 'desc')
        .limit(MAX_CASES)
        .get()
      const documents = result.data.map(parseCloudDocument)
      return {
        schemaVersion: 1,
        cases: documents.map(({ auditRecords: _auditRecords, ...supportCase }) => supportCase),
        auditRecords: documents
          .flatMap((document) => document.auditRecords)
          .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
          .slice(0, MAX_AUDIT_RECORDS),
      }
    },
    appendAudit: async (caseId, audit) => {
      const database = await getDatabase()
      return database.runTransaction(async (transaction) => {
        const document = transaction.collection(collectionName).doc(caseId)
        const current = await getDocument(document)
        if (!current) return false
        const { auditRecords, ...supportCase } = current
        await document.set(cloudDocument(supportCase, [audit, ...auditRecords]))
        return true
      })
    },
    replaceCase: async (expectedCaseVersion, supportCase, audit) => {
      const database = await getDatabase()
      return database.runTransaction(async (transaction) => {
        const document = transaction.collection(collectionName).doc(supportCase.caseId)
        const current = await getDocument(document)
        if (!current || current.caseVersion !== expectedCaseVersion) return false
        await document.set(cloudDocument(supportCase, [audit, ...current.auditRecords]))
        return true
      })
    },
    clear: async () => {
      throw new Error('support cloud store: bulk clear is intentionally unavailable')
    },
  }
}

export function getDefaultSupportStorePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'support-state.json')
}
