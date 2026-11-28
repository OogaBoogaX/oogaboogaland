// First-pass outfits for the new clanker (BL.clankerModel), for the side-by-side catalog only (evaluated in the page by
// render.mjs; not part of the game yet: the port moves what holds up into the game's own modules). window.__dress = { paint(r, outfit), fit(r, part, geometry, oldBox, opts),
// oldBoxes(agent), height(root) }.
(() => {
  const BL = window.BL, S = BL.scene, M = BL.models, hex = (h) => [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16));
  const SUITS = [
    ["#2f3136", "#1f2024", "#efe9d6", "#7a1f2b", "#26282c", "#1a1512", "#1f1a17", "#b8913a", "#55141d"],
    ["#1f2a44", "#141c30", "#efe9d6", "#c79a3e", "#1a2238", "#1a1512", "#1f1a17", "#b8913a", "#9a7428"],
    ["#4a5058", "#363b42", "#efe9d6", "#2f6b46", "#3d434a", "#1a1512", "#1f1a17", "#b8913a", "#1f4a30"]];
  const C = (h, e = 0) => ({ c: hex(h), e });
  // Each outfit: a rule per region, given the face's centre in its part's own frame; null keeps the fur.
  // Regions: chest (waist 0 up to the shoulders ~0.55, z forward), belly (hips -0.11 up to the waist, z forward), arm (the
  // upper arm), fore (forearm and fist, its wrist at about y -0.5, the fist below), leg, shin, foot, head.
  const WRIST = -0.5, CUFF = -0.56;
  const opening = (x, y, z, w0, w1, top) => z > 0.12 && Math.abs(x) < w0 + (w1 - w0) * Math.max(0, Math.min(1, y / top));
  const OUTFITS = {
    lab: (part, x, y, z) => {
      const coat = C("#f3f1df"), cuff = C("#c5ccd0"), collar = C("#e4e1cc");
      if (part === "chest") return opening(x, y, z, 0.2, 0.2, 0.55) ? (y > 0.4 && Math.abs(x) > 0.11 ? collar : null) : coat;
      if (part === "belly") return z > 0.15 && Math.abs(x) < 0.15 ? null : coat;
      if (part === "arm") return coat;
      if (part === "fore") return y > WRIST ? coat : y > CUFF ? cuff : null;
      return null;
    }
  };
  SUITS.forEach((P, k) => { const [jacket, lapel, shirt, tie, trousers, shoe, belt, brass, knot] = P.map((h) => C(h));
    OUTFITS["suit" + k] = (part, x, y, z) => {
      if (part === "chest") { if (opening(x, y, z, 0.04, 0.15, 0.5)) return Math.abs(x) < 0.03 ? (y > 0.43 ? knot : tie) : shirt;
        if (opening(x, y, z, 0.07, 0.2, 0.5)) return lapel; return jacket; }
      if (part === "belly") { if (y < 0.075) return trousers;
        if (opening(x, y - 0.11, z, 0.02, 0.04, 0.4)) return Math.abs(x) < 0.025 ? tie : shirt; return jacket; }
      if (part === "arm") return jacket;
      if (part === "fore") return y > WRIST ? jacket : y > CUFF ? shirt : null;
      if (part === "leg" || part === "shin") return trousers;
      if (part === "foot") return shoe;
      return null; }; });
  OUTFITS.hivis = (part, x, y, z) => { const navy = C("#24346b"), band = C("#f2c230", 0.25);
    if (part === "chest") return Math.abs(y - 0.2) < 0.035 ? band : navy;
    if (part === "belly") return y < 0.04 ? null : Math.abs(y - 0.3) < 0.035 ? band : navy;
    return null; };
  OUTFITS.poker = (part, x, y, z) => { const jacket = C("#292f33"), shirt = C("#e6e1ce"), gold = C("#c9a24a");
    if (part === "chest") return opening(x, y, z, 0.04, 0.12, 0.5) ? (Math.abs(x) < 0.03 ? gold : shirt) : jacket;
    if (part === "belly") return y < 0.0 ? null : jacket;
    if (part === "arm") return jacket;
    if (part === "fore") return y > WRIST ? jacket : y > CUFF ? shirt : null;
    return null; };
  // The Arcade staff's short sleeves: the uniform's red down the upper arm to one of its rings (they stand square to its
  // length every 0.025, so the cut runs cleanly across it), finished with a ring of gold piping.
  const SLEEVE = { piping: -0.12, cut: -0.145 };
  OUTFITS.staff = (part, x, y, z) => part === "arm" ? (y > SLEEVE.piping ? C("#b3322b") : y > SLEEVE.cut ? C("#f2b63e") : null) : null;
  // A copy of a geometry with its faces recoloured by a rule; cached by geometry and outfit.
  const cache = new Map();
  const painted = (geo, region, outfit) => {
    if (!geo || !geo.faces) return geo; let per = cache.get(geo); if (!per) cache.set(geo, per = new Map()); const key = region + "/" + outfit; if (per.has(key)) return per.get(key);
    const V = geo.verts, rule = OUTFITS[outfit], scale = geo.faces.some((f) => f.color.some((v) => v > 1)) ? 1 : 1 / 255;
    const faces = geo.faces.map((f) => { let x = 0, y = 0, z = 0; for (const i of f.i) { x += V[i * 3]; y += V[i * 3 + 1]; z += V[i * 3 + 2]; } const n = f.i.length;
      const r = rule(region, x / n, y / n, z / n); return r ? { ...f, color: r.c.map((v) => v * scale), emissive: r.e } : f; });
    const out = { ...geo, faces }; per.set(key, out); return out; };
  const REGION = { chest: "chest", armR: "arm", armL: "arm", foreR: "fore", foreL: "fore", legR: "leg", legL: "leg", shinR: "shin", shinL: "shin", shinRFoot: "foot", shinLFoot: "foot", head: "head" };
  const paint = (r, outfit) => {
    for (const [id, region] of Object.entries(REGION)) if (r[id] && r[id].geometry) r[id].geometry = painted(r[id].geometry, region, outfit);
    if (r.chestGeo) r.chestGeo = painted(r.chestGeo, "chest", outfit); if (r.chestWeld) r.chestWeld = painted(r.chestWeld, "chest", outfit);
    for (const n of [r.abdomenMesh, r.abdomenFour, ...(r.torsoWeld || [])]) if (n && n.geometry) n.geometry = painted(n.geometry, "belly", outfit);
    if (r.sleeveNode && r.sleeveNode.geometry) { const g = r.sleeveNode.geometry, V = g.verts, rule = OUTFITS[outfit], scale = g.faces.some((f) => f.color.some((v) => v > 1)) ? 1 : 1 / 255;
      // (the live sleeve between belly and chest is this rig's own: recoloured in place, as the waist (belly's top))
      for (const f of g.faces) { const c = rule("belly", 0, 0.3, -1); if (c) { f.color = c.c.map((v) => v * scale); f.emissive = c.e; } } }
  };
  // Bounds of a node's geometry in its own frame.
  const box = (geo) => { const b = S.boundsOf(geo); return { min: [...b.min], max: [...b.max] }; };
  // A rigid piece fitted from the old part's box to the new part's: its anchor (fractions of the box, per axis) kept, scaled
  // uniformly by the boxes' widths (or per axis with stretch).
  const fit = (node, geometry, oldBox, newBox, opts = {}) => {
    const s = opts.stretch ? [0, 1, 2].map((m) => (newBox.max[m] - newBox.min[m]) / (oldBox.max[m] - oldBox.min[m])) : Array(3).fill((newBox.max[0] - newBox.min[0]) / (oldBox.max[0] - oldBox.min[0]) * (opts.k || 1));
    const at = opts.at || [0, 0, 0], p = [0, 1, 2].map((m) => newBox.min[m] + (at[m] - oldBox.min[m]) / (oldBox.max[m] - oldBox.min[m]) * (newBox.max[m] - newBox.min[m]));
    const n = S.createNode({ geometry, position: { x: p[0], y: p[1], z: p[2] }, scale: { x: s[0], y: s[1], z: s[2] }, rotation: opts.rotation || { x: 0, y: 0, z: 0 } }); S.addChild(node, n); return n; };
  const height = (root) => { S.updateWorld(root); let lo = 1e9, hi = -1e9; (function w(n) { if (n.visible === false) return; if (n.geometry && n.geometry.verts) { const V = n.geometry.verts, W = n.world; for (let i = 0; i < V.length; i += 3) { const yv = W[1] * V[i] + W[5] * V[i + 1] + W[9] * V[i + 2] + W[13]; lo = Math.min(lo, yv); hi = Math.max(hi, yv); } } for (const c of n.children || []) w(c); })(root); return hi - lo; };
  // The new torso standing, in the belly's frame: the standing belly piece and the chest carried into the belly's frame.
  const torsoBox = (r) => { S.updateWorld(r.root); const A = r.abdomen.world, inv = (p) => { const d = [p[0] - A[12], p[1] - A[13], p[2] - A[14]]; return [A[0] * d[0] + A[1] * d[1] + A[2] * d[2], A[4] * d[0] + A[5] * d[1] + A[6] * d[2], A[8] * d[0] + A[9] * d[1] + A[10] * d[2]].map((v, m) => v / Math.hypot(A[m * 4], A[m * 4 + 1], A[m * 4 + 2]) ** 2); };
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const n of [r.chest, ...(r.torsoWeld || []).filter((n) => n.visible)]) { const V = n.geometry.verts, W = n.world; for (let i = 0; i < V.length; i += 3) { const p = inv([0, 1, 2].map((m) => W[m] * V[i] + W[4 + m] * V[i + 1] + W[8 + m] * V[i + 2] + W[12 + m])); for (let m = 0; m < 3; m++) { lo[m] = Math.min(lo[m], p[m]); hi[m] = Math.max(hi[m], p[m]); } } }
    return { min: lo, max: hi }; };
  // Where a hat sits on the new head: the head's slices measured once a geometry (its half-width across, and its depth
  // front to back); the brim's line is the first slice above the ears (HATLINE up) narrower than the ears, and the hat is
  // scaled so the old skull's top (0.6 up, 0.3 half-width, its middle 0.085 forward) lands there at the head's own
  // half-width, centred over the skull's middle front to back.
  const hatPlaces = new Map(), OLD_SKULL = { top: 0.6, half: 0.3, mid: 0.085 };
  const hatPlace = (geo) => { if (hatPlaces.has(geo)) return hatPlaces.get(geo); const V = geo.verts, slice = (y0, y1) => { let hx = 0, z0 = 1e9, z1 = -1e9, n = 0;
      for (let i = 0; i < V.length; i += 3) if (V[i + 1] >= y0 && V[i + 1] < y1) { n++; hx = Math.max(hx, Math.abs(V[i])); z0 = Math.min(z0, V[i + 2]); z1 = Math.max(z1, V[i + 2]); } return n ? { hx, z0, z1 } : null; };
    let ears = 0; for (let y = 0.2; y < 0.45; y += 0.02) { const s2 = slice(y, y + 0.02); if (s2) ears = Math.max(ears, s2.hx); }
    let line = 0.45; for (let y = 0.3; y < 0.62; y += 0.01) { const s2 = slice(y, y + 0.02); if (s2 && s2.hx < ears - 0.02) { line = y; break; } }
    const at = slice(line, line + 0.03), half = Math.max(at.hx, (at.z1 - at.z0) / 2) * 1.04, place = { line, half, mid: (at.z0 + at.z1) / 2, s: half / OLD_SKULL.half };
    hatPlaces.set(geo, place); return place; };
  // A hat built in the old head's frame, put on the new head (the anchor: where the old game placed it in the old head).
  const hat = (head, geometry, anchor = [0, 0, 0]) => { const P = hatPlace(head.geometry), s = P.s;
    const n = S.createNode({ geometry, position: { x: anchor[0] * s, y: P.line + (anchor[1] - OLD_SKULL.top) * s, z: P.mid + (anchor[2] - OLD_SKULL.mid) * s }, scale: { x: s, y: s, z: s } }); S.addChild(head, n); return n; };
  // The new torso's surface, standing, in the belly's frame: its triangles (chest, the belly piece shown, the live sleeve;
  // `top` adds the upper arms, for what lies over the shoulders), binned by height, with a horizontal and a downward ray.
  const surfaces = new WeakMap();
  const surface = (r) => { if (surfaces.has(r)) return surfaces.get(r); S.updateWorld(r.root); const A = r.abdomen.world, sc = [0, 1, 2].map((m) => A[m * 4] ** 2 + A[m * 4 + 1] ** 2 + A[m * 4 + 2] ** 2);
    const inv = (x, y, z) => { const d = [x - A[12], y - A[13], z - A[14]]; return [0, 1, 2].map((m) => (A[m * 4] * d[0] + A[m * 4 + 1] * d[1] + A[m * 4 + 2] * d[2]) / sc[m]); };
    const tris = (nodes) => { const out = []; for (const n of nodes) { if (!n || !n.geometry || n.visible === false) continue; const V = n.geometry.verts, W = n.world, P = [];
        for (let i = 0; i < V.length; i += 3) P.push(inv(W[0] * V[i] + W[4] * V[i + 1] + W[8] * V[i + 2] + W[12], W[1] * V[i] + W[5] * V[i + 1] + W[9] * V[i + 2] + W[13], W[2] * V[i] + W[6] * V[i + 1] + W[10] * V[i + 2] + W[14]));
        for (const f of n.geometry.faces) for (let k = 1; k + 1 < f.i.length; k++) out.push([P[f.i[0]], P[f.i[k]], P[f.i[k + 1]]]); } return out; };
    const body = tris([r.chest, ...(r.torsoWeld || []), r.sleeveNode]), arms = tris([r.armR, r.armL]), over = body.concat(arms);
    const BIN = 0.02, bins = new Map(); for (const t of body) { const lo = Math.floor(Math.min(t[0][1], t[1][1], t[2][1]) / BIN), hi = Math.floor(Math.max(t[0][1], t[1][1], t[2][1]) / BIN); for (let b = lo; b <= hi; b++) { if (!bins.has(b)) bins.set(b, []); bins.get(b).push(t); } }
    let y0 = 1e9, y1 = -1e9; for (const t of body) for (const p of t) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    // a ray (o, d) against a triangle: its distance, or -1
    const hit = (o, d, t) => { const e1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
      const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) return -1;
      const s0 = [o[0] - t[0][0], o[1] - t[0][1], o[2] - t[0][2]], u = (s0[0] * p[0] + s0[1] * p[1] + s0[2] * p[2]) / det; if (u < 0 || u > 1) return -1;
      const q = [s0[1] * e1[2] - s0[2] * e1[1], s0[2] * e1[0] - s0[0] * e1[2], s0[0] * e1[1] - s0[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (v < 0 || u + v > 1) return -1;
      return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; };
    const normal = (t) => { const e1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], e2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1; return n.map((v) => v / l); };
    // the outermost crossing of a horizontal ray from (0, y, cz) toward (dx, dz): { t, n } with n the outward normal flattened
    const side = (y, cz, dx, dz) => { y = Math.max(y0 + 0.005, Math.min(y1 - 0.005, y)); const l = Math.hypot(dx, dz) || 1, d = [dx / l, 0, dz / l], o = [0, y, cz]; let best = null;
      for (const t of bins.get(Math.floor(y / BIN)) || []) { const k = hit(o, d, t); if (k > 0 && (!best || k > best.t)) best = { t: k, tri: t }; }
      if (!best) return null; let n = normal(best.tri); n = [n[0], 0, n[2]]; const nl = Math.hypot(n[0], n[2]) || 1; n = [n[0] / nl, 0, n[2] / nl]; if (n[0] * d[0] + n[2] * d[2] < 0) n = [-n[0], 0, -n[2]];
      return { y, p: [d[0] * best.t, y, cz + d[2] * best.t], n }; };
    // the topmost crossing straight down at (x, z), the upper arms included
    const top = (x, z) => { let best = -1e9, arm = false; for (const t of over) { const k = hit([x, 5, z], [0, -1, 0], t); if (k > 0 && 5 - k > best) { best = 5 - k; arm = arms.includes(t); } } return best > -1e8 ? { h: best, arm } : null; };
    // the middle front to back and the half-width at a height
    const slice = (y) => { const f = side(y, 0.1, 0, 1), b = side(y, 0.1, 0, -1), x = side(y, 0.1, 1, 0); return f && b && x ? { hx: x.p[0], hz: (f.p[2] - b.p[2]) / 2, cz: (f.p[2] + b.p[2]) / 2 } : { hx: 0.3, hz: 0.3, cz: 0.1 }; };
    const out = { side, top, slice, y0, y1 }; surfaces.set(r, out); return out; };
  // A geometry's faces split until no edge is longer than `edge` (shared vertices kept shared), so a flat piece bends.
  const subdivide = (geo, edge) => { const V = [...geo.verts], mids = new Map(), at = (i) => [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]];
    const mid = (a, b) => { const k = a < b ? a + "," + b : b + "," + a; if (mids.has(k)) return mids.get(k); const p = at(a), q = at(b), n = V.length / 3; V.push((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2); mids.set(k, n); return n; };
    const len = (a, b) => { const p = at(a), q = at(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
    const faces = []; const split = (f, a, b, c, depth) => { const ab = len(a, b), bc = len(b, c), ca = len(c, a), m = Math.max(ab, bc, ca);
      if (m <= edge || depth > 8) { faces.push({ ...f, i: [a, b, c] }); return; }
      if (m === ab) { const d = mid(a, b); split(f, a, d, c, depth + 1); split(f, d, b, c, depth + 1); } else if (m === bc) { const d = mid(b, c); split(f, a, b, d, depth + 1); split(f, a, d, c, depth + 1); } else { const d = mid(c, a); split(f, a, b, d, depth + 1); split(f, d, b, c, depth + 1); } };
    for (const f of geo.faces) for (let k = 1; k + 1 < f.i.length; k++) split(f, f.i[0], f.i[k], f.i[k + 1], 0);
    return { ...geo, verts: V, faces }; };
  // Normals again after the verts moved: each vertex the mean of the faces using it (a flat piece's own vertices are its
  // own, so it stays flat).
  const renormal = (geo) => { const V = geo.verts, N = new Array(V.length).fill(0);
    for (const f of geo.faces) { const [a, b, c] = f.i, e1 = [0, 1, 2].map((m) => V[b * 3 + m] - V[a * 3 + m]), e2 = [0, 1, 2].map((m) => V[c * 3 + m] - V[a * 3 + m]), n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const i of f.i) for (let m = 0; m < 3; m++) N[i * 3 + m] += n[m]; }
    for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } geo.normals = N; return geo; };
  // The old gorilla's torso as the vests were modelled on it: its box half-width by height, its depth, its top, where its
  // arms hang from and where its legs do (y 0).
  const OLD = { hx: (y) => y < 0.15 ? 0.34 : y < 0.55 ? 0.43 : 0.6, hz: 0.3, top: 1.118, arm: 0.946 };
  // A piece modelled on the old box torso, shrink-wrapped onto the new one (in the belly's frame): each vertex keeps how far
  // it stood off the old surface (`hug` of it, the rest taken up), over the matching point of the new surface: down onto
  // the shoulders for what lay over the old torso's top, in toward the middle for what lay round its sides; heights map
  // hips to hips and arms to arms. Cached by geometry and rig.
  const wraps = new WeakMap();
  const wrap = (r, geometry, opts = {}) => { let per = wraps.get(geometry); if (!per) wraps.set(geometry, per = new WeakMap()); if (per.has(r)) return per.get(r);
    const W = surface(r), hip = -0.207, armY = 0.711, ky = (armY - hip) / OLD.arm, hug = opts.hug == null ? 0.55 : opts.hug, gap = opts.gap == null ? 0.008 : opts.gap;
    const g = subdivide(geometry, opts.edge || 0.035), V = g.verts, out = new Array(V.length), onArm = new Set();
    for (let i = 0; i < V.length; i += 3) { const x = V[i], y = V[i + 1], z = V[i + 2], hx = OLD.hx(y), sideOut = Math.max(Math.abs(x) - hx, Math.abs(z) - OLD.hz), topOut = y - OLD.top;
      let p = null;
      if (topOut > sideOut && Math.abs(x) < 0.75) { const s0 = W.slice(armY), nx = x * (0.51 / 0.516), nz = s0.cz + z * (s0.hz / OLD.hz), h = W.top(nx, nz);
        if (h != null) { p = [nx, h.h + gap + Math.max(0, topOut) * hug, nz]; if (h.arm) onArm.add(i / 3); } }
      if (!p) { const ny = hip + y * ky, s = W.slice(ny), ux = x / hx, uz = z / OLD.hz, dx = ux * s.hx, dz = uz * s.hz; let hit = W.side(ny, s.cz, dx, dz);
        // cloth hangs straight down off the widest of the body above it (an apron off the belly, tails off the seat)
        if (ny < 0.3) for (let h = ny + 0.03; h < Math.min(0.3, ny + 0.45); h += 0.03) { const up = W.side(h, s.cz, dx, dz); if (up && (!hit || Math.hypot(up.p[0], up.p[2] - s.cz) > Math.hypot(hit.p[0], hit.p[2] - s.cz))) hit = { ...up, p: [up.p[0], ny, up.p[2]] }; }
        if (hit) { const d = gap + Math.max(0, sideOut) * hug; p = [hit.p[0] + hit.n[0] * d, ny, hit.p[2] + hit.n[2] * d]; } else p = [x, ny, z]; }
      out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; }
    // what came down on the upper arm is left off (the sleeve is painted there, and the arm swings apart from the belly),
    // all but gold (the gamemaster's epaulettes)
    const gold = (c) => { const m = Math.max(...c) || 1; return c[0] / m > 0.9 && c[1] / m > 0.6 && c[1] / m < 0.85 && c[2] / m < 0.4; };
    const faces = g.faces.filter((f) => !f.i.every((k) => onArm.has(k)) || gold(f.color));
    const made = renormal({ ...g, verts: out, faces }); per.set(r, made); return made; };
  // A belt of one height all round the waist (in the belly's frame, at `y`): a band standing `off` out from the body,
  // `h` tall, with its top and bottom edges, and a buckle at the front. Cached by rig.
  const belts = new WeakMap();
  const belt = (r, opts = {}) => { const key = JSON.stringify(opts); let per = belts.get(r); if (!per) belts.set(r, per = new Map()); if (per.has(key)) return per.get(key);
    const W = surface(r), y = opts.y == null ? 0.075 : opts.y, h = opts.h || 0.045, off = opts.off || 0.012, n = 64, s = W.slice(y), col = hex(opts.color || "#1f1a17").map((v) => v / 255), brass = hex(opts.brass || "#b8913a").map((v) => v / 255);
    const ring = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, rays = [y - h / 2, y + h / 2].map((yy) => W.side(yy, s.cz, Math.sin(a), Math.cos(a))); ring.push(rays); }
    // the band's outer face follows the widest of its two edges at each angle, so its height is the same all round
    const verts = [], faces = [], push = (p) => { verts.push(...p); return verts.length / 3 - 1; };
    const R = ring.map(([lo, hi], k) => { const a = k / n * Math.PI * 2, d = [Math.sin(a), Math.cos(a)], t = Math.max(Math.hypot(lo.p[0], lo.p[2] - s.cz), Math.hypot(hi.p[0], hi.p[2] - s.cz)) + off;
      return { out: [d[0] * t, s.cz + d[1] * t], in: [d[0] * (t - off - 0.004), s.cz + d[1] * (t - off - 0.004)] }; });
    for (let k = 0; k < n; k++) { const A = R[k], B = R[(k + 1) % n];
      const q = [push([A.out[0], y - h / 2, A.out[1]]), push([B.out[0], y - h / 2, B.out[1]]), push([B.out[0], y + h / 2, B.out[1]]), push([A.out[0], y + h / 2, A.out[1]])];
      faces.push({ i: [q[0], q[1], q[2], q[3]].reverse(), color: col });
      const t = [push([A.in[0], y + h / 2, A.in[1]]), push([A.out[0], y + h / 2, A.out[1]]), push([B.out[0], y + h / 2, B.out[1]]), push([B.in[0], y + h / 2, B.in[1]])]; faces.push({ i: t.reverse(), color: col });
      const b = [push([A.in[0], y - h / 2, A.in[1]]), push([B.in[0], y - h / 2, B.in[1]]), push([B.out[0], y - h / 2, B.out[1]]), push([A.out[0], y - h / 2, A.out[1]])]; faces.push({ i: b.reverse(), color: col }); }
    const geo = { verts, faces, lines: [] }; const front = R[0].out, bw = opts.buckle || 0.075, bh = h + 0.014, bd = 0.012, bz = front[1] + 0.004;
    const buckle = M.box({ w: bw, h: bh, d: bd, color: opts.brass || "#b8913a", offset: { x: 0, y, z: bz + bd / 2 } }), hole = M.box({ w: bw * 0.55, h: bh * 0.5, d: 0.004, color: opts.color || "#1f1a17", offset: { x: 0, y, z: bz + bd + 0.002 } });
    const made = M.merge(geo, buckle, hole); per.set(key, made); return made; };
  window.__dress = { paint, fit, box, height, torsoBox, hat, hatPlace, wrap, belt, surface, OUTFITS };
})();
