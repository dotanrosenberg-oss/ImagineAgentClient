import { useState } from 'react'
import './App.css'
import MessagingScreen from './MessagingScreen'
import CreateGroupScreen from './CreateGroupScreen'
import type { Participant } from './api'

type Screen =
  | { name: 'messaging' }
  | { name: 'createGroup'; prefillParticipants?: Participant[]; sourceGroupName?: string }

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'messaging' })

  return (
    <main className="app-shell">
      {screen.name === 'messaging' && (
        <MessagingScreen
          onCreateGroup={() => setScreen({ name: 'createGroup' })}
          onCreateGroupFromMembers={(participants, sourceGroupName) =>
            setScreen({ name: 'createGroup', prefillParticipants: participants, sourceGroupName })
          }
        />
      )}
      {screen.name === 'createGroup' && (
        <CreateGroupScreen
          onBack={() => setScreen({ name: 'messaging' })}
          onCreated={() => setScreen({ name: 'messaging' })}
          prefillParticipants={screen.prefillParticipants}
          sourceGroupName={screen.sourceGroupName}
        />
      )}
    </main>
  )
}

export default App
