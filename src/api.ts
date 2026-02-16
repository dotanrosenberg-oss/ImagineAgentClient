const STORAGE_KEY = 'imagine-agent-client.settings.v1'

export interface Settings {
  serverUrl: string
  apiKey: string
}

export function getSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { serverUrl: '', apiKey: '' }
  try {
    return JSON.parse(raw) as Settings
  } catch {
    return { serverUrl: '', apiKey: '' }
  }
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.replace(/\/$/, '')
}

async function apiCall<T>(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<T> {
  const { serverUrl, apiKey } = getSettings()
  if (!serverUrl || !apiKey) {
    throw new Error('Server not configured. Go to Settings first.')
  }

  const base = normalizeUrl(serverUrl)
  let response: Response

  const proxyUrl = `/__wa_proxy/${endpoint}?base=${encodeURIComponent(base)}&apiKey=${encodeURIComponent(apiKey.trim())}`
  const proxyOpts: RequestInit = {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  }

  try {
    response = await fetch(proxyUrl, proxyOpts)
  } catch {
    const opts: RequestInit = {
      method,
      headers: {
        'X-API-Key': apiKey.trim(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
    response = await fetch(`${base}/${endpoint}`, opts)
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Authentication failed. Check API key in Settings.')
  }

  if (!response.ok) {
    const text = await response.text()
    let msg = `Server error (${response.status})`
    try {
      const parsed = JSON.parse(text)
      if (parsed.error) msg = parsed.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  return response.json() as Promise<T>
}

export interface Chat {
  id: string
  name: string
  isGroup: boolean
  timestamp: number
  lastMessage?: {
    body: string
    timestamp: number
    fromMe: boolean
  }
  unreadCount?: number
}

export interface Message {
  id: string
  body: string
  timestamp: number
  fromMe: boolean
  author?: string
  hasMedia: boolean
  type: string
}

export interface GroupCreateResult {
  id: string
  name: string
  participants: string[]
}

export async function fetchChats(): Promise<Chat[]> {
  return apiCall<Chat[]>('api/chats')
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
  return apiCall<Message[]>(`api/chats/${encodeURIComponent(chatId)}/messages`)
}

export async function sendMessage(chatId: string, message: string): Promise<{ success: boolean }> {
  return apiCall('api/send-message', 'POST', { chatId, message })
}

export async function createGroup(
  name: string,
  participants: string[]
): Promise<GroupCreateResult> {
  return apiCall('api/group/create', 'POST', { name, participants })
}

export async function testConnection(): Promise<{ ready: boolean; message?: string }> {
  return apiCall<{ ready: boolean; message?: string }>('api/status')
}
