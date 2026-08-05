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
      await screen.findByRole('heading', { name: '家庭支持工单' })
    ).toBeInTheDocument()
    expect(screen.getByText('metadata-only')).toBeInTheDocument()
    expect(
      (await screen.findAllByText('菜单出现疑似不安全食材')).length
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /确认并更新安全档案/ })
    ).not.toBeInTheDocument()
  })

  it('requires safety review before resolving a critical family report', async () => {
    const user = userEvent.setup()
    renderApp(<HouseholdSupportPage />, '/support')

    await user.click(
      await screen.findByRole('button', { name: '认领并开始调查' })
    )
    await user.click(await screen.findByRole('button', { name: '升级安全审核' }))
    await user.click(screen.getByRole('button', { name: /支持人员 · 切换/ }))
    await user.click(screen.getByRole('button', { name: '安全复核并解决' }))
    await user.click(screen.getByRole('button', { name: '全部' }))

    expect(await screen.findByText('已解决')).toBeInTheDocument()
    expect(screen.getByText(/case-resolved/)).toBeInTheDocument()
  })

  it('fails closed when support data cannot be loaded', async () => {
    server.use(
      http.get('*/api/v1/support/cases', () => HttpResponse.error())
    )
    renderApp(<HouseholdSupportPage />, '/support')

    expect(
      await screen.findByRole('heading', { name: '支持工单加载失败' })
    ).toBeInTheDocument()
    expect(screen.queryByText('待处理队列')).not.toBeInTheDocument()
  })
})
