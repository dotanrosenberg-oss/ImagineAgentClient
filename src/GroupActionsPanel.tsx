import { useState, useEffect } from 'react'
import type { GroupAction } from './groupActions'
import { getActions } from './groupActions'
import type { Message } from './api'

interface ContextMessage {
  id: string
  body: string
  timestamp: string
  fromName?: string
  isFromMe: boolean
}

interface Props {
  chatMessages: Message[]
  onClose: () => void
  onExecuteAction: (action: GroupAction, message: string, contextMessages: ContextMessage[]) => void
}

export default function GroupActionsPanel({ chatMessages, onClose, onExecuteAction }: Props) {
  const [actions, setActions] = useState<GroupAction[]>([])
  const [invokeAction, setInvokeAction] = useState<GroupAction | null>(null)
  const [invokeMessage, setInvokeMessage] = useState('')
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setActions(getActions())
  }, [])

  const recentMessages = chatMessages
    .filter((m) => m.body && m.body.trim())
    .slice(-30)

  const toggleMsg = (msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const cancelInvoke = () => {
    setInvokeAction(null)
    setInvokeMessage('')
    setSelectedMsgIds(new Set())
  }

  const handleInvoke = () => {
    if (!invokeAction) return
    const selected = recentMessages
      .filter((m) => selectedMsgIds.has(m.id))
      .map((m) => ({
        id: m.id,
        body: m.body,
        timestamp: m.timestamp,
        fromName: m.fromName,
        isFromMe: m.isFromMe,
      }))
    onExecuteAction(invokeAction, invokeMessage.trim(), selected)
    cancelInvoke()
  }

  const formatMsgTime = (ts: string | number) => {
    const d = typeof ts === 'number' ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (invokeAction) {
    return (
      <div className="group-actions-panel">
        <div className="gap-header">
          <button className="gap-back-btn" onClick={cancelInvoke}>
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

          {recentMessages.length > 0 && (
            <div className="gap-context-section">
              <span className="gap-context-label">
                Include messages for context
                {selectedMsgIds.size > 0 && (
                  <span className="gap-context-count">{selectedMsgIds.size} selected</span>
                )}
              </span>
              <div className="gap-context-list">
                {recentMessages.map((msg) => (
                  <label key={msg.id} className={`gap-context-msg ${selectedMsgIds.has(msg.id) ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedMsgIds.has(msg.id)}
                      onChange={() => toggleMsg(msg.id)}
                    />
                    <div className="gap-context-msg-content">
                      <div className="gap-context-msg-header">
                        <span className="gap-context-msg-author">
                          {msg.isFromMe ? 'You' : (msg.fromName || 'Unknown')}
                        </span>
                        <span className="gap-context-msg-time">{formatMsgTime(msg.timestamp)}</span>
                      </div>
                      <span className="gap-context-msg-body">{msg.body}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
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
            <button className="gap-btn-secondary" onClick={cancelInvoke}>Cancel</button>
            <button className="gap-btn-primary" onClick={handleInvoke}>
              Run Action
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
      </div>

      {actions.length === 0 ? (
        <div className="gap-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b0b8c9" strokeWidth="1.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <p>No actions configured</p>
          <p className="gap-empty-hint">Go to Settings to add actions</p>
        </div>
      ) : (
        <div className="gap-list">
          {actions.map((action) => (
            <div key={action.id} className="gap-action-card">
              <div className="gap-action-main" onClick={() => { setInvokeAction(action); setInvokeMessage(''); setSelectedMsgIds(new Set()) }}>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
