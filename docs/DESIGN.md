# NueNews: plan and design

Status: v0.5. Backend and dashboard UI implemented except RoyalRoad (see README).

## 1. Stack

- Monorepo (pnpm workspaces): `apps/web` (Vue 3, Vite, TypeScript, Tailwind, dark mode only), `apps/api` (Hono on Node), `packages/shared` (types and Zod schemas).
- PostgreSQL with Drizzle ORM (PGlite in development and tests). Zod validation on every route. Hono typed RPC client (`hc`) for end-to-end types.
- Web: Pinia, Vue Router, TanStack Query, `grid-layout-plus`.

## 2. Design principles

1. **Headline and handoff.** Show only what the publisher put in the feed: title, short plain-text excerpt (about 200 chars), thumbnail, date, author. No full-text extraction, no in-app reader, no iframes. Every click opens the original URL in a new tab.
2. Always attribute (source name and favicon). Hotlink thumbnails; do not rehost media. Do not strip tracking parameters from links.
3. Polite fetching: clear `User-Agent` with a contact URL, conditional requests (`ETag`, `If-Modified-Since`), 15 to 60 minute intervals, honor `Retry-After` and `429`, one fetch per feed regardless of how many widgets or users use it.
4. YouTube links out by default (no embedded player). Reddit uses public RSS for personal use; revisit the terms before this becomes multi-user. Open-Meteo is free for non-commercial use only.
5. Spacious, card-like, dark mode only. Top-bar navigation only.
6. Every user-owned table carries `user_id` from day one. v1 runs as one seeded local user with no login.

## 3. Architecture

```
Vue app  --(typed fetch)-->  Hono API  --reads-->  PostgreSQL (items cache)
                                 ^                       ^
                                 |                       |
                         Scheduler (in-process) --> Providers --> external feeds
```

- **Provider (backend plugin):** `{ kind, configSchema, resolve(input), fetch(source, conditional) -> NormalizedItem[] }`. Adding an integration is one file plus one registry line.
- **Widget type (shared registry):** `{ type, configSchema, defaultLayout }` in `packages/shared`; the Vue component and settings form live in `apps/web`. The API exposes the registry so the UI can build forms from the schema.
- **Normalized item:** `{ externalId, title, url, excerpt?, imageUrl?, author?, publishedAt, meta? }`.
- **Scheduler:** a loop picks sources where `next_fetch_at <= now`, limits concurrency per host, backs off exponentially on errors, and prunes old items (keeps the newest 100 per source; there is no age limit, so quiet feeds keep their history).
- **Safety (matters for multi-user):** SSRF guard on user-supplied URLs (block private and loopback ranges, https/http only, no redirects into private ranges), 10 s timeout, 2 MB response cap, HTML sanitized to plain text, image URLs must be http(s).

## 4. Data model (Drizzle / PostgreSQL)

Shared tables (no `user_id`; one fetch serves everyone): `sources`, `items`, `weather_cache`.
User-owned tables: `users`, `dashboards`, `widgets`, `widget_sources`, `item_state`, `credentials`.

| Table            | Columns                                                                                                                                                                      | Notes                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `users`          | `id` pk, `email?`, `name`, `created_at`                                                                                                                                      | Seeded with `local` user in v1                                                       |
| `dashboards`     | `id` pk, `user_id` fk, `name`, `position`, `created_at`                                                                                                                      | Tabs in the top bar                                                                  |
| `widgets`        | `id` pk, `dashboard_id` fk, `type`, `title`, `config` json, `x`, `y`, `w`, `h`, `created_at`, `updated_at`                                                                   | `config` validated by the widget type's Zod schema                                   |
| `sources`        | `id` pk, `kind`, `key`, `title?`, `site_url?`, `favicon_url?`, `interval_min`, `etag?`, `last_modified?`, `last_fetched_at?`, `next_fetch_at`, `last_status?`, `error_count` | Unique on (`kind`, `key`); `key` is the canonical feed URL, channel id or fiction id |
| `widget_sources` | `widget_id` fk, `source_id` fk                                                                                                                                               | Many-to-many; drives which sources a widget shows                                    |
| `items`          | `id` pk, `source_id` fk, `external_id`, `title`, `url`, `excerpt?`, `image_url?`, `author?`, `published_at`, `fetched_at`, `meta` json                                       | Unique on (`source_id`, `external_id`); index on (`source_id`, `published_at` desc)  |
| `item_state`     | `user_id`, `item_id`, `seen_at?`, `read_at?`                                                                                                                                 | PK (`user_id`, `item_id`); `read_at` is set on click-through                         |
| `weather_cache`  | `key` pk (rounded lat,lon,units), `payload` json, `fetched_at`                                                                                                               | Not item-shaped, so kept separate                                                    |
| `credentials`    | `id` pk, `user_id` fk, `provider`, `encrypted_blob`, `created_at`                                                                                                            | Only used by the RoyalRoad "follows" mode; encrypted with an app secret              |

