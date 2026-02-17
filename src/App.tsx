import { useState } from 'react'
import './App.css'
import MessagingScreen from './MessagingScreen'
import CreateGroupScreen from './CreateGroupScreen'
import SettingsScreen from './SettingsScreen'

type Screen =
  | { name: 'messaging' }
  | { name: 'createGroup' }
  | { name: 'settings' }

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'messaging' })

  return (
    <main className="app-shell">
      {screen.name === 'messaging' && (
        <MessagingScreen
          onCreateGroup={() => setScreen({ name: 'createGroup' })}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      )}
      {screen.name === 'createGroup' && (
        <CreateGroupScreen
          onBack={() => setScreen({ name: 'messaging' })}
          onCreated={() => setScreen({ name: 'messaging' })}
        />
      )}
      {screen.name === 'settings' && (
        <SettingsScreen onBack={() => setScreen({ name: 'messaging' })} />
      )}
    </main>
  )
}

export default App
