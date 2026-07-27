import { reconcileCategorySchema, BabyProfile, generateWeeklyPlan } from './utils/planner'

const RECOVERED_MEAL_JOURNAL = [
  {
    date: '2026-05-10',
    mealIndex: 0,
    recipeId: 'r024',
    recipeName: '猪肝菠菜粥',
    ingredients: ['猪肝', '菠菜', '大米'],
    loggedAt: '2026-05-10T08:11:53.284Z'
  },
  {
    date: '2026-05-10',
    mealIndex: 1,
    recipeId: 'r021',
    recipeName: '牛肉南瓜粥',
    ingredients: ['牛肉', '南瓜', '大米'],
    loggedAt: '2026-05-10T08:11:57.004Z'
  },
  {
    date: '2026-05-10',
    mealIndex: 2,
    recipeId: 'r010',
    recipeName: '牛肉土豆粥',
    ingredients: ['牛肉', '土豆', '大米'],
    loggedAt: '2026-05-10T08:12:01.020Z'
  }
]

const RECOVERED_REACTIONS = [
  {
    id: 'r-1778400740965-vomit',
    occurredAt: '2026-05-09T12:00:00.000Z',
    type: 'vomit',
    severity: 'mild',
    note: '',
    tracebackMeals: [],
    suspectedFoods: []
  }
]

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // Init cloud development so wx.cloud.callFunction works for chat-ai.
    // If wx.cloud is unavailable (older WeChat client / preview without
    // cloud dev), the ai-chat page will fall back to local mock mode.
    if (wx.cloud) {
      try {
        wx.cloud.init({ traceUser: true })
      } catch (err) {
        console.warn('wx.cloud.init failed; chat-ai will use local mock:', err)
      }
    }
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (profile && reconcileCategorySchema(profile)) {
      wx.setStorageSync('babyProfile', profile)
    }
    if (profile) recoverMissingBusinessData(profile)
  },
  onShow() {
    const profile: BabyProfile | null = wx.getStorageSync('babyProfile')
    if (profile) recoverMissingBusinessData(profile)
  },
})

function recoverMissingBusinessData(profile: BabyProfile) {
  // One-time recovery for the July 2026 preview storage split: some clients kept
  // babyProfile but lost the timeline/plan keys. Only fill missing keys.
  if (profile.babyName !== '宝宝' || profile.birthday !== '2025-05-10') return

  const journal = wx.getStorageSync('mealJournal')
  if (!Array.isArray(journal) || journal.length === 0) {
    wx.setStorageSync('mealJournal', RECOVERED_MEAL_JOURNAL)
  }

  const reactions = wx.getStorageSync('reactions')
  if (!Array.isArray(reactions) || reactions.length === 0) {
    wx.setStorageSync('reactions', RECOVERED_REACTIONS)
  }

  const weeklyPlan = wx.getStorageSync('weeklyPlan')
  if (!Array.isArray(weeklyPlan) || weeklyPlan.length === 0) {
    wx.setStorageSync('weeklyPlan', generateWeeklyPlan(profile, 7))
  }
}

interface IAppOption {
  globalData: Record<string, unknown>
  onLaunch?: () => void
  onShow?: () => void
}
