export interface GroupAction {
  id: string
  name: string
  description: string
  apiUrl: string
  apiKey: string
  apiDocUrl: string
}

export type ChatAction = GroupAction

const GROUP_STORAGE_KEY = 'group_actions_global'
const CHAT_STORAGE_KEY = 'chat_actions_global'

function loadFromKey(key: string): GroupAction[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (typeof parsed === 'object' && parsed !== null) {
      const all = Object.values(parsed).flat() as GroupAction[]
      const seen = new Set<string>()
      return all.filter((a) => {
        const k = a.name + a.apiUrl
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }
    return []
  } catch {
    return []
  }
}

function persistToKey(key: string, actions: GroupAction[]): void {
  localStorage.setItem(key, JSON.stringify(actions))
}

export function getActions(): GroupAction[] {
  return loadFromKey(GROUP_STORAGE_KEY)
}

export function saveAction(action: GroupAction): void {
  const actions = loadFromKey(GROUP_STORAGE_KEY)
  const idx = actions.findIndex((a) => a.id === action.id)
  if (idx >= 0) actions[idx] = action
  else actions.push(action)
  persistToKey(GROUP_STORAGE_KEY, actions)
}

export function deleteAction(actionId: string): void {
  persistToKey(GROUP_STORAGE_KEY, loadFromKey(GROUP_STORAGE_KEY).filter((a) => a.id !== actionId))
}

export function getChatActions(): ChatAction[] {
  return loadFromKey(CHAT_STORAGE_KEY)
}

export function saveChatAction(action: ChatAction): void {
  const actions = loadFromKey(CHAT_STORAGE_KEY)
  const idx = actions.findIndex((a) => a.id === action.id)
  if (idx >= 0) actions[idx] = action
  else actions.push(action)
  persistToKey(CHAT_STORAGE_KEY, actions)
}

export function deleteChatAction(actionId: string): void {
  persistToKey(CHAT_STORAGE_KEY, loadFromKey(CHAT_STORAGE_KEY).filter((a) => a.id !== actionId))
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
