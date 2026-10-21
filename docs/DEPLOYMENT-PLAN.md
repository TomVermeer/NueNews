# Deployment plan

Goal: put NueNews online for one user, at no cost for now, with real login and a hosted PostgreSQL database. RoyalRoad and the Reddit preset wait until after this.

Sizes are rough: **S** is an hour or two, **M** is a session, **L** is several sessions.

## Where we start

- The API (`apps/api`) runs on Hono with SQLite through `better-sqlite3` and Drizzle. About 45 call sites use Drizzle's synchronous `.run()`, `.get()`, `.all()` and `db.transaction(() => …)`. Postgres drivers are asynchronous, so the migration touches all of them.
- There is no login. `createApp` takes `currentUserId()`, and `index.ts` always returns the seeded `local` user. Every table and route is already scoped by `user_id`, which is what makes later multi-user support possible.
- The scheduler runs inside the API process on timers. It only works while the process is awake.
- The web app (`apps/web`) is a separate Vite build that proxies `/api` in dev.

## Decisions to confirm first (Step 0)

| #   | Decision              | Recommendation                                                                                                                                                               |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Database              | **Supabase Postgres** (free tier).                                                                                                                                           |
| 2   | Login                 | **Supabase Auth**, email and password, public sign-ups off, one user created by hand. Free tier covers far more than one user, and the same system handles multi-user later. |
| 3   | Where the API runs    | Supabase does not host Node servers, so the API needs a host of its own. See Step 4.                                                                                         |
| 4   | How the web app ships | **Served by the API itself** (one deployable, same origin). That avoids CORS and cookie problems and needs only one free service.                                            |
| 5   | Test database         | **PGlite** (real Postgres running in-process). Tests stay fast, need no Docker, and behave like production.                                                                  |
| 6   | Existing local data   | Keep dashboards, widgets and sources through a one-off import script. Cached items can be dropped, because the scheduler refetches them.                                     |

Free-tier terms below come from third-party summaries, not the vendors' own pages. Confirm them on the official pricing pages before relying on them.

## Step 1: Move the database to PostgreSQL (size L) — done, except the hosted database

Done and verified: `pnpm lint`, format, typecheck and all tests (296 API, 150 web) pass on Postgres; the dev server runs on it with the real data imported; and the `pg` connection path is tested against a Postgres wire-protocol server. What remains is creating the Supabase project and pointing `DATABASE_URL` at it (Step 4). Notes on how it differs from the first draft are under each item.

