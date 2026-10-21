import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { ApiError } from '../http'

export interface InternalOptions {
  /** The shared secret the cron job sends as `Authorization: Bearer <secret>`. */
  secret: string
  /** Runs one polling pass over the sources that are due; resolves with how many were refreshed. */
  tick: () => Promise<number>
}

const digest = (value: string) => createHash('sha256').update(value).digest()

/** Compares in constant time, so the secret cannot be guessed from response timing. */
function matches(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected))
}

/**
 * Endpoints for machines, not people: a free host puts the service to sleep when idle, so an
 * outside cron calls this every few minutes to refresh feeds (and wake the service while at it).
 */
export function internalRoutes({ secret, tick }: InternalOptions) {
  return new Hono().post('/tick', async (c) => {
    const [scheme, given] = (c.req.header('authorization') ?? '').split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !given || !matches(given, secret)) {
      throw new ApiError(401, 'unauthorized', 'Missing or wrong secret')
    }
    return c.json({ refreshed: await tick() })
  })
}
