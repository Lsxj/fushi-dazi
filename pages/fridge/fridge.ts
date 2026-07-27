import {
  getFridge, consumePortion, getExpired, FridgeItem,
  quickAddFridgeItem, removeItemByKey, updateItemByKey,
  moveItemLocation, getUrgentItems, getLowStockItems, getTodayAdviceCount,
  addToManualShopList
} from '../../utils/storage'
import { getStorageGuide } from '../../utils/storageGuide'
import { RECIPES, Recipe } from '../../data/recipes'
import { BabyProfile, DailyPlan, isRecipeApplicable } from '../../utils/planner'
import { parseLocalDateMs, todayLocalStartMs, formatLocalDate } from '../../utils/dateUtil'

const LOC_TO_LABEL: Record<string, string> = { frozen: '冷冻', refrigerated: '冷藏', room: '常温' }
const LOC_OPTIONS = ['frozen', 'refrigerated', 'room'] as const
type Loc = (typeof LOC_OPTIONS)[number]

type SortBy = 'expiry' | 'added' | 'portions'
type ChipFilter = 'none' | 'urgent' | 'low' | 'recent'

interface FridgeVM extends FridgeItem {
  key: string
  daysToExpiry: number
  locationLabel: string
  isUrgent: boolean    // 临期 (≤2天)
  isExpired: boolean
  isLowStock: boolean  // 库存 ≤ 1
  tip: string
  shortLine: string
  tipExpanded: boolean
  expiryHint: string   // "剩 6 天过期" / "今天过期" / "已过期"
  statusBadge?: string // "建议优先吃" / "库存仅1份"
  statusBadgeColor?: string
}

