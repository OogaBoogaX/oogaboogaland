// Focused native-Chrome rendering counts, frame intervals and GC drops on the staged site.
// Build first. PROFILE_QUERY supplies A/B flags; PROFILE_SCENE and PROFILE_VIEW select a view.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, dispose } from "../test/browser.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const label = process.argv[2] || "render", out = join(root, "untracked/performance");
mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    const bytes = readFileSync(join(root, "_site", path === "/" ? "index.html" : path));
    res.writeHead(200, { "Content-Type": ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".mp3": "audio/mpeg" })[extname(path)] || (path === "/" ? "text/html" : "application/octet-stream") }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const rows = []; let b, environment, failure = null;
try {
  b = await launch({ w: 1440, h: 900, perf: true });
  await b.focus(true);
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const P = WebGL2RenderingContext.prototype, ids = new WeakMap(), bindings = new WeakMap(), views = new WeakMap(); let id = 0;
    const state = window.__renderProbe = { frame: null };
    const originalBind = P.bindFramebuffer;
    P.bindFramebuffer = function(target, fb) { if (target !== this.READ_FRAMEBUFFER) { if (fb && !ids.has(fb)) ids.set(fb, ++id); bindings.set(this, fb); } return originalBind.apply(this, arguments); };
    const originalViewport = P.viewport;
    P.viewport = function(x, y, w, h) { views.set(this, w + "x" + h); return originalViewport.apply(this, arguments); };
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = P[name];
      P[name] = function(...args) {
        const frame = state.frame;
        if (frame) {
          const fb = bindings.get(this), key = (fb ? "fb" + ids.get(fb) : "screen") + ":" + views.get(this);
          const row = frame.passes[key] || (frame.passes[key] = { draws: 0, triangles: 0, instances: 0 });
          const count = name.includes("Elements") ? args[1] : args[2], instances = name.endsWith("Instanced") ? args[name.includes("Elements") ? 4 : 3] : 1;
          row.draws++; row.instances += instances;
          row.triangles += (args[0] === this.TRIANGLES ? count / 3 : args[0] === this.TRIANGLE_STRIP || args[0] === this.TRIANGLE_FAN ? Math.max(0, count - 2) : 0) * instances;
        }
        return original.apply(this, args);
      };
    }
    for (const name of ["bufferSubData", "createBuffer", "deleteBuffer", "texSubImage2D"]) {
      const original = P[name]; P[name] = function() { if (state.frame) state.frame[name]++; return original.apply(this, arguments); };
    }
  })()` });
  const url = new URL(`http://127.0.0.1:${server.address().port}/?debug=1&nosim=1&net=0&chain=0&hour=12&day=80&bananas=1000`);
  for (const [key, value] of new URLSearchParams(process.env.PROFILE_QUERY || "")) url.searchParams.set(key, value);
  await b.open(url.href);
  if (!await b.evaluate(`new Promise(resolve => { const start = performance.now(); const tick = () => { if (window.__ooga?.renderedFrames >= 5 && !document.getElementById("curtain")) resolve(true); else if (performance.now() - start > 30000) resolve(false); else setTimeout(tick, 50); }; tick(); })`)) throw Error("Boot deadline");
  if (process.env.PROFILE_SCENE) {
    await b.evaluate(`__ooga.go(${JSON.stringify(process.env.PROFILE_SCENE)})`);
    if (!await b.evaluate(`new Promise(resolve => { const start = performance.now(); const tick = () => { if (__ooga.scene === ${JSON.stringify(process.env.PROFILE_SCENE)} && !__ooga.transitioning) resolve(true); else if (performance.now() - start > 30000) resolve(false); else setTimeout(tick, 25); }; tick(); })`)) throw Error("Travel deadline");
  }
  environment = await b.evaluate(`(() => { const gl = document.getElementById("scene").getContext("webgl2"), e = gl.getExtension("WEBGL_debug_renderer_info"); return { userAgent: navigator.userAgent, gpu: e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL), dpr: devicePixelRatio, memory: navigator.deviceMemory, scene: __ooga.scene }; })()`);
  for (const tier of (process.env.PROFILE_TIERS || "high,medium,low").split(",")) {
    await b.evaluate(`(() => { __ooga.renderer.setQuality(${JSON.stringify(tier)}); __ooga.pilot.goPreset(${JSON.stringify(process.env.PROFILE_VIEW || "pile")}); })()`);
    await b.sleep(2000);
    const result = await b.evaluate(`new Promise(resolve => {
      const state = __renderProbe, frames = [], duration = ${Number(process.env.PROFILE_SECONDS) || 5} * 1000;
      let start, previous, heap = performance.memory.usedJSHeapSize, reclaimed = 0;
      const fresh = () => ({ passes: {}, bufferSubData: 0, createBuffer: 0, deleteBuffer: 0, texSubImage2D: 0 });
      const tick = now => {
        if (start === undefined) start = previous = now;
        else { const current = performance.memory.usedJSHeapSize; if (current < heap) reclaimed += heap - current; heap = current; frames.push({ dt: now - previous, ...state.frame }); previous = now; }
        if (now - start >= duration) { state.frame = null; resolve({ frames, elapsed: now - start, reclaimed, quality: __ooga.renderer.quality, stats: __ooga.renderer.stats }); }
        else { state.frame = fresh(); requestAnimationFrame(tick); }
      }; requestAnimationFrame(tick);
    })`);
    const times = result.frames.map(f => f.dt).sort((a, b) => a - b), passes = {};
    for (const frame of result.frames) for (const [key, p] of Object.entries(frame.passes)) {
      const row = passes[key] || (passes[key] = { frames: 0, draws: 0, triangles: 0, maxTriangles: 0, instances: 0 });
      row.frames++; row.draws += p.draws; row.triangles += p.triangles; row.instances += p.instances; row.maxTriangles = Math.max(row.maxTriangles, p.triangles);
    }
    const n = result.frames.length, sum = key => result.frames.reduce((s, f) => s + f[key], 0);
    const row = { tier, quality: result.quality, frames: n, fps: n * 1000 / result.elapsed, p50: times[Math.floor(n * .5)], p95: times[Math.floor(n * .95)], p99: times[Math.floor(n * .99)], over33: times.filter(t => t > 33).length, reclaimedMiBPerSecond: result.reclaimed / 1048576 * 1000 / result.elapsed, bufferSubDataPerFrame: sum("bufferSubData") / n, createdBuffers: sum("createBuffer"), deletedBuffers: sum("deleteBuffer"), textureUpdates: sum("texSubImage2D"), passes, stats: result.stats };
    rows.push(row); console.log(JSON.stringify(row));
    await b.screenshot(join(out, `${label}-${tier}.png`));
  }
  if (b.logs.length) throw Error(b.logs.join(" | "));
} catch (error) { failure = String(error.stack || error); console.error(failure); }
finally { writeFileSync(join(out, `${label}.json`), JSON.stringify({ label, environment, rows, failure, logs: b?.logs || [] }, null, 2) + "\n"); if (b) await b.close(); await dispose(); await new Promise(resolve => server.close(resolve)); }
if (failure) process.exitCode = 1;
