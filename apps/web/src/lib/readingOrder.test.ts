import { describe, expect, it } from 'vitest'
import { readingOrder } from './readingOrder'

const at = (i: string, x: number, y: number) => ({ i, x, y })

describe('readingOrder', () => {
  it('goes top to bottom, and left to right within a row', () => {
    const items = [at('c', 0, 6), at('b', 6, 0), at('a', 0, 0), at('d', 6, 6)]
    expect(readingOrder(items).map((item) => item.i)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts a widget that starts higher first, even when it is further right', () => {
    const items = [at('low-left', 0, 4), at('high-right', 8, 1)]
    expect(readingOrder(items).map((item) => item.i)).toEqual(['high-right', 'low-left'])
  })

  it('keeps the given order for widgets at the same position', () => {
    const items = [at('first', 0, 0), at('second', 0, 0)]
    expect(readingOrder(items).map((item) => item.i)).toEqual(['first', 'second'])
  })

  it('returns a new array and leaves the input alone', () => {
    const items = [at('b', 6, 0), at('a', 0, 0)]
    const sorted = readingOrder(items)
    expect(sorted).not.toBe(items)
    expect(items.map((item) => item.i)).toEqual(['b', 'a'])
  })
})
