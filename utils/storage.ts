import { getIngredient } from '../data/ingredients'
import { getDefaultLocationFor } from './storageGuide'
import { parseLocalDateMs, todayLocalStartMs, formatLocalDate } from './dateUtil'

export interface FridgeItem {
  name: string
  portions: number
  storageLocation: 'frozen' | 'refrigerated' | 'room'
  purchaseDate: string
  expiryDate: string
  prepStatus: 'raw' | 'washed' | 'cooked' | 'portioned'
}

export function getFridge(): FridgeItem[] {
  return wx.getStorageSync('fridge') || []
}

export function setFridge(items: FridgeItem[]) {
  wx.setStorageSync('fridge', items)
}

export function addFridgeItem(item: FridgeItem) {
  const fridge = getFridge()
  const existing = fridge.find(f => f.name === item.name && f.storageLocation === item.storageLocation)
  if (existing) {
    existing.portions += item.portions
  } else {
    fridge.push(item)
  }
  setFridge(fridge)
}

export function quickAddFridgeItem(name: string, portions: number = 1, storageOverride?: 'frozen' | 'refrigerated' | 'room') {
  const ing = getIngredient(name)
  const location: 'frozen' | 'refrigerated' | 'room' =
    storageOverride || (ing?.defaultStorage) || getDefaultLocationFor(name)
  const defaultDays = location === 'frozen' ? 90 : location === 'room' ? 30 : 7
  const shelfLife = ing?.shelfLifeDays?.[location] || defaultDays
  const today = new Date()
  const expiry = new Date(today.getTime() + shelfLife * 86400000)

  addFridgeItem({
    name,
    portions,
    storageLocation: location,
    purchaseDate: formatLocalDate(today),
    expiryDate: formatLocalDate(expiry),
    prepStatus: 'raw'
  })
}

export function consumePortion(name: string, portions: number = 1) {
  const fridge = getFridge()
  const idx = fridge.findIndex(f => f.name === name)
  if (idx >= 0) {
    fridge[idx].portions -= portions
    if (fridge[idx].portions <= 0) {
      fridge.splice(idx, 1)
    }
    setFridge(fridge)
  }
}

// 撤销打卡时还原库存: 若已不在 fridge 则用默认位置/保质期重新入库 (沿用 quickAddFridgeItem)
export function restorePortion(name: string, portions: number = 1) {
  if (portions <= 0) return
  const fridge = getFridge()
  const idx = fridge.findIndex(f => f.name === name)
  if (idx >= 0) {
    fridge[idx].portions += portions
    setFridge(fridge)
  } else {
    quickAddFridgeItem(name, portions)
  }
}

export function getNearExpiry(days: number = 2): FridgeItem[] {
  const nowMs = todayLocalStartMs()
  return getFridge().filter(item => {
    const expiryMs = parseLocalDateMs(item.expiryDate)
    const diffDays = (expiryMs - nowMs) / 86400000
    return diffDays <= days && diffDays >= 0
  })
}

export function getExpired(): FridgeItem[] {
  const nowMs = todayLocalStartMs()
  return getFridge().filter(item => parseLocalDateMs(item.expiryDate) < nowMs)
}

export function getRecentlyAdded(n: number = 5): string[] {
  const fridge = getFridge()
  return [...new Set(fridge.map(f => f.name))].slice(-n).reverse()
}

/* ============ Item key 操作（key = name-idx） ============ */
function parseKey(key: string): number {
  return parseInt(key.split('-').pop() || '-1', 10)
}

export function removeItemByKey(key: string) {
  const fridge = getFridge()
  const idx = parseKey(key)
  if (idx >= 0 && idx < fridge.length) {
    fridge.splice(idx, 1)
    setFridge(fridge)
  }
}

export function updateItemByKey(key: string, partial: Partial<FridgeItem>) {
  const fridge = getFridge()
  const idx = parseKey(key)
  if (idx >= 0 && idx < fridge.length) {
    fridge[idx] = { ...fridge[idx], ...partial }
    setFridge(fridge)
  }
}

export function setPortionsByKey(key: string, portions: number) {
  const fridge = getFridge()
  const idx = parseKey(key)
  if (idx < 0 || idx >= fridge.length) return
  if (portions <= 0) {
    fridge.splice(idx, 1)
  } else {
    fridge[idx].portions = portions
  }
  setFridge(fridge)
}

/** 移动分类：换 storageLocation，按新位置重算保质期（购买日不变） */
export function moveItemLocation(key: string, newLoc: 'frozen' | 'refrigerated' | 'room') {
  const fridge = getFridge()
  const idx = parseKey(key)
  if (idx < 0 || idx >= fridge.length) return
  const item = fridge[idx]
  const ing = getIngredient(item.name)
  const defaultDays = newLoc === 'frozen' ? 90 : newLoc === 'room' ? 30 : 7
  const shelfLife = ing?.shelfLifeDays?.[newLoc] || defaultDays
  const purchaseMs = parseLocalDateMs(item.purchaseDate)
  const expiryMs = purchaseMs + shelfLife * 86400000
  item.storageLocation = newLoc
  item.expiryDate = formatLocalDate(new Date(expiryMs))
  setFridge(fridge)
}

/* ============ 统计（Hero 卡 pill 用） ============ */
export function getUrgentItems(daysThreshold: number = 2): FridgeItem[] {
  const nowMs = todayLocalStartMs()
  return getFridge().filter(item => {
    const diff = (parseLocalDateMs(item.expiryDate) - nowMs) / 86400000
    return diff <= daysThreshold && diff >= 0
  })
}

export function getLowStockItems(threshold: number = 1): FridgeItem[] {
  return getFridge().filter(item => item.portions <= threshold)
}

/** 今日建议数：临期 + 库存少 unique by name */
export function getTodayAdviceCount(): number {
  const names = new Set<string>()
  getUrgentItems().forEach(i => names.add(i.name))
  getLowStockItems().forEach(i => names.add(i.name))
  return names.size
}

/* ============ 手动采购清单（用户从冰箱「加入采购清单」） ============ */
export interface ManualShopItem {
  name: string
  portions: number
  addedAt: string
}

export function getManualShopList(): ManualShopItem[] {
  return wx.getStorageSync('manualShopList') || []
}

export function addToManualShopList(name: string, portions: number = 1) {
  const list = getManualShopList()
  const existing = list.find(i => i.name === name)
  if (existing) {
    existing.portions += portions
  } else {
    list.push({ name, portions, addedAt: new Date().toISOString() })
  }
  wx.setStorageSync('manualShopList', list)
}

export function removeFromManualShopList(name: string) {
  const list = getManualShopList().filter(i => i.name !== name)
  wx.setStorageSync('manualShopList', list)
}
