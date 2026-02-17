import { useState } from 'react'
import type { FormEvent } from 'react'
import { createGroup } from './api'

interface Props {
  onBack: () => void
  onCreated: (groupId: string) => void
}

export default function CreateGroupScreen({ onBack, onCreated }: Props) {
  const [groupName, setGroupName] = useState('')
  const [participants, setParticipants] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupName.trim() || !participants.trim()) return

    const phoneNumbers = participants
      .split(/[,\n]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    if (phoneNumbers.length === 0) {
      setError('Please enter at least one phone number')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const result = await createGroup(groupName.trim(), phoneNumbers)
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
            Participants (phone numbers)
            <textarea
              placeholder={"Enter phone numbers, one per line or comma-separated\ne.g. +1234567890, +0987654321"}
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              rows={4}
              disabled={creating || success}
              required
            />
            <span className="hint">Include country code (e.g. +1 for US).</span>
          </label>

          {error && <div className="status error">{error}</div>}
          {success && <div className="status success">Group created successfully!</div>}

          <div className="actions">
            <button type="submit" disabled={!groupName.trim() || !participants.trim() || creating || success}>
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
