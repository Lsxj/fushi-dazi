/**
 * Storage key registry.
 *
 * These 7 keys are the only storage keys fushi-ditu reads/writes.
 * The wx-shim asserts on startup that all calls go through this list,
 * so a typo or a new key added in the future fails fast rather than silently
 * returning undefined.
 *
 * Source of truth: grep across utils/ + pages/profile/ for `wx.*StorageSync`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/shim/paths.ts -> ../../data
export const DATA_DIR = path.resolve(__dirname, '../../data')

export const STORAGE_KEYS = [
  'babyProfile',
  'fridge',
  'manualShopList',
  'mealJournal',
  'reactions',
  'customFoods',
  'weeklyPlan',
] as const

export type StorageKey = (typeof STORAGE_KEYS)[number]

export function dataPath(key: StorageKey): string {
  return path.join(DATA_DIR, `${key}.json`)
}