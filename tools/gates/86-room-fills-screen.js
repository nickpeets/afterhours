/* GATE 86 — room-fills-screen: the chairs and the bench are sized to the phone.
 * Ships with feat/room-fills-screen (ruling 10/11, from an iPhone screenshot:
 * "the boxes should come all the way down to the top of [the shield button]").
 *
 * --cell-h and --bench-h were fixed px (168/116, then 136/88 under 800px of
 * height and 76/44 under 560).  On a 390x844 phone the stage ended 60% of the
 * way down and the rest was chat.  They are now derived from the visible
 * height in CSS, so the top bar, the 2x2, the bench label and the bench row
 * run from the top bar to just above the rail.
 *
 * SCENES, all measured off the real page:
 *   A  four phones (375x667, 390x844, 430x932, 360x780), crowd and host: the
 *      bench ends within a few px above the shield — no overlap, no gap; the
 *      chairs and the bench are both taller than the old fixed sizes; a
 *      chair is never taller than 4:3 portrait for its width; chat sits
 *      under the bench, beside the rail, and no chat line touches a chair
 *   B  the Safari toolbar shows (the viewport loses 80px): the layout refits
 *      with no scroll and no overlap
 *   C  the limits: a short screen holds the old floor, a tall narrow one
 *      holds the 4:3 cap, a rotated phone keeps the old 76/44
 *   D  spotlight at 390x844: the two frames are EQUAL (rider e), the rivals'
 *      strip is there, the bench has not moved, the question card lies
 *      across the foot of the two-up — inside the frames, under the face
 *      zone, clear of the bench; blind bench silhouettes scale with the seat
 *   E  keyboard open: the stage does not move a pixel, the composer stays on
 *      screen above the keyboard
 *   F  a tray opening does not push the composer off the screen, and the rail
 *      steps aside while the throw tray or the filter shelf is open
 *
 * THE FOUR FIXES NICK ASKED FOR ON THE PLACEMENT SHEETS (10/11), each held here:
 *   1  crowd composer: the input gets the room — "Say something…" fits at all
 *      four sizes; THROW and TAKE A BENCH SEAT are 46px icon buttons that
 *      still carry their names for a screen reader                     (scene A)
 *   2  the rail hides while the throw tray or the filter shelf is open, and
 *      comes back when it closes                                       (scene F)
 *   3  the top chat line fades out under the bench with a mask — it is not
 *      cut off by the strip's edge                                     (scene A)
 *   4  "she's heard enough" sits beside the rail, level with the shield, a
 *      full thumb target, and covers none of her chat                  (scene D)
 *
 * NOT HERE, AND WHY: "the Moment" has no layout of its own in index.html —
 * moment_a/moment_b pair two faces inside the same frames (it gates looks and
 * throws), so there is no Moment geometry to assert.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};

/* the old fixed sizes, by the old breakpoints — "never shorter than today" */
const OLD = (h) => (h <= 560 ? { cell: 76, bench: 44 } : h < 800 ? { cell: 136, bench: 88 } : { cell: 168, bench: 116 });

