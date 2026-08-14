import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SafetyLabPage } from './SafetyLabPage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('SafetyLabPage', () => {
  it('runs a typed rule check and explains a safe warning', async () => {
    const user = userEvent.setup()
    renderApp(<SafetyLabPage />, '/safety')

    await user.click(
      screen.getByRole('button', { name: /Run Rule Validation/ })
    )

    expect(await screen.findByText('Safe to continue orchestration')).toBeInTheDocument()
    expect(screen.getByText('deterministic-rules')).toBeInTheDocument()
    expect(screen.getByText('Food-pairing guidance')).toBeInTheDocument()
    expect(screen.getByText(/Blanch spinach for 30 seconds/)).toBeInTheDocument()
    expect(screen.getAllByText('PASS')).toHaveLength(2)
  })

  it('switches profile and renders an individual-allergy block', async () => {
    const user = userEvent.setup()
    renderApp(<SafetyLabPage />, '/safety')

    await user.click(
      screen.getByRole('button', { name: /Individual allergy block/ })
    )
    await user.click(
      screen.getByRole('button', { name: /Run Rule Validation/ })
    )

    expect(await screen.findByText('Blocked by a safety rule')).toBeInTheDocument()
    expect(screen.getByText('Egg yolk is marked as an allergy')).toBeInTheDocument()
    expect(screen.getByText('BLOCK')).toBeInTheDocument()
    expect(screen.getByText('10 months old')).toBeInTheDocument()
  })

  it('disables empty submissions, parses separators, and resets the lab', async () => {
    const user = userEvent.setup()
    renderApp(<SafetyLabPage />, '/safety')

    const input = screen.getByLabelText('Foods to validate')
    const submit = screen.getByRole('button', { name: /Run Rule Validation/ })

    await user.clear(input)
    expect(submit).toBeDisabled()

    await user.type(input, '菠菜、菠菜、豆腐')
    expect(screen.getByText('2/10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(input).toHaveValue('菠菜、豆腐')
  })

  it('shows a recoverable connection error and retries successfully', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/safety/check', () => HttpResponse.error())
    )
    renderApp(<SafetyLabPage />, '/safety')

    await user.click(
      screen.getByRole('button', { name: /Run Rule Validation/ })
    )

    expect(await screen.findByText('Validation did not complete')).toBeInTheDocument()
    expect(screen.getByText(/Unable to reach the rule service/)).toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Run again' }))
    await waitFor(() =>
      expect(screen.getByText('Safe to continue orchestration')).toBeInTheDocument()
    )
  })
})
