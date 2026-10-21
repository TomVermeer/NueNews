# Deployment plan

Goal: put NueNews online for one user, at no cost for now, with real login and a hosted PostgreSQL database. RoyalRoad and the Reddit preset wait until after this.

Sizes are rough: **S** is an hour or two, **M** is a session, **L** is several sessions.

## Where we start

- The API (`apps/api`) runs on Hono with SQLite through `better-sqlite3` and Drizzle. About 45 call sites use Drizzle's synchronous `.run()`, `.get()`, `.all()` and `db.transaction(() => …)`. Postgres drivers are asynchronous, so the migration touches all of them.
- There is no login. `createApp` takes `currentUserId()`, and `index.ts` always returns the seeded `local` user. Every table and route is already scoped by `user_id`, which is what makes later multi-user support possible.
- The scheduler runs inside the API process on timers. It only works while the process is awake.
- The web app (`apps/web`) is a separate Vite build that proxies `/api` in dev.

## Decisions (Step 0)

Use case: a dashboard reachable from anywhere, used by the owner and maybe a few friends or colleagues trying it out. It has to be free and easy to manage.

| #   | Decision              | Outcome                                                                                                                                                                                                                  |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Database              | **Supabase Postgres** (free tier). Chosen.                                                                                                                                                                               |
| 2   | Login                 | **Supabase Auth**: email and password, public sign-ups off, accounts created by invitation. Handles the owner now and a few testers later. Chosen.                                                                       |
| 3   | Where the API runs    | **Render free web service**, running the API, the scheduler and the web build as one service. Chosen after researching the alternatives (see Step 4).                                                                    |
| 4   | How the web app ships | **Served by the API itself** (one deployable, same origin). That avoids CORS and cookie problems and needs only one free service.                                                                                        |
| 5   | Test database         | **PGlite** (real Postgres running in-process). Tests stay fast, need no Docker, and behave like production.                                                                                                              |
| 6   | Existing local data   | Imported into the dev database with the importer from Step 1; the same script loads it into Supabase.                                                                                                                    |
| 7   | Agent tooling         | Both vendors have an official MCP server: [Render](https://render.com/docs/mcp-server) (services, env vars, deploys, logs) and [Supabase](https://supabase.com/docs/guides/getting-started/mcp) (SQL, migrations, logs). |

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

## Step 4: Deploy (size M)

**Decided: Render (API, scheduler and web build) plus Supabase (database and login).** Research on 2026-10-21 used official vendor pages. Summary of why the others lost:

| Option                    | Verdict                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Render + Supabase**     | Chosen. Free, mature, one deployable service, two official MCP servers. Sleeps when idle (see trade-offs).                                                                                                                                                                                           |
| Neon all-in-one           | Postgres, login and functions on one free plan with no card, but Functions are in beta, do not host websites (so the web app needs a second host), and several things were not verifiable: outbound HTTP and DNS inside a function, and email/password login with sign-ups off. Worth a spike later. |
| Oracle Always Free VM     | Always on, but you run the server (updates, TLS, firewall), a card is likely needed and capacity varies.                                                                                                                                                                                             |
| Supabase Edge Functions   | Not a fit for the API: 2 s CPU, 256 MB, Deno.                                                                                                                                                                                                                                                        |
| Cloudflare, Fly.io, Koyeb | Workers need a rewrite (10 ms CPU free), Containers are paid, Fly.io has no free tier, Koyeb needs a card and its free Postgres is time-limited.                                                                                                                                                     |
| Vercel                    | Functions only, and cron runs once a day, so it cannot refresh feeds.                                                                                                                                                                                                                                |

Render facts that shape the work:

- The free web service spins down after 15 minutes without traffic and wakes in about a minute. It has 750 free instance hours a month, so exactly one always-awake service fits (744 hours).
- Render may ask for a card at signup. Its own docs do not require one, but its pricing page and staff say verification may. Confirm at signup.
- Do not use Render's free Postgres: it expires after 30 days.
- Supabase's direct database connection is IPv6-only. Use the **session-mode pooler on port 5432**, which is IPv4.
- A free Supabase project pauses after a week without activity. The scheduler's regular database use keeps it active.

Steps:

1. Create the Supabase project (database and Auth). Apply the migrations by starting the API against it once. Turn public sign-ups off and create the owner's user.
2. Import your data with `db:import-sqlite -- <file> --user-id <the Supabase user id>`.
3. Create the Render web service from the GitHub repo, set the environment variables, and connect auto-deploy.
4. Deploy, then run the smoke test: log in, dashboards and widgets load, a refresh works, a request without a session returns `401`, `/health` answers.
5. Add the cron (GitHub Actions or cron-job.org) calling the guarded tick endpoint every 15 minutes. This both refreshes sources and keeps the service awake. Confirm sources refresh while nobody is using the site.
6. Optional: a custom domain.

Known free-tier trade-offs to accept for now:

- The first visit after a long idle can take about a minute to load. With the 15 minute cron the service stays awake almost all the time.
- The Supabase free database is about 500 MB and has no automatic backups, so Step 3 adds a weekly export. Items are pruned to 100 per source, so a personal dashboard stays well below the size limit.
- Free-tier terms can change; recheck them if something stops working.

## Open questions

- Which email should the owner's account use? (Needed for Step 2.)
- Do you want a custom domain now or later?
- Which friends or colleagues will get an account, and is invite-only enough? (Step 2 can create invitations later.)

## Order and dependencies

```
Step 0 decisions (done)
   └─ Step 1 Postgres ── Step 2 Auth ── Step 3 Deployable ── Step 4 Host and deploy
```

Steps 1.3 (async data layer) and 2.2 (token middleware) are the riskiest. Commit after each numbered item, with the test suite green.

## Sources (checked 2026-10-21)

- [Render free tier](https://render.com/docs/free) and [Render MCP server](https://render.com/docs/mcp-server)
- [Supabase pricing](https://supabase.com/pricing), [connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Supabase MCP](https://supabase.com/docs/guides/getting-started/mcp)
- [Neon pricing](https://neon.com/pricing) and [Neon Functions overview](https://neon.com/docs/compute/functions/overview)
- [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