const measure = (page) => page.evaluate(() => {
  const r = (el) => { if (!el || getComputedStyle(el).display === "none") return null; const b = el.getBoundingClientRect(); return b.width ? { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height, w: b.width } : null; };
  const q = (s) => document.querySelector(s);
  const chairs = [...document.querySelectorAll("#rt_chairs .chair")].map((c) => ({
    host: c.classList.contains("is-host"), target: c.classList.contains("is-target"), strip: c.classList.contains("is-strip"),
    feed: r(c.querySelector(".chair__feed")), box: r(c) })).filter((c) => c.feed);
  const lanes = [...document.querySelectorAll(".lc-lane")].map((l) => ({ box: r(l), cell: r(l.querySelector(".lc-lane__cell")),
    sil: r(l.querySelector(".lc-lane__sil-head")) })).filter((l) => l.box);
  // a chat line as PAINTED: the strip clips its overflow, so a line's box is
  // cut to the strip's own box and a line wholly above it is not on screen
  const strip = r(q("#rt_livelayer"));
  const msgs = [...document.querySelectorAll("#rt_livelayer .floatmsg")].map(r).filter(Boolean)
    .map((g) => ({ ...g, t: Math.max(g.t, strip.t), b: Math.min(g.b, strip.b) })).filter((g) => g.b - g.t > 1);
  const cta = (id) => { const el = q(id), box = r(el); if (!box) return null; const words = el.querySelector(".lc-cta__t");
    return { box, verb: el.getAttribute("data-verb"), label: el.getAttribute("aria-label") || "", glyph: !!el.querySelector(".lc-cta__g"),
      wordsShown: !!(words && getComputedStyle(words).display !== "none") }; };
  // does the placeholder fit the input as typed?  measured in the input's own font
  const inp = q("#rt_chatinput"); let ph = null;
  if (inp && r(inp)) { const cs = getComputedStyle(inp), cx = document.createElement("canvas").getContext("2d"); cx.font = cs.font;
    ph = { need: cx.measureText(inp.getAttribute("placeholder") || "").width, text: inp.getAttribute("placeholder") || "",
      room: inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) }; }
  const stripEl = q("#rt_livelayer"), scs = stripEl ? getComputedStyle(stripEl) : null;
  const room = q("#room");
  return { ph, throwbtn: cta("#rt_throwbtn"), joinbtn: cta("#rt_joinline"), skip: r(q("#eg_skip")), rail: r(q(".lc-rail")), shelf: r(q("#rt_shelf")),
    mask: scs ? (scs.maskImage && scs.maskImage !== "none" ? scs.maskImage : scs.webkitMaskImage) || "" : "",
    hasSkip: room.classList.contains("has-skip"), sheetOpen: room.classList.contains("sheet-open"),
    vw: innerWidth, vh: innerHeight, scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth,
    top: r(q(".lc-top")), chairsBox: r(q("#rt_chairs")), chairs, lanes, benchBottom: lanes.length ? Math.max(...lanes.map((l) => l.box.b)) : null,
    shield: r(q("#rt_safebtn")), gift: r(q("#rt_giftbtn")), chat: r(q("#rt_livelayer")), input: r(q("#inputbar")), msgs,
    question: r(q("#eg_question")), tray: r(q("#rt_throwtray")), blind: q("#lineitems").classList.contains("is-blind") };
});
const hit = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const rd = (n) => Math.round(n * 10) / 10;

