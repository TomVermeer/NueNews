# NueNews

A personal dashboard that pulls feeds from other sites (RSS/Atom, Reddit, YouTube, RoyalRoad, weather) into a customizable grid of widgets. The first version is for a single user, but the design keeps the door open for multiple users and shareable dashboards.

Status: backend core is working: database, RSS/Atom provider, scheduler and the dashboard/widget API. The web app is still a placeholder shell (the dashboard grid is next). The full plan lives in [docs/DESIGN.md](docs/DESIGN.md).

## How to run

Requirements: Node 22 or newer (developed on Node 24) and pnpm 10 (`npm install -g pnpm@10.34.7`).

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts both apps:

| App        | URL                                                                 |
| ---------- | ------------------------------------------------------------------- |
| Web (Vite) | http://localhost:5273                                               |
| API (Hono) | http://localhost:3000, also reachable through the web app at `/api` |

Check it works: open http://localhost:5273. The top right should say "API: online". You can also call the API directly: `http://localhost:3000/api/v1/health` returns `{"status":"ok"}`.

Other commands, run from the repo root:

| Command                                  | What it does                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm test`                              | Runs Vitest in every package                                               |
| `pnpm typecheck`                         | `tsc` for shared and api, `vue-tsc` for web                                |
| `pnpm build`                             | Type-checks and builds the web app into `apps/web/dist`                    |
| `pnpm format`                            | Formats the repo with Prettier                                             |
| `pnpm lint`                              | Runs ESLint (TypeScript and Vue rules)                                     |
| `pnpm format:check`                      | Checks formatting without changing files                                   |
| `pnpm --filter @nuenews/api dev`         | Runs only the API (set `PORT` to change the port)                          |
| `pnpm --filter @nuenews/api db:generate` | Generates a new SQL migration after you change `apps/api/src/db/schema.ts` |
| `pnpm --filter @nuenews/web dev`         | Runs only the web app                                                      |

## Configuration

The API reads these environment variables (all optional):

| Variable        | Default                            | Purpose                                                                          |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `PORT`          | `3000`                             | API port                                                                         |
| `DATABASE_PATH` | `./data/nuenews.sqlite`            | SQLite file (relative to `apps/api`)                                             |
| `USER_AGENT`    | `NueNews/0.1 (personal dashboard)` | Sent with every feed request. Put a contact URL in it if you host this publicly. |

## API

Everything lives under `/api/v1`. Errors always look like `{ "error": { "code": "...", "message": "..." } }`. v1 has no login: every request acts as the seeded local user, and every query is already scoped to that user.

| Method and path                                   | Purpose                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /health`                                     | Liveness                                                                                         |
| `GET /widget-types`                               | Widget types, whether they are available yet, default size, and a JSON Schema of each config     |
| `GET /dashboards`, `POST /dashboards`             | List (tabs) and create                                                                           |
| `PATCH /dashboards/:id`, `DELETE /dashboards/:id` | Rename and delete                                                                                |
| `PUT /dashboards/reorder`                         | Save tab order (must list every dashboard once)                                                  |
| `GET /dashboards/:id`                             | A dashboard with its widgets and layout                                                          |
| `PUT /dashboards/:id/layout`                      | "Save layout": positions and sizes, plus widgets removed in edit mode, in one transaction        |
| `POST /dashboards/:id/widgets`                    | Add a widget. Sources are created or reused, and fetched immediately so the widget is not empty. |
| `PATCH /widgets/:id`, `DELETE /widgets/:id`       | Change title or config, and remove                                                               |
| `GET /widgets/:id/data`                           | What to render: newest items (with seen and read state) and per-source status                    |
| `POST /widgets/:id/refresh`                       | Refresh now. Sources fetched in the last minute are skipped.                                     |
| `POST /items/state`                               | Mark items `seen`, `read` or `unread`                                                            |
| `POST /sources/resolve`                           | Turn what a user typed into a canonical source (feed autodiscovery, Reddit pages to their feed)  |

Not built yet: weather data and geocoding, YouTube and RoyalRoad widgets (they are rejected with `widget_type_unavailable`), import/export.

