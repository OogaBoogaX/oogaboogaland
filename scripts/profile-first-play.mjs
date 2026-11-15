// Paired cold/warm startup on a staged site. One browser at a time.
// CHROME_ARCH=arm64 RUNS=10 node scripts/profile-first-play.mjs REPO LABEL
// CPU=1 is a separate diagnostic recording, never a clean timing result.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, extname, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const root = resolve(process.argv[2] || "."), label = process.argv[3] || "first-play";
const runs = Number(process.env.RUNS || 10), cpu = process.env.CPU === "1";
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw Error("RUNS must be 1–20");
const { launch, dispose } = await import(pathToFileURL(join(root, "test/browser.mjs")));
const site = join(root, "_site"), out = join(root, "untracked/performance");
mkdirSync(out, { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = [], files = new Map();
const scan = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else {
      const bytes = readFileSync(path), name = relative(site, path), compress = /\.(html|js|css|json)$/.test(name);
      manifest.push({ file: name, bytes: bytes.length, sha256: hash(bytes) });
      files.set("/" + name, { bytes, compressed: compress ? gzipSync(bytes) : null });
    }
  }
};
scan(site);
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname, file = files.get(path === "/" ? "/index.html" : path);
  if (!file) { res.writeHead(404); res.end(); return; }
  const gzip = file.compressed && req.headers["accept-encoding"]?.includes("gzip");
  res.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extname(path)] || (path === "/" ? "text/html" : "application/octet-stream"),
    "Cache-Control": /\.[a-f0-9]{16}\.|-[a-f0-9]{16}\./.test(path) ? "public, max-age=31536000, immutable" : "no-cache", ...(gzip ? { "Content-Encoding": "gzip" } : {}) });
  res.end(gzip ? file.compressed : file.bytes);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`, rows = [];
const result = { label, cpu, runs, runtime: { node: process.version, arch: process.arch, chromeArch: process.env.CHROME_ARCH || null },
  manifestSHA256: hash(JSON.stringify(manifest)), manifest, rows, error: null,
  caveats: ["Local gzip HTTP, native desktop CPU; no real phone or constrained network claim.", "First play includes a real W key accepted by the pilot and a subsequent displayed frame.", "Warm uses the same browser profile and origin after one cold load. Timing runs have no CPU sampler unless CPU=1."] };
const save = () => writeFileSync(join(out, `${label}.json`), JSON.stringify(result, null, 2) + "\n");
let b;
try {
  for (let run = 0; run < runs; run++) {
    b = await launch({ w: 1920, h: 1080, perf: true, motion: true });
    await b.focus(true);
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
      const S = window.__firstPlay = { tasks: [], times: new Float64Array(1200), count: 0, start: 0, previous: 0 };
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (S.tasks.length < 2000) S.tasks.push({ at: e.startTime, ms: e.duration }); }).observe({ type: "longtask", buffered: true });
      const frame = now => { if (S.start && S.count < S.times.length) { if (S.previous) S.times[S.count++] = now - S.previous; S.previous = now; } requestAnimationFrame(frame); }; requestAnimationFrame(frame);
    })()` });
    let loaded = false;
    b.on("Page.loadEventFired", () => { loaded = true; });
    for (const cache of ["cold", "warm"]) {
      loaded = false; b.logs.length = 0;
      if (cpu) { await b.send("Profiler.enable"); await b.send("Profiler.start"); }
      await b.open(`${base}/?debug=1&nosim=1&net=0&chain=0&hour=12&day=80&bananas=1000&pos=0`);
      for (let i = 0; !loaded && i < 1200; i++) await b.sleep(50);
      if (!loaded) throw Error("Document load deadline");
      const ready = await b.evaluate(`new Promise(resolve => {
        const end = performance.now() + 60000;
        const poll = () => { if (window.__ooga?.renderedFrames >= 2 && !document.getElementById("curtain") && !document.getElementById("equipment-hud").inert) resolve(performance.now());
          else if (performance.now() > end) resolve(false); else setTimeout(poll, 10); }; poll();
      })`);
      if (!ready) throw Error("First-play readiness deadline");
      await b.evaluate(`document.getElementById("scene").focus(); __firstPlay.before = { ...__ooga.camera.target }; __firstPlay.start = performance.now()`);
      await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "w", code: "KeyW" });
      const input = await b.evaluate(`new Promise(resolve => { const first = __ooga.renderedFrames;
        const frame = () => { if (__ooga.renderedFrames <= first + 1) { requestAnimationFrame(frame); return; }
          const a = __ooga.pilot.controls.read(), p = __ooga.camera.target, q = __firstPlay.before;
          resolve({ at: performance.now(), accepted: a.y !== 0, distance: Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z) }); }; requestAnimationFrame(frame); })`);
      await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "w", code: "KeyW" });
      if (cpu) {
        const profile = await b.send("Profiler.stop");
        writeFileSync(join(out, `${label}-${run}-${cache}.cpuprofile`), JSON.stringify(profile.result.profile).replaceAll(base, "http://fixture"));
      }
      await b.evaluate(`new Promise(resolve => setTimeout(resolve, 10000))`);
      const measured = await b.evaluate(`(() => {
        const S = __firstPlay, times = Array.from(S.times.subarray(0,S.count)).sort((a,b)=>a-b), tasks = S.tasks;
        const gl = document.getElementById("scene").getContext("webgl2"), e = gl?.getExtension("WEBGL_debug_renderer_info");
        return { environment: { viewport: [innerWidth, innerHeight], canvas: [document.getElementById("scene").width, document.getElementById("scene").height], renderSize: __ooga.renderer.size, browser: navigator.userAgent, gpu: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, memory: navigator.deviceMemory, quality: __ooga.renderer.quality },
          marks: performance.getEntriesByType("mark").filter(e=>e.name.startsWith("ooga:")).map(e=>({name:e.name,ms:e.startTime})),
          heap: performance.memory?.usedJSHeapSize ?? null, tasks,
          postStart: { frames: times.length, p95: times[Math.floor(times.length*.95)], p99: times[Math.floor(times.length*.99)], max: times.at(-1), over33: times.filter(n=>n>33).length, over50: times.filter(n=>n>50).length },
          resources: performance.getEntriesByType("resource").filter(e=>e.name.startsWith(location.origin)).map(e=>({path:new URL(e.name).pathname,transfer:e.transferSize,encoded:e.encodedBodySize,decoded:e.decodedBodySize})) };
      })()`);
      rows.push({ run, cache, readyMs: ready, input, ...measured, logs: [...b.logs] }); save();
      if (!input.accepted || input.distance <= 0 || b.logs.length) throw Error("Input or clean-console startup contract failed");
      console.log(JSON.stringify({ run, cache, readyMs: ready, input, frames: measured.postStart }));
    }
    await b.close(true); b = null;
  }
} catch (error) { result.error = String(error.stack || error).replaceAll(root, "<repo>"); process.exitCode = 1; }
finally { if (b) await b.close(true); await dispose(); await new Promise(done => server.close(done)); save(); }
