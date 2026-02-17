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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
  }
}

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
  const { id, name, description, apiUrl, apiKey, apiDocUrl } = req.body
  if (!id || !name || !apiUrl) {
    return res.status(400).json({ error: 'id, name, and apiUrl are required' })
  }
  await pool.query(
    `INSERT INTO actions (id, type, name, description, api_url, api_key, api_doc_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       api_url = EXCLUDED.api_url,
       api_key = EXCLUDED.api_key,
       api_doc_url = EXCLUDED.api_doc_url,
       updated_at = NOW()`,
    [id, type, name, description || '', apiUrl, apiKey || '', apiDocUrl || '']
  )
  res.json({ ok: true })
})

app.delete('/local-api/actions/:type/:id', async (req, res) => {
  const { type, id } = req.params
  await pool.query('DELETE FROM actions WHERE id = $1 AND type = $2', [id, type])
  res.json({ ok: true })
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
