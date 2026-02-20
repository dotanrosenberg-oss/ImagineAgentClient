import express from 'express'
import pg from 'pg'

const { Pool } = pg
const app = express()
app.use(express.json())

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('group', 'chat')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      api_url TEXT DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      api_doc_url TEXT NOT NULL DEFAULT '',
      project_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE actions ADD COLUMN IF NOT EXISTS project_id INTEGER
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_tasks (
      id SERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      action_name TEXT NOT NULL DEFAULT '',
      external_task_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      request_summary TEXT NOT NULL DEFAULT '',
      response TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE(chat_id, external_task_id)
    )
  `)
  await pool.query(`ALTER TABLE chat_tasks ADD COLUMN IF NOT EXISTS response TEXT NOT NULL DEFAULT ''`)
  await pool.query(`ALTER TABLE chat_tasks ADD COLUMN IF NOT EXISTS response_data JSONB`)
}

function rowToAction(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    apiDocUrl: row.api_doc_url,
    projectId: row.project_id,
  }
}

app.post('/local-api/forward', async (req, res) => {
  const { serverUrl, apiKey, endpoint, method = 'GET', body } = req.body || {}
  if (!serverUrl || !endpoint) {
    return res.status(400).json({ error: 'serverUrl and endpoint are required' })
  }

  try {
    const base = String(serverUrl).trim().replace(/\/$/, '')
    const path = String(endpoint).startsWith('/') ? String(endpoint) : `/${String(endpoint)}`
    const url = `${base}${path}`
    const headers = {}
    if (apiKey) headers['X-API-Key'] = String(apiKey)
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(url, {
      method: String(method || 'GET').toUpperCase(),
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const text = await response.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : {} } catch { parsed = { message: text } }
    return res.status(response.status).json(parsed)
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Proxy forward failed' })
  }
})

app.post('/local-api/groups/set-image', async (req, res) => {
  const { serverUrl, apiKey, groupId, fileName, mimeType, bufferBase64 } = req.body || {}
  if (!serverUrl || !groupId || !bufferBase64) {
    return res.status(400).json({ error: 'serverUrl, groupId, bufferBase64 are required' })
  }

  try {
    const base = String(serverUrl).trim().replace(/\/$/, '')
    const url = `${base}/api/groups/set-image`

    const form = new FormData()
    form.append('groupId', String(groupId))

    const bytes = Buffer.from(String(bufferBase64), 'base64')
    const blob = new Blob([bytes], { type: mimeType || 'image/jpeg' })
    form.append('image', blob, fileName || 'group.jpg')

    const headers = {}
    if (apiKey) headers['X-API-Key'] = String(apiKey)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
    })

    const text = await response.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : {} } catch { parsed = { message: text } }
    return res.status(response.status).json(parsed)
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Group image proxy failed' })
  }
})

app.post('/local-api/actions/execute', async (req, res) => {
  const { actionId, payload } = req.body
  if (!actionId) {
    return res.status(400).json({ error: 'actionId is required' })
  }
  try {
    const result = await pool.query('SELECT * FROM actions WHERE id = $1', [actionId])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' })
    }
    const action = result.rows[0]

    const urlObj = new URL(action.api_url)
    const apiEndpoint = `${urlObj.origin}/api/bot/tasks`

    const headers = { 'Content-Type': 'application/json' }
    if (action.api_key) {
      headers['Authorization'] = `Bearer ${action.api_key}`
    }

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = { message: text } }

    res.status(response.status).json(body)
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to execute action' })
  }
})

app.get('/local-api/actions/:type', async (req, res) => {
  const { type } = req.params
  if (type !== 'group' && type !== 'chat') {
    return res.status(400).json({ error: 'Type must be group or chat' })
  }
  const result = await pool.query(
    'SELECT * FROM actions WHERE type = $1 ORDER BY created_at',
    [type]
  )
  res.json(result.rows.map(rowToAction))
})

app.post('/local-api/actions/:type', async (req, res) => {
  const { type } = req.params
  if (type !== 'group' && type !== 'chat') {
    return res.status(400).json({ error: 'Type must be group or chat' })
  }
  const { id, name, description, apiUrl, apiKey, apiDocUrl, projectId } = req.body
  if (!id || !name) {
    return res.status(400).json({ error: 'id and name are required' })
  }
  await pool.query(
    `INSERT INTO actions (id, type, name, description, api_url, api_key, api_doc_url, project_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       api_url = EXCLUDED.api_url,
       api_key = EXCLUDED.api_key,
       api_doc_url = EXCLUDED.api_doc_url,
       project_id = EXCLUDED.project_id,
       updated_at = NOW()`,
    [id, type, name, description || '', apiUrl, apiKey || '', apiDocUrl || '', projectId || null]
  )
  res.json({ ok: true })
})

app.post('/local-api/chat-tasks', async (req, res) => {
  const { chatId, actionId, actionName, externalTaskId, title, status, requestSummary, response: taskResponse, responseData } = req.body
  if (!chatId || !externalTaskId) {
    return res.status(400).json({ error: 'chatId and externalTaskId are required' })
  }
  try {
    await pool.query(
      `INSERT INTO chat_tasks (chat_id, action_id, action_name, external_task_id, title, status, request_summary, response, response_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (chat_id, external_task_id) DO UPDATE SET
         status = EXCLUDED.status,
         title = EXCLUDED.title,
         response = EXCLUDED.response,
         response_data = COALESCE(EXCLUDED.response_data, chat_tasks.response_data),
         updated_at = NOW()`,
      [chatId, actionId || '', actionName || '', String(externalTaskId), title || '', status || 'todo', requestSummary || '', taskResponse || '', responseData ? JSON.stringify(responseData) : null]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/local-api/chat-tasks/:chatId', async (req, res) => {
  const { chatId } = req.params
  try {
    const result = await pool.query(
      'SELECT * FROM chat_tasks WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    )
    res.json(result.rows.map(row => ({
      id: row.id,
      chatId: row.chat_id,
      actionId: row.action_id,
      actionName: row.action_name,
      externalTaskId: row.external_task_id,
      title: row.title,
      status: row.status,
      requestSummary: row.request_summary,
      response: row.response || '',
      responseData: row.response_data || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/local-api/chat-tasks/:chatId/refresh', async (req, res) => {
  const { chatId } = req.params
  try {
    const tasksResult = await pool.query(
      `SELECT ct.*, a.api_url, a.api_key FROM chat_tasks ct
       LEFT JOIN actions a ON ct.action_id = a.id
       WHERE ct.chat_id = $1 AND ct.status NOT IN ('done', 'completed', 'cancelled')`,
      [chatId]
    )

    for (const task of tasksResult.rows) {
      if (!task.api_url) continue
      try {
        const urlObj = new URL(task.api_url)
        const endpoint = `${urlObj.origin}/api/bot/tasks/${task.external_task_id}`
        const headers = {}
        if (task.api_key) headers['Authorization'] = `Bearer ${task.api_key}`

        const response = await fetch(endpoint, { headers })
        if (response.ok) {
          const data = await response.json()
          const taskData = data.task || data
          const newStatus = taskData.status || task.status
          const isCompleted = newStatus === 'done' || newStatus === 'completed'

          await pool.query(
            `UPDATE chat_tasks SET status = $1, title = $2, response_data = $4, updated_at = NOW(),
             completed_at = CASE WHEN $5::boolean THEN NOW() ELSE NULL END
             WHERE id = $3`,
            [newStatus, taskData.title || task.title, task.id, JSON.stringify(data), isCompleted]
          )
        }
      } catch {
      }
    }

    const freshResult = await pool.query(
      'SELECT * FROM chat_tasks WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    )
    res.json(freshResult.rows.map(row => ({
      id: row.id,
      chatId: row.chat_id,
      actionId: row.action_id,
      actionName: row.action_name,
      externalTaskId: row.external_task_id,
      title: row.title,
      status: row.status,
      requestSummary: row.request_summary,
      response: row.response || '',
      responseData: row.response_data || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/local-api/dashboard', async (_req, res) => {
  try {
    const actionResult = await pool.query(
      `SELECT api_url, api_key FROM actions
       WHERE api_url IS NOT NULL AND api_url <> ''
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`
    )

    if (actionResult.rows.length === 0) {
      return res.json({ pendingTasks: null, source: null })
    }

    const { api_url: apiUrl, api_key: apiKey } = actionResult.rows[0]
    const urlObj = new URL(apiUrl)
    const endpoint = `${urlObj.origin}/api/bot/tasks`
    const headers = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const response = await fetch(endpoint, { headers })
    if (!response.ok) {
      return res.json({ pendingTasks: null, source: urlObj.origin, error: `task_api_${response.status}` })
    }

    const data = await response.json()
    const tasks = Array.isArray(data?.tasks) ? data.tasks : []
    const pendingTasks = tasks.filter((t) => !['done', 'completed', 'cancelled'].includes(String(t?.status || '').toLowerCase())).length

    res.json({ pendingTasks, source: urlObj.origin, totalTasks: tasks.length })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load dashboard summary' })
  }
})

app.delete('/local-api/actions/:type/:id', async (req, res) => {
  const { type, id } = req.params
  await pool.query('DELETE FROM actions WHERE id = $1 AND type = $2', [id, type])
  res.json({ ok: true })
})

app.get('/local-api/image-proxy', async (req, res) => {
  const url = req.query.url
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url parameter is required' })
  }
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    })
    if (!response.ok) {
      return res.status(response.status).end()
    }
    const contentType = response.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch {
    res.status(502).end()
  }
})

const PORT = 3001

function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Actions API running on port ${PORT}`)
  })
}

initDb()
  .then(() => {
    startServer()
  })
  .catch((err) => {
    console.error('Failed to initialize database (continuing in degraded mode):', err)
    startServer()
  })
