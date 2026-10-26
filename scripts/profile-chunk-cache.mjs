// Measure Wrangler's generated /js chunks with Chrome's real HTTP cache, including a browser restart.
// node scripts/profile-chunk-cache.mjs <origin> <staged-site> <output.json>
// Start an isolated local Wrangler assets server first; this probe never runs game code or changes the site.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [originArg, siteArg, outArg] = process.argv.slice(2);
if (!originArg || !siteArg || !outArg) throw Error("Usage: profile-chunk-cache.mjs <origin> <staged-site> <output.json>");
const origin = new URL(originArg).origin, site = resolve(siteArg), output = resolve(outArg);
const chunks = readdirSync(join(site, "js")).sort();
if (!chunks.length || chunks.some(name => !/^[a-z0-9-]+-[0-9a-f]{16}\.js$/.test(name))) throw Error("Expected a fingerprinted-only js directory");
const assets = chunks.map(name => {
  const bytes = readFileSync(join(site, "js", name)), sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!name.endsWith(`-${sha256.slice(0, 16)}.js`)) throw Error(`Chunk contents do not match fingerprint: ${name}`);
  return { path: `/js/${name}`, bytes: bytes.length, sha256 };
});
const profile = mkdtempSync(join(tmpdir(), "ooga-chunk-cache-"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let current = null;
const launch = async () => {
  const chrome = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-search-engine-choice-screen",
    "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync",
    "--disable-default-apps", "--disable-breakpad", "--metrics-recording-only", "--no-pings", "--use-mock-keychain",
    "--password-store=basic", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let exited = false, stderr = "";
  const closed = new Promise(resolve => chrome.once("exit", () => { exited = true; resolve(); }));
  current = { chrome, closed };
  chrome.stderr.on("data", bytes => { stderr = (stderr + bytes).slice(-2000); });
  let target = null;
  for (let i = 0; i < 200 && !exited; i++) {
    try {
      const port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1000) })).json();
      target = targets.find(item => item.type === "page");
      if (target) break;
    } catch {}
    await sleep(50);
  }
  if (!target) { chrome.kill("SIGKILL"); throw Error(`Chrome did not start: ${stderr}`); }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("DevTools connection timed out")), 10000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = error => { clearTimeout(timer); reject(error); };
  });
  let nextId = 0;
  const pending = new Map(), events = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result);
    } else events.get(message.method)?.(message.params);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitForExit = ms => new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    closed.then(() => { clearTimeout(timer); resolve(); });
  });
  const close = async () => {
    socket.send(JSON.stringify({ id: ++nextId, method: "Browser.close" }));
    await waitForExit(1000);
    if (!exited) { chrome.kill("SIGTERM"); await waitForExit(15000); }
    if (!exited) { chrome.kill("SIGKILL"); await closed; throw Error("Chrome could not flush its cache before closing"); }
    socket.close();
  };
  const api = { send, evaluate, events, close, chrome, closed };
  current = api;
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.navigate", { url: `${origin}/robots.txt` });
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try { ready = await evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === "complete"`); } catch {}
    if (ready) break;
    await sleep(50);
  }
  if (!ready) throw Error("Probe document did not load");
  return api;
};
const runs = [];
let completed = false, failure = null, version = null;
const measure = async (browser, tag) => {
  const requests = new Map();
  browser.events.set("Network.requestWillBeSent", data => {
    if (assets.some(asset => `${origin}${asset.path}` === data.request.url)) requests.set(data.requestId, {
      path: new URL(data.request.url).pathname, requestHeaders: data.request.headers
    });
  });
  browser.events.set("Network.requestServedFromCache", data => {
    const row = requests.get(data.requestId); if (row) row.servedFromCache = true;
  });
  browser.events.set("Network.responseReceived", data => {
    const row = requests.get(data.requestId); if (row) Object.assign(row, {
      status: data.response.status, headers: data.response.headers,
      fromDiskCache: !!data.response.fromDiskCache, fromServiceWorker: !!data.response.fromServiceWorker
    });
  });
  browser.events.set("Network.responseReceivedExtraInfo", data => {
    const row = requests.get(data.requestId); if (row) row.networkStatus = data.statusCode;
  });
  browser.events.set("Network.loadingFinished", data => {
    const row = requests.get(data.requestId); if (row) row.encodedDataLength = data.encodedDataLength;
  });
  const timing = await browser.evaluate(`(async () => {
    performance.clearResourceTimings(); const rows = [];
    for (const path of ${JSON.stringify(assets.map(asset => asset.path))}) {
      const url = new URL(path, location.origin).href, response = await fetch(url);
      const bytes = (await response.arrayBuffer()).byteLength;
      if (!response.ok) throw Error(path + ': ' + response.status);
      const entry = performance.getEntriesByName(url).at(-1);
      rows.push({ path, bytes, timing: entry ? entry.toJSON() : null });
    }
    return rows;
  })()`);
  await sleep(50);
  const rows = timing.map(item => ({ ...item, network: [...requests.values()].find(row => row.path === item.path) || null }));
  runs.push({ tag, rows });
  console.log(JSON.stringify({ tag, transferSize: rows.reduce((sum, row) => sum + (row.timing?.transferSize || 0), 0),
    networkStatus: rows.map(row => row.network?.networkStatus), diskCache: rows.map(row => row.network?.fromDiskCache) }));
};
try {
  const first = await launch(); version = await first.send("Browser.getVersion");
  await measure(first, "cold"); await measure(first, "same-browser-repeat"); await first.close(); current = null;
  // A clean browser process with the same profile removes the in-process resource cache from the result.
  const restarted = await launch(); await measure(restarted, "restarted-browser-repeat");
  await restarted.close(); current = null; completed = true;
} catch (error) { failure = error.message; throw error; }
finally {
  if (current) { current.chrome.kill("SIGKILL"); await current.closed; }
  writeFileSync(output, JSON.stringify({ completed, failure, at: new Date().toISOString(), origin, version, assets,
    headersFile: readFileSync(join(site, "_headers"), "utf8"), runs }, null, 2) + "\n");
  rmSync(profile, { recursive: true, force: true });
}
