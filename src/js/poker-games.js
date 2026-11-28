// Banana Club's gaming floor: roulette and craps tables standing in the banks' cross aisles as set dressing, at an
// Ooga's scale, each run by a gorilla in the dealers' uniform for whichever of the room's crowd stands round it. They are
// for watching only: no bet is taken from anyone, nothing is won, kept, saved or sent, and nothing here reads or touches
// the poker tables. Every outcome is for show, drawn from this module's own seeded generator (`mulberry32` from the
// table and a running count of its spins or throws, so no two tables match), and local to the page.
//
// `poker-models.js` places the tables (`GAMES`: kind, x, z, yaw), makes their walk blocks and their guests' crowd spots
// from `FOOT` and `SPOTS`, and builds them with `build`, whose handle the scene ticks: `update(dt, eye, ctx)` once a
// frame after the crowd (ctx: `{ crowd, cue }`, both optional), `dispose` in `leave`, `liveGeometry` for the croupiers.
// Each table runs its own cycle on its own clock: roulette `CYCLE.roulette` seconds (bets, the spin, the drop, the
// marker, the reaction, the sweep), craps `CYCLE.craps` (the stickman's push, the shake, the throw, the result, the
// rake). A table far from the view keeps its clock and its outcomes but leaves its croupier's arms and stick alone.
// Nothing allocates per frame: every chip, marker, die and path is a fixed pool or a typed array made in `build`.
(() => {
  "use strict";
  const BL = window.BL, TAU = Math.PI * 2;
  // ---- sizes (metres; an Ooga of the roster's middle height stands 1.625 m) -------------------------------------
  // Roulette: a long table, its wheel set into the top at the -x end, its layout along the rest. Top at 0.88, the
  // padded rail's top at RAIL_TOP (0.92, the poker tables' rail height), on six turned marble legs.
  const ROULETTE = Object.freeze({ L: 3.2, W: 1.3, TOP: 0.88, RAIL_TOP: 0.92, LEG: 0.66, WHEEL_X: -1.08,
    BOWL: 0.43, TRACK_R: 0.345, TRACK_Y: 0.932, POCKET_R: 0.225, POCKET_Y: 0.905, ROTOR: 0.29, BALL: 0.02 });
  // Craps: a long tub, its rail top at RAIL_TOP (0.95), the felt sunk to FELT (0.75) inside walls WALL in from the
  // edge (the padded rail and the chip groove's ledge), a diamond-studded wall at each end for the dice to hit.
  const CRAPS = Object.freeze({ L: 3.8, W: 1.6, RAIL_TOP: 0.95, FELT: 0.75, LEDGE: 0.89, WALL: 0.2, DIE: 0.08, STICK: 1.5, STICKMAN_X: 0.35 });
  // Each kind's walk block in its own frame, half-extents along its length (x) and across (z).
  const FOOT = Object.freeze({ roulette: Object.freeze({ hx: ROULETTE.L / 2, hz: ROULETTE.W / 2 }), craps: Object.freeze({ hx: CRAPS.L / 2, hz: CRAPS.W / 2 }) });
  // Where the croupier and the stickman stand in their table's frame (facing +z, the table's middle), 0.42 m off the
  // edge as the guests are.
  const STAFF_DEPTH = .24;
  const STAFF = Object.freeze({ roulette: Object.freeze({ x: ROULETTE.WHEEL_X, z: -(ROULETTE.W / 2 + 0.42) }), craps: Object.freeze({ x: CRAPS.STICKMAN_X, z: -(CRAPS.W / 2 + 0.42) }) });
  // The guests' places in the table's frame, 0.42 m off its edge and at least 1 m apart (the crowd counts a place
  // taken when anyone stands within 1 m of it): six round the roulette layout end, seven along the craps rails and
  // the shooter at the end the dice are thrown from.
  const side = (x, z, role = "guest") => Object.freeze({ x, z, role });
  const RD = ROULETTE.W / 2 + 0.42, CD = CRAPS.W / 2 + 0.42;
  const SPOTS = Object.freeze({
    roulette: Object.freeze([side(-0.75, RD), side(0.3, RD), side(1.35, RD), side(ROULETTE.L / 2 + 0.42, 0), side(1.35, -RD), side(0.3, -RD)]),
    craps: Object.freeze([side(-1.5, CD), side(-0.5, CD), side(0.5, CD), side(1.5, CD), side(-1.55, -CD), side(-0.55, -CD), side(1.35, -CD), side(-CRAPS.L / 2 - 0.42, 0, "shooter")])
  });
  // The cycles (s) and the moments in them.
  const CYCLE = Object.freeze({ roulette: 20, craps: 15 });
  const RT = Object.freeze({ BET0: 0.4, BET1: 2.6, BETS_END: 4.6, CALL: 4.8, SPIN: 6, SPIN_T: 9, DROP_U: 0.72, LEAN: 10.4, CLEAR: 16.5, CLEARED: 18.6 });
  const CT = Object.freeze({ PUSH: 0, PUSHED: 2, SHAKE: 2.5, THROW: 4.5, RAKE: 10.5, RAKE_OUT: 11.1, RAKED: 12.6 });
  // The European wheel's pockets clockwise from zero, and which numbers are red.
  const POCKETS = Object.freeze([0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]);
  const RED_SET = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const IS_RED = new Uint8Array(37); for (const n of RED_SET) IS_RED[n] = 1;
  const POCKET_ANGLE = TAU / 37;
  // The number grid along the roulette layout: zero at the wheel's side, then twelve columns of three, the row of
  // multiples of three on the croupier's side (-z); the dozens and the even-money bets toward the guests (+z).
  const GRID = Object.freeze({ X0: -0.48, ZERO: 0.14, COL: 0.12, Z0: -0.45, ROW: 0.18, DOZ: 0.1, EVEN: 0.1 });
  // Each number's cell centre (x, z) on the layout, zero's included.
  const CELL = new Float32Array(74);
  CELL[0] = GRID.X0 + GRID.ZERO / 2; CELL[1] = GRID.Z0 + GRID.ROW * 1.5;
  for (let n = 1; n <= 36; n++) {
    const c = Math.floor((n - 1) / 3), r = 2 - (n - 1) % 3;
    CELL[n * 2] = GRID.X0 + GRID.ZERO + (c + 0.5) * GRID.COL; CELL[n * 2 + 1] = GRID.Z0 + (r + 0.5) * GRID.ROW;
  }
  // Craps: the place numbers' boxes along each half's -z side, ascending along +x, and where the puck sits on each.
  const NUMBERS = Object.freeze([4, 5, 6, 8, 9, 10]);
  const BOX = Object.freeze({ X0: 0.42, W: 0.2, Z0: -0.42, Z1: -0.16 });
  const boxX = (half, k) => half > 0 ? BOX.X0 + (k + 0.5) * BOX.W : -BOX.X0 - (NUMBERS.length - k - 0.5) * BOX.W;
  // Pools: chips on a roulette layout, chips on a craps pass line.
  const R_CHIPS = 10, C_CHIPS = 8;
  // The dice's flight: a fixed step, at most PATH steps (3 s), gravity, the felt's and the walls' give.
  const STEP = 1 / 120, PATH = 361, GRAVITY = 9.8, BOUNCE = 0.35, WALL_GIVE = 0.45, ROLL_DRAG = 3.2;
  // A table further than FAR from the view leaves its staff still; one further than HEAR is not heard.
  const FAR = 30, HEAR = 18;
  // The bubbles' lines, picked with the table's own generator.
  const LINES = Object.freeze({
    red: Object.freeze(["Red again!", "Red! Yes!", "Pay me, red!"]), black: Object.freeze(["Black! Yes!", "Black again!", "That's mine!"]), zero: Object.freeze(["Zero! Ha!", "Green! Nobody had that."]),
    miss: Object.freeze(["Come on...", "Not again.", "Next one."]),
    seven: Object.freeze(["Seven!", "Seven! Winner!"]), eleven: Object.freeze(["Yo-leven!", "Eleven!"]), craps: Object.freeze(["Snake eyes...", "Craps...", "Boxcars, ugh."]),
    point: Object.freeze(["Come on...", "Make that point!", "Let's go, dice!"]), made: Object.freeze(["He made it!", "Point! Winner!"]), out: Object.freeze(["Seven out...", "Ugh, seven."]),
    roll: Object.freeze(["Come on...", "Again!", "Nice."])
  });
  const TOOLTIP = Object.freeze({ roulette: "Roulette · watch a spin", craps: "Craps · watch a throw" });
  const WATCH_ONLY = "The roulette and craps tables are for watching.";

  // ---- outcomes, pure ----------------------------------------------------------------------------------------------
  const SEED = 0x5eed1e;
  // One generator for the module, mulberry32 as `BL.math` has it, its state in a typed array so drawing allocates
  // nothing: `rngFor` seeds it for a kind, a table and a count and hands back `rnd`, which draws from it.
  const RNG = new Int32Array(1);
  const rnd = () => {
    const seed = RNG[0] = RNG[0] + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const rngFor = (kind, table, count) => { RNG[0] = (SEED + (kind === "craps" ? 7717 : 0) + table * 1000003 + count * 7919) | 0; return rnd; };
  // The wheel position (index into POCKETS) spin `count` of roulette table `table` lands on, and the number there.
  const drawPocket = (table, count) => Math.floor(rngFor("roulette", table, count)() * 37);
  // The two faces throw `count` of craps table `table` shows, into `out` (two numbers).
  const drawDice = (table, count, out) => { const r = rngFor("craps", table, count); out[0] = 1 + Math.floor(r() * 6); out[1] = 1 + Math.floor(r() * 6); return out; };
  // What a craps total does with the point (0 off): 1 a win, -1 a loss, 0 a point set or a roll that leaves it.
  const crapsOutcome = (total, point) => point === 0 ? (total === 7 || total === 11 ? 1 : total === 2 || total === 3 || total === 12 ? -1 : 0) : total === point ? 1 : total === 7 ? -1 : 0;
  const easeOut2 = u => 1 - (1 - u) * (1 - u), easeOut3 = u => 1 - (1 - u) * (1 - u) * (1 - u);
  // Whether moment a falls in the step from prev (exclusive) to now (inclusive).
  const crossed = (prev, now, a) => prev < a && now >= a;
  const bump = (t, a, b) => t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a));

  // ---- geometry -------------------------------------------------------------------------------------------------
  const WOOD = "#3b2519", OXBLOOD = "#5c1a22", DARK = "#2a1810", RUBBER = "#1d1a18", DIAMOND = "#d8c690", WHITE_INK = "#f1ede2", YELLOW = "#e6c24a";
  const GREEN = "#1f8a3c", RED = "#b3202a", BLACK = "#151515", CHIP_COLORS = Object.freeze(["#e2b43c", "#9c1f2b", "#efe3c8"]);
  let lite = false;
  // Built once a page for each set and cached in the models' scope, as the room's own pieces are: `geo(liteSet)` the set
  // asked for, never whichever the last build used.
  const geo = (() => {
    const cache = BL.models.scopedMap(), scoped = BL.models.track(() => cache.clear());
    return (liteSet) => {
      lite = !!liteSet;
      scoped.use();
      const M = BL.models, key = lite ? "lite" : "full";
      if (cache.has(key)) return cache.get(key);
      const K = BL.pokerMarble, T = BL.pokerThemes.club, rgb = BL.math.hexToRgb, GOLD = K.GOLD;
      const box = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => lite ? M.box({ w, h, d, color, emissive, offset: { x, y, z } }) : M.bevelBox({ w, h, d, color, emissive, offset: { x, y, z } });
      const flatBox = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
      // A flat polygon of [x, z] points at y, wound to face up (the floor's rule).
      const flat = (g, pts, y, hex, emissive = 0) => {
        let area = 0;
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
        const ids = pts.map(p => M.pushVert(g, p[0], y, p[1]));
        M.face(g, area > 0 ? ids.reverse() : ids, rgb(hex), { emissive });
      };
      const rect = (g, x0, z0, x1, z1, y, hex, emissive = 0) => flat(g, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, hex, emissive);
      const outline = (g, x0, z0, x1, z1, w, y, hex) => { rect(g, x0, z0, x1, z0 + w, y, hex); rect(g, x0, z1 - w, x1, z1, y, hex); rect(g, x0, z0 + w, x0 + w, z1 - w, y, hex); rect(g, x1 - w, z0 + w, x1, z1 - w, y, hex); };
      // Canvas paints polygons by their centre depth. Cut the coloured fields into their backing
      // instead of layering nearly coplanar quads that can trade places as the player walks around.
      const inlay = (layers, aperture) => {
        let tiles=[];
        const bounds=pts=>[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
        const cut=(poly,a,b,inside)=>{
          const out=[], side=p=>(b[1]-a[1])*(p[0]-a[0])-(b[0]-a[0])*(p[1]-a[1]);
          let p=poly[poly.length-1],d=side(p);
          for(const q of poly){
            const e=side(q);
            if(d*e<0){const t=d/(d-e);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
            if(inside ? e>=0 : e<=0) out.push(q);
            p=q; d=e;
          }
          return out;
        };
        const paint=(pts,face)=>{
          const box=bounds(pts), next=[];
          for(const tile of tiles){
            const b=tile.bounds;
            if(b[0]>=box[2] || b[2]<=box[0] || b[1]>=box[3] || b[3]<=box[1]){next.push(tile);continue;}
            let part=tile.pts;
            for(let i=0;i<pts.length && part.length>=3;i++){
              const a=pts[i], c=pts[(i+1)%pts.length], outside=cut(part,a,c,false);
              if(outside.length>=3) next.push({pts:outside,bounds:bounds(outside),face:tile.face});
              part=cut(part,a,c,true);
            }
          }
          if(face) next.push({pts,bounds:box,face});
          tiles=next;
        };
        for(const f of layers.faces) paint(f.i.map(i=>[layers.verts[i*3],layers.verts[i*3+2]]),f);
        if(aperture) paint(aperture,null);
        const g=M.geometry(), y=layers.verts[1];
        for(const t of tiles) M.face(g,t.pts.map(p=>M.pushVert(g,p[0],y,p[1])),t.face.color,{emissive:t.face.emissive});
        return g;
      };
      // Drop an enclosed cabinet's hidden lids under the inlay. Its sides still occlude the far rail.
      const cabinet=(...args)=>{
        const g=flatBox(...args);
        if(lite){
          const top=args[1]/2+args[5];
          g.faces=g.faces.filter(f=>!f.i.every(i=>Math.abs(g.verts[i*3+1]-top)<1e-8));
        }
        return g;
      };
      // Numbers in the carved signs' 3x5 alphabet laid flat, readable from +z (their tops toward -z), each lit run of a
      // row one quad.
      const digits = (g, text, cx, cz, cell, y, hex) => {
        const G = BL.hubModels.SIGN_GLYPHS, width = (text.length * 4 - 1) * cell;
        for (let i = 0; i < text.length; i++) {
          const glyph = G[text[i]];
          for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
            if (glyph[r][c] !== "1" || c > 0 && glyph[r][c - 1] === "1") continue;
            let e = c; while (e < 2 && glyph[r][e + 1] === "1") e++;
            const x0 = cx - width / 2 + (i * 4 + c) * cell, z0 = cz - 2.5 * cell + r * cell;
            rect(g, x0, z0, x0 + (e - c + 1) * cell, z0 + cell, y, hex, 0.15);
          }
        }
      };
      // A gold name plate for an apron face at z (its letters facing +z, or -z when `back`), centred on x.
      const plate = (word, x, y, z, back) => {
        const carved = BL.poolModels.carve(word, { joined:true, cell: 0.014, color: GOLD, emissive: 0.4 }), g = carved.geometry, v = g.verts, w = carved.width;
        for (let i = 0; i < v.length; i += 3) { v[i] -= w / 2 - 0.014; v[i + 2] = (v[i + 2] - 0.16) * 0.15 + 0.008; }
        const backing = flatBox(w + 0.04, 0.1, 0.008, "#1d4234", 0, -0.028, 0);
        const both = M.merge(backing, g);
        if (back) M.turnedY(both, Math.PI);
        return M.moved(both, x, y, z + (back ? -0.004 : 0.004));
      };
      const leg = (x, z) => M.moved(M.merge(
        M.lathe({ segments: lite ? 6 : 10, color: K.WHITE, profile: [[0.075, 0], [0.085, 0.03], [0.06, 0.07], [0.042, 0.2], [0.058, 0.33], [0.036, 0.5], [0.05, 0.6], [0.07, 0.64], [0.07, ROULETTE.LEG], [0, ROULETTE.LEG]] }),
        M.lathe({ segments: lite ? 6 : 10, color: GOLD, profile: [[0.06, 0.315], [0.064, 0.33], [0.06, 0.345]] })), x, 0, z);

      // Roulette's body: legs, walnut apron with a gold line, the top, the layout's felt and cells, the padded rail and
      // the wheel's bowl. The rotor, ball, chips and marker are their own meshes.
      const R = ROULETTE, rl = [], hw = R.W / 2, hl = R.L / 2;
      for (const x of [-hl + 0.18, 0, hl - 0.18]) for (const z of [-hw + 0.16, hw - 0.16]) rl.push(leg(x, z));
      rl.push((lite?cabinet:box)(R.L, 0.2, R.W, WOOD, 0, 0.76, 0), cabinet(R.L + 0.004, 0.02, R.W + 0.004, GOLD, 0, 0.68, 0), cabinet(R.L, 0.02, R.W, WOOD, 0, 0.87, 0));
      for (const z of [-hw + 0.05, hw - 0.05]) rl.push(box(R.L, 0.04, 0.1, OXBLOOD, 0, R.RAIL_TOP - 0.02, z));
      for (const x of [-hl + 0.05, hl - 0.05]) rl.push(box(0.1, 0.04, R.W - 0.2, OXBLOOD, x, R.RAIL_TOP - 0.02, 0));
      rl.push(plate("ROULETTE", R.WHEEL_X, 0.79, hw, false), plate("ROULETTE", R.WHEEL_X, 0.79, -hw, true));
      const bowl = M.lathe({ segments: lite ? 16 : 36, color: DARK, profile: [[R.BOWL, R.TOP], [R.BOWL, 0.93], [0.41, 0.955], [0.38, 0.95], [0.36, 0.936], [R.ROTOR + 0.005, 0.925], [R.ROTOR, R.POCKET_Y - 0.01]] });
      rl.push(M.moved(bowl, R.WHEEL_X, 0, 0), M.moved(M.lathe({ segments: lite ? 16 : 36, color: GOLD, emissive: 0.2, profile: [[R.BOWL + 0.004, 0.925], [R.BOWL + 0.004, 0.935], [R.BOWL - 0.012, 0.938]] }), R.WHEEL_X, 0, 0));
      const layout = M.merge(), fy = R.TOP + 0.003, cy = fy + 0.002, ty = cy + 0.002;
      if(lite) rect(layout,-hl,-hw,hl,hw,fy,WOOD);
      rect(layout, -0.58, -hw + 0.1, hl - 0.1, hw - 0.1, fy, T.felt);
      const colX = c => GRID.X0 + GRID.ZERO + c * GRID.COL, rowZ = r => GRID.Z0 + r * GRID.ROW, gap = 0.008;
      rect(layout, GRID.X0 + gap, rowZ(0) + gap, GRID.X0 + GRID.ZERO - gap, rowZ(3) - gap, cy, GREEN);
      for (let n = 1; n <= 36; n++) {
        const c = Math.floor((n - 1) / 3), r = 2 - (n - 1) % 3;
        rect(layout, colX(c) + gap, rowZ(r) + gap, colX(c + 1) - gap, rowZ(r + 1) - gap, cy, IS_RED[n] ? RED : BLACK);
        if (!lite) digits(layout, String(n), colX(c) + GRID.COL / 2, rowZ(r) + GRID.ROW / 2, 0.015, ty, WHITE_INK);
      }
      if (!lite) digits(layout, "0", GRID.X0 + GRID.ZERO / 2, rowZ(1.5), 0.018, ty, WHITE_INK);
      // The column bets' cells at the far end, the dozens and the even-money bets toward the guests, white-ruled.
      const zd = rowZ(3), ze = zd + GRID.DOZ, zf = ze + GRID.EVEN;
      for (let r = 0; r < 3; r++) outline(layout, colX(12) + gap, rowZ(r) + gap, colX(12) + GRID.COL - gap, rowZ(r + 1) - gap, 0.006, cy, WHITE_INK);
      for (let d = 0; d < 3; d++) outline(layout, colX(d * 4) + gap, zd + gap, colX(d * 4 + 4) - gap, ze - gap, 0.006, cy, WHITE_INK);
      for (let e = 0; e < 6; e++) {
        const x0 = colX(e * 2) + gap, x1 = colX(e * 2 + 2) - gap, mx = (x0 + x1) / 2, mz = (ze + zf) / 2;
        outline(layout, x0, ze + gap, x1, zf - gap, 0.006, cy, WHITE_INK);
        if (e === 2 || e === 3) flat(layout, [[mx - 0.06, mz], [mx, mz - 0.03], [mx + 0.06, mz], [mx, mz + 0.03]], ty, e === 2 ? RED : BLACK);
      }
      const rouletteBody = M.merge(...rl);
      // The rotor about its own axis: 37 coloured pockets, gold frets between them, a turned cone and a gold turret.
      const rotor = M.merge();
      for (let i = 0; i < 37; i++) {
        const a0 = (i - 0.5) * POCKET_ANGLE, a1 = (i + 0.5) * POCKET_ANGLE, n = POCKETS[i], r0 = 0.17, r1 = R.ROTOR;
        flat(rotor, [[Math.sin(a0) * r0, Math.cos(a0) * r0], [Math.sin(a0) * r1, Math.cos(a0) * r1], [Math.sin(a1) * r1, Math.cos(a1) * r1], [Math.sin(a1) * r0, Math.cos(a1) * r0]], R.POCKET_Y, n === 0 ? GREEN : IS_RED[n] ? RED : BLACK);
      }
      const rotorParts = [rotor,
        M.lathe({ segments: lite ? 12 : 32, color: "#6b4423", profile: [[R.ROTOR, R.POCKET_Y - 0.02], [R.ROTOR, R.POCKET_Y - 0.001]] }),
        M.lathe({ segments: lite ? 12 : 32, color: "#6b4423", profile: [[0.17, R.POCKET_Y], [0.12, 0.925], [0.06, 0.935], [0, 0.936]] }),
        M.lathe({ segments: lite ? 6 : 12, color: GOLD, emissive: 0.25, profile: [[0.03, 0.935], [0.02, 0.96], [0.012, 0.99], [0.024, 1.0], [0, 1.01]] })];
      if (!lite) {
        for (let i = 0; i < 37; i++) { const a = (i + 0.5) * POCKET_ANGLE; rotorParts.push(M.beam(Math.sin(a) * 0.17, R.POCKET_Y + 0.007, Math.cos(a) * 0.17, Math.sin(a) * R.ROTOR, R.POCKET_Y + 0.007, Math.cos(a) * R.ROTOR, 0.006, GOLD, 0.2)); }
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; rotorParts.push(M.beam(0, 0.975, 0, Math.sin(a) * 0.075, 0.975, Math.cos(a) * 0.075, 0.012, GOLD, 0.25)); }
        rotorParts.push(M.lathe({ segments: 32, color: GOLD, emissive: 0.2, profile: [[0.122, 0.926], [0.118, 0.927]] }));
      }
      const ballR = R.BALL, ball = M.lathe({ segments: lite ? 6 : 10, color: "#f6f3ec", emissive: 0.35, profile: [[0, -ballR], [ballR * 0.7, -ballR * 0.7], [ballR, 0], [ballR * 0.7, ballR * 0.7], [0, ballR]] });
      ball.castShadow = false;
      const chips = CHIP_COLORS.map(color => M.merge(M.lathe({ segments: lite ? 6 : 12, color, profile: [[0, 0], [0.032, 0], [0.032, 0.012], [0, 0.012]] }),
        M.lathe({ segments: lite ? 6 : 12, color: "#f6f1e2", profile: [[0.026, 0.0125], [0.022, 0.0125]] })));
      const marker = M.merge(M.lathe({ segments: lite ? 6 : 12, color: "#ece3c7", profile: [[0, 0], [0.03, 0], [0.03, 0.012], [0, 0.012]] }),
        M.lathe({ segments: lite ? 6 : 10, color: GOLD, emissive: 0.4, profile: [[0.012, 0.012], [0.01, 0.06], [0.022, 0.07], [0.016, 0.085], [0, 0.088]] }));

      // Craps' body: a walnut cabinet on a dark plinth, the tub's outer panels, the ledge with its chip groove, the
      // padded rail and its gold corner mounts, the sunk felt, its side walls and the diamond-studded end walls.
      const C = CRAPS, cl = [], studs = [], ch = C.W / 2, cx = C.L / 2, inX = cx - C.WALL, inZ = ch - C.WALL;
      cl.push(cabinet(C.L - 0.34, 0.06, C.W - 0.34, K.SHADE, 0, 0.03, 0), (lite?cabinet:box)(C.L - 0.4, 0.58, C.W - 0.4, WOOD, 0, 0.35, 0), cabinet(C.L - 0.396, 0.02, C.W - 0.396, GOLD, 0, 0.075, 0));
      for (const z of [-ch + 0.03, ch - 0.03]) cl.push(box(C.L, 0.27, 0.06, WOOD, 0, 0.755, z));
      for (const x of [-cx + 0.03, cx - 0.03]) cl.push(box(0.06, 0.27, C.W - 0.12, WOOD, x, 0.755, 0));
      cl.push(cabinet(C.L - 0.08, 0.025, C.W - 0.08, WOOD, 0, 0.62, 0));
      // The ledge round the well, its inner strip the dark chip groove; the padded rail along the outer edge.
      for (const z of [-1, 1]) cl.push(flatBox(C.L, 0.02, C.WALL - 0.06, WOOD, 0, C.LEDGE - 0.01, z * (ch - 0.06 - (C.WALL - 0.06) / 2)), flatBox(C.L - 2 * C.WALL, 0.004, 0.06, "#120e0c", 0, C.LEDGE + 0.002, z * (inZ + 0.04)));
      for (const x of [-1, 1]) cl.push(flatBox(C.WALL - 0.06, 0.02, C.W - 0.12, WOOD, x * (cx - 0.06 - (C.WALL - 0.06) / 2), C.LEDGE - 0.01, 0));
      for (const z of [-ch + 0.06, ch - 0.06]) cl.push(box(C.L, 0.06, 0.12, OXBLOOD, 0, C.RAIL_TOP - 0.03, z));
      for (const x of [-cx + 0.06, cx - 0.06]) cl.push(box(0.12, 0.06, C.W - 0.24, OXBLOOD, x, C.RAIL_TOP - 0.03, 0));
      for (const x of [-1, 1]) for (const z of [-1, 1]) cl.push(flatBox(0.16, 0.05, 0.16, GOLD, x * (cx - 0.08), C.RAIL_TOP + 0.01, z * (ch - 0.08), 0.25), flatBox(0.06, 0.03, 0.06, GOLD, x * (cx - 0.08), C.RAIL_TOP + 0.05, z * (ch - 0.08), 0.35));
      // Chips resting in the groove along both long sides.
      for (const z of [-1, 1]) for (let k = 0; k < (lite ? 4 : 9); k++) {
        const x = -1.4 + k * (lite ? 0.9 : 0.35), stack = 1 + (k * 7 + (z > 0 ? 3 : 0)) % 4;
        cl.push(M.moved(M.lathe({ segments: lite ? 6 : 10, color: CHIP_COLORS[(k + (z > 0 ? 1 : 0)) % 3], profile: [[0, 0], [0.03, 0], [0.03, 0.011 * stack], [0, 0.011 * stack]] }), x, C.LEDGE + 0.004, z * (inZ + 0.04)));
      }
      cl.push(cabinet(2 * inX, 0.02, 2 * inZ, T.felt, 0, C.FELT - 0.01, 0));
      for (const z of [-1, 1]) cl.push(flatBox(2 * inX, C.LEDGE - C.FELT, 0.02, "#24563f", 0, (C.LEDGE + C.FELT) / 2, z * (inZ + 0.01)));
      for (const x of [-1, 1]) {
        cl.push(flatBox(0.02, C.LEDGE - C.FELT, 2 * inZ, RUBBER, x * (inX + 0.01), (C.LEDGE + C.FELT) / 2, 0));
        for (let row = 0; row < 2; row++) for (let k = 0, n = lite ? 6 : 12; k < n; k++) {
          const z = -inZ + (k + 0.5) * 2 * inZ / n, y = C.FELT + 0.045 + row * 0.06, stud = M.lathe({ segments: 4, color: DIAMOND, emissive: 0.15, profile: [[0.024, 0], [0, 0.02]] });
          studs.push(M.moved(M.turnedZ(stud, x * Math.PI / 2), x * inX, y, z + (row ? inZ / n : 0) * (k === n - 1 ? 0 : 1)));
        }
      }
      cl.push(plate("CRAPS", 0, 0.78, ch, false), plate("CRAPS", -1.2, 0.78, -ch, true));
      // The layout in flat colour: per half a pass line along each long side, the field, the come box and the place
      // numbers; a proposition box in the middle.
      const lay = M.merge(), ly = C.FELT + 0.002, ly2 = ly + 0.002;
      if(lite) rect(lay,-inX,-inZ,inX,inZ,ly,T.felt);
      for (const s of [-1, 1]) {
        const xa = s * 0.4, xb = s * (inX - 0.04), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
        for (const q of [-1, 1]) { const z0 = q > 0 ? 0.45 : -0.55, z1 = z0 + 0.1; rect(lay, x0, z0, x1, z0 + 0.012, ly, WHITE_INK); rect(lay, x0, z1 - 0.012, x1, z1, ly, WHITE_INK); }
        outline(lay, x0, 0.2, x1, 0.4, 0.012, ly, YELLOW);
        outline(lay, x0, -0.1, x1, 0.16, 0.01, ly, WHITE_INK);
        for (let k = 0; k < NUMBERS.length; k++) {
          const bx = boxX(s, k);
          outline(lay, bx - BOX.W / 2 + 0.01, BOX.Z0, bx + BOX.W / 2 - 0.01, BOX.Z1, 0.008, ly, WHITE_INK);
          if (!lite) digits(lay, String(NUMBERS[k]), bx, (BOX.Z0 + BOX.Z1) / 2, 0.022, ly2, WHITE_INK);
        }
        if (!lite) for (const [k, n] of ["2", "3", "4", "9", "10", "11", "12"].entries()) digits(lay, n, s > 0 ? x0 + 0.12 + k * 0.17 : x1 - 0.12 - (6 - k) * 0.17, 0.3, 0.014, ly2, k === 0 || k === 6 ? YELLOW : WHITE_INK);
      }
      outline(lay, -0.32, -0.45, 0.32, 0.32, 0.01, ly, WHITE_INK);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) rect(lay, -0.26 + c * 0.18, -0.38 + r * 0.16, -0.12 + c * 0.18, -0.26 + r * 0.16, ly, (r + c) % 2 ? RED : "#e9e2cf");
      rect(lay, -0.26, -0.02, 0.26, 0.08, ly, RED);
      const crapsBody = M.merge(...cl), crapsLayout = M.merge(lite?inlay(lay):lay, ...studs);
      const die = M.die({ size: C.DIE });
      die.castShadow = false;
      const stick = M.merge(M.beam(0, 0, 0, 0, 0, C.STICK, 0.018, "#c9a26b"), M.beam(0, 0, C.STICK, -0.07, 0, C.STICK + 0.03, 0.016, "#c9a26b"), M.beam(-0.07, 0, C.STICK + 0.03, -0.09, 0, C.STICK - 0.03, 0.016, "#c9a26b"),
        M.beam(0, 0, -0.02, 0, 0, 0.2, 0.024, "#3b2519"));
      const puck = M.merge(M.lathe({ segments: lite ? 8 : 16, color: "#f4f0e6", profile: [[0, 0], [0.05, 0], [0.05, 0.016], [0, 0.016]] }),
        M.lathe({ segments: lite ? 8 : 16, color: BLACK, profile: [[0.04, 0.0165], [0.034, 0.0165]] }));
      const well=lite ? Array.from({length:16},(_,i)=>{
        const a=i*2*Math.PI/16;return [R.WHEEL_X+R.BOWL*Math.cos(a),-R.BOWL*Math.sin(a)];
      }) : null;
      const rouletteLayout=lite?inlay(layout,well):layout;
      const built = { rouletteBody, rouletteLayout, rotor: M.merge(...rotorParts), ball, chips, marker, crapsBody, crapsLayout, die, stick, puck };
      // The small moving pieces cast no shadow: on the felt or in the bowl it would not read, and each is a shadow pass.
      // Nor do the layouts (every cell, rule and glyph flat on the felt, and the craps walls' studs), their own meshes so
      // the shadow pass skips them; the bodies under them keep casting.
      for (const g of [built.rotor, marker, stick, puck, rouletteLayout, crapsLayout, ...chips]) g.castShadow = false;
      cache.set(key, built);
      return built;
    };
  })();

  // ---- the tables -------------------------------------------------------------------------------------------------
  const QUAT = BL.math.quat, SPIN_Q = QUAT.create();
  // The crowd's cues (poker-crowd.js `gameCue`), by number.
  const GAME = Object.freeze({ BET: 1, LEAN: 2, SPLIT: 3, CHEER: 4, GROAN: 5, SHAKE: 6, TOSS: 7 });
  // A table's point (lx, y, lz) in its own frame to the room, into `out`.
  const toRoom = (t, lx, lz, out) => { const c = Math.cos(t.yaw), s = Math.sin(t.yaw); out.x = t.x + lx * c + lz * s; out.z = t.z - lx * s + lz * c; return out; };
  const AT = { x: 0, z: 0 };
  /**
   * Builds the gaming tables for `layout` (`{ kind, x, z, yaw }` each) on the set `lite` picks, the staff dressed in
   * `dress` (`{ jacket, sleeve, cuff }`, the poker dealers' meshes) at `scale`. Returns the handle the scene ticks.
   */
  const build = (layout, { lite: liteSet = false, dress = null, scale = 1 } = {}) => {
    const g = geo(liteSet), S = BL.scene, M = BL.models, root = S.createNode(), tables = [];
    const node = (geometry, x = 0, y = 0, z = 0) => S.createNode({ geometry, position: { x, y, z } });
    let rIndex = 0, cIndex = 0;
    for (let i = 0; i < layout.length; i++) {
      const L = layout[i], kind = L.kind, group = S.createNode({ position: { x: L.x, y: 0, z: L.z }, rotation: { x: 0, y: L.yaw, z: 0 } });
      const k = kind === "roulette" ? rIndex++ : cIndex++, st = STAFF[kind];
      const body = node(kind === "roulette" ? g.rouletteBody : g.crapsBody);
      S.addChild(group, body, node(kind === "roulette" ? g.rouletteLayout : g.crapsLayout));
      // The croupier or stickman: a gorilla at the dealers' scale in their jacket, posed once standing upright facing the
      // table, its arms written each frame as the poker dealers' are.
      const agent = BL.agent.create({ groundAt: () => 0, x: st.x, z: st.z, managed: true, scale });
      agent.poseManaged(1, st.x, 0, st.z, 0, 0, false, true);
      if (dress) { S.addChild(agent.parts.torso, node(dress.jacket)); for (const arm of [agent.parts.armR, agent.parts.armL]) S.addChild(arm, node(dress.sleeve), node(dress.cuff)); }
      S.addChild(group, agent.root);
      const t = { kind, index: i, k, x: L.x, z: L.z, yaw: L.yaw, root: group, body, agent, clock: (k * 0.5 + i * 0.07) * CYCLE[kind], count: 0, cycles: 0, far: false,
        chips: null, chipCount: 0, chipAt: 0, marker: null, rotor: null, ball: null, pocket: -1, number: -1, rotorAngle: 0, rotor0: 0, rotorD: 0, phi: 0, phi0: 0, phiD: 0, ballR: 0,
        dice: null, stick: null, puck: null, faces: new Int8Array(2), total: 0, point: 0, outcome: 0, shooter: false, path: null, rest: new Int16Array(2), bounce: new Int16Array(2), wall: new Int16Array(2),
        hitWall: new Uint8Array(2), qFinal: null, axis: new Float32Array(4), spin: new Float32Array(2), slide: new Float32Array(8), reacted: true, speech: 0,
        // The step's times and the poses' inputs, kept on the table so no fraction is handed over a call (boxed).
        prev: 0.5, now: 0.5, s: 0.5, ts: 0.5, tipX: 0.5, tipZ: 0.5, ballY: 0.5, sim: new Float64Array(16), flown: PATH };
      if (kind === "roulette") {
        t.rotor = node(g.rotor, ROULETTE.WHEEL_X, 0, 0); t.ball = node(g.ball, ROULETTE.WHEEL_X, ROULETTE.POCKET_Y + ROULETTE.BALL, ROULETTE.POCKET_R);
        t.chips = Array.from({ length: R_CHIPS }, (_, c) => { const n = node(g.chips[c % 3]); n.visible = false; return n; });
        t.marker = node(g.marker); t.marker.visible = false;
        // The wheel stands with the ball in a pocket the table's first draw gives, so a fresh room shows it settled.
        t.pocket = drawPocket(t.k, 0); t.number = POCKETS[t.pocket]; t.phi = t.phi0 = t.pocket * POCKET_ANGLE; t.ballR = ROULETTE.POCKET_R;
        t.ball.position.x = ROULETTE.WHEEL_X + Math.sin(t.phi) * t.ballR; t.ball.position.z = Math.cos(t.phi) * t.ballR;
        S.addChild(group, t.rotor, t.ball, t.marker, ...t.chips);
      } else {
        t.dice = [0, 1].map(() => S.createNode({ geometry: g.die, quaternion: QUAT.create() }));
        t.qFinal = [QUAT.create(), QUAT.create()];
        t.path = new Float32Array(PATH * 6);
        t.stick = node(g.stick); t.puck = node(g.puck); t.puck.visible = false;
        t.chips = Array.from({ length: C_CHIPS }, (_, c) => { const n = node(g.chips[c % 3]); n.visible = false; return n; });
        // The dice wait in front of the stickman, showing the table's first draw.
        drawDice(t.k, 0, t.faces);
        for (let d = 0; d < 2; d++) {
          setFinal(t, d, t.faces[d], d * 1.3 + 0.4);
          QUAT.copy(t.dice[d].quaternion, t.qFinal[d]);
          t.dice[d].position.x = CRAPS.STICKMAN_X - 0.06 + d * 0.12; t.dice[d].position.y = CRAPS.FELT + CRAPS.DIE / 2; t.dice[d].position.z = -CRAPS.W / 2 + CRAPS.WALL + 0.14;
        }
        for (let d = 0; d < 2; d++) { t.slide[d * 2] = t.dice[d].position.x; t.slide[d * 2 + 1] = t.dice[d].position.z; }
        // A table whose clock starts between a throw and its rake has flown nothing: its flight is the dice lying where
        // they wait, already at rest, so they stay on the felt until the rake takes them.
        for (let s = 0; s < PATH; s++) for (let d = 0; d < 2; d++) { const p = t.dice[d].position; t.path[s * 6 + d * 3] = p.x; t.path[s * 6 + d * 3 + 1] = p.y; t.path[s * 6 + d * 3 + 2] = p.z; }
        t.rest[0] = t.rest[1] = 1;
        t.slide[4] = CRAPS.STICKMAN_X - 0.35; t.slide[5] = -CRAPS.W / 2 + CRAPS.WALL + 0.12;
        S.addChild(group, ...t.dice, t.stick, t.puck, ...t.chips);
      }
      tables.push(t);
      S.addChild(root, group);
    }
    const stat = { spins: 0, throws: 0, chips: 0, reactions: 0, cues: 0, said: 0, far: 0, shooters: 0 };
    let ctxNow = null, eyeX = 0, eyeZ = 0;
    // A sound at the table's point (lx, lz), when the view is near enough to hear it.
    const sound = (t, name, lx, lz) => {
      if (!ctxNow || !ctxNow.cue) return;
      toRoom(t, lx, lz, AT);
      if ((AT.x - eyeX) ** 2 + (AT.z - eyeZ) ** 2 > HEAR * HEAR) return;
      ctxNow.cue(name, AT.x, AT.z); stat.cues++;
    };
    const crowdCue = (t, cue, seconds = 0) => { const C = ctxNow && ctxNow.crowd; return C ? C.gameCue(t.index, cue, seconds) : 0; };
    const say = (t, list, cheering) => {
      const C = ctxNow && ctxNow.crowd;
      if (!C) return;
      const r = rngFor(t.kind, t.k + 17, t.count * 3 + t.speech++);
      if (r() < 0.65 && C.gameSay(t.index, list[Math.floor(r() * list.length)], cheering)) stat.said++;
    };

    // ---- roulette ----
    const chipFor = (t, c, r) => {
      const n = t.chips[c], pick = Math.floor(r() * 46);
      // Most on numbers, the rest on the outside bets.
      if (pick < 37) { n.position.x = CELL[pick * 2] + (r() - 0.5) * 0.03; n.position.z = CELL[pick * 2 + 1] + (r() - 0.5) * 0.04; }
      else { const e = pick - 37, col = e % 6; n.position.x = GRID.X0 + GRID.ZERO + (col * 2 + 1) * GRID.COL; n.position.z = GRID.Z0 + 3 * GRID.ROW + (e < 6 ? GRID.DOZ + GRID.EVEN / 2 : GRID.DOZ / 2); }
      n.position.y = ROULETTE.TOP + 0.007;
      n.scale.y = 1 + Math.floor(r() * 3);
      n.visible = true;
    };
    const startSpin = t => {
      t.count++; stat.spins++;
      t.pocket = drawPocket(t.k, t.count); t.number = POCKETS[t.pocket];
      const r = rngFor("roulette", t.k + 101, t.count);
      t.rotor0 = t.rotorAngle; t.rotorD = TAU * (2.5 + r());
      // The ball's angle against the rotor eases from where it lay to the drawn pocket, six turns and more the other way.
      t.phi0 = t.phi;
      const want = t.pocket * POCKET_ANGLE, back = ((t.phi0 - want) % TAU + TAU) % TAU;
      t.phiD = back + TAU * 6;
    };
    const placeBall = t => {
      const b = t.rotorAngle + t.phi;
      t.rotor.rotation.y = t.rotorAngle;
      t.ball.position.x = ROULETTE.WHEEL_X + Math.sin(b) * t.ballR; t.ball.position.y = t.ballY + ROULETTE.BALL; t.ball.position.z = Math.cos(b) * t.ballR;
    };
    // Rotor and ball at in-spin time s (0 to SPIN_T): the rotor eases to a stop, the ball runs the rim the other way, and
    // from DROP_U of the spin it rides in its pocket.
    const poseSpin = t => {
      const R = ROULETTE, u = Math.min(1, Math.max(0, t.s / RT.SPIN_T)), v = Math.min(1, u / RT.DROP_U);
      t.rotorAngle = t.rotor0 + t.rotorD * easeOut2(u);
      t.phi = t.phi0 - t.phiD * easeOut3(v);
      let r = R.POCKET_R, y = R.POCKET_Y;
      if (v < 0.05) { const k = v / 0.05; r = R.POCKET_R + (R.TRACK_R - R.POCKET_R) * k; y = R.POCKET_Y + (R.TRACK_Y - R.POCKET_Y) * k + Math.sin(k * Math.PI) * 0.03; }
      else if (v < 0.6) { r = R.TRACK_R; y = R.TRACK_Y; }
      else if (v < 1) { const k = (v - 0.6) / 0.4, f = (1 - k) * (1 - k); r = R.POCKET_R + (R.TRACK_R - R.POCKET_R) * f; y = R.POCKET_Y + (R.TRACK_Y - R.POCKET_Y) * f + 0.018 * Math.abs(Math.sin(k * 5 * Math.PI)) * (1 - k); }
      t.ballR = r; t.ballY = y;
      placeBall(t);
    };
    const DROP = RT.SPIN + RT.DROP_U * RT.SPIN_T;
    const roulette = t => {
      const prev = t.prev, now = t.now;
      if (crossed(prev, now, RT.BET0) || crossed(prev, now, RT.BET1)) {
        // Each guest who reaches in puts a stack down, from the pool.
        const n = crowdCue(t, GAME.BET, 1.1), r = rngFor("roulette", t.k + 31, t.cycles * 2 + (now >= RT.BET1 ? 1 : 0));
        for (let c = 0; c < n && t.chipCount < R_CHIPS; c++) chipFor(t, t.chipCount++, r);
        if (n) sound(t, "chip", 0.4, 0.2);
      }
      if (crossed(prev, now, RT.SPIN)) { startSpin(t); sound(t, "rattle", ROULETTE.WHEEL_X, 0); }
      if (crossed(prev, now, RT.LEAN)) crowdCue(t, GAME.LEAN, 3.2);
      t.s = now - RT.SPIN;
      if (t.s >= 0 && t.s < RT.SPIN_T && !t.far) poseSpin(t);
      if (crossed(prev, now, DROP - 1.4) || crossed(prev, now, DROP - 0.9) || crossed(prev, now, DROP - 0.45)) sound(t, "rattle", ROULETTE.WHEEL_X, 0);
      if (crossed(prev, now, DROP)) {
        sound(t, "drop", ROULETTE.WHEEL_X, 0);
        // The marker on the winning number; one or two of the guests cheer and the rest groan or shrug.
        const m = t.marker;
        m.position.x = CELL[t.number * 2]; m.position.z = CELL[t.number * 2 + 1]; m.position.y = ROULETTE.TOP + 0.005; m.visible = true;
        if (crowdCue(t, GAME.SPLIT, 0) > 0) { stat.reactions++; sound(t, "roar", 0.3, 0.9); say(t, t.number === 0 ? LINES.zero : IS_RED[t.number] ? LINES.red : LINES.black, true); }
      }
      if (crossed(prev, now, RT.SPIN + RT.SPIN_T)) { t.s = RT.SPIN_T; poseSpin(t); }
      if (now >= RT.CLEAR && now < RT.CLEARED) {
        // The croupier sweeps the stacks off one by one.
        const keep = Math.ceil(t.chipCount * (1 - (now - RT.CLEAR) / (RT.CLEARED - RT.CLEAR)));
        for (let c = keep; c < t.chipCount; c++) t.chips[c].visible = false;
      }
      if (crossed(prev, now, RT.CLEARED)) { for (let c = 0; c < R_CHIPS; c++) t.chips[c].visible = false; t.chipCount = 0; t.marker.visible = false; }
      if (!t.far) {
        const a = t.agent.parts;
        a.armL.rotation.x = -0.5 - 1.1 * bump(now, RT.CALL, RT.CALL + 0.9);
        a.armR.rotation.x = -0.45 - 0.75 * bump(now, RT.SPIN - 0.4, RT.SPIN + 0.3) - 0.6 * bump(now, DROP + 0.2, DROP + 1.2) - (now > RT.CLEAR && now < RT.CLEARED ? 0.45 + 0.25 * Math.sin((now - RT.CLEAR) * 6) : 0);
      }
    };

    // ---- craps ----
    // Die d's resting turn: its `face` up (the shared die's own rotations), turned `yaw` about the vertical.
    function setFinal(t, d, face, yaw) { const e = BL.models.dieRotationFor(face, yaw); QUAT.fromEuler(t.qFinal[d], e.x, e.y, e.z); }
    // The throw's flight for both dice, into `path`: `launch` sets each die off from (x0, y0, z0) toward the far wall
    // (along the table, or from the stickman's side when he rolls) as the shake starts, and `flySteps` steps the flight
    // a few fixed steps a frame through the shake, bouncing on the felt and off the walls, rolling to rest; the state in
    // `sim` (per die x, y, z, vx, vy, vz, its rest step or -1), so the stepping runs in the frame's own hot code.
    const launch = (t, r, x0, y0, z0, fromSide) => {
      const q = t.sim;
      for (let d = 0, o = 0; d < 2; d++, o += 8) {
        q[o] = x0; q[o + 1] = y0; q[o + 2] = z0 + (d ? 0.07 : -0.07);
        q[o + 3] = fromSide ? 3.9 + 0.5 * r() : 5 + 0.6 * r(); q[o + 4] = 0.9 + 0.4 * r(); q[o + 5] = (fromSide ? 0.4 : 0) + (r() - 0.5) * 0.4; q[o + 6] = -1;
        // It rolls forward as it flies: about the level axis across its heading (up x heading), easing out at rest.
        const hl = Math.sqrt(q[o + 3] * q[o + 3] + q[o + 5] * q[o + 5]);
        t.axis[d * 2] = q[o + 5] / hl; t.axis[d * 2 + 1] = -q[o + 3] / hl;
        t.spin[d] = TAU * (3 + r() * 2);
        t.bounce[d] = -1; t.wall[d] = -1; t.hitWall[d] = 0; t.rest[d] = PATH - 1;
      }
      t.flown = 0;
    };
    // Flight steps a frame through the shake: the whole flight well inside its 2 s at 30 frames a second.
    const FLY_PER = 16, H = CRAPS.DIE / 2, IN_X = CRAPS.L / 2 - CRAPS.WALL - H, IN_Z = CRAPS.W / 2 - CRAPS.WALL - H, FLOOR = CRAPS.FELT + H;
    const flySteps = (t, n) => {
      const q = t.sim, P = t.path, end = Math.min(PATH, t.flown + n);
      for (let s = t.flown; s < end; s++) for (let d = 0, o = 0; d < 2; d++, o += 8) {
        P[s * 6 + d * 3] = q[o]; P[s * 6 + d * 3 + 1] = q[o + 1]; P[s * 6 + d * 3 + 2] = q[o + 2];
        if (q[o + 6] >= 0) continue;
        q[o + 4] -= GRAVITY * STEP; q[o] += q[o + 3] * STEP; q[o + 1] += q[o + 4] * STEP; q[o + 2] += q[o + 5] * STEP;
        if (q[o + 1] < FLOOR) { q[o + 1] = FLOOR; if (q[o + 4] < -0.4) { if (t.bounce[d] < 0) t.bounce[d] = s; q[o + 4] = -q[o + 4] * BOUNCE; q[o + 3] *= 0.82; q[o + 5] *= 0.82; } else q[o + 4] = 0; }
        if (q[o + 1] <= CRAPS.RAIL_TOP) {
          if (q[o] > IN_X) { q[o] = IN_X; q[o + 3] = -Math.abs(q[o + 3]) * WALL_GIVE; if (t.wall[d] < 0) t.wall[d] = s; t.hitWall[d] = 1; }
          if (q[o] < -IN_X) { q[o] = -IN_X; q[o + 3] = Math.abs(q[o + 3]) * WALL_GIVE; }
          if (q[o + 2] > IN_Z) { q[o + 2] = IN_Z; q[o + 5] = -Math.abs(q[o + 5]) * WALL_GIVE; }
          if (q[o + 2] < -IN_Z) { q[o + 2] = -IN_Z; q[o + 5] = Math.abs(q[o + 5]) * WALL_GIVE; }
        }
        if (q[o + 1] <= FLOOR && q[o + 4] === 0) {
          const k = 1 - ROLL_DRAG * STEP;
          q[o + 3] *= k; q[o + 5] *= k;
          if (q[o + 3] * q[o + 3] + q[o + 5] * q[o + 5] < 0.0025) { q[o + 6] = s + 1; t.rest[d] = Math.min(s + 1, PATH - 1); }
        }
      }
      t.flown = end;
    };
    // Die d at throw time s: along its flight, turning toward its resting face, still once it rests.
    const poseDie = (t, d) => {
      const f = t.ts / STEP, i = Math.min(PATH - 1, Math.floor(f)), j = Math.min(PATH - 1, i + 1), w = f - Math.floor(f), P = t.path, n = t.dice[d], o = d * 3;
      n.position.x = P[i * 6 + o] + (P[j * 6 + o] - P[i * 6 + o]) * w;
      n.position.y = P[i * 6 + o + 1] + (P[j * 6 + o + 1] - P[i * 6 + o + 1]) * w;
      n.position.z = P[i * 6 + o + 2] + (P[j * 6 + o + 2] - P[i * 6 + o + 2]) * w;
      const k = Math.min(1, f / t.rest[d]), a = -t.spin[d] * (1 - k) * (1 - k);
      QUAT.fromAxisAngle(SPIN_Q, t.axis[d * 2], 0, t.axis[d * 2 + 1], a);
      QUAT.multiply(n.quaternion, SPIN_Q, t.qFinal[d]);
    };
    // The stick: its tip at (tx, tz) on the felt, its butt in the stickman's hands, held level at his hands' height
    // while the tip is out at the stick's reach; nearer in, the butt comes back at most `HOLD_BACK` behind his hands and
    // rises instead, so the stick stands steeper and never pokes out behind him. His arms follow its reach.
    const STICK_HAND_Y = 1.02, HAND_X = CRAPS.STICKMAN_X - 0.05, HAND_Z = -CRAPS.W / 2 - 0.1, HOLD_BACK = 0.2;
    const STICK_FLAT = Math.sqrt(CRAPS.STICK * CRAPS.STICK - (STICK_HAND_Y - CRAPS.FELT - 0.03) ** 2);
    const poseStick = t => {
      const C = CRAPS, n = t.stick, tx = t.tipX, tz = t.tipZ, ty = C.FELT + 0.03, dx = tx - HAND_X, dz = tz - HAND_Z, flatD = Math.sqrt(dx * dx + dz * dz) || 1e-6, ux = dx / flatD, uz = dz / flatD;
      // The butt's level distance back from the tip, and its height.
      let back = STICK_FLAT, by = STICK_HAND_Y;
      if (flatD + HOLD_BACK < STICK_FLAT) { back = flatD + HOLD_BACK; by = ty + Math.sqrt(C.STICK * C.STICK - back * back); }
      n.position.x = tx - ux * back; n.position.y = by; n.position.z = tz - uz * back;
      n.rotation.y = Math.atan2(dx, dz); n.rotation.x = Math.atan2(by - ty, back);
      const reach = Math.min(1, Math.max(0, flatD - 0.4) / 1.6), a = t.agent.parts;
      a.armR.rotation.x = -0.55 - 0.55 * reach; a.armL.rotation.x = -0.6 - 0.3 * reach;
    };
    const IDLE_TIP_X = CRAPS.STICKMAN_X - 0.1, IDLE_TIP_Z = -CRAPS.W / 2 + CRAPS.WALL + 0.3;
    // A stack on the pass line before each guest at the rails, from the pool, as a come-out roll is pushed out.
    const passChips = (t, r) => {
      const spots = SPOTS.craps, C = ctxNow && ctxNow.crowd;
      for (let c = 0; c < C_CHIPS; c++) t.chips[c].visible = false;
      t.chipCount = 0;
      if (!C) return;
      for (let s = 0; s < spots.length && t.chipCount < C_CHIPS; s++) {
        if (!C.gameAt(t.index, s)) continue;
        const sp = spots[s], n = t.chips[t.chipCount++], shooter = sp.role === "shooter";
        let x = shooter ? -1.4 : Math.max(-1.55, Math.min(1.55, sp.x));
        if (Math.abs(x) < 0.48) x = x < 0 ? -0.48 : 0.48;
        n.position.x = x; n.position.z = shooter || sp.z > 0 ? 0.5 : -0.5; n.position.y = CRAPS.FELT + 0.004;
        n.scale.y = 1 + Math.floor(r() * 3); n.visible = true;
      }
    };
    const placePuck = t => {
      const p = t.puck, k = NUMBERS.indexOf(t.point);
      p.visible = k >= 0;
      if (k >= 0) { p.position.x = boxX(1, k); p.position.y = CRAPS.FELT + 0.004; p.position.z = (BOX.Z0 + BOX.Z1) / 2 - 0.05; }
    };
    const craps = t => {
      const C = CRAPS, sl = t.slide, prev = t.prev, now = t.now;
      if (crossed(prev, now, CT.PUSH)) {
        // The stickman pushes the dice to whoever stands at the shooter's place, else to his own front to roll himself.
        t.shooter = !!(ctxNow && ctxNow.crowd && ctxNow.crowd.gameShooter(t.index));
        if (t.shooter) stat.shooters++;
        for (let d = 0; d < 2; d++) { sl[d * 2] = t.dice[d].position.x; sl[d * 2 + 1] = t.dice[d].position.z; }
        sl[4] = t.shooter ? -C.L / 2 + C.WALL + 0.12 : C.STICKMAN_X - 0.35; sl[5] = t.shooter ? 0 : -C.W / 2 + C.WALL + 0.12;
        if (t.point === 0) passChips(t, rngFor("craps", t.k + 53, t.cycles));
      }
      if (now < CT.PUSHED + 0.5) {
        const k = Math.min(1, Math.max(0, (now - CT.PUSH) / (CT.PUSHED - CT.PUSH))), e = k * k * (3 - 2 * k);
        for (let d = 0; d < 2; d++) {
          const n = t.dice[d];
          n.position.x = sl[d * 2] + (sl[4] + (d ? 0.06 : -0.06) - sl[d * 2]) * e; n.position.z = sl[d * 2 + 1] + (sl[5] - sl[d * 2 + 1]) * e; n.position.y = C.FELT + C.DIE / 2;
        }
        if (!t.far) {
          const out = now < CT.PUSHED ? 1 : 1 - (now - CT.PUSHED) / 0.5, mx = (t.dice[0].position.x + t.dice[1].position.x) / 2 + (t.shooter ? 0.12 : 0.1), mz = (t.dice[0].position.z + t.dice[1].position.z) / 2;
          t.tipX = IDLE_TIP_X + (mx - IDLE_TIP_X) * out; t.tipZ = IDLE_TIP_Z + (mz - IDLE_TIP_Z) * out; poseStick(t);
        }
      }
      if (crossed(prev, now, CT.SHAKE)) {
        // The throw starts: whoever stands at the shooter's place shakes (the dice in his fist), else the stickman rolls;
        // the faces are drawn now and the flight stepped through the shake.
        t.shooter = t.shooter && crowdCue(t, GAME.SHAKE, CT.THROW - CT.SHAKE) > 0;
        if (t.shooter) for (let d = 0; d < 2; d++) t.dice[d].visible = false;
        t.count++;
        drawDice(t.k, t.count, t.faces); t.total = t.faces[0] + t.faces[1];
        const fr = rngFor("craps", t.k + 211, t.count);
        for (let d = 0; d < 2; d++) setFinal(t, d, t.faces[d], fr() * TAU);
        if (t.shooter) launch(t, fr, -C.L / 2 + C.WALL + 0.06, 1.06, 0, false);
        else launch(t, fr, C.STICKMAN_X - 0.3, 1.0, -C.W / 2 + C.WALL + 0.12, true);
      }
      if (now >= CT.SHAKE && t.flown < PATH) flySteps(t, now >= CT.THROW ? PATH : FLY_PER);
      if (crossed(prev, now, CT.THROW)) {
        stat.throws++;
        if (t.shooter) crowdCue(t, GAME.TOSS, 0.55);
        crowdCue(t, GAME.LEAN, 3);
        t.reacted = false;
        for (let d = 0; d < 2; d++) t.dice[d].visible = true;
      }
      t.ts = now - CT.THROW;
      if (t.ts >= 0 && now < CT.RAKE) {
        const step = t.ts / STEP, last = (prev - CT.THROW) / STEP;
        if (!t.far || !t.reacted && step >= Math.max(t.rest[0], t.rest[1])) { poseDie(t, 0); poseDie(t, 1); }
        for (let d = 0; d < 2; d++) {
          const b = t.bounce[d];
          if (b >= 0 && last < b && step >= b) sound(t, "dice", t.path[b * 6 + d * 3], t.path[b * 6 + d * 3 + 2]);
          if (t.wall[d] >= 0 && last < t.wall[d] && step >= t.wall[d]) sound(t, "dice", C.L / 2 - C.WALL, 0);
        }
        if (!t.reacted && step >= Math.max(t.rest[0], t.rest[1])) {
          t.reacted = true;
          const was = t.point, o = crapsOutcome(t.total, was);
          t.outcome = o;
          if (was === 0 && o === 0) t.point = t.total; else if (was !== 0 && o !== 0) t.point = 0;
          placePuck(t);
          if (crowdCue(t, o > 0 ? GAME.CHEER : o < 0 ? GAME.GROAN : GAME.LEAN, o === 0 ? 2.5 : 0) > 0) {
            stat.reactions++;
            sound(t, o === 0 ? "murmur" : "roar", 0, 0.9);
            say(t, was === 0 ? (t.total === 7 ? LINES.seven : t.total === 11 ? LINES.eleven : o < 0 ? LINES.craps : LINES.point) : o > 0 ? LINES.made : o < 0 ? LINES.out : LINES.roll, o > 0);
          }
        }
        if (!t.far) { t.tipX = IDLE_TIP_X; t.tipZ = IDLE_TIP_Z; poseStick(t); }
      }
      if (crossed(prev, now, CT.RAKE)) {
        for (let d = 0; d < 2; d++) { const n = t.dice[d]; n.visible = true; QUAT.copy(n.quaternion, t.qFinal[d]); sl[d * 2] = n.position.x; sl[d * 2 + 1] = n.position.z; n.position.y = C.FELT + C.DIE / 2; }
        // A losing roll's pass-line stacks go with the rake; a point set or a winner's stay till the next come-out.
        if (t.outcome < 0) for (let c = 0; c < C_CHIPS; c++) t.chips[c].visible = false;
      }
      if (now >= CT.RAKE) {
        if (now < CT.RAKE_OUT) { const k = (now - CT.RAKE) / (CT.RAKE_OUT - CT.RAKE); t.tipX = IDLE_TIP_X + ((sl[0] + sl[2]) / 2 + 0.08 - IDLE_TIP_X) * k; t.tipZ = IDLE_TIP_Z + ((sl[1] + sl[3]) / 2 - IDLE_TIP_Z) * k; }
        else {
          const k = Math.min(1, (now - CT.RAKE_OUT) / (CT.RAKED - CT.RAKE_OUT)), e = k * k * (3 - 2 * k);
          for (let d = 0; d < 2; d++) { const n = t.dice[d]; n.position.x = sl[d * 2] + (IDLE_TIP_X - 0.04 + d * 0.1 - sl[d * 2]) * e; n.position.z = sl[d * 2 + 1] + (IDLE_TIP_Z - 0.06 - sl[d * 2 + 1]) * e; }
          t.tipX = (t.dice[0].position.x + t.dice[1].position.x) / 2 + 0.08; t.tipZ = (t.dice[0].position.z + t.dice[1].position.z) / 2 + 0.06;
        }
        if (!t.far) poseStick(t);
      }
    };

    /** Advances every table by dt (s) from the view at `eye` (`{ x, z }` or a camera), `ctx` `{ crowd, cue }`. */
    const update = (dt, eye = null, ctx = null) => {
      ctxNow = ctx;
      const ep = eye ? eye.position || eye : null;
      eyeX = ep ? ep.x : 0; eyeZ = ep ? ep.z : 0;
      let far = 0;
      for (let i = 0; i < tables.length; i++) {
        const t = tables[i], cycle = CYCLE[t.kind];
        t.far = !!ep && (t.x - eyeX) ** 2 + (t.z - eyeZ) ** 2 > FAR * FAR;
        if (t.far) far++;
        t.prev = t.clock; t.now = t.clock + dt;
        // A long step crosses the cycle's end: the rest of this cycle first, then the next from its start.
        while (t.now >= cycle) {
          const next = t.now - cycle;
          t.now = cycle;
          if (t.kind === "roulette") roulette(t); else craps(t);
          t.prev = -1e-9; t.now = next; t.cycles++;
        }
        if (t.kind === "roulette") roulette(t); else craps(t);
        t.clock = t.now;
      }
      let chips = 0;
      for (let i = 0; i < tables.length; i++) { const c = tables[i].chips; for (let k = 0; k < c.length; k++) if (c[k].visible) chips++; }
      stat.chips = chips; stat.far = far;
      ctxNow = null;
    };
    // The resting pocket a roulette table's ball lies in, read from the drawn rotor and ball nodes: the wheel position
    // whose centre is nearest the ball in the room.
    const pocketUnderBall = t => {
      S.updateWorld(t.root);
      const w = t.rotor.world, b = t.ball.world;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < 37; i++) {
        const a = i * POCKET_ANGLE, lx = Math.sin(a) * ROULETTE.POCKET_R, lz = Math.cos(a) * ROULETTE.POCKET_R;
        const y = ROULETTE.POCKET_Y, x = w[0] * lx + w[4] * y + w[8] * lz + w[12], z = w[2] * lx + w[6] * y + w[10] * lz + w[14], d = (x - b[12]) ** 2 + (z - b[14]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      return { pocket: best, distance: Math.sqrt(bestD) };
    };
    const liveGeometry = set => { for (const t of tables) t.agent.liveGeometry(set); };
    const dispose = () => {
      for (const t of tables) { t.agent.dispose(); t.agent = null; }
      if (root.parent) S.removeChild(root.parent, root);
      while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]);
      tables.length = 0; ctxNow = null;
    };
    return { root, tables, update, liveGeometry, dispose, pocketUnderBall, stats: () => stat };
  };
  // The point of table `t`'s spot `s` in the room, with the yaw facing the table (`{ x, z, yaw, role }`).
  const spotsFor = L => SPOTS[L.kind].map(s => {
    const fx = Math.abs(s.x) > FOOT[L.kind].hx ? -Math.sign(s.x) : 0, fz = fx ? 0 : -Math.sign(s.z), c = Math.cos(L.yaw), sn = Math.sin(L.yaw);
    return Object.freeze({ x: L.x + s.x * c + s.z * sn, z: L.z - s.x * sn + s.z * c, yaw: Math.atan2(fx, fz) + L.yaw, role: s.role });
  });

  BL.pokerGames = Object.freeze({ ROULETTE, CRAPS, FOOT, STAFF, STAFF_DEPTH, SPOTS, CYCLE, RT, CT, GAME, POCKETS, IS_RED, POCKET_ANGLE, CELL, NUMBERS, R_CHIPS, C_CHIPS, PATH, STEP, FAR, HEAR, LINES, TOOLTIP, WATCH_ONLY,
    drawPocket, drawDice, crapsOutcome, spotsFor, build, geometry: (liteSet = false) => geo(liteSet) });
})();
