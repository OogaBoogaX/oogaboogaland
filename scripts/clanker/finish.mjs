// The finishing pass build.mjs runs over every part as authored (FINISH=0 skips it; the .txt files are never changed).
// It works on the whole standing gorilla in the sheet's coordinates, so a shoulder cap, its upper arm and the chest
// shade into one another across part boundaries.
//
// 1. Clean-up: a 26-neighbour majority filter. A block with few neighbours, or touching only one or two faces (a nub
//    sticking off a face or a corner) goes,
//    and a notch or hole with nearly every neighbour filled is filled in with its neighbours' commonest grey, so the
//    silhouettes read as the reference's smooth slabs. Two passes.
// 2. Shading, the reference's black-to-grey ombré. Each grey is mixed with a blur of the greys around it, so silver
//    meets black through a band of mid greys rather than at a hard edge; a silver region is lightest at its top and
//    darkens down toward the black below it (the shoulders, saddle and chest all fade downward on the reference);
//    the band between them is mottled; and the black fur takes short vertical streaks of dark grey, as the
//    reference's limbs do. Eyes, nostrils and the fine boxes are left alone.
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], GREYS = 12, KEEP = new Set([12, 13, 14]);
// c and d (15, 16), lighter than b, are only painted (the chest's fitted front, which shading passes over); in the
// blur they count as b.
const hash = (x, y, z, s) => ((Math.imul(x + 101, 73856093) ^ Math.imul(y + 37, 19349663) ^ Math.imul(z + 59, 83492791) ^ Math.imul(s, 2654435761)) >>> 0) / 4294967296;
export const finish = (parts, opts = {}) => {
  const { passes = 2, drop = 7, fill = 17 } = opts;
  const at = new Map(), K = (x, y, z) => x + "," + y + "," + z;
  const off = Object.fromEntries(Object.entries(parts).map(([id, P]) => [id, P.offset.map(Math.round)]));
  // Where two parts overlap (a shoulder inside the chest) one block stands for both in the counts; the other is kept
  // in `under` and takes the same grey, or goes with it.
  const under = [];
  for (const [id, P] of Object.entries(parts)) for (const [x, y, z, k] of P.cells) {
    const g = [Math.round(x + P.offset[0]), y + P.offset[1], z + P.offset[2]], key = K(...g);
    if (at.has(key)) under.push({ id, g, key }); else at.set(key, { id, g, k });
  }
  const around = (x, y, z, f) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) if (i || j || l) f(x + i, y + j, z + l); };
  let removed = 0, added = 0;
  for (let p = 0; p < passes; p++) {
    const gone = [], grow = new Map();
    for (const [key, c] of at) {
      if (KEEP.has(c.k)) continue;
      let n = 0; around(...c.g, (x, y, z) => { if (at.has(K(x, y, z))) n++; else grow.set(K(x, y, z), [x, y, z]); });
      // Face neighbours too: a lone block on a flat face has nine neighbours behind it but only one face touching,
      // and a block on two faces is the end of a one-block nub or fin. Neither is in the reference's slabs.
      const [x, y, z] = c.g; let f = 0;
      for (const [i, j, l] of FACES) if (at.has(K(x + i, y + j, z + l))) f++;
      const knuckle = c.k >= 7 && y <= 1 && /^(fore|shin)/.test(c.id);
      if (!knuckle && (n <= drop || f <= 2)) gone.push(key);
    }
    const born = [];
    for (const [key, g] of grow) {
      const ids = new Map(), ks = new Map(); let n = 0;
      around(...g, (x, y, z) => { const c = at.get(K(x, y, z)); if (!c || KEEP.has(c.k)) return; n++; ids.set(c.id, (ids.get(c.id) || 0) + 1); ks.set(c.k, (ks.get(c.k) || 0) + 1); });
      if (n >= fill) born.push([key, { id: [...ids].sort((a, b) => b[1] - a[1])[0][0], g, k: [...ks].sort((a, b) => b[1] - a[1])[0][0] }]);
    }
    for (const key of gone) at.delete(key);
    for (const [key, c] of born) at.set(key, c);
    removed += gone.length; added += born.length;
  }
  // Shading. The chest's front blocks that are painted (its front face and the one behind) are passed over.
  const fitted = new Set();
  for (const [key, c] of at) { const [x, y, z] = c.g; if (c.id === "chest" && y >= 8 && y <= 20 && x >= -7 && x <= 6 && !at.has(K(x, y, z + 2))) fitted.add(key); }
  const B = new Map([...at].filter(([, c]) => !KEEP.has(c.k)).map(([key, c]) => [key, Math.min(c.k, 11)]));
  const silver = (k) => k >= 7;
  for (const [key, c] of at) {
    if (KEEP.has(c.k)) continue;
    const [x, y, z] = c.g;
    let s = 0, w = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let l = -2; l <= 2; l++) {
      const k = B.get(K(x + i, y + j, z + l)); if (k === undefined) continue;
      const q = Math.exp(-(i * i + j * j + l * l) / 2.2); s += q * k; w += q;
    }
    const S = s / w, b = B.get(key);
    // The chest's front keeps its painted and fitted colours (claude/upper-spec.mjs, claude/pec-fit.mjs): the pecs'
    // ombré outline is drawn a block at a time, and blurring would wash it out.
    if (fitted.has(key)) continue;
    // The pale knuckles and toes stay pale and crisp, as on the reference (light grey bands between black gaps).
    if (silver(b) && y <= 1 && /^(fore|shin)/.test(c.id)) { c.k = Math.max(b, 10); continue; }
    let v = silver(b) ? 0.6 * b + 0.4 * S : 0.4 * b + 0.6 * S;
    // Dark fur a few rows under silver in its own column carries the fade on down (the shoulders' silver runs down
    // the upper arm on the reference before it is black).
    let up = 0; if (!silver(b)) { while (up < 4 && !silver(B.get(K(x, y + up + 1, z)) ?? 0)) up++; }
    const fade = !silver(b) && up < 4 ? (4 - up) * 0.85 : 0;
    v += fade;
    if (silver(b) || S > 5) {
      // How far this block sits above the silver's lower edge, in its own column: the top lightest.
      let below = 0; while (below < 5 && silver(B.get(K(x, y - below - 1, z)) ?? 0)) below++;
      let above = 0; while (above < 3 && B.has(K(x, y + above + 1, z))) above++;
      v += 0.55 * (below - 2) + (above === 0 ? 0.6 : 0) + (hash(x, y, z, 5) - 0.5) * 1.6;
    }
    const smooth = c.id === "chest" && z >= 16 && silver(b);   // the chest's pecs read as smooth slabs
    if (S > 3.2 && S < 7.5 && !smooth) v += (hash(x, y, z, 1) - 0.5) * 2.8 - 0.3;           // the mottled band between black and silver
    else if (S <= 3.2 && !fade) {
      // Fur streaks: a column's run of five blocks, staggered, now and then a shade or two lighter or darker.
      const r = hash(x, Math.floor((y + Math.floor(hash(x, 0, z, 2) * 5)) / 5), z, 3);
      v = Math.min(5, v - 1.4 + (r < 0.2 ? 4 : r < 0.42 ? 2 : r > 0.88 ? -0.7 : 0));
    } else v += (hash(x, y, z, 4) - 0.5) * (fade ? 2.4 : smooth ? 0.35 : 1.0);                           // silver, gently mottled
    c.k = Math.max(0, Math.min(GREYS - 1, Math.round(v)));
  }
  for (const P of Object.values(parts)) P.cells = [];
  for (const c of at.values()) { const o = off[c.id]; parts[c.id].cells.push([c.g[0] - o[0], c.g[1] - o[1], c.g[2] - o[2], c.k]); }
  for (const u of under) { const c = at.get(u.key); if (!c) continue; const o = off[u.id]; parts[u.id].cells.push([u.g[0] - o[0], u.g[1] - o[1], u.g[2] - o[2], c.k]); }
  return { removed, added };
};
