/* GATE 2 — css-parse: css-tree parse of all stylesheets, zero errors. */
"use strict";
const csstree = require("css-tree");

module.exports = {
  name: "css-parse",
  async run(t, ctx) {
    const blocks = [];
    const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let m;
    while ((m = re.exec(ctx.html))) blocks.push({ css: m[1], at: ctx.html.slice(0, m.index).split("\n").length });
    t.ok(blocks.length >= 1, "at least one <style> block found");
    // inline style="" attributes parse as declaration lists — scan MARKUP only
    // (template literals inside <script> contain style="${...}" interpolations)
    const markup = ctx.html.replace(/<script[\s\S]*?<\/script>/g, "");
    const inlineStyles = [...markup.matchAll(/ style="([^"]*)"/g)].map((x) => x[1]);
    for (const b of blocks) {
      const errors = [];
      csstree.parse(b.css, { positions: true, onParseError: (e) => errors.push(e.formattedMessage || e.message) });
      t.ok(errors.length === 0,
        `<style> @L${b.at} parses clean` + (errors.length ? ` — ${errors.length} error(s): ${errors.slice(0, 3).join(" | ")}` : ""));
    }
    let inlineErrs = 0;
    for (const s of inlineStyles) {
      csstree.parse(s, { context: "declarationList", onParseError: () => inlineErrs++ });
    }
    t.ok(inlineErrs === 0, `${inlineStyles.length} inline style attributes parse clean (${inlineErrs} errors)`);
  },
};
