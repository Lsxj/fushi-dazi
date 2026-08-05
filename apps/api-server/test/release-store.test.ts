import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  createFileReleaseStore,
  createMemoryReleaseStore,
  parseReleaseState,
} from '../src/release-store.js'

describe('release persistence stores', () => {
  it('rejects invalid persisted release data', () => {
    expect(() => parseReleaseState(null)).toThrow('root must be an object')
    expect(() => parseReleaseState({ schemaVersion: 2, candidates: [] })).toThrow(
      'failed validation'
    )
    expect(() =>
      parseReleaseState({ schemaVersion: 1, candidates: [{}] })
    ).toThrow('failed validation')
  })

  it('clones memory state and atomically persists an empty local state', () => {
    const memory = createMemoryReleaseStore()
    const first = memory.load()
    first.push({} as never)
    expect(memory.load()).toEqual([])

    const directory = mkdtempSync(join(tmpdir(), 'fushi-release-'))
    const filePath = join(directory, 'release.json')
    const file = createFileReleaseStore(filePath)
    expect(file.load()).toEqual([])
    file.save([])
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      schemaVersion: 1,
      candidates: [],
    })
    expect(file.load()).toEqual([])

    writeFileSync(filePath, '{invalid json', 'utf8')
    expect(() => file.load()).toThrow()
  })
})
