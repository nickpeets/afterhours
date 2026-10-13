# The rehearsal crew

Six bots that join a live show so one person can rehearse a whole show from a
phone. Each bot is a real client: it runs index.html from the site, uses its own
account, and wears a fake camera that shows a colored card with its name.

| Bot | Plays | Card |
|---|---|---|
| Dex, Marco, Leo | the men: take bench seats on their own, sit when seated, "answer" by sitting through the clock | red, blue, green |
| Crowd A, B, C | the crowd: do what the host orders in chat | purple, orange, slate |

Bots do everything through the app's own code (the bench button, the heart
insert, `throwAt`). The server's rules apply to them exactly as they do to a
person, and every refusal comes back in chat in the server's own words.

## Accounts: the 10/9 rehearsal's profiles

No password is typed for a run, and none goes in chat, the repo, the command
line or the log. Each bot runs in a Chromium profile that already holds a
signed-in session, the same way the 10/9 rehearsal did. The profiles live
outside the repo in the Codespace at `/workspaces/rehearsal` (set
`CREW_PROFILES` to move them):

| Bot | Profile |
|---|---|
| Dex, Marco, Leo | `profile-a`, `profile-b`, `profile-c` |
| Crowd A | `profile-crowd` |
| Crowd B | `profile-host` (sits out if that account is the one hosting) |
| Crowd C | `profile-crowd-c` (new) |

Each run renames the accounts to the bots' names and sets a profile that can
bench: zip `CREW_ZIP` (default 97201), 18+, the men as men, and "here for"
everyone.

A bot whose profile is missing or whose session has lapsed sits out, and the
crew says so. To sign one in, start the rehearsal desktop (noVNC on port
6080), then run `tools/crew/crew --login "Crowd C"`. A browser opens on that
desktop and Nick signs in there by hand. The crew sees the session, names
the account, and closes the browser.

Fallback, only for a bot with no profile: the Codespace secrets
`CREW_PASSWORD` and `CREW_EMAIL_PATTERN` (an email with `{name}` in it,
filled with `dex`, `marco`, `leo`, `crowd-a`, `crowd-b` or `crowd-c`), or
`CREW_EMAIL_<KEY>`/`CREW_PASSWORD_<KEY>` for one bot.

`tools/crew/crew --check` signs every bot in, names it, and stops.

## Starting a crew show

1. On your phone, GO LIVE.
2. In the Codespace, run `tools/crew/crew --host <your display name>`. If yours
   is the only live room, `tools/crew/crew` is enough. `--room <id>` also works,
   and accepts any text that contains the room's id.
3. The crew says hello in chat. The men go to the bench (each one's headshot is
   his card). Seat them yourself, or let the show seat them.
4. Give orders in chat. Only your lines that start with `crew:` count:

| Order | What happens |
|---|---|
| `crew: jeer Dex` | a crowd bot throws a tomato (add `pie`, `boo` or `cricket`, or `from B`) |
| `crew: rose Dex` | rose petals: a cheer that mends a crack |
| `crew: cheer Dex` | confetti (or `sparkle`, `hearts`, `petals`) |
| `crew: hearts Dex 3` | three heart taps, spread over the crowd bots |
| `crew: ovation Dex` | all three crowd bots cheer him within 2s |
| `crew: booed Dex` | all three crowd bots jeer him within 2s |
| `crew: leave Marco` | Marco leaves his chair or the bench, and stays off it |
| `crew: bench Leo` | Leo takes a bench seat |
| `crew: status` | every bot says where it is, in one line |
| `crew: help` | the list of orders |
| `crew: done` | every bot leaves and the crew stops |

Single throws rotate A → B → C, so each bot's rations (5 cheers, 2 jeers)
last. A refusal (cooldown, the crown, rations, one throw at a time) is echoed
as `refused: <the server's words>`.

The crew stops on `crew: done`, when the room ends, or on Ctrl-C. Every bot
leaves the room and closes. The crew then confirms that no room hosted by a
crew account is live. Your own show stays up until you end it.

## Scenario: the crown

`tools/crew/crew --host <name> --scenario crown`

1. The three men take bench seats. Seat them, or let the show seat them.
2. Once all three sit, the crowd gives Dex 6 hearts and Marco 1.
3. You ask each man, then make your call. The crown goes to the heart leader.
4. When the crown lands, the crew says who wears it and suggests
   `crew: jeer <him>` to watch the crown refuse it.

Orders work the whole time. After the scenario, the crew keeps taking orders
until `crew: done`.

## Notes

- Seven people on video (you plus six bots) count toward Daily usage for as
  long as the show runs.
- `--site <url>` points the crew at another copy of the app (default
  https://lastcall.love/).
- Battery gate 90 (`crew-smoke`) runs the crew against the harness: bots sign
  in through the test double, never with a password.
