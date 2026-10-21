import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

const FOREVER = 'public, max-age=31536000, immutable'

/**
 * Serves the built web app (`apps/web/dist`) from the API, so one service hosts everything on
 * one address: no CORS, and the login session needs no cross-site cookies.
 *
 * - Files under /assets have hashed names, so browsers may keep them forever.
 * - index.html is never cached, so a new deploy shows up at the next visit.
 * - Any other page path (like /d/abc) is a page of the single-page app and gets index.html.
 * - Paths that look like files (or sit under /assets) that do not exist are a plain 404, never
 *   index.html: a stale script address must fail loudly, not be cached as if it were the file.
 * - /api and /internal paths are never answered with the app, so a typo there stays a JSON 404.
 */
export function webRoutes(distDir: string) {
  if (!existsSync(`${distDir}/index.html`)) return undefined

  // serveStatic wants a path relative to the working directory.
  const root = relative(process.cwd(), distDir) || '.'
  const isBackend = (path: string) => path.startsWith('/api/') || path.startsWith('/internal/')
  const looksLikeFile = (path: string) => path.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(path)

  const files = serveStatic({ root })
  const indexPage = serveStatic({ root, path: 'index.html' })

  return new Hono()
    .use('*', async (c, next) => {
      if (isBackend(c.req.path)) return c.notFound()
      await next()

      // serveStatic builds its response before any hook could add headers, so they go on here.
      if (c.res.status !== 200 && c.res.status !== 206) return
      const isPage = c.res.headers.get('content-type')?.includes('text/html') ?? false
      const hashed = c.req.path.startsWith('/assets/') && !isPage
      c.res.headers.set('Cache-Control', hashed ? FOREVER : 'no-cache')
    })
    .get('*', files)
    .get('*', async (c, next) => {
      if (looksLikeFile(c.req.path)) return c.notFound()
      return indexPage(c, next)
    })
}
