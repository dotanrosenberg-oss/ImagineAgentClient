export interface GroupAction {
  id: string
  name: string
  description: string
  apiUrl: string
  apiKey: string
  apiDocUrl: string
  projectId?: number
}

export type ChatAction = GroupAction

async function fetchActions(type: 'group' | 'chat'): Promise<GroupAction[]> {
  const res = await fetch(`/local-api/actions/${type}`)
  if (!res.ok) return []
  return res.json()
}

async function upsertAction(type: 'group' | 'chat', action: GroupAction): Promise<void> {
  await fetch(`/local-api/actions/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  })
}

async function removeAction(type: 'group' | 'chat', actionId: string): Promise<void> {
  await fetch(`/local-api/actions/${type}/${actionId}`, { method: 'DELETE' })
}

export async function getActions(): Promise<GroupAction[]> {
  return fetchActions('group')
}

export async function saveAction(action: GroupAction): Promise<void> {
  return upsertAction('group', action)
}

export async function deleteAction(actionId: string): Promise<void> {
  return removeAction('group', actionId)
}

export async function getChatActions(): Promise<ChatAction[]> {
  return fetchActions('chat')
}

export async function saveChatAction(action: ChatAction): Promise<void> {
  return upsertAction('chat', action)
}

export async function deleteChatAction(actionId: string): Promise<void> {
  return removeAction('chat', actionId)
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
