// Banana Club's roof: a glazed barrel vault along the hall. A stepped marble and
// gold cornice runs round the four walls from their tops (SPRING, 9.1 m) to FOOT (9.9 m); from the cornice's inner lip
// the vault rises as a segmental arch to RIDGE (16 m), its glass flat facets on gold ribs (RIBS, over the old beam lines
// and at both end walls), slim gold purlins between them along the facet joins and a heavier gold ridge beam. Each end
// wall is closed above the cornice by a glazed lunette on fine gold mullions fanned from a point below the cornice, its
// middle left open. Nothing here is a walk block or a pick target, and all of it lies at or over SPRING.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, K = BL.pokerMarble, hexToRgb = BL.math.hexToRgb;
  // The hall: inner side walls at x +-WALL_X, inner end walls at z +-WALL_Z.
  const WALL_X = 24.4, WALL_Z = 36.5, SPRING = 9.1, FOOT = 9.9, RIDGE = 16, INSET = 0.5;
  // The arch: from the cornice's lip (HALF_SPAN, FOOT) to the ridge, a circle of RADIUS about (0, CENTRE_Y).
  const HALF_SPAN = WALL_X - INSET, RISE = RIDGE - FOOT;
  const RADIUS = (HALF_SPAN * HALF_SPAN + RISE * RISE) / (2 * RISE), CENTRE_Y = RIDGE - RADIUS, HALF_ANGLE = Math.asin(HALF_SPAN / RADIUS);
  // The table lamps hang under the purlin over x = +-LAMP_X, so the facet joins put one there.
  const LAMP_X = 11, LAMP_ANGLE = Math.asin(LAMP_X / RADIUS);
  // Facet joins on one side, ridge to foot: five facets a side (three on the lite set), the lamp row's join in both.
  const JOINS = Object.freeze({
    full: Object.freeze([0, LAMP_ANGLE / 2, LAMP_ANGLE, LAMP_ANGLE + (HALF_ANGLE - LAMP_ANGLE) / 3, LAMP_ANGLE + 2 * (HALF_ANGLE - LAMP_ANGLE) / 3, HALF_ANGLE]),
    lite: Object.freeze([0, LAMP_ANGLE, (LAMP_ANGLE + HALF_ANGLE) / 2, HALF_ANGLE])
  });
  // The ribs' z: over the six old beam lines and against each end wall; the lunettes' glass at +-END_Z behind them.
  const END_Z = WALL_Z - 0.08, END_RIB = WALL_Z - 0.2;
  const RIBS = Object.freeze([-END_RIB, -30, -18, -6, 6, 18, 30, END_RIB]);
  // Member sections, metres: the rib's web and flange (along z, and down from the glass), the purlin's, the ridge's.
  const RIB = { web: 0.14, flange: 0.24, depth: 0.34, lip: 0.05 }, PURLIN = { width: 0.09, depth: 0.16 }, RIDGE_BEAM = { web: 0.24, flange: 0.36, depth: 0.38, lip: 0.06 };
  const GOLD = K.GOLD, PALE_GOLD = "#e0c27e", MARBLE = K.WHITE;
  // The glass, the roof's and (poker-glazing.js) the walls': the renderer's reflective glass (`glassOpacity`, as the
  // Timechain party room's panes and DSB Land's water), nearly clear face on (`opacity`), paler and catching a glint of
  // the moon toward a glancing view, more on the walls, which are seen down their length, than on the roof, whose far
  // facets would otherwise close the sky (`roof`, `wall`: its `glassGrazing`), and taking little of the hall's haze
  // (`pierce`), so far glass stays glass rather than a brown sheet. It is drawn after the sky's own glass (the band's
  // clouds and the stars' halos), so it lies over them as it should. It casts no shadow.
  const GLAZE = Object.freeze({ color: "#bcdde0", opacity: 0.09, roof: 0.6, wall: 1, pierce: 0.85 });
  // The lunettes' mullions fan from FAN_Y on the centre line, under the cornice, so they rise like rays; 0.1 m square,
  // as the glass end walls' posts that stand under their feet (`feet`).
  const FAN_Y = FOOT - 6;
  // The underside of the ridge beam, where the chandeliers' chains meet it.
  const RIDGE_UNDER = RIDGE - RIDGE_BEAM.depth - RIDGE_BEAM.lip;
  const rgbs = new Map(), rgb = hex => { if (!rgbs.has(hex)) rgbs.set(hex, hexToRgb(hex)); return rgbs.get(hex); };
  // A point on the arch at angle a from the ridge (positive toward +x), r from the centre: [x, y].
  const at = (a, r = RADIUS) => [r * Math.sin(a), CENTRE_Y + r * Math.cos(a)];
  // The lift passes through the easternmost pane between two ribs on both mesh tiers.
  const LIFT = Object.freeze({ x: 21.65, z: -26.9, half: 1.3 });
  const facets = {};
  for (const tier of ["full", "lite"]) facets[tier] = JOINS[tier].map(a => at(a));
  const surfaceAt = (x, lite) => {
    const joins = facets[lite ? "lite" : "full"], dx = Math.abs(x);
    for (let i = 1; i < joins.length; i++) {
      const a = joins[i-1], b = joins[i];
      if (dx <= b[0]) return a[1] + (b[1]-a[1]) * (dx-a[0]) / (b[0]-a[0]);
    }
    return FOOT;
  };
  // One face through the points (each [x, y, z]), wound so its normal points along `out`.
  const quad = (geo, pts, hex, out, emissive = 0) => {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const ids = pts.map(p => M.pushVert(geo, p[0], p[1], p[2]));
    M.face(geo, nx * out[0] + ny * out[1] + nz * out[2] < 0 ? ids.reverse() : ids, rgb(hex), { emissive });
  };
  // A band following the arch over `angles` (one side or both), between radii ri and ro and from z0 to z1: its inner,
  // outer and two side faces per facet and a cap at each end.
  const band = (geo, angles, ri, ro, z0, z1, hex) => {
    for (let k = 0; k + 1 < angles.length; k++) {
      const a = angles[k], b = angles[k + 1], [ix0, iy0] = at(a, ri), [ix1, iy1] = at(b, ri), [ox0, oy0] = at(a, ro), [ox1, oy1] = at(b, ro);
      const m = (a + b) / 2, down = [-Math.sin(m), -Math.cos(m), 0];
      quad(geo, [[ix0, iy0, z0], [ix1, iy1, z0], [ix1, iy1, z1], [ix0, iy0, z1]], hex, down);
      quad(geo, [[ox0, oy0, z0], [ox1, oy1, z0], [ox1, oy1, z1], [ox0, oy0, z1]], hex, [-down[0], -down[1], 0]);
      quad(geo, [[ix0, iy0, z0], [ix1, iy1, z0], [ox1, oy1, z0], [ox0, oy0, z0]], hex, [0, 0, -1]);
      quad(geo, [[ix0, iy0, z1], [ix1, iy1, z1], [ox1, oy1, z1], [ox0, oy0, z1]], hex, [0, 0, 1]);
    }
    for (const [a, sign] of [[angles[0], -1], [angles[angles.length - 1], 1]]) {
      const [ix, iy] = at(a, ri), [ox, oy] = at(a, ro), t = [Math.cos(a) * sign, -Math.sin(a) * sign, 0];
      quad(geo, [[ix, iy, z0], [ox, oy, z0], [ox, oy, z1], [ix, iy, z1]], hex, t);
    }
  };
  const both = js => [...js.slice(1).reverse().map(a => -a), ...js];
  const cache = M.scopedMap();
  const once = (key, make) => { if (cache.has(key)) return cache.get(key); const g = make(); cache.set(key, g); return g; };
  const noShadow = g => { g.castShadow = false; return g; };
  const glaze = (geo, grazing) => { geo.glassOpacity = GLAZE.opacity; geo.glassGrazing = grazing; geo.fogPierce = GLAZE.pierce; return noShadow(geo); };
  // The rib: an arched gold web with a broader flange under it, foot to foot over every facet join, built at z 0.
  const rib = lite => once(lite ? "rib-lite" : "rib", () => {
    const geo = M.merge(), js = both(JOINS[lite ? "lite" : "full"]);
    band(geo, js, RADIUS - RIB.depth, RADIUS + 0.02, -RIB.web / 2, RIB.web / 2, GOLD);
    band(geo, js, RADIUS - RIB.depth - RIB.lip, RADIUS - RIB.depth, -RIB.flange / 2, RIB.flange / 2, PALE_GOLD);
    return geo;
  });
  // The purlin: a slim gold bar one metre long along z, built over the ridge (x 0) about the arch's centre, so a node at
  // (0, CENTRE_Y, z) turned by -a about z stands it on the join at angle a and its z scale sets its length.
  // Purlins cast no shadow: under the moon they laid a fine grid over the floor and the tables.
  const purlin = () => once("purlin", () => noShadow(M.box({ w: PURLIN.width, h: PURLIN.depth, d: 1, color: GOLD, offset: { y: RADIUS - PURLIN.depth / 2 + 0.01 } })));
  // The ridge beam, the hall's length between the lunettes: a deep web and a flange under it.
  const ridge = () => once("ridge", () => M.merge(
    M.box({ w: RIDGE_BEAM.web, h: RIDGE_BEAM.depth, d: END_Z * 2, color: GOLD, offset: { y: RIDGE + 0.02 - RIDGE_BEAM.depth / 2 } }),
    M.box({ w: RIDGE_BEAM.flange, h: RIDGE_BEAM.lip, d: END_Z * 2, color: PALE_GOLD, offset: { y: RIDGE_UNDER + RIDGE_BEAM.lip / 2 } })));
  // A turned gold boss where each inner rib crosses the ridge.
  const boss = () => once("boss", () => M.lathe({ segments: 12, color: GOLD, profile: [[0, RIDGE_UNDER], [0.2, RIDGE_UNDER], [0.17, RIDGE_UNDER - 0.08], [0.08, RIDGE_UNDER - 0.16], [0, RIDGE_UNDER - 0.22]] }));
  // One pane a facet row, one metre along z about z 0, visible from the hall and the rooftop, on the +x side (a node turned half
  // about y lays it on the -x side): flat between two joins on the arch, nearly clear and faintly cool.
  const pane = (a, b) => once("pane:" + a + ":" + b, () => {
    const geo = M.merge(), [x0, y0] = at(a), [x1, y1] = at(b), m = (a + b) / 2;
    quad(geo, [[x0, y0, -0.5], [x1, y1, -0.5], [x1, y1, 0.5], [x0, y0, 0.5]], GLAZE.color, [-Math.sin(m), -Math.cos(m), 0]);
    M.face(geo, geo.faces[0].i.slice().reverse(), rgb(GLAZE.color));
    return glaze(geo, GLAZE.roof);
  });
  const panes = lite => { const js = JOINS[lite ? "lite" : "full"]; return js.slice(0, -1).map((a, k) => pane(a, js[k + 1])); };
  // The cornice: steps from the wall top up to the vault's foot, a gold frieze band, a white fascia, a dentil course (a
  // plain band on the lite set), a gold bead, a white corona and a gold lip, round all four walls, the end walls' runs
  // fitted between the side walls' so no two faces lie one on another.
  const STEPS = [[SPRING, 9.2, 0.12, GOLD], [9.2, 9.5, 0.2, MARBLE], [9.5, 9.62, 0.22, MARBLE], [9.62, 9.68, 0.36, GOLD], [9.68, 9.84, 0.46, MARBLE], [9.84, FOOT, INSET, PALE_GOLD]];
  const DENTIL = { y0: 9.5, y1: 9.62, depth: 0.32, width: 0.14, pitch: 0.36 };
  const cornice = lite => once(lite ? "cornice-lite" : "cornice", () => {
    const parts = [], run = (y0, y1, d, hex) => {
      const h = y1 - y0, y = (y0 + y1) / 2;
      for (const s of [-1, 1]) {
        parts.push(M.box({ w: d + 0.05, h, d: WALL_Z * 2, color: hex, offset: { x: s * (WALL_X - d / 2 + 0.025), y } }));
        parts.push(M.box({ w: (WALL_X - d) * 2, h, d: d + 0.05, color: hex, offset: { y, z: s * (WALL_Z - d / 2 + 0.025) } }));
      }
    };
    for (const [y0, y1, d, hex] of STEPS) run(y0, y1, lite && y0 === DENTIL.y0 ? DENTIL.depth : d, hex);
    if (!lite) {
      // Dentils proud of their band, the blocks along each wall stopping short of the corners' returns.
      const { y0, y1, depth, width, pitch } = DENTIL, h = y1 - y0, y = (y0 + y1) / 2, out = depth - 0.22;
      for (const s of [-1, 1]) {
        for (let z = -WALL_Z + depth + pitch / 2; z < WALL_Z - depth; z += pitch) parts.push(M.box({ w: out, h, d: width, color: MARBLE, offset: { x: s * (WALL_X - 0.22 - out / 2), y, z } }));
        for (let x = -WALL_X + depth + pitch / 2; x < WALL_X - depth; x += pitch) parts.push(M.box({ w: width, h, d: out, color: MARBLE, offset: { x, y, z: s * (WALL_Z - 0.22 - out / 2) } }));
      }
    }
    return M.merge(...parts);
  });
  // A lunette for the +z end wall, in the plane z END_Z and facing the hall (a node turned half about y stands it at the
  // -z end): its glass from the cornice to the end rib's arch, and gold mullions from the cornice up to each facet join
  // but the ridge, on rays from (0, FAN_Y), so the middle stays open between the ridge's two neighbours.
  const lunette = lite => once(lite ? "lunette-lite" : "lunette", () => {
    const js = JOINS[lite ? "lite" : "full"], arc = both(js).map(a => at(a)), n = arc.length, mid = (n - 1) / 2;
    // Where the ray from the fan point to the join at index i meets the cornice's top.
    const foot = i => { const [x, y] = arc[i]; return [x * (FOOT - FAN_Y) / (y - FAN_Y), FOOT]; };
    const glass = M.merge(), frame = [], z = END_Z, toward = [0, 0, -1];
    // Panes between neighbouring mullions; the outermost run to the arch's foot, and the middle one holds the ridge.
    const spokes = [];
    for (let i = 1; i < n - 1; i++) if (i !== mid) spokes.push(i);
    const bounds = [0, ...spokes, n - 1];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const i = bounds[k], j = bounds[k + 1], pts = [];
      if (i !== 0) pts.push(foot(i));
      for (let m = i; m <= j; m++) pts.push(arc[m]);
      if (j !== n - 1) pts.push(foot(j));
      quad(glass, pts.map(([x, y]) => [x, y, z]), GLAZE.color, toward);
    }
    glaze(glass, GLAZE.wall);
    for (const i of spokes) { const [fx, fy] = foot(i), [x, y] = arc[i]; frame.push(M.beam(fx, fy, z - 0.05, x, y, z - 0.05, 0.1, GOLD)); }
    return { glass, frame: M.merge(...frame) };
  });
  // Every geometry of one set, for the room's record and the checks.
  const parts = (lite = false) => ({ rib: rib(lite), purlin: purlin(), ridge: ridge(), boss: lite ? null : boss(), cornice: cornice(lite), panes: panes(lite), lunette: lunette(lite) });
  // The bays between neighbouring ribs, as [middle, length]; the end bays reach the lunettes' glass.
  const BAYS = Object.freeze(RIBS.slice(0, -1).map((z, k) => {
    const a = k === 0 ? -END_Z : z, b = k === RIBS.length - 2 ? END_Z : RIBS[k + 1];
    return Object.freeze([(a + b) / 2, b - a]);
  }));
  const build = (lite = false) => {
    const p = parts(lite), js = JOINS[lite ? "lite" : "full"], root = S.createNode(), glass = [...p.panes, p.lunette.glass];
    const put = (geo, x, y, z) => { const n = S.createNode({ geometry: geo, position: { x, y, z } }); S.addChild(root, n); return n; };
    put(p.cornice, 0, 0, 0); put(p.ridge, 0, 0, 0);
    for (const z of RIBS) put(p.rib, 0, 0, z);
    if (p.boss) for (const z of RIBS.slice(1, -1)) put(p.boss, 0, 0, z);
    for (const [z, length] of BAYS) {
      p.panes.forEach((geo, k) => { for (const side of [1, -1]) {
        if (side < 0 || k !== p.panes.length-1 || Math.abs(LIFT.z-z) >= length/2) {
          const n = put(geo, 0, 0, z); n.scale.z = length; if (side < 0) n.rotation.y = Math.PI;
          continue;
        }
        const [x0,y0] = at(js[k]), [x1,y1] = at(js[k+1]);
        // A uniform scale in the cross section keeps each strip on the original glass plane.
        const strip = (left,right,near,far) => {
          const scale=(right-left)/(x1-x0);
          const y=y0+(y1-y0)*(left-x0)/(x1-x0);
          const n=put(geo,left-scale*x0,y-scale*y0,(near+far)/2);
          n.scale.x=n.scale.y=scale; n.scale.z=far-near;
        };
        const near=LIFT.z-LIFT.half, far=LIFT.z+LIFT.half;
        strip(x0,x1,z-length/2,near); strip(x0,x1,far,z+length/2);
        strip(x0,LIFT.x-LIFT.half,near,far); strip(LIFT.x+LIFT.half,x1,near,far);
      } });
      // Purlins on every join between the ridge and the foot, stopping at the ribs' webs.
      for (let k = 1; k < js.length - 1; k++) for (const s of [1, -1]) {
        const n = put(p.purlin, 0, CENTRE_Y, z); n.scale.z = length - RIB.web; n.rotation.z = -s * js[k];
      }
    }
    for (const s of [1, -1]) for (const geo of [p.lunette.glass, p.lunette.frame]) { const n = put(geo, 0, 0, 0); if (s < 0) n.rotation.y = Math.PI; }
    const dispose = () => { while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]); };
    return { root, glass, dispose };
  };
  /** Where the lunettes' mullions meet the cornice, x > 0 in order outward: the glass end walls' posts stand under them. */
  const feet = (lite = false) => JOINS[lite ? "lite" : "full"].slice(1, -1).map(a => { const [x, y] = at(a); return x * (FOOT - FAN_Y) / (y - FAN_Y); });
  /** The underside of the vault on the centre line at z: the ridge beam's flange, where a chandelier's chain meets it. */
  const hang = z => {
    if (!(Math.abs(z) <= END_Z)) throw new Error(`pokerVault.hang: z ${z} lies outside the hall`);
    return RIDGE_UNDER;
  };
  /** The underside of the purlin over the lamp rows, at x on that row (|x| near LAMP_X). */
  const lampHang = x => CENTRE_Y + Math.sqrt((RADIUS - PURLIN.depth + 0.01) ** 2 - x * x) - 0.01;
  BL.pokerVault = Object.freeze({ WALL_X, WALL_Z, LIFT, surfaceAt, SPRING, FOOT, RIDGE, RADIUS, CENTRE_Y, HALF_SPAN, LAMP_X, END_Z, RIBS, BAYS, JOINS, GLAZE, glaze, build, parts, hang, lampHang, feet });
})();
