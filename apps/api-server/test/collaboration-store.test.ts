import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createFileCollaborationStore,
  createInitialCollaborationState,
  createMemoryCollaborationStore,
  parseCollaborationState,
} from '../src/collaboration-store.js'

describe('collaboration persistence stores', () => {
  it('keeps memory snapshots isolated from caller mutation', () => {
    const store = createMemoryCollaborationStore()
    const loaded = store.load()
    loaded.profileVersion = 99

    expect(store.load().profileVersion).toBe(1)
  })

  it('atomically saves and restores validated state from a local file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fushi-store-'))
    const filePath = join(directory, 'collaboration.json')
    const store = createFileCollaborationStore(filePath)
    const state = createInitialCollaborationState()
    state.profileVersion = 2
    state.foodState = {
      food: '鳕鱼',
      state: 'allergic',
      changedAt: '2026-08-05T01:00:00.000Z',
    }

    expect(store.load()).toEqual(createInitialCollaborationState())
    store.save(state)

    expect(createFileCollaborationStore(filePath).load()).toEqual(state)
  })

  it('fails closed for corrupted or schema-incompatible files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fushi-store-invalid-'))
    const filePath = join(directory, 'collaboration.json')
    writeFileSync(filePath, '{"schemaVersion":2}', 'utf8')

    expect(() => createFileCollaborationStore(filePath).load()).toThrow(
      'persisted state failed validation'
    )
    expect(() => parseCollaborationState(null)).toThrow(
      'root must be an object'
    )
    expect(() =>
      parseCollaborationState({
        ...createInitialCollaborationState(),
        foodState: { food: '鳕鱼', state: 'unknown' },
      })
    ).toThrow('invalid foodState')
  })
})
