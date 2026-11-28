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
      if (part === "chest") return y > 0.47 && Math.abs(x) < 0.3 ? collar : opening(x, y, z, 0.05, 0.16, 0.55) ? null : coat;
      if (part === "belly") return coat;
      if (part === "arm") return coat;
      if (part === "fore") return y > WRIST ? coat : y > CUFF ? cuff : null;
      return null;
    }
  };
  SUITS.forEach((P, k) => { const [jacket, lapel, shirt, tie, trousers, shoe, belt, brass, knot] = P.map((h) => C(h));
    OUTFITS["suit" + k] = (part, x, y, z) => {
      if (part === "chest") { if (opening(x, y, z, 0.04, 0.15, 0.5)) return Math.abs(x) < 0.03 ? (y > 0.43 ? knot : tie) : shirt;
        if (opening(x, y, z, 0.07, 0.2, 0.5)) return lapel; return jacket; }
      if (part === "belly") { if (y < 0.05) return trousers; if (y < 0.11) return z > 0.3 && Math.abs(x) < 0.05 ? brass : belt;
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
  window.__dress = { paint, fit, box, height, torsoBox, OUTFITS };
})();
