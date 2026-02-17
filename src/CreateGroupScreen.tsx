import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { createGroup } from './api'
import type { Participant } from './api'

interface Props {
  onBack: () => void
  onCreated: (groupId: string) => void
  prefillParticipants?: Participant[]
  sourceGroupName?: string
}

export default function CreateGroupScreen({ onBack, onCreated, prefillParticipants, sourceGroupName }: Props) {
  const [groupName, setGroupName] = useState('')
  const [manualParticipants, setManualParticipants] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (prefillParticipants && prefillParticipants.length > 0) {
      const selected: Record<string, boolean> = {}
      prefillParticipants.forEach((p) => {
        selected[p.phone] = true
      })
      setSelectedMembers(selected)
    }
  }, [prefillParticipants])

  const toggleMember = (phone: string) => {
    setSelectedMembers((prev) => ({ ...prev, [phone]: !prev[phone] }))
  }

  const selectAll = () => {
    if (!prefillParticipants) return
    const selected: Record<string, boolean> = {}
    prefillParticipants.forEach((p) => {
      selected[p.phone] = true
    })
    setSelectedMembers(selected)
  }

  const deselectAll = () => {
    setSelectedMembers({})
  }

  const getSelectedCount = () => {
    return Object.values(selectedMembers).filter(Boolean).length
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return

    let phoneNumbers: string[] = []

    if (prefillParticipants) {
      phoneNumbers = prefillParticipants
        .filter((p) => selectedMembers[p.phone])
        .map((p) => p.phone)
    }

    const manualNumbers = manualParticipants
      .split(/[,\n]+/)
      .map((p) => p.trim().replace(/[^+\d]/g, ''))
      .filter((p) => p.length > 0)

    phoneNumbers = [...phoneNumbers, ...manualNumbers]
    const unique = [...new Set(phoneNumbers)]

    if (unique.length === 0) {
      setError('Please select or enter at least one participant')
      return
    }

    setCreating(true)
    setError(null)
    try {
      const result = await createGroup(groupName.trim(), unique)
      setSuccess(true)
      setTimeout(() => onCreated(result.id), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  const hasMembers = prefillParticipants && prefillParticipants.length > 0

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

        {hasMembers && sourceGroupName && (
          <div className="source-info">
            Creating from: <strong>{sourceGroupName}</strong> ({prefillParticipants!.length} members)
          </div>
        )}

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

          {hasMembers && (
            <div className="members-section">
              <div className="members-header">
                <span className="members-label">Members ({getSelectedCount()} of {prefillParticipants!.length} selected)</span>
                <div className="members-actions">
                  <button type="button" className="text-btn" onClick={selectAll} disabled={creating || success}>
                    All
                  </button>
                  <button type="button" className="text-btn" onClick={deselectAll} disabled={creating || success}>
                    None
                  </button>
                </div>
              </div>
              <div className="members-list">
                {prefillParticipants!.map((p) => (
                  <label key={p.phone} className="member-row">
                    <input
                      type="checkbox"
                      checked={!!selectedMembers[p.phone]}
                      onChange={() => toggleMember(p.phone)}
                      disabled={creating || success}
                    />
                    <span className="member-name">{p.name || p.phone}</span>
                    <span className="member-phone">{p.phone}</span>
                    {p.isAdmin && <span className="admin-badge">Admin</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label>
            {hasMembers ? 'Add more participants (optional)' : 'Participants (phone numbers)'}
            <textarea
              placeholder={"Enter phone numbers, one per line or comma-separated\ne.g. +1234567890, +0987654321"}
              value={manualParticipants}
              onChange={(e) => setManualParticipants(e.target.value)}
              rows={hasMembers ? 2 : 4}
              disabled={creating || success}
              required={!hasMembers}
            />
            <span className="hint">Include country code (e.g. +1 for US).</span>
          </label>

          {error && <div className="status error">{error}</div>}
          {success && <div className="status success">Group created successfully!</div>}

          <div className="actions">
            <button
              type="submit"
              disabled={!groupName.trim() || (getSelectedCount() === 0 && !manualParticipants.trim()) || creating || success}
            >
              {creating ? 'Creating...' : `Create Group${getSelectedCount() > 0 ? ` (${getSelectedCount()} members)` : ''}`}
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
