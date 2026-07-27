import { CATEGORIES } from '../../data/categories'
import { INGREDIENTS } from '../../data/ingredients'
import { quickAddFridgeItem } from '../../utils/storage'
import { getCustomFoods } from '../../utils/customFoods'

const LOC_LABEL: Record<string, string> = { frozen: '冷冻', refrigerated: '冷藏', room: '常温' }

interface PickerItem {
  name: string
  categoryId: string
  storageLabel: string
  servingGramsPerPortion: number
  checked: boolean
  portions: number
}

interface Group {
  id: string
  name: string
  items: PickerItem[]
  expanded: boolean
  checkedCount: number
}

Page({
  data: {
    groups: [] as Group[],
    totalChecked: 0,
    selections: {} as Record<string, number>
  },

  onLoad() {
    const customs = getCustomFoods()
    const ingMap = new Map(INGREDIENTS.map(i => [i.name, i]))
    const customMap = new Map(customs.map(f => [f.name, f]))

    const groups: Group[] = CATEGORIES.map(cat => {
      const memberItems: PickerItem[] = cat.members.map(name => {
        const ing = ingMap.get(name)
        if (ing) {
          return {
            name: ing.name,
            categoryId: ing.categoryId,
            storageLabel: LOC_LABEL[ing.defaultStorage],
            servingGramsPerPortion: ing.servingGramsPerPortion,
            checked: false,
            portions: 1
          }
        }
        return {
          name,
          categoryId: cat.id,
          storageLabel: '冷藏',
          servingGramsPerPortion: 30,
          checked: false,
          portions: 1
        }
      })
      const customItems: PickerItem[] = customs
        .filter(f => f.categoryId === cat.id)
        .filter(f => !cat.members.includes(f.name))
        .map(f => ({
          name: f.name,
          categoryId: f.categoryId,
          storageLabel: LOC_LABEL[f.defaultStorage] + ' · 自定义',
          servingGramsPerPortion: f.servingGramsPerPortion,
          checked: false,
          portions: 1
        }))
      const items = [...memberItems, ...customItems]
      return {
        id: cat.id,
        name: cat.name,
        items,
        expanded: ['grainLow', 'root', 'leafy'].includes(cat.id),
        checkedCount: 0
      }
    }).filter(g => g.items.length > 0)

    this.setData({ groups })
  },

  toggleGroup(e: any) {
    const id = e.currentTarget.dataset.id
    const groups = this.data.groups.map(g =>
      g.id === id ? { ...g, expanded: !g.expanded } : g
    )
    this.setData({ groups })
  },

  toggleIngredient(e: any) {
    const name = e.currentTarget.dataset.name
    this.updateItem(name, item => ({ ...item, checked: !item.checked }))
  },

  incPortions(e: any) {
    const name = e.currentTarget.dataset.name
    this.updateItem(name, item => ({ ...item, portions: item.portions + 1 }))
  },

  decPortions(e: any) {
    const name = e.currentTarget.dataset.name
    this.updateItem(name, item => ({ ...item, portions: Math.max(1, item.portions - 1) }))
  },

  noop() {},

  updateItem(name: string, fn: (item: PickerItem) => PickerItem) {
    let totalChecked = 0
    const groups = this.data.groups.map(g => {
      let checkedCount = 0
      const items = g.items.map(it => {
        const next = it.name === name ? fn(it) : it
        if (next.checked) checkedCount++
        return next
      })
      totalChecked += checkedCount
      return { ...g, items, checkedCount }
    })
    this.setData({ groups, totalChecked })
  },

  skipAll() {
    const fromWelcome = !!this.data.fromWelcome
    wx.setStorageSync('onboardingDone', true)
    wx.setStorageSync('fridgeOnboardDismissed', true)
    wx.setStorageSync('setupDone', true)
    wx.reLaunch({ url: '/pages/index/index' })
  },

  finish() {
    let count = 0
    for (const g of this.data.groups) {
      for (const it of g.items) {
        if (it.checked) {
          quickAddFridgeItem(it.name, it.portions)
          count++
        }
      }
    }
    wx.setStorageSync('onboardingDone', true)
    wx.setStorageSync('fridgeOnboardDismissed', true)
    wx.setStorageSync('setupDone', true)
    if (count > 0) {
      wx.showToast({ title: `已添加 ${count} 种食材`, icon: 'success' })
    }
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/index/index' })
    }, 800)
  }
})
