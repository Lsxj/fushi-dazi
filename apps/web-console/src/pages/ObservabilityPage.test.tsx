import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ObservabilityPage } from './ObservabilityPage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('ObservabilityPage', () => {
  it('shows privacy-safe runtime metrics and deterministic evaluations', async () => {
    renderApp(<ObservabilityPage />, '/observability')

    expect(
      await screen.findByRole('heading', { name: 'Recent rule executions' })
    ).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1.14 ms')).toBeInTheDocument()
    expect(screen.getByText('provider: none')).toBeInTheDocument()
    expect(screen.getByText(/summary-only/)).toBeInTheDocument()
    expect(screen.getByText('process-memory · retained for 30 days')).toBeInTheDocument()
    expect(screen.getByText('Unknown food must be blocked')).toBeInTheDocument()
    expect(screen.getByText('AI tool orchestration evaluation')).toBeInTheDocument()
    expect(screen.getByText('Tool selection')).toBeInTheDocument()
    expect(screen.getByText('Safety block recall')).toBeInTheDocument()
    expect(screen.getByText(/Grounding proxy is not factual-answer accuracy/)).toBeInTheDocument()
    expect(screen.getByText('Trials from a locked category must be blocked')).toBeInTheDocument()
    expect(screen.getAllByText('PASS')).toHaveLength(6)
    expect(screen.queryByText('鳕鱼')).not.toBeInTheDocument()
  })

  it('guides the user to create the first trace', async () => {
    server.use(
      http.get('*/api/v1/observability/traces', () =>
        HttpResponse.json({
          traces: [],
          summary: {
            total: 0,
            allowed: 0,
            blocked: 0,
            averageDurationMs: 0,
          },
          persistenceMode: 'process-memory',
          retentionDays: 30,
          privacyMode: 'summary-only',
        })
      )
    )
    renderApp(<ObservabilityPage />, '/observability')

    expect(
      await screen.findByText('No observable executions yet')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Go to Rule Validation/ })
    ).toHaveAttribute('href', '/safety')
  })

  it('shows a recoverable service error and refreshes', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/observability/traces', () => HttpResponse.error()),
      http.get('*/api/v1/evaluations/safety', () => HttpResponse.error()),
      http.get('*/api/v1/evaluations/agentic', () => HttpResponse.error())
    )
    renderApp(<ObservabilityPage />, '/observability')

    expect(
      await screen.findByText('Unable to load observability data')
    ).toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: /Refresh data/ }))

    await waitFor(() =>
      expect(screen.getByText('Recent rule executions')).toBeInTheDocument()
    )
  })
})
