export interface WSMessage {
  type: 'connected' | 'message' | 'message_edit' | 'message_delete' | 'customer_update' | 'customers_synced' | 'service_unavailable' | 'poll_vote'
  data: Record<string, unknown>
  customer?: { id: string; name: string }
}

type WSEventHandler = (msg: WSMessage) => void

let socket: WebSocket | null = null
let handlers: WSEventHandler[] = []
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000

export function connectWebSocket(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`

  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    console.log('[WS] Connected')
    reconnectDelay = 1000
  }

  socket.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data)
      handlers.forEach((h) => h(msg))
    } catch (err) {
      console.warn('[WS] Failed to parse message:', err)
    }
  }

  socket.onclose = () => {
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
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
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
