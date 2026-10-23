/* GATE 99 — the deck: swipe, match, chat (feat/deck, PR D1 of the lobby
 * refresh; ruling Nick 10/21 21:00: "just like Tinder" — a lobby that is
 * never dead).
 *
 * THE SHAPE: the lobby carries THE DECK under LIVE NOW — the next cards
 * from deck_next (not me, not swiped, not blocked either way, mutual
 * seeking, my age window; Fan Favorites first), each one public_profile's
 * short card.  Right / ♥ = like, left / ✕ = pass, through swipe(); the
 * second like writes the match (the swipes trigger); IT'S A MATCH → Say hi
 * opens the thread; send_message writes, messages RLS reads, realtime
 * delivers; the 💬 badge is my unread count from my_matches.  Blocks
 * carry over: deck_next hides, send_message refuses.  Nothing here touches
 * a room, a chair, or the host's call.
 *
 * The claims, through the real DOM and window.__lc against index.html:
 *   S.  STATIC — the DDL is Studio-safe, guards on the 10/21 read-backs
 *       (lc_config 8ae9e8a3…, is_subscriber 4dbe1822…, public_profile
 *       239070f7…), every card is public_profile, the match is a trigger,
 *       messages join the realtime publication; the lobby markup carries
 *       the deck under LIVE NOW; no engine RPC is named by the deck code;
 *       both stamp sites agree
 *   1.  THE DECK — Jo's deck excludes Jo, the one she already swiped, the
 *       one she blocked, the one seeking only men (Jo is a woman), and the
 *       one outside her age window; Fan Favorite (most hearts) is on top;
 *       the top card paints name, age, stats; tapping its meta opens the
 *       full card
 *   2.  SWIPE — ♥ on Dex: swipe('like') is the RPC, a swipes row exists,
 *       no match yet (Dex hasn't swiped); ✕ on Theo: 'pass', never a
 *       match even when Theo likes her back; the deck advances
 *   3.  MATCH — Dex ♥'s Jo: the trigger writes ONE match (a<b), both
 *       phones get {matched:true}, Dex's phone shows IT'S A MATCH, Say hi
 *       opens the chat
 *   4.  CHAT — Dex sends; Jo's open thread receives it by realtime without
 *       a reload; Jo's badge was 1 unread before she opened it and 0 after
 *       (mark_read); a 1001-char body is refused; an outsider reads zero
 *       rows of that thread
 *   5.  BLOCK — Jo blocks Dex: send_message refuses both ways, the match
 *       drops off both lists, Dex is gone from Jo's deck
 *   6.  zero console errors in every window
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
  name: "deck",
  async run(t, ctx) {
    /* ── S. static ─────────────────────────────────────────────── */
    const ddl = fs.readFileSync(path.join(__dirname, "..", "DDL-deck.sql"), "utf8");
    const live = ddl.replace(/^--.*$/gm, "");
    const tags = [...live.matchAll(/\$[a-zA-Z_]+\$/g)].map((m) => m[0]);
    t.ok(tags.length === 0, "the DDL is Studio-safe: only $$ (" + tags.join(",") + ")");
    t.ok(/8ae9e8a3c39bb23bb3c83f7848dcd600/.test(live) && /4dbe1822920a3c8c0eda368f4ca255b8/.test(live) && /239070f77a0faac41b7d382d2cb15eb2/.test(live),
      "guards on the 10/21 read-backs: lc_config 8ae9e8a3…, is_subscriber 4dbe1822…, public_profile 239070f7…");
    t.ok(/jsonb_agg\(public\.public_profile\(c\.id\)/.test(live) && /'other', public\.public_profile\(/.test(live), "every card in the deck and the match list is public_profile — the ONE read path");
    t.ok(/create trigger swipes_match after insert or update on public\.swipes/.test(live) && /insert into public\.matches \(a, b\) values \(p\.a, p\.b\) on conflict \(a, b\) do nothing/.test(live), "the match is written by the swipes trigger, once per pair");
    t.ok(/alter publication supabase_realtime add table public\.messages/.test(live), "messages join the realtime publication");
    t.ok(/raise exception 'blocked'/.test(live) && (live.match(/user_blocks/g) || []).length >= 4, "swipe, send_message, deck_next and my_matches all honour user_blocks");
    t.ok(/grant select on table public\.swipes to authenticated;\s+-- writes go through swipe\(\)/.test(live) && !/grant (insert|update|delete)[^;]*public\.(swipes|matches|messages)/.test(live), "no client writes any of the three tables directly");
    const lobby = (ctx.html.match(/<div id="lobby"[\s\S]*?<\/div>\s*<!-- ROOM/) || [""])[0];
    const swipe = (ctx.html.match(/<section class="tabpane" id="tab_swipe"[\s\S]*?<\/section>/) || [""])[0];
    t.ok(lobby.indexOf('id="roomlist"') > 0 && swipe.indexOf('id="deck_stack"') > 0, "the deck IS the Swipe tab — HOME (THE TABS, D4); LIVE NOW is on the Shows tab");
    const deckJs = (ctx.html.match(/let DECK=\[\][\s\S]*?try\{ deckInit\(\); \}/) || [""])[0];
    t.ok(deckJs.length > 2000 && !/ask_question|seat_member|keep_member|pass_member|decide_keep|join_line|start_show|engine_|throw_at/.test(deckJs), "the deck code names no engine RPC — it never touches a room or her call");
    t.ok(/sb\.rpc\("swipe"/.test(deckJs) && /sb\.rpc\("deck_next"/.test(deckJs) && /sb\.rpc\("send_message"/.test(deckJs) && /sb\.rpc\("my_matches"/.test(deckJs), "swipe / deck_next / send_message / my_matches are the deck's four doors");
    t.ok(new Set([ctx.html.match(/id="buildstamp">(b\d{4}\.\d{4})</)[1], ctx.html.match(/\[lastcall\] build (b\d{4}\.\d{4})/)[1]]).size === 1, "both stamp sites agree");

    /* ── runtime ───────────────────────────────────────────────── */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const errsOf = (c) => c.errors.filter((e) => !/favicon|storage\/v1\/object/.test(e));
      const mk = (id, name, gender, seeking, bday) => { D.addUser({ id, name, gender, seeking }); const p = D.profiles.get(id); p.birthdate = bday; p.created_at = D.iso(); return id; };
      mk("u_jo", "Jo", "woman", "men", "1992-05-05");            // the swiper: a woman seeking men, 18–99
      mk("u_dex", "Dex", "man", "women", "1994-03-09");          // Fan Favorite: 7 hearts
      mk("u_theo", "Theo", "man", "everyone", "1990-01-01");
      mk("u_sam", "Sam", "man", "women", "1991-01-01");           // already swiped by Jo
      mk("u_blk", "Blocked Bob", "man", "women", "1991-01-01");   // Jo blocked him
      mk("u_gay", "Gabe", "man", "men", "1991-01-01");            // seeking men only — not seeking Jo
      mk("u_old", "Walt", "man", "women", "1950-01-01");          // outside Jo's window
      mk("u_out", "Outsider", "man", "women", "1993-01-01");      // never matched: must read nothing
      D.profiles.get("u_jo").seek_min = 25; D.profiles.get("u_jo").seek_max = 45;
      const rm = D.addRoom({ id: "r_x", host_id: "u_theo", name: "x", status: "ended" });
      for (let i = 0; i < 7; i++) D.pushEvent(rm, "u_jo", "heart", { target: "u_dex" });
      D.swipes.set("u_jo|u_sam", { swiper: "u_jo", target: "u_sam", dir: "like", created_at: D.iso(), updated_at: D.iso() });
      D.blocks.push({ blocker: "u_jo", blocked: "u_blk" });

      const boot = async (name, uid) => { const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 15000 });
        await waitFor(() => c.page.evaluate(() => window.__lc.DECK && document.querySelector("#deck_stack .deck__card, #deck_stack .deck__empty")), 8000, name + ": the deck"); return c; };

      /* ── 1. the deck ───────────────────────────────────────────── */
      const jo = await boot("jo", "u_jo");
      const ids = await jo.page.evaluate(() => window.__lc.DECK.map((c) => c.id));
      t.ok(!ids.includes("u_jo") && !ids.includes("u_sam") && !ids.includes("u_blk") && !ids.includes("u_gay") && !ids.includes("u_old"),
        "Jo's deck excludes herself, the one she swiped, the one she blocked, the one not seeking her, the one outside her window (" + ids.join(",") + ")");
      t.ok(ids.includes("u_dex") && ids.includes("u_theo") && ids.includes("u_out"), "…and holds the three who fit");
      t.ok(ids[0] === "u_dex", "the Fan Favorite (7 hearts) is on top (" + ids[0] + ")");
      const top = await jo.page.evaluate(() => { const c = document.querySelector("#deck_stack .deck__card.is-top"); return { uid: c.dataset.uid, name: c.querySelector(".deck__name").textContent, stats: c.querySelector(".deck__stats").textContent, kicker: c.querySelector(".deck__kicker").textContent }; });
      t.ok(top.uid === "u_dex" && /Dex/.test(top.name) && new RegExp(String(D.ageOf("1994-03-09"))).test(top.name) && /7hearts/.test(top.stats) && /Fan Favorite/.test(top.kicker),
        "the top card paints Dex, his age, 7 hearts, FAN FAVORITE — " + JSON.stringify(top));
      await jo.page.evaluate(() => document.querySelector("#deck_stack .deck__card.is-top .deck__meta").click());
      await waitFor(() => jo.page.evaluate(() => !!document.querySelector("#profilecard .pc__name")), 8000, "the full card from the deck");
      t.ok(true, "tapping the card's meta opens his full contestant card");
      await jo.page.evaluate(() => window.__lc.closeProfile());

      /* ── 2. swipe ──────────────────────────────────────────────── */
      const r1 = await jo.page.evaluate(() => window.__lc.deckSwipe("like"));
      t.ok(r1 && r1.dir === "like" && r1.matched === false && D.swipes.get("u_jo|u_dex") && D.swipes.get("u_jo|u_dex").dir === "like", "♥ on Dex: a like row on the server, no match yet");
      await waitFor(() => jo.page.evaluate(() => !window.__lc.DECK_BUSY && window.__lc.DECK[0] && window.__lc.DECK[0].id !== "u_dex"), 5000, "the deck advances");
      const nextTop = await jo.page.evaluate(() => window.__lc.DECK[0].id);
      const r2 = await jo.page.evaluate(() => window.__lc.deckSwipe("pass"));
      t.ok(r2 && r2.dir === "pass" && D.swipes.get("u_jo|" + nextTop).dir === "pass", "✕ on " + nextTop + ": a pass row");
      D.swipe(nextTop, "u_jo", "like");
      t.ok(!D.matchOf("u_jo", nextTop), "a pass never becomes a match, even when he likes her back");

      /* ── 3. match ──────────────────────────────────────────────── */
      const dex = await boot("dex", "u_dex");
      const dexIds = await dex.page.evaluate(() => window.__lc.DECK.map((c) => c.id));
      t.ok(dexIds.includes("u_jo"), "Jo is in Dex's deck (" + dexIds.join(",") + ")");
      await waitFor(() => dex.page.evaluate(() => !window.__lc.DECK_BUSY), 5000, "dex idle");
      await dex.page.evaluate(() => { const i = window.__lc.DECK.findIndex((c) => c.id === "u_jo"); if (i > 0) { const [c] = window.__lc.DECK.splice(i, 1); window.__lc.DECK.unshift(c); window.__lc.deckRender(); } });
      const r3 = await dex.page.evaluate(() => window.__lc.deckSwipe("like"));
      const m = D.matchOf("u_jo", "u_dex");
      t.ok(r3 && r3.matched === true && m && r3.match_id === m.id && m.a < m.b && D.matches.filter((x) => x.a === m.a && x.b === m.b).length === 1, "Dex ♥'s Jo: ONE match, a<b, both ids in the RPC's answer");
      await waitFor(() => dex.page.evaluate(() => document.getElementById("deck_match").classList.contains("show")), 5000, "IT'S A MATCH");
      t.ok(await dex.page.evaluate(() => /IT'S A MATCH/.test(document.getElementById("deck_match").textContent) && /Jo/.test(document.getElementById("deck_match").textContent)), "Dex's phone shows IT'S A MATCH with Jo");
      await dex.page.evaluate(() => document.getElementById("deck_sayhi").click());
      await waitFor(() => dex.page.evaluate(() => !document.getElementById("chat").hidden && window.__lc.CHAT_MATCH), 5000, "the chat opens");
      t.ok(await dex.page.evaluate((id) => window.__lc.CHAT_MATCH.id === id && document.getElementById("chat_name").textContent === "Jo", m.id), "Say hi opens the thread with Jo");

      /* ── 4. chat ───────────────────────────────────────────────── */
      await dex.page.evaluate(() => { document.getElementById("chat_input").value = "hey — you were great on the bench"; return window.__lc.chatSend(); });
      t.ok(D.messages.length === 1 && D.messages[0].sender === "u_dex" && D.messages[0].match_id === m.id, "send_message wrote the row");
      await jo.page.evaluate(() => window.__lc.matchesRefresh());
      await waitFor(() => jo.page.evaluate(() => window.__lc.UNREAD === 1), 5000, "Jo's unread badge");
      t.ok(await jo.page.evaluate(() => document.getElementById("matchesbtn").dataset.n === "1" && document.getElementById("matchesbtn").classList.contains("has-unread")), "Jo's 💬 shows 1 unread");
      await jo.page.evaluate((id) => window.__lc.openChat(id, { id: "u_dex", display_name: "Dex" }), m.id);
      await waitFor(() => jo.page.evaluate(() => document.querySelectorAll("#chat_log .bub").length === 1), 5000, "Jo's thread loads");
      await waitFor(() => jo.page.evaluate(() => window.__lc.UNREAD === 0), 5000, "mark_read clears the badge");
      t.ok(true, "opening the thread marks it read (badge 0)");
      await dex.page.evaluate(() => { document.getElementById("chat_input").value = "second one, live"; return window.__lc.chatSend(); });
      await waitFor(() => jo.page.evaluate(() => document.querySelectorAll("#chat_log .bub").length === 2), 5000, "realtime delivery to Jo");
      t.ok(await jo.page.evaluate(() => /second one, live/.test(document.querySelector("#chat_log .bub:last-child").textContent)), "Jo's open thread received Dex's message by realtime, no reload");
      const tooLong = await jo.page.evaluate(() => { document.getElementById("chat_input").value = "x".repeat(1001); return window.__lc.chatSend(); });
      t.ok(tooLong === false && D.messages.length === 2, "a 1001-char body is refused");
      const outsider = await h.newClient("out"); outsider.login("u_out"); await outsider.goto();
      await outsider.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 15000 });
      const peek = await outsider.page.evaluate(async (id) => { const { data } = await window.__lc.sb.from("messages").select("*").eq("match_id", id); return (data || []).length; }, m.id);
      t.ok(peek === 0, "an outsider reads zero rows of the thread (RLS)");

      /* ── 5. block ──────────────────────────────────────────────── */
      await jo.page.evaluate(() => window.__lc.closeChat());
      await jo.page.evaluate(() => window.__lc.blockUser("u_dex"));
      const blockedSend = await dex.page.evaluate(() => { document.getElementById("chat_input").value = "still there?"; return window.__lc.chatSend(); });
      t.ok(blockedSend === false && D.messages.length === 2, "after Jo blocks Dex, Dex's send is refused");
      let joSend = null; try { D.sendMessage("u_jo", m.id, "x"); } catch (e) { joSend = e.message; }
      t.ok(joSend === "blocked", "…and so is Jo's (both ways)");
      const lists = await Promise.all([jo.page.evaluate(async () => (await window.__lc.matchesRefresh()).length), dex.page.evaluate(async () => (await window.__lc.matchesRefresh()).length)]);
      t.ok(lists[0] === 0 && lists[1] === 0, "the match is off both lists (" + lists.join("/") + ")");
      await jo.page.evaluate(() => window.__lc.deckLoad(true));
      const after = await jo.page.evaluate(() => window.__lc.DECK.map((c) => c.id));
      t.ok(!after.includes("u_dex"), "Dex is gone from Jo's deck");

      /* ── 6. quiet ──────────────────────────────────────────────── */
      for (const c of [jo, dex, outsider]) t.ok(errsOf(c).length === 0, c.name + ": zero console errors — " + errsOf(c).join(" | "));
    } finally { await h.close(); }
  },
};
