/* GATE 95 — door-explainer: the sign-in page tells a stranger what Last
 * Call is before it asks for a password (feat/splash-explainer, 10/19).
 *
 * THE SCREEN, top to bottom: the wordmark and .lsub as before; a small
 * "Sign in" link top-right for a returning user; the stacked neon wordmark with the martini under it and one line,
 * "The Live Dating Game Show" (ruling 10/20: that is all the door says); a STATUS LINE that says only what the
 * client can already read signed-out; then the tab row and the forms,
 * unchanged.  The status line is the truthful part and the part that can
 * lie, so most of this gate is about it:
 *
 *   live room  → a LIVE NOW card (name, red live dot), tapping it lands on
 *                the sign-in form; NO video and NO token signed-out (ruling
 *                10/10: preview tokens are signed-in only)
 *   pack only  → "Tonight: {name} {icon}" from lc_config
 *   neither    → nothing, and no schedule claim anywhere on #auth
 *
 * What it reads, and what it must NOT ask for: a stranger may read
 * public.rooms (RLS rooms_select_live admits live rows for any role —
 * DESIGN-stale-rooms.md) and call lc_config (granted to anon).
 * list_live_rooms, active_members, join_room and the daily-room function
 * are signed-in doors; a signed-out page never knocks on them.  The double's
 * opLog and the harness's dailyRoomRequests are the record.
 *
 * The claims, through the real DOM and window.__lc against index.html:
 *   S.  STATIC: the three beats' copy, verbatim, inside #auth and before
 *       the tab row; the "Sign in" link precedes the explainer; no
 *       schedule-claim string anywhere in #auth's markup
 *   1.  NOTHING ON: no live room, no pack — #auth_status is empty and
 *       hidden; the guest asked for no signed-in door and no token
 *   2.  A LIVE ROOM: the card names the show, carries LIVE NOW and a live
 *       dot, holds no <video>; no token was requested; tapping it opens the
 *       Sign in tab, scrolls the tab row into view and focuses the email
 *       field; the "Sign in" link does the same
 *   3.  PACK ONLY: the line is exactly "Tonight: Halloween 🎃"; a live room
 *       outranks the pack; a pack outside its window paints nothing
 *   4.  REACHABLE at 360/375/390/414 (phone heights 640/667/844/896): the
 *       Sign in / New here tabs are fully on screen after at most HALF a
 *       screen of scroll, both tabs switch their panels, and the form's
 *       fields are the same ids as before
 *   5.  REDUCED MOTION: under prefers-reduced-motion the live dot does not
 *       animate
 *   6.  zero console errors, zero egress, in every window
 */
"use strict";
const { Harness } = require("../lib/harness");
const { HALLOWEEN_PACK } = require("../lib/backend-double");

const LSUB = "The Live Dating Game Show";
/* a schedule claim is any promise about WHEN shows happen */
const SCHEDULE = /most nights|every night|nightly|each night|every (evening|weekend|friday|saturday|sunday)|shows at|live at \d|\b\d{1,2}\s?(am|pm)\b|tonight at|every day|daily show/i;
const SIGNED_IN_DOORS = ["list_live_rooms", "active_members", "join_room", "heartbeat"];

const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150)); } };

/* the page's own answer, once it has one (authStatusLoad settles AUTH_STATUS) */
const statusOf = (c) => waitFor(() => c.page.evaluate(() => window.__lc.AUTH_STATUS), 10000, "AUTH_STATUS");
const shot = (c) => c.page.evaluate(() => {
  const box = document.getElementById("auth_status");
  const card = document.getElementById("auth_live"), pack = document.getElementById("auth_pack");
  return {
    boxText: (box && box.textContent.trim()) || "",
    boxShown: !!box && getComputedStyle(box).display !== "none",
    card: card ? { text: card.textContent.trim(), dot: !!card.querySelector(".livedot"), dotAnim: card.querySelector(".livedot") ? getComputedStyle(card.querySelector(".livedot")).animationName : null } : null,
    pack: pack ? pack.textContent : null,
    videos: document.querySelectorAll("#auth video").length,
  };
});
const guestOps = (D, name) => D.opLog.filter((o) => o.clientId === name);

