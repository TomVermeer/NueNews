import type { Db } from './db/client'
import type { ProviderRegistry } from './providers/registry'
import type { FetchContext } from './providers/types'

export interface AppDeps {
  db: Db
  registry: ProviderRegistry
  fetchContext: FetchContext
  now: () => Date
  /** Who is making the request. v1 always returns the local user; real auth replaces this. */
  currentUserId: () => string
  /** A manual refresh skips sources that were fetched more recently than this. */
  minRefreshIntervalSec: number
}

export type Env = { Variables: { userId: string } }
