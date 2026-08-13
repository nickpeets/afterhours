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
 * BE HONEST ABOUT WHAT THIS IS: A DEFECT SHAPE THAT HAS NOT YET BEEN
 * TRIGGERED, not an observed failure.  Measured in production 2026-08-13:
 * 279 seat events, every target_user 36 chars (a dashed uuid), zero 32-char
 * md5-shaped ids, zero NULLs.  The miss has NEVER fired.  What the raise
 * buys is that the NEXT bad id is loud instead of invisible — and the mask
 * (active_members rewriting other people's line rows behind
 * md5(room_id||user_id) during a running show) has already shown one route
 * by which a bad id can exist: a 32-hex md5 IS a valid uuid literal to
 * Postgres — it parses, matches nobody, and vanishes.  This gate exists so
 * that the first time the trap fires is in a harness, not in front of five
 * strangers.  It does not claim to have caught it firing.
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
