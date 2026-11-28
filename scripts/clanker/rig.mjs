// node scripts/clanker/rig.mjs : writes src/js/clanker-model.js (BL.clankerModel), the clanker gorilla rebuilt square to its
// own bones (from untracked/clanker-collab's blocks/rig2.mjs at b200, where it was tuned; every setting below can still be
// overridden from the environment to try a value). Its sources: blocks/*.txt (the posed parts, on the six-view sheet's grid),
// palette.mjs, finish.mjs and pec-map.json, all beside it. The clanker rebuilt square to its own bones (b20). Every part is resampled from the posed
// files (blocks/*.txt, after finish.mjs) onto a grid of its own, aligned with its bone, its form evened by a blur of its
// occupancy, its joint ends rounded and overlapping their neighbours, and coloured from the nearest posed surface. The
// rig turns parts at their joints only, by quaternions, so any pose between the knuckle stance (t 0, the posed files
// as authored) and standing on the hind legs (t 1) shows the same blocks rigidly turned. Writes model-rig2.js
// (`__cands.sets.B`, `rig`, `pose(r, t)`). The head keeps its authored blocks and face and stays level.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HERE = fileURLToPath(new URL(".", import.meta.url));
import { RAMP } from "./palette.mjs";
import { finish } from "./finish.mjs";
const CELL = 0.053, LETTERS = Object.keys(RAMP), PECMAP = existsSync(HERE + "pec-map.json") ? JSON.parse(readFileSync(HERE + "pec-map.json", "utf8")) : {};
const parts = {};
for (const file of readdirSync(HERE + "blocks").filter((f) => f.endsWith(".txt"))) {
  const id = file.slice(0, -4); let pivot = [0, 0, 0], offset = [0, 0, 0], row = null; const cells = [], fine = [];
  for (const raw of readFileSync(HERE + `blocks/${file}`, "utf8").split("\n")) {
    const line = raw.replace(/\s+$/, ""); if (line.startsWith("#") || !line) continue; let m;
    if ((m = line.match(/^pivot\s+(\S+)\s+(\S+)\s+(\S+)/))) { pivot = m.slice(1).map(Number); continue; }
    if ((m = line.match(/^offset\s+(\S+)\s+(\S+)\s+(\S+)/))) { offset = m.slice(1).map(Number); continue; }
    if (/^shades/.test(line)) continue;
    if ((m = line.match(/^fine((?:\s+-?[\d.]+){6})\s+(\S)/))) { fine.push([...m[1].trim().split(/\s+/).map((v) => Math.round(Number(v) * 4)), LETTERS.indexOf(m[2])]); continue; }
    if ((m = line.match(/^y\s+(-?\d+)\s+x\s+(-?\d+)\s+z\s+(-?\d+)/))) { row = { y: +m[1], x: +m[2], z: +m[3], n: 0 }; continue; }
    [...line].forEach((ch, i) => { if (ch !== "." && ch !== " ") cells.push([row.x + i, row.y, row.z - row.n, LETTERS.indexOf(ch)]); });
    row.n++;
  }
  parts[id] = { pivot, offset, cells, fine };
}
finish(parts);
// --- quaternions [x, y, z, w]
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q, v) => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [p[0], p[1], p[2]]; };
const qx = (deg) => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const arc = (from, to) => { from = norm(from); to = norm(to); const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  const c = [from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]]; const q = [c[0], c[1], c[2], 1 + d]; const l = Math.hypot(...q); return q.map((v) => v / l); };
// --- world cells of each part (sheet units, the knuckle stance)
const W = {};
for (const [id, P] of Object.entries(parts)) { W[id] = new Map(); for (const [x, y, z, k] of P.cells) W[id].set([Math.round(x + P.offset[0]), y + P.offset[1], z + P.offset[2]].join(","), k); }
const WORLD = W;
const lowest = (id) => { let lo = 1e9; for (const key of W[id].keys()) lo = Math.min(lo, +key.split(",")[1]); const pts = [...W[id].keys()].map((k) => k.split(",").map(Number)).filter((c) => c[1] <= lo + 1); return [0, 1, 2].map((a) => pts.reduce((s, c) => s + c[a] + 0.5, 0) / pts.length); };
// --- skeleton (sheet units, knuckle stance). The torso is two segments meeting at the waist: the belly pitched
// ABD degrees forward from upright, the chest CH degrees, which reach from the hips' middle to the shoulders' line.
const FURV = +(process.env.FURV || 3), FURPATCH = +(process.env.FURPATCH || 1.9), NCOL = +(process.env.NCOL || 10), SPOTS = +(process.env.SPOTS || 0.07), LIMBGLOW = +(process.env.LIMBGLOW || 2.4), FOOTDROP = +(process.env.FOOTDROP || 0.9), THUMB = +(process.env.THUMB || 0.5), THUMBMODE = process.env.THUMBMODE ? (isNaN(+process.env.THUMBMODE) ? process.env.THUMBMODE : +process.env.THUMBMODE) : "side", FISTLEN = +(process.env.FISTLEN || 4), FISTTURN = +(process.env.FISTTURN ?? 0), FISTYAW = +(process.env.FISTYAW ?? 180), FISTSCALE = +(process.env.FISTSCALE || 0.9), FISTTUCK = +(process.env.FISTTUCK || 1), TUFTS = +(process.env.TUFTS || 0), SHOULDERBACK = +(process.env.SHOULDERBACK || 2), HEADBACK = +(process.env.HEADBACK || 2.5), GLUTE = +(process.env.GLUTE || 1);
const BACKLEN = +(process.env.BACKLEN || 1.25), LEGIN = +(process.env.LEGIN || 6), LEGSLIDE = +(process.env.LEGSLIDE || 1.2), LEGSLIDE0 = +(process.env.LEGSLIDE0 || 1.0);
const ABD = +(process.env.ABD || 65), CH = +(process.env.CH || 25);
const P0 = [0, 14, 3], S0 = [0, 21.56, 13.27];
const dA = [0, Math.cos((ABD * Math.PI) / 180), Math.sin((ABD * Math.PI) / 180)], dC = [0, Math.cos((CH * Math.PI) / 180), Math.sin((CH * Math.PI) / 180)];
const det = dA[1] * dC[2] - dA[2] * dC[1], L1 = ((S0[1] - P0[1]) * dC[2] - (S0[2] - P0[2]) * dC[1]) / det;
const WST = [0, P0[1] + L1 * dA[1], P0[2] + L1 * dA[2]];
const BONES = {
  abdomen: { parent: "hips", joint: P0, rest: qx(ABD), src: "chest", side: -1 },
  chest: { parent: "abdomen", joint: WST, rest: qx(CH), src: "chest", side: 1 },
  head: { parent: "chest", joint: parts.head.pivot, rest: [0, 0, 0, 1], keep: true },
  armR: { parent: "chest", joint: parts.armR.pivot, to: parts.foreR.pivot }, armL: { parent: "chest", joint: parts.armL.pivot, to: parts.foreL.pivot },
  foreR: { parent: "armR", joint: parts.foreR.pivot, to: lowest("foreR") }, foreL: { parent: "armL", joint: parts.foreL.pivot, to: lowest("foreL") },
  legR: { parent: "hips", joint: parts.legR.pivot, to: parts.shinR.pivot }, legL: { parent: "hips", joint: parts.legL.pivot, to: parts.shinL.pivot },
  shinR: { parent: "legR", joint: parts.shinR.pivot, to: lowest("shinR") }, shinL: { parent: "legL", joint: parts.shinL.pivot, to: lowest("shinL") }
};
for (const B of Object.values(BONES)) if (B.to) { B.dir = norm(B.to.map((v, i) => v - B.joint[i])); B.rest = arc([0, -1, 0], B.dir); B.len = Math.hypot(...B.to.map((v, i) => v - B.joint[i])); }
// --- resample, even and colour each part on its own grid
const SIGMA = +(process.env.SIGMA || 1.5), K = (x, y, z) => x + "," + y + "," + z, out = {};
const split = norm([0, dA[1] + dC[1], dA[2] + dC[2]]);
for (const [id, B] of Object.entries(BONES)) {
  if (B.keep) continue;
  const src = new Map();
  for (const [key, k] of W[B.src || id]) {
    const p = key.split(",").map(Number);
    if (B.side) { const s = (p[1] + 0.5 - WST[1]) * split[1] + (p[2] + 0.5 - WST[2]) * split[2]; if (B.side * s < -1.5) continue; }
    src.set(key, k);
  }
  const inv = qinv(B.rest), toLocal = (p) => qrot(inv, p.map((v, i) => v - B.joint[i])), toWorld = (q) => qrot(B.rest, q).map((v, i) => v + B.joint[i]);
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const key of src.keys()) { const p = key.split(",").map(Number); for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [0, 0, 1], [1, 1, 0]]) { const q = toLocal(p.map((v, i) => v + c[i])); for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); } } }
  lo = lo.map((v) => Math.floor(v) - 2); hi = hi.map((v) => Math.ceil(v) + 2);
  // Supersampled occupancy (8 points a cell), then a Gaussian blur, kept where it is at least half full.
  const occ = new Map();
  for (let x = lo[0]; x < hi[0]; x++) for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++) {
    let n = 0; for (const a of [0.25, 0.75]) for (const b of [0.25, 0.75]) for (const c of [0.25, 0.75]) { const w = toWorld([x + a, y + b, z + c]); if (src.has(K(Math.floor(w[0]), Math.floor(w[1]), Math.floor(w[2])))) n++; }
    if (n) occ.set(K(x, y, z), n / 8);
  }
  const sig = B.src ? SIGMA : +(process.env.LIMBSIGMA || 0), R = sig ? Math.ceil(2 * sig) : 0, cells = new Set();
  if (B.src) {
    // b26: the torso built clean, not resampled. Along the segment's own spine (local y), each one-block slice's
    // half-width and its back and front depths are measured from the posed shape (8 points a posed cell), smoothed
    // along the spine (σ PROF, 1.2), and the slice is filled as a rounded box (a superellipse, exponent SEXP 2.6,
    // symmetric across x). So the surface steps evenly by construction, with nothing to clean up.
    const prof = new Map();
    for (const key of src.keys()) { const p = key.split(",").map(Number);
      for (const a of [0.25, 0.75]) for (const b of [0.25, 0.75]) for (const c of [0.25, 0.75]) {
        const q = toLocal([p[0] + a, p[1] + b, p[2] + c]), y = Math.floor(q[1]);
        if (!prof.has(y)) prof.set(y, { xs: [], zs: [] }); prof.get(y).xs.push(Math.abs(q[0])); prof.get(y).zs.push(q[2]); } }
    const pct = (l, f) => { l.sort((a, b) => a - b); return l[Math.min(l.length - 1, Math.floor(f * l.length))]; };
    const rows = [...prof.keys()].sort((a, b) => a - b), raw = new Map();
    for (const y of rows) { const P = prof.get(y); if (P.xs.length < 24) continue; raw.set(y, [pct(P.xs, 0.97) + 0.25, pct(P.zs, 0.02) - 0.25, pct(P.zs, 0.98) + 0.25]); }
    const PS = +(process.env.PROF || 1.2), SE = +(process.env.SEXP || 2.6), ys = [...raw.keys()];
    for (const y of ys) {
      const m = [0, 0, 0]; let w = 0;
      for (const y2 of ys) { const g = Math.exp(-((y2 - y) ** 2) / (2 * PS * PS)); const r = raw.get(y2); for (let i = 0; i < 3; i++) m[i] += g * r[i]; w += g; }
      const [rx, z0, z1] = m.map((v) => v / w), cz = (z0 + z1) / 2, rz = (z1 - z0) / 2;
      for (let x = Math.floor(-rx) - 1; x <= Math.ceil(rx); x++) for (let z = Math.floor(z0) - 1; z <= Math.ceil(z1); z++)
        if (Math.abs((x + 0.5) / rx) ** SE + Math.abs((z + 0.5 - cz) / rz) ** SE <= 1) cells.add(K(x, y, z));
    }
  } else
  for (let x = lo[0]; x < hi[0]; x++) for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++) {
    let s = 0, w = 0; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) { const g = sig ? Math.exp(-(a * a + b * b + c * c) / (2 * sig * sig)) : 1; s += g * (occ.get(K(x + a, y + b, z + c)) || 0); w += g; }
    if (s / w >= 0.5) cells.add(K(x, y, z));
  }
  // Round the joint end (local origin) and, for a limb, its far end: a ball as wide as the part there, so a turn at
  // the joint opens no gap.
  // Only the elbows and knees (b20's first cut balled every part's root, shoulders and waist included, centred on the
  // pivot and as wide as the farthest block from it, which swelled the shoulders): a forearm's or shin's root and an
  // upper arm's or thigh's far end, a ball as wide and deep as the part's own section there, centred in it.
  const ends = /^(fore|shin)/.test(id) ? [[0, 0, 0]] : /^(arm|leg)/.test(id) ? [[0, -B.len, 0]] : [];
  for (const e of ends) {
    const near = [...cells].map((k) => k.split(",").map(Number)).filter((c) => Math.abs(c[1] + 0.5 - e[1]) < 1.5);
    if (!near.length) continue;
    const x0 = Math.min(...near.map((c) => c[0] + 0.5)), x1 = Math.max(...near.map((c) => c[0] + 0.5)), cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, rz = (Math.max(...near.map((c) => c[2] + 0.5)) - Math.min(...near.map((c) => c[2] + 0.5))) / 2, cz = (Math.max(...near.map((c) => c[2] + 0.5)) + Math.min(...near.map((c) => c[2] + 0.5))) / 2, ry = Math.min(rx, rz, 2.5);
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) for (let y = Math.floor(e[1] - ry); y <= Math.ceil(e[1] + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - e[1]) / ry, dz = (z + 0.5 - cz) / rz; if (dx * dx + dy * dy + dz * dz <= 1) cells.add(K(x, y, z));
    }
  }
  // b23: shape passes, all in the part's own frame (so they hold in every pose).
  const has = (x, y, z) => cells.has(K(x, y, z)), Kc = (c) => c.split(",").map(Number);
  let pecCols = null;
  // Torso: even the back along the spine (each column's back-most block, median over five rows, then over three
  // columns), so the back reads as one smooth line from the side in any pose; the chest also its front outside the pecs.
  // b25: the torso's back (and the chest's top) smoothed as a surface. Seen along an axis of the part's own frame
  // (the back: -z; the top: +y), the outermost block of each line across it is a height map; it is put through a 3x3
  // median (no single block standing proud or sunk) and then a Gaussian (σ BACKSIG, 1.3), rounded, and each line is
  // cut back or filled out to that height. Lines at the map's edge (the silhouette) are left as they are.
  const surface = (axis, sign) => {
    const [u, v] = [0, 1, 2].filter((a) => a !== axis), h = new Map();
    for (const key of cells) { const c = Kc(key), k = c[u] + "," + c[v], d = c[axis]; if (!h.has(k) || sign * d > sign * h.get(k)) h.set(k, d); }
    const at = (m, a, b) => m.get(a + "," + b), inner = (a, b) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (!h.has((a + i) + "," + (b + j))) return false; return true; };
    const med = new Map();
    for (const [k, d] of h) { const [a, b] = k.split(",").map(Number); if (!inner(a, b)) { med.set(k, d); continue; } const l = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) l.push(at(h, a + i, b + j)); l.sort((p, q) => p - q); med.set(k, l[4]); }
    const S = +(process.env.BACKSIG || 1.3), R = Math.ceil(2 * S);
    for (const [k, d0] of h) {
      const [a, b] = k.split(",").map(Number); if (!inner(a, b)) continue;
      let sum = 0, w = 0; for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const m = at(med, a + i, b + j); if (m === undefined) continue; const g = Math.exp(-(i * i + j * j) / (2 * S * S)); sum += g * m; w += g; }
      const want = Math.round(sum / w), c = [0, 0, 0]; c[u] = a; c[v] = b;
      // cut back past want, or fill out to it
      for (let d = Math.min(d0, want) - 0; d <= Math.max(d0, want); d++) {
        c[axis] = d; const key = K(c[0], c[1], c[2]);
        if (sign * d > sign * want) cells.delete(key); else if (sign * d >= sign * d0 - 0 && sign * d <= sign * want) cells.add(key);
      }
    }
  };
  // (b26: the torso's sections are clean by construction; the surface pass is no longer run on it.)
  // The tailbone: the abdomen's hip end rounded into a dome (its last rows kept inside an ellipsoid as wide and deep
  // as the abdomen's section a few rows up).
  if (id === "abdomen") {
    const all = [...cells].map(Kc), y0 = Math.min(...all.map((c) => c[1])), Yc = y0 + +(process.env.TAIL || 5);
    const sec = all.filter((c) => c[1] === Yc);
    if (sec.length) {
      const xs = sec.map((c) => c[0] + 0.5), zs = sec.map((c) => c[2] + 0.5), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.5, rz = (Math.max(...zs) - Math.min(...zs)) / 2 + 0.5, ry = Yc - y0 + 0.5;
      for (const [x, y, z] of all) if (y < Yc) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - Yc) / ry, dz = (z + 0.5 - cz) / rz; if (dx * dx + dy * dy + dz * dz > 1) cells.delete(K(x, y, z)); }
    }
  }
  // The pecs, square to the chest: in the chest's own frame their fronts are one plane (the median of their fronts),
  // with the seam (x 0) and their outer sides (|x| 6) a block back, so from any side they read as flat slabs instead
  // of a stair of ledges on the turned grid.
  if (id === "chest") {
    const fr = new Map();
    for (const key of cells) { const [x, y, z] = Kc(key), k = x + "," + y; if (!fr.has(k) || z > fr.get(k)) fr.set(k, z); }
    const pec = [...fr].filter(([k, z]) => { const [x, y] = k.split(",").map(Number), w = toWorld([x + 0.5, y + 0.5, z + 0.5]); return Math.abs(x + 0.5) <= 6.5 && w[1] >= 15 && w[1] < 20 && w[2] > 15; });
    if (pec.length) {
      const zs = pec.map(([, z]) => z).sort((a, b) => a - b), P = zs[zs.length >> 1];
      pecCols = new Set(pec.map(([k]) => k));
      // their top row a block back too, so the slab's top edge is bevelled into the neck rather than a shelf
      const top = new Map(); for (const [k] of pec) { const [x, y] = k.split(",").map(Number); top.set(x, Math.max(top.get(x) ?? -1e9, y)); }
      for (const [k] of pec) { const [x, y] = k.split(",").map(Number), want = x === 0 || Math.abs(x) >= 6 || y === top.get(x) ? P - 1 : P, z = fr.get(k);
        for (let q = want + 1; q <= z; q++) cells.delete(K(x, y, q)); for (let q = z + 1; q <= want; q++) cells.add(K(x, y, q)); }
    }
  }
  // Clean-up: two passes; a block with two or fewer faces touching, or seven or fewer of its 26 neighbours, goes; an
  // empty cell with five or more faces touching, or 18 or more neighbours, is filled.
  // (Knuckles and toes, the bottom two rows of a forearm or shin, are thin bands: only lone blocks go there.)
  const ylow = /^(fore|shin)/.test(id) ? Math.min(...[...cells].map((c) => +c.split(",")[1])) + 2 : -1e9;
  for (let pass = 0; pass < 2; pass++) {
    const drop = [], add = new Set();
    for (const key of cells) {
      const [x, y, z] = Kc(key); let f = 0, n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) {
        const there = has(x + a, y + b, z + c); if (there) { n++; if (Math.abs(a) + Math.abs(b) + Math.abs(c) === 1) f++; } else add.add(K(x + a, y + b, z + c));
      }
      if (y < ylow ? f <= 1 : f <= 2 || n <= 7) drop.push(key);
    }
    const born = [];
    for (const key of add) { const [x, y, z] = Kc(key); let f = 0, n = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if ((a || b || c) && has(x + a, y + b, z + c)) { n++; if (Math.abs(a) + Math.abs(b) + Math.abs(c) === 1) f++; }
      if (f >= 5 || n >= 18) born.push(key); }
    for (const key of drop) cells.delete(key); for (const key of born) cells.add(key);
  }
  // b28: the upper arm filled out under the shoulder. Below the shoulder's widest section, down to the elbow, each
  // slice's extents on all four sides (inner, outer, front, back) may shrink by at most TAPER (0.45) blocks a row
  // going down, and each slice is filled out to them as a rounded box (superellipse, exponent 2.6, each quadrant its
  // own radii). Only blocks are added, and only under the shoulder, so the shoulder itself is unchanged.
  if (/^arm/.test(id)) {
    const all = [...cells].map(Kc), ext = new Map();
    for (const [x, y, z] of all) { const e = ext.get(y) || [1e9, -1e9, 1e9, -1e9]; ext.set(y, [Math.min(e[0], x), Math.max(e[1], x + 1), Math.min(e[2], z), Math.max(e[3], z + 1)]); }
    const ys = [...ext.keys()].sort((p, q) => q - p);
    let widest = ys[0], wArea = -1; for (const y of ys) { const e = ext.get(y), A = (e[1] - e[0]) * (e[3] - e[2]); if (A > wArea) { wArea = A; widest = y; } }
    const T = +(process.env.TAPER || 0.45);
    let env = [...ext.get(widest)];
    for (const y of ys) {
      if (y >= widest) continue;
      const e = ext.get(y);
      env = [Math.min(e[0], env[0] + T), Math.max(e[1], env[1] - T), Math.min(e[2], env[2] + T), Math.max(e[3], env[3] - T)];
      const cx = (e[0] + e[1]) / 2, cz = (e[2] + e[3]) / 2, SE2 = 2.6;
      for (let x = Math.floor(env[0]); x < Math.ceil(env[1]); x++) for (let z = Math.floor(env[2]); z < Math.ceil(env[3]); z++) {
        const px = x + 0.5, pz = z + 0.5, rx = px < cx ? cx - env[0] : env[1] - cx, rz = pz < cz ? cz - env[2] : env[3] - cz;
        if (Math.abs((px - cx) / rx) ** SE2 + Math.abs((pz - cz) / rz) ** SE2 <= 1) cells.add(K(x, y, z));
      }
    }
  }
  // b28: thicker thighs. Each slice of a thigh is filled out as a rounded box THICK (1) block wider on every side than
  // it was (superellipse, exponent 2.6), only adding blocks.
  // b30: the shin too, so the knee has no step or hollow where the thicker thigh meets it: its top filled out by THICK
  // like the thigh, easing to half that by the calf's foot, the foot's two rows left alone.
  if (/^(leg|shin)/.test(id)) {
    const TH0 = +(process.env.THICK || 1), ext = new Map();
    for (const [x, y, z] of [...cells].map(Kc)) { const e = ext.get(y) || [1e9, -1e9, 1e9, -1e9]; ext.set(y, [Math.min(e[0], x), Math.max(e[1], x + 1), Math.min(e[2], z), Math.max(e[3], z + 1)]); }
    const ys = [...ext.keys()], top = Math.max(...ys), bot = Math.min(...ys);
    for (const [y, e] of ext) {
      let TH = TH0;
      if (/^shin/.test(id)) { if (y < bot + 2) continue; TH = TH0 * (0.5 + 0.5 * (y - bot - 2) / Math.max(1, top - bot - 2)); }
      const x0 = e[0] - TH, x1 = e[1] + TH, z0 = e[2] - TH, z1 = e[3] + TH, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2;
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
        if (Math.abs((x + 0.5 - cx) / rx) ** 2.6 + Math.abs((z + 0.5 - cz) / rz) ** 2.6 <= 1) cells.add(K(x, y, z));
    }
  }
  // b30: buttocks. At the top of each thigh, behind and toward the middle, a rounded mass (an ellipsoid, GLUTE scales
  // it) whose inner side reaches past the body's middle, so the two touch on all fours and, with the hips drawn in,
  // standing. Only adds blocks.
  if (/^leg/.test(id) && GLUTE) {
    const inner = id === "legR" ? 1 : -1, all = [...cells].map(Kc), top = all.filter((c) => c[1] >= -3 && c[1] <= -1);
    const zb = Math.min(...top.map((c) => c[2])), rx = 3.2 * GLUTE, ry = 3 * GLUTE, rz = 2.6 * GLUTE;
    // its middle in the thigh's frame: the inner side 0.3 past the body's middle with the hips drawn in on all fours
    const ccx = inner * (Math.abs(B.joint[0]) - LEGSLIDE0 + 0.3 - rx), cy = -1.5, cz = zb + 1.2;
    for (let x = Math.floor(ccx - rx) - 1; x <= Math.ceil(ccx + rx); x++) for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz) - 1; z <= Math.ceil(cz + rz); z++) {
      const dx = (x + 0.5 - ccx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
      if (dx * dx + dy * dy + dz * dz <= 1) cells.add(K(x, y, z));
    }
  }
  // Colours from the nearest exposed posed block.
  const frontCol = new Map(), frontZ = new Map();
  for (const [key, k] of src) { const [x, y, z] = key.split(",").map(Number), f = x + "," + y; if (!frontZ.has(f) || z > frontZ.get(f)) { frontZ.set(f, z); frontCol.set(f, k); } }
  const exposed = []; for (const [key, k] of src) { const [x, y, z] = key.split(",").map(Number); if ([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a, b, c]) => !src.has(K(x + a, y + b, z + c)))) exposed.push([x + 0.5, y + 0.5, z + 0.5, k]); }
  // Belly faces turned to face down are lit as if they faced forward (the reference's belly reads pale), see build.
  const facesFrontLit = (c) => (id === "abdomen" || (pecCols && pecCols.has(c[0] + "," + c[1]))) && !cells.has(K(c[0], c[1], c[2] + 1));
  const list = [];
  for (const key of cells) {
    const c = key.split(",").map(Number), surf = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a, b, d]) => !cells.has(K(c[0] + a, c[1] + b, c[2] + d)));
    let k = 3;
    if (surf) {
      const w = toWorld([c[0] + 0.5, c[1] + 0.5, c[2] + 0.5]);
      // A torso block facing forward (its local front open, turned toward +z in the world) takes the colour the posed
      // chest showed from the front at that column and row, so the fitted pecs and belly carry over as seen.
      const fz = qrot(B.rest, [0, 0, 1])[2], fy = qrot(B.rest, [0, 0, 1])[1];
      const facesFront = B.src && !cells.has(K(c[0], c[1], c[2] + 1)) && fz > 0.3;
      const pk = Math.floor(w[0]) + "," + Math.floor(w[1]), pm = pecCols && pecCols.has(c[0] + "," + c[1]) ? PECMAP[pk] : undefined;
      const fc = pm !== undefined ? LETTERS.indexOf(pm) : facesFront ? frontCol.get(pk) : undefined;
      if (fc !== undefined) k = fc;
      else { let bd = 1e9; for (const e of exposed) { const d = (e[0] - w[0]) ** 2 + (e[1] - w[1]) ** 2 + (e[2] - w[2]) ** 2; if (d < bd) { bd = d; k = e[3]; } } }
    }
    list.push([...c, k, facesFrontLit(c) ? 1 : 0]);
  }
  // b28: the torso symmetric from left to right. Its sections are mirror images about x 0 (the plane between columns
  // -1 and 0); each block on the right (x < 0) gives its colour and its presence to its mirror on the left, so the
  // upper and lower back match side for side. The pecs keep their own painted pattern (their seam is column 0).
  if (B.src) {
    const by = new Map(list.map((c) => [K(c[0], c[1], c[2]), c]));
    for (const c of [...list]) {
      const [x, y, z] = c; if (x >= 0) continue;
      if (pecCols && (pecCols.has(x + "," + y) || pecCols.has((-1 - x) + "," + y))) continue;
      const mk = K(-1 - x, y, z), m = by.get(mk);
      if (m) { if (process.env.MIRRORCOL === "1") { m[3] = c[3]; m[4] = c[4]; } else if (typeof c[3] === "number" && typeof m[3] === "number" && c[3] <= 11 && m[3] <= 11 && Math.abs(c[3] - m[3]) >= (Math.min(c[3], m[3]) <= +(process.env.DARKFUR ?? 5) ? 1 : +(process.env.BLOTCH ?? 2))) { if (c[3] > m[3]) c[3] = m[3]; else m[3] = c[3]; } } else { const n = [-1 - x, y, z, c[3], c[4]]; by.set(mk, n); list.push(n); }
    }
    for (let i = list.length - 1; i >= 0; i--) { const [x, y, z] = list[i]; if (x >= 0 && !(pecCols && pecCols.has(x + "," + y)) && !by.has(K(-1 - x, y, z))) list.splice(i, 1); }
  }
  // b170: the torso's blocks were authored mirror-symmetric (82% of left-right pairs the same grey), so with b166's
  // colours unmirrored the back still read as a mirror image. Each block's grey (not the pecs') is stepped up or down by
  // an unmirrored hash: clumps two blocks across and each block its own, BACKVARY greys at most; the shell's per-row
  // balance (b166) keeps the two sides' overall shade even
  if ((id === "chest" || id === "abdomen") && +(process.env.BACKVARY ?? 1) > 0) { const A = +(process.env.BACKVARY ?? 1);
    const hn = (a, b, c) => { let x = Math.imul(a + 73, 374761393) + Math.imul(b + 19, 668265263) + Math.imul(c + 7, 1274126177) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
    for (const c of list) { const [x, y, z, k] = c; if (typeof k !== "number" || k > 11 || k < +(process.env.BACKVARYFROM ?? 6) || (pecCols && pecCols.has(x + "," + y))) continue;
      const d = Math.round(((hn(x >> 1, y >> 1, z >> 1) - 0.5) * 2.2 + (hn(x, y, z) - 0.5) * 1.1) * A); c[3] = Math.max(0, Math.min(11, k + d)); } }
  out[id] = { cells: list.map((c) => c.slice(0, 4)), lit: list.filter((c) => c[4]).map((c) => c.slice(0, 3)), litNormal: id === "abdomen" || id === "chest" ? norm(qrot(qinv(B.rest), [0, 0.25, 1])) : null, fine: [] };
  // b31: the shoulder in angled surfaces, as the Ooga's is (hero-body.js): the upper arm's top, from its cap down to
  // SHOULDER_ROWS under its widest section, is drawn as a loft of bevelled octagonal rings (BL.heroBody.loft), one at
  // each row's edge, sized to the blocks' own section there (eased along the arm) and closed over the top by a dome
  // of rings shrinking to a small cap; each span takes the colour its row's outer blocks had. Those rows' blocks go.
  // b34: the whole upper arm and the forearm take it too (the forearm without a dome, its knuckles' rows left as
  // blocks), and the shoulder is a touch smaller: its rows' blocks drawn in toward their middle by SHRINK (0.9).
  // b53: the legs too: the thigh as the upper arm (no shoulder: no SHRINK, bicep or silver colour), the shin as the
  // forearm, ending over a faceted foot instead of a fist
  const isArm = /^arm/.test(id), isUpper = /^(arm|leg)/.test(id), isLeg = /^(leg|shin)/.test(id);
  if (/^(arm|fore|leg|shin)/.test(id) && process.env.FACETED !== "0" && (!isLeg || process.env.LEGS !== "0")) {
    let cells = out[id].cells, rows = new Map();
    const group = () => { rows = new Map(); for (const c of cells) { const r = rows.get(c[1]) || []; r.push(c); rows.set(c[1], r); } };
    group();
    const ys = [...rows.keys()].sort((a, b) => b - a);
    let widest = ys[0], best = -1; for (const y of ys) { const r = rows.get(y); if (r.length > best) { best = r.length; widest = y; } }
    if (isArm) {
      const SH = +(process.env.SHRINK || 0.9), kept = [];
      for (const [y, r] of rows) {
        if (y < widest - 3) { kept.push(...r); continue; }
        const xs = r.map((c) => c[0] + 0.5), zs = r.map((c) => c[2] + 0.5), mx = (Math.min(...xs) + Math.max(...xs)) / 2, mz = (Math.min(...zs) + Math.max(...zs)) / 2;
        const hx = (Math.max(...xs) - Math.min(...xs)) / 2 + 0.5, hz = (Math.max(...zs) - Math.min(...zs)) / 2 + 0.5;
        for (const c of r) if (Math.abs(c[0] + 0.5 - mx) <= hx * SH && Math.abs(c[2] + 0.5 - mz) <= hz * SH) kept.push(c);
      }
      cells = out[id].cells = kept; group();
    }
    const yMin = Math.min(...ys), low = isUpper ? yMin : yMin + Math.round(isLeg ? +(process.env.FOOTROOM || 3) : +(process.env.FISTROOM || 5)), sec = (y) => { const r = rows.get(y) || [];
      const xs = r.map((c) => c[0]), zs = r.map((c) => c[2]), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
      // the row's colour: the commonest among its blocks with an open side
      const at = new Set(r.map((c) => c[0] + "," + c[2])), tally = new Map();
      for (const c of r) if (!at.has((c[0] + 1) + "," + c[2]) || !at.has((c[0] - 1) + "," + c[2]) || !at.has(c[0] + "," + (c[2] + 1)) || !at.has(c[0] + "," + (c[2] - 1))) tally.set(c[3], (tally.get(c[3]) || 0) + 1);
      // the mean grey of its outer blocks (as a fraction, so the rings can grade it), greys only
      // (b35: on the upper arm, the 75th percentile of its outer greys, so the shoulder's silver is not averaged away
      // by the dark blocks at its sides)
      const list = []; for (const [kk, c] of tally) if (kk <= 11) for (let m = 0; m < c; m++) list.push(kk);
      list.sort((p, q) => p - q);
      let sum = 0; for (const v of list) sum += v;
      const k = !list.length ? 3 : isArm ? list[Math.min(list.length - 1, Math.floor(list.length * 0.75))] : sum / list.length;
      return { hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, k }; };
    const band = ys.filter((y) => y >= low);
    // rings at each row's lower edge, from the bottom of the band up; the bottom ring takes the section of the row
    // under the band (where the blocks go on), so the two meet
    const raw = [{ y: low, ...sec(rows.has(low - 1) ? low - 1 : low) }, ...band.slice().reverse().map((y) => ({ y: y + 1, ...sec(y) }))];
    // eased along the arm (a 1-2-1 average), the ends kept
    const ring = raw.map((r, i) => i === 0 || i === raw.length - 1 ? r : { ...r, hx: (raw[i - 1].hx + 2 * r.hx + raw[i + 1].hx) / 4, hz: (raw[i - 1].hz + 2 * r.hz + raw[i + 1].hz) / 4, cx: (raw[i - 1].cx + 2 * r.cx + raw[i + 1].cx) / 4, cz: (raw[i - 1].cz + 2 * r.cz + raw[i + 1].cz) / 4 });
    // the dome over the top: from the widest ring up to a small cap a block over the top row
    const wi = ring.reduce((b, r, i) => (r.hx * r.hz > ring[b].hx * ring[b].hz ? i : b), 0), W = ring[wi], top = ring[ring.length - 1];
    const capY = isArm ? W.y + (top.y + 0.6 - W.y) * +(process.env.SHOULDERTALL || 0.72) : isLeg && isUpper ? W.y + (top.y + 0.6 - W.y) * +(process.env.THIGHTALL || 1) : top.y + 0.6, DOME = [0.35, 0.62, 0.82, 0.94];
    const domeRings = DOME.map((t) => { const k = Math.sqrt(1 - t * t); return { y: W.y + (capY - W.y) * t, hx: W.hx * (0.42 + 0.58 * k), hz: W.hz * (0.42 + 0.58 * k), cx: W.cx + (top.cx - W.cx) * t, cz: W.cz + (top.cz - W.cz) * t, k: top.k }; });
    // b35: the upper arm slimmer under the shoulder: drawn in by up to BICEP (0.84) around its upper middle, easing to
    // none at the elbow and back to the shoulder's own size where it meets the dome, so there is no overhang there
    if (isArm) { const B0 = +(process.env.BICEP || 0.95), yb = ring[0].y, yw = W.y;
      for (let i = 0; i < wi; i++) { const r = ring[i], u = Math.max(0, Math.min(1, (r.y - yb) / Math.max(1, yw - yb))), f = 1 - (1 - B0) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (u < 0.87 ? 1 : (1 - u) / 0.13); ring[i] = { ...r, hx: r.hx * f, hz: r.hz * f }; }
      // the tricep: the back of the upper arm swells out by up to TRICEP (1.1) blocks, building from the elbow to its
      // full height two-thirds of the way up and ending in a short drop under the shoulder, so its top is a defined
      // edge (the arm's front stays where it was)
      const TRI = +(process.env.TRICEP || 1.1);
      for (let i = 0; i <= wi; i++) { const r = ring[i], u = (r.y - yb) / Math.max(1, yw - yb);
        const d = TRI * (u < 0.3 ? 0 : u < 0.68 ? (u - 0.3) / 0.38 : u < 0.85 ? 1 : Math.max(0, 1 - (u - 0.85) / 0.15));
        ring[i] = { ...ring[i], hz: r.hz + d / 2, cz: r.cz - d / 2 }; } }
    const rs = isUpper ? [...ring.slice(0, wi + 1), ...domeRings, { y: capY, hx: W.hx * 0.42, hz: W.hz * 0.42, cx: top.cx, cz: top.cz, k: top.k }] : ring;
    // colours: the band's rows' colours, by height, onto the dome too
    // a grey for any height: the rows' mean greys, eased between them (the black-to-grey fade down the shoulder)
    const colourAt = (y) => { const rr = raw.map((r) => [r.y - 0.5, r.k]); if (y <= rr[0][0]) return rr[0][1]; for (let i = 1; i < rr.length; i++) if (y <= rr[i][0]) { const t = (y - rr[i - 1][0]) / (rr[i][0] - rr[i - 1][0]); return rr[i - 1][1] + (rr[i][1] - rr[i - 1][1]) * t; } return rr[rr.length - 1][1]; };
    // each span halved (a ring between each pair), so the grey steps more finely down the shoulder
    // b37: the upper arm and shoulder as one surface: the rings' sizes and centres, from the elbow over the dome, are
    // eased together (a 1-2-1 average, SEAMLESS passes, the end rings kept), so the shoulder flows into the arm with no
    // crease where the dome began
    if (isUpper) for (let pass = 0; pass < +(process.env.SEAMLESS || 16); pass++) {
      const prev = rs.map((r) => ({ ...r }));
      for (let i = 1; i < rs.length - 1; i++) for (const key of ["hx", "hz", "cx", "cz"]) rs[i][key] = (prev[i - 1][key] + 2 * prev[i][key] + prev[i + 1][key]) / 4;
    }
    // b40: the shoulder stays the widest part of the arm. The smoothing drew the dome in and left the arm under it
    // fuller, so the dome (from the widest ring up) is scaled back to its own measured size, and every ring below is
    // kept within the shoulder's size tapering down the arm: SHOULDERLEAD (0.86) of it just under the shoulder, to
    // 0.72 at the elbow.
    if (isUpper) {
      let peak = 0; for (let i = wi; i < rs.length; i++) peak = Math.max(peak, rs[i].hx * rs[i].hz);
      const g = peak > 0 ? Math.sqrt((W.hx * W.hz) / peak) : 1;
      for (let i = wi; i < rs.length; i++) rs[i] = { ...rs[i], hx: rs[i].hx * g, hz: rs[i].hz * g };
      const lead = +(process.env.SHOULDERLEAD || 0.8), yb = rs[0].y, yw = rs[wi].y;
      for (let i = 0; i < wi; i++) {
        // b44: the muscle full through the upper half and tapering into the elbow, as a bicep and tricep do: the cap
        // eases from ELBOWTAPER (0.52) of the shoulder at the elbow up to SHOULDERLEAD by 55% of the way up
        const u = Math.max(0, Math.min(1, (rs[i].y - yb) / Math.max(1, yw - yb))), e = isLeg ? +(process.env.KNEETAPER || 0.6) : +(process.env.ELBOWTAPER || 0.4);
        const t = Math.min(1, u / 0.75), sm = t * t * (3 - 2 * t), cap = e + (lead - e) * sm;
        // set, not capped: the arm's own rings were already inside the cap, so it changed nothing
        // (b47: never past the shoulder's own footprint: the tricep's extra depth is kept inside it too)
        rs[i] = { ...rs[i], hx: W.hx * cap, hz: Math.min(W.hz * cap + 0.6 * sm, W.hz * lead), cz: rs[i].cz - 0.3 * sm * (W.hz * cap + 0.6 * sm <= W.hz * lead ? 1 : 0.4) };
      }
    }
    // b42: the forearm symmetric all round: every ring centred on its bone and round (as wide as it is deep, their
    // mean), its size eased along it, so it tapers evenly with no bend or lopsided curve
    if (!isUpper) {
      for (let i = 0; i < rs.length; i++) { const r = (rs[i].hx + rs[i].hz) / 2; rs[i] = { ...rs[i], cx: 0, cz: 0, hx: r, hz: r }; }
      for (let pass = 0; pass < 6; pass++) { const prev = rs.map((r) => r.hx); for (let i = 1; i < rs.length - 1; i++) { const v = (prev[i - 1] + 2 * prev[i] + prev[i + 1]) / 4; rs[i] = { ...rs[i], hx: v, hz: v }; } }
    }
    // b55: the shin straight: its radius eased in a straight line from the knee (its fullest ring there) to the ankle
    // (ANKLETAPER of it), no calf bulge
    if (isLeg && !isUpper) { const L = rs.length - 1, rK = Math.max(...rs.slice(Math.floor(L * 0.6)).map((r) => r.hx)), rA = rK * +(process.env.ANKLETAPER || 0.78);
      for (let i = 0; i <= L; i++) { const v = rA + (rK - rA) * (i / L); rs[i] = { ...rs[i], hx: v, hz: v }; } }
    // b43: the shoulder's resizing above left a sharp change of width under it (a crease the light picks out as a
    // colour change); the upper arm's outline eased again, POSTSMOOTH (8) passes, the end rings kept
    if (isUpper) for (let pass = 0; pass < +(process.env.POSTSMOOTH || 8); pass++) {
      const prev = rs.map((r) => ({ ...r }));
      for (let i = 1; i < rs.length - 1; i++) for (const key of ["hx", "hz", "cx", "cz"]) rs[i][key] = (prev[i - 1][key] + 2 * prev[i][key] + prev[i + 1][key]) / 4;
    }
    // b66: the upper arm's top set back (ARMTOPZ blocks, sheared from none at the elbow to all of it at the top), so on
    // all fours the shoulder runs straight down into the forearm with no kink at the elbow
    if (isArm) { const D = +(process.env.ARMTOPZ ?? -1.5), yb = rs[0].y, yt = rs[rs.length - 1].y;
      for (let i = 0; i < rs.length; i++) { const u = Math.max(0, Math.min(1, (rs[i].y - yb) / Math.max(1, yt - yb))); rs[i] = { ...rs[i], cz: rs[i].cz + D * u }; } }
    // b53: the thighs much bigger (THIGHSCALE 1.55) and set toward the body's middle (THIGHIN blocks), more at the
    // top than at the knee, so the two close the gap between them
    if (isLeg && isUpper) {
      const SC = +(process.env.THIGHSCALE || 1.55), IN = +(process.env.THIGHIN || 1.4), inner = id === "legR" ? 1 : -1, yb = rs[0].y, yt = rs[rs.length - 1].y;
      for (let i = 0; i < rs.length; i++) { const u = Math.max(0, Math.min(1, (rs[i].y - yb) / Math.max(1, yt - yb))), k = 1 + (SC - 1) * (+(process.env.KNEESCALE || 0.55) + (1 - +(process.env.KNEESCALE || 0.55)) * u);
        rs[i] = { ...rs[i], hx: rs[i].hx * k, hz: rs[i].hz * k, cx: rs[i].cx + inner * IN * (0.35 + 0.65 * u) }; }
    }
    // b38: the elbow pinned. The upper arm's lower end and the forearm's upper end are centred on the elbow joint (the
    // upper arm's bone end, the forearm's origin), eased onto it over ELBOWBLEND rings, and each runs half a block past
    // the joint, closed, so the two always meet centre to centre and overlap however the elbow bends.
    { const N = +(process.env.ELBOWBLEND || 4);
      if (isUpper && B.len) {
        const yj = -B.len; rs[0] = { ...rs[0], y: Math.min(rs[0].y, yj - 0.5) };
        for (let i = 0; i < Math.min(N, rs.length); i++) { const w = 1 - i / N; rs[i] = { ...rs[i], cx: rs[i].cx * (1 - w), cz: rs[i].cz * (1 - w) }; }
      }
      if (!isUpper) {
        // b40: the forearm's top no wider than the upper arm's end over it (easing out to its own size), so no ledge
        const up = out[B.parent] && out[B.parent].loft ? out[B.parent].loft.sections[1] || out[B.parent].loft.sections[0] : null;
        if (up) for (let i = 0; i < Math.min(N + 2, rs.length); i++) { const k = rs.length - 1 - i, m = 1 + 0.1 * i; rs[k] = { ...rs[k], hx: Math.min(rs[k].hx, up[1] * m), hz: Math.min(rs[k].hz, up[2] * m) }; }
        const L = rs.length - 1; rs[L] = { ...rs[L], y: Math.max(rs[L].y, 0.5) };
        for (let i = 0; i < Math.min(N, rs.length); i++) { const k = L - i, w = 1 - i / N; rs[k] = { ...rs[k], cx: rs[k].cx * (1 - w), cz: rs[k].cz * (1 - w) }; }
      }
    }
    // b39: the rings spaced evenly along the arm's outline (by distance over its surface, height and radius both), one
    // every RINGSTEP blocks, so the facets are the same size over the shoulder's dome as down the arm
    // b40: both ends at the elbow rounded: the last ring drawn in to ELBOWROUND (0.6) of its size and the one before to
    // 0.88, so the two parts meet as a ball joint rather than flat discs that stick out when the elbow bends
    { const R = +(process.env.ELBOWROUND || 0.6);
      if (isUpper && B.len) { rs[0] = { ...rs[0], hx: rs[0].hx * R, hz: rs[0].hz * R }; if (rs[1]) rs[1] = { ...rs[1], hx: rs[1].hx * 0.88, hz: rs[1].hz * 0.88 }; }
      if (!isUpper) { const L = rs.length - 1; rs[L] = { ...rs[L], hx: rs[L].hx * R, hz: rs[L].hz * R }; if (L > 0) rs[L - 1] = { ...rs[L - 1], hx: rs[L - 1].hx * 0.88, hz: rs[L - 1].hz * 0.88 }; }
      // b55: the shin's ankle end rounded too, so it tucks into the foot's ankle collar with no flat disc's edge
      if (isLeg && !isUpper) { rs[0] = { ...rs[0], hx: rs[0].hx * 0.8, hz: rs[0].hz * 0.8 }; if (rs[1]) rs[1] = { ...rs[1], hx: rs[1].hx * 0.95, hz: rs[1].hz * 0.95 }; } }
    const fine = (() => {
      const rad = (r) => (r.hx + r.hz) / 2, sAt = [0];
      for (let i = 1; i < rs.length; i++) sAt.push(sAt[i - 1] + Math.hypot(rs[i].y - rs[i - 1].y, rad(rs[i]) - rad(rs[i - 1])));
      const total = sAt[sAt.length - 1], n = Math.max(2, Math.round(total / +(process.env.RINGSTEP || 1.4))), out = [];
      for (let k = 0; k <= n; k++) {
        const sv = (total * k) / n; let i = 0; while (i < sAt.length - 2 && sAt[i + 1] < sv) i++;
        const t = sAt[i + 1] > sAt[i] ? (sv - sAt[i]) / (sAt[i + 1] - sAt[i]) : 0, a = rs[i], b = rs[i + 1];
        out.push({ y: a.y + (b.y - a.y) * t, hx: a.hx + (b.hx - a.hx) * t, hz: a.hz + (b.hz - a.hz) * t, cx: a.cx + (b.cx - a.cx) * t, cz: a.cz + (b.cz - a.cz) * t });
      }
      return out;
    })();
    const LIN = process.env.KEEPBLOCKS !== "1" ? 1 : +(process.env.LOFTIN || 1.05);
    const sections = fine.map((r) => [r.y, r.hx * LIN, r.hz * LIN, 0.42 * Math.min(r.hx, r.hz), r.cx, r.cz]);
    // colours as ramp greys mixed by fraction (hex), so the fade is smooth
    let greys = fine.slice(0, -1).map((r, i) => Math.max(0, Math.min(11, colourAt((r.y + fine[i + 1].y) / 2))));
    // and the fade eased along it too, so no band marks where the shoulder ends
    if (isUpper) for (let pass = 0; pass < 3; pass++) greys = greys.map((g, i) => i === 0 || i === greys.length - 1 ? g : (greys[i - 1] + 2 * g + greys[i + 1]) / 4);
    // b50: shaggy fur fringes at the seams (the forearm's wrist has one by itself where it meets the fist): on the upper
    // arm, at the bottom of the shoulder's silver (the widest ring) and just over the elbow
    const fr = [];
    if (isArm) { fr.push(rs[wi].y - 0.2); fr.push(fine[0].y + 1.6); }
    // b51: the arm darker overall and the shoulder's top a mid grey rather than near-white: every grey scaled by
    // ARMDARK (0.78) and held under ARMTOP (6.5)
    greys = greys.map((v) => Math.min(+(process.env.ARMTOP || 4.4), v * +(process.env.ARMDARK || 0.62)));
    // b97: on a shoulder or thigh the fade never falls back toward the top: each ring at least as light as the one under it
    if (isUpper) for (let i = 1; i < greys.length; i++) greys[i] = Math.max(greys[i], greys[i - 1]);
    out[id].loft = { sections, greys, fringes: fr, upper: isUpper, arm: isArm };
    // b33: the shoulder's blocks are kept and the faceted shell laid over them, a little inside their reach (LOFTIN),
    // so the blocks show through it here and there as texture over a round form
    // b35: the user chose the smooth shell alone (no blocks under it) for the upper arm and forearm; KEEPBLOCKS=1 keeps
    // them as in b33-b34
    if (process.env.KEEPBLOCKS !== "1") out[id].cells = cells.filter((c) => c[1] < low);
    // b47: the forearm's wrist edge reaches WRISTDROP (0.55) further down, so the fist hung from it puts the knuckles
    // on the ground with the feet
    if (!isUpper && !isLeg) { fine[0] = { ...fine[0], y: fine[0].y - +(process.env.WRISTDROP || 1.15) }; sections[0][0] = fine[0].y; }
    // b42: the hand is the Ooga's fist (BL.heroBody.hand) in black, sized to the wrist (the forearm's lowest ring), set
    // under it with its knuckles where the blocky hand's were, and a short thumb; the hand's blocks go
    if (!isUpper && !isLeg && process.env.FIST !== "0") {
      const w = fine[0];
      out[id].fist = { side: id === "foreR" ? -1 : 1, y: w.y, cx: w.cx, cz: w.cz, hx: w.hx, hz: w.hz, bottom: yMin };
      out[id].cells = [];
    }
    // b53: the foot, faceted, in place of the shin's lowest blocks: measured from the authored foot (its lowest two
    // world rows), built in the world with its sole flat and toes forward, then carried into the shin's frame
    if (id.startsWith("shin") && process.env.FOOT !== "0") {
      const wc = [...WORLD[id].keys()].map((k) => k.split(",").map(Number)), y0 = Math.min(...wc.map((c) => c[1])), fc = wc.filter((c) => c[1] <= y0 + 1);
      const fx0 = Math.min(...fc.map((c) => c[0])), fx1 = Math.max(...fc.map((c) => c[0])) + 1, fz0 = Math.min(...fc.map((c) => c[2])), fz1 = Math.max(...fc.map((c) => c[2])) + 1;
      // the ankle: the shin's bottom ring's centre, in the world
      const ank = toWorld([fine[0].cx, fine[0].y, fine[0].cz]);
      out[id].foot = { box: [fx0, fx1, y0, fz0, fz1], ank, inner: id === "shinR" ? 1 : -1, toLocal: null };
      out[id].foot.rest = B.rest; out[id].foot.joint = B.joint;
      out[id].cells = [];
    }
    console.log("faceted shoulder", id, { rings: sections.length, removed: cells.length - out[id].cells.length });
  }
}
// b25: the waist overlap without the plates. The abdomen and chest overlap 1.5 blocks across the waist plane so a
// bend opens no gap, but on their own grids each one's end stood proud of the other's surface as a raised plate in
// the middle of the back. In the knuckle stance, a block of either past the waist plane is kept only where it lies
// wholly inside the other (every corner), so the overlap is hidden there and still fills the waist as it bends.
{
  const seg = (id) => { const B = BONES[id], set = new Set(out[id].cells.map(([x, y, z]) => K(x, y, z))), inv = qinv(B.rest);
    return { B, set, toW: (c) => qrot(B.rest, c).map((v, i) => v + B.joint[i]), inside: (w) => set.has(K(...qrot(inv, w.map((v, i) => v - B.joint[i])).map(Math.floor))) }; };
  const A = seg("abdomen"), C = seg("chest");
  const past = (w) => (w[1] - WST[1]) * split[1] + (w[2] - WST[2]) * split[2];
  const trim = (S, other, sign) => {
    const before = out[S === A ? "abdomen" : "chest"].cells.length;
    const keep = out[S === A ? "abdomen" : "chest"].cells.filter(([x, y, z]) => {
      const mid = S.toW([x + 0.5, y + 0.5, z + 0.5]); if (sign * past(mid) <= 0) return true;
      // b75: the belly keeps nothing past the waist (its stretch along the back would carry it out past the chest)
      if (S === A && process.env.ABDPAST === "0") return false;
      for (const d of [[0.05,0.05,0.05],[0.95,0.05,0.05],[0.05,0.95,0.05],[0.05,0.05,0.95],[0.95,0.95,0.05],[0.95,0.05,0.95],[0.05,0.95,0.95],[0.95,0.95,0.95]]) if (!other.inside(S.toW([x + d[0], y + d[1], z + d[2]]))) return false;
      return true; });
    out[S === A ? "abdomen" : "chest"].cells = keep;
    return before - keep.length;
  };
  // the lit list of the abdomen refers to cells; drop entries for removed cells
  const cutA = trim(A, C, 1), cutC = trim(C, A, -1);
  // b75: the belly's back ramped down to the chest's at the waist. In the belly's own frame (y along the spine from the
  // hip, -z its back), the chest's back near the waist is found per column x; over the belly's last WAISTRAMP rows a
  // block standing further back than that (by more than an allowance growing with distance from the waist) goes, so
  // the belly runs into the chest with no raised plate at the join.
  if (process.env.WAISTRAMP === "1") {
    // b75: the belly trimmed back to the chest's surface at the waist. Both in the belly's frame (y along the spine
    // from the hip, -z its back), the chest's rows mapped through the all-fours stretch (BACKLEN, the chest set out
    // along the spine) onto the belly's rows; a belly block standing further back than the chest's back in its row and
    // column (by more than WAISTSLACK) goes, so the belly never stands proud of the chest where they meet
    const inv = qinv(A.B.rest), aLow = Math.min(...out.abdomen.cells.map((c) => c[1])), BLN = +(process.env.BACKLEN || 1.25), shift = (BLN - 1) * (L1 - aLow), back = new Map();
    for (const [x, y, z] of out.chest.cells) { const w = C.toW([x + 0.5, y + 0.5, z + 0.5]), l = qrot(inv, w.map((v, i) => v - A.B.joint[i]));
      const row = Math.floor(aLow + (l[1] + shift - aLow) / BLN), key = Math.floor(l[0]) + "," + row; back.set(key, Math.min(back.get(key) ?? 1e9, l[2] - 0.5)); }
    const SL = +(process.env.WAISTSLACK || 0.3), before = out.abdomen.cells.length;
    out.abdomen.cells = out.abdomen.cells.filter(([x, y, z]) => { if (y < L1 - 6) return true; const b = back.get(x + "," + y); return b === undefined || z >= b - SL; });
    const keptA2 = new Set(out.abdomen.cells.map(([x, y, z]) => K(x, y, z))); out.abdomen.lit = out.abdomen.lit.filter((c) => keptA2.has(K(...c)));
    console.log("waist ramp", before - out.abdomen.cells.length);
  }
  // b75: the chest's lower back filled out to the belly's back line. In the belly's frame its back runs level up to the
  // waist, but the chest's lowest rows dipped under it, so the belly's end stood up as a ledge on all fours. For each
  // column, chest rows within WAISTBAND of the waist whose back lies short of the belly's (by more than 0.3) gain blocks
  // out to it, in the colour of the belly's back there; they ride with the chest, so the line holds standing.
  if (process.env.WAISTFILL !== "0") {
    const inv = qinv(A.B.rest), cinv = qinv(C.B.rest), ab = new Map(), cb = new Map(), have = new Set(out.chest.cells.map(([x, y, z]) => K(x, y, z))), add = [];
    const acol = new Map(); for (const [x, y, z, k] of out.abdomen.cells) if (y >= Math.floor(L1) - 5 && y <= Math.floor(L1) - 2) { if (z < (ab.get(x) ?? 1e9)) { ab.set(x, z); acol.set(x, k); } }
    for (const [x, y, z, k] of out.chest.cells) { const w = C.toW([x + 0.5, y + 0.5, z + 0.5]), l = qrot(inv, w.map((v, i) => v - A.B.joint[i])), key = Math.floor(l[0]) + "," + Math.floor(l[1]);
      const cur = cb.get(key); if (!cur || l[2] < cur[0]) cb.set(key, [l[2], k]); }
    const BAND = +(process.env.WAISTBAND || 3);
    for (const [key, [zc, k]] of cb) { const [x, y] = key.split(",").map(Number); if (Math.abs(y + 0.5 - L1) > BAND) continue; const za = ab.get(x); if (za === undefined || zc - 0.5 <= za + 0.3) continue;
      for (let z = za + 0.25; z < zc; z += 0.5) for (const dx of [0.25, 0.75]) for (const dy of [0.25, 0.75]) {
        const w = qrot(A.B.rest, [x + dx, y + dy, z]).map((v, i) => v + A.B.joint[i]), c = qrot(cinv, w.map((v, i) => v - C.B.joint[i])).map(Math.floor), ck = K(...c);
        if (!have.has(ck)) { have.add(ck); add.push([...c, acol.get(x) ?? k]); } } }
    out.chest.fill = add.map((c) => c.slice(0, 4));
    console.log("waist fill", add.length);
  }

  const keptA = new Set(out.abdomen.cells.map(([x, y, z]) => K(x, y, z))); out.abdomen.lit = out.abdomen.lit.filter((c) => keptA.has(K(...c)));
  const keptC = new Set(out.chest.cells.map(([x, y, z]) => K(x, y, z))); out.chest.lit = out.chest.lit.filter((c) => keptC.has(K(...c)));
  console.log("waist trim", { abdomen: cutA, chest: cutC });
}
// The nape (b22): the head stays level while the chest turns back to stand, so the top of the back swings away
// behind the head. The chest carries a mass of fur that, in the knuckle stance, lies wholly inside the back half of the
// head (hidden); as the chest turns back it comes out of the head and fills the space between the back and the head's
// back, so the saddle runs on up to the crown in every pose. Coloured from the nearest posed back block.
{
  const H = parts.head, o = H.offset, B = BONES.chest, inv = qinv(B.rest), have = new Set(out.chest.cells.map(([x, y, z]) => K(x, y, z)));
  const exposed = []; for (const [key, k] of W.chest) { const [x, y, z] = key.split(",").map(Number); if (y >= 20 && [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a, b, c]) => !W.chest.has(K(x + a, y + b, z + c)))) exposed.push([x + 0.5, y + 0.5, z + 0.5, k]); }
  const headW = new Set(H.cells.map(([x, y, z]) => K(Math.round(x + o[0]), y + o[1], z + o[2]))), add = [];
  const NZ = +(process.env.NAPEZ || 21), NX = +(process.env.NAPEX || 3.5);
  for (const key of headW) {
    const [x, y, z] = key.split(",").map(Number);
    if (z + 0.5 > NZ || Math.abs(x + 0.5) > NX || y < 19 || y > +(process.env.NAPEY || 25)) continue;
    // the cells of the chest's grid this head cell covers, kept only where every corner of the chest cell lies in the
    // head, so at rest none of it shows past the head's outline
    for (const dx of [0.25, 0.75]) for (const dy of [0.25, 0.75]) for (const dz of [0.25, 0.75]) {
      const l = qrot(inv, [x + dx - B.joint[0], y + dy - B.joint[1], z + dz - B.joint[2]]).map(Math.floor), lk = K(...l);
      if (have.has(lk)) continue;
      let inside = true;
      for (const c of [[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1]]) {
        const w = qrot(B.rest, [l[0] + c[0] * 0.98 + 0.01, l[1] + c[1] * 0.98 + 0.01, l[2] + c[2] * 0.98 + 0.01]).map((v, i) => v + B.joint[i]);
        if (!headW.has(K(Math.floor(w[0]), Math.floor(w[1]), Math.floor(w[2])))) { inside = false; break; }
      }
      if (!inside) continue;
      have.add(lk);
      let k = 3, bd = 1e9; for (const e of exposed) { const d = (e[0] - x - 0.5) ** 2 + (e[1] - y - 0.5) ** 2 + (e[2] - z - 0.5) ** 2; if (d < bd) { bd = d; k = e[3]; } }
      add.push([...l, k]);
    }
  }
  out.chest.cells.push(...add);
  console.log("nape", add.length);
}
// And the head's side of it: head cells behind and under the skull that, in the knuckle stance, lie wholly inside the
// posed chest (hidden); as the chest drops away when standing they come out and meet the chest's nape fill.
const headNape = (() => {
  const H = parts.head, o = H.offset, have = new Set(H.cells.map(([x, y, z]) => K(x, y, z))), add = [];
  const exposed = []; for (const [key, k] of W.chest) { const [x, y, z] = key.split(",").map(Number); if (y >= 20 && [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a, b, c]) => !W.chest.has(K(x + a, y + b, z + c)))) exposed.push([x + 0.5, y + 0.5, z + 0.5, k]); }
  // a block inside the posed chest by a margin, so the resampled chest surface never lets it through
  // Tested against the rebuilt chest itself (its own grid), so a cell kept is wholly inside the chest as drawn.
  const CB = BONES.chest, cinv = qinv(CB.rest), chestCells = new Set(out.chest.cells.map(([x, y, z]) => K(x, y, z)));
  const inChest = (w) => { const l = qrot(cinv, w.map((v, i) => v - CB.joint[i])).map(Math.floor); return chestCells.has(K(...l)); };
  const zmin = +(process.env.HNZ || 8);
  for (let x = -5; x <= 5; x++) for (let y = 19; y <= +(process.env.HNY || 24); y++) for (let z = zmin - Math.round(o[2]); z <= 22; z++) {
    if (have.has(K(x, y, z))) continue;
    let inside = true;
    for (const c of [[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1]]) {
      const w = [x + o[0] + c[0] * 0.9 + 0.05, y + o[1] + c[1] * 0.9 + 0.05, z + o[2] + c[2] * 0.9 + 0.05];
      if (!inChest(w)) { inside = false; break; }
    }
    if (!inside) continue;
    const wx = x + o[0] + 0.5, wy = y + o[1] + 0.5, wz = z + o[2] + 0.5;
    let k = 3, bd = 1e9; for (const e of exposed) { const d = (e[0] - wx) ** 2 + (e[1] - wy) ** 2 + (e[2] - wz) ** 2; if (d < bd) { bd = d; k = e[3]; } }
    add.push([x, y, z, k]);
  }
  return add;
})();
console.log("head nape", headNape.length);
out.head = { cells: [...parts.head.cells, ...headNape], fine: parts.head.fine, origin: parts.head.offset.map((v, i) => v - parts.head.pivot[i]) };
// Standing on the hind legs: each part's bone direction in the world (t 1).
const STAND = { abdomen: qx(+(process.env.ABD1 ?? 0)), chest: qx(+(process.env.CH1 || 0)), head: [0, 0, 0, 1] };
// b27-b29: standing, the hips are drawn in (LEGSLIDE) and the legs angle out from them, so the thighs meet at the top
// and the feet stand wide.
const hang = { armR: [-0.2, -1, -0.05], armL: [0.2, -1, -0.05], foreR: [-0.06, -1, 0.42], foreL: [0.06, -1, 0.42], legR: [-0.07, -1, 0.02], legL: [0.07, -1, 0.02], shinR: [-0.07, -1, -0.06], shinL: [0.07, -1, -0.06] };
for (const [id, d] of Object.entries(hang)) STAND[id] = arc([0, -1, 0], d);
// b35: standing, each forearm is turned about its own length by ELBOWTWIST (45) degrees, so the elbows point back rather
// than out to the sides (the right arm one way, the left the other).
{ const T = +(process.env.ELBOWTWIST ?? 67.5), qyd = (deg) => { const a = (deg * Math.PI) / 360; return [0, Math.sin(a), 0, Math.cos(a)]; };
  STAND.foreR = qmul(STAND.foreR, qyd(-T)); STAND.foreL = qmul(STAND.foreL, qyd(T)); }
// b24: the neck closed from the poses themselves. For t in NECK_T (standing, and the steps to it), the torso and head
// are posed as pose() poses them; in each slice across the neck (|x| <= 4) the back-most block of every row, from the
// chest's shoulders up to the crown, is pulled back to the straight line between the rows above and below wherever
// it dips in (a notch), and those gap cells are added to whichever part hides them in the knuckle stance (the head if
// they lie inside the torso there, else the chest if inside the head), coloured from the nearest back block.
{
  const slerp = (a, b, t) => { let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; if (d < 0) { b = b.map((v) => -v); d = -d; } if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...q); return q.map((v) => v / l); } const th = Math.acos(d), sn = Math.sin(th); return a.map((v, i) => (Math.sin((1 - t) * th) * v + Math.sin(t * th) * b[i]) / sn); };
  const chain = ["abdomen", "chest", "head"], P0w = P0;
  const frames = (t) => { const f = { hips: { q: [0, 0, 0, 1], at: P0w } };
    for (const id of chain) { const B = BONES[id], par = B.parent, pr = par === "hips" ? [0, 0, 0, 1] : BONES[par].rest, pj = par === "hips" ? P0w : BONES[par].joint;
      const off = qrot(qinv(pr), B.joint.map((v, i) => v - pj[i])), q = slerp(B.rest, STAND[id], t);
      if (id === "head") off[2] -= HEADBACK * t;
      f[id] = { q, at: qrot(f[par].q, off).map((v, i) => v + f[par].at[i]) }; }
    return f; };
  const local = { abdomen: out.abdomen.cells, chest: out.chest.cells, head: out.head.cells };
  const ho = out.head.origin, base = (id) => (id === "head" ? ho : [0, 0, 0]);
  const toW = (F, id, c, d = [0.5, 0.5, 0.5]) => qrot(F[id].q, c.map((v, i) => v + base(id)[i] + d[i])).map((v, i) => v + F[id].at[i]);
  const toL = (F, id, w) => qrot(qinv(F[id].q), w.map((v, i) => v - F[id].at[i])).map((v, i) => Math.floor(v - base(id)[i]));
  const occAt = (F) => { const o = new Set(); for (const id of chain) for (const c of local[id]) o.add(K(...toW(F, id, c).map(Math.floor))); return o; };
  const F0 = frames(0), occ0 = occAt(F0);
  const hidden = (F, id, l) => { for (const d of [[0.1,0.1,0.1],[0.9,0.1,0.1],[0.1,0.9,0.1],[0.1,0.1,0.9],[0.9,0.9,0.1],[0.9,0.1,0.9],[0.1,0.9,0.9],[0.9,0.9,0.9]]) if (!occ0.has(K(...toW(F0, id, l, d).map(Math.floor)))) return false; return true; };
  const exposed = []; for (const [key, k] of W.chest) { const [x, y, z] = key.split(",").map(Number); if (y >= 18 && [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a, b, c]) => !W.chest.has(K(x + a, y + b, z + c)))) exposed.push([x + 0.5, y + 0.5, z + 0.5, k]); }
  const colourAt = (w) => { let k = 3, bd = 1e9; for (const e of exposed) { const d = (e[0] - w[0]) ** 2 + (e[1] - w[1]) ** 2 + (e[2] - w[2]) ** 2; if (d < bd) { bd = d; k = e[3]; } } return k; };
  const added = { head: new Set(local.head.map((c) => K(c[0], c[1], c[2]))), chest: new Set(local.chest.map((c) => K(c[0], c[1], c[2]))) };
  let nHead = 0, nChest = 0, nShown = 0;
  for (const t of (process.env.NECK_T || "1,0.85,0.7,0.55,0.4").split(",").map(Number)) {
    const F = frames(t), occ = occAt(F), hy = F.head.at[1];
    for (let x = -4; x <= 4; x++) {
      const back = new Map();
      for (const key of occ) { const [cx, y, z] = key.split(",").map(Number); if (cx !== x || y < hy - 6 || y > hy + 8) continue; back.set(y, Math.min(back.get(y) ?? 1e9, z)); }
      const ys = [...back.keys()].sort((a, b) => a - b);
      for (const y of ys) {
        let target = back.get(y);
        for (const a of ys) for (const b of ys) if (a < y && b > y && b - a <= 8) target = Math.min(target, Math.ceil(back.get(a) + (back.get(b) - back.get(a)) * (y - a) / (b - a)));
        for (let z = target; z < back.get(y); z++) {
          const w = [x + 0.5, y + 0.5, z + 0.5];
          let id = null, l = null;
          for (const cand of ["head", "chest"]) { const L = toL(F, cand, w); if (hidden(F, cand, L)) { id = cand; l = L; break; } }
          if (!id) { id = "head"; l = toL(F, "head", w); nShown++; }
          const lk = K(...l); if (added[id].has(lk)) continue; added[id].add(lk);
          const c = [...l, colourAt(toW(F0, id, l))]; (id === "head" ? out.head.cells : out.chest.cells).push(c); local[id] = id === "head" ? out.head.cells : out.chest.cells;
          id === "head" ? nHead++ : nChest++;
        }
      }
    }
  }
  // Then pinholes: in each pose, an empty cell round the neck with four or more of its faces against the body.
  for (const t of (process.env.NECK_T || "1,0.85,0.7,0.55,0.4").split(",").map(Number)) {
    const F = frames(t), occ = occAt(F), hy = Math.floor(F.head.at[1]), hz = Math.floor(F.head.at[2]);
    for (let x = -5; x <= 5; x++) for (let y = hy - 4; y <= hy + 8; y++) for (let z = hz - 7; z <= hz + 2; z++) {
      if (occ.has(K(x, y, z))) continue;
      let f = 0; for (const [a, b, c] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) if (occ.has(K(x + a, y + b, z + c))) f++;
      if (f < 3) continue;
      const w = [x + 0.5, y + 0.5, z + 0.5]; let id = null, l = null;
      for (const cand of ["head", "chest"]) { const L = toL(F, cand, w); if (hidden(F, cand, L)) { id = cand; l = L; break; } }
      if (!id) continue;                                   // only what the knuckle stance hides
      const lk = K(...l); if (added[id].has(lk)) continue; added[id].add(lk);
      (id === "head" ? out.head.cells : out.chest.cells).push([...l, colourAt(toW(F0, id, l))]);
      id === "head" ? nHead++ : nChest++;
    }
  }
  // b30: standing, the belly rises in front of the chest and its blocks poke over and through the pecs. With the body
  // posed standing, every belly block that lands at the pecs' height (their rows, a block either way) and in front of
  // a plane a block behind the pecs' front is cut, as is every belly block poking through the chest above them.
  {
    const F1 = frames(1), pecs = (out.chest.lit || []).map((c) => toW(F1, "chest", c));
    if (pecs.length && process.env.PECSHAVE !== "0") {
      const ys = pecs.map((p) => p[1]), zs = pecs.map((p) => p[2]).sort((a, b) => a - b);
      const y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1, zf = zs[zs.length >> 1] - 1;
      const chestAt = new Set(); for (const c of out.chest.cells) chestAt.add(K(...toW(F1, "chest", c).map(Math.floor)));
      const before = out.abdomen.cells.length;
      // the chest's front at each world column (x, row), standing
      const cf = new Map(); for (const c of out.chest.cells) { const w = toW(F1, "chest", c).map(Math.floor), k = w[0] + "," + w[1]; cf.set(k, Math.max(cf.get(k) ?? -1e9, w[2])); }
      out.abdomen.cells = out.abdomen.cells.filter((c) => { const w = toW(F1, "abdomen", c);
        if (w[1] >= y0 && w[1] <= y1 && w[2] > zf) return false;
        // anywhere from the pecs' foot up, a belly block standing in front of the chest's front there goes
        const f = cf.get(Math.floor(w[0]) + "," + Math.floor(w[1]));
        if (w[1] >= y0 - 3 && f !== undefined && w[2] > f + 0.5) return false;
        return true; });
      const kept = new Set(out.abdomen.cells.map((c) => K(c[0], c[1], c[2]))); out.abdomen.lit = out.abdomen.lit.filter((c) => kept.has(K(...c)));
      local.abdomen = out.abdomen.cells;
      console.log("pec shave", before - out.abdomen.cells.length);
    }
  }
  // b30: with the head set back when standing, its hidden nape fill (every head cell beyond the authored head) would
  // poke out behind the back; a fill cell that, standing, lies outside both the chest and the authored head goes.
  if (process.env.NAPETRIM !== "0") {
    const F1 = frames(1), n0 = parts.head.cells.length, body = new Set();
    for (const c of out.chest.cells) body.add(K(...toW(F1, "chest", c).map(Math.floor)));
    for (const c of out.abdomen.cells) body.add(K(...toW(F1, "abdomen", c).map(Math.floor)));
    for (let i = 0; i < n0; i++) body.add(K(...toW(F1, "head", out.head.cells[i]).map(Math.floor)));
    const before = out.head.cells.length;
    // only fill standing out behind the back goes: one behind the back-most body block of its column (x, row), or
    // in a column with none; fill inside or in front of the back stays, so no hole opens in it
    const back = new Map(); for (const k of body) { const [x, y, z] = k.split(",").map(Number), c = x + "," + y; back.set(c, Math.min(back.get(c) ?? 1e9, z)); }
    // the back's line there, as the median of the back-most blocks round it (5x5), so a notch in the back is filled
    const line = (x, y) => { const l = []; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const v = back.get((x + a) + "," + (y + b)); if (v !== undefined) l.push(v); } if (l.length < 6) return undefined; l.sort((p, q) => p - q); return l[l.length >> 1]; };
    out.head.cells = out.head.cells.filter((c, i) => { if (i < n0) return true; const w = toW(F1, "head", c).map(Math.floor), m = line(w[0], w[1]); return m === undefined ? false : w[2] >= m - 2; });
    local.head = out.head.cells;
    console.log("nape trim", before - out.head.cells.length);
  }
  console.log("neck fill", { head: nHead, chest: nChest, showsAtRest: nShown });
}
// b94: the head keeps only its own authored blocks: the nape fill behind the skull (headNape) and the neck fill's head
// blocks stood out of the back of the head, and the faceted torso now runs up into the head itself (HEADNAPE=1 restores them)
if (process.env.HEADNAPE !== "1") { const before = out.head.cells.length; out.head.cells = parts.head.cells.slice(); console.log("head nape removed", before - out.head.cells.length); }
// b103: a stray light patch on the right side of the head under the ear (x 4, rows 21-24, behind the muzzle; the left side
// is dark there) takes the colours of its mirror cells on the left
{ const H = new Map(out.head.cells.map((c) => [K(c[0], c[1], c[2]), c[3]])); let n = 0;
  out.head.cells = out.head.cells.map((c) => { if (c[0] !== 4 || c[1] < 21 || c[1] > 24 || c[2] < 17 || c[2] > 19) return c; const m = H.get(K(-c[0], c[1], c[2])); if (m === undefined || m === c[3]) return c; n++; return [c[0], c[1], c[2], m]; });
  console.log("head patch recoloured", n);
  // b104: the eyes spaced evenly about the face's middle (x 1.5 in quarter blocks, where the brow, muzzle and nostrils
  // centre): the right eye (iris 5-9, highlight 8-9) sat a quarter closer to the nose than the left (-7 to -3), so it and
  // its highlight move a quarter outward
  // b105: under the chin cleaned up: the head's bottom row (y 20, a small block hanging below the jaw) and two fine pieces
  // stepped under the muzzle (a thin slab, quarter rows 85-86, and a block hanging behind it, rows 81-86) go
  { const before = out.head.cells.length; out.head.cells = out.head.cells.filter((c) => c[1] > 20);
    const f0 = out.head.fine.length; out.head.fine = out.head.fine.filter((f) => !(f[2] === 85 && f[3] === 86) && !(f[2] === 81 && f[3] === 86));
    console.log("chin cleaned", before - out.head.cells.length, "cells", f0 - out.head.fine.length, "fine"); }
  out.head.fine = out.head.fine.map((f) => (f[6] === 13 || f[6] === 14) && f[0] >= 5 ? [f[0] + 1, f[1] + 1, ...f.slice(2)] : f);
  // and the single blocks standing out of each side of the head below the ears (x +-5, rows 23-25) go
  const before = out.head.cells.length; out.head.cells = out.head.cells.filter((c) => !(Math.abs(c[0]) === 5 && c[1] >= 23 && c[1] <= 25)); console.log("head side blocks removed", before - out.head.cells.length); }
// b123: the head split down the middle and mirrored, blocks and colours. Its blocks pair x with -x (column 0 its middle,
// the mirror plane half a block in, 2 in quarter units): a block with no twin gets one, and every block on the +x side
// takes its twin's colour on the -x side (they differed by a grey or two in 265 of 389 pairs). The fine face pieces
// were centred a quarter block to one side (1.5 quarters, not 2): the pieces on the -x side are kept and their mirrors
// replace those on the +x side (the eye highlights mirrored too, so both sit on the eye's inner side), and a piece
// across the middle is widened to be centred on it. MIRRORHEAD=0 leaves it as it was
if (process.env.MIRRORHEAD !== "0") { const A = 2, cells = new Map(out.head.cells.map((c) => [K(c[0], c[1], c[2]), c])), added = [];
  for (const [x, y, z, k] of out.head.cells) if (!cells.has(K(-x, y, z))) added.push([-x, y, z, k]);
  out.head.cells = [...out.head.cells, ...added]; const left = new Map(out.head.cells.filter((c) => c[0] < 0).map((c) => [K(c[0], c[1], c[2]), c[3]]));
  if (process.env.MIRRORCOL === "1") out.head.cells = out.head.cells.map((c) => c[0] > 0 ? [c[0], c[1], c[2], left.get(K(-c[0], c[1], c[2]))] : c);
  // (b170: unmirrored, the head kept its own greys, and some one-sided light patches with them: a block BLOTCH (2) or
  // more greys lighter than its twin takes the twin's grey; a grey's difference stays)
  else { const all = new Map(out.head.cells.map((c) => [K(c[0], c[1], c[2]), c[3]])), B = +(process.env.BLOTCH ?? 2); let nb = 0;
    out.head.cells = out.head.cells.map((c) => { const m = all.get(K(-c[0], c[1], c[2])); if (m === undefined || c[3] > 11 || m > 11 || c[3] - m < (m <= +(process.env.DARKFUR ?? 5) ? 1 : B)) return c; nb++; return [c[0], c[1], c[2], m]; });
    console.log("head blotches darkened", nb); }
  const mx = (f) => [2 * A - f[1], 2 * A - f[0], ...f.slice(2)], keep = [];
  // (the eyes' white dots, colour 14, are not mirrored: each moves across with its eye, keeping its place on the eye's
  // +x side as before)
  const eyeOf = (f) => out.head.fine.find((g) => g[6] === 13 && g[0] <= f[0] && f[1] <= g[1] && g[2] <= f[2] && f[3] <= g[3]);
  for (const f of out.head.fine) { if (f[6] === 14 && f[1] <= A && eyeOf(f)) { const g = eyeOf(f), d = 2 * A - g[1] - g[0]; keep.push(f, [f[0] + d, f[1] + d, ...f.slice(2)]); continue; }
    if (f[1] <= A) { keep.push(f, mx(f)); continue; } if (f[0] >= A) continue; keep.push([Math.min(f[0], 2 * A - f[1]), Math.max(f[1], 2 * A - f[0]), ...f.slice(2)]); }
  out.head.fine = keep; console.log("head mirrored:", added.length, "blocks added,", out.head.fine.length, "fine pieces"); }
// b126: the back of the head's base (the neck) dark, not light: its back face, rows 23-26, was light grey (b), rows 27-28
// mid greys going up into it; those blocks take the dark fur (NECKDARK, grey 2), 27-28 eased between (3, 4) so it runs on
// into the darker head above. NECKDARK=-1 leaves them
if (+(process.env.NECKDARK ?? 2) >= 0) { const D = +(process.env.NECKDARK ?? 2), back = new Map();
  for (const [x, y, z] of out.head.cells) if (!back.has(x + "," + y) || z < back.get(x + "," + y)) back.set(x + "," + y, z);
  let n = 0; out.head.cells = out.head.cells.map((c) => { const [x, y, z, k] = c; if (y < 23 || y > 28 || z !== back.get(x + "," + y) || k > 11) return c;
    const want = y <= 26 ? D : y === 27 ? D + 1 : D + 2; if (k <= want) return c; n++; return [x, y, z, want]; });
  console.log("neck darkened", n); }
// b148: the back of the head's middle column has no twin to even it out, and row 29 there was a lone light block (grey 9
// between 5s), a bright dot on the back of the neck. Any back-face block in the middle column lighter than both blocks
// beside it by 2 or more takes the lighter of the two
{ const back = new Map(); for (const [x, y, z, k] of out.head.cells) if (!back.has(x + "," + y) || z < back.get(x + "," + y)[0]) back.set(x + "," + y, [z, k]);
  let n = 0; out.head.cells = out.head.cells.map((c) => { const [x, y, z, k] = c; if (x !== 0 || k > 11 || z !== back.get("0," + y)[0]) return c;
    const a = back.get("-1," + y), b = back.get("1," + y); if (!a || !b || a[1] > 11 || b[1] > 11) return c; const m = Math.max(a[1], b[1]); if (k - m < 2) return c; n++; return [x, y, z, m]; });
  console.log("nape dots evened", n); }
// b170: no light blocks on the back of the head: every block whose back face is the skull's back (its column's rearmost,
// within 2 blocks of the head's back plane, so the ears and the sides are left as they are) and lighter than the back's
// median grey by more than 1 takes that median
if (process.env.HEADBACKEVEN !== "0") { const back = new Map(); let zb = 1e9; for (const [x, y, z, k] of out.head.cells) { zb = Math.min(zb, z); if (!back.has(x + "," + y) || z < back.get(x + "," + y)) back.set(x + "," + y, z); }
  const isBack = (x, y, z) => z === back.get(x + "," + y) && z <= zb + 2, ks = out.head.cells.filter(([x, y, z, k]) => k <= 11 && isBack(x, y, z)).map((c) => c[3]).sort((a, b) => a - b), med = ks[ks.length >> 1];
  let n = 0; out.head.cells = out.head.cells.map((c) => { const [x, y, z, k] = c; if (k > 11 || !isBack(x, y, z) || k <= med + 1) return c; n++; return [x, y, z, med]; });
  console.log("back of head evened", n, "to grey", med); }
// (b170: and none on the crown or sides: every block of the head's fur, behind its front FACEDEPTH (4) layers (the face,
// brow and muzzle, up to BROWROWS (2) over the eyes, keep their greys; the crown over them is fur) and in from its outermost columns (the ears keep theirs), no lighter than the fur's
// median grey there by more than 1)
if (process.env.HEADFUREVEN !== "0") { let zf = -1e9, xm = 0; for (const [x, y, z] of out.head.cells) { zf = Math.max(zf, z); xm = Math.max(xm, Math.abs(x)); }
  const D = +(process.env.FACEDEPTH ?? 4); let yb = -1e9; for (const f of out.head.fine) if (f[6] === 13) yb = Math.max(yb, Math.ceil(f[3] / 4) + +(process.env.BROWROWS ?? 2)); if (yb < -1e8) yb = 1e9;
  const inFur = (x, z, k, y) => k <= 11 && (z < zf - D + 1 || y > yb) && Math.abs(x) < xm - 1, ks = out.head.cells.filter(([x, y, z, k]) => inFur(x, z, k, y)).map((c) => c[3]).sort((a, b) => a - b), md = ks[ks.length >> 1];
  let n2 = 0; out.head.cells = out.head.cells.map((c) => { const [x, y, z, k] = c; if (!inFur(x, z, k, y) || k <= md + +(process.env.HEADFURSLACK ?? 0)) return c; n2++; return [x, y, z, md + +(process.env.HEADFURSLACK ?? 0)]; });
  console.log("head fur evened", n2, "to at most grey", md + +(process.env.HEADFURSLACK ?? 0)); }
// b125: the chest's and belly's blocks mirrored in shape too (x pairs with -1-x): 15 chest blocks had no twin, one at the
// back of its top row (the neck end), which stood that side of the back up to 1.4 blocks higher there and put its ridge
// half a block off the middle, so the neck end curved to one side seen from above. Each gets its twin, in its colour
// (the shell mirrors the colours itself); MIRRORSHAPE=0 leaves them
if (process.env.MIRRORSHAPE !== "0") for (const id of ["chest", "abdomen"]) { const P = out[id], xs = P.cells.map((c) => c[0]), A = Math.min(...xs) + Math.max(...xs), have = new Set(P.cells.map((c) => K(c[0], c[1], c[2]))), add = [];
  for (const [x, y, z, k] of P.cells) if (!have.has(K(A - x, y, z))) add.push([A - x, y, z, k]);
  P.cells.push(...add); console.log(id, "shape mirrored:", add.length, "blocks added"); }
// b27: on all fours the legs are drawn in, each thigh and its shin turned as one about the hip toward the middle by
// LEGIN degrees (12), so the stance is less spread. The parts stay built in their own frames (\`rest\`); \`knuckle\` is the
// pose they are shown in at t 0.
const qzd = (deg) => { const a = (deg * Math.PI) / 360; return [0, 0, Math.sin(a), Math.cos(a)]; };
// b29: on all fours each leg is one straight line seen from the front: the thigh's sideways lean is cut to LEGX (0.35)
// of what was authored, and the shin takes the thigh's lean (no outward bend at the knee).
const LEGX = +(process.env.LEGX || 0.35), KNUCKLE = {};
let LEGRISE = 0;
for (const side of ["R", "L"]) {
  const th = BONES["leg" + side], sh = BONES["shin" + side];
  const td0 = norm([th.dir[0] * LEGX, th.dir[1], th.dir[2]]), lean = td0[0] / -td0[1];
  const sd0 = norm([lean * -sh.dir[1], sh.dir[1], sh.dir[2]]);
  // b55: the knee bends the right way on all fours: the shin near upright, leaning back a touch (SHINLEAN), and the
  // thigh turned forward from the hip just enough to keep the hip's height, so the hands still meet the ground
  const sd = norm([lean * +(process.env.SHININ || 0), -1, +(process.env.SHINLEAN || -0.55)]);
  const reach = td0[1] * th.len + sd0[1] * sh.len, ty = Math.max(-1, (reach - sd[1] * sh.len) / th.len);
  const td = [td0[0], ty, Math.sqrt(Math.max(0, 1 - ty * ty - td0[0] * td0[0]))];
  console.log("stance", side, { thigh: td.map((v) => +v.toFixed(2)), shin: sd.map((v) => +v.toFixed(2)), footZ: +(td[2] * th.len + sd[2] * sh.len).toFixed(2), kneeFlex: Math.round((Math.atan2(td[2], -td[1]) - Math.atan2(sd[2], -sd[1])) * 180 / Math.PI) });
  if (0) console.log("thigh", th.dir.map((v) => +v.toFixed(2)), th.len, "shin len", sh.len);
  console.log("shin dir", side, sh.dir.map((v) => +v.toFixed(2)), "->", sd.map((v) => +v.toFixed(2)));
  // b56: the natural stance (default): the knee bent the normal way, a little forward of the hip, the shin angled back
  // (SHINLEAN -0.55, about 29 degrees) to a foot a little behind the hip, straight down seen from the front (SHININ 0);
  // b55's legs-back try (thigh back, shin plumb: a backward knee) only under LEGSBACK=1, b53's under KNEEFWD=0
  const fwd = process.env.KNEEFWD !== "0";
  // b55: the legs back (the user's call, after b53): each shin hangs straight down (no lean in from the front, none
  // forward), and the thigh turns back from the hip just enough to keep the hip's height, so the feet stand well behind
  // the hips and the body reads longer; LEGBACKX keeps a little of the shin's lean in (0: none)
  const sb = norm([lean * +(process.env.LEGBACKX || 0) * -sh.dir[1], -1, +(process.env.SHINBACK || 0)]);
  const reachB = td0[1] * th.len + sd0[1] * sh.len, tyB = Math.max(-1, (reachB - sb[1] * sh.len) / th.len);
  const tb = [td0[0], tyB, -Math.sqrt(Math.max(0, 1 - tyB * tyB - td0[0] * td0[0]))];
  const back = !fwd && process.env.LEGSBACK === "1";
  console.log("legs back", side, { thigh: tb.map((v) => +v.toFixed(2)), shin: sb.map((v) => +v.toFixed(2)), footZ: +(tb[2] * th.len + sb[2] * sh.len).toFixed(2), was: +(td0[2] * th.len + sd0[2] * sh.len).toFixed(2) });
  // b59: the thigh straight down seen from the front too (THIGHX, 0: none of its authored lean out), so the feet stand
  // under the hips and the stance is narrower; standing, the hips draw in only LEGSLIDE 1.2 a side (was 2.5)
  // b57 (default): the leg nearly straight and near plumb, as a silverback stands on all fours (the user's photo): the
  // thigh a touch forward of the hip (THIGHFWD), the shin a touch back (SHINBACK), so the knee bends only a little and
  // the normal way; straight down from the front. The longer leg raises the hip; the torso is then tipped forward from
  // the hip (TRUNKPITCH, worked out here) until the knuckles meet the ground again.
  const straight = process.env.STRAIGHT !== "0";
  const ts = norm([td0[0] / -td0[1] * +(process.env.THIGHX || 0), -1, +(process.env.THIGHFWD || 0.1)]), ss = norm([0, -1, -(+(process.env.SHINBACK || 0.12))]);
  if (straight) { const rise = -(ts[1] * th.len + ss[1] * sh.len) + reach; LEGRISE = Math.max(LEGRISE, rise);
    console.log("straight leg", side, { thigh: ts.map((v) => +v.toFixed(2)), shin: ss.map((v) => +v.toFixed(2)), kneeFlex: Math.round((Math.atan2(ts[2], -ts[1]) - Math.atan2(ss[2], -ss[1])) * 180 / Math.PI), rise: +rise.toFixed(2) }); }
  KNUCKLE["leg" + side] = arc(th.dir, straight ? ts : fwd ? td : back ? tb : td0); KNUCKLE["shin" + side] = arc(sh.dir, straight ? ss : fwd ? sd : back ? sb : sd0);
}
// b62: on all fours the arms tighter in: each upper arm's lean out to the side cut to ARMX (0.1) of what was authored,
// so it comes straighter down from the shoulder, and the forearm's to FOREX (0.4); the forearm follows its elbow in
for (const side of ["R", "L"]) {
  const a = BONES["arm" + side], f = BONES["fore" + side], ax = +(process.env.ARMX ?? 0.1), fx = +(process.env.FOREX ?? 0.4);
  const ad = norm([a.dir[0] * ax, a.dir[1], a.dir[2]]), fd = norm([f.dir[0] * fx, f.dir[1], f.dir[2]]);
  KNUCKLE["arm" + side] = arc(a.dir, ad); KNUCKLE["fore" + side] = arc(f.dir, fd);
  console.log("arms in", side, a.dir.map((v) => +v.toFixed(2)), "->", ad.map((v) => +v.toFixed(2)), "fore", f.dir.map((v) => +v.toFixed(2)), "->", fd.map((v) => +v.toFixed(2)));
}
const TRUNKPITCH = process.env.TRUNKPITCH !== undefined ? +process.env.TRUNKPITCH : Math.atan2(LEGRISE, parts.armR.pivot[2] - P0[2]) * 180 / Math.PI;
console.log("trunk pitch", +TRUNKPITCH.toFixed(2), "deg for a hip rise of", +LEGRISE.toFixed(2));
const skel = Object.fromEntries(Object.entries(BONES).map(([id, B]) => [id, { parent: B.parent, joint: B.joint, rest: B.rest, knuckle: KNUCKLE[id] ? qmul(KNUCKLE[id], B.rest) : B.rest, stand: STAND[id] }]));
const feet = ["shinR", "shinL", "foreR", "foreL"].map((id) => [id, [0, -BONES[id].len - 1.5, 0]]);
const lum = (h) => { const n = parseInt(h.slice(1), 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };
const DARKLUM = 0.25, mix = (a, b, t) => "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
const ape = LETTERS.map((ch) => RAMP[ch]);
const code = LETTERS.map((ch) => ch === "o" ? "#020602" : ch === "i" ? "#c8ffc0" : ch === "h" ? "#ffffff" : lum(RAMP[ch]) < DARKLUM ? mix([3, 46, 10], [14, 118, 30], lum(RAMP[ch]) / DARKLUM) : mix([48, 190, 56], [200, 250, 186], Math.min(1, (lum(RAMP[ch]) - DARKLUM) / 0.45)));
const glow = LETTERS.map((ch) => ch === "o" ? 0 : ch === "i" || ch === "h" ? 1 : lum(RAMP[ch]) < DARKLUM ? 0.08 : 0.12 + 0.2 * Math.min(1, (lum(RAMP[ch]) - DARKLUM) / 0.45));
const DARK = LETTERS.map((ch, k) => (lum(RAMP[ch]) < DARKLUM && ch !== "o" ? k : -1)).filter((k) => k >= 0);
writeFileSync(process.env.OUT || HERE + "../../src/js/clanker-model.js", `// Generated by scripts/clanker/rig.mjs (see docs/clanker-port.md): change that and run it, never this file.
(() => {
  "use strict";
  const BL = window.BL, { makeVox, voxelGeometry, characterGeometry, merge } = BL.models, { createNode, addChild } = BL.scene, CELL = ${CELL};
  const OUT = ${JSON.stringify(out)}, SKEL = ${JSON.stringify(skel)}, FEET = ${JSON.stringify(feet)}, APE = ${JSON.stringify(ape)}, CODE = ${JSON.stringify(code)}, GLOW = ${JSON.stringify(glow)}, DARK = new Set(${JSON.stringify(DARK)});
  const mod = (n, m) => ((n % m) + m) % m, FEETAT = {}, BOXES = {}, FOOTAT = {}, FOOTSTAND = {};
  const qmul = ${qmul.toString()}, qinv = ${qinv.toString()}, qrot = ${qrot.toString()};
  const slerp = (a, b, t) => { let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; if (d < 0) { b = b.map((v) => -v); d = -d; } if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * t), l = Math.hypot(...q); return q.map((v) => v / l); } const th = Math.acos(d), s = Math.sin(th); return a.map((v, i) => (Math.sin((1 - t) * th) * v + Math.sin(t * th) * b[i]) / s); };

  // b89: the torso (chest and belly) as a smooth faceted shell, as the limbs are. In the part's own frame (y along its
  // bone), each row of blocks is traced round from outside: from TSIDES directions about the row's middle, a ray coming
  // in from far out stops at the first block it meets, which gives the row's outline (concave places bridged) and the
  // colour there. The outlines are eased round each ring and along the body, and the ends closed by a ring drawn in
  // and a point; each facet is the mean colour of its corners' blocks, stepped by the limbs' fur variation.
  const TSIDES = ${+(process.env.TSIDES || 36)};
  const hexRgb = (h) => [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16));
  // b107: the welded torso's back runs from the weld round to FRONTSN (the sine of the facet's angle toward the front);
  // past it the front is the pieces' own. backK eases the weld's colour changes out toward that line
  // (b109: standing, the pieces meet cleanly at the sides, so the weld's edge moves back as the pose rises, from FRONTSN on
  // all fours to STANDSN standing: a sleeve on the sides of the standing torso stood as a flat panel with a ledge)
  let FRONTSN = ${+(process.env.FRONTSN ?? 0.5)}; const facetSn = (j) => Math.sin(((j + 1) / TSIDES) * Math.PI * 2);
  const backK = (sn) => { const x = Math.max(0, Math.min(1, (FRONTSN - sn) / (FRONTSN + 0.2))); return x * x * (3 - 2 * x); };
  // b169: the glyph form's code rain, one kit for every part. Each surface draws every cell of its lanes: a lane runs
  // up a column of the part (picked at random, never two side by side), and along it a cell every RAINPER blocks, at
  // the lane's own phase, each cell's dash RAINW blocks wide and RAINL long wherever it lies, limb, torso, cap, fist,
  // foot or head. Its faces are tagged with the lane and cell; the rig lifts them out of the mesh into a layer of its
  // own (rainSplit), and r.rain(time) shows RAINFRAMES frames at RAINFPS, each lighting the cells a falling drop has
  // reached: a near-white head and a trail fading behind it, one or two drops a lane, each its own phase, trail and pace
  const RAIN_ON = ${process.env.RAIN !== "0"}, RDW = ${+(process.env.RAINW || 0.45)}, RDL = ${+(process.env.RAINL || process.env.RAINW || 0.45)}, RPER = ${+(process.env.RAINPER || 0.75)}, RN = ${+(process.env.RAINFRAMES || 60)}, RFPS = ${+(process.env.RAINFPS || 12)};
  const rmix = (a, b) => { let x = Math.imul(a + 0x9e37, 374761393) + Math.imul(b + 0x7f4a, 668265263) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const rstr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) % 1000003; };
  // the cells of a lane overlapping [y0, y1] (blocks along it): [cell, from, to]
  const rainCells = (key, y0, y1) => { const off = rmix(rstr(key), 2) * RPER, out = []; for (let k = Math.floor((y0 - off - RDL) / RPER) + 1; off + k * RPER < y1; k++) { const a = Math.max(y0, off + k * RPER), b = Math.min(y1, off + k * RPER + RDL); if (b - a > 0.02) out.push([k, a, b]); } return out; };
  const rainTag = (geo, n0, key, k) => { for (let f = n0; f < geo.faces.length; f++) { geo.faces[f].dash = true; geo.faces[f].rain = key; geo.faces[f].rainK = k; } };
  // the lanes picked round a part's columns: never two side by side
  const rainPick = (prefix, n, keep) => { const set = new Set(); for (let j = 0; j < n; j++) { if (set.has(j - 1) || (j === n - 1 && set.has(0))) continue; if (rmix(rstr(prefix + j), 1) < keep) set.add(j); } return set; };
  const RAINEXT = new Map(), rainSrcOf = new Map(), GLOWN = new Set();
  // a mesh split into its main faces and its rain cells (kept once per mesh; the cells' extents pooled per lane, so a
  // lane split over several meshes, the belly's and the chest's, falls as one)
  const rainSplit = (geo) => { if (!geo || !geo.faces) return null; if (rainSrcOf.has(geo)) return rainSrcOf.get(geo);
    let any = false; for (const f of geo.faces) if (f.rain !== undefined) { any = true; break; } if (!any) { rainSrcOf.set(geo, null); return null; }
    const main = Object.assign({}, geo, { faces: geo.faces.filter((f) => f.rain === undefined) }), lanes = new Map(), V = geo.verts;
    for (const f of geo.faces) { if (f.rain === undefined) continue; let L = lanes.get(f.rain); if (!L) lanes.set(f.rain, L = new Map());
      let c = L.get(f.rainK); if (!c) L.set(f.rainK, c = []); c.push(f.i.map((i) => [V[3 * i], V[3 * i + 1], V[3 * i + 2]]));
      const e = RAINEXT.get(f.rain); if (!e) RAINEXT.set(f.rain, [f.rainK, f.rainK]); else { e[0] = Math.min(e[0], f.rainK); e[1] = Math.max(e[1], f.rainK); } }
    const src = { main, lanes, frames: new Array(RN).fill(null) }; rainSrcOf.set(geo, src); rainSrcOf.set(main, src); return src; };
  // the cells lit at frame f in a lane: (cell, age, trail) for each
  const rainLit = (key, f, out) => { const e = RAINEXT.get(key); if (!e) return; const h = rstr(key), nd = rmix(h, 3) < 0.35 ? 3 : 2;
    for (let d = 0; d < nd; d++) { const T = 7 + Math.floor(rmix(h, 7 + d) * 10), span = e[1] - e[0] + 1 + T, s = span * 2 <= RN && rmix(h, 4 + d) < 0.35 ? 2 : 1;
      const ph = Math.floor(rmix(h, 5) * RN + d * (RN / nd + rmix(h, 9 + d) * RN / (3 * nd))), step = Math.floor((((f + ph) % RN) + RN) % RN / s), head = e[1] + 1 - step;
      for (let a = 0; a < T; a++) { const k = head + a; if (k >= e[0] && k <= e[1]) out(k, a, T); } } };
  const rainHex = (A, B, t) => "#" + [1, 3, 5].map((n) => Math.round(parseInt(A.slice(n, n + 2), 16) * (1 - t) + parseInt(B.slice(n, n + 2), 16) * t).toString(16).padStart(2, "0")).join("");
  const rainFrame = (src, f) => { if (src.frames[f]) return src.frames[f]; const g = BL.models.geometry();
    for (const [key, L] of src.lanes) rainLit(key, f, (k, a, T) => { const c = L.get(k); if (!c) return;
      const t = T > 2 ? (a - 1) / (T - 2) : 0, col = a === 0 ? "${process.env.RAINHEAD || "#e4ffe0"}" : rainHex("${process.env.RAINBODY || "#7dff66"}", "${process.env.RAINTAIL || "#3fb83a"}", Math.max(0, t)), e = a === 0 ? 1 : 1 - 0.3 * Math.max(0, t);
      for (const pts of c) BL.heroBody.poly(g, pts, col, null, e); });
    g.characterPart = true; return src.frames[f] = g; };
  const torsoShell = (P, form, pal, o, id, bellyTop = ${+(process.env.BELLYTOP || 0.7)}, join = null) => {
    const has = new Map(); let y0 = 1e9, y1 = -1e9;
    for (const [x, y, z, k] of P.cells) { has.set(x + "," + y + "," + z, k); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
      for (const [x, yy, z] of P.cells) if (yy === y) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); z0 = Math.min(z0, z); z1 = Math.max(z1, z + 1); n++; }
      if (!n) continue;
      rows.push({ y, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, R: Math.hypot(x1 - x0, z1 - z0) / 2 + 1 });
    }
    // the rows' middles eased along the body, so the rays come from a smooth line
    for (let pass = 0; pass < 4; pass++) for (let i = 1; i < rows.length - 1; i++) { rows[i].cx = (rows[i - 1].cx + 2 * rows[i].cx + rows[i + 1].cx) / 4; rows[i].cz = (rows[i - 1].cz + 2 * rows[i].cz + rows[i + 1].cz) / 4; }
    for (const r of rows) { r.rad = new Float32Array(TSIDES); r.col = []; r.glow = new Float32Array(TSIDES);
      for (let a = 0; a < TSIDES; a++) { const th = ((a + 0.5) / TSIDES) * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th); let hit = null, d = r.R;
        for (; d > 0; d -= 0.125) { const x = Math.floor(r.cx + dx * d), z = Math.floor(r.cz + dz * d), k = has.get(x + "," + r.y + "," + z); if (k !== undefined) { hit = k; break; } }
        if (hit === null) { r.rad[a] = 0.3; r.col.push(pal.palette[2]); continue; }
        r.rad[a] = d + 0.25; r.col.push(pal.palette[hit]); r.glow[a] = pal.emissive ? pal.emissive[hit] : 0; } }
    // b118: left and right mirrored: the colours the rays found (the blocks are a little lighter on the left) averaged
    // with the mirror column's, so the back's silver sits centred and even (column a's mirror is 17 - a, as the rings are
    // turned half a facet); MIRRORTORSO=0 leaves them as found
    // (b166: the colours are no longer mirrored (MIRRORCOL=1 brings b118 back): each side keeps its own pattern, and only
    // its overall shade is evened, the two sides' columns of a row scaled to the same mean brightness and glow, so the
    // silver back still sits centred while the small details differ side to side)
    if (${process.env.MIRRORCOL !== "1" && process.env.MIRRORTORSO !== "0"}) { const c = (TSIDES / 2 - 1) / 2, lumOf = (v) => v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11;
      const sideOf = (a) => { const d = (((a - c) % TSIDES) + TSIDES) % TSIDES; return d > 0 && d < TSIDES / 2 ? 0 : d > TSIDES / 2 ? 1 : -1; };
      for (const r of rows) { const L = [0, 0], G = [0, 0], N = [0, 0];
        for (let a = 0; a < TSIDES; a++) { const s = sideOf(a); if (s < 0) continue; L[s] += lumOf(hexRgb(r.col[a])); G[s] += r.glow[a]; N[s]++; }
        if (!N[0] || !N[1] || !L[0] || !L[1]) continue; const Lm = (L[0] / N[0] + L[1] / N[1]) / 2, Gm = (G[0] / N[0] + G[1] / N[1]) / 2;
        for (let a = 0; a < TSIDES; a++) { const s = sideOf(a); if (s < 0) continue; const k = Lm / (L[s] / N[s]), x = hexRgb(r.col[a]);
          r.col[a] = "#" + x.map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0")).join("");
          if (G[s]) r.glow[a] *= Gm / (G[s] / N[s]); } } }
    if (${process.env.MIRRORCOL === "1" && process.env.MIRRORTORSO !== "0"}) for (const r of rows) { const c0 = r.col.slice(), g0 = Float32Array.from(r.glow);
      for (let a = 0; a < TSIDES; a++) { const m = (TSIDES / 2 - 1 - a + TSIDES) % TSIDES, x = hexRgb(c0[a]), y = hexRgb(c0[m]);
        r.col[a] = "#" + [0, 1, 2].map((n) => Math.round((x[n] + y[n]) / 2).toString(16).padStart(2, "0")).join(""); r.glow[a] = (g0[a] + g0[m]) / 2; } }
    // b122: the upper stomach's front evened out: the blocks there are lighter toward each side (shade 64-75 against 35-40
    // down the middle, claude/bellyfront.mjs), two light patches under the pecs. Over the belly's top UPPERSPAN of its
    // rows, every front column (sine > -0.1) lighter than its row's middle (the mean of the columns facing straight
    // forward, sine > 0.8) by more than UPPERSLACK is scaled down to it, eased in up the belly and round from the sides
    if (id === "abdomen" && ${process.env.UPPEREVEN !== "0"}) { const n = rows.length, lumOf = (v) => v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11, SPAN = ${+(process.env.UPPERSPAN || 0.5)}, SLACK = ${+(process.env.UPPERSLACK || 1.12)};
      for (let k = 0; k < n; k++) { const u = k / Math.max(1, n - 1), wu = Math.max(0, Math.min(1, (u - (1 - SPAN)) / (SPAN * 0.35))); if (!wu) continue;
        let ref = 0, rn = 0; for (let a = 0; a < TSIDES; a++) if (Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2) > 0.8) { ref += lumOf(hexRgb(rows[k].col[a])); rn++; } if (!rn) continue; ref /= rn;
        for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2), wa = Math.max(0, Math.min(1, (sn + 0.1) / 0.3)); if (!wa) continue;
          const v = hexRgb(rows[k].col[a]), l = lumOf(v); if (l <= ref * SLACK) continue; const kk = 1 + (ref * SLACK / l - 1) * wu * wa;
          rows[k].col[a] = "#" + v.map((x) => Math.round(x * kk).toString(16).padStart(2, "0")).join(""); rows[k].glow[a] *= kk; } } }
    // eased round each ring, then along the body (the radii only; colours stay where the blocks put them)
    for (const r of rows) for (let pass = 0; pass < ${+(process.env.TROUND || 2)}; pass++) { const p0 = Float32Array.from(r.rad); for (let a = 0; a < TSIDES; a++) r.rad[a] = (p0[(a + TSIDES - 1) % TSIDES] + 2 * p0[a] + p0[(a + 1) % TSIDES]) / 4; }
    for (let pass = 0; pass < ${+(process.env.TALONG || 3)}; pass++) { const p0 = rows.map((r) => Float32Array.from(r.rad)); for (let i = 1; i < rows.length - 1; i++) for (let a = 0; a < TSIDES; a++) rows[i].rad[a] = (p0[i - 1][a] + 2 * p0[i][a] + p0[i + 1][a]) / 4; }
    // b90: a fatter stomach: the belly's front (local +z, the belly's side in every pose) swollen by up to BELLY of its
    // radius, most at its middle and fading to its ends, the sides a little with it; the chest's lowest rows follow so
    // the two meet
    { const BELLY = ${+(process.env.BELLY || 0.32)}, n = rows.length;
      for (let i = 0; i < n; i++) { const u = i / Math.max(1, n - 1);
        // (b93: unbroken across the waist: the belly's swell rises from its rump and holds at WAISTFAT to its top, and the
        // chest's lowest rows start at that same WAISTFAT and ease out over CHESTFAT of the chest, so on all fours the
        // chest's underside comes out with the belly instead of meeting it in a notch)
        const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, WF = ${+(process.env.WAISTFAT || 0.85)};
        // (reverted to the b90 shape by default, WAISTJOIN=1 keeps b93's: its chest swell put a dark shelf under the pecs)
        // (b117: join.peak, on all fours: the swell's fullest point moved from halfway along the belly toward its top, by
        // the chest, the rump end rising more slowly, so it hangs forward under the chest rather than back by the legs)
        const pk = id === "abdomen" && join && join.peak ? join.peak : 0.5, ua = u < pk ? 0.5 * u / pk : 0.5 + 0.5 * (u - pk) / (1 - pk);
        const along = ${process.env.WAISTJOIN === "1"} ? (id === "abdomen" ? sm(u / 0.5) * (1 - (1 - WF) * sm((u - 0.5) / 0.5)) : id === "chest" ? WF * (1 - sm(u / ${+(process.env.CHESTFAT || 0.45)})) : 0)
          : id === "abdomen" ? sm(ua / 0.5) * (1 - (1 - bellyTop) * sm((ua - 0.5) / 0.5)) : id === "chest" ? Math.max(0, 1 - u / 0.3) * 0.55 : 0;
        // (b97: the belly's swell held at BELLYTOP to its top, so on all fours it hangs right up under the chest instead of
        // going in there; the chest itself is left as it was)
        // (b94: and the chest's front deepened on its own, CHESTDEEP of its radius, held over its lower half and easing out
        // by CHESTSPAN of it, so on all fours its underside carries on from the belly's instead of stepping up)
        const deep = id === "chest" ? ${+(process.env.CHESTDEEP || 0)} * (1 - sm((u - 0.15) / ${+(process.env.CHESTSPAN || 0.6)})) : 0;
        // (b114: join.sag, on all fours: the belly's front let down further toward its top, where it meets the chest, so it
        // hangs into the hollow under the pecs instead of leaving a cavity there)
        // (b115: a bump, rising from SAGFROM over SAGRISE and gone again from SAGTOP over SAGFALL, so its fullest is below the
        // pecs and the belly's top goes into the chest at its own size, never over the pecs; and grown as a circle moved
        // forward is, all of the bump at the front, half at the sides and none at the back, so it stays round)
        const sag = id === "abdomen" && join && join.sag ? join.sag * sm((u - ${+(process.env.SAGFROM || 0.3)}) / ${+(process.env.SAGRISE || 0.35)}) * (1 - sm((u - ${+(process.env.SAGTOP || 0.66)}) / ${+(process.env.SAGFALL || 0.18)})) : 0;
        if (sag) { let m = 0; for (let a = 0; a < TSIDES; a++) m += rows[i].rad[a]; m /= TSIDES;
          for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); rows[i].rad[a] += m * sag * (1 + sn) / 2; } }
        // (b117: join.tuck, on all fours: the belly's underside drawn up at its rump end, by up to tuck of its radius at the
        // very end and none from TUCKSPAN of the way along, so it rises toward the legs instead of drooping there)
        const tk2 = id === "abdomen" && join && join.tuck ? join.tuck * (1 - sm(u / ${+(process.env.TUCKSPAN4 || 0.6)})) : 0;
        if (tk2) for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); if (sn > 0) rows[i].rad[a] *= 1 - tk2 * sn; }
        if (!along && !deep) continue;
        for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); if (sn > 0) rows[i].rad[a] *= 1 + (BELLY * (1 + (id === "abdomen" && join && join.full || 0)) * along + deep) * Math.pow(sn, 1.3); } } }
    // b117: join.shift, on all fours: the belly's underside profile slid forward along the belly, so it is fullest near
    // the chest and tapers toward the hips instead of hanging lowest by the thighs. Each front column's radii are
    // resampled along the rows so the row where its own radius peaks lands at join.shift of the way to the top; the same
    // rounded profile, moved, eased in toward the front (none at the sides and back)
    if (id === "abdomen" && join && join.shift) { const n = rows.length, src = rows.map((r) => Float32Array.from(r.rad));
      for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); if (sn <= 0) continue;
        let k0 = 0; for (let i = 0; i < n; i++) if (src[i][a] > src[k0][a]) k0 = i; const um = k0 / Math.max(1, n - 1), pk = um + (join.shift - um) * (join.shiftK ?? 1); if (pk <= um) continue;
        const w = Math.pow(sn, 0.8);
        for (let i = 0; i < n; i++) { const u = i / Math.max(1, n - 1), us = u < pk ? um * u / pk : um + (1 - um) * (u - pk) / (1 - pk), x = us * (n - 1), i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), f = x - i0;
          const v = src[i0][a] * (1 - f) + src[i1][a] * f; rows[i].rad[a] = src[i][a] + (v - src[i][a]) * w; } } }
    // (b106: trimmed for the weld before the ends' colour and shape fixes, so those land on the new open end)
    const cut = join && join.cut !== undefined;
    // (b109, join.cutW: no rows trimmed; each column stops at its own height instead, join.cut on the back easing out to
    // the shell's own end toward the front by join.cutW(sine of the column's angle), so the weld has no edge)
    const cutH = cut && join.cutHs ? join.cutHs : cut && join.cutW ? Array.from({ length: TSIDES }, (_, a) => { const w = join.cutW(Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2)), end = id === "abdomen" ? rows[rows.length - 1].y + 0.5 : rows[0].y + 0.5; return join.cut + (end - join.cut) * w; }) : null;
    if (cut && !cutH) { const keep = rows.filter((r) => id === "abdomen" ? r.y + 0.5 <= join.cut : r.y + 0.5 >= join.cut); rows.length = 0; rows.push(...keep); }
    // (b146: the chest's top BACKTOP rows dropped, so the back stops lower and doesn't run so far up the back of the neck;
    // the neck's taper, curve and dark rows below then work on the new top)
    if (id === "chest" && ${+(process.env.BACKTOP ?? 3)} > 0) rows.length = Math.max(2, rows.length - ${+(process.env.BACKTOP ?? 3)});
    // (b152: the belly's lowest TAILTRIM rows, the end of the back past the glutes, chopped off; its end closes in a dome
    // only TAILDOME deep, inside the glutes)
    if (id === "abdomen" && ${+(process.env.TAILTRIM ?? 1)} > 0) rows.splice(0, Math.min(${+(process.env.TAILTRIM ?? 1)}, rows.length - 2));
    // b103: the neck thinner going into the head: the chest's top NECKROWS rows drawn in, to NECK of their size at the
    // very top, eased
    // b104: the belly's back held full up to its top (each back radius at least the row below's, over its top BACKHOLD
    // rows), so it doesn't round in where the chest ends over it: the two round-offs together made a groove at the waist
    // b110: the tailbone tucked in. The belly's bottom ran to a point on its back that stood out over the glutes (a silver
    // V between them, most of all as it stands up); its lowest TAILROWS rows are drawn in on the back, by up to TAILIN of
    // their size at the very bottom, eased up the rows and round to the sides
    if (id === "abdomen") { const N = Math.min(${+(process.env.TAILROWS || 12)}, rows.length - 2);
      for (let k = 0; k <= N; k++) { const w = Math.pow(1 - k / (N + 1), 1.4);
        for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); if (sn < 0) rows[k].rad[a] *= 1 - ${+(process.env.TAILIN || 0)} * w * Math.pow(-sn, 0.8); } } }
    if (id === "abdomen") { const L = rows.length - 1;
      for (let k = Math.max(1, L - ${+(process.env.BACKHOLD || 8)}); k <= L; k++) for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2);
        if (sn < 0) { const w = Math.min(1, -sn * 1.6); rows[k].rad[a] = Math.max(rows[k].rad[a], rows[k].rad[a] + (rows[k - 1].rad[a] - rows[k].rad[a]) * w); } }
      // and its top rows' colours faded into the row FADEROWS below (its top edge was dark blocks, a dark line showing past
      // the chest's edge on all fours)
      // (on the back half, the silver carried up: each angle's colour taken from the lightest of the rows below the
      // faded ones, SILVERFROM rows down, so the saddle runs on to the top instead of ending in a dark band under the chest)
      { const N = Math.min(${+(process.env.FADEROWS || 10)}, Math.max(0, L - 2)), F = ${+(process.env.SILVERFROM || 18)}, lumOf = (h) => { const v = hexRgb(h); return v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11; };
        const refCol = (a) => { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); let best = rows[Math.max(0, L - N - 1)].col[a];
          if (sn < 0.2) for (let k = N + 1; k <= Math.min(F, L); k++) if (lumOf(rows[L - k].col[a]) > lumOf(best)) best = rows[L - k].col[a]; return best; };
        // (b106, the weld: every row blended toward the chest's edge colours, fully at the open end, so the belly runs on
        // in the chest's colours instead of a darker band behind the weld)
        const tw = join && join.toward, NN = tw ? L : N;
        const ref = tw ? { col: join.toward.cols, glow: join.toward.glows } : { col: Array.from({ length: TSIDES }, (_, a) => refCol(a)), glow: rows[Math.max(0, L - N - 1)].glow };
        for (let k = 0; k <= NN; k++) { const r = rows[L - k], w = tw ? Math.pow(1 - k / (NN + 1), ${+(process.env.WELDFADE || 1.2)}) : Math.pow(1 - k / (N + 1), 0.5);
          for (let a = 0; a < TSIDES; a++) { const wa = tw ? (cutH ? Math.pow(Math.max(0, Math.min(1, 1 - (cutH[a] - r.y - 0.5) / (NN + 1))), ${+(process.env.WELDFADE || 1.2)}) : w) * backK(Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2)) : w, c0 = hexRgb(r.col[a]), c1 = hexRgb(ref.col[a]); r.col[a] = "#" + [0, 1, 2].map((n) => Math.round(c0[n] + (c1[n] - c0[n]) * wa).toString(16).padStart(2, "0")).join(""); r.glow[a] += (ref.glow[a] - r.glow[a]) * wa; } } } }
    // b104: the chest's lower back had a row or two of darker blocks across it a little above its end (a dark band
    // across the back at the waist). On the back half of its lowest LOWROWS rows each colour is replaced by the median
    // (by brightness) of the five rows round it at that angle, so a stray dark row is absorbed
    if (id === "chest" && ${process.env.LOWMEDIAN !== "0"}) { const N = Math.min(${+(process.env.LOWROWS || 16)}, rows.length - 3), lumOf = (h) => { const v = hexRgb(h); return v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11; };
      const src = rows.map((r) => r.col.slice());
      for (let k = 0; k <= N; k++) for (let a = 0; a < TSIDES; a++) { if (Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2) > 0.2) continue;
        const win = []; for (let d = -2; d <= 2; d++) win.push(src[Math.max(0, Math.min(rows.length - 1, k + d))][a]);
        win.sort((p, q) => lumOf(p) - lumOf(q)); rows[k].col[a] = win[2]; } }
    // (the rows handed out for the chest's edge and the join are taken here, after the belly's own top is filled and faded)
    if (join === "rows") return rows;
    // b126: the neck dark: the chest's top NECKDARKROWS rows, on the back (and sides), shaded to the dark fur (palette 2)
    // toward the top, so the back of the neck runs dark into the head's dark base instead of silver
    if (id === "chest" && +${+(process.env.NECKDARK ?? 2)} >= 0) { const NS = Math.min(${+(process.env.NECKSIDEROWS || 8)}, rows.length - 1), N = Math.min(${+(process.env.NECKDARKROWS || 4)}, rows.length - 1), L = rows.length - 1, dk = hexRgb(pal.palette[${+(process.env.NECKDARK ?? 2)}]);
      for (let k = 0; k <= Math.max(N, NS - 1); k++) { const w = k <= N ? Math.pow(1 - k / (N + 1), 0.8) : 0;
        // (b152: the sides of the neck in front too (columns facing well out to the side, NECKSIDE), where the chest's top
        // corners showed as lighter patches either side of the head; the middle under the chin keeps its colour)
        for (let a = 0; a < TSIDES; a++) { const th = ((a + 0.5) / TSIDES) * Math.PI * 2, sn = Math.sin(th), side = ${+(process.env.NECKSIDE ?? 1)} * Math.max(0, Math.min(1, (Math.abs(Math.cos(th)) - 0.35) / 0.35)), wa = Math.max(w * Math.max(0, Math.min(1, (0.3 - sn) / 0.5)), (k < NS ? Math.pow(1 - k / NS, 0.8) : 0) * side); if (!wa) continue;
          const v = hexRgb(rows[L - k].col[a]); rows[L - k].col[a] = "#" + [0, 1, 2].map((n) => Math.round(v[n] + (dk[n] - v[n]) * wa).toString(16).padStart(2, "0")).join(""); rows[L - k].glow[a] *= 1 - 0.7 * wa; } } }
    if (id === "chest") { const N = Math.min(${+(process.env.NECKROWS || 7)}, rows.length - 1), L = rows.length - 1;
      for (let k = 0; k <= N; k++) { const w = Math.pow(1 - k / (N + 1), 1.3), f = 1 - (1 - ${+(process.env.NECK || 0.7)}) * w; for (let a = 0; a < TSIDES; a++) rows[L - k].rad[a] *= f; } }
    // b127 (after the neck taper, which drew each ring in toward its own middle as the middles drift back, so the back edge
    // crept out again at the very top): the very top of the back no longer bends back out: over the chest's top NECKCURVE rows, on the back half, each
    // ring's back radius is held to no more than the one below it, so going up the back only ever curves in to the neck
    if (id === "chest" && ${process.env.NECKCURVE !== "0"}) { const L = rows.length - 1, N = Math.min(${+(process.env.NECKCURVE || 6)}, L);
      for (let k = L - N + 1; k <= L; k++) for (let a = 0; a < TSIDES; a++) { if (Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2) > 0.2) continue;
        const prev = rows[k - 1], cur = rows[k], th = ((a + 0.5) / TSIDES) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        // compared as points in the part's frame (the rows' middles shift), the back's reach along z
        // (only columns facing well back, eased in from the sides, and never drawn in by more than NECKPULL of the radius:
        // dividing by a side column's small sine collapsed it, notching both sides so the middle stood up as a point)
        const wsn = Math.max(0, Math.min(1, (-sn - 0.35) / 0.4)), wk = wsn * wsn * (3 - 2 * wsn); if (!wk) continue;
        const need = prev.rad[a] + (prev.cz - cur.cz) / sn; if (need >= cur.rad[a]) continue;
        cur.rad[a] += (Math.max(need, cur.rad[a] * (1 - ${+(process.env.NECKPULL || 0.3)})) - cur.rad[a]) * wk; } }
    // b100: the belly's shell runs on up the back under the chest's, so the chest's bottom edge stood on it as a dark lip.
    // The chest's lowest TUCKROWS rows are drawn in (down to TUCK of their size at the very edge, eased), so its surface
    // sinks into the belly's and the two read as one back
    if (id === "chest") { const N = Math.min(${+(process.env.TUCKROWS || 5)}, rows.length - 1);
      for (let k = 0; k <= N; k++) { const w = Math.pow(1 - k / (N + 1), 1.6), f = 1 - (1 - ${+(process.env.TUCK || 1)}) * w; for (let a = 0; a < TSIDES; a++) rows[k].rad[a] *= f; }
      // b100: measured, the chest's back curved in over its bottom rows (8-12 blocks back where the belly's stood out at
      // 16), so the belly's top showed as a rim with a dark crease above it. Its back half is held full down to its
      // bottom: each row's back radius at least the row above's (BACKHOLD rows), so the back runs on into the belly's
      for (let k = Math.min(${+(process.env.BACKHOLD || 8)}, rows.length - 2); k >= 0; k--) for (let a = 0; a < TSIDES; a++) { const sn = Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2);
        if (sn < 0) { const w = Math.min(1, -sn * 1.6); rows[k].rad[a] = Math.max(rows[k].rad[a], rows[k].rad[a] + (rows[k + 1].rad[a] - rows[k].rad[a]) * w); } }
      // and their colours faded into the row just above them (the bottom rows' blocks were dark: a dark ring under the
      // chest's silver back, standing), so the colour runs on down into the belly's
      // (b102: toward the belly's own top colours, angle by angle, when given (join.belly): the edge then reads as the belly)
      const ref = join && join.belly ? join.belly : rows[Math.min(rows.length - 1, N + 1)];
      for (let k = 0; k <= N; k++) { const w = Math.pow(1 - k / (N + 1), 0.7);
        for (let a = 0; a < TSIDES; a++) { const c0 = hexRgb(rows[k].col[a]), c1 = hexRgb(ref.col[a]); rows[k].col[a] = "#" + [0, 1, 2].map((n) => Math.round(c0[n] + (c1[n] - c0[n]) * w).toString(16).padStart(2, "0")).join(""); rows[k].glow[a] += (ref.glow[a] - rows[k].glow[a]) * w; } } }
    // b100: the waist join. The chest's bottom row and the belly's top row are eased over JOINROWS rows each toward one
    // shared ring (join.rad, join.col: the two ends' mean, angle by angle, which matches across the two parts: x is
    // left-right in both and the angle runs round the bone the same way), so the two shells meet the same size and the
    // same colour and run into each other instead of meeting as two lumps with a dark band between
    if (join && join.rad) { const N = Math.min(${+(process.env.JOINROWS || 4)}, rows.length - 1), fromTop = id === "abdomen";
      for (let k = 0; k <= N; k++) { const r = rows[fromTop ? rows.length - 1 - k : k], w = Math.pow(1 - k / (N + 1), 1.5);
        for (let a = 0; a < TSIDES; a++) { r.rad[a] += (join.rad[a] - r.rad[a]) * w;
          const c0 = hexRgb(r.col[a]), c1 = join.col[a]; r.col[a] = "#" + [0, 1, 2].map((n) => Math.round(c0[n] + (c1[n] - c0[n]) * w).toString(16).padStart(2, "0")).join(""); r.glow[a] += (join.glow[a] - r.glow[a]) * w; } } }
    // b106: for the merged torso (join.cut): only the rows on this side of the waist gap are drawn, the end toward the
    // waist left open, and its last ring handed back (join.edge: points, colours, glows) for the weld
    // b111: the silverback a saddle, not a wrap: its light greys shaded to the dark fur toward the sides, the silver kept
    // only where the facet faces the back past SADDLE (in sine), wide at the shoulders (SADDLETOP) and narrowing down the
    // belly to the rump (SADDLEBOT), eased over SADDLEEASE
    { const n = rows.length, dark = hexRgb(pal.palette[${+(process.env.SADDLEDARK || 3)}]), lumOf = (v) => (v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11) / 255;
      for (let k = 0; k < n; k++) { const u = k / Math.max(1, n - 1), g = id === "abdomen" ? 0.5 * u : id === "chest" ? 0.5 + 0.5 * u : -1; if (g < 0) break;
        const t = ${+(process.env.SADDLEBOT || 1)} + (${+(process.env.SADDLETOP || 0.65)} - ${+(process.env.SADDLEBOT || 1)}) * g;
        for (let a = 0; a < TSIDES; a++) { const b = -Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2); if (b < -0.2) continue;
          const v = hexRgb(rows[k].col[a]), lw = Math.max(0, Math.min(1, (lumOf(v) - 0.22) / 0.2)); if (!lw) continue;
          const x = Math.max(0, Math.min(1, (b - t) / ${+(process.env.SADDLEEASE || 0.3)} + 0.5)), keep = x * x * (3 - 2 * x), w = (1 - keep) * lw;
          rows[k].col[a] = "#" + [0, 1, 2].map((m) => Math.round(v[m] + (dark[m] - v[m]) * w).toString(16).padStart(2, "0")).join(""); rows[k].glow[a] *= 1 - w * 0.7; } } }
    // (b110: join.probe hands back the finished rows, for the weld to find where the belly goes into the chest)
    if (join && join.probe) return rows;
    const geo = BL.models.geometry(), C = CELL;
    const pt = (r, a, y, k = 1) => { const th = ((a + 0.5) / TSIDES) * Math.PI * 2; return [(r.cx + Math.cos(th) * r.rad[a % TSIDES] * k + o[0]) * C, (y + o[1]) * C, (r.cz + Math.sin(th) * r.rad[a % TSIDES] * k + o[2]) * C]; };
    // (b107: mixed before use, so neighbouring rows and columns land apart: unmixed, the product hash came out in whole rows
    // and blocks, which put the stomach's spots in one glowing slab and laid a dark band across the bottom of the back)
    const hp = (a, b) => ((Math.imul(a + 7, 73856093) ^ Math.imul(b + 13, 19349663)) >>> 0) / 4294967296;
    // (the pecs keep the old hash: their pattern was made with it)
    const hh = ${process.env.OLDHASH === "1"} ? (a, b) => ((Math.imul(a + 7, 73856093) ^ Math.imul(b + 13, 19349663)) >>> 0) / 4294967296
      : (a, b) => { let h = Math.imul(a + 7, 0x9e3779b1) ^ Math.imul(b + 13, 0x85ebca77); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
    const fur = (i, j) => 1 + (hh(i, j) - 0.5) * 0.16 + ((hh(i >> 1, (j >> 1) + 40) - 0.5) + (hh(i >> 2, (j >> 2) + 60) - 0.5) * 0.6) * 0.14 - (hh(j + 13, i >> 2) < 0.22 ? 0.08 : 0);
    // b90: the chest's pale front lighter (CHESTLIGHT) and patterned: mottled in patches of two sizes, flecked with
    // lighter hairs and short darker strokes running down it, and a darker line down its middle, one facet wide (the rings are turned half a facet so one is centred on it)
    const chestPattern = (i, j, lum, out) => { if (id !== "chest" || lum < 0.2 || !(out[2] > 0.2)) return 1;
      // (b130: mirrored, as the back is: the pattern hashed by the lesser of the facet's column and its mirror's, so both
      // pecs carry the same patches and hairs)
      if (${process.env.MIRRORCOL === "1" && process.env.MIRRORTORSO !== "0"}) j = Math.min(j, (TSIDES / 2 - 2 - j + TSIDES) % TSIDES);
      const w = Math.min(1, (lum - 0.2) / 0.12) * Math.min(1, (out[2] - 0.2) / 0.25), mid = Math.abs(out[0]) < 0.05 ? 1 : 0;
      const patch = (hp(i >> 1, (j >> 1) + 300) - 0.5) * ${+(process.env.CHESTPATCH || 0.55)} + (hp(i >> 2, (j >> 2) + 330) - 0.5) * ${+(process.env.CHESTPATCH || 0.55)} * 0.8, speck = (hp(i + 310, j + 17) - 0.5) * 0.3;
      const hair = hp(i + 320, j + 3) < 0.16 ? 0.34 : hp(j + 340, i >> 1) < 0.18 ? -0.3 : 0;
      return 1 + w * (${+(process.env.CHESTLIGHT || 0.1)} + patch + speck + hair - 0.32 * mid); };
    // b105: the silver back patterned as the chest is: where the back (out z < -0.2) is light, mottled in patches of two
    // sizes, speckled, with lighter hairs and short darker strokes (BACKPATCH)
    const backPattern = (i, j, lum, out) => { if (lum < 0.3 || !(out[2] < -0.2)) return 1;
      const w = Math.min(1, (lum - 0.3) / 0.12) * Math.min(1, (-out[2] - 0.2) / 0.25), P = ${+(process.env.BACKPATCH || 0.32)};
      const patch = (hh(i >> 1, (j >> 1) + 800) - 0.5) * P + (hh(i >> 2, (j >> 2) + 830) - 0.5) * P * 0.35, speck = (hh(i + 810, j + 17) - 0.5) * 0.34;
      const hair = hh(i + 820, j + 3) < 0.18 ? 0.26 : hh(j + 840, i) < 0.2 ? -0.24 : 0;
      // (b170: a facet of the silver no darker than BACKMIN of its own grey: a dark hair landing on a dark patch made a
      // lone dark spot in the brightest of the silver; the hairs and patches still mottle it)
      return Math.max(${+(process.env.BACKMIN || 0.85)}, 1 + w * (${+(process.env.BACKLIFT || 0.15)} + patch + speck + hair)); };
    // (b118: on the back each facet's pattern is hashed by the lesser of its column and its mirror's, 16 - j, so the fur,
    // patches and spots there are mirror images either side of the spine; the pecs keep theirs)
    const tRain = new Map();
    const mkey = (j, out) => ${process.env.MIRRORCOL === "1" && process.env.MIRRORTORSO !== "0"} ? Math.min(j, (TSIDES / 2 - 2 - j + TSIDES) % TSIDES) : j;
    const facet0 = (q, cols, glows, out, i, j0) => { const j = mkey(j0, out), c = [0, 0, 0]; for (const h of cols) { const v = hexRgb(h); c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / cols.length / 255;
      // (b170: the silver's mottle no lower than LONEBACK of the four facets round it: a facet in a dark patch with a dark
      // hair, among bright ones, read as a hole in the silver; clumps, whose neighbours are dark too, are kept)
      let bp = backPattern(i, j, lum, out); if (bp !== 1 && ${process.env.LONEDARK !== "0"}) { const nb = (backPattern(i - 1, j, lum, out) + backPattern(i + 1, j, lum, out) + backPattern(i, (j + 1) % TSIDES, lum, out) + backPattern(i, (j + TSIDES - 1) % TSIDES, lum, out)) / 4; bp = Math.max(bp, ${+(process.env.LONEBACK || 0.85)} * nb); }
      let f = fur(i, j) * chestPattern(i, j, lum, out) * bp, hex = "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v / cols.length * f))).toString(16).padStart(2, "0")).join("");
      // (b110: in the code form the torso's light greys, the silver back and the pecs, glowed near white: their glow cut to
      // CODEDIM and their colour to CODECOL, eased in over the lighter greys)
      const lw = form === "code" ? Math.max(0, Math.min(1, (lum - ${+(process.env.DIMFROM || 0.35)}) / 0.3)) : 0;
      let e = form === "code" ? Math.min(1, glows.reduce((a, b) => a + b, 0) / glows.length * ${LIMBGLOW} + 0.05) * (1 - (1 - ${+(process.env.CODEDIM || 0.45)}) * lw) : 0;
      if (lw) { const kc = 1 - (1 - ${+(process.env.CODECOL || 0.75)}) * lw; hex = "#" + [1, 3, 5].map((n) => Math.round(parseInt(hex.slice(n, n + 2), 16) * kc).toString(16).padStart(2, "0")).join(""); }
      // (b156: in the code form the dark line down the middle of the pecs takes the glyph fur's dark green (palette PECLINE)
      // at the fur's glow, instead of a darker grey of the pale chest)
      // (b156-b157: in the code form the dark line down the middle of the pecs is coloured as the stomach's glyph fur is: its
      // grey PECLINE (3, the stomach front's own) stepped up or down by the line's own pattern (patches, specks, hairs:
      // PECLINEVAR greys a unit of it) and by the fur's variation, its colour and glow eased between the palette's greys)
      // (b165: the glyph pec line was much darker against the pale glyph pec than the grey line is against the grey pec.
      // Now it is as much darker than its neighbours as in the grey form: the line's colour as the pec's own is worked out
      // (the pec's glyph colour, the line's -0.32 and its pattern), and the glyph palette's green of that same brightness
      // takes its place, at the pec's own glow, so it stays green without standing out more than the grey line does)
      let eLine = -1; if (form === "code" && id === "chest" && lum >= 0.2 && out[2] > 0.2 && Math.abs(out[0]) < 0.05 && ${process.env.PECLINEREL !== "0"}) {
        const lumHex = (h) => (parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11) / 255, L = lumHex(hex);
        let ga = 0; while (ga < 10 && lumHex(pal.palette[ga + 1]) < L) ga++;
        const gb = ga + 1, la = lumHex(pal.palette[ga]), lb = lumHex(pal.palette[gb]), gt = Math.max(0, Math.min(1, (L - la) / ((lb - la) || 1))), A = pal.palette[ga], B = pal.palette[gb];
        const hue = ${+(process.env.PECLINEHUE ?? 0.5)};
        hex = "#" + [1, 3, 5].map((n) => Math.max(0, Math.min(255, Math.round((parseInt(A.slice(n, n + 2), 16) * (1 - gt) + parseInt(B.slice(n, n + 2), 16) * gt) * hue + parseInt(hex.slice(n, n + 2), 16) * (1 - hue)))).toString(16).padStart(2, "0")).join(""); }
      else if (form === "code" && id === "chest" && lum >= 0.2 && out[2] > 0.2 && Math.abs(out[0]) < 0.05) {
        const gv = Math.max(0, Math.min(11, ${+(process.env.PECLINE ?? 3)} + (f / (1 + ${+(process.env.CHESTLIGHT || 0.1)} - 0.32) - 1) * ${+(process.env.PECLINEVAR ?? 4)})), ga = Math.floor(gv), gb = Math.min(11, ga + 1), gt = gv - ga, A = pal.palette[ga], B = pal.palette[gb], fu = fur(i, j);
        hex = "#" + [1, 3, 5].map((n) => Math.max(0, Math.min(255, Math.round((parseInt(A.slice(n, n + 2), 16) * (1 - gt) + parseInt(B.slice(n, n + 2), 16) * gt) * fu))).toString(16).padStart(2, "0")).join("");
        eLine = Math.min(1, ${LIMBGLOW} * (GLOW[ga] + (GLOW[gb] - GLOW[ga]) * gt) + 0.05); }
      // b104: spots as the limbs have them: about TORSOSPOTS of the body's facets (not the end caps), whole facets a shade
      // lighter or darker, picked by a sine hash scattered (not mirrored: on one piece mirroring put them in pairs either side of the spine), not on
      // the pale chest; in the code form they glow green
      // b108: in the code form the glyphs are small glowing dashes on the facet (CODEDASH of a facet across, CODEDASHV up,
      // set at random in it and a hair proud of it), about CODESPOTS of the facets carrying one and some two, so the torso
      // reads as the limbs do (a whole glowing facet was a block several times their dashes)
      if (eLine >= 0) e = eLine;
      if (i < 900 && form === "code") { const hs = (a, b) => hh(a + (id === "chest" ? 520 : 720), b + 41);
        BL.heroBody.poly(geo, q, hex, out, e);
        // (b167: the torso takes the limbs' code rain: lanes every TRAINSTEP columns, a dash a row (a block) tall with a
        // gap under it, in streams with a light head at the bottom and a dim tail, everywhere but the pale pecs and the
        // light silver back; RAIN=0 brings back b108's scattered dashes)
        if (${process.env.RAIN !== "0"}) { if (chestPattern(i, j, lum, out) !== 1 || backPattern(i, j, lum, out) !== 1) return;
          // (b169: the kit's lanes round the torso's 36 columns, shared by the belly and the chest, whose rows are in the
          // sheet's own blocks, so a lane runs on from one into the other; each dash RAINW blocks of the facet's width)
          if (!tRain.picked) tRain.picked = rainPick("torso:", TSIDES, ${+(process.env.TRAINKEEP || 0.6)});
          if (!tRain.picked.has(j0) || !rows[i + 1]) return; const key = "torso:" + j0, ya = rows[i].y + 0.5, yb = rows[i + 1].y + 0.5, ol = Math.hypot(out[0], out[1], out[2]) || 1, lift = CELL * 0.03;
          const w = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]) / CELL, U0 = Math.max(0.02, 0.5 - RDW / (2 * w)), U1 = 1 - U0;
          const at = (u, v) => [0, 1, 2].map((n) => q[0][n] + (q[1][n] - q[0][n]) * u + (q[3][n] - q[0][n]) * v + (q[2][n] - q[1][n] - q[3][n] + q[0][n]) * u * v + out[n] / ol * lift);
          for (const [k, a, b] of rainCells(key, Math.min(ya, yb), Math.max(ya, yb))) { const va = (a - ya) / (yb - ya), vb = (b - ya) / (yb - ya), n0 = geo.faces.length;
            BL.heroBody.poly(geo, [at(U0, va), at(U1, va), at(U1, vb), at(U0, vb)], "#5ef64a", out, 0.95); rainTag(geo, n0, key, k); }
          return; }
        if (chestPattern(i, j, lum, out) !== 1 || out[2] < ${+(process.env.DASHBACK ?? -0.1)}) return;
        const ol = Math.hypot(out[0], out[1], out[2]) || 1, lift = CELL * 0.03, at = (u, v) => [0, 1, 2].map((n) => q[0][n] + (q[1][n] - q[0][n]) * u + (q[3][n] - q[0][n]) * v + (q[2][n] - q[1][n] - q[3][n] + q[0][n]) * u * v + out[n] / ol * lift);
        const W = ${+(process.env.CODEDASH || 0.55)}, H = ${+(process.env.CODEDASHV || 0.3)}, rate = ${+(process.env.CODESPOTS || 0.3)};
        for (let d = 0; d < 2; d++) { if (hs(i + d * 97, j + d * 53) >= (d ? rate * 0.3 : rate)) continue;
          const w = W * (0.7 + 0.6 * hs(i + 3 + d, j + 11)), h = H * (0.7 + 0.6 * hs(i + 13, j + 5 + d)), u0 = (1 - w) * hs(i + 21 + d, j + 2), v0 = (1 - h) * hs(i + 2, j + 29 + d);
          const n0 = geo.faces.length; BL.heroBody.poly(geo, [at(u0, v0), at(u0 + w, v0), at(u0 + w, v0 + h), at(u0, v0 + h)], "#4be040", out, 0.9);
          for (let f = n0; f < geo.faces.length; f++) geo.faces[f].dash = true; }
        return; }
      if (i < 900) { const jm = j, hs = (a, b) => hh(a + (id === "chest" ? 500 : 700), b + 37);
        if (hs(i, jm) < (out[2] < -0.2 ? ${+(process.env.BACKSPOTS || 0.14)} : ${+(process.env.TORSOSPOTS || 0.07)}) && chestPattern(i, j, lum, out) === 1 && (${process.env.SILVERSPOTS === "1"} || backPattern(i, j, lum, out) === 1)) {
          const k = hs(i + 7, jm + 71) < 0.55 ? 1.45 : 0.62, sp = "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v / cols.length * f * k)))).map((v) => v.toString(16).padStart(2, "0")).join("");
          BL.heroBody.poly(geo, q, sp, out, e); return; } }
      BL.heroBody.poly(geo, q, hex, out, e); };
    // (b107: each face tagged with its facet column, so the welded torso can take its back from the weld and its front
    // from the pieces as they are shown apart)
    const facet = (q, cols, glows, out, i, j) => { const n0 = geo.faces.length; facet0(q, cols, glows, out, i, j); for (let f = n0; f < geo.faces.length; f++) geo.faces[f].ang = j; };
    // a point on column a at height h (blocks), between the rows round it
    const colPt = (a, h) => { let k = 0; while (k + 2 < rows.length && rows[k + 1].y + 0.5 < h) k++;
      const P = rows[k], Q = rows[Math.min(rows.length - 1, k + 1)], h0 = P.y + 0.5, h1 = Q.y + 0.5, f = h1 > h0 ? Math.max(0, Math.min(1, (h - h0) / (h1 - h0))) : 0;
      const p = pt(P, a, h0), q = pt(Q, a, h1); return [0, 1, 2].map((n) => p[n] + (q[n] - p[n]) * f); };
    // (b170, after every shading of the rows' colours: a lone dark facet in the light silver, a dark block under one column where those either side of it and
    // above and below it are light, a hole in the silver: it takes the mean of its row neighbours. LONEDARK 0.7: darker
    // than that share of them, and they at least LONELIGHT bright)
    if (${process.env.LONEDARK !== "0"}) { const lum = (h) => { const v = hexRgb(h); return (v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11) / 255; }, K = ${+(process.env.LONEDARK || 0.7)}, LL = ${+(process.env.LONELIGHT || 0.3)};
      for (let k = 0; k < rows.length; k++) { const r = rows[k], c0 = r.col.slice(); for (let a = 0; a < TSIDES; a++) { const l = c0[(a + TSIDES - 1) % TSIDES], rr = c0[(a + 1) % TSIDES], ml = (lum(l) + lum(rr)) / 2;
        if (Math.min(lum(l), lum(rr)) < LL || lum(c0[a]) >= K * ml) continue; const up = rows[k + 1], dn = rows[k - 1]; if ((up && lum(up.col[a]) < LL) || (dn && lum(dn.col[a]) < LL)) continue;
        const x = hexRgb(l), y = hexRgb(rr); r.col[a] = "#" + [0, 1, 2].map((n) => Math.round((x[n] + y[n]) / 2).toString(16).padStart(2, "0")).join(""); } } }
    for (let i = 0; i + 1 < rows.length; i++) { const A = rows[i], B = rows[i + 1], ya = A.y + 0.5, yb = B.y + 0.5;
      for (let a = 0; a < TSIDES; a++) { const n = (a + 1) % TSIDES, th = ((a + 1) / TSIDES) * Math.PI * 2;
        if (cutH) { const bel = id === "abdomen", lo = (c) => bel ? Math.min(ya, cutH[c]) : Math.max(ya, cutH[c]), hi = (c) => bel ? Math.min(yb, cutH[c]) : Math.max(yb, cutH[c]);
          if (!join.keepAll && (bel ? ya >= cutH[a] && ya >= cutH[n] : yb <= cutH[a] && yb <= cutH[n])) continue;
          facet([colPt(a, lo(a)), colPt(n, lo(n)), colPt(n, hi(n)), colPt(a, hi(a))], [A.col[a], A.col[n], B.col[n], B.col[a]], [A.glow[a], A.glow[n], B.glow[n], B.glow[a]], [Math.cos(th), 0, Math.sin(th)], i, a); continue; }
        facet([pt(A, a, ya), pt(A, n, ya), pt(B, n, yb), pt(B, a, yb)], [A.col[a], A.col[n], B.col[n], B.col[a]], [A.glow[a], A.glow[n], B.glow[n], B.glow[a]], [Math.cos(th), 0, Math.sin(th)], i, a); } }
    // the ends: a ring drawn in half a block out, then a point
    if (cutH) { const near = (a) => rows.reduce((b, r) => Math.abs(r.y + 0.5 - cutH[a]) < Math.abs(b.y + 0.5 - cutH[a]) ? r : b, rows[0]);
      join.edge = { pts: Array.from({ length: TSIDES }, (_, a) => colPt(a, cutH[a])), cols: Array.from({ length: TSIDES }, (_, a) => near(a).col[a]), glows: Array.from({ length: TSIDES }, (_, a) => near(a).glow[a]) }; }
    else if (cut) { const r = id === "abdomen" ? rows[rows.length - 1] : rows[0];
      join.edge = { pts: Array.from({ length: TSIDES }, (_, a) => pt(r, a, r.y + 0.5)), cols: r.col.slice(), glows: Array.from(r.glow) }; }
    for (const [r, y, dir] of [[rows[0], rows[0].y, -1], [rows[rows.length - 1], rows[rows.length - 1].y + 1, 1]]) {
      if (cut && ((id === "abdomen" && dir > 0) || (id === "chest" && dir < 0))) continue;
      // (b90: the ends that meet inside the other part, the chest's bottom and the belly's top, closed flat, so no point pokes out)
      const inner = (id === "chest" && dir < 0) || (id === "abdomen" && dir > 0), yr = r.y + 0.5, mid = [(r.cx + o[0]) * C, (y + (inner ? -dir * 0.3 : dir * 0.35) + o[1]) * C, (r.cz + o[2]) * C];
      // b102: the chest's bottom rounded off in a short dome (ENDDOME blocks deep, rings drawn in on a quarter circle,
      // closed flat at a fifth of its size), not cut flat: on all fours, where the belly bends away under it, the flat
      // end showed as a chopped corner; a dome this shallow and wide never points out
      if (inner && id === "chest") { const D = ${+(process.env.ENDDOME || 1.6)}, DB = ${+(process.env.ENDBACK || 4)}, steps = [0, 0.2, 0.4, 0.6, 0.75, 0.88, 1];
        // b104: on the back half the end runs on ENDBACK blocks at nearly full size before closing (a skirt over the
        // belly), so where the waist bends on all fours and the back opens on the outside of the bend, it still covers
        // the belly; on the front half the shallow dome as before
        const wOf = (a) => { const sn = Math.sin(((a % TSIDES + 0.5) / TSIDES) * Math.PI * 2); return Math.pow(Math.max(0, -sn), 0.7); };
        const P2 = (a, u) => { const w = wOf(a), d = D + (DB - D) * w, k = Math.max(0.2, Math.cos((u * Math.PI) / 2) * (1 - w) + (1 - 0.8 * Math.pow(u, 4)) * w); return pt(r, a, yr + dir * d * u, k); };
        for (let q = 0; q + 1 < steps.length; q++) { const u0 = steps[q], u1 = steps[q + 1];
          for (let a = 0; a < TSIDES; a++) { const n = (a + 1) % TSIDES, th = ((a + 1) / TSIDES) * Math.PI * 2, k1 = Math.cos((u1 * Math.PI) / 2), out = [Math.cos(th) * k1, dir * (1 - k1), Math.sin(th) * k1];
            facet([P2(a, u0), P2(n, u0), P2(n, u1), P2(a, u1)], [r.col[a], r.col[n]], [r.glow[a], r.glow[n]], out, 904 + q, a); } }
        let mx = 0, my = 0, mz = 0; for (let a = 0; a < TSIDES; a++) { const p = P2(a, 1); mx += p[0]; my += p[1]; mz += p[2]; } const em = [mx / TSIDES, my / TSIDES, mz / TSIDES];
        for (let a = 0; a < TSIDES; a++) { const n = (a + 1) % TSIDES; facet([P2(a, 1), P2(n, 1), em], [r.col[a], r.col[n]], [r.glow[a], r.glow[n]], [0, dir, 0], 911, a); }
        continue; }
      // (b150: the belly's own end, the rump, rounded off in a dome TAILDOME blocks deep (rings drawn in on a quarter circle,
      // closed flat at TAILEND of its size), instead of one ring drawn in and a fan to a point: with the tailbone no longer
      // tucked under, the rump faces back and the fan showed as a starburst)
      if (id === "abdomen" && dir < 0 && ${+(process.env.TAILDOME ?? 0.5)} > 0) { const D = ${+(process.env.TAILDOME ?? 0.5)}, E = ${+(process.env.TAILEND ?? 0.12)}, steps = [0, 0.2, 0.38, 0.54, 0.68, 0.8, 0.9, 1];
        const P3 = (a, u) => pt(r, a, yr + dir * D * Math.sin((u * Math.PI) / 2), Math.max(E, Math.cos((u * Math.PI) / 2)));
        for (let q = 0; q + 1 < steps.length; q++) { const u0 = steps[q], u1 = steps[q + 1];
          for (let a = 0; a < TSIDES; a++) { const n = (a + 1) % TSIDES, th = ((a + 1) / TSIDES) * Math.PI * 2, k1 = Math.cos((u1 * Math.PI) / 2), out = [Math.cos(th) * k1, dir * (1 - k1), Math.sin(th) * k1];
            facet([P3(a, u0), P3(n, u0), P3(n, u1), P3(a, u1)], [r.col[a], r.col[n]], [r.glow[a], r.glow[n]], out, 920 + q, a); } }
        let mx = 0, my = 0, mz = 0; for (let a = 0; a < TSIDES; a++) { const p = P3(a, 1); mx += p[0]; my += p[1]; mz += p[2]; } const em = [mx / TSIDES, my / TSIDES, mz / TSIDES];
        for (let a = 0; a < TSIDES; a++) { const n = (a + 1) % TSIDES; facet([P3(a, 1), P3(n, 1), em], [r.col[a], r.col[n]], [r.glow[a], r.glow[n]], [0, dir, 0], 931, a); }
        continue; }
      for (let a = 0; a < TSIDES; a++) { const n = (a + 1) % TSIDES, th = ((a + 1) / TSIDES) * Math.PI * 2, out = [Math.cos(th) * 0.6, dir, Math.sin(th) * 0.6];
        facet([pt(r, a, yr), pt(r, n, yr), pt(r, n, inner ? yr : y, 0.6), pt(r, a, inner ? yr : y, 0.6)], [r.col[a], r.col[n]], [r.glow[a], r.glow[n]], out, dir > 0 ? 900 : 901, a);
        facet([pt(r, a, inner ? yr : y, 0.6), pt(r, n, inner ? yr : y, 0.6), mid], [r.col[a], r.col[n]], [r.glow[a], r.glow[n]], [0, dir, 0], dir > 0 ? 902 : 903, a); } }
    return geo;
  };
  const JOINS = new Map();
  // b106: the chest and belly as one shell on all fours. The renderer has no skinning, so one mesh cannot bend across two
  // bones; but on all fours the waist's bend is fixed, so a single mesh is built for that pose in the belly's frame: the
  // belly (its all-fours shape) up to WELDGAP blocks short of the waist, the chest from WELDGAP past it, both in place,
  // and a sleeve between their open ends, each point running on a cubic curve that leaves each end along its own spine,
  // so the surface turns the bend in one piece. pose() shows it while t <= MERGET and the separate pieces otherwise.
  const MERGED = new Map();
  const buildMerged = (r, form, tk) => {
    // b110 (WELDSTEADY, on): every weld of the stand-up the same back and stomach: one belly shape (the all-fours one,
    // FOURTOP), one seam (the all-fours FRONTSN and ease), so the welds differ only by the pose; and their colours are
    // the first weld's, face for face (the same faces in the same order, since nothing but the pose changes)
    const steady = ${process.env.WELDSTEADY !== "0"}, ts = steady ? 0 : tk;
    FRONTSN = ${+(process.env.FRONTSN ?? 0.5)} + (${+(process.env.STANDSN ?? -0.3)} - ${+(process.env.FRONTSN ?? 0.5)}) * ts;
    const four = steady || tk < ${+(process.env.FOURSWITCH || 0.35)};
    // (b114: how much of the all-fours belly a step has: all of it on all fours, none from FOURSPAN of the way up)
    const fourK = (() => { const x = Math.max(0, Math.min(1, tk / ${+(process.env.FOURSPAN || 0.45)})); return 1 - x * x * (3 - 2 * x); })();
    const M = BL.math.mat4, pal = form === "code" ? { palette: CODE, emissive: GLOW } : { palette: APE }, G = ${+(process.env.WELDGAP || 3.5)}, L1 = ${L1};
    pose(r, tk); BL.scene.updateWorld(r.root);
    const inv = M.invert(new Float32Array(16), r.abdomen.world), rel = (n) => M.multiply(new Float32Array(16), inv, n.world);
    const Mb = rel(tk < ${+(process.env.FOURSWITCH || 0.35)} ? r.abdomenFour : r.abdomenMesh), Mc = rel(r.chest), top = steady ? ${+(process.env.STEADYTOP || process.env.BELLYTOP || 0.7)} + (${+(process.env.STEADYFOURTOP || 0.7)} - ${+(process.env.STEADYTOP || process.env.BELLYTOP || 0.7)}) * fourK : four ? ${+(process.env.FOURTOP || 3)} : ${+(process.env.BELLYTOP || 0.7)};
    const tf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
    const dir = (m) => { const v = [m[4], m[5], m[6]], l = Math.hypot(...v); return v.map((x) => x / l); };
    // (the ease runs from the back's cut at sine WLO to the pieces' own ends at WHI, by stance: on all fours it is done
    // before the underside, so the stomach and pecs seen from below are the pieces' own; standing it runs on round the side)
    const lo = ${+(process.env.WELDLO4 ?? -0.4)} + (${+(process.env.WELDLOS ?? -1)} - ${+(process.env.WELDLO4 ?? -0.4)}) * ts, hi = ${+(process.env.WELDHI4 ?? 0.8)} + (${+(process.env.WELDHIS ?? 0.4)} - ${+(process.env.WELDHI4 ?? 0.8)}) * ts;
    const wF = (sn) => { const x = Math.max(0, Math.min(1, (sn - lo) / (hi - lo))); return x * x * (3 - 2 * x); };
    const jb = { cut: L1 - G, cutW: wF, sag: ${+(process.env.SAG ?? 0)} * fourK, full: ${+(process.env.FULL ?? 0.4)} * fourK, peak: 0.5 + (${+(process.env.PEAK ?? 0.72)} - 0.5) * fourK, tuck: ${+(process.env.TUCK4 ?? 0)} * fourK, shift: ${+(process.env.SHIFT4 ?? 0.6)}, shiftK: fourK }, jc = { cut: G, cutW: wF };
    // b110: on the front the belly stops where it goes into the chest (searching up its column, in this pose), not at its
    // own top: standing, the all-fours belly's fuller top came out through the pecs. Every face is kept (keepAll), the
    // ones past a cut drawn flat on it, so each weld has the same faces and can take the first one's colours
    if (steady) { const pr = torsoShell(OUT.abdomen, form, pal, OUT.abdomen.origin || [0, 0, 0], "abdomen", top, { probe: true, sag: jb.sag, full: jb.full, peak: jb.peak, tuck: jb.tuck, shift: jb.shift, shiftK: jb.shiftK }), cr = torsoShell(OUT.chest, form, pal, OUT.chest.origin || [0, 0, 0], "chest", undefined, { probe: true });
      const ob = OUT.abdomen.origin || [0, 0, 0], oc = OUT.chest.origin || [0, 0, 0], iC = M.invert(new Float32Array(16), Mc), C = CELL;
      const radAt = (rr, th) => { const u = (((th / (Math.PI * 2)) * TSIDES - 0.5) % TSIDES + TSIDES) % TSIDES, a = Math.floor(u), f = u - a; return rr.rad[a % TSIDES] * (1 - f) + rr.rad[(a + 1) % TSIDES] * f; };
      const inChest = (p) => { const q = tf(iC, tf(Mb, p)), y = q[1] / C - oc[1]; if (y < cr[0].y + 0.5 || y > cr[cr.length - 1].y + 0.5) return false;
        let k = 0; while (k + 1 < cr.length && cr[k + 1].y + 0.5 <= y) k++; const rr = cr[k], dx = q[0] / C - oc[0] - rr.cx, dz = q[2] / C - oc[2] - rr.cz; return Math.hypot(dx, dz) < radAt(rr, Math.atan2(dz, dx)); };
      const bp = (a, h) => { let k = 0; while (k + 2 < pr.length && pr[k + 1].y + 0.5 < h) k++; const P = pr[k], Q = pr[k + 1], f = (h - P.y - 0.5) / (Q.y - P.y), th = ((a + 0.5) / TSIDES) * Math.PI * 2;
        const rad = P.rad[a] + (Q.rad[a] - P.rad[a]) * f, cx = P.cx + (Q.cx - P.cx) * f, cz = P.cz + (Q.cz - P.cz) * f; return [(cx + Math.cos(th) * rad + ob[0]) * C, (h + ob[1]) * C, (cz + Math.sin(th) * rad + ob[2]) * C]; };
      const endB = pr[pr.length - 1].y + 0.5, endC = cr[0].y + 0.5, low = pr[0].y + 0.5 + (endB - pr[0].y - 0.5) * 0.4;
      jb.cutHs = Array.from({ length: TSIDES }, (_, a) => { const w = wF(Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2)); let hx = endB;
        // (or where it comes up level with the chest's bottom edge, so a belly fuller than the pecs never stands out over them)
        for (let h = low; h <= endB; h += 0.25) { const p = bp(a, h), q = tf(iC, tf(Mb, p)); if (inChest(p) || (${process.env.RIMCUT === "1"} && q[1] / C - oc[1] >= cr[0].y + 0.5 + ${+(process.env.RIMUP ?? 0)})) { hx = h; break; } }
        return (L1 - G) + (hx - (L1 - G)) * w; });
      if (${process.env.CUTLOG === "1"}) (window.__cutlog = window.__cutlog || []).push([form, tk, jb.cutHs.map((v) => +v.toFixed(2))]);
      jc.cutHs = Array.from({ length: TSIDES }, (_, a) => { const w = wF(Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2)); return G + (endC - G) * w; });
      jb.keepAll = jc.keepAll = true; }
    const split = ${process.env.WELDSPLIT === "1"}, bt = split ? torsoShell(OUT.abdomen, form, pal, OUT.abdomen.origin || [0, 0, 0], "abdomen", ${+(process.env.BELLYTOP || 0.7)}, "rows") : null;
    const gc = torsoShell(OUT.chest, form, pal, OUT.chest.origin || [0, 0, 0], "chest", undefined, jc);
    jb.toward = jc.edge;
    const gb = torsoShell(OUT.abdomen, form, pal, OUT.abdomen.origin || [0, 0, 0], "abdomen", top, jb);
    // (b107: the front as the pieces are shown apart: the belly and the chest whole, built as build() builds them)
    const fb = split ? torsoShell(OUT.abdomen, form, pal, OUT.abdomen.origin || [0, 0, 0], "abdomen", top, null) : null;
    const fc = split ? torsoShell(OUT.chest, form, pal, OUT.chest.origin || [0, 0, 0], "chest", undefined, ${process.env.EDGEBELLY !== "0"} ? { belly: bt[bt.length - 1] } : null) : null;
    // (b112: the shells as built, in their own parts' frames, for the pieces the steady weld hands back)
    const gbL = gb.verts.slice(), gcL = gc.verts.slice();
    for (const [g, m] of [[gb, Mb], [gc, Mc], [fb, Mb], [fc, Mc]].filter((x) => x[0])) { const V = g.verts; for (let i = 0; i < V.length; i += 3) { const q = tf(m, [V[i], V[i + 1], V[i + 2]]); V[i] = q[0]; V[i + 1] = q[1]; V[i + 2] = q[2]; } }
    // b109: the stomach's top tucked into the chest at the sides. The belly runs on up inside the chest, but at its sides it
    // stood out past the chest's bottom edge as a ledge (and, at the line where the front pieces meet the weld, as fins).
    // Each of the front belly's points within TUCKSPAN blocks under the chest's bottom ring, or above it, is drawn in
    // toward the chest's axis to no further out than TUCKIN of the chest's surface there (its bottom ring's below it),
    // fully at the chest's bottom and easing out below; the front's middle keeps its bulge (the pull fades in from
    // TUCKSIDE of the way round toward the side)
    if (${process.env.TUCKFRONT === "1"}) { const cr = torsoShell(OUT.chest, form, pal, OUT.chest.origin || [0, 0, 0], "chest", undefined, "rows"), co = OUT.chest.origin || [0, 0, 0], iC = M.invert(new Float32Array(16), Mc);
      const yb = cr[0].y + 0.5, SPAN = ${+(process.env.TUCKSPAN || 3)}, KIN = ${+(process.env.TUCKIN || 0.97)}, S0 = ${+(process.env.TUCKSIDE || 0.3)};
      const radAt = (r, th) => { const u = ((th / (Math.PI * 2)) * TSIDES - 0.5 + TSIDES * 4) % TSIDES, a = Math.floor(u), f = u - a; return r.rad[a % TSIDES] * (1 - f) + r.rad[(a + 1) % TSIDES] * f; };
      const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      const V = fb.verts;
      for (let i = 0; i < V.length; i += 3) { const q = tf(iC, [V[i], V[i + 1], V[i + 2]]), y = q[1] / CELL - co[1];
        if (y < yb - SPAN) continue;
        const k = Math.max(0, Math.min(cr.length - 1, Math.round(y - 0.5 - cr[0].y))), r = cr[k], dx = q[0] / CELL - co[0] - r.cx, dz = q[2] / CELL - co[2] - r.cz, d = Math.hypot(dx, dz);
        if (!d) continue; const th = Math.atan2(dz, dx), side = Math.abs(Math.cos(th));
        const lim = KIN * radAt(y < yb ? cr[0] : r, (th + Math.PI * 2) % (Math.PI * 2)); if (d <= lim) continue;
        const w = sm((y - (yb - SPAN)) / SPAN) * sm((side - S0) / 0.4), nd = d + (lim - d) * w;
        const p = [(r.cx + dx / d * nd + co[0]) * CELL, q[1], (r.cz + dz / d * nd + co[2]) * CELL], o = tf(Mc, p); V[i] = o[0]; V[i + 1] = o[1]; V[i + 2] = o[2]; } }
    const A = jb.edge.pts.map((p) => tf(Mb, p)), B = jc.edge.pts.map((p) => tf(Mc, p)), dA = dir(Mb), dB = dir(Mc);
    const N = ${+(process.env.WELDRINGS || 6)}, rings = [], PAD = Math.round(${+(process.env.SLEEVEPAD ?? 2)} + (${+(process.env.STANDPAD ?? 0)} - ${+(process.env.SLEEVEPAD ?? 2)}) * tk), sleeveOn = (a) => { if (!${process.env.WELDSPLIT === "1"}) return true; for (let d = -PAD; d <= PAD; d++) if (facetSn((a + d + A.length) % A.length) < FRONTSN) return true; return false; };
    for (let k = 0; k <= N; k++) { const u = k / N, h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
      rings.push(A.map((a, i) => { const b = B[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * ${+(process.env.WELDTAN || 0.4)} * (1 - wF(Math.sin(((i + 0.5) / A.length) * Math.PI * 2))); return [0, 1, 2].map((n) => h00 * a[n] + h10 * L * dA[n] + h01 * b[n] + h11 * L * dB[n]); })); }
    const hexRgb2 = (h) => [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16)), weld = BL.models.geometry(), T = A.length;
    const colAt = (a, u) => { const x = hexRgb2(jb.edge.cols[a]), y = hexRgb2(jc.edge.cols[a]); return [0, 1, 2].map((n) => x[n] + (y[n] - x[n]) * u); };
    for (let k = 0; k < N; k++) { const P = rings[k], Q = rings[k + 1], ctr = [0, 1, 2].map((n) => (P.reduce((s, p) => s + p[n], 0) + Q.reduce((s, p) => s + p[n], 0)) / (2 * T));
      for (let a = 0; a < T; a++) { if (!sleeveOn(a)) continue; const b = (a + 1) % T, u = (k + 0.5) / N, c = colAt(a, u).map((v, n) => (v + colAt(b, u)[n]) / 2), f = 1 + (((Math.min(a, (T / 2 - 2 - a + T) % T) * 73 + k * 151) % 17) / 17 - 0.5) * 0.12;
        const hex = "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0")).join(""), q = [P[a], P[b], Q[b], Q[a]];
        const mid = [0, 1, 2].map((n) => (q[0][n] + q[1][n] + q[2][n] + q[3][n]) / 4); let e = form === "code" ? Math.min(1, (jb.edge.glows[a] + jc.edge.glows[a]) / 2 * ${LIMBGLOW} + 0.05) : 0;
        // (dimmed as the shells' light greys are, b110)
        let hexD = hex; { const v = [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16)), lw = form === "code" ? Math.max(0, Math.min(1, ((v[0] * 0.3 + v[1] * 0.59 + v[2] * 0.11) / 255 - ${+(process.env.DIMFROM || 0.35)}) / 0.3)) : 0;
          if (lw) { e *= 1 - (1 - ${+(process.env.CODEDIM || 0.45)}) * lw; const kc = 1 - (1 - ${+(process.env.CODECOL || 0.75)}) * lw; hexD = "#" + v.map((x) => Math.round(x * kc).toString(16).padStart(2, "0")).join(""); } }
        const n0 = weld.faces.length; BL.heroBody.poly(weld, q, hexD, [mid[0] - ctr[0], mid[1] - ctr[1], mid[2] - ctr[2]], e); for (let f = n0; f < weld.faces.length; f++) { weld.faces[f].ang = a; weld.faces[f].sleeve = true; } } }
    // the back's colours smoothed round the waist: each face on the back within WELDBLUR blocks of the weld's middle takes
    // in the mean of the back's faces within 2.5 blocks of it (BLURMIX at the weld, none at the edge of the region), so the
    // two parts' colour bands run into each other; a little of each face's own variation is kept
    const all = merge(merge(gb, gc), weld), V = all.verts, C = CELL, R = ${+(process.env.WELDBLUR || 18)} * C, R2 = ${+(process.env.BLURR || 4.5)} * C;
    const mid = [0, 1, 2].map((n) => (A.reduce((s, p) => s + p[n], 0) + B.reduce((s, p) => s + p[n], 0)) / (2 * A.length));
    // (the back: straight up in the world on all fours, in the belly's frame)
    const back = [0, 0, -1];
    // (steady: only the first weld's colours are kept, so the others skip the smoothing, the costly part)
    const info = steady && tk !== 0 ? [] : all.faces.map((f) => { const c = [0, 0, 0]; for (const k of f.i) for (let n = 0; n < 3; n++) c[n] += V[k * 3 + n]; for (let n = 0; n < 3; n++) c[n] /= f.i.length;
      const a = f.i[0] * 3, b = f.i[1] * 3, d = f.i[2] * 3, u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], w = [V[d] - V[a], V[d + 1] - V[a + 1], V[d + 2] - V[a + 2]];
      const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], nl = Math.hypot(...nrm) || 1;
      const dist = Math.hypot(c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]), facing = (nrm[0] * back[0] + nrm[1] * back[1] + nrm[2] * back[2]) / nl;
      const side = (c[0] - mid[0]) * back[0] + (c[1] - mid[1]) * back[1] + (c[2] - mid[2]) * back[2]; const sn = facetSn(f.ang ?? 0); return { c, on: !f.dash && dist < R && side > ${+(process.env.BLURSIDE || 0.5)} * C && sn < FRONTSN, dist, k: backK(sn) }; });
    const src = all.faces.map((f) => f.color.slice());
    for (let i = 0; i < info.length; i++) { const I = info[i]; if (!I.on) continue; const sum = [0, 0, 0]; let n = 0;
      for (let j = 0; j < info.length; j++) { const J = info[j]; if (!J.on) continue; if (Math.hypot(J.c[0] - I.c[0], J.c[1] - I.c[1], J.c[2] - I.c[2]) > R2) continue; for (let k = 0; k < 3; k++) sum[k] += src[j][k]; n++; }
      const w = ${+(process.env.BLURMIX || 0.8)} * (1 - I.dist / R) * I.k;
      // then the fur laid back over it (the smoothing evens out the bands but also the pattern): speckle, patches, light
      // hairs, dark strokes and the odd spot, by a hash of the face's place
      const pk = Math.round(Math.abs(info[i].c[0]) / C * 2) * 131 + Math.round(info[i].c[1] / C * 2) * 17 + Math.round(info[i].c[2] / C * 2) * 7, hq = (a) => { const v = Math.sin(a * 12.9898 + pk * 78.233) * 43758.5453; return v - Math.floor(v); }, wf = w / ${+(process.env.BLURMIX || 0.8)};
      const furK = 1 + wf * ((hq(1) - 0.5) * 0.26 + (hq(Math.floor(i / 6) + 3) - 0.5) * 0.18 + (hq(5) < 0.12 ? 0.25 : hq(6) < 0.12 ? -0.22 : 0) + (hq(7) < 0.07 ? (hq(8) < 0.55 ? 0.4 : -0.35) : 0));
      for (let k = 0; k < 3; k++) all.faces[i].color[k] = Math.min(all.faces[i].color[k] > 1 || src[i][k] > 1 ? 255 : 1, (src[i][k] + (sum[k] / n - src[i][k]) * w) * furK); }
    if (${process.env.WELDRED === "1"}) for (const f of all.faces) { f.color[0] = f.color[0] > 1 ? 255 : 1; f.color[1] = 0; f.color[2] = 0; }
    // the weld's back (and its sleeve) with the pieces' front
    const pick = (g, f) => ({ verts: g.verts, faces: g.faces.filter(f), lines: [] });
    if (${process.env.WELDDEBUG === "1"}) { const tint = (g, c) => { for (const f of g.faces) f.color = c.slice(); };
      tint(fb, [255, 40, 40]); tint(fc, [40, 80, 255]); for (const f of all.faces) f.color = f.sleeve ? [40, 220, 40] : [230, 210, 40]; }
    // b110: every face wound the same way as its neighbours. The sleeve's faces were turned by their middle's direction from
    // the ring's centre, which on a face lying across the body (under the pecs) could go either way, so a face here and
    // there faced inward and the renderer, drawing front faces only, left a gap in it from some angles. Faces are matched
    // edge to edge by position and any face whose shared edges run the same way as most of its neighbours' is turned over
    { const V = all.verts, key = (i) => Math.round(V[3*i] * 4000) + "," + Math.round(V[3*i+1] * 4000) + "," + Math.round(V[3*i+2] * 4000);
      const F = all.faces.map((f) => { const ks = f.i.map(key).filter((x, j, a) => x !== a[(j + a.length - 1) % a.length]); return f.dash || ks.length < 3 ? null : ks; });
      const E = new Map(); F.forEach((ks, n) => { if (!ks) return; for (let j = 0; j < ks.length; j++) { const a = ks[j], c = ks[(j + 1) % ks.length], u = a < c ? a + "|" + c : c + "|" + a; if (!E.has(u)) E.set(u, []); E.get(u).push(n); } });
      const sense = (n, a, c) => { const ks = F[n], flip = all.faces[n].flipped ? -1 : 1; for (let j = 0; j < ks.length; j++) if (ks[j] === a && ks[(j + 1) % ks.length] === c) return flip; else if (ks[j] === c && ks[(j + 1) % ks.length] === a) return -flip; return 0; };
      // (spread from the shells, whose faces are right: each sleeve face takes the winding of the first decided face it
      // meets edge to edge; a whole band of the sleeve can be inside out at once, which neighbours' votes inside it miss)
      const done = F.map((ks, n) => !ks || !all.faces[n].sleeve), queue = []; F.forEach((ks, n) => { if (ks && done[n]) queue.push(n); });
      while (queue.length) { const n = queue.shift(), ks = F[n];
        for (let j = 0; j < ks.length; j++) { const a = ks[j], c = ks[(j + 1) % ks.length], u = a < c ? a + "|" + c : c + "|" + a, mine = sense(n, a, c);
          for (const m of E.get(u)) if (!done[m]) { if (sense(m, a, c) === mine) all.faces[m].flipped = !all.faces[m].flipped; done[m] = true; queue.push(m); } } }
      for (const f of all.faces) if (f.flipped) { f.i.reverse(); delete f.flipped; } }
    if (steady) { const key = form + ":colors";
      if (tk === 0) MERGED.set(key, all.faces.map((f) => [f.color.slice(), f.emissive]));
      else { const ref = MERGED.get(key); if (!ref || ref.length !== all.faces.length) throw new Error("weld " + tk + ": " + all.faces.length + " faces, the first weld " + (ref && ref.length));
        all.faces.forEach((f, n) => { f.color = ref[n][0].slice(); f.emissive = ref[n][1]; }); } }
    // b112: the steady weld handed back in three pieces, so the chest moves smoothly while it stands up: the belly in the
    // belly mesh's own frame (on a node that follows it), the chest in its own frame (shown on the chest itself, as its
    // geometry, the same in every weld) and only the sleeve between them, in the belly's frame, posed in steps
    if (steady) { const nb = gb.faces.length, nc = gc.faces.length, vb = gb.verts.length / 3, vc = gc.verts.length / 3;
      const piece = (verts, from, to, shift) => characterGeometry({ verts, faces: all.faces.slice(from, to).map((f) => ({ ...f, i: f.i.map((i) => i - shift) })), lines: [] });
      // (and what the live sleeve needs: the belly's cut edge in its own frame, the chest's in its own, how far each
      // column's ends lean along their spines, and the sleeve's colours and windings as this weld has them)
      const sf = all.faces.slice(nb + nc), wv = weld.verts;
      const live = { a: jb.edge.pts.map((p) => p.slice()), b: jc.edge.pts.map((p) => p.slice()), tan: Array.from({ length: TSIDES }, (_, a) => ${+(process.env.WELDTAN || 0.4)} * (1 - wF(Math.sin(((a + 0.5) / TSIDES) * Math.PI * 2)))),
        faces: sf.map((f) => { const P = f.i.map((i) => { const j = (i - vb - vc) * 3; return [wv[j], wv[j + 1], wv[j + 2]]; }); let nx = 0, ny = 0, nz = 0;
          for (let k = 0; k < P.length; k++) { const a = P[k], c = P[(k + 1) % P.length]; nx += (a[1] - c[1]) * (a[2] + c[2]); ny += (a[2] - c[2]) * (a[0] + c[0]); nz += (a[0] - c[0]) * (a[1] + c[1]); }
          return { color: f.color.slice(), emissive: f.emissive, n: [nx, ny, nz] }; }) };
      // b122: the stomach's upper front lit as its front: where it curves in under the pecs its faces tilt up toward the
      // sky and read as two light patches either side. Over its top UPLITSPAN, on the front half, each face's lighting
      // normal has its upward part cut by up to UPLITK (the shape and colours unchanged; the renderers take normals over
      // a face's own), eased in toward the top
      const bellyG = piece(gbL, 0, nb, 0);
      if (${process.env.UPLIT !== "0"}) { const V = bellyG.verts, N = new Array(V.length).fill(0); let y0 = 1e9, y1 = -1e9, zc = 0;
        for (let i = 0; i < V.length; i += 3) { y0 = Math.min(y0, V[i + 1]); y1 = Math.max(y1, V[i + 1]); zc += V[i + 2]; } zc /= V.length / 3;
        const span = (y1 - y0) * ${+(process.env.UPLITSPAN || 0.45)}, K = ${+(process.env.UPLITK || 0.85)};
        for (const f of bellyG.faces) { let cy = 0, cz = 0, nx = 0, ny = 0, nz = 0; for (let k = 0; k < f.i.length; k++) { const a = f.i[k] * 3, c = f.i[(k + 1) % f.i.length] * 3; cy += V[a + 1]; cz += V[a + 2];
            nx += (V[a + 1] - V[c + 1]) * (V[a + 2] + V[c + 2]); ny += (V[a + 2] - V[c + 2]) * (V[a] + V[c]); nz += (V[a] - V[c]) * (V[a + 1] + V[c + 1]); }
          cy /= f.i.length; cz /= f.i.length; const l = Math.hypot(nx, ny, nz); if (!l || ny <= 0 || cz < zc) continue;
          const x = Math.max(0, Math.min(1, (cy - (y1 - span)) / (span * 0.5))), w = K * x * x * (3 - 2 * x); if (!w) continue;
          const m = [nx / l, ny / l * (1 - w), nz / l], ml = Math.hypot(...m) || 1; for (const i of f.i) { N[3 * i] = m[0] / ml; N[3 * i + 1] = m[1] / ml; N[3 * i + 2] = m[2] / ml; } }
        bellyG.normals = N; }
      return { belly: bellyG, chest: piece(gcL, nb, nb + nc, vb), sleeve: piece(weld.verts, nb + nc, all.faces.length, vb + vc), live }; }
    return characterGeometry(${process.env.WELDSPLIT === "1"} ? merge(pick(all, (f) => f.sleeve || facetSn(f.ang ?? 0) < FRONTSN), pick(merge(fb, fc), (f) => facetSn(f.ang ?? 0) >= FRONTSN)) : all);
  };
  // a form's parts, one part a slice (build drains it at once)
  const buildSteps = function* (form, slice) {
    const geos = {};
    for (const [id, P] of Object.entries(OUT)) {
      if (slice) yield* BL.buildTasks.pause(slice);
      const v = makeVox(), ink = makeVox(), o = P.origin || [0, 0, 0], origin = { x: o[0] * CELL, y: o[1] * CELL, z: o[2] * CELL };
      for (const [x, y, z, k] of P.cells) v.set(x, y, z, k);
      // b124: the head's stair-steps (the crown's levels, each a whole block in) cut finer, still in blocks: on a step
      // whose next step up continues inward (a staircase, not the edge of a flat top), the step's outer edge loses the
      // part above the line through its riser's and tread's middles, and the corner above it gains the part below that
      // line, both in blocks STEPRES to a block (4 quarter-block steps, 2 half-block); the rest of the head stays whole
      const SK = (x, y, z) => x + "," + y + "," + z, stepTips = new Map(), stepNotch = new Map(), SR = ${+(process.env.STEPRES ?? 0)};
      if (id === "head" && SR > 0) { const hv = (x, y, z) => v.has(x, y, z);
        for (const [x, y, z] of P.cells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!hv(x, y + 1, z) && !hv(x + dx, y, z + dz) && hv(x - dx, y + 1, z - dz)) { const key = SK(x, y, z); (stepTips.get(key) || stepTips.set(key, []).get(key)).push([dx, dz]);
            const nk = SK(x, y + 1, z); if (!hv(x + dx, y + 1, z + dz)) (stepNotch.get(nk) || stepNotch.set(nk, []).get(nk)).push([dx, dz, v.get(x, y, z)]); } } }
      const inkSkip = (x, y, z, nx, nz) => id === "head" && (stepTips.has(SK(x, y, z)) || stepNotch.has(SK(nx, y, nz)));
      // (b168: the code rain on the fists and feet, which are meshes rather than lofts: each upright face (not the soles
      // or tops) may carry a dash down its middle; faces facing the same way at the same place across share a lane, and
      // down a lane the dashes come in streams with gaps, so they stack into broken lines as the limbs' do. U is a block
      // in the mesh's units)
      // (b170: the fist's and foot's glyphs only carry on the forearm's and shin's own lanes: a face's lane is the limb's
      // column its middle stands under, round the limb's bottom ring's axis (toLane: a point to [height along the lane in
      // the loft's own blocks, angle round it]), and only a lane the limb carries draws there; its cells are the lane's own
      // (same key, same lattice), so a stream runs straight on down from the limb and falls as one)
      // (b171: a lane on the fist or foot follows the surface: toLane gives a point's distance along the lane (its height
      // up the limb, less how far out it stands past the limb's bottom ring, so a lane runs on out over the top of the
      // foot or the back of the hand) and its angle round the limb. Each face's dash runs along that distance's slope in
      // the face, so a dash on the top of the foot points down the foot to the toes; the soles and palms underneath take
      // none)
      const meshRain = (geom, U, rain, toLane, front = null, upTo = null) => { if (form !== "code" || !RAIN_ON || !rain) return; const V = geom.verts, nF = upTo === null ? geom.faces.length : upTo, lift = 0.03 * U, eps = 0.05 * U;
        let gx = 0, gy = 0, gz = 0; for (let i = 0; i < V.length; i += 3) { gx += V[i]; gy += V[i + 1]; gz += V[i + 2]; } const nv = V.length / 3; gx /= nv; gy /= nv; gz /= nv;
        for (let fi = 0; fi < nF; fi++) { const f = geom.faces[fi]; if (f.dash || !f.i || f.i.length < 3) continue; const P = f.i.map((k) => [V[3 * k], V[3 * k + 1], V[3 * k + 2]]);
          let nx = 0, ny = 0, nz = 0; for (let a = 0; a < P.length; a++) { const p = P[a], q = P[(a + 1) % P.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
          const nl = Math.hypot(nx, ny, nz); if (!nl) continue; nx /= nl; ny /= nl; nz /= nl;
          const c = [0, 1, 2].map((m) => P.reduce((t, p) => t + p[m], 0) / P.length); if (nx * (c[0] - gx) + ny * (c[1] - gy) + nz * (c[2] - gz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
          if (ny < -0.3) continue;
          // (b172: two ways along a lane: down the surface (mode 0), which the foot's front lanes take over its top, and
          // straight down (mode 2, plain height), which every other lane on the foot takes, so a lane down its side or the
          // back of the heel keeps falling straight rather than angling out over the foot)
          const frame = (mode) => { const sc = toLane(c)[mode], g = [0, 1, 2].map((m) => { const q = c.slice(); q[m] += eps; return (toLane(q)[mode] - sc) / eps; }), gn = g[0] * nx + g[1] * ny + g[2] * nz, gp = [g[0] - nx * gn, g[1] - ny * gn, g[2] - nz * gn], L = Math.hypot(...gp);
            if (L < 0.2 / U) return null; const b = gp.map((v) => v / L), t = [ny * b[2] - nz * b[1], nz * b[0] - nx * b[2], nx * b[1] - ny * b[0]];
            let t0 = 1e9, t1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of P) { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], u = d[0] * t[0] + d[1] * t[1] + d[2] * t[2], v = d[0] * b[0] + d[1] * b[1] + d[2] * b[2]; t0 = Math.min(t0, u); t1 = Math.max(t1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
            return { sc, L, b, t, t0, t1, b0, b1 }; };
          const F0 = frame(0), F2 = front === null ? F0 : frame(2); if (!F0 && !F2) continue;
          const hw = RDW / 2 * U;
          // every lane crossing the face draws its share there: the lane's middle is where the angle round the limb is
          // its column's middle (found across the face, or just past its edge), and the dash's width about it is clipped
          // to the face, so a dash wider than a narrow facet is drawn a facet's share at a time
          const NS = 12, angOf = (Fm) => { const { t, t0, t1 } = Fm, A = []; for (let q = 0; q <= NS; q++) { const u = t0 - hw + (t1 - t0 + 2 * hw) * q / NS; A.push([u, toLane([c[0] + t[0] * u, c[1] + t[1] * u, c[2] + t[2] * u])[1]]); } return A; }, ang0 = F0 && angOf(F0), ang2 = F2 && (F2 === F0 ? ang0 : angOf(F2));
          // (b170: on the foot, only the lanes down the front of the shin (within FOOTFRONT degrees of the toes' way) run on
          // over its top; the side and back lanes keep to the upright faces, down the side or back of the heel)
          for (const j of rain.set) { const mid = (j + 0.5) / rain.sides * Math.PI * 2; let mu = null;
            const isFront = front === null || Math.abs(Math.atan2(Math.sin(mid - front), Math.cos(mid - front))) <= ${+(process.env.FOOTFRONT || 50)} * Math.PI / 180;
            if (!isFront && ny > 0.45) continue; const Fm = isFront ? F0 : F2, ang = isFront ? ang0 : ang2; if (!Fm || Fm.t1 - Fm.t0 < 0.04 * U) continue; const { sc, L, b, t, t0, t1, b0, b1 } = Fm;
            for (let q = 0; q < NS; q++) { const da = Math.atan2(Math.sin(ang[q][1] - mid), Math.cos(ang[q][1] - mid)), db = Math.atan2(Math.sin(ang[q + 1][1] - mid), Math.cos(ang[q + 1][1] - mid));
              if (Math.abs(da) > 1 || Math.abs(db) > 1 || (da > 0) === (db > 0) && da !== 0) continue; mu = ang[q][0] + (ang[q + 1][0] - ang[q][0]) * (da / ((da - db) || 1)); break; }
            if (mu === null) continue; const ua = Math.max(t0, mu - hw), ub = Math.min(t1, mu + hw); if (ub - ua < 0.03 * U) continue;
            const key = id.replace(/Foot$/, "") + ":" + j;
            for (const [k, ya, yb] of rainCells(key, sc + b0 * L, sc + b1 * L)) { const v0 = (ya - sc) / L, v1 = (yb - sc) / L;
              const at = (u, v) => [0, 1, 2].map((m) => c[m] + t[m] * u + b[m] * v + [nx, ny, nz][m] * lift), n0 = geom.faces.length;
              BL.heroBody.poly(geom, [at(ua, v0), at(ub, v0), at(ub, v1), at(ua, v1)], "#5ef64a", [nx, ny, nz], 0.95); rainTag(geom, n0, key, k); } } } };
      // (b169: the head's glyphs on the kit's lattice: on each face (f) a column (a) is a lane, every other column with a
      // parity of the face's own and about RAININK of those; a cell every block row (k = y), its dash one quarter wide and
      // three tall (RAINW by RAINL) at the lane's own quarter offset, each drawn alone and tagged so the rig lifts it out)
      const headRain = id === "head" && form === "code" && RAIN_ON, headCells = [];
      const lane = (f, a) => { const P = rmix(rstr("head:" + f), 1) < 0.5 ? 0 : 1; if (mod(a, 2) !== P) return null; const key = "head:" + f + ":" + a; return rmix(rstr(key), 1) < ${+(process.env.RAININK || 0.7)} ? key : null; };
      if (form === "code") for (const [x, y, z, k] of P.cells) {
        if (!DARK.has(k)) continue;
        const X = 4 * x, Y = 4 * y, Z = 4 * z;
        if (headRain) { const put = (key, x0, x1, z0, z1, along, sign) => { if (!key) return; const q = Math.floor(rmix(rstr(key), 2) * 3), w = 1; for (let yq = Y; yq < Y + 4; yq++) { if (mod(yq - q, 3)) continue; const c = along === "z" ? [x0, x1, yq, yq, z0 + w, z0 + w + 1] : [x0 + w, x0 + w + 1, yq, yq, z0, z1]; headCells.push([key, (yq - q) / 3, c, along, sign]); } };
          if (!v.has(x + 1, y, z) && !inkSkip(x, y, z, x + 1, z)) put(lane(1, z), X + 4, X + 4, Z, Z + 3, "z", 1);
          if (!v.has(x - 1, y, z) && !inkSkip(x, y, z, x - 1, z)) put(lane(2, z), X - 1, X - 1, Z, Z + 3, "z", -1);
          if (!v.has(x, y, z + 1) && !inkSkip(x, y, z, x, z + 1)) put(lane(3, x), X, X + 3, Z + 4, Z + 4, "x", 1);
          if (!v.has(x, y, z - 1) && !inkSkip(x, y, z, x, z - 1)) put(lane(4, x), X, X + 3, Z - 1, Z - 1, "x", -1);
          continue; }
        const on = (a) => { if (id === "head" && ${process.env.MIRRORHEAD !== "0"}) a = Math.abs(a); return mod(a, 3) === 0 && mod(y + a, 5) < 3; };
        if (!v.has(x + 1, y, z) && on(z) && !inkSkip(x, y, z, x + 1, z)) ink.fill(X + 4, X + 4, Y + 1, Y + 3, Z + 1, Z + 2, 1);
        if (!v.has(x - 1, y, z) && on(z) && !inkSkip(x, y, z, x - 1, z)) ink.fill(X - 1, X - 1, Y + 1, Y + 3, Z + 1, Z + 2, 1);
        if (!v.has(x, y, z + 1) && on(x) && !inkSkip(x, y, z, x, z + 1) && !(id === "head" && x === 0 && ${process.env.MIRRORHEAD !== "0"})) ink.fill(X + 1, X + 2, Y + 1, Y + 3, Z + 4, Z + 4, 1);
        if (!v.has(x, y, z - 1) && on(x) && !inkSkip(x, y, z, x, z - 1) && !(id === "head" && x === 0 && ${process.env.MIRRORHEAD !== "0"})) ink.fill(X + 1, X + 2, Y + 1, Y + 3, Z - 1, Z - 1, 1);
      }
      const pal = form === "code" ? { palette: CODE, emissive: GLOW } : { palette: APE };
      // (the steps' fine blocks, in quarters, merged after the head's own blocks below)
      let stepFine = null;
      if (stepTips.size || stepNotch.size) { stepFine = makeVox(); const cen = (q) => (Math.floor((q * SR) / 4) + 0.5) / SR;
        // u runs across the cell from its inner face (0) to its outer (1) the step's way, w up it
        const uOf = (qx, qz, dx, dz) => dx > 0 ? cen(qx) : dx < 0 ? cen(3 - qx) : dz > 0 ? cen(qz) : cen(3 - qz);
        for (const [key, dirs] of stepTips) { const [x, y, z] = key.split(",").map(Number), k = v.get(x, y, z); v.del(x, y, z);
          for (let qx = 0; qx < 4; qx++) for (let qy = 0; qy < 4; qy++) for (let qz = 0; qz < 4; qz++) { const w = cen(qy);
            if (dirs.some(([dx, dz]) => uOf(qx, qz, dx, dz) + w >= 1.5)) continue; stepFine.set(4 * x + qx, 4 * y + qy, 4 * z + qz, k); } }
        for (const [key, dirs] of stepNotch) { const [x, y, z] = key.split(",").map(Number); if (v.has(x, y, z)) continue;
          for (let qx = 0; qx < 4; qx++) for (let qy = 0; qy < 4; qy++) for (let qz = 0; qz < 4; qz++) { const w = cen(qy), d = dirs.find(([dx, dz]) => uOf(qx, qz, dx, dz) + w <= 0.5);
            if (d) stepFine.set(4 * x + qx, 4 * y + qy, 4 * z + qz, d[2]); } } }
      const shellTorso = ${process.env.TORSOSHELL !== "0"} && (id === "abdomen" || id === "chest");
      const joinFor = (top) => { if (${process.env.WAISTBLEND !== "1"}) return null; const key = form + ":" + top; if (JOINS.has(key)) return JOINS.get(key);
        const A = torsoShell(OUT.abdomen, form, pal, OUT.abdomen.origin || [0, 0, 0], "abdomen", top, "rows"), Cr = torsoShell(OUT.chest, form, pal, OUT.chest.origin || [0, 0, 0], "chest", top, "rows");
        const a = A[A.length - 1], c = Cr[0], ring = { rad: new Float32Array(TSIDES), col: [], glow: new Float32Array(TSIDES) };
        for (let k = 0; k < TSIDES; k++) { ring.rad[k] = (a.rad[k] + c.rad[k]) / 2; const x = hexRgb(a.col[k]), y = hexRgb(c.col[k]); ring.col.push([0, 1, 2].map((n) => (x[n] + y[n]) / 2)); ring.glow[k] = (a.glow[k] + c.glow[k]) / 2; }
        JOINS.set(key, ring); return ring; };
      // the chest's bottom edge takes the belly's top colours (b102)
      const bellyTop = () => { const A = torsoShell(OUT.abdomen, form, pal, OUT.abdomen.origin || [0, 0, 0], "abdomen", ${+(process.env.BELLYTOP || 0.7)}, "rows"); return A[A.length - 1]; };
      let g = shellTorso ? torsoShell(P, form, pal, o, id, undefined, id === "chest" && ${process.env.EDGEBELLY !== "0"} ? { belly: bellyTop() } : joinFor(${+(process.env.BELLYTOP || 0.7)})) : voxelGeometry(v, { unit: CELL, origin, ...pal });
      if (P.loft) {
        // The faceted shoulder (b31, b32): rings of SIDES points round a rounded square (a superellipse), three rings
        // to each span of the measured ones, so the facets are small; each facet's grey is the shoulder's fade at its
        // height, stepped a little up or down at random (hashed, so the same every build) and streaked a little
        // by its column, as fur is, and drawn as one flat facet (BL.heroBody.poly).
        const SIDES = 24, SUB = 3, SE = 2.6, SEC = P.loft.sections, GR = P.loft.greys, geo = BL.models.geometry();
        const lerp = (a, b, t) => a + (b - a) * t;
        const rings = [], greyAt = [];
        for (let i = 0; i < SEC.length - 1; i++) for (let k = 0; k < SUB; k++) {
          const t = k / SUB, a = SEC[i], b = SEC[i + 1]; rings.push(a.map((v, n) => lerp(v, b[n], t))); greyAt.push(GR[Math.min(i, GR.length - 1)] + (GR[Math.min(i + 1, GR.length - 1)] - GR[Math.min(i, GR.length - 1)]) * t);
        }
        rings.push(SEC[SEC.length - 1]); greyAt.push(GR[GR.length - 1]);
        // b67: the shoulder's top tipped (TOPTILT, rise per block from the arm's back to its front, eased in over its top
        // half) so on all fours it sits near level rather than square to the leaning arm
        // b119: a thigh's top rounded by its own last rings (no faces added): its last ROUNDROWS rings drawn in toward the
        // top, to ROUNDTO of their size at the very top, eased over a quarter circle, so the side curves over into a
        // small cap instead of meeting a flat one at a corner (seen from the side on all fours)
        const roundK = (ri) => { if (!/^leg/.test(id) || !${+(process.env.ROUNDROWS || 0)}) return 1; const K = ${+(process.env.ROUNDROWS || 4)}, k = ri - (rings.length - 1 - K); if (k <= 0) return 1;
          const x = k / K; return 1 - (1 - ${+(process.env.ROUNDTO || 0.72)}) * (1 - Math.sqrt(Math.max(0, 1 - x * x))) / (1 - Math.sqrt(Math.max(0, 1 - 1))); };
        const pts = rings.map(([y, hx, hz, , cx, cz], ri) => Array.from({ length: SIDES }, (_, j) => {
          const th = (j / SIDES) * Math.PI * 2, c = Math.cos(th), s2 = Math.sin(th);
          const r = Math.pow(Math.pow(Math.abs(c), SE) + Math.pow(Math.abs(s2), SE), -1 / SE) * roundK(ri);
          const tu = P.loft.arm ? Math.max(0, Math.min(1, (ri / (rings.length - 1) - 0.5) / 0.5)) : 0, tw = tu * tu * (3 - 2 * tu);
          return [(cx + hx * r * c + o[0]) * CELL, (y + ${+(process.env.TOPTILT ?? 0)} * tw * hz * r * s2 + o[1]) * CELL, (cz + hz * r * s2 + o[2]) * CELL];
        }));
        // (b166: the left limbs hash their fur from a seed of their own, so their patches, specks and hairs differ from the
        // right's in detail while their mix, and so their overall shade, is the same; MIRRORCOL=1 shares the right's)
        const hseed = id.endsWith("L") && ${process.env.MIRRORCOL !== "1"} ? ${+(process.env.LSEED || 104729)} : 0, h = (a, b) => ((Math.imul(a + 7 + hseed, 73856093) ^ Math.imul(b + 13 + hseed, 19349663)) >>> 0) / 4294967296;
        // (b169: the code rain's lanes on the limb, its cells drawn by the kit: a column is a lane by the kit's pick, and
        // each cell's dash takes RAINW blocks of the facet's width, centred, whatever the limb's girth)
        const rainOn = form === "code" && RAIN_ON, rainSet = rainOn ? rainPick(id + ":", SIDES, ${+(process.env.RAINKEEP || 0.42)}) : new Set();
        { const bot = rings.reduce((m, r) => r[0] < m[0] ? r : m, rings[0]); P.rain = { set: rainSet, cx: bot[4], cz: bot[5], R: (bot[1] + bot[2]) / 2, sides: SIDES }; }
        const ringY = (i) => rings[Math.max(0, Math.min(i, rings.length - 1))][0];
        // (b174: a lane's square is RAINW wide wherever it lies: where that is wider than the limb's facets, the facets
        // either side of the lane's own draw their share of it, so it stays square)
        const rainFacet = (j, q, nrm, ya, yb) => { if (ya === yb) return; const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1, lift = CELL * 0.03;
          const w = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1], q[2][2] - q[3][2])) / 2 / CELL, hw = RDW / (2 * w);
          const P = (u, v) => [0, 1, 2].map((m) => q[0][m] + (q[1][m] - q[0][m]) * u + (q[3][m] - q[0][m]) * v + (q[2][m] - q[1][m] - q[3][m] + q[0][m]) * u * v + nrm[m] / nl * lift);
          for (const dj of [-1, 0, 1]) { const L = (j + dj + SIDES) % SIDES; if (!rainSet.has(L)) continue; const cu = 0.5 + dj, U0 = Math.max(0, cu - hw), U1 = Math.min(1, cu + hw); if (U1 - U0 < 0.02) continue; const key = id + ":" + L;
            for (const [k, a, b] of rainCells(key, Math.min(ya, yb), Math.max(ya, yb))) { const va = (a - ya) / (yb - ya), vb = (b - ya) / (yb - ya), n0 = geo.faces.length;
              BL.heroBody.poly(geo, [P(U0, va), P(U1, va), P(U1, vb), P(U0, vb)], "#5ef64a", nrm, 0.95); rainTag(geo, n0, key, k); } } };
        // smooth value noise over the facets: x round the arm (wrapping), y up it; -0.5..0.5
        const vn = (x, y, seed, W) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
          const H = (a, b) => h((((a % W) + W) % W) + seed, b + seed * 3), top = H(xi, yi) + (H(xi + 1, yi) - H(xi, yi)) * sx, bot = H(xi, yi + 1) + (H(xi + 1, yi + 1) - H(xi, yi + 1)) * sx;
          return top + (bot - top) * sy - 0.5; };
        // (b112: the mottle's big clumps made one light patch on each thigh's top, the same quadrant on both legs, and lit
        // the shoulders' tops: scaled by LEGMOTTLE on a thigh and ARMMOTTLE on a shoulder)
        const mottleK = /^leg/.test(id) ? ${+(process.env.LEGMOTTLE || 0.3)} : /^arm/.test(id) ? ${+(process.env.ARMMOTTLE || 0.6)} : 1;
        // (b112: its big cells, a quarter of a shoulder's or thigh's top across, made one light quadrant on each, mirrored to the
        // same corner on both sides: on a limb only the fine cells are kept, a little stronger, MOTTLEFINE)
        const topMottle = (i, j, topW, topness) => (/^(arm|leg)/.test(id) ? ${+(process.env.MOTTLEFINE || 0.9)} * vn(j / 1.5, i / 1.25, 120, SIDES / 1.5) : vn(j / 3, i / 2.5, 90, SIDES / 3) + 0.6 * vn(j / 1.5, i / 1.25, 120, SIDES / 1.5)) * ${+(process.env.TOPMOTTLE || 5.5)} * 0.9 * topW * mottleK - ${+(process.env.TOPDARK || 0)} * topW
          + (h(i + 41, j + 17) < 0.14 ? ${+(process.env.SILVERHAIR || 1.3)} : h(i + 43, j + 19) < 0.1 ? -0.9 : 0) * topness;
        // (b112: in the glyph form a shoulder's silver became a light green, the shoulders glowing over the rest: its greys held
        // at the fur's, CODEARMTOP)
        const codeTop = form === "code" && /^arm/.test(id) ? ${+(process.env.CODEARMTOP || 3)} : 11;
        const greyHex = (v) => { v = Math.max(0, Math.min(codeTop, v)); const a = Math.floor(v), b = Math.min(11, a + 1), t = v - a, ha = pal.palette[a], hb = pal.palette[b];
          return "#" + [1, 3, 5].map((n) => Math.round(parseInt(ha.slice(n, n + 2), 16) * (1 - t) + parseInt(hb.slice(n, n + 2), 16) * t).toString(16).padStart(2, "0")).join(""); };
        // b97: the hash behind the fur pattern is weak, so a whole ring's facets can average a couple of greys lighter or
        // darker than the next (on the shoulder the top rings flipped darker). Each facet keeps its own pattern, but each
        // ring's mean is swapped for a smoothed mean of the rings round it, so the shade runs on without a break.
        const gRaw = (i, j) => {
            const base = (greyAt[i] + greyAt[i + 1]) / 2, FURV = +(${FURV}), streak = h(99, j) < 0.3 ? 1.4 : 0;
            // b48: more fur in the colour: clumps a few facets across lighter or darker (FURPATCH), streaks that run
            // down a column for a few rings and stop, now and then a light fleck, and each facet its own brightness
            const patch = (h(i >> 1, (j >> 1) + 40) - 0.5) * ${FURPATCH} + (h(i >> 2, (j >> 2) + 60) - 0.5) * ${FURPATCH} * 0.6;
            const run = h(j + 13, i >> 2) < 0.28 ? 1 : 0, fleck = h(j + 77, i + 5) < 0.1 ? 1 : 0;
            // (stronger where the fur is dark, which otherwise hides it)
            // b49: the lower arm's look carried up over the upper arm and shoulder: where the fur is light the big clumps
            // give way to the same fine speckle (each facet its own, about as many greys as on the dark forearm, in
            // proportion), with dark streaks and dark flecks showing through the silver as the light ones do in the black
            const dk = 1 + Math.max(0, 4 - base) * 0.25, light = Math.max(0, Math.min(1, (base - 3) / 5));
            const speck = (h(i + 21, j + 7) - 0.5) * 2.2 * (0.6 + 0.8 * light);
            // b65: the light tops mottled more, not less: clumps of lighter and darker grey across the silver (TOPMOTTLE)
            // (b65: by height on a shoulder or thigh, its top always mottled however dark the grey there: TOPW)
            const topness = P.loft.upper ? Math.max(0, Math.min(1, (i / (pts.length - 1) - 0.5) / 0.4)) : 0, topW = Math.max(light, ${+(process.env.TOPW || 0.9)} * topness);
            // b92: no sudden breaks: the patches are smooth noise (blended between neighbouring facets, round the arm
            // and up it) rather than a fresh jump each facet, and the silver hairs and dark flecks are gentle
            const mottle = topMottle(i, j, topW, topness);
            const g = base + 0.3 + patch * dk * (1 - 0.3 * light) + speck * light * (1 + 0.8 * light) + mottle
              - run * (0.7 + 0.5 * h(i, j + 3)) * (1 + light) + fleck * 1.6 * dk * (light > 0.3 ? -1 : 1);
            return g; };
        const ringMean = [], NR = pts.length - 1;
        for (let i = 0; i < NR; i++) { let sm = 0; for (let j = 0; j < SIDES; j++) sm += gRaw(i, j) - (greyAt[i] + greyAt[i + 1]) / 2; ringMean.push(sm / SIDES); }
        // (the means smoothed along the part, then from their highest ring up held at that level, so the top never falls
        // back; the closed top takes the top ring's)
        const ringSmooth = ringMean.slice(); for (let pass = 0; pass < 24; pass++) { const p0 = ringSmooth.slice(); for (let i = 0; i < NR; i++) ringSmooth[i] = (p0[Math.max(0, i - 1)] + 2 * p0[i] + p0[Math.min(NR - 1, i + 1)]) / 4; }
        if (P.loft.upper) { let pk = 0; for (let i = 0; i < NR; i++) if (ringSmooth[i] > ringSmooth[pk]) pk = i; for (let i = pk + 1; i < NR; i++) ringSmooth[i] = ringSmooth[pk]; }
        const meanAll = ringSmooth[NR - 1];
        // b119: the cap's tiles CAPSUB times finer than the ring's facets (a point stood where four big tiles met); the
        // points it adds on the ring are on its straight edges, so the side's top band takes them too
        const capSub = SIDES % 4 === 0 && ${process.env.TILECAP !== "0"} && ${process.env.PLAINCAP === "1" ? "false" : "true"} ? ${+(process.env.CAPSUB || 1)} : 1;
        const capMid = (ring, j, k) => { const a = ring[j], b = ring[(j + 1) % SIDES]; return [a[0] + (b[0] - a[0]) * (k / capSub), a[1] + (b[1] - a[1]) * (k / capSub), a[2] + (b[2] - a[2]) * (k / capSub)]; };
        for (let i = 0; i + 1 < pts.length; i++) {
          const ca = rings[i], cb = rings[i + 1], mx = (ca[4] + cb[4]) / 2, mz = (ca[5] + cb[5]) / 2;
          for (let j = 0; j < SIDES; j++) {
            const n = (j + 1) % SIDES, q = [pts[i][j], pts[i][n], pts[i + 1][n], pts[i + 1][j]];
            // (b119: the band under the cap carries the cap's finer edge points on its top edge, so the two share every point)
            let qp = q; if (capSub > 1 && i + 1 === pts.length - 1) { qp = q.slice(0, 3); for (let k = capSub - 1; k >= 1; k--) qp.push(capMid(pts[i + 1], j, k)); qp.push(q[3]); }
            // fur: each facet stepped down from the fade by up to FURV greys (more where it is light, so the top of the
            // shoulder is mottled too), with darker streaks running down some columns
            const base = (greyAt[i] + greyAt[i + 1]) / 2, FURV = +(${FURV}), streak = h(99, j) < 0.3 ? 1.4 : 0;
            // b48: more fur in the colour: clumps a few facets across lighter or darker (FURPATCH), streaks that run
            // down a column for a few rings and stop, now and then a light fleck, and each facet its own brightness
            const patch = (h(i >> 1, (j >> 1) + 40) - 0.5) * ${FURPATCH} + (h(i >> 2, (j >> 2) + 60) - 0.5) * ${FURPATCH} * 0.6;
            const run = h(j + 13, i >> 2) < 0.28 ? 1 : 0, fleck = h(j + 77, i + 5) < 0.1 ? 1 : 0;
            // (stronger where the fur is dark, which otherwise hides it)
            // b49: the lower arm's look carried up over the upper arm and shoulder: where the fur is light the big clumps
            // give way to the same fine speckle (each facet its own, about as many greys as on the dark forearm, in
            // proportion), with dark streaks and dark flecks showing through the silver as the light ones do in the black
            const dk = 1 + Math.max(0, 4 - base) * 0.25, light = Math.max(0, Math.min(1, (base - 3) / 5));
            const speck = (h(i + 21, j + 7) - 0.5) * 2.2 * (0.6 + 0.8 * light);
            // b65: the light tops mottled more, not less: clumps of lighter and darker grey across the silver (TOPMOTTLE)
            // (b65: by height on a shoulder or thigh, its top always mottled however dark the grey there: TOPW)
            const topness = P.loft.upper ? Math.max(0, Math.min(1, (i / (pts.length - 1) - 0.5) / 0.4)) : 0, topW = Math.max(light, ${+(process.env.TOPW || 0.9)} * topness);
            // b92: no sudden breaks: the patches are smooth noise (blended between neighbouring facets, round the arm
            // and up it) rather than a fresh jump each facet, and the silver hairs and dark flecks are gentle
            const mottle = topMottle(i, j, topW, topness);
            let g = base + 0.3 + patch * dk * (1 - 0.3 * light) + speck * light * (1 + 0.8 * light) + mottle
              - run * (0.7 + 0.5 * h(i, j + 3)) * (1 + light) + fleck * 1.6 * dk * (light > 0.3 ? -1 : 1);
            g += ringSmooth[i] - ringMean[i];
            // (b112: a thigh's top faces up into the light and read brighter than the fur under it, the glutes' tops on all
            // fours most of all: darkened by up to LEGTOPDARK greys toward the top, eased in over its upper half)
            if (/^leg/.test(id)) g -= ${+(process.env.LEGTOPDARK ?? -1)} * topness * topness;
            const f = 1 + (h(i, j) - 0.5) * FURV / 10 * 1.6 - run * 0.05;
            const hex = greyHex(g), col = "#" + [1, 3, 5].map((n) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(n, n + 2), 16) * f))).toString(16).padStart(2, "0")).join("");
            // fur tufts (b32): on about TUFTS of the facets, a small block stands out of the surface, square to the arm,
            // half sunk, its colour the facet's a shade lighter or darker
            if (h(i + 50, j + 50) < ${TUFTS} && i > 0) {
              const cx0 = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy0 = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4, cz0 = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
              // fewer, uneven, barely out: each its own size on each axis, set off the facet's middle at random, standing
              // out only a few hundredths of a block
              const ox = cx0 - (mx + o[0]) * CELL, oz = cz0 - (mz + o[2]) * CELL, ol = Math.hypot(ox, oz) || 1, out = CELL * (0.01 + 0.05 * h(i + 7, j + 2));
              const E = [0.12 + 0.22 * h(j, i + 9), 0.1 + 0.25 * h(j + 4, i + 1), 0.12 + 0.22 * h(j + 8, i + 3)].map((v) => v * CELL);
              const sx = (h(i + 11, j) - 0.5) * 0.5, sy = (h(i, j + 11) - 0.5) * 0.5;
              const c = [cx0 + ox / ol * out + (q[1][0] - q[0][0]) * sx, cy0 + (q[3][1] - q[0][1]) * sy, cz0 + oz / ol * out + (q[1][2] - q[0][2]) * sx], k = 1 + (h(i + 3, j + 5) - 0.5) * 0.25, tc = "#" + [1, 3, 5].map((n) => Math.max(0, Math.min(255, Math.round(parseInt(col.slice(n, n + 2), 16) * k))).toString(16).padStart(2, "0")).join("");
              for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
                const u = (ax + 1) % 3, v = (ax + 2) % 3, corner = (a, b) => { const p = c.slice(); p[ax] += sg * E[ax]; p[u] += a * E[u]; p[v] += b * E[v]; return p; };
                const nrm = [0, 0, 0]; nrm[ax] = sg;
                BL.heroBody.poly(geo, [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], tc, nrm);
              }
            }
            const nrm = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4 - (mx + o[0]) * CELL, 0, (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 - (mz + o[2]) * CELL];
            // b51: spots are whole facets, a few lighter or darker than those round them (scattered by a sine hash, so
            // never in rows); in the code form those same facets glow green
            // (b52: mirrored left to right: the left arm's column j is the right arm's mirror column, so both arms carry
            // the same spots in mirror image, never more on one)
            const hs = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233 + id.length * 3.7 + (hseed ? 1.3 : 0)) * 43758.5453; return v - Math.floor(v); };
            const jm = id.endsWith("L") && ${process.env.MIRRORCOL === "1"} ? ((SIDES / 2 - 1 - j) % SIDES + SIDES) % SIDES : j;
            const spot = hs(i, jm) < ${SPOTS} && i > 0 && (form !== "code" || ${process.env.RAIN === "0"});
            const rn = true;
            if (spot && form === "code") BL.heroBody.poly(geo, qp, "#4be040", nrm, 0.9);
            else if (spot) BL.heroBody.poly(geo, qp, greyHex(g + (hs(i + 7, jm + 71) < 0.55 ? 1.6 : -1.4)), nrm);
            // (b52: in the code form a facet glows as the body's blocks of its grey do (GLOW, eased between greys), so
            // the arms light up like the rest)
            else if (form === "code") { const gv = Math.max(0, Math.min(codeTop, g)), a = Math.floor(gv), b = Math.min(11, a + 1); BL.heroBody.poly(geo, qp, col, nrm, Math.min(1, ${LIMBGLOW} * (GLOW[a] + (GLOW[b] - GLOW[a]) * (gv - a)) + 0.1)); rainFacet(j, q, nrm, ringY(i), ringY(i + 1)); }
            else BL.heroBody.poly(geo, qp, col, nrm);
          }
        }
        // fur fringes (b50): at each fringe height, a ring of thin pointed tufts hanging from the surface, each its own
        // length (0.45 to 1.1 blocks) and a little proud of it, a shade darker than the fur there, so the seam reads as
        // shaggy fur over the part below
        // fur seams (b50), sparse, as the wrist's: at each seam, a small spike or two at each of the arm's four corners
        // (where its rounded-square section turns), each a short pointed facet lying almost flush, pointing down, in the
        // fur's own colour; nothing in between
        for (const fy of P.loft.fringes || []) {
          let i = 0; while (i < rings.length - 2 && rings[i + 1][0] < fy) i++;
          const R = rings[i], gr = greyAt[i], k2 = Math.round(fy * 10);
          const at = (th, yy, out) => { const c = Math.cos(th), s2 = Math.sin(th), r = Math.pow(Math.pow(Math.abs(c), SE) + Math.pow(Math.abs(s2), SE), -1 / SE);
            return [(R[4] + (R[1] * r + out) * c + o[0]) * CELL, (yy + o[1]) * CELL, (R[5] + (R[2] * r + out) * s2 + o[2]) * CELL]; };
          for (let q = 0; q < 4; q++) for (let m = 0; m < 2; m++) {
            if (m === 1 && h(q, k2) < 0.5) continue;                          // a second spike only at some corners
            const thc = Math.PI / 4 + (q * Math.PI) / 2 + (m ? 0.14 : -0.06) + (h(q + 9, k2 + m) - 0.5) * 0.12;
            const w = 0.07 + 0.04 * h(q, k2 + 5 + m), L = 0.35 + 0.3 * h(q + 3, k2 + m), y0 = fy + (m ? 0.15 : 0);
            const tip = at(thc + (h(q, k2 + 7) - 0.5) * 0.05, y0 - L, 0.05);
            BL.heroBody.poly(geo, [at(thc - w, y0, 0.03), at(thc + w, y0, 0.03), tip], greyHex(gr - 0.2 + (h(q + 5, k2 + m) - 0.5) * 0.6), [Math.cos(thc), 0, Math.sin(thc)]);
          }
        }
        // the cap over the top and the ring at the bottom closed
        const last = pts.length - 1;
        // b65: the top closed by facets, not one flat face: an inner ring at half the radius, a little raised, then a fan
        // to the middle, each facet its own fur grey (clumps, speckle, the odd light or dark fleck), so the flat tops of the
        // shoulders and thighs are mottled like the rest
        if (${process.env.PLAINCAP === "1" ? "false" : "true"}) {
          const top = pts[last], cx = top.reduce((a, p) => a + p[0], 0) / SIDES, cy = top.reduce((a, p) => a + p[1], 0) / SIDES, cz = top.reduce((a, p) => a + p[2], 0) / SIDES;
          const rise = CELL * (/^leg/.test(id) ? ${+(process.env.LEGCAPRISE || 0.7)} : ${+(process.env.CAPRISE || 0.25)}), inner = top.map((p) => [cx + (p[0] - cx) * 0.5, cy + rise * 0.7, cz + (p[2] - cz) * 0.5]), mid = [cx, cy + rise, cz];
          const base = greyAt[last], light = Math.max(0, Math.min(1, (base - 3) / 5));
          // (b92: coloured as the rings round it are, continuing them over the top: no separate disc of colour)
          let capShift = 0; const capG = (ii, j) => { const dk = 1 + Math.max(0, 4 - base) * 0.25, patch = (h(ii >> 1, (j >> 1) + 40) - 0.5) * ${FURPATCH} + (h(ii >> 2, (j >> 2) + 60) - 0.5) * ${FURPATCH} * 0.6;
            const speck = (h(ii + 21, j + 7) - 0.5) * 2.2 * (0.6 + 0.8 * light), topW = Math.max(light, ${+(process.env.TOPW || 0.9)});
            return base + 0.3 + patch * dk * (1 - 0.3 * light) + speck * light * (1 + 0.8 * light) + topMottle(ii, j, topW, 1); };
          const capGrey = (ii, j) => { const dk = 1 + Math.max(0, 4 - base) * 0.25, patch = (h(ii >> 1, (j >> 1) + 40) - 0.5) * ${FURPATCH} + (h(ii >> 2, (j >> 2) + 60) - 0.5) * ${FURPATCH} * 0.6;
            const speck = (h(ii + 21, j + 7) - 0.5) * 2.2 * (0.6 + 0.8 * light), topW = Math.max(light, ${+(process.env.TOPW || 0.9)});
            const g = capG(ii, j) + capShift - (/^leg/.test(id) ? ${+(process.env.LEGTOPDARK ?? -1)} : 0);
            const f = 1 + (h(ii, j) - 0.5) * ${FURV} / 10 * 1.6, hex = greyHex(g);
            return "#" + [1, 3, 5].map((n) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(n, n + 2), 16) * f))).toString(16).padStart(2, "0")).join(""); };
          { let sm = 0; for (const ii of [last + 1, last + 2]) for (let j = 0; j < SIDES; j++) sm += capG(ii, j) - base; capShift = meanAll - sm / (2 * SIDES); }
          // b121: in the glyph form the cap glows as the facets round it do (its grey's GLOW, eased between greys, as the
          // side's), so the top of a shoulder or thigh is no darker than its sides; the grey form takes none, as before
          const capE = (ii, j) => { if (form !== "code") return 0; const gv = Math.max(0, Math.min(codeTop, capG(ii, j) + capShift - (/^leg/.test(id) ? ${+(process.env.LEGTOPDARK ?? -1)} : 0))), a = Math.floor(gv), b = Math.min(11, a + 1);
            return Math.min(1, ${LIMBGLOW} * (GLOW[a] + (GLOW[b] - GLOW[a]) * (gv - a)) + 0.1); };
          // b118: tiled, not a fan of triangles to one centre point (a pinwheel on the shoulder's and thigh's top): an N x N
          // grid of quads (N = SIDES / 4) whose edge points are the top ring's own, in order, so it joins the side without a
          // crack; each inner point laid between the centre and the ring at its angle and domed up by CAPRISE toward the middle
          // (b133: a thigh's top, the top of the glute, one flat face in the ring's mean shade: the tiles' corners read as four
          // arrows pointing in)
          // (b134: raised on one ring of slanted faces, GLUEIN of the way in and GLUERISE blocks up, so the top rounds over
          // into the flat piece instead of being cut off at the rim)
          if (/^leg/.test(id) && ${process.env.FLATGLUTE === "1"}) { let cs = [0, 0, 0], es = 0; for (let j = 0; j < SIDES; j++) { const h = capGrey(last + 1, j), v = [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16)); cs = cs.map((c, n) => c + v[n]); es += capE(last + 1, j); }
            const GI = ${+(process.env.GLUEIN ?? 0.3)}, GR = CELL * ${+(process.env.GLUERISE ?? 0.9)}, inn = top.map((p) => [cx + (p[0] - cx) * (1 - GI), p[1] + GR, cz + (p[2] - cz) * (1 - GI)]);
            for (let j = 0; j < SIDES; j++) { const n = (j + 1) % SIDES, mx = (top[j][0] + top[n][0]) / 2 - cx, mz = (top[j][2] + top[n][2]) / 2 - cz, ml = Math.hypot(mx, mz) || 1;
              BL.heroBody.poly(geo, [top[j], top[n], inn[n], inn[j]], capGrey(last + 1, j), [mx / ml, 1, mz / ml], capE(last + 1, j)); }
            BL.heroBody.poly(geo, inn, "#" + cs.map((c) => Math.round(c / SIDES).toString(16).padStart(2, "0")).join(""), [0, 1, 0], es / SIDES); }
          else if (SIDES % 4 === 0 && ${process.env.TILECAP !== "0"}) { const N = SIDES / 4, G = [];
            const ang = (p) => Math.atan2(p[2] - cz, p[0] - cx), perim = [];
            for (let k = 0; k < N; k++) perim.push([-1 + 2 * k / N, -1]); for (let k = 0; k < N; k++) perim.push([1, -1 + 2 * k / N]);
            for (let k = 0; k < N; k++) perim.push([1 - 2 * k / N, 1]); for (let k = 0; k < N; k++) perim.push([-1, 1 - 2 * k / N]);
            // (the ring's direction round and the square's matched, then its start: the shift that best lines their angles up)
            const dir = (() => { let d = 0; for (let j = 0; j < SIDES; j++) { let x = ang(top[(j + 1) % SIDES]) - ang(top[j]); x = ((x + Math.PI * 3) % (Math.PI * 2)) - Math.PI; d += x; } return d >= 0 ? 1 : -1; })();
            const pa = perim.map(([u, v]) => Math.atan2(v, u) * dir); let best = 0, be = 1e9;
            for (let sft = 0; sft < SIDES; sft++) { let e = 0; for (let k = 0; k < SIDES; k++) { let x = ang(top[(k + sft) % SIDES]) - pa[k]; x = ((x + Math.PI * 3) % (Math.PI * 2)) - Math.PI; e += x * x; } if (e < be) { be = e; best = sft; } }
            const S = capSub, M = N * S, edgeAt = new Map();
            // (b119: the middle stands over the ring's highest point, not its mean: on a slanted top the high edge otherwise
            // stood over the middle as a peak; CAPTOP 0 keeps the mean)
            const topY = cy + (Math.max(...top.map((p) => p[1])) - cy) * ${+(process.env.CAPTOP ?? 1)};
            for (let k = 0; k < 4 * M; k++) { const sd = Math.floor(k / M), t = k % M, gi = sd === 0 ? t : sd === 1 ? M : sd === 2 ? M - t : 0, gj = sd === 0 ? 0 : sd === 1 ? t : sd === 2 ? M : M - t;
              const r = (Math.floor(k / S) + best) % SIDES, f = k % S; edgeAt.set(gi + "," + gj, f ? capMid(top, r, f) : top[r]); }
            const ringAt = (phi, ring = top) => { const top = ring; let bj = 0, bd = 1e9; for (let j = 0; j < SIDES; j++) { let x = ang(top[j]) - phi; x = Math.abs(((x + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (x < bd) { bd = x; bj = j; } }
              const a0 = ang(top[bj]), j2 = (bj + 1) % SIDES, j0 = (bj + SIDES - 1) % SIDES; let x = phi - a0; x = ((x + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
              const jn = (x * dir >= 0) ? j2 : j0, a1 = ang(top[jn]); let span = a1 - a0; span = Math.abs(((span + Math.PI * 3) % (Math.PI * 2)) - Math.PI) || 1e-6; const f = Math.min(1, Math.abs(x) / span);
              return [0, 1, 2].map((m) => top[bj][m] + (top[jn][m] - top[bj][m]) * f); };
            for (let gi = 0; gi <= M; gi++) { G.push([]); for (let gj = 0; gj <= M; gj++) { const key = gi + "," + gj;
              if (edgeAt.has(key)) { G[gi].push(edgeAt.get(key)); continue; }
              const u = -1 + 2 * gi / M, v = -1 + 2 * gj / M, du = u * Math.sqrt(1 - v * v / 2), dv = v * Math.sqrt(1 - u * u / 2); G[gi].push(capAt(Math.min(1, Math.hypot(du, dv)), Math.atan2(dv, du) * dir)); } }
            function capAt(rho, phi) { const rp = ringAt(phi);
              // (b118: the dome as a curve leaving the edge along the side's own slope there (from the ring below, at this
              // angle) and coming level at the middle, CAPH of the radius high: no bend where it meets the side)
              if (${process.env.CAPSMOOTH !== "0"}) { const prev = pts[Math.max(0, last - 1)], pcx = prev.reduce((a, p) => a + p[0], 0) / SIDES, pcz = prev.reduce((a, p) => a + p[2], 0) / SIDES, pp = ringAt(phi, prev);
                const R0 = Math.hypot(rp[0] - cx, rp[2] - cz) || 1e-6, ex = (rp[0] - cx) / R0, ez = (rp[2] - cz) / R0;
                let dr = R0 - Math.hypot(pp[0] - pcx, pp[2] - pcz), dy = Math.max(1e-6, rp[1] - pp[1]); const dl = Math.hypot(dr, dy); dr /= dl; dy /= dl;
                const H = rise, T = Math.min(R0, H * ${+(process.env.CAPT || 2.5)}), uu = Math.min(1, (1 - rho) / (1 - ${+(process.env.CAPFLAT ?? 0.6)})), h10 = uu * uu * uu - 2 * uu * uu + uu, h01 = -2 * uu * uu * uu + 3 * uu * uu, h11 = uu * uu * uu - uu * uu, h00 = 2 * uu * uu * uu - 3 * uu * uu + 1;
                const Rr = h00 * R0 + h10 * T * dr + h11 * -T, Yr = h10 * T * dy + h01 * H, base = rp[1] + (topY - rp[1]) * h01;
                return [cx + ex * Rr, base + Yr, cz + ez * Rr]; }
              return [cx + (rp[0] - cx) * rho, cy + (rp[1] - cy) * rho + rise * (1 - rho * rho), cz + (rp[2] - cz) * rho]; }
            // b135: on a thigh the cap in rings round its middle instead of the square grid, whose four corners stretched over
            // the round top into four wedges pointing in: the same curve (capAt) at the grid's own ring steps, one ring of quads
            // a step from the edge (its outer edge the top ring's own points), and one flat piece over the innermost ring
            // (b141: every shoulder and thigh top, RINGCAP: the side's own columns carried on up over the top in rings, one a
            // side ring's height apart along the dome, so the pattern runs on unchanged; the last ring small, closed by a
            // flat piece no bigger than a facet, so it ends round rather than in a point or a change of pattern)
            const ringCap = ${process.env.RINGCAP !== "0"}, polar = ringCap || (/^leg/.test(id) && ${process.env.GLUEPOLAR === "1"});
            if (polar) { const rIn = 1 - ${+(process.env.CAPFLAT ?? 0.6)}, ringPts = [top.slice()]; let K;
              if (ringCap) {
                let sp = 0; const prev = pts[Math.max(0, last - 1)]; for (let j = 0; j < SIDES; j++) sp += Math.hypot(top[j][0] - prev[j][0], top[j][1] - prev[j][1], top[j][2] - prev[j][2]); sp = sp / SIDES * ${+(process.env.RINGSTEP ?? 1)};
                // the dome's profile, averaged round it: arc length and radius at each step of rho from the rim in
                const NS = 96, rh = [], arc = [0], rad = []; for (let k = 0; k <= NS; k++) { const rho = 1 - (1 - rIn) * k / NS; rh.push(rho); let x = 0, y = 0, rr = 0; const pp = top.map((p) => capAt(rho, Math.atan2(p[2] - cz, p[0] - cx)));
                  for (const p of pp) rr += Math.hypot(p[0] - cx, p[2] - cz); rad.push(rr / SIDES); if (k) { let d = 0; const qq = top.map((p) => capAt(rh[k - 1], Math.atan2(p[2] - cz, p[0] - cx))); for (let j = 0; j < SIDES; j++) d += Math.hypot(pp[j][0] - qq[j][0], pp[j][1] - qq[j][1], pp[j][2] - qq[j][2]); arc.push(arc[k - 1] + d / SIDES); } }
                const end = ${+(process.env.RINGEND ?? 0.55)} * sp; let kk = 0;
                for (let n = 1; ; n++) { while (kk < NS && arc[kk] < n * sp) kk++; if (kk >= NS || rad[kk] < end) break; ringPts.push(top.map((p) => capAt(rh[kk], Math.atan2(p[2] - cz, p[0] - cx)))); }
                // the last ring at a radius about half a facet, wherever the steps left off
                { let k2 = 0; while (k2 < NS && rad[k2] > end) k2++; if (ringPts.length === 1 || rad[k2] < rad[Math.max(0, kk - 1)] * 0.8) ringPts.push(top.map((p) => capAt(rh[k2], Math.atan2(p[2] - cz, p[0] - cx)))); }
                K = ringPts.length;
              } else { K = Math.max(2, Math.floor(M / 2)); for (let k = 1; k < K; k++) ringPts.push(top.map((p) => capAt(1 - (1 - rIn) * k / (K - 1), Math.atan2(p[2] - cz, p[0] - cx)))); }
              const c0 = geo.faces.length;
              if (!ringCap) for (let k = 0; k + 1 < K; k++) for (let j = 0; j < SIDES; j++) { const n = (j + 1) % SIDES; BL.heroBody.poly(geo, [ringPts[k][j], ringPts[k][n], ringPts[k + 1][n], ringPts[k + 1][j]], capGrey(last + 1 + k, j), [0, 1, 0], capE(last + 1 + k, j)); }
              // (b144: a ring cap in pieces about as square as the side's: as the rings close in, neighbouring columns join
              // in pairs (STEP 1, 2, 4, 8 of the 24) once a piece would be narrower than CAPSQ of its height; a piece whose
              // outer edge is the finer ring's keeps that ring's points along it, so nothing cracks. Then one flat piece.
              // Each piece is marked with the cap's middle and radius, for DOMEEVEN to light it flat as the side's are)
              if (ringCap) { let cp = 1;
                for (let k = 0; k + 1 < K; k++) { const A = ringPts[k], B = ringPts[k + 1];
                  let hgt = 0, circ = 0; for (let j = 0; j < SIDES; j++) { hgt += Math.hypot(A[j][0] - B[j][0], A[j][1] - B[j][1], A[j][2] - B[j][2]); const n = (j + 1) % SIDES; circ += Math.hypot(B[j][0] - B[n][0], B[j][1] - B[n][1], B[j][2] - B[n][2]); } hgt /= SIDES;
                  let c = cp; while (c < 8 && SIDES % (c * 2) === 0 && circ * c / SIDES < ${+(process.env.CAPSQ ?? 0.6)} * hgt) c *= 2;
                  for (let j = 0; j < SIDES; j += c) { const pp = []; for (let q = 0; q <= c; q += cp) pp.push(A[(j + q) % SIDES]); pp.push(B[(j + c) % SIDES], B[j]); const jc = (j + (c >> 1)) % SIDES; BL.heroBody.poly(geo, pp, capGrey(last + 1 + k, jc), [0, 1, 0], capE(last + 1 + k, jc)); }
                  cp = c; }
                // (b145: each tile its own fur shade, as the side's facets are; the middle piece its ring's mean)
                const inner = []; let ic = [0, 0, 0], ie = 0; for (let j = 0; j < SIDES; j += cp) { inner.push(ringPts[K - 1][j]); const v = [1, 3, 5].map((n) => parseInt(capGrey(last + K, j).slice(n, n + 2), 16)); ic = ic.map((c, n) => c + v[n]); ie += capE(last + K, j); }
                BL.heroBody.poly(geo, inner, "#" + ic.map((c) => Math.round(c / inner.length).toString(16).padStart(2, "0")).join(""), [0, 1, 0], ie / inner.length);
                const R = top.reduce((a, p) => a + Math.hypot(p[0] - cx, p[2] - cz), 0) / SIDES; for (let f = c0; f < geo.faces.length; f++) geo.faces[f].ringCap = [cx, cz, R];
                // (b168: the code rain's lanes run on up over the dome, each lane on its own column's strip of every ring)
                const capY = [ringY(rings.length - 1)]; for (let k = 0; k + 1 < K; k++) { let d = 0; for (let j = 0; j < SIDES; j++) d += Math.hypot(ringPts[k][j][0] - ringPts[k + 1][j][0], ringPts[k][j][1] - ringPts[k + 1][j][1], ringPts[k][j][2] - ringPts[k + 1][j][2]); capY.push(capY[k] + d / SIDES / CELL); }
                if (rainOn) for (let k = 0; k + 1 < K; k++) for (let j = 0; j < SIDES; j++) { const n = (j + 1) % SIDES, q = [ringPts[k][j], ringPts[k][n], ringPts[k + 1][n], ringPts[k + 1][j]];
                  const e1 = [0, 1, 2].map((m) => q[1][m] - q[0][m]), e2 = [0, 1, 2].map((m) => q[3][m] - q[0][m]); let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                  const mid = [0, 1, 2].map((m) => (q[0][m] + q[2][m]) / 2); if (nrm[0] * (mid[0] - cx) + nrm[2] * (mid[2] - cz) + nrm[1] < 0) nrm = nrm.map((v) => -v);
                  rainFacet(j, q, nrm, capY[k], capY[k + 1]); } } else {
              let cs = [0, 0, 0], es = 0; for (let j = 0; j < SIDES; j++) { const h = capGrey(last + K, j), v = [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16)); cs = cs.map((c, n) => c + v[n]); es += capE(last + K, j); }
              // (as triangles to its own middle, all one colour and in one plane, so its light runs evenly from the middle out)
              const inner = ringPts[K - 1], mc = [0, 1, 2].map((m) => inner.reduce((a, p) => a + p[m], 0) / SIDES), hexC = "#" + cs.map((c) => Math.round(c / SIDES).toString(16).padStart(2, "0")).join("");
              for (let j = 0; j < SIDES; j++) { const n0 = geo.faces.length; BL.heroBody.poly(geo, [inner[j], inner[(j + 1) % SIDES], mc], hexC, [0, 1, 0], es / SIDES); for (let f = n0; f < geo.faces.length; f++) geo.faces[f].capMid = true; } } }
            // (b135: on a thigh the four tiles at the very middle, which met there as four arrows, are one flat piece over the
            // same eight points instead; every other tile is as it was)
            const midOne = !polar && /^leg/.test(id) && ${process.env.GLUEMID === "1"} && M % 2 === 0, c0 = M / 2 - 1, c1 = M / 2 + 1;
            if (midOne) { let cs = [0, 0, 0], es = 0; const ring = (M / 2 - 0.5) / S; for (let k = 0; k < 4; k++) { const h = capGrey(last + 1 + Math.floor(ring), k * SIDES / 4), v = [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16)); cs = cs.map((c, n) => c + v[n]); es += capE(last + 1 + Math.floor(ring), k * SIDES / 4); }
              BL.heroBody.poly(geo, [G[c0][c0], G[c0 + 1][c0], G[c1][c0], G[c1][c0 + 1], G[c1][c1], G[c0 + 1][c1], G[c0][c1], G[c0][c0 + 1]], "#" + cs.map((c) => Math.round(c / 4).toString(16).padStart(2, "0")).join(""), [0, 1, 0], es / 4); }
            for (let gi = 0; gi < M; gi++) for (let gj = 0; gj < M; gj++) { if (polar || (midOne && gi >= c0 && gi < c1 && gj >= c0 && gj < c1)) continue; const q = [G[gi][gj], G[gi + 1][gj], G[gi + 1][gj + 1], G[gi][gj + 1]], ring = (M / 2 - Math.max(Math.abs(gi + 0.5 - M / 2), Math.abs(gj + 0.5 - M / 2))) / S;
              const mx = (q[0][0] + q[2][0]) / 2, mz = (q[0][2] + q[2][2]) / 2, j = ((Math.round((Math.atan2(mz - cz, mx - cx) / (Math.PI * 2)) * SIDES) % SIDES) + SIDES) % SIDES;
              BL.heroBody.poly(geo, q, capGrey(last + 1 + Math.floor(ring), j), [0, 1, 0], capE(last + 1 + Math.floor(ring), j)); }
          } else for (let j = 0; j < SIDES; j++) { const n = (j + 1) % SIDES;
            BL.heroBody.poly(geo, [top[j], top[n], inner[n], inner[j]], capGrey(last + 1, j), [0, 1, 0], capE(last + 1, j));
            BL.heroBody.poly(geo, [inner[j], inner[n], mid], capGrey(last + 2, j), [0, 1, 0], capE(last + 2, j)); }
        } else BL.heroBody.poly(geo, pts[last], greyHex(greyAt[last]), [0, 1, 0]);
        BL.heroBody.poly(geo, pts[0], greyHex(greyAt[0]), [0, -1, 0]);
        g = merge(g, geo);
      }
      if (P.fist) {
        // the fist (b42, b44): the Ooga's, scaled evenly so its wrist (1.25 round) is exactly the forearm's bottom, coloured as the forearm's
        // lowest facets are, and turned FISTTURN degrees about the wrist's cross axis so its knuckles face forward and
        // its fingers curl under; its top tucked half a block up into the forearm, centred under it
        const F = P.fist, base = P.loft ? P.loft.greys[0] : 2;
        const col = (() => { const v = Math.max(0, Math.min(11, base + 0.3)), a = Math.floor(v), b = Math.min(11, a + 1), t = v - a, ha = pal.palette[a], hb = pal.palette[b];
          return "#" + [1, 3, 5].map((n) => Math.round(parseInt(ha.slice(n, n + 2), 16) * (1 - t) + parseInt(hb.slice(n, n + 2), 16) * t).toString(16).padStart(2, "0")).join(""); })();
        const h = BL.heroBody.hand(F.side, ${process.env.FISTDEBUG ? '"#d8d8d8"' : 'col'}, 1, [1.25, 1.25, 0.4], false, 0, ${JSON.stringify(THUMBMODE)}), V = h.verts, k = F.hx / 1.25 * ${FISTSCALE};
        const th = ${FISTTURN} * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
        for (let i = 0; i < V.length; i += 3) { const y = V[i + 1], z = V[i + 2]; V[i + 1] = y * c - z * sn; V[i + 2] = y * sn + z * c; }
        // knuckle-walking (b43): the Ooga's fist already has its knuckles at the bottom; turned FISTYAW (180) about the
        // vertical, its back faces forward, its palm and curled fingers back, and its thumb sits on the back inner side
        const yaw = ${FISTYAW} * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
        for (let i = 0; i < V.length; i += 3) { const x = V[i], z = V[i + 2]; V[i] = x * cy + z * sy; V[i + 2] = -x * sy + z * cy; }
        let top = -1e9, bot = 1e9, cx = 0, cz = 0, n = 0; for (let i = 0; i < V.length; i += 3) { top = Math.max(top, V[i + 1]); bot = Math.min(bot, V[i + 1]); }
        for (let i = 0; i < V.length; i += 3) if (V[i + 1] > top - 0.8) { cx += V[i]; cz += V[i + 2]; n++; }
        // the wrist ring is centred on the hand's own axis (the thumb at that height would pull an average off it)
        cx = 0; cz = 0;
        for (let i = 0; i < V.length; i += 3) {
          V[i] = (F.cx + (V[i] - cx) * k + o[0]) * CELL;
          // its knuckles on the old hand's bottom row (so it reaches the ground with the feet), unless that leaves a gap
          // under the forearm, then hung from the forearm instead
          // hung from the forearm, its top tucked FISTTUCK into it, so no gap; the body stands on its knuckles (FEETAT)
          V[i + 1] = (F.y + ${FISTTUCK} + (V[i + 1] - top) * k + o[1]) * CELL;
          V[i + 2] = (F.cz + (V[i + 2] - cz) * k + o[2]) * CELL;
        }
        // the knuckles' lowest point, so the body is stood on them rather than on a guess (FEET)
        let lowY = 1e9; for (let i = 1; i < V.length; i += 3) lowY = Math.min(lowY, V[i]);
        FEETAT[id] = [(F.cx + o[0]), lowY / CELL, (F.cz + o[2])];
        // (b176: in the glyph form the fist glows as the forearm's lowest facets do, from the same grey (GLOW eased
        // between greys), so the hand is as bright as the arm above it)
        if (form === "code") { const gv = Math.max(0, Math.min(11, base + 0.3)), ga = Math.floor(gv), gb = Math.min(11, ga + 1), e = Math.min(1, ${LIMBGLOW} * (GLOW[ga] + (GLOW[gb] - GLOW[ga]) * (gv - ga)) + 0.1); for (const f of h.faces) f.emissive = Math.max(f.emissive || 0, e); }
        meshRain(h, CELL, P.rain, (p) => { const lx = p[0] / CELL - o[0] - P.rain.cx, lz = p[2] / CELL - o[2] - P.rain.cz; return [p[1] / CELL - o[1] - Math.max(0, Math.hypot(lx, lz) - P.rain.R), Math.atan2(lz, lx)]; });
        g = merge(g, h);
      }
      if (P.foot) {
        // the foot (b53): a faceted gorilla foot in the world's frame (sole flat, toes forward), then carried into the
        // shin's frame: a long body from heel to toes, a big toe set apart on the inner side, and four short toes
        const F = P.foot, A0 = F.ank, [x0, x1, y00, z0, z1] = F.box, y0 = y00 - ${FOOTDROP}, w = x1 - x0, cx = (x0 + x1) / 2, Lz = z1 - z0, H = Math.max(2, F.ank[1] - y0 + 0.8), inn = F.inner;
        const gfoot = ${+(process.env.FOOTSKIN || 2.4)} + 0.3, fcol = (v) => { v = Math.max(0, Math.min(11, v)); const a = Math.floor(v), b = Math.min(11, a + 1), t = v - a, ha = pal.palette[a], hb = pal.palette[b];
          return "#" + [1, 3, 5].map((n) => Math.round(parseInt(ha.slice(n, n + 2), 16) * (1 - t) + parseInt(hb.slice(n, n + 2), 16) * t).toString(16).padStart(2, "0")).join(""); };
        const part = (secs, grey) => {
          // secs: [along z, half width, bottom, top, centre x]; built as a loft along y, then turned so y runs along z
          const L = BL.heroBody.loft(BL.models.geometry(), secs.map(([u, hx, bot, topv, xc]) => [u, hx, (topv - bot) / 2, 0.38 * Math.min(hx, (topv - bot) / 2), xc, (topv + bot) / 2]), fcol(grey));
          const V = L.verts; for (let i = 0; i < V.length; i += 3) { const a = V[i + 1]; V[i + 1] = V[i + 2]; V[i + 2] = a; }
          for (const f of L.faces) f.i.reverse();
          return L;
        };
        // b55: the foot rebuilt from photos of gorilla feet and the life cast of a male's (31.8 x 16.5 cm): plantigrade,
        // about twice as long as it is wide; a broad, rounded heel set well behind the ankle; a long flat sole; the big
        // toe, thick and thumb-like, branching off the inner side behind the ball and angled away (HALLUX degrees); a
        // deep cleft between it and four short, thick toes bunched together and curled down to the ground, the middle
        // one longest; bare dark skin with flat nails. Sizes in blocks, from the ankle.
        // (b181: the front of the foot and the toes were flat: the foot's front sections FOOTTHICK times taller (the ball,
        // the knuckle and the tip of the forefoot), and the toes, their nails and the big toe TOETHICK times taller, about the sole)
        const FT = ${+(process.env.FOOTTHICK ?? 1.3)}, TT = ${+(process.env.TOETHICK ?? 1.35)};
        const S = ${+(process.env.FOOTSIZE || 1)}, fx = A0[0], zh = A0[2] - 2.6 * S, zb = zh + 7.0 * S, HS = ${+(process.env.HALLUX || 28)} * Math.PI / 180;
        const body = part([[zh, 1.35 * S, y0 + 0.4, y0 + H * 0.7, fx], [zh + 0.55 * S, 1.75 * S, y0 + 0.05, y0 + H * 0.92, fx], [zh + 2.6 * S, 1.85 * S, y0, y0 + H, fx],
          [zh + 4.8 * S, 2.05 * S, y0, y0 + H * Math.min(0.95, 0.6 * FT), fx - inn * 0.2 * S], [zb, 2.0 * S, y0, y0 + H * 0.42 * FT, fx - inn * 0.35 * S], [zb + 0.45 * S, 1.75 * S, y0 + 0.08, y0 + H * 0.3 * FT, fx - inn * 0.4 * S]], gfoot);
        // a digit along its own axis from its base (bx, bz), turned ang radians toward the inner side
        const digit = (bx, bz, ang, secs, grey) => { const L = part(secs.map(([u, hw, b, t]) => [u, hw, b, t, 0]), grey), V = L.verts, c = Math.cos(ang), sn = Math.sin(ang);
          for (let i = 0; i < V.length; i += 3) { const x = V[i], u = V[i + 2]; V[i] = bx + x * c + u * inn * sn; V[i + 2] = bz - x * inn * sn + u * c; }
          return L; };
        const toe = (len, r, b, t) => [[0, r, b + 0.2 * S, t], [0.45 * len, r * 0.98, b + 0.12 * S, t + 0.08 * S], [0.82 * len, r * 0.86, b, t - 0.3 * S], [len, r * 0.55, b + 0.06 * S, b + 0.48 * S]];
        // the ankle (b55): a round collar rising from the foot into the shin, centred on the ankle and as wide as the
        // shin's lowest full ring, in the shin's own fur colour, so the shin always meets the foot whatever its tilt
        const SR = (P.loft ? Math.min(P.loft.sections[0][1], P.loft.sections[0][2]) : 1.5) * ${+(process.env.ANKLEFIT || 1)};
        const collar = BL.heroBody.loft(BL.models.geometry(), [[y0 + H * 0.5, SR, SR, 0.4 * SR, A0[0], A0[2]], [A0[1], SR, SR, 0.4 * SR, A0[0], A0[2]], [A0[1] + 0.5, SR * 0.85, SR * 0.85, 0.4 * SR, A0[0], A0[2]]],
          fcol(Math.min(${+(process.env.ARMTOP || 4.4)}, (P.loft ? P.loft.greys[0] : 2))));
        let gf = merge(body, collar);
        // the four short toes, toe 2 (inner) to toe 5 (outer), splaying a little; the fifth set back
        // (b146: every toe TOELEN longer, and the fifth (outer) toe fuller, PINKYR thick and PINKYLEN long, set back only
        // PINKYBACK, so it fills the outer corner of the foot's knuckle instead of sitting small behind the rest)
        const TL = ${+(process.env.TOELEN ?? 1.475)}, TOES = [[1.3, 1.65 * TL, 0.5, 0.02], [0.4, 1.85 * TL, 0.52, -0.02], [-0.5, 1.7 * TL, 0.49, -0.07], [-1.35, ${+(process.env.PINKYLEN ?? 1.62)} * TL, ${+(process.env.PINKYR ?? 0.5)}, -0.14]];
        // (b170: the toes, from here on, too small to carry the glyphs: the foot's rain stops at them)
        const toeFrom = gf.faces.length, toeV = gf.verts.length;
        for (const [k, [ox, len, r, a]] of TOES.entries()) {
          const bz = zb - (k === 3 ? ${+(process.env.PINKYBACK ?? 0.15)} : k === 0 ? 0.1 : 0) * S - 0.3 * S, bx = fx + inn * ox * S;
          gf = merge(gf, digit(bx, bz, a, toe(len * S, r * S, y0, y0 + 1.05 * S), ${+(process.env.FOOTSKIN || 2.4)}));
          // its flat nail, a shade lighter, over the tip
          gf = merge(gf, digit(bx + inn * Math.sin(a) * (len - 0.3) * S, bz + Math.cos(a) * (len - 0.3) * S, a, [[-0.2 * S, 0.22 * S, y0 + 0.42 * S, y0 + 0.6 * S], [0.25 * S, 0.18 * S, y0 + 0.36 * S, y0 + 0.5 * S]], 4.2));
        }
        // the big toe: from the inner side behind the ball, thick, angled away, its tip a rounded pad on the ground
        // (b153: the big toe brought in a little: HALLUX 28 (was 32) and its base HALLUXIN 1.475 blocks out (was 1.55))
        { const bx = fx + inn * ${+(process.env.HALLUXIN ?? 1.475)} * S, bz = zh + 4.4 * S, len = 3.0 * S;
          gf = merge(gf, digit(bx, bz, HS, [[0, 0.78 * S, y0, y0 + 1.45 * S], [1.2 * S, 0.64 * S, y0, y0 + 1.1 * S], [2.3 * S, 0.62 * S, y0, y0 + 1.0 * S], [len, 0.4 * S, y0 + 0.06 * S, y0 + 0.62 * S]], ${+(process.env.FOOTSKIN || 2.4)}));
          gf = merge(gf, digit(bx + inn * Math.sin(HS) * (len - 0.4 * S), bz + Math.cos(HS) * (len - 0.4 * S), HS, [[-0.25 * S, 0.3 * S, y0 + 0.58 * S, y0 + 0.82 * S], [0.3 * S, 0.24 * S, y0 + 0.48 * S, y0 + 0.68 * S]], 4.2)); }
        // its own part (b53), about the ankle in the world's axes: pose() keeps it level whatever the shin does, so the
        // sole stays flat on the ground standing too
        // (straight down on the foot is the world's down, the foot kept level whatever the shin does; ankY sets it to meet
        // the shin's lanes at the ankle)
        const ankY = qrot(qinv(F.rest), [F.ank[0] - F.joint[0], F.ank[1] - F.joint[1], F.ank[2] - F.joint[2]])[1] - o[1] - F.ank[1];
        { const V = gf.verts; for (let i = toeV; i < V.length; i += 3) V[i + 1] = y0 + (V[i + 1] - y0) * TT; }
        meshRain(gf, 1, P.rain, (p) => { const l = qrot(qinv(F.rest), [p[0] - F.joint[0], p[1] - F.joint[1], p[2] - F.joint[2]]), lx = l[0] - o[0] - P.rain.cx, lz = l[2] - o[2] - P.rain.cz; return [l[1] - o[1] - Math.max(0, Math.hypot(lx, lz) - P.rain.R), Math.atan2(lz, lx), p[1] + ankY]; }, (() => { const fw = qrot(qinv(F.rest), [0, 0, 1]); return Math.atan2(fw[2], fw[0]); })(), toeFrom);
        const V = gf.verts, A = F.ank;
        for (let i = 0; i < V.length; i += 3) { V[i] = (V[i] - A[0]) * CELL; V[i + 1] = (V[i + 1] - A[1]) * CELL; V[i + 2] = (V[i + 2] - A[2]) * CELL; }
        if (form === "code") for (const f of gf.faces) f.emissive = Math.max(f.emissive || 0, 0.25);
        geos[id + "Foot"] = characterGeometry(gf);
        { const seen = new Map(); for (let i = 0; i < V.length; i += 3) { const p = [V[i] / CELL, V[i + 1] / CELL, V[i + 2] / CELL], k = p.map((v) => Math.round(v * 2)).join(","); if (!seen.has(k)) seen.set(k, p); } BOXES[id + "Foot"] = [...seen.values()]; }
        FOOTAT[id] = qrot(qinv(F.rest), [A[0] - F.joint[0], A[1] - F.joint[1], A[2] - F.joint[2]]);
      }
      if (stepFine && stepFine.map.size) g = merge(g, voxelGeometry(stepFine, { unit: CELL / 4, origin, ...pal }));
      if (P.fine.length) { const f = makeVox(); for (const [x0, x1, y0, y1, z0, z1, k] of P.fine) f.fill(x0, x1 - 1, y0, y1 - 1, z0, z1 - 1, k); g = merge(g, voxelGeometry(f, { unit: CELL / 4, origin, ...pal })); }
      if (ink.map.size && !shellTorso) g = merge(g, voxelGeometry(ink, { unit: CELL / 4, origin, palette: ["#000000", "#5ef64a"], emissive: [0, 1] }));
      for (const [key, k, c, along, sign] of headCells) { const m = makeVox(); m.fill(c[0], c[1], c[2], c[3], c[4], c[5], 1); const vg = voxelGeometry(m, { unit: CELL / 4, origin, palette: ["#000000", "#5ef64a"], emissive: [0, 0.95] });
        for (const [ax, size, at] of [[along === "z" ? 2 : 0, RDW, 0], [1, RDL, 0], [along === "z" ? 0 : 2, 0.04, sign]]) { const V = vg.verts; let lo = 1e9, hi = -1e9; for (let i = ax; i < V.length; i += 3) { lo = Math.min(lo, V[i]); hi = Math.max(hi, V[i]); } const mid = at > 0 ? lo : at < 0 ? hi : (lo + hi) / 2, kk = size * CELL / ((hi - lo) || 1); for (let i = ax; i < V.length; i += 3) V[i] = mid + (V[i] - mid) * kk; }
        const off = g.verts.length / 3; g.verts.push(...vg.verts); for (const f of vg.faces) g.faces.push({ ...f, i: f.i.map((i) => i + off), dash: true, rain: key, rainK: k }); }
      if (P.lit && P.lit.length && !shellTorso) {
        const want = new Set(P.lit.map((c) => c.join(","))), N = new Array(g.verts.length).fill(0), V = g.verts;
        for (const f of g.faces) { const i0 = f.i[0], i1 = f.i[1], i2 = f.i[2];
          const ax = V[3*i1]-V[3*i0], ay = V[3*i1+1]-V[3*i0+1], az = V[3*i1+2]-V[3*i0+2], bx = V[3*i2]-V[3*i0], by = V[3*i2+1]-V[3*i0+1], bz = V[3*i2+2]-V[3*i0+2];
          const nz = ax*by - ay*bx, l = Math.hypot(ay*bz - az*by, az*bx - ax*bz, nz); if (!l || nz / l < 0.9) continue;
          let cx = 0, cy = 0; for (const i of f.i) { cx += V[3*i]; cy += V[3*i+1]; } cx /= f.i.length; cy /= f.i.length;
          const cell = [Math.floor(cx / CELL), Math.floor(cy / CELL), Math.round(V[3*i0+2] / CELL) - 1].join(",");
          if (!want.has(cell)) continue;
          for (const i of f.i) { N[3*i] = P.litNormal[0]; N[3*i+1] = P.litNormal[1]; N[3*i+2] = P.litNormal[2]; }
        }
        g.normals = N;
      }
      // b113: the shoulder's and thigh's dome lit evenly. Its facets turned toward the sun caught more of it than the rest,
      // one corner lighter wherever the sun stood. Over the top DOMESPAN of an upper arm or thigh each face's lighting
      // normal is eased toward the limb's axis (fully over the closed top, easing out down the side), so the dome takes
      // the same light all round from any direction; the shape and its facets are unchanged
      if (/^(arm|leg)/.test(id) && ${process.env.DOMEEVEN !== "0"}) { const V = g.verts, N = g.normals || new Array(V.length).fill(0); let y0 = 1e9, y1 = -1e9;
        for (let i = 1; i < V.length; i += 3) { y0 = Math.min(y0, V[i]); y1 = Math.max(y1, V[i]); }
        const span = (y1 - y0) * ${+(process.env.DOMESPAN || 0.3)}, K = ${+(process.env.DOMEK || 0.85)};
        // (eased toward facing straight out from the limb, as its side below does, not toward its axis: up is where the
        // sky lights brightest, so a dome turned up stayed the light part)
        // (b145: a face lit facing further up than the side does (its lighting normal's up part over the side's, (1 - K)
        // against K out) takes more of the sky and the sun, and read as a highlight on the top; its colour is dimmed by
        // UPCOMP of that excess, so the whole shoulder or thigh reads as one colour, the top no lighter than the side; the
        // glyph form keeps its colours, its caps already matching the sides' green)
        // (b187: UPCOMP 0: the dimming left the tops dark wherever they don't face the sky, the thighs' tops at the butt
        // sitting, the shoulders' lying; the tops keep the side's colour and take whatever light their pose gives them)
        const ny0 = (1 - K) / Math.hypot(K, 1 - K), upComp = (f, ny) => { const ex = Math.max(0, (ny - ny0) / (1 - ny0)); if (!ex || !f.color || form === "code") return; const k = 1 - ${+(process.env.UPCOMP ?? 0)} * ex; f.color = f.color.map((c, n) => n < 3 ? c * k : c); };
        let ax = 0, az = 0, an = 0; for (let i = 0; i < V.length; i += 3) if (V[i + 1] > y1 - span) { ax += V[i]; az += V[i + 2]; an++; } ax /= an; az /= an;
        for (const f of g.faces) { let cy = 0, nx = 0, ny = 0, nz = 0; for (let k = 0; k < f.i.length; k++) { const a = f.i[k] * 3, b = f.i[(k + 1) % f.i.length] * 3; cy += V[a + 1];
            nx += (V[a + 1] - V[b + 1]) * (V[a + 2] + V[b + 2]); ny += (V[a + 2] - V[b + 2]) * (V[a] + V[b]); nz += (V[a] - V[b]) * (V[a + 1] + V[b + 1]); }
          cy /= f.i.length; const x = Math.max(0, Math.min(1, (cy - (y1 - span)) / span)), w = K * x * x * (3 - 2 * x), l = Math.hypot(nx, ny, nz); if (!w || !l || ny / l < -0.2) continue;
          let cx = 0, cz = 0; for (const i of f.i) { cx += V[3 * i]; cz += V[3 * i + 2]; } cx = cx / f.i.length - ax; cz = cz / f.i.length - az; const rl = Math.hypot(cx, cz);
          // (b133: a face centred on the axis, the flat glute top, takes at each corner the outward direction from the axis
          // to that corner, so it shades as the side round it does instead of facing straight up at the sky)
          // (b143: a ring cap lit as one smooth round surface: at each corner the normal tilts out from the cap's middle by
          // w times its distance out over the cap's radius, and up by the rest, so the light runs evenly from the rim, where
          // it meets the side's, to the middle, with no point where the facets' tilts meet)
          // (b144: taken once a piece, at its middle, so each piece is flat-lit as the side's facets are)
          if (f.ringCap) { const [rx, rz, R] = f.ringCap; let qx = 0, qz = 0; for (const i of f.i) { qx += V[3 * i]; qz += V[3 * i + 2]; }
            const vx = (qx / f.i.length - rx) / R, vz = (qz / f.i.length - rz) / R, s2 = Math.min(1, vx * vx + vz * vz), m = [w * vx, 1 - w * s2, w * vz], ml = Math.hypot(...m);
            for (const i of f.i) { N[3 * i] = m[0] / ml; N[3 * i + 1] = m[1] / ml; N[3 * i + 2] = m[2] / ml; } upComp(f, m[1] / ml); continue; }
          if (f.capMid || (f.i.length >= 8 && ny / l > 0.9)) { let fx = 0, fz = 0; for (const i of f.i) { fx += V[3 * i]; fz += V[3 * i + 2]; } fx /= f.i.length; fz /= f.i.length; for (const i of f.i) { const vx = V[3 * i] - fx, vz = V[3 * i + 2] - fz, vl = Math.hypot(vx, vz) || 1, m = [vx / vl * w, (1 - w), vz / vl * w], ml = Math.hypot(...m);
              N[3 * i] = m[0] / ml; N[3 * i + 1] = m[1] / ml; N[3 * i + 2] = m[2] / ml; } continue; }
          const ox = rl > 1e-6 ? cx / rl : nx / Math.hypot(nx, nz || 1e-9), oz = rl > 1e-6 ? cz / rl : nz / Math.hypot(nx || 1e-9, nz);
          const m = [nx / l * (1 - w) + ox * w, ny / l * (1 - w), nz / l * (1 - w) + oz * w], ml = Math.hypot(...m) || 1;
          for (const i of f.i) if (!N[3 * i] && !N[3 * i + 1] && !N[3 * i + 2]) { N[3 * i] = m[0] / ml; N[3 * i + 1] = m[1] / ml; N[3 * i + 2] = m[2] / ml; } upComp(f, m[1] / ml); }
        g.normals = N; }
      // b118: the shoulder's and thigh's top shaded smoothly: the facets there are flat, and near the top their angle from
      // band to band jumps enough to show each band's edge (a ring where the dome meets the side). Over the top SMOOTHSPAN
      // of an upper arm or thigh each corner takes the mean normal of every face meeting at its position, blended in with
      // height; the facets and their colours stay, only the light runs on round the curve
      if (/^(arm|leg)/.test(id) && ${process.env.TOPSMOOTH === "1"}) { const V = g.verts, N = new Array(V.length).fill(0); let y0 = 1e9, y1 = -1e9;
        for (let i = 1; i < V.length; i += 3) { y0 = Math.min(y0, V[i]); y1 = Math.max(y1, V[i]); }
        const span = (y1 - y0) * ${+(process.env.SMOOTHSPAN || 0.4)}, key = (i) => Math.round(V[3*i] * 4000) + "," + Math.round(V[3*i+1] * 4000) + "," + Math.round(V[3*i+2] * 4000), acc = new Map(), fn = [];
        for (const f of g.faces) { let nx = 0, ny = 0, nz = 0; for (let k = 0; k < f.i.length; k++) { const a = f.i[k] * 3, b = f.i[(k + 1) % f.i.length] * 3; nx += (V[a + 1] - V[b + 1]) * (V[a + 2] + V[b + 2]); ny += (V[a + 2] - V[b + 2]) * (V[a] + V[b]); nz += (V[a] - V[b]) * (V[a + 1] + V[b + 1]); }
          const l = Math.hypot(nx, ny, nz) || 1; fn.push([nx / l, ny / l, nz / l]); for (const i of f.i) { const k = key(i), q = acc.get(k) || [0, 0, 0]; q[0] += nx / l; q[1] += ny / l; q[2] += nz / l; acc.set(k, q); } }
        g.faces.forEach((f, n) => { for (const i of f.i) { const x = Math.max(0, Math.min(1, (V[3*i+1] - (y1 - span)) / (span * 0.5))), w = x * x * (3 - 2 * x); if (!w) continue;
          const q = acc.get(key(i)), ql = Math.hypot(...q) || 1, m = [0, 1, 2].map((c) => fn[n][c] * (1 - w) + q[c] / ql * w), ml = Math.hypot(...m) || 1; N[3*i] = m[0] / ml; N[3*i+1] = m[1] / ml; N[3*i+2] = m[2] / ml; } });
        g.normals = N; }
      // the part's box in its own frame (blocks), for grounding: pose() stands the body on the lowest corner of the
      // hands' and feet's boxes as they are turned, not on a guess
      // (b47: its own vertices, every one, deduplicated to a coarse grid, so a box corner off the mesh cannot lift it)
      { const V = g.verts, seen = new Map();
        for (let i = 0; i < V.length; i += 3) { const p = [V[i] / CELL, V[i + 1] / CELL, V[i + 2] / CELL], k = p.map((v) => Math.round(v * 2)).join(","); if (!seen.has(k)) seen.set(k, p); }
        BOXES[id] = [...seen.values()]; }
      geos[id] = characterGeometry(g);
      // b97: a second belly for all fours, its swell held fuller to its top (FOURTOP) so it hangs right up under the chest;
      // standing that fullness would poke up through the pecs, so the rig shows it only on all fours
      if (shellTorso && id === "abdomen") geos.abdomenFour = characterGeometry(torsoShell(P, form, pal, o, id, ${+(process.env.FOURTOP || 3)}, joinFor(${+(process.env.FOURTOP || 3)})));
      if (P.fill && P.fill.length && !(${process.env.TORSOSHELL !== "0"})) { const f = makeVox(); for (const [x, y, z, k] of P.fill) f.set(x, y, z, k); geos[id + "Fill"] = characterGeometry(voxelGeometry(f, { unit: CELL, origin, ...pal })); }
    }
    return geos;
  };
  const build = (form) => { const g = buildSteps(form, null); for (;;) { const st = g.next(); if (st.done) return st.value; } };
  // A form's parts are built the first time they are asked for, never as the page loads (sets.B.ape, sets.B.code)
  const SETS = {}, sets = { B: {} };
  for (const form of ["ape", "code"]) Object.defineProperty(sets.B, form, { enumerable: true, get: () => SETS[form] || (SETS[form] = build(form)) });
  const WELDS = ${+(process.env.WELDSTEPS || 41)};
  // a rig's nodes and feet, without the torso's welds (what the welds are built against)
  const bare = (set, form) => { abdRange();
    const r = { root: createNode(), hips: createNode(), dims: { arm: 27 } };
    addChild(r.root, r.hips); r.hips.position.y = ${P0[1]} * CELL; r.hips.position.z = (${P0[2]} - 14) * CELL;
    for (const id of ["abdomen", "chest", "head", "armR", "armL", "foreR", "foreL", "legR", "legL", "shinR", "shinL"]) { r[id] = createNode({ geometry: set[form][id] }); r[id].quaternion = [0, 0, 0, 1]; }
    for (const id of ["abdomen", "chest", "head", "armR", "armL", "foreR", "foreL", "legR", "legL", "shinR", "shinL"]) addChild(r[SKEL[id].parent], r[id]);
    // b57: the belly's mesh on a child of its own, so it can be stretched along the spine (BACKLEN) without the chest
    // and everything hung from it being stretched too
    if (set[form].chestFill) { r.chestFill = createNode({ geometry: set[form].chestFill }); r.chestFill.quaternion = [0, 0, 0, 1]; addChild(r.chest, r.chestFill); }
    r.abdomenMesh = createNode({ geometry: set[form].abdomen }); r.abdomenMesh.quaternion = [0, 0, 0, 1]; r.abdomen.geometry = null; addChild(r.abdomen, r.abdomenMesh);
    if (set[form].abdomenFour) { r.abdomenFour = createNode({ geometry: set[form].abdomenFour }); r.abdomenFour.quaternion = [0, 0, 0, 1]; addChild(r.abdomen, r.abdomenFour); }
    // the feet (b53): each its own node at the ankle, a child of its shin, turned by pose() to stay level
    for (const sh of ["shinR", "shinL"]) if (set[form][sh + "Foot"] && FOOTAT[sh]) {
      const f = createNode({ geometry: set[form][sh + "Foot"] }); f.quaternion = [0, 0, 0, 1];
      f.position.x = FOOTAT[sh][0] * CELL; f.position.y = FOOTAT[sh][1] * CELL; f.position.z = FOOTAT[sh][2] * CELL;
      addChild(r[sh], f); r[sh + "Foot"] = f;
    }
    if (PITCH === null) solvePitch(r);
    return r;
  };
  const rig = (set, form = "ape") => {
    const r = bare(set, form);
    if (r.abdomenFour) {
      r.chestGeo = r.chest.geometry;
      // b107: a weld every 1/(WELDSTEPS-1) of the way from all fours to standing; pose() shows the one nearest the pose,
      // so the back stays one piece while it stands up or drops down (the chest is at most half a step off its weld)
      // (b112: steady, each step a sleeve and a belly piece, and one chest piece for all; WELDSTEPS 41)
      // (one node shows them all, its mesh swapped for the step's, as the chest's is: a node a step made every renderer and
      // the outline registry carry 41 hidden meshes a gorilla)
      const K = WELDS, welds = [], bellies = [];
      for (let k = 0; k < K; k++) { const key = form + ":" + k; if (!MERGED.has(key)) MERGED.set(key, buildMerged(r, form, k / (K - 1)));
        const W = MERGED.get(key);
        if (W.sleeve) { bellies.push(W.belly); if (!k) r.chestWeld = W.chest; (r.weldEdges = r.weldEdges || []).push(W.live.a); } else welds.push(W); }
      r.weldNode = createNode({ geometry: (bellies.length ? bellies : welds)[0] }); r.weldNode.quaternion = [0, 0, 0, 1]; r.weldNode.visible = false; addChild(r.abdomen, r.weldNode);
      r.weldGeos = bellies.length ? bellies : welds; r.torsoWeld = [r.weldNode];
      if (bellies.length) { r.weldBelly = true;
        // b112: the sleeve live, one mesh of this gorilla's own, its points worked out from the belly's and the chest's
        // poses every time pose() runs (dynamic: the renderer re-reads its positions when its revision moves), so it
        // joins the two exactly in every pose and the chest moves smoothly; its colours and windings are the first weld's
        const L0 = MERGED.get(form + ":0").live, N = ${+(process.env.WELDRINGS || 6)}, T = TSIDES, F = N * T, g = { verts: new Array(F * 12).fill(0), faces: [], lines: [], dynamic: true, smooth: true, revision: 0 };
        const map = new Int32Array(F * 4); r.sleeveLive = { g, map, b: L0.b, tan: L0.tan, ring: new Float64Array((N + 1) * T * 3), N, T };
        for (let k = 0; k < N; k++) for (let a = 0; a < T; a++) { const f = k * T + a, b = (a + 1) % T, corners = [k * T + a, k * T + b, (k + 1) * T + b, (k + 1) * T + a];
          for (let c = 0; c < 4; c++) map[f * 4 + c] = corners[c]; g.faces.push({ i: [f * 4, f * 4 + 1, f * 4 + 2, f * 4 + 3], color: L0.faces[f].color.slice(), emissive: L0.faces[f].emissive }); }
        r.sleeveNode = createNode({ geometry: characterGeometry(g) }); r.sleeveNode.quaternion = [0, 0, 0, 1]; r.sleeveNode.visible = false; addChild(r.abdomen, r.sleeveNode);
        // the windings: each face turned to match the first weld's at its own pose
        pose(r, 0, null, null, 0); const V = g.verts;
        g.faces.forEach((f, n) => { let nx = 0, ny = 0, nz = 0; for (let c = 0; c < 4; c++) { const a = f.i[c] * 3, e = f.i[(c + 1) % 4] * 3; nx += (V[a + 1] - V[e + 1]) * (V[a + 2] + V[e + 2]); ny += (V[a + 2] - V[e + 2]) * (V[a] + V[e]); nz += (V[a] - V[e]) * (V[a + 1] + V[e + 1]); }
          const R = L0.faces[n].n; if (nx * R[0] + ny * R[1] + nz * R[2] < 0) f.i.reverse(); });
      }
    }
    // b175: the glyph form's whole body glows brighter: every face's glow CODEGLOW times its own plus CODEGLOWADD (at
    // most 1), every mesh of it once (the welds' and the swapped chest's too; the rain keeps its own)
    if (form === "code" && (${+(process.env.CODEGLOW ?? 1.8)} !== 1 || ${+(process.env.CODEGLOWADD ?? 0.1)})) { const K = ${+(process.env.CODEGLOW ?? 1.8)}, A = ${+(process.env.CODEGLOWADD ?? 0.1)};
      const lift = (g) => { if (!g || !g.faces || GLOWN.has(g)) return; GLOWN.add(g); for (const f of g.faces) if (f.rain === undefined) f.emissive = Math.min(1, (f.emissive || 0) * K + A); };
      const walkG = (n) => { lift(n.geometry); for (const c of n.children || []) walkG(c); }; walkG(r.root); lift(r.chestGeo); lift(r.chestWeld); }
    // b169: the code rain lifted out of every mesh (the welds' and the swapped chest's too) into a layer of its own, a
    // child of the same node, which r.rain(time) points at the frame lit now (built the first time it's asked for)
    if (form === "code" && RAIN_ON) { const hosts = [];
      const walkR = (n) => { for (const c of (n.children || []).slice()) walkR(c); if (n === r.sleeveNode || !n.geometry) return; const src = rainSplit(n.geometry); if (!src) return;
        n.geometry = src.main; const L = createNode({ geometry: null }); L.quaternion = [0, 0, 0, 1]; addChild(n, L); hosts.push([n, L]); };
      walkR(r.root);
      for (const k of ["chestGeo", "chestWeld"]) if (r[k]) { const src = rainSplit(r[k]); if (src) r[k] = src.main; }
      r.rainHosts = hosts; }
    r.rain = (time) => { if (!r.rainHosts) return; const f = Math.floor(Math.max(0, time) * RFPS) % RN;
      for (const [n, L] of r.rainHosts) { const src = n.visible && rainSrcOf.get(n.geometry); L.geometry = src ? rainFrame(src, f) : null; } };
    pose(r, 1); pose(r, 0); return r;
  };
  // b57: the torso's forward tip on all fours, found once: the tip (degrees) at which the knuckles and the feet stand
  // level, by bisection (the longer back and straighter legs each change it)
  let ABDLOW = 0, ABDTOP = 0, ABDBACK = 0, ABDREADY = false; const abdRange = () => { if (ABDREADY) return; ABDREADY = true; const V = sets.B.ape.abdomen.verts; for (let i = 1; i < V.length; i += 3) { ABDLOW = Math.min(ABDLOW, V[i] / CELL); ABDTOP = Math.max(ABDTOP, V[i] / CELL); ABDBACK = Math.min(ABDBACK, V[i + 1] / CELL); } };
  let PITCH = ${process.env.TRUNKPITCH !== undefined ? +process.env.TRUNKPITCH : "null"};
  const solvePitch = (r) => { let lo = -10, hi = 30; PITCH = 0;
    for (let i = 0; i < 30; i++) { PITCH = (lo + hi) / 2; pose(r, 0); if (r.lowH < r.lowF) hi = PITCH; else lo = PITCH; } };
  // t 0: the knuckle stance; t 1: standing on the hind legs. Each part's world turn is eased between the two and set
  // on its node relative to its parent; the body is lifted so the lowest foot or knuckle rests on the ground.
  // g, optional: a knuckle-walk gait laid over the stance, { phase (radians), amp (degrees of swing), lift (degrees
  // of elbow and knee bend while a limb swings forward), sway (degrees of torso roll) }. Limbs swing in diagonal pairs
  // (right arm with left leg) about the world x axis through their joints; a forearm or shin also takes its upper's
  // swing, plus its bend while lifted; the body is lifted onto the lowest knuckle or foot as before, so it bobs.
  const qx = (deg) => { const a = (deg * Math.PI) / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };
  const qz = (deg) => { const a = (deg * Math.PI) / 360; return [0, 0, Math.sin(a), Math.cos(a)]; };
  const BOBMEAN = new Map();
  // b75: act, optional: { air (0-1, the tuck while airborne), land (0-1, the crouch just after landing), climb (0-1),
  // climbPhase (radians) }. Each adds to the limbs' turns (degrees about x: an upper part's own swing, and its lower
  // part's bend relative to it); in the air and on a wall the body holds its stance height and the limbs move under it
  const STILL = new Map();
  const pose = (r, t, g, act) => {
    if (typeof t !== "number") t = 0;
    const swing = {}, bend = {}, roll = {}, heel = {}, heelSw = {};
    // the torso is always one piece (b133): the welded back in every pose, climbing too, its live sleeve following the
    // chest and belly wherever they turn
    const welded = !!r.weldGeos, weldK = welded ? Math.round(Math.max(0, Math.min(1, t)) * (r.weldGeos.length - 1)) : -1, weldF = welded && t < 0.5, weldS = welded && t >= 0.5;
    if (g) {
      // b54: the in-game gorillas' timing (agent.js OFFSETS): walking, a four-beat walk, each limb a quarter cycle after
      // the one before (right leg, right arm, left leg, left arm); running (g.run toward 1), a gallop, both legs
      // together and both arms together, half a cycle after them, with bigger strides
      const run = Math.max(0, Math.min(1, g.run || 0)), mix = (a, b) => a + (b - a) * run;
      // b58: upright (t toward 1) a biped's walk: the legs half a cycle apart in shorter strides, each arm swinging a little
      // against its own leg, the knee lifting more as a leg swings through, and a heavier side-to-side roll (a waddle)
      const up01 = Math.max(0, Math.min(1, t)), um = (a, b) => a + (b - a) * up01;
      // (b137: walking on all fours in diagonal pairs, the right leg with the left arm and the left leg with the right arm,
      // each pair stepping and landing together (DIAGONAL); the gallop and upright as before)
      const DG = ${+(process.env.DIAGONAL ?? 1)}, OFF = { legR: 0, armR: um(mix(0.25 + (0.25 + ${+(process.env.DIAGSHIFT ?? 0.06)}) * DG, 0.5), 0.5), legL: um(mix(0.5, 0.08), 0.5), armL: um(mix(0.75 + (0.25 + ${+(process.env.DIAGSHIFT ?? 0.06)}) * DG, 0.58), 1) };
      const A = g.amp * mix(1, 1.6), L = g.lift * mix(1, 1.3), LEGA = um(1, mix(${+(process.env.UPSTRIDE || 0.45)}, ${+(process.env.UPRUNSTRIDE || 0.55)})), ARMA = um(1, mix(${+(process.env.UPARMS || 0.35)}, 0.6)), LIFTA = um(1, mix(1.2, ${+(process.env.UPRUNLIFT || 1.8)}));
      // b72: running upright, a runner's stride: the thigh swings fully from the hip (the all-fours THIGHSHARE is for
      // keeping its top under the back), driven further forward (UPRUNFWD), and the knee folds deep as it comes through
      const TS = um(${+(process.env.THIGHSHARE || 0.65)}, 1), FWDX = um(0, mix(0, ${+(process.env.UPRUNFWD || 0.25)}));
      // b55: an arm swings only ARMSWING (0.45) of the stride from the shoulder, which stays put up by the neck; the
      // forearm follows it (FORESWING, the same) and the elbow folds as the hand comes forward (ELBOWLIFT 0.7)
      // (b136: the walk on all fours takes a longer step: the arms swing ARMSWING 0.8 of the stride (0.45 before), the
      // elbows lift ELBOWLIFT 0.35 (0.7), and the legs reach back as far as forward (LEGSPAN 1.2, LEGFWD 0.15; 0.8 and
      // 0.35 before), so it steps forward rather than lifting and setting down in place; upright and running, as before)
      const WK = (1 - up01) * (1 - Math.min(1, (g.run || 0) * 1.5)), sm4 = (a, b) => a + (b - a) * WK;
      const AU = sm4(0.45, ${+(process.env.ARMSWING || 0.8)}), AF = sm4(0.45, ${+(process.env.FORESWING || 0.8)}), EL = sm4(0.7, ${+(process.env.ELBOWLIFT || 0.35)});
      // b55: an elbow or knee only ever folds (flex: the hand forward of the upper arm's line, a turn of negative
      // degrees about x; the foot behind the thigh's, positive), never past straight: the lower part's turn relative to
      // the upper is clamped to that side
      for (const [limb, lower, ku, kl, kb, flex] of [["armR", "foreR", AU * ARMA, AF * ARMA, EL, -1], ["armL", "foreL", AU * ARMA, AF * ARMA, EL, -1], ["legR", "shinR", 0.85 * LEGA * TS, 0.85 * LEGA, LIFTA * sm4(1, ${+(process.env.STEPLIFT4 ?? 1.5)}), 1], ["legL", "shinL", 0.85 * LEGA * TS, 0.85 * LEGA, LIFTA * sm4(1, ${+(process.env.STEPLIFT4 ?? 1.2)}), 1]]) {
        const ph = g.phase + OFF[limb] * Math.PI * 2, sn = Math.sin(ph), c0 = Math.max(0, Math.cos(ph));
        // b70: upright the lift never rests: a raised cosine over the whole cycle with a little bend kept at its low
        // (UPBASE), so knees and elbows keep moving; on all fours it is b64's eased half-cycle lift as before
        // b77: the arms' elbow bend continuous on all fours too (a raised cosine with a little bend kept at its low,
        // ARMBASE), so the forearms never sit still for half the stride; the legs keep the half-cycle lift on all fours
        // (b137: walking on all fours the arms lift and land on the legs' half-cycle, so a diagonal pair lands together)
        const c1 = 0.5 + 0.5 * Math.cos(ph), cont = flex < 0 ? 1 - WK * DG : up01, base = flex < 0 ? um(${+(process.env.ARMBASE || 0.25)}, ${+(process.env.UPBASE || 0.2)}) : um(0, ${+(process.env.UPBASE || 0.2)});
        const up = ${+(process.env.LIFTGAIN || 1.25)} * ((1 - cont) * c0 * c0 + cont * (base + (1 - base) * c1 * c1));
        // (b138: walking on all fours, a planted arm gives at the elbow as it swings through vertical (g.give, found at the
        // end of pose()), so its hand stays on the ground while the body holds still; before, the body rode over the
        // straight arm)
        const give = flex < 0 && g.give ? g.give[limb] || 0 : 0;
        const rx = flex * (-A * (kl - ku) * sn) + L * kb * up + give, SK = ${+(process.env.SOFTJOINT || 3)}, rel = flex * (rx > 20 * SK ? rx : SK * Math.log1p(Math.exp(rx / SK)));
        // b63: a leg swings mostly forward of its stance (LEGFWD): the thigh comes well forward with the knee bending,
        // the foot is set down at the front as the knee straightens, and the leg sweeps back only partway behind
        const sn2 = flex > 0 ? sm4(0.8, ${+(process.env.LEGSPAN || 1.2)}) * sn + sm4(0.35, ${+(process.env.LEGFWD || 0.15)}) + FWDX : sn;
        swing[limb] = -A * ku * sn2; swing[lower] = swing[limb] + rel;
        // (b149, option A: walking on all fours, a hind foot rolls heel-up as it leaves the ground, its toes trailing, and
        // levels again well before it lands: HEEL4 degrees at most, a third of the way through the swing, easing in from rest as
        // the foot lifts and out before it lands, so the leg never snaps (b157: sw^2 (1-sw)^4; b151's sw (1-sw)^3 started at full speed; b177: a raised cosine
        // over the first HEELEND 0.65 of the swing, peaking at HEEL4 26 degrees a third of the way through: the heel rose 40 degrees in a third of the swing and
        // read as a snap); the knee folds HEELBEND
        // of that more, so the trailing toes clear the ground)
        if (flex > 0 && c0 > 0) { const sw = Math.max(0, Math.min(1, (ph % (Math.PI * 2) + Math.PI * 2.5) % (Math.PI * 2) / Math.PI)); heel[lower] = ${+(process.env.HEEL4 ?? 26)} * WK * Math.min(1, (g.amp || 0) / 24) * (${process.env.HEELSHAPE === "old"} ? 45.56 * sw * sw * Math.pow(1 - sw, 4) * 4 / 3 : sw < ${+(process.env.HEELEND ?? 0.65)} ? 0.5 - 0.5 * Math.cos(2 * Math.PI * sw / ${+(process.env.HEELEND ?? 0.65)}) : 0); heelSw[lower] = sw; swing[lower] += ${+(process.env.HEELBEND ?? 0.9)} * heel[lower]; }
        // (b149, option B: walking on all fours, the swinging thigh comes forward from the hip in the middle of the swing
        // (KNEEFWD4 of the lift, peaking as the foot passes under the body), so the knee leads the step)
        if (flex > 0 && c0 > 0 && ${+(process.env.KNEEFWD4 ?? 0)}) { const sw = Math.max(0, Math.min(1, (ph % (Math.PI * 2) + Math.PI * 2.5) % (Math.PI * 2) / Math.PI)), kf = ${+(process.env.KNEEFWD4 ?? 0)} * WK * L * Math.sin(Math.PI * sw) * Math.sin(Math.PI * sw);
          swing[limb] -= kf; swing[lower] += ${+(process.env.KNEEFWDSHIN ?? 0.4)} * kf; }
        // (b151: a hind foot rolling heel-up in the swing keeps its tipped toes on the ground: the knee folds by g.give, found
        // at the end of pose() as the arms' is, so the heel goes up and over the toes instead of the toes going under)
        if (flex > 0 && g.give && g.give[lower]) swing[lower] += g.give[lower];
      }
      // (b81: the belly's pitch with the gallop is for all fours alone: upright it rocked the torso and head like a pigeon)
      // (b196: by the stride's size, so a walk stopped mid-stride stands straight instead of holding half a sway)
      swing.chest = 0; swing.abdomen = mix(0, 6) * (1 - up01) * (welded ? 0 : 1) * Math.sin(g.phase * 2) * Math.min(1, (g.amp || 0) / 24);
      r.hips.quaternion = qz(g.sway * mix(1, 0.3) * um(1, ${+(process.env.WADDLE || 0.7)}) * Math.sin(g.phase));
    } else r.hips.quaternion = [0, 0, 0, 1];
    if (act) {
      const air = act.air || 0, land = act.land || 0, cl = act.climb || 0, cp = act.climbPhase || 0, u = Math.max(0, Math.min(1, t));
      const add = (limb, lower, du, dr) => { swing[limb] = (swing[limb] || 0) + du; swing[lower] = (swing[lower] ?? (swing[limb] - du)) + du + dr; };
      // b120: sitting (act.sit 0-1) and lying on its side (act.lay 0-1), meant over the standing pose (t 1). Sitting: the
      // thighs forward (SITTHIGH), the shins folded down under the knees (SITKNEE), the torso leaning back a little, the
      // arms hanging with the hands low in front. Lying: pose() rolls the whole body over (LAYROLL, about its front axis)
      // and here it curls: thighs up, knees bent, the lower arm forward under the head and the upper one over the body
      { const sit = act.sit || 0, lay = act.lay || 0;
        if (sit || lay) for (const s of ["R", "L"]) {
          // (b129: sitting, the legs straight out in front (thighs SITTHIGH -86, knees straight) and the arms down at the
          // sides, turned out ARMSITROLL from the body, a little forward, the knuckles on the ground beside the hips)
          // (b158: the arm underneath is the side the roll puts down, the other one to LAYSIDE's: LAYSIDE R rolls the left side
          // down. Lying, the bottom arm reaches up overhead (LAYUARM) with its elbow folded (LAYUFORE) so the forearm lies under
          // the head, a pillow; the top arm lies forward across the body (LAYTARM, turned in LAYTROLL, elbow LAYTFORE), its
          // hand down in front of the chest; the legs turned in toward each other (LAYLEGIN))
          const under = s !== "${process.env.LAYSIDE || "R"}", inS = s === "R" ? 1 : -1;
          // (b160: the bottom leg straighter (LAYTHIGHB, LAYKNEEB), the top one bent with its knee forward (LAYTHIGH, LAYKNEE),
          // as someone lies on their side)
          add("leg" + s, "shin" + s, sit * ${+(process.env.SITTHIGH ?? -86)} + lay * (under ? ${+(process.env.LAYTHIGHB ?? 0)} : ${+(process.env.LAYTHIGH ?? 0)}), sit * ${+(process.env.SITKNEE ?? 0)} + lay * (under ? ${+(process.env.LAYKNEEB ?? 0)} : ${+(process.env.LAYKNEE ?? 0)}));
          add("arm" + s, "fore" + s, sit * ${+(process.env.ARMSITSW ?? 0)} + lay * (under ? ${+(process.env.LAYUARM ?? -120)} : ${+(process.env.LAYTARM ?? 30)}), sit * ${+(process.env.ARMSITBEND ?? -15)} + lay * (under ? ${+(process.env.LAYUFORE ?? -60)} : ${+(process.env.LAYTFORE ?? -30)}));
          if (lay && s === "R") roll.head = (roll.head || 0) + lay * ${+(process.env.LAYHEAD ?? 0)} * ("${process.env.LAYSIDE || "R"}" === "R" ? 1 : -1);
          // (b161: the forearm takes the same roll as its upper arm, so the elbow stays a hinge: rolled on its own it was
          // turned off the hinge, the elbow seeming to bend backwards)
          if (lay) { const ar = lay * inS * (under ? ${+(process.env.LAYUROLL ?? -12)} : ${+(process.env.LAYTROLL ?? 15)}); roll["arm" + s] = (roll["arm" + s] || 0) + ar; roll["fore" + s] = (roll["fore" + s] || 0) + ar;
            roll["leg" + s] = (roll["leg" + s] || 0) + lay * inS * (under ? ${+(process.env.LAYLEGINB ?? 15)} : ${+(process.env.LAYLEGIN ?? 15)}); }
          if (sit) roll["arm" + s] = (roll["arm" + s] || 0) + sit * (s === "R" ? 1 : -1) * ${+(process.env.ARMSITROLL ?? 0)}; }
        if (sit) { swing.abdomen = (swing.abdomen || 0) - sit * ${+(process.env.SITLEAN ?? 6)}; swing.head = (swing.head || 0) + sit * 4; } }
      // airborne: on all fours the arms reach forward and the legs tuck in under the body; upright the knees come up
      // and the arms rise a little, elbows bent (arms: negative swings the hand forward; legs: negative brings the
      // thigh forward, a positive bend folds the foot back)
      for (const s of ["R", "L"]) {
        // (b79: on all fours the arms stay under the body in the air, elbows folding a little, not reaching out)
        add("arm" + s, "fore" + s, air * (-6 - 24 * u), air * (-14 - 24 * u));
        // (b155: in the air the legs swing back a little from the hip (AIRLEGBACK), knees only a little bent (AIRKNEE),
        // instead of the knees drawn up under the body)
        // (b188: only on all fours; upright the thigh comes a little forward of straight (AIRLEGUP) so the bent knee
        // (AIRKNEEUP) keeps the foot under the body instead of swinging the leg back)
        add("leg" + s, "shin" + s, air * ((1 - u) * ${+(process.env.AIRLEGBACK ?? 14)} + u * ${+(process.env.AIRLEGUP ?? -8)}), air * ((1 - u) * ${+(process.env.AIRKNEE ?? 12)} + u * ${+(process.env.AIRKNEEUP ?? 12)}));
        // (b194: hauling over a top, the viewer swings the legs back down the wall (act.mantleLeg, degrees, positive back)
        // and folds the knees to bring the feet up over the edge (act.mantleKnee))
        if (act.mantleLeg || act.mantleKnee) add("leg" + s, "shin" + s, act.mantleLeg || 0, act.mantleKnee || 0);
        // landing: a crouch, knees and elbows giving
        add("arm" + s, "fore" + s, land * 4, land * -22);
        add("leg" + s, "shin" + s, land * -14, land * 32);
      }
      // b80, climbing (the stance upright, facing the rock): hand over hand. Each arm in turn reaches up nearly straight
      // overhead while the other, lower, pulls down with its elbow folded; the legs go diagonally to them, the knee
      // opposite the high hand drawn up to step while the other pushes straight. Still (climbMove 0) it hangs with both
      // hands up and the stroke held; moving along the rock (b140) it holds that hang and the whole body slides.
      if (cl > 0) { const mv = Math.min(1, act.climbMove ?? 1);
        for (const [s, ph] of [["R", 0], ["L", Math.PI]]) {
          const wv = Math.sin(cp + ph), hi = 0.5 + 0.5 * wv, lo = 1 - hi, h2 = mv * hi + (1 - mv) * 0.6, l2 = mv * lo + (1 - mv) * 0.4;
          // (b82: pushing on the rock: both hands on its face, the high one reaching up and in to it, the low one pulled
          // down to the chest with its elbow folded and its fist on the face; both feet planted on it, each thigh drawn
          // forward to the rock and the shin hanging from the knee onto it, the stepping knee drawn high)
          // (b83: reaching further forward to the rock, from a torso leaning back off it)
          // (b86-b88: reaching up the rock and forward onto it, so the hands land on its face above and in front of the
          // face while the head and chest stay clear of it: the arms -88 to -116 deg, from a torso leaning back only
          // CLIMBLEAN 4; measured, the hands reach about 17 cm past the head and chest, 2.5 m over the root)
          // (b132: the arms reach that much further forward again as the body tips back (ARMTILTK of the tilt), so the hands
          // stay on the rock)
          add("arm" + s, "fore" + s, cl * (${+(process.env.ARMLO || -150)} + ${+(process.env.ARMSPAN || -28)} * h2 - ${+(process.env.CLIMBTILT ?? -8)} * ${+(process.env.ARMTILTK ?? 2.5)}), cl * (-8 - 44 * l2 + ${+(process.env.FOREREACH ?? 30)}));
          // (b85: the thighs nearer straight down, the stepping knee still drawn up; the shins tipped forward to the rock)
          // (b87-b88: the legs long: the pushing leg straight, tipped forward from the hip so its foot reaches the rock;
          // the stepping knee drawn up)
          // (b128: the thighs hang nearly straight down, LEGLO -6, the stepping one lifted only LEGSTEP more, the knees a
          // little bent: they no longer reach forward to the rock)
          add("leg" + s, "shin" + s, cl * (${+(process.env.LEGLO ?? -12)} + ${+(process.env.LEGSTEP ?? -16)} * l2), cl * (4 + ${+(process.env.SHINSTEP ?? 26)} * l2));
        }
        r.hips.quaternion = qz(cl * 5 * mv * Math.sin(cp));
        // the torso leans back off the rock (CLIMBLEAN), rolling a little against the hips with the stroke; the head
        // nods a little with the stroke and turns a little toward the high hand
        const lean = ${+(process.env.CLIMBLEAN ?? 4)};
        // (about x a negative turn tips an upward part's top back, away from the rock; each part's world turn is set on
        // its own, so the head keeps its own and only nods a little with the stroke)
        swing.abdomen = (swing.abdomen || 0) - cl * lean; swing.chest = (swing.chest || 0) - cl * lean * 0.6;
        // (b134: the head held steady while climbing: no nod or turn with the stroke)
        roll.chest = (roll.chest || 0) - cl * 4 * mv * Math.sin(cp);
      }
    }
    const base = { hips: [0, 0, 0, 1] }, world = { hips: g || (act && (act.climb || 0) > 0) ? r.hips.quaternion : [0, 0, 0, 1] }, at = { hips: [0, ${P0[1]}, ${P0[2]}] }, joint = { hips: [0, ${P0[1]}, ${P0[2]}] };
    // (b120: lying, every part's world turn rolled over by LR, the hips' too, so the body turns about the hip as one)
    // (b179: and tilted about its own length, LAYTILT degrees toward its front, so both legs can lie on the ground)
    const LR = act && act.lay ? qmul(qx(act.lay * ${+(process.env.LAYTILT ?? 0)}), qz(act.lay * ${+(process.env.LAYROLL ?? 84)} * ("${process.env.LAYSIDE || "R"}" === "R" ? -1 : 1))) : null;
    if (LR) world.hips = qmul(LR, world.hips);
    // (b132: climbing, the whole body tipped CLIMBTILT about the hips, its top out from the rock and its legs in toward it)
    // (b193: and leaned in by act.climbLean degrees (its top toward the rock), where the rock it climbs is set further back
    // at its hands' height than at its feet, as over a lip to a recessed wall, so the hands reach the wall above)
    const CT = act && (act.climb || 0) > 0 ? qx(act.climb * (${+(process.env.CLIMBTILT ?? -8)} + (act.climbLean || 0))) : null; if (CT) world.hips = qmul(CT, world.hips);
    for (const id of ["abdomen", "chest", "head", "armR", "armL", "foreR", "foreL", "legR", "legL", "shinR", "shinL"]) {
      const S = SKEL[id], pw = world[S.parent], pr = SKEL[S.parent] ? SKEL[S.parent].rest : [0, 0, 0, 1];
      let w = slerp(S.knuckle, S.stand, t);
      // b57: on all fours the torso (and head with it) tipped forward from the hip by TRUNKPITCH, easing out standing
      if (PITCH && (id === "abdomen" || id === "chest" || id === "head")) w = qmul(qx(PITCH * (1 - t)), w);
      base[id] = w;
      // (b147: act.look, degrees below level: the head turned at the neck, about the body's side axis, until it faces that
      // far down (negative: up) whatever its pose faces, by no more than LOOKMAX, so a first-person view looking up or down
      // is the head looking up or down, standing or on all fours)
      // (b148: with no look given, on all fours the head is turned to face level, eased in as the body goes down, in the
      // rest pose too, with no walk or action, as the viewer shows it before it is driven (b151)
      // (HEADLEVEL4 of it), so the eyes look straight out instead of at the ground in front)
      if (id === "head") { const given = act && typeof act.look === "number", k = given ? 1 : ${+(process.env.HEADLEVEL4 ?? 1)} * (1 - Math.max(0, Math.min(1, t)));
        if (k > 0) { const f = qrot(w, [0, 0, 1]), a0 = Math.asin(Math.max(-1, Math.min(1, f[1] / Math.hypot(f[0], f[1], f[2])))) * 180 / Math.PI, L = ${+(process.env.LOOKMAX ?? 55)};
          swing.head = (swing.head || 0) + k * Math.max(-L, Math.min(L, a0 + (given ? act.look : 0))); } }
      // b99: the belly kept in line with the chest on all fours as it is standing (no bend at the waist), so it hangs
      // relative to the chest exactly as it does standing (off by default: SAMETORSO=1; straight, the hands no longer reach the ground)
      if (${process.env.SAMETORSO === "1"} && id === "abdomen") w = qmul(qx(-(${ABD} - ${CH}) * (1 - t)), w);
      // (b190: on all fours the belly tipped ABDTIP4 degrees about the hips (eased out standing), so its underside runs on
      // down into the thigh tops instead of ending over them)
      if (id === "abdomen" && ${+(process.env.ABDTIP4 ?? 0)} && t < 1) w = qmul(qx(${+(process.env.ABDTIP4 ?? 0)} * (1 - Math.max(0, t))), w);
      if ((g || act || id === "head") && (swing[id] || bend[id])) w = qmul(qx((swing[id] || 0) + (bend[id] || 0)), w);
      if (roll[id]) w = qmul(qz(roll[id]), w);
      // b85: climbing, each forearm turned about its own length back from the standing twist and on by HANDTURN, so the
      // fist's knuckles face the sky and the rock rather than the side
      if (act && (act.climb || 0) > 0 && (id === "foreR" || id === "foreL")) {
        const sg = id === "foreR" ? 1 : -1, deg = sg * act.climb * (${+(process.env.ELBOWTWIST ?? 67.5)} * Math.min(1, t) + ${+(process.env.HANDTURN ?? 0)}), a = (deg * Math.PI) / 360;
        w = qmul(w, [0, Math.sin(a), 0, Math.cos(a)]); }
      // (welded on all fours the chest rolls with the hips as the belly does; welded standing neither does, the hips
      // waddling under a steady torso)
      if (g && ((S.parent === "hips" && !(id === "abdomen" && weldS)) || (id === "chest" && weldF))) w = qmul(r.hips.quaternion, w);
      if (LR) w = qmul(LR, w);
      if (CT) w = qmul(CT, w);
      world[id] = w;
      // the joint's offset from the parent's joint, fixed in the parent's own frame (taken at rest)
      const off = qrot(qinv(pr), S.joint.map((v, i) => v - SKEL[S.parent]?.joint?.[i] ?? 0).map((v, i) => S.parent === "hips" ? S.joint[i] - ${JSON.stringify(P0)}[i] : v));
      at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]);
      r[id].quaternion = qmul(qinv(pw), w);
      // standing, the hips draw in (LEGSLIDE blocks each side), so the thighs close up under the body
      // on all fours too, by LEGSLIDE0, so the upper thighs sit tight under the body
      const sl = ${LEGSLIDE0} + (${LEGSLIDE} - ${LEGSLIDE0}) * t, slide = id === "legR" ? sl : id === "legL" ? -sl : 0;
      if (slide) { off[0] += slide; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // standing, the head sits back over the body (HEADBACK blocks), not out over the feet
      // b61: standing, the torso rides higher over the legs (TORSOUP blocks), so the thighs show under it
      // b76: on all fours the torso rides RUMPUP blocks higher off the hips, so the lower back stands clear over the
      // thigh tops (the forward tip is re-solved so the hands still meet the ground); it eases out standing
      if (id === "abdomen" && t < 1 && ${+(process.env.RUMPUP ?? 2.5)}) { off[1] += ${+(process.env.RUMPUP ?? 2.5)} * (1 - t); at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      if (id === "abdomen" && t && ${+(process.env.TORSOUP || 4)}) { off[1] += ${+(process.env.TORSOUP || 4)} * t; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      if (id === "chest" && ${BACKLEN} !== 1 && !${process.env.SAMETORSO === "1"}) { off[1] += (${BACKLEN} - 1) * (1 - t) * (off[1] - ABDLOW); at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      if (id === "head" && t) { off[2] -= ${HEADBACK} * t; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // standing, the shoulders sit back too (SHOULDERBACK blocks), off the chest
      if ((id === "armR" || id === "armL") && t) { off[2] -= ${SHOULDERBACK} * t; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // (b152: in every pose the shoulders sit SHOULDERFWD blocks further forward on the chest, nearer the chest than the back)
      if ((id === "armR" || id === "armL") && ${+(process.env.SHOULDERFWD ?? 2)}) { off[2] += ${+(process.env.SHOULDERFWD ?? 2)}; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // (b160: lying, the bottom shoulder rolls in under the body and forward, LAYSHIN and LAYSHFWD blocks, as a person's does
      // on their side, so the torso lies on it instead of being held up on the broad shoulder)
      if ((id === "armR" || id === "armL") && act && act.lay && id !== "arm${process.env.LAYSIDE || "R"}") { off[0] += (id === "armR" ? 1 : -1) * act.lay * ${+(process.env.LAYSHIN ?? 3)}; off[2] += act.lay * ${+(process.env.LAYSHFWD ?? 3)}; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // (b179: lying, the top shoulder sunk LAYTSHIN blocks into the body, toward its middle, so the arm lies along the side)
      if (id === "arm${process.env.LAYSIDE || "R"}" && act && act.lay) { const k = ${+(process.env.LAYTSHIN ?? 0)}; if (k) { off[0] += (id === "armR" ? 1 : -1) * act.lay * k; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); } }
      // (b163: lying, the top leg's hip dropped LAYHIPDROP blocks toward the body's middle (toward the ground), so its glute
      // doesn't stand up over the body)
      if (id === "leg${process.env.LAYSIDE || "R"}" && act && act.lay && ${+(process.env.LAYHIPDROP ?? 0)}) { off[0] += (id === "legR" ? 1 : -1) * act.lay * ${+(process.env.LAYHIPDROP ?? 0)}; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // (b140: climbing, the shoulders come forward CLIMBSHOULDER blocks, nearer the chest than the back)
      if ((id === "armR" || id === "armL") && act && (act.climb || 0) > 0) { off[2] += ${+(process.env.CLIMBSHOULDER ?? 2)} * act.climb; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      // (b140: each arm turns about the middle of its shoulder ball, SHOULDERPIV blocks in from the bone's own joint (in its
      // frame: x inward, y up the bone, z forward), for every turn beyond the stance's own, so the stances keep their place)
      // (b200: climbing, the pivot CLIMBPIVBACK blocks further back, toward the back from the chest)
      if (id === "armR" || id === "armL") { const sg = id === "armR" ? 1 : -1, P = [sg * ${+(process.env.PIVX ?? 1.2)}, ${+(process.env.PIVY ?? -0.5)}, ${+(process.env.PIVZ ?? 1.7)} - (act ? act.climb || 0 : 0) * ${+(process.env.CLIMBPIVBACK ?? 1)}];
        const qb = qrot(qmul(qinv(base[S.parent]), base[id]), P), qn = qrot(r[id].quaternion, P);
        for (let i = 0; i < 3; i++) off[i] += qb[i] - qn[i]; at[id] = qrot(pw, off).map((v, i) => v + at[S.parent][i]); }
      r[id].position.x = off[0] * CELL; r[id].position.y = off[1] * CELL; r[id].position.z = off[2] * CELL;
    }
    // the belly's mesh, between where its bottom and top should be: on all fours its rump stays put and it reaches
    // BACKLEN further toward the chest; standing (b68) its bottom stays down by the thighs while the torso rides TORSOUP
    // higher, so it stretches down over the thigh tops instead of lifting off them
    // (b71: the stretch follows the waist joint, L1 up the spine, not the belly's top: the belly's rows above the
    // waist, which sit inside the chest, stay there and never slide out under it)
    // the waist fill (b75) fills the back's corner on all fours; standing, the waist straightens and it sinks forward
    // into the chest (FILLSINK blocks by t 0.5), so it never shows as a band across the back
    if (r.chestFill) r.chestFill.position.z = Math.min(1, t * 2) * ${+(process.env.FILLSINK || 2.5)} * CELL;
    if (r.abdomenMesh) { const tb = ${process.env.SAMETORSO === "1"} ? 1 : t, L1 = ${L1}, bot = ABDLOW - ${+(process.env.TORSOUP || 4)} * tb * ${+(process.env.BELLYDOWN || 1)}, waist = L1 + (${BACKLEN} - 1) * (1 - tb) * (L1 - ABDLOW);
      const sc = (waist - bot) / (L1 - ABDLOW); r.abdomenMesh.scale.y = sc; r.abdomenMesh.position.y = (bot - ABDLOW * sc) * CELL;
      // b95: on all fours the belly lifted: its depth (local z, the belly's side +z) squashed to BELLYLIFT with its back
      // held where it is, so it hangs no lower than the chest beside it; standing it eases back to the full stomach
      const kz = ${process.env.SAMETORSO === "1"} ? 1 : 1 - (1 - ${+(process.env.BELLYLIFT || 1)}) * (1 - t); r.abdomenMesh.scale.z = kz; r.abdomenMesh.position.z = ABDBACK * (1 - kz) * CELL;
      if (r.abdomenFour) { const A = r.abdomenMesh, F = r.abdomenFour; F.scale.y = A.scale.y; F.scale.z = A.scale.z; F.position.y = A.position.y; F.position.z = A.position.z; const four = !${process.env.SAMETORSO === "1"} && t < ${+(process.env.FOURSWITCH || 0.35)}; F.visible = four; A.visible = !four; }
      if (r.weldBelly) { const A = r.abdomenMesh, n = r.weldNode; n.scale.x = A.scale.x; n.scale.y = A.scale.y; n.scale.z = A.scale.z; n.position.x = A.position.x; n.position.y = A.position.y; n.position.z = A.position.z; }
      if (r.sleeveLive) { r.sleeveNode.visible = welded; if (welded) { const S = r.sleeveLive, A = r.abdomenMesh, Ea = r.weldEdges[weldK], Eb = S.b, R = S.ring, V = S.g.verts, map = S.map, N = S.N, T = S.T;
        const sx = A.scale.x, sy = A.scale.y, sz = A.scale.z, px = A.position.x, py = A.position.y, pz = A.position.z, q = r.chest.quaternion, cp = r.chest.position;
        const qx = q[0], qy = q[1], qz = q[2], qw = q[3], dbx = 2 * (qx * qy - qw * qz), dby = 1 - 2 * (qx * qx + qz * qz), dbz = 2 * (qy * qz + qw * qx);
        for (let a = 0; a < T; a++) { const e = Ea[a], f = Eb[a], ax = e[0] * sx + px, ay = e[1] * sy + py, az = e[2] * sz + pz, x = f[0], y = f[1], z = f[2];
          // (the chest's point turned by its quaternion: v + 2w(u x v) + 2u x (u x v))
          const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
          const bx = x + qw * tx + (qy * tz - qz * ty) + cp.x, by = y + qw * ty + (qz * tx - qx * tz) + cp.y, bz = z + qw * tz + (qx * ty - qy * tx) + cp.z;
          const L = Math.hypot(bx - ax, by - ay, bz - az) * S.tan[a];
          for (let k = 0; k <= N; k++) { const u = k / N, h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u, o = (k * T + a) * 3;
            R[o] = h00 * ax + h01 * bx + h11 * L * dbx; R[o + 1] = h00 * ay + h10 * L + h01 * by + h11 * L * dby; R[o + 2] = h00 * az + h01 * bz + h11 * L * dbz; } }
        for (let v = 0; v < map.length; v++) { const o = map[v] * 3; V[v * 3] = R[o]; V[v * 3 + 1] = R[o + 1]; V[v * 3 + 2] = R[o + 2]; }
        S.g.revision++; } }
      if (r.weldGeos) { r.weldNode.visible = welded; if (welded) r.weldNode.geometry = r.weldGeos[weldK]; r.chest.geometry = welded ? (r.chestWeld || null) : r.chestGeo; if (welded) { r.abdomenFour.visible = false; r.abdomenMesh.visible = false; } } }
    let low = 1e9, lowH = 1e9; const footW = {};
    for (const [id] of FEET) if (/^fore/.test(id)) for (const p of BOXES[id] || []) lowH = Math.min(lowH, qrot(world[id], p)[1] + at[id][1]);
    const sitFree = act && (act.sit || 0) > 0 && !((act.lay || 0) > 0) && ${process.env.SITSINK !== "0"};
    // (b182: lying, the bottom arm and forearm are no support in any of the ground's three finds either (the forearm is one
    // of FEET): the body had rested on the sunk forearm, 3-4 blocks over the ground)
    const layUnder = act && (act.lay || 0) > 0 && ${process.env.LAYSINK !== "0"} ? ("${process.env.LAYSIDE || "R"}" === "R" ? "L" : "R") : null, noSup = (id) => (sitFree && /^fore/.test(id)) || (layUnder && (id === "arm" + layUnder || id === "fore" + layUnder));
    for (const [id] of FEET) { if (noSup(id)) continue; for (const p of BOXES[id] || []) low = Math.min(low, qrot(world[id], p)[1] + at[id][1]); }
    // the feet level (their world turn the hips' alone), and counted for the ground too
    for (const sh of ["shinR", "shinL"]) { const f = r[sh + "Foot"]; if (!f) continue;
      // (b189: in the air the toes point down, the foot turned AIRTOE degrees heel up, eased with the jump)
      // (b131: sitting, the foot turns with its shin, keeping the angle it has standing, so with the legs out flat it
      // sticks up from the leg; otherwise level with the hips as before)
      const toe = act && act.air ? act.air * ${+(process.env.AIRTOE ?? 35)} : 0, lev = qmul(qinv(world[sh]), heel[sh] || toe ? qmul(qx((heel[sh] || 0) + toe), world.hips) : world.hips), sk = act ? Math.min(1, act.sit || 0) : 0, loc = sk ? slerp(lev, FOOTSTAND[sh] || [0, 0, 0, 1], sk) : lev;
      if (t >= 0.999 && !g && !(act && (act.sit || act.lay || act.climb || act.air))) FOOTSTAND[sh] = lev;
      f.quaternion = loc; const wq = qmul(world[sh], loc); footW[sh] = wq;
      const A = qrot(world[sh], FOOTAT[sh]).map((v, i) => v + at[sh][i]);
      if (!(heel[sh] > 1)) for (const p of BOXES[sh + "Foot"] || []) low = Math.min(low, qrot(wq, p)[1] + A[1]); }
    r.lowH = lowH; r.lowF = 1e9;
    for (const [id] of FEET) if (/^shin/.test(id)) for (const p of BOXES[id] || []) r.lowF = Math.min(r.lowF, qrot(world[id], p)[1] + at[id][1]);
    for (const sh of ["shinR", "shinL"]) { const f = r[sh + "Foot"]; if (!f) continue; const A = qrot(world[sh], FOOTAT[sh]).map((v, i) => v + at[sh][i]);
      for (const p of BOXES[sh + "Foot"] || []) r.lowF = Math.min(r.lowF, qrot(footW[sh] || world.hips, p)[1] + A[1]); }
    // b64: the ground from a smooth minimum of each support's lowest point (SOFTGROUND blocks wide), not the hard lowest,
    // so the body's bob has no kink when support passes from one limb to the next (offset by the stance's own support count, four on all fours to two standing, so a still pose
    // stands exactly on the ground; mid-stride it gives a few millimetres)
    { const lows = [], K = ${+(process.env.SOFTGROUND || 0.1)};
      for (const [id] of FEET) { if (noSup(id)) continue; let m = 1e9; for (const p of BOXES[id] || []) m = Math.min(m, qrot(world[id], p)[1] + at[id][1]); if (m < 1e8) lows.push(m); }
      // (b151: a hind foot rolling heel-up in its swing carries no weight, so it is not counted as support)
      for (const sh of ["shinR", "shinL"]) { const f = r[sh + "Foot"]; if (!f || heel[sh] > 1) continue; const A = qrot(world[sh], FOOTAT[sh]).map((v, i) => v + at[sh][i]); let m = 1e9;
        for (const p of BOXES[sh + "Foot"] || []) m = Math.min(m, qrot(footW[sh] || world.hips, p)[1] + A[1]); lows.push(m); }
      if (K > 0 && lows.length) { const m0 = Math.min(...lows); let sum = 0; for (const v of lows) sum += Math.exp(-(v - m0) / K); low = m0 - K * Math.log(sum) + K * Math.log(4 - 2 * t); } }
    // b73-b74: upright (walking or running) the body holds a steady height, the stride's running mean (UPBOB 0 of
    // the swing kept), so it does not bob with each step
    // (b120: sitting or lying, the body itself rests on the ground: its lowest point, of every part, counts as support)
    if (act && ((act.sit || 0) > 0 || (act.lay || 0) > 0)) { let m = 1e9;
      // (b178: lying, the bottom arm is not support (nor its forearm, LAYSINKFORE): its shoulder sinks into the ground and
      // the body lies flat, the torso and legs on the ground)
      const under = act.lay > 0 && ${process.env.LAYSINK !== "0"} ? "arm" + ("${process.env.LAYSIDE || "R"}" === "R" ? "L" : "R") : null;
      const underF = under && ${process.env.LAYSINKFORE !== "0"} ? under.replace("arm", "fore") : null;
      // (b179: sitting, the arms hang straight from the shoulders and their fists rest on the ground rather than propping
      // the body up: they are not support (SITSINK), so the seat and legs rest on the ground)
      const sitArms = (act.sit || 0) > 0 && !(act.lay > 0) && ${process.env.SITSINK !== "0"};
      for (const id of ["abdomen", "chest", "head", "armR", "armL", "foreR", "foreL", "legR", "legL", "shinR", "shinL"]) { if (id === under || id === underF || (sitArms && /^(arm|fore)/.test(id))) continue; for (const p of BOXES[id] || []) m = Math.min(m, qrot(world[id], p)[1] + at[id][1]); }
      low = Math.min(low, m); }
    r.rawLow = low;
    // (b138: walking on all fours too the body holds the stride's mean height (BOBHOLD4), so the arms planting and lifting
    // no longer bob the body and head; the gallop keeps its bound)
    const hold4 = (1 - Math.max(0, Math.min(1, t))) * (1 - Math.min(1, ((g && g.run) || 0) * 1.5)) * ${+(process.env.BOBHOLD4 ?? 1)};
    // (b182: none of it once fully sitting or lying; its mean found in the stance without the rest, and its re-pose left
    // the standing height behind, so a still gait lifted the lying body)
    const restK = act ? Math.min(1, (act.sit || 0) + (act.lay || 0)) : 0;
    if (g && !g.inner && (t > 0 || hold4 > 0) && restK < 1) {
      // the stride's mean height, found once per kind of stride (16 phases, cached), so it holds at any frame rate
      const key = [t.toFixed(2), (g.run || 0).toFixed(2), Math.round(g.amp), Math.round(g.lift), Math.round(g.sway)].join(",");
      let m = BOBMEAN.get(key);
      if (m === undefined) { let sum = 0; for (let i = 0; i < 16; i++) { pose(r, t, { ...g, phase: (i / 16) * Math.PI * 2, inner: true }); sum += r.rawLow; }
        m = sum / 16; if (BOBMEAN.size > 512) BOBMEAN.clear(); BOBMEAN.set(key, m); pose(r, t, { ...g, inner: true }, act); low = r.rawLow; }
      // (b182: sitting or lying the body rests on the ground: the walking hold (which finds a stride's mean height in the
      // stance without the rest) eases out with the rest, or a still gait lifted the lying body 5 blocks)
      const k = Math.max(Math.max(0, Math.min(1, t)) * (1 - ${+(process.env.UPBOB ?? 0)}), hold4) * (1 - restK); low = m + (low - m) * (1 - k);
      // (and lowered FEETDOWN4 blocks so the planted feet reach the ground; the arms give at the elbow for it)
      // (b142: standing still (stride 0) only FEETREST4 of it, so the body rests at the height it walks at, the elbows giving
      // as walking, and stops without popping up; it grows to the whole of it with the stride)
      low += (1 - restK) * hold4 * (${+(process.env.FEETREST4 ?? 0.12)} + (${+(process.env.FEETDOWN4 ?? 0.45)} - ${+(process.env.FEETREST4 ?? 0.12)}) * Math.min(1, (g.amp || 0) / 24));
    }
    if (act && !(g && g.inner) && ((act.air || 0) > 0 || (act.climb || 0) > 0)) {
      const key = t.toFixed(2); let s0 = STILL.get(key);
      if (s0 === undefined) { pose(r, t); s0 = r.rawLow; if (STILL.size > 256) STILL.clear(); STILL.set(key, s0); pose(r, t, g, { ...act, held: true }); }
      if (!act.held) { const k = Math.min(1, Math.max(act.air || 0, act.climb || 0)); low = s0 + (low - s0) * (1 - k); }
    }
    if (LR || CT) r.hips.quaternion = world.hips;
    r.root.position.y = -low * CELL; r.heel = heel;
    // (b138: with the body held level on all fours, each fist that would go under the ground folds its elbow until it
    // rests on it: a few passes, each adding the depth times GIVEGAIN degrees a block)
    if (g && !g.inner && !g.giving && hold4 > 0.01 && ${process.env.HANDGIVE !== "0"}) { const gv = { armR: 0, armL: 0, shinR: 0, shinL: 0 };
      for (let it = 0; it < ${+(process.env.GIVEITER ?? 6)}; it++) { let any = false;
        BL.scene.updateWorld(r.root); const ground = r.root.world[13] + low * CELL;
        for (const [arm, fore] of [["armR", "foreR"], ["armL", "foreL"]]) { const n = r[fore], V = n.geometry.verts, W = n.world; let lo = 1e9;
          for (let i = 0; i < V.length; i += 9) lo = Math.min(lo, W[1] * V[i] + W[5] * V[i + 1] + W[9] * V[i + 2] + W[13]);
          const depth = (ground - lo) / CELL; if (depth > 0.02) { gv[arm] += depth * ${+(process.env.GIVEGAIN ?? 9)}; any = true; } }
        for (const sh of ${process.env.TOEGIVE === "1" ? '["shinR", "shinL"]' : "[]"}) { const n = r[sh + "Foot"]; if (!n || !(heel[sh] > 1)) continue; const V = n.geometry.verts, W = n.world; let lo = 1e9;
          for (let i = 0; i < V.length; i += 3) lo = Math.min(lo, W[1] * V[i] + W[5] * V[i + 1] + W[9] * V[i + 2] + W[13]);
          // (the toes clear the ground by up to TOECLEAR blocks in the middle of the swing, so the foot doesn't drag)
          const depth = (ground - lo) / CELL + ${+(process.env.TOECLEAR ?? 0.8)} * Math.sin(Math.PI * (heelSw[sh] || 0)); if (depth > 0.02) { gv[sh] += depth * ${+(process.env.TOEGAIN ?? 8)}; any = true; } }
        if (!any) break; pose(r, t, { ...g, give: gv, giving: true }, act); r.root.position.y = -low * CELL; } }
    return r;
  };
  // A form made ready ahead of its first rig, a slice at a time (BL.buildTasks): its parts, then its torso's welds one
  // by one, each a few milliseconds; afterwards rig(sets.B, form) builds nothing but nodes
  const prepareSteps = function* (form, slice) { const pause = BL.buildTasks.pause;
    if (!SETS[form]) { const geos = yield* buildSteps(form, slice); if (!SETS[form]) SETS[form] = geos; yield* pause(slice); }
    const r = bare(sets.B, form); if (!r.abdomenFour) return;
    for (let k = 0; k < WELDS; k++) { const key = form + ":" + k; if (MERGED.has(key)) continue; MERGED.set(key, buildMerged(r, form, k / (WELDS - 1))); yield* pause(slice); } };
  const ready = (form) => !!SETS[form] && MERGED.has(form + ":" + (WELDS - 1));
  BL.clankerModel = { sets, rig, pose, prepareSteps, ready, parts: OUT, groups: [["head", ["head"]], ["torso", ["chest", "abdomen"]], ["upper-arms", ["armR", "armL"]], ["forearms-hands", ["foreR", "foreL"]], ["thighs", ["legR", "legL"]], ["shins-feet", ["shinR", "shinL"]]] };
})();
`);
console.log("waist", WST.map((v) => v.toFixed(2)).join(" "), Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.cells.length])));
