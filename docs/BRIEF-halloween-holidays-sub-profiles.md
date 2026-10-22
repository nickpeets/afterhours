# BRIEF: Halloween now → Holidays pack, subscription scaffold, Tinder-style profiles

## 0. Location (do this without asking)
Open the **didactic guide** Codespace and run `git fetch origin`. Cut every branch off fresh `origin/main`, worktree if the checkout is dirty. **First commit this file as `docs/BRIEF-halloween-holidays-sub-profiles.md` on your branch** so no session loses it again.

**Status 10/21 17:30 PT — who builds what:**
- **PR A (packs): DONE.** #123 merged, DDL ran in production, #124 logs the run.
- **PR B (subscription scaffold): THE AGENT builds this.** Branch `feat/subscription-scaffold` off fresh `origin/main`.
- **PR C (profiles): the planning session (Claude in chat) is building this directly** on `feat/profiles-tinder`. Do NOT build PR C. Don't touch `profiles` columns, the `profile-photos` bucket, `user_blocks`, `lc_settings`, `public_profile`, `my_blocks`, or gate 97 — those are PR C's. PR B must leave `is_subscriber(uid)` as the one hook PR C calls for the full-profile perk.

Stamp-bump rule and the full verification battery apply to each PR. Every production DDL stops for Nick: Studio-safe (ONE level of `$$`, strings via `format()`/`quote_literal()`/`string_agg()`), never guard on a column the same file overwrites, handed over as three copy-paste blocks (preflight as one SELECT, the begin…commit block, read-back as one SELECT). Current guard values: `lc_config` 18c19ce96c662a68bc82e327a14f5df4 · `lc_tonight_pack` 00ed780667ebed70cab458368bc616c1 · `lc_pack_status` 51d7be429e260c1ad5ff92fd25704165 · `set_filter` 88c4017d9db2fc1dd69cf877729e4c41 / 1569. **PR C will replace `lc_config()`** (adds `profiles_open_to_all`); PR B must not also replace it — read the flag through `lc_settings` if needed, or wait for C's new md5.

## Nick's rulings (10/20–10/21)
1. The **Halloween pack is on now for everyone**, no tier or chip gate, **through Oct 31 PT.** On Nov 1 PT it vaults and the **Holidays pack** takes over.
2. **Last Call is also a subscription app**, like the big dating apps. Subscription and the chip-tier model coexist (split below). No prices yet.
3. **Profiles get filled out like Tinder.**

## PR A — `feat/packs-halloween-now-holidays`
- `lc_tonight_pack`: Halloween effective immediately, ends `2026-11-01 00:00 America/Los_Angeles`. Guarded SQL, hand to Nick, do not run.
- Add a **Holidays pack** scheduled `2026-11-01` → `2027-01-02 00:00 PT`, switching itself on the same way the Halloween pack did. Nick decides nothing here; use the pack rotation already built in PR #112.
- Holidays pack content, same two layers as Halloween:
  - **No-face-tracking fallbacks (ship no matter what):** Fairy Lights border, Snowfall, Frosted Glass, Fireplace Glow, Candy-Cane frame, Snow Globe vignette, Tinsel corners, Midnight Countdown (NYE).
  - **Face-tracked disguises (Camera Kit lens group, original lenses):** Santa hat + beard, reindeer antlers + nose, elf ears + hat, ugly sweater, Krampus, Nutcracker, snowman, champagne-and-party-hat (NYE).
  - Name the pack "Holidays" in the tray tab. Pack art must not be generic clip-art; match the neon Last Call look.
- Vaulting: a pack whose window has passed disappears from the tray entirely (not greyed) and stays in the DB as `vaulted` for reuse. Gate it.
- Keep the unchanged rules: one pick per show, look drops on ASK, Moment strips everything, host can force any look off, looks never touch throwables/cracks/crown.

