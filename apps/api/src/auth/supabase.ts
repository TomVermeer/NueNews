import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import type { Authenticator } from './types'

export interface SupabaseAuthOptions {
  db: Db
  /** The project URL, e.g. https://abcd.supabase.co. Tokens must be issued by it. */
  supabaseUrl: string
  /** Legacy projects sign tokens with a shared secret (HS256). Newer ones publish public keys. */
  jwtSecret?: string
  /** Where to find the public keys. Defaults to the project's JWKS address; tests inject their own. */
  keys?: JWTVerifyGetKey
}

const ASYMMETRIC = ['ES256', 'RS256', 'EdDSA']

/**
 * Accepts a Supabase Auth access token (`Authorization: Bearer …`), checks its signature, issuer,
 * audience and expiry, and makes sure the user has a row so their data can point at it.
 */
export function createSupabaseAuthenticator(options: SupabaseAuthOptions): Authenticator {
  const base = options.supabaseUrl.replace(/\/+$/, '')
  const issuer = `${base}/auth/v1`
  const secret = options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : undefined
  const keys =
    options.keys ??
    createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cooldownDuration: 30_000 })
  const known = new Set<string>()

  async function ensureUser(id: string, email?: string) {
    if (known.has(id)) return
    await options.db
      .insert(users)
      .values({ id, email: email ?? null, name: email ?? 'User' })
      .onConflictDoNothing()
    known.add(id)
  }

  return async (headers) => {
    const [scheme, token] = (headers.get('authorization') ?? '').split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined

    try {
      const verified = { issuer, audience: 'authenticated' }
      const { payload } = secret
        ? await jwtVerify(token, secret, { ...verified, algorithms: ['HS256'] })
        : await jwtVerify(token, keys, { ...verified, algorithms: ASYMMETRIC })

      // Anonymous sign-ins get a valid token too, but they are not people we invited.
      if (!payload.sub || payload.is_anonymous === true) return undefined
      const email = typeof payload.email === 'string' ? payload.email : undefined
      await ensureUser(payload.sub, email)
      return { id: payload.sub, email }
    } catch {
      // A bad, expired or forged token is the same as no token.
      return undefined
    }
  }
}
