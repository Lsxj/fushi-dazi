/**
 * Domain layer: profile mutation tools (Day 5).
 *
 * These are the WRITE tools. Each one mutates babyProfile.json. They carry
 * the highest risk in the system — especially mark_food_allergic, which is
 * one-way: the food is filtered out of all future plans until the parent
 * manually reverts. Every
 * irreversible action has at least two layers:
 *
 *   1. **Schema-level**: zod makes consent flags `z.literal(true)`, so
 *      client can't pass false or omit it. LLM has to extract explicit
 *      "I confirm" from the user.
 *   2. **Domain-level**: reactionId is required (or strongly recommended)
 *      for any state mutation that should be auditable to a record_reaction
 *      event. Random "the LLM decided to mark this" calls get rejected.
 *
 * Other tools (start_trying_food, complete_trying_food, abort_trying_food)
 * have state-machine guards inside their domain wrappers — e.g. can't
 * start a new trying while one is active, can't complete before dayIndex
 * reaches daysRequired.
 */
import { readJson, writeJson } from '../shim/storage.js'
import {
  getCurrentTryingCategoryId,
  getTryingProgress,
  getTryingScheduledStart,
  checkTryingComplete,
  startTryingForFood,
  completeTrying,
  abortTrying,
  getNextRecommendation,
  calcAgeMonths,
  hasActiveGutReaction,
} from '../../../utils/planner.js'
import {
  markAllergic as fushiMarkAllergic,
  enterObservation as fushiEnterObservation,
  startIntroducing as fushiStartIntroducing,
} from '../../../utils/observation.js'
// observation.js has no .d.ts — cast the values to their declared signatures
// so callers in this file get parameter checking. Source of truth:
// /Users/x7/fushi-ditu/utils/observation.ts.
const _fushiMarkAllergic = fushiMarkAllergic as (
  profile: BabyProfile,
  foodName: string,
  reactionId: string,
  note?: string
) => BabyProfile
const _fushiEnterObservation = fushiEnterObservation as (
  profile: BabyProfile,
  foodName: string,
  reactionId: string,
  note?: string,
  daysOverride?: number
) => BabyProfile
const _fushiStartIntroducing = fushiStartIntroducing as (
  profile: BabyProfile,
  foodName: string
) => BabyProfile
import { checkFoodsSafety } from './guardrails.js'
import { getJournal } from '../../../utils/journal.js'
import { getReactions } from '../../../utils/reactions.js'
import type { BabyProfile, NextRecommendation } from './fushi-types.js'

function loadProfile(): BabyProfile {
  const profile = readJson<BabyProfile>('babyProfile')
  if (!profile) {
    throw new Error('profile mutation: no babyProfile found in store. Run seed first.')
  }
  return profile
}

function saveProfile(profile: BabyProfile): void {
  writeJson('babyProfile', profile)
}

// ---- start_trying_food ----

export interface StartTryingFoodInput {
  categoryId: string
  food: string
  daysRequired?: number
  hasUnloggedToday?: boolean
}

export interface StartTryingFoodOutput {
  categoryId: string
  food: string
  daysRequired: number
  startDate: string
  isInCategoryAdd: boolean
  schedule: 'today' | 'tomorrow'
}

export function startTryingFood(input: StartTryingFoodInput): StartTryingFoodOutput {
  if (!input.categoryId || !input.food) {
    throw new Error('start_trying_food: categoryId and food are required')
  }
  const profile = loadProfile()

  // Guard: cannot start a new trying while one is in flight
  if (getCurrentTryingCategoryId(profile)) {
    throw new Error(
      `start_trying_food: there is already a trying in progress for category "${getCurrentTryingCategoryId(profile)}". ` +
        `Complete or abort it first.`
    )
  }

  // Guard: status gates
  if (profile.currentStatus === 'postVaccine') {
    throw new Error('start_trying_food: blocked — baby is in post-vaccine cooldown, wait until it ends.')
  }
  if (hasActiveGutReaction()) {
    throw new Error('start_trying_food: blocked — active gut reaction in the last 72h, resolve it first.')
  }

  // hasUnloggedToday default: check the journal for today's log of this food
  const hasUnlogged =
    input.hasUnloggedToday ??
    getJournal().some(
      (l) => l.date === new Date().toISOString().slice(0, 10) && l.ingredients.includes(input.food)
    )

  const result = startTryingForFood(profile, input.categoryId, input.food, hasUnlogged, input.daysRequired)
  if (!result) {
    // fushi-ditu returns null when there's already a trying — race condition
    // (we already checked above, but the planner re-checks).
    throw new Error('start_trying_food: planner refused — a trying may have just started')
  }
  saveProfile(result.profile)
  return {
    categoryId: input.categoryId,
    food: input.food,
    daysRequired: result.daysRequired,
    startDate: result.startDate,
    isInCategoryAdd: result.isInCategoryAdd,
    schedule: hasUnlogged ? 'today' : 'tomorrow',
  }
}

