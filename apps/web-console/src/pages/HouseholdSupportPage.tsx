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
  'unsafe-food-in-menu': 'Potentially unsafe food appeared in a menu',
  'ai-safety-warning-missing': 'AI response was missing safety guidance',
  'inventory-not-updated': 'Inventory did not update after meal logging',
  'profile-not-refreshed': 'Page did not refresh after a profile change',
  'request-cloud-data-deletion': 'Cloud data deletion request',
}

const statusLabels: Record<SupportCase['status'], string> = {
  new: 'Unassigned',
  investigating: 'Investigating',
  escalated: 'Safety review',
  resolved: 'Resolved',
  closed: 'Closed',
}

type Investigation = NonNullable<SupportCase['investigation']>
type InvestigationFinding = Investigation['finding']
type InvestigationEvidence = Investigation['evidence'][number]
type ResolutionCode = NonNullable<SupportCase['resolutionCode']>

const findingLabels: Record<InvestigationFinding, string> = {
  'confirmed-product-defect': 'Confirmed product defect',
  'client-state-stale': 'Stale client state',
  'working-as-designed': 'Working as designed',
  'privacy-request-validated': 'Privacy request validated',
  'insufficient-evidence': 'Insufficient evidence',
}

const evidenceLabels: Record<InvestigationEvidence, string> = {
  'diagnostic-context': 'Diagnostic context',
  'safety-trace-reference': 'Safety trace reference',
  'profile-version-reference': 'Profile version reference',
  'menu-date-reference': 'Menu date reference',
}

const resolutionLabels: Record<ResolutionCode, string> = {
  'fix-planned': 'Issue confirmed; product fix planned',
  'guidance-provided': 'Guidance provided to the parent',
  'no-defect-found': 'No product defect found after review',
  'deletion-accepted': 'Cloud data deletion request accepted',
}

const categoryLabels: Record<SupportCase['category'], string> = {
  'menu-safety': 'Menu safety',
  'ai-quality': 'AI quality',
  'data-problem': 'Data issue',
  'privacy-request': 'Privacy request',
}

