import { describe, expect, it } from 'vitest'
import { bearerToken } from './bearer'

describe('bearerToken', () => {
  it('reads the token after "Bearer", in any case', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('bearer abc')).toBe('abc')
    expect(bearerToken('BEARER abc')).toBe('abc')
  })

  it('has no token without a header, another scheme or an empty token', () => {
    expect(bearerToken(null)).toBeUndefined()
    expect(bearerToken(undefined)).toBeUndefined()
    expect(bearerToken('')).toBeUndefined()
    expect(bearerToken('Basic abc')).toBeUndefined()
    expect(bearerToken('Bearer')).toBeUndefined()
    expect(bearerToken('Bearer ')).toBeUndefined()
  })

  it('splits on single spaces only, like before', () => {
    expect(bearerToken('Bearer  abc')).toBeUndefined()
    expect(bearerToken('Bearer abc def')).toBe('abc')
  })
})
