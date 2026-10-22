/* GATE 100 — the marquee: scheduled shows, RSVP, the countdown, and the
 * scheduled card becoming the live card (feat/marquee, PR D2 of the lobby
 * refresh; ruling Nick 10/21–22: a lobby that is never dead — "if there's
 * nobody online when people want to use it, they'll never come back").
 *
 * THE SHAPE: a host schedules a show (title, a time 10 min–30 days out, one
 * scheduled show per host); the lobby's top carries the NEXT SHOW card —
 * title, host (tap → her card), when, a countdown, N going, I'm going /
 * ✓ Going (rsvp); the host sees Cancel instead.  When she hits GO LIVE
 * within two hours of her slot, show_went_live links the room and the card
 * reads LIVE NOW with Watch now.  A linked room that has ended reads done
 * and leaves the Marquee.  Reminders (email) are D2b.
 *
 * The claims, through the real DOM and window.__lc against index.html:
 *   S.  STATIC — the DDL is Studio-safe, guards on the 10/21–22 read-backs
 *       (lc_config 8ae9e8a3…, public_profile 239070f7…, deck_next
 *       fb39c820…), one scheduled show per host, the 10 min–30 day window,
 *       shows + rsvps join realtime; the Marquee sits ABOVE GO LIVE in the
 *       lobby; the marquee code names no engine RPC; both stamp sites agree
 *   1.  SCHEDULE — Marla schedules "Marla's Room" for +2h: schedule_show
 *       wrote the row, she is going (1), her button reads "Your show:
 *       Tonight…"; a second schedule is refused; a time 5 minutes out is
 *       refused on the phone
 *   2.  THE CARD — Jo's lobby shows NEXT SHOW / Marla's Room / with Marla /
 *       in 2h / 1 going / I'm going; the countdown string is the page's own
 *       fmtCountdown; tapping the face opens Marla's card
 *   3.  RSVP — Jo taps I'm going → rsvp(true), count 2, button ✓ Going;
 *       again → rsvp(false), count 1; Marla's lobby refreshed by realtime
 *   4.  LIVE — Marla goes live (the real GO LIVE path): show_went_live links
 *       the room; Jo's card reads LIVE NOW with Watch now; Watch now opens
 *       that room
 *   5.  DONE — the room ends: the show reads done and leaves the Marquee;
 *       the Marquee hides with nothing scheduled
 *   6.  CANCEL — a new scheduled show, then Cancel: gone from Jo's lobby
 *   7.  zero console errors in every window
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150)); } };

module.exports = {
  name: "marquee",
  async run(t, ctx) {
    const ddl = fs.readFileSync(path.join(__dirname, "..", "DDL-marquee.sql"), "utf8");
    const live = ddl.replace(/^--.*$/gm, "");
    const tags = [...live.matchAll(/\$[a-zA-Z_]+\$/g)].map((m) => m[0]);
    t.ok(tags.length === 0 && !/\brow\b\s+public\./.test(live), "the DDL is Studio-safe: only $$, no variable named row");
    t.ok(/8ae9e8a3c39bb23bb3c83f7848dcd600/.test(live) && /239070f77a0faac41b7d382d2cb15eb2/.test(live) && /fb39c8203d9a7e843294cbec2069bc0d/.test(live), "guards on lc_config 8ae9e8a3…, public_profile 239070f7…, deck_next fb39c820…");
    t.ok(/you already have a show scheduled/.test(live) && /interval '10 minutes'/.test(live) && /interval '30 days'/.test(live), "one scheduled show per host; 10 minutes to 30 days out");
    t.ok(/add table public\.shows/.test(live) && /add table public\.rsvps/.test(live), "shows and rsvps join realtime");
    t.ok(/'host', public\.public_profile\(s\.host_id\)/.test(live), "the host on the card is public_profile");
    const lobby = (ctx.html.match(/<div id="lobby"[\s\S]*?<\/div>\s*<!-- ROOM/) || [""])[0];
    t.ok(lobby.indexOf('id="marquee"') > 0 && lobby.indexOf('id="marquee"') < lobby.indexOf('id="golive"'), "the Marquee sits above GO LIVE");
    const mq = (ctx.html.match(/let SHOWS=\[\][\s\S]*?try\{ marqueeInit\(\); \}/) || [""])[0];
    t.ok(mq.length > 1500 && !/ask_question|seat_member|keep_member|pass_member|decide_keep|join_line|start_show|engine_|throw_at/.test(mq), "the marquee code names no engine RPC");
    t.ok(new Set([ctx.html.match(/id="buildstamp">(b\d{4}\.\d{4})</)[1], ctx.html.match(/\[lastcall\] build (b\d{4}\.\d{4})/)[1]]).size === 1, "both stamp sites agree");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const errsOf = (c) => c.errors.filter((e) => !/favicon|storage\/v1\/object/.test(e));
      D.addUser({ id: "u_marla", name: "Marla", gender: "woman", seeking: "men" }); D.profiles.get("u_marla").birthdate = "1991-01-01";
      D.addUser({ id: "u_jo", name: "Jo", gender: "woman", seeking: "everyone" }); D.profiles.get("u_jo").birthdate = "1992-05-05";
      const boot = async (name, uid) => { const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 15000 });
        await waitFor(() => c.page.evaluate(() => Array.isArray(window.__lc.SHOWS)), 8000, name + ": marquee loaded"); return c; };

      /* 1. schedule */
      const marla = await boot("marla", "u_marla");
      const hidden0 = await marla.page.evaluate(() => getComputedStyle(document.getElementById("marquee")).display === "none");
      t.ok(hidden0, "nothing scheduled: the Marquee is hidden");
      const soon = await marla.page.evaluate(() => { window.__lc.openSchedule(); document.getElementById("sc_title").value = "Marla's Room";
        const d = new Date(Date.now() + 5 * 60000); const p = (n) => String(n).padStart(2, "0");
        document.getElementById("sc_when").value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        return window.__lc.scheduleSubmit(); });
      t.ok(soon === false && D.shows.length === 0 && /10 minutes/.test(await marla.page.evaluate(() => document.getElementById("sc_err").textContent)), "5 minutes out is refused on the phone");
      const ok = await marla.page.evaluate(() => { const d = new Date(Date.now() + 2 * 3600000); const p = (n) => String(n).padStart(2, "0");
        document.getElementById("sc_when").value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        return window.__lc.scheduleSubmit(); });
      t.ok(ok === true && D.shows.length === 1 && D.shows[0].host_id === "u_marla" && D.shows[0].title === "Marla's Room" && D.rsvps.length === 1, "schedule_show wrote the row; the host is going");
      await waitFor(() => marla.page.evaluate(() => window.__lc.SHOWS.length === 1), 5000, "Marla's marquee");
      const btn = await marla.page.evaluate(() => document.getElementById("schedulebtn").textContent);
      t.ok(/Your show: /.test(btn), "her button reads Your show: … (" + btn + ")");
      let dup = null; try { D.scheduleShow("u_marla", "Again", new Date(Date.now() + 3 * 3600000).toISOString()); } catch (e) { dup = e.message; }
      t.ok(/already have a show/.test(dup || ""), "a second scheduled show is refused");
      t.ok(await marla.page.evaluate(() => !!document.getElementById("mq_cancel") && !document.getElementById("mq_rsvp")), "the host sees Cancel, not I'm going");

      /* 2. the card */
      const jo = await boot("jo", "u_jo");
      await waitFor(() => jo.page.evaluate(() => !!document.getElementById("mq_rsvp")), 8000, "Jo's card");
      const card = await jo.page.evaluate(() => { const el = document.querySelector("#marquee .mq"); return { k: el.querySelector(".mq__kicker").textContent.trim(), title: el.querySelector(".mq__title").textContent,
        sub: el.querySelector(".mq__sub").textContent, count: el.querySelector("#mq_count").textContent, going: el.querySelector(".mq__going").textContent, cd: window.__lc.fmtCountdown(window.__lc.SHOWS[0].starts_at), btn: document.getElementById("mq_rsvp").textContent }; });
      t.ok(card.k === "NEXT SHOW" && card.title === "Marla's Room" && /with Marla/.test(card.sub) && card.count === card.cd && /in 1h 5\dm|in 2h/.test(card.cd) && /1 going/.test(card.going.replace(/\s+/g, " ")) && card.btn === "I'm going",
        "Jo's lobby: NEXT SHOW · Marla's Room · with Marla · " + card.count + " · 1 going · I'm going");
      await jo.page.evaluate(() => document.querySelector("#marquee .mq__face").click());
      await waitFor(() => jo.page.evaluate(() => !!document.querySelector("#profilecard .pc__name")), 8000, "Marla's card from the Marquee");
      t.ok(true, "tapping the host's face opens her card");
      await jo.page.evaluate(() => window.__lc.closeProfile());

      /* 3. rsvp */
      const r1 = await jo.page.evaluate(() => window.__lc.marqueeRsvp(window.__lc.SHOWS[0].id, true));
      t.ok(r1 && r1.count === 2 && D.rsvps.some((x) => x.user_id === "u_jo"), "I'm going → rsvp(true), 2 going");
      t.ok(await jo.page.evaluate(() => document.getElementById("mq_rsvp").textContent === "✓ Going" && document.getElementById("mq_rsvp").classList.contains("is-on")), "the button reads ✓ Going");
      await waitFor(() => marla.page.evaluate(() => window.__lc.SHOWS[0] && window.__lc.SHOWS[0].going === 2), 5000, "Marla's count by realtime");
      t.ok(true, "Marla's lobby saw the RSVP by realtime");
      const r2 = await jo.page.evaluate(() => window.__lc.marqueeRsvp(window.__lc.SHOWS[0].id, false));
      t.ok(r2 && r2.count === 1 && !D.rsvps.some((x) => x.user_id === "u_jo"), "again → rsvp(false), 1 going");

      /* 4. live — the real GO LIVE path (the show is 2h out, inside the ±2h window) */
      await marla.page.evaluate(() => { document.getElementById("golive").click(); document.getElementById("gl_name").value = "Marla's Room"; document.getElementById("gl_go").click(); });
      await marla.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => D.shows[0].status === "live" && !!D.shows[0].room_id, 8000, "show_went_live");
      t.ok(D.rooms.get(D.shows[0].room_id).host_id === "u_marla", "GO LIVE linked her scheduled show to the room");
      await waitFor(() => jo.page.evaluate(() => !!document.getElementById("mq_join")), 8000, "Jo's LIVE NOW card");
      const liveCard = await jo.page.evaluate(() => ({ k: document.querySelector("#marquee .mq__kicker").textContent.trim(), isLive: document.querySelector("#marquee .mq").classList.contains("is-live") }));
      t.ok(/LIVE NOW/.test(liveCard.k) && liveCard.isLive, "the scheduled card IS the live card: LIVE NOW + Watch now");
      await jo.page.evaluate(() => document.getElementById("mq_join").click());
      await jo.page.waitForSelector("#room.show", { timeout: 10000 });
      t.ok(await jo.page.evaluate((id) => window.__lc.CURRENT_ROOM && window.__lc.CURRENT_ROOM.id === id, D.shows[0].room_id), "Watch now opens that room");

      /* 5. done */
      const rm = D.rooms.get(D.shows[0].room_id); rm.status = "ended"; D.emit("rooms", "UPDATE", { ...rm });
      const jo2 = await boot("jo2", "u_jo");
      t.ok(await jo2.page.evaluate(() => window.__lc.SHOWS.length === 0 && getComputedStyle(document.getElementById("marquee")).display === "none"), "the ended room's show reads done and leaves the Marquee; the Marquee hides");

      /* 6. cancel */
      D.shows[0].status = "done";
      const s2 = D.scheduleShow("u_marla", "Encore", new Date(Date.now() + 26 * 3600000).toISOString());
      await waitFor(() => jo2.page.evaluate(() => window.__lc.SHOWS.length === 1 && /Tomorrow|·/.test(document.querySelector("#marquee .mq__sub").textContent)), 8000, "Encore on Jo's marquee");
      await marla.page.evaluate(() => window.__lc.marqueeLoad());
      const cancelled = await marla.page.evaluate((id) => window.__lc.marqueeCancel(id), s2.id);
      t.ok(cancelled === true && D.shows.find((x) => x.id === s2.id).status === "cancelled", "Cancel marks it cancelled");
      await waitFor(() => jo2.page.evaluate(() => window.__lc.SHOWS.length === 0), 8000, "gone from Jo's lobby");
      t.ok(true, "…and it is gone from Jo's lobby by realtime");

      /* 7. quiet */
      for (const c of [marla, jo, jo2]) t.ok(errsOf(c).length === 0, c.name + ": zero console errors — " + errsOf(c).join(" | "));
    } finally { await h.close(); }
  },
};
