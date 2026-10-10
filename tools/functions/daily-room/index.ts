// daily-room - creates/ensures a Daily.co room and mints a meeting token.
// Required secrets (Supabase Dashboard > Edge Functions > Secrets):
//   DAILY_API_KEY   - Daily REST API key (never committed to the repo)
//   DAILY_SUBDOMAIN - e.g. "afterhours"

const DAILY_API = "https://api.daily.co/v1";

// A room_id can be re-used hours after its first show. Daily keeps the room
// record after its exp passes, so a plain GET happily returns an EXPIRED room
// and every join against it fails. Any room that is already expired - or that
// dies within EXP_REFRESH_SEC - is deleted and re-created with a fresh window.
const ROOM_TTL_SEC = 60 * 60 * 6;
const EXP_REFRESH_SEC = 60 * 10;
const TOKEN_TTL_SEC = 60 * 60 * 4;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("DAILY_API_KEY");
  const subdomain = Deno.env.get("DAILY_SUBDOMAIN") || "afterhours";
  if (!apiKey) return json({ error: "DAILY_API_KEY not configured" }, 500);

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
  const isOwner = body.is_owner === true;
  const userName = String(body.user_name ?? "guest").slice(0, 60);
  const now = Math.floor(Date.now() / 1000);

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
    if (!exp || exp <= now + EXP_REFRESH_SEC) {
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
  const tokenRes = await fetch(DAILY_API + "/meeting-tokens", {
    method: "POST",
    headers,
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: isOwner,
        user_name: userName,
        exp: roomExp ? Math.min(now + TOKEN_TTL_SEC, roomExp) : now + TOKEN_TTL_SEC,
      },
    }),
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
    expires_at: roomExp ? Math.min(now + TOKEN_TTL_SEC, roomExp) : now + TOKEN_TTL_SEC,
    room_exp: roomExp,
  });
});
