import dns from 'node:dns'
import { isIP } from 'node:net'

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockedUrlError'
  }
}

function isPrivateIPv4(ip: string): boolean {
  const [a = 0, b = 0, c = 0] = ip.split('.').map(Number)
  return (
    a === 0 || // "this" network
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  )
}

/** Expands an IPv6 address into its eight 16-bit groups. */
function parseIPv6(address: string): number[] {
  let text = address.toLowerCase()
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)

  // An embedded IPv4 tail (e.g. ::ffff:1.2.3.4) becomes two hex groups.
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.split('.').map(Number)
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const [head = '', rest] = text.split('::')
  const headGroups = head ? head.split(':') : []
  const restGroups = rest === undefined ? [] : rest ? rest.split(':') : []
  const missing = 8 - headGroups.length - restGroups.length
  const groups =
    rest === undefined ? headGroups : [...headGroups, ...Array(missing).fill('0'), ...restGroups]
  return groups.map((g) => parseInt(g, 16))
}

function embeddedIPv4(high: number, low: number): string {
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

function isPrivateIPv6(address: string): boolean {
  const g = parseIPv6(address)
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g

  if (g.slice(0, 7).every((n) => n === 0) && (g7 === 0 || g7 === 1)) return true // :: and ::1
  if ((g0 & 0xfe00) === 0xfc00) return true // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((g0 & 0xff00) === 0xff00) return true // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // documentation

  // IPv4 embedded in IPv6: judge it by the IPv4 rules.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isPrivateIPv4(embeddedIPv4(g6, g7)) // IPv4-mapped
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateIPv4(embeddedIPv4(g6, g7)) // NAT64
  }
  if (g0 === 0x2002) return isPrivateIPv4(embeddedIPv4(g1, g2)) // 6to4

  return false
}

/** True for loopback, private, link-local, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address.replace(/%.*$/, ''))
  if (version === 4) return isPrivateIPv4(address)
  if (version === 6) return isPrivateIPv6(address)
  return true // not an IP at all: refuse rather than guess
}

/** Synchronous checks on a URL before any request is made. */
export function checkUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new BlockedUrlError(`Invalid URL: ${input}`)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError(`Only http and https URLs are allowed (got ${url.protocol})`)
  }
  if (url.username || url.password) {
    throw new BlockedUrlError('URLs with credentials are not allowed')
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new BlockedUrlError('Local addresses are not allowed')
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw new BlockedUrlError('Private and local addresses are not allowed')
  }
  return url
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number,
) => void

type LookupFn = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void

/**
 * A DNS lookup for sockets that refuses private results. Because it runs when the connection is
 * made, it also stops DNS rebinding (a name that resolves to a public address when checked and a
 * private one when used).
 */
export function createGuardedLookup(resolve: LookupFn = dns.lookup as LookupFn) {
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err)
      const blocked = addresses.find((a) => isPrivateAddress(a.address))
      if (blocked) {
        return callback(new BlockedUrlError(`${hostname} resolves to a private address`))
      }
      if (options.all) return callback(null, addresses)
      const first = addresses[0]
      if (!first) return callback(new Error(`No addresses found for ${hostname}`))
      callback(null, first.address, first.family)
    })
  }
}