module.exports = {
  name: "door-explainer",
  async run(t, ctx) {
    /* ── S. static ─────────────────────────────────────────────── */
    const auth = (ctx.html.match(/<div id="auth">([\s\S]*?)<!-- FIRST-RUN SETUP -->/) || [])[1] || "";
    t.ok(auth.length > 0, "#auth markup found");
    const text = auth.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    t.ok(/<h1 id="auth_mark"[^>]*><span>LAST<\/span><span>CALL<\/span><\/h1>/.test(auth), "the wordmark is LAST over CALL");
    t.ok(auth.includes('class="door__glass"'), "the martini is under the wordmark");
    t.ok(auth.indexOf('id="auth_explainer"') < 0 && !/HOW TO PLAY/.test(auth), "no how-to-play block (ruling 10/20)");
    const iTabs = auth.indexOf('class="tabrow"'), iStatus = auth.indexOf('id="auth_status"'), iMark = auth.indexOf('id="auth_mark"'), iGlass = auth.indexOf('class="door__glass"'), iSub = auth.indexOf('class="lsub"');
    t.ok(iMark >= 0 && iMark < iGlass && iGlass < iSub && iSub < iStatus && iStatus < iTabs, "order: wordmark, martini, the line, status line, then the tab row (" + [iMark, iGlass, iSub, iStatus, iTabs].join(" < ") + ")");
    t.ok(auth.indexOf('id="auth_skip"') < 0, "no top-right Sign in link (ruling 10/19 pm)");
    t.ok(/#app:has\(#auth:not\(\.hide\)\) header\{display:none\}/.test(ctx.html), "the app header (small logo + chip) is hidden while the door is up");
    t.ok(auth.includes('<div class="lsub">' + LSUB + '</div>'), "the subheading is exactly: " + LSUB);
    const sched = text.match(SCHEDULE);
    t.ok(!sched, "no schedule claim in #auth markup" + (sched ? " — found '" + sched[0] + "'" : ""));
    t.ok(/<button class="tab" id="tab_signup">New here<\/button>/.test(auth), "the New here tab keeps its name");
    t.ok(/18\+ only · live video with real people · be kind on camera/.test(auth), "the 18+ note is unchanged");
    ["li_email", "li_pass", "li_go", "li_forgot", "su_email", "su_pass", "su_agree", "su_go"].forEach((id) =>
      t.ok(auth.includes('id="' + id + '"'), "form field " + id + " is still there"));
    /* the signed-out status code never names a signed-in door or a token */
    const js = (ctx.html.match(/async function authStatusLoad\(\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(js.length > 0 && !/list_live_rooms|active_members|daily-room|DAILY_FN|createCallObject|lobbyPv|functions\.invoke/.test(js),
      "authStatusLoad reads rooms + lc_config only — no signed-in RPC, no token, no Daily");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const errsOf = (c) => c.errors.filter((e) => !/favicon/.test(e));

      /* ── 1. nothing on ──────────────────────────────────────────── */
      const g0 = await h.newClient("g0");
      await g0.goto();
      await g0.page.waitForSelector("#auth", { timeout: 15000 });
      const st0 = await statusOf(g0);
      const s0 = await shot(g0);
      t.ok(st0.kind === "none" && s0.boxText === "" && !s0.boxShown, "no room, no pack: the status line is empty and hidden (kind=" + st0.kind + ")");
      const knocked0 = guestOps(D, "g0").filter((o) => o.op === "rpc" && SIGNED_IN_DOORS.includes(o.name)).map((o) => o.name);
      t.ok(knocked0.length === 0, "signed-out, nothing on: no signed-in door was asked for — " + knocked0.join(","));
      t.ok(h.dailyRoomRequests.filter((r) => r.client === "g0").length === 0, "signed-out: no daily-room token request");
      const chrome0 = await g0.page.evaluate(() => ({ header: getComputedStyle(document.querySelector("#app > header")).display, slot: (document.getElementById("sessionslot") || {}).textContent || "" }));
      t.ok(chrome0.header === "none", "signed-out: the app header is not shown (display=" + chrome0.header + ")");
      t.ok(chrome0.slot === "", "signed-out: the window/session slot is empty without ?debug ('" + chrome0.slot + "')");

      /* ── 2. a live room ─────────────────────────────────────────── */
      const host = D.addUser({ id: "u_door_host", name: "Marla" });
      D.addRoom({ id: "r_door", host_id: host, name: "Marla's Room", phase: "spotlight", round: 1 });
      const g1 = await h.newClient("g1");
      await g1.goto();
      await g1.page.waitForSelector("#auth", { timeout: 15000 });
      const st1 = await statusOf(g1);
      const s1 = await shot(g1);
      t.ok(st1.kind === "live" && st1.room && st1.room.id === "r_door", "a live room: the status is that room (kind=" + st1.kind + ")");
      t.ok(!!s1.card && /LIVE NOW/.test(s1.card.text) && s1.card.text.includes("Marla's Room") && s1.card.dot,
        "the LIVE NOW card names the show and carries the live dot — " + JSON.stringify(s1.card));
      t.ok(s1.videos === 0, "no <video> under #auth signed-out (" + s1.videos + ")");
      t.ok(h.dailyRoomRequests.filter((r) => r.client === "g1").length === 0, "a live room signed-out: still no daily-room token request");
      const knocked1 = guestOps(D, "g1").filter((o) => o.op === "rpc" && SIGNED_IN_DOORS.includes(o.name)).map((o) => o.name);
      t.ok(knocked1.length === 0, "a live room signed-out: no signed-in door was asked for — " + knocked1.join(","));
      const roomsRead = guestOps(D, "g1").filter((o) => o.op === "table" && o.table === "rooms" && o.action === "select");
      t.ok(roomsRead.length >= 1 && roomsRead.every((o) => o.ok === true), "the card came from a rooms read (" + roomsRead.length + ")");
      /* tap → the sign-in form */
      await g1.page.click("#tab_signup");   // start on the other tab so the tap has to switch
      await g1.page.click("#auth_live");
      await g1.page.waitForTimeout(400);
      const after = await g1.page.evaluate(() => {
        const a = document.getElementById("auth"), row = document.querySelector("#auth .tabrow");
        const ar = a.getBoundingClientRect(), rr = row.getBoundingClientRect();
        return { loginOn: document.getElementById("tab_login").classList.contains("on"),
          loginShown: getComputedStyle(document.getElementById("loginPanel")).display !== "none",
          focused: document.activeElement && document.activeElement.id,
          rowVisible: rr.top >= ar.top - 1 && rr.bottom <= ar.bottom + 1 };
      });
      t.ok(after.loginOn && after.loginShown && after.focused === "li_email" && after.rowVisible,
        "tapping the card lands on the sign-in form: Sign in tab on, tab row on screen, email focused — " + JSON.stringify(after));
      /* ── 3. pack only / live outranks pack / outside the window ──── */
      const now = () => D.now(), iso = (ms) => new Date(ms).toISOString();
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 3_600_000) });
      const g2 = await h.newClient("g2");          // room still live: the card wins
      await g2.goto();
      await g2.page.waitForSelector("#auth", { timeout: 15000 });
      const st2 = await statusOf(g2);
      t.ok(st2.kind === "live", "a live room outranks tonight's pack (kind=" + st2.kind + ")");
      D.rooms.get("r_door").status = "ended";
      const g3 = await h.newClient("g3");
      await g3.goto();
      await g3.page.waitForSelector("#auth", { timeout: 15000 });
      const st3 = await statusOf(g3);
      const s3 = await shot(g3);
      t.ok(st3.kind === "pack" && s3.pack === "Tonight: Halloween \u{1F383}" && !s3.card,
        "pack only: the line is exactly 'Tonight: Halloween 🎃' and there is no card — " + JSON.stringify({ kind: st3.kind, pack: s3.pack }));
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() + 86_400_000), ends_at: iso(now() + 2 * 86_400_000) });   // tomorrow's
      const g4 = await h.newClient("g4");
      await g4.goto();
      await g4.page.waitForSelector("#auth", { timeout: 15000 });
      const st4 = await statusOf(g4);
      const s4 = await shot(g4);
      t.ok(st4.kind === "none" && s4.boxText === "", "a pack outside its window paints nothing (kind=" + st4.kind + ")");
      D.removeLookPack("halloween");

      /* ── 4. reachable at the four phone widths ──────────────────── */
      D.rooms.get("r_door").status = "live";       // the tallest screen: beats + card
      for (const [w, hgt] of [[360, 640], [375, 667], [390, 844], [414, 896]]) {
        const c = await h.newClient("w" + w, { viewport: { width: w, height: hgt } });
        await c.goto();
        await c.page.waitForSelector("#auth", { timeout: 15000 });
        await statusOf(c);
        await c.page.waitForTimeout(150);
        const m = await c.page.evaluate(() => {
          const a = document.getElementById("auth"), row = document.querySelector("#auth .tabrow");
          const ar = a.getBoundingClientRect(), rr = row.getBoundingClientRect();
          const before = { top: rr.top - ar.top, bottom: rr.bottom - ar.top, box: ar.height, overflowX: a.scrollWidth > a.clientWidth + 1 };
          a.scrollTop = Math.max(0, Math.min(a.scrollHeight - a.clientHeight, rr.bottom - ar.bottom + 8));   // the least scroll that shows the tabs
          const r2 = row.getBoundingClientRect();
          return { ...before, scrolled: a.scrollTop, visibleAfter: r2.top >= ar.top - 1 && r2.bottom <= ar.bottom + 1 };
        });
        t.ok(!m.overflowX, w + "x" + hgt + ": no sideways overflow");
        const mark = await c.page.evaluate(() => { const h = document.getElementById("auth_mark"), a = document.getElementById("auth");
          const cs = getComputedStyle(a); const inner = a.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          const lines = [...h.querySelectorAll("span")].map((x) => x.getBoundingClientRect().width);
          return { w: Math.max(...lines), inner }; });
        t.ok(mark.w >= mark.inner * 0.75 && mark.w <= mark.inner + 1, w + "x" + hgt + ": the stacked wordmark fills the width (" + Math.round(mark.w) + " of " + Math.round(mark.inner) + ")");
        t.ok(m.scrolled <= m.box / 2 && m.visibleAfter,
          w + "x" + hgt + ": the tabs are on screen after at most half a screen of scroll (tabs at " + Math.round(m.top) + "–" + Math.round(m.bottom) + " of " + Math.round(m.box) + ", scrolled " + Math.round(m.scrolled) + ")");
        await c.page.click("#tab_signup");
        const su = await c.page.evaluate(() => getComputedStyle(document.getElementById("signupPanel")).display !== "none");
        await c.page.click("#tab_login");
        const li = await c.page.evaluate(() => getComputedStyle(document.getElementById("loginPanel")).display !== "none" && getComputedStyle(document.getElementById("signupPanel")).display === "none");
        t.ok(su && li, w + "x" + hgt + ": both tabs switch their panels");
        t.ok(errsOf(c).length === 0, w + "x" + hgt + ": zero console errors — " + errsOf(c).slice(0, 2).join(" | "));
        await c.close();
      }

      /* ── 5. reduced motion (the harness context asks for it) ───── */
      t.ok(s1.card && s1.card.dotAnim === "none", "under prefers-reduced-motion the live dot does not animate (" + (s1.card && s1.card.dotAnim) + ")");

      /* ── 6. clean ───────────────────────────────────────────────── */
      for (const c of [g0, g1, g2, g3, g4]) t.ok(errsOf(c).length === 0, c.name + ": zero console errors — " + errsOf(c).slice(0, 2).join(" | "));
      t.ok(h.unexpectedRequests.length === 0, "no unexpected network egress — " + h.unexpectedRequests.slice(0, 3).join(", "));
    } finally { await h.close(); }
  },
};
