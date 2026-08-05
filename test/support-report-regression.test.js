const assert = require('assert')

const { buildSupportCasePayload, SUPPORT_REASON_OPTIONS } = require('../utils/support.js')

const payload = buildSupportCasePayload(
  'unsafe-food-in-menu',
  '2026-08-05T09:00:00.000Z',
  { menuDate: '2026-08-06', profileVersion: 3 }
)

assert.strictEqual(payload.consentToUploadDiagnostics, true)
assert.strictEqual(payload.context.clientVersion, '1.0.4')
assert.strictEqual(payload.context.menuDate, '2026-08-06')
assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, 'babyName'), false)
assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, 'note'), false)
assert.strictEqual(JSON.stringify(payload).includes('chatHistory'), false)
assert.strictEqual(SUPPORT_REASON_OPTIONS.length, 5)

console.log('support report privacy regression tests passed')
