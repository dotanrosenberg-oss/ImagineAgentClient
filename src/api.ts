export interface Chat {
  id: string
  name: string
  type: 'group' | 'direct' | 'contact'
  lastMessage?: string
  lastMessageTime?: string
  phoneNumber?: string
  unreadCount?: number
  profilePicUrl?: string
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
  mediaUrl?: string
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
  success: boolean
  groupId: string
  groupName: string
  id: string
}

function stringify(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') return val
  try { return JSON.stringify(val) } catch { return String(val) }
}

function extractErrorMessage(parsed: Record<string, unknown>, status: number): string {
  const detail = stringify(parsed.details || parsed.detail || parsed.errors || '')
  const msg = stringify(parsed.message || parsed.error || '')
  if (msg && detail) return `${msg} — ${detail}`
  if (msg) return msg
  if (detail) return detail
  return `Server error (${status})`
}

function friendlyGroupError(rawMessage: string, participants: string[]): string {
  const lower = rawMessage.toLowerCase()

  if (lower.includes('validation_error') || lower.includes('validation error')) {
    if (rawMessage.toLowerCase() !== 'validation_error' && rawMessage.toLowerCase() !== 'validation error') {
      return `Couldn't create the group: ${rawMessage}`
    }
    if (participants.length > 0) {
      const nums = participants.join(', ')
      return `Couldn't create the group. One or more phone numbers may be invalid or not on WhatsApp: ${nums}. Make sure numbers include the country code (e.g. +1 for US).`
    }
    return 'Couldn\'t create the group. Please check that all phone numbers are valid and include the country code (e.g. +1 for US).'
  }

  if (lower.includes('not found') || lower.includes('not_found')) {
    return 'One or more participants could not be found on WhatsApp. Double-check the numbers and try again.'
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return 'The request took too long. WhatsApp may be busy — please try again in a moment.'
  }

  if (lower.includes('unauthorized') || lower.includes('auth') || lower.includes('403') || lower.includes('401')) {
    return 'Unable to authenticate with the server. The API key may need to be updated.'
  }

  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many requests — please wait a moment before trying again.'
  }

  return rawMessage
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
      throw new Error('Unable to authenticate. The API key may be incorrect for this server.')
    }

    if (response.status === 503) {
      throw new Error('WhatsApp is temporarily unavailable. It may be reconnecting — try again in a moment.')
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
        msg = extractErrorMessage(parsed, response.status)
      } catch { /* ignore */ }
      throw new Error(msg)
    }

    return response.json() as Promise<T>
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The request took too long. The server might be busy — please try again.')
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
  try {
    return await apiCall<HealthStatus>('api/health', 'GET', undefined, 5000)
  } catch {
    const status = await apiCall<any>('api/status', 'GET', undefined, 5000)
    return {
      status: status?.status || 'unknown',
      whatsapp: {
        status: status?.whatsapp?.state || status?.whatsapp?.status || 'unknown',
        phoneNumber: status?.whatsapp?.phoneNumber || '',
        name: status?.whatsapp?.name || '',
      },
      websocket: {
        clients: status?.websocket?.activeClients ?? 0,
      },
    }
  }
}

function normalizeChat(raw: any): Chat {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    type: raw.type || (raw.isGroup ? 'group' : (raw.id?.endsWith('@c.us') ? 'contact' : (raw.id?.endsWith('@g.us') ? 'group' : 'contact'))),
    lastMessage: raw.lastMessage,
    lastMessageTime: raw.lastMessageTime || raw.lastMessageAt,
    phoneNumber: raw.phoneNumber,
    unreadCount: raw.unreadCount,
    profilePicUrl: raw.profilePicUrl,
  }
}

function normalizeMessage(raw: any): Message {
  return {
    id: raw.id,
    body: raw.body || '',
    timestamp: raw.timestamp,
    isFromMe: raw.isFromMe ?? raw.id?.startsWith('true_') ?? false,
    fromPhone: raw.fromPhone || raw.sender,
    fromName: raw.fromName,
    hasMedia: raw.hasMedia ?? (raw.type !== 'text' && raw.type !== 'chat'),
    messageType: raw.messageType || raw.type || 'text',
    chatId: raw.chatId,
    mediaUrl: raw.mediaUrl,
  }
}

