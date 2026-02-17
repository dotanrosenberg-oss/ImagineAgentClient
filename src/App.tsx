import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type UiResult =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

type MessageFilter = 'unread' | 'all'

type WaMessage = {
  id: string
  senderId: string
  senderName: string
  body: string
  timestamp?: string
  unread?: boolean
  avatarUrl?: string
  profilePicUrl?: string
}

type Settings = {
  serverUrl: string
  apiKey: string
}

const FULL_URL_HINT =
  'https://a8e0e9ea-3eae-4e21-8bed-17e7e221d6b2-00-pft6lj2s145p.picard.replit.dev'

const STORAGE_KEY = 'imagine-agent-client.settings.v1'

function App() {
  const saved = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { serverUrl: '', apiKey: '' }
    try {
      return JSON.parse(raw) as Settings
    } catch {
      return { serverUrl: '', apiKey: '' }
    }
  }, [])

  const [serverUrl, setServerUrl] = useState(saved.serverUrl)
  const [apiKey, setApiKey] = useState(saved.apiKey)
  const [result, setResult] = useState<UiResult>({
    type: 'idle',
    message: 'Enter your WhatsApp server details, then test connection.',
  })

  const [messages, setMessages] = useState<WaMessage[]>([])
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('unread')
  const [customerName, setCustomerName] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [creatingGroupFor, setCreatingGroupFor] = useState<string | null>(null)
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({})

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl, apiKey }))
    setResult({ type: 'success', message: 'Settings saved locally on this device.' })
  }

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim()
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return withProtocol.replace(/\/$/, '')
  }

  const ensureSettings = () => {
    if (!serverUrl.trim() || !apiKey.trim()) {
      setResult({ type: 'error', message: 'Server URL and API key are required.' })
      return null
    }

    try {
      const base = normalizeUrl(serverUrl)
      new URL(base)
      return { base, apiKey: apiKey.trim() }
    } catch {
      setResult({
        type: 'error',
        message: 'URL format looks invalid. Paste full server URL (including .replit.dev).',
      })
      return null
    }
  }

  const fetchJson = async (settings: { base: string; apiKey: string }, path: string, init?: RequestInit) => {
    try {
      const response = await fetch(`${settings.base}${path}`, {
        ...init,
        headers: {
          'X-API-Key': settings.apiKey,
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      })

      return response
    } catch {
      const proxyPath =
        init?.method === 'POST'
          ? '/__wa_proxy/groups'
          : `/__wa_proxy/messages?base=${encodeURIComponent(settings.base)}&apiKey=${encodeURIComponent(settings.apiKey)}${path.includes('filter=all') ? '&filter=all' : '&filter=unread'}`
      const fallback = await fetch(proxyPath, {
        method: init?.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body:
          init?.method === 'POST'
            ? JSON.stringify({
                base: settings.base,
                apiKey: settings.apiKey,
                payload: init?.body ? JSON.parse(String(init.body)) : undefined,
              })
            : undefined,
      })
      return fallback
    }
  }

  const normalizeMessages = (raw: unknown): WaMessage[] => {
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { messages?: unknown[] })?.messages)
        ? ((raw as { messages: unknown[] }).messages ?? [])
        : []

    return list
      .map((item, idx) => {
        const m = (item || {}) as Record<string, unknown>
        const senderId =
          String(m.from ?? m.chatId ?? m.chat_id ?? m.author ?? m.sender ?? m.phone ?? '').trim() ||
          `unknown-${idx}`

        const senderName =
          String(
            m.pushName ?? m.displayName ?? m.contactName ?? m.name ?? m.authorName ?? senderId,
          ).trim() || senderId

        const body = String(m.text ?? m.body ?? m.message ?? m.content ?? '').trim()
        const id = String(m.id ?? m.messageId ?? `${senderId}-${idx}`)
        const timestamp = m.timestamp ? String(m.timestamp) : undefined
        const unread =
          typeof m.unread === 'boolean'
            ? m.unread
            : typeof m.isRead === 'boolean'
              ? !m.isRead
              : undefined

        const avatarUrl =
          String(
            m.avatarUrl ??
              m.imageUrl ??
              m.chatImage ??
              m.chatPhoto ??
              m.picture ??
              m.photo ??
              '',
          ).trim() || undefined

        const profilePicUrl =
          String(
            m.profilePicUrl ??
              m.profile_pic_url ??
              m.contactPhoto ??
              m.senderPhoto ??
              m.contactImage ??
              '',
          ).trim() || undefined

        return { id, senderId, senderName, body, timestamp, unread, avatarUrl, profilePicUrl }
      })
      .filter((m) => !!m.senderId)
  }

  const testConnection = async (e: FormEvent) => {
    e.preventDefault()
    const settings = ensureSettings()
    if (!settings) return

    setResult({ type: 'loading', message: 'Testing connection…' })

    try {
      const response = await fetchJson(settings, '/api/status', { method: 'GET' })

      if (response.status === 401 || response.status === 403) {
        setResult({ type: 'error', message: 'Authentication failed. Check API key.' })
        return
      }

      if (!response.ok) {
        setResult({ type: 'error', message: `Server responded with ${response.status}.` })
        return
      }

      const data = (await response.json()) as { ready?: boolean; message?: string }
      if (data.ready === true) {
        setResult({ type: 'success', message: 'Connected. WhatsApp server is ready.' })
      } else {
        setResult({ type: 'warning', message: data.message || 'Server reachable, but WhatsApp is not ready.' })
      }
    } catch {
      setResult({ type: 'error', message: 'Could not reach server. Check URL, API key, and network.' })
    }
  }

  const loadMessages = async () => {
    const settings = ensureSettings()
    if (!settings) return

    setLoadingMessages(true)
    setResult({ type: 'loading', message: `Loading ${messageFilter} messages…` })

    try {
      const query =
        messageFilter === 'unread'
          ? '?filter=unread&unread=true&includePhotos=true'
          : '?filter=all&includePhotos=true'
      const response = await fetchJson(settings, `/api/messages${query}`, { method: 'GET' })

      if (response.status === 401 || response.status === 403) {
        setResult({ type: 'error', message: 'Authentication failed while loading messages.' })
        return
      }

      if (!response.ok) {
        setResult({ type: 'error', message: `Could not load messages (${response.status}).` })
        return
      }

      const data = (await response.json()) as unknown
      const normalized = normalizeMessages(data)
      setMessages(normalized)
      setResult({
        type: 'success',
        message: `Loaded ${normalized.length} message${normalized.length === 1 ? '' : 's'}.`,
      })
    } catch {
      setResult({ type: 'error', message: 'Failed to load messages from WA server.' })
    } finally {
      setLoadingMessages(false)
    }
  }

  const getInitials = (name: string) => {
    const parts = name
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean)
    const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    return initials || '?'
  }

  const createGroupFromMessage = async (msg: WaMessage) => {
    const settings = ensureSettings()
    if (!settings) return

    const cleanName = customerName.trim()
    if (!cleanName) {
      setResult({ type: 'error', message: 'Enter customer name before creating a group.' })
      return
    }

    const groupName = `Imagine travel - ${cleanName}`
    setCreatingGroupFor(msg.id)

    try {
      const body = {
        name: groupName,
        participants: [msg.senderId],
      }

      const response = await fetchJson(settings, '/api/groups/create', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (response.status === 401 || response.status === 403) {
        setResult({ type: 'error', message: 'Authentication failed while creating group.' })
        return
      }

      if (!response.ok) {
        setResult({ type: 'error', message: `Group creation failed (${response.status}).` })
        return
      }

      setResult({
        type: 'success',
        message: `Group created: ${groupName}`,
      })
    } catch {
      setResult({ type: 'error', message: 'Failed to create group on WA server.' })
    } finally {
      setCreatingGroupFor(null)
    }
  }

  const normalizedPreview = serverUrl.trim() ? normalizeUrl(serverUrl) : ''

  return (
    <main className="app-shell">
      <section className="card">
        <h1>ImagineAgent Client</h1>
        <p className="subtitle">Settings + Message Intake</p>
        <p className="example-url">Example: {FULL_URL_HINT}</p>

        <form onSubmit={testConnection} className="form">
          <label>
            WhatsApp Server URL
            <input
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="https://your-server.replit.dev"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              required
            />
            <small className="hint">
              Use full URL (host should end with <code>.replit.dev</code>).
            </small>
            {!!normalizedPreview && (
              <small className="preview" title={normalizedPreview}>
                Using: {normalizedPreview}
              </small>
            )}
          </label>

          <label>
            API Key
            <input
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </label>

          <div className="actions">
            <button type="submit">Test Connection</button>
            <button type="button" className="secondary" onClick={saveSettings}>
              Save
            </button>
          </div>
        </form>

        <div className="messages-panel">
          <div className="messages-toolbar">
            <label>
              View
              <select
                value={messageFilter}
                onChange={(e) => setMessageFilter(e.target.value as MessageFilter)}
              >
                <option value="unread">Unread (default)</option>
                <option value="all">All</option>
              </select>
            </label>

            <button type="button" onClick={loadMessages} disabled={loadingMessages}>
              {loadingMessages ? 'Loading…' : 'Pull Messages'}
            </button>
          </div>

          <label>
            Customer name
            <input
              type="text"
              placeholder="e.g. John Smith"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </label>

          <div className="message-list">
            {messages.length === 0 ? (
              <p className="muted">No messages loaded yet.</p>
            ) : (
              messages.map((msg) => (
                <article key={msg.id} className="message-card">
                  <div className="message-head">
                    <div className="sender-avatar" aria-label={`Avatar for ${msg.senderName}`}>
                      {!brokenImages[msg.id] && (msg.profilePicUrl || msg.avatarUrl) ? (
                        <img
                          src={msg.profilePicUrl || msg.avatarUrl}
                          alt={msg.senderName}
                          onError={() =>
                            setBrokenImages((prev) => ({
                              ...prev,
                              [msg.id]: true,
                            }))
                          }
                        />
                      ) : (
                        <span>{getInitials(msg.senderName)}</span>
                      )}
                    </div>
                    <div className="sender-meta">
                      <strong>{msg.senderName}</strong>
                      <span className="muted small">{msg.senderId}</span>
                    </div>
                  </div>
                  <p>{msg.body || '(no text)'}</p>
                  <button
                    type="button"
                    onClick={() => createGroupFromMessage(msg)}
                    disabled={creatingGroupFor === msg.id}
                  >
                    {creatingGroupFor === msg.id ? 'Creating…' : 'Turn into group'}
                  </button>
                </article>
              ))
            )}
          </div>
        </div>

        <p className={`status ${result.type}`}>{result.message}</p>
      </section>
    </main>
  )
}

export default App
