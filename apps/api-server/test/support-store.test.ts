import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  createCloudBaseSupportStore,
  createFileSupportStore,
  createMemorySupportStore,
  hashTrackingToken,
  parseSupportState,
  withManagedCloudBaseCredentials,
  type StoredSupportCase,
} from '../src/support-store.js'
import type { SupportCaseAuditRecord } from '@fushi/contracts'

function createFakeCloudDatabase(seed: Record<string, Record<string, unknown>> = {}) {
  const documents = new Map(Object.entries(seed))
  let resultLimit = Number.POSITIVE_INFINITY
  const doc = (id: string) => ({
    get: async () => ({ data: documents.has(id) ? [structuredClone(documents.get(id))] : [] }),
    set: async (data: Record<string, unknown>) => {
      documents.set(id, structuredClone(data))
      return {}
    },
  })
  const query = {
    limit: (value: number) => {
      resultLimit = value
      return query
    },
    get: async () => ({
      data: [...documents.values()]
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .slice(0, resultLimit)
        .map((value) => structuredClone(value)),
    }),
  }
  const collection = () => ({
    ...query,
    doc,
    orderBy: () => query,
  })
  return {
    documents,
    database: {
      collection,
      runTransaction: async <T>(operation: (transaction: { collection: typeof collection }) => Promise<T>) =>
        operation({ collection }),
    },
  }
}

const storedCase: StoredSupportCase = {
  caseId: '4c7eca4d-8b6a-4c62-a3b1-b55cff36072b',
  caseVersion: 1,
  category: 'data-problem',
  reason: 'inventory-not-updated',
  severity: 'medium',
  status: 'new',
  source: 'mini-program',
  context: {
    clientVersion: '1.0.4',
    occurredAt: '2026-08-05T09:00:00.000Z',
  },
  createdAt: '2026-08-05T09:00:00.000Z',
  updatedAt: '2026-08-05T09:00:00.000Z',
  trackingTokenHash: hashTrackingToken('6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c'),
}

const createdAudit: SupportCaseAuditRecord = {
  auditId: '3b6985f7-f140-46ea-b050-dcb51b98c943',
  caseId: storedCase.caseId,
  actorId: 'anonymous-family',
  actorRole: 'family-reporter',
  action: 'case-created',
  decision: 'allowed',
  toStatus: 'new',
  reasonCode: 'inventory-not-updated',
  caseVersion: 1,
  timestamp: '2026-08-05T09:00:00.000Z',
  privacyMode: 'metadata-only',
}

