import type {
  HouseholdRole,
  RequestAllergyChangeOutput,
} from '@fushi/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'

const actorByRole: Record<HouseholdRole, string> = {
  'primary-caregiver': 'demo-primary-caregiver',
  caregiver: 'demo-caregiver',
  viewer: 'demo-viewer',
}

const roleDescriptions: Record<HouseholdRole, string> = {
  'primary-caregiver': '管理成员，并确认永久安全档案变更',
  caregiver: '记录饮食和反应，提交档案变更申请',
  viewer: '只能查看菜单和安全档案',
}

function reasonLabel(reasonCode: string): string {
  const labels: Record<string, string> = {
    'identity-role-mismatch': '家庭成员身份与角色不一致',
    'role-not-authorized': '只读家人不能提交档案变更',
    'reaction-not-found': '关联的反应记录不存在',
    'pending-request-exists': '该食材已有待确认申请',
    'already-allergic': '该食材已经标记为永久过敏',
    'profile-version-conflict': '安全档案已被其他照护人更新，请重新核对',
    'owner-confirmation-required': '等待主照护人确认',
    'owner-role-required': '只有主照护人可以确认',
    'invalid-request': '申请不存在或已经处理',
    'explicit-confirmation-required': '必须明确确认不可逆变更',
    'allergy-profile-updated': '安全档案已经更新',
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
        justification: '进食后出现已记录反应，申请更新安全档案',
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
            Multi-caregiver safety workflow
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            家庭协作与安全档案
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            老人或保姆发现进食反应后，可以提交档案变更申请；永久过敏标记必须由主照护人结合反应记录明确确认，避免多人照护时误改安全信息。
          </p>
        </div>
        <div className="rounded-2xl border border-[#d7a58f]/35 bg-[#fff0e8] px-4 py-3 text-xs leading-5 text-[#8a452d]">
          <strong className="block">
            {household.data?.persistenceMode === 'local-file'
              ? '本地持久化合成数据'
              : '合成家庭数据'}
          </strong>
          不包含真实宝宝信息；本地文件模式可跨服务重启恢复。
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
          <h2 className="font-black text-[#8a452d]">家庭协作服务加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            请确认 API Server 已启动，然后刷新页面。
          </p>
        </div>
      )}

      {household.data && audit.data && menuPreview.data && (
        <>
          <section
            aria-label="档案状态"
            className="mt-8 grid gap-4 sm:grid-cols-3"
          >
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                家庭成员
              </span>
              <strong className="mt-3 block text-3xl font-black text-[#183f35]">
                {household.data.members.length}
              </strong>
              <span className="mt-2 block text-xs text-[#7a867f]">
                主照护人 · 共同照护人 · 只读家人
              </span>
            </article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                鳕鱼档案状态
              </span>
              <strong
                className={`mt-3 block text-2xl font-black ${
                  foodState?.state === 'allergic'
                    ? 'text-[#b64f31]'
                    : 'text-[#183f35]'
                }`}
              >
                {foodState?.state === 'allergic' ? '永久过敏' : '已确认正常'}
              </strong>
              <span className="mt-2 block text-xs text-[#7a867f]">
                由家庭安全档案统一约束后续菜单
              </span>
            </article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                档案版本
              </span>
              <strong className="mt-3 block font-mono text-3xl font-black text-[#183f35]">
                v{household.data.profileVersion}
              </strong>
              <span className="mt-2 block text-xs text-[#7a867f]">
                每次确认变更后递增，便于冲突检测
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
                  今日菜单受安全档案约束
                </h2>
                <p className="mt-2 text-sm text-[#68756e]">
                  使用档案 v{menuPreview.data.profileVersion} 重新计算；申请待确认时菜单不变，确认后立即排除过敏食材。
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
                    {meal.slot === 'breakfast' ? '早餐' : '午餐'}
                  </span>
                  <h3 className="mt-2 text-lg font-black text-[#183f35]">
                    {meal.recipeName}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-[#7a867f]">
                    {meal.ingredients.join(' · ')}
                  </p>
                </article>
              ))}
            </div>
            <div className="border-t border-black/8 px-6 py-5">
              {menuPreview.data.exclusions.length === 0 ? (
                <p className="text-sm font-bold text-[#315f52]">
                  当前候选均通过家庭安全档案校验。
                </p>
              ) : (
                menuPreview.data.exclusions.map((exclusion) => (
                  <div
                    className="rounded-2xl border border-[#d87b5d]/25 bg-[#fff0e8] p-4"
                    key={exclusion.recipeId}
                  >
                    <strong className="text-sm text-[#8a452d]">
                      已排除：{exclusion.recipeName}
                    </strong>
                    <p className="mt-1 text-xs leading-5 text-[#8a604f]">
                      {exclusion.reason} · 规则 {exclusion.rule} · 已替换为不含
                      {exclusion.blockedFood} 的候选
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
                谁正在操作？
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
                        {member.label}
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
                      已记录进食反应
                    </h3>
                    <p className="mt-1 text-xs text-[#7a867f]">
                      鳕鱼 · reaction-demo-001 · 合成演示记录
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#183f35] p-5 text-white">
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-[#183f35]">
                      2
                    </span>
                    <div>
                      <h3 className="text-sm font-black">提交过敏档案变更</h3>
                      <p className="mt-1 text-xs leading-5 text-white/55">
                        当前角色：{household.data.members.find(
                          (member) => member.role === role
                        )?.label}
                        。申请不会立即改变档案。
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
                    提交变更申请 <Icon name="arrow" size={16} />
                  </button>
                </div>
              </div>

              {requestChange.isError && (
                <p className="mt-4 rounded-xl bg-[#fff0e8] p-3 text-sm text-[#8a452d]">
                  变更申请暂时无法提交，请重试。
                </p>
              )}

              {changeResult?.decision === 'denied' && (
                <div className="mt-4 rounded-2xl border border-[#d87b5d]/25 bg-[#fff0e8] p-4">
                  <strong className="text-sm text-[#8a452d]">申请未提交</strong>
                  <p className="mt-1 text-xs text-[#8a604f]">
                    {reasonLabel(changeResult.reasonCode)} · 审计记录{' '}
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
                        等待主照护人确认
                      </strong>
                      <p className="mt-1 text-xs leading-5 text-[#7d6b35]">
                        申请已关联反应记录，但永久过敏会影响所有后续菜单，必须由主照护人确认。
                      </p>
                    </div>
                  </div>

                  {role !== 'primary-caregiver' ? (
                    <button
                      className="mt-4 w-full rounded-xl border border-[#bfa34e]/30 bg-white/65 px-4 py-3 text-sm font-black text-[#705d24]"
                      onClick={() => chooseRole('primary-caregiver')}
                      type="button"
                    >
                      切换为主照护人审核
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
                          我已核对 reaction-demo-001，并明确确认将鳕鱼永久标记为过敏
                        </span>
                      </label>
                      <button
                        className="mt-3 w-full rounded-xl bg-[#183f35] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!consented || confirmChange.isPending}
                        onClick={() => confirmChange.mutate()}
                        type="button"
                      >
                        确认并更新安全档案
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
                      ? '安全档案已更新'
                      : '档案未改变'}
                  </strong>
                  <p className="mt-1 text-xs text-[#587168]">
                    {reasonLabel(confirmChange.data.reasonCode)} · 档案版本 v
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
                  <h2 className="mt-1 text-2xl font-black">家庭档案变更记录</h2>
                </div>
                <div className="flex gap-2 text-center text-[10px]">
                  <span className="rounded-xl bg-white/[.07] px-3 py-2 text-white/55">
                    待确认
                    <strong className="ml-2 text-white">
                      {audit.data.summary.pendingOwnerConfirmation}
                    </strong>
                  </span>
                  <span className="rounded-xl bg-white/[.07] px-3 py-2 text-white/55">
                    已确认
                    <strong className="ml-2 text-white">
                      {audit.data.summary.confirmed}
                    </strong>
                  </span>
                </div>
              </div>
              {audit.data.records.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="font-bold">还没有档案变更</p>
                  <p className="mt-2 text-sm text-white/50">
                    共同照护人提交申请后，这里会显示完整处理过程。
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
                              ? '已确认'
                              : record.decision === 'denied'
                                ? '已拒绝'
                                : '待确认'}
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
                        关联确认凭证：{record.confirmationEvidence ? '是' : '否'}
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
