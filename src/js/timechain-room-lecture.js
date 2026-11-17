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
    outline: (ctx) => LS.idleOutline(ctx, ctx.canvas.width, ctx.canvas.height, P, LK.courseOf(COURSE), null, null)
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
    // The programme on its stand at the landing, to the right as one comes in.
    const stand = K.group(-2.6, 0, L.doorZ - 3.4, Math.PI - 0.5);
    stand.box(0.06, 1.5, 0.06, C.brass, -0.36, 0.75, 0); stand.box(0.06, 1.5, 0.06, C.brass, 0.36, 0.75, 0); stand.box(0.8, 0.05, 0.3, C.brass, 0, 0.03, 0);
    stand.box(0.86, 1.16, 0.05, C.walnutDk, 0, 1.3, 0);
    const sheet = stand.picture(0.78, 1.08, 520, 720, paintStand, 0, 1.3, 0.03, { emissive: 0.8, depthBias: RM.MARK_BIAS });
    K.target(sheet, "programme", "The programme · choose a lecture", 0.7);
    K.solid({ x: -2.6, z: L.doorZ - 3.4, r: 0.36 });

    // The dome's screens: the lecture's own, which `animate` repaints, and the latest blocks, which the scene keeps.
    const D = screens(L);
    for (const id of LECTURE_SCREENS) K.live({ id, tip: TIPS[id], ...D[id], key: () => "idle", paint: IDLE[id] });
    // As many cards of the one size as the ribbon's length holds, the label first and then the tip and the blocks
    // under it, newest nearest the label.
    const slot = 10, count = Math.floor((D.cards1 - D.cards0) / slot), first = (D.cards0 + D.cards1 - (count - 1) * slot) / 2;
    const cardW = (slot - 1.6) * DEG * L.R * Math.cos((D.cards + 2.5) * DEG), cardEl = cardW * CH.CARD_H / CH.CARD_W / (L.R * DEG);
    for (let i = 0; i < count; i++) {
      const az = first + i * slot;
      K.live({ board: "charts", tip: "Latest blocks", az0: az - slot / 2 + 0.8, az1: az + slot / 2 - 0.8, el0: D.cards, el1: D.cards + cardEl, w: CH.CARD_W, h: CH.CARD_H,
        key: (f, now) => cardKey(f.reader, i, now), paint: (ctx, f, now) => { if (i === 0) CH.ribbonLabel(ctx, f.reader.status("recent")); else CH.card(ctx, blockBack(f.reader, i - 1), now); } });
    }

    // Point lights, the fixed ones first: the stage, the dome's warm glow over the front, a pale fill from the back.
    K.light(0.6, top + 4.2, F + 2.6, 11, 1.0, 0.76, 0.5);
    K.light(0, L.c + 0.45 * L.R, -0.35 * L.R, 30, 0.8, 0.52, 0.24);
    K.light(0.3 * L.R, L.c + 0.3 * L.R, 0.4 * L.R, 26, 0.42, 0.4, 0.36);
    K.light(-0.3 * L.R, L.c + 0.2 * L.R, 0.15 * L.R, 20, 0.36, 0.3, 0.24);
  };

  // ---------- a visit ----------
  const BAR = ["lecture-programme", "lecture-toggle", "lecture-back", "lecture-next"];
  const animate = (nodes, built, feeds) => {
    const L = built.layout, course = LK.courseOf(COURSE), S = stageOf(L);
    const query = new URLSearchParams(location.search);
    const player = BL.lecturePlayer.create({ speech: !query.has("nosim") && query.get("lecturevoice") !== "0" });
    const lecturer = BL.lecturer ? BL.lecturer.create({ parent: built.root, profile: course.lecturer, stage: S, hall: L }) : null;
    const st = player.state, mark = LS.mark(), pen = { x: 0, y: 0 };
    const live = {};
    for (const l of built.live) if (l.spec.id) live[l.spec.id] = l;
    const canvasOf = (id) => { const g = live[id].node.geometry; return g ? g.imageSurface.canvas : null; };
    const bump = (id) => { live[id].node.geometry.imageSurface.version++; };
    // What each screen last printed, so a frame that changes nothing paints nothing.
    const seen = { slide: "", caption: "", outline: "", board: "", boardAt: 0, version: -1 };
    let hud = null, nearAction = null, drawing = false;
    const ready = (l) => !!(LK.get(l.id) || BL.deferredScripts && BL.deferredScripts[l.group]);
    const metaOf = (T) => {
      const entry = player.entry, slide = T.slides[st.slide], sec = T.sections[slide ? slide.section : st.section];
      return { left: `LECTURE ${entry.n}`, mid: sec.title.toUpperCase().slice(0, 34), right: `${st.slide + 1} / ${T.slides.length}`, kicker: `${course.title} · Lecture ${entry.n} of ${course.lectures.length}`,
        part: `PART ${sec.i + 1} OF ${T.sections.length}`, credit: course.by ? `with ${course.by}` : course.subtitle, reader: feeds ? feeds.reader : null, now: Date.now() };
    };
    const paintScreens = (elapsed) => {
      const T = player.timeline;
      for (const id of LECTURE_SCREENS) if (!canvasOf(id)) return;
      if (!T) {
        if (seen.slide === "idle") return;
        for (const id of LECTURE_SCREENS) { const c = canvasOf(id), ctx = c.getContext("2d"); if (id === "outline") LS.idleOutline(ctx, c.width, c.height, P, course, player.progress, null); else IDLE[id](ctx); bump(id); }
        seen.slide = "idle"; seen.caption = seen.outline = seen.board = ""; mark.epoch = -1; mark.settled = -1;
        return;
      }
      const t = player.time, slide = T.slides[st.slide], local = slide && slide.beat === st.beat ? st.sentence - T.beats[st.beat].first : 99;
      const liveKey = slide && slide.slide.k === "live" && feeds ? `${feeds.reader.version}|${Math.floor(Date.now() / 10000)}` : "";
      const sk = `${T.id}|${st.slide}|${st.show}|${slide && slide.slide.k === "figure" ? local : 0}|${liveKey}`;
      if (sk !== seen.slide && slide) {
        seen.slide = sk;
        const c = canvasOf("slide");
        LS.slide(c.getContext("2d"), c.width, c.height, P, slide.slide, st.show, local, metaOf(T));
        bump("slide");
      }
      const ck = `${T.id}|${st.sentence}|${player.playing}|${player.ended}`;
      if (ck !== seen.caption) { seen.caption = ck; const c = canvasOf("caption"); LS.caption(c.getContext("2d"), c.width, c.height, P, player.ended ? "" : T.sentences[st.sentence].text, !player.playing); bump("caption"); }
      const ok = `${T.id}|${st.section}|${Math.floor(t / 5)}|${player.playing}|${player.ended}`;
      if (ok !== seen.outline) {
        seen.outline = ok;
        const c = canvasOf("outline"), entry = player.entry;
        LS.outline(c.getContext("2d"), c.width, c.height, P, T, st, t, { kicker: `LECTURE ${entry.n} OF ${course.lectures.length}`, title: entry.title, state: player.ended ? "THE END" : player.playing ? "" : "PAUSED" });
        bump("outline");
      }
      // The board: at once when its strokes change, a dozen times a second while one is being drawn.
      const bk = `${T.id}|${st.epoch}|${st.begun}`;
      if (bk !== seen.board || drawing && elapsed - seen.boardAt > 0.08) {
        seen.board = bk; seen.boardAt = elapsed;
        const c = canvasOf("board");
        drawing = LS.board(c.getContext("2d"), c.width, c.height, P, T, st.epoch, t, mark);
        bump("board");
      }
    };
    // What on the slide each sentence is about, as a share of the slide across and down (-1 for none): the shapes of
    // a figure that come up with it, the point, line or row it reveals, or the slide's middle when the lecture has him
    // point. He turns and points there while he says it.
    const D = screens(L), aimAt = { x: 0, y: 0, z: 0 };
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
          if (!slide || S.place === "tablet") return;
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
          if (x < 0 && (S.gesture === "point" || S.place === "screen")) { x = 0.5; y = 0.5; }
          out[i * 2] = x; out[i * 2 + 1] = y;
        });
      }
      return out;
    };
    // The point he points at now, on the dome, or null: for as long as a sentence that has one is being said, so two
    // such sentences on end keep his arm up.
    const aimNow = () => {
      const T = player.timeline;
      if (!T || !player.playing || !st.speaking) return null;
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
    // The question the lecture waits on, as a card over the hall: its answers are buttons, and the keys 1 to 4.
    const quizCard = document.getElementById("lecture-quiz"), quizRows = quizCard ? [...quizCard.querySelectorAll("li")] : [];
    let asked = -2;
    const showQuiz = () => {
      const Q = player.playing ? player.quiz : null, now = Q ? Q.i : -1;
      if (!quizCard || now === asked) return;
      asked = now;
      quizCard.hidden = !Q;
      if (!Q) return;
      const slide = player.timeline.slides[Q.slide].slide;
      quizCard.querySelector("#lecture-quiz-kicker").textContent = `Question ${slide.n} of ${player.timeline.quizzes.length}`;
      quizCard.querySelector("h3").textContent = slide.q;
      quizRows.forEach((row, k) => { row.hidden = k >= slide.options.length; if (k < slide.options.length) row.querySelector("span").textContent = slide.options[k]; });
    };
    const label = () => {
      const on = !!player.timeline;
      for (let i = 1; i < 4; i++) if (buttons[i]) buttons[i].hidden = !on;
      if (buttons[1]) buttons[1].textContent = player.playing ? "Pause" : player.ended ? "Replay" : "Resume";
      nodes.session.visible = player.playing;
      showQuiz();
    };
    // The programme, a page of the board dialog: a press on a row, or the arrows and Enter, starts that lecture.
    const rows = [];
    let chosen = 0, programmeVersion = 0, programmeCanvas = null;
    const start = (i) => {
      const entry = course.lectures[i];
      if (!ready(entry)) { if (hud) hud.toast(`Lecture ${entry.n} is still being written`); return false; }
      player.open(entry).then((ok) => { if (ok) { player.play(); seen.slide = seen.caption = seen.outline = seen.board = ""; mark.epoch = -2; label(); } }, () => { if (hud) hud.toast("That lecture didn't load. Try again"); });
      return true;
    };
    const paintProgramme = () => { const c = programme.canvas; LS.programme(c.getContext("2d"), c.width, c.height, P, course, player.progress, chosen, rows, ready); programmeVersion++; };
    const programme = {
      title: "Lecture Hall", help: "Choose a lecture: press one, or use the arrows and Enter. Each picks up where you left it.", wide: true, count: 1, index: 0, caption: course.title,
      get note() { return course.by ? `${course.subtitle}, with ${course.by}.` : `${course.subtitle}.`; },
      get canvas() { return programmeCanvas || (programmeCanvas = CH.canvas(1400, 860)); },
      get version() { return programmeVersion; }, go() {},
      pick(x, y) { for (const r of rows) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { chosen = r.index; return start(r.index) ? "close" : true; } return false; },
      key(key) {
        const n = course.lectures.length, per = Math.ceil(n / 2);
        if (key === "ArrowDown") chosen = (chosen + 1) % n; else if (key === "ArrowUp") chosen = (chosen + n - 1) % n;
        else if (key === "ArrowRight" || key === "ArrowLeft") chosen = (chosen + per) % n;
        else if (key === "Enter") return start(chosen) ? "close" : true;
        else return false;
        paintProgramme();
        return true;
      }
    };
    const openProgramme = (h) => {
      hud = h;
      if (player.entry) chosen = player.entry.n - 1;
      else { const next = course.lectures.findIndex((l) => !(player.progress[l.id] && player.progress[l.id].done)); chosen = next < 0 ? 0 : next; }
      paintProgramme();
      h.openBoard(programme);
      return true;
    };
    // The screens close up: the slide, the board and the outline, paged with the arrows.
    let page = 0, pagesVersion = 0, closeSheet = null;
    const PAGES = [["slide", "The slide"], ["board", "The board"], ["outline", "The outline"]];
    const closeUp = {
      title: "Lecture Hall", help: "The lecture's screens, close up. Arrow keys flip between them.", wide: true, count: PAGES.length,
      // Every page on one sheet of one size, each screen laid in as large as fits, so the dialog keeps its height
      // from page to page.
      get canvas() {
        const from = canvasOf(PAGES[page][0]);
        if (!from) return null;
        if (!closeSheet) closeSheet = CH.canvas(1600, 800);
        const c = closeSheet.getContext("2d"), k = Math.min(closeSheet.width / from.width, closeSheet.height / from.height);
        c.fillStyle = "#0e0d0c"; c.fillRect(0, 0, closeSheet.width, closeSheet.height);
        c.drawImage(from, (closeSheet.width - from.width * k) / 2, (closeSheet.height - from.height * k) / 2, from.width * k, from.height * k);
        return closeSheet;
      },
      get index() { return page; }, get caption() { return PAGES[page][1]; },
      get note() { const e = player.entry; const r = player.timeline && player.timeline.lecture.reading; return e ? `Lecture ${e.n} · ${e.title}.${r ? ` Before class: ${r.map((x) => x.by ? `${x.title}, ${x.by}` : x.title).join("; ")}.` : ""}` : HINT; },
      get version() { return pagesVersion + seen.boardAt + player.version; }, go: (i) => { page = i; pagesVersion++; }
    };
    const act = (action, h) => {
      hud = h || hud;
      if (action === "lecture-programme") return openProgramme(hud);
      if (!player.timeline) return false;
      if (action === "lecture-toggle") { player.toggle(); label(); return true; }
      if (action.startsWith("lecture-answer-")) { const ok = player.answer(Number(action.slice(15)) - 1); if (ok) { label(); if (document.activeElement && quizCard.contains(document.activeElement)) document.activeElement.blur(); } return ok; }
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
    return {
      update(dt, elapsed) {
        player.update(dt);
        if (seen.version !== player.version) { seen.version = player.version; label(); }
        paintScreens(elapsed);
        if (viewing && elapsed > 1) { viewing = false; viewLecturer(); }
        if (lecturer) lecturer.update(dt, elapsed, player.timeline ? st : null, player.playing && player.waiting < 0, player.timeline && st.drawing ? LS.penAt(player.timeline, st.epoch, player.time, pen) : null, aimNow(),
          // A stretch of four sentences or more is one he may pace through (whether he does is his own, lecturer.js).
          !!player.timeline && st.quiz < 0 && player.timeline.beats[st.beat].count >= 4);
        hearFrom();
      },
      tap(owner, h) {
        hud = h;
        if (owner.kind === "lectern" || owner.kind === "programme") return openProgramme(h);
        if (owner.kind === "live" && owner.slot.spec.id) {
          const id = owner.slot.spec.id;
          if (id === "outline" || !player.timeline) return openProgramme(h);
          page = id === "board" ? 1 : 0; pagesVersion++;
          h.openBoard(closeUp);
          return true;
        }
        return false;
      },
      // Space on the stage beside the lectern opens the programme.
      near(x, z) {
        if (Math.hypot(x - S.lectern.x, z - S.lectern.z) > 1.7) return null;
        return nearAction || (nearAction = { key: "programme", label: "LECTURES", hint: "Space · Choose a lecture", tap: "Tap LECTURES to choose a lecture", run: openProgramme });
      },
      action: act,
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
        H.row(touch ? [] : ["[", "]"], "Back or on a section", touch ? "Section buttons" : ""),
        H.row(touch ? [] : ["1", "2", "3", "4"], "Answer the lecturer's question", touch ? "Tap an answer" : "")
      ],
      dispose() {
        player.dispose();
        if (lecturer) lecturer.dispose();
        for (const b of buttons) if (b) b.hidden = true;
        if (quizCard) quizCard.hidden = true;
      },
      // For a debug page (`__ooga.timechain.motion`): the player, `start(i)`, the lecturer, the screens and the stage.
      stats: { player, start, view: viewLecturer, get lecturer() { return lecturer; }, screens: () => screens(L), stage: S, get aim() { return aimNow(); }, get cues() { return cues; } }
    };
  };
  BL.timechainRoomKinds.lecture = { plan, animate, door, stageOf };
})();
