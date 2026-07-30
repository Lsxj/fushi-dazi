import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { useSafetyLabStore } from '../store/safety-lab'
import { resetCollaborationMockState, server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  server.resetHandlers()
  resetCollaborationMockState()
  useSafetyLabStore.getState().reset()
})

afterAll(() => server.close())
