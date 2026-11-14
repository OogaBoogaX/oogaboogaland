// The engine's performance baseline: per scene and quality tier, CPU time in the frame callback, frame gaps, GPU frame
// time and the renderer's own counters (`renderer.stats.info`). Build first; one Chrome at a time.
//   node scripts/profile-baseline.mjs [scene ...] [--out file] [--vsync]
// Scenes default to every one below; Ooga Rally is closed on the live site, so it opens through `wip=race`. `hub-walk` is the hub with an Ooga walking (D and A held in turn, as the suite's
// frame-rate floor does). Frame pacing is uncapped unless --vsync, so the numbers show headroom, not display rate.
// Each scene loads twice: once plain for timings, once with `glstats=1` for GL call counts and GPU time, whose context
// wrappers cost CPU. The timer extension's figures are a guide to relative cost; on ANGLE Metal they are not exact.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, dispose } from "../test/browser.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, i + 1 < args.length && !args[i + 1].startsWith("--") ? 2 : 1)[1] ?? true; };
const out = flag("--out") || join(root, "untracked/performance/baseline.json");
const vsync = !!flag("--vsync");
const SCENES = ["hub", "hub-walk", "lab", "race", "arcade", "factory", "bifrost", "mine", "drop", "orbit"];
const scenes = args.length ? args : SCENES;
const TIERS = ["high", "medium", "low"];
const SAMPLE_MS = 4000, SETTLE_MS = 2500;
const page = pathToFileURL(join(root, "src/index.html")).href;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Times each frame callback; the renderer's counters cover everything else.
const timing = `(() => {
  // Counters are summed in place each frame, so the harness itself allocates almost nothing while it samples.
  const C = window.__baseline = { on: false, cpu: [], gaps: [], sum: {}, n: 0, gpu: [], last: 0 };
  const add = (key, v) => { if (v != null) C.sum[key] = (C.sum[key] || 0) + v; };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!C.on) return cb(t);
    const now = performance.now();
    if (C.last) C.gaps.push(now - C.last);
    C.last = now;
    cb(t);
    C.cpu.push(performance.now() - now);
    const s = window.__ooga && window.__ooga.renderer.stats, i = s && s.info;
    if (!i) return;
    C.n++;
    add("calls", i.calls); add("triangles", i.triangles); add("instances", i.instances);
    for (const p in i.passes) { add(p + ".calls", i.passes[p].calls); add(p + ".triangles", i.passes[p].triangles); }
    if (i.gl) for (const k in i.gl) add("gl." + k, i.gl[k]);
    if (i.gpuMs != null && i.gpuMs !== C.lastGpu) { C.gpu.push(i.gpuMs); C.lastGpu = i.gpuMs; }
  });
})();`;

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
const mean = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;

const settle = async (b, scene) => {
  for (let i = 0; i < 600; i++) {
    const state = await b.evaluate(`(() => {
      const B = window.__ooga;
      if (!B || B.scene !== ${JSON.stringify(scene)} || !B.renderer.ready || B.transitioning) return null;
      const card = document.querySelector('[data-intro="${scene}"]');
      if (card && !card.hidden) { card.querySelector('[data-action="intro-go"]')?.click(); return null; }
      return B.renderedFrames;
    })()`).catch(() => null);
    if (state > 30) return true;
    await sleep(100);
  }
  return false;
};

// Possess the roster's portlandhodl and walk, as the suite's wall-movement check does.
const walk = (b, on) => b.evaluate(on ? `(() => {
  const B = window.__ooga, npc = B.cavemen.get("portlandhodl");
  if (B.crew.player?.npc !== npc) B.pilot.possess(npc);
  B.pilot.navigate({ position: { x: 10, y: B.island.surfaceAt(10, 0), z: 0 }, yaw: 0, pitch: 0.4, dist: 10 });
  const key = (name, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: name }));
  // Path length, sampled as it goes: D and A in turn can bring the Ooga back to where it started.
  const p = B.crew.player.root.position, from = window.__baselineFrom = { x: p.x, z: p.z, travel: 0 };
  window.__baselineTrack = setInterval(() => { from.travel += Math.hypot(p.x - from.x, p.z - from.z); from.x = p.x; from.z = p.z; }, 50);
  let held = "d";
  key(held, true);
  window.__baselineWalk = setInterval(() => { key(held, false); held = held === "d" ? "a" : "d"; key(held, true); }, 420);
})()` : `(() => {
  clearInterval(window.__baselineWalk);
  clearInterval(window.__baselineTrack);
  for (const k of ["a", "d"]) window.dispatchEvent(new KeyboardEvent("keyup", { key: k }));
  return window.__baselineFrom.travel;
})()`);

