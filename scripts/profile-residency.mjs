// Forced-GC floors and native DOM/listener counts on the staged hosted build, one focused Chrome at a time.
// Run build:site first, then node scripts/profile-residency.mjs <label> <scene[:place],...> [--rest] [--snapshots].
// --rest exercises the real gorilla rest-site query before leaving the hub; it installs no retaining hooks.
// Heap backing storage is reported separately from usedSize. Snapshots stay under untracked/performance/.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, dispose } from "../test/browser.mjs";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url)), label = process.argv[2] || "baseline", sequence = (process.argv[3] || "factory").split(","), snapshots = process.argv.includes("--snapshots"), rest = process.argv.includes("--rest");
const out = join(root, "untracked/performance"); mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".mp3": "audio/mpeg" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try { const bytes = readFileSync(join(root, "_site", path === "/" ? "index.html" : path)); res.writeHead(200, { "Content-Type": types[extname(path)] || (path === "/" ? "text/html" : "application/octet-stream") }); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`, rows = [];
let b;
const measure = async (tag) => {
  await b.focus(false); await b.send("Page.setWebLifecycleState", { state: "frozen" });
  try {
    for (let i = 0; i < 3; i++) await b.send("HeapProfiler.collectGarbage");
    const usage = (await b.send("Runtime.getHeapUsage")).result, dom = (await b.send("Memory.getDOMCounters")).result;
    const scene = await b.evaluate(`(() => {
      const B = __ooga, tess = B.scene === "factory" ? B.factory.greeter : null, meshes = new Set();
      if (tess) tess.liveGeometry(meshes);
      return { scene: B.scene, quality: B.renderer.quality, gl: B.renderer.stats, frames: B.renderedFrames, timing: B.timing,
        tess: tess ? { meshes: meshes.size, faces: [...meshes].reduce((sum, mesh) => sum + mesh.faces.length, 0) } : null,
        arcade: window.__residencyCabinets ? { cabinets: window.__residencyCabinets.filter(ref => !!ref.deref()).length,
          frameSets: window.__residencyFrames.filter(ref => !!ref.deref()).length } : null };

    })()`);
    const row = { tag, ...scene, usage, dom };
    rows.push(row); console.log(JSON.stringify(row));
    if (snapshots && tag !== "boot" && (!process.env.SNAPSHOT_TAG || process.env.SNAPSHOT_TAG === tag)) {
      const path = join(out, `${label}-${tag}.heapsnapshot`), fd = openSync(path, "w");
      b.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => writeSync(fd, chunk));
      try { await b.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
      finally { b.on("HeapProfiler.addHeapSnapshotChunk", null); closeSync(fd); }
      console.log(JSON.stringify({ snapshot: path }));
    }
  } finally { await b.send("Page.setWebLifecycleState", { state: "active" }); await b.focus(true); await b.send("Page.bringToFront"); }
};
try {
  b = await launch({ w: 1440, h: 900, perf: true });
  await b.focus(true); await b.send("HeapProfiler.enable");
  await b.open(`${base}/?debug=1&nosim=1&net=0&chain=0&hour=12&day=80&bananas=1000${rest ? "&gorillamove=1" : ""}`);
  const ready = await b.evaluate(`new Promise((resolve) => { const start = performance.now(); const tick = () => { if (window.__ooga?.renderedFrames >= 5 && !document.getElementById("curtain")) resolve(true); else if(performance.now() - start > 30000) resolve(false); else setTimeout(tick, 50); }; tick(); })`);
  if (!ready) throw Error("Hub did not become ready: " + b.logs.join(" | "));
  await b.evaluate(`__ooga.renderer.setQuality("high"); __ooga.pilot.goPreset("pile")`);
  await b.sleep(3000);
  if (rest) console.log(JSON.stringify({ restSites: await b.evaluate("__ooga.clankers.debugLoungeSpots(__ooga.clankers.list[0]).length") }));
  await measure("boot");
  for (let i = 0; i < sequence.length; i++) {
    const [id, place] = sequence[i].split(":");
    const result = await b.evaluate(`new Promise((resolve, reject) => { const start = performance.now(); if(!__ooga.go(${JSON.stringify(id)}, ${JSON.stringify(place || null)})) { reject(Error("Transition refused")); return; } const tick = () => { if (__ooga.scene === ${JSON.stringify(id)} && !__ooga.transitioning) resolve(performance.now() - start); else if(performance.now() - start > 30000) reject(Error("Transition timed out")); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
    console.log(JSON.stringify({ travel: id, ms: result }));
    await b.sleep(2500);
    if (id === "arcade" && process.argv.includes("--cabinets")) await b.evaluate(`(() => {
      const A = BL.arcadeModels;
      window.__residencyCabinets = A.CABINETS.filter(c => c.index !== 0 && c.index !== 3).map(c => new WeakRef(A.cabinet(c.index)));
      window.__residencyFrames = [1, 2].map(i => new WeakRef(A.attractFrames(i)));
    })()`);
    await measure(`${i + 1}-${id}`);
    if (id === "factory" && process.argv.includes("--tess-photos")) {
      await b.evaluate(`(() => {
        const B = __ooga, S = BL.scenes.factory, g = B.factory.greeter;
        window.__residencyPhoto = { update: S.update, position: { ...B.camera.position }, target: { ...B.camera.target } };
        S.update = () => {};
        Object.assign(B.camera.position, { x: g.root.position.x + 0.15, y: g.root.position.y + 0.12, z: g.root.position.z + 1.6 });
        Object.assign(B.camera.target, g.root.position); g.root.visible = true;
      })()`);
      for (const quality of ["high", "medium", "low"]) {
        await b.evaluate(`__ooga.renderer.setQuality(${JSON.stringify(quality)}); for(let n=0;n<3;n++) __ooga.factory.greeter.update(0,0)`);
        await b.sleep(100); await b.screenshot(join(out, `${label}-tess-${quality}.png`));
      }
      await b.evaluate(`(() => { const B = __ooga, held = window.__residencyPhoto; BL.scenes.factory.update = held.update;
        Object.assign(B.camera.position, held.position); Object.assign(B.camera.target, held.target); delete window.__residencyPhoto; })()`);
    }
  }
} finally {
  const evidence = { label, at: new Date().toISOString(), pageSha256: createHash("sha256").update(readFileSync(join(root, "_site/index.html"))).digest("hex"), rows, logs: b?.logs || [] };
  writeFileSync(join(out, `${label}.json`), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ logs: evidence.logs }));
  if (b) b.close(); await dispose(); await new Promise(resolve => server.close(resolve));
}
