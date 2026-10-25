# Home server: next steps

These are outlines to pick up later, not approved plans. When you resume, present the plan for the part you choose and wait for approval first (see the working rules in `~/.claude/CLAUDE.md`).

## Where things stand

Written (branch `feature/deploy_to_homeserver`): the [Dockerfile](../Dockerfile), [deploy/compose.yaml](../deploy/compose.yaml), [deploy/.env.example](../deploy/.env.example) and [DEPLOYMENT-HOMESERVER.md](DEPLOYMENT-HOMESERVER.md). The route is: build the image on the PC, send it to the server with `docker save`, `scp` and `docker load`, and run it with `compose.yaml` and a `.env`. The server does not need the source code.

Tested on the PC: the image builds, and after a save and a load it starts through `deploy/compose.yaml`, becomes healthy and answers by name from another container on the `web` network. A scratch Postgres stood in for Supabase. The app still uses Supabase for the database and login, and Render keeps running.

Not done yet, and only the owner can do it:

- Push the branch.
- Follow [DEPLOYMENT-HOMESERVER.md](DEPLOYMENT-HOMESERVER.md): build and send the image, create `.env` on the server, `docker compose up -d`, add the Caddy block and the tunnel route.
- Not tested yet: running it on the real server, and a real Supabase login through the tunnel.

## Plan A: Automatic image builds (GitHub Actions, ghcr.io)

Goal: replace the manual build, `docker save` and `scp` with GitHub. Pushing to `main` builds the image and publishes it, and the server pulls it. No inbound access to the server is needed. Do not use a self-hosted runner on the server, especially if the repository is public.

Outline:

1. Add a workflow, for example `.github/workflows/image.yml`, that runs on pushes to `main` (after CI), builds the image with `docker/build-push-action` and pushes `ghcr.io/<account>/nuenews` tagged `latest` and with the commit hash. It needs `packages: write` and the built-in `GITHUB_TOKEN`.
2. Pass `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build arguments from repository **variables** (they are public values baked into the web app).
3. Point the server at the published image: set `NUENEWS_IMAGE=ghcr.io/<account>/nuenews:latest` in the server's `.env`. `deploy/compose.yaml` already supports this and no longer needs the `VITE_` values. Then drop steps 1 and 2 (build and send) from [DEPLOYMENT-HOMESERVER.md](DEPLOYMENT-HOMESERVER.md), and the "Updating" section becomes `docker compose pull` and `up -d`.
4. Decide how the server updates: by hand (`docker compose pull` then `up -d`), or automatically on a timer or with a watcher container.
5. Validate: the workflow goes green, the server pulls the image, the container becomes healthy, and rolling back to an older commit-hash tag works.

Decisions for the owner:

- Is the GitHub repository public or private? A private repository or private package means the server needs a read-only token to pull.
- Manual or automatic updates on the server?

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

- Add `name: nuenews` to `deploy/compose.yaml`, so Compose calls the project `nuenews` instead of `deploy`.
- At the switch-over from Render: delete the Render service and the `refresh.yml` workflow (it only wakes Render). Keep `backup.yml` for as long as the database is on Supabase.
- Unverified: whether the scheduler's regular queries keep a free Supabase project from pausing.
- Still waiting from before: RoyalRoad provider, Playwright end-to-end tests, Reddit preset (see `CLAUDE.md`, "Where we left off").
