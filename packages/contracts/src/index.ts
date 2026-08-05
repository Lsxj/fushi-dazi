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

export const AgentWorkflowToolSchema = z.enum([
  'read_baby_profile',
  'check_food_safety',
  'list_recipes',
  'generate_today_menu',
  'get_feeding_history',
  'record_reaction',
])

export const AgenticEvaluationCaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  question: z.string().min(1),
  evidenceSource: z.enum([
    'profile',
    'safety-rules',
    'recipe-catalog',
    'menu-planner',
    'feeding-history',
    'reaction-log',
  ]),
  expectedTool: AgentWorkflowToolSchema,
  actualTool: AgentWorkflowToolSchema.nullable(),
  expectedSafety: z.enum(['allow', 'block']).nullable(),
  actualSafety: z.enum(['allow', 'block']).nullable(),
  toolSelectionPassed: z.boolean(),
  groundingProxyPassed: z.boolean(),
  safetyPassed: z.boolean(),
  passed: z.boolean(),
})

export const AgenticEvaluationOutputSchema = z.object({
  suiteId: z.literal('agentic-workflow-v1'),
  evaluatedAt: z.string().datetime(),
  executionMode: z.literal('offline-deterministic'),
  provider: z.literal('mock-policy'),
  datasetSize: z.number().int().positive(),
  passCount: z.number().int().nonnegative(),
  toolSelectionAccuracy: z.number().min(0).max(1),
  safetyBlockRecall: z.number().min(0).max(1),
  groundingProxyRate: z.number().min(0).max(1),
  endToEndSuccessRate: z.number().min(0).max(1),
  cases: z.array(AgenticEvaluationCaseSchema),
})

export const HouseholdRoleSchema = z.enum([
  'primary-caregiver',
  'caregiver',
  'viewer',
])

export const HouseholdActorSchema = z.object({
  id: z.string().regex(/^demo-[a-z-]+$/),
  role: HouseholdRoleSchema,
})

export const AllergyChangeRequestSchema = z.object({
  requestId: z.string().uuid(),
  householdId: z.literal('demo-household-001'),
  food: z.string().min(1).max(40),
  reactionId: z.string().min(1).max(80),
  requestedBy: z.string(),
  requestedByRole: HouseholdRoleSchema,
  justification: z.string().min(8).max(240),
  baseProfileVersion: z.number().int().positive(),
  status: z.enum(['pending-owner-confirmation', 'confirmed']),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().optional(),
})

export const HouseholdStateOutputSchema = z.object({
  householdId: z.literal('demo-household-001'),
  dataSource: z.literal('synthetic-demo'),
  persistenceMode: z.enum(['process-memory', 'local-file']),
  profileVersion: z.number().int().positive(),
  members: z.array(
    z.object({
      actorId: z.string(),
      role: HouseholdRoleSchema,
      label: z.string(),
      permissions: z.array(
        z.enum([
          'profile.read',
          'reaction.record',
          'allergy-change.request',
          'allergy-change.confirm',
        ])
      ),
    })
  ),
  foodStates: z.array(
    z.object({
      food: z.string(),
      state: z.enum(['confirmed', 'allergic']),
      changedAt: z.string().datetime().optional(),
    })
  ),
  pendingRequests: z.array(AllergyChangeRequestSchema),
})

export const RequestAllergyChangeInputSchema = z.object({
  actor: z.object({
    id: z.string().regex(/^demo-[a-z-]+$/),
    role: HouseholdRoleSchema,
  }),
  householdId: z.literal('demo-household-001'),
  food: z.string().trim().min(1).max(40),
  reactionId: z.string().min(1).max(80),
  justification: z.string().trim().min(8).max(240),
  expectedProfileVersion: z.number().int().positive(),
})

export const RequestAllergyChangeOutputSchema = z.object({
  auditId: z.string().uuid(),
  decision: z.enum(['denied', 'pending-owner-confirmation']),
  reasonCode: z.enum([
    'identity-role-mismatch',
    'role-not-authorized',
    'reaction-not-found',
    'pending-request-exists',
    'already-allergic',
    'profile-version-conflict',
    'owner-confirmation-required',
  ]),
  request: AllergyChangeRequestSchema.optional(),
  dataSource: z.literal('synthetic-demo'),
  profileUpdated: z.literal(false),
})

export const ConfirmAllergyChangeInputSchema = z.object({
  actor: HouseholdActorSchema,
  householdId: z.literal('demo-household-001'),
  requestId: z.string().uuid(),
  expectedProfileVersion: z.number().int().positive(),
  consentToConfirmIrreversible: z.literal(true),
})

export const ConfirmAllergyChangeOutputSchema = z.object({
  auditId: z.string().uuid(),
  decision: z.enum(['confirmed', 'denied']),
  reasonCode: z.enum([
    'identity-role-mismatch',
    'owner-role-required',
    'invalid-request',
    'reaction-not-found',
    'explicit-confirmation-required',
    'profile-version-conflict',
    'allergy-profile-updated',
  ]),
  dataSource: z.literal('synthetic-demo'),
  profileUpdated: z.boolean(),
  profileVersion: z.number().int().positive(),
})

