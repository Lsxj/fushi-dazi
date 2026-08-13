import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { apiClient } from '../api/client'
import { Icon } from '../components/Icon'

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function OperationsDashboardPage() {
  const [version, setVersion] = useState('1.0.5-rc.1')
  const [reviewerId, setReviewerId] = useState('safety-reviewer')
  const [reviewNote, setReviewNote] = useState('Automated evidence reviewed; approved for the manual release stage')
  const [evidenceConfirmed, setEvidenceConfirmed] = useState(false)
  const supportCases = useQuery({
    queryKey: ['support', 'cases'],
    queryFn: () => apiClient.support.cases({}),
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
  const releaseCandidates = useQuery({
    queryKey: ['releases', 'candidates'],
    queryFn: () => apiClient.releases.candidates({}),
  })

  const queries = [
    supportCases,
    traces,
    safetyEvaluation,
    agenticEvaluation,
    releaseCandidates,
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
  const latestCandidate = releaseCandidates.data?.candidates[0]

  const createCandidate = useMutation({
    mutationFn: () =>
      apiClient.releases.createCandidate({
        version,
        createdBy: 'product-operator',
      }),
    onSuccess: () => releaseCandidates.refetch(),
  })
  const reviewCandidate = useMutation({
    mutationFn: (decision: 'approved' | 'blocked') => {
      if (!latestCandidate || !evidenceConfirmed) {
        throw new Error('Confirm that you reviewed the automated evidence first')
      }
      return apiClient.releases.reviewCandidate({
        candidateId: latestCandidate.candidateId,
        reviewerId,
        decision,
        note: reviewNote,
        evidenceConfirmed: true,
      })
    },
    onSuccess: () => {
      setEvidenceConfirmed(false)
      return releaseCandidates.refetch()
    },
  })

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5ebe6] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-[#315f52]">
            <Icon name="shield" size={14} />
            Internal operations workspace
          </div>
          <h1 className="text-4xl font-black tracking-[-0.045em] text-[#183f35] sm:text-6xl">
            Operations & Safety Overview
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            Review household support work, safety regressions, and AI workflow quality in one place—so the team knows what needs attention today and whether a release candidate is safe to review.
          </p>
        </div>
        <button
          className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-bold text-[#183f35] transition hover:bg-white disabled:opacity-50"
          disabled={queries.some((query) => query.isFetching)}
          onClick={refresh}
          type="button"
        >
          <Icon name="spark" size={16} /> Refresh status
        </button>
      </header>

      <div className="mt-8 rounded-2xl border border-[#cfb770]/35 bg-[#fff8de] p-4 text-sm leading-6 text-[#705d24]">
        <strong>Environment: local synthetic data. </strong>
        This console validates internal workflows and does not read real child data. Household safety profiles can only be changed through a parent-authorized flow.
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
          <h2 className="font-black text-[#8a452d]">Unable to load operations status</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            Start the API server and refresh. Stale release decisions are hidden when loading fails.
          </p>
        </section>
      )}

      {supportCases.data &&
        traces.data &&
        safetyEvaluation.data &&
        agenticEvaluation.data &&
        releaseCandidates.data && (
          <>
            <section aria-label="Key operations metrics" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">Unassigned cases</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{supportCases.data.summary.unassigned}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">{supportCases.data.summary.criticalOpen} critical safety issues</span>
              </article>
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">Safety regression</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{safetyEvaluation.data.passCount}/{safetyEvaluation.data.datasetSize}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">Block recall {percent(safetyEvaluation.data.safetyBlockRecall)}</span>
              </article>
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">AI workflow regression</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{agenticEvaluation.data.passCount}/{agenticEvaluation.data.datasetSize}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">{agenticEvaluation.data.provider} · offline evaluation</span>
              </article>
              <article className="rounded-3xl border border-black/8 bg-white/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7a867f]">Rule executions</span>
                <strong className="mt-3 block text-3xl font-black text-[#183f35]">{traces.data.summary.total}</strong>
                <span className="mt-2 block text-xs text-[#7a867f]">summary-only · no child or food names</span>
              </article>
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
              <section className="rounded-[1.8rem] bg-[#183f35] p-6 text-white shadow-[0_20px_50px_rgba(24,63,53,.12)]">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#91cdbb]">Release gate</span>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">Pre-release safety gate</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">A candidate reaches manual review only after both the fixed safety suite and offline agent workflow pass.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-black ${releaseReady ? 'bg-[#78d5b9]/15 text-[#9de4cf]' : 'bg-[#ff7b50]/15 text-[#ffb398]'}`}>
                    {releaseReady ? 'READY FOR REVIEW' : 'BLOCKED'}
                  </span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Link className="rounded-2xl border border-white/10 bg-white/[.06] p-4 transition hover:bg-white/[.1]" to="/safety">
                    <strong className="block text-sm">Run rule validation</strong>
                    <span className="mt-1 block text-xs text-white/45">Check a specific profile and food combination</span>
                  </Link>
                  <Link className="rounded-2xl border border-white/10 bg-white/[.06] p-4 transition hover:bg-white/[.1]" to="/observability">
                    <strong className="block text-sm">Review failures and traces</strong>
                    <span className="mt-1 block text-xs text-white/45">Separate rule, tool, and data-source issues</span>
                  </Link>
                </div>
                <div className="mt-6 border-t border-white/10 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black">Release candidate review</h3>
                      <p className="mt-1 text-xs leading-5 text-white/50">
                        Capture this evaluation evidence and the reviewer decision. Approval does not deploy automatically.
                      </p>
                    </div>
                    <span className="rounded-full bg-white/8 px-3 py-1 font-mono text-[10px] text-white/55">
                      {releaseCandidates.data.persistenceMode}
                    </span>
                  </div>

                  {latestCandidate?.status !== 'awaiting-review' && (
                    <form
                      className="mt-4 flex flex-col gap-3 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault()
                        createCandidate.mutate()
                      }}
                    >
                      <label className="flex-1 text-xs font-bold text-white/65">
                        Candidate version
                        <input
                          className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#78d5b9]"
                          onChange={(event) => setVersion(event.target.value)}
                          pattern="\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?"
                          required
                          value={version}
                        />
                      </label>
                      <button
                        className="self-end rounded-xl bg-[#78d5b9] px-4 py-2.5 text-sm font-black text-[#183f35] disabled:opacity-50"
                        disabled={createCandidate.isPending || !releaseReady}
                        type="submit"
                      >
                        {createCandidate.isPending ? 'Capturing…' : 'Create review candidate'}
                      </button>
                    </form>
                  )}

                  {latestCandidate && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className="font-mono text-base font-black">v{latestCandidate.version}</span>
                          <p className="mt-1 text-xs text-white/45">
                            {latestCandidate.evidence.safetyPassCount}/{latestCandidate.evidence.safetyDatasetSize} safety cases · {latestCandidate.evidence.agenticPassCount}/{latestCandidate.evidence.agenticDatasetSize} AI workflows
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#9de4cf]">
                          {latestCandidate.status}
                        </span>
                      </div>

                      {latestCandidate.status === 'awaiting-review' ? (
                        <div className="mt-4 grid gap-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-bold text-white/65">
                              Reviewer ID
                              <input
                                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 text-sm text-white outline-none"
                                onChange={(event) => setReviewerId(event.target.value)}
                                value={reviewerId}
                              />
                            </label>
                            <label className="text-xs font-bold text-white/65">
                              Review note
                              <input
                                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 text-sm text-white outline-none"
                                onChange={(event) => setReviewNote(event.target.value)}
                                value={reviewNote}
                              />
                            </label>
                          </div>
                          <label className="flex items-start gap-2 text-xs leading-5 text-white/60">
                            <input
                              checked={evidenceConfirmed}
                              className="mt-1"
                              onChange={(event) => setEvidenceConfirmed(event.target.checked)}
                              type="checkbox"
                            />
                            I reviewed safety block recall, the full regression results, and the mock-policy boundary.
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-xl bg-[#78d5b9] px-4 py-2 text-xs font-black text-[#183f35] disabled:opacity-40"
                              disabled={!evidenceConfirmed || reviewCandidate.isPending}
                              onClick={() => reviewCandidate.mutate('approved')}
                              type="button"
                            >
                              Approve for manual release
                            </button>
                            <button
                              className="rounded-xl border border-[#ff9b78]/30 px-4 py-2 text-xs font-black text-[#ffb398] disabled:opacity-40"
                              disabled={!evidenceConfirmed || reviewCandidate.isPending}
                              onClick={() => reviewCandidate.mutate('blocked')}
                              type="button"
                            >
                              Block candidate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl bg-black/10 p-3 text-xs leading-5 text-white/60">
                          <strong className="text-white/85">{latestCandidate.review?.reviewerId}</strong>
                          {' · '}{latestCandidate.review?.note}
                        </div>
                      )}
                    </div>
                  )}

                  {(createCandidate.isError || reviewCandidate.isError) && (
                    <p className="mt-3 text-xs text-[#ffb398]">
                      Action failed. Check the input and API connection, then try again.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[1.8rem] border border-black/8 bg-white/75 p-6">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Operations queue</span>
                <h2 className="mt-1 text-2xl font-black text-[#183f35]">Today's queue</h2>
                <div className="mt-5 space-y-3">
                  <Link className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" to="/support">
                    <div><strong className="block text-sm text-[#183f35]">Household support cases</strong><span className="mt-1 block text-xs text-[#7a867f]">{supportCases.data.summary.unassigned} unassigned · {supportCases.data.summary.criticalOpen} critical safety</span></div>
                    <Icon name="arrow" size={17} />
                  </Link>
                  <Link className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" to="/observability">
                    <div><strong className="block text-sm text-[#183f35]">AI quality & safety</strong><span className="mt-1 block text-xs text-[#7a867f]">Review fixed regressions and execution summaries</span></div>
                    <Icon name="arrow" size={17} />
                  </Link>
                  <Link className="flex items-center justify-between rounded-2xl border border-black/8 bg-[#f8f8f5] p-4" to="/developer">
                    <div><strong className="block text-sm text-[#183f35]">Developer tools</strong><span className="mt-1 block text-xs text-[#7a867f]">Architecture, OpenAPI, MCP, and synthetic scenarios</span></div>
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
