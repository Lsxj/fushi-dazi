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
        'src/governance.ts',
        'src/observability.ts',
        'src/openapi.ts',
        'src/router.ts',
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
