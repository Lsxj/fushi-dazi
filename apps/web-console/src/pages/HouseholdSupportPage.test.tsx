import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { HouseholdSupportPage } from './HouseholdSupportPage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('HouseholdSupportPage', () => {
  it('shows a metadata-only queue and never exposes profile mutation controls', async () => {
    renderApp(<HouseholdSupportPage />, '/support')

    expect(
      await screen.findByRole('heading', { name: 'Household Support Cases' })
    ).toBeInTheDocument()
    expect(screen.getByText('metadata-only')).toBeInTheDocument()
    expect(
      (await screen.findAllByText('Potentially unsafe food appeared in a menu')).length
    ).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Case timeline' })).toBeInTheDocument()
    expect(screen.getByText('Case submitted by parent')).toBeInTheDocument()
    expect(screen.getAllByText('SLA breached').length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /Confirm and update safety profile/ })
    ).not.toBeInTheDocument()
  })

  it('lets an operator narrow the queue without mutating any case', async () => {
    const user = userEvent.setup()
    renderApp(<HouseholdSupportPage />, '/support')

    expect(await screen.findByText('Showing 1')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Severity'), 'medium')
    expect(screen.getByRole('heading', { name: 'No matching cases' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Showing 1')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search cases'), 'missing-client-version')
    expect(screen.getByRole('heading', { name: 'No matching cases' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assign to me' })).not.toBeInTheDocument()
  })

  it('requires safety review before resolving a critical family report', async () => {
    const user = userEvent.setup()
    renderApp(<HouseholdSupportPage />, '/support')

    await user.click(
      await screen.findByRole('button', { name: 'Assign to me' })
    )
    await user.click(await screen.findByRole('button', { name: 'Save finding' }))
    await user.click(await screen.findByRole('button', { name: 'Escalate for safety review' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(await screen.findByRole('button', { name: 'Sign in as Safety Reviewer' }))
    await user.selectOptions(screen.getByLabelText('Resolution'), 'guidance-provided')
    await user.click(screen.getByRole('button', { name: 'Complete safety review' }))
    expect((await screen.findAllByText('Resolved')).length).toBeGreaterThan(0)
    expect(screen.getByText('Resolution recorded')).toBeInTheDocument()
    expect(screen.queryByText(/guidance-provided/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close case' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close case' }))
    expect(await screen.findByRole('heading', { name: 'No matching cases' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect((await screen.findAllByText('Closed')).length).toBeGreaterThan(0)
  })

  it('fails closed when support data cannot be loaded', async () => {
    server.use(
      http.get('*/api/v1/support/cases', () => HttpResponse.error())
    )
    renderApp(<HouseholdSupportPage />, '/support')

    expect(
      await screen.findByRole('heading', { name: 'Unable to load support cases' })
    ).toBeInTheDocument()
    expect(screen.queryByText('Open queue')).not.toBeInTheDocument()
  })

  it('requires a server session before loading the internal queue', async () => {
    server.use(
      http.get('*/api/v1/auth/session', () =>
        HttpResponse.json({
          authenticated: false,
          identityMode: 'local-demo-session',
          sessionTransport: 'http-only-cookie',
        })
      )
    )
    renderApp(<HouseholdSupportPage />, '/support')

    expect(
      await screen.findByRole('heading', { name: 'Sign in to the operations workspace' })
    ).toBeInTheDocument()
    expect(screen.queryByText('Open queue')).not.toBeInTheDocument()
    expect(screen.getByText(/case requests cannot forge an actor in the browser/)).toBeInTheDocument()
  })

  it('shows real CloudBase credentials without allowing a client-selected role', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/auth/session', () =>
        HttpResponse.json({
          authenticated: false,
          identityMode: 'cloudbase-access-token',
          sessionTransport: 'bearer-access-token',
        })
      )
    )
    renderApp(<HouseholdSupportPage />, '/support')

    expect(await screen.findByLabelText('Administrator email or username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Sign in as Safety Reviewer')).not.toBeInTheDocument()
    expect(screen.getByText(/roles cannot be selected in the browser/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Administrator email or username'), 'operator@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText('CloudBase administrator sign-in is not configured')
    ).toBeInTheDocument()
  })

  it('does not auto-attach a missing trace as investigation evidence', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/observability/traces', () =>
        HttpResponse.json({
          traces: [],
          summary: { total: 0, allowed: 0, blocked: 0, averageDurationMs: 0 },
          persistenceMode: 'process-memory',
          retentionDays: 30,
          privacyMode: 'summary-only',
        })
      )
    )
    renderApp(<HouseholdSupportPage />, '/support')

    await user.click(await screen.findByRole('button', { name: 'Assign to me' }))

    expect(screen.getByText('Verifiable evidence added automatically')).toBeInTheDocument()
    expect(screen.queryByText('Safety trace reference')).not.toBeInTheDocument()
    expect(screen.getByText('Diagnostic context')).toBeInTheDocument()
    expect(screen.getByText(/no matching summary exists in this runtime/)).toBeInTheDocument()
  })
})
