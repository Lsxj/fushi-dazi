import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function OperationsDashboardPage() {
  const household = useQuery({
    queryKey: ['collaboration', 'household'],
    queryFn: () => apiClient.collaboration.household({}),
  })
  const audit = useQuery({
    queryKey: ['collaboration', 'audit'],
    queryFn: () => apiClient.collaboration.audit({}),
  })
  const traces = useQuery({
    queryKey: ['observability', 'traces'],
    queryFn: () => apiClient.observability.traces({}),
  })
  const safetyEvaluation = useQuery({
    queryKey: ['evaluations', 'safety'],
    queryFn: () => apiClient.evaluations.safety({}),
  })
  const agenticEvaluation = useQuery({
    queryKey: ['evaluations', 'agentic'],
    queryFn: () => apiClient.evaluations.agentic({}),
  })

  const queries = [
    household,
    audit,
    traces,
    safetyEvaluation,
    agenticEvaluation,
  ]
  const isPending = queries.some((query) => query.isPending)
  const isError = queries.some((query) => query.isError)

  function refresh() {
    void Promise.all(queries.map((query) => query.refetch()))
  }

  const releaseReady =
    safetyEvaluation.data?.passRate === 1 &&
    safetyEvaluation.data.safetyBlockRecall === 1 &&
    agenticEvaluation.data?.endToEndSuccessRate === 1

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="shield" size={14} />
            Internal operations workspace
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            运营与安全总览
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            聚合待处理家庭事项、安全回归和 AI 工作流质量，帮助内部人员判断今天要处理什么、当前版本能否安全发布。
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-bold text-[#183f35] transition hover:bg-white disabled:opacity-50"
          disabled={queries.some((query) => query.isFetching)}
          onClick={refresh}
          type="button"
        >
          <Icon name="spark" size={16} /> 刷新状态
        </button>
      </header>

      <div className="mt-8 rounded-2xl border border-[#cfb770]/35 bg-[#fff8de] p-4 text-sm leading-6 text-[#705d24]">
        <strong>当前环境：本地合成数据。</strong>
        控制台用于验证内部工作流，不读取真实宝宝信息；家庭安全档案只能由家长端授权流程修改。
      </div>

      {isPending && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div className="h-32 animate-pulse rounded-3xl bg-black/[.055]" key={item} />
          ))}
        </div>
      )}

      {isError && (
        <section className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">运营状态加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            请确认 API Server 已启动后刷新；加载失败时不展示过期发布结论。
          </p>
        </section>
      )}

      {household.data &&
        audit.data &&
        traces.data &&
        safetyEvaluation.data &&
        agenticEvaluation.data && (
          <>
            <section aria-label="关键运营指标" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">待家庭确认</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{household.data.pendingRequests.length}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">后台只读，不代替主照护人确认</span>
              </article>
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">安全回归</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{safetyEvaluation.data.passCount}/{safetyEvaluation.data.datasetSize}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">阻断召回 {percent(safetyEvaluation.data.safetyBlockRecall)}</span>
              </article>
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">AI 工作流回归</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{agenticEvaluation.data.passCount}/{agenticEvaluation.data.datasetSize}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">{agenticEvaluation.data.provider} · 离线评估</span>
              </article>
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">规则执行</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{traces.data.summary.total}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">summary-only · 无宝宝姓名和食材名</span>
              </article>
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
              <section className="rounded-[1.8rem] bg-[#183f35] p-6 text-white shadow-[0_20px_50px_rgba(24,63,53,.12)]">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">Release gate</span>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">发布前安全门禁</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">只有固定安全回归和离线 Agent workflow 同时通过，当前候选版本才进入下一步人工审核。</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black ${releaseReady ? 'bg-[#78d5b9]/15 text-[#9de4cf]' : 'bg-[#ff7b50]/15 text-[#ffb398]'}`}>
                    {releaseReady ? 'READY FOR REVIEW' : 'BLOCKED'}
                  </span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Link className="rounded-2xl border border-white/10 bg-white/[.06] p-4 transition hover:bg-white/[.1]" to="/safety">
                    <strong className="block text-sm">运行规则验证</strong>
                    <span className="mt-1 block text-xs text-white/45">复查具体档案与食材组合</span>
                  </Link>
                  <Link className="rounded-2xl border border-white/10 bg-white/[.06] p-4 transition hover:bg-white/[.1]" to="/observability">
                    <strong className="block text-sm">查看失败案例与 trace</strong>
                    <span className="mt-1 block text-xs text-white/45">区分规则、工具和数据来源问题</span>
                  </Link>
                </div>
              </section>

              <section className="rounded-[1.8rem] border border-black/8 bg-white/75 p-6">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Operations queue</span>
                <h2 className="mt-1 text-2xl font-black text-[#183f35]">今日处理队列</h2>
                <div className="mt-5 space-y-3">
                  <Link className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" to="/support">
                    <div><strong className="block text-sm text-[#183f35]">家庭支持与授权审计</strong><span className="mt-1 block text-xs text-[#7a867f]">{audit.data.summary.total} 条变更记录</span></div>
                    <Icon name="arrow" size={17} />
                  </Link>
                  <Link className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" to="/observability">
                    <div><strong className="block text-sm text-[#183f35]">AI 质量与安全评估</strong><span className="mt-1 block text-xs text-[#7a867f]">检查固定回归和执行摘要</span></div>
                    <Icon name="arrow" size={17} />
                  </Link>
                  <Link className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" to="/developer">
                    <div><strong className="block text-sm text-[#183f35]">开发者工具</strong><span className="mt-1 block text-xs text-[#7a867f]">架构、OpenAPI、MCP 与合成场景</span></div>
                    <Icon name="arrow" size={17} />
                  </Link>
                </div>
              </section>
            </div>
          </>
        )}
    </div>
  )
}
