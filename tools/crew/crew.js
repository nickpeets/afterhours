#!/usr/bin/env node
/* crew.js — the rehearsal crew: six bots that join a live show so Nick can
 * run a whole show alone from his phone.
 *
 *   node tools/crew/crew.js                    join the one live room
 *   node tools/crew/crew.js --host Nick        join the room hosted by "Nick"
 *   node tools/crew/crew.js --room <link|id>   join that room (any text holding its id)
 *   node tools/crew/crew.js --scenario crown   a scripted pass (see README.md)
 *   node tools/crew/crew.js --scenario combos  the PR C selftest, with Nick hosting (selftest.js)
 *   node tools/crew/crew.js --scenario hostgone  the 10/9 host-drop test: Nick hosts, then drops (README.md)
 *   node tools/crew/crew.js --check            sign each bot in and set its profile, then stop
 *   node tools/crew/crew.js --login "Crowd C"  a visible browser on the rehearsal desktop, so
 *                                              Nick signs that bot in by hand, once
 *
 * Each bot is a REAL client: index.html from the site (lastcall.love unless
 * --site), its own browser context, its own account, a fake camera showing
 * its name card (cast.js).  It does what a player does through the app's
 * own code — the bench button, the heart insert, throwAt — so the server's
 * rules apply to it exactly as to a person, and a refusal comes back in the
 * server's own words, echoed into chat.
 *
 * Orders come from room chat: only lines from the HOST that start with
 * "crew:" (orders.js).  The crew runs until "crew: done", the room ends, or
 * Ctrl-C; then every bot leaves the room and closes, and the crew confirms
 * that no room hosted by a crew account is live.
 *
 * SIGN-IN, the 10/9 rehearsal's way.  Each bot runs in a Chromium profile
 * that already holds a signed-in session: /workspaces/rehearsal/profile-a,
 * -b, -c, -crowd, -host (and -crowd-c), outside the repo (CREW_PROFILES
 * moves it).  Nobody types a password for a run.  A bot without a profile
 * may fall back to Codespace secrets (README.md): CREW_PASSWORD with
 * CREW_EMAIL_PATTERN or CREW_EMAIL_<KEY>.  Passwords are never in chat, the
 * repo, argv or the log.  A bot with neither sits the show out, and the
 * crew says so.
 */
"use strict";

const { CAST, slug, cameraScript } = require("./cast");
const { parseOrder, HELP } = require("./orders");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the in-page surface: ONE init script, every bot ----------
   Everything here calls the app's own globals (sb, ME, CURRENT_ROOM,
   ROOM_STATE, HEARTS, sendHeart, throwAt, window.__lc) at call time. */
