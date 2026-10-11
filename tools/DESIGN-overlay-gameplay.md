## Nick's ruling (10/11): all six, approved
> "I love all of them. Let's go."

Today a throw is a sticker: the 🍅 emoji pops, slides, fades, and changes nothing. The ruling: **the overlay builds up, means something, and pays off.** Commit this section unchanged as `tools/DESIGN-overlay-gameplay.md` in PR A. It is the spec. Where this brief and the spec disagree, the spec wins, and you report the mismatch.

### The six
1. **Real art.** Every throwable gets teaser-quality art instead of an emoji: a tomato that bursts with seeds and drips, a cream pie that smears, petals that drift, confetti, a boo cloud, a cricket. **The same throw looks identical on every phone**, so any randomness (splat shape, drips, petal paths) is seeded from the throw itself (e.g. the target and `throw_at`), never from `Math.random()`. Reference look: the "Step Right Up" teaser's splat.
2. **The Pressure.** Jeers leave **cracks** on a chair's frame that stay for the rest of the round instead of fading. Each landed jeer adds a crack, and each landed rose mends one. At **3 cracks** the frame visibly **shatters**: a cracked-glass frame and a feed line, "The room is turning on [name]". The shatter has **no automatic consequence.** It informs her, and she decides. Cracks reset at round end. Cracks sit on the **frame**, not his face or his look, so drop-on-ASK doesn't touch them.
3. **Crowd combos.** If **3 different crowd members** throw the same kind of thing (cheer or jeer) at the same chair within **5 seconds**, it becomes:
   - **STANDING OVATION** (cheers): a big room-wide effect and **+1 heart** to that chair.
   - **BOOED OFF** (jeers): a banner over his tile, and a **host-only** nudge ("The room is booing [name]"). No automatic consequence.

   The throwers stay anonymous. The room sees a count, never names.
4. **Reaction windows.** For **6 seconds after he finishes answering** (his answer clock ends, or she moves on), every throw at him **counts double**: 2 cracks for a jeer, 2 mended for a rose, and 2 toward a combo. A thrower's ration is still charged once.
5. **The Crown and the Wire.**
   - **Crown:** the chair with the most hearts at the end of a round wears a crown on his frame for the next round. **The crown blocks jeers** (cheers still land), the same as the host-granted shield, which stays. If hearts are tied, the current holder keeps it, and in round 1 a tie means no crown. The crown is a frame ornament, not a look: it doesn't drop at ASK, and it hides during The Moment like everything else.
   - **Wire:** while he's on the answer clock, a fuse burns around his frame in step with the clock. It's visual only and drawn from the existing clock. Nothing shatters at zero (the look is already off by then).
6. **The wipe as a beat.** When she ASKs him, a spotlight sweep visibly washes the live throw off his tile, a fresh-start moment everyone sees. The ASK wipe clears the **live throw only.** Cracks are the room's verdict for the round and stay.

### What doesn't change
The existing throwables rules all hold: crowd-only throwers, seated-chair targets, opt-in, rations (5 cheers / 2 jeers), anonymity, the host on/off switch, host clear, Moment refusal and wipe, the shield, and server-owned timing.

### One rule changes, for combos
Today a chair with a live throw refuses any other throw. Under the new rule, **while a throw is live, a same-polarity throw from a *different* crowd member within the 5s combo window is accepted as a "join".** It's charged to that thrower and counts toward the combo, but it doesn't restart or stack the overlay. An opposite-polarity throw during a live throw is still refused. The chair's cooldown starts when the live throw (including any combo effect) ends.

### Defaults for Nick (one config object or server constants)
| Setting | Default |
|---|---|
| Cracks to shatter | 3 |
| Roses mend | 1 crack each |
| Combo window / threshold | 5s / 3 distinct throwers |
| Ovation bonus | +1 heart |
| Reaction window / multiplier | 6s / ×2 |
| Crown tie | holder keeps; round-1 tie means no crown |
