# Deploying NueNews on the home server

NueNews runs as one container (the API, the scheduler and the built web app, on port 3000). It still uses Supabase for the database and for login, so this move changes where the app runs and nothing else. Moving the database or the login comes later, see [HOMESERVER-NEXT-STEPS.md](HOMESERVER-NEXT-STEPS.md).

GitHub Actions builds the image and publishes it to `ghcr.io/tomvermeer/nuenews` when a pull request is merged to `main`. The server pulls the image. GitHub never connects to the server. The server needs only the image and three small files (`compose.yaml`, `.env` and `update.sh`), not the source code. The container joins the Docker network `web`: Caddy reaches it by name, and the Cloudflare Tunnel reaches Caddy, so no port is opened on the router or published on the server.

```
browser -> Cloudflare -> tunnel -> caddy:80 -> nuenews:3000 -> Supabase (database, login)
```

The files involved:

| File                                                              | What it is                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Dockerfile](../Dockerfile)                                       | Builds the web app, then a small image that runs the API with the web app inside.                                                                   |
| [.dockerignore](../.dockerignore)                                 | Keeps `.env` files, backups and local databases out of the image.                                                                                   |
| [deploy/compose.yaml](../deploy/compose.yaml)                     | Runs the image on the `web` network. The server needs this file.                                                                                    |
| [deploy/.env.example](../deploy/.env.example)                     | The settings the container reads when it starts. Copy it to `.env` on the server. The server needs this file too.                                   |
| [deploy/update.sh](../deploy/update.sh)                           | Pulls the newest image, recreates the container and waits for the health check. A timer runs it, or you run it by hand. The server needs this file. |
| [deploy/nuenews-update.service](../deploy/nuenews-update.service) | systemd unit that runs `update.sh`. Installed on the server.                                                                                        |
| [deploy/nuenews-update.timer](../deploy/nuenews-update.timer)     | systemd timer that starts the unit 5 minutes after boot and then every 2 hours. Installed on the server.                                            |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml)           | The `image` job builds the image on every pull request, and on a push to `main` also publishes it to ghcr.io.                                       |

## Before you start

- **Server:** already done, according to the server notes: Docker with Compose, the `web` network, Caddy and the tunnel. SSH from your PC to `nue@192.168.1.15` works.
- **Supabase values** for the server's `.env`, the same ones Render uses (see [DEPLOYMENT-PLAN.md](DEPLOYMENT-PLAN.md), "What only the owner can do"): the Session pooler connection string, the project URL, and the JWT secret only for an older project.
- **GitHub, one-time setup** (the owner does this in the browser):
  - Add two repository variables under Settings, Secrets and variables, Actions, Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. They are the public Supabase values, and the image build needs them.
  - Turn on branch protection for `main`: a pull request is required, and force-pushes are not allowed.
  - After the first image is published, make the package public: GitHub profile, Packages, `nuenews`, Package settings, Change visibility. New packages start private, and the server cannot pull a private package without a login.

Each command says where it runs. Run them one line at a time.

## 1. Put the files on the server

Make the folder (on the server):

```bash
mkdir -p ~/server/nuenews
```

Copy the three files (on the PC, in the NueNews folder):

```powershell
scp deploy/compose.yaml nue@192.168.1.15:server/nuenews/compose.yaml
```

```powershell
scp deploy/.env.example nue@192.168.1.15:server/nuenews/.env.example
```

```powershell
scp deploy/update.sh nue@192.168.1.15:server/nuenews/update.sh
```

Make the update script executable (on the server):

```bash
chmod +x ~/server/nuenews/update.sh
```

### Pulling the image by hand

The server pulls the image itself. These are the ways to do it by hand, once the app is set up (steps 2 and 3 below).

To pull the newest image and start it (on the server, in `~/server/nuenews`):

```bash
docker compose pull
```

```bash
docker compose up -d
```

Or run the update script, which does the same and also waits for the health check and removes old images:

```bash
./update.sh
```

`update.sh` does nothing when `NUENEWS_IMAGE` in `.env` is set to a tag other than `latest`. See "Rolling back" below.

To pull one specific version (on the server). Tags are `latest` and `sha-` followed by the short commit SHA of each merged change (for example `sha-abc1234`). They are listed on the repository's Packages page. After the first publish, check that page to confirm the exact image name and tags. This only downloads the image. To run it, set `NUENEWS_IMAGE` in `.env` as described in "Rolling back".

```bash
docker pull ghcr.io/tomvermeer/nuenews:sha-abc1234
```

To see which version is running (on the server). This prints the full commit SHA of the running image:

```bash
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' nuenews
```

To see whether the container is up and healthy (on the server):

```bash
docker compose ps
```

