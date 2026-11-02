import { describe, expect, it } from 'vitest'
import { assertOk, ProviderError } from './errors'

const response = (status: number, headers: Record<string, string> = {}) => ({
  status,
  headers: new Headers(headers),
})

function thrown(run: () => void): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return undefined
}

describe('assertOk', () => {
  it('accepts every 2xx answer', () => {
    for (const status of [200, 204, 299]) {
      expect(() => assertOk(response(status), { service: 'The site' })).not.toThrow()
    }
  })

  it('throws a ProviderError with the status for anything else', () => {
    const error = thrown(() => assertOk(response(500), { service: 'The site' }))
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({
      message: 'The site answered with HTTP 500',
      status: 500,
      retryAfterSeconds: undefined,
    })
    expect(thrown(() => assertOk(response(304), { service: 'The site' }))).toBeInstanceOf(
      ProviderError,
    )
  })

  it('reads the wait time from the first retry header that is present', () => {
    const headers = ['retry-after', 'x-ratelimit-reset']
    expect(
      thrown(() =>
        assertOk(response(429, { 'x-ratelimit-reset': '30' }), {
          service: 'The site',
          retryAfterHeaders: headers,
        }),
      ),
    ).toMatchObject({ retryAfterSeconds: 30 })
    expect(
      thrown(() =>
        assertOk(response(429, { 'retry-after': '5', 'x-ratelimit-reset': '30' }), {
          service: 'The site',
          retryAfterHeaders: headers,
        }),
      ),
    ).toMatchObject({ retryAfterSeconds: 5 })
  })

  it('only looks at Retry-After unless told otherwise', () => {
    expect(
      thrown(() =>
        assertOk(response(503, { 'x-ratelimit-reset': '30' }), {
          service: 'The weather service',
        }),
      ),
    ).toMatchObject({
      message: 'The weather service answered with HTTP 503',
      retryAfterSeconds: undefined,
    })
  })
})
