/* GATE 61 — no-client-room-writes (scope): four direct `rooms` table writes
 * the client used to make on its own authority now go through RPCs instead
 * (fix/no-client-room-writes).  This gate is the STATIC half of the claim —
 * source-text proof that the raw writes are gone and the RPC calls replaced
 * them — mirroring METHOD's rule (this file, 2026-08-20 addition): a
 * source-text claim is proven by regex against ctx.html, not by runtime
 * introspection.
 *
 * WHAT MOVED, AND TO WHAT:
 *   1. startHostPoll's empty-stage janitor: phase/round/spotlight_target/
 *      phase_deadline raw write -> reset_to_preshow(room_id)
 *   2. passPickOpen's shared-deadline write -> set_phase_deadline(room_id, until_ts)
 *   3. recruitOpen's shared-deadline write -> set_phase_deadline(room_id, until_ts)
 *      (same RPC, same call shape, second call site — hence count >= 2 below)
 *   4. segmentCollapse's spotlight_target clear -> clear_spotlight_target(room_id)
 *   5. eg_skip's phase/deadline/target write -> end_deliberation(room_id) —
 *      REVISED 2026-08-20: an earlier ruling swapped this onto the EXISTING
 *      skip_phase RPC, but skip_phase is a single-step phase-order walker
 *      (verified against all 6 of its real production call sites) and SPEC
 *      wave 5 requires eg_skip to jump STRAIGHT to deciding, one press one
 *      fire.  Gates 07 and 30 caught the contradiction red.  The ruling was
 *      overturned: eg_skip gets its OWN function, end_deliberation — a
 *      FIFTH DDL function this branch adds, alongside the original four.
 *
 * WHAT DID NOT MOVE, ON PURPOSE, LOGGED NOT FIXED:
 *   - the two `status:"ended"` janitor/leave writes and the host_seen_at
 *     heartbeat write.  Same "host owns her room row" precedent as the ones
 *     that moved, but not named in this branch's scope — asserted PRESENT
 *     below so a later cleanup pass finds them logged, not rediscovers them.
 *
 * Functions 1-3 (reset_to_preshow, set_phase_deadline, clear_spotlight_target)
 * and function 4 (step_down, not yet wired to any client call site) are
 * PENDING PRODUCTION DDL — posted to the advisor one at a time, none of them
 * run against production until each gets its own explicit go.  This gate,
 * gate 62, and gate 63 all run against the LOCAL double only, which is why
 * they can be green before that go-ahead: the double is not the server.
 */
"use strict";

module.exports = {
  name: "no-client-room-writes",
  async run(t, ctx) {
    const html = ctx.html;

    t.ok(!/await sb\.from\("rooms"\)\.update\(\{phase:"preshow",round:0,spotlight_target:null,phase_deadline:null\}\)/.test(html),
      "the empty-stage janitor's raw preshow-reset write is gone from source");
    t.ok(/sb\.rpc\("reset_to_preshow",\{room_id:CURRENT_ROOM\.id\}\)/.test(html),
      "...replaced by a reset_to_preshow RPC call");

    t.ok(!/await sb\.from\("rooms"\)\.update\(\{phase_deadline:new Date\(until\)\.toISOString\(\)\}\)/.test(html),
      "the raw phase_deadline writer pattern is gone from source");
    const deadlineCalls = (html.match(/sb\.rpc\("set_phase_deadline",\{room_id:CURRENT_ROOM\.id,until_ts:new Date\(until\)\.toISOString\(\)\}\)/g) || []).length;
    t.ok(deadlineCalls === 2, `...replaced by set_phase_deadline RPC calls at BOTH call sites (passPickOpen + recruitOpen) — got ${deadlineCalls}`);

    t.ok(!/await sb\.from\("rooms"\)\.update\(\{spotlight_target:null\}\)/.test(html),
      "segmentCollapse's raw spotlight_target-clear write is gone from source");
    t.ok(/sb\.rpc\("clear_spotlight_target",\{room_id:CURRENT_ROOM\.id\}\)/.test(html),
      "...replaced by a clear_spotlight_target RPC call");

    t.ok(!/phase:"deciding",\s*\n\s*phase_deadline:new Date\(Date\.now\(\)/.test(html),
      "eg_skip's raw phase/deadline/target write is gone from source");
    t.ok(/\$\("eg_skip"\)\.onclick=async\(\)=>\{[\s\S]{0,400}?sb\.rpc\("end_deliberation",\{room_id:CURRENT_ROOM\.id\}\)/.test(html),
      "...eg_skip now calls end_deliberation — its OWN new RPC, not the shared skip_phase (2026-08-20 ruling overturning the earlier one)");
    t.ok(!/\$\("eg_skip"\)\.onclick=async\(\)=>\{[\s\S]{0,400}?sb\.rpc\("skip_phase"/.test(html),
      "...and NOT skip_phase — that would silently retire SPEC wave 5's straight-to-deciding contract (gates 07/30 caught this live)");

    // logged, not fixed — same disease, different scope, PR2-style residue note
    t.ok((html.match(/sb\.from\("rooms"\)\.update\(\{status:"ended"\}\)/g) || []).length === 2,
      "the two status:'ended' raw writes are UNTOUCHED — out of this branch's named scope, logged not fixed");
    t.ok(/sb\.from\("rooms"\)\.update\(\{host_seen_at:new Date\(\)\.toISOString\(\)\}\)/.test(html),
      "...and the host_seen_at heartbeat raw write is UNTOUCHED for the same reason");

    // scope: prove the four-function trail doesn't quietly widen — exactly
    // three sb.from("rooms").update( call sites should remain in source
    const remaining = (html.match(/sb\.from\("rooms"\)\.update\(/g) || []).length;
    t.ok(remaining === 3, `exactly 3 raw rooms.update( call sites remain (the logged-not-fixed ones) — got ${remaining}`);

    /* AUDIT 2026-08-21: the allowlist was stated only as a COUNT of leftovers.
       The claim this gate is named for — "no client writes to rooms outside
       the GO-LIVE insert" — also has a positive half, and it was unasserted:
       nothing here stopped a second rooms.insert( appearing, which is a raw
       client write to the same table by another door. */
    const inserts = (html.match(/sb\.from\("rooms"\)\.insert\(/g) || []).length;
    t.ok(inserts === 1, `exactly 1 raw rooms.insert( call site — the GO-LIVE insert — got ${inserts}`);
    t.ok(/sb\.from\("rooms"\)\.insert\(\{host_id:ME\.id,contestant_name:name,tagline:tag,status:"live"\}\)/.test(html),
      "...and it IS the GO-LIVE insert (host_id/contestant_name/tagline/status:'live'), not some other row creation wearing the allowlist's name");
  },
};
