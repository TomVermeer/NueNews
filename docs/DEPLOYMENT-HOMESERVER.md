# Deploying NueNews on the home server

NueNews runs as one container (the API, the scheduler and the built web app, on port 3000). It still uses Supabase for the database and for login, so this move changes where the app runs and nothing else. Moving the database or the login comes later, see [HOMESERVER-NEXT-STEPS.md](HOMESERVER-NEXT-STEPS.md).

You build the image on your PC and send it to the server. The server never needs the source code, only the image and two small files. The container joins the Docker network `web`: Caddy reaches it by name, and the Cloudflare Tunnel reaches Caddy, so no port is opened on the router or published on the server.

```
browser -> Cloudflare -> tunnel -> caddy:80 -> nuenews:3000 -> Supabase (database, login)
```

The files involved:

| File                                          | What it is                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Dockerfile](../Dockerfile)                   | Builds the web app, then a small image that runs the API with the web app inside.                                  |
| [.dockerignore](../.dockerignore)             | Keeps `.env` files, backups and local databases out of the image.                                                  |
| [deploy/compose.yaml](../deploy/compose.yaml) | Runs the image on the `web` network. This is one of the two files the server needs.                                |
| [deploy/.env.example](../deploy/.env.example) | The settings the container reads when it starts. Copy it to `.env` on the server. This is the other file it needs. |

## Before you start

- **Server:** already done, according to the server notes: Docker with Compose, the `web` network, Caddy and the tunnel. SSH from your PC to `nue@192.168.1.15` works.
- **PC:** Docker Desktop is running. If `docker` is not found, open a new terminal window, because terminals opened before the install do not see it.
- **Supabase values**, the same ones Render uses (see [DEPLOYMENT-PLAN.md](DEPLOYMENT-PLAN.md), "What only the owner can do"): the project URL, the public key (publishable or `anon`), the Session pooler connection string, and the JWT secret only for an older project.
- Both computers are 64-bit Intel/AMD machines, so an image built on the PC runs on the server as it is.

Each command says where it runs. Run them one line at a time.

## 1. Build the image (on the PC)

In PowerShell, in the NueNews folder. The two values are public: they are baked into the web app, which is why they are needed here and not on the server.

```powershell
docker build -t nuenews:local --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=<public key> .
```

## 2. Send it to the server

Save the image to a file (on the PC). It is about 125 MB. A file is safer than piping it, because PowerShell can corrupt binary data in a pipe.

```powershell
docker save -o nuenews.tar nuenews:local
```

Make the folder (on the server):

```bash
mkdir -p ~/server/nuenews
```

Copy the image and the two small files (on the PC, in the NueNews folder):

```powershell
scp nuenews.tar nue@192.168.1.15:
```

```powershell
scp deploy/compose.yaml nue@192.168.1.15:server/nuenews/compose.yaml
```

```powershell
scp deploy/.env.example nue@192.168.1.15:server/nuenews/.env.example
```

Load the image and remove the file (on the server):

```bash
docker load -i ~/nuenews.tar
```

```bash
rm ~/nuenews.tar
```

`docker load` should say `Loaded image: nuenews:local`. You can delete `nuenews.tar` on the PC too.

## 3. Create the settings file (on the server)

```bash
cd ~/server/nuenews
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

Fill in `DATABASE_URL` (the Supabase **Session pooler** string), `SUPABASE_URL` and, only for an older Supabase project, `SUPABASE_JWT_SECRET`. Leave `CRON_SECRET` out: the container stays awake, so its own scheduler refreshes the feeds.

## 4. Start it (on the server)

```bash
docker compose up -d
```

```bash
docker compose ps
```

The container should say `healthy` after about half a minute. If it does not:

```bash
docker compose logs --tail 50
```

## 5. Add it to Caddy (on the server)

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

## 6. Add the tunnel route

In the Cloudflare dashboard (Zero Trust, Networks, Tunnels, `home-server`) add a route:

| Hostname          | Service URL       |
| ----------------- | ----------------- |
| `app.nuesoft.app` | `http://caddy:80` |

Cloudflare creates the DNS record itself.

## 7. Try it

Open `https://app.nuesoft.app` on your PC, sign in with your Supabase user, and check that your dashboards and widgets are there.

Supabase needs no change for this. Login is email and password, and the page and the API share one address, so there are no redirect addresses to register. If you later use invite or password-reset emails, set Supabase's Site URL (Authentication, URL Configuration) to the new address.

## Running next to Render

Both copies can run against the same Supabase database. Both run a scheduler, so feeds are polled twice, but nothing is stored twice: items are unique per source and external id. Keep Render until you are happy with the server. At switch-over:

- Delete the Render service.
- The GitHub workflow `refresh.yml` only wakes the Render service, so it can go too. `backup.yml` still backs up the Supabase database and stays.

## Updating

After a code change, repeat the build and the send, then restart the container. On the PC:

```powershell
docker build -t nuenews:local --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=<public key> .
```

```powershell
docker save -o nuenews.tar nuenews:local
```

```powershell
scp nuenews.tar nue@192.168.1.15:
```

On the server:

```bash
docker load -i ~/nuenews.tar
```

```bash
rm ~/nuenews.tar
```

```bash
cd ~/server/nuenews
```

```bash
docker compose up -d
```

Compose notices the new image and replaces the container. Then remove the old, unused image layers:

```bash
docker image prune -f
```

To stop the app: `docker compose down` in `~/server/nuenews`. The data lives in Supabase, so stopping or replacing the container loses nothing. Sending the image by hand gets tedious; the plan to have GitHub build and publish it is in [HOMESERVER-NEXT-STEPS.md](HOMESERVER-NEXT-STEPS.md).

## What the server changes, and what it does not

- The server has more downtime than Render: power or internet cuts and the 04:00 reboots. `restart: unless-stopped` brings the container back after a reboot.
- Supabase's free tier pauses a project that has been inactive for a week. The scheduler queries the database every few minutes, but this has not been verified to count as activity. If the app ever stops loading, check the Supabase dashboard for a paused project and restore it.
