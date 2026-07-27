// 全月龄链路测试 - 不依赖 wx,用 mock storage
const storage: Record<string, any> = {}
;(globalThis as any).wx = {
  getStorageSync: (key: string) => storage[key],
  setStorageSync: (key: string, value: any) => { storage[key] = value },
  removeStorageSync: (key: string) => { delete storage[key] }
}

import { CATEGORIES } from '../data/categories'
import { RECIPES } from '../data/recipes'
import {
  generateWeeklyPlan,
  getApplicableRecipes,
  getNextRecommendation,
  diagnoseEmptyPlan,
  isFoodSafeForBaby,
  isRecipeApplicable,
  BabyProfile
} from '../utils/planner'

interface TestCase {
  ageMonths: number
  label: string
  initialOpen: string[]
  mealsPerDay: number
}

function buildProfile(testCase: TestCase): BabyProfile {
  const today = new Date().toISOString().slice(0, 10)
  const profile: BabyProfile = {
    babyName: '测试',
    birthday: today,
    ageMonths: testCase.ageMonths,
    mealsPerDay: testCase.mealsPerDay,
    currentStatus: 'normal',
    categoryAllergies: {},
    individualExceptions: {}
  }
  for (const cat of CATEGORIES) {
    if (cat.noAllergyTracking) {
      profile.categoryAllergies[cat.id] = { state: 'open', passedDate: today }
    } else {
      profile.categoryAllergies[cat.id] = { state: 'untried' }
    }
  }
  for (const food of testCase.initialOpen) {
    const cat = CATEGORIES.find(c => c.members.includes(food))
    if (cat) {
      profile.categoryAllergies[cat.id] = {
        state: 'open',
        representative: food,
        passedDate: today
      }
    }
  }
  return profile
}

function pad(s: string, w: number): string {
  let len = 0
  for (const ch of s) len += /[一-龥]/.test(ch) ? 2 : 1
  return s + ' '.repeat(Math.max(0, w - len))
}

function runTest(testCase: TestCase) {
  console.log('\n' + '='.repeat(70))
  console.log(`📊 ${testCase.ageMonths}月龄 - ${testCase.label}`)
  console.log(`   每日餐次: ${testCase.mealsPerDay}, 已开放: ${testCase.initialOpen.join('、') || '无'}`)
  console.log('='.repeat(70))

  const profile = buildProfile(testCase)
  storage['babyProfile'] = profile

  // 1. 适用食谱
  const applicable = getApplicableRecipes(profile)
  console.log(`\n[1] 适用食谱总数: ${applicable.length} / ${RECIPES.length}`)
  if (applicable.length > 0 && applicable.length <= 8) {
    applicable.forEach(r => console.log(`    - ${r.name} (${r.applicableMonthRange[0]}-${r.applicableMonthRange[1]}月)`))
  } else if (applicable.length > 8) {
    console.log(`    前 5 个: ${applicable.slice(0, 5).map(r => r.name).join('、')}`)
    console.log(`    类型分布: 米糊${applicable.filter(r => r.id.startsWith('rc')).length} | 早期泥${applicable.filter(r => r.id.startsWith('e')).length} | 粥/面${applicable.filter(r => r.id.startsWith('r')).length} | 颗粒${applicable.filter(r => r.id.startsWith('b')).length}`)
  }

  // 2. 下一步推荐
  const recs = getNextRecommendation(profile)
  console.log(`\n[2] 下一步推荐(${recs.length} 个):`)
  recs.slice(0, 3).forEach(r => console.log(`    - ${r.category} → ${r.suggestedFoods.slice(0, 3).join('/')}`))

  // 3. 计划生成
  const plan = generateWeeklyPlan(profile, 3)
  console.log(`\n[3] 生成 3 天计划: ${plan.length > 0 ? '成功' : '失败'}`)
  if (plan.length > 0) {
    plan.forEach((d, i) => {
      const meals = d.meals.map(m => m.recipe.name).join(' | ')
      console.log(`    第${i + 1}天: ${meals || '无'}`)
    })
  }

  // 4. 空状态诊断
  if (applicable.length === 0 || plan.every(d => d.meals.length === 0)) {
    const diag = diagnoseEmptyPlan(profile)
    console.log(`\n[4] ⚠️ 空状态诊断:`)
    console.log(`    原因: ${diag.reason}`)
    console.log(`    建议: ${diag.action}`)
  }
}

const testCases: TestCase[] = [
  {
    ageMonths: 4, label: '刚开始辅食(只奶为主)', mealsPerDay: 1,
    initialOpen: []
  },
  {
    ageMonths: 5, label: '4-5月,引入第一口高铁米粉', mealsPerDay: 1,
    initialOpen: ['高铁米粉']
  },
  {
    ageMonths: 6, label: '6月龄,刚加几个根茎和绿叶', mealsPerDay: 2,
    initialOpen: ['高铁米粉', '山药', '南瓜', '苹果']
  },
  {
    ageMonths: 7, label: '7月龄,蔬菜水果基础齐全', mealsPerDay: 2,
    initialOpen: ['高铁米粉', '大米', '山药', '南瓜', '西兰花', '菠菜', '苹果', '梨']
  },
  {
    ageMonths: 9, label: '9月龄,典型中期(蛋白来了)', mealsPerDay: 2,
    initialOpen: ['高铁米粉', '大米', '小麦(面条)', '山药', '土豆', '南瓜', '西兰花', '菠菜', '苹果', '梨', '猪肉', '牛肉', '鸡胸肉', '鳕鱼', '蛋黄']
  },
  {
    ageMonths: 12, label: '12月龄,过渡到颗粒/块状', mealsPerDay: 3,
    initialOpen: ['高铁米粉', '大米', '小麦(面条)', '山药', '土豆', '南瓜', '西兰花', '菠菜', '番茄', '苹果', '香蕉', '猪肉', '牛肉', '鸡胸肉', '鳕鱼', '虾', '蛋黄', '豆腐']
  },
  {
    ageMonths: 18, label: '18月龄,接近常规饮食', mealsPerDay: 3,
    initialOpen: ['大米', '小麦(面条)', '山药', '土豆', '南瓜', '西兰花', '菠菜', '番茄', '苹果', '香蕉', '猪肉', '牛肉', '鸡胸肉', '鳕鱼', '虾', '蛋黄', '豆腐', '香菇']
  },
  {
    ageMonths: 24, label: '24月龄,接近成人(磨碎)', mealsPerDay: 3,
    initialOpen: ['大米', '小麦(面条)', '山药', '土豆', '南瓜', '西兰花', '菠菜', '番茄', '苹果', '香蕉', '猪肉', '牛肉', '鸡胸肉', '鳕鱼', '虾', '蛋黄', '豆腐', '香菇', '芒果', '草莓']
  }
]

console.log('\n🧪 辅食搭子 - 全月龄链路测试')
console.log(`总食谱库: ${RECIPES.length} 个`)
console.log(`总品类: ${CATEGORIES.length} 个(其中 ${CATEGORIES.filter(c => c.noAllergyTracking).length} 个免排敏)`)

testCases.forEach(runTest)

console.log('\n' + '='.repeat(70))
console.log('✅ 测试完成')
console.log('='.repeat(70))