### Widget config schemas (`packages/shared`)

```ts
feed:       { sources: {url: string; label?: string}[]; limit: number;
              excerpt: 'none' | 'compact' | 'expanded'; showImages: boolean;
              unreadDots: boolean; variant: 'cards' | 'list' }
royalroad:  { mode: 'urls' | 'follows'; fictions: {urlOrId: string}[]; limit: number }
youtube:    { channels: {input: string}[]; limit: number }   // input: channel URL, @handle or id
weather:    { location: {name: string; lat: number; lon: number}; units: 'metric' | 'imperial' }
```

Reddit is a preset of `feed`: picking "Reddit" in the source picker takes a subreddit and sort, and stores the `.rss` URL.

## 5. API (Hono, prefix `/api/v1`)

| Method and path                | Purpose                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                  | Liveness                                                                                                                                   |
| `GET /dashboards`              | List dashboards (tabs)                                                                                                                     |
| `POST /dashboards`             | Create                                                                                                                                     |
| `PATCH /dashboards/:id`        | Rename                                                                                                                                     |
| `DELETE /dashboards/:id`       | Delete (cascades widgets)                                                                                                                  |
| `PUT /dashboards/reorder`      | Save tab order                                                                                                                             |
| `GET /dashboards/:id`          | Dashboard with its widgets and layout                                                                                                      |
| `PUT /dashboards/:id/layout`   | Atomic "Save layout": positions and sizes for all widgets, plus removals                                                                   |
| `POST /dashboards/:id/widgets` | Add widget (`type`, `title`, `config`, `layout`); creates or links sources                                                                 |
| `PATCH /widgets/:id`           | Update title or config                                                                                                                     |
| `DELETE /widgets/:id`          | Remove                                                                                                                                     |
| `GET /widgets/:id/data`        | View model for rendering: items (with read state) or the weather payload                                                                   |
| `POST /widgets/:id/refresh`    | Manual refresh (rate limited per source)                                                                                                   |
| `POST /items/state`            | Body `{ ids, action: 'seen' \| 'read' \| 'unread' }`                                                                                       |
| `POST /sources/resolve`        | Validate and preview an input (feed autodiscovery, YouTube handle to channel id, RoyalRoad URL to fiction id); used by the add-widget form |
| `GET /geocode?q=`              | Location search for weather (Open-Meteo geocoding)                                                                                         |
| `GET /widget-types`            | Registry: types, config JSON Schemas, default layouts                                                                                      |
| `GET /export` / `POST /import` | Dashboards as JSON (settings backup, later template sharing)                                                                               |

Conventions: Zod-validated input, a consistent `{ error: { code, message } }` shape, and every handler reads the user from request context (the local user in v1, the session user after auth lands).

## 6. Provider notes

