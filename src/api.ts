export interface Customer {
  id: string
  name: string
  lastMessage?: string
  lastMessageTime?: string
  phoneNumber?: string
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
  customerId?: string
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

export interface SyncStatus {
  totalGroups: number
  adminGroups: number
  totalParticipants: number
  lastSync: string
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

    if (!response.ok) {
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

export async function checkStatus(): Promise<{ ready: boolean }> {
  return apiCall<{ ready: boolean }>('api/status', 'GET', undefined, 5000)
}

export async function checkHealth(): Promise<HealthStatus> {
  return apiCall<HealthStatus>('api/health', 'GET', undefined, 5000)
}

export async function fetchCustomers(): Promise<Customer[]> {
  return apiCall<Customer[]>('api/customers', 'GET', undefined, 10000)
}

export async function syncCustomers(): Promise<Customer[]> {
  return apiCall<Customer[]>('api/customers/sync', 'POST', undefined, 60000)
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return apiCall<SyncStatus>('api/admin/sync-status', 'GET', undefined, 5000)
}

export async function fetchMessages(customerId: string, limit: number = 50): Promise<Message[]> {
  return apiCall<Message[]>(
    `api/customers/${encodeURIComponent(customerId)}/messages?limit=${limit}`,
    'GET',
    undefined,
    10000
  )
}

export async function fetchWhatsAppMessages(chatId: string, limit: number = 200): Promise<Message[]> {
  return apiCall<Message[]>(
    `api/whatsapp/messages/${encodeURIComponent(chatId)}?limit=${limit}`,
    'GET',
    undefined,
    60000
  )
}

export async function sendMessage(customerId: string, message: string): Promise<{ success: boolean }> {
  return apiCall(
    `api/customers/${encodeURIComponent(customerId)}/messages`,
    'POST',
    { message },
    30000
  )
}

export async function createGroup(
  name: string,
  participants: string[]
): Promise<GroupCreateResult> {
  return apiCall('api/groups/create', 'POST', { name, participants }, 60000)
}

export async function checkNumber(phoneNumber: string): Promise<{ registered: boolean }> {
  return apiCall('api/diagnostics/check-number', 'POST', { phoneNumber }, 30000)
}