Page({
  data: {
    items: [] as FridgeVM[],
    priorityItems: [] as FridgeVM[],
    filteredItems: [] as FridgeVM[],

    totalKinds: 0,
    urgentCount: 0,
    lowStockCount: 0,
    todayAdviceCount: 0,

    searchKey: '',
    locationTab: 'all' as 'all' | Loc,
    filterChip: 'none' as ChipFilter,
    sortBy: 'expiry' as SortBy,
    sortLabel: '排序',

    showOnboardHint: false,
    batchMode: false,
    selectedKeys: [] as string[],

    moreOpenKey: '' as string,
    moreOpenName: '' as string
  },

  onShow() {
    this.refresh()
  },

  /* ============ 数据加载与衍生 ============ */
  refresh() {
    const fridge = getFridge()
    const now = todayLocalStartMs()
    const items: FridgeVM[] = fridge.map((f, i) => {
      const guide = getStorageGuide(f.name)
      const diffDays = Math.floor((parseLocalDateMs(f.expiryDate) - now) / 86400000)
      const isExpired = diffDays < 0
      const isUrgent = !isExpired && diffDays <= 2
      const isLowStock = f.portions <= 1
      const expiryHint = isExpired
        ? '已过期'
        : diffDays === 0
          ? '今天过期'
          : `剩 ${diffDays} 天过期`
      let statusBadge: string | undefined
      let statusBadgeColor: string | undefined
      if (isExpired || isUrgent) {
        statusBadge = '建议优先吃'
        statusBadgeColor = 'urgent'
      } else if (isLowStock) {
        statusBadge = '库存仅 1 份'
        statusBadgeColor = 'low'
      }
      return {
        ...f,
        key: `${f.name}-${i}`,
        daysToExpiry: diffDays,
        locationLabel: LOC_TO_LABEL[f.storageLocation] || '常温',
        isUrgent,
        isExpired,
        isLowStock,
        tip: guide.tip,
        shortLine: guide.shortLine,
        tipExpanded: false,
        expiryHint,
        statusBadge,
        statusBadgeColor
      }
    })

    // 「建议尽快食用」只看保质期(临期/过期), 不含低库存
    // (一个 90 天保质期但仅剩 1 份的食材不该被标"尽快食用", 它是"该补货"问题, 不是"该吃"问题)
    const priorityItems = items.filter(i => i.isUrgent || i.isExpired)

    const onboardingDismissed = wx.getStorageSync('fridgeOnboardDismissed')
    const showOnboardHint = items.length === 0 && !onboardingDismissed

    this.setData({
      items,
      priorityItems,
      totalKinds: items.length,
      urgentCount: getUrgentItems().length + getExpired().length,
      lowStockCount: getLowStockItems().length,
      todayAdviceCount: getTodayAdviceCount(),
      showOnboardHint
    }, () => this.applyFilter())
  },

  /* ============ 过滤 + 排序 ============ */
  applyFilter() {
    let list = [...this.data.items]

    const kw = this.data.searchKey.trim().toLowerCase()
    if (kw) list = list.filter(i => i.name.toLowerCase().includes(kw))

    if (this.data.locationTab !== 'all') {
      list = list.filter(i => i.storageLocation === this.data.locationTab)
    }

    switch (this.data.filterChip) {
      case 'urgent':
        list = list.filter(i => i.isUrgent || i.isExpired)
        break
      case 'low':
        list = list.filter(i => i.isLowStock)
        break
      case 'recent': {
        // recent: 取后 8 个（list 顺序就是添加顺序）
        const fridge = getFridge()
        const recentKeys = new Set(
          fridge.slice(-8).map((f, i) => `${f.name}-${fridge.length - 8 + i}`)
        )
        list = list.filter(i => recentKeys.has(i.key))
        break
      }
    }

    switch (this.data.sortBy) {
      case 'expiry':
        list.sort((a, b) => a.daysToExpiry - b.daysToExpiry)
        break
      case 'added':
        // key 后缀 idx 越大越新
        list.sort((a, b) => Number(b.key.split('-').pop()) - Number(a.key.split('-').pop()))
        break
      case 'portions':
        list.sort((a, b) => b.portions - a.portions)
        break
    }

    this.setData({ filteredItems: list })
  },

  /* ============ Hero pill 点击 ============ */
  filterByUrgent() {
    this.setData({ filterChip: 'urgent', locationTab: 'all' }, () => this.applyFilter())
  },
  filterByLow() {
    this.setData({ filterChip: 'low', locationTab: 'all' }, () => this.applyFilter())
  },
  showTodayAdvice() {
    wx.showModal({
      title: '今日建议',
      content: `临期 ${this.data.urgentCount} 项、库存少 ${this.data.lowStockCount} 项。建议优先安排到明日辅食计划。`,
      confirmText: '去计划',
      success: r => { if (r.confirm) wx.switchTab({ url: '/pages/plan/plan' }) }
    })
  },

  /* ============ 搜索 / Tab / Chip / Sort ============ */
  onSearch(e: any) {
    this.setData({ searchKey: e.detail.value || '' }, () => this.applyFilter())
  },
  setLocationTab(e: any) {
    this.setData({ locationTab: e.currentTarget.dataset.tab }, () => this.applyFilter())
  },
  setChip(e: any) {
    const v = e.currentTarget.dataset.chip
    this.setData({ filterChip: this.data.filterChip === v ? 'none' : v }, () => this.applyFilter())
  },
  showSort() {
    const labels = ['按过期日(近→远)', '按添加日(新→旧)', '按份数(多→少)']
    const keys: SortBy[] = ['expiry', 'added', 'portions']
    wx.showActionSheet({
      itemList: labels,
      success: r => {
        const sortBy = keys[r.tapIndex]
        this.setData({ sortBy, sortLabel: labels[r.tapIndex] }, () => this.applyFilter())
      }
    })
  },

  /* ============ 步进 +1 / -1 ============ */
  stepInc(e: any) {
    const { key, name, loc } = e.currentTarget.dataset
    quickAddFridgeItem(name, 1, loc)
    this.refresh()
  },
  stepDec(e: any) {
    const { key, name } = e.currentTarget.dataset
    const it = this.data.items.find(i => i.key === key)
    if (!it) return
    if (it.portions <= 1) {
      wx.showModal({
        title: '移除该食材?',
        content: `「${name}」最后 1 份，再扣减将移除。`,
        confirmText: '移除',
        confirmColor: '#E57373',
        success: r => {
          if (r.confirm) {
            consumePortion(name, 1)
            this.refresh()
          }
        }
      })
    } else {
      consumePortion(name, 1)
      this.refresh()
    }
  },

  /* ============ Onboard / 添加入口 ============ */
  dismissOnboard() {
    wx.setStorageSync('fridgeOnboardDismissed', true)
    this.setData({ showOnboardHint: false })
  },

  /* ============ More 菜单 ============ */
  openMore(e: any) {
    const key = e.currentTarget.dataset.key
    const item = this.data.items.find(i => i.key === key)
    this.setData({ moreOpenKey: key, moreOpenName: item ? item.name : '' })
  },
  closeMore() {
    this.setData({ moreOpenKey: '', moreOpenName: '' })
  },
  stopPropagation() {},

  /* ============ 更多菜单动作 ============ */
  actionAdjustExpiry(e: any) {
    const key = e.currentTarget.dataset.key
    const item = this.data.items.find(i => i.key === key)
    if (!item) return
    this.setData({ moreOpenKey: '' })
    wx.showActionSheet({
      itemList: ['延长 3 天', '延长 7 天', '延长 14 天', '重置为今天起 7 天'],
      success: r => {
        const days = [3, 7, 14][r.tapIndex]
        const baseMs = r.tapIndex === 3 ? todayLocalStartMs() : parseLocalDateMs(item.expiryDate)
        const newExpiry = new Date(baseMs + (days || 7) * 86400000)
        updateItemByKey(key, { expiryDate: formatLocalDate(newExpiry) })
        wx.showToast({ title: '已更新保质期', icon: 'success' })
        this.refresh()
      }
    })
  },

  actionMoveLocation(e: any) {
    const key = e.currentTarget.dataset.key
    this.setData({ moreOpenKey: '' })
    wx.showActionSheet({
      itemList: ['移到冷冻', '移到冷藏', '移到常温'],
      success: r => {
        const loc = LOC_OPTIONS[r.tapIndex]
        moveItemLocation(key, loc)
        wx.showToast({ title: `已移到${LOC_TO_LABEL[loc]}`, icon: 'success' })
        this.refresh()
      }
    })
  },

  actionAddToShopList(e: any) {
    const { key, name } = e.currentTarget.dataset
    this.setData({ moreOpenKey: '' })
    wx.showActionSheet({
      itemList: ['1 份', '2 份', '3 份', '5 份'],
      success: r => {
        const portions = [1, 2, 3, 5][r.tapIndex]
        addToManualShopList(name, portions)
        wx.showToast({ title: `${name} +${portions} 份采购`, icon: 'success' })
      }
    })
  },

  actionAddToTomorrow(e: any) {
    const { name } = e.currentTarget.dataset
    this.setData({ moreOpenKey: '' })

    // 找含该食材的食谱
    const matching: Recipe[] = RECIPES.filter(r =>
      r.ingredients.some(i => i.name === name)
    )
    if (matching.length === 0) {
      wx.showToast({ title: `没有含${name}的食谱`, icon: 'none' })
      return
    }

    // 取明日 plan
    const plan: DailyPlan[] = wx.getStorageSync('weeklyPlan') || []
    const tomorrow = formatLocalDate(new Date(todayLocalStartMs() + 86400000))
    const day = plan.find(p => p.date === tomorrow)
    if (!day || day.meals.length === 0) {
      wx.showToast({ title: '请先生成明日计划', icon: 'none' })
      return
    }

    // 弹 ActionSheet 选明日哪一餐
    const labels = day.meals.map(m => `第${m.mealIndex + 1}餐 (当前: ${m.recipe.name})`)
    wx.showActionSheet({
      itemList: labels,
      success: r => {
        const target = day.meals[r.tapIndex]
        // 选第一个 safe 食谱（如有 profile），否则取第一个
        const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
        let chosen: Recipe = matching[0]
        if (profile) {
          const safe = matching.find(rec => isRecipeApplicable(rec, profile).applicable)
          if (safe) chosen = safe
        }
        target.recipe = chosen
        wx.setStorageSync('weeklyPlan', plan)
        wx.showModal({
          title: '明日已更新',
          content: `第${target.mealIndex + 1}餐 → ${chosen.name}（用上${name}）`,
          confirmText: '去看计划',
          success: rr => { if (rr.confirm) wx.switchTab({ url: '/pages/plan/plan' }) }
        })
      }
    })
  },

  actionViewRecipes(e: any) {
    const { name } = e.currentTarget.dataset
    this.setData({ moreOpenKey: '' })
    wx.navigateTo({ url: `/pages/recipes/recipes?with=${encodeURIComponent(name)}` })
  },

  actionDiscard(e: any) {
    const { key, name } = e.currentTarget.dataset
    this.setData({ moreOpenKey: '' })
    wx.showModal({
      title: '丢弃并移除?',
      content: `「${name}」将从冰箱移除。`,
      confirmText: '丢弃',
      confirmColor: '#E57373',
      success: r => {
        if (r.confirm) {
          removeItemByKey(key)
          wx.showToast({ title: '已移除', icon: 'success' })
          this.refresh()
        }
      }
    })
  },

  /* ============ Tip 展开 ============ */
  toggleTip(e: any) {
    const key = e.currentTarget.dataset.key
    const items = this.data.items.map(it =>
      it.key === key ? { ...it, tipExpanded: !it.tipExpanded } : it
    )
    this.setData({ items }, () => this.applyFilter())
  },

  /* ============ 批量管理 ============ */
  toggleBatch() {
    this.setData({
      batchMode: !this.data.batchMode,
      selectedKeys: [],
      moreOpenKey: ''
    })
  },
  toggleSelect(e: any) {
    const key = e.currentTarget.dataset.key
    const sel = this.data.selectedKeys
    const next = sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key]
    this.setData({ selectedKeys: next })
  },
  selectAll() {
    this.setData({ selectedKeys: this.data.filteredItems.map(i => i.key) })
  },
  clearSelection() {
    this.setData({ selectedKeys: [] })
  },
  batchDiscard() {
    if (this.data.selectedKeys.length === 0) return
    wx.showModal({
      title: `丢弃 ${this.data.selectedKeys.length} 项?`,
      content: '所选食材将从冰箱移除',
      confirmText: '丢弃',
      confirmColor: '#E57373',
      success: r => {
        if (!r.confirm) return
        // 从后往前删，避免 idx 错位
        const keys = [...this.data.selectedKeys].sort((a, b) =>
          Number(b.split('-').pop()) - Number(a.split('-').pop())
        )
        keys.forEach(k => removeItemByKey(k))
        wx.showToast({ title: `已移除 ${keys.length} 项`, icon: 'success' })
        this.setData({ selectedKeys: [], batchMode: false })
        this.refresh()
      }
    })
  },
  batchToShopList() {
    if (this.data.selectedKeys.length === 0) return
    const sel = this.data.selectedKeys
    const names = this.data.items.filter(i => sel.includes(i.key)).map(i => i.name)
    names.forEach(n => addToManualShopList(n, 1))
    wx.showToast({ title: `${names.length} 项已加入采购`, icon: 'success' })
    this.setData({ selectedKeys: [], batchMode: false })
  }
})
