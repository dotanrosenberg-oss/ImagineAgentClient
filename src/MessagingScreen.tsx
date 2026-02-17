import { useState, useEffect, useRef, useCallback } from 'react'
import type { Chat, Message, HealthStatus } from './api'
import { fetchChats, fetchMessages, fetchWhatsAppMessages, sendMessage, sendMessageWithAttachment, checkHealth, syncChats } from './api'
import { connectWebSocket, disconnectWebSocket, onWSMessage } from './websocket'
import GroupActionsPanel from './GroupActionsPanel'
import ChatActionsPanel from './ChatActionsPanel'
import type { GroupAction } from './groupActions'

interface Props {
  onCreateGroup: () => void
  onSettings: () => void
}

export default function MessagingScreen({ onCreateGroup, onSettings }: Props) {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterUnread, setFilterUnread] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [loadedPics, setLoadedPics] = useState<Set<string>>(new Set())
  const [failedPics, setFailedPics] = useState<Set<string>>(new Set())
  const [showActionsPanel, setShowActionsPanel] = useState(false)
  const [showChatActionsPanel, setShowChatActionsPanel] = useState(false)
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string; actionName: string; responseData?: Record<string, unknown> } | null>(null)
  const [executingAction, setExecutingAction] = useState(false)
  const [executingActionName, setExecutingActionName] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedChatRef = useRef<Chat | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    selectedChatRef.current = selectedChat
  }, [selectedChat])

  useEffect(() => {
    loadHealth()
    loadChats()
    connectWebSocket()

    const unsubscribe = onWSMessage((msg) => {
      if (msg.type === 'message' && msg.data) {
        const incomingChatId = (msg.data.chatId || msg.chat?.id) as string
        setChats((prev) =>
          prev.map((c) =>
            c.id === incomingChatId
              ? { ...c, lastMessage: msg.data.body as string, lastMessageTime: msg.data.timestamp as string }
              : c
          )
        )
        if (selectedChatRef.current?.id === incomingChatId) {
          setMessages((prev) => [
            ...prev,
            {
              id: msg.data.id as string,
              body: msg.data.body as string,
              timestamp: msg.data.timestamp as string,
              isFromMe: msg.data.isFromMe as boolean,
              fromPhone: msg.data.fromPhone as string | undefined,
              fromName: msg.data.fromName as string | undefined,
              hasMedia: msg.data.hasMedia as boolean,
              messageType: msg.data.messageType as string,
            },
          ])
        }
      } else if (msg.type === 'chat_update' && msg.data) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === (msg.data.id as string)
              ? { ...c, name: (msg.data.name as string) || c.name, lastMessage: msg.data.lastMessage as string, lastMessageTime: msg.data.lastMessageTime as string }
              : c
          )
        )
      } else if (msg.type === 'chats_synced') {
        loadChats()
      } else if (msg.type === 'service_unavailable') {
        setHealth((prev) =>
          prev ? { ...prev, whatsapp: { ...prev.whatsapp, status: 'disconnected' } } : prev
        )
      }
    })

    return () => {
      unsubscribe()
      disconnectWebSocket()
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHealth = async () => {
    try {
      const data = await checkHealth()
      setHealth(data)
    } catch {
      /* silent */
    }
  }

  const loadChats = async () => {
    setLoading(true)
    setChatError(null)
    try {
      const data = await fetchChats()
      setChats(data)
      setFailedPics(new Set())
      setLoadedPics(new Set())
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to load chats')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setChatError(null)
    try {
      const data = await syncChats()
      setChats(data)
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to sync')
    } finally {
      setSyncing(false)
    }
  }

  const openChat = useCallback(async (chat: Chat) => {
    setSelectedChat(chat)
    setShowActions(false)
    setShowActionsPanel(false)
    setShowChatActionsPanel(false)
    setActionResult(null)
    setLoadingMessages(true)
    setMsgError(null)
    try {
      let data = await fetchMessages(chat.id)
      if (data.length === 0) {
        data = await fetchWhatsAppMessages(chat.id, 100)
      }
      setMessages(data)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Failed to load messages')
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const MAX_FILE_SIZE = 100 * 1024 * 1024

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }


  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setMsgError(`File too large (${formatFileSize(file.size)}). Maximum is 100 MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setAttachmentFile(file)
    setMsgError(null)
  }

  const removeAttachment = () => {
    setAttachmentFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = async () => {
    if ((!newMessage.trim() && !attachmentFile) || !selectedChat || sending) return
    setSending(true)
    setUploadProgress(attachmentFile ? 'Preparing file...' : null)
    try {
      if (attachmentFile) {
        setUploadProgress('Uploading...')
        await sendMessageWithAttachment(
          selectedChat.id,
          attachmentFile,
          newMessage
        )
        setAttachmentFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        await sendMessage(selectedChat.id, newMessage.trim())
      }
      setNewMessage('')
      setUploadProgress(null)
      let data = await fetchMessages(selectedChat.id)
      if (data.length === 0) {
        data = await fetchWhatsAppMessages(selectedChat.id, 100)
      }
      setMessages(data)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send message'
      if (errMsg.includes('413') || errMsg.toLowerCase().includes('too large') || errMsg.toLowerCase().includes('payload')) {
        setMsgError('File is too large for the server. Try a smaller file.')
      } else {
        setMsgError(errMsg)
      }
      setUploadProgress(null)
    } finally {
      setSending(false)
    }
  }

  const parseTimestamp = (ts: string | number): Date => {
    if (typeof ts === 'number') {
      return new Date(ts < 1e12 ? ts * 1000 : ts)
    }
    return new Date(ts)
  }

  const formatTime = (ts: string | number) => {
    const d = parseTimestamp(ts)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (ts: string | number) => {
    const d = parseTimestamp(ts)
    if (isNaN(d.getTime())) return ''
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'Today'
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString()
  }

  const handleExecuteAction = async (action: GroupAction, message: string, contextMessages: { id: string; body: string; timestamp: string; fromName?: string; isFromMe: boolean }[]) => {
    if (executingAction) return
    setExecutingAction(true)
    setExecutingActionName(action.name)
    setActionResult(null)
    try {
      const descriptionParts: string[] = []
      if (message) descriptionParts.push(message)
      if (contextMessages.length > 0) {
        descriptionParts.push('\n--- Context Messages ---')
        contextMessages.forEach((m) => {
          const author = m.isFromMe ? 'You' : (m.fromName || 'Unknown')
          descriptionParts.push(`[${author}]: ${m.body}`)
        })
      }
      descriptionParts.push(`\nChat: ${selectedChat?.name || ''} (${selectedChat?.id || ''})`)

      const payload: Record<string, unknown> = {
        title: `${action.name} - ${selectedChat?.name || 'Unknown'}`,
        projectId: action.projectId || 1,
        description: descriptionParts.join('\n'),
        status: 'todo',
        priority: 'medium',
      }

      const response = await fetch('/local-api/actions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: action.id, payload }),
      })

      const result = await response.json()
      if (response.ok) {
        setActionResult({ success: true, message: `"${action.name}" executed successfully`, actionName: action.name, responseData: result })
      } else {
        const msg = result.message || result.error || `Error (${response.status})`
        setActionResult({ success: false, message: msg, actionName: action.name, responseData: result })
      }
    } catch (err) {
      setActionResult({ success: false, message: err instanceof Error ? err.message : 'Failed to execute action', actionName: action.name })
    } finally {
      setExecutingAction(false)
      setExecutingActionName('')
    }
  }

  const statusColor = health?.whatsapp?.status === 'ready' ? '#22c55e' : '#ef4444'
  const statusText = health
    ? `${health.whatsapp.name} (${health.whatsapp.phoneNumber}) - ${health.whatsapp.status}`
    : 'Connecting...'

  const isDirectChat = (chat: Chat) => chat.type === 'direct' || chat.type === 'contact' || chat.id?.endsWith('@c.us')

  const avatarColors = [
    '#e17076', '#7bc862', '#6ec9cb', '#65aadd', '#ee7aae',
    '#faa774', '#a695e7', '#e5ca77', '#85c1e9', '#82e0aa',
  ]

  const getAvatarColor = (id: string) => {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
    return avatarColors[Math.abs(hash) % avatarColors.length]
  }

  const getInitials = (name: string | undefined) => {
    if (!name) return '?'
    const clean = name.replace(/^&/, '').trim()
    if (!clean) return '?'
    const parts = clean.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return clean.slice(0, 2).toUpperCase()
  }

  const proxyPicUrl = (url: string | undefined) => {
    if (!url) return undefined
    return `/local-api/image-proxy?url=${encodeURIComponent(url)}`
  }

  const chatAvatar = (chat: Chat) => {
    const picUrl = proxyPicUrl(chat.profilePicUrl)
    const hasFailed = failedPics.has(chat.id)
    const hasLoaded = loadedPics.has(chat.id)

    return (
      <>
        <span
          className="chat-avatar-initials"
          style={{
            background: getAvatarColor(chat.id),
            display: (picUrl && hasLoaded) ? 'none' : 'flex',
          }}
        >
          {getInitials(chat.name)}
        </span>
        {picUrl && !hasFailed && (
          <img
            src={picUrl}
            alt=""
            className="chat-avatar-img"
            style={{ display: hasLoaded ? 'block' : 'none' }}
            onLoad={() => {
              setLoadedPics(prev => new Set(prev).add(chat.id))
            }}
            onError={() => {
              setFailedPics(prev => new Set(prev).add(chat.id))
            }}
          />
        )}
      </>
    )
  }

  return (
    <div className="messaging-layout">
      <div className={`chat-sidebar ${selectedChat ? 'hidden-mobile' : ''}`}>
        <div className="status-bar">
          <span className="status-dot" style={{ background: statusColor }} />
          <span className="status-text">{statusText}</span>
        </div>
        <div className="sidebar-header">
          <h2>Chats</h2>
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={handleSync} title="Sync chats from WhatsApp" disabled={syncing}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </button>
            <button className="icon-btn" onClick={onCreateGroup} title="Create group">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="23" y1="11" x2="17" y2="11" />
                <line x1="20" y1="8" x2="20" y2="14" />
              </svg>
            </button>
            <button className="icon-btn" onClick={onSettings} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="search-bar">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="filter-bar">
          <button
            className={`filter-chip ${!filterUnread ? 'active' : ''}`}
            onClick={() => setFilterUnread(false)}
          >
            All
          </button>
          <button
            className={`filter-chip ${filterUnread ? 'active' : ''}`}
            onClick={() => setFilterUnread(true)}
          >
            Unread
            {(() => { const count = chats.filter(c => (c.unreadCount || 0) > 0).length; return count > 0 ? ` (${count})` : '' })()}
          </button>
        </div>

        {syncing && <div className="loading-state">Syncing chats from WhatsApp...</div>}
        {loading && !syncing && <div className="loading-state">Loading chats...</div>}
        {chatError && <div className="error-state">{chatError}</div>}

        <div className="chat-list">
          {chats
            .filter((chat) => {
              if (filterUnread && !(chat.unreadCount && chat.unreadCount > 0)) return false
              if (!searchQuery.trim()) return true
              const q = searchQuery.toLowerCase()
              return chat.name?.toLowerCase().includes(q) || chat.lastMessage?.toLowerCase().includes(q)
            })
            .sort((a, b) => {
              if (!a.lastMessageTime && !b.lastMessageTime) return 0
              if (!a.lastMessageTime) return 1
              if (!b.lastMessageTime) return -1
              return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
            })
            .map((chat) => (
            <button
              key={chat.id}
              className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
              onClick={() => openChat(chat)}
            >
              <div className="chat-avatar">
                {chatAvatar(chat)}
              </div>
              <div className="chat-info">
                <div className="chat-name-row">
                  <span className="chat-name">{chat.name}</span>
                  {chat.lastMessageTime && (
                    <span className="chat-time">{formatTime(chat.lastMessageTime)}</span>
                  )}
                </div>
                <div className="chat-bottom-row">
                  {chat.lastMessage && (
                    <p className="chat-preview">{chat.lastMessage}</p>
                  )}
                  {(chat.unreadCount ?? 0) > 0 && (
                    <span className="unread-badge">{chat.unreadCount}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
          {!loading && !syncing && chats.length === 0 && !chatError && (
            <div className="empty-state">
              <p>No chats found</p>
              <button className="sync-btn" onClick={handleSync}>
                Sync from WhatsApp
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`message-panel ${!selectedChat ? 'hidden-mobile' : ''}`}>
        {!selectedChat ? (
          <div className="no-chat-selected">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#b0b8c9" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>Select a chat to view messages</p>
          </div>
        ) : (
          <>
            <div className="message-header">
              <button className="back-btn" onClick={() => setSelectedChat(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="header-chat-info">
                <h3>{selectedChat.name}</h3>
                <span className="chat-type-tag">{isDirectChat(selectedChat) ? 'Direct' : 'Group'}</span>
              </div>
              <div className="header-actions">
                <button
                  className="icon-btn"
                  onClick={() => setShowActions(!showActions)}
                  title="More actions"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </div>
            </div>

            {showActions && (
              <div className="actions-dropdown">
                <button className="action-item" onClick={() => { setShowActions(false); openChat(selectedChat) }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                  </svg>
                  Refresh messages
                </button>
                {selectedChat.type === 'group' && (
                  <button
                    className="action-item"
                    onClick={() => { setShowActions(false); setShowActionsPanel(true) }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Group Actions
                  </button>
                )}
                {selectedChat.type !== 'group' && (
                  <button
                    className="action-item"
                    onClick={() => { setShowActions(false); setShowChatActionsPanel(true) }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Chat Actions
                  </button>
                )}
              </div>
            )}

            {showActionsPanel && selectedChat.type === 'group' && (
              <GroupActionsPanel
                chatMessages={messages}
                onClose={() => setShowActionsPanel(false)}
                onExecuteAction={handleExecuteAction}
              />
            )}

            {showChatActionsPanel && selectedChat.type !== 'group' && (
              <ChatActionsPanel
                chatMessages={messages}
                onClose={() => setShowChatActionsPanel(false)}
                onExecuteAction={handleExecuteAction}
              />
            )}

            {executingAction && (
              <div className="action-executing">
                <span className="action-executing-spinner" />
                <span>Running "{executingActionName}"...</span>
              </div>
            )}

            {actionResult && (
              <div className={`action-response-panel ${actionResult.success ? 'action-response-success' : 'action-response-error'}`}>
                <div className="action-response-header">
                  <div className="action-response-status">
                    {actionResult.success ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    )}
                    <span className="action-response-title">{actionResult.actionName}</span>
                    <span className={`action-response-badge ${actionResult.success ? 'badge-success' : 'badge-error'}`}>
                      {actionResult.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  <button className="action-result-close" onClick={() => setActionResult(null)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                {actionResult.responseData && (
                  <div className="action-response-body">
                    {Object.entries(actionResult.responseData).map(([key, value]) => (
                      <div key={key} className="action-response-field">
                        <span className="action-response-key">{key}</span>
                        <span className="action-response-value">
                          {typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value ?? '')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!actionResult.responseData && !actionResult.success && (
                  <div className="action-response-body">
                    <div className="action-response-field">
                      <span className="action-response-key">Error</span>
                      <span className="action-response-value">{actionResult.message}</span>
                    </div>
                  </div>
                )}
                <div className="action-response-note">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  This response is only visible to you
                </div>
              </div>
            )}

            <div className="messages-container">
              {loadingMessages && <div className="loading-state">Loading messages...</div>}
              {msgError && <div className="error-state">{msgError}</div>}

              {messages.map((msg, i) => {
                const showDateHeader =
                  i === 0 ||
                  formatDate(msg.timestamp) !== formatDate(messages[i - 1].timestamp)
                return (
                  <div key={msg.id || i}>
                    {showDateHeader && (
                      <div className="date-divider">
                        <span>{formatDate(msg.timestamp)}</span>
                      </div>
                    )}
                    <div className={`message-bubble ${msg.isFromMe ? 'sent' : 'received'}`}>
                      {msg.fromName && !msg.isFromMe && (
                        <span className="message-author">{msg.fromName}</span>
                      )}
                      {msg.hasMedia && (() => {
                        const mt = (msg.messageType || '').toLowerCase()
                        const isImage = mt.startsWith('image') || mt === 'sticker' || mt === 'stickermessage' || mt === 'imagemessage'
                        const isVideo = mt.startsWith('video') || mt === 'videomessage' || mt === 'gif'
                        const isAudio = mt.startsWith('audio') || mt === 'ptt'
                        const isDocument = mt.startsWith('document') || mt === 'document'

                        let icon: React.ReactNode
                        let label: string

                        if (isImage) {
                          icon = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          )
                          label = mt === 'sticker' || mt === 'stickermessage' ? 'Sticker' : 'Photo'
                        } else if (isVideo) {
                          icon = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="23 7 16 12 23 17 23 7" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                          )
                          label = mt === 'gif' ? 'GIF' : 'Video'
                        } else if (isAudio) {
                          icon = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                              <line x1="12" y1="19" x2="12" y2="23" />
                              <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                          )
                          label = mt === 'ptt' ? 'Voice message' : 'Audio'
                        } else if (isDocument) {
                          icon = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          )
                          label = 'Document'
                        } else {
                          icon = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                          )
                          label = msg.messageType || 'Attachment'
                        }

                        return (
                          <div className="media-placeholder">
                            <span className="media-placeholder-icon">{icon}</span>
                            <span className="media-placeholder-label">{label}</span>
                          </div>
                        )
                      })()}
                      {msg.body && <p className="message-body">{msg.body}</p>}
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="message-input-area">
              {attachmentFile && (
                <div className="attachment-preview">
                  <div className="attachment-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="attachment-info">
                    <span className="attachment-name">{attachmentFile.name}</span>
                    <span className="attachment-size">{formatFileSize(attachmentFile.size)}</span>
                  </div>
                  <button className="attachment-remove" onClick={removeAttachment} disabled={sending}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}
              {uploadProgress && (
                <div className="upload-progress">{uploadProgress}</div>
              )}
              <div className="message-input-bar">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleAttachmentSelect}
                  style={{ display: 'none' }}
                />
                <button
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Attach file (max 100 MB)"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  type="text"
                  placeholder={attachmentFile ? "Add a caption..." : "Type a message..."}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  disabled={sending}
                />
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={(!newMessage.trim() && !attachmentFile) || sending}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
