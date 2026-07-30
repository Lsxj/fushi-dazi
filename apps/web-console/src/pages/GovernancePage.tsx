import type {
  GovernanceRole,
  RequestGovernedActionOutput,
} from '@fushi/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'

const demoActors: Record<GovernanceRole, string> = {
  viewer: 'demo-viewer',
  operator: 'demo-operator',
  'safety-admin': 'demo-safety-admin',
  auditor: 'demo-auditor',
}

const roleNotes: Record<GovernanceRole, string> = {
  viewer: '只能查看安全报告',
  operator: '负责日常业务操作',
  'safety-admin': '可申请安全敏感操作',
  auditor: '可读取与导出审计记录',
}

function reasonLabel(reasonCode: string): string {
  const labels: Record<string, string> = {
    'role-not-authorized': '当前角色没有此权限',
    'identity-role-mismatch': '演示身份与角色绑定不一致',
    'explicit-confirmation-required': '需要操作者显式确认',
    'explicit-confirmation-recorded': '已记录显式确认',
    'invalid-or-expired-token': '确认令牌无效或已过期',
    'actor-mismatch': '申请人与确认人不一致',
  }
  return labels[reasonCode] ?? reasonCode
}

export function GovernancePage() {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<GovernanceRole>('viewer')
  const [challenge, setChallenge] =
    useState<RequestGovernedActionOutput | null>(null)
  const [consented, setConsented] = useState(false)
  const policy = useQuery({
    queryKey: ['governance', 'policy'],
    queryFn: () => apiClient.governance.policy({}),
  })
  const audit = useQuery({
    queryKey: ['governance', 'audit'],
    queryFn: () => apiClient.governance.audit({}),
  })

  const requestAction = useMutation({
    mutationFn: () =>
      apiClient.governance.requestAction({
        actor: {
          id: demoActors[role],
          role,
        },
        action: 'profile.mark-allergic',
        resource: {
          type: 'demo-profile',
          id: 'demo-profile-001',
        },
        evidence: {
          reactionId: 'reaction-demo-001',
        },
        justification: '根据已记录反应申请永久过敏标记',
      }),
    onSuccess: (result) => {
      setChallenge(result)
      setConsented(false)
      void queryClient.invalidateQueries({
        queryKey: ['governance', 'audit'],
      })
    },
  })

  const confirmAction = useMutation({
    mutationFn: () =>
      apiClient.governance.confirmAction({
        actor: {
          id: demoActors[role],
          role,
        },
        confirmationToken: challenge?.confirmationToken ?? '',
        consentToConfirmIrreversible: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['governance', 'audit'],
      })
    },
  })

  function selectRole(nextRole: GovernanceRole) {
    setRole(nextRole)
    setChallenge(null)
    setConsented(false)
    requestAction.reset()
    confirmAction.reset()
  }

  const isLoading = policy.isPending || audit.isPending
  const isError = policy.isError || audit.isError

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
          <Icon name="shield" size={14} />
          Enterprise governance
        </div>
        <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
          权限与审计控制台
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
          用确定性 RBAC、一次性确认令牌与元数据审计，演示安全敏感操作如何进入企业治理流程。
          这里是 Policy Decision Point，不是档案写入服务。
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ['Identity provider', 'mock-demo'],
          ['Execution mode', 'simulation'],
          ['External mutation', 'false'],
        ].map(([label, value]) => (
          <div
            className="rounded-2xl border border-[#d7a58f]/35 bg-[#fff0e8] px-4 py-3"
            key={label}
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a6a56]">
              {label}
            </span>
            <strong className="mt-1 block font-mono text-sm text-[#7a3e2a]">
              {value}
            </strong>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
          <div className="h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
        </div>
      )}

      {isError && (
        <div className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">治理服务加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            请确认 API Server 已启动，然后刷新页面。
          </p>
        </div>
      )}

      {policy.data && audit.data && (
        <div className="mt-8 grid gap-6 xl:grid-cols-[.92fr_1.08fr]">
          <section className="rounded-[1.8rem] border border-black/8 bg-white/75 p-6">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
              Mock identity context
            </span>
            <h2 className="mt-1 text-2xl font-black text-[#183f35]">
              选择演示角色
            </h2>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {policy.data.roles.map((item) => {
                const selected = item.role === role
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-[#183f35] bg-[#e7eee9]'
                        : 'border-black/8 bg-[#f8f8f5] hover:border-[#183f35]/35'
                    }`}
                    key={item.role}
                    onClick={() => selectRole(item.role)}
                    type="button"
                  >
                    <span className="block text-sm font-black text-[#183f35]">
                      {item.label}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] text-[#718078]">
                      {item.role}
                    </span>
                    <span className="mt-2 block text-xs text-[#7a867f]">
                      {roleNotes[item.role]}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 rounded-2xl bg-[#183f35] p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/45">
                    Governed action
                  </span>
                  <h3 className="mt-1 font-black">永久过敏标记授权</h3>
                </div>
                <span className="rounded-full bg-[#ff7b50]/15 px-2.5 py-1 text-[10px] font-black text-[#ffb398]">
                  IRREVERSIBLE
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/55">
                demo-profile-001 · reaction-demo-001
                <br />
                本演示只评估权限与确认，不写入外部档案。
              </p>
              <button
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-[#183f35] transition enabled:hover:bg-[#eaf1ec] disabled:opacity-50"
                disabled={requestAction.isPending}
                onClick={() => requestAction.mutate()}
                type="button"
              >
                请求授权 <Icon name="arrow" size={16} />
              </button>
            </div>

            {requestAction.isError && (
              <p className="mt-4 rounded-xl bg-[#fff0e8] p-3 text-sm text-[#8a452d]">
                授权服务暂时不可用，请重试。
              </p>
            )}

            {challenge?.decision === 'denied' && (
              <div className="mt-4 rounded-2xl border border-[#d87b5d]/25 bg-[#fff0e8] p-4">
                <strong className="text-sm text-[#8a452d]">DENIED</strong>
                <p className="mt-1 text-xs text-[#8a604f]">
                  {reasonLabel(challenge.reasonCode)} · audit{' '}
                  {challenge.auditId.slice(0, 8)}
                </p>
              </div>
            )}

            {challenge?.decision === 'confirmation-required' && (
              <div className="mt-4 rounded-2xl border border-[#d1b35c]/30 bg-[#fff8de] p-4">
                <strong className="text-sm text-[#705d24]">
                  EXPLICIT CONFIRMATION REQUIRED
                </strong>
                <p className="mt-1 text-xs leading-5 text-[#7d6b35]">
                  令牌有效期 5 分钟且只能使用一次；确认人与申请人必须一致。
                </p>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#bfa34e]/25 bg-white/55 p-3">
                  <input
                    checked={consented}
                    className="mt-0.5 size-4 accent-[#183f35]"
                    onChange={(event) => setConsented(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-xs leading-5 text-[#66551f]">
                    我明确确认这是一项不可逆操作，并同意记录确认凭证
                  </span>
                </label>
                <button
                  className="mt-3 w-full rounded-xl bg-[#183f35] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!consented || confirmAction.isPending}
                  onClick={() => confirmAction.mutate()}
                  type="button"
                >
                  提交显式确认
                </button>
              </div>
            )}

            {confirmAction.data && (
              <div
                className={`mt-4 rounded-2xl border p-4 ${
                  confirmAction.data.decision === 'confirmed'
                    ? 'border-[#5da98c]/25 bg-[#e4f2ec]'
                    : 'border-[#d87b5d]/25 bg-[#fff0e8]'
                }`}
              >
                <strong className="text-sm text-[#245949]">
                  {confirmAction.data.decision.toUpperCase()}
                </strong>
                <p className="mt-1 text-xs text-[#587168]">
                  {reasonLabel(confirmAction.data.reasonCode)} · external
                  mutation: false
                </p>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-[#183f35] text-white">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">
                  Metadata-only audit
                </span>
                <h2 className="mt-1 text-2xl font-black">授权审计轨迹</h2>
              </div>
              <div className="flex gap-2 text-center">
                {[
                  ['Denied', audit.data.summary.denied],
                  ['Confirmed', audit.data.summary.confirmed],
                ].map(([label, value]) => (
                  <span
                    className="rounded-xl bg-white/[.07] px-3 py-2 text-[10px] text-white/55"
                    key={label}
                  >
                    {label}
                    <strong className="ml-2 text-white">{value}</strong>
                  </span>
                ))}
              </div>
            </div>
            {audit.data.records.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-white/50">
                运行一次授权请求后，这里会出现审计记录。
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
                          {record.decision.toUpperCase()}
                        </span>
                        <span className="font-mono text-xs text-white/70">
                          {record.actorRole}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-white/35">
                        {record.auditId.slice(0, 8)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-bold">
                      {record.action}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {reasonLabel(record.reasonCode)} · confirmation:{' '}
                      {String(record.confirmationEvidence)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
