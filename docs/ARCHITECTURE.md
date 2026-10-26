# Architecture

NueNews is a personal dashboard: a grid of widgets (feed lists, YouTube channels, weather) filled from third-party sites. A server fetches and caches the data; browsers only talk to the NueNews API. It is built so that more than one user can be added: every user-owned record is scoped to a user, and every query is filtered by the current user.

```text
Browser
  |  HTTPS
  v
Cloudflare Tunnel
  |
  v
Caddy (reverse proxy)
  |  shared Docker network
  v
nuenews container
  +-- Web build (static files, served to the browser)
  +-- API (Hono)
  |     +--> MET Norway (weather), Open-Meteo (place search)
  |     +--> Supabase Postgres (data)
  |     +--> Supabase Auth (token keys)
  +-- Scheduler (in process)
        +--> Third-party feeds (RSS/Atom, YouTube)
        +--> Supabase Postgres (data)
```

## Repository layout

```text
apps/api          Hono API, scheduler, providers, database (Drizzle)
apps/web          Vue 3 single-page app (Vite, Tailwind v4)
packages/shared   Zod schemas and types used by both apps
deploy/           Home server files: compose, updater, systemd units
.github/workflows CI, image publishing, database backup, feed refresh
Dockerfile        Production image
render.yaml       Render fallback (temporary)
```

API folders under [apps/api/src](../apps/api/src):

| Folder       | Content                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| `routes/`    | Route modules                                                                          |
| `providers/` | Source providers (`rss`, `youtube`); interface in `types.ts`                           |
| `scheduler/` | Polling loop, per-source refresh, backoff                                              |
| `services/`  | Manual refresh and widget-to-source linking                                            |
| `weather/`   | MET Norway client, Open-Meteo geocoding, cache                                         |
| `auth/`      | Authenticator selection and Supabase token verification                                |
| `db/`        | Schema, client, query helpers, seed                                                    |
| `lib/`       | Outbound HTTP client (`http.ts`), address checks (`ssrf.ts`), text helpers (`text.ts`) |
| `test/`      | Test helpers                                                                           |

The entry point is [index.ts](../apps/api/src/index.ts), the app factory is [app.ts](../apps/api/src/app.ts) and static web serving is in [web.ts](../apps/api/src/web.ts). Shared schemas are in [packages/shared/src](../packages/shared/src): `items.ts`, `widgets.ts`, `api.ts`, `weather.ts`. The web widgets are flat components: `FeedWidget.vue`, `YouTubeWidget.vue`, `WeatherWidget.vue`.

### Type flow

- `createApp(deps)` in [app.ts](../apps/api/src/app.ts) builds the Hono app and exports `AppType`.
- Its dependencies are the database, the provider registry, the HTTP client, a clock and the authenticator. Tests pass fakes for all of them.
- The web app builds a typed client with `hc<AppType>` in [client.ts](../apps/web/src/api/client.ts).
- Routes must stay chained (`new Hono().get(...).post(...)`). Unchained routes lose their types in the client.
- `packages/shared` has no build step. Both apps import its TypeScript source directly.

## Product rules

Headline and handoff: NueNews shows what the publisher's feed provides and links out.

- Each item shows only the title, a plain-text excerpt of about 200 characters, an image, a date and an author, as far as the feed has them.
- Excerpts are cut by `makeExcerpt` in [text.ts](../apps/api/src/lib/text.ts).
- Article pages are never scraped and no players are embedded. YouTube items link out.
- Every item links out in a new tab with `rel="noopener noreferrer"`.
- Thumbnails are hotlinked with `referrerpolicy="no-referrer"`. Image URLs must be http or https.
- One exception: the avatar of a YouTube channel. The provider's optional `fetchIcon` reads the `og:image` of the channel page once and stores it in `sources.favicon_url`.
- The weather widget shows "Data from MET Norway" (text in [weather.ts](../packages/shared/src/weather.ts)).
- The UI is dark mode only.

## Data pipeline

Browsers never call third-party sites. A provider turns a stored source into normalized items. Widgets read only cached items.

### Providers

Interface in [types.ts](../apps/api/src/providers/types.ts):

