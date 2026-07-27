import { getRecipe } from '../../data/recipes'
import { getRecipeTabooWarnings } from '../../utils/planner'

Page({
  data: { recipe: null as any, tabooWarnings: [] as any[] },

  onLoad(options: { id?: string }) {
    if (options.id) {
      const r = getRecipe(options.id)
      if (r) {
        const warnings = getRecipeTabooWarnings(r).map(t => ({
          foods: t.foods.join(' + '),
          reason: t.reason,
          mitigation: t.mitigation || ''
        }))
        this.setData({ recipe: r, tabooWarnings: warnings })
        wx.setNavigationBarTitle({ title: r.name })
      }
    }
  }
})
