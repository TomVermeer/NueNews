import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedItem } from '@nuenews/shared'
import { createDb, type Db } from './client'
import { listLatestItems, pruneItems, upsertItems } from './items'
import { items, sources } from './schema'

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

beforeEach(() => {
  db = createDb(':memory:')
  sourceId = db
    .insert(sources)
    .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
    .returning()
    .get().id
})

describe('upsertItems', () => {
  it('inserts new items', () => {
    upsertItems(db, sourceId, [item(1), item(2)])
    expect(db.select().from(items).all()).toHaveLength(2)
  })

  it('does not duplicate items that were already stored, but refreshes their content', () => {
    upsertItems(db, sourceId, [item(1)])
    upsertItems(db, sourceId, [item(1, { title: 'Edited title', excerpt: 'New excerpt' })])

    const rows = db.select().from(items).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Edited title', excerpt: 'New excerpt' })
  })

  it('stores optional fields as null and round-trips meta', () => {
    upsertItems(db, sourceId, [item(1, { meta: { chapter: 12 } })])
    const row = db.select().from(items).get()
    expect(row).toMatchObject({ excerpt: null, imageUrl: null, author: null })
    expect(row?.meta).toEqual({ chapter: 12 })
  })

  it('ignores an empty list', () => {
    upsertItems(db, sourceId, [])
    expect(db.select().from(items).all()).toHaveLength(0)
  })
})

describe('listLatestItems', () => {
  it('returns newest first and respects the limit', () => {
    upsertItems(db, sourceId, [item(1), item(3), item(2)])
    const rows = listLatestItems(db, [sourceId], 2)
    expect(rows.map((r) => r.externalId)).toEqual(['guid-3', 'guid-2'])
  })

  it('returns nothing when no sources are given', () => {
    expect(listLatestItems(db, [], 5)).toEqual([])
  })
})

describe('pruneItems', () => {
  it('keeps only the newest items of the source', () => {
    upsertItems(db, sourceId, [item(1), item(2), item(3), item(4)])
    pruneItems(db, sourceId, 2)
    const rows = listLatestItems(db, [sourceId], 10)
    expect(rows.map((r) => r.externalId)).toEqual(['guid-4', 'guid-3'])
  })

  it('does not touch other sources', () => {
    const other = db
      .insert(sources)
      .values({ kind: 'rss', key: 'https://other.example/feed.xml' })
      .returning()
      .get().id
    upsertItems(db, sourceId, [item(1), item(2)])
    upsertItems(db, other, [item(1), item(2)])
    pruneItems(db, sourceId, 1)
    expect(listLatestItems(db, [other], 10)).toHaveLength(2)
  })
})
