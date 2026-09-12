// End-to-end checks in headless Chrome
import { AsyncLocalStorage } from "node:async_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = `file://${join(root, "src", "index.html")}`;
const dist = `file://${join(root, "oogaboogaland.html")}`;
// Checks pin the clock at noon unless they ask for another hour
const clock = (query = "") => `${query.includes("hour=") ? "" : "&hour=12"}${query ? "&" + query : ""}`;
const page = (base, query) => `${base}?debug=1&nosim=1&scene=lab${clock(query)}`;
// Without scene= the page lands on the hub
const hubPage = (base, query) => `${base}?debug=1&nosim=1${clock(query)}`;
const matrixSettled = (b, full = true) => b.evaluate(`new Promise((resolve, reject) => { const B = window.__ooga, W = B.matrixCave.world, start = performance.now(), frame = B.renderedFrames, tick = () => { if (${full ? "W.radius === W.maxRadius" : "W.radius === 0 && !W.active"} && B.renderedFrames > frame) resolve(); else if (performance.now() - start > 30000) reject(new Error("Matrix wave did not ${full ? "finish expanding" : "finish retracting"}")); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
// Sets the pile level, then measures how far any point of the mound surface is from the nearest shell banana
const shellCoverage = `(level) => { const B = window.__ooga, M = window.BL.models, profile = M.BANANA_PILE_PROFILE; B.setPileLevel(level); const data = B.shell.instanceData, n = B.shell.instanceCount, core = B.core, coreColors = core.geometry.faces.map((f) => f.color); const surfaceY = (r) => { for (let i = 0; i < profile.length - 1; i++) { const o = profile[i], q = profile[i + 1]; if (r < q[0]) continue; return o[1] + (q[1] - o[1]) * (o[0] - r) / (o[0] - q[0]); } return profile[profile.length - 1][1]; }; let worst = 0, sum = 0; const samples = 600; for (let s = 0; s < samples; s++) { const u = (s + 0.5) / samples, angle = s * 2.399963; const r = Math.sqrt(u) * 0.97, wr = r * M.bananaPileRadiusScale(angle, r) * core.scale.x, x = Math.cos(angle) * wr, z = Math.sin(angle) * wr, y = core.position.y + (surfaceY(r) + M.bananaPileHeightOffset(angle, r)) * core.scale.y; let nearest = Infinity; for (let i = 0; i < n; i++) { const o = i * 20, d = Math.hypot(data[o + 12] - x, data[o + 13] - y, data[o + 14] - z); if (d < nearest) nearest = d; } worst = Math.max(worst, nearest); sum += nearest; } return { level, tiles: n, worstGap: +worst.toFixed(3), meanGap: +(sum / samples).toFixed(3), yellowPanels: coreColors.every((c) => c[0] >= 180 && c[1] >= 135 && c[2] <= 65), panelColors: new Set(coreColors.map((c) => c.join(","))).size }; }`;
// The most the working crew can eat between two snapshots taken at performance.now() stamps
const eatenBetween = (before, after) => `(() => { const B = window.__ooga; return [...B.cavemen.values()].filter((c) => c.state === "working").length * window.BL.crew.EAT_RATE * (${after} - ${before}) / 1000 + 0.05; })()`;
const covered = (c) => c.worstGap <= 0.14 && c.meanGap <= 0.08 && c.yellowPanels && c.panelColors >= 5 && c.tiles > 0;
const results = [];
// Blocks run side by side, so each one collects its lines and prints them together when it finishes
const output = new AsyncLocalStorage();
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  const line = `${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`;
  const lines = output.getStore();
  if (lines) lines.push(line);
  else console.log(line);
};
// The page is ready once the leaf curtain has opened and left the DOM: the first frame is drawn and the scene is live
const untilReady = async (b) => {
  const t0 = Date.now();
  for (;;) {
    let ready = false;
    try {
      ready = await b.evaluate(`!!window.__ooga && window.__ooga.renderedFrames >= 2 && !document.getElementById("curtain")`);
    } catch {
      // The old document is still tearing down
    }
    if (ready) return;
    if (Date.now() - t0 > 20000) throw new Error("the page did not draw its first frame");
    await b.sleep(40);
  }
};
// Blocks that share a page run one after another in the same Chrome; each keeps its own name, error and clean-console check
const fold = (url, steps, opts = {}) => output.run([], async () => {
  const lines = output.getStore();
  const t0 = Date.now();
  let b = null, started = t0, ready = t0;
  try {
    b = await launch(opts);
    started = Date.now();
    await b.open(url);
    await b.focus(true);
    await untilReady(b);
    ready = Date.now();
    for (const [i, [name, fn]] of steps.entries()) {
      const from = i ? b.logs.length : 0;
      try {
        await fn(b);
        const noise = b.logs.slice(from).filter((l) => !l.includes("WebGL2 renderer failed"));
        record(`${name}: clean console`, noise.length === 0, `${((Date.now() - started) / 1000).toFixed(1)}s ${noise.join(" | ").slice(0, 200)}`);
      } catch (err) {
        record(name, false, String(err.message || err).slice(0, 200));
      }
    }
  } catch (err) {
    record(steps[0][0], false, String(err.message || err).slice(0, 200));
  } finally {
    if (b) b.close();
    const s = (ms) => (ms / 1000).toFixed(1);
    lines.push(`TIME ${steps.map((step) => step[0]).join(" + ")} · launch ${s(started - t0)}s · boot ${s(ready - started)}s · body ${s(Date.now() - ready)}s`);
    console.log(lines.join("\n"));
  }
});
const withPage = (name, url, fn, opts) => fold(url, [[name, fn]], opts);
// Waits for a condition on the page, then two more drawn frames so its effects are on screen
const untilPage = (b, cond, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga, t0 = performance.now(); let hitFrame = 0; const tick = () => { const s = B.stats(); if (!hitFrame && (${cond})) hitFrame = B.renderedFrames; if ((hitFrame && B.renderedFrames >= hitFrame + 2) || performance.now() - t0 > ${ms}) resolve(!!hitFrame); else requestAnimationFrame(tick); }; tick(); })`);

const core = (label, base) => withPage(label, page(base), async (b) => {
  const before = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find(c => c.state === "working" && !c.walk); const cp = B.project(cave.root.position.x, cave.headOffset * 0.5, cave.root.position.z); return { cave: cp, caveName: cave.traits.name, shown: B.shown, targets: B.input.targetCount, slots: B.slots.length }; })()`);
  const tusks = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].find(c => c.traits.name === "w-s-bitcoin"), g = c.headOpen, u = c.traits.height / 16, close = (a, b) => Math.abs(a - b) < 1e-5, bounds = (face) => { const p = face.i.map((i) => [g.verts[i * 3] / u + 3.5, g.verts[i * 3 + 1] / u, g.verts[i * 3 + 2] / u + 3]); return { face, minX: Math.min(...p.map((q) => q[0])), maxX: Math.max(...p.map((q) => q[0])), minY: Math.min(...p.map((q) => q[1])), maxY: Math.max(...p.map((q) => q[1])), minZ: Math.min(...p.map((q) => q[2])), maxZ: Math.max(...p.map((q) => q[2])) }; }, faces = g.faces.map(bounds), frontColor = (x, y) => faces.find((f) => close(f.minZ, 8) && close(f.maxZ, 8) && f.minX <= x + 0.5 && f.maxX >= x + 0.5 && f.minY <= y + 0.5 && f.maxY >= y + 0.5)?.face.color.join(","), sideGap = (x) => faces.some((f) => close(f.minX, x) && close(f.maxX, x) && f.minY <= 0.5 && f.maxY >= 0.5 && f.minZ <= 6.5 && f.maxZ >= 6.5), rows = [0, 1].map((y) => Array.from({ length: 7 }, (_, x) => frontColor(x, y))), colors = rows.flat(), white = rows[0][1], tan = rows[0][0]; return { trait: c.traits.symmetricTusks, rows, mirrored: rows.every((row) => row.every((color, x) => color === row[6 - x])), whites: colors.filter((color) => color === white).length, tans: colors.filter((color) => color === tan).length, colorsDiffer: white !== tan && tan !== rows[0][2], rearGaps: sideGap(1) && sideGap(6) }; })()`);
  const bee = await b.evaluate(`(() => { const all = [...window.__ooga.cavemen.values()], c = all.find((c) => c.traits.name === "RandyMcMillan"), colors = (g) => new Set(g.faces.map((f) => f.color.join(","))), head = colors(c.headOpen), torso = colors(c.parts.torso.geometry), rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(","); return { bee: c.traits.bee, state: c.state, goggles: head.has(rgb("#3a9dff")), antennae: head.has(rgb("#141414")), stripes: torso.has(rgb("#141414")), wings: torso.has(rgb("#e4f3fb")), children: c.root.children.length, plain: all.find((o) => o.traits.name === "portlandhodl").root.children.length }; })()`);
  record(`${label}: RandyMcMillan is the Bee Ooga, eating at the pile, with goggles, antennae, stripes and wings baked into his own head and torso`, bee.bee && bee.state === "working" && bee.goggles && bee.antennae && bee.stripes && bee.wings && bee.children === bee.plain, JSON.stringify(bee));
  record(`${label}: w-s-bitcoin has mirrored tusks without stray rear cubes`, tusks.trait && tusks.mirrored && tusks.whites === 2 && tusks.tans === 4 && tusks.colorsDiffer && tusks.rearGaps, JSON.stringify(tusks));
  const anunnaki = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].find(c => c.traits.name === "timechainb"), u = c.traits.height / 16, top = (g) => Math.max(...g.verts.filter((_, i) => i % 3 === 1)) / u; return { trait: c.traits.anunnaki, lionFaces: c.parts.lion.geometry.faces.length, lionOnRoot: c.root.children.includes(c.parts.lion), staffTop: +top(c.skins.club.default).toFixed(1), goldTop: +top(c.skins.club.gold).toFixed(1), upright: c.parts.club.rotation.x < 0.5 }; })()`);
  record(`${label}: timechainb is the Anunnaki with a lion under his arm and a staff in his grip`, anunnaki.trait && anunnaki.lionFaces > 50 && anunnaki.lionOnRoot && anunnaki.staffTop >= 16 && anunnaki.goldTop === anunnaki.staffTop && anunnaki.upright, JSON.stringify(anunnaki));
  const drop = await b.evaluate(`({ height: window.BL.pile.BANANA_DROP_HEIGHT, tallestTree: window.BL.terrain.MAX_HEIGHT + window.BL.hubModels.TREE_HEIGHT })`);
  record(`${label}: bananas start falling from twice the tallest treetop`, drop.height === drop.tallestTree * 2, JSON.stringify(drop));
  await b.mouse("mouseMoved", before.cave.x, before.cave.y, { button: "none" });
  await b.sleep(300);
  const tip = await b.evaluate(`(() => { const t = document.getElementById("tooltip"); return { hidden: t.hidden, text: t.textContent }; })()`);
  record(`${label}: hover tooltip`, !tip.hidden && tip.text.includes(before.caveName), tip.text);
  record(`${label}: pile bananas are decorative, not interaction targets`, before.targets < before.slots, `${before.targets} targets for ${before.slots} shell bananas`);
  await b.click(before.cave.x, before.cave.y);
  await b.sleep(150);
  const hop = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].find(c => c.traits.name === ${JSON.stringify(before.caveName)}); return c.hop > 0 || c.hopV > 0; })()`);
  record(`${label}: poke hops`, hop === true);
  const landedBeforeTip = await b.evaluate("window.__ooga.stats().dropsLanded");
  await b.key("l");
  await untilPage(b, `s.dropsLanded > ${landedBeforeTip} && s.deliveries + s.pendingDrops === 0`);
  const loot = await b.evaluate(`(() => { const B = window.__ooga; return { enabled: B.lootEnabled, crates: B.crates.length, inventory: B.game.state.inventory.length, rows: document.querySelectorAll("#inventory .loot-row").length, tabHidden: document.getElementById("loot-tab").hidden, panelHidden: document.querySelector('[data-panel="loot"]').hidden, helpHidden: document.getElementById("crate-help").hidden, worn: [...B.cavemen.values()].reduce((sum, cave) => sum + cave.swagNodes.length, 0), sats: document.getElementById("stat-sats").textContent }; })()`);
  record(`${label}: loot drops, worn swag and the Loot panel stay off by default`, !loot.enabled && loot.crates === 0 && loot.inventory === 0 && loot.rows === 0 && loot.tabHidden && loot.panelHidden && loot.helpHidden && loot.worn === 0, JSON.stringify(loot));
  record(`${label}: large counts read short`, loot.sats === "120K" && (await b.evaluate(`[1200, 9999, 139600, 2100000].map(window.BL.game.formatLarge).join(",")`)) === "1.2K,9.9K,139K,2.1M", loot.sats);
  await b.key("p");
  await untilPage(b, "B.shown >= 290");
  const perf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); let frames = 0; const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else resolve({ fps: +(frames / 3).toFixed(1), shown: B.shown }); }; requestAnimationFrame(f); })`);
  record(`${label}: full pile runs`, perf.shown >= 290, `${perf.fps} fps at ${perf.shown} bananas`);
  const transition = await b.evaluate(`(() => { const B = window.__ooga, P = window.BL.pile, profile = window.BL.models.BANANA_PILE_PROFILE; const sample = (level) => { B.setPileLevel(level); const data = B.shell.instanceData; let minY = Infinity, maxY = -Infinity; for (let i = 0; i < B.shell.instanceCount; i++) { const offset = i * 20; minY = Math.min(minY, data[offset + 13]); maxY = Math.max(maxY, data[offset + 13]); } return { level, shell: B.shell.instanceCount, version: B.shell.instanceVersion, loose: B.slots.filter((slot) => slot.node.visible).length, coreVisible: B.core.visible, radius: B.core.scale.x, height: B.core.scale.y, coreTop: B.core.position.y + profile[profile.length - 1][1] * B.core.scale.y, minY, maxY }; }; return { capacity: P.DISK_BANANAS, packingHeight: P.PACKING_HEIGHT, one: sample(1), half: sample(Math.floor(P.DISK_BANANAS / 2)), near: sample(300), full: sample(P.DISK_BANANAS), swapped: sample(P.DISK_BANANAS + 1) }; })()`);
  record(`${label}: one surface layer and its backing inflate continuously through the 302-banana transition`, transition.capacity === 302 && transition.packingHeight > 1 && [transition.one, transition.half, transition.near, transition.full, transition.swapped].every((sample) => sample.loose === 0 && sample.coreVisible && sample.shell > 0) && transition.one.shell === 1 && transition.one.shell < transition.half.shell && transition.half.shell < transition.near.shell && transition.near.shell <= transition.full.shell && transition.full.shell === transition.swapped.shell && transition.one.radius === transition.full.radius && transition.swapped.radius > transition.full.radius && transition.one.height < transition.half.height && transition.half.height < transition.near.height && transition.near.height < transition.full.height && transition.full.height < transition.swapped.height && transition.full.shell < transition.capacity && Math.abs(transition.near.coreTop - transition.full.coreTop) < 0.01 && Math.abs(transition.full.coreTop - transition.swapped.coreTop) < 0.002 && Math.abs(transition.near.maxY - transition.full.maxY) < 0.01 && Math.abs(transition.full.maxY - transition.swapped.maxY) < 1e-6 && transition.full.version === transition.swapped.version, JSON.stringify(transition));
  const shell = await b.evaluate(`(() => { const B = window.__ooga; B.setPileLevel(1000); const data = B.shell.instanceData, scale = window.BL.models.BANANA_AMMO_SCALE, profile = window.BL.models.BANANA_PILE_PROFILE, verts = B.shell.geometry.verts; let maxScaleError = 0, minCenter = Infinity, maxTurn = 0, minZ = Infinity, maxZ = -Infinity; for (let i = 2; i < verts.length; i += 3) { minZ = Math.min(minZ, verts[i]); maxZ = Math.max(maxZ, verts[i]); } for (let i = 0; i < B.shell.instanceCount; i++) { const o = i * 20, sx = Math.hypot(data[o], data[o + 1], data[o + 2]), sy = Math.hypot(data[o + 4], data[o + 5], data[o + 6]), sz = Math.hypot(data[o + 8], data[o + 9], data[o + 10]), angle = Math.atan2(data[o + 14], data[o + 12]), tangentX = -Math.sin(angle), tangentZ = Math.cos(angle), alignment = Math.abs(data[o] / scale * tangentX + data[o + 2] / scale * tangentZ); maxScaleError = Math.max(maxScaleError, Math.abs(sx - scale), Math.abs(sy - scale), Math.abs(sz - scale)); maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, alignment))); for (let j = 0; j < B.shell.instanceCount; j++) { if (i === j) continue; const q = j * 20; minCenter = Math.min(minCenter, Math.hypot(data[o + 12] - data[q + 12], data[o + 13] - data[q + 13], data[o + 14] - data[q + 14])); } } return { looseVisible: B.slots.filter((s) => s.node.visible).length, coverage: (${shellCoverage})(1000), maxScaleError, minCenter, maxTurn, depth: (maxZ - minZ) * scale, faces: B.shell.geometry.faces.length, apex: profile[profile.length - 1][1], shoulder: profile[profile.length - 2][1] }; })()`);
  record(`${label}: the restored layered ammo-size shell covers the larger loose-volume mound`, shell.looseVisible === 0 && covered(shell.coverage) && shell.coverage.tiles >= 120 && shell.coverage.tiles <= 320 && shell.maxScaleError < 1e-6 && shell.minCenter > 0.02 && shell.maxTurn > 0.3 && shell.depth > 0.06 && shell.faces >= 40 && shell.apex < 0.95 && shell.apex - shell.shoulder < 0.03, JSON.stringify(shell));
  const redrawn = await b.evaluate(`(() => { const B = window.__ooga; B.setPileLevel(1000); const beforeVersion = B.shell.instanceVersion, before = B.shell.instanceCount, edge = B.core.scale.x; B.setPileLevel(1001); const oneMore = { version: B.shell.instanceVersion, tiles: B.shell.instanceCount, edge: B.core.scale.x }; B.setPileLevel(1100); const grown = { version: B.shell.instanceVersion, tiles: B.shell.instanceCount, edge: B.core.scale.x }; B.setPileLevel(1000); return { beforeVersion, before, edge, oneMore, grown, back: { version: B.shell.instanceVersion, tiles: B.shell.instanceCount, edge: B.core.scale.x } }; })()`);
  record(`${label}: the restored shell relays only when its established band layout needs more bananas`, redrawn.oneMore.edge > redrawn.edge && redrawn.oneMore.version === redrawn.beforeVersion && redrawn.oneMore.tiles === redrawn.before && redrawn.grown.version === redrawn.beforeVersion + 1 && redrawn.grown.tiles > redrawn.before && redrawn.grown.edge > redrawn.oneMore.edge && redrawn.back.version === redrawn.grown.version + 1 && redrawn.back.tiles === redrawn.before && redrawn.back.edge === redrawn.edge, JSON.stringify(redrawn));
  const drift = await b.evaluate(`(() => { const B = window.__ooga; const grab = (level) => { B.setPileLevel(level); const d = B.shell.instanceData, n = B.shell.instanceCount, out = new Float32Array(n * 6); for (let i = 0; i < n; i++) { const o = i * 20, s = Math.hypot(d[o], d[o + 1], d[o + 2]); out.set([d[o + 12], d[o + 13], d[o + 14], Math.abs(d[o]) / s * 0.15, Math.abs(d[o + 1]) / s * 0.15, Math.abs(d[o + 2]) / s * 0.15], i * 6); } return out; }; const A = grab(1000), C = grab(1030), dists = []; for (let i = 0; i < A.length; i += 6) { let best = Infinity; for (let j = 0; j < C.length; j += 6) best = Math.min(best, Math.hypot(A[i] - C[j], A[i + 1] - C[j + 1], A[i + 2] - C[j + 2], A[i + 3] - C[j + 3], A[i + 4] - C[j + 4], A[i + 5] - C[j + 5])); dists.push(best); } dists.sort((x, y) => x - y); return { relaid: A.length !== C.length, median: +dists[dists.length >> 1].toFixed(3), max: +dists[dists.length - 1].toFixed(3) }; })()`);
  record(`${label}: a relay keeps every banana in place and facing the same way while the mound grows under it`, drift.relaid && drift.median < 0.04 && drift.max < 0.1, JSON.stringify(drift));
  const streamStart = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); B.demoTip(1200); B.demoTip(1200); return { level: B.level, shown: B.shown, landed: stats.dropsLanded, at: performance.now() }; })()`);
  await b.key("b");
  const queued = await b.evaluate(`(() => { const B = window.__ooga, s = B.stats(); return { level: B.level, shown: B.shown, deliveries: s.deliveries, pendingDrops: s.pendingDrops, dropPool: s.dropPool, dropRate: s.dropRate, started: s.dropsStarted, landed: s.dropsLanded }; })()`);
  record(`${label}: every donated banana enters the faster bounded stream`, queued.deliveries + queued.pendingDrops === 106 && queued.dropPool === 96 && queued.dropRate === 72 && queued.level <= streamStart.level && queued.shown === Math.floor(queued.level), JSON.stringify({ before: streamStart, after: queued }));
  await b.sleep(450);
  const waveA = await b.evaluate(`window.__ooga.stats()`);
  await b.sleep(450);
  const waveB = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(), radius = window.BL.pile.footprintFor(B.shown, 0.45), moving = B.drops.filter((drop) => drop.moving), radii = moving.map((drop) => Math.hypot(drop.landing.pos.x, drop.landing.pos.z) / radius); let sumI = 0, sumR = 0, inner = 0; const quadrants = new Set(); for (let i = 0; i < moving.length; i++) { sumI += i; sumR += radii[i]; if (radii[i] < 0.5) inner++; quadrants.add((moving[i].landing.pos.x >= 0 ? 1 : 0) + (moving[i].landing.pos.z >= 0 ? 2 : 0)); } const meanI = sumI / moving.length, meanR = sumR / moving.length; let covariance = 0, varianceI = 0, varianceR = 0; for (let i = 0; i < moving.length; i++) { covariance += (i - meanI) * (radii[i] - meanR); varianceI += (i - meanI) ** 2; varianceR += (radii[i] - meanR) ** 2; } return { ...stats, landingCount: moving.length, meanRadius: meanR, maxRadius: Math.max(...radii), innerShare: inner / moving.length, quadrants: quadrants.size, orderCorrelation: covariance / Math.sqrt(varianceI * varianceR) }; })()`);
  record(`${label}: falling bananas launch continuously instead of in disjoint waves`, waveA.deliveries > 24 && waveA.pendingDrops > 0 && waveB.dropsStarted > waveA.dropsStarted && waveB.pendingDrops < waveA.pendingDrops, JSON.stringify({ first: waveA, second: waveB }));
  record(`${label}: falling bananas use a random normal distribution across the pile radius`, waveB.landingCount > 40 && waveB.meanRadius < 0.58 && waveB.maxRadius > 0.7 && waveB.maxRadius < 1.05 && waveB.innerShare > 0.4 && waveB.quadrants === 4 && Math.abs(waveB.orderCorrelation) < 0.45, JSON.stringify(waveB));
  await b.sleep(650);
  const live = await b.evaluate(`(() => { const B = window.__ooga, s = B.stats(); return { level: B.level, shown: B.shown, deliveries: s.deliveries, pendingDrops: s.pendingDrops, landed: s.dropsLanded }; })()`);
  record(`${label}: pile and counter grow as falling bananas land`, live.landed > streamStart.landed && live.deliveries > 0 && live.level > streamStart.level && live.shown === Math.floor(live.level), JSON.stringify({ before: streamStart, live }));
  await b.sleep(2000);
  const streamed = await b.evaluate(`(() => { const B = window.__ooga, s = B.stats(); return { level: B.level, shown: B.shown, outstanding: s.deliveries + s.pendingDrops, landed: s.dropsLanded, at: performance.now() }; })()`);
  const streamEaten = await b.evaluate(eatenBetween(streamStart.at, streamed.at));
  record(`${label}: the complete donation lands promptly and exactly`, streamed.outstanding === 0 && streamed.landed - streamStart.landed === 106 && streamed.level > streamStart.level + 106 - streamEaten && streamed.level <= streamStart.level + 106 && streamed.shown === Math.floor(streamed.level), JSON.stringify({ before: streamStart, after: streamed, eaten: streamEaten }));
  const scaling = await b.evaluate(`(() => { const B = window.__ooga, geo = B.core.geometry, verts = geo.verts; const sample = (level) => { const coverage = (${shellCoverage})(level); const stats = B.stats(), positions = B.slots.map((s) => s.base.pos), scale = B.core.scale; const radius = Math.max(...positions.map((p) => Math.hypot(p.x, p.z))), height = Math.max(...positions.map((p) => p.y)); let baseMin = Infinity, baseMax = 0, innerVariance = 0; for (let ring = 0; ring < geo.pileRings; ring++) { let ringMin = Infinity, ringMax = 0; for (let i = 0; i < geo.pileSegments; i++) { const offset = (ring * geo.pileSegments + i) * 3, r = Math.hypot(verts[offset], verts[offset + 2]) * scale.x; ringMin = Math.min(ringMin, r); ringMax = Math.max(ringMax, r); } if (ring === 0) { baseMin = ringMin; baseMax = ringMax; } else innerVariance = Math.max(innerVariance, ringMax - ringMin); } return { level, radius, height, volume: radius * radius * height, nodes: stats.allNodes, rendered: stats.rendered, coverage, baseVariance: baseMax - baseMin, innerVariance, crewRadius: Math.min(...[...B.cavemen.values()].filter((c) => c.state === "working").map((c) => Math.hypot(c.slot.x, c.slot.z))) }; }; return { samples: [sample(window.BL.pile.DISK_BANANAS * 2), sample(1000), sample(10000), sample(1000000), sample(window.BL.pile.MAX_BANANAS)], coreGeometries: new Set([window.BL.pile.DISK_BANANAS * 2, 1000, 1000000].map((level) => { B.setPileLevel(level); return B.core.geometry; })).size, budget: window.BL.pile.MAX_WEBGL_TILES }; })()`);
  const [smallest, small, medium, million, cap] = scaling.samples;
  const volume10x = medium.volume / small.volume;
  const volume100x = million.volume / medium.volume;
  record(`${label}: growing pile keeps a circular, lumpy yellow-paneled base covered in bananas at every level`, small.radius < medium.radius && medium.radius < million.radius && small.height < medium.height && medium.height < million.height && Math.abs(volume10x - 10) < 1 && Math.abs(volume100x - 100) < 6 && scaling.samples.every((s) => s.nodes === small.nodes && s.crewRadius > s.radius + 0.9 && s.baseVariance < 1e-6 && s.innerVariance / s.radius > 0.025 && covered(s.coverage) && s.rendered === s.coverage.tiles && s.rendered <= scaling.budget) && smallest.rendered < small.rendered && small.rendered < medium.rendered && medium.rendered < million.rendered && million.rendered < cap.rendered && million.rendered >= 8000 && cap.level === 10000000 && scaling.coreGeometries === 1, JSON.stringify(scaling));
  const baseCoverage = await b.evaluate(`(() => { const B = window.__ooga, P = window.BL.pile; const sample = (level) => { B.setPileLevel(level); const data = B.shell.instanceData, verts = B.shell.geometry.verts, floor = B.core.position.y + 0.004, angles = []; let minY = Infinity, maxRadius = 0; for (let instance = 0; instance < B.shell.instanceCount; instance++) { const offset = instance * 20; let instanceMinY = Infinity; for (let i = 0; i < verts.length; i += 3) { const x = verts[i], y = verts[i + 1], z = verts[i + 2], worldX = data[offset] * x + data[offset + 4] * y + data[offset + 8] * z + data[offset + 12], worldY = data[offset + 1] * x + data[offset + 5] * y + data[offset + 9] * z + data[offset + 13], worldZ = data[offset + 2] * x + data[offset + 6] * y + data[offset + 10] * z + data[offset + 14]; instanceMinY = Math.min(instanceMinY, worldY); minY = Math.min(minY, worldY); maxRadius = Math.max(maxRadius, Math.hypot(worldX, worldZ)); } if (instanceMinY <= floor + 1e-5) angles.push(Math.atan2(data[offset + 14], data[offset + 12])); } angles.sort((a, b) => a - b); let maxArcGap = 0; for (let i = 0; i < angles.length; i++) { const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2; maxArcGap = Math.max(maxArcGap, (next - angles[i]) * B.core.scale.x); } return { level, floor, minY, edgeBananas: angles.length, maxArcGap, maxRadius, pileBoundary: P.visualFootprintFor(level, 0.45) }; }; return [sample(1000000), sample(P.MAX_BANANAS)]; })()`);
  record(`${label}: the outer banana layer reaches the platform around the complete large-pile base without crossing it`, baseCoverage.every((sample) => sample.edgeBananas >= 100 && sample.minY >= sample.floor - 1e-6 && sample.minY <= sample.floor + 1e-5 && sample.maxArcGap <= 0.36 && sample.maxRadius <= sample.pileBoundary + 1e-6), JSON.stringify(baseCoverage));
  await b.sleep(1500);
  await b.evaluate(`window.__ooga.setPileLevel(window.BL.pile.MAX_BANANAS)`);
  await b.sleep(500);
  const capPerf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, t0 = performance.now(); let frames = 0; const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve({ fps: +(frames / 2).toFixed(1), nodes: B.stats().allNodes, rendered: B.stats().rendered, shown: B.shown }); }; requestAnimationFrame(tick); })`);
  record(`${label}: ten-million-banana pile keeps a bounded instanced render budget`, capPerf.fps >= 50 && Math.abs(capPerf.nodes - small.nodes) <= 3 && capPerf.rendered >= 40000 && capPerf.rendered <= scaling.budget && capPerf.shown >= 9999999, JSON.stringify(capPerf));
});

const governor = () => withPage("governor", page(src), async (b) => {
  const interval = () => b.evaluate("+window.__ooga.frameInterval.toFixed(1)");
  await b.focus(true);
  await b.sleep(9500);
  const idle = await interval();
  await b.focus(false);
  await b.sleep(400);
  const background = await interval();
  await b.focus(true);
  await b.mouse("mouseMoved", 600, 400, { button: "none" });
  await b.mouse("mouseMoved", 620, 410, { button: "none" });
  await b.sleep(100);
  const active = await interval();
  record("governor: full rate when focused, 30fps when another window is in front", idle === 0 && background === 33.3 && active === 0, `idle=${idle} unfocused=${background} active=${active}`);
  // GPU records come lazily, so wait for frames
  const rendered = () => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + 2 || performance.now() - t0 > 3000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  await b.evaluate(`(() => { const B = window.__ooga; const it = window.BL.models.SWAG.find(c => c.id === "crown"); const e = B.game.addItem({ item: it, tier: it.tier, donationId: "hk" }); B.game.assign(e.id, "portlandhodl"); B.applyAllSwag(); })()`);
  await rendered();
  const withCrown = await b.evaluate("window.__ooga.renderer.stats.records");
  await b.evaluate(`(() => { const B = window.__ooga; B.game.unassign("portlandhodl"); B.applyAllSwag(); })()`);
  await rendered();
  const after = await b.evaluate(`(() => { window.__ooga.housekeep(); return window.__ooga.renderer.stats.records; })()`);
  record("housekeeping releases unused geometry", withCrown > after, `${withCrown} -> ${after}`);
});

const locker = ["locker", async (b) => {
  await b.evaluate(`(() => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const add = (id, d) => { const it = cat.find(c => c.id === id); return g.addItem({ item: it, tier: it.tier, donationId: d }); }; add("crown", "d1"); add("crown", "d2"); add("crown", "d3"); add("bandana", "d4"); add("laser-eyes", "d5"); B.renderLocker(); })()`);
  const rows = await b.evaluate(`[...document.querySelectorAll("#inventory .loot-row")].map(r => ({ name: r.querySelector(".loot-name").textContent, count: r.querySelector(".loot-count")?.textContent || "", icon: (() => { const c = r.querySelector(".loot-icon"); if (!c) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; })() }))`);
  record("locker: grouped by item, tier order, icons drawn", rows.length === 3 && rows[0].name === "Laser Eyes" && rows[1].count === "×3" && rows.every((r) => r.icon), JSON.stringify(rows));
  for (const who of ["portlandhodl", "bc1gui"]) {
    await b.evaluate(`(() => { const row = [...document.querySelectorAll("#inventory .loot-row")].find(r => r.querySelector(".loot-name").textContent === "Crown"); const sel = row.querySelector(".loot-assign"); sel.value = ${JSON.stringify(who)}; sel.dispatchEvent(new Event("change")); })()`);
    await b.sleep(150);
  }
  const worn = await b.evaluate(`(() => { const row = [...document.querySelectorAll("#inventory .loot-row")].find(r => r.querySelector(".loot-name").textContent === "Crown"); return { chips: row.querySelectorAll(".chip").length, free: row.querySelector(".loot-assign option").textContent }; })()`);
  record("locker: give one at a time, worn chips", worn.chips === 2 && worn.free.includes("1 free"), JSON.stringify(worn));
  // Nine of an item is the ceiling: the tenth is refused, a full tier rolls no crate, the others still do
  const cap = await b.evaluate(`(() => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const add = (id, d) => { const it = cat.find(c => c.id === id); return g.addItem({ item: it, tier: it.tier, donationId: d }); }; for (const it of cat.filter(c => c.tier === "legendary")) for (let i = 0; i < 12; i++) add(it.id, "cap-" + it.id + i); B.renderLocker(); const row = [...document.querySelectorAll("#inventory .loot-row")].find(r => r.querySelector(".loot-name").textContent === "Halo"); return { halo: g.countOf("halo"), tenth: add("halo", "cap-extra"), shown: row.querySelector(".loot-count").textContent, legendary: g.lootFor({ id: "cap-roll", sats: 120000 }), epic: g.lootFor({ id: "cap-roll", sats: 21000 })?.tier }; })()`);
  record("locker: stacks stop at nine and a full tier drops no crate", cap.halo === 9 && cap.tenth === null && cap.shown === "×9" && cap.legendary === null && cap.epic === "epic", JSON.stringify(cap));
}];

const fan = () => withPage("fan", page(src), async (b) => {
  const radius = () => b.evaluate(`[...window.__ooga.cavemen.values()].filter(c => c.state === "working").map(c => +Math.hypot(c.slot.x, c.slot.z).toFixed(2))`);
  const r0 = await radius();
  await b.key("p");
  await b.sleep(300);
  const walking = await b.evaluate(`[...window.__ooga.cavemen.values()].filter(c => c.state === "working" && c.walk).length`);
  const r1 = await radius();
  const edge = await b.evaluate(`+window.BL.pile.visualFootprintFor(window.__ooga.level, 0.45).toFixed(2)`);
  record("the ground layer fixes the eaters' nearest radius", r1.every((r, i) => Math.abs(r - r0[i]) < 0.05 && Math.abs(r - edge - 1.1) < 0.06) && walking === 0, `radius ${r0[0]} -> ${r1[0]}, edge ${edge}`);
  const gaps = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].filter(c => c.state === "working").map(c => c.slot); let m = Infinity; for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) m = Math.min(m, Math.hypot(c[i].x - c[j].x, c[i].z - c[j].z)); return +m.toFixed(2); })()`);
  record("eaters keep their distance", gaps >= 1.5, `min gap ${gaps}`);
  await b.sleep(2500);
  const eating = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); cave.nextBuildAt = 1e9; let heldAtReach = false, vanishedAtMouth = false, hiddenAtRest = false, pileMoved = false, wasVisible = cave.parts.snack.visible; const start = performance.now(); const tick = () => { const visible = cave.parts.snack.visible, arm = cave.parts.armR.rotation.x; if (visible && arm < -0.9) heldAtReach = true; if (wasVisible && !visible && arm < -2.1) vanishedAtMouth = true; if (!visible && arm > -0.4) hiddenAtRest = true; if (B.slots.some((s) => s.moving)) pileMoved = true; wasVisible = visible; if (performance.now() - start >= 3800) resolve({ heldAtReach, vanishedAtMouth, hiddenAtRest, pileMoved }); else requestAnimationFrame(tick); }; tick(); })`);
  record("eaters pick up in-hand at the edge and the banana vanishes at their mouth", eating.heldAtReach && eating.vanishedAtMouth && eating.hiddenAtRest && !eating.pileMoved, JSON.stringify(eating));
});

