/** Every environment variable the API reads. Their names live here and nowhere else. */
export interface Env {
  readonly PORT?: string
  /** A postgres:// URL for a real server; anything else is a folder for local PGlite data. */
  readonly DATABASE_URL?: string
  readonly USER_AGENT?: string
  readonly NODE_ENV?: string
  /** Turns on POST /internal/tick for hosts that sleep and need an outside trigger. */
  readonly CRON_SECRET?: string
  readonly SUPABASE_URL?: string
  /** Only for legacy Supabase projects that sign tokens with a shared secret. */
  readonly SUPABASE_JWT_SECRET?: string
}

/** The settings that choose how requests are authenticated (see `auth/config.ts`). */
export type AuthEnv = Pick<Env, 'NODE_ENV' | 'SUPABASE_URL' | 'SUPABASE_JWT_SECRET'>

/** The API's settings, typed and with their defaults filled in. */
export interface Settings {
  readonly port: number
  readonly databaseLocation: string
  readonly userAgent: string
  readonly production: boolean
  readonly cronSecret?: string
  readonly auth: AuthEnv
}

const DEFAULT_PORT = 3000
const DEFAULT_DATABASE_LOCATION = './data/pglite'
const DEFAULT_USER_AGENT = 'NueNews/0.1 (personal dashboard)'

/** Reads the API's settings from an environment such as `process.env`. */
export function readEnv(source: Env): Settings {
  return {
    port: Number(source.PORT ?? DEFAULT_PORT),
    databaseLocation: source.DATABASE_URL ?? DEFAULT_DATABASE_LOCATION,
    userAgent: source.USER_AGENT ?? DEFAULT_USER_AGENT,
    production: source.NODE_ENV === 'production',
    cronSecret: source.CRON_SECRET,
    auth: {
      NODE_ENV: source.NODE_ENV,
      SUPABASE_URL: source.SUPABASE_URL,
      SUPABASE_JWT_SECRET: source.SUPABASE_JWT_SECRET,
    },
  }
}
