import { useMutation } from '@tanstack/react-query'
import type { FormEvent } from 'react'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'
import {
  getScenario,
  parseFoods,
  scenarios,
  useSafetyLabStore,
} from '../store/safety-lab'

export function readableError(error: Error): string {
  if (/fetch|network|invalid url/i.test(error.message)) {
    return '无法连接规则服务。请确认 API Server 已在 3000 端口启动。'
  }
  return error.message || '规则服务暂时不可用，请稍后重试。'
}

export function SafetyLabPage() {
  const { scenarioId, foodsText, selectScenario, setFoodsText, reset } =
    useSafetyLabStore()
  const scenario = getScenario(scenarioId)
  const foods = parseFoods(foodsText)

  const checkSafety = useMutation({
    mutationFn: () =>
      apiClient.safety.check({
        foods,
        profile: scenario.profile,
      }),
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (foods.length > 0 && !checkSafety.isPending) {
      checkSafety.mutate()
    }
  }

  function changeScenario(id: typeof scenarioId) {
    checkSafety.reset()
    selectScenario(id)
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <div className="mb-10 grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="shield" size={14} />
            Deterministic safety boundary
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            安全规则实验室
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#68756e]">
            切换档案并提交食材，观察同一套业务规则如何给出可解释的确定性结果。
            这条边界独立于大模型，即使没有 API Key 也能完整运行。
          </p>
        </div>
        <div className="rounded-2xl border border-[#d7a58f]/40 bg-[#fff0e8] px-4 py-3 text-xs leading-5 text-[#8a452d]">
          <strong className="block font-bold">演示声明</strong>
          仅展示软件决策边界，不构成医疗建议。
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,.88fr)_minmax(0,1.12fr)]">
        <section
          aria-labelledby="input-title"
          className="rounded-[1.8rem] border border-black/8 bg-white/75 p-5 shadow-[0_18px_50px_rgba(24,63,53,.06)] sm:p-7"
        >
          <div className="mb-7 flex items-center justify-between">
            <div>
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
                Input
              </span>
              <h2
                className="mt-1 text-2xl font-black tracking-tight text-[#183f35]"
                id="input-title"
              >
                构造检查场景
              </h2>
            </div>
            <button
              className="text-xs font-bold text-[#68756e] underline-offset-4 hover:text-[#183f35] hover:underline"
              onClick={() => {
                checkSafety.reset()
                reset()
              }}
              type="button"
            >
              重置
            </button>
          </div>

          <fieldset>
            <legend className="mb-3 text-xs font-bold uppercase tracking-[0.13em] text-[#68756e]">
              宝宝档案
            </legend>
            <div className="grid gap-2">
              {scenarios.map((item) => {
                const selected = item.id === scenarioId
                return (
                  <button
                    aria-pressed={selected}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                      selected
                        ? 'border-[#183f35] bg-[#edf2ee]'
                        : 'border-black/8 bg-white/55 hover:border-[#183f35]/35'
                    }`}
                    key={item.id}
                    onClick={() => changeScenario(item.id)}
                    type="button"
                  >
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                        selected
                          ? 'border-[#183f35] bg-[#183f35] text-white'
                          : 'border-black/20'
                      }`}
                    >
                      {selected && <Icon name="check" size={12} />}
                    </span>
                    <span>
                      <strong className="block text-sm text-[#183f35]">
                        {item.label}
                      </strong>
                      <span className="mt-1 block text-xs leading-5 text-[#778279]">
                        {item.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <form className="mt-7" onSubmit={submit}>
            <label
              className="mb-3 block text-xs font-bold uppercase tracking-[0.13em] text-[#68756e]"
              htmlFor="foods"
            >
              待检查食材
            </label>
            <textarea
              aria-describedby="foods-help"
              className="min-h-28 w-full resize-none rounded-2xl border border-black/10 bg-[#f8f8f5] p-4 text-base font-semibold text-[#183f35] outline-none transition placeholder:font-normal placeholder:text-[#9ba39d] focus:border-[#315f52] focus:ring-4 focus:ring-[#315f52]/10"
              id="foods"
              maxLength={200}
              onChange={(event) => {
                checkSafety.reset()
                setFoodsText(event.target.value)
              }}
              placeholder="例如：菠菜、豆腐"
              value={foodsText}
            />
            <p className="mt-2 flex justify-between text-[11px] text-[#8b948d]" id="foods-help">
              <span>使用顿号、逗号或空格分隔，最多 10 种</span>
              <span>{foods.length}/10</span>
            </p>
            <button
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#183f35] px-5 py-4 text-sm font-bold text-white shadow-[0_12px_24px_rgba(24,63,53,.16)] transition enabled:hover:-translate-y-0.5 enabled:hover:bg-[#245949] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={foods.length === 0 || checkSafety.isPending}
              type="submit"
            >
              {checkSafety.isPending ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  正在执行规则…
                </>
              ) : (
                <>
                  运行确定性检查 <Icon name="arrow" size={17} />
                </>
              )}
            </button>
          </form>
        </section>

        <section
          aria-live="polite"
          aria-labelledby="result-title"
          className="relative min-h-[36rem] overflow-hidden rounded-[1.8rem] bg-[#183f35] p-5 text-white shadow-[0_24px_60px_rgba(24,63,53,.18)] sm:p-7"
        >
          <div className="pointer-events-none absolute -right-32 -top-32 size-80 rounded-full border-[60px] border-white/[.035]" />
          <div className="relative">
            <div className="mb-7 flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">
                  Decision
                </span>
                <h2 className="mt-1 text-2xl font-black" id="result-title">
                  规则执行结果
                </h2>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 font-mono text-[10px] text-white/65">
                <span className="size-1.5 rounded-full bg-[#78d5b9]" />
                POST /v1/safety/check
              </span>
            </div>

            {checkSafety.isIdle && (
              <div className="grid min-h-[25rem] place-items-center text-center">
                <div className="max-w-sm">
                  <div className="mx-auto grid size-16 place-items-center rounded-3xl border border-white/10 bg-white/[.06] text-[#91cdbb]">
                    <Icon name="code" size={28} />
                  </div>
                  <h3 className="mt-6 text-lg font-bold">等待一次可审计决策</h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    提交后将显示逐食材判断、规则原因、搭配提醒与决策来源。
                  </p>
                </div>
              </div>
            )}

            {checkSafety.isPending && (
              <div className="space-y-4 pt-2">
                {[1, 2, 3].map((item) => (
                  <div
                    className="h-24 animate-pulse rounded-2xl bg-white/[.07]"
                    key={item}
                  />
                ))}
              </div>
            )}

            {checkSafety.isError && (
              <div className="rounded-2xl border border-[#ffab8e]/25 bg-[#ff7b50]/10 p-5">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 shrink-0 text-[#ffab8e]" name="warning" />
                  <div>
                    <h3 className="font-bold text-[#ffd1c1]">检查未完成</h3>
                    <p className="mt-2 text-sm leading-6 text-white/65">
                      {readableError(checkSafety.error)}
                    </p>
                    <button
                      className="mt-4 text-xs font-bold text-[#ffb79e] underline underline-offset-4"
                      onClick={() => checkSafety.mutate()}
                      type="button"
                    >
                      重新运行
                    </button>
                  </div>
                </div>
              </div>
            )}

            {checkSafety.isSuccess && (
              <div>
                <div
                  className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${
                    checkSafety.data.safe
                      ? 'border-[#78d5b9]/25 bg-[#78d5b9]/10'
                      : 'border-[#ff9b77]/25 bg-[#ff7b50]/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`grid size-12 place-items-center rounded-2xl ${
                        checkSafety.data.safe
                          ? 'bg-[#78d5b9] text-[#12372d]'
                          : 'bg-[#f17a52] text-white'
                      }`}
                    >
                      <Icon
                        name={checkSafety.data.safe ? 'check' : 'warning'}
                        size={24}
                      />
                    </span>
                    <div>
                      <span className="text-xs font-semibold text-white/55">
                        总体结论
                      </span>
                      <h3 className="text-xl font-black">
                        {checkSafety.data.safe ? '可以进入后续编排' : '已触发安全拦截'}
                      </h3>
                    </div>
                  </div>
                  <span className="w-fit rounded-full bg-black/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-white/70">
                    {checkSafety.data.decisionSource}
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {checkSafety.data.results.map((result) => (
                    <article
                      className="rounded-2xl border border-white/10 bg-white/[.055] p-4"
                      key={result.food}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-bold">{result.food}</h3>
                          <p className="mt-1 text-xs leading-5 text-white/55">
                            {result.reason ??
                              `${result.categoryId ?? '免排敏食材'} · 已通过档案校验`}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            result.safe
                              ? 'bg-[#78d5b9]/15 text-[#9de4cf]'
                              : 'bg-[#ff7b50]/15 text-[#ffb398]'
                          }`}
                        >
                          {result.safe ? 'PASS' : 'BLOCK'}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>

                {checkSafety.data.tabooWarnings.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-[#eccf82]/20 bg-[#d8ad3d]/10 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-[#f5d980]">
                      <Icon name="warning" size={17} />
                      搭配提醒
                    </h3>
                    {checkSafety.data.tabooWarnings.map((warning) => (
                      <p
                        className="mt-2 text-xs leading-5 text-white/60"
                        key={warning.foods.join('-')}
                      >
                        {warning.foods.join(' + ')}：{warning.reason}；
                        {warning.mitigation}
                      </p>
                    ))}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-xs text-white/50">
                  <div>
                    <span className="block">档案快照</span>
                    <strong className="mt-1 block text-sm text-white/85">
                      {checkSafety.data.profileSnapshot.ageMonths} 月龄
                    </strong>
                  </div>
                  <div>
                    <span className="block">当前状态</span>
                    <strong className="mt-1 block text-sm text-white/85">
                      {checkSafety.data.profileSnapshot.currentStatus ===
                      'postVaccine'
                        ? '疫苗后'
                        : '日常'}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
