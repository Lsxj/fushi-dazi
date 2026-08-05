import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createFileSupportStore,
  createMemorySupportStore,
  parseSupportState,
} from '../src/support-store.js'

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

  it('clones memory state and atomically persists local state', () => {
    const memory = createMemorySupportStore()
    const changed = memory.load()
    changed.cases.push({} as never)
    expect(memory.load().cases).toEqual([])

    const directory = mkdtempSync(join(tmpdir(), 'fushi-support-'))
    const filePath = join(directory, 'support.json')
    const file = createFileSupportStore(filePath)
    expect(file.load().cases).toEqual([])
    file.save({ schemaVersion: 1, cases: [], auditRecords: [] })
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      schemaVersion: 1,
      cases: [],
      auditRecords: [],
    })
    expect(file.load().auditRecords).toEqual([])

    writeFileSync(filePath, '{invalid', 'utf8')
    expect(() => file.load()).toThrow()
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
    ).toMatchObject({ reason: 'inventory-not-updated' })
  })
})
