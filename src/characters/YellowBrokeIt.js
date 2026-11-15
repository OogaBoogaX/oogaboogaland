(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, merge, GOLD_CLUB_PALETTE } = BL.models;
  const { createNode, addChild } = BL.scene;
  const cigaretteGeometry = (h) => merge(
    box({ w: 0.035 * h, h: 0.035 * h, d: 0.26 * h, color: "#f3efe4", offset: { z: 0.13 * h } }),
    box({ w: 0.037 * h, h: 0.037 * h, d: 0.06 * h, color: "#c78b42", offset: { z: 0.29 * h } }),
    box({ w: 0.04 * h, h: 0.04 * h, d: 0.025 * h, color: "#e35b2d", emissive: 0.7, offset: { z: 0.34 * h } })
  );
  const energyCanCache = new Map();
  const energyCanGeometry = (h, gold = false) => {
    const key = `${h}/${gold}`;
    let geo = energyCanCache.get(key);
    if (!geo) {
      geo = merge(
        lathe({ profile: [[0.075 * h, -0.18 * h], [0.088 * h, -0.14 * h], [0.088 * h, 0.14 * h], [0.075 * h, 0.18 * h]], segments: 10, color: "#c9ccd2" }),
        box({ w: 0.12 * h, h: 0.3 * h, d: 0.014 * h, color: "#2458a6", offset: { z: 0.086 * h } }),
        box({ w: 0.014 * h, h: 0.3 * h, d: 0.12 * h, color: "#2458a6", offset: { x: 0.086 * h } }),
        box({ w: 0.11 * h, h: 0.028 * h, d: 0.018 * h, color: "#d32f2f", offset: { y: 0.035 * h, z: 0.096 * h } }),
        box({ w: 0.055 * h, h: 0.045 * h, d: 0.02 * h, color: "#e23d32", offset: { y: -0.045 * h, z: 0.098 * h } }),
        lathe({ profile: [[0.072 * h, 0.18 * h], [0.065 * h, 0.195 * h], [0, 0.195 * h]], segments: 10, color: "#c9ccd2" }),
        box({ w: 0.055 * h, h: 0.008 * h, d: 0.025 * h, color: "#5f6670", offset: { y: 0.202 * h } })
      );
      if (gold) for (const face of geo.faces) face.color = GOLD_CLUB_PALETTE[0];
      energyCanCache.set(key, geo);
    }
    return geo;
  };
  // The modelled look's can: the body is turned in twelve flat sides and the label is those same sides
  // in the label's colours, so the wrap goes all the way round the can and lies on its surface, with nothing stood
  // off it. Its red band and logo face ahead.
  const wrappedCanGeometry = (h, gold = false) => {
    const key = `wrapped/${h}/${gold}`;
    let geo = energyCanCache.get(key);
    if (geo) return geo;
    const H = BL.heroBody, N = 12, TAU = Math.PI * 2;
    const silver = gold ? "#e8c669" : "#c9ccd2", rim = gold ? "#c79a2f" : "#a9adb5", blue = gold ? "#b98a30" : "#2458a6", navy = gold ? "#8a6a18" : "#1b4585";
    const red = gold ? "#f7931a" : "#d32f2f", yellow = gold ? "#fff1a8" : "#ffd23f";
    // The can stands a little to the palm's side of the grip (IN, toward the body from the right hand), so it fills
    // the fist from the palm, covers the thumb wrapped round it there and never shows through the back of the hand.
    const IN = 0.034;
    const at = (i, r, y) => { const a = (i - 0.5) / N * TAU; return [(Math.sin(a) * r + IN) * h, y * h, Math.cos(a) * r * h]; };
    // Side 0 faces ahead; `near` counts sides out from it.
    const near = (i) => Math.min(i, N - i);
    const LEVELS = [[-0.18, 0.074], [-0.15, 0.088], [-0.13, 0.088], [-0.075, 0.088], [-0.025, 0.088], [0.015, 0.088], [0.05, 0.088], [0.13, 0.088], [0.15, 0.088], [0.18, 0.074], [0.192, 0.066]];
    const PAINT = [() => rim, () => silver, () => blue, (i) => near(i) < 1 ? yellow : near(i) < 2 ? red : blue, () => navy, (i) => near(i) < 3 ? red : blue, () => blue, () => silver, () => rim, () => silver];
    geo = BL.models.geometry();
    for (let b = 0; b + 1 < LEVELS.length; b++) for (let i = 0; i < N; i++) {
      const [y0, r0] = LEVELS[b], [y1, r1] = LEVELS[b + 1], a = (i / N) * TAU;
      H.poly(geo, [at(i, r0, y0), at(i + 1, r0, y0), at(i + 1, r1, y1), at(i, r1, y1)], PAINT[b](i), [Math.sin(a), 0, Math.cos(a)]);
    }
    const last = LEVELS[LEVELS.length - 1], first = LEVELS[0];
    H.poly(geo, Array.from({ length: N }, (_, i) => at(i, last[1], last[0])), rim, [0, 1, 0]);
    H.poly(geo, Array.from({ length: N }, (_, i) => at(i, first[1], first[0])), rim, [0, -1, 0]);
    geo = merge(geo, box({ w: 0.05 * h, h: 0.008 * h, d: 0.024 * h, color: "#5f6670", offset: { x: IN * h, y: 0.196 * h, z: 0.02 * h } }));
    energyCanCache.set(key, geo);
    return geo;
  };
  const modelled = () => BL.models.STYLE === "R";
  BL.characters.add({
    handle: "YellowBrokeIt",
    joined: 1789677925,
    lastCommit: 1788225311,
    // cigarette also keeps the right hand closed in crew.js
    look: { bald: true, cleanShaven: true, wideEyes: true, cigarette: true, face: "none", skin: "#ffe36a", hair: "#21160e", fur: "#ed9b24" },
    dress: {
      torso(k, v) {
        v.fill(0, 8, 0, 7, 0, 5, k.color("#e89423"));
        // The modelled look's tank top is a piece of its own (see model). Under it the trunk is a shade of the top's
        // own orange, so nothing of his body shows at any seam of the cloth; over its neckline the trunk is bare.
        if (modelled()) {
          v.fill(0, 8, 0, 6, 0, 5, k.color("#d98a1f"));
          v.fill(0, 8, 7, 7, 0, 5, k.P.skin);
        }
      },
      // The modelled look: the stock build in a tank top that is a garment of its own. Every corner of the cloth is
      // lifted off the trunk by the same distance (trunk.lift), so it stands clear of him all over. Its body is a
      // shell from the hips to under the chest. Over that a panel covers the chest, and another the back, up to a
      // neckline cut straight across that curves up into a strap at each end; the straps run up onto the shoulders
      // and over them. Each side is a plate with a round armhole: a circle about where the arm leaves the trunk,
      // wide enough that the arm passes through it without touching the cloth, down past the bottom of the chest.
      // In the armhole his side shows, and the arm. Every edge is bound a shade darker.
      model(k, wear) {
        const H = BL.heroBody, body = wear(), S = H.trunk(false), geo = BL.models.geometry(), cloth = "#e89423", bound = "#c4761a", bare = "#ffe36a";
        const OFF = 0.2, HEM = S.low + 0.3, BASE = 4, NECK = 7.05, SHOULDER = 7.85, TOP = 8.04, IN = 2.75, OUT = 3.6;
        // The armhole: a circle on the trunk's side, in height and depth, about the root of the arm.
        const HY = 6.45, HZ = 0.3, HR = 2.15;
        const shell = (y) => { const [hx, hz, cut, cz] = S.ring(y); return [y, hx + OFF, hz + OFF, cut + OFF * 0.5, 0, cz]; };
        H.loft(geo, [shell(HEM), shell(HEM + 0.28)], bound, [false, false]);
        H.loft(geo, [HEM + 0.28, 1, 2, BASE].map(shell), cloth, [false, false]);
        // Everything else is laid out on his left (+x) and mirrored for his right.
        const both = (pts, color, out) => { H.poly(geo, pts, color, out); H.poly(geo, pts.map((p) => [-p[0], p[1], p[2]]).reverse(), color, [-out[0], out[1], out[2]]); };
        const flat = (y) => { const [hx, , cut] = S.ring(y); return hx - cut; };
        // A place on the side, by height and depth, lifted off it; and one on the front or the back, by breadth and height.
        const onSide = (y, z, d = OFF) => { const [, hz, cut, cz] = S.ring(y); return S.lift([S.side(y, z), y, z], [1, y >= SHOULDER ? 1 : 0, Math.abs(z - cz) > hz - cut - 0.01 ? Math.sign(z - cz) : 0], d); };
        const onFace = (x, y, way, d = OFF) => S.lift([x, y, S.face(x, y, way)], [x > flat(y) + 0.01 ? 0.6 : 0, y >= SHOULDER ? 0.6 : 0, way], d);
        // The side, as a grid: rows at heights the trunk itself turns at, columns across its flat and round its
        // two cut corners to where the panels (or, over the neckline, the straps) take over.
        const ROWS = [BASE, 4.3, 4.6, 4.9, 5.15, 5.4, 5.72, 6.05, 6.4, 6.75, NECK, 7.3, 7.6, SHOULDER, TOP], COLS = [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1];
        const depth = (y, s) => { const [hx, hz, cut, cz] = S.ring(y), level = hz - cut, round = y <= NECK ? cut : Math.max(0, hx - OUT), a = Math.abs(s); return cz + Math.sign(s) * (a <= 0.6 ? a / 0.6 * level : level + (a - 0.6) / 0.4 * round); };
        const place = ROWS.map((y) => COLS.map((s) => [y, depth(y, s)]));
        const inHole = ([y, z], more = 0) => Math.hypot(y - HY, z - HZ) < HR + more;
        const toRim = ([y, z]) => { const far = Math.hypot(y - HY, z - HZ) || 1; return [HY + (y - HY) / far * HR, HZ + (z - HZ) / far * HR]; };
        for (let i = 0; i + 1 < ROWS.length; i++) for (let j = 0; j + 1 < COLS.length; j++) {
          const cell = [place[i][j], place[i][j + 1], place[i + 1][j + 1], place[i + 1][j]];
          // The cloth: what of the cell lies outside the armhole, its corners inside drawn out to the rim.
          if (!cell.every((c) => inHole(c))) both(cell.map((c) => inHole(c) ? toRim(c) : c).map(([y, z]) => onSide(y, z)), cloth, [1, 0, 0]);
          // His side, in the armhole and a little way under its rim.
          if (cell.some((c) => inHole(c, 0.12))) both(cell.map(([y, z]) => onSide(y, z, 0.05)), bare, [1, 0, 0]);
        }
        // The armhole's binding, round its rim.
        for (let n = 0; n < 32; n++) {
          const rim = (a, r) => [HY + Math.cos(a) * r, HZ + Math.sin(a) * r], a0 = n / 32 * Math.PI * 2, a1 = (n + 1) / 32 * Math.PI * 2;
          // In two widths, so it turns with the trunk where it crosses one of the trunk's edges.
          for (const r of [HR, HR + 0.1]) {
            const q = [rim(a0, r), rim(a1, r), rim(a1, r + 0.1), rim(a0, r + 0.1)];
            if (q.every(([y]) => y <= TOP && y >= BASE)) both(q.map(([y, z]) => onSide(y, z, OFF + 0.015)), bound, [1, 0, 0]);
          }
        }
        for (const way of [1, -1]) {
          const out = [0, 0, way], edge = (i) => onSide(ROWS[i], depth(ROWS[i], way));
          // The panel, from one cut corner of the trunk to the other, and the seam that joins it to each side.
          for (let i = 0; ROWS[i] < NECK; i++) {
            const a = onFace(flat(ROWS[i]), ROWS[i], way), b = onFace(flat(ROWS[i + 1]), ROWS[i + 1], way);
            H.poly(geo, way > 0 ? [[-a[0], a[1], a[2]], a, b, [-b[0], b[1], b[2]]] : [a, [-a[0], a[1], a[2]], [-b[0], b[1], b[2]], b], cloth, out);
            both(way > 0 ? [a, edge(i), edge(i + 1), b] : [edge(i), a, b, edge(i + 1)], cloth, [0.7, 0, 0.7 * way]);
          }
          // A flat piece on the front or the back, from places across it and up it.
          const piece = (pts, color, d = OFF) => both((way > 0 ? pts : pts.slice().reverse()).map(([x, y]) => onFace(x, y, way, d)), color, out);
          // The neckline, straight across, curving up into a strap at each end: the corner between the two is a
          // fillet of cloth, bound along its curve.
          const ROUND = 0.95, RISE = SHOULDER - NECK, arc = (a, more = 0) => [IN - ROUND + (ROUND + more) * Math.sin(a), SHOULDER - (RISE + more) * Math.cos(a)];
          piece([[0, NECK - 0.22], [IN - ROUND, NECK - 0.22], [IN - ROUND, NECK], [0, NECK]], bound, OFF + 0.015);
          for (let n = 0; n < 5; n++) {
            const a0 = n / 5 * Math.PI / 2, a1 = (n + 1) / 5 * Math.PI / 2;
            piece([[IN, NECK], arc(a1), arc(a0)], cloth);
            piece([arc(a0, 0.2), arc(a1, 0.2), arc(a1), arc(a0)], bound, OFF + 0.015);
          }
          // The strap, up from the neckline to the shoulder, in two widths that meet where the trunk's corner turns.
          for (let i = ROWS.indexOf(NECK); ROWS[i] < SHOULDER; i++) for (const [x0, x1] of [[IN, null], [null, OUT]]) {
            const y0 = ROWS[i], y1 = ROWS[i + 1];
            piece([[x0 || flat(y0), y0], [x1 || flat(y0), y0], [x1 || flat(y1), y1], [x0 || flat(y1), y1]], cloth);
          }
        }
        // Over each shoulder, from the chest's strap to the back's, along the trunk's own top.
        const ACROSS = [IN, flat(SHOULDER), OUT], ALONG = [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9, 1];
        const crown = ACROSS.map((x) => ALONG.map((t) => {
          const zf = S.face(x, SHOULDER, 1), zb = S.face(x, SHOULDER, -1), z = zf + (zb - zf) * t;
          return S.lift([x, Math.max(SHOULDER, S.over(x, z) || 0), z], [0.2, 1, t < 0.5 ? 0.4 : -0.4], OFF);
        }));
        for (let i = 0; i + 1 < ACROSS.length; i++) for (let n = 0; n + 1 < ALONG.length; n++) both([crown[i][n], crown[i + 1][n], crown[i + 1][n + 1], crown[i][n + 1]], cloth, [0, 1, 0]);
        body.torso = merge(body.torso, H.scaled(geo, k.u));
        return body;
      },
      // An energy can instead of a club, held upright
      club: (k) => modelled() ? { default: wrappedCanGeometry(k.h), gold: wrappedCanGeometry(k.h, true), rest: { x: 0, z: 0 } }
        : { default: energyCanGeometry(k.h), gold: energyCanGeometry(k.h, true), rest: { x: 0, z: 0 } },
      gear(k) {
        const h = k.h, u = k.u;
        // The modelled look holds the cigarette in the left hand (`hand`: it rides the hand, placed in the hand's own
        // frame): its filter in the cut between the pointer and middle fingers, by the knuckles, and the rest of it
        // pointing out of the fist from there, down and away from the back of the hand.
        if (modelled()) {
          const held = createNode({ position: { x: 0.535 * u, y: -1.02 * u, z: -0.5 * u }, rotation: { x: 2.29, y: 0, z: 0 }, scale: { x: 0.7, y: 0.7, z: 0.7 }, geometry: cigaretteGeometry(h) });
          held.hand = true;
          addChild(k.parts.armL, held);
          return;
        }
        addChild(k.parts.armL, createNode({ position: { x: 0, y: -0.62 * h, z: 0.16 * h }, geometry: cigaretteGeometry(h) }));
      },
      // A simple black nose and a white muzzle
      mark(k, v) {
        const P = k.P;
        v.fill(1, 5, 0, 1, 5, 6, P.white);
        v.set(3, 2, 6, P.black);
        v.set(0, 5, 6, P.black);
        v.set(1, 4, 6, P.black);
        v.set(6, 5, 6, P.black);
        v.set(5, 4, 6, P.black);
      }
    }
  });
})();
