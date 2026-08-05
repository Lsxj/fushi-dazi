import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'

function decisionLabel(decision: string): string {
  if (decision === 'confirmed') return '家庭已确认'
  if (decision === 'denied') return '已拒绝'
  return '等待家庭确认'
}

export function HouseholdSupportPage() {
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
  const isPending = household.isPending || audit.isPending || menuPreview.isPending
  const isError = household.isError || audit.isError || menuPreview.isError

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <header className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="shield" size={14} /> Authorized support view
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">家庭支持与授权审计</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">内部人员只读查看档案版本、家庭授权结果和菜单影响，用于定位问题；不能在后台冒充照护人修改过敏档案。</p>
        </div>
        <div className="rounded-2xl border border-[#d7a58f]/35 bg-[#fff0e8] px-4 py-3 text-xs leading-5 text-[#8a452d]">
          <strong className="block">最小权限：只读支持</strong>
          当前为合成数据；生产环境还需工单授权与访问审计。
        </div>
      </header>

      {isPending && <div className="mt-8 h-96 animate-pulse rounded-[1.8rem] bg-black/[.055]" />}
      {isError && (
        <section className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">家庭支持数据加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">连接失败时不允许依赖旧快照做安全判断。</p>
        </section>
      )}

      {household.data && audit.data && menuPreview.data && (
        <>
          <section aria-label="家庭支持摘要" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">家庭成员</span><strong className="mt-3 block text-3xl font-black text-[#183f35]">{household.data.members.length}</strong><span className="mt-2 block text-xs text-[#7a867f]">仅展示角色，不展示联系方式</span></article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">待家庭确认</span><strong className="mt-3 block text-3xl font-black text-[#183f35]">{household.data.pendingRequests.length}</strong><span className="mt-2 block text-xs text-[#7a867f]">只能由主照护人处理</span></article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">档案版本</span><strong className="mt-3 block font-mono text-3xl font-black text-[#183f35]">v{household.data.profileVersion}</strong><span className="mt-2 block text-xs text-[#7a867f]">用于识别并发覆盖风险</span></article>
            <article className="rounded-3xl border border-black/8 bg-white/70 p-5"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">审计记录</span><strong className="mt-3 block text-3xl font-black text-[#183f35]">{audit.data.summary.total}</strong><span className="mt-2 block text-xs text-[#7a867f]">确认、拒绝和冲突均保留</span></article>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
            <section className="rounded-[1.8rem] border border-black/8 bg-white/75 p-6">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Profile & menu snapshot</span>
              <h2 className="mt-1 text-2xl font-black text-[#183f35]">当前安全档案影响</h2>
              <div className="mt-5 space-y-3">
                {household.data.foodStates.map((state) => (
                  <div className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" key={state.food}>
                    <strong className="text-sm text-[#183f35]">{state.food}</strong>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${state.state === 'allergic' ? 'bg-[#ffe3d8] text-[#9b472c]' : 'bg-[#dff1e9] text-[#28634f]'}`}>{state.state === 'allergic' ? '永久过敏' : '已确认正常'}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-[#183f35] p-5 text-white">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Deterministic menu impact</span>
                <p className="mt-2 text-sm leading-6 text-white/70">当前菜单使用档案 v{menuPreview.data.profileVersion}，由 {menuPreview.data.decisionSource} 生成；AI 不参与安全过滤。</p>
                <p className="mt-3 text-xs text-[#91cdbb]">{menuPreview.data.exclusions.length} 个候选因安全档案被排除</p>
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-[#183f35] text-white">
              <div className="border-b border-white/10 px-6 py-5"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">Authorization audit</span><h2 className="mt-1 text-2xl font-black">家庭授权记录</h2></div>
              {audit.data.records.length === 0 ? (
                <div className="px-6 py-16 text-center"><p className="font-bold">暂无家庭档案变更</p><p className="mt-2 text-sm text-white/45">家长端发起并处理变更后，这里只读展示结果。</p></div>
              ) : (
                <div className="divide-y divide-white/10">
                  {audit.data.records.map((record) => (
                    <article className="px-6 py-5" key={record.auditId}>
                      <div className="flex flex-wrap items-center justify-between gap-3"><span className="rounded-full bg-white/[.08] px-2.5 py-1 text-[10px] font-black text-[#bce4d7]">{decisionLabel(record.decision)}</span><span className="font-mono text-[10px] text-white/35">v{record.profileVersion} · {record.auditId.slice(0, 8)}</span></div>
                      <p className="mt-3 text-sm font-bold">{record.food} · {record.action === 'allergy-change.confirm' ? '档案确认' : '变更申请'}</p>
                      <p className="mt-1 text-xs text-white/45">授权凭证：{record.confirmationEvidence ? '已记录' : '无'} · {new Date(record.timestamp).toLocaleString('zh-CN')}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="mt-6 flex flex-col justify-between gap-4 rounded-[1.8rem] border border-dashed border-black/15 bg-white/45 p-6 sm:flex-row sm:items-center">
            <div><h2 className="font-black text-[#183f35]">需要验证家庭授权流程？</h2><p className="mt-1 text-sm text-[#68756e]">合成角色切换和不可逆确认已移入开发者场景，不属于后台支持权限。</p></div>
            <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#183f35]" to="/developer/scenarios/collaboration">打开合成测试场景 <Icon name="arrow" size={16} /></Link>
          </section>
        </>
      )}
    </div>
  )
}
