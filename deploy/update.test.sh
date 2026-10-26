#!/usr/bin/env bash
# Tests for update.sh. `docker` and `flock` are replaced by stubs that record what they were asked to
# do, so nothing here needs Docker. Run: bash deploy/update.test.sh
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
failures=0
tmp=""

setup() {
  tmp="$(mktemp -d)"
  mkdir "$tmp/bin" "$tmp/app"
  cp "$here/update.sh" "$tmp/app/update.sh"
  : >"$tmp/docker.log"

  # Records every call. `inspect` answers with $FAKE_HEALTH (default: healthy).
  cat >"$tmp/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$DOCKER_LOG"
if [ "$1" = "inspect" ]; then echo "${FAKE_HEALTH:-healthy}"; fi
STUB
  # flock -E 99 exits 99 when another run holds the lock (FLOCK_BUSY), and something else when it
  # cannot run at all (FLOCK_BROKEN).
  cat >"$tmp/bin/flock" <<'STUB'
#!/usr/bin/env bash
[ -z "${FLOCK_BUSY:-}" ] || exit 99
[ -z "${FLOCK_BROKEN:-}" ] || exit 127
STUB
  chmod +x "$tmp/bin/docker" "$tmp/bin/flock"
}

# run_update <env-file-content>: runs update.sh in the temp dir, sets $status and $output.
run_update() {
  printf '%s' "$1" >"$tmp/app/.env"
  output="$(
    PATH="$tmp/bin:$PATH" DOCKER_LOG="$tmp/docker.log" HEALTH_TRIES=2 HEALTH_INTERVAL=0 \
      bash "$tmp/app/update.sh" 2>&1
  )"
  status=$?
}

check() {
  local name="$1" ok="$2"
  if [ "$ok" = 1 ]; then
    echo "ok   - $name"
  else
    echo "FAIL - $name"
    echo "       exit=$status output=$output"
    echo "       docker calls: $(tr '\n' '|' <"$tmp/docker.log")"
    failures=$((failures + 1))
  fi
}

calls() { cat "$tmp/docker.log"; }

# --- tracking latest (no NUENEWS_IMAGE set) pulls, recreates, waits for health and prunes ---
setup
run_update $'DATABASE_URL=x\n#NUENEWS_IMAGE=ghcr.io/tomvermeer/nuenews:abc1234\n'
check "latest: pulls" "$([ "$(calls | grep -c '^compose pull')" = 1 ] && echo 1 || echo 0)"
check "latest: recreates" "$([ "$(calls | grep -c '^compose up -d')" = 1 ] && echo 1 || echo 0)"
check "latest: prunes" "$([ "$(calls | grep -c '^image prune')" = 1 ] && echo 1 || echo 0)"
check "latest: exits 0" "$([ "$status" = 0 ] && echo 1 || echo 0)"
rm -rf "$tmp"

# --- an explicit :latest tag behaves the same ---
setup
run_update $'NUENEWS_IMAGE=ghcr.io/tomvermeer/nuenews:latest\n'
check "explicit latest: pulls" "$([ "$(calls | grep -c '^compose pull')" = 1 ] && echo 1 || echo 0)"
rm -rf "$tmp"

# --- a pinned tag is the rollback: nothing is touched ---
setup
run_update $'NUENEWS_IMAGE=ghcr.io/tomvermeer/nuenews:abc1234\n'
check "pinned: no docker calls" "$([ ! -s "$tmp/docker.log" ] && echo 1 || echo 0)"
check "pinned: says so" "$(echo "$output" | grep -qi pinned && echo 1 || echo 0)"
check "pinned: exits 0" "$([ "$status" = 0 ] && echo 1 || echo 0)"
rm -rf "$tmp"

# --- a quoted pinned value is still pinned ---
setup
run_update $'NUENEWS_IMAGE="ghcr.io/tomvermeer/nuenews:abc1234"\n'
check "quoted pin: no docker calls" "$([ ! -s "$tmp/docker.log" ] && echo 1 || echo 0)"
check "quoted pin: says so" "$(echo "$output" | grep -qi pinned && echo 1 || echo 0)"
check "quoted pin: exits 0" "$([ "$status" = 0 ] && echo 1 || echo 0)"
rm -rf "$tmp"

# --- values that mean :latest to Compose must still update ---
for value in \
  'ghcr.io/tomvermeer/nuenews' \
  'localhost:5000/nuenews' \
  'ghcr.io/tomvermeer/nuenews:latest ' \
  $'ghcr.io/tomvermeer/nuenews:latest\r' \
  ''; do
  setup
  run_update "NUENEWS_IMAGE=$value"$'\n'
  check "not pinned [$(printf %q "$value")]: pulls" "$([ "$(calls | grep -c '^compose pull')" = 1 ] && echo 1 || echo 0)"
  rm -rf "$tmp"
done

# --- a registry port plus a tag is pinned ---
setup
run_update $'NUENEWS_IMAGE=localhost:5000/nuenews:abc1234\n'
check "registry port with tag: pinned" "$([ ! -s "$tmp/docker.log" ] && echo 1 || echo 0)"
rm -rf "$tmp"

# --- a container that never becomes healthy is reported as a failure ---
setup
FAKE_HEALTH=unhealthy run_update $'DATABASE_URL=x\n'
check "unhealthy: exits non-zero" "$([ "$status" != 0 ] && echo 1 || echo 0)"
check "unhealthy: says so" "$(echo "$output" | grep -qi 'not healthy' && echo 1 || echo 0)"
rm -rf "$tmp"

# --- a second run while one is active does nothing ---
setup
FLOCK_BUSY=1 run_update $'DATABASE_URL=x\n'
check "busy: no docker calls" "$([ ! -s "$tmp/docker.log" ] && echo 1 || echo 0)"
check "busy: exits 0" "$([ "$status" = 0 ] && echo 1 || echo 0)"
rm -rf "$tmp"

# --- a broken flock must not look like "busy": the update fails loudly instead of doing nothing ---
setup
FLOCK_BROKEN=1 run_update $'DATABASE_URL=x\n'
check "flock broken: exits non-zero" "$([ "$status" != 0 ] && echo 1 || echo 0)"
check "flock broken: no docker calls" "$([ ! -s "$tmp/docker.log" ] && echo 1 || echo 0)"
rm -rf "$tmp"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
