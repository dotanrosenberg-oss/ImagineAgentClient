import { useState, useEffect } from 'react'
import type { GroupAction } from './groupActions'
import { getActions, saveAction, deleteAction, generateId } from './groupActions'

interface Props {
  onBack: () => void
}

export default function SettingsScreen({ onBack }: Props) {
  const [actions, setActions] = useState<GroupAction[]>([])
  const [editing, setEditing] = useState<GroupAction | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formApiUrl, setFormApiUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formApiDocUrl, setFormApiDocUrl] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    setActions(getActions())
  }, [])

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormApiUrl('')
    setFormApiKey('')
    setFormApiDocUrl('')
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
    setFormApiDocUrl(action.apiDocUrl || '')
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
      apiDocUrl: formApiDocUrl.trim(),
    }

    saveAction(action)
    setActions(getActions())
    resetForm()
  }

  const handleDelete = (actionId: string) => {
    deleteAction(actionId)
    setActions(getActions())
    setConfirmDelete(null)
  }

  return (
    <div className="settings-layout">
      <div className="settings-card">
        <div className="settings-header">
          <button className="back-btn settings-back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h2>Settings</h2>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <h3>Group Actions</h3>
            <p className="settings-section-hint">Actions available in all group chats via the "..." menu</p>
          </div>

          {showForm ? (
            <div className="settings-form">
              <div className="settings-form-title">{editing ? 'Edit Action' : 'New Action'}</div>
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
                API Doc URL
                <input
                  type="url"
                  className="gap-input"
                  placeholder="https://docs.example.com/api"
                  value={formApiDocUrl}
                  onChange={(e) => setFormApiDocUrl(e.target.value)}
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
          ) : (
            <>
              {actions.length === 0 ? (
                <div className="settings-empty">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#b0b8c9" strokeWidth="1.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <p>No actions configured yet</p>
                  <button className="gap-btn-primary" onClick={openCreateForm}>Add First Action</button>
                </div>
              ) : (
                <div className="settings-actions-list">
                  {actions.map((action) => (
                    <div key={action.id} className="gap-action-card">
                      <div className="gap-action-main" onClick={() => openEditForm(action)} style={{ cursor: 'pointer' }}>
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
                          onClick={() => openEditForm(action)}
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
                              onClick={() => handleDelete(action.id)}
                              title="Confirm delete"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </button>
                            <button
                              className="gap-action-ctrl-btn"
                              onClick={() => setConfirmDelete(null)}
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
                            onClick={() => setConfirmDelete(action.id)}
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
                  <button className="settings-add-btn" onClick={openCreateForm}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Action
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
