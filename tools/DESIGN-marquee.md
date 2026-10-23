# The Marquee — scheduled shows, RSVP, the countdown (PR D2 of the lobby refresh)

**Branch** `feat/marquee` · ruling Nick 10/21–22: a lobby that is never
dead.  D1 gave people something to do between shows; D2 gives them a
reason to come back at a time: hosts schedule shows, the lobby's top is
the next one with a countdown and an RSVP, and the scheduled card becomes
the live card the moment she goes live.

STATUS: client in this PR; `tools/DDL-marquee.sql` **NOT RUN** — Nick
runs it in Studio (three pastes), then records the read-back below.

## What it is
- **Schedule a show** (button under GO LIVE): title (≤40), a time 10 min
  to 30 days out; one scheduled show per host at a time; the host is
  going by default.  Her button then reads *Your show: Tonight 8:00 PM*.
- **The NEXT SHOW card** on top of the lobby: title, host face (tap → her
  card), *with Marla · Tonight 8:00 PM*, a live countdown (every 30 s),
  *N going*, **I'm going / ✓ Going** (the host sees Cancel).  Up to three
  more upcoming shows as a strip under it.
- **GO LIVE links the show**: when the host opens a room within two hours
  of her slot, `show_went_live` sets the show live with the room id; the
  card flips to **LIVE NOW · Watch now**, which opens that room.  A linked
  room that has ended reads *done* and leaves the Marquee.
- Realtime on `shows` / `rsvps` keeps every lobby current.
- Blocks honoured: a blocked host's show is not on my Marquee.

## Not in this PR (D2b)
- **Reminders** an hour before (email via Resend, push later) — needs
  pg_cron + an edge function with the Resend key; neither exists for this
  yet.  The RSVP rows are the list to mail.
- Featuring (VIP / approved hosts pinned to the top).
- A show page / share link for a scheduled show.

## The server (`tools/DDL-marquee.sql`)
`shows` (host_id, title, starts_at, status scheduled|live|done|cancelled,
room_id), `rsvps`; `schedule_show`, `cancel_show`, `rsvp`,
`show_went_live`, `upcoming_shows` (next 14 days + anything live, host as
`public_profile`, going count, my RSVP, the room's status for the lazy
*done*).  Guards: `lc_config` 8ae9e8a3…, `public_profile` 239070f7…,
`deck_next` fb39c820….

## Gate 100 `marquee` (29 checks)
DDL shape · schedule (refusals: 5 min out, a second show) · the card's
copy, countdown = the page's own `fmtCountdown`, face → host card · RSVP
both ways with the count, realtime to the host · GO LIVE through the real
path links the show, LIVE NOW + Watch now opens the room · an ended room
reads done and the Marquee hides · cancel · zero console errors.

## Judgment calls
- **Anyone can schedule** (Nick's default stands unless he gates it);
  featuring is D2b.
- The ±2h link window: a host going live far from her slot gets an
  ordinary room, her scheduled show stays scheduled.
- Lazy *done*: no cron; `upcoming_shows` reads the linked room's status.
- The Marquee sits **above** GO LIVE: the next show is everyone's; GO
  LIVE is the host's door.

## Run log
_(Nick's read-back goes here.)_
