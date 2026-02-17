import { useState } from 'react'
import './App.css'
import MessagingScreen from './MessagingScreen'
import CreateGroupScreen from './CreateGroupScreen'

type Screen =
  | { name: 'messaging' }
  | { name: 'createGroup' }

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'messaging' })

  return (
    <main className="app-shell">
      {screen.name === 'messaging' && (
        <MessagingScreen
          onCreateGroup={() => setScreen({ name: 'createGroup' })}
        />
      )}
      {screen.name === 'createGroup' && (
        <CreateGroupScreen
          onBack={() => setScreen({ name: 'messaging' })}
          onCreated={() => setScreen({ name: 'messaging' })}
        />
      )}
    </main>
  )
}

export default App
