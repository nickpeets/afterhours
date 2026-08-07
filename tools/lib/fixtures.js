/* fixtures.js — named roster fixtures for the battery.
 * A fixture seeds the shared BackendDouble and returns the ids it created.
 * The STANDARD fixture is the COUNT PARITY roster from the bug filing:
 *   host + 2 crowd + 3 bench + 2 chairs + 1 kept + 1 stale (last_seen 90s ago)
 * (The COUNT PARITY gate itself ships with the fix/count-truth branch; the
 * fixture lives here so every gate exercises the same shaped world.)
 */
"use strict";

function standardRoster(double) {
  const host = double.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
  const mk = (id, name) => double.addUser({ id, name, email: id + "@fix.test" });

  const crowd1 = mk("u_crowd1", "Crowd One");
  const crowd2 = mk("u_crowd2", "Crowd Two");
  const bench1 = mk("u_bench1", "Bench One");
  const bench2 = mk("u_bench2", "Bench Two");
  const bench3 = mk("u_bench3", "Bench Three");
  const chair1 = mk("u_chair1", "Chair One");
  const chair2 = mk("u_chair2", "Chair Two");
  const kept1  = mk("u_kept1", "Kept One");
  const stale1 = mk("u_stale1", "Stale One");

  const room = double.addRoom({ id: "r_std", host_id: host, name: "Fixture Night" });

  double.addMember(room, crowd1, "spectator");
  double.addMember(room, crowd2, "spectator");
  double.addMember(room, bench1, "line");
  double.addMember(room, bench2, "line");
  double.addMember(room, bench3, "line");
  double.addMember(room, chair1, "chair", { seat_index: 0 });
  double.addMember(room, chair2, "chair", { seat_index: 1 });
  double.addMember(room, kept1, "kept", { seat_index: 2 });
  double.addMember(room, stale1, "spectator", { ageMs: 90_000 });   // stale: last_seen 90s ago

  return { room, host, crowd: [crowd1, crowd2], bench: [bench1, bench2, bench3],
           chairs: [chair1, chair2], kept: [kept1], stale: [stale1] };
}

/* a fresh host with an empty live room (classic mode, no phase) */
function emptyRoom(double) {
  const host = double.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
  const room = double.addRoom({ id: "r_empty", host_id: host, name: "Quiet Night" });
  return { room, host };
}

/* engine-mode room in a given phase, with three seated suitors */
function phasedRoom(double, phase, { round = 1 } = {}) {
  const host = double.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
  const room = double.addRoom({ id: "r_phase", host_id: host, name: "Engine Night", phase, round });
  if (phase && phase !== "preshow") {
    // a live phase always carries a deadline in prod; without one, spotlight
    // renders its "awaiting" variant and every client nudges advance_phase
    double.rooms.get(room).phase_deadline = double.iso(double.now() + 60_000);
  }
  const suitors = ["u_s1", "u_s2", "u_s3"].map((id, i) => {
    const uid = double.addUser({ id, name: "Suitor " + (i + 1) });
    double.addMember(room, uid, "chair", { seat_index: i });
    return uid;
  });
  const watcher = double.addUser({ id: "u_watch", name: "Watcher" });
  double.addMember(room, watcher, "spectator");
  return { room, host, suitors, watcher };
}

/* lone signed-in user, no rooms at all (lobby empty state) */
function lonely(double) {
  const me = double.addUser({ id: "u_me", name: "Solo", email: "solo@fix.test" });
  return { me };
}

module.exports = { standardRoster, emptyRoom, phasedRoom, lonely };
