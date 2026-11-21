// The Ember Den's crowd, the cast only: twenty-nine invented guests, opponents and gorilla staff, every one under a
// name no GitHub login can hold (`<id>/ember-den`), so none is ever registered in `BL.characters` or joins the roster. A caveman
// member is a clone of `models.caveman` from hashed traits and its own dress hooks, on `bifrost-heimdall.js`'s pattern:
// the clothes paint the body's own blocks (`torso`, `gear`), hair and hats go on the head (`crown`), and what stands
// apart from the body is a node of its own (`extras`): a gown's skirt, a walking frame, a tilted hat, a cigar. The
// left-hand item (briefcase, clutch, cane or glass) is the club's place (`club`), hanging from the fist with its own
// `rest` and `carry`. The hooks draw from `k.rand` alone. A gorilla member is dressed by `staffDress(type)`: cached
// meshes for its head, torso and right arm, plus a sleeve for both arms. `castFor(day, cap)` deals the day's crowd,
// the same on every page; `seatTraits(table, seat)` gives a seat its opponent for good and `seatFigure` what the
// seat's figure wears. Nothing here runs a frame.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const { fnv1a } = BL.math;
  const TAG = "/ember-den";
  // Giving way: the first has right of way over every later one.
  const TYPES = Object.freeze(["walker", "cane", "waiter", "security", "pitBoss", "lady", "highRoller", "businessman", "drunk"]);
  const PEARL = "#f3eee2", SHIRT = "#efeadc", BLACK = "#0f0f11";

  // ---- the pieces that stand apart from the body ----------------------------------------------------------------

  // The left-hand items, built at the Ooga's height in the club's frame: the grip at the origin, +y up the arm, so
  // with a rest of nothing they hang along a hanging arm. The cane reaches the floor from a fist swung forward.
  const items = new Map();
  const item = (kind, h, color) => {
    const key = kind + "/" + h + "/" + color;
    let geo = items.get(key);
    if (geo) return geo;
    const part = (w, hh, d, c, x, y, z) => M.box({ w: w * h, h: hh * h, d: d * h, color: c, offset: { x: x * h, y: y * h, z: z * h } });
    if (kind === "briefcase") {
      geo = M.merge(part(0.07, 0.17, 0.28, color, 0, -0.16, 0.03), part(0.075, 0.012, 0.285, "#2a1a10", 0, -0.13, 0.03),
        part(0.03, 0.05, 0.1, "#2a1a10", 0, -0.06, 0.03), part(0.08, 0.02, 0.03, "#d8b45a", 0, -0.1, -0.05), part(0.08, 0.02, 0.03, "#d8b45a", 0, -0.1, 0.11));
    } else if (kind === "clutch") {
      geo = M.merge(part(0.05, 0.08, 0.16, color, 0, -0.08, 0.04), part(0.055, 0.02, 0.165, "#d8b45a", 0, -0.045, 0.04));
    } else if (kind === "cane") {
      geo = M.merge(part(0.024, 0.86, 0.024, color, 0, -0.41, 0.02), part(0.026, 0.024, 0.1, color, 0, 0.03, 0.06),
        part(0.026, 0.05, 0.024, color, 0, 0.01, 0.11), part(0.03, 0.03, 0.03, "#1b1b1b", 0, -0.855, 0.02));
    } else {
      const glass = M.lathe({ segments: 10, profile: [[0, 0.05], [0.036, 0.05], [0.036, 0.09], [0, 0.09]], color: "#d8eef2", emissive: 0.15 });
      const drink = M.lathe({ segments: 10, profile: [[0, -0.02], [0.034, -0.02], [0.034, 0.05], [0, 0.05]], color });
      geo = M.moved(M.merge(drink, glass), 0, 0, 0.11);
      for (let i = 0; i < geo.verts.length; i++) geo.verts[i] *= h;
    }
    items.set(key, geo);
    return geo;
  };
  // The rest are built at a height of one and scaled by the Ooga's on their node. The root stands at the hip, the
  // `models.BODY.hip` of a height over the soles.
  const HIP = M.BODY.hip;
  const skirts = new Map();
  const skirt = (color) => {
    let geo = skirts.get(color);
    if (!geo) skirts.set(color, geo = M.lathe({ segments: 12, profile: [[0, -HIP + 0.1], [0.33, -HIP + 0.1], [0.27, 0], [0.24, 0.14]], color }));
    return geo;
  };
  // A walking frame round the front of the body, its grips where the fists rest with the arms at `FRAME_ARM` and the
  // body leaned over it.
  const FRAME_ARM = -0.45;
  const walkingFrame = M.cached(() => {
    const parts = [], metal = "#b9bec4", rubber = "#2a2a2a", top = 0.15;
    for (const x of [-0.37, 0.37]) {
      for (const z of [0.24, 0.52]) parts.push(M.box({ w: 0.03, h: HIP + top, d: 0.03, color: metal, offset: { x, y: (top - HIP) / 2, z } }),
        M.box({ w: 0.045, h: 0.03, d: 0.045, color: rubber, offset: { x, y: -HIP + 0.015, z } }));
      parts.push(M.box({ w: 0.03, h: 0.03, d: 0.31, color: metal, offset: { x, y: top, z: 0.38 } }),
        M.box({ w: 0.045, h: 0.045, d: 0.1, color: rubber, offset: { x, y: top, z: 0.39 } }));
    }
    parts.push(M.box({ w: 0.77, h: 0.03, d: 0.03, color: metal, offset: { y: -0.25, z: 0.52 } }));
    return M.merge(...parts);
  });
  // A soft hat with a band, worn tilted.
  const hat = M.cached(() => M.merge(
    M.lathe({ segments: 12, profile: [[0, 0], [0.35, 0], [0.35, 0.03], [0, 0.03]], color: "#2a2624" }),
    M.lathe({ segments: 12, profile: [[0.25, 0.02], [0.25, 0.08], [0.23, 0.25], [0, 0.27]], color: "#2a2624" }),
    M.lathe({ segments: 12, profile: [[0.255, 0.03], [0.255, 0.075], [0, 0.075]], color: "#7a2230" })));
  // A cigar from the mouth, its tip burning.
  const cigar = M.cached(() => M.merge(
    M.box({ w: 0.028, h: 0.028, d: 0.25, color: "#5b3a22", offset: { z: 0.125 } }),
    M.box({ w: 0.03, h: 0.03, d: 0.03, color: "#c9a24a", offset: { z: 0.06 } }),
    M.box({ w: 0.029, h: 0.029, d: 0.025, color: "#ff7a2a", emissive: 0.9, offset: { z: 0.262 } })));

  // ---- dress -----------------------------------------------------------------------------------------------------

  // One outfit as data: its `style` (dinner, suit, gown, cardigan, braces) and colours, the item in hand, and the
  // pieces that stand apart. Clothes paint the body's blocks; the chest's front is z 4 and 5, its middle x 4.
  const dressOf = (o) => ({
    torso(k, v) {
      const c = k.color, main = c(o.main), shirt = c(o.shirt || SHIRT), low = c(o.low || o.main), tie = c(o.tie || BLACK);
      const extra = o.extra ? c(o.extra) : main, skin = k.P.skin;
      v.fill(0, 8, 0, 7, 0, 5, (x, y, z) => {
        const front = z >= 4, back = z <= 1, dx = Math.abs(x - 4);
        if (o.style === "gown") return front && y === 7 && dx <= 2 ? skin : front && y === 6 && dx <= 2 ? c(PEARL) : main;
        if (y <= 1) return low;
        if (o.style === "braces") return (x === 2 || x === 6) && (front || back) ? extra : shirt;
        if (o.style === "cardigan") return front && y >= 6 && dx <= 1 ? shirt : front && x === 4 && y % 2 === 0 ? extra : main;
        // A jacket open down a V to the shirt, wider where it hangs open.
        const shirtFront = front && (o.open ? y >= 3 && dx <= 2 : (y >= 5 && dx <= 1) || (y === 4 && dx === 0));
        if (o.style === "suit" && front && x === 4 && y >= 3 && y <= 6) return tie;
        if (o.style === "dinner" && front && (o.undone ? (x === 3 || x === 5) && y >= 6 : y === 7 && dx <= 1)) return tie;
        return shirtFront ? shirt : main;
      });
      k.loin = [low, low];
    },
    gear(k) {
      const u = k.u, c = k.color, skin = k.P.skin, main = c(o.main), low = c(o.low || o.main), arm = M.makeVox(), leg = M.makeVox();
      if (o.style === "gown") {
        arm.fill(0, 2, 0, 8, 0, 2, skin);
        arm.fill(0, 2, 9, 10, 0, 2, main);
      } else if (o.style === "braces") {
        arm.fill(0, 2, 0, 4, 0, 2, skin);
        arm.fill(0, 2, 5, 10, 0, 2, c(o.shirt || SHIRT));
      } else {
        arm.fill(0, 2, 0, 1, 0, 2, skin);
        arm.fill(0, 2, 2, 2, 0, 2, c(o.shirt || SHIRT));
        arm.fill(0, 2, 3, 10, 0, 2, main);
      }
      leg.fill(0, 3, 2, 4, 0, 3, low);
      const shoe = c(o.shoes || "#16120f");
      // A gown's shoes are heels: a raised sole on a heel at the back and the toe at the front, the arch open.
      if (o.style === "gown") { leg.fill(0, 3, 1, 1, 0, 5, shoe); leg.fill(1, 2, 0, 0, 0, 0, shoe); leg.fill(0, 3, 0, 0, 4, 5, shoe); }
      else leg.fill(0, 3, 0, 1, 0, 5, shoe);
      k.parts.armR.geometry = k.parts.armL.geometry = k.vg(arm, { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
      k.parts.legR.geometry = k.parts.legL.geometry = k.vg(leg, { x: -2 * u, y: -5 * u, z: -2.5 * u });
    },
    // Hair up in a bun, or grey hair under a flat cap: both on a bald head, so the island's ragged crown never shows
    // through, and its ears show under the hair.
    crown: o.bun || o.cap ? (k, v) => {
      const hair = k.hairJ;
      if (o.bun) {
        v.fill(-1, 7, 6, 7, -1, 6, hair);
        for (const x of [-1, 7]) v.fill(x, x, 4, 5, -1, 5, hair);
        v.fill(-1, 7, 1, 5, -1, -1, hair);
        v.fill(2, 4, 8, 9, 0, 2, hair);
        v.set(5, 8, 1, k.color("#d9b45a"));
      } else {
        const cap = k.color(o.cap);
        for (const x of [-1, 7]) v.fill(x, x, 4, 6, -1, 4, hair);
        v.fill(-1, 7, 2, 6, -1, -1, hair);
        v.fill(-1, 7, 6, 7, -1, 6, cap);
        v.fill(0, 6, 6, 6, 7, 8, cap);
      }
    } : undefined,
    club: o.item ? (k) => ({ default: item(o.item, k.h, o.itemColor), rest: { x: 0, z: 0 }, carry: { x: 0, z: o.item === "cane" ? 0 : 0.1 } }) : undefined,
    extras(k) {
      const h = k.h, u = k.u, scale = { x: h, y: h, z: h };
      // Empty-handed: the island's club stays hidden.
      if (!o.item) k.parts.club.visible = false;
      if (o.style === "gown") S.addChild(k.root, S.createNode({ geometry: skirt(o.main), scale }));
      if (o.frame) S.addChild(k.root, S.createNode({ geometry: walkingFrame(), scale }));
      if (o.hat) S.addChild(k.parts.head, S.createNode({ geometry: hat(), position: { x: 0.6 * u, y: 8 * u, z: -0.3 * u }, rotation: { x: -0.14, y: 0, z: -0.32 }, scale }));
      if (o.cigar) S.addChild(k.parts.head, S.createNode({ geometry: cigar(), position: { x: 1 * u, y: 0.5 * u, z: 2.8 * u }, rotation: { x: 0.14, y: 0.3, z: 0 }, scale }));
    }
  });

  // ---- the cast --------------------------------------------------------------------------------------------------

  // Every caveman member: its outfit and the look flags and overrides it carries into its traits.
  const dinner = (main, extra = {}) => ({ style: "dinner", main, low: "#16161a", shoes: BLACK, ...extra });
  const suit = (main, tie, extra = {}) => ({ style: "suit", main, tie, item: "briefcase", itemColor: "#4a2e1c", ...extra });
  const gown = (main, heel) => ({ style: "gown", main, shoes: heel, bun: true, item: "clutch", itemColor: main });
  const CAVEMEN = [
    ["highroller-1", "highRoller", "Mr. Velvet", dinner(BLACK, { cigar: true }), { cleanShaven: true }],
    ["highroller-2", "highRoller", "Big Nine", dinner("#1b2340", { cigar: true }), { cleanShaven: true }],
    ["suit-1", "businessman", "Mr. Ledger", suit("#6b6e73", "#8c2a2a"), {}],
    ["suit-2", "businessman", "Mr. Quarterly", suit("#22304f", "#c79a2f"), { cleanShaven: true }],
    ["suit-3", "businessman", "Mr. Margin", suit("#5a4030", "#2f5a3a"), {}],
    ["lady-1", "lady", "Lady Emerald", gown("#1f6b4a", "#1a1414"), { slim: true, build: "slim", cleanShaven: true, bald: true }],
    ["lady-2", "lady", "Lady Claret", gown("#6e1f33", "#d8b45a"), { slim: true, build: "slim", cleanShaven: true, bald: true }],
    ["lady-3", "lady", "Lady Gilt", gown("#c9a24a", "#1a1414"), { slim: true, build: "slim", cleanShaven: true, bald: true }],
    ["cane-1", "cane", "Old Bert", { style: "cardigan", main: "#7a5a3a", extra: "#d8c9a6", low: "#4a463f", cap: "#5e5242", item: "cane", itemColor: "#5a3a22" }, { hair: "#b9b6ae", bald: true, height: 0.96 }],
    ["cane-2", "cane", "Old Morris", { style: "cardigan", main: "#4b5a6b", extra: "#c9c2b0", low: "#3e3b36", cap: "#3f3a36", item: "cane", itemColor: "#2e241c" }, { hair: "#c8c5bd", bald: true, height: 0.95 }],
    ["walker-1", "walker", "Grandpa Stan", { style: "braces", main: "#dfe6ea", shirt: "#dfe6ea", extra: "#6e2a2a", low: "#5a5650", frame: true }, { hair: "#c8c5bd", bald: true, height: 0.94 }],
    ["drunk-1", "drunk", "Lucky Lou", dinner(BLACK, { shirt: "#ece6d6", open: true, undone: true, hat: true, item: "glass", itemColor: "#c8892a" }), {}],
    ["player-1", "player", "The Duke", dinner("#4a1f2a"), { cleanShaven: true }],
    ["player-2", "player", "Mr. Dividend", suit("#3a4a3f", "#3c5f8f"), {}],
    ["player-3", "player", "Lady Sapphire", gown("#24459a", "#1a1414"), { slim: true, build: "slim", cleanShaven: true, bald: true }],
    // The rest of the seated opponents: only ever at a table, each with its own skin, hair and cloth, in the dress
    // the walking cast wears but never the frame, cane, tray or the drunk's props, which would clip a chair.
    ["player-4", "player", "The Countess", gown("#5b2a6e", "#d8b45a"), { slim: true, build: "slim", cleanShaven: true, bald: true, skin: "#8a5a3a" }],
    ["player-5", "player", "Mr. Bullion", dinner("#7a5a1a", { cigar: true }), { cleanShaven: true, skin: "#d9a06b", hair: "#151312" }],
    ["player-6", "player", "Mr. Escrow", suit("#7a6a4a", "#3a1f4f"), { skin: "#a9744c", hair: "#5c4425" }],
    ["player-7", "player", "Lady Coral", gown("#c4574a", "#1a1414"), { slim: true, build: "slim", cleanShaven: true, bald: true, skin: "#d9a06b" }],
    ["player-8", "player", "The Baron", dinner("#203a3a"), { cleanShaven: true, skin: "#8a5a3a", hair: "#2b1b10" }],
    ["player-9", "player", "Mr. Tariff", suit("#2e2e34", "#d06a2a"), { cleanShaven: true, skin: "#c98a5b", hair: "#7a2e12" }],
    ["player-10", "player", "Lady Ivory", gown("#e6dcc4", "#6e1f33"), { slim: true, build: "slim", cleanShaven: true, bald: true, skin: "#b58057" }],
    ["player-11", "player", "High Card Hal", dinner("#5a1a1a", { cigar: true }), { skin: "#a9744c", hair: "#4a2c14" }],
    ["player-12", "player", "Mr. Yield", suit("#3f5a6e", "#e2c25a"), { cleanShaven: true, skin: "#8a5a3a", hair: "#151312" }]
  ];
  const cavemanTraits = (id, display, outfit, look) => {
    const name = id + TAG, hashed = BL.contributors.traitsFor(name);
    return {
      ...hashed, display, skin: look.skin || hashed.skin, hair: look.hair || hashed.hair, fur: outfit.main,
      height: look.height || hashed.height, belly: hashed.belly * (look.slim && !hashed.slim ? 0.8 : 1), dress: dressOf(outfit), ...look
    };
  };
  const STAFF = [["waiter-1", "waiter", "Waiter"], ["waiter-2", "waiter", "Waiter"], ["pitboss-1", "pitBoss", "Pit Boss"], ["security-1", "security", "Security"], ["security-2", "security", "Security"]];
  const CAST = Object.freeze([
    ...CAVEMEN.map(([id, type, display, outfit, look]) => Object.freeze({ id, type, rig: "caveman", traits: cavemanTraits(id, display, outfit, look) })),
    ...STAFF.map(([id, type, display]) => Object.freeze({ id, type, rig: "gorilla", traits: { name: id + TAG, display } }))
  ]);
  const byId = (id) => CAST.find((m) => m.id === id);
  const GUESTS = CAST.filter((m) => m.rig === "caveman" && m.type !== "player");
  // Who sits at a table: the twelve opponents, who never walk the floor (`castFor` deals only `GUESTS`).
  const SEATED = CAST.filter((m) => m.type === "player");

  // ---- gorilla staff ---------------------------------------------------------------------------------------------

  // In the gorilla's own frames, sized on the dealers' jacket (poker-models.js): the torso's from its hips up, the
  // arm's hanging from the shoulder, the head's from its jaw with the face toward +z.
  const box = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
  const jacket = (cloth, shirt, tie) => M.merge(box(0.92, 0.96, 0.66, cloth, 0, 0.49),
    box(0.31, 0.62, 0.08, shirt, 0, 0.64, 0.36), box(0.08, 0.46, 0.09, tie, 0, 0.56, 0.41), box(0.14, 0.1, 0.1, tie, 0, 0.82, 0.41));
  const staffDresses = new Map();
  // The waiter carries the tray on a right arm held forward at `TRAY_ARM`: the tray is built level at the hand as the
  // arm holds it, then turned back into the hanging arm's frame.
  const TRAY_ARM = -1.2, HAND = 0.83;
  const staffDress = (type) => {
    let dress = staffDresses.get(type);
    if (dress) return dress;
    if (type === "waiter") {
      const hy = -HAND * Math.cos(TRAY_ARM) + 0.17, hz = -HAND * Math.sin(TRAY_ARM) + 0.12;
      const glasses = [[-0.12, -0.02], [0.1, -0.08], [0.02, 0.1]].map(([x, z]) => M.moved(M.merge(
        M.lathe({ segments: 8, profile: [[0, 0], [0.04, 0], [0.04, 0.09], [0, 0.09]], color: "#e2c25a" }),
        M.lathe({ segments: 8, profile: [[0.042, 0.09], [0.042, 0.15], [0, 0.15]], color: "#d8eef2", emissive: 0.15 })), x, hy + 0.03, hz + z));
      dress = {
        head: null,
        torso: M.merge(box(0.9, 0.66, 0.64, "#1d1a1c", 0, 0.58), box(0.3, 0.52, 0.08, SHIRT, 0, 0.68, 0.34),
          box(0.06, 0.06, 0.04, "#d8b45a", 0, 0.38, 0.34), box(0.06, 0.06, 0.04, "#d8b45a", 0, 0.26, 0.34),
          box(0.24, 0.09, 0.08, BLACK, 0, 0.88, 0.4), box(0.08, 0.1, 0.1, BLACK, 0, 0.88, 0.42)),
        // The tray flat on the hand, a little ahead of it, with three glasses of fizz on it.
        arm: M.turnedX(M.merge(M.moved(M.lathe({ segments: 14, profile: [[0, 0], [0.3, 0], [0.3, 0.03], [0, 0.03]], color: "#c9ccd0" }), 0, hy, hz), ...glasses), -TRAY_ARM),
        sleeve: M.merge(box(0.4, 0.62, 0.43, SHIRT, 0, -0.29, 0.025), box(0.41, 0.1, 0.44, "#dcd6c4", 0, -0.62, 0.025))
      };
    } else if (type === "pitBoss") {
      dress = {
        head: M.merge(box(0.06, 0.07, 0.07, "#1b1b1d", -0.36, 0.39, 0.04), box(0.02, 0.34, 0.02, "#d9d6cf", -0.36, 0.2, -0.02)),
        torso: jacket("#202327", SHIRT, "#6e1f2a"), arm: null,
        sleeve: M.merge(box(0.4, 0.78, 0.43, "#202327", 0, -0.29, 0.025), box(0.41, 0.12, 0.44, SHIRT, 0, -0.73, 0.025))
      };
    } else if (type === "security") {
      dress = {
        head: M.merge(box(0.66, 0.11, 0.05, "#08080a", 0, 0.39, 0.37), box(0.03, 0.04, 0.28, "#08080a", -0.32, 0.4, 0.22), box(0.03, 0.04, 0.28, "#08080a", 0.32, 0.4, 0.22)),
        torso: jacket("#0d0d10", SHIRT, BLACK), arm: null,
        sleeve: M.merge(box(0.4, 0.78, 0.43, "#0d0d10", 0, -0.29, 0.025), box(0.41, 0.12, 0.44, SHIRT, 0, -0.73, 0.025))
      };
    } else throw new Error(`No staff dress for ${type}`);
    staffDresses.set(type, dress);
    return dress;
  };

  // ---- the day's crowd and the seats ------------------------------------------------------------------------------

  // The day's members: a waiter and security always, the pit boss and the second waiter and security on a full
  // floor (16), then guests in the day's order, never an opponent, at most one drunk and one on a frame.
  const castFor = (day, cap) => {
    const out = [byId("waiter-1"), byId("security-1")];
    if (cap === 16) out.push(byId("pitboss-1"), byId("waiter-2"), byId("security-2"));
    const rank = GUESTS.map((m) => ({ m, key: fnv1a("crowd/" + day + "/" + m.id) })).sort((a, b) => a.key - b.key || (a.m.id < b.m.id ? -1 : 1));
    let drunk = 0, walker = 0;
    for (const { m } of rank) {
      if (out.length >= cap) break;
      if (m.type === "drunk" && drunk++) continue;
      if (m.type === "walker" && walker++) continue;
      out.push(m);
    }
    return out;
  };
  // A table's seats: each seat probes on from its hash to the next opponent no earlier seat at that table holds, so
  // no table seats one twice; with nine seats and twelve opponents every seat has one. The same at every page and
  // every day; one opponent may sit at several tables.
  const seatCache = new Map();
  const seatTraits = (table, seat) => {
    let seats = seatCache.get(table);
    if (!seats) {
      const n = BL.pokerRules.SEATS, taken = new Set();
      seats = new Array(n);
      for (let s = 0; s < n; s++) {
        let k = fnv1a("seat/" + table + "/" + s) % SEATED.length;
        while (taken.has(k)) k = (k + 1) % SEATED.length;
        taken.add(k); seats[s] = SEATED[k].traits;
      }
      seatCache.set(table, seats);
    }
    return seats[seat];
  };
  // What a seat's figure wears: its opponent for a computer player, the hashed stand-in for every human seat (Part E
  // decides how live players look).
  const standIns = [];
  const seatFigure = (table, seat, bot) => bot ? seatTraits(table, seat) : (standIns[seat] ||= BL.contributors.traitsFor("Banana Bot " + seat));

  // ---- what they say ---------------------------------------------------------------------------------------------

  // Short lines by type, said to nobody in particular. The drunk talks to himself.
  const LINES = Object.freeze({
    walker: Object.freeze(["Slow and steady.", "In my day the chips were rocks.", "Mind the frame, sonny.", "I've seen a thousand hands.", "Is it lunch yet?"]),
    cane: Object.freeze(["Lovely evening for it.", "These knees have stories.", "I once held four aces.", "Don't rush an old Ooga.", "Ahh, the good tables."]),
    waiter: Object.freeze(["Drinks, anyone?", "Coming through!", "On the house tonight.", "Careful, it's fizzy.", "Mind the tray, please."]),
    security: Object.freeze(["Keep it friendly.", "All quiet tonight.", "Move along, nothing to see.", "No running on the felt.", "I see everything."]),
    pitBoss: Object.freeze(["Tables look good tonight.", "Keep the cards moving.", "Another full house. Nice.", "Smile, it's free play.", "Table nine needs a dealer."]),
    lady: Object.freeze(["Darling, what a room.", "I only play for fun.", "Is that a royal flush?", "These pearls were my nan's.", "Shall we find a table?"]),
    highRoller: Object.freeze(["Double or nothing.", "Chips are just pebbles, kid.", "I never fold. Almost never.", "Bring me the big table.", "Luck likes a good jacket."]),
    businessman: Object.freeze(["Pot odds, pot odds.", "This is a business meeting.", "My broker would hate this.", "Expensing the bananas.", "Let me check my numbers."]),
    drunk: Object.freeze(["Was it red? It was red.", "Who moved the floor?", "I'm fine. The room isn't.", "Where did my hat go? Oh.", "One more hand. Or two.", "Hic. Excuse me, chair."])
  });

  BL.pokerCrowdModels = { CAST, TYPES, castFor, seatTraits, seatFigure, staffDress, walkingFrame, FRAME_ARM, TRAY_ARM, LINES };
})();
