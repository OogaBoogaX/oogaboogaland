// The Ember Den's crowd, the cast only: invented guests, opponents, lounge residents and gorilla staff, every one under
// a name no GitHub login can hold (`<id>/ember-den`), so none is ever registered in `BL.characters` or joins the
// roster. Everyone is dressed for an evening at a grand casino: the men in dinner jackets or dark suits, the women in
// short cocktail dresses and heels. A caveman member is a clone of `models.caveman` from hashed traits and its own
// dress hooks, on `bifrost-heimdall.js`'s pattern: the clothes paint the body's own blocks (`torso`, `gear`), hair goes
// on the head (`crown`), and what stands apart from the body is a node of its own (`extras`): a dress's short skirt, a
// tilted hat, a cigar. The item in hand (a clutch, a tumbler or a martini) is the club's place (`club`), hanging from
// the fist with its own `rest` and `carry`. The hooks draw from `k.rand` alone. A gorilla member is dressed by
// `staffDress(type)`: cached meshes for its head, torso and right arm, plus a sleeve for both arms. `castFor(day, cap)`
// deals the day's floor for any cap, the same on every page; `seatTraits(table, seat)` gives a seat its opponent for
// good and `seatFigure` what the seat's figure wears; `LOUNGE` are the lounges' residents. Nothing here runs a frame.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const { fnv1a } = BL.math;
  // The Ember Den's old spelling: each look is hashed from the whole name, so a new suffix would redress the crowd.
  const TAG = "/ember-den";
  // Giving way: the first has right of way over every later one.
  const TYPES = Object.freeze(["waiter", "security", "pitBoss", "lady", "highRoller", "businessman", "drunk"]);
  const PEARL = "#f3eee2", SHIRT = "#efeadc", BLACK = "#0f0f11", LBD = "#141216";

  // ---- the pieces that stand apart from the body ----------------------------------------------------------------

  // The items in hand, built at the Ooga's height in the club's frame: the grip at the origin, +y up the arm, so with a
  // rest of nothing they hang along a hanging arm, a glass upright.
  const items = new Map();
  const item = (kind, h, color) => {
    const key = kind + "/" + h + "/" + color;
    let geo = items.get(key);
    if (geo) return geo;
    const part = (w, hh, d, c, x, y, z) => M.box({ w: w * h, h: hh * h, d: d * h, color: c, offset: { x: x * h, y: y * h, z: z * h } });
    if (kind === "clutch") {
      geo = M.merge(part(0.05, 0.08, 0.16, color, 0, -0.08, 0.04), part(0.055, 0.02, 0.165, "#d8b45a", 0, -0.045, 0.04));
    } else if (kind === "martini") {
      // A cone bowl on a stem with a round foot, a pale drink to its brim and an olive on a pick across it.
      const glass = "#dcecf0";
      geo = M.moved(M.merge(
        M.lathe({ segments: 12, profile: [[0, -0.03], [0.04, -0.03], [0.04, -0.022], [0.006, -0.018], [0.006, 0.05], [0, 0.05]], color: glass, emissive: 0.15 }),
        M.lathe({ segments: 12, profile: [[0, 0.046], [0.008, 0.046], [0.07, 0.115], [0.07, 0.12], [0, 0.12]], color: glass, emissive: 0.15 }),
        M.lathe({ segments: 12, profile: [[0.06, 0.118], [0.06, 0.124], [0, 0.124]], color: "#e8ecc8", emissive: 0.25 }),
        M.box({ w: 0.026, h: 0.026, d: 0.026, color: "#5f7a2a", offset: { x: 0.02, y: 0.12, z: 0 } }),
        M.box({ w: 0.006, h: 0.006, d: 0.11, color: "#c9a24a", offset: { x: 0.02, y: 0.13, z: 0.01 } })), 0, 0, 0.11);
      for (let i = 0; i < geo.verts.length; i++) geo.verts[i] *= h;
    } else {
      // A tumbler of something amber, or a flute of fizz.
      const glass = M.lathe({ segments: 10, profile: [[0, 0.05], [0.036, 0.05], [0.036, 0.09], [0, 0.09]], color: "#d8eef2", emissive: 0.15 });
      const drink = M.lathe({ segments: 10, profile: [[0, -0.02], [0.034, -0.02], [0.034, 0.05], [0, 0.05]], color });
      geo = M.moved(M.merge(drink, glass), 0, 0, 0.11);
      for (let i = 0; i < geo.verts.length; i++) geo.verts[i] *= h;
    }
    items.set(key, geo);
    return geo;
  };
  // The rest are built at a height of one and scaled by the Ooga's on their node. The root stands at the hip, the
  // `models.BODY.hip` of a height over the soles. A cocktail dress's skirt flares from the waist to above the knee.
  const HIP = M.BODY.hip, HEM = -0.19;
  const skirts = new Map();
  const skirt = (color) => {
    let geo = skirts.get(color);
    if (!geo) skirts.set(color, geo = M.lathe({ segments: 12, profile: [[0, HEM], [0.3, HEM], [0.31, HEM + 0.025], [0.27, 0], [0.22, 0.09], [0, 0.09]], color }));
    return geo;
  };
  // A soft hat with a band, worn tilted.
  const hat = M.cached(() => M.merge(
    M.lathe({ segments: 12, profile: [[0, 0], [0.35, 0], [0.35, 0.03], [0, 0.03]], color: "#2a2624" }),
    M.lathe({ segments: 12, profile: [[0.25, 0.02], [0.25, 0.08], [0.23, 0.25], [0, 0.27]], color: "#2a2624" }),
    M.lathe({ segments: 12, profile: [[0.255, 0.03], [0.255, 0.075], [0, 0.075]], color: "#7a2230" })));
  // A cigar from the mouth, its tip burning at `CIGAR_TIP` along its length (in heights, before the node's scale).
  const CIGAR_TIP = 0.275;
  const cigar = M.cached(() => M.merge(
    M.box({ w: 0.028, h: 0.028, d: 0.25, color: "#5b3a22", offset: { z: 0.125 } }),
    M.box({ w: 0.03, h: 0.03, d: 0.03, color: "#c9a24a", offset: { z: 0.06 } }),
    M.box({ w: 0.029, h: 0.029, d: 0.025, color: "#ff7a2a", emissive: 0.9, offset: { z: 0.262 } })));

  // ---- dress -----------------------------------------------------------------------------------------------------

  // One outfit as data: its `style` (dinner, suit or dress) and colours, the item in hand, and the pieces that stand
  // apart. Clothes paint the body's blocks; the chest's front is z 4 and 5, its middle x 4.
  const dressOf = (o) => ({
    torso(k, v) {
      const c = k.color, main = c(o.main), shirt = c(o.shirt || SHIRT), low = c(o.low || o.main), tie = c(o.tie || BLACK);
      const skin = k.P.skin, lapel = o.lapel ? c(o.lapel) : main, square = c(o.square || SHIRT), shine = o.shine ? c(o.shine) : main;
      v.fill(0, 8, 0, 7, 0, 5, (x, y, z) => {
        const front = z >= 4, back = z <= 1, dx = Math.abs(x - 4);
        if (o.style === "dress") {
          // A low neckline front and back between thin straps, a strand of pearls on some, and sequins catching the
          // light in a scatter over the rest.
          if (y === 7 && dx <= 2 && (front || back)) return skin;
          if (o.pearls && front && y === 6 && dx <= 2 && x % 2 === 0) return c(PEARL);
          return o.shine && (x * 3 + y * 5 + z * 7) % 4 === 0 ? shine : main;
        }
        if (y <= 1) return low;
        // A jacket open down a V to the shirt, wider where it hangs open; satin lapels either side of the V.
        const shirtFront = front && (o.open ? y >= 3 && dx <= 2 : (y >= 5 && dx <= 1) || (y === 4 && dx === 0));
        if (o.style === "suit" && front && x === 4 && y >= 3 && y <= 6) return tie;
        if (o.style === "dinner" && front && (o.undone ? (x === 3 || x === 5) && y >= 6 : y === 7 && dx <= 1)) return tie;
        if (shirtFront) return shirt;
        if (front && x === 6 && y === 6) return square;
        if (front && dx === 2 && y >= 4 && y <= 7 || front && dx === 1 && y === 4) return lapel;
        return main;
      });
      k.loin = [low, low];
    },
    gear(k) {
      const u = k.u, c = k.color, skin = k.P.skin, main = c(o.main), low = c(o.low || o.main), arm = M.makeVox(), leg = M.makeVox();
      const shoe = c(o.shoes || "#0d0c0e");
      if (o.style === "dress") {
        arm.fill(0, 2, 0, 10, 0, 2, skin);
        // Bare legs under the hem to heels: a raised sole on a heel at the back and the toe at the front, the arch open.
        leg.fill(0, 3, 2, 4, 0, 3, skin);
        leg.fill(0, 3, 1, 1, 0, 5, shoe); leg.fill(1, 2, 0, 0, 0, 0, shoe); leg.fill(0, 3, 0, 0, 4, 5, shoe);
      } else {
        arm.fill(0, 2, 0, 1, 0, 2, skin);
        arm.fill(0, 2, 2, 2, 0, 2, c(o.shirt || SHIRT));
        arm.fill(0, 2, 3, 10, 0, 2, main);
        leg.fill(0, 3, 2, 4, 0, 3, low);
        // Polished shoes: a glint along the toe cap.
        leg.fill(0, 3, 0, 1, 0, 5, shoe);
        leg.fill(1, 2, 1, 1, 5, 5, c(o.glint || "#3a3840"));
      }
      k.parts.armR.geometry = k.parts.armL.geometry = k.vg(arm, { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
      k.parts.legR.geometry = k.parts.legL.geometry = k.vg(leg, { x: -2 * u, y: -5 * u, z: -2.5 * u });
    },
    // Hair up in a bun, or down to the shoulders: both on a bald head, so the island's ragged crown never shows
    // through, and its ears show under the hair.
    crown: o.hair ? (k, v) => {
      const hair = k.hairJ;
      if (o.hair === "up") {
        v.fill(-1, 7, 6, 7, -1, 6, hair);
        for (const x of [-1, 7]) v.fill(x, x, 4, 5, -1, 5, hair);
        v.fill(-1, 7, 1, 5, -1, -1, hair);
        v.fill(2, 4, 8, 9, 0, 2, hair);
        v.set(5, 8, 1, k.color("#d9b45a"));
      } else {
        v.fill(-1, 7, 6, 7, -1, 6, hair);
        for (const x of [-1, 7]) v.fill(x, x, 1, 5, -1, 2, hair);
        v.fill(-1, 7, 0, 5, -1, -1, hair);
        v.fill(0, 6, 1, 5, -2, -2, hair);
      }
    } : undefined,
    club: o.item ? (k) => ({ default: item(o.item, k.h, o.itemColor), rest: { x: 0, z: 0 }, carry: { x: 0, z: 0.1 } }) : undefined,
    extras(k) {
      const h = k.h, u = k.u, scale = { x: h, y: h, z: h };
      // Empty-handed: the island's club stays hidden.
      if (!o.item) k.parts.club.visible = false;
      if (o.style === "dress") S.addChild(k.root, k.parts.skirt = S.createNode({ geometry: skirt(o.main), scale }));
      if (o.hat) S.addChild(k.parts.head, S.createNode({ geometry: hat(), position: { x: 0.6 * u, y: 8 * u, z: -0.3 * u }, rotation: { x: -0.14, y: 0, z: -0.32 }, scale }));
      if (o.cigar) S.addChild(k.parts.head, k.parts.cigar = S.createNode({ geometry: cigar(), position: { x: 1 * u, y: 0.5 * u, z: 2.8 * u }, rotation: { x: 0.14, y: 0.3, z: 0 }, scale }));
    }
  });

  // ---- the cast --------------------------------------------------------------------------------------------------

  // Every caveman member: its outfit and the look flags and overrides it carries into its traits.
  const dinner = (main, extra = {}) => ({ style: "dinner", main, low: "#16161a", lapel: BLACK, shoes: BLACK, ...extra });
  const suit = (main, tie, extra = {}) => ({ style: "suit", main, tie, ...extra });
  const dress = (main, heel, hair, extra = {}) => ({ style: "dress", main, shoes: heel, hair, item: "clutch", itemColor: main === LBD ? "#c9a24a" : main, ...extra });
  const LADY = { slim: true, build: "slim", cleanShaven: true, bald: true };
  const WHISKY = { item: "glass", itemColor: "#c8892a" }, FIZZ = { item: "glass", itemColor: "#e9d98a" };
  const CAVEMEN = [
    // High rollers in dinner jackets: black, midnight, white, velvets.
    ["highroller-1", "highRoller", "Mr. Velvet", dinner(BLACK), { cleanShaven: true }],
    ["highroller-2", "highRoller", "Big Nine", dinner("#1b2340"), { cleanShaven: true }],
    ["highroller-3", "highRoller", "The Whale", dinner("#ece6d6", { lapel: "#ece6d6", ...FIZZ }), {}],
    ["highroller-4", "highRoller", "Mr. Jackpot", dinner("#5a1424", { square: "#d8b45a" }), { cleanShaven: true }],
    ["highroller-5", "highRoller", "Lord Ante", dinner(BLACK, { square: "#7a1622", ...WHISKY }), {}],
    ["highroller-6", "highRoller", "Baron Blinds", dinner("#1f3a2a", { square: "#d8b45a" }), { cleanShaven: true }],
    ["highroller-7", "highRoller", "Mr. Monte", dinner("#ece6d6", { lapel: "#ece6d6", tie: "#5a1424" }), { cleanShaven: true }],
    ["highroller-8", "highRoller", "The Marquis", dinner("#3e1f3a", { ...FIZZ }), {}],
    ["highroller-9", "highRoller", "Sir Raise", dinner("#1b2340", { square: "#b8bcc4", ...WHISKY }), { cleanShaven: true }],
    ["highroller-10", "highRoller", "Duke of Diamonds", dinner(BLACK, { square: "#24459a" }), {}],
    ["highroller-11", "highRoller", "Count Kicker", dinner("#5a1424", { ...WHISKY }), { cleanShaven: true }],
    ["highroller-12", "highRoller", "Lord Flush", dinner("#1f3a2a", { square: "#ece6d6", ...WHISKY }), { cleanShaven: true, skin: "#a9744c" }],
    ["highroller-13", "highRoller", "Mr. Baccarat", dinner(BLACK, { square: "#d8b45a", ...FIZZ }), { skin: "#8a5a3a" }],
    ["highroller-14", "highRoller", "The Viscount", dinner("#3e1f3a", { square: "#b8bcc4" }), { cleanShaven: true, skin: "#d9a06b" }],
    ["highroller-15", "highRoller", "Sir Kitty", dinner("#ece6d6", { lapel: "#ece6d6", tie: "#1b2340", ...WHISKY }), { skin: "#c98a5b" }],
    // Businessmen in dark suits.
    ["suit-1", "businessman", "Mr. Ledger", suit("#34363b", "#8c2a2a", WHISKY), {}],
    ["suit-2", "businessman", "Mr. Quarterly", suit("#22304f", "#c79a2f"), { cleanShaven: true }],
    ["suit-3", "businessman", "Mr. Margin", suit("#151518", "#2f5a3a", WHISKY), {}],
    ["suit-4", "businessman", "Mr. Compound", suit("#5d6066", "#24459a"), { cleanShaven: true }],
    ["suit-5", "businessman", "Mr. Collateral", suit("#22304f", "#7a1622", WHISKY), {}],
    ["suit-6", "businessman", "Mr. Arbitrage", suit("#34363b", "#d8b45a"), {}],
    ["suit-7", "businessman", "Mr. Hedge", suit("#151518", "#a3245e", WHISKY), { cleanShaven: true }],
    ["suit-8", "businessman", "Mr. Liquidity", suit("#2b3a52", "#e2c25a"), {}],
    ["suit-9", "businessman", "Mr. Debenture", suit("#4a3426", "#1f3a2a", WHISKY), { cleanShaven: true }],
    ["suit-10", "businessman", "Mr. Surplus", suit("#22304f", "#b8bcc4"), {}],
    ["suit-11", "businessman", "Mr. Audit", suit("#34363b", "#3c5f8f", WHISKY), { cleanShaven: true }],
    ["suit-12", "businessman", "Mr. Premium", suit("#151518", "#c4574a"), {}],
    ["suit-13", "businessman", "Mr. Spread", suit("#5d6066", "#5a1424", WHISKY), {}],
    ["suit-14", "businessman", "Mr. Coupon", suit("#2b3a52", "#7a5a1a"), { cleanShaven: true }],
    ["suit-15", "businessman", "Mr. Royalty", suit("#34363b", "#4f9a4a", WHISKY), { skin: "#b58057" }],
    ["suit-16", "businessman", "Mr. Escalator", suit("#151518", "#d06a2a"), { cleanShaven: true, skin: "#8a5a3a" }],
    ["suit-17", "businessman", "Mr. Tranche", suit("#22304f", "#c9a24a", WHISKY), { skin: "#d9a06b" }],
    ["suit-18", "businessman", "Mr. Amortize", suit("#4a3426", "#24459a"), { cleanShaven: true, skin: "#a9744c" }],
    // Ladies in short cocktail dresses and heels, hair up or down.
    ["lady-1", "lady", "Lady Emerald", dress("#1f6b4a", "#1a1414", "up"), { ...LADY }],
    ["lady-2", "lady", "Lady Claret", dress("#6e1f33", "#d8b45a", "down"), { ...LADY }],
    ["lady-3", "lady", "Lady Gilt", dress("#c9a24a", "#1a1414", "up", { shine: "#f2d98a" }), { ...LADY }],
    ["lady-4", "lady", "Lady Ruby", dress("#b3122a", "#1a1414", "down", { ...FIZZ }), { ...LADY, skin: "#8a5a3a" }],
    ["lady-5", "lady", "Lady Onyx", dress(LBD, "#b8bcc4", "up", { pearls: true }), { ...LADY }],
    ["lady-6", "lady", "Lady Topaz", dress("#d9892c", "#1a1414", "down"), { ...LADY, skin: "#d9a06b" }],
    ["lady-7", "lady", "Lady Pearl", dress("#e6dcc4", "#d8b45a", "up", { pearls: true }), { ...LADY, skin: "#b58057" }],
    ["lady-8", "lady", "Lady Amethyst", dress("#5b2a6e", "#b8bcc4", "down", { shine: "#9a6ab0" }), { ...LADY }],
    ["lady-9", "lady", "Lady Jade", dress("#16606a", "#1a1414", "up", { ...FIZZ }), { ...LADY, skin: "#a9744c" }],
    ["lady-10", "lady", "Lady Opal", dress("#b8bcc4", "#1a1414", "down", { shine: "#eef0f4" }), { ...LADY }],
    ["lady-11", "lady", "Lady Garnet", dress("#6a1020", "#d8b45a", "up"), { ...LADY, skin: "#c98a5b" }],
    ["lady-12", "lady", "Madame Roulette", dress("#a3245e", "#1a1414", "down", { ...FIZZ }), { ...LADY }],
    ["lady-13", "lady", "Miss Fortune", dress("#1a1f3a", "#b8bcc4", "up", { shine: "#4a5a9a" }), { ...LADY, skin: "#8a5a3a" }],
    ["lady-14", "lady", "Lady Luck", dress("#1f6b4a", "#d8b45a", "down", { shine: "#4fae7e" }), { ...LADY, skin: "#d9a06b" }],
    ["lady-15", "lady", "Lady Satin", dress("#c98a7a", "#1a1414", "up"), { ...LADY }],
    ["lady-16", "lady", "Lady Champagne", dress("#d9c08a", "#6e1f33", "down", { shine: "#f2e2b4", ...FIZZ }), { ...LADY, skin: "#b58057" }],
    ["lady-17", "lady", "Miss Ace", dress("#24459a", "#1a1414", "up", { pearls: true }), { ...LADY, skin: "#a9744c" }],
    ["lady-18", "lady", "Lady Velour", dress("#5c1a22", "#d8b45a", "down"), { ...LADY }],
    ["lady-19", "lady", "Lady Sapphira", dress("#1a3f8a", "#b8bcc4", "up", { shine: "#6a8ad8" }), { ...LADY, skin: "#c98a5b" }],
    ["lady-20", "lady", "Lady Marigold", dress("#d98a2c", "#1a1414", "down", { ...FIZZ }), { ...LADY, skin: "#8a5a3a" }],
    ["lady-21", "lady", "Miss Royale", dress(LBD, "#d8b45a", "up", { pearls: true }), { ...LADY, skin: "#d9a06b" }],
    ["lady-22", "lady", "Lady Cassis", dress("#5b2a6e", "#1a1414", "down", { ...FIZZ }), { ...LADY, skin: "#a9744c" }],
    ["drunk-1", "drunk", "Lucky Lou", dinner(BLACK, { shirt: "#ece6d6", open: true, undone: true, hat: true, item: "glass", itemColor: "#c8892a" }), {}],
    // The seated opponents: only ever at a table, each with its own skin, hair and cloth, in the walking cast's
    // evening dress but never the drunk's props, which would clip a chair.
    ["player-1", "player", "The Duke", dinner("#4a1f2a"), { cleanShaven: true }],
    ["player-2", "player", "Mr. Dividend", suit("#3a4a3f", "#3c5f8f"), {}],
    ["player-3", "player", "Lady Sapphire", dress("#24459a", "#1a1414", "up"), { ...LADY }],
    ["player-4", "player", "The Countess", dress("#5b2a6e", "#d8b45a", "down"), { ...LADY, skin: "#8a5a3a" }],
    ["player-5", "player", "Mr. Bullion", dinner("#7a5a1a"), { cleanShaven: true, skin: "#d9a06b", hair: "#151312" }],
    ["player-6", "player", "Mr. Escrow", suit("#7a6a4a", "#3a1f4f"), { skin: "#a9744c", hair: "#5c4425" }],
    ["player-7", "player", "Lady Coral", dress("#c4574a", "#1a1414", "up"), { ...LADY, skin: "#d9a06b" }],
    ["player-8", "player", "The Baron", dinner("#203a3a"), { cleanShaven: true, skin: "#8a5a3a", hair: "#2b1b10" }],
    ["player-9", "player", "Mr. Tariff", suit("#2e2e34", "#d06a2a"), { cleanShaven: true, skin: "#c98a5b", hair: "#7a2e12" }],
    ["player-10", "player", "Lady Ivory", dress("#e6dcc4", "#6e1f33", "down"), { ...LADY, skin: "#b58057" }],
    ["player-11", "player", "High Card Hal", dinner("#5a1a1a"), { skin: "#a9744c", hair: "#4a2c14" }],
    ["player-12", "player", "Mr. Yield", suit("#3f5a6e", "#e2c25a"), { cleanShaven: true, skin: "#8a5a3a", hair: "#151312" }],
    // The lounges' residents: seven women in little black dresses with martinis, each lounge seating all seven.
    ["lounge-1", "lounge", "Miss Olive", dress(LBD, "#1a1414", "up", { item: "martini", pearls: true }), { ...LADY, skin: "#d9a06b", hair: "#151312" }],
    ["lounge-2", "lounge", "Miss Vermouth", dress(LBD, "#d8b45a", "down", { item: "martini" }), { ...LADY, skin: "#8a5a3a", hair: "#2b1b10" }],
    ["lounge-3", "lounge", "Miss Twist", dress(LBD, "#1a1414", "down", { item: "martini", shine: "#3a3640" }), { ...LADY, skin: "#f0c8a0", hair: "#d9b45a" }],
    ["lounge-4", "lounge", "Miss Dry", dress(LBD, "#b8bcc4", "up", { item: "martini" }), { ...LADY, skin: "#a9744c", hair: "#151312" }],
    ["lounge-5", "lounge", "Miss Shaker", dress(LBD, "#1a1414", "down", { item: "martini", pearls: true }), { ...LADY, skin: "#c98a5b", hair: "#7a2e12" }],
    ["lounge-6", "lounge", "Miss Dirty", dress(LBD, "#d8b45a", "up", { item: "martini", shine: "#3a3640" }), { ...LADY, skin: "#5e3a24", hair: "#151312" }],
    ["lounge-7", "lounge", "Miss Gimlet", dress(LBD, "#1a1414", "down", { item: "martini" }), { ...LADY, skin: "#e0b48a", hair: "#5c4425" }]
  ];
  // One suited man in ten smokes: of every man in a dinner jacket or a suit, walking or seated, the tenth with the
  // lowest hash of his name (`fnv1a("cigar/<name>")`), rounded, so it is the same on every page and every visit.
  const suited = CAVEMEN.filter(([, , , o]) => o.style === "dinner" || o.style === "suit").map(([id]) => id + TAG);
  const SMOKERS = Object.freeze(suited.map(name => ({ name, key: fnv1a("cigar/" + name) })).sort((a, b) => a.key - b.key || (a.name < b.name ? -1 : 1))
    .slice(0, Math.round(suited.length / 10)).map(s => s.name));
  const cavemanTraits = (id, display, outfit, look) => {
    const name = id + TAG, hashed = BL.contributors.traitsFor(name), o = SMOKERS.includes(name) ? { ...outfit, cigar: true } : outfit;
    return {
      ...hashed, display, skin: look.skin || hashed.skin, hair: look.hair || hashed.hair, fur: o.main,
      height: look.height || hashed.height, belly: hashed.belly * (look.slim && !hashed.slim ? 0.8 : 1), dress: dressOf(o), outfit: Object.freeze(o), ...look
    };
  };
  // The staff by cap: a waiter for every twelve on the floor, security for every sixteen, one pit boss from sixteen,
  // never more than `STAFF_MAX` of each.
  const STAFF_MAX = { waiter: 4, security: 3, pitBoss: 1 };
  const staffFor = cap => ({ waiter: Math.min(STAFF_MAX.waiter, Math.max(1, Math.round(cap / 12))), security: Math.min(STAFF_MAX.security, Math.max(1, Math.round(cap / 16))), pitBoss: cap >= 16 ? 1 : 0 });
  const STAFF = [];
  for (const [type, label, id] of [["waiter", "Waiter", "waiter"], ["security", "Security", "security"], ["pitBoss", "Pit Boss", "pitboss"]])
    for (let n = 1; n <= STAFF_MAX[type]; n++) STAFF.push([id + "-" + n, type, label]);
  const CAST = Object.freeze([
    ...CAVEMEN.map(([id, type, display, outfit, look]) => Object.freeze({ id, type, rig: "caveman", traits: cavemanTraits(id, display, outfit, look) })),
    ...STAFF.map(([id, type, display]) => Object.freeze({ id, type, rig: "gorilla", traits: { name: id + TAG, display } }))
  ]);
  const byId = (id) => CAST.find((m) => m.id === id);
  const GUESTS = CAST.filter((m) => m.rig === "caveman" && m.type !== "player" && m.type !== "lounge");
  // Who sits at a table: the twelve opponents, who never walk the floor (`castFor` deals only `GUESTS`).
  const SEATED = CAST.filter((m) => m.type === "player");
  // Who sits in the lounges, outside the floor's cap: each lounge seats them all, in this order.
  const LOUNGE = Object.freeze(CAST.filter((m) => m.type === "lounge"));

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
      const drinks = [-.12,.12].map((x,kind)=>M.turnedX(BL.pokerTerrace.cocktail(x,hy+.03,hz,kind),-TRAY_ARM));
      dress = {
        head: null,
        // A white mess jacket with gold buttons over a black bow tie.
        torso: M.merge(box(0.9, 0.66, 0.64, "#1d1a1c", 0, 0.58), box(0.3, 0.52, 0.08, SHIRT, 0, 0.68, 0.34),
          box(0.06, 0.06, 0.04, "#d8b45a", 0, 0.38, 0.34), box(0.06, 0.06, 0.04, "#d8b45a", 0, 0.26, 0.34),
          box(0.24, 0.09, 0.08, BLACK, 0, 0.88, 0.4), box(0.08, 0.1, 0.1, BLACK, 0, 0.88, 0.42)),
        // The tray flat on the hand, a little ahead of it, with removable drinks for the service loop.
        drinks,
        arm: M.turnedX(M.moved(M.lathe({ segments: 14, profile: [[0, 0], [0.3, 0], [0.3, 0.03], [0, 0.03]], color: "#c9ccd0" }), 0, hy, hz), -TRAY_ARM),
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

  // The day's members for a floor of `cap`: the staff `staffFor(cap)` names (a waiter and security first, so even a
  // floor of any size has both), then guests in the day's order, never an opponent or a lounge resident, at most one drunk.
  // Every count grows with the cap and the guests come in one order, so a smaller cap's crowd is always part of a
  // larger one's: a cap change only parks or brings back members.
  const castFor = (day, cap) => {
    const want = staffFor(cap), out = [];
    for (let n = 1; n <= STAFF_MAX.waiter || n <= STAFF_MAX.security; n++) {
      if (n <= want.waiter) out.push(byId("waiter-" + n));
      if (n <= want.security) out.push(byId("security-" + n));
      if (n === 1 && want.pitBoss) out.push(byId("pitboss-1"));
    }
    const rank = GUESTS.map((m) => ({ m, key: fnv1a("crowd/" + day + "/" + m.id) })).sort((a, b) => a.key - b.key || (a.m.id < b.m.id ? -1 : 1));
    let drunk = 0;
    for (const { m } of rank) {
      if (out.length >= cap) break;
      if (m.type === "drunk" && drunk++) continue;
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
    waiter: Object.freeze(["Drinks, anyone?", "Coming through!", "On the house tonight.", "Careful, it's fizzy.", "Mind the tray, please."]),
    security: Object.freeze(["Keep it friendly.", "All quiet tonight.", "Move along, nothing to see.", "No running on the felt.", "I see everything."]),
    pitBoss: Object.freeze(["Tables look good tonight.", "Keep the cards moving.", "Another full house. Nice.", "Smile, it's free play.", "Table nine needs a dealer."]),
    lady: Object.freeze(["Darling, what a room.", "I only play for fun.", "Is that a royal flush?", "These pearls were my nan's.", "Shall we find a table?", "Look at those planets.", "Champagne, darling?"]),
    highRoller: Object.freeze(["Double or nothing.", "Chips are just pebbles, kid.", "I never fold. Almost never.", "Bring me the big table.", "Luck likes a good jacket."]),
    businessman: Object.freeze(["Pot odds, pot odds.", "This is a business meeting.", "My broker would hate this.", "Expensing the bananas.", "Let me check my numbers."]),
    drunk: Object.freeze(["Was it red? It was red.", "Who moved the floor?", "I'm fine. The room isn't.", "Where did my hat go? Oh.", "One more hand. Or two.", "Hic. Excuse me, chair."])
  });

  BL.pokerCrowdModels = { CAST, TYPES, LOUNGE, SMOKERS, CIGAR_TIP, HIP, castFor, staffFor, seatTraits, seatFigure, staffDress, TRAY_ARM, LINES };
})();
