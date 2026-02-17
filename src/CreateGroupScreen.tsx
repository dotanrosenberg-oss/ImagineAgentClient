import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { createGroup } from './api'
import type { Participant } from './api'

interface Props {
  onBack: () => void
  onCreated: (groupId: string) => void
  prefillParticipants?: Participant[]
  sourceGroupName?: string
}

const DEFAULT_PHOTO = '/default-group-photo.png'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function CreateGroupScreen({ onBack, onCreated, prefillParticipants, sourceGroupName }: Props) {
  const [groupName, setGroupName] = useState('')
  const [manualParticipants, setManualParticipants] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>(DEFAULT_PHOTO)
  const [useDefaultPhoto, setUseDefaultPhoto] = useState(true)
  const [allowSendMessages, setAllowSendMessages] = useState(true)
  const [allowAddMembers, setAllowAddMembers] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (prefillParticipants && prefillParticipants.length > 0) {
      const selected: Record<string, boolean> = {}
      prefillParticipants.forEach((p) => {
        selected[p.phone] = true
      })
      setSelectedMembers(selected)
    }
  }, [prefillParticipants])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be smaller than 5MB')
        return
      }
      setPhotoFile(file)
      setUseDefaultPhoto(false)
      const url = URL.createObjectURL(file)
      setPhotoPreview(url)
    }
  }

  const removePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(DEFAULT_PHOTO)
    setUseDefaultPhoto(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
      let photoBase64: string | undefined
      if (photoFile) {
        photoBase64 = await fileToBase64(photoFile)
      } else if (useDefaultPhoto) {
        const resp = await fetch(DEFAULT_PHOTO)
        const blob = await resp.blob()
        const defaultFile = new File([blob], 'default.png', { type: 'image/png' })
        photoBase64 = await fileToBase64(defaultFile)
      }

      const settings = {
        sendMessages: allowSendMessages,
        addMembers: allowAddMembers,
      }
      const result = await createGroup(groupName.trim(), unique, photoBase64, settings)
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
            Creating group with: <strong>{sourceGroupName}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form">
          <div className="photo-upload-section">
            <div className="photo-preview-wrapper" onClick={() => !creating && !success && fileInputRef.current?.click()}>
              <img src={photoPreview} alt="Group photo" className="photo-preview" />
              <div className="photo-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            </div>
            <div className="photo-actions">
              <span className="photo-label">{useDefaultPhoto ? 'Default photo' : photoFile?.name}</span>
              {!useDefaultPhoto && (
                <button type="button" className="text-btn" onClick={removePhoto} disabled={creating || success}>
                  Reset to default
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={{ display: 'none' }}
            />
          </div>

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

          <div className="group-settings-section">
            <div className="group-settings-header">Group Settings</div>
            <label className="toggle-row">
              <span className="toggle-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Allow members to send messages
              </span>
              <div
                className={`toggle-switch ${allowSendMessages ? 'active' : ''}`}
                onClick={() => !creating && !success && setAllowSendMessages(!allowSendMessages)}
              >
                <div className="toggle-knob" />
              </div>
            </label>
            <label className="toggle-row">
              <span className="toggle-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Allow members to add others
              </span>
              <div
                className={`toggle-switch ${allowAddMembers ? 'active' : ''}`}
                onClick={() => !creating && !success && setAllowAddMembers(!allowAddMembers)}
              >
                <div className="toggle-knob" />
              </div>
            </label>
          </div>

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
