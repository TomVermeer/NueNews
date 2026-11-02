import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import type { z } from 'zod'
import { itemStateSchema } from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { itemState, items } from '../db/schema'
import { validate } from '../http'

type ItemAction = z.infer<typeof itemStateSchema>['action']

/** Reading sets the time, marking unread clears it, and marking seen keeps what was there. */
function readAtAfter(action: ItemAction, readAt: Date | null, now: Date): Date | null {
  if (action === 'read') return now
  if (action === 'unread') return null
  return readAt
}

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
        const readAt = readAtAfter(action, before?.readAt ?? null, now)
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
