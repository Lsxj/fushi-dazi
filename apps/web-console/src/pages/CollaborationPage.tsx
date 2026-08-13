import type {
  HouseholdRole,
  RequestAllergyChangeOutput,
} from '@fushi/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'
import { displayFood, displayText } from '../i18n'

const actorByRole: Record<HouseholdRole, string> = {
  'primary-caregiver': 'demo-primary-caregiver',
  caregiver: 'demo-caregiver',
  viewer: 'demo-viewer',
}

const roleDescriptions: Record<HouseholdRole, string> = {
  'primary-caregiver': 'Manages members and approves permanent safety-profile changes',
  caregiver: 'Logs meals and reactions and requests profile changes',
  viewer: 'Can only view menus and the safety profile',
}

const roleLabels: Record<HouseholdRole, string> = {
  'primary-caregiver': 'Primary Caregiver',
  caregiver: 'Caregiver',
  viewer: 'View-only Member',
}

function reasonLabel(reasonCode: string): string {
  const labels: Record<string, string> = {
    'identity-role-mismatch': 'The household member identity does not match the role',
    'role-not-authorized': 'View-only members cannot request profile changes',
    'reaction-not-found': 'The linked reaction record does not exist',
    'pending-request-exists': 'A pending request already exists for this food',
    'already-allergic': 'This food is already marked as a permanent allergy',
    'profile-version-conflict': 'Another caregiver updated the profile. Review the latest version first',
    'owner-confirmation-required': 'Waiting for primary-caregiver approval',
    'owner-role-required': 'Only the primary caregiver can approve this change',
    'invalid-request': 'The request does not exist or has already been processed',
    'explicit-confirmation-required': 'Explicit confirmation is required for this irreversible change',
    'allergy-profile-updated': 'The safety profile has been updated',
  }
  return labels[reasonCode] ?? reasonCode
}

