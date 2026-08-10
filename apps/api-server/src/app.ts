import { OpenAPIHandler } from '@orpc/openapi/node'
import express from 'express'

import { getOpenAPISpec } from './openapi.js'
import { router } from './router.js'

export interface AppOptions {
  routeScope?: 'all' | 'support-intake' | 'admin-console'
  allowedOrigins?: readonly string[]
}

const SUPPORT_INTAKE_ROUTES = new Set([
  '/api/v1/support/cases',
  '/api/v1/support/cases/track',
])

const ADMIN_CONSOLE_ROUTES = new Set([
  'GET /api/v1/auth/session',
  'GET /api/v1/support/cases',
  'POST /api/v1/support/cases/update',
  'GET /api/v1/observability/traces',
])

export function createApp(options: AppOptions = {}) {
  const app = express()
  const handler = new OpenAPIHandler(router)
  const allowedOrigins = new Set(
    options.allowedOrigins ??
      (process.env.FUSHI_ADMIN_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
  )

  app.use((request, response, next) => {
    const origin = request.headers.origin
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.setHeader('Vary', 'Origin')
    }
    if (request.method === 'OPTIONS') {
      response.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403)
      return
    }
    next()
  })

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'fushi-api-server',
      decisionSource: 'deterministic-rules',
    })
  })

  if (options.routeScope === 'support-intake') {
    app.use((request, response, next) => {
      if (request.method === 'POST' && SUPPORT_INTAKE_ROUTES.has(request.path)) {
        next()
        return
      }
      response.status(404).json({ error: 'not_found' })
    })
  }

  if (options.routeScope === 'admin-console') {
    app.use((request, response, next) => {
      if (ADMIN_CONSOLE_ROUTES.has(`${request.method} ${request.path}`)) {
        next()
        return
      }
      response.status(404).json({ error: 'not_found' })
    })
  }

  app.get('/openapi.json', async (_request, response) => {
    response.json(await getOpenAPISpec())
  })

  app.use('/api{/*path}', async (request, response, next) => {
    const { matched } = await handler.handle(request, response, {
      prefix: '/api',
      context: {
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
        setCookie: (cookie: string) => response.setHeader('Set-Cookie', cookie),
      },
    })

    if (!matched) next()
  })

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found' })
  })

  return app
}
