import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': process.env.FUSHI_API_PROXY ?? 'http://127.0.0.1:3000',
      '/openapi.json':
        process.env.FUSHI_API_PROXY ?? 'http://127.0.0.1:3000',
    },
  },
})
