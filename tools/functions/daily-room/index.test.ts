// daily-room — offline tests.  Run from this directory:
//
//     deno test --allow-env index.test.ts
//
// The function is loaded UNCHANGED (index.ts as deployed): Deno.serve is
// captured to get its handler, and fetch is replaced by a small world that
// plays the three services the function talks to — Supabase Auth
// (/auth/v1/user), the rooms table (/rest/v1/rooms) and Daily's REST API.
// Nothing here touches the network, and nothing here proves what Daily does
// with a token — only what this function ASKS Daily for, and whom it refuses.

type Json = Record<string, unknown>;
const NOW = () => Math.floor(Date.now() / 1000);

const HOST = "11111111-1111-4111-8111-111111111111";
const GUEST = "22222222-2222-4222-8222-222222222222";
const WINNER = "33333333-3333-4333-8333-333333333333";
const LIVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENDED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DYING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOSUCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const world = {
  jwts: { "jwt-host": HOST, "jwt-guest": GUEST, "jwt-winner": WINNER } as Record<string, string>,
  rooms: {
    [LIVE]: { id: LIVE, host_id: HOST, status: "live" },
    [ENDED]: { id: ENDED, host_id: HOST, status: "ended" },
    [DYING]: { id: DYING, host_id: HOST, status: "live" },
  } as Record<string, Json>,
  roomsReadFails: false,
  daily: {} as Record<string, Json>,          // Daily room name -> room
  calls: [] as { method: string; url: string; body?: Json }[],
  minted: [] as Json[],                        // the `properties` of every token asked for
};
function reset() {
  world.roomsReadFails = false;
  world.daily = {
    ["ah-" + DYING]: { name: "ah-" + DYING, url: "https://afterhours.daily.co/ah-" + DYING, config: { exp: NOW() + 120 } },
  };
  world.calls = [];
  world.minted = [];
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  world.calls.push({ method, url, body });

  if (url === "https://proj.supabase.co/auth/v1/user") {
    if (headers.get("apikey") !== "anon-key") return reply({ msg: "no api key" }, 401);
    const uid = world.jwts[(headers.get("Authorization") || "").replace(/^Bearer /, "")];
    return uid ? reply({ id: uid, aud: "authenticated" }) : reply({ msg: "invalid JWT" }, 401);
  }
  if (url.startsWith("https://proj.supabase.co/rest/v1/rooms?")) {
    if (world.roomsReadFails) return reply({ message: "upstream" }, 500);
    if (headers.get("apikey") !== "service-key" || headers.get("Authorization") !== "Bearer service-key") return reply([], 401);
    const id = decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || "");
    const row = world.rooms[id];
    return reply(row ? [row] : []);
  }
  if (url.startsWith("https://api.daily.co/v1/rooms")) {
    if (headers.get("Authorization") !== "Bearer daily-key") return reply({ error: "unauthorized" }, 401);
    const name = url.split("/rooms/")[1];
    if (method === "GET") return world.daily[name] ? reply(world.daily[name]) : reply({ error: "not-found" }, 404);
    if (method === "DELETE") { delete world.daily[name]; return reply({ deleted: true }); }
    if (method === "POST") {
      const room = { name: body.name, url: "https://afterhours.daily.co/" + body.name, config: body.properties };
      world.daily[body.name as string] = room;
      return reply(room);
    }
  }
  if (url === "https://api.daily.co/v1/meeting-tokens" && method === "POST") {
    world.minted.push(body.properties as Json);
    return reply({ token: "tok-" + world.minted.length });
  }
  return reply({ error: "unexpected request in test: " + method + " " + url }, 599);
}) as typeof fetch;

// load the function exactly as deployed, capturing its handler
Deno.env.set("DAILY_API_KEY", "daily-key");
Deno.env.set("DAILY_SUBDOMAIN", "afterhours");
Deno.env.set("SUPABASE_URL", "https://proj.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
let handler: (req: Request) => Promise<Response> = () => Promise.reject(new Error("no handler"));
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (req: Request) => Promise<Response>) => { handler = h; return {}; };
await import("./index.ts");

