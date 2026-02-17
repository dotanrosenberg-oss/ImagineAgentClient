import { useState, useEffect, useRef, useCallback } from 'react'
import type { Chat, Message, HealthStatus, Participant } from './api'
import { fetchChats, fetchMessages, fetchWhatsAppMessages, sendMessage, sendMessageWithAttachment, checkHealth, syncChats, getMediaUrl } from './api'
import { connectWebSocket, disconnectWebSocket, onWSMessage } from './websocket'

interface Props {
  onCreateGroup: () => void
  onCreateGroupFromMembers: (participants: Participant[], sourceGroupName: string) => void
}

export default function MessagingScreen({ onCreateGroup, onCreateGroupFromMembers }: Props) {
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
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
        const base64 = await fileToBase64(attachmentFile)
        await sendMessageWithAttachment(
          selectedChat.id,
          { data: base64, filename: attachmentFile.name, mimetype: attachmentFile.type || 'application/octet-stream' },
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

  const chatAvatar = (chat: Chat) => {
    if (chat.profilePicUrl) {
      return (
        <>
          <img
            src={chat.profilePicUrl}
            alt=""
            className="chat-avatar-img"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
              const parent = (e.target as HTMLImageElement).parentElement
              if (parent) {
                const fb = parent.querySelector('.chat-avatar-fallback') as HTMLElement
                if (fb) fb.style.display = 'flex'
              }
            }}
          />
          <span className="chat-avatar-fallback" style={{ background: getAvatarColor(chat.id) }}>
            {getInitials(chat.name)}
          </span>
        </>
      )
    }
    return (
      <span className="chat-avatar-initials" style={{ background: getAvatarColor(chat.id) }}>
        {getInitials(chat.name)}
      </span>
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
                {selectedChat.type !== 'group' && (
                  <button
                    className="action-item"
                    onClick={() => {
                      setShowActions(false)
                      const phone = selectedChat.phoneNumber || selectedChat.id.replace('@c.us', '')
                      onCreateGroupFromMembers(
                        [{ id: selectedChat.id, name: selectedChat.name, phone, isAdmin: false, isSuperAdmin: false }],
                        selectedChat.name
                      )
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                    </svg>
                    Create group with contact
                  </button>
                )}
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
                      {msg.hasMedia && selectedChat && (() => {
                        const mt = (msg.messageType || '').toLowerCase()
                        const isImage = mt.startsWith('image') || mt === 'sticker' || mt === 'stickermessage' || mt === 'imagemessage'
                        const isVideo = mt.startsWith('video') || mt === 'videomessage' || mt === 'gif'
                        const mediaSource = msg.mediaUrl || getMediaUrl(selectedChat.id, msg.id)
                        if (isImage) {
                          return (
                            <div className="media-content">
                              <img
                                src={mediaSource}
                                alt={msg.body || 'Image'}
                                className="media-image"
                                loading="lazy"
                                onClick={() => window.open(mediaSource, '_blank')}
                                onError={(e) => {
                                  const el = e.target as HTMLImageElement
                                  el.style.display = 'none'
                                  const fallback = el.nextElementSibling as HTMLElement
                                  if (fallback) fallback.style.display = 'flex'
                                }}
                              />
                              <span className="media-fallback" style={{ display: 'none' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <polyline points="21 15 16 10 5 21" />
                                </svg>
                                Photo
                              </span>
                            </div>
                          )
                        }
                        if (isVideo) {
                          return (
                            <div className="media-content">
                              <video
                                src={mediaSource}
                                controls
                                className="media-video"
                                preload="metadata"
                                onError={(e) => {
                                  const el = e.target as HTMLVideoElement
                                  el.style.display = 'none'
                                  const fallback = el.nextElementSibling as HTMLElement
                                  if (fallback) fallback.style.display = 'flex'
                                }}
                              />
                              <span className="media-fallback" style={{ display: 'none' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="23 7 16 12 23 17 23 7" />
                                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                Video
                              </span>
                            </div>
                          )
                        }
                        return (
                          <a href={mediaSource} target="_blank" rel="noopener noreferrer" className="media-download-link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            {msg.messageType || 'Attachment'}
                          </a>
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
