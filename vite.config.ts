import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getServerConfig() {
  let serverUrl = process.env.WA_SERVER_URL || ''
  let apiKey = process.env.WA_API_KEY || ''

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

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
      proxy: serverUrl ? {
        '/api': {
          target: serverUrl,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (apiKey) {
                proxyReq.setHeader('X-API-Key', apiKey)
              }
            })
          },
        },
      } : undefined,
    },
  }
})
