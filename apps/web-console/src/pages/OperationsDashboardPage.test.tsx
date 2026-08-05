import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    expect(screen.getByText('1 条关键安全问题')).toBeInTheDocument()
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

  it('captures evidence and records an explicit human release review', async () => {
    const user = userEvent.setup()
    renderApp(<OperationsDashboardPage />)

    await user.click(
      await screen.findByRole('button', { name: '生成审核候选' })
    )
    expect(await screen.findByText('v1.0.5-rc.1')).toBeInTheDocument()
    const approve = screen.getByRole('button', { name: '批准进入人工发布' })
    expect(approve).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: /我已核对安全阻断召回/,
      })
    )
    await user.click(approve)

    expect(await screen.findByText('approved')).toBeInTheDocument()
    expect(
      screen.getByText(/已核对自动检查证据，批准进入人工发布步骤/)
    ).toBeInTheDocument()
  })
})
