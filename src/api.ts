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

async function apiCall<T>(
  endpoint: string,
  method: string = 'GET',
  body?: unknown
): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }

  const response = await fetch(`/${endpoint}`, opts)

  if (response.status === 401 || response.status === 403) {
    throw new Error('Authentication failed. Check server API key.')
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

export async function checkStatus(): Promise<{ ready: boolean; message?: string }> {
  return apiCall<{ ready: boolean; message?: string }>('api/status')
}
