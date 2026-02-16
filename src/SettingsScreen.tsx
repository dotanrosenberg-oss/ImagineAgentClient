import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type TestResult =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

const FULL_URL_HINT =
  'https://a8e0e9ea-3eae-4e21-8bed-17e7e221d6b2-00-pft6lj2s145p.picard.replit.dev'

const STORAGE_KEY = 'imagine-agent-client.settings.v1'

interface Props {
  onConnected: () => void
}

export default function SettingsScreen({ onConnected }: Props) {
  const saved = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { serverUrl: '', apiKey: '' }
    try {
      return JSON.parse(raw) as { serverUrl: string; apiKey: string }
    } catch {
      return { serverUrl: '', apiKey: '' }
    }
  }, [])

  const [serverUrl, setServerUrl] = useState(saved.serverUrl)
  const [apiKey, setApiKey] = useState(saved.apiKey)
  const [result, setResult] = useState<TestResult>({
    type: 'idle',
    message: 'Enter your WhatsApp server details, then test connection.',
  })

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl, apiKey }))
    setResult({ type: 'success', message: 'Settings saved locally on this device.' })
  }

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim()
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return withProtocol.replace(/\/$/, '')
  }

  const testConnection = async (e: FormEvent) => {
    e.preventDefault()

    if (!serverUrl.trim() || !apiKey.trim()) {
      setResult({ type: 'error', message: 'Server URL and API key are required.' })
      return
    }

    setResult({ type: 'loading', message: 'Testing connection…' })

    try {
      const base = normalizeUrl(serverUrl)
      new URL(base)
      let response: Response
      try {
        response = await fetch(
          `/__wa_proxy/api/status?base=${encodeURIComponent(base)}&apiKey=${encodeURIComponent(apiKey.trim())}`,
        )
      } catch {
        response = await fetch(`${base}/api/status`, {
          method: 'GET',
          headers: { 'X-API-Key': apiKey.trim() },
        })
      }

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
        saveSettings()
        setResult({ type: 'success', message: 'Connected! Settings saved.' })
        setTimeout(() => onConnected(), 600)
      } else {
        setResult({
          type: 'warning',
          message: data.message || 'Server reachable, but WhatsApp is not ready.',
        })
      }
    } catch (error) {
      let message = 'Could not reach server. Check URL and network.'
      if (error instanceof Error && /Invalid URL/i.test(error.message)) {
        message = 'URL format looks invalid. Paste full server URL (including .replit.dev).'
      } else if (error instanceof TypeError) {
        message = 'Request blocked by browser (likely CORS) or network.'
      }
      setResult({ type: 'error', message })
    }
  }

  const normalizedPreview = serverUrl.trim() ? normalizeUrl(serverUrl) : ''

  return (
    <section className="card">
      <h1>ImagineAgent Client</h1>
      <p className="subtitle">Settings</p>
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
          <small className="hint">Use full URL (host must end with <code>.replit.dev</code>).</small>
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
          <button type="submit">Test &amp; Connect</button>
          <button type="button" className="secondary" onClick={saveSettings}>
            Save
          </button>
        </div>
      </form>

      <p className={`status ${result.type}`}>{result.message}</p>
    </section>
  )
}
