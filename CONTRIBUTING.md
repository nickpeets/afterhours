# Working in this repo

## The battery is the contract

Every change ships with its gate, and `tools/verify.sh` must be green at
the tip of every branch before it is offered for merge.  A gate that
re-implements app logic is a failed gate: gates drive the real
`index.html` through `window.__lc`.  When a fix cures a bug the battery
failed to catch, the branch also names **what the harness faked** that let
the bug through, and closes that gap — otherwise the same class of bug
returns wearing a different hat.

If the battery cannot find a browser it says so once and exits 3 without
running anything; see `tools/README.md`.  An environment gap is never
reported as failing gates.

## Merging a stacked branch series

A stack (B built on A, C on B, …) is a **review** device, not a merge
device.  Every branch already contains the ones beneath it, so landing the
whole series is ONE merge: the **top** branch into `main`.  The lower PRs
then close as already-merged, and their commits enter `main` individually —
still one gate per commit, still bisectable.

**Do not merge bottom-up expecting the rest to follow.**  GitHub retargets
an open PR only when its base branch is **deleted**, not when the base is
merged.  Merging A into `main` leaves B still pointed at A, so the next
click merges B *into A*: the stack collapses downward into itself instead
of climbing into `main`.

This is not hypothetical.  Wave 8 was four stacked branches (#28–#31).
#28 landed in `main`; #29, #30 and #31 landed in their own bases.  `main`
carried one of the four gates, the Pages deploy went out a quarter done,
and recovery took a fifth PR (#32) merging the untouched top of the stack.
The stray merge commits were discarded; their PRs remain the record.

If you genuinely want one merge commit per branch in `main`'s history, the
only safe way is to delete each base branch **immediately** after merging
it, so the retarget fires before the next click.  That buys cosmetics and
costs a strict ordering requirement.  Prefer the single merge.

## Deploys

`main` is served by GitHub Pages.  `sw.js` is network-first with
`skipWaiting()` + `clients.claim()`, and re-requests HTML with
`cache: "no-cache"`, so a merge reaches browsers on the next navigation —
no hard reload needed.  The footer build stamp is the confirmation signal:
if it hasn't changed, the deploy hasn't landed.

## A note on the origin

`nickpeets.github.io` is a **single origin** shared by every GitHub Pages
project on the account — `localStorage`, Cache Storage and service worker
registrations are scoped to the origin, not the path.  Any app on that host
can read any other app's stored auth tokens.  Today the apps use different
Supabase projects, which is luck rather than protection.  The only real
remedy is a separate origin per app (a subdomain or custom domain); nothing
inside this repo can defend against it.
