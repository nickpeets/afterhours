/* GATE 51 — seat-truth: seating a ghost must fail LOUDLY, and write no history.
 *
 * PROVENANCE, labelled per METHOD rule 12.  Forged against the real defect,
 * read off the SERVER (pg_get_functiondef, 2026-08-13), not against a
 * remembered read and not as a regression lock:
 *
 *   The production seat_member ended `update … returning * into v_member;`
 *   then INSERTED THE SEAT EVENT AND RETURNED, with no check between.  A
 *   user_id matching nobody meant: zero rows updated, no error, v_member
 *   null — and the event insert still fired, writing target_user: NULL.
 *   hostSeat() only tests `if(error)`, so the failure could never reach a
 *   toast.  A silent no-op that also manufactures history with a hole where
 *   the person should be.
 *
 * CORRECTED 2026-08-14: THE TRAP FIRED.  SEVENTEEN TIMES, IN PRODUCTION.
 * This header used to say the miss had "NEVER fired", resting on a
 * 2026-08-13 measurement: 279 seat events, every target_user 36 chars,
 * zero 32-char md5-shaped ids, zero NULLs.  That was a LENGTH check
 * against a shape the server does not emit.  The mask is a SALTED md5
 * CAST ::uuid — 36 characters WITH dashes — so a masked id is
 * length-indistinguishable from a real uuid, and the measurement was
 * blind by construction.  Preimage-matching the ledger's target_user
 * values against md5 masks (2026-08-14) found 17 real seat attempts whose
 * target matched a masked id: the host's mid-show bench tap passed a
 * masked id to seat_member's bare no-check UPDATE, zero rows moved, no
 * error surfaced, and the event insert manufactured history anyway.
 * Seventeen men tapped in, waited, were chosen, and never got their
 * chair.  The wrong measurement is left described here, per METHOD (a
 * wrong document is corrected where it stood, not silently replaced):
 * the number was real; the conclusion drawn from it was invented.
 * The raise this gate pins means the EIGHTEENTH is loud.
 *
 * THE DOUBLE ALREADY THREW, AND THAT IS ITS OWN SMALL FINDING.  Its
 * seat_member has raised "no such member" since it was written — the sixth
 * divergence from the server found this week, and the first in the SAFE
 * direction.  Which means: A DOUBLE CAN BE WRONG BY BEING BETTER.  Every
 * gate written against it passed on a contract production never had, and
 * nobody could tell, because green looks the same for the right and wrong
 * reasons.  This gate asserts the contract explicitly so that if anyone
 * ever "fixes" the double to match the old server's silence, it goes red.
 *
 * Assertions are over behaviour, not message text: a raise happens, no seat
 * event lands for the failed call, no member row moves.  Message wording may
 * change; the shape must not.
 */
"use strict";
const { Harness } = require("../lib/harness");

module.exports = {
  name: "seat-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@seat.test" });
      ["u_a", "u_b"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_seat", host_id: hostU, name: "Seat", phase: "preshow", round: 0 });
      D.addMember(room, "u_a", "line");
      D.addMember(room, "u_b", "line");
      D.loginClient("host", hostU);

      const eventsBefore = D.events.filter((e) => e.type === "seat").length;
      const rowsBefore = JSON.stringify(D.members);

      /* ---- 1. a ghost id: raise, no event, no movement ---- */
      let threw = null;
      try { D.rpc("host", "seat_member", { room_id: room, user_id: "u_nobody", seat_index: 0 }); }
      catch (e) { threw = e.message; }
      t.ok(threw !== null,
        `seating an id that matches nobody RAISES — it does not return a polite null (threw: ${JSON.stringify(threw)})`);
      t.ok(D.events.filter((e) => e.type === "seat").length === eventsBefore,
        "…and writes NO seat event: history records seatings that happened, not seatings that were attempted");
      t.ok(JSON.stringify(D.members) === rowsBefore,
        "…and moves no member row");

      /* ---- 2. the md5 shape specifically — the armed trap ---- */
      const hash = "d41d8cd98f00b204e9800998ecf8427e";   // 32 hex chars, no dashes: what the mask emits
      let threwHash = null;
      try { D.rpc("host", "seat_member", { room_id: room, user_id: hash, seat_index: 0 }); }
      catch (e) { threwHash = e.message; }
      t.ok(threwHash !== null,
        "a MASKED id — 32-hex md5, the exact shape active_members emits for other people's bench rows mid-show — raises rather than vanishing. This is the trap that was armed and had never fired");
      t.ok(D.events.filter((e) => e.type === "seat").length === eventsBefore,
        "…and the masked miss writes no event either");

      /* ---- 3. the real man still seats, and history says so ---- */
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_a", seat_index: 0 });
      const row = D.memberRow(room, "u_a");
      t.ok(row && row.role === "chair" && row.seat_index === 0,
        `a real id seats normally (role=${row && row.role}, seat=${row && row.seat_index}) — the raise did not make success stricter`);
      const seats = D.events.filter((e) => e.type === "seat");
      t.ok(seats.length === eventsBefore + 1 && seats[seats.length - 1].payload.target_user === "u_a",
        "…and exactly one seat event lands, naming the man who actually sat down");
    } finally { await h.close(); }
  },
};