1. **Local Postgres for development (S). Done.** With no `DATABASE_URL`, `pnpm dev` runs on PGlite (data in `apps/api/data/pglite`), so nothing needs installing. `docker-compose.yml` (untested here, Docker was not running) starts a regular Postgres, and `.env.example` documents the variables.
2. **Port the schema (M). Done.** `pgTable`, `timestamptz`, `jsonb`, a fresh baseline migration, and the Drizzle config on `postgresql`. **Ids stayed `text`** rather than `uuid`: a malformed id in a URL then finds nothing (404) instead of failing in the database, and a Supabase user id fits in a text column as it is.
3. **Make the data layer asynchronous (L). Done.** `createDb` is async and returns `{ db, close }`; every query is awaited and transactions use `tx`. Single rows go through `firstRow` and `onlyRow` in `db/query.ts`.
4. **Tests on PGlite (M). Done.** All the existing API tests pass unchanged in meaning, plus new ones for the connection path, RLS and the importer. Each test file starts one PGlite and empties it between tests, which keeps the suite at about 8 seconds.
5. **Data import script (S). Done.** `pnpm --filter @nuenews/api db:import-sqlite -- ./data/nuenews.sqlite [--user-id <id>]` copies every table, converts timestamps and JSON, can re-point the old `local` user to a new id (use this with the Supabase user id in Step 2), and is safe to re-run. The local data has already been imported into the dev database.
6. **Lock down the tables (S). Done.** Migration `0001_enable_rls` turns row-level security on, with no policies, for every table, and a test checks that no table was missed. Add the same line to any new table's migration.
7. **Connection settings (S). Still open.** The client takes any `postgres://` URL (pool of 5, SSL from the URL's `sslmode`). Which Supabase string to use (pooled or direct, IPv6) depends on the host chosen in Step 4.

Done when: `pnpm test`, typecheck and lint pass on Postgres, the dev server runs against local Postgres, and a copy of the real data loads correctly.

## Step 2: Authentication for one user (size M)

1. **Set up Supabase Auth (S).** Create the project, turn public sign-ups off, create your user (email and password), and note the project URL and keys.
2. **API verifies sessions (M).** Add middleware that checks the bearer token (`Authorization: Bearer …`) against the project's signing keys using `jose`. `currentUserId` comes from the verified token. `createApp` keeps taking it as a dependency, so tests sign their own tokens and need no Supabase. Return `401` for a missing or invalid token, keep `/health` public, and link the first login to the imported data.
3. **Web login (M).** Add a login page, store the session, attach the token in the typed `hc` client, redirect to login on `401`, refresh tokens before they expire, and add a log out button in the top bar. Follow `docs/frontend-style.md`.
4. **Internal endpoints (S).** Anything the scheduler or cron calls (see Step 3) is protected by a separate secret, never by a user token.
5. **Tests (M).** API: no token, bad token, expired token, wrong user's data. Web: login, redirect, logout, session expiry.

Done when: nothing under `/api/v1` answers without a valid session, only you can log in, and the dashboard works after login.

## Step 3: Make it deployable (size M)

1. **One deployable (M).** Have the API serve `apps/web/dist` (static files plus a single-page-app fallback for `/d/:id`) and add a real production build for the web and the API. Add a `GET /health` endpoint, graceful shutdown, and a `Dockerfile`.
2. **Configuration (S).** Document every environment variable in `.env.example`: `DATABASE_URL`, Supabase URL and keys, `USER_AGENT`, `PORT`, the internal-endpoint secret. The app should fail fast with a clear message when one is missing.
3. **Scheduler on a host that sleeps (M).** Free hosts stop idle services, and the in-process timers stop with them. Add refresh-on-open (when the dashboard loads, refresh any stale sources first) and an `POST /internal/tick` endpoint, called every 15 to 30 minutes by a free external cron (a GitHub Actions schedule, or cron-job.org). The in-process scheduler can stay for local development.
4. **CI to deploy (S).** CI already runs lint, format, typecheck, tests and build on the GitHub repo. Add deploy-on-merge to `main` once a host is chosen, and a Postgres service for CI if we ever need one beyond PGlite.
5. **Backups and export (M).** Supabase's free tier has no point-in-time recovery (verify), so schedule a weekly `pg_dump` in GitHub Actions and store it as a private artifact, and build the dashboard import/export that is already on the known-gaps list.
6. **Basic monitoring (S).** An uptime check on `/health` and readable logs. The in-app source errors already show failing feeds.

## Step 4: Choose a host and deploy (size M)

Supabase covers the database and login. Only the Node API (with its scheduler) needs a home.

| Option                                             | Cost                    | Works with our code                              | Catches                                                                                                                              |
| -------------------------------------------------- | ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Render free web service** (recommended start) | Free, no card reported  | Yes, as a Node or Docker service                 | Sleeps when idle; the first request takes about a minute. Needs the external cron from Step 3. Free-tier terms need checking.        |
| B. Always-free VM (e.g. Oracle Cloud)              | Free, card for sign-up  | Yes, always on, so the scheduler works unchanged | You run the server: updates, TLS (Caddy), firewall. Availability of free capacity varies; verify before choosing.                    |
| C. Koyeb free instance                             | Reported free           | Yes                                              | Reported by one source only; verify.                                                                                                 |
| D. Cloudflare Workers                              | Free, 100k requests/day | No, not without a rewrite                        | The API relies on Node-specific pieces (`undici`, the SSRF guard's DNS checks, in-process timers) and free CPU time is tiny (10 ms). |
| Fly.io, Railway                                    | Trial only, per sources | Yes                                              | No lasting free tier, so they break the "no payment" goal.                                                                           |

**Recommendation:** Supabase (database and login) with Option A for the API and web app together. If sleeping or the cold start annoys you, move to Option B later. Nothing in Steps 1 to 3 locks us in, because the app is a plain Node container.

Steps:

1. Create the Supabase project and apply the baseline migration.
2. Import your data with the script from Step 1.
3. Create the host service from the GitHub repo and set the environment variables.
4. Deploy, then run the smoke test: log in, dashboards and widgets load, a refresh works, a refused (non-logged-in) request returns `401`, `/health` answers.
5. Add the cron trigger and confirm sources refresh while the site sleeps.
6. Optional: a custom domain.

Known free-tier trade-offs to accept for now:

- Supabase pauses free projects after about a week with no activity, and restoring is manual. Regular use or the scheduler's database queries should prevent it, but verify.
- Free database is about 500 MB. Items are pruned to 100 per source, so a personal dashboard stays well below that.
- A sleeping host means a slow first load after idle time.

## Open questions

- Which email should the one account use?
- Do you want a custom domain now or later?
- Is a roughly one-minute wake-up after idle acceptable, or should Option B (always-on VM) be the starting point?
- Should the old local data be imported, or start with a clean database?

## Order and dependencies

```
Step 0 decisions
   └─ Step 1 Postgres ── Step 2 Auth ── Step 3 Deployable ── Step 4 Host and deploy
```

Steps 1.3 (async data layer) and 2.2 (token middleware) are the riskiest. Commit after each numbered item, with the test suite green.

## Sources (third-party, to verify)

- [Supabase pricing and limits, 2026 guide](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [Supabase free tier limits in 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
- [Hosting free tiers side by side, September 2026](https://flaviocopes.com/hosting-free-tiers/)
- [Render's overview of free tiers](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026.md)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits)
