import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
const routeScope =
  process.env.FUSHI_ROUTE_SCOPE === 'support-intake' ||
  process.env.FUSHI_ROUTE_SCOPE === 'admin-console'
    ? process.env.FUSHI_ROUTE_SCOPE
    : 'all'

createApp({ routeScope }).listen(port, host, () => {
  process.stdout.write(
    `fushi-api-server listening at http://${host}:${port}\n`
  )
})
