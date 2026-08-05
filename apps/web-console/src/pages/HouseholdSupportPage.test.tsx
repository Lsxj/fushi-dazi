import { screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { HouseholdSupportPage } from './HouseholdSupportPage'
import { renderApp } from '../test/render'
import { server } from '../test/server'

describe('HouseholdSupportPage', () => {
  it('is read-only and exposes authorization evidence', async () => {
    renderApp(<HouseholdSupportPage />, '/support')

    expect(
      await screen.findByRole('heading', { name: '家庭支持与授权审计' })
    ).toBeInTheDocument()
    expect(screen.getByText('最小权限：只读支持')).toBeInTheDocument()
    expect(
      await screen.findByText('授权凭证：已记录', { exact: false })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /确认并更新安全档案/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /打开合成测试场景/ })
    ).toHaveAttribute('href', '/developer/scenarios/collaboration')
  })

  it('fails closed when support data cannot be loaded', async () => {
    server.use(
      http.get('*/api/v1/collaboration/audit', () => HttpResponse.error())
    )
    renderApp(<HouseholdSupportPage />, '/support')

    expect(
      await screen.findByRole('heading', { name: '家庭支持数据加载失败' })
    ).toBeInTheDocument()
    expect(screen.queryByText('家庭授权记录')).not.toBeInTheDocument()
  })
})
