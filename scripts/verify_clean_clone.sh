#!/usr/bin/env bash
# Clean-clone verification (F7): does a fresh `git clone` build, start and pass the smoke test?
#
#   scripts/verify_clean_clone.sh
#
# 1. checks free disk space first: < 2 GB free -> stops and reports, builds nothing
# 2. clones this repository (committed state, HEAD) into a temporary directory
# 3. builds and starts it under its OWN compose project name (nawba_clone) on other ports
#    (9443/9080), with the database in tmpfs, so the demo stack on 8443 is not touched
# 4. runs scripts/demo_check.sh against it
# 5. removes only what it created: the nawba_clone containers/network, its images, the temp dir
#
# Offline: the clone is local (git clone of this folder) and the build uses the base images and
# layer cache already on this machine (no --pull). npm/pip installs inside the build need either the
# Docker cache or internet; on a machine that never built Nawba, run it once online.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=nawba_clone
NEED_KB=$((2 * 1024 * 1024))

avail_kb=$(df -Pk "${TMPDIR:-/tmp}" | awk 'NR==2 {print $4}')
avail_root_kb=$(df -Pk / | awk 'NR==2 {print $4}')
[ "$avail_root_kb" -lt "$avail_kb" ] && avail_kb=$avail_root_kb   # Docker writes to / as well
if [ "$avail_kb" -lt "$NEED_KB" ]; then
  echo "STOP: only $(awk "BEGIN {printf \"%.2f\", $avail_kb/1048576}") GB free; this check needs at least 2 GB"
  echo "(two images are built). Nothing was built or changed. Free space first (scripts/disk_report.sh)"
  echo "or run this on a second machine."
  exit 3
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/nawba-clone.XXXXXX")"
cleanup() {
  echo "Cleaning up only what this script created..."
  (cd "$TMP/repo" 2>/dev/null && docker compose -p "$PROJECT" -f docker-compose.yml -f scripts/check.override.yml \
     -f "$TMP/images.override.yml" down 2>/dev/null) || true
  # only the two images this script built; never --rmi all (that would also remove the shared postgres image)
  docker image rm "$PROJECT-api:check" "$PROJECT-web:check" >/dev/null 2>&1 || true
  rm -rf -- "$TMP"
}
trap cleanup EXIT

git clone --quiet "$REPO" "$TMP/repo"
cd "$TMP/repo"
cp .env.example .env
# Own image names so the demo's nawba-api:local / nawba-web:local are not overwritten.
cat > "$TMP/images.override.yml" <<EOF
services:
  api: {image: "$PROJECT-api:check"}
  web: {image: "$PROJECT-web:check", volumes: !reset []}
EOF
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.yml -f scripts/check.override.yml -f "$TMP/images.override.yml")

start=$(date +%s)
"${COMPOSE[@]}" build 2>&1 | tail -3   # no --pull: uses base images already on this machine
"${COMPOSE[@]}" up -d --wait --no-build
echo "Clean clone built and started in $(( $(date +%s) - start ))s."

# The smoke test needs the frontend's node_modules (puppeteer-core); reuse the ones of this checkout.
ln -s "$REPO/frontend/node_modules" frontend/node_modules
scripts/demo_check.sh https://localhost:9443
echo "CLEAN CLONE VERIFIED"
