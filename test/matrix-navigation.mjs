// Exercise the production pilot and scene update, including their swept camera
// clamp. Debug metadata is read only; no admission or portal flags are assigned.
export const matrixNavigationProbe = (prime = () => {}) => {
  // Preserve the same wave-distance window for every route at the faster speed.
  const B = window.__ooga, scene = window.BL.scenes.hub, C = B.matrixCave, W = C.world, R = B.renderer, o = B.pilot.orbit, dt = 1 / 240;
  let elapsed = W.sampleStream(0).time, draws = 0;
  R.setQuality("high"); prime();
  const step = (draw = false) => { elapsed += dt; scene.update(dt, elapsed); if (draw && R.render(scene.root, B.camera, B.renderOpts)) draws++; };
  const advance = (radius) => { let steps = 0; while (W.radius !== radius && steps++ < 400) step(); if (W.radius !== radius) throw new Error("Camera fixture wave did not settle"); };
  const pose = (opening, x, y, z) => {
    const m = opening.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), wx = m.x + cr * x + sr * z, wz = m.z - sr * x + cr * z;
    const target = { x: wx - sr * 3.5, y: m.floorY + y, z: wz - cr * 3.5 };
    o.target = target; o.tx = target.x; o.ty = target.y; o.tz = target.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = 0; o.dist = o.tDist = 3.5;
    B.pilot.update(0.1); step(true);
    const p = B.camera.position, space = { caveIndex: 0, floor: 0, ceiling: 0 }, cavity = B.island.cavityAt(p.x, p.z, space);
    return { requested: [x, y, z], actual: [cr * (p.x - m.x) - sr * (p.z - m.z), p.y - m.floorY, sr * (p.x - m.x) + cr * (p.z - m.z)], id: B.cameraCave.id, index: B.cameraCave.index, contains: B.cameraCave.contains(p.x, p.y, p.z), matrixInside: C.inside, active: W.active, radius: W.radius, pitch: o.pitch, near: B.camera.near, cavity, floor: space.floor, ground: B.island.surfaceAt(p.x, p.z) - m.floorY, ceiling: Number.isFinite(space.ceiling) ? space.ceiling : null };
  };
  const cases = [], openings = B.cameraCave.openings;
  for (const active of [false, true]) for (const opening of openings) {
    C.viewInside(false); step();
    if (active) advance(W.maxRadius);
    C.viewApproach(); step();
    if (!active) advance(0);
    const invalid = [];
    for (const [name, x, y] of [["above", 0, opening.maxY + 1], ["below", 0, opening.minY - 10], ["beside-left", opening.minX - 1, 1.5], ["beside-right", opening.maxX + 1, 1.5]]) {
      const before = pose(opening, x, y, 0.9), after = pose(opening, x, y, 0.1);
      invalid.push({ name, before, after });
      pose(opening, 0, 12, 1.2);
    }
    const m = opening.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), roofX = m.x - sr * 3.5, roofZ = m.z - cr * 3.5, roofY = B.island.surfaceAt(roofX, roofZ) - m.floorY + 2;
    pose(opening, 0, roofY, 0.9);
    const roof = [pose(opening, 0, roofY, -1), pose(opening, 0, roofY, -3.5)];
    pose(opening, 0, 12, 0.9);
    const route = [];
    for (const z of [0.9, 0.6, 0.5, 0.4, 0.1, -0.5, -1.5, -3.5, -5]) route.push(pose(opening, 0, 0.8, z));
    const ceiling = pose(opening, 0, 12, -3.5);
    pose(opening, 0, 0.8, -3.5);
    const wall = pose(opening, 6, 0.8, -3.5);
    pose(opening, 0, 0.8, -0.5);
    const invalidExits = [pose(opening, 0, 12, 0.9)];
    pose(opening, 0, 0.8, -0.5); invalidExits.push(pose(opening, 6, 0.8, 0.9));
    pose(opening, 0, 0.8, -3.5);
    for (const z of [-2, -0.5, 0.4, 0.5, 0.6, 0.9, 3]) route.push(pose(opening, 0, 0.8, z));
    const lateral = [];
    for (const x of [-2.048, -1.674, 1.674, 2.048]) {
      pose(opening, x, 0.8, 0.9);
      lateral.push({ x, route: [0.6, 0.4, 0.1, -0.5, 0.4, 0.6].map((z) => pose(opening, x, 0.8, z)) });
    }
    cases.push({ id: opening.id, index: opening.caveIndex, active, invalid, invalidExits, roof, route, lateral, ceiling, wall, records: R.stats.records });
  }
  // Relocating between debug views is not a physical cross-island flight. Leave
  // the last doorway upward first so that the long setup segment crosses no
  // unrelated low aperture on its way back to the Mirror approach.
  pose(openings[openings.length - 1], 0, 12, 1.2);
  C.viewApproach(); step(); advance(0); step(true);
  return { backend: R.kind, openings: openings.length, caveBytes: B.island.cavityBytes, cases, draws, final: { index: B.cameraCave.index, active: W.active, radius: W.radius } };
};