const severityWeight: Record<SupportCase['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const auditActionLabels: Record<SupportCaseAuditRecord['action'], string> = {
  'case-created': 'Case submitted by parent',
  'case-assigned': 'Case assigned to support',
  'case-investigation-recorded': 'Investigation finding saved',
  'case-escalated': 'Escalated for safety review',
  'case-resolved': 'Resolution recorded',
  'case-closed': 'Case closed',
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
    label: breached ? 'SLA breached' : warning ? 'SLA at risk' : 'SLA on track',
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
        throw new Error('CloudBase sign-in succeeded, but this account does not have console access')
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
            Household Support Cases
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#68756e]">
            Handle minimized diagnostic reports submitted with explicit parental consent. The console can assign, investigate, and escalate cases, but it cannot change a child's allergy profile on a parent's behalf.
          </p>
        </div>
        <div className="rounded-2xl border border-[#d7a58f]/35 bg-[#fff0e8] px-4 py-3 text-xs leading-5 text-[#8a452d]">
          <strong className="block">{cases.data?.privacyMode ?? 'metadata-only'}</strong>
          No child names, free-form notes, or full chat transcripts
        </div>
      </header>

      {session.isPending && (
        <div className="mt-8 h-48 animate-pulse rounded-[1.8rem] bg-black/[.055]" />
      )}
      {session.isError && (
        <section className="mt-8 rounded-3xl border border-[#d87b5d]/25 bg-[#fff0e8] p-6">
          <h2 className="font-black text-[#8a452d]">Unable to load administrator session</h2>
          <p className="mt-2 text-sm text-[#8a604f]">Cases and actions remain unavailable until identity is verified.</p>
        </section>
      )}
      {session.data && !session.data.authenticated && (
        <section className="mt-8 rounded-[1.8rem] border border-black/8 bg-white/75 p-6 sm:p-8">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">
            {session.data.identityMode === 'cloudbase-access-token'
              ? 'CloudBase operator authentication'
              : 'Local demo authentication'}
          </span>
          <h2 className="mt-2 text-2xl font-black text-[#183f35]">Sign in to the operations workspace</h2>
          {session.data.identityMode === 'cloudbase-access-token' ? (
            <form
              className="mt-5 grid max-w-md gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                cloudLogin.mutate()
              }}
            >
              <p className="text-sm leading-6 text-[#68756e]">
                Sign in with a CloudBase account on the administrator allowlist. The server verifies both identity and role; roles cannot be selected in the browser.
              </p>
              {session.data.recoveryNotice && (
                <p className="rounded-xl bg-[#fff0e8] px-4 py-3 text-sm font-semibold text-[#8a452d]">
                  {session.data.recoveryNotice}
                </p>
              )}
              <label className="grid gap-1.5 text-xs font-bold text-[#516159]">
                Administrator email or username
                <input
                  autoComplete="username"
                  className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[#183f35] outline-none focus:border-[#5a8e7e]"
                  onChange={(event) => setOperatorIdentifier(event.target.value)}
                  required
                  value={operatorIdentifier}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-[#516159]">
                Password
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
                {cloudLogin.isPending ? 'Verifying…' : 'Sign in'}
              </button>
              {cloudLogin.isError && (
                <p className="text-xs font-bold text-[#b45336]">
                  {cloudLogin.error instanceof Error
                    ? cloudLogin.error.message
                    : 'Sign-in failed. Check the sign-in method and account configuration'}
                </p>
              )}
            </form>
          ) : (
            <>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68756e]">
                This local identity directory is for demos, not production. After sign-in, a server-side HttpOnly cookie determines the operator and role; case requests cannot forge an actor in the browser.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="rounded-xl bg-[#183f35] px-4 py-3 text-xs font-black text-white"
                  disabled={demoLogin.isPending}
                  onClick={() => demoLogin.mutate('demo-support-agent')}
                  type="button"
                >
                  Sign in as Support Agent
                </button>
                <button
                  className="rounded-xl border border-[#183f35]/15 bg-white px-4 py-3 text-xs font-black text-[#183f35]"
                  disabled={demoLogin.isPending}
                  onClick={() => demoLogin.mutate('demo-safety-reviewer')}
                  type="button"
                >
                  Sign in as Safety Reviewer
                </button>
              </div>
              {demoLogin.isError && (
                <p className="mt-3 text-xs font-bold text-[#b45336]">
                  Sign-in failed. Confirm that the API server is running.
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
          <h2 className="font-black text-[#8a452d]">Unable to load support cases</h2>
          <p className="mt-2 text-sm text-[#8a604f]">
            When the connection fails, stale cases are hidden and status changes are disabled.
          </p>
        </section>
      )}

      {cases.data && (
        <>
          <section aria-label="Case summary" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Open', visibleCases.length, 'Includes active and resolved cases'],
              ['Unassigned', cases.data.summary.unassigned, 'Needs a support owner'],
              ['Critical safety', cases.data.summary.criticalOpen, 'Must be resolved by a safety reviewer'],
              ['SLA breached', cases.data.summary.slaBreached, 'Requires immediate attention'],
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
                  {filter === 'active' ? 'Open' : 'All'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#68756e]">
              <span>Server session: </span>
              <strong className="text-[#183f35]">
                {session.data?.operator?.role === 'support-agent' ? 'Support Agent' : 'Safety Reviewer'}
              </strong>
              <button
                className="rounded-xl border border-black/8 bg-white px-3 py-2 font-bold text-[#183f35]"
                onClick={() => logout.mutate()}
                type="button"
              >
                Sign out
              </button>
              <span className="hidden text-[#a06b50] sm:inline">{cases.data.identityMode}</span>
            </div>
          </div>

          <section aria-label="Queue triage filters" className="mt-3 grid gap-3 rounded-2xl border border-black/8 bg-white/65 p-3 md:grid-cols-[1.5fr_repeat(2,1fr)_auto]">
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]">
              Search cases
              <input
                className="rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-[#183f35] outline-none focus:border-[#5a8e7e]"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Case ID, issue, or client version"
                type="search"
                value={searchQuery}
              />
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]">
              Severity
              <select className="rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-[#183f35]" onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)} value={severityFilter}>
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-[#7a867f]">
              Issue type
              <select className="rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-[#183f35]" onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)} value={categoryFilter}>
                <option value="all">All types</option>
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
              Clear filters
            </button>
          </section>

          {visibleCases.length === 0 ? (
            <section className="mt-6 rounded-[1.8rem] border border-dashed border-black/15 bg-white/55 px-6 py-16 text-center">
              <h2 className="font-black text-[#183f35]">No matching cases</h2>
              <p className="mt-2 text-sm text-[#68756e]">Adjust the filters or wait for a parent to submit new diagnostic metadata with explicit consent.</p>
            </section>
          ) : (
            <div className="mt-6 grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
              <section className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-white/75">
                <div className="border-b border-black/8 px-5 py-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#df5c34]">Operations queue</span>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <h2 className="text-xl font-black text-[#183f35]">Open queue</h2>
                    <span className="text-xs font-bold text-[#7a867f]">Showing {visibleCases.length}</span>
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
                      ['Issue type', categoryLabels[selectedCase.category]],
                      ['Occurred at', new Date(selectedCase.context.occurredAt).toLocaleString('en-US')],
                      ['Menu date', selectedCase.context.menuDate ?? 'Not provided'],
                      ['Owner', selectedCase.assignedTo ?? 'Unassigned'],
                    ].map(([label, value]) => (
                      <div className="rounded-2xl border border-white/10 bg-white/[.055] p-4" key={label}>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</span>
                        <strong className="mt-1 block text-sm">{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-[#91cdbb]/20 bg-[#91cdbb]/8 p-4 text-xs leading-5 text-white/60">
                    This case contains structured diagnostic metadata only. Support agents cannot change allergy profiles here; critical safety issues must be escalated and resolved by a safety reviewer.
                  </div>

                  <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#91cdbb]">Case timeline</span>
                    <h3 className="mt-1 text-base font-black">Case timeline</h3>
                    <ol className="mt-4 space-y-3">
                      {selectedCaseAudits.map((record) => (
                        <li className="grid grid-cols-[10px_1fr] gap-3" key={record.auditId}>
                          <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${record.decision === 'allowed' ? 'bg-[#78d5b9]' : 'bg-[#ff9d7c]'}`} />
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong className="text-xs">{auditActionLabels[record.action]}</strong>
                              <time className="text-[10px] text-white/35">{new Date(record.timestamp).toLocaleString('en-US')}</time>
                            </div>
                            <p className="mt-1 text-[10px] text-white/45">{record.decision === 'allowed' ? 'Completed' : 'Rejected by a safety rule'}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <details className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs text-white/55">
                    <summary className="cursor-pointer font-bold text-white/70">Technical details</summary>
                    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div><dt className="text-white/35">Case ID</dt><dd className="mt-1 font-mono">{selectedCase.caseId}</dd></div>
                      <div><dt className="text-white/35">Case version</dt><dd className="mt-1">v{selectedCase.caseVersion}</dd></div>
                      <div><dt className="text-white/35">Client</dt><dd className="mt-1">{selectedCase.context.clientVersion}</dd></div>
                      <div><dt className="text-white/35">Profile version</dt><dd className="mt-1">{selectedCase.context.profileVersion ? `v${selectedCase.context.profileVersion}` : 'Not provided'}</dd></div>
                    </dl>
                  </details>

                  {(selectedCase.status === 'investigating' || selectedCase.status === 'escalated') && (
                    <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#91cdbb]">Investigation workspace</span>
                      <h3 className="mt-1 text-base font-black">Structured investigation record</h3>

                      <div className="mt-4 rounded-xl bg-black/10 p-3 text-xs leading-5 text-white/65">
                        {selectedCase.context.traceId ? (
                          linkedTrace ? (
                            <span>Trace {linkedTrace.traceId.slice(0, 8)} · {linkedTrace.status} · {linkedTrace.decisionSource}</span>
                          ) : (
                            <span>The case references trace {selectedCase.context.traceId.slice(0, 8)}, but no matching summary exists in this runtime.</span>
                          )
                        ) : (
                          <span>No trace ID was provided, so a trace cannot be used as evidence in this investigation.</span>
                        )}
                      </div>

                      {selectedCase.investigation && (
                        <div className="mt-3 rounded-xl border border-[#78d5b9]/25 bg-[#78d5b9]/10 p-3 text-xs leading-5 text-white/75">
                          <strong className="block text-[#bce4d7]">Saved: {findingLabels[selectedCase.investigation.finding]}</strong>
                          {selectedCase.investigation.evidence.map((item) => evidenceLabels[item]).join('、')}
                        </div>
                      )}

                      <label className="mt-4 block text-xs font-bold text-white/70" htmlFor="investigation-finding">Investigation finding</label>
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
                        <span className="text-xs font-bold text-white/70">Verifiable evidence added automatically</span>
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
                        {selectedCase.investigation ? 'Update finding' : 'Save finding'}
                      </button>
                    </section>
                  )}

                  {selectedCase.investigation &&
                    (selectedCase.status === 'investigating' || selectedCase.status === 'escalated') && (
                      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                        <label className="text-xs font-bold text-white/70" htmlFor="resolution-code">Resolution</label>
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
                          <p className="mt-3 text-xs font-bold text-[#ffb398]">The current finding is “Insufficient evidence.” Continue the investigation and update the finding before resolving this case.</p>
                        )}
                      </section>
                    )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {selectedCase.status === 'new' && (
                      <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:opacity-40" disabled={updateCase.isPending} onClick={() => runAction('assign-self', selectedCase)} type="button">Assign to me</button>
                    )}
                    {selectedCase.status === 'investigating' && (
                      <>
                        <button className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black disabled:opacity-40" disabled={updateCase.isPending} onClick={() => runAction('escalate', selectedCase)} type="button">Escalate for safety review</button>
                        {selectedCase.severity !== 'critical' && selectedCase.investigation && selectedCase.investigation.finding !== 'insufficient-evidence' && (
                          <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:opacity-40" disabled={updateCase.isPending} onClick={() => resolve(selectedCase)} type="button">Record resolution</button>
                        )}
                      </>
                    )}
                    {selectedCase.status === 'escalated' && selectedCase.investigation && selectedCase.investigation.finding !== 'insufficient-evidence' && (
                      <button className="rounded-xl bg-[#78d5b9] px-4 py-2.5 text-xs font-black text-[#183f35] disabled:opacity-40" disabled={updateCase.isPending} onClick={() => resolve(selectedCase)} type="button">Complete safety review</button>
                    )}
                    {selectedCase.status === 'resolved' && (
                      <button className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black disabled:opacity-40" disabled={updateCase.isPending} onClick={() => runAction('close', selectedCase)} type="button">Close case</button>
                    )}
                  </div>
                  {updateCase.data?.result && updateCase.data.result !== 'updated' && (
                    <p className="mt-3 text-xs font-bold text-[#ffb398]">Action rejected: {updateCase.data.result}</p>
                  )}
                  {updateCase.isError && (
                    <p className="mt-3 text-xs font-bold text-[#ffb398]">Status update failed. Refresh and try again.</p>
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
