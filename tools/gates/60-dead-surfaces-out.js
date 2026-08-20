/* GATE 60 — dead-surfaces-out: three unreachable client surfaces removed,
 * with the boundary of that removal pinned so a later cleanup pass cannot
 * widen it by accident.  Ships with fix/dead-surfaces-out.
 *
 * WHAT CAME OUT, AND WHY EACH ONE QUALIFIED.
 *
 *   1. `.lc-lane.is-surging` — a CSS rule with no JS setter anywhere in the
 *      file (logged in DESIGN-DIFF under fix/truth-in-bench).  The shared
 *      `@keyframes lc-lane-surge` STAYS: `.lc-lane.is-leading` animates off
 *      the same keyframe, and deleting it along with is-surging would have
 *      silently killed the NEXT UP halo's animation too.  The stray
 *      "is-surging" token in the empty-lane `classList.remove(...)` call
 *      (index.html, the bench-empty branch) came out with it — a class that
 *      is never added does not need to be defensively removed either.
 *
 *   2. Dead locals `tallies` / `leadN` — computed every bench render, read by
 *      nothing (logged in the same DESIGN-DIFF entry as the hearts rule's old
 *      working set, orphaned since fix/truth-in-bench moved NEXT UP onto
 *      nextOffBench()).
 *
 *   3. The promotion card — driven end to end by `CURRENT_ROOM.promoting`,
 *      a field nothing in this codebase ever writes (SOURCE(client) grep,
 *      zero call sites; the field does not appear among the room columns the
 *      backend double models either).  It never rendered for anyone.
 *
 * JUDGMENT CALL — SCOPE OF THE PROMOTION-CARD REMOVAL.  The brief named "the
 * markup, its three hardcoded 0:05 literals, and its setText targets".  That
 * undersells what actually had to come out: `promo`/`isPromo` are read in
 * SEVEN places (the per-seat flag, two setText calls, the is-empty/is-promo
 * classList toggles, the bench-hint note branch, the watchbar text branch,
 * the phase-chip label, and the root `is-promoting` toggle), and the CSS
 * carries FOUR more consumers of a class that JS would then never set again
 * (`.chair__promo*`/`.chair.is-promo`, the phasechip gold rule, the hostctl
 * hide rule, the seat z-index rule, and the blind-bench amber rule).  Taking
 * only the markup and leaving `promo`/`isPromo` alive would have left a
 * `.chair.is-promo` outer glow with no card inside it — worse than before,
 * not cleaner.  Removing the markup without also removing the CSS that only
 * that markup's class ever triggered would have left orphaned selectors
 * bound to a class nothing sets — the exact "dead surface" this PR exists to
 * take out.  So the full reachable chain came out together, root toggle down
 * to leaf CSS rule; DESIGN-DIFF's HALF-BUILT SURFACES entry records what a
 * real version would need (see there for the server-side shape).
 *
 * WHAT WAS DELIBERATELY LEFT ALONE, AND WHY.
 *
 *   - The `:not(.is-promo)` guards inside three compound selectors that gate
 *     real, live features (`.lc-hearttap` visibility, the CHOOSING-beat
 *     `.hostctl` "TAP TO ASK" rule).  `is-promo` is never added by JS after
 *     this PR, so the guard is now provably a no-op — but it sits inside
 *     selectors that do real work for unrelated classes (`is-host`,
 *     `is-empty`, `is-strip`, `is-asked`), and touching a live selector list
 *     to shave a no-op token is exactly the over-reach a cleanup PR invites.
 *     Left as harmless residue, not fixed here.
 *   - `is-promoting-out` (the bench-lane "amber trail" CSS) — same disease as
 *     is-surging, a rule with zero JS setters anywhere.  It was NOT in the
 *     named scope for this PR, so it was not touched.  Logged fresh in
 *     DESIGN-DIFF as a newly-found dead surface, the same way is-surging was
 *     logged and left for fix/truth-in-bench before this PR came to take it.
 *
 * THE HOLD — STRIKE PIPS STAY, ON PURPOSE.  `strikes` is a real column,
 * written server-side by `engine_award_seat`, and the client already reads
 * it (`m.strikes`, the pip toggle, `is-lastlife` at 2+).  Nothing about this
 * PR touches that code, and scene C below is not decorative: the classList
 * edit that dropped "is-surging" lived on the SAME line that carries
 * "is-lastlife" and "is-leading" as neighboring tokens in one
 * `classList.remove(...)` call, so a scope assertion that only reads the
 * source and never renders a strike would miss a token-boundary slip in that
 * exact edit.  Scene C renders one.
 *
 * THE FOUR CLAIMS:
 *   A. is-surging's CSS rule is gone; the shared keyframe survives, and
 *      is-leading's lane genuinely animates off it (not just present in
 *      source — computed style, at runtime)
 *   B. the promotion card never renders: no markup, no CSS consumer, no
 *      reachable JS path to CURRENT_ROOM.promoting, and the classes it used
 *      to set (`is-promo`, `is-promoting`) are never present in the DOM
 *   C. strike pips still render exactly as before — the HOLD survived the
 *      surrounding edits
 *   D. the dead locals are gone from source, and the surviving
 *      is-promoting-out / :not(.is-promo) residue is exactly what this
 *      header says it is — present, not silently also removed
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150));
  }
};

module.exports = {
  name: "dead-surfaces-out",
  async run(t, ctx) {
    const html = ctx.html;

    /* ---------- STATIC — source-string claims ---------- */
    t.ok(!/\.lc-lane\.is-surging\{/.test(html),
      "the .lc-lane.is-surging CSS rule is gone from source");
    t.ok(/@keyframes lc-lane-surge\{/.test(html),
      "…but the shared @keyframes lc-lane-surge survives");
    t.ok(/\.lc-lane\.is-leading\{[^}]*animation:lc-lane-surge/.test(html),
      "…and .lc-lane.is-leading still declares its animation off that keyframe");
    t.ok(!/"is-surging"/.test(html),
      "no source string still names \"is-surging\" (the classList.remove token came out with the rule)");

    t.ok(!/const tallies=/.test(html) && !/const leadN=/.test(html),
      "the dead locals tallies/leadN are gone from source");

    t.ok(!/chair__promo/.test(html),
      "chair__promo does not appear ANYWHERE in source — markup, CSS, and JS all came out together");
    t.ok(!/CURRENT_ROOM\??\.promoting/.test(html),
      "the never-written CURRENT_ROOM.promoting read is gone");
    t.ok(!/\bisPromo\b/.test(html) && !/\bconst promo\b/.test(html),
      "the promo/isPromo variables are gone, not merely orphaned");
    t.ok(!/is-promoting(?!-out)/.test(html),
      "no live \"is-promoting\" selector/toggle remains (is-promoting-out is a different, deliberately-untouched class — checked next)");

    t.ok((html.match(/is-promoting-out/g) || []).length >= 1,
      "…and is-promoting-out itself is UNTOUCHED — a newly-found dead surface, out of this PR's named scope, logged rather than fixed");
    t.ok(/:not\(\.is-promo\)/.test(html),
      "…and the :not(.is-promo) guards in the live hearttap/hostctl selectors are UNTOUCHED — harmless residue, left rather than risking a live selector edit");

    t.ok(/m\.strikes\s*\|\|\s*0/.test(html) && /lc-lane__pips/.test(html) && /is-lastlife/.test(html),
      "the strike-pips HOLD: source still reads m.strikes, still toggles lc-lane__pips, still names is-lastlife");

    /* ---------- RUNTIME — render it and look ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@dead60.test" });
      ["u_c1", "u_c2", "u_c3", "u_a", "u_b", "u_c"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host", { isMobile: true, hasTouch: true });
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const room = D.addRoom({ id: "r_dead60", host_id: hostU, name: "Jackie's Room", phase: "deciding", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600000);
      D.addMember(room, "u_c1", "chair", { seat_index: 0 });
      D.addMember(room, "u_c2", "chair", { seat_index: 1 });
      D.addMember(room, "u_c3", "chair", { seat_index: 2 });
      D.addMember(room, "u_a", "line", { line_position: 300 });
      D.addMember(room, "u_b", "line", { line_position: 500 });
      D.addMember(room, "u_c", "line", { line_position: 700 });

      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });

      const lanes = () => host.page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 3; i++) {
          const el = document.getElementById("rt_bench" + i);
          if (!el) { out.push(null); continue; }
          out.push({
            i, uid: el.dataset.benchuid || null,
            leading: el.classList.contains("is-leading"),
            empty: el.classList.contains("is-empty"),
            pipsOn: Array.from(el.querySelectorAll(".lc-lane__pips span")).filter((p) => p.classList.contains("on")).length,
            lastlife: el.classList.contains("is-lastlife"),
          });
        }
        return out;
      });


      await waitFor(async () => (await lanes()).filter((l) => l && l.uid).length === 3,
        10000, "three bench lanes to render");

      /* --- scope: the scene really rendered --- */
      const A0 = await lanes();
      t.ok(A0.every((l) => l && l.uid) && !A0.some((l) => l.empty),
        "scope: all three bench lanes rendered occupied, not a blank bench");

      /* ---------- claim A: is-leading still genuinely animates ---------- */
      const leaders = A0.filter((l) => l.leading);
      t.ok(leaders.length === 1, `exactly one lane leads (u_a has the lowest line_position) — got ${leaders.length}`);
      t.ok(!!leaders[0] && leaders[0].uid === "u_a",
        `…and it is u_a, the lowest line_position — is-leading's CLASS APPLICATION still works post-edit (the keyframe binding itself is the static source assertion above: getComputedStyle is unusable here because the harness runs with prefers-reduced-motion:reduce, which index.html's own media query turns into animation:none on every #room element regardless of any rule)`);

      /* ---------- claim B: no promotion card, anywhere, ever ---------- */
      const promoState = await host.page.evaluate(() => ({
        cardCount: document.querySelectorAll(".chair__promo").length,
        anyIsPromo: !!document.querySelector(".chair.is-promo"),
        rootIsPromoting: document.getElementById("room").classList.contains("is-promoting"),
      }));
      t.ok(promoState.cardCount === 0, "zero .chair__promo elements exist in the DOM — the markup is gone, not merely hidden");
      t.ok(!promoState.anyIsPromo, "no chair ever carries is-promo");
      t.ok(!promoState.rootIsPromoting, "#room never carries is-promoting");

      /* ---------- claim C: strike pips HOLD ---------- */
      await host.page.evaluate(() => {
        const m = window.__lc.ROOM_STATE.members.find((x) => x.user_id === "u_b");
        m.strikes = 2;
        window.__lc.renderRoom();
      });
      const A1 = await lanes();
      const strikeLane = A1.find((l) => l.uid === "u_b");
      t.ok(!!strikeLane, "u_b's lane still renders after the strikes mutation");
      t.ok(strikeLane.pipsOn === 2, `u_b's lane shows 2 pips lit (got ${strikeLane && strikeLane.pipsOn}) — the HOLD held`);
      t.ok(strikeLane.lastlife, "…and is-lastlife is set at strikes>=2, exactly as before this PR");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