// ---- complete_trying_food ----

export interface CompleteTryingFoodInput {
  categoryId: string
}

export interface CompleteTryingFoodOutput {
  categoryId: string
  food: string
  dayIndex: number
  daysRequired: number
  promotedFood: string
  isInCategoryAdd: boolean
}

export function completeTryingFood(input: CompleteTryingFoodInput): CompleteTryingFoodOutput {
  if (!input.categoryId) {
    throw new Error('complete_trying_food: categoryId is required')
  }
  const profile = loadProfile()
  const cat = profile.categoryAllergies[input.categoryId]
  if (!cat || cat.state !== 'trying') {
    throw new Error(`complete_trying_food: category "${input.categoryId}" is not in trying state`)
  }
  const progress = getTryingProgress(profile)
  if (!progress) {
    throw new Error('complete_trying_food: no progress found (state may have just changed)')
  }
  // Guard: too early
  if (progress.dayIndex < progress.daysRequired) {
    throw new Error(
      `complete_trying_food: too early — currently day ${progress.dayIndex}/${progress.daysRequired}. ` +
        `Wait until day ${progress.daysRequired} to complete.`
    )
  }
  const updated = completeTrying(profile, input.categoryId)
  saveProfile(updated)
  return {
    categoryId: input.categoryId,
    food: progress.food,
    dayIndex: progress.dayIndex,
    daysRequired: progress.daysRequired,
    promotedFood: progress.food,
    isInCategoryAdd: !!(cat.representative && cat.representative !== progress.food),
  }
}

// ---- abort_trying_food ----

export interface AbortTryingFoodInput {
  categoryId: string
}

export interface AbortTryingFoodOutput {
  categoryId: string
  abortedFood: string
  resultingState: 'open' | 'untried'
  isInCategoryAdd: boolean
}

export function abortTryingFood(input: AbortTryingFoodInput): AbortTryingFoodOutput {
  if (!input.categoryId) {
    throw new Error('abort_trying_food: categoryId is required')
  }
  const profile = loadProfile()
  const cat = profile.categoryAllergies[input.categoryId]
  if (!cat || cat.state !== 'trying') {
    throw new Error(`abort_trying_food: category "${input.categoryId}" is not in trying state`)
  }
  const abortedFood = cat.tryingFood ?? '?'
  // Detect the "in-category add" path the same way fushi-ditu does, so we
  // can report which state we ended up in.
  const confirmed = profile.confirmedFoods || []
  const hasRep = !!cat.representative && cat.representative !== abortedFood
  const isInCategoryAdd = hasRep || confirmed.length > 0
  const updated = abortTrying(profile, input.categoryId)
  saveProfile(updated)
  const resulting = updated.categoryAllergies[input.categoryId]?.state
  return {
    categoryId: input.categoryId,
    abortedFood,
    resultingState: resulting === 'open' ? 'open' : 'untried',
    isInCategoryAdd,
  }
}

// ---- mark_food_allergic (IRREVERSIBLE — 2 layers of guardrail) ----

export interface MarkFoodAllergicInput {
  food: string
  reactionId: string
  consentToConfirmIrreversible: true
  note?: string
}

export interface MarkFoodAllergicOutput {
  food: string
  reactionId: string
  state: 'allergic'
  enteredAt: string
  /** Affected categories this food belongs to (for transparency in the response). */
  affectedCategories: string[]
}