const crates = ["crates", async (b) => {
  for (let i = 0; i < 10; i++) {
    await b.evaluate(`window.__ooga.demoTip(1200)`);
    await b.sleep(120);
  }
  await b.sleep(4500);
  const r = await b.evaluate(`(() => { const B = window.__ooga; const live = B.crates.filter(c => !c.opened); let m = Infinity; for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) m = Math.min(m, Math.hypot(live[i].node.position.x - live[j].node.position.x, live[i].node.position.z - live[j].node.position.z)); return { live: live.length, minDistance: +m.toFixed(2) }; })()`);
  record("crates never overlap and cap at three", r.live <= 3 && (r.live < 2 || r.minDistance >= 1.9), JSON.stringify(r));
}];

const keys = () => withPage("keys", page(src), async (b) => {
  const count = () => b.evaluate(`window.__ooga.level`);
  const eating = () => b.evaluate(`document.querySelectorAll('.roster-state[data-state="working"]').length`);
  // Everyone eats by default, so the fifth Ooga is sent to bed first for the digit to wake
  await b.evaluate(`(() => { const B = window.__ooga; B.crew.cavemen.get("RandyMcMillan").override = "sleeping"; B.crew.refreshStates(); })()`);
  await b.sleep(300);
  const c0 = await count(), e0 = await eating(), landed0 = await b.evaluate(`window.__ooga.stats().dropsLanded`);
  await b.evaluate(`document.querySelector('[data-preset="racks"]').focus()`);
  await b.key("b");
  await b.key("b");
  await b.key("5");
  await b.sleep(4800);
  const c1 = await count(), landed1 = await b.evaluate(`window.__ooga.stats().dropsLanded`);
  record("keys: B streams 100 bananas and digits force eating, even with a button focused", landed1 - landed0 === 200 && c1 - c0 > 198 && c1 - c0 <= 200 && (await eating()) === e0 + 1, `${landed1 - landed0} landed · ${(c1 - c0).toFixed(2)} net bananas`);
  await b.key("Delete", 8);
  await b.sleep(200);
  record("keys: Shift+Delete clears loot", (await b.evaluate(`window.__ooga.game.state.inventory.length`)) === 0);
  // Open the feed dialog, close it with Escape
  await b.evaluate(`document.querySelector('[data-action="feed"]').click()`);
  await b.sleep(150);
  const opened = await b.evaluate(`({ open: document.getElementById("feed").open, focused: document.activeElement && document.activeElement.id })`);
  await b.key("w");
  const stillTyping = await b.evaluate(`(() => { const c = window.__ooga.camera; return +c.target.z.toFixed(2); })()`);
  await b.key("Escape");
  await b.sleep(400);
  const closed = await b.evaluate(`({ open: document.getElementById("feed").open, scene: window.__ooga.scene })`);
  record("feed dialog opens from the panel, keeps the keys, and Escape only closes it", opened.open && opened.focused === "handle" && stillTyping === 0 && !closed.open && closed.scene === "lab", JSON.stringify({ opened, stillTyping, closed }));
  await b.key("R", 8);
  await b.sleep(2500);
  const reset = await b.evaluate(`({ stored: localStorage.getItem("oogaboogaland.v1"), donations: document.getElementById("stat-donations").textContent })`);
  record("keys: Shift+R resets the demo", reset.stored === null && reset.donations === "0");
});

const sheetIntro = () => withPage("sheet intro", hubPage(src), async (b) => {
  const shown = await b.evaluate(`({ open: document.getElementById("sheet").dataset.open, signs: document.querySelectorAll(".sign path").length, tab: getComputedStyle(document.getElementById("sheet-toggle")).display })`);
  // The sheet folds five seconds after load
  const folded = await b.evaluate(`new Promise((resolve) => { const t0 = performance.now(), tick = () => { const open = document.getElementById("sheet").dataset.open; if (open === "false" || performance.now() - t0 > 7000) resolve(open); else setTimeout(tick, 50); }; tick(); })`);
  await b.evaluate(`document.getElementById("sheet-toggle").click()`);
  const reopened = await b.evaluate(`document.getElementById("sheet").dataset.open`);
  record("sheet: shows on load in sign lettering, folds to the pull tab after five seconds, the tab reopens it", shown.open === "true" && shown.signs >= 6 && shown.tab !== "none" && folded === "false" && reopened === "true", JSON.stringify({ shown, folded, reopened }));
  const bananas = await b.evaluate(`(() => { const sheet = document.getElementById("sheet"), tab = () => document.querySelector('[data-tab][aria-selected="true"]').dataset.tab, panel = () => !document.querySelector('[data-panel="bananas"]').hidden; document.getElementById("sheet-bananas").click(); const opened = { open: sheet.dataset.open, tab: tab(), panel: panel(), meterInPanel: !!document.querySelector('[data-panel="bananas"] #meter-count'), metrics: document.querySelectorAll("#project-metrics .stat").length, topbarMeter: !!document.querySelector(".topbar .meter") }; document.getElementById("sheet-bananas").click(); const folded = sheet.dataset.open; document.getElementById("sheet-toggle").click(); const roster = { open: sheet.dataset.open, tab: tab() }; return { opened, folded, roster }; })()`);
  const wrapped = await b.evaluate(`(() => { const el = document.createElement("span"); el.textContent = "Ooga Booga\\n            Land"; try { return { glyphs: window.BL.hud.signLettering(el.textContent).querySelectorAll("path").length, ok: true }; } catch (e) { return { ok: false, error: String(e) }; } })()`);
  record("sheet: sign lettering survives text wrapped across markup lines", wrapped.ok && wrapped.glyphs > 0, JSON.stringify(wrapped));
  record("sheet: the banana tab opens the bananas panel with the meter and project metrics, folds on a second tap, and the caveman tab opens the roster", bananas.opened.open === "true" && bananas.opened.tab === "bananas" && bananas.opened.panel && bananas.opened.meterInPanel && bananas.opened.metrics === 4 && !bananas.opened.topbarMeter && bananas.folded === "false" && bananas.roster.open === "true" && bananas.roster.tab === "roster", JSON.stringify(bananas));
});

const refresh = ["refresh", async (b) => {
  const r = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find(c => c.state === "working" && !c.walk); cave.nextBuildAt = -1; setTimeout(() => { const before = cave.build && cave.build.phase; B.refreshStates(); resolve({ before, after: cave.build && cave.build.phase, walking: !!cave.walk }); }, 600); })`);
  record("state refresh does not interrupt builds", !!r.before && r.after === r.before && !r.walking, JSON.stringify(r));
}];

const weapons = ["weapons", async (b) => {
  const r = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const give = (id, name) => { const it = cat.find(c => c.id === id); const e = g.addItem({ item: it, tier: it.tier, donationId: "w-" + id }); g.assign(e.id, name); }; const [a, b2] = [...B.cavemen.values()].filter(c => c.state === "working" && !c.walk); give("golden-club", a.traits.name); give("golden-ak", b2.traits.name); B.applyAllSwag(); const club = { gold: a.parts.club.geometry === a.skins.club.gold, sameModel: a.skins.club.gold.verts.length === a.skins.club.default.verts.length, visible: a.parts.club.visible }; b2.nextBuildAt = -1; setTimeout(() => { resolve({ club, ak: { phase: b2.build && b2.build.phase, gold: b2.parts.gunBody.geometry === b2.skins.gun.gold, sameModel: b2.skins.gun.gold.verts.length === b2.skins.gun.default.verts.length, visible: b2.parts.gun.visible } }); }, 700); })`);
  record("golden club is a gold skin of the same club", r.club.gold && r.club.sameModel && r.club.visible, JSON.stringify(r.club));
  record("golden AK is a gold skin of the same rifle, shown while shooting", r.ak.phase === "shoot" && r.ak.gold && r.ak.sameModel && r.ak.visible, JSON.stringify(r.ak));
}];

const props = () => withPage("props", page(src, "yaw=2.4"), async (b) => {
  const die = await b.evaluate(`(() => { const B = window.__ooga; for (const [i, d] of B.lab.equipment.dice.entries()) { const w = d.world; const p = B.project(w[12], w[13] + 0.15, w[14]); const hit = p && B.input.pick(p.x, p.y); if (p && p.x > 0 && p.x < 1100 && hit && hit.owner.kind === "die") return { i, x: p.x, y: p.y }; } return null; })()`);
  if (die) {
    await b.click(die.x, die.y);
    await b.sleep(250);
  }
  record("tap a die rolls it", !!die && (await b.evaluate(`window.__ooga.lab.equipment.dice[${die ? die.i : 0}].rolling`)) === true);
  await b.sleep(900);
  // The top face must match the rolled number
  const face = await b.evaluate(`(() => { const d = window.__ooga.lab.equipment.dice[${die ? die.i : 0}]; const w = d.world; const axes = { "+x": w[1], "+y": w[5], "+z": w[9] }; const pips = { "+y": 5, "-y": 2, "+x": 6, "-x": 1, "+z": 3, "-z": 4 }; let best = null, bestV = 0; for (const [axis, v] of Object.entries(axes)) { if (Math.abs(v) > bestV) { bestV = Math.abs(v); best = (v > 0 ? "+" : "-") + axis[1]; } } return { up: pips[best], rolled: d.lastRoll, vertical: +bestV.toFixed(3) }; })()`);
  record("die lands with the rolled face up", !!die && face.up === face.rolled && face.vertical > 0.999, JSON.stringify(face));
  const card = await b.evaluate(`(() => { const B = window.__ooga; for (const [i, c] of B.lab.equipment.cards.entries()) { const w = c.world; const p = B.project(w[12], w[13] + 0.05, w[14]); const hit = p && B.input.pick(p.x, p.y); if (p && p.x > 0 && p.x < 1100 && hit && hit.owner.kind === "card") return { i, x: p.x, y: p.y }; } return null; })()`);
  if (card) {
    await b.click(card.x, card.y);
    await b.sleep(150);
  }
  record("tap a card flips it", !!card && (await b.evaluate(`window.__ooga.lab.equipment.cards[${card ? card.i : 0}].flipping`)) === true);
});

const fallback = () => withPage("canvas2d fallback", page(src, "canvas2d"), async (b) => {
  const kind = await b.evaluate(`document.getElementById("quality").textContent`);
  record("fallback renderer draws", kind.startsWith("canvas2d"), kind);
});

const phone = () => withPage("phone", hubPage(src), async (b) => {
  // The touch hint shows a moment after load
  const r = await b.evaluate(`new Promise((resolve) => { const t0 = performance.now(), tick = () => { const hint = document.getElementById("hint").textContent; if (hint || performance.now() - t0 > 4000) resolve({ quality: document.getElementById("quality").textContent, sheet: document.getElementById("sheet").dataset.open, hint, stick: getComputedStyle(document.getElementById("joy-move")).display }); else setTimeout(tick, 50); }; tick(); })`);
  record("phone: medium tier, collapsed sheet, touch hint, joysticks shown", r.quality.includes("medium") && r.sheet === "false" && r.hint.includes("pinch") && r.stick === "block", JSON.stringify(r));
  // The open sheet takes the sticks' box
  const stickWith = (open) => b.evaluate(`(() => { document.getElementById("sheet").dataset.open = ${JSON.stringify(open)}; const m = document.getElementById("joy-move"); return { box: getComputedStyle(document.querySelector(".joysticks")).display, width: Math.round(m.getBoundingClientRect().width), laidOut: m.offsetParent !== null }; })()`);
  const sticks = { open: await stickWith("true"), closed: await stickWith("false") };
  record("phone: the sticks hide behind the open sheet and return when it collapses", sticks.open.box === "none" && !sticks.open.laidOut && sticks.open.width === 0 && sticks.closed.box === "block" && sticks.closed.width > 0, JSON.stringify(sticks));
  // Hold the move stick up and the camera flies
  const stick = await b.evaluate(`(() => { const r = document.getElementById("joy-move").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const target = () => b.evaluate(`(() => { const c = window.__ooga.camera; return { x: +c.target.x.toFixed(2), z: +c.target.z.toFixed(2) }; })()`);
  const t0 = await target();
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: stick.x, y: stick.y }] });
  for (let i = 1; i <= 6; i++) {
    await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: stick.x, y: stick.y - i * 6 }] });
    await b.sleep(100);
  }
  await b.sleep(400);
  const t1 = await target();
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await b.sleep(1000);
  const t2 = await target();
  await b.sleep(1000);
  const t3 = await target();
  record("phone: the move stick flies the camera and lets go cleanly", t1.z < t0.z - 3 && Math.abs(t3.z - t2.z) < 0.5, `${JSON.stringify(t0)} -> ${JSON.stringify(t1)} -> ${JSON.stringify(t3)}`);
}, { w: 390, h: 844, mobile: true });

const scenes = ["scenes", async (b) => {
  // A transition runs ~30 frames, animations settle later
  const snapshot = () => b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, stats: B.stats(), records: B.renderer.stats.records }; })()`);
  const rendered = (frames) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > 4000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const settled = () => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { if (B.stats().tweens === 0 || performance.now() - t0 > 3000) resolve(); else requestAnimationFrame(tick); }; tick(); })`);
  await rendered(2);
  const before = await snapshot();
  for (let i = 0; i < 2; i++) {
    await b.evaluate(`window.__ooga.go("lab")`);
    await rendered(40);
    await settled();
  }
  const after = await snapshot();
  const same = (key) => before.stats[key] === after.stats[key];
  record("scenes: go(lab) twice lands in the lab", before.scene === "lab" && after.scene === "lab", `${before.scene} -> ${after.scene}`);
  record("scenes: node, target, tween and DOM counts identical after re-entering", same("allNodes") && same("targets") && same("tweens") && same("dom"), `${JSON.stringify(before.stats)} -> ${JSON.stringify(after.stats)}`);
  record("scenes: GPU records identical after re-entering", Math.abs(after.records - before.records) <= 3, `${before.records} -> ${after.records}`);
  record("scenes: no error thrown during the transitions", !b.logs.some((l) => l.startsWith("[exception]")), b.logs.join(" | ").slice(0, 200));
}];

const hub = () => withPage("hub", hubPage(src), async (b) => {
  const rendered = (frames) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > 4000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const loaded = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, terrain: window.BL.scenes.hub.root.children.some((n) => n.geometry === B.island.geometry), mouths: B.mouths.length, leaveHidden: document.querySelector('[data-action="leave"]').hidden, startLevel: B.startLevel, level: B.level, lootEnabled: B.lootEnabled, lootCrates: B.crates.length, decorativeCrates: B.props.filter((o) => o.scenery && o.prop === "crate" && o.active).length, jetpackHidden: !!B.jetpack.stash, lootTabHidden: document.getElementById("loot-tab").hidden, worldLootHintHidden: document.getElementById("world-loot-hint").hidden }; })()`);
  const advanced = await rendered(3);
  record("hub: default scene starts with 1,000 bananas and loads clean", loaded.scene === "hub" && loaded.terrain && loaded.mouths === 7 && loaded.leaveHidden && loaded.startLevel === 1000 && loaded.level <= 1000 && loaded.level > 995 && advanced >= 3, JSON.stringify({ ...loaded, advanced }));
  const underside = await b.evaluate(`(() => { const I = window.__ooga.island, g = I.geometry, radii = [0, 15, 27, 29.5, 30], profile = radii.map((r) => I.undersideDepthAt(r)), colors = new Set(); let minY = Infinity, deepFaces = 0; for (let i = 1; i < g.verts.length; i += 3) minY = Math.min(minY, g.verts[i]); for (const face of g.faces) { if (!face.i.every((i) => g.verts[i * 3 + 1] < -8)) continue; deepFaces++; colors.add(face.color.join(",")); } return { depth: I.undersideDepth, radii, profile, minY, deepFaces, deepMaterials: colors.size }; })()`);
  record("hub terrain: the underside is a layered voxel bottom-third spherical cap instead of a flat slab", Math.abs(underside.depth - 30 / Math.SQRT2) < 1e-9 && underside.minY === -21.25 && Math.abs(underside.profile[0] - underside.depth) < 1e-9 && underside.profile.at(-1) === 0 && underside.profile.every((v, i, a) => i === 0 || v < a[i - 1]) && underside.profile[1] > 17 && underside.profile[2] > 6 && underside.profile[3] > 1 && underside.deepFaces > 0 && underside.deepMaterials === 3, JSON.stringify(underside));
  record("hub: donation loot and its panel stay hidden while decorative crates and the jetpack remain", !loaded.lootEnabled && loaded.lootCrates === 0 && loaded.decorativeCrates > 0 && loaded.jetpackHidden && loaded.lootTabHidden && loaded.worldLootHintHidden, JSON.stringify(loaded));
  const curtain = await b.evaluate(`({ drawn: window.__ooga.timing.drawn > 0, gone: !document.getElementById("curtain") })`);
  record("hub: the leaf curtain opens on the first drawn frame and leaves the DOM", curtain.drawn && curtain.gone, JSON.stringify(curtain));
  const signView = () => b.evaluate(`(() => { const B = window.__ooga, l = B.labels[0], m = B.mouths.find((m) => m.id === "c11"), s = l.world.map((p) => B.project(p.x, p.y, p.z)), cx = l.world.reduce((sum, p) => sum + p.x, 0) / 4, cy = l.world.reduce((sum, p) => sum + p.y, 0) / 4, cz = l.world.reduce((sum, p) => sum + p.z, 0) / 4; return { text: l.text, depthTested: l.node.parent !== null && l.node.geometry.faces.length > 100, world: l.world.flatMap((p) => [p.x, p.y, p.z]), attached: Math.hypot(cx - l.x, cy - l.y, cz - l.z) < 1e-9 && cy > m.floorY + 4, width: Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y), shear: (s[1].y - s[0].y) / Math.max(0.001, Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y)) }; })()`);
  const signBefore = await signView();
  await b.drag({ x: 400, y: 450 }, { x: 470, y: 450 });
  await rendered(1);
  const signAfter = await signView();
  record("hub: EntropyLab sign is depth-tested, fixed above its cave and follows perspective", signBefore.text === "EntropyLab" && signBefore.depthTested && signAfter.depthTested && signBefore.attached && signAfter.attached && signBefore.world.every((v, i) => v === signAfter.world[i]) && Math.abs(signAfter.width - signBefore.width) > 0.2 && Math.abs(signAfter.shear - signBefore.shear) > 0.001, JSON.stringify({ before: signBefore, after: signAfter }));
  const mouth = await b.evaluate(`(() => { const B = window.__ooga; const m = B.mouths.find((m) => m.id === "c11"); const p = B.project(m.x, 2, m.z); const hit = B.input.pick(p.x, p.y); return { x: Math.round(p.x), y: Math.round(p.y), kind: hit && hit.owner.kind, slot: hit && hit.owner.slot && hit.owner.slot.id }; })()`);
  await b.click(mouth.x, mouth.y);
  // The 0.45s dolly, then the 0.25s fade
  await b.sleep(1600);
  const entered = await b.evaluate(`({ scene: window.__ooga.scene, leaveShown: !document.querySelector('[data-action="leave"]').hidden })`);
  record("hub: tap the lab cave enters the lab", mouth.kind === "cave" && mouth.slot === "c11" && entered.scene === "lab" && entered.leaveShown, JSON.stringify({ ...mouth, ...entered }));
  await b.key("Escape");
  await b.sleep(900);
  const back = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { scene: B.scene, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), dist: +Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z).toFixed(1), leaveHidden: document.querySelector('[data-action="leave"]').hidden }; })()`);
  record("lab: Escape returns to the hub on the landing view", back.scene === "hub" && back.toPile < 0.5 && Math.abs(back.dist - 24) < 1 && back.leaveHidden, JSON.stringify(back));
  await b.key("p");
  await b.sleep(200);
  const level = await b.evaluate("window.__ooga.level");
  await b.evaluate(`window.__ooga.go("lab")`);
  await b.sleep(900);
  const carried = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, level: B.level, shown: B.shown }; })()`);
  record("pile level carries between scenes", carried.scene === "lab" && level >= 290 && Math.abs(carried.level - level) < 2 && carried.shown === Math.floor(carried.level), `${level} -> ${JSON.stringify(carried)}`);
  await b.evaluate(`document.querySelector('[data-action="leave"]').click()`);
  await b.sleep(900);
  const left = await b.evaluate(`({ scene: window.__ooga.scene, blurred: document.activeElement !== document.querySelector('[data-action="leave"]') })`);
  record("lab: Leave cave button returns to the hub", left.scene === "hub" && left.blurred, JSON.stringify(left));
});

