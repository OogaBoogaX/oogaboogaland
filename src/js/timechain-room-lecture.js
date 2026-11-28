// Room 1, the Lecture Hall: four broad terraces stepping down from the doorway's landing to a round stage, each a
// lounge: leather armchairs well apart either side of the aisle, a small side table with a lamp beside each, and
// room all round them to walk. On the stage a lectern with a drawing tablet, a side table and a low walnut backdrop; there
// are no boards on the stage, since the dome is the board. Over the stage the dome carries the lecture: the slide in
// the middle with the sentence being said under it, the board to its right (what the lecturer draws at his tablet,
// stroke by stroke), the lecture's outline and how far it has run to its left, and the latest blocks as a strip
// above all three (timechain-blocks.js). A lecture is
// data (lecture-kit.js), drawn by lecture-slides.js, timed by lecture-player.js and given by the course's lecturer,
// Professor Pumponopoulos (lecturer.js); this file is the hall and what joins them. The lectern, or the programme on its stand by the door,
// opens the course's programme; Lectures, Pause and the section buttons in the banner do the rest. The door is dark
// walnut with brass portholes, push plates and kick plates, and a sign beside it that lights while a lecture runs.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms, LK = BL.lectures, LS = BL.lectureSlides;
  const { box, merge, moved, turnedX } = BL.models;
  const { own, litWord } = RM.helpers;
  const P = RM.paintKit, DEG = ROOMS.DEG;
  const COURSE = "first-principles";
  const C = {
    leather: "#3a2a20", leatherLt: "#4a362a", piping: "#c4700f", post: "#1d1b19", walnut: "#4a2f1b", walnutDk: "#33200f", walnutLt: "#5f3d22", stage: "#2b1c11", ring: "#c4700f",
    brass: "#b08a3a", plate: "#14110e", amber: "#f7931a", glass: "#9fc4d0", book: "#d9621e", page: "#efe6d2"
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
    // The trim ends at the cushion's front (-0.31), clear of its coplanar top and side faces.
    box({ w: 0.6, h: 0.02, d: 0.03, color: C.piping, offset: { y: 0.39, z: -0.325 } }),
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
  // The programme on its stand by the door: the course and how to start a lecture.
  const paintStand = (ctx, w, h) => {
    const course = LK.courseOf(COURSE);
    ctx.fillStyle = "#16120e"; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = C.brass; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    P.pix(ctx, "TODAY IN THE HALL", w / 2, 54, 22, "#ffb04d");
    ctx.fillStyle = "#f4efe6"; ctx.textAlign = "center"; P.fit(ctx, course.title, w - 60, 800, 62); ctx.fillText(course.title, w / 2, 150);
    ctx.fillStyle = "#d8d0c2"; P.fit(ctx, course.subtitle, w - 60, 400, 26); ctx.fillText(course.subtitle, w / 2, 194);
    if (course.by) { ctx.fillStyle = "#ffb04d"; P.fit(ctx, `with ${course.by}`, w - 60, 600, 24); ctx.fillText(`with ${course.by}`, w / 2, 228); }
    ctx.textAlign = "left";
    course.lectures.forEach((l, i) => { ctx.fillStyle = "#ffb04d"; ctx.font = P.font(700, 19, P.MONO); ctx.fillText(String(l.n).padStart(2, " "), 44, 274 + i * 28); ctx.fillStyle = "#f4efe6"; P.fit(ctx, l.title, w - 130, 500, 21); ctx.fillText(l.title, 88, 274 + i * 28); });
    P.pix(ctx, "TAP TO CHOOSE A LECTURE", w / 2, h - 40, 17, "#a89c8b");
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
  const SIGN = { x: 2.18, y: 2.55 };
  const signOn = own(() => merge(box({ w: 0.86, h: 0.3, d: 0.05, color: "#2a0d06", emissive: 0.5 }), litWord("IN SESSION", 0.013, "#ff7a3c", 1, -0.03)));
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
    // The sign beside the doors: dark between lectures, lit while one runs (`session`).
    K.box(0.92, 0.36, 0.05, C.brass, SIGN.x, SIGN.y, z - 0.01);
    K.box(0.86, 0.3, 0.05, "#1a0d08", SIGN.x, SIGN.y, z - 0.02);
    K.node("session", signOn(), SIGN.x, SIGN.y, z - 0.025, { glow: true });
  };

  // ---------- the dome's screens ----------
  // In degrees: the caption under the slide, the board to its right and the outline to its left as tall as the slide,
  // a copy of the slide out to either side, and the blocks as a strip above.
  const screens = (L) => {
    const edge = (az) => ROOMS.edgeEl(L, az * DEG) / DEG;
    // The slide takes the front of the dome, 76 degrees round and 38 up, over its caption; the board and the outline
    // carry on round from it past the side walls. Those three are all the lecture has. A screen's
    // foot clears the dome's lower edge where that edge is highest under it, at its end nearer the door.
    const s0 = edge(0) + 2.5, cap = 4.4, half = 38, slide0 = s0 + cap + 0.6, slide1 = slide0 + 38;
    const side0 = Math.max(edge(102) + 2.5, slide0), side1 = side0 + 31;
    const px = (az, el0, el1, w) => Math.round(w * (Math.sin(el1 * DEG) - Math.sin(el0 * DEG)) / (az * DEG * Math.cos((el0 + el1) / 2 * DEG)));
    return {
      slide: { az0: -half, az1: half, el0: slide0, el1: slide1, w: 2048, h: px(2 * half, slide0, slide1, 2048) },
      caption: { az0: -half, az1: half, el0: s0, el1: s0 + cap, w: 2048, h: px(2 * half, s0, s0 + cap, 2048) },
      board: { az0: 42, az1: 102, el0: side0, el1: side1, w: 1536, h: px(60, side0, side1, 1536), emissive: 0.5 },
      outline: { az0: -102, az1: -42, el0: side0, el1: side1, w: 1280, h: px(60, side0, side1, 1280) },
      // The latest blocks, a ribbon over the tops of the outline, the slide and the board, from end to end of them.
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
  const HINT = "Choose a lecture at the lectern, or press Lectures";
  const LECTURE_SCREENS = ["slide", "caption", "board", "outline"];
  // What each of the lecture's screens shows before a lecture is chosen; `animate` repaints them from then on.
  const IDLE = {
    slide: (ctx) => LS.idleSlide(ctx, ctx.canvas.width, ctx.canvas.height, P, LK.courseOf(COURSE), HINT),
    caption: (ctx) => LS.caption(ctx, ctx.canvas.width, ctx.canvas.height, P, "", false),
    board: (ctx) => LS.boardIdle(ctx, ctx.canvas.width, ctx.canvas.height, P),
    outline: (ctx) => LS.programme(ctx, ctx.canvas.width, ctx.canvas.height, P, LK.courseOf(COURSE), null, 0, [], l => l.available !== false)
  };
  const TIPS = { slide: "The slide · tap for a close-up", board: "The board · tap for a close-up", outline: "The lecture's outline · tap for the programme", caption: "" };
  // Where things stand on the stage, in the room's frame, from its focus `F`: the lectern off to one side of the middle
  // and turned in a little, and the places the lecturer gives a lecture from (lecture-kit.js `PLACES`), each with the
  // heading he keeps there (0 faces the hall).
  // How far the lectern's reading top tips toward the speaker.
  const LECTERN_TILT = 0.2;
  const stageOf = (L) => {
    const F = L.rake.F, top = L.rake.stageTop;
    return {
      // The lectern: where it stands and how it is turned, and its reading top as the lecturer's hands must know it,
      // in its own frame (+z toward the hall): its half width and half depth, where its middle is, how high that is
      // over the stage, and its slope, down toward whoever stands behind it.
      F, top, r: L.rake.stage, lectern: { x: 1.7, z: F + 1.7, ry: -0.3, hx: 0.47, hz: 0.3, topZ: -0.02, top: 0.815, slope: Math.tan(LECTERN_TILT) },
      // What stands on the stage in a walker's way, each as a circle a body keeps outside: the lectern, the side table.
      blocks: [{ x: 1.7, z: F + 1.7, r: 0.72 }, { x: 3.25, z: F + 0.55, r: 0.62 }],
      places: {
        lectern: { x: 1.92, z: F + 0.98, ry: -0.3 }, tablet: { x: 1.92, z: F + 0.98, ry: -0.3 }, centre: { x: 0, z: F + 2.6, ry: 0 },
        left: { x: -2.5, z: F + 1.9, ry: 0.28 }, right: { x: 0.2, z: F + 1.3, ry: -0.2 }, screen: { x: -1.3, z: F + 0.5, ry: 2.5 }
      }
    };
  };

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
      const row = rows[s.row], rear = s.row + 1 < rows.length ? (row.d + rows[s.row + 1].d) / 2 : row.rOut;
      // Leave the chair back clear of the riser; at the ends, the curved wall also bounds its table.
      const wall = ROOMS.wallAt(L, s.floor);
      let d = Math.min(row.d + 0.85, rear - 0.6), x, z, tx, tz;
      for (;;) {
        const a = s.heading + Math.sign(s.heading) * TABLE.side / d;
        x = d * Math.sin(s.heading); z = F + d * Math.cos(s.heading);
        tx = d * Math.sin(a); tz = F + d * Math.cos(a);
        if (d <= row.d || Math.hypot(x, z) + 0.6 < wall && Math.hypot(tx, tz) + TABLE.r + 0.1 < wall) break;
        d = Math.max(row.d, d - 0.05);
      }
      const place = K.seat(x, z, s.heading + Math.PI, R.seatTop, s.floor, -FRONT);
      K.node(null, chair(), x, s.floor, z, { ry: s.heading, target: { kind: "chair", tip: "Lounge chair", radius: 0.6, index: place.index } });
      K.solid({ x, z, r: CHAIR_R });
      const y = s.floor;
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
    // The lectern: a walnut stand at an Ooga's chest height, the ₿ on its front, and its reading top and the tablet he
    // draws on tipped toward him: high at the hall's side, low at his.
    const T = K.group(S.lectern.x, top, S.lectern.z, S.lectern.ry);
    T.node("lectern", (k) => {
      k.box(0.86, 0.74, 0.5, C.walnut, 0, 0.37, 0);
      k.box(0.94, 0.05, 0.6, C.walnutLt, 0, 0.78, -0.02, { rx: -LECTERN_TILT });
      k.box(0.9, 0.06, 0.06, C.brass, 0, 0.06, 0.26);
    }, 0, 0, 0, { target: { kind: "lectern", tip: "The lectern · choose a lecture", radius: 0.7 } });
    T.picture(0.42, 0.42, 128, 128, paintPlate, 0, 0.42, 0.255, { emissive: 0.85, depthBias: RM.MARK_BIAS });
    T.node("tablet", (k) => { k.box(0.56, 0.02, 0.38, "#0c0c0d", 0, 0, 0); k.box(0.5, 0.006, 0.32, "#7f93b0", 0, 0.013, 0, { emissive: 0.4 }); }, 0, 0.817, -0.028, { rx: -LECTERN_TILT });
    K.solid({ x: S.lectern.x, z: S.lectern.z, hx: 0.5, hz: 0.34, ry: S.lectern.ry });
    // A side table with the book and a glass of water.
    const side = K.group(3.25, top, F + 0.55, -0.5);
    side.cyl(0.3, 0.3, 0.04, C.walnutLt, 0, 0.72, 0, { seg: 20 }); side.cyl(0.04, 0.04, 0.7, C.post, 0, 0.36, 0, { seg: 8 }); side.cyl(0.2, 0.22, 0.03, C.post, 0, 0.015, 0, { seg: 16 });
    side.box(0.24, 0.05, 0.32, C.book, -0.06, 0.765, 0.02, { ry: 0.3 }); side.box(0.22, 0.036, 0.3, C.page, -0.055, 0.765, 0.025, { ry: 0.3 });
    side.cyl(0.035, 0.03, 0.11, C.glass, 0.14, 0.795, -0.08, { seg: 10, emissive: 0.2 });
    K.solid({ x: 3.25, z: F + 0.55, r: 0.3 });
    // The programme beside the entrance, backed up to the curved wall and parallel to its tangent.
    const standX = -3.5, standR = Math.min(ROOMS.radiusAt(L, 0), ROOMS.radiusAt(L, 1.9));
    const standZ = Math.sqrt(standR * standR - standX * standX) - 0.25;
    const stand = K.group(standX, 0, standZ, Math.atan2(-standX, -standZ));
    // Supports stay behind the panel, clear of its face and the interactive flashing highlight.
    stand.box(0.06, 1.5, 0.06, C.brass, -0.36, 0.75, -0.08); stand.box(0.06, 1.5, 0.06, C.brass, 0.36, 0.75, -0.08); stand.box(0.8, 0.05, 0.3, C.brass, 0, 0.03, 0);
    stand.box(0.86, 1.16, 0.05, C.walnutDk, 0, 1.3, 0);
    const sheet = stand.picture(0.78, 1.08, 520, 720, paintStand, 0, 1.3, 0.055, { emissive: 0.8, depthBias: RM.MARK_BIAS });
    K.target(sheet, "programme", "The programme · choose a lecture", 0.7);
    K.solid({ x: standX, z: standZ, r: 0.46 });

    // The dome's screens: the lecture's own, which `animate` repaints, and the latest blocks, which the scene keeps.
    const D = screens(L);
    for (const id of LECTURE_SCREENS) K.live({ id, tip: TIPS[id], ...D[id], key: () => "idle", paint: IDLE[id] });
    // Twice the card and type size, with half as many slots spanning the same three screens. Paint at twice the
    // resolution too, so the enlarged text stays sharp. The label comes first, then the newest blocks.
    const scale = 2, slot = 10 * scale, inset = 0.8 * scale;
    const count = Math.floor((D.cards1 - D.cards0) / slot), first = (D.cards0 + D.cards1 - (count - 1) * slot) / 2;
    const cardW = (slot - 2 * inset) * DEG * L.R * Math.cos((D.cards + 2.5) * DEG), cardEl = cardW * CH.CARD_H / CH.CARD_W / (L.R * DEG);
    for (let i = 0; i < count; i++) {
      const az = first + i * slot;
      K.live({ board: "charts", tip: "Latest blocks", az0: az - slot / 2 + inset, az1: az + slot / 2 - inset, el0: D.cards, el1: D.cards + cardEl, w: CH.CARD_W * scale, h: CH.CARD_H * scale,
        key: (f, now) => cardKey(f.reader, i, now), paint: (ctx, f, now) => {
          ctx.save(); ctx.scale(scale, scale);
          if (i === 0) CH.ribbonLabel(ctx, f.reader.status("recent")); else CH.card(ctx, blockBack(f.reader, i - 1), now);
          ctx.restore();
        } });
    }

    // Point lights, the fixed ones first: the stage, the dome's warm glow over the front, a pale fill from the back.
    K.light(0.6, top + 4.2, F + 2.6, 11, 1.0, 0.76, 0.5);
    K.light(0, L.c + 0.45 * L.R, -0.35 * L.R, 30, 0.8, 0.52, 0.24);
    K.light(0.3 * L.R, L.c + 0.3 * L.R, 0.4 * L.R, 26, 0.42, 0.4, 0.36);
    K.light(-0.3 * L.R, L.c + 0.2 * L.R, 0.15 * L.R, 20, 0.36, 0.3, 0.24);
  };

  // ---------- a visit ----------
  const BAR = ["lecture-programme", "lecture-toggle", "lecture-back", "lecture-next", "lecture-speed", "lecture-start", "lecture-stop"];
  const animate = (nodes, built, feeds, menuOpen) => {
    const L = built.layout, course = LK.courseOf(COURSE), S = stageOf(L);
    const query = new URLSearchParams(location.search);
    const player = BL.lecturePlayer.create({ speech: !query.has("nosim") && query.get("lecturevoice") !== "0" });
    const lecturer = BL.lecturer ? BL.lecturer.create({ parent: built.root, profile: course.lecturer, stage: S, hall: L }) : null;
    const st = player.state, mark = LS.mark(), pen = { x: 0, y: 0 };
    const live = {};
    for (const l of built.live) if (l.spec.id) live[l.spec.id] = l;
    const canvasOf = (id) => { const g = live[id].node.geometry; return g ? g.imageSurface.canvas : null; };
    let screensVersion = 0;
    const bump = (id) => { live[id].node.geometry.imageSurface.version++; screensVersion++; };
    // What each screen last printed, so a frame that changes nothing paints nothing.
    const seen = { slide: "", caption: "", outline: "", board: "", boardAt: 0, boardTime: -1, version: -1 };
    let hud = null, nearAction = null, drawing = false, motionTime = 0, boardGlow = 0, slideGlow = 0, hovered = -1, sectionHovered = -1, popupOpen = false, catalogueHovered = -1;
    const quizRows = [], sectionRows = [], catalogueRows = [], inverse = BL.math.mat4.create(), screenPoint = { x: 0, y: 0 };
    let scrubOwner = null, scrubOffset = 0;
    const asking = () => player.playing && player.waiting >= 0;
    // Match the curved canvas shader at the exact face hit, including its vertical texture flip.
    const pointOnScreen = (owner, ray, extend = false) => {
      if (!owner || owner.kind !== "live" || !ray) return false;
      let t = owner.pickRay(ray);
      if (!Number.isFinite(t) && extend) {
        // Continue a captured drag beyond the patch, clamping its longitude to the bar's ends.
        const y = ray.oy - L.c, dot = ray.ox * ray.dx + y * ray.dy + ray.oz * ray.dz;
        const disc = dot * dot - (ray.ox * ray.ox + y * y + ray.oz * ray.oz - (L.R * 0.994) ** 2);
        if (disc >= 0) t = -dot + Math.sqrt(disc);
      }
      if (!Number.isFinite(t) || t < 0) return false;
      const node = owner.slot.node, surface = node.geometry.imageSurface, rect = surface.rect, curve = surface.curve;
      BL.math.mat4.invert(inverse, node.world);
      const x = ray.ox + ray.dx * t, y = ray.oy + ray.dy * t, z = ray.oz + ray.dz * t, m = inverse;
      const lx = m[0] * x + m[4] * y + m[8] * z + m[12], ly = m[1] * x + m[5] * y + m[9] * z + m[13], lz = m[2] * x + m[6] * y + m[10] * z + m[14];
      screenPoint.x = (Math.atan2(lx, curve[0] - lz) * curve[0] - curve[1] - rect[0]) / rect[2] * surface.canvas.width;
      screenPoint.y = (1 - (ly - curve[2] - rect[1]) / rect[3]) * surface.canvas.height;
      return true;
    };
    const rowAt = (rows, x, y) => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return -1;
    };
    const answerAt = (owner, ray) => asking() && owner && owner.kind === "live" && owner.slot.spec.id === "slide" && pointOnScreen(owner, ray) ? rowAt(quizRows, screenPoint.x, screenPoint.y) : -1;
    const sectionAt = (owner, ray) => player.timeline && owner && owner.kind === "live" && owner.slot.spec.id === "outline" && pointOnScreen(owner, ray) ? rowAt(sectionRows, screenPoint.x, screenPoint.y) : -1;
    const catalogueAt = (owner, ray) => !player.timeline && owner && owner.kind === "live" && owner.slot.spec.id === "outline" && pointOnScreen(owner, ray) ? rowAt(catalogueRows, screenPoint.x, screenPoint.y) : -1;
    const jumpSection = (i) => {
      if (!player.timeline || i < 0 || i >= player.timeline.sections.length || player.scrubbing) return false;
      player.seek(player.timeline.sections[i].start); seekScene(); label(); return true;
    };
    const ready = (l) => !!l && l.available !== false && !!(LK.get(l.id) || BL.deferredScripts && BL.deferredScripts[l.group]);
    const metaOf = (T) => {
      const entry = player.entry, slide = T.slides[st.slide], sec = T.sections[slide ? slide.section : st.section];
      return { left: `LECTURE ${entry.n}`, mid: sec.title.toUpperCase().slice(0, 34), right: `${st.slide + 1} / ${T.slides.length}`, kicker: `${course.title} · Lecture ${entry.n} of ${course.lectures.length}`,
        part: `PART ${sec.i + 1} OF ${T.sections.length}`, credit: course.by ? `with ${course.by}` : course.subtitle, reader: feeds ? feeds.reader : null, now: Date.now(), quizRows, hover: asking() ? hovered : -1 };
    };
    const paintScreens = (elapsed) => {
      const T = player.timeline;
      for (const id of LECTURE_SCREENS) if (!canvasOf(id)) return;
      if (!T) {
        if (seen.slide !== "idle") {
          for (const id of LECTURE_SCREENS) if (id !== "outline") { const c = canvasOf(id); IDLE[id](c.getContext("2d")); bump(id); }
          seen.slide = "idle"; seen.caption = seen.outline = seen.board = ""; mark.epoch = -1; mark.settled = -1;
          sectionRows.length = quizRows.length = 0;
        }
        const key = `catalogue|${player.version}|${catalogueHovered}`;
        if (seen.outline !== key) {
          seen.outline = key;
          const c = canvasOf("outline");
          LS.programme(c.getContext("2d"), c.width, c.height, P, course, player.progress, nextLecture(), catalogueRows, ready, catalogueHovered);
          bump("outline");
        }
        return;
      }
      const t = player.time, slide = T.slides[st.slide], local = slide && slide.beat === st.beat ? st.sentence - T.beats[st.beat].first : 99;
      const liveKey = slide && slide.slide.k === "live" && feeds ? `${feeds.reader.version}|${Math.floor(Date.now() / 10000)}` : "";
      const sk = `${T.id}|${st.slide}|${st.show}|${slide && slide.slide.k === "figure" ? local : 0}|${liveKey}|${asking() ? hovered : -1}`;
      if (sk !== seen.slide && slide) {
        seen.slide = sk;
        const c = canvasOf("slide");
        LS.slide(c.getContext("2d"), c.width, c.height, P, slide.slide, st.show, local, metaOf(T));
        bump("slide");
      }
      const ck = `${T.id}|${st.sentence}|${player.playing}|${player.ended}`;
      if (ck !== seen.caption) { seen.caption = ck; const c = canvasOf("caption"); LS.caption(c.getContext("2d"), c.width, c.height, P, player.ended ? "" : T.sentences[st.sentence].text, !player.playing); bump("caption"); }
      const progress = player.scrubTime;
      const ok = `${T.id}|${st.section}|${Math.floor(progress)}|${player.playing}|${player.ended}|${player.scrubbing}|${sectionHovered}`;
      if (ok !== seen.outline) {
        seen.outline = ok;
        const c = canvasOf("outline"), entry = player.entry;
        LS.outline(c.getContext("2d"), c.width, c.height, P, T, st, progress, { kicker: `LECTURE ${entry.n} OF ${course.lectures.length}`, title: entry.title, state: player.ended ? "THE END" : player.playing ? "" : "PAUSED", sectionRows, hover: sectionHovered });
        bump("outline");
      }
      // The board: at once when its strokes change, a dozen times a second while one is being drawn.
      const bk = `${T.id}|${st.epoch}|${st.begun}`;
      if (bk !== seen.board || drawing && t !== seen.boardTime && elapsed - seen.boardAt > 0.08) {
        seen.board = bk; seen.boardAt = elapsed; seen.boardTime = t;
        const c = canvasOf("board");
        drawing = LS.board(c.getContext("2d"), c.width, c.height, P, T, st.epoch, t, mark);
        bump("board");
      }
    };
    // What on the slide each sentence is about, as a share of the slide across and down (-1 for none): the shapes of
    // a figure that come up with it, the point, line or row it reveals, or the slide's middle. Only an explicit
    // point gesture uses that target: a reveal or standing beside the screen never raises his arm by itself.
    const D = screens(L), aimAt = { x: 0, y: 0, z: 0 };
    // Both attention cues follow their screen's curved rim, sampled once.
    const cueOf = (screen) => {
      const centre = ROOMS.onSphere(L, (screen.az0 + screen.az1) / 2 * DEG, (screen.el0 + screen.el1) / 2 * DEG, 0.994);
      const rim = new Float32Array(64 * 3), point = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < 64; i++) {
        const edge = Math.floor(i / 16), along = i % 16 / 16;
        const x = edge === 0 ? along : edge === 1 ? 1 : edge === 2 ? 1 - along : 0;
        const y = edge === 0 ? 0 : edge === 1 ? along : edge === 2 ? 1 : 1 - along;
        ROOMS.onSphere(L, (screen.az0 + x * (screen.az1 - screen.az0)) * DEG, (screen.el0 + y * (screen.el1 - screen.el0)) * DEG, 0.994, point);
        rim[i * 3] = point.x; rim[i * 3 + 1] = point.y; rim[i * 3 + 2] = point.z;
      }
      return { centre, rim };
    };
    const boardCue = cueOf(D.board), slideCue = cueOf(D.slide);
    // A board passage keeps its focus between strokes and while paused. Other passages present the main slide,
    // including quiz prompts and replies; a previous drawing remaining on the board does not keep the focus.
    const focusScreen = () => !player.timeline ? null : player.timeline.beats[st.beat].epoch >= 0 ? "board" : "slide";
    const drawCue = (ctx, project, cue, glow, active) => {
      if (glow < 0.01) return;
      const { centre, rim } = cue;
      ctx.save();
      ctx.globalAlpha = glow * 0.75;
      ctx.strokeStyle = "#62da94"; ctx.shadowColor = "#62da94"; ctx.shadowBlur = 12; ctx.lineWidth = 2;
      ctx.beginPath();
      let joined = false;
      for (let i = 0; i <= 64; i++) {
        const j = i % 64 * 3, at = project(rim[j], rim[j + 1], rim[j + 2]);
        if (!at) { joined = false; continue; }
        if (joined) ctx.lineTo(at.x, at.y); else ctx.moveTo(at.x, at.y);
        joined = true;
      }
      ctx.stroke(); ctx.restore();
      if (!active) return;
      const w = window.innerWidth, h = window.innerHeight, at = project(centre.x, centre.y, centre.z);
      if (at && at.x >= 0 && at.x <= w && at.y >= 0 && at.y <= h) return;
      let dx, dy;
      if (at) { dx = at.x - w / 2; dy = at.y - h / 2; }
      else {
        // Behind the eye: use the camera's right and up, never a mirrored perspective projection.
        const cam = BL.scenes.timechain.camera, p = cam.position, q = cam.target;
        let fx = q.x - p.x, fy = q.y - p.y, fz = q.z - p.z;
        const len = Math.hypot(fx, fy, fz) || 1; fx /= len; fy /= len; fz /= len;
        const flat = Math.hypot(fx, fz), rx = flat > 0.001 ? -fz / flat : 1, rz = flat > 0.001 ? fx / flat : 0;
        const tx = centre.x - p.x, ty = centre.y - p.y, tz = centre.z - p.z;
        dx = tx * rx + tz * rz;
        dy = -(tx * -fy * rz + ty * (fx * rz - fz * rx) + tz * fy * rx);
        if (Math.hypot(dx, dy) < 0.001) dy = 1;
      }
      const angle = Math.atan2(dx, -dy), ring = Math.min(w, h) * 0.34;
      ctx.save(); ctx.translate(w / 2 + Math.sin(angle) * ring, h / 2 - Math.cos(angle) * ring); ctx.rotate(angle); ctx.scale(0.7, 0.7);
      // The duel hit-direction chevron, in the board's green instead of damage red.
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(30, 12); ctx.lineTo(13, 12); ctx.lineTo(0, -4); ctx.lineTo(-13, 12); ctx.lineTo(-30, 12); ctx.closePath();
      ctx.lineWidth = 5; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(5, 30, 16, 0.85)"; ctx.fillStyle = "#62da94";
      ctx.stroke(); ctx.fill(); ctx.restore();
    };
    const draw = (ctx, project) => {
      const focus = focusScreen();
      drawCue(ctx, project, boardCue, boardGlow, focus === "board");
      drawCue(ctx, project, slideCue, slideGlow, focus === "slide");
    };
    let cues = null, cuesFor = null;
    const centreOf = (op) => {
      const kind = LK.shapeOf(op), v = op[kind];
      if (kind === "text") return [op.x + (op.a === "c" ? 0 : op.a === "r" ? -1 : 1) * String(v).length * 0.275 * (op.size || 5), op.y];
      if (kind === "box") return [v[0] + v[2] / 2, v[1] + v[3] / 2];
      if (kind === "circle" || kind === "ellipse") return [v[0], v[1]];
      let x = 0, y = 0;
      for (let i = 0; i + 1 < v.length; i += 2) { x += v[i]; y += v[i + 1]; }
      return [x / (v.length / 2), y / (v.length / 2)];
    };
    const cuesOf = (T) => {
      const out = new Float32Array(T.sentences.length * 2).fill(-1), aspect = D.slide.w / D.slide.h, ua = 1 / (100 * aspect);
      let b = 0;
      for (const section of T.lecture.sections) for (const beat of section.beats) {
        const B = T.beats[b++];
        beat.say.forEach((say, k) => {
          const i = B.first + k, S = T.sentences[i], held = T.slides[S.slide], slide = held && held.slide;
          if (!slide || S.place === "tablet" || S.gesture !== "point") return;
          let x = -1, y = -1;
          if (slide.k === "figure" && held.beat === B.i && k > 0) {
            let n = 0, sx = 0, sy = 0;
            for (const op of slide.ops) if ((op.at || 0) === k) { const c = centreOf(op); sx += c[0]; sy += c[1]; n++; }
            if (n) { x = 7 * ua + sx / n * (1 - 14 * ua) / 160; y = 0.23 + sy / n * (aspect - 0.14) / 160; }
          } else if (typeof say !== "string" && say.show > 0) {
            const row = say.show - 1;
            if (slide.k === "points") { x = 0.3; y = 0.295 + row * Math.min(0.115, 0.58 / slide.points.length); }
            else if (slide.k === "table") { x = 0.35; y = 0.39 + row * Math.min(0.086, 0.52 / slide.rows.length); }
            else if (slide.k === "code") { x = 0.3; y = 0.3 + row * Math.min(0.064, 0.54 / slide.lines.length); }
            else if (slide.k === "compare") { x = 0.5; y = 0.43 + row * 0.082; }
          }
          if (x < 0) { x = 0.5; y = 0.5; }
          out[i * 2] = x; out[i * 2 + 1] = y;
        });
      }
      return out;
    };
    // A brief point at the authored sentence's target, then back to the audience. The slide remains visible.
    const aimNow = () => {
      const T = player.timeline;
      if (!T || !player.playing || !st.speaking || st.into >= 2.8) return null;
      if (cuesFor !== T) { cues = cuesOf(T); cuesFor = T; }
      const x = cues[st.sentence * 2], y = cues[st.sentence * 2 + 1];
      if (x < 0) return null;
      return ROOMS.onSphere(L, (D.slide.az0 + x * (D.slide.az1 - D.slide.az0)) * DEG, (D.slide.el1 - y * (D.slide.el1 - D.slide.el0)) * DEG, 1, aimAt);
    };
    // He wears a microphone, so his voice is as loud from every seat; where it comes from is where he stands. The ear
    // is the visitor's Ooga (`built.ear`) and the way it faces the view's own, so a turned head turns the sound.
    const hearFrom = () => {
      if (!lecturer || !player.recorded) return;
      const cam = BL.scenes.timechain.camera, at = lecturer.root.position, ear = built.ear;
      let fx = cam.target.x - cam.position.x, fz = cam.target.z - cam.position.z;
      const f = Math.hypot(fx, fz) || 1, dx = at.x - ear.x, dz = at.z - ear.z, d = Math.hypot(dx, dz);
      fx /= f; fz /= f;
      // The view's right is (-fz, fx). Standing right by him, his voice is in front rather than swinging about.
      const near = Math.min(1, d / 1.5), side = d > 0.01 ? (dx * -fz + dz * fx) / d * near : 0, ahead = d > 0.01 ? (dx * fx + dz * fz) / d * near + (1 - near) : 1;
      const len = Math.hypot(side, ahead) || 1;
      player.hear(side / len, ahead / len);
    };
    // The banner's buttons, shown in this hall alone.
    const buttons = BAR.map((id) => document.getElementById(id));
    const nextLecture = () => {
      const next = course.lectures.findIndex(l => ready(l) && !(player.progress[l.id] && player.progress[l.id].done));
      return next < 0 ? course.lectures.findIndex(ready) : next;
    };
    const label = () => {
      const on = !!player.timeline;
      for (let i = 1; i < buttons.length; i++) if (buttons[i]) buttons[i].hidden = i === 5 ? on : !on;
      if (buttons[5]) {
        const next = course.lectures[nextLecture()], saved = next && player.progress[next.id];
        buttons[5].hidden = on || !next;
        if (next) buttons[5].textContent = `${saved && !saved.done ? "Resume" : "Start"} lecture ${next.n}`;
      }
      if (buttons[1]) buttons[1].textContent = player.playing ? "Pause" : player.ended ? "Replay" : "Resume";
      if (buttons[4]) {
        buttons[4].textContent = `${player.speed}×`;
        buttons[4].setAttribute("aria-label", `Playback speed: ${player.speed}×. Change speed`);
      }
      nodes.session.visible = player.playing;
      if (!asking()) hovered = -1;
    };
    // The programme, a page of the board dialog: a press on a row, or the arrows and Enter, starts that lecture.
    const rows = [];
    let chosen = 0, programmeHovered = -1, programmeVersion = 0, programmeCanvas = null;
    const start = (i) => {
      const entry = course.lectures[i];
      if (!entry) return false;
      if (!ready(entry)) { if (hud) hud.toast(`Lecture ${entry.n} is still being written`); return false; }
      player.open(entry).then((ok) => { if (ok) { player.play(); seen.slide = seen.caption = seen.outline = seen.board = ""; mark.epoch = -2; label(); } }, () => { if (hud) hud.toast("That lecture didn't load. Try again"); });
      return true;
    };
    const paintProgramme = () => { const c = programme.canvas; LS.programme(c.getContext("2d"), c.width, c.height, P, course, player.progress, chosen, rows, ready, programmeHovered); programmeVersion++; };
    const programme = {
      title: "Lecture Hall", help: "Choose an available lecture, or use the arrows and Enter. Gray lectures marked SOON are not available yet.", expanded: true, count: 1, index: 0, caption: course.title,
      get note() { return course.by ? `${course.subtitle}, with ${course.by}.` : `${course.subtitle}.`; },
      get canvas() { return programmeCanvas || (programmeCanvas = CH.canvas(1400, 860)); },
      get version() { return programmeVersion; }, go() {},
      hover(x, y) { const i = rowAt(rows, x, y); if (i !== programmeHovered) { programmeHovered = i; paintProgramme(); } },
      onClose() { programmeHovered = -1; menuOpen?.(false); },
      pick(x, y) { const i = rowAt(rows, x, y); if (i < 0) return false; if (!ready(course.lectures[i])) return true; chosen = i; return start(i) ? "close" : true; },
      key(key) {
        const n = course.lectures.length, per = Math.ceil(n / 2);
        if (key === "ArrowDown") chosen = (chosen + 1) % n; else if (key === "ArrowUp") chosen = (chosen + n - 1) % n;
        else if (key === "ArrowRight" || key === "ArrowLeft") chosen = (chosen + per) % n;
        else if (key === "Enter") return ready(course.lectures[chosen]) && start(chosen) ? "close" : true;
        else return false;
        programmeHovered = -1; paintProgramme();
        return true;
      }
    };
    const openProgramme = (h) => {
      hud = h;
      if (player.entry) chosen = player.entry.n - 1;
      else chosen = Math.max(0, nextLecture());
      programmeHovered = -1; paintProgramme();
      h.openBoard(programme);
      menuOpen?.(true, true, h.el.board);
      return true;
    };
    // The screens close up: the slide, the board and the outline, paged with the arrows.
    let page = 0, pagesVersion = 0;
    const PAGES = [["slide", "The slide"], ["board", "The board"], ["outline", "The sections"], ["caption", "The narration"]];
    const startScrubAt = (x, y) => {
      if (!player.timeline) return false;
      const c = canvasOf("outline"), bar = LS.timebar(c.width, c.height), cy = bar.y + bar.h / 2;
      if (x < bar.x - bar.r || x > bar.x + bar.w + bar.r || Math.abs(y - cy) > bar.r * 2) return false;
      const thumb = bar.x + bar.w * player.time / player.timeline.duration;
      scrubOffset = Math.hypot(x - thumb, y - cy) <= bar.r * 1.3 ? x - thumb : 0;
      if (!player.beginScrub()) return false;
      moveScrubAt(x); label(); return true;
    };
    const moveScrubAt = (x) => {
      if (!player.scrubbing) return;
      const c = canvasOf("outline"), bar = LS.timebar(c.width, c.height);
      player.moveScrub((x - scrubOffset - bar.x) / bar.w * player.timeline.duration);
    };
    const endScrub = (cancelled) => {
      const ended = player.endScrub(cancelled); scrubOwner = null;
      if (ended && !cancelled) seekScene();
      label();
    };
    const closeUp = {
      title: "Lecture Hall", help: "Click a section to jump to its beginning. Drag the time bar to seek. Arrow keys switch screens.", expanded: true, count: PAGES.length,
      // Copy the current screen directly: popup pointer coordinates then match the dome painter exactly.
      get canvas() { return canvasOf(PAGES[page][0]); },
      get index() { return page; }, get caption() { return PAGES[page][1]; },
      get version() { return pagesVersion + screensVersion; },
      go(i) { endScrub(true); page = i; hovered = sectionHovered = -1; pagesVersion++; },
      hover(x, y) {
        const id = PAGES[page][0];
        sectionHovered = id === "outline" && player.timeline ? rowAt(sectionRows, x, y) : -1;
        hovered = id === "slide" && asking() ? rowAt(quizRows, x, y) : -1;
      },
      pick(x, y) {
        const id = PAGES[page][0];
        if (id === "outline") return jumpSection(rowAt(sectionRows, x, y));
        if (id === "slide" && asking()) { const answer = rowAt(quizRows, x, y); if (answer >= 0) { player.answer(answer); label(); return true; } }
        return false;
      },
      dragStart(x, y) { return PAGES[page][0] === "outline" && startScrubAt(x, y); },
      dragMove(x) { moveScrubAt(x); }, dragEnd: endScrub,
      key(key) {
        if (!player.timeline || player.scrubbing) return false;
        const k = key.toLowerCase();
        if (player.waiting >= 0 && k >= "1" && k <= "4") return act(`lecture-answer-${k}`);
        return k === "p" ? act("lecture-toggle") : k === "[" ? act("lecture-back") : k === "]" ? act("lecture-next") : false;
      },
      onClose() { endScrub(true); popupOpen = false; hovered = sectionHovered = -1; menuOpen?.(false); }
    };
    const openScreen = (id, h) => {
      page = Math.max(0, PAGES.findIndex(p => p[0] === id)); pagesVersion++;
      hovered = sectionHovered = -1;
      h.openBoard(closeUp); popupOpen = true; menuOpen?.(true, true, h.el.board); return true;
    };
    const act = (action, h) => {
      hud = h || hud;
      if (action === "lecture-programme") return openProgramme(hud);
      if (action === "lecture-start") return start(nextLecture());
      if (!player.timeline) return false;
      if (action === "lecture-stop") { player.close(); label(); return true; }
      if (action === "lecture-speed") { player.setSpeed(player.speed === 1 ? 1.25 : player.speed === 1.25 ? 1.5 : player.speed === 1.5 ? 2 : 1); label(); return true; }
      if (action === "lecture-toggle") { player.toggle(); label(); return true; }
      if (action.startsWith("lecture-answer-")) { const ok = player.answer(Number(action.slice(15)) - 1); if (ok) label(); return ok; }
      if (action === "lecture-back") { player.section(-1); return true; }
      if (action === "lecture-next") { player.section(1); return true; }
      return false;
    };
    if (buttons[0]) buttons[0].hidden = false;
    label();
    // On a debug page `lecturer=view` opens the lecturer in the model viewer, to turn and look at up close.
    let viewing = query.has("debug") && query.get("lecturer") === "view" && !!lecturer;
    const viewLecturer = () => BL.modelViewer.open({ title: "Lecture Hall", help: "Drag to turn him, scroll or pinch to zoom.", count: 1, index: 0,
      item: () => ({ kicker: course.title, name: course.by || "The lecturer", text: `${course.subtitle}.`, stats: [], note: "", geometry: lecturer.portrait() }) });
    // Frames stop in a hidden tab while media events keep the cue state current. On return, rebuild the screens
    // and place him at the current cue instead of walking through the movement missed while away.
    let resumeVisuals = false;
    const visible = () => { if (!document.hidden) resumeVisuals = true; };
    document.addEventListener("visibilitychange", visible);
    const seekScene = () => {
      seen.slide = seen.caption = seen.outline = seen.board = ""; mark.epoch = -2;
      motionTime = player.time;
      if (lecturer) lecturer.seek(st, motionTime, player.playing && player.waiting < 0, st.drawing ? LS.penAt(player.timeline, st.epoch, player.time, pen) : null, aimNow());
    };
    return {
      update(dt, elapsed) {
        player.update(dt);
        if (resumeVisuals) { resumeVisuals = false; if (player.timeline && !player.scrubbing) seekScene(); }
        if (seen.version !== player.version) { seen.version = player.version; label(); }
        if (!asking()) hovered = -1;
        paintScreens(elapsed);
        if (viewing && elapsed > 1) { viewing = false; viewLecturer(); }
        const movingTime = dt * (player.playing && player.waiting < 0 ? player.speed : 1);
        if (!player.scrubbing) motionTime += movingTime;
        const focus = focusScreen(), fade = 1 - Math.exp(-8 * dt);
        boardGlow += ((focus === "board" ? 1 : 0) - boardGlow) * fade;
        slideGlow += ((focus === "slide" ? 1 : 0) - slideGlow) * fade;
        if (lecturer && !player.scrubbing) lecturer.update(movingTime, motionTime, player.timeline ? st : null, player.playing && player.waiting < 0, player.timeline && player.playing && player.waiting < 0 && st.drawing ? LS.penAt(player.timeline, st.epoch, player.time, pen) : null, aimNow(),
          // A stretch of four sentences or more is one he may pace through (whether he does is his own, lecturer.js).
          !!player.timeline && st.quiz < 0 && player.timeline.beats[st.beat].count >= 4);
        hearFrom();
      },
      get scrubbing() { return player.scrubbing; },
      scrubStart(owner, ray) {
        if (!owner || owner.kind !== "live" || owner.slot.spec.id !== "outline" || !pointOnScreen(owner, ray) || !startScrubAt(screenPoint.x, screenPoint.y)) return false;
        scrubOwner = owner; return true;
      },
      scrubMove(ray) { if (player.scrubbing && pointOnScreen(scrubOwner, ray, true)) moveScrubAt(screenPoint.x); },
      scrubEnd: endScrub,
      get question() { return asking(); },
      // The idle catalogue and screen close-ups accept the same carry/combat pointer path as a running lecture.
      get interactive() { return true; },
      get hoverVersion() { return player.version; },
      hover(owner, ray) {
        if (popupOpen) return;
        hovered = answerAt(owner, ray); sectionHovered = sectionAt(owner, ray); catalogueHovered = catalogueAt(owner, ray);
      },
      tap(owner, h, ray) {
        hud = h;
        if (owner.kind === "lectern" || owner.kind === "programme") return openProgramme(h);
        if (owner.kind === "live" && owner.slot.spec.id) {
          const id = owner.slot.spec.id;
          if (id === "slide" && asking()) {
            const answer = answerAt(owner, ray);
            if (answer >= 0) { player.answer(answer); label(); }
            return true;
          }
          if (!player.timeline) {
            const lecture = catalogueAt(owner, ray);
            if (lecture >= 0 && ready(course.lectures[lecture])) { start(lecture); return true; }
            return openProgramme(h);
          }
          if (id === "outline" && jumpSection(sectionAt(owner, ray))) return true;
          return openScreen(id, h);
        }
        return false;
      },
      // Space on the stage beside the lectern opens the programme.
      near(x, z) {
        if (Math.hypot(x - S.lectern.x, z - S.lectern.z) > 1.7) return null;
        return nearAction || (nearAction = { key: "programme", label: "LECTURES", hint: "Space · Choose a lecture", tap: "Tap LECTURES to choose a lecture", run: openProgramme });
      },
      action: act, draw,
      key(e, h) {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || !player.timeline) return false;
        const k = e.key.toLowerCase();
        if (player.waiting >= 0 && k >= "1" && k <= "4") return act(`lecture-answer-${k}`, h);
        return k === "p" ? act("lecture-toggle", h) : k === "[" ? act("lecture-back", h) : k === "]" ? act("lecture-next", h) : false;
      },
      // What the controls panel lists for this hall.
      controlsHelp: (touch, H) => [
        H.row([], "Choose a lecture", touch ? "Lectures button, or tap the lectern" : "Lectures button, or Space at the lectern"),
        H.row(touch ? [] : ["p"], "Pause or resume the lecture", touch ? "Pause button" : ""),
        H.row([], "End this lecture", "Stop button"),
        H.row([], "Seek to any second", "Drag the circle or press anywhere on the outline’s time bar; release to jump"),
        H.row([], "Playback speed", "Speed button: 1×, 1.25×, 1.5× or 2×"),
        H.row(touch ? [] : ["[", "]"], "Back or on a section", touch ? "Section buttons" : ""),
        H.row(touch ? [] : ["1", "2", "3", "4"], "Answer the lecturer's question", "Click or tap an answer on the projected screen")
      ],
      dispose() {
        document.removeEventListener("visibilitychange", visible);
        player.dispose();
        if (lecturer) lecturer.dispose();
        for (const b of buttons) if (b) b.hidden = true;
      },
      // For a debug page (`__ooga.timechain.motion`): the player, `start(i)`, the lecturer, the screens and the stage.
      stats: { player, start, get focusScreen() { return focusScreen(); }, get quizHover() { return hovered; }, get sectionHover() { return sectionHovered; }, get catalogueHover() { return catalogueHovered; }, quizRows, sectionRows, catalogueRows, view: viewLecturer, get lecturer() { return lecturer; }, screens: () => screens(L), stage: S, get aim() { return aimNow(); }, get cues() { return cues; } }
    };
  };
  BL.timechainRoomKinds.lecture = { plan, animate, door, stageOf };
})();
