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
      screen.getByRole('button', { name: /运行确定性检查/ })
    )

    expect(await screen.findByText('可以进入后续编排')).toBeInTheDocument()
    expect(screen.getByText('deterministic-rules')).toBeInTheDocument()
    expect(screen.getByText('搭配提醒')).toBeInTheDocument()
    expect(screen.getByText(/菠菜先焯水 30 秒/)).toBeInTheDocument()
    expect(screen.getAllByText('PASS')).toHaveLength(2)
  })

  it('switches profile and renders an individual-allergy block', async () => {
    const user = userEvent.setup()
    renderApp(<SafetyLabPage />, '/safety')

    await user.click(
      screen.getByRole('button', { name: /个体过敏拦截/ })
    )
    await user.click(
      screen.getByRole('button', { name: /运行确定性检查/ })
    )

    expect(await screen.findByText('已触发安全拦截')).toBeInTheDocument()
    expect(screen.getByText('蛋黄已标记过敏')).toBeInTheDocument()
    expect(screen.getByText('BLOCK')).toBeInTheDocument()
    expect(screen.getByText('10 月龄')).toBeInTheDocument()
  })

  it('disables empty submissions, parses separators, and resets the lab', async () => {
    const user = userEvent.setup()
    renderApp(<SafetyLabPage />, '/safety')

    const input = screen.getByLabelText('待检查食材')
    const submit = screen.getByRole('button', { name: /运行确定性检查/ })

    await user.clear(input)
    expect(submit).toBeDisabled()

    await user.type(input, '菠菜, 菠菜 豆腐')
    expect(screen.getByText('2/10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(input).toHaveValue('菠菜、豆腐')
  })

  it('shows a recoverable connection error and retries successfully', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/safety/check', () => HttpResponse.error())
    )
    renderApp(<SafetyLabPage />, '/safety')

    await user.click(
      screen.getByRole('button', { name: /运行确定性检查/ })
    )

    expect(await screen.findByText('检查未完成')).toBeInTheDocument()
    expect(screen.getByText(/无法连接规则服务/)).toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '重新运行' }))
    await waitFor(() =>
      expect(screen.getByText('可以进入后续编排')).toBeInTheDocument()
    )
  })
})
