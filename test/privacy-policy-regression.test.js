'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}

const appConfig = JSON.parse(read('app.json'))
const about = read('pages/about/about.wxml')
const policy = read('pages/privacy/privacy.wxml')
const supportSource = read('utils/support.ts')

assert(appConfig.pages.includes('pages/privacy/privacy'), 'privacy policy page must be registered')
assert(about.includes('/pages/privacy/privacy'), 'about page must expose the privacy policy entry')
assert(about.includes('Lsxj'), 'about page should use the chosen public developer name')
assert(about.includes('413105383@qq.com'), 'about page should expose the support contact')

for (const required of [
  '当前不提供云端备份或跨设备恢复',
  '不读取或写入用户数据云数据库',
  'DeepSeek（深度求索）',
  '不能代替该服务商承诺绝不保留',
  '当前没有自助删除按钮',
  '工单接口不接收宝宝姓名',
  '申请删除支持工单等服务端数据',
]) {
  assert(policy.includes(required), `privacy policy must disclose: ${required}`)
}

assert(
  !policy.includes('申请删除云端宝宝档案'),
  'privacy policy must not imply that cloud baby-profile persistence exists'
)
assert(supportSource.includes("label: '申请删除支持工单数据'"))

console.log('privacy policy regression tests passed')