| Member                | Purpose                                 |
| --------------------- | --------------------------------------- |
| `kind`                | Provider name                           |
| `resolve(input, ctx)` | Turn user input into a canonical source |
| `fetch(source, ctx)`  | Return items, or `not_modified`         |
| `fetchIcon`           | Optional; reads a source icon           |

`FetchContext` holds the HTTP client and a clock. Providers never import the client, so tests never touch the network.

Registered providers:

- `rss`: RSS and Atom, parsed with fast-xml-parser. HTML pages are searched for a feed link (autodiscovery).
- `youtube`: reads `videos.xml?channel_id=`. A channel handle is resolved once to a channel id.

A normalized item has `externalId`, `title`, `url`, `publishedAt` and optional `excerpt`, `imageUrl`, `author`, `meta` ([items.ts](../packages/shared/src/items.ts)).

### Scheduler

The scheduler runs inside the API process ([scheduler.ts](../apps/api/src/scheduler/scheduler.ts)).

- It ticks every 60 seconds and runs one pass at start.
- A pass takes sources with `next_fetch_at <= now`, in batches of 50.
- It fetches one host at a time and at most 4 hosts in parallel.
- Each source has a refresh interval, 30 minutes by default.
- On error the delay grows by doubling, capped at 6 hours ([backoff.ts](../apps/api/src/scheduler/backoff.ts)). `Retry-After` or `X-Ratelimit-Reset` is used as the minimum delay.
- Requests are conditional: `ETag` with `If-None-Match`, and `If-Modified-Since`. A `304` is handled as `not_modified`.
- Requests identify themselves with the `USER_AGENT` value. The default is `NueNews/0.1 (personal dashboard)`.
- The newest 100 items per source are kept. There is no age limit ([refresh.ts](../apps/api/src/scheduler/refresh.ts)).
- Sources are shared across widgets and users (unique on kind and key). One fetch serves all widgets that use the source.
- `POST /widgets/:id/refresh` fetches now, but skips sources fetched within the last 60 seconds ([refreshNow.ts](../apps/api/src/services/refreshNow.ts)).

### Weather

Weather has no source row.

- Forecasts come from MET Norway Locationforecast.
- Results are cached for 30 minutes in `weather_cache`, keyed by latitude and longitude rounded to 2 decimals, and units ([service.ts](../apps/api/src/weather/service.ts)).
- Place search uses Open-Meteo geocoding through `GET /geocode?q=` (2 to 100 characters).

## Outbound request safety

All outbound requests go through [http.ts](../apps/api/src/lib/http.ts) and [ssrf.ts](../apps/api/src/lib/ssrf.ts). Do not call `fetch` directly for user-supplied or feed-supplied URLs.

- Only http and https are allowed.
- Private, loopback and link-local addresses are blocked.
- The check is repeated at connect time, against DNS rebinding.
- Every redirect hop is checked again.
- Timeout is 10 seconds. Response size is capped at 2 MB.

## Data model

PostgreSQL through Drizzle. Schema: [schema.ts](../apps/api/src/db/schema.ts). Ids are text. Row-level security is enabled on every table with no policies, because the API connects as the table owner. A test checks that no table is missed ([schema.test.ts](../apps/api/src/db/schema.test.ts)).

| Table            | Content                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | `id`, `email` (unique), `name`, `created_at`. Created on first sight of a Supabase user id.                                                                                                                                   |
| `dashboards`     | `id`, `user_id`, `name`, `position`, `created_at`. Deleting a dashboard deletes its widgets.                                                                                                                                  |
| `widgets`        | `id`, `dashboard_id`, `type`, `title`, `color` (nullable), `config` (jsonb), grid `x`, `y`, `w`, `h`, timestamps. Owned through the dashboard; no `user_id` column. Config is checked by the Zod schema of its type on write. |
| `widget_sources` | Many-to-many link between widgets and sources. Composite key.                                                                                                                                                                 |
| `sources`        | Shared, no `user_id`. Unique on (`kind`, `key`). Holds `etag`, `last_modified`, `next_fetch_at`, interval, `favicon_url` and error and backoff state.                                                                         |
| `items`          | Shared. Unique on (`source_id`, `external_id`). Index on (`source_id`, `published_at`).                                                                                                                                       |
| `item_state`     | Primary key (`user_id`, `item_id`). Seen, read or unread. `read_at` is set when an item is opened.                                                                                                                            |
| `weather_cache`  | Keyed by rounded latitude, longitude and units.                                                                                                                                                                               |
| `credentials`    | Exists in the schema. Not used at runtime.                                                                                                                                                                                    |

