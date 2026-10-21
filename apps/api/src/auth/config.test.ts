import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { LOCAL_USER_ID } from '../db/seed'
import { freshDb } from '../test/helpers'
import { createAuthenticator } from './config'

let db: Db

beforeEach(async () => {
  db = await freshDb()
})

describe('createAuthenticator', () => {
  it('runs as the local user without any login in development', async () => {
    const authenticate = await createAuthenticator({}, db)
    expect(await authenticate(new Headers())).toEqual({ id: LOCAL_USER_ID })
  })

  it('refuses to start in production without Supabase, rather than leaving the API open', async () => {
    await expect(createAuthenticator({ NODE_ENV: 'production' }, db)).rejects.toThrow(
      /SUPABASE_URL is required in production/,
    )
  })

  it('requires a session token once Supabase is configured', async () => {
    const authenticate = await createAuthenticator({ SUPABASE_URL: 'https://p.supabase.co' }, db)
    expect(await authenticate(new Headers())).toBeUndefined()
    expect(await authenticate(new Headers({ authorization: 'Bearer nope' }))).toBeUndefined()
  })

  it('treats an empty secret as not set', async () => {
    const authenticate = await createAuthenticator(
      { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_JWT_SECRET: '' },
      db,
    )
    expect(await authenticate(new Headers())).toBeUndefined()
  })
})