const mirrorCave = ["mirror cave", async (b) => {
  const rendered = (frames, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga, start = B.renderedFrames, t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > ${ms}) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  // Redraws the current frame and reads patches ([cx, cy, w, h] in CSS px, y down) back from the drawing buffer; green is g > 96 && g > r + 40 && g > b + 40, a tip (bright leader) is r > 150 && g > 200 && b > 150
  const patches = `(rects) => { const B = window.__ooga, canvas = document.getElementById("scene"), gl = canvas.getContext("webgl2"), dpr = canvas.width / B.renderer.size.width; B.renderer.render(window.BL.scenes.hub.root, B.camera, B.renderOpts); return rects.map((rect) => { if (!rect) return null; const [cx, cy, w, h] = rect, x0 = Math.max(0, Math.round((cx - w / 2) * dpr)), y0 = Math.max(0, Math.round(canvas.height - (cy + h / 2) * dpr)), pw = Math.min(canvas.width - x0, Math.round(w * dpr)), ph = Math.min(canvas.height - y0, Math.round(h * dpr)); if (pw <= 0 || ph <= 0) return null; const px = new Uint8Array(pw * ph * 4); gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, px); const lum = []; let green = 0, tip = 0, tipSum = 0, sum = 0, fp = 2166136261; for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2], l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; sum += l; fp = Math.imul(fp ^ (r << 16 | g << 8 | b), 16777619); if (g > 96 && g > r + 40 && g > b + 40) { green++; lum.push(l); } if (r > 150 && g > 200 && b > 150) { tip++; tipSum += l; } } lum.sort((a, z) => a - z); const n = pw * ph, q = (k) => lum.length ? lum[Math.min(lum.length - 1, Math.floor(k * lum.length))] : 0; return { count: n, green: +(green / n).toFixed(4), tip: +(tip / n).toFixed(4), tipMean: +(tipSum / Math.max(1, tip)).toFixed(4), mean: +(sum / n).toFixed(4), greenMean: +(lum.reduce((a, l) => a + l, 0) / Math.max(1, lum.length)).toFixed(4), p10: +q(0.1).toFixed(3), p95: +q(0.95).toFixed(3), fingerprint: fp >>> 0 }; }); }`;
  // Mouth-local (across, up, along) to world in the cave's ry/cr/sr convention; +along points out of the cave
  const mouthWorld = `(lx, ly, lz) => { const m = window.__ooga.mirrorCave.mouth, cr = Math.cos(m.ry), sr = Math.sin(m.ry); return [m.x + sr * lz + cr * lx, m.floorY + ly, m.z + cr * lz - sr * lx]; }`;
  const patchAt = `(lx, ly, lz, w, h) => { const p = window.__ooga.project(...(${mouthWorld})(lx, ly, lz)); return p ? [p.x, p.y, w, h] : null; }`;
  const frameWait = `(count, done) => { const start = window.__ooga.renderedFrames, tick = () => window.__ooga.renderedFrames >= start + count ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }`;
  const caveTotals = `() => { const caves = window.__ooga.matrixCave.caves; return { active: caves.reduce((n, c) => n + c.activeGlyphCount, 0), rain: caves.reduce((n, c) => n + c.rain.activeGlyphCount, 0), capacity: caves.reduce((n, c) => n + c.capacity, 0), buffers: caves.map((c) => [c.capacity, c.bufferBytes, c.rain.capacity, c.rain.bufferBytes]).join("|"), versions: caves.map((c) => [c.updates, c.rain.updates, ...c.nodes.map((n) => n.instanceVersion), ...c.rain.nodes.map((n) => n.instanceVersion)]).join("|") }; }`;
  const residency = `() => { const B = window.__ooga, T = (${caveTotals})(); return { records: B.renderer.stats.records, shadowResources: B.renderer.stats.shadowResources, resources: B.mirror.resources, samples: B.mirror.samples, buffers: T.buffers, active: T.active, rain: T.rain, capacity: T.capacity }; }`;
  // The crew builds from a cached catalog during the block and GPU records come lazily (night-only critters included): make every catalog record resident so later record counts measure mirror and glyph work alone
  const prime = `(() => { const B = window.__ooga, S = window.BL.scene, scene = window.BL.scenes.hub, fixture = S.createNode(), geometries = new Set(), batched = new Set(); const collect = (node) => { if (node.geometry) { geometries.add(node.geometry); if (node.instanceData) batched.add(node.geometry); } for (const child of node.children) collect(child); }; collect(scene.root); scene.liveGeometry(geometries); for (const build of window.BL.models.buildableGeos) geometries.add(build()); for (const geometry of geometries) if (!batched.has(geometry) && !geometry.matrixGlyph && !geometry.matrixLocalGlyphSurface) S.addChild(fixture, S.createNode({ geometry })); B.renderer.render(fixture, B.camera, { ...B.renderOpts, matrix: null }); fixture.children.length = 0; })()`;
  const same = (a, z) => a.records === z.records && a.shadowResources === z.shadowResources && a.buffers === z.buffers;
  const descenders = await b.evaluate(`(() => { const glyphMin = (ch) => { const g = window.BL.hubModels.caveSign(ch); let min = Infinity; for (const face of g.faces) { if (face.emissive !== 0.2) continue; for (const i of face.i) min = Math.min(min, g.verts[i * 3 + 1]); } return min; }, baseline = glyphMin("o"), samples = ["g", "p", "q", "y", "j"].map((ch) => ({ ch, min: glyphMin(ch) })), board = window.BL.hubModels.caveSign("Ooga Booga Land"); return { baseline, samples, height: board.signHeight, contained: samples.every((sample) => sample.min > -board.signHeight * 0.5) }; })()`);
  record("cave signs: descenders extend below the lowercase baseline and remain inside the taller board", descenders.samples.every((sample) => sample.min < descenders.baseline - 0.05) && descenders.contained && descenders.height > 0.91, JSON.stringify(descenders));
  const approach = await b.evaluate(`(() => { const B = window.__ooga, m = B.mouths.find((mouth) => mouth.id === "c1"), ox = -Math.sin(m.ry), oz = -Math.cos(m.ry), px = oz, pz = -ox, stations = [0.5, 1, 1.5, 2, 2.5].map((distance) => { let sum = 0, count = 0; for (let lateral = -2; lateral <= 2.0001; lateral += 0.025) { const x = m.x - ox * distance + px * lateral, z = m.z - oz * distance + pz * lateral; if (B.island.isPath(x, z)) { sum += lateral; count++; } } return { distance, center: count ? sum / count : null, count }; }); return { stations, maxOffset: Math.max(...stations.map((station) => Math.abs(station.center))) }; })()`);
  record("mirror cave: only c1's path eases into a perpendicular final approach", approach.stations.every((station) => station.count > 0) && approach.maxOffset <= 0.15, JSON.stringify(approach));
  const primeAll = async () => { await b.evaluate(`(() => { ${prime}; window.__ooga.setHour(22, NaN, 80); })()`); await rendered(3); await b.evaluate(`window.__ooga.setHour(12, NaN, 80)`); await rendered(3); };
  await primeAll();
  const landing = await b.evaluate(`(${residency})()`);
  const mouth = await b.evaluate(`(() => { const B = window.__ooga, m = B.mouths.find((v) => v.id === "c1"), p = B.project(m.x, 2, m.z), hit = B.input.pick(p.x, p.y); return { x: p.x, y: p.y, kind: hit && hit.owner.kind, slot: hit && hit.owner.slot.id }; })()`);
  await b.mouse("mouseMoved", mouth.x, mouth.y, { button: "none" });
  await rendered(2);
  const tooltip = await b.evaluate(`document.getElementById("tooltip").textContent`);
  await b.click(mouth.x, mouth.y);
  await rendered(12);
  const sceneAfterClick = await b.evaluate(`window.__ooga.scene`);
  record("mirror cave: tooltip identifies the physical mirror without starting a scene transition", mouth.kind === "cave" && mouth.slot === "c1" && tooltip === "Ooga Booga Land · mirror" && sceneAfterClick === "hub", JSON.stringify({ mouth, tooltip, sceneAfterClick }));
  const reflected = await b.evaluate(`(() => { const B = window.__ooga, r = B.mirror, c = B.camera, center = Array.from(r.planeCenter), normal = Array.from(r.planeNormal), reflect = (p) => { const d = (p.x - center[0]) * normal[0] + (p.y - center[1]) * normal[1] + (p.z - center[2]) * normal[2]; return [p.x - 2 * d * normal[0], p.y - 2 * d * normal[1], p.z - 2 * d * normal[2]]; }, error = (a, z) => Math.max(...a.map((v, i) => Math.abs(v - z[i]))); return { active: r.active, eyeError: error(reflect(c.position), Array.from(r.cameraPosition)), targetError: error(reflect(c.target), Array.from(r.cameraTarget)), normalLength: Math.hypot(...normal) }; })()`);
  // Same eye as the approach view, turned around: the glass is behind the camera
  const glimpse = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, o = B.pilot.orbit, m = B.mirrorCave.mouth, wait = (${frameWait}), saved = { target: o.target, tx: o.tx, ty: o.ty, tz: o.tz, yaw: o.yaw, pitch: o.pitch, dist: o.dist }, pose = (p) => { o.target = p.target; o.tx = p.tx; o.ty = p.ty; o.tz = p.tz; o.yaw = o.tYaw = p.yaw; o.pitch = o.tPitch = p.pitch; o.dist = o.tDist = p.dist; B.pilot.update(0.1); }, seenStart = B.mirror.reflectionPassCount; wait(8, () => { const seen = B.mirror.reflectionPassCount - seenStart, cp = Math.cos(0.08), sr = Math.sin(m.ry), cr = Math.cos(m.ry), away = { x: m.x + sr * (0.5 + cp * 24), y: m.floorY + 1.5, z: m.z + cr * (0.5 + cp * 24) }; pose({ target: away, tx: away.x, ty: away.y, tz: away.z, yaw: m.ry + Math.PI, pitch: 0.08, dist: 12 }); const unseenStart = B.mirror.reflectionPassCount, skips = B.mirror.skippedPassCount; wait(3, () => { const unseen = B.mirror.reflectionPassCount - unseenStart, skipped = B.mirror.skippedPassCount - skips, reason = B.mirror.skipReason; pose(saved); wait(2, () => resolve({ seen, unseen, skipped, reason })); }); }); })`);
  record("mirror cave: the reflection mirrors the camera about the glass and runs only when the glass is seen", reflected.active && reflected.eyeError < 1e-4 && reflected.targetError < 1e-4 && Math.abs(reflected.normalLength - 1) < 1e-6 && glimpse.seen > 0 && glimpse.unseen === 0 && glimpse.skipped > 0, JSON.stringify({ ...reflected, ...glimpse }));
  const tier = (name) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; B.renderer.setQuality(${JSON.stringify(name)}); const startFrame = B.renderedFrames, shadows = B.renderer.stats.shadowPassCount, shadowResources = B.renderer.stats.shadowResources, t0 = performance.now(); const tick = () => { if (B.renderedFrames >= startFrame + 8 || performance.now() - t0 > 6000) resolve({ name: B.renderer.quality, width: B.mirror.width, height: B.mirror.height, viewport: [B.renderer.size.width, B.renderer.size.height], samples: B.mirror.samples, frames: B.renderedFrames - startFrame, shadows: B.renderer.stats.shadowPassCount - shadows, shadowResources: [shadowResources, B.renderer.stats.shadowResources] }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const aspect = (sample) => Math.abs(sample.width / sample.height - sample.viewport[0] / sample.viewport[1]);
  const tiers = [await tier("high"), await tier("medium"), await tier("low")];
  await b.evaluate(`window.__ooga.renderer.setQuality("high")`);
  await rendered(3);
  record("mirror cave: the reflection target is bounded per quality tier and adds no shadow pass", tiers.every((s, i) => s.name === ["high", "medium", "low"][i] && Math.max(s.width, s.height) <= [512, 384, 256][i] && aspect(s) < 0.01 && s.frames === 8 && s.shadows === 8 && s.shadowResources[0] === s.shadowResources[1]) && tiers[0].samples > tiers[1].samples && tiers[1].samples >= tiers[2].samples, JSON.stringify(tiers));
  await b.evaluate(`window.__ooga.matrixCave.viewApproach()`);
  await rendered(3);
  const outside = await b.evaluate(`(() => { const B = window.__ooga, W = B.matrixCave.world, T = (${caveTotals})(); return { radius: W.radius, active: W.active, drawn: B.matrixCave.drawnGlyphCount, activeGlyphs: B.matrixCave.activeGlyphCount, surfaceDrawn: B.mirror.surfaceDrawn, glass: (${patches})([(${patchAt})(0, 1.5, -1, 40, 40)])[0], updates: B.matrixCave.updates, versions: T.versions }; })()`);
  await rendered(30);
  const outsideLater = await b.evaluate(`(() => { const B = window.__ooga; return { updates: B.matrixCave.updates, versions: (${caveTotals})().versions }; })()`);
  record("mirror cave: outside the cave the world is normal and no glyph work runs", outside.radius === 0 && !outside.active && outside.drawn === 0 && outside.activeGlyphs === 0 && outside.surfaceDrawn && outside.glass && outside.glass.green < 0.02 && outsideLater.updates === outside.updates && outsideLater.versions === outside.versions, JSON.stringify({ radius: outside.radius, active: outside.active, drawn: outside.drawn, surfaceDrawn: outside.surfaceDrawn, glass: outside.glass, updates: [outside.updates, outsideLater.updates], idle: outsideLater.versions === outside.versions }));
  const wave = await b.evaluate(`new Promise((resolve, reject) => { const B = window.__ooga, W = B.matrixCave.world, caves = B.matrixCave.caves, totals = (${caveTotals}), minimum = Math.min(...caves.map((c) => c.minimumTravelDistance)), t0 = performance.now(); B.matrixCave.viewInside(false); const start = B.renderedFrames; let early = null, twenty = null; const tick = () => { if (performance.now() - t0 > 30000) return reject(new Error("Matrix wave did not finish expanding")); if (!early && (W.active || B.renderedFrames >= start + 3)) early = { frames: B.renderedFrames - start, active: W.active, radius: W.radius, pile: W.covered(0, 0), cave: W.covered(27, 0) }; if (!twenty && W.radius >= 20) twenty = { radius: W.radius, ...totals() }; if (twenty && W.radius === W.maxRadius) return resolve({ minimum, caves: caves.length, early, twenty, full: { radius: W.radius, maxRadius: W.maxRadius, perCave: caves.map((c) => [c.activeGlyphCount, c.rain.activeGlyphCount]) } }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("mirror cave: walking in starts one wave from the pile that reaches every cave", wave.early.active && wave.early.radius > 0 && wave.early.radius < 12 && wave.early.pile && !wave.early.cave && wave.minimum > 20 && wave.twenty.radius < wave.minimum && wave.twenty.active === 0 && wave.twenty.rain === 0 && wave.caves === 7 && wave.full.perCave.every((c) => c[0] > 0 && c[1] > 0), JSON.stringify({ minimum: wave.minimum, early: wave.early, twenty: { radius: wave.twenty.radius, active: wave.twenty.active, rain: wave.twenty.rain }, full: wave.full }));
  // From the back-wall view the floor and ceiling are seen at a grazing angle in the bottom and top bands, the left wall down the left edge: measure bands there rather than spots between glyph trains
  const inside = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, C = B.matrixCave, at = (${patchAt}), rects = [at(0, 0.05, -6.15, 480, 110), at(0, 2.9, -5, 480, 110), at(-2.3, 1.5, -5.2, 120, 360)], start = { inside: C.inside, visible: C.visible, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, passes: B.mirror.reflectionPassCount, updates: C.updates, counts: { ...C.activeSurfaceCounts } }; (${frameWait})(16, () => resolve({ ...start, passesAfter: B.mirror.reflectionPassCount, updatesAfter: C.updates, rects, viewport: [B.renderer.size.width, B.renderer.size.height], patches: (${patches})(rects), residency: (${residency})() })); })`);
  const [floor, ceiling, wall] = inside.patches;
  record("mirror cave: inside, the room is a live glyph interior and the doorway is open", inside.inside && inside.visible && inside.portal && !inside.surfaceDrawn && inside.passesAfter === inside.passes && inside.counts.floor > 0 && inside.counts.ceiling > 0 && inside.counts.wall > 0 && inside.updatesAfter > inside.updates && [floor, ceiling, wall].every((p) => p && p.green >= 0.15), JSON.stringify({ inside: inside.inside, visible: inside.visible, portal: inside.portal, surfaceDrawn: inside.surfaceDrawn, passes: [inside.passes, inside.passesAfter], updates: [inside.updates, inside.updatesAfter], counts: inside.counts, rects: inside.rects.map((r) => r && r.slice(0, 2).map(Math.round)), viewport: inside.viewport, floor, ceiling, wall }));
  // Leaders move between any two instants, so night and noon are sampled in alternating frame pairs and averaged; three-pixel glyph edges blend with the (moonlit) stone, so lighting independence is read from leader and glyph luminance, not pixel counts
  const band = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, W = B.matrixCave.world, P = (${patches}), rect = (${patchAt})(0, 1.75, -6.5, 320, 140), wait = (${frameWait}), frames = [], sample = () => { const time = W.sampleStream(0).time, s = P([rect])[0]; frames.push({ tick: Math.floor(time * 20), ...s }); const n = frames.length; if ((n >= 2 && frames[n - 2].tick === frames[n - 1].tick) || n >= 12) round(0); else requestAnimationFrame(sample); }, rounds = [], hours = (list) => ({ tip: +(list.reduce((a, s) => a + s.tip, 0) / list.length).toFixed(4), tipMean: +(list.reduce((a, s) => a + s.tipMean, 0) / list.length).toFixed(4), greenMean: +(list.reduce((a, s) => a + s.greenMean, 0) / list.length).toFixed(4), mean: +(list.reduce((a, s) => a + s.mean, 0) / list.length).toFixed(4) }), round = (i) => { if (i === 6) return resolve({ rect, pair: frames.slice(-2), night: hours(rounds.filter((_, k) => k % 2 === 0)), noon: hours(rounds.filter((_, k) => k % 2 === 1)) }); B.setHour(22, NaN, 80); wait(2, () => { rounds.push(P([rect])[0]); B.setHour(12, NaN, 80); wait(2, () => { rounds.push(P([rect])[0]); round(i + 1); }); }); }; requestAnimationFrame(sample); })`);
  const [bandA, bandB] = band.pair;
  record("mirror cave: glyphs have bright leaders, darker tails, and move every frame regardless of lighting", bandB.green >= 0.15 && bandB.tip >= 0.002 && bandB.p95 - bandB.p10 > 0.3 && bandA.tick === bandB.tick && bandA.fingerprint !== bandB.fingerprint && Math.abs(band.night.tipMean - band.noon.tipMean) <= 0.1 * Math.max(band.night.tipMean, band.noon.tipMean) && Math.abs(band.night.greenMean - band.noon.greenMean) <= 0.1 * Math.max(band.night.greenMean, band.noon.greenMean), JSON.stringify(band));
  await b.evaluate(`window.__ooga.matrixCave.viewInside(true)`);
  await rendered(3);
  const lookOut = await b.evaluate(`(() => { const B = window.__ooga, w = B.mirrorCave.node.world, node = B.project(w[12], w[13], w[14]), test = (lx, ly, lz) => B.matrixCave.overlayVisible(...(${mouthWorld})(lx, ly, lz)); return { node: node && [Math.round(node.x), Math.round(node.y)], viewport: [B.renderer.size.width, B.renderer.size.height], portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, doorway: node && (${patches})([[node.x, node.y, 60, 60]])[0], overlay: { doorway: test(0, 1.5, 3), left: test(-6, 1.5, 3), right: test(6, 1.5, 3), above: test(0, 4.2, 3) } }; })()`);
  record("mirror cave: looking out shows the world wrapped in code through the doorway", lookOut.node && lookOut.node[0] >= 0 && lookOut.node[0] <= lookOut.viewport[0] && lookOut.node[1] >= 0 && lookOut.node[1] <= lookOut.viewport[1] && lookOut.portal && !lookOut.surfaceDrawn && lookOut.doorway && lookOut.doorway.green > 0.3 && lookOut.doorway.mean > 0.05 && lookOut.overlay.doorway && !lookOut.overlay.left && !lookOut.overlay.right && !lookOut.overlay.above, JSON.stringify(lookOut));
  // A rock outside the doorway cone gets the camera turned in place toward it (target moved, eye kept), never a walk
  const glow = await b.evaluate(`(() => { const B = window.__ooga, o = B.pilot.orbit, c = B.camera, size = B.renderer.size, seen = (x, y, z) => { const p = B.project(x, y, z); return B.matrixCave.overlayVisible(x, y, z) && p && p.x >= 30 && p.x <= size.width - 30 && p.y >= 30 && p.y <= size.height - 30 ? p : null; }, rocks = B.props.filter((p) => p.prop === "rock").map((p) => ({ x: p.x, y: p.node.position.y + 0.3, z: p.z })); let rock = rocks.find((r) => seen(r.x, r.y, r.z)), aimed = false; if (!rock) { aimed = true; rock = rocks.reduce((best, r) => Math.hypot(r.x - c.position.x, r.z - c.position.z) < Math.hypot(best.x - c.position.x, best.z - c.position.z) ? r : best); const dx = c.position.x - rock.x, dy = c.position.y - rock.y, dz = c.position.z - rock.z, dist = Math.hypot(dx, dy, dz); o.target = { x: rock.x, y: rock.y, z: rock.z }; o.tx = rock.x; o.ty = rock.y; o.tz = rock.z; o.yaw = o.tYaw = Math.atan2(dx, dz); o.pitch = o.tPitch = Math.asin(dy / dist); o.dist = o.tDist = dist; B.pilot.update(0.1); B.renderer.render(window.BL.scenes.hub.root, c, B.renderOpts); } const cave = [...B.cavemen.values()].find((v) => v.state === "working" && !v.walk && !v.build && seen(v.root.position.x, v.root.position.y + 0.9, v.root.position.z)), rockAt = seen(rock.x, rock.y, rock.z), caveAt = cave && seen(cave.root.position.x, cave.root.position.y + 0.9, cave.root.position.z), [living, stone] = (${patches})([caveAt && [caveAt.x, caveAt.y, 40, 40], rockAt && [rockAt.x, rockAt.y, 40, 40]]); return { aimed, caveman: cave && cave.traits.name, living, stone, inside: B.matrixCave.inside, radius: B.matrixCave.world.radius }; })()`);
  record("mirror cave: living things glow through the wave, stone does not", glow.inside && glow.living && glow.stone && glow.living.tip > 0 && glow.living.tip >= 2 * glow.stone.tip && glow.living.mean > 1.2 * glow.stone.mean, JSON.stringify(glow));
  // The exit is a step through the doorway (eye one unit outside the glass, half a unit above its centre, looking at it); the glass is then read from the approach distance, where every tier's target still resolves the wave
  const cycle = (name) => b.evaluate(`new Promise((resolve, reject) => { const B = window.__ooga, W = B.matrixCave.world, C = B.matrixCave, caves = C.caves, totals = (${caveTotals}), P = (${patches}), t0 = performance.now(); B.renderer.setQuality(${JSON.stringify(name)}); (${frameWait})(3, () => { const full = (${residency})(), minimum = Math.min(...caves.map((c) => c.minimumTravelDistance)), passes = B.mirror.reflectionPassCount, m = B.mirrorCave.mouth, o = B.pilot.orbit, sr = Math.sin(m.ry), cr = Math.cos(m.ry), glass = { x: m.x + sr * 0.5, y: m.floorY + 1.5, z: m.z + cr * 0.5 }; o.target = glass; o.tx = glass.x; o.ty = glass.y; o.tz = glass.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = Math.atan2(0.5, 1); o.dist = o.tDist = Math.hypot(1, 0.5); B.pilot.update(0.1); const crossed = B.renderedFrames; let first = null, glass2 = null, quiet = null, reentry = null; const tick = () => { if (performance.now() - t0 > 30000) return reject(new Error("The walk-out cycle stalled")); if (!first) { if (B.renderedFrames === crossed) return requestAnimationFrame(tick); first = { frames: B.renderedFrames - crossed, along: +((B.camera.position.x - m.x) * sr + (B.camera.position.z - m.z) * cr).toFixed(3), portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, captureValid: B.mirror.captureValid, passes: B.mirror.reflectionPassCount - passes, near: B.camera.near, direction: W.direction, radius: W.radius }; C.viewApproach(); return requestAnimationFrame(tick); } if (!glass2) { if (B.renderedFrames < crossed + 3) return requestAnimationFrame(tick); const w = B.mirrorCave.node.world, p = B.project(w[12], w[13], w[14]); glass2 = { radius: W.radius, ...(p ? P([[p.x, p.y, 300, 180]])[0] : {}) }; return requestAnimationFrame(tick); } if (!quiet) { if (W.radius >= minimum) return requestAnimationFrame(tick); quiet = { radius: W.radius, minimum, ...totals(), portal: B.mirror.portal }; C.viewInside(false); reentry = { radius: W.radius, portal: B.mirror.portal, direction: W.direction, frame: B.renderedFrames }; return requestAnimationFrame(tick); } if (B.renderedFrames < reentry.frame + 3) return requestAnimationFrame(tick); resolve({ name: ${JSON.stringify(name)}, full, first, glass: glass2, quiet, reentry, resumed: { radius: W.radius, portal: B.mirror.portal, direction: W.direction } }); }; requestAnimationFrame(tick); }); })`);
  const cycles = [];
  for (const name of ["high", "medium", "low"]) { cycles.push(await cycle(name)); await matrixSettled(b); }
  await b.evaluate(`window.__ooga.renderer.setQuality("high")`);
  await rendered(3);
  record("mirror cave: walking out closes the door, restores the reflection and retracts the wave; walking back in resumes it", cycles.every((c) => c.first.frames === 1 && !c.first.portal && c.first.surfaceDrawn && c.first.captureValid && c.first.passes === 1 && c.first.near === 0.1 && c.first.direction === -1 && c.glass.radius > 20 && c.glass.green > { high: 0.15, medium: 0.05, low: 0.01 }[c.name] && c.quiet.radius < c.quiet.minimum && c.quiet.active === 0 && c.quiet.rain === 0 && !c.quiet.portal && c.reentry.radius > 0 && c.resumed.portal && c.resumed.direction === 1 && c.resumed.radius >= c.reentry.radius), JSON.stringify(cycles.map((c) => ({ name: c.name, first: c.first, glass: c.glass, quiet: { radius: c.quiet.radius, minimum: c.quiet.minimum, active: c.quiet.active, rain: c.quiet.rain, portal: c.quiet.portal }, reentry: c.reentry.radius, resumed: c.resumed }))));
  // Eating debits fractional supply before the pile floors it for display, so a sub-banana reserve keeps every measured frame at exactly one million
  await b.evaluate(`(() => { const B = window.__ooga; B.renderer.setQuality("high"); B.setPileLevel(1000000.5); B.matrixCave.viewInside(false); })()`);
  await matrixSettled(b);
  const perf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, startFrame = B.renderedFrames, start = performance.now(); let minimumShown = B.shown, maximumShown = B.shown; const tick = () => { minimumShown = Math.min(minimumShown, B.shown); maximumShown = Math.max(maximumShown, B.shown); if (B.level < 1000000.25) B.setPileLevel(1000000.5); const frames = B.renderedFrames - startFrame, seconds = (performance.now() - start) / 1000; if (frames >= 120 || seconds > 6) resolve({ fps: +(frames / seconds).toFixed(1), frames, minimumShown, maximumShown, active: B.matrixCave.activeGlyphCount, radius: B.matrixCave.world.radius, quality: B.renderer.quality }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("mirror cave: full surface code and the million-banana pile remain at least 50 FPS", perf.fps >= 50 && perf.frames >= 120 && perf.minimumShown === 1000000 && perf.maximumShown === 1000000 && perf.quality === "high", JSON.stringify(perf));
  await b.evaluate(`(() => { const B = window.__ooga; B.setPileLevel(1000); B.matrixCave.viewApproach(); })()`);
  await matrixSettled(b, false);
  const retracted = await b.evaluate(`(() => { const B = window.__ooga; return { radius: B.matrixCave.world.radius, active: B.matrixCave.world.active, ...(${residency})(), versions: (${caveTotals})().versions }; })()`);
  await rendered(30);
  const retractedLater = await b.evaluate(`(() => { const B = window.__ooga; return { drawn: B.matrixCave.drawnGlyphCount, versions: (${caveTotals})().versions }; })()`);
  const beforeResize = await b.evaluate(`({ allocations: window.__ooga.mirror.allocationCount })`);
  await b.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await rendered(8);
  await b.send("Emulation.clearDeviceMetricsOverride");
  await rendered(8);
  const resized = await b.evaluate(`(() => { const B = window.__ooga; return { allocations: B.mirror.allocationCount, ...(${residency})() }; })()`);
  const tierResidency = cycles.map((c) => c.full);
  record("mirror cave: GPU records, capacities and buffers are fixed across tiers, resize, cycles and idle", same(landing, inside.residency) && tierResidency.every((t) => same(landing, t) && t.resources === (t.samples > 0 ? 6 : 4) && t.active <= t.capacity) && tierResidency[0].active > tierResidency[1].active && tierResidency[1].active > tierResidency[2].active && same(landing, retracted) && retracted.radius === 0 && !retracted.active && retractedLater.versions === retracted.versions && retractedLater.drawn === 0 && same(landing, resized) && resized.resources === 6 && resized.allocations > beforeResize.allocations, JSON.stringify({ landing, inside: inside.residency, tiers: tierResidency.map((t) => ({ records: t.records, resources: t.resources, samples: t.samples, active: t.active, rain: t.rain, capacity: t.capacity, buffers: t.buffers === landing.buffers })), retracted: { records: retracted.records, radius: retracted.radius, active: retracted.active, idle: retractedLater.versions === retracted.versions, drawn: retractedLater.drawn }, resized: { records: resized.records, resources: resized.resources, allocations: [beforeResize.allocations, resized.allocations], buffers: resized.buffers === landing.buffers } }));
  const travel = (id) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga, t0 = performance.now(); let enteredAt = 0; B.go(${JSON.stringify(id)}); const tick = () => { if (!enteredAt && B.scene === ${JSON.stringify(id)}) enteredAt = B.renderedFrames; if (enteredAt && B.renderedFrames >= enteredAt + 25) resolve(true); else if (performance.now() - t0 > 6000) resolve(false); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const reachedLab = await travel("lab");
  const labResources = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, active: B.mirror.active, resources: B.mirror.resources }; })()`);
  const reachedHub = await travel("hub");
  await primeAll();
  const hubResources = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, mirrorActive: B.mirror.active, entranceLights: B.entranceLights.length, radius: B.matrixCave.world.radius, rainIdle: B.matrixCave.caves.every((c) => c.rain.activeGlyphCount === 0), ...(${residency})() }; })()`);
  const restored = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, before = { resources: B.mirror.resources, records: B.renderer.stats.records, allocations: B.mirror.allocationCount }, gl = document.getElementById("scene").getContext("webgl2"), ext = gl.getExtension("WEBGL_lose_context"), t0 = performance.now(), sample = () => ({ before, after: { resources: B.mirror.resources, allocations: B.mirror.allocationCount, width: B.mirror.width, height: B.mirror.height } }); ext.loseContext(); setTimeout(() => ext.restoreContext(), 150); const tick = () => { if ((B.mirror.active && B.mirror.resources === before.resources && B.mirror.allocationCount > before.allocations && B.mirror.reflectionPassCount > 0) || performance.now() - t0 > 6000) resolve(sample()); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  await primeAll();
  restored.after.records = await b.evaluate(`window.__ooga.renderer.stats.records`);
  record("mirror cave: scene cycling and context restoration release and recreate a fixed resource set", reachedLab && labResources.scene === "lab" && !labResources.active && labResources.resources === 0 && reachedHub && hubResources.scene === "hub" && hubResources.mirrorActive && hubResources.resources === 6 && hubResources.entranceLights === 9 && hubResources.records === landing.records && hubResources.buffers === landing.buffers && hubResources.radius === 0 && hubResources.rainIdle && restored.before.resources === 6 && restored.after.resources === 6 && restored.after.allocations > restored.before.allocations && restored.after.records === restored.before.records && Math.max(restored.after.width, restored.after.height) <= 512, JSON.stringify({ lab: labResources, hub: { ...hubResources, buffers: hubResources.buffers === landing.buffers }, restored }));
  const lights = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, sample = () => ({ fixtures: B.entranceLights.map((l) => ({ id: l.id, caveId: l.caveId, kind: l.kind, side: l.side, registered: l.registered, worldPosition: [...l.worldPosition], factor: l.factor, lit: l.lit, selected: l.selected, approximated: l.approximated })), active: B.lighting.activeFullLightCount, approximated: B.lighting.approximatedLightCount, selected: B.lighting.selectedIds.slice(0, B.lighting.selectedCount), lightData: Array.from(B.renderOpts.lights.slice(0, B.renderOpts.lightCount * 8)), tier: B.renderer.quality }), wait = (${frameWait}), setView = (id) => { const m = B.mouths.find((v) => v.id === id), o = B.pilot.orbit, target = { x: m.x, y: m.floorY + 1.5, z: m.z }; o.target = target; o.tx = target.x; o.ty = target.y; o.tz = target.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = 0.15; o.dist = o.tDist = 6; B.pilot.update(0.1); }; B.renderer.setQuality("high"); B.setHour(12, NaN, 80); wait(3, () => { const day = sample(); B.setHour(18.08, NaN, 80); wait(3, () => { const dusk = sample(); B.setHour(22, NaN, 80); setView("c11"); wait(3, () => { const entropy = sample(); setView("c1"); wait(3, () => { const ooga = sample(); B.renderer.setQuality("medium"); wait(3, () => { const medium = sample(); B.renderer.setQuality("low"); wait(3, () => { const low = sample(); B.renderer.setQuality("high"); B.setHour(12, NaN, 80); wait(3, () => resolve({ day, dusk, entropy, ooga, medium, low })); }); }); }); }); }); }); })`);
  const layout = ["c11", "c9", "c1"].map((id) => { const fixtures = lights.day.fixtures.filter((l) => l.caveId === id), torches = fixtures.filter((l) => l.kind === "torch"); return fixtures.length === 3 && torches.length === 2 && torches[0].side !== torches[1].side && fixtures.filter((l) => l.kind === "lantern").length === 1 && fixtures.every((l) => l.registered); });
  const equivalent = (sample) => ["torch:left", "torch:right", "lantern:right"].every((key) => { const [kind, side] = key.split(":"), a = sample.fixtures.find((l) => l.caveId === "c11" && l.kind === kind && l.side === side), z = sample.fixtures.find((l) => l.caveId === "c1" && l.kind === kind && l.side === side); return a && z && Math.abs(a.factor - z.factor) < 1e-8 && a.lit === z.lit; });
  const onShader = (sample) => sample.active === 10 && sample.approximated === 0 && sample.fixtures.every((l) => l.selected && !l.approximated && Array.from({ length: sample.lightData.length / 8 }, (_, i) => i * 8).some((i) => Math.max(Math.abs(sample.lightData[i] - l.worldPosition[0]), Math.abs(sample.lightData[i + 1] - l.worldPosition[1]), Math.abs(sample.lightData[i + 2] - l.worldPosition[2])) < 1e-5));
  record("entrance lights: nine fixtures in symmetric pairs fade identically with the day and reach the shader on every tier", lights.day.fixtures.length === 9 && layout.every(Boolean) && lights.day.fixtures.every((l) => l.factor === 0 && !l.lit) && lights.dusk.fixtures.some((l) => l.factor > 0 && l.factor < 1) && [lights.day, lights.dusk, lights.entropy].every(equivalent) && [lights.entropy, lights.ooga, lights.medium, lights.low].every(onShader) && lights.ooga.tier === "high" && lights.medium.tier === "medium" && lights.low.tier === "low" && lights.entropy.selected.join("|") === lights.ooga.selected.join("|") && lights.entropy.lightData.length === lights.ooga.lightData.length && lights.entropy.lightData.every((v, i) => v === lights.ooga.lightData[i]), JSON.stringify({ layout, day: lights.day.fixtures.map((l) => l.factor), dusk: lights.dusk.fixtures.map((l) => +l.factor.toFixed(3)), night: ["entropy", "ooga", "medium", "low"].map((k) => [k, lights[k].tier, lights[k].active, lights[k].approximated, lights[k].fixtures.filter((l) => l.selected).length]), selected: lights.entropy.selected }));
}];

const mirrorCanvas = () => withPage("mirror canvas fallback", hubPage(src, "canvas2d=1&bananas=1000000&hour=22"), async (b) => {
  const rendered = (frames, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga, start = B.renderedFrames, t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > ${ms}) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  // Redraws the current frame and reads patches ([cx, cy, w, h] in CSS px, y down) back from a readback copy of the 2D canvas (the scene context is not marked for frequent reads, so reading it directly warns); green is g > 96 && g > r + 40 && g > b + 40
  const patches = `(rects) => { const B = window.__ooga, canvas = document.getElementById("scene"), copy = document.createElement("canvas"), dpr = canvas.width / B.renderer.size.width; B.renderer.render(window.BL.scenes.hub.root, B.camera, B.renderOpts); copy.width = canvas.width; copy.height = canvas.height; const ctx = copy.getContext("2d", { willReadFrequently: true }); ctx.drawImage(canvas, 0, 0); return rects.map((rect) => { if (!rect) return null; const [cx, cy, w, h] = rect, x0 = Math.max(0, Math.round((cx - w / 2) * dpr)), y0 = Math.max(0, Math.round((cy - h / 2) * dpr)), pw = Math.min(canvas.width - x0, Math.round(w * dpr)), ph = Math.min(canvas.height - y0, Math.round(h * dpr)); if (pw <= 0 || ph <= 0) return null; const px = ctx.getImageData(x0, y0, pw, ph).data; let green = 0; for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2]; if (g > 96 && g > r + 40 && g > b + 40) green++; } const n = pw * ph; return { count: n, green: +(green / n).toFixed(4) }; }); }`;
  // Mouth-local (across, up, along) to world in the cave's ry/cr/sr convention; +along points out of the cave
  const mouthWorld = `(lx, ly, lz) => { const m = window.__ooga.mirrorCave.mouth, cr = Math.cos(m.ry), sr = Math.sin(m.ry); return [m.x + sr * lz + cr * lx, m.floorY + ly, m.z + cr * lz - sr * lx]; }`;
  const patchAt = `(lx, ly, lz, w, h) => { const p = window.__ooga.project(...(${mouthWorld})(lx, ly, lz)); return p ? [p.x, p.y, w, h] : null; }`;
  const frameWait = `(count, done) => { const start = window.__ooga.renderedFrames, tick = () => window.__ooga.renderedFrames >= start + count ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }`;
  const caveTotals = `() => { const caves = window.__ooga.matrixCave.caves; return { active: caves.reduce((n, c) => n + c.activeGlyphCount, 0), rain: caves.reduce((n, c) => n + c.rain.activeGlyphCount, 0), versions: caves.map((c) => [c.updates, c.rain.updates, ...c.nodes.map((n) => n.instanceVersion), ...c.rain.nodes.map((n) => n.instanceVersion)]).join("|") }; }`;
  const world = await b.evaluate(`(() => { const B = window.__ooga; return { kind: B.renderer.kind, active: B.mirror.active, surfaceDrawn: B.mirror.surfaceDrawn, mirrorResources: B.renderer.stats.mirrorResources, path: { active: B.path.active, visibleInstanceCount: B.path.visibleInstanceCount }, scenery: { visibleCount: B.scenery.visibleCount } }; })()`);
  record("mirror canvas fallback: a faux mirror draws with no reflection resources and the world is complete", world.kind === "canvas2d" && world.active && world.surfaceDrawn && world.mirrorResources === 0 && world.path.active && world.path.visibleInstanceCount > 0 && world.scenery.visibleCount > 0, JSON.stringify(world));
  const lights = await b.evaluate(`(() => { const B = window.__ooga; return { fixtures: B.entranceLights.map((l) => [l.id, l.lit, +l.factor.toFixed(3)]), lightCount: B.renderOpts.lightCount, tier: B.lighting.tier }; })()`);
  record("entrance lights: Canvas fallback draws all emissive fixtures without point-light resources", lights.fixtures.length === 9 && lights.fixtures.every((l) => l[1] && l[2] > 0.9) && lights.lightCount === 0 && lights.tier === "canvas2d", JSON.stringify(lights));
  await b.evaluate(`window.__ooga.matrixCave.viewApproach()`);
  await rendered(3);
  const outside = await b.evaluate(`({ drawn: window.__ooga.matrixCave.drawnGlyphCount, radius: window.__ooga.matrixCave.world.radius })`);
  await b.evaluate(`window.__ooga.matrixCave.viewInside(false)`);
  await matrixSettled(b);
  // From the back-wall view the floor and ceiling are seen at a grazing angle in the bottom and top bands, the left wall down the left edge
  const inside = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, C = B.matrixCave, cave = C.caves.find((c) => c.id === "c1"), at = (${patchAt}), rects = [at(0, 0.05, -6.15, 480, 110), at(0, 2.9, -5, 480, 110), at(-2.3, 1.5, -5.2, 120, 360)], versions = () => cave.nodes.map((n) => n.instanceVersion).join(","), start = { inside: C.inside, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, counts: { ...C.activeSurfaceCounts }, updates: C.updates, versions: versions() }; (${frameWait})(10, () => resolve({ ...start, updatesAfter: C.updates, versionsAfter: versions(), advanced: start.versions.split(",").every((v, i) => +versions().split(",")[i] > +v), patches: (${patches})(rects) })); })`);
  const [floor, ceiling, wall] = inside.patches;
  await b.evaluate(`window.__ooga.matrixCave.viewInside(true)`);
  await rendered(3);
  const lookOut = await b.evaluate(`(() => { const B = window.__ooga, w = B.mirrorCave.node.world, node = B.project(w[12], w[13], w[14]); return { node: node && [Math.round(node.x), Math.round(node.y)], doorway: node && (${patches})([[node.x, node.y, 60, 60]])[0] }; })()`);
  // The Canvas fallback draws one of the eight glyph density ranks, so its code is sparse
  record("mirror canvas fallback: walking in gives a live glyph room and the doorway shows the world wrapped in code", outside.drawn === 0 && inside.inside && inside.portal && !inside.surfaceDrawn && inside.counts.floor > 0 && inside.counts.ceiling > 0 && inside.counts.wall > 0 && inside.updatesAfter > inside.updates && inside.advanced && [floor, ceiling, wall].every((p) => p && p.green >= 0.008) && lookOut.doorway && lookOut.doorway.green > 0.1, JSON.stringify({ outside, inside: { inside: inside.inside, portal: inside.portal, surfaceDrawn: inside.surfaceDrawn, counts: inside.counts, updates: [inside.updates, inside.updatesAfter], versions: [inside.versions, inside.versionsAfter] }, floor, ceiling, wall, lookOut }));
  const wave = await b.evaluate(`(() => { const B = window.__ooga, W = B.matrixCave.world, stats = B.renderer.stats; return { radius: W.radius, maxRadius: W.maxRadius, matrixSurfaces: stats.matrixSurfaces, matrixLivingSurfaces: stats.matrixLivingSurfaces, pile: W.covered(0, 0), cave: W.covered(27, 0) }; })()`);
  record("mirror canvas fallback: the wave wraps the island and keeps living silhouettes", wave.radius === wave.maxRadius && wave.matrixSurfaces > 0 && wave.matrixLivingSurfaces > 0 && wave.pile && wave.cave, JSON.stringify(wave));
  // The exit is a step through the doorway: eye one unit outside the glass, half a unit above its centre, looking at it
  await b.evaluate(`(() => { const B = window.__ooga, m = B.mirrorCave.mouth, o = B.pilot.orbit, sr = Math.sin(m.ry), cr = Math.cos(m.ry), glass = { x: m.x + sr * 0.5, y: m.floorY + 1.5, z: m.z + cr * 0.5 }; o.target = glass; o.tx = glass.x; o.ty = glass.y; o.tz = glass.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = Math.atan2(0.5, 1); o.dist = o.tDist = Math.hypot(1, 0.5); B.pilot.update(0.1); })()`);
  await rendered(1);
  const stepped = await b.evaluate(`({ portal: window.__ooga.mirror.portal, surfaceDrawn: window.__ooga.mirror.surfaceDrawn, direction: window.__ooga.matrixCave.world.direction })`);
  await b.evaluate(`window.__ooga.matrixCave.viewApproach()`);
  await matrixSettled(b, false);
  const quiet = await b.evaluate(`(() => { const B = window.__ooga, T = (${caveTotals})(); return { radius: B.matrixCave.world.radius, active: B.matrixCave.world.active, glyphs: B.matrixCave.caves.map((c) => [c.activeGlyphCount, c.rain.activeGlyphCount]), versions: T.versions }; })()`);
  await rendered(30);
  const quietLater = await b.evaluate(`(${caveTotals})().versions`);
  record("mirror canvas fallback: walking out closes the door and retracts the wave without leftover work", !stepped.portal && stepped.surfaceDrawn && stepped.direction === -1 && quiet.radius === 0 && !quiet.active && quiet.glyphs.every((c) => c[0] === 0 && c[1] === 0) && quietLater === quiet.versions, JSON.stringify({ stepped, radius: quiet.radius, active: quiet.active, glyphs: quiet.glyphs, idle: quietLater === quiet.versions }));
  await b.evaluate(`window.__ooga.matrixCave.viewInside(false)`);
  await matrixSettled(b);
  const budget = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, stamps = [], samples = [], t0 = performance.now(); let frame = B.renderedFrames; const tick = () => { if (B.renderedFrames !== frame) { frame = B.renderedFrames; stamps.push(performance.now()); samples.push(B.renderer.stats.matrixSamples); } if (stamps.length >= 24 || performance.now() - t0 > 20000) { let sum = 0; for (let i = 1; i < stamps.length; i++) sum += stamps[i] - stamps[i - 1]; resolve({ frames: stamps.length, meanInterval: +(sum / Math.max(1, stamps.length - 1)).toFixed(1), maxSamples: Math.max(...samples), minSamples: Math.min(...samples), radius: B.matrixCave.world.radius }); } else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("mirror canvas fallback: a full-wave frame stays under the fallback budget", budget.frames === 24 && budget.meanInterval <= 500 && budget.maxSamples <= 524288 && budget.minSamples > 0, `${budget.meanInterval} ms mean between frames · ${JSON.stringify(budget)}`);
});

const matrixNavigation = (backend) => withPage(`cave camera ${backend}`, hubPage(src, backend === "canvas2d" ? "canvas2d=1" : ""), async (b) => {
  const label = `cave camera ${backend}`;
  // Puts the eye at mouth-local (across, up, along) looking into the cave, with +along pointing out of it; the pilot's swept clamp runs inside update, so the sample is read straight after it
  const pose = `(opening, x, y, z) => { const B = window.__ooga, o = B.pilot.orbit, m = opening.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), wx = m.x + cr * x + sr * z, wz = m.z - sr * x + cr * z, target = { x: wx - sr * 3.5, y: m.floorY + y, z: wz - cr * 3.5 }; o.target = target; o.tx = target.x; o.ty = target.y; o.tz = target.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = 0; o.dist = o.tDist = 3.5; B.pilot.update(0.1); const p = B.camera.position, space = { caveIndex: 0, floor: 0, ceiling: 0 }; B.island.cavityAt(p.x, p.z, space); return { requested: [x, y, z], actual: [cr * (p.x - m.x) - sr * (p.z - m.z), p.y - m.floorY, sr * (p.x - m.x) + cr * (p.z - m.z)], id: B.cameraCave.id, index: B.cameraCave.index, contains: B.cameraCave.contains(p.x, p.y, p.z), inside: B.matrixCave.inside, pitch: o.pitch, near: B.camera.near, ceiling: Number.isFinite(space.ceiling) ? space.ceiling : null }; }`;
  // One opening's full itinerary from the Mirror approach, ending outside its doorway; nothing renders in between, so the wave radius holds
  const itinerary = `(index, active) => { const B = window.__ooga, C = B.matrixCave, pose = (${pose}), opening = B.cameraCave.openings[index], m = opening.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), rejectedBefore = C.portal.rejected.above; C.viewApproach(); const invalid = []; for (const [name, x, y] of [["above", 0, opening.maxY + 1], ["below", 0, opening.minY - 10], ["beside-left", opening.minX - 1, 1.5], ["beside-right", opening.maxX + 1, 1.5]]) { pose(opening, x, y, 0.9); invalid.push({ name, ...pose(opening, x, y, 0.1) }); pose(opening, 0, 12, 1.2); } const roofY = B.island.surfaceAt(m.x - sr * 3.5, m.z - cr * 3.5) - m.floorY + 2; pose(opening, 0, roofY, 0.9); const roof = [pose(opening, 0, roofY, -1), pose(opening, 0, roofY, -3.5)]; pose(opening, 0, 12, 0.9); const route = []; for (const z of [0.9, 0.6, 0.5, 0.4, 0.1, -0.5, -1.5, -3.5, -5]) route.push(pose(opening, 0, 0.8, z)); const ceiling = pose(opening, 0, 12, -3.5); pose(opening, 0, 0.8, -3.5); const wall = pose(opening, 6, 0.8, -3.5); pose(opening, 0, 0.8, -0.5); const exits = [pose(opening, 0, 12, 0.9)]; pose(opening, 0, 0.8, -0.5); exits.push(pose(opening, 6, 0.8, 0.9)); pose(opening, 0, 0.8, -3.5); for (const z of [-2, -0.5, 0.4, 0.5, 0.6, 0.9, 3]) route.push(pose(opening, 0, 0.8, z)); const lateral = []; for (const x of [-2.048, -1.674, 1.674, 2.048]) { pose(opening, x, 0.8, 0.9); for (const z of [0.6, 0.4, 0.1, -0.5, 0.4, 0.6]) lateral.push(pose(opening, x, 0.8, z)); } return { id: opening.id, active, radius: C.world.radius, maxRadius: C.world.maxRadius, invalid, roof, route, ceiling, wall, exits, lateral, rejectedAbove: [rejectedBefore, C.portal.rejected.above] }; }`;
  const before = await b.evaluate(`({ openings: window.__ooga.cameraCave.openings.length, records: window.__ooga.renderer.stats.records })`);
  const cases = [];
  for (const active of [false, true]) for (let i = 0; i < before.openings; i++) {
    // Each opening starts from a clean Mirror Cave entry; the resting pass leaves again at once so the wave stays down, the full pass waits for it to reach the rim
    await b.evaluate(`(() => { const C = window.__ooga.matrixCave; C.viewInside(false); ${active ? "" : "C.viewApproach();"} })()`);
    await matrixSettled(b, active);
    cases.push(await b.evaluate(`(${itinerary})(${i}, ${active})`));
  }
  // Relocating between debug views is not a physical flight: leave the last doorway upward so the way back to the approach crosses no low aperture
  await b.evaluate(`(() => { const B = window.__ooga, openings = B.cameraCave.openings; (${pose})(openings[openings.length - 1], 0, 12, 1.2); B.matrixCave.viewApproach(); })()`);
  await matrixSettled(b, false);
  const final = await b.evaluate(`({ index: window.__ooga.cameraCave.index, records: window.__ooga.renderer.stats.records, radius: window.__ooga.matrixCave.world.radius, active: window.__ooga.matrixCave.world.active })`);
  const near = (p) => Math.abs(p.actual[1] - 0.8) < 0.001 && Math.abs(p.actual[2] - p.requested[2]) < 0.001;
  // The short near plane holds through the whole low entrance apron (along <= 3) and is restored to 0.5 above the roof, so only the far pose at z = 3 is free of it
  const close = (p) => p.near > 0 && p.near < 0.3;
  const admitted = (c, p) => p.requested[2] < 0.5 ? p.id === c.id && p.contains && near(p) && Math.abs(p.pitch) < 1e-5 && close(p) && p.inside === (c.id === "c1") : p.requested[2] > 0.5 ? p.index === 0 && (p.requested[2] >= 1 || close(p)) : near(p);
  const brief = (p) => ({ ...p, actual: p.actual.map((v) => +v.toFixed(3)) });
  const failing = (test) => cases.flatMap((c) => test(c).filter((p) => p).map((p) => ({ id: c.id, active: c.active, ...brief(p) }))).slice(0, 6);
  const routeFailures = failing((c) => [...c.route.map((p) => admitted(c, p) ? null : p), ...c.lateral.map((p) => admitted(c, p) && Math.abs(p.actual[0] - p.requested[0]) < 0.001 ? null : p), c.ceiling.id === c.id && c.ceiling.contains && c.ceiling.ceiling !== null && c.ceiling.actual[1] <= c.ceiling.ceiling - 0.2999 ? null : c.ceiling, c.wall.id === c.id && c.wall.contains && c.wall.actual[0] < 5.5 && Math.abs(c.wall.actual[1] - 0.8) < 0.001 ? null : c.wall]);
  record(`${label}: valid routes into and out of all seven caves are admitted at low height with a close near plane`, before.openings === 7 && cases.length === 14 && cases.every((c) => !c.active || c.radius === c.maxRadius) && routeFailures.length === 0, JSON.stringify({ openings: before.openings, cases: cases.map((c) => [c.id, c.active, c.radius]), failing: routeFailures }));
  const crossingFailures = failing((c) => [...c.invalid.map((p) => p.index === 0 && !p.contains && !p.inside ? null : p), ...c.roof.map((p) => p.index === 0 && !p.contains && !p.inside && p.actual[1] >= p.requested[1] - 0.0001 && p.near === 0.5 ? null : p), ...c.exits.map((p) => p.id === c.id && p.contains && p.actual[2] <= 0.5001 && p.actual[1] <= 2.7001 ? null : p)]);
  const rejected = cases.filter((c) => c.id === "c1").map((c) => c.rejectedAbove);
  record(`${label}: crossings above, below and beside a cave never admit the camera, high and side exits stop inside, and the scene is restored`, crossingFailures.length === 0 && rejected.length === 2 && rejected.every((r) => r[1] > r[0]) && final.index === 0 && final.records === before.records && final.radius === 0 && !final.active, JSON.stringify({ failing: crossingFailures, rejectedAbove: rejected, records: [before.records, final.records], final }));
});

