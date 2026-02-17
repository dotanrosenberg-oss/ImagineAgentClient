import { useState, useEffect } from 'react'
import type { GroupAction } from './groupActions'
import { getActionsForGroup, saveAction, deleteAction, generateId } from './groupActions'

interface Props {
  groupId: string
  onClose: () => void
  onExecuteAction: (action: GroupAction, message: string) => void
}

export default function GroupActionsPanel({ groupId, onClose, onExecuteAction }: Props) {
  const [actions, setActions] = useState<GroupAction[]>([])
  const [editing, setEditing] = useState<GroupAction | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [invokeAction, setInvokeAction] = useState<GroupAction | null>(null)
  const [invokeMessage, setInvokeMessage] = useState('')

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formApiUrl, setFormApiUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    setActions(getActionsForGroup(groupId))
  }, [groupId])

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormApiUrl('')
    setFormApiKey('')
    setShowApiKey(false)
    setEditing(null)
    setShowForm(false)
  }

  const openCreateForm = () => {
    resetForm()
    setShowForm(true)
  }

  const openEditForm = (action: GroupAction) => {
    setFormName(action.name)
    setFormDescription(action.description)
    setFormApiUrl(action.apiUrl)
    setFormApiKey(action.apiKey)
    setShowApiKey(false)
    setEditing(action)
    setShowForm(true)
  }

  const handleSave = () => {
    if (!formName.trim() || !formApiUrl.trim()) return

    const action: GroupAction = {
      id: editing ? editing.id : generateId(),
      name: formName.trim(),
      description: formDescription.trim(),
      apiUrl: formApiUrl.trim(),
      apiKey: formApiKey.trim(),
    }

    saveAction(groupId, action)
    setActions(getActionsForGroup(groupId))
    resetForm()
  }

  const handleDelete = (actionId: string) => {
    deleteAction(groupId, actionId)
    setActions(getActionsForGroup(groupId))
    setConfirmDelete(null)
  }

  const handleInvoke = () => {
    if (!invokeAction) return
    onExecuteAction(invokeAction, invokeMessage.trim())
    setInvokeAction(null)
    setInvokeMessage('')
  }

  if (invokeAction) {
    return (
      <div className="group-actions-panel">
        <div className="gap-header">
          <button className="gap-back-btn" onClick={() => { setInvokeAction(null); setInvokeMessage('') }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h3>{invokeAction.name}</h3>
        </div>
        <div className="gap-invoke">
          {invokeAction.description && (
            <p className="gap-invoke-desc">{invokeAction.description}</p>
          )}
          <label className="gap-label">
            Message (optional)
            <textarea
              className="gap-textarea"
              placeholder="Add a message related to this action..."
              value={invokeMessage}
              onChange={(e) => setInvokeMessage(e.target.value)}
              rows={3}
            />
          </label>
          <div className="gap-form-actions">
            <button className="gap-btn-secondary" onClick={() => { setInvokeAction(null); setInvokeMessage('') }}>Cancel</button>
            <button className="gap-btn-primary" onClick={handleInvoke}>
              Run Action
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (showForm) {
    return (
      <div className="group-actions-panel">
        <div className="gap-header">
          <button className="gap-back-btn" onClick={resetForm}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h3>{editing ? 'Edit Action' : 'New Action'}</h3>
        </div>

        <div className="gap-form">
          <label className="gap-label">
            Name
            <input
              type="text"
              className="gap-input"
              placeholder="e.g. Create Customer"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </label>

          <label className="gap-label">
            Description
            <textarea
              className="gap-textarea"
              placeholder="What does this action do?"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
            />
          </label>

          <label className="gap-label">
            API URL
            <input
              type="url"
              className="gap-input"
              placeholder="https://api.example.com/endpoint"
              value={formApiUrl}
              onChange={(e) => setFormApiUrl(e.target.value)}
            />
          </label>

          <label className="gap-label">
            API Key
            <div className="gap-api-key-row">
              <input
                type={showApiKey ? 'text' : 'password'}
                className="gap-input"
                placeholder="Your API key"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
              <button
                className="gap-toggle-vis"
                onClick={() => setShowApiKey(!showApiKey)}
                type="button"
              >
                {showApiKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <div className="gap-form-actions">
            <button className="gap-btn-secondary" onClick={resetForm}>Cancel</button>
            <button
              className="gap-btn-primary"
              onClick={handleSave}
              disabled={!formName.trim() || !formApiUrl.trim()}
            >
              {editing ? 'Save Changes' : 'Create Action'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group-actions-panel">
      <div className="gap-header">
        <button className="gap-back-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h3>Group Actions</h3>
        <button className="gap-add-btn" onClick={openCreateForm} title="Add new action">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {actions.length === 0 ? (
        <div className="gap-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b0b8c9" strokeWidth="1.5">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <p>No actions yet</p>
          <button className="gap-btn-primary" onClick={openCreateForm}>Add First Action</button>
        </div>
      ) : (
        <div className="gap-list">
          {actions.map((action) => (
            <div key={action.id} className="gap-action-card">
              <div className="gap-action-main" onClick={() => { setInvokeAction(action); setInvokeMessage('') }}>
                <div className="gap-action-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="gap-action-info">
                  <span className="gap-action-name">{action.name}</span>
                  {action.description && (
                    <span className="gap-action-desc">{action.description}</span>
                  )}
                  <span className="gap-action-url">{action.apiUrl}</span>
                </div>
              </div>
              <div className="gap-action-controls">
                <button
                  className="gap-action-ctrl-btn"
                  onClick={(e) => { e.stopPropagation(); openEditForm(action) }}
                  title="Edit"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                {confirmDelete === action.id ? (
                  <div className="gap-confirm-delete">
                    <button
                      className="gap-action-ctrl-btn gap-delete-yes"
                      onClick={(e) => { e.stopPropagation(); handleDelete(action.id) }}
                      title="Confirm delete"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      className="gap-action-ctrl-btn"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null) }}
                      title="Cancel"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    className="gap-action-ctrl-btn gap-delete-btn"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(action.id) }}
                    title="Delete"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
