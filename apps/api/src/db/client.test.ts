import { createServer } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb } from './client'
import { onlyRow } from './query'
import { dashboards, users } from './schema'
import { ensureLocalUser } from './seed'

async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  await new Promise((resolve) => probe.close(resolve))
  if (typeof address !== 'object' || address === null) throw new Error('No free port')
  return address.port
}

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const task of cleanup.splice(0).reverse()) await task()
})

describe('createDb', () => {
  it('runs in memory without a location', async () => {
    const { db, close } = await createDb()
    cleanup.push(close)
    await ensureLocalUser(db)
    expect(await db.select().from(users)).toHaveLength(1)
  })

  // Starts a Postgres wire-protocol server (PGlite behind a socket) so the same code path as a
  // real server runs: node-postgres connecting by URL, then migrations, then queries.
  it('connects to a Postgres server by URL, migrates it, and reads and writes', async () => {
    const port = await freePort()
    const server = new PGLiteSocketServer({ db: new PGlite(), port, host: '127.0.0.1' })
    await server.start()
    cleanup.push(() => server.stop())

    const { db, close } = await createDb(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`)
    cleanup.push(close)

    const userId = await ensureLocalUser(db)
    const dashboard = onlyRow(
      await db.insert(dashboards).values({ userId, name: 'Home' }).returning(),
    )
    expect(dashboard).toMatchObject({ name: 'Home', position: 0 })
    expect(dashboard.createdAt).toBeInstanceOf(Date)

    const result = (await db.execute(
      sql`SELECT relrowsecurity AS secured FROM pg_class WHERE relname = 'dashboards'`,
    )) as { rows: { secured: boolean }[] }
    expect(result.rows[0]?.secured).toBe(true)
  })
})
