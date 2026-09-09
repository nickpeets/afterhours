/* GATE 69 - age-gate: the boundary is the calendar date (RULING 2026-09-09).
 * A person is 18 on their 18th birthday, local date, at any hour.
 *
 * STATIC: #set_bday carries no literal max="YYYY-MM-DD". The ceiling is
 *   computed at render time (the old literal max="2008-08-03" drifted a day
 *   per day; by 2026-09-09 it locked 37 days of 18-year-olds out of the
 *   picker).
 *
 * RUNTIME, through the real UI with the page clock PINNED (page.clock) and
 *   the context timezone set, so nothing here depends on when or where the
 *   battery runs:
 *   - #set_bday.max equals an oracle computed HERE from the pinned instant
 *     and zone, and equals window.__lc.adultMaxBirthdate() - the app's own
 *     boundary read through the one export, never reimplemented.
 *   - exactly 18 today proceeds at 00:05 local (UTC+14) and 23:55 local
 *     (UTC-11): setup closes, the profile carries the birthdate.
 *   - one day short refuses at both hours: the 18+ refusal shows, setup
 *     stays, nothing is written.
 *   - leap-born (2008-02-29): refused on 2026-02-28, proceeds on 2026-03-01.
 *     The function's rule: a Feb 29 birthday lands on Mar 1 in a non-leap
 *     year.
 */
"use strict";
const { Harness } = require("../lib/harness");

/* Independent oracle: local Y-M-D of an instant in a zone, minus 18 years,
   Feb 29 folded to Feb 28. Deliberately NOT the app's function. */
function localParts(instant, tz) {
  const o = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(instant).forEach((x) => { o[x.type] = x.value; });
  return o;
}
function oracleMax(instant, tz) {
  const l = localParts(instant, tz);
  const y = +l.year - 18, m = +l.month, d = +l.day;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(Math.min(d, dim))}`;
}
/* The instant whose LOCAL wall clock in tz reads localIso (zones used have no DST). */
function instantAtLocal(localIso, tz) {
  const guess = new Date(localIso + "Z");
  const s = localParts(guess, tz);
  const seenUtc = Date.UTC(+s.year, +s.month - 1, +s.day, +s.hour % 24, +s.minute, +s.second);
  return new Date(guess.getTime() - (seenUtc - guess.getTime()));
}

module.exports = {
  name: "age-gate",
  async run(t, ctx) {
    /* ---------- STATIC ---------- */
    const html = ctx.html;
    const inputTag = (html.match(/<input[^>]*id="set_bday"[^>]*>/) || [""])[0];
    t.ok(!!inputTag, "the #set_bday input exists in index.html");
    t.ok(!/\bmax="/.test(inputTag), "no literal max= on #set_bday - the ceiling is computed, not typed: " + inputTag);
    t.ok(!/max="20\d\d-\d\d-\d\d"/.test(html), "no max=\"YYYY-MM-DD\" literal anywhere in index.html");
    t.ok(/^\s*adultMaxBirthdate,\s*$/m.test(html), "adultMaxBirthdate is exported through window.__lc");
    t.ok(!/Date\.parse\(bday\)\)\/31557600000/.test(html), "the set_go check no longer divides by 365.25 days");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const MSG = /18\+/;
      let n = 0;
      // A fresh user lands in first-run setup when the profile lacks a zip.
      const openSetup = async (label, instant, tz) => {
        const uid = "u_age" + (++n);
        D.addUser({ id: uid, name: "Kid " + n });
        D.profiles.get(uid).zip_code = null;
        D.profiles.get(uid).birthdate = null;
        const c = await h.newClient(label, { timezoneId: tz });
        c.login(uid);
        await c.page.clock.setFixedTime(instant);
        await c.goto();
        await c.page.waitForSelector("#setup", { state: "visible", timeout: 15000 });
        return { c, uid };
      };
      const submit = async (c, bday) => {
        await c.page.fill("#set_name", "Kid");
        await c.page.fill("#set_zip", "97201");
        await c.page.fill("#set_bday", bday);
        await c.page.click("#set_go");
        await c.page.waitForTimeout(800);
        return c.page.evaluate(() => ({
          err: document.getElementById("set_err").textContent,
          setupShown: document.getElementById("setup").style.display !== "none",
        }));
      };
      const cases = [
        { label: "exactly-18 at 00:05 local (UTC+14)",           tz: "Pacific/Kiritimati", local: "2026-09-09T00:05:00", bday: "2008-09-09", expect: "proceed" },
        { label: "exactly-18 at 23:55 local (UTC-11)",           tz: "Pacific/Pago_Pago",  local: "2026-09-09T23:55:00", bday: "2008-09-09", expect: "proceed" },
        { label: "one-day-short at 23:55 local (UTC-11)",        tz: "Pacific/Pago_Pago",  local: "2026-09-09T23:55:00", bday: "2008-09-10", expect: "refuse"  },
        { label: "one-day-short at 00:05 local (UTC+14)",        tz: "Pacific/Kiritimati", local: "2026-09-09T00:05:00", bday: "2008-09-10", expect: "refuse"  },
        { label: "leap-born 2008-02-29 on 2026-02-28 (non-leap)", tz: "UTC",               local: "2026-02-28T12:00:00", bday: "2008-02-29", expect: "refuse"  },
        { label: "leap-born 2008-02-29 on 2026-03-01 (non-leap)", tz: "UTC",               local: "2026-03-01T00:05:00", bday: "2008-02-29", expect: "proceed" },
      ];
      for (const k of cases) {
        const instant = instantAtLocal(k.local, k.tz);
        const { c, uid } = await openSetup(k.label, instant, k.tz);
        const want = oracleMax(instant, k.tz);
        const gotMax = await c.page.evaluate(() => document.getElementById("set_bday").max);
        const lcMax = await c.page.evaluate(() => window.__lc.adultMaxBirthdate());
        t.ok(gotMax === want, `${k.label}: #set_bday.max is today-18y by the oracle (${gotMax} vs ${want})`);
        t.ok(lcMax === want, `${k.label}: window.__lc.adultMaxBirthdate() agrees with the oracle (${lcMax})`);
        const r = await submit(c, k.bday);
        const wrote = D.profiles.get(uid).birthdate;
        if (k.expect === "proceed") {
          t.ok(!MSG.test(r.err) && !r.setupShown, `${k.label}: proceeds - no 18+ refusal, setup closed (err="${r.err}")`);
          t.ok(wrote === k.bday, `${k.label}: the profile carries the birthdate (${wrote})`);
        } else {
          t.ok(MSG.test(r.err) && r.setupShown, `${k.label}: refused - 18+ message shown, setup stays (err="${r.err}")`);
          t.ok(wrote !== k.bday, `${k.label}: nothing written (birthdate=${wrote})`);
        }
      }
      const errs = h.clients.flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across all windows - " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
