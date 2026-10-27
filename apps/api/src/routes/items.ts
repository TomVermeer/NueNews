import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { itemStateSchema } from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { itemState, items } from '../db/schema'
import { validate } from '../http'

export function itemRoutes({ db, now: clock }: AppDeps) {
  return new Hono<Env>().post('/state', validate('json', itemStateSchema), async (c) => {
    const userId = c.get('userId')
    const { ids, action } = c.req.valid('json')
    const now = clock()

    const existing = (
      await db.select({ id: items.id }).from(items).where(inArray(items.id, ids))
    ).map((row) => row.id)
    const current = new Map(
      (
        await db
          .select()
          .from(itemState)
          .where(and(eq(itemState.userId, userId), inArray(itemState.itemId, existing)))
      ).map((row) => [row.itemId, row]),
    )

    await db.transaction(async (tx) => {
      for (const itemId of existing) {
        const before = current.get(itemId)
        const seenAt = before?.seenAt ?? (action === 'unread' ? null : now)
        const readAt =
          action === 'read' ? now : action === 'unread' ? null : (before?.readAt ?? null)
        await tx
          .insert(itemState)
          .values({ userId, itemId, seenAt, readAt })
          .onConflictDoUpdate({
            target: [itemState.userId, itemState.itemId],
            set: { seenAt, readAt },
          })
      }
    })
    return c.json({ updated: existing.length })
  })
}
