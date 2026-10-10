// daily-room - creates/ensures a Daily.co room and mints a meeting token.
// Required secrets (Supabase Dashboard > Edge Functions > Secrets):
//   DAILY_API_KEY   - Daily REST API key (never committed to the repo)
//   DAILY_SUBDOMAIN - e.g. "afterhours"
// Provided by Supabase to every function (nothing to set):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// WHO MAY HAVE A TOKEN (fix/daily-token-auth, 2026-10-10)
//   1. Only a signed-in user.  The caller's Supabase session JWT (the
//      Authorization header the app already sends) is checked with the Auth
//      server on every request; anything else is refused with 401.
//      NOTE: the dashboard's "Verify JWT with legacy secret" switch must
//      stay OFF.  This project signs sessions with an ECC (P-256) key, and
//      that switch only accepts tokens signed with the legacy secret - it
//      would turn every signed-in user away.  The check is done here.
//   2. An OWNER token (is_owner: true) only for the room's host - the caller
//      must be rooms.host_id for that room.  Anyone else asking is refused.
//   3. mode: "preview" - the lobby's live feed.  A hidden, receive-only
//      token, issued only while the room's row is 'live', and good for
//      JOINING for five minutes.  (It is not ejected at expiry: the lobby
//      takes its previews down when a room leaves list_live_rooms.)
//   4. Every other request is what it always was: a member token for the
//      room, named as the caller asked.
//
// Meeting-token properties used, all from Daily's reference
// (https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token):
//   room_name   "The room for which this token is valid."
//   exp         "Users cannot join a meeting with this token after this time."
//   is_owner    "The user has meeting owner privileges."
//   user_name   "The user's name in this meeting."
//   start_video_off / start_audio_off  "Disable the default behavior of
//                        automatically turning on a participant's camera /
//                        microphone on a direct join()".
//   enable_screenshare  "Sets whether or not the user is allowed to screen
//                        share."
//   permissions.hasPresence  "Whether the participant appears as "present"
//                        in the call, i.e. whether they appear in
//                        participants()."
//   permissions.canSend "Which types of media a participant should be
//                        permitted to send." - false means none.

const DAILY_API = "https://api.daily.co/v1";

// A room_id can be re-used hours after its first show. Daily keeps the room
// record after its exp passes, so a plain GET happily returns an EXPIRED room
// and every join against it fails. Any room that is already expired - or that
// dies within EXP_REFRESH_SEC - is deleted and re-created with a fresh window.
const ROOM_TTL_SEC = 60 * 60 * 6;
const EXP_REFRESH_SEC = 60 * 10;
const TOKEN_TTL_SEC = 60 * 60 * 4;
// A lobby preview's token may be used to JOIN for this long.  exp limits
// joining, not watching: a viewer already in the call is not ejected when it
// passes (no eject_at_token_exp - RULING 10/10).  The lobby itself takes a
// preview down when its room leaves list_live_rooms.
const PREVIEW_TTL_SEC = 60 * 5;
const PREVIEW_NAME = "lobby-preview";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function roomProperties(now: number) {
  return {
    enable_chat: false,
    enable_screenshare: false,
    start_video_off: false,
    start_audio_off: false,
    eject_at_room_exp: true,
    exp: now + ROOM_TTL_SEC,
  };
}

async function createRoom(
  roomName: string,
  headers: Record<string, string>,
  now: number,
): Promise<Response> {
  let res = await fetch(DAILY_API + "/rooms", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: roomProperties(now),
    }),
  });
  // Lost a race with a concurrent create - just re-read it.
  if (res.status === 400) {
    res = await fetch(DAILY_API + "/rooms/" + roomName, { headers });
  }
  return res;
}

