import { getCustomFoods } from '../utils/customFoods'

export interface Ingredient {
  name: string
  categoryId: string
  defaultStorage: 'frozen' | 'refrigerated' | 'room'
  shelfLifeDays: { frozen?: number; refrigerated?: number; room?: number }
  prepSteps: PrepStep[]
  servingGramsPerPortion: number
  applicableMonth: number
  riskLevel: 'low' | 'medium' | 'high' | 'extreme'
  nutritionTags: string[]
}

export interface PrepStep {
  type: 'thaw' | 'soak' | 'wash' | 'peel' | 'debone' | 'destem' | 'blanch' | 'marinate'
  hoursAhead: number
  description: string
}

export const INGREDIENTS: Ingredient[] = [
  // ===== 根茎类 =====
  { name: '山药', categoryId: 'root', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 14, room: 7 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }, { type: 'peel', hoursAhead: 0, description: '去皮(戴手套防过敏)' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['碳水', '健脾'] },
  { name: '土豆', categoryId: 'root', defaultStorage: 'room', shelfLifeDays: { room: 30, refrigerated: 60 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }, { type: 'peel', hoursAhead: 0, description: '去皮' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['碳水', '钾'] },
  { name: '胡萝卜', categoryId: 'root', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 14 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }, { type: 'peel', hoursAhead: 0, description: '去皮' }],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['维生素A', '胡萝卜素'] },
  { name: '红薯', categoryId: 'root', defaultStorage: 'room', shelfLifeDays: { room: 21 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }, { type: 'peel', hoursAhead: 0, description: '去皮' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['碳水', '膳食纤维'] },

  // ===== 绿叶菜 =====
  { name: '菠菜', categoryId: 'leafy', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 5 },
    prepSteps: [
      { type: 'wash', hoursAhead: 0, description: '清洗' },
      { type: 'blanch', hoursAhead: 0, description: '焯水30秒去草酸' }
    ],
    servingGramsPerPortion: 20, applicableMonth: 6, riskLevel: 'medium', nutritionTags: ['铁', '叶酸', '维生素K'] },
  { name: '娃娃菜', categoryId: 'leafy', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 7 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['维生素C'] },
  { name: '小白菜', categoryId: 'leafy', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 5 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['维生素C', '钙'] },

  // ===== 十字花科 =====
  { name: '西兰花', categoryId: 'cruciferous', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 7 },
    prepSteps: [
      { type: 'wash', hoursAhead: 0, description: '盐水浸泡10分钟' },
      { type: 'blanch', hoursAhead: 0, description: '焯水1分钟' }
    ],
    servingGramsPerPortion: 20, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['维生素C', '抗氧化'] },

  // ===== 瓜类蔬菜 =====
  { name: '南瓜', categoryId: 'gourd', defaultStorage: 'room', shelfLifeDays: { room: 30, refrigerated: 14 },
    prepSteps: [{ type: 'peel', hoursAhead: 0, description: '去皮去瓤' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['胡萝卜素', '维生素A'] },
  { name: '冬瓜', categoryId: 'gourd', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 14 },
    prepSteps: [{ type: 'peel', hoursAhead: 0, description: '去皮去瓤' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['利尿', '清淡'] },
  { name: '西葫芦', categoryId: 'gourd', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 7 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['维生素C'] },

  // ===== 红肉类 =====
  { name: '猪肉', categoryId: 'redMeat', defaultStorage: 'frozen', shelfLifeDays: { frozen: 90, refrigerated: 2 },
    prepSteps: [
      { type: 'thaw', hoursAhead: 12, description: '冷藏解冻12小时' },
      { type: 'wash', hoursAhead: 0, description: '焯水去血沫' }
    ],
    servingGramsPerPortion: 20, applicableMonth: 7, riskLevel: 'medium', nutritionTags: ['优质蛋白', '铁', '锌'] },
  { name: '牛肉', categoryId: 'redMeat', defaultStorage: 'frozen', shelfLifeDays: { frozen: 90, refrigerated: 2 },
    prepSteps: [
      { type: 'thaw', hoursAhead: 12, description: '冷藏解冻12小时' },
      { type: 'wash', hoursAhead: 0, description: '焯水去血沫' }
    ],
    servingGramsPerPortion: 20, applicableMonth: 7, riskLevel: 'medium', nutritionTags: ['优质蛋白', '铁', '锌'] },

  // ===== 白肉类 =====
  { name: '鸡胸肉', categoryId: 'whiteMeat', defaultStorage: 'frozen', shelfLifeDays: { frozen: 90, refrigerated: 2 },
    prepSteps: [
      { type: 'thaw', hoursAhead: 12, description: '冷藏解冻12小时' }
    ],
    servingGramsPerPortion: 20, applicableMonth: 7, riskLevel: 'medium', nutritionTags: ['优质蛋白', '低脂'] },

  // ===== 鱼类 =====
  { name: '鳕鱼', categoryId: 'fish', defaultStorage: 'frozen', shelfLifeDays: { frozen: 90, refrigerated: 2 },
    prepSteps: [
      { type: 'thaw', hoursAhead: 12, description: '冷藏解冻12小时' },
      { type: 'debone', hoursAhead: 0, description: '仔细去刺' }
    ],
    servingGramsPerPortion: 30, applicableMonth: 7, riskLevel: 'high', nutritionTags: ['优质蛋白', 'DHA', '低脂'] },
  { name: '三文鱼', categoryId: 'fish', defaultStorage: 'frozen', shelfLifeDays: { frozen: 90, refrigerated: 2 },
    prepSteps: [
      { type: 'thaw', hoursAhead: 12, description: '冷藏解冻12小时' },
      { type: 'debone', hoursAhead: 0, description: '仔细去刺' }
    ],
    servingGramsPerPortion: 30, applicableMonth: 7, riskLevel: 'high', nutritionTags: ['优质蛋白', 'DHA', 'Omega-3'] },
  { name: '龙利鱼', categoryId: 'fish', defaultStorage: 'frozen', shelfLifeDays: { frozen: 90 },
    prepSteps: [{ type: 'thaw', hoursAhead: 12, description: '冷藏解冻12小时' }],
    servingGramsPerPortion: 30, applicableMonth: 7, riskLevel: 'high', nutritionTags: ['优质蛋白', '无刺'] },

  // ===== 虾类 =====
  { name: '虾', categoryId: 'shrimp', defaultStorage: 'frozen', shelfLifeDays: { frozen: 60, refrigerated: 1 },
    prepSteps: [
      { type: 'thaw', hoursAhead: 8, description: '冷藏解冻8小时' },
      { type: 'destem', hoursAhead: 0, description: '去虾线、去虾壳' }
    ],
    servingGramsPerPortion: 20, applicableMonth: 12, riskLevel: 'extreme', nutritionTags: ['优质蛋白', '钙'] },

  // ===== 谷物 =====
  { name: '高铁米粉', categoryId: 'grainLow', defaultStorage: 'room', shelfLifeDays: { room: 180 },
    prepSteps: [],
    servingGramsPerPortion: 15, applicableMonth: 4, riskLevel: 'low',
    nutritionTags: ['铁', '碳水', '主食', '低敏首选', '辅食入门'] },
  { name: '大米', categoryId: 'grainLow', defaultStorage: 'room', shelfLifeDays: { room: 180 },
    prepSteps: [
      { type: 'wash', hoursAhead: 0, description: '淘米' },
      { type: 'soak', hoursAhead: 0.5, description: '浸泡30分钟更软糯' }
    ],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['碳水', '主食'] },
  { name: '小米', categoryId: 'grainLow', defaultStorage: 'room', shelfLifeDays: { room: 180 },
    prepSteps: [
      { type: 'wash', hoursAhead: 0, description: '淘洗' }
    ],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['碳水', '健脾'] },
  { name: '面条', categoryId: 'grainHigh', defaultStorage: 'room', shelfLifeDays: { room: 180 },
    prepSteps: [],
    servingGramsPerPortion: 30, applicableMonth: 8, riskLevel: 'high', nutritionTags: ['碳水', '主食'] },

  // ===== 水果 =====
  { name: '苹果', categoryId: 'fruitLow', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 30, room: 7 },
    prepSteps: [{ type: 'peel', hoursAhead: 0, description: '去皮去核' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['维生素C', '果胶'] },
  { name: '梨', categoryId: 'fruitLow', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 14 },
    prepSteps: [{ type: 'peel', hoursAhead: 0, description: '去皮去核' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['润肺', '维生素C'] },
  { name: '香蕉', categoryId: 'fruitLow', defaultStorage: 'room', shelfLifeDays: { room: 5 },
    prepSteps: [{ type: 'peel', hoursAhead: 0, description: '去皮' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['钾', '碳水'] },
  // 便秘缓解专用食材 (依据中国营养学会 2022 + AAP 西梅金标准)
  { name: '西梅', categoryId: 'fruitLow', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 7, frozen: 90 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗去核' }],
    servingGramsPerPortion: 25, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['山梨醇', '膳食纤维', '便秘友好'] },
  { name: '火龙果', categoryId: 'fruitLow', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 7, room: 3 },
    prepSteps: [{ type: 'peel', hoursAhead: 0, description: '去皮挖肉' }],
    servingGramsPerPortion: 30, applicableMonth: 7, riskLevel: 'low', nutritionTags: ['可溶纤维', '益生元', '便秘友好'] },
  { name: '紫薯', categoryId: 'root', defaultStorage: 'room', shelfLifeDays: { room: 21 },
    prepSteps: [{ type: 'wash', hoursAhead: 0, description: '清洗' }, { type: 'peel', hoursAhead: 0, description: '去皮' }],
    servingGramsPerPortion: 30, applicableMonth: 6, riskLevel: 'low', nutritionTags: ['花青素', '膳食纤维', '便秘友好'] },
  { name: '燕麦', categoryId: 'grainLow', defaultStorage: 'room', shelfLifeDays: { room: 180 },
    prepSteps: [{ type: 'soak', hoursAhead: 0, description: '浸泡 10 分钟软化' }],
    servingGramsPerPortion: 20, applicableMonth: 7, riskLevel: 'low', nutritionTags: ['β-葡聚糖', '高纤维', '便秘友好'] },

  // ===== 豆制品 =====
  { name: '豆腐', categoryId: 'tofu', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 3 },
    prepSteps: [{ type: 'blanch', hoursAhead: 0, description: '焯水去豆腥' }],
    servingGramsPerPortion: 25, applicableMonth: 9, riskLevel: 'high', nutritionTags: ['优质蛋白', '钙'] },

  // ===== 蛋类 =====
  { name: '蛋黄', categoryId: 'egg', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 14 },
    prepSteps: [],
    servingGramsPerPortion: 15, applicableMonth: 8, riskLevel: 'high', nutritionTags: ['优质蛋白', '卵磷脂', '铁'] },

  // ===== 菌菇 =====
  { name: '香菇', categoryId: 'mushroom', defaultStorage: 'refrigerated', shelfLifeDays: { refrigerated: 7 },
    prepSteps: [
      { type: 'soak', hoursAhead: 1, description: '提前1小时温水泡发(干香菇)' },
      { type: 'wash', hoursAhead: 0, description: '清洗去蒂' }
    ],
    servingGramsPerPortion: 15, applicableMonth: 9, riskLevel: 'medium', nutritionTags: ['膳食纤维', '维生素D'] }
]

export function getIngredient(name: string): Ingredient | undefined {
  const builtin = INGREDIENTS.find(i => i.name === name)
  if (builtin) return builtin
  const custom = getCustomFoods().find(f => f.name === name)
  if (custom) {
    return {
      name: custom.name,
      categoryId: custom.categoryId,
      defaultStorage: custom.defaultStorage,
      shelfLifeDays: custom.shelfLifeDays,
      prepSteps: [],
      servingGramsPerPortion: custom.servingGramsPerPortion,
      applicableMonth: 6,
      riskLevel: 'low',
      nutritionTags: ['自定义']
    }
  }
  return undefined
}

export function getAllIngredientNames(): string[] {
  const builtin = INGREDIENTS.map(i => i.name)
  const customs = getCustomFoods().map(f => f.name)
  return [...builtin, ...customs]
}
