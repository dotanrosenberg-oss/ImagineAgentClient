import { useState, useEffect, useRef, useCallback } from 'react'
import type { Chat, Message, HealthStatus, Participant } from './api'
import { fetchChats, fetchMessages, fetchWhatsAppMessages, sendMessage, checkHealth, syncChats, fetchParticipants } from './api'
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedChatRef = useRef<Chat | null>(null)

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

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedChat || sending) return
    setSending(true)
    try {
      await sendMessage(selectedChat.id, newMessage.trim())
      setNewMessage('')
      let data = await fetchMessages(selectedChat.id)
      if (data.length === 0) {
        data = await fetchWhatsAppMessages(selectedChat.id, 100)
      }
      setMessages(data)
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : 'Failed to send message')
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

  const chatTypeIcon = (type: string, id?: string) => {
    if (type === 'direct' || type === 'contact' || id?.endsWith('@c.us')) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    }
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
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
                {chatTypeIcon(chat.type, chat.id)}
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
                    onClick={async () => {
                      setShowActions(false)
                      try {
                        const members = await fetchParticipants(selectedChat.id)
                        onCreateGroupFromMembers(members, selectedChat.name)
                      } catch (err) {
                        setMsgError(err instanceof Error ? err.message : 'Failed to load members')
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                    </svg>
                    Create group from members
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
                      <p className="message-body">{msg.body}</p>
                      {msg.hasMedia && <span className="media-indicator">{msg.messageType || 'Attachment'}</span>}
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="message-input-bar">
              <input
                type="text"
                placeholder="Type a message..."
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
                disabled={!newMessage.trim() || sending}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
