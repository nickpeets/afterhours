#!/usr/bin/env bash
# fetch.sh — the crew's rehearsal faces (feat/crew-faces).
#
# Downloads one Pexels clip per bot, trims it to a ~10s loop, encodes it at
# 480×640 VP9/WebM (≤ 2 MB, no audio) and records its sha256.  The clips
# land OUTSIDE the repo, in /workspaces/rehearsal/faces (CREW_FACES moves
# it), and are never committed: this script and LICENSES.md are the whole
# record of what they are and where they came from.
#
#   INTERNAL REHEARSAL ONLY.  These faces are stock footage of real people,
#   used so a look can be rehearsed on a moving face.  Never use them in the
#   Snap demo videos, the Camera Kit review submission, screenshots or
#   anything public.  Public material uses the crew's name cards, or Nick.
#
#   tools/crew/faces/fetch.sh            fetch, encode and checksum all six
#   tools/crew/faces/fetch.sh dex leo    just those bots
#   tools/crew/faces/fetch.sh --check    verify the sha256s on disk, no network
#
# Source selection: Pexels' download endpoint (https://www.pexels.com/
# download/video/<id>/) redirects to the largest rendition (UHD, often
# 100 MB+).  The clip page lists every rendition; we take the smallest one
# at least 640 px tall when the page can be read, and fall back to the
# download redirect when it can't.  With PEXELS_API_KEY set, the API is
# asked instead (https://api.pexels.com/videos/videos/<id>), which is the
# documented route.  The originals are kept in faces/src for a re-encode.
set -euo pipefail

OUT="${CREW_FACES:-/workspaces/rehearsal/faces}"
SRC="$OUT/src"
SECS="${CREW_FACE_SECS:-10}"
START="${CREW_FACE_START:-1}"          # skip the first second (fade-ins, slates)
LIMIT=$((2 * 1024 * 1024))

# bot slug → Pexels video id.  Mirrors CAST in ../cast.js (pexels:).
declare -A IDS=(
  [dex]=7261920 [marco]=8724452 [leo]=7231255
  [crowd-a]=6965116 [crowd-b]=8724213 [crowd-c]=6962123
)
ORDER=(dex marco leo crowd-a crowd-b crowd-c)

need() { command -v "$1" >/dev/null 2>&1 || { echo "fetch.sh: needs $1" >&2; exit 3; }; }
need curl; need ffmpeg; need ffprobe; need sha256sum

check_only=0; want=()
for a in "$@"; do
  case "$a" in
    --check) check_only=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) want+=("$a") ;;
  esac
done
[ ${#want[@]} -eq 0 ] && want=("${ORDER[@]}")

mkdir -p "$OUT" "$SRC"
SUMS="$OUT/SHA256SUMS"

if [ "$check_only" = 1 ]; then
  [ -f "$SUMS" ] || { echo "no $SUMS yet — run fetch.sh first" >&2; exit 1; }
  (cd "$OUT" && sha256sum -c SHA256SUMS)
  exit $?
fi

# the smallest rendition at least 640 px tall, from the clip page (or the API)
rendition_url() {
  local id="$1" page urls
  if [ -n "${PEXELS_API_KEY:-}" ]; then
    curl -fsSL -H "Authorization: $PEXELS_API_KEY" "https://api.pexels.com/videos/videos/$id" \
      | tr ',' '\n' | grep -o '"link":"[^"]*"' | sed 's/"link":"//; s/"$//' | grep -E '_[0-9]+_[0-9]+_[0-9]+fps\.mp4' | sort_by_height | head -1
    return
  fi
  page="$(curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64) lastcall-crew/1.0" "https://www.pexels.com/video/$id/" 2>/dev/null || true)"
  urls="$(printf '%s' "$page" | grep -oE "https://videos\.pexels\.com/video-files/$id/$id-[a-z]+_[0-9]+_[0-9]+_[0-9]+fps\.mp4" | sort -u || true)"
  if [ -n "$urls" ]; then printf '%s\n' "$urls" | sort_by_height | head -1; return; fi
  # fall back: the download redirect (largest rendition)
  curl -fsSIL -o /dev/null -w '%{url_effective}\n' "https://www.pexels.com/download/video/$id/"
}
# pick the smallest rendition whose shorter side is ≥ 640 (portrait clips put
# the height second; landscape the width — min of the two is the height we
# get after a cover crop to 480×640 only if ≥ 640, so sort by min(w,h))
sort_by_height() {
  awk '{
    n = split($0, p, "_"); w = p[n-2]; h = p[n-1];
    m = (w < h) ? w : h;                     # the shorter side
    printf "%s %d %s\n", (m >= 640 ? 0 : 1), m, $0
  }' | sort -k1,1n -k2,2n | awk '{ print $3 }'
}

encode() {
  local who="$1" src="$2" dst="$OUT/$who.webm" tmp="$OUT/$who.tmp.webm"
  # 480×640 portrait: scale to cover, crop about the centre; VP9 two-pass-ish
  # constrained CRF; no audio (the bot's mic is its own silent track)
  local crf=34
  while :; do
    ffmpeg -v error -y -ss "$START" -t "$SECS" -i "$src" -an \
      -vf "scale=w='if(gt(iw/ih,480/640),-2,480)':h='if(gt(iw/ih,480/640),640,-2)',crop=480:640,fps=24,format=yuv420p" \
      -c:v libvpx-vp9 -b:v 0 -crf "$crf" -row-mt 1 -deadline good -cpu-used 2 -g 48 "$tmp"
    local size; size=$(stat -c %s "$tmp")
    if [ "$size" -le "$LIMIT" ] || [ "$crf" -ge 50 ]; then break; fi
    crf=$((crf + 4)); echo "  $who: $size bytes > 2 MB, re-encoding at crf $crf"
  done
  mv "$tmp" "$dst"
  echo "  $who: $(stat -c %s "$dst") bytes, $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dst")s"
}

touch "$SUMS"
for who in "${want[@]}"; do
  id="${IDS[$who]:-}"
  [ -n "$id" ] || { echo "fetch.sh: no bot called $who (${ORDER[*]})" >&2; exit 2; }
  src="$SRC/$who-$id.mp4"
  if [ ! -s "$src" ]; then
    url="$(rendition_url "$id")"
    [ -n "$url" ] || { echo "  $who: no rendition found for Pexels $id" >&2; exit 1; }
    echo "  $who: Pexels $id ← $url"
    curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64) lastcall-crew/1.0" -o "$src.part" "$url" && mv "$src.part" "$src"
    echo "  $who: source $(stat -c %s "$src") bytes, sha256 $(sha256sum "$src" | cut -c1-16)…"
  else
    echo "  $who: source already here ($src)"
  fi
  encode "$who" "$src"
  # one line per clip in SHA256SUMS, replaced on re-encode
  grep -v " $who.webm\$" "$SUMS" > "$SUMS.new" || true
  (cd "$OUT" && sha256sum "$who.webm") >> "$SUMS.new"
  mv "$SUMS.new" "$SUMS"
done
echo
echo "faces in $OUT:"
cat "$SUMS"
echo
echo "internal rehearsal only — never in the Snap demo videos or anything public (LICENSES.md)"
