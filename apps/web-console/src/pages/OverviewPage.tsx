import { Link } from 'react-router'

import { Icon } from '../components/Icon'

const capabilities = [
  {
    icon: 'shield' as const,
    label: 'Rule-first safety',
    value: 'Deterministic rules',
    detail: 'Allergies, trial windows, and food-pairing restrictions are never left for a model to guess.',
  },
  {
    icon: 'code' as const,
    label: 'Contract-first API',
    value: 'End-to-end type safety',
    detail: 'Zod and oRPC keep inputs, outputs, and the OpenAPI specification aligned.',
  },
  {
    icon: 'layers' as const,
    label: 'Agentic workflow',
    value: '23 MCP tools',
    detail: 'A tool layer for meal planning, inventory, meal records, and reaction analysis.',
  },
  {
    icon: 'shield' as const,
    label: 'Multi-caregiver safety',
    value: 'Caregiver collaboration',
    detail: 'Reaction records, change requests, primary-caregiver approval, and profile history.',
  },
]

const layers = [
  {
    no: '01',
    name: 'Experience',
    tech: 'WeChat Mini Program · React Console',
    note: 'A production user experience paired with an inspectable engineering console.',
  },
  {
    no: '02',
    name: 'AI Orchestration',
    tech: 'MCP · Skills · Provider Adapter',
    note: 'Turns natural-language intent into auditable tool calls.',
  },
  {
    no: '03',
    name: 'Safety Boundary',
    tech: 'Zod · oRPC · Deterministic Rules',
    note: 'Validate first, decide second; models cannot bypass hard safety rules.',
  },
  {
    no: '04',
    name: 'Quality & Delivery',
    tech: 'Vitest · MSW · GitHub Actions',
    note: 'Offline tests, coverage gates, and CI across two Node.js versions.',
  },
]

export function OverviewPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-black/8">
        <div className="pointer-events-none absolute -right-28 -top-36 size-[34rem] rounded-full bg-[#de6a3b]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-52 left-1/3 size-[30rem] rounded-full bg-[#2f7663]/10 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1.18fr_.82fr] lg:px-8 lg:py-28">
          <div className="relative">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#183f35]/15 bg-white/65 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[#315f52]">
              <span className="size-1.5 rounded-full bg-[#df5c34]" />
              Developer tools · architecture evidence
            </div>
            <h1 className="max-w-4xl text-[clamp(3rem,7.2vw,6.8rem)] font-black leading-[0.92] tracking-[-0.065em] text-[#183f35]">
              Engineering architecture,
              <br />
              <span className="text-[#df5c34]">backed by working evidence.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-8 text-[#59675f] sm:text-lg">
              Built for developers and technical reviewers, this area brings together the contract-first API,
              deterministic safety boundaries, MCP workflows, and quality gates. Operations teams do not need
              to work with these implementation details.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-3 rounded-full bg-[#183f35] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(24,63,53,.18)] transition hover:-translate-y-0.5 hover:bg-[#245949]"
                to="/safety"
              >
                Open Rule Validation <Icon name="arrow" size={17} />
              </Link>
              <Link
                className="inline-flex items-center gap-3 rounded-full border border-black/12 bg-white/70 px-6 py-3.5 text-sm font-bold text-[#183f35] transition hover:bg-white"
                to="/observability"
              >
                View AI Quality <Icon name="arrow" size={16} />
              </Link>
              <a
                className="inline-flex items-center gap-3 rounded-full border border-black/12 bg-white/70 px-6 py-3.5 text-sm font-bold text-[#183f35] transition hover:bg-white"
                href="/openapi.json"
                rel="noreferrer"
                target="_blank"
              >
                View OpenAPI <Icon name="external" size={16} />
              </a>
            </div>
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="relative aspect-square w-full max-w-[31rem] rounded-[2.5rem] border border-white/70 bg-[#183f35] p-5 shadow-[0_30px_80px_rgba(24,63,53,.2)]">
              <div className="absolute inset-0 overflow-hidden rounded-[2.5rem]">
                <div className="absolute -right-16 -top-16 size-72 rounded-full border-[52px] border-white/5" />
                <div className="absolute -bottom-20 -left-20 size-80 rounded-full border-[58px] border-[#e77a4f]/15" />
              </div>
              <div className="relative flex h-full flex-col justify-between rounded-[1.8rem] border border-white/12 bg-white/[.055] p-6 text-white sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.22em] text-white/55">
                    Live system map
                  </span>
                  <span className="flex items-center gap-2 text-xs font-semibold text-[#bce4d7]">
                    <span className="size-2 rounded-full bg-[#78d5b9] shadow-[0_0_0_6px_rgba(120,213,185,.1)]" />
                    Contract healthy
                  </span>
                </div>
                <div className="my-6 space-y-3">
                  {['Experience layer', 'AI orchestration', 'Safety boundary'].map(
                    (label, index) => (
                      <div
                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-sm"
                        key={label}
                      >
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-black ${
                            index === 2
                              ? 'bg-[#e77a4f] text-white'
                              : 'bg-white/10 text-white/70'
                          }`}
                        >
                          0{index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold">{label}</div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-[#78d5b9]"
                              style={{ width: `${91 - index * 7}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-5 text-center">
                  <div>
                    <strong className="block text-xl">98.9%</strong>
                    <span className="text-[10px] uppercase tracking-wide text-white/50">
                      API statements
                    </span>
                  </div>
                  <div>
                    <strong className="block text-xl">23</strong>
                    <span className="text-[10px] uppercase tracking-wide text-white/50">
                      MCP tools
                    </span>
                  </div>
                  <div>
                    <strong className="block text-xl">0</strong>
                    <span className="text-[10px] uppercase tracking-wide text-white/50">
                      key required
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((item) => (
            <article
              className="group rounded-[1.6rem] border border-black/8 bg-white/65 p-6 transition hover:-translate-y-1 hover:bg-white hover:shadow-[0_20px_50px_rgba(24,63,53,.08)]"
              key={item.label}
            >
              <div className="mb-8 grid size-11 place-items-center rounded-2xl bg-[#e4ece6] text-[#183f35] group-hover:bg-[#183f35] group-hover:text-white">
                <Icon name={item.icon} />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#839087]">
                {item.label}
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-[#183f35]">
                {item.value}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#68756e]">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#e9e9e2]">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
          <div className="mb-12 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#df5c34]">
              Solution blueprint
            </span>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-[#183f35] sm:text-5xl">
              From user need to auditable decision
            </h2>
          </div>
          <div className="overflow-hidden rounded-[1.8rem] border border-black/8 bg-[#f7f7f3]">
            {layers.map((layer, index) => (
              <div
                className={`grid gap-4 p-6 sm:grid-cols-[4rem_1fr_1fr] sm:items-center lg:p-8 ${
                  index < layers.length - 1 ? 'border-b border-black/8' : ''
                }`}
                key={layer.no}
              >
                <span className="font-mono text-sm font-bold text-[#df5c34]">
                  {layer.no}
                </span>
                <div>
                  <h3 className="text-lg font-black text-[#183f35]">
                    {layer.name}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-[#59675f]">
                    {layer.tech}
                  </p>
                </div>
                <p className="text-sm leading-6 text-[#68756e]">{layer.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
