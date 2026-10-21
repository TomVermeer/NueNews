import { desc, inArray, sql } from 'drizzle-orm'
import type { NormalizedItem } from '@nuenews/shared'
import type { Db } from './client'
import { items } from './schema'

/** Inserts new items and refreshes existing ones (matched on source + external id). */
export async function upsertItems(
  db: Db,
  sourceId: string,
  incoming: NormalizedItem[],
  now = new Date(),
): Promise<void> {
  if (incoming.length === 0) return

  await db
    .insert(items)
    .values(
      incoming.map((item) => ({
        sourceId,
        externalId: item.externalId,
        title: item.title,
        url: item.url,
        excerpt: item.excerpt ?? null,
        imageUrl: item.imageUrl ?? null,
        author: item.author ?? null,
        publishedAt: item.publishedAt,
        fetchedAt: now,
        meta: item.meta ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [items.sourceId, items.externalId],
      set: {
        title: sql`excluded.title`,
        url: sql`excluded.url`,
        excerpt: sql`excluded.excerpt`,
        imageUrl: sql`excluded.image_url`,
        author: sql`excluded.author`,
        publishedAt: sql`excluded.published_at`,
        meta: sql`excluded.meta`,
      },
    })
}

/** Newest items across the given sources. */
export async function listLatestItems(db: Db, sourceIds: string[], limit: number) {
  if (sourceIds.length === 0) return []
  return db
    .select()
    .from(items)
    .where(inArray(items.sourceId, sourceIds))
    .orderBy(desc(items.publishedAt))
    .limit(limit)
}

/** Keeps only the newest `keep` items of a source. */
export async function pruneItems(db: Db, sourceId: string, keep: number): Promise<void> {
  await db.execute(sql`
    DELETE FROM items
    WHERE source_id = ${sourceId}
      AND id NOT IN (
        SELECT id FROM items
        WHERE source_id = ${sourceId}
        ORDER BY published_at DESC
        LIMIT ${keep}
      )
  `)
}
