import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Opens (and migrates) a SQLite database. Use ':memory:' for tests. */
export function createDb(path = ':memory:'): Db {
  const inMemory = path === ':memory:'
  if (!inMemory) mkdirSync(dirname(path), { recursive: true })

  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  if (!inMemory) sqlite.pragma('journal_mode = WAL')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}
