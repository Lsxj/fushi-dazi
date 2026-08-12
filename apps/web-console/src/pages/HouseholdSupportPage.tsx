import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ListSupportCasesOutput,
  SupportCase,
  SupportCaseAuditRecord,
  UpdateSupportCaseInput,
} from '@fushi/contracts'
import { useMemo, useState } from 'react'

import { apiClient } from '../api/client'
import {
  isCloudBaseConsole,
  restoreCloudBaseOperatorSession,
  signInCloudBaseOperator,
  signOutCloudBaseOperator,
} from '../auth/cloudbase'
import type { RestoredCloudBaseOperatorSession } from '../auth/cloudbase'
import { Icon } from '../components/Icon'

const reasonLabels: Record<SupportCase['reason'], string> = {
  'unsafe-food-in-menu': '菜单出现疑似不安全食材',
  'ai-safety-warning-missing': 'AI 回答缺少安全提醒',
  'inventory-not-updated': '打卡后库存没有更新',
  'profile-not-refreshed': '档案变更后页面没有刷新',
  'request-cloud-data-deletion': '申请删除云端数据',
}

const statusLabels: Record<SupportCase['status'], string> = {
  new: '待认领',
  investigating: '调查中',
  escalated: '安全升级',
  resolved: '已解决',
  closed: '已关闭',
}

type Investigation = NonNullable<SupportCase['investigation']>
type InvestigationFinding = Investigation['finding']
type InvestigationEvidence = Investigation['evidence'][number]
type ResolutionCode = NonNullable<SupportCase['resolutionCode']>

const findingLabels: Record<InvestigationFinding, string> = {
  'confirmed-product-defect': '确认产品缺陷',
  'client-state-stale': '客户端状态未刷新',
  'working-as-designed': '规则按预期工作',
  'privacy-request-validated': '隐私请求已核验',
  'insufficient-evidence': '当前证据不足',
}

const evidenceLabels: Record<InvestigationEvidence, string> = {
  'diagnostic-context': '基础诊断上下文',
  'safety-trace-reference': '安全 Trace 引用',
  'profile-version-reference': '档案版本引用',
  'menu-date-reference': '菜单日期引用',
}

const resolutionLabels: Record<ResolutionCode, string> = {
  'fix-planned': '已确认问题，安排产品修复',
  'guidance-provided': '已向家长提供操作指导',
  'no-defect-found': '核验后未发现产品缺陷',
  'deletion-accepted': '已接受云端数据删除申请',
}

const categoryLabels: Record<SupportCase['category'], string> = {
  'menu-safety': '菜单安全',
  'ai-quality': 'AI 质量',
  'data-problem': '数据问题',
  'privacy-request': '隐私请求',
}

const severityWeight: Record<SupportCase['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const auditActionLabels: Record<SupportCaseAuditRecord['action'], string> = {
  'case-created': '家长提交工单',
  'case-assigned': '支持人员认领',
  'case-investigation-recorded': '保存调查结论',
  'case-escalated': '升级安全审核',
  'case-resolved': '记录解决结论',
  'case-closed': '关闭工单',
}

function getActiveSla(
  supportCase: SupportCase,
  queue: ListSupportCasesOutput
): { breached: boolean; label: string; tone: 'healthy' | 'warning' | 'breached' } | undefined {
  if (supportCase.status === 'resolved' || supportCase.status === 'closed') return undefined
  const isFirstResponse = supportCase.status === 'new'
  const target = queue.slaPolicy[supportCase.severity]
  const targetMinutes = isFirstResponse ? target.firstResponseMinutes : target.resolutionMinutes
  const dueAtMs = new Date(supportCase.createdAt).getTime() + targetMinutes * 60_000
  const remainingMinutes = Math.ceil(
    (dueAtMs - new Date(queue.evaluatedAt).getTime()) / 60_000
  )
  const breached = remainingMinutes < 0
  const warning = !breached && remainingMinutes <= Math.max(15, Math.ceil(targetMinutes * 0.25))
  return {
    breached,
    label: breached ? 'SLA 已超时' : warning ? 'SLA 即将超时' : 'SLA 正常',
    tone: breached ? 'breached' : warning ? 'warning' : 'healthy',
  }
}

