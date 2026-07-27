import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/tool-helpers.ts',
        'src/llm/factory.ts',
        'src/llm/mock.ts',
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
