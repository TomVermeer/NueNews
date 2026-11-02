import { zValidator } from '@hono/zod-validator'
import type { ErrorHandler, NotFoundHandler, ValidationTargets } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ZodType } from 'zod'
import type { ApiErrorBody } from '@nuenews/shared'
import { HttpError } from './lib/http'
import { BlockedUrlError } from './lib/ssrf'
import { ProviderError } from './providers/errors'

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const notFound = (what: string): ApiError =>
  new ApiError(404, 'not_found', `${what} not found`)

/** Validates a request part and reports problems in the API's standard error shape. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- zValidator's inferred type carries the validated input into the routes
export function validate<S extends ZodType, T extends keyof ValidationTargets>(
  target: T,
  schema: S,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || target}: ${issue.message}`)
        .join('; ')
      throw new ApiError(400, 'invalid_request', message)
    }
  })
}

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message } }
    return c.json(body, error.status)
  }
  if (error instanceof BlockedUrlError) {
    const body: ApiErrorBody = { error: { code: 'blocked_url', message: error.message } }
    return c.json(body, 422)
  }
  if (error instanceof ProviderError || error instanceof HttpError) {
    const body: ApiErrorBody = { error: { code: 'source_error', message: error.message } }
    return c.json(body, 422)
  }
  // Malformed JSON bodies and similar client mistakes come through as HTTPException.
  if ('getResponse' in error && typeof error.getResponse === 'function') {
    return error.getResponse()
  }
  console.error('Unhandled error', error)
  const body: ApiErrorBody = { error: { code: 'internal_error', message: 'Something went wrong' } }
  return c.json(body, 500)
}

export const notFoundHandler: NotFoundHandler = (c) => {
  const body: ApiErrorBody = { error: { code: 'not_found', message: 'No such route' } }
  return c.json(body, 404)
}