const PAGE = `window.__crew = {
  loaded(){ return typeof sb!=="undefined" && !!window.__lc; },
  booted(){ return this.loaded() && typeof ME!=="undefined" && !!ME && typeof MYPROFILE!=="undefined" && !!MYPROFILE && !!MYPROFILE.zip_code; },
  async uid(){ try{ const r=await sb.auth.getUser(); return (r&&r.data&&r.data.user&&r.data.user.id)||null; }catch(e){ return null; } },
  async signIn(email,pass){ const {error}=await sb.auth.signInWithPassword({email,password:pass}); return error?(error.message||"refused"):null; },
  async setProfile(p){
    const id=await this.uid(); if(!id) return "not signed in";
    let {error}=await sb.from("profiles").upsert(Object.assign({id},p));
    if(error && /column|birthdate|gender|seeking/i.test(error.message||"")){
      ({error}=await sb.from("profiles").upsert({id,display_name:p.display_name,zip_code:p.zip_code,radius_miles:p.radius_miles}));
    }
    try{ await sb.rpc("accept_terms"); }catch(e){}
    return error?(error.message||"refused"):null;
  },
  async rooms(){
    const {data,error}=await sb.rpc("list_live_rooms"); if(error) return {error:error.message};
    const rows=data||[]; const ids=[...new Set(rows.map(r=>r.host_id))]; const names={};
    if(ids.length){ const {data:ps}=await sb.from("profiles").select("id,display_name").in("id",ids); (ps||[]).forEach(p=>names[p.id]=p.display_name); }
    return {rooms:rows.map(r=>({id:r.id,host_id:r.host_id,title:r.contestant_name||"",host:names[r.host_id]||""}))};
  },
  async enter(id){
    const {data,error}=await sb.rpc("list_live_rooms"); if(error) return error.message;
    const row=(data||[]).find(r=>r.id===id); if(!row) return "that room isn't live";
    if(row.host_id===ME.id) return "a crew account can't join its own room";
    await window.__lc.openRoom(row); return null;
  },
  state(){
    const r=CURRENT_ROOM, ms=(ROOM_STATE&&ROOM_STATE.members)||[];
    const me=(r&&ME)?ms.find(m=>m.user_id===ME.id):null, b=document.getElementById("rt_joinline");
    const people=ms.map(m=>({uid:m.user_id,role:m.role,name:nameFor(m.user_id)}));
    if(r) people.push({uid:r.host_id,role:"host",name:nameFor(r.host_id)});
    return { me:ME?ME.id:null, room:r?r.id:null, status:r?r.status:null, host:r?r.host_id:null,
      phase:r?r.phase:null, crown:r?(r.crown_user||null):null, role:me?me.role:null,
      verb:b?(b.dataset.verb||null):null, passed:(typeof I_WAS_PASSED!=="undefined")&&!!I_WAS_PASSED,
      people, hearts:Object.assign({},HEARTS), notice:this.notice(),
      counts:(typeof THROW_COUNTS!=="undefined"&&THROW_COUNTS)?Object.assign({},THROW_COUNTS):null };
  },
  notice(){ const n=document.getElementById("rt_hostgone"); return (n && !n.hidden && n.offsetParent!==null) ? n.textContent.trim() : null; },
  endScreen(){ const f=document.getElementById("finale"); return (f && f.classList.contains("show")) ? (f.innerText||"").trim().replace(/\\s+/g," ").slice(0,160) : null; },
  async cursor(){
    const {data}=await sb.from("room_events").select("*").eq("room_id",CURRENT_ROOM.id).order("created_at",{ascending:false}).limit(1);
    return (data&&data[0]&&data[0].created_at)||new Date().toISOString();
  },
  async orders(since){
    if(!CURRENT_ROOM) return {cursor:since,lines:[]};
    const {data,error}=await sb.from("room_events").select("*").eq("room_id",CURRENT_ROOM.id)
      .gt("created_at",since).order("created_at",{ascending:true}).limit(100);
    if(error) return {error:error.message,cursor:since,lines:[]};
    const rows=data||[], host=CURRENT_ROOM.host_id;
    return { cursor:rows.length?rows[rows.length-1].created_at:since,
      lines:rows.filter(e=>e.type==="chat"&&e.user_id===host&&/^\\s*crew\\s*:/i.test((e.payload&&e.payload.text)||""))
                .map(e=>({id:e.id,text:e.payload.text})) };
  },
  async say(text){
    if(!CURRENT_ROOM) return "not in a room";
    const {error}=await sb.from("room_events").insert({room_id:CURRENT_ROOM.id,user_id:ME.id,type:"chat",payload:{text}});
    return error?error.message:null;
  },
  async throwAt(uid,kind){ const r=await throwAt(uid,kind); return r||{ok:false,error:"no answer"}; },
  async heart(uid){ await sendHeart(uid); return null; },
  probe(uid){
    const lc=window.__lc, cr=lc.COMBO_ROOM||{seats:{}}, pr=lc.PRESSURE_ROOM||{seats:{}}, tr=lc.THROW_ROOM||{};
    const tile=[0,1,2].map(i=>document.getElementById("rt_seat"+i)).find(el=>el&&el.dataset.heartuid===uid)||null;
    const ov=document.getElementById("rt_ovation");
    return { combo:(cr.seats||{})[uid]||null, throwSt:tr[uid]||null, react:cr.react||null,
      cracks:((pr.seats||{})[uid]||{}).cracks, crown:pr.crown||null,
      booedTile:!!(tile&&tile.classList.contains("is-booed")), ovationOn:!!(ov&&ov.classList.contains("is-on")),
      nudges:(lc.COMBO_NUDGES||[]).length, counts:lc.THROW_COUNTS||null };
  },
  async countsNow(){ try{ await window.__lc.throwCountsSync(); }catch(e){} return window.__lc.THROW_COUNTS||null; },
  async ovationHearts(uid, since){
    const {data}=await sb.from("room_events").select("*").eq("room_id",CURRENT_ROOM.id).eq("type","heart").gt("created_at",since).order("created_at",{ascending:true}).limit(100);
    return (data||[]).filter(e=>e.payload&&e.payload.target===uid&&!e.user_id).length;
  },
  serverIso(){ try{ return new Date(serverNow()).toISOString(); }catch(e){ return new Date().toISOString(); } },
  benchTap(){ const b=document.getElementById("rt_joinline"); if(!b) return "no bench button"; b.click(); return null; },
  async leave(){ try{ if(CURRENT_ROOM) await window.__lc.leaveRoom(); }catch(e){} return null; },
  async endRoom(id){ try{ await window.__lc.hostEndRoom(id); return null; }catch(e){ return String((e&&e.message)||e); } },
};`;

