import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type TestResult =
  | { type: 'idle'; message: string }
  | { type: 'loading'; message: string }
  | { type: 'success'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'error'; message: string }

const STORAGE_KEY = 'imagine-agent-client.settings.v1'

function App() {
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

  const normalizeUrl = (url: string) => url.trim().replace(/\/$/, '')

  const testConnection = async (e: FormEvent) => {
    e.preventDefault()

    if (!serverUrl.trim() || !apiKey.trim()) {
      setResult({ type: 'error', message: 'Server URL and API key are required.' })
      return
    }

    setResult({ type: 'loading', message: 'Testing connection…' })

    try {
      const base = normalizeUrl(serverUrl)
      const response = await fetch(`${base}/api/status`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey.trim(),
        },
      })

      if (response.status === 401 || response.status === 403) {
        setResult({ type: 'error', message: 'Authentication failed. Check API key.' })
        return
      }

      if (!response.ok) {
        setResult({
          type: 'error',
          message: `Server responded with ${response.status}.`,
        })
        return
      }

      const data = (await response.json()) as { ready?: boolean; message?: string }

      if (data.ready === true) {
        setResult({ type: 'success', message: 'Connected. WhatsApp server is ready.' })
      } else {
        setResult({
          type: 'warning',
          message: data.message || 'Server reachable, but WhatsApp is not ready.',
        })
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: 'Could not reach server. Check URL, network, and CORS settings.',
      })
    }
  }

  return (
    <main className="app-shell">
      <section className="card">
        <h1>ImagineAgent Client</h1>
        <p className="subtitle">Settings · Phase 1</p>

        <form onSubmit={testConnection} className="form">
          <label>
            WhatsApp Server URL
            <input
              type="url"
              placeholder="https://your-server.replit.dev"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              required
            />
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

        <p className={`status ${result.type}`}>{result.message}</p>
      </section>
    </main>
  )
}

export default App
