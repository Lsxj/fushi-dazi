const CONTACT_EMAIL = '413105383@qq.com'
const DEEPSEEK_PRIVACY_URL = 'https://platform.deepseek.com/downloads/DeepSeek%20Privacy%20Policy.pdf'

Page({
  data: {
    effectiveDate: '2026-08-12',
    developerName: 'Lsxj',
    contactEmail: CONTACT_EMAIL,
    deepseekPrivacyUrl: DEEPSEEK_PRIVACY_URL,
  },

  copyEmail() {
    wx.setClipboardData({
      data: CONTACT_EMAIL,
      success: () => wx.showToast({ title: '邮箱已复制', icon: 'none' }),
    })
  },

  copyDeepSeekPolicy() {
    wx.setClipboardData({
      data: DEEPSEEK_PRIVACY_URL,
      success: () => wx.showToast({ title: '链接已复制', icon: 'none' }),
    })
  },
})
