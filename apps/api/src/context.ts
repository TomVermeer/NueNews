import type { Authenticator } from './auth/types'
import type { Db } from './db/client'
import type { ProviderRegistry } from './providers/registry'
import type { FetchContext } from './providers/types'

export interface AppDeps {
  db: Db
  registry: ProviderRegistry
  fetchContext: FetchContext
  now: () => Date
  /** Who is making the request. Everything except /health needs a signed-in user. */
  authenticate: Authenticator
  /** A manual refresh skips sources that were fetched more recently than this. */
  minRefreshIntervalSec: number
  /** Where the built web app is. When set (and built), the API serves it too. */
  webRoot?: string
  /** Turns on POST /internal/tick for an outside cron. Without it the endpoint does not exist. */
  cron?: { secret: string; tick: () => Promise<number> }
}

export type Env = { Variables: { userId: string } }
