import { useState, useEffect, useRef, useMemo } from 'react'
import type { FormEvent } from 'react'
import heic2any from 'heic2any'
import { QRCodeSVG } from 'qrcode.react'
import { createGroup, setGroupImage, fetchChat, checkNumber, getGroupJoinUrl, friendlyErrorMessage } from './api'
import type { Participant, GroupCreateResult } from './api'

interface Props {
  onBack: () => void
  onCreated: (groupId: string) => void
  prefillParticipants?: Participant[]
  sourceGroupName?: string
}

const DEFAULT_PHOTO = '/default-group-photo.png'

interface NumberValidation {
  phone: string
  registered: boolean | null
  checking: boolean
}

function formatPhone(raw: string): string {
  let num = raw.replace(/@.*$/, '').replace(/[^+\d]/g, '')
  if (!num.startsWith('+')) num = '+' + num
  return num
}

export default function CreateGroupScreen({ onBack, onCreated, prefillParticipants: rawPrefill, sourceGroupName }: Props) {
  const prefillParticipants = useMemo(() =>
    rawPrefill?.map(p => ({
      ...p,
      phone: formatPhone(p.phone),
    })),
    [rawPrefill]
  )
  const defaultGroupName = sourceGroupName ? `Imagine Travel - ${sourceGroupName}` : ''
  const [groupName, setGroupName] = useState(defaultGroupName)
  const [userEditedName, setUserEditedName] = useState(false)

  useEffect(() => {
    if (sourceGroupName && !userEditedName) {
      setGroupName(`Imagine Travel - ${sourceGroupName}`)
    }
  }, [sourceGroupName, userEditedName])
  const [manualParticipants, setManualParticipants] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [creatingStatus, setCreatingStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [createdGroupInfo, setCreatedGroupInfo] = useState<GroupCreateResult | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string>(DEFAULT_PHOTO)
  const [useDefaultPhoto, setUseDefaultPhoto] = useState(true)
  const [allowSendMessages, setAllowSendMessages] = useState(true)
  const [allowAddMembers, setAllowAddMembers] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [validating, setValidating] = useState(false)
  const [validationResults, setValidationResults] = useState<NumberValidation[]>([])
  const [validationDone, setValidationDone] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLinkError, setInviteLinkError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (prefillParticipants && prefillParticipants.length > 0) {
      const selected: Record<string, boolean> = {}
      prefillParticipants.forEach((p) => {
        selected[p.phone] = true
      })
      setSelectedMembers(selected)
    }
  }, [prefillParticipants])

  const convertToJpg = async (file: File): Promise<File> => {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)
    let sourceBlob: Blob = file

    if (isHeic) {
      const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
      sourceBlob = Array.isArray(result) ? result[0] : result
    }

    const baseName = file.name.replace(/\.[^.]+$/, '')

    if (!isHeic) {
      return new Promise((resolve) => {
        const img = new window.Image()
        const url = URL.createObjectURL(sourceBlob)
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          if (!ctx) { URL.revokeObjectURL(url); resolve(file); return }
          ctx.drawImage(img, 0, 0)
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url)
            if (!blob) { resolve(file); return }
            resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }))
          }, 'image/jpeg', 0.9)
        }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
        img.src = url
      })
    }

    return new File([sourceBlob], `${baseName}.jpg`, { type: 'image/jpeg' })
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/') && !file.name.toLowerCase().match(/\.(heic|heif)$/)) {
        setError('Please select an image file')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be smaller than 5MB')
        return
      }
      const needsConvert = !file.type || file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().match(/\.(heic|heif)$/)
      let finalFile = file
      if (needsConvert) {
        try {
          finalFile = await convertToJpg(file)
        } catch {
          setError('Could not convert this image. Please use a JPG or PNG file instead.')
          return
        }
      }
      setPhotoFile(finalFile)
      setUseDefaultPhoto(false)
      const url = URL.createObjectURL(finalFile)
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
    setValidationDone(false)
    setValidationResults([])
  }

  const selectAll = () => {
    if (!prefillParticipants) return
    const selected: Record<string, boolean> = {}
    prefillParticipants.forEach((p) => {
      selected[p.phone] = true
    })
    setSelectedMembers(selected)
    setValidationDone(false)
    setValidationResults([])
  }

  const deselectAll = () => {
    setSelectedMembers({})
    setValidationDone(false)
    setValidationResults([])
  }

  const getManualCount = () => {
    return manualParticipants
      .split(/[,;\n]+/)
      .map((p) => p.trim().replace(/[^+\d]/g, ''))
      .filter((p) => p.length > 1)
      .length
  }

  const getSelectedCount = () => {
    return Object.values(selectedMembers).filter(Boolean).length
  }

  const getTotalCount = () => {
    return getSelectedCount() + getManualCount()
  }

  const getAllPhoneNumbers = (): string[] => {
    let phoneNumbers: string[] = []

    if (prefillParticipants) {
      phoneNumbers = prefillParticipants
        .filter((p) => selectedMembers[p.phone])
        .map((p) => p.phone)
    }

    const manualNumbers = manualParticipants
      .split(/[,;\n]+/)
      .map((p) => {
        let num = p.trim().replace(/[^+\d]/g, '')
        if (!num) return ''
        if (!num.startsWith('+')) num = '+' + num
        return num
      })
      .filter((p) => p.length > 1)

    phoneNumbers = [...phoneNumbers, ...manualNumbers]
    return [...new Set(phoneNumbers)]
  }

  const validateNumbers = async (numbers: string[]): Promise<NumberValidation[]> => {
    setValidating(true)
    setError(null)
    const results: NumberValidation[] = numbers.map(phone => ({
      phone,
      registered: null,
      checking: true,
    }))
    setValidationResults([...results])

    for (let i = 0; i < numbers.length; i++) {
      try {
        const result = await checkNumber(numbers[i])
        results[i] = {
          phone: numbers[i],
          registered: result?.registered ?? null,
          checking: false,
        }
      } catch {
        results[i] = {
          phone: numbers[i],
          registered: null,
          checking: false,
        }
      }
      setValidationResults([...results])
    }

    setValidating(false)
    setValidationDone(true)
    return results
  }

  const removeInvalidNumber = (phone: string) => {
    if (prefillParticipants?.find(p => p.phone === phone)) {
      setSelectedMembers(prev => ({ ...prev, [phone]: false }))
    } else {
      const lines = manualParticipants.split(/[,;\n]+/).map(l => l.trim()).filter(Boolean)
      const remaining = lines.filter(l => {
        let num = l.replace(/[^+\d]/g, '')
        if (!num.startsWith('+')) num = '+' + num
        return num !== phone
      })
      setManualParticipants(remaining.join(', '))
    }
    setValidationResults(prev => prev.filter(v => v.phone !== phone))
  }

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    const nameToUse = groupName.trim() || defaultGroupName
    if (!nameToUse) return

    const unique = getAllPhoneNumbers()

    if (unique.length === 0) {
      setError('Please select or enter at least one participant')
      return
    }

    const invalidNumbers = unique.filter(n => !n.startsWith('+') || n.length < 8)
    if (invalidNumbers.length > 0) {
      setError(`These numbers look invalid: ${invalidNumbers.join(', ')}. Numbers must start with + and include the country code (e.g. +16468774479).`)
      return
    }

    if (!validationDone) {
      const results = await validateNumbers(unique)
      const unregistered = results.filter(r => r.registered === false)
      if (unregistered.length > 0) {
        return
      }
    }

    const unregistered = validationResults.filter(r => r.registered === false)
    if (unregistered.length > 0) {
      const proceed = window.confirm(
        `${unregistered.length} number${unregistered.length > 1 ? 's' : ''} may not be on WhatsApp:\n${unregistered.map(r => r.phone).join('\n')}\n\nDo you want to create the group anyway?`
      )
      if (!proceed) return
    }

    setCreating(true)
    setError(null)
    setCreatingStatus('Creating group on WhatsApp...')
    try {
      const result = await createGroup(nameToUse, unique)
      setCreatedGroupInfo(result)

      const groupId = result.groupId || result.id
      if (!groupId) {
        setSuccess(true)
        setCreating(false)
        setCreatingStatus('Group created, but we couldn\'t get the group details. Head back to your chats to find it.')
        return
      }

      setCreatingStatus('Confirming group was created...')
      let confirmed = false
      const maxAttempts = 6
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await new Promise(r => setTimeout(r, 2000))
          await fetchChat(groupId)
          confirmed = true
          break
        } catch {
          if (attempt < maxAttempts) {
            setCreatingStatus(`Waiting for group to appear... (attempt ${attempt + 1}/${maxAttempts})`)
          }
        }
      }

      let iconFile: File | undefined
      if (photoFile) {
        iconFile = photoFile
      } else if (useDefaultPhoto) {
        try {
          const resp = await fetch(DEFAULT_PHOTO)
          const blob = await resp.blob()
          iconFile = new File([blob], 'default.png', { type: 'image/png' })
        } catch { /* ignore default photo fetch failure */ }
      }

      if (iconFile && groupId) {
        setCreatingStatus('Setting group photo...')
        try {
          await setGroupImage(groupId, iconFile)
        } catch {
          /* group photo is optional — don't fail the whole creation */
        }
      }

      setCreatingStatus('Getting invite link...')
      try {
        const joinResult = await getGroupJoinUrl(groupId)
        if (joinResult?.joinUrl) {
          setInviteLink(joinResult.joinUrl)
        }
      } catch {
        setInviteLinkError('Invite link not available for this group yet.')
      }

      setSuccess(true)
      setCreating(false)
      setCreatingStatus(confirmed ? 'Group created and confirmed!' : 'Group created! It may take a moment to appear in your chat list.')
    } catch (err) {
      setError(friendlyErrorMessage(err instanceof Error ? err.message : 'Failed to create group'))
      setCreating(false)
      setCreatingStatus('')
    }
  }

  const copyInviteLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = inviteLink
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    }
  }

  const hasMembers = prefillParticipants && prefillParticipants.length > 0
  const unregisteredCount = validationResults.filter(r => r.registered === false).length
  const unknownCount = validationResults.filter(r => r.registered === null && !r.checking).length

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

        {hasMembers && sourceGroupName && !success && !creating && (
          <div className="express-create-section">
            <div className="express-create-info">
              <span className="express-label">Quick create:</span>
              <strong>{defaultGroupName}</strong>
              <span className="express-members">{getTotalCount()} member{getTotalCount() !== 1 ? 's' : ''}</span>
            </div>
            <button
              type="button"
              className="express-create-btn"
              onClick={() => handleSubmit()}
              disabled={getTotalCount() === 0}
            >
              Create Now
            </button>
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
              accept="image/*,.heic,.heif"
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
              onChange={(e) => { setGroupName(e.target.value); setUserEditedName(true) }}
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
                {prefillParticipants!.map((p) => {
                  const vr = validationResults.find(v => v.phone === p.phone)
                  return (
                    <label key={p.phone} className={`member-row ${vr?.registered === false ? 'member-invalid' : ''}`}>
                      <input
                        type="checkbox"
                        checked={!!selectedMembers[p.phone]}
                        onChange={() => toggleMember(p.phone)}
                        disabled={creating || success}
                      />
                      <span className="member-name">{p.name || p.phone}</span>
                      <span className="member-phone">{p.phone}</span>
                      {p.isAdmin && <span className="admin-badge">Admin</span>}
                      {vr?.checking && <span className="validation-badge checking">Checking...</span>}
                      {vr?.registered === true && <span className="validation-badge valid">On WhatsApp</span>}
                      {vr?.registered === false && (
                        <>
                          <span className="validation-badge invalid">Not on WhatsApp</span>
                          <button type="button" className="remove-invalid-btn" onClick={(e) => { e.preventDefault(); removeInvalidNumber(p.phone) }} title="Remove">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <label>
            {hasMembers ? 'Add more participants (optional)' : 'Participants (phone numbers)'}
            <textarea
              placeholder={"Enter phone numbers, one per line or comma-separated\ne.g. +1234567890, +0987654321"}
              value={manualParticipants}
              onChange={(e) => { setManualParticipants(e.target.value); setValidationDone(false); setValidationResults([]) }}
              rows={hasMembers ? 2 : 4}
              disabled={creating || success}
              required={!hasMembers}
            />
            <span className="hint">Include country code (e.g. +1 for US). Separate with commas, semicolons, or new lines.</span>
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

          {validating && (
            <div className="status creating">
              <div className="creating-spinner" />
              Checking phone numbers...
            </div>
          )}

          {validationDone && validationResults.length > 0 && !creating && !success && (
            <div className="validation-summary">
              {unregisteredCount > 0 && (
                <div className="validation-warning">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <strong>{unregisteredCount} number{unregisteredCount > 1 ? 's' : ''} not found on WhatsApp</strong>
                    <div className="validation-warning-list">
                      {validationResults.filter(r => r.registered === false).map(r => (
                        <div key={r.phone} className="validation-warning-item">
                          <span>{r.phone}</span>
                          <button type="button" className="text-btn validation-remove-btn" onClick={() => removeInvalidNumber(r.phone)}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <span className="validation-note">You can remove them or continue anyway — they can join later via invite link.</span>
                  </div>
                </div>
              )}
              {unregisteredCount === 0 && unknownCount === 0 && (
                <div className="validation-success">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  All numbers verified on WhatsApp
                </div>
              )}
            </div>
          )}

          {error && <div className="status error">{error}</div>}

          {creating && (
            <div className="status creating">
              <div className="creating-spinner" />
              {creatingStatus}
            </div>
          )}

          {success && createdGroupInfo && (
            <div className="group-created-confirmation">
              <div className="status success">{creatingStatus}</div>
              <div className="created-group-details">
                <div className="created-group-row">
                  <span className="created-group-label">Group Name</span>
                  <span className="created-group-value">{createdGroupInfo.chat?.name || createdGroupInfo.groupName || groupName}</span>
                </div>
                <div className="created-group-row">
                  <span className="created-group-label">Group ID</span>
                  <span className="created-group-value created-group-id">{createdGroupInfo.groupId || createdGroupInfo.id}</span>
                </div>
              </div>

              {inviteLink && (
                <div className="invite-section">
                  <div className="invite-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span>Invite Link</span>
                  </div>
                  <div className="invite-link-row">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className="invite-link-input"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button type="button" className="invite-copy-btn" onClick={copyInviteLink}>
                      {linkCopied ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                      {linkCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="invite-qr-section">
                    <QRCodeSVG value={inviteLink} size={160} level="M" />
                    <span className="invite-qr-label">Scan to join group</span>
                  </div>
                </div>
              )}

              {inviteLinkError && (
                <div className="invite-section invite-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{inviteLinkError}</span>
                </div>
              )}

              <button
                type="button"
                className="go-to-chats-btn"
                onClick={() => onCreated(createdGroupInfo.groupId || createdGroupInfo.id)}
              >
                Go to Chats
              </button>
            </div>
          )}

          {success && !createdGroupInfo && (
            <div className="group-created-confirmation">
              <div className="status success">{creatingStatus || 'Group created!'}</div>
              <button type="button" className="go-to-chats-btn" onClick={onBack}>
                Back to Chats
              </button>
            </div>
          )}

          {!success && (
            <div className="actions">
              <button
                type="submit"
                disabled={(!groupName.trim() && !defaultGroupName) || getTotalCount() === 0 || creating || success || validating}
              >
                {validating ? 'Checking...' : creating ? 'Creating...' : `Create Group${getTotalCount() > 0 ? ` (${getTotalCount()} members)` : ''}`}
              </button>
              <button type="button" className="secondary" onClick={onBack} disabled={creating || validating}>
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