Widget configs ([widgets.ts](../packages/shared/src/widgets.ts)):

- `feed`, `youtube` (with an optional label) and `weather` are available.
- `royalroad` exists in the schemas. The API rejects it with `widget_type_unavailable`.

Database access is asynchronous. `createDb` ([client.ts](../apps/api/src/db/client.ts)) returns `{ db, close }`. A `postgres://` URL gives a node-postgres pool (max 5). Anything else gives PGlite: a folder in development, memory in tests.

## API

Hono, prefix `/api/v1`. Code in [routes/](../apps/api/src/routes).

| Method | Path                      | Purpose                                                 |
| ------ | ------------------------- | ------------------------------------------------------- |
| GET    | `/health`                 | Liveness. Public.                                       |
| GET    | `/dashboards`             | List dashboards                                         |
| POST   | `/dashboards`             | Create a dashboard                                      |
| GET    | `/dashboards/:id`         | Read a dashboard with its widgets                       |
| PATCH  | `/dashboards/:id`         | Update a dashboard                                      |
| DELETE | `/dashboards/:id`         | Delete a dashboard                                      |
| PUT    | `/dashboards/reorder`     | Reorder dashboards                                      |
| PUT    | `/dashboards/:id/layout`  | Save the layout in one atomic write, including removals |
| POST   | `/dashboards/:id/widgets` | Add a widget                                            |
| PATCH  | `/widgets/:id`            | Change title, config or color                           |
| DELETE | `/widgets/:id`            | Delete a widget                                         |
| GET    | `/widgets/:id/data`       | Cached items (or weather) for a widget                  |
| POST   | `/widgets/:id/refresh`    | Fetch the widget's sources now                          |
| POST   | `/items/state`            | Set item ids to `seen`, `read` or `unread`              |
| POST   | `/sources/resolve`        | Turn a pasted address into a canonical source           |
| GET    | `/geocode?q=`             | Place search for weather                                |
| GET    | `/widget-types`           | Widget types the API accepts                            |
| POST   | `/internal/tick`          | Run one scheduler pass. Outside `/api/v1`.              |

Conventions:

- Input is validated with Zod schemas from `packages/shared`.
- Errors always have the shape `{ error: { code, message } }`. Code throws `ApiError` or `ProviderError` instead of building responses by hand.
- `secureHeaders` is applied to all routes.
- Every query is scoped to `c.get('userId')`. Everything under `/api/v1` except `/health` answers `401` without a user.
- `/internal/tick` is mounted only when `CRON_SECRET` is set. It needs `Authorization: Bearer <secret>`, compared in constant time, and returns `{ refreshed }`.

## Authentication

API side: `createAuthenticator(env, db)` in [config.ts](../apps/api/src/auth/config.ts) picks the authenticator.

| Environment                       | Behavior                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `SUPABASE_URL` set                | Verifies Supabase access tokens with jose. Creates the user row on first sight. |
| No `SUPABASE_URL`, not production | One seeded `local` user. No login.                                              |
| No `SUPABASE_URL`, production     | The API refuses to start.                                                       |

Token verification:

- Public keys come from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (ES256, RS256, EdDSA).
- Legacy projects use HS256 with `SUPABASE_JWT_SECRET`.
- Issuer is `${SUPABASE_URL}/auth/v1`. Audience is `authenticated`. Anonymous tokens are rejected.

Web side:

- With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: a login page (email and password; sign-up is invite-only, set in Supabase), a route guard, the token on every API call, and sign-out on `401`.
- Without them: no login.

The page and the API share one origin, so there is no CORS setup.

## Frontend state