export function markFoodAllergic(input: MarkFoodAllergicInput): MarkFoodAllergicOutput {
  if (!input.food) {
    throw new Error('mark_food_allergic: food is required')
  }
  if (!input.reactionId) {
    throw new Error('mark_food_allergic: reactionId is required (audit trail — must reference a record_reaction)')
  }
  // zod already enforces consentToConfirmIrreversible === true, but a
  // belt-and-suspenders check here so the domain is safe to call from
  // other paths (e.g. a future prompt) without re-validating the schema.
  if (input.consentToConfirmIrreversible !== true) {
    throw new Error('mark_food_allergic: consentToConfirmIrreversible must be exactly true')
  }

  // Audit: reaction must exist
  const reaction = getReactions().find((r) => r.id === input.reactionId)
  if (!reaction) {
    throw new Error(`mark_food_allergic: reactionId "${input.reactionId}" not found — record the reaction first.`)
  }

  const profile = loadProfile()
  const updated = _fushiMarkAllergic(profile, input.food, input.reactionId, input.note)
  saveProfile(updated)
  const enteredAt = updated.individualExceptions[input.food]?.enteredAt ?? new Date().toISOString().slice(0, 10)
  // Surface the affected category IDs (just for the LLM to mention)
  const affectedCategories = Object.entries(updated.categoryAllergies)
    .filter(([, cat]) => cat.representative === input.food || cat.tryingFood === input.food)
    .map(([id]) => id)
  return {
    food: input.food,
    reactionId: input.reactionId,
    state: 'allergic',
    enteredAt,
    affectedCategories,
  }
}

// ---- enter_observation ----

export interface EnterObservationInput {
  food: string
  daysOverride?: number
  reactionId?: string
  note?: string
}

export interface EnterObservationOutput {
  food: string
  state: 'observation'
  nextRetryDate: string
  days: number
  reactionId?: string
}

export function enterObservation(input: EnterObservationInput): EnterObservationOutput {
  if (!input.food) {
    throw new Error('enter_observation: food is required')
  }
  if (input.reactionId) {
    const reaction = getReactions().find((r) => r.id === input.reactionId)
    if (!reaction) {
      throw new Error(`enter_observation: reactionId "${input.reactionId}" not found`)
    }
  }
  const profile = loadProfile()
  const updated = _fushiEnterObservation(profile, input.food, input.reactionId ?? '', input.note, input.daysOverride)
  saveProfile(updated)
  const ex = updated.individualExceptions[input.food]
  return {
    food: input.food,
    state: 'observation',
    nextRetryDate: ex?.nextRetryDate ?? '',
    days: input.daysOverride ?? 7,
    ...(input.reactionId ? { reactionId: input.reactionId } : {}),
  }
}

// ---- start_introducing ----

export interface StartIntroducingInput {
  food: string
}

export interface StartIntroducingOutput {
  food: string
  state: 'introducing'
  nextRetryDate: string
}

export function startIntroducing(input: StartIntroducingInput): StartIntroducingOutput {
  if (!input.food) {
    throw new Error('start_introducing: food is required')
  }
  // Run the safety gate so the LLM doesn't skip check_food_safety.
  const profile = loadProfile()
  const safety = checkFoodsSafety([input.food], profile)
  if (!safety.safe) {
    const reasons = safety.results.filter((r) => !r.safe).map((r) => `${r.food}: ${r.reason ?? 'unknown'}`)
    throw new Error(`start_introducing blocked — ${reasons.join('; ')}. Resolve via check_food_safety first.`)
  }
  const updated = _fushiStartIntroducing(profile, input.food)
  saveProfile(updated)
  return {
    food: input.food,
    state: 'introducing',
    nextRetryDate: updated.individualExceptions[input.food]?.nextRetryDate ?? '',
  }
}

// ---- resource helpers (re-exported for resources/) ----

export interface TryingProgressOutput {
  trying: { food: string; categoryId: string; dayIndex: number; daysRequired: number; startDate: string } | null
  scheduledStart: { food: string; categoryId: string; startDate: string } | null
  isComplete: { categoryId: string; food: string } | null
  nextRecommendations: NextRecommendation[]
}

export function readTryingProgress(): TryingProgressOutput {
  const profile = loadProfile()
  // checkTryingComplete takes a categoryId; here we scan all categories
  // for the first completed one.
  let completed: { categoryId: string; food: string } | null = null
  // checkTryingComplete is 2-arg in fushi-ditu; .js has no .d.ts so cast.
  const _checkTryingComplete = checkTryingComplete as (p: BabyProfile, id: string) => { categoryId: string; food: string } | null
  for (const id of Object.keys(profile.categoryAllergies)) {
    const c = _checkTryingComplete(profile, id)
    if (c) {
      completed = c
      break
    }
  }
  return {
    trying: getTryingProgress(profile),
    scheduledStart: getTryingScheduledStart(profile),
    isComplete: completed,
    nextRecommendations: getNextRecommendation(profile),
  }
}

// silence unused
void calcAgeMonths
