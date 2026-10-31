// Cloud Hopper's design-review prototypes, on a debug page with `hopperlook=` alone (comma-separated tokens):
// candidate skies and set dressing per level, power-up pickups, X-ray styles, and a level-select mock. The chosen
// warning (a thinning pulse) is the game's own now, in cloud-hopper.js.
// Temporary: the looks the maintainer picks move into the level modules and this file goes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const M = BL.models, { hexToRgb, mulberry32, clamp } = BL.math;
  const TAU = Math.PI * 2;
  // Each level's candidate skies: the island clock's hour, an optional colour grade, storm greying and haze.
  const SKIES = {
    l1a: { hour: 11, clouds: 0.22 }, l1b: { hour: 8.25, clouds: 0.36 },
    l2a: { hour: 17.45, clouds: 0.42 }, l2b: { hour: 17.95, tint: [1.06, 0.9, 1.04], clouds: 0.5 },
    l3a: { hour: 0.5 }, l3b: { hour: 0.5, tint: [0.92, 0.95, 1.12] },
    l4a: { hour: 16.5, storm: 0.72, fog: [70, 260], clouds: 0.95 }, l4b: { hour: 18.6, storm: 0.86, fog: [50, 200], clouds: 1 }
  };
  const XRAY_RADIUS = 60, XRAY_HAZE_RADIUS = 120;
  const sphere = (r, n = 8) => Array.from({ length: n + 1 }, (_, k) => [r * Math.sin(k / n * Math.PI), -r * Math.cos(k / n * Math.PI)]);
  const facing = (geo) => M.turnedX(geo, Math.PI / 2);

  // ---- set dressing -------------------------------------------------------------------------------------------
  const islet = M.variants((i) => {
    const rand = mulberry32(911 + i), r = 3 + rand() * 1.5, depth = 4.5 + rand() * 3;
    const rock = M.lathe({ profile: [[0.25, -depth], [r * 0.4, -depth * 0.62], [r * 0.78, -depth * 0.25], [r, -0.35], [r, 0]], segments: 7, color: "#8b6b4c" });
    const soil = M.lathe({ profile: [[r * 1.02, -0.5], [r * 1.02, -0.1]], segments: 7, color: "#6b4a2e" });
    const grass = M.lathe({ profile: [[r * 1.05, -0.12], [r * 0.95, 0.16], [0, 0.22]], segments: 7, color: "#73c24b" });
    const geo = M.merge(rock, soil, grass);
    geo.castShadow = false;
    return geo;
  });
  const curtain = M.variants((i) => {
    // A sheet in its own frame: x up its height (the hem wavy near 0), z across it, folds in y. The light beam fades
    // it up x; the ends taper so no straight edge shows.
    const g = M.geometry(), rows = 7, cols = 36, ids = [];
    const low = hexToRgb("#9affcc"), mid = hexToRgb(i ? "#6fd9c4" : "#33d49c"), high = hexToRgb(i ? "#c06bff" : "#2a9fd6"), split = i ? 0.22 : 0.35;
    for (let r = 0; r <= rows; r++) {
      const row = [], v = r / rows;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols, z = u - 0.5, taper = 1 - Math.pow(Math.abs(2 * z), 3);
        const hem = 0.1 * Math.sin(u * 9 + i * 2) + 0.05 * Math.sin(u * 23);
        row.push(M.pushVert(g, hem + v * (0.45 + 0.55 * taper), 0.22 * Math.sin(u * 7.5 + i) + 0.1 * Math.sin(u * 19 + v * 2), z));
      }
      ids.push(row);
    }
    for (let r = 0; r < rows; r++) {
      const t = r / rows, a = t < split ? low : mid, b = t < split ? mid : high, k = t < split ? t / split : (t - split) / (1 - split);
      const color = a.map((v, n) => Math.round(v + (b[n] - v) * k));
      for (let c = 0; c < cols; c++) M.face(g, [ids[r][c], ids[r][c + 1], ids[r + 1][c + 1], ids[r + 1][c]], color, { emissive: 1 });
    }
    g.glass = i ? 0.36 : 0.3; g.lightBeam = i ? 1.5 : 1.15; g.castShadow = false;
    return g;
  });
  const bolt = M.cached(() => {
    const g = M.geometry(), rand = mulberry32(4242), ink = hexToRgb("#f2ecff"), lit = { emissive: 1 }, w = 0.05;
    let x = 0, y = 1;
    const segment = (x0, y0, x1, y1, width) => {
      const a = M.pushVert(g, x0 - width, y0, 0), b = M.pushVert(g, x0 + width, y0, 0), c = M.pushVert(g, x1 + width, y1, 0), d = M.pushVert(g, x1 - width, y1, 0);
      const e = M.pushVert(g, x0, y0, -width), f = M.pushVert(g, x0, y0, width), h = M.pushVert(g, x1, y1, width), k = M.pushVert(g, x1, y1, -width);
      M.face(g, [a, b, c, d], ink, lit); M.face(g, [e, f, h, k], ink, lit);
    };
    while (y > 0) {
      const nx = x + (rand() - 0.5) * 0.16, ny = y - 0.05 - rand() * 0.06;
      segment(x, y, nx, Math.max(0, ny), w);
      if (rand() < 0.2) segment(nx, ny, nx + (rand() - 0.5) * 0.3, ny - 0.12, w * 0.5);
      x = nx; y = ny;
    }
    g.castShadow = false;
    return g;
  });
  const streak = M.cached(() => {
    const g = M.box({ w: 0.022, h: 0.9, d: 0.022, color: "#d6e6ff", emissive: 0.5 });
    g.glass = 0.45; g.castShadow = false;
    return g;
  });

  // ---- pickup candidates --------------------------------------------------------------------------------------
  const PICKUPS = {
    "pick-xray-a": ["X-ray A · seer eye", M.cached(() => M.merge(
      M.lathe({ profile: sphere(0.3, 10), segments: 14, color: "#f4efe2" }),
      M.moved(facing(M.lathe({ profile: [[0.18, 0], [0.17, 0.02], [0, 0.03]], segments: 14, color: "#39e2ff", emissive: 0.95 })), 0, 0, 0.27),
      M.moved(facing(M.lathe({ profile: [[0.075, 0], [0, 0.012]], segments: 10, color: "#10202a" })), 0, 0, 0.305),
      facing(M.torus(0.315, 0.065, "#7a644c", 0, 16, 6))))],
    "pick-xray-b": ["X-ray B · stone goggles", M.cached(() => M.merge(
      M.moved(facing(M.torus(0.17, 0.055, "#7d6a55", 0, 14, 6)), -0.21, 0, 0),
      M.moved(facing(M.torus(0.17, 0.055, "#7d6a55", 0, 14, 6)), 0.21, 0, 0),
      M.moved(facing(M.lathe({ profile: [[0.16, 0], [0.15, 0.02], [0, 0.03]], segments: 14, color: "#47e6ff", emissive: 0.85 })), -0.21, 0, 0.01),
      M.moved(facing(M.lathe({ profile: [[0.16, 0], [0.15, 0.02], [0, 0.03]], segments: 14, color: "#47e6ff", emissive: 0.85 })), 0.21, 0, 0.01),
      M.box({ w: 0.12, h: 0.06, d: 0.07, color: "#6b5844", offset: { y: 0.03 } }),
      M.moved(M.torus(0.36, 0.028, "#5a3b22", 0, 18, 5), 0, 0, -0.22)))],
    "pick-updraft-a": ["Updraft A · wind gourd", M.cached(() => {
      const parts = [M.lathe({ profile: [[0, -0.34], [0.2, -0.3], [0.27, -0.16], [0.21, 0], [0.12, 0.08], [0.16, 0.18], [0.11, 0.29], [0.055, 0.34], [0.055, 0.42], [0, 0.43]], segments: 12, color: "#d9a24a" }),
        M.box({ w: 0.1, h: 0.08, d: 0.1, color: "#6b4426", offset: { y: 0.44 } }),
        M.moved(M.turnedZ(M.torus(0.44, 0.016, "#f4fbff", 0.7, 22, 4), 0.35), 0, 0.02, 0)];
      for (let k = 0; k < 7; k++) {
        const a = k * 1.05, leaf = M.box({ w: 0.15, h: 0.025, d: 0.07, color: k % 2 ? "#79d46b" : "#5bb653", emissive: 0.15 });
        parts.push(M.moved(M.turnedY(M.turnedZ(leaf, 0.5), -a), Math.cos(a) * 0.4, -0.26 + k * 0.1, Math.sin(a) * 0.4));
      }
      return M.merge(...parts);
    })],
    "pick-updraft-b": ["Updraft B · sky feather", M.cached(() => {
      const parts = [M.box({ w: 0.035, h: 0.95, d: 0.035, color: "#e9e2cf" }), M.moved(M.turnedZ(M.torus(0.42, 0.016, "#f4fbff", 0.7, 22, 4), -0.3), 0, 0.05, 0)];
      for (let k = 0; k < 9; k++) {
        const y = -0.3 + k * 0.085, w = 0.24 * Math.sin(Math.PI * (k + 0.6) / 9.6), tip = k > 6;
        const color = tip ? "#3fd0c6" : k % 2 ? "#f6f4ee" : "#e4e9ef";
        parts.push(M.box({ w, h: 0.07, d: 0.02, color, emissive: tip ? 0.4 : 0.1, offset: { x: -w / 2 - 0.015, y: y + 0.012 } }));
        parts.push(M.box({ w, h: 0.07, d: 0.02, color, emissive: tip ? 0.4 : 0.1, offset: { x: w / 2 + 0.015, y } }));
      }
      return M.turnedZ(M.merge(...parts), 0.25);
    })],
    "pick-anchor-a": ["Anchor A · stone on a vine", M.cached(() => {
      const parts = [M.bevelBox({ w: 0.44, h: 0.38, d: 0.32, color: "#8f877a" }),
        M.box({ w: 0.47, h: 0.07, d: 0.35, color: "#6c655a", offset: { y: 0.04 } }),
        M.moved(facing(M.torus(0.12, 0.032, "#4f8a35", 0, 12, 5)), 0, 0.3, 0),
        M.box({ w: 0.035, h: 0.42, d: 0.035, color: "#4f8a35", offset: { y: 0.62 } })];
      for (let k = 0; k < 3; k++) parts.push(M.moved(M.turnedZ(M.box({ w: 0.12, h: 0.025, d: 0.07, color: "#6cc24f" }), k % 2 ? 0.5 : -0.5), k % 2 ? 0.07 : -0.07, 0.5 + k * 0.12, 0));
      return M.merge(...parts);
    })],
    "pick-anchor-b": ["Anchor B · bone anchor", M.cached(() => {
      const bone = "#efe6cf", knob = (x, y) => M.moved(M.lathe({ profile: sphere(0.055, 6), segments: 8, color: bone }), x, y, 0);
      const fluke = M.tube({ path: (t) => ({ x: Math.cos(Math.PI * (1 + t)) * 0.27, y: -0.33 + Math.sin(Math.PI * (1 + t)) * 0.2, z: 0 }), radius: () => 0.04, rings: 10, segments: 6, colorFn: () => bone });
      return M.merge(M.box({ w: 0.075, h: 0.72, d: 0.075, color: bone }), M.box({ w: 0.42, h: 0.06, d: 0.06, color: bone, offset: { y: 0.24 } }),
        knob(-0.22, 0.24), knob(0.22, 0.24), M.moved(facing(M.torus(0.085, 0.022, "#8a6a40", 0, 12, 5)), 0, 0.42, 0),
        fluke, knob(-0.27, -0.33), knob(0.27, -0.33));
    })]
  };

  const create = ({ root, camera, renderer, look }) => {
    const tokens = new Set(look.split(",").map(t => t.trim().toLowerCase()).filter(Boolean));
    const level = [...tokens].find(t => SKIES[t]) || null, sky = level ? SKIES[level] : null;
    const hourToken = [...tokens].find(t => /^h\d+(\.\d+)?$/.test(t));
    const xray = ["xray-a", "xray-b", "xray-c"].find(t => tokens.has(t)) || null;
    const select = ["select-a", "select-b"].find(t => tokens.has(t)) || null;
    const decor = createNode({ visible: false, sightHidden: true });
    addChild(root, decor);
    const rain = [], bolts = [], curtains = [], labels = [], screen = { x: 0, y: 0, depth: 0 }, edge = { x: 0, y: 0, depth: 0 };
    const nearIndex = new Int16Array(12), nearDistance = new Float32Array(12);
    let course = null, flash = 0, flashAt = 3, held = 0, time = 0, actor = null, skyOpts = null;
    const node = (geometry, x, y, z, s = 1, extra = {}) => {
      const n = createNode({ geometry, position: { x, y, z }, scale: { x: s, y: s, z: s }, sightHidden: true, ...extra });
      addChild(decor, n);
      return n;
    };
    const build = (built, start, finish, player) => {
      course = built; actor = player;
      const sx = start.x - finish.x, sz = start.z - finish.z, length = Math.hypot(sx, sz), nx = sx / length, nz = sz / length;
      const sideX = -nz, sideZ = nx, rand = mulberry32(77), shore = 42;
      const at = (along, across, y) => [finish.x + nx * along + sideX * across, y, finish.z + nz * along + sideZ * across];
      if (level?.startsWith("l1")) {
        for (let k = 0; k < 18; k++) {
          const t = (k + 0.5) / 18, along = shore + (length - shore) * t, routeY = start.y + (finish.y + 18 - start.y) * t;
          const side = k % 2 ? 1 : -1, far = k % 3 === 2;
          const [x, y, z] = at(along, side * (far ? 115 + rand() * 50 : 38 + rand() * 45), routeY - (far ? -4 + rand() * 12 : 16 + rand() * 30));
          const s = far ? 2.2 + rand() : 1.2 + rand() * 0.9, base = node(islet(k % 3), x, y, z, s);
          base.rotation.y = rand() * TAU;
          const tree = createNode({ geometry: BL.hubModels.tree(k % 3), position: { x: 0, y: 0.15, z: 0 }, scale: { x: 0.34, y: 0.34, z: 0.34 }, sightHidden: true });
          addChild(base, tree);
          if (k % 2) addChild(base, createNode({ geometry: BL.hubModels.bush(k % 3), position: { x: 1.6, y: 0.15, z: -0.8 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, sightHidden: true }));
        }
      }
      if (level?.startsWith("l2")) {
        const near = level === "l2b", count = near ? 10 : 9;
        for (let k = 0; k < count; k++) {
          let x, z;
          if (near) {
            const t = (k + 0.5) / count, side = k % 2 ? 1 : -1;
            [x, , z] = at(shore + (length - shore) * t, side * (170 + rand() * 90), 0);
          } else {
            const a = Math.atan2(-nz, -nx) + (k % 2 ? 1 : -1) * (0.2 + rand() * 1.1), r = 380 + rand() * 320;
            x = finish.x + Math.cos(a) * r; z = finish.z + Math.sin(a) * r;
          }
          const tower = createNode({ position: { x, y: -40 + rand() * 20, z }, sightHidden: true }), height = 150 + rand() * 120, width = 60 + rand() * 40;
          addChild(decor, tower);
          const puffs = 10;
          for (let j = 0; j < puffs; j++) {
            const f = j / (puffs - 1), anvil = j === puffs - 1 && rand() < 0.5, w = width * (anvil ? 1.5 : 1 - f * 0.55) * (0.8 + rand() * 0.4);
            const puff = BL.cloudHopperModels.cloud(w / 2, w * 0.38, anvil ? w * 0.22 : w * 0.7, "normal", rand() * TAU);
            const holder = createNode({ position: { x: (rand() - 0.5) * w * 0.45, y: height * f * 0.85 + w * 0.6, z: (rand() - 0.5) * w * 0.45 }, sightHidden: true });
            addChild(holder, puff); addChild(tower, holder);
          }
        }
      }
      if (level?.startsWith("l3")) {
        const violet = level === "l3b", ahead = Math.atan2(-nz, -nx);
        for (let k = 0; k < 6; k++) {
          const a = ahead + (k - 2.5) * 0.42 + (rand() - 0.5) * 0.2, r = 520 + rand() * 260;
          const c = node(curtain(violet ? 1 : 0), finish.x + Math.cos(a) * r, 70 + rand() * 60, finish.z + Math.sin(a) * r, 1);
          c.scale.x = 190 + rand() * 90; c.scale.y = 140; c.scale.z = 420 + rand() * 200;
          c.rotation.z = Math.PI / 2; c.rotation.y = -a; c.phase = rand() * TAU;
          curtains.push(c);
        }
      }
      if (level === "l3b" || level?.startsWith("l4")) {
        const ahead = Math.atan2(-nz, -nx);
        for (let k = 0; k < 2; k++) {
          const a = ahead + (k ? 0.55 : -0.8), r = level?.startsWith("l4") ? 170 + k * 60 : 650;
          const b = node(bolt(), finish.x + Math.cos(a) * r, -20, finish.z + Math.sin(a) * r, 1, { visible: false });
          b.scale.x = 90; b.scale.y = level?.startsWith("l4") ? 260 : 220; b.scale.z = 90; b.rotation.y = -a;
          bolts.push(b);
        }
      }
      if (level?.startsWith("l4") && renderer.kind === "webgl2") {
        for (let k = 0; k < 220; k++) {
          const r = node(streak(), 0, 0, 0, 1);
          r.seedX = rand() * 44; r.seedY = rand() * 30; r.seedZ = rand() * 44;
          rain.push(r);
        }
      }
      for (const [key, [name, geometry]] of Object.entries(PICKUPS)) if (tokens.has("pickups") || tokens.has(key.slice(0, -2))) {
        const holder = node(null, 0, 0, 0, 1.6), body = createNode({ geometry: geometry(), sightHidden: true });
        addChild(holder, body); holder.body = body; holder.label = name; holder.key = key; holder.cloud = -1;
        labels.push(holder);
      }
      decor.visible = true;
    };
    // Candidates stand side by side on one cloud, across the route, so a close camera sees both.
    const placePickups = (index, spread = 2.4) => {
      const c = course.clouds[index];
      for (let i = 0; i < labels.length; i++) {
        labels[i].cloud = index; labels[i].offset = (i - (labels.length - 1) / 2) * spread;
        labels[i].face = Math.atan2(c.x, c.z) + (i ? -0.45 : 0.45);
      }
    };

    // A still frame holds one flash and its bolts.
    const flashNow = (level = 0.55) => { held = level; };
    // Seconds of solid time the schedule leaves this cloud, from the course itself.
    const left = (i) => course.solidLeft(course.clouds[i]);
    const update = (dt, displayTime) => {
      if (!course) return;
      time += dt;
      for (const c of curtains) c.rotation.x = Math.sin(time * 0.25 + c.phase) * 0.04;
      if (bolts.length) {
        if (held) { flash = held; for (const b of bolts) b.visible = true; }
        else {
          if (time > flashAt) { flash = 1; flashAt = time + 5 + Math.random() * 6; for (const b of bolts) b.visible = Math.random() < 0.6; }
          flash = Math.max(0, flash - dt * 4);
          if (flash === 0) for (const b of bolts) b.visible = false;
        }
      }
      if (rain.length) {
        const p = camera.position;
        for (const r of rain) {
          // World-anchored streaks wrapped into a box round the eye, so turning never drags the rain along.
          r.position.x = p.x - 22 + ((r.seedX - p.x) % 44 + 44) % 44;
          r.position.z = p.z - 22 + ((r.seedZ - p.z) % 44 + 44) % 44;
          r.position.y = p.y + 14 - ((r.seedY + time * 26) % 30);
          r.rotation.z = 0.12;
        }
      }
      for (const holder of labels) {
        if (holder.cloud < 0) { holder.visible = false; continue; }
        const c = course.clouds[holder.cloud];
        const len = Math.hypot(c.x, c.z) || 1, offset = holder.offset || 0;
        holder.visible = true;
        holder.position.x = c.x - c.z / len * offset; holder.position.y = c.top + 1.1 + Math.sin(displayTime * 2 + holder.offset) * 0.08; holder.position.z = c.z + c.x / len * offset;
        holder.body.rotation.y = holder.face ?? displayTime * 0.8;
      }
    };
    const skyUpdate = (opts) => {
      if (!sky) return;
      const hour = hourToken ? Number(hourToken.slice(1)) : sky.hour;
      BL.daylight.sample(hour, opts, 80);
      const grade = (rgb, k) => {
        if (sky.tint) for (let i = 0; i < 3; i++) rgb[i] = Math.min(1, rgb[i] * sky.tint[i]);
        if (sky.storm) {
          const l = rgb[0] * 0.3 + rgb[1] * 0.55 + rgb[2] * 0.15;
          rgb[0] += (l * 0.62 - rgb[0]) * sky.storm; rgb[1] += (l * 0.68 - rgb[1]) * sky.storm; rgb[2] += (l * 0.8 - rgb[2]) * sky.storm;
        }
        if (flash) for (let i = 0; i < 3; i++) rgb[i] = Math.min(1, rgb[i] + flash * k);
      };
      grade(opts.horizon, 0.35); grade(opts.zenith, 0.25); grade(opts.clear, 0.35); grade(opts.sky, 0.3); grade(opts.ground, 0.15);
      if (sky.storm) { opts.directStrength *= 1 - 0.75 * sky.storm; for (let i = 0; i < 3; i++) opts.sun[i] *= 1 - 0.85 * sky.storm; }
      if (sky.fog) { opts.fog = opts.horizon; opts.fogNear = sky.fog[0]; opts.fogFar = sky.fog[1]; }
      opts.clouds = sky.clouds || 0; opts.seaFog = !!sky.fog; skyOpts = opts;
    };
    const ellipse = (c2, c, dash) => {
      c2.beginPath();
      let drawn = 0;
      for (let k = 0; k <= 20; k++) {
        const a = k / 20 * TAU, lx = Math.cos(a) * (c.rx + 0.2), lz = Math.sin(a) * (c.rz + 0.2);
        const p = renderer.project(c.x + lx * c.cosYaw + lz * c.sinYaw, c.top + 0.05, c.z - lx * c.sinYaw + lz * c.cosYaw, edge);
        if (!p) continue;
        if (drawn++) c2.lineTo(p.x, p.y); else c2.moveTo(p.x, p.y);
      }
      c2.setLineDash(dash); c2.stroke(); c2.setLineDash([]);
    };
    const { WARNING, FADING } = BL.cloudHopperCourse;
    const tone = (c, s) => s === Infinity ? "#ffd54a" : s <= 0 ? "#8aa0b8" : c.phase === WARNING || c.phase === FADING ? "#ff5a45"
      : s < 8 ? "#ffb23e" : "#5fe08a";
    const drawXray = (c2) => {
      const p = actor.root.position, haze = level?.startsWith("l4"), radius = haze ? XRAY_HAZE_RADIUS : XRAY_RADIUS;
      const cap = renderer.size.width < 600 ? 5 : 8;
      let count = 0;
      for (let i = 0; i < course.clouds.length; i++) {
        const c = course.clouds[i], d = Math.hypot(c.x - p.x, c.top - p.y, c.z - p.z);
        if (d > radius || d < 0.5) continue;
        let at = Math.min(count, cap);
        while (at > 0 && nearDistance[at - 1] > d) { if (at < cap) { nearIndex[at] = nearIndex[at - 1]; nearDistance[at] = nearDistance[at - 1]; } at--; }
        if (at < cap) { nearIndex[at] = i; nearDistance[at] = d; if (count < cap) count++; }
      }
      c2.save();
      // A thin cyan edge says the power is on.
      const { width, height } = renderer.size;
      c2.fillStyle = "rgba(64, 220, 255, 0.18)";
      c2.fillRect(0, 0, width, 6); c2.fillRect(0, height - 6, width, 6); c2.fillRect(0, 0, 6, height); c2.fillRect(width - 6, 0, 6, height);
      c2.textAlign = "center"; c2.textBaseline = "middle"; c2.lineJoin = "round";
      for (let n = 0; n < count; n++) {
        const i = nearIndex[n], c = course.clouds[i], s = left(i), color = tone(c, s);
        const q = renderer.project(c.x, c.top + 1.2, c.z, screen);
        if (!q) continue;
        const x = Math.round(q.x), y = Math.round(q.y), text = s === Infinity ? "∞" : s <= 0 ? `${Math.ceil(-s)}s` : s > 99 ? "99+" : String(Math.ceil(s));
        if (haze && nearDistance[n] > 70) { c2.strokeStyle = color; c2.lineWidth = 2; ellipse(c2, c, [6, 5]); }
        if (xray === "xray-a") {
          if (s === Infinity) {
            c2.beginPath(); c2.moveTo(x, y - 15); c2.lineTo(x + 15, y); c2.lineTo(x, y + 15); c2.lineTo(x - 15, y); c2.closePath();
            c2.fillStyle = "rgba(40, 28, 6, 0.8)"; c2.fill(); c2.strokeStyle = "#ffd54a"; c2.lineWidth = 3; c2.stroke();
            c2.font = "bold 16px ui-monospace, monospace"; c2.fillStyle = "#ffe27a"; c2.fillText("∞", x, y + 1);
          } else {
            c2.beginPath(); c2.arc(x, y, 13, 0, TAU); c2.fillStyle = "rgba(8, 18, 30, 0.72)"; c2.fill();
            c2.lineWidth = 4; c2.strokeStyle = "rgba(255,255,255,0.18)"; c2.stroke();
            if (s > 0) { c2.beginPath(); c2.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s / 20)); c2.strokeStyle = color; c2.stroke(); }
            else { c2.setLineDash([3, 3]); c2.beginPath(); c2.arc(x, y, 13, 0, TAU); c2.strokeStyle = color; c2.lineWidth = 2; c2.stroke(); c2.setLineDash([]); }
            c2.font = "bold 11px ui-monospace, monospace"; c2.fillStyle = s <= 0 ? "#b9c6d6" : "#ffffff"; c2.fillText(text, x, y + 0.5);
          }
        } else if (xray === "xray-b") {
          const label = s === Infinity ? "SOLID ∞" : s <= 0 ? `BACK ${text}` : `${text}s`;
          c2.font = "bold 12px ui-monospace, monospace";
          const w = Math.max(34, c2.measureText(label).width + 14);
          c2.fillStyle = s === Infinity ? "rgba(70, 50, 8, 0.88)" : "rgba(8, 18, 30, 0.78)";
          c2.beginPath(); c2.roundRect(x - w / 2, y - 11, w, 22, 11); c2.fill();
          c2.lineWidth = 2; c2.strokeStyle = color; c2.stroke();
          c2.fillStyle = s === Infinity ? "#ffe27a" : "#ffffff"; c2.fillText(label, x, y + 0.5);
          if (s > 0 && s !== Infinity) { c2.fillStyle = color; c2.fillRect(x - w / 2 + 6, y + 13, (w - 12) * Math.min(1, s / 20), 3); }
        } else {
          c2.strokeStyle = color; c2.lineWidth = s === Infinity ? 4 : 3;
          ellipse(c2, c, s <= 0 ? [6, 5] : []);
          if (s === Infinity) { c2.lineWidth = 1.5; c2.strokeStyle = "#fff3b0"; ellipse(c2, c, []); }
          c2.font = "bold 12px ui-monospace, monospace"; c2.lineWidth = 3; c2.strokeStyle = "rgba(10,14,20,0.9)";
          const label = s === Infinity ? "∞ SOLID" : s <= 0 ? `back ${text}` : `${text}s`;
          c2.strokeText(label, x, y); c2.fillStyle = color; c2.fillText(label, x, y);
        }
      }
      c2.restore();
    };
    const drawLabels = (c2) => {
      c2.save();
      c2.font = "bold 12px ui-monospace, monospace"; c2.textAlign = "center"; c2.textBaseline = "alphabetic";
      c2.lineWidth = 3; c2.lineJoin = "round"; c2.strokeStyle = "rgba(20, 14, 8, 0.9)"; c2.fillStyle = "#ffe49a";
      for (const holder of labels) {
        if (!holder.visible) continue;
        const q = renderer.project(holder.position.x, holder.position.y - 1.15, holder.position.z, screen);
        if (!q) continue;
        c2.strokeText(holder.label, q.x, q.y); c2.fillText(holder.label, q.x, q.y);
      }
      if (tokens.has("caption")) {
        const caption = [level && `Sky ${level.toUpperCase()}`, xray && `X-ray ${xray.slice(-1).toUpperCase()}`].filter(Boolean).join(" · ");
        if (caption) {
          c2.textAlign = "left"; c2.font = "bold 15px ui-monospace, monospace";
          c2.strokeText(caption, 18, renderer.size.height - 18); c2.fillText(caption, 18, renderer.size.height - 18);
        }
      }
      c2.restore();
    };
    const overlay = (c2) => {
      if (!course || !actor) return;
      if (xray) drawXray(c2);
      drawLabels(c2);
    };
    // The intro card's level choice, mocked in the card itself: rows after Rally's garage, or picture cards.
    let mock = null;
    const LEVELS = [["Bluebird Hop", "340 m", "Best 01:08.42", 0], ["Amber Spires", "483 m", "New", 0], ["Aurora Heights", "686 m", "Complete Level 2 to unlock", 1], ["Thunderhead", "974 m", "Complete Level 3 to unlock", 1]];
    const intro = (on) => {
      if (!select) return;
      const panel = document.querySelector(".cloud-hopper-panel");
      if (!on || !panel) { mock?.remove(); mock = null; return; }
      if (mock) return;
      const thumbs = window.__hopperThumbs || [], art = panel.querySelector(".cloud-hopper-intro-art");
      if (art) art.hidden = true;
      mock = document.createElement("div");
      const cards = select === "select-b";
      Object.assign(mock.style, cards
        ? { display: "grid", gridTemplateColumns: window.innerWidth < 600 ? "1fr 1fr" : "repeat(4, 1fr)", gap: "10px", margin: "10px 0" }
        : { display: "flex", flexDirection: "column", gap: "6px", margin: "10px 0", textAlign: "left" });
      LEVELS.forEach(([name, distance, status, locked], i) => {
        const item = document.createElement("button"), picture = document.createElement("img"), title = document.createElement("b"), note = document.createElement("small");
        item.type = "button";
        picture.src = thumbs[i] || ""; picture.alt = "";
        // Cards carry the level's number in the picture's corner and the name alone on one row.
        title.textContent = cards ? name : `${i + 1} · ${name}`; note.textContent = locked ? `🔒 ${status}` : `${distance} · ${status}`;
        const selected = i === 1;
        Object.assign(item.style, { position: "relative", display: "flex", gap: "10px", alignItems: "center", padding: cards ? "0" : "6px 10px 6px 6px", borderRadius: "8px",
          border: selected ? "3px solid #ffd54a" : "2px solid rgba(255,255,255,0.18)", background: selected ? "rgba(255, 213, 74, 0.14)" : "rgba(10, 16, 26, 0.55)",
          color: "#fff6dc", cursor: locked ? "default" : "pointer", overflow: "hidden", flexDirection: cards ? "column" : "row", font: "inherit" });
        Object.assign(picture.style, cards ? { width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block", filter: locked ? "grayscale(0.7) brightness(0.55)" : "none" }
          : { width: "112px", height: "63px", objectFit: "cover", borderRadius: "5px", flex: "none", filter: locked ? "grayscale(0.7) brightness(0.55)" : "none" });
        Object.assign(title.style, { display: "block", fontSize: "13px", letterSpacing: "0.04em", whiteSpace: cards ? "nowrap" : "normal" });
        Object.assign(note.style, { display: "block", fontSize: "11px", opacity: "0.85", marginTop: "2px", whiteSpace: "normal" });
        const text = document.createElement("span");
        Object.assign(text.style, cards ? { padding: "6px 8px 8px", textAlign: "left", width: "100%" } : { flex: "1" });
        text.append(title, note);
        item.append(picture, text);
        if (cards) {
          const number = document.createElement("span");
          number.textContent = String(i + 1);
          Object.assign(number.style, { position: "absolute", top: "6px", left: "6px", minWidth: "26px", height: "26px", padding: "0 6px", borderRadius: "6px",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "800",
            background: "rgba(20, 14, 8, 0.85)", color: locked ? "#cbb894" : "#ffd54a", border: `2px solid ${selected ? "#ffd54a" : "rgba(255, 246, 220, 0.45)"}` });
          item.append(number);
        }
        mock.append(item);
      });
      const help = panel.querySelector(".game-intro-who");
      panel.insertBefore(mock, help);
    };
    const clear = () => {
      for (const n of [...decor.children]) removeChild(decor, n);
      rain.length = bolts.length = curtains.length = labels.length = 0;
      decor.visible = false; course = actor = null; held = 0;
      if (skyOpts) skyOpts.seaFog = false;
    };
    const liveGeometry = (set) => BL.scene.traverseVisible(decor, (n) => { if (n.geometry) set.add(n.geometry); });
    const dispose = () => { clear(); intro(false); removeChild(root, decor); };
    return { build, update, sky: skyUpdate, overlay, intro, clear, dispose, liveGeometry, placePickups, flashNow, tokens };
  };
  BL.cloudHopperLooks = { create, SKIES };
})();
