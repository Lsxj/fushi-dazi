/**
 * Type projections of fushi-ditu domain types.
 *
 * Why this file exists:
 * - mcp-server runs fushi-ditu utils via `globalThis.wx` shim (no compile of
 *   fushi-ditu .ts into mcp-server's tsc graph).
 * - mcp-server's tsconfig uses strict mode, so we need actual TypeScript types
 *   to satisfy the type checker when we reference BabyProfile / Recipe / etc.
 * - Importing types from fushi-ditu's compiled .js (no .d.ts emitted) would
 *   require a project reference, which is overkill for a demo.
 *
 * Trade-off: this file is a hand-maintained projection. If a fushi-ditu type
 * changes, this file must change too. Day 2's blocker list calls out the
 * production path (project references + .d.ts emit) — for the demo, the
 * fidelity risk is small because the mcp-server only consumes a stable
 * surface (read fields, pass through). Mutations from mcp-server go through
 * fushi-ditu utils which are tested upstream.
 *
 * Source: /Users/x7/fushi-ditu/utils/planner.ts + data/*.ts. Keep in sync.
 *
 * ---
 *
 * Design assumption: SINGLE ACTIVE BABY PROFILE (2026-07-08, decided by 蘑菇先生).
 * - Storage key 'babyProfile' holds THE active baby. There is no babyId
 *   discriminator anywhere in the tool input surface.
 * - Production: would need activeProfileId + per-baby storage namespace.
 *   Demo scope: not required.
 * - If this assumption changes, every readJson<BabyProfile>('babyProfile')
 *   and the shim STORAGE_KEYS list need revisiting.
 */

// ---- planner.ts ----

export interface BabyProfile {
  babyName: string
  birthday?: string
  ageMonths: number
  mealsPerDay: number
  currentStatus: string
  statusSince?: string
  categoryAllergies: Record<string, CategoryAllergyState>
  individualExceptions: Record<string, IndividualException>
  confirmedFoods?: string[]
  recentlyAddedFoods?: { name: string; addedAt: string }[]
}

export interface CategoryAllergyState {
  state: string
  representative?: string
  passedDate?: string
  cooldownUntil?: string
  note?: string
  tryingFood?: string
  tryingStartDate?: string
  tryingDaysCompleted?: number
  tryingReplacedDates?: string[]
  tryingDaysRequired?: number
}

export interface IndividualException {
  state: 'allergic' | 'observation' | 'introducing'
  note?: string
  enteredAt?: string
  reasonReactionId?: string
  nextRetryDate?: string
  retryHistory?: { date: string; result: 'pass' | 'fail' }[]
}

export interface PlannedMeal {
  date: string
  mealIndex: number
  recipe: Recipe
  trialIngredient?: string
  trialMethod?: string
}

export interface DailyPlan {
  date: string
  meals: PlannedMeal[]
}

export interface ApplicableOptions {
  introducing?: string
}

export interface ApplicableResult {
  applicable: boolean
  reason?: string
  warnings?: Taboo[]
}

export interface NextRecommendation {
  categoryId: string
  category: string
  reason: string
  suggestedFoods: string[]
  firstFood: string
  mode: 'newCategory' | 'newFoodInOpenCategory'
  daysRequired: number
}

export interface ReplacementReason {
  icon: string
  text: string
}

export interface ReplacementCandidate {
  recipe: Recipe
  reason: string
  reasons: ReplacementReason[]
  prepTime: number
  inFridgeAll: boolean
  inFridgeCount: number
  warnings: Taboo[]
}

// ---- data/recipes.ts ----

export interface Recipe {
  id: string
  name: string
  ingredients: { name: string; portions: number }[]
  applicableMonthRange: [number, number]
  unsuitableStatus: string[]
  prepTimeMinutes: number
  difficulty: 'easy' | 'medium' | 'hard'
  steps: string[]
  nutritionTags: string[]
  mealCategories: ('staple' | 'protein' | 'veg' | 'fruit')[]
}

// ---- data/taboos.ts ----

