import {
  buildSupportCasePayload,
  SUPPORT_REASON_OPTIONS,
  SupportCaseReason,
  SupportCaseReceipt,
} from '../../utils/support'

const RECEIPT_KEY = 'supportCaseReceipt'
const LOCAL_SUPPORT_API = 'http://127.0.0.1:3000/api'

Page({
  data: {
    reasons: SUPPORT_REASON_OPTIONS,
    selectedReason: '' as SupportCaseReason | '',
    consent: false,
    submitting: false,
    receipt: null as SupportCaseReceipt | null,
    serviceMode: '本地联调',
  },

  onShow() {
    const receipt = wx.getStorageSync(RECEIPT_KEY) as SupportCaseReceipt | null
    this.setData({ receipt: receipt || null })
  },

  selectReason(event: WechatMiniprogram.TouchEvent) {
    this.setData({ selectedReason: event.currentTarget.dataset.reason })
  },

  toggleConsent(event: any) {
    this.setData({ consent: event.detail.value })
  },

  submitCase() {
    if (!this.data.selectedReason) {
      wx.showToast({ title: '请先选择问题类型', icon: 'none' })
      return
    }
    if (!this.data.consent) {
      wx.showModal({
        title: '需要你的明确授权',
        content: '只有打开授权开关后，才会上传页面版本、时间和可选诊断标识。',
        showCancel: false,
      })
      return
    }

    const apiBaseUrl =
      (wx.getStorageSync('supportApiBaseUrl') as string) || LOCAL_SUPPORT_API
    const reason = this.data.selectedReason as SupportCaseReason
    const payload = buildSupportCasePayload(reason, new Date().toISOString())
    this.setData({ submitting: true })
    ;(wx as any).request({
      url: `${apiBaseUrl}/v1/support/cases`,
      method: 'POST',
      data: payload,
      success: (response) => {
        const body = response.data as {
          case?: { caseId: string; status: string }
          trackingToken?: string
        }
        if (response.statusCode !== 200 || !body.case || !body.trackingToken) {
          wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' })
          return
        }
        const receipt: SupportCaseReceipt = {
          caseId: body.case.caseId,
          trackingToken: body.trackingToken,
          status: body.case.status,
          reason,
          submittedAt: new Date().toISOString(),
        }
        wx.setStorageSync(RECEIPT_KEY, receipt)
        this.setData({ receipt, consent: false })
        wx.showToast({ title: '工单已提交', icon: 'success' })
      },
      fail: () => {
        wx.showModal({
          title: '支持服务未连接',
          content: '当前内测版只配置了本地联调地址，未上传任何数据。请启动本地 API 或等待正式支持服务上线。',
          showCancel: false,
        })
      },
      complete: () => this.setData({ submitting: false }),
    })
  },

  refreshStatus() {
    const receipt = this.data.receipt
    if (!receipt) return
    const apiBaseUrl =
      (wx.getStorageSync('supportApiBaseUrl') as string) || LOCAL_SUPPORT_API
    ;(wx as any).request({
      url: `${apiBaseUrl}/v1/support/cases/track`,
      method: 'POST',
      data: {
        caseId: receipt.caseId,
        trackingToken: receipt.trackingToken,
      },
      success: (response) => {
        const body = response.data as { found?: boolean; case?: { status: string } }
        if (!body.found || !body.case) {
          wx.showToast({ title: '没有查到工单', icon: 'none' })
          return
        }
        const nextReceipt = { ...receipt, status: body.case.status }
        wx.setStorageSync(RECEIPT_KEY, nextReceipt)
        this.setData({ receipt: nextReceipt })
        wx.showToast({ title: '状态已更新', icon: 'none' })
      },
      fail: () => wx.showToast({ title: '支持服务未连接', icon: 'none' }),
    })
  },
})