- TanStack Query owns server state.
- Pinia (`stores/editor.ts`) holds UI state only.
- Edit mode works on a draft ([useLayoutDraft.ts](../apps/web/src/composables/useLayoutDraft.ts)). Save sends it in one `PUT /dashboards/:id/layout`.
- Actions in the add and settings panel save immediately.

## Testing

Vitest in every package.

| Area          | Approach                                                                                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API           | The real app through `app.request()` on in-memory PGlite with the real migrations and a scripted fake provider ([helpers.ts](../apps/api/src/test/helpers.ts), `createTestApp`). The fake context throws if the network is used. |
| Providers     | Saved fixtures in `__fixtures__/` (rss, youtube, weather).                                                                                                                                                                       |
| Scheduler     | Fake timers.                                                                                                                                                                                                                     |
| Shared        | Zod schema tests.                                                                                                                                                                                                                |
| Web           | Vue Test Utils with happy-dom and a recording fake of the typed client ([fakeApi.ts](../apps/web/src/test/fakeApi.ts)). `grid-layout-plus` is mocked, so drag and resize are not unit-tested.                                    |
| Update script | `bash deploy/update.test.sh`, with stubbed `docker` and `flock`. Not run in CI.                                                                                                                                                  |

There are no end-to-end tests.

## Deployment

### Production image

One image, built from the [Dockerfile](../Dockerfile) in two stages on `node:24-slim`.

- Build stage: installs with the frozen lockfile and builds the web app. Build arguments `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are baked into the build.
- Runtime stage: production dependencies, API source, migrations, shared source and `apps/web/dist`.
- There is no compile step. The container runs `node --import tsx src/index.ts`.
- `NODE_ENV=production`, `PORT=3000`, runs as user `node`. `HEALTHCHECK` calls `/api/v1/health` every 30 seconds.

At start the API migrates the database. In production, if `dist/index.html` exists, it also serves the web build ([web.ts](../apps/api/src/web.ts)):

- Hashed files under `/assets` are cached for a year (immutable). Everything else is not cached.
- Unknown paths fall back to `index.html`. Paths under `/api` and `/internal` never get the page. Missing file-like paths return `404`.
- `SIGINT` and `SIGTERM` stop the scheduler and close the server and the database.

### CI build and publish

Workflow: [ci.yml](../.github/workflows/ci.yml). It runs on pushes to `main` and on every pull request.

| Job     | Steps                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check` | Node 24. Install, lint, format check, typecheck, test, build.                                                                                                                  |
| `image` | Needs `check`. Builds a `linux/amd64` image. On a push to `main` only, logs in to `ghcr.io` and pushes `latest` and `sha-<short commit>`. Pull requests build without pushing. |

The image job takes `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository variables. Third-party actions are pinned to commit SHAs. GitHub never connects to the server; the server pulls.

### Home server

Request path: browser, Cloudflare Tunnel, Caddy reverse proxy, then the `nuenews` container on a shared Docker network. The container talks to Supabase for Postgres and Auth. The Caddy and tunnel configuration is not in this repository.

The server needs no source code. It needs only [compose.yaml](../deploy/compose.yaml), [update.sh](../deploy/update.sh), a `.env` file and the two systemd units for automatic updates ([nuenews-update.service](../deploy/nuenews-update.service) and [nuenews-update.timer](../deploy/nuenews-update.timer)).

[compose.yaml](../deploy/compose.yaml):

- One service, `nuenews`, with image `${NUENEWS_IMAGE:-ghcr.io/<owner>/nuenews:latest}`.
- `restart: unless-stopped`. External Docker network `web`, shared with Caddy. No published ports and no volumes.
- Environment: `DATABASE_URL` and `SUPABASE_URL` (required), `SUPABASE_JWT_SECRET` and `USER_AGENT` (optional).
- `CRON_SECRET` is not passed, so `/internal/tick` is off. The in-process scheduler refreshes all feeds.

Automatic updates ([nuenews-update.timer](../deploy/nuenews-update.timer), [nuenews-update.service](../deploy/nuenews-update.service)):

- A systemd timer starts a one-shot service (600 second timeout) that runs `update.sh`. The timer first fires 5 minutes after boot and then repeats every 2 hours.
- `update.sh` takes a `flock` lock and exits 0 if another run holds it.
- If `NUENEWS_IMAGE` in `.env` is pinned to a tag other than `latest`, it exits without touching Docker.
- Otherwise it runs `docker compose pull` and `docker compose up -d`, then waits up to about 90 seconds (30 checks, 3 seconds apart) for the container to be healthy.
- Healthy: it runs `docker image prune -f`. Unhealthy: it exits 1 and prints how to roll back. There is no automatic rollback.
- Logs: `journalctl -u nuenews-update`.

Rollback:

```bash
# In .env on the server
NUENEWS_IMAGE=ghcr.io/<owner>/nuenews:sha-<commit>

