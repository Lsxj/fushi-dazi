import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)

createApp().listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `fushi-api-server listening at http://127.0.0.1:${port}\n`
  )
})
