import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('reads the message of an Error', () => {
    expect(errorMessage(new TypeError('fetch failed'))).toBe('fetch failed')
  })

  it('describes anything else that was thrown', () => {
    expect(errorMessage('socket hang up')).toBe('socket hang up')
    expect(errorMessage(undefined)).toBe('undefined')
  })
})