// The built file must run both scenes
const hubDist = () => withPage("hub dist", hubPage(dist), async (b) => {
  const loaded = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, mouths: B.mouths.length }; })()`);
  record("dist: lands on the hub", loaded.scene === "hub" && loaded.mouths === 7, JSON.stringify(loaded));
  const mouth = await b.evaluate(`(() => { const B = window.__ooga; const m = B.mouths.find((m) => m.id === "c11"); const p = B.project(m.x, 2, m.z); const hit = B.input.pick(p.x, p.y); return { x: Math.round(p.x), y: Math.round(p.y), kind: hit && hit.owner.kind }; })()`);
  await b.click(mouth.x, mouth.y);
  await b.sleep(1600);
  const scene = await b.evaluate("window.__ooga.scene");
  record("dist: tap the lab cave enters the lab", mouth.kind === "cave" && scene === "lab", JSON.stringify({ ...mouth, scene }));
  // The built file stands in for the source suite only here: the lab must keep drawing with its crew and pile live
  const lab = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, start = B.renderedFrames, t0 = performance.now(), tick = () => B.renderedFrames >= start + 30 || performance.now() - t0 > 4000 ? resolve({ frames: B.renderedFrames - start, crew: B.cavemen.size, shown: B.shown, quality: document.getElementById("quality").textContent }) : requestAnimationFrame(tick); requestAnimationFrame(tick); })`);
  record("dist: the lab keeps rendering with its crew and pile live", lab.frames >= 30 && lab.crew === 7 && lab.shown > 0 && lab.quality.startsWith("webgl2"), JSON.stringify(lab));
});

// A prototype key in ?scene= falls through to the hub
const hubRoute = () => withPage("hub route", hubPage(src, "scene=toString"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, mouths: B.mouths.length, help: [...document.querySelectorAll(".panel .help[data-scene]")].map((p) => p.dataset.scene + ":" + p.hidden).join(",") }; })()`);
  record("hub: unknown ?scene= lands on the hub with the hub help text", r.scene === "hub" && r.mouths === 7 && r.help === "hub:false", JSON.stringify(r));
});

const pileParameter = () => withPage("pile parameter", hubPage(src, "bananas=12345&b=37"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga, expectedRadius = window.BL.pile.visualFootprintFor(12345, 0.45), stats = B.stats(); return { startLevel: B.startLevel, level: B.level, shown: B.shown, radius: B.altar.radius, expectedRadius, testBananas: B.testBananas, outstanding: stats.deliveries + stats.pendingDrops, at: performance.now() }; })()`);
  record("debug bananas parameter sets the starting pile", r.startLevel === 12345 && r.level <= 12345 && r.level > 12340 && r.shown === Math.floor(r.level) && Math.abs(r.radius - r.expectedRadius) < 0.001, JSON.stringify(r));
  await b.key("b");
  const added = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); return { level: B.level, shown: B.shown, testBananas: B.testBananas, outstanding: stats.deliveries + stats.pendingDrops }; })()`);
  record("debug b parameter sets the bananas streamed per B press", added.testBananas === 37 && added.level <= r.level && added.outstanding - r.outstanding === 37, JSON.stringify({ before: r, queued: added }));
  await b.sleep(2300);
  const landed = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); return { level: B.level, shown: B.shown, outstanding: stats.deliveries + stats.pendingDrops, landed: stats.dropsLanded, at: performance.now() }; })()`);
  const eaten = await b.evaluate(eatenBetween(r.at, landed.at));
  record("debug b parameter credits all bananas as they land", landed.outstanding === 0 && landed.landed === 37 && landed.level - r.level > 37 - eaten && landed.level - r.level <= 37 && landed.shown === Math.floor(landed.level), JSON.stringify({ before: r, after: landed, eaten }));
  const capped = await b.evaluate(`(() => { const B = window.__ooga, max = window.BL.pile.MAX_BANANAS; B.setPileLevel(max * 5); return { max, level: B.level, shown: B.shown }; })()`);
  await b.key("b");
  const atCap = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); return { level: B.level, outstanding: stats.deliveries + stats.pendingDrops }; })()`);
  record("the pile caps at ten million bananas and queues nothing beyond it", capped.max === 10000000 && capped.level === capped.max && capped.shown === capped.max && atCap.level <= capped.max && atCap.outstanding === 0, JSON.stringify({ capped, atCap }));
});
const pileCapParameter = () => withPage("pile cap parameter", hubPage(src, "bananas=50000000"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga; return { startLevel: B.startLevel, max: window.BL.pile.MAX_BANANAS, level: B.level }; })()`);
  record("debug bananas parameter stops at the cap", r.startLevel === r.max && r.level <= r.max, JSON.stringify(r));
});

const weightedDelivery = () => withPage("weighted banana delivery", hubPage(src, "bananas=1000"), async (b) => {
  await b.evaluate(`[...window.__ooga.cavemen.values()].forEach((c) => { c.nextBuildAt = 1e9; })`);
  const measured = await b.evaluate(`(async () => {
    const B = window.__ooga, P = window.BL.pile, capacity = P.BACKLOG_VISUAL_CAPACITY;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const snapshot = () => { const D = B.delivery; return { outstanding: D.logicalOutstandingValue, pending: D.pendingLogicalValue, pendingDrops: D.pendingVisualDropCount, airborne: D.airborneVisualDropCount, airborneValue: D.airborneLogicalValue, min: D.minDropWeight, max: D.maxDropWeight, started: D.visualDropsStarted, landed: D.visualDropsLanded, canceled: D.visualDropsCanceled, acceptedValue: D.totalAcceptedValue, landedValue: D.totalLandedValue, active: D.activeTime, remaining: D.estimatedActiveTimeRemaining, replans: D.replanCount, maxConcurrent: D.maxConcurrentDrops, lastDrain: D.lastDrainSeconds }; };
    const run = async (logicalValue) => {
      B.setPileLevel(1000);
      await frame();
      await frame();
      const base = { nodes: B.stats().allNodes, records: B.renderer.stats.records, level: B.level, altar: B.altar.platformRadius, path: B.path.quantizedRadius, scenery: B.scenery.visibilityReflowCount };
      const accepted = B.delivery.enqueue(logicalValue), plan = snapshot();
      for (let i = 0; i < 4; i++) await frame();
      const beforeLanding = { ...snapshot(), level: B.level, shown: B.shown, altar: B.altar.platformRadius, path: B.path.quantizedRadius, scenery: B.scenery.visibilityReflowCount };
      let maxConcurrent = 0, previousStarted = B.delivery.visualDropsStarted, previousTime = B.delivery.activeTime, maxLaunchRate = 0;
      while (B.delivery.logicalOutstandingValue && B.delivery.activeTime - plan.active <= P.BACKLOG_SECONDS + 0.2) {
        await frame();
        maxConcurrent = Math.max(maxConcurrent, B.delivery.airborneVisualDropCount);
        const span = B.delivery.activeTime - previousTime;
        if (span >= 1) {
          maxLaunchRate = Math.max(maxLaunchRate, (B.delivery.visualDropsStarted - previousStarted) / span);
          previousStarted = B.delivery.visualDropsStarted;
          previousTime = B.delivery.activeTime;
        }
      }
      const done = { ...snapshot(), nodes: B.stats().allNodes, records: B.renderer.stats.records, level: B.level, shown: B.shown };
      return { logicalValue, accepted, base, plan, beforeLanding, done, maxConcurrent, maxLaunchRate: +maxLaunchRate.toFixed(2) };
    };
    const one = await run(capacity), ten = await run(capacity * 10), hundred = await run(capacity * 100);
    B.setPileLevel(1000);
    B.delivery.enqueue(capacity * 10 + 1);
    const remainder = snapshot();
    B.setPileLevel(1000);
    B.delivery.enqueue(capacity * 2);
    while (B.delivery.airborneVisualDropCount < 12) await frame();
    const airborne = B.drops.map((drop, index) => drop.moving ? [index, drop.token, drop.bananaValue] : null).filter(Boolean);
    const beforeSecond = snapshot();
    B.delivery.enqueue(capacity * 7 + 1);
    const immutable = airborne.every(([index, token, value]) => B.drops[index].token === token && B.drops[index].bananaValue === value);
    const secondStart = B.delivery.activeTime;
    while (B.delivery.logicalOutstandingValue && B.delivery.activeTime - secondStart <= P.BACKLOG_SECONDS + 0.2) await frame();
    const backToBack = { beforeSecond, after: snapshot(), immutable, activeSinceSecond: B.delivery.lastDrainSeconds, exact: B.delivery.totalAcceptedValue === capacity * 9 + 1 && B.delivery.totalLandedValue === capacity * 9 + 1 && B.delivery.logicalOutstandingValue === 0 };
    return { capacity, pool: P.DROP_POOL_SIZE, rate: P.DROP_RATE, duration: P.DROP_DURATION_MAX, one, ten, hundred, remainder, backToBack };
  })()`);
  const rows = [measured.one, measured.ten, measured.hundred];
  record("weighted delivery: capacity is derived from the unchanged pool, cadence, and worst fall", measured.capacity === 608 && measured.pool === 96 && measured.rate === 72 && measured.duration === 1.35, JSON.stringify({ capacity: measured.capacity, pool: measured.pool, rate: measured.rate, duration: measured.duration }));
  record("weighted delivery: capacity-sized donations remain one visual banana per banana", measured.one.plan.pendingDrops === measured.capacity && measured.one.plan.min === 1 && measured.one.plan.max === 1, JSON.stringify(measured.one.plan));
  record("weighted delivery: 1x, 10x, and 100x use the same bounded visual-drop count", rows.every((row) => row.done.started === measured.capacity && row.done.landed === measured.capacity && row.done.canceled === 0), JSON.stringify(rows.map((row) => ({ logical: row.logicalValue, drops: row.done.landed, weights: [row.plan.min, row.plan.max] }))));
  record("weighted delivery: weights are even and exact at 1x, 10x, and 100x", rows.every((row, i) => row.plan.min === 10 ** i && row.plan.max === 10 ** i && row.done.acceptedValue === row.logicalValue && row.done.landedValue === row.logicalValue && row.done.outstanding === 0), JSON.stringify(rows.map((row) => ({ logical: row.logicalValue, accepted: row.done.acceptedValue, landed: row.done.landedValue, weights: [row.plan.min, row.plan.max] }))));
  record("weighted delivery: every representative backlog lands within ten active seconds", rows.every((row) => row.done.lastDrain <= 10.1), JSON.stringify(rows.map((row) => ({ logical: row.logicalValue, activeSeconds: +row.done.lastDrain.toFixed(3) }))));
  record("weighted delivery: concurrency, launch cadence, nodes, and GPU records stay bounded", rows.every((row) => row.maxConcurrent <= measured.pool && row.maxLaunchRate <= measured.rate + 1 && row.done.nodes === row.base.nodes && row.done.records === row.base.records), JSON.stringify(rows.map((row) => ({ logical: row.logicalValue, concurrent: row.maxConcurrent, launchesPerSecond: row.maxLaunchRate, nodes: [row.base.nodes, row.done.nodes], records: [row.base.records, row.done.records] }))));
  record("weighted delivery: queued and airborne value causes no pile-dependent growth before landing", rows.every((row) => row.beforeLanding.landedValue === 0 && row.beforeLanding.level <= row.base.level && row.beforeLanding.altar <= row.base.altar && row.beforeLanding.path === row.base.path && row.beforeLanding.scenery === row.base.scenery), JSON.stringify(rows.map((row) => ({ logical: row.logicalValue, base: row.base, beforeLanding: row.beforeLanding }))));
  record("weighted delivery: uneven remainders use deterministic adjacent integer weights", measured.remainder.pendingDrops === measured.capacity && measured.remainder.min === 10 && measured.remainder.max === 11 && measured.remainder.outstanding === measured.capacity * 10 + 1, JSON.stringify(measured.remainder));
  record("weighted delivery: back-to-back donations preserve airborne weights and replan only pending value", measured.backToBack.immutable && measured.backToBack.after.replans > measured.backToBack.beforeSecond.replans && measured.backToBack.exact && measured.backToBack.activeSinceSecond <= 10.1, JSON.stringify(measured.backToBack));

  const transition = await b.evaluate(`(async () => { const B = window.__ooga, P = window.BL.pile, frame = () => new Promise((resolve) => requestAnimationFrame(resolve)); B.setPileLevel(1000); const accepted = B.delivery.enqueue(P.BACKLOG_VISUAL_CAPACITY * 10 + 1), initial = { level: B.level, accepted: B.delivery.totalAcceptedValue }; B.go("lab"); while (B.scene !== "lab") await frame(); const swapped = { level: B.level, accepted: B.delivery.totalAcceptedValue, landed: B.delivery.totalLandedValue, outstanding: B.delivery.logicalOutstandingValue, canceled: B.delivery.visualDropsCanceled }; const start = B.delivery.activeTime; while (B.delivery.logicalOutstandingValue && B.delivery.activeTime - start <= P.BACKLOG_SECONDS + 0.2) await frame(); return { accepted, initial, swapped, done: { level: B.level, accepted: B.delivery.totalAcceptedValue, landed: B.delivery.totalLandedValue, outstanding: B.delivery.logicalOutstandingValue, started: B.delivery.visualDropsStarted, visualLanded: B.delivery.visualDropsLanded, canceled: B.delivery.visualDropsCanceled, drain: B.delivery.lastDrainSeconds } }; })()`);
  record("weighted delivery: scene transitions neither credit early nor lose or duplicate value", transition.swapped.landed === 0 && transition.swapped.outstanding === transition.accepted && transition.swapped.level <= transition.initial.level && transition.done.accepted === transition.accepted && transition.done.landed === transition.accepted && transition.done.outstanding === 0 && transition.done.started === transition.done.visualLanded + transition.done.canceled && transition.done.drain <= 10.1, JSON.stringify(transition));

  await b.evaluate(`(() => { const B = window.__ooga, capacity = window.BL.pile.BACKLOG_VISUAL_CAPACITY; B.setPileLevel(1000); B.delivery.enqueue(capacity * 10); })()`);
  await b.sleep(150);
  const pausedBefore = await b.evaluate(`({ active: window.__ooga.delivery.activeTime, remaining: window.__ooga.delivery.estimatedActiveTimeRemaining })`);
  await b.focus(false);
  await b.send("Page.setWebLifecycleState", { state: "frozen" });
  await b.sleep(700);
  await b.send("Page.setWebLifecycleState", { state: "active" });
  await b.focus(true);
  await b.send("Page.bringToFront");
  await b.sleep(150);
  const pausedAfter = await b.evaluate(`({ active: window.__ooga.delivery.activeTime, remaining: window.__ooga.delivery.estimatedActiveTimeRemaining })`);
  record("weighted delivery: background pause time does not consume the active drain horizon", pausedAfter.active - pausedBefore.active < 0.3 && pausedBefore.remaining - pausedAfter.remaining < 0.3, JSON.stringify({ before: pausedBefore, after: pausedAfter, wallPause: 0.7 }));

});

const weightedDeliveryCanvas = () => withPage("weighted banana delivery canvas", hubPage(src, "canvas2d=1&bananas=1000"), async (b) => {
  const result = await b.evaluate(`(async () => { const B = window.__ooga, P = window.BL.pile, frame = () => new Promise((resolve) => requestAnimationFrame(resolve)), logical = P.BACKLOG_VISUAL_CAPACITY * 10, start = B.delivery.activeTime; B.delivery.enqueue(logical); const plan = { drops: B.delivery.pendingVisualDropCount, min: B.delivery.minDropWeight, max: B.delivery.maxDropWeight }; while (B.delivery.logicalOutstandingValue && B.delivery.activeTime - start <= P.BACKLOG_SECONDS + 0.2) await frame(); return { kind: B.renderer.kind, logical, plan, landed: B.delivery.totalLandedValue, outstanding: B.delivery.logicalOutstandingValue, drops: B.delivery.visualDropsLanded, drain: B.delivery.lastDrainSeconds, concurrent: B.delivery.maxConcurrentDrops }; })()`);
  record("weighted delivery: Canvas fallback drains the same bounded exact weighted plan", result.kind === "canvas2d" && result.plan.drops === result.drops && result.plan.min === 10 && result.plan.max === 10 && result.landed === result.logical && result.outstanding === 0 && result.drain <= 10.1 && result.concurrent <= 96, JSON.stringify(result));
});

const dynamicPaths = () => withPage("dynamic paths", hubPage(src, "bananas=1000&b=100"), async (b) => {
  // Keep unrelated timed crew builds from changing active geometry mid-cycle.
  await b.evaluate(`[...window.__ooga.cavemen.values()].forEach((c) => { c.nextBuildAt = 1e9; })`);
  const result = await b.evaluate(`(async () => { const B = window.__ooga, unit = B.island.pathUnit, size = 496, origin = -31, total = size * size, beforeMouths = JSON.stringify(B.mouths.map((m) => [m.id, m.x, m.z, m.ry])); const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); const analyze = (level) => { B.setPileLevel(level); const p = B.path, mask = new Uint8Array(total), seen = new Uint8Array(total), queue = new Int32Array(total); let count = 0, violations = 0, minTileRadius = Infinity, ringCells = 0, head = 0, tail = 0; for (let gx = 0; gx < size; gx++) for (let gz = 0; gz < size; gz++) { const x = (gx + 0.5) * unit + origin, z = (gz + 0.5) * unit + origin, i = gx * size + gz; if (!B.island.isPath(x, z)) continue; mask[i] = 1; count++; const inner = Math.hypot(Math.max(0, Math.abs(x) - unit / 2), Math.max(0, Math.abs(z) - unit / 2)); minTileRadius = Math.min(minTileRadius, inner); if (inner < p.ringInnerRadius - 1e-8) violations++; const r = Math.hypot(x, z); if (r >= p.ringInnerRadius && r < p.ringOuterRadius) { seen[i] = 1; queue[tail++] = i; ringCells++; } } while (head < tail) { const i = queue[head++], gx = Math.floor(i / size); for (const next of [i - size, i + size, i - 1, i + 1]) { if (next < 0 || next >= total || !mask[next] || seen[next] || (Math.abs(next - i) !== size && Math.floor(next / size) !== gx)) continue; seen[next] = 1; queue[tail++] = next; } } const targets = [...B.mouths.map((m) => ({ id: m.id, x: m.x, z: m.z })), { id: "gate", x: B.island.gate.x, z: B.island.gate.z }, { id: "south", x: 0, z: 28 }]; const joins = targets.map((target) => { let distance = Infinity; for (let gx = 0; gx < size; gx++) for (let gz = 0; gz < size; gz++) { const i = gx * size + gz; if (seen[i]) distance = Math.min(distance, Math.hypot((gx + 0.5) * unit + origin - target.x, (gz + 0.5) * unit + origin - target.z)); } return { id: target.id, distance }; }); const m = B.mouths.find((mouth) => mouth.id === "c1"), ox = -Math.sin(m.ry), oz = -Math.cos(m.ry), px = oz, pz = -ox, stations = [0.5, 1, 1.5, 2, 2.5].map((distance) => { let sum = 0, hits = 0; for (let lateral = -2; lateral <= 2.0001; lateral += 0.025) { const x = m.x - ox * distance + px * lateral, z = m.z - oz * distance + pz * lateral; if (B.island.isPath(x, z)) { sum += lateral; hits++; } } return { center: hits ? sum / hits : null, hits }; }); return { level, platform: B.altar.platformRadius, requested: p.requestedInnerRadius, inner: p.ringInnerRadius, center: p.ringCenterRadius, outer: p.ringOuterRadius, quantized: p.quantizedRadius, count: p.visibleInstanceCount, capacity: p.bufferCapacity, reflows: p.reflowCount, active: p.active, violations, minTileRadius, ringCells, connected: tail, joins, c1Hits: stations.every((s) => s.hits > 0), c1Offset: Math.max(...stations.map((s) => Math.abs(s.center))) }; }; const samples = [analyze(1000), analyze(10000), analyze(1000000)]; await frame(); return { samples, endpointsStable: beforeMouths === JSON.stringify(B.mouths.map((m) => [m.id, m.x, m.z, m.ry])) }; })()`);
  const samples = result.samples;
  record("dynamic path: ring grows monotonically at 1K, 10K and 1M bananas", samples.every((s, i) => !i || s.platform > samples[i - 1].platform && s.inner > samples[i - 1].inner) && samples.every((s) => s.active), JSON.stringify(samples.map(({ level, platform, inner, center, outer }) => ({ level, platform, inner, center, outer }))));
  record("dynamic path: quantized inner edge stays at least 0.125 beyond the platform", samples.every((s) => s.inner + 1e-8 >= s.platform + 0.125 && Math.abs(s.inner / 0.125 - Math.round(s.inner / 0.125)) < 1e-8 && s.center === s.inner + 0.75 && s.outer === s.center + 0.75), JSON.stringify(samples.map(({ level, platform, requested, inner, quantized }) => ({ level, platform, requested, inner, quantized }))));
  record("dynamic path: no visible or isPath tile crosses the ring inner edge", samples.every((s) => s.violations === 0 && s.minTileRadius + 1e-8 >= s.inner && s.count > 0 && s.count === s.connected && s.count <= s.capacity && s.ringCells > 0), JSON.stringify(samples.map(({ level, count, connected, violations, minTileRadius, inner }) => ({ level, count, connected, violations, minTileRadius, inner }))));
  record("dynamic path: every cave, gate and southern trail remains joined to the ring", samples.every((s) => s.joins.every((join) => join.distance < 2.75)), JSON.stringify(samples.map((s) => ({ level: s.level, joins: s.joins }))));
  record("dynamic path: cave endpoints stay fixed and c1 keeps its perpendicular approach", result.endpointsStable && samples.every((s) => s.c1Hits && s.c1Offset <= 0.15), JSON.stringify({ endpointsStable: result.endpointsStable, c1: samples.map((s) => ({ level: s.level, offset: s.c1Offset })) }));

  const stability = await b.evaluate(`(() => { const B = window.__ooga, unit = B.island.pathUnit, size = 496, origin = -31, total = size * size; const snapshot = (level) => { B.setPileLevel(level); const p = { ...B.path }, data = B.island.path.instanceData, cells = new Map(), rendered = new Uint8Array(total); let minSpokeInner = Infinity; for (let n = 0; n < p.visibleInstanceCount; n++) { const o = n * 20, x = data[o + 12], y = data[o + 13], z = data[o + 14], gx = Math.floor((x - origin) / unit), gz = Math.floor((z - origin) / unit), i = gx * size + gz, inner = Math.hypot(Math.max(0, Math.abs(x) - unit / 2), Math.max(0, Math.abs(z) - unit / 2)); rendered[i] = 1; if (inner >= p.ringOuterRadius - 1e-8) { cells.set(i, x + ":" + y + ":" + z); minSpokeInner = Math.min(minSpokeInner, inner); } } let maskExact = true; for (let gx = 0; gx < size && maskExact; gx++) for (let gz = 0; gz < size; gz++) { const i = gx * size + gz, x = (gx + 0.5) * unit + origin, z = (gz + 0.5) * unit + origin; if (!!rendered[i] !== B.island.isPath(x, z)) { maskExact = false; break; } } return { level, p, cells, maskExact, minSpokeInner }; }; const sameSubset = (smaller, larger) => { for (const [i, transform] of larger.cells) if (smaller.cells.get(i) !== transform) return false; return true; }; const sameSet = (a, b) => a.cells.size === b.cells.size && sameSubset(a, b); const small = snapshot(1000), medium = snapshot(10000), large = snapshot(1000000), restored = snapshot(1000); const summary = (s) => ({ level: s.level, master: s.p.masterSpokeCellCount, visible: s.p.visibleSpokeCellCount, clipped: s.p.clippedSpokeCellCount, ring: s.p.ringCellCount, total: s.p.visibleInstanceCount, hash: s.p.masterMaskHash, builds: s.p.masterMaskBuildCount }); return { rows: [small, medium, large].map(summary), masterStable: [small, medium, large, restored].every((s) => s.p.masterMaskBuildCount === 1 && s.p.masterSpokeCellCount === small.p.masterSpokeCellCount && s.p.masterMaskHash === small.p.masterMaskHash), monotonicExact: sameSubset(small, medium) && sameSubset(medium, large), restoredExact: sameSet(small, restored), masksExact: [small, medium, large, restored].every((s) => s.maskExact && s.p.visibleSpokeCellCount + s.p.ringCellCount === s.p.visibleInstanceCount && s.p.clippedSpokeCellCount + s.p.visibleSpokeCellCount === s.p.masterSpokeCellCount && s.minSpokeInner + 1e-8 >= s.p.ringOuterRadius) }; })()`);
  record("dynamic path: the deterministic master spoke mask is built exactly once", stability.masterStable && stability.rows[0].master > 0, JSON.stringify(stability.rows));
  record("dynamic path: growth only clips immutable spoke cells and transforms", stability.monotonicExact && stability.rows[0].visible > stability.rows[1].visible && stability.rows[1].visible > stability.rows[2].visible, JSON.stringify(stability.rows));
  record("dynamic path: shrinking restores the identical spoke cells and transforms", stability.restoredExact, JSON.stringify(stability.rows));
  record("dynamic path: rendered instances, isPath and radial clipping stay synchronized", stability.masksExact, JSON.stringify(stability.rows));

  const scenery = await b.evaluate(`(() => { const B = window.__ooga, kinds = ["flower", "bush", "tree", "crate", "barrel", "rock"], candidates = B.props.filter((o) => o.scenery), transforms = new Map(candidates.map((o) => [o, [o.x, o.z, o.node.position.y, o.node.rotation.y]])); const sample = (level) => { B.setPileLevel(level); const active = candidates.filter((o) => o.active), byKind = Object.fromEntries(kinds.map((kind) => [kind, active.filter((o) => o.prop === kind).length])); let radiusViolations = 0, pathViolations = 0; for (const o of active) { if (Math.hypot(o.x, o.z) - o.footprint < B.scenery.clearanceRadius - 1e-8) radiusViolations++; if (B.island.path.overlaps(o.x, o.z, o.footprint)) pathViolations++; } return { level, debug: { ...B.scenery }, byKind, radiusViolations, pathViolations, targets: B.input.targetCount, active }; }; const small = sample(1000), medium = sample(10000), large = sample(1000000), crossed = candidates.find((o) => small.active.includes(o) && !o.active), hidden = crossed && { active: crossed.active, visible: crossed.node.visible, transform: transforms.get(crossed) }; sample(1000); const restored = crossed && { active: crossed.active, visible: crossed.node.visible, sameTransform: transforms.get(crossed).every((v, i) => v === [crossed.x, crossed.z, crossed.node.position.y, crossed.node.rotation.y][i]), targets: B.input.targetCount }; B.jetpack.forceHost(crossed); const oldHost = crossed; const forcedTargets = B.input.targetCount; const rehoused = sample(1000000), host = B.jetpack.stash, pickup = B.jetpack.pickup, jetSafe = host ? host !== oldHost && host.active : !!pickup && Math.hypot(pickup.x, pickup.z) - 1 >= B.scenery.clearanceRadius - 1e-8 && !B.island.path.overlaps(pickup.x, pickup.z, 1); const signature = candidates.map((o) => [o.prop, o.x, o.z, o.node.rotation.y].join(":" )).join("|"); return { small: { ...small, active: undefined }, medium: { ...medium, active: undefined }, large: { ...large, active: undefined }, rehoused: { ...rehoused, active: undefined }, hidden, restored, forcedTargets, jetSafe, oldHostActive: oldHost.active, newHost: host && { prop: host.prop, active: host.active }, pickup: !!pickup, candidateCount: candidates.length, signature }; })()`);
  record("dynamic scenery: representative meadow props return outside the 1K ring", scenery.candidateCount === 219 && Object.values(scenery.small.byKind).every((count) => count > 0) && scenery.small.debug.visibleCount > 0, JSON.stringify({ candidates: scenery.candidateCount, visible: scenery.small.debug.visibleCount, kinds: scenery.small.byKind }));
  record("dynamic scenery: visible footprints clear the ring and path at 1K, 10K and 1M", [scenery.small, scenery.medium, scenery.large].every((s) => s.radiusViolations === 0 && s.pathViolations === 0 && s.debug.visibleCount + s.debug.radiusCulledCount + s.debug.pathCulledCount + s.debug.fixedCulledCount === s.debug.candidateCount), JSON.stringify({ small: scenery.small, medium: scenery.medium, large: scenery.large }));
  record("dynamic scenery: growth hides and unregisters crossed props, then shrink restores them exactly once", scenery.hidden && !scenery.hidden.active && !scenery.hidden.visible && scenery.large.targets < scenery.small.targets && scenery.restored.active && scenery.restored.visible && scenery.restored.sameTransform && scenery.restored.targets === scenery.small.targets && scenery.forcedTargets === scenery.small.targets, JSON.stringify({ hidden: scenery.hidden, restored: scenery.restored, targets: [scenery.small.targets, scenery.large.targets, scenery.restored.targets] }));
  record("dynamic scenery: an unsafe jetpack host is deterministically replaced by a safe one", !scenery.oldHostActive && scenery.jetSafe && (!!scenery.newHost || scenery.pickup), JSON.stringify({ oldHostActive: scenery.oldHostActive, newHost: scenery.newHost, pickup: scenery.pickup, safe: scenery.jetSafe }));

  const cycles = await b.evaluate(`new Promise(async (resolve) => { const B = window.__ooga, rows = []; for (const level of [1000, 10000, 1000000, 1000, 1000000, 10000, 1000]) { B.setPileLevel(level); await new Promise((next) => requestAnimationFrame(() => requestAnimationFrame(next))); B.housekeep(); rows.push({ level, records: B.renderer.stats.records, active: B.renderer.stats.active, targets: B.input.targetCount, pathCount: B.path.visibleInstanceCount, sceneryVisible: B.scenery.visibleCount, candidates: B.scenery.candidateCount, pathReflows: B.path.reflowCount, sceneryReflows: B.scenery.visibilityReflowCount }); } resolve(rows); })`);
  const stableCycle = (row, i) => { const first = cycles.findIndex((other) => other.level === row.level); return i === first || row.targets === cycles[first].targets && row.sceneryVisible === cycles[first].sceneryVisible && row.candidates === cycles[first].candidates; };
  // Drawn records may differ by the snack a chewing caveman shows for part of each bite; resident records may not
  record("dynamic path and scenery: repeated growth and shrink keep targets and GPU resources bounded", cycles.every((row, i) => row.records === cycles[0].records && Math.abs(row.active - cycles[0].active) <= 1 && row.pathCount <= samples[0].capacity && stableCycle(row, i)) && cycles.at(-1).pathReflows >= cycles[0].pathReflows + cycles.length - 1 && cycles.at(-1).sceneryReflows >= cycles[0].sceneryReflows + cycles.length - 1, JSON.stringify(cycles));

  await b.evaluate(`window.__ooga.setPileLevel(1000)`);
  const airborneBefore = await b.evaluate(`({ level: window.__ooga.level, inner: window.__ooga.path.ringInnerRadius, reflows: window.__ooga.path.reflowCount, sceneryReflows: window.__ooga.scenery.visibilityReflowCount })`);
  await b.key("b");
  const airborne = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); return { level: B.level, inner: B.path.ringInnerRadius, reflows: B.path.reflowCount, sceneryReflows: B.scenery.visibilityReflowCount, outstanding: stats.deliveries + stats.pendingDrops }; })()`);
  await untilPage(b, "s.deliveries + s.pendingDrops === 0");
  const landed = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); return { level: B.level, inner: B.path.ringInnerRadius, reflows: B.path.reflowCount, sceneryReflows: B.scenery.visibilityReflowCount, outstanding: stats.deliveries + stats.pendingDrops }; })()`);
  record("dynamic path and scenery: queued bananas cause no reflow before landing", airborne.outstanding === 100 && airborne.level === airborneBefore.level && airborne.inner === airborneBefore.inner && airborne.reflows === airborneBefore.reflows && airborne.sceneryReflows === airborneBefore.sceneryReflows && landed.outstanding === 0 && landed.level > airborne.level + 98.5 && landed.inner > airborne.inner && landed.reflows > airborne.reflows && landed.sceneryReflows > airborne.sceneryReflows, JSON.stringify({ before: airborneBefore, airborne, landed }));

  await b.evaluate(`window.__ooga.setPileLevel(1000000)`);
  const perf = await b.evaluate(`new Promise((resolve) => { const t0 = performance.now(); let frames = 0; const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve({ fps: +(frames / 2).toFixed(1), count: window.__ooga.path.visibleInstanceCount, shown: window.__ooga.shown }); }; requestAnimationFrame(tick); })`);
  record("dynamic path: million-banana hub remains at least 50 FPS", perf.fps >= 50 && perf.count === samples[2].count && perf.shown >= 999999, JSON.stringify(perf));
});

const hubCamera = () => withPage("hub camera", hubPage(src), async (b) => {
  const wheel = async (n, dy) => {
    for (let i = 0; i < n; i++) {
      await b.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 400, y: 450, deltaX: 0, deltaY: dy });
      await b.sleep(20);
    }
  };
  const view = () => b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { y: +c.position.y.toFixed(2), floor: +B.island.heightAt(c.position.x, c.position.z).toFixed(2), dist: +Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z).toFixed(1), tz: +c.target.z.toFixed(1) }; })()`);
  // Zoom in, fly out, orbit a turn, pitch up
  const samples = [];
  await wheel(14, -60);
  await hold(b, "w", 3000);
  await b.drag({ x: 400, y: 500 }, { x: 400, y: 100 });
  await b.sleep(700);
  samples.push(await view());
  for (let i = 0; i < 8; i++) {
    await b.drag({ x: 300, y: 500 }, { x: 496, y: 500 });
    await b.sleep(400);
    samples.push(await view());
  }
  await b.drag({ x: 400, y: 100 }, { x: 400, y: 850 });
  await b.sleep(700);
  samples.push(await view());
  const worst = samples.reduce((m, s) => Math.min(m, s.y - s.floor), Infinity);
  record("hub: camera stays above the island", samples[0].dist <= 16.5 && samples.some((s) => s.floor >= 3) && worst > 1, `min clearance ${worst.toFixed(2)} over ${samples.length} views, zoomed to ${samples[0].dist}, target z ${samples[0].tz}`);
});

const hubPile = ["hub pile", async (b) => {
  await b.evaluate(`window.__ooga.setPileLevel(1000000)`);
  await b.sleep(1500);
  const perf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); let frames = 0; const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else resolve({ fps: +(frames / 3).toFixed(1), shown: B.shown }); }; requestAnimationFrame(f); })`);
  const mirror = await b.evaluate(`({ active: window.__ooga.mirror.active, passes: window.__ooga.mirror.reflectionPassCount, resources: window.__ooga.mirror.resources })`);
  record("hub: mirror and million-banana pile hold at least 50 FPS", perf.fps >= 50 && perf.shown >= 999999 && mirror.active && mirror.passes > 0 && mirror.resources === 6, `${perf.fps} fps at ${perf.shown} bananas · ${JSON.stringify(mirror)}`);
}];

// Held keys keep the camera and caveman moving
const hold = async (b, key, ms) => {
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key, text: key.length === 1 ? key : undefined });
  await b.sleep(ms);
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key });
};

