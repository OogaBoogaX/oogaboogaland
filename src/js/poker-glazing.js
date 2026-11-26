// Banana Club's glass walls: the hall is a glass pavilion under its glass vault. On all four sides glass stands from a
// low white marble sill (SILL_TOP) to the cornice's foot (the vault's SPRING, 9.1 m) on gold posts and mullions with
// one gold transom (TRANSOM_Y). The long sides' posts stand behind the marble columns, every 8.5 m; the end walls'
// posts stand under the feet of the vault's lunette mullions (`pokerVault.feet`), so each end reads as one window from
// sill to ridge. Outside the glass a narrow white marble terrace on a stepped podium runs all round behind a gold
// balustrade, covering the floor slab's edge. On the columns: a marble abacus under the cornice, a gilt twin sconce and
// two glowing uplight cups at the base; two more cups before each statue's plinth. On the arrival end the ₿IFRÖST
// mirror's arch gets a marble back and an entablature, so it stands free as a gate, and the board over it hangs on gold
// rods from the cornice. Everything glows only: no point light is added here. Nothing is a walk block or pick target.
// A pane can be thrown through (Ask Ooga To Move): `panes()` describes each for an aim, and a build's `shatter`,
// `update`, `intact` and `reset` break one into pooled shards and heal it within six seconds (see HEAL_AFTER).
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, K = BL.pokerMarble, V = BL.pokerVault, BM = BL.bifrostModels, hexToRgb = BL.math.hexToRgb, Q = BL.math.quat, TAU_G = Math.PI * 2;
  // The glass planes: the long sides at x +-SIDE_X (under the cornice, whose outer face is at 24.45), the ends at
  // z +-END_Z, outside the arrival mirror's backing (which reaches z 36.9). The glass runs from SILL_TOP to HEAD.
  const WALL_Z = 36.5, SIDE_X = 24.42, END_Z = 36.97, SILL_TOP = 0.68, HEAD = V.SPRING, TRANSOM_Y = 3.3;
  // The sill: inner faces clear of the columns' bases (which reach x 24.35) and of the mirror's back (36.91).
  const SILL = Object.freeze({ inner: 24.38, outer: 24.85, endInner: 36.91, endOuter: 37.3, body: 0.56, bead: 0.6, coping: 0.33 });
  // The terrace, its top just over the floor's: out to x +-TERRACE.out and z +-TERRACE.endOut, on a stepped podium.
  const TERRACE = Object.freeze({ out: 26.6, endOut: 39, top: 0.04, under: -0.6, podium: -1.5, podiumIn: 24.7, podiumOut: 26.35, podiumEnd: 38.75 });
  // The balustrade on the terrace: its line at x +-RAIL.x and z +-RAIL.z, its height over the terrace.
  const RAIL = Object.freeze({ x: 26.3, z: 38.7, h: 1.05, pitch: 0.34, pitchLite: 1.1, sideSegments: 18, endSegments: 12 });
  // Members, metres: post (along the wall, then into it), mullion, transom height and depth.
  const POST = { w: 0.12, d: 0.16 }, MULLION = { w: 0.055, d: 0.1 }, TRANSOM = { h: 0.07, d: 0.12 }, LIGHT = 2.4;
  const COLUMN_X = 23.8, COLUMN_Z = Object.freeze(Array.from({ length: 9 }, (_, k) => -34 + k * 8.5)), SCONCE_Y = 3.2;
  // Seat the stage pier on the outer half of the marble sill, behind the halving board.
  const columnX = (side, z) => side < 0 && z === 0 ? -(SILL.inner + SILL.outer) / 2 - .08 : side * COLUMN_X;
  const GOLD = K.GOLD, PALE_GOLD = "#e0c27e", WHITE = K.WHITE, SHADE = K.SHADE, FLAME = "#ffd27a", WAX = "#f4ead6", GLOW = "#ffe2a8";
  // The terrace, its podium and the balustrade stand outside under the moon alone, where no lamp reaches: their faces
  // keep a little of their own colour (MOONLIT, an emissive share), so they read as a pale edge against the night; so
  // does the sill's coping, which no lamp below it reaches. They cast no shadow: outside the glass only the moon could
  // draw one, and the balustrade's 25,000 faces are the shadow pass's largest single cost here.
  const MOONLIT = 0.25;
  const rgbs = new Map(), rgb = hex => { if (!rgbs.has(hex)) rgbs.set(hex, hexToRgb(hex)); return rgbs.get(hex); };
  const cache = M.scopedMap();
  const once = (key, make) => { if (cache.has(key)) return cache.get(key); const g = make(); cache.set(key, g); return g; };
  const noShadow = g => { g.castShadow = false; return g; };
  // Moonlit faces glow their share and take a little of the moon's cool colour (MOON_TINT, MOON_MIX).
  const MOON_TINT = [196, 210, 232], MOON_MIX = 0.3;
  const moonlit = g => {
    for (const f of g.faces) {
      f.emissive = Math.max(f.emissive || 0, MOONLIT);
      f.color = f.color.map((v, k) => Math.round(v + (MOON_TINT[k] - v) * MOON_MIX));
    }
    return g;
  };
  const box = (w, h, d, color, x, y, z, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
  // A span [a, b] cut into lights no wider than LIGHT: the mullions' positions inside it.
  const splits = (a, b) => { const n = Math.ceil((b - a) / LIGHT - 1e-9), out = []; for (let k = 1; k < n; k++) out.push(a + (b - a) * k / n); return out; };
  // The posts along each wall, in order: the long sides' behind the columns and at both corners, the ends' under the
  // lunette mullions' feet and at both corners.
  const sidePosts = () => [-END_Z, ...COLUMN_Z, END_Z];
  const endPosts = lite => { const f = V.feet(lite); return [-SIDE_X, ...f.slice().reverse().map(x => -x), ...f, SIDE_X]; };
  // Bays as [a, b] between neighbouring posts.
  const bays = posts => posts.slice(0, -1).map((a, k) => [a, posts[k + 1]]);
  // One pane: a unit quad in the plane x 0, y 0 to 1, z -0.5 to 0.5, facing -x (into the hall from the +x wall). A node
  // scales it to its light (y by height, z by width) and turns it onto its wall.
  const pane = () => once("pane", () => {
    const geo = M.merge(), ids = [[0, 0, -0.5], [0, 0, 0.5], [0, 1, 0.5], [0, 1, -0.5]].map(p => M.pushVert(geo, p[0], p[1], p[2]));
    M.face(geo, ids, rgb(V.GLAZE.color));
    return V.glaze(geo, V.GLAZE.wall);
  });
  // The lower tier's pane, from the sill to the transom: the same glass in bands, catching the lit hall as a window at
  // night does, a warm sheen fading up the pane (SHEEN: [top of the band as a share of the pane, colour], each band
  // glowing its colour, the top one the night's own, so it neither lightens nor darkens what lies beyond), denser than
  // the plain panes (SHEEN_OPACITY) so the warmth shows. Seen down a wall's length the sheens run together into a warm
  // line along the sill, where the marble walls' wash once was.
  const SHEEN = [[0.05, "#d9a462"], [0.12, "#a87842"], [0.21, "#6e4d2c"], [0.32, "#3c2c22"], [1, "#171624"]], SHEEN_OPACITY = 0.12;
  const paneLow = () => once("pane-low", () => {
    const geo = M.merge(), row = y => [M.pushVert(geo, 0, y, -0.5), M.pushVert(geo, 0, y, 0.5)];
    let below = row(0);
    for (const [to, hex] of SHEEN) {
      const above = row(to);
      M.face(geo, [below[0], below[1], above[1], above[0]], rgb(hex), { emissive: 1 });
      below = above;
    }
    V.glaze(geo, V.GLAZE.wall);
    geo.glassOpacity = SHEEN_OPACITY;
    return geo;
  });
  // Frames cast no shadow: the moon through the glass laid their posts and mullions over the floor as a grid.
  // A long side's frame, built at +x (a node turned half about y stands it at -x): sill, coping, posts, mullions, the
  // transom and a head rail under the cornice.
  const OPEN = 4.25;
  const side = (lite, east = false) => once("side:" + lite + ":" + east, () => {
    const len = east ? SILL.endOuter - OPEN : SILL.endOuter * 2, x0 = SILL.inner, x1 = SILL.outer, w = x1 - x0, mid = (x0 + x1) / 2, tall = HEAD - SILL_TOP, ym = (SILL_TOP + HEAD) / 2;
    const parts = [M.merge(K.slab({ w, h: SILL.body, d: len, seed: 51, veins: 8, offset: { x: mid, y: SILL.body / 2, z: 0 } })),
      box(w + 0.04, 0.09, len + 0.02, SHADE, mid, 0.045, 0),
      box(0.02, 0.025, len - 0.2, GOLD, x0 - 0.005, 0.34, 0),
      box(w + 0.02, SILL.bead - SILL.body, len + 0.02, GOLD, mid, (SILL.body + SILL.bead) / 2, 0),
      box(w + 0.1, SILL_TOP - SILL.bead, len + 0.1, WHITE, mid + 0.02, (SILL.bead + SILL_TOP) / 2, 0, MOONLIT),
      box(0.09, 0.04, len - 0.4, PALE_GOLD, SIDE_X, SILL_TOP + 0.02, 0)];
    if (east) {
      const half = M.merge(...parts), midZ = OPEN + len / 2;
      parts.length = 0;
      parts.push(M.moved(M.merge(half), 0, 0, midZ), M.moved(half, 0, 0, -midZ));
    }
    parts.push(box(TRANSOM.d, 0.06, END_Z * 2, PALE_GOLD, SIDE_X, HEAD - 0.03, 0));
    const posts = east ? sidePosts().flatMap(z => z === 0 ? [-OPEN, OPEN] : [z]) : sidePosts();
    for (const z of posts) parts.push(box(POST.d, tall, Math.abs(z) === END_Z ? POST.d : POST.w, GOLD, SIDE_X, ym, z));
    for (const [a, b] of bays(posts)) {
      if (east && a === -OPEN && b === OPEN) continue;
      if (!lite) for (const z of splits(a, b)) parts.push(box(MULLION.d, tall, MULLION.w, GOLD, SIDE_X, ym, z));
      parts.push(box(TRANSOM.d, TRANSOM.h, b - a, GOLD, SIDE_X, TRANSOM_Y, (a + b) / 2));
    }
    return noShadow(M.merge(...parts));
  });
  // An end wall's frame, built at +z (a node turned half about y stands it at -z): sill and coping between the long
  // sides', a marble head over the glass from the cornice out to the glass, posts under the lunette's mullions (the
  // corners are the long sides'), mullions, the transom and the head rail.
  const BOOK_X = 19.58, BOOK_HALF = BL.pokerLoungeDoor.half; // local +x turns west on the bar end
  const end = (lite, bookcase=false) => once("end:"+lite+":"+bookcase, () => {
    const z0 = SILL.endInner, z1 = SILL.endOuter, d = z1 - z0, mid = (z0 + z1) / 2, span = SILL.inner * 2, tall = HEAD - SILL_TOP, ym = (SILL_TOP + HEAD) / 2;
    const parts = [M.merge(K.slab({ w: span, h: SILL.body, d, seed: 52, veins: 8, offset: { x: 0, y: SILL.body / 2, z: mid } })),
      box(span, 0.09, d + 0.04, SHADE, 0, 0.045, mid),
      box(span - 0.2, 0.025, 0.02, GOLD, 0, 0.34, z0 - 0.005),
      box(span, SILL.bead - SILL.body, d + 0.02, GOLD, 0, (SILL.body + SILL.bead) / 2, mid),
      box((SILL.inner - 0.05) * 2, SILL_TOP - SILL.bead, d + 0.05, WHITE, 0, (SILL.bead + SILL_TOP) / 2, mid + 0.025, MOONLIT),
      box(span, 0.04, 0.09, PALE_GOLD, 0, SILL_TOP + 0.02, END_Z),
      box(span, 0.06, TRANSOM.d, PALE_GOLD, 0, HEAD - 0.03, END_Z),
      // The head: the cornice's line carried out over the glass, its top a hair under the cornice's.
      box(SIDE_X * 2 + 0.06, V.FOOT - 0.02 - HEAD, END_Z + 0.08 - WALL_Z, WHITE, 0, (HEAD + V.FOOT - 0.02) / 2, (END_Z + 0.08 + WALL_Z) / 2),
      box(SIDE_X * 2 + 0.08, 0.1, 0.08, GOLD, 0, HEAD + 0.05, END_Z + 0.08)];
    if(bookcase){
      const sill=M.merge(...parts.splice(0,6));
      for(const [lo,hi] of [[-span/2,BOOK_X-BOOK_HALF],[BOOK_X+BOOK_HALF,span/2]]){
        const g=M.merge(sill);
        for(let i=0;i<g.verts.length;i+=3) g.verts[i]=g.verts[i]*(hi-lo)/span+(hi+lo)/2;
        parts.push(g);
      }
    }
    const upright=(x,w,d)=>{
      const bottom=bookcase && Math.abs(x-BOOK_X)<BOOK_HALF?BL.pokerLoungeDoor.crown(x-BOOK_X):SILL_TOP;
      parts.push(box(w,HEAD-bottom,d,GOLD,x,(HEAD+bottom)/2,END_Z));
    };
    const posts = endPosts(lite);
    for (const x of posts.slice(1, -1)) upright(x,POST.w,POST.d);
    for (const [a, b] of bays(posts)) {
      if (!lite) for (const x of splits(a, b)) upright(x,MULLION.w,MULLION.d);
      if(bookcase && a<BOOK_X+BOOK_HALF && b>BOOK_X-BOOK_HALF){
        for(const [lo,hi] of [[a,BOOK_X-BOOK_HALF],[BOOK_X+BOOK_HALF,b]])
          if(hi>lo)parts.push(box(hi-lo,TRANSOM.h,TRANSOM.d,GOLD,(lo+hi)/2,TRANSOM_Y,END_Z));
      }else parts.push(box(b-a,TRANSOM.h,TRANSOM.d,GOLD,(a+b)/2,TRANSOM_Y,END_Z));
    }
    return noShadow(M.merge(...parts));
  });
  // A baluster: turned and gold on the full set (four sides, so a long run stays cheap), a plain bar on the lite set.
  const baluster = (lite, x, y, z) => {
    if (lite) return box(0.035, RAIL.h - 0.18, 0.035, GOLD, x, y + 0.11 + (RAIL.h - 0.18) / 2, z);
    const h = RAIL.h - 0.18, g = M.lathe({ segments: 4, color: GOLD, profile: [[0, 0], [0.032, 0], [0.032, 0.06 * h], [0.042, 0.34 * h], [0.016, 0.82 * h], [0.028, 0.9 * h], [0.028, h], [0, h]] });
    return M.moved(g, x, y + 0.11, z);
  };
  const newel = (x, y, z) => [box(0.15, RAIL.h + 0.06, 0.15, GOLD, x, y + (RAIL.h + 0.06) / 2, z), box(0.2, 0.05, 0.2, PALE_GOLD, x, y + RAIL.h + 0.085, z),
    M.moved(M.lathe({ segments: 6, color: GOLD, profile: [[0, 0], [0.05, 0.02], [0.065, 0.08], [0.03, 0.15], [0, 0.17]] }), x, y + RAIL.h + 0.11, z)];
  // A run of balustrade between newels at `from` and `to` along one axis at the other coordinate `at`: rails top and
  // bottom and balusters between, the newels at both ends when asked.
  const run = (parts, lite, alongZ, at, from, to, segments, ends) => {
    const y = TERRACE.top, pitch = lite ? RAIL.pitchLite : RAIL.pitch, P = (a, b) => alongZ ? [at, b] : [b, at];
    for (let s = 0; s <= segments; s++) {
      const u = from + (to - from) * s / segments;
      if ((s > 0 && s < segments) || ends) { const [x, z] = P(0, u); parts.push(...newel(x, y, z)); }
      if (s === segments) break;
      const v = from + (to - from) * (s + 1) / segments, len = Math.abs(v - u), m = (u + v) / 2, [mx, mz] = P(0, m);
      parts.push(alongZ ? box(0.1, 0.08, len, GOLD, mx, y + RAIL.h - 0.04, mz) : box(len, 0.08, 0.1, GOLD, mx, y + RAIL.h - 0.04, mz));
      parts.push(alongZ ? box(0.08, 0.06, len, GOLD, mx, y + 0.08, mz) : box(len, 0.06, 0.08, GOLD, mx, y + 0.08, mz));
      const n = Math.max(1, Math.round(len / pitch));
      for (let k = 0; k < n; k++) { const [bx, bz] = P(0, u + (v - u) * (k + 0.5) / n); parts.push(baluster(lite, bx, y, bz)); }
    }
  };
  // What lies outside a long side, built at +x: the terrace slab with a gold nosing, the podium under it with a gold
  // band, and the balustrade with its corner newels.
  const terraceSide = (lite, east = false) => once("terrace-side:" + lite + ":" + east, () => {
    const T = TERRACE, w = T.out - SILL.outer, len = T.endOut * 2, pw = T.podiumOut - T.podiumIn;
    const parts = [M.merge(K.slab({ w, h: T.top - T.under, d: len, seed: 61, veins: 10, on: "top", offset: { x: (SILL.outer + T.out) / 2, y: (T.top + T.under) / 2, z: 0 } })),
      box(0.05, 0.1, len + 0.1, GOLD, T.out + 0.02, T.top - 0.05, 0),
      box(pw, T.under - T.podium, T.podiumEnd * 2, SHADE, (T.podiumIn + T.podiumOut) / 2, (T.under + T.podium) / 2, 0),
      box(pw + 0.06, 0.05, T.podiumEnd * 2 + 0.06, GOLD, (T.podiumIn + T.podiumOut) / 2, T.under - 0.12, 0)];
    if (east) for (const s of [-1, 1]) run(parts, lite, true, RAIL.x, s * BL.pokerTerrace.halfSpan, s * RAIL.z, 5, true);
    else run(parts, lite, true, RAIL.x, -RAIL.z, RAIL.z, RAIL.sideSegments, true);
    return noShadow(moonlit(M.merge(...parts)));
  });
  // What lies outside an end wall, built at +z, fitted between the long sides' pieces.
  const terraceEnd = (lite,bookcase=false) => once("terrace-end:"+lite+":"+bookcase, () => {
    const T = TERRACE, d = T.endOut - SILL.endOuter, pd = T.podiumEnd - (SILL.endInner - 0.1);
    const parts = [M.merge(K.slab({ w: SILL.outer * 2, h: T.top - T.under, d, seed: 62, veins: 10, on: "top", offset: { x: 0, y: (T.top + T.under) / 2, z: (SILL.endOuter + T.endOut) / 2 } })),
      box(T.out * 2 + 0.14, 0.1, 0.05, GOLD, 0, T.top - 0.05, T.endOut + 0.02),
      box(T.podiumIn * 2, T.under - T.podium, pd, SHADE, 0, (T.under + T.podium) / 2, T.podiumEnd - pd / 2),
      box(T.podiumIn * 2, 0.05, pd + 0.06, GOLD, 0, T.under - 0.12, T.podiumEnd - pd / 2 + 0.03)];
    if(bookcase){
      run(parts,lite,false,RAIL.z,-RAIL.x,-15.83,3,false);
      run(parts,lite,false,RAIL.z,10.6,BOOK_X-BOOK_HALF,2,false);
      run(parts,lite,false,RAIL.z,BOOK_X+BOOK_HALF,RAIL.x,1,false);
    }else run(parts, lite, false, RAIL.z, -RAIL.x, RAIL.x, RAIL.endSegments, false);
    return noShadow(moonlit(M.merge(...parts)));
  });
  // The marble abacus a column carries under the cornice: a gold bead on the capital, a veined block, a gold lip.
  const abacus = () => once("abacus", () => M.merge(box(1.02, 0.04, 1.02, GOLD, 0, 8.82, 0), M.merge(K.slab({ w: 1.12, h: 0.22, d: 1.12, seed: 71, veins: 2, on: "sides", offset: { y: 8.95 } })),
    box(1.16, 0.04, 1.16, PALE_GOLD, 0, HEAD - 0.02, 0)));
  // A gilt twin sconce on a column, built against x 0 and reaching toward -x (into the hall from the +x columns):
  // a backplate, two swept arms to drip pans and candles. Its flames are `flame`, apart, so they alone pierce the haze.
  const ARMS = [-0.2, 0.2];
  const sconce = () => once("sconce", () => {
    const parts = [box(0.04, 0.38, 0.14, GOLD, -0.02, 0, 0), M.moved(M.lathe({ segments: 8, color: PALE_GOLD, profile: [[0, 0], [0.05, 0], [0.04, -0.05], [0, -0.07]] }), -0.05, -0.19, 0)];
    for (const z of ARMS) {
      parts.push(M.beam(-0.04, -0.08, 0, -0.17, -0.04, z * 0.7, 0.03, GOLD), M.beam(-0.17, -0.04, z * 0.7, -0.24, 0.06, z, 0.03, GOLD));
      parts.push(M.moved(M.lathe({ segments: 8, color: GOLD, profile: [[0, 0], [0.025, 0], [0.07, 0.03], [0.065, 0.04], [0, 0.03]] }), -0.24, 0.06, z));
      parts.push(M.moved(M.lathe({ segments: 6, color: WAX, profile: [[0, 0], [0.022, 0], [0.022, 0.15], [0, 0.15]] }), -0.24, 0.09, z));
    }
    return M.merge(...parts);
  });
  const flame = () => once("flame", () => {
    const geo = M.merge(...ARMS.map(z => M.moved(M.lathe({ segments: 6, color: FLAME, emissive: 1, profile: [[0, 0], [0.02, 0.025], [0, 0.075]] }), -0.24, 0.245, z)));
    geo.fogPierce = 1;
    return noShadow(geo);
  });
  // An uplight: a small gilt cup on the floor with its lit mouth glowing.
  const cup = () => once("cup", () => M.merge(M.lathe({ segments: 8, color: GOLD, profile: [[0, 0], [0.07, 0], [0.075, 0.02], [0.11, 0.1], [0.095, 0.1], [0.06, 0.07], [0, 0.07]] }),
    M.lathe({ segments: 8, color: GLOW, emissive: 1, profile: [[0, 0.085], [0.09, 0.085], [0.09, 0.086], [0, 0.086]] })));
  // The arrival mirror's arch, standing free: a veined marble back closing the arch from its course's sides to its top
  // (z from the ring's back to the sill), an entablature over the arch, gilt finials at its ends, and two gold rods from
  // the cornice to the ₿IFRÖST board, which hangs where it did. Built in world coordinates at the +z end.
  const PORTAL_Z = WALL_Z - BM.MIRROR_Z - 0.05, OUTER = BM.WINDOW.halfW + BM.FRAME.band + BM.FRAME.course, ARCH_TOP = BM.WINDOW.spring + OUTER;
  const BOARD_Y = BM.WINDOW_TOP + BM.FRAME.band + 1.15, BOARD_Z = WALL_Z - 0.07, BOARD_TOP = BOARD_Y + (1.1 * 80 / 124 + 0.14) / 2;
  const portal = () => once("portal", () => {
    const back = WALL_Z, rear = SILL.endInner, front = PORTAL_Z - BM.FRAME.courseFront - 0.15, e = [ARCH_TOP, ARCH_TOP + 0.12, ARCH_TOP + 0.16, ARCH_TOP + 0.26];
    const parts = [M.merge(K.slab({ w: OUTER * 2, h: ARCH_TOP, d: rear - back, seed: 81, veins: 6, offset: { y: ARCH_TOP / 2, z: (back + rear) / 2 } })),
      box(OUTER * 2 + 0.3, e[1] - e[0], rear - front, WHITE, 0, (e[0] + e[1]) / 2, (front + rear) / 2),
      box(OUTER * 2 + 0.4, e[2] - e[1], rear - front + 0.04, GOLD, 0, (e[1] + e[2]) / 2, (front + rear) / 2 - 0.02),
      box(OUTER * 2 + 0.6, e[3] - e[2], rear - front + 0.1, WHITE, 0, (e[2] + e[3]) / 2, (front + rear) / 2 - 0.05),
      box(OUTER * 2 + 0.04, 0.05, rear - back, GOLD, 0, 0.12, (back + rear) / 2)];
    for (const s of [-1, 1]) parts.push(M.moved(M.lathe({ segments: 8, color: GOLD, profile: [[0, 0], [0.1, 0], [0.1, 0.06], [0.05, 0.1], [0.09, 0.22], [0.04, 0.34], [0, 0.38]] }), s * (OUTER + 0.12), e[3], (front + rear) / 2));
    for (const s of [-1, 1]) parts.push(M.beam(s * 0.8, BOARD_TOP - 0.03, BOARD_Z, s * 0.8, HEAD + 0.02, BOARD_Z, 0.026, GOLD), box(0.09, 0.03, 0.09, PALE_GOLD, s * 0.8, HEAD - 0.015, BOARD_Z));
    return M.merge(...parts);
  });
  // A shard of a shattered pane: a glinting sliver, both faces, glowing (so it reads lit against the night and needs
  // no light), casting no shadow. The full set's pool of SHARD_CAP shares it; the lite set has none.
  const shard = () => once("shard", () => {
    const geo = M.merge(), ids = [[0, 0.17, 0], [-0.075, -0.09, 0.012], [0.06, -0.06, -0.01]].map(p => M.pushVert(geo, p[0], p[1], p[2]));
    M.face(geo, ids, rgb("#d6efff"), { emissive: 0.7 }); M.face(geo, [ids[0], ids[2], ids[1]], rgb("#d6efff"), { emissive: 0.7 });
    return noShadow(geo);
  });
  // Every geometry of one set, for the room's record and the checks.
  const parts = (lite = false) => ({ pane: pane(), paneLow: paneLow(), side: side(lite), eastSide: side(lite, true), eastTerrace: terraceSide(lite, true), end: end(lite), bookEnd:end(lite,true), bookTerrace:terraceEnd(lite,true), terraceSide: terraceSide(lite), terraceEnd: terraceEnd(lite), abacus: abacus(),
    sconce: lite ? null : sconce(), flame: lite ? null : flame(), cup: cup(), portal: portal(), shard: lite ? null : shard() });
  // The panes, one a bay and tier on every wall, in the order the glazing stands them (a pane's id is its place here):
  // the +x side's bays and tiers, the +z end's, then the -x side's and the -z end's. Each describes its glass for an
  // aim (poker-carry.js's aimAt) and for its node: `wall`, `tier` (0 the lower, from the sill to the transom; 1 the
  // upper, to the head), its centre (`cx`, `cy`, `cz`), its outward normal (`nx`, `ny`, `nz`), the unit along the wall
  // (`ux`, `uz`: +z on the sides, +x on the ends), `halfW` along it and `halfH` up, `y0` and `y1`, the clear an edge
  // keeps (`edge`: a column's base on the sides, a post on the ends), its mullions as coordinates along the wall
  // (`members`, `memberHalf` each; none on the lite set), and what lies outside: the balustrade's line from the glass
  // and its top over the floor (`rail`), and the glass's head (`ceiling`). `x`, `z`, `ry` and `len` place its node.
  const TIERS = [[SILL_TOP, TRANSOM_Y], [TRANSOM_Y, HEAD]], COLUMN_BASE = 0.55, RAIL_TOP = TERRACE.top + RAIL.h + 0.28;
  const layouts = new Map();
  const layout = lite => {
    if (layouts.has(lite)) return layouts.get(lite);
    const list = [];
    const add = (wall, tier, s, a, b, alongZ) => {
      const [y0, y1] = TIERS[tier], mid = s * (a + b) / 2, len = b - a;
      const members = Object.freeze(lite ? [] : splits(a, b).map(m => s * m).sort((p, q) => p - q));
      const x = alongZ ? s * SIDE_X : mid, z = alongZ ? mid : s * END_Z;
      list.push(({ id: list.length, wall, tier, cx: x, cy: (y0 + y1) / 2, cz: z, nx: alongZ ? s : 0, ny: 0, nz: alongZ ? 0 : s, ux: alongZ ? 0 : 1, uz: alongZ ? 1 : 0,
        halfW: len / 2, halfH: (y1 - y0) / 2, y0, y1, edge: alongZ ? COLUMN_BASE : POST.w / 2 + 0.02, members, memberHalf: MULLION.w / 2,
        rail: Object.freeze({ dist: alongZ ? RAIL.x - SIDE_X : RAIL.z - END_Z, top: RAIL_TOP }), ceiling: HEAD,
        x, z, ry: alongZ ? (s > 0 ? 0 : Math.PI) : -s * Math.PI / 2, len }));
    };
    for (const s of [1, -1]) {
      for (const [left, right] of bays(sidePosts())) {
        const a = s > 0 && left === 0 ? OPEN : left, b = s > 0 && right === 0 ? -OPEN : right;
        for (const tier of [0, 1]) add(s > 0 ? "+x" : "-x", tier, s, a, b, true);
      }
      for (const [a, b] of bays(endPosts(lite))) for (const tier of [0, 1]){
        if(s<0 && b>BOOK_X-BOOK_HALF && a<BOOK_X+BOOK_HALF){
          if(a<BOOK_X-BOOK_HALF) add("-z",tier,s,a,BOOK_X-BOOK_HALF,false);
          if(b>BOOK_X+BOOK_HALF) add("-z",tier,s,BOOK_X+BOOK_HALF,b,false);
        }else add(s>0?"+z":"-z",tier,s,a,b,false);
      }
    }
    // Frozen only once all exist: by then every pane has the one map with its fields' final representations, so the
    // frozen panes share one map too and an aim's reads of them stay monomorphic and box nothing.
    const frozen = Object.freeze(list.map(d => Object.freeze(d)));
    layouts.set(lite, frozen);
    return frozen;
  };
  const panes = (lite = false) => layout(lite);
  // What stands inside the glass and stops a throw short of it: the eighteen columns (vertical cylinders to the head),
  // the arrival mirror's freestanding back and entablature, and the BANANA POKER sign over the bar (boxes). The room's
  // furniture (the bar, the cage) is the scene's to add, through `pokerCarry.box` and `cylinder`. Every blocker has the
  // one shape poker-carry.js reads (`kind`, a cylinder's `x`, `z`, `r`, and the box's or the cylinder's bounds), each
  // frozen once all exist (as the panes are), so the aim's reads of them stay monomorphic.
  const blocker = (kind, x, z, r, x0, x1, y0, y1, z0, z1) => ({ kind, x, z, r, x0, x1, y0, y1, z0, z1 });
  const cylinder = (x, z, r, y0, y1) => blocker("cylinder", x, z, r, x - r, x + r, y0, y1, z - r, z + r);
  const slab = (x0, x1, y0, y1, z0, z1) => blocker("box", (x0 + x1) / 2, (z0 + z1) / 2, 0, x0, x1, y0, y1, z0, z1);
  const barGlass=Object.freeze({left:-V.HALF_SPAN,right:-2,z:-36.24});
  const BLOCKERS = Object.freeze([
    ...[-1, 1].flatMap(s => COLUMN_Z.filter(z => s < 0 || z !== 0).map(z => cylinder(columnX(s,z), z, COLUMN_BASE, 0, HEAD))),
    slab(-OUTER - 0.3, OUTER + 0.3, 0, ARCH_TOP + 0.26, PORTAL_Z - BM.FRAME.courseFront - 0.15, SILL.endInner),
    slab(barGlass.left,-BOOK_X-BOOK_HALF,0,HEAD,barGlass.z-.02,barGlass.z+.02),
    slab(-BOOK_X+BOOK_HALF,barGlass.right,0,HEAD,barGlass.z-.02,barGlass.z+.02),
    slab(-6.75, 6.75, 4.6, 8.2, -36.6, -36.1)].map(b => Object.freeze(b)));
  const blockers = () => BLOCKERS;
  // A shattered pane: it vanishes into SHARDS_PER shards flying outward and tumbling (SHARD_LIFE), the bay stands open
  // until HEAL_AFTER, then over HEAL_TIME the glass grows back up from its foot (the sill or the transom), a row of
  // glints riding its rising edge, until it is whole at its own size. At most MAX_BROKEN panes are open at once: a
  // further shatter heals the oldest at once. The lite set hides the pane and brings it back, with no shards.
  const HEAL_AFTER = 3, HEAL_TIME = 2.5, SHARD_LIFE = 1.6, SHARDS_PER = 20, MAX_BROKEN = 2, SHARD_CAP = SHARDS_PER * MAX_BROKEN, SHARD_G = 2, SHARD_FADE = 0.4;
  const hash = (seed, k) => { const s = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  // A shard's tumble: q turned by the world-frame angular velocity w[i..i+2] over dt, as quat.integrate does, reading the
  // rates from an array so no number is boxed between calls (and with no Math.hypot, which allocates on V8 here). The
  // glints turn at GLINT_SPIN.
  const GLINT_SPIN = Float32Array.from([0, 9, 4]);
  const turn = (q, w, i, dt) => {
    const hx = w[i] * dt / 2, hy = w[i + 1] * dt / 2, hz = w[i + 2] * dt / 2, x = q[0], y = q[1], z = q[2], s = q[3];
    q[0] = x + hy * z - hz * y + hx * s; q[1] = y + hz * x - hx * z + hy * s; q[2] = z + hx * y - hy * x + hz * s; q[3] = s - hx * x - hy * y - hz * z;
    const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1;
    q[0] /= len; q[1] /= len; q[2] /= len; q[3] /= len;
  };
  // Where the uplight cups stand: two at each column's flanks and two before each statue's plinth, as [x, z].
  const CUPS = Object.freeze([
    ...[-1, 1].flatMap(s => COLUMN_Z.filter(z => s < 0 || z !== 0).flatMap(z => [[s * 23.9, z - 0.66], [s * 23.9, z + 0.66]])),
    ...BL.pokerStatues.SLOTS.flatMap(({ x, z }) => { const front = x - Math.sign(x) * (BL.pokerStatues.PLINTH.w / 2 + 0.16); return [[front, z - 0.45], [front, z + 0.45]]; })
  ].map(p => Object.freeze(p)));
  const build = (lite = false) => {
    const p = parts(lite), root = S.createNode(), glass = lite ? [p.pane] : [p.pane, p.paneLow], flames = [];
    const put = (geo, x, y, z, ry = 0) => { const n = S.createNode({ geometry: geo, position: { x, y, z } }); n.rotation.y = ry; S.addChild(root, n); return n; };
    for (const s of [1, -1]) {
      const ry = s > 0 ? 0 : Math.PI;
      // The terrace's nodes glow, so its moonlit share shows.
      put(s > 0 ? p.eastSide : p.side, 0, 0, 0, ry).glow = 1; put(s > 0 ? p.eastTerrace : p.terraceSide, 0, 0, 0, ry).glow = 1; put(s<0?p.bookEnd:p.end, 0, 0, 0, ry).glow = 1; put(s<0?p.bookTerrace:p.terraceEnd, 0, 0, 0, ry).glow = 1;
    }
    // The panes, one a bay and tier on every wall, all one geometry: the long sides facing -x / +x, the ends -z / +z.
    // The lower tier's panes glow their sheen; the lite set (Canvas 2D, which sorts its translucent faces by depth and
    // drew the bands over the sill) keeps plain panes there.
    const list = layout(lite), paneNodes = list.map(d => {
      const low = d.tier === 0 && !lite, n = put(low ? p.paneLow : p.pane, d.x, d.y0, d.z, d.ry);
      n.scale.y = d.y1 - d.y0; n.scale.z = d.len; if (low) n.glow = 1;
      return n;
    });
    for (const s of [1, -1]) for (const z of COLUMN_Z) {
      if (s > 0 && z === 0) continue;
      const pier = columnX(s,z);
      put(p.abacus, pier, 0, z);
      if (p.sconce) { const x = pier - s * .41, ry = s > 0 ? 0 : Math.PI; put(p.sconce, x, SCONCE_Y, z, ry); const f = put(p.flame, x, SCONCE_Y, z, ry); f.glow = 1; flames.push(f); }
    }
    for (const [x, z] of CUPS) put(p.cup, x, 0, z).glow = 1;
    put(p.portal, 0, 0, 0);
    // The shard pool, hidden until a pane shatters: SHARDS_PER to each of the MAX_BROKEN slots. A shard's motion, ten
    // floats (position, velocity, spin, size), lives in `motion`; a slot's pane and the time since it broke in `slotPane`
    // and `slotTime` (-1 and 0 when free).
    const shards = [];
    if (p.shard) for (let i = 0; i < SHARD_CAP; i++) { const n = put(p.shard, 0, 0, 0); n.quaternion = Q.create(); n.visible = false; shards.push(n); }
    const motion = new Float32Array(SHARD_CAP * 10), slotPane = new Int16Array(MAX_BROKEN).fill(-1), slotTime = new Float64Array(MAX_BROKEN), slotOf = new Int8Array(list.length).fill(-1);
    let seq = 0;
    const hideShards = s => { if (shards.length) for (let j = 0; j < SHARDS_PER; j++) shards[s * SHARDS_PER + j].visible = false; };
    // A slot's pane whole again: its node shown at its own size, its shards back in the pool.
    const heal = s => {
      const id = slotPane[s], d = list[id], n = paneNodes[id];
      n.visible = true; n.scale.y = d.y1 - d.y0;
      hideShards(s); slotOf[id] = -1; slotPane[s] = -1; slotTime[s] = 0;
    };
    const intact = id => slotOf[id] < 0;
    // Shatters pane `id` (struck at `point`, the throw heading `dir`, either may be null; `seed` fixes the shards, else
    // the build's own count does): false if there is no such pane or it is already open.
    const shatter = (id, point, dir, seed) => {
      if (!(id >= 0 && id < list.length) || slotOf[id] >= 0) return false;
      let s = -1;
      for (let k = 0; k < MAX_BROKEN; k++) if (slotPane[k] < 0) { s = k; break; }
      if (s < 0) { s = 0; for (let k = 1; k < MAX_BROKEN; k++) if (slotTime[k] > slotTime[s]) s = k; heal(s); }
      const d = list[id];
      slotPane[s] = id; slotTime[s] = 0; slotOf[id] = s; paneNodes[id].visible = false;
      const sd = seed === undefined ? ++seq : seed;
      const ix = point ? point.x : d.cx, iy = point ? point.y : d.cy, iz = point ? point.z : d.cz;
      const hx = dir ? dir.x : d.nx, hy = dir ? dir.y : 0, hz = dir ? dir.z : d.nz;
      for (let j = 0; j < shards.length / MAX_BROKEN; j++) {
        const i = s * SHARDS_PER + j, m = i * 10, h = j * 11, pull = 0.35 * hash(sd, h + 3);
        const along = (2 * hash(sd, h + 1) - 1) * d.halfW * 0.95, up = d.y0 + hash(sd, h + 2) * (d.y1 - d.y0);
        const x = d.cx + d.ux * along, y = up, z = d.cz + d.uz * along;
        motion[m] = x + (ix - x) * pull; motion[m + 1] = y + (iy - y) * pull; motion[m + 2] = z + (iz - z) * pull;
        const ox = motion[m] - ix, oy = motion[m + 1] - iy, oz = motion[m + 2] - iz, ol = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1, push = 2.5 + 3 * hash(sd, h + 4), spread = 1.5 * hash(sd, h + 6);
        motion[m + 3] = hx * push + d.nx * (1 + 2 * hash(sd, h + 5)) + ox / ol * spread;
        motion[m + 4] = hy * push + oy / ol * spread + (hash(sd, h + 7) - 0.3);
        motion[m + 5] = hz * push + d.nz * (1 + 2 * hash(sd, h + 5)) + oz / ol * spread;
        motion[m + 6] = 20 * (hash(sd, h + 8) - 0.5); motion[m + 7] = 20 * (hash(sd, h + 9) - 0.5); motion[m + 8] = 20 * (hash(sd, h + 10) - 0.5);
        motion[m + 9] = 0.6 + 0.9 * hash(sd, h + 0);
        const n = shards[i];
        n.position.x = motion[m]; n.position.y = motion[m + 1]; n.position.z = motion[m + 2];
        Q.fromEuler(n.quaternion, TAU_G * hash(sd, h + 8), TAU_G * hash(sd, h + 9), TAU_G * hash(sd, h + 10));
        n.scale.x = n.scale.y = n.scale.z = motion[m + 9];
        n.visible = true;
      }
      return true;
    };
    // Per frame: the shards fly and tumble, then go; an open pane grows back from HEAL_AFTER with its glints riding the
    // edge; after HEAL_AFTER + HEAL_TIME it is whole. Allocates nothing.
    const update = dt => {
      for (let s = 0; s < MAX_BROKEN; s++) {
        const id = slotPane[s];
        if (id < 0) continue;
        const t = slotTime[s] += dt, d = list[id], n = paneNodes[id], tall = d.y1 - d.y0;
        if (t >= HEAL_AFTER + HEAL_TIME) { heal(s); continue; }
        if (!shards.length) continue;
        if (t < SHARD_LIFE) {
          const fade = t > SHARD_LIFE - SHARD_FADE ? (SHARD_LIFE - t) / SHARD_FADE : 1;
          for (let j = 0; j < SHARDS_PER; j++) {
            const i = s * SHARDS_PER + j, m = i * 10, sh = shards[i];
            motion[m + 4] -= SHARD_G * dt;
            motion[m] += motion[m + 3] * dt; motion[m + 1] += motion[m + 4] * dt; motion[m + 2] += motion[m + 5] * dt;
            sh.position.x = motion[m]; sh.position.y = motion[m + 1]; sh.position.z = motion[m + 2];
            turn(sh.quaternion, motion, m + 6, dt);
            sh.scale.x = sh.scale.y = sh.scale.z = motion[m + 9] * fade;
          }
        } else if (t < HEAL_AFTER) {
          if (shards[s * SHARDS_PER].visible) hideShards(s);
        } else {
          // Healing: the glass grows up from its foot, a glint at each of SHARDS_PER places along its rising edge.
          const v = (t - HEAL_AFTER) / HEAL_TIME, e = v * v * (3 - 2 * v), edge = d.y0 + tall * e, size = 0.08 + 0.5 * Math.sin(Math.PI * e);
          n.visible = true; n.scale.y = Math.max(0.001, tall * e);
          for (let j = 0; j < SHARDS_PER; j++) {
            const i = s * SHARDS_PER + j, sh = shards[i], along = ((j + 0.5) / SHARDS_PER * 2 - 1) * d.halfW;
            sh.position.x = d.cx + d.ux * along - d.nx * 0.03; sh.position.y = edge + 0.04 * Math.sin(t * 17 + j * 2.3); sh.position.z = d.cz + d.uz * along - d.nz * 0.03;
            turn(sh.quaternion, GLINT_SPIN, 0, dt);
            sh.scale.x = sh.scale.y = sh.scale.z = size;
            sh.visible = true;
          }
        }
      }
    };
    const broken = () => { let k = 0; for (let s = 0; s < MAX_BROKEN; s++) if (slotPane[s] >= 0) k++; return k; };
    const shardsOut = () => { let k = 0; for (let i = 0; i < shards.length; i++) if (shards[i].visible) k++; return k; };
    // Every pane whole and every shard pooled at once, for a scene's leave.
    const reset = () => { for (let s = 0; s < MAX_BROKEN; s++) if (slotPane[s] >= 0) heal(s); };
    const dispose = () => { reset(); while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]); };
    return { root, glass, flames, dispose, panes: () => list, blockers, shatter, update, intact, broken, shards: shardsOut, reset };
  };
  BL.pokerGlazing = Object.freeze({ barGlass, OPEN, BOOK_X, BOOK_HALF, SIDE_X, END_Z, SILL_TOP, HEAD, TRANSOM_Y, SILL, TERRACE, RAIL, columnX, COLUMN_X, COLUMN_Z, SCONCE_Y, CUPS, PORTAL_Z, BOARD_Y, BOARD_Z,
    HEAL_AFTER, HEAL_TIME, SHARD_LIFE, SHARDS_PER, SHARD_CAP, MAX_BROKEN, sidePosts, endPosts, parts, panes, blockers, build });
})();
