// Board refresh allocation sampling and GPU churn, with scene updates frozen during each measurement.
// Build first. PROFILE_QUERY supplies A/B flags; PROFILE_SCENE and PROFILE_VIEW select a view.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, dispose } from "../test/browser.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const label = process.argv[2] || "board", out = join(root, "untracked/performance");
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
  const url = new URL(`http://127.0.0.1:${server.address().port}/?debug=1&nosim=1&net=0&chain=0&hour=12&day=80&bananas=1000`);
  for (const [key, value] of new URLSearchParams(process.env.PROFILE_QUERY || "")) url.searchParams.set(key, value);
  await b.open(url.href);
  if (!await b.evaluate(`new Promise(resolve => { const start = performance.now(); const tick = () => { if (window.__ooga?.renderedFrames >= 5 && !document.getElementById("curtain")) resolve(true); else if (performance.now() - start > 30000) resolve(false); else setTimeout(tick, 50); }; tick(); })`)) throw Error("Boot deadline");
  if (process.env.PROFILE_SCENE) {
    await b.evaluate(`__ooga.go(${JSON.stringify(process.env.PROFILE_SCENE)})`);
    if (!await b.evaluate(`new Promise(resolve => { const start = performance.now(); const tick = () => { if (__ooga.scene === ${JSON.stringify(process.env.PROFILE_SCENE)} && !__ooga.transitioning) resolve(true); else if (performance.now() - start > 30000) resolve(false); else setTimeout(tick, 25); }; tick(); })`)) throw Error("Travel deadline");
  }
  environment = await b.evaluate(`(() => { const gl = document.getElementById("scene").getContext("webgl2"), e = gl.getExtension("WEBGL_debug_renderer_info"); return { userAgent: navigator.userAgent, gpu: e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL), dpr: devicePixelRatio, memory: navigator.deviceMemory, scene: __ooga.scene }; })()`);
  await b.evaluate(`__ooga.renderer.setQuality("high")`);
  await b.sleep(2000);
  await b.evaluate(`(() => {
    const B = __ooga, w = B.jumbotron.node.world, x = w[12], y = w[13], z = w[14];
    B.pilot.navigate({ position: { x, y, z }, target: { x, y, z }, yaw: Math.atan2(w[8], w[10]), pitch: 0, dist: 7 });
    const probe = window.__boardRAF = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame, queue: new Map(), id: 0 };
    window.requestAnimationFrame = callback => { const id = --probe.id; probe.queue.set(id, callback); return id; };
    window.cancelAnimationFrame = id => { if (id < 0) probe.queue.delete(id); else probe.cancel.call(window, id); };
  })()`);
  // Let the one already-scheduled director frame finish; subsequent frames are parked in the harness queue.
  await b.sleep(100);
  for (const view of ["recent", "totals"]) {
    await b.evaluate(`(() => { const B = __ooga, j = B.jumbotron; j.autoRotate(0); j.setView(${JSON.stringify(view)}); j.update(0, B.renderer); B.renderer.render(BL.scenes.hub.root, B.camera, B.renderOpts); })()`);
    await b.send("HeapProfiler.enable"); await b.send("HeapProfiler.collectGarbage");
    await b.send("HeapProfiler.startSampling", { samplingInterval: 4096, stackDepth: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const row = await b.evaluate(`(() => {
      const B = __ooga, j = B.jumbotron, gl = document.getElementById("scene").getContext("webgl2"), create = gl.createBuffer, remove = gl.deleteBuffer, sub = gl.texSubImage2D;
      let created = 0, deleted = 0, textureUpdates = 0, accepted = 0;
      gl.createBuffer = function() { created++; return create.call(this); };
      gl.deleteBuffer = function(buffer) { deleted++; return remove.call(this, buffer); };
      gl.texSubImage2D = function() { textureUpdates++; return sub.apply(this, arguments); };
      const start = performance.now(), heap = performance.memory.usedJSHeapSize;
      try {
        for (let i = 0; i < 10; i++) { accepted += j.refreshData(BL.jumbotronData) ? 1 : 0; j.update(0, B.renderer); B.renderer.render(BL.scenes.hub.root, B.camera, B.renderOpts); }
        return { view: ${JSON.stringify(view)}, accepted, created, deleted, textureUpdates, ms: performance.now() - start, heapDelta: performance.memory.usedJSHeapSize - heap, quality: B.renderer.quality };
      } finally { gl.createBuffer = create; gl.deleteBuffer = remove; gl.texSubImage2D = sub; }
    })()`);
    const reply = await b.send("HeapProfiler.stopSampling");
    if (reply.error) throw Error(JSON.stringify(reply.error));
    const profile = reply.result.profile;
    writeFileSync(join(out, `${label}-${view}.heapprofile`), JSON.stringify(profile));
    const sum = node => node.selfSize + node.children.reduce((total, child) => total + sum(child), 0);
    row.sampledAllocatedBytes = sum(profile.head); row.sampledBytesPerRefresh = row.sampledAllocatedBytes / 10;
    row.caveat = "4096-byte probabilistic sampling includes parsing, repaint and full renderer submission; the harness parks RAF before sampling. Heap delta alone is not an allocation total.";
    rows.push(row); console.log(JSON.stringify(row));
  }
  await b.evaluate(`(() => {
    const probe = window.__boardRAF; window.requestAnimationFrame = probe.request; window.cancelAnimationFrame = probe.cancel;
    for (const callback of probe.queue.values()) probe.request.call(window, callback); delete window.__boardRAF;
  })()`);
  await b.evaluate(`(() => { const B = __ooga, w = B.jumbotron.node.world, x = w[12], y = w[13], z = w[14]; B.pilot.navigate({ position: { x, y, z }, target: { x, y, z }, yaw: Math.atan2(w[8], w[10]), pitch: 0, dist: 7 }); })()`);
  for (const tier of ["high", "medium", "low"]) {
    await b.evaluate(`__ooga.renderer.setQuality(${JSON.stringify(tier)})`); await b.sleep(1200);
    await b.screenshot(join(out, `${label}-${tier}.png`));
  }
  if (b.logs.length) throw Error(b.logs.join(" | "));
} catch (error) { failure = String(error.stack || error); console.error(failure); }
finally { writeFileSync(join(out, `${label}.json`), JSON.stringify({ label, environment, rows, failure, logs: b?.logs || [] }, null, 2) + "\n"); if (b) await b.close(); await dispose(); await new Promise(resolve => server.close(resolve)); }
if (failure) process.exitCode = 1;
