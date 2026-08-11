/* GATE 41 — auth-storage: a session slot can never be mistaken for a token
 * chunk, and dead slots do not accumulate on a shared origin.
 *
 * Two defects, both found by inspecting real localStorage on prod after the
 * wave 9 item-3 reproduction.
 *
 * 1. NAMESPACE COLLISION.  supabase-js splits an oversized token across
 *    "<key>.0", "<key>.1", …  The old slot key was BASE + "." + slot, so
 *    ?session=4 wrote to exactly the key chunk 4 of the DEFAULT session
 *    would use.  Nothing had collided yet only because the tokens are
 *    small enough not to chunk — and the app loads an UNPINNED
 *    @supabase/supabase-js@2 from a CDN, so "small enough" is not a
 *    property this repo controls.  Slots now carry a non-numeric marker,
 *    which makes the overlap impossible by construction rather than
 *    unlikely by luck.
 *
 * 2. SWEEPER BLIND SPOT.  The old sweep matched /-auth-token\.tab-/ — the
 *    auto-generated slots only.  Nine waves of NAMED conductor slots
 *    (.host, .crowd1, .a, .4) were invisible to it and had accumulated:
 *    ten of them were still sitting in prod localStorage, on an origin
 *    observed to be shared with at least one other Supabase project.
 *
 * What is deliberately NOT done: an all-digits suffix is ambiguous — it
 * may be a legacy numeric slot or a real chunk of the live default session
 * — so it is reported and left alone.  Deleting on a guess is how you sign
 * a host out mid-show.  Another project's keys are never touched at all.
 */
"use strict";
const { Harness } = require("../lib/harness");

