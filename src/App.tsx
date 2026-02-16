import { useState } from 'react'
import './App.css'
import MessagingScreen from './MessagingScreen'
import CreateGroupScreen from './CreateGroupScreen'

type Screen =
  | { name: 'messaging' }
  | { name: 'createGroup'; participantId: string; participantName: string }

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'messaging' })

  return (
    <main className="app-shell">
      {screen.name === 'messaging' && (
        <MessagingScreen
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
