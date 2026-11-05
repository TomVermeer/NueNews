import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { createAuthenticator } from './auth/config'
import { createDb } from './db/client'
import { readEnv } from './env'
import { createDefaultHttpClient } from './lib/http'
import { createRegistry } from './providers/registry'
import { rssProvider } from './providers/rss'
import { youtubeProvider } from './providers/youtube'
import { createScheduler } from './scheduler/scheduler'

// A .env file at the repo root fills in settings that are not already in the environment.
const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const { port, databaseLocation, userAgent, production, cronSecret, googleMapsEmbedKey, auth } =
  readEnv(process.env)

const { db, close: closeDb } = await createDb(databaseLocation)
const authenticate = await createAuthenticator(auth, db)

const registry = createRegistry([rssProvider, youtubeProvider])
const fetchContext = { http: createDefaultHttpClient(userAgent), now: () => new Date() }

const scheduler = createScheduler({ db, registry, ctx: fetchContext })

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
  googleMapsEmbedKey,
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
