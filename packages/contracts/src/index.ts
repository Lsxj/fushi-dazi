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

export const checkFoodSafetyContract = oc
  .route({
    method: 'POST',
    path: '/v1/safety/check',
    summary: 'Check foods against deterministic baby-safety rules',
    tags: ['Safety'],
  })
  .input(CheckFoodSafetyInputSchema)
  .output(CheckFoodSafetyOutputSchema)

export const apiContract = {
  safety: {
    check: checkFoodSafetyContract,
  },
}

export type CheckFoodSafetyInput = z.infer<typeof CheckFoodSafetyInputSchema>
export type CheckFoodSafetyOutput = z.infer<typeof CheckFoodSafetyOutputSchema>
