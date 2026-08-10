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
const os = require("os");
const { chromium } = require("playwright-core");
const { BackendDouble } = require("./backend-double");

const REPO = path.resolve(__dirname, "..", "..");
const ORIGIN = "https://lastcall.test";
const SHIMS = path.join(__dirname, "shims");

/* BROWSER RESOLUTION (wave 9).  Returns {path} on success or {error, hint}
 * on failure — it never throws, because a throw from here lands inside a
 * gate's run() and run.js launders it into "gate crashed", turning ONE
 * missing binary into 32 individual gate failures that read like a
 * catastrophic regression.  run.js calls resolveChromium() ONCE as a
 * preflight, before any gate; a setup gap must never be reported as
 * broken code.
 *
 * The old list only knew this container's /opt/pw-browsers symlink, so a
 * fresh clone anywhere else (a Codespace, a laptop) failed every browser
 * gate with no idea what to do about it.  It now probes what playwright
 * and the system actually install. */
function chromiumCandidates() {
  const out = [];
  const push = (p) => { if (p && !out.includes(p)) out.push(p); };
  push(process.env.LC_CHROMIUM);                 // explicit override — checked first, honoured strictly
  push("/opt/pw-browsers/chromium");             // preinstalled symlink (Anthropic container)
  // playwright's own install roots: PLAYWRIGHT_BROWSERS_PATH, else ~/.cache/ms-playwright
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH,
                 path.join(os.homedir(), ".cache", "ms-playwright")].filter(Boolean);
  for (const root of roots) {
    push(path.join(root, "chromium"));
    try {
      for (const d of fs.readdirSync(root)) {
        if (!/^chromium/.test(d)) continue;
        push(path.join(root, d, "chrome-linux", "chrome"));
        push(path.join(root, d, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"));
      }
    } catch (e) {}
  }
  // playwright-core's own answer, only if it points at something real
  try { const p = chromium.executablePath(); push(p); } catch (e) {}
  // finally: a system browser
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
   "/usr/bin/google-chrome-stable",
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].forEach(push);
  return out;
}
const INSTALL_HINT =
  "Install one from tools/:\n" +
  "    cd tools && npx playwright-core install chromium && npx playwright-core install-deps\n" +
  "  or point the battery at a browser you already have:\n" +
  "    export LC_CHROMIUM=/path/to/chrome";
function resolveChromium() {
  // an explicit override that points at nothing is an error in ITSELF —
  // silently falling through to some other browser would hide the typo
  const override = process.env.LC_CHROMIUM;
  if (override && !fs.existsSync(override)) {
    return { error: "LC_CHROMIUM is set to \"" + override + "\" but there is nothing there.",
             hint: "Fix the path or unset LC_CHROMIUM to let the battery find a browser itself." };
  }
  for (const c of chromiumCandidates()) if (fs.existsSync(c)) return { path: c };
  return { error: "No Chromium found — the battery needs a browser and this machine has none.",
           hint: INSTALL_HINT };
}
function requireChromium() {
  const r = resolveChromium();
  if (r.error) throw new Error(r.error);   // preflight has already reported; this is the belt
  return r.path;
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
    this.mutedRealtime = new Set();
    this.double.onChange((evt) => {
      for (const c of this.clients) {
        if (this.mutedRealtime.has(c.name)) continue;   // prod fidelity: this client folds via the truth poll only
        c.page.evaluate((e) => { if (window.__realtimePush) window.__realtimePush(e); }, evt).catch(() => {});
      }
    });
  }

  /* wave 8 fidelity: prod realtime is lossy per-client (the conductor's
     players saw ASKED pills but no card — their folds rode the poll).
     A muted client receives NO realtime pushes; syncRoomTruth's replay
     is its only event channel, exactly the prod worst case. */
  muteRealtime(name, on = true) { if (on) this.mutedRealtime.add(name); else this.mutedRealtime.delete(name); }

  static async launch() {
    const executablePath = requireChromium();
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