export interface Taboo {
  foods: [string, string]
  level: 'hard' | 'soft'
  reason: string
  mitigation?: string
  source: 'CNS2022' | 'AAP' | 'WHO' | 'NutritionConsensus'
}

// ---- data/categories.ts ----

export interface Category {
  id: string
  name: string
  riskLevel: 'low' | 'medium' | 'high' | 'extreme'
  recommendedMonth: number
  representatives: string[]
  members: string[]
  mainCategory:
    | 'staple'
    | 'protein'
    | 'veg'
    | 'fruit'
    | 'oil'
    | 'condiment'
    | 'product'
    | 'preprocessed'
  noAllergyTracking?: boolean
}

// ---- utils/journal.ts ----

export type Preference = 'love' | 'dislike'
export type Portion = 'taste' | 'small' | 'half' | 'full'

export interface MealLog {
  date: string
  mealIndex: number
  recipeId: string
  recipeName: string
  ingredients: string[]
  loggedAt: string
  eatenAt?: string
  preference?: Preference
  note?: string
  customDishName?: string
  portion?: Portion
  isCustom?: boolean
}

// ---- utils/checkin.ts ----

export interface CheckinResult {
  log: MealLog
  consumed: { name: string; portions: number }[]
}

export interface CheckinOverride {
  customDishName?: string
  actualIngredients?: string[]
  portion?: Portion
  note?: string
  eatenAt?: string
}

// ---- utils/storage.ts (fridge) ----

export interface FridgeItem {
  name: string
  portions: number
  storageLocation: 'frozen' | 'refrigerated' | 'room'
  purchaseDate: string
  expiryDate: string
  prepStatus: 'raw' | 'washed' | 'cooked' | 'portioned'
}

// ---- Day 3 mcp-server additions ----

/** Result of a safety check attached to a journal record. */
export interface SafetyCheckReport {
  /** True if user explicitly bypassed an unsafe verdict via consentToBypassSafety. */
  bypassed: boolean
  /** Foods that were flagged unsafe (may be empty when all were safe). */
  flaggedFoods: { food: string; reason: string }[]
  /** Human-readable reasons (one per flagged food, plus a top-level note). */
  reasons: string[]
}

// ---- utils/reactions.ts ----

export type ReactionType = 'gut' | 'rash' | 'vomit' | 'sleepy' | 'fever' | 'constipation'
export type ReactionSeverity = 'mild' | 'moderate' | 'severe'

export interface ReactionLog {
  id: string
  occurredAt: string
  type: ReactionType
  severity: ReactionSeverity
  note?: string
  tracebackMeals: { date: string; mealIndex: number; recipeName: string; ingredients: string[] }[]
  suspectedFoods: string[]
  resolvedAt?: string
}

// ---- utils/observation.ts ----

export type SuspectLevel = 'high' | 'medium' | 'low'

export interface SuspectFood {
  name: string
  reason: string
  level: SuspectLevel
}

/** Enriched suspect with category context (Day 4 mcp-server projection). */
export interface AnalyzedSuspect extends SuspectFood {
  categoryId?: string
  categoryState?: string
}

/** Trace of which rules fired and which were skipped — the killer-demo field. */
export interface RuleTrace {
  /** Ingredients skipped because they're already marked allergic. */
  allergicSkipped: string[]
  /** Ingredients skipped because they're in the parent's confirmedFoods whitelist. */
  confirmedSkipped: string[]
  /** Ingredients that are currently in the 3-day introducing window. */
  introducingChecked: string[]
  /** Human label for the current trying food (e.g. "排敏第 1/3 天"), if any. */
  tryingDayLabel: string | null
}

// ---- utils/reviewStats.ts ----

export interface WeekSummary {
  range: { from: string; to: string }
  rangeLabel: string
  loveCount: number
  loveDelta: number
  newFoodCount: number
  newFoodDelta: number
  reactionCount: number
  reactionDelta: number
  nutritionDays: number
  nutritionLabel: string
  nutritionEmoji: string
  nutritionHint: string
  nutritionState: 'ok' | 'warn' | 'normal'
}