const hubFlight = () => withPage("hub flight", hubPage(src), async (b) => {
  const cam = () => b.evaluate(`(() => { const c = window.__ooga.camera; return { x: +c.target.x.toFixed(2), y: +c.target.y.toFixed(2), z: +c.target.z.toFixed(2), yaw: +Math.atan2(c.position.x - c.target.x, c.position.z - c.target.z).toFixed(2), py: +c.position.y.toFixed(2) }; })()`);
  const c0 = await cam();
  await hold(b, "w", 1000);
  await b.sleep(300);
  const c1 = await cam();
  await hold(b, "d", 600);
  await b.sleep(300);
  const c2 = await cam();
  await hold(b, "q", 500);
  await b.sleep(300);
  const c3 = await cam();
  await hold(b, "z", 500);
  await b.sleep(1000);
  const c4 = await cam();
  await b.sleep(1000);
  const c5 = await cam();
  record("hub: W flies forward, D strafes, Q turns, Z climbs", c1.z < c0.z - 5 && c2.x > c1.x + 2 && c3.yaw > c2.yaw + 0.4 && c4.y > c3.y + 1.5, `${JSON.stringify(c0)} -> ${JSON.stringify(c4)}`);
  record("hub: the camera holds still once the keys are up", Math.abs(c5.x - c4.x) < 0.2 && Math.abs(c5.z - c4.z) < 0.2 && Math.abs(c5.y - c4.y) < 0.2, `${JSON.stringify(c4)} -> ${JSON.stringify(c5)}`);
  // Far out and low, the camera rides over rock
  await hold(b, "w", 4000);
  await b.drag({ x: 400, y: 500 }, { x: 400, y: 100 });
  await b.sleep(600);
  const far = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { r: +Math.hypot(c.target.x, c.target.z).toFixed(1), clearance: +(c.position.y - B.island.surfaceAt(c.position.x, c.position.z)).toFixed(2) }; })()`);
  record("hub: flight is bounded around the island and stays above it", far.r <= 44.1 && far.clearance >= 1.4, JSON.stringify(far));
});

const hubCrew = () => withPage("hub crew", hubPage(src), async (b) => {
  // No builds during the check, so no timer hides
  await b.evaluate(`[...window.__ooga.cavemen.values()].forEach((c) => { c.nextBuildAt = 1e9; })`);
  // A meal ends, then the eater strolls and stands
  const stroll = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); cave.act.until = -1; setTimeout(() => resolve({ name: cave.traits.name, kind: cave.act.kind, to: cave.walk && cave.walk.to, away: cave.walk && +Math.hypot(cave.walk.tx, cave.walk.tz).toFixed(1) }), 300); })`);
  record("hub crew: a finished meal becomes a stroll to a meadow spot", stroll.kind === "wander" && stroll.to === "spot" && stroll.away >= 5, JSON.stringify(stroll));
  const idle = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.traits.name === ${JSON.stringify(stroll.name)}); const t0 = performance.now(); const tick = () => { if (cave.act.kind === "idle" || performance.now() - t0 > 20000) resolve({ kind: cave.act.kind, walk: !!cave.walk, r: +Math.hypot(cave.root.position.x, cave.root.position.z).toFixed(1) }); else requestAnimationFrame(tick); }; tick(); })`);
  record("hub crew: the stroller arrives and idles away from the pile", idle.kind === "idle" && !idle.walk && idle.r >= 5, JSON.stringify(idle));
  // Bananas land and everyone free runs back
  await b.key("b");
  await b.sleep(300);
  const rushed = await b.evaluate(`[...window.__ooga.cavemen.values()].filter((c) => c.state === "working" && !c.build).map((c) => ({ kind: c.act.kind, speed: c.walk ? c.walk.speed : null, to: c.walk ? c.walk.to : null }))`);
  const runner = rushed.find((c) => c.speed !== null);
  record("hub crew: fresh bananas send free crew back to the pile", rushed.every((c) => c.kind === "eat" || c.kind === "rush" && c.speed >= 2.5 && c.to === "slot") && !!runner, JSON.stringify(rushed));
  const eating = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { const crew = [...B.cavemen.values()].filter((c) => c.state === "working" && !c.build); const done = crew.every((c) => !c.walk && c.act.kind === "eat" && Math.hypot(c.root.position.x - c.slot.x, c.root.position.z - c.slot.z) < 0.1); if (done || performance.now() - t0 > 12000) resolve({ done, kinds: crew.map((c) => c.act.kind + (c.walk ? "/walk" : "")).join(",") }); else requestAnimationFrame(tick); }; tick(); })`);
  record("hub crew: the runners settle at their slots and eat", eating.done, eating.kinds);
});

const hubProps = () => withPage("hub props", hubPage(src, "loot=1"), async (b) => {
  // Tapping a prop wobbles it and throws particles
  const bush = await b.evaluate(`(() => { const B = window.__ooga; for (const o of B.props) { if (o.prop !== "bush" || o.node.position.y !== 0) continue; const p = B.project(o.x, 0.5, o.z); if (!p || p.x < 60 || p.x > 1080 || p.y < 140 || p.y > 860) continue; const hit = B.input.pick(p.x, p.y); if (hit && hit.owner === o) return { x: p.x, y: p.y }; } return null; })()`);
  if (bush) await b.click(bush.x, bush.y);
  await b.sleep(200);
  const r = await b.evaluate(`(() => { const B = window.__ooga; return { particles: B.stats().particles, tweens: B.stats().tweens, toast: document.getElementById("toast").textContent }; })()`);
  record("hub props: tapping a bush rustles it", !!bush && r.particles > 0 && r.tweens > 0 && r.toast.length > 0, JSON.stringify({ bush: !!bush, ...r }));
  // Space uses the nearest prop, here a barrel
  const near = await b.evaluate(`(() => { const B = window.__ooga, hidden = B.jetpack.stash, pickup = B.jetpack.pickup; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const o = B.props.find((o) => o.prop === "barrel" && o.active && o !== hidden && (!pickup || Math.hypot(o.x - pickup.x, o.z - pickup.z) > 2)); B.crew.control(cave); cave.root.position.x = o.x + 0.3; cave.root.position.z = o.z; return { name: cave.traits.name, player: B.crew.player === cave }; })()`);
  await b.sleep(100);
  await b.key(" ");
  await b.sleep(200);
  const used = await b.evaluate(`(() => { const B = window.__ooga; return { tweens: B.stats().tweens, toast: document.getElementById("toast").textContent }; })()`);
  record("hub props: Space uses the prop within reach", near.player && used.toast.includes("Empty"), JSON.stringify({ ...near, ...used }));
  await b.evaluate(`document.querySelector('[data-action="reset-view"]').click()`);
  await b.sleep(900);
  const reset = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { player: !!B.crew.player, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), dist: +Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z).toFixed(1) }; })()`);
  record("hub props: Reset view lets go and returns to the landing view", !reset.player && reset.toPile < 0.5 && Math.abs(reset.dist - 24) < 1.5, JSON.stringify(reset));
  const altar = await b.evaluate(`(() => { const B = window.__ooga; const shellMinY = () => { const data = B.shell.instanceData, geometry = B.shell.geometry; let minY = Infinity; for (let instance = 0; instance < B.shell.instanceCount; instance++) { const offset = instance * 20; for (let i = 0; i < geometry.verts.length; i += 3) minY = Math.min(minY, data[offset + 1] * geometry.verts[i] + data[offset + 5] * geometry.verts[i + 1] + data[offset + 9] * geometry.verts[i + 2] + data[offset + 13]); } return minY; }; const sample = (level) => { B.setPileLevel(level); return { radius: B.altar.radius, platformRadius: B.altar.platformRadius, slabRadius: B.altar.slab.scale.x, height: B.altar.slab.scale.y, outerRingRadius: B.altar.outerRingRadius, outerRingInnerRadius: B.altar.outerRingInnerRadius, rings: B.altar.ringCount, blocks: B.altar.blockCount, visible: B.altar.rings.filter((r) => r.instanceCount > 0).length, nodes: B.altar.rings.length, minBananaY: shellMinY() }; }; const small = sample(300), before = sample(1000), after = sample(1100), medium = sample(10000), million = sample(1000000), radii = []; for (const ring of B.altar.rings) for (let i = 0; i < ring.instanceCount; i++) radii.push(Math.hypot(ring.instanceData[i * 20 + 12], ring.instanceData[i * 20 + 14])); const shades = new Set(B.altar.rings.map((ring) => ring.geometry.faces[0].color.join(","))).size, visibleScenery = B.props.filter((o) => o.scenery && o.active), nearestSceneryEdge = Math.min(...visibleScenery.map((o) => Math.hypot(o.x, o.z) - o.footprint)); return { small, before, after, medium, million, circularVariance: Math.max(...radii) - Math.min(...radii), shades, nearestSceneryEdge, sceneryClearance: B.scenery.clearanceRadius }; })()`);
  const altarMargin = (sample) => Math.abs(sample.platformRadius - sample.radius - 0.22) < 1e-10 && Math.abs(sample.outerRingInnerRadius - sample.radius - 0.02) < 1e-10;
  record("hub altar: its empty base grows continuously and stays one block ring beyond the bananas", altar.small.slabRadius === altar.small.outerRingInnerRadius && [altar.small, altar.before, altar.after, altar.medium, altar.million].every((sample) => altarMargin(sample) && sample.slabRadius === sample.outerRingInnerRadius) && Math.abs((altar.after.platformRadius - altar.before.platformRadius) - (altar.after.radius - altar.before.radius)) < 1e-10 && altar.million.height >= 0.3 && altar.small.minBananaY > altar.small.height && altar.medium.minBananaY > altar.medium.height && altar.million.minBananaY > altar.million.height && altar.nearestSceneryEdge >= altar.sceneryClearance - 1e-8, JSON.stringify(altar));
  const flushBlocks = await b.evaluate(`(() => { const A = window.__ooga.altar; let minBase = Infinity, maxBase = -Infinity, minTop = Infinity, maxTop = -Infinity; for (const ring of A.rings) for (let i = 0; i < ring.instanceCount; i++) { const offset = i * 20, base = ring.instanceData[offset + 13], top = base + ring.instanceData[offset + 5]; minBase = Math.min(minBase, base); maxBase = Math.max(maxBase, base); minTop = Math.min(minTop, top); maxTop = Math.max(maxTop, top); } return { platformTop: A.height, minBase, maxBase, minTop, maxTop }; })()`);
  record("hub altar: perimeter blocks stand on the ground outside the light platform and finish flush", Math.abs(flushBlocks.minBase) < 1e-6 && Math.abs(flushBlocks.maxBase) < 1e-6 && Math.abs(flushBlocks.minTop - flushBlocks.platformTop) < 1e-6 && Math.abs(flushBlocks.maxTop - flushBlocks.platformTop) < 1e-6, JSON.stringify(flushBlocks));
  record("hub altar: one concentric shaded perimeter adds blocks as it expands", altar.small.rings === 1 && altar.medium.rings === 1 && altar.million.rings === 1 && altar.small.blocks < altar.medium.blocks && altar.medium.blocks < altar.million.blocks && altar.million.visible === 3 && altar.million.nodes === 3 && altar.circularVariance < 1e-6 && altar.shades === 3, JSON.stringify({ small: altar.small.blocks, medium: altar.medium.blocks, million: altar.million.blocks, variance: altar.circularVariance, shades: altar.shades }));
  await b.evaluate(`window.__ooga.demoTip(120000)`);
  await b.sleep(2600);
  const landing = await b.evaluate(`(() => { const B = window.__ooga, c = B.crates[0]; return c && { crateRadius: Math.hypot(c.node.position.x, c.node.position.z), pileRadius: B.altar.radius, platformRadius: B.altar.platformRadius }; })()`);
  record("hub altar: loot crates land beyond the grown platform", !!landing && landing.crateRadius >= landing.platformRadius + 0.7, JSON.stringify(landing));
});

const labDrive = () => withPage("lab drive", page(src), async (b) => {
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); const hit = B.input.pick(p.x, p.y); return { name: cave.traits.name, x: p.x, y: p.y, kind: hit && hit.owner.kind }; })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(120);
  await b.click(pick.x, pick.y);
  await b.sleep(300);
  const pos = () => b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return p && { name: p.traits.name, x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2) }; })()`);
  const p0 = await pos();
  await hold(b, "w", 1200);
  await b.sleep(300);
  const p1 = await pos();
  record("lab drive: a double tap takes the wheel and W walks the caveman inside the room", pick.kind === "caveman" && !!p0 && p0.name === pick.name && Math.hypot(p1.x - p0.x, p1.z - p0.z) >= 2 && Math.abs(p1.x) < 10 && Math.abs(p1.z) < 10, `${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
  // Space flips a card at the table
  await b.evaluate(`(() => { const B = window.__ooga; const card = B.lab.equipment.cards[0]; const w = card.world; const p = B.crew.player; p.root.position.x = w[12] + 0.6; p.root.position.z = w[14] + 0.6; })()`);
  await b.sleep(80);
  await b.key(" ");
  await b.sleep(120);
  const flipped = await b.evaluate(`(() => { const B = window.__ooga; return B.lab.equipment.cards.some((c) => c.flipping) || B.lab.equipment.dice.some((d) => d.rolling); })()`);
  record("lab drive: Space uses the equipment within reach", flipped === true);
  await b.key("Escape");
  await b.sleep(200);
  const freed = await b.evaluate(`({ scene: window.__ooga.scene, player: !!window.__ooga.crew.player })`);
  record("lab drive: the first Escape only lets go", freed.scene === "lab" && !freed.player, JSON.stringify(freed));
});

const hubDrive = () => withPage("hub drive", hubPage(src), async (b) => {
  // The eater standing beside the pile, so a walk forward passes it instead of running into it
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cx = B.camera.position.x, cz = B.camera.position.z, cl = Math.hypot(cx, cz), side = (c) => { const p = c.root.position; return Math.abs((p.x * cx + p.z * cz) / (Math.hypot(p.x, p.z) * cl)); }; const cave = [...B.cavemen.values()].filter((c) => c.state === "working" && !c.walk && !c.build).sort((a, b) => side(a) - side(b))[0]; const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); const hit = B.input.pick(p.x, p.y); return { name: cave.traits.name, x: p.x, y: p.y, kind: hit && hit.owner.kind }; })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(120);
  await b.click(pick.x, pick.y);
  await b.sleep(300);
  const driven = await b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { player: p && p.traits.name, kind: p && p.act.kind, act: !document.getElementById("act").hidden, follow: p && +Math.hypot(B.camera.target.x - p.root.position.x, B.camera.target.z - p.root.position.z).toFixed(2) }; })()`);
  record("hub drive: a double tap takes the wheel of a caveman", pick.kind === "caveman" && driven.player === pick.name && driven.kind === "player" && driven.act, JSON.stringify(driven));
  const pos = () => b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return p && { x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2), follow: +Math.hypot(B.camera.target.x - p.root.position.x, B.camera.target.z - p.root.position.z).toFixed(2) }; })()`);
  const p0 = await pos();
  await hold(b, "w", 1500);
  await b.sleep(500);
  const p1 = await pos();
  record("hub drive: W walks the caveman and the camera follows", Math.hypot(p1.x - p0.x, p1.z - p0.z) >= 3 && p1.follow < 1.5, `${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
  await b.key(" ");
  await b.sleep(120);
  // Space shouts, or uses whatever is in reach
  const act = await b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { hop: p.hop > 0 || p.hopV > 0, bubbles: B.stats().bubbles, toast: document.getElementById("toast").textContent, tweens: B.stats().tweens }; })()`);
  record("hub drive: Space acts", (act.hop && act.bubbles >= 1) || act.toast.length > 0, JSON.stringify(act));
  // Both mouse buttons held on the canvas walk too, and the press never lands as a tap
  const spot = await b.evaluate(`(() => { const B = window.__ooga, p = B.crew.player.root.position, s = B.project(p.x, p.y + 0.2, p.z); return { x: s.x, y: s.y, hit: !!B.input.pick(s.x, s.y) }; })()`);
  await b.mouse("mouseMoved", spot.x, spot.y, { button: "none" });
  await b.mouse("mousePressed", spot.x, spot.y, { buttons: 1 });
  await b.mouse("mousePressed", spot.x, spot.y, { button: "right", buttons: 3 });
  await b.sleep(800);
  const yaw = () => b.evaluate(`(() => { const c = window.__ooga.camera; return +Math.atan2(c.position.x - c.target.x, c.position.z - c.target.z).toFixed(2); })()`);
  const yaw0 = await yaw();
  for (let i = 1; i <= 8; i++) {
    await b.mouse("mouseMoved", spot.x + i * 25, spot.y, { buttons: 3 });
    await b.sleep(40);
  }
  await b.sleep(700);
  const chordHeld = await b.evaluate(`window.__ooga.controls.read().y`);
  const yaw1 = await yaw();
  await b.mouse("mouseReleased", spot.x + 200, spot.y, { button: "right", buttons: 1 });
  await b.mouse("mouseReleased", spot.x + 200, spot.y, { buttons: 0 });
  await b.sleep(400);
  const p2 = await pos();
  const chordFreed = await b.evaluate(`({ y: window.__ooga.controls.read().y, player: !!window.__ooga.crew.player })`);
  record("hub drive: both mouse buttons walk the caveman forward and dragging turns him, without letting go", spot.hit && chordHeld === 1 && Math.hypot(p2.x - p1.x, p2.z - p1.z) >= 3 && Math.abs(yaw1 - yaw0) > 0.3 && chordFreed.y === 0 && chordFreed.player, JSON.stringify({ spot, chordHeld, yaw0, yaw1, p1, p2, chordFreed }));
  // Pressed together, Chrome reports the pair as one move with no pointerdown; the chord must still turn
  await b.mouse("mousePressed", spot.x, spot.y, { button: "right", buttons: 3 });
  await b.sleep(600);
  const yaw2 = await yaw();
  for (let i = 1; i <= 8; i++) {
    await b.mouse("mouseMoved", spot.x - i * 25, spot.y, { buttons: 3 });
    await b.sleep(40);
  }
  await b.sleep(700);
  const yaw3 = await yaw();
  await b.mouse("mouseReleased", spot.x - 200, spot.y, { buttons: 2 });
  await b.mouse("mouseReleased", spot.x - 200, spot.y, { button: "right", buttons: 0 });
  await b.sleep(400);
  const p3 = await pos();
  const chordFreed2 = await b.evaluate(`({ y: window.__ooga.controls.read().y, player: !!window.__ooga.crew.player })`);
  record("hub drive: the chord walks and turns when both buttons go down together", Math.hypot(p3.x - p2.x, p3.z - p2.z) >= 3 && Math.abs(yaw3 - yaw2) > 0.3 && chordFreed2.y === 0 && chordFreed2.player, JSON.stringify({ yaw2, yaw3, p2, p3, chordFreed2 }));
  await b.key("j");
  await b.sleep(120);
  const equipped = await b.evaluate(`(() => { const B = window.__ooga, p = B.crew.player; return { lootEnabled: B.lootEnabled, lootCrates: B.crates.length, decorativeCrates: B.props.filter((o) => o.scenery && o.prop === "crate" && o.active).length, stash: !!B.jetpack.stash, pickup: !!B.jetpack.pickup, jet: !!p.jet, attached: !!p.jet && p.root.children.includes(p.jet.node), act: document.getElementById("act").textContent }; })()`);
  await hold(b, " ", 500);
  const flying = await b.evaluate(`(() => { const p = window.__ooga.crew.player; return { hop: p.hop, flame: p.jet.flame.visible }; })()`);
  record("hub drive: J equips the controlled Ooga without enabling donation loot", !equipped.lootEnabled && equipped.lootCrates === 0 && equipped.decorativeCrates > 0 && !equipped.stash && !equipped.pickup && equipped.jet && equipped.attached && /blast/i.test(equipped.act) && flying.hop > 0.5, JSON.stringify({ equipped, flying }));
  await b.key("Escape");
  await b.sleep(200);
  const freed = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.traits.name === ${JSON.stringify(pick.name)}); return { player: !!B.crew.player, act: !document.getElementById("act").hidden, kind: cave.act.kind }; })()`);
  record("hub drive: Escape lets go and the caveman goes back to its day", !freed.player && !freed.act && freed.kind === "idle", JSON.stringify(freed));
});

// The jetpack hidden, freed, worn and flown
const hubJetpack = () => withPage("hub jetpack", hubPage(src, "loot=1"), async (b) => {
  const hidden = await b.evaluate(`(() => { const B = window.__ooga; const s = B.jetpack.stash; return s && { prop: s.prop, x: +s.x.toFixed(2), z: +s.z.toFixed(2) }; })()`);
  // Two minutes in, the holding prop pulses
  const pulse = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; B.jetpack.hintNow(); let peak = 0; const t0 = performance.now(); const tick = () => { peak = Math.max(peak, B.jetpack.stash.node.highlight); if (performance.now() - t0 > 2200) resolve({ peak: +peak.toFixed(2), after: +B.jetpack.stash.node.highlight.toFixed(2) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("hub jetpack: the hiding prop pulses when the hunt drags on", pulse.peak > 0.4 && pulse.after < 0.05, JSON.stringify(pulse));
  // The eater standing beside the pile, so a walk forward passes it instead of running into it
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cx = B.camera.position.x, cz = B.camera.position.z, cl = Math.hypot(cx, cz), side = (c) => { const p = c.root.position; return Math.abs((p.x * cx + p.z * cz) / (Math.hypot(p.x, p.z) * cl)); }; const cave = [...B.cavemen.values()].filter((c) => c.state === "working" && !c.walk && !c.build).sort((a, b) => side(a) - side(b))[0]; const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); return { name: cave.traits.name, x: p.x, y: p.y }; })()`);
  await b.click(pick.x, pick.y);
  await b.sleep(120);
  await b.click(pick.x, pick.y);
  await b.sleep(300);
  // Near enough to reach, far enough not to collect
  const staged = await b.evaluate(`(() => { const B = window.__ooga; const s = B.jetpack.stash; const p = B.crew.player.root.position; for (const r of [1.8, 1.6, 2]) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; if (!B.island.onLand(x, z)) continue; let best = null, bd = 1e9; for (const o of B.props) { if (!o.active) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } } if (best === s) { p.x = x; p.z = z; return { x: +x.toFixed(2), z: +z.toFixed(2), r }; } } } return null; })()`);
  await b.sleep(120);
  await b.key(" ");
  await b.sleep(300);
  const dropped = await b.evaluate(`(() => { const B = window.__ooga; return { pickup: !!B.jetpack.pickup, stash: !!B.jetpack.stash, prop: B.props.filter((o) => o.prop === "jetpack").length, toast: document.getElementById("toast").textContent }; })()`);
  record("hub jetpack: hidden in a prop until it is disturbed", !!hidden && !!staged && dropped.pickup && !dropped.stash && dropped.prop === 1 && dropped.toast.includes("jetpack"), JSON.stringify({ hidden, staged, ...dropped }));
  // Walking into the pickup wears it
  await b.evaluate(`(() => { const B = window.__ooga; const j = B.jetpack.pickup; const p = B.crew.player.root.position; p.x = j.x; p.z = j.z; })()`);
  await b.sleep(300);
  const worn = await b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { jet: !!p.jet, onBack: !!p.jet && p.root.children.includes(p.jet.node), left: B.props.filter((o) => o.prop === "jetpack").length, act: document.getElementById("act").textContent, pickup: !!B.jetpack.pickup }; })()`);
  record("hub jetpack: a driven caveman walking into it puts it on", worn.jet && worn.onBack && worn.left === 0 && !worn.pickup && /blast/i.test(worn.act), JSON.stringify(worn));
  // Held Space climbs, releasing floats him down
  const air = () => b.evaluate(`(() => { const B = window.__ooga; const p = B.crew.player; return { hop: +p.hop.toFixed(2), flame: p.jet.flame.visible, y: +p.root.position.y.toFixed(2), camY: +B.camera.target.y.toFixed(2) }; })()`);
  const ground = await air();
  await hold(b, " ", 1200);
  const up = await air();
  await b.sleep(4000);
  const down = await air();
  record("hub jetpack: held Space blasts off and the fall is floaty", ground.hop < 0.05 && up.hop > 2 && up.y > ground.y + 2 && up.camY > ground.camY + 1 && down.hop < 0.05, JSON.stringify({ ground, up, down }));
  // Flight crosses the cliff ring a walk cannot
  const flown = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const p = B.crew.player; p.hop = 6; p.hopV = 0; const h0 = B.island.heightAt(p.root.position.x, p.root.position.z); const t0 = performance.now(); const tick = () => { if (performance.now() - t0 > 1500) resolve({ h0, h1: B.island.heightAt(p.root.position.x, p.root.position.z), hop: +p.hop.toFixed(2) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("hub jetpack: the flier stays over the island while airborne", flown.hop >= 0, JSON.stringify(flown));
});


// ---------- the clock ----------
const daylightNight = () => withPage("daylight night", hubPage(src, "hour=22&day=80"), async (b) => {
  const keys = await b.evaluate(`(() => {
    const D = window.BL.daylight;
    const make = () => ({ clear: [0, 0, 0], horizon: [0, 0, 0], zenith: [0, 0, 0], sky: [0, 0, 0], ground: [0, 0, 0], sun: [0, 0, 0], direct: [0, 0, 0], light: { x: 0, y: 0, z: 0 }, sunDirection: { x: 0, y: 0, z: 0 }, moon: { x: 0, y: 0, z: 0 }, celestialPole: { x: 0, y: 0, z: 0 }, starMatrix: new Float32Array(9) });
    const out = make(), sample = (hour, day = 80, continuous = day - 1 + hour / 24, latitude = 20) => { D.sample(hour, out, day, latitude, continuous); return { hour, sun: { ...out.sunDirection }, moon: { ...out.moon }, light: { ...out.light }, pole: { ...out.celestialPole }, altitude: out.sunAltitude, azimuth: out.sunAzimuth, moonAltitude: out.moonAltitude, daylight: out.day, twilight: out.twilight, stars: out.stars, lamps: out.lampFactor, sunStrength: out.sunStrength, moonStrength: out.moonStrength, direct: out.directStrength, ambientFloor: out.ambientFloor, diffuseFloor: out.diffuseFloor, shadow: out.shadowStrength, shadowFloor: out.shadowFloor, darkest: out.outdoorDarkestSurfaceEstimate, declination: out.solarDeclination, sunrise: out.sunriseHour, sunset: out.sunsetHour, clear: [...out.clear], horizon: [...out.horizon], zenith: [...out.zenith], sky: [...out.sky], ground: [...out.ground], matrix: [...out.starMatrix] }; };
    const base = sample(12), rise = sample(base.sunrise), noon = sample(12), set = sample(base.sunset), midnight = sample(0, 80, 80);
    const summer = sample(12, 172), summerRise = sample(summer.sunrise, 172), winter = sample(12, 355), winterRise = sample(winter.sunrise, 355);
    const morning = [8, 9, 10].map((h) => sample(h)), afternoon = [14, 15, 16].map((h) => sample(h));
    const angle = (a, z) => Math.acos(Math.max(-1, Math.min(1, a.x * z.x + a.y * z.y + a.z * z.z))) * 180 / Math.PI;
    let previous = null, maxSunStep = 0, maxMoonStep = 0, maxStarStep = 0, maxColorStep = 0, maxDirectStep = 0, maxShadowStep = 0;
    for (let minute = 0; minute <= 1440; minute++) {
      const rawHour = minute / 60, h = rawHour === 24 ? 0 : rawHour, current = sample(h, 80, 79 + rawHour / 24);
      if (previous) {
        maxSunStep = Math.max(maxSunStep, angle(previous.sun, current.sun));
        maxMoonStep = Math.max(maxMoonStep, angle(previous.moon, current.moon));
        for (let i = 0; i < 9; i++) maxStarStep = Math.max(maxStarStep, Math.abs(previous.matrix[i] - current.matrix[i]));
        for (let i = 0; i < 3; i++) maxColorStep = Math.max(maxColorStep, Math.abs(previous.clear[i] - current.clear[i]), Math.abs(previous.sky[i] - current.sky[i]), Math.abs(previous.ground[i] - current.ground[i]));
        maxDirectStep = Math.max(maxDirectStep, Math.abs(previous.direct - current.direct));
        maxShadowStep = Math.max(maxShadowStep, Math.abs(previous.shadow - current.shadow));
      }
      previous = current;
    }
    const phases = [0, 5, 6.9, 7, 11, 15.9, 16, 19, 22.9, 23, 23.9].map(D.phaseAt);
    const luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    const visibility = [0, 5, 6, 18, 19, 22].map((h) => { const s = sample(h); return { hour: h, ambientMin: Math.min(...s.sky, ...s.ground), ambientSpan: Math.max(...s.sky, ...s.ground) - Math.min(...s.sky, ...s.ground), silhouetteContrast: luma(s.sky) - luma(s.zenith) }; });
    return { rise, noon, set, midnight, summer, summerRise, winter, winterRise, morning, afternoon, phases, visibility, continuity: { maxSunStep, maxMoonStep, maxStarStep, maxColorStep, maxDirectStep, maxShadowStep } };
  })()`);
  record("daylight: equinox sun rises east, crosses the southern sky and sets west", keys.rise.sun.x > 0.98 && Math.abs(keys.rise.sun.y) < 0.02 && keys.noon.sun.z > 0.3 && Math.abs(keys.noon.sun.x) < 1e-6 && keys.set.sun.x < -0.98 && Math.abs(keys.set.sun.y) < 0.02, JSON.stringify({ rise: keys.rise, noon: keys.noon, set: keys.set }));
  const poleAltitude = Math.asin(keys.noon.pole.y) * 180 / Math.PI;
  record("daylight: the gate is true north and its celestial pole is 20 degrees above that horizon", Math.abs(keys.noon.pole.x) < 1e-8 && keys.noon.pole.z < -0.9 && Math.abs(poleAltitude - 20) < 1e-5, JSON.stringify({ pole: keys.noon.pole, altitude: poleAltitude }));
  const c = keys.continuity;
  record("daylight: celestial motion, colors, direct light and shadows are continuous through all boundaries and midnight", c.maxSunStep < 0.27 && c.maxMoonStep < 0.28 && c.maxStarStep < 0.005 && c.maxColorStep < 0.03 && c.maxDirectStep < 0.05 && c.maxShadowStep < 0.05, JSON.stringify(c));
  record("daylight: dawn, dusk and night retain a readable ambient floor and silhouette contrast", keys.visibility.every((s) => s.ambientMin >= 0.225 && s.ambientSpan >= 0.12 && s.silhouetteContrast >= 0.08), JSON.stringify(keys.visibility));
  record("daylight: night visibility uses bounded ambient, back-face diffuse and shadow floors", keys.midnight.darkest >= 0.27 && keys.midnight.ambientFloor === 0.27 && keys.midnight.diffuseFloor === 0.1 && keys.midnight.shadowFloor === 0.38 && keys.midnight.moonStrength <= 0.26, JSON.stringify(keys.midnight));
  record("daylight: the sun continues below ground while its own direct and shadow contribution reaches zero", keys.midnight.sun.y < -0.8 && keys.midnight.sunStrength === 0 && keys.midnight.daylight === 0 && keys.midnight.stars === 1, JSON.stringify(keys.midnight));
  const shadowArc = keys.morning[0].sun.x > keys.morning[1].sun.x && keys.morning[1].sun.x > keys.morning[2].sun.x && keys.afternoon[0].sun.x > keys.afternoon[1].sun.x && keys.afternoon[1].sun.x > keys.afternoon[2].sun.x && keys.morning[1].light.x > 0 && keys.afternoon[1].light.x < 0;
  record("daylight: morning and afternoon shadow directions oppose and advance monotonically", shadowArc, JSON.stringify({ morning: keys.morning.map((s) => s.light), afternoon: keys.afternoon.map((s) => s.light) }));
  record("daylight: axial tilt changes declination, sunrise direction and seasonal day length", keys.summer.declination > 23 && keys.winter.declination < -23 && keys.summer.sunset - keys.summer.sunrise > keys.winter.sunset - keys.winter.sunrise + 2 && keys.summerRise.sun.z < 0 && keys.winterRise.sun.z > 0, JSON.stringify({ summer: keys.summer, summerRise: keys.summerRise, winter: keys.winter, winterRise: keys.winterRise }));
  const noonOk = Math.abs(keys.noon.clear[0] - 0.36) < 1e-6 && Math.abs(keys.noon.clear[2] - 0.82) < 1e-6 && keys.noon.sunStrength === 1 && keys.noon.stars === 0 && keys.noon.lamps === 0 && keys.noon.daylight === 1;
  record("daylight: noon reproduces the original hub look and the six phases sit on their hours", noonOk && keys.phases.join(",") === "midnight,dawn,dawn,morning,noon,noon,dusk,night,night,midnight,midnight", JSON.stringify(keys));
  const night = await b.evaluate(`(() => { const B = window.__ooga, o = B.renderOpts, d = B.daylight, luma = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; return { hour: d.hour, continuousDay: d.continuousDay, dayOfYear: d.dayOfYear, latitude: d.latitude, phase: d.phase, altitude: d.sunAltitude, azimuth: d.sunAzimuth, sidereal: d.siderealAngle, source: d.activeLightSource, strength: d.directStrength, moon: d.moonStrength, ambientFloor: d.ambientFloor, diffuseFloor: d.diffuseFloor, shadow: d.shadowStrength, shadowFloor: d.shadowFloor, stars: o.stars, torch: o.torch, day: o.day, darkest: d.outdoorDarkestSurfaceEstimate, silhouetteContrast: luma(o.sky) - luma(o.zenith), lights: o.lightCount, tier: B.renderer.quality, lamps: B.lamps.map((l) => +l.node.glow.toFixed(2)), lit: B.lamps.every((l) => l.lit), critters: B.critters, subtitle: document.getElementById("subtitle").textContent, gl: B.renderer.stats }; })()`);
  record("daylight: day override and bounded debug values use the production 20-degree latitude", night.hour === 22 && night.dayOfYear === 80 && night.latitude === 20 && Number.isFinite(night.continuousDay) && Number.isFinite(night.altitude) && Number.isFinite(night.azimuth) && Number.isFinite(night.sidereal), JSON.stringify(night));
  record("daylight: night ambient stays readable and contrasted while below-ground sunlight is disabled", night.darkest >= 0.27 && night.ambientFloor === 0.27 && night.diffuseFloor === 0.1 && night.shadowFloor === 0.38 && night.silhouetteContrast >= 0.08 && night.altitude < 0 && night.strength <= 0.26 && night.shadow <= 0.13, JSON.stringify(night));
  record("daylight: at 22h the hub is night with stars, every lamp lit and ten point lights on the high tier", night.hour === 22 && night.phase === "night" && night.stars === 1 && night.torch === 1 && night.day === 0 && night.lit && night.lamps.every((g) => g > 0.5) && (night.tier !== "high" || night.lights === 10) && night.subtitle.endsWith("night"), JSON.stringify(night));
  record("daylight: fireflies and embers are out at night and the butterflies are gone", night.critters.fireflies > 0 && night.critters.embers > 0 && night.critters.butterflies === 0, JSON.stringify(night.critters));
  record("daylight: the camera pass culls what the frustum cannot see and still draws the island", night.gl.culled > 0 && night.gl.drawn > 0, JSON.stringify(night.gl));
  const stableStars = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, before = Array.from(B.renderOpts.starMatrix); B.camera.position.x += 0.25; const start = B.renderedFrames; const tick = () => { if (B.renderedFrames >= start + 3) resolve({ before, after: Array.from(B.renderOpts.starMatrix) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("daylight: camera movement does not rotate the world-space stars", stableStars.before.every((v, i) => v === stableStars.after[i]), JSON.stringify(stableStars));
  const reset = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; [...B.cavemen.values()].forEach((c) => { c.nextBuildAt = 1e9; }); B.setHour(12, NaN, 172); const warm = B.renderedFrames; const begin = () => { const before = { nodes: B.stats().allNodes, records: B.renderer.stats.records, shadowResources: B.renderer.stats.shadowResources, shadowSize: B.renderer.stats.shadowSize }; let resets = 0; const tick = () => { B.setHour(12, NaN, 172); resets++; if (resets < 24) requestAnimationFrame(tick); else requestAnimationFrame(() => resolve({ before, after: { nodes: B.stats().allNodes, records: B.renderer.stats.records, shadowResources: B.renderer.stats.shadowResources, shadowSize: B.renderer.stats.shadowSize, finite: B.renderer.stats.shadowFinite } })); }; requestAnimationFrame(tick); }; const wait = () => B.renderedFrames >= warm + 16 ? begin() : requestAnimationFrame(wait); requestAnimationFrame(wait); })`);
  record("daylight: repeated clock resets keep nodes and GPU shadow resources constant, including near overhead", reset.after.nodes === reset.before.nodes && reset.after.records === reset.before.records && reset.after.shadowResources === reset.before.shadowResources && reset.after.shadowSize === reset.before.shadowSize && reset.after.finite, JSON.stringify(reset));
  const shaken = await b.evaluate(`(() => { const B = window.__ooga; B.setHour(22, NaN, 80); const o = B.props.find((o) => o.prop === "tree" && o.active); const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); B.crew.control(cave); cave.root.position.x = o.x + 0.8; cave.root.position.z = o.z; return { fireflies: B.critters.fireflies, player: B.crew.player === cave }; })()`);
  await b.sleep(100);
  await b.key(" ");
  await b.sleep(150);
  const scattered = await b.evaluate(`(() => { const B = window.__ooga; return { particles: B.stats().particles, toast: document.getElementById("toast").textContent }; })()`);
  record("daylight: shaking a tree at night throws leaves and scatters fireflies", shaken.player && shaken.fireflies > 0 && scattered.particles > 0 && scattered.toast.length > 0, JSON.stringify({ shaken, scattered }));
  await b.evaluate(`window.__ooga.setPileLevel(1000000)`);
  const perf = await b.evaluate(`new Promise((resolve) => { const t0 = performance.now(); let frames = 0; const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve({ fps: +(frames / 2).toFixed(1), shown: window.__ooga.shown, lights: window.__ooga.renderOpts.lightCount }); }; requestAnimationFrame(tick); })`);
  record("daylight: the million-banana hub at night with lights and fireflies keeps 50 FPS", perf.fps >= 50 && perf.shown >= 999999, JSON.stringify(perf));
});

const dayCycle = () => withPage("day cycle", hubPage(src, "hour=4.9&day=80&daylen=12&bananas=1000000"), async (b) => {
  const cycle = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const phases = [], lights = {}, toasts = new Set(); let last = null, frames = 0; const t0 = performance.now(), day0 = B.daylight.continuousDay, shown0 = B.shown, resources = B.renderer.stats.shadowResources; const tick = () => { frames++; const p = B.daylight.phase; if (p !== last) { phases.push(p); last = p; } lights[p] = B.renderOpts.lightCount; const t = document.getElementById("toast").textContent; if (t) toasts.add(t); if (B.daylight.continuousDay < day0 + 1 && performance.now() - t0 < 15000) requestAnimationFrame(tick); else { const elapsed = (performance.now() - t0) / 1000; resolve({ phases, lights, toasts: [...toasts], subtitle: document.getElementById("subtitle").textContent, stats: B.stats(), fps: +(frames / elapsed).toFixed(1), elapsed: +elapsed.toFixed(2), day0, day1: B.daylight.continuousDay, dayOfYear: B.daylight.dayOfYear, shown0, shown: B.shown, resources: [resources, B.renderer.stats.shadowResources], shadowFinite: B.renderer.stats.shadowFinite }); } }; tick(); })`);
  const order = ["dawn", "morning", "noon", "dusk", "night", "midnight"];
  const inOrder = cycle.phases.length === 7 && cycle.phases.every((p, i) => p === order[(order.indexOf(cycle.phases[0]) + i) % 6]);
  record("day cycle: the six phases pass in order under daylen and the subtitle follows", inOrder && cycle.subtitle === `an island of caves · ${cycle.phases[6]}`, JSON.stringify(cycle.phases));
  record("day cycle: point lights are off by day and on at night, with a toast at each phase", cycle.lights.noon === 0 && cycle.lights.morning === 0 && cycle.lights.night === 10 && cycle.lights.midnight === 10 && cycle.toasts.length >= 5, JSON.stringify({ lights: cycle.lights, toasts: cycle.toasts }));
  record("day cycle: accelerated time crosses midnight continuously and keeps the million-banana hub at 50 FPS", cycle.day1 >= cycle.day0 + 1 && cycle.dayOfYear === 81 && cycle.shown0 >= 999999 && cycle.shown >= cycle.shown0 - 5 && cycle.fps >= 50 && cycle.resources[0] === cycle.resources[1] && cycle.shadowFinite, JSON.stringify(cycle));
  record("day cycle: nothing accumulates across a day", cycle.stats.tweens <= 12 && cycle.stats.bubbles <= 10 && cycle.stats.zzz <= 40 && cycle.stats.particles <= 240 && cycle.stats.pool <= 60, JSON.stringify(cycle.stats));
});

