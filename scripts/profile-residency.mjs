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
const laps = Number(process.env.HUB_LAPS) || 0;
const root = fileURLToPath(new URL("../", import.meta.url)), label = process.argv[2] || "baseline", sequence = laps ? Array.from({ length: laps }, () => ["factory", "hub"]).flat() : (process.argv[3] || "factory").split(","), snapshots = process.argv.includes("--snapshots"), rest = process.argv.includes("--rest");
const out = join(root, "untracked/performance"); mkdirSync(out, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".mp3": "audio/mpeg" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try { const bytes = readFileSync(join(root, "_site", path === "/" ? "index.html" : path)); res.writeHead(200, { "Content-Type": types[extname(path)] || (path === "/" ? "text/html" : "application/octet-stream") }); res.end(bytes); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`, rows = [], travels = [];
let b, completed = false, failure = null, environment = null;
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
          frameSets: window.__residencyFrames.filter(ref => !!ref.deref()).length } : null,
        timechain: { preview: window.__residencyPreview?.filter(ref => !!ref.deref()).length ?? null,
          room: window.__residencyRoom?.filter(ref => !!ref.deref()).length ?? null },
        ui: window.__residencyRoster ? { reusedRoster: window.__residencyRoster.filter(ref => ref.deref()?.parentElement === document.getElementById("roster")).length,
          reusedLeaders: window.__residencyLeaders.filter(ref => ref.deref()?.parentElement === document.getElementById("banana-leaders")).length } : null };

    })()`);
    let detached = null;
    if (process.argv.includes("--dom")) {
      const reply = await b.send("DOM.getDetachedDomNodes");
      if (reply.error) detached = { unavailable: reply.error.message };
      else {
        let svg = 0, shadows = 0, userAgentShadows = 0;
        const walk = node => { if (!node) return; if (node.nodeName?.toLowerCase() === "svg") svg++;
          shadows += node.shadowRoots?.length || 0;
          userAgentShadows += node.shadowRoots?.filter(root => root.shadowRootType === "user-agent").length || 0;
          for (const child of [...node.children || [], ...node.shadowRoots || []]) walk(child); };
        for (const tree of reply.result.detachedNodes) walk(tree.treeNode);
        detached = { roots: reply.result.detachedNodes.length, svg, shadows, userAgentShadows,
          rootNames: reply.result.detachedNodes.map(({ treeNode: n }) => ({ name: n.nodeName, attributes: (n.attributes || []).filter((_, i, a) => i % 2 === 0 ? ["id", "class", "type"].includes(a[i]) : ["id", "class", "type"].includes(a[i - 1])) })) };
      }
    }
    let listeners = null;
    if (process.argv.includes("--listeners")) {
      const reply = await b.send("Runtime.evaluate", { includeCommandLineAPI: true, returnByValue: true, expression: `(() => {
        const counts = new Map(), targets = [window, document, ...document.querySelectorAll("*")];
        for (const target of targets) for (const [type, list] of Object.entries(getEventListeners(target))) for (const event of list) {
          const key = [target === window ? "window" : target === document ? "document" : target.id || target.nodeName,
            type, event.useCapture, event.listener.name, String(event.listener).slice(0, 180)].join("|");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
      })()` });
      if (reply.result.exceptionDetails) throw Error(reply.result.exceptionDetails.text);
      listeners = reply.result.result.value;
    }
    const row = { tag, ...scene, usage, dom, detached, listeners };
    rows.push(row); console.log(JSON.stringify({ ...row, listeners: listeners ? listeners.length : null, detached: detached ? { ...detached, rootNames: undefined } : null }));
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
  if (process.argv.includes("--tasks")) await b.evaluate(`(() => {
    window.__residencyTasks = { max: 0, count: 0 };
    new PerformanceObserver(list => { const s = window.__residencyTasks; for (const e of list.getEntries()) { s.max = Math.max(s.max, e.duration); s.count++; } }).observe({ type: "longtask" });
  })()`);
  environment = await b.evaluate(`(() => { const gl = document.getElementById("scene").getContext("webgl2"), ext = gl && gl.getExtension("WEBGL_debug_renderer_info"); return {
    agent: navigator.userAgent, memory: navigator.deviceMemory ?? null, dpr: devicePixelRatio,
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null }; })()`);
  await b.evaluate(`__ooga.renderer.setQuality("high"); __ooga.pilot.goPreset("pile")`);
  await b.sleep(3000);
  if (process.argv.includes("--dom")) await b.evaluate(`(() => {
    const B = __ooga;
    for (let i = 0; i < 3; i++) B.game.recordDonation({ id: "residency-donor-" + i, sats: 1000 + i, handle: "donor-" + i, message: "", at: Date.now() });
    BL.hud.setDonationStats(B.game.state);
    window.__residencyRoster = [...document.getElementById("roster").children].filter(n => n.dataset.name).map(n => new WeakRef(n));
    window.__residencyLeaders = [...document.getElementById("banana-leaders").children].map(n => new WeakRef(n));
  })()`);
  if (rest) console.log(JSON.stringify({ restSites: await b.evaluate("__ooga.clankers.debugLoungeSpots(__ooga.clankers.list[0]).length") }));
  await measure("boot");
  if (process.argv.includes("--sphere")) {
    const preview = await b.evaluate(`new Promise((resolve, reject) => {
      const B = __ooga, T = BL.scenes.hub.debug.timechainIsland, G = T.gate, S = BL.timechainModels.SPOTS;
      B.pilot.possess(B.crew.cavemen.get("portlandhodl"));
      B.pilot.navigate({ position: { x: T.worldX(S.WAIT.x, S.WAIT.z), y: T.place.y, z: T.worldZ(S.WAIT.x, S.WAIT.z) }, yaw: T.place.ry, pitch: 0.1, dist: 4 });
      G.engage(); G.choose(1); G.press("enter");
      const start = performance.now();
      const tick = () => {
        const prepared = G.debug.prepared;
        if (prepared) {
          const geometries = new Set(), walk = node => { if(node.geometry) geometries.add(node.geometry); for(const c of node.children) walk(c); };
          walk(prepared.built.root); window.__residencyPreview = [...geometries].map(g => new WeakRef(g));
          G.press("back"); resolve({ meshes: geometries.size, state: G.debug.state });
        } else if (performance.now() - start > 25000) reject(Error("Sphere preview not prepared: " + G.debug.state));
        else requestAnimationFrame(tick);
      }; tick();
    })`);
    console.log(JSON.stringify({ preview }));
    await b.sleep(500);
  }
  for (let i = 0; i < sequence.length; i++) {
    const [id, place] = sequence[i].split(":");
    if (process.argv.includes("--tasks")) await b.evaluate(`Object.assign(window.__residencyTasks, { max: 0, count: 0 })`);
    const result = await b.evaluate(`new Promise((resolve, reject) => { const start = performance.now(); if(!__ooga.go(${JSON.stringify(id)}, ${JSON.stringify(place || null)})) { reject(Error("Transition refused")); return; } const tick = () => { if (__ooga.scene === ${JSON.stringify(id)} && !__ooga.transitioning) resolve(performance.now() - start); else if(performance.now() - start > 90000) reject(Error("Transition timed out: " + __ooga.scene + " / " + __ooga.transitioning + " / frames " + __ooga.renderedFrames)); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
    const travel = { scene: id, ms: result }; travels.push(travel); console.log(JSON.stringify({ travel: id, ms: result }));
    await b.sleep(2500);
    if (process.argv.includes("--tasks")) { travel.tasks = await b.evaluate("window.__residencyTasks"); console.log(JSON.stringify({ transitionTasks: id, ...travel.tasks })); }
    if (id === "arcade" && process.argv.includes("--cabinets")) await b.evaluate(`(() => {
      const A = BL.arcadeModels;
      window.__residencyCabinets = A.CABINETS.filter(c => c.index !== 0 && c.index !== 3).map(c => new WeakRef(A.cabinet(c.index)));
      window.__residencyFrames = [1, 2].map(i => new WeakRef(A.attractFrames(i)));
    })()`);
    if (id === "timechain" && process.argv.includes("--sphere")) await b.evaluate(`(() => {
      const geometries = new Set(), walk = node => { if(node.geometry && !node.geometry.imageSurface) geometries.add(node.geometry); for(const c of node.children) walk(c); };
      walk(BL.scenes.timechain.root); window.__residencyRoom = [...geometries].map(g => new WeakRef(g));
    })()`);
    if (!laps || id === "hub" && (i === 1 || i === sequence.length - 1)) await measure(`${i + 1}-${id}`);
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
  completed = true;
} catch (error) { failure = error.message; throw error; } finally {
  const evidence = { label, completed, failure, environment, at: new Date().toISOString(), pageSha256: createHash("sha256").update(readFileSync(join(root, "_site/index.html"))).digest("hex"), rows, travels, logs: b?.logs || [] };
  writeFileSync(join(out, `${label}.json`), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ logs: evidence.logs }));
  if (b) b.close(); await dispose(); await new Promise(resolve => server.close(resolve));
}
