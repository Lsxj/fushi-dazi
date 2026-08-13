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
      await screen.findByRole('heading', { name: 'Operations & Safety Overview' })
    ).toBeInTheDocument()
    expect(await screen.findByText('Pre-release safety gate')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Run rule validation/i }))

    expect(
      screen.getByRole('heading', { name: 'Safety Rule Validation' })
    ).toBeInTheDocument()
  })

  it('supports the compact navigation menu', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    const toggle = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const labLinks = screen.getAllByRole('link', { name: 'Rule Validation' })
    fireEvent.click(labLinks.at(-1)!)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByRole('heading', { name: 'Safety Rule Validation' })
    ).toBeInTheDocument()
  })

  it('opens AI quality from the operations dashboard', async () => {
    const user = userEvent.setup()
    renderApp(<App />)

    await screen.findByText('Pre-release safety gate')
    await user.click(screen.getByRole('link', { name: /Review failures and traces/ }))

    expect(
      await screen.findByRole('heading', { name: 'AI Quality & Safety' })
    ).toBeInTheDocument()
  })

  it('redirects the old collaboration route to read-only support', async () => {
    renderApp(<App />, '/collaboration')

    expect(
      await screen.findByRole('heading', {
        name: 'Household Support Cases',
      })
    ).toBeInTheDocument()
  })

  it('keeps architecture evidence in the developer area', () => {
    renderApp(<App />, '/developer')

    expect(
      screen.getByRole('heading', { name: /Engineering architecture/ })
    ).toBeInTheDocument()
    expect(screen.getByText('23 MCP tools')).toBeInTheDocument()
  })
})
