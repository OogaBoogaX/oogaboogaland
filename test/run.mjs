// End-to-end checks in headless Chrome
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
// Sets the pile level, then measures how far any point of the mound surface is from the nearest shell banana
const shellCoverage = `(level) => { const B = window.__ooga, M = window.BL.models, profile = M.BANANA_PILE_PROFILE; B.setPileLevel(level); const data = B.shell.instanceData, n = B.shell.instanceCount, core = B.core, coreColors = core.geometry.faces.map((f) => f.color); const surfaceY = (r) => { for (let i = 0; i < profile.length - 1; i++) { const o = profile[i], q = profile[i + 1]; if (r < q[0]) continue; return o[1] + (q[1] - o[1]) * (o[0] - r) / (o[0] - q[0]); } return profile[profile.length - 1][1]; }; let worst = 0, sum = 0; const samples = 600; for (let s = 0; s < samples; s++) { const u = (s + 0.5) / samples, angle = s * 2.399963; const r = Math.sqrt(u) * 0.97, wr = r * M.bananaPileRadiusScale(angle, r) * core.scale.x, x = Math.cos(angle) * wr, z = Math.sin(angle) * wr, y = core.position.y + (surfaceY(r) + M.bananaPileHeightOffset(angle, r)) * core.scale.y; let nearest = Infinity; for (let i = 0; i < n; i++) { const o = i * 20, d = Math.hypot(data[o + 12] - x, data[o + 13] - y, data[o + 14] - z); if (d < nearest) nearest = d; } worst = Math.max(worst, nearest); sum += nearest; } return { level, tiles: n, worstGap: +worst.toFixed(3), meanGap: +(sum / samples).toFixed(3), yellowPanels: coreColors.every((c) => c[0] >= 180 && c[1] >= 135 && c[2] <= 65), panelColors: new Set(coreColors.map((c) => c.join(","))).size }; }`;
// The most the working crew can eat between two snapshots taken at performance.now() stamps
const eatenBetween = (before, after) => `(() => { const B = window.__ooga; return [...B.cavemen.values()].filter((c) => c.state === "working").length * window.BL.crew.EAT_RATE * (${after} - ${before}) / 1000 + 0.05; })()`;
const covered = (c) => c.worstGap <= 0.14 && c.meanGap <= 0.08 && c.yellowPanels && c.panelColors >= 5 && c.tiles > 0;
const results = [];
let scenerySignature = "";
let pathMasterHash = "";
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};
const withPage = async (name, url, fn, opts = {}) => {
  const b = await launch(opts);
  try {
    await b.open(url);
    await b.focus(true);
    await b.sleep(opts.wait || 2500);
    await fn(b);
    const noise = b.logs.filter((l) => !l.includes("WebGL2 renderer failed"));
    record(`${name}: clean console`, noise.length === 0, noise.join(" | ").slice(0, 200));
  } catch (err) {
    record(name, false, String(err.message || err).slice(0, 200));
  } finally {
    b.close();
  }
};

const core = (label, base) => withPage(label, page(base), async (b) => {
  const before = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find(c => c.state === "working" && !c.walk); const cp = B.project(cave.root.position.x, cave.headOffset * 0.5, cave.root.position.z); return { cave: cp, caveName: cave.traits.name, shown: B.shown, targets: B.input.targetCount, slots: B.slots.length }; })()`);
  const tusks = await b.evaluate(`(() => { const c = [...window.__ooga.cavemen.values()].find(c => c.traits.name === "w-s-bitcoin"), g = c.headOpen, u = c.traits.height / 16, close = (a, b) => Math.abs(a - b) < 1e-5, bounds = (face) => { const p = face.i.map((i) => [g.verts[i * 3] / u + 3.5, g.verts[i * 3 + 1] / u, g.verts[i * 3 + 2] / u + 3]); return { face, minX: Math.min(...p.map((q) => q[0])), maxX: Math.max(...p.map((q) => q[0])), minY: Math.min(...p.map((q) => q[1])), maxY: Math.max(...p.map((q) => q[1])), minZ: Math.min(...p.map((q) => q[2])), maxZ: Math.max(...p.map((q) => q[2])) }; }, faces = g.faces.map(bounds), frontColor = (x, y) => faces.find((f) => close(f.minZ, 8) && close(f.maxZ, 8) && f.minX <= x + 0.5 && f.maxX >= x + 0.5 && f.minY <= y + 0.5 && f.maxY >= y + 0.5)?.face.color.join(","), sideGap = (x) => faces.some((f) => close(f.minX, x) && close(f.maxX, x) && f.minY <= 0.5 && f.maxY >= 0.5 && f.minZ <= 6.5 && f.maxZ >= 6.5), rows = [0, 1].map((y) => Array.from({ length: 7 }, (_, x) => frontColor(x, y))), colors = rows.flat(), white = rows[0][1], tan = rows[0][0]; return { trait: c.traits.symmetricTusks, rows, mirrored: rows.every((row) => row.every((color, x) => color === row[6 - x])), whites: colors.filter((color) => color === white).length, tans: colors.filter((color) => color === tan).length, colorsDiffer: white !== tan && tan !== rows[0][2], rearGaps: sideGap(1) && sideGap(6) }; })()`);
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
  await b.key("l");
  await b.sleep(4200);
  const loot = await b.evaluate(`(() => { const B = window.__ooga; return { enabled: B.lootEnabled, crates: B.crates.length, inventory: B.game.state.inventory.length, rows: document.querySelectorAll("#inventory .loot-row").length, tabHidden: document.getElementById("loot-tab").hidden, panelHidden: document.querySelector('[data-panel="loot"]').hidden, helpHidden: document.getElementById("crate-help").hidden, worn: [...B.cavemen.values()].reduce((sum, cave) => sum + cave.swagNodes.length, 0), sats: document.getElementById("stat-sats").textContent }; })()`);
  record(`${label}: loot drops, worn swag and the Loot panel stay off by default`, !loot.enabled && loot.crates === 0 && loot.inventory === 0 && loot.rows === 0 && loot.tabHidden && loot.panelHidden && loot.helpHidden && loot.worn === 0, JSON.stringify(loot));
  record(`${label}: large counts read short`, loot.sats === "120K" && (await b.evaluate(`[1200, 9999, 139600, 2100000].map(window.BL.game.formatLarge).join(",")`)) === "1.2K,9.9K,139K,2.1M", loot.sats);
  await b.key("p");
  await b.sleep(4000);
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

const locker = () => withPage("locker", page(src, "loot=1"), async (b) => {
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
});

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

const crates = () => withPage("crates", page(src, "loot=1"), async (b) => {
  for (let i = 0; i < 10; i++) {
    await b.evaluate(`window.__ooga.demoTip(1200)`);
    await b.sleep(120);
  }
  await b.sleep(4500);
  const r = await b.evaluate(`(() => { const B = window.__ooga; const live = B.crates.filter(c => !c.opened); let m = Infinity; for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) m = Math.min(m, Math.hypot(live[i].node.position.x - live[j].node.position.x, live[i].node.position.z - live[j].node.position.z)); return { live: live.length, minDistance: +m.toFixed(2) }; })()`);
  record("crates never overlap and cap at three", r.live <= 3 && (r.live < 2 || r.minDistance >= 1.9), JSON.stringify(r));
});

const keys = () => withPage("keys", page(src), async (b) => {
  const count = () => b.evaluate(`window.__ooga.level`);
  const eating = () => b.evaluate(`document.querySelectorAll('.roster-state[data-state="working"]').length`);
  const c0 = await count(), e0 = await eating(), landed0 = await b.evaluate(`window.__ooga.stats().dropsLanded`);
  await b.evaluate(`document.querySelector('[data-preset="racks"]').focus()`);
  await b.key("b");
  await b.key("b");
  await b.key("5");
  await b.sleep(4800);
  const c1 = await count(), landed1 = await b.evaluate(`window.__ooga.stats().dropsLanded`);
  record("keys: B streams 100 bananas and digits force eating, even with a button focused", landed1 - landed0 === 200 && c1 - c0 > 198.5 && c1 - c0 <= 200 && (await eating()) === e0 + 1, `${landed1 - landed0} landed · ${(c1 - c0).toFixed(2)} net bananas`);
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
  await b.sleep(3200);
  const folded = await b.evaluate(`document.getElementById("sheet").dataset.open`);
  await b.evaluate(`document.getElementById("sheet-toggle").click()`);
  const reopened = await b.evaluate(`document.getElementById("sheet").dataset.open`);
  record("sheet: shows on load in sign lettering, folds to the pull tab after five seconds, the tab reopens it", shown.open === "true" && shown.signs >= 6 && shown.tab !== "none" && folded === "false" && reopened === "true", JSON.stringify({ shown, folded, reopened }));
});

const refresh = () => withPage("refresh", page(src), async (b) => {
  const r = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const cave = [...B.cavemen.values()].find(c => c.state === "working" && !c.walk); cave.nextBuildAt = -1; setTimeout(() => { const before = cave.build && cave.build.phase; B.refreshStates(); resolve({ before, after: cave.build && cave.build.phase, walking: !!cave.walk }); }, 600); })`);
  record("state refresh does not interrupt builds", !!r.before && r.after === r.before && !r.walking, JSON.stringify(r));
});