- **RSS/Atom:** parse with `fast-xml-parser`; autodiscover feed links from an HTML page.
- **Reddit:** `https://www.reddit.com/r/{sub}/{sort}.rss`; strip HTML; no vote counts unless the JSON endpoint is used. Treat as best-effort.
- **YouTube:** `https://www.youtube.com/feeds/videos.xml?channel_id=UC...`. Handles resolve to channel ids once during `resolve` and are then stored.
- **RoyalRoad, urls mode:** per-fiction feed at `/fiction/syndication/{id}` (to verify during implementation). Unread = chapters newer than the last read for that fiction.
- **RoyalRoad, follows mode:** needs the user's logged-in session; RoyalRoad has no official API. See open questions.
- **Weather:** Open-Meteo forecast endpoint, cached 30 minutes per rounded location.

## 7. Repository layout

```
apps/api/src/{index.ts, routes/, providers/, scheduler/, db/ (schema, migrations), lib/ (ssrf, http, sanitize)}
apps/web/src/{pages/, widgets/{feed,royalroad,youtube,weather}/, components/, stores/, api/}
packages/shared/src/{items.ts, widgets.ts, api.ts}
docs/DESIGN.md
```

## 8. Phases

1. Scaffold the monorepo, tooling, Hono + Vue hello-world, typed client, Vitest in every package, and CI. Each later phase ships with its tests (see section 9).
2. Backend core: schema, provider interface, RSS provider, scheduler, SSRF guard.
3. Dashboard shell: tabs, grid, edit mode, add-widget panel, persisted layouts.
4. Widgets and providers: feed (with Reddit preset), YouTube, weather, RoyalRoad (urls mode).
5. Read/unread state, refresh controls, per-widget error states, export/import.
6. RoyalRoad follows mode (if feasible), then real auth, sharing and Postgres.

## 9. Testing

Tests are written alongside each feature from phase 1, not added afterwards. One runner (Vitest) across the monorepo.

**Backend (`apps/api`)**

- Route tests call the Hono app directly with `app.request()` against an in-memory Postgres (PGlite) with real migrations applied, so schema, validation and handlers are tested together without a network.
- Provider tests parse saved fixture files (real RSS, Atom, YouTube, Reddit and RoyalRoad responses stored in `__fixtures__/`) and mock HTTP at the boundary, covering conditional requests (`304`), errors, malformed XML and oversized responses.
- Pure-logic unit tests: SSRF guard, HTML-to-text sanitizer and excerpt truncation, URL canonicalization and resolve (handle to channel id, URL to fiction id), unread calculation, retention pruning.
- Scheduler tests use fake timers: due-source selection, per-host concurrency, exponential backoff, `Retry-After`.
- No test calls the real internet. An optional, separately run "live smoke" script may check that the real feed formats haven't changed.

**Shared (`packages/shared`)**: Zod schema tests for each widget config (valid, invalid, defaults).

**Frontend (`apps/web`)**

- Unit and component tests: Vitest with Vue Test Utils and happy-dom. Cover widget components (render states: loading, empty, error, populated), settings forms, Pinia stores and composables.
- API mocking with MSW, using the shared types so mocks can't drift from the real contract.
- A small number of Playwright end-to-end tests against the real API with a temporary PGlite folder: add a widget, edit and save a layout, mark an item read on click-through, and the error state of a failing feed. Drag and drop is tested here, not in unit tests, because it is unreliable in a simulated DOM.
- `vue-tsc` type-checking and ESLint run in the same CI step as tests.
- Not at the start: visual regression and snapshot-heavy tests, which cost more than they return while the UI is still changing.

**CI**: a GitHub Actions workflow running lint, type-check, unit tests and Playwright on every push (added in phase 1 once the repo is under git).

## 10. Open questions

- RoyalRoad follows mode: how do we get the follow list without storing the user's password? Candidates: user pastes a session cookie (encrypted at rest, expires, fragile) or a browser bookmarklet/extension that exports the follow list once. Needs a feasibility check against the live site and its terms before we promise it.
- Reddit: unauthenticated RSS returned `429` immediately in a live check on 2026-10-19 (identified User-Agent, no rate-limit budget left). Plan: use Reddit's OAuth API with the user's own free app credentials, and keep the RSS path as best-effort.
- Reddit widget size (revisit after seeing real data).