## PR B — `feat/subscription-scaffold`
Build the entitlement layer and the doc. **Do not build billing.** Stripe comes in a later PR once Nick sets prices.
- Write the model into `docs/fun-and-money.md` (create it if the Fun & Money doc isn't in the repo yet):
  - **Subscription** = convenience and status: bigger throwables ration, every cosmetic pack included while subscribed, open any profile in full, priority bench line, no "coming soon" locks, subscriber badge on the tile.
  - **Tiers** = earned only (chips → leaderboard → unlock the right to wear flex looks). Subscribers still climb. Money never skips a tier.
  - **✦** = à la carte for non-subscribers (cosmetic looks only).
  - Hard rules, unchanged: ✦ never buys chips; money never touches the host's choice; a paid look never blocks jeers or adds hearts; gameplay looks (Crown, Mystery Mask, fuse) are never sold.
- Schema: `profiles.subscription` (`none` | `active` | `comped`), `subscription_until timestamptz`, server-side only (RLS: users read their own, never write). One RPC `is_subscriber(uid)` used by every gate. Admin RPC `comp_subscription(uid, until)` so Nick can comp crew and hosts.
- Wire the perks behind `is_subscriber` with the scaffold values: throwables ration ×2, pack access, profile-open-full, bench priority. Everything else no-ops until billing exists.
- Gates for: non-subscriber can't exceed base ration; comped account passes every perk check; expired `subscription_until` reads as `none`.
- No pricing copy anywhere in the UI. A placeholder "VIP · coming soon" pill in the lobby only.

## PR C — `feat/profiles-tinder` (built by the planning session, not the agent)
Ruling 10/21: "full go — Tinder's architecture, and an interesting interface between the profiles and the game." The interface, approved:
1. **Contestant card, not a dating profile.** Tap a name chip (chair, bench, host, lobby card) and the sheet opens like a game-show intro card: big photo, name/age/city, **show stats first** (hearts tonight, shows played, KEEPs, tier), then bio and prompts.
2. **The host ASKs from his prompts.** The ~20 prompts are a real question deck ("From his profile", 🪪) so `ask_question` is untouched. The ASK drawer gets a HIS PROMPTS tab showing the target's three answered prompts; the spotlight shows his written answer under the question.
3. **Crowd ♥ on the card = a heart; mutual = After Party (DMs after the show ends).** That is **PR D**, not C.
4. **Bench stays blind to the host** — she can't open a bench card until he's seated.

Opening anyone's tile — chair, bench, host, crowd card — opens their profile card. Edit your own from the lobby (avatar top-left).
- **Photos:** up to 6, first is primary, drag to reorder, Supabase Storage bucket `profile-photos` with RLS (owner writes, everyone signed-in reads). The bench headshot still gets taken every bench join and stays separate from the gallery (the crowd's live look at him); the gallery is what you see when you tap in.
- **Basics:** display name, age (from the existing age gate, calendar-exact via `adultMaxBirthdate()`), city (free text, no GPS), pronouns optional.
- **Bio:** 500 chars.
- **Details, all optional, chip-pickers:** job, school, height, looking for (dates / friends / the show), drinks, smokes, kids, zodiac.
- **Interests:** pick up to 5 from a curated list (~60 chips; music, bars, outdoors, etc.). Add "Live music" and "Karaoke" — Portland crowd.
- **Prompts:** 3 from a list of ~20, one-line answers. Write original prompts in the show's voice ("My last call is usually…", "I'd pick the chair over the bench because…").
- **Show stats, read-only, computed:** shows played, hearts earned, KEEPs, tier badge, current look, subscriber badge.
- **Hosts additionally:** next show (if scheduled), shows hosted.
- Profile completeness bar; nothing is required beyond name, age, one photo.
- Visibility: everyone signed in sees name, age, primary photo, bio, stats. Full gallery, details, prompts open for subscribers (PR B) — **soft-launch override:** `lc_config.profiles_open_to_all = true` until Nick flips it, so nobody hits a wall in week one.
- Report/block from the profile card (block hides them from your rooms both ways; report writes a row for Nick). Minimum viable, but it must exist before public profiles do.
- Gates: photo RLS (can't write another user's photo), age shows the gated value, block hides both ways, completeness math, prompt limit of 3, interest limit of 5.
- Mobile first: the card is a bottom sheet that scrolls, photos swipe. Use `design/lastcall-theme.css`; read the mocks in `afterhours/design/` before drawing anything.

## Stop points
- PR A SQL → Nick runs it.
- PR B DDL → Nick runs it.
- PR C bucket + DDL → Nick runs it.
- Otherwise don't ask. Make the call, note it in the PR body under "Judgment calls".