const daylightCanvas = () => withPage("daylight canvas", hubPage(src, "canvas2d=1&hour=6&day=80"), async (b) => {
  const frames = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, samples = [], times = [6, 12, 18, 0]; let i = 0; const next = () => { B.setHour(times[i], NaN, 80); const start = B.renderedFrames; const tick = () => { if (B.renderedFrames < start + 2) return requestAnimationFrame(tick); const d = B.daylight; samples.push({ hour: d.hour, altitude: d.sunAltitude, daylight: d.daylightFactor, stars: d.starFactor, lamps: d.lampFactor }); i++; if (i < times.length) next(); else resolve({ kind: B.renderer.kind, samples, stats: B.renderer.stats }); }; requestAnimationFrame(tick); }; next(); })`);
  record("daylight canvas: dawn, noon, dusk and night render through the parity API", frames.kind === "canvas2d" && frames.samples.length === 4 && frames.samples.every((s) => Number.isFinite(s.altitude)) && frames.samples[1].daylight === 1 && frames.samples[3].stars === 1 && frames.stats.shadowResources === 0 && frames.stats.shadowFinite, JSON.stringify(frames));
});

// Walking the driven caveman off the cave roof arcs him clear of the front instead of dropping through it
const hubHopOff = () => withPage("hub hop-off", hubPage(src), async (b) => {
  const setup = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const m = B.mouths.find((m) => m.id === "c11"); const ox = Math.sin(m.angle), oz = -Math.cos(m.angle); B.crew.control(cave); const x = m.x + ox * 1.2, z = m.z + oz * 1.2; const roof = B.island.surfaceAt(x, z); cave.root.position.x = x; cave.root.position.z = z; cave.root.position.y = cave.baseY + roof; cave.hop = 0; cave.hopV = 0; cave.root.rotation.y = Math.PI - m.angle; B.pilot.orbit.tYaw = B.pilot.orbit.yaw = Math.PI - m.angle; return { name: cave.traits.name, roof, player: B.crew.player === cave }; })()`);
  await b.sleep(300);
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "w", text: "w" });
  const rows = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, p = B.crew.player, m = B.mouths.find((m) => m.id === "c11"), ox = Math.sin(m.angle), oz = -Math.cos(m.angle); const rows = []; const t0 = performance.now(); const tick = () => { const q = p.root.position; rows.push({ y: q.y - p.baseY, along: (q.x - m.x) * ox + (q.z - m.z) * oz, hop: p.hop }); if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else resolve(rows); }; requestAnimationFrame(tick); })`);
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "w" });
  const drops = rows.slice(1).map((r, i) => rows[i].y - r.y);
  const left = rows.findIndex((r) => r.hop > 0);
  const landed = rows.findIndex((r, i) => left >= 0 && i > left && r.hop === 0);
  // The rim frame stands one unit in front of the face, up to the lintel
  const frontHit = rows.some((r) => r.along > -1.2 && r.along < 0.2 && r.y > 0.3 && r.y < 3.6);
  record("hub hop-off: leaving the cave roof falls over several frames, never a one-frame drop", setup.player && setup.roof > 3 && left > 0 && landed > left + 8 && Math.max(...drops) < 1, JSON.stringify({ roof: setup.roof, left, landed, maxDrop: +Math.max(...drops).toFixed(2), frames: rows.length }));
  record("hub hop-off: the arc clears the cave front and lands out on the apron", landed > 0 && !frontHit && rows[landed].along < -1.2 && Math.abs(rows[landed].y) < 0.1, JSON.stringify({ landing: rows[landed], frontHit }));
});


// ---------- Ooga Rally ----------
const racePage = (base, query) => `${base}?debug=1&nosim=1&scene=race${clock(query)}`;
// Run the race clock forward without frames: countdown, then the given seconds with everyone AI-driven
const autoRace = (track, seconds) => `(() => { const B = window.__ooga; document.querySelector('[data-track="${track}"]').click(); B.race.startRace(); B.race.simulate(4); B.racers.autopilot = true; B.racers.start(); B.race.simulate(${seconds}); return B.race.phase; })()`;

const raceGarage = () => withPage("race garage", racePage(src), async (b) => {
  const garage = await b.evaluate(`(() => { const B = window.__ooga; const q = (s) => document.querySelectorAll(s).length; return { scene: B.scene, phase: B.race.phase, racers: q("#garage-racers button"), mounts: q("#garage-mounts button"), tracks: q("#garage-tracks button"), medals: [...document.querySelectorAll("#garage-tracks .garage-medal")].map((m) => m.textContent), garageShown: !document.getElementById("garage").hidden, stripHidden: document.getElementById("race-strip").hidden, leaveShown: !document.querySelector('[data-scene="race"] [data-action="leave"]').hidden, lamps: B.track.lamps.length, records: B.renderer.stats.records, targets: B.input.targetCount, sheet: document.getElementById("sheet").dataset.open, onGrid: B.racers.racers.every((r) => r.node.visible && r.speed === 0 && r.mount), player: B.racers.player && B.racers.player.name, pressed: document.querySelector('#garage-mounts [aria-pressed="true"]').dataset.mount }; })()`);
  record("race garage: the scene lands in the garage with seven Oogas, three rides and three tracks", garage.scene === "race" && garage.phase === "garage" && garage.racers === 7 && garage.mounts === 3 && garage.tracks === 3 && garage.medals.every((m) => m === "NEW") && garage.garageShown && garage.stripHidden && garage.leaveShown && garage.lamps === 3 && garage.onGrid && garage.player === "portlandhodl" && garage.pressed === "kart" && garage.sheet === "false", JSON.stringify(garage));
  const eye = await b.evaluate(`(() => { const c = window.__ooga.camera; return { x: c.position.x, z: c.position.z, y: c.position.y, tx: c.target.x, tz: c.target.z }; })()`);
  await b.drag({ x: 150, y: 520 }, { x: 350, y: 480 });
  const swung = await b.evaluate(`(() => { const c = window.__ooga.camera, cam = window.__ooga.race.cam; return { x: c.position.x, z: c.position.z, y: c.position.y, tx: c.target.x, tz: c.target.z, yaw: cam.garageYaw, lift: cam.garageLift, phase: window.__ooga.race.phase }; })()`);
  const radius = (e) => Math.hypot(e.x - e.tx, e.z - e.tz);
  record("race garage: a drag swings the view round the grid and tilts it, keeping the grid in the middle", swung.phase === "garage" && swung.yaw < -0.5 && swung.lift < 0 && Math.abs(radius(swung) - radius(eye)) < 0.01 && Math.abs(swung.tx - eye.tx) < 1e-6 && Math.hypot(swung.x - eye.x, swung.z - eye.z) > 3 && swung.y < eye.y, JSON.stringify({ eye, swung }));
  await b.evaluate(`document.querySelector('[data-racer="bc1gui"]').click(); document.querySelector('[data-mount="dino"]').click()`);
  const picked = await b.evaluate(`(() => { const B = window.__ooga, p = B.racers.player; return { player: p.name, mount: p.mount.id, lastOnGrid: p.rank === 7, others: B.racers.racers.filter((r) => r !== p).map((r) => r.mount.id).sort().join(","), targets: B.input.targetCount }; })()`);
  record("race garage: picking an Ooga and a ride seats them on the grid, the visitor last", picked.player === "bc1gui" && picked.mount === "dino" && picked.lastOnGrid && picked.others.includes("kart") && picked.others.includes("run") && picked.targets === garage.targets, JSON.stringify(picked));
  await b.key("Enter");
  await b.sleep(600);
  const countdown = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.race.phase, center: document.getElementById("race-center").textContent, stripShown: !document.getElementById("race-strip").hidden, garageHidden: document.getElementById("garage").hidden, running: B.racers.running, itemBtn: !document.getElementById("item-btn").hidden }; })()`);
  await b.sleep(3400);
  const going = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.race.phase, running: B.racers.running, lamps: B.track.lamps.map((l) => l.glow), subtitle: document.getElementById("subtitle").textContent }; })()`);
  record("race garage: Enter starts a countdown, then the lamps light and the race runs", countdown.phase === "countdown" && countdown.center === "3" && countdown.stripShown && countdown.garageHidden && !countdown.running && countdown.itemBtn && going.phase === "racing" && going.running && going.lamps.every((g) => g === 1) && going.subtitle.includes("Banana Bay"), JSON.stringify({ countdown, going }));
  await b.key("Escape");
  await b.sleep(100);
  const paused = await b.evaluate(`(() => { const B = window.__ooga; const t = B.racers.raceTime; return { phase: B.race.phase, pauseShown: !document.getElementById("race-pause").hidden, t }; })()`);
  await b.sleep(400);
  const still = await b.evaluate(`window.__ooga.racers.raceTime`);
  await b.evaluate(`document.querySelector('[data-action="race-resume"]').click()`);
  await b.sleep(400);
  const resumed = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.race.phase, t: B.racers.raceTime, pauseHidden: document.getElementById("race-pause").hidden }; })()`);
  record("race garage: Escape pauses the clock and Resume restarts it", paused.phase === "paused" && paused.pauseShown && still === paused.t && resumed.phase === "racing" && resumed.t > still && resumed.pauseHidden, JSON.stringify({ paused, still, resumed }));
  await b.evaluate(`document.querySelector('[data-action="garage"]').click()`);
  await b.sleep(200);
  const back = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.race.phase, garageShown: !document.getElementById("garage").hidden, stripHidden: document.getElementById("race-strip").hidden, speed: B.racers.player.speed }; })()`);
  record("race garage: the Garage button returns to the board and parks everyone", back.phase === "garage" && back.garageShown && back.stripHidden && back.speed === 0, JSON.stringify(back));
});

const raceTracks = ["race tracks", async (b) => {
  const built = await b.evaluate(`(() => { const B = window.__ooga, T = window.BL.raceTrack, out = {}; for (const def of T.TRACKS) { const t0 = performance.now(); document.querySelector('[data-track="' + def.id + '"]').click(); const ms = performance.now() - t0; const t = B.track, S = t.samples, n = t.count; let maxStep = 0, gapNearCheck = false; for (let i = 0; i < n; i++) { const q = (i + 1) % n; if (S.surface[i] !== T.SURF.gap && S.surface[q] !== T.SURF.gap) maxStep = Math.max(maxStep, Math.abs(S.y[q] - S.y[i])); } for (const c of t.checkpoints) for (let k = 0; k < 30; k++) if (S.surface[(c + k) % n] === T.SURF.gap) gapNearCheck = true; const faces = t.sectors.reduce((sum, s) => sum + s.nodes.road.geometry.faces.length + s.nodes.big.geometry.faces.length + s.nodes.small.geometry.faces.length, 0); const h0 = t.heightAt(t.grid[0].x, t.grid[0].z, -1); out[def.id] = { ms: Math.round(ms), samples: n, length: Math.round(t.length), sectors: t.sectors.length, chunks: t.terrainNodes.length, checkpoints: t.checkpoints.length, first: t.checkpoints[0], gapNearCheck, maxStep: +maxStep.toFixed(2), faces, bananas: t.spawns.bananas.length, crates: t.spawns.crates.length, pads: t.spawns.pads.length, map: t.mapPts.length, grid: t.grid.length, gridHeight: Math.abs(h0 - t.grid[0].y) < 1e-6, torches: t.torches.length, spectators: t.spectators.count, records: B.renderer.stats.records, sky: !!(t.renderOpts.horizon && t.renderOpts.zenith) }; } return out; })()`);
  for (const [id, t] of Object.entries(built)) {
    record(`race tracks: ${id} builds fast into culled sectors with checkpoints clear of its gaps`, t.ms < 900 && t.samples > 300 && t.length > 600 && t.sectors >= 12 && t.chunks > 20 && t.checkpoints === 8 && t.first === 0 && !t.gapNearCheck && t.maxStep < 0.8 && t.faces > 15000 && t.faces < 120000 && t.bananas >= 30 && t.crates >= 6 && t.pads >= 2 && t.map >= 100 && t.grid === 8 && t.gridHeight && t.spectators > 12 && t.records < 320, JSON.stringify(t));
  }
  record("race tracks: the two outdoor tracks carry a sky and the gorge lights its torches", built.bay.sky && built.peak.sky && !built.gorge.sky && built.gorge.torches >= 20 && built.bay.torches === 0, JSON.stringify({ bay: built.bay.sky, gorge: [built.gorge.sky, built.gorge.torches], peak: built.peak.sky }));
  const swapped = await b.evaluate(`(() => { const B = window.__ooga; const r0 = B.renderer.stats.records; document.querySelector('[data-track="bay"]').click(); B.housekeep(); const r1 = B.renderer.stats.records; return { r0, r1, nodes: B.stats().allNodes }; })()`);
  record("race tracks: switching tracks releases the old track's GPU records", swapped.r1 <= swapped.r0 + 5 && swapped.nodes < 900, JSON.stringify(swapped));
}];

// Park the other racers far away and frozen, and stand the visitor on a checkpoint facing down the road
const isolate = (checkpoint) => `(() => { const B = window.__ooga, R = B.racers, t = B.track, S = t.samples, p = R.player; for (const r of R.racers) if (r !== p) { r.x += 1000; r.z += 1000; r.respawn = 1e9; } const i = t.checkpoints[${checkpoint}]; p.respawn = 0; p.invuln = 0; p.x = S.x[i]; p.z = S.z[i]; p.idx = i; p.y = p.ground = t.slabY(i, 0, 0); p.heading = p.motionHeading = Math.atan2(S.tx[i], S.tz[i]); p.speed = 0; p.airborne = false; p.vy = 0; p.drift.active = false; p.boost = 0; return i; })()`;
const racePhysics = ["race physics", async (b) => {
  const drive = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers; B.race.startRace(); B.race.simulate(4); R.start(); const p = R.player; ${isolate(1)}; R.setInput(p, 0, 1, false, false); B.race.simulate(3); const a = { speed: p.speed, progress: p.progress, started: p.started, checkpoint: p.checkpoint }; R.setInput(p, 0, -1, false, false); B.race.simulate(2); const stopped = p.speed; return { ...a, stopped, top: p.mount.top }; })()`);
  record("race physics: throttle accelerates toward the ride's top speed and the brake stops it", drive.speed > drive.top * 0.8 && drive.speed <= drive.top + 0.01 && drive.stopped < 1 && drive.stopped >= -drive.top * 0.3 - 0.01, JSON.stringify(drive));
  const drift = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, p = R.player; ${isolate(1)}; const tiers = []; R.events.onDrift = (r, tier) => tiers.push(tier); p.speed = p.mount.top; R.setInput(p, 0, 1, false, false); B.race.simulate(0.3); const h0 = p.heading; R.setInput(p, 1, 1, true, false); B.race.simulate(1.1); const mid = { active: p.drift.active, dir: p.drift.dir, charge: +p.drift.charge.toFixed(2), turned: Math.abs(p.heading - h0) > 0.4, offset: +Math.abs(Math.atan2(Math.sin(p.motionHeading - p.heading), Math.cos(p.motionHeading - p.heading))).toFixed(2) }; R.setInput(p, 0, 1, false, false); const t = B.track, S = t.samples; const centre = () => { p.x -= t.rightX(p.idx) * p.lateral; p.z -= t.rightZ(p.idx) * p.lateral; p.heading = p.motionHeading = Math.atan2(S.tx[p.idx], S.tz[p.idx]); }; centre(); B.race.simulate(0.05); const released = { active: p.drift.active, boost: +p.boost.toFixed(2), tiers }; let boosted = 0; for (let k = 0; k < 90; k++) { centre(); B.race.simulate(1 / 120); boosted = Math.max(boosted, p.speed); } for (let k = 0; k < 360; k++) { centre(); B.race.simulate(1 / 120); } return { mid, released, boosted, top: p.mount.top, settled: p.speed, respawned: p.respawn > 0 }; })()`);
  record("race physics: holding Space through a turn drifts, charges and releases a tiered boost", drift.mid.active && drift.mid.dir === 1 && drift.mid.charge > 1 && drift.mid.turned && drift.mid.offset > 0.25 && !drift.released.active && drift.released.boost > 0 && drift.released.tiers.includes(2) && drift.boosted > drift.top * 1.05 && drift.settled <= drift.top + 0.01 && !drift.respawned, JSON.stringify(drift));
  const hop = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, p = R.player; ${isolate(2)}; R.setInput(p, 0, 1, false, false); B.race.simulate(0.5); R.setInput(p, 0, 1, true, false); B.race.simulate(1 / 60); const air = p.airborne; let maxY = 0; for (let i = 0; i < 60; i++) { B.race.simulate(1 / 120); maxY = Math.max(maxY, p.y - p.ground); } R.setInput(p, 0, 1, false, false); B.race.simulate(1); return { air, maxY: +maxY.toFixed(2), landed: !p.airborne }; })()`);
  record("race physics: tapping Space hops and lands", hop.air && hop.maxY > 0.15 && hop.landed, JSON.stringify(hop));
  const steer = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, p = R.player, t = B.track; ${isolate(2)}; p.speed = 14; const h0 = p.heading; R.setInput(p, 1, 1, false, false); B.race.simulate(0.6); const right = { dh: p.heading - h0, lateral: p.lateral }; ${isolate(2)}; p.speed = 14; R.setInput(p, -1, 1, false, false); B.race.simulate(0.6); const left = { dh: p.heading - h0, lateral: p.lateral }; ${isolate(1)}; const i = p.idx, lat = t.halfAt(i) + 0.25; p.x = t.samples.x[i] + t.rightX(i) * lat; p.z = t.samples.z[i] + t.rightZ(i) * lat; p.y = p.ground = t.heightAt(p.x, p.z, i); p.speed = 18; R.setInput(p, 0, 1, false, false); let maxAir = 0, onCurb = 0; for (let k = 0; k < 300; k++) { B.race.simulate(1 / 120); if (p.airborne) maxAir = Math.max(maxAir, p.y - p.ground); if (Math.abs(p.lateral) > t.halfAt(p.idx) && Math.abs(p.lateral) < t.halfAt(p.idx) + 0.55) onCurb++; } return { right, left, maxAir: +maxAir.toFixed(2), onCurb }; })()`);
  record("race physics: steering right goes right, left goes left, and a rumble strip never throws the racer", steer.right.dh < -0.1 && steer.right.lateral > 0.5 && steer.left.dh > 0.1 && steer.left.lateral < -0.5 && steer.onCurb > 30 && steer.maxAir < 0.25, JSON.stringify(steer));
  const wrong = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, p = R.player; ${isolate(3)}; const flags = []; R.events.onWrongWay = (r, on) => flags.push(on); p.heading = p.motionHeading = p.heading + Math.PI; R.setInput(p, 0, 1, false, false); B.race.simulate(2); const wrong = p.wrong; p.heading = p.motionHeading = p.heading + Math.PI; B.race.simulate(2); return { wrong, right: !p.wrong, flags, notice: document.getElementById("race-notice").hidden }; })()`);
  record("race physics: driving against the track flags wrong way and turning round clears it", wrong.wrong && wrong.right && flags(wrong.flags), JSON.stringify(wrong));
  const wall = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, T = window.BL.raceTrack; document.querySelector('[data-track="gorge"]').click(); B.race.startRace(); B.race.simulate(4); R.start(); const p = R.player, t = B.track, S = t.samples; ${isolate(0)}; let i = t.checkpoints[0] + 20; while (S.wall[i] !== 3) i++; p.x = S.x[i]; p.z = S.z[i]; p.idx = i; p.y = p.ground = t.slabY(i, 0, 0); p.heading = p.motionHeading = Math.atan2(S.tx[i], S.tz[i]) + 0.5; R.setInput(p, 0, 1, false, false); let maxLat = 0, minSpeed = 99, hits = 0; for (let k = 0; k < 360; k++) { B.race.simulate(1 / 120); maxLat = Math.max(maxLat, Math.abs(p.lateral)); if (p.speed > 6) minSpeed = Math.min(minSpeed, p.speed); if (p.wallHit > 0) hits++; } return { wall: S.wall[p.idx], maxLat: +maxLat.toFixed(2), limit: +(t.halfAt(p.idx) + T.CURB_W).toFixed(2), hits, respawned: p.respawn > 0, progressed: p.progress > S.dist[i] + 5 }; })()`);
  record("race physics: a walled track bumps the racer back onto the ribbon instead of letting him fall", wall.wall > 0 && wall.maxLat <= wall.limit + 0.05 && wall.hits > 0 && !wall.respawned && wall.progressed, JSON.stringify(wall));
  const fall = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, T = window.BL.raceTrack; document.querySelector('[data-track="bay"]').click(); B.race.startRace(); B.race.simulate(4); R.start(); const p = R.player, t = B.track, S = t.samples; ${isolate(0)}; const whys = []; R.events.onRespawn = (r, why) => whys.push(why); const i = t.checkpoints[3]; const off = t.halfAt(i) + T.CURB_W + T.SHOULDER + T.FALL + 1; p.x = S.x[i] + t.rightX(i) * off; p.z = S.z[i] + t.rightZ(i) * off; p.idx = i; p.checkpoint = 3; p.started = true; B.race.simulate(0.2); const at = { respawn: p.respawn > 0, x: p.x, z: p.z, cx: S.x[t.checkpoints[2]], cz: S.z[t.checkpoints[2]], speed: p.speed }; B.race.simulate(1.5); let gi = -1; for (let k = 0; k < t.count; k++) if (S.surface[k] === T.SURF.gap) { gi = k; break; } const before = (gi - 2 + t.count) % t.count; p.x = S.x[before]; p.z = S.z[before]; p.idx = before; p.y = p.ground = t.slabY(before, 0, 0); p.heading = p.motionHeading = Math.atan2(S.tx[before], S.tz[before]); p.speed = 4; R.setInput(p, 0, 1, false, false); B.race.simulate(2); return { ...at, whys, gapHazard: t.hazard }; })()`);
  record("race physics: leaving the shoulder respawns at the last checkpoint and a slow jump ends in the water", fall.respawn && Math.abs(fall.x - fall.cx) < 0.01 && Math.abs(fall.z - fall.cz) < 0.01 && fall.speed === 0 && fall.whys[0] === "fell" && fall.whys[1] === "water", JSON.stringify(fall));
  const jump = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, T = window.BL.raceTrack, p = R.player, t = B.track, S = t.samples; const whys = []; R.events.onRespawn = (r, why) => whys.push(why); let gi = -1; for (let k = 0; k < t.count; k++) if (S.surface[k] === T.SURF.gap) { gi = k; break; } const before = (gi - 24 + t.count) % t.count; p.respawn = 0; p.x = S.x[before]; p.z = S.z[before]; p.idx = before; p.y = p.ground = t.slabY(before, 0, 0); p.heading = p.motionHeading = Math.atan2(S.tx[before], S.tz[before]); p.speed = p.mount.top; p.boost = 0; R.setInput(p, 0, 1, false, false); let air = 0, maxAir = 0, rows = []; for (let k = 0; k < 360; k++) { if (!p.airborne) { p.x -= B.track.rightX(p.idx) * p.lateral; p.z -= B.track.rightZ(p.idx) * p.lateral; p.heading = p.motionHeading = Math.atan2(S.tx[p.idx], S.tz[p.idx]); } B.race.simulate(1 / 120); if (p.airborne) { air++; maxAir = Math.max(maxAir, p.y - p.ground); } if (k % 12 === 0) rows.push([p.idx, +p.lateral.toFixed(1), +p.y.toFixed(1), p.airborne ? 1 : 0, +p.speed.toFixed(0)].join("/")); } return { air, maxAir: +maxAir.toFixed(2), whys, landedPast: p.idx > gi + 2 && p.idx < gi + 60, rows: rows.slice(0, 20) }; })()`);
  record("race physics: a fast racer launches off the lip and clears the gap", jump.air > 20 && jump.whys.length === 0 && jump.landedPast, JSON.stringify(jump));
}];
const flags = (list) => list.length === 2 && list[0] === true && list[1] === false;

const raceItems = () => withPage("race items", racePage(src), async (b) => {
  const pick = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, I = B.items; B.race.startRace(); B.race.simulate(4); R.start(); const p = R.player; const banana = I.bananas[0]; p.x = banana.x; p.z = banana.z; p.y = banana.y; p.idx = B.track.nearest(p.x, p.z, -1); B.race.simulate(1 / 60); const one = { bananas: p.bananas, hidden: !banana.node.visible, taken: banana.taken > 0 }; for (let k = 0; k < 12; k++) { const bb = I.bananas[k % I.bananas.length]; bb.taken = 0; bb.node.visible = true; p.x = bb.x; p.z = bb.z; p.y = bb.y; B.race.simulate(1 / 60); } const full = { bananas: p.bananas, meterFull: p.meterFull, max: I.METER_MAX }; p.speed = 5; I.use(p); B.race.simulate(1 / 60); const spent = { bananas: p.bananas, meterFull: p.meterFull, boost: p.boost > 0 }; const crate = I.crates[0]; p.x = crate.x; p.z = crate.z; p.y = crate.y; B.race.simulate(1 / 60); return { one, full, spent, item: p.item, crateHidden: !crate.node.visible }; })()`);
  await b.sleep(3800);
  pick.itemShown = await b.evaluate(`document.getElementById("race-item").dataset.item`);
  record("race items: bananas fill a ten-segment turbo meter, spending it boosts, and a crate hands out an item", pick.one.bananas === 1 && pick.one.hidden && pick.one.taken && pick.full.bananas === pick.full.max && pick.full.meterFull && pick.spent.bananas === 0 && !pick.spent.meterFull && pick.spent.boost && ["rock", "peel", "turbo", "shout"].includes(pick.item) && pick.crateHidden && pick.itemShown === pick.item, JSON.stringify(pick));
  const rock = await b.evaluate(`(() => { const B = window.__ooga, R = B.racers, I = B.items, p = R.player, S = B.track.samples; const hits = []; I.events.onHit = (r, by, kind) => hits.push([r.name, by && by.name, kind]); const victim = R.racers.find((r) => r !== p); const i = B.track.checkpoints[1]; p.x = S.x[i]; p.z = S.z[i]; p.idx = i; p.y = p.ground = B.track.slabY(i, 0, 0); p.heading = p.motionHeading = Math.atan2(S.tx[i], S.tz[i]); p.speed = 0; victim.x = S.x[i + 6]; victim.z = S.z[i + 6]; victim.idx = i + 6; victim.y = victim.ground = B.track.slabY(i + 6, 0, 0); victim.speed = 0; victim.heading = victim.motionHeading = p.heading; victim.invuln = 0; for (const r of R.racers) if (r !== p && r !== victim) { r.x += 200; r.z += 200; } p.item = "rock"; I.use(p); const thrown = I.rocks.filter((r) => r.live).length; B.race.simulate(1.2); const spun = victim.spin > 0 || hits.length > 0; for (let k = 0; k < 20; k++) { p.item = "rock"; I.use(p); } const live = I.rocks.filter((r) => r.live).length; p.item = "peel"; I.use(p); const peel = I.peels.find((q) => q.live); const other = R.racers.find((r) => r !== p && r !== victim); other.x = peel.x; other.z = peel.z; other.y = other.ground = peel.y; other.idx = B.track.nearest(other.x, other.z, -1); other.invuln = 0; other.spin = 0; other.speed = 5; B.race.simulate(1 / 60); const peeled = other.spin > 0; p.item = "shout"; victim.spin = 0; victim.invuln = 0; victim.x = p.x + 3; victim.z = p.z; I.use(p); const shouted = victim.spin > 0; return { thrown, spun, hits: hits.slice(0, 3), live, cap: window.BL.raceItems.ROCK_CAP, peeled, shouted, skidCap: window.BL.raceItems.SKID_CAP }; })()`);
  record("race items: a thrown rock spins the racer ahead, a peel spins whoever drives over it, a shout spins the neighbours, and the pools stay capped", rock.thrown === 1 && rock.spun && rock.hits[0] && rock.hits[0][2] === "rock" && rock.live <= rock.cap && rock.peeled && rock.shouted, JSON.stringify(rock));
});

const raceAi = ["race AI", async (b) => {
  const results = {};
  for (const id of ["bay", "gorge", "peak"]) {
    results[id] = await b.evaluate(`(() => { const t0 = performance.now(); const phase = ${autoRace(id, 160)}; const B = window.__ooga; return { phase, ms: Math.round(performance.now() - t0), racers: B.racers.racers.map((r) => ({ n: r.name, m: r.mount.id, fin: r.finished, t: +r.finishTime.toFixed(1), best: +r.bestLap.toFixed(1), rank: r.rank })), ranks: [...B.racers.racers.map((r) => r.rank)].sort((a, c) => a - c).join(","), mounts: new Set(B.racers.racers.map((r) => r.mount.id)).size, rocks: B.items.rocks.filter((r) => r.live).length, skids: B.items.skids.filled }; })()`);
    const r = results[id];
    const times = r.racers.map((x) => x.t);
    record(`race AI: on ${id} every racer finishes three laps in a close pack`, r.racers.every((x) => x.fin && x.t > 50 && x.t < 160 && x.best > 15 && x.best < 60) && r.ranks === "1,2,3,4,5,6,7" && Math.max(...times) - Math.min(...times) < 40 && r.mounts === 3 && r.ms < 4000, JSON.stringify(r));
  }
  const rank = await b.evaluate(`(() => { const B = window.__ooga; const byTime = [...B.racers.racers].sort((a, c) => a.finishTime - c.finishTime).map((r) => r.rank).join(","); return byTime; })()`);
  record("race AI: finishing order matches finishing time", rank === "1,2,3,4,5,6,7", rank);
}];

