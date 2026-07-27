// 回顾页统计 + 食材 emoji + 时间流合并 helpers
import { MealLog, getJournal, getMealTime } from './journal'
import { ReactionLog, getReactions } from './reactions'
import { getCategoryByFood } from '../data/categories'
import { parseLocalDateMs } from './dateUtil'

// 高频食材 emoji 映射, 没匹配的回退到 category 推
const INGREDIENT_EMOJI: Record<string, string> = {
  '猪肉': '🐷', '牛肉': '🐂', '羊肉': '🐑', '鸡肉': '🐔', '鸡胸肉': '🐔', '鸡腿肉': '🐔',
  '鸭肉': '🦆', '猪肝': '🥩', '鸡肝': '🥩', '排骨': '🥩',
  '虾': '🦐', '蟹': '🦀',
  '鳕鱼': '🐟', '三文鱼': '🐟', '鲈鱼': '🐟', '龙利鱼': '🐟', '黄花鱼': '🐟', '巴沙鱼': '🐟', '银鱼': '🐟',
  '蛋黄': '🥚', '蛋白': '🥚', '鹌鹑蛋': '🥚', '鸭蛋': '🥚',
  '豆腐': '🟨', '豆浆': '🥛',
  '南瓜': '🎃', '冬瓜': '🟢', '黄瓜': '🥒', '西葫芦': '🥒', '茄子': '🍆', '番茄': '🍅', '苦瓜': '🥒',
  '胡萝卜': '🥕', '土豆': '🥔', '红薯': '🍠', '紫薯': '🍠', '山药': '🥢', '白萝卜': '🥢', '藕': '🥢',
  '西兰花': '🥦', '花椰菜': '🥦', '卷心菜': '🥬', '紫甘蓝': '🥬',
  '菠菜': '🌿', '小白菜': '🌿', '油菜': '🌿', '生菜': '🥬', '上海青': '🌿', '空心菜': '🌿', '苋菜': '🌿',
  '香菇': '🍄', '平菇': '🍄', '金针菇': '🍄', '木耳': '🟫',
  '苹果': '🍎', '梨': '🍐', '香蕉': '🍌', '火龙果': '🐉', '蓝莓': '🫐', '牛油果': '🥑',
  '木瓜': '🥭', '哈密瓜': '🍈', '西瓜': '🍉', '葡萄': '🍇', '桃子': '🍑', '樱桃': '🍒',
  '芒果': '🥭', '菠萝': '🍍', '猕猴桃': '🥝', '草莓': '🍓', '橙子': '🍊',
  '大米': '🍚', '小米': '🌾', '燕麦': '🌾', '糙米': '🌾',
  '高铁米粉': '🍚', '婴儿米粉': '🍚', '婴儿面条': '🍜', '面条': '🍜',
  '核桃油': '🫒', '亚麻籽油': '🫒', '橄榄油': '🫒', '芝麻油': '🫒',
  '奶酪粉': '🧀', '海苔碎': '🍙', '芝麻粉': '🌰', '虾皮粉': '🦐',
  '酸奶': '🥛',
  '自制浓汤宝': '🥣', '自制肉松': '🥩', '自制果泥块': '🍎', '自制骨汤': '🍲'
}

// 按 category mainCategory 兜底
const CATEGORY_EMOJI_FALLBACK: Record<string, string> = {
  staple: '🍚', protein: '🥩', veg: '🥬', fruit: '🍎',
  oil: '🫒', condiment: '🧂', preprocessed: '🍲', product: '🍼'
}

export function getIngredientEmoji(name: string): string {
  if (INGREDIENT_EMOJI[name]) return INGREDIENT_EMOJI[name]
  const cat = getCategoryByFood(name)
  if (cat) return CATEGORY_EMOJI_FALLBACK[cat.mainCategory] || '🥄'
  return '🥄'
}

// 扫所有 mealJournal, 返回每个食材的「首次出现日期」(YYYY-MM-DD)
// 用于「新食材」徽章 + 7 天新引入统计
export function getFirstSeenMap(): Map<string, string> {
  const map = new Map<string, string>()
  const logs = getJournal()
  // 按日期升序遍历, 首次出现就记下
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.mealIndex - b.mealIndex)
  for (const log of sorted) {
    for (const ing of log.ingredients || []) {
      if (!map.has(ing)) map.set(ing, log.date)
    }
  }
  return map
}

// 判断「新食材」: 满足两条件
//   1. 该食材在 journal 里首次出现就是这条 log
//   2. 该食材对应品类的 passedDate 在最近 NEW_INTRO_DAYS 天内开放
//      (welcome 一次性初始化设的 passedDate = today-30d, 不算新)
//      自定义食材(无 category)直接算新
const NEW_INTRO_DAYS = 7

