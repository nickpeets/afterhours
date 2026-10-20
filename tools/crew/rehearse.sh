#!/usr/bin/env bash
# tools/crew/rehearse.sh — one command for a recorded rehearsal show.
#
#   Nick goes live on his phone (the only live room), then in the Codespace:
#       bash tools/crew/rehearse.sh            # the looks scenario, recorded
#       bash tools/crew/rehearse.sh --check    # sign-in preflight only
#       SCENARIO=combos bash tools/crew/rehearse.sh
#
# Replaces the 25-line terminal paste (10/20: bracketed paste + the
# Codespace's rvm prompt hook mangled it — preflight read REFUSED for five
# signed-in bots, ffmpeg got SIGTTIN from the terminal and never wrote a
# frame).  Everything here is what that block meant to do:
#   - the five bots on CREW_EMAIL_* + the CREW_PASSWORD secret (Crowd C sits out)
#   - fresh profiles under /workspaces/rehearsal/no-profiles, so the secrets win
#   - Xvfb :99, CREW_HEADED=1 when crew.js supports it
#   - a sign-in preflight (--check) that bails before the show if Dex or
#     both crowd bots are refused
#   - ffmpeg x11grab, detached from the terminal (-nostdin, </dev/null)
#   - the crew log teed to /tmp/crew-show.log and printed at the end
# Never run with `set -u` in an rvm shell.  Exits non-zero on a bail.
set -o pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$HERE" || exit 2
SCENARIO="${SCENARIO:-looks}"
ONLY="${ONLY:-dex,marco,leo,crowd-a,crowd-b}"
REH=/workspaces/rehearsal
mkdir -p "$REH/logs" "$REH/rec"

echo "== repo $HERE @ $(git rev-parse --short HEAD 2>/dev/null) $(grep -o 'build b[0-9.]*' index.html | head -1)"

# --- bots
export CREW_EMAIL_DEX="${CREW_EMAIL_DEX:-asdf+agenta@asdf.com}"
export CREW_EMAIL_MARCO="${CREW_EMAIL_MARCO:-asdf+agentb@asdf.com}"
export CREW_EMAIL_LEO="${CREW_EMAIL_LEO:-asdf+agentc@asdf.com}"
export CREW_EMAIL_CROWD_A="${CREW_EMAIL_CROWD_A:-asdf+agentd@asdf.com}"
export CREW_EMAIL_CROWD_B="${CREW_EMAIL_CROWD_B:-asdf+agente@asdf.com}"
export CREW_PROFILES="${CREW_PROFILES:-$REH/no-profiles}"
mkdir -p "$CREW_PROFILES"
if [ -z "${CREW_PASSWORD:-}" ]; then echo "== CREW_PASSWORD secret is not set — stop"; exit 3; fi

# --- display
if ! pgrep -f 'Xvfb :99' >/dev/null; then
  Xvfb :99 -screen 0 1280x900x24 >"$REH/logs/xvfb.log" 2>&1 </dev/null &
  sleep 1
fi
export DISPLAY=:99 CREW_HEADED=1
if grep -q CREW_HEADED tools/crew/crew.js; then echo "== headed bots: yes (the recording shows them)";
else echo "== headed bots: no (crew.js predates CREW_HEADED) — the recording will be a blank desktop; watch on your phone"; fi

# --- faces
if ! tools/crew/faces/fetch.sh --check; then echo "== faces missing/mismatch — bots wear name cards (tools/crew/faces/fetch.sh to fetch)"; fi

# --- preflight: every bot signs in and stops
PRE="$REH/logs/preflight.log"
tools/crew/crew --check --only "$ONLY" 2>&1 | tee "$PRE"
ok(){ grep -q "^  $1 signed in" "$PRE"; }
for b in Dex Marco Leo "Crowd A" "Crowd B"; do if ok "$b"; then echo "PREFLIGHT $b: OK"; else echo "PREFLIGHT $b: REFUSED"; fi; done
if ! ok Dex; then echo "== Dex refused — not starting"; exit 4; fi
if ! ok "Crowd A" && ! ok "Crowd B"; then echo "== both crowd bots refused — not starting"; exit 4; fi
[ "${1:-}" = "--check" ] && exit 0

# --- recorder (video only), detached from the terminal
TS="$(date +%m%d.%H%M)"; OUT="$REH/rec/show-$TS.mp4"; REC=""
if command -v ffmpeg >/dev/null; then
  ffmpeg -nostdin -v error -y -f x11grab -framerate 15 -video_size 1280x900 -i :99 -an \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p "$OUT" >"$REH/logs/rec-$TS.log" 2>&1 </dev/null &
  REC=$!
  echo "== recording → $OUT (pid $REC)"
else
  echo "== no ffmpeg — not recording; the show still runs"
fi

# --- the show
tools/crew/crew --scenario "$SCENARIO" --faces --camkit --snap-terms agree --only "$ONLY" 2>&1 </dev/null | tee /tmp/crew-show.log
RC=${PIPESTATUS[0]}

if [ -n "$REC" ]; then kill -INT "$REC" 2>/dev/null; wait "$REC" 2>/dev/null; ls -l "$OUT" 2>/dev/null || echo "== no recording written (see $REH/logs/rec-$TS.log)"; fi
echo
echo "================ /tmp/crew-show.log (paste this back) ================"
cat /tmp/crew-show.log
exit "$RC"
