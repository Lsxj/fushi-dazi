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
      await screen.findByRole('heading', { name: '谁正在操作？' })
    ).toBeInTheDocument()
    expect(screen.getByText('合成家庭数据')).toBeInTheDocument()
    expect(screen.getByText('已确认正常')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /只读家人/ }))
    await user.click(screen.getByRole('button', { name: /提交变更申请/ }))

    expect(await screen.findByText('申请未提交')).toBeInTheDocument()
    expect(screen.getByText(/只读家人不能提交档案变更/)).toBeInTheDocument()
    expect(screen.getByText('已确认正常')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /共同照护人/ }))
    expect(screen.queryByText('申请未提交')).not.toBeInTheDocument()
  })

  it('moves a caregiver request to primary-caregiver confirmation', async () => {
    const user = userEvent.setup()
    renderApp(<CollaborationPage />, '/collaboration')

    await screen.findByRole('heading', { name: '谁正在操作？' })
    await user.click(screen.getByRole('button', { name: /提交变更申请/ }))

    expect(await screen.findByText('等待主照护人确认')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: '切换为主照护人审核' })
    )

    const confirm = screen.getByRole('button', {
      name: '确认并更新安全档案',
    })
    expect(confirm).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', {
        name: /我已核对 reaction-demo-001/,
      })
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await screen.findByText('安全档案已更新')).toBeInTheDocument()
    expect(screen.getByText(/安全档案已经更新 · 档案版本 v2/)).toBeInTheDocument()
  })

  it('shows household service loading failures', async () => {
    server.use(
      http.get('*/api/v1/collaboration/household', () =>
        HttpResponse.error()
      ),
      http.get('*/api/v1/collaboration/audit', () => HttpResponse.error())
    )
    renderApp(<CollaborationPage />, '/collaboration')

    expect(
      await screen.findByText('家庭协作服务加载失败')
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

    await screen.findByRole('heading', { name: '谁正在操作？' })
    await user.click(screen.getByRole('button', { name: /提交变更申请/ }))

    expect(
      await screen.findByText('变更申请暂时无法提交，请重试。')
    ).toBeInTheDocument()
  })
})
