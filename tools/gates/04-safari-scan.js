/* GATE 4 — safari-scan: iOS Safari survival rules.
 *   - every <video> (markup or created in JS) carries playsinline
 *   - the local video element is muted
 *   - no play() call inside any setInterval callback
 */
"use strict";
const acorn = require("acorn");
const walk = require("acorn-walk");

function jsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n/* --- */\n");
}

module.exports = {
  name: "safari-scan",
  async run(t, ctx) {
    const html = ctx.html;
    const js = jsOf(html);

    /* markup <video> tags — scan MARKUP only, scripts are scanned separately
       (the word "<video>" appears inside JS comments) */
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
    const markupVideos = [...markup.matchAll(/<video\b[^>]*>/g)];
    for (const v of markupVideos) {
      t.ok(/playsinline/i.test(v[0]), "markup <video> has playsinline: " + v[0].slice(0, 80));
    }
    if (!markupVideos.length) t.ok(true, "no static <video> markup (all videos are JS-created)");

    /* JS-created videos: each createElement("video") must set playsInline nearby */
    const creations = [...js.matchAll(/createElement\(\s*["']video["']\s*\)/g)];
    t.ok(creations.length >= 1, "found " + creations.length + " JS video creation site(s)");
    for (const c of creations) {
      const windowAfter = js.slice(c.index, c.index + 400);
      t.ok(/playsInline\s*=\s*true|setAttribute\(\s*["']playsinline["']/.test(windowAfter),
        "video created @L" + js.slice(0, c.index).split("\n").length + " sets playsinline within its setup");
    }

    /* local element muted: the tile builder must mute self, the headshot preview must mute */
    t.ok(/muted\s*=\s*\(?\s*uid\s*===\s*ME\.id/.test(js), "tile video mutes the local user (muted = uid===ME.id)");
    t.ok(/v\.playsInline\s*=\s*true;\s*v\.muted\s*=\s*true/.test(js) || /muted\s*=\s*true/.test(js),
      "headshot preview video is muted");

    /* no play() inside a setInterval callback */
    let ast;
    try { ast = acorn.parse(js, { ecmaVersion: "latest" }); }
    catch (e) { t.fail("JS did not parse for AST scan: " + e.message); return; }
    const offenders = [];
    walk.simple(ast, {
      CallExpression(node) {
        const callee = node.callee;
        const isSetInterval = (callee.type === "Identifier" && callee.name === "setInterval");
        if (!isSetInterval || !node.arguments.length) return;
        const fnArg = node.arguments[0];
        if (!/Function/.test(fnArg.type)) return;
        walk.simple(fnArg, {
          CallExpression(inner) {
            const c = inner.callee;
            if (c.type === "MemberExpression" && c.property && c.property.name === "play")
              offenders.push("play() inside setInterval @src-offset " + inner.start);
          },
        });
      },
    });
    t.ok(offenders.length === 0, "no play() on an interval" + (offenders.length ? " — " + offenders.join("; ") : ""));
  },
};