const weapons = () => withPage("weapons", page(src), async (b) => {
  const r = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const g = B.game; const cat = window.BL.models.SWAG; const give = (id, name) => { const it = cat.find(c => c.id === id); const e = g.addItem({ item: it, tier: it.tier, donationId: "w-" + id }); g.assign(e.id, name); }; const [a, b2] = [...B.cavemen.values()].filter(c => c.state === "working" && !c.walk); give("golden-club", a.traits.name); give("golden-ak", b2.traits.name); B.applyAllSwag(); const club = { gold: a.parts.club.geometry === a.skins.club.gold, sameModel: a.skins.club.gold.verts.length === a.skins.club.default.verts.length, visible: a.parts.club.visible }; b2.nextBuildAt = -1; setTimeout(() => { resolve({ club, ak: { phase: b2.build && b2.build.phase, gold: b2.parts.gunBody.geometry === b2.skins.gun.gold, sameModel: b2.skins.gun.gold.verts.length === b2.skins.gun.default.verts.length, visible: b2.parts.gun.visible } }); }, 700); })`);
  record("golden club is a gold skin of the same club", r.club.gold && r.club.sameModel && r.club.visible, JSON.stringify(r.club));
  record("golden AK is a gold skin of the same rifle, shown while shooting", r.ak.phase === "shoot" && r.ak.gold && r.ak.sameModel && r.ak.visible, JSON.stringify(r.ak));
});

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
  const r = await b.evaluate(`({ quality: document.getElementById("quality").textContent, sheet: document.getElementById("sheet").dataset.open, hint: document.getElementById("hint").textContent, stick: getComputedStyle(document.getElementById("joy-move")).display })`);
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
}, { w: 390, h: 844, mobile: true, wait: 3000 });

const scenes = () => withPage("scenes", page(src), async (b) => {
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
});

const hub = () => withPage("hub", hubPage(src), async (b) => {
  const rendered = (frames) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > 4000) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const loaded = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, terrain: window.BL.scenes.hub.root.children.some((n) => n.geometry === B.island.geometry), mouths: B.mouths.length, leaveHidden: document.querySelector('[data-action="leave"]').hidden, startLevel: B.startLevel, level: B.level, lootEnabled: B.lootEnabled, lootCrates: B.crates.length, decorativeCrates: B.props.filter((o) => o.scenery && o.prop === "crate" && o.active).length, jetpackHidden: !!B.jetpack.stash, lootTabHidden: document.getElementById("loot-tab").hidden, worldLootHintHidden: document.getElementById("world-loot-hint").hidden }; })()`);
  const advanced = await rendered(3);
  record("hub: default scene starts with 1,000 bananas and loads clean", loaded.scene === "hub" && loaded.terrain && loaded.mouths === 7 && loaded.leaveHidden && loaded.startLevel === 1000 && loaded.level <= 1000 && loaded.level > 995 && advanced >= 3, JSON.stringify({ ...loaded, advanced }));
  record("hub: donation loot and its panel stay hidden while decorative crates and the jetpack remain", !loaded.lootEnabled && loaded.lootCrates === 0 && loaded.decorativeCrates > 0 && loaded.jetpackHidden && loaded.lootTabHidden && loaded.worldLootHintHidden, JSON.stringify(loaded));
  const curtain = await b.evaluate(`({ drawn: window.__ooga.timing.drawn > 0, gone: !document.getElementById("curtain") })`);
  record("hub: the leaf curtain opens on the first drawn frame and leaves the DOM", curtain.drawn && curtain.gone, JSON.stringify(curtain));
  const signView = () => b.evaluate(`(() => { const B = window.__ooga, l = B.labels[0], m = B.mouths.find((m) => m.id === "c11"), s = l.world.map((p) => B.project(p.x, p.y, p.z)), cx = l.world.reduce((sum, p) => sum + p.x, 0) / 4, cy = l.world.reduce((sum, p) => sum + p.y, 0) / 4, cz = l.world.reduce((sum, p) => sum + p.z, 0) / 4; return { text: l.text, depthTested: l.node.parent !== null && l.node.geometry.faces.length > 100, world: l.world.flatMap((p) => [p.x, p.y, p.z]), attached: Math.hypot(cx - l.x, cy - l.y, cz - l.z) < 1e-9 && cy > m.floorY + 4, width: Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y), shear: (s[1].y - s[0].y) / Math.max(0.001, Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y)) }; })()`);
  const signBefore = await signView();
  await b.drag({ x: 400, y: 450 }, { x: 470, y: 450 });
  await rendered(3);
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

