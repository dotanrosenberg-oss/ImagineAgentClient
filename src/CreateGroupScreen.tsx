import { useState } from 'react'
import type { FormEvent } from 'react'
import { createGroup } from './api'

interface Props {
  participantId: string
  participantName: string
  onBack: () => void
  onCreated: (groupId: string) => void
}

export default function CreateGroupScreen({ participantId, participantName, onBack, onCreated }: Props) {
  const [groupName, setGroupName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return

    setCreating(true)
    setError(null)
    try {
      const result = await createGroup(groupName.trim(), [participantId])
      setSuccess(true)
      setTimeout(() => onCreated(result.id), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="create-group-layout">
      <div className="create-group-card">
        <div className="create-group-header">
          <button className="back-btn" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h2>Create Group</h2>
        </div>

        <div className="participant-preview">
          <div className="participant-chip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{participantName}</span>
          </div>
          <p className="participant-note">This person will be added to the group</p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Group Name
            <input
              type="text"
              placeholder="Enter group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
              autoFocus
              disabled={creating || success}
            />
          </label>

          <label>
            Description (optional)
            <textarea
              placeholder="What's this group about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={creating || success}
            />
          </label>

          {error && <div className="status error">{error}</div>}
          {success && <div className="status success">Group created successfully!</div>}

          <div className="actions">
            <button type="submit" disabled={!groupName.trim() || creating || success}>
              {creating ? 'Creating...' : 'Create Group'}
            </button>
            <button type="button" className="secondary" onClick={onBack} disabled={creating}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