/* ---------- names ---------- */
function findPerson(people, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const exact = people.filter((p) => (p.name || "").toLowerCase() === n);
  if (exact.length) return exact[0];
  const pre = people.filter((p) => (p.name || "").toLowerCase().startsWith(n));
  return pre.length === 1 ? pre[0] : null;
}
const EMOJI = { tomato: "🍅", pie: "🥧", boo: "👻", cricket: "🦗", petals: "🌹", hearts: "💖", confetti: "🎉", sparkle: "✨" };

/* ---------- the crew ---------- */
class Crew {
  /* bots: [{ spec (a CAST row), page, close() }] — already signed in and booted */
  constructor({ bots, roomId, scenario = null, log = console.log, tickMs = 1000, lingerMs = null }) {
    // hostgone lingers on the end card so the 406 count means something (a gate passes 0)
    this.lingerMs = lingerMs != null ? lingerMs : (scenario === "hostgone" ? 15000 : 0);
    this.bots = bots.map((b) => ({ ...b, uid: null, role: null, parked: false, benchAt: 0, st: null }));
    this.roomId = roomId; this.scenario = scenario; this.log = log; this.tickMs = tickMs;
    this.cursor = null; this.seen = new Set(); this.rr = 0; this.step = 0;
    this.stopped = false; this.reason = null;
    this.done = new Promise((r) => { this._resolve = r; });
  }
  bot(name) { return this.bots.find((b) => b.spec.name.toLowerCase() === String(name).toLowerCase()); }
  get men() { return this.bots.filter((b) => b.spec.man); }
  get crowd() { return this.bots.filter((b) => !b.spec.man); }
  get ear() { return this.crowd[0] || this.bots[0]; }   // the one bot that reads the orders

  ev(b, fn, ...args) { return b.page.evaluate(({ fn, args }) => window.__crew[fn](...args), { fn, args }); }
  async say(b, text) { const e = await this.ev(b, "say", text).catch((x) => String(x)); if (e) this.log(`  ${b.spec.name}: couldn't chat (${e})`); }

  /* --scenario hostgone (fix/rehearsal-1009): Nick hosts, then drops.  The
     crew logs when the "host lost connection" notice comes and goes, what
     every phone shows when the server ends the room, and how many 406s each
     phone gets for the ended room (there should be none). */
  watch406(b) {
    b.n406 = 0;
    b.page.on("response", (r) => { try { if (r.status() === 406 && /\/rest\/v1\/rooms/.test(r.url())) b.n406++; } catch (e) {} });
  }
  hostgoneReport() {
    const n = this.bots.map((b) => `${b.spec.name} ${b.n406 | 0}`).join(", ");
    this.log(`  hostgone: 406s on the rooms read so far — ${n}`);
  }

