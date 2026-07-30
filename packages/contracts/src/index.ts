import { oc } from '@orpc/contract'
import { z } from 'zod'

export const CategoryAllergyStateSchema = z.object({
  state: z.enum(['open', 'trying', 'observation', 'untried', 'locked']),
  representative: z.string().min(1).optional(),
  passedDate: z.iso.date().optional(),
  cooldownUntil: z.iso.date().optional(),
  note: z.string().max(500).optional(),
  tryingFood: z.string().min(1).optional(),
  tryingStartDate: z.iso.date().optional(),
  tryingDaysCompleted: z.number().int().min(0).optional(),
  tryingReplacedDates: z.array(z.iso.date()).max(30).optional(),
  tryingDaysRequired: z.number().int().min(1).max(14).optional(),
})

export const IndividualExceptionSchema = z.object({
  state: z.enum(['allergic', 'observation', 'introducing']),
  note: z.string().max(500).optional(),
  enteredAt: z.string().max(40).optional(),
  reasonReactionId: z.string().min(1).optional(),
  nextRetryDate: z.iso.date().optional(),
  retryHistory: z
    .array(
      z.object({
        date: z.iso.date(),
        result: z.enum(['pass', 'fail']),
      })
    )
    .max(50)
    .optional(),
})

export const FoodSafetyProfileSchema = z.object({
  ageMonths: z.number().int().min(4).max(24),
  currentStatus: z.enum(['normal', 'postVaccine']),
  statusSince: z.iso.date().optional(),
  categoryAllergies: z.record(z.string().min(1), CategoryAllergyStateSchema),
  individualExceptions: z.record(z.string().min(1), IndividualExceptionSchema),
  confirmedFoods: z.array(z.string().min(1).max(40)).max(300).optional(),
})

export const CheckFoodSafetyInputSchema = z.object({
  foods: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  profile: FoodSafetyProfileSchema,
})

export const TabooSchema = z.object({
  foods: z.tuple([z.string(), z.string()]),
  level: z.enum(['hard', 'soft']),
  reason: z.string(),
  mitigation: z.string().optional(),
  source: z.enum(['CNS2022', 'AAP', 'WHO', 'NutritionConsensus']),
})

export const CheckFoodSafetyOutputSchema = z.object({
  traceId: z.string().uuid(),
  durationMs: z.number().nonnegative(),
  safe: z.boolean(),
  decisionSource: z.literal('deterministic-rules'),
  profileSnapshot: z.object({
    ageMonths: z.number().int(),
    currentStatus: z.enum(['normal', 'postVaccine']),
  }),
  results: z.array(
    z.object({
      food: z.string(),
      safe: z.boolean(),
      reason: z.string().optional(),
      categoryId: z.string().optional(),
      categoryState: z.string().optional(),
    })
  ),
  tabooWarnings: z.array(TabooSchema),
  tabooBlocks: z.array(TabooSchema),
})

export const SafetyTraceSchema = z.object({
  traceId: z.string().uuid(),
  timestamp: z.string().datetime(),
  operation: z.literal('safety.check'),
  executionMode: z.literal('deterministic'),
  provider: z.literal('none'),
  decisionSource: z.literal('deterministic-rules'),
  status: z.enum(['allowed', 'blocked']),
  durationMs: z.number().nonnegative(),
  inputSummary: z.object({
    foodCount: z.number().int().min(1).max(10),
    profileStatus: z.enum(['normal', 'postVaccine']),
  }),
  outputSummary: z.object({
    safe: z.boolean(),
    passedCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    hardBlockCount: z.number().int().nonnegative(),
  }),
})

export const ListSafetyTracesOutputSchema = z.object({
  traces: z.array(SafetyTraceSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    allowed: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    averageDurationMs: z.number().nonnegative(),
  }),
  privacyMode: z.literal('summary-only'),
})

export const SafetyEvaluationCaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  expectedSafe: z.boolean(),
  actualSafe: z.boolean(),
  passed: z.boolean(),
})

export const SafetyEvaluationOutputSchema = z.object({
  suiteId: z.literal('safety-regression-v1'),
  evaluatedAt: z.string().datetime(),
  executionMode: z.literal('deterministic'),
  provider: z.literal('none'),
  datasetSize: z.number().int().positive(),
  passCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  safetyBlockRecall: z.number().min(0).max(1),
  cases: z.array(SafetyEvaluationCaseSchema),
})

export const checkFoodSafetyContract = oc
  .route({
    method: 'POST',
    path: '/v1/safety/check',
    summary: 'Check foods against deterministic baby-safety rules',
    tags: ['Safety'],
  })
  .input(CheckFoodSafetyInputSchema)
  .output(CheckFoodSafetyOutputSchema)

export const listSafetyTracesContract = oc
  .route({
    method: 'GET',
    path: '/v1/observability/traces',
    summary: 'List privacy-safe execution traces for safety checks',
    tags: ['Observability'],
  })
  .input(z.object({}))
  .output(ListSafetyTracesOutputSchema)

export const evaluateSafetyContract = oc
  .route({
    method: 'GET',
    path: '/v1/evaluations/safety',
    summary: 'Run the deterministic safety regression suite',
    tags: ['Evaluation'],
  })
  .input(z.object({}))
  .output(SafetyEvaluationOutputSchema)

export const apiContract = {
  safety: {
    check: checkFoodSafetyContract,
  },
  observability: {
    traces: listSafetyTracesContract,
  },
  evaluations: {
    safety: evaluateSafetyContract,
  },
}

export type CheckFoodSafetyInput = z.infer<typeof CheckFoodSafetyInputSchema>
export type CheckFoodSafetyOutput = z.infer<typeof CheckFoodSafetyOutputSchema>
export type SafetyTrace = z.infer<typeof SafetyTraceSchema>
export type ListSafetyTracesOutput = z.infer<
  typeof ListSafetyTracesOutputSchema
>
export type SafetyEvaluationOutput = z.infer<
  typeof SafetyEvaluationOutputSchema
>
