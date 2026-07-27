import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'

import { router } from './router.js'

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

let specPromise: ReturnType<typeof generator.generate> | undefined

export function getOpenAPISpec() {
  specPromise ??= generator.generate(router, {
    info: {
      title: '辅食搭子 Safety API',
      version: '0.1.0',
      description:
        'Contract-first API backed only by deterministic food-safety rules.',
    },
  })
  return specPromise
}
