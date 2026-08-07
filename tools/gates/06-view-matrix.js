/* GATE 6 — view-matrix: every role × phase combination renders.
 * Roles: host, chair suitor, line suitor, spectator.
 * Phases: classic (null) plus every engine phase the client handles.
 * Checks per cell: room shown, exactly one top-level screen visible
 * (nothing stacked), no horizontal overflow (nothing outside the viewport),
 * top bar visible, hero present, no console errors.
 */
"use strict";
const { Harness } = require("../lib/harness");

const PHASES = [null, "preshow", "showstart", "spotlight", "openfloor", "deliberation", "deciding"];
const ROLES = ["host", "chair", "line", "spectator"];

module.exports = {
  name: "view-matrix",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      for (const phase of PHASES) {
        for (const role of ROLES) {
          const cell = `${role} × ${phase || "classic"}`;
          // fresh world per cell — no state bleed between renders
          h.double.users.clear(); h.double.profiles.clear(); h.double.rooms.clear();
          h.double.members.length = 0; h.double.events.length = 0;

          const host = h.double.addUser({ id: "u_host", name: "Hostess", email: "h@fix.test" });
          const chairs = [0, 1, 2].map((i) => h.double.addUser({ id: "u_c" + i, name: "Chair " + i }));
          const liner = h.double.addUser({ id: "u_l0", name: "Liner" });
          const spec = h.double.addUser({ id: "u_sp", name: "Watcher" });

          const uid = role === "host" ? host : role === "chair" ? chairs[0] : role === "line" ? liner : spec;
          const c = await h.newClient("vm-" + role + "-" + phase);
          c.login(uid);
          await c.goto();
          await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

          // seed the room AFTER boot: enterApp's crash-recovery ends any live
          // room its owner already has, so a pre-seeded host room dies on login
          const room = h.double.addRoom({ id: "r_m", host_id: host, name: "Matrix Night", phase, round: phase ? 1 : 0 });
          if (phase && phase !== "preshow") h.double.rooms.get(room).phase_deadline = h.double.iso(h.double.now() + 60_000);
          if (phase === "spotlight") h.double.rooms.get(room).spotlight_target = "u_c0";
          chairs.forEach((cu, i) => h.double.addMember(room, cu, i === 2 ? "kept" : "chair", { seat_index: i }));
          h.double.addMember(room, liner, "line");
          h.double.addMember(room, spec, "spectator");

          // enter through the real room-open path with the real room row
          const roomRow = { ...h.double.rooms.get(room) };
          await c.page.evaluate((r) => window.__lc.openRoom(r), roomRow);
          await c.page.waitForSelector("#room.show", { timeout: 10000 });

          const shot = await c.page.evaluate(() => {
            const vis = (el) => el && getComputedStyle(el).display !== "none" && el.offsetParent !== null;
            const screens = ["auth", "setup", "lobby"].filter((id) => {
              const el = document.getElementById(id);
              return el && getComputedStyle(el).display !== "none" && !el.classList.contains("hide");
            });
            const room = document.getElementById("room");
            const doc = document.scrollingElement;
            return {
              roomShown: room.classList.contains("show"),
              otherScreens: screens,
              hOverflow: doc.scrollWidth - window.innerWidth,
              topbar: vis(document.querySelector(".lc-top")),
              hero: !!document.getElementById("rt_hero"),
              phaseClass: room.className,
            };
          });
          t.ok(shot.roomShown, cell + ": room is shown");
          t.ok(shot.otherScreens.length === 0, cell + ": nothing stacked behind the room (visible: " + shot.otherScreens.join(",") + ")");
          t.ok(shot.hOverflow <= 1, cell + ": no horizontal overflow (" + shot.hOverflow + "px past the viewport)");
          t.ok(shot.topbar, cell + ": top bar renders");
          t.ok(shot.hero, cell + ": hero container present");
          const errs = c.errors.filter((e) => !/favicon/.test(e));
          t.ok(errs.length === 0, cell + ": zero console errors — " + errs.slice(0, 2).join(" | "));
          await c.close();
        }
      }
    } finally { await h.close(); }
  },
};
