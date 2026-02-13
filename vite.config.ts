import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function waProxyPlugin(): Plugin {
  return {
    name: 'wa-status-proxy',
    configureServer(server) {
      server.middlewares.use('/__wa_proxy/status', async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost')
          const base = url.searchParams.get('base')
          const apiKey = url.searchParams.get('apiKey')

          if (!base || !apiKey) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'base and apiKey are required' }))
            return
          }

          const target = `${base.replace(/\/$/, '')}/api/status`
          const upstream = await fetch(target, {
            headers: { 'X-API-Key': apiKey },
          })

          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Proxy request failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), waProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
})
