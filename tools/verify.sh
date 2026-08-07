#!/usr/bin/env bash
# verify.sh — Last Call battery v2.  Runs every gate in tools/gates against
# the repo's index.html, prints stamp + gate count + check count, exits
# nonzero on any failure.
#
#   tools/verify.sh                  run the full battery
#   tools/verify.sh --only=boot      run one gate
#   tools/verify.sh --update-golden  regenerate the golden regression baseline
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "[verify] installing harness deps (first run)…"
  npm install --no-fund --no-audit >/dev/null
fi
exec node lib/run.js "$@"
