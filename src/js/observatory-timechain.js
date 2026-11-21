// Camera-only public Sphere rooms. Keep the shared room dimensions and raked seating, simplify
// furniture to silhouettes, and omit dome playback, interactive machines, effects and audio entirely.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const { box, merge, lathe, moved, turnedX, turnedY } = BL.models;
  const TAU = Math.PI * 2;
  const create = (renderer, id) => {
    const room = BL.timechainRooms.get(id);
    if (!room || room.lockable) throw new Error("Observatory requires a public Sphere room");
    const L = BL.timechainRooms.layout(id), root = createNode({ cameraHidden: true }), meshes = new Set(), wrappers = new Map();
    const source = { root, meshes, light: { clear: [0.025, 0.03, 0.05], sky: [0.5, 0.5, 0.55], ground: [0.25, 0.23, 0.2],
      direct: [0, 0, 0], directStrength: 0, ambientFloor: 0.65, diffuseFloor: 0 } };
    const add = (geometry, position = null, yaw = 0) => {
      let g = wrappers.get(geometry);
      if (!g) { g = { ...geometry, castShadow: false, cameraFeedKeep: true, cameraFeedSource: source }; wrappers.set(geometry, g); meshes.add(g); }
      const node = createNode({ geometry: g, ...(position ? { position } : {}), rotation: { x: 0, y: yaw, z: 0 } });
      addChild(root, node); return node;
    };
    const shell = { verts: [], faces: [], lines: [] };
    const face = (points, color, emissive = 0.25) => {
      const start = shell.verts.length / 3;
      for (const p of points) shell.verts.push(...p);
      shell.faces.push({ i: points.map((_, i) => start + i), color, emissive });
    };
    const radius = BL.timechainRooms.radiusAt(L, L.yMin), low = Math.asin((L.yMin - L.c) / L.R);
    const sphere = (a, e) => [L.R * Math.cos(e) * Math.sin(a), L.c + L.R * Math.sin(e), L.R * Math.cos(e) * Math.cos(a)];
    // Inward-facing low-poly shell. A blank dome does not invent a film, lecture or live chart.
    for (let row = 0; row < 12; row++) for (let col = 0; col < 32; col++) {
      const a = col * TAU / 32, b = (col + 1) * TAU / 32, lo = low + row * (Math.PI / 2 - low) / 12, hi = low + (row + 1) * (Math.PI / 2 - low) / 12;
      const k = row < 2 ? 1 : 0.6, base = room.kind === "temple" ? [49, 57, 63] : room.kind === "party" ? [33, 25, 52] : [27, 36, 51];
      face([sphere(a, lo), sphere(a, hi), sphere(b, hi), sphere(b, lo)], base.map(c => c * k));
    }
    for (let i = 0; i < 48; i++) {
      const a = i * TAU / 48, b = (i + 1) * TAU / 48;
      face([[0, L.yMin, 0], [radius * Math.sin(a), L.yMin, radius * Math.cos(a)], [radius * Math.sin(b), L.yMin, radius * Math.cos(b)]], [79, 74, 68]);
    }
    const props = [], put = (w, h, d, x, y, z, color, emissive = 0.2) => props.push(box({ w, h, d, color, emissive, offset: { x, y, z } }));
    const details = [], fine = [];
    const extra = (list, w, h, d, x, y, z, color, emissive = 0.2) => list.push(box({ w, h, d, color, emissive, offset: { x, y, z } }));
    if (L.rake) {
      for (const row of L.rake.rows) for (let i = 0; i < 32; i++) {
        const a = -row.psiT + i * 2 * row.psiT / 32, b = -row.psiT + (i + 1) * 2 * row.psiT / 32;
        const p = (r, t, y) => [r * Math.sin(t), y, L.rake.F + r * Math.cos(t)];
        face([p(row.rIn, a, row.y), p(row.rOut, a, row.y), p(row.rOut, b, row.y), p(row.rIn, b, row.y)], [83, 70, 58]);
        face([p(row.rIn, a, L.yMin), p(row.rIn, a, row.y), p(row.rIn, b, row.y), p(row.rIn, b, L.yMin)], [51, 43, 37]);
      }
      const seat = merge(box({ w: 0.7, h: 0.4, d: 0.75, color: "#525767", offset: { y: 0.2 } }),
        box({ w: 0.7, h: 0.7, d: 0.16, color: "#676d7d", offset: { y: 0.6, z: 0.3 } }));
      for (const s of L.rake.seats) add(seat, { x: s.x, y: s.floor, z: s.z }, s.heading);
      const frame = merge(box({ w: 0.12, h: 0.32, d: 0.48, color: "#262d35", offset: { y: 0.16 } }),
        ...[-1, 1].map(side => box({ w: 0.08, h: 0.1, d: 0.56, color: "#343d4a", offset: { x: side * 0.38, y: 0.52 } })));
      for (const s of L.rake.seats) details.push(moved(turnedY(frame, s.heading), s.x, s.floor, s.z));
    } else if (room.kind === "workout") {
      // The authored bike grid (timechain-room-workout.js), without pedals or exercise simulation.
      for (const x of [-5.45, -3.35, -1.25, 1.25, 3.35, 5.45]) for (const z of [-2.2, 0.5, 3.2]) {
        put(0.3, 0.5, 1.1, x, 0.3, z, "#697381"); put(0.35, 0.12, 0.3, x, 0.77, z + 0.18, "#242d38");
        put(0.06, 1, 0.06, x, 0.5, z - 0.5, "#aab2b8"); put(0.6, 0.06, 0.06, x, 1, z - 0.5, "#aab2b8");
        extra(details, 0.28, 0.22, 0.08, x, 1.08, z - 0.5, "#15171a");
        for (const side of [-1, 1]) extra(fine, 0.2, 0.06, 0.16, x + side * 0.26, 0.28, z, "#252a30");
        extra(fine, 0.65, 0.08, 0.12, x, 0.08, z + 0.35, "#8f98a3");
      }
      // Authored left-wall treadmill row, kept static without exercise state.
      for (const z of [-2.6, 0.2, 3]) {
        extra(details, 1.15, 0.2, 1.9, -8.2, 0.1, z, "#232326");
        extra(details, 0.88, 0.025, 1.5, -8.2, 0.215, z, "#35353a");
        for (const x of [-8.7, -7.7]) extra(details, 0.07, 1.05, 0.07, x, 0.7, z - 0.72, "#8f98a3");
        extra(details, 1.05, 0.22, 0.22, -8.2, 1.2, z - 0.72, "#232326");
      }
    } else if (room.kind === "mining") {
      // Museum exhibit ring and central turntable, reduced to plinths and machine enclosures.
      for (let i = 0; i < 18; i++) {
        const a = (-155 + i * 310 / 17) * Math.PI / 180, r = L.r0 - 3.4, x = r * Math.sin(a), z = -r * Math.cos(a);
        put(1.2, 0.9, 1.2, x, 0.45, z, "#5b6066"); put(0.8, 0.65, 0.6, x, 1.225, z, "#b4b8ba");
        extra(details, 0.65, 0.055, 0.25, x, 0.94, z + 0.42, "#b39664");
        for (const side of [-1, 1]) details.push(moved(turnedX(lathe({ profile: [[0, 0], [0.12, 0], [0.12, 0.02], [0, 0.02]],
          segments: 12, color: "#29313a" }), Math.PI / 2), x + side * 0.19, 1.25, z + 0.32));
        for (let vent = 0; vent < 5; vent++) extra(fine, 0.62, 0.018, 0.02, x, 1.03 + vent * 0.09, z - 0.31, "#515b64");
      }
      put(2.4, 0.9, 2.4, 0, 0.45, 0, "#66513a"); put(1.3, 1.2, 0.9, 0, 1.5, 0, "#b6b9b8");
    } else if (room.kind === "temple") {
      // Main hall's authored footprint and deck, retaining the open centre and its entry sightline.
      put(8, 0.7, 5.4, 0, 0.35, -9.6, "#66635c");
      for (const x of [-3.4, 3.4]) for (const z of [-11.6, -7.6]) put(0.3, 3.7, 0.3, x, 2.5, z, "#64392d");
      put(9, 0.35, 6.4, 0, 4.4, -9.6, "#343b3f"); put(7.5, 0.25, 5, 0, 4.95, -9.6, "#3f484b");
      put(5, 0.12, 4, 0, 0.1, -3.9, "#8a8062"); put(1.4, 0.65, 1.2, 0, 1.025, -10.3, "#94573c");
      for (const z of [-11.6, -7.6]) extra(details, 7.1, 0.22, 0.24, 0, 4.05, z, "#754636");
      for (let step = 0; step < 3; step++) extra(details, 3.2, 0.2, 0.38, 0, 0.1 + step * 0.2, -6.25 - step * 0.38, "#77746a");
      for (const x of [-3.4, 3.4]) for (const z of [-11.6, -7.6]) extra(fine, 0.48, 0.15, 0.48, x, 0.8, z, "#8d8270");
    } else if (room.kind === "party") {
      put(15, 1, 4, 0, 0.5, -14, "#333039"); put(3, 1, 1, 0, 1.5, -13, "#252c38");
      for (const x of [-6, 6]) put(1.4, 3.5, 1.2, x, 2.75, -14, "#222831");
      for (const x of [-6, 6]) for (const y of [1.85, 3.1, 4]) details.push(moved(turnedX(lathe({
        profile: [[0, 0], [0.45, 0], [0.45, 0.03], [0, 0.03]], segments: 16, color: "#10151d" }), Math.PI / 2), x, y, -13.38));
      for (let i = 0; i < 8; i++) extra(fine, 0.12, 0.045, 0.5, -1.1 + i * 0.3, 2.03, -13, "#53606e");
    } else if (room.kind === "planetarium") {
      put(0.5, 1, 0.5, 0, 0.5, 0, "#697383"); put(0.8, 0.6, 0.8, 0, 1.3, 0, "#8892a0");
      details.push(lathe({ profile: [[0, 0.02], [0.65, 0.02], [0.65, 0.12], [0, 0.12]], segments: 20, color: "#394351" }));
      for (const x of [-0.25, 0.25]) extra(fine, 0.12, 0.12, 0.08, x, 1.4, 0.44, "#152131");
    }
    add(shell); if (props.length) add(merge(...props));
    const visitors = BL.observatoryVisitors.create(add, room.zone);
    const detailNode = details.length ? add(merge(...details)) : null, fineNode = fine.length ? add(merge(...fine)) : null;
    source.setDetail = level => {
      if (detailNode) detailNode.visible = level > 0;
      if (fineNode) fineNode.visible = level > 1;
      visitors.setDetail(level);
    };
    source.setDetail(0);
    let since = 0;
    source.update = (dt) => { since += dt; if (since < 0.1) return; visitors.update(Math.min(0.25, since)); since = 0; };
    source.dispose = () => { visitors.dispose(); for (const g of meshes) renderer.releaseGeometry(g); root.children.length = 0; meshes.clear(); wrappers.clear(); };
    return source;
  };
  BL.observatoryTimechain = { create };
})();
