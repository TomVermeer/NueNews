import { eq } from 'drizzle-orm'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type JWTPayload,
} from 'jose'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import { freshDb } from '../test/helpers'
import { createSupabaseAuthenticator } from './supabase'

const URL_BASE = 'https://project.supabase.co'
const ISSUER = `${URL_BASE}/auth/v1`
const SECRET = 'a-legacy-project-shared-secret-of-sufficient-length'

let db: Db
let privateKey: CryptoKey
let otherPrivateKey: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const pair = await generateKeyPair('ES256')
  const other = await generateKeyPair('ES256')
  privateKey = pair.privateKey
  otherPrivateKey = other.privateKey
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'key-1', alg: 'ES256', use: 'sig' }
  jwks = createLocalJWKSet({ keys: [jwk] })
})

beforeEach(async () => {
  db = await freshDb()
})

interface TokenOptions {
  claims?: JWTPayload
  issuer?: string
  audience?: string
  expires?: string
  key?: CryptoKey
}

async function token({
  claims = { email: 'me@example.com' },
  issuer = ISSUER,
  audience = 'authenticated',
  expires = '1h',
  key = privateKey,
}: TokenOptions = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
    .setSubject('user-1')
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expires)
    .sign(key)
}

const bearer = (value: string) => new Headers({ authorization: `Bearer ${value}` })
const authenticator = () => createSupabaseAuthenticator({ db, supabaseUrl: URL_BASE, keys: jwks })

describe('createSupabaseAuthenticator (public keys)', () => {
  it('accepts a valid token and says who the user is', async () => {
    expect(await authenticator()(bearer(await token()))).toEqual({
      id: 'user-1',
      email: 'me@example.com',
    })
  })

  it('creates the user row on first sight, and only once', async () => {
    const authenticate = authenticator()
    await authenticate(bearer(await token()))
    await authenticate(bearer(await token()))

    const rows = await db.select().from(users).where(eq(users.id, 'user-1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ email: 'me@example.com', name: 'me@example.com' })
  })

  it('does not trust a token without a user id or from an anonymous sign-in', async () => {
    const noSubject = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(privateKey)
    expect(await authenticator()(bearer(noSubject))).toBeUndefined()

    const anonymous = await token({ claims: { is_anonymous: true } })
    expect(await authenticator()(bearer(anonymous))).toBeUndefined()
  })

  it.each([
    ['an expired token', () => token({ expires: '-1m' })],
    ['a token for another project', () => token({ issuer: 'https://evil.supabase.co/auth/v1' })],
    ['a token for another audience', () => token({ audience: 'service_role' })],
    ['a token signed with another key', () => token({ key: otherPrivateKey })],
    ['garbage', async () => 'not-a-token'],
  ])('rejects %s', async (_name, make) => {
    expect(await authenticator()(bearer(await make()))).toBeUndefined()
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('rejects a missing header and other schemes', async () => {
    const authenticate = authenticator()
    expect(await authenticate(new Headers())).toBeUndefined()
    expect(await authenticate(new Headers({ authorization: 'Basic abc' }))).toBeUndefined()
    expect(await authenticate(new Headers({ authorization: 'Bearer' }))).toBeUndefined()
  })

  it('rejects a token that claims no signature at all', async () => {
    const unsigned = `${btoa('{"alg":"none"}')}.${btoa(`{"sub":"user-1","iss":"${ISSUER}","aud":"authenticated"}`)}.`
    expect(await authenticator()(bearer(unsigned))).toBeUndefined()
  })
})

describe('createSupabaseAuthenticator (shared secret)', () => {
  const withSecret = () =>
    createSupabaseAuthenticator({ db, supabaseUrl: `${URL_BASE}/`, jwtSecret: SECRET })

  async function secretToken(secret = SECRET) {
    return new SignJWT({ email: 'me@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret))
  }

  it('accepts a token signed with the project secret', async () => {
    expect(await withSecret()(bearer(await secretToken()))).toMatchObject({ id: 'user-1' })
  })

  it('rejects a token signed with another secret', async () => {
    const forged = await secretToken('some-other-secret-that-is-long-enough!!')
    expect(await withSecret()(bearer(forged))).toBeUndefined()
  })

  it('does not accept public-key tokens when a secret is configured', async () => {
    expect(await withSecret()(bearer(await token()))).toBeUndefined()
  })
})
