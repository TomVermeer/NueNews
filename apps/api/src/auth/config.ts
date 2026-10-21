import type { Db } from '../db/client'
import { ensureLocalUser } from '../db/seed'
import { createSupabaseAuthenticator } from './supabase'
import type { Authenticator } from './types'

export interface AuthEnv {
  NODE_ENV?: string
  SUPABASE_URL?: string
  SUPABASE_JWT_SECRET?: string
}

/**
 * Picks how requests are authenticated from the environment.
 * - With `SUPABASE_URL`: every request needs a valid Supabase session token.
 * - Without it, outside production: no login, everything runs as the single local user
 *   (development and tests).
 * - Without it in production: refuse to start, so a missing setting can never leave the API open.
 */
export async function createAuthenticator(env: AuthEnv, db: Db): Promise<Authenticator> {
  if (env.SUPABASE_URL) {
    return createSupabaseAuthenticator({
      db,
      supabaseUrl: env.SUPABASE_URL,
      jwtSecret: env.SUPABASE_JWT_SECRET || undefined,
    })
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('SUPABASE_URL is required in production, so that the API is not left open')
  }

  const userId = await ensureLocalUser(db)
  return async () => ({ id: userId })
}
