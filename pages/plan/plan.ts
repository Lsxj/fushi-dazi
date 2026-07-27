import { generateWeeklyPlan, regenerateKeepingLoggedToday, getApplicableRecipes, aggregateShoppingListForFutureDays, getWeekday, BabyProfile, DailyPlan, getTryingFood, recordTryingReplaced, getCurrentTryingCategoryId, pickReplacement, formatDate } from '../../utils/planner'
import { parseLocalDateMs } from '../../utils/dateUtil'
import { getFridge, quickAddFridgeItem, getManualShopList, removeFromManualShopList } from '../../utils/storage'
import { getShopAreaForFood } from '../../data/categories'

interface ShopRow {
  name: string
  needed: number
  haveInFridge: number
  toBuy: number
}

interface ShopGroup {
  area: string
  items: ShopRow[]
}

interface PreviewDay {
  date: string
  dateLabel: string
  weekday: string
  meals: Array<{ mealIndex: number; recipe: any; ingredientsText: string }>
}

function getNextMonday(): Date {
  const today = new Date()
  const dow = today.getDay() // 0=Sun..6=Sat
  const daysUntilMonday = ((1 - dow) + 7) % 7 || 7 // 永远跳到下周一（不返回 0）
  const d = new Date(today)
  d.setDate(today.getDate() + daysUntilMonday)
  return d
}

