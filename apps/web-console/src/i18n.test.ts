import { describe, expect, it } from 'vitest'

import { displayFood, displayText, foodInputToRuleValue } from './i18n'

describe('console display translations', () => {
  it('translates known food names in both directions', () => {
    expect(displayFood('鳕鱼')).toBe('Cod')
    expect(foodInputToRuleValue(' cod ')).toBe('鳕鱼')
  })

  it('preserves unknown contract values instead of inventing a translation', () => {
    expect(displayFood('dragon fruit')).toBe('dragon fruit')
    expect(foodInputToRuleValue(' dragon fruit ')).toBe('dragon fruit')
    expect(displayText('provider-specific-value')).toBe('provider-specific-value')
  })

  it('translates rule explanations and embedded food names', () => {
    expect(displayText('鳕鱼已标记过敏')).toBe('Cod is marked as an allergy')
  })
})
