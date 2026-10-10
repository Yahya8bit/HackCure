#!/usr/bin/env bash
# Disk usage REPORT (F5). Read-only: this script never deletes anything.
# It prints usage and cautious suggestions for a human to review and run by hand, one at a time.
set -uo pipefail
cd "$(dirname "$0")/.."
line() { printf '\n== %s ==\n' "$1"; }

line "Free space"
df -h / "$HOME" 2>/dev/null | awk 'NR==1 || !seen[$0]++'
avail_kb=$(df -Pk / | awk 'NR==2 {print $4}')
avail_gb=$(awk "BEGIN {printf \"%.1f\", $avail_kb/1048576}")
echo "Available on /: ${avail_gb} GB"
if [ "$avail_kb" -lt 1048576 ]; then echo "STATUS: CRITICAL (< 1 GB). A rebuild or the clean-clone check may fail."
elif [ "$avail_kb" -lt 2097152 ]; then echo "STATUS: LOW (< 2 GB). scripts/verify_clean_clone.sh will refuse to build."
else echo "STATUS: OK"; fi

line "Docker (docker system df)"
docker system df 2>/dev/null || echo "docker not available"

line "This project's images"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}' 2>/dev/null \
  | grep -E '^(nawba-|epilipsy-)' || echo "(none)"

line "Dangling (untagged) images — candidates, check each before removing"
docker images -f dangling=true --format '{{.ID}}\t{{.CreatedSince}}\t{{.Size}}' 2>/dev/null | head -20
echo "(count: $(docker images -f dangling=true -q 2>/dev/null | wc -l))"

line "This repository"
du -sh . 2>/dev/null
du -sh docs/ui frontend/node_modules frontend/dist backend/ai/models 2>/dev/null

line "Largest folders in \$HOME (top 12, may take a moment)"
du -xsh "$HOME"/* "$HOME"/.[!.]* 2>/dev/null | sort -h | tail -12

line "Suggestions (NOT executed — review each one first)"
cat <<'EOF'
Safe-ish, project-scoped:
  - Remove one dangling image you recognise as an old Nawba build:   docker image rm <IMAGE_ID>
  - Old Nawba image tags no longer used by docker-compose.yml (epilipsy-api, epilipsy-web):
        docker image rm epilipsy-api epilipsy-web        (only if nawba-api:local / nawba-web:local exist)
  - Build cache only (images and volumes untouched):                 docker builder prune
  - Package caches (re-downloadable):                                npm cache clean --force ; rm -r ~/.cache/pip
Do NOT use (they also delete other projects' data or images the demo needs offline):
  - docker image prune -a      - docker volume prune      - docker system prune -a --volumes
After ANY cleanup, confirm the demo still starts with the network disabled:
  turn Wi-Fi off, then:  docker compose up -d --wait --no-build && scripts/demo_check.sh
EOF