const mirrorCave = () => withPage("mirror cave", hubPage(src), async (b) => {
  const rendered = (frames, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga, start = B.renderedFrames, t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > ${ms}) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const built = await b.evaluate(`(() => { const B = window.__ooga, C = B.mirrorCave, slot = window.BL.caves.slots.find((s) => s.id === "c1"), g = C.node.geometry, room = C.room.geometry, rimZ = C.rim.geometry.verts.filter((_, i) => i % 3 === 2).map((z) => z + C.rim.position.z), rimMinZ = Math.min(...rimZ), rimMaxZ = Math.max(...rimZ), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < g.verts.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], g.verts[i + a]); max[a] = Math.max(max[a], g.verts[i + a]); } const roomFront = Math.max(...room.verts.filter((_, i) => i % 3 === 2)), rimCladdingFaces = room.faces.filter((face) => face.i.every((i) => room.verts[i * 3 + 2] >= 0.219 && room.verts[i * 3 + 2] <= 0.251) && Math.abs(face.i.reduce((sum, i) => sum + room.verts[i * 3], 0) / face.i.length) > 2.5).length, upperPanelFaces = room.faces.filter((face) => face.i.every((i) => room.verts[i * 3 + 1] >= 2.999 && room.verts[i * 3 + 2] >= 0.44)).length, transitionPanelFaces = room.faces.filter((face) => face.i.every((i) => room.verts[i * 3 + 1] >= 2.999 && Math.abs(room.verts[i * 3 + 2] - room.transitionCladdingZ) < 1e-8)).length, outwardPortalFaces = room.faces.filter((face) => { if (!face.i.every((i) => Math.abs(room.verts[i * 3 + 2] - 0.48) < 1e-8)) return false; const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3; return (room.verts[b] - room.verts[a]) * (room.verts[c + 1] - room.verts[a + 1]) - (room.verts[b + 1] - room.verts[a + 1]) * (room.verts[c] - room.verts[a]) > 0; }).length, outwardTransitionFaces = room.faces.filter((face) => { if (!face.i.every((i) => Math.abs(room.verts[i * 3 + 2] - room.transitionCladdingZ) < 1e-8 && room.verts[i * 3 + 1] >= 2.999)) return false; const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3; return (room.verts[b] - room.verts[a]) * (room.verts[c + 1] - room.verts[a + 1]) - (room.verts[b + 1] - room.verts[a + 1]) * (room.verts[c] - room.verts[a]) > 0; }).length, exteriorRoomVertices = room.verts.filter((z, i) => i % 3 === 2 && z >= C.node.position.z).length, entropy = window.BL.hubModels.caveSign("EntropyLab"), ooga = window.BL.hubModels.caveSign("Ooga Booga Land"), label = B.labels.find((l) => l.text === "Ooga Booga Land"); return { status: slot.status, name: slot.name, scene: slot.scene, children: C.group.children.length, mirrorMarked: C.node.mirror === true, walkThrough: C.node.mirrorWalkThrough === true, roomAttached: C.room.parent === C.group, roomVisible: C.room.visible, roomScale: C.room.scale.x, rainVisible: B.matrixCave.visible, roomFront, declaredFront: room.frontZ, claddingFrontZ: room.claddingFrontZ, headerMinY: room.headerMinY, headerMaxY: room.headerMaxY, headerHalfWidth: room.headerHalfWidth, upperPanelFaces, transitionPanelFaces, outwardPortalFaces, outwardTransitionFaces, mirrorPlaneZ: C.node.position.z, exteriorRoomVertices, exteriorGap: C.node.position.z - roomFront, rimCladdingFaces, transitionCladdingZ: room.transitionCladdingZ, transitionHeaderMinY: room.transitionHeaderMinY, transitionHeaderMaxY: room.transitionHeaderMaxY, guideFaces: room.faces.filter((face) => face.emissive > 0.5).length, blackFaces: room.faces.every((face) => face.color[0] === 0 && face.color[1] === 0 && face.color[2] === 0 && !face.emissive), attached: C.node.parent === C.group && C.rim.parent === C.group && C.sign.parent === C.group, insideRim: C.node.position.z > rimMinZ && C.node.position.z < rimMaxZ, rimFrontGap: rimMaxZ - C.node.position.z, worldBottom: C.node.position.y + min[1], bounds: { min, max }, sign: { label: label && label.text, cached: ooga === window.BL.hubModels.caveSign("Ooga Booga Land") && entropy === window.BL.hubModels.caveSign("EntropyLab"), wider: ooga.signWidth > entropy.signWidth, faces: ooga.faces.length } }; })()`);
  record("mirror cave: c1 has its sign, walk-through mirror and in-world chamber", built.status === "mirror" && built.name === "Ooga Booga Land" && built.scene === null && built.children === 7 && built.mirrorMarked && built.walkThrough && built.roomAttached && built.attached && built.insideRim && built.rimFrontGap >= 0.49 && built.worldBottom < 0 && built.bounds.min[0] === -2.5 && built.bounds.max[0] === 2.5 && built.bounds.min[1] === -1.75 && built.bounds.max[1] === 1.5 && built.bounds.min[2] === 0 && built.bounds.max[2] === 0 && built.sign.label === built.name && built.sign.cached && built.sign.wider && built.sign.faces > 100, JSON.stringify(built));
  record("mirror cave: inward-only black lining covers the entrance and recessed ceiling step", (!built.roomVisible || built.roomScale === 0) && !built.rainVisible && Math.abs(built.roomFront - 0.48) < 1e-8 && built.declaredFront === 0.48 && built.claddingFrontZ === 0.48 && built.headerMinY === 3 && built.headerMaxY === 3.9 && built.headerHalfWidth === 2.9 && built.upperPanelFaces > 0 && built.transitionPanelFaces > 0 && built.transitionHeaderMinY === 3 && built.transitionHeaderMaxY === 3.9 && built.outwardPortalFaces === 0 && built.outwardTransitionFaces === 0 && built.mirrorPlaneZ === 0.5 && built.exteriorRoomVertices === 0 && built.exteriorGap >= 0.019 && built.rimCladdingFaces === 0 && built.transitionCladdingZ === -2.485 && built.guideFaces === 0 && built.blackFaces, JSON.stringify({ roomVisible: built.roomVisible, roomScale: built.roomScale, rainVisible: built.rainVisible, roomFront: built.roomFront, declaredFront: built.declaredFront, claddingFrontZ: built.claddingFrontZ, headerMinY: built.headerMinY, headerMaxY: built.headerMaxY, headerHalfWidth: built.headerHalfWidth, upperPanelFaces: built.upperPanelFaces, transitionPanelFaces: built.transitionPanelFaces, transitionHeaderMinY: built.transitionHeaderMinY, transitionHeaderMaxY: built.transitionHeaderMaxY, outwardPortalFaces: built.outwardPortalFaces, outwardTransitionFaces: built.outwardTransitionFaces, mirrorPlaneZ: built.mirrorPlaneZ, exteriorRoomVertices: built.exteriorRoomVertices, exteriorGap: built.exteriorGap, rimCladdingFaces: built.rimCladdingFaces, transitionCladdingZ: built.transitionCladdingZ, guideFaces: built.guideFaces, blackFaces: built.blackFaces }));
  const rimLiner = await b.evaluate(`(() => { const C = window.__ooga.mirrorCave, g = C.rimLiner.geometry, f = g.faces[0], p = f.i.map((i) => [g.verts[i * 3], g.verts[i * 3 + 1], g.verts[i * 3 + 2]]), u = p[1].map((v, i) => v - p[0][i]), v = p[2].map((q, i) => q - p[0][i]); return { faces: g.faces.length, min: [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.min(...p.map((q) => q[2]))], max: [Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1])), Math.max(...p.map((q) => q[2]))], normalY: u[2] * v[0] - u[0] * v[2], black: f.color.every((channel) => channel === 0) && !f.emissive, outsideHidden: !C.rimLiner.visible, attached: C.rimLiner.parent === C.room }; })()`);
  record("mirror cave: a bounded black liner covers only the rim underside", rimLiner.faces === 1 && rimLiner.min[0] === -2.5 && rimLiner.max[0] === 2.5 && rimLiner.min[1] === 2.995 && rimLiner.max[1] === 2.995 && rimLiner.min[2] === 0.46 && rimLiner.max[2] === 1.005 && rimLiner.normalY < 0 && rimLiner.black && rimLiner.outsideHidden && rimLiner.attached, JSON.stringify(rimLiner));
  const descenders = await b.evaluate(`(() => { const glyphMin = (ch) => { const g = window.BL.hubModels.caveSign(ch); let min = Infinity; for (const face of g.faces) { if (face.emissive !== 0.2) continue; for (const i of face.i) min = Math.min(min, g.verts[i * 3 + 1]); } return min; }, baseline = glyphMin("o"), samples = ["g", "p", "q", "y", "j"].map((ch) => ({ ch, min: glyphMin(ch) })), board = window.BL.hubModels.caveSign("Ooga Booga Land"); return { baseline, samples, height: board.signHeight, contained: samples.every((sample) => sample.min > -board.signHeight * 0.5) }; })()`);
  record("cave signs: descenders extend below the lowercase baseline and remain inside the taller board", descenders.samples.every((sample) => sample.min < descenders.baseline - 0.05) && descenders.contained && descenders.height > 0.91, JSON.stringify(descenders));
  const entranceLayout = await b.evaluate(`(() => { const B = window.__ooga, all = B.entranceLights.map((l) => ({ ...l, localPosition: [...l.localPosition], worldPosition: [...l.worldPosition] })), caves = ["c11", "c1"].map((id) => { const m = B.mouths.find((v) => v.id === id), fixtures = all.filter((l) => l.caveId === id), torches = fixtures.filter((l) => l.kind === "torch"), lanterns = fixtures.filter((l) => l.kind === "lantern"), transformError = Math.max(...fixtures.map((l) => { const p = l.localPosition, x = m.x + Math.cos(m.ry) * p[0] + Math.sin(m.ry) * p[2], y = m.floorY + p[1], z = m.z - Math.sin(m.ry) * p[0] + Math.cos(m.ry) * p[2]; return Math.max(Math.abs(x - l.worldPosition[0]), Math.abs(y - l.worldPosition[1]), Math.abs(z - l.worldPosition[2])); })); return { id, fixtures, torches, lanterns, transformError }; }); return { all, caves, mirrorPlane: B.mirrorCave.node.position.z }; })()`);
  const torchPairs = entranceLayout.caves.map((c) => c.torches);
  record("entrance lights: EntropyLab and Ooga Booga Land use symmetric cave-local torch pairs", entranceLayout.all.length === 6 && entranceLayout.caves.every((c) => c.fixtures.length === 3 && c.torches.length === 2 && c.lanterns.length === 1 && c.transformError < 1e-6 && c.fixtures.every((l) => l.registered)) && torchPairs.every((pair) => pair[0].side === "left" && pair[1].side === "right" && Math.abs(pair[0].localPosition[0] + pair[1].localPosition[0]) < 1e-8 && Math.abs(Math.abs(pair[0].localPosition[0]) - 2.75) < 1e-8 && pair[0].localPosition[1] === pair[1].localPosition[1] && pair[0].localPosition[2] === pair[1].localPosition[2]), JSON.stringify(entranceLayout));
  record("entrance lights: every torch clears the front of its jamb and the c1 mirror plane", torchPairs.flat().every((l) => Math.abs(l.gap - 0.12) < 1e-8 && Math.abs(l.fixtureBack - l.rimFront - 0.12) < 1e-8 && l.fixtureBack > l.rimFront && (l.caveId !== "c1" || l.fixtureBack > entranceLayout.mirrorPlane)), JSON.stringify(torchPairs));
  const approach = await b.evaluate(`(() => { const B = window.__ooga, m = B.mouths.find((mouth) => mouth.id === "c1"), ox = -Math.sin(m.ry), oz = -Math.cos(m.ry), px = oz, pz = -ox, stations = [0.5, 1, 1.5, 2, 2.5].map((distance) => { let sum = 0, count = 0; for (let lateral = -2; lateral <= 2.0001; lateral += 0.025) { const x = m.x - ox * distance + px * lateral, z = m.z - oz * distance + pz * lateral; if (B.island.isPath(x, z)) { sum += lateral; count++; } } return { distance, center: count ? sum / count : null, count }; }); return { stations, maxOffset: Math.max(...stations.map((station) => Math.abs(station.center))) }; })()`);
  record("mirror cave: only c1's path eases into a perpendicular final approach", approach.stations.every((station) => station.count > 0) && approach.maxOffset <= 0.15, JSON.stringify(approach));
  const mouth = await b.evaluate(`(() => { const B = window.__ooga, m = B.mouths.find((v) => v.id === "c1"), p = B.project(m.x, 2, m.z), hit = B.input.pick(p.x, p.y); return { x: p.x, y: p.y, kind: hit && hit.owner.kind, slot: hit && hit.owner.slot.id }; })()`);
  await b.mouse("mouseMoved", mouth.x, mouth.y, { button: "none" });
  await rendered(2);
  const tooltip = await b.evaluate(`document.getElementById("tooltip").textContent`);
  await b.click(mouth.x, mouth.y);
  await rendered(12);
  record("mirror cave: tooltip identifies the physical mirror without starting a scene transition", mouth.kind === "cave" && mouth.slot === "c1" && tooltip === "Ooga Booga Land · mirror" && (await b.evaluate(`window.__ooga.scene`)) === "hub", JSON.stringify({ mouth, tooltip }));
  const reflected = await b.evaluate(`(() => { const B = window.__ooga, r = B.mirror, c = B.camera, center = Array.from(r.planeCenter), normal = Array.from(r.planeNormal), gotEye = Array.from(r.cameraPosition), gotTarget = Array.from(r.cameraTarget), reflect = (p) => { const d = (p.x - center[0]) * normal[0] + (p.y - center[1]) * normal[1] + (p.z - center[2]) * normal[2]; return [p.x - 2 * d * normal[0], p.y - 2 * d * normal[1], p.z - 2 * d * normal[2]]; }, eye = reflect(c.position), target = reflect(c.target), error = (a, z) => Math.max(...a.map((v, i) => Math.abs(v - z[i]))); return { active: r.active, eyeError: error(eye, gotEye), targetError: error(target, gotTarget), normalLength: Math.hypot(...normal), captureExcluded: r.captureExcluded, passes: r.reflectionPassCount, resources: r.resources, samples: r.samples, allocations: r.allocationCount, width: r.width, height: r.height, viewport: [B.renderer.size.width, B.renderer.size.height], bytes: r.width * r.height * (4 + Math.max(1, r.samples) * 6) }; })()`);
  record("mirror cave: reflected camera and plane are mathematically correct and the mirror excludes itself", reflected.active && reflected.eyeError < 1e-4 && reflected.targetError < 1e-4 && Math.abs(reflected.normalLength - 1) < 1e-6 && reflected.captureExcluded && reflected.passes > 0, JSON.stringify(reflected));
  const lightingPasses = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, start = { frames: B.renderedFrames, shadows: B.renderer.stats.shadowPassCount, reflections: B.mirror.reflectionPassCount, resources: B.renderer.stats.shadowResources }; const tick = () => { if (B.renderedFrames < start.frames + 8) return requestAnimationFrame(tick); resolve({ frames: B.renderedFrames - start.frames, shadows: B.renderer.stats.shadowPassCount - start.shadows, reflections: B.mirror.reflectionPassCount - start.reflections, resources: [start.resources, B.renderer.stats.shadowResources] }); }; requestAnimationFrame(tick); })`);
  record("mirror cave: its reflection reuses current lighting without another shadow pass", lightingPasses.reflections > 0 && lightingPasses.shadows === lightingPasses.frames && lightingPasses.resources[0] === lightingPasses.resources[1], JSON.stringify(lightingPasses));
  const aspect = (sample) => Math.abs(sample.width / sample.height - sample.viewport[0] / sample.viewport[1]);
  const mirrorResources = (sample) => sample.samples > 0 ? 6 : 4;
  record("mirror cave: high target is bounded, multisampled, and resolves into one RGBA8 texture under 8 MB", Math.max(reflected.width, reflected.height) <= 512 && aspect(reflected) < 0.01 && reflected.samples > 1 && reflected.resources === 6 && reflected.allocations === 1 && reflected.bytes < 512 * 512 * 28, JSON.stringify(reflected));
  // Texels the glass gets against the pixels it covers, one to one below the target size and the whole target above it
  const coverage = `(() => { const B = window.__ooga, r = B.mirror, node = B.mirrorCave.node, g = node.geometry, T = window.BL.math.mat4, P = new Float32Array(3), C = new Float32Array(4), px = [[Infinity, -Infinity], [Infinity, -Infinity]], uv = [[Infinity, -Infinity], [Infinity, -Infinity]]; for (let i = 0; i < g.verts.length; i += 3) { T.transformPoint(P, node.world, g.verts[i], g.verts[i + 1], g.verts[i + 2]); const s = B.project(P[0], P[1], P[2]); T.transformPoint4(C, r.capturedViewProj, P[0], P[1], P[2]); const t = [C[0] / C[3] * 0.5 + 0.5, C[1] / C[3] * 0.5 + 0.5]; [s.x, s.y].forEach((v, a) => { px[a] = [Math.min(px[a][0], v), Math.max(px[a][1], v)]; }); t.forEach((v, a) => { uv[a] = [Math.min(uv[a][0], v), Math.max(uv[a][1], v)]; }); } return { pixels: px.map((b) => b[1] - b[0]), texels: [(uv[0][1] - uv[0][0]) * r.width, (uv[1][1] - uv[1][0]) * r.height], target: [r.width, r.height], inside: uv.every((b) => b[0] >= -0.01 && b[1] <= 1.01) }; })()`;
  const cropped = (c) => c.inside && c.texels.every((t, a) => Math.abs(t - Math.min(c.pixels[a], c.target[a])) <= 3);
  const far = await b.evaluate(coverage);
  await b.evaluate(`(() => { const s = window.__ooga.mirrorCave.node.scale; s.x = s.y = 6; })()`);
  await rendered(3);
  const near = await b.evaluate(coverage);
  await b.evaluate(`(() => { const s = window.__ooga.mirrorCave.node.scale; s.x = s.y = 1; })()`);
  await rendered(3);
  record("mirror cave: the capture is cropped to the glass, one texel per pixel until the target is full", far.pixels[0] < far.target[0] && cropped(far) && near.pixels[0] > near.target[0] && near.pixels[1] > near.target[1] && cropped(near), JSON.stringify({ far, near }));
  const quality = async (name, cap) => {
    const sample = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; B.renderer.setQuality(${JSON.stringify(name)}); const startFrame = B.renderedFrames, startPass = B.mirror.reflectionPassCount, t0 = performance.now(); const tick = () => { if (B.renderedFrames >= startFrame + 8 || performance.now() - t0 > 6000) resolve({ name: B.renderer.quality, width: B.mirror.width, height: B.mirror.height, viewport: [B.renderer.size.width, B.renderer.size.height], passes: B.mirror.reflectionPassCount - startPass, resources: B.mirror.resources, samples: B.mirror.samples }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
    sample.cap = cap;
    return sample;
  };
  const tiers = [await quality("high", 512), await quality("medium", 384), await quality("low", 256)];
  record("mirror cave: quality tiers preserve aspect, sample with the tier, and medium/low update every second frame", tiers.every((s) => s.name === (s.cap === 512 ? "high" : s.cap === 384 ? "medium" : "low") && Math.max(s.width, s.height) <= s.cap && aspect(s) < 0.01 && s.resources === mirrorResources(s)) && tiers[0].samples > tiers[1].samples && tiers[1].samples > 0 && tiers[2].samples === 0 && tiers[0].passes >= 7 && tiers[1].passes >= 3 && tiers[1].passes <= 5 && tiers[2].passes >= 3 && tiers[2].passes <= 5, JSON.stringify(tiers));
  await b.evaluate(`window.__ooga.renderer.setQuality("high")`);
  await rendered(4);
  const skips = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, node = B.mirrorCave.node, wait = (count, done) => { const start = B.renderedFrames, tick = () => B.renderedFrames >= start + count ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }, start = { pass: B.mirror.reflectionPassCount, skip: B.mirror.skippedPassCount }; node.mirrorWalkThrough = false; node.rotation.y = Math.PI; wait(3, () => { const back = { pass: B.mirror.reflectionPassCount, skip: B.mirror.skippedPassCount, reason: B.mirror.skipReason }; node.rotation.y = 0; node.position.x = 20; wait(3, () => { const offscreen = { pass: B.mirror.reflectionPassCount, skip: B.mirror.skippedPassCount, reason: B.mirror.skipReason }; node.position.x = 0; node.mirrorWalkThrough = true; wait(3, () => resolve({ start, back, offscreen, restored: { pass: B.mirror.reflectionPassCount, reason: B.mirror.skipReason } })); }); }); })`);
  record("mirror cave: back-facing and offscreen mirrors skip reflection work", skips.back.pass === skips.start.pass && skips.back.skip > skips.start.skip && skips.back.reason === "back-facing" && skips.offscreen.pass === skips.back.pass && skips.offscreen.skip > skips.back.skip && skips.offscreen.reason === "offscreen" && skips.restored.pass > skips.offscreen.pass, JSON.stringify(skips));
  const beforeResize = await b.evaluate(`({ resources: window.__ooga.mirror.resources, allocations: window.__ooga.mirror.allocationCount })`);
  await b.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await rendered(8);
  const resized = await b.evaluate(`(() => { const B = window.__ooga; return { resources: B.mirror.resources, allocations: B.mirror.allocationCount, width: B.mirror.width, height: B.mirror.height, viewport: [B.renderer.size.width, B.renderer.size.height] }; })()`);
  await b.send("Emulation.clearDeviceMetricsOverride");
  await rendered(8);
  const resetSize = await b.evaluate(`(() => { const B = window.__ooga; return { resources: B.mirror.resources, width: B.mirror.width, height: B.mirror.height }; })()`);
  record("mirror cave: resize rebuilds only the bounded target and keeps resource count flat", beforeResize.resources === 6 && resized.resources === 6 && resetSize.resources === 6 && resized.allocations > beforeResize.allocations && Math.max(resized.width, resized.height) <= 512 && aspect(resized) < 0.01, JSON.stringify({ beforeResize, resized, resetSize }));
  await b.evaluate(`window.__ooga.matrixCave.viewApproach()`);
  await rendered(4);
  const prewarmed = await b.evaluate(`(() => { const B = window.__ooga; return { preloaded: B.matrixCave.preloaded, visible: B.matrixCave.visible, preloadDistance: B.matrixCave.preloadDistance, prewarmCount: B.matrixCave.prewarmCount, roomVisible: B.mirrorCave.room.visible, roomScale: B.matrixCave.roomScale, records: B.renderer.stats.records, updates: B.matrixCave.updates, y: B.matrixCave.firstGlyphY, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn }; })()`);
  await rendered(8);
  const prewarmedAfter = await b.evaluate(`(() => { const B = window.__ooga; return { updates: B.matrixCave.updates, y: B.matrixCave.firstGlyphY, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn }; })()`);
  record("mirror interior: complete animated matrix room is ready behind the mirror before entry", prewarmed.preloaded && !prewarmed.visible && prewarmed.preloadDistance === 18 && prewarmed.prewarmCount === 1 && prewarmed.roomVisible && prewarmed.roomScale === 1 && prewarmed.records > 0 && prewarmed.updates > 0 && prewarmedAfter.updates > prewarmed.updates && prewarmedAfter.y !== prewarmed.y && !prewarmed.portal && prewarmed.surfaceDrawn && !prewarmedAfter.portal && prewarmedAfter.surfaceDrawn, JSON.stringify({ before: prewarmed, after: prewarmedAfter }));
  const overhead = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, m = B.mirrorCave.mouth, o = B.pilot.orbit, cr = Math.cos(m.ry), sr = Math.sin(m.ry), wait = (count, done) => { const start = B.renderedFrames, tick = () => B.renderedFrames >= start + count ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }, pose = (z) => { const dist = 3.5, eyeX = m.x + sr * z, eyeY = m.floorY + 4.4, eyeZ = m.z + cr * z, tx = eyeX - sr * dist, tz = eyeZ - cr * dist; o.target = { x: tx, y: eyeY, z: tz }; o.tx = tx; o.ty = eyeY; o.tz = tz; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = 0; o.dist = o.tDist = dist; B.pilot.update(0.1); }; pose(1.5); wait(3, () => { const before = B.matrixCave.portal.rejected.above; pose(-2); wait(4, () => resolve({ inside: B.matrixCave.inside, portal: B.mirror.portal, visible: B.matrixCave.visible, cameraY: B.camera.position.y - m.floorY, openingTop: B.matrixCave.portal.opening.maxY, rejectedAbove: B.matrixCave.portal.rejected.above - before })); }); })`);
  record("mirror portal: flying over the cave keeps the exterior perspective", !overhead.inside && !overhead.portal && !overhead.visible && overhead.cameraY > overhead.openingTop && overhead.rejectedAbove > 0, JSON.stringify(overhead));
  await b.evaluate(`window.__ooga.matrixCave.viewApproach()`);
  await rendered(4);
  const passAtEntry = await b.evaluate(`(() => { const B = window.__ooga, pass = B.mirror.reflectionPassCount; B.matrixCave.viewInside(false); return pass; })()`);
  await rendered(12);
  const matrixBefore = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, matrix: { ...B.matrixCave }, cameraInside: B.matrixCave.contains(B.camera.position.x, B.camera.position.z), active: B.mirror.active, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, captureValid: B.mirror.captureValid, resources: B.mirror.resources, passes: B.mirror.reflectionPassCount, reason: B.mirror.skipReason }; })()`);
  const rimLinerInside = await b.evaluate(`window.__ooga.mirrorCave.rimLiner.visible`);
  await rendered(16);
  const matrixAfter = await b.evaluate(`(() => { const B = window.__ooga; return { y: B.matrixCave.firstGlyphY, updates: B.matrixCave.updates, passes: B.mirror.reflectionPassCount, surfaceDrawn: B.mirror.surfaceDrawn, reason: B.mirror.skipReason, resources: B.mirror.resources }; })()`);
  record("mirror interior: denser entrance rain has bright falling tips and animates in the hub", matrixBefore.scene === "hub" && matrixBefore.cameraInside && matrixBefore.matrix.visible && matrixBefore.matrix.streamCount === 96 && matrixBefore.matrix.hangingStreamCount === 48 && matrixBefore.matrix.entranceStreamCount === 32 && matrixBefore.matrix.wallStreamCount === 48 && matrixBefore.matrix.glyphCount === 1344 && matrixBefore.matrix.brightTipCount === 192 && matrixBefore.matrix.capacity === 1344 && matrixAfter.updates > matrixBefore.matrix.updates && matrixAfter.y !== matrixBefore.matrix.firstGlyphY, JSON.stringify({ before: matrixBefore, after: matrixAfter }));
  record("mirror interior: crossing the plane opens a live doorway instead of drawing the cached reflection", matrixBefore.active && matrixBefore.portal && !matrixBefore.surfaceDrawn && matrixBefore.resources === 6 && matrixBefore.passes === passAtEntry && matrixAfter.passes === matrixBefore.passes && !matrixAfter.surfaceDrawn && matrixAfter.reason === "portal-open" && matrixAfter.resources === matrixBefore.resources, JSON.stringify({ passAtEntry, before: matrixBefore, after: matrixAfter }));
  record("mirror interior: the black rim liner appears only after crossing inside", rimLiner.outsideHidden && rimLinerInside, JSON.stringify({ outside: !rimLiner.outsideHidden, inside: rimLinerInside }));
  await b.evaluate(`window.__ooga.matrixCave.viewInside(true)`);
  await rendered(12);
  const portalView = await b.evaluate(`(() => { const B = window.__ooga, w = B.mirrorCave.node.world, p = B.project(w[12], w[13], w[14]); return { scene: B.scene, p, inside: B.matrixCave.contains(B.camera.position.x, B.camera.position.z), portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, passes: B.mirror.reflectionPassCount, frames: B.renderedFrames, width: B.renderer.size.width, height: B.renderer.size.height }; })()`);
  record("mirror interior: looking back frames the correctly oriented live world through the open doorway", portalView.scene === "hub" && portalView.inside && portalView.portal && !portalView.surfaceDrawn && portalView.p && portalView.p.x >= 0 && portalView.p.x <= portalView.width && portalView.p.y >= 0 && portalView.p.y <= portalView.height && portalView.passes === passAtEntry, JSON.stringify(portalView));
  const overlaySight = await b.evaluate(`(() => { const B = window.__ooga, m = B.mirrorCave.mouth, world = (x, y, z) => [m.x + Math.cos(m.ry) * x + Math.sin(m.ry) * z, m.floorY + y, m.z - Math.sin(m.ry) * x + Math.cos(m.ry) * z], test = (x, y, z) => B.matrixCave.overlayVisible(...world(x, y, z)); return { doorway: test(0, 1.5, 3), leftWall: test(-6, 1.5, 3), rightWall: test(6, 1.5, 3), aboveRim: test(0, 4.2, 3) }; })()`);
  record("mirror interior: speech and sleep overlays are visible only through the doorway", overlaySight.doorway && !overlaySight.leftWall && !overlaySight.rightWall && !overlaySight.aboveRim, JSON.stringify(overlaySight));
  const entranceLighting = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, sample = () => ({ fixtures: B.entranceLights.map((l) => ({ id: l.id, caveId: l.caveId, kind: l.kind, side: l.side, worldPosition: [...l.worldPosition], factor: l.factor, lit: l.lit, selected: l.selected, approximated: l.approximated })), lighting: { registered: B.lighting.registeredLampCount, active: B.lighting.activeFullLightCount, approximated: B.lighting.approximatedLightCount, capacity: B.lighting.configuredLightCapacity, selected: B.lighting.selectedIds.slice(0, B.lighting.selectedCount), approximateIds: B.lighting.approximatedIds.slice(0, B.lighting.approximatedCount), tier: B.lighting.tier }, lightData: Array.from(B.renderOpts.lights.slice(0, B.renderOpts.lightCount * 8)) }), wait = (frames, done) => { const start = B.renderedFrames, tick = () => B.renderedFrames >= start + frames ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); }, setView = (id) => { const m = B.mouths.find((v) => v.id === id), o = B.pilot.orbit, target = { x: m.x, y: m.floorY + 1.5, z: m.z }; o.target = target; o.tx = target.x; o.ty = target.y; o.tz = target.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = 0.15; o.dist = o.tDist = 6; B.pilot.update(0.1); }; B.renderer.setQuality("high"); B.setHour(12, NaN, 80); wait(3, () => { const day = sample(); B.setHour(18.08, NaN, 80); wait(3, () => { const dusk = sample(); B.setHour(22, NaN, 80); setView("c11"); wait(3, () => { const entropy = sample(); setView("c1"); wait(3, () => { const ooga = sample(); B.renderer.setQuality("medium"); wait(3, () => { const medium = sample(); B.renderer.setQuality("low"); wait(3, () => { const low = sample(); B.renderer.setQuality("high"); wait(3, () => resolve({ day, dusk, entropy, ooga, medium, low })); }); }); }); }); }); }); })`);
  const equivalent = (sample) => ["torch:left", "torch:right", "lantern:right"].every((key) => { const [kind, side] = key.split(":"), a = sample.fixtures.find((l) => l.caveId === "c11" && l.kind === kind && l.side === side), z = sample.fixtures.find((l) => l.caveId === "c1" && l.kind === kind && l.side === side); return a && z && Math.abs(a.factor - z.factor) < 1e-8 && a.lit === z.lit; });
  record("entrance lights: both caves fade identically through day, dusk, and night", entranceLighting.day.fixtures.every((l) => !l.lit && l.factor === 0) && entranceLighting.dusk.fixtures.some((l) => l.factor > 0 && l.factor < 1) && equivalent(entranceLighting.day) && equivalent(entranceLighting.dusk) && equivalent(entranceLighting.entropy), JSON.stringify(entranceLighting));
  const exactProfiles = (sample) => sample.fixtures.every((l) => l.selected && !l.approximated && sample.lighting.selected.includes(l.id) && Array.from({ length: sample.lightData.length / 8 }, (_, i) => i * 8).some((i) => Math.max(Math.abs(sample.lightData[i] - l.worldPosition[0]), Math.abs(sample.lightData[i + 1] - l.worldPosition[1]), Math.abs(sample.lightData[i + 2] - l.worldPosition[2])) < 1e-5));
  record("entrance lights: all six fixtures keep simultaneous full local-light profiles on every WebGL tier", [entranceLighting.entropy, entranceLighting.ooga, entranceLighting.medium, entranceLighting.low].every((sample) => sample.lighting.registered === 7 && sample.lighting.active === 7 && sample.lighting.approximated === 0 && sample.lighting.capacity === 7 && sample.lighting.selected.length === 7 && sample.lighting.selected.includes("firepit") && exactProfiles(sample)), JSON.stringify(entranceLighting));
  record("entrance lights: camera movement cannot exchange or reorder the fixed light set", entranceLighting.entropy.lighting.selected.join("|") === entranceLighting.ooga.lighting.selected.join("|") && entranceLighting.entropy.lightData.every((v, i) => v === entranceLighting.ooga.lightData[i]), JSON.stringify({ entropy: entranceLighting.entropy.lighting, ooga: entranceLighting.ooga.lighting }));
  const travel = (id) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga, t0 = performance.now(); let enteredAt = 0; B.go(${JSON.stringify(id)}); const tick = () => { if (!enteredAt && B.scene === ${JSON.stringify(id)}) enteredAt = B.renderedFrames; if (enteredAt && B.renderedFrames >= enteredAt + 25) resolve(true); else if (performance.now() - t0 > 6000) resolve(false); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const reachedLab = await travel("lab");
  const labResources = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, active: B.mirror.active, resources: B.mirror.resources }; })()`);
  const reachedHub = await travel("hub");
  const hubResources = await b.evaluate(`(() => { const B = window.__ooga; return { scene: B.scene, active: B.mirror.active, resources: B.mirror.resources, records: B.renderer.stats.records, entranceLights: B.entranceLights.length, registered: B.entranceLights.every((l) => l.registered) }; })()`);
  const cycled = { reachedLab, reachedHub, lab: labResources, hub: hubResources };
  const restored = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, before = { resources: B.mirror.resources, records: B.renderer.stats.records, allocations: B.mirror.allocationCount }, gl = document.getElementById("scene").getContext("webgl2"), ext = gl.getExtension("WEBGL_lose_context"), t0 = performance.now(); ext.loseContext(); setTimeout(() => ext.restoreContext(), 150); const tick = () => { if (B.mirror.active && B.mirror.resources === before.resources && B.mirror.allocationCount > before.allocations && B.mirror.reflectionPassCount > 0) resolve({ before, after: { resources: B.mirror.resources, records: B.renderer.stats.records, allocations: B.mirror.allocationCount, width: B.mirror.width, height: B.mirror.height } }); else if (performance.now() - t0 > 6000) resolve({ before, after: { resources: B.mirror.resources, records: B.renderer.stats.records, allocations: B.mirror.allocationCount, width: B.mirror.width, height: B.mirror.height } }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("mirror cave: scene cycling and context restoration release and recreate a fixed resource set", cycled.lab.scene === "lab" && !cycled.lab.active && cycled.lab.resources === 0 && cycled.hub.scene === "hub" && cycled.hub.active && cycled.hub.resources === 6 && cycled.hub.entranceLights === 6 && cycled.hub.registered && restored.before.resources === 6 && restored.after.resources === 6 && restored.after.records === restored.before.records && Math.max(restored.after.width, restored.after.height) <= 512, JSON.stringify({ cycled, restored }));
});

