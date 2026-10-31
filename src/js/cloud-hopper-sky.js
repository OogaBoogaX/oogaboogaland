// Cloud Hopper's level scenery (docs/cloud-hopper-levels-plan.md 4 and 7a), built for a run under the level's
// fixed sky (`sky` in cloud-hopper-levels.js, which the hub samples on `DAY`). It is all decoration: hidden from
// the outline registry, never collided with, and never under a cloud's swept footprint, so nothing in it reads as a
// landing. Each level's scenery comes from a fixed seed, so it stands the same on every run.
// - `islets` (Bluebird Hop): floating grassy islets with a tree or a bush, below and beside the lanes.
// - `spires` (Amber Spires): towering cumulus stacks far out round the island, beyond every lane.
// - `aurora` (Aurora Heights): green aurora curtains far out ahead, waving slowly.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const M = BL.models, { hexToRgb, mulberry32 } = BL.math;
  const TAU = Math.PI * 2;
  // The day every level sky is sampled on, the equinox, so a level looks the same on any day of the year.
  const DAY = 80;
  const SEED = 77, SHORE = 42;
  // An islet keeps this far (m) off every cloud's swept footprint; one that cannot steps out across the route.
  const ISLET_GAP = 6, ISLET_RADIUS = 5, ISLET_STEP = 10, ISLET_TRIES = 8;

  const islet = M.variants((i) => {
    const rand = mulberry32(911 + i), r = 3 + rand() * 1.5, depth = 4.5 + rand() * 3;
    const rock = M.lathe({ profile: [[0.25, -depth], [r * 0.4, -depth * 0.62], [r * 0.78, -depth * 0.25], [r, -0.35], [r, 0]], segments: 7, color: "#8b6b4c" });
    const soil = M.lathe({ profile: [[r * 1.02, -0.5], [r * 1.02, -0.1]], segments: 7, color: "#6b4a2e" });
    const grass = M.lathe({ profile: [[r * 1.05, -0.12], [r * 0.95, 0.16], [0, 0.22]], segments: 7, color: "#73c24b" });
    const geo = M.merge(rock, soil, grass);
    geo.castShadow = false;
    return geo;
  });
  const curtain = M.cached(() => {
    // A sheet in its own frame: x up its height (the hem wavy near 0), z across it, folds in y. The light beam fades
    // it up x; the ends taper so no straight edge shows.
    const g = M.geometry(), rows = 7, cols = 36, ids = [];
    const low = hexToRgb("#9affcc"), mid = hexToRgb("#33d49c"), high = hexToRgb("#2a9fd6"), split = 0.35;
    for (let r = 0; r <= rows; r++) {
      const row = [], v = r / rows;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols, z = u - 0.5, taper = 1 - Math.pow(Math.abs(2 * z), 3);
        const hem = 0.1 * Math.sin(u * 9) + 0.05 * Math.sin(u * 23);
        row.push(M.pushVert(g, hem + v * (0.45 + 0.55 * taper), 0.22 * Math.sin(u * 7.5) + 0.1 * Math.sin(u * 19 + v * 2), z));
      }
      ids.push(row);
    }
    for (let r = 0; r < rows; r++) {
      const t = r / rows, a = t < split ? low : mid, b = t < split ? mid : high, k = t < split ? t / split : (t - split) / (1 - split);
      const color = a.map((v, n) => Math.round(v + (b[n] - v) * k));
      for (let c = 0; c < cols; c++) M.face(g, [ids[r][c], ids[r][c + 1], ids[r + 1][c + 1], ids[r + 1][c]], color, { emissive: 1 });
    }
    g.glass = 0.3; g.lightBeam = 1.15; g.castShadow = false;
    return g;
  });

  // How near (x, z) comes to any cloud's footprint over its whole lane, less that cloud's reach.
  const clearOf = (course, x, z, radius) => {
    for (const c of course.clouds) {
      const ex = c.moveX * c.moveRange, ez = c.moveZ * c.moveRange, dx = x - c.baseX, dz = z - c.baseZ;
      const along = Math.max(-1, Math.min(1, (dx * ex + dz * ez) / Math.max(1e-9, ex * ex + ez * ez)));
      if (Math.hypot(dx - ex * along, dz - ez * along) < radius + Math.max(c.rx, c.rz) + ISLET_GAP) return false;
    }
    return true;
  };

  const create = ({ root }) => {
    const scenery = createNode({ visible: false, sightHidden: true });
    addChild(root, scenery);
    const curtains = [];
    let time = 0;
    const node = (geometry, x, y, z, s = 1) => {
      const n = createNode({ geometry, position: { x, y, z }, scale: { x: s, y: s, z: s }, sightHidden: true });
      addChild(scenery, n);
      return n;
    };
    // Lays `level`'s scenery round a course from `start` down to `finish` and returns how far it reaches from the
    // start, for the camera's far plane.
    const build = (level, course, start, finish) => {
      clear();
      const kind = level.sky?.scenery;
      if (!kind) return 0;
      const sx = start.x - finish.x, sz = start.z - finish.z, length = Math.hypot(sx, sz), nx = sx / length, nz = sz / length;
      const sideX = -nz, sideZ = nx, ahead = Math.atan2(-nz, -nx), rand = mulberry32(SEED);
      let reach = 0;
      const reached = (x, y, z, size) => { reach = Math.max(reach, Math.hypot(x - start.x, y - start.y, z - start.z) + size); };
      if (kind === "islets") {
        for (let k = 0; k < 18; k++) {
          const t = (k + 0.5) / 18, along = SHORE + (length - SHORE) * t, routeY = start.y + (finish.y + 18 - start.y) * t;
          const side = k % 2 ? 1 : -1, far = k % 3 === 2;
          let across = side * (far ? 115 + rand() * 50 : 38 + rand() * 45);
          const y = routeY - (far ? -4 + rand() * 12 : 16 + rand() * 30), s = far ? 2.2 + rand() : 1.2 + rand() * 0.9, spin = rand() * TAU;
          let x = finish.x + nx * along + sideX * across, z = finish.z + nz * along + sideZ * across, tries = 0;
          while (!clearOf(course, x, z, ISLET_RADIUS * s) && tries++ < ISLET_TRIES) {
            across += side * ISLET_STEP;
            x = finish.x + nx * along + sideX * across; z = finish.z + nz * along + sideZ * across;
          }
          if (tries > ISLET_TRIES) continue;
          const base = node(islet(k % 3), x, y, z, s);
          base.rotation.y = spin;
          addChild(base, createNode({ geometry: BL.hubModels.tree(k % 3), position: { x: 0, y: 0.15, z: 0 }, scale: { x: 0.34, y: 0.34, z: 0.34 }, sightHidden: true }));
          if (k % 2) addChild(base, createNode({ geometry: BL.hubModels.bush(k % 3), position: { x: 1.6, y: 0.15, z: -0.8 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, sightHidden: true }));
          reached(x, y, z, ISLET_RADIUS * s);
        }
      } else if (kind === "spires") {
        for (let k = 0; k < 9; k++) {
          const a = ahead + (k % 2 ? 1 : -1) * (0.2 + rand() * 1.1), r = 380 + rand() * 320;
          const x = finish.x + Math.cos(a) * r, z = finish.z + Math.sin(a) * r;
          const tower = node(null, x, -40 + rand() * 20, z), height = 150 + rand() * 120, width = 60 + rand() * 40;
          for (let j = 0; j < 10; j++) {
            const f = j / 9, anvil = j === 9 && rand() < 0.5, w = width * (anvil ? 1.5 : 1 - f * 0.55) * (0.8 + rand() * 0.4);
            const puff = BL.cloudHopperModels.cloud(w / 2, w * 0.38, anvil ? w * 0.22 : w * 0.7, "normal", rand() * TAU);
            const holder = createNode({ position: { x: (rand() - 0.5) * w * 0.45, y: height * f * 0.85 + w * 0.6, z: (rand() - 0.5) * w * 0.45 }, sightHidden: true });
            addChild(holder, puff); addChild(tower, holder);
          }
          reached(x, tower.position.y + height, z, width * 1.5);
        }
      } else if (kind === "aurora") {
        for (let k = 0; k < 6; k++) {
          const a = ahead + (k - 2.5) * 0.42 + (rand() - 0.5) * 0.2, r = 520 + rand() * 260;
          const c = node(curtain(), finish.x + Math.cos(a) * r, 70 + rand() * 60, finish.z + Math.sin(a) * r);
          c.scale.x = 190 + rand() * 90; c.scale.y = 140; c.scale.z = 420 + rand() * 200;
          c.rotation.z = Math.PI / 2; c.rotation.y = -a; c.phase = rand() * TAU;
          curtains.push(c);
          reached(c.position.x, c.position.y + c.scale.x, c.position.z, c.scale.z / 2);
        }
      }
      scenery.visible = true;
      return reach;
    };
    const update = (dt) => {
      time += dt;
      for (let i = 0; i < curtains.length; i++) curtains[i].rotation.x = Math.sin(time * 0.25 + curtains[i].phase) * 0.04;
    };
    const clear = () => {
      for (let i = scenery.children.length - 1; i >= 0; i--) removeChild(scenery, scenery.children[i]);
      curtains.length = 0; scenery.visible = false;
    };
    const dispose = () => { clear(); removeChild(root, scenery); };
    return { build, update, clear, dispose };
  };
  BL.cloudHopperSky = { DAY, create };
})();
