/* GATE 97 — profiles: the Tinder set and its interface with the game
 * (feat/profiles-tinder, PR C of the 10/20–10/21 brief; ruling Nick 10/21:
 * "full go — Tinder's architecture, and an interesting interface between the
 * profiles and the game").
 *
 * THE SHAPE: six photos (storage bucket profile-photos, <uid>/<n>.jpg, [0]
 * primary), bio ≤500, city, pronouns, details chips, interests ≤5 of a
 * curated list, three prompts — and the prompts ARE questions in a real
 * deck ("From his profile"), so the host asks from his profile through the
 * untouched ask_question.  Another person's card is read ONLY through
 * public_profile(uid): age, never birthdate; stats computed on the server;
 * the full card for the owner, under profiles_open_to_all (the soft-launch
 * switch), for the host of a live room he is seated in, or (PR B) a
 * subscriber.  Blocking is both ways and masks, never thins the roster.
 *
 * The claims, through the real DOM and window.__lc against index.html:
 *   S.  STATIC — the DDL is Studio-safe (one level of $$, no nested
 *       dollar-quote tags), guards on nothing it overwrites, carries the
 *       seven columns + their CHECKs, 20 prompts, the bucket and its four
 *       policies, and reads is_subscriber only if it exists; index.html
 *       reads another person's card through public_profile alone (no
 *       birthdate read for anyone but the owner), both stamp sites bumped
 *   1.  MY CARD — the editor saves the Tinder set to the row; the double
 *       enforces the DDL's CHECKs (a 6th interest is refused on the phone
 *       before the server would); completeness math is the page's own
 *   2.  PHOTOS — a write to my folder lands; a write to another folder is
 *       the storage policy's refusal
 *   3.  THE CONTESTANT CARD — the crowd taps a chair's name chip: the card
 *       shows his AGE (the gated value, never the date), stats first, bio,
 *       prompts; no birthdate string anywhere on the sheet.  With
 *       profiles_open_to_all off, the crowd gets the short card and the
 *       VIP note; the host still gets her seated chair's full card
 *   4.  THE BENCH IS BLIND — the host cannot open a bench card; the crowd
 *       can; the bench is a `line` row
 *   5.  BLOCK, BOTH WAYS — A blocks B: B is "Blocked" and faceless in A's
 *       profs, B's room is off A's lobby, and B's read of A's card is
 *       {blocked}; the roster is NOT thinned (the chair count is unchanged)
 *   6.  SHE ASKS FROM HIS PROMPTS — the drawer opens on "<NAME>'S PROMPTS"
 *       with his three answered prompts as question cards; tapping one is
 *       an ordinary ask_question with that question's id; the spotlight
 *       card then shows "He wrote: …" under the question, for the crowd too
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
  name: "profiles",
  async run(t, ctx) {
    /* ── S. static ─────────────────────────────────────────────── */
    const ddl = fs.readFileSync(path.join(__dirname, "..", "DDL-profiles.sql"), "utf8");
    const live = ddl.replace(/^--.*$/gm, "");   // the commented preflight/read-back/undo carry $$ in prose
    const tags = [...live.matchAll(/\$[a-zA-Z_]+\$/g)].map((m) => m[0]);
    t.ok(tags.length === 0, "the DDL is Studio-safe: no tagged dollar-quotes, only $$ (" + tags.join(",") + ")");
    t.ok(/do \$\$[\s\S]*?end \$\$;/.test(live), "the guard block is a plain $$ DO block");
    /* bio already existed in production (the 2026-10-21 preflight, docs #127): the file adds six and CHECKs seven */
    ["city", "pronouns", "details", "interests", "prompts", "photos"].forEach((c) =>
      t.ok(new RegExp("add column " + c + "\\s").test(live), "adds profiles." + c));
    t.ok(!/add column bio\s/.test(live) && /char_length\(bio\) > 500/.test(live), "bio is not added (production had it) — guarded for length before its CHECK goes on");
    t.ok(/char_length\(bio\) <= 500/.test(live) && /cardinality\(interests\) <= 5/.test(live) && /jsonb_array_length\(prompts\) <= 3/.test(live) && /cardinality\(photos\) <= 6/.test(live),
      "the CHECKs: bio 500, interests 5, prompts 3, photos 6");
    const prompts = (live.match(/foreach t in array array\[([\s\S]*?)\] loop/) || ["", ""])[1].match(/'(?:[^']|'')*'/g) || [];
    t.ok(prompts.length === 20, "20 prompts in the From his profile deck (" + prompts.length + ")");
    t.ok(/insert into storage\.buckets[\s\S]*?'profile-photos'/.test(live) && (live.match(/create policy "profile-photos /g) || []).length === 4, "the bucket and its four policies");
    t.ok(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(live), "writes are owner-folder only");
    t.ok(/to_regprocedure\('public\.is_subscriber\(uuid\)'\) is not null/.test(live), "is_subscriber is consulted only if PR B has created it");
    t.ok(/'profiles_open_to_all', 'true'::jsonb/.test(live), "profiles_open_to_all starts TRUE (soft launch)");
    /* the guard never looks at a column this file overwrites: it checks for ABSENCE of the new columns, nothing about their values */
    t.ok(!/profiles where .*(bio|city|prompts|photos) (=|<>)/.test(live), "no guard on a value this file writes");
    t.ok(/lc_config md5 is %, expected 18c19ce96c662a68bc82e327a14f5df4/.test(live) && /lc_pack_status md5 is %, expected 51d7be429e260c1ad5ff92fd25704165/.test(live),
      "guards on the 2026-10-21 read-backs (lc_config 18c19ce9…, lc_pack_status 51d7be42…)");
    /* the page: another person's card is public_profile's, never a profiles read that could carry birthdate */
    const cardJs = (ctx.html.match(/async function openProfile\(uid\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(/publicProfile\(uid/.test(cardJs) && !/from\("profiles"\)/.test(cardJs), "openProfile reads through public_profile only");
    const rcJs = (ctx.html.match(/function renderProfileCard\(p\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(rcJs.length > 0 && !/birthdate/.test(rcJs), "the card never paints a birthdate");
    t.ok(/AMHOST && uid!==ME\.id && r && r!=="chair" && r!=="kept" && r!=="host"/.test(cardJs), "the host is refused any card that is not a chair / kept / host (the bench is blind)");
    const stamps = ctx.html.match(/b\d{4}\.\d{4}/g) || [];
    t.ok(new Set([ctx.html.match(/id="buildstamp">(b\d{4}\.\d{4})</)[1], ctx.html.match(/\[lastcall\] build (b\d{4}\.\d{4})/)[1]]).size === 1, "both stamp sites agree (" + stamps.slice(-1) + ")");

    /* ── runtime ───────────────────────────────────────────────── */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const errsOf = (c) => c.errors.filter((e) => !/favicon|storage\/v1\/object/.test(e));
      /* the room: Marla hosts; Dex, Theo in chairs; Rafi on the bench (line); Jo in the crowd */
      D.addUser({ id: "u_marla", name: "Marla" });
      D.addUser({ id: "u_dex", name: "Dex" }); D.profiles.get("u_dex").birthdate = "1994-03-09";
      D.addUser({ id: "u_theo", name: "Theo" });
      D.addUser({ id: "u_rafi", name: "Rafi" });
      D.addUser({ id: "u_jo", name: "Jo" });
      const rm = D.addRoom({ id: "r_prof", host_id: "u_marla", name: "Marla's Room", phase: "spotlight", round: 1 });
      D.rooms.get(rm).phase_deadline = D.iso(D.now() + 3_000_000);
      D.addMember(rm, "u_dex", "chair", { seat_index: 0 });
      D.addMember(rm, "u_theo", "chair", { seat_index: 1 });
      D.addMember(rm, "u_rafi", "line", { line_position: 1 });
      D.addMember(rm, "u_jo", "spectator");
      /* Dex's hearts and a past KEEP, so stats have something to say */
      for (let i = 0; i < 7; i++) D.pushEvent(rm, "u_jo", "heart", { target: "u_dex" });
      D.addRoom({ id: "r_old", host_id: "u_marla", name: "Last week", status: "ended" }); D.rooms.get("r_old").winner_id = "u_dex";
      D.addMember("r_old", "u_dex", "kept", { seat_index: 0 });

      const boot = async (name, uid, inRoom = true) => {
        const c = await h.newClient(name); c.login(uid);
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (inRoom) {
          if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
            await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rm) });
          await c.page.waitForSelector("#room.show", { timeout: 10000 });
          await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_dex"), 8000, name + ": chairs render");
        }
        return c;
      };

      /* ── 1. my card ────────────────────────────────────────────── */
      const dex = await boot("dex", "u_dex");
      await dex.page.evaluate(() => window.__lc.openProfileEditor());
      await waitFor(() => dex.page.evaluate(() => !!document.getElementById("pe_save")), 8000, "the editor");
      const deck = await dex.page.evaluate(() => window.__lc.PROMPT_DECK);
      t.ok(Array.isArray(deck) && deck.length === 20, "the editor loaded the 20 prompts from the From his profile deck (" + (deck && deck.length) + ")");
      const sixth = await dex.page.evaluate(() => {
        document.getElementById("pe_city").value = "Portland";
        document.getElementById("pe_bio").value = "Pedal steel on weeknights. Karaoke on purpose.";
        const chips = [...document.querySelectorAll("#pe_interests [data-int]")];
        chips.slice(0, 6).forEach((b) => b.click());   // the sixth is refused on the phone
        return window.__lc.PE.interests.length;
      });
      t.ok(sixth === 5, "a sixth interest is refused on the phone (" + sixth + " kept)");
      await dex.page.evaluate((deck) => {
        /* the editor re-rendered on each chip; set the texts again, then the three prompts */
        document.getElementById("pe_city").value = "Portland";
        document.getElementById("pe_bio").value = "Pedal steel on weeknights. Karaoke on purpose.";
        [...document.querySelectorAll("[data-pi]")].forEach((s, i) => { s.value = String(deck[i].id); });
        [...document.querySelectorAll("[data-pa]")].forEach((s, i) => { s.value = ["two whiskeys and a long goodbye", "the bench has better jokes", "anything by Sturgill"][i]; });
      }, deck);
      const saved = await dex.page.evaluate(() => window.__lc.profileSave());
      t.ok(saved === true, "the editor saved");
      const row = D.profiles.get("u_dex");
      t.ok(row.city === "Portland" && /Pedal steel/.test(row.bio) && row.interests.length === 5 && row.prompts.length === 3 && row.prompts[0].q === deck[0].id && /whiskeys/.test(row.prompts[0].a),
        "the row carries the Tinder set: city, bio, 5 interests, 3 prompts with question ids — " + JSON.stringify({ city: row.city, n: row.interests.length, p: row.prompts.length }));
      const pct = await dex.page.evaluate(() => window.__lc.profileCompleteness({ photos: [], bio: "x", city: "y", interests: [1, 2, 3], prompts: [{ a: "a" }, { a: "b" }, { a: "c" }], details: {} }));
      t.ok(pct === 65, "completeness: bio 20 + city 10 + interests 15 + prompts 20 = 65 without photos (" + pct + ")");
      const over = await dex.page.evaluate(() => window.__lc.profileValidate({ display_name: "Dex", bio: "x".repeat(501), interests: [], prompts: [], photos: [] }));
      t.ok(/over 500/.test(over || ""), "a 501-char bio is refused on the phone");
      let threw = null;
      try { D.table("dex", { table: "profiles", action: "update", values: { id: "u_dex", interests: [1, 2, 3, 4, 5, 6] }, filters: [{ type: "eq", col: "id", val: "u_dex" }] }); } catch (e) { threw = e.message; }
      t.ok(/profiles_interests_max/.test(threw || ""), "the double enforces the DDL's CHECK on interests (" + threw + ")");

      /* ── 2. photos ─────────────────────────────────────────────── */
      const up = await dex.page.evaluate(async () => {
        const blob = new Blob([new Uint8Array(1200)], { type: "image/jpeg" });
        const mine = await window.__lc.sb.storage.from("profile-photos").upload("u_dex/1.jpg", blob, { contentType: "image/jpeg" });
        const theirs = await window.__lc.sb.storage.from("profile-photos").upload("u_theo/1.jpg", blob, { contentType: "image/jpeg" });
        return { mine: !mine.error, theirs: theirs.error && theirs.error.message, raw: JSON.stringify(theirs) };
      });
      t.ok(up.mine === true && D.storage.has("profile-photos/u_dex/1.jpg"), "a write to my own folder lands in the bucket");
      t.ok(/row-level security/.test(up.theirs || ""), "a write to another person's folder is the policy's refusal (" + up.theirs + " " + up.raw + ")");
      D.profiles.get("u_dex").photos = ["u_dex/1.jpg"];

      /* ── 3. the contestant card ────────────────────────────────── */
      const jo = await boot("jo", "u_jo");
      await jo.page.evaluate(() => document.querySelector("#rt_seat0 .chair__name").click());
      await waitFor(() => jo.page.evaluate(() => !!document.querySelector("#profilecard .pc__name")), 8000, "Dex's card for Jo");
      const card = await jo.page.evaluate(() => {
        const b = document.getElementById("pc_body");
        return { text: b.textContent, age: (b.querySelector(".pc__age") || {}).textContent, stats: [...b.querySelectorAll(".pc__stat b")].map((x) => x.textContent),
          prompts: b.querySelectorAll(".pc__prompt").length, locked: !!b.querySelector(".pc__locked"), order: [b.innerHTML.indexOf("pc__stats"), b.innerHTML.indexOf("pc__bio")] };
      });
      const age = D.ageOf("1994-03-09");
      t.ok(card.age === String(age), "the card shows his AGE, computed on the server (" + card.age + ")");
      t.ok(!/1994/.test(card.text), "no birthdate anywhere on the sheet");
      t.ok(card.stats.join(",") === "7,2,1,0", "stats first: 7 hearts, 2 shows, 1 KEEP, 0 hosted (" + card.stats.join(",") + ")");
      t.ok(card.order[0] < card.order[1], "stats are painted ABOVE the bio (the contestant card, not a dating profile)");
      t.ok(card.prompts === 3 && !card.locked, "open to all: the three prompts show and nothing is locked");
      /* the switch: full cards become a perk — the crowd gets the short card, the host still gets her seated chair */
      D.settings.set("profiles_open_to_all", false);
      await jo.page.evaluate(async () => { window.__lc.closeProfile(); await window.__lc.lcConfigLoad(); });
      t.ok((await jo.page.evaluate(() => window.__lc.PROFILE_OPEN_TO_ALL)) === false, "lc_config carries the switch to the phone");
      await jo.page.evaluate(() => window.__lc.openProfile("u_dex"));
      await waitFor(() => jo.page.evaluate(() => !!document.querySelector("#profilecard .pc__locked")), 8000, "the short card");
      const short = await jo.page.evaluate(() => ({ prompts: document.querySelectorAll("#pc_body .pc__prompt").length, age: !!document.querySelector("#pc_body .pc__age"), stats: document.querySelectorAll("#pc_body .pc__stat").length }));
      t.ok(short.prompts === 0 && short.age && short.stats === 4, "switch off: the crowd's card keeps age + stats + bio, drops prompts, shows the VIP note");
      const marla = await boot("marla", "u_marla");
      const hostView = await marla.page.evaluate(async () => { await window.__lc.openProfile("u_dex"); return document.querySelectorAll("#pc_body .pc__prompt").length; });
      t.ok(hostView === 3, "the host still reads her seated chair's full card with the switch off (" + hostView + ")");
      D.settings.set("profiles_open_to_all", true);
      await marla.page.evaluate(async () => { window.__lc.closeProfile(); await window.__lc.lcConfigLoad(); });
      await jo.page.evaluate(() => window.__lc.lcConfigLoad());

      /* ── 4. the bench is blind ─────────────────────────────────── */
      const blind = await marla.page.evaluate(() => window.__lc.openProfile("u_rafi"));
      const blindToast = await marla.page.evaluate(() => document.getElementById("toast").textContent);
      t.ok(blind === false && /picks blind/.test(blindToast), "the host cannot open a bench card (" + blindToast + ")");
      const seen = await jo.page.evaluate(() => { window.__lc.closeProfile(); return window.__lc.openProfile("u_rafi"); });
      t.ok(seen === true, "the crowd can");
      await jo.page.evaluate(() => window.__lc.closeProfile());

      /* ── 5. block, both ways ───────────────────────────────────── */
      const theo = await boot("theo", "u_theo");
      D.addRoom({ id: "r_theo", host_id: "u_theo", name: "Theo hosts" });
      const before = await jo.page.evaluate(() => window.__lc.ROOM_STATE.members.filter((m) => m.role === "chair").length);
      await jo.page.evaluate(() => window.__lc.blockUser("u_theo"));
      await jo.page.evaluate(() => window.__lc.loadRoomState());
      await waitFor(() => jo.page.evaluate(() => (window.__lc.ROOM_STATE.profs["u_theo"] || {}).display_name === "Blocked"), 8000, "the mask");
      const after = await jo.page.evaluate(() => ({ chairs: window.__lc.ROOM_STATE.members.filter((m) => m.role === "chair").length, name: document.querySelector("#rt_seat1 .chair__name-t").textContent, face: window.__lc.ROOM_STATE.profs["u_theo"].face_json }));
      t.ok(after.chairs === before && before === 2, "the roster is NOT thinned by a block (" + before + " → " + after.chairs + " chairs)");
      t.ok(/Blocked/.test(after.name) && after.face === null, "Theo is nameless and faceless to Jo (" + after.name + ")");
      t.ok(D.blocks.some((b) => b.blocker === "u_jo" && b.blocked === "u_theo"), "the block is a server row");
      const theirs = await theo.page.evaluate(async () => { await window.__lc.blocksLoad(); const p = await window.__lc.publicProfile("u_jo", true); return { blocked: p && p.blocked, by: [...window.__lc.BLOCKS.blocked_by] }; });
      t.ok(theirs.blocked === true && theirs.by.includes("u_jo"), "and the other way: Theo's read of Jo is {blocked}, Jo is in his blocked_by");
      const lobbyJo = await boot("jo2", "u_jo", false);
      await lobbyJo.page.evaluate(() => window.__lc.loadRooms());
      await waitFor(() => lobbyJo.page.evaluate(() => document.querySelectorAll("#rooms .roomcard, .roomlist .roomcard").length >= 1), 8000, "Jo's lobby");
      const lobby = await lobbyJo.page.evaluate(() => [...document.querySelectorAll(".roomcard")].map((c) => c.textContent).join(" | "));
      t.ok(/Marla/.test(lobby) && !/Theo hosts/.test(lobby), "Theo's room is off Jo's lobby; Marla's is on it");
      await lobbyJo.close();

      /* ── 6. she asks from his prompts ──────────────────────────── */
      await marla.page.evaluate(() => window.__lc.egOpenDrawer("u_dex"));
      await waitFor(() => marla.page.evaluate(() => !!document.querySelector('#eg_tabs .lc-drawer__tab[data-deck="prompts"]')), 8000, "the prompts tab");
      const drawer = await marla.page.evaluate(() => {
        const tabs = [...document.querySelectorAll("#eg_tabs .lc-drawer__tab")];
        return { first: tabs[0].textContent, selected: tabs[0].getAttribute("aria-selected"), cards: [...document.querySelectorAll("#eg_qlist .lc-qcard")].map((c) => ({ q: c.dataset.q, text: c.textContent })) };
      });
      t.ok(/DEX'S PROMPTS/.test(drawer.first) && drawer.selected === "true", "the drawer opens on DEX'S PROMPTS (" + drawer.first + ")");
      t.ok(drawer.cards.length === 3 && drawer.cards.every((c, i) => String(c.q) === String(deck[i].id)) && /whiskeys/.test(drawer.cards[0].text), "his three answered prompts are the question cards, with his answers");
      const askedBefore = D.rpcLog.filter((r) => r.name === "ask_question").length;
      await marla.page.evaluate(() => document.querySelector("#eg_qlist .lc-qcard").click());
      await waitFor(() => D.rpcLog.filter((r) => r.name === "ask_question").length > askedBefore, 8000, "the ask");
      const ask = D.rpcLog.filter((r) => r.name === "ask_question").slice(-1)[0];
      t.ok(ask.clientId === "marla" && String(ask.args.question_id) === String(deck[0].id) && ask.args.target === "u_dex", "tapping it is an ordinary ask_question with the prompt's question id");
      await waitFor(() => jo.page.evaluate(() => document.getElementById("eg_qanswer").style.display === "block"), 10000, "the crowd's spotlight answer");
      const spot = await jo.page.evaluate(() => ({ q: document.getElementById("eg_qtext").textContent, a: document.getElementById("eg_qanswer").textContent }));
      t.ok(spot.q === deck[0].text && /He wrote: “two whiskeys/.test(spot.a), "the spotlight shows what he WROTE under what she ASKED, for the crowd (" + spot.a + ")");

      /* ── 7. quiet ──────────────────────────────────────────────── */
      for (const c of [dex, jo, marla, theo]) t.ok(errsOf(c).length === 0, c.name + ": zero console errors — " + errsOf(c).join(" | "));
    } finally { await h.close(); }
  },
};
