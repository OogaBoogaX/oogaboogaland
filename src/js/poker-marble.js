// The Banana Club's marble kit: veined slabs, turned columns, stepped plinths and brass plaques, flat-coloured with no textures.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, hexToRgb = BL.math.hexToRgb;
  const WHITE = "#ece8e1", VEIN = "#a29c94", SHADE = "#cbc4b8", GOLD = "#c8a45f", CREAM = "#efe3c8", BRASS = "#b8924a";
  const LIFT = 0.004;
  // `lite` (set by the scene from the renderer, before it builds) halves the veins and the turning.
  let lite = false;
  const setLite = on => { lite = on; };
  const cache = M.scopedMap();
  const once = (key, build) => {
    if (cache.has(key)) return cache.get(key);
    const geo = build();
    cache.set(key, geo);
    return geo;
  };
  const veinCount = n => n ? lite ? Math.max(1, Math.floor(n / 2)) : n : 0;
  // One vein: a thin quad laid on a face with centre o, outward normal n and in-face axes t and s, wholly inside the
  // face's flat half spans hu and hv (the bevel already taken off), its angle, length, width and place drawn from `rand`.
  // The strip reaches |cos a| L/2 + |sin a| W/2 along t and |sin a| L/2 + |cos a| W/2 along s, so both bound the fit.
  const vein = (geo, o, n, t, s, hu, hv, rand, rgb) => {
    const a = rand() * Math.PI, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a)), c = Math.cos(a), sn = Math.sin(a);
    const width = Math.min(0.015 + rand() * 0.02, hu * 0.5, hv * 0.5);
    const fit = Math.max(0, Math.min((hu - sa * width / 2) / Math.max(ca, 1e-6), (hv - ca * width / 2) / Math.max(sa, 1e-6)));
    const length = fit * 2 * (0.5 + rand() * 0.45);
    const ru = Math.max(0, hu - ca * length / 2 - sa * width / 2), rv = Math.max(0, hv - sa * length / 2 - ca * width / 2);
    const cu = (rand() * 2 - 1) * ru, cv = (rand() * 2 - 1) * rv;
    const ids = [];
    for (const [l, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const u = cu + c * l * length / 2 - sn * k * width / 2, v = cv + sn * l * length / 2 + c * k * width / 2;
      ids.push(M.pushVert(geo, o[0] + t[0] * u + s[0] * v + n[0] * LIFT, o[1] + t[1] * u + s[1] * v + n[1] * LIFT, o[2] + t[2] * u + s[2] * v + n[2] * LIFT));
    }
    // The corners run counter-clockwise about t x s; turn them when that points into the stone.
    const cx = t[1] * s[2] - t[2] * s[1], cy = t[2] * s[0] - t[0] * s[2], cz = t[0] * s[1] - t[1] * s[0];
    M.face(geo, cx * n[0] + cy * n[1] + cz * n[2] < 0 ? ids.reverse() : ids, rgb);
  };
  // A bevelled slab centred on `offset`, its veins on its two largest opposite faces. When those are the top and the
  // underside (a floor tile, a tabletop, a panel laid flat and turned to its wall) every vein lies on the top, since the
  // underside is never seen; when they stand upright (a counter front, a wall panel built standing) the veins alternate
  // between the two. Ties go to the top, then to the z faces. `on` overrides the rule: "top" veins the top alone, and
  // "sides" goes round the four upright faces (+z, +x, -z, -x) from a face the seed picks, for a block whose top is
  // hidden, as a plinth's is under its statue.
  const slab = ({ w, h, d, seed, color = WHITE, veins = 6, offset = {}, on = "largest" }) => {
    const ox = offset.x || 0, oy = offset.y || 0, oz = offset.z || 0, count = veinCount(veins);
    return once(["slab", w, h, d, seed, color, count, ox, oy, oz, on].join(":"), () => {
      const bevel = Math.min(w, h, d, 0.3) * 0.2, geo = M.bevelBox({ w, h, d, color, bevel, offset: { x: ox, y: oy, z: oz } });
      const rand = BL.math.mulberry32(seed), rgb = hexToRgb(VEIN), top = w * d, front = w * h, side = d * h;
      const face = on === "sides" ? -1 : on === "top" || top >= front && top >= side ? 1 : front >= side ? 2 : 0;
      for (let i = 0; i < count; i++) {
        let axis = face, sign = i & 1 ? -1 : 1;
        if (face < 0) { const k = (seed + i) & 3; axis = k & 1 ? 0 : 2; sign = k & 2 ? -1 : 1; }
        if (axis === 1) vein(geo, [ox, oy + h / 2, oz], [0, 1, 0], [1, 0, 0], [0, 0, 1], w / 2 - bevel, d / 2 - bevel, rand, rgb);
        else if (axis === 2) vein(geo, [ox, oy, oz + sign * d / 2], [0, 0, sign], [1, 0, 0], [0, 1, 0], w / 2 - bevel, h / 2 - bevel, rand, rgb);
        else vein(geo, [ox + sign * w / 2, oy, oz], [sign, 0, 0], [0, 0, 1], [0, 1, 0], d / 2 - bevel, h / 2 - bevel, rand, rgb);
      }
      return geo;
    });
  };
  // A round shaft with a gold base and capital, base at y 0 and top at h.
  const column = ({ h, r = 0.42 }) => {
    const segments = lite ? 10 : 20;
    return once(["column", h, r, segments].join(":"), () => M.shaded([
      M.lathe({ segments, color: GOLD, profile: [[0, 0], [r * 1.3, 0], [r * 1.3, 0.12], [r * 1.15, 0.18], [r * 1.08, 0.3], [0, 0.3]] }),
      M.lathe({ segments, color: WHITE, profile: [[r, 0.3], [r * 0.94, h - 0.34]] }),
      M.lathe({ segments, color: GOLD, profile: [[0, h - 0.34], [r * 1.08, h - 0.34], [r * 1.2, h - 0.2], [r * 1.35, h - 0.12], [r * 1.35, h], [0, h]] })
    ]));
  };
  // A square stepped block: a darker foot, a body veined round its four sides (its top is under the statue), a gold band under a white cap, base at y 0 and top at h.
  const plinth = ({ w = 1.2, h = 0.9 } = {}) => once(["plinth", w, h, lite].join(":"), () => M.merge(
    M.bevelBox({ w, h: 0.14, d: w, color: SHADE, offset: { y: 0.07 } }),
    slab({ w: w - 0.16, h: h - 0.28, d: w - 0.16, seed: 41, veins: 4, on: "sides", offset: { y: 0.14 + (h - 0.28) / 2 } }),
    M.bevelBox({ w: w - 0.12, h: 0.05, d: w - 0.12, color: GOLD, offset: { y: h - 0.22 } }),
    M.bevelBox({ w, h: 0.14, d: w, color: WHITE, offset: { y: h - 0.07 } })
  ));
  // A faintly glowing brass plate, bottom edge at y 0 and back at z 0, facing +z.
  const plaque = ({ w = 0.7, h = 0.34 } = {}) => once(["plaque", w, h].join(":"), () =>
    M.bevelBox({ w, h, d: 0.035, color: BRASS, emissive: 0.25, bevel: 0.012, offset: { y: h / 2, z: 0.0175 } }));
  BL.pokerMarble = Object.freeze({ WHITE, VEIN, SHADE, GOLD, CREAM, BRASS, slab, column, plinth, plaque, setLite });
})();
