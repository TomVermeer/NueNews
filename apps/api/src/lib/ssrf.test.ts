import { describe, expect, it } from 'vitest'
import { BlockedUrlError, checkUrl, createGuardedLookup, isPrivateAddress } from './ssrf'

describe('isPrivateAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
  ])('treats %s as private', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.0.1',
    '172.32.0.1',
    '100.63.0.1',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('treats %s as public', (address) => {
    expect(isPrivateAddress(address)).toBe(false)
  })

  it('refuses anything that is not an IP address', () => {
    expect(isPrivateAddress('example.com')).toBe(true)
  })
})

describe('checkUrl', () => {
  it('accepts normal http and https URLs', () => {
    expect(checkUrl('https://example.com/feed.xml').hostname).toBe('example.com')
    expect(checkUrl('http://example.com:8080/feed').port).toBe('8080')
  })

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/feed',
    'javascript:alert(1)',
    'not a url',
    'https://user:pass@example.com/feed',
    'http://localhost:3000/api',
    'http://app.localhost/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/', // 127.0.0.1 written as a single number
    'http://0x7f.0.0.1/',
  ])('blocks %s', (url) => {
    expect(() => checkUrl(url)).toThrow(BlockedUrlError)
  })
})

describe('createGuardedLookup', () => {
  type Resolve = Parameters<typeof createGuardedLookup>[0]

  const resolverFor =
    (addresses: { address: string; family: number }[]): Resolve =>
    (_host, _options, callback) =>
      callback(null, addresses)

  it('passes public addresses through', async () => {
    const lookup = createGuardedLookup(resolverFor([{ address: '93.184.216.34', family: 4 }]))
    const result = await new Promise((resolve, reject) =>
      lookup('example.com', {}, (err, address, family) =>
        err ? reject(err) : resolve({ address, family }),
      ),
    )
    expect(result).toEqual({ address: '93.184.216.34', family: 4 })
  })

  it('returns every address when asked for all', async () => {
    const addresses = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]
    const lookup = createGuardedLookup(resolverFor(addresses))
    const result = await new Promise((resolve, reject) =>
      lookup('example.com', { all: true }, (err, list) => (err ? reject(err) : resolve(list))),
    )
    expect(result).toEqual(addresses)
  })

  it('rejects a name that resolves to a private address (DNS rebinding)', async () => {
    const lookup = createGuardedLookup(resolverFor([{ address: '127.0.0.1', family: 4 }]))
    const error = await new Promise((resolve) => lookup('evil.example', {}, (err) => resolve(err)))
    expect(error).toBeInstanceOf(BlockedUrlError)
  })

  it('rejects when any one of several addresses is private', async () => {
    const lookup = createGuardedLookup(
      resolverFor([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]),
    )
    const error = await new Promise((resolve) =>
      lookup('mixed.example', { all: true }, (err) => resolve(err)),
    )
    expect(error).toBeInstanceOf(BlockedUrlError)
  })

  it('passes resolver errors on', async () => {
    const failing: Resolve = (_host, _options, callback) =>
      callback(new Error('ENOTFOUND') as NodeJS.ErrnoException, [])
    const lookup = createGuardedLookup(failing)
    const error = await new Promise<Error>((resolve) =>
      lookup('missing.example', {}, (err) => resolve(err as Error)),
    )
    expect(error.message).toBe('ENOTFOUND')
  })
})
