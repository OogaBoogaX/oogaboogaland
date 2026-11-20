// The Banana Club's eight marble statues along the long walls, each on a plinth with a brass plaque, and the one board
// their placards are read on. Every statue is the same stylised figure: one invented Ooga (`STATUE_NAME`, a name no
// GitHub login can hold) cloned from `models.caveman`, dressed in a toga, posed by part rotations and baked with what
// it holds into ONE geometry in marble tones, so all eight share one plain face and are told apart only by pose and
// attribute. The seventh wears a hood whose opening is an empty dark recess, and no face. Statues never move, so each
// is baked once (per lite set) and cached. The text on the placards is the `FIGURES` table alone.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, K = BL.pokerMarble, { hexToRgb, mulberry32, fnv1a } = BL.math;

  const FIGURES = Object.freeze([
    { id: "merkle", name: "Ralph Merkle", attribute: "a branching tree", lines: ["Merkle's puzzles, 1974.", "Merkle trees, 1979, as a Stanford graduate student."] },
    { id: "chaum", name: "David Chaum", attribute: "a sealed envelope", lines: ["Blind signatures, 1982.", "Ecash, and DigiCash, founded in Amsterdam about 1990.", "DigiCash went bankrupt in 1998."] },
    { id: "back", name: "Adam Back", attribute: "a stamp and hammer", lines: ["Proposed hashcash in 1997.", "The whitepaper cites Adam Back's Hashcash."] },
    { id: "dai", name: "Wei Dai", attribute: "a coin marked b", lines: ["B-money, 1998.", "It is the whitepaper's very first citation."] },
    { id: "szabo", name: "Nick Szabo", attribute: "a gold bar", lines: ["Bit gold: designed 1998, published 2005.", "Chained proofs of work."] },
    { id: "finney", name: "Hal Finney", attribute: "a tablet marked 170", lines: ["Reusable proofs of work, 2004.", "First to write back that the paper seemed promising.", "Received 10 bitcoin in block 170, 12 January 2009."] },
    { id: "satoshi", name: "Satoshi Nakamoto", attribute: "a scroll", lines: ["Signed the whitepaper under a pen name.", "Mined the genesis block on 3 January 2009.", "To this day, nobody knows who that is."] },
    { id: "hanyecz", name: "Laszlo Hanyecz", attribute: "two pizza boxes", lines: ["Paid 10,000 bitcoin for two pizzas in 2010.", "22 May is Bitcoin Pizza Day."] }
  ].map(f => Object.freeze({ ...f, lines: Object.freeze(f.lines.slice()) })));
  // Four a side, walking from the mirror toward the bar, each facing the room's centre line (a node's yaw turns +z to
  // (sin yaw, cos yaw), as the seats' `atan2(-x, -z)` does).
  const SLOTS = Object.freeze([[-22.3, 18], [22.3, 18], [-22.3, 6], [22.3, 6], [-22.3, -6], [22.3, -6], [-22.3, -18], [22.3, -18]]
    .map(([x, z]) => Object.freeze({ x, z, yaw: Math.atan2(-x, 0) })));
  // The plinth, and the footprint a walk block must cover: `reach` is how far any statue's baked geometry stands in
  // front of its slot's centre toward the room, `side` how far to either side, both measured from the eight bakes
  // (1.032 and 0.761 m, on both sets) and rounded up to 0.05 m. The suite checks them against the bakes.
  const PLINTH = Object.freeze({ w: 1.2, h: 0.9, reach: 1.05, side: 0.8 });
  // The figure is built at a height of one and baked at `SCALE`: a little over life size on its plinth.
  const SCALE = 1.3;
  const STONE = K.WHITE, FOLD = K.SHADE, RECESS = "#2a2622";

  // ---- the figure ------------------------------------------------------------------------------------------------

  // One invented figure for all eight, so the head and face are the same blocks every time. Its traits are made
  // fresh for each build (the build draws from `rand`), never hashed from a person's name.
  const STATUE_NAME = "statue/ember-den";
  const DRESS = Object.freeze({
    // A toga over the whole trunk, a fold falling from the left shoulder across it.
    torso(k, v) {
      const cloth = k.P.fur, fold = k.color(FOLD);
      v.fill(0, 8, 0, 7, 0, 5, (x, y) => Math.abs(x - (8 - y)) === 0 || Math.abs(x - (9 - y)) === 0 ? fold : cloth);
      k.loin = [cloth, cloth];
    },
    extras(k) { k.parts.club.visible = false; }
  });
  const traits = () => ({
    name: STATUE_NAME, display: "Statue", slim: false, skin: STONE, hair: FOLD, fur: STONE, height: 1, belly: 1,
    bald: true, cleanShaven: true, face: "nose", eyeColor: "#d8d1c6", noPupils: true,
    rand: mulberry32(fnv1a(STATUE_NAME + "/body")), dress: DRESS
  });

  // Every colour the figure was built in becomes marble by its lightness, so the stone reads as one material with
  // its folds and features in shadow.
  const lo = hexToRgb(FOLD), hi = hexToRgb(STONE), tones = new Map();
  const marble = (rgb) => {
    const key = rgb[0] << 16 | rgb[1] << 8 | rgb[2];
    let out = tones.get(key);
    if (!out) {
      const t = Math.max(0, Math.min(1, ((0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) - 70) / 150));
      tones.set(key, out = [0, 1, 2].map(i => Math.round(lo[i] + (hi[i] - lo[i]) * t)));
    }
    return out;
  };

  // ---- pieces in the figure's frame (height one) ------------------------------------------------------------------

  const box = (w, h, d, color, x = 0, y = 0, z = 0) => M.box({ w, h, d, color, offset: { x, y, z } });
  // Text in the carved signs' alphabet as raised cells on a face at z, centred on (x, y), `cell` across. Every glyph
  // hangs from one five-row top, so a six-row letter's tail drops below the line; a space is a two-cell gap.
  const SPACE = 2;
  const glyphs = (text, cell, depth, color, x, y, z) => {
    const G = BL.signGlyphs.SIGN_GLYPHS, parts = [], advance = ch => ch === " " ? SPACE + 1 : G[ch][0].length + 1;
    let width = -1;
    for (const ch of text) width += advance(ch);
    let cx = x - width * cell / 2;
    const top = y + 5 * cell / 2;
    for (const ch of text) {
      if (ch !== " ") G[ch].forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === "1") parts.push(box(cell, cell, depth, color, cx + (c + 0.5) * cell, top - (r + 0.5) * cell, z)); });
      cx += advance(ch) * cell;
    }
    return parts;
  };
  const disc = (r, t, segments, color) => M.turnedX(M.lathe({ segments, color, profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]] }), Math.PI / 2);
  // What each figure holds, in order, built about its grip (or the middle between two grips) with +z toward the room.
  const HELD = [
    // A branching tree held upright: a trunk that forks twice, a leaf at each of its four tips.
    (seg) => {
      const parts = [box(0.022, 0.16, 0.022, STONE, 0, 0.08, 0)];
      for (const a of [-1, 1]) {
        const x1 = a * 0.06, y1 = 0.24;
        parts.push(M.moved(M.turnedZ(box(0.018, 0.1, 0.018, STONE), -a * 0.6), a * 0.03, 0.2, 0));
        for (const b of [-1, 1]) {
          const x2 = x1 + b * 0.035, y2 = y1 + 0.07;
          parts.push(M.moved(M.turnedZ(box(0.014, 0.075, 0.014, STONE), -b * 0.45), (x1 + x2) / 2, (y1 + y2) / 2 + 0.005, 0));
          parts.push(M.moved(M.lathe({ segments: seg, color: STONE, profile: [[0, -0.03], [0.035, -0.015], [0.03, 0.02], [0, 0.035]] }), x2, y2 + 0.03, 0));
        }
      }
      return M.merge(...parts);
    },
    // A sealed envelope held flat against the chest: its flap's edges in relief and a round seal.
    (seg) => M.merge(box(0.22, 0.14, 0.018, STONE, 0, 0, 0.03),
      M.moved(M.turnedZ(box(0.13, 0.012, 0.008, FOLD), -0.55), -0.055, 0.035, 0.042),
      M.moved(M.turnedZ(box(0.13, 0.012, 0.008, FOLD), 0.55), 0.055, 0.035, 0.042),
      M.moved(disc(0.022, 0.012, seg, FOLD), 0, 0.0, 0.045)),
    // A stamp in the left hand and a hammer raised in the right: built as two, placed at each grip.
    (seg) => ({
      left: M.merge(box(0.08, 0.04, 0.08, STONE, 0, -0.035, 0.03), M.moved(M.lathe({ segments: seg, color: STONE, profile: [[0, -0.015], [0.012, -0.015], [0.012, 0.04], [0.025, 0.05], [0.02, 0.07], [0, 0.075]] }), 0, -0.01, 0.03)),
      right: M.merge(box(0.024, 0.26, 0.024, STONE, 0, 0.08, 0.02), box(0.06, 0.06, 0.13, STONE, 0, 0.22, 0.02))
    }),
    // A coin marked b, standing on an open palm, its mark toward the room.
    (seg) => M.merge(M.moved(disc(0.075, 0.016, seg, STONE), 0, 0.09, 0.03), ...glyphs("b", 0.016, 0.006, FOLD, 0, 0.09, 0.041)),
    // A gold bar in both hands: wider at the foot than at the top.
    () => {
      const geo = M.prism([[-0.12, -0.035], [0.12, -0.035], [0.095, 0.035], [-0.095, 0.035]], 0.09, K.GOLD);
      return M.moved(geo, 0, 0.02, 0.06);
    },
    // A tablet marked 170, cradled against the body, its face toward the room.
    () => M.merge(box(0.2, 0.27, 0.03, STONE, 0, 0.08, 0.05), box(0.21, 0.02, 0.035, FOLD, 0, 0.215, 0.05),
      ...glyphs("170", 0.018, 0.006, FOLD, 0, 0.085, 0.067)),
    // A rolled scroll with a turned knob at each end, a short sheet hanging from it.
    (seg) => {
      const roll = M.turnedZ(M.lathe({ segments: seg, color: STONE, profile: [[0, -0.12], [0.012, -0.12], [0.012, -0.11], [0.03, -0.105], [0.03, 0.105], [0.012, 0.11], [0.012, 0.12], [0, 0.12]] }), Math.PI / 2);
      return M.merge(M.moved(roll, 0, 0, 0.05), box(0.19, 0.12, 0.006, FOLD, 0, -0.07, 0.075));
    },
    // Two pizza boxes, one on the other, carried in both hands.
    () => M.merge(box(0.27, 0.035, 0.27, STONE, 0, 0.02, 0.06), box(0.27, 0.035, 0.27, STONE, 0.01, 0.057, 0.055),
      box(0.28, 0.004, 0.004, FOLD, 0, 0.038, 0.195), box(0.28, 0.004, 0.004, FOLD, 0.01, 0.075, 0.19))
  ];
  // Each figure's pose by part rotations (arms: x forward or up, z out; forearms: x bent forward; head: x bowed, y
  // turned; legs: x forward), how it holds its piece (`hold`: "right", "left", "both" or "pair" for one in each
  // hand), and the seventh's hood.
  const POSES = [
    { armR: [-0.55, -0.12], foreR: -1.05, armL: [0.05, 0.14], foreL: -0.2, head: [0.12, -0.25], legs: [0.06, -0.14], hold: "right" },
    { armR: [0.04, -0.12], foreR: -0.25, armL: [-0.25, 0.02], foreL: -1.75, head: [0.06, 0.15], legs: [-0.12, 0.05], hold: "left" },
    { armR: [-1.8, -0.25], foreR: -0.8, armL: [-0.75, 0.12], foreL: -0.75, head: [-0.12, 0.1], legs: [-0.16, 0.08], hold: "pair" },
    { armR: [-1.05, -0.08], foreR: -0.35, armL: [0.03, 0.12], foreL: -0.15, head: [0.16, -0.12], legs: [0.04, -0.12], hold: "right" },
    { armR: [-0.35, 0], foreR: -1.15, armL: [-0.35, 0], foreL: -1.15, head: [0.22, 0], legs: [-0.08, 0.08], hold: "both", apart: 0.13 },
    { armR: [-0.55, 0.2], foreR: -0.95, armL: [-0.2, 0.12], foreL: -1.6, head: [0.18, 0.3], legs: [0.08, -0.1], hold: "left" },
    { armR: [-0.35, -0.05], foreR: -1.2, armL: [0.02, 0.08], foreL: -0.15, head: [0.2, 0], legs: [-0.05, 0.1], hold: "right", hood: true },
    { armR: [-0.45, 0], foreR: -1.0, armL: [-0.45, 0], foreL: -1.0, head: [0.12, -0.1], legs: [0.1, -0.06], hold: "both", apart: 0.17 }
  ];

  // A laurel wreath round the head's bounds at the brow, open at the front, its leaves in pairs along the band.
  const wreath = (b, lite) => {
    const parts = [], cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y = b.min[1] + (b.max[1] - b.min[1]) * 0.78;
    const rx = (b.max[0] - b.min[0]) / 2 + 0.012, rz = (b.max[2] - b.min[2]) / 2 + 0.012, n = lite ? 9 : 15;
    for (let i = 0; i < n; i++) {
      const a = 0.45 + i / (n - 1) * (Math.PI * 2 - 0.9), x = cx + Math.sin(a) * rx, z = cz + Math.cos(a) * rz;
      for (const s of [-1, 1]) {
        const leaf = M.turnedY(M.turnedX(box(0.012, 0.045, 0.022, K.GOLD, 0, 0.018, 0), s * 0.55), a);
        parts.push(M.moved(leaf, x, y + s * 0.006, z));
      }
    }
    return M.merge(...parts);
  };
  // A hood over where the head would be: crown, back and sides round the head's bounds, a peak behind, and inside the
  // opening only a dark recess. No head is drawn under it.
  const hood = (b) => {
    const m = 0.035, t = 0.03, x0 = b.min[0] - m, x1 = b.max[0] + m, y0 = b.min[1] - 0.03, y1 = b.max[1] + m, z0 = b.min[2] - m, z1 = b.max[2] + m * 1.6;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    return M.merge(
      box(w, t, d, STONE, cx, y1 - t / 2, cz), box(w, h, t, STONE, cx, cy, z0 + t / 2),
      box(t, h, d, STONE, x0 + t / 2, cy, cz), box(t, h, d, STONE, x1 - t / 2, cy, cz),
      // The rim round the opening, a fold over the brow and the cheeks.
      box(w, 0.05, 0.03, FOLD, cx, y1 - 0.04, z1 - 0.015), box(0.035, h - 0.05, 0.03, FOLD, x0 + 0.03, cy - 0.025, z1 - 0.015), box(0.035, h - 0.05, 0.03, FOLD, x1 - 0.03, cy - 0.025, z1 - 0.015),
      box(w - 2 * t, h - t, 0.01, RECESS, cx, cy - t / 2, z0 + d * 0.45),
      M.moved(M.turnedX(box(w * 0.5, h * 0.5, 0.08, STONE), -0.5), cx, y1 - h * 0.25, z0 - 0.02));
  };
  // A toga's skirt falling from the hip to the shins, in shallow folds, and a mantle's edge over the left shoulder.
  const skirt = (lite) => {
    const segments = lite ? 8 : 14, HIP = M.BODY.hip, geo = M.lathe({ segments, color: (t) => t < 0.5 ? STONE : FOLD, profile: [[0, -HIP + 0.16], [0.31, -HIP + 0.16], [0.28, -HIP * 0.4], [0.25, 0], [0.23, 0.1]] });
    // Every other facet stands proud: the folds.
    for (let i = 0; i < geo.verts.length; i += 3) if ((i / 3) % segments % 2 && geo.verts[i + 1] < 0.05) { geo.verts[i] *= 1.07; geo.verts[i + 2] *= 1.07; }
    return geo;
  };
  const sash = (tb) => {
    const front = tb.max[2] + 0.008, back = tb.min[2] - 0.008, mid = (tb.min[1] + tb.max[1]) * 0.55, span = tb.max[1] - tb.min[1];
    return M.merge(
      M.moved(M.turnedZ(box(0.11, span * 0.95, 0.035, STONE), -0.62), 0, mid, front),
      M.moved(M.turnedZ(box(0.11, span * 0.95, 0.035, STONE), 0.62), 0, mid, back),
      box(0.13, 0.035, tb.max[2] - tb.min[2] + 0.05, STONE, tb.max[0] * 0.55, tb.max[1] + 0.005, (tb.min[2] + tb.max[2]) / 2));
  };

  // ---- baking ----------------------------------------------------------------------------------------------------

  // Appends a node's geometry, moved by its world matrix and scaled to the statue, into `out`; `own` marks the pieces
  // added here, which keep their colours (the gold), while the figure's turn to marble.
  const append = (out, node, own) => {
    const geo = node.geometry, m = node.world, v = geo.verts, base = out.verts.length / 3;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2];
      out.verts.push((m[0] * x + m[4] * y + m[8] * z + m[12]) * SCALE, (m[1] * x + m[5] * y + m[9] * z + m[13]) * SCALE, (m[2] * x + m[6] * y + m[10] * z + m[14]) * SCALE);
    }
    // A mirroring matrix would turn every face inside out; its faces are wound back.
    const flip = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;
    const packed = BL.compactGeometry?.storageOf(geo);
    for (let n = 0, count = packed ? packed.count : geo.faces.length; n < count; n++) {
      const f = packed ? BL.compactGeometry.copyFace(geo, n) : geo.faces[n], i = Array.from(f.i, k => k + base);
      out.faces.push({ i: flip ? i.reverse() : i, color: own ? f.color : marble(f.color), emissive: own ? f.emissive || 0 : 0 });
    }
    if (geo.normals || geo.smooth) throw new Error("poker statues: a shaded part needs its normals carried");
  };
  const collect = (out, node, own) => {
    if (!node.visible) return;
    if (node.geometry && node.geometry.verts.length) append(out, node, own.has(node));
    for (const child of node.children) collect(out, child, own);
  };
  const handAt = (fig, side, out) => {
    const fore = fig.parts[side < 0 ? "forearmR" : "forearmL"], L = fig.elbow.length, m = fore.world;
    out[0] = -m[4] * L + m[12]; out[1] = -m[5] * L + m[13]; out[2] = -m[6] * L + m[14];
    return out;
  };
  // The pieces are drawn at hand size; the figure's fists are big, so each is grown about its grip and set before it.
  const HELD_SCALE = 1.5, HELD_AHEAD = 0.05;
  const grown = (geo) => {
    const v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] *= HELD_SCALE; v[i + 1] *= HELD_SCALE; v[i + 2] = v[i + 2] * HELD_SCALE + HELD_AHEAD; }
    return geo;
  };
  const cache = M.scopedMap();
  const statueGeometry = (index, lite) => {
    const key = index + ":" + (lite ? 1 : 0);
    if (cache.has(key)) return cache.get(key);
    const pose = POSES[index], fig = M.caveman(traits()), p = fig.parts, own = new Set(), root = fig.root;
    const add = (parent, geo, x = 0, y = 0, z = 0) => { const n = S.createNode({ geometry: geo, position: { x, y, z } }); own.add(n); S.addChild(parent, n); return n; };
    p.armR.rotation.x = pose.armR[0]; p.armR.rotation.z = pose.armR[1];
    p.armL.rotation.x = pose.armL[0]; p.armL.rotation.z = pose.armL[1];
    p.forearmR.rotation.x = pose.foreR; p.forearmL.rotation.x = pose.foreL;
    p.head.rotation.x = pose.head[0]; p.head.rotation.y = pose.head[1];
    p.legR.rotation.x = pose.legs[0]; p.legL.rotation.x = pose.legs[1];
    S.updateWorld(root);
    // Two hands on one piece: each arm rolls in until its hand stands `apart` from the middle.
    const hand = [0, 0, 0], other = [0, 0, 0];
    if (pose.hold === "both") {
      for (const side of [-1, 1]) {
        const arm = side < 0 ? p.armR : p.armL;
        let a = -0.8, b = 0.8;
        for (let it = 0; it < 30; it++) {
          arm.rotation.z = (a + b) / 2;
          S.updateWorld(root);
          // Rolling an arm by +z moves its hand toward +x.
          if (handAt(fig, side, hand)[0] < side * pose.apart) a = arm.rotation.z; else b = arm.rotation.z;
        }
      }
      S.updateWorld(root);
    }
    const headBounds = S.boundsOf(fig.headOpen), seg = lite ? 8 : 14;
    if (pose.hood) { p.head.geometry = null; add(p.head, hood(headBounds)); } else add(p.head, wreath(headBounds, lite));
    add(root, skirt(lite));
    add(p.torso, sash(S.boundsOf(p.torso.geometry)));
    // The piece held, at its grip in the figure's frame, upright and toward the room.
    const held = HELD[index](seg), piece = held.verts ? grown(held) : { left: grown(held.left), right: grown(held.right) };
    if (pose.hold === "pair") {
      handAt(fig, 1, hand); add(root, piece.left, hand[0], hand[1] - root.position.y, hand[2]);
      handAt(fig, -1, other); add(root, piece.right, other[0], other[1] - root.position.y, other[2]);
    } else if (pose.hold === "both") {
      handAt(fig, -1, hand); handAt(fig, 1, other);
      add(root, piece, (hand[0] + other[0]) / 2, (hand[1] + other[1]) / 2 - root.position.y, (hand[2] + other[2]) / 2);
    } else {
      handAt(fig, pose.hold === "left" ? 1 : -1, hand);
      add(root, piece, hand[0], hand[1] - root.position.y, hand[2]);
    }
    S.updateWorld(root);
    const out = { verts: [], faces: [], lines: [] };
    collect(out, root, own);
    // The soles stand on the plinth's top.
    let low = Infinity;
    for (let i = 1; i < out.verts.length; i += 3) low = Math.min(low, out.verts[i]);
    for (let i = 1; i < out.verts.length; i += 3) out.verts[i] -= low;
    cache.set(key, out);
    return out;
  };

  // ---- the room's statues ----------------------------------------------------------------------------------------

  const node = (geo, x = 0, y = 0, z = 0) => S.createNode({ geometry: geo, position: { x, y, z } });
  // The plaque on the plinth's front, below its gold band, on the veined body's face (the foot and cap stand out
  // 0.08 past it).
  const PLAQUE_Y = 0.2, PLAQUE_Z = PLINTH.w / 2 - 0.08 + 0.005;
  // The plate (the kit's, shared by all eight) and each figure's name carved on it, first name over surname, in dark
  // bronze cells standing proud of its face. The name is the `FIGURES` entry's and nothing else.
  const PLATE = Object.freeze({ w: 0.7, h: 0.34, d: 0.035 }), NAME_CELL = 0.016, NAME_PROUD = 0.004, NAME_GAP = 0.03, BRONZE = "#4a3418";
  const names = M.scopedMap();
  const nameGeometry = (index) => {
    if (names.has(index)) return names.get(index);
    const words = FIGURES[index].name.split(" "), lines = [words[0], words.slice(1).join(" ")], step = 5 * NAME_CELL + NAME_GAP, z = PLATE.d + NAME_PROUD / 2;
    const geo = M.merge(...lines.flatMap((line, k) => glyphs(line, NAME_CELL, NAME_PROUD, BRONZE, 0, PLATE.h / 2 + step / 2 - k * step, z)));
    names.set(index, geo);
    return geo;
  };
  const build = (lite) => {
    const root = S.createNode(), plaques = [];
    for (let i = 0; i < FIGURES.length; i++) {
      const s = SLOTS[i], group = S.createNode({ position: { x: s.x, y: 0, z: s.z }, rotation: { x: 0, y: s.yaw, z: 0 } });
      const plaque = node(K.plaque(PLATE), 0, PLAQUE_Y, PLAQUE_Z);
      S.addChild(plaque, node(nameGeometry(i)));
      S.addChild(group, node(K.plinth(PLINTH)), node(statueGeometry(i, !!lite), 0, PLINTH.h, 0), plaque);
      S.addChild(root, group);
      plaques.push(Object.freeze({ node: plaque, index: i }));
    }
    return {
      root, plaques: Object.freeze(plaques),
      dispose() {
        if (root.parent) S.removeChild(root.parent, root);
        while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]);
      }
    };
  };
  const tip = (index) => `${FIGURES[index].name} · read the placard`;

  // ---- the placard board -----------------------------------------------------------------------------------------

  const PAGE_W = 480, PAGE_H = 270, MARGIN = 32, NAME_SCALE = 4, LINE_SCALE = 2;
  // Words onto lines no wider than `width` at `scale`, measured with the font's own metrics.
  const wrap = (text, width, scale) => {
    const font = BL.jumbotronFont, lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? line + " " + word : word;
      if (line && font.measureText(next, scale) > width) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  let board = null;
  const paint = (b) => {
    const font = BL.jumbotronFont, c2 = b.canvas.getContext("2d"), figure = FIGURES[b.index], width = PAGE_W - 2 * MARGIN;
    c2.fillStyle = "#efe9dd";
    c2.fillRect(0, 0, PAGE_W, PAGE_H);
    c2.strokeStyle = K.BRASS;
    c2.lineWidth = 5;
    c2.strokeRect(9, 9, PAGE_W - 18, PAGE_H - 18);
    let y = 30;
    for (const line of wrap(figure.name, width, NAME_SCALE)) {
      font.drawText(c2, line, MARGIN, y, "#2a2420", NAME_SCALE);
      y += font.GLYPH_H * NAME_SCALE + 8;
    }
    y += 10;
    for (const fact of figure.lines) {
      for (const line of wrap(fact, width, LINE_SCALE)) {
        font.drawText(c2, line, MARGIN, y, "#4a3f34", LINE_SCALE);
        y += font.GLYPH_H * LINE_SCALE + 6;
      }
      y += 8;
    }
  };
  const makeBoard = () => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const b = {
      title: "The road to Bitcoin", help: "Arrow keys walk the statues in order, from the mirror toward the bar.",
      count: FIGURES.length, index: 0, version: 0, canvas,
      get caption() { return FIGURES[b.index].name; },
      get note() { return FIGURES[b.index].attribute; },
      go(i) {
        b.index = Math.max(0, Math.min(FIGURES.length - 1, Math.round(i)));
        paint(b);
        b.version++;
      }
    };
    paint(b);
    return b;
  };
  const boardOf = () => board || (board = makeBoard());

  BL.pokerStatues = Object.freeze({ FIGURES, SLOTS, PLINTH, build, board: boardOf, tip });
})();
