import { describe, expect, it, vi } from 'vitest'
import { createHttpClient, HttpError, type FetchLike } from './http'
import { BlockedUrlError } from './ssrf'

const UA = 'NueNewsTest/1.0'

function client(fetchImpl: FetchLike, options: { timeoutMs?: number; maxBytes?: number } = {}) {
  return createHttpClient({ userAgent: UA, fetchImpl, ...options })
}

function respond(body: string | null, init: ResponseInit = {}): Response {
  return new Response(body, init)
}

describe('createHttpClient', () => {
  it('returns status, headers, final URL and body, and sends the User-Agent', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      respond('<rss/>', { status: 200, headers: { etag: '"abc"' } }),
    )
    const res = await client(fetchImpl).get('https://example.com/feed', {
      headers: { accept: 'application/rss+xml' },
    })

    expect(res).toMatchObject({ status: 200, url: 'https://example.com/feed', body: '<rss/>' })
    expect(res.headers.get('etag')).toBe('"abc"')
    const [, init] = fetchImpl.mock.calls[0]!
    expect(init.headers).toMatchObject({ 'user-agent': UA, accept: 'application/rss+xml' })
    expect(init.redirect).toBe('manual')
  })

  it('does not throw on error statuses and gives 304 an empty body', async () => {
    const notFound = await client(async () => respond('nope', { status: 404 })).get(
      'https://example.com/x',
    )
    expect(notFound).toMatchObject({ status: 404, body: 'nope' })

    const notModified = await client(async () => respond(null, { status: 304 })).get(
      'https://example.com/x',
    )
    expect(notModified).toMatchObject({ status: 304, body: '' })
  })

  it('refuses blocked URLs before making any request', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    await expect(client(fetchImpl).get('http://127.0.0.1/admin')).rejects.toBeInstanceOf(
      BlockedUrlError,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('redirects', () => {
  it('follows redirects, resolving relative locations, and reports the final URL', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) =>
      url.endsWith('/old')
        ? respond(null, { status: 301, headers: { location: '/new' } })
        : respond('final'),
    )
    const res = await client(fetchImpl).get('https://example.com/old')
    expect(res).toMatchObject({ url: 'https://example.com/new', body: 'final' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('checks every hop: a redirect into a private address is blocked', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      respond(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }),
    )
    await expect(client(fetchImpl).get('https://example.com/a')).rejects.toBeInstanceOf(
      BlockedUrlError,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('gives up after too many redirects', async () => {
    const fetchImpl: FetchLike = async () =>
      respond(null, { status: 302, headers: { location: 'https://example.com/loop' } })
    await expect(client(fetchImpl).get('https://example.com/loop')).rejects.toMatchObject({
      code: 'too_many_redirects',
    })
  })
})

describe('limits', () => {
  it('rejects a response that declares a size over the limit', async () => {
    const fetchImpl: FetchLike = async () => respond('x', { headers: { 'content-length': '5000' } })
    await expect(
      client(fetchImpl, { maxBytes: 1000 }).get('https://example.com/'),
    ).rejects.toMatchObject({ code: 'too_large' })
  })

  it('stops reading a body that grows past the limit', async () => {
    const fetchImpl: FetchLike = async () => respond('x'.repeat(5000))
    await expect(
      client(fetchImpl, { maxBytes: 1000 }).get('https://example.com/'),
    ).rejects.toBeInstanceOf(HttpError)
  })

  it('times out slow servers', async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    await expect(
      client(fetchImpl, { timeoutMs: 20 }).get('https://example.com/'),
    ).rejects.toMatchObject({ code: 'timeout' })
  })

  it('wraps network failures', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(client(fetchImpl).get('https://example.com/')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('surfaces a connection-time block (DNS rebinding) as BlockedUrlError', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed', {
        cause: new BlockedUrlError('evil.example resolves to a private address'),
      })
    }
    await expect(client(fetchImpl).get('https://evil.example/')).rejects.toBeInstanceOf(
      BlockedUrlError,
    )
  })
})
