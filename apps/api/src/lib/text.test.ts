import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlToText, makeExcerpt, truncate } from './text'

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Fish &amp; chips &#8211; &#x2019;s &hellip;')).toBe(
      'Fish & chips – ’s …',
    )
  })

  it('leaves unknown or invalid entities alone', () => {
    expect(decodeEntities('&bogus; &#99999999999;')).toBe('&bogus; &#99999999999;')
  })
})

describe('htmlToText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToText('<p>Hello   <b>world</b></p>\n<p>again</p>')).toBe('Hello world again')
  })

  it('removes scripts, styles and comments with their content', () => {
    expect(htmlToText('<script>alert(1)</script>Hi<style>p{}</style><!-- c -->!')).toBe('Hi !')
  })

  it('keeps escaped markup as visible text instead of re-interpreting it', () => {
    expect(htmlToText('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>')
  })

  it('puts a space where block elements and line breaks end', () => {
    expect(htmlToText('one<br>two</p>three')).toBe('one two three')
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('cuts at a word boundary and adds an ellipsis', () => {
    expect(truncate('The quick brown fox jumps over the lazy dog', 20)).toBe('The quick brown…')
  })

  it('never exceeds the limit', () => {
    expect(truncate('a'.repeat(300), 200).length).toBeLessThanOrEqual(200)
  })
})

describe('makeExcerpt', () => {
  it('returns undefined for empty or tag-only input', () => {
    expect(makeExcerpt(undefined)).toBeUndefined()
    expect(makeExcerpt('<p> </p>')).toBeUndefined()
  })

  it('produces a plain-text excerpt of at most 200 characters', () => {
    const excerpt = makeExcerpt(`<p>${'word '.repeat(100)}</p>`)
    expect(excerpt!.length).toBeLessThanOrEqual(200)
    expect(excerpt).not.toContain('<')
  })
})
