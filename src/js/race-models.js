// Race props: mounts, gantry, pickups, spectators and themed decor, one cached geometry per builder
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb, mulberry32 } = BL.math;
  const { createNode, addChild } = BL.scene;
  const { box, lathe, merge, voxelFaces } = BL.models;
  const cached = (build) => {
    let value = null;
    return () => value || (value = build());
  };
  const variants = (build) => {
    const cache = [];
    return (i = 0) => cache[i] || (cache[i] = build(i));
  };
  const keyed = (build) => {
    const cache = new Map();
    return (key) => {
      let value = cache.get(key);
      if (!value) cache.set(key, value = build(key));
      return value;
    };
  };
  const vox = () => {
    const map = new Map();
    const key = (x, y, z) => x + "," + y + "," + z;
    return {
      map,
      has: (x, y, z) => map.has(key(x, y, z)),
      set: (x, y, z, c) => map.set(key(x, y, z), c),
      del: (x, y, z) => map.delete(key(x, y, z)),
      fill(x0, x1, y0, y1, z0, z1, c) {
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          const value = typeof c === "function" ? c(x, y, z) : c;
          if (value != null) map.set(key(x, y, z), value);
        }
      }
    };
  };
  const voxGeo = (v, { unit, palette, origin = { x: 0, y: 0, z: 0 }, emissive = {} }) => {
    const geo = { verts: [], faces: [], lines: [] };
    const rgb = palette.map((c) => typeof c === "string" ? hexToRgb(c) : c);
    const emit = (pts, c) => {
      const i = pts.map(([x, y, z]) => {
        geo.verts.push(origin.x + x * unit, origin.y + y * unit, origin.z + z * unit);
        return geo.verts.length / 3 - 1;
      });
      geo.faces.push({ i, color: rgb[c], emissive: emissive[c] || 0 });
    };
    voxelFaces((fn) => {
      for (const [k, c] of v.map) {
        const [x, y, z] = k.split(",").map(Number);
        fn(x, y, z, c);
      }
    }, v.has, emit);
    return geo;
  };
  // Cyclic axis swap y -> x, a proper rotation, so winding holds
  const yToX = (geo) => {
    const p = geo.verts;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = y;
      p[i + 1] = z;
      p[i + 2] = x;
    }
    return geo;
  };
  const yToZ = (geo) => {
    const p = geo.verts;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      p[i] = z;
      p[i + 1] = x;
      p[i + 2] = y;
    }
    return geo;
  };
  const shift = (geo, dx, dy, dz) => {
    const p = geo.verts;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += dx;
      p[i + 1] += dy;
      p[i + 2] += dz;
    }
    return geo;
  };
  const turn = (geo, yaw, roll = 0, pitch = 0) => {
    const p = geo.verts;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let i = 0; i < p.length; i += 3) {
      let x = p[i], y = p[i + 1], z = p[i + 2];
      let y1 = y * cp - z * sp, z1 = y * sp + z * cp;
      y = y1;
      z = z1;
      const x2 = x * cr - y * sr;
      y1 = x * sr + y * cr;
      x = x2;
      y = y1;
      p[i] = x * cy + z * sy;
      p[i + 1] = y;
      p[i + 2] = z * cy - x * sy;
    }
    return geo;
  };
  const noShadow = (geo) => {
    geo.castShadow = false;
    return geo;
  };
  // A jet of fire pointing down -z, shown behind a boosting racer
  const boostFlame = cached(() => noShadow(yToZ(merge(
    lathe({ profile: [[0.22, 0], [0.3, -0.35], [0.16, -0.9], [0, -1.4]], segments: 7, color: (t) => t < 0.4 ? "#ffb13b" : "#ff6a1e", emissive: 1 }),
    lathe({ profile: [[0.1, 0.02], [0.14, -0.3], [0.06, -0.7], [0, -0.95]], segments: 6, color: "#fff0b0", emissive: 1 })
  ))));
  const WOOD = "#8a6236", WOOD_DK = "#5c4425", PLANK = "#a9773f", STONE = ["#7a716a", "#6b625a", "#57504a"];

  // ---------- mounts ----------
  // A log chassis on stone wheels, the seat a hollow in the log, a stick to steer by
  const KART = { length: 1.7, width: 1.1, wheelR: 0.3, wheelX: 0.58, wheelZ: 0.58, seatY: 0.42 };
  const kartChassis = cached(() => merge(
    box({ w: 0.78, h: 0.42, d: KART.length, color: WOOD, offset: { y: 0.42 } }),
    box({ w: 0.6, h: 0.44, d: 0.2, color: WOOD_DK, offset: { y: 0.42, z: KART.length / 2 - 0.02 } }),
    box({ w: 0.6, h: 0.44, d: 0.2, color: WOOD_DK, offset: { y: 0.42, z: -KART.length / 2 + 0.02 } }),
    box({ w: 0.9, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.34, z: 0.55 } }),
    box({ w: 0.9, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.34, z: -0.55 } }),
    box({ w: 1.16, h: 0.08, d: 0.08, color: "#3a3a3a", offset: { y: KART.wheelR, z: KART.wheelZ } }),
    box({ w: 1.16, h: 0.08, d: 0.08, color: "#3a3a3a", offset: { y: KART.wheelR, z: -KART.wheelZ } }),
    box({ w: 0.5, h: 0.1, d: 0.5, color: "#4a3319", offset: { y: 0.55, z: -0.15 } }),
    box({ w: 0.36, h: 0.3, d: 0.08, color: "#4a3319", offset: { y: 0.75, z: -0.42 } }),
    box({ w: 0.06, h: 0.42, d: 0.06, color: "#3a2a18", offset: { y: 0.82, z: 0.32 } }),
    box({ w: 0.3, h: 0.06, d: 0.06, color: "#3a2a18", offset: { y: 1.03, z: 0.32 } }),
    box({ w: 0.7, h: 0.16, d: 0.3, color: "#7a5630", offset: { y: 0.68, z: 0.66 } }),
    // Rope bindings round the log, a stone engine block up front with a hot vent, twin bone exhausts behind
    ...[-0.5, 0.1, 0.45].map((z) => box({ w: 0.84, h: 0.08, d: 0.1, color: "#3a2a18", offset: { y: 0.42, z } })),
    box({ w: 0.5, h: 0.3, d: 0.34, color: "#6b625a", offset: { y: 0.78, z: 0.62 } }),
    box({ w: 0.16, h: 0.08, d: 0.16, color: "#ff8a2a", emissive: 0.8, offset: { y: 0.95, z: 0.62 } }),
    ...[-0.22, 0.22].map((x) => box({ w: 0.1, h: 0.1, d: 0.34, color: "#e8e2d2", offset: { x, y: 0.5, z: -0.98 } }))
  ));
  const kartWheel = cached(() => yToX(merge(
    lathe({ profile: [[0, -0.11], [0.2, -0.11], [KART.wheelR, -0.09], [KART.wheelR, 0.09], [0.2, 0.11], [0, 0.11]], segments: 10, color: (t) => t < 0.2 || t > 0.8 ? "#5b544d" : "#7a716a" }),
    lathe({ profile: [[0, -0.125], [0.08, -0.125], [0.08, 0.125], [0, 0.125]], segments: 6, color: "#3a2a18" })
  )));
  // A pennant on a pole behind the seat, in the rider's colour
  const kartPennant = keyed((color) => merge(
    box({ w: 0.04, h: 1.3, d: 0.04, color: "#3a2a18", offset: { x: -0.36, y: 0.65, z: -0.7 } }),
    box({ w: 0.02, h: 0.28, d: 0.42, color, emissive: 0.15, offset: { x: -0.36, y: 1.16, z: -0.5 } }),
    box({ w: 0.02, h: 0.14, d: 0.22, color, emissive: 0.15, offset: { x: -0.36, y: 1.09, z: -0.18 } })
  ));
  const kart = (color) => {
    const node = createNode();
    const chassis = createNode({ geometry: kartChassis() });
    const pennant = createNode({ geometry: kartPennant(color) });
    const wheels = [];
    for (const [x, z] of [[-KART.wheelX, KART.wheelZ], [KART.wheelX, KART.wheelZ], [-KART.wheelX, -KART.wheelZ], [KART.wheelX, -KART.wheelZ]]) {
      const wheel = createNode({ position: { x, y: KART.wheelR, z }, geometry: kartWheel() });
      wheels.push(wheel);
      addChild(node, wheel);
    }
    addChild(node, chassis, pennant);
    return { node, wheels, seatY: KART.seatY, seatZ: -0.15 };
  };
  // A raptor: body, swinging tail, bobbing neck and head, two striding legs, a saddle
  const DINO_UNIT = 0.085;
  // Three hides shared across the field, so every dino part is one instanced draw per hide
  const DINO_HIDES = [["#4f8a3d", "#3d6b2f", "#a8d27a"], ["#d1762e", "#a35a22", "#f2c27a"], ["#4a78b8", "#365a8c", "#a7c4ec"]];
  const dinoParts = keyed((hide) => {
    const [base, dark, belly] = DINO_HIDES[hide % DINO_HIDES.length];
    const rand = mulberry32(400 + hide);
    const P = [base, dark, belly, "#f2efe4", "#141414", "#5c4425", "#8a6236", "#e8e2d2"];
    const skin = () => rand() < 0.2 ? 1 : 0;
    // Body: a deep chest, a pale belly, hips wide enough to meet the thighs, a ridge of plates
    const body = vox();
    body.fill(-3, 3, 0, 6, -5, 5, skin);
    body.fill(-4, 4, 1, 4, -3, 1, skin);
    body.fill(-2, 2, 0, 1, -4, 4, 2);
    body.fill(-3, 3, 4, 5, 6, 8, skin);
    body.fill(-2, 2, 7, 7, 6, 8, skin);
    body.fill(-2, 2, 6, 6, 6, 8, 2);
    for (const z of [-5, -3, 4]) body.fill(0, 0, 7, 8, z, z, 1);
    // Saddle, girth and a horn to hold
    body.fill(-3, 3, 7, 7, -2, 2, 5);
    body.fill(-4, 4, 7, 7, -1, 1, 5);
    body.fill(-4, 4, 3, 6, 0, 0, 6);
    body.fill(0, 0, 8, 9, 2, 2, 5);
    // Tail: thick at the hips, tapering and drooping to a tip
    const tail = vox();
    tail.fill(-2, 2, 0, 3, -3, 0, skin);
    tail.fill(-1, 1, 1, 3, -6, -4, skin);
    tail.fill(-1, 1, 1, 2, -9, -7, skin);
    tail.fill(0, 0, 0, 1, -12, -10, skin);
    tail.set(0, 0, -13, 1);
    // Neck and head: a jaw, eye whites with pupils, teeth, nostrils
    const neck = vox();
    neck.fill(-1, 1, 0, 5, -1, 1, skin);
    neck.fill(-2, 2, 5, 9, -2, 4, skin);
    neck.fill(-2, 2, 5, 7, 5, 6, skin);
    neck.fill(-1, 1, 4, 4, 1, 6, skin);
    neck.fill(-2, 2, 6, 6, 5, 6, 3);
    neck.fill(-1, 1, 5, 5, 3, 6, 4);
    for (const x of [-1, 0, 1]) neck.set(x, 5, 6, 7);
    for (const x of [-2, 2]) {
      neck.set(x, 8, 2, 3);
      neck.set(x, 8, 3, 4);
    }
    neck.set(-1, 7, 6, 4);
    neck.set(1, 7, 6, 4);
    neck.set(0, 10, -1, 1);
    neck.set(0, 10, 0, 1);
    // Leg: thigh at the hip, shin, a clawed foot; the origin is the hip so a swing keeps it attached
    const leg = vox();
    leg.fill(-1, 1, -4, 0, -1, 2, skin);
    leg.fill(-1, 1, -3, -1, -2, -2, 1);
    leg.fill(-1, 0, -7, -4, -1, 1, skin);
    leg.fill(-1, 0, -8, -8, -1, 3, 3);
    leg.set(-1, -8, 4, 7);
    leg.set(0, -8, 4, 7);
    const arm = vox();
    arm.fill(0, 0, 0, 2, 0, 0, skin);
    arm.set(0, 0, 1, 3);
    const opts = { unit: DINO_UNIT, palette: P };
    return {
      body: voxGeo(body, { ...opts, origin: { x: -3.5 * DINO_UNIT, y: 0, z: -5.5 * DINO_UNIT } }),
      tail: voxGeo(tail, { ...opts, origin: { x: -2.5 * DINO_UNIT, y: -2 * DINO_UNIT, z: 0 } }),
      neck: voxGeo(neck, { ...opts, origin: { x: -2.5 * DINO_UNIT, y: 0, z: -2 * DINO_UNIT } }),
      leg: voxGeo(leg, { ...opts, origin: { x: -1.5 * DINO_UNIT, y: 0, z: -1.5 * DINO_UNIT } }),
      arm: voxGeo(arm, { ...opts, origin: { x: -0.5 * DINO_UNIT, y: -2 * DINO_UNIT, z: -0.5 * DINO_UNIT } })
    };
  });
  const dino = (hide) => {
    const g = dinoParts(hide), u = DINO_UNIT;
    const node = createNode();
    const hips = createNode({ position: { x: 0, y: 8 * u, z: 0 } });
    const body = createNode({ geometry: g.body });
    const tail = createNode({ position: { x: 0, y: 2 * u, z: -5 * u }, geometry: g.tail });
    const neck = createNode({ position: { x: 0, y: 5 * u, z: 7 * u }, rotation: { x: -0.35, y: 0, z: 0 }, geometry: g.neck });
    // Legs hang from the hips inside the body's width, feet on the ground
    const legL = createNode({ position: { x: -2.5 * u, y: 8 * u, z: -0.5 * u }, geometry: g.leg });
    const legR = createNode({ position: { x: 2.5 * u, y: 8 * u, z: -0.5 * u }, geometry: g.leg });
    const armL = createNode({ position: { x: -3 * u, y: 3 * u, z: 5 * u }, rotation: { x: 0.6, y: 0, z: 0 }, geometry: g.arm });
    const armR = createNode({ position: { x: 3 * u, y: 3 * u, z: 5 * u }, rotation: { x: 0.6, y: 0, z: 0 }, geometry: g.arm });
    addChild(hips, body, tail, neck, armL, armR);
    addChild(node, hips, legL, legR);
    return { node, hips, tail, neck, legL, legR, seatY: 17 * u, seatZ: 0 };
  };

  // ---------- track furniture ----------
  // Two stone pillars carrying a wooden beam, three lamps under it for the countdown
  const GANTRY = { span: 16, height: 5 };
  const gantry = cached(() => {
    const rand = mulberry32(77);
    const stone = () => STONE[rand() < 0.3 ? 2 : rand() < 0.5 ? 1 : 0];
    const parts = [];
    for (const side of [-1, 1]) {
      for (let y = 0; y < GANTRY.height; y += 0.5) parts.push(box({ w: 0.9 + (rand() - 0.5) * 0.12, h: 0.5, d: 0.9 + (rand() - 0.5) * 0.12, color: stone(), offset: { x: side * GANTRY.span / 2, y: y + 0.25 } }));
      parts.push(box({ w: 1.2, h: 0.3, d: 1.2, color: "#57504a", offset: { x: side * GANTRY.span / 2, y: GANTRY.height + 0.15 } }));
    }
    parts.push(box({ w: GANTRY.span + 1.4, h: 0.5, d: 0.5, color: WOOD_DK, offset: { y: GANTRY.height + 0.55 } }));
    parts.push(box({ w: GANTRY.span - 1, h: 0.14, d: 0.6, color: PLANK, offset: { y: GANTRY.height + 0.87 } }));
    // A row of pennants under the beam
    const colors = ["#f5c542", "#e04a3a", "#22c55e", "#f3efe4"];
    for (let x = -GANTRY.span / 2 + 0.9; x < GANTRY.span / 2 - 0.6; x += 0.62) {
      parts.push(box({ w: 0.4, h: 0.32, d: 0.03, color: colors[Math.floor(rand() * colors.length)], emissive: 0.1, offset: { x, y: GANTRY.height + 0.14, z: 0.32 } }));
      parts.push(box({ w: 0.2, h: 0.2, d: 0.03, color: colors[Math.floor(rand() * colors.length)], emissive: 0.1, offset: { x, y: GANTRY.height - 0.12, z: 0.32 } }));
    }
    return merge(...parts);
  });
  const gantryLamp = cached(() => merge(
    box({ w: 0.34, h: 0.12, d: 0.34, color: "#3a2a18", offset: { y: -0.06 } }),
    box({ w: 0.26, h: 0.3, d: 0.26, color: "#ffb13b", emissive: 1, offset: { y: -0.27 } })
  ));
  const gantryLampY = GANTRY.height + 0.3;
  // A flat plank with a chevron of emissive stripes pointing along +z
  const boostPad = cached(() => noShadow(merge(
    box({ w: 2.2, h: 0.06, d: 2.6, color: "#2b2521", offset: { y: 0.03 } }),
    ...[-0.8, 0, 0.8].map((z) => merge(
      turn(box({ w: 0.2, h: 0.03, d: 1.1, color: "#ffb13b", emissive: 1, offset: { x: -0.4, y: 0.075, z: z - 0.3 } }), 0.6),
      turn(box({ w: 0.2, h: 0.03, d: 1.1, color: "#ffb13b", emissive: 1, offset: { x: 0.4, y: 0.075, z: z - 0.3 } }), -0.6)
    ))
  )));
  const itemCrate = cached(() => merge(
    box({ w: 0.8, h: 0.8, d: 0.8, color: PLANK, offset: { y: 0.4 } }),
    ...[[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].map(([x, z]) => box({ w: 0.1, h: 0.84, d: 0.1, color: WOOD_DK, offset: { x, y: 0.42, z } })),
    box({ w: 0.84, h: 0.1, d: 0.84, color: WOOD_DK, offset: { y: 0.8 } }),
    box({ w: 0.36, h: 0.36, d: 0.02, color: "#ffb13b", emissive: 0.9, offset: { y: 0.42, z: 0.41 } }),
    box({ w: 0.36, h: 0.36, d: 0.02, color: "#ffb13b", emissive: 0.9, offset: { y: 0.42, z: -0.41 } }),
    box({ w: 0.02, h: 0.36, d: 0.36, color: "#ffb13b", emissive: 0.9, offset: { x: 0.41, y: 0.42 } }),
    box({ w: 0.02, h: 0.36, d: 0.36, color: "#ffb13b", emissive: 0.9, offset: { x: -0.41, y: 0.42 } })
  ));
  const rockShot = cached(() => {
    const rand = mulberry32(19);
    const v = vox();
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) if (x * x + y * y + z * z <= 5.5 && rand() > 0.12) v.set(x, y, z, rand() < 0.3 ? 1 : 0);
    return voxGeo(v, { unit: 0.09, palette: ["#6b625a", "#57504a"], origin: { x: -0.045, y: -0.045, z: -0.045 } });
  });
  // A dropped peel, four petals flat on the road
  const peel = cached(() => noShadow(merge(
    box({ w: 0.24, h: 0.06, d: 0.24, color: "#e0b53a", offset: { y: 0.04 } }),
    ...[0, 1, 2, 3].map((i) => turn(box({ w: 0.2, h: 0.04, d: 0.5, color: "#f5c542", offset: { y: 0.05, z: 0.32 } }), i * Math.PI / 2 + 0.4))
  )));
  const boulder = cached(() => {
    const rand = mulberry32(311);
    const v = vox();
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) for (let z = -5; z <= 5; z++) if (x * x + y * y + z * z <= 28 && !(x * x + y * y + z * z > 22 && rand() < 0.3)) v.set(x, y, z, rand() < 0.25 ? 1 : 0);
    return voxGeo(v, { unit: 0.16, palette: ["#5e5449", "#45403a"], origin: { x: -0.08, y: -0.08, z: -0.08 } });
  });
  // A stand full of oogas, each instance one small figure with its arms up
  const spectator = variants((i) => {
    const skins = ["#c98a5b", "#a9744c", "#d9a06b"], furs = ["#d98a2e", "#c98936", "#e09a40"];
    const v = vox();
    v.fill(-1, 1, 0, 2, -1, 0, 0);
    v.fill(-2, 2, 3, 5, -1, 1, 1);
    v.fill(-1, 1, 6, 8, -1, 1, 0);
    v.fill(-2, 2, 8, 9, -2, 1, 2);
    v.set(-3, 4, 0, 0);
    v.set(3, 4, 0, 0);
    v.fill(-3, -3, 5, 8, 0, 0, 0);
    v.fill(3, 3, 5, 8, 0, 0, 0);
    return noShadow(voxGeo(v, { unit: 0.075, palette: [skins[i % 3], furs[i % 3], "#2b1b10"], origin: { x: 0, y: 0, z: 0 } }));
  });
  const banner = keyed((color) => merge(
    box({ w: 0.12, h: 3.2, d: 0.12, color: "#3a2a18", offset: { y: 1.6 } }),
    box({ w: 0.04, h: 1.4, d: 0.9, color, emissive: 0.1, offset: { y: 2.3, z: 0.5 } }),
    box({ w: 0.04, h: 0.5, d: 0.5, color, emissive: 0.1, offset: { y: 1.45, z: 0.3 } })
  ));
  const torchStand = cached(() => {
    const geo = merge(
      box({ w: 0.5, h: 0.3, d: 0.5, color: "#57504a", offset: { y: 0.15 } }),
      box({ w: 0.14, h: 1.6, d: 0.14, color: WOOD_DK, offset: { y: 1.1 } }),
      box({ w: 0.26, h: 0.16, d: 0.26, color: "#3a2a18", offset: { y: 1.96 } })
    );
    geo.flameY = 2.2;
    return geo;
  });
  const torchFlame = cached(() => noShadow(box({ w: 0.28, h: 0.3, d: 0.28, color: "#ffb13b", emissive: 1 })));

  // ---------- themed decor ----------
  // A leaning trunk of stacked rings under six drooping fronds
  const palm = variants((i) => {
    const rand = mulberry32(500 + i);
    const parts = [];
    const lean = (rand() - 0.5) * 0.5, h = 3.6 + rand() * 1.4, rings = 9;
    let x = 0, z = 0;
    for (let n = 0; n < rings; n++) {
      const t = n / rings;
      x += Math.sin(lean) * (h / rings) * t;
      parts.push(box({ w: 0.42 - t * 0.14, h: h / rings + 0.04, d: 0.42 - t * 0.14, color: n % 2 ? "#7a5a3a" : "#6a4c2e", offset: { x, y: (n + 0.5) * (h / rings), z } }));
    }
    const top = { x: x + Math.sin(lean) * 0.2, y: h + 0.1, z };
    // A drooping outer ring of long fronds, a raised inner ring, and a tuft on top
    for (let f = 0; f < 7; f++) {
      const a = f / 7 * Math.PI * 2 + rand() * 0.4;
      for (let s = 0; s < 5; s++) {
        const r = 0.3 + s * 0.5, droop = s * s * 0.12;
        parts.push(turn(box({ w: 0.6 - s * 0.09, h: 0.06, d: 0.58, color: s % 2 ? "#4f9a3d" : "#3e7a2c", offset: { z: r, y: -droop } }), a, 0, 0.1 + s * 0.12));
        if (s > 0 && s < 4) parts.push(turn(box({ w: 0.9 - s * 0.12, h: 0.04, d: 0.34, color: s % 2 ? "#3e7a2c" : "#5aa845", offset: { z: r + 0.1, y: -droop - 0.02 } }), a, 0, 0.1 + s * 0.12));
      }
    }
    for (let f = 0; f < 5; f++) {
      const a = f / 5 * Math.PI * 2 + 0.3 + rand() * 0.4;
      for (let s = 0; s < 3; s++) {
        const r = 0.25 + s * 0.45;
        parts.push(turn(box({ w: 0.5 - s * 0.1, h: 0.05, d: 0.5, color: s % 2 ? "#5aa845" : "#4f9a3d", offset: { z: r, y: 0.25 + s * 0.12 - s * s * 0.1 } }), a, 0, -0.2 + s * 0.14));
      }
    }
    parts.push(box({ w: 0.42, h: 0.5, d: 0.42, color: "#5aa845", offset: { y: 0.25 } }));
    for (const [cx, cz] of [[0.2, 0.1], [-0.15, 0.2], [0.05, -0.2]]) parts.push(box({ w: 0.22, h: 0.22, d: 0.22, color: "#5c4425", offset: { x: cx, y: -0.2, z: cz } }));
    return merge(...parts.slice(0, rings), ...parts.slice(rings).map((g) => shift(g, top.x, top.y, top.z)));
  });
  const lagoonRock = variants((i) => {
    const rand = mulberry32(600 + i);
    const v = vox();
    const rx = 3 + i, ry = 2 + i * 0.5, rz = 2.5 + i;
    for (let x = -rx; x <= rx; x++) for (let y = 0; y <= ry; y++) for (let z = -rz; z <= rz; z++) {
      const d = (x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2;
      if (d <= 1 && !(d > 0.7 && rand() < 0.3)) v.set(x, y, z, rand() < 0.25 ? 1 : 0);
    }
    return voxGeo(v, { unit: 0.3, palette: ["#8d857b", "#6f6860"], origin: { x: -0.15, y: 0, z: -0.15 } });
  });
  // Black rock with glowing seams, the gorge's boulders and spikes
  const lavaRock = variants((i) => {
    const rand = mulberry32(700 + i);
    const v = vox();
    const r = 2 + i;
    for (let x = -r; x <= r; x++) for (let y = 0; y <= r + 1; y++) for (let z = -r; z <= r; z++) {
      const d = (x * x + z * z) / (r * r) + (y / (r + 1)) ** 2;
      if (d <= 1 && !(d > 0.6 && rand() < 0.35)) v.set(x, y, z, rand() < 0.08 ? 2 : rand() < 0.3 ? 1 : 0);
    }
    return voxGeo(v, { unit: 0.32, palette: ["#2b2724", "#1c1917", "#ff6a1e"], origin: { x: -0.16, y: 0, z: -0.16 }, emissive: { 2: 1 } });
  });
  const obsidianSpike = variants((i) => {
    const h = 2.4 + i * 1.2;
    return merge(
      box({ w: 0.9, h: 0.5, d: 0.9, color: "#1c1917", offset: { y: 0.25 } }),
      turn(lathe({ profile: [[0.5, 0.3], [0.32, h * 0.5], [0.12, h * 0.85], [0, h]], segments: 5, color: (t) => t < 0.4 ? "#2b2724" : "#3a3330" }), i * 0.7),
      box({ w: 0.12, h: h * 0.5, d: 0.12, color: "#ff6a1e", emissive: 1, offset: { x: 0.24, y: h * 0.35 } })
    );
  });
  const bones = cached(() => merge(
    turn(box({ w: 0.16, h: 0.16, d: 1.6, color: "#e8e2d2", offset: { y: 0.08 } }), 0.3),
    turn(box({ w: 0.16, h: 0.16, d: 1.3, color: "#d9d2c0", offset: { x: 0.5, y: 0.08, z: 0.3 } }), -0.8),
    shift(lathe({ profile: [[0, 0], [0.42, 0.05], [0.5, 0.4], [0.3, 0.72], [0, 0.78]], segments: 8, color: "#e8e2d2" }), -0.6, 0, -0.5)
  ));
  // A snowy pine: a dark trunk under three tiers of green with white caps
  const pine = variants((i) => {
    const rand = mulberry32(800 + i);
    const h = 3.6 + rand() * 1.8, parts = [box({ w: 0.36, h: h * 0.4, d: 0.36, color: "#4e361f", offset: { y: h * 0.2 } })];
    for (let t = 0; t < 4; t++) {
      const y = h * (0.24 + t * 0.19), r = 1.7 - t * 0.35;
      parts.push(shift(turn(lathe({ profile: [[r, 0], [r * 0.55, h * 0.1], [r * 0.15, h * 0.22], [0, h * 0.25]], segments: 8, color: (k) => k < 0.4 ? "#2f6b3a" : k < 0.7 ? "#3a7a44" : "#3f8248" }), t * 0.4), 0, y, 0));
      parts.push(shift(turn(lathe({ profile: [[r * 0.85, h * 0.04], [r * 0.4, h * 0.14], [0, h * 0.2]], segments: 8, color: (k) => k < 0.5 ? "#3f8248" : "#4d9455" }), t * 0.4 + 0.4), 0.15, y + 0.05, -0.1));
      parts.push(shift(turn(lathe({ profile: [[r * 0.6, h * 0.1], [r * 0.15, h * 0.22], [0, h * 0.255]], segments: 8, color: "#eef3f7" }), t * 0.4), 0, y + 0.02, 0));
    }
    return merge(...parts);
  });
  const crystal = variants((i) => {
    const colors = [["#79d8ff", "#b8ecff"], ["#c99bff", "#e6d0ff"], ["#8affc9", "#c8ffe6"]][i % 3];
    const h = 1.6 + i * 0.7;
    return merge(
      turn(lathe({ profile: [[0.36, 0], [0.42, h * 0.3], [0.18, h * 0.8], [0, h]], segments: 6, color: colors[0], emissive: 0.75 }), i * 0.9),
      shift(turn(lathe({ profile: [[0.2, 0], [0.24, h * 0.2], [0.1, h * 0.5], [0, h * 0.62]], segments: 5, color: colors[1], emissive: 0.85 }), i * 1.3, 0, 0.35), 0.4, 0, 0.2),
      shift(turn(lathe({ profile: [[0.16, 0], [0.2, h * 0.15], [0.08, h * 0.4], [0, h * 0.5]], segments: 5, color: colors[0], emissive: 0.75 }), i * 2.1, 0, -0.4), -0.35, 0, -0.25)
    );
  });
  const iceSpike = variants((i) => {
    const h = 1.2 + i * 0.6;
    return merge(
      turn(lathe({ profile: [[0.5, 0], [0.34, h * 0.4], [0.1, h * 0.85], [0, h]], segments: 5, color: (t) => t < 0.5 ? "#cfe6f5" : "#eef7fb" }), i * 0.8),
      shift(turn(lathe({ profile: [[0.3, 0], [0.18, h * 0.3], [0, h * 0.55]], segments: 5, color: "#dbeef8" }), i * 1.7), 0.4, 0, 0.3)
    );
  });
  const snowRock = variants((i) => {
    const rand = mulberry32(900 + i);
    const v = vox();
    const r = 2 + i;
    for (let x = -r; x <= r; x++) for (let y = 0; y <= r; y++) for (let z = -r; z <= r; z++) {
      const d = (x * x + z * z) / (r * r) + (y / r) ** 2;
      if (d <= 1 && !(d > 0.65 && rand() < 0.3)) v.set(x, y, z, y >= r - 1 || (y >= r - 2 && rand() < 0.5) ? 2 : rand() < 0.3 ? 1 : 0);
    }
    return voxGeo(v, { unit: 0.32, palette: ["#6f7c87", "#586470", "#eef3f7"], origin: { x: -0.16, y: 0, z: -0.16 } });
  });
  // Hangs from a cave ceiling, tip down
  const stalactite = variants((i) => {
    const h = 2 + i * 1.3;
    return merge(
      turn(lathe({ profile: [[0.6, 0.2], [0.48, -h * 0.35], [0.2, -h * 0.75], [0, -h]], segments: 6, color: (t) => t < 0.5 ? "#3a3330" : "#4a413a" }), i * 0.9),
      shift(turn(lathe({ profile: [[0.3, 0.2], [0.22, -h * 0.25], [0, -h * 0.55]], segments: 5, color: "#2b2724" }), i * 1.6), 0.45, 0, 0.3)
    );
  });
  // Weather: a rain streak and a snowflake, instanced around the camera
  const rainDrop = cached(() => noShadow(box({ w: 0.025, h: 0.7, d: 0.025, color: "#c9d6e2", emissive: 0.35 })));
  const snowFlake = cached(() => noShadow(box({ w: 0.09, h: 0.09, d: 0.09, color: "#f6f9fb", emissive: 0.25 })));
  // A plank walkway module, one unit long along z
  const planks = cached(() => merge(
    ...Array.from({ length: 4 }, (_, n) => box({ w: 1, h: 0.12, d: 0.24, color: n % 2 ? "#8f6538" : "#9c7040", offset: { y: -0.06, z: -0.375 + n * 0.25 } }))
  ));
  const buoy = cached(() => merge(
    lathe({ profile: [[0, 0], [0.4, 0.05], [0.45, 0.3], [0.3, 0.6], [0, 0.65]], segments: 8, color: (t) => t < 0.5 ? "#e04a3a" : "#f3efe4" }),
    box({ w: 0.08, h: 0.7, d: 0.08, color: "#3a2a18", offset: { y: 0.95 } }),
    box({ w: 0.18, h: 0.18, d: 0.18, color: "#ffd27a", emissive: 1, offset: { y: 1.35 } })
  ));
  // A tiny racing line marker: the lap checkpoint post pair
  const post = cached(() => merge(
    box({ w: 0.18, h: 1.4, d: 0.18, color: "#3a2a18", offset: { y: 0.7 } }),
    box({ w: 0.3, h: 0.3, d: 0.3, color: "#e04a3a", offset: { y: 1.5 } })
  ));

  BL.raceModels = { KART, GANTRY, gantryLampY, DINO_HIDES, kart, kartWheel, dino, gantry, gantryLamp, boostFlame, stalactite, rainDrop, snowFlake, boostPad, itemCrate, rockShot, peel, boulder, spectator, banner, torchStand, torchFlame, palm, lagoonRock, lavaRock, obsidianSpike, bones, pine, crystal, iceSpike, snowRock, planks, buoy, post, turn, shift, yToX, yToZ };
})();
