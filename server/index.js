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
      api_url TEXT NOT NULL,
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
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Actions API running on port ${PORT}`)
  })
}).catch((err) => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})
