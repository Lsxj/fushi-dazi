// 食材搭配禁忌种子表
//
// 设计原则（跟蘑菇先生对齐过）:
// 1. 只收录两类: 'hard' = 医学/营养学共识；'soft' = 影响吸收/消化但有缓解方法
// 2. 民间禁忌（柿子+螃蟹、香蕉+土豆、鸡肉+芝麻 这类）一律不录，避免把搭子做成"什么都不能吃"
// 3. 月龄硬禁（蜂蜜<12m、生蛋白<12m、高汞鱼）走 ingredient.applicableMonth 体系，不进禁忌表
//
// 在 isRecipeApplicable 中的语义:
//   日常: 只 hard 阻断；soft 不阻断（避免日常烦人）
//   排敏期 (introducing): hard 阻断；soft 无 mitigation 阻断；soft 有 mitigation 返回 warning 但放行

export interface Taboo {
  foods: [string, string]
  level: 'hard' | 'soft'
  reason: string
  mitigation?: string  // 有 mitigation 的 soft 在排敏期可放行 + UI 提示
  source: 'CNS2022' | 'AAP' | 'WHO' | 'NutritionConsensus'
}

export const TABOOS: Taboo[] = [
  // ---- 草酸-钙 (影响钙/铁吸收, 焯水可大幅降低) ----
  {
    foods: ['菠菜', '豆腐'],
    level: 'soft',
    reason: '草酸与钙结合形成草酸钙,降低钙吸收',
    mitigation: '菠菜先焯水 30 秒去草酸',
    source: 'NutritionConsensus'
  },
  {
    foods: ['菠菜', '牛奶'],
    level: 'soft',
    reason: '草酸与钙结合,降低钙吸收',
    mitigation: '菠菜先焯水 30 秒',
    source: 'NutritionConsensus'
  },
  {
    foods: ['菠菜', '黄豆'],
    level: 'soft',
    reason: '草酸+钙形成沉淀',
    mitigation: '菠菜先焯水',
    source: 'NutritionConsensus'
  },
  {
    foods: ['菠菜', '虾'],
    level: 'soft',
    reason: '草酸影响虾中钙的吸收',
    mitigation: '菠菜先焯水',
    source: 'NutritionConsensus'
  },
  {
    foods: ['苋菜', '豆腐'],
    level: 'soft',
    reason: '高草酸蔬菜+钙,降低钙吸收',
    mitigation: '苋菜先焯水',
    source: 'NutritionConsensus'
  },
  {
    foods: ['苋菜', '牛奶'],
    level: 'soft',
    reason: '草酸+钙',
    mitigation: '苋菜先焯水',
    source: 'NutritionConsensus'
  },

  // ---- 鞣酸-铁/蛋白 (浓茶/未熟柿子等场景在辅食中本就不该出现) ----
  // 婴幼儿不喝茶,不放;柿子未熟才有鞣酸,熟柿子+蛋白质对宝宝无明显风险 → 不录

  // ---- 高纤+高钙同餐 (植酸/纤维影响矿物质吸收, 隔餐即可) ----
  {
    foods: ['燕麦', '牛奶'],
    level: 'soft',
    reason: '燕麦植酸影响牛奶中钙铁吸收',
    mitigation: '日常无碍;补钙补铁餐建议隔开',
    source: 'NutritionConsensus'
  },

  // ---- 维生素 C 氧化酶 (理论存在但实际辅食烹饪温度足以钝化) ----
  // 黄瓜+番茄、白萝卜+胡萝卜 这类经烹饪基本无影响 → 不录

  // ---- 含铜食材+维C (会氧化破坏 VC, 但日常剂量影响有限) ----
  {
    foods: ['猪肝', '番茄'],
    level: 'soft',
    reason: '猪肝铜离子加速番茄维生素 C 氧化',
    mitigation: '番茄分餐吃;或快炒减少受热时间',
    source: 'NutritionConsensus'
  },
  {
    foods: ['猪肝', '青椒'],
    level: 'soft',
    reason: '铜离子破坏维生素 C',
    mitigation: '分餐摄入',
    source: 'NutritionConsensus'
  },

  // ---- 真正的 hard (婴幼儿场景里几乎不会撞,但留几条兜底) ----
  // 注: 蜂蜜<12m 是月龄硬禁,走 ingredient.applicableMonth, 不进这里
  //     生鸡蛋白、未熟海鲜同理走食材层
]

export function checkTaboo(foodA: string, foodB: string): Taboo | undefined {
  return TABOOS.find(t =>
    (t.foods[0] === foodA && t.foods[1] === foodB) ||
    (t.foods[0] === foodB && t.foods[1] === foodA)
  )
}

export function findTaboosForIngredients(ingredients: string[]): Taboo[] {
  const found: Taboo[] = []
  for (let i = 0; i < ingredients.length; i++) {
    for (let j = i + 1; j < ingredients.length; j++) {
      const t = checkTaboo(ingredients[i], ingredients[j])
      if (t) found.push(t)
    }
  }
  return found
}

// 找出"目标食材 X 与其他所有食材"的禁忌对(排敏场景专用)
export function findTaboosAgainst(target: string, others: string[]): Taboo[] {
  const found: Taboo[] = []
  for (const o of others) {
    if (o === target) continue
    const t = checkTaboo(target, o)
    if (t) found.push(t)
  }
  return found
}
