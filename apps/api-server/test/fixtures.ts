import type { CheckFoodSafetyInput } from '@fushi/contracts'

export const baseInput: CheckFoodSafetyInput = {
  foods: ['鳕鱼'],
  profile: {
    ageMonths: 10,
    currentStatus: 'normal',
    statusSince: '2026-04-01',
    categoryAllergies: {
      fish: {
        state: 'open',
        representative: '鳕鱼',
        passedDate: '2026-02-01',
      },
      shrimp: {
        state: 'locked',
      },
      leafy: {
        state: 'open',
        representative: '菠菜',
        passedDate: '2025-12-15',
      },
      tofu: {
        state: 'open',
        representative: '豆腐',
        passedDate: '2026-01-15',
      },
    },
    individualExceptions: {},
    confirmedFoods: ['鳕鱼', '菠菜', '豆腐'],
  },
}
