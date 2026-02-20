import { getServerConfig } from './serverConfig'

export interface WSMessage {
  type: 'connected' | 'message' | 'message_edit' | 'message_delete' | 'chat_update' | 'chats_synced' | 'service_unavailable' | 'poll_vote' | 'wa_state'
  event?: string
  data: Record<string, unknown>
  chat?: { id: string; name: string }
}

type WSEventHandler = (msg: WSMessage) => void

let socket: WebSocket | null = null
let handlers: WSEventHandler[] = []
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 2000
let openedAt = 0

export function connectWebSocket(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  const { serverUrl, apiKey } = getServerConfig()
  let wsUrl: string

  if (serverUrl) {
    const http = new URL(serverUrl)
    const protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'
    const tokenSuffix = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : ''
    wsUrl = `${protocol}//${http.host}/ws${tokenSuffix}`
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    wsUrl = `${protocol}//${window.location.host}/ws`
  }

  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    openedAt = Date.now()
    console.log('[WS] Connected')
  }

  socket.onmessage = (event) => {
    try {
      const raw = JSON.parse(event.data)
      const msg: WSMessage = { ...raw, type: raw.type || raw.event }
      handlers.forEach((h) => h(msg))
    } catch (err) {
      console.warn('[WS] Failed to parse message:', err)
    }
  }

  socket.onclose = () => {
    const wasStable = openedAt > 0 && (Date.now() - openedAt) > 5000
    if (wasStable) {
      reconnectDelay = 2000
    } else {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000)
    }
    console.log('[WS] Disconnected, reconnecting...')
    scheduleReconnect()
  }

  socket.onerror = () => {
    socket?.close()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, reconnectDelay)
}

export function disconnectWebSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (socket) {
    socket.onclose = null
    socket.close()
    socket = null
  }
}

export function onWSMessage(handler: WSEventHandler): () => void {
  handlers.push(handler)
  return () => {
    handlers = handlers.filter((h) => h !== handler)
  }
}

export function isWSConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN
}
