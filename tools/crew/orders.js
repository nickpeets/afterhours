/* orders.js — the host's chat orders to the crew, parsed.
 *
 * Only a line that STARTS with "crew:" is an order, and crew.js only reads
 * lines the HOST wrote.  Everything else in chat is the show.
 *
 *   crew: jeer Dex [tomato|pie|boo|cricket] [from B]
 *   crew: rose Dex [from C]               (rose petals: a cheer that mends a crack)
 *   crew: cheer Dex [confetti|sparkle|hearts|petals] [from A]
 *   crew: hearts Dex 3                    (taps of the heart, spread over the crowd bots)
 *   crew: ovation Dex                     (all three crowd bots cheer him within 2s)
 *   crew: booed Dex                       (all three crowd bots jeer him within 2s)
 *   crew: leave Marco                     (he leaves his chair or the bench)
 *   crew: bench Leo                       (he takes a bench seat)
 *   crew: status | crew: help | crew: done
 */
"use strict";

const CHEERS = ["petals", "hearts", "confetti", "sparkle"];
const JEERS = ["tomato", "pie", "boo", "cricket"];
const VERBS = ["jeer", "rose", "cheer", "hearts", "ovation", "booed", "leave", "bench", "status", "help", "done"];
const HELP = "crew orders: jeer|rose|cheer|hearts N|ovation|booed|leave|bench <name> · status · done";

function parseOrder(text) {
  const m = /^\s*crew\s*:\s*(.*)$/i.exec(String(text || ""));
  if (!m) return null;                                   // not an order at all
  const words = m[1].trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { verb: "help" };
  const verb = words.shift().toLowerCase();
  if (!VERBS.includes(verb)) return { verb: "unknown", said: verb };
  const o = { verb };
  // "from B" / "from Crowd B" at the end picks the thrower
  const fi = words.map((w) => w.toLowerCase()).lastIndexOf("from");
  if (fi >= 0) {
    const who = words.splice(fi).slice(1).join(" ");
    o.from = /^[abc]$/i.test(who) ? "Crowd " + who.toUpperCase() : who;
  }
  if (verb === "hearts") {
    const last = words[words.length - 1];
    if (last && /^\d+$/.test(last)) { o.n = Math.min(20, Math.max(1, parseInt(words.pop(), 10))); }
    else o.n = 1;
  }
  if (verb === "jeer" || verb === "cheer") {
    const last = (words[words.length - 1] || "").toLowerCase();
    const pool = verb === "jeer" ? JEERS : CHEERS;
    if (pool.includes(last)) { o.kind = last; words.pop(); }
    else o.kind = verb === "jeer" ? "tomato" : "confetti";
  }
  if (verb === "rose") o.kind = "petals";
  if (["jeer", "rose", "cheer", "hearts", "ovation", "booed", "leave", "bench"].includes(verb)) {
    o.target = words.join(" ");
    if (!o.target) return { verb: "unknown", said: verb + " (who?)" };
  }
  return o;
}

module.exports = { parseOrder, CHEERS, JEERS, HELP };
