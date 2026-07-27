import { OpenAPIHandler } from '@orpc/openapi/node'
import express from 'express'

import { getOpenAPISpec } from './openapi.js'
import { router } from './router.js'

export function createApp() {
  const app = express()
  const handler = new OpenAPIHandler(router)

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'fushi-api-server',
      decisionSource: 'deterministic-rules',
    })
  })

  app.get('/openapi.json', async (_request, response) => {
    response.json(await getOpenAPISpec())
  })

  app.use('/api{/*path}', async (request, response, next) => {
    const { matched } = await handler.handle(request, response, {
      prefix: '/api',
      context: {},
    })

    if (!matched) next()
  })

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' })
  })

  return app
}