module.exports = {
  name: "room-fills-screen",
  async run(t) {
    /* one world per window: a fresh harness keeps the scenes independent */
    const stage = async (W, H, role, phase, extra) => {
      const h = await Harness.launch();
      const D = h.double;
      const mk = (id, name) => D.addUser({ id, name, email: id + "@fix.test" });
      const host = mk("u_host", "Hostess");
      const chairs = [mk("u_c0", "Chair Zero"), mk("u_c1", "Chair One"), mk("u_c2", "Chair Two")];
      const liners = [mk("u_l0", "Liner Zero"), mk("u_l1", "Liner One"), mk("u_l2", "Liner Two")];
      const spec = mk("u_sp", "Watcher");
      const uid = role === "host" ? host : role === "chair" ? chairs[0] : spec;
      const c = await h.newClient("v", { viewport: { width: W, height: H } });
      c.login(uid);
      await c.goto();
      await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      // the room is made AFTER the client boots: a booting host ends a live room she owns
      const room = D.addRoom({ id: "r_fill", host_id: host, name: "Fill Night", phase: phase || null, round: phase ? 1 : 0 });
      if (phase && phase !== "preshow") D.rooms.get(room).phase_deadline = D.iso(D.now() + 120000);
      if (phase === "spotlight") {
        D.questions.push({ id: "q_fill", text: "Window or aisle, and do you talk to the stranger next to you?" });
        D.rooms.get(room).spotlight_target = "u_c0"; D.rooms.get(room).spotlight_question_id = "q_fill";
      }
      if (!(extra && extra.empty)) {
        chairs.forEach((u, i) => D.addMember(room, u, "chair", { seat_index: i }));
        liners.forEach((u) => D.addMember(room, u, "line"));
      }
      D.addMember(room, spec, "spectator");
      await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await c.page.waitForSelector("#room.show", { timeout: 10000 });
      await c.page.waitForTimeout(1400);
      return { h, c, D, room };
    };
    const say = async (c, n) => {
      for (let i = 0; i < n; i++) { await c.page.fill("#rt_chatinput", "line " + i + " of the room's chat, long enough to run wide"); await c.page.press("#rt_chatinput", "Enter"); await c.page.waitForTimeout(90); }
      await c.page.evaluate(() => document.getElementById("rt_chatinput").blur());
      await c.page.waitForTimeout(400);
    };
    const errors = [];

    /* ---------- A: four phones, crowd and host ---------- */
    for (const [W, H] of [[375, 667], [390, 844], [430, 932], [360, 780]]) {
      for (const role of ["spectator", "host"]) {
        const { h, c } = await stage(W, H, role, null);
        try {
          if (role === "spectator") await say(c, 7);
          const m = await measure(c.page);
          const tag = `${W}x${H} ${role === "host" ? "host" : "crowd"}`;
          const gap = m.shield.t - m.benchBottom;
          t.ok(gap >= 0 && gap <= 10, `A ${tag}: the bench ends ${rd(gap)}px above the shield (0–10: no overlap, no gap)`);
          const old = OLD(H);
          const cells = m.chairs.map((x) => x.feed.h), seats = m.lanes.map((l) => l.cell.h);
          t.ok(cells.length === 4 && cells.every((x) => x > old.cell + 2), `A ${tag}: every chair is taller than the old ${old.cell}px (${cells.map(rd).join("/")})`);
          t.ok(seats.length === 3 && seats.every((x) => x > old.bench + 1), `A ${tag}: every bench seat is taller than the old ${old.bench}px (${seats.map(rd).join("/")})`);
          t.ok(m.chairs.every((x) => x.feed.h <= x.feed.w * 4 / 3 + 1), `A ${tag}: no chair is taller than 4:3 portrait (${rd(cells[0])} on ${rd(m.chairs[0].feed.w)} wide)`);
          t.ok(Math.max(...cells) - Math.min(...cells) < 0.6, `A ${tag}: the four cells are the same height`);
          t.ok(m.scrollH <= m.vh && m.scrollW <= m.vw, `A ${tag}: nothing scrolls (${m.scrollW}x${m.scrollH} in ${m.vw}x${m.vh})`);
          t.ok(m.input.b <= m.vh && m.gift.b <= m.input.t, `A ${tag}: the rail and the composer are where they were — on screen, rail above composer`);
          if (role === "spectator") {
            t.ok(m.msgs.length >= 3 && m.chat.t >= m.benchBottom - 0.5 && m.chat.b <= m.input.t + 0.5,
              `A ${tag}: chat lives between the bench and the composer (${rd(m.chat.t)}–${rd(m.chat.b)}, ${m.msgs.length} lines)`);
            const onFace = m.msgs.filter((g) => m.chairs.some((x) => hit(g, x.feed)));
            t.ok(onFace.length === 0, `A ${tag}: no chat line paints over a chair (${onFace.length} do)`);
            t.ok(m.msgs.every((g) => g.r <= m.shield.l + 0.5), `A ${tag}: chat lines stop short of the rail`);
            t.ok(m.chat.h >= 60, `A ${tag}: the chat strip keeps at least three lines of height (${rd(m.chat.h)}px)`);
            // fix 1 — the input gets the room; the two crowd buttons go icon-only
            t.ok(m.ph && /^Say something/.test(m.ph.text) && m.ph.room >= m.ph.need + 2,
              `A ${tag}: the input shows all of "${m.ph && m.ph.text}" (${m.ph && rd(m.ph.room)}px of room for ${m.ph && rd(m.ph.need)}px of words)`);
            const tb = m.throwbtn, jb = m.joinbtn;
            t.ok(tb && tb.glyph && !tb.wordsShown && Math.abs(tb.box.w - 46) < 1.5 && tb.box.h >= 44 && /throw/i.test(tb.label),
              `A ${tag}: THROW is a ${tb && rd(tb.box.w)}px icon button named "${tb && tb.label}"`);
            t.ok(jb && jb.verb === "join" && jb.glyph && !jb.wordsShown && Math.abs(jb.box.w - 46) < 1.5 && jb.box.h >= 44 && /bench seat/i.test(jb.label),
              `A ${tag}: TAKE A BENCH SEAT is a ${jb && rd(jb.box.w)}px icon button named "${jb && jb.label}"`);
            t.ok(tb.box.r <= m.vw && jb.box.r <= m.vw && tb.box.l >= m.input.l && tb.box.r <= jb.box.l + 0.5, `A ${tag}: both buttons sit whole on the row, nothing clipped`);
            // fix 3 — the top line fades under the bench; it is not cut by the strip's edge
            t.ok(/linear-gradient/.test(m.mask) && /rgba\(0, 0, 0, 0\)|transparent/.test(m.mask) && /30px/.test(m.mask),
              `A ${tag}: the chat strip fades its top 30px with a mask (${m.mask.slice(0, 60)}…)`);
            t.ok(!m.hasSkip && !m.skip, `A ${tag}: the crowd has no skip button and its chat keeps the full strip`);
          } else {
            t.ok(m.hasSkip === !!m.skip, `A ${tag}: has-skip and the skip button agree (${m.hasSkip}/${!!m.skip})`);
          }
          errors.push(...c.errors);
        } finally { await h.close(); }
      }
    }

    /* ---------- B: the toolbar shows — 80px less, live ---------- */
    {
      const { h, c } = await stage(390, 844, "spectator", null);
      try {
        const before = await measure(c.page);
        await c.page.setViewportSize({ width: 390, height: 764 });
        await c.page.waitForTimeout(500);
        const m = await measure(c.page);
        const gap = m.shield.t - m.benchBottom;
        t.ok(gap >= 0 && gap <= 10, `B: 80px shorter, the bench still ends ${rd(gap)}px above the shield`);
        t.ok(m.chairs[0].feed.h < before.chairs[0].feed.h - 20 && m.chairs[0].feed.h > 136, `B: the chairs gave the height back (${rd(before.chairs[0].feed.h)} → ${rd(m.chairs[0].feed.h)}) and stay above the floor`);
        t.ok(m.scrollH <= m.vh && m.input.b <= m.vh, "B: no scroll, composer on screen");
        await c.page.setViewportSize({ width: 390, height: 844 });
        await c.page.waitForTimeout(400);
        const back = await measure(c.page);
        t.ok(Math.abs(back.chairs[0].feed.h - before.chairs[0].feed.h) < 0.6, "B: the toolbar hides again and the stage returns to exactly where it was");
        errors.push(...c.errors);
      } finally { await h.close(); }
    }

    /* ---------- C: the limits ---------- */
    for (const [W, H, what] of [[390, 600, "floor"], [360, 900, "cap"], [844, 390, "landscape"]]) {
      const { h, c } = await stage(W, H, "spectator", null);
      try {
        const m = await measure(c.page);
        const cell = m.chairs[0].feed.h, seat = m.lanes[0].cell.h, w = m.chairs[0].feed.w;
        if (what === "floor") t.ok(Math.abs(cell - 136) < 0.6 && Math.abs(seat - 88) < 0.6, `C ${W}x${H}: a screen too short to fit holds the old 136/88 — never smaller (${rd(cell)}/${rd(seat)})`);
        if (what === "cap") t.ok(Math.abs(cell - w * 4 / 3) < 1.5 && m.shield.t - m.benchBottom >= 0, `C ${W}x${H}: a tall narrow screen stops at 4:3 (${rd(cell)} on ${rd(w)} wide) and the slack goes to chat, not into the rail`);
        if (what === "landscape") t.ok(Math.abs(cell - 76) < 0.6 && Math.abs(seat - 44) < 0.6 && m.input.b <= m.vh, `C ${W}x${H}: a rotated phone keeps the old 76/44 and the composer on screen (${rd(cell)}/${rd(seat)})`);
        errors.push(...c.errors);
      } finally { await h.close(); }
    }

    /* ---------- D: spotlight, strip, blind ---------- */
    {
      const quad = await stage(390, 844, "host", "openfloor");
      let qm; try { qm = await measure(quad.c.page); } finally { await quad.h.close(); }
      const { h, c } = await stage(390, 844, "host", "spotlight");
      try {
        await waitFor(async () => { const m = await measure(c.page); return m.question && m.chairs.some((x) => x.target); }, 8000, "the spotlight two-up with its question");
        await say(c, 5);
        const m = await measure(c.page);
        const her = m.chairs.find((x) => x.host), him = m.chairs.find((x) => x.target), strip = m.chairs.find((x) => x.strip);
        t.ok(!!her && !!him && Math.abs(her.feed.h - him.feed.h) < 0.6, `D: the spotlight frames are EQUAL (${rd(her.feed.h)} / ${rd(him.feed.h)})`);
        t.ok(her.feed.h > 305 + 20, `D: and they follow the screen (${rd(her.feed.h)}px, was a fixed 305)`);
        t.ok(!!strip && strip.feed.h >= 46, `D: the rivals' strip is there (${strip ? rd(strip.feed.h) : "-"}px, never under the old 46)`);
        t.ok(Math.abs(m.chairsBox.b - qm.chairsBox.b) <= 1 && Math.abs(m.benchBottom - qm.benchBottom) <= 1,
          `D: the bench does not move between the 2x2 and the spotlight (${rd(qm.benchBottom)} → ${rd(m.benchBottom)})`);
        t.ok(m.shield.t - m.benchBottom >= 0, "D: nothing reaches the rail in spotlight");
        const q = m.question;
        t.ok(q.b <= her.feed.b + 0.5 && q.t >= her.feed.t + her.feed.h * 0.5,
          `D: the question lies across the foot of the two-up, under the face zone (${rd(q.t)}–${rd(q.b)} in frames ${rd(her.feed.t)}–${rd(her.feed.b)})`);
        t.ok(!m.lanes.some((l) => hit(q, l.box)) && !hit(q, m.chat), "D: the question covers neither the bench nor the chat");
        t.ok(m.blind && m.lanes.every((l) => l.sil && l.sil.h > 30 + 2), `D: blind bench — the silhouettes scale with the seat (head ${rd(m.lanes[0].sil.h)}px, was a fixed 30)`);
        // fix 4 — "she's heard enough" beside the rail, in reach of her thumb, off her chat
        const sk = m.skip;
        t.ok(!!sk && m.hasSkip && !!qm.skip && qm.hasSkip, "D: she's heard enough is up in the open floor and in spotlight, and the room knows it (has-skip)");
        t.ok(sk.r <= m.shield.l - 4 && sk.r >= m.shield.l - 16 && sk.t < m.shield.b && sk.b > m.shield.t,
          `D: it sits beside the rail, level with the shield (right edge ${rd(sk.r)}, shield starts ${rd(m.shield.l)})`);
        t.ok(sk.h >= 44 && sk.w >= 120 && sk.l >= 0 && sk.b <= m.input.t && sk.l > m.vw / 3, `D: a full thumb target on her right hand (${rd(sk.w)}x${rd(sk.h)})`);
        t.ok(!m.msgs.some((g) => hit(g, sk)) && !hit(sk, m.chat) && m.msgs.length >= 2, `D: it covers none of her chat — ${m.msgs.length} lines readable under it (${rd(m.chat.t)}–${rd(m.chat.b)})`);
        t.ok(!m.lanes.some((l) => hit(sk, l.box)) && !hit(sk, m.gift) && !hit(sk, m.shield), "D: and it touches neither the bench nor the rail's buttons");
        const overs = m.msgs.filter((g) => m.chairs.some((x) => hit(g, x.feed)) || m.lanes.some((l) => hit(g, l.box)));
        t.ok(overs.length === 0, `D: no chat line paints over a frame or a bench seat in spotlight (${overs.length} do)`);
        errors.push(...c.errors);
      } finally { await h.close(); }
    }

    /* ---------- E: keyboard open ---------- */
    {
      const { h, c } = await stage(390, 844, "spectator", "openfloor");
      try {
        await say(c, 5);
        const before = await measure(c.page);
        // what the app's own visualViewport handler sets when a 300px keyboard rises
        await c.page.evaluate(() => { document.documentElement.style.setProperty("--lc-kb", "300px"); document.getElementById("room").classList.add("kb-open"); });
        await c.page.waitForTimeout(300);
        const m = await measure(c.page);
        const still = m.chairs.every((x, i) => Math.abs(x.feed.t - before.chairs[i].feed.t) < 0.5 && Math.abs(x.feed.h - before.chairs[i].feed.h) < 0.5) &&
          Math.abs(m.benchBottom - before.benchBottom) < 0.5;
        t.ok(still, "E: keyboard open — the chairs and the bench do not move a pixel");
        t.ok(m.input.b <= m.vh - 300 && m.input.t >= m.vh - 300 - 120, `E: the composer sits just above the keyboard (${rd(m.input.t)}–${rd(m.input.b)}, keyboard top ${m.vh - 300})`);
        t.ok(m.shield && m.shield.h >= 44, "E: the shield is still there with the keyboard up");
        errors.push(...c.errors);
      } finally { await h.close(); }
    }

    /* ---------- F: a tray opens ---------- */
    {
      const { h, c } = await stage(390, 844, "spectator", "openfloor");
      try {
        const before = await measure(c.page);
        await c.page.click("#rt_throwbtn");
        await waitFor(async () => (await measure(c.page)).tray, 4000, "the throw tray");
        await c.page.waitForTimeout(300);
        const m = await measure(c.page);
        t.ok(m.input.b <= m.vh && Math.abs(m.input.t - before.input.t) < 0.5, `F: the tray opens and the composer holds its place (${rd(m.input.t)}–${rd(m.input.b)} of ${m.vh})`);
        t.ok(m.tray.b <= m.input.t + 0.5 && !m.chairs.some((x) => hit(m.tray, x.feed)), "F: the tray rises above the composer and stops short of the chairs");
        // fix 2 — the rail steps aside for the tray
        t.ok(!!before.rail && !!before.shield && m.sheetOpen && !m.rail && !m.shield && !m.gift, "F: throw tray open — the shield and gift rail is hidden, nothing sits on the tray");
        await c.page.click("#rt_throwbtn");
        await waitFor(async () => !(await measure(c.page)).sheetOpen, 4000, "the throw tray to close");
        await c.page.waitForTimeout(200);
        const back = await measure(c.page);
        t.ok(!!back.shield && !!back.gift && Math.abs(back.shield.t - before.shield.t) < 0.5, "F: tray closed — the rail is back exactly where it was");
        errors.push(...c.errors);
      } finally { await h.close(); }
    }
    {
      const { h, c } = await stage(390, 844, "chair", "openfloor");
      try {
        const before = await measure(c.page);
        await c.page.click("#rt_filterbtn");
        await waitFor(async () => (await measure(c.page)).shelf, 4000, "the filter shelf");
        await c.page.waitForTimeout(300);
        const m = await measure(c.page);
        t.ok(!!before.shield && m.sheetOpen && !m.rail && !m.shield, "F: filter shelf open — the rail is hidden too");
        t.ok(m.shelf.b <= m.input.t + 0.5 && m.input.b <= m.vh && !m.chairs.some((x) => hit(m.shelf, x.feed)), "F: the shelf rises above the composer and stops short of the chairs");
        await c.page.click("#rt_filterbtn");
        await waitFor(async () => !(await measure(c.page)).sheetOpen, 4000, "the filter shelf to close");
        const back = await measure(c.page);
        t.ok(!!back.shield && Math.abs(back.shield.t - before.shield.t) < 0.5, "F: shelf closed — the rail is back");
        errors.push(...c.errors);
      } finally { await h.close(); }
    }

    const errs = errors.filter((e) => !/favicon/.test(e));
    t.ok(errs.length === 0, "zero console errors across every window — " + errs.slice(0, 2).join(" | "));
  },
};
