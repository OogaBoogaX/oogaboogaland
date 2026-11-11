// Room 3, the Block Party: a club under a dome of light (the shortlist mock-up's `buildParty`). The dome is the
// mock-up's light show caught in one still: rings of the fee bands' colours stepping down from the crown, bands
// sweeping round it in spirals and a scatter of warm LED dots. Under it an LED dance floor whose rings step through
// the same colours on every beat, the DJ booth at the front with its decks and the lasers sweeping from it, a stack of
// speakers either side thumping, the mirror ball turning under the crown, the bar on the left and high tables round
// the floor. The latest block hangs on the dome over the booth. The room keeps a steady 124 BPM, and every twelve
// seconds the bass drops as it does on a block: a ring of light falls down the dome, a wave of light runs out across
// the floor, the lasers fan wide and the sign over the booth says so.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { face, blank } = RM.helpers;
  const { DEG, TAU } = ROOMS;
  const { hexToRgb } = BL.math;
  // The fee bands' colours, low to high, that every light in the room is drawn from, and the drop's warm flash.
  const BANDS = ["#5b3fd0", "#3a7bd5", "#2fbf71", "#e3c33a", "#f7931a", "#e0533d"], FLASH = "#ffd08a", PURPLE = "#9a5cff";
  const BAND_RGB = BANDS.map((c) => hexToRgb(c).map((v) => v / 255)), FLASH_RGB = hexToRgb(FLASH).map((v) => v / 255);
  const C = {
    booth: "#1a1420", boothTop: "#2a2030", metal: "#2a2a2e", vinyl: "#0b0b0b", cab: "#101012", baffle: "#161618", surround: "#26262b",
    bar: "#241a2c", barTop: "#3a2a48", pole: "#2b2b2b", chrome: "#8a8a94", label: "#ffb04d", ink: "#0b0714"
  };
  // The dance floor: tiles TILE apart round (0, FZ) out to FLOOR_R, lit a ring at a time; RINGS rings, each with a
  // node per band colour and one for the drop (VARIANTS), only one of them shown.
  // Canvas 2D sorts the tiles as if TILE_BIAS metres nearer, so the floor's large pieces under them never paint over.
  const FZ = -1, TILE = 0.8, FLOOR_R = 5.4, RINGS = 8, VARIANTS = BANDS.length + 1, TILE_BIAS = -0.7;
  // The beat, and the drop that stands in for a block: every DROP_EVERY seconds from DROP_FIRST, DROP_TIME long.
  const BEAT = 60 / 124, DROP_EVERY = 12, DROP_FIRST = 3, DROP_TIME = 1.6;
  // The lasers' colours, their beams built LASER_LEN long and stretched to the dome; the sign's height in a drop.
  const LASERS = ["#3cff7a", "#ff3ce0", "#3cc8ff", "#ffd03c", "#3cff7a", "#ff3ce0"], LASER_LEN = 14, SIGN_Y = 8.2, AWAY = -3;
  // A bar stool's sitting height.
  const STOOL_SEAT = 0.8;
  const polar = (r, b) => ({ x: r * Math.sin(b * DEG), z: r * Math.cos(b * DEG) });
  // The dance floor's tiles, each with the ring it lights with.
  const TILES = [];
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) {
    const d = Math.hypot(i, j);
    if (d * TILE <= FLOOR_R) TILES.push({ x: i * TILE, z: FZ + j * TILE, ring: Math.min(RINGS - 1, Math.round(d)) });
  }
  const boothZ = (L) => -(L.r0 - 2.7);
  const laserFrom = (L) => ({ x: 0, y: 1.35, z: boothZ(L) + 0.3 });
  // Circles along an arc round the room's middle (bearings in degrees), close enough that nobody slips between.
  const arcSolids = (K, r, b0, b1, rad) => {
    const n = Math.max(1, Math.ceil(Math.abs(b1 - b0) * DEG * r / (rad * 1.8)));
    for (let i = 0; i <= n; i++) { const p = polar(r, b0 + (b1 - b0) * i / n); K.solid({ x: p.x, z: p.z, r: rad }); }
  };
  // A colour round the fee bands' wheel, `t` turns from the lowest band.
  const band = (t, out) => {
    const u = (t - Math.floor(t)) * 6, i = Math.floor(u) % 6, f = u - Math.floor(u), a = BAND_RGB[i], b = BAND_RGB[(i + 1) % 6];
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  };
  // Where laser `i` points at time `t` from `from` (fanned wider and faster in a drop), as its node's YXZ yaw and
  // pitch, its direction and how far it reaches before the dome.
  const laserAim = (L, from, i, t, wide, out) => {
    const s = wide ? 1.9 : 1, yaw = Math.sin(t * 0.9 * s + i * 1.05) * (wide ? 1.15 : 0.9), pitch = -0.3 - 0.15 * Math.sin(t * 1.3 * s + i);
    const dx = Math.cos(pitch) * Math.sin(yaw), dy = -Math.sin(pitch), dz = Math.cos(pitch) * Math.cos(yaw);
    const wx = from.x, wy = from.y - L.c, wz = from.z, b = wx * dx + wy * dy + wz * dz, R = L.R - 0.2;
    out.yaw = yaw; out.pitch = pitch; out.dx = dx; out.dy = dy; out.dz = dz;
    out.reach = -b + Math.sqrt(b * b - (wx * wx + wy * wy + wz * wz - R * R));
    return out;
  };

  // The dome: the mock-up's light-show shader worked out once at SHOW_T, at half the dome's resolution and drawn up
  // smooth so it glows as the shader did, then its LED dots drawn sharp over it.
  const SHOW_T = 10.2;
  const paintShow = (ctx, D) => {
    const w = D.W / 2, h = D.H / 2, still = CH.canvas(w, h), sctx = still.getContext("2d"), img = sctx.createImageData(w, h), px = img.data, c = [0, 0, 0], T = SHOW_T, GAIN = 255;
    // Per column the spirals' phase and colour (the shader's stripes, by azimuth), per row the rings' (by elevation),
    // so each pixel only adds the two.
    const sa = new Float32Array(w), ca = new Float32Array(w), sr = new Float32Array(w), sg = new Float32Array(w), sb = new Float32Array(w);
    for (let u = 0; u < w; u++) {
      const az = ((u + 0.5) / w * 360 - 180) * DEG, a = az * 8 + T * 1.3;
      sa[u] = Math.sin(a); ca[u] = Math.cos(a);
      band(az / TAU + T * 0.05 + 0.5, c); sr[u] = c[0] * 0.6; sg[u] = c[1] * 0.6; sb[u] = c[2] * 0.6;
    }
    for (let v = 0; v < h; v++) {
      const el = D.elAt((v + 0.5) * D.H / h) * DEG, se = Math.sin(el * 4), ce = Math.cos(el * 4);
      const ring = Math.pow(0.5 + 0.5 * Math.sin(el * 18 + T * 5), 6) * 0.55;
      band(el * 0.6 + T * 0.08, c);
      const r0 = 0.025 + c[0] * ring, g0 = 0.012 + c[1] * ring, b0 = 0.05 + c[2] * ring;
      for (let u = 0, o = v * w * 4; u < w; u++, o += 4) {
        const s = 0.5 + 0.5 * (sa[u] * ce + ca[u] * se), s2 = s * s, s4 = s2 * s2, k = s4 * s4 * s2;
        px[o] = (r0 + sr[u] * k) * GAIN; px[o + 1] = (g0 + sg[u] * k) * GAIN; px[o + 2] = (b0 + sb[u] * k) * GAIN; px[o + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(still, 0, 0, D.W, D.H);
    // The dots: cells a fortieth of a radian square, about one in seven lit, warm, each a small square LED.
    const rand = D.rng(91), lowest = Math.floor(D.elAt(D.H) * DEG * 40);
    for (let cy = lowest; cy < 62; cy++) for (let cx = -125; cx < 125; cx++) {
      if (rand() < 0.86) continue;
      const a = 0.18 + 0.5 * (0.5 + 0.5 * Math.sin(T * 3 + cx * 1.7)) * (0.6 + rand() * 0.4);
      const x0 = D.x(cx / 40 / DEG), x1 = D.x((cx + 1) / 40 / DEG), y0 = D.y((cy + 1) / 40 / DEG), y1 = D.y(cy / 40 / DEG);
      const iw = (x1 - x0) * 0.3, ih = (y1 - y0) * 0.3;
      ctx.fillStyle = `rgba(255,217,153,${a.toFixed(3)})`;
      ctx.fillRect(x0 + iw, y0 + ih, x1 - x0 - 2 * iw, y1 - y0 - 2 * ih);
    }
  };

  // The latest block over the booth: its height in the island's letters, who found it and when.
  const paintBlock = (ctx, reader, now, w, h) => {
    const P = RM.paintKit, blocks = reader.value("recent"), b = blocks && blocks[0];
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = PURPLE; ctx.lineWidth = h * 0.045; P.roundRect(ctx, h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1, h * 0.12); ctx.stroke();
    P.pix(ctx, b ? "LATEST BLOCK" : "THE BASS DROPS ON EVERY BLOCK", w / 2, h * 0.25, h * 0.13, "#c9a6ff");
    if (!b) { P.pix(ctx, reader.status("recent"), w / 2, h * 0.62, h * 0.22, FLASH); return; }
    P.pix(ctx, CH.format.group(b.height), w / 2, h * 0.55, h * 0.34, FLASH);
    const line = `${b.pool || "Unknown pool"} · ${CH.format.ago(now - b.time * 1000)}`;
    ctx.fillStyle = "#e9dcff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    P.fit(ctx, line, w * 0.8, 600, h * 0.13);
    ctx.fillText(line, w / 2, h * 0.83);
  };
  const blockKey = (reader, now) => {
    const blocks = reader.value("recent"), b = blocks && blocks[0];
    return b ? `${b.height}|${b.pool}|${CH.format.ago(now - b.time * 1000)}` : reader.status("recent");
  };
  // A sign in the island's letters, framed, on the room's ink.
  const sign = (text, ink, frame) => (ctx, w, h) => {
    const P = RM.paintKit;
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = frame; ctx.lineWidth = h * 0.05; ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    P.pix(ctx, text, w / 2, h * 0.53, Math.min(h * 0.55, w * 0.88 / P.pixWidth(text, 1)), ink);
  };

  // The mirror ball: square facets in greys, a few catching a light, all faintly bright so it sparkles.
  const mirrorBall = (k, r) => {
    const geo = blank(), rand = RM.paintKit.rng(77), rows = 10, cols = 22, GREYS = ["#d8d8e2", "#a8a8b4", "#eeeef4", "#8a8a96", "#c0c0cc"];
    const at = (i, j) => { const lat = -Math.PI / 2 + Math.PI * i / rows, lon = TAU * j / cols; return [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)]; };
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const pts = i === 0 ? [at(0, 0), at(1, j + 1), at(1, j)] : i === rows - 1 ? [at(i, j), at(i, j + 1), at(rows, 0)] : [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)];
      let nx = 0, ny = 0, nz = 0;
      for (const p of pts) { nx += p[0]; ny += p[1]; nz += p[2]; }
      const glint = rand() < 0.14, color = glint ? (rand() < 0.5 ? "#ffffff" : BANDS[Math.floor(rand() * 6)]) : GREYS[Math.floor(rand() * GREYS.length)];
      face(geo, pts, color, glint ? 1 : 0.12 + rand() * 0.22, [nx, ny, nz]);
    }
    k.add(geo, 0, 0, 0);
    k.cyl(0.07, 0.09, 0.12, "#4a4a52", 0, r + 0.04, 0);
  };
  // A speaker's cone round its node's +y, which the node turns out of the cabinet's face: the cone, its dust cap
  // and a lit ring round it that flashes on the beat.
  const cone = (rr) => (k) => {
    k.cyl(rr, rr * 0.6, 0.05, "#08080a", 0, -0.025, 0, { seg: 20 });
    k.ball(rr * 0.3, "#34343a", 0, 0, 0, { seg: 10 });
    k.torus(rr * 0.72, 0.008, PURPLE, 0, 0.002, 0, { seg: 20, sides: 4, emissive: 1 });
  };
  // A bar stool, its seat's top at 0.765.
  const stool = (k) => {
    k.cyl(0.2, 0.22, 0.03, C.pole, 0, 0.015, 0, { seg: 14 });
    k.cyl(0.03, 0.03, 0.7, C.chrome, 0, 0.37, 0, { seg: 8 });
    k.torus(0.16, 0.012, C.chrome, 0, 0.3, 0, { seg: 14, sides: 4 });
    k.cyl(0.2, 0.17, 0.07, C.barTop, 0, 0.73, 0, { seg: 14 });
  };

  const plan = (K, L) => {
    const r0 = L.r0, BZ = boothZ(L);
    K.wallColor("#140e1a");
    K.render({ sky: [0.3, 0.24, 0.42], ground: [0.12, 0.08, 0.16], direct: [0.4, 0.34, 0.5], directStrength: 0.12, ambientFloor: 0.3, bloomStrength: 0.95 });
    K.dome((ctx, D) => paintShow(ctx, D));
    // The floor: near black with a faint violet grid, black under the dance floor so its seams read, and the chain
    // from the doors to its edge.
    K.floor((ctx, F) => {
      const { N, X, Y, s, rf } = F;
      ctx.fillStyle = "#0e0b12"; ctx.fillRect(0, 0, N, N);
      ctx.strokeStyle = "rgba(154,92,255,.12)"; ctx.lineWidth = 2;
      for (let v = -rf; v < rf; v += TILE) {
        ctx.beginPath(); ctx.moveTo(X(v), 0); ctx.lineTo(X(v), N); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, Y(v)); ctx.lineTo(N, Y(v)); ctx.stroke();
      }
      // Under each tile its colour as the floor starts, dimmed, between black seams: hidden under the tiles, but
      // where Canvas 2D sorts a large piece of the floor over one, it shows a tile rather than a hole.
      ctx.fillStyle = "#050307"; ctx.beginPath(); ctx.arc(X(0), Y(FZ), (FLOOR_R + 0.45) * s, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.7;
      for (const t of TILES) { ctx.fillStyle = BANDS[t.ring % 6]; ctx.fillRect(X(t.x - 0.38), Y(t.z - 0.38), 0.76 * s, 0.76 * s); }
      ctx.globalAlpha = 1;
      F.path(0, L.doorZ, 0, FZ + FLOOR_R + 0.6);
    });

    // The dance floor: each ring of tiles in every colour it takes, stacked a hair apart with the colour it starts in
    // uppermost, so the room seen before its first frame shows the rings as they start.
    for (let k = 0; k < RINGS; k++) for (let v = 0; v < VARIANTS; v++) {
      const color = v < BANDS.length ? BANDS[v] : FLASH, lift = v === k % 6 ? 0.004 : v < BANDS.length ? 0.0005 * v : 0;
      K.node(`tile${k}_${v}`, (n) => { for (const t of TILES) if (t.ring === k) n.box(0.76, 0.03, 0.76, color, t.x, 0.015, t.z, { emissive: 1, glow: true }); }, 0, lift, 0, { glow: true, depthBias: TILE_BIAS });
    }

    // The DJ booth at the front: a curved desk lit violet along its face under the room's name, its decks, mixer and
    // the lasers' emitter on top.
    const rb0 = r0 - 3.2, rb1 = r0 - 2.4, a0 = 160 * DEG, a1 = 200 * DEG;
    K.sector(0, rb0, rb1, a0, a1, 0, 1.0, C.booth);
    K.sector(0, rb0 - 0.03, rb1, a0, a1, 1.0, 1.03, C.boothTop);
    K.sector(0, rb0 - 0.05, rb0, a0, a1, 0.15, 0.95, PURPLE, { emissive: 0.55, glow: true });
    const logoZ = -Math.sqrt((rb0 - 0.05) ** 2 - 1.3 * 1.3) + 0.02;
    K.picture(2.4, 0.6, 1000, 250, sign("BLOCK PARTY", C.label, PURPLE), 0, 0.55, logoZ,
      { target: { kind: "booth", tip: "DJ booth", radius: 1.3, data: { say: "Block Party · the bass drops on every block" } } });
    arcSolids(K, (rb0 + rb1) / 2, 160, 200, 0.42);
    for (const side of [-1, 1]) {
      const x = side * 0.65;
      K.cyl(0.3, 0.3, 0.05, C.metal, x, 1.055, BZ, { seg: 24 });
      K.box(0.03, 0.03, 0.3, "#c9c9d0", x + side * 0.26, 1.1, BZ + 0.04, { ry: side * 0.25 });
      K.node(`record${side < 0 ? 0 : 1}`, (k) => {
        k.cyl(0.25, 0.25, 0.012, C.vinyl, 0, 0, 0, { seg: 24 });
        k.cyl(0.08, 0.08, 0.014, C.label, 0, 0.001, 0, { seg: 12 });
        k.box(0.13, 0.016, 0.02, "#3a3a44", 0.15, 0.001, 0);
      }, x, 1.087, BZ, { target: { kind: "decks", tip: "Decks", radius: 0.4, data: { say: "33 rpm, and the bass drops on every block" } } });
    }
    K.box(0.42, 0.08, 0.32, C.metal, 0, 1.07, BZ);
    K.box(0.36, 0.01, 0.26, PURPLE, 0, 1.115, BZ, { emissive: 0.6, glow: true });
    for (let m = 0; m < 2; m++) K.node(`meter${m}`, (k) => k.box(0.03, 0.12, 0.03, m ? BANDS[4] : BANDS[2], 0, 0.06, 0, { emissive: 1, glow: true }), (m - 0.5) * 0.12, 1.12, BZ - 0.08, { glow: true });
    K.box(0.6, 0.1, 0.16, "#0e0e10", 0, 1.28, BZ + 0.3);
    K.box(0.5, 0.03, 0.02, "#ff3ce0", 0, 1.3, BZ + 0.385, { emissive: 1, glow: true });

    // The lasers: a beam per colour from the emitter, built pointing where it starts so the room seen before its
    // first frame shows them, with a spot where each meets the dome.
    const from = laserFrom(L), aim = {}, beams = new Map(), spots = new Map();
    LASERS.forEach((color, i) => {
      laserAim(L, from, i, 0, false, aim);
      beams.set(color, K.node(`laser${i}`, beams.get(color) || ((k) => k.box(0.04, 0.04, LASER_LEN, color, 0, 0, LASER_LEN / 2, { emissive: 1, glow: true })), from.x, from.y, from.z, { rx: aim.pitch, ry: aim.yaw, glow: true }).geometry);
      spots.set(color, K.node(`spot${i}`, spots.get(color) || ((k) => k.ball(0.14, color, 0, 0, 0, { emissive: 1, glow: true, seg: 8 })), from.x + aim.dx * LASER_LEN, from.y + aim.dy * LASER_LEN, from.z + aim.dz * LASER_LEN, { glow: true }).geometry);
    });

    // The speaker stacks either side of the booth, three cabinets each facing the floor, their cones on nodes of
    // their own that thump.
    let woofer = cone(0.2), tweeter = cone(0.13);
    for (const [s, b] of [[0, 214], [1, 146]]) {
      const p = polar(r0 - 1.5, b), g = K.group(p.x, 0, p.z, Math.atan2(p.x, p.z));
      const tip = { kind: "speaker", tip: "Speaker stack", radius: 0.5, data: { say: "Four on the floor, and a drop on every block" } };
      for (let k = 0; k < 3; k++) {
        const y = 0.45 + k * 0.9;
        g.box(1.0, 0.86, 0.8, C.cab, 0, y, 0);
        g.box(0.9, 0.78, 0.02, C.baffle, 0, y, -0.405);
        g.box(0.9, 0.025, 0.02, PURPLE, 0, y - 0.4, -0.41, { emissive: 0.7, glow: true });
        g.torus(0.22, 0.025, C.surround, 0, y + 0.12, -0.415, { rx: Math.PI / 2, seg: 20, sides: 4 });
        g.torus(0.145, 0.02, C.surround, 0, y - 0.22, -0.415, { rx: Math.PI / 2, seg: 16, sides: 4 });
        woofer = g.node(`woofer${s}_${k}`, woofer, 0, y + 0.12, -0.415, { rx: -Math.PI / 2, target: k === 1 ? tip : null }).geometry;
        tweeter = g.node(`tweeter${s}_${k}`, tweeter, 0, y - 0.22, -0.415, { rx: -Math.PI / 2 }).geometry;
      }
      g.box(1.0, 0.04, 0.8, "#1e1e22", 0, 2.73, 0);
      K.solid({ x: p.x, z: p.z, r: 0.62 });
    }

    // The mirror ball under the crown on its line; the ring of light a drop sends down the dome and the sign over the
    // booth that says so, both kept under the floor until a drop.
    K.node("ball", (k) => mirrorBall(k, 0.85), 0, 8.5, FZ, { target: { kind: "ball", tip: "Mirror ball", radius: 1, data: { say: "It turns faster when the bass drops" } } });
    K.box(0.03, L.crown - 9.45, 0.03, "#55555c", 0, (9.35 + L.crown - 0.1) / 2, FZ);
    K.node("wave", (k) => k.torus(1, 0.025, FLASH, 0, 0, 0, { emissive: 1, glow: true, seg: 72, sides: 5 }), 0, AWAY, 0, { glow: true });
    K.picture(9, 1.1, 1636, 200, sign("BLOCK FOUND · DROP!", FLASH, FLASH), 0, AWAY, BZ + 1.6, { name: "drop", rx: 0.3 });

    // The bar on the left: a curved counter lit along its foot, a back bar of bottles against the wall under a sign,
    // and stools along it.
    const bb0 = -118, bb1 = -62, arc = (b0, b1) => [(bb0 + b0) * DEG, (bb1 - b1) * DEG];
    K.sector(0, r0 - 2.4, r0 - 1.8, ...arc(0, 0), 0, 0.72, C.bar);
    K.sector(0, r0 - 2.5, r0 - 1.75, ...arc(0, 0), 0.72, 0.78, C.barTop);
    K.sector(0, r0 - 2.43, r0 - 2.39, ...arc(0, 0), 0.1, 0.13, PURPLE, { emissive: 1, glow: true });
    arcSolids(K, r0 - 2.1, bb0, bb1, 0.34);
    K.sector(0, r0 - 0.36, r0 - 0.05, ...arc(2, 2), 0, 1.0, C.booth);
    K.sector(0, r0 - 0.39, r0 - 0.05, ...arc(2, 2), 1.0, 1.04, C.barTop);
    K.sector(0, r0 - 0.38, r0 - 0.36, ...arc(2, 2), 0.9, 0.93, BANDS[4], { emissive: 1, glow: true });
    K.sector(0, r0 - 0.33, r0 + 0.1, ...arc(3, 3), 1.62, 1.66, C.barTop);
    K.sector(0, r0 - 0.32, r0 - 0.3, ...arc(3, 3), 1.6, 1.62, PURPLE, { emissive: 1, glow: true });
    const GLASS = ["#2f6b3a", "#8a5a1a", "#3a5a8a", "#a33a2a", "#d8d0b0", "#5a2a6a", "#c9a227"], brand = RM.paintKit.rng(43);
    for (const [y, r] of [[1.04, r0 - 0.2], [1.66, r0 - 0.15]]) for (let b = bb0 + 4; b <= bb1 - 4; b += 2.2 + brand() * 1.2) {
      const p = polar(r, b), color = GLASS[Math.floor(brand() * GLASS.length)], tall = 0.2 + brand() * 0.1;
      K.cyl(0.045, 0.045, tall, color, p.x, y + tall / 2, p.z, { seg: 8, emissive: 0.3 });
      K.cyl(0.014, 0.03, 0.08, color, p.x, y + tall + 0.04, p.z, { seg: 6, emissive: 0.3 });
    }
    const barSign = polar(r0 + 0.3, -90);
    K.picture(2.2, 0.6, 880, 240, sign("BAR", C.label, BANDS[4]), barSign.x, 2.55, barSign.z,
      { ry: Math.PI / 2, target: { kind: "bar", tip: "Bar", radius: 1.2, data: { say: "The bar · drinks are on the house" } } });
    let stoolGeo = stool;
    for (let b = -106; b <= -74; b += 8) {
      const p = polar(r0 - 2.95, b), seat = K.seat(p.x, p.z, b * DEG, STOOL_SEAT);
      stoolGeo = K.node(null, stoolGeo, p.x, 0, p.z, { target: { kind: "chair", tip: "Bar stool", radius: 0.5, index: seat.index } }).geometry;
      K.solid({ x: p.x, z: p.z, r: 0.22 });
    }

    // High tables round the floor, a drink lit on each and two stools.
    [[42, 7.2], [80, 7.6], [118, 7.4], [-40, 7.2], [-132, 7.4]].forEach(([b, r], i) => {
      const t = polar(r, b), tx = Math.cos(b * DEG), tz = -Math.sin(b * DEG);
      K.cyl(0.06, 0.06, 0.9, C.pole, t.x, 0.45, t.z, { seg: 8 });
      K.cyl(0.3, 0.34, 0.04, C.pole, t.x, 0.02, t.z, { seg: 16 });
      K.cyl(0.45, 0.45, 0.05, C.barTop, t.x, 0.925, t.z, { seg: 24 });
      K.torus(0.45, 0.012, PURPLE, t.x, 0.925, t.z, { emissive: 1, glow: true, seg: 24, sides: 4 });
      K.cyl(0.04, 0.035, 0.12, BANDS[(i * 2 + 1) % 6], t.x + 0.12, 1.01, t.z - 0.08, { seg: 8, emissive: 0.8, glow: true });
      K.solid({ x: t.x, z: t.z, r: 0.47 });
      for (const side of [-1, 1]) {
        const x = t.x + side * tx * 0.8, z = t.z + side * tz * 0.8, seat = K.seat(x, z, Math.atan2(t.x - x, t.z - z), STOOL_SEAT);
        stoolGeo = K.node(null, stoolGeo, x, 0, z, { target: { kind: "chair", tip: "Stool at a high table", radius: 0.5, index: seat.index } }).geometry;
        K.solid({ x, z, r: 0.22 });
      }
    });

    // The latest block on the dome over the booth.
    const pa0 = -15, pa1 = 15, pe0 = 3.5, pe1 = 9.5, pw = 1024;
    const wM = (pa1 - pa0) * DEG * L.R * Math.cos((pe0 + pe1) / 2 * DEG), hM = L.R * (Math.sin(pe1 * DEG) - Math.sin(pe0 * DEG)), ph = Math.round(pw * hM / wM);
    K.live({ az0: pa0, az1: pa1, el0: pe0, el1: pe1, w: pw, h: ph, tip: "The latest block",
      key: (f, now) => blockKey(f.reader, now), paint: (ctx, f, now) => paintBlock(ctx, f.reader, now, pw, ph) });

    // Point lights, in the order `animate` drives them: the two mood lights over the floor, the floor's own glow and
    // the ball's; then the booth, the bar and the tables.
    const bar = polar(r0 - 2.8, -90), right = polar(7.4, 80), left = polar(7.2, -86);
    K.light(-4, 4, -2, 18, 0.48, 0.25, 0.82);
    K.light(4, 4, -2, 18, 0.97, 0.58, 0.1);
    K.light(0, 0.9, FZ, 7.5, 0.5, 0.35, 0.7);
    K.light(0, 7.4, FZ, 9, 0.45, 0.45, 0.55);
    K.light(0, 2.4, BZ + 1.6, 7, 0.55, 0.3, 0.85);
    K.light(bar.x, 2.4, bar.z, 7, 0.9, 0.5, 0.22);
    K.light(right.x, 2.6, right.z, 6, 0.55, 0.3, 0.65);
    K.light(left.x, 2.6, left.z, 6, 0.55, 0.3, 0.65);
  };

  // The room alive: the beat on the floor, the cones, the meters and the lights; the lasers sweeping, the decks and
  // the ball turning; and a drop every DROP_EVERY seconds.
  const animate = (nodes, built) => {
    const L = built.layout, from = laserFrom(L), aim = { yaw: 0, pitch: 0, reach: 0, dx: 0, dy: 0, dz: 0 }, rgb = [0, 0, 0];
    const tiles = [];
    for (let k = 0; k < RINGS; k++) { const row = []; for (let v = 0; v < VARIANTS; v++) row.push(nodes[`tile${k}_${v}`]); tiles.push(row); }
    const lasers = LASERS.map((_, i) => nodes[`laser${i}`]), spots = LASERS.map((_, i) => nodes[`spot${i}`]);
    // Each cone's rest and the way it pushes out, toward the room's middle.
    const cones = [];
    for (const name of Object.keys(nodes)) if (/^(woofer|tweeter)/.test(name)) {
      const n = nodes[name], p = n.position, d = Math.hypot(p.x, p.z);
      cones.push({ node: n, x: p.x, z: p.z, dx: -p.x / d, dz: -p.z / d, big: name[0] === "w" ? 1 : 0.6 });
    }
    const records = [nodes.record0, nodes.record1], meters = [nodes.meter0, nodes.meter1], ball = nodes.ball, wave = nodes.wave, drop = nodes.drop;
    const e0 = ROOMS.edgeEl(L, 0) / DEG;
    // The planned colours of the floor's and the ball's lights, which the beat and the drop scale.
    const floorRgb = built.lights[2].slice(4, 7), ballRgb = built.lights[3].slice(4, 7);
    let next = DROP_FIRST, dropT = -1;
    const setLight = (lights, i, r, g, b) => { const o = i * 8; lights[o + 4] = r; lights[o + 5] = g; lights[o + 6] = b; };
    return {
      update(dt, t) {
        const beat = t / BEAT, step = Math.floor(beat), kick = Math.exp(-(beat - step) * 6);
        if (t >= next) { next += DROP_EVERY; dropT = 0; }
        if (dropT >= 0 && (dropT += dt / DROP_TIME) >= 1) dropT = -1;
        const d = dropT, dropping = d >= 0, boom = dropping ? 1 - d : 0;
        // The floor: each ring a band colour, stepping outward a ring every beat and pulsing; in a drop, a wave of the
        // flash colour running out from the middle once the dome's ring has come down.
        const front = dropping ? (d - 0.3) / 0.6 * (RINGS + 1) : -9;
        for (let k = 0; k < RINGS; k++) {
          const flash = Math.abs(k - front) < 1.3, show = flash ? BANDS.length : ((k - step) % 6 + 6) % 6, row = tiles[k];
          for (let v = 0; v < VARIANTS; v++) row[v].visible = v === show;
          row[show].glow = flash ? 1 : 0.22 + 0.45 * Math.max(0, Math.sin(k * 1.2 - t * 6)) + 0.33 * kick;
        }
        // The lasers sweep, reaching the dome, wider and faster in a drop.
        for (let i = 0; i < lasers.length; i++) {
          laserAim(L, from, i, t, dropping, aim);
          const n = lasers[i], s = spots[i];
          n.rotation.x = aim.pitch; n.rotation.y = aim.yaw; n.scale.z = aim.reach / LASER_LEN;
          s.position.x = from.x + aim.dx * aim.reach; s.position.y = from.y + aim.dy * aim.reach; s.position.z = from.z + aim.dz * aim.reach;
          n.glow = s.glow = 0.75 + 0.25 * kick;
        }
        // The cones thump on the beat, harder in a drop.
        const push = 0.025 * kick * (1 + boom);
        for (let i = 0; i < cones.length; i++) {
          const c = cones[i], p = push * c.big, n = c.node;
          n.position.x = c.x + c.dx * p; n.position.z = c.z + c.dz * p;
          n.scale.x = n.scale.z = 1 + p * 2.5;
          n.glow = 0.3 + 0.7 * kick;
        }
        records[0].rotation.y -= dt * 3.49; records[1].rotation.y -= dt * 3.49;
        meters[0].scale.y = 0.25 + 0.75 * kick; meters[1].scale.y = 0.25 + 0.75 * Math.exp(-((beat + 0.5) % 1) * 5);
        ball.rotation.y += dt * (0.4 + boom * 2.2);
        ball.glow = 0.8 + 0.5 * kick + boom;
        // The drop's ring of light falls from the crown to the dome's edge in its first half; its sign blinks.
        const fall = d / 0.5;
        if (dropping && fall < 1) {
          const el = (90 - fall * (90 - e0)) * DEG, s = Math.max(0.3, (L.R * Math.cos(el) - 0.12) / 1.025);
          wave.position.y = L.c + L.R * Math.sin(el); wave.scale.x = wave.scale.y = wave.scale.z = s;
        } else wave.position.y = AWAY;
        drop.position.y = dropping && (d * 7) % 1 < 0.7 ? SIGN_Y : AWAY;
        // The lights: the mood pair cycling round the bands opposite each other, the floor's and the ball's on the
        // beat, all flaring warm in a drop.
        const opts = BL.scenes.timechain.renderOpts, lights = opts && opts.lights;
        if (lights && opts.lightCount >= 4) {
          const lift = 1 + 0.6 * boom;
          for (let i = 0; i < 2; i++) {
            band(t * 0.05 + i * 0.5, rgb);
            setLight(lights, i, (rgb[0] + (FLASH_RGB[0] - rgb[0]) * boom) * lift, (rgb[1] + (FLASH_RGB[1] - rgb[1]) * boom) * lift, (rgb[2] + (FLASH_RGB[2] - rgb[2]) * boom) * lift);
          }
          const f = (0.6 + 0.5 * kick) * lift, bl = (0.85 + 0.3 * kick) * lift;
          setLight(lights, 2, floorRgb[0] * f, floorRgb[1] * f, floorRgb[2] * f);
          setLight(lights, 3, ballRgb[0] * bl, ballRgb[1] * bl, ballRgb[2] * bl);
        }
      },
      tap(owner, hud) {
        if (owner.kind !== "live") return false;
        hud.toast("The latest block, from mempool.space · the bass drops on every one");
        return true;
      }
    };
  };
  BL.timechainRoomKinds.party = { plan, animate };
})();
