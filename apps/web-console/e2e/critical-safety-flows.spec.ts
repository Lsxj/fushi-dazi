import { expect, test } from '@playwright/test'

test('blocks an individual allergy through the real React and API boundary', async ({
  page,
}) => {
  await page.goto('/safety')

  await page.getByRole('button', { name: /个体过敏拦截/ }).click()
  await expect(page.getByLabel('待检查食材')).toHaveValue('蛋黄、高铁米粉')

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/safety/check') &&
      response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '运行确定性检查' }).click()
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
    page.getByRole('heading', { name: '已触发安全拦截' })
  ).toBeVisible()
  await expect(page.getByText('蛋黄已标记过敏')).toBeVisible()
  await expect(page.getByText('BLOCK')).toBeVisible()
  await expect(page.getByText('deterministic-rules')).toBeVisible()
})

test('requires owner confirmation before changing the profile and menu', async ({
  page,
}) => {
  await page.goto('/collaboration')

  await expect(
    page.getByRole('heading', { name: '谁正在操作？' })
  ).toBeVisible()
  await expect(page.getByText('鳕鱼蔬菜粥').first()).toBeVisible()

  await page.getByRole('button', { name: /只读家人/ }).click()
  await page.getByRole('button', { name: /提交变更申请/ }).click()
  await expect(page.getByText('申请未提交')).toBeVisible()
  await expect(
    page.getByText(/只读家人不能提交档案变更 · 审计记录/)
  ).toBeVisible()
  await expect(page.getByText('已确认正常')).toBeVisible()

  await page.getByRole('button', { name: /共同照护人/ }).click()
  await page.getByRole('button', { name: /提交变更申请/ }).click()
  await expect(
    page.getByText('等待主照护人确认', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('鳕鱼蔬菜粥').first()).toBeVisible()

  await page
    .getByRole('button', { name: '切换为主照护人审核' })
    .click()
  const confirmButton = page.getByRole('button', {
    name: '确认并更新安全档案',
  })
  await expect(confirmButton).toBeDisabled()

  await page
    .getByRole('checkbox', { name: /我已核对 reaction-demo-001/ })
    .check()
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()

  await expect(page.getByText('安全档案已更新')).toBeVisible()
  await expect(page.getByText(/安全档案已经更新 · 档案版本 v2/)).toBeVisible()
  await expect(page.getByText('永久过敏', { exact: true })).toBeVisible()
  await expect(page.getByText('牛肉土豆粥')).toBeVisible()
  await expect(page.getByText('已排除：鳕鱼蔬菜粥')).toBeVisible()
  await expect(page.getByText(/关联确认凭证：是/)).toBeVisible()
})
