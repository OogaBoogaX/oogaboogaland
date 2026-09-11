// Ooga Drop props: the roof plane, the hoop, the canopy, the pack, the target and the wind streak, one cached geometry per builder
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb } = BL.math;
  const { createNode, addChild } = BL.scene;
  const { box, lathe, merge } = BL.models;
  const { kartWheel, yToZ, turn, shift } = BL.raceModels;
  const { caveSign } = BL.hubModels;
  const cached = (build) => {
    let value = null;
    return () => value || (value = build());
  };
  const noShadow = (geo) => {
    geo.castShadow = false;
    return geo;
  };
  const WOOD = "#8a6236", WOOD_DK = "#5c4425", PLANK = "#a9773f", LEAF = "#4f8a3d", LEAF_DK = "#3e7a2c", FUR = "#d98a2e", BANANA = "#f5c542", SPOT = "#4a2f16", BONE = "#e8e2d2";
  // Plane measures: the fuselage axis height, the propeller's nose, the seat behind the wing
  const PLANE = { length: 4.4, span: 6.4, axisY: 0.95, noseZ: 2.3, seatZ: -0.95, seatY: 1.45, wheelR: 0.3, wheelX: 0.75, wheelZ: 0.45 };
  // A rope-bound log under a leopard-fur wing, a banana-leaf fin, bone struts and a horned skull on the nose; +z is the
  // nose, stone wheels touch the ground at the origin
  const FUR_DK = "#c97a24";
  const SPOTS = [[-2.6, 0.1], [-2.1, -0.35], [-1.5, 0.3], [-0.9, -0.2], [-0.3, 0.35], [0.4, -0.3], [1.0, 0.25], [1.7, -0.35], [2.3, 0.15], [2.8, -0.15], [-1.9, 0.5], [1.4, 0.5]];
  const planeBody = cached(() => {
    const y = PLANE.axisY, half = PLANE.length / 2, wingY = y + 0.44, wingZ = 0.35;
    const fuselage = yToZ(lathe({
      profile: [[0.16, -half], [0.34, -half + 0.6], [0.46, -0.4], [0.46, 0.6], [0.38, half - 0.4], [0.2, half], [0, half]],
      segments: 8,
      color: (t) => t < 0.34 || t > 0.66 ? WOOD : WOOD_DK
    }));
    for (let i = 1; i < fuselage.verts.length; i += 3) fuselage.verts[i] += y;
    const planks = Array.from({ length: 5 }, (_, n) => box({ w: PLANE.span / 5 - 0.02, h: 0.12, d: 1.3, color: n % 2 ? FUR_DK : FUR, offset: { x: (n - 2) * PLANE.span / 5, y: wingY, z: wingZ } }));
    return merge(
      fuselage,
      ...planks,
      ...SPOTS.map(([x, z]) => box({ w: 0.22, h: 0.03, d: 0.18, color: SPOT, offset: { x, y: wingY + 0.07, z: wingZ + z } })),
      box({ w: PLANE.span, h: 0.06, d: 0.1, color: WOOD_DK, offset: { y: wingY, z: wingZ + 0.7 } }),
      ...[-1, 1].map((side) => box({ w: 0.6, h: 0.05, d: 1.1, color: LEAF, offset: { x: side * (PLANE.span / 2 + 0.28), y: wingY - 0.02, z: wingZ - 0.05 } })),
      // Bone struts hold the wing, rope binds the log
      ...[-0.7, 0.7].map((x) => box({ w: 0.1, h: 0.36, d: 0.1, color: BONE, offset: { x, y: y + 0.22, z: wingZ } })),
      ...[-1.5, -0.1, 1.2].map((z) => box({ w: 0.98, h: 0.1, d: 0.12, color: SPOT, offset: { y: y, z } })),
      ...[-1.5, -0.1, 1.2].map((z) => box({ w: 0.12, h: 0.98, d: 0.12, color: SPOT, offset: { y: y, z } })),
      // Open seat on a fur cushion with a back rest, a stick in front of it
      box({ w: 0.62, h: 0.24, d: 0.8, color: "#2b1b10", offset: { y: y + 0.36, z: PLANE.seatZ } }),
      box({ w: 0.5, h: 0.08, d: 0.6, color: FUR, offset: { y: y + 0.5, z: PLANE.seatZ } }),
      box({ w: 0.6, h: 0.5, d: 0.08, color: WOOD_DK, offset: { y: y + 0.55, z: PLANE.seatZ - 0.42 } }),
      box({ w: 0.05, h: 0.5, d: 0.05, color: SPOT, offset: { y: y + 0.6, z: PLANE.seatZ + 0.55 } }),
      // Tail: a plank stabiliser, a banana-leaf fin with a banana lashed to its tip, a bone skid
      box({ w: 2.2, h: 0.1, d: 0.7, color: PLANK, offset: { y: y + 0.1, z: -half + 0.3 } }),
      box({ w: 0.08, h: 0.9, d: 0.85, color: LEAF, offset: { y: y + 0.58, z: -half + 0.35 } }),
      box({ w: 0.1, h: 0.3, d: 0.35, color: LEAF_DK, offset: { y: y + 1.05, z: -half + 0.15 } }),
      shift(turn(box({ w: 0.1, h: 0.1, d: 0.42, color: BANANA }), 0, 0, 0.5), 0, y + 1.24, -half + 0.3),
      box({ w: 0.1, h: 0.4, d: 0.1, color: BONE, offset: { y: 0.2, z: -half + 0.5 } }),
      // Gear struts down to the wheels
      ...[-0.75, 0.75].map((x) => box({ w: 0.1, h: 0.7, d: 0.1, color: WOOD_DK, offset: { x, y: y - 0.32, z: 0.45 } })),
      box({ w: 1.6, h: 0.08, d: 0.08, color: WOOD_DK, offset: { y: y - 0.55, z: 0.45 } }),
      // A stone engine block behind the nose, a horned skull perched on it, a hot vent
      box({ w: 0.5, h: 0.3, d: 0.4, color: "#6b625a", offset: { y: y + 0.4, z: 1.55 } }),
      box({ w: 0.34, h: 0.26, d: 0.3, color: BONE, offset: { y: y + 0.68, z: 1.55 } }),
      ...[-1, 1].map((side) => box({ w: 0.06, h: 0.06, d: 0.08, color: "#141414", offset: { x: side * 0.09, y: y + 0.7, z: 1.71 } })),
      ...[-1, 1].map((side) => shift(turn(box({ w: 0.08, h: 0.34, d: 0.08, color: BONE }), 0, side * -0.5), side * 0.2, y + 0.92, 1.5)),
      box({ w: 0.16, h: 0.08, d: 0.16, color: "#ff8a2a", emissive: 0.8, offset: { y: y + 0.58, z: 1.28 } })
    );
  });
  const propeller = cached(() => merge(
    box({ w: 0.24, h: 0.24, d: 0.16, color: SPOT }),
    box({ w: 0.14, h: 1.7, d: 0.06, color: WOOD_DK, offset: { z: 0.04 } }),
    ...[-0.75, 0.75].map((y) => box({ w: 0.15, h: 0.2, d: 0.065, color: BANANA, offset: { y, z: 0.04 } }))
  ));
  // A plane: body, four shared stone wheels, a propeller node the scene spins
  const plane = () => {
    const node = createNode();
    const body = createNode({ geometry: planeBody() });
    const prop = createNode({ position: { x: 0, y: PLANE.axisY, z: PLANE.noseZ }, geometry: propeller() });
    addChild(node, body, prop);
    for (const x of [-PLANE.wheelX, PLANE.wheelX]) addChild(node, createNode({ position: { x, y: PLANE.wheelR, z: PLANE.wheelZ }, geometry: kartWheel() }));
    return { node, prop, seat: { x: 0, y: PLANE.seatY, z: PLANE.seatZ } };
  };
  // A pole with a striped cone blowing along +x
  const windsock = cached(() => {
    const cone = yToZ(lathe({ profile: [[0.02, 0], [0.26, 0.05], [0.24, 0.5], [0.16, 0.9], [0.1, 1.3], [0, 1.3]], segments: 8, color: (t) => t < 0.25 || (t >= 0.5 && t < 0.75) ? "#e04a3a" : BONE }));
    return merge(
      box({ w: 0.08, h: 2.4, d: 0.08, color: WOOD_DK, offset: { y: 1.2 } }),
      shift(turn(cone, Math.PI / 2), 0.08, 2.3, 0)
    );
  });
  // A unit hoop lying in the xz plane; the scene scales each ring's node to its radius
  const HOOP_SIDES = 6, HOOP_TUBE = 0.07;
  const hoop = cached(() => {
    const profile = [];
    for (let i = 0; i <= HOOP_SIDES; i++) {
      const a = i / HOOP_SIDES * Math.PI * 2;
      profile.push([1 + Math.cos(a) * HOOP_TUBE, Math.sin(a) * HOOP_TUBE]);
    }
    return noShadow(lathe({ profile, segments: 28, color: (t) => t < 0.5 ? "#ffd27a" : "#e0b53a", emissive: 0.75 }));
  });
  // The canopy: twelve gores in the crew's colours over a dome, lines down to the harness at the origin
  const CANOPY = { radius: 3.1, rise: 2.8, gores: 12 };
  const CANOPY_PROFILE = [[0, 1.55], [0.9, 1.45], [1.9, 1.15], [2.7, 0.65], [3.1, 0]];
  const GORES = [FUR, BANANA, FUR, SPOT].map(hexToRgb);
  const GORES_INNER = GORES.map((c) => c.map((v) => Math.round(v * 0.55)));
  const canopy = cached(() => {
    const geo = { verts: [], faces: [], lines: [] };
    const vert = (x, y, z) => {
      geo.verts.push(x, y, z);
      return geo.verts.length / 3 - 1;
    };
    const rings = CANOPY_PROFILE.map(([r, y]) => Array.from({ length: CANOPY.gores }, (_, s) => {
      const a = s / CANOPY.gores * Math.PI * 2;
      return vert(Math.cos(a) * r, CANOPY.rise + y, Math.sin(a) * r);
    }));
    for (let p = 0; p < rings.length - 1; p++) {
      for (let s = 0; s < CANOPY.gores; s++) {
        const s2 = (s + 1) % CANOPY.gores, c = GORES[s % GORES.length], inner = GORES_INNER[s % GORES.length];
        if (p === 0) {
          geo.faces.push({ i: [rings[0][0], rings[1][s2], rings[1][s]], color: c, emissive: 0 });
          geo.faces.push({ i: [rings[0][0], rings[1][s], rings[1][s2]], color: inner, emissive: 0 });
          continue;
        }
        geo.faces.push({ i: [rings[p][s], rings[p + 1][s], rings[p + 1][s2], rings[p][s2]], color: c, emissive: 0 });
        geo.faces.push({ i: [rings[p][s], rings[p][s2], rings[p + 1][s2], rings[p + 1][s]], color: inner, emissive: 0 });
      }
    }
    const harness = vert(0, 0.35, 0), lineColor = hexToRgb(BONE), rim = rings[rings.length - 1];
    for (let s = 0; s < CANOPY.gores; s += 2) geo.lines.push({ i: [rim[s], harness], color: lineColor, emissive: 0 });
    geo.lineWidth = 1.2;
    return geo;
  });
  // The pack on the diver's back, in caveman-height units like the jetpack
  const pack = cached(() => merge(
    box({ w: 0.34, h: 0.4, d: 0.2, color: FUR, offset: { y: 0.22, z: -0.1 } }),
    box({ w: 0.3, h: 0.14, d: 0.22, color: BANANA, offset: { y: 0.4, z: -0.1 } }),
    ...[[-0.08, 0.14], [0.06, 0.28], [0.1, 0.1]].map(([x, y]) => box({ w: 0.06, h: 0.06, d: 0.03, color: SPOT, offset: { x, y, z: -0.21 } })),
    ...[-0.12, 0.12].map((x) => box({ w: 0.06, h: 0.42, d: 0.26, color: SPOT, offset: { x, y: 0.22, z: 0.02 } })),
    box({ w: 0.08, h: 0.06, d: 0.08, color: "#e04a3a", emissive: 0.3, offset: { x: 0.16, y: 0.05, z: -0.05 } })
  ));
  // A painted bullseye on the meadow
  const target = cached(() => noShadow(lathe({ profile: [[0, 0.02], [0.7, 0.02], [1.4, 0.02], [2.1, 0.02], [2.8, 0.02], [3.4, 0.02]], segments: 24, color: (t) => Math.round(t * 4) % 2 ? "#e04a3a" : "#f3efe4", emissive: 0.15 })));
  // Where the plane parks, a little nose up, clear of the crest in front of it
  const ROOF_BACK = -3.7, PARK_PITCH = -0.16;
  // The cave sign at two fifths, standing on two pegs driven into the roof
  const SIGN_SCALE = 0.42, PEG_H = 0.5;
  const roofSign = cached(() => {
    const sign = caveSign("Ooga Drop"), board = { verts: sign.verts.slice(), faces: sign.faces, lines: sign.lines };
    const lift = PEG_H + sign.signHeight * SIGN_SCALE * 0.5;
    for (let i = 0; i < board.verts.length; i += 3) {
      board.verts[i] *= SIGN_SCALE;
      board.verts[i + 1] = board.verts[i + 1] * SIGN_SCALE + lift;
      board.verts[i + 2] *= SIGN_SCALE;
    }
    const half = sign.signWidth * SIGN_SCALE * 0.5 - 0.12;
    const geo = merge(board, ...[-half, half].map((x) => box({ w: 0.07, h: PEG_H + 0.2, d: 0.07, color: WOOD_DK, offset: { x, y: (PEG_H + 0.2) * 0.5 - 0.1 } })));
    geo.signWidth = sign.signWidth * SIGN_SCALE;
    return geo;
  });
  // Where the sign stands beside the parked plane, in the mouth's local frame
  const SIGN_AT = { x: -2.7, z: ROOF_BACK + 1.4 };
  // The hole an Ooga leaves in the meadow
  const hole = cached(() => noShadow(lathe({ profile: [[0, 0.03], [0.45, 0.03], [0.62, 0.03], [0.62, -0.02]], segments: 12, color: (t) => t < 0.5 ? "#1a120b" : "#3a2a18" })));
  // Air rushing past, a thin line the scene stretches along the diver's velocity
  const streak = cached(() => noShadow(box({ w: 0.03, h: 0.03, d: 1, color: "#eef3f7", emissive: 0.35 })));
  // Where the plane parks: on the roof over a mouth's room, nose toward the meadow; shared by the hub and the scene
  // The roof is read under both wheels, the higher one wins, and the nose-up park turns about the axle so the wheels
  // stay on it: out.y is where the plane's origin goes at that scale
  const roofSpot = (island, m, out = {}, scale = 1) => {
    const ax = Math.sin(m.ry), az = Math.cos(m.ry), rx = Math.cos(m.ry), rz = -Math.sin(m.ry);
    out.x = m.x + ax * ROOF_BACK;
    out.z = m.z + az * ROOF_BACK;
    const wx = ax * PLANE.wheelZ * scale, wz = az * PLANE.wheelZ * scale;
    const left = island.surfaceAt(out.x + wx - rx * PLANE.wheelX * scale, out.z + wz - rz * PLANE.wheelX * scale);
    const right = island.surfaceAt(out.x + wx + rx * PLANE.wheelX * scale, out.z + wz + rz * PLANE.wheelX * scale);
    out.y = Math.max(left, right) - (PLANE.wheelR * (Math.cos(PARK_PITCH) - 1) - PLANE.wheelZ * Math.sin(PARK_PITCH)) * scale;
    out.ry = m.ry;
    out.ax = ax;
    out.az = az;
    return out;
  };
  BL.dropModels = { PLANE, CANOPY, ROOF_BACK, PARK_PITCH, SIGN_AT, roofSign, plane, planeBody, propeller, windsock, hoop, canopy, pack, target, streak, hole, roofSpot };
})();
