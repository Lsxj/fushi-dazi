import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CollaborationPage } from './CollaborationPage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('CollaborationPage', () => {
  it('blocks a read-only family member from changing the safety profile', async () => {
    const user = userEvent.setup()
    renderApp(<CollaborationPage />, '/collaboration')

    expect(
      await screen.findByRole('heading', { name: 'Who is acting?' })
    ).toBeInTheDocument()
    expect(screen.getByText('Synthetic household data')).toBeInTheDocument()
    expect(screen.getByText('Established food')).toBeInTheDocument()
    expect(screen.getByText('Cod and vegetable porridge')).toBeInTheDocument()
    expect(
      screen.getByText('Every current candidate passes the household safety-profile checks.')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /View-only Member/ }))
    await user.click(screen.getByRole('button', { name: /Submit change request/ }))

    expect(await screen.findByText('Request not submitted')).toBeInTheDocument()
    expect(screen.getByText(/View-only members cannot request profile changes/)).toBeInTheDocument()
    expect(screen.getByText('Established food')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Caregiver/ }))
    expect(screen.queryByText('Request not submitted')).not.toBeInTheDocument()
  })

  it('moves a caregiver request to primary-caregiver confirmation', async () => {
    const user = userEvent.setup()
    renderApp(<CollaborationPage />, '/collaboration')

    await screen.findByRole('heading', { name: 'Who is acting?' })
    await user.click(screen.getByRole('button', { name: /Submit change request/ }))

    expect(await screen.findByText('Waiting for primary-caregiver approval')).toBeInTheDocument()
    expect(screen.getByText('Cod and vegetable porridge')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Switch to Primary Caregiver' })
    )

    const confirm = screen.getByRole('button', {
      name: 'Confirm and update safety profile',
    })
    expect(confirm).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', {
        name: /I reviewed reaction-demo-001/,
      })
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await screen.findByText('Safety profile updated')).toBeInTheDocument()
    expect(screen.getByText(/The safety profile has been updated · profile version v2/)).toBeInTheDocument()
    expect(await screen.findByText('Permanent allergy')).toBeInTheDocument()
    expect(await screen.findByText('Beef and potato porridge')).toBeInTheDocument()
    expect(screen.getByText('Excluded: Cod and vegetable porridge')).toBeInTheDocument()
    expect(screen.getByText(/Cod is marked as an allergy/)).toBeInTheDocument()
  })

  it('shows household service loading failures', async () => {
    server.use(
      http.get('*/api/v1/collaboration/household', () =>
        HttpResponse.error()
      ),
      http.get('*/api/v1/collaboration/audit', () => HttpResponse.error()),
      http.get('*/api/v1/collaboration/menu-preview', () =>
        HttpResponse.error()
      )
    )
    renderApp(<CollaborationPage />, '/collaboration')

    expect(
      await screen.findByText('Unable to load the household collaboration service')
    ).toBeInTheDocument()
  })

  it('shows a retryable change-request failure', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(
        '*/api/v1/collaboration/allergy-changes/request',
        () => HttpResponse.error()
      )
    )
    renderApp(<CollaborationPage />, '/collaboration')

    await screen.findByRole('heading', { name: 'Who is acting?' })
    await user.click(screen.getByRole('button', { name: /Submit change request/ }))

    expect(
      await screen.findByText('The change request could not be submitted. Try again.')
    ).toBeInTheDocument()
  })

  it('shows a stale-profile conflict without claiming the profile changed', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(
        '*/api/v1/collaboration/allergy-changes/confirm',
        () =>
          HttpResponse.json({
            auditId: 'fe16de0d-8163-4289-8689-4a34e4d2a88b',
            decision: 'denied',
            reasonCode: 'profile-version-conflict',
            dataSource: 'synthetic-demo',
            profileUpdated: false,
            profileVersion: 2,
          })
      )
    )
    renderApp(<CollaborationPage />, '/collaboration')

    await screen.findByRole('heading', { name: 'Who is acting?' })
    await user.click(screen.getByRole('button', { name: /Submit change request/ }))
    await user.click(
      await screen.findByRole('button', { name: 'Switch to Primary Caregiver' })
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: /I reviewed reaction-demo-001/,
      })
    )
    await user.click(
      screen.getByRole('button', { name: 'Confirm and update safety profile' })
    )

    expect(await screen.findByText('Profile unchanged')).toBeInTheDocument()
    expect(
      screen.getByText(/Another caregiver updated the profile/)
    ).toBeInTheDocument()
    expect(screen.getByText('Cod and vegetable porridge')).toBeInTheDocument()
  })
})
