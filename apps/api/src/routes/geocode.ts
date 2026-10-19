import { Hono } from 'hono'
import { z } from 'zod'
import type { AppDeps, Env } from '../context'
import { validate } from '../http'
import { searchLocations } from '../weather/service'

const querySchema = z.object({ q: z.string().trim().min(2).max(100) })

export function geocodeRoutes({ fetchContext }: AppDeps) {
  return new Hono<Env>().get('/', validate('query', querySchema), async (c) =>
    c.json({ results: await searchLocations(fetchContext.http, c.req.valid('query').q) }),
  )
}
