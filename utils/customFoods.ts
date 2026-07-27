export interface CustomFood {
  name: string
  categoryId: string
  defaultStorage: 'frozen' | 'refrigerated' | 'room'
  shelfLifeDays: { frozen?: number; refrigerated?: number; room?: number }
  servingGramsPerPortion: number
  note?: string
}

export function getCustomFoods(): CustomFood[] {
  return wx.getStorageSync('customFoods') || []
}

export function setCustomFoods(items: CustomFood[]) {
  wx.setStorageSync('customFoods', items)
}

export function addCustomFood(food: CustomFood): boolean {
  const all = getCustomFoods()
  if (all.find(f => f.name === food.name)) return false
  all.push(food)
  setCustomFoods(all)
  return true
}

export function removeCustomFood(name: string) {
  const all = getCustomFoods().filter(f => f.name !== name)
  setCustomFoods(all)
}

export function renameCustomFood(oldName: string, newName: string): boolean {
  const all = getCustomFoods()
  if (all.find(f => f.name === newName && f.name !== oldName)) return false
  const target = all.find(f => f.name === oldName)
  if (!target) return false
  target.name = newName
  setCustomFoods(all)
  return true
}