## Scheduler

An in-process loop ([apps/api/src/scheduler](apps/api/src/scheduler)) wakes up every minute and refreshes sources that are due and used by at least one widget. Sources on the same site are fetched one at a time and at most four sites run in parallel. A successful fetch schedules the next one after the source's interval (30 minutes by default). Failures back off exponentially (1 h, 2 h, 4 h, then every 6 h) and honour `Retry-After` hints. Only the newest 100 items per source are kept.

## Stack

- TypeScript everywhere, with a strict shared config ([tsconfig.base.json](tsconfig.base.json)).
- Frontend: Vue 3, Vite, Tailwind CSS v4.
- Backend: Hono on Node (served with `@hono/node-server`, run in development with `tsx`).
- Validation: Zod.
- Tests: Vitest in every package, Vue Test Utils and happy-dom for components.
- Planned: SQLite with Drizzle ORM, Pinia, Vue Router, TanStack Query, `grid-layout-plus`, MSW and Playwright.

## Repository layout

```
apps/
  api/            Hono API (@nuenews/api)
  web/            Vue 3 app (@nuenews/web)
packages/
  shared/         Zod schemas and types used by both apps (@nuenews/shared)
docs/
  DESIGN.md       Full plan, data model, API routes, provider notes, testing strategy
```

It is a pnpm workspace monorepo ([pnpm-workspace.yaml](pnpm-workspace.yaml)). Packages reference each other with `workspace:*`.

## Key architecture decisions

**Shared package consumed as source.** `@nuenews/shared` has no build step. Its `exports` point at `src/index.ts`, and Vite, Vitest and `tsx` compile it on the fly. This keeps the setup simple while there is only one consumer pair.

**End-to-end types through Hono's RPC client.** The API exports `AppType`, and the web app builds its client with `hc<AppType>` ([apps/web/src/api/client.ts](apps/web/src/api/client.ts)). Changing a route breaks the frontend at compile time instead of at runtime. For this to work, routes must be chained when defined in [apps/api/src/app.ts](apps/api/src/app.ts).

**The app is separate from the server.** [app.ts](apps/api/src/app.ts) builds and exports the Hono app, and [index.ts](apps/api/src/index.ts) only starts the HTTP server. Tests call `app.request()` directly with no port and no network.

**The browser never talks to third-party sites.** The backend will fetch, normalize and cache every feed in SQLite. This avoids CORS problems, keeps API keys off the client, and lets one fetch serve every widget (and later every user). In development, Vite proxies `/api` to the API on port 3000, so the web app uses same-origin paths.

**Providers and widgets are plugins.**

- A _provider_ (backend) knows how to resolve and fetch one kind of source and returns normalized items (`{externalId, title, url, excerpt?, imageUrl?, author?, publishedAt, meta?}`, defined in [items.ts](packages/shared/src/items.ts)).
- A _widget type_ (shared schema plus a Vue component) defines a config shape ([widgets.ts](packages/shared/src/widgets.ts)) and how to render it.
- Adding an integration should mean adding one provider file and one widget, with no changes to the core.

**Widget config is validated data.** Each widget type has a Zod schema with defaults (`feed`, `royalroad`, `youtube`, `weather`). The same schemas will validate API input, drive the settings forms, and make dashboards exportable as JSON.

**Ready for multiple users, without building them yet.** Version 1 has no login and runs as one seeded local user, but every user-owned table carries a `user_id` from the start, so adding real authentication later will not need a data migration. Shared data (sources, cached items) has no `user_id`, so one fetch serves everyone.

**Database.** SQLite through Drizzle ORM (`better-sqlite3`): zero setup, a single file to back up, and a clear path to Postgres later. The schema is in [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts) and SQL migrations live in `apps/api/drizzle/`. Migrations are applied automatically when the API starts. The database file defaults to `apps/api/data/nuenews.sqlite` (git-ignored); set `DATABASE_PATH` to change it. Tests use in-memory databases. Shared tables (`sources`, `items`, `weather_cache`) have no `user_id`; user-owned tables (`dashboards`, `widgets`, `item_state`, ...) do, and v1 seeds a single `local` user.

