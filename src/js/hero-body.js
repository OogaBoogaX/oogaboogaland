// The modelled look, every Ooga's: a body modelled from scratch after the reference art, in place of the
// one drawn from a character's block maps. Flat planes with crisp bevels: every limb is a loft of eight-sided rings
// (a rectangle with its corners cut), plates and features are slabs stood on them, and fur is flat pointed shards.
// Nothing here is smooth shaded, and a head keeps its authored blocks where its character has them. Units are a sixteenth of the
// Ooga's height (`k.u`), in each rig part's own frame: a leg and an arm hang from their pivots, the torso stands on
// the hip, a hand sits about the rig's hand point (five eighths of the height down the arm), fingers to +z.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { geometry, pushVert, face, merge, makeVox, voxelGeometry } = BL.models, { hexToRgb } = BL.math;
  const rgb = (c) => typeof c === "string" ? hexToRgb(c) : c;
  const shade = (c, k) => rgb(c).map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  // A flat polygon of [x, y, z] points, wound so it faces `out`.
  const poly = (geo, pts, color, out, emissive = 0) => {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const list = out && nx * out[0] + ny * out[1] + nz * out[2] < 0 ? pts.slice().reverse() : pts;
    face(geo, list.map((p) => pushVert(geo, p[0], p[1], p[2])), rgb(color), { emissive });
  };
  // The same polygon seen from both sides, for cloth and fur.
  const both = (geo, pts, color, back = color) => {
    face(geo, pts.map((p) => pushVert(geo, p[0], p[1], p[2])), rgb(color));
    face(geo, pts.map((p) => pushVert(geo, p[0], p[1], p[2])).reverse(), rgb(back));
  };
  // A ring: a rectangle hx by hz about (cx, cz) at height y, its corners cut by `b`; `back`, as [across, along],
  // cuts its two rear corners by that much instead, which tapers a heel; `tilt` drops its front and lifts its back
  // by that much a unit, for a ring that must sit level on a part that leans. `toe`, as [way, lag, across, along], draws
  // a foot's front back toward its outer side `way` (-1 or 1): that front corner is cut by `across` and `along`
  // instead, and the front runs back by `lag` from the other corner to it.
  const octagon = ([y, hx, hz, b, cx = 0, cz = 0, back, tilt = 0, toe]) => {
    const bx = Math.min(b, hx * 0.9), bz = Math.min(b, hz * 0.9), rx = back ? back[0] : bx, rz = back ? back[1] : bz;
    const [way, lag, ax, az] = toe || [0], cut = (side) => side === way ? [ax, az, lag] : [bx, bz, 0], [px, pz, pl] = cut(1), [mx, mz, ml] = cut(-1);
    return [[cx + hx - px, hz - pl], [cx + hx, hz - pz], [cx + hx, rz - hz], [cx + hx - rx, -hz], [cx - hx + rx, -hz], [cx - hx, rz - hz], [cx - hx, hz - mz], [cx - hx + mx, hz - ml]]
      .map(([x, z]) => [x, y - z * tilt, cz + z]);
  };
  // Rings joined into a solid: `sections` are [y, hx, hz, bevel, cx, cz] in order, `colors` one colour or one a span.
  const loft = (geo, sections, colors, caps = [true, true]) => {
    const rings = sections.map(octagon), many = Array.isArray(colors) && typeof colors[0] !== "number";
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i], b = rings[i + 1], color = many ? colors[Math.min(i, colors.length - 1)] : colors;
      const mx = ((sections[i][4] || 0) + (sections[i + 1][4] || 0)) / 2, mz = ((sections[i][5] || 0) + (sections[i + 1][5] || 0)) / 2;
      for (let j = 0; j < 8; j++) {
        const n = (j + 1) % 8, q = [a[j], a[n], b[n], b[j]];
        poly(geo, q, color, [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4 - mx, 0, (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 - mz]);
      }
    }
    const last = rings.length - 1;
    if (caps[0]) poly(geo, rings[0], many ? colors[0] : colors, [0, sections[0][0] - sections[1][0], 0]);
    if (caps[1]) poly(geo, rings[last], many ? colors[Math.min(last - 1, colors.length - 1)] : colors, [0, sections[last][0] - sections[last - 1][0], 0]);
    return geo;
  };
  // A plate stood on a surface: `outline` its foot (coplanar points), raised `depth` along `n` and drawn in to
  // `shrink` of its size at the top, so its sides are bevels.
  const slab = (geo, outline, n, depth, shrink, color, side = color, emissive = 0) => {
    const c = [0, 0, 0];
    for (const p of outline) { c[0] += p[0] / outline.length; c[1] += p[1] / outline.length; c[2] += p[2] / outline.length; }
    const top = outline.map((p) => [c[0] + (p[0] - c[0]) * shrink + n[0] * depth, c[1] + (p[1] - c[1]) * shrink + n[1] * depth, c[2] + (p[2] - c[2]) * shrink + n[2] * depth]);
    poly(geo, top, color, n, emissive);
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      poly(geo, [outline[i], outline[j], top[j], top[i]], side, [(outline[i][0] + outline[j][0]) / 2 - c[0], (outline[i][1] + outline[j][1]) / 2 - c[1], (outline[i][2] + outline[j][2]) / 2 - c[2]], emissive);
    }
    return geo;
  };
  // A nose: `outline` its foot on the face, out `depth` along `n` as a slab is, but its front is not one flat plane.
  // Its sides run straight for half its depth, then turn in over two bevels to a small facet at its tip, which sits
  // a little under its middle (`NOSE`: how far out each ring is, how much of the foot's size it keeps, and how far
  // down the nose's height it has moved), so the bridge slopes more than the underside. It is as wide, tall and
  // deep as the slab it replaces.
  const NOSE = [[0.5, 0.97, 0], [0.8, 0.82, 0.03], [1, 0.46, 0.08]];
  const noseBlock = (geo, outline, n, depth, color, side = color) => {
    const c = [0, 0, 0];
    let y0 = Infinity, y1 = -Infinity;
    for (const p of outline) { c[0] += p[0] / outline.length; c[1] += p[1] / outline.length; c[2] += p[2] / outline.length; y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    let ring = outline;
    NOSE.forEach(([part, keep, drop], stage) => {
      const next = outline.map((p) => [c[0] + (p[0] - c[0]) * keep + n[0] * depth * part, c[1] + (p[1] - c[1]) * keep + n[1] * depth * part - (y1 - y0) * drop, c[2] + (p[2] - c[2]) * keep + n[2] * depth * part]);
      for (let i = 0; i < outline.length; i++) {
        const j = (i + 1) % outline.length;
        poly(geo, [ring[i], ring[j], next[j], next[i]], stage ? color : side, [(outline[i][0] + outline[j][0]) / 2 - c[0], (outline[i][1] + outline[j][1]) / 2 - c[1], (outline[i][2] + outline[j][2]) / 2 - c[2]]);
      }
      ring = next;
    });
    poly(geo, ring, color, n);
    return geo;
  };
  // Outlines on the front plane (z): a rectangle with cut corners, turned by `turn` about its middle.
  const rect = (x0, x1, y0, y1, z, c = 0, turn = 0) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, cos = Math.cos(turn), sin = Math.sin(turn);
    const pts = c ? [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]] : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    return pts.map(([x, y]) => [mx + (x - mx) * cos - (y - my) * sin, my + (x - mx) * sin + (y - my) * cos, z]);
  };
  const FRONT = [0, 0, 1];
  const mix = (i, salt) => ((Math.imul(i + 31, 73856093) ^ Math.imul(salt + 7, 19349663)) >>> 0) % 1000;
  // Fur hung from a ring: rows of flat pointed shards all the way round, each row under the last and longer.
  // `rows` are [length, colour, second colour or null, how far out]; `wide` a shard's width.
  // Leopard print on a flat face: dark blotches at hashed places over the four-cornered face q, about one to every
  // `each` square units, each a small uneven patch just off the face along `out` (a unit direction).
  const BLOTCH = [[-1, -0.6], [0.7, -1], [1, 0.7], [-0.6, 1]];
  const leopardPrint = (geo, q, out, color, salt, each = 2.4) => {
    const wide = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]), tall = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]);
    if (wide < 0.5 || tall < 0.3) return;
    const count = Math.floor(wide * tall / each + mix(salt, 3) / 1000);
    for (let i = 0; i < count; i++) {
      // A blotch is no bigger than its face has room for.
      const m = mix(salt * 31 + i, 11), n = mix(salt * 17 + i, 29), r = Math.min(0.17 + (m % 5) * 0.035, wide * 0.42, tall * 0.42), turn = m % 4;
      // Its middle, kept a patch's reach inside the face.
      const u = (r + (m % 97) / 96 * (wide - 2 * r)) / wide, v = (r + (n % 89) / 88 * (tall - 2 * r)) / tall;
      const pts = BLOTCH.map((_, c) => {
        const [bx, by] = BLOTCH[(c + turn) % 4], pu = u + bx * r / wide, pv = v + by * r / tall;
        return [0, 1, 2].map((k) => {
          const low = q[0][k] + (q[1][k] - q[0][k]) * pu, high = q[3][k] + (q[2][k] - q[3][k]) * pu;
          return low + (high - low) * pv + out[k] * 0.02;
        });
      });
      poly(geo, pts, color, out);
    }
  };
  // A skirt of pointed shards hung round `ring`, in layers (`rows`: [length, colour, a second colour for some
  // shards, how far the layer stands off the ring, and the colour of a leopard's print if it wears one]). A shard
  // lies close to the body: it stands off by FLARE at its shoulders and its tip and no more, but for `spread`: how
  // far the shards at the body's two sides, and those at its front and back, lean out (or in) to follow the thighs.
  const FLARE = [0.02, 0.06];
  const fur = (geo, ring, rows, wide, salt = 0, spread = [0, 0]) => {
    const [y, , , , cx = 0, cz = 0] = ring, pts = octagon(ring);
    rows.forEach(([long, color, second, out, print], row) => {
      for (let j = 0; j < 8; j++) {
        const a = pts[j], c = pts[(j + 1) % 8], span = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(1, Math.round(span / wide));
        // The way this stretch of the ring faces.
        let ox = (a[0] + c[0]) / 2 - cx, oz = (a[2] + c[2]) / 2 - cz;
        const dx = c[0] - a[0], dz = c[2] - a[2], side = dz * ox - dx * oz >= 0 ? 1 : -1, l = Math.hypot(dx, dz) || 1;
        ox = dz / l * side; oz = -dx / l * side;
        const reach = spread[0] * ox * ox + spread[1] * oz * oz;
        for (let i = 0; i < n; i++) {
          const m = mix(i * 8 + j + row * 97, salt), t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2 + ((m % 7) - 3) * 0.04;
          const len = long * (0.82 + (m % 5) * 0.09), at = (t, drop, push) => [a[0] + dx * t + ox * push, y - drop, a[2] + dz * t + oz * push];
          const tone = second && m % 5 < 2 ? second : color, knee = len * 0.45, mid = out + FLARE[0] + reach * 0.6, tip = out + FLARE[1] + reach;
          both(geo, [at(t0 - 0.04, -0.2, out), at(t0 - 0.04, knee, mid), at(tm, len, tip), at(t1 + 0.04, knee, mid), at(t1 + 0.04, -0.2, out)], tone, shade(tone, 0.8));
          if (!print) continue;
          // The print: a blotch to about every two square units of the shard (a small shard has one, somewhere in its
          // upper half, or none), down it from the top, each where the shard is wide enough to hold it.
          const blotches = Math.min(3, Math.floor(len * span / n / 2.1 + (m % 10) / 10));
          for (let b = 0; b < blotches; b++) {
            const h = mix(m + b * 131, salt + 9), part = (blotches === 1 ? 0.14 + (h % 6) * 0.055 : [0.2, 0.42, 0.62][b]) + ((h % 7) - 3) * 0.015, drop = len * part, r = 0.19 + (h % 4) * 0.03;
            const narrow = part <= 0.45 ? 1 : (1 - part) / 0.55, room = (t1 - t0) / 2 * narrow - r / l;
            if (room < 0) continue;
            const t = (t0 + t1) / 2 + (tm - (t0 + t1) / 2) * (1 - narrow) + ((h % 9) - 4) / 4 * room, w = r / l;
            const push = (drop <= knee ? out + (mid - out) * (drop + 0.2) / (knee + 0.2) : mid + (tip - mid) * (drop - knee) / (len - knee)) + 0.035;
            poly(geo, [at(t - w, drop - r * 0.6, push), at(t + w * 0.7, drop - r, push), at(t + w, drop + r * 0.7, push), at(t - w * 0.6, drop + r, push)], print, [ox, 0, oz]);
          }
        }
      }
    });
    return geo;
  };
  // A cuff: two bands of wrap round a limb and a trim of little fur blocks over them (`down` -1 turns it over).
  // `band` is how tall each band of wrap is, for a deeper cuff.
  const cuff = (geo, y, hx, hz, { wrap, wrapDark, trim }, down = 1, band = 0.5) => {
    loft(geo, [[y, hx + 0.12, hz + 0.12, 0.45], [y - band * down, hx + 0.12, hz + 0.12, 0.45]], wrap);
    loft(geo, [[y - band * down, hx + 0.02, hz + 0.02, 0.4], [y - (band + 0.12) * down, hx + 0.02, hz + 0.02, 0.4]], wrapDark, [false, false]);
    loft(geo, [[y - (band + 0.12) * down, hx + 0.12, hz + 0.12, 0.45], [y - (band * 2 + 0.1) * down, hx + 0.12, hz + 0.12, 0.45]], wrap);
    const ring = octagon([y, hx + 0.3, hz + 0.3, 0.55]), light = shade(trim, 1), dark = shade(trim, 0.9);
    for (let j = 0; j < 8; j++) {
      const a = ring[j], c = ring[(j + 1) % 8], span = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(1, Math.round(span / 0.7));
      for (let i = 0; i < n; i++) {
        const m = mix(i + j * 13, Math.round(y * 10)), t0 = i / n, t1 = (i + 1) / n, tall = 0.42 + (m % 4) * 0.1;
        const p0 = [a[0] + (c[0] - a[0]) * t0, a[2] + (c[2] - a[2]) * t0], p1 = [a[0] + (c[0] - a[0]) * t1, a[2] + (c[2] - a[2]) * t1];
        const q0 = [p0[0] * 0.8, p0[1] * 0.8], q1 = [p1[0] * 0.8, p1[1] * 0.8], y0 = y - 0.05 * down, y1 = y + tall * down, color = m % 2 ? light : dark;
        poly(geo, [[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]], color, [p0[0] + p1[0], 0, p0[1] + p1[1]]);
        poly(geo, [[p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [q1[0], y1, q1[1]], [q0[0], y1, q0[1]]], color, [0, down, 0]);
        poly(geo, [[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [q1[0], y0, q1[1]], [q0[0], y0, q0[1]]], color, [0, -down, 0]);
      }
    }
  };
  // The belt's buckle: a gold plate with a raised rim, on the front plane at z; with `coin`, the coin's B on it.
  const buckle = (geo, y, z, { gold, goldDark, goldLight, coin }) => {
    slab(geo, rect(-1.2, 1.2, y - 0.95, y + 0.95, z, 0.35), FRONT, 0.4, 0.92, gold, goldDark);
    slab(geo, rect(-0.85, 0.85, y - 0.62, y + 0.62, z + 0.4, 0.22), FRONT, 0.05, 1, goldDark);
    if (!coin) return;
    const B = ["01010", "11110", "10001", "11110", "10001", "10001", "11110", "01010"], px = 0.17, x0 = -px * 2.5, y1 = y + px * 4;
    for (let r = 0; r < B.length; r++) for (let c = 0; c < 5; c++) {
      if (B[r][c] === "1") slab(geo, rect(x0 + c * px, x0 + (c + 1) * px, y1 - (r + 1) * px, y1 - r * px, z + 0.45), FRONT, 0.07, 1, goldLight);
    }
  };
  // One form swept along a bending path, for a limb with joints that should not show as separate pieces: each
  // station is [x, y, z, nx, ny, t, w, b], a rectangle about (x, y, z) with its corners cut by b, t either way along
  // the unit direction (nx, ny) in the x-y plane and w either way along z. The stations join edge to edge and only
  // the two ends are closed.
  const sweep = (geo, stations, color) => {
    const rings = stations.map(([x, y, z, nx, ny, t, w, b]) => [[t - b, w], [t, w - b], [t, b - w], [t - b, -w], [b - t, -w], [-t, b - w], [-t, w - b], [b - t, w]]
      .map(([a, d]) => [x + nx * a, y + ny * a, z + d]));
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i], b = rings[i + 1], p = stations[i], q = stations[i + 1], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      for (let j = 0; j < 8; j++) {
        const n = (j + 1) % 8, f = [a[j], a[n], b[n], b[j]];
        poly(geo, f, color, [(f[0][0] + f[1][0] + f[2][0] + f[3][0]) / 4 - mid[0], (f[0][1] + f[1][1] + f[2][1] + f[3][1]) / 4 - mid[1], (f[0][2] + f[1][2] + f[2][2] + f[3][2]) / 4 - mid[2]]);
      }
    }
    const last = stations.length - 1, away = (i, j) => [stations[i][0] - stations[j][0], stations[i][1] - stations[j][1], stations[i][2] - stations[j][2]];
    poly(geo, rings[0], color, away(0, 1));
    poly(geo, rings[last], color, away(last, last - 1));
    return geo;
  };
  // A convex outline of [z, y] points drawn in by d on every edge.
  const inset = (outline, d) => {
    const n = outline.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const p = outline[i], q = outline[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
    const turn = area > 0 ? 1 : -1, normals = outline.map((p, i) => {
      const q = outline[(i + 1) % n], dz = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dz, dy);
      return [-dy / len * turn, dz / len * turn];
    });
    return { normals, points: outline.map((p, i) => {
      const a = normals[(i + n - 1) % n], c = normals[i], k = d / (1 + a[0] * c[0] + a[1] * c[1]);
      return [p[0] + (a[0] + c[0]) * k, p[1] + (a[1] + c[1]) * k];
    }) };
  };
  // A solid with a convex side outline, for something that folds: `outline` is that side as [z, y] points in order,
  // and the solid runs from x0 to x1 with the edges round its two sides cut by b0 and b1. The folds of the outline
  // are the only lines across it.
  const prism = (geo, outline, x0, x1, b0, b1, color) => {
    const n = outline.length, { normals } = inset(outline, 0), ends = [[x0, b0, -1], [x1, b1, 1]].map(([x, b, way]) => ({ x, b, way, points: inset(outline, b).points }));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = outline[i], q = outline[j], out = [0, -normals[i][1], -normals[i][0]];
      poly(geo, [[x0 + b0, p[1], p[0]], [x1 - b1, p[1], p[0]], [x1 - b1, q[1], q[0]], [x0 + b0, q[1], q[0]]], color, out);
      for (const { x, b, way, points } of ends) {
        if (b) poly(geo, [[x - way * b, p[1], p[0]], [x - way * b, q[1], q[0]], [x, points[j][1], points[j][0]], [x, points[i][1], points[i][0]]], color, [way, out[1], out[2]]);
      }
    }
    for (const { x, way, points } of ends) poly(geo, points.map((p) => [x, p[1], p[0]]), color, [way, 0, 0]);
    return geo;
  };
  // A fist, after the reference, in the hand's frame: it hangs from 1.35 at the wrist, its back at BACK and its palm
  // toward +z, which the rig turns in toward the body. It is less deep than it is wide, as a fist is. The back of the
  // hand is one block down to the first knuckles. `FINGER` is a finger's side from there, as [z, y]: it leaves the
  // back of the hand in the same plane and leans in under the fist in two easy folds rather than turning square, so
  // the second knuckle is the lowest point of the fist and points down the way the hand does; from there it folds
  // back up to the palm side, and its tip stands up that side under the heel of the palm. Each part is shorter than
  // the one before it, as a finger's are, and the first is well short of the back of the hand. The last points
  // close it inside the hand, up the back of the hand's own plane, so nothing of the join shows at the knuckle.
  const BACK = -1.3, KNUCKLE = -0.85, ROOT = KNUCKLE + 0.3, TIP = -0.05, CUT = 0.06;
  const FINGER = [[BACK, KNUCKLE], [-1.12, -1.08], [-0.3, -1.48], [0.1, -1.57], [0.42, -1.48], [0.92, -1.08], [1.1, -0.8], [1.1, TIP - 0.15], [0.95, TIP], [-0.2, TIP], [BACK, ROOT]];
  // The three fingers are parted by cuts that show the dark inside, with no line across a knuckle. The thumb is
  // rooted where a thumb is, on the palm's half of the side that leads (`side` -1 is the right hand, whose thumb is
  // at -x: turned in, that faces ahead). `s` scales the hand for a slender build.
  // `wrist` is the end of the forearm the hand hangs from, as the hand sees it ([half width, half depth, corner
  // cut]): the hand begins in that same outline, up inside the forearm, and widens out of it, so the arm runs
  // into the hand with no ledge or crease at the wrist. WRIST is the height in the hand where the forearm ends.
  // The hand widens no faster than WIDEN (across for each unit down), so a fist much wider than its wrist, as a
  // slender arm's is, widens all the way down the heel of the palm and has no shelf under the wrist.
  const WRIST = 1.28, WIDEN = 0.58;
  // The end of a hand's thumb seen from the hand's side: the outline, as (z, y) pairs, of the thumb's half toward the
  // knuckles where it lies past the fingers' tips (`past`) on the palm's side, for a hold to keep inside what it holds.
  const thumbEnd = (g, past) => {
    const points = [];
    for (let i = 0; i < g.verts.length; i += 3) if (g.verts[i + 2] > past && g.verts[i + 1] < 0) points.push([g.verts[i + 2], g.verts[i + 1]]);
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lower = [], upper = [];
    for (const p of points) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = points.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) upper.pop();
      upper.push(points[i]);
    }
    return Float64Array.from(lower.slice(0, -1).concat(upper.slice(0, -1)).flat());
  };
  const hand = (side, skin, s = 1, wrist = [1.25, 1.05, 0.4]) => {
    const g = geometry(), inside = shade(skin, 0.5);
    // The hand: whole from the wrist down over the fingers' tips (the heel of the palm), and behind them below that
    // (the back of the hand) down to the knuckles, its corners easing to the fingers' where they root in it.
    const top = WRIST - 0.1, low = TIP + 0.06, eased = top - (1.6 - wrist[0]) / WIDEN > low + 0.2, full = eased ? top - (1.6 - wrist[0]) / WIDEN : low;
    // The hand's half width at a height: the wrist's at the wrist, the fist's from `full` down.
    const wide = (y) => y >= top ? wrist[0] : y <= full ? 1.6 : wrist[0] + (1.6 - wrist[0]) * (top - y) / (top - full);
    loft(g, [[WRIST + 0.6, wrist[0], wrist[1], wrist[2]], [top, wrist[0], wrist[1], wrist[2]], ...(eased ? [[full, 1.6, 1.2, 0.45, 0, -0.1]] : []), [low, 1.6, 1.2, 0.45, 0, -0.1], [TIP + 0.04, 1.6, 0.9, 0.45, 0, -0.4],
      [ROOT, 1.6, 0.9, 0.15, 0, -0.4], [KNUCKLE, 1.6, 0.9, 0.15, 0, -0.4]], skin);
    // What shows in the cuts.
    prism(g, inset(FINGER, 0.14).points, -1.35, 1.35, 0, 0, inside);
    // The fingers' edges are cut as the hand's are on its two sides, and only lightly where two fingers meet, so the
    // cuts between them stay narrow.
    for (const [x0, x1, b0, b1] of [[-1.6, -0.55, 0.15, CUT], [-0.52, 0.52, CUT, CUT], [0.55, 1.6, CUT, 0.15]]) prism(g, FINGER, x0, x1, b0, b1, skin);
    // The cuts between the fingers start at the knuckles and close to a point just above them.
    for (const x of [-0.535, 0.535]) poly(g, [[x - 0.03, KNUCKLE - 0.02, BACK - 0.012], [x + 0.03, KNUCKLE - 0.02, BACK - 0.012], [x + 0.008, KNUCKLE + 0.22, BACK - 0.012], [x - 0.008, KNUCKLE + 0.22, BACK - 0.012]], inside, [0, 0, -1]);
    // The side of the hand runs on into the side of its first and last fingers, with no notch where they meet.
    for (const x of [-1.6, 1.6]) poly(g, [[x, TIP + 0.05, 0.05], [x, TIP + 0.05, 0.65], [x, TIP - 0.2, 0.65], [x, TIP - 0.2, 0.05]], skin, [x, 0, 0]);
    // The thumb, one skin from wrist to tip with no joint showing, as thick as a finger: it rises out of the hand
    // at the wrist, swells out of the palm's half of the leading side as the ball of the thumb, folds under and
    // round the corner in an even bend, and lies across the first two fingers' tips, half way up them, sunk a
    // little into them. Down the heel of the palm it keeps to the hand's own side as that widens (`wide`), so it
    // is part of the hand at any wrist: it starts inside the wrist and swells out of the hand's side below it, and
    // its inner half is sunk in the palm's corner all the way down, so no gap shows between the two.
    const S = side;
    sweep(g, [[(wide(1.25) - 0.4) * S, 1.25, 0.55, S, 0, 0.36, 0.55, 0.22], [(wide(0.75) - 0.25) * S, 0.75, 0.7, 0.95 * S, 0.3, 0.58, 0.66, 0.26],
      [(wide(0.2) - 0.18) * S, 0.2, 0.85, 0.97 * S, -0.25, 0.6, 0.64, 0.26], [1.52 * S, -0.25, 1.08, 0.8 * S, -0.6, 0.55, 0.58, 0.24],
      [1.25 * S, -0.55, 1.36, 0.3 * S, -0.95, 0.5, 0.52, 0.22], [0.8 * S, -0.66, 1.46, 0, -1, 0.47, 0.47, 0.2],
      [0.25 * S, -0.68, 1.44, 0, -1, 0.44, 0.43, 0.2], [-0.1 * S, -0.68, 1.4, 0, -1, 0.4, 0.38, 0.18]], skin);
    if (s !== 1) for (let i = 0; i < g.verts.length; i++) g.verts[i] *= s;
    return g;
  };
  // An arm is two parts about an elbow: the upper arm leans back to it (`elbow`: its place in the arm's frame), and
  // the forearm (in its own frame, hanging from the elbow) leans forward from it to the rig's hand point, ten units
  // under the shoulder, so the arm hangs with a natural bend and the hand follows the forearm.
  // A resting arm leans forward by a fifth of a radian; a ring tilted by this is level on it, and set back by this
  // much of its depth under the shoulder it stands straight over the ring above. `cap` is such a ring, y under the
  // shoulder and r across, its corners cut until it has eight near-even sides.
  const SLEEVE = Math.tan(0.2);
  const cap = (y, r) => [y, r, r * 1.04, r * 0.56, 0, y * SLEEVE, null, SLEEVE];
  const BUILD = {
    regular: {
      // `shoulder` is the height the trunk's clothes reach: over it is the neck.
      armX: 5.3, handScale: 1, shoulder: 8.45, skirt: [3.55, 2.22], thigh: 3.85,
      leg: [[0, 1.75, 1.9, 0.5], [-1.6, 1.85, 2, 0.55, 0, 0.05], [-2.8, 1.65, 1.8, 0.5, 0, 0.1], [-3.4, 1.6, 1.8, 0.5, 0, 0.15], [-4, 1.5, 1.6, 0.45, 0, 0.08],
        [-4.8, 1.55, 1.7, 0.45, 0, -0.05], [-5.6, 1.4, 1.5, 0.4], [-6.1, 1.35, 1.45, 0.4]],
      // The anklet stands clear of the calf above it and the instep below, so its wraps cover the ankle whole.
      knee: [-3.95, -2.85, 1, 2], ankle: [-5.05, 1.68, 1.84],
      // The foot is a block its whole length: as tall at the toes as a toe, its top rising from them to the instep,
      // and drawn in a little toward the heel.
      // `toe` is how tall the foot is at the toes and `sole` how thick a boot's sole is. A bare foot's toes run back
      // toward its outer side (`toes`: how far its front falls back from the big toe to the last toe, and how far the
      // last toe's outer corner is cut back), so the little toe is the shortest, as a foot's is.
      foot: [[-7, 1.9, 2.75, 0.4, 0, 0.8, [0.65, 1.7]], [-6.15, 1.9, 2.75, 0.45, 0, 0.8, [0.65, 1.7]], [-5.55, 1.5, 1.75, 0.45, 0, -0.05]], toe: 0.85, sole: 0.28, toes: [0.3, 0.95],
      // The shoulder's rings are tilted as a sleeve's are (SLEEVE), so its top and bottom are level when the arm hangs
      // at rest.
      arm: [[-0.55, 0.95, 1.05, 0.45, 0, 0, null, SLEEVE], [-0.9, 1.5, 1.55, 0.55, 0, 0, null, SLEEVE], [-1.8, 1.75, 1.8, 0.65, 0, 0, null, SLEEVE],
        [-2.7, 1.6, 1.7, 0.55, 0, -0.22, null, SLEEVE], [-3.15, 1.4, 1.5, 0.5, 0, -0.35, null, SLEEVE],
        [-3.95, 1.5, 1.6, 0.5, 0, -0.58], [-4.9, 1.3, 1.4, 0.45, 0, -0.9], [-5.5, 1.05, 1.15, 0.4, 0, -1]],
      forearm: [[1.25, 0.95, 1, 0.45], [0.8, 1.3, 1.4, 0.5], [-0.6, 1.4, 1.5, 0.5], [-1.4, 1.55, 1.65, 0.5], [-2.9, 1.45, 1.5, 0.45], [-4, 1.3, 1.35, 0.45]],
      elbow: [-4.9, -0.9], sleeve: 4, wrist: [-2.75, 1.45, 1.5],
      // The chest is a raised section of the trunk itself: it steps out over the ribs in two eased facets, with its
      // front corners cut wide, and runs back to the collar.
      torso: [[-0.4, 3.1, 2, 0.6], [1, 3.3, 2.15, 0.6], [2, 3.2, 2.1, 0.6], [4, 3.4, 2.15, 0.65], [5.15, 3.7, 2.25, 0.7], [5.4, 3.9, 2.38, 0.95, 0, 0.13],
        [5.72, 4.05, 2.47, 1.1, 0, 0.22], [7.05, 4.3, 2.48, 1.15, 0, 0.2], [7.85, 4.05, 2.35, 0.9, 0, 0.05], [8.45, 2.6, 2, 0.7], [9.05, 2, 1.7, 0.6]],
      nipple: [2.65, 6.15],
      chest: [5.72, 7.05, 2.69, 2.68], belt: [0.72, 2.28, 3.62, 2.55]
    },
    slim: {
      // Her legs stand close, with a narrow gap between them (`legX`, each leg's middle from the body's), and her
      // arms hang from a little under the rig's shoulder (`armDrop`), so her shoulders sit level with her trunk's.
      // Her whole arm is drawn at `armScale` of the length the rig's arm has, which is long for her: the rig scales
      // the arm and what it holds together, so everything still lands in her fist.
      armX: 3.85, handScale: 0.74, legX: 1.5, armDrop: 0.6, armScale: 0.86, shoulder: 7.8, skirt: [3.12, 2.1], thigh: 2.8,
      leg: [[0, 1.3, 1.4, 0.4], [-1.5, 1.3, 1.4, 0.4], [-3.2, 1, 1.1, 0.35, 0, 0.08], [-4.3, 1.05, 1.15, 0.35], [-5.6, 0.85, 0.95, 0.3], [-6.1, 0.82, 0.9, 0.3]],
      knee: null, ankle: [-5.2, 0.9, 1],
      // Her foot is about seven tenths of his across and along, so it is seven tenths as tall at the toes and a boot's
      // sole seven tenths as thick: a foot as tall as his on her small one reads as a block.
      foot: [[-7, 1.25, 2.15, 0.35, 0, 0.6], [-6.39, 1.25, 2.15, 0.4, 0, 0.6], [-5.6, 1.05, 1.35, 0.4, 0, -0.05]], toe: 0.61, sole: 0.2, toes: [0.2, 0.65],
      // Her elbow sits at her waist, lower than his, so her forearm is the shorter half of her arm. Her shoulder is
      // a round cap in her sleeve: rings near eight even sides, each level and one over the other when the arm
      // hangs at rest (`cap`), so it is the same from the front as from behind.
      arm: [cap(0.42, 0.34), cap(0.3, 0.62), cap(0.08, 0.88), cap(-0.25, 1.04), cap(-0.7, 1.1), cap(-1.25, 1.1), [-2.05, 0.95, 1, 0.35, 0, -0.25, null, SLEEVE],
        [-6.1, 0.85, 0.9, 0.3, 0, -0.75], [-6.6, 0.68, 0.72, 0.28, 0, -0.8]],
      forearm: [[0.9, 0.6, 0.65, 0.28], [0.5, 0.85, 0.9, 0.3], [-0.5, 0.9, 0.95, 0.3], [-3.4, 0.75, 0.78, 0.3], [-4.45, 0.68, 0.7, 0.28]],
      // An empty hand of hers hangs relaxed at her side: `relaxed` is that arm's bend at the elbow.
      elbow: [-6.1, -0.75], relaxed: 0.16, sleeve: 5, wrist: [-3.5, 0.8, 0.82],
      // Her chest swells and falls in many short steps, so from the side it is a curve and not a ledge. Her shoulders
      // run nearly level in from her arms to the foot of her neck (the ring over `shoulder`), and her neck stands on
      // them as a column, drawing in only a little to her chin.
      torso: [[-0.4, 2.9, 1.9, 0.6], [1.2, 3.1, 2.05, 0.6], [2.6, 2.25, 1.6, 0.5], [4.2, 2.55, 1.7, 0.55], [4.75, 2.72, 1.8, 0.6, 0, 0.03], [5.05, 2.85, 1.95, 0.68, 0, 0.16],
        [5.4, 2.95, 2.15, 0.76, 0, 0.35], [5.75, 3, 2.2, 0.8, 0, 0.4], [6.2, 3, 2.215, 0.8, 0, 0.415], [6.6, 3, 2.19, 0.78, 0, 0.39], [6.95, 3, 2.09, 0.74, 0, 0.29],
        [7.25, 3, 1.93, 0.7, 0, 0.13], [7.8, 2.85, 1.65, 0.7], [8.1, 1.7, 1.38, 0.54], [9.05, 1.4, 1.3, 0.5]],
      chest: [5.45, 6.65, 2.56, 2.62], belt: [1.4, 2.7, 3.08, 2.14]
    }
  };
  // Where the rig holds what a hand carries: in units under the shoulder, and ahead of it. A fist closes about
  // that point, so everything the game puts in a hand lands in it.
  const HAND_Y = 10, HAND_Z = 2.4;
  const scaled = (geo, u) => { for (let i = 0; i < geo.verts.length; i++) geo.verts[i] *= u; return geo; };
  // Rings joined into a solid as `loft` joins them, with each side cut into cells that take their colours from
  // `pick(xn, y, zn)`: xn and zn the cell's place across its ring from -1 to 1, y its height. A side is cut across
  // into unit cells and up at each of `breaks`, and cells of one colour along a side are one face, so a part in one
  // colour costs what a plain loft does. `tone(key)` is a colour's [rgb, glow]; the two ends are closed in `base`.
  // `print` ({ key, color }) lays a leopard's print on the faces in that colour.
  const paintedLoft = (geo, sections, breaks, pick, tone, base, print = null) => {
    const rings = sections.map(octagon), mix = (a, b, t) => a + (b - a) * t;
    for (let i = 0; i + 1 < rings.length; i++) {
      const sa = sections[i], sb = sections[i + 1], y0 = sa[0], y1 = sb[0], lo = Math.min(y0, y1), hi = Math.max(y0, y1), cuts = [0];
      for (const y of breaks) if (y > lo + 1e-4 && y < hi - 1e-4) cuts.push((y - y0) / (y1 - y0));
      cuts.sort((a, b) => a - b).push(1);
      const at = (j, t) => [mix(rings[i][j][0], rings[i + 1][j][0], t), mix(rings[i][j][1], rings[i + 1][j][1], t), mix(rings[i][j][2], rings[i + 1][j][2], t)];
      for (let s = 0; s + 1 < cuts.length; s++) {
        const t0 = cuts[s], t1 = cuts[s + 1], tm = (t0 + t1) / 2, ym = mix(y0, y1, tm);
        const hx = mix(sa[1], sb[1], tm), hz = mix(sa[2], sb[2], tm), cx = mix(sa[4] || 0, sb[4] || 0, tm), cz = mix(sa[5] || 0, sb[5] || 0, tm);
        for (let j = 0; j < 8; j++) {
          const n = (j + 1) % 8, a0 = at(j, t0), a1 = at(n, t0), b0 = at(j, t1), b1 = at(n, t1);
          const cols = Math.max(1, Math.round(Math.hypot(a1[0] - a0[0], a1[2] - a0[2])));
          const along = (p, q, w) => [mix(p[0], q[0], w), mix(p[1], q[1], w), mix(p[2], q[2], w)];
          let from = 0, last;
          for (let c = 0; c <= cols; c++) {
            let key;
            if (c < cols) {
              const w = (c + 0.5) / cols, m = along(along(a0, a1, w), along(b0, b1, w), 0.5);
              key = pick((m[0] - cx) / hx, ym, (m[2] - cz) / hz);
            }
            if (c > 0 && (c === cols || key !== last)) {
              const q = [along(a0, a1, from / cols), along(a0, a1, c / cols), along(b0, b1, c / cols), along(b0, b1, from / cols)], [color, glow] = tone(last);
              const ox = (q[0][0] + q[1][0]) / 2 - cx, oz = (q[0][2] + q[1][2]) / 2 - cz, ol = Math.hypot(ox, oz) || 1;
              poly(geo, q, color, [ox, 0, oz], glow);
              if (print && print.key === last) leopardPrint(geo, q, [ox / ol, 0, oz / ol], print.color, (i * 61 + s * 7 + j) * 13 + from + Math.round(q[0][1] * 10));
              from = c;
            }
            last = key;
          }
        }
      }
    }
    const end = rings.length - 1;
    poly(geo, rings[0], base, [0, sections[0][0] - sections[1][0], 0]);
    poly(geo, rings[end], base, [0, sections[end][0] - sections[end - 1][0], 0]);
    return geo;
  };
  // An authored block map, read a row at a time: the reader's (row, xn, zn) is the colour of the block that shows at
  // that place across the row (xn and zn from -1 to 1 over the row's own extent), or undefined where the row is empty.
  const blockRows = (v) => {
    const rows = new Map(), cell = (x, z) => (x + 16) * 64 + z + 16;
    v.each((x, y, z, c) => {
      let r = rows.get(y);
      if (!r) rows.set(y, r = { x0: x, x1: x, z0: z, z1: z, cells: new Map(), colours: new Set() });
      r.colours.add(c);
      r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.z0 = Math.min(r.z0, z); r.z1 = Math.max(r.z1, z);
      r.cells.set(cell(x, z), c);
    });
    const at = (row, xn, zn) => {
      const r = rows.get(row);
      if (!r) return undefined;
      const nx = r.x1 - r.x0 + 1, nz = r.z1 - r.z0 + 1, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
      let x = r.x0 + Math.max(0, Math.min(nx - 1, Math.floor((xn + 1) / 2 * nx))), z = r.z0 + Math.max(0, Math.min(nz - 1, Math.floor((zn + 1) / 2 * nz)));
      // A gap in the row shows the block behind it.
      for (let step = 0; step < 8; step++) {
        const c = r.cells.get(cell(x, z));
        if (c !== undefined) return c;
        x += Math.sign(Math.round(mx - x)); z += Math.sign(Math.round(mz - z));
      }
      return undefined;
    };
    // Whether a row holds a block of a colour.
    at.has = (row, c) => !!rows.get(row)?.colours.has(c);
    return at;
  };
  // The body: `o` its colours and what it wears.
  //   skin; slim; torso: a colour for each span of the torso's rings (skin where left out); sleeve: the deltoid's colour
  //   belt: { color, gold, goldDark, goldLight, coin } (a buckle when gold is given); skirt: [[length, colour, second, out], ...]
  //   cuffs / anklets: { wrap, wrapDark, trim }; boot: { color, sole, detail }; pecs: the line between a bare chest's two
  //   halves and its nipples' colour; emblem(geo, z, y0, y1): what the chest's front carries
  const build = (k, o) => {
    const u = k.u, B = o.slim ? BUILD.slim : BUILD.regular, skin = rgb(o.skin);
    const torso = geometry(), spans = B.torso.length - 1, [cy0, cy1, cz0, cz1] = B.chest, chestZ = (y) => cz0 + (cz1 - cz0) * (y - cy0) / (cy1 - cy0);
    // `paint` has the body wear what a block map wore (see `wear`): { tone, torso, arm, forearm, leg }, each part a
    // { breaks, pick } for `paintedLoft`, and the limbs one for each side (right, then left).
    const paint = o.paint;
    if (paint) paintedLoft(torso, B.torso, paint.torso.breaks, paint.torso.pick, paint.tone, skin, paint.print);
    else loft(torso, B.torso, Array.from({ length: spans }, (_, i) => o.torso && o.torso[i] || skin));
    if (o.belt) {
      loft(torso, [[B.belt[0], B.belt[2], B.belt[3], 0.62], [B.belt[1], B.belt[2], B.belt[3], 0.62]], o.belt.color);
      if (o.belt.gold) buckle(torso, (B.belt[0] + B.belt[1]) / 2, B.belt[3], o.belt);
    }
    if (o.pecs && B.nipple) {
      // A faint line down the breastbone, and a nipple well out on each half.
      if (o.sternum !== false) poly(torso, [[-0.07, cy0 + 0.15, chestZ(cy0 + 0.15) + 0.012], [0.07, cy0 + 0.15, chestZ(cy0 + 0.15) + 0.012], [0.07, cy1 - 0.3, chestZ(cy1 - 0.3) + 0.012], [-0.07, cy1 - 0.3, chestZ(cy1 - 0.3) + 0.012]], shade(skin, 0.82), FRONT);
      const [nx, ny] = B.nipple;
      for (const side of [-1, 1]) slab(torso, rect(nx * side - 0.22, nx * side + 0.22, ny - 0.2, ny + 0.2, chestZ(ny) - 0.02), FRONT, 0.07, 0.85, o.pecs);
    }
    if (o.strap) strap(torso, o.strap);
    // The skirt hangs from the hips under the belt (`B.skirt`: how wide and deep it is there). With `hem`, for a body
    // that wears no belt, it is the hem of what the trunk wears instead: it starts in the trunk's own bottom edge, so
    // it is one piece with the trunk and not a thing laid over it. Its side shards lean out as far as the thighs do.
    if (o.skirt) {
      const low = B.torso[0], ring = o.hem ? [low[0], low[1] + 0.01, low[2] + 0.01, low[3]] : [B.belt[0] + 0.15, B.skirt[0], B.skirt[1], 0.62];
      fur(torso, ring, o.skirt, o.slim ? 1.05 : 1.25, 3, [Math.max(0, B.thigh + 0.05 - ring[1]), 0]);
    }
    if (o.emblem) o.emblem(torso, chestZ, cy0, cy1);
    // An arm drawn at a scale is drawn that much thicker, so only its length changes.
    const armK = B.armScale || 1, thick = (ring) => { const r = ring.slice(); r[1] /= armK; r[2] /= armK; r[3] /= armK; return r; };
    const arm = (side = 0) => paint ? paintedLoft(geometry(), B.arm.map(thick), paint.arm[side].breaks, paint.arm[side].pick, paint.tone, skin, paint.print)
      : loft(geometry(), B.arm.map(thick), Array.from({ length: B.arm.length - 1 }, (_, i) => o.sleeve && i < B.sleeve ? o.sleeve : skin));
    // The elbow, the forearm's length from it to the hand point, and how far the forearm leans forward at rest. The
    // forearm's rings are drawn for one that hangs straight under the shoulder; below the elbow they stretch to this.
    // The forearm's rings are stretched below the elbow so that its last ring lies where the hand takes over (WRIST
    // up the hand); `wristOf` is that ring as the hand sees it, a quarter turn round and in the hand's own scale.
    const [ey, ez] = B.elbow, reach = Math.hypot(HAND_Y + ey, HAND_Z - ez), hs = B.handScale / armK, last = thick(B.forearm[B.forearm.length - 1]);
    const long = (y) => y < 0 ? y * (reach - WRIST * hs) / -last[0] : y, wristOf = [last[2] / hs, last[1] / hs, last[3] / hs];
    // `clear` is the bend that carries the fist clear of the front of the trunk, for an arm laid across it. `deltoid`
    // is how far down the arm its shoulder is widest, the middle the top of the arm is rounded about.
    const elbow = { y: ey * u, z: ez * u, length: reach * u, rest: Math.atan2(HAND_Z - ez, HAND_Y + ey),
      clear: Math.asin(Math.min(1, (B.belt[3] + 1.45 * B.handScale - ez * armK) / (reach * armK))), relaxed: B.relaxed,
      deltoid: -B.arm.reduce((a, ring) => ring[1] > a[1] ? ring : a)[0] * u };
    const forearm = (side = 0) => {
      const rings = B.forearm.map(([y, ...ring]) => thick([long(y), ...ring]));
      const g = paint ? paintedLoft(geometry(), rings, paint.forearm[side].breaks, paint.forearm[side].pick, paint.tone, skin, paint.print) : loft(geometry(), rings, skin);
      if (o.cuffs) cuff(g, long(B.wrist[0]), B.wrist[1] / armK, B.wrist[2] / armK, o.cuffs, 1);
      return g;
    };
    // How far behind the body's middle its back lies, half way up it: where a weapon slung across it rests.
    const upper = B.torso.findIndex((ring) => ring[0] > 4.5), below = B.torso[upper - 1], above = B.torso[upper], part = (4.5 - below[0]) / (above[0] - below[0]);
    const spine = below[2] - (below[5] || 0) + (above[2] - (above[5] || 0) - below[2] + (below[5] || 0)) * part;
    const leg = (side = 0) => {
      const g = geometry();
      if (paint) paintedLoft(g, B.leg, paint.leg[side].breaks, paint.leg[side].pick, paint.tone, skin, paint.print);
      else loft(g, B.leg, o.legs || skin);
      if (B.knee) {
        // The kneecap is in whatever the leg wears there, so a trouser leg has a knee in its own cloth.
        const [worn, lit] = paint ? paint.tone(paint.leg[side].pick(0, (B.knee[0] + B.knee[1]) / 2, 1)) : [o.legs || skin, 0];
        slab(g, rect(-B.knee[2], B.knee[2], B.knee[0], B.knee[1], B.knee[3] - 0.12, 0.3), FRONT, 0.3, 0.78, worn, shade(worn, 0.86), lit);
      }
      if (o.boot) {
        // A boot: a shaft up the shin, a sole, and a foot as blunt and tall at the toe as a bare one.
        const a = B.ankle, f = B.foot;
        if (o.boot.shaft !== false) loft(g, [[a[0] + 1.1, a[1] + 0.3, a[2] + 0.3, 0.35], [-6, a[1] + 0.3, a[2] + 0.3, 0.35]], o.boot.color);
        loft(g, [[-7, f[0][1] + 0.06, f[0][2] + 0.06, 0.35, 0, f[0][5]], [-7 + B.sole, f[0][1] + 0.06, f[0][2] + 0.06, 0.35, 0, f[0][5]]], o.boot.sole);
        loft(g, [[-7 + B.sole, f[0][1], f[0][2], 0.35, 0, f[0][5]], [f[1][0] + 0.05, f[1][1], f[1][2], 0.4, 0, f[1][5]], [f[2][0] + 0.05, f[2][1] + 0.12, f[2][2] + 0.12, 0.4, 0, f[2][5]]], o.boot.color);
        if (o.boot.detail) o.boot.detail(g, B);
      } else {
        // Toes: grooves cut down the foot's blunt front, as lines a shade darker. They split the foot's own width
        // into four toes and are as thick as that width allows, so a small foot's are closer and finer. The front
        // falls back toward the foot's outer side (-x for the right foot) from the big toe to the third, and the last
        // toe is the corner cut back from there.
        const f = B.foot[0], front = f[5] + f[2], gap = f[1] / 2, line = f[1] * 0.032, way = side ? 1 : -1, [lag, along] = B.toes;
        const inner = -way * (f[1] - f[3]), outer = way * (gap + line), back = (x) => front - lag * (x - inner) / (outer - inner);
        loft(g, B.foot.map((ring, i) => i < 2 ? [...ring.slice(0, 6), ring[6], 0, [way, lag, f[1] - gap - line, along]] : ring), skin);
        for (const x of [-gap, 0, gap]) poly(g, [[x - line, -6.98, back(x - line) + 0.012], [x + line, -6.98, back(x + line) + 0.012], [x + line, -7 + B.toe, back(x + line) + 0.012], [x - line, -7 + B.toe, back(x - line) + 0.012]], shade(skin, 0.7), FRONT);
        if (o.anklets) cuff(g, B.ankle[0] + 0.3, B.ankle[1], B.ankle[2], o.anklets, 1, 0.62);
      }
      return g;
    };
    // A painted body's left arm and leg are their own meshes only where they wear something the right ones do not. Bare
    // feet are a left and a right (`sided`), each with its little toe on its outer side.
    const alike = (a, b) => a.faces.length === b.faces.length && a.faces.every((f, i) => { const c = b.faces[i].color; return f.color[0] === c[0] && f.color[1] === c[1] && f.color[2] === c[2]; });
    const pair = (make, sided = false) => { const right = scaled(make(0), u), left = paint || sided ? scaled(make(1), u) : right; return [right, !sided && alike(right, left) ? right : left]; };
    const [armR, armL] = pair(arm), [forearmR, forearmL] = pair(forearm), [legR, legL] = pair(leg, !o.boot), hands = o.hands || [skin, skin];
    const handR = scaled(hand(-1, hands[0], hs, wristOf), u);
    return { torso: scaled(torso, u), arm: armR, armL, forearm: forearmR, forearmL, leg: legR, legL,
      handR, handL: scaled(hand(1, hands[1], hs, wristOf), u), armX: B.armX * u, armDrop: (B.armDrop || 0) * u, armScale: armK,
      // The fist's measures from its middle: to the face of its palm and to the end of its thumb's side, and the end
      // of the thumb lying across the fingers on the palm's side, seen from the hand's side.
      fist: { palm: 1.1 * B.handScale * u, span: 2.17 * B.handScale * u, tip: thumbEnd(handR, 1.12 * hs * u) },
      legX: B.legX ? B.legX * u : 0, elbow, back: spine * u, modelled: true };
  };
  // The default Ooga's strap, an object of its own: a band that comes out from behind the belt at the left hip, runs
  // straight across the chest, over the right shoulder and straight down the back to the belt again, standing off
  // the trunk wherever the trunk falls away from it. STRAP is its line on the trunk's front (`from` the hip `to`
  // the shoulder, as [x, y]), its half width, its thickness, the width of the leather edge down each side of its
  // fur, and its stations: [distance along the line, depth, and which way is outward: along the line, in depth].
  const STRAP = { from: [2.4, 2.3], to: [-2.9, 8.35], half: 0.7, thick: 0.22, edge: 0.18,
    path: [[-0.45, 2.2, 0, 1], [0.35, 2.25, 0, 1], [4.9, 2.83, 0, 1], [6.6, 2.74, 0, 1], [7.6, 2.42, 0.45, 0.89], [8.12, 1.5, 0.85, 0.53], [8.2, 0, 1, 0],
      [8.12, -1.5, 0.85, -0.53], [7.6, -2.34, 0.45, -0.89], [6.6, -2.42, 0, -1], [0.35, -2.25, 0, -1], [-0.45, -2.2, 0, -1]] };
  const strap = (geo, { color, edge, print }) => {
    const [ax, ay] = STRAP.from, [bx, by] = STRAP.to, len = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / len, dy = (by - ay) / len, nx = dy, ny = -dx;
    const across = [-STRAP.half, STRAP.edge - STRAP.half, STRAP.half - STRAP.edge, STRAP.half];
    const rows = STRAP.path.map(([along, depth, oa, od]) => {
      const ol = Math.hypot(oa, od), out = [dx * oa / ol, dy * oa / ol, od / ol], px = ax + dx * along, py = ay + dy * along;
      return { out, inner: across.map((w) => [px + nx * w, py + ny * w, depth]), outer: across.map((w) => [px + nx * w + out[0] * STRAP.thick, py + ny * w + out[1] * STRAP.thick, depth + out[2] * STRAP.thick]) };
    });
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i], b = rows[i + 1], sum = [a.out[0] + b.out[0], a.out[1] + b.out[1], a.out[2] + b.out[2]], sl = Math.hypot(sum[0], sum[1], sum[2]) || 1, out = sum.map((x) => x / sl);
      // Its face: fur with the print between two leather edges. Then its underside and its two sides.
      for (let c = 0; c < 3; c++) {
        const q = [a.outer[c], a.outer[c + 1], b.outer[c + 1], b.outer[c]];
        poly(geo, q, c === 1 ? color : edge, out);
        if (c === 1 && print) leopardPrint(geo, q, out, print, i * 13 + 5, 2.2);
      }
      poly(geo, [a.inner[0], a.inner[3], b.inner[3], b.inner[0]], shade(color, 0.6), [-out[0], -out[1], -out[2]]);
      poly(geo, [a.inner[0], a.outer[0], b.outer[0], b.inner[0]], shade(edge, 0.8), [-nx, -ny, 0]);
      poly(geo, [a.inner[3], a.outer[3], b.outer[3], b.inner[3]], shade(edge, 0.8), [nx, ny, 0]);
    }
  };
  // The default club, turned from one piece of wood: a knob at its butt, a slim handle with a wrapped grip, and a
  // smooth swell into a heavy round-topped head. Its butt is a unit under the hand and it is as long as the block
  // club it stands in for. `wood` and `dark` are its two colours; its profile is [height, radius], the handle's
  // radius where it is gripped the build's own (HANDLE): the regular build's big fist holds a stout one, and the
  // slim build's a slimmer one that fills her smaller hand as well. The head is the same on both. What is under
  // the hand, the knob and the butt, has to stay inside the fist that holds it: the slim build's fist is about three
  // quarters of his in a club's own units and narrows toward her wrist, so her club's butt is that much nearer
  // the hand (`under`) and its knob stands less proud of the handle (`knob`); a butt as long as his comes out of
  // the side of her hand.
  const HANDLE = { regular: { r: 0.84, under: 1, knob: 0.18 }, slim: { r: 0.68, under: 0.74, knob: 0.08 } };
  const club = (u, [wood, dark], slim = false) => {
    const { r, under, knob } = slim ? HANDLE.slim : HANDLE.regular;
    const profile = [[-under, r - 0.12 - (0.18 - knob)], [-0.82 * under, r + knob], [-0.5 * under, r + knob], [-0.3 * under, r], [1.5, r], [1.7, r - 0.06], [3.6, r + 0.02], [5, Math.max(0.94, r + 0.16)], [6.4, 1.26], [7.6, 1.5], [8.7, 1.58], [9.5, 1.38], [10, 0.88]];
    const tones = profile.slice(1).map((_, i) => i < 2 ? dark : i < 4 ? shade(dark, 0.86) : i === 4 ? dark : i % 2 ? shade(wood, 0.93) : wood);
    return scaled(loft(geometry(), profile.map(([y, w]) => [y, w, w, w * 0.586]), tones), u);
  };
  // A nunchaku, in units from the grip: two eight-sided sticks of dark lacquered wood, each a little thicker toward
  // its free end, with a steel collar and cap where the chain joins it, and a short chain of flat links between them.
  // `handle` is the held stick, its butt a unit under the grip. `free` is the chain and the other stick drawn up from
  // the chain's foot, so a node at `pivot` over the grip swings both together. `pair` is the two in line, for the
  // trail of a spin. `swing` is how far from the pivot the free stick's weight hangs.
  const nunchaku = (u, gold = false) => {
    const wood = gold ? "#c79a2f" : "#1d1e22", woodLt = gold ? "#e0b84a" : "#2c2e35", steel = gold ? "#f0d27a" : "#9aa0a8", steelDk = gold ? "#8a6a18" : "#5c626b";
    const PIVOT = 4.8, CHAIN = 1.3, LONG = 5.8;
    const stick = (geo, y0, way) => {
      const at = (d) => y0 + way * d;
      loft(geo, [[at(0), 0.28, 0.28, 0.1], [at(0.12), 0.58, 0.58, 0.2], [at(0.5), 0.58, 0.58, 0.2]], steel);
      loft(geo, [[at(0.5), 0.5, 0.5, 0.18], [at(0.8), 0.5, 0.5, 0.18]], woodLt, [false, false]);
      loft(geo, [[at(0.8), 0.52, 0.52, 0.19], [at(LONG - 0.18), 0.63, 0.63, 0.22], [at(LONG), 0.5, 0.5, 0.2]], wood);
      loft(geo, [[at(1.25), 0.545, 0.545, 0.2], [at(1.37), 0.548, 0.548, 0.2]], steelDk, [false, false]);
      return geo;
    };
    const chain = (geo, y0) => {
      for (let i = 0; i < 3; i++) {
        const y = y0 + 0.2 + i * 0.45, flat = i % 2 ? [0.07, 0.21] : [0.21, 0.07];
        loft(geo, [[y - 0.3, flat[0], flat[1], 0.05], [y + 0.3, flat[0], flat[1], 0.05]], i % 2 ? steelDk : steel);
      }
      return geo;
    };
    const handle = stick(geometry(), PIVOT, -1), free = stick(chain(geometry(), 0), CHAIN, 1), pair = stick(chain(stick(geometry(), PIVOT, -1), PIVOT), PIVOT + CHAIN, 1);
    return { handle: scaled(handle, u), free: scaled(free, u), pair: scaled(pair, u), pivot: PIVOT * u, swing: (CHAIN + LONG * 0.55) * u };
  };
  // A head for an Ooga that draws none of its own, from its traits alone, in the place of the block head: `palette`
  // and `P` its colours. Hair, beard and brow are whole, with no gaps. The regular build's is blocks a unit across
  // (a skull, a cap of hair down the back and sides, a full beard) with its features stood on the face as slabs: a
  // heavy brow, white eyes with pupils low and in, a broad nose, two teeth in the beard. The slim build's has a
  // modelled face, plain and unpainted (a broad chin, a low brow, brown eyes, a broad nose, a mouth), under the
  // same blocks of hair, worn long. It returns the head with its eyes open and shut.
  // An eye's colour unless a character names its own (`eyeColor`).
  const BROWN = "#5a3a1e";
  const head = (k, { palette, P }) => {
    const t = k.traits, u = k.u, slim = !!t.slim, hairy = !t.bald && !t.hairless, kind = t.face || (slim || t.cleanShaven ? "nose" : "beard");
    const skin = palette[P.skin], hair = palette[P.hair], hairDk = palette[P.hairDk], F = FRONT, v = makeVox();
    const grain = (x, y, z) => ((Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 100;
    const lock = (x, y, z) => v.set(x, y, z, grain(x, y, z) < 16 ? 3 : 2);
    if (!slim) {
      v.fill(0, 6, 0, 5, 0, 5, 0);
      v.fill(1, 5, 0, 1, 6, 6, 0);
    }
    if (hairy && slim) {
      // Long hair with some shape to it. The crown is a dome: a full layer with its corners off, a smaller one
      // over it and a smaller one again. A lock comes down each temple beside the face.
      for (let x = -1; x <= 7; x++) for (let z = -1; z <= 6; z++) {
        const edge = (x === -1 || x === 7 ? 1 : 0) + (z === -1 || z === 6 ? 1 : 0);
        if (edge < 2) { lock(x, 6, z); lock(x, 7, z); }
        if (!edge) lock(x, 8, z);
        if (x >= 1 && x <= 5 && z >= 1 && z <= 4) lock(x, 9, z);
      }
      for (const x of [0, 6]) { lock(x, 5, 6); lock(x, 4, 6); }
      // Down the back to the shoulder blades, longest in the middle; the layer against the head is wider and ends
      // a little higher.
      for (let x = 0; x <= 6; x++) for (let y = -5 + Math.max(0, Math.abs(x - 3) - 1); y <= 5; y++) lock(x, y, -2);
      for (let x = -1; x <= 7; x++) for (let y = -4 + Math.max(0, Math.abs(x - 3) - 2); y <= 5; y++) lock(x, y, -1);
      // Down each side, shorter toward the face, with more of it over each ear.
      for (const x of [-1, 7]) for (let z = 0; z <= 4; z++) for (let y = z <= 1 ? -3 : z - 4; y <= 5; y++) lock(x, y, z);
      for (const x of [-2, 8]) for (let z = 0; z <= 3; z++) for (let y = z === 0 || z === 3 ? 2 : 0; y <= (z === 0 || z === 3 ? 4 : 5); y++) lock(x, y, z);
    } else if (hairy) {
      // A cap that rounds off at the top, the back of the head down to the neck and the sides down over the ears.
      for (let x = -1; x <= 7; x++) for (let z = -1; z <= 6; z++) for (let y = 6; y <= 8; y++) if (y < 8 || x > -1 && x < 7 && z > -1 && z < 6) lock(x, y, z);
      for (let x = -1; x <= 7; x++) for (let z = -2; z <= -1; z++) for (let y = -2; y <= 5; y++) if (z > -2 || x > -1 && x < 7) lock(x, y, z);
      for (const x of [-1, 7]) for (let z = -1; z <= 4; z++) for (let y = 2; y <= 5; y++) lock(x, y, z);
    } else if (!slim) for (const x of [-1, 7]) v.fill(x, x, 2, 3, 2, 3, 1);
    if (!slim && kind === "beard") {
      for (let x = 0; x <= 6; x++) for (let y = 0; y <= 1; y++) for (let z = 5; z <= 7; z++) lock(x, y, z);
      for (let x = 1; x <= 5; x++) for (let y = -2; y <= -1; y++) for (let z = 5; z <= 7; z++) lock(x, y, z);
    }
    const blocks = voxelGeometry(v, { unit: u, palette: [skin, shade(skin, 0.9), hair, hairDk], origin: { x: -3.5 * u, y: 0, z: -3 * u } });
    const white = t.eyeColor || "#f4f0e6", glow = t.eyeGlow || 0, nose = palette[P.nose], dark = "#2a1a14";
    const blockFace = (shut) => {
      const g = geometry(), z = 3.001;
      for (const side of [-1, 1]) {
        const X = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)];
        const [ex0, ex1] = t.wideEyes ? X(0.5, 3.5) : X(1.5, 3.5), ey0 = t.wideEyes ? 1 : 2;
        if (!t.noBrow) { const [bx0, bx1] = X(0, 3.55); slab(g, rect(bx0, bx1, 4, 5.05, z, 0.18, 0.07 * side), F, 1, 0.9, hair, hairDk); }
        if (shut) {
          slab(g, rect(ex0, ex1, ey0, 4, z), F, 0.1, 1, shade(skin, 0.9));
          slab(g, rect(ex0, ex1, 2.55, 2.75, z + 0.1), F, 0.03, 1, shade(skin, 0.45));
          continue;
        }
        slab(g, rect(ex0, ex1, ey0, 4, z, 0.12), F, 0.06, 1, white, shade(white, 0.88), glow);
        if (t.noPupils) continue;
        const [px0, px1] = X(1.55, 2.55), gx = (px0 + px1) / 2 + 0.2;
        slab(g, rect(px0, px1, 2.05, 3.05, z + 0.06, 0.1), F, 0.05, 1, "#17110d");
        slab(g, rect(gx, gx + 0.28, 2.62, 2.9, z + 0.11), F, 0.03, 1, "#ffffff");
      }
      // A pig's snout (`look.snout`) in the nose's place: a short round muzzle, its flat end ahead, with two nostrils.
      const snout = () => {
        slab(g, rect(-1.55, 1.55, 2.05, 3.95, z, 0.62), F, 1.75, 0.94, "#e8a8a8", "#cf8f90");
        for (const side of [-1, 1]) slab(g, rect(side * 0.62 - 0.28, side * 0.62 + 0.28, 2.62, 3.38, z + 1.75, 0.14), F, 0.02, 1, "#6a3535");
      };
      if (kind === "beard") {
        if (t.snout) snout(); else noseBlock(g, rect(-1.5, 1.5, 2, 4, z, 0.4), F, 1.9, nose, shade(nose, 0.85));
        // A tooth either side, sunk in the beard (none with `look.noTeeth`: the beard is whole).
        if (!t.noTeeth) for (const side of [-1, 1]) loft(g, [[0.15, 0.3, 0.3, 0.12, 2 * side, 5.1], [0.75, 0.26, 0.26, 0.1, 2.05 * side, 5.14], [1.3, 0.04, 0.04, 0.02, 2.12 * side, 5.17]], ["#e6dabd", "#fcf8ec"]);
      } else if (kind !== "none") {
        if (t.snout) snout(); else noseBlock(g, rect(-0.6, 0.6, 2, 3.9, z, 0.2), F, 1.2, nose, shade(nose, 0.85));
        slab(g, rect(-1.5, 1.5, 0.35, 0.65, 4.001, 0, kind === "smirk" ? 0.12 : 0), F, 0.03, 1, dark);
      }
      return g;
    };
    // The slim build's face is plain: a broad chin, a low heavy brow, eyes no bigger than they need be with a dark
    // line over each, a broad nose and a mouth in her own skin's darker tones. Nothing on it is painted.
    const softFace = (shut) => {
      const g = loft(geometry(), [[0, 2.45, 2.4, 0.85, 0, 0.25], [1.2, 3.1, 3, 0.9], [4.6, 3.25, 3, 0.9], [6.3, 3, 2.8, 1], [7, 2, 1.9, 0.8]], skin), z = 3.005;
      const iris = t.eyeColor || BROWN, lip = shade(skin, 0.74), lipDk = shade(skin, 0.6);
      for (const side of [-1, 1]) {
        const X = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)], cx = 1.6 * side;
        if (shut) slab(g, rect(cx - 0.72, cx + 0.72, 3.02, 3.18, z, 0.06), F, 0.04, 1, dark);
        else {
          slab(g, rect(cx - 0.72, cx + 0.72, 2.72, 3.56, z, 0.22), F, 0.04, 1, "#f4f0e6", "#d9d2c2", glow);
          if (!t.noPupils) {
            slab(g, rect(cx - 0.4, cx + 0.4, 2.74, 3.54, z + 0.04, 0.2), F, 0.03, 1, iris);
            slab(g, rect(cx - 0.2, cx + 0.2, 2.94, 3.36, z + 0.07, 0.07), F, 0.02, 1, "#15100d");
            slab(g, rect(cx - 0.3, cx - 0.12, 3.3, 3.46, z + 0.09), F, 0.02, 1, "#ffffff");
          }
          // The lid's own dark line.
          slab(g, rect(cx - 0.78, cx + 0.78, 3.54, 3.66, z + 0.04, 0.04), F, 0.05, 1, dark);
        }
        if (!t.noBrow) { const [bx0, bx1] = X(0.45, 2.75); slab(g, rect(bx0, bx1, 3.82, 4.22, z, 0.1, -0.05 * side), F, 0.26, 0.92, shade(hair, 0.8), shade(hair, 0.62)); }
        // The upper lip, in two halves.
        slab(g, [[0, 1.16, z], [0.7 * side, 1.2, z], [0.3 * side, 1.36, z], [0, 1.32, z]], F, 0.06, 0.96, lip, lipDk);
      }
      slab(g, [[-0.7, 1.2, z], [-0.4, 0.98, z], [0.4, 0.98, z], [0.7, 1.2, z], [0, 1.16, z]], F, 0.07, 0.94, shade(skin, 0.82), lipDk);
      // A broad nose.
      slab(g, [[-0.46, 1.86, z], [0.46, 1.86, z], [0.24, 2.95, z], [-0.24, 2.95, z]], F, 0.44, 0.62, skin, shade(skin, 0.88));
      return g;
    };
    const whole = (shut) => merge(blocks, scaled((slim ? softFace : blockFace)(shut), u));
    return { headOpen: whole(false), headClosed: whole(true) };
  };
  // The trunk's surface for a build, in units, for anything laid on it or hung from it: `ring(y)` its half width,
  // half depth, corner cut and middle at a height, `heights` the heights its own rings stand at (it runs straight
  // between them, so a garment with a ring at each follows it exactly; over the shoulders the first is the foot of
  // the neck, where a build has one), `front(y)` and `back(y)` where its front and back stand there,
  // `rise(row)` the height an authored row of the trunk's blocks begins at, and `low`, `belt` and `top`, the heights
  // of its bottom edge, its belt's foot and its shoulders. For a garment that stands off it: `side(y, z)` is where
  // its side is at a place along it and `face(x, y, way)` its front (way 1) or back (-1) at a place across it, round
  // the cut corners too; `over(x, z)` the height of its top over a place between the chest and the neck (null off
  // it); `clear(x, y, z)` how far outside it a point is (negative inside); and `lift(p, rough, d)` the point d
  // outside it from a point p on it, straight out from the surface whatever way that faces (`rough` only has to
  // point roughly outward). Cloth whose every corner is lifted stands that far off the body all over, corners
  // and ledges included.
  const trunk = (slim) => {
    const B = slim ? BUILD.slim : BUILD.regular, rings = B.torso, low = rings[0][0], belt = B.belt[0], top = B.shoulder;
    const at = (y, i) => {
      let n = 1;
      while (n < rings.length - 1 && rings[n][0] < y) n++;
      const a = rings[n - 1], b = rings[n], t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
      return (a[i] || 0) + ((b[i] || 0) - (a[i] || 0)) * t;
    };
    const ring = (y) => [at(y, 1), at(y, 2), at(y, 3), at(y, 5)];
    // How far outside the trunk's outline at its own height a point is, level with it.
    const gap = (x, y, z) => { const [hx, hz, cut, cz] = ring(y), ax = Math.abs(x), az = Math.abs(z - cz); return Math.max(ax - hx, az - hz, (ax + az - (hx + hz - cut)) * Math.SQRT1_2); };
    const clear = (x, y, z) => {
      let best = gap(x, y, z);
      if (best <= 0) return best;
      for (let dy = -0.4; dy < 0.41; dy += 0.1) if (Math.abs(dy) > 0.01) best = Math.min(best, Math.hypot(Math.max(0, gap(x, y + dy, z)), dy));
      return best;
    };
    const side = (y, z) => { const [hx, hz, cut, cz] = ring(y); return hx - Math.max(0, Math.min(Math.abs(z - cz), hz) - (hz - cut)); };
    const face = (x, y, way) => { const [hx, hz, cut, cz] = ring(y); return cz + way * (hz - Math.max(0, Math.min(Math.abs(x), hx) - (hx - cut))); };
    const CHEST = rings.reduce((best, r) => r[1] > best[1] ? r : best)[0];
    const over = (x, z) => {
      if (gap(x, CHEST, z) > 0) return null;
      let a = CHEST, b = top;
      if (gap(x, b, z) <= 0) return b;
      for (let i = 0; i < 18; i++) { const m = (a + b) / 2; if (gap(x, m, z) <= 0) a = m; else b = m; }
      return a;
    };
    const lift = (p, rough, d) => {
      const q = [p[0] + rough[0] * 0.05, p[1] + rough[1] * 0.05, p[2] + rough[2] * 0.05], E = 0.03;
      for (let i = 0; i < 6; i++) {
        const c = clear(q[0], q[1], q[2]);
        if (Math.abs(d - c) < 0.006) break;
        let gx = clear(q[0] + E, q[1], q[2]) - c, gy = clear(q[0], q[1] + E, q[2]) - c, gz = clear(q[0], q[1], q[2] + E) - c, gl = Math.hypot(gx, gy, gz);
        if (gl < 1e-6) { gx = rough[0]; gy = rough[1]; gz = rough[2]; gl = Math.hypot(gx, gy, gz) || 1; }
        q[0] += gx / gl * (d - c); q[1] += gy / gl * (d - c); q[2] += gz / gl * (d - c);
      }
      return q;
    };
    return { low, belt, top, at, ring, heights: rings.map((r) => r[0]), front: (y) => at(y, 5) + at(y, 2), back: (y) => at(y, 5) - at(y, 2), side, face, over, clear, lift,
      rise: (y) => y >= 8 ? top + y - 8 : y >= 3 ? belt + (y - 3) / 5 * (top - belt) : y >= 0 ? low + y / 3 * (belt - low) : low + y };
  };
  // A body for an Ooga that models none of its own: the regular or the slim build, wearing what its authored blocks
  // wore. `torso`, `armR`, `armL`, `legR` and `legL` are those block maps (null where a character put in a mesh of
  // its own: that part is bare skin), `palette` and `P` their colours, `lit` the colours that glow and `loin` the
  // loincloth's two. The blocks' colours are laid on the modelled parts cell by cell, a row of blocks to a band of
  // the part: the hip band under the belt, the belt's row on the belt, the chest's rows from there to the shoulders,
  // an arm's eleven rows from shoulder to wrist (the last two colour the fist) and a leg's from hip to ankle (the
  // foot's rows make a boot where they are not skin). Skin is one flat colour. A row in its own colour between the
  // hip and the chest becomes the belt, with a buckle where its front block differs; a bare chest gets its line and
  // nipples; and the loincloth's flaps become the skirt of shards.
  const wear = (k, { torso, armR, armL, legR, legL, palette, P, lit, loin, strap }) => {
    const slim = !!k.traits.slim, B = slim ? BUILD.slim : BUILD.regular, skinKey = P.skin, skin = palette[skinKey];
    const plain = (c) => c === undefined || c === P.skinDk ? skinKey : c;
    const tone = (c) => [palette[c === undefined ? skinKey : c], lit && lit[c] || 0];
    // Fur's authored spots are blocks of the spot colour among the fur: the fur is read as one flat colour, and the
    // modelled body prints its leopard's blotches over it instead (`print`).
    const reader = (map) => {
      const at = map ? blockRows(map) : null;
      return (row, xn, zn) => { const c = plain(at ? at(row, xn, zn) : undefined); return c === P.spot && at.has(row, P.fur) ? P.fur : c; };
    };
    // The colours round a row: to tell two rows apart, and to find what most of one is.
    const AROUND = 28, round = (at, row, fn) => {
      for (let i = 0; i < AROUND; i++) { const a = (i + 0.5) / AROUND * Math.PI * 2; fn(at(row, Math.max(-1, Math.min(1, 1.5 * Math.sin(a))), Math.max(-1, Math.min(1, 1.5 * Math.cos(a))))); }
    };
    const mark = (at, row) => { let s = ""; round(at, row, (c) => { s += c + ","; }); return s; };
    const most = (at, row) => {
      const counts = new Map();
      round(at, row, (c) => counts.set(c, (counts.get(c) || 0) + 1));
      let key = skinKey, share = 0;
      for (const [c, n] of counts) if (n > share) { key = c; share = n; }
      return { key, share: share / AROUND };
    };
    // A leg: rows 4 down to 2 from the hip to the ankle; the foot's two rows say what is on the foot.
    const LEG = 5.6, legRow = (y) => 4 - Math.min(2, Math.floor(Math.max(0, -y) / LEG * 3));
    const legs = [legR, legL].map((map) => {
      const at = reader(map), leg = { breaks: [], pick: (xn, y, zn) => at(legRow(y), xn, zn) };
      for (let i = 1; i <= 2; i++) if (mark(at, 4 - i) !== mark(at, 5 - i)) leg.breaks.push(-i / 3 * LEG);
      return { leg, foot: most(at, 1).key, sole: most(at, 0).key, shin: most(at, 2).key, thigh: most(at, 4).key };
    });
    // The stock outfit's fur strap runs from one shoulder to the other hip, two blocks wide. A trunk that still
    // carries it whole (`strapped`) wears the body's own strap in its place, and those blocks are not laid on; one
    // a character drew over, or built for itself, has none.
    const furry = (x, y) => { const c = torso.get(x, y, 4); return c === P.fur || c === P.spot; };
    const strapped = !!strap && !!torso && [4, 5, 6, 7].every((y) => {
      const x = 7 - Math.round((y - 4) * 1.6);
      // The strap's own two blocks are fur, and the chest either side of them is not: a fur vest is not a strap.
      return [0, 1].every((dx) => x + dx < 1 || x + dx > 7 || furry(x + dx, y)) && [-1, 2].every((dx) => x + dx < 1 || x + dx > 7 || !furry(x + dx, y));
    });
    // The loincloth: the flaps a trunk's blocks hang under it (a trunk built without any wears none), and the fur
    // round its hips. Trousers go without the stock leopard one: no flaps, and the hips in the trousers' cloth.
    let flaps = !torso;
    if (torso) torso.each((x, y) => { if (y < 0) flaps = true; });
    const trousers = legs[0].thigh !== skinKey, bareHips = trousers && !loin;
    // The trunk: rows 0 to 2 are the hip band, 3 the belt's, 4 to 7 the chest's; over the shoulders is the neck.
    const blocksT = reader(torso), T = (row, xn, zn) => {
      const c = blocksT(row, xn, zn);
      return strapped && row >= 4 && c === P.fur ? skinKey : bareHips && row < 3 && c === P.fur ? legs[0].thigh : c;
    };
    const low = B.torso[0][0], belt0 = B.belt[0], top = B.shoulder;
    const rowAt = (y) => y >= top ? -1 : y >= belt0 ? Math.min(7, 3 + Math.floor((y - belt0) / (top - belt0) * 5)) : Math.max(0, Math.min(2, Math.floor((y - low) / (belt0 - low) * 3)));
    const foot = (row) => row < 3 ? low + row / 3 * (belt0 - low) : belt0 + (row - 3) / 5 * (top - belt0);
    const breaks = [top];
    for (let row = 1; row <= 7; row++) if (mark(T, row) !== mark(T, row - 1)) breaks.push(foot(row));
    // A belt is a row in a colour of its own between its neighbours: the stock one on row 3, or one a character
    // drew a row lower. Its front block, where it differs, is the buckle.
    const beltOn = (row) => { const band = most(T, row); return band.key !== skinKey && band.share >= 0.6 && band.key !== most(T, row - 1).key && band.key !== most(T, row + 1).key ? band.key : null; };
    const beltRow = beltOn(3) !== null ? 3 : beltOn(2) !== null ? 2 : -1, beltKey = beltRow < 0 ? null : beltOn(beltRow), buckle = beltRow < 0 ? null : T(beltRow, 0, 1);
    const belt = beltKey !== null
      ? { color: palette[beltKey], ...(buckle !== beltKey ? { gold: palette[buckle], goldDark: shade(palette[buckle], 0.75), goldLight: shade(palette[buckle], 1.2) } : null) } : null;
    const chestRow = B.nipple ? rowAt(B.nipple[1]) : -1, bare = (xn) => T(chestRow, xn, 1) === skinKey, pecs = B.nipple && bare(0.63) && bare(-0.63) ? shade(skin, 0.72) : null;
    const [la, lb] = loin || [P.fur, P.spot], furA = palette[la], furB = palette[lb];
    // The loincloth carries its second colour as the print: the leopard's spots, or a character's own.
    const spotted = lb !== la ? palette[lb] : undefined;
    // With a belt the skirt is two layers hung under it; without, it is the hem of the trunk's own cloth, in the
    // cloth's own colour, with a shorter fringe behind it.
    const under = shade(furA, 0.8), length = slim ? 1.3 : 2.5;
    const skirt = !flaps || bareHips || k.traits.noFlaps ? null
      : belt ? [[length + (slim ? 0.2 : 0), furA, shade(furA, 0.9), 0.08, spotted], [length + 0.7, under, slim ? null : shade(furA, 0.72), 0.02, spotted]]
      : [[length, furA, shade(furA, 0.94), 0, spotted], [length * 0.7, under, null, -0.04, spotted]];
    // An arm: rows 10 down to 2 from the shoulder to the wrist, along the upper arm and then the forearm.
    const [ey, ez] = B.elbow, upper = -ey, total = upper + Math.hypot(HAND_Y + ey, HAND_Z - ez), armRow = (d) => Math.max(2, Math.min(10, 10 - Math.floor(d / total * 9)));
    const arms = [armR, armL].map((map) => {
      const at = reader(map), arm = { breaks: [], pick: (xn, y, zn) => at(armRow(Math.max(0, -y)), xn, zn) };
      const forearm = { breaks: [], pick: (xn, y, zn) => at(armRow(upper + Math.max(0, -y)), xn, zn) };
      for (let i = 1; i <= 8; i++) if (mark(at, 10 - i) !== mark(at, 11 - i)) { const d = i / 9 * total; if (d < upper) arm.breaks.push(-d); else forearm.breaks.push(upper - d); }
      return { arm, forearm, hand: palette[most(at, 1).key] };
    });
    const shoe = legs[0].foot, boot = shoe !== skinKey ? { color: palette[shoe], sole: legs[0].sole !== shoe && legs[0].sole !== skinKey ? palette[legs[0].sole] : shade(palette[shoe], 0.6), shaft: legs[0].shin === shoe } : null;
    const across = strapped ? { color: furA, edge: palette[P.wood], print: palette[P.spot] } : null;
    // What a hook built out past the trunk's own box (wings off the back, a wrap up over a shoulder, a buckle out
    // of the belt) stays as blocks: each keeps its place on the face of the box it stood on, and that face is moved
    // to where the modelled trunk's surface is at its height, so nothing sinks into the trunk or hangs off it.
    let built = null;
    if (torso) {
      const out = makeVox();
      let any = false;
      torso.each((x, y, z, c) => { if (x < 0 || x > 8 || y > 7 || z < 0 || z > 5) { out.set(x, y, z, c); any = true; } });
      if (any) {
        built = voxelGeometry(out, { unit: 1, palette, origin: { x: -4.5, y: 0, z: -3 }, emissive: lit || {} });
        const rings = B.torso, rise = (y) => y >= 8 ? top + y - 8 : y >= 3 ? belt0 + (y - 3) / 5 * (top - belt0) : y >= 0 ? low + y / 3 * (belt0 - low) : low + y;
        const ringAt = (y, i) => {
          let n = 1;
          while (n < rings.length - 1 && rings[n][0] < y) n++;
          const a = rings[n - 1], b = rings[n], t = Math.max(0, Math.min(1, (y - a[0]) / (b[0] - a[0])));
          return (a[i] || 0) + ((b[i] || 0) - (a[i] || 0)) * t;
        };
        const v = built.verts, u = k.u;
        for (let n = 0; n < v.length; n += 3) {
          // Over the shoulders the trunk draws in to the neck: what stands up there keeps the shoulders' own width.
          const y = rise(v[n + 1]), at = Math.min(y, top - 0.6), hx = ringAt(at, 1), hz = ringAt(at, 2), cz = ringAt(at, 5), x = v[n], z = v[n + 2];
          v[n] = (Math.abs(x) >= 4.5 ? Math.sign(x) * (hx + Math.abs(x) - 4.5) : x * hx / 4.5) * u;
          v[n + 1] = y * u;
          v[n + 2] = (z <= -3 ? cz - hz + z + 3 : z >= 3 ? cz + hz + z - 3 : cz + z * hz / 3) * u;
        }
      }
    }
    const body = build(k, { skin, slim, belt, skirt, hem: !belt && slim, strap: across, pecs, sternum: !!pecs && bare(0), boot, hands: [arms[0].hand, arms[1].hand],
      paint: { tone, print: { key: P.fur, color: palette[P.spot] }, torso: { breaks, pick: (xn, y, zn) => { const row = rowAt(y); return row < 0 ? skinKey : T(row, xn, zn); } },
        arm: arms.map((a) => a.arm), forearm: arms.map((a) => a.forearm), leg: legs.map((l) => l.leg) } });
    if (built) body.torso = merge(body.torso, built);
    return body;
  };
  BL.heroBody = { wear, trunk, head, club, nunchaku, poly, both, loft, slab, noseBlock, rect, fur, cuff, buckle, hand, build, shade, scaled, FRONT, BUILD };
})();
