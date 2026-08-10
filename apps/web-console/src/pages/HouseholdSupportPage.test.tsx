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
    expect(screen.getByRole('heading', { name: '处理时间线' })).toBeInTheDocument()
    expect(screen.getByText('家长提交工单')).toBeInTheDocument()
    expect(screen.getAllByText('SLA 已超时').length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('button', { name: /确认并更新安全档案/ })
    ).not.toBeInTheDocument()
  })

  it('lets an operator narrow the queue without mutating any case', async () => {
    const user = userEvent.setup()
    renderApp(<HouseholdSupportPage />, '/support')

    expect(await screen.findByText('显示 1 条')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('严重级别'), 'medium')
    expect(screen.getByRole('heading', { name: '没有符合条件的工单' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(await screen.findByText('显示 1 条')).toBeInTheDocument()

    await user.type(screen.getByLabelText('搜索工单'), '不存在的客户端版本')
    expect(screen.getByRole('heading', { name: '没有符合条件的工单' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '认领并开始调查' })).not.toBeInTheDocument()
  })

  it('requires safety review before resolving a critical family report', async () => {
    const user = userEvent.setup()
    renderApp(<HouseholdSupportPage />, '/support')

    await user.click(
      await screen.findByRole('button', { name: '认领并开始调查' })
    )
    await user.click(await screen.findByRole('button', { name: '保存调查结论' }))
    await user.click(await screen.findByRole('button', { name: '升级安全审核' }))
    await user.click(screen.getByRole('button', { name: '退出登录' }))
    await user.click(await screen.findByRole('button', { name: '使用安全审核人身份登录' }))
    await user.selectOptions(screen.getByLabelText('解决结论'), 'guidance-provided')
    await user.click(screen.getByRole('button', { name: '安全复核并解决' }))
    await user.click(screen.getByRole('button', { name: '全部' }))

    expect((await screen.findAllByText('已解决')).length).toBeGreaterThan(0)
    expect(screen.getByText('记录解决结论')).toBeInTheDocument()
    expect(screen.queryByText(/guidance-provided/)).not.toBeInTheDocument()
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
      await screen.findByRole('heading', { name: '登录内部运营工作台' })
    ).toBeInTheDocument()
    expect(screen.queryByText('待处理队列')).not.toBeInTheDocument()
    expect(screen.getByText(/前端不能在工单请求中伪造 actor/)).toBeInTheDocument()
  })

  it('shows real CloudBase credentials without allowing a client-selected role', async () => {
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

    expect(await screen.findByLabelText('管理员邮箱或用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: '登录后台' })).toBeInTheDocument()
    expect(screen.queryByText('使用安全审核人身份登录')).not.toBeInTheDocument()
    expect(screen.getByText(/前端不能自行选择角色/)).toBeInTheDocument()
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

    await user.click(await screen.findByRole('button', { name: '认领并开始调查' }))

    expect(screen.getByText('系统自动带入可核验证据')).toBeInTheDocument()
    expect(screen.queryByText('安全 Trace 引用')).not.toBeInTheDocument()
    expect(screen.getByText('基础诊断上下文')).toBeInTheDocument()
    expect(screen.getByText(/当前运行实例中未找到对应摘要/)).toBeInTheDocument()
  })
})
