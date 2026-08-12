// pages/ai-chat/ai-chat.ts
// AI 助手聊天界面。
//
// Architecture:
//   - 用户输入 → wx.cloud.callFunction({ name: 'chat-ai', data: { question, history } })
//   - 云函数:load profile → Anthropic tool_use loop → 返 { answer, toolCalls, openid }
//   - UI:渲染 user / assistant 消息,toolCalls 折叠成 "调了 N 个工具" trace
//
// We deliberately do NOT call any LLM from the mini-program. The cloud
// function is the only place ANTHROPIC_API_KEY lives — the key never
// reaches the client. (Defense in depth: even if a malicious user dumped
// the .wxapkg, they can't read the key.)
//
// Cloud init:
//   - 调用 `wx.cloud.init` 一次(env 来自 project.config.json 的 cloudfunctionRoot 推断,或显式传入)
//   - 如果用户没开通云开发,init 失败 → 我们降级到本地 mock 模式,这样 QR 预览至少能看 UI + mock 回答
//   - 真实 LLM 走通需要:开通云开发 + 上传 cloudfunctions/chat-ai + 配置 ANTHROPIC_API_KEY

import { routeAgentRequest } from '../../utils/agentRouting'
import { checkFoodsSafety } from '../../utils/safety'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  contentHtml: string
  toolCalls?: ToolCall[]
  traceExpanded?: boolean
  /** Set when this assistant message represents an error (enables retry). */
  error?: boolean
  /** The original user question this was responding to (so retry can replay). */
  retryQuestion?: string
}

interface ToolCall {
  name: string
  input: Record<string, unknown>
  inputJson: string
  ok: boolean
}

const MAX_HISTORY = 20
let nextId = 1
let cloudAvailable = false

