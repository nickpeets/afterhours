# LAST CALL — Fun & Money

**The ruling (Nick, 10/20–10/21).** Last Call is also a subscription app, like
the big dating apps.  The subscription and the chip-tier model coexist, and
they never buy the same thing: **a subscription buys convenience and status;
a tier is earned, only; ✦ buys cosmetics à la carte.**  No prices yet.
Billing (Stripe) comes in a later PR once Nick sets prices; this document is
the model, and `feat/subscription-scaffold` is the entitlement layer under it.

---

## The three currencies, and what each one can and cannot buy

| | what it is | how you get it | what it buys | what it never buys |
|---|---|---|---|---|
| **Subscription** | convenience and status | money (later: Stripe), or a comp from Nick | the perks below | a tier, a chip, a heart, the host's choice |
| **Tiers** | rank, earned | chips → leaderboard → the right to wear flex looks | the right to wear what the tier unlocks | nothing is sold here — money never skips a tier; subscribers climb the same ladder |
| **✦** | the wallet (à la carte) | the wallet you already have | cosmetic looks, one at a time, for non-subscribers | chips, hearts, a seat, a say in the show |

### Subscription = convenience and status

While subscribed (or comped), a member gets:

- **a bigger throwables ration** — ×2 the base (scaffold value: 10 cheers and
  4 jeers a show, against the crowd's 5 and 2).  The server is the referee:
  `throw_limits()` doubles the two numbers for a subscriber caller and the
  rest of the throw pipeline reads the ration from it, as it always has.
- **every cosmetic pack included** — a look from tonight's pack, any pack,
  never costs a subscriber anything.  (Today every pack is free for everyone
  by ruling — Halloween, then Holidays — so this perk has nothing to unlock
  yet.  It is wired so that the day a pack carries a price, a subscriber
  never sees it.)
- **open any profile in full** — the gallery, the details and the prompts
  behind the public face of a profile card.  `is_subscriber(uid)` is the one
  hook the profile card (PR C, `feat/profiles-tinder`) calls for this; PR C
  also carries the soft-launch override `profiles_open_to_all`, which opens
  everything to everyone until Nick flips it.
- **priority bench line** — a subscriber who ♥s onto the bench stands ahead
  of the non-subscribers already waiting (subscribers keep their order among
  themselves).  *Scaffold state: the perk is defined and the client reports
  it; the line's server order is untouched until a read of production's
  `join_line` / `engine_award_seat` (no md5 on record) — see the PR body.*
- **no "coming soon" locks** — the Shop tab's greyed tiles and the lobby's
  VIP pill read as coming for everyone else; for a subscriber there is
  nothing locked.
- **a subscriber badge on the tile** — the contestant card (PR C) shows it
  with the show stats.  The tile itself stays as it is until PR C draws the
  card.

A subscription is **status, not power**: it changes nothing about who gets
a chair, who she keeps, what a throw does when it lands, or how many hearts
anyone earns.

### Tiers = earned only

Chips are earned by playing.  Chips put you on the leaderboard.  The
leaderboard unlocks the right to wear flex looks.  That ladder has no door
for money on it: a subscriber still climbs it rung by rung, and ✦ never buys
a chip.

### ✦ = à la carte, for non-subscribers

A non-subscriber may buy a cosmetic look with ✦, one look at a time.
Cosmetic means cosmetic: a disguise, a frame, a pack look — never a
gameplay look.

---

## Hard rules (unchanged by any of this)

1. **✦ never buys chips.**
2. **Money never touches the host's choice.**  Nothing paid is visible to her
   decision, weighted in it, or shown to her as a reason.
3. **A paid look never blocks jeers or adds hearts.**  Throwables land on
   every chair the same way; hearts are the crowd's alone.
4. **Gameplay looks are never sold.**  The Crown, the Mystery Mask and the
   Fuse are earned in the show or not worn at all — not for ✦, not for a
   subscription, not for a tier.
5. The looks rules stand: one pick per show, the look drops on ASK, the
   Moment strips everything, the host can force any look off, looks never
   touch throwables, cracks or the crown.

---

## The scaffold (what `feat/subscription-scaffold` builds)

**Schema** (`tools/DDL-subscription.sql`, handed to Nick, never run by an
agent):

- `profiles.subscription` — `'none' | 'active' | 'comped'`, default `'none'`.
- `profiles.subscription_until timestamptz null` — when it lapses; `null`
  means no lapse date.
- Both are **server-side only**: a signed-in client reads them (its own, and
  everyone's — the badge needs that) and can never write them.  The
  `profiles_subscription_guard` trigger refuses any API-role write to either
  column, whatever the row's RLS policy says, exactly as the throw columns
  are guarded on `room_members`.
- `subscription_state(uid)` → `'none' | 'active' | 'comped'`: an expired
  `subscription_until` reads as `'none'`.
- **`is_subscriber(uid)`** → boolean — THE ONE HOOK.  `subscription_state(uid)
  <> 'none'`.  Every perk check, server and client, goes through it.
- `comp_subscription(uid, until)` — Studio-only (revoked from every API
  role): Nick comps crew and hosts.  `until` in the past ends a comp; `null`
  is open-ended.
- `subscriptions_status` — a Studio-only view: who is subscribed, how, until
  when, and what `subscription_state` says right now.
- `throw_limits()` is renamed `throw_limits_base()` (its body untouched) and
  a new `throw_limits()` wraps it: the base numbers, with `cheers` and
  `jeers` doubled when `is_subscriber(auth.uid())`.  `throw_at`,
  `throw_counts` and the member trigger keep calling `throw_limits()` by
  name and see the right ration for the caller; nothing else in them moves.

**Client**

- `lcSubscriber()` — my own standing, read once at boot and at every
  `openRoom` through the `is_subscriber` RPC (never computed on the phone
  from the row — the server's clock decides an expiry).
- `lcPerks()` — the four perks as booleans from that one answer:
  `{ ration2x, packs, profileFull, benchPriority }`, plus `subscriber`.
  Everything that is not a perk yet (pricing, the shop, billing) stays
  exactly as it was: there is no pricing copy anywhere in the UI.
- The lobby carries one **"VIP · coming soon"** pill (a subscriber's reads
  "VIP").  That is the only visible trace until billing exists.

**Not built here:** prices, Stripe, the shop, the profile card, the badge on
the tile, the line's server order.  Each has its PR.
