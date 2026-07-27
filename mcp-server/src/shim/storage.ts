/**
 * Typed JSON-file storage helpers used by wx-shim.
 *
 * Each storage key maps to one JSON file under DATA_DIR.
 * Reads return undefined for missing files; writes are synchronous (atomic enough for demo).
 */
import fs from 'node:fs'
import { DATA_DIR, dataPath, type StorageKey } from './paths.js'

export function readJson<T>(key: StorageKey): T | undefined {
  const file = dataPath(key)
  if (!fs.existsSync(file)) return undefined
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    if (!raw.trim()) return undefined
    return JSON.parse(raw) as T
  } catch (err) {
    throw new Error(`storage[${key}] parse failed: ${(err as Error).message}`)
  }
}

export function writeJson<T>(key: StorageKey, value: T): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(dataPath(key), JSON.stringify(value, null, 2), 'utf-8')
}

export function removeJson(key: StorageKey): void {
  const file = dataPath(key)
  if (fs.existsSync(file)) fs.unlinkSync(file)
}

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}