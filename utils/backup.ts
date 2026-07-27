export const BACKUP_PREFIX = 'FUSHI_DITU_BACKUP_V1'

export const BACKUP_KEYS = [
  'babyProfile',
  'fridge',
  'manualShopList',
  'mealJournal',
  'reactions',
  'customFoods',
  'weeklyPlan',
  'setupDone',
  'onboardingDone',
  'fridgeOnboardDismissed',
  'shopDays',
] as const

export const BEFORE_RESTORE_BACKUP_KEY = 'lastBeforeRestoreBackup'

export type BackupKey = typeof BACKUP_KEYS[number]

export interface BackupSummary {
  babyName: string
  birthday: string
  mealJournalCount: number
  reactionCount: number
  weeklyPlanCount: number
  fridgeCount: number
  customFoodCount: number
}

export interface FushiDataBackup {
  app: 'fushi-ditu'
  version: 1
  createdAt: string
  keys: BackupKey[]
  summary: BackupSummary
  data: Partial<Record<BackupKey, unknown>>
}

export interface RestoreResult {
  restoredKeys: BackupKey[]
  beforeRestoreBackup: FushiDataBackup
}

export function createDataBackup(now: Date = new Date()): FushiDataBackup {
  const data: Partial<Record<BackupKey, unknown>> = {}
  for (const key of BACKUP_KEYS) {
    const value = wx.getStorageSync(key)
    if (value !== undefined && value !== '') data[key] = value
  }
  return {
    app: 'fushi-ditu',
    version: 1,
    createdAt: now.toISOString(),
    keys: Object.keys(data) as BackupKey[],
    summary: summarizeBackupData(data),
    data,
  }
}

export function serializeBackup(backup: FushiDataBackup): string {
  return `${BACKUP_PREFIX}\n${JSON.stringify(backup)}`
}

export function parseBackup(raw: string): FushiDataBackup {
  const text = (raw || '').trim()
  const jsonText = text.startsWith(BACKUP_PREFIX)
    ? text.slice(BACKUP_PREFIX.length).trim()
    : text

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (_err) {
    throw new Error('备份内容不是有效的 JSON')
  }

  if (!isPlainObject(parsed)) throw new Error('备份内容格式不正确')
  if (parsed.app !== 'fushi-ditu' || parsed.version !== 1) {
    throw new Error('不是辅食搭子的 v1 备份')
  }
  if (!isPlainObject(parsed.data)) throw new Error('备份缺少 data')

  const data: Partial<Record<BackupKey, unknown>> = {}
  const keys: BackupKey[] = []
  for (const key of BACKUP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
      data[key] = parsed.data[key]
      keys.push(key)
    }
  }
  if (keys.length === 0) throw new Error('备份里没有可恢复的数据')

  return {
    app: 'fushi-ditu',
    version: 1,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    keys,
    summary: summarizeBackupData(data),
    data,
  }
}

export function restoreDataBackup(backup: FushiDataBackup): RestoreResult {
  const beforeRestoreBackup = createDataBackup()
  wx.setStorageSync(BEFORE_RESTORE_BACKUP_KEY, beforeRestoreBackup)

  const restoredKeys: BackupKey[] = []
  for (const key of BACKUP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
      wx.setStorageSync(key, backup.data[key])
      restoredKeys.push(key)
    }
  }
  return { restoredKeys, beforeRestoreBackup }
}

export function formatBackupSummary(summary: BackupSummary): string {
  const name = summary.babyName || '未命名宝宝'
  const birthday = summary.birthday || '生日未设置'
  return `${name} · ${birthday}\n辅食记录 ${summary.mealJournalCount} 条 · 反应 ${summary.reactionCount} 条 · 计划 ${summary.weeklyPlanCount} 天`
}

function summarizeBackupData(data: Partial<Record<BackupKey, unknown>>): BackupSummary {
  const profile = isPlainObject(data.babyProfile) ? data.babyProfile : {}
  return {
    babyName: typeof profile.babyName === 'string' ? profile.babyName : '',
    birthday: typeof profile.birthday === 'string' ? profile.birthday : '',
    mealJournalCount: arrayLength(data.mealJournal),
    reactionCount: arrayLength(data.reactions),
    weeklyPlanCount: arrayLength(data.weeklyPlan),
    fridgeCount: arrayLength(data.fridge),
    customFoodCount: arrayLength(data.customFoods),
  }
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