// Scene routing must depend on the driven Ooga's real doorway crossing, not
// merely occupying the cave's X/Z footprint or looking down through its roof.
export const caveRoutingRejections = async () => {
  const B = window.__ooga, o = B.pilot.orbit, cases = [];
  const wait = () => new Promise((resolve) => { const frame = B.renderedFrames, tick = () => B.scene !== "hub" || B.renderedFrames >= frame + 5 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
  for (const id of ["c11", "c9"]) {
    const m = B.mouths.find((mouth) => mouth.id === id), sr = Math.sin(m.ry), cr = Math.cos(m.ry), cave = [...B.cavemen.values()].find((c) => c.state === "working" && !c.walk && !c.build);
    const place = (x, y, z, overhead = false) => {
      const p = cave.root.position; p.x = x; p.y = cave.baseY + y; p.z = z; cave.hop = cave.hopV = 0;
      const target = { x, y: y + 0.9, z }; o.target = target; o.tx = x; o.ty = target.y; o.tz = z;
      o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = overhead ? Math.PI / 2 - 0.05 : 0.3; o.dist = o.tDist = overhead ? 10 : 4;
      B.pilot.update(0.1);
    };
    const sample = (name) => {
      const p = cave.root.position, eye = B.camera.position, space = { caveIndex: 0, floor: 0, ceiling: 0 }, cavity = B.island.cavityAt(eye.x, eye.z, space);
      return { id, name, scene: B.scene, playerIndex: B.cameraCave.playerIndex, actorY: p.y - cave.baseY, ground: B.island.surfaceAt(p.x, p.z), atTrigger: Math.hypot(p.x - m.inside.x, p.z - m.inside.z) < 0.001, cameraY: eye.y, cameraCavity: cavity ? space.caveIndex : 0, ceiling: Number.isFinite(space.ceiling) ? space.ceiling : null };
    };
    B.crew.control(cave); place(m.inside.x, B.island.surfaceAt(m.inside.x, m.inside.z), m.inside.z); await wait();
    cases.push(sample("actor-on-roof")); if (B.scene !== "hub") return cases;
    B.crew.release(); await wait(); B.crew.control(cave); place(m.inside.x, m.floorY, m.inside.z); await wait();
    cases.push(sample("inside-without-crossing")); if (B.scene !== "hub") return cases;
    B.crew.release(); await wait(); B.crew.control(cave);
    for (const z of [1.2, 0.7, 0.4, -0.5, -1.5]) { place(m.x + sr * z, m.floorY, m.z + cr * z, true); await wait(); if (B.scene !== "hub") return cases; }
    place(m.inside.x, m.floorY, m.inside.z, true); await wait();
    cases.push(sample("camera-above-admitted-actor")); if (B.scene !== "hub") return cases;
    B.crew.release(); await wait();
  }
  B.pilot.goPreset("pile"); await wait();
  return cases;
};