**If GitHub is unreachable**, you can still build the image on the PC and send it. Build it (on the PC, in the NueNews folder). The two values are public: they are baked into the web app.

```powershell
docker build -t nuenews:local --build-arg VITE_SUPABASE_URL=https://<project>.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=<public key> .
```

Save the image to a file (on the PC). A file is safer than piping it, because PowerShell can corrupt binary data in a pipe.

```powershell
docker save -o nuenews.tar nuenews:local
```

Copy it to the server (on the PC):

```powershell
scp nuenews.tar nue@192.168.1.15:
```

Load it and remove the file (on the server):

```bash
docker load -i ~/nuenews.tar
```

```bash
rm ~/nuenews.tar
```

`docker load` should say `Loaded image: nuenews:local`. Then set `NUENEWS_IMAGE=nuenews:local` in `.env` and run `docker compose up -d` in `~/server/nuenews`. The tag is not `latest`, so `update.sh` treats the image as pinned and skips the update. Remove that line from `.env` to go back to the published images.

## 2. Create the settings file (on the server)

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

## 3. Start it (on the server)

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

## 4. Add it to Caddy (on the server)

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

## Automatic updates

After a merge to `main`, GitHub builds and publishes the image, which takes a few minutes. The timer on the server runs `update.sh` 5 minutes after boot and then every 2 hours, so the new image is picked up within 2 hours.

The unit files come from `deploy/` on the PC. Copy them to the server (on the PC, in the NueNews folder):

```powershell
scp deploy/nuenews-update.service nue@192.168.1.15:server/nuenews/nuenews-update.service
```

```powershell
scp deploy/nuenews-update.timer nue@192.168.1.15:server/nuenews/nuenews-update.timer
```

Install them (on the server):

```bash
sudo cp ~/server/nuenews/nuenews-update.service ~/server/nuenews/nuenews-update.timer /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now nuenews-update.timer
```

Check them (on the server):

```bash
systemctl list-timers nuenews-update.timer
```

```bash
sudo systemd-analyze verify /etc/systemd/system/nuenews-update.service /etc/systemd/system/nuenews-update.timer
```

Run one update now, without waiting for the timer:

```bash
sudo systemctl start nuenews-update.service
```

Read the result of the last run:

```bash
journalctl -u nuenews-update -n 30
```

If the health check fails, the run fails and the failure shows up in the journal. It does not roll back by itself. Use "Rolling back" below to go back to an older version.

## Rolling back

Find the short SHA of the commit you want to return to. The Packages page lists the tags. On the PC you can also use `git log --oneline` in the NueNews folder.

Set the version in `.env` (on the server, in `~/server/nuenews`). Open the file:

```bash
nano .env
```

Add this line, with your short SHA in place of `abc1234` (the tag is `sha-` followed by the SHA):

```
NUENEWS_IMAGE=ghcr.io/tomvermeer/nuenews:sha-abc1234
```

Then start that version (on the server):

```bash
docker compose up -d
```

While `NUENEWS_IMAGE` is set to a tag other than `latest`, `update.sh` leaves the container alone. To follow the newest image again, delete or comment out that line in `.env`, then run `./update.sh`.

## Running next to Render

Both copies can run against the same Supabase database. Both run a scheduler, so feeds are polled twice, but nothing is stored twice: items are unique per source and external id. Keep Render until you are happy with the server. While Render's auto-deploy is still on, a merge to `main` deploys to both. At switch-over:

- Delete the Render service.
- The GitHub workflow `refresh.yml` only wakes the Render service, so it can go too. `backup.yml` still backs up the Supabase database and stays.

## Updating

Updates are automatic. After a merge to `main`, GitHub builds and publishes the image (a few minutes), and the timer picks it up within 2 hours. To update at once, run `./update.sh` on the server, in `~/server/nuenews`.

To stop the app: `docker compose down` in `~/server/nuenews`. The data lives in Supabase, so stopping or replacing the container loses nothing.

## A web interface for the server (issue 4)

There is an open question about managing the server through a web interface: [issue 4](https://github.com/TomVermeer/NueNews/issues/4). The setup is a plain Compose stack running a tagged registry image, which tools that manage Compose stacks through a web interface can take over. Portainer and Dockge are the candidates to evaluate, and Caddy has its own admin API. None has been chosen or tested.

If such a tool starts updating the stack, disable the timer so that two updaters do not fight (on the server):

```bash
sudo systemctl disable --now nuenews-update.timer
```

## What the server changes, and what it does not

- The server has more downtime than Render: power or internet cuts and the 04:00 reboots. `restart: unless-stopped` brings the container back after a reboot.
- Supabase's free tier pauses a project that has been inactive for a week. The scheduler queries the database every few minutes, but this has not been verified to count as activity. If the app ever stops loading, check the Supabase dashboard for a paused project and restore it.
