// Room 9, the Movie Theater: the largest sphere, its raked rows of recliners stepping down toward the front, and the
// whole dome the picture. The mock-up rendered a film into a cube map from the sweet spot in the middle of the hall
// and drew the dome by direction from there; the engine paints a still of that film instead, projected from the same
// spot so it reads true from the best seats: deep space with its stars and three nebula glows, a ringed planet off to
// the right, THE TIMECHAIN over the front and the chain of blocks receding under it into the distance. Over the title
// and the chain a live picture repaints the same scene at a finer grain whenever a block arrives: the count under the
// title, and the latest fifteen blocks' heights and pools on the cubes, newest nearest (timechain-blocks.js). A
// popcorn cart stands on the landing. Walkers pass through the rows; the aisle's half steps are the shell's.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { box, merge, moved, turnedX } = BL.models;
  const { own } = RM.helpers;
  const P = RM.paintKit, DEG = ROOMS.DEG;
  const C = {
    base: "#1f1c19", cushion: "#2d2824", arm: "#1b1815", amber: "#f7931a", amberText: "#ffb04d", white: "#f4efe6", face: "#17120d",
    link: "#c8730f", sub: "#cfd6e8", cream: "#f4efe6", band: "#17110a", kernel: "#f6d77a", wheel: "#15120f", post: "#2a2420"
  };
  // Standing up leaves the sitter in the leg room in front of the recliner, still on its own row.
  const FRONT = -0.5;
  // A recliner, its back toward +z so the sitter faces -z, amber along both arms (the mock-up's `recliner`).
  const recliner = own(() => merge(
    box({ w: 0.9, h: 0.28, d: 0.8, color: C.base, offset: { y: 0.14 } }),
    box({ w: 0.86, h: 0.14, d: 0.76, color: C.cushion, offset: { y: 0.35 } }),
    moved(turnedX(box({ w: 0.86, h: 0.74, d: 0.16, color: C.cushion }), 0.32), 0, 0.72, 0.4),
    ...[-1, 1].map((side) => box({ w: 0.12, h: 0.3, d: 0.8, color: C.arm, offset: { x: side * 0.49, y: 0.43 } })),
    ...[-1, 1].map((side) => box({ w: 0.12, h: 0.025, d: 0.78, color: C.amber, emissive: 0.12, offset: { x: side * 0.49, y: 0.59 } }))
  ));

  // The film's scene, in its own units with the eye at the origin, -z toward the front and +x to the right: stars all
  // round, three glows, the planet and its ring, the title, and fifteen blocks along a winding path toward the eye.
  const GLOWS = [[-160, 90, -300, 360, "rgba(110,60,160,.55)"], [200, -40, -260, 300, "rgba(40,90,170,.45)"], [0, 160, 120, 380, "rgba(247,147,26,.18)"]];
  const PLANET = { x: 215, y: 38, z: -250, r: 40, ring: [52, 74], tilt: 0.35 };
  // The title's plane: 120 units wide at 2048 canvas pixels to the width, as the mock-up's, its letters `glyph` tall.
  const TITLE = { y: 40, z: -150, w: 120, glyph: 150 };
  // The chain winds wider than the mock-up's, whose motion showed its depth: a still needs the blocks spread across
  // the view, the nearest big on the left and the rest falling away toward the middle.
  const CHAIN = { count: 15, near: -40, gap: 20, size: 6 };
  const pathX = (z) => -16 * Math.sin(z * 0.012 + 1.6), pathY = (z) => 3 + 4 * Math.sin(z * 0.009 + 0.5);
  // The live picture: over the title and the chain, at about two and a half times the dome's own grain.
  const FILM = { az0: -40, az1: 34, el0: -3, el1: 28, w: 2048 };
  // The ₿ in pixels, on the blocks' faces until mempool.space names them.
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];

  // Where the film's directions land on the dome: from the sweet spot (the mock-up's eye, over the middle row's seats)
  // along each direction to the sphere, then that point's azimuth and elevation from the sphere's centre. A surface `M`
  // (the dome's canvas or the live picture's) turns those degrees into its own pixels.
  const projector = (L) => {
    const K = L.rake, mid = K.rows[Math.floor(K.rows.length / 2)], ey = mid.y + K.seatTop + 0.55 - L.c, ez = K.F + mid.d, R = L.R;
    const at = { az: 0, el: 0 };
    const dome = (x, y, z) => {
      const n = Math.hypot(x, y, z), dx = x / n, dy = y / n, dz = z / n, b = ey * dy + ez * dz;
      const t = -b + Math.sqrt(b * b - (ey * ey + ez * ez - R * R)), py = ey + t * dy;
      at.az = Math.atan2(t * dx, -(ez + t * dz)) / DEG; at.el = Math.asin(Math.max(-1, Math.min(1, py / R))) / DEG;
      return at;
    };
    const point = (M, x, y, z) => { dome(x, y, z); return [M.x(at.az), M.y(at.el)]; };
    // A frame at a direction: pixels per degree to its right and downward, for drawing round things in degrees. Steps
    // in azimuth are taken the short way round, so a frame behind the door does not reach across the whole canvas.
    const frame = (M, x, y, z) => {
      const n = Math.hypot(x, y, z), dx = x / n, dy = y / n, dz = z / n, h = Math.hypot(dx, dz), rx = -dz / h, rz = dx / h;
      const ux = -dy * rz, uy = rz * dx - rx * dz, uz = dy * rx, t = Math.tan(DEG), turn = (v) => v - 360 * Math.round(v / 360);
      dome(dx, dy, dz);
      const oa = at.az, ox = M.x(at.az), oy = M.y(at.el);
      dome(dx + rx * t, dy, dz + rz * t);
      const ax = turn(at.az - oa) * M.perAz, ay = M.y(at.el) - oy;
      dome(dx - ux * t, dy - uy * t, dz - uz * t);
      return [ax, ay, turn(at.az - oa) * M.perAz, M.y(at.el) - oy, ox, oy];
    };
    return { dome, point, frame, at };
  };

  // The film painted onto a surface `M` ({ x(az), y(el), W, H, wrap, perAz: pixels per degree round, k: pixels per dome
  // pixel }), with the latest blocks when there are any. The dome and the live picture paint the very same scene, so
  // one lies over the other without a seam.
  const paintFilm = (ctx, M, J, blocks) => {
    const W = M.W, H = M.H, shifts = M.wrap ? [-W, 0, W] : [0];
    const sky = ctx.createLinearGradient(0, M.y(90), 0, M.y(-16)), stop = (el) => (M.y(el) - M.y(90)) / (M.y(-16) - M.y(90));
    sky.addColorStop(0, "#020309"); sky.addColorStop(stop(20), "#03050c"); sky.addColorStop(1, "#080a14");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // The stars, everywhere round.
    const r = P.rng(404);
    for (let i = 0; i < 3600; i++) {
      let x, y, z, l;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; l = Math.hypot(x, y, z); } while (l > 1 || l < 0.1);
      const s = (r() < 0.06 ? 2.4 : 1 + r() * 0.8) * M.k, alpha = 0.3 + r() * 0.65, warm = r() < 0.15;
      const p = J.point(M, x, y, z);
      if (p[1] < -4 || p[1] > H + 4) continue;
      // Round on the dome: the canvas's columns crowd together toward the crown and its rows spread apart there, so
      // a star is drawn wider and shorter the higher it stands, and fades out near the crown, where the dome's texture
      // is sampled too coarsely along the meridian to keep a star round.
      const cos = Math.max(0.02, Math.cos(J.at.el * DEG)), w = Math.min(s / cos, 24 * M.k), h = s * cos;
      const fade = Math.min(1, Math.max(0, (86 - J.at.el) / 22));
      if (!fade) continue;
      ctx.fillStyle = warm ? `rgba(255,226,190,${alpha * fade})` : `rgba(223,230,255,${alpha * fade})`;
      for (const dx of shifts) if (p[0] + dx > -w && p[0] + dx < W + w) ctx.fillRect(p[0] + dx - w / 2, p[1] - h / 2, w, h);
    }
    // The glows, added over the stars.
    ctx.globalCompositeOperation = "lighter";
    for (const [x, y, z, size, color] of GLOWS) {
      const f = J.frame(M, x, y, z), rho = Math.atan(size / 2 / Math.hypot(x, y, z)) / DEG;
      for (const dx of shifts) {
        ctx.setTransform(f[0], f[1], f[2], f[3], f[4] + dx, f[5]);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rho);
        g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rho, 0, P.TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    // The planet in its bands, half its ring behind it and half in front, tipped by its tilt.
    const pl = PLANET, pd = Math.hypot(pl.x, pl.y, pl.z), pr = Math.asin(pl.r / pd) / DEG, f = J.frame(M, pl.x, pl.y, pl.z);
    const ring = (front) => {
      for (const [a, b, alpha] of [[pl.ring[0], pl.ring[0] + 7, 0.5], [pl.ring[0] + 9, pl.ring[1] - 6, 0.42], [pl.ring[1] - 5, pl.ring[1], 0.3]]) {
        const ra = Math.atan(a / pd) / DEG, rb = Math.atan(b / pd) / DEG;
        ctx.fillStyle = `rgba(185,138,80,${alpha})`;
        ctx.beginPath(); ctx.ellipse(0, 0, rb, rb * 0.3, 0, front ? Math.PI : 0, front ? P.TAU : Math.PI); ctx.ellipse(0, 0, ra, ra * 0.3, 0, front ? P.TAU : Math.PI, front ? Math.PI : 0, true); ctx.fill();
      }
    };
    ctx.setTransform(f[0], f[1], f[2], f[3], f[4], f[5]); ctx.rotate(-pl.tilt);
    ring(false);
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, pr, 0, P.TAU); ctx.clip();
    const strips = 96;
    for (let i = 0; i < strips; i++) {
      const y0 = -pr + 2 * pr * i / strips, t = (90 - Math.asin(Math.max(-1, Math.min(1, -(y0 + pr / strips) / pr))) / DEG) / 180;
      const v = 0.55 + 0.25 * Math.sin(t * 30) + 0.12 * Math.sin(t * 77);
      ctx.fillStyle = `rgb(${Math.round(230 * v + 20)},${Math.round(120 * v + 10)},${Math.round(30 * v)})`;
      ctx.fillRect(-pr, y0, 2 * pr, 2 * pr / strips + 0.02);
    }
    const shade = ctx.createRadialGradient(-pr * 0.3, -pr * 0.3, pr * 0.2, 0, 0, pr);
    shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(0.75, "rgba(0,0,0,.18)"); shade.addColorStop(1, "rgba(0,0,0,.6)");
    ctx.fillStyle = shade; ctx.fillRect(-pr, -pr, 2 * pr, 2 * pr);
    ctx.restore();
    ring(true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The chain and the title, farthest first.
    const items = [{ d: Math.hypot(TITLE.y, TITLE.z), title: true }];
    for (let k = 0; k < CHAIN.count; k++) {
      const z = CHAIN.near - k * CHAIN.gap, x = pathX(z), y = pathY(z);
      items.push({ d: Math.hypot(x, y, z), k, x, y, z });
    }
    items.sort((a, b) => b.d - a.d);
    // The links first, so they show only between the blocks they join and never across a block's label.
    for (const it of items) if (!it.title && it.k + 1 < CHAIN.count) link(ctx, M, J, it);
    for (const it of items) {
      if (it.title) titleLayer(ctx, M, J, blocks);
      else block(ctx, M, J, it, blocks && blocks[it.k]);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  // The link from a block back to the one behind it, a thin amber bar between their faces.
  const link = (ctx, M, J, it) => {
    const z = it.z - CHAIN.gap, x = pathX(z), y = pathY(z), dx = x - it.x, dy = y - it.y, dz = z - it.z, len = Math.hypot(dx, dy, dz), h = CHAIN.size / 2 / len;
    const a = J.point(M, it.x + dx * h, it.y + dy * h, it.z + dz * h), b = J.point(M, x - dx * h, y - dy * h, z - dz * h), f = J.frame(M, it.x, it.y, it.z);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = C.link; ctx.lineWidth = Math.max(1, Math.hypot(f[0], f[1]) * 0.35 / it.d / DEG);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  };
  // A block: a dark cube turned a little as the path winds, its edges amber and its near face labelled.
  const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const FACES = [{ n: [0, 0, 1], v: [4, 5, 6, 7] }, { n: [0, 0, -1], v: [1, 0, 3, 2] }, { n: [1, 0, 0], v: [5, 1, 2, 6] }, { n: [-1, 0, 0], v: [0, 4, 7, 3] }, { n: [0, 1, 0], v: [7, 6, 2, 3] }, { n: [0, -1, 0], v: [0, 1, 5, 4] }];
  const block = (ctx, M, J, it, b) => {
    const ry = Math.sin(it.z * 0.02) * 0.25, c = Math.cos(ry), s = Math.sin(ry), h = CHAIN.size / 2;
    const world = CUBE.map(([x, y, z]) => [it.x + (x * c + z * s) * h, it.y + y * h, it.z + (-x * s + z * c) * h]);
    const px = world.map((p) => J.point(M, p[0], p[1], p[2]));
    const f = J.frame(M, it.x, it.y, it.z), line = Math.max(1, Math.hypot(f[0], f[1]) * 0.18 / it.d / DEG);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const F of FACES) {
      const nx = F.n[0] * c + F.n[2] * s, ny = F.n[1], nz = -F.n[0] * s + F.n[2] * c;
      const q = world[F.v[0]], back = nx * q[0] + ny * q[1] + nz * q[2];
      if (back >= 0) continue;
      ctx.beginPath();
      F.v.forEach((v, i) => (i ? ctx.lineTo(px[v][0], px[v][1]) : ctx.moveTo(px[v][0], px[v][1])));
      ctx.closePath();
      ctx.fillStyle = F.n[2] > 0 ? C.face : F.n[1] !== 0 ? "#120e0a" : "#1b150f"; ctx.fill();
      ctx.strokeStyle = C.amber; ctx.lineWidth = line; ctx.lineJoin = "round"; ctx.stroke();
      if (F.n[2] > 0) {
        // The near face's label, laid on it as a 256-pixel square from three of its corners.
        const tl = px[7], tr = px[6], bl = px[4];
        ctx.save();
        ctx.setTransform((tr[0] - tl[0]) / 256, (tr[1] - tl[1]) / 256, (bl[0] - tl[0]) / 256, (bl[1] - tl[1]) / 256, tl[0], tl[1]);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 6; ctx.strokeRect(18, 18, 220, 220);
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        if (b) {
          ctx.fillStyle = C.white; P.fit(ctx, CH.format.group(b.height), 220, 600, 46, P.MONO); ctx.fillText(CH.format.group(b.height), 128, 124);
          ctx.fillStyle = C.amberText; P.fit(ctx, b.pool, 210, 500, 30); ctx.fillText(b.pool, 128, 176);
        } else {
          ctx.fillStyle = C.amber;
          BITCOIN.forEach((row, j) => { for (let i = 0; i < 11; i++) if (row[i] === "1") ctx.fillRect(84 + i * 8, 80 + j * 8, 8, 8); });
        }
        ctx.restore();
      }
    }
  };
  // THE TIMECHAIN in the island's pixel letters, every lit pixel projected on its own so the words keep their line
  // across the curve, and under it how many blocks there are.
  const titleLayer = (ctx, M, J, blocks) => {
    const T = BL.jumbotron.text, words = "THE TIMECHAIN", cell = TITLE.glyph / T.GLYPH_H, unit = TITLE.w / 2048, width = T.measureText(words, cell);
    const left = 1024 - width / 2, top = 270 - TITLE.glyph, plane = (cx, cy) => [(cx - 1024) * unit, TITLE.y + (256 - cy) * unit, TITLE.z];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.amberText;
    [...words].forEach((ch, n) => {
      const rows = T.glyphOf(ch), x0 = left + n * (T.GLYPH_W + T.TRACKING) * cell;
      for (let row = 0; row < T.GLYPH_H; row++) for (let col = 0; col < T.GLYPH_W; col++) {
        if (!(rows[row] >> (T.GLYPH_W - 1 - col) & 1)) continue;
        const cx = x0 + col * cell - 0.6, cy = top + row * cell - 0.6, e = cell + 1.2;
        const q = [plane(cx, cy), plane(cx + e, cy), plane(cx + e, cy + e), plane(cx, cy + e)].map((p) => J.point(M, p[0], p[1], p[2]));
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.lineTo(q[3][0], q[3][1]); ctx.fill();
      }
    });
    const line = blocks && blocks.length ? `${CH.format.group(blocks[0].height + 1)} blocks and counting` : "Block by block, and counting";
    const o = plane(1024, 376), f = J.frame(M, o[0], o[1], o[2]), d = Math.hypot(o[0], o[1], o[2]), k = unit / d / DEG;
    ctx.setTransform(f[0] * k, f[1] * k, f[2] * k, f[3] * k, f[4], f[5]);
    ctx.fillStyle = C.sub; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = P.font(500, 70);
    ctx.fillText(line, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  // The live picture's own surface: columns even in azimuth, rows even in height on the patch's slightly smaller sphere.
  const filmSurface = (L, spec) => {
    const Ri = L.R * 0.994, hi = L.c + Ri * Math.sin(spec.el1 * DEG), lo = L.c + Ri * Math.sin(spec.el0 * DEG);
    const perAz = spec.w / (spec.az1 - spec.az0);
    return { W: spec.w, H: spec.h, wrap: false, perAz, k: perAz * 360 / RM.domeMap(L).W,
      x: (az) => (az - spec.az0) / (spec.az1 - spec.az0) * spec.w, y: (el) => (hi - (L.c + Ri * Math.sin(el * DEG))) / (hi - lo) * spec.h };
  };
  const filmKey = (reader) => {
    const blocks = reader.value("recent");
    return blocks && blocks.length ? `live|${blocks[0].id}` : `still|${reader.status("recent")}`;
  };

  // The popcorn cart: a striped cart on wheels, POPCORN on a dark band, a glass case of popcorn under a lit canopy
  // whose bulbs chase (`animate`).
  const cart = (K, x, z, heading) => {
    const g = K.group(x, 0, z, heading);
    for (const side of [-1, 1]) g.cyl(0.15, 0.15, 0.07, C.wheel, side * 0.47, 0.15, 0.16, { rz: Math.PI / 2, seg: 14 });
    g.cyl(0.05, 0.05, 0.2, C.post, 0, 0.1, -0.22, { seg: 8 });
    g.box(1.0, 0.8, 0.6, C.amber, 0, 0.5, 0);
    for (const face of [-1, 1]) for (let i = 0; i < 4; i++) g.box(0.125, 0.8, 0.01, C.cream, -0.4375 + i * 0.25 + 0.0625, 0.5, face * 0.305);
    for (const side of [-1, 1]) for (const k of [-1, 1]) g.box(0.01, 0.8, 0.12, C.cream, side * 0.505, 0.5, k * 0.15);
    g.box(1.03, 0.2, 0.63, C.band, 0, 0.5, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(0.035, 0.5, 0.035, C.post, sx * 0.44, 1.15, sz * 0.24);
    g.box(0.8, 0.22, 0.42, C.kernel, 0, 1.01, 0);
    g.lathe([[0, 0], [0.34, 0], [0.22, 0.1], [0, 0.14]], C.kernel, 0, 1.12, 0, { seg: 10 });
    const pop = P.rng(9);
    for (let i = 0; i < 9; i++) g.ball(0.035 + pop() * 0.02, i & 1 ? C.cream : C.kernel, (pop() - 0.5) * 0.5, 1.16 + pop() * 0.08, (pop() - 0.5) * 0.24, { seg: 6 });
    g.box(0.98, 0.05, 0.56, "#9c1f12", 0, 1.425, 0);
    g.box(0.98, 0.08, 0.02, C.amber, 0, 1.39, -0.285, { emissive: 0.3 });
    const label = g.group(0, 0, 0, Math.PI).picture(0.9, 0.18, 256, 52, (ctx, w, h) => {
      ctx.fillStyle = C.band; ctx.fillRect(0, 0, w, h); P.pix(ctx, "POPCORN", w / 2, h / 2, h * 0.62, C.amberText);
    }, 0, 0.5, 0.318, { emissive: 0.8, depthBias: RM.MARK_BIAS });
    K.target(label, "popcorn", "Popcorn cart", 0.9, { data: { say: "Fresh popcorn · the show is on the whole dome" } });
    for (let i = 0; i < 2; i++) g.node(`bulbs${i}`, (k) => { for (let n = i; n < 8; n += 2) k.ball(0.022, C.amberText, -0.42 + n * 0.12, 1.35, -0.3, { emissive: 1, seg: 6 }); }, 0, 0, 0, { glow: true });
    g.solid({ x: 0, z: 0, hx: 0.56, hz: 0.38 });
    g.light(0, 1.2, -0.6, 3.2, 0.9, 0.62, 0.3);
  };

  // ---------- its door ----------
  // A cinema's: red velvet leaves buttoned with brass studs, a round porthole each and a brass push plate, in a brass
  // frame on deep red, marquee bulbs round it chasing.
  const door = {
    casing: "#2a0d10", frame: "#b08a3a", header: "#1a0608", word: "#ff3b30", strip: null, chain: false,
    leaf: "#7a0f18", seam: "#3a050a", plate: "#1a0608", face: "#ff3b30", mark: "#1a0608",
    leafFace(side, H) {
      for (let row = 0; row < 11; row++) for (let col = 0; col < 5; col++) {
        const x = -0.6 + col * 0.3 + (row & 1 ? 0.15 : 0), y = 0.35 + row * 0.27;
        if (x < 0.72 && Math.hypot(x, y - 2.3) > 0.32) H.diamond(x, y, 0.022, "#d4a63a", 0.25, 1);
      }
      H.disc(0, 2.3, 0.19, "#140306", 0.35, 16, 1);
      H.ring(0, 2.3, 0.23, 0.045, "#d4a63a", 0.25, 16, 2);
      H.rect(H.inner + side * 0.06, 1.0, H.inner + side * 0.2, 1.45, "#d4a63a", 0.3, 2);
    }
  };
  const doorTrim = (K, L) => { RM.doorBulbs(K, L, "#ffe7a8", 0.32); };

  const plan = (K, L) => {
    doorTrim(K, L);
    const R = L.rake, J = projector(L);
    K.wallColor("#141316");
    K.rakeColors({ terrace: ["#1b1917", "#161412"], nosing: C.amber, landing: "#1f1c1a" });
    K.render({ sky: [0.4, 0.39, 0.42], ground: [0.14, 0.13, 0.12], ambientFloor: 0.36, bloomStrength: 0.62 });
    // The whole dome is the film's still.
    K.dome((ctx, D) => paintFilm(ctx, { x: D.x, y: D.y, W: D.W, H: D.H, wrap: true, perAz: D.W / 360, k: 1 }, J, null));
    // Over the title and the chain, the same scene finer, with the latest blocks.
    const ySpan = Math.sin(FILM.el1 * DEG) - Math.sin(FILM.el0 * DEG), arc = (FILM.az1 - FILM.az0) * DEG * Math.cos((FILM.el0 + FILM.el1) / 2 * DEG);
    const spec = { id: "film", tip: "Now showing · The Timechain", ...FILM, h: Math.round(FILM.w * ySpan / arc) };
    const surface = filmSurface(L, spec);
    K.live({ ...spec, key: (f) => filmKey(f.reader), paint: (ctx, f) => paintFilm(ctx, surface, J, f.reader.value("recent")) });
    // A recliner at every place on every row, each facing the front.
    for (const s of R.seats) {
      const place = K.seat(s.x, s.z, s.heading + Math.PI, R.seatTop, s.floor, FRONT);
      K.node(null, recliner(), s.x, s.floor, s.z, { ry: s.heading, target: { kind: "chair", tip: "Recliner", radius: 0.6, index: place.index } });
    }
    // Point lights, the fixed ones first: the film's cool spill from the front, a warm glow over it, a pale fill.
    K.light(0, 1, -0.6 * L.R, 28, 0.2, 0.24, 0.38);
    K.light(0, L.c + 0.45 * L.R, -0.35 * L.R, 40, 0.55, 0.36, 0.18);
    K.light(0.3 * L.R, L.c + 0.3 * L.R, 0.4 * L.R, 30, 0.3, 0.29, 0.28);
    // The popcorn cart on the landing, to the right of whoever comes in, facing the middle, its own lamp last.
    const b = 44 * DEG, rc = L.r0 - 1;
    cart(K, rc * Math.sin(b), rc * Math.cos(b), b);
  };

  // The cart's bulbs blink by turns, every other one; a tap on the picture says what is showing.
  const animate = (nodes) => {
    const bulbs = [nodes.bulbs0, nodes.bulbs1], door = RM.bulbsOf(nodes);
    return {
      update(dt, t) {
        const on = Math.floor(t * 2.5) & 1;
        bulbs[0].glow = on ? 1 : 0.25;
        bulbs[1].glow = on ? 0.25 : 1;
        // The door's marquee chases round it, every fourth bulb lit.
        const lead = Math.floor(t * 6);
        for (let i = 0; i < door.length; i++) door[i].glow = (i + lead) % 4 === 0 ? 1 : 0.3;
      },
      tap(owner, hud) {
        if (owner.kind !== "live" || owner.slot.spec.id !== "film") return false;
        hud.toast(owner.slot.key.startsWith("live|") ? "Now showing: The Timechain · the latest fifteen blocks, the newest nearest" : "Now showing: The Timechain · its blocks fill in once mempool.space answers");
        return true;
      }
    };
  };
  BL.timechainRoomKinds.theater = { plan, animate, door };
})();
