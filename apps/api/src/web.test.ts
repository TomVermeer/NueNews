import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './test/helpers'

let dist: string

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'nuenews-dist-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(
    join(dist, 'index.html'),
    '<!doctype html><title>NueNews</title><div id="app"></div>',
  )
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log("app")')
  writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
})

afterAll(() => rmSync(dist, { recursive: true, force: true }))

const serving = () => createTestApp({}, { webRoot: dist })

describe('serving the web app', () => {
  it('answers the home page with index.html, never cached', async () => {
    const { app } = await serving()
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<div id="app">')
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })

  it('lets browsers keep hashed assets forever', async () => {
    const { app } = await serving()
    const res = await app.request('/assets/app-abc123.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('console.log')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('serves other files that are really there', async () => {
    const { app } = await serving()
    const res = await app.request('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('svg')
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })

  it('gives page paths of the single-page app index.html, so a reload on /d/abc works', async () => {
    const { app } = await serving()
    for (const path of ['/d/6898e5a1', '/login', '/anything/else']) {
      const res = await app.request(path)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<div id="app">')
    }
  })

  it('never answers a backend path with the app', async () => {
    const signedOut = await createTestApp(
      {},
      { webRoot: dist, authenticate: async () => undefined },
    )
    const missing = await signedOut.app.request('/api/v1/nope')
    expect(missing.status).toBe(401) // signed out, so even unknown paths say "sign in"
    expect(missing.headers.get('content-type')).toContain('json')

    const signedIn = await serving()
    const unknown = await signedIn.call('GET', '/nope')
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.code).toBe('not_found')

    const internal = await signedIn.app.request('/internal/nope')
    expect(internal.status).toBe(404)
    expect(await internal.text()).not.toContain('<div id="app">')
  })

  it('does not hand index.html to a file that is missing', async () => {
    const { app } = await serving()
    for (const path of ['/assets/app-old999.js', '/missing.png', '/favicon.ico']) {
      const res = await app.request(path)
      expect(res.status).toBe(404)
      expect(await res.text()).not.toContain('<div id="app">')
      expect(res.headers.get('cache-control') ?? '').not.toContain('immutable')
    }
  })

  it('keeps the API working next to it', async () => {
    const { call } = await serving()
    expect((await call('GET', '/health')).body).toEqual({ status: 'ok' })
    expect((await call('GET', '/dashboards')).status).toBe(200)
  })

  it('sends basic security headers', async () => {
    const { app } = await serving()
    const res = await app.request('/')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBeTruthy()
  })

  it('serves nothing when the build is missing, instead of failing', async () => {
    const { app } = await createTestApp({}, { webRoot: join(dist, 'does-not-exist') })
    expect((await app.request('/')).status).toBe(404)
  })

  it('does not serve the app unless asked to', async () => {
    const { app } = await createTestApp()
    expect((await app.request('/')).status).toBe(404)
  })
})
