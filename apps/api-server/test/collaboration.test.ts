import type { ConfirmAllergyChangeInput } from '@fushi/contracts'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearCollaborationState,
  confirmAllergyChange,
  removeSyntheticReactionEvidence,
} from '../src/collaboration.js'
import { router } from '../src/router.js'

const requestInput = {
  actor: {
    id: 'demo-caregiver',
    role: 'caregiver' as const,
  },
  householdId: 'demo-household-001' as const,
  food: '鳕鱼',
  reactionId: 'reaction-demo-001',
  justification: '进食后出现已记录反应，申请更新安全档案',
}

describe('household allergy change workflow', () => {
  beforeEach(() => clearCollaborationState())

  it('exposes a synthetic household with real caregiver responsibilities', async () => {
    const household = await call(router.collaboration.household, {})

    expect(household).toMatchObject({
      householdId: 'demo-household-001',
      dataSource: 'synthetic-demo',
      profileVersion: 1,
      foodStates: [{ food: '鳕鱼', state: 'confirmed' }],
    })
    expect(
      household.members.find(
        (member) => member.role === 'primary-caregiver'
      )?.permissions
    ).toContain('allergy-change.confirm')
    expect(
      household.members.find((member) => member.role === 'caregiver')
        ?.permissions
    ).not.toContain('allergy-change.confirm')
  })

  it('blocks a read-only family member without changing the profile', async () => {
    const result = await call(router.collaboration.requestAllergyChange, {
      ...requestInput,
      actor: {
        id: 'demo-viewer',
        role: 'viewer',
      },
    })
    const household = await call(router.collaboration.household, {})
    const audit = await call(router.collaboration.audit, {})

    expect(result).toMatchObject({
      decision: 'denied',
      reasonCode: 'role-not-authorized',
      profileUpdated: false,
    })
    expect(household.profileVersion).toBe(1)
    expect(household.foodStates[0]?.state).toBe('confirmed')
    expect(audit.summary.denied).toBe(1)
  })

  it('blocks forged role binding and missing reaction evidence', async () => {
    const forged = await call(router.collaboration.requestAllergyChange, {
      ...requestInput,
      actor: {
        id: 'demo-viewer',
        role: 'caregiver',
      },
    })
    const missingReaction = await call(
      router.collaboration.requestAllergyChange,
      {
        ...requestInput,
        reactionId: 'reaction-missing',
      }
    )

    expect(forged.reasonCode).toBe('identity-role-mismatch')
    expect(missingReaction.reasonCode).toBe('reaction-not-found')
  })

  it('lets a caregiver submit one evidence-backed request for owner review', async () => {
    const result = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    const duplicate = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    const household = await call(router.collaboration.household, {})

    expect(result).toMatchObject({
      decision: 'pending-owner-confirmation',
      reasonCode: 'owner-confirmation-required',
      profileUpdated: false,
      request: {
        food: '鳕鱼',
        reactionId: 'reaction-demo-001',
        requestedByRole: 'caregiver',
        status: 'pending-owner-confirmation',
      },
    })
    expect(duplicate.reasonCode).toBe('pending-request-exists')
    expect(household.pendingRequests).toHaveLength(1)
    expect(household.profileVersion).toBe(1)
  })

  it('allows only the primary caregiver to confirm', async () => {
    const request = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    const caregiverAttempt = await call(
      router.collaboration.confirmAllergyChange,
      {
        actor: requestInput.actor,
        householdId: 'demo-household-001',
        requestId: request.request!.requestId,
        consentToConfirmIrreversible: true,
      }
    )
    const forgedOwner = await call(
      router.collaboration.confirmAllergyChange,
      {
        actor: {
          id: 'demo-viewer',
          role: 'primary-caregiver',
        },
        householdId: 'demo-household-001',
        requestId: request.request!.requestId,
        consentToConfirmIrreversible: true,
      }
    )

    expect(caregiverAttempt.reasonCode).toBe('owner-role-required')
    expect(forgedOwner.reasonCode).toBe('identity-role-mismatch')
    expect(
      (await call(router.collaboration.household, {})).profileVersion
    ).toBe(1)
  })

  it('repeats the literal-true check in the domain layer', () => {
    const invalidInput = {
      actor: {
        id: 'demo-primary-caregiver',
        role: 'primary-caregiver',
      },
      householdId: 'demo-household-001',
      requestId: '982a16b1-5c10-4a24-af22-2b578233bd1c',
      consentToConfirmIrreversible: false,
    } as unknown as ConfirmAllergyChangeInput

    expect(confirmAllergyChange(invalidInput)).toMatchObject({
      decision: 'denied',
      reasonCode: 'explicit-confirmation-required',
      profileUpdated: false,
    })
  })

  it('rejects missing requests and removed reaction evidence', async () => {
    const missing = await call(router.collaboration.confirmAllergyChange, {
      actor: {
        id: 'demo-primary-caregiver',
        role: 'primary-caregiver',
      },
      householdId: 'demo-household-001',
      requestId: '982a16b1-5c10-4a24-af22-2b578233bd1c',
      consentToConfirmIrreversible: true,
    })
    const request = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    removeSyntheticReactionEvidence('reaction-demo-001')
    const removedEvidence = await call(
      router.collaboration.confirmAllergyChange,
      {
        actor: {
          id: 'demo-primary-caregiver',
          role: 'primary-caregiver',
        },
        householdId: 'demo-household-001',
        requestId: request.request!.requestId,
        consentToConfirmIrreversible: true,
      }
    )

    expect(missing.reasonCode).toBe('invalid-request')
    expect(removedEvidence.reasonCode).toBe('reaction-not-found')
    expect(
      (await call(router.collaboration.household, {})).profileVersion
    ).toBe(1)
  })

  it('updates the synthetic allergy profile once and preserves an audit trail', async () => {
    const request = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    const confirmed = await call(
      router.collaboration.confirmAllergyChange,
      {
        actor: {
          id: 'demo-primary-caregiver',
          role: 'primary-caregiver',
        },
        householdId: 'demo-household-001',
        requestId: request.request!.requestId,
        consentToConfirmIrreversible: true,
      }
    )
    const replay = await call(router.collaboration.confirmAllergyChange, {
      actor: {
        id: 'demo-primary-caregiver',
        role: 'primary-caregiver',
      },
      householdId: 'demo-household-001',
      requestId: request.request!.requestId,
      consentToConfirmIrreversible: true,
    })
    const household = await call(router.collaboration.household, {})
    const audit = await call(router.collaboration.audit, {})
    const requestAfterAllergic = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )

    expect(confirmed).toMatchObject({
      decision: 'confirmed',
      reasonCode: 'allergy-profile-updated',
      profileUpdated: true,
      profileVersion: 2,
    })
    expect(replay.reasonCode).toBe('invalid-request')
    expect(household).toMatchObject({
      profileVersion: 2,
      foodStates: [{ food: '鳕鱼', state: 'allergic' }],
      pendingRequests: [],
    })
    expect(audit.summary).toMatchObject({
      pendingOwnerConfirmation: 1,
      confirmed: 1,
    })
    expect(audit.records[1]?.confirmationEvidence).toBe(true)
    expect(requestAfterAllergic.reasonCode).toBe('already-allergic')
  })

  it('caps household audit history at 100 records', async () => {
    for (let index = 0; index < 101; index += 1) {
      await call(router.collaboration.requestAllergyChange, {
        ...requestInput,
        actor: {
          id: 'demo-viewer',
          role: 'viewer',
        },
      })
    }

    expect((await call(router.collaboration.audit, {})).records).toHaveLength(
      100
    )
  })
})
