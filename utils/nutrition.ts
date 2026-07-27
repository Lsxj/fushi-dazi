/**
 * 婴幼儿辅食营养规则 —— 数据驱动版
 *
 * 依据：
 * - WHO Infant and Young Child Feeding (IYCF) 2023:
 *   https://www.who.int/news-room/fact-sheets/detail/infant-and-young-child-feeding
 *   核心：6 月起引入辅食；7+ 月每日 dietary diversity ≥ 4 食物组；
 *   每日 ≥ 1 次动物源食物（肉/鱼/蛋/奶）以保铁锌。
 * - 中国营养学会《7-24 月龄婴幼儿喂养指南》2022 版：
 *   - 6 月添加铁强化米粉为第一口辅食
 *   - 7-9 月每日 1 个蛋黄 + 50g 红肉/鱼 + 1-2 种蔬果
 *   - 10-12 月每日 1 蛋 + 50g 蛋白源 + 50-100g 蔬果 + 50-75g 谷物
 *   - 13-24 月接近成人膳食结构
 * - AAP (American Academy of Pediatrics) 2024 Solid Food Introduction:
 *   - 6 月单一食物起步，每次试新食物间隔 3-5 天观察
 *   - 8 月起鼓励 finger food 锻炼自主进食
 *   - 强调 iron-rich 食物（强化谷物/红肉/豆类）作为首批辅食
 *
 * 设计原则：
 * 1. 6 月以前不出现在 planner 服务范围内（welcome 阶段）
 * 2. 6 月：单一引入，只要求主食（含强化米粉），不强求多类
 * 3. 7-8 月：基础应有"主食 + 蛋白"，蔬菜鼓励但非硬约束
 * 4. 9 月起：每餐都应主食 + 蛋白 + 蔬菜三类全（除非排敏天放宽）
 * 5. 12 月起：质地从泥/碎过渡到颗粒/手指食物，类别要求不变
 * 6. 每周维度铁/DHA/钙摄入次数硬指标
 *
 * 排敏天（trying day）放宽 required 约束，允许引入新单类食物。
 */

export interface NutritionRule {
  /** 适用月龄下限 */
  minMonth: number
  /** 阶段名称（用于 UI 解释） */
  stageName: string
  /** 每餐必须覆盖的类别（硬约束） */
  required: ('staple' | 'protein' | 'veg')[]
  /** 每餐推荐覆盖的类别（鼓励但不强制） */
  encouraged: ('staple' | 'protein' | 'veg' | 'fruit')[]
  /** 每周高铁餐次下限（红肉/动物肝/强化谷物算高铁） */
  ironRichPerWeek: number
  /** 每周 DHA 来源餐次下限（深海鱼/亚麻籽油/蛋黄） */
  dhaSourcesPerWeek: number
  /** 每天蛋黄/全蛋上限 */
  eggsPerDay: number
  /** 是否鼓励 finger food */
  encourageFingerFood: boolean
  /** 一句话指南依据 */
  sourceNote: string
}

export const NUTRITION_RULES: NutritionRule[] = [
  {
    minMonth: 4,
    stageName: '尝鲜起步期',
    required: ['staple'],
    encouraged: ['staple'],
    ironRichPerWeek: 5,
    dhaSourcesPerWeek: 0,
    eggsPerDay: 0,
    encourageFingerFood: false,
    sourceNote: 'WHO+中营养会：6 月起以铁强化米粉为第一口辅食，单一食物逐一引入。'
  },
  {
    minMonth: 6,
    stageName: '单一引入期',
    required: ['staple'],
    encouraged: ['staple', 'veg', 'fruit'],
    ironRichPerWeek: 5,
    dhaSourcesPerWeek: 0,
    eggsPerDay: 0,
    encourageFingerFood: false,
    sourceNote: 'AAP 2024：单一食物起步，每次试新食物间隔 3-5 天观察。'
  },
  {
    minMonth: 7,
    stageName: '蛋白引入期',
    required: ['staple', 'protein'],
    encouraged: ['staple', 'protein', 'veg'],
    ironRichPerWeek: 6,
    dhaSourcesPerWeek: 1,
    eggsPerDay: 1,
    encourageFingerFood: false,
    sourceNote: '中营养会 2022：每日 1 蛋黄 + 50g 红肉/鱼，蔬菜鼓励但非硬约束。'
  },
  {
    minMonth: 9,
    stageName: '营养均衡期',
    required: ['staple', 'protein', 'veg'],
    encouraged: ['staple', 'protein', 'veg', 'fruit'],
    ironRichPerWeek: 7,
    dhaSourcesPerWeek: 2,
    eggsPerDay: 1,
    encourageFingerFood: true,
    sourceNote: 'WHO IYCF：7+ 月每日 ≥4 食物组；中营养会：每餐主+蛋+蔬三类全。'
  },
  {
    minMonth: 12,
    stageName: '手指食物期',
    required: ['staple', 'protein', 'veg'],
    encouraged: ['staple', 'protein', 'veg', 'fruit'],
    ironRichPerWeek: 7,
    dhaSourcesPerWeek: 2,
    eggsPerDay: 1,
    encourageFingerFood: true,
    sourceNote: 'AAP：12 月起鼓励 finger food 锻炼自主进食；每日 3 顿+ 1-2 加餐。'
  },
  {
    minMonth: 18,
    stageName: '过渡成人膳食期',
    required: ['staple', 'protein', 'veg'],
    encouraged: ['staple', 'protein', 'veg', 'fruit'],
    ironRichPerWeek: 7,
    dhaSourcesPerWeek: 2,
    eggsPerDay: 1,
    encourageFingerFood: true,
    sourceNote: '中营养会 2022：13-24 月逐步过渡到成人膳食结构。'
  }
]

/** 根据月龄返回适用的营养规则 */
export function getNutritionRule(ageMonths: number): NutritionRule {
  // 找最大 minMonth <= ageMonths 的规则
  const sorted = [...NUTRITION_RULES].sort((a, b) => b.minMonth - a.minMonth)
  return sorted.find(r => ageMonths >= r.minMonth) || NUTRITION_RULES[0]
}

/** 判断单个食谱是否满足"每餐必备"硬约束 */
export function meetsRequired(mealCategories: string[], rule: NutritionRule): boolean {
  return rule.required.every(c => mealCategories.includes(c))
}

/** 给单个食谱按规则打分（covered + 鼓励维度） */
export function scoreByRule(mealCategories: string[], rule: NutritionRule): number {
  let score = 0
  for (const c of rule.required) {
    if (mealCategories.includes(c)) score += 15
    else score -= 30 // 不满足硬约束重罚
  }
  for (const c of rule.encouraged) {
    if (!rule.required.includes(c as any) && mealCategories.includes(c)) score += 4
  }
  return score
}
