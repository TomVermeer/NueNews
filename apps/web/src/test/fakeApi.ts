/**
 * A stand-in for the typed Hono client. Tests register answers per route, and every request is
 * recorded, so components can be exercised end to end without a server.
 *
 * Paths look like the client's own property chain: api.dashboards[':id'].layout.$put(...) is
 * "PUT dashboards/:id/layout".
 */
type Responder = (
  args: any,
) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>

export interface RecordedCall {
  key: string
  args: any
}

const routes = new Map<string, Responder>()
export const calls: RecordedCall[] = []

async function dispatch(method: string, path: string, args: unknown) {
  const key = `${method} ${path}`
  calls.push({ key, args })
  const responder = routes.get(key)
  if (!responder) throw new Error(`No fake registered for ${key}`)
  const { status = 200, body = null } = await responder(args)
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function proxyFor(path: string[]): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop.startsWith('$')) {
        return (args?: unknown) => dispatch(prop.slice(1).toUpperCase(), path.join('/'), args)
      }
      return proxyFor([...path, prop])
    },
  })
}

export const fakeApi = {
  api: proxyFor([]) as any,

  /** Answer `METHOD path` with a fixed body (or a function of the request). */
  on(key: string, answer: Responder | { status?: number; body?: unknown }) {
    routes.set(key, typeof answer === 'function' ? answer : () => answer)
  },

  reset() {
    routes.clear()
    calls.length = 0
  },

  /** Requests made so far to `key`, oldest first. */
  callsTo(key: string) {
    return calls.filter((call) => call.key === key)
  },
}