  async start() {
    if (this.scenario === "hostgone") for (const b of this.bots) this.watch406(b);
    for (const b of this.bots) {
      b.page.on("dialog", (d) => d.accept().catch(() => {}));   // "Leave the chair?" — a bot means it
      b.uid = (await this.ev(b, "state")).me;
      const err = await this.ev(b, "enter", this.roomId);
      if (err) { b.out = err; this.log(`  ${b.spec.name} sits this one out: ${err}`); continue; }
      this.log(`  ${b.spec.name} is in the room`);
    }
    const out = this.bots.filter((b) => b.out);
    this.bots = this.bots.filter((b) => !b.out);
    for (const b of out) { try { await b.close(); } catch (e) {} }
    if (!this.bots.length) throw new Error("no bot could join the room");
    // the combos selftest needs three throwers: short of crowd bots, Leo stays in the crowd
    if (this.scenario === "combos" && this.crowd.length < 3) { const leo = this.bot("Leo"); if (leo) leo.parked = true; }
    this.cursor = await this.ev(this.ear, "cursor");
    if (this.scenario) this.log(`  scenario: ${this.scenario}`);
    this._loop();
    return this;
  }

  async _loop() {
    while (!this.stopped) {
      try { await this.tick(); } catch (e) { this.log("  tick: " + String((e && e.message) || e).slice(0, 200)); }
      await sleep(this.tickMs);
    }
  }

  async tick() {
    await Promise.all(this.bots.map(async (b) => { b.st = await this.ev(b, "state").catch(() => null); }));
    const ear = this.ear.st;
    // the host-gone notice (fix/rehearsal-1009): say when the room tells the crowd she's gone, and when it stops
    if (ear && (ear.notice || null) !== (this.notice || null)) {
      this.log(ear.notice ? `  the room says: ${ear.notice}` : `  the host-gone notice cleared`);
      this.notice = ear.notice || null;
    }
    if (!ear || !ear.room) return this.finish("the room ended");
    if (ear.status === "ended") {
      // hostgone: linger 15s on the end card so the 406 count means something, then go
      if (this.scenario === "hostgone") {
        if (!this.endedAt) { this.endedAt = Date.now(); if (this.lingerMs) this.log(`  the room ended — watching ${this.lingerMs / 1000}s for polling`); }
        if (Date.now() - this.endedAt < this.lingerMs) return;
      }
      return this.finish("the room ended");
    }
    // the men behave like players: on the bench unless told to stay off it
    for (const b of this.men) {
      const st = b.st; if (!st || !st.room) continue;
      if (st.role !== b.role) { if (b.role !== null || st.role) this.log(`  ${b.spec.name}: ${b.role || "—"} → ${st.role || "—"}`); b.role = st.role; }
      const seated = ["line", "chair", "kept"].includes(st.role);
      if (!b.parked && !seated && !st.passed && st.verb === "join" && Date.now() - b.benchAt > 20000) {
        b.benchAt = Date.now();
        this.log(`  ${b.spec.name}: taking a bench seat (headshot from the card)`);
        await this.ev(b, "benchTap");
      }
    }
    // orders from the host
    const r = await this.ev(this.ear, "orders", this.cursor);
    if (r.error) this.log("  orders: " + r.error);
    this.cursor = r.cursor || this.cursor;
    for (const line of r.lines || []) {
      if (this.seen.has(line.id)) continue;
      this.seen.add(line.id);
      this.log(`  host: ${line.text}`);
      await this.obey(parseOrder(line.text));
      if (this.stopped) return;
    }
    if (this.scenario === "crown") await this.crownStep();
    if (this.scenario === "combos" && !this.selftest) {
      this.selftest = require("./selftest").runCombos(this)
        .then((r) => { this.selftestResult = r; })
        .catch((e) => { this.log("  selftest crashed: " + String((e && e.message) || e)); this.selftestResult = { crashed: String(e) }; });
    }
  }

