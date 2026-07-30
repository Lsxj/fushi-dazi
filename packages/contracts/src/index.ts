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

export const GovernanceRoleSchema = z.enum([
  'viewer',
  'operator',
  'safety-admin',
  'auditor',
])

export const GovernanceActionSchema = z.enum([
  'safety.report.read',
  'profile.mark-allergic',
  'audit.export',
])

export const GovernancePolicyOutputSchema = z.object({
  identityProvider: z.literal('mock-demo'),
  executionMode: z.literal('simulation'),
  externalMutationPerformed: z.literal(false),
  roles: z.array(
    z.object({
      role: GovernanceRoleSchema,
      label: z.string().min(1),
      permissions: z.array(GovernanceActionSchema),
    })
  ),
  irreversibleActions: z.array(
    z.object({
      action: GovernanceActionSchema,
      requiresExplicitConfirmation: z.boolean(),
    })
  ),
})

export const RequestGovernedActionInputSchema = z.object({
  actor: z.object({
    id: z.string().regex(/^demo-[a-z-]+$/),
    role: GovernanceRoleSchema,
  }),
  action: z.literal('profile.mark-allergic'),
  resource: z.object({
    type: z.literal('demo-profile'),
    id: z.literal('demo-profile-001'),
  }),
  evidence: z.object({
    reactionId: z.string().min(1).max(80),
  }),
  justification: z.string().trim().min(8).max(240),
})

export const RequestGovernedActionOutputSchema = z.object({
  auditId: z.string().uuid(),
  decision: z.enum(['denied', 'confirmation-required']),
  reasonCode: z.enum([
    'identity-role-mismatch',
    'role-not-authorized',
    'explicit-confirmation-required',
  ]),
  confirmationToken: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional(),
  identityProvider: z.literal('mock-demo'),
  executionMode: z.literal('simulation'),
  externalMutationPerformed: z.literal(false),
})

export const ConfirmGovernedActionInputSchema = z.object({
  actor: z.object({
    id: z.string().regex(/^demo-[a-z-]+$/),
    role: GovernanceRoleSchema,
  }),
  confirmationToken: z.string().uuid(),
  consentToConfirmIrreversible: z.literal(true),
})

export const ConfirmGovernedActionOutputSchema = z.object({
  auditId: z.string().uuid(),
  decision: z.enum(['confirmed', 'denied']),
  reasonCode: z.enum([
    'explicit-confirmation-recorded',
    'invalid-or-expired-token',
    'actor-mismatch',
    'identity-role-mismatch',
  ]),
  identityProvider: z.literal('mock-demo'),
  executionMode: z.literal('simulation'),
  externalMutationPerformed: z.literal(false),
})

export const GovernanceAuditRecordSchema = z.object({
  auditId: z.string().uuid(),
  timestamp: z.string().datetime(),
  actorId: z.string(),
  actorRole: GovernanceRoleSchema,
  action: GovernanceActionSchema,
  resourceType: z.literal('demo-profile'),
  decision: z.enum(['denied', 'confirmation-required', 'confirmed']),
  reasonCode: z.string(),
  confirmationEvidence: z.boolean(),
  authorizationSource: z.literal('deterministic-rbac'),
  identityProvider: z.literal('mock-demo'),
  executionMode: z.literal('simulation'),
  externalMutationPerformed: z.literal(false),
})

export const GovernanceAuditOutputSchema = z.object({
  records: z.array(GovernanceAuditRecordSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    denied: z.number().int().nonnegative(),
    awaitingConfirmation: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
  }),
  privacyMode: z.literal('metadata-only'),
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

export const getGovernancePolicyContract = oc
  .route({
    method: 'GET',
    path: '/v1/governance/policy',
    summary: 'Describe the deterministic demo RBAC policy',
    tags: ['Governance'],
  })
  .input(z.object({}))
  .output(GovernancePolicyOutputSchema)

export const requestGovernedActionContract = oc
  .route({
    method: 'POST',
    path: '/v1/governance/actions/request',
    summary: 'Request authorization for a governed irreversible action',
    tags: ['Governance'],
  })
  .input(RequestGovernedActionInputSchema)
  .output(RequestGovernedActionOutputSchema)

export const confirmGovernedActionContract = oc
  .route({
    method: 'POST',
    path: '/v1/governance/actions/confirm',
    summary: 'Record explicit confirmation for a governed action',
    tags: ['Governance'],
  })
  .input(ConfirmGovernedActionInputSchema)
  .output(ConfirmGovernedActionOutputSchema)

export const listGovernanceAuditContract = oc
  .route({
    method: 'GET',
    path: '/v1/governance/audit',
    summary: 'List metadata-only governance audit records',
    tags: ['Governance'],
  })
  .input(z.object({}))
  .output(GovernanceAuditOutputSchema)

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
  governance: {
    policy: getGovernancePolicyContract,
    requestAction: requestGovernedActionContract,
    confirmAction: confirmGovernedActionContract,
    audit: listGovernanceAuditContract,
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
export type GovernanceRole = z.infer<typeof GovernanceRoleSchema>
export type GovernanceAction = z.infer<typeof GovernanceActionSchema>
export type GovernancePolicyOutput = z.infer<
  typeof GovernancePolicyOutputSchema
>
export type RequestGovernedActionInput = z.infer<
  typeof RequestGovernedActionInputSchema
>
export type RequestGovernedActionOutput = z.infer<
  typeof RequestGovernedActionOutputSchema
>
export type ConfirmGovernedActionInput = z.infer<
  typeof ConfirmGovernedActionInputSchema
>
export type ConfirmGovernedActionOutput = z.infer<
  typeof ConfirmGovernedActionOutputSchema
>
export type GovernanceAuditRecord = z.infer<
  typeof GovernanceAuditRecordSchema
>
export type GovernanceAuditOutput = z.infer<
  typeof GovernanceAuditOutputSchema
>