Page({
  data: {
    messages: [] as ChatMessage[],
    draft: '',
    loading: false,
    scrollIntoView: '',
    backendMode: 'init', // 'cloud' | 'mock' | 'init'
    localSynced: false, // true after at least one cloud round-trip in this page instance
  },

  onLoad() {
    this.initBackend()
  },

  initBackend() {
    if (!wx.cloud) {
      console.warn('ai-chat: wx.cloud is not available, falling back to mock')
      this.setData({ backendMode: 'mock' })
      return
    }
    try {
      wx.cloud.init({ traceUser: true })
      cloudAvailable = true
      this.setData({ backendMode: 'cloud' })
    } catch (err) {
      console.warn('ai-chat: cloud init failed, falling back to mock:', err)
      this.setData({ backendMode: 'mock' })
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ draft: e.detail.value })
  },

  onQuickTap(e: WechatMiniprogram.TouchEvent) {
    const text = e.currentTarget.dataset.text as string
    this.setData({ draft: text })
    this.onSend()
  },

  onToggleTrace(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number
    const messages: ChatMessage[] = this.data.messages.map((m) =>
      m.id === id ? { ...m, traceExpanded: !m.traceExpanded } : m
    )
    this.setData({ messages })
  },

  async onSend() {
    const question = (this.data.draft || '').trim()
    // Visual + functional guard: empty input or already-loading is a no-op.
    // The .disabled class on the button already prevents most taps, but
    // an enter-key submit on a blank input can still fire this handler.
    if (!question) {
      wx.showToast({ title: '写点什么再发吧', icon: 'none', duration: 1200 })
      return
    }
    if (this.data.loading) return

    // Append the user message and clear the draft.
    const userMsg: ChatMessage = { id: nextId++, role: 'user', content: question, contentHtml: renderMarkdown(question) }
    const messages = [...this.data.messages, userMsg]
    this.setData({
      messages,
      draft: '',
      loading: true,
      scrollIntoView: `msg-${userMsg.id}`,
    })

    // Build the history slice the cloud function expects.
    const history = messages.slice(-MAX_HISTORY, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    if (cloudAvailable) {
      try {
        // Always send a local snapshot. babyProfile is edited locally by
        // profile/review/home pages, while AI tools run in cloudDB. The cloud
        // function treats babyProfile as client-authoritative and returns a
        // post-tool snapshot so local wx.storage stays in sync.
        const res = await wx.cloud.callFunction({
          name: 'chat-ai',
          data: {
            question,
            history,
            _localBackup: this.collectLocalBackup(),
          },
        })
        const result = (res as any).result || {}
        if (!result.ok) {
          this.appendAssistant(`出错了:${result.error || '未知错误'}`)
          return
        }
        this.applyCloudSnapshot(result.storageSnapshot)
        if (!this.data.localSynced) this.setData({ localSynced: true })
        const toolCalls: ToolCall[] = (result.toolCalls ?? []).map((tc: any) => ({
          name: tc.name,
          input: tc.input ?? {},
          inputJson: JSON.stringify(tc.input ?? {}, null, 2),
          ok: !!tc.ok,
        }))
        this.appendAssistant(result.answer || '(AI 没回答)', toolCalls)
      } catch (err) {
        const msg = (err as any)?.errMsg || (err as Error).message || String(err)
        wx.showToast({ title: '发送失败,稍后再试', icon: 'none', duration: 1800 })
        this.appendAssistant(
          `云函数调用失败:${msg}(可能云函数没部署,详见 cloudfunctions/chat-ai/deploy.md)`,
          undefined,
          { error: true, retryQuestion: question }
        )
      } finally {
        this.setData({ loading: false })
      }
    } else {
      // Local mock mode — used when cloud isn't set up. Lets you see the
      // full UI flow in a DevTools preview without deploying anything.
      this.runMock(question)
    }
  },

  collectLocalBackup(): Record<string, unknown> {
    // Read the 7 storage keys from the mini-program's local wx.storage.
    // Mirrors the STORAGE_KEYS registry in cloudfunctions/chat-ai/wx-shim.js.
    const KEYS = [
      'babyProfile',
      'fridge',
      'manualShopList',
      'mealJournal',
      'reactions',
      'customFoods',
      'weeklyPlan',
    ]
    const out: Record<string, unknown> = {}
    for (const k of KEYS) {
      try {
        const v = wx.getStorageSync(k as any)
        if (v !== '' && v !== undefined && v !== null) out[k] = v
      } catch (_e) {
        // Key not in storage — skip
      }
    }
    return out
  },

  applyCloudSnapshot(snapshot?: Record<string, unknown>) {
    if (!snapshot || typeof snapshot !== 'object') return
    for (const [key, value] of Object.entries(snapshot)) {
      try {
        if (value !== undefined && value !== null) {
          const local = wx.getStorageSync(key as any)
          if (shouldKeepLocalValue(local, value)) {
            console.warn(`ai-chat: skipped empty cloud snapshot for key=${key}`)
            continue
          }
          wx.setStorageSync(key as any, value)
        }
      } catch (err) {
        console.warn(`ai-chat: failed to apply cloud snapshot key=${key}:`, err)
      }
    }
  },

  runMock(question: string) {
    const ANSWERS: Record<string, string> = {
      generate_today_menu: '当前为离线降级模式，不会生成或写入真实菜单。服务恢复后可运行确定性菜单工具。',
      record_reaction: '当前为离线降级模式，不会写入真实反应记录。服务恢复后可运行反应分析工具。',
      read_baby_profile: '当前为离线降级模式，不展示虚构档案；请以「我的」页面中的实际档案为准。',
      list_recipes: '当前为离线降级模式，不返回虚构数量；请前往食谱页查看实际适用食谱。',
      get_feeding_history: '我会先读取已记录的辅食打卡和反应记录,再按时间总结。当前为离线降级模式,真实数据以服务恢复后的结果为准。',
    }
    setTimeout(() => {
      const route = routeAgentRequest(question) ?? {
        name: 'read_baby_profile' as const,
        input: {},
      }
      let answer = ANSWERS[route.name] || '好的,我帮你处理。'
      if (route.name === 'check_food_safety') {
        const profile = wx.getStorageSync('babyProfile')
        const foods = Array.isArray(route.input.foods)
          ? route.input.foods.filter(
              (food): food is string => typeof food === 'string'
            )
          : []
        if (!profile || foods.length === 0) {
          answer = '本地 mock 没有拿到完整的安全档案，暂时不能判断是否适合尝试。'
        } else {
          const result = checkFoodsSafety(foods, profile)
          answer = result.safe
            ? '确定性安全规则未发现阻断项。首次引入仍建议小份尝试，并按排敏流程观察。'
            : `确定性安全规则已阻断这次尝试：${result.results
                .filter((item) => !item.safe)
                .map((item) => item.reason)
                .filter(Boolean)
                .join('；')}。请不要喂食。`
        }
      }
      this.appendAssistant(answer, [
        {
          name: route.name,
          input: route.input,
          inputJson: JSON.stringify(route.input, null, 2),
          ok: true,
        },
      ])
      this.setData({ loading: false })
    }, 600)
  },

  appendAssistant(
    content: string,
    toolCalls?: ToolCall[],
    extra?: { error?: boolean; retryQuestion?: string }
  ) {
    const msg: ChatMessage = {
      id: nextId++,
      role: 'assistant',
      content,
      contentHtml: renderMarkdown(content),
      toolCalls: toolCalls && toolCalls.length ? toolCalls : undefined,
      traceExpanded: false,
      ...(extra?.error ? { error: true } : {}),
      ...(extra?.retryQuestion ? { retryQuestion: extra.retryQuestion } : {}),
    }
    const messages = [...this.data.messages, msg]
    this.setData({
      messages,
      scrollIntoView: `msg-${msg.id}`,
    })
  },

  onRetry(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as number
    const target = this.data.messages.find((m) => m.id === id)
    if (!target || !target.retryQuestion) return
    // Remove the failed message and the prior user question, then re-send.
    const idx = this.data.messages.findIndex((m) => m.id === id)
    if (idx <= 0) return
    const prev = this.data.messages[idx - 1]
    if (prev.role !== 'user') return
    const trimmed = this.data.messages.slice(0, idx - 1)
    this.setData({ messages: trimmed, draft: target.retryQuestion })
    // The next onSend() call will move the draft through onInput(), but
    // we set the draft directly to skip that — call onSend() now.
    setTimeout(() => this.onSend(), 0)
  },
})

