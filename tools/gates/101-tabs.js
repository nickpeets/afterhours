/* GATE 101 — the tabs: the Tinder layer first, then the show (feat/tabs,
 * D4 of the lobby refresh; ruling Nick 10/22: "make the Tinder portion as
 * familiar as possible, THEN we hit them with the show layer — swiping,
 * likes, chat, profile, all easily accessible").
 *
 * THE SHAPE: four panes under one persistent bottom bar — ♥ Swipe (HOME:
 * the deck, and ONE slim pill above it), 📺 Shows (the Marquee, LIVE NOW,
 * UP NEXT, GO LIVE, SCHEDULE), 💬 Matches (new-match faces, then the
 * message list), ☺ You (own card, completeness, EDIT, VIP, Settings, Sign
 * out, #whoami under ?debug).  Every block is the SAME element the one-
 * column lobby had — moved, with its id and its handlers.  Mechanics are
 * as built: no new RPC, no DDL, no engine touch.
 *
 * The claims, through the real DOM and window.__lc against index.html:
 *   S.  STATIC — the four panes and the bar are in the markup; the header
 *       holds the logo and #coinchip only (no #mebtn #matchesbtn
 *       #settingsbtn #signout); #lobby.is-quiet and its CSS are gone; the
 *       tabs code names no engine RPC; both stamp sites agree
 *   1.  SIGN-IN — Jo lands on #tab_swipe: the deck has cards, the bar is
 *       up, the other panes are hidden, the hash reads #swipe
 *   2.  THE PILL — nothing live, nothing scheduled: no pill.  Theo
 *       schedules → NEXT SHOW · when; a tap → the Shows tab
 *   3.  LIVE — Marla goes live (the real GO LIVE path): the pill reads
 *       LIVE NOW and names her; tap → Shows; her LIVE NOW card → the room;
 *       the bar is hidden while CURRENT_ROOM is set; she ends the show →
 *       the finale card FIRST (the bar still hidden), then Back to lobby →
 *       Swipe, bar back
 *   4.  MATCHES — a match with no messages is in the NEW MATCHES row and
 *       not in the list; after a message it moves to the list; the 💬
 *       cell's badge is UNREAD (has-unread + data-n, as #matchesbtn was)
 *   5.  YOU — the avatar opens her own card (#profilecard, ME.id); EDIT
 *       opens the editor; the VIP pill is there; Sign out works
 *   6.  DEEP LINKS — #shows / #you on load select the tab; back and
 *       forward move between tabs
 *   7.  zero console errors in every window
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: "tabs",
  async run(t, ctx) {
    /* ── S. static ─────────────────────────────────────────────── */
    const html = ctx.html;
    const lobby = (html.match(/<div id="lobby"[\s\S]*?<\/div>\s*<!-- ROOM/) || [""])[0];
    const pane = (id) => (lobby.match(new RegExp('<section class="tabpane" id="' + id + '"[\\s\\S]*?<\\/section>')) || [""])[0];
    const sw = pane("tab_swipe"), sh = pane("tab_shows"), ma = pane("tab_matches"), yo = pane("tab_you");
    t.ok(sw && sh && ma && yo && lobby.indexOf('id="tab_swipe"') < lobby.indexOf('id="tab_shows"'), "the four panes are in #lobby, Swipe first");
    t.ok(/id="showpill"/.test(sw) && /id="deck_stack"/.test(sw) && /id="deck_ctl"/.test(sw), "Swipe holds the pill and the deck (#deck_stack, #deck_ctl)");
    t.ok(sh.indexOf('id="marquee"') > 0 && sh.indexOf('id="roomlist"') > sh.indexOf('id="marquee"') && sh.indexOf('id="upnext"') > sh.indexOf('id="roomlist"') && sh.indexOf('id="golive"') > sh.indexOf('id="upnext"') && sh.indexOf('id="schedulebtn"') > sh.indexOf('id="golive"'),
      "Shows holds the Marquee, LIVE NOW, UP NEXT, then GO LIVE and SCHEDULE — in that order");
    t.ok(/id="matches_new"/.test(ma) && /id="matches_body"/.test(ma), "Matches holds the new-match row and the message list");
    t.ok(/id="mebtn"/.test(yo) && /id="you_edit"/.test(yo) && /id="vippill"/.test(yo) && /id="settingsbtn"/.test(yo) && /id="signout"/.test(yo) && yo.indexOf('id="whoami"') > yo.indexOf('id="signout"'),
      "You holds #mebtn, EDIT, #vippill, #settingsbtn, #signout, and #whoami at the foot");
    const header = (html.match(/<header>[\s\S]*?<\/header>/) || [""])[0];
    t.ok(/id="coinchip"/.test(header) && !/id="(mebtn|matchesbtn|settingsbtn|signout)"/.test(header), "the header keeps the logo and #coinchip only");
    const bar = (html.match(/<nav id="tabbar"[\s\S]*?<\/nav>/) || [""])[0];
    t.ok((bar.match(/class="tabbar__btn/g) || []).length === 4 && /id="matchesbtn"[^>]*data-tab="matches"[^>]*data-n="0"/.test(bar), "the bar has four cells and the 💬 cell IS #matchesbtn (data-n)");
    t.ok(!/is-quiet/.test(html), "#lobby.is-quiet is gone — markup, JS and CSS (grep)");
    t.ok(!/<div class="lc-sheet" id="matches"/.test(html), "the Matches sheet is gone — the list is the tab");
    const tabsJs = (html.match(/const TABS=\["swipe"[\s\S]*?try\{ tabsInit\(\); \}/) || [""])[0];
    t.ok(tabsJs.length > 1500 && !/ask_question|seat_member|keep_member|pass_member|decide_keep|join_line|start_show|engine_|throw_at|sb\.rpc\(/.test(tabsJs), "the tabs code names no RPC at all, engine or otherwise");
    t.ok(new Set([html.match(/id="buildstamp">(b\d{4}\.\d{4})</)[1], html.match(/\[lastcall\] build (b\d{4}\.\d{4})/)[1]]).size === 1, "both stamp sites agree");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const errsOf = (c) => c.errors.filter((e) => !/favicon|storage\/v1\/object/.test(e));
      const mk = (id, name, gender, seeking, bday) => { D.addUser({ id, name, gender, seeking }); const p = D.profiles.get(id); p.birthdate = bday; p.created_at = D.iso(); return id; };
      mk("u_jo", "Jo", "woman", "everyone", "1992-05-05");
      mk("u_dex", "Dex", "man", "women", "1994-03-09");
      mk("u_theo", "Theo", "man", "everyone", "1990-01-01");
      mk("u_marla", "Marla", "woman", "everyone", "1991-01-01");
      mk("u_sam", "Sam", "man", "women", "1991-01-01");
      const boot = async (name, uid, query) => { const c = await h.newClient(name); c.login(uid); await c.goto(query || "");
        await c.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 15000 });
        await waitFor(() => c.page.evaluate(() => Array.isArray(window.__lc.SHOWS) && window.__lc.DECK && document.querySelector("#deck_stack .deck__card, #deck_stack .deck__empty")), 8000, name + ": the lobby"); return c; };
      const state = (c) => c.page.evaluate(() => { const vis = (id) => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0; };
        return { active: window.__lc.tabActive(), hash: location.hash, swipe: vis("tab_swipe"), shows: vis("tab_shows"), matches: vis("tab_matches"), you: vis("tab_you"), bar: vis("tabbar"),
          on: [...document.querySelectorAll("#tabbar .tabbar__btn.is-on")].map((b) => b.dataset.tab), room: !!(window.__lc.CURRENT_ROOM), cards: document.querySelectorAll("#deck_stack .deck__card").length,
          pill: (() => { const p = document.getElementById("showpill"); return { shown: !p.hidden && getComputedStyle(p).display !== "none", text: p.textContent.replace(/\s+/g, " ").trim(), kind: p.dataset.kind || "" }; })(),
          headerIds: [...document.querySelectorAll("header [id]")].map((e) => e.id) }; });

      /* ── 1. sign-in lands on Swipe ─────────────────────────────── */
      const jo = await boot("jo", "u_jo");
      let s = await state(jo);
      t.ok(s.active === "swipe" && s.swipe && !s.shows && !s.matches && !s.you, "Jo lands on #tab_swipe; the other three panes are hidden");
      t.ok(s.cards >= 1, "the deck stack has cards (" + s.cards + ")");
      t.ok(s.bar && s.on.length === 1 && s.on[0] === "swipe", "the tab bar is up with ♥ Swipe lit");
      t.ok(!s.headerIds.includes("mebtn") && !s.headerIds.includes("matchesbtn") && s.headerIds.includes("coinchip"), "the header has no #mebtn — only the chip (" + s.headerIds.join(",") + ")");
      t.ok(s.hash === "#swipe", "the hash follows the tab (" + s.hash + ")");

      /* ── 2. the pill: nothing → NEXT SHOW ──────────────────────── */
      t.ok(!s.pill.shown && s.pill.text === "", "no live room, no scheduled show: no pill");
      D.scheduleShow("u_theo", "Theo's Late Show", new Date(Date.now() + 26 * 3600000).toISOString());
      await waitFor(() => jo.page.evaluate(() => window.__lc.SHOWS.length === 1 && !document.getElementById("showpill").hidden), 8000, "the NEXT SHOW pill by realtime");
      s = await state(jo);
      const when = await jo.page.evaluate(() => window.__lc.fmtWhen(window.__lc.SHOWS[0].starts_at));
      t.ok(s.pill.kind === "next" && /^NEXT SHOW/.test(s.pill.text) && s.pill.text.includes(when) && /Theo's Late Show/.test(s.pill.text), "the pill reads NEXT SHOW · " + when + " (" + s.pill.text + ")");
      t.ok(s.active === "swipe", "…on the Swipe tab, above the deck");
      await jo.page.evaluate(() => document.getElementById("showpill").click());
      s = await state(jo);
      t.ok(s.active === "shows" && s.shows && !s.swipe && s.on[0] === "shows" && s.hash === "#shows", "a tap on the pill opens the Shows tab");
      t.ok(await jo.page.evaluate(() => document.querySelector("#marquee .mq__kicker").textContent.trim() === "NEXT SHOW" && !!document.getElementById("mq_rsvp") && getComputedStyle(document.getElementById("golive")).display !== "none"),
        "…where the Marquee carries the same show and GO LIVE sits below the list");
      await jo.page.evaluate(() => window.__lc.tabShow("swipe"));

      /* ── 3. live: the pill names the host; the room is a takeover ── */
      const marla = await boot("marla", "u_marla", "#shows");
      await marla.page.evaluate(() => { document.getElementById("golive").click(); document.getElementById("gl_name").value = "Marla's Room"; document.getElementById("gl_go").click(); });
      await marla.page.waitForSelector("#room.show", { timeout: 10000 });
      const ms = await state(marla);
      t.ok(ms.room && !ms.bar, "Marla's GO LIVE: CURRENT_ROOM set, her bar hidden");
      await waitFor(() => jo.page.evaluate(() => document.querySelectorAll("#roomlist .roomcard").length === 1 && document.getElementById("showpill").dataset.kind === "live"), 10000, "Jo's LIVE NOW pill");
      s = await state(jo);
      t.ok(s.pill.kind === "live" && /^LIVE NOW/.test(s.pill.text) && /Marla/.test(s.pill.text) && /WATCH/.test(s.pill.text), "the pill reads LIVE NOW · Marla · WATCH › (" + s.pill.text + ")");
      const derived = await jo.page.evaluate(() => ({ rooms: window.__lc.LOBBY_ROOMS.map((r) => r.id), shows: window.__lc.SHOWS.length }));
      t.ok(derived.rooms.length === 1 && D.rooms.has(derived.rooms[0]) && derived.shows === 1, "…off the same rows the Marquee and LIVE NOW read (LOBBY_ROOMS + SHOWS), no RPC of its own");
      await jo.page.evaluate(() => document.getElementById("showpill").click());
      s = await state(jo);
      t.ok(s.active === "shows" && s.shows, "tap → Shows tab");
      await jo.page.evaluate(() => document.querySelector("#roomlist .roomcard").click());
      await jo.page.waitForSelector("#room.show", { timeout: 10000 });
      s = await state(jo);
      t.ok(s.room && !s.bar && await jo.page.evaluate(() => getComputedStyle(document.getElementById("lobby")).display === "none"), "Watch (the LIVE NOW card) enters the room: a full-screen takeover, the bar hidden");
      /* the host ends the show with no finalist: the finale card comes FIRST, then Swipe */
      await marla.page.evaluate(() => window.__lc.endShow(null));
      await waitFor(() => marla.page.evaluate(() => document.getElementById("finale").classList.contains("show") && !!document.getElementById("fin_done")), 10000, "Marla's finale card");
      const mid = await state(marla);
      t.ok(mid.room && !mid.bar && await marla.page.evaluate(() => getComputedStyle(document.getElementById("lobby")).display === "none"), "the finale card is up FIRST — still in the room, bar still hidden, never a bare lobby");
      await marla.page.evaluate(() => document.getElementById("fin_done").click());
      await marla.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 10000 });
      const back = await state(marla);
      t.ok(!back.room && back.active === "swipe" && back.swipe && back.bar && back.on[0] === "swipe", "Back to lobby → the Swipe tab, bar back");
      await waitFor(() => jo.page.evaluate(() => !window.__lc.CURRENT_ROOM && getComputedStyle(document.getElementById("lobby")).display !== "none"), 10000, "Jo back in the lobby");
      s = await state(jo);
      t.ok(s.active === "swipe" && s.bar, "…and the watcher leaves to Swipe too, bar back");
      await waitFor(() => jo.page.evaluate(() => document.getElementById("showpill").dataset.kind !== "live"), 8000, "the pill lets go of the ended room");
      s = await state(jo);
      t.ok(s.pill.kind === "next", "the ended room leaves the pill; it reads NEXT SHOW again (" + s.pill.text + ")");

      /* ── 4. matches: faces, then the list; the badge ───────────── */
      D.swipe("u_jo", "u_dex", "like"); D.swipe("u_dex", "u_jo", "like");
      const m = D.matchOf("u_jo", "u_dex");
      await jo.page.evaluate(() => window.__lc.tabShow("matches"));
      await waitFor(() => jo.page.evaluate(() => document.querySelectorAll("#matches_new .mt-new__one").length === 1), 8000, "Dex in the new-match row");
      let mt = await jo.page.evaluate(() => ({ faces: [...document.querySelectorAll("#matches_new .mt-new__one")].map((b) => b.dataset.mid), rows: [...document.querySelectorAll("#matches_body .mt")].map((r) => r.dataset.mid),
        rowShown: !document.getElementById("matches_new").hidden, n: document.getElementById("matchesbtn").dataset.n, unread: document.getElementById("matchesbtn").classList.contains("has-unread") }));
      t.ok(mt.faces.length === 1 && mt.faces[0] === m.id && mt.rows.length === 0 && mt.rowShown, "a match with no messages is a face in NEW MATCHES and NOT in the list");
      t.ok(mt.n === "0" && !mt.unread, "nothing unread: no badge on 💬");
      await jo.page.evaluate(() => window.__lc.tabShow("swipe"));
      D.sendMessage("u_dex", m.id, "come sit Thursday");
      await waitFor(() => jo.page.evaluate(() => window.__lc.UNREAD === 1), 8000, "Jo's unread by realtime");
      await jo.page.evaluate(() => window.__lc.tabShow("matches"));
      await waitFor(() => jo.page.evaluate(() => document.querySelectorAll("#matches_body .mt").length === 1), 8000, "Dex moves to the list");
      mt = await jo.page.evaluate(() => ({ faces: document.querySelectorAll("#matches_new .mt-new__one").length, rows: [...document.querySelectorAll("#matches_body .mt")].map((r) => r.dataset.mid), rowShown: !document.getElementById("matches_new").hidden,
        last: document.querySelector("#matches_body .mt__last").textContent, n: document.getElementById("matchesbtn").dataset.n, unread: document.getElementById("matchesbtn").classList.contains("has-unread") }));
      t.ok(mt.faces === 0 && !mt.rowShown && mt.rows.length === 1 && mt.rows[0] === m.id && /come sit Thursday/.test(mt.last), "after a message the match is in the list, out of the row");
      t.ok(mt.n === "1" && mt.unread, "the 💬 cell shows UNREAD exactly as #matchesbtn did (has-unread, data-n=1)");
      await jo.page.evaluate(() => document.querySelector("#matches_body .mt").click());
      await waitFor(() => jo.page.evaluate(() => !document.getElementById("chat").hidden && window.__lc.CHAT_MATCH && window.__lc.CHAT_MATCH.id), 8000, "the chat sheet");
      t.ok(await jo.page.evaluate((id) => window.__lc.CHAT_MATCH.id === id, m.id), "a tap on the row opens the existing chat sheet on that match");
      await waitFor(() => jo.page.evaluate(() => window.__lc.UNREAD === 0 && !document.getElementById("matchesbtn").classList.contains("has-unread")), 8000, "mark_read clears the badge");
      t.ok(true, "…and reading it clears the badge");
      await jo.page.evaluate(() => window.__lc.closeChat());

      /* ── 5. you ────────────────────────────────────────────────── */
      await jo.page.evaluate(() => window.__lc.tabShow("you"));
      s = await state(jo);
      const you = await jo.page.evaluate(() => ({ name: document.getElementById("you_name").textContent, pct: document.getElementById("you_pct").textContent, vip: document.getElementById("vippill").textContent,
        me: (() => { const el = document.getElementById("mebtn"); const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.width > 60; })(),
        signout: getComputedStyle(document.getElementById("signout")).display !== "none", settings: getComputedStyle(document.getElementById("settingsbtn")).display !== "none" }));
      t.ok(s.active === "you" && s.you && /^Jo/.test(you.name) && /\d+% COMPLETE/.test(you.pct), "the You tab paints her name and completeness (" + you.name + " · " + you.pct + ")");
      t.ok(you.me && you.vip === "VIP · coming soon" && you.signout && you.settings, "own card, VIP pill, Settings and Sign out are on it");
      await jo.page.evaluate(() => document.getElementById("mebtn").click());
      await waitFor(() => jo.page.evaluate(() => !document.getElementById("profilecard").hidden && !!document.querySelector("#profilecard .pc__name")), 8000, "her own card");
      t.ok(await jo.page.evaluate(() => /Jo/.test(document.querySelector("#profilecard .pc__name").textContent)), "the avatar opens her own card (#profilecard, ME.id)");
      await jo.page.evaluate(() => window.__lc.closeProfile());
      await jo.page.evaluate(() => document.getElementById("you_edit").click());
      await waitFor(() => jo.page.evaluate(() => !document.getElementById("profileedit").hidden), 8000, "the editor");
      t.ok(true, "EDIT opens the profile editor");
      await jo.page.evaluate(() => window.__lc.closeProfileEditor());

      /* ── 6. deep links, back / forward ─────────────────────────── */
      const dl = await boot("deeplink", "u_sam", "#you");
      let d = await state(dl);
      t.ok(d.active === "you" && d.you && !d.swipe, "#you on load lands on the You tab");
      await dl.page.evaluate(() => window.__lc.tabShow("shows"));
      await dl.page.evaluate(() => window.__lc.tabShow("matches"));
      await dl.page.goBack(); await sleep(200);
      d = await state(dl);
      t.ok(d.active === "shows" && d.shows && d.hash === "#shows", "back → the Shows tab");
      await dl.page.goBack(); await sleep(200);
      d = await state(dl);
      t.ok(d.active === "you" && d.you, "back again → You");
      await dl.page.goForward(); await sleep(200);
      d = await state(dl);
      t.ok(d.active === "shows" && d.shows, "forward → Shows");
      const dl2 = await boot("deeplink2", "u_sam", "#shows");
      d = await state(dl2);
      t.ok(d.active === "shows" && d.shows && d.on[0] === "shows", "#shows on load lands on the Shows tab");

      /* sign out from the You tab */
      await jo.page.evaluate(() => window.__lc.tabShow("you"));
      await jo.page.evaluate(() => document.getElementById("signout").click());
      await jo.page.waitForSelector("#auth:not(.hide)", { timeout: 15000 });
      t.ok(await jo.page.evaluate(() => getComputedStyle(document.getElementById("tabbar")).display === "none"), "Sign out works from the You tab, and the bar is gone with the session");

      /* ── 7. quiet ─────────────────────────────────────────────── */
      for (const c of [jo, marla, dl, dl2]) t.ok(errsOf(c).length === 0, c.name + ": zero console errors — " + errsOf(c).join(" | "));
    } finally { await h.close(); }
  },
};
