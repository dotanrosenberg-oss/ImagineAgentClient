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

        const base = req.headers['x-proxy-base'] as string | undefined
        const apiKey = req.headers['x-proxy-apikey'] as string | undefined
        const endpoint = req.url.replace('/__wa_proxy/', '')

        if (!base || !apiKey) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'x-proxy-base and x-proxy-apikey headers are required' }))
          return
        }

        const target = `${base.replace(/\/$/, '')}/${endpoint}`

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
