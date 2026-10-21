/**
 * One-off: copies a NueNews SQLite database into Postgres.
 *
 *   pnpm --filter @nuenews/api db:import-sqlite -- ./data/nuenews.sqlite [--user-id <new id>]
 *
 * The target is DATABASE_URL (a postgres:// URL), or the local PGlite folder ./data/pglite.
 * `--user-id` gives the old single "local" user a new id, e.g. the id of your Supabase user.
 */
import Database from 'better-sqlite3'
import { createDb } from '../src/db/client'
import { importSqlite } from '../src/db/importSqlite'
import { LOCAL_USER_ID } from '../src/db/seed'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const sqlitePath = args.find((arg) => !arg.startsWith('--'))
const userFlag = args.indexOf('--user-id')
const newUserId = userFlag >= 0 ? args[userFlag + 1] : undefined

if (!sqlitePath || (userFlag >= 0 && !newUserId)) {
  console.error('Usage: db:import-sqlite -- <path to .sqlite> [--user-id <new id>]')
  process.exit(1)
}

const target = process.env.DATABASE_URL ?? './data/pglite'
const source = new Database(sqlitePath, { readonly: true, fileMustExist: true })
const { db, close } = await createDb(target)

try {
  const counts = await importSqlite(source, db, {
    userIdMap: newUserId ? { [LOCAL_USER_ID]: newUserId } : undefined,
  })
  for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count} rows`)
  console.log('Done.')
} finally {
  source.close()
  await close()
}
