export interface GroupAction {
  id: string
  name: string
  description: string
  apiUrl: string
  apiKey: string
}

const STORAGE_KEY = 'group_actions'

function getAllActions(): Record<string, GroupAction[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveAllActions(data: Record<string, GroupAction[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function getActionsForGroup(groupId: string): GroupAction[] {
  const all = getAllActions()
  return all[groupId] || []
}

export function saveAction(groupId: string, action: GroupAction): void {
  const all = getAllActions()
  if (!all[groupId]) all[groupId] = []
  const idx = all[groupId].findIndex((a) => a.id === action.id)
  if (idx >= 0) {
    all[groupId][idx] = action
  } else {
    all[groupId].push(action)
  }
  saveAllActions(all)
}

export function deleteAction(groupId: string, actionId: string): void {
  const all = getAllActions()
  if (!all[groupId]) return
  all[groupId] = all[groupId].filter((a) => a.id !== actionId)
  saveAllActions(all)
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