function availableEvidenceFor(
  supportCase: SupportCase,
  hasLinkedTrace: boolean
): InvestigationEvidence[] {
  const evidence: InvestigationEvidence[] = ['diagnostic-context']
  if (hasLinkedTrace) evidence.push('safety-trace-reference')
  if (supportCase.context.profileVersion) evidence.push('profile-version-reference')
  if (supportCase.context.menuDate) evidence.push('menu-date-reference')
  return evidence
}

export function HouseholdSupportPage() {
  const queryClient = useQueryClient()
  const cloudConsole = isCloudBaseConsole()
  const [selectedCaseId, setSelectedCaseId] = useState<string>()
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [severityFilter, setSeverityFilter] = useState<'all' | SupportCase['severity']>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupportCase['category']>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [finding, setFinding] = useState<InvestigationFinding>('confirmed-product-defect')
  const [resolutionCode, setResolutionCode] = useState<ResolutionCode>('fix-planned')
  const [operatorIdentifier, setOperatorIdentifier] = useState('')
  const [operatorPassword, setOperatorPassword] = useState('')
  const session = useQuery<RestoredCloudBaseOperatorSession>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      if (cloudConsole) {
        return restoreCloudBaseOperatorSession(() => apiClient.auth.session({}))
      }
      return apiClient.auth.session({})
    },
  })
  const cases = useQuery({
    queryKey: ['support', 'cases'],
    queryFn: () => apiClient.support.cases({}),
    enabled: session.data?.authenticated === true,
  })
  const traces = useQuery({
    queryKey: ['observability', 'traces'],
    queryFn: () => apiClient.observability.traces({}),
    enabled: session.data?.authenticated === true,
  })
  const visibleCases = useMemo(
    () => {
      const normalizedSearch = searchQuery.trim().toLocaleLowerCase('zh-CN')
      return (cases.data?.cases ?? [])
        .filter((supportCase) => {
          const isActive = supportCase.status !== 'closed'
          const searchable = [
            supportCase.caseId,
            supportCase.context.clientVersion,
            reasonLabels[supportCase.reason],
          ].join(' ').toLocaleLowerCase('zh-CN')
          return (
            (statusFilter === 'all' || isActive) &&
            (severityFilter === 'all' || supportCase.severity === severityFilter) &&
            (categoryFilter === 'all' || supportCase.category === categoryFilter) &&
            (!normalizedSearch || searchable.includes(normalizedSearch))
          )
        })
        .sort((left, right) => {
          const leftSla = cases.data ? getActiveSla(left, cases.data) : undefined
          const rightSla = cases.data ? getActiveSla(right, cases.data) : undefined
          const breachDifference = Number(rightSla?.breached) - Number(leftSla?.breached)
          if (breachDifference !== 0) return breachDifference
          const severityDifference = severityWeight[right.severity] - severityWeight[left.severity]
          if (severityDifference !== 0) return severityDifference
          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        })
    }, [cases.data, categoryFilter, searchQuery, severityFilter, statusFilter]
  )
  const selectedCase =
    visibleCases.find((supportCase) => supportCase.caseId === selectedCaseId) ??
    visibleCases[0]
  const selectedCaseAudits = useMemo(
    () =>
      (cases.data?.auditRecords ?? [])
        .filter((record) => record.caseId === selectedCase?.caseId)
        .sort(
          (left, right) =>
            new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
        ),
    [cases.data?.auditRecords, selectedCase?.caseId]
  )
  const linkedTrace = traces.data?.traces.find(
    (trace) => trace.traceId === selectedCase?.context.traceId
  )
  const availableEvidence = selectedCase
    ? availableEvidenceFor(selectedCase, Boolean(linkedTrace))
    : []
  const availableResolutionCodes: ResolutionCode[] =
    selectedCase?.category === 'privacy-request'
      ? ['deletion-accepted']
      : ['fix-planned', 'guidance-provided', 'no-defect-found']
  const selectedResolutionCode = availableResolutionCodes.includes(resolutionCode)
    ? resolutionCode
    : availableResolutionCodes[0]

  const updateCase = useMutation({
    mutationFn: (input: UpdateSupportCaseInput) =>
      apiClient.support.updateCase(input),
    onSuccess: () => cases.refetch(),
  })
  const demoLogin = useMutation({
    mutationFn: (operatorId: 'demo-support-agent' | 'demo-safety-reviewer') =>
      apiClient.auth.demoLogin({ operatorId }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['auth', 'session'], data)
      await Promise.all([cases.refetch(), traces.refetch()])
    },
  })
  const cloudLogin = useMutation({
    mutationFn: async () => {
      await signInCloudBaseOperator(operatorIdentifier, operatorPassword)
      const data = await apiClient.auth.session({})
      if (!data.authenticated) {
        await signOutCloudBaseOperator()
        throw new Error('CloudBase 登录成功，但当前账号没有后台访问权限')
      }
      return data
    },
    onSuccess: async (data) => {
      setOperatorPassword('')
      queryClient.setQueryData(['auth', 'session'], data)
      await Promise.all([cases.refetch(), traces.refetch()])
    },
  })
  const logout = useMutation({
    mutationFn: async () => {
      if (session.data?.identityMode === 'cloudbase-access-token') {
        await signOutCloudBaseOperator()
        return {
          authenticated: false as const,
          identityMode: 'cloudbase-access-token' as const,
          sessionTransport: 'bearer-access-token' as const,
        }
      }
      return apiClient.auth.logout({})
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'session'], data)
      queryClient.removeQueries({ queryKey: ['support', 'cases'] })
    },
  })

  function runAction(
    action: 'assign-self' | 'escalate' | 'close',
    supportCase: SupportCase
  ) {
    updateCase.mutate({
      action,
      caseId: supportCase.caseId,
      expectedCaseVersion: supportCase.caseVersion,
    })
  }

  function resolve(supportCase: SupportCase) {
    const availableResolutions: ResolutionCode[] =
      supportCase.category === 'privacy-request'
        ? ['deletion-accepted']
        : ['fix-planned', 'guidance-provided', 'no-defect-found']
    const selectedResolution = availableResolutions.includes(resolutionCode)
      ? resolutionCode
      : availableResolutions[0]
    updateCase.mutate({
      action: 'resolve',
      caseId: supportCase.caseId,
      expectedCaseVersion: supportCase.caseVersion,
      resolutionCode: selectedResolution,
    })
  }

  function recordInvestigation(supportCase: SupportCase) {
    updateCase.mutate({
      action: 'record-investigation',
      caseId: supportCase.caseId,
      expectedCaseVersion: supportCase.caseVersion,
      finding,
      evidence: availableEvidenceFor(supportCase, Boolean(linkedTrace)),
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <header className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="shield" size={14} /> Support case workspace
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            家庭支持工单
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            处理家长主动授权提交的脱敏问题。后台可以认领、调查和升级工单，但不能代替家长修改过敏档案。
          </p>
        </div>
        <div className="rounded-2xl border border-[#d7a58f]/35 bg-[#fff0e8] px-4 py-3 text-xs leading-5 text-[#8a452d]">
          <strong className="block">{cases.data?.privacyMode ?? 'metadata-only'}</strong>
          不接收宝宝姓名、自由备注或完整聊天记录
        </div>
      </header>

      {session.isPending && (
        <div className="mt-8 h-48 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
      )}
      {session.isError && (
        <section className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">管理员会话加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">无法确认身份时，不加载工单也不允许执行操作。</p>
        </section>
      )}
      {session.data && !session.data.authenticated && (
        <section className="mt-8 rounded-[1.8rem] border border-black/8 bg-white/75 p-6 sm:p-8">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
            {session.data.identityMode === 'cloudbase-access-token'
              ? 'CloudBase operator authentication'
              : 'Local demo authentication'}
          </span>
          <h2 className="mt-2 text-2xl font-black text-[#183f35]">登录内部运营工作台</h2>
          {session.data.identityMode === 'cloudbase-access-token' ? (
            <form
              className="mt-5 grid max-w-md gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                cloudLogin.mutate()
              }}
            >
              <p className="text-sm leading-6 text-[#68756e]">
                使用已加入管理员白名单的 CloudBase 账号登录。账号身份和角色均由服务端校验，前端不能自行选择角色。
              </p>
              {session.data.recoveryNotice && (
                <p className="rounded-xl bg-[#fff0e8] px-4 py-3 text-sm font-semibold text-[#8a452d]">
                  {session.data.recoveryNotice}
                </p>
              )}
              <label className="grid gap-1.5 text-xs font-bold text-[#516159]">
                管理员邮箱或用户名
                <input
                  autoComplete="username"
                  className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[#183f35] outline-none focus:border-[#5a8e7e]"
                  onChange={(event) => setOperatorIdentifier(event.target.value)}
                  required
                  value={operatorIdentifier}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-[#516159]">
                密码
                <input
                  autoComplete="current-password"
                  className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[#183f35] outline-none focus:border-[#5a8e7e]"
                  onChange={(event) => setOperatorPassword(event.target.value)}
                  required
                  type="password"
                  value={operatorPassword}
                />
              </label>
              <button
                className="w-fit rounded-xl bg-[#183f35] px-5 py-3 text-xs font-black text-white disabled:opacity-50"
                disabled={cloudLogin.isPending}
                type="submit"
              >
                {cloudLogin.isPending ? '正在验证…' : '登录后台'}
              </button>
              {cloudLogin.isError && (
                <p className="text-xs font-bold text-[#b45336]">
                  {cloudLogin.error instanceof Error
                    ? cloudLogin.error.message
                    : '登录失败，请检查登录方式和账号配置'}
                </p>
              )}
            </form>
          ) : (
            <>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68756e]">
                这是本地演示身份目录，不是生产账号系统。登录后由服务端 HttpOnly Cookie 决定操作者和角色，前端不能在工单请求中伪造 actor。
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-xl bg-[#183f35] px-4 py-3 text-xs font-black text-white"
                  disabled={demoLogin.isPending}
                  onClick={() => demoLogin.mutate('demo-support-agent')}
                  type="button"
                >
                  使用支持人员身份登录
                </button>
                <button
                  className="rounded-xl border border-[#183f35]/15 bg-white px-4 py-3 text-xs font-black text-[#183f35]"
                  disabled={demoLogin.isPending}
                  onClick={() => demoLogin.mutate('demo-safety-reviewer')}
                  type="button"
                >
                  使用安全审核人身份登录
                </button>
              </div>
              {demoLogin.isError && (
                <p className="mt-3 text-xs font-bold text-[#b45336]">
                  登录失败，请确认 API Server 已启动。
                </p>
              )}
            </>
          )}
        </section>
      )}

      {session.data?.authenticated && cases.isPending && (
        <div className="mt-8 h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
      )}
      {session.data?.authenticated && cases.isError && (
        <section className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">支持工单加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            连接失败时不展示旧工单，也不允许执行状态变更。
          </p>
        </section>
      )}

      {cases.data && (
        <>
          <section aria-label="工单摘要" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['未关闭', visibleCases.length, '包含待处理与已解决'],
              ['待认领', cases.data.summary.unassigned, '需要支持人员处理'],
              ['关键安全', cases.data.summary.criticalOpen, '必须由安全审核人解决'],
              ['SLA 超时', cases.data.summary.slaBreached, '需要优先介入'],
            ].map(([label, value, hint]) => (
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5" key={label}>
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">{label}</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{value}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">{hint}</span>
              </article>
            ))}
          </section>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/65 p-3">
            <div className="flex rounded-xl bg-[#edf0eb] p-1">
              {(['active', 'all'] as const).map((filter) => (
                <button
                  className={`rounded-lg px-3 py-2 text-xs font-bold ${statusFilter === filter ? 'bg-white text-[#183f35] shadow-sm' : 'text-[#6f7b74]'}`}
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  type="button"
                >
                  {filter === 'active' ? '未关闭' : '全部'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#68756e]">
              <span>服务端会话：</span>
              <strong className="text-[#183f35]">
                {session.data?.operator?.role === 'support-agent' ? '支持人员' : '安全审核人'}
              </strong>
              <button
                className="rounded-xl border border-black/8 bg-white px-3 py-2 font-bold text-[#183f35]"
                onClick={() => logout.mutate()}
                type="button"
              >
                退出登录
              </button>
              <span className="hidden text-[#a06b50] sm:inline">{cases.data.identityMode}</span>
            </div>
          </div>

          <section aria-label="队列分诊筛选" className="mt-3 grid gap-3 rounded-2xl border border-black/8 bg-white/65 p-3 md:grid-cols-[1.5fr_repeat(2,1fr)_auto]">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]">
              搜索工单
              <input
                className="rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-[#183f35] outline-none focus:border-[#5a8e7e]"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Case ID、问题或客户端版本"
                type="search"
                value={searchQuery}
              />
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]">
              严重级别
              <select className="rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-[#183f35]" onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)} value={severityFilter}>
                <option value="all">全部级别</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]">
              问题类型
              <select className="rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-[#183f35]" onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)} value={categoryFilter}>
                <option value="all">全部类型</option>
                {(Object.entries(categoryLabels) as [SupportCase['category'], string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button
              className="self-end rounded-xl border border-black/8 bg-white px-3 py-2.5 text-xs font-bold text-[#183f35] disabled:opacity-35"
              disabled={!searchQuery && severityFilter === 'all' && categoryFilter === 'all'}
              onClick={() => {
                setSearchQuery('')
                setSeverityFilter('all')
                setCategoryFilter('all')
              }}
              type="button"
            >
              清除筛选
            </button>
          </section>

          {visibleCases.length === 0 ? (
            <section className="mt-6 rounded-[1.8rem] border border-dashed border-black/15 bg-white/55 px-6 py-16 text-center">
              <h2 className="font-black text-[#183f35]">没有符合条件的工单</h2>
              <p className="mt-2 text-sm text-[#68756e]">调整筛选条件，或等待家长明确授权提交新的诊断元数据。</p>
            </section>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
              <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-white/75">
                <div className="border-b border-black/8 px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Operations queue</span>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <h2 className="text-xl font-black text-[#183f35]">未关闭队列</h2>
                    <span className="text-xs font-bold text-[#7a867f]">显示 {visibleCases.length} 条</span>
                  </div>
                </div>
                <div className="divide-y divide-black/8">
                  {visibleCases.map((supportCase) => (
                    <button
                      className={`block w-full px-5 py-4 text-left transition ${selectedCase?.caseId === supportCase.caseId ? 'bg-[#edf3ef]' : 'hover:bg-black/[.025]'}`}
                      key={supportCase.caseId}
                      onClick={() => setSelectedCaseId(supportCase.caseId)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${supportCase.severity === 'critical' ? 'bg-[#ffe3d8] text-[#9b472c]' : 'bg-[#e4eee8] text-[#315f52]'}`}>
                          {supportCase.severity}
                        </span>
                        <span className="text-[10px] font-bold text-[#87928c]">{categoryLabels[supportCase.category]}</span>
                      </div>
                      <strong className="mt-3 block text-sm text-[#183f35]">{reasonLabels[supportCase.reason]}</strong>
                      <span className="mt-1 block text-xs text-[#7a867f]">{statusLabels[supportCase.status]}</span>
                      {(() => {
                        const sla = getActiveSla(supportCase, cases.data)
                        return sla ? (
                          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${sla.tone === 'breached' ? 'bg-[#ffe3d8] text-[#9b472c]' : sla.tone === 'warning' ? 'bg-[#fff1ca] text-[#8a661d]' : 'bg-[#e8eee9] text-[#547067]'}`}>
                            {sla.label}
                          </span>
                        ) : null
                      })()}
                    </button>
                  ))}
                </div>
              </section>

              {selectedCase && (
                <section className="rounded-[1.8rem] bg-[#183f35] p-6 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">Case detail</span>
                      <h2 className="mt-1 text-2xl font-black">{reasonLabels[selectedCase.reason]}</h2>
                    </div>
                    <span className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-black text-[#bce4d7]">{statusLabels[selectedCase.status]}</span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {[
                      ['问题类型', categoryLabels[selectedCase.category]],
                      ['发生时间', new Date(selectedCase.context.occurredAt).toLocaleString('zh-CN')],
                      ['菜单日期', selectedCase.context.menuDate ?? '未提供'],
                      ['负责人', selectedCase.assignedTo ?? '未认领'],
                    ].map(([label, value]) => (
                      <div className="rounded-2xl border border-white/10 bg-white/[.055] p-4" key={label}>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</span>
                        <strong className="mt-1 block text-sm">{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-[#91cdbb]/20 bg-[#91cdbb]/8 p-4 text-xs leading-5 text-white/60">
                    该工单只包含结构化诊断元数据。支持人员不能从这里修改过敏档案；关键安全问题必须升级并由安全审核人解决。
                  </div>

                  <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#91cdbb]">Case timeline</span>
                    <h3 className="mt-1 text-base font-black">处理时间线</h3>
                    <ol className="mt-4 space-y-3">
                      {selectedCaseAudits.map((record) => (
                        <li className="grid grid-cols-[10px_1fr] gap-3" key={record.auditId}>
                          <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${record.decision === 'allowed' ? 'bg-[#78d5b9]' : 'bg-[#ff9d7c]'}`} />
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong className="text-xs">{auditActionLabels[record.action]}</strong>
                              <time className="text-[10px] text-white/35">{new Date(record.timestamp).toLocaleString('zh-CN')}</time>
                            </div>
                            <p className="mt-1 text-[10px] text-white/45">{record.decision === 'allowed' ? '已执行' : '操作被安全规则拒绝'}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <details className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-white/55">
                    <summary className="cursor-pointer font-bold text-white/70">技术详情</summary>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div><dt className="text-white/35">Case ID</dt><dd className="mt-1 font-mono">{selectedCase.caseId}</dd></div>
                      <div><dt className="text-white/35">Case version</dt><dd className="mt-1">v{selectedCase.caseVersion}</dd></div>
                      <div><dt className="text-white/35">客户端</dt><dd className="mt-1">{selectedCase.context.clientVersion}</dd></div>
                      <div><dt className="text-white/35">档案版本</dt><dd className="mt-1">{selectedCase.context.profileVersion ? `v${selectedCase.context.profileVersion}` : '未提供'}</dd></div>
                    </dl>
                  </details>

                  {(selectedCase.status === 'investigating' || selectedCase.status === 'escalated') && (
                    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#91cdbb]">Investigation workspace</span>
                      <h3 className="mt-1 text-base font-black">结构化调查记录</h3>

                      <div className="mt-4 rounded-xl bg-black/10 p-3 text-xs leading-5 text-white/65">
                        {selectedCase.context.traceId ? (
                          linkedTrace ? (
                            <span>Trace {linkedTrace.traceId.slice(0, 8)} · {linkedTrace.status} · {linkedTrace.decisionSource}</span>
                          ) : (
                            <span>工单提供了 Trace {selectedCase.context.traceId.slice(0, 8)}，但当前运行实例中未找到对应摘要。</span>
                          )
                        ) : (
                          <span>家长未提供 Trace ID；不能把 Trace 作为本次调查证据。</span>
                        )}
                      </div>

                      {selectedCase.investigation && (
                        <div className="mt-3 rounded-xl border border-[#78d5b9]/25 bg-[#78d5b9]/10 p-3 text-xs leading-5 text-white/75">
                          <strong className="block text-[#bce4d7]">已保存：{findingLabels[selectedCase.investigation.finding]}</strong>
                          {selectedCase.investigation.evidence.map((item) => evidenceLabels[item]).join('、')}
                        </div>
                      )}

                      <label className="mt-4 block text-xs font-bold text-white/70" htmlFor="investigation-finding">调查结论</label>
                      <select
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#214d42] px-3 py-2.5 text-sm text-white"
                        id="investigation-finding"
                        onChange={(event) => setFinding(event.target.value as InvestigationFinding)}
                        value={finding}
                      >
                        {(Object.entries(findingLabels) as [InvestigationFinding, string][]).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>

                      <div className="mt-4">
                        <span className="text-xs font-bold text-white/70">系统自动带入可核验证据</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableEvidence.map((item) => (
                            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/65" key={item}>{evidenceLabels[item]}</span>
                          ))}
                        </div>
                      </div>

                      <button
                        className="mt-4 rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={updateCase.isPending}
                        onClick={() => recordInvestigation(selectedCase)}
                        type="button"
                      >
                        {selectedCase.investigation ? '更新调查结论' : '保存调查结论'}
                      </button>
                    </section>
                  )}

                  {selectedCase.investigation &&
                    (selectedCase.status === 'investigating' || selectedCase.status === 'escalated') && (
                      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                        <label className="text-xs font-bold text-white/70" htmlFor="resolution-code">解决结论</label>
                        <select
                          className="mt-2 w-full rounded-xl border border-white/10 bg-[#214d42] px-3 py-2.5 text-sm text-white"
                          id="resolution-code"
                          onChange={(event) => setResolutionCode(event.target.value as ResolutionCode)}
                          value={selectedResolutionCode}
                        >
                          {availableResolutionCodes.map((code) => (
                            <option key={code} value={code}>{resolutionLabels[code]}</option>
                          ))}
                        </select>
                        {selectedCase.investigation.finding === 'insufficient-evidence' && (
                          <p className="mt-3 text-xs font-bold text-[#ffb398]">当前结论为“证据不足”，需要继续调查并更新结论后才能解决工单。</p>
                        )}
                      </section>
                    )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {selectedCase.status === 'new' && (
                      <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:opacity-40" disabled={updateCase.isPending} onClick={() => runAction('assign-self', selectedCase)} type="button">认领并开始调查</button>
                    )}
                    {selectedCase.status === 'investigating' && (
                      <>
                        <button className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black disabled:opacity-40" disabled={updateCase.isPending} onClick={() => runAction('escalate', selectedCase)} type="button">升级安全审核</button>
                        {selectedCase.severity !== 'critical' && selectedCase.investigation && selectedCase.investigation.finding !== 'insufficient-evidence' && (
                          <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:opacity-40" disabled={updateCase.isPending} onClick={() => resolve(selectedCase)} type="button">记录解决结论</button>
                        )}
                      </>
                    )}
                    {selectedCase.status === 'escalated' && selectedCase.investigation && selectedCase.investigation.finding !== 'insufficient-evidence' && (
                      <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:opacity-40" disabled={updateCase.isPending} onClick={() => resolve(selectedCase)} type="button">安全复核并解决</button>
                    )}
                    {selectedCase.status === 'resolved' && (
                      <button className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black disabled:opacity-40" disabled={updateCase.isPending} onClick={() => runAction('close', selectedCase)} type="button">关闭工单</button>
                    )}
                  </div>
                  {updateCase.data?.result && updateCase.data.result !== 'updated' && (
                    <p className="mt-3 text-xs font-bold text-[#ffb398]">操作被拒绝：{updateCase.data.result}</p>
                  )}
                  {updateCase.isError && (
                    <p className="mt-3 text-xs font-bold text-[#ffb398]">状态更新失败，请刷新后重试。</p>
                  )}
                </section>
              )}
            </div>
          )}

        </>
      )}
    </div>
  )
}
