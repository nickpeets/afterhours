# The crew's rehearsal faces — sources and licence

**INTERNAL REHEARSAL ONLY.**  These clips are stock footage of real people.
They exist so one person can rehearse a look on a moving face before a show
(`tools/crew/crew --faces`).  They are never to appear in the Snap demo
videos, the Camera Kit review submission, screenshots, a public show's lobby,
marketing, or anywhere else public.  Anything public uses the crew's name
cards (the default camera) or Nick himself.

The clips are **not in this repository** and must not be added to it.
`fetch.sh` downloads and encodes them into `/workspaces/rehearsal/faces`
(`CREW_FACES` moves it) and writes `SHA256SUMS` there; `fetch.sh --check`
verifies them.  What is committed is this file and `fetch.sh`: the ids, the
URLs they resolve to, the trim and encode, and how the checksums are made.

## Licence

All six are from [Pexels](https://www.pexels.com) under the
[Pexels License](https://www.pexels.com/license/): free to use, no
attribution required, modification allowed.  Attribution is given anyway —
each creator's Pexels page is the clip page's author link; `fetch.sh`
prints the exact rendition URL it downloaded.  The licence forbids
portraying identifiable people in a bad light or in a way they would find
offensive, and selling unaltered copies; our use is a private rehearsal
camera and nothing leaves the Codespace.

## The clips

| Bot | Pexels id | Clip page | Loop |
|---|---|---|---|
| Dex | 7261920 | https://www.pexels.com/video/7261920/ | `dex.webm` |
| Marco | 8724452 | https://www.pexels.com/video/8724452/ | `marco.webm` |
| Leo | 7231255 | https://www.pexels.com/video/7231255/ | `leo.webm` |
| Crowd A | 6965116 | https://www.pexels.com/video/6965116/ | `crowd-a.webm` |
| Crowd B | 8724213 | https://www.pexels.com/video/8724213/ | `crowd-b.webm` |
| Crowd C | 6962123 | https://www.pexels.com/video/6962123/ | `crowd-c.webm` |

Each loop: seconds 1–11 of the source, scaled to cover and cropped to
480×640 portrait, 24 fps, VP9 in WebM, no audio, constrained to ≤ 2 MB
(`fetch.sh` raises the CRF until it fits).  The credit line for each clip
(the creator's name as Pexels shows it) belongs in the table above once
`fetch.sh` has run and the pages have been read; the ids and URLs are the
durable record.

## Checksums

`SHA256SUMS` lives beside the clips, not here: it is rewritten on every
encode and the clips themselves are not versioned.  `fetch.sh --check`
reads it.
