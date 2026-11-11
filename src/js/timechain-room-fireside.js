// Room 4, the Fireside Lounge: a small room for a fireside chat (the shortlist mock-up's `buildFireside`). The dome is
// a clear night over a ring of pines, as if the room sat in a forest clearing: stars, the Milky Way across it and a
// crescent moon, and the latest block hanging low over the trees. In the middle a fire pit of stones and logs with a
// flickering fire and sparks rising toward the sky, two curved leather sofas and an armchair round it on a round rug,
// eleven seats in all, side tables with mugs and candles, two floor lamps, and a low shelf of books along the wall
// all the way round to the doors.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { DEG, TAU } = ROOMS;
  const { hexToRgb } = BL.math;
  const C = {
    leather: "#5a3320", frame: "#4a2918", cushion: "#6a3d26", stone: ["#5a5652", "#4e4a46", "#66615b"], log: "#4a2e1e", char: "#1e130d",
    wood: "#6b4a2a", stem: "#3a2616", mug: "#e9e2d2", iron: "#2b2b2b", shade: "#ffcf7a", shelf: "#5a3a22", plinth: "#2a1a10", ink: "rgba(255,226,180,.9)"
  };
  // The night: its sky's stops (as the dome lays them, linear in height between them) and the pines' silhouette.
  const SKY = [[90, "#04060e"], [40, "#0a1020"], [12, "#15203a"], [-90, "#1a2540"]], PINE = "#03060a", FAR_PINE = "#0a1220";
  // The fire's flames: colour, where on the logs, radius and height.
  const FLAMES = [["#ff7a1a", 0, 0, 0.3, 1.0], ["#ffb03a", 0.15, 0.1, 0.22, 0.8], ["#ffb03a", -0.14, -0.08, 0.22, 0.75], ["#ffd36a", 0.02, -0.15, 0.16, 0.6], ["#ff7a1a", -0.08, 0.16, 0.2, 0.7], ["#ffd36a", 0.1, -0.02, 0.12, 0.5]];
  // Sparks, how many and how high they rise before starting over.
  const SPARKS = 46, SPARK_TOP = 5;
  // The sofas: two arcs round the fire (bearings in degrees) from SOFA_IN out to SOFA_OUT, far enough from the pit
  // that the widest Ooga walks between, five seats each on SOFA_R; arms ARM wide at their ends. Getting up leaves a
  // sitter STAND in front of the seat (a negative distance behind it), toward the fire, since the backs are behind.
  const SOFAS = [[38, 142], [218, 322]], SOFA_IN = 3.0, SOFA_OUT = 3.9, SOFA_R = 3.4, ARM = 0.2, SOFA_SEAT = 0.46, STAND = -1.2;
  // The rug's radius, and how far out the floor lamps stand.
  const RUG = 4.5, LAMP_R = 5.3;
  // The shelf along the wall, left open SHELF_GAP metres either side of the doors.
  const SHELF_GAP = 3.2, SHELF_TOP = 1.2;
  const polar = (r, b) => ({ x: r * Math.sin(b * DEG), z: r * Math.cos(b * DEG) });
  const arcSolids = (K, r, b0, b1, rad) => {
    const n = Math.max(1, Math.ceil(Math.abs(b1 - b0) * DEG * r / (rad * 1.8)));
    for (let i = 0; i <= n; i++) { const p = polar(r, b0 + (b1 - b0) * i / n); K.solid({ x: p.x, z: p.z, r: rad }); }
  };
  // The sky's colour at elevation `el` as the dome's gradient lays it: interpolated by canvas row, which is height.
  const skyAt = (D, el) => {
    const at = (e) => Math.max(0, Math.min(1, D.y(e) / D.H)), t = at(el);
    for (let i = 0; i + 1 < SKY.length; i++) {
      const t0 = at(SKY[i][0]), t1 = at(SKY[i + 1][0]);
      if (t > t1 && i + 2 < SKY.length) continue;
      const k = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0, a = hexToRgb(SKY[i][1]), b = hexToRgb(SKY[i + 1][1]);
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
    }
    return SKY[SKY.length - 1][1];
  };

  // The dome: the night sky, its stars and the Milky Way, the crescent moon, and the forest's edge all round.
  const paintNight = (ctx, D, e0) => {
    D.sky(ctx, SKY);
    // A star `s` metres across at (az, el), and a soft halo round the brightest.
    const dot = (az, el, s, color) => { ctx.fillStyle = color; ctx.fillRect(D.x(az), D.y(el), Math.max(1.5, s * D.perX(el)), Math.max(1.5, s * D.perY(el))); };
    // The Milky Way: a haze of faint dots along a band tilted across the sky, thicker toward its middle.
    const r = D.rng(8), band = (az) => 38 + 28 * Math.sin((az + 30) * DEG);
    for (let az = -180; az < 180; az += 3) {
      const el = band(az);
      if (el < e0 + 16 || el > 84) continue;
      const px = 0.9 * D.perY(el), g = ctx.createRadialGradient(0, 0, 0, 0, 0, px);
      g.addColorStop(0, "rgba(150,170,230,.07)"); g.addColorStop(1, "rgba(150,170,230,0)");
      D.wrap(ctx, () => { ctx.translate(D.x(az), D.y(el)); ctx.scale(D.perX(el) / D.perY(el), 1); ctx.fillStyle = g; ctx.fillRect(-px, -px, 2 * px, 2 * px); });
    }
    for (let i = 0; i < 7000; i++) {
      const az = r() * 360 - 180, el = band(az) + (r() - 0.5) * 12 * (0.6 + r());
      if (el < e0 + 14 || el > 86) continue;
      dot(az, el, 0.03 + r() * r() * 0.1, `rgba(205,215,255,${(0.05 + r() * 0.12).toFixed(3)})`);
    }
    const sr = D.rng(31), s0 = Math.sin((e0 + 8) * DEG);
    for (let i = 0; i < 900; i++) {
      const el = Math.asin(s0 + sr() * (1 - s0)) / DEG, az = sr() * 360 - 180, b = sr(), s = 0.018 + b * b * b * 0.05;
      if (b > 0.93) {
        const px = s * 3 * D.perY(el), g = ctx.createRadialGradient(0, 0, 0, 0, 0, px);
        g.addColorStop(0, "rgba(200,215,255,.35)"); g.addColorStop(1, "rgba(200,215,255,0)");
        ctx.save(); ctx.translate(D.x(az), D.y(el)); ctx.scale(D.perX(el) / D.perY(el), 1); ctx.fillStyle = g; ctx.fillRect(-px, -px, 2 * px, 2 * px); ctx.restore();
      }
      dot(az, el, s, `rgba(255,248,235,${(0.4 + sr() * 0.6).toFixed(3)})`);
    }
    // The crescent moon, a metre across, with a faint halo: its lit disc less a disc a little up and toward the sun's
    // side, cut on a canvas of its own so the sky and the halo show through.
    const MA = 120, ME = 38, mr = 0.5, moon = CH.canvas(256, 256), mc = moon.getContext("2d");
    mc.fillStyle = "#f2ead2"; mc.beginPath(); mc.arc(128, 128, 120, 0, TAU); mc.fill();
    mc.globalCompositeOperation = "destination-out"; mc.beginPath(); mc.arc(128 + 120 * 7 / 18, 128 - 120 * 4 / 18, 120 * 17 / 18, 0, TAU); mc.fill();
    ctx.save(); ctx.translate(D.x(MA), D.y(ME)); ctx.scale(D.perX(ME) / D.perY(ME), 1);
    const R = mr * D.perY(ME), halo = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 3.2);
    halo.addColorStop(0, "rgba(242,234,210,.16)"); halo.addColorStop(1, "rgba(242,234,210,0)");
    ctx.fillStyle = halo; ctx.fillRect(-R * 3.2, -R * 3.2, R * 6.4, R * 6.4);
    ctx.drawImage(moon, -R, -R, 2 * R, 2 * R);
    ctx.restore();
    // The forest: a farther, bluer row of pines, then the near row black, each three tiers on a trunk, and the ground
    // below them.
    const pines = (seed, color, lift, grow) => {
      const pr = D.rng(seed);
      ctx.fillStyle = color;
      D.wrap(ctx, () => {
        for (let az = -180; az < 180; az += 2.2 + pr() * 2.6) {
          const h = (7 + pr() * 11) * grow, base = e0 + lift, mid = (base + h / 2) * DEG, half = h * 0.32 / Math.cos(mid);
          for (let k = 0; k < 3; k++) {
            const top = base + h * (1 - k * 0.22), bot = base + h * (0.45 - k * 0.2), w = half * (0.6 + k * 0.25);
            ctx.beginPath(); ctx.moveTo(D.x(az), D.y(top)); ctx.lineTo(D.x(az) - w * D.W / 360, D.y(bot)); ctx.lineTo(D.x(az) + w * D.W / 360, D.y(bot)); ctx.closePath(); ctx.fill();
          }
          ctx.fillRect(D.x(az) - 0.05 * D.perX(base), D.y(base + 2), 0.1 * D.perX(base), D.H - D.y(base + 2));
        }
      });
    };
    pines(19, FAR_PINE, 2.5, 0.85);
    ctx.fillStyle = PINE; ctx.fillRect(0, D.y(e0 + 1.5), D.W, D.H - D.y(e0 + 1.5));
    pines(4, PINE, 0, 1);
  };

  // The latest block, hung low over the trees on a patch painted with the sky behind it.
  const paintBlock = (ctx, reader, now, w, h, top, bottom) => {
    const P = RM.paintKit, blocks = reader.value("recent"), b = blocks && blocks[0], g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const big = b ? CH.format.group(b.height) : "LATEST BLOCK";
    P.pix(ctx, big, w / 2, h * 0.42, Math.min(h * 0.42, w * 0.85 / P.pixWidth(big, 1)), C.ink);
    ctx.fillStyle = "rgba(255,226,180,.65)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const line = b ? `last block · ${CH.format.ago(now - b.time * 1000)}` : reader.status("recent").toLowerCase();
    P.fit(ctx, line, w * 0.9, 500, h * 0.2);
    ctx.fillText(line, w / 2, h * 0.84);
  };
  const blockKey = (reader, now) => {
    const blocks = reader.value("recent"), b = blocks && blocks[0];
    return b ? `${b.height}|${CH.format.ago(now - b.time * 1000)}` : reader.status("recent");
  };

  // The floor: planks a hand wide in runs of random length, the rug's rings round the fire, the pit's ash and the
  // chain from the doors to the rug.
  const paintFloor = (ctx, F, L) => {
    const { N, s, X, Y } = F, r = F.rng(5), bw = 0.24 * s;
    ctx.fillStyle = "#1c120a"; ctx.fillRect(0, 0, N, N);
    for (let x = 0; x < N; x += bw) {
      let y = -r() * 2 * s;
      while (y < N) { const len = (1.2 + r() * 1.4) * s, v = 46 + Math.floor(r() * 26); ctx.fillStyle = `rgb(${v + 24},${v},${Math.floor(v * 0.55)})`; ctx.fillRect(x + 1, y + 1, bw - 2, len - 2); y += len; }
    }
    const ring = RUG / 12;
    for (let k = 0; k < 12; k++) { ctx.fillStyle = ["#5a1f1a", "#7a4a1f", "#3a2a5a", "#5a1f1a"][k % 4]; ctx.beginPath(); ctx.arc(X(0), Y(0), (RUG - k * ring) * s, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "rgba(240,200,140,.35)"; ctx.lineWidth = 0.047 * s;
    for (let k = 1; k < 12; k += 2) { ctx.beginPath(); ctx.arc(X(0), Y(0), (RUG - k * ring) * s, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = "#120804"; ctx.beginPath(); ctx.arc(X(0), Y(0), 0.85 * s, 0, TAU); ctx.fill();
    const ash = F.rng(14);
    for (let i = 0; i < 120; i++) {
      const a = ash() * TAU, d = Math.sqrt(ash()) * 0.8, hot = ash() < 0.3;
      ctx.fillStyle = hot ? `rgba(255,${100 + Math.floor(ash() * 80)},30,.7)` : "rgba(90,84,78,.5)";
      ctx.fillRect(X(Math.sin(a) * d) - 3, Y(Math.cos(a) * d) - 3, 6, 6);
    }
    F.path(0, L.doorZ, 0, RUG + 0.2);
  };

  // A run of book spines in two rows, a shelf board under each, as one panel of the shelf: seeded, so each panel of
  // the same seed is the same.
  const paintBooks = (seed) => (ctx, W, H) => {
    const r = RM.paintKit.rng(seed), rows = 2, rh = H / rows, cols = ["#5a1a16", "#1a3424", "#1a2642", "#4c3116", "#33243f", "#684c24", "#242424", "#74311a", "#2a3a3a"];
    ctx.fillStyle = "#140c06"; ctx.fillRect(0, 0, W, H);
    for (let s = 0; s < rows; s++) {
      const base = (s + 1) * rh - H * 0.03;
      let x = 3;
      while (x < W - 3) {
        const w = 10 + r() * 16, h = rh * (0.62 + r() * 0.28), c = cols[Math.floor(r() * cols.length)];
        ctx.fillStyle = c; ctx.fillRect(x, base - h, Math.min(w - 1.5, W - 3 - x), h);
        ctx.fillStyle = "rgba(201,151,58,.55)"; ctx.fillRect(x + 2, base - h + h * 0.1, Math.max(0, Math.min(w - 5.5, W - 7 - x)), 2);
        ctx.fillRect(x + 2, base - h * 0.18, Math.max(0, Math.min(w - 5.5, W - 7 - x)), 1.5);
        x += w;
        if (r() < 0.05) x += 14 + r() * 10;
      }
      ctx.fillStyle = "#3a2414"; ctx.fillRect(0, base, W, H * 0.03);
    }
    ctx.fillStyle = "#2a1a0e"; ctx.fillRect(0, 0, 3, H); ctx.fillRect(W - 3, 0, 3, H);
  };

  // ---------- its door ----------
  // A cabin's: plank leaves with black iron strap hinges and a ring pull, in a frame of round logs on fieldstone, and
  // an iron lantern glowing on its bracket beside it.
  const door = {
    casing: "#5e5850", frame: "#4a2e1a", header: "#3a2414", word: "#ff9a3c", strip: null, chain: false,
    leaf: "#6b4426", seam: "#2a180c", plate: "#3a2414", face: "#ff9a3c", mark: "#2a180c",
    leafFace(side, H) {
      for (let k = 0; k < 5; k++) { const x0 = -0.75 + k * 0.3; H.rect(x0 + 0.012, 0, x0 + 0.288, H.D, k & 1 ? "#714829" : "#65401f"); }
      for (const y of [0.55, 2.65]) {
        H.rect(H.outer, y - 0.045, H.outer - side * 1.37, y + 0.045, "#1c1c1e", 0.05, 1);
        for (let d = 0.08; d < 1.3; d += 0.22) H.diamond(H.outer - side * d, y, 0.016, "#3a3a3e", 0, 2);
      }
      H.ring(H.inner + side * 0.18, 1.2, 0.09, 0.02, "#1c1c1e", 0.05, 12, 2);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), x = d.W + d.F + 0.12, z = d.Z - 0.16;
    for (const sx of [-1, 1]) K.cyl(0.15, 0.17, d.head + 0.15, "#5a381e", sx * x, (d.head + 0.15) / 2, z, { seg: 10 });
    K.cyl(0.16, 0.16, 2 * x + 0.5, "#5a381e", 0, d.head + 0.2, z, { rz: Math.PI / 2, seg: 10 });
    // The lantern on its bracket, right of the door (the Exit button is on the left).
    K.box(0.32, 0.04, 0.04, C.iron, 2.25, 2.45, d.Z - 0.18);
    K.box(0.22, 0.04, 0.22, C.iron, 2.4, 2.45, d.Z - 0.3);
    K.cyl(0, 0.1, 0.08, C.iron, 2.4, 2.51, d.Z - 0.3, { seg: 4 });
    K.box(0.2, 0.03, 0.2, C.iron, 2.4, 2.16, d.Z - 0.3);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(0.02, 0.28, 0.02, C.iron, 2.4 + dx * 0.09, 2.3, d.Z - 0.3 + dz * 0.09);
    K.box(0.13, 0.2, 0.13, "#ffb04a", 2.4, 2.29, d.Z - 0.3, { emissive: 0.95, glow: true });
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    const r0 = L.r0, D = RM.domeMap(L), e0 = ROOMS.edgeEl(L, 0) / DEG;
    K.wallColor("#2a1c12");
    K.render({ sky: [0.22, 0.24, 0.34], ground: [0.16, 0.1, 0.07], direct: [0.5, 0.42, 0.36], directStrength: 0.12, ambientFloor: 0.26, bloomStrength: 0.75 });
    K.dome((ctx, Dm) => paintNight(ctx, Dm, e0));
    K.floor((ctx, F) => paintFloor(ctx, F, L));
    // Under the floor's picture, a disc of the planks' own brown, so a hairline between its pieces never shows black;
    // Canvas 2D sorts it far back, under the floor.
    K.node(null, (k) => k.sector(0, 0.01, r0 - 0.01, 0, TAU, -0.02, -0.006, "#4a3420", { steps: 48 }), 0, 0, 0, { depthBias: 4 });

    // The fire pit: a ring of stones round the ash, four logs crossed over a bed of embers, the flames and the sparks.
    const sr = RM.paintKit.rng(17);
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU, s = 0.18 + sr() * 0.05;
      K.ball(s, C.stone[i % 3], Math.sin(a) * 0.95, s * 0.5, Math.cos(a) * 0.95, { seg: 6, ry: sr() * TAU });
    }
    K.solid({ x: 0, z: 0, r: 1.15 });
    K.node("embers", (k) => {
      k.cyl(0.62, 0.72, 0.05, "#6a2208", 0, 0.025, 0, { emissive: 1, glow: true, seg: 16 });
      for (let i = 0; i < 9; i++) { const a = sr() * TAU, d = sr() * 0.5; k.box(0.08, 0.05, 0.07, i % 2 ? "#ff8a2a" : "#e0531a", Math.sin(a) * d, 0.06, Math.cos(a) * d, { emissive: 1, glow: true, ry: sr() * TAU }); }
    }, 0, 0, 0, { glow: true, target: { kind: "fire", tip: "Fire pit", radius: 1.1, data: { say: "Pull up a seat by the fire" } } });
    for (let k = 0; k < 4; k++) {
      K.cyl(0.09, 0.09, 1.1, C.log, 0, 0.14, 0, { seg: 8, ry: k * Math.PI / 4, rz: Math.PI / 2 - 0.12 });
      for (const end of [-1, 1]) {
        const a = k * Math.PI / 4, ex = Math.cos(a) * 0.53 * end, ez = -Math.sin(a) * 0.53 * end;
        K.cyl(0.092, 0.092, 0.06, C.char, ex, 0.14 + end * -0.06, ez, { seg: 8, ry: a, rz: Math.PI / 2 - 0.12 });
      }
    }
    FLAMES.forEach(([color, x, z, r, h], i) => K.node(`flame${i}`, (k) => k.cyl(0, r, h, color, 0, h / 2, 0, { emissive: 1, glow: true, seg: 8 }), x, 0.15, z, { glow: true }));
    let spark = (k) => k.ball(0.025, "#ffb050", 0, 0, 0, { emissive: 1, glow: true, seg: 4 });
    for (let i = 0; i < SPARKS; i++) {
      const y = 0.3 + sr() * (SPARK_TOP - 0.3);
      spark = K.node(`spark${i}`, spark, (sr() - 0.5) * 0.5, y, (sr() - 0.5) * 0.5, { glow: true }).geometry;
    }

    // Two curved sofas facing the fire, each a leather frame with arms at its ends, a back cushion and a seat cushion
    // for each of its five seats; the seat cushions are the seats' own nodes, sharing one cushion.
    let cushion = null;
    for (const [a0, a1] of SOFAS) {
      const mid = (SOFA_IN + SOFA_OUT) / 2, armDeg = ARM / mid / DEG;
      K.sector(0, SOFA_IN, SOFA_OUT, a0 * DEG, a1 * DEG, 0, 0.3, C.frame);
      K.sector(0, SOFA_OUT - 0.25, SOFA_OUT, a0 * DEG, a1 * DEG, 0.3, 0.98, C.frame);
      for (const b of [a0 + armDeg / 2, a1 - armDeg / 2]) { const p = polar(mid, b); K.box(ARM, 0.64, SOFA_OUT - SOFA_IN + 0.04, C.leather, p.x, 0.32, p.z, { ry: b * DEG }); }
      const span = (a1 - a0 - 2 * armDeg) / 5, half = (span - 0.5) / 2;
      for (let i = 0; i < 5; i++) {
        const b = a0 + armDeg + span * (i + 0.5), p = polar(SOFA_R, b), seat = K.seat(p.x, p.z, Math.atan2(-p.x, -p.z), SOFA_SEAT, 0, STAND);
        K.sector(0, SOFA_OUT - 0.42, SOFA_OUT - 0.25, (b - half) * DEG, (b + half) * DEG, 0.3, 0.92, C.leather);
        cushion = K.node(null, cushion || ((k) => k.sector(-SOFA_R, SOFA_IN + 0.04, SOFA_OUT - 0.42, -half * DEG, half * DEG, 0.3, 0.44, C.cushion)), p.x, 0, p.z,
          { ry: b * DEG, target: { kind: "chair", tip: "Sofa", radius: 0.6, index: seat.index } }).geometry;
      }
      arcSolids(K, mid, a0, a1, (SOFA_OUT - SOFA_IN) / 2);
    }
    // The armchair at the front, facing the fire across it.
    const arm = polar((SOFA_IN + SOFA_OUT) / 2, 180), armSeat = K.seat(arm.x, arm.z, Math.atan2(-arm.x, -arm.z), SOFA_SEAT, 0, STAND - 0.05);
    K.node("armchair", (k) => {
      k.box(0.92, 0.3, 0.86, C.frame, 0, 0.15, 0);
      k.box(0.62, 0.14, 0.7, C.cushion, 0, 0.37, -0.04);
      k.box(0.92, 0.82, 0.2, C.leather, 0, 0.71, 0.33);
      k.box(0.6, 0.48, 0.1, C.cushion, 0, 0.66, 0.2);
      for (const side of [-1, 1]) { k.box(0.16, 0.36, 0.86, C.leather, side * 0.38, 0.48, 0); k.box(0.12, 0.3, 0.32, C.leather, side * 0.4, 0.97, 0.26); }
    }, arm.x, 0, arm.z, { ry: Math.atan2(arm.x, arm.z), target: { kind: "chair", tip: "Armchair", radius: 0.7, index: armSeat.index } });
    K.solid({ x: arm.x, z: arm.z, r: 0.45 });

    // Side tables at the sofas' ends, each with a mug or a candle; two floor lamps behind the sofas.
    [[25, 4.0], [-25, 4.0], [160, 3.75], [200, 3.75]].forEach(([b, r], i) => {
      const p = polar(r, b);
      K.cyl(0.3, 0.3, 0.05, C.wood, p.x, 0.5, p.z, { seg: 20 });
      K.cyl(0.05, 0.05, 0.5, C.stem, p.x, 0.25, p.z, { seg: 8 });
      K.cyl(0.18, 0.2, 0.03, C.stem, p.x, 0.015, p.z, { seg: 14 });
      if (i % 2) {
        K.cyl(0.05, 0.05, 0.16, "#efe4c8", p.x - 0.06, 0.605, p.z, { seg: 8 });
        K.cyl(0, 0.022, 0.06, "#ffc45a", p.x - 0.06, 0.715, p.z, { seg: 6, emissive: 1, glow: true });
      } else {
        K.cyl(0.06, 0.05, 0.12, C.mug, p.x + 0.1, 0.585, p.z, { seg: 10 });
        K.torus(0.035, 0.01, C.mug, p.x + 0.17, 0.59, p.z, { rx: Math.PI / 2, seg: 8, sides: 4 });
      }
      K.solid({ x: p.x, z: p.z, r: 0.32 });
    });
    for (const b of [90, 270]) {
      const p = polar(LAMP_R, b);
      K.cyl(0.03, 0.03, 1.6, C.iron, p.x, 0.8, p.z, { seg: 8 });
      K.cyl(0.22, 0.24, 0.03, C.iron, p.x, 0.015, p.z, { seg: 16 });
      K.cyl(0.2, 0.3, 0.3, C.shade, p.x, 1.7, p.z, { seg: 16, emissive: 0.85, glow: true });
      K.solid({ x: p.x, z: p.z, r: 0.28 });
    }

    // The low shelf of books along the wall from one side of the doors round to the other: panels of spines in two
    // rows (three paintings shared round), on a plinth under a top board, with candles, plants and a lantern on top.
    const rs = r0 - 0.3, gap = Math.asin(SHELF_GAP / rs) / DEG, arc = 360 - 2 * gap, n = Math.ceil(arc * DEG * rs / 1.2), step = arc / n;
    const pw = 2 * rs * Math.sin(step / 2 * DEG), pr = rs * Math.cos(step / 2 * DEG), books = [11, 12, 13].map((seed) => {
      const canvas = CH.canvas(512, 512);
      paintBooks(seed)(canvas.getContext("2d"), 512, 512);
      return RM.flatPicture(canvas, pw, SHELF_TOP - 0.08);
    });
    for (let i = 0; i < n; i++) {
      const b = gap + step * (i + 0.5), p = polar(pr, b);
      K.node(null, books[i % 3], p.x, (SHELF_TOP + 0.08) / 2, p.z, { ry: b * DEG + Math.PI, glow: true, target: { kind: "books", tip: "Bookshelf", radius: 0.7, data: { say: "A low shelf of books, from the whitepaper on" } } });
    }
    const top = ROOMS.radiusAt(L, SHELF_TOP + 0.06) - 0.06;
    K.sector(0, rs - 0.04, r0 - 0.02, gap * DEG, (360 - gap) * DEG, 0, 0.08, C.plinth);
    K.sector(0, rs - 0.07, top, gap * DEG, (360 - gap) * DEG, SHELF_TOP, SHELF_TOP + 0.06, C.shelf);
    for (const b of [gap, 360 - gap]) { const p = polar(rs + 0.15, b); K.box(0.06, SHELF_TOP + 0.06, 0.4, C.shelf, p.x, (SHELF_TOP + 0.06) / 2, p.z, { ry: b * DEG }); }
    const deco = RM.paintKit.rng(23), onTop = SHELF_TOP + 0.06;
    for (let b = gap + 9; b < 360 - gap - 5; b += 17 + deco() * 9) {
      const p = polar(rs + 0.12, b), kind = Math.floor(deco() * 3);
      if (kind === 0) {
        for (let c = 0; c < 3; c++) { const h = 0.1 + c * 0.05, x = p.x + (c - 1) * 0.07 * Math.cos(b * DEG), z = p.z - (c - 1) * 0.07 * Math.sin(b * DEG); K.cyl(0.03, 0.03, h, "#efe4c8", x, onTop + h / 2, z, { seg: 8 }); K.cyl(0, 0.014, 0.04, "#ffc45a", x, onTop + h + 0.02, z, { seg: 6, emissive: 1, glow: true }); }
      } else if (kind === 1) {
        K.cyl(0.1, 0.075, 0.16, "#7a3a22", p.x, onTop + 0.08, p.z, { seg: 10 });
        for (let l = 0; l < 4; l++) K.ball(0.09 + deco() * 0.04, l % 2 ? "#2f5a2a" : "#3d6b30", p.x + (deco() - 0.5) * 0.14, onTop + 0.22 + deco() * 0.12, p.z + (deco() - 0.5) * 0.14, { seg: 6 });
      } else {
        K.box(0.17, 0.03, 0.17, C.iron, p.x, onTop + 0.015, p.z, { ry: b * DEG });
        K.box(0.13, 0.16, 0.13, "#ffcf7a", p.x, onTop + 0.11, p.z, { ry: b * DEG, emissive: 0.9, glow: true });
        K.box(0.17, 0.03, 0.17, C.iron, p.x, onTop + 0.205, p.z, { ry: b * DEG });
        K.cyl(0, 0.12, 0.07, C.iron, p.x, onTop + 0.255, p.z, { seg: 4, ry: b * DEG + Math.PI / 4 });
      }
    }

    // The latest block, low over the pines at the front, on the sky's own colours.
    const az0 = -9, az1 = 9, el0 = e0 + 18, el1 = e0 + 23, w = 1024;
    const wM = (az1 - az0) * DEG * L.R * Math.cos((el0 + el1) / 2 * DEG), hM = L.R * (Math.sin(el1 * DEG) - Math.sin(el0 * DEG)), h = Math.round(w * hM / wM);
    const skyTop = skyAt(D, el1), skyBottom = skyAt(D, el0);
    K.live({ az0, az1, el0, el1, w, h, tip: "The latest block",
      key: (f, now) => blockKey(f.reader, now), paint: (ctx, f, now) => paintBlock(ctx, f.reader, now, w, h, skyTop, skyBottom) });

    // Point lights: the fire first (`animate` flickers it), the two lamps, and a cool wash of night from above.
    K.light(0, 1.0, 0, 9, 1.0, 0.54, 0.22);
    K.light(LAMP_R, 1.6, 0, 5, 0.8, 0.55, 0.28);
    K.light(-LAMP_R, 1.6, 0, 5, 0.8, 0.55, 0.28);
    K.light(0, L.c + L.R * 0.45, -L.R * 0.3, 14, 0.2, 0.25, 0.4);
  };

  // The fire alive: its flames flickering, its embers glowing, its sparks rising and its light breathing with it.
  const animate = (nodes, built) => {
    const flames = FLAMES.map((_, i) => nodes[`flame${i}`]), embers = nodes.embers, sparks = [];
    for (let i = 0; i < SPARKS; i++) sparks.push(nodes[`spark${i}`]);
    // Each spark's own column (x, z), height, speed and swirl.
    const sx = new Float32Array(SPARKS), sy = new Float32Array(SPARKS), sz = new Float32Array(SPARKS), sv = new Float32Array(SPARKS), sw = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) { const p = sparks[i].position; sx[i] = p.x; sy[i] = p.y; sz[i] = p.z; sv[i] = 0.5 + Math.random() * 0.8; sw[i] = Math.random() * TAU; }
    const fire = built.lights[0];
    return {
      update(dt, t) {
        for (let i = 0; i < flames.length; i++) {
          const f = flames[i], k = 0.75 + 0.35 * Math.abs(Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 3.1 + i));
          f.scale.x = 1 - 0.15 * Math.sin(t * 9 + i); f.scale.y = k; f.scale.z = 1 - 0.15 * Math.cos(t * 8 + i);
          f.rotation.y += dt * (0.4 + i * 0.15);
          f.glow = 0.8 + 0.2 * k;
        }
        embers.glow = 0.7 + 0.2 * Math.sin(t * 2.1) * Math.sin(t * 5.3);
        for (let i = 0; i < SPARKS; i++) {
          let y = sy[i] + sv[i] * dt;
          if (y > SPARK_TOP) { y = 0.3; sx[i] = (Math.random() - 0.5) * 0.5; sz[i] = (Math.random() - 0.5) * 0.5; sv[i] = 0.5 + Math.random() * 0.8; }
          sy[i] = y;
          const n = sparks[i], s = Math.max(0.2, 1 - y / SPARK_TOP);
          n.position.x = sx[i] + Math.sin(y * 2 + sw[i]) * 0.15; n.position.y = y; n.position.z = sz[i] + Math.cos(y * 2 + sw[i]) * 0.15;
          n.scale.x = n.scale.y = n.scale.z = s;
        }
        // The fire's light, the first of the room's, breathing as the mock-up's did.
        const opts = BL.scenes.timechain.renderOpts, lights = opts && opts.lights;
        if (lights && opts.lightCount > 0) {
          const k = 1 + 0.23 * Math.sin(t * 11) * Math.sin(t * 4.3) + 0.05 * Math.sin(t * 17.3);
          lights[4] = fire[4] * k; lights[5] = fire[5] * k; lights[6] = fire[6] * k;
        }
      },
      tap(owner, hud) {
        if (owner.kind !== "live") return false;
        hud.toast("The latest block, from mempool.space, hanging over the pines");
        return true;
      }
    };
  };
  BL.timechainRoomKinds.fireside = { plan, animate, door };
})();
