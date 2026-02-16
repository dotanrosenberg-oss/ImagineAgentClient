import { defineConfig } from 'vite'
import type { Plugin, Connect } from 'vite'
import react from '@vitejs/plugin-react'

function waProxyPlugin(): Plugin {
  return {
    name: 'wa-api-proxy',
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage, res: any, next: Connect.NextFunction) => {
        if (!req.url?.startsWith('/__wa_proxy/')) {
          next()
          return
        }

        const parsed = new URL(req.url, 'http://localhost')
        const base = parsed.searchParams.get('base')
        const apiKey = parsed.searchParams.get('apiKey')
        const endpoint = req.url.replace('/__wa_proxy/', '').split('?')[0]

        if (!base || !apiKey) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'base and apiKey are required' }))
          return
        }

        const forwardParams = new URLSearchParams()
        parsed.searchParams.forEach((value, key) => {
          if (key !== 'base' && key !== 'apiKey') {
            forwardParams.append(key, value)
          }
        })
        const qs = forwardParams.toString()
        const target = `${base.replace(/\/$/, '')}/${endpoint}${qs ? `?${qs}` : ''}`

        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', async () => {
          try {
            const headers: Record<string, string> = {
              'X-API-Key': apiKey,
            }
            if (body) {
              headers['Content-Type'] = 'application/json'
            }

            const upstream = await fetch(target, {
              method: req.method || 'GET',
              headers,
              ...(body ? { body } : {}),
            })

            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
            res.end(text)
          } catch {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Proxy request failed' }))
          }
        })
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
