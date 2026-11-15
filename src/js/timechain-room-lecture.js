// Room 8, the Lecture Hall: curved rows stepping down from the doorway's landing to a round stage, after the mock-up's
// lecture halls. A lecture seat stands at every place of every row either side of the aisle, with a writing ledge
// along the front of each row; on the stage stand the lectern with its ₿ plate and three whiteboards (a block header,
// a Merkle tree and the subsidy's halvings, in a marker hand). Over the stage the dome carries the slide, why the
// chain can't be rewritten, drawn from the latest three blocks while mempool.space has them; above it the latest
// blocks run as cards, and the backlog and difficulty charts stand either side, all live (timechain-blocks.js). The
// rest of the dome is dark and faintly panelled. Walkers pass through the rows; only the lectern and the boards stand
// in their way, and the stage, part of the floor (timechain-rooms.js `floorAt`), is a step up from the hall's foot.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { box, merge, moved, turnedX } = BL.models;
  const { own } = RM.helpers;
  const P = RM.paintKit, DEG = ROOMS.DEG;
  const C = {
    seat: "#3a332d", post: "#1d1b19", ledge: "#6b5238", stage: "#24201c", ring: "#c4700f", lectern: "#2a2420", frame: "#8b8f96", leg: "#55585e",
    plate: "#14110e", amber: "#f7931a", amberText: "#ffb04d", white: "#f4efe6", grey: "#a89c8b", green: "#4fd08a"
  };
  // How far behind a seat its sitter stands up: inside the seat's own row, short of the next riser.
  const BACK = 0.3;
  // A lecture seat on its pedestal, its back toward +z, so the sitter faces -z (the mock-up's `lectureSeat`).
  const seat = own(() => merge(
    box({ w: 0.12, h: 0.32, d: 0.12, color: C.post, offset: { y: 0.16 } }),
    box({ w: 0.64, h: 0.09, d: 0.5, color: C.seat, offset: { y: 0.36 } }),
    moved(turnedX(box({ w: 0.64, h: 0.5, d: 0.08, color: C.seat }), 0.12), 0, 0.62, 0.24)
  ));
  // The ₿ the Conference Room's table carries, a pixel art of 11 by 12, here on the lectern's plate.
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];
  const paintPlate = (ctx, w, h) => {
    ctx.fillStyle = C.plate; ctx.fillRect(0, 0, w, h);
    const cell = Math.floor(h * 0.62 / BITCOIN.length), x0 = Math.round((w - cell * 11) / 2), y0 = Math.round((h - cell * 12) / 2);
    ctx.fillStyle = C.amber;
    BITCOIN.forEach((row, j) => { for (let i = 0; i < 11; i++) if (row[i] === "1") ctx.fillRect(x0 + i * cell, y0 + j * cell, cell, cell); });
  };

  // The three whiteboards, in a marker hand on a white board with faint smudges (the mock-up's `boardCanvas`).
  const BOARDS = [
    { caption: "Block header", note: "Eighty bytes, hashed twice with SHA-256: the hash must fall under the target, which is the work." },
    { caption: "Merkle tree", note: "Transactions hashed in pairs up to one root, which goes in the block's header." },
    { caption: "New coins per block", note: "The subsidy halves every 210,000 blocks, so no more than 21 million bitcoin are ever made." }
  ];
  const paintBoard = (which) => (ctx, W, H) => {
    const r = P.rng(31 + which);
    ctx.fillStyle = "#f3f2ee"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(160,170,190,.12)";
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(r() * W, r() * H, 120 + r() * 120, 30 + r() * 30, r(), 0, P.TAU); ctx.fill(); }
    const pen = (col, w) => { ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w || 5; ctx.lineCap = "round"; ctx.lineJoin = "round"; };
    const line = (x0, y0, x1, y1) => {
      ctx.beginPath(); ctx.moveTo(x0 + (r() - 0.5) * 3, y0 + (r() - 0.5) * 3);
      for (let i = 1; i <= 4; i++) ctx.lineTo(x0 + (x1 - x0) * i / 4 + (r() - 0.5) * 3, y0 + (y1 - y0) * i / 4 + (r() - 0.5) * 3);
      ctx.stroke();
    };
    const rect = (x, y, w, h) => { line(x, y, x + w, y); line(x + w, y, x + w, y + h); line(x + w, y + h, x, y + h); line(x, y + h, x, y); };
    const text = (t, x, y, size, col, align = "left") => { ctx.fillStyle = col; ctx.textAlign = align; ctx.font = P.font(400, size, P.HAND); ctx.fillText(t, x, y); };
    if (which === 0) {
      text("Block header = 80 bytes", 50, 80, 54, "#1d3a8a");
      pen("#1b1b1b", 5);
      let x = 50;
      for (const [name, bytes] of [["version", 4], ["prev hash", 32], ["merkle root", 32], ["time", 4], ["bits", 4], ["nonce", 4]]) {
        const cw = Math.max(70, 924 * bytes / 80 * 0.86);
        rect(x, 160, cw, 120); text(name, x + cw / 2, 228, 30, "#1b1b1b", "center"); text(`${bytes}`, x + cw / 2, 262, 26, "#b3261e", "center");
        x += cw;
      }
      text("SHA-256 twice → must start with lots of zeros", 50, 360, 40, "#2e7d32");
      text("0000000000000000000215a3…", 50, 430, 44, "#1b1b1b");
      pen("#b3261e", 4); ctx.beginPath(); ctx.ellipse(205, 418, 165, 34, 0, 0, P.TAU); ctx.stroke();
      text("work!", 400, 500, 40, "#b3261e");
    } else if (which === 1) {
      text("Merkle tree", 50, 80, 54, "#1d3a8a");
      pen("#1b1b1b", 5);
      [80, 300, 560, 780].forEach((x, i) => { rect(x, 400, 150, 70); text(`tx ${"ABCD"[i]}`, x + 75, 448, 34, "#1b1b1b", "center"); });
      rect(190, 250, 180, 70); text("H(AB)", 280, 298, 34, "#1b1b1b", "center");
      rect(670, 250, 180, 70); text("H(CD)", 760, 298, 34, "#1b1b1b", "center");
      rect(420, 110, 200, 70); text("root", 520, 158, 38, "#2e7d32", "center");
      pen("#1b1b1b", 4);
      line(155, 400, 250, 320); line(375, 400, 310, 320); line(635, 400, 730, 320); line(855, 400, 790, 320); line(280, 250, 470, 180); line(760, 250, 570, 180);
      text("goes in the header ↑", 650, 140, 32, "#b3261e");
    } else {
      text("New coins per block", 50, 80, 54, "#1d3a8a");
      pen("#1b1b1b", 4); line(80, 470, 960, 470); line(80, 470, 80, 120);
      const steps = [50, 25, 12.5, 6.25, 3.125, 1.5625], sx = 140;
      pen("#2e7d32", 6); ctx.beginPath();
      steps.forEach((v, i) => { const x0 = 80 + i * sx, y = 470 - v * 6.6; if (i) ctx.lineTo(x0, y); else ctx.moveTo(x0, y); ctx.lineTo(x0 + sx, y); });
      ctx.stroke();
      steps.forEach((v, i) => text(String(v), 80 + i * sx + sx / 2, 470 - v * 6.6 - 14, 30, "#1b1b1b", "center"));
      ["2009", "2012", "2016", "2020", "2024", "2028"].forEach((t, i) => text(t, 80 + i * sx + sx / 2, 510, 26, "#555", "center"));
      pen("#b3261e", 4); ctx.beginPath(); ctx.ellipse(80 + 4 * sx + sx / 2, 470 - 3.125 * 6.6 - 22, 64, 30, 0, 0, P.TAU); ctx.stroke();
      text("we are here", 620, 380, 34, "#b3261e");
      text("cap: 21,000,000", 700, 180, 44, "#1d3a8a");
    }
  };

  // The slide: three blocks, each naming the hash of the one before it. The latest three blocks while mempool.space
  // has them (their parent's hash, their own, their time and their transactions), else three example blocks, labelled.
  const EXAMPLE = [
    { height: "974,928", prev: "0000…3f1a", hash: "0000…9c07", time: "14:02 UTC", tx: "3,412" },
    { height: "974,929", prev: "0000…9c07", hash: "0000…b21e", time: "14:09 UTC", tx: "2,987" },
    { height: "974,930", prev: "0000…b21e", hash: "0000…44d3", time: "14:21 UTC", tx: "4,105" }
  ];
  const short = (hash) => hash ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : "none";
  const slideKey = (reader) => {
    const blocks = reader.value("recent");
    return blocks && blocks.length >= 3 ? `live|${blocks[0].id}` : `example|${reader.status("recent")}`;
  };
  const paintSlide = (ctx, reader) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, u = H / 100, recent = reader.value("recent");
    const live = !!recent && recent.length >= 3;
    const blocks = live ? [2, 1, 0].map((k) => { const b = recent[k]; return { height: CH.format.group(b.height), prev: short(b.prev), hash: short(b.id), time: `${new Date(b.time * 1000).toISOString().slice(11, 16)} UTC`, tx: CH.format.group(b.tx) }; }) : EXAMPLE;
    ctx.fillStyle = "#0e0d0c"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(247,147,26,.6)"; ctx.lineWidth = u * 0.5; ctx.strokeRect(u * 2, u * 2, W - u * 4, H - u * 4);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const title = "Why the chain can't be rewritten";
    ctx.fillStyle = C.white; P.fit(ctx, title, W * 0.88, 700, u * 9); ctx.fillText(title, u * 7, u * 16);
    ctx.fillStyle = C.grey; ctx.font = P.font(400, u * 4.6); ctx.fillText("Each block commits to the hash of the one before it.", u * 7, u * 24);
    const bw = (W - u * 30) / 3, bh = H * 0.46, by = u * 32;
    blocks.forEach((b, i) => {
      const bx = u * 7 + i * (bw + u * 8);
      ctx.fillStyle = "#16120e"; P.roundRect(ctx, bx, by, bw, bh, u * 2); ctx.fill();
      ctx.strokeStyle = C.amber; ctx.lineWidth = u * 0.6; ctx.stroke();
      ctx.fillStyle = C.amberText; ctx.font = P.font(700, u * 5); ctx.fillText(`BLOCK ${b.height}`, bx + u * 3, by + u * 8);
      [["prev", b.prev], ["hash", b.hash], ["time", b.time], ["txs", b.tx]].forEach(([k, v], j) => {
        const y = by + u * 17 + j * u * 8.4;
        ctx.fillStyle = C.grey; ctx.font = P.font(500, u * 3.8); ctx.fillText(k, bx + u * 3, y);
        ctx.fillStyle = j < 2 ? C.green : C.white; P.fit(ctx, v, bw - u * 18, 600, u * 4.2, P.MONO); ctx.fillText(v, bx + u * 15, y);
      });
      if (i < 2) {
        const ax = bx + bw + u * 1.5, ay = by + bh * 0.5;
        ctx.strokeStyle = ctx.fillStyle = C.green; ctx.lineWidth = u * 0.8;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + u * 5, ay); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + u * 5, ay); ctx.lineTo(ax + u * 3, ay - u * 1.6); ctx.lineTo(ax + u * 3, ay + u * 1.6); ctx.fill();
      }
    });
    ctx.fillStyle = C.white; ctx.font = P.font(500, u * 4.6);
    ctx.fillText("Change one transaction → its block's hash changes → every later block breaks.", u * 7, by + bh + u * 9.5);
    P.pix(ctx, "LECTURE 4 · PROOF OF WORK", u * 7, H - u * 5.4, u * 3.2, C.grey, "left");
    P.pix(ctx, live ? "LIVE · MEMPOOL.SPACE" : "EXAMPLE BLOCKS", W / 2, H - u * 5.4, u * 3.2, live ? C.green : C.grey);
    P.pix(ctx, "7 / 24", W - u * 7, H - u * 5.4, u * 3.2, C.grey, "right");
  };

  // What a chart or a card would print now, as a key, as the Conference Room keys its own.
  const chartKey = (reader, i, now) => {
    let k = "";
    for (const name of CH.PANELS[i].sets) k += name === "history" ? `${reader.historyStatus()}:${reader.summary ? reader.summary.coverage + "/" + reader.summary.tip : ""}|` : `${reader.status(name)}:${reader.at(name)}|`;
    const primary = CH.PANELS[i].sets[0];
    return k + CH.freshness(CH.PANELS[i].id === "window" ? reader.historyStatus() : reader.status(primary), reader.at(primary), now);
  };
  const cardKey = (reader, i, now) => {
    if (i === 0) return `label|${reader.status("recent")}`;
    const blocks = reader.value("recent"), b = blocks && blocks[i - 1];
    return b ? `${b.id}|${b.pool}|${CH.format.ago(now - b.time * 1000)}` : `none|${reader.status("recent")}`;
  };

  // ---------- its door ----------
  // A lecture hall's: oak leaves with a tall wired-glass light by the seam, a steel push bar and a brass kick plate, in
  // an oak frame set in cream plaster, a clock on the wall to the right and a notice board over the Exit button.
  const door = {
    casing: "#e3dccb", frame: "#7a5432", header: "#5a3d24", word: "#3ddc84", strip: null, chain: false,
    leaf: "#9a6c40", seam: "#4a321c", plate: "#5a3d24", face: "#3ddc84", mark: "#1f1f1f",
    leafFace(side, H) {
      for (let x = -0.7; x < 0.75; x += 0.1) H.rect(x, 0.32, x + 0.004, 3.15, "#8a5f37");
      const g0 = H.inner + side * 0.12, g1 = H.inner + side * 0.34;
      H.rect(g0, 1.7, g1, 2.95, "#b9d3dc", 0.25, 1);
      for (let y = 1.75; y < 2.95; y += 0.1) H.rect(g0, y, g1, y + 0.004, "#8aa0a8", 0.1, 2);
      H.rect(-0.62, 1.0, 0.62, 1.1, "#c9ccd2", 0.2, 1);
      H.rect(-0.75, 0.04, 0.75, 0.3, "#b08a3a", 0.15, 1);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L);
    K.picture(0.5, 0.5, 200, 200, (c, w, h) => {
      c.fillStyle = "#f4f1e8"; c.beginPath(); c.arc(w / 2, h / 2, 94, 0, Math.PI * 2); c.fill();
      c.lineWidth = 8; c.strokeStyle = "#2a2a2a"; c.stroke();
      c.fillStyle = "#2a2a2a";
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(w / 2 + Math.sin(a) * 76 - 3, h / 2 - Math.cos(a) * 76 - 3, 6, 6); }
      c.lineWidth = 6; c.lineCap = "round"; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + 40, h / 2 - 28); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 - 10, h / 2 - 64); c.stroke();
    }, 2.25, 2.65, d.Z - 0.02, { ry: Math.PI, emissive: 0.4 });
    K.picture(0.66, 0.5, 264, 200, (c, w, h) => {
      c.fillStyle = "#b8865a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#5a3d24"; c.lineWidth = 12; c.strokeRect(0, 0, w, h);
      for (const [x, y, nw, nh, col] of [[24, 26, 90, 70, "#f4f1e8"], [130, 30, 100, 60, "#fff5a8"], [40, 112, 80, 62, "#d8ecff"], [140, 104, 96, 70, "#f4f1e8"]]) {
        c.fillStyle = col; c.fillRect(x, y, nw, nh); c.fillStyle = "#c0392b"; c.fillRect(x + nw / 2 - 4, y + 2, 8, 8);
        c.fillStyle = "#666"; for (let l = 0; l < 4; l++) c.fillRect(x + 8, y + 18 + l * 11, nw - 16, 3);
      }
    }, -2.22, 2.3, d.Z - 0.02, { ry: Math.PI, emissive: 0.35 });
  };

  const plan = (K, L) => {
    doorTrim(K, L);
    const R = L.rake, F = R.F, rows = R.rows;
    K.wallColor("#1c1a17");
    K.rakeColors({ terrace: ["#221f1c", "#161412"], nosing: C.ring, landing: "#1f1c1a" });
    K.render({ sky: [0.52, 0.47, 0.42], ground: [0.22, 0.19, 0.16], ambientFloor: 0.42, bloomStrength: 0.55 });
    // The dome: dark, a little lighter toward its foot, faintly panelled.
    K.dome((ctx, D) => {
      D.sky(ctx, [[90, "#07080b"], [0, "#0b0c10"], [-14, "#0e0f12"]]);
      ctx.fillStyle = "rgba(150,170,210,.035)";
      for (let i = 0; i < 32; i++) ctx.fillRect(i * D.W / 32, 0, 3, D.H);
      for (let el = -10; el < 90; el += 10) ctx.fillRect(0, D.y(el), D.W, 2);
    });
    // A seat at every place on every row, each facing the stage; standing up leaves the sitter just behind it.
    for (const s of R.seats) {
      const place = K.seat(s.x, s.z, s.heading + Math.PI, R.seatTop, s.floor, BACK);
      K.node(null, seat(), s.x, s.floor, s.z, { ry: s.heading, target: { kind: "chair", tip: "Lecture seat", radius: 0.5, index: place.index } });
    }
    // A writing ledge in front of each row, either side of the aisle, at desk height over the row's own floor.
    for (const row of rows) {
      const a0 = (R.aisle + 0.02) / row.d, a1 = row.psiS + R.pitch / (2 * row.d);
      if (a1 <= a0) continue;
      K.sector(F, row.rIn + 0.04, row.rIn + 0.32, a0, a1, row.y + 0.6, row.y + 0.64, C.ledge);
      K.sector(F, row.rIn + 0.04, row.rIn + 0.32, -a1, -a0, row.y + 0.6, row.y + 0.64, C.ledge);
    }
    // The round stage at the focus, its rim lit amber, laid in rings so Canvas 2D sorts what stands on it over it.
    const dS = R.stage, top = R.stageTop;
    K.cyl(dS * 0.34, dS * 0.34, top - L.yMin, C.stage, 0, (L.yMin + top) / 2, F, { seg: 64 });
    K.sector(F, dS * 0.34, dS * 0.68, -Math.PI, Math.PI, L.yMin, top, C.stage, { steps: 64 });
    K.sector(F, dS * 0.68, dS, -Math.PI, Math.PI, L.yMin, top, C.stage, { steps: 64 });
    K.torus(dS, 0.03, C.ring, 0, top, F, { emissive: 0.9, glow: true, seg: 96, sides: 4 });
    // The lectern, its reading top tipped toward the speaker and its ₿ plate toward the hall.
    const lz = F + 1.25;
    K.node("lectern", (k) => {
      k.box(0.7, 0.9, 0.46, C.lectern, 0, 0.45, 0);
      k.box(0.78, 0.05, 0.56, C.ledge, 0, 0.95, 0.02, { rx: -0.22 });
    }, 0, top, lz, { target: { kind: "lectern", tip: "Lectern", radius: 0.6, data: { say: "Lecture 4 · Proof of work · today's slide is on the dome" } } });
    K.group(0, top, lz).picture(0.4, 0.4, 128, 128, paintPlate, 0, 0.55, 0.235, { emissive: 0.85, depthBias: RM.MARK_BIAS });
    K.solid({ x: 0, z: lz, hx: 0.42, hz: 0.32 });
    // Three whiteboards across the back of the stage, on legs with a pen tray; a tap opens them close up.
    const bz = F - 1.9, bw = 1.9;
    for (let i = 0; i < 3; i++) {
      const b = K.group((i - 1) * (bw + 0.15), top, bz);
      b.box(bw + 0.08, 1.12, 0.05, C.frame, 0, 1.45, -0.03);
      b.box(bw, 0.05, 0.12, C.frame, 0, 0.9, 0.05);
      for (const side of [-1, 1]) b.box(0.06, 0.9, 0.06, C.leg, side * (bw / 2 - 0.1), 0.45, 0);
      const face = b.picture(bw, 1.04, 1024, 560, paintBoard(i), 0, 1.45, 0.002, { name: `board${i}`, emissive: 0.72, depthBias: RM.MARK_BIAS });
      K.target(face, "whiteboard", `Whiteboard · ${BOARDS[i].caption} · tap for a close-up`, 1.05, { index: i });
    }
    K.solid({ x: 0, z: bz, hx: 1.5 * bw + 0.2, hz: 0.14 });

    // The dome's pictures: the slide over the stage, the latest blocks above it, a chart either side.
    const s0 = ROOMS.edgeEl(L, 0) / DEG + 2.5, s1 = s0 + 30, half = 34;
    const slideW = 1800, slideH = Math.round(slideW * (Math.sin(s1 * DEG) - Math.sin(s0 * DEG)) / (2 * half * DEG * Math.cos((s0 + s1) / 2 * DEG)));
    K.live({ id: "slide", tip: "The slide · tap for a close-up", az0: -half, az1: half, el0: s0, el1: s1, w: slideW, h: slideH,
      key: (f) => slideKey(f.reader), paint: (ctx, f) => paintSlide(ctx, f.reader) });
    const c0 = s1 + 2, slot = 10, cardW = (slot - 1.6) * DEG * L.R * Math.cos((c0 + 2.5) * DEG), cardEl = cardW * CH.CARD_H / CH.CARD_W / (L.R * DEG);
    for (let i = 0; i < 10; i++) {
      const az = -4.5 * slot + i * slot;
      K.live({ board: "charts", tip: "Latest blocks · tap for the charts", az0: az - slot / 2 + 0.8, az1: az + slot / 2 - 0.8, el0: c0, el1: c0 + cardEl, w: CH.CARD_W, h: CH.CARD_H,
        key: (f, now) => cardKey(f.reader, i, now), paint: (ctx, f, now) => { const blocks = f.reader.value("recent"); if (i === 0) CH.ribbonLabel(ctx, f.reader.status("recent")); else CH.card(ctx, blocks && blocks[i - 1], now); } });
    }
    const e0 = Math.max(ROOMS.edgeEl(L, 78 * DEG) / DEG, s0) + 3, e1 = e0 + 20, span = 20 * CH.PANEL_W / CH.PANEL_H / Math.cos((e0 + e1) / 2 * DEG);
    [["mempool", -61], ["difficulty", 61]].forEach(([id, az]) => {
      const i = CH.PANELS.findIndex((p) => p.id === id);
      K.live({ board: "charts", panel: i, tip: `${CH.PANELS[i].title} · tap for a close-up`, az0: az - span / 2, az1: az + span / 2, el0: e0, el1: e1, w: CH.PANEL_W, h: CH.PANEL_H,
        key: (f, now) => chartKey(f.reader, i, now), paint: (ctx, f, now) => CH.PANELS[i].paint(ctx, f.reader, now) });
    });

    // Point lights, the fixed ones first: the stage, the dome's warm glow over the front, a pale fill from the back.
    K.light(0, top + 4.2, F + 3.2, 10, 0.95, 0.72, 0.46);
    K.light(0, L.c + 0.45 * L.R, -0.35 * L.R, 30, 0.8, 0.52, 0.24);
    K.light(0.3 * L.R, L.c + 0.3 * L.R, 0.4 * L.R, 26, 0.42, 0.4, 0.36);
    K.light(-0.3 * L.R, L.c + 0.2 * L.R, 0.15 * L.R, 20, 0.36, 0.3, 0.24);
  };

  // Nothing moves here; a tap on a whiteboard or the slide opens all four close up, paged with the arrow keys.
  const animate = (nodes, built) => {
    const pages = [];
    let index = 0, version = 0;
    const board = {
      title: "Lecture Hall", help: "Today's slide and the three whiteboards. Arrow keys flip between them.", wide: true,
      get canvas() { return pages[index].canvas; }, get count() { return pages.length; }, get index() { return index; },
      get caption() { return pages[index].caption; }, get note() { return pages[index].note; }, get version() { return version; },
      go: (i) => { index = i; version++; }
    };
    const open = (hud, slide, which) => {
      pages.length = 0;
      if (slide) pages.push({ canvas: slide, caption: "Why the chain can't be rewritten", note: "Lecture 4 · Proof of work. While mempool.space answers, the three blocks are the latest three." });
      for (let i = 0; i < 3; i++) pages.push({ canvas: nodes[`board${i}`].geometry.imageSurface.canvas, caption: BOARDS[i].caption, note: BOARDS[i].note });
      index = which < 0 ? 0 : which + (slide ? 1 : 0); version++;
      hud.openBoard(board);
      return true;
    };
    const slideLive = built.live.find((l) => l.spec.id === "slide");
    const slideCanvas = () => slideLive && slideLive.node.geometry ? slideLive.node.geometry.imageSurface.canvas : null;
    return {
      update() {},
      tap(owner, hud) {
        if (owner.kind === "whiteboard") return open(hud, slideCanvas(), owner.index);
        if (owner.kind === "live" && owner.slot.spec.id === "slide") return open(hud, owner.slot.canvas, -1);
        return false;
      }
    };
  };
  BL.timechainRoomKinds.lecture = { plan, animate, door };
})();
