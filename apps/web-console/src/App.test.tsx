import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { App } from './App'
import { renderApp } from './test/render'

describe('operations console navigation', () => {
  it('presents the operations queue and opens rule verification', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    expect(
      await screen.findByRole('heading', { name: '运营与安全总览' })
    ).toBeInTheDocument()
    expect(await screen.findByText('发布前安全门禁')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /运行规则验证/ }))

    expect(
      screen.getByRole('heading', { name: '安全规则验证' })
    ).toBeInTheDocument()
  })

  it('supports the compact navigation menu', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    const toggle = screen.getByRole('button', { name: '切换导航' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const labLinks = screen.getAllByRole('link', { name: '规则验证' })
    fireEvent.click(labLinks.at(-1)!)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('heading', { name: '安全规则验证' })
    ).toBeInTheDocument()
  })

  it('opens AI quality from the operations dashboard', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    await screen.findByText('发布前安全门禁')
    await user.click(screen.getByRole('link', { name: /查看失败案例与 trace/ }))

    expect(
      await screen.findByRole('heading', { name: 'AI 质量与安全评估' })
    ).toBeInTheDocument()
  })

  it('redirects the old collaboration route to read-only support', async () => {
    renderApp(<App />, '/collaboration')

    expect(
      await screen.findByRole('heading', {
        name: '家庭支持与授权审计',
      })
    ).toBeInTheDocument()
  })

  it('keeps architecture evidence in the developer area', () => {
    renderApp(<App />, '/developer')

    expect(
      screen.getByRole('heading', { name: /工程架构与/ })
    ).toBeInTheDocument()
    expect(screen.getByText('23 MCP tools')).toBeInTheDocument()
  })
})
