import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getServerConfig() {
  let serverUrl = (process.env.WA_SERVER_URL || '').trim()
  let apiKey = (process.env.WA_API_KEY || '').trim()

  if (apiKey.startsWith('http') && !serverUrl.startsWith('http')) {
    const tmp = serverUrl
    serverUrl = apiKey
    apiKey = tmp
  }

  return {
    serverUrl: serverUrl.replace(/\/$/, ''),
    apiKey,
  }
}

export default defineConfig(() => {
  const { serverUrl, apiKey } = getServerConfig()

  const proxyConfig = serverUrl ? {
    '/api': {
      target: serverUrl,
      changeOrigin: true,
      configure: (proxy: any) => {
        proxy.on('proxyReq', (proxyReq: any) => {
          if (apiKey) {
            proxyReq.setHeader('X-API-Key', apiKey)
          }
        })
      },
    },
    '/ws': {
      target: serverUrl,
      ws: true,
      changeOrigin: true,
      rewrite: (path: string) => {
        const separator = path.includes('?') ? '&' : '?'
        return `${path}${separator}apiKey=${encodeURIComponent(apiKey)}`
      },
    },
  } : undefined

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true as const,
      proxy: proxyConfig,
    },
  }
})
