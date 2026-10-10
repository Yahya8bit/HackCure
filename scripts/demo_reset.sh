#!/usr/bin/env bash
# Reset the Nawba demo to a known state (F3).
#
#   scripts/demo_reset.sh            asks for confirmation
#   scripts/demo_reset.sh --yes      no question (for a rehearsed demo)
#   scripts/demo_reset.sh --dry-run  only prints what it would do
#
# What it does, and nothing else:
#   1. stops THIS compose project's containers (docker compose down — no -v, no images removed)
#   2. deletes ONE volume: <project>_dbdata (this project's database)
#   3. starts the stack again; the api seeds the fixed-seed synthetic data + the named demo cast
# It never builds or pulls images (works offline) and never prunes anything.
set -euo pipefail
cd "$(dirname "$0")/.."

YES=0; DRY=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --dry-run) DRY=1 ;;
    *) echo "usage: $0 [--yes] [--dry-run]" >&2; exit 2 ;;
  esac
done

PROJECT="${COMPOSE_PROJECT_NAME:-$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')}"
VOLUME="${PROJECT}_dbdata"

echo "Project: $PROJECT"
echo "This will: stop the $PROJECT containers, DELETE the database volume '$VOLUME' (all demo entries),"
echo "and start the stack again with fresh synthetic data. Images and other volumes are not touched."
if [ "$DRY" = 1 ]; then
  echo "[dry-run] docker compose down"
  echo "[dry-run] docker volume rm $VOLUME"
  echo "[dry-run] docker compose up -d --wait --no-build"
  exit 0
fi
if [ "$YES" != 1 ]; then
  read -r -p "Type 'yes' to continue: " answer
  [ "$answer" = "yes" ] || { echo "Cancelled. Nothing was changed."; exit 1; }
fi

start=$(date +%s)
docker compose down
if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  docker volume rm "$VOLUME" >/dev/null
fi
docker compose up -d --wait --no-build
elapsed=$(( $(date +%s) - start ))

cat <<EOF

Demo reset done in ${elapsed}s.
  Patient / caregiver app : https://localhost:8443/
  Clinician dashboard     : https://localhost:8443/clinic
  Logins (password from .env DEMO_PASSWORD, demo default: demo1234)
    dr.demo         clinician (queue, Amine K. on top)
    caregiver.demo  logs for Amine K. (child, 8) and Sonia B. (34)
    patient.demo    Mariem S. (29, on valproate, pregnancy reported)
EOF
[ "$elapsed" -le 120 ] || echo "WARNING: reset took more than 2 minutes (${elapsed}s)."