const run = async (name, counts) => {
  const scene = name === "hub-walk" ? "hub" : name;
  const b = await launch({ w: 1920, h: 1080, perf: vsync });
  try {
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: timing });
    await b.focus(true);
    await b.open(`${page}?debug=1&nosim=1&hour=12&day=80&scene=${scene}${scene === "race" ? "&wip=race" : ""}${counts ? "&glstats=1" : ""}`);
    const t0 = Date.now();
    if (!await settle(b, scene)) return { name, error: "did not settle" };
    const settleMs = Date.now() - t0;
    if (name === "hub-walk") await walk(b, true);
    await sleep(SETTLE_MS);
    const env = await b.evaluate(`(() => { const g = document.createElement("canvas").getContext("webgl2"), e = g && g.getExtension("WEBGL_debug_renderer_info"); return { gpu: e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, size: __ooga.renderer.size, timing: __ooga.timing }; })()`);
    await b.send("HeapProfiler.collectGarbage");
    const heapMB = +((await b.send("Runtime.getHeapUsage")).result.usedSize / 1048576).toFixed(1);
    const tiers = {};
    for (const tier of TIERS) {
      await b.evaluate(`__ooga.renderer.setQuality(${JSON.stringify(tier)})`);
      await sleep(1500);
      await b.evaluate(`(() => { const C = __baseline; C.cpu = []; C.gaps = []; C.sum = {}; C.n = 0; C.gpu = []; C.lastGpu = null; C.last = 0; C.on = true; })()`);
      await sleep(SAMPLE_MS);
      const r = await b.evaluate(`(() => { const C = __baseline, s = __ooga.renderer.stats; C.on = false; return { cpu: C.cpu, gaps: C.gaps, sum: C.sum, n: C.n, gpu: C.gpu, records: s.records, active: s.active, quality: __ooga.renderer.quality }; })()`);
      const per = (key) => r.sum[key] == null || !r.n ? null : Math.round(r.sum[key] / r.n);
      const row = { quality: r.quality, frames: r.cpu.length, records: r.records, active: r.active };
      if (!counts) {
        Object.assign(row, {
          cpuMs: { mean: mean(r.cpu), p50: pct(r.cpu, 0.5), p95: pct(r.cpu, 0.95) },
          gapMs: { mean: mean(r.gaps), p50: pct(r.gaps, 0.5), p95: pct(r.gaps, 0.95), max: pct(r.gaps, 1) },
          calls: per("calls"), triangles: per("triangles"), instances: per("instances"),
          passes: Object.fromEntries(["shadow", "capture", "main", "post"].map(p => [p, { calls: per(p + ".calls"), triangles: per(p + ".triangles") }]))
        });
      } else {
        const gl = Object.keys(r.sum).filter(k => k.startsWith("gl."));
        row.gpuMs = r.gpu.length ? { n: r.gpu.length, mean: mean(r.gpu), p50: pct(r.gpu, 0.5), p95: pct(r.gpu, 0.95) } : null;
        row.gl = gl.length ? Object.fromEntries(gl.map(k => [k.slice(3), per(k)])) : null;
        row.counted = { calls: per("calls"), triangles: per("triangles") };
      }
      tiers[tier] = row;
    }
    // A walk that went nowhere measured a still view: fail it rather than report it.
    if (name === "hub-walk" && !(await walk(b, false) > 1)) return { name, error: "the Ooga did not walk" };
    return { name, settleMs, heapMB, env, tiers };
  } finally {
    await b.close(true);
  }
};

const results = [];
for (const name of scenes) {
  const plain = await run(name, false).catch(e => ({ name, error: e.message }));
  const counted = plain.error ? null : await run(name, true).catch(e => ({ name, error: e.message }));
  if (counted && !counted.error) for (const tier of TIERS) Object.assign(plain.tiers[tier], { gpuMs: counted.tiers[tier].gpuMs, gl: counted.tiers[tier].gl });
  results.push(plain);
}
await dispose();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ machine: results.find(r => r.env)?.env.gpu || null, vsync, results }, null, 1));
const cell = (v) => v == null ? "-" : String(v);
console.log(`| scene | tier | CPU p50 ms | GPU p50 ms | gap p95 ms | calls | triangles | programs | uniforms | heap MB | ready ms |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
for (const r of results) {
  if (r.error) { console.log(`| ${r.name} | - | ${r.error} |||||||||`); continue; }
  for (const tier of TIERS) {
    const t = r.tiers[tier];
    console.log(`| ${r.name} | ${tier} | ${cell(t.cpuMs?.p50)} | ${cell(t.gpuMs?.p50)} | ${cell(t.gapMs?.p95)} | ${cell(t.calls)} | ${cell(t.triangles)} | ${cell(t.gl?.programs)} | ${cell(t.gl?.uniforms)} | ${tier === "high" ? r.heapMB : ""} | ${tier === "high" ? cell(r.env.timing.ready) : ""} |`);
  }
}
console.log(`\n${out}`);
