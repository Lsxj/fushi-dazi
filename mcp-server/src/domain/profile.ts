/**
 * Domain layer: read_baby_profile.
 *
 * Aggregates BabyProfile + derived trying state + next-recommendation list
 * into a single MCP-ready snapshot. Used by resources (`fushi://profile`) and
 * the read_baby_profile tool.
 */
import { readJson } from '../shim/storage.js'
import {
  calcAgeMonths,
  getTryingProgress,
  getTryingScheduledStart,
  checkTryingComplete,
  getNextRecommendation,
} from '../../../utils/planner.js'
import type { BabyProfile, NextRecommendation } from './fushi-types.js'

export interface ReadBabyProfileOutput {
  profile: BabyProfile
  ageMonths: number
  tryingProgress: {
    food: string
    categoryId: string
    dayIndex: number
    daysRequired: number
    startDate: string
  } | null
  tryingScheduledStart: {
    food: string
    categoryId: string
    startDate: string
  } | null
  tryingComplete: { categoryId: string; food: string } | null
  nextRecommendations: NextRecommendation[]
}

export function readBabyProfile(): ReadBabyProfileOutput {
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('read_baby_profile: no babyProfile found in store. Run seed first.')
  }

  const ageMonths =
    profile.ageMonths ?? (profile.birthday ? calcAgeMonths(profile.birthday) : 0)

  return {
    profile,
    ageMonths,
    tryingProgress: getTryingProgress(profile),
    tryingScheduledStart: getTryingScheduledStart(profile),
    tryingComplete: checkTryingComplete(profile),
    nextRecommendations: getNextRecommendation(profile),
  }
}