import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { useSafetyLabStore } from '../store/safety-lab'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  useSafetyLabStore.getState().reset()
})

afterAll(() => server.close())