  people() { return (this.ear.st && this.ear.st.people) || []; }
  thrower(from) {
    if (from) { const b = this.bot(from); if (b) return b; }
    const b = this.crowd[this.rr % this.crowd.length]; this.rr++; return b;
  }
  async throwOne(b, who, kind) {
    const e = EMOJI[kind] || "";
    const r = await this.ev(b, "throwAt", who.uid, kind).catch((x) => ({ ok: false, error: String(x) }));
    if (r.ok) {
      const extra = r.combo ? " — that made it a combo!" : r.joined ? ` — joined in (×${r.n | 0})` : "";
      await this.say(b, `${e} ${kind} at ${who.name} — landed${extra}`);
    } else {
      await this.say(b, `${e} ${kind} at ${who.name} — refused: ${r.error}`);
    }
    return r;
  }

  async obey(o) {
    const ear = this.ear;
    if (!o) return;
    if (o.verb === "unknown") return this.say(ear, `didn't catch "${o.said}" — try crew: help`);
    if (o.verb === "help") return this.say(ear, HELP);
    if (o.verb === "done") { await this.say(ear, "crew done — everyone's heading out 👋"); return this.finish("crew: done"); }
    if (o.verb === "status") {
      for (const b of this.bots) {
        const st = b.st || {};
        const role = st.role === "line" ? "on the bench" : st.role === "chair" ? "in a chair" : st.role === "kept" ? "kept" : st.role ? "in the crowd" : "not in the room";
        const bits = [role];
        if (b.spec.man) bits.push("♥" + ((this.ear.st && this.ear.st.hearts[b.uid]) || 0));
        else if (st.counts) bits.push(`cheers ${st.counts.cheers_left} · jeers ${st.counts.jeers_left}`);
        if (b.parked) bits.push("staying off the bench");
        await this.say(b, bits.join(" · "));
      }
      return;
    }
    const who = findPerson(this.people(), o.target);
    if (["leave", "bench"].includes(o.verb)) {
      const b = this.bot(o.target);
      if (!b) return this.say(ear, `${o.target} isn't one of the crew`);
      const st = b.st || {};
      if (o.verb === "leave") {
        if (!["line", "chair", "kept"].includes(st.role)) { b.parked = true; return this.say(b, "I'm not in a chair or on the bench — staying in the crowd"); }
        b.parked = true;
        await this.ev(b, "benchTap");
        return this.say(b, st.role === "line" ? "leaving the bench" : "leaving my chair");
      }
      b.parked = false;
      if (st.passed) return this.say(b, "she passed me — I'm out for the night");
      if (["line", "chair", "kept"].includes(st.role)) return this.say(b, "already " + (st.role === "line" ? "on the bench" : "in a chair"));
      b.benchAt = Date.now();
      const e = await this.ev(b, "benchTap");
      return this.say(b, e ? "couldn't: " + e : "taking a bench seat");
    }
    if (!who) return this.say(ear, `who's ${o.target}? nobody by that name in the room`);
    if (o.verb === "jeer" || o.verb === "cheer" || o.verb === "rose") return this.throwOne(this.thrower(o.from), who, o.kind);
    if (o.verb === "hearts") {
      const per = new Map();
      for (let i = 0; i < o.n; i++) {
        const b = this.crowd[i % this.crowd.length];
        if (b.uid === who.uid) continue;
        await this.ev(b, "heart", who.uid); per.set(b, (per.get(b) || 0) + 1);
        await sleep(250);
      }
      for (const [b, n] of per) await this.say(b, `❤️×${n} → ${who.name}`);
      return;
    }
    if (o.verb === "ovation" || o.verb === "booed") {
      if (this.crowd.length < 3) return this.say(ear, `an ${o.verb === "ovation" ? "ovation" : "booing"} needs three crowd bots — only ${this.crowd.length} here`);
      const kinds = o.verb === "ovation" ? ["confetti", "sparkle", "hearts"] : ["tomato", "pie", "boo"];
      const throws = this.crowd.slice(0, 3).map((b, i) => sleep(i * 600).then(() => this.ev(b, "throwAt", who.uid, kinds[i]).catch((x) => ({ ok: false, error: String(x) }))));
      const res = await Promise.all(throws);
      for (let i = 0; i < res.length; i++) {
        const b = this.crowd[i], r = res[i], k = kinds[i];
        await this.say(b, r.ok ? `${EMOJI[k]} ${k} at ${who.name} — ${r.combo ? "combo! 🔥" : r.joined ? `joined (×${r.n | 0})` : "landed"}`
                               : `${EMOJI[k]} ${k} at ${who.name} — refused: ${r.error}`);
      }
    }
  }