// The signed-in user behind a session JWT, or null.  Asked of the Auth
// server, so signature, expiry and a revoked session are all its call.
async function signedInUser(
  supaUrl: string,
  anonKey: string,
  jwt: string,
): Promise<{ id: string } | null> {
  if (!jwt) return null;
  try {
    const res = await fetch(supaUrl + "/auth/v1/user", {
      headers: { "Authorization": "Bearer " + jwt, "apikey": anonKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && typeof user.id === "string" && user.id ? { id: user.id } : null;
  } catch {
    return null;
  }
}

// The room's row as the database has it.  { row } when the read worked
// (row is null if there is no such room), { failed: true } when it did not -
// the two are different answers and are never confused: a read that failed
// refuses, it does not guess.
async function roomRow(
  supaUrl: string,
  serviceKey: string,
  roomId: string,
): Promise<{ row: { id: string; host_id: string; status: string } | null; failed?: boolean }> {
  try {
    const res = await fetch(
      supaUrl + "/rest/v1/rooms?select=id,host_id,status&id=eq." + encodeURIComponent(roomId),
      { headers: { "Authorization": "Bearer " + serviceKey, "apikey": serviceKey } },
    );
    // 400: the id is not one this table could hold - there is no such room
    if (res.status === 400) return { row: null };
    if (!res.ok) return { row: null, failed: true };
    const rows = await res.json();
    return { row: Array.isArray(rows) && rows.length ? rows[0] : null };
  } catch {
    return { row: null, failed: true };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("DAILY_API_KEY");
  const subdomain = Deno.env.get("DAILY_SUBDOMAIN") || "afterhours";
  if (!apiKey) return json({ error: "DAILY_API_KEY not configured" }, 500);
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !anonKey || !serviceKey) {
    return json({ error: "supabase environment not configured" }, 500);
  }

  // 0. Only a signed-in user gets any further.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const caller = await signedInUser(supaUrl, anonKey, jwt);
  if (!caller) return json({ error: "not signed in" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const slug = String(body.room_id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  if (!slug) return json({ error: "room_id required" }, 400);

  const roomName = "ah-" + slug;
  const isPreview = body.mode === "preview";
  // A preview is never an owner, whatever it asks for.
  const isOwner = !isPreview && body.is_owner === true;
  const userName = isPreview ? PREVIEW_NAME : String(body.user_name ?? "guest").slice(0, 60);
  const now = Math.floor(Date.now() / 1000);

  // An owner token and a preview token both depend on the room's own row.
  // (A plain member token does not, and is issued as before.)
  if (isOwner || isPreview) {
    const { row, failed } = await roomRow(supaUrl, serviceKey, slug);
    if (failed) return json({ error: "could not read the room" }, 503);
    if (!row) return json({ error: "no such room" }, 404);
    if (isOwner && row.host_id !== caller.id) {
      return json({ error: "only the host may be owner" }, 403);
    }
    if (isPreview && row.status !== "live") {
      return json({ error: "room is not live" }, 403);
    }
  }

  const headers = {
    "Authorization": "Bearer " + apiKey,
    "Content-Type": "application/json",
  };

  // 1. Ensure the room exists AND still has a usable lifetime left.
  let room: any = null;
  let roomRes = await fetch(DAILY_API + "/rooms/" + roomName, { headers });

  if (roomRes.ok) {
    const existing = await roomRes.json();
    const exp = Number(existing?.config?.exp ?? 0);
    if (isPreview && exp > now) {
      // A lobby viewer never deletes a room: it watches the one that is
      // there, for as long as it lasts.
      room = existing;
    } else if (isPreview) {
      return json({ error: "room is not live" }, 403);
    } else if (!exp || exp <= now + EXP_REFRESH_SEC) {
      // Dead or dying: burn it down and re-create with the same config.
      await fetch(DAILY_API + "/rooms/" + roomName, { method: "DELETE", headers });
      roomRes = await createRoom(roomName, headers, now);
    } else {
      room = existing;
    }
  } else if (roomRes.status === 404) {
    roomRes = await createRoom(roomName, headers, now);
  }

  if (!room) {
    if (!roomRes.ok) {
      return json({
        error: "daily room error",
        status: roomRes.status,
        detail: await roomRes.text(),
      }, 502);
    }
    room = await roomRes.json();
  }

  const roomExp = Number(room?.config?.exp ?? 0) || null;

  // 2. Mint a meeting token scoped to this room + participant.
  const ttl = isPreview ? PREVIEW_TTL_SEC : TOKEN_TTL_SEC;
  const tokenExp = roomExp ? Math.min(now + ttl, roomExp) : now + ttl;
  const properties: Record<string, unknown> = {
    room_name: roomName,
    is_owner: isOwner,
    user_name: userName,
    exp: tokenExp,
  };
  if (isPreview) {
    // Hidden and receive-only: not in anyone's participants(), may send no
    // audio, video or screen, and camera and mic start off.
    properties.start_video_off = true;
    properties.start_audio_off = true;
    properties.enable_screenshare = false;
    properties.permissions = { hasPresence: false, canSend: false };
  }
  const tokenRes = await fetch(DAILY_API + "/meeting-tokens", {
    method: "POST",
    headers,
    body: JSON.stringify({ properties }),
  });

  if (!tokenRes.ok) {
    return json({
      error: "daily token error",
      status: tokenRes.status,
      detail: await tokenRes.text(),
    }, 502);
  }
  const minted = await tokenRes.json();

  return json({
    url: room.url || ("https://" + subdomain + ".daily.co/" + roomName),
    room_name: roomName,
    token: minted.token,
    is_owner: isOwner,
    preview: isPreview,
    expires_at: tokenExp,
    room_exp: roomExp,
  });
});