const raceResults = () => withPage("race results", racePage(src), async (b) => {
  const done = await b.evaluate(`(() => { const B = window.__ooga; ${autoRace("bay", 120)}; B.race.finishRace(); const p = B.racers.player; return { phase: B.race.phase, shown: !document.getElementById("race-results").hidden, rows: document.querySelectorAll("#race-podium li").length, you: document.querySelector("#race-podium li.you") && document.querySelector("#race-podium li.you").textContent, summary: document.getElementById("race-summary").textContent, best: B.game.state.race.best.bay, race: Math.round(p.finishTime * 1000), lap: Math.round(p.bestLap * 1000), stored: JSON.parse(localStorage.getItem("oogaboogaland.v1")).race.best.bay, medal: document.querySelector('[data-track="bay"] .garage-medal').textContent, itemBtnHidden: document.getElementById("item-btn").hidden }; })()`);
  record("race results: the podium lists everyone, marks the visitor and saves the best times", done.phase === "finished" && done.shown && done.rows === 7 && done.you && done.you.includes("(you)") && /(1st|2nd|3rd|[4-7]th)/.test(done.summary) && done.best.race === done.race && done.best.lap === done.lap && done.stored.race === done.race && done.medal !== "NEW" && done.itemBtnHidden, JSON.stringify(done));
  const projected = await b.evaluate(`(() => { const B = window.__ooga; B.race.toGarage(); ${autoRace("bay", 40)}; B.race.finishRace(); const rows = () => [...document.querySelectorAll("#race-podium li span:last-child")].map((e) => e.textContent); const early = rows(); B.race.simulate(100); return { early, later: rows(), finished: B.racers.racers.every((r) => r.finished) }; })()`);
  record("race results: unfinished racers show projected times that turn real as they cross the line", projected.early.length === 7 && projected.early.some((t) => t.startsWith("≈")) && projected.early.every((t) => /\d:\d\d\.\d\d/.test(t)) && projected.finished && projected.later.every((t) => !t.startsWith("≈")), JSON.stringify(projected));
  await b.evaluate(`document.querySelector('#race-results [data-action="race-again"]').click()`);
  await b.sleep(200);
  const again = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.race.phase, resultsHidden: document.getElementById("race-results").hidden, lap: B.racers.player.lap, finished: B.racers.player.finished }; })()`);
  record("race results: Race again restarts from the countdown", again.phase === "countdown" && again.resultsHidden && again.lap === 1 && !again.finished, JSON.stringify(again));
  await b.evaluate(`(() => { const B = window.__ooga; const bad = JSON.parse(localStorage.getItem("oogaboogaland.v1")); bad.race.best.gorge = { lap: -5, race: "x" }; bad.race.best["a-very-long-track-name-here"] = { lap: 1000, race: 2000 }; localStorage.setItem("oogaboogaland.v1", JSON.stringify(bad)); })()`);
  await b.open(racePage(src));
  await b.sleep(2500);
  const reloaded = await b.evaluate(`(() => { const B = window.__ooga; return { keys: Object.keys(B.game.state.race.best).join(","), medal: document.querySelector('[data-track="bay"] .garage-medal').textContent, note: document.querySelector('[data-track="bay"] .garage-note').textContent }; })()`);
  record("race results: best times survive a reload and malformed entries are dropped", reloaded.keys === "bay" && reloaded.medal !== "NEW" && reloaded.note.startsWith("best "), JSON.stringify(reloaded));
});

const raceCup = () => withPage("race cup", racePage(src, "rain=0"), async (b) => {
  const first = await b.evaluate(`(() => { const B = window.__ooga; ${autoRace("gorge", 130)}; B.racers.player.rank = 2; B.race.finishRace(); return { track: B.track.id, next: !document.getElementById("race-next").hidden, label: document.getElementById("race-next").textContent, rank: B.racers.player.rank }; })()`);
  await b.evaluate(`document.getElementById("race-next").click()`);
  await b.sleep(300);
  const hopped = await b.evaluate(`(() => { const B = window.__ooga; return { track: B.track.id, phase: B.race.phase }; })()`);
  record("race cup: a podium finish offers the next track and it starts straight into the countdown", first.track === "gorge" && first.rank <= 3 && first.next && first.label === "Next track" && hopped.track === "peak" && hopped.phase === "countdown", JSON.stringify({ first, hopped }));
  const cup = await b.evaluate(`(() => { const B = window.__ooga; B.race.toGarage(); document.querySelector('[data-action="cup-start"]').click(); const rounds = []; for (let round = 0; round < 3; round++) { B.race.simulate(3.4); B.racers.autopilot = true; B.racers.start(); B.race.simulate(150); B.race.finishRace(); rounds.push({ track: B.track.id, round: B.race.cup.round, active: B.race.cup.active, done: B.race.cup.done, note: document.getElementById("race-cup-note").textContent, standings: document.querySelectorAll("#race-standings li").length, top: document.querySelector("#race-standings li span:last-child").textContent, next: !document.getElementById("race-next").hidden, summary: document.getElementById("race-summary").textContent }); if (round < 2) document.getElementById("race-next").click(); } const points = Array.from(B.race.cup.points); return { rounds, points, total: points.reduce((a, c) => a + c, 0), saved: B.game.state.race.cup, badge: document.getElementById("garage-cup").hidden }; })()`);
  const r = cup.rounds;
  record("race cup: three tracks in order with points, standings on every podium and a final cup", r.map((x) => x.track).join(",") === "bay,gorge,peak" && r[0].note.includes("race 1 of 3") && r[0].next && r[0].standings === 7 && r[0].top.endsWith("pts") && r[1].note.includes("race 2 of 3") && r[2].done && !r[2].active && !r[2].next && r[2].note === "Cup final" && /Cup: (1st|2nd|3rd|[4-7]th) with \d+ points/.test(r[2].summary) && cup.total === 3 * 38 && cup.points.every((p) => p >= 6), JSON.stringify(cup));
  await b.evaluate(`document.querySelector('#race-results [data-action="garage"]').click()`);
  await b.sleep(200);
  const garage = await b.evaluate(`(() => { const B = window.__ooga; const badge = document.getElementById("garage-cup"); return { saved: B.game.state.race.cup, badgeHidden: badge.hidden, badge: badge.textContent, stored: JSON.parse(localStorage.getItem("oogaboogaland.v1")).race.cup }; })()`);
  record("race cup: a podium cup finish is saved and shown in the garage", (garage.saved === null && garage.badgeHidden) || (garage.saved && ["gold", "silver", "bronze"].includes(garage.saved.medal) && !garage.badgeHidden && garage.badge.includes("CUP") && garage.stored.medal === garage.saved.medal), JSON.stringify(garage));
});

const raceWeather = () => withPage("race weather", racePage(src, "rain=1"), async (b) => {
  const wet = await b.evaluate(`(() => { const B = window.__ooga, T = window.BL.raceTrack; const out = {}; for (const id of ["bay", "gorge", "peak"]) { document.querySelector('[data-track="' + id + '"]').click(); const t = B.track; out[id] = { wet: t.wet, kind: t.precipitation, slip: +t.slipAt(T.SURF.road).toFixed(2), board: +t.slipAt(T.SURF.board).toFixed(2), ice: +t.slipAt(T.SURF.ice).toFixed(2), fogNear: t.renderOpts.fogNear, direct: +t.renderOpts.directStrength.toFixed(2), weather: B.weather, subtitle: document.getElementById("subtitle").textContent }; } return out; })()`);
  record("race weather: a forced wet load rains on the bay, snows on the peak and stays dry in the gorge", wet.bay.wet && wet.bay.kind === "rain" && wet.bay.weather && wet.bay.weather.count > 100 && wet.peak.kind === "snow" && wet.peak.weather.kind === "snow" && !wet.gorge.wet && wet.gorge.weather === null && wet.bay.subtitle.includes("rain"), JSON.stringify(wet));
  record("race weather: wet tarmac and boards slide more while ice stays ice, under a dimmer, closer sky", wet.bay.slip > 0.3 && wet.bay.board > 0.3 && wet.bay.ice === 1 && wet.gorge.slip === 0 && wet.bay.fogNear < 60 && wet.bay.direct < 0.6, JSON.stringify(wet));
  const drops = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; document.querySelector('[data-track="bay"]').click(); B.race.startRace(); const node = window.BL.scenes.race.root.children.find((n) => n.instanceData && n.instanceCount === B.weather.count); const v0 = node.instanceVersion, y0 = node.instanceData[13]; const start = B.renderedFrames; const tick = () => { if (B.renderedFrames >= start + 12) resolve({ found: !!node, moved: node.instanceVersion > v0 + 5 && node.instanceData[13] !== y0, cap: node.instanceData.length / 20, fixed: node.fixedInstanceCapacity === true }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("race weather: the rain is one fixed-capacity batch that falls every frame", drops.found && drops.moved && drops.cap >= 100 && drops.fixed, JSON.stringify(drops));
  await b.open(racePage(src, "rain=0"));
  await b.sleep(2500);
  const dry = await b.evaluate(`(() => { const B = window.__ooga; return { wet: B.track.wet, weather: B.weather, slip: B.track.slipAt(window.BL.raceTrack.SURF.road) }; })()`);
  record("race weather: rain=0 forces a dry track", !dry.wet && dry.weather === null && dry.slip === 0, JSON.stringify(dry));
});

const raceAudio = () => withPage("race audio", racePage(src), async (b) => {
  const before = await b.evaluate(`(() => { const A = window.__ooga.audio; return { ready: A.ready, context: !!A.context }; })()`);
  await b.click(720, 450);
  await b.sleep(200);
  const after = await b.evaluate(`(() => { const A = window.__ooga.audio; for (const name of Object.keys(A.cues)) A.cues[name](1); A.state.speed = 20; A.state.mount = "kart"; A.update(1 / 60); A.state.mount = "dino"; A.update(1 / 60); A.state.mount = "run"; A.update(1 / 60); return { ready: A.ready, state: A.context.state, voices: A.voices, cues: Object.keys(A.cues).length, muted: A.muted }; })()`);
  await b.key("m");
  await b.sleep(100);
  const muted = await b.evaluate(`(() => { const A = window.__ooga.audio; return { muted: A.muted, pressed: document.getElementById("race-mute").getAttribute("aria-pressed"), stored: localStorage.getItem("oogaboogaland.audio") }; })()`);
  await b.key("m");
  await b.evaluate(`window.__ooga.go("hub")`);
  await b.sleep(900);
  const left = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, audio: B.audio === undefined }; })()`);
  record("race audio: silent until a real gesture, then a running context with a fixed voice pool and every cue playable", !before.ready && !before.context && after.ready && after.state === "running" && after.voices === 8 && after.cues >= 20 && !after.muted, JSON.stringify({ before, after }));
  record("race audio: M mutes, remembers it, and leaving the cave closes the context", muted.muted && muted.pressed === "true" && muted.stored === "off" && left.scene === "hub" && left.audio, JSON.stringify({ muted, left }));
});

const raceCanvas = () => withPage("race canvas", racePage(src, "canvas2d=1"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga; document.querySelector('[data-track="gorge"]').click(); B.race.startRace(); B.racers.autopilot = true; return { kind: B.renderer.kind, faces: B.track.sectors.reduce((sum, s) => sum + s.nodes.big.geometry.faces.length + s.nodes.small.geometry.faces.length, 0) }; })()`);
  await b.sleep(3800);
  const frames = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + 30 || performance.now() - t0 > 6000) resolve({ frames: B.renderedFrames - start, phase: B.race.phase, speed: B.racers.player.speed }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("race canvas: the Canvas 2D fallback runs a race with a lighter decor budget", r.kind === "canvas2d" && frames.phase === "racing" && frames.speed > 3 && r.faces < 20000 && frames.frames >= 30, JSON.stringify({ ...r, ...frames }));
});

const racePhone = () => withPage("race phone", racePage(src), async (b) => {
  const garage = await b.evaluate(`(() => { const g = document.getElementById("garage").getBoundingClientRect(); return { fits: g.bottom <= window.innerHeight && g.width <= window.innerWidth, columns: getComputedStyle(document.querySelector(".garage-columns")).gridTemplateColumns.split(" ").length, help: document.getElementById("garage-help").textContent }; })()`);
  await b.evaluate(`document.querySelector('[data-action="race-start"]').click()`);
  await b.sleep(4200);
  const race = await b.evaluate(`(() => { const B = window.__ooga; const act = document.getElementById("act"), item = document.getElementById("item-btn"), strip = document.querySelector(".race-hud-right").getBoundingClientRect(); return { phase: B.race.phase, act: !act.hidden && act.textContent, item: !item.hidden && item.textContent, stripFits: strip.right <= window.innerWidth && strip.left >= 0, sticks: getComputedStyle(document.getElementById("joy-move")).display, speedHidden: getComputedStyle(document.querySelector(".race-speed")).display === "none" }; })()`);
  await b.evaluate(isolate(0));
  const stick = await b.evaluate(`(() => { const r = document.getElementById("joy-move").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const heading = () => b.evaluate("window.__ooga.racers.player.heading");
  const h0 = await heading();
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: stick.x, y: stick.y }] });
  for (let i = 1; i <= 6; i++) {
    await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: stick.x + i * 6, y: stick.y }] });
    await b.sleep(100);
  }
  await b.sleep(900);
  const moved = await b.evaluate(`(() => { const p = window.__ooga.racers.player; return { heading: p.heading, speed: p.speed }; })()`);
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  record("race phone: the garage stacks, the race shows Drift and Throw buttons, and the stick steers an auto-accelerating racer", garage.fits && garage.columns === 1 && garage.help.includes("stick") && race.phase === "racing" && race.act === "Drift" && race.item && race.stripFits && race.sticks === "block" && moved.speed > 3 && moved.heading < h0 - 0.1, JSON.stringify({ garage, race, h0, moved }));
}, { w: 390, h: 844, mobile: true });

// Page code for the hub cave routes checks: routes that must not enter a cave scene
const caveRoutingRejections = async () => {
  const B = window.__ooga, o = B.pilot.orbit, cases = [];
  const wait = () => new Promise((resolve) => { const frame = B.renderedFrames, tick = () => B.scene !== "hub" || B.renderedFrames >= frame + 5 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
  for (const id of ["c11", "c9"]) {
    const m = B.mouths.find((mouth) => mouth.id === id), sr = Math.sin(m.ry), cr = Math.cos(m.ry), cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build);
    const place = (x, y, z, overhead = false) => {
      const p = cave.root.position; p.x = x; p.y = cave.baseY + y; p.z = z; cave.hop = cave.hopV = 0;
      const target = { x, y: y + 0.9, z }; o.target = target; o.tx = x; o.ty = target.y; o.tz = z;
      o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = overhead ? Math.PI / 2 - 0.05 : 0.3; o.dist = o.tDist = overhead ? 10 : 4;
      B.pilot.update(0.1);
    };
    const sample = (name) => {
      const p = cave.root.position, eye = B.camera.position, space = { caveIndex: 0, floor: 0, ceiling: 0 }, cavity = B.island.cavityAt(eye.x, eye.z, space);
      return { id, name, scene: B.scene, playerIndex: B.cameraCave.playerIndex, actorY: p.y - cave.baseY, ground: B.island.surfaceAt(p.x, p.z), atTrigger: Math.hypot(p.x - m.inside.x, p.z - m.inside.z) < 0.001, cameraY: eye.y, cameraCavity: cavity ? space.caveIndex : 0, ceiling: Number.isFinite(space.ceiling) ? space.ceiling : null };
    };
    B.crew.control(cave); place(m.inside.x, B.island.surfaceAt(m.inside.x, m.inside.z), m.inside.z); await wait();
    cases.push(sample("actor-on-roof")); if (B.scene !== "hub") return cases;
    B.crew.release(); await wait(); B.crew.control(cave); place(m.inside.x, m.floorY, m.inside.z); await wait();
    cases.push(sample("inside-without-crossing")); if (B.scene !== "hub") return cases;
    B.crew.release(); await wait(); B.crew.control(cave);
    for (const z of [1.2, 0.7, 0.4, -0.5, -1.5]) { place(m.x + sr * z, m.floorY, m.z + cr * z, true); await wait(); if (B.scene !== "hub") return cases; }
    place(m.inside.x, m.floorY, m.inside.z, true); await wait();
    cases.push(sample("camera-above-admitted-actor")); if (B.scene !== "hub") return cases;
    B.crew.release(); await wait();
  }
  B.pilot.goPreset("pile"); await wait();
  return cases;
};

const hubRace = () => withPage("hub race route", hubPage(src), async (b) => {
  await b.evaluate(`window.__ooga.pilot.goPreset("race")`);
  await b.sleep(1200);
  const mouth = await b.evaluate(`(() => { const B = window.__ooga, sameModel = (geometry, model) => !!geometry && geometry.verts === model.verts && geometry.faces.length === model.faces.length && geometry.faces.every((face, index) => { const original = model.faces[index]; return face.i.length === original.i.length && face.i.every((vertex, i) => vertex === original.i[i]) && face.color.length === original.color.length && face.color.every((channel, i) => channel === original.color[i]) && face.emissive === original.emissive; }); const m = B.mouths.find((m) => m.id === "c9"); const p = B.project(m.x, 2, m.z); const hit = B.input.pick(p.x, p.y); return { x: Math.round(p.x), y: Math.round(p.y), kind: hit && hit.owner.kind, slot: hit && hit.owner.slot && hit.owner.slot.id, status: hit && hit.owner.slot && hit.owner.slot.status, label: B.labels.some((l) => l.text === "Ooga Rally"), torches: B.entranceLights.filter((l) => l.caveId === "c9").length, wheels: (() => { let n = 0; const wheel = window.BL.raceModels.kartWheel(); const walk = (node) => { if (sameModel(node.geometry, wheel)) n++; for (const c of node.children) walk(c); }; walk(window.BL.scenes.hub.root); return n; })(), shelves: (() => { let n = 0; const shelf = window.BL.hubModels.caveShelves(); const walk = (node) => { if (sameModel(node.geometry, shelf)) n++; for (const c of node.children) walk(c); }; walk(window.BL.scenes.hub.root); return n; })() }; })()`);
  await b.click(mouth.x, mouth.y);
  await b.sleep(1600);
  const entered = await b.evaluate(`({ scene: window.__ooga.scene, phase: window.__ooga.race.phase, garage: !document.getElementById("garage").hidden })`);
  record("hub race route: the Ooga Rally cave is lit, signed and tapping it enters the garage", mouth.kind === "cave" && mouth.slot === "c9" && mouth.status === "open" && mouth.label && mouth.torches === 3 && mouth.wheels === 9 && mouth.shelves === 2 && entered.scene === "race" && entered.phase === "garage" && entered.garage, JSON.stringify({ ...mouth, ...entered }));
  await b.key("Escape");
  await b.sleep(900);
  const back = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { scene: B.scene, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), raceHidden: document.getElementById("race").hidden, garageBtnHidden: document.getElementById("race-garage-btn").hidden }; })()`);
  record("hub race route: Escape in the garage returns to the hub landing view with the race HUD hidden", back.scene === "hub" && back.toPile < 0.5 && back.raceHidden && back.garageBtnHidden, JSON.stringify(back));
  const rejectedRoutes = await b.evaluate(`(${caveRoutingRejections.toString()})()`);
  record("hub cave routes: neither standing above an open cave nor occupying its interior without crossing enters its scene", rejectedRoutes.length === 6 && rejectedRoutes.every((r) => r.scene === "hub") && rejectedRoutes.filter((r) => r.name === "actor-on-roof").every((r) => r.atTrigger && r.actorY >= r.ground && r.actorY > 3 && r.playerIndex === 0) && rejectedRoutes.filter((r) => r.name === "inside-without-crossing").every((r) => r.atTrigger && Math.abs(r.actorY) < 0.001 && r.playerIndex === 0), JSON.stringify(rejectedRoutes));
  record("hub cave routes: an admitted Ooga at an inner trigger cannot route through a camera view above the roof", rejectedRoutes.filter((r) => r.name === "camera-above-admitted-actor").length === 2 && rejectedRoutes.filter((r) => r.name === "camera-above-admitted-actor").every((r) => r.scene === "hub" && r.atTrigger && Math.abs(r.actorY) < 0.001 && r.playerIndex > 0 && r.cameraCavity === r.playerIndex && r.ceiling !== null && r.cameraY >= r.ceiling), JSON.stringify(rejectedRoutes));
  await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const m = B.mouths.find((m) => m.id === "c9"), o = B.pilot.orbit; B.crew.control(cave); cave.root.position.x = m.apron.x; cave.root.position.z = m.apron.z; cave.root.position.y = cave.baseY; cave.hop = 0; cave.root.rotation.y = Math.PI - m.angle + Math.PI; o.tYaw = o.yaw = m.angle + Math.PI; o.tPitch = o.pitch = 0.25; o.tDist = o.dist = 4; })()`);
  await b.sleep(300);
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "w", text: "w" });
  const walked = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { if (B.scene === "race" || performance.now() - t0 > 6000) resolve({ scene: B.scene, ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }; tick(); })`);
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "w" });
  record("hub race route: walking a driven Ooga into the cave enters the race", walked.scene === "race", JSON.stringify(walked));
});

// ---------- Ooga Drop ----------
const dropPage = (base, query) => `${base}?debug=1&nosim=1&scene=drop${clock(query)}`;
const dropBoard = () => withPage("drop board", dropPage(src), async (b) => {
  const board = await b.evaluate(`(() => { const B = window.__ooga; const q = (s) => document.querySelectorAll(s).length; const hoop = window.BL.dropModels.hoop(); let hoops = 0; const walk = (n) => { if (n.geometry === hoop) hoops++; for (const c of n.children) walk(c); }; walk(window.BL.scenes.drop.root); return { scene: B.scene, phase: B.drop.phase, oogas: q("#drop-oogas button"), rows: q("#drop-best li"), boardShown: !document.getElementById("drop-board").hidden, stripHidden: document.getElementById("drop-strip").hidden, leaveShown: !document.querySelector('[data-scene="drop"] [data-action="leave"]').hidden, hoops, rings: B.course.rings.length, ringsDescend: B.course.rings.every((r, i, a) => !i || r.y < a[i - 1].y), records: B.renderer.stats.records, targets: B.input.targetCount, sheet: document.getElementById("sheet").dataset.open, seated: B.diver.body.visible && Math.hypot(B.diver.state.p.x - B.plane.node.position.x, B.diver.state.p.z - B.plane.node.position.z) < 1.5, signed: window.BL.scenes.drop.root.children.some((n) => n.geometry === window.BL.dropModels.roofSign() && Math.hypot(n.position.x - B.plane.node.position.x, n.position.z - B.plane.node.position.z) < 4.5), pressed: document.querySelector('#drop-oogas [aria-pressed="true"]').dataset.racer, target: B.course.target, targetOnMeadow: B.island.heightAt(B.course.target.x, B.course.target.z) === 0 }; })()`);
  record("drop board: the scene lands on the board with seven Oogas, the diver seated in the plane on the roof and ten hoops sharing one geometry", board.scene === "drop" && board.phase === "board" && board.oogas === 7 && board.rows === 4 && board.boardShown && board.stripHidden && board.leaveShown && board.hoops === 8 && board.rings === 8 && board.ringsDescend && board.seated && board.signed && board.pressed === "portlandhodl" && board.sheet === "false" && board.targetOnMeadow && board.records < 40, JSON.stringify(board));
  const eye = await b.evaluate(`(() => { const c = window.__ooga.camera; return { x: c.position.x, z: c.position.z, y: c.position.y, tx: c.target.x, tz: c.target.z }; })()`);
  await b.drag({ x: 150, y: 520 }, { x: 350, y: 480 });
  const swung = await b.evaluate(`(() => { const c = window.__ooga.camera, cam = window.__ooga.drop.cam; return { x: c.position.x, z: c.position.z, y: c.position.y, tx: c.target.x, tz: c.target.z, yaw: cam.boardYaw, lift: cam.boardLift, phase: window.__ooga.drop.phase }; })()`);
  const radius = (e) => Math.hypot(e.x - e.tx, e.z - e.tz);
  record("drop board: a drag swings the view round the plane and tilts it", swung.phase === "board" && swung.yaw < -0.5 && swung.lift < 0 && Math.abs(radius(swung) - radius(eye)) < 0.01 && Math.abs(swung.tx - eye.tx) < 1e-6 && Math.hypot(swung.x - eye.x, swung.z - eye.z) > 3 && swung.y < eye.y, JSON.stringify({ eye, swung }));
  await b.evaluate(`document.querySelector('[data-racer="bc1gui"]').click()`);
  const picked = await b.evaluate(`(() => { const B = window.__ooga; return { name: B.diver.cave.traits.name, skater: B.diver.cave.traits.skater, targets: B.input.targetCount, phase: B.drop.phase }; })()`);
  record("drop board: picking an Ooga rebuilds the diver without leaking input targets", picked.name === "bc1gui" && picked.skater && picked.targets === board.targets && picked.phase === "board", JSON.stringify(picked));
  await b.key("Enter");
  await b.sleep(1800);
  const climbing = await b.evaluate(`(() => { const B = window.__ooga, s = B.plane.state, c = B.camera; return { phase: B.drop.phase, t: s.t, alt: s.alt, speed: s.speed, stripShown: !document.getElementById("drop-strip").hidden, boardHidden: document.getElementById("drop-board").hidden, prop: B.plane.prop.rotation.z, seated: Math.hypot(B.diver.state.p.x - B.plane.node.position.x, B.diver.state.p.y - B.plane.node.position.y, B.diver.state.p.z - B.plane.node.position.z) < 3, camBehind: Math.hypot(c.position.x - B.plane.node.position.x, c.position.z - B.plane.node.position.z) < 16, subtitle: document.getElementById("subtitle").textContent }; })()`);
  record("drop board: Enter starts the climb with the Ooga in the seat, the strip up and the camera chasing the plane", climbing.phase === "climb" && climbing.t > 1 && climbing.alt > 7 && climbing.speed > 8 && climbing.stripShown && climbing.boardHidden && climbing.prop > 3 && climbing.seated && climbing.camBehind && climbing.subtitle.includes("climbing"), JSON.stringify(climbing));
  await b.key(" ");
  await b.sleep(150);
  const early = await b.evaluate(`({ phase: window.__ooga.drop.phase, notice: document.getElementById("drop-notice").textContent })`);
  await hold(b, " ", 2500);
  const hurried = await b.evaluate(`(() => { const B = window.__ooga, s = B.plane.state; return { phase: B.drop.phase, t: s.t, alt: s.alt }; })()`);
  record("drop board: Space before the mark waits, holding it hurries the climb", early.phase === "climb" && early.notice.includes("wait") && hurried.phase === "climb" && hurried.t > 8 && hurried.alt > 60, JSON.stringify({ early, hurried }));
  const camAt = () => b.evaluate(`(() => { const B = window.__ooga, cam = B.drop.cam; return { phase: B.drop.phase, offset: +cam.offset.toFixed(3), tilt: +cam.tilt.toFixed(3), orbiting: window.BL.scenes.drop.input.orbiting, since: +(B.drop.sceneTime - cam.dragAt).toFixed(2) }; })()`);
  await b.drag({ x: 300, y: 450 }, { x: 1300, y: 250 }, 20);
  const swungFar = await camAt();
  await b.mouse("mouseMoved", 400, 450, { button: "none" });
  await b.mouse("mousePressed", 400, 450, { buttons: 1 });
  for (let i = 1; i <= 8; i++) { await b.mouse("mouseMoved", 400 + 30 * i, 450, { buttons: 1 }); await b.sleep(30); }
  await b.sleep(2000);
  const heldStill = await camAt();
  await b.mouse("mouseReleased", 640, 450);
  await b.sleep(2600);
  const eased = await camAt();
  record("drop board: in flight a drag swings the eye more than a quarter turn and tilts it, a held drag keeps it, and it eases back behind the plane 1.5 s after the release", swungFar.phase === "climb" && Math.abs(swungFar.offset) > 1.6 && swungFar.tilt < -0.5 && heldStill.orbiting && Math.abs(heldStill.offset) > 0.5 && heldStill.since < 0.2 && !eased.orbiting && Math.abs(eased.offset) < 0.05 && Math.abs(eased.tilt) < 0.05, JSON.stringify({ swungFar, heldStill, eased }));
  const mark_ = await b.evaluate(`(() => { const B = window.__ooga; B.drop.simulate(30); const s = B.plane.state; let opened = false; for (let t = 0; t < 14 && !opened; t += 0.1) { B.drop.simulate(0.1); opened = B.drop.jumpOpen; } return { opened, alt: s.alt, laps: (s.angle - B.course.jumpAngle) / (Math.PI * 2) }; })()`);
  record("drop board: at height the plane circles until the jump window opens on the course start", mark_.opened && mark_.alt > 358 && mark_.alt <= 360.01, JSON.stringify(mark_));
  await b.key("Escape");
  await b.sleep(200);
  const back = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.drop.phase, boardShown: !document.getElementById("drop-board").hidden, parked: B.plane.state.t === 0 && B.plane.node.position.y === B.plane.state.alt, stripHidden: document.getElementById("drop-strip").hidden }; })()`);
  record("drop board: Escape in the climb parks the plane back on the roof", back.phase === "board" && back.boardShown && back.parked && back.stripHidden, JSON.stringify(back));
});

// The diver placed high in still air, with the plane's course out of the way
const isolateDiver = `(() => { const B = window.__ooga; if (B.drop.phase !== "air") B.drop.jumpNow(); const s = B.diver.state; s.p.x = 0; s.p.y = 900; s.p.z = 0; s.v.x = s.v.z = 0; s.v.y = -20; B.drop.setInput(0, 0, 0, false); return s; })()`;
const dropPhysics = () => withPage("drop physics", dropPage(src), async (b) => {
  const snap = `(s) => ({ speed: +s.speed.toFixed(2), h: +Math.hypot(s.v.x, s.v.z).toFixed(2), vy: +s.v.y.toFixed(2), front: Array.from(s.front).map((v) => +v.toFixed(3)), headDir: +Math.atan2(s.up[0], s.up[2]).toFixed(2), hDir: +Math.atan2(s.v.x, s.v.z).toFixed(2), y: +s.p.y.toFixed(1) })`;
  const fall = await b.evaluate(`(() => { const B = window.__ooga, K = window.BL.skydiver, snap = ${snap}; const s = ${isolateDiver}; B.drop.simulate(6); const flat = snap(s); B.drop.setInput(1, 0, 0, false); B.drop.simulate(5); const dive = snap(s); B.drop.setInput(0, 0, 0, false); B.drop.simulate(5); const back = snap(s); B.drop.setInput(0, 1, 0, false); B.drop.simulate(3); const roll = snap(s); B.drop.setInput(0, 0, 1, false); B.drop.simulate(0.7); const yaw = snap(s); return { flat, dive, back, roll, yaw, terminal: [K.TERMINAL_FLAT, K.TERMINAL_DIVE] }; })()`);
  record("drop physics: a hands-off diver settles belly down near the flat terminal speed", Math.abs(fall.flat.speed - fall.terminal[0]) < 1.5 && fall.flat.h < 0.5 && fall.flat.front[1] < -0.98, JSON.stringify(fall.flat));
  record("drop physics: holding pitch tips the head down, speeds the fall and tracks toward the head; releasing settles flat again", fall.dive.speed > fall.flat.speed + 4 && fall.dive.h > 4 && Math.abs(Math.atan2(Math.sin(fall.dive.hDir - fall.dive.headDir), Math.cos(fall.dive.hDir - fall.dive.headDir))) < 0.3 && fall.dive.front[1] > -0.96 && fall.back.front[1] < -0.97 && fall.back.h < fall.dive.h, JSON.stringify({ dive: fall.dive, back: fall.back }));
  // Headings grow to the left in this frame: a slide to the right of the head is a negative offset, a left turn a positive one
  const offset = (a, z) => Math.atan2(Math.sin(a - z), Math.cos(a - z));
  record("drop physics: D slides the diver to the right of the head and Q turns the head left", fall.roll.h > 3 && offset(fall.roll.hDir, fall.roll.headDir) < -0.9 && offset(fall.roll.hDir, fall.roll.headDir) > -2.2 && offset(fall.yaw.headDir, fall.roll.headDir) > 0.6, JSON.stringify({ roll: fall.roll, yaw: fall.yaw }));
  const rings = await b.evaluate(`(() => { const B = window.__ooga, R = B.course.rings; const s = ${isolateDiver}; s.v.y = -20; const through = (dx) => { const ring = R[3]; B.drop.toBoard(); B.drop.jumpNow(); const s = B.diver.state; s.p.x = ring.x + dx; s.p.y = ring.y + 3; s.p.z = ring.z; s.v.x = s.v.z = 0; s.v.y = -20; B.drop.setInput(0, 0, 0, false); const before = B.drop.ringsHit; B.drop.simulate(0.4); return { hit: B.drop.ringsHit - before, glow: ring.node.glow, below: s.p.y < ring.y }; }; return { inside: through(0), edge: through(R[3].r - 0.3), outside: through(R[3].r + 0.6), particles: B.stats().particles }; })()`);
  record("drop physics: a hoop counts when the fall crosses its plane inside the radius, not outside it", rings.inside.hit === 1 && rings.inside.glow < 0.5 && rings.inside.below && rings.edge.hit === 1 && rings.outside.hit === 0 && rings.outside.glow === 1 && rings.outside.below && rings.particles > 0, JSON.stringify(rings));
  const chute = await b.evaluate(`(() => { const B = window.__ooga, K = window.BL.skydiver; const s = ${isolateDiver}; B.drop.simulate(5); const before = { vy: s.v.y, canopy: B.diver.canopy.visible }; B.drop.deploy(); B.drop.simulate(0.4); const opening = { phase: s.phase, scale: B.diver.canopy.scale.x, visible: B.diver.canopy.visible }; B.drop.simulate(3); const flying = { phase: s.phase, vy: +s.v.y.toFixed(2), forward: +Math.hypot(s.v.x, s.v.z).toFixed(2), scale: +B.diver.canopy.scale.x.toFixed(2), chute: document.getElementById("drop-chute-name").textContent }; const h0 = s.heading; B.drop.setInput(0, 1, 0, false); B.drop.simulate(1); const turned = s.heading - h0; const h1 = s.heading; B.drop.setInput(0, 0, 1, false); B.drop.simulate(1); const yawed = Math.atan2(Math.sin(s.heading - h1), Math.cos(s.heading - h1)); B.drop.setInput(0, 0, 0, true); B.drop.simulate(1.5); const flare = { vy: +s.v.y.toFixed(2), forward: +Math.hypot(s.v.x, s.v.z).toFixed(2), flaring: s.flaring }; B.drop.simulate(2); const spent = { flaring: s.flaring, reserve: +s.flare.toFixed(2) }; return { before, opening, flying, turned, yawed, flare, spent, sink: K.SINK, flareSink: K.FLARE_SINK, again: B.drop.deploy() }; })()`);
  record("drop physics: pulling blooms the canopy, the sink settles at its rate, D banks it right, Q turns it left, a flare slows the sink until the reserve runs out", chute.before.vy < -20 && !chute.before.canopy && chute.opening.phase === "open" && chute.opening.visible && chute.opening.scale > 0.3 && chute.opening.scale < 1 && chute.flying.phase === "canopy" && Math.abs(chute.flying.vy + chute.sink) < 0.3 && chute.flying.forward > 5 && chute.flying.scale === 1 && chute.flying.chute === "canopy" && chute.turned < -0.8 && chute.yawed > 0.8 && chute.flare.flaring && chute.flare.vy > -chute.flareSink - 0.4 && chute.flare.forward < 4 && !chute.spent.flaring && chute.spent.reserve === 0 && !chute.again, JSON.stringify(chute));
  const landings = await b.evaluate(`(() => { const B = window.__ooga, T = B.course.target; const drop = (setup) => { B.drop.toBoard(); B.drop.jumpNow(); const s = B.diver.state; setup(s); B.drop.simulate(8); return { phase: B.drop.phase, landing: s.landing, result: B.drop.result && B.drop.result.landing, score: B.drop.score, dist: B.drop.result && +B.drop.result.dist.toFixed(2), bananaBonus: B.drop.result && B.drop.result.banana, y: +s.p.y.toFixed(2), ground: B.island.surfaceAt(s.p.x, s.p.z) }; }; const stand = drop((s) => { s.p.x = T.x - 2; s.p.y = 3.6; s.p.z = T.z; s.v.x = s.v.z = 0; s.v.y = -5; B.drop.deploy(); s.open = 1; s.phase = "canopy"; s.heading = Math.PI / 2; B.drop.setInput(0, 0, 0, true); }); const fast = drop((s) => { s.p.x = T.x + 6; s.p.y = 3.5; s.p.z = T.z; s.v.x = s.v.z = 0; B.drop.deploy(); s.open = 1; s.phase = "canopy"; s.v.y = -8; s.flare = 0; }); const pancake = drop((s) => { s.p.x = 2; s.p.y = 30; s.p.z = 2; s.v.x = s.v.z = 0; }); const tumble = drop((s) => { s.p.x = 2; s.p.y = 8; s.p.z = 2; s.v.x = 22; s.v.z = 0; s.v.y = -24; }); const hole = drop((s) => { s.p.x = -5; s.p.y = 10; s.p.z = 5; s.v.x = s.v.z = 0; s.v.y = -40; window.BL.math.quat.fromEuler(s.q, Math.PI, 0, 0); }); const holeShown = window.BL.scenes.drop.root.children.some((n) => n.geometry === window.BL.dropModels.hole() && n.visible); const lost = drop((s) => { s.p.x = 80; s.p.y = 10; s.p.z = 80; s.v.x = s.v.z = 0; }); return { stand, fast, pancake, tumble, hole, holeShown, lost, best: B.game.state.drop.best }; })()`);
  record("drop physics: any canopy touchdown, slow or fast, is a good landing scored by its distance to the target", landings.stand.phase === "results" && landings.stand.landing === "stand" && landings.stand.result === "stand" && landings.stand.score >= 600 && landings.stand.dist < 4 && landings.fast.landing === "stand" && landings.fast.score > 0 && landings.fast.score < landings.stand.score && landings.best && landings.best.landing === "stand", JSON.stringify({ stand: landings.stand, fast: landings.fast }));
  record("drop physics: without a chute a flat slow fall flattens, a flat fast one tumbles, a spine-first one punches a hole, all for nothing", landings.pancake.landing === "pancake" && landings.tumble.landing === "tumble" && landings.hole.landing === "hole" && landings.holeShown && [landings.pancake, landings.tumble, landings.hole].every((l) => l.phase === "results" && l.score === 0 && l.bananaBonus === 0), JSON.stringify({ pancake: landings.pancake, tumble: landings.tumble, hole: landings.hole, holeShown: landings.holeShown }));
  record("drop physics: off the island the fall is lost as soon as it drops past the rim", landings.lost.result === "lost" && landings.lost.y < -8 && landings.lost.y > -60, JSON.stringify(landings.lost));
});

