import { useState, useMemo } from 'react'
import './App.css'
import SettingsScreen from './SettingsScreen'
import MessagingScreen from './MessagingScreen'
import CreateGroupScreen from './CreateGroupScreen'

type Screen =
  | { name: 'settings' }
  | { name: 'messaging' }
  | { name: 'createGroup'; participantId: string; participantName: string }

const STORAGE_KEY = 'imagine-agent-client.settings.v1'

function App() {
  const hasSettings = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as { serverUrl: string; apiKey: string }
      return !!parsed.serverUrl && !!parsed.apiKey
    } catch {
      return false
    }
  }, [])

  const [screen, setScreen] = useState<Screen>(
    hasSettings ? { name: 'messaging' } : { name: 'settings' }
  )

  return (
    <main className="app-shell">
      {screen.name === 'settings' && (
        <SettingsScreen onConnected={() => setScreen({ name: 'messaging' })} />
      )}
      {screen.name === 'messaging' && (
        <MessagingScreen
          onSettings={() => setScreen({ name: 'settings' })}
          onCreateGroup={(id, name) =>
            setScreen({ name: 'createGroup', participantId: id, participantName: name })
          }
        />
      )}
      {screen.name === 'createGroup' && (
        <CreateGroupScreen
          participantId={screen.participantId}
          participantName={screen.participantName}
          onBack={() => setScreen({ name: 'messaging' })}
          onCreated={() => setScreen({ name: 'messaging' })}
        />
      )}
    </main>
  )
}

export default App
