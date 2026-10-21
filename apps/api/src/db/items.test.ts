import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedItem } from '@nuenews/shared'
import type { Db } from './client'
import { listLatestItems, pruneItems, upsertItems } from './items'
import { items, sources } from './schema'
import { firstRow, onlyRow } from './query'
import { freshDb } from '../test/helpers'

let db: Db
let sourceId: string

function item(n: number, overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    externalId: `guid-${n}`,
    title: `Item ${n}`,
    url: `https://example.com/${n}`,
    publishedAt: new Date(2026, 0, n),
    ...overrides,
  }
}

beforeEach(async () => {
  db = await freshDb()
  sourceId = onlyRow(
    await db
      .insert(sources)
      .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
      .returning(),
  ).id
})

describe('upsertItems', () => {
  it('inserts new items', async () => {
    await upsertItems(db, sourceId, [item(1), item(2)])
    expect(await db.select().from(items)).toHaveLength(2)
  })

  it('does not duplicate items that were already stored, but refreshes their content', async () => {
    await upsertItems(db, sourceId, [item(1)])
    await upsertItems(db, sourceId, [item(1, { title: 'Edited title', excerpt: 'New excerpt' })])

    const rows = await db.select().from(items)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Edited title', excerpt: 'New excerpt' })
  })

  it('stores optional fields as null and round-trips meta', async () => {
    await upsertItems(db, sourceId, [item(1, { meta: { chapter: 12 } })])
    const row = firstRow(await db.select().from(items))
    expect(row).toMatchObject({ excerpt: null, imageUrl: null, author: null })
    expect(row?.meta).toEqual({ chapter: 12 })
  })

  it('ignores an empty list', async () => {
    await upsertItems(db, sourceId, [])
    expect(await db.select().from(items)).toHaveLength(0)
  })
})

describe('listLatestItems', () => {
  it('returns newest first and respects the limit', async () => {
    await upsertItems(db, sourceId, [item(1), item(3), item(2)])
    const rows = await listLatestItems(db, [sourceId], 2)
    expect(rows.map((r) => r.externalId)).toEqual(['guid-3', 'guid-2'])
  })

  it('returns nothing when no sources are given', async () => {
    expect(await listLatestItems(db, [], 5)).toEqual([])
  })
})

describe('pruneItems', () => {
  it('keeps only the newest items of the source', async () => {
    await upsertItems(db, sourceId, [item(1), item(2), item(3), item(4)])
    await pruneItems(db, sourceId, 2)
    const rows = await listLatestItems(db, [sourceId], 10)
    expect(rows.map((r) => r.externalId)).toEqual(['guid-4', 'guid-3'])
  })

  it('does not touch other sources', async () => {
    const other = onlyRow(
      await db
        .insert(sources)
        .values({ kind: 'rss', key: 'https://other.example/feed.xml' })
        .returning(),
    ).id
    await upsertItems(db, sourceId, [item(1), item(2)])
    await upsertItems(db, other, [item(1), item(2)])
    await pruneItems(db, sourceId, 1)
    expect(await listLatestItems(db, [other], 10)).toHaveLength(2)
  })
})
