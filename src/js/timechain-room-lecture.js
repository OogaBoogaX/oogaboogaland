// Room 1, the Lecture Hall: four broad terraces stepping down from the doorway's landing to a round stage, each a
// lounge: leather armchairs well apart either side of the aisle, a small side table with a lamp beside each, and
// room all round them to walk. On the stage a lectern with a tablet, a side table and a low walnut backdrop; there are no
// boards on the stage, since the dome is the board. The dome's screens wrap far round the hall: over the stage the
// slide, why the chain can't be rewritten, drawn from the latest three blocks while mempool.space has them; a
// whiteboard either side of it (a block header to its left, a Merkle tree to its right, in a marker hand); behind
// those, out past the side walls, the subsidy's halvings on a third whiteboard and the difficulty chart; and along
// the top of all of them the latest blocks as a strip of cards from end to end, all live (timechain-blocks.js). The
// rest of the dome is dark and faintly panelled. An armchair and its table stand in a walker's way; the stage, part
// of the floor (timechain-rooms.js `floorAt`), is a step up from the hall's foot. The door is dark walnut with brass
// portholes, push plates and kick plates.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { box, merge, moved, turnedX } = BL.models;
  const { own } = RM.helpers;
  const P = RM.paintKit, DEG = ROOMS.DEG;
  const C = {
    leather: "#3a2a20", leatherLt: "#4a362a", piping: "#c4700f", post: "#1d1b19", walnut: "#4a2f1b", walnutDk: "#33200f", walnutLt: "#5f3d22", stage: "#2b1c11", ring: "#c4700f",
    brass: "#b08a3a", plate: "#14110e", amber: "#f7931a", glass: "#9fc4d0", book: "#d9621e", page: "#efe6d2",
    amberText: "#ffb04d", white: "#f4efe6", grey: "#a89c8b", green: "#4fd08a"
  };
  // How far in front of an armchair its sitter stands up (clear of the chair for the widest Ooga), the circle the
  // chair stands in a walker's way as, and its side table: how far to the chair's side, its top's height and radius.
  const FRONT = 1.1, CHAIR_R = 0.45, TABLE = { side: 0.86, top: 0.52, r: 0.2 };
  // A lounge armchair on a walnut plinth, its back toward +z, so the sitter faces -z: a deep leather seat between two
  // padded arms, a back leaning away and a headrest.
  const chair = own(() => merge(
    box({ w: 0.8, h: 0.12, d: 0.74, color: C.walnutDk, offset: { y: 0.06, z: 0.04 } }),
    box({ w: 0.64, h: 0.2, d: 0.64, color: C.leather, offset: { y: 0.22 } }),
    box({ w: 0.6, h: 0.08, d: 0.6, color: C.leatherLt, offset: { y: 0.36, z: -0.01 } }),
    box({ w: 0.6, h: 0.02, d: 0.03, color: C.piping, offset: { y: 0.39, z: -0.3 } }),
    moved(turnedX(box({ w: 0.72, h: 0.66, d: 0.14, color: C.leather }), 0.2), 0, 0.68, 0.36),
    moved(turnedX(box({ w: 0.44, h: 0.2, d: 0.07, color: C.leatherLt }), 0.2), 0, 0.9, 0.31),
    box({ w: 0.15, h: 0.44, d: 0.72, color: C.leather, offset: { x: -0.395, y: 0.34, z: 0.03 } }), box({ w: 0.15, h: 0.44, d: 0.72, color: C.leather, offset: { x: 0.395, y: 0.34, z: 0.03 } }),
    box({ w: 0.17, h: 0.03, d: 0.74, color: C.walnut, offset: { x: -0.395, y: 0.575, z: 0.03 } }), box({ w: 0.17, h: 0.03, d: 0.74, color: C.walnut, offset: { x: 0.395, y: 0.575, z: 0.03 } })
  ));
  // The ₿ the Conference Room's table carries, a pixel art of 11 by 12, here on the lectern's plate.
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];
  const paintPlate = (ctx, w, h) => {
    ctx.fillStyle = C.plate; ctx.fillRect(0, 0, w, h);
    const cell = Math.floor(h * 0.62 / BITCOIN.length), x0 = Math.round((w - cell * 11) / 2), y0 = Math.round((h - cell * 12) / 2);
    ctx.fillStyle = C.amber;
    BITCOIN.forEach((row, j) => { for (let i = 0; i < 11; i++) if (row[i] === "1") ctx.fillRect(x0 + i * cell, y0 + j * cell, cell, cell); });
  };
  // The three whiteboards, in a marker hand on a white board with faint smudges (the mock-up's `boardCanvas`), each
  // drawn 1024 by 560 and laid whole into its screen on the dome (`onScreen`).
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

  // A whiteboard on its screen: drawn at its own size, then laid in as large as fits, on paper a shade under white so
  // the hall's lamps, which light the dome too, do not bloom it out.
  const BOARD_W = 1024, BOARD_H = 560, PAPER = "#b4b1a6";
  let sheet = null;
  const onScreen = (which) => (ctx) => {
    const W = ctx.canvas.width, H = ctx.canvas.height, k = Math.min(W / BOARD_W, H / BOARD_H);
    if (!sheet) sheet = CH.canvas(BOARD_W, BOARD_H);
    paintBoard(which)(sheet.getContext("2d"), BOARD_W, BOARD_H);
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "multiply"; ctx.drawImage(sheet, (W - BOARD_W * k) / 2, (H - BOARD_H * k) / 2, BOARD_W * k, BOARD_H * k);
    ctx.globalCompositeOperation = "source-over";
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
    P.pix(ctx, "PROOF OF WORK", u * 7, H - u * 5.4, u * 3.2, C.grey, "left");
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
  // ---------- its door ----------
  // Dark walnut leaves, each a raised panel under a brass porthole, with a brass push plate by the seam and a kick
  // plate along the foot, in a walnut frame set in a panelled bay; a brass sconce either side.
  const door = {
    casing: "#2a1a10", frame: "#5f3d22", header: "#33200f", word: "#ffb04d", strip: null, chain: false,
    leaf: "#4a2f1b", seam: "#1a0f08", plate: "#b08a3a", face: "#f7931a", mark: "#1a0f08",
    leafFace(side, H) {
      for (let x = -0.68; x < 0.72; x += 0.17) H.rect(x, 0.36, x + 0.006, 3.12, "#3d2616");
      H.rect(-0.56, 0.5, 0.56, 1.42, "#3d2616", 0, 1); H.rect(-0.5, 0.56, 0.5, 1.36, "#553620", 0, 2);
      H.rect(-0.56, 2.86, 0.56, 3.06, "#3d2616", 0, 1);
      H.disc(0, 2.2, 0.36, C.brass, 0.12, 20, 1); H.disc(0, 2.2, 0.29, "#0f1418", 0, 20, 2); H.disc(0, 2.2, 0.27, C.glass, 0.3, 20, 3);
      H.line(-0.19, 2.2, 0.19, 2.2, 0.012, "#6f8f99", 0.2, 4); H.line(0, 2.01, 0, 2.39, 0.012, "#6f8f99", 0.2, 4);
      H.rect(H.inner + side * 0.06, 1.52, H.inner + side * 0.2, 1.98, C.brass, 0.14, 2);
      H.rect(-0.75, 0.04, 0.75, 0.3, C.brass, 0.12, 1);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), z = d.Z - 0.02;
    // The bay's panelling: a dado rail, and a raised panel either side below it, clear of the Exit button.
    for (const side of [-1, 1]) {
      K.box(d.B - d.W - d.F - 0.1, 0.06, 0.04, C.walnutLt, side * (d.B + d.W + d.F) / 2, 1.72, z);
      K.box(0.5, 0.56, 0.03, C.walnutDk, side * 2.2, 0.48, z);
      // A sconce: a brass arm and its warm glass.
      K.box(0.06, 0.2, 0.08, C.brass, side * 2.42, 3.05, z - 0.03);
      K.ball(0.09, "#ffcf8a", side * 2.42, 3.24, z - 0.07, { emissive: 1, glow: true, seg: 8 });
    }
  };

  // ---------- the dome's screens ----------
  // In degrees: the slide over the stage, a screen to its right and one to its left as far round as the side walls, a
  // smaller one behind each of those, and the blocks as a strip above. (The band left under the slide is a caption's.)
  const screens = (L) => {
    const edge = (az) => ROOMS.edgeEl(L, az * DEG) / DEG;
    // The slide takes the front of the dome, 76 degrees round and 38 up; a screen either side of it carries on round
    // past the side walls, and a smaller one stands behind each of them. A screen's foot clears the dome's lower edge
    // where that edge is highest under it, at its end nearer the door.
    const s0 = edge(0) + 2.5, cap = 4.4, half = 38, slide0 = s0 + cap + 0.6, slide1 = slide0 + 38;
    const side0 = Math.max(edge(102) + 2.5, slide0), side1 = side0 + 31, rep0 = edge(150) + 2.5, rep1 = rep0 + 20;
    const px = (az, el0, el1, w) => Math.round(w * (Math.sin(el1 * DEG) - Math.sin(el0 * DEG)) / (az * DEG * Math.cos((el0 + el1) / 2 * DEG)));
    return {
      slide: { az0: -half, az1: half, el0: slide0, el1: slide1, w: 2048, h: px(2 * half, slide0, slide1, 2048) },
      right: { az0: 42, az1: 102, el0: side0, el1: side1, w: 1536, h: px(60, side0, side1, 1536) },
      left: { az0: -102, az1: -42, el0: side0, el1: side1, w: 1536, h: px(60, side0, side1, 1536) },
      rearRight: { az0: 108, az1: 150, el0: rep0, el1: rep1, w: 1024, h: px(42, rep0, rep1, 1024) },
      rearLeft: { az0: -150, az1: -108, el0: rep0, el1: rep1, w: 1024, h: px(42, rep0, rep1, 1024) },
      // The latest blocks, a ribbon over the tops of the three front screens, from end to end of them.
      cards: slide1 + 2, cards0: -102, cards1: 102
    };
  };
  // The block `back` below the tip. The newest reading holds fifteen; the ribbon is longer, and takes the rest from
  // the reader's window as its pages arrive.
  const blockBack = (reader, back) => reader.tip === null ? null : reader.block(reader.tip - back);
  const cardKey = (reader, i, now) => {
    if (i === 0) return `label|${reader.status("recent")}`;
    const b = blockBack(reader, i - 1);
    return b ? `${b.id}|${b.pool}|${CH.format.ago(now - b.time * 1000)}` : `none|${reader.status("recent")}`;
  };

  // Where the lectern stands on the stage, in the room's frame, from its focus `F`: off to one side of the middle and
  // turned in a little.
  const stageOf = (L) => ({ F: L.rake.F, top: L.rake.stageTop, r: L.rake.stage, lectern: { x: 1.7, z: L.rake.F + 1.7, ry: -0.3 } });

  const plan = (K, L) => {
    doorTrim(K, L);
    const R = L.rake, F = R.F, rows = R.rows;
    K.wallColor("#1c1611");
    K.rakeColors({ terrace: ["#241a12", "#1a130d"], nosing: C.ring, landing: "#20170f" });
    K.render({ sky: [0.52, 0.47, 0.42], ground: [0.22, 0.19, 0.16], ambientFloor: 0.42, bloomStrength: 0.55 });
    // The dome: dark, a little lighter toward its foot, faintly panelled.
    K.dome((ctx, D) => {
      D.sky(ctx, [[90, "#07080b"], [0, "#0b0c10"], [-14, "#0e0f12"]]);
      ctx.fillStyle = "rgba(150,170,210,.035)";
      for (let i = 0; i < 32; i++) ctx.fillRect(i * D.W / 32, 0, 3, D.H);
      for (let el = -10; el < 90; el += 10) ctx.fillRect(0, D.y(el), D.W, 2);
    });
    // An armchair at every place on every terrace, facing the stage; standing up leaves the sitter in front of it.
    // Beside each, on its side away from the aisle, a small round walnut table with a brass lamp.
    for (const s of R.seats) {
      const place = K.seat(s.x, s.z, s.heading + Math.PI, R.seatTop, s.floor, -FRONT);
      K.node(null, chair(), s.x, s.floor, s.z, { ry: s.heading, target: { kind: "chair", tip: "Lounge chair", radius: 0.6, index: place.index } });
      K.solid({ x: s.x, z: s.z, r: CHAIR_R });
      const d = rows[s.row].d, a = s.heading + Math.sign(s.heading) * TABLE.side / d, tx = d * Math.sin(a), tz = F + d * Math.cos(a), y = s.floor;
      K.cyl(TABLE.r * 0.8, TABLE.r * 0.9, 0.03, C.post, tx, y + 0.015, tz, { seg: 12 });
      K.cyl(0.03, 0.03, TABLE.top - 0.06, C.post, tx, y + TABLE.top / 2, tz, { seg: 8 });
      K.cyl(TABLE.r, TABLE.r, 0.04, C.walnutLt, tx, y + TABLE.top - 0.02, tz, { seg: 16 });
      K.cyl(0.02, 0.03, 0.14, C.brass, tx, y + TABLE.top + 0.07, tz, { seg: 8 });
      K.ball(0.055, "#ffcf8a", tx, y + TABLE.top + 0.18, tz, { emissive: 1, glow: true, seg: 8 });
      K.solid({ x: tx, z: tz, r: TABLE.r });
    }
    // The round stage at the focus, its rim lit amber, laid in rings so Canvas 2D sorts what stands on it over it.
    const S = stageOf(L), dS = S.r, top = S.top;
    K.cyl(dS * 0.34, dS * 0.34, top - L.yMin, C.stage, 0, (L.yMin + top) / 2, F, { seg: 64 });
    K.sector(F, dS * 0.34, dS * 0.68, -Math.PI, Math.PI, L.yMin, top, C.stage, { steps: 64 });
    K.sector(F, dS * 0.68, dS, -Math.PI, Math.PI, L.yMin, top, C.walnutDk, { steps: 64 });
    K.torus(dS, 0.03, C.ring, 0, top, F, { emissive: 0.9, glow: true, seg: 96, sides: 4 });
    // The backdrop behind the stage: walnut slats, low enough to leave the slide's foot in sight from every row.
    for (let i = 0; i < 26; i++) {
      const a = Math.PI - 0.98 + 1.96 * i / 26;
      K.sector(F, dS + 0.85, dS + (i & 1 ? 0.93 : 0.99), a, a + 1.96 / 26, L.yMin, L.yMin + 2.2, i & 1 ? C.walnutDk : C.walnut, { steps: 1 });
    }
    K.sector(F, dS + 0.82, dS + 1.02, Math.PI - 0.98, Math.PI + 0.98, L.yMin + 2.2, L.yMin + 2.26, C.brass, { steps: 26 });
    // The lectern: a walnut stand at an Ooga's chest height, the ₿ on its front, and its reading top and tablet tipped
    // toward the speaker: high at the hall's side, low at his.
    const T = K.group(S.lectern.x, top, S.lectern.z, S.lectern.ry);
    T.node("lectern", (k) => {
      k.box(0.86, 0.74, 0.5, C.walnut, 0, 0.37, 0);
      k.box(0.94, 0.05, 0.6, C.walnutLt, 0, 0.78, -0.02, { rx: -0.2 });
      k.box(0.9, 0.06, 0.06, C.brass, 0, 0.06, 0.26);
    }, 0, 0, 0, { target: { kind: "lectern", tip: "Lectern", radius: 0.7, data: { say: "Lecture 4 · Proof of work · today's slide is on the dome" } } });
    T.picture(0.42, 0.42, 128, 128, paintPlate, 0, 0.42, 0.255, { emissive: 0.85, depthBias: RM.MARK_BIAS });
    T.node("tablet", (k) => { k.box(0.56, 0.02, 0.38, "#0c0c0d", 0, 0, 0); k.box(0.5, 0.006, 0.32, "#7f93b0", 0, 0.013, 0, { emissive: 0.4 }); }, 0, 0.817, -0.028, { rx: -0.2 });
    K.solid({ x: S.lectern.x, z: S.lectern.z, hx: 0.5, hz: 0.34, ry: S.lectern.ry });
    // A side table with the book and a glass of water.
    const side = K.group(3.25, top, F + 0.55, -0.5);
    side.cyl(0.3, 0.3, 0.04, C.walnutLt, 0, 0.72, 0, { seg: 20 }); side.cyl(0.04, 0.04, 0.7, C.post, 0, 0.36, 0, { seg: 8 }); side.cyl(0.2, 0.22, 0.03, C.post, 0, 0.015, 0, { seg: 16 });
    side.box(0.24, 0.05, 0.32, C.book, -0.06, 0.765, 0.02, { ry: 0.3 }); side.box(0.22, 0.036, 0.3, C.page, -0.055, 0.765, 0.025, { ry: 0.3 });
    side.cyl(0.035, 0.03, 0.11, C.glass, 0.14, 0.795, -0.08, { seg: 10, emissive: 0.2 });
    K.solid({ x: 3.25, z: F + 0.55, r: 0.3 });
    // The dome's screens: the slide, three whiteboards and a chart, and the latest blocks along the top of them.
    const D = screens(L);
    K.live({ id: "slide", tip: "The slide · tap for a close-up", ...D.slide, key: (f) => slideKey(f.reader), paint: (ctx, f) => paintSlide(ctx, f.reader) });
    [["board0", D.left], ["board1", D.right], ["board2", D.rearLeft]].forEach(([id, rect], i) =>
      K.live({ id, tip: `Whiteboard · ${BOARDS[i].caption} · tap for a close-up`, ...rect, emissive: 0.5, key: () => "drawn", paint: onScreen(i) }));
    // The chart keeps its own shape, in the middle of its screen's place.
    const chart = CH.PANELS.findIndex((p) => p.id === "difficulty"), rr = D.rearRight, mid = (rr.az0 + rr.az1) / 2;
    const span = (rr.el1 - rr.el0) * CH.PANEL_W / CH.PANEL_H / Math.cos((rr.el0 + rr.el1) / 2 * DEG);
    K.live({ board: "charts", panel: chart, tip: `${CH.PANELS[chart].title} · tap for a close-up`, az0: mid - span / 2, az1: mid + span / 2, el0: rr.el0, el1: rr.el1, w: CH.PANEL_W, h: CH.PANEL_H,
      key: (f, now) => chartKey(f.reader, chart, now), paint: (ctx, f, now) => CH.PANELS[chart].paint(ctx, f.reader, now) });
    // As many cards of the one size as the ribbon's length holds, the label first and then the tip and the blocks
    // under it, newest nearest the label.
    const slot = 10, count = Math.floor((D.cards1 - D.cards0) / slot), first = (D.cards0 + D.cards1 - (count - 1) * slot) / 2;
    const cardW = (slot - 1.6) * DEG * L.R * Math.cos((D.cards + 2.5) * DEG), cardEl = cardW * CH.CARD_H / CH.CARD_W / (L.R * DEG);
    for (let i = 0; i < count; i++) {
      const az = first + i * slot;
      K.live({ board: "charts", tip: "Latest blocks · tap for the charts", az0: az - slot / 2 + 0.8, az1: az + slot / 2 - 0.8, el0: D.cards, el1: D.cards + cardEl, w: CH.CARD_W, h: CH.CARD_H,
        key: (f, now) => cardKey(f.reader, i, now), paint: (ctx, f, now) => { if (i === 0) CH.ribbonLabel(ctx, f.reader.status("recent")); else CH.card(ctx, blockBack(f.reader, i - 1), now); } });
    }

    // Point lights, the fixed ones first: the stage, the dome's warm glow over the front, a pale fill from the back.
    K.light(0.6, top + 4.2, F + 2.6, 11, 1.0, 0.76, 0.5);
    K.light(0, L.c + 0.45 * L.R, -0.35 * L.R, 30, 0.8, 0.52, 0.24);
    K.light(0.3 * L.R, L.c + 0.3 * L.R, 0.4 * L.R, 26, 0.42, 0.4, 0.36);
    K.light(-0.3 * L.R, L.c + 0.2 * L.R, 0.15 * L.R, 20, 0.36, 0.3, 0.24);
  };

  // Nothing moves here; a tap on the slide or a whiteboard opens all four close up, paged with the arrow keys.
  const animate = (nodes, built) => {
    const live = {}, pages = [];
    for (const l of built.live) if (l.spec.id) live[l.spec.id] = l;
    const canvasOf = (id) => { const g = live[id].node.geometry; return g ? g.imageSurface.canvas : null; };
    let index = 0, version = 0;
    const board = {
      title: "Lecture Hall", help: "Today's slide and the three whiteboards. Arrow keys flip between them.", wide: true,
      get canvas() { return pages[index].canvas; }, get count() { return pages.length; }, get index() { return index; },
      get caption() { return pages[index].caption; }, get note() { return pages[index].note; }, get version() { return version; },
      go: (i) => { index = i; version++; }
    };
    const open = (hud, id) => {
      pages.length = 0;
      const add = (key, caption, note) => { const canvas = canvasOf(key); if (canvas) { if (key === id) index = pages.length; pages.push({ canvas, caption, note }); } };
      index = 0;
      add("slide", "Why the chain can't be rewritten", "Lecture 4 · Proof of work. While mempool.space answers, the three blocks are the latest three.");
      BOARDS.forEach((b, i) => add(`board${i}`, b.caption, b.note));
      if (!pages.length) return false;
      version++;
      hud.openBoard(board);
      return true;
    };
    return {
      update() {},
      tap(owner, hud) { return owner.kind === "live" && !!owner.slot.spec.id && open(hud, owner.slot.spec.id); }
    };
  };
  BL.timechainRoomKinds.lecture = { plan, animate, door };
})();
