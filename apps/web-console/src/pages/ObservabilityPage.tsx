import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function ObservabilityPage() {
  const traces = useQuery({
    queryKey: ['observability', 'traces'],
    queryFn: () => apiClient.observability.traces({}),
  })
  const evaluation = useQuery({
    queryKey: ['evaluations', 'safety'],
    queryFn: () => apiClient.evaluations.safety({}),
  })
  const isPending = traces.isPending || evaluation.isPending
  const isError = traces.isError || evaluation.isError
  const blockedRate =
    traces.data && traces.data.summary.total > 0
      ? traces.data.summary.blocked / traces.data.summary.total
      : 0

  function refresh() {
    void Promise.all([traces.refetch(), evaluation.refetch()])
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="code" size={14} />
            Observability & evaluation
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            决策可观测性
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            追踪每次规则执行的状态、延迟与汇总结果，并用固定回归集验证关键安全场景。
            当前 provider 为 none：这里评估的是确定性规则，不伪装成大模型调用。
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-bold text-[#183f35] transition hover:bg-white disabled:opacity-50"
          disabled={traces.isFetching || evaluation.isFetching}
          onClick={refresh}
          type="button"
        >
          <Icon name="spark" size={16} />
          刷新数据
        </button>
      </div>

      <div className="mt-8 rounded-2xl border border-[#cfb770]/35 bg-[#fff8de] p-4 text-sm leading-6 text-[#705d24]">
        <strong>隐私模式：summary-only。</strong>
        Trace 仅保留数量、状态与结果计数，不保存食材名、宝宝姓名或备注；服务重启后内存记录会清空。
      </div>

      {isPending && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              className="h-32 animate-pulse rounded-3xl bg-black/[.055]"
              key={item}
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">观测数据加载失败</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            请确认 API Server 已启动，再刷新数据。
          </p>
        </div>
      )}

      {traces.data && evaluation.data && (
        <>
          <section
            aria-label="运行指标"
            className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              ['Observed executions', String(traces.data.summary.total), '内存 trace'],
              ['Blocked rate', percent(blockedRate), '规则阻断占比'],
              [
                'Average latency',
                `${traces.data.summary.averageDurationMs.toFixed(2)} ms`,
                '规则执行耗时',
              ],
              [
                'Evaluation pass rate',
                percent(evaluation.data.passRate),
                `${evaluation.data.passCount}/${evaluation.data.datasetSize} cases`,
              ],
            ].map(([label, value, detail]) => (
              <article
                className="rounded-3xl border border-black/8 bg-white/70 p-5"
                key={label}
              >
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">
                  {label}
                </span>
                <strong className="mt-3 block text-3xl font-black tracking-tight text-[#183f35]">
                  {value}
                </strong>
                <span className="mt-2 block text-xs text-[#7a867f]">{detail}</span>
              </article>
            ))}
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.18fr_.82fr]">
            <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-[#183f35] text-white shadow-[0_20px_50px_rgba(24,63,53,.12)]">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">
                    Live traces
                  </span>
                  <h2 className="mt-1 text-xl font-black">最近规则执行</h2>
                </div>
                <span className="rounded-full bg-white/[.07] px-3 py-1.5 font-mono text-[10px] text-white/60">
                  provider: none
                </span>
              </div>

              {traces.data.traces.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="font-bold">还没有可观测执行</p>
                  <p className="mt-2 text-sm text-white/50">
                    先运行一次安全检查，再回来查看 trace。
                  </p>
                  <Link
                    className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#91cdbb]"
                    to="/safety"
                  >
                    前往安全实验室 <Icon name="arrow" size={16} />
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {traces.data.traces.map((trace) => (
                    <article
                      className="grid gap-3 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-center"
                      key={trace.traceId}
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              trace.status === 'allowed'
                                ? 'bg-[#78d5b9]/15 text-[#9de4cf]'
                                : 'bg-[#ff7b50]/15 text-[#ffb398]'
                            }`}
                          >
                            {trace.status.toUpperCase()}
                          </span>
                          <span className="font-mono text-xs text-white/75">
                            {trace.operation}
                          </span>
                          <span className="text-xs text-white/35">
                            {trace.durationMs.toFixed(2)} ms
                          </span>
                        </div>
                        <p className="mt-2 font-mono text-[10px] text-white/35">
                          {trace.traceId}
                        </p>
                      </div>
                      <div className="text-xs leading-5 text-white/55 sm:text-right">
                        <span className="block">
                          {trace.inputSummary.foodCount} inputs ·{' '}
                          {trace.outputSummary.blockedCount} blocked
                        </span>
                        <span className="block">
                          {new Date(trace.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[1.8rem] border border-black/8 bg-white/75 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
                    Regression suite
                  </span>
                  <h2 className="mt-1 text-xl font-black text-[#183f35]">
                    安全规则评测
                  </h2>
                </div>
                <span className="rounded-full bg-[#e4ece6] px-3 py-1.5 text-xs font-black text-[#315f52]">
                  Recall {percent(evaluation.data.safetyBlockRecall)}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#7a867f]">
                {evaluation.data.suiteId} · 固定案例，不生成线上 trace
              </p>
              <div className="mt-5 space-y-3">
                {evaluation.data.cases.map((evaluationCase) => (
                  <article
                    className="flex items-center justify-between gap-4 rounded-2xl border border-black/8 bg-[#f8f8f5] p-4"
                    key={evaluationCase.id}
                  >
                    <div>
                      <h3 className="text-sm font-bold text-[#183f35]">
                        {evaluationCase.label}
                      </h3>
                      <p className="mt-1 font-mono text-[10px] text-[#879189]">
                        expected:{' '}
                        {evaluationCase.expectedSafe ? 'allow' : 'block'} ·
                        actual: {evaluationCase.actualSafe ? 'allow' : 'block'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                        evaluationCase.passed
                          ? 'bg-[#dff1e9] text-[#28634f]'
                          : 'bg-[#ffe3d8] text-[#9b472c]'
                      }`}
                    >
                      {evaluationCase.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
