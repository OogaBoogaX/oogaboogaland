// Room 5, Proof of Work-out: a gym under a sunrise, the joke that explains proof of work (effort in, lottery tickets
// out). The dome is mountains at dawn all round the horizon with the sun rising at the front; over it the gym's
// hashrate in front, a leaderboard of fake blocks found today on the left and how it works on the right, each a patch
// of its own canvas painted once. Three rows of exercise bikes face the sunrise, each a seat with its little screen
// of hashes: the bike the visitor rides turns its cranks and hashes, now and then finding a fake block. Treadmills
// stand along the left wall (a deck to jump up on), a rowing machine and a dumbbell rack on the right, a bench at the
// front right and two yoga mats and exercise balls at the front left.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, ROOMS = BL.timechainRooms, P = RM.paintKit;
  const { box, merge } = BL.models;
  const { cylinder, own } = RM.helpers;
  const C = {
    amber: "#f7931a", amberText: "#ffb04d", white: "#f4efe6", grey: "#a89c8b", frame: "#2b2b2e", black: "#111113", steel: "#8f98a3",
    chrome: "#b8bec6", deck: "#1b1b1e", hood: "#232326", belt: "#35353a", crank: "#3a3a3e", screen: "#15171a", lit: "#3ce07a",
    green: "#5dff95", dim: "#2f8a52", phosphor: "#031006"
  };
  // The bikes' grid, front row first, spaced so the widest Ooga walks between any two and stands up behind its own
  // (`BACK` behind the saddle), and the cadence a ridden bike's cranks turn at (radians a second).
  const BIKE_X = [-5.45, -3.35, -1.25, 1.25, 3.35, 5.45], BIKE_Z = [-2.2, 0.5, 3.2], BIKES = BIKE_X.length * BIKE_Z.length, CADENCE = 6;
  const SADDLE = { y: 0.77, z: 0.18 }, BACK = 1.15;
  // Seats in the order the plan makes them: the bikes, the rowing machine, then the bench's two.
  const ROW_SEAT = BIKES;
  const ROWER = { x: 8, z: -1.2 }, RACK = { x: 7.6, z: 3.4 }, BENCH = { x: 8.6 * Math.sin(140 * P.DEG), z: 8.6 * Math.cos(140 * P.DEG) };
  const TREAD_X = -8.2, TREAD_Z = [-2.6, 0.2, 3];
  const headingTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

  // ---------- the machines, each in its own frame, its front toward -z ----------
  // A part turned about x, then about z first (three.js's order), and moved by (dx, y, z).
  const turned = (geo, rx, rz, y, z, dx = 0) => {
    const cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz), v = geo.verts;
    for (let i = 0; i < v.length; i += 3) {
      const x0 = v[i] * cz - v[i + 1] * sz, y0 = v[i] * sz + v[i + 1] * cz, z0 = v[i + 2];
      v[i] = x0 + dx; v[i + 1] = y0 * cx - z0 * sx + y; v[i + 2] = y0 * sx + z0 * cx + z;
    }
    return geo;
  };
  const AXLE = Math.PI / 2;
  // An upright bike: base and feet, amber seat post and stem, saddle, handlebar with grips, the flywheel and the
  // console its screen sits in.
  const bike = own(() => merge(
    box({ w: 0.5, h: 0.06, d: 1.1, color: C.frame, offset: { y: 0.03 } }),
    ...[-1, 1].map((s) => box({ w: 0.64, h: 0.05, d: 0.08, color: C.frame, offset: { y: 0.025, z: s * 0.5 } })),
    box({ w: 0.08, h: 0.7, d: 0.08, color: C.amber, offset: { y: 0.38, z: 0.15 } }),
    box({ w: 0.24, h: 0.06, d: 0.3, color: C.black, offset: { y: SADDLE.y - 0.03, z: SADDLE.z } }),
    turned(box({ w: 0.08, h: 0.86, d: 0.08, color: C.amber }), -0.2, 0, 0.46, -0.36),
    box({ w: 0.5, h: 0.05, d: 0.06, color: C.black, offset: { y: 0.95, z: -0.47 } }),
    ...[-1, 1].map((s) => box({ w: 0.06, h: 0.06, d: 0.16, color: C.black, offset: { x: s * 0.22, y: 0.95, z: -0.4 } })),
    turned(cylinder(0.25, 0.25, 0.06, C.chrome, 20), 0, AXLE, 0.32, -0.38),
    turned(cylinder(0.08, 0.08, 0.08, C.frame, 12), 0, AXLE, 0.32, -0.38),
    turned(box({ w: 0.22, h: 0.14, d: 0.04, color: C.screen }), -0.35, 0, 1.03, -0.42)
  ));
  // The crank, turning about x on its own node: the axle, a chainring and the two arms with their pedals, opposite.
  const crank = own(() => merge(
    box({ w: 0.3, h: 0.04, d: 0.04, color: C.crank }),
    turned(cylinder(0.1, 0.1, 0.02, C.crank, 14), 0, AXLE, 0, 0, 0.11),
    box({ w: 0.04, h: 0.17, d: 0.04, color: C.crank, offset: { x: 0.14, y: 0.085 } }),
    box({ w: 0.04, h: 0.17, d: 0.04, color: C.crank, offset: { x: -0.14, y: -0.085 } }),
    box({ w: 0.1, h: 0.025, d: 0.08, color: C.black, offset: { x: 0.2, y: 0.17 } }),
    box({ w: 0.1, h: 0.025, d: 0.08, color: C.black, offset: { x: -0.2, y: -0.17 } })
  ));
  // A treadmill: deck and belt with amber edges, the motor hood, uprights, side bars and its console with a lit screen.
  const treadmill = own(() => merge(
    box({ w: 0.8, h: 0.18, d: 1.9, color: C.deck, offset: { y: 0.09 } }),
    box({ w: 0.66, h: 0.012, d: 1.55, color: C.belt, offset: { y: 0.186, z: 0.12 } }),
    ...[-1, 1].map((s) => box({ w: 0.05, h: 0.02, d: 1.6, color: C.amber, offset: { x: s * 0.37, y: 0.19, z: 0.1 } })),
    box({ w: 0.82, h: 0.22, d: 0.3, color: C.hood, offset: { y: 0.11, z: -0.82 } }),
    ...[-1, 1].map((s) => box({ w: 0.06, h: 1, d: 0.06, color: C.steel, offset: { x: s * 0.36, y: 0.7, z: -0.85 } })),
    ...[-1, 1].map((s) => box({ w: 0.04, h: 0.04, d: 0.5, color: C.steel, offset: { x: s * 0.36, y: 1.02, z: -0.62 } })),
    turned(box({ w: 0.8, h: 0.25, d: 0.12, color: C.frame }), -0.4, 0, 1.2, -0.9),
    turned(box({ w: 0.32, h: 0.13, d: 0.012, color: C.lit, emissive: 0.9 }), -0.4, 0, 1.223, -0.838)
  ));
  // The rowing machine: its rail on a back leg, the flywheel's housing with its round sides and a monitor on an arm,
  // footrests and the seat.
  const rower = own(() => merge(
    box({ w: 0.16, h: 0.08, d: 2.3, color: C.steel, offset: { y: 0.26 } }),
    box({ w: 0.44, h: 0.22, d: 0.08, color: C.frame, offset: { y: 0.11, z: 1.05 } }),
    box({ w: 0.5, h: 0.5, d: 0.4, color: C.deck, offset: { y: 0.3, z: -1.2 } }),
    ...[-1, 1].map((s) => turned(cylinder(0.2, 0.2, 0.02, C.frame, 16), 0, AXLE, 0.32, -1.2, s * 0.26)),
    box({ w: 0.04, h: 0.5, d: 0.04, color: C.steel, offset: { y: 0.8, z: -1.12 } }),
    turned(box({ w: 0.22, h: 0.15, d: 0.04, color: C.screen }), -0.3, 0, 1.08, -1.08),
    turned(box({ w: 0.18, h: 0.11, d: 0.01, color: C.lit, emissive: 0.85 }), -0.3, 0, 1.087, -1.056),
    ...[-1, 1].map((s) => turned(box({ w: 0.14, h: 0.04, d: 0.26, color: C.black }), 0.6, 0, 0.36, -0.75, s * 0.14)),
    box({ w: 0.4, h: 0.08, d: 0.36, color: C.black, offset: { y: 0.34, z: 0.3 } })
  ));
  const rowHandle = own(() => box({ w: 0.5, h: 0.04, d: 0.05, color: C.black }));
  // The bench's padded halves, a seat each, on its frame.
  const benchPad = own(() => box({ w: 0.78, h: 0.1, d: 0.42, color: C.frame }));

  // ---------- the bikes' screens ----------
  // Two pictures every bike shares: idle (PEDAL TO HASH) and hashing, the one repainted while anyone rides, its
  // hashes scrolling and now and then a fake block found. The hashes are written once, so a repaint allocates nothing.
  const SCREEN = { w: 0.2, h: 0.12, pw: 192, ph: 116 };
  const HASHES = (() => {
    const r = P.rng(77), hex = "0123456789abcdef", out = [];
    for (let i = 0; i < 48; i++) {
      let s = i % 24 === 23 ? "0000000" : "";
      while (s.length < 12) s += hex[Math.floor(r() * 16)];
      out.push(s + "…");
    }
    return out;
  })();
  const HASH_FONT = P.font(500, 15, P.MONO);
  // The hashing screen: four hashes from `line` on and a bar of tries toward the next block, or a found block's flash.
  const paintHashing = (c, line, bar, found) => {
    const W = SCREEN.pw, H = SCREEN.ph;
    c.fillStyle = found ? "#3a2405" : C.phosphor; c.fillRect(0, 0, W, H);
    if (found) {
      P.pix(c, "FAKE BLOCK", W / 2, 40, 18, C.amberText);
      P.pix(c, "FOUND!", W / 2, 74, 26, C.amberText);
      return;
    }
    P.pix(c, "HASHING", 10, 14, 11, C.amberText, "left");
    c.font = HASH_FONT; c.textAlign = "left"; c.textBaseline = "middle";
    for (let k = 0; k < 4; k++) { c.fillStyle = k === 3 ? C.green : C.dim; c.fillText(HASHES[(line + k) % HASHES.length], 10, 34 + k * 17); }
    c.fillStyle = "#103a1d"; c.fillRect(10, H - 12, W - 20, 6);
    c.fillStyle = C.green; c.fillRect(10, H - 12, (W - 20) * bar, 6);
  };
  const screens = own(() => {
    const idle = BL.timechainCharts.canvas(SCREEN.pw, SCREEN.ph), active = BL.timechainCharts.canvas(SCREEN.pw, SCREEN.ph), c = idle.getContext("2d");
    c.fillStyle = C.phosphor; c.fillRect(0, 0, SCREEN.pw, SCREEN.ph);
    c.fillStyle = "rgba(93,255,149,.07)"; c.fillRect(6, 6, SCREEN.pw - 12, SCREEN.ph - 12);
    P.pix(c, "PEDAL", SCREEN.pw / 2, 36, 22, C.green);
    P.pix(c, "TO HASH", SCREEN.pw / 2, 68, 22, C.green);
    P.pix(c, "0 H/S", SCREEN.pw / 2, 98, 12, C.dim);
    paintHashing(active.getContext("2d"), 0, 0, false);
    return { idle: RM.flatPicture(idle, SCREEN.w, SCREEN.h, 0.95), active: RM.flatPicture(active, SCREEN.w, SCREEN.h, 0.95) };
  });

  // ---------- the dome's panels ----------
  // A panel's frame and title, as the charts draw theirs; returns the box inside it for its content.
  const panelFrame = (ctx, W, H, title) => {
    const u = H / 100, p = Math.max(6, u * 3.4);
    ctx.fillStyle = "#0f0d0b"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.amber; ctx.lineWidth = Math.max(3, u * 0.9); P.roundRect(ctx, p * 0.5, p * 0.5, W - p, H - p, u * 3); ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.amberText; P.fit(ctx, title, W - p * 4, 700, u * 10.5); ctx.fillText(title, p * 2, p * 1.4 + u * 10);
    ctx.fillStyle = "rgba(247,147,26,.32)"; ctx.fillRect(p * 2, p * 1.4 + u * 14, W - p * 4, Math.max(2, u * 0.4));
    return { x: p * 2, y: p * 1.4 + u * 18, w: W - p * 4, h: H - (p * 1.4 + u * 18) - p * 1.8, u };
  };
  // A titled panel of rows: a line, and a value right-aligned after it when the row has one.
  const textPanel = (ctx, W, H, title, rows, o = {}) => {
    const b = panelFrame(ctx, W, H, title), rh = b.h / rows.length;
    rows.forEach(([left, right, color], i) => {
      const y = b.y + rh * (i + 0.72), px = Math.min(rh * 0.62, b.u * (o.size || 8));
      ctx.textAlign = "left"; ctx.fillStyle = color || C.white; P.fit(ctx, left, right ? b.w * 0.7 : b.w, o.weight || 500, px, o.family || P.FONT); ctx.fillText(left, b.x, y);
      if (right) { ctx.textAlign = "right"; ctx.fillStyle = color || C.amberText; ctx.font = P.font(600, px, P.MONO); ctx.fillText(right, b.x + b.w, y); }
    });
  };
  // Pixels tall for a patch `w` wide, so its picture keeps its shape on the dome.
  const patchH = (w, az0, az1, el0, el1) => Math.round(w * (el1 - el0) / (Math.cos((el0 + el1) / 2 * P.DEG) * (az1 - az0)));
  const gymPanel = (ctx, W, H) => {
    const b = panelFrame(ctx, W, H, "GYM HASHRATE"), u = b.u;
    ctx.fillStyle = C.white; ctx.font = P.font(600, u * 26, P.MONO); ctx.fillText("1,284 H/s", b.x, b.y + u * 26);
    ctx.fillStyle = C.grey; ctx.font = P.font(500, u * 7); ctx.fillText("difficulty: 2 legs · next fake block in about 0:42", b.x, b.y + u * 40);
    ctx.fillStyle = "#2b2520"; P.roundRect(ctx, b.x, b.y + u * 48, b.w, u * 9, u * 4.5); ctx.fill();
    ctx.fillStyle = C.amber; P.roundRect(ctx, b.x, b.y + u * 48, b.w * 0.64, u * 9, u * 4.5); ctx.fill();
  };
  const BOARD = [["1  BIG LEGS", "7"], ["2  OOGA 12", "5"], ["3  SPIN CYCLE", "4"], ["4  HODL HAMSTRING", "3"], ["5  LOW FEE LARRY", "1"], ["6  SANI", "0 · on a break", C.grey]];
  const HOW = [["1  Pedal"], ["2  Every crank turn tries a hash"], ["3  A hash under the target"], ["    finds a fake block"], ["4  More legs, more tries:", null, C.amberText], ["    that's proof of work", null, C.amberText]];

  // ---------- its door ----------
  // A gym's fire door: brushed steel leaves with a push bar, a wired-glass window and hazard-striped kick plates, in a
  // black rubber frame striped yellow and black.
  const door = {
    casing: "#3a3f45", frame: "#111317", header: "#111317", word: "#3cff7a", strip: "#3cff7a", chain: false,
    leaf: "#8d949c", seam: "#2b2f34", plate: "#111317", face: "#3cff7a", mark: "#111317",
    leafFace(side, H) {
      for (let y = 0.4; y < 3.1; y += 0.12) H.rect(-0.75, y, 0.75, y + 0.004, "#9aa1a9");
      H.rect(-0.62, 0.98, 0.62, 1.1, "#2b2f34", 0, 1);
      H.rect(-0.6, 1.07, 0.6, 1.1, "#c9ccd2", 0.2, 2);
      H.rect(-0.25, 2.1, 0.25, 2.75, "#22343c", 0.25, 1);
      for (let k = 1; k < 4; k++) H.rect(-0.25 + k * 0.125 - 0.004, 2.1, -0.25 + k * 0.125 + 0.004, 2.75, "#7a8a90", 0.2, 2);
      for (let k = 1; k < 5; k++) H.rect(-0.25, 2.1 + k * 0.13 - 0.004, 0.25, 2.1 + k * 0.13 + 0.004, "#7a8a90", 0.2, 2);
      H.rect(-0.75, 0.04, 0.75, 0.32, "#151515", 0, 1);
      for (let k = 0; k < 10; k++) H.rect(-0.75 + k * 0.15, 0.04, -0.75 + k * 0.15 + 0.075, 0.32, "#f2c230", 0.15, 2);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), x = d.W + d.F / 2, z = d.Z - 0.125;
    for (const sx of [-1, 1]) for (let y = 0.1; y < d.D; y += 0.36) K.box(d.F, 0.16, 0.012, "#f2c230", sx * x, y + 0.08, z, { emissive: 0.15 });
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    const e0 = ROOMS.edgeEl(L, 0) / P.DEG;
    K.wallColor("#1f1d24");
    K.render({ sky: [0.62, 0.52, 0.5], ground: [0.26, 0.21, 0.2], ambientFloor: 0.44, bloomStrength: 0.6 });
    // The dome: dawn over mountains, the sun rising at the front, the last stars fading at the crown.
    K.dome((ctx, D) => {
      D.sky(ctx, [[90, "#1b2a5a"], [40, "#5a5a9a"], [18, "#d9887a"], [6, "#f7b27a"], [0, "#ffd39a"], [-10, "#ffd39a"]]);
      D.stars(ctx, 52, 70, 5, "255,240,225");
      const haze = ctx.createLinearGradient(0, D.y(e0 + 12), 0, D.y(e0));
      haze.addColorStop(0, "rgba(255,214,160,0)"); haze.addColorStop(1, "rgba(255,214,160,.35)");
      ctx.fillStyle = haze; ctx.fillRect(0, D.y(e0 + 12), D.W, D.y(e0) - D.y(e0 + 12));
      // The sun: a wide glow and its disc, round on the dome.
      const sunEl = e0 + 6, m = D.perY(sunEl);
      ctx.save(); ctx.translate(D.x(0), D.y(sunEl)); ctx.scale(D.perX(sunEl) / m, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 6 * m);
      g.addColorStop(0, "rgba(255,240,200,1)"); g.addColorStop(0.18, "rgba(255,214,150,.85)"); g.addColorStop(1, "rgba(255,190,120,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 6 * m, 0, P.TAU); ctx.fill();
      ctx.fillStyle = "#fff6e0"; ctx.beginPath(); ctx.arc(0, 0, 1.1 * m, 0, P.TAU); ctx.fill();
      ctx.restore();
      // A few birds crossing the dawn.
      const r = P.rng(31);
      ctx.strokeStyle = "rgba(40,30,60,.7)"; ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const az = (r() < 0.5 ? -1 : 1) * (20 + r() * 110), el = e0 + 18 + r() * 14, x = D.x(az), y = D.y(el), s = 0.35 * D.perX(el);
        ctx.beginPath(); ctx.moveTo(x - s, y - s * 0.3); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s, y - s * 0.3); ctx.stroke();
      }
      // Three ranges of mountains, palest furthest, all the way round (whole waves, so they meet over the door).
      [["#7a6fa8", 14, 0], ["#4f4780", 10, 1.7], ["#2c2850", 6.5, 3.1]].forEach(([color, amp, ph]) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, D.H);
        for (let x = 0; x <= D.W; x += 4) {
          const a = (x / D.W * 360 - 180) * P.DEG, h = e0 + 1.5 + amp * (0.55 + 0.28 * Math.sin(a * 3 + ph) + 0.18 * Math.sin(a * 7 + ph * 2) + 0.1 * Math.sin(a * 17 + ph));
          ctx.lineTo(x, D.y(h));
        }
        ctx.lineTo(D.W, D.H); ctx.closePath(); ctx.fill();
      });
    });
    // The panels, each painted once: the gym's hashrate up front, the leaderboard on the left, how it works on the right,
    // no bigger than the charts' panels, so Canvas 2D's shaded-picture cache holds all three at once.
    const panel = (az0, az1, el0, el1, w, tip, paint) => {
      const h = patchH(w, az0, az1, el0, el1);
      K.live({ az0, az1, el0, el1, w, h, tip, key: () => "painted", paint: (ctx) => paint(ctx, w, h) });
    };
    panel(-24, 24, e0 + 15, e0 + 33, 1024, "Gym hashrate · every crank turn tries a hash", gymPanel);
    panel(-88, -42, e0 + 10, e0 + 34, 768, "Fake blocks found today", (ctx, w, h) => textPanel(ctx, w, h, "FAKE BLOCKS FOUND TODAY", BOARD, { family: P.MONO, weight: 600 }));
    panel(42, 88, e0 + 10, e0 + 34, 768, "How proof of work-out works", (ctx, w, h) => textPanel(ctx, w, h, "HOW IT WORKS", HOW));
    // The floor: speckled rubber tiles a metre square, the chain from the doors down the middle aisle.
    K.floor((ctx, F) => {
      const r = F.rng(14), specks = ["rgba(247,147,26,.35)", "rgba(80,140,240,.3)", "rgba(220,220,220,.2)"];
      ctx.fillStyle = "#1c1e21"; ctx.fillRect(0, 0, F.N, F.N);
      for (let i = 0; i < 7000; i++) { ctx.fillStyle = specks[i % 3]; ctx.fillRect(r() * F.N, r() * F.N, 2.5, 2.5); }
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 3;
      for (let v = Math.ceil(-F.rf); v < F.rf; v++) {
        ctx.beginPath(); ctx.moveTo(F.X(v), 0); ctx.lineTo(F.X(v), F.N); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, F.Y(v)); ctx.lineTo(F.N, F.Y(v)); ctx.stroke();
      }
      F.path(0, L.doorZ, 0, -3.6);
    });

    // The bikes, a seat each on the saddle, facing the sunrise; standing up leaves the rider behind the bike.
    const pictures = screens();
    let i = 0;
    for (const z of BIKE_Z) for (const x of BIKE_X) {
      const seat = K.seat(x, z + SADDLE.z, Math.PI, SADDLE.y, 0, BACK);
      K.node("bike" + i, bike(), x, 0, z, { target: { kind: "chair", tip: "Exercise bike", radius: 0.8, index: seat.index } });
      K.node("crank" + i, crank(), 0, 0.33, 0.05, { parent: "bike" + i, rx: i * 0.9 });
      K.node("screen" + i, pictures.idle, 0, 1.045, -0.395, { parent: "bike" + i, rx: -0.35, glow: true });
      K.solid({ x, z, hx: 0.28, hz: 0.56 });
      i++;
    }
    // The hashing picture, kept with the room's geometry (hidden here) for the first bike ridden.
    K.node("hashing", pictures.active, 0, -2, 0, { glow: true });
    // The rowing machine on the right, a seat facing the front.
    K.seat(ROWER.x, ROWER.z + 0.3, Math.PI, 0.38, 0, 1.9);
    K.node("rower", rower(), ROWER.x, 0, ROWER.z, { target: { kind: "chair", tip: "Rowing machine", radius: 1, index: ROW_SEAT } });
    K.node("rowHandle", rowHandle(), 0, 0.55, -0.95, { parent: "rower" });
    K.solid({ x: ROWER.x, z: ROWER.z - 0.13, hx: 0.3, hz: 1.3 });
    // The treadmills along the left wall: a deck to jump up and stand on, the console's end in the way.
    for (const z of TREAD_Z) {
      K.node(null, treadmill(), TREAD_X, 0, z, { target: { kind: "treadmill", tip: "Treadmill · jump up on the deck", radius: 1.1, data: { say: "Treadmill · running finds no blocks here, only pedalling does" } } });
      K.solid({ x: TREAD_X, z: z + 0.12, hx: 0.42, hz: 0.82, top: 0.2 });
      K.solid({ x: TREAD_X, z: z - 0.82, hx: 0.42, hz: 0.18 });
    }
    // The dumbbell rack on the right, turned to the middle: two shelves of six pairs, lightest first.
    const rack = K.group(RACK.x, 0, RACK.z, headingTo(RACK.x, RACK.z, 0, 0));
    for (const y of [0.55, 0.95]) rack.box(2.2, 0.06, 0.5, C.frame, 0, y, 0);
    for (const s of [-1, 1]) rack.box(0.06, 1, 0.5, C.frame, s * 1.07, 0.5, 0);
    rack.box(2.2, 0.04, 0.02, C.amber, 0, 0.15, -0.24);
    for (let k = 0; k < 6; k++) for (const y of [0.58, 0.98]) {
      const x = -0.9 + k * 0.36, r = 0.07 + k * 0.012;
      rack.box(0.22, 0.035, 0.035, C.steel, x, y + r, 0);
      for (const s of [-1, 1]) rack.cyl(r, r, 0.06, C.black, x + s * 0.11, y + r, 0, { rz: AXLE, seg: 12 });
    }
    rack.solid({ x: 0, z: 0, hx: 1.12, hz: 0.28 });
    // The bench at the front right, turned to the middle, its two pads seats, an energy drink glowing at its end.
    const benchYaw = headingTo(BENCH.x, BENCH.z, 0, 0), bench = K.group(BENCH.x, 0, BENCH.z, benchYaw);
    bench.box(1.5, 0.04, 0.06, C.steel, 0, 0.06, 0);
    for (const s of [-1, 1]) bench.box(0.08, 0.37, 0.34, C.steel, s * 0.62, 0.185, 0);
    bench.cyl(0.035, 0.03, 0.12, "#f2a52c", 0.68, 0.53, 0, { emissive: 0.9, glow: true, seg: 10 });
    for (const s of [-1, 1]) {
      const seat = bench.seat(s * 0.39, 0, Math.PI, 0.47, 0, 1.1), p = bench.at(s * 0.39, 0.42, 0);
      K.node(null, benchPad(), p.x, p.y, p.z, { ry: benchYaw, target: { kind: "chair", tip: "Bench", radius: 0.5, index: seat.index } });
    }
    bench.solid({ x: 0, z: 0, hx: 0.82, hz: 0.24 });
    // The stretching corner at the front left: two yoga mats toward the sun and two exercise balls.
    K.box(0.62, 0.012, 1.8, "#3a6b8a", -4.4, 0.006, -6.4);
    K.box(0.62, 0.012, 1.8, "#8a3a5a", -3.4, 0.006, -6.7);
    for (const [x, z, color] of [[-6.1, -5.5, "#3d7fd9"], [-6.7, -4.4, "#d9663d"]]) { K.ball(0.33, color, x, 0.33, z, { seg: 16 }); K.solid({ x, z, r: 0.36 }); }
    // Point lights: the sunrise's warm wash at the front, the dome's glow, the bikes, the two walls of machines, a fill.
    K.light(0, 4, -8, 16, 1, 0.72, 0.48);
    K.light(0, 9, -4, 20, 0.8, 0.58, 0.35);
    K.light(0, 4.5, 0.6, 9, 0.75, 0.62, 0.5);
    K.light(-7.5, 3.5, 0.2, 7, 0.6, 0.5, 0.42);
    K.light(7.5, 3.5, 0.6, 7, 0.6, 0.5, 0.42);
    K.light(3.6, 7, 4.8, 12, 0.55, 0.52, 0.5);
  };

  // What moves: a ridden bike's cranks and its screen hashing, and the rower's handle while someone rows.
  const animate = (nodes, built) => {
    const pictures = screens(), canvas = pictures.active.imageSurface.canvas.getContext("2d"), bikes = [];
    for (let i = 0; i < BIKES; i++) bikes.push({ crank: nodes["crank" + i], screen: nodes["screen" + i], seat: built.seats[i], on: false });
    nodes.hashing.visible = false;
    const handle = nodes.rowHandle, rowSeat = built.seats[ROW_SEAT];
    // The hashing screen moves on a line every quarter second; a fake block turns up every 24 lines of pedalling
    // and shows for ten.
    let tick = 0, line = 0, flash = 0, row = 0;
    return {
      update(dt) {
        let riding = false;
        for (let i = 0; i < bikes.length; i++) {
          const b = bikes[i], on = !!b.seat.sitter;
          if (on !== b.on) { b.on = on; b.screen.geometry = on ? pictures.active : pictures.idle; }
          if (on) { b.crank.rotation.x -= dt * CADENCE; riding = true; }
        }
        if (riding) {
          tick += dt;
          if (tick >= 0.25) {
            tick -= 0.25;
            if (flash > 0) flash--;
            else if (++line % 24 === 0) flash = 10;
            paintHashing(canvas, line, (line % 24) / 24, flash > 0);
            pictures.active.imageSurface.version++;
          }
        }
        // The rower's handle: pulled to the chest and let back while the seat is taken, home otherwise.
        row = rowSeat.sitter ? row + dt * 2.2 : 0;
        handle.position.z = -0.95 + 0.7 * (0.5 - 0.5 * Math.cos(row));
      }
    };
  };
  BL.timechainRoomKinds.workout = { plan, animate, door };
})();