export function CollaborationPage() {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<HouseholdRole>('caregiver')
  const [changeResult, setChangeResult] =
    useState<RequestAllergyChangeOutput | null>(null)
  const [consented, setConsented] = useState(false)

  const household = useQuery({
    queryKey: ['collaboration', 'household'],
    queryFn: () => apiClient.collaboration.household({}),
  })
  const audit = useQuery({
    queryKey: ['collaboration', 'audit'],
    queryFn: () => apiClient.collaboration.audit({}),
  })
  const menuPreview = useQuery({
    queryKey: ['collaboration', 'menu-preview'],
    queryFn: () => apiClient.collaboration.menuPreview({}),
  })

  const requestChange = useMutation({
    mutationFn: () =>
      apiClient.collaboration.requestAllergyChange({
        actor: {
          id: actorByRole[role],
          role,
        },
        householdId: 'demo-household-001',
        food: '鳕鱼',
        reactionId: 'reaction-demo-001',
        justification: 'A recorded reaction occurred after eating; request a safety-profile update',
        expectedProfileVersion: household.data?.profileVersion ?? 1,
      }),
    onSuccess: (result) => {
      setChangeResult(result)
      setConsented(false)
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['collaboration', 'household'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['collaboration', 'audit'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['collaboration', 'menu-preview'],
        }),
      ])
    },
  })

  const confirmChange = useMutation({
    mutationFn: () =>
      apiClient.collaboration.confirmAllergyChange({
        actor: {
          id: actorByRole[role],
          role,
        },
        householdId: 'demo-household-001',
        requestId: changeResult?.request?.requestId ?? '',
        expectedProfileVersion: household.data?.profileVersion ?? 1,
        consentToConfirmIrreversible: true,
      }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['collaboration', 'household'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['collaboration', 'audit'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['collaboration', 'menu-preview'],
        }),
      ])
    },
  })

  function chooseRole(nextRole: HouseholdRole) {
    setRole(nextRole)
    setConsented(false)
    requestChange.reset()
    confirmChange.reset()
    if (changeResult?.decision === 'denied') {
      setChangeResult(null)
    }
  }

  const isLoading =
    household.isPending || audit.isPending || menuPreview.isPending
  const isError = household.isError || audit.isError || menuPreview.isError
  const foodState = household.data?.foodStates.find(
    (item) => item.food === '鳕鱼'
  )

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="shield" size={14} />
            Developer scenario · multi-caregiver workflow
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            Synthetic Household Authorization Scenario
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            For development and regression testing only. This scenario simulates a caregiver request, explicit primary-caregiver approval, profile versioning, and deterministic menu updates. The production console cannot approve changes on a parent's behalf.
          </p>
        </div>
        <div className="rounded-2xl border border-[#d7a58f]/35 bg-[#fff0e8] px-4 py-3 text-xs leading-5 text-[#8a452d]">
          <strong className="block">
            {household.data?.persistenceMode === 'local-file'
              ? 'Locally persisted synthetic data'
              : 'Synthetic household data'}
          </strong>
          Contains no real child data. Local-file mode can restore this synthetic state after a service restart.
        </div>
      </div>

      {isLoading && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
          <div className="h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
        </div>
      )}

      {isError && (
        <div className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">Unable to load the household collaboration service</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            Start the API server, then refresh this page.
          </p>
        </div>
      )}

      {household.data && audit.data && menuPreview.data && (
        <>
          <section
            aria-label="Profile status"
            className="mt-8 grid gap-4 sm:grid-cols-3"
          >
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                Household members
              </span>
              <strong className="mt-3 block text-3xl font-black text-[#183f35]">
                {household.data.members.length}
              </strong>
              <span className="mt-2 block text-xs text-[#7a867f]">
                Primary caregiver · caregiver · view-only member
              </span>
            </article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                Cod profile status
              </span>
              <strong
                className={`mt-3 block text-2xl font-black ${
                  foodState?.state === 'allergic'
                    ? 'text-[#b64f31]'
                    : 'text-[#183f35]'
                }`}
              >
                {foodState?.state === 'allergic' ? 'Permanent allergy' : 'Established food'}
              </strong>
              <span className="mt-2 block text-xs text-[#7a867f]">
                The household safety profile governs all future menus
              </span>
            </article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                Profile version
              </span>
              <strong className="mt-3 block font-mono text-3xl font-black text-[#183f35]">
                v{household.data.profileVersion}
              </strong>
              <span className="mt-2 block text-xs text-[#7a867f]">
                Increments after every approved change to support conflict detection
              </span>
            </article>
          </section>

          <section className="mt-6 overflow-hidden rounded-[1.8rem] border border-black/8 bg-white/75">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/8 px-6 py-5">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
                  Deterministic menu impact
                </span>
                <h2 className="mt-1 text-2xl font-black text-[#183f35]">
                  Today's menu follows the safety profile
                </h2>
                <p className="mt-2 text-sm text-[#68756e]">
                  Recomputed with profile v{menuPreview.data.profileVersion}. The menu stays unchanged while a request is pending and excludes an allergen immediately after approval.
                </p>
              </div>
              <span className="rounded-full bg-[#e5ebe6] px-3 py-1.5 font-mono text-[10px] font-bold text-[#315f52]">
                {menuPreview.data.decisionSource} · no LLM
              </span>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-2">
              {menuPreview.data.meals.map((meal) => (
                <article
                  className="rounded-2xl border border-black/8 bg-[#f8f8f5] p-5"
                  key={meal.slot}
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7a867f]">
                    {meal.slot === 'breakfast' ? 'Breakfast' : 'Lunch'}
                  </span>
                  <h3 className="mt-2 text-lg font-black text-[#183f35]">
                      {displayText(meal.recipeName)}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-[#7a867f]">
                      {meal.ingredients.map(displayFood).join(' · ')}
                  </p>
                </article>
              ))}
            </div>
            <div className="border-t border-black/8 px-6 py-5">
              {menuPreview.data.exclusions.length === 0 ? (
                <p className="text-sm font-bold text-[#315f52]">
                  Every current candidate passes the household safety-profile checks.
                </p>
              ) : (
                menuPreview.data.exclusions.map((exclusion) => (
                  <div
                    className="rounded-2xl border border-[#d87b5d]/25 bg-[#fff0e8] p-4"
                    key={exclusion.recipeId}
                  >
                    <strong className="text-sm text-[#8a452d]">
                      Excluded: {displayText(exclusion.recipeName)}
                    </strong>
                    <p className="mt-1 text-xs leading-5 text-[#8a604f]">
                      {displayText(exclusion.reason)} · rule {exclusion.rule} · replaced with a candidate that does not contain{' '}
                      {displayFood(exclusion.blockedFood)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[.95fr_1.05fr]">
            <section className="rounded-[1.8rem] border border-black/8 bg-white/75 p-6">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
                Real household scenario
              </span>
              <h2 className="mt-1 text-2xl font-black text-[#183f35]">
                Who is acting?
              </h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {household.data.members.map((member) => {
                  const selected = member.role === role
                  return (
                    <button
                      aria-pressed={selected}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? 'border-[#183f35] bg-[#e7eee9]'
                          : 'border-black/8 bg-[#f8f8f5] hover:border-[#183f35]/35'
                      }`}
                      key={member.actorId}
                      onClick={() => chooseRole(member.role)}
                      type="button"
                    >
                      <span className="block text-sm font-black text-[#183f35]">
                        {roleLabels[member.role]}
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-[#7a867f]">
                        {roleDescriptions[member.role]}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex gap-3 rounded-2xl border border-black/8 bg-[#f8f8f5] p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#183f35] text-xs font-black text-white">
                    1
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-[#183f35]">
                      Recorded food reaction
                    </h3>
                    <p className="mt-1 text-xs text-[#7a867f]">
                      Cod · reaction-demo-001 · synthetic demo record
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#183f35] p-5 text-white">
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-[#183f35]">
                      2
                    </span>
                    <div>
                      <h3 className="text-sm font-black">Request an allergy-profile change</h3>
                      <p className="mt-1 text-xs leading-5 text-white/55">
                        Current role: {household.data.members.find(
                          (member) => member.role === role
                        )?.label}
                        . A request does not change the profile immediately.
                      </p>
                    </div>
                  </div>
                  <button
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-[#183f35] disabled:opacity-50"
                    disabled={
                      requestChange.isPending ||
                      foodState?.state === 'allergic' ||
                      changeResult?.decision === 'pending-owner-confirmation'
                    }
                    onClick={() => requestChange.mutate()}
                    type="button"
                  >
                    Submit change request <Icon name="arrow" size={16} />
                  </button>
                </div>
              </div>

              {requestChange.isError && (
                <p className="mt-4 rounded-xl bg-[#fff0e8] p-3 text-sm text-[#8a452d]">
                  The change request could not be submitted. Try again.
                </p>
              )}

              {changeResult?.decision === 'denied' && (
                <div className="mt-4 rounded-2xl border border-[#d87b5d]/25 bg-[#fff0e8] p-4">
                  <strong className="text-sm text-[#8a452d]">Request not submitted</strong>
                  <p className="mt-1 text-xs text-[#8a604f]">
                    {reasonLabel(changeResult.reasonCode)} · audit record{' '}
                    {changeResult.auditId.slice(0, 8)}
                  </p>
                </div>
              )}

              {changeResult?.decision === 'pending-owner-confirmation' && (
                <div className="mt-4 rounded-2xl border border-[#d1b35c]/30 bg-[#fff8de] p-4">
                  <div className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#d7b64f] text-xs font-black text-white">
                      3
                    </span>
                    <div>
                      <strong className="text-sm text-[#705d24]">
                        Waiting for primary-caregiver approval
                      </strong>
                      <p className="mt-1 text-xs leading-5 text-[#7d6b35]">
                        The request is linked to a reaction record. Because a permanent allergy affects every future menu, the primary caregiver must approve it.
                      </p>
                    </div>
                  </div>

                  {role !== 'primary-caregiver' ? (
                    <button
                      className="mt-4 w-full rounded-xl border border-[#bfa34e]/30 bg-white/65 px-4 py-3 text-sm font-black text-[#705d24]"
                      onClick={() => chooseRole('primary-caregiver')}
                      type="button"
                    >
                      Switch to Primary Caregiver
                    </button>
                  ) : (
                    <>
                      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#bfa34e]/25 bg-white/55 p-3">
                        <input
                          checked={consented}
                          className="mt-0.5 size-4 accent-[#183f35]"
                          onChange={(event) =>
                            setConsented(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span className="text-xs leading-5 text-[#66551f]">
                          I reviewed reaction-demo-001 and explicitly confirm marking cod as a permanent allergy
                        </span>
                      </label>
                      <button
                        className="mt-3 w-full rounded-xl bg-[#183f35] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!consented || confirmChange.isPending}
                        onClick={() => confirmChange.mutate()}
                        type="button"
                      >
                        Confirm and update safety profile
                      </button>
                    </>
                  )}
                </div>
              )}

              {confirmChange.data && (
                <div
                  className={`mt-4 rounded-2xl border p-4 ${
                    confirmChange.data.profileUpdated
                      ? 'border-[#5da98c]/25 bg-[#e4f2ec]'
                      : 'border-[#d87b5d]/25 bg-[#fff0e8]'
                  }`}
                >
                  <strong
                    className={`text-sm ${
                      confirmChange.data.profileUpdated
                        ? 'text-[#245949]'
                        : 'text-[#8a452d]'
                    }`}
                  >
                    {confirmChange.data.profileUpdated
                      ? 'Safety profile updated'
                      : 'Profile unchanged'}
                  </strong>
                  <p className="mt-1 text-xs text-[#587168]">
                    {reasonLabel(confirmChange.data.reasonCode)} · profile version v
                    {confirmChange.data.profileVersion}
                  </p>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-[#183f35] text-white">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">
                    Safety profile changelog
                  </span>
                  <h2 className="mt-1 text-2xl font-black">Household profile change history</h2>
                </div>
                <div className="flex gap-2 text-center text-[10px]">
                  <span className="rounded-xl bg-white/[.07] px-3 py-2 text-white/55">
                    Pending
                    <strong className="ml-2 text-white">
                      {audit.data.summary.pendingOwnerConfirmation}
                    </strong>
                  </span>
                  <span className="rounded-xl bg-white/[.07] px-3 py-2 text-white/55">
                    Confirmed
                    <strong className="ml-2 text-white">
                      {audit.data.summary.confirmed}
                    </strong>
                  </span>
                </div>
              </div>
              {audit.data.records.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="font-bold">No profile changes yet</p>
                  <p className="mt-2 text-sm text-white/50">
                    The complete review trail will appear here after a caregiver submits a request.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {audit.data.records.map((record) => (
                    <article className="px-6 py-5" key={record.auditId}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              record.decision === 'confirmed'
                                ? 'bg-[#78d5b9]/15 text-[#9de4cf]'
                                : record.decision === 'denied'
                                  ? 'bg-[#ff7b50]/15 text-[#ffb398]'
                                  : 'bg-[#e4c85b]/15 text-[#f1dc87]'
                            }`}
                          >
                            {record.decision === 'confirmed'
                              ? 'Confirmed'
                              : record.decision === 'denied'
                                ? 'Rejected'
                                : 'Pending'}
                          </span>
                          <span className="text-xs text-white/70">
                            {
                              household.data.members.find(
                                (member) => member.role === record.actorRole
                              )?.label
                            }
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-white/35">
                          v{record.profileVersion} ·{' '}
                          {record.auditId.slice(0, 8)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-bold">
                        {record.food} · {reasonLabel(record.reasonCode)}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        Confirmation evidence attached: {record.confirmationEvidence ? 'Yes' : 'No'}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
