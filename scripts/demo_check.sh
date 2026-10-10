#!/usr/bin/env bash
# Pre-demo smoke test (F4) against the RUNNING stack. Exits non-zero on any failure.
#   scripts/demo_check.sh                      # https://localhost:8443
#   scripts/demo_check.sh https://localhost:9443
# Checks: three role logins, offline seizure (3 taps) then sync, alert on the dashboard with a
# French reason, Validate in 3 steps, audit chain, no external requests.
# It writes only to the check patient P-D3A005 (account check.demo), never to the demo cast.
# Needs: node + frontend/node_modules (npm install once) and Chrome (CHROME=/path to override).
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-https://localhost:8443}"

command -v node >/dev/null || { echo "FAIL: node is not installed"; exit 1; }
[ -d frontend/node_modules/puppeteer-core ] || { echo "FAIL: run 'npm install' in frontend/ first"; exit 1; }
[ -x "${CHROME:-/usr/bin/google-chrome}" ] || { echo "FAIL: Chrome not found (set CHROME=/path/to/chrome)"; exit 1; }
curl -sk -o /dev/null --max-time 5 "$BASE/" || { echo "FAIL: $BASE is not reachable (is the stack up?)"; exit 1; }

cd frontend
NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_NO_WARNINGS=1 node e2e/demo_check.mjs "$BASE"
