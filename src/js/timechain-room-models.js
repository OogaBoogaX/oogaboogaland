// The Timechain Sphere's rooms, as the shell every room shares and the kit each kind builds its own place with
// (timechain-room-*.js, registered on `BL.timechainRoomKinds`). The shell: the sphere of the room's layout
// (timechain-rooms.js), the dark wall below its screen's lower edge and the screen over it, one canvas wrapped round
// the whole dome (`dome`); the floor, a canvas laid flat (`floor`) or a raked hall's terraces; and behind the visitor
// the one doorway in a flat bay under its EXIT header, its two leaves meeting at a seam, the Exit button and the
// room's lock either side, and a dim vestibule past it, each room's door in its own style (a kind's `door`, and its
// own trim round the frame). The doorway, the buttons and everything a body touches keep human size in every room.
//
// A kind's `plan(K, L, room)` builds its place through the kit `K`: parts merged into the room's few static meshes
// (`box`, `cyl`, `ball`, `torus`, `lathe`, `prism`, `slab`, `sector`, each placed in the current `group`'s frame), nodes
// of their own for what moves (`node`), flat pictures (`picture`), its solids, seats and lights, the dome's and the
// floor's paint (`dome`, `floor`) and its live pictures on the dome (`live`, repainted by the scene when what they print
// changes). Everything static is built once per room and shared by every visit; `build` makes one visit's nodes.
(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, merge, noShadow, prism, torus } = BL.models;
  const { hexToRgb } = BL.math;
  const { createNode, addChild } = BL.scene;
  const ROOMS = BL.timechainRooms, DOOR = ROOMS.DOOR, DEG = ROOMS.DEG, TAU = ROOMS.TAU;
  const KINDS = BL.timechainRoomKinds = BL.timechainRoomKinds || {};
  const C = {
    wall: "#1f1f23", trim: "#141417", band: "#18181b", bezel: "#0c0c0d", amber: "#f7931a", vestibule: "#0f0f11", curtain: "#08080a",
    curtainB: "#121215", ember: "#9c5a12", leg: "#101012", casing: "#1c1a18", frame: "#37302a", floor: "#161412", riser: "#121110", skirt: "#8a4f0c"
  };
  const rgb = (c) => typeof c === "string" ? hexToRgb(c) : c;
  // A flat polygon wound so its front faces `normal`, whatever order its corners come in.
  const face = (geo, pts, color, emissive, normal) => {
    const base = geo.verts.length / 3, i = [];
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length];
      geo.verts.push(p[0], p[1], p[2]);
      i.push(base + k);
      nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    geo.faces.push({ i: nx * normal[0] + ny * normal[1] + nz * normal[2] < 0 ? i.reverse() : i, color: rgb(color), emissive });
  };
  const quad = (geo, a, b, c, d, color, emissive, normal) => face(geo, [a, b, c, d], color, emissive, normal);
  const blank = () => ({ verts: [], faces: [], lines: [] });
  // Preview construction, liveGeometry and cancellation all run from the hub; these meshes belong to the room.
  const own = (build) => {
    const read = BL.models.cached(build);
    return () => BL.models.withScope("timechain", read);
  };
  const perRoom = (build) => {
    const read = BL.models.variants(build);
    return (id) => BL.models.withScope("timechain", read, id);
  };
  const UP = [0, 1, 0], DOWN = [0, -1, 0];
  // What of a convex polygon of [x, z] corners keeps nx·x + nz·z ≤ d (Sutherland–Hodgman against one half-plane).
  const clip = (poly, nx, nz, d) => {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length], sp = nx * p[0] + nz * p[1] - d, sq = nx * q[0] + nz * q[1] - d;
      if (sp <= 0) out.push(p);
      if (sp < 0 && sq > 0 || sp > 0 && sq < 0) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out.length >= 3 ? out : null;
  };
  // The same in three dimensions, keeping what lies where component `axis` times `sign` is at most `d`.
  const clip3 = (poly, axis, sign, d) => {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length], sp = sign * p[axis] - d, sq = sign * q[axis] - d;
      if (sp <= 0) out.push(p);
      if (sp < 0 && sq > 0 || sp > 0 && sq < 0) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
    }
    return out.length >= 3 ? out : null;
  };
  // A convex polygon as faces Canvas 2D can map a picture over: itself if a quad, else triangles as quads with a
  // repeated corner.
  const pictureFace = (geo, pts, normal) => {
    if (pts.length === 4) { face(geo, pts, [255, 255, 255], 0.9, normal); return; }
    for (let k = 1; k + 1 < pts.length; k++) face(geo, [pts[0], pts[k], pts[k + 1], pts[k + 1]], [255, 255, 255], 0.9, normal);
  };
  // What of a face of the sphere lies outside the doorway's passage (on the door's side, inside its jambs and under
  // its head), in convex pieces: the vestibule's own walls stand where the cut is, and the bay's casing hides the rest.
  const HOLE = { x: DOOR.halfW + 0.02, y: DOOR.height + 0.02 };
  const outsideDoor = (pts) => {
    let near = false;
    for (const p of pts) if (p[2] > 0 && Math.abs(p[0]) < HOLE.x + 0.01 && p[1] < HOLE.y + 0.01) { near = true; break; }
    if (!near) return [pts];
    const out = [];
    let rest = pts;
    for (const [axis, sign, d] of [[2, -1, 0], [0, 1, HOLE.x], [0, -1, HOLE.x], [1, 1, HOLE.y]]) {
      // The piece beyond this side is kept; what lies inside goes on to the next.
      const piece = clip3(rest, axis, -sign, -d);
      if (piece) out.push(piece);
      rest = clip3(rest, axis, sign, d);
      if (!rest) break;
    }
    return out;
  };

  // ---------- the kit: transforms, parts, pictures ----------
  // A transform as a row-major 3x3 rotation and a translation; rotations compose as three.js's XYZ Euler order does.
  const IDENTITY = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
  const local = (x, y, z, rx, ry, rz) => {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    return { r: [cy * cz, -cy * sz, sy, cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy, sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy], t: [x, y, z] };
  };
  const compose = (a, b) => {
    const A = a.r, B = b.r, r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    const t = b.t;
    return { r, t: [A[0] * t[0] + A[1] * t[1] + A[2] * t[2] + a.t[0], A[3] * t[0] + A[4] * t[1] + A[5] * t[2] + a.t[1], A[6] * t[0] + A[7] * t[1] + A[8] * t[2] + a.t[2]] };
  };
  const point = (m, x, y, z) => [m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t[0], m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t[1], m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t[2]];
  const transform = (geo, m) => {
    const v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { const p = point(m, v[i], v[i + 1], v[i + 2]); v[i] = p[0]; v[i + 1] = p[1]; v[i + 2] = p[2]; }
    return geo;
  };
  // The heading a transform turns +z to, for nodes and solids standing in a turned group.
  const yawOf = (m) => Math.atan2(m.r[2], m.r[8]);
  // A cylinder (`rt` its top, `rb` its foot, about its own middle), a ball and a cone, as lathes.
  const cylinder = (rt, rb, h, color, segments = 16, emissive = 0) => lathe({ profile: [[0, -h / 2], [rb, -h / 2], [rt, h / 2], [0, h / 2]], segments, color, emissive });
  const ballGeo = (r, color, segments = 14, emissive = 0) => {
    const n = Math.max(4, Math.round(segments / 2)), profile = [];
    for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + Math.PI * k / n; profile.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return lathe({ profile, segments, color, emissive });
  };
  // A slab between heights over a convex outline of [x, z] corners.
  const slabGeo = (pts, y0, y1, color, emissive = 0) => {
    const geo = blank(), n = pts.length;
    face(geo, pts.map(([x, z]) => [x, y1, z]), color, emissive, UP);
    if (y1 - y0 > 1e-4) {
      face(geo, pts.map(([x, z]) => [x, y0, z]), color, emissive, DOWN);
      let cx = 0, cz = 0;
      for (const [x, z] of pts) { cx += x / n; cz += z / n; }
      for (let k = 0; k < n; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % n], mx = (ax + bx) / 2 - cx, mz = (az + bz) / 2 - cz;
        quad(geo, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], color, emissive, [mx, 0, mz]);
      }
    }
    return geo;
  };
  // An annular sector round (0, F) from `a0` to `a1` (bearings from +z), between radii, as a slab in pieces each convex.
  const sectorGeo = (F, r0, r1, a0, a1, y0, y1, color, emissive = 0, steps = 0) => {
    const parts = [], n = steps || Math.max(4, Math.ceil(Math.abs(a1 - a0) / (3 * DEG)));
    for (let i = 0; i < n; i++) {
      const b0 = a0 + (a1 - a0) * i / n, b1 = a0 + (a1 - a0) * (i + 1) / n;
      parts.push(slabGeo([[r0 * Math.sin(b0), F + r0 * Math.cos(b0)], [r1 * Math.sin(b0), F + r1 * Math.cos(b0)], [r1 * Math.sin(b1), F + r1 * Math.cos(b1)], [r0 * Math.sin(b1), F + r0 * Math.cos(b1)]], y0, y1, color, emissive));
    }
    return merge(...parts);
  };
  // A canvas picture `w` by `h`, flat and facing +z about its own middle (planar mapping).
  const flatPicture = (canvas, w, h, emissive = 0.9) => {
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [255, 255, 255], emissive }], lines: [], castShadow: false };
    geo.imageSurface = { canvas, version: 1, rect: [-w / 2, -h / 2, w, h] };
    return geo;
  };
  // The kit a kind builds with. `into` gathers the room's plan; `m` is the current group's transform.
  const kit = (into, m = IDENTITY) => {
    const place = (geo, x = 0, y = 0, z = 0, o = {}) => {
      transform(geo, compose(m, local(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0)));
      (o.glow ? into.glow : o.flat ? into.flat : into.body).push(geo);
      return geo;
    };
    const at = (x, y, z) => { const p = point(m, x, y, z); return { x: p[0], y: p[1], z: p[2] }; };
    const K = {
      L: into.L, room: into.room, m,
      // A frame inside this one: placed at (x, y, z) and turned.
      group: (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => kit(into, compose(m, local(x, y, z, rx, ry, rz))),
      at, yaw: (ry = 0) => yawOf(m) + ry,
      box: (w, h, d, color, x, y, z, o = {}) => place(box({ w, h, d, color, emissive: o.emissive || 0 }), x, y, z, o),
      cyl: (rt, rb, h, color, x, y, z, o = {}) => place(cylinder(rt, rb, h, color, o.seg || 16, o.emissive || 0), x, y, z, o),
      ball: (r, color, x, y, z, o = {}) => place(ballGeo(r, color, o.seg || 14, o.emissive || 0), x, y, z, o),
      torus: (R, r, color, x, y, z, o = {}) => place(torus(R, r, color, o.emissive || 0, o.seg || 24, o.sides || 6), x, y, z, o),
      lathe: (profile, color, x, y, z, o = {}) => place(lathe({ profile, segments: o.seg || 16, color, emissive: o.emissive || 0 }), x, y, z, o),
      // A convex outline in its own x/y plane, `depth` thick along z.
      prism: (points, depth, color, x, y, z, o = {}) => place(prism(points, depth, color, o.emissive || 0), x, y, z, o),
      slab: (pts, y0, y1, color, o = {}) => place(slabGeo(pts, y0, y1, color, o.emissive || 0), 0, 0, 0, o),
      sector: (F, r0, r1, a0, a1, y0, y1, color, o = {}) => place(sectorGeo(F, r0, r1, a0, a1, y0, y1, color, o.emissive || 0, o.steps || 0), 0, 0, 0, o),
      // A built geometry placed as it is.
      add: (geo, x, y, z, o = {}) => place(geo, x, y, z, o),
      // A node of its own, for what moves or swaps, named for the kind's `animate`; a geometry, or a builder run in a
      // fresh kit whose parts make its mesh, in the node's own frame. With `proxy` it is never drawn: a stand-in a
      // target's `pick` names for clicks, where its real mesh is too fine to test.
      node: (name, geometry, x = 0, y = 0, z = 0, o = {}) => {
        let geo = geometry;
        if (typeof geometry === "function") {
          const sub = { L: into.L, room: into.room, body: [], glow: [], flat: [], nodes: into.nodes, solids: [], seats: [], lights: [], live: into.live, targets: into.targets };
          geometry(kit(sub));
          geo = sub.body.length || sub.glow.length ? merge(...sub.body, ...sub.glow) : null;
          if (geo && !sub.body.length) noShadow(geo);
        }
        // A node with a `parent` stands in that node's own frame; any other in this group's, turned with it.
        const p = o.parent ? { x, y, z } : at(x, y, z), spec = { name, geometry: geo, x: p.x, y: p.y, z: p.z, rx: o.rx || 0, ry: (o.parent ? 0 : yawOf(m)) + (o.ry || 0), rz: o.rz || 0, scale: o.scale || 1, parent: o.parent || null, sightHidden: !!o.glow, depthBias: o.depthBias || 0, target: o.target || null, proxy: !!o.proxy };
        into.nodes.push(spec);
        if (geo) into.geometries.push(geo);
        return spec;
      },
      // A flat canvas picture facing +z in this frame, painted once by `paint(ctx, w, h)` on a canvas `pw` by `ph`.
      picture: (w, h, pw, ph, paint, x, y, z, o = {}) => {
        const canvas = BL.timechainCharts.canvas(pw, ph);
        paint(canvas.getContext("2d"), pw, ph);
        return K.node(o.name || null, flatPicture(canvas, w, h, o.emissive === undefined ? 0.9 : o.emissive), x, y, z, { ...o, glow: true });
      },
      // What a body cannot walk through, in this frame: a circle, or a box `hx` by `hz` either side turned with the frame.
      solid: (o) => {
        const p = at(o.x || 0, 0, o.z || 0);
        into.solids.push(o.r !== undefined ? { x: p.x, z: p.z, r: o.r, top: o.top, below: o.below } : { x: p.x, z: p.z, hx: o.hx, hz: o.hz, ry: K.yaw(o.ry || 0), top: o.top, below: o.below });
      },
      // A seat for the visitor's Ooga: `y` its height over `floor`, what it stands on, facing `heading` in this frame;
      // standing up leaves it at `back` behind it.
      seat: (x, z, heading, y = 0.5, floor = 0, back = 1.35, kind = "chair") => {
        const p = at(x, floor, z), ry = K.yaw(heading), sx = Math.sin(ry), sz = Math.cos(ry);
        const seat = { kind, index: into.seats.length, x: p.x, y: floor + y, z: p.z, floor, ry, sitter: null, walkAt: { x: p.x - sx * back, z: p.z - sz * back } };
        into.seats.push(seat);
        return seat;
      },
      light: (x, y, z, radius, r, g, b) => { const p = at(x, y, z); into.lights.push([p.x, p.y, p.z, radius, r, g, b]); },
      // A tap target over a node (`kind`, `tip` and what the scene does with it).
      target: (spec, kind, tip, radius = 0.8, extra = null) => { spec.target = { kind, tip, radius, ...extra }; return spec; },
      // The dome's and the floor's paint, and a live picture on the dome.
      // `size` ({ w, h, smooth }) for a dome a kind repaints as it plays: a small canvas, drawn up smooth.
      dome: (paint, size = null) => { into.domePaint = paint; into.domeSize = size; },
      // `size` ({ scale, emissive }) for a floor a kind repaints as it plays: `scale` pixels a metre, so whole pixels
      // fall on a grid of that pitch, and how brightly it shows (an LED floor at full).
      floor: (paint, size = null) => { into.floorPaint = paint; into.floorSize = size; },
      live: (spec) => { into.live.push(spec); return spec; },
      // The room's light: overrides of the scene's render options (sky, ground, direct, ambient floor, bloom).
      render: (o) => { into.render = o; },
      wallColor: (c) => { into.wallColor = c; },
      // A raked hall's colours: its terraces (alternating), their amber nosings and the doorway's landing.
      rakeColors: (o) => { if (o.terrace) into.terrace = o.terrace; if (o.nosing) into.nosing = o.nosing; if (o.landing) into.landing = o.landing; },
      floorColor: (c) => { into.floorColor = c; }
    };
    return K;
  };

  // ---------- painting the dome and the floor ----------
  // The dome's canvas wraps the sphere from its screen's lowest edge to the crown: a column per azimuth (the door at
  // the seam, the front in the middle) and a row per height, so a node at z -1 maps it by its curve (gl-renderer
  // `uCanvasCurve`). `D` turns degrees into its pixels and says how large a metre of the dome is there.
  const DOME_W = 4096, DOME_H = 1024;
  const domeMap = (L, W = DOME_W, H = DOME_H) => {
    let yLow = Infinity;
    for (let a = -180; a <= 180; a += 2) { const p = ROOMS.onSphere(L, a * DEG, ROOMS.edgeEl(L, a * DEG)); yLow = Math.min(yLow, p.y); }
    yLow -= 0.05;
    const yHigh = L.crown, span = yHigh - yLow;
    const x = (az) => ((((az + 180) / 360) % 1) + 1) % 1 * W;
    const y = (el) => (yHigh - (L.c + L.R * Math.sin(el * DEG))) / span * H;
    const elAt = (row) => Math.asin(Math.max(-1, Math.min(1, (yHigh - row / H * span - L.c) / L.R))) / DEG;
    // Pixels a metre across (along the circle of latitude) and up (along the meridian) at elevation `el`.
    const perX = (el) => W / (TAU * L.R * Math.max(0.05, Math.cos(el * DEG)));
    const perY = (el) => H / span * Math.max(0.05, Math.cos(el * DEG));
    return { L, W, H, yLow, yHigh, span, x, y, elAt, perX, perY };
  };
  // Painting helpers a kind's `dome` and `floor` get, round a canvas context.
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const HAND = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const fontOf = (weight, px, family = FONT) => `${weight} ${Math.max(1, Math.round(px))}px ${family}`;
  const fit = (ctx, text, maxW, weight, px, family = FONT) => {
    let s = px;
    ctx.font = fontOf(weight, s, family);
    while (s > 6 && ctx.measureText(text).width > maxW) { s *= 0.92; ctx.font = fontOf(weight, s, family); }
    return s;
  };
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  // The island's 5x7 letters (jumbotron.js), `size` pixels tall, the pixel art of every sign; `align` centre or left.
  const pix = (ctx, text, x, y, size, color, align = "center") => {
    const T = BL.jumbotron.text, s = size / T.GLYPH_H, w = T.measureText(text, s);
    T.drawText(ctx, text, align === "center" ? x - w / 2 : align === "right" ? x - w : x, y - size / 2, color, s);
    return w;
  };
  const pixWidth = (text, size) => BL.jumbotron.text.measureText(text, size / BL.jumbotron.text.GLYPH_H);
  // A seeded generator, so a painting is the same every visit.
  const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const paintKit = { FONT, MONO, HAND, SERIF, font: fontOf, fit, roundRect, pix, pixWidth, rng, DEG, TAU };
  // Something drawn across the dome's seam over the door: drawn a canvas width either side too, so neither half is lost.
  const domeWrap = (D) => (ctx, draw) => {
    for (const dx of [-D.W, 0, D.W]) { ctx.save(); ctx.translate(dx, 0); draw(); ctx.restore(); }
  };
  // Text on the dome, `metres` tall, centred at (az, el), drawn so it reads square there however the canvas stretches.
  const domeText = (D) => (ctx, text, az, el, metres, color, weight = 600, family = FONT, align = "center") => {
    const px = metres * D.perY(el), sx = D.perX(el) / D.perY(el);
    domeWrap(D)(ctx, () => {
      ctx.translate(D.x(az), D.y(el)); ctx.scale(sx, 1);
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.font = fontOf(weight, px, family); ctx.fillText(text, 0, 0);
    });
  };
  const domePix = (D) => (ctx, text, az, el, metres, color) => {
    const px = metres * D.perY(el), sx = D.perX(el) / D.perY(el);
    domeWrap(D)(ctx, () => { ctx.translate(D.x(az), D.y(el)); ctx.scale(sx, 1); pix(ctx, text, 0, 0, px, color); });
  };
  // A sky from stops of [elevation, colour], and stars sprinkled above an elevation.
  const domeSky = (D) => (ctx, stops) => {
    const g = ctx.createLinearGradient(0, 0, 0, D.H);
    for (const [el, col] of stops) g.addColorStop(Math.max(0, Math.min(1, D.y(el) / D.H)), col);
    ctx.fillStyle = g; ctx.fillRect(0, 0, D.W, D.H);
  };
  const domeStars = (D) => (ctx, minEl, n, seed, color = "255,248,235") => {
    const r = rng(seed), s0 = Math.sin(minEl * DEG);
    for (let i = 0; i < n; i++) {
      const el = Math.asin(s0 + r() * (1 - s0)) / DEG, s = 1 + r() * 1.6;
      ctx.fillStyle = `rgba(${color},${0.35 + r() * 0.6})`;
      ctx.fillRect(r() * D.W, D.y(el), s * D.perX(el) / D.perX(0), s);
    }
  };
  const paintDome = perRoom((id) => {
    const into = plan(id);
    if (!into.domePaint) return null;
    const size = into.domeSize, D = size ? domeMap(ROOMS.layout(id), size.w, size.h) : domeMap(ROOMS.layout(id)), canvas = BL.timechainCharts.canvas(D.W, D.H), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b0a09"; ctx.fillRect(0, 0, D.W, D.H);
    into.domePaint(ctx, { ...D, ...paintKit, text: domeText(D), pixText: domePix(D), sky: domeSky(D), stars: domeStars(D), wrap: domeWrap(D) });
    return canvas;
  });
  // The floor's canvas, a square laid on the floor's disc: `X` and `Y` turn metres into its pixels, the front up.
  const floorMap = (L, scale = 0) => {
    if (scale) { const N = 2 * Math.ceil(L.r0 * scale), rf = N / (2 * scale); return { N, s: scale, rf, X: (x) => N / 2 + x * scale, Y: (z) => N / 2 + z * scale }; }
    const rf = L.r0, N = Math.min(2048, Math.max(512, Math.ceil(rf * 2 * 64 / 128) * 128)), s = N / (2 * rf);
    return { N, s, rf, X: (x) => N / 2 + x * s, Y: (z) => N / 2 + z * s };
  };
  // The Sphere's amber chain inlaid along a line, a link a tile long with its dark square (a room may give its own
  // colour), and round a ring.
  const chainKit = (F, ctx) => ({
    path: (x0, z0, x1, z1, width = 0.7, color = "#e8891a") => {
      const { X, Y, s } = F, dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), k = Math.max(1, Math.round(len / 0.8)), a = Math.atan2(-dx, dz);
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k;
        ctx.save(); ctx.translate(X(x0 + dx * t), Y(z0 + dz * t)); ctx.rotate(a);
        ctx.fillStyle = color; ctx.fillRect(-width / 2 * s, -len / k / 2 * s + 1.5, width * s, len / k * s - 3);
        ctx.fillStyle = "#1a1410"; ctx.fillRect(-0.12 * s, -0.12 * s, 0.24 * s, 0.24 * s);
        ctx.restore();
      }
    },
    ring: (r0, r1) => {
      const { X, Y, s } = F, rm = (r0 + r1) / 2, count = 3 * Math.round(TAU * rm / 0.78 / 3);
      for (let i = 0; i < count; i++) {
        const a = (i + 0.5) * TAU / count;
        ctx.save(); ctx.translate(X(rm * Math.sin(a)), Y(rm * Math.cos(a))); ctx.rotate(Math.atan2(-Math.cos(a), -Math.sin(a)));
        ctx.fillStyle = "#e8891a"; ctx.fillRect(-(r1 - r0) / 2 * s, -TAU * rm / count / 2 * s + 1.5, (r1 - r0) * s, TAU * rm / count * s - 3);
        ctx.fillStyle = "#1a1410"; ctx.fillRect(-0.12 * s, -0.12 * s, 0.24 * s, 0.24 * s);
        ctx.restore();
      }
    },
    tiles: (a = "#1e1c1a", b = "#1a1816", t = 0.8) => {
      const { N, X, Y, s, rf } = F, n = Math.ceil(rf / t) + 1;
      ctx.fillStyle = "#121110"; ctx.fillRect(0, 0, N, N);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { ctx.fillStyle = (i + j) & 1 ? a : b; ctx.fillRect(X(i * t - t / 2) + 1.5, Y(j * t - t / 2) + 1.5, t * s - 3, t * s - 3); }
    }
  });
  const paintFloor = perRoom((id) => {
    const into = plan(id);
    if (!into.floorPaint) return null;
    const F = floorMap(ROOMS.layout(id), into.floorSize ? into.floorSize.scale : 0), canvas = BL.timechainCharts.canvas(F.N, F.N), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#121110"; ctx.fillRect(0, 0, F.N, F.N);
    into.floorPaint(ctx, { ...F, ...paintKit, ...chainKit(F, ctx) });
    return canvas;
  });

  // ---------- the shell ----------
  // The sphere in faces: columns of azimuth (one boundary on the seam over the door, so no face crosses it), each split
  // at the screen's lower edge into the wall below and the screen above, cut round the doorway's passage. The screen is
  // built a metre along +z, where its node stands it back, so its curve's axis runs up the sphere's middle.
  const sphereParts = perRoom((id) => {
    const L = ROOMS.layout(id), R = L.R, cols = Math.max(72, Math.ceil(TAU * R / 0.9)), wall = blank(), screen = blank(), glowing = blank();
    const into = plan(id), wallColor = into.wallColor || "#1c1a17";
    const elFloor = Math.asin(Math.max(-1, (L.yMin - 0.02 - L.c) / R));
    const edges = [], at = (az, el) => { const p = ROOMS.onSphere(L, az, el); return [p.x, p.y, p.z]; };
    for (let k = 0; k <= cols; k++) edges.push(ROOMS.edgeEl(L, -Math.PI + TAU * k / cols));
    const inward = (pts) => { let x = 0, y = 0, z = 0; for (const p of pts) { x += p[0]; y += p[1] - L.c; z += p[2]; } return [-x, -y, -z]; };
    for (let k = 0; k < cols; k++) {
      const a0 = -Math.PI + TAU * k / cols, a1 = -Math.PI + TAU * (k + 1) / cols, e0 = edges[k], e1 = edges[k + 1];
      // The wall: rows a metre or so tall from the floor to the edge.
      const wallRows = Math.max(2, Math.ceil(R * (Math.max(e0, e1) - elFloor) / 1.1));
      for (let i = 0; i < wallRows; i++) {
        const t0 = i / wallRows, t1 = (i + 1) / wallRows;
        const pts = [at(a0, elFloor + (e0 - elFloor) * t0), at(a1, elFloor + (e1 - elFloor) * t0), at(a1, elFloor + (e1 - elFloor) * t1), at(a0, elFloor + (e0 - elFloor) * t1)];
        for (const piece of outsideDoor(pts)) face(wall, piece, wallColor, 0, inward(piece));
      }
      // The screen: rows of about four degrees from the edge to the crown.
      const top = Math.PI / 2, rows = Math.max(4, Math.ceil((top - Math.min(e0, e1)) / (4 * DEG)));
      for (let i = 0; i < rows; i++) {
        const t0 = i / rows, t1 = (i + 1) / rows;
        const pts = [at(a0, e0 + (top - e0) * t0), at(a1, e1 + (top - e1) * t0), at(a1, e1 + (top - e1) * t1), at(a0, e0 + (top - e0) * t1)];
        for (const piece of outsideDoor(pts)) pictureFace(screen, piece.map((p) => [p[0], p[1], p[2] + 1]), inward(piece));
      }
      // The amber strip along the screen's lower edge, just inside it, and the skirting round the floor.
      const s0 = ROOMS.onSphere(L, a0, e0, 0.996), s1 = ROOMS.onSphere(L, a1, e1, 0.996);
      const strip = [[s0.x, s0.y - 0.04, s0.z], [s1.x, s1.y - 0.04, s1.z], [s1.x, s1.y + 0.04, s1.z], [s0.x, s0.y + 0.04, s0.z]];
      for (const piece of outsideDoor(strip)) face(glowing, piece, C.amber, 1, inward(piece));
      const fy = L.yMin + 0.07, fr = ROOMS.radiusAt(L, fy) * 0.997;
      const skirt = [[fr * Math.sin(a0), fy - 0.02, -fr * Math.cos(a0)], [fr * Math.sin(a1), fy - 0.02, -fr * Math.cos(a1)], [fr * Math.sin(a1), fy + 0.02, -fr * Math.cos(a1)], [fr * Math.sin(a0), fy + 0.02, -fr * Math.cos(a0)]];
      for (const piece of outsideDoor(skirt)) face(glowing, piece, C.skirt, 0.8, inward(piece));
    }
    screen.castShadow = false;
    return { wall, screen, glow: noShadow(glowing) };
  });
  // The dome's picture on the screen, as a node stands it.
  const domeGeometry = perRoom((id) => {
    const canvas = paintDome(id), parts = sphereParts(id);
    if (!canvas) return null;
    const D = domeMap(ROOMS.layout(id)), geo = { verts: parts.screen.verts, faces: parts.screen.faces, lines: [], castShadow: false };
    geo.imageSurface = { canvas, version: 1, rect: [-Math.PI, D.yLow, TAU, D.span], curve: [1, 0, 0], tessellated: true };
    if (plan(id).domeSize && plan(id).domeSize.smooth) geo.imageSurface.smooth = true;
    return geo;
  });
  // The floor's disc in rings and sectors, so Canvas 2D sorts it under what stands on it, with the floor's canvas
  // laid on it (built in the frame a node turned flat maps it in: x across, -z up the canvas). Every ring has the same
  // sectors, so the rings meet corner to corner and no crack opens between them.
  const floorGeometry = perRoom((id) => {
    const L = ROOMS.layout(id), canvas = paintFloor(id), into = plan(id);
    if (L.rake) return null;
    const rf = L.r0 - 0.005, rings = Math.max(3, Math.ceil(rf / 1.6)), sectors = Math.max(24, Math.ceil(TAU * rf / 1.4)), geo = blank();
    for (let i = 0; i < rings; i++) {
      const r0 = rf * i / rings, r1 = rf * (i + 1) / rings;
      for (let k = 0; k < sectors; k++) {
        const b0 = TAU * k / sectors, b1 = TAU * (k + 1) / sectors, p = (r, b) => [r * Math.sin(b), -r * Math.cos(b), 0];
        const pts = i === 0 ? [[0, 0, 0], p(r1, b0), p(r1, b1), p(r1, b1)] : [p(r0, b0), p(r1, b0), p(r1, b1), p(r0, b1)];
        if (canvas) face(geo, pts, [255, 255, 255], into.floorSize && into.floorSize.emissive !== undefined ? into.floorSize.emissive : 0.08, [0, 0, 1]);
        else face(geo, pts, into.floorColor || C.floor, 0, [0, 0, 1]);
      }
    }
    if (canvas) {
      const F = floorMap(L, into.floorSize ? into.floorSize.scale : 0);
      geo.imageSurface = { canvas, version: 1, rect: [-F.rf, -F.rf, 2 * F.rf, 2 * F.rf], tessellated: true };
    }
    return geo;
  });
  // A raked hall's floor: the terraces stepping down round the focus, each with an amber nosing, the landing at the
  // doorway's level from the top row back to the wall, and the floor at the foot.
  const rakeGeometry = perRoom((id) => {
    const L = ROOMS.layout(id), K = L.rake, into = plan(id);
    if (!K) return null;
    const F = K.F, parts = [], glows = [], terrace = into.terrace || ["#221f1c", "#1b1917"], nosing = into.nosing || "#c4700f";
    const foot = ROOMS.radiusAt(L, L.yMin) - 0.01, n = Math.max(24, Math.ceil(TAU * foot / 1.2));
    for (let k = 0; k < n; k++) {
      const b0 = TAU * k / n, b1 = TAU * (k + 1) / n;
      parts.push(slabGeo([[0, 0], [foot * Math.sin(b0), foot * Math.cos(b0)], [foot * Math.sin(b1), foot * Math.cos(b1)]], L.yMin, L.yMin, C.floor));
    }
    for (const row of K.rows) {
      const a = row.psiT;
      parts.push(sectorGeo(F, row.rIn, row.rOut, -a, a, L.yMin, row.y, row.i % 2 ? terrace[0] : terrace[1]));
      glows.push(sectorGeo(F, row.rIn, row.rIn + 0.05, -a, a, row.y, row.y + 0.012, nosing, 0.9));
    }
    // The landing: from the top row's outer arc back round the wall, as far round as both reach.
    const rB = K.landing, r0 = L.r0 - 0.02;
    let pL = 0;
    for (let a = 0; a <= 175; a += 0.5) { const t = a * DEG; if (Math.hypot(rB * Math.sin(t), F + rB * Math.cos(t)) <= r0) pL = t; else break; }
    const P = [rB * Math.sin(pL), F + rB * Math.cos(pL)], bP = Math.atan2(P[0], P[1]), steps = 48;
    for (let i = 0; i < steps; i++) {
      const t0 = pL - 2 * pL * i / steps, t1 = pL - 2 * pL * (i + 1) / steps, w0 = bP - 2 * bP * i / steps, w1 = bP - 2 * bP * (i + 1) / steps;
      parts.push(slabGeo([[rB * Math.sin(t0), F + rB * Math.cos(t0)], [r0 * Math.sin(w0), r0 * Math.cos(w0)], [r0 * Math.sin(w1), r0 * Math.cos(w1)], [rB * Math.sin(t1), F + rB * Math.cos(t1)]], L.yMin, 0, into.landing || "#1f1c1a"));
    }
    glows.push(sectorGeo(F, rB - 0.02, rB + 0.04, -pL, pL, 0, 0.012, nosing, 0.9));
    // The theater aisle's half steps, a box in the outer half of each row.
    if (K.halfSteps) for (let i = 0; i < K.rows.length; i++) {
      const row = K.rows[i], next = i + 1 < K.rows.length ? K.rows[i + 1].y : 0, hy = row.y + (next - row.y) / 2;
      parts.push(box({ w: 2 * K.aisle, h: hy - row.y, d: K.rows[i].rOut - row.d, color: "#1d1a18", offset: { x: 0, y: (row.y + hy) / 2, z: F + (row.d + row.rOut) / 2 } }));
    }
    // The aisle's chain: a link on every row (and half step), on down the landing to the door.
    const links = [];
    for (let i = 0; i < K.rows.length; i++) {
      const row = K.rows[i];
      links.push([F + row.d - (K.halfSteps ? K.depth / 4 : 0), row.y]);
      if (K.halfSteps) links.push([F + row.d + K.depth / 4, row.y + ((i + 1 < K.rows.length ? K.rows[i + 1].y : 0) - row.y) / 2]);
    }
    for (let z = F + rB + 0.4; z < L.doorZ - 0.4; z += 0.8) links.push([z, 0]);
    for (const [z, y] of links) {
      glows.push(box({ w: 0.7, h: 0.012, d: K.halfSteps ? 0.58 : 0.66, color: "#e8891a", emissive: 0.6, offset: { x: 0, y: y + 0.006, z } }));
      parts.push(box({ w: 0.24, h: 0.016, d: 0.24, color: "#1a1410", offset: { x: 0, y: y + 0.008, z } }));
    }
    return { body: merge(...parts), glow: noShadow(merge(...glows)) };
  });
  // The bay round the doorway, standing in front of the sphere: its face with the doorway cut in it, its sides and
  // top running back past the wall, the frame and the header with EXIT, all at human size in every room.
  const EXIT_HEADER = { over: 0.12, h: 0.44, d: 0.22 };
  // ---------- each room's door ----------
  // The doorway is the same in every room (its size, the leaves that slide apart, the Exit button's place), but each
  // dresses it in its own style: a kind's `door` names its colours (the bay's `casing`, the `frame`, the EXIT `header`
  // and its `word`, the `leaf` and its `seam`, the Exit button's `plate`, `face` and `mark`), whether the Sphere's amber
  // `strip` crosses the bay and its `chain` the leaves, and draws its leaves' faces (`leafFace(side, H)`, flat marks in
  // the leaf's own frame, `H` below). The trim round the frame is the kind's own, in its plan. What a kind leaves out
  // keeps the Sphere's charcoal and amber.
  const DOOR_STYLE = { casing: C.casing, frame: C.frame, header: C.trim, word: C.amber, strip: C.amber, chain: true, leaf: C.wall, seam: C.leg, plate: C.trim, face: C.amber, mark: C.curtain, leafFace: null };
  const doorStyle = (id) => ({ ...DOOR_STYLE, ...(KINDS[ROOMS.get(id).kind].door || {}) });
  const bay = perRoom((id) => {
    const L = ROOMS.layout(id), st = doorStyle(id), geo = blank(), Z = L.doorZ, B = DOOR.bay, W = DOOR.halfW, D = DOOR.height, H = DOOR.casing, back = L.R + 0.5, IN = [0, 0, -1];
    quad(geo, [-B, 0, Z], [-W, 0, Z], [-W, H, Z], [-B, H, Z], st.casing, 0, IN);
    quad(geo, [W, 0, Z], [B, 0, Z], [B, H, Z], [W, H, Z], st.casing, 0, IN);
    quad(geo, [-W, D, Z], [W, D, Z], [W, H, Z], [-W, H, Z], st.casing, 0, IN);
    for (const side of [-1, 1]) quad(geo, [side * B, 0, Z], [side * B, 0, back], [side * B, H, back], [side * B, H, Z], st.casing, 0, [side, 0, 0]);
    quad(geo, [-B, H, Z], [B, H, Z], [B, H, back], [-B, H, back], st.casing, 0, UP);
    const F = DOOR.frame, X = EXIT_HEADER, parts = [geo];
    for (const side of [-1, 1]) parts.push(box({ w: F, h: D + F, d: 0.14, color: st.frame, offset: { x: side * (W + F / 2), y: (D + F) / 2, z: Z - 0.05 } }));
    parts.push(box({ w: 2 * W + 2 * F, h: F, d: 0.14, color: st.frame, offset: { y: D + F / 2, z: Z - 0.05 } }));
    parts.push(box({ w: 2 * W + 2 * F + 2 * X.over, h: X.h, d: X.d, color: st.header, offset: { y: D + F + X.h / 2, z: Z - X.d / 2 + 0.02 } }));
    // A lit strip across the bay at the wall's low strip height, either side of the doors.
    if (st.strip) for (const side of [-1, 1]) parts.push(box({ w: B - W - F, h: 0.05, d: 0.02, color: st.strip, emissive: 1, offset: { x: side * (B + W + F) / 2, y: 0.925, z: Z - 0.015 } }));
    return merge(...parts);
  });
  // The vestibule past the doorway, dim, ending in a hanging curtain of dark strips; the same depth in every room.
  const vestibule = perRoom((id) => {
    const L = ROOMS.layout(id), geo = blank(), Z = L.doorZ, W = DOOR.halfW, D = DOOR.height, end = Z + DOOR.vestibule;
    quad(geo, [-W, 0, Z], [W, 0, Z], [W, 0, end], [-W, 0, end], C.vestibule, 0, UP);
    quad(geo, [-W, D, Z], [W, D, Z], [W, D, end], [-W, D, end], C.vestibule, 0, DOWN);
    for (const side of [-1, 1]) quad(geo, [side * W, 0, Z], [side * W, 0, end], [side * W, D, end], [side * W, D, Z], C.vestibule, 0, [-side, 0, 0]);
    const strips = 10;
    for (let i = 0; i < strips; i++) {
      const x0 = -W + 2 * W * i / strips, x1 = x0 + 2 * W / strips;
      quad(geo, [x0, 0, end], [x1, 0, end], [x1, D, end], [x0, D, end], i & 1 ? C.curtain : C.curtainB, 0, [0, 0, -1]);
    }
    return geo;
  });
  const vestibuleGlow = perRoom((id) => {
    const L = ROOMS.layout(id), geo = blank(), Z = L.doorZ, W = DOOR.halfW - 0.08, end = Z + DOOR.vestibule - 0.05;
    for (const side of [-1, 1]) quad(geo, [side * W - 0.02, 0.005, Z], [side * W + 0.02, 0.005, Z], [side * W + 0.02, 0.005, end], [side * W - 0.02, 0.005, end], C.ember, 0.6, UP);
    return noShadow(geo);
  });
  // A door leaf, `side` -1 or 1, centred on its own origin, in the room's `leaf` colour, its leading edge in its `seam`
  // colour so the seam shows as a line, on the face toward the room (-z).
  const leaf = (side, st) => {
    const W = DOOR.halfW, D = DOOR.height, geo = box({ w: W, h: D, d: 0.08, color: st.leaf, offset: { y: D / 2 } }), IN = [0, 0, -1], z = -0.046;
    const e = side < 0 ? W / 2 : -W / 2;
    quad(geo, [e - 0.015, 0, z], [e + 0.015, 0, z], [e + 0.015, D, z], [e - 0.015, D, z], st.seam, 0, IN);
    return geo;
  };
  // What a kind's `leafFace` draws with: the leaf's width `W` and height `D`, its `inner` (seam) and `outer` edges' x,
  // and flat marks a little proud of its face (each `lift` further): a rectangle, a diamond and a ring of `n` sides.
  const leafKit = (geo, side) => {
    const W = DOOR.halfW, IN = [0, 0, -1], z0 = -0.049, at = (lift) => z0 - (lift || 0) * 0.004;
    return {
      W, D: DOOR.height, side, inner: side < 0 ? W / 2 : -W / 2, outer: side < 0 ? -W / 2 : W / 2,
      rect: (x0, y0, x1, y1, color, emissive = 0, lift = 0) => quad(geo, [Math.min(x0, x1), y0, at(lift)], [Math.max(x0, x1), y0, at(lift)], [Math.max(x0, x1), y1, at(lift)], [Math.min(x0, x1), y1, at(lift)], color, emissive, IN),
      diamond: (x, y, r, color, emissive = 0, lift = 0) => face(geo, [[x, y - r, at(lift)], [x + r, y, at(lift)], [x, y + r, at(lift)], [x - r, y, at(lift)]], color, emissive, IN),
      ring: (x, y, r, w, color, emissive = 0, n = 16, lift = 0) => {
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU, b = (i + 1) / n * TAU, p = (k, rr) => [x + Math.cos(k) * rr, y + Math.sin(k) * rr, at(lift)];
          face(geo, [p(a, r - w), p(b, r - w), p(b, r), p(a, r)], color, emissive, IN);
        }
      },
      disc: (x, y, r, color, emissive = 0, n = 12, lift = 0) => {
        for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; face(geo, [[x, y, at(lift)], [x + Math.cos(a) * r, y + Math.sin(a) * r, at(lift)], [x + Math.cos(b) * r, y + Math.sin(b) * r, at(lift)]], color, emissive, IN); }
      },
      line: (x0, y0, x1, y1, w, color, emissive = 0, lift = 0) => {
        const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l * w / 2, ny = (x1 - x0) / l * w / 2;
        face(geo, [[x0 + nx, y0 + ny, at(lift)], [x1 + nx, y1 + ny, at(lift)], [x1 - nx, y1 - ny, at(lift)], [x0 - nx, y0 - ny, at(lift)]], color, emissive, IN);
      }
    };
  };
  // Where the doorway's parts stand in a room, for a kind's own trim: the bay's face `Z` (the room is toward -z), the
  // opening's half width `W` and height `D`, the frame `F`, the bay's half width `B` and height `H`, the EXIT header's
  // top `head`, and the Exit button (keep trim off it, and off the Conference Room's keypad).
  const doorway = (L) => ({ Z: L.doorZ, W: DOOR.halfW, D: DOOR.height, F: DOOR.frame, B: DOOR.bay, H: DOOR.casing, head: DOOR.height + DOOR.frame + EXIT_HEADER.h, button: L.exitButton });
  // A string of bulbs round the frame, up one side, across over the header and down the other, each a node of its own
  // (`doorBulb0`, …) for a kind to light in turn; how many it hung.
  const bulbGeos = new Map();
  const doorBulbs = (K, L, color, step = 0.42, r = 0.045) => {
    const d = doorway(L), x = d.W + d.F + 0.1, top = d.head + 0.1, z = d.Z - 0.15, key = `${color}|${r}`;
    if (!bulbGeos.has(key)) bulbGeos.set(key, noShadow(ballGeo(r, color, 8, 1)));
    const geo = bulbGeos.get(key), ys = [];
    for (let y = 0.3; y < top - step / 2; y += step) ys.push(y);
    let n = 0;
    for (const y of ys) K.node(`doorBulb${n++}`, geo, -x, y, z, { glow: true });
    for (let k = 0, m = Math.max(1, Math.round(2 * x / step)); k <= m; k++) K.node(`doorBulb${n++}`, geo, -x + 2 * x * k / m, top, z, { glow: true });
    for (let i = ys.length - 1; i >= 0; i--) K.node(`doorBulb${n++}`, geo, x, ys[i], z, { glow: true });
    return n;
  };
  // A builder run on its own, outside any room's plan: its parts merged into one geometry, for a viewer to show.
  const solo = (build) => {
    const into = { L: null, room: null, body: [], glow: [], flat: [], nodes: [], solids: [], seats: [], lights: [], live: [], geometries: [], targets: [] };
    build(kit(into));
    return merge(...into.body, ...into.flat, ...into.glow);
  };
  // A kind's bulbs, in order round the frame.
  const bulbsOf = (nodes) => { const list = []; for (let i = 0; nodes[`doorBulb${i}`]; i++) list.push(nodes[`doorBulb${i}`]); return list; };
  // The bay's low strip carried across a leaf as a chain of three hollow links, joined to its partner's across the
  // seam and running out to the frame: its own mesh, a child of the leaf, so Canvas 2D can sort it over the leaf.
  const leafChain = (side, geo = blank()) => {
    const W = DOOR.halfW, IN = [0, 0, -1], z = -0.045;
    const e = side < 0 ? W / 2 : -W / 2, at = (u) => e + side * u;
    const bar = (u0, u1, y0, y1) => quad(geo, [Math.min(at(u0), at(u1)), y0, z], [Math.max(at(u0), at(u1)), y0, z], [Math.max(at(u0), at(u1)), y1, z], [Math.min(at(u0), at(u1)), y1, z], C.amber, 0.9, IN);
    const LINK = 0.38, JOIN = 0.1, SIDE = 0.08, y0 = 0.845, y1 = 1.005, h0 = 0.895, h1 = 0.955;
    let u = JOIN / 2;
    bar(0, u, 0.9, 0.95);
    for (let k = 0; k < 3; k++) {
      bar(u, u + LINK, y0, h0); bar(u, u + LINK, h1, y1);
      bar(u, u + SIDE, h0, h1); bar(u + LINK - SIDE, u + LINK, h0, h1);
      u += LINK;
      bar(u, k < 2 ? u + JOIN : W, 0.9, 0.95);
      u += JOIN;
    }
    return noShadow(geo);
  };
  const leaves = perRoom((id) => { const st = doorStyle(id); return [leaf(-1, st), leaf(1, st)]; });
  // Each leaf's marks, a mesh of their own (a child of the leaf, so Canvas 2D sorts them over it): the Sphere's chain
  // where the room keeps it, and the room's own face.
  const marks = perRoom((id) => {
    const st = doorStyle(id);
    return [-1, 1].map((side) => {
      const geo = blank();
      if (st.chain) leafChain(side, geo);
      if (st.leafFace) st.leafFace(side, leafKit(geo, side));
      return geo.faces.length ? noShadow(geo) : null;
    });
  });
  // The Exit button's plate, its amber face and the play mark on it, facing -z and pointing right as seen from the room.
  const button = perRoom((id) => {
    const st = doorStyle(id), geo = merge(box({ w: 0.38, h: 0.38, d: 0.06, color: st.plate }), box({ w: 0.28, h: 0.28, d: 0.02, color: st.face, emissive: 0.85, offset: { z: -0.035 } }));
    const base = geo.verts.length / 3;
    geo.verts.push(0.06, 0.08, -0.047, 0.06, -0.08, -0.047, -0.08, 0, -0.047);
    geo.faces.push({ i: [base, base + 1, base + 2], color: hexToRgb(st.mark), emissive: 0 });
    return geo;
  });
  // A word in the jumbotron's letters, lit, facing into the room (-z).
  const litWord = (word, px, color, emissive, z = 0) => {
    const T = BL.jumbotron.text, geo = blank(), IN = [0, 0, -1];
    const cols = word.length * (T.GLYPH_W + T.TRACKING) - T.TRACKING;
    // Seen from the room the word reads toward -x.
    const x = (col) => (cols / 2 - col) * px, y = (row) => (T.GLYPH_H / 2 - row) * px;
    for (let row = 0; row < T.GLYPH_H; row++) {
      const lit = [];
      [...word].forEach((ch, i) => { const bits = T.glyphOf(ch)[row]; for (let c = 0; c < T.GLYPH_W; c++) if (bits >> (T.GLYPH_W - 1 - c) & 1) lit[i * (T.GLYPH_W + T.TRACKING) + c] = true; });
      for (let c = 0; c < cols; c++) {
        if (!lit[c]) continue;
        let e = c;
        while (lit[e + 1]) e++;
        quad(geo, [x(e + 1), y(row + 1), z], [x(c), y(row + 1), z], [x(c), y(row), z], [x(e + 1), y(row), z], color, emissive, IN);
        c = e;
      }
    }
    return noShadow(geo);
  };
  const exitWord = perRoom((id) => litWord("EXIT", 0.036, doorStyle(id).word, 0.9));
  // Across the doors while the room is locked: ROOM LOCKED in red between two padlocks.
  const LOCK_RED = "#ff3b30", PADLOCK = [".###.", "#...#", "#...#", "#####", "##.##", "#####"];
  const lockedSign = own(() => {
    const px = 0.036, z = -0.012, IN = [0, 0, -1], locks = blank();
    for (const side of [-1, 1]) PADLOCK.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === "#") {
      const x = side * 1.34 + (2.5 - c) * px, y = (3 - r) * px;
      quad(locks, [x - px, y - px, z], [x, y - px, z], [x, y, z], [x - px, y, z], LOCK_RED, 1, IN);
    } });
    return noShadow(merge(box({ w: 3.1, h: 0.56, d: 0.02, color: "#2a0806", emissive: 0.3 }), litWord("ROOM LOCKED", px, LOCK_RED, 1, z), locks));
  });
  // How far Canvas 2D's depth sort pulls a mark in front of the face it lies on (the door's chain, EXIT), and a live
  // picture in front of the dome's faces round it.
  const MARK_BIAS = -0.3, PATCH_BIAS = -1.5;

  // ---------- a room's plan, and a visit's nodes ----------
  // Everything a kind declares for its room, built once per room: its static meshes merged, its nodes, solids, seats,
  // lights and live pictures, and the paint for its dome and floor.
  const plan = perRoom((id) => {
    const room = ROOMS.get(id), L = ROOMS.layout(id), kind = KINDS[room.kind];
    if (!kind) throw new Error(`No Timechain room kind ${room.kind}`);
    const into = { L, room, body: [], glow: [], flat: [], nodes: [], solids: [], seats: [], lights: [], live: [], geometries: [], targets: [], domePaint: null, floorPaint: null };
    kind.plan(kit(into), L, room);
    into.bodyGeo = into.body.length ? merge(...into.body) : null;
    into.glowGeo = into.glow.length ? noShadow(merge(...into.glow)) : null;
    into.flatGeo = into.flat.length ? noShadow(merge(...into.flat)) : null;
    into.body = into.glow = into.flat = null;
    // The bay and the doorway stand in the way of nothing the walls do not already; a seat's chair is the kind's.
    return into;
  });
  // A live picture's patch of the dome, a little inside it: from `az0` to `az1` and `el0` to `el1` (degrees), mapped
  // round its curve like the dome's own canvas, or a cap over the crown (`cap`, flat seen from below).
  const patchGeometry = (L, spec, canvas) => {
    const geo = blank(), inset = spec.inset || 0.994;
    if (spec.cap) {
      // The cap from `el0` to the crown, seen from below with its top toward the door: a flat mapping of x and z.
      const rr = L.R * inset * Math.cos(spec.el0 * DEG), rows = 6, cols = 48;
      for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
        const e0 = spec.el0 + (90 - spec.el0) * i / rows, e1 = spec.el0 + (90 - spec.el0) * (i + 1) / rows, b0 = TAU * k / cols, b1 = TAU * (k + 1) / cols;
        const p = (az, el) => { const q = ROOMS.onSphere(L, az, el * DEG, inset); return [q.x, q.z, -(q.y - L.c)]; };
        const pts = [p(b0, e0), p(b1, e0), p(b1, e1), p(b0, e1)];
        face(geo, pts, [255, 255, 255], 0.9, [0, 0, 1]);
      }
      geo.imageSurface = { canvas, version: 0, rect: [-rr, -rr, 2 * rr, 2 * rr], tessellated: true };
      geo.castShadow = false;
      geo.cap = true;
      return geo;
    }
    // Built centred on the front (its holder turns it round to where it hangs), so none crosses the curve's seam.
    const half = (spec.az1 - spec.az0) / 2 * DEG, a0 = -half, a1 = half, cols = Math.max(4, Math.ceil((spec.az1 - spec.az0) / 3)), rows = Math.max(2, Math.ceil((spec.el1 - spec.el0) / 3));
    let yLow = Infinity, yHigh = -Infinity;
    for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
      const b0 = a0 + (a1 - a0) * k / cols, b1 = a0 + (a1 - a0) * (k + 1) / cols, e0 = (spec.el0 + (spec.el1 - spec.el0) * i / rows) * DEG, e1 = (spec.el0 + (spec.el1 - spec.el0) * (i + 1) / rows) * DEG;
      const p = (az, el) => { const q = ROOMS.onSphere(L, az, el, inset); yLow = Math.min(yLow, q.y); yHigh = Math.max(yHigh, q.y); return [q.x, q.y, q.z + 1]; };
      const pts = [p(b0, e0), p(b1, e0), p(b1, e1), p(b0, e1)];
      face(geo, pts, [255, 255, 255], 0.9, [-pts[0][0], -(pts[0][1] - L.c), -(pts[0][2] - 1)]);
    }
    geo.imageSurface = { canvas, version: 0, rect: [a0, yLow, a1 - a0, yHigh - yLow], curve: [1, 0, 0], tessellated: true };
    geo.castShadow = false;
    return geo;
  };
  // The nodes that carry a live picture: a curved patch stood back a metre in a holder turned to its azimuth, a cap
  // turned flat over the crown, a flat picture where its spec stands it. The scene hangs the picture on `node`.
  const patchNodes = (L, spec) => {
    if (spec.flat) {
      const f = spec.flat, node = createNode({ position: { x: f.x, y: f.y, z: f.z }, rotation: { x: f.rx || 0, y: f.ry || 0, z: 0 } });
      return { holder: node, node };
    }
    // On the dome a picture lies just inside faces far bigger than its own, so Canvas 2D's depth sort, face by face,
    // would put the dome in front of parts of it: it is pulled forward past them.
    if (spec.cap) {
      const node = createNode({ rotation: { x: Math.PI / 2, y: 0, z: 0 }, position: { x: 0, y: L.c, z: 0 }, depthBias: PATCH_BIAS });
      return { holder: node, node };
    }
    const holder = createNode({ rotation: { x: 0, y: -(spec.az0 + spec.az1) / 2 * DEG, z: 0 } }), node = createNode({ position: { x: 0, y: 0, z: -1 }, depthBias: PATCH_BIAS });
    addChild(holder, node);
    return { holder, node };
  };
  // A live picture's geometry for this visit's canvas.
  const liveGeometry = (L, spec, canvas) => spec.flat ? flatPicture(canvas, spec.flat.w, spec.flat.h) : patchGeometry(L, spec, canvas);

  // One visit's nodes for room `id`. The live pictures come with their nodes and blank canvases: the scene paints them.
  const build = (id) => {
    const L = ROOMS.layout(id), into = plan(id), root = createNode(), parts = sphereParts(id);
    const dome = domeGeometry(id), floor = floorGeometry(id), rake = rakeGeometry(id), cap = L.c;
    addChild(root, createNode({ geometry: parts.wall }), createNode({ geometry: parts.glow, sightHidden: true }));
    const domeNode = dome ? createNode({ geometry: dome, position: { x: 0, y: 0, z: -1 } }) : null;
    if (domeNode) addChild(root, domeNode);
    const floorNode = floor ? createNode({ geometry: floor, position: { x: 0, y: L.yMin + 0.002, z: 0 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 } }) : null;
    if (floorNode) addChild(root, floorNode);
    if (rake) addChild(root, createNode({ geometry: rake.body }), createNode({ geometry: rake.glow, sightHidden: true }));
    addChild(root, createNode({ geometry: bay(id) }), createNode({ geometry: vestibule(id) }), createNode({ geometry: vestibuleGlow(id), sightHidden: true }));
    const doors = [-1, 1].map((side) => createNode({ geometry: leaves(id)[side < 0 ? 0 : 1], position: { x: side * DOOR.halfW / 2, y: 0, z: L.doorZ + 0.06 } }));
    doors.forEach((door, i) => { const m = marks(id)[i]; if (m) addChild(door, createNode({ geometry: m, depthBias: MARK_BIAS })); });
    addChild(root, ...doors);
    const E = L.exitButton;
    const exitButton = createNode({ geometry: button(id), position: { x: E.x, y: E.y, z: E.z } });
    const exitSign = createNode({ geometry: exitWord(id), depthBias: MARK_BIAS, position: { x: 0, y: DOOR.height + DOOR.frame + EXIT_HEADER.h / 2, z: L.doorZ - EXIT_HEADER.d + 0.016 } });
    addChild(root, exitButton, exitSign);
    // The Conference Room's lock: its keypad faces into the room, and the sign across the doors hangs there only while
    // it is locked. No other room has one.
    let lockPad = null, lockSign = null;
    if (L.lockPad) {
      lockPad = BL.timechainModels.padRig();
      lockSign = createNode({ geometry: lockedSign(), depthBias: MARK_BIAS, position: { x: 0, y: L.lockSign.y, z: L.lockSign.z }, visible: false, sightHidden: true });
      lockPad.pad.position.x = L.lockPad.x; lockPad.pad.position.y = L.lockPad.y; lockPad.pad.position.z = L.lockPad.z;
      lockPad.pad.rotation.y = Math.PI;
      addChild(root, lockPad.pad, lockSign);
    }
    // The kind's own place: its static meshes, then its nodes by name.
    const body = into.bodyGeo ? createNode({ geometry: into.bodyGeo }) : null;
    if (body) addChild(root, body);
    if (into.flatGeo) addChild(root, createNode({ geometry: into.flatGeo, sightHidden: true }));
    if (into.glowGeo) addChild(root, createNode({ geometry: into.glowGeo, sightHidden: true }));
    const nodes = {}, targets = [];
    for (const spec of into.nodes) {
      const node = createNode({ geometry: spec.geometry, position: { x: spec.x, y: spec.y, z: spec.z }, rotation: { x: spec.rx, y: spec.ry, z: spec.rz }, scale: { x: spec.scale, y: spec.scale, z: spec.scale }, sightHidden: spec.sightHidden, depthBias: spec.depthBias || 0 });
      // A stand-in a click is tested against, never drawn.
      if (spec.proxy) { node.visible = false; node.pickProxy = true; }
      addChild(spec.parent && nodes[spec.parent] ? nodes[spec.parent] : root, node);
      if (spec.name) nodes[spec.name] = node;
      if (spec.target) targets.push({ node, ...spec.target });
    }
    // The live pictures on the dome, blank until the scene paints them.
    const live = into.live.map((spec) => {
      const { holder, node } = patchNodes(L, spec);
      addChild(root, holder);
      return { spec, node };
    });
    const lights = [...into.lights];
    // The doorway's own light, and a dim one in the vestibule.
    lights.push([0, 2.6, L.doorZ - 1.6, 6, 0.7, 0.46, 0.2], [0, DOOR.height - 0.4, L.doorZ + DOOR.vestibule * 0.5, 3.2, 0.32, 0.2, 0.08]);
    return { root, layout: L, room: into.room, body, dome: domeNode, floor: floorNode, doors, exitButton, exitSign, lockPad, lockSign, lights, nodes, targets, live, seats: into.seats.map((s) => ({ ...s, sitter: null })), solids: into.solids, render: into.render || null, crown: cap };
  };
  // A room's construction as steps, each a slice of a frame at the doorway: a kind may split its own costly parts
  // (`steps`, run before its plan, each building something its plan then reads from a cache).
  const prepareSteps = (id) => {
    const kind = KINDS[ROOMS.get(id).kind];
    return [...(kind.steps ? kind.steps(ROOMS.layout(id)) : []), () => plan(id), () => sphereParts(id), () => paintDome(id), () => domeGeometry(id), () => paintFloor(id), () => floorGeometry(id), () => rakeGeometry(id), () => bay(id), () => marks(id)];
  };
  // Every static geometry a room draws, for the scene's live set and for releasing a preview.
  const geometries = (id) => {
    const into = plan(id), parts = sphereParts(id), rake = rakeGeometry(id), list = [parts.wall, parts.glow, bay(id), vestibule(id), vestibuleGlow(id), ...leaves(id), ...marks(id).filter(Boolean), button(id), exitWord(id), lockedSign()];
    const dome = domeGeometry(id), floor = floorGeometry(id);
    if (dome) list.push(dome);
    if (floor) list.push(floor);
    if (rake) list.push(rake.body, rake.glow);
    for (const g of [into.bodyGeo, into.glowGeo, into.flatGeo]) if (g) list.push(g);
    for (const g of into.geometries) list.push(g);
    return list;
  };
  // Wall displays wrap a canvas round the dome; doorway pictures remain flat.
  const picture = (image, width, height, w, h) => {
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width, height, load: () => image }, rect: [-w / 2, -h / 2, w, h] };
    return geo;
  };
  BL.timechainRoomModels = {
    build, plan, prepareSteps, geometries, picture, liveGeometry, flatPicture, sphere: sphereParts, domeMap, floorMap, paintKit, KINDS, COLORS: C, MARK_BIAS, EXIT_HEADER,
    doorway, doorBulbs, bulbsOf, solo,
    helpers: { face, quad, blank, clip, own, perRoom, cylinder, ballGeo, slabGeo, sectorGeo, litWord, UP, DOWN }
  };
})();