import { BabyProfile } from './planner'

export function isFoodNew(
  ingName: string,
  log: MealLog,
  firstSeen: Map<string, string>,
  profile: BabyProfile | null
): boolean {
  // 必须是该食材在 journal 里的首次出现
  if (firstSeen.get(ingName) !== log.date) return false
  // 自定义食材(库里没分类) → 算新
  if (!getCategoryByFood(ingName)) return true
  if (!profile) return false

  // 正在 introducing 期 (3 天引入观察)
  const ex = profile.individualExceptions[ingName]
  if (ex?.state === 'introducing') return true

  // 该食材所属品类当前正在 trying 期且 tryingFood 就是它
  const cat = getCategoryByFood(ingName)
  if (cat) {
    const catState = profile.categoryAllergies[cat.id]
    if (catState?.state === 'trying' && catState.tryingFood === ingName) return true
  }

  // 排敏 / 复试通过后 NEW_INTRO_DAYS 天内
  const rec = (profile.recentlyAddedFoods || []).find(f => f.name === ingName)
  if (rec) {
    const daysSince = (Date.now() - parseLocalDateMs(rec.addedAt)) / 86400000
    if (daysSince >= 0 && daysSince <= NEW_INTRO_DAYS) return true
  }

  return false
}

// 7 天饮食摘要
export interface WeekSummary {
  range: { from: string; to: string }
  rangeLabel: string
  loveCount: number
  loveDelta: number
  newFoodCount: number
  newFoodDelta: number
  reactionCount: number
  reactionDelta: number
  // 动态营养缺口格: 自动挑当前最缺的维度
  nutritionDays: number
  nutritionLabel: string  // "未吃绿叶菜" / "未吃红肉" 等
  nutritionEmoji: string
  nutritionHint: string
  nutritionState: 'ok' | 'warn' | 'normal'
}

// 营养维度定义: cats 任一开放才纳入候选
interface NutritionDimDef {
  key: string
  label: string
  emoji: string
  cats: string[]  // 关联 categoryIds
}

const NUTRITION_DIMS: NutritionDimDef[] = [
  { key: 'greenVeg', label: '未吃绿叶菜', emoji: '🌿', cats: ['leafy', 'cruciferous'] },
  { key: 'redMeat', label: '未吃红肉', emoji: '🥩', cats: ['redMeat'] },
  { key: 'fish', label: '未吃鱼', emoji: '🐟', cats: ['fish'] },
  { key: 'fruit', label: '未吃水果', emoji: '🍎', cats: ['fruitLow', 'fruitMelon', 'fruitStoneBerry', 'fruitCitrus', 'fruitHigh'] }
]

// 算「距今多少天没吃含 cats 任一品类的食材」(parseLocalDateMs 已统一从 ./dateUtil 导入)
function daysSinceLastInCats(logs: MealLog[], cats: string[], todayMs: number): number {
  const catSet = new Set(cats)
  let latestMs = -Infinity
  for (const log of logs) {
    const hit = (log.ingredients || []).some(ing => {
      const c = getCategoryByFood(ing)
      return !!c && catSet.has(c.id)
    })
    if (hit) {
      const ms = parseLocalDateMs(log.date)
      if (ms > latestMs) latestMs = ms
    }
  }
  if (latestMs === -Infinity) {
    // 从未吃过: 兜底用最早 log 日期到今天的间隔
    const earliest = logs.reduce((acc, l) => {
      const ms = parseLocalDateMs(l.date)
      return acc === null || ms < acc ? ms : acc
    }, null as null | number)
    return earliest !== null ? Math.max(0, Math.floor((todayMs - earliest) / 86400000)) : 0
  }
  return Math.max(0, Math.floor((todayMs - latestMs) / 86400000))
}

