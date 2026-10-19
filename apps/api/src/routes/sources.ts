import { Hono } from 'hono'
import { resolveSourceSchema } from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { ApiError, validate } from '../http'
import { UnknownProviderError } from '../providers/registry'

export function sourceRoutes({ registry, fetchContext }: AppDeps) {
  return new Hono<Env>().post('/resolve', validate('json', resolveSourceSchema), async (c) => {
    const { kind, input } = c.req.valid('json')
    try {
      return c.json(await registry.get(kind).resolve(input, fetchContext))
    } catch (error) {
      if (error instanceof UnknownProviderError) {
        throw new ApiError(
          422,
          'source_kind_unavailable',
          `"${kind}" sources are not available yet`,
        )
      }
      throw error // provider and blocked-URL errors are translated by the error handler
    }
  })
}