  /* --scenario crown: three men seated, Dex leads on hearts, then she plays */
  async crownStep() {
    const ear = this.ear, men = this.men;
    const roles = men.map((b) => (b.st && b.st.role) || null);
    if (this.step === 0) {
      await this.say(ear, "scenario crown: Dex, Marco and Leo are taking bench seats");
      this.step = 1;
    } else if (this.step === 1 && roles.every((r) => ["line", "chair"].includes(r))) {
      if (!roles.every((r) => r === "chair")) await this.say(ear, "all three are on the bench — seat them (or let the show seat them)");
      this.step = 2;
    } else if (this.step === 2 && roles.every((r) => r === "chair")) {
      const dex = this.bot("Dex"), marco = this.bot("Marco");
      for (let i = 0; i < 6; i++) { await this.ev(this.crowd[i % this.crowd.length], "heart", dex.uid); await sleep(250); }
      await this.ev(this.crowd[0], "heart", marco.uid);
      await this.say(ear, "Dex leads on hearts (6 to Marco's 1). Ask each man, then make your call — the crown goes to the heart leader");
      this.step = 3;
    } else if (this.step === 3 && ear.st && ear.st.crown) {
      const p = this.people().find((x) => x.uid === ear.st.crown);
      const n = p ? p.name : "someone";
      await this.say(ear, `👑 ${n} wears the crown. Try "crew: jeer ${n}" — it should be refused`);
      this.step = 4;
    }
  }

  async finish(reason) {
    if (this.stopped) return this.done;
    this.stopped = true; this.reason = reason;
    this.log(`  stopping: ${reason}`);
    // what each phone was showing when the room ended — read BEFORE anyone leaves
    this.endScreens = {};
    if (reason === "the room ended") {
      for (const b of this.bots) {
        const sc = await this.ev(b, "endScreen").catch(() => null);
        this.endScreens[b.spec.name] = sc;
        this.log(`  ${b.spec.name} saw: ${sc || "(no end card)"}`);
      }
      if (this.scenario === "hostgone") this.hostgoneReport();
    }
    for (const b of this.bots) {
      try { await this.ev(b, "leave"); this.log(`  ${b.spec.name} left`); } catch (e) { this.log(`  ${b.spec.name}: leave failed (${String(e).slice(0, 80)})`); }
    }
    // no test room left live: a room a crew account hosts (never the show
    // the crew joined — that one is the host's) is ended by its own host bot
    let liveHosted = [];
    try {
      const r = await this.ev(this.bots[0], "rooms");
      for (const x of (r.rooms || []).filter((x) => x.id !== this.roomId)) {
        const b = this.bots.find((y) => y.uid === x.host_id); if (!b) continue;
        const e = await this.ev(b, "endRoom", x.id);
        this.log(`  ended ${b.spec.name}'s leftover room ${x.id}` + (e ? ` (failed: ${e})` : ""));
      }
      const again = await this.ev(this.bots[0], "rooms");
      const mine = new Set(this.bots.map((b) => b.uid));
      liveHosted = (again.rooms || []).filter((x) => mine.has(x.host_id) && x.id !== this.roomId);
    } catch (e) {}
    this.log(liveHosted.length ? `  WARNING: ${liveHosted.length} crew-hosted room(s) still live` : "  no crew-hosted room is live ✓");
    for (const b of this.bots) { try { await b.close(); } catch (e) {} }
    this._resolve({ reason, liveHosted: liveHosted.length });
    return this.done;
  }
}

/* ---------- production: launch, sign in, pick the room ---------- */
const fs = require("fs"), path = require("path");
const PROFILES = process.env.CREW_PROFILES || "/workspaces/rehearsal";
const profileDir = (spec) => path.join(PROFILES, "profile-" + spec.profile);
const ARGS = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"];
const VIEW = { viewport: { width: 390, height: 844 }, permissions: ["camera", "microphone"], reducedMotion: "reduce" };

