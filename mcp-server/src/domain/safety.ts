/**
 * Domain layer: check_food_safety.
 *
 * Thin orchestration over guardrails.checkFoodsSafety — loads the active
 * BabyProfile via wx-shim (set up before this module is imported) and returns
 * a structured result ready for the MCP tool handler.
 */
import { readJson } from '../shim/storage.js'
import { checkFoodsSafety, type SafetyCheckResult } from './guardrails.js'
import type { BabyProfile } from './fushi-types.js'

export interface CheckFoodSafetyInput {
  foods: string[]
  context?: { introducing?: string }
}

export interface CheckFoodSafetyOutput extends SafetyCheckResult {
  profileSnapshot: {
    babyName: string
    ageMonths: number
    currentStatus: string
  }
}

export function checkFoodSafety(input: CheckFoodSafetyInput): CheckFoodSafetyOutput {
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('check_food_safety: no babyProfile found in store. Run seed first.')
  }
  const result = checkFoodsSafety(input.foods, profile, input.context ?? {})
  return {
    ...result,
    profileSnapshot: {
      babyName: profile.babyName,
      ageMonths: profile.ageMonths ?? 0,
      currentStatus: profile.currentStatus ?? 'unknown',
    },
  }
}