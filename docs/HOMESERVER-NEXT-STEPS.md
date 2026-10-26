# Home server: next steps

These are outlines to pick up later, not approved plans. When you resume, present the plan for the part you choose and wait for approval first (see the working rules in `~/.claude/CLAUDE.md`).

## Where things stand

Written on branch `feature/auto_deploy_homeserver`, not merged yet: automatic image builds (the `image` job in `.github/workflows/ci.yml`, which publishes to `ghcr.io/tomvermeer/nuenews` on a merge to `main`) and the timer-driven updater ([deploy/update.sh](../deploy/update.sh) with the two systemd units in `deploy/`). The server pulls the image; GitHub never connects to the server. The guide is [DEPLOYMENT-HOMESERVER.md](DEPLOYMENT-HOMESERVER.md).

Tested on the PC before this change: the image builds, and after a save and a load it starts through `deploy/compose.yaml`, becomes healthy and answers by name from another container on the `web` network. A scratch Postgres stood in for Supabase. The app still uses Supabase for the database and login, and Render keeps running.

Not done yet, and only the owner can do it:

- Merge the branch.
- The three GitHub setup items: the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, branch protection for `main`, and making the package public after the first publish.
- Copy the files to the server and install the timer, as in [DEPLOYMENT-HOMESERVER.md](DEPLOYMENT-HOMESERVER.md).
- The Render cutover: set `autoDeploy: false` in `render.yaml` first, keep the Render service about a week as a fallback, then delete it and `refresh.yml`.
- Not tested yet: running it on the real server, and a real Supabase login through the tunnel.

## Plan A: done

Automatic image builds and the timer-driven updater are built. A merge to `main` builds the image and publishes it to `ghcr.io/tomvermeer/nuenews`, tagged `latest` and `sha-<short commit SHA>`. A systemd timer on the server runs `deploy/update.sh` every 2 hours to pull it. Rolling back is a pinned `NUENEWS_IMAGE` in the server's `.env`. Setup and operation are in [DEPLOYMENT-HOMESERVER.md](DEPLOYMENT-HOMESERVER.md).

## Plan B: Database and login

The question: run Postgres on the home server and/or move away from Supabase Auth.

Recommendation:

- **Login:** keep Supabase Auth. It works with a self-hosted app, costs nothing, and replacing it is real, security-sensitive work that has nothing to do with Docker. Only replace it if there is a clear reason (independence, learning). The cost: login still depends on Supabase being reachable.
- **Database:** moving to a Postgres container is a small code change (only `DATABASE_URL` differs), but do it only after off-site backups exist. The server has one aging hard drive, and it has more downtime than a hosted database.

Outline:

1. Decide why you want to move (cost, Supabase pausing free projects, independence). This was an open question in the server notes.
2. **Backups first.** A scheduled `pg_dump` from a container, stored encrypted off the server (the target is a decision: for example an object storage bucket). Prove it by restoring a dump into a scratch database.
3. Add a `postgres` service to the compose file: a named volume, no published port, a health check, and the app waiting for it.
4. Cut over: stop the app, dump the Supabase database, restore it locally, point `DATABASE_URL` at the container, start the app and check the dashboards. Keep the Supabase database untouched for a week as a fallback. Things to check when restoring: row-level security is on with no policies, so the restoring role must own the tables, and the `users` rows carry Supabase user IDs, which stay valid while Supabase Auth stays.
5. **Only if leaving Supabase Auth:** a separate plan. It replaces the token check in `apps/api/src/auth/`, the login page and store in `apps/web/src/`, and the invite flow. Options are a maintained auth library or putting Cloudflare Access in front of the app.

## Small items

- At the switch-over from Render: delete the Render service and the `refresh.yml` workflow (it only wakes Render). Keep `backup.yml` for as long as the database is on Supabase.
- Unverified: whether the scheduler's regular queries keep a free Supabase project from pausing.
- Still waiting from before: RoyalRoad provider, Playwright end-to-end tests, Reddit preset (see `CLAUDE.md`, "Where we left off").
