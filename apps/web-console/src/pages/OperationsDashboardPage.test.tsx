import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { OperationsDashboardPage } from './OperationsDashboardPage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('OperationsDashboardPage', () => {
  it('turns evaluation evidence into an operational release gate', async () => {
    renderApp(<OperationsDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: '发布前安全门禁' })
    ).toBeInTheDocument()
    expect(screen.getByText('READY FOR REVIEW')).toBeInTheDocument()
    expect(screen.getByText('后台只读，不代替主照护人确认')).toBeInTheDocument()
    expect(screen.getByText('mock-policy · 离线评估')).toBeInTheDocument()
  })

  it('does not render a stale release decision when one source fails', async () => {
    server.use(
      http.get('*/api/v1/evaluations/agentic', () => HttpResponse.error())
    )
    renderApp(<OperationsDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: '运营状态加载失败' })
    ).toBeInTheDocument()
    expect(screen.queryByText('READY FOR REVIEW')).not.toBeInTheDocument()
  })
})
