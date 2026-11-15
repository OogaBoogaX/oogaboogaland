// Room 1, the Conference Room: the round table seating eight under a dome of live block and mining charts (the
// mock-up's layout A, the ring). Round the dome's base the latest blocks run all the way round as cards, the label at
// the front; above them six charts stand at a look-up angle, a sixth of the way round from each other; the next block
// fills the crown. The holdings desk stands against the left wall, the amber chain runs from the doors to the ring
// round the table and out to the wall a third of a turn either side, and this is the one room with a lock.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { box, lathe, ring, merge } = BL.models;
  const { face, blank, clip, own, UP } = RM.helpers;
  const C = { seat: "#2a2a2f", cushion: "#34343a", desk: "#1d1d21", leg: "#101012", bezel: "#0c0c0d", amber: "#f7931a" };
  const SEATS = 8, SEAT_SPACING = 2.6;
  // The chairs' ring, so the widest Ooga passes between any two, and the table reaching to just short of them.
  const chairR = Math.max(2.1, SEAT_SPACING / (2 * Math.sin(Math.PI / SEATS))), TABLE = { r: chairR - 0.95, top: 0.56 };
  const RING = { in: chairR + 0.52, out: chairR + 1.22 };
  // The meeting table: a dark drum on a pedestal with an amber band, and a flat ₿ in its top laid in squares a ₿ pixel
  // across, cut to the drum's rim, the ₿'s own lit, so nothing lies over anything (Canvas 2D sorts face by face).
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];
  const table = own(() => {
    const k = TABLE.r / 1.15, h = TABLE.top, rim = 1.1 * k, segments = Math.round(32 * k), geo = blank();
    const cell = 0.07 * k, n = Math.ceil(rim / cell) + 1, inside = rim * Math.cos(Math.PI / segments);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x0 = (i - 0.5) * cell, z0 = j * cell, row = BITCOIN[j + 6], lit = !!row && row[i + 5] === "1";
      let poly = [[x0, z0], [x0 + cell, z0], [x0 + cell, z0 + cell], [x0, z0 + cell]];
      if (Math.max(...poly.map(([x, z]) => Math.hypot(x, z))) > inside) {
        for (let s = 0; s < segments && poly; s++) { const a = (s + 0.5) / segments * Math.PI * 2; poly = clip(poly, Math.cos(a), Math.sin(a), inside); }
      }
      if (poly) face(geo, poly.map(([x, z]) => [x, h, z]), lit ? C.amber : C.seat, lit ? 0.75 : 0, UP);
    }
    return merge(
      lathe({ profile: [[0, 0], [0.55 * k, 0], [0.55 * k, 0.06], [0.2 * k, 0.09], [0.2 * k, h - 0.14], [rim, h - 0.12], [rim, h]], segments, color: C.seat }),
      ring({ r: 1.11 * k, thickness: 0.03, y: h - 0.06, segments, color: C.amber, emissive: 0.8 }),
      geo
    );
  });
  // A blocky lounge chair, its front toward +z.
  const chair = own(() => merge(
    box({ w: 0.86, h: 0.36, d: 0.82, color: C.seat, offset: { y: 0.18 } }),
    box({ w: 0.7, h: 0.1, d: 0.64, color: C.cushion, offset: { y: 0.41, z: 0.04 } }),
    box({ w: 0.86, h: 0.8, d: 0.2, color: C.seat, offset: { y: 0.76, z: -0.31 } }),
    ...[-1, 1].map((side) => box({ w: 0.14, h: 0.26, d: 0.74, color: C.cushion, offset: { x: side * 0.36, y: 0.49 } })),
    box({ w: 0.6, h: 0.03, d: 0.03, color: C.amber, emissive: 0.6, offset: { y: 0.04, z: 0.42 } })
  ));
  // The holdings desk with its terminal, front toward +z; the terminal's picture hangs at `DESK_SCREEN`.
  const desk = own(() => merge(
    box({ w: 2, h: 0.06, d: 0.8, color: C.desk, offset: { y: 0.76 } }),
    ...[-1, 1].map((side) => box({ w: 0.06, h: 0.73, d: 0.72, color: C.leg, offset: { x: side * 0.93, y: 0.365 } })),
    box({ w: 0.12, h: 0.32, d: 0.12, color: C.leg, offset: { y: 0.95, z: -0.2 } }),
    box({ w: 1.24, h: 0.8, d: 0.07, color: C.bezel, offset: { y: 1.48, z: -0.2 } }),
    box({ w: 0.9, h: 0.03, d: 0.26, color: C.leg, offset: { y: 0.8, z: 0.12 } }),
    box({ w: 1.9, h: 0.02, d: 0.02, color: C.amber, emissive: 0.6, offset: { y: 0.735, z: 0.4 } })
  ));
  const DESK_SCREEN = { y: 1.48, z: -0.16, w: 1.1, h: 0.68 };

  // What a chart or a card would print now, as a key: a picture is repainted only when its key moves.
  const chartKey = (reader, i, now) => {
    let k = "";
    for (const name of CH.PANELS[i].sets) k += name === "history" ? `${reader.historyStatus()}:${reader.summary ? reader.summary.coverage + "/" + reader.summary.tip : ""}|` : `${reader.status(name)}:${reader.at(name)}|`;
    const primary = CH.PANELS[i].sets[0];
    const status = CH.PANELS[i].id === "window" ? reader.historyStatus() : reader.status(primary);
    return k + CH.freshness(status, reader.at(primary), now);
  };
  const cardKey = (reader, i, now) => {
    if (i === 0) return `label|${reader.status("recent")}`;
    const blocks = reader.value("recent"), b = blocks && blocks[i - 1];
    return b ? `${b.id}|${b.pool}|${CH.format.ago(now - b.time * 1000)}` : `none|${reader.status("recent")}`;
  };
  // The crown: the next block, how full the mempool's next template is and what it pays, and the last block's age.
  const CROWN = 1024;
  const crownKey = (reader, now) => {
    const blocks = reader.value("recent"), b = blocks && blocks[0], projected = reader.value("projected"), p = projected && projected[0];
    return `${b ? b.height : "-"}|${p ? p.vsize + ":" + p.fees : "-"}|${b ? CH.format.ago(now - b.time * 1000) : reader.status("recent")}`;
  };
  const paintCrown = (ctx, reader, now) => {
    // The projected blocks come next first: the template the next block will be mined from is the first.
    const N = CROWN, cx = N / 2, K = RM.paintKit, blocks = reader.value("recent"), b = blocks && blocks[0], projected = reader.value("projected"), p = projected && projected[0];
    ctx.fillStyle = "#0b0a09"; ctx.fillRect(0, 0, N, N);
    ctx.fillStyle = "#100d0b"; ctx.beginPath(); ctx.arc(cx, cx, 470, 0, K.TAU); ctx.fill();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cx, 470, 0, K.TAU); ctx.stroke();
    // How full the next block's template is, round the ring.
    const fill = p ? Math.min(1, p.vsize / 1e6) : 0;
    ctx.lineWidth = 46; ctx.strokeStyle = "#221c17"; ctx.beginPath(); ctx.arc(cx, cx, 405, 0, K.TAU); ctx.stroke();
    if (fill > 0) { ctx.strokeStyle = C.amber; ctx.beginPath(); ctx.arc(cx, cx, 405, -Math.PI / 2, -Math.PI / 2 + K.TAU * fill); ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    K.pix(ctx, "NEXT BLOCK", cx, 330, 44, "#ffb04d");
    ctx.fillStyle = "#f4efe6"; ctx.font = K.font(600, 128, K.MONO); ctx.fillText(b ? CH.format.group(b.height + 1) : "—", cx, 500);
    ctx.fillStyle = "#a89c8b"; ctx.font = K.font(500, 42);
    ctx.fillText(p ? `${(p.vsize / 1e6).toFixed(2)} of 1.00 MvB in the template` : "Waiting for the mempool", cx, 580);
    ctx.fillText(p ? `${CH.format.btc(p.fees, 3)} BTC in fees so far` : "", cx, 636);
    ctx.fillStyle = "#4fd08a"; ctx.font = K.font(600, 40, K.MONO);
    ctx.fillText(b ? `${CH.format.group(b.height)} · ${CH.format.ago(now - b.time * 1000)}` : reader.status("recent"), cx, 720);
  };

  // ---------- its door ----------
  // A boardroom's: walnut leaves, each with a tall frosted light by the seam and a brushed-steel pull over a steel kick
  // plate, in a walnut frame with steel strips standing either side.
  const door = {
    casing: "#1b1d22", frame: "#5a3d26", header: "#14161a", word: C.amber, strip: C.amber, chain: false,
    leaf: "#4a3220", seam: "#20140c", plate: "#2a2c31", face: C.amber, mark: "#14161a",
    leafFace(side, H) {
      const at = (d) => H.inner + side * d;
      for (let y = 0.45; y < 3.1; y += 0.42) H.rect(-0.75, y, 0.75, y + 0.008, "#3d2919");
      H.rect(at(0.14), 0.55, at(0.34), 2.95, "#b7cdd6", 0.3, 1);
      H.rect(at(0.05), 0.95, at(0.085), 1.95, "#c9ccd2", 0.25, 2);
      H.rect(-0.75, 0.04, 0.75, 0.3, "#8e9298", 0.1, 1);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L);
    for (const sx of [-1, 1]) K.box(0.05, d.head, 0.04, "#9ea2a8", sx * (d.W + d.F + 0.06), d.head / 2, d.Z - 0.03, { emissive: 0.1 });
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    K.wallColor("#1c1a17");
    K.render({ sky: [0.5, 0.46, 0.42], ground: [0.24, 0.2, 0.17], ambientFloor: 0.42, bloomStrength: 0.6 });
    // The dome: dark amber, faintly panelled, under its pictures.
    K.dome((ctx, D) => {
      const g = ctx.createLinearGradient(0, 0, 0, D.H);
      g.addColorStop(0, "#0a0908"); g.addColorStop(0.5, "#100d0b"); g.addColorStop(1, "#16110c");
      ctx.fillStyle = g; ctx.fillRect(0, 0, D.W, D.H);
      ctx.fillStyle = "rgba(247,147,26,.045)";
      for (let i = 0; i < 32; i++) ctx.fillRect(i * D.W / 32, 0, 3, D.H);
      for (let el = 10; el < 90; el += 10) ctx.fillRect(0, D.y(el), D.W, 2);
    });
    // The floor: charcoal tiles, the chain from the doors to the ring round the table and out a third of a turn either side.
    K.floor((ctx, F) => {
      F.tiles();
      F.ring(RING.in, RING.out);
      F.path(0, L.doorZ, 0, RING.out);
      for (const b of [120, 240]) { const dx = Math.sin(b * F.DEG), dz = Math.cos(b * F.DEG); F.path(dx * RING.out, dz * RING.out, dx * (L.r0 - 0.7), dz * (L.r0 - 0.7)); }
    });
    // The table and its chairs, each a seat facing it.
    K.node("table", table(), 0, 0, 0, { target: { kind: "table", tip: "Meeting table · jump up on it", radius: TABLE.r + 0.05 } });
    K.solid({ x: 0, z: 0, r: TABLE.r + 0.05, top: TABLE.top });
    for (let k = 0; k < SEATS; k++) {
      const a = (k + 0.5) * 2 * Math.PI / SEATS, x = Math.sin(a) * chairR, z = -Math.cos(a) * chairR;
      K.node(null, chair(), x, 0, z, { ry: -a, target: { kind: "chair", tip: "Chair", radius: 0.6 } });
      K.solid({ x, z, r: 0.48 });
      K.seat(x, z, -a);
    }
    // The holdings desk on the left wall, its terminal a live picture.
    const dx = -(L.r0 - 1.8);
    K.node("desk", desk(), dx, 0, 0, { ry: Math.PI / 2, target: { kind: "terminal", tip: "Holdings desk · tap for Timechain Index holdings", radius: 1.3 } });
    K.solid({ x: dx, z: 0, hx: 0.5, hz: 1 });
    K.live({ board: "holdings", flat: { x: dx + DESK_SCREEN.z, y: DESK_SCREEN.y, z: 0, ry: Math.PI / 2, w: DESK_SCREEN.w, h: DESK_SCREEN.h }, w: CH.PANEL_W, h: CH.PANEL_H,
      key: (f) => `${f.holdingsIndex}|${f.holdingsKeys[f.holdingsIndex]}`, paint: (ctx, f) => ctx.drawImage(f.holdingsCanvases[f.holdingsIndex], 0, 0) });
    // The dome's live pictures: the latest blocks round its base, the six charts above them and the next block over all.
    const e0 = ROOMS.edgeEl(L, 0) / ROOMS.DEG + 1.6, slot = 360 / 16, cardW = (slot - 1.6) * ROOMS.DEG * L.R * Math.cos((e0 + 6) * ROOMS.DEG);
    const cardH = cardW * CH.CARD_H / CH.CARD_W, cardEl = cardH / (L.R * ROOMS.DEG);
    for (let i = 0; i < 16; i++) {
      const az = i * slot;
      K.live({ board: "charts", tip: "Latest blocks · tap for the charts", az0: az - slot / 2 + 0.8, az1: az + slot / 2 - 0.8, el0: e0, el1: e0 + cardEl, w: CH.CARD_W, h: CH.CARD_H,
        key: (f, now) => cardKey(f.reader, i, now), paint: (ctx, f, now) => { const blocks = f.reader.value("recent"); if (i === 0) CH.ribbonLabel(ctx, f.reader.status("recent")); else CH.card(ctx, blocks && blocks[i - 1], now); } });
    }
    const p0 = e0 + cardEl + 3, p1 = p0 + 24, span = 24 * ROOMS.DEG * L.R * CH.PANEL_W / CH.PANEL_H / (L.R * Math.cos((p0 + 12) * ROOMS.DEG)) / ROOMS.DEG;
    // Front, then round to the right: the backlog, difficulty, hashrate, the last 144 blocks over the doors, pools, production.
    [["mempool", 0], ["difficulty", 60], ["history", 120], ["window", 180], ["dominance", 240], ["production", 300]].forEach(([id, az]) => {
      const i = CH.PANELS.findIndex((p) => p.id === id);
      K.live({ board: "charts", panel: i, tip: `${CH.PANELS[i].title} · tap for a close-up`, az0: az - span / 2, az1: az + span / 2, el0: p0, el1: p1, w: CH.PANEL_W, h: CH.PANEL_H,
        key: (f, now) => chartKey(f.reader, i, now), paint: (ctx, f, now) => CH.PANELS[i].paint(ctx, f.reader, now) });
    });
    K.live({ cap: true, el0: Math.min(70, p1 + 10), w: CROWN, h: CROWN, tip: "The next block", key: (f, now) => crownKey(f.reader, now), paint: (ctx, f, now) => paintCrown(ctx, f.reader, now) });
    // Point lights, the fixed ones first: warm over the table, the front's wash, the desk.
    K.light(0, L.c + 1.5, 0, 10, 0.95, 0.62, 0.3);
    K.light(0, 4, -L.R * 0.55, 10, 0.75, 0.48, 0.2);
    K.light(dx * 0.8, 3, 0, 6, 0.6, 0.42, 0.22);
    K.light(0.45 * L.R, 3, L.doorZ - 2, 6, 0.6, 0.42, 0.22);
  };
  BL.timechainRoomKinds.conference = { plan, door, TABLE, SEATS };
})();