async function ask(jwt: string | null, body: Json, method = "POST") {
  reset();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jwt) headers["Authorization"] = "Bearer " + jwt;
  const res = await handler(new Request("https://proj.supabase.co/functions/v1/daily-room", {
    method, headers, body: method === "POST" ? JSON.stringify(body) : undefined,
  }));
  const text = await res.text();
  let data: Json = {};
  try { data = JSON.parse(text); } catch { /* "ok" */ }
  return { status: res.status, data, minted: world.minted.slice(), calls: world.calls.slice() };
}
function eq(got: unknown, want: unknown, what: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(what + " — got " + JSON.stringify(got) + ", want " + JSON.stringify(want));
}
const ok = (cond: unknown, what: string) => { if (!cond) throw new Error(what); };
const dailyCalls = (r: { calls: { url: string }[] }) => r.calls.filter((c) => c.url.startsWith("https://api.daily.co")).length;
const roomReads = (r: { calls: { url: string }[] }) => r.calls.filter((c) => c.url.includes("/rest/v1/rooms")).length;

Deno.test("1. nobody signed in is refused, before Daily is ever asked", async () => {
  for (const jwt of [null, "anon-key", "not-a-token", ""]) {
    const r = await ask(jwt, { room_id: LIVE, user_name: GUEST, is_owner: false });
    eq(r.status, 401, "status for " + JSON.stringify(jwt));
    eq(r.minted.length, 0, "tokens minted");
    eq(dailyCalls(r), 0, "Daily calls");
  }
  const owner = await ask(null, { room_id: LIVE, user_name: HOST, is_owner: true });
  eq(owner.status, 401, "an unsigned owner request");
  const pv = await ask(null, { room_id: LIVE, mode: "preview" });
  eq(pv.status, 401, "an unsigned preview request");
});

Deno.test("EXISTING PATH crowd / bench / chair: a signed-in member's token is what it always was", async () => {
  const r = await ask("jwt-guest", { room_id: LIVE, user_name: GUEST, is_owner: false });
  eq(r.status, 200, "status");
  eq(Object.keys(r.minted[0]).sort(), ["exp", "is_owner", "room_name", "user_name"], "token properties");
  eq([r.minted[0].room_name, r.minted[0].is_owner, r.minted[0].user_name], ["ah-" + LIVE, false, GUEST], "token values");
  ok((r.minted[0].exp as number) > NOW() + 3 * 3600, "a member token still lasts hours");
  eq([r.data.url, r.data.token, r.data.is_owner, r.data.preview], ["https://afterhours.daily.co/ah-" + LIVE, "tok-1", false, false], "response");
  eq(roomReads(r), 0, "a plain member token reads no table (as before)");
});

Deno.test("EXISTING PATH host: the room's host gets her owner token", async () => {
  const r = await ask("jwt-host", { room_id: LIVE, user_name: HOST, is_owner: true });
  eq(r.status, 200, "status");
  eq([r.minted[0].is_owner, r.minted[0].user_name, r.data.is_owner], [true, HOST, true], "owner token for the host");
  eq(Object.keys(r.minted[0]).sort(), ["exp", "is_owner", "room_name", "user_name"], "token properties");
});

Deno.test("2. is_owner:true from anyone who is not that room's host is refused", async () => {
  const r = await ask("jwt-guest", { room_id: LIVE, user_name: GUEST, is_owner: true });
  eq(r.status, 403, "status");
  eq(r.minted.length, 0, "tokens minted");
  eq(dailyCalls(r), 0, "Daily calls");
  const spoof = await ask("jwt-guest", { room_id: LIVE, user_name: HOST, is_owner: true });
  eq(spoof.status, 403, "claiming the host's name does not make you the host");
  const none = await ask("jwt-host", { room_id: NOSUCH, user_name: HOST, is_owner: true });
  eq(none.status, 404, "an owner token for a room that does not exist");
  eq(none.minted.length, 0, "tokens minted for no such room");
});

Deno.test("EXISTING PATH backstage: host (owner) and winner both get in AFTER the room has ended", async () => {
  const host = await ask("jwt-host", { room_id: ENDED, mode: "winner", user_name: HOST, is_owner: true });
  eq([host.status, host.minted[0]?.is_owner, host.minted[0]?.room_name], [200, true, "ah-" + ENDED], "host backstage");
  const winner = await ask("jwt-winner", { room_id: ENDED, mode: "winner", user_name: WINNER, is_owner: false });
  eq([winner.status, winner.minted[0]?.is_owner, winner.minted[0]?.user_name], [200, false, WINNER], "winner backstage");
  eq(Object.keys(winner.minted[0]).sort(), ["exp", "is_owner", "room_name", "user_name"], "a backstage token carries no preview limits");
});

