export interface Chat {
  id: string
  name: string
  type: 'group' | 'direct' | 'contact'
  lastMessage?: string
  lastMessageTime?: string
  phoneNumber?: string
  unreadCount?: number
}

export interface Message {
  id: string
  body: string
  timestamp: string
  isFromMe: boolean
  fromPhone?: string
  fromName?: string
  hasMedia: boolean
  messageType: string
  chatId?: string
}

export interface HealthStatus {
  status: string
  whatsapp: {
    status: string
    phoneNumber: string
    name: string
  }
  websocket: {
    clients: number
  }
}

export interface GroupCreateResult {
  id: string
  name: string
  participants: string[]
}

async function apiCall<T>(
  endpoint: string,
  method: string = 'GET',
  body?: unknown,
  timeoutMs: number = 10000
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const opts: RequestInit = {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    }

    const response = await fetch(`/${endpoint}`, opts)

    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed. Check server API key.')
    }

    if (response.status === 503) {
      throw new Error('Server is not connected to WhatsApp. Please wait and try again.')
    }

    const contentType = response.headers.get('content-type') || ''
    if (response.ok && !contentType.includes('application/json')) {
      const err = new Error('Endpoint not available')
      ;(err as any).endpointMissing = true
      throw err
    }

    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        const err = new Error(`Endpoint not found (${response.status})`)
        ;(err as any).endpointMissing = true
        throw err
      }
      const text = await response.text()
      let msg = `Server error (${response.status})`
      try {
        const parsed = JSON.parse(text)
        if (parsed.message) msg = parsed.message
        else if (parsed.error) msg = parsed.error
      } catch { /* ignore */ }
      throw new Error(msg)
    }

    return response.json() as Promise<T>
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. The server may be busy.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function apiCallWithFallback<T>(
  v2Endpoint: string,
  v1Endpoint: string,
  method: string = 'GET',
  body?: unknown,
  timeoutMs: number = 10000
): Promise<T> {
  try {
    return await apiCall<T>(v2Endpoint, method, body, timeoutMs)
  } catch (err: any) {
    if (err?.endpointMissing) {
      return apiCall<T>(v1Endpoint, method, body, timeoutMs)
    }
    throw err
  }
}

function chatPath(chatId: string): { v2: string; v1: string } {
  const encoded = encodeURIComponent(chatId)
  return {
    v2: `api/chats/${encoded}`,
    v1: `api/customers/${encoded}`,
  }
}

export async function checkStatus(): Promise<{ ready: boolean }> {
  return apiCall<{ ready: boolean }>('api/status', 'GET', undefined, 5000)
}

export async function checkHealth(): Promise<HealthStatus> {
  return apiCall<HealthStatus>('api/health', 'GET', undefined, 5000)
}

export async function fetchChats(): Promise<Chat[]> {
  return apiCallWithFallback<Chat[]>('api/chats', 'api/customers', 'GET', undefined, 10000)
}

export async function fetchChat(chatId: string): Promise<Chat> {
  const p = chatPath(chatId)
  return apiCallWithFallback<Chat>(p.v2, p.v1, 'GET', undefined, 5000)
}

export async function syncChats(): Promise<Chat[]> {
  return apiCallWithFallback<Chat[]>('api/chats/sync', 'api/customers/sync', 'POST', undefined, 60000)
}

export async function deleteChat(chatId: string): Promise<void> {
  const p = chatPath(chatId)
  return apiCallWithFallback<void>(p.v2, p.v1, 'DELETE', undefined, 30000)
}

export async function fetchMessages(chatId: string, limit: number = 50): Promise<Message[]> {
  const p = chatPath(chatId)
  return apiCallWithFallback<Message[]>(
    `${p.v2}/messages?limit=${limit}`,
    `${p.v1}/messages?limit=${limit}`,
    'GET',
    undefined,
    5000
  )
}

export async function fetchWhatsAppMessages(chatId: string, limit: number = 200): Promise<Message[]> {
  const result = await apiCall<{ messages: Message[] } | Message[]>(
    `api/whatsapp/messages/${encodeURIComponent(chatId)}?limit=${limit}`,
    'GET',
    undefined,
    60000
  )
  if (Array.isArray(result)) return result
  if (result && Array.isArray(result.messages)) return result.messages
  return []
}

export async function sendMessage(chatId: string, message: string): Promise<{ success: boolean }> {
  const p = chatPath(chatId)
  return apiCallWithFallback(
    `${p.v2}/messages`,
    `${p.v1}/messages`,
    'POST',
    { message },
    30000
  )
}

export async function sendMessageWithAttachment(
  chatId: string,
  file: { data: string; filename: string; mimetype: string },
  message?: string
): Promise<{ success: boolean }> {
  const p = chatPath(chatId)
  const body: Record<string, unknown> = {
    file: file.data,
    filename: file.filename,
    mimetype: file.mimetype,
  }
  if (message && message.trim()) body.message = message.trim()
  return apiCallWithFallback(
    `${p.v2}/messages`,
    `${p.v1}/messages`,
    'POST',
    body,
    120000
  )
}

export async function editMessage(chatId: string, messageId: string, message: string): Promise<void> {
  const p = chatPath(chatId)
  const msgId = encodeURIComponent(messageId)
  return apiCallWithFallback(
    `${p.v2}/messages/${msgId}`,
    `${p.v1}/messages/${msgId}`,
    'PATCH',
    { message },
    30000
  )
}

export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
  const p = chatPath(chatId)
  const msgId = encodeURIComponent(messageId)
  return apiCallWithFallback(
    `${p.v2}/messages/${msgId}`,
    `${p.v1}/messages/${msgId}`,
    'DELETE',
    undefined,
    30000
  )
}

export interface Participant {
  id: string
  name: string
  phone: string
  isAdmin: boolean
  isSuperAdmin: boolean
}

export async function fetchParticipants(chatId: string): Promise<Participant[]> {
  const p = chatPath(chatId)
  const result = await apiCallWithFallback<{ participants: Participant[] } | Participant[]>(
    `${p.v2}/participants`,
    `${p.v1}/participants`,
    'GET',
    undefined,
    10000
  )
  if (Array.isArray(result)) return result
  if (result && Array.isArray(result.participants)) return result.participants
  return []
}

export async function createGroup(
  name: string,
  participants: string[],
  photo?: string,
  settings?: { sendMessages: boolean; addMembers: boolean }
): Promise<GroupCreateResult> {
  const body: Record<string, unknown> = { name, participants }
  if (photo) body.photo = photo
  if (settings) body.settings = settings
  return apiCall('api/groups/create', 'POST', body, 60000)
}

export async function checkNumber(phoneNumber: string): Promise<{ registered: boolean }> {
  return apiCall('api/diagnostics/check-number', 'POST', { phoneNumber }, 30000)
}
