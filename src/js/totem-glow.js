// The moving glow a repository totem runs for RECENT after its latest main/master PR merge (`totem-feed.js`'s `changedAt`).
//
// `bands(geo, step)` cuts a totem's rune geometry (`totemModels.glyphs(i)`) into horizontal slices `step` metres tall
// by each face's middle (empty ones dropped), so a pattern can travel up or down the pole whatever its shape.
// It returns `{ geometry, y }` per slice from the foot up (`y` the slice's middle in
// the totem's frame) and is memoised per geometry, so the first `step` asked stands. `pattern(word)` is the repository's pattern, a function
// (u, time, seed) -> 0..1, where u runs 0 at the lowest lit part of the pole to 1 at the highest: each fits its
// project. The hub samples it at every slice and eye each frame; the functions allocate nothing.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const RECENT = 24 * 3600000;
  const memo = new WeakMap();

  const bands = (geo, step) => {
    let list = memo.get(geo);
    if (list) return list;
    const v = geo.verts;
    let lo = Infinity, hi = -Infinity;
    for (let k = 1; k < v.length; k += 3) { lo = Math.min(lo, v[k]); hi = Math.max(hi, v[k]); }
    const n = Math.max(1, Math.ceil((hi - lo) / step));
    list = Array.from({ length: n }, (_, k) => ({ geometry: { verts: [], faces: [], lines: [], castShadow: geo.castShadow }, y: lo + (k + 0.5) * step, map: new Map() }));
    const slot = (indices) => {
      let y = 0;
      for (const i of indices) y += v[i * 3 + 1];
      return list[Math.max(0, Math.min(n - 1, Math.floor((y / indices.length - lo) / step)))];
    };
    const remap = (band, indices) => indices.map((i) => {
      let j = band.map.get(i);
      if (j === undefined) {
        j = band.geometry.verts.length / 3;
        band.geometry.verts.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
        band.map.set(i, j);
      }
      return j;
    });
    for (const f of geo.faces) { const band = slot(f.i); band.geometry.faces.push({ ...f, i: remap(band, f.i) }); }
    for (const l of geo.lines) { const band = slot(l.i); band.geometry.lines.push({ ...l, i: remap(band, l.i) }); }
    list = list.filter((band) => band.geometry.faces.length || band.geometry.lines.length).map(({ geometry, y }) => ({ geometry, y }));
    memo.set(geo, list);
    return list;
  };

  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const fract = (x) => x - Math.floor(x);
  const noise = (n) => fract(Math.sin(n * 12.9898 + 4.1) * 43758.5453);
  // A soft bump `w` wide round `at`, on a pole of height 1.
  const bump = (u, at, w) => { const d = (u - at) / w; return Math.exp(-d * d); };

  // Like the inner ramp stream's charge: a bright front with a softer wake, circling each painted band
  // continuously. The signed wrapped distance joins the end of a turn to its start without a dark pause.
  // `a` is distance round the ring in turns, `level` staggers the separating bands from foot to top.
  const ring = (a, t, level) => {
    const front = fract(t / 3.2 - level * 0.14);
    const behind = fract(front - a + 1.5) - 0.5;
    const leading = bump(behind, 0, 0.045);
    const wake = Math.exp(-Math.max(0, behind) / 0.09) * smooth((behind + 0.05) / 0.1);
    return 0.3 * leading + 0.7 * wake;
  };

  const PATTERNS = {
    // Bitcoin Core, the chain: blocks of light stack up the pole one at a time, the newest flashing as it lands, and
    // the whole column holds lit a moment before it clears and starts again.
    CORE: (u, t) => {
      const BLOCK = 0.55, ROWS = 7, cycle = (ROWS + 3) * BLOCK, p = (t % cycle) / BLOCK;
      const row = Math.floor(u * ROWS);
      if (row >= Math.floor(p)) return 0;
      const landed = p - row - 1, held = p > ROWS + 1.5 ? 1 - smooth((p - ROWS - 1.5) / 1.5) : 1;
      return Math.min(1, held * (0.7 + 0.3 * Math.exp(-landed * 3) + (row === Math.floor(p) - 1 ? 0.3 * Math.exp(-landed * 6) : 0)));
    },
    // BTCPay Server, payments arriving: bright tokens drop down the pole one after another and ring the foot.
    BTCPAY: (u, t) => {
      const period = 1.6, a = fract(t / period), b = fract(t / period + 0.5);
      return Math.min(1, bump(u, 1.05 - a * 1.1, 0.07) + bump(u, 1.05 - b * 1.1, 0.07) + 0.35 * Math.exp(-((1 - a) * period) * 4) * (1 - u));
    },
    // LND, lightning: strikes at uneven moments, running from the top to the foot in a blink and leaving an
    // afterglow, alternate slices brighter like a zigzag bolt.
    LND: (u, t, seed) => {
      const slot = Math.floor(t / 0.9), at = noise(slot + seed * 31) * 0.5, since = t - slot * 0.9 - at;
      if (since < 0 || noise(slot * 1.7 + seed) < 0.2) return 0.08;
      const front = 1 - since / 0.14;
      if (u < front) return 0.08;
      const zig = 0.75 + 0.25 * Math.sin(u * 40 + slot);
      return Math.max(0.08, zig * Math.exp(-since * 2.2));
    },
    // CLN, a mesh of peers: two gentle waves travel up the pole and overlap, so the glow ripples without rest.
    CLN: (u, t) => 0.5 + 0.3 * Math.sin((u * 2.2 - t * 0.7) * Math.PI * 2) + 0.2 * Math.sin((u * 3.7 - t * 1.1) * Math.PI * 2 + 1)
  };
  const pattern = (word) => PATTERNS[word] || PATTERNS.CLN;

  BL.totemGlow = { RECENT, bands, ring, pattern, PATTERNS };
})();
