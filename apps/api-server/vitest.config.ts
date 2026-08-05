import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/app.ts',
        'src/evaluation.ts',
        'src/collaboration.ts',
        'src/collaboration-store.ts',
        'src/observability.ts',
        'src/releases.ts',
        'src/release-store.ts',
        'src/support.ts',
        'src/support-store.ts',
        'src/openapi.ts',
        'src/router.ts',
        '../../utils/menuPreview.ts',
        '../../utils/agentRouting.ts',
        '../../utils/agentEvaluation.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
})
