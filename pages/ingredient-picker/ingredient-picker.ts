import { INGREDIENTS } from '../../data/ingredients'
import { CATEGORIES } from '../../data/categories'
import { quickAddFridgeItem, getRecentlyAdded } from '../../utils/storage'
import { aggregateShoppingList, DailyPlan } from '../../utils/planner'
import { getCustomFoods } from '../../utils/customFoods'
import { getStorageGuide } from '../../utils/storageGuide'

const CAT_NAME: Record<string, string> = {}
CATEGORIES.forEach(c => { CAT_NAME[c.id] = c.name })

function buildAllIngredients(): Array<{ name: string; categoryName: string; storageLine: string }> {
  const seen = new Set<string>()
  const result: Array<{ name: string; categoryName: string; storageLine: string }> = []

  for (const cat of CATEGORIES) {
    for (const name of cat.members) {
      if (seen.has(name)) continue
      seen.add(name)
      const guide = getStorageGuide(name)
      result.push({ name, categoryName: cat.name, storageLine: guide.shortLine })
    }
  }

  for (const f of getCustomFoods()) {
    if (seen.has(f.name)) continue
    seen.add(f.name)
    const guide = getStorageGuide(f.name)
    result.push({ name: f.name, categoryName: (CAT_NAME[f.categoryId] || '') + ' · 自定义', storageLine: guide.shortLine })
  }

  return result
}

Page({
  data: {
    keyword: '',
    filtered: [] as Array<{ name: string; categoryName: string; storageLine: string }>,
    recent: [] as string[],
    planNeed: [] as string[]
  },

  onShow() {
    const all = buildAllIngredients()
    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const planNeed = aggregateShoppingList(plan).map(s => s.name)

    this.setData({
      filtered: all,
      recent: getRecentlyAdded(8),
      planNeed
    })
  },

  onSearch(e: any) {
    const kw = (e.detail.value || '').trim().toLowerCase()
    const all = buildAllIngredients()
    if (!kw) {
      this.setData({ keyword: '', filtered: all })
      return
    }
    const filtered = all.filter(i => i.name.toLowerCase().includes(kw))
    this.setData({ keyword: kw, filtered })
  },

  quickAdd(e: any) {
    const name = e.currentTarget.dataset.name
    quickAddFridgeItem(name, 1)
    wx.showToast({ title: `已加 1份 ${name}`, icon: 'success', duration: 800 })
    this.setData({ recent: getRecentlyAdded(8) })
  }
})
