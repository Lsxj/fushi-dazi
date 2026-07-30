import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { App } from './App'
import { renderApp } from './test/render'

describe('portfolio console navigation', () => {
  it('presents the architecture story and opens the safety lab', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    expect(
      screen.getByRole('heading', { name: /把 AI 能力/ })
    ).toBeInTheDocument()
    expect(screen.getByText('23 MCP tools')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /运行安全实验/ }))

    expect(
      screen.getByRole('heading', { name: '安全规则实验室' })
    ).toBeInTheDocument()
  })

  it('supports the compact navigation menu', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    const toggle = screen.getByRole('button', { name: '切换导航' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const labLinks = screen.getAllByRole('link', { name: '安全规则实验室' })
    fireEvent.click(labLinks.at(-1)!)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('heading', { name: '安全规则实验室' })
    ).toBeInTheDocument()
  })

  it('opens the observability console from the architecture overview', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    await user.click(
      screen.getByRole('link', { name: /查看可观测性/ })
    )

    expect(
      await screen.findByRole('heading', { name: '决策可观测性' })
    ).toBeInTheDocument()
  })

  it('routes to the household collaboration workflow', async () => {
    renderApp(<App />, '/collaboration')

    expect(
      await screen.findByRole('heading', {
        name: '家庭协作与安全档案',
      })
    ).toBeInTheDocument()
  })
})
