import type { CheckFoodSafetyInput } from '@fushi/contracts'
import { create } from 'zustand'

export type ScenarioId = 'daily' | 'post-vaccine' | 'allergy'

type Scenario = {
  id: ScenarioId
  label: string
  description: string
  foods: string[]
  profile: CheckFoodSafetyInput['profile']
}

const openedCategories = {
  grainLow: {
    state: 'open' as const,
    representative: '高铁米粉',
    passedDate: '2026-06-01',
  },
  leafy: {
    state: 'open' as const,
    representative: '菠菜',
    passedDate: '2026-06-08',
  },
  tofu: {
    state: 'open' as const,
    representative: '豆腐',
    passedDate: '2026-06-15',
  },
  egg: {
    state: 'open' as const,
    representative: '蛋黄',
    passedDate: '2026-06-22',
  },
}

export const scenarios: Scenario[] = [
  {
    id: 'daily',
    label: '日常已确认',
    description: '10 月龄，检查已通过食材与搭配提醒',
    foods: ['菠菜', '豆腐'],
    profile: {
      ageMonths: 10,
      currentStatus: 'normal',
      categoryAllergies: openedCategories,
      individualExceptions: {},
      confirmedFoods: ['高铁米粉', '菠菜', '豆腐', '蛋黄'],
    },
  },
  {
    id: 'post-vaccine',
    label: '疫苗后保护',
    description: '只允许档案中已确认稳定的食材',
    foods: ['菠菜', '鸡蛋'],
    profile: {
      ageMonths: 10,
      currentStatus: 'postVaccine',
      statusSince: '2026-07-26',
      categoryAllergies: openedCategories,
      individualExceptions: {},
      confirmedFoods: ['高铁米粉', '菠菜', '豆腐', '蛋黄'],
    },
  },
  {
    id: 'allergy',
    label: '个体过敏拦截',
    description: '个体例外优先于通用品类开放状态',
    foods: ['蛋黄', '高铁米粉'],
    profile: {
      ageMonths: 10,
      currentStatus: 'normal',
      categoryAllergies: openedCategories,
      individualExceptions: {
        蛋黄: {
          state: 'allergic',
          note: '演示档案：历史反应已确认',
          enteredAt: '2026-07-12',
        },
      },
      confirmedFoods: ['高铁米粉', '菠菜', '豆腐'],
    },
  },
]

type SafetyLabState = {
  scenarioId: ScenarioId
  foodsText: string
  selectScenario: (id: ScenarioId) => void
  setFoodsText: (value: string) => void
  reset: () => void
}

const initialScenario = scenarios[0]

export const useSafetyLabStore = create<SafetyLabState>((set) => ({
  scenarioId: initialScenario.id,
  foodsText: initialScenario.foods.join('、'),
  selectScenario: (id) => {
    const scenario = scenarios.find((item) => item.id === id) ?? initialScenario
    set({ scenarioId: scenario.id, foodsText: scenario.foods.join('、') })
  },
  setFoodsText: (foodsText) => set({ foodsText }),
  reset: () =>
    set({
      scenarioId: initialScenario.id,
      foodsText: initialScenario.foods.join('、'),
    }),
}))

export function parseFoods(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[、,，\s]+/)
        .map((food) => food.trim())
        .filter(Boolean)
    ),
  ].slice(0, 10)
}

export function getScenario(id: ScenarioId): Scenario {
  return scenarios.find((scenario) => scenario.id === id) ?? initialScenario
}