export function summarize7Days(profile: BabyProfile | null, refDate?: Date): WeekSummary {
  const ref = refDate || new Date()
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const thisWeekStart = new Date(today.getTime() - 6 * 86400 * 1000)
  const lastWeekStart = new Date(today.getTime() - 13 * 86400 * 1000)
  const lastWeekEnd = new Date(today.getTime() - 7 * 86400 * 1000)

  const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const monthDay = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

  const logs = getJournal()
  const reactions = getReactions()
  const firstSeen = getFirstSeenMap()

  const isInRange = (logDate: string, startDate: Date, endDate: Date) => {
    return logDate >= dateStr(startDate) && logDate <= dateStr(endDate)
  }

  // 本周
  const thisWeekLogs = logs.filter(l => isInRange(l.date, thisWeekStart, today))
  const thisWeekReactions = reactions.filter(r => {
    const d = r.occurredAt.slice(0, 10)
    return d >= dateStr(thisWeekStart) && d <= dateStr(today)
  })
  const loveCount = thisWeekLogs.filter(l => l.preference === 'love').length
  const newFoods = new Set<string>()
  for (const log of thisWeekLogs) {
    for (const ing of log.ingredients || []) {
      if (isFoodNew(ing, log, firstSeen, profile) && isInRange(log.date, thisWeekStart, today)) {
        newFoods.add(ing)
      }
    }
  }
  const newFoodCount = newFoods.size
  const reactionCount = thisWeekReactions.length

  // 动态营养缺口: 选当前最缺的维度 (按 daysSince 降序), 仅对已开放的品类计算
  const todayMs = today.getTime()
  const eligibleDims = profile
    ? NUTRITION_DIMS.filter(d => d.cats.some(c => profile.categoryAllergies[c]?.state === 'open'))
    : NUTRITION_DIMS
  const dimScores = eligibleDims.map(d => ({
    ...d,
    daysSince: daysSinceLastInCats(logs, d.cats, todayMs)
  })).sort((a, b) => b.daysSince - a.daysSince)
  const topDim = dimScores[0] || { key: 'greenVeg', label: '未吃绿叶菜', emoji: '🌿', daysSince: 0 }

  // 上周
  const lastWeekLogs = logs.filter(l => isInRange(l.date, lastWeekStart, lastWeekEnd))
  const lastWeekReactions = reactions.filter(r => {
    const d = r.occurredAt.slice(0, 10)
    return d >= dateStr(lastWeekStart) && d <= dateStr(lastWeekEnd)
  })
  const lastLove = lastWeekLogs.filter(l => l.preference === 'love').length
  const lastNewFoods = new Set<string>()
  for (const log of lastWeekLogs) {
    for (const ing of log.ingredients || []) {
      // 上周新引入: 用同样规则 (passedDate 在 log 那天的近 7 天)
      // 简化: 仅按 firstSeen 与 log.date 匹配判定; 上周老食材 first-seen 多半早于上周
      if (firstSeen.get(ing) === log.date) lastNewFoods.add(ing)
    }
  }
  const lastReactions = lastWeekReactions.length

  // hint 文案+配色: 0 天 = 今日吃过(绿); 1 天 = 昨日吃过(绿); 2 天 默认(灰); 3+ 提示关注(橙)
  let nutritionHint = ''
  let nutritionState: 'ok' | 'warn' | 'normal' = 'normal'
  if (topDim.daysSince === 0) {
    nutritionHint = '今日吃过 ✓'
    nutritionState = 'ok'
  } else if (topDim.daysSince === 1) {
    nutritionHint = '昨日吃过 ✓'
    nutritionState = 'ok'
  } else if (topDim.daysSince >= 3) {
    nutritionHint = '建议关注'
    nutritionState = 'warn'
  }

  return {
    range: { from: dateStr(thisWeekStart), to: dateStr(today) },
    rangeLabel: `${monthDay(thisWeekStart)} - ${monthDay(today)}`,
    loveCount,
    loveDelta: loveCount - lastLove,
    newFoodCount,
    newFoodDelta: newFoodCount - lastNewFoods.size,
    reactionCount,
    reactionDelta: reactionCount - lastReactions,
    nutritionDays: topDim.daysSince,
    nutritionLabel: topDim.label,
    nutritionEmoji: topDim.emoji,
    nutritionHint,
    nutritionState
  }
}

// delta 格式化: +2 / -1 / 持平
export function formatDelta(delta: number): string {
  if (delta === 0) return '比上周持平'
  if (delta > 0) return `比上周 +${delta}`
  return `比上周 ${delta}`
}

// 时间流 event 类型
export type TimelineEventType = 'meal' | 'reaction'

export interface TimelineEvent {
  type: TimelineEventType
  date: string         // YYYY-MM-DD
  timeLabel: string    // HH:mm
  timestampMs: number  // 排序用
  payload: any         // 具体 log 或 reaction
}

// 合并 logs 和 reactions 为时间流, 按日期分组(降序), 日内按时间升序
export function buildTimeline(logs: MealLog[], reactions: ReactionLog[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const log of logs) {
    const t = new Date(getMealTime(log))
    events.push({
      type: 'meal',
      date: log.date,
      timeLabel: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      timestampMs: t.getTime(),
      payload: log
    })
  }
  for (const r of reactions) {
    const t = new Date(r.occurredAt)
    events.push({
      type: 'reaction',
      date: r.occurredAt.slice(0, 10),
      timeLabel: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      timestampMs: t.getTime(),
      payload: r
    })
  }
  // 日期降序, 日内时间升序
  events.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return a.timestampMs - b.timestampMs
  })
  return events
}
