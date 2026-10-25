# Deploying NueNews on the home server

NueNews runs as one container (the API, the scheduler and the built web app, on port 3000). It still uses Supabase for the database and for login, so this move changes where the app runs and nothing else. Moving the database or the login comes later, see the end of this page.

The container joins the Docker network `web`. Caddy reaches it by name, and the Cloudflare Tunnel reaches Caddy, so no port is opened on the router or published on the server.

```
browser -> Cloudflare -> tunnel -> caddy:80 -> nuenews:3000 -> Supabase (database, login)
```

The files involved:

| File                                          | What it is                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| [Dockerfile](../Dockerfile)                   | Builds the web app, then a small image that runs the API with the web app inside. |
| [.dockerignore](../.dockerignore)             | Keeps `.env` files, backups and local databases out of the image.                 |
| [deploy/compose.yaml](../deploy/compose.yaml) | Runs the container on the `web` network. It builds the image from the repository. |
| [deploy/.env.example](../deploy/.env.example) | The settings the container needs. Copy it to `deploy/.env`.                       |

## Before you start

These are already done, according to the server notes: Docker with Compose, the `web` network, Caddy, and the tunnel. You also need:

- The Supabase values you used for Render (see [DEPLOYMENT-PLAN.md](DEPLOYMENT-PLAN.md), "What only the owner can do").
- This work pushed to GitHub, so the server can fetch it.

Commands below run **on the server** (over SSH) unless it says otherwise. Run them one line at a time.

## 1. Get the code onto the server

```bash
cd ~/server
```

```bash
git clone https://github.com/<your-account>/NueNews.git nuenews
```

For a private repository, add a read-only deploy key to the repository (Settings, Deploy keys) and clone with the SSH address instead.

## 2. Create the settings file

```bash
cd ~/server/nuenews/deploy
```

```bash
cp .env.example .env
```

```bash
chmod 600 .env
```

```bash
nano .env
```

Fill in `DATABASE_URL` (the Supabase **Session pooler** string), `SUPABASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and, only for an older Supabase project, `SUPABASE_JWT_SECRET`. Leave `CRON_SECRET` out: the container stays awake, so its own scheduler refreshes the feeds.

The two `VITE_` values are public and are baked into the web app when the image is built. If you change them, rebuild the image (step 3 again).

## 3. Build and start

```bash
docker compose up -d --build
```

The first build takes a few minutes on this laptop. Then check it:

```bash
docker compose ps
```

The container should say `healthy` after about half a minute. If it does not:

```bash
docker compose logs --tail 50
```

Check that the app answers over the Docker network, the same way Caddy will reach it:

```bash
docker exec caddy wget -qO- http://nuenews:3000/api/v1/health
```

It should print `{"status":"ok"}`.

## 4. Add it to Caddy

Edit `~/server/caddy/Caddyfile`. Once there is more than one site, the catch-all `:80` block becomes one block per hostname. `app.nuesoft.app` is an example, pick the name you want (one level deep, like `app.nuesoft.app`):

```
http://nuesoft.app {
    root * /srv/site
    file_server
}

http://app.nuesoft.app {
    reverse_proxy nuenews:3000
}
```

Then restart Caddy:

```bash
cd ~/server/caddy
```

```bash
docker compose restart
```

## 5. Add the tunnel route

In the Cloudflare dashboard (Zero Trust, Networks, Tunnels, `home-server`) add a route:

| Hostname          | Service URL       |
| ----------------- | ----------------- |
| `app.nuesoft.app` | `http://caddy:80` |

Cloudflare creates the DNS record itself.

## 6. Try it

Open `https://app.nuesoft.app` on your PC, sign in with your Supabase user, and check that your dashboards and widgets are there.

Supabase needs no change for this. Login is email and password, and the page and the API share one address, so there are no redirect addresses to register. If you later use invite or password-reset emails, set Supabase's Site URL (Authentication, URL Configuration) to the new address.

## Running next to Render

Both copies can run against the same Supabase database. Both run a scheduler, so feeds are polled twice, but nothing is stored twice: items are unique per source and external id. Keep Render until you are happy with the server. At switch-over:

- Delete the Render service.
- The GitHub workflow `refresh.yml` only wakes the Render service, so it can go too. `backup.yml` still backs up the Supabase database and stays.

## Updating

After you push a change:

```bash
cd ~/server/nuenews
```

```bash
git pull
```

```bash
cd deploy
```

```bash
docker compose up -d --build
```

To stop it: `docker compose down` in the `deploy` folder. The data lives in Supabase, so stopping or rebuilding loses nothing.

## What the server changes, and what it does not

- The server has more downtime than Render: power or internet cuts and the 04:00 reboots. `restart: unless-stopped` brings the container back after a reboot.
- Supabase's free tier pauses a project that has been inactive for a week. The scheduler queries the database every few minutes, but this has not been verified to count as activity. If the app ever stops loading, check the Supabase dashboard for a paused project and restore it.

## Later

Automatic image builds (GitHub Actions to ghcr.io, then the server pulls the image) and the database and login decision are separate steps. If the database moves to a container on this server, set up off-site backups first, because the server has one aging disk.
