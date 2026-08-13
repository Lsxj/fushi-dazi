import { describe, expect, it } from 'vitest'

import { getScenario, parseFoods, scenarios } from './safety-lab'

describe('safety lab state helpers', () => {
  it('normalizes, deduplicates, and limits food input', () => {
    const foods = parseFoods(
      'Spinach, Spinach, Tofu, Egg, Oats, Apple, Pear, Pumpkin, Broccoli, Cod, Shrimp, Milk'
    )

    expect(foods).toHaveLength(10)
    expect(foods.slice(0, 3)).toEqual(['菠菜', '豆腐', '鸡蛋'])
  })

  it('falls back to the default scenario for an unknown persisted id', () => {
    expect(getScenario('missing' as never)).toBe(scenarios[0])
  })
})
