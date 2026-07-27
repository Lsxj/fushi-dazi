import { Recipe, RECIPES } from '../data/recipes'
import { consumePortion, restorePortion } from './storage'
import { logMeal, unlogMeal, MealLog, Portion, getJournal } from './journal'

export interface CheckinResult {
  log: MealLog
  consumed: { name: string; portions: number }[]
}

// 实际记录的 override 项: 用户改了菜/食材/份量/时间, 全部可选
export interface CheckinOverride {
  customDishName?: string
  actualIngredients?: string[]   // 用户实际吃的食材列表
  portion?: Portion
  note?: string
  eatenAt?: string  // 用户调过的用餐时间 (ISO); 不传则只记 loggedAt
}

// 按计划记录: 直接走 plan recipe (库存按 plan 扣)
// 实际改了的: 优先扣实际食材的库存 (一份), 计入 isCustom
export function checkinMeal(
  date: string,
  mealIndex: number,
  recipe: Recipe,
  override?: CheckinOverride
): CheckinResult {
  const consumed: { name: string; portions: number }[] = []
  const hasOverride = !!(override && (
    override.customDishName ||
    (override.actualIngredients && override.actualIngredients.length > 0) ||
    override.portion ||
    override.note
  ))
  const isCustom = !!(override && (
    override.customDishName ||
    (override.actualIngredients && override.actualIngredients.length > 0)
  ))

  if (isCustom && override?.actualIngredients) {
    // 实际记录: 按实际食材扣 1 份(粗粒度, 后续可按 portion 精细化)
    for (const name of override.actualIngredients) {
      consumePortion(name, 1)
      consumed.push({ name, portions: 1 })
    }
  } else {
    // 按计划扣
    for (const ing of recipe.ingredients) {
      consumePortion(ing.name, ing.portions)
      consumed.push({ name: ing.name, portions: ing.portions })
    }
  }

  const log: MealLog = {
    date,
    mealIndex,
    recipeId: recipe.id,
    recipeName: recipe.name,
    ingredients: isCustom && override?.actualIngredients
      ? override.actualIngredients
      : recipe.ingredients.map(i => i.name),
    loggedAt: new Date().toISOString(),
    ...(override?.eatenAt ? { eatenAt: override.eatenAt } : {}),
    ...(override?.customDishName ? { customDishName: override.customDishName } : {}),
    ...(override?.portion ? { portion: override.portion } : {}),
    ...(override?.note ? { note: override.note } : {}),
    ...(isCustom ? { isCustom: true } : {})
  }
  logMeal(log)

  return { log, consumed }
}

export function uncheckinMeal(date: string, mealIndex: number) {
  // 还原库存: 与 checkinMeal 配对
  // isCustom log: 按 log.ingredients 每个还 1 份 (与 checkin 时的 actualIngredients 对称)
  // 非 custom: 按 recipe.ingredients 的 portions 精确还原; recipe 找不到时退回每食材 1 份
  const log = getJournal().find(l => l.date === date && l.mealIndex === mealIndex)
  if (log) {
    if (log.isCustom) {
      for (const name of (log.ingredients || [])) {
        if (name) restorePortion(name, 1)
      }
    } else {
      const recipe = RECIPES.find(r => r.id === log.recipeId)
      if (recipe) {
        for (const ing of recipe.ingredients) {
          restorePortion(ing.name, ing.portions)
        }
      } else {
        for (const name of (log.ingredients || [])) {
          if (name) restorePortion(name, 1)
        }
      }
    }
  }
  unlogMeal(date, mealIndex)
}