Page({
  data: {
    plan: [] as Array<DailyPlan & { dateLabel: string; weekday: string; meals: any[] }>,
    mealsPerDay: 0,
    shopDays: 7,
    shoppingList: [] as ShopRow[],
    shoppingGroups: [] as ShopGroup[],

    // 下周菜单预览（不写入 weeklyPlan，纯只读）
    previewVisible: false,
    previewStart: '',
    previewEnd: '',
    previewRangeLabel: '',
    previewPlan: [] as PreviewDay[]
  },

  onShow() {
    const savedDays = wx.getStorageSync('shopDays') || 7
    this.setData({ shopDays: savedDays })
    this.refresh()
  },

  refresh() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return

    // 滚动 plan: 砍掉过去日子 + 末尾自动延续到「今天+未来 6 天」共 7 天
    // (避免固定 7 天到末尾后看不到下一周的备菜计划)
    const DESIRED_DAYS = 7
    const todayStr = formatDate(new Date())
    let plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    plan = plan.filter(p => p.date >= todayStr)
    if (plan.length < DESIRED_DAYS) {
      const startMs = plan.length > 0
        ? parseLocalDateMs(plan[plan.length - 1].date) + 86400000
        : parseLocalDateMs(todayStr)
      const needDays = DESIRED_DAYS - plan.length
      const appended = generateWeeklyPlan(profile, needDays, new Date(startMs))
      plan = [...plan, ...appended]
    }
    wx.setStorageSync('weeklyPlan', plan)

    // 已 logged 餐次 set: key = `${date}-${mealIndex}`，从 mealJournal 取
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const loggedSet = new Set<string>(journal.map((l: any) => `${l.date}-${l.mealIndex}`))

    const enriched = plan.map(d => ({
      ...d,
      dateLabel: this.shortDate(d.date),
      weekday: getWeekday(d.date),
      meals: d.meals.map(m => ({
        ...m,
        ingredientsText: m.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + '),
        logged: loggedSet.has(`${d.date}-${m.mealIndex}`)
      }))
    }))

    const fridgeMap: Record<string, number> = {}
    for (const f of getFridge()) {
      fridgeMap[f.name] = (fridgeMap[f.name] || 0) + f.portions
    }

    const allNeeded = aggregateShoppingListForFutureDays(plan, this.data.shopDays)
    // 自动算的：未来计划需要 - 冰箱已有
    const autoRows: ShopRow[] = allNeeded
      .map(item => {
        const have = fridgeMap[item.name] || 0
        return {
          name: item.name,
          needed: item.portions,
          haveInFridge: have,
          toBuy: Math.max(0, item.portions - have)
        }
      })
      .filter(item => item.toBuy > 0)

    // 手动加入的采购清单：用户明确说要买，不抵冰箱库存
    const manualMap: Record<string, number> = {}
    for (const m of getManualShopList()) {
      manualMap[m.name] = (manualMap[m.name] || 0) + m.portions
    }
    const shopMap: Record<string, ShopRow> = {}
    autoRows.forEach(r => { shopMap[r.name] = r })
    for (const [name, p] of Object.entries(manualMap)) {
      if (shopMap[name]) {
        shopMap[name].needed += p
        shopMap[name].toBuy += p
      } else {
        shopMap[name] = {
          name,
          needed: p,
          haveInFridge: fridgeMap[name] || 0,
          toBuy: p
        }
      }
    }
    const shopping: ShopRow[] = Object.values(shopMap)

    const groupMap: Record<string, ShopRow[]> = {}
    for (const item of shopping) {
      const area = getShopAreaForFood(item.name)
      if (!groupMap[area]) groupMap[area] = []
      groupMap[area].push(item)
    }
    const AREA_ORDER = ['蔬果区', '肉禽鱼蛋区', '主食/谷物区', '速冻/熟食区', '调料/油区', '婴幼儿食品区', '其他']
    const shoppingGroups: ShopGroup[] = AREA_ORDER
      .filter(a => groupMap[a])
      .map(area => ({ area, items: groupMap[area] }))

    this.setData({
      plan: enriched,
      mealsPerDay: profile.mealsPerDay,
      shoppingList: shopping,
      shoppingGroups
    })
  },

  shortDate(dateStr: string): string {
    const parts = dateStr.split('-')
    return `${parts[1]}/${parts[2]}`
  },

  setShopDays(e: any) {
    const days = parseInt(e.currentTarget.dataset.days, 10)
    wx.setStorageSync('shopDays', days)
    this.setData({ shopDays: days })
    this.refresh()
  },

  regenerate() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    const existing: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const plan = existing.length > 0
      ? regenerateKeepingLoggedToday(profile, existing)
      : generateWeeklyPlan(profile, 7)
    wx.setStorageSync('weeklyPlan', plan)
    wx.showToast({ title: '已重新生成', icon: 'success' })
    this.refresh()
  },

  openRecipe(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string
    if (id) wx.navigateTo({ url: `/pages/recipe/recipe?id=${id}` })
  },

  replaceMeal(e: WechatMiniprogram.BaseEvent) {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    const date = e.currentTarget.dataset.date as string
    const idx = e.currentTarget.dataset.idx as number

    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const day = plan.find(p => p.date === date)
    if (!day) return

    // 已喂的餐不能替换
    const journal: any[] = wx.getStorageSync('mealJournal') || []
    const isLogged = journal.some((l: any) => l.date === date && l.mealIndex === idx)
    if (isLogged) {
      wx.showToast({ title: '这餐已经喂完了，无法替换', icon: 'none', duration: 1400 })
      return
    }

    const tryingFood = getTryingFood(profile)
    const oldRecipe = day.meals[idx].recipe
    const oldUsesTrying = !!(tryingFood && oldRecipe.ingredients.some(i => i.name === tryingFood))
    // 今天是否已经实际吃过 trying food (看 mealJournal): 已吃过 → 排敏天合格, 不弹 modal 不 record
    const todayAlreadyAteTrying = !!(tryingFood && journal.some(l =>
      l.date === date && (l.ingredients || []).includes(tryingFood)
    ))
    const otherMealsHaveTrying = !!(tryingFood && day.meals.some((m, i) =>
      i !== idx && m.recipe.ingredients.some(ing => ing.name === tryingFood)
    ))

    const replacement = pickReplacement(profile, day, idx)
    if (!replacement) {
      wx.showToast({ title: '暂无其他营养均衡的食谱', icon: 'none', duration: 1400 })
      return
    }

    // 替换为的新菜是否仍含 trying food: 是 → 这天依然有 trying, 不延长观察
    const newRecipeHasTrying = !!(tryingFood && replacement.ingredients.some(i => i.name === tryingFood))
    const willStillHaveTryingAfter = newRecipeHasTrying || otherMealsHaveTrying

    const doReplace = () => {
      day.meals[idx].recipe = replacement
      const stillHasTrying = day.meals.some(m => m.recipe.ingredients.some(ing => ing.name === tryingFood))

      if (oldUsesTrying && !todayAlreadyAteTrying && !stillHasTrying && tryingFood) {
        const tryingCatId = getCurrentTryingCategoryId(profile)
        if (tryingCatId) {
          const updated = recordTryingReplaced(profile, tryingCatId, date)
          wx.setStorageSync('babyProfile', updated)
        }
      }

      wx.setStorageSync('weeklyPlan', plan)
      wx.showToast({ title: '已替换', icon: 'success' })
      this.refresh()
    }

    // 弹 modal 条件: old 含 trying + 今天没已吃过 + 替换后这天再也没 trying (新菜不含 + 其他餐不含)
    if (oldUsesTrying && !todayAlreadyAteTrying && !willStillHaveTryingAfter) {
      wx.showModal({
        title: '替换会延长观察期',
        content: `这一顿包含正在排敏的 ${tryingFood},替换后这天不算排敏天,观察期会延长 1 天。继续吗?`,
        success: (res) => { if (res.confirm) doReplace() }
      })
    } else {
      doReplace()
    }
  },

  markHave(e: any) {
    const name = e.currentTarget.dataset.name
    quickAddFridgeItem(name, 1)
    removeFromManualShopList(name)
    wx.showToast({ title: `+1 份入冰箱`, icon: 'success', duration: 700 })
    this.refresh()
  },

  markHaveMore(e: any) {
    const name = e.currentTarget.dataset.name
    quickAddFridgeItem(name, 1)
    removeFromManualShopList(name)
    wx.showToast({ title: `+1 份入冰箱`, icon: 'none', duration: 500 })
    this.refresh()
  },

  copyFullPlan() {
    const profile: BabyProfile = wx.getStorageSync('babyProfile')
    if (!profile) return

    let text = `📅 ${profile.babyName}的本周辅食计划\n${profile.ageMonths}月龄 · 每日${profile.mealsPerDay}顿\n\n`

    for (const day of this.data.plan) {
      text += `【${day.dateLabel} 周${day.weekday}】\n`
      for (const meal of day.meals) {
        text += `第${meal.mealIndex + 1}餐:${meal.recipe.name}\n`
        text += `  食材:${meal.ingredientsText}\n`
      }
      text += '\n'
    }

    if (this.data.shoppingGroups.length > 0) {
      text += `🛒 采购清单(未来${this.data.shopDays}天)\n`
      for (const g of this.data.shoppingGroups) {
        text += `\n【${g.area}】\n`
        text += g.items.map(i => `  • ${i.name} ${i.toBuy}份`).join('\n') + '\n'
      }
    }

    text += `\n— 来自辅食搭子 (内测中)`

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制完整周计划', icon: 'success' })
      }
    })
  },

  // ===== 下周菜单预览 (A 方案: 独立 sheet, 不动主 plan) =====

  openPreview() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    const start = getNextMonday()
    this.buildPreview(profile, start)
    this.setData({ previewVisible: true })
  },

  closePreview() {
    this.setData({ previewVisible: false })
  },

  buildPreview(profile: BabyProfile, startDate: Date) {
    const preview = generateWeeklyPlan(profile, 7, startDate)
    const end = new Date(startDate)
    end.setDate(startDate.getDate() + 6)
    const startStr = formatDate(startDate)
    const endStr = formatDate(end)

    const previewPlan: PreviewDay[] = preview.map(d => ({
      date: d.date,
      dateLabel: this.shortDate(d.date),
      weekday: getWeekday(d.date),
      meals: d.meals.map(m => ({
        mealIndex: m.mealIndex,
        recipe: m.recipe,
        ingredientsText: m.recipe.ingredients.map(i => `${i.name} ${i.portions}份`).join(' + ')
      }))
    }))

    this.setData({
      previewStart: startStr,
      previewEnd: endStr,
      previewRangeLabel: `${this.shortDate(startStr)} - ${this.shortDate(endStr)}`,
      previewPlan
    })
  },

  shiftPreview(e: WechatMiniprogram.BaseEvent) {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile || !this.data.previewStart) return
    const dir = e.currentTarget.dataset.dir as string
    const offset = dir === 'next' ? 7 : -7
    // 本地解析 previewStart, 避免 new Date(str) 走 UTC 在非 +8 时区跨周偏移
    const start = new Date(parseLocalDateMs(this.data.previewStart))
    start.setDate(start.getDate() + offset)
    this.buildPreview(profile, start)
  },

  regeneratePreview() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile || !this.data.previewStart) return
    const start = new Date(parseLocalDateMs(this.data.previewStart))
    this.buildPreview(profile, start)
    wx.showToast({ title: '已换一组', icon: 'success', duration: 800 })
  },

  copyPreview() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (!profile) return
    let text = `📅 ${profile.babyName} 下周辅食预览\n${this.data.previewRangeLabel} · ${profile.ageMonths}月龄 · 每日${profile.mealsPerDay}顿\n\n`
    for (const day of this.data.previewPlan) {
      text += `【${day.dateLabel} 周${day.weekday}】\n`
      for (const meal of day.meals) {
        text += `第${meal.mealIndex + 1}餐:${meal.recipe.name}\n`
        text += `  食材:${meal.ingredientsText}\n`
      }
      text += '\n'
    }
    text += `(此为预览,未保存为正式计划)\n— 来自辅食搭子`
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  noop() {},

  copyShoppingList() {
    const list = this.data.shoppingList
    if (list.length === 0) {
      wx.showToast({ title: '暂无清单', icon: 'none' })
      return
    }
    let text = `🛒 未来${this.data.shopDays}天采购清单\n`
    for (const g of this.data.shoppingGroups) {
      text += `\n【${g.area}】\n`
      text += g.items.map(i => `• ${i.name} ${i.toBuy}份`).join('\n')
    }
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  }
})
