import { expect, test } from '@playwright/test'

test('blocks an individual allergy through the real React and API boundary', async ({
  page,
}) => {
  await page.goto('/safety')

  await page.getByRole('button', { name: /Individual allergy block/ }).click()
  await expect(page.getByLabel('Foods to validate')).toHaveValue('Egg yolk, Iron-fortified rice cereal')

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/safety/check') &&
      response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Run Rule Validation' }).click()
  const response = await responsePromise
  const payload = (await response.json()) as {
    safe: boolean
    decisionSource: string
  }

  expect(payload).toMatchObject({
    safe: false,
    decisionSource: 'deterministic-rules',
  })
  await expect(
    page.getByRole('heading', { name: 'Blocked by a safety rule' })
  ).toBeVisible()
  await expect(page.getByText('Egg yolk is marked as an allergy')).toBeVisible()
  await expect(page.getByText('BLOCK', { exact: true })).toBeVisible()
  await expect(page.getByText('deterministic-rules')).toBeVisible()
})

test('requires owner confirmation before changing the profile and menu', async ({
  page,
}) => {
  await page.goto('/developer/scenarios/collaboration')

  await expect(
    page.getByRole('heading', { name: 'Who is acting?' })
  ).toBeVisible()
  await expect(page.getByText('Cod and vegetable porridge').first()).toBeVisible()

  await page.getByRole('button', { name: /View-only Member/ }).click()
  await page.getByRole('button', { name: /Submit change request/ }).click()
  await expect(page.getByText('Request not submitted')).toBeVisible()
  await expect(
    page.getByText(/View-only members cannot request profile changes · audit record/)
  ).toBeVisible()
  await expect(page.getByText('Established food')).toBeVisible()

  await page.getByRole('button', { name: /^Caregiver/ }).click()
  await page.getByRole('button', { name: /Submit change request/ }).click()
  await expect(
    page.getByText('Waiting for primary-caregiver approval', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('Cod and vegetable porridge').first()).toBeVisible()

  await page
    .getByRole('button', { name: 'Switch to Primary Caregiver' })
    .click()
  const confirmButton = page.getByRole('button', {
    name: 'Confirm and update safety profile',
  })
  await expect(confirmButton).toBeDisabled()

  await page
    .getByRole('checkbox', { name: /I reviewed reaction-demo-001/ })
    .check()
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()

  await expect(page.getByText('Safety profile updated')).toBeVisible()
  await expect(page.getByText(/The safety profile has been updated · profile version v2/)).toBeVisible()
  await expect(page.getByText('Permanent allergy', { exact: true })).toBeVisible()
  await expect(page.getByText('Beef and potato porridge')).toBeVisible()
  await expect(page.getByText('Excluded: Cod and vegetable porridge')).toBeVisible()
  await expect(page.getByText(/Confirmation evidence attached: Yes/)).toBeVisible()
})

test('turns an explicitly consented family report into an audited safety case', async ({
  page,
}) => {
  const created = await page.request.post(
    'http://127.0.0.1:3100/api/v1/support/cases',
    {
      data: {
        reason: 'unsafe-food-in-menu',
        context: {
          clientVersion: '1.0.4',
          occurredAt: '2026-08-05T09:00:00.000Z',
          menuDate: '2026-08-06',
          profileVersion: 3,
        },
        consentToUploadDiagnostics: true,
      },
    }
  )
  expect(created.ok()).toBe(true)

  await page.goto('/support')
  await expect(
    page.getByRole('heading', { name: 'Household Support Cases' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Sign in as Support Agent' }).click()
  await expect(page.getByText('Potentially unsafe food appeared in a menu').first()).toBeVisible()
  await page.getByRole('button', { name: 'Assign to me' }).click()
  await expect(page.getByText('Investigating', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Save finding' }).click()
  await expect(page.getByText('Saved: Confirmed product defect')).toBeVisible()
  await page.getByRole('button', { name: 'Escalate for safety review' }).click()
  await expect(page.getByText('Safety review', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('button', { name: 'Sign in as Safety Reviewer' }).click()
  await page.getByRole('button', { name: 'Complete safety review' }).click()
  await page.getByRole('button', { name: 'All', exact: true }).click()

  await expect(page.getByText('Resolved').first()).toBeVisible()
  await expect(page.getByText('Resolution recorded')).toBeVisible()
  await page.getByRole('button', { name: 'Close case' }).click()
  await expect(page.getByText('Closed').first()).toBeVisible()
})
