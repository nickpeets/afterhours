/* GATE 98 — subscription-scaffold: the entitlement layer under Fun & Money
 * (feat/subscription-scaffold — PR B of the 10/20–10/21 brief; the model is
 * docs/fun-and-money.md, the server is tools/DDL-subscription.sql).
 *
 * Nick's ruling 2: Last Call is also a subscription app.  A subscription
 * buys convenience and status — never a tier, a chip, a heart or the host's
 * choice.  No prices, no billing, no shop in this PR: is_subscriber(uid) is
 * THE one hook, the ration x2 is enforced by the server through
 * throw_limits(), and the lobby carries one "VIP · coming soon" pill.
 *
 * THE DDL is handed to Nick; its STATUS line says whether production has run
 * it.  The double MODELS it — the two columns, the guard, is_subscriber,
 * comp_subscription (Studio-only), throw_limits() per caller — so every claim
 * below is "the client against the server as that file leaves it".
 *
 * The claims, through window.__lc, the page's sb and the real DOM:
 *   S.  STATIC: the DDL file guards on the five 10/20–10/21 read-backs, is
 *       Studio-safe (one level of $$, no tagged dollar-quotes, no guard on a
 *       column it writes), renames throw_limits to throw_limits_base and
 *       wraps it x2, seals comp_subscription from the API roles and
 *       is_subscriber from anon, and does NOT replace lc_config (PR C's);
 *       docs/fun-and-money.md carries the four hard rules; the page calls
 *       is_subscriber from exactly one site, never multiplies a ration
 *       itself, keeps the base THROWABLES numbers, and carries no pricing
 *       copy anywhere
 *   1.  A PLAIN USER: the lobby pill reads "VIP · coming soon", lcSubscriber
 *       is false, every perk is false; in the crowd his tray reads the base
 *       ration (5 · 2) and the server refuses his THIRD jeer — a
 *       non-subscriber cannot exceed the base ration
 *   2.  A COMPED USER: the pill reads "VIP", every perk is true, the tray
 *       reads 10 · 4 from throw_counts (the server's numbers, not the
 *       phone's arithmetic), his third and fourth jeers land and the fifth
 *       is refused — the comped account passes every perk check
 *   3.  EXPIRED: a comp whose subscription_until has passed reads 'none' on
 *       the server and false on the phone at the next read; the ration is
 *       the base again
 *   4.  THE GUARD: a client's own direct write to profiles.subscription /
 *       subscription_until is refused with the trigger's words; a rename
 *       through the same door still passes; the comp RPC is permission
 *       denied for a signed-in client
 *   5.  zero console errors
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");
const { THROW_LIMITS, SUB_GUARD_MSG, RATION_MULT } = require("../lib/backend-double");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};

const PILL = () => {
  const el = document.getElementById("vippill");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { text: el.textContent, on: el.classList.contains("is-on"), shown: getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0,
    inLobby: !!el.closest("#lobby"), label: el.getAttribute("aria-label") };
};

module.exports = {
  name: "subscription-scaffold",
  async run(t, ctx) {
    const html = ctx.html;

    /* ---------- S. STATIC ---------- */
    const ddlPath = path.join(__dirname, "..", "DDL-subscription.sql");
    const ddl = fs.existsSync(ddlPath) ? fs.readFileSync(ddlPath, "utf8") : "";
    t.ok(ddl.length > 8000 && /^-- STATUS: (NOT RUN|RUN in production|RUN IN PRODUCTION)/m.test(ddl), "tools/DDL-subscription.sql exists and its STATUS line says whether production has run it");
    const live = ddl.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    t.ok(/677f9cddef6e5eeb178437347ccf8223/.test(live) && /8ae9e8a3c39bb23bb3c83f7848dcd600/.test(live) && /00ed780667ebed70cab458368bc616c1/.test(live) && /51d7be429e260c1ad5ff92fd25704165/.test(live) && /88c4017d9db2fc1dd69cf877729e4c41/.test(live) && /<> 1569/.test(live),
      "md5-guarded on the five 10/20–10/21 read-backs: throw_limits 677f9cdd…, lc_config 18c19ce9…, lc_tonight_pack 00ed7806…, lc_pack_status 51d7be42…, set_filter 88c4017d… / 1569");
    const tagged = live.match(/\$[a-zA-Z_][a-zA-Z0-9_]*\$/g) || [];
    const dollars = (live.match(/\$\$/g) || []).length;
    t.ok(tagged.length === 0 && dollars % 2 === 0 && dollars >= 12, `Studio-safe: no tagged dollar-quote ($do$, $a$ …) anywhere in the live SQL, ${dollars} plain $$ delimiters (pairs) — one level only`);
    const bodies = live.split("$$");
    t.ok(bodies.filter((_, i) => i % 2 === 1).every((b) => !/\$\w*\$/.test(b)), "…and no dollar-quote of any kind INSIDE a $$ body (the 2026-10-21 Studio rule)");
    const guard0 = (live.match(/begin;\n+do \$\$[\s\S]*?end \$\$;/) || [""])[0];   // the first DO block after begin: the guards
    t.ok(guard0.length > 1500 && !/profiles\.subscription\b|p\.subscription\b|subscription_until\s*(=|<>|>|<|is)/.test(guard0) && /column_name in \('subscription', 'subscription_until'\)/.test(guard0) && /n <> 0/.test(guard0),
      "the guard block never reads a value of a column this file writes — it asserts the two columns do NOT EXIST (the brief's rule)");
    t.ok(/add column subscription text not null default 'none'/.test(live) && /add column subscription_until timestamptz null/.test(live) && /check \(subscription in \('none', 'active', 'comped'\)\)/.test(live),
      "profiles.subscription ('none' | 'active' | 'comped', default none) and subscription_until (timestamptz, null)");
    t.ok(/create function public\.profiles_subscription_guard\(\)/.test(live) && /current_user in \('anon', 'authenticated'\)/.test(live) && new RegExp(SUB_GUARD_MSG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(live) && /create trigger profiles_subscription_guard\s+before insert or update on public\.profiles/.test(live),
      `the guard trigger refuses any API-role write to either column with the double's words ("${SUB_GUARD_MSG}")`);
    t.ok(/create function public\.subscription_state\(uid uuid\)/.test(live) && /p\.subscription_until is null or p\.subscription_until > now\(\)/.test(live) && /create function public\.is_subscriber\(uid uuid\)[\s\S]*?select public\.subscription_state\(uid\) <> 'none'/.test(live),
      "subscription_state(uid) applies subscription_until on the server clock (expired → none); is_subscriber(uid) = state <> none — THE one hook");
    t.ok(/revoke all on function public\.is_subscriber\(uuid\) from public, anon;/.test(live) && /grant execute on function public\.is_subscriber\(uuid\) to authenticated, service_role;/.test(live) && /revoke all on function public\.comp_subscription\(uuid, timestamptz\) from public, anon, authenticated;/.test(live),
      "is_subscriber is signed-in only; comp_subscription is Studio-only (no API role may execute it)");
    t.ok(/alter function public\.throw_limits\(\) rename to throw_limits_base;/.test(live) && /create function public\.throw_limits\(\)[\s\S]*?public\.is_subscriber\(auth\.uid\(\)\)[\s\S]*?\(\(b->>'cheers'\)::int\) \* 2[\s\S]*?\(\(b->>'jeers'\)::int\)  \* 2[\s\S]*?from public\.throw_limits_base\(\) as t\(b\)/.test(live) && RATION_MULT === 2,
      "the ration: throw_limits() is renamed throw_limits_base (body kept) and the new throw_limits() wraps it, cheers and jeers x2 for a subscriber caller — the double's RATION_MULT");
    t.ok(/md5\(replace\(pg_get_functiondef\('public\.throw_limits_base\(\)'::regprocedure\), 'throw_limits_base', 'throw_limits'\)\)/.test(live) && /677f9cddef6e5eeb178437347ccf8223' then\n    raise exception 'post-check failed: throw_limits_base/.test(live),
      "…and the post-check hashes the renamed body with its old name put back, demanding the 2026-10-20 read-back: the body did not move");
    t.ok(!/create (or replace )?function public\.lc_config\(\)/.test(live) && !/create or replace function public\.throw_at\(/.test(live) && !/create or replace function public\.throw_counts\(/.test(live),
      "lc_config (PR C replaces it), throw_at and throw_counts (reflowed pastes, no full md5 on record) are not touched");
    t.ok(!/delete from public\.profiles|drop table public\.profiles|drop column/.test(live), "the live DDL deletes nothing and drops no column (the UNDO is commentary)");

    const docPath = path.join(__dirname, "..", "..", "docs", "fun-and-money.md");
    const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
    t.ok(doc.length > 3000 && /✦ never buys chips/.test(doc) && /Money never touches the host's choice/.test(doc) && /A paid look never blocks jeers or adds hearts/.test(doc) && /Gameplay looks are never sold/.test(doc),
      "docs/fun-and-money.md carries the model and the four hard rules");
    t.ok(/earned only/i.test(doc) && /à la carte/.test(doc) && /convenience and status/.test(doc), "…subscription = convenience and status, tiers = earned only, ✦ = à la carte");

    t.ok((html.match(/sb\.rpc\("is_subscriber"/g) || []).length === 1, "exactly one is_subscriber RPC call site on the page");
    t.ok(!/sb\.rpc\("comp_subscription"/.test(html) && !/sb\.rpc\("subscription_state"/.test(html), "the page never calls comp_subscription or subscription_state — the one hook is the one call");
    t.ok(!/from\("profiles"\)\.(update|upsert)\(\{[^}]*subscription/.test(html), "no client profiles write names a subscription column");
    const cfg = (html.match(/const THROWABLES=\{[\s\S]*?\n\};/) || [""])[0];
    t.ok(Number((cfg.match(/cheers:(\d+)/) || [])[1]) === THROW_LIMITS.cheers && Number((cfg.match(/jeers:(\d+)/) || [])[1]) === THROW_LIMITS.jeers, "the page's THROWABLES defaults are still the base ration (the server doubles, the phone never does)");
    const subSection = (html.match(/THE SUBSCRIPTION \(feat\/subscription-scaffold[\s\S]*?function lcPaintVip\(\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(subSection.length > 1500 && !/\*\s*2\b|cheers|jeers/.test(subSection.replace(/\/\*[\s\S]*?\*\//g, "")), "the subscription code never multiplies a ration or touches cheers/jeers — it holds one boolean and four flags");
    t.ok(/function lcPerks\(\)\{[\s\S]*?ration2x:s, packs:s, profileFull:s, benchPriority:s/.test(html) && /function lcProfileFullOpen\(\)\{ return lcPerks\(\)\.profileFull; \}/.test(html), "lcPerks(): the scaffold's four perks from the one answer; lcProfileFullOpen() is the hook PR C's card calls");
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, (m) => m.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")).replace(/<!--[\s\S]*?-->/g, "");
    t.ok(!/\$\s?\d+(\.\d\d)?(\s|\/|<|")/.test(visible) && !/per month|\/mo\b|\/month|per year|\/yr\b|pricing|subscribe now|free trial/i.test(visible),
      "no pricing copy anywhere on the page (no $N, per month, free trial, pricing)");
    t.ok(/id="vippill"[^>]*>VIP · coming soon</.test(html) && (html.match(/vippill/g) || []).length >= 3 && /<section class="tabpane" id="tab_you"[\s\S]*?id="vippill"[\s\S]*?<\/section>/.test(html),
      "the VIP pill is on the You tab (THE TABS, D4) and reads VIP · coming soon in the markup — the only visible trace");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@sub.test" });
      ["u_a", "u_b", "u_c", "u_plain", "u_vip", "u_lapsed"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_sub", host_id: hostU, name: "VIP Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "chair", { seat_index: 2 });
      D.addMember(room, "u_plain", "spectator");
      D.addMember(room, "u_vip", "spectator");
      D.addMember(room, "u_lapsed", "spectator");
      /* STUDIO, before anyone boots: comp u_vip for a month; u_lapsed's comp ran out a minute ago */
      const compVip = D.compSubscription("u_vip", D.now() + 30 * 86_400_000);
      const compLapsed = D.compSubscription("u_lapsed", D.now() - 60_000);
      t.ok(compVip.state === "comped" && compVip.is_subscriber === true && compLapsed.state === "none" && compLapsed.is_subscriber === false,
        `the server model: a live comp reads comped/true, a lapsed one none/false (${compVip.state}/${compLapsed.state})`);
      t.ok(D.throwLimitsFor("u_vip").cheers === THROW_LIMITS.cheers * 2 && D.throwLimitsFor("u_vip").jeers === THROW_LIMITS.jeers * 2 && D.throwLimitsFor("u_vip").subscriber === true && D.throwLimitsFor("u_plain").cheers === THROW_LIMITS.cheers && !("subscriber" in D.throwLimitsFor("u_plain")) && D.throwLimitsFor("u_lapsed").jeers === THROW_LIMITS.jeers,
        "throw_limits() on the model: x2 and subscriber:true for the comped caller, the base for a plain and a lapsed one");

      const bootLobby = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid);
        await c.goto("#you");   // THE TABS (D4): the VIP pill is on the You tab — the #you deep link lands there
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });   // the host resumes straight into her live room
        await waitFor(() => c.page.evaluate(() => window.__lc.SUBSCRIBER !== undefined && document.getElementById("vippill") !== null), 8000, name + ": lobby");
        return c;
      };
      const intoRoom = async (c, name, crowd = true) => {
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        if (crowd) await waitFor(() => c.page.evaluate(() => !!window.__lc.THROW_COUNTS), 8000, name + ": throw_counts");   // the host does not throw: no counts for her
      };
      const throwFrom = (c, target, kind) => c.page.evaluate(({ target, kind }) => window.__lc.throwAt(target, kind), { target, kind });
      const counts = (c) => c.page.evaluate(() => ({ ...window.__lc.THROW_COUNTS }));
      const perks = (c) => c.page.evaluate(() => ({ sub: window.__lc.lcSubscriber(), perks: window.__lc.lcPerks(), full: window.__lc.lcProfileFullOpen() }));
      const allTrue = (p) => p.subscriber && p.ration2x && p.packs && p.profileFull && p.benchPriority;
      const allFalse = (p) => !p.subscriber && !p.ration2x && !p.packs && !p.profileFull && !p.benchPriority;
      /* JUMP THE SERVER'S CLOCK (gate 80's device): past a throw's life and cooldown without burning seconds */
      const jump = async (ms, cs) => {
        D.clockSkew += ms;
        for (const m of D.members) m.last_seen = D.iso();
        for (const r of D.rooms.values()) if (r.status === "live") r.host_seen_at = D.iso();
        for (const c of cs) await c.page.evaluate(() => window.__lc.syncServerClock());
      };
      const host = await bootLobby("host", hostU);

      /* ---------- 1. A PLAIN USER ---------- */
      const P = await bootLobby("plain", "u_plain");
      const pillP = await P.page.evaluate(PILL);
      t.ok(pillP && pillP.shown && pillP.inLobby && pillP.text === "VIP · coming soon" && !pillP.on, `the plain user's lobby pill reads "${pillP && pillP.text}", not lit, in the lobby`);
      const pk = await perks(P);
      t.ok(pk.sub === false && allFalse(pk.perks) && pk.full === false, "lcSubscriber() false, every perk false, the profile hook false (the server said so: is_subscriber was asked)");
      t.ok(D.rpcLog.some((r) => r.name === "is_subscriber" && r.clientId === "plain" && r.args.uid === "u_plain"), "…and it WAS asked: one is_subscriber RPC for his own uid, logged on the double");
      await intoRoom(host, "host", false);
      await intoRoom(P, "plain");
      const cP = await counts(P);
      t.ok(cP.cheers_left === THROW_LIMITS.cheers && cP.jeers_left === THROW_LIMITS.jeers, `his tray reads the base ration before his first throw (${cP.cheers_left} · ${cP.jeers_left})`);
      const p1 = await throwFrom(P, "u_a", "tomato");
      const p2 = await throwFrom(P, "u_b", "pie");
      const p3 = await throwFrom(P, "u_c", "boo");
      t.ok(p1.ok && p2.ok && p3.ok === false && /no jeers left this show/.test(p3.error), `two jeers land, the THIRD is refused by the server: "${p3.error}" — a non-subscriber cannot exceed the base ration`);
      t.ok((await counts(P)).jeers_left === 0 && D.throwLedger.filter((l) => l.thrower_id === "u_plain").length === 2, "the ledger charged him exactly two; his tray reads 0 jeers left");

      /* ---------- 2. A COMPED USER ---------- */
      const V = await bootLobby("vip", "u_vip");
      const pillV = await V.page.evaluate(PILL);
      t.ok(pillV && pillV.shown && pillV.text === "VIP" && pillV.on, `the comped user's pill reads "${pillV && pillV.text}" and is lit — no "coming soon" lock for a subscriber`);
      const vk = await perks(V);
      t.ok(vk.sub === true && allTrue(vk.perks) && vk.full === true, "lcSubscriber() true, every perk true, the profile hook true — the comped account passes every perk check");
      await intoRoom(V, "vip");
      const cV = await counts(V);
      t.ok(cV.cheers_left === THROW_LIMITS.cheers * 2 && cV.jeers_left === THROW_LIMITS.jeers * 2, `his tray reads the doubled ration from throw_counts (${cV.cheers_left} · ${cV.jeers_left}) — the server's numbers`);
      const limV = await V.page.evaluate(() => ({ cheers: window.__lc.THROWABLES.cheers, jeers: window.__lc.THROWABLES.jeers }));
      t.ok(limV.cheers === THROW_LIMITS.cheers * 2 && limV.jeers === THROW_LIMITS.jeers * 2, "the page's live THROWABLES numbers are the server's limits for HIM (overwritten by throw_counts, as always)");
      const metaV = await V.page.evaluate(() => { document.getElementById("rt_throwbtn").click(); const m = document.getElementById("rt_throwmeta").textContent; return m; });
      t.ok(/10 CHEERS · 4 JEERS LEFT/.test(metaV), `the tray's line reads his ration: "${metaV}"`);
      // the plain user's throws are live/cooling on all three chairs: jump past them, then the VIP throws
      await jump((THROW_LIMITS.live_secs + THROW_LIMITS.cooldown_secs + 2) * 1000, [host, P, V]);
      const v1 = await throwFrom(V, "u_a", "tomato");
      const v2 = await throwFrom(V, "u_b", "tomato");
      const v3 = await throwFrom(V, "u_c", "tomato");
      t.ok(v1.ok && v2.ok && v3.ok, `a comped crowd member's THIRD jeer lands (${[v1, v2, v3].map((r) => r.ok).join(",")}) — past the base ration`);
      await jump((THROW_LIMITS.live_secs + THROW_LIMITS.cooldown_secs + 2) * 1000, [host, P, V]);
      const v4 = await throwFrom(V, "u_a", "pie");
      const v5 = await throwFrom(V, "u_b", "cricket");
      t.ok(v4.ok && v5.ok === false && /no jeers left this show/.test(v5.error), `his fourth lands, his fifth is refused: "${v5.error}" — x2 is the ceiling, not infinity`);
      t.ok((await counts(V)).jeers_left === 0 && D.throwLedger.filter((l) => l.thrower_id === "u_vip").length === 4, "the ledger charged him four; his tray reads 0 jeers left");
      const vc = await throwFrom(V, "u_c", "petals");
      t.ok(vc.ok && vc.cheers_left === THROW_LIMITS.cheers * 2 - 1, `his cheers are doubled too: one lands, ${vc.cheers_left} left`);

      /* ---------- 3. EXPIRED ---------- */
      const L = await bootLobby("lapsed", "u_lapsed");
      const pillL = await L.page.evaluate(PILL);
      const lk = await perks(L);
      t.ok(pillL.text === "VIP · coming soon" && !pillL.on && lk.sub === false && allFalse(lk.perks), "a comp whose subscription_until has passed: the pill is not lit, every perk false — the server read it as none");
      t.ok(D.subscriptionState("u_lapsed") === "none" && D.profiles.get("u_lapsed").subscription === "comped", "…while the row still says comped: subscription_state applied the date, nothing on the phone did");
      // the VIP's comp ends mid-evening (Studio); his phone learns it at its next read (the next openRoom)
      D.compSubscription("u_vip", D.now() - 1);
      t.ok(D.isSubscriber("u_vip") === false, "Studio ends the VIP's comp (until = now): is_subscriber is false at once on the server");
      const reread = await V.page.evaluate(() => window.__lc.lcSubscriberLoad());
      const vk2 = await perks(V);
      const pillV2 = await V.page.evaluate(PILL);
      t.ok(reread === false && vk2.sub === false && allFalse(vk2.perks) && pillV2.text === "VIP · coming soon" && !pillV2.on, "the phone's next read: lcSubscriber false, perks false, the pill back to coming soon");
      await V.page.evaluate(() => window.__lc.throwCountsSync());
      await waitFor(() => V.page.evaluate(() => window.__lc.THROWABLES.cheers === 5), 5000, "vip's limits back to base");
      t.ok(true, "throw_counts now carries the base numbers for him (THROWABLES.cheers 5)");

      /* ---------- 4. THE GUARD ---------- */
      const w1 = await P.page.evaluate(() => sb.from("profiles").update({ subscription: "active" }).eq("id", "u_plain").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      const w2 = await P.page.evaluate(() => sb.from("profiles").update({ subscription_until: new Date(Date.now() + 86400e3).toISOString() }).eq("id", "u_plain").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      const w3 = await P.page.evaluate(() => sb.from("profiles").upsert({ id: "u_plain", subscription: "comped" }).then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(w1 === SUB_GUARD_MSG && w2 === SUB_GUARD_MSG && w3 === SUB_GUARD_MSG, `a client's own write to subscription / subscription_until / an upsert naming one: refused with the trigger's words ("${w1}")`);
      t.ok(D.profiles.get("u_plain").subscription === "none" && D.isSubscriber("u_plain") === false, "…and nothing changed: he is still none");
      const w4 = await P.page.evaluate(() => sb.from("profiles").update({ display_name: "Plain Renamed" }).eq("id", "u_plain").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(w4 === "ACCEPTED" && D.profiles.get("u_plain").display_name === "Plain Renamed", "an ordinary profile write through the same door still passes (the guard is by column)");
      const w5 = await P.page.evaluate(() => sb.rpc("comp_subscription", { uid: "u_plain", until: null }).then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(/permission denied for function comp_subscription/.test(w5), `the comp RPC is Studio-only: a signed-in client gets "${w5}"`);

      /* ---------- 5. no errors ---------- */
      for (const c of [host, P, V, L]) {
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, `${c.name}: zero console errors${errs.length ? " — " + errs.slice(0, 3).join(" | ") : ""}`);
      }
    } finally {
      await h.close();
    }
  },
};
