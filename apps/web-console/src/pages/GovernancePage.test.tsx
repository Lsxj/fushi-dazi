import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { GovernancePage } from './GovernancePage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('GovernancePage', () => {
  it('denies a viewer through deterministic RBAC', async () => {
    const user = userEvent.setup()
    renderApp(<GovernancePage />, '/governance')

    expect(
      await screen.findByRole('heading', { name: '选择演示角色' })
    ).toBeInTheDocument()
    expect(screen.getByText('mock-demo')).toBeInTheDocument()
    expect(screen.getByText('simulation')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /请求授权/ }))

    expect(await screen.findByText('DENIED')).toBeInTheDocument()
    expect(screen.getByText(/当前角色没有此权限/)).toBeInTheDocument()
  })

  it('requires literal confirmation for the bound safety admin', async () => {
    const user = userEvent.setup()
    renderApp(<GovernancePage />, '/governance')

    const safetyAdmin = await screen.findByRole('button', {
      name: /安全管理员/,
    })
    await user.click(safetyAdmin)
    await user.click(screen.getByRole('button', { name: /请求授权/ }))

    expect(
      await screen.findByText('EXPLICIT CONFIRMATION REQUIRED')
    ).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: '提交显式确认' })
    expect(confirm).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: /我明确确认这是一项不可逆操作/,
      })
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(
      await screen.findByText(/已记录显式确认 · external mutation: false/)
    ).toBeInTheDocument()
  })

  it('shows policy loading failures without presenting false state', async () => {
    server.use(
      http.get('*/api/v1/governance/policy', () => HttpResponse.error()),
      http.get('*/api/v1/governance/audit', () => HttpResponse.error())
    )
    renderApp(<GovernancePage />, '/governance')

    expect(
      await screen.findByText('治理服务加载失败')
    ).toBeInTheDocument()
  })

  it('shows a retryable authorization service failure', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(
        '*/api/v1/governance/actions/request',
        () => HttpResponse.error()
      )
    )
    renderApp(<GovernancePage />, '/governance')

    await screen.findByRole('heading', { name: '选择演示角色' })
    await user.click(screen.getByRole('button', { name: /请求授权/ }))

    expect(
      await screen.findByText('授权服务暂时不可用，请重试。')
    ).toBeInTheDocument()
  })
})
