import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createDb } from './db/client'
import { ensureLocalUser } from './db/seed'
import { createDefaultHttpClient } from './lib/http'
import { createRegistry } from './providers/registry'
import { rssProvider } from './providers/rss'
import { youtubeProvider } from './providers/youtube'
import { createScheduler } from './scheduler/scheduler'

const port = Number(process.env.PORT ?? 3000)
// A postgres:// URL for a real server; anything else is a folder for local PGlite data.
const databaseLocation = process.env.DATABASE_URL ?? './data/pglite'
const userAgent = process.env.USER_AGENT ?? 'NueNews/0.1 (personal dashboard)'

const { db, close: closeDb } = await createDb(databaseLocation)
const userId = await ensureLocalUser(db)

const registry = createRegistry([rssProvider, youtubeProvider])
const fetchContext = { http: createDefaultHttpClient(userAgent), now: () => new Date() }

const app = createApp({
  db,
  registry,
  fetchContext,
  now: () => new Date(),
  currentUserId: () => userId,
  minRefreshIntervalSec: 60,
})

const scheduler = createScheduler({ db, registry, ctx: fetchContext })
scheduler.start()

const server = serve({ fetch: app.fetch, port }, (info) => {
  const database = /^postgres(ql)?:\/\//i.test(databaseLocation) ? 'PostgreSQL' : databaseLocation
  console.log(`API listening on http://localhost:${info.port} (database: ${database})`)
})

function shutdown() {
  scheduler.stop()
  server.close()
  void closeDb()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
