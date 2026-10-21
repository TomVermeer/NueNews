import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import * as schema from './schema'

/** The same query API for a real Postgres server and for in-process PGlite. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export interface Database {
  db: Db
  /** Releases connections (and flushes PGlite). Call once, when the process or test ends. */
  close(): Promise<void>
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

const isServerUrl = (location: string) => /^postgres(ql)?:\/\//i.test(location)

/**
 * Opens and migrates a database.
 * - `postgres://…` connects to a Postgres server (production, or a local one).
 * - Anything else is a PGlite data directory (development): real Postgres running in-process,
 *   no installation needed.
 * - No argument is a throwaway in-memory PGlite (tests).
 */
export async function createDb(location?: string): Promise<Database> {
  if (location && isServerUrl(location)) {
    const pool = new pg.Pool({ connectionString: location, max: 5 })
    const db = drizzlePg(pool, { schema })
    await migratePg(db, { migrationsFolder })
    return { db, close: () => pool.end() }
  }

  if (location) mkdirSync(location, { recursive: true })
  const client = new PGlite(location)
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder })
  return { db, close: () => client.close() }
}
