import type {
  CheckFoodSafetyInput,
  CheckFoodSafetyOutput,
} from '@fushi/contracts'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

function responseFor(input: CheckFoodSafetyInput): CheckFoodSafetyOutput {
  const allergicFoods = input.foods.filter(
    (food) => input.profile.individualExceptions[food]?.state === 'allergic'
  )
  const unconfirmedAfterVaccine = input.foods.filter(
    (food) =>
      input.profile.currentStatus === 'postVaccine' &&
      !input.profile.confirmedFoods?.includes(food)
  )
  const blocked = new Set([...allergicFoods, ...unconfirmedAfterVaccine])
  const hasSpinachTofu =
    input.foods.includes('菠菜') && input.foods.includes('豆腐')

  return {
    safe: blocked.size === 0,
    decisionSource: 'deterministic-rules',
    profileSnapshot: {
      ageMonths: input.profile.ageMonths,
      currentStatus: input.profile.currentStatus,
    },
    results: input.foods.map((food) => ({
      food,
      safe: !blocked.has(food),
      ...(blocked.has(food)
        ? {
            reason: allergicFoods.includes(food)
              ? `${food}已标记过敏`
              : `疫苗期间只用确认稳定的食物,${food}不在清单内`,
          }
        : { categoryId: food === '豆腐' ? 'tofu' : 'leafy' }),
    })),
    tabooWarnings: hasSpinachTofu
      ? [
          {
            foods: ['菠菜', '豆腐'],
            level: 'soft',
            reason: '草酸与钙结合形成草酸钙,降低钙吸收',
            mitigation: '菠菜先焯水 30 秒去草酸',
            source: 'NutritionConsensus',
          },
        ]
      : [],
    tabooBlocks: [],
  }
}

export const successHandler = http.post(
  '*/api/v1/safety/check',
  async ({ request }) => {
    const input = (await request.json()) as CheckFoodSafetyInput
    return HttpResponse.json(responseFor(input))
  }
)

export const server = setupServer(successHandler)
