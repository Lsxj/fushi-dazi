import { apiContract } from '@fushi/contracts'
import { implement } from '@orpc/server'

import { checkFoodsSafety } from '../../../utils/safety.js'

const os = implement(apiContract)

const checkFoodSafety = os.safety.check.handler(({ input }) => {
  const result = checkFoodsSafety(input.foods, input.profile)

  return {
    ...result,
    decisionSource: 'deterministic-rules' as const,
    profileSnapshot: {
      ageMonths: input.profile.ageMonths,
      currentStatus: input.profile.currentStatus,
    },
  }
})

export const router = os.router({
  safety: {
    check: checkFoodSafety,
  },
})