describe('support persistence stores', () => {
  it('rejects malformed persisted support data', () => {
    expect(() => parseSupportState(null)).toThrow('root must be an object')
    expect(() => parseSupportState({ schemaVersion: 2, cases: [], auditRecords: [] })).toThrow(
      'failed validation'
    )
    expect(() => parseSupportState({ schemaVersion: 1, auditRecords: [] })).toThrow(
      'failed validation'
    )
    expect(() =>
      parseSupportState({ schemaVersion: 1, cases: [null], auditRecords: [] })
    ).toThrow('failed validation')
    expect(() =>
      parseSupportState({ schemaVersion: 1, cases: [{}], auditRecords: [] })
    ).toThrow('failed validation')
    expect(() =>
      parseSupportState({ schemaVersion: 1, cases: [], auditRecords: [{}] })
    ).toThrow('failed validation')
  })

  it('clones memory state and atomically persists local state', async () => {
    const memory = createMemorySupportStore()
    const changed = await memory.list()
    changed.cases.push({} as never)
    expect((await memory.list()).cases).toEqual([])

    const directory = mkdtempSync(join(tmpdir(), 'fushi-support-'))
    const filePath = join(directory, 'support.json')
    const file = createFileSupportStore(filePath)
    expect((await file.list()).cases).toEqual([])
    await file.clear()
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      schemaVersion: 1,
      cases: [],
      auditRecords: [],
    })
    expect((await file.list()).auditRecords).toEqual([])

    writeFileSync(filePath, '{invalid', 'utf8')
    await expect(file.list()).rejects.toThrow()
  })

  it('parses a valid case only when its secret tracking token is present', () => {
    const supportCase = {
      caseId: '4c7eca4d-8b6a-4c62-a3b1-b55cff36072b',
      caseVersion: 1,
      category: 'data-problem',
      reason: 'inventory-not-updated',
      severity: 'medium',
      status: 'new',
      source: 'mini-program',
      context: {
        clientVersion: '1.0.4',
        occurredAt: '2026-08-05T09:00:00.000Z',
      },
      createdAt: '2026-08-05T09:00:00.000Z',
      updatedAt: '2026-08-05T09:00:00.000Z',
    }
    expect(() =>
      parseSupportState({
        schemaVersion: 1,
        cases: [{ ...supportCase, trackingToken: 'not-a-token' }],
        auditRecords: [],
      })
    ).toThrow('failed validation')
    expect(
      parseSupportState({
        schemaVersion: 1,
        cases: [
          {
            ...supportCase,
            trackingToken: '6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c',
          },
        ],
        auditRecords: [],
      }).cases[0]
    ).toMatchObject({
      reason: 'inventory-not-updated',
      trackingTokenHash: hashTrackingToken('6e991b3e-1c0d-4c2d-b188-2cd6f431ae6c'),
    })
    expect(
      parseSupportState({
        schemaVersion: 1,
        cases: [storedCase],
        auditRecords: [],
      }).cases[0]
    ).toEqual(storedCase)
  })

  it('persists a cloud case and its audit atomically without the raw tracking token', async () => {
    const fake = createFakeCloudDatabase()
    const store = createCloudBaseSupportStore(
      { envId: 'cloud-test', collectionName: 'support_cases_test' },
      fake.database
    )

    await store.createCase(storedCase, createdAudit)
    expect(await store.findCase(storedCase.caseId)).toEqual(storedCase)
    expect(fake.documents.get(storedCase.caseId)).not.toHaveProperty('trackingToken')

    const deniedAudit: SupportCaseAuditRecord = {
      ...createdAudit,
      auditId: 'c0351364-62e5-4d30-8bf4-364ea1b858a9',
      action: 'case-closed',
      decision: 'denied',
      reasonCode: 'invalid-state-transition',
      timestamp: '2026-08-05T09:01:00.000Z',
    }
    expect(await store.appendAudit('eb4795e8-46c8-43db-9355-cfeb52608512', deniedAudit)).toBe(false)
    expect(await store.appendAudit(storedCase.caseId, deniedAudit)).toBe(true)

    const updatedCase: StoredSupportCase = {
      ...storedCase,
      caseVersion: 2,
      status: 'investigating',
      assignedTo: 'demo-support-agent',
      updatedAt: '2026-08-05T09:02:00.000Z',
    }
    const updateAudit: SupportCaseAuditRecord = {
      ...createdAudit,
      auditId: '7b9a6d14-3810-4b30-9a17-91d225a43ca6',
      actorId: 'demo-support-agent',
      actorRole: 'support-agent',
      action: 'case-assigned',
      fromStatus: 'new',
      toStatus: 'investigating',
      reasonCode: 'assign-self',
      caseVersion: 2,
      timestamp: '2026-08-05T09:02:00.000Z',
    }
    expect(await store.replaceCase(9, updatedCase, updateAudit)).toBe(false)
    expect(await store.replaceCase(1, updatedCase, updateAudit)).toBe(true)

    expect(await store.findCase('eb4795e8-46c8-43db-9355-cfeb52608512')).toBeUndefined()
    expect(await store.list()).toMatchObject({
      cases: [{ caseVersion: 2, status: 'investigating' }],
      auditRecords: [
        { auditId: updateAudit.auditId },
        { auditId: deniedAudit.auditId },
        { auditId: createdAudit.auditId },
      ],
    })
    await expect(store.clear()).rejects.toThrow('intentionally unavailable')
  })

  it('fails closed for invalid CloudBase configuration and malformed documents', async () => {
    expect(() => createCloudBaseSupportStore({ envId: '' }, {})).toThrow(
      'CLOUDBASE_ENV_ID is required'
    )
    expect(() =>
      createCloudBaseSupportStore({ envId: 'cloud-test', collectionName: 'not valid' }, {})
    ).toThrow('invalid collection name')
    expect(createCloudBaseSupportStore({ envId: 'cloud-test' }).mode).toBe('cloudbase')

    const fake = createFakeCloudDatabase({
      [storedCase.caseId]: { ...storedCase, auditRecords: [{}] },
    })
    const store = createCloudBaseSupportStore({ envId: 'cloud-test' }, fake.database)
    await expect(store.findCase(storedCase.caseId)).rejects.toThrow('document failed validation')
  })

  it('masks a configured API key only while managed credentials initialize', () => {
    const previousApiKey = process.env.CLOUDBASE_APIKEY
    process.env.CLOUDBASE_APIKEY = 'configured-server-key'
    try {
      expect(withManagedCloudBaseCredentials(() => process.env.CLOUDBASE_APIKEY)).toBeUndefined()
      expect(process.env.CLOUDBASE_APIKEY).toBe('configured-server-key')
      expect(() =>
        withManagedCloudBaseCredentials(() => {
          throw new Error('initialization failed')
        })
      ).toThrow('initialization failed')
      expect(process.env.CLOUDBASE_APIKEY).toBe('configured-server-key')
    } finally {
      if (previousApiKey === undefined) delete process.env.CLOUDBASE_APIKEY
      else process.env.CLOUDBASE_APIKEY = previousApiKey
    }
  })

  it('logs only a bounded provider error summary when a cloud list fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const createFailingDatabase = (error: unknown) => {
      const query = {
        limit: () => query,
        get: async () => { throw error },
      }
      return {
        collection: () => ({ orderBy: () => query }),
      }
    }
    const providerError = Object.assign(new Error('collection does not exist'), {
      code: 'DATABASE_COLLECTION_NOT_EXIST',
    })

    try {
      const providerStore = createCloudBaseSupportStore(
        { envId: 'cloud-test' },
        createFailingDatabase(providerError)
      )
      await expect(providerStore.list()).rejects.toBe(providerError)
      expect(consoleError).toHaveBeenLastCalledWith(
        '[support-store] CloudBase operation failed',
        {
          operation: 'list',
          name: 'Error',
          code: 'DATABASE_COLLECTION_NOT_EXIST',
          message: 'collection does not exist',
        }
      )

      const unknownStore = createCloudBaseSupportStore(
        { envId: 'cloud-test' },
        createFailingDatabase('provider unavailable')
      )
      await expect(unknownStore.list()).rejects.toBe('provider unavailable')
      expect(consoleError).toHaveBeenLastCalledWith(
        '[support-store] CloudBase operation failed',
        {
          operation: 'list',
          name: 'Error',
          code: 'UNKNOWN',
          message: 'CloudBase request failed',
        }
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})