function credsFor(spec) {
  const pass = process.env["CREW_PASSWORD_" + spec.key] || process.env.CREW_PASSWORD || "";
  let email = process.env["CREW_EMAIL_" + spec.key] || "";
  if (!email && process.env.CREW_EMAIL_PATTERN) email = process.env.CREW_EMAIL_PATTERN.replace("{name}", slug(spec.name));
  return { email, pass };
}
function profileFor(spec) {
  return { display_name: spec.name, zip_code: process.env.CREW_ZIP || "97201", radius_miles: 100, expand_ok: true,
           birthdate: "1990-01-01", gender: spec.man ? "man" : null, seeking: "everyone" };
}

/* one bot: its rehearsal profile if it has one, else a fresh context and
   the secrets.  Returns null (and says why) when it can't sign in. */
async function launchBot(chromium, exe, site, spec, log) {
  const dir = profileDir(spec), haveDir = fs.existsSync(dir);
  const { email, pass } = credsFor(spec);
  let context, browser = null;
  if (haveDir) context = await chromium.launchPersistentContext(dir, { executablePath: exe, headless: true, args: ARGS, ...VIEW });
  else if (email && pass) { browser = await chromium.launch({ executablePath: exe, headless: true, args: ARGS }); context = await browser.newContext(VIEW); }
  else { log(`  ${spec.name}: no profile-${spec.profile} and no secrets — sits out (tools/crew/crew --login "${spec.name}")`); return null; }
  const close = async () => { try { await context.close(); } catch (e) {} if (browser) await browser.close().catch(() => {}); };
  try {
    await context.addInitScript(cameraScript(spec));
    await context.addInitScript(PAGE);
    const page = context.pages()[0] || await context.newPage();
    page.on("pageerror", (e) => log(`  ${spec.name} page error: ${String(e && e.message || e).slice(0, 160)}`));
    await page.goto(site, { waitUntil: "load" });
    await page.waitForFunction(() => window.__crew && window.__crew.loaded(), null, { timeout: 30000 });
    if (!(await page.evaluate(() => window.__crew.uid()))) {
      if (!(email && pass)) { log(`  ${spec.name}: profile-${spec.profile} has no live session — sits out (tools/crew/crew --login "${spec.name}")`); await close(); return null; }
      const err = await page.evaluate(({ e, p }) => window.__crew.signIn(e, p), { e: email, p: pass });
      if (err) { log(`  ${spec.name}: sign-in refused (${err}) — sits out`); await close(); return null; }
    }
    const perr = await page.evaluate((p) => window.__crew.setProfile(p), profileFor(spec));
    if (perr) log(`  ${spec.name}: profile not saved (${perr})`);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__crew && window.__crew.booted(), null, { timeout: 30000 });
    return { spec, page, close };
  } catch (e) {
    log(`  ${spec.name}: couldn't start (${String((e && e.message) || e).split("\n")[0].slice(0, 160)}) — sits out`);
    await close(); return null;
  }
}

/* --login: a VISIBLE browser on the rehearsal desktop (noVNC, DISPLAY :99)
   in that bot's profile.  Nick signs in by hand; the crew watches for the
   session, saves the bot's profile and closes.  Nothing is typed for him. */
async function login(chromium, exe, site, name, log) {
  const spec = CAST.find((c) => c.name.toLowerCase() === name.toLowerCase() || slug(c.name) === name.toLowerCase());
  if (!spec) throw new Error(`no bot called ${name} (${CAST.map((c) => c.name).join(", ")})`);
  const dir = profileDir(spec);
  fs.mkdirSync(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir, { executablePath: exe, headless: false, args: ARGS,
    viewport: { width: 390, height: 844 }, env: { ...process.env, DISPLAY: process.env.DISPLAY || ":99" } });
  try {
    await context.addInitScript(PAGE);
    const page = context.pages()[0] || await context.newPage();
    await page.goto(site, { waitUntil: "load" });
    log(`sign ${spec.name} in, by hand, in the rehearsal desktop window (profile-${spec.profile}) — waiting up to 10 minutes`);
    const t0 = Date.now();
    while (Date.now() - t0 < 600000) {
      const id = await page.evaluate(() => window.__crew && window.__crew.uid()).catch(() => null);
      if (id) {
        const perr = await page.evaluate((p) => window.__crew.setProfile(p), profileFor(spec));
        log(`${spec.name} is signed in ✓` + (perr ? ` (profile not saved: ${perr})` : ""));
        return;
      }
      await sleep(2000);
    }
    throw new Error("nobody signed in within 10 minutes");
  } finally { await context.close().catch(() => {}); }
}

