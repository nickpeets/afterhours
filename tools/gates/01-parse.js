/* GATE 1 — parse: index.html parses; the JS has no syntax errors. */
"use strict";
const acorn = require("acorn");

function scripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push({ code: m[1], at: html.slice(0, m.index).split("\n").length });
  return out;
}

module.exports = {
  name: "parse",
  async run(t, ctx) {
    const html = ctx.html;
    t.ok(/^<!DOCTYPE html>/i.test(html.trim()), "doctype present");
    t.ok(/<html[\s>]/.test(html) && /<\/html>\s*$/.test(html.trim()), "<html> element opens and closes");
    t.ok(/<head[\s>]/.test(html) && /<\/head>/.test(html), "<head> present");
    t.ok(/<body[\s>]/.test(html) && /<\/body>/.test(html), "<body> present");
    const opens = (html.match(/<script\b/g) || []).length;
    const closes = (html.match(/<\/script>/g) || []).length;
    t.ok(opens === closes, `every <script> closes (${opens} open / ${closes} close)`);
    const styleOpens = (html.match(/<style\b/g) || []).length;
    const styleCloses = (html.match(/<\/style>/g) || []).length;
    t.ok(styleOpens === styleCloses, `every <style> closes (${styleOpens} open / ${styleCloses} close)`);

    const inline = scripts(html);
    t.ok(inline.length >= 1, "at least one inline script found");
    for (const s of inline) {
      try {
        acorn.parse(s.code, { ecmaVersion: "latest" });
        t.ok(true, "script @L" + s.at + " parses");
      } catch (e) {
        t.fail("script @L" + s.at + " has a syntax error: " + e.message);
      }
    }
  },
};
