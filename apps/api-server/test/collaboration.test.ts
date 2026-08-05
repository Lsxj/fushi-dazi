import type { ConfirmAllergyChangeInput } from '@fushi/contracts'
import { call } from '@orpc/server'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearCollaborationState,
  configureCollaborationStoreForTest,
  confirmAllergyChange,
  reloadCollaborationStateFromStoreForTest,
  removeSyntheticReactionEvidence,
  simulateConcurrentProfileUpdateForTest,
} from '../src/collaboration.js'
import {
  createFileCollaborationStore,
  createMemoryCollaborationStore,
} from '../src/collaboration-store.js'
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
  expectedProfileVersion: 1,
}

describe('household allergy change workflow', () => {
  beforeEach(() => {
    configureCollaborationStoreForTest(createMemoryCollaborationStore())
    clearCollaborationState()
  })

  it('exposes a synthetic household with real caregiver responsibilities', async () => {
    const household = await call(router.collaboration.household, {})

    expect(household).toMatchObject({
      householdId: 'demo-household-001',
      dataSource: 'synthetic-demo',
      persistenceMode: 'process-memory',
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

  it('keeps the menu unchanged while an allergy request is only pending', async () => {
    const before = await call(router.collaboration.menuPreview, {})
    await call(router.collaboration.requestAllergyChange, requestInput)
    const pending = await call(router.collaboration.menuPreview, {})

    expect(before).toMatchObject({
      profileVersion: 1,
      decisionSource: 'deterministic-rules',
      executionMode: 'deterministic',
      provider: 'none',
      meals: [
        { slot: 'breakfast', recipeName: '南瓜大米粥' },
        { slot: 'lunch', recipeName: '鳕鱼蔬菜粥' },
      ],
      exclusions: [],
    })
    expect(pending).toEqual(before)
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
        expectedProfileVersion: 1,
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
        expectedProfileVersion: 1,
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
      expectedProfileVersion: 1,
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
      expectedProfileVersion: 1,
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
        expectedProfileVersion: 1,
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
        expectedProfileVersion: 1,
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
      expectedProfileVersion: 2,
      consentToConfirmIrreversible: true,
    })
    const household = await call(router.collaboration.household, {})
    const audit = await call(router.collaboration.audit, {})
    const requestAfterAllergic = await call(
      router.collaboration.requestAllergyChange,
      { ...requestInput, expectedProfileVersion: 2 }
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

  it('deterministically removes allergic food and selects a safe substitute', async () => {
    const request = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    await call(router.collaboration.confirmAllergyChange, {
      actor: {
        id: 'demo-primary-caregiver',
        role: 'primary-caregiver',
      },
      householdId: 'demo-household-001',
      requestId: request.request!.requestId,
      expectedProfileVersion: 1,
      consentToConfirmIrreversible: true,
    })

    const preview = await call(router.collaboration.menuPreview, {})

    expect(preview).toMatchObject({
      profileVersion: 2,
      decisionSource: 'deterministic-rules',
      meals: [
        { slot: 'breakfast', recipeName: '南瓜大米粥' },
        { slot: 'lunch', recipeName: '牛肉土豆粥' },
      ],
      exclusions: [
        {
          recipeId: 'r005',
          recipeName: '鳕鱼蔬菜粥',
          blockedFood: '鳕鱼',
          reason: '鳕鱼已标记过敏',
          rule: 'individual-allergy',
        },
      ],
    })
    expect(
      preview.meals.flatMap((meal) => meal.ingredients)
    ).not.toContain('鳕鱼')
  })

  it('rejects a stale confirmation without mutating the safety profile', async () => {
    const request = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    simulateConcurrentProfileUpdateForTest()

    const stale = await call(router.collaboration.confirmAllergyChange, {
      actor: {
        id: 'demo-primary-caregiver',
        role: 'primary-caregiver',
      },
      householdId: 'demo-household-001',
      requestId: request.request!.requestId,
      expectedProfileVersion: 1,
      consentToConfirmIrreversible: true,
    })
    const household = await call(router.collaboration.household, {})
    const audit = await call(router.collaboration.audit, {})

    expect(stale).toMatchObject({
      decision: 'denied',
      reasonCode: 'profile-version-conflict',
      profileUpdated: false,
      profileVersion: 2,
    })
    expect(household).toMatchObject({
      profileVersion: 2,
      foodStates: [{ food: '鳕鱼', state: 'confirmed' }],
      pendingRequests: [{ baseProfileVersion: 1 }],
    })
    expect(audit.records[0]).toMatchObject({
      decision: 'denied',
      reasonCode: 'profile-version-conflict',
      confirmationEvidence: false,
    })
  })

  it('rejects a change request created from a stale profile view', async () => {
    simulateConcurrentProfileUpdateForTest()

    const stale = await call(
      router.collaboration.requestAllergyChange,
      requestInput
    )
    const household = await call(router.collaboration.household, {})

    expect(stale).toMatchObject({
      decision: 'denied',
      reasonCode: 'profile-version-conflict',
      profileUpdated: false,
    })
    expect(household).toMatchObject({
      profileVersion: 2,
      foodStates: [{ food: '鳕鱼', state: 'confirmed' }],
      pendingRequests: [],
    })
  })

  it('restores a pending request and audit history from the local file store', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'fushi-collaboration-'))
    const store = createFileCollaborationStore(join(directory, 'state.json'))
    configureCollaborationStoreForTest(store)
    clearCollaborationState()

    await call(router.collaboration.requestAllergyChange, requestInput)
    reloadCollaborationStateFromStoreForTest()

    const household = await call(router.collaboration.household, {})
    const audit = await call(router.collaboration.audit, {})
    expect(household).toMatchObject({
      persistenceMode: 'local-file',
      profileVersion: 1,
      pendingRequests: [{ baseProfileVersion: 1 }],
    })
    expect(audit).toMatchObject({
      persistenceMode: 'local-file',
      summary: { pendingOwnerConfirmation: 1 },
    })
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
