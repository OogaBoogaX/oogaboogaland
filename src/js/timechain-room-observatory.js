// Room 6, the Observatory: the dome drawn as a real observatory's, steel panels between ribs, its shutters folded
// back from a slit open to the night sky in front, where the telescope points. Through the slit is the real sky over
// London, the Planetarium's stars on a node turned by the sidereal time and cut to the slit, so what shows there is
// what stands in the north now. The big telescope on its German equatorial mount stands in the middle, its polar
// axis on the pole; every so often it slews to another target along the slit and tracks it, turning about its own
// axes. Two views through its eyepiece float on the dome either side, Saturn and the Moon. A step stands at the
// eyepiece, a star-chart desk works by the light of a red lamp, and three stools wait their turn.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, ROOMS = BL.timechainRooms;
  const { box, merge } = BL.models;
  const { face, blank, own, perRoom } = RM.helpers;
  const { rng, pix, font, FONT, MONO, TAU } = RM.paintKit;
  const DEG = ROOMS.DEG, AMBER = "#f7931a";
  const C = { white: "#e4e6ea", black: "#1c1e22", steel: "#6a707a", rib: "#2a2e35", rail: "#363b43", frame: "#24282e", red: "#c0392b" };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- the dome's steel and its slit ----------
  // The slit: straight-sided across the dome in front (the planes x = ±`open`), from the screen's edge to `top`
  // degrees up; the shutters folded back either side of it out to x = ±`frame`, which runs on over the crown.
  const SLIT = { open: 1.6, frame: 2.6, top: 80 };
  // How far round from the front (degrees) the plane x = w meets the dome at elevation `el`.
  const sideAz = (L, w, el) => Math.asin(Math.min(1, w / (L.R * Math.cos(el * DEG)))) / DEG;
  // Where the frame's edge ends over the crown, and where the ribs stop under it.
  const crownEl = (L) => Math.acos(SLIT.frame / L.R) / DEG;
  // A beam along the dome's inside through `pts` (room points on the sphere), `w` across and standing `d` in from it:
  // its inner face and two sides, a quad each a length.
  const beam = (geo, L, pts, w, d, color, emissive = 0) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const p = pts[k], q = pts[k + 1], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2 - L.c, mz = (p[2] + q[2]) / 2, ml = Math.hypot(mx, my, mz);
      const n = [-mx / ml, -my / ml, -mz / ml], tx = q[0] - p[0], ty = q[1] - p[1], tz = q[2] - p[2];
      let sx = ty * n[2] - tz * n[1], sy = tz * n[0] - tx * n[2], sz = tx * n[1] - ty * n[0];
      const sl = Math.hypot(sx, sy, sz); sx *= w / 2 / sl; sy *= w / 2 / sl; sz *= w / 2 / sl;
      const at = (o, side, inward) => [o[0] + sx * side + n[0] * inward, o[1] + sy * side + n[1] * inward, o[2] + sz * side + n[2] * inward];
      face(geo, [at(p, -1, d), at(p, 1, d), at(q, 1, d), at(q, -1, d)], color, emissive, n);
      for (const side of [-1, 1]) face(geo, [at(p, side, 0), at(p, side, d), at(q, side, d), at(q, side, 0)], color, emissive, [sx * side, sy * side, sz * side]);
    }
  };
  const on = (L, az, el, inset = 0.998) => { const p = ROOMS.onSphere(L, az * DEG, el * DEG, inset); return [p.x, p.y, p.z]; };
  // The ribs every ten degrees from the screen's edge up to the slit's frame (or, behind, to the ring under the
  // crown), the ring itself over the back, the frame's edge girders and the slit's own, its top beam, and an amber
  // line down each side of the opening.
  const steelwork = perRoom((id) => {
    const L = ROOMS.layout(id), body = blank(), glow = blank(), e0 = ROOMS.edgeEl(L, 0) / DEG, top = crownEl(L);
    for (let az = -170; az <= 180; az += 10) {
      const s = Math.abs(Math.sin(az * DEG)), front = Math.abs(az) < 90;
      if (front && L.R * Math.cos(e0 * DEG) * s <= SLIT.frame) continue;
      const end = front ? Math.min(top, Math.acos(SLIT.frame / (L.R * s)) / DEG) : top, pts = [];
      for (let k = 0, n = Math.max(2, Math.ceil((end - e0) / 5)); k <= n; k++) pts.push(on(L, az, e0 + (end - e0) * k / n));
      beam(body, L, pts, 0.16, 0.2, C.rib);
    }
    const ring = [];
    for (let az = 90; az <= 270; az += 6) ring.push(on(L, az, top));
    beam(body, L, ring, 0.2, 0.24, C.rib);
    for (const side of [-1, 1]) {
      const outer = [], inner = [], line = [];
      for (let el = e0; el <= top + 1e-6; el += (top - e0) / 30) outer.push(on(L, side * sideAz(L, SLIT.frame - 0.12, el), el));
      for (let el = e0; el <= SLIT.top + 1e-6; el += (SLIT.top - e0) / 32) {
        inner.push(on(L, side * sideAz(L, SLIT.open + 0.12, el), el));
        line.push(on(L, side * sideAz(L, SLIT.open + 0.01, el), el, 0.996));
      }
      beam(body, L, outer, 0.24, 0.26, C.rail);
      beam(body, L, inner, 0.24, 0.32, C.rail);
      beam(glow, L, line, 0.03, 0.33, AMBER, 0.9);
    }
    const lid = [], half = sideAz(L, SLIT.open + 0.24, SLIT.top);
    for (let k = 0; k <= 12; k++) lid.push(on(L, -half + 2 * half * k / 12, SLIT.top + 0.6));
    beam(body, L, lid, 0.3, 0.32, C.rail);
    return { body, glow };
  });

  // ---------- the telescope ----------
  // The mock-up's telescope about the mount's head: the tube 0.55 m to the side of the polar axis and pointing 50
  // degrees up over the north, the eyepiece out of its side near the bottom, the counterweights the other way.
  const HEAD = 1.95, ALT = 50 * DEG, SIDE = 0.55, DIR = [0, Math.sin(ALT), -Math.cos(ALT)];
  const along = (k) => [SIDE + DIR[0] * k, DIR[1] * k, DIR[2] * k];
  const EYE = [SIDE + 0.45, DIR[1] * -0.5, DIR[2] * -0.5];
  // The targets it slews between along the slit (declination turned about its own axis, hour angle about the polar
  // one, radians from where it was built pointing) and what it tracks there.
  const TARGETS = [
    { dec: 0, ha: 0, name: "Saturn", say: "its view through the eyepiece floats on the east of the dome" },
    { dec: 0.2, ha: -0.03, name: "the Moon", say: "its view through the eyepiece floats on the west of the dome" },
    { dec: 0.34, ha: 0.02, name: "the Double Cluster in Perseus", say: "two star clusters side by side" },
    { dec: -0.16, ha: -0.02, name: "Mizar and Alcor", say: "the double star in the Plough's handle" },
    { dec: 0.12, ha: 0.03, name: "the Andromeda Galaxy", say: "two and a half million light years away" }
  ];
  // Seconds on a target and slewing to the next; the tracking drive's turn (radians a second), ten times the sky's own
  // so the drive is seen to move.
  const DWELL = 32, SLEW = 9, TRACK = 0.0007;
  // The eyepiece views: a round field in a dark mount, the planet or the Moon in it, and what it is under it.
  const eyepiece = (ctx, W, H, kind) => {
    const cx = W / 2, cy = H * 0.52, rr = H * 0.36;
    ctx.fillStyle = "#0b0b0d"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#3a3f46"; ctx.lineWidth = H * 0.02; ctx.beginPath(); ctx.arc(cx, cy, rr + H * 0.02, 0, TAU); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.clip(); ctx.fillStyle = "#020306"; ctx.fillRect(0, 0, W, H);
    const r = rng(kind === "saturn" ? 3 : 4);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < 30; i++) ctx.fillRect(cx + (r() - 0.5) * 2 * rr, cy + (r() - 0.5) * 2 * rr, 2, 2);
    if (kind === "saturn") {
      const pr = rr * 0.3;
      const ring = (front) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.28);
        ctx.strokeStyle = "#cdb88a"; ctx.lineWidth = pr * 0.32; ctx.beginPath(); ctx.ellipse(0, 0, pr * 2.1, pr * 0.62, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(120,100,70,.8)"; ctx.lineWidth = pr * 0.05; ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.95, pr * 0.57, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
        ctx.restore();
      };
      ring(false);
      const g = ctx.createLinearGradient(cx, cy - pr, cx, cy + pr);
      g.addColorStop(0, "#c9a86a"); g.addColorStop(0.4, "#e8d3a2"); g.addColorStop(0.6, "#d6b27a"); g.addColorStop(1, "#8a6a3a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
      ring(true);
    } else {
      const mr = rr * 0.72;
      ctx.fillStyle = "#1c1c1f"; ctx.beginPath(); ctx.arc(cx, cy, mr, 0, TAU); ctx.fill();
      ctx.fillStyle = "#dcd8cc"; ctx.beginPath(); ctx.arc(cx, cy, mr, -Math.PI / 2, Math.PI / 2); ctx.fill();
      ctx.fillStyle = "#1c1c1f"; ctx.beginPath(); ctx.ellipse(cx, cy, mr * 0.22, mr, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(120,116,104,.6)";
      for (const [dx, dy, s] of [[0.5, -0.3, 0.12], [0.62, 0.2, 0.09], [0.38, 0.45, 0.07], [0.7, -0.05, 0.05], [0.42, 0.05, 0.06]]) { ctx.beginPath(); ctx.arc(cx + dx * mr, cy + dy * mr, s * mr, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    pix(ctx, "THROUGH THE EYEPIECE", cx, H * 0.085, H * 0.05, "#ff6a52");
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#f4efe6"; ctx.font = font(600, H * 0.06, FONT);
    ctx.fillText(kind === "saturn" ? "Saturn · 180×" : "The Moon · six days old", cx, H * 0.95);
  };
  // A stool: a post on a foot ring under a round red seat.
  const stool = own(() => merge(
    BL.models.lathe({ profile: [[0, 0], [0.2, 0], [0.2, 0.02], [0.07, 0.04], [0.05, 0.48], [0, 0.48]], segments: 12, color: "#3a3a3a" }),
    BL.models.moved(BL.models.torus(0.17, 0.012, "#4a4a4a", 0, 16, 4), 0, 0.2, 0),
    BL.models.lathe({ profile: [[0, 0.465], [0.22, 0.465], [0.24, 0.5], [0.24, 0.52], [0, 0.535]], segments: 16, color: "#5a2a2a" })
  ));
  // The desk's chair, its front toward -z, as the mock-up's chair.
  const chair = own(() => merge(
    box({ w: 0.84, h: 0.18, d: 0.72, color: "#1b1816", offset: { y: 0.09 } }),
    box({ w: 0.84, h: 0.14, d: 0.72, color: "#2b2723", offset: { y: 0.25 } }),
    box({ w: 0.84, h: 0.56, d: 0.16, color: "#2b2723", offset: { y: 0.5, z: 0.32 } }),
    box({ w: 0.13, h: 0.22, d: 0.72, color: "#221f1c", offset: { x: 0.43, y: 0.38 } }),
    box({ w: 0.13, h: 0.22, d: 0.72, color: "#221f1c", offset: { x: -0.43, y: 0.38 } }),
    box({ w: 0.8, h: 0.035, d: 0.04, color: AMBER, emissive: 0.8, offset: { y: 0.02, z: -0.36 } })
  ));
  // The star chart on the desk: rings of right ascension and stars on a dark blue sheet.
  const paintChart = (ctx, W, H) => {
    const r = rng(5);
    ctx.fillStyle = "#0f1a33"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(150,180,230,.35)"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, 40 + i * 30, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + Math.cos(a) * 200, H / 2 + Math.sin(a) * 200); ctx.stroke(); }
    ctx.fillStyle = "#f2efe6";
    for (let i = 0; i < 120; i++) { ctx.beginPath(); ctx.arc(r() * W, r() * H, r() * 2.6, 0, TAU); ctx.fill(); }
  };
  // The laptop's screen, red on black for eyes kept dark: where the telescope is pointed.
  const paintLaptop = (ctx, W, H) => {
    ctx.fillStyle = "#140606"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ff6a52"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = font(600, 46, MONO);
    ctx.fillText("RA 05h 35m", W / 2, H * 0.36); ctx.fillText("DEC −05° 23′", W / 2, H * 0.66);
  };

  // ---------- its door ----------
  // An observatory's steel bulkhead: riveted plates, a porthole glowing night-red, a lever handle, in a heavy riveted
  // frame under a red night lamp.
  const door = {
    casing: "#24282e", frame: "#4a505a", header: C.black, word: "#ff3b30", strip: C.red, chain: false,
    leaf: "#5c626b", seam: "#1c1e22", plate: C.black, face: C.red, mark: C.black,
    leafFace(side, H) {
      for (const y of [0.8, 1.6, 2.4]) {
        H.rect(-0.75, y - 0.01, 0.75, y + 0.01, "#3a3f47", 0, 1);
        for (let x = -0.66; x < 0.7; x += 0.16) H.diamond(x, y + 0.05, 0.012, "#8a909a", 0.1, 2);
      }
      for (let y = 0.15; y < 3.1; y += 0.2) { H.diamond(-0.68, y, 0.012, "#8a909a", 0.1, 2); H.diamond(0.68, y, 0.012, "#8a909a", 0.1, 2); }
      H.disc(0, 2.0, 0.2, "#3a0a08", 0.5, 16, 1);
      H.ring(0, 2.0, 0.24, 0.05, "#2a2e35", 0.05, 16, 2);
      H.rect(H.inner + side * 0.08, 1.12, H.inner + side * 0.32, 1.18, "#c9ccd2", 0.15, 2);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), x = d.W + d.F + 0.08, z = d.Z - 0.15;
    for (const sx of [-1, 1]) {
      K.box(0.16, d.head, 0.08, C.frame, sx * x, d.head / 2, z);
      for (let y = 0.25; y < d.head; y += 0.32) K.ball(0.022, C.steel, sx * x, y, z - 0.045, { seg: 6 });
    }
    K.cyl(0.09, 0.11, 0.12, C.red, 0, d.head + 0.1, d.Z - 0.12, { emissive: 1, glow: true, seg: 12 });
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    const e0 = ROOMS.edgeEl(L, 0) / DEG, top = crownEl(L), SKY = BL.timechainRoomKinds.planetarium.sky;
    K.wallColor("#1b1d22");
    K.render({ sky: [0.26, 0.27, 0.33], ground: [0.1, 0.08, 0.08], ambientFloor: 0.32, bloomStrength: 0.7 });
    // The dome: steel panels with their seams and rivets, the shutters folded back either side of the open slit,
    // their frame over the crown, and the slit itself a deep night blue the stars are set in front of.
    K.dome((ctx, D) => {
      D.sky(ctx, [[90, "#15181d"], [30, "#1d2127"], [-10, "#23272e"]]);
      ctx.fillStyle = "#121418";
      for (let az = -175; az < 180; az += 10) ctx.fillRect(D.x(az) - 1.5, 0, 3, D.y(e0));
      for (let el = e0 + 8; el < 88; el += 8) { const t = Math.max(1.5, 0.05 * D.perY(el)); ctx.fillRect(0, D.y(el) - t / 2, D.W, t); }
      ctx.fillStyle = "rgba(170,180,190,.22)";
      for (let az = -175; az < 180; az += 5) for (let el = e0 + 4; el < top; el += 8) { const rx = 0.035 * D.perX(el), ry = 0.035 * D.perY(el); ctx.fillRect(D.x(az) - rx, D.y(el) - ry, 2 * rx, 2 * ry); }
      const band = (w, to) => {
        ctx.beginPath();
        for (let el = e0 - 0.5; el <= to; el += 0.25) ctx.lineTo(D.x(-sideAz(L, w, el)), D.y(el));
        for (let el = to; el >= e0 - 0.5; el -= 0.25) ctx.lineTo(D.x(sideAz(L, w, el)), D.y(el));
        ctx.closePath();
      };
      // The shutters, folded back: a darker steel either side of the opening and on over the crown, their leaves'
      // seams across them.
      band(SLIT.frame, top + 0.01); ctx.fillStyle = C.frame; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = "#191c21";
      for (let el = e0 + 3; el < top; el += 3) { const t = Math.max(1.5, 0.03 * D.perY(el)); ctx.fillRect(0, D.y(el) - t / 2, D.W, t); }
      ctx.restore();
      band(SLIT.open, SLIT.top);
      const g = ctx.createLinearGradient(0, D.y(SLIT.top), 0, D.y(e0));
      g.addColorStop(0, "#03050c"); g.addColorStop(1, "#0d1428");
      ctx.fillStyle = g; ctx.fill();
    });
    // What the slit is doing, in amber either side of its foot, in front of the ribs.
    K.node(null, (k) => {
      for (const [text, az] of [["SHUTTER OPEN", -24], ["TRACKING", 20]]) {
        const p = ROOMS.onSphere(L, az * DEG, (e0 + 2.4) * DEG, 0.975);
        k.add(RM.helpers.litWord(text, 0.045, "#ffb04d", 0.9), p.x, p.y, p.z, { ry: Math.PI - az * DEG, glow: true });
      }
    }, 0, 0, 0, { glow: true, depthBias: 2 * RM.MARK_BIAS });
    // The floor: grey, a painted ring inside the wall, a white ring round the pier, the chain from the doors to it.
    K.floor((ctx, F) => {
      const { X, Y, s, N } = F;
      ctx.fillStyle = "#24262b"; ctx.fillRect(0, 0, N, N);
      ctx.strokeStyle = "#5a5f68"; ctx.lineWidth = 0.12 * s; ctx.beginPath(); ctx.arc(X(0), Y(0), (L.r0 - 0.35) * s, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 0.05 * s; ctx.beginPath(); ctx.arc(X(0), Y(0), 1.4 * s, 0, TAU); ctx.stroke();
      F.path(0, L.doorZ, 0, 1.5);
    });
    // The steel, its own meshes so Canvas 2D sorts it over the dome it stands in front of.
    const steel = steelwork(L.id);
    K.node(null, steel.body, 0, 0, 0, { depthBias: RM.MARK_BIAS });
    K.node(null, steel.glow, 0, 0, 0, { glow: true, depthBias: RM.MARK_BIAS });
    // The sky in the slit: the Planetarium's, turned by the sidereal time, cut to the opening.
    const sky = perSky(L.id);
    K.node("skyTilt", null, 0, L.c, 0, { rx: SKY.TILT });
    K.node("skySpin", null, 0, 0, 0, { parent: "skyTilt", ry: -SKY.lst(Date.now()) });
    K.node("stars", sky, 0, 0, 0, { parent: "skySpin", glow: true });
    // The two views through the eyepiece, floating in front of the ribs.
    const views = [["saturn", 62, 108, "Saturn through the eyepiece · 180×"], ["moon", -108, -62, "The Moon through the eyepiece · six days old"]];
    for (const [kind, az0, az1, tip] of views) {
      K.live({ view: kind, tip, az0, az1, el0: e0 + 5, el1: e0 + 32, inset: 0.95, w: 1100, h: 684, key: () => kind, paint: (ctx) => eyepiece(ctx, 1100, 684, kind) });
    }
    // The telescope: the white pier, the mount's polar housing on the pole, the counterweights on the declination
    // axis (turning with the hour angle) and the tube with its dew shield, cell, finder and eyepiece (turning with
    // the declination too).
    K.cyl(0.55, 0.65, 1.5, C.white, 0, 0.75, 0, { seg: 24 });
    K.cyl(0.62, 0.62, 0.06, C.black, 0, 1.5, 0, { seg: 24 });
    K.group(0, HEAD, 0, 0, SKY.TILT).box(0.5, 1.0, 0.5, C.steel, 0, 0, 0);
    K.node("scopeHA", (k) => {
      const g = k.group(0, 0, 0, 0, -SKY.TILT);
      g.cyl(0.12, 0.12, 0.5, C.steel, 0.05, 0, 0, { rz: Math.PI / 2 });
      g.cyl(0.05, 0.05, 1.2, C.steel, -0.55, 0, 0, { rz: Math.PI / 2 });
      for (const x of [-0.95, -1.12]) g.cyl(0.22, 0.22, 0.14, C.black, x, 0, 0, { rz: Math.PI / 2, seg: 24 });
    }, 0, HEAD, 0, { rx: SKY.TILT });
    const tilt = ALT - Math.PI / 2;
    K.node("scopeDec", (k) => {
      const g = k.group(0, 0, 0, 0, -SKY.TILT), at = (p, o) => [p[0] + (o ? o[0] : 0), p[1] + (o ? o[1] : 0), p[2] + (o ? o[2] : 0)];
      const part = (rt, rb, h, color, p, seg = 32) => g.cyl(rt, rb, h, color, p[0], p[1], p[2], { rx: tilt, seg });
      part(0.42, 0.42, 4.2, C.white, along(1.2));
      part(0.46, 0.46, 0.8, C.black, along(3.1));
      part(0.44, 0.44, 0.15, C.black, along(-0.88));
      part(0.44, 0.38, 0.1, C.steel, along(-1.0));
      part(0.08, 0.08, 0.9, C.black, at(along(0.4), [0, 0.36, 0.3]), 12);
      for (const k2 of [0.15, 0.65]) { const p = at(along(k2), [0, 0.2, 0.17]); g.box(0.06, 0.08, 0.06, C.black, p[0], p[1], p[2], { rx: tilt }); }
      g.box(0.06, 0.7, 0.3, C.steel, 0.15, 0, 0, { rx: tilt });
      g.cyl(0.06, 0.06, 0.3, C.black, EYE[0], EYE[1], EYE[2], { rz: Math.PI / 2, seg: 12 });
      g.cyl(0.09, 0.09, 0.1, C.steel, EYE[0] - 0.12, EYE[1], EYE[2], { rz: Math.PI / 2, seg: 12 });
    }, 0, 0, 0, { parent: "scopeHA", target: { kind: "telescope", tip: "Telescope · tap to see what it is tracking", radius: 2.4 } });
    // What a body cannot walk through: the pier, the tube's low end and the counterweights at head height, and the
    // step, which a body can stand on to reach the eyepiece.
    K.solid({ x: 0, z: 0, r: 0.72 });
    K.solid({ x: SIDE, z: 0.45, r: 0.5 });
    K.solid({ x: -1.0, z: 0, r: 0.3 });
    const step = { x: EYE[0] + 0.5, z: EYE[2] };
    K.box(0.7, 0.34, 0.55, "#2b2b2e", step.x, 0.17, step.z);
    K.box(0.7, 0.02, 0.04, AMBER, step.x, 0.33, step.z - 0.27, { emissive: 0.8, glow: true });
    K.solid({ x: step.x, z: step.z, hx: 0.35, hz: 0.275, top: 0.34 });
    // The stools round the telescope's front, facing it.
    for (const b of [125, 145, 165]) {
      const x = 3.4 * Math.sin(b * DEG), z = 3.4 * Math.cos(b * DEG), h = Math.atan2(-x, -z);
      const seat = K.seat(x, z, h, 0.56, 0, 0.9);
      K.node(null, stool(), x, 0, z, { ry: h, target: { kind: "chair", tip: "Stool", radius: 0.45, index: seat.index } });
      K.solid({ x, z, r: 0.28 });
    }
    // The star-chart desk against the wall at the front left, its chair on the room's side, its red lamp.
    const db = -128 * DEG, dr = L.r0 - 1.3, dx = dr * Math.sin(db), dz = dr * Math.cos(db), dh = Math.atan2(dx, dz), G = K.group(dx, 0, dz, dh);
    G.box(1.8, 0.05, 0.8, "#3a2c1e", 0, 0.6, 0);
    for (const x of [-0.85, 0.85]) G.box(0.06, 0.6, 0.75, "#2a1f15", x, 0.3, 0);
    G.box(1.6, 0.04, 0.04, "#2a1f15", 0, 0.12, 0.3);
    const chartAt = G.at(-0.3, 0.628, 0);
    K.picture(0.9, 0.6, 512, 340, paintChart, chartAt.x, chartAt.y, chartAt.z, { rx: -Math.PI / 2, rz: dh + Math.PI, emissive: 0.5 });
    G.box(0.4, 0.02, 0.3, "#2b2b2e", 0.5, 0.635, 0);
    G.box(0.4, 0.26, 0.015, "#2b2b2e", 0.5, 0.775, 0.15);
    G.picture(0.36, 0.22, 380, 240, paintLaptop, 0.5, 0.775, 0.14, { ry: Math.PI, emissive: 0.9 });
    // The red lamp: a weighted foot, a bent arm and its shade, glowing.
    G.cyl(0.08, 0.09, 0.03, "#1c1c1f", -0.75, 0.64, 0.24, { seg: 12 });
    G.box(0.02, 0.36, 0.02, "#1c1c1f", -0.75, 0.82, 0.24);
    G.box(0.02, 0.02, 0.2, "#1c1c1f", -0.75, 1.0, 0.15);
    G.cyl(0.035, 0.09, 0.1, "#3a1010", -0.75, 0.96, 0.06, { seg: 12 });
    G.cyl(0.07, 0.07, 0.01, "#ff3a2a", -0.75, 0.905, 0.06, { emissive: 1, glow: true, seg: 12 });
    for (const x of [-0.6, 0, 0.6]) G.solid({ x, z: 0, r: 0.42 });
    const seat = G.seat(0, -0.8, 0, 0.4, 0, 1.0);
    G.node(null, chair(), 0, 0, -0.8, { ry: Math.PI, target: { kind: "chair", tip: "Chair at the star-chart desk", radius: 0.6, index: seat.index } });
    G.solid({ x: 0, z: -0.8, r: 0.42 });
    const lamp = G.at(-0.75, 0.88, 0.06);
    // Red night lights round the wall, low, an eighth of the way round from each other.
    for (let b = 22.5; b < 360; b += 45) {
      const r = ROOMS.radiusAt(L, 1) - 0.1, x = r * Math.sin(b * DEG), z = r * Math.cos(b * DEG), W = K.group(x, 1, z, Math.atan2(x, z));
      W.box(0.26, 0.16, 0.04, "#141518", 0, 0, 0.03);
      W.box(0.2, 0.1, 0.03, C.red, 0, 0, 0, { emissive: 1, glow: true });
    }
    // The light: starlight down the slit, the red lamp, the room's red night light, and soft fills.
    K.light(0, 9, -7, 16, 0.22, 0.27, 0.42);
    K.light(lamp.x, lamp.y, lamp.z, 5, 1, 0.25, 0.15);
    K.light(0, 1.5, 4, 14, 0.42, 0.1, 0.07);
    K.light(2.5, 5, 3, 12, 0.3, 0.3, 0.33);
    K.light(0.3 * L.R, L.c + 0.3 * L.R, 0.4 * L.R, 20, 0.2, 0.19, 0.18);
  };
  // The slit's sky: the Planetarium's stars without its figures or names, larger and more of the faint ones, built only
  // as far south as ever crosses the north meridian in the slit, and cut to the opening (|x| within the slit's
  // half-width, the front half, between the screen's edge and the slit's top).
  const perSky = perRoom((id) => {
    const L = ROOMS.layout(id), geo = BL.timechainRoomKinds.planetarium.sky.build({ radius: L.R * 0.99, figures: false, labels: false, filler: 6000, specks: 900, seed: 66, grow: 2, minDec: 25 }).stars;
    geo.clipSlab = [1 / SLIT.open, 0, 0, 0];
    geo.clipPlane = [0, 0, 1, 0];
    geo.clipMinY = ROOMS.edgeY(L, 0) + 0.02;
    geo.clipMaxY = L.c + L.R * 0.99 * Math.sin(SLIT.top * DEG);
    return geo;
  });

  // The sky turns by the sidereal time; the telescope dwells on a target, tracking it, then slews along the slit to
  // the next. Nothing here allocates.
  const animate = (nodes) => {
    const spin = nodes.skySpin, ha = nodes.scopeHA, dec = nodes.scopeDec, lst = BL.timechainRoomKinds.planetarium.sky.lst;
    const restHa = ha.rotation.y;
    let i = 0, t = 0, slewing = false, fromDec = 0, fromHa = 0, nowDec = 0, nowHa = 0;
    return {
      update(dt) {
        spin.rotation.y = -lst(Date.now());
        t += dt;
        if (slewing) {
          const k = clamp(t / SLEW, 0, 1), e = k * k * (3 - 2 * k);
          nowDec = fromDec + (TARGETS[i].dec - fromDec) * e; nowHa = fromHa + (TARGETS[i].ha - fromHa) * e;
          if (k >= 1) { slewing = false; t = 0; }
        } else {
          nowHa += TRACK * dt;
          if (t >= DWELL) { fromDec = nowDec; fromHa = nowHa; i = (i + 1) % TARGETS.length; slewing = true; t = 0; }
        }
        ha.rotation.y = restHa + nowHa;
        dec.rotation.x = nowDec;
      },
      tap(owner, hud) {
        if (owner.kind === "telescope") {
          const T = TARGETS[i];
          hud.toast(slewing ? `Telescope · slewing to ${T.name}` : `Telescope · tracking ${T.name}, ${T.say}`);
          return true;
        }
        if (owner.kind === "live" && owner.slot.spec.view) { hud.toast(owner.slot.spec.tip); return true; }
        return false;
      }
    };
  };
  BL.timechainRoomKinds.observatory = { plan, animate, door, steps: (L) => [() => steelwork(L.id), () => perSky(L.id)] };
})();