export const HouseholdAuditRecordSchema = z.object({
  auditId: z.string().uuid(),
  timestamp: z.string().datetime(),
  actorId: z.string(),
  actorRole: HouseholdRoleSchema,
  action: z.enum(['allergy-change.request', 'allergy-change.confirm']),
  householdId: z.literal('demo-household-001'),
  food: z.string(),
  decision: z.enum(['denied', 'pending-owner-confirmation', 'confirmed']),
  reasonCode: z.string(),
  confirmationEvidence: z.boolean(),
  profileVersion: z.number().int().positive(),
  authorizationSource: z.literal('household-role-policy'),
  dataSource: z.literal('synthetic-demo'),
})

export const HouseholdAuditOutputSchema = z.object({
  records: z.array(HouseholdAuditRecordSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    denied: z.number().int().nonnegative(),
    pendingOwnerConfirmation: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
  }),
  dataSource: z.literal('synthetic-demo'),
  persistenceMode: z.enum(['process-memory', 'local-file']),
})

export const HouseholdMenuPreviewOutputSchema = z.object({
  householdId: z.literal('demo-household-001'),
  dataSource: z.literal('synthetic-demo'),
  persistenceMode: z.enum(['process-memory', 'local-file']),
  profileVersion: z.number().int().positive(),
  decisionSource: z.literal('deterministic-rules'),
  executionMode: z.literal('deterministic'),
  provider: z.literal('none'),
  meals: z.array(
    z.object({
      slot: z.enum(['breakfast', 'lunch']),
      recipeId: z.string().min(1),
      recipeName: z.string().min(1),
      ingredients: z.array(z.string().min(1)).min(1),
    })
  ),
  exclusions: z.array(
    z.object({
      recipeId: z.string().min(1),
      recipeName: z.string().min(1),
      blockedFood: z.string().min(1),
      reason: z.string().min(1),
      rule: z.enum(['individual-allergy', 'food-safety']),
    })
  ),
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

export const evaluateAgenticWorkflowContract = oc
  .route({
    method: 'GET',
    path: '/v1/evaluations/agentic',
    summary: 'Run the offline agentic workflow regression suite',
    tags: ['Evaluation'],
  })
  .input(z.object({}))
  .output(AgenticEvaluationOutputSchema)

export const getHouseholdStateContract = oc
  .route({
    method: 'GET',
    path: '/v1/collaboration/household',
    summary: 'Read the synthetic household collaboration state',
    tags: ['Collaboration'],
  })
  .input(z.object({}))
  .output(HouseholdStateOutputSchema)

export const requestAllergyChangeContract = oc
  .route({
    method: 'POST',
    path: '/v1/collaboration/allergy-changes/request',
    summary: 'Request an allergy profile change with reaction evidence',
    tags: ['Collaboration'],
  })
  .input(RequestAllergyChangeInputSchema)
  .output(RequestAllergyChangeOutputSchema)

export const confirmAllergyChangeContract = oc
  .route({
    method: 'POST',
    path: '/v1/collaboration/allergy-changes/confirm',
    summary: 'Confirm an allergy profile change as the primary caregiver',
    tags: ['Collaboration'],
  })
  .input(ConfirmAllergyChangeInputSchema)
  .output(ConfirmAllergyChangeOutputSchema)

export const listHouseholdAuditContract = oc
  .route({
    method: 'GET',
    path: '/v1/collaboration/audit',
    summary: 'List household safety profile change records',
    tags: ['Collaboration'],
  })
  .input(z.object({}))
  .output(HouseholdAuditOutputSchema)

export const getHouseholdMenuPreviewContract = oc
  .route({
    method: 'GET',
    path: '/v1/collaboration/menu-preview',
    summary: 'Generate a menu preview constrained by the household safety profile',
    tags: ['Collaboration'],
  })
  .input(z.object({}))
  .output(HouseholdMenuPreviewOutputSchema)

export const apiContract = {
  safety: {
    check: checkFoodSafetyContract,
  },
  observability: {
    traces: listSafetyTracesContract,
  },
  evaluations: {
    safety: evaluateSafetyContract,
    agentic: evaluateAgenticWorkflowContract,
  },
  collaboration: {
    household: getHouseholdStateContract,
    menuPreview: getHouseholdMenuPreviewContract,
    requestAllergyChange: requestAllergyChangeContract,
    confirmAllergyChange: confirmAllergyChangeContract,
    audit: listHouseholdAuditContract,
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
export type AgentWorkflowTool = z.infer<typeof AgentWorkflowToolSchema>
export type AgenticEvaluationOutput = z.infer<
  typeof AgenticEvaluationOutputSchema
>
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>
export type HouseholdStateOutput = z.infer<typeof HouseholdStateOutputSchema>
export type AllergyChangeRequest = z.infer<typeof AllergyChangeRequestSchema>
export type RequestAllergyChangeInput = z.infer<
  typeof RequestAllergyChangeInputSchema
>
export type RequestAllergyChangeOutput = z.infer<
  typeof RequestAllergyChangeOutputSchema
>
export type ConfirmAllergyChangeInput = z.infer<
  typeof ConfirmAllergyChangeInputSchema
>
export type ConfirmAllergyChangeOutput = z.infer<
  typeof ConfirmAllergyChangeOutputSchema
>
export type HouseholdAuditRecord = z.infer<typeof HouseholdAuditRecordSchema>
export type HouseholdAuditOutput = z.infer<typeof HouseholdAuditOutputSchema>
export type HouseholdMenuPreviewOutput = z.infer<
  typeof HouseholdMenuPreviewOutputSchema
>
