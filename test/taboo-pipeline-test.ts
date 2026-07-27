// 禁忌+排敏链路测试 — 验证 isRecipeApplicable 在三种模式下的行为
// 跑法: cd /Users/x7/fushi-ditu && npx tsx test/taboo-pipeline-test.ts

const storage: Record<string, any> = {}
;(globalThis as any).wx = {
  getStorageSync: (key: string) => storage[key],
  setStorageSync: (key: string, value: any) => { storage[key] = value },
  removeStorageSync: (key: string) => { delete storage[key] }
}

import { CATEGORIES } from '../data/categories'
import { RECIPES, Recipe } from '../data/recipes'
import {
  isRecipeApplicable,
  findIntroducingBases,
  getRecipeTabooWarnings,
  getFirstTryMethod,
  suggestTrialSlot,
  BabyProfile,
  DailyPlan
} from '../utils/planner'
import { checkTaboo, findTaboosAgainst, TABOOS } from '../data/taboos'

function buildProfile(ageMonths: number, openFoods: string[], confirmed: string[] = []): BabyProfile {
  const today = new Date().toISOString().slice(0, 10)
  const profile: BabyProfile = {
    babyName: '测试宝宝',
    birthday: today,
    ageMonths,
    mealsPerDay: 3,
    currentStatus: 'normal',
    categoryAllergies: {},
    individualExceptions: {},
    confirmedFoods: confirmed
  }
  for (const cat of CATEGORIES) {
    if (cat.noAllergyTracking) {
      profile.categoryAllergies[cat.id] = { state: 'open', passedDate: today }
    } else {
      profile.categoryAllergies[cat.id] = { state: 'untried' }
    }
  }
  for (const food of openFoods) {
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

function findRecipeWith(...ingredients: string[]): Recipe | undefined {
  return RECIPES.find(r => ingredients.every(ing => r.ingredients.some(i => i.name === ing)))
}

function header(label: string) {
  console.log('\n' + '='.repeat(70))
  console.log(`🧪 ${label}`)
  console.log('='.repeat(70))
}

function assert(cond: boolean, msg: string) {
  const tag = cond ? '✅' : '❌'
  console.log(`${tag} ${msg}`)
  if (!cond) (globalThis as any).__failed = true
}

// ───────────────────────────────────────────────────────────
// CASE 0: 禁忌表自身完整性
// ───────────────────────────────────────────────────────────
header('CASE 0: 禁忌表完整性')
console.log(`共 ${TABOOS.length} 条; hard=${TABOOS.filter(t => t.level === 'hard').length}, soft=${TABOOS.filter(t => t.level === 'soft').length}`)
const noMitigation = TABOOS.filter(t => t.level === 'soft' && !t.mitigation)
assert(noMitigation.length === 0,
  `所有 soft 都有 mitigation (无 mitigation 的 soft 会一票否决,要么补 mitigation 要么升 hard)`)
console.log(`  无 mitigation 的 soft: ${noMitigation.map(t => t.foods.join('+')).join('、') || '无'}`)

// ───────────────────────────────────────────────────────────
// CASE 1: 日常模式 — soft 禁忌不阻断
// ───────────────────────────────────────────────────────────
header('CASE 1: 日常模式 - 菠菜+豆腐 是 soft, 应放行')
const spinachTofu = findRecipeWith('菠菜', '豆腐')
if (!spinachTofu) {
  console.log('⚠️  食谱库里没找到菠菜+豆腐的菜,跳过. 改用合成测试.')
  const synth: Recipe = {
    id: 'synth-1', name: '菠菜豆腐羹合成',
    applicableMonthRange: [8, 24], mealType: ['lunch'],
    ingredients: [{ name: '菠菜', portions: 1 }, { name: '豆腐', portions: 1 }],
    steps: [], nutritionTags: [], unsuitableStatus: [], coveredCategories: []
  } as any
  const profile = buildProfile(10, ['菠菜', '豆腐'])
  const r = isRecipeApplicable(synth, profile)
  assert(r.applicable, `日常下含菠菜+豆腐应放行,实际: ${r.applicable} (reason=${r.reason})`)
} else {
  const profile = buildProfile(12, ['菠菜', '豆腐'])
  const r = isRecipeApplicable(spinachTofu, profile)
  assert(r.applicable, `日常下「${spinachTofu.name}」应放行,实际: applicable=${r.applicable} reason=${r.reason}`)
}

// ───────────────────────────────────────────────────────────
// CASE 2: 排敏模式 — soft 有 mitigation → 放行 + warning
// ───────────────────────────────────────────────────────────
header('CASE 2: 排敏模式 - introducing=虾 + 食谱含菠菜, 应放行带 warning')
const synthShrimpSpinach: Recipe = {
  id: 'synth-2', name: '菠菜虾仁粥合成',
  applicableMonthRange: [9, 24], mealType: ['lunch'],
  ingredients: [
    { name: '大米', portions: 1 },
    { name: '菠菜', portions: 1 },
    { name: '虾', portions: 1 }
  ],
  steps: [], nutritionTags: [], unsuitableStatus: [], coveredCategories: []
} as any
const profile2 = buildProfile(10, ['大米', '菠菜'])
const r2 = isRecipeApplicable(synthShrimpSpinach, profile2, { introducing: '虾' })
assert(r2.applicable, `排敏虾+食谱含菠菜应放行 (soft+mitigation), 实际: applicable=${r2.applicable} reason=${r2.reason}`)
assert((r2.warnings?.length ?? 0) > 0, `应返回 warnings (菠菜先焯水), 实际 warnings 数: ${r2.warnings?.length ?? 0}`)
if (r2.warnings) {
  r2.warnings.forEach(w => console.log(`    💡 ${w.foods.join('+')}: ${w.reason} → ${w.mitigation}`))
}

// ───────────────────────────────────────────────────────────
// CASE 3: 排敏 vs 日常对照 — 同一道菜
// ───────────────────────────────────────────────────────────
header('CASE 3: 同一道菜, 日常 vs 排敏 应该都放行(因为是 soft+mitigation)')
const profile3 = buildProfile(10, ['大米', '菠菜', '虾'])
const r3a = isRecipeApplicable(synthShrimpSpinach, profile3)
const r3b = isRecipeApplicable(synthShrimpSpinach, profile3, { introducing: '虾' })
assert(r3a.applicable, `日常应放行,实际: ${r3a.applicable} (${r3a.reason})`)
assert(r3b.applicable, `排敏应放行,实际: ${r3b.applicable} (${r3b.reason})`)
assert((r3a.warnings?.length ?? 0) === 0, `日常不返回 warnings`)
assert((r3b.warnings?.length ?? 0) > 0, `排敏返回 warnings`)

// ───────────────────────────────────────────────────────────
// CASE 4: findIntroducingBases — 给"虾"找排敏基底
// ───────────────────────────────────────────────────────────
header('CASE 4: findIntroducingBases - 9月龄给"虾"找基底')
const profile4 = buildProfile(9, ['大米', '南瓜', '胡萝卜', '小米', '面条', '猪肉'])
const bases = findIntroducingBases('虾', profile4, 5)
console.log(`找到 ${bases.length} 个合格基底:`)
bases.forEach(r => {
  const others = r.ingredients.map(i => i.name).filter(n => n !== '虾')
  console.log(`    - ${r.name} (${others.join('+')})`)
})
assert(bases.length > 0, `应至少找到 1 个合格基底 (其他食材都已 confirmed,且无 hard 禁忌)`)

// ───────────────────────────────────────────────────────────
// CASE 5: 排敏 hard 阻断(蜂蜜本应走月龄硬禁, 这里造一个虚构的 hard 验路径)
// ───────────────────────────────────────────────────────────
header('CASE 5: hard 禁忌路径')
console.log('当前禁忌表里没有 hard 级别（蜂蜜等走 ingredient.applicableMonth）')
console.log(`hard 数: ${TABOOS.filter(t => t.level === 'hard').length}`)
assert(TABOOS.filter(t => t.level === 'hard').length === 0,
  `当前预期 hard=0 (月龄硬禁不在这张表), 这只是状态确认不是 bug`)

// ───────────────────────────────────────────────────────────
// CASE 6: getRecipeTabooWarnings — 单查警告
// ───────────────────────────────────────────────────────────
header('CASE 6: getRecipeTabooWarnings')
const w6 = getRecipeTabooWarnings(synthShrimpSpinach, '虾')
console.log(`排敏「虾」时「${synthShrimpSpinach.name}」的提示:`)
w6.forEach(w => console.log(`    💡 ${w.foods.join('+')}: ${w.mitigation}`))
assert(w6.length > 0, `应至少返回 1 条 mitigation 提示`)

const w6daily = getRecipeTabooWarnings(synthShrimpSpinach)
console.log(`日常视角同一道菜的提示数: ${w6daily.length}`)
assert(w6daily.length > 0, `日常视角也应返回(菠菜+虾, 菠菜+豆腐都是 mitigatable)`)

// ───────────────────────────────────────────────────────────
// CASE 7: checkTaboo 双向查
// ───────────────────────────────────────────────────────────
header('CASE 7: checkTaboo 双向对称')
const ab = checkTaboo('菠菜', '豆腐')
const ba = checkTaboo('豆腐', '菠菜')
assert(!!ab && !!ba && ab.reason === ba.reason, `菠菜<->豆腐 双向查应一致`)

const none = checkTaboo('胡萝卜', '南瓜')
assert(!none, `胡萝卜+南瓜 不应出现在禁忌表`)

// ───────────────────────────────────────────────────────────
// CASE 8: getFirstTryMethod 按 mainCategory 推工艺
// ───────────────────────────────────────────────────────────
header('CASE 8: getFirstTryMethod')
const cases: [string, string][] = [
  ['虾', '蛋白质'],
  ['菠菜', '蔬菜'],
  ['大米', '主食'],
  ['蛋黄', '蛋'],
  ['苹果', '水果'],
]
for (const [food, kind] of cases) {
  const m = getFirstTryMethod(food)
  console.log(`    ${food}(${kind}) → ${m}`)
  assert(m.length > 0 && !m.includes('undefined'), `${food} 工艺非空`)
}

// ───────────────────────────────────────────────────────────
// CASE 9: suggestTrialSlot — 真实计划场景
// ───────────────────────────────────────────────────────────
header('CASE 9: suggestTrialSlot - 凑不出含目标食材的菜时, 找加料 slot')
const today = '2026-05-12'
const profile9 = buildProfile(10, ['大米', '南瓜', '小米', '面条', '猪肉', '胡萝卜'])
const fakePlan: DailyPlan[] = [
  {
    date: today,
    meals: [
      { mealIndex: 0, recipe: { id: 'r1', name: '南瓜小米粥', ingredients: [{ name: '南瓜', portions: 1 }, { name: '小米', portions: 1 }] } as any },
      { mealIndex: 1, recipe: { id: 'r2', name: '猪肉胡萝卜面', ingredients: [{ name: '猪肉', portions: 1 }, { name: '胡萝卜', portions: 1 }, { name: '面条', portions: 1 }] } as any },
      { mealIndex: 2, recipe: { id: 'r3', name: '大米粥', ingredients: [{ name: '大米', portions: 1 }] } as any },
    ]
  } as any
]
// 已喂了第 0 餐 → 应该跳过, 返回第 1 餐
const loggedKeys = new Set([`${today}-0`])
const slot = suggestTrialSlot(profile9, '虾', fakePlan, today, loggedKeys)
assert(slot !== null, `应找到 slot, 实际: ${slot ? '有' : 'null'}`)
if (slot) {
  console.log(`    建议: ${slot.date} 第 ${slot.mealIdx + 1} 餐「${slot.recipeName}」加 1 勺虾`)
  console.log(`    工艺: ${getFirstTryMethod('虾')}`)
  if (slot.warnings.length > 0) {
    slot.warnings.forEach(w => console.log(`    💡 ${w.foods.join('+')}: ${w.mitigation}`))
  }
  assert(slot.mealIdx === 1, `应跳过已喂的第 0 餐, 返回第 1 餐, 实际 mealIdx=${slot.mealIdx}`)
}

// 所有餐都喂完 → 返回 null
const allLogged = new Set([`${today}-0`, `${today}-1`, `${today}-2`])
const slotNone = suggestTrialSlot(profile9, '虾', fakePlan, today, allLogged)
assert(slotNone === null, `全喂完时应返回 null`)

// ───────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70))
if ((globalThis as any).__failed) {
  console.log('❌ 有用例未通过')
  process.exit(1)
} else {
  console.log('✅ 全部用例通过')
}
console.log('='.repeat(70))