const dropFlow = () => withPage("drop flow", dropPage(src), async (b) => {
  const rendered = (frames) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > 4000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const jumped = await b.evaluate(`(() => { const B = window.__ooga; const ok = B.drop.jumpNow(); return { ok, phase: B.drop.phase, diver: B.diver.state.phase, alt: B.diver.state.p.y, speed: B.diver.state.speed, act: document.getElementById("act").textContent, centerHidden: document.getElementById("drop-center").hidden }; })()`);
  await rendered(8);
  const falling = await b.evaluate(`(() => { const B = window.__ooga, s = B.diver.state, c = B.camera; return { alt: s.p.y, streaks: B.drop.streaks, camAbove: c.position.y > s.p.y + 0.5, camNear: Math.hypot(c.position.x - s.p.x, c.position.y - s.p.y, c.position.z - s.p.z) < 12, fov: +(c.fov * 180 / Math.PI).toFixed(1), up: document.getElementById("drop-alt").textContent, time: document.getElementById("drop-time").textContent }; })()`);
  record("drop flow: the jump leaves the plane in freefall with the camera above the diver, the streaks up and the strip counting", jumped.ok && jumped.phase === "air" && jumped.diver === "free" && jumped.alt > 350 && jumped.speed > 15 && jumped.centerHidden && falling.alt < jumped.alt && falling.streaks === 160 && falling.camAbove && falling.camNear && +falling.up > 200 && falling.time !== "0:00.00", JSON.stringify({ jumped, falling }));
  // Fall to the pull height in simulated time, then pull for real with Space
  await b.evaluate(`(() => { const B = window.__ooga, s = B.diver.state; s.p.x = 0; s.p.z = 0; s.v.x = s.v.z = 0; while (s.p.y > 87 && B.drop.phase === "air") B.drop.simulate(0.25); })()`);
  await rendered(3);
  const prompt = await b.evaluate(`({ center: document.getElementById("drop-center").textContent, hidden: document.getElementById("drop-center").hidden, alt: window.__ooga.diver.state.p.y })`);
  await b.key(" ");
  await rendered(3);
  const pulled = await b.evaluate(`(() => { const B = window.__ooga, s = B.diver.state; return { phase: s.phase, canopy: B.diver.canopy.visible, chute: document.getElementById("drop-chute-name").textContent, act: document.getElementById("act").textContent }; })()`);
  record("drop flow: the PULL call shows near the ground and Space opens the canopy", !prompt.hidden && prompt.center === "PULL" && prompt.alt < 90 && pulled.phase !== "free" && pulled.canopy && pulled.chute === "canopy" && pulled.act === "Flare", JSON.stringify({ prompt, pulled }));
  // Bring the canopy down over the banana mound, flaring in
  await b.evaluate(`(() => { const B = window.__ooga, s = B.diver.state; B.drop.simulate(3); s.p.x = -2.4; s.p.y = 3.4; s.p.z = 0; s.v.x = s.v.z = 0; s.heading = Math.PI / 2; B.drop.setInput(0, 0, 0, true); B.drop.simulate(8); })()`);
  await rendered(3);
  const landed = await b.evaluate(`(() => { const B = window.__ooga, s = B.diver.state; return { phase: B.drop.phase, landing: s.landing, shown: !document.getElementById("drop-results").hidden, rows: document.querySelectorAll("#drop-score li").length, summary: document.getElementById("drop-summary").textContent, best: B.game.state.drop.best, stored: JSON.parse(localStorage.getItem("oogaboogaland.v1")).drop.best, result: B.drop.result, actHidden: document.getElementById("act").hidden, canopyDown: !B.diver.canopy.visible || B.diver.canopy.scale.y < 1 }; })()`);
  record("drop flow: the landing shows the results with the score rows, saves the best and folds the canopy", landed.phase === "results" && landed.landing === "stand" && landed.shown && landed.rows >= 5 && landed.summary.length > 0 && landed.best && landed.best.score === landed.result.score && landed.stored && landed.stored.score === landed.best.score && landed.result.banana === 300 && landed.actHidden && landed.canopyDown, JSON.stringify(landed));
  await b.evaluate(`document.querySelector('#drop-results [data-action="drop-again"]').click()`);
  await b.sleep(200);
  const again = await b.evaluate(`(() => { const B = window.__ooga; return { phase: B.drop.phase, resultsHidden: document.getElementById("drop-results").hidden, score: B.drop.score, rings: B.drop.ringsHit, ringsLit: B.course.rings.every((r) => r.node.glow === 1 && !r.hit), diverPhase: B.diver.state.phase }; })()`);
  record("drop flow: Again restarts the climb with the course reset", again.phase === "climb" && again.resultsHidden && again.score === 0 && again.rings === 0 && again.ringsLit && again.diverPhase === "idle", JSON.stringify(again));
  await b.evaluate(`(() => { const bad = JSON.parse(localStorage.getItem("oogaboogaland.v1")); bad.drop.best = { score: "x", rings: 3, ringTotal: 10, landing: "stand" }; localStorage.setItem("oogaboogaland.v1", JSON.stringify(bad)); })()`);
  await b.open(dropPage(src));
  await b.sleep(2500);
  const reloaded = await b.evaluate(`(() => { const B = window.__ooga; return { best: B.game.state.drop.best, rows: [...document.querySelectorAll("#drop-best li")].map((li) => li.textContent) }; })()`);
  record("drop flow: a malformed saved best is dropped on reload", reloaded.best === null && reloaded.rows[0].startsWith("Score"), JSON.stringify(reloaded));
  await b.evaluate(`document.querySelector('[data-scene="drop"] [data-action="leave"]').click()`);
  await b.sleep(900);
  const left = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { scene: B.scene, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), dropHidden: document.getElementById("drop").hidden, boardBtnHidden: document.getElementById("drop-board-btn").hidden }; })()`);
  record("drop flow: Back to the island returns to the hub landing view with the drop HUD hidden", left.scene === "hub" && left.toPile < 0.5 && left.dropHidden && left.boardBtnHidden, JSON.stringify(left));
});

const dropCanvas = () => withPage("drop canvas", dropPage(src, "canvas2d=1"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga; B.drop.jumpNow(); return { kind: B.renderer.kind, phase: B.drop.phase }; })()`);
  const frames = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + 30 || performance.now() - t0 > 6000) resolve({ frames: B.renderedFrames - start, alt: B.diver.state.p.y, streaks: B.drop.streaks }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("drop canvas: the Canvas 2D fallback draws the fall with the streak batch", r.kind === "canvas2d" && r.phase === "air" && frames.frames >= 30 && frames.alt < 360 && frames.streaks === 160, JSON.stringify({ ...r, ...frames }));
});

const dropPhone = () => withPage("drop phone", dropPage(src), async (b) => {
  const board = await b.evaluate(`(() => { const g = document.getElementById("drop-board").getBoundingClientRect(); return { fits: g.bottom <= window.innerHeight && g.width <= window.innerWidth, columns: getComputedStyle(document.querySelector(".drop-columns")).gridTemplateColumns.split(" ").length, help: document.getElementById("drop-help").textContent }; })()`);
  await b.evaluate(`document.querySelector('[data-action="drop-start"]').click()`);
  await b.sleep(800);
  const climb = await b.evaluate(`(() => { const B = window.__ooga; const act = document.getElementById("act"), strip = document.querySelector(".race-hud-right").getBoundingClientRect(); return { phase: B.drop.phase, act: !act.hidden && act.textContent, stripFits: strip.right <= window.innerWidth && strip.left >= 0, sticks: getComputedStyle(document.getElementById("joy-move")).display, look: getComputedStyle(document.getElementById("joy-look")).display }; })()`);
  await b.evaluate(`(() => { const B = window.__ooga; B.drop.jumpNow(); const s = B.diver.state; s.p.y = 900; s.v.x = s.v.z = 0; s.v.y = -20; B.drop.simulate(4); })()`);
  const stick = await b.evaluate(`(() => { const r = document.getElementById("joy-move").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const flat = await b.evaluate(`Array.from(window.__ooga.diver.state.front).map((v) => +v.toFixed(2))`);
  await b.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: stick.x, y: stick.y }] });
  for (let i = 1; i <= 6; i++) {
    await b.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: stick.x, y: stick.y - i * 6 }] });
    await b.sleep(100);
  }
  await b.sleep(900);
  const tipped = await b.evaluate(`(() => { const s = window.__ooga.diver.state; return { front: Array.from(s.front).map((v) => +v.toFixed(2)), act: document.getElementById("act").textContent }; })()`);
  await b.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  record("drop phone: the board stacks, the climb shows the Jump button and both sticks, and the left stick tips the diver", board.fits && board.columns === 1 && board.help.includes("stick") && climb.phase === "climb" && climb.act === "Jump!" && climb.stripFits && climb.sticks === "block" && climb.look === "block" && flat[1] < -0.95 && tipped.front[1] > flat[1] + 0.15 && tipped.act === "Pull!", JSON.stringify({ board, climb, flat, tipped }));
}, { w: 390, h: 844, mobile: true });

const dropAudio = () => withPage("drop audio", dropPage(src), async (b) => {
  const before = await b.evaluate(`(() => { const A = window.__ooga.audio; return { ready: A.ready, context: !!A.context }; })()`);
  await b.click(720, 450);
  await b.sleep(200);
  const after = await b.evaluate(`(() => { const A = window.__ooga.audio; for (const name of Object.keys(A.cues)) A.cues[name](); A.state.planeSpeed = 20; A.state.speed = 30; A.state.falling = 1; A.update(1 / 60); A.state.canopy = 1; A.state.flaring = 1; A.update(1 / 60); return { ready: A.ready, state: A.context.state, voices: A.voices, cues: Object.keys(A.cues).length, muted: A.muted }; })()`);
  await b.key("m");
  await b.sleep(100);
  const muted = await b.evaluate(`(() => { const A = window.__ooga.audio; return { muted: A.muted, pressed: document.getElementById("drop-mute").getAttribute("aria-pressed"), stored: localStorage.getItem("oogaboogaland.audio") }; })()`);
  await b.key("m");
  await b.evaluate(`window.__ooga.go("hub")`);
  await b.sleep(900);
  const left = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, audio: B.audio === undefined }; })()`);
  record("drop audio: silent until a real gesture, then a running context with a fixed voice pool and every cue playable", !before.ready && !before.context && after.ready && after.state === "running" && after.voices === 8 && after.cues >= 14 && !after.muted, JSON.stringify({ before, after }));
  record("drop audio: M mutes, remembers it, and leaving the drop closes the context", muted.muted && muted.pressed === "true" && muted.stored === "off" && left.scene === "hub" && left.audio, JSON.stringify({ muted, left }));
});

const hubDrop = () => withPage("hub drop route", hubPage(src), async (b) => {
  await b.evaluate(`window.__ooga.pilot.goPreset("drop")`);
  await b.sleep(1200);
  const roof = await b.evaluate(`(() => { const B = window.__ooga; const l = B.launchers[0], m = B.mouths.find((m) => m.id === "c9"); const p = B.project(l.x, l.y + 1, l.z); const hit = B.input.pick(p.x, p.y); const wheel = window.BL.raceModels.kartWheel(), body = window.BL.dropModels.planeBody(); let wheels = 0, planes = 0; const isGeometry = (node, geometry) => node.geometry === geometry || node.geometry?.matrixSourceGeometry === geometry; const walk = (node) => { if (isGeometry(node, wheel)) wheels++; if (isGeometry(node, body)) planes++; for (const c of node.children) walk(c); }; walk(window.BL.scenes.hub.root); return { launchers: B.launchers.length, onRoof: l.y > 3 && Math.abs(l.y - window.BL.dropModels.roofSpot(B.island, m, {}, 0.8).y) < 1e-6 && Math.abs(l.y - B.island.surfaceAt(l.x, l.z)) < 0.1, overRoom: Math.hypot(l.x - m.x, l.z - m.z) > 3 && Math.hypot(l.x - m.x, l.z - m.z) < 5, x: Math.round(p.x), y: Math.round(p.y), kind: hit && hit.owner.kind, prop: hit && hit.owner.prop, wheels, planes, sign: (() => { const o = B.props.find((o) => o.prop === "sign"); return o ? { tip: (() => { const q = B.project(o.x, o.node.world[13] + 0.8, o.z), hit = B.input.pick(q.x, q.y); return hit && hit.owner.prop; })(), onRoof: Math.abs(o.node.world[13] - B.island.surfaceAt(o.x, o.z)) < 1e-6, nearPlane: Math.hypot(o.x - l.x, o.z - l.z) < 4.5, text: o.node.geometry === window.BL.dropModels.roofSign() } : null; })(), scenery: B.scenery.candidateCount, clear: B.props.filter((o) => o.scenery && o.active && Math.hypot(o.x - l.x, o.z - l.z) < o.footprint + 3.6).length }; })()`);
  await b.mouse("mouseMoved", roof.x, roof.y, { button: "none" });
  await b.sleep(300);
  const tip = await b.evaluate(`document.getElementById("tooltip").textContent`);
  await b.click(roof.x, roof.y);
  await b.sleep(1600);
  const entered = await b.evaluate(`({ scene: window.__ooga.scene, phase: window.__ooga.drop.phase, board: !document.getElementById("drop-board").hidden })`);
  record("hub drop route: the plane parks on the rally cave roof with its sign on pegs beside it, tooltips, and tapping it enters the board", roof.launchers === 1 && roof.onRoof && roof.overRoom && roof.kind === "prop" && roof.prop === "plane" && roof.wheels === 9 && roof.planes === 1 && roof.sign && roof.sign.onRoof && roof.sign.nearPlane && roof.sign.text && roof.sign.tip === "sign" && roof.clear === 0 && roof.scenery === 369 && tip === "Ooga Drop · tap to fly" && entered.scene === "drop" && entered.phase === "board" && entered.board, JSON.stringify({ ...roof, tip, ...entered }));
  await b.key("Escape");
  await b.sleep(900);
  const back = await b.evaluate(`(() => { const B = window.__ooga; const c = B.camera; return { scene: B.scene, toPile: +Math.hypot(c.target.x, c.target.z).toFixed(2), dropHidden: document.getElementById("drop").hidden }; })()`);
  record("hub drop route: Escape on the board returns to the hub landing view", back.scene === "hub" && back.toPile < 0.5 && back.dropHidden, JSON.stringify(back));
  // Stand the Ooga on the roof beside the wing, facing the plane, with the camera behind him
  const driver = await b.evaluate(`(() => { const B = window.__ooga; const l = B.launchers[0]; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build && c.traits.name !== "portlandhodl"); const dx = Math.cos(l.ry), dz = -Math.sin(l.ry); B.crew.control(cave); cave.root.position.x = l.x + dx * 3.6; cave.root.position.z = l.z + dz * 3.6; cave.root.position.y = cave.baseY + l.y; cave.hop = 0; cave.root.rotation.y = Math.atan2(-dx, -dz); B.pilot.orbit.tYaw = B.pilot.orbit.yaw = Math.atan2(dx, dz); return cave.traits.name; })()`);
  await b.sleep(300);
  await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "w", text: "w" });
  const walked = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { if (B.scene === "drop" || performance.now() - t0 > 6000) resolve({ scene: B.scene, ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }; tick(); })`);
  await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "w" });
  await b.sleep(400);
  const preselected = await b.evaluate(`({ picked: document.querySelector('#drop-oogas [aria-pressed="true"]').dataset.racer, diver: window.__ooga.diver.cave.traits.name })`);
  record("hub drop route: walking a driven Ooga along the roof into the plane enters the drop with that Ooga picked", walked.scene === "drop" && preselected.picked === driver && preselected.diver === driver, JSON.stringify({ walked, driver, preselected }));
});

const soakDrop = () => withPage("soak: drop cycles", hubPage(src), async (b) => {
  const { rendered, settled, snapshot, travel, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const s0 = await snapshot();
  for (let i = 0; i < 6; i++) {
    for (const id of ["drop", "hub"]) {
      const t = await travel(id);
      if (t.stuck) throw new Error(`round trip ${i + 1}: the transition to the ${id} did not settle: ${JSON.stringify(t.stuck)}`);
      await b.sleep(400);
    }
  }
  const s6 = await snapshot();
  const same = (key) => s0.stats[key] === s6.stats[key];
  record("soak: drop cycles: node, target, tween and DOM counts identical after six hub/drop round trips", s6.stats.tweens === 0 && same("allNodes") && same("targets") && same("tweens") && same("dom"), `${JSON.stringify(s0.stats)} -> ${JSON.stringify(s6.stats)}`);
  record("soak: drop cycles: GPU records stable", Math.abs(s6.stats.gl.records - s0.stats.gl.records) <= 3, `${s0.stats.gl.records} -> ${s6.stats.gl.records}`);
  record("soak: drop cycles: live DOM nodes and event listeners identical", s6.nodes === s0.nodes && s6.listeners === s0.listeners, `nodes ${s0.nodes} -> ${s6.nodes}, listeners ${s0.listeners} -> ${s6.listeners}`);
  record("soak: drop cycles: heap after GC within 10%", within(s0, s6, 0.1), heapDetail(s0, s6));
  record("soak: drop cycles: no error thrown", !b.logs.some((l) => l.startsWith("[exception]")), b.logs.join(" | ").slice(0, 200));
});

// Sixty tips in fifteen seconds while the diver falls, then back to base
const soakDropDonations = () => withPage("soak: donations (drop)", dropPage(src), async (b) => {
  const { until, rendered, settled, snapshot, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const before = await snapshot();
  await b.evaluate(`(() => { const B = window.__ooga; B.drop.jumpNow(); const s = B.diver.state; s.p.y = 2000; s.v.x = s.v.z = 0; })()`);
  const level0 = await b.evaluate("window.__ooga.level");
  const start = await b.evaluate("performance.now()");
  for (let i = 0; i < 60; i++) {
    await b.evaluate(`window.__ooga.demoTip(${i % 4 === 3 ? 120000 : 1200})`);
    await until(`performance.now() >= ${start + 250 * (i + 1)}`, 2000);
  }
  const mid = await b.evaluate(`(() => { const B = window.__ooga; return { level: B.level, phase: B.drop.phase, donations: B.game.state.donations, sats: document.getElementById("stat-sats").textContent, falling: B.diver.state.phase === "free" }; })()`);
  await b.evaluate(`window.__ooga.drop.toBoard()`);
  const quiet = await until("B.stats().particles === 0", 15000) && await settled(15000);
  await b.evaluate("(() => { const B = window.__ooga; B.trimPool(); B.housekeep(); })()");
  const after = await snapshot();
  const a = after.stats, s = before.stats;
  record("soak: donations (drop): tips credit the shared banana level mid-fall and the pools drain", quiet && mid.phase === "air" && mid.falling && mid.level > level0 + 150 && mid.donations === 60 && a.particles === 0 && a.tweens === 0 && a.pool <= 32 && a.streaks === 0, JSON.stringify({ level0, mid, particles: a.particles, pool: a.pool, tweens: a.tweens }));
  record("soak: donations (drop): node and target counts back to base", a.allNodes - a.pool === s.allNodes - s.pool && a.targets === s.targets, `allNodes ${s.allNodes} -> ${a.allNodes} (pool ${a.pool}), targets ${s.targets} -> ${a.targets}, dom ${s.dom} -> ${a.dom}, listeners ${before.listeners} -> ${after.listeners}`);
  record("soak: donations (drop): GPU records bounded", a.gl.records - s.gl.records <= 20, `${s.gl.records} -> ${a.gl.records}`);
  record("soak: donations (drop): heap after GC within 15%", within(before, after, 0.15), heapDetail(before, after));
});

const soakRace = () => withPage("soak: race cycles", hubPage(src), async (b) => {
  const { rendered, settled, snapshot, travel, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const s0 = await snapshot();
  for (let i = 0; i < 6; i++) {
    for (const id of ["race", "hub"]) {
      const t = await travel(id);
      if (t.stuck) throw new Error(`round trip ${i + 1}: the transition to the ${id} did not settle: ${JSON.stringify(t.stuck)}`);
      // The garage has no tweens, so let the fade back in finish before the next go
      await b.sleep(400);
    }
  }
  const s6 = await snapshot();
  const same = (key) => s0.stats[key] === s6.stats[key];
  record("soak: race cycles: node, target, tween and DOM counts identical after six hub/race round trips", s6.stats.tweens === 0 && same("allNodes") && same("targets") && same("tweens") && same("dom"), `${JSON.stringify(s0.stats)} -> ${JSON.stringify(s6.stats)}`);
  record("soak: race cycles: GPU records stable", Math.abs(s6.stats.gl.records - s0.stats.gl.records) <= 3, `${s0.stats.gl.records} -> ${s6.stats.gl.records}`);
  record("soak: race cycles: live DOM nodes and event listeners identical", s6.nodes === s0.nodes && s6.listeners === s0.listeners, `nodes ${s0.nodes} -> ${s6.nodes}, listeners ${s0.listeners} -> ${s6.listeners}`);
  record("soak: race cycles: heap after GC within 10%", within(s0, s6, 0.1), heapDetail(s0, s6));
  record("soak: race cycles: no error thrown", !b.logs.some((l) => l.startsWith("[exception]")), b.logs.join(" | ").slice(0, 200));
});

// Sixty tips in fifteen seconds while a race runs, then back to base
const soakRaceDonations = () => withPage("soak: donations (race)", racePage(src), async (b) => {
  const { until, rendered, settled, snapshot, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const before = await snapshot();
  await b.evaluate(`(() => { const B = window.__ooga; B.race.startRace(); B.racers.autopilot = true; })()`);
  await b.sleep(3600);
  const level0 = await b.evaluate("window.__ooga.level");
  const start = await b.evaluate("performance.now()");
  for (let i = 0; i < 60; i++) {
    await b.evaluate(`window.__ooga.demoTip(${i % 4 === 3 ? 120000 : 1200})`);
    await until(`performance.now() >= ${start + 250 * (i + 1)}`, 2000);
  }
  const mid = await b.evaluate(`(() => { const B = window.__ooga; return { level: B.level, phase: B.race.phase, donations: B.game.state.donations, sats: document.getElementById("stat-sats").textContent, ticker: !!B.stats().bubbles || true }; })()`);
  await b.evaluate(`(() => { const B = window.__ooga; B.race.toGarage(); })()`);
  const quiet = await until("B.stats().particles === 0", 15000) && await settled(15000);
  await b.evaluate("(() => { const B = window.__ooga; B.trimPool(); B.housekeep(); })()");
  const after = await snapshot();
  const a = after.stats, s = before.stats;
  record("soak: donations (race): tips credit the shared banana level mid-race and the pools drain", quiet && mid.phase === "racing" && mid.level > level0 + 150 && mid.donations === 60 && a.particles === 0 && a.tweens === 0 && a.pool <= 32 && a.rocksLive === 0, JSON.stringify({ level0, mid, particles: a.particles, pool: a.pool, tweens: a.tweens }));
  record("soak: donations (race): node and target counts back to base", a.allNodes - a.pool === s.allNodes - s.pool && a.targets === s.targets, `allNodes ${s.allNodes} -> ${a.allNodes} (pool ${a.pool}), targets ${s.targets} -> ${a.targets}, dom ${s.dom} -> ${a.dom}, listeners ${before.listeners} -> ${after.listeners}`);
  record("soak: donations (race): GPU records bounded", a.gl.records - s.gl.records <= 20, `${s.gl.records} -> ${a.gl.records}`);
  record("soak: donations (race): heap after GC within 15%", within(before, after, 0.15), heapDetail(before, after));
});

// ---------- soak ----------
// Round trips and storms must leave nothing behind
const mb = (bytes) => (bytes / 1048576).toFixed(2);
const FRESH_FRAMES = 150;
const soak = async (b) => {
  await b.send("HeapProfiler.enable");
  const until = (cond, ms) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { const ok = !!(${cond}); if (ok || performance.now() - t0 > ${ms}) resolve(ok); else requestAnimationFrame(tick); }; tick(); })`);
  const rendered = (frames, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > ${ms}) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const settled = (ms = 4000) => until("window.BL.scene.tweenCount() === 0", ms);
  // Every scene writes its hint 1.2 s after entering; the first snapshot must already count that text node
  await until(`document.getElementById("hint").textContent`, 3000);
  const heap = async () => {
    await b.send("HeapProfiler.collectGarbage");
    // Count the page before Chrome's heap-snapshot machinery can add an inspector node.
    const dom = (await b.send("Memory.getDOMCounters")).result;
    const chunks = [];
    b.on("HeapProfiler.addHeapSnapshotChunk", (p) => chunks.push(p.chunk));
    await b.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
    b.on("HeapProfiler.addHeapSnapshotChunk", null);
    const snap = JSON.parse(chunks.join(""));
    const { node_fields: fields, node_types: [types] } = snap.snapshot.meta;
    const iType = fields.indexOf("type"), iSize = fields.indexOf("self_size"), code = types.indexOf("code");
    let total = 0, compiled = 0;
    for (let i = 0; i < snap.nodes.length; i += fields.length) {
      total += snap.nodes[i + iSize];
      if (snap.nodes[i + iType] === code) compiled += snap.nodes[i + iSize];
    }
    return { used: (await b.send("Runtime.getHeapUsage")).result.usedSize, objects: total - compiled, code: compiled, nodes: dom.nodes, listeners: dom.jsEventListeners };
  };
  const snapshot = async () => ({ stats: await b.evaluate("window.__ooga.stats()"), ...await heap() });
  // go(id), then wait for swap, frames and animations
  const travel = (id) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const T = window.BL.scene.tweenCount; const t0 = performance.now(); let last = t0, swap = 0, swapFrame = 0, swapGap = 0; B.go(${JSON.stringify(id)}); const tick = () => { const now = performance.now(); if (!swap && B.scene === ${JSON.stringify(id)}) { swap = now - t0; swapGap = now - last; swapFrame = B.renderedFrames; } last = now; if (swap && B.renderedFrames >= swapFrame + 3 && T() === 0) resolve({ swap, swapGap, settled: now - t0 }); else if (now - t0 > 8000) resolve({ stuck: { scene: B.scene, tweens: T(), framesSinceSwap: swap ? B.renderedFrames - swapFrame : -1, swap: Math.round(swap) } }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const heapDetail = (a, z) => `objects ${mb(a.objects)} -> ${mb(z.objects)} MB (used ${mb(a.used)} -> ${mb(z.used)} MB, code ${mb(a.code)} -> ${mb(z.code)} MB)`;
  const within = (a, z, share) => Math.abs(z.objects - a.objects) <= a.objects * share;
  return { until, rendered, settled, snapshot, travel, heapDetail, within };
};

const soakScenes = () => withPage("soak: scene cycles", hubPage(src), async (b) => {
  const { rendered, settled, snapshot, travel, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const s0 = await snapshot();
  const times = [];
  for (let i = 0; i < 10; i++) {
    for (const id of ["lab", "hub"]) {
      const t = await travel(id);
      if (t.stuck) throw new Error(`round trip ${i + 1}: the transition to the ${id} did not settle: ${JSON.stringify(t.stuck)}`);
      times.push(t);
    }
  }
  const s10 = await snapshot();
  const same = (key) => s0.stats[key] === s10.stats[key];
  const avg = (key) => Math.round(times.reduce((sum, t) => sum + t[key], 0) / times.length);
  record("soak: scene cycles: node, target, tween and DOM counts identical after ten round trips", s10.stats.tweens === 0 && same("allNodes") && same("targets") && same("tweens") && same("dom"), `${JSON.stringify(s0.stats)} -> ${JSON.stringify(s10.stats)}`);
  record("soak: scene cycles: GPU records stable", Math.abs(s10.stats.gl.records - s0.stats.gl.records) <= 3, `${s0.stats.gl.records} -> ${s10.stats.gl.records}`);
  record("soak: scene cycles: live DOM nodes and event listeners identical", s10.nodes === s0.nodes && s10.listeners === s0.listeners, `nodes ${s0.nodes} -> ${s10.nodes}, listeners ${s0.listeners} -> ${s10.listeners}`);
  record("soak: scene cycles: heap after GC within 10%", within(s0, s10, 0.1), `${heapDetail(s0, s10)} · avg go->swap ${avg("swap")} ms (swap frame ${avg("swapGap")} ms), go->settled ${avg("settled")} ms`);
  record("soak: scene cycles: no error thrown", !b.logs.some((l) => l.startsWith("[exception]")), b.logs.join(" | ").slice(0, 200));
});

const soakResidency = () => withPage("soak: GPU residency", hubPage(src), async (b) => {
  const { until } = await soak(b);
  const records = () => b.evaluate("window.__ooga.renderer.stats.records");
  // Records come as geometry draws, so count equal frames
  const framesSince = (start) => until(`B.renderedFrames >= ${start + FRESH_FRAMES}`, 8000);
  const visit = async (id) => {
    await b.evaluate(`window.__ooga.go(${JSON.stringify(id)})`);
    const start = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { if (B.scene === ${JSON.stringify(id)} || performance.now() - t0 > 4000) resolve(B.renderedFrames); else requestAnimationFrame(tick); }; tick(); })`);
    await framesSince(start);
    return records();
  };
  // A fresh page of the same scene
  const fresh = async (url) => {
    await b.open(url);
    const search = new URL(url).search;
    for (const t0 = Date.now(); Date.now() - t0 < 15000;) {
      await b.sleep(100);
      try {
        if (await b.evaluate(`location.search === ${JSON.stringify(search)} && !!window.__ooga && window.__ooga.renderedFrames >= ${FRESH_FRAMES}`)) return records();
      } catch {
        // The old document is tearing down, so poll again
      }
    }
    throw new Error(`${url} did not load`);
  };
  await framesSince(0);
  const hubFresh = await records();
  const labAfterHub = await visit("lab");
  const hubAfterLab = await visit("hub");
  const labFresh = await fresh(page(src));
  record("soak: GPU residency: the lab after a hub visit holds only lab geometry", Math.abs(labAfterHub - labFresh) <= 3, `lab after hub ${labAfterHub}, fresh lab ${labFresh}`);
  record("soak: GPU residency: the hub after a lab visit holds no lab geometry", hubAfterLab <= hubFresh + 3, `hub after lab ${hubAfterLab}, fresh hub ${hubFresh}`);
});

// Sixty tips in fifteen seconds, then back to base
const soakDonations = (label, url, opts) => withPage(`soak: donations (${label})`, url, async (b) => {
  const { until, rendered, settled, snapshot, heapDetail, within } = await soak(b);
  await settled();
  await rendered(2);
  const before = await snapshot();
  // A tip, then the shut crates and where to tap
  const scan = (sats) => b.evaluate(`(() => { const B = window.__ooga; if (${sats}) B.demoTip(${sats}); return { crates: B.crates.length, landed: B.crates.filter((c) => !c.opened && c.node.visible && Math.abs(c.node.position.y) < 0.05).map((c) => { const p = B.project(c.node.position.x, c.node.position.y + 0.3, c.node.position.z); return p && { x: Math.round(p.x), y: Math.round(p.y) }; }).filter(Boolean) }; })()`);
  let tapped = 0;
  const openLanded = async (r) => {
    for (const c of r.landed) await b.click(c.x, c.y);
    tapped += r.landed.length;
  };
  const start = await b.evaluate("performance.now()");
  for (let i = 0; i < 60; i++) {
    await openLanded(await scan(i % 4 === 3 ? 120000 : 1200));
    await until(`performance.now() >= ${start + 250 * (i + 1)}`, 2000);
  }
  // The last crates land late and leave later
  let crates = -1;
  for (const t0 = Date.now(); crates && Date.now() - t0 < 15000;) {
    const r = await scan(0);
    crates = r.crates;
    await openLanded(r);
    await rendered(6);
  }
  const quiet = await until("B.stats().particles === 0 && B.stats().pendingDrops === 0 && B.stats().deliveries === 0", 15000) && await settled(15000);
  await b.evaluate("(() => { const B = window.__ooga; B.trimPool(); B.housekeep(); })()");
  const after = await snapshot();
  const a = after.stats, s = before.stats;
  record(`soak: donations (${label}): every banana lands and transient pools return to zero`, quiet && crates === 0 && a.crates === 0 && a.particles === 0 && a.tweens === 0 && a.pendingDrops === 0 && a.deliveries === 0 && a.dropsStarted === a.dropsLanded && a.pool <= 32, `${tapped} crates tapped open · ${JSON.stringify({ crates: a.crates, particles: a.particles, pool: a.pool, tweens: a.tweens, drops: `${a.dropsLanded}/${a.dropsStarted}`, pending: a.pendingDrops, built: a.built, shown: await b.evaluate("window.__ooga.shown") })}`);
  record(`soak: donations (${label}): node and target counts back to base`, a.allNodes - a.pool - a.built === s.allNodes - s.pool - s.built && a.targets === s.targets, `allNodes ${s.allNodes} -> ${a.allNodes} (pool ${a.pool}, built ${a.built}), targets ${s.targets} -> ${a.targets}, dom ${s.dom} -> ${a.dom}, listeners ${before.listeners} -> ${after.listeners}`);
  record(`soak: donations (${label}): GPU records bounded`, a.gl.records - s.gl.records <= 20, `${s.gl.records} -> ${a.gl.records}`);
  record(`soak: donations (${label}): heap after GC within 15%`, within(before, after, 0.15), heapDetail(before, after));
}, opts);

// Blocks that measure frame rate or per-frame cost run first, one at a time, with the machine to themselves.
// The rest are independent (each has its own Chrome and profile) and run in parallel lanes, longest first.
const LANES = Number(process.env.LANES) || 6;
const tasks = [];
const task = (name, run, opts = {}) => tasks.push({ name, run, ...opts });
task("weighted delivery", weightedDelivery);
task("cave camera canvas2d", () => matrixNavigation("canvas2d"));
task("soak: donations (race)", soakRaceDonations);
task("soak: donations (hub night)", () => soakDonations("hub night", hubPage(src, "hour=22")));
task("soak: donations (hub)", () => soakDonations("hub", hubPage(src)));
task("soak: donations (lab)", () => soakDonations("lab", page(src), { w: 1920 }));
task("soak: donations (drop)", soakDropDonations);
task("soak: scene cycles", soakScenes);
task("soak: race cycles", soakRace);
task("hub camera", hubCamera);
task("soak: drop cycles", soakDrop);
task("hub crew", hubCrew);
task("drop board", dropBoard);
task("hub flight", hubFlight);
task("hub jetpack", hubJetpack);
task("governor", governor);
task("weighted delivery canvas", weightedDeliveryCanvas);
task("soak: GPU residency", soakResidency);
task("keys", keys);
task("hub race route", hubRace);
task("hub drive", hubDrive);
task("fan", fan);
task("race phone", racePhone);
task("hub drop route", hubDrop);
// The locker counts the inventory, so it goes before the crates whose tips hand out loot
task("locker + crates", () => fold(page(src, "loot=1"), [locker, crates]));
task("race garage", raceGarage);
task("race tracks + physics + AI", () => fold(racePage(src), [raceTracks, racePhysics, raceAi]));
task("hub", hub);
task("race canvas", raceCanvas);
task("hub props", hubProps);
task("drop flow", dropFlow);
task("phone", phone);
task("race items", raceItems);
task("sheet intro", sheetIntro);
task("drop phone", dropPhone);
task("race results", raceResults);
task("hub hop-off", hubHopOff);
task("race weather", raceWeather);
task("cave camera webgl2", () => matrixNavigation("webgl2"));
task("lab drive", labDrive);
task("pile parameter", pileParameter);
task("hub dist", hubDist);
task("props", props);
task("scenes + refresh + weapons", () => fold(page(src), [scenes, refresh, weapons]));
task("race audio", raceAudio);
task("drop audio", dropAudio);
task("race cup", raceCup);
task("drop canvas", dropCanvas);
task("daylight canvas", daylightCanvas);
task("canvas2d fallback", fallback);
task("hub route", hubRoute);
task("pile cap parameter", pileCapParameter);
task("drop physics", dropPhysics);
// No frame-rate check here, but it compares against what dynamic paths recorded
task("mirror canvas", mirrorCanvas);
// Frame-rate and per-frame-cost measurements, alone on the machine
task("core", () => core("source", src), { serial: true });
task("dynamic paths", dynamicPaths, { serial: true });
task("daylight night", daylightNight, { serial: true });
task("day cycle", dayCycle, { serial: true });
task("hub pile", () => fold(hubPage(src), [hubPile]), { serial: true });
task("mirror cave", () => fold(hubPage(src), [mirrorCave]), { serial: true });

const runTasks = async () => {
  const start = (t) => t.run();
  // ONLY=race runs just the blocks whose name contains it
  const picked = tasks.filter((t) => !process.env.ONLY || t.name.includes(process.env.ONLY));
  const queue = picked.filter((t) => !t.serial);
  const lane = async () => {
    while (queue.length) await start(queue.shift());
  };
  for (const t of picked.filter((t) => t.serial)) await start(t);
  await Promise.all(Array.from({ length: LANES }, lane));
};
await runTasks();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${(performance.now() / 60000).toFixed(1)} min`);
process.exit(failed.length ? 1 : 0);
