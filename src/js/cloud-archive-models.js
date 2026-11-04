// The Cloud Archive's room: a white floor without edges, the shaft the beanstalk comes up through, and one dark rack a
// day down a long aisle, each holding a book per commit (cloud-archive-data.js), coloured by who made it: grey for
// automation, slate for a reviewed AI agent, gold for a PR-head match. A day with more commits than a rack holds
// (`shelve`, the generator's own rule) keeps capacity - 1 books and one overflow binder standing for the rest, which
// the plaque and the day's board count. Every rack is one merged mesh, books and all; nothing here is per book.
// `LAYOUT` is the walking plan the interior reads; `build` makes the nodes. Geometry is cached under the
// `cloudarchive` scope and released with it.
(() => {
  "use strict";
  const BL = window.BL;
  const { box, merge, moved, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { fnv1a, hexToRgb } = BL.math;
  const DATA = BL.cloudArchiveData;
  // The shaft is a rectangle in the floor (x0..x1, z0..z1) down to `depth`; the beanstalk stands against its north
  // lip and the ladder plane is its south face (normal +z: the floor, the upper landing, lies to the north).
  const SHAFT = { x0: -1.3, x1: 1.3, z0: 5.2, z1: 7.8, depth: 4.5 };
  const STALK = { x: 0, z: 5.0, r: 0.32 };
  const LADDER = { x: 0, z: STALK.z + STALK.r, nx: 0, nz: 1, width: 1.2, bottom: -SHAFT.depth, top: 0, inset: 0.5 };
  // Racks: one a day, oldest nearest, alternating left and right of the aisle.
  const RACK = { w: 2.6, d: 0.5, h: 2.7, levels: 4, perLevel: 48, aisle: 3.2, pitch: 3.2, first: -1.5 };
  // The generator shelved the data for this rack; a rack of another size would miscount its overflow.
  if (RACK.levels * RACK.perLevel !== DATA.shelf.capacity) throw new Error("Cloud Archive: the rack does not match the data's shelf capacity");
  const shelve = (count) => count <= DATA.shelf.capacity ? { books: count, overflow: 0 } : { books: DATA.shelf.capacity - 1, overflow: count - (DATA.shelf.capacity - 1) };
  const rackAt = (i) => ({ x: (i % 2 ? 1 : -1) * RACK.aisle, z: RACK.first - Math.floor(i / 2) * RACK.pitch, ry: i % 2 ? -Math.PI / 2 : Math.PI / 2 });
  const rows = Math.ceil(DATA.days.length / 2);
  // At the aisle's far end, past the last day: a small TV on a low table facing back up the aisle, and two leather
  // armchairs in front of it turned in toward it. Each chair's `ry` is the way a sitter faces.
  const LOUNGE_Z = RACK.first - rows * RACK.pitch - 4;
  const TV = { x: 0, z: LOUNGE_Z - 2.4, table: 0.62, w: 0.62, h: 0.5, d: 0.5, screenW: 0.46, screenH: 0.345 };
  const CHAIR_AT = [-1, 1].map((side) => {
    const x = side * 1.25, z = LOUNGE_Z;
    return { x, z, ry: Math.atan2(TV.x - x, TV.z - z) };
  });
  // The island's Oogatron, hung two-sided over the aisle, high enough to clear the plaques (`y` is its middle; `ropes`
  // the local x of the two ropes it hangs from, which run up out of sight; `gap` how far each face's middle sits from
  // the ropes, in board units). It rests over the aisle's middle (`rest`) but never more than `range` from the walker,
  // gliding along the aisle (`zMax` its start, `zMin` its last racks) as the aisle grows with the history.
  const AISLE_END = RACK.first - (rows - 1) * RACK.pitch;
  const SIGN = { x: 0, y: 5.6, scale: 2.8, ropes: 1.0, ropeTop: 20, gap: 0.25, range: 24,
    zMax: RACK.first - RACK.pitch / 2, zMin: AISLE_END, rest: (RACK.first + AISLE_END) / 2 };
  const LAYOUT = {
    SHAFT, STALK, LADDER, RACK, rackAt, TV, CHAIRS: CHAIR_AT, SIGN, shelve,
    arrival: { x: 0, z: 7.0 },
    // Walkers stay on the floor within these bounds.
    bounds: { x0: -9, x1: 9, z0: LOUNGE_Z - 6, z1: 11 },
    // What stands in the lounge, as circles walkers keep out of.
    solids: [{ x: TV.x, z: TV.z, r: 0.5 }, ...CHAIR_AT.map((c) => ({ x: c.x, z: c.z, r: 0.5 }))],
    inShaft: (x, z, margin = 0) => x > SHAFT.x0 + margin && x < SHAFT.x1 - margin && z > SHAFT.z0 + margin && z < SHAFT.z1 - margin
  };
  const own = (build) => { const read = cached(build); return () => BL.models.withScope("cloudarchive", read); };
  const WHITE = "#f4f5f7", LIP = "#e6e9ee", FRAME = "#2a2c31", BOARD = "#3a3d44", GOLD = "#e8b04a", BOT = "#9aa0a8", AGENT = "#6f8fa8", BINDER = "#1f2125";
  const flat = (x0, z0, x1, z1, y, color) => {
    const c = hexToRgb(color);
    return { verts: [x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], faces: [{ i: [0, 1, 2, 3], color: c, emissive: 0 }], lines: [] };
  };
  // The floor round the shaft as four big panels, and the shaft's walls and bottom, all flat white.
  const floor = own(() => {
    const R = 400, S = SHAFT, d = S.depth;
    const geo = merge(
      flat(-R, -R, R, S.z0, 0, WHITE), flat(-R, S.z1, R, R, 0, WHITE),
      flat(-R, S.z0, S.x0, S.z1, 0, WHITE), flat(S.x1, S.z0, R, S.z1, 0, WHITE),
      flat(S.x0, S.z0, S.x1, S.z1, -d, LIP),
      box({ w: S.x1 - S.x0, h: d, d: 0.1, color: LIP, offset: { x: 0, y: -d / 2, z: S.z0 - 0.05 } }),
      box({ w: S.x1 - S.x0, h: d, d: 0.1, color: LIP, offset: { x: 0, y: -d / 2, z: S.z1 + 0.05 } }),
      box({ w: 0.1, h: d, d: S.z1 - S.z0, color: LIP, offset: { x: S.x0 - 0.05, y: -d / 2, z: (S.z0 + S.z1) / 2 } }),
      box({ w: 0.1, h: d, d: S.z1 - S.z0, color: LIP, offset: { x: S.x1 + 0.05, y: -d / 2, z: (S.z0 + S.z1) / 2 } })
    );
    geo.castShadow = false;
    return geo;
  });
  // A colour an identity keeps on every shelf: a hue from its label and place (two identities sharing a name differ),
  // never too pale for the white room; automation and agents in their own greys.
  const personColor = (index) => {
    const p = DATA.people[index];
    if (p.kind === "automation") return BOT;
    if (p.kind === "agent") return AGENT;
    const h = fnv1a(`${p.label}#${index}`) % 360, s = 0.55, l = 0.48;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  // One day's rack in its own frame: length along x, front facing +z, standing on y = 0.
  const rackGeometry = (day) => {
    const W = RACK.w, D = RACK.d, H = RACK.h, parts = [];
    const gap = H / (RACK.levels + 0.4);
    for (const sx of [-1, 1]) parts.push(box({ w: 0.06, h: H, d: D, color: FRAME, offset: { x: sx * (W / 2 - 0.03), y: H / 2 } }));
    parts.push(box({ w: W, h: H, d: 0.04, color: FRAME, offset: { y: H / 2, z: -D / 2 + 0.02 } }));
    for (let level = 0; level <= RACK.levels; level++) parts.push(box({ w: W - 0.08, h: 0.04, d: D, color: BOARD, offset: { y: 0.12 + level * gap } }));
    const step = (W - 0.16) / RACK.perLevel, shelf = shelve(day.commits.length);
    const at = (n) => ({ x: -W / 2 + 0.08 + step * (n % RACK.perLevel + 0.5), y: 0.14 + Math.floor(n / RACK.perLevel) * gap });
    for (let n = 0; n < shelf.books; n++) {
      const c = day.commits[n], o = at(n);
      const hash = fnv1a(c[0]), tall = 0.28 + (hash % 1000) / 1000 * 0.16, deep = 0.26 + (hash >>> 10) % 100 / 100 * 0.1;
      parts.push(box({ w: step * 0.86, h: tall, d: deep, color: c[3] ? GOLD : personColor(c[1]), emissive: c[3] ? 0.25 : 0,
        offset: { x: o.x, y: o.y + tall / 2, z: D / 2 - deep / 2 - 0.03 } }));
    }
    // The overflow binder in the last slot: a full-height black box with a gold band, standing for every later commit.
    if (shelf.overflow) {
      const o = at(shelf.books);
      parts.push(box({ w: step * 0.95, h: 0.46, d: 0.38, color: BINDER, offset: { x: o.x, y: o.y + 0.23, z: D / 2 - 0.22 } }),
        box({ w: step * 0.97, h: 0.05, d: 0.39, color: GOLD, emissive: 0.3, offset: { x: o.x, y: o.y + 0.32, z: D / 2 - 0.22 } }));
    }
    return merge(...parts);
  };
  const racks = own(() => DATA.days.map(rackGeometry));
  // The beanstalk's top: up the shaft's north lip from its floor, curling over above the room's floor.
  const stalk = own(() => {
    const geo = BL.cloudArchiveEntry.stalkGeometry(SHAFT.depth + 2.4, STALK.r, 5, SHAFT.depth / (SHAFT.depth + 2.4));
    return moved(geo, 0, -SHAFT.depth, 0);
  });
  // A deep leather armchair, its front to +z: rolled arms, a tall back, a button-tufted seat, four short legs.
  const LEATHER = "#7a2a1f", DARK = "#5c1d15", LEG = "#2a1a12";
  const chair = own(() => {
    const parts = [
      box({ w: 0.86, h: 0.18, d: 0.8, color: LEATHER, offset: { y: 0.24 } }),
      box({ w: 0.62, h: 0.12, d: 0.62, color: LEATHER, offset: { y: 0.39, z: 0.05 } }),
      box({ w: 0.86, h: 0.78, d: 0.2, color: LEATHER, offset: { y: 0.66, z: -0.32 } }),
      box({ w: 0.9, h: 0.1, d: 0.26, color: DARK, offset: { y: 1.07, z: -0.31 } })
    ];
    for (const sx of [-1, 1]) {
      parts.push(box({ w: 0.14, h: 0.32, d: 0.8, color: LEATHER, offset: { x: sx * 0.38, y: 0.48 } }));
      parts.push(box({ w: 0.18, h: 0.08, d: 0.82, color: DARK, offset: { x: sx * 0.38, y: 0.66 } }));
      for (const sz of [-1, 1]) parts.push(box({ w: 0.07, h: 0.15, d: 0.07, color: LEG, offset: { x: sx * 0.36, y: 0.075, z: sz * 0.33 } }));
    }
    // Buttons on the back and seat.
    for (let i = 0; i < 6; i++) parts.push(box({ w: 0.035, h: 0.035, d: 0.02, color: DARK, offset: { x: -0.24 + (i % 3) * 0.24, y: 0.55 + Math.floor(i / 3) * 0.24, z: -0.215 } }));
    const geo = merge(...parts);
    return geo;
  });
  // The TV: a small boxy set with a wood case, dials and rabbit ears, on a low black table. Its screen is the
  // interior's own picture node, `TV.screen*` wide, at the case's front.
  const tvSet = own(() => {
    const T = TV, y = T.table;
    return merge(
      box({ w: 0.8, h: 0.04, d: 0.6, color: "#1c1c1f", offset: { y: y - 0.02 } }),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box({ w: 0.04, h: y - 0.04, d: 0.04, color: "#1c1c1f", offset: { x: sx * 0.36, y: (y - 0.04) / 2, z: sz * 0.26 } }))),
      box({ w: T.w, h: T.h, d: T.d, color: "#6b4a2e", offset: { y: y + T.h / 2 } }),
      box({ w: T.screenW + 0.06, h: T.screenH + 0.06, d: 0.02, color: "#1a1a1a", offset: { x: -0.05, y: y + T.h / 2, z: T.d / 2 + 0.005 } }),
      box({ w: 0.035, h: 0.035, d: 0.03, color: "#c9c2b0", offset: { x: 0.25, y: y + T.h / 2 + 0.1, z: T.d / 2 + 0.01 } }),
      box({ w: 0.035, h: 0.035, d: 0.03, color: "#c9c2b0", offset: { x: 0.25, y: y + T.h / 2 - 0.02, z: T.d / 2 + 0.01 } }),
      moved(BL.models.turnedZ(box({ w: 0.015, h: 0.42, d: 0.015, color: "#b8b8b8", offset: { y: 0.21 } }), 0.45), -0.06, y + T.h, 0),
      moved(BL.models.turnedZ(box({ w: 0.015, h: 0.42, d: 0.015, color: "#b8b8b8", offset: { y: 0.21 } }), -0.45), 0.06, y + T.h, 0)
    );
  });
  // A dated plaque over a rack: a painted canvas the interior hangs.
  const plaque = (canvas, w, h) => {
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [255, 255, 255], emissive: 0.9 }], lines: [], castShadow: false };
    geo.imageSurface = { canvas, version: 1, rect: [-w / 2, -h / 2, w, h] };
    return geo;
  };
  const build = () => {
    const root = createNode();
    const stalkNode = createNode({ geometry: stalk(), position: { x: STALK.x, y: 0, z: STALK.z } });
    addChild(root, createNode({ geometry: floor() }));
    addChild(root, stalkNode);
    const rackNodes = racks().map((geometry, i) => {
      const at = rackAt(i), node = createNode({ geometry, position: { x: at.x, y: 0, z: at.z }, rotation: { x: 0, y: at.ry, z: 0 } });
      addChild(root, node);
      return node;
    });
    const chairs = CHAIR_AT.map((c) => {
      const node = createNode({ geometry: chair(), position: { x: c.x, y: 0, z: c.z }, rotation: { x: 0, y: c.ry, z: 0 } });
      addChild(root, node);
      return node;
    });
    const tv = createNode({ geometry: tvSet(), position: { x: TV.x, y: 0, z: TV.z } });
    // The screen's picture is the interior's (`plaque` over a canvas), just proud of the bezel.
    const screen = createNode({ position: { x: TV.x - 0.05, y: TV.table + TV.h / 2, z: TV.z + TV.d / 2 + 0.02 } });
    addChild(root, tv); addChild(root, screen);
    const ropes = createNode({ geometry: signRopes(), position: { x: SIGN.x, y: SIGN.y, z: SIGN.rest } });
    addChild(root, ropes);
    return { root, stalk: stalkNode, racks: rackNodes, chairs, tv, screen, ropes };
  };
  // The sign's two ropes, from inside its cap plank up out of sight, in world units round the sign's middle; the
  // interior moves them with it.
  const signRopes = own(() => {
    const G = SIGN, from = 0.7 * G.scale, h = G.ropeTop - G.y - from;
    return merge(...[-1, 1].map((side) => box({ w: 0.07, h, d: 0.07, color: "#6b5233", offset: { x: side * G.ropes * G.scale, y: from + h / 2, z: 0 } })));
  });
  const geometries = () => [floor(), stalk(), ...racks(), chair(), tvSet(), signRopes()];
  BL.cloudArchiveModels = { LAYOUT, build, plaque, geometries, personColor };
})();
