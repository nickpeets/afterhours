/* harness.js — loads index.html in headless Chromium via playwright-core.
 *
 * Architecture: ONE BackendDouble in Node, MANY browser clients (windows).
 * Each client window loads the real, unmodified index.html from the repo
 * root over a routed https origin; the supabase-js and daily-js CDN URLs are
 * fulfilled with shims that forward every call to the shared double.  Gates
 * drive the app through window.__lc (real function references exported by
 * index.html) and through the real DOM — never through re-implementations.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { BackendDouble } = require("./backend-double");

const REPO = path.resolve(__dirname, "..", "..");
const ORIGIN = "https://lastcall.test";
const SHIMS = path.join(__dirname, "shims");

function resolveChromium() {
  const candidates = [
    process.env.LC_CHROMIUM,                     // explicit override
    "/opt/pw-browsers/chromium",                 // preinstalled symlink (this container)
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try { const p = chromium.executablePath(); if (fs.existsSync(p)) return p; } catch (e) {}
  throw new Error("No Chromium found. Set LC_CHROMIUM to a chrome binary.");
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

class Client {
  constructor(harness, name, context, page) {
    this.harness = harness; this.name = name; this.context = context; this.page = page;
    this.errors = [];   // console.error + uncaught page errors
    this.logs = [];     // every console message, for gate forensics
  }
  async goto(query = "") {
    await this.page.goto(ORIGIN + "/" + query, { waitUntil: "load" });
  }
  /* login BEFORE goto: the app's boot IIFE reads the session on load */
  login(uid) { this.harness.double.loginClient(this.name, uid); return this; }
  lc(expr, ...args) {
    // run `fn(...)` against the window.__lc export
    return this.page.evaluate(({ expr, args }) => {
      const f = new Function("__lc", "args", "return (" + expr + ")(__lc, ...args)");
      return f(window.__lc, args);
    }, { expr, args });
  }
  async close() { await this.context.close(); this.harness.clients = this.harness.clients.filter((c) => c !== this); }
}

class Harness {
  constructor(browser, executablePath) {
    this.browser = browser;
    this.executablePath = executablePath;
    this.double = new BackendDouble();
    this.clients = [];
    this.unexpectedRequests = [];
    this.double.onChange((evt) => {
      for (const c of this.clients) {
        c.page.evaluate((e) => { if (window.__realtimePush) window.__realtimePush(e); }, evt).catch(() => {});
      }
    });
  }

  static async launch() {
    const executablePath = resolveChromium();
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    return new Harness(browser, executablePath);
  }

  async newClient(name, opts = {}) {
    const context = await this.browser.newContext({
      viewport: { width: 390, height: 844 },   // iPhone-ish: the product's home form factor
      permissions: ["camera", "microphone"],
      reducedMotion: "reduce",
      ...opts,   // e.g. { isMobile:true, hasTouch:true } for real mobile emulation (gate 24)
    });
    await context.route("**/*", (route) => this._route(route, name));
    const page = await context.newPage();
    const client = new Client(this, name, context, page);
    await context.exposeBinding("__rpcCall", async (_source, argJson) => {
      const { op, payload } = JSON.parse(argJson);
      const res = await this.double.dispatch(name, op, payload);
      return JSON.stringify(res);
    });
    page.on("console", (msg) => {
      client.logs.push({ type: msg.type(), text: msg.text() });
      if (msg.type() === "error") client.errors.push(msg.text());
    });
    page.on("pageerror", (err) => client.errors.push(String(err && err.message || err)));
    this.clients.push(client);
    return client;
  }

  _route(route, _clientName) {
    const url = route.request().url();
    const serveFile = (rel) => {
      const fp = path.join(REPO, rel);
      if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: "not found" });
      return route.fulfill({ status: 200, contentType: MIME[path.extname(fp)] || "application/octet-stream", body: fs.readFileSync(fp) });
    };
    if (url.startsWith(ORIGIN)) {
      const rel = new URL(url).pathname.replace(/^\//, "") || "index.html";
      return serveFile(rel);
    }
    if (url.startsWith("https://cdn.jsdelivr.net/npm/@supabase/supabase-js"))
      return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(SHIMS, "supabase-shim.js")) });
    if (url.includes("daily-js") && url.includes("unpkg.com"))
      return route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(path.join(SHIMS, "daily-shim.js")) });
    if (url.startsWith("https://fonts.googleapis.com"))
      return route.fulfill({ status: 200, contentType: "text/css", body: "/* fonts stubbed offline */" });
    if (url.startsWith("https://fonts.gstatic.com")) return route.abort();
    if (url.includes("/functions/v1/daily-room")) {
      const body = route.request().postDataJSON() || {};
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://daily.fake/" + (body.room_id || "room"), token: "fake-token" }) });
    }
    // Everything else is a leak: the battery must run fully offline.
    this.unexpectedRequests.push(url);
    return route.abort();
  }

  async close() { await this.browser.close(); }
}

module.exports = { Harness, ORIGIN, REPO, resolveChromium };
