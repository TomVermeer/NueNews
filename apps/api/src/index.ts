import { serve } from '@hono/node-server'
import { app } from './app'
import { createDb } from './db/client'
import { ensureLocalUser } from './db/seed'

const port = Number(process.env.PORT ?? 3000)
const databasePath = process.env.DATABASE_PATH ?? './data/nuenews.sqlite'

const db = createDb(databasePath)
ensureLocalUser(db)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port} (database: ${databasePath})`)
})
