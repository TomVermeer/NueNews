import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

describe('readEnv', () => {
  it('fills in the defaults when nothing is set', () => {
    expect(readEnv({})).toEqual({
      port: 3000,
      databaseLocation: './data/pglite',
      userAgent: 'NueNews/0.1 (personal dashboard)',
      production: false,
      cronSecret: undefined,
      auth: { NODE_ENV: undefined, SUPABASE_URL: undefined, SUPABASE_JWT_SECRET: undefined },
    })
  })

  it('reads the port as a number', () => {
    expect(readEnv({ PORT: '8080' }).port).toBe(8080)
  })

  it('keeps a port that is not a number as NaN, as Number() does', () => {
    expect(readEnv({ PORT: 'abc' }).port).toBeNaN()
  })

  it('treats only NODE_ENV=production as production', () => {
    expect(readEnv({ NODE_ENV: 'production' }).production).toBe(true)
    expect(readEnv({ NODE_ENV: 'development' }).production).toBe(false)
  })

  it('passes the other settings through unchanged', () => {
    const settings = readEnv({
      DATABASE_URL: 'postgres://db.example.com/nuenews',
      USER_AGENT: 'Test/1.0',
      NODE_ENV: 'production',
      CRON_SECRET: 'cron',
      SUPABASE_URL: 'https://p.supabase.co',
      SUPABASE_JWT_SECRET: '',
    })
    expect(settings).toMatchObject({
      databaseLocation: 'postgres://db.example.com/nuenews',
      userAgent: 'Test/1.0',
      cronSecret: 'cron',
      auth: {
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://p.supabase.co',
        SUPABASE_JWT_SECRET: '',
      },
    })
  })

  it('ignores settings it does not know', () => {
    const environment: Record<string, string> = { PATH: '/usr/bin', HOME: '/home/user' }
    expect(readEnv(environment)).toEqual(readEnv({}))
  })
})
