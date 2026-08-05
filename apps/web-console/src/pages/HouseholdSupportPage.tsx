import { useMutation, useQuery } from '@tanstack/react-query'
import type { SupportCase, UpdateSupportCaseInput } from '@fushi/contracts'
import { useMemo, useState } from 'react'

import { apiClient } from '../api/client'
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

type Operator = UpdateSupportCaseInput['actor']

export function HouseholdSupportPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<string>()
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open')
  const [operator, setOperator] = useState<Operator>({
    id: 'demo-support-agent',
    role: 'support-agent',
  })
  const cases = useQuery({
    queryKey: ['support', 'cases'],
    queryFn: () => apiClient.support.cases({}),
  })
  const visibleCases = useMemo(
    () =>
      (cases.data?.cases ?? []).filter(
        (supportCase) =>
          statusFilter === 'all' ||
          (supportCase.status !== 'resolved' && supportCase.status !== 'closed')
      ),
    [cases.data?.cases, statusFilter]
  )
  const selectedCase =
    visibleCases.find((supportCase) => supportCase.caseId === selectedCaseId) ??
    visibleCases[0]

  const updateCase = useMutation({
    mutationFn: (input: UpdateSupportCaseInput) =>
      apiClient.support.updateCase(input),
    onSuccess: () => cases.refetch(),
  })

  function runAction(
    action: 'assign-self' | 'escalate' | 'close',
    supportCase: SupportCase
  ) {
    updateCase.mutate({
      action,
      caseId: supportCase.caseId,
      expectedCaseVersion: supportCase.caseVersion,
      actor: operator,
    })
  }

  function resolve(supportCase: SupportCase) {
    updateCase.mutate({
      action: 'resolve',
      caseId: supportCase.caseId,
      expectedCaseVersion: supportCase.caseVersion,
      actor: operator,
      resolutionCode:
        supportCase.category === 'privacy-request'
          ? 'deletion-accepted'
          : 'fix-planned',
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

      {cases.isPending && (
        <div className="mt-8 h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
      )}
      {cases.isError && (
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
              ['全部工单', cases.data.summary.total, '家庭主动提交'],
              ['待认领', cases.data.summary.unassigned, '需要支持人员处理'],
              ['关键安全', cases.data.summary.criticalOpen, '必须由安全审核人解决'],
              ['已升级', cases.data.summary.escalated, '等待安全复核'],
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
              {(['open', 'all'] as const).map((filter) => (
                <button
                  className={`rounded-lg px-3 py-2 text-xs font-bold ${statusFilter === filter ? 'bg-white text-[#183f35] shadow-sm' : 'text-[#6f7b74]'}`}
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  type="button"
                >
                  {filter === 'open' ? '处理中' : '全部'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#68756e]">
              <span>当前身份：</span>
              <button
                className="rounded-xl border border-black/8 bg-white px-3 py-2 font-bold text-[#183f35]"
                onClick={() =>
                  setOperator((current) =>
                    current.role === 'support-agent'
                      ? { id: 'demo-safety-reviewer', role: 'safety-reviewer' }
                      : { id: 'demo-support-agent', role: 'support-agent' }
                  )
                }
                type="button"
              >
                {operator.role === 'support-agent' ? '支持人员' : '安全审核人'} · 切换
              </button>
              <span className="hidden text-[#a06b50] sm:inline">{cases.data.identityMode}</span>
            </div>
          </div>

          {visibleCases.length === 0 ? (
            <section className="mt-6 rounded-[1.8rem] border border-dashed border-black/15 bg-white/55 px-6 py-16 text-center">
              <h2 className="font-black text-[#183f35]">当前没有待处理工单</h2>
              <p className="mt-2 text-sm text-[#68756e]">家长明确授权提交诊断元数据后，工单会进入这里。</p>
            </section>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
              <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-white/75">
                <div className="border-b border-black/8 px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Operations queue</span>
                  <h2 className="mt-1 text-xl font-black text-[#183f35]">待处理队列</h2>
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
                        <span className="font-mono text-[10px] text-[#87928c]">{supportCase.caseId.slice(0, 8)}</span>
                      </div>
                      <strong className="mt-3 block text-sm text-[#183f35]">{reasonLabels[supportCase.reason]}</strong>
                      <span className="mt-1 block text-xs text-[#7a867f]">{statusLabels[supportCase.status]} · v{supportCase.caseVersion}</span>
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
                      ['来源', selectedCase.source],
                      ['客户端', selectedCase.context.clientVersion],
                      ['发生时间', new Date(selectedCase.context.occurredAt).toLocaleString('zh-CN')],
                      ['菜单日期', selectedCase.context.menuDate ?? '未提供'],
                      ['档案版本', selectedCase.context.profileVersion ? `v${selectedCase.context.profileVersion}` : '未提供'],
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

                  <div className="mt-5 flex flex-wrap gap-2">
                    {selectedCase.status === 'new' && (
                      <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35]" onClick={() => runAction('assign-self', selectedCase)} type="button">认领并开始调查</button>
                    )}
                    {selectedCase.status === 'investigating' && (
                      <>
                        <button className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black" onClick={() => runAction('escalate', selectedCase)} type="button">升级安全审核</button>
                        {selectedCase.severity !== 'critical' && (
                          <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35]" onClick={() => resolve(selectedCase)} type="button">记录解决结论</button>
                        )}
                      </>
                    )}
                    {selectedCase.status === 'escalated' && (
                      <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35]" onClick={() => resolve(selectedCase)} type="button">安全复核并解决</button>
                    )}
                    {selectedCase.status === 'resolved' && (
                      <button className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black" onClick={() => runAction('close', selectedCase)} type="button">关闭工单</button>
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

          <section className="mt-6 rounded-[1.8rem] border border-black/8 bg-white/60 p-6">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Audit trail</span>
            <h2 className="mt-1 text-xl font-black text-[#183f35]">最近处理记录</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {cases.data.auditRecords.slice(0, 6).map((record) => (
                <article className="rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" key={record.auditId}>
                  <div className="flex justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]"><span>{record.action}</span><span>{record.decision}</span></div>
                  <p className="mt-2 text-sm font-bold text-[#183f35]">{record.actorRole} · {record.reasonCode}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#8a958f]">v{record.caseVersion} · {record.auditId.slice(0, 8)}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
