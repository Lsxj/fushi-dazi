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
      await screen.findByRole('heading', { name: '最近规则执行' })
    ).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1.14 ms')).toBeInTheDocument()
    expect(screen.getByText('provider: none')).toBeInTheDocument()
    expect(screen.getByText(/summary-only/)).toBeInTheDocument()
    expect(screen.getByText('未知食材必须阻断')).toBeInTheDocument()
    expect(screen.getAllByText('PASS')).toHaveLength(4)
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
          privacyMode: 'summary-only',
        })
      )
    )
    renderApp(<ObservabilityPage />, '/observability')

    expect(
      await screen.findByText('还没有可观测执行')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /前往安全实验室/ })
    ).toHaveAttribute('href', '/safety')
  })

  it('shows a recoverable service error and refreshes', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/observability/traces', () => HttpResponse.error()),
      http.get('*/api/v1/evaluations/safety', () => HttpResponse.error())
    )
    renderApp(<ObservabilityPage />, '/observability')

    expect(
      await screen.findByText('观测数据加载失败')
    ).toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: /刷新数据/ }))

    await waitFor(() =>
      expect(screen.getByText('最近规则执行')).toBeInTheDocument()
    )
  })
})
