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
      await screen.findByRole('heading', { name: 'Pre-release safety gate' })
    ).toBeInTheDocument()
    expect(screen.getByText('READY FOR REVIEW')).toBeInTheDocument()
    expect(screen.getByText('1 critical safety issues')).toBeInTheDocument()
    expect(screen.getByText('mock-policy · offline evaluation')).toBeInTheDocument()
  })

  it('does not render a stale release decision when one source fails', async () => {
    server.use(
      http.get('*/api/v1/evaluations/agentic', () => HttpResponse.error())
    )
    renderApp(<OperationsDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: 'Unable to load operations status' })
    ).toBeInTheDocument()
    expect(screen.queryByText('READY FOR REVIEW')).not.toBeInTheDocument()
  })

  it('captures evidence and records an explicit human release review', async () => {
    const user = userEvent.setup()
    renderApp(<OperationsDashboardPage />)

    await user.click(
      await screen.findByRole('button', { name: 'Create review candidate' })
    )
    expect(await screen.findByText('v1.0.5-rc.1')).toBeInTheDocument()
    const approve = screen.getByRole('button', { name: 'Approve for manual release' })
    expect(approve).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: /I reviewed safety block recall/,
      })
    )
    await user.click(approve)

    expect(await screen.findByText('approved')).toBeInTheDocument()
    expect(
      screen.getByText(/Automated evidence reviewed; approved for the manual release stage/)
    ).toBeInTheDocument()
  })
})