Deno.test("3. preview: hidden, receive-only, five minutes to join — and only while the room is live", async () => {
  const r = await ask("jwt-guest", { room_id: LIVE, mode: "preview", user_name: "lobby-preview", is_owner: false });
  eq(r.status, 200, "status");
  const p = r.minted[0];
  eq(p.permissions, { hasPresence: false, canSend: false }, "permissions");
  eq([p.start_video_off, p.start_audio_off, p.enable_screenshare], [true, true, false], "devices / screenshare");
  eq(Object.keys(p).sort(), ["enable_screenshare", "exp", "is_owner", "permissions", "room_name", "start_audio_off", "start_video_off", "user_name"],
    "preview token properties — and NO eject_at_token_exp: exp limits joining, not watching");
  eq([p.is_owner, p.user_name, p.room_name], [false, "lobby-preview", "ah-" + LIVE], "never an owner, never a user's name");
  ok((p.exp as number) <= NOW() + 300 && (p.exp as number) > NOW() + 240, "exp is five minutes out, got +" + ((p.exp as number) - NOW()) + "s");
  eq([r.data.preview, r.data.is_owner], [true, false], "response says it is a preview");

  const grab = await ask("jwt-guest", { room_id: LIVE, mode: "preview", user_name: HOST, is_owner: true });
  eq([grab.status, grab.minted[0].is_owner, grab.minted[0].user_name], [200, false, "lobby-preview"], "a preview asking to be owner / to be named as the host gets neither");
  eq(grab.minted[0].permissions, { hasPresence: false, canSend: false }, "…and is still hidden and receive-only");

  const ended = await ask("jwt-guest", { room_id: ENDED, mode: "preview" });
  eq([ended.status, ended.minted.length, dailyCalls(ended)], [403, 0, 0], "preview of an ENDED room: refused, nothing minted, Daily not asked");
  const none = await ask("jwt-guest", { room_id: NOSUCH, mode: "preview" });
  eq([none.status, none.minted.length], [404, 0], "preview of a room that does not exist");
  const hostPv = await ask("jwt-host", { room_id: ENDED, mode: "preview" });
  eq(hostPv.status, 403, "even the host gets no preview of an ended room");
});

Deno.test("3b. a preview never deletes a Daily room; a member join still refreshes a dying one", async () => {
  const pv = await ask("jwt-guest", { room_id: DYING, mode: "preview" });
  eq(pv.status, 200, "preview of a room in its last minutes");
  eq(pv.calls.filter((c) => c.method === "DELETE").length, 0, "DELETE calls made by a preview");
  ok((pv.minted[0].exp as number) <= NOW() + 120, "the preview token does not outlive the Daily room");
  const member = await ask("jwt-guest", { room_id: DYING, user_name: GUEST, is_owner: false });
  eq(member.status, 200, "member join on a dying room");
  eq(member.calls.filter((c) => c.method === "DELETE").length, 1, "the member path still burns down and re-creates a dying room (as before)");
});

Deno.test("a room read that FAILS refuses — it never guesses", async () => {
  reset();
  const run = async (jwt: string, body: Json) => {
    reset(); world.roomsReadFails = true;
    const res = await handler(new Request("https://proj.supabase.co/functions/v1/daily-room", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + jwt }, body: JSON.stringify(body) }));
    return { status: res.status, minted: world.minted.length };
  };
  eq(await run("jwt-host", { room_id: LIVE, user_name: HOST, is_owner: true }), { status: 503, minted: 0 }, "owner while the table is unreadable");
  eq(await run("jwt-guest", { room_id: LIVE, mode: "preview" }), { status: 503, minted: 0 }, "preview while the table is unreadable");
  eq(await run("jwt-guest", { room_id: LIVE, user_name: GUEST, is_owner: false }), { status: 200, minted: 1 }, "a plain member join does not depend on that read");
});

Deno.test("CORS preflight and bad requests behave as before", async () => {
  const pre = await ask(null, {}, "OPTIONS");
  eq(pre.status, 200, "OPTIONS needs no session");
  const get = await ask("jwt-guest", {}, "GET");
  eq(get.status, 405, "GET");
  const empty = await ask("jwt-guest", { user_name: GUEST });
  eq(empty.status, 400, "no room_id");
});
