#!/usr/bin/env bash
# Pulls the newest NueNews image and recreates the container when there is one. A systemd timer runs
# this every 2 hours (see nuenews-update.timer); you can also run it by hand: ./update.sh
#
# It lives next to compose.yaml and .env on the server. To roll back, set NUENEWS_IMAGE in .env to a
# specific tag (for example ghcr.io/tomvermeer/nuenews:sha-abc1234): a pinned image is left alone.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

# One run at a time, so a hand-started run and the timer cannot overlap. Exit code 99 means the lock
# is taken; any other failure (for example flock not installed) is an error, not "busy".
exec 9>.update.lock
lock=0
flock -n -E 99 9 || lock=$?
if [ "$lock" = 99 ]; then
  echo "Another update is already running, nothing to do."
  exit 0
elif [ "$lock" != 0 ]; then
  echo "Could not take the update lock (flock exited with $lock)." >&2
  exit 1
fi

# The last uncommented NUENEWS_IMAGE= line in .env, without quotes, spaces or a Windows line ending.
image="$(grep -E '^NUENEWS_IMAGE=' .env 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d "\"' \r" || true)"

# The tag is what follows the colon in the last path segment, so a registry port
# ("localhost:5000/nuenews") is not a tag. No tag means latest, the same as for Compose.
tag=""
last="${image##*/}"
if [[ "$last" == *:* ]]; then
  tag="${last##*:}"
fi
if [ -n "$tag" ] && [ "$tag" != "latest" ]; then
  echo "Image is pinned to $image, skipping the update."
  exit 0
fi

docker compose pull --quiet
docker compose up -d

# Compose only recreates the container when the image changed. Wait for the health check either way.
tries="${HEALTH_TRIES:-30}"
interval="${HEALTH_INTERVAL:-3}"
health=""
for ((i = 0; i < tries; i++)); do
  health="$(docker inspect --format '{{.State.Health.Status}}' nuenews 2>/dev/null || true)"
  if [ "$health" = "healthy" ]; then
    break
  fi
  sleep "$interval"
done

if [ "$health" != "healthy" ]; then
  echo "nuenews is not healthy (status: ${health:-unknown}). Check: docker compose logs --tail 50" >&2
  echo "The container already runs the new image. To go back, pin NUENEWS_IMAGE in .env to the" >&2
  echo "previous tag (ghcr.io/tomvermeer/nuenews:sha-<commit>) and run ./update.sh." >&2
  exit 1
fi

echo "nuenews is healthy."
# Only after a good start: this removes the superseded image layers.
docker image prune -f >/dev/null