async function pickRoom(page, { room, host }) {
  const r = await page.evaluate(() => window.__crew.rooms());
  if (r.error) throw new Error("couldn't list live rooms: " + r.error);
  const rooms = r.rooms || [];
  if (room) {
    const id = (String(room).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [String(room)])[0];
    const hit = rooms.find((x) => x.id === id);
    if (!hit) throw new Error("that room isn't live (" + id + ")");
    return hit;
  }
  let pool = rooms;
  if (host) pool = rooms.filter((x) => (x.host || "").toLowerCase().includes(host.toLowerCase()) || (x.title || "").toLowerCase().includes(host.toLowerCase()));
  if (pool.length === 1) return pool[0];
  const list = rooms.map((x) => `    ${x.id}  ${x.host || "?"} — ${x.title || ""}`).join("\n") || "    (none)";
  throw new Error((pool.length ? "more than one live room — pass --host <name> or --room <id>" : "no live room" + (host ? ` hosted by "${host}"` : "")) + "\n  live now:\n" + list);
}

function parseArgs(argv) {
  const o = { site: process.env.CREW_SITE || "https://lastcall.love/" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === "--room") o.room = v();
    else if (a === "--host") o.host = v();
    else if (a === "--scenario") o.scenario = v();
    else if (a === "--site") o.site = v();
    else if (a === "--check") o.check = true;
    else if (a === "--login") o.login = v();
    else if (a === "--only") o.only = v().split(",").map((s) => s.trim().toLowerCase());
    else if (a === "-h" || a === "--help") o.help = true;
    else if (!o.room && !a.startsWith("--")) o.room = a;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 12).join("\n")); return; }
  if (o.scenario && !["crown", "combos", "hostgone"].includes(o.scenario)) throw new Error("unknown scenario " + o.scenario + " (known: crown, combos, hostgone)");
  const { chromium } = require("playwright-core");
  const { resolveChromium } = require("../lib/harness");
  const exe = resolveChromium();
  if (exe.error) throw new Error(exe.error);
  const log = (s) => console.log(s);
  if (o.login) return login(chromium, exe.path, o.site, o.login, log);
  const cast = o.only ? CAST.filter((c) => o.only.includes(c.name.toLowerCase()) || o.only.includes(slug(c.name))) : CAST;
  const bots = [];
  try {
    log(`crew → ${o.site}`);
    for (const spec of cast) { const b = await launchBot(chromium, exe.path, o.site, spec, log); if (b) { bots.push(b); log(`  ${spec.name} signed in`); } }
    if (!bots.length) throw new Error("no bot could sign in");
    if (o.check) { log(`check: ${bots.length} of ${cast.length} bots signed in and named`); return; }
    const room = await pickRoom(bots[0].page, o);
    log(`room: ${room.host || "?"} — ${room.title || ""} (${room.id})`);
    const crew = new Crew({ bots, roomId: room.id, scenario: o.scenario || null, log });
    const stop = () => crew.finish("stopped from the terminal");
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    await crew.start();
    await crew.say(crew.ear, `the crew is here (${crew.bots.map((b) => b.spec.name).join(", ")}) — orders start with "crew:" · crew: help`);
    const end = await crew.done;
    log(`crew finished: ${end.reason}`);
  } finally {
    for (const b of bots) { try { await b.close(); } catch (e) {} }
  }
}

module.exports = { Crew, PAGE, findPerson, pickRoom, credsFor };

if (require.main === module) {
  main().then(() => process.exit(0), (e) => { console.error("crew: " + String((e && e.message) || e)); process.exit(1); });
}
