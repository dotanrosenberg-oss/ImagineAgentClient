export interface GroupAction {
  id: string
  name: string
  description: string
  apiUrl: string
  apiKey: string
}

const STORAGE_KEY = 'group_actions_global'

function loadActions(): GroupAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    if (typeof parsed === 'object' && parsed !== null) {
      const all = Object.values(parsed).flat() as GroupAction[]
      const seen = new Set<string>()
      return all.filter((a) => {
        const key = a.name + a.apiUrl
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    return []
  } catch {
    return []
  }
}

function persistActions(actions: GroupAction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
}

export function getActions(): GroupAction[] {
  return loadActions()
}

export function saveAction(action: GroupAction): void {
  const actions = loadActions()
  const idx = actions.findIndex((a) => a.id === action.id)
  if (idx >= 0) {
    actions[idx] = action
  } else {
    actions.push(action)
  }
  persistActions(actions)
}

export function deleteAction(actionId: string): void {
  const actions = loadActions().filter((a) => a.id !== actionId)
  persistActions(actions)
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
