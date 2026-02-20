const SERVER_URL_KEY = 'imagine_server_url'
const API_KEY_KEY = 'imagine_api_key'

export interface ServerConfig {
  serverUrl: string
  apiKey: string
}

function normalizeUrl(url: string): string {
  return (url || '').trim().replace(/\/$/, '')
}

export function getServerConfig(): ServerConfig {
  if (typeof window === 'undefined') return { serverUrl: '', apiKey: '' }
  return {
    serverUrl: normalizeUrl(localStorage.getItem(SERVER_URL_KEY) || ''),
    apiKey: (localStorage.getItem(API_KEY_KEY) || '').trim(),
  }
}

export function saveServerConfig(config: ServerConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SERVER_URL_KEY, normalizeUrl(config.serverUrl))
  localStorage.setItem(API_KEY_KEY, (config.apiKey || '').trim())
}

export function clearServerConfig(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SERVER_URL_KEY)
  localStorage.removeItem(API_KEY_KEY)
}

export function buildApiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const { serverUrl } = getServerConfig()
  if (!serverUrl) return normalizedEndpoint
  return `${serverUrl}${normalizedEndpoint}`
}
