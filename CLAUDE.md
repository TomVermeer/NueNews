# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NueNews is a personal dashboard: a grid of widgets (feed lists, YouTube channels, weather) fed by third-party sites. It is single-user today but built so multi-user can be added later. [README.md](README.md) and [docs/DESIGN.md](docs/DESIGN.md) hold the full design; this file covers what is easy to miss.

## Commands

pnpm workspace (Node 22+, pnpm 10). Run from the repo root:

```bash
pnpm dev                 # API on :3000 and Vite on :5273 (Vite proxies /api to the API)
pnpm test                # Vitest in every package
pnpm typecheck           # tsc (shared, api) and vue-tsc (web)
pnpm lint && pnpm format:check
pnpm build               # type-checks and builds the web app only
```

CI runs lint, format:check, typecheck, test and build; run all of them before finishing a change.

Single package, file or test:

```bash
pnpm --filter @nuenews/api exec vitest run src/routes/widgets.test.ts
pnpm --filter @nuenews/web exec vitest run src/pages -t "saves the layout"
pnpm --filter @nuenews/api db:generate   # new SQL migration after editing apps/api/src/db/schema.ts
```

The dev port is 5273 on purpose (see `strictPort` in `apps/web/vite.config.ts`); don't change it back to 5173.

## Architecture

Monorepo: `apps/api` (Hono + Drizzle/SQLite), `apps/web` (Vue 3 + Tailwind v4), `packages/shared` (Zod schemas and types). `shared` has no build step: packages import its TypeScript source directly.

**Type flow between API and web.** `createApp(deps)` in `apps/api/src/app.ts` builds the Hono app and exports `AppType`; the web app builds a typed `hc<AppType>` client from it (`apps/web/src/api/client.ts`) and derives its response types with `InferResponseType` (`api/types.ts`). Routes must stay chained (`new Hono().get(...).post(...)`) or the client types are lost. `createApp` takes all dependencies (db, provider registry, HTTP client, clock, current user), which is how tests run the whole API in memory.

**Data pipeline.** Browsers never call third-party sites. A _provider_ (`apps/api/src/providers/*`, interface in `types.ts`) turns a stored _source_ into normalized items. A scheduler (`scheduler/`) polls due sources, upserts items into SQLite, and backs off on errors. Widgets only read cached items: `GET /widgets/:id/data`. Sources are shared across widgets and users (unique on kind + key); widgets link to them through `widget_sources`. Widgets are created with canonical source keys (a feed URL or YouTube channel ID), so saving a widget never needs the network to resolve a name. Users resolve addresses first with `POST /sources/resolve`. Weather is the exception: it has no source row and is cached in `weather_cache`.

**All outbound requests go through `lib/http.ts` and `lib/ssrf.ts`.** They block private and local addresses (including at connect time, against DNS rebinding), re-check every redirect, and cap size and time. Never use `fetch` directly for user-supplied or feed-supplied URLs. Providers receive the client through `FetchContext`, never import it.

**User scoping.** Every user-owned table has `user_id` and every route query is scoped to `c.get('userId')`, but v1 has no login: `currentUserId()` returns the seeded `local` user. Keep new queries user-scoped.

**Adding a widget type** touches: the Zod config in `packages/shared/src/widgets.ts` (and the discriminated union in `api.ts`), `AVAILABLE_WIDGET_TYPES`, `sourceRefsFor`/`sourceLabels` and the data route in `apps/api`, plus a widget component, a form and an entry in `lib/widgetTypes.ts` in `apps/web`. RoyalRoad exists in the schemas but is deliberately rejected by the API (`widget_type_unavailable`) until its provider exists.

**Frontend.** TanStack Query owns server state; Pinia (`stores/editor.ts`) holds only UI state. Edit mode works on a draft (`composables/useLayoutDraft.ts`) that is sent in one `PUT /dashboards/:id/layout` on Save, while add/settings actions in the panel save immediately.

## Conventions that matter

- **Headline and handoff** (core product rule): show only what the publisher's feed provides, with excerpts cut to about 200 characters of plain text. Never scrape article bodies or embed content. Every item is a link with `target="_blank" rel="noopener noreferrer"`, thumbnails are hotlinked with `referrerpolicy="no-referrer"`, and the weather widget must show its Open-Meteo attribution.
- Dark mode only, spacious card style; design tokens (`canvas`, `card`, `line`, `ink`, `accent`) are in `apps/web/src/style.css`.
- API errors always use `{ error: { code, message } }`; throw `ApiError`/`ProviderError` rather than building responses by hand.
- Fetchers identify themselves with `USER_AGENT` and must stay polite: conditional requests (ETag), exponential backoff, honour `Retry-After`.
- Reddit's RSS currently answers `429` for unauthenticated clients. Don't work around it by spoofing a browser; it needs OAuth.
- Commits end with the co-author trailer in use in this repo's history. The repo is local only (no remote yet).

## Testing notes

- API tests build the real app on an in-memory SQLite database with a scripted fake provider (`apps/api/src/test/helpers.ts`, `createTestApp`). Provider tests use saved fixtures in `__fixtures__/` and never touch the network. Keep it that way.
- Web tests use `src/test/fakeApi.ts`, a recording fake of the typed client, mocked per test file with `vi.mock('../api/client', ...)`. Mount with `mountApp` (Pinia, Query, router installed). `grid-layout-plus` is mocked in page tests because happy-dom cannot measure layout, so drag and resize are not unit-tested; check them in a real browser.
- Vitest gotcha: a `beforeEach(() => mock.mockReset())` arrow that returns the mock makes Vitest call it as teardown. Use braces.
- `grid-layout-plus` ignores drags that start on `<a>`/`<button>` unless `drag-ignore-from` is set; the drag handle is a button.
