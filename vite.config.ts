import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function waProxyPlugin(): Plugin {
  return {
    name: 'wa-proxy',
    configureServer(server) {
      server.middlewares.use('/__wa_proxy/messages', async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost')
          const base = url.searchParams.get('base')
          const apiKey = url.searchParams.get('apiKey')
          const filter = url.searchParams.get('filter') || 'unread'

          if (!base || !apiKey) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'base and apiKey are required' }))
            return
          }

          const target = `${base.replace(/\/$/, '')}/api/messages?filter=${encodeURIComponent(filter)}&unread=${filter === 'unread' ? 'true' : 'false'}`
          const upstream = await fetch(target, {
            headers: { 'X-API-Key': apiKey },
          })

          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Proxy request failed' }))
        }
      })

      server.middlewares.use('/__wa_proxy/groups', async (req, res) => {
        try {
          const chunks: Buffer[] = []
          req.on('data', (chunk) => chunks.push(chunk))
          await new Promise<void>((resolve) => req.on('end', () => resolve()))

          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
            base?: string
            apiKey?: string
            payload?: unknown
          }

          if (!parsed.base || !parsed.apiKey || !parsed.payload) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'base, apiKey and payload are required' }))
            return
          }

          const target = `${parsed.base.replace(/\/$/, '')}/api/groups/create`
          const upstream = await fetch(target, {
            method: 'POST',
            headers: {
              'X-API-Key': parsed.apiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(parsed.payload),
          })

          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch {
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
})