module.exports = {
  name: "auth-storage",
  async run(t, ctx) {
    /* ---------- STATIC ---------- */
    const js = ctx.html.replace(/\/\*[\s\S]*?\*\//g, "");
    t.ok(!/-auth-token\\\.tab-/.test(js) && !/\.tab-\//.test(js),
      "the .tab--only sweep regex is gone from the CODE");
    t.ok(/const SUPA_STORAGE_KEY=ahStorageKey\(AH_SESSION_SLOT\);/.test(js),
      "the storage key is built in exactly one place (ahStorageKey)");
    t.ok(/ahMigrateSlotKey\(AH_SESSION_SLOT\)/.test(js) &&
         js.indexOf("ahMigrateSlotKey(AH_SESSION_SLOT)") < js.indexOf("supabase.createClient"),
      "the slot carry-over runs BEFORE the client reads storage");

    const h = await Harness.launch();
    try {
      const c = await h.newClient("store");
      await c.goto();
      await c.page.waitForSelector("#auth", { timeout: 15000 });

      /* ---------- key construction ---------- */
      const keys = await c.page.evaluate(() => {
        const L = window.__lc, B = L.AH_AUTH_BASE;
        return {
          base: B,
          def: L.ahStorageKey(null),
          numeric: L.ahStorageKey("4"),
          named: L.ahStorageKey("host"),
          collide: B + ".4",
        };
      });
      t.ok(keys.def === keys.base, "no slot → the default key is untouched (existing logins survive the change)");
      t.ok(keys.numeric !== keys.collide,
        `a numeric slot cannot land on a chunk key (${keys.numeric} ≠ ${keys.collide})`);
      t.ok(!/^\d+$/.test(keys.numeric.slice(keys.base.length + 1)) &&
           !/^\d+$/.test(keys.named.slice(keys.base.length + 1)),
        "no slot key ever ends in a bare integer — the two namespaces cannot overlap");

      /* ---------- carry-over ---------- */
      const mig = await c.page.evaluate(() => {
        const L = window.__lc, B = L.AH_AUTH_BASE;
        localStorage.clear();
        const blob = JSON.stringify({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 });
        localStorage.setItem(B + ".host", blob);                       // legacy colliding key
        const moved = L.ahMigrateSlotKey("host");
        const after = { moved, legacy: localStorage.getItem(B + ".host"), current: localStorage.getItem(L.ahStorageKey("host")) };
        // and it must NEVER clobber a live slot
        localStorage.setItem(B + ".crowd", "LEGACY");
        localStorage.setItem(L.ahStorageKey("crowd"), "LIVE");
        after.second = L.ahMigrateSlotKey("crowd");
        after.live = localStorage.getItem(L.ahStorageKey("crowd"));
        after.legacyKept = localStorage.getItem(B + ".crowd");
        return after;
      });
      t.ok(mig.current && mig.legacy === null && mig.moved,
        "carry-over: an existing slot session moves to the safe key and the colliding one is removed");
      t.ok(mig.second === null && mig.live === "LIVE" && mig.legacyKept === "LEGACY",
        "carry-over never clobbers a slot that already has a live session");

      /* ---------- sweep ---------- */
      const sweep = await c.page.evaluate(() => {
        const L = window.__lc, B = L.AH_AUTH_BASE;
        localStorage.clear();
        const old = JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) - 30 * 86400 });
        const fresh = JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) + 3600 });
        localStorage.setItem(B + "." + "s-crowd1", old);      // dead named slot
        localStorage.setItem(B + "." + "s-host", fresh);      // live named slot
        localStorage.setItem(B + ".tab-abc123", old);         // dead auto slot (legacy shape)
        localStorage.setItem(B + ".4", old);                  // AMBIGUOUS: legacy numeric slot or chunk 4
        localStorage.setItem(B + ".0", old);                  // AMBIGUOUS: chunk 0
        localStorage.setItem(B, fresh);                       // the default session itself
        localStorage.setItem("sb-nuymzokvbdntbvinsnda-auth-token", old);   // ANOTHER PROJECT
        localStorage.setItem("lc_prefs_pending", "{}");
        const r = L.ahSweepAuthSlots();
        return {
          swept: r.swept.sort(), ambiguous: r.ambiguous.sort(),
          left: Object.keys(localStorage).sort(),
        };
      });
      t.ok(sweep.swept.some((k) => /s-crowd1$/.test(k)), "sweep: a dead NAMED slot is removed — the old regex could not see these");
      t.ok(sweep.swept.some((k) => /tab-abc123$/.test(k)), "sweep: a dead auto .tab- slot is still removed");
      t.ok(!sweep.left.some((k) => /s-crowd1$/.test(k)) && sweep.left.some((k) => /s-host$/.test(k)),
        "sweep: the live slot survives, only the expired one goes");
      t.ok(sweep.ambiguous.length === 2 && sweep.ambiguous.every((k) => /\.\d+$/.test(k)),
        "sweep: chunk-shaped keys are REPORTED, not guessed at — " + sweep.ambiguous.join(" "));
      t.ok(sweep.left.includes(sweep.ambiguous[0]) && sweep.left.includes(sweep.ambiguous[1]),
        "sweep: and they are still there afterwards — deleting a real chunk would corrupt a live session");
      t.ok(sweep.left.includes("sb-nuymzokvbdntbvinsnda-auth-token"),
        "sweep: another project's token on the shared origin is never ours to delete");
      t.ok(sweep.left.includes("lc_prefs_pending"), "sweep: unrelated app keys are untouched");

      /* ---------- the console tag no longer lies ---------- */
      await c.page.evaluate(() => { window.__lc.vdbg("tagged line", false, "[auth]"); window.__lc.vdbg("untagged line"); });
      t.ok(c.logs.some((l) => /^\[auth\] tagged line/.test(l.text)), "vdbg carries a channel tag when given one");
      t.ok(c.logs.some((l) => /^\[video\] untagged line/.test(l.text)), "vdbg still defaults to [video] for the video layer");
      t.ok(c.logs.some((l) => /^\[auth\] session restore/.test(l.text)),
        "the boot's own restore line announces itself as [auth], not [video]");

      const errs = c.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
