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

/** A validation problem, as Zod reports it. */
export interface Issue {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

/** Validation problems as one message, "path: message; …", with each path named by `describePath`. */
export function formatIssues(
  issues: readonly Issue[],
  describePath: (path: string) => string,
): string {
  return issues.map((issue) => `${describePath(issue.path.join('.'))}: ${issue.message}`).join('; ')
}

/** The API's standard error shape. */
export function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } }
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
      const message = formatIssues(result.error.issues, (path) => path || target)
      throw new ApiError(400, 'invalid_request', message)
    }
  })
}

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) {
    return c.json(errorBody(error.code, error.message), error.status)
  }
  if (error instanceof BlockedUrlError) {
    return c.json(errorBody('blocked_url', error.message), 422)
  }
  if (error instanceof ProviderError || error instanceof HttpError) {
    return c.json(errorBody('source_error', error.message), 422)
  }
  // Malformed JSON bodies and similar client mistakes come through as HTTPException.
  if ('getResponse' in error && typeof error.getResponse === 'function') {
    return error.getResponse()
  }
  console.error('Unhandled error', error)
  return c.json(errorBody('internal_error', 'Something went wrong'), 500)
}

export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(errorBody('not_found', 'No such route'), 404)
}