**Provider interface.** [apps/api/src/providers/types.ts](apps/api/src/providers/types.ts) defines `Provider` (`resolve` canonicalizes user input, `fetch` returns normalized items or `not_modified`). `fetch` is injected through a context so providers can be tested without the network. Providers are registered in a small registry. The RSS/Atom provider ([apps/api/src/providers/rss](apps/api/src/providers/rss)) is implemented: it parses RSS 2.0, RSS 1.0 and Atom (including Reddit and YouTube-style feeds), builds plain-text excerpts, finds feeds advertised by web pages, and uses conditional requests. Other providers are still to do.

**Safe HTTP client.** Everything that fetches user-supplied URLs goes through [apps/api/src/lib/http.ts](apps/api/src/lib/http.ts) and [ssrf.ts](apps/api/src/lib/ssrf.ts): only http(s), no credentials, private/local/link-local addresses are blocked (IPv4, IPv6 and IPv4-in-IPv6), redirects are followed by hand and re-checked at every hop, and a connection-time DNS guard stops DNS rebinding. Responses are capped at 2 MB and 10 seconds. Checked live: public feeds load, while `localhost`, `169.254.169.254` and `localtest.me` (a public name that resolves to 127.0.0.1) are refused.

## Design principles

1. **Headline and handoff.** NueNews shows only what a publisher put in its feed: title, a short plain-text excerpt (about 200 characters), thumbnail, date and author. It never scrapes full articles, strips paywalls, or shows content in an in-app reader or iframe. Every click opens the original page in a new tab. Items are always attributed to their source.
2. **No rehosting.** Thumbnails are hotlinked, not copied. Link parameters are left untouched.
3. **Polite fetching.** A clear `User-Agent` with a contact URL, conditional requests (`ETag`, `If-Modified-Since`), sensible intervals (15 to 60 minutes), backoff on errors, and respect for `Retry-After` and `429`.
4. **Safe by default for user-supplied URLs.** The fetcher will block private and loopback addresses (SSRF), limit response size and time, and sanitize HTML to plain text.
5. **Spacious, card-like, dark only.** The visual tokens (`canvas`, `card`, `line`, `ink`, `ink-muted`, `accent`) live in [apps/web/src/style.css](apps/web/src/style.css). Navigation stays in a top bar, with dashboards as tabs.
6. **Source-specific notes.** YouTube links out instead of embedding. Reddit uses public RSS for personal use, and its terms must be re-checked before this becomes multi-user. Open-Meteo (weather) is free for non-commercial use only.

## Testing approach

Tests are written with each feature, not afterwards.

- API: route tests via `app.request()` against an in-memory SQLite database, provider tests against saved real feed fixtures, and unit tests for the SSRF guard, sanitizer and scheduler (with fake timers). No test uses the real internet.
- Shared: Zod schema tests for every widget config.
- Web: component and store tests with Vue Test Utils, API mocks with MSW, and a few Playwright end-to-end tests for flows like adding a widget and saving a layout. Drag and drop is tested in the end-to-end layer only.
- Not planned yet: visual regression and snapshot tests.

Current tests: 5 in `shared`, 207 in `api`, 2 in `web`.

## What's next

See the phases in [docs/DESIGN.md](docs/DESIGN.md#8-phases). CI (GitHub Actions) runs lint, format check, typecheck, tests and build on every push and pull request. Immediately next: the dashboard grid in the web app (tabs, widget cards, edit mode, add-widget panel), then YouTube and weather providers.

## Open questions

- RoyalRoad "follows" mode (reading a user's follow list) needs a logged-in session and RoyalRoad has no official API. Whether and how to support it still needs a feasibility check. Pasting fiction URLs works without any of that.
- Reddit: unauthenticated requests to Reddit's RSS currently get `429` straight away (checked 2026-10-19, with an honest descriptive User-Agent). Reddit will probably need its free OAuth API credentials. We will not work around this by pretending to be a browser. Decide when we build the Reddit preset.
- Reddit widget size and presentation, to revisit with real data.