/**
 * Tiny markdown → HTML renderer. Handles the subset the LLM actually emits:
 *   **bold**      → <b>bold</b>
 *   *italic*      → <i>italic</i>
 *   - bullet line → "• " prefix
 *   numbered list → "1. " prefix
 *   # heading     → bold + bigger
 *   \n           → <br>
 *
 * The result is consumed by <rich-text>, which renders a subset of HTML.
 * We escape < > & first to avoid XSS from user-controlled strings (the
 * LLM tool outputs, not the user — but defense in depth).
 */
function renderMarkdown(text: string): string {
  if (!text) return ''
  // 1. Escape HTML-significant chars.
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. Process per-line. First pass: collect consecutive pipe-delimited
  //    lines into a table block (header + separator + body), then emit
  //    one <table> for the whole block. Other line types are handled
  //    inline.
  const lines = s.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trimEnd()
    // Detect a markdown table: at least 3 consecutive lines that look
    // like `| ... |`, with the second one being a separator (|---|).
    if (looksLikeTableRow(line) && i + 1 < lines.length && looksLikeTableSeparator(lines[i + 1])) {
      const headerCells = parseTableRow(line)
      i += 2 // skip header + separator
      const bodyCells: string[][] = []
      while (i < lines.length && looksLikeTableRow(lines[i])) {
        bodyCells.push(parseTableRow(lines[i]))
        i++
      }
      out.push(renderTable(headerCells, bodyCells))
      continue
    }
    if (/^#\s+/.test(line)) {
      out.push(`<b style="color:#FF6B35;font-size:32rpx;">${formatInline(line.replace(/^#\s+/, ''))}</b>`)
    } else if (/^[-*]\s+/.test(line)) {
      out.push(`<div style="margin:2rpx 0;">• ${formatInline(line.replace(/^[-*]\s+/, ''))}</div>`)
    } else if (/^\d+\.\s+/.test(line)) {
      out.push(`<div style="margin:2rpx 0;">${formatInline(line)}</div>`)
    } else {
      out.push(formatInline(line))
    }
    i++
  }
  // Wrap in <div> so the WeChat <rich-text> parser actually treats the
  // payload as HTML (without a block-level wrapper it sometimes shows
  // nothing on real devices).
  return `<div>${out.join('<br>')}</div>`
}

function shouldKeepLocalValue(local: unknown, incoming: unknown): boolean {
  if (Array.isArray(local) && local.length > 0 && Array.isArray(incoming) && incoming.length === 0) {
    return true
  }
  if (isPlainObject(local) && Object.keys(local).length > 0 && isPlainObject(incoming) && Object.keys(incoming).length === 0) {
    return true
  }
  if (isBabyProfile(local) && isPlainObject(incoming) && !isBabyProfile(incoming)) {
    return true
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isBabyProfile(value: unknown): value is { babyName: string; birthday: string } {
  return isPlainObject(value) && typeof value.babyName === 'string' && typeof value.birthday === 'string'
}

function looksLikeTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.slice(1, -1).includes('|')
}

function looksLikeTableSeparator(line: string): boolean {
  // | --- | :---: | ---: |
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(line.trim())
}

function parseTableRow(line: string): string[] {
  // strip leading/trailing |, split on |, trim
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((c) => c.trim())
}

function renderTable(header: string[], body: string[][]): string {
  // Pad body rows to header length so uneven rows don't drop cells.
  const width = header.length
  const normalize = (row: string[]) => {
    const padded = row.slice(0, width)
    while (padded.length < width) padded.push('')
    return padded
  }
  const cellStyle =
    'border:1rpx solid #FFEAD5;padding:8rpx 12rpx;text-align:left;'
  const thStyle = cellStyle + 'background:#FFF5EB;font-weight:500;'
  const head =
    '<tr>' +
    header.map((h) => `<th style="${thStyle}">${formatInline(h)}</th>`).join('') +
    '</tr>'
  const rows = body
    .map((r) =>
      '<tr>' +
      normalize(r).map((c) => `<td style="${cellStyle}">${formatInline(c)}</td>`).join('') +
      '</tr>'
    )
    .join('')
  return (
    '<table style="border-collapse:collapse;width:100%;' +
    'font-size:24rpx;margin:8rpx 0;">' +
    '<thead>' + head + '</thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>'
  )
}

function formatInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<![*\\])\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>')
}
