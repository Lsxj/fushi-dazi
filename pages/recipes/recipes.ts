import { RECIPES, Recipe } from '../../data/recipes'
import { isRecipeApplicable, BabyProfile } from '../../utils/planner'

const CAT_LABEL: Record<string, string> = {
  staple: '主食', protein: '蛋白', veg: '蔬菜', fruit: '水果'
}

interface RecipeVM extends Recipe {
  catLabels: string[]
  ingredientsText: string
  safe: boolean
  unsafeReason?: string
}

Page({
  data: {
    keyword: '',
    filterTab: 'safe',
    total: RECIPES.length,
    filtered: [] as RecipeVM[]
  },

  onLoad(query: any) {
    if (query && query.with) {
      const kw = decodeURIComponent(query.with)
      this.setData({ keyword: kw, filterTab: 'all' })
    }
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')

    let filtered = RECIPES

    if (this.data.filterTab === 'safe' && profile) {
      filtered = filtered.filter(r => isRecipeApplicable(r, profile).applicable)
    } else if (['staple', 'protein', 'veg', 'fruit'].includes(this.data.filterTab)) {
      filtered = filtered.filter(r => r.mealCategories.includes(this.data.filterTab as any))
    }

    if (this.data.keyword) {
      const kw = this.data.keyword.toLowerCase()
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(kw) ||
        r.ingredients.some(i => i.name.toLowerCase().includes(kw))
      )
    }

    const enriched: RecipeVM[] = filtered.map(r => {
      const applicableCheck = profile ? isRecipeApplicable(r, profile) : { applicable: true }
      return {
        ...r,
        catLabels: r.mealCategories.map(c => CAT_LABEL[c] || c),
        ingredientsText: r.ingredients.map(i => `${i.name}${i.portions > 1 ? ' x' + i.portions : ''}`).join(' + '),
        safe: applicableCheck.applicable,
        unsafeReason: applicableCheck.applicable ? undefined : applicableCheck.reason
      }
    })

    this.setData({ filtered: enriched })
  },

  onSearch(e: any) {
    this.setData({ keyword: e.detail.value })
    this.refresh()
  },

  setTab(e: any) {
    this.setData({ filterTab: e.currentTarget.dataset.tab })
    this.refresh()
  },

  openDetail(e: any) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/recipe/recipe?id=${id}` })
  }
})
