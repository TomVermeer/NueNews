import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createAuthenticator } from './auth/config'
import { createDb } from './db/client'
import { createDefaultHttpClient } from './lib/http'
import { createRegistry } from './providers/registry'
import { rssProvider } from './providers/rss'
import { youtubeProvider } from './providers/youtube'
import { createScheduler } from './scheduler/scheduler'

// A .env file at the repo root fills in settings that are not already in the environment.
const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const port = Number(process.env.PORT ?? 3000)
// A postgres:// URL for a real server; anything else is a folder for local PGlite data.
const databaseLocation = process.env.DATABASE_URL ?? './data/pglite'
const userAgent = process.env.USER_AGENT ?? 'NueNews/0.1 (personal dashboard)'

const { db, close: closeDb } = await createDb(databaseLocation)
const authenticate = await createAuthenticator(process.env, db)

const registry = createRegistry([rssProvider, youtubeProvider])
const fetchContext = { http: createDefaultHttpClient(userAgent), now: () => new Date() }

const scheduler = createScheduler({ db, registry, ctx: fetchContext })

const production = process.env.NODE_ENV === 'production'
const cronSecret = process.env.CRON_SECRET
if (production && !cronSecret) {
  console.info(
    'CRON_SECRET is not set, so POST /internal/tick is off and only the built-in scheduler refreshes feeds. That is fine on a server that stays awake; a host that sleeps needs the secret.',
  )
}

const app = createApp({
  db,
  registry,
  fetchContext,
  now: () => new Date(),
  authenticate,
  minRefreshIntervalSec: 60,
  // In production the API serves the built web app too, so one service hosts everything.
  webRoot: production ? fileURLToPath(new URL('../../web/dist', import.meta.url)) : undefined,
  cron: cronSecret ? { secret: cronSecret, tick: () => scheduler.tick() } : undefined,
})

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