# Then
./update.sh
```

Remove the `NUENEWS_IMAGE` line to follow `latest` again.

### Render fallback (temporary)

- [render.yaml](../render.yaml) describes one free web service with `autoDeploy: false`. It changes only through a manual deploy.
- Health check path is `/api/v1/health`. The build uses corepack pnpm and the service runs tsx from `node_modules`.
- Variables set in Render: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET` (generated), `USER_AGENT`, `NODE_ENV`, `NODE_VERSION`.
- [refresh.yml](../.github/workflows/refresh.yml) ("Refresh feeds") runs every 15 minutes. It posts to `${APP_URL}/internal/tick` with `Bearer CRON_SECRET`, which wakes the sleeping free service and refreshes feeds. It skips when its secrets are empty.
- Both the Render service and `refresh.yml` are temporary and only needed for Render.

### Backups

[backup.yml](../.github/workflows/backup.yml) ("Back up database") runs on Sundays at 03:00 UTC and on manual start.

- `pg_dump` (postgres:17) of `BACKUP_DATABASE_URL`, compressed with gzip.
- Encrypted with GPG, AES256 symmetric, using `BACKUP_PASSPHRASE`. Artifacts of a public repository are public, so the file must be encrypted.
- Uploaded as the artifact `nuenews-backup` and kept for 90 days.
- Skipped when its secrets are empty.

## Configuration

| Name                                          | Used by                     | Required                                            | Purpose                                                                             |
| --------------------------------------------- | --------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | API                         | Production: yes. Development: no (`./data/pglite`). | Postgres connection string (Supabase session pooler), or a PGlite folder            |
| `SUPABASE_URL`                                | API                         | Production: yes                                     | Token issuer and JWKS base. Missing in production: the API refuses to start.        |
| `SUPABASE_JWT_SECRET`                         | API                         | No                                                  | HS256 secret for legacy Supabase projects                                           |
| `USER_AGENT`                                  | API                         | No                                                  | User-Agent for outbound requests                                                    |
| `PORT`                                        | API                         | No (3000)                                           | Listen port                                                                         |
| `NODE_ENV`                                    | API                         | Set by the image                                    | `production` serves the web build and requires `SUPABASE_URL`                       |
| `CRON_SECRET`                                 | API, `refresh.yml`          | No                                                  | Enables `POST /internal/tick` (used on Render only)                                 |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Web build                   | In practice yes                                     | Public Supabase URL and anon key, baked into the build (repository variables in CI) |
| `NUENEWS_IMAGE`                               | `compose.yaml`, `update.sh` | No (`latest`)                                       | Image to run. A `sha-` tag pins it.                                                 |
| `APP_URL`                                     | `refresh.yml` (secret)      | No                                                  | App URL for the Render refresh                                                      |
| `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`    | `backup.yml` (secrets)      | No                                                  | Backup source and encryption passphrase                                             |

## Local development

See [README.md](../README.md) for commands.

- `pnpm dev` starts the API on port 3000 and Vite on port 5273. Vite proxies `/api` to the API.
- Without `DATABASE_URL` the API uses a PGlite folder at `apps/api/data/pglite`. Only one process can open it at a time.
- Without the Supabase variables there is no login and the API uses the `local` user.
- [docker-compose.yml](../docker-compose.yml) at the repository root can start a plain Postgres 17.

## Not built yet

- RoyalRoad provider and widget.
- Reddit preset. Reddit's RSS answers `429` to unauthenticated clients.
- Import and export of dashboards.
- End-to-end tests.
