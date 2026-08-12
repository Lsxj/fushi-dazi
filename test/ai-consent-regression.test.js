'use strict'

const assert = require('assert')

let pageDefinition
let modalDecision = 'cancel'
let lastModal
let cloudCalls = 0
const storage = new Map()

globalThis.Page = (definition) => {
  pageDefinition = definition
}

globalThis.wx = {
  cloud: {
    init() {},
    async callFunction() {
      cloudCalls += 1
      return {
        result: {
          ok: true,
          answer: '测试回答',
          toolCalls: [],
          storageSnapshot: {},
        },
      }
    },
  },
  getStorageSync(key) {
    return storage.get(key)
  },
  setStorageSync(key, value) {
    storage.set(key, value)
  },
  removeStorageSync(key) {
    storage.delete(key)
  },
  showModal(options) {
    lastModal = options
    const confirm = modalDecision === 'confirm'
    options.success?.({ confirm, cancel: !confirm })
    options.complete?.({ confirm, cancel: !confirm })
  },
  showToast() {},
  navigateTo() {},
}

require('../pages/ai-chat/ai-chat.js')

function createPage() {
  const page = {
    ...pageDefinition,
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(patch) {
      Object.assign(this.data, patch)
    },
  }
  page.onLoad()
  return page
}

function settle() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function main() {
  const page = createPage()
  page.setData({ draft: '今天吃什么？' })

  modalDecision = 'cancel'
  await page.onSend()
  await settle()
  assert.strictEqual(cloudCalls, 0, 'declining consent must not call the cloud function')
  assert.strictEqual(page.data.messages.length, 0, 'declined text must not enter chat history')
  assert.strictEqual(page.data.draft, '今天吃什么？', 'declined text should remain available to the parent')
  assert.strictEqual(storage.has('aiContextConsent'), false)
  assert(lastModal.content.includes('DeepSeek'), 'consent must name the active model provider')
  assert(lastModal.content.includes('不保存到用户数据云数据库'), 'consent must disclose the persistence boundary')

  modalDecision = 'confirm'
  await page.onSend()
  await settle()
  assert.strictEqual(cloudCalls, 1, 'explicit confirmation should allow exactly one cloud request')
  assert.strictEqual(storage.get('aiContextConsent').version, 'local-first-v1')
  assert.strictEqual(page.data.aiConsentGranted, true)
  assert.strictEqual(page.data.messages.length, 2, 'confirmed request should append user and assistant messages')

  modalDecision = 'confirm'
  page.revokeAiConsent()
  assert.strictEqual(storage.has('aiContextConsent'), false, 'revocation must remove the local grant')
  assert.strictEqual(page.data.aiConsentGranted, false)

  console.log('AI consent regression tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