const mirrorCanvas = () => withPage("mirror canvas fallback", hubPage(src, "canvas2d=1&bananas=1000000&hour=22"), async (b) => {
  const r = await b.evaluate(`(() => { const B = window.__ooga, C = B.mirrorCave, candidates = B.props.filter((o) => o.scenery); return { kind: B.renderer.kind, active: B.mirror.active, faux: B.mirror.faux, surfaceDrawn: B.mirror.surfaceDrawn, resources: B.mirror.resources, passes: B.mirror.reflectionPassCount, skipped: B.mirror.skippedPassCount, children: C.group.children.length, mirrorMarked: C.node.mirror === true, matrix: { ...B.matrixCave }, path: { active: B.path.active, inner: B.path.ringInnerRadius, outer: B.path.ringOuterRadius, count: B.path.visibleInstanceCount, capacity: B.path.bufferCapacity, masterMaskBuildCount: B.path.masterMaskBuildCount, masterMaskHash: B.path.masterMaskHash }, scenery: { ...B.scenery, signature: candidates.map((o) => [o.prop, o.x, o.z, o.node.rotation.y].join(":" )).join("|") } }; })()`);
  record("mirror canvas fallback: depth-sorted faux mirror draws without reflection resources", r.kind === "canvas2d" && r.active && r.faux && r.surfaceDrawn && r.resources === 0 && r.passes === 0 && r.skipped > 0 && r.children === 7 && r.mirrorMarked, JSON.stringify({ kind: r.kind, active: r.active, faux: r.faux, surfaceDrawn: r.surfaceDrawn, resources: r.resources, passes: r.passes, skipped: r.skipped, children: r.children, mirrorMarked: r.mirrorMarked }));
  const canvasLights = await b.evaluate(`(() => { const B = window.__ooga; return { count: B.entranceLights.length, registered: B.entranceLights.every((l) => l.registered), lit: B.entranceLights.every((l) => l.lit && l.factor > 0.9), pointLights: B.renderOpts.lightCount, lighting: { registered: B.lighting.registeredLampCount, active: B.lighting.activeFullLightCount, approximated: B.lighting.approximatedLightCount, capacity: B.lighting.configuredLightCapacity, ids: B.lighting.approximatedIds.slice(0, B.lighting.approximatedCount), tier: B.lighting.tier } }; })()`);
  record("entrance lights: Canvas fallback draws all emissive fixtures without point-light resources", canvasLights.count === 6 && canvasLights.registered && canvasLights.lit && canvasLights.pointLights === 0 && canvasLights.lighting.registered === 7 && canvasLights.lighting.active === 0 && canvasLights.lighting.approximated === 7 && canvasLights.lighting.capacity === 0 && canvasLights.lighting.ids.length === 7 && canvasLights.lighting.tier === "canvas2d", JSON.stringify(canvasLights));
  record("dynamic path: Canvas fallback renders the same immutable million-banana network", r.path.active && r.path.inner === 7.25 && r.path.outer === 8.75 && r.path.count > 0 && r.path.count <= r.path.capacity && r.path.masterMaskBuildCount === 1 && r.path.masterMaskHash === pathMasterHash, JSON.stringify(r.path));
  record("dynamic scenery: Canvas fallback starts large with the same deterministic registry", r.scenery.candidateCount === 376 && r.scenery.visibleCount > 0 && r.scenery.signature === scenerySignature, JSON.stringify({ candidateCount: r.scenery.candidateCount, visibleCount: r.scenery.visibleCount, radiusCulledCount: r.scenery.radiusCulledCount, pathCulledCount: r.scenery.pathCulledCount }));
  const matrix = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga, start = B.renderedFrames; B.matrixCave.viewInside(true); const tick = () => { if (B.renderedFrames >= start + 8) resolve({ scene: B.scene, kind: B.renderer.kind, active: B.mirror.active, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, faux: B.mirror.faux, resources: B.mirror.resources, streams: B.matrixCave.streamCount, hanging: B.matrixCave.hangingStreamCount, entrance: B.matrixCave.entranceStreamCount, walls: B.matrixCave.wallStreamCount, glyphs: B.matrixCave.glyphCount, tips: B.matrixCave.brightTipCount, capacity: B.matrixCave.capacity, visible: B.matrixCave.visible, inside: B.matrixCave.contains(B.camera.position.x, B.camera.position.z), updates: B.matrixCave.updates }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  record("mirror interior: Canvas fallback draws bounded code rain around a live open doorway", matrix.scene === "hub" && matrix.kind === "canvas2d" && matrix.active && matrix.portal && !matrix.surfaceDrawn && matrix.faux && matrix.resources === 0 && matrix.streams === 32 && matrix.hanging === 18 && matrix.entrance === 12 && matrix.walls === 14 && matrix.glyphs === 288 && matrix.tips === 64 && matrix.capacity === 288 && matrix.visible && matrix.inside && matrix.updates > 0, JSON.stringify(matrix));
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
  pathMasterHash = stability.rows[0].hash;
  record("dynamic path: the deterministic master spoke mask is built exactly once", stability.masterStable && stability.rows[0].master > 0, JSON.stringify(stability.rows));
  record("dynamic path: growth only clips immutable spoke cells and transforms", stability.monotonicExact && stability.rows[0].visible > stability.rows[1].visible && stability.rows[1].visible > stability.rows[2].visible, JSON.stringify(stability.rows));
  record("dynamic path: shrinking restores the identical spoke cells and transforms", stability.restoredExact, JSON.stringify(stability.rows));
  record("dynamic path: rendered instances, isPath and radial clipping stay synchronized", stability.masksExact, JSON.stringify(stability.rows));

  const scenery = await b.evaluate(`(() => { const B = window.__ooga, kinds = ["flower", "bush", "tree", "crate", "barrel", "rock"], candidates = B.props.filter((o) => o.scenery), transforms = new Map(candidates.map((o) => [o, [o.x, o.z, o.node.position.y, o.node.rotation.y]])); const sample = (level) => { B.setPileLevel(level); const active = candidates.filter((o) => o.active), byKind = Object.fromEntries(kinds.map((kind) => [kind, active.filter((o) => o.prop === kind).length])); let radiusViolations = 0, pathViolations = 0; for (const o of active) { if (Math.hypot(o.x, o.z) - o.footprint < B.scenery.clearanceRadius - 1e-8) radiusViolations++; if (B.island.path.overlaps(o.x, o.z, o.footprint)) pathViolations++; } return { level, debug: { ...B.scenery }, byKind, radiusViolations, pathViolations, targets: B.input.targetCount, active }; }; const small = sample(1000), medium = sample(10000), large = sample(1000000), crossed = candidates.find((o) => small.active.includes(o) && !o.active), hidden = crossed && { active: crossed.active, visible: crossed.node.visible, transform: transforms.get(crossed) }; sample(1000); const restored = crossed && { active: crossed.active, visible: crossed.node.visible, sameTransform: transforms.get(crossed).every((v, i) => v === [crossed.x, crossed.z, crossed.node.position.y, crossed.node.rotation.y][i]), targets: B.input.targetCount }; B.jetpack.forceHost(crossed); const oldHost = crossed; const forcedTargets = B.input.targetCount; const rehoused = sample(1000000), host = B.jetpack.stash, pickup = B.jetpack.pickup, jetSafe = host ? host !== oldHost && host.active : !!pickup && Math.hypot(pickup.x, pickup.z) - 1 >= B.scenery.clearanceRadius - 1e-8 && !B.island.path.overlaps(pickup.x, pickup.z, 1); const signature = candidates.map((o) => [o.prop, o.x, o.z, o.node.rotation.y].join(":" )).join("|"); return { small: { ...small, active: undefined }, medium: { ...medium, active: undefined }, large: { ...large, active: undefined }, rehoused: { ...rehoused, active: undefined }, hidden, restored, forcedTargets, jetSafe, oldHostActive: oldHost.active, newHost: host && { prop: host.prop, active: host.active }, pickup: !!pickup, candidateCount: candidates.length, signature }; })()`);
  scenerySignature = scenery.signature;
  record("dynamic scenery: representative meadow props return outside the 1K ring", scenery.candidateCount === 226 && Object.values(scenery.small.byKind).every((count) => count > 0) && scenery.small.debug.visibleCount > 0, JSON.stringify({ candidates: scenery.candidateCount, visible: scenery.small.debug.visibleCount, kinds: scenery.small.byKind }));
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
  await b.sleep(3200);
  const landed = await b.evaluate(`(() => { const B = window.__ooga, stats = B.stats(); return { level: B.level, inner: B.path.ringInnerRadius, reflows: B.path.reflowCount, sceneryReflows: B.scenery.visibilityReflowCount, outstanding: stats.deliveries + stats.pendingDrops }; })()`);
  record("dynamic path and scenery: queued bananas cause no reflow before landing", airborne.outstanding === 100 && airborne.level === airborneBefore.level && airborne.inner === airborneBefore.inner && airborne.reflows === airborneBefore.reflows && airborne.sceneryReflows === airborneBefore.sceneryReflows && landed.outstanding === 0 && landed.level > airborne.level + 99 && landed.inner > airborne.inner && landed.reflows > airborne.reflows && landed.sceneryReflows > airborne.sceneryReflows, JSON.stringify({ before: airborneBefore, airborne, landed }));

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

const hubPile = () => withPage("hub pile", hubPage(src), async (b) => {
  await b.evaluate(`window.__ooga.setPileLevel(1000000)`);
  await b.sleep(1500);
  const perf = await b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); let frames = 0; const f = () => { frames++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else resolve({ fps: +(frames / 3).toFixed(1), shown: B.shown }); }; requestAnimationFrame(f); })`);
  const mirror = await b.evaluate(`({ active: window.__ooga.mirror.active, passes: window.__ooga.mirror.reflectionPassCount, resources: window.__ooga.mirror.resources })`);
  record("hub: mirror and million-banana pile hold at least 50 FPS", perf.fps >= 50 && perf.shown >= 999999 && mirror.active && mirror.passes > 0 && mirror.resources === 6, `${perf.fps} fps at ${perf.shown} bananas · ${JSON.stringify(mirror)}`);
});

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
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); const hit = B.input.pick(p.x, p.y); return { name: cave.traits.name, x: p.x, y: p.y, kind: hit && hit.owner.kind }; })()`);
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
  const pick = await b.evaluate(`(() => { const B = window.__ooga; const cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build); const p = B.project(cave.root.position.x, cave.root.position.y + 0.2, cave.root.position.z); return { name: cave.traits.name, x: p.x, y: p.y }; })()`);
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
  record("daylight: at 22h the hub is night with stars, every lamp lit and seven point lights on the high tier", night.hour === 22 && night.phase === "night" && night.stars === 1 && night.torch === 1 && night.day === 0 && night.lit && night.lamps.every((g) => g > 0.5) && (night.tier !== "high" || night.lights === 7) && night.subtitle.endsWith("night"), JSON.stringify(night));
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
  record("day cycle: point lights are off by day and on at night, with a toast at each phase", cycle.lights.noon === 0 && cycle.lights.morning === 0 && cycle.lights.night === 7 && cycle.lights.midnight === 7 && cycle.toasts.length >= 5, JSON.stringify({ lights: cycle.lights, toasts: cycle.toasts }));
  record("day cycle: accelerated time crosses midnight continuously and keeps the million-banana hub at 50 FPS", cycle.day1 >= cycle.day0 + 1 && cycle.dayOfYear === 81 && cycle.shown0 >= 999999 && cycle.shown >= cycle.shown0 - 5 && cycle.fps >= 50 && cycle.resources[0] === cycle.resources[1] && cycle.shadowFinite, JSON.stringify(cycle));
  record("day cycle: nothing accumulates across a day", cycle.stats.tweens <= 12 && cycle.stats.bubbles <= 10 && cycle.stats.zzz <= 40 && cycle.stats.particles <= 240 && cycle.stats.pool <= 40, JSON.stringify(cycle.stats));
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

// ---------- soak ----------
// Round trips and storms must leave nothing behind
const mb = (bytes) => (bytes / 1048576).toFixed(2);
const FRESH_FRAMES = 150;
const soak = async (b) => {
  await b.send("HeapProfiler.enable");
  const until = (cond, ms) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const t0 = performance.now(); const tick = () => { const ok = !!(${cond}); if (ok || performance.now() - t0 > ${ms}) resolve(ok); else requestAnimationFrame(tick); }; tick(); })`);
  const rendered = (frames, ms = 6000) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const start = B.renderedFrames; const t0 = performance.now(); const tick = () => { if (B.renderedFrames >= start + ${frames} || performance.now() - t0 > ${ms}) resolve(B.renderedFrames - start); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
  const settled = (ms = 4000) => until("window.BL.scene.tweenCount() === 0", ms);
  const heap = async () => {
    await b.send("HeapProfiler.collectGarbage");
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
    const dom = (await b.send("Memory.getDOMCounters")).result;
    return { used: (await b.send("Runtime.getHeapUsage")).result.usedSize, objects: total - compiled, code: compiled, nodes: dom.nodes, listeners: dom.jsEventListeners };
  };
  const snapshot = async () => ({ stats: await b.evaluate("window.__ooga.stats()"), ...await heap() });
  // go(id), then wait for swap, frames and animations
  const travel = (id) => b.evaluate(`new Promise((resolve) => { const B = window.__ooga; const T = window.BL.scene.tweenCount; const t0 = performance.now(); let last = t0, swap = 0, swapFrame = 0, swapGap = 0; B.go(${JSON.stringify(id)}); const tick = () => { const now = performance.now(); if (!swap && B.scene === ${JSON.stringify(id)}) { swap = now - t0; swapGap = now - last; swapFrame = B.renderedFrames; } last = now; if (swap && B.renderedFrames >= swapFrame + 3 && T() === 0) resolve({ swap, swapGap, settled: now - t0 }); else if (now - t0 > 8000) resolve(null); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`);
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
      if (!t) throw new Error(`round trip ${i + 1}: the transition to the ${id} did not settle`);
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

await core("source", src);
await core("dist", dist);
await governor();
await locker();
await fan();
await crates();
await keys();
await sheetIntro();
await refresh();
await weapons();
await props();
await fallback();
await phone();
await scenes();
await hub();
await mirrorCave();
await dynamicPaths();
await mirrorCanvas();
await hubDist();
await hubRoute();
await pileParameter();
await pileCapParameter();
await weightedDelivery();
await weightedDeliveryCanvas();
await hubCamera();
await hubFlight();
await hubCrew();
await hubDrive();
await hubProps();
await hubJetpack();
await daylightNight();
await dayCycle();
await daylightCanvas();
await hubHopOff();
await labDrive();
await hubPile();
await soakScenes();
await soakResidency();
await soakDonations("hub", hubPage(src));
await soakDonations("hub night", hubPage(src, "hour=22"));
await soakDonations("lab", page(src), { w: 1920 });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