export async function fetchChats(): Promise<Chat[]> {
  const result = await apiCallWithFallback<any>('api/chats', 'api/customers', 'GET', undefined, 10000)
  const list = Array.isArray(result) ? result : (result?.chats || [])
  return list.map(normalizeChat)
}

export async function fetchChat(chatId: string): Promise<Chat> {
  const p = chatPath(chatId)
  const result = await apiCallWithFallback<any>(p.v2, p.v1, 'GET', undefined, 5000)
  return normalizeChat(result)
}

export async function syncChats(): Promise<Chat[]> {
  const result = await apiCallWithFallback<any>('api/chats/sync', 'api/customers/sync', 'POST', undefined, 60000)
  const list = Array.isArray(result) ? result : (result?.chats || [])
  return list.map(normalizeChat)
}

export async function deleteChat(chatId: string): Promise<void> {
  const p = chatPath(chatId)
  return apiCallWithFallback<void>(p.v2, p.v1, 'DELETE', undefined, 30000)
}

export async function fetchMessages(chatId: string, limit: number = 50): Promise<Message[]> {
  const p = chatPath(chatId)
  const result = await apiCallWithFallback<any>(
    `${p.v2}/messages?limit=${limit}`,
    `${p.v1}/messages?limit=${limit}`,
    'GET',
    undefined,
    5000
  )
  const list = Array.isArray(result) ? result : (result?.messages || [])
  return list.map(normalizeMessage)
}

export async function fetchWhatsAppMessages(chatId: string, limit: number = 200): Promise<Message[]> {
  const result = await apiCall<any>(
    `api/whatsapp/messages/${encodeURIComponent(chatId)}?limit=${limit}`,
    'GET',
    undefined,
    60000
  )
  const list = Array.isArray(result) ? result : (result?.messages || [])
  return list.map(normalizeMessage)
}

export async function sendMessage(chatId: string, message: string): Promise<{ success: boolean }> {
  return apiCall('api/messages/send', 'POST', { chatId, message }, 30000)
}

export async function sendMessageWithAttachment(
  chatId: string,
  file: File,
  caption?: string
): Promise<{ success: boolean }> {
  const formData = new FormData()
  formData.append('chatId', chatId)
  formData.append('file', file)
  if (caption && caption.trim()) formData.append('caption', caption.trim())

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await fetch('/api/messages/send-media', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    if (response.status === 401 || response.status === 403) {
      throw new Error('Unable to authenticate. The API key may be incorrect for this server.')
    }
    if (response.status === 503) {
      throw new Error('WhatsApp is temporarily unavailable. It may be reconnecting — try again in a moment.')
    }
    if (!response.ok) {
      const text = await response.text()
      let msg = `Server error (${response.status})`
      try {
        const parsed = JSON.parse(text)
        msg = extractErrorMessage(parsed, response.status)
      } catch { /* ignore */ }
      throw new Error(msg)
    }
    return response.json() as Promise<{ success: boolean }>
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The upload took too long. Try a smaller file, or check your connection.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
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
  participants: string[]
): Promise<GroupCreateResult> {
  try {
    return await apiCall('api/groups/create', 'POST', { name, participants }, 60000)
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(friendlyGroupError(err.message, participants))
    }
    throw err
  }
}

export async function setGroupImage(groupId: string, imageFile: File): Promise<{ success: boolean; groupId: string }> {
  const formData = new FormData()
  formData.append('groupId', groupId)
  formData.append('image', imageFile)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)

  try {
    const response = await fetch('/api/groups/set-image', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      let msg = `Failed to set group image (${response.status})`
      try {
        const parsed = JSON.parse(text)
        msg = extractErrorMessage(parsed, response.status)
      } catch { /* ignore */ }
      throw new Error(msg)
    }
    return response.json() as Promise<{ success: boolean; groupId: string }>
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Image upload timed out. Try a smaller image.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function checkNumber(phoneNumber: string): Promise<{ registered: boolean }> {
  return apiCall('api/diagnostics/check-number', 'POST', { phoneNumber }, 30000)
}
