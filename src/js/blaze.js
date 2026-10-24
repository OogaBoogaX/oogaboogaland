// The page's fires in one place: the arcade hall's smooth `blaze` (the geometry every merged fire in the hall is
// built from) and the island's voxel flame, a rig of separate tongue pieces with their own stretch, lean and sway.
// A rig also breathes its embers up out of the pit and reports a `light` level so the scene can pulse the pit's
// light with the flame. Nothing here allocates per frame; the tongues and the ember pool are built once per rig.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, makeVox, voxelGeometry, turn, shaded, moved, turnedY, turnedZ, noShadow, cached, variants } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { mulberry32 } = BL.math;

  // ---- the arcade hall's smooth blaze -------------------------------------------------------------------------
  // A fat teardrop licking up to a point with three smaller tongues leaning out round its foot, the whole twisted a
  // little as it rises, white-gold at the root through yellow and orange to red at the tips. Smooth and unshadowed,
  // its tips sway. The arcade stands it at hall size; a pit stands `smoothPit`, the same flame at the pit's size
  // with the ignition boxes the boxed flame carried.
  const BLAZE_INKS = ["#fff2b8", "#ffd24a", "#ffa030", "#ff6420"];
  // The ignition volumes a pit's flame occupies, in the flame's own frame: the gorillas' fire contact reads these.
  const FIRE_BOXES = new Float32Array([
    0, 0.09, 0, 0.19, 0.09, 0.19,
    0, 0.27, 0, 0.23, 0.09, 0.23,
    0, 0.45, 0, 0.21, 0.09, 0.21,
    0, 0.63, 0, 0.15, 0.09, 0.15,
    0, 0.81, 0, 0.07, 0.09, 0.07
  ]);
  const buildSmooth = (scale, boxes) => {
    const ink = (t) => BLAZE_INKS[Math.min(3, Math.floor(t * 4))];
    const lick = (h, r) => turn([[0, 0], [r * 0.72, h * 0.05], [r, h * 0.2], [r * 0.9, h * 0.38], [r * 0.62, h * 0.58], [r * 0.3, h * 0.8], [0, h]], 8, ink, 0.9);
    const parts = [lick(0.5, 0.13)];
    for (let k = 0; k < 3; k++) parts.push(turnedY(moved(turnedZ(lick(0.3, 0.075), -0.45), 0.05, 0.02, 0), k * 2.09 + 0.5));
    const geo = shaded(parts), v = geo.verts;
    for (let i = 0; i < v.length; i += 3) {
      const a = v[i + 1] * 1.6, c = Math.cos(a), s = Math.sin(a), x = v[i] * scale, z = v[i + 2] * scale;
      v[i + 1] *= scale;
      v[i] = x * c + z * s;
      v[i + 2] = -x * s + z * c;
    }
    geo.sway = 0.15;
    if (boxes) geo.fireBoxes = FIRE_BOXES;
    return noShadow(geo);
  };
  const smooth = cached(() => buildSmooth(1, false));
  const smoothPit = cached(() => buildSmooth(1.8, true));
  // The one flicker clock every fire in the page reads: the arcade's flames, the pits' tongues and lights.
  const flare = (t, phase = 0) => Math.sin(t * 11 + phase) * 0.07 + Math.sin(t * 17.3 + phase * 0.48 + 1.1) * 0.05;

  // ---- the island's voxel flame -------------------------------------------------------------------------------
  // Six thin tongues of stacked blocks, different heights, leans and offsets, so the flame is not two mirrored
  // halves. Each tongue is its own node: it stretches and leans on its own clock. The central tongue keeps a 2x2
  // foot; the rest are one block wide. The drift within a tongue is a half block at most per level, so the stack
  // curves instead of standing straight.
  const VOXEL_UNIT = 0.12;
  const TONGUE_INKS = ["#fff6c8", "#ffd24a", "#ff8f24", "#e84012"];
  const TONGUES = [
    // The tall central tongue is a touch shorter and steadier than the rest: it holds the flame's height, so it
    // stretches and leans less and sways least of all.
    { h: 9, x: 0.0, z: 0.0, leanZ: 0.03, leanX: -0.02, phase: 0.0, speed: 2.1, amp: 0.06, leanSpeed: 1.1, leanAmp: 0.03, sway: 0.04 },
    { h: 7, x: 0.2, z: 0.06, leanZ: 0.12, leanX: 0.03, phase: 1.7, speed: 2.6, amp: 0.13, leanSpeed: 1.7, leanAmp: 0.06 },
    { h: 8, x: -0.18, z: 0.1, leanZ: -0.14, leanX: -0.04, phase: 3.1, speed: 2.3, amp: 0.14, leanSpeed: 1.5, leanAmp: 0.07 },
    { h: 6, x: 0.1, z: -0.16, leanZ: 0.1, leanX: -0.12, phase: 4.4, speed: 2.9, amp: 0.15, leanSpeed: 1.9, leanAmp: 0.06 },
    { h: 7, x: -0.1, z: -0.1, leanZ: -0.1, leanX: 0.1, phase: 5.6, speed: 2.5, amp: 0.13, leanSpeed: 1.6, leanAmp: 0.06 }
  ];
  const buildTongue = (i) => {
    const T = TONGUES[i], rand = mulberry32(97 + i * 13), vox = makeVox();
    let ox = 0, oz = 0;
    for (let y = 0; y < T.h; y++) {
      const t = T.h <= 1 ? 0 : y / (T.h - 1);
      const c = Math.min(3, Math.floor(t * 4));
      ox += (rand() - 0.5) * 0.12;
      oz += (rand() - 0.5) * 0.12;
      const cx = Math.round(ox * 2) / 2, cz = Math.round(oz * 2) / 2;
      // A fat 3x3 foot, then one block narrower at a time (2x2, then 1x1), so the top is a point and the base
      // is full. The grid coord is the block's corner, so a centred cluster sits at (centre - 0.5).
      const w = t < 0.2 ? 3 : t < 0.55 ? 2 : 1, half = (w - 1) / 2;
      for (let gx = 0; gx < w; gx++) {
        for (let gz = 0; gz < w; gz++) {
          vox.set(cx - half + gx - 0.5, y, cz - half + gz - 0.5, c);
        }
      }
    }
    return noShadow(voxelGeometry(vox, { unit: VOXEL_UNIT, palette: TONGUE_INKS, emissive: { 0: 1, 1: 1, 2: 1, 3: 1 } }));
  };
  const tongueGeo = variants((i) => buildTongue(i));
  // The ember lives here. `emberModel` is the hub's `ember` (the critters draw it as an instanced batch);
  // `buildEmberModel` makes a fresh object of the same look for a second batch, because the WebGL renderer keys
  // an instanced batch by geometry: two batches sharing one object leave one of them never drawn. `emberGeometry`
  // is a distinct object too, for a rig's plain ember nodes.
  const buildEmberModel = () => noShadow(box({ w: 0.05, h: 0.05, d: 0.05, color: "#ff8a2a", emissive: 1 }));
  const emberModel = cached(buildEmberModel);
  // The blaze's own ember, clear of the critters' batch (a plain node sharing their geometry is never drawn) and
  // big enough to read against the fire.
  const emberGeometry = cached(() => noShadow(box({ w: 0.1, h: 0.1, d: 0.1, color: "#ffb347", emissive: 1 })));
  // A spark the fire throws off: the frequent little bits, its own geometry so a rig need not pass one.
  const sparkGeometry = cached(() => noShadow(box({ w: 0.12, h: 0.12, d: 0.12, color: "#ffd27a", emissive: 1 })));
  const EMBER_POOL = 6;
  // `opts`: x, y, z is the rig's own place in its parent; emitX/emitY/emitZ the pit's world place for the fx; scale;
  // sightHidden for the hub's outline registry; embers `{ fx, bits }` to breathe embers (the hub's ember model).
  const createVoxelRig = (opts) => {
    const o = opts || {}, scale = o.scale || 1;
    const root = createNode({ position: { x: o.x || 0, y: o.y || 0, z: o.z || 0 }, scale: { x: scale, y: scale, z: scale } });
    if (o.sightHidden) root.sightHidden = true;
    const tongues = [];
    for (let i = 0; i < TONGUES.length; i++) {
      const T = TONGUES[i], node = createNode({ position: { x: T.x, y: 0, z: T.z }, geometry: tongueGeo(i), matrixEmissiveLiving: true, glow: 1 });
      if (o.sightHidden) node.sightHidden = true;
      addChild(root, node);
      tongues.push({ node, h: T.h, phase: T.phase, speed: T.speed, amp: T.amp, leanZ: T.leanZ, leanX: T.leanX, leanSpeed: T.leanSpeed, leanAmp: T.leanAmp, sway: T.sway === undefined ? 0.1 : T.sway });
    }
    const embers = [];
    if (o.embers) {
      const geo = emberGeometry();
      for (let i = 0; i < EMBER_POOL; i++) {
        const node = createNode({ geometry: geo, visible: false, glow: 1 });
        if (o.sightHidden) node.sightHidden = true;
        addChild(root, node);
        embers.push({ node, life: 0, max: 1, vx: 0, vy: 0, vz: 0, spin: 0 });
      }
    }
    const emberBits = o.embers ? (o.embers.bits || [sparkGeometry()]) : null;
    let timer = 0.3 + Math.random() * 0.6, sparkTimer = 0.1;
    const rig = {
      root, tongues, boxes: FIRE_BOXES, light: 1,
      update(dt, elapsed) {
        let flick = 0;
        for (let i = 0; i < tongues.length; i++) {
          const e = tongues[i], node = e.node;
          const s = 1 + Math.sin(elapsed * e.speed + e.phase) * e.amp;
          const lz = e.leanZ + Math.sin(elapsed * e.leanSpeed + e.phase * 1.3) * e.leanAmp;
          const lx = e.leanX + Math.cos(elapsed * e.leanSpeed * 0.83 + e.phase) * e.leanAmp * 0.7;
          node.scale.y = s;
          node.scale.x = node.scale.z = 1 - (s - 1) * 0.35;
          node.rotation.z = lz;
          node.rotation.x = lx;
          node.rotation.y = Math.sin(elapsed * 0.6 + e.phase * 0.5) * e.sway;
          node.glow = 1.1 + s * 0.5;
          flick += s - 1 + Math.abs(lz - e.leanZ) * 0.6;
        }
        rig.light = 1 + flick * 0.9;
        if (!embers.length) return;
        const ex = o.emitX !== undefined ? o.emitX : root.position.x;
        const ey = o.emitY !== undefined ? o.emitY : root.position.y;
        const ez = o.emitZ !== undefined ? o.emitZ : root.position.z;
        // Small sparks: the frequent little bits the fire throws off, a few a second, short-lived.
        if (o.embers.fx) {
          sparkTimer -= dt;
          if (sparkTimer <= 0) {
            sparkTimer = 0.12 + Math.random() * 0.22;
            const sa = Math.random() * Math.PI * 2, sr = 0.12 + Math.random() * 0.3;
            o.embers.fx.burst(ex + Math.cos(sa) * sr * scale, ey + (0.95 + Math.random() * 0.45) * scale, ez + Math.sin(sa) * sr * scale, 2, emberBits, 0.8);
          }
        }
        // Embers: mostly small bits, now and then a larger one that rides up out of the fire.
        timer -= dt;
        if (timer <= 0) {
          timer = 0.3 + Math.random() * 0.6;
          let e = embers[0];
          for (let i = 0; i < embers.length; i++) if (!embers[i].life) { e = embers[i]; break; }
          // Embers leave from the top of the fire, clear of the tongues and the pit stones, and drift outward as
          // they rise, so a viewer sees them come out of the fire instead of through its body.
          const a = Math.random() * Math.PI * 2, r = 0.22 + Math.random() * 0.28, outward = 0.2 + Math.random() * 0.3;
          e.node.visible = true;
          e.node.glow = 1.5;
          e.node.position.x = Math.cos(a) * r;
          e.node.position.y = 1.1 + Math.random() * 0.4;
          e.node.position.z = Math.sin(a) * r;
          const sc = Math.random() < 0.15 ? 1.6 + Math.random() * 0.6 : 0.6 + Math.random() * 0.35;
          e.node.scale.x = e.node.scale.y = e.node.scale.z = sc;
          e.vx = Math.cos(a) * outward + (Math.random() - 0.5) * 0.1;
          e.vy = 0.45 + Math.random() * 0.4;
          e.vz = Math.sin(a) * outward + (Math.random() - 0.5) * 0.1;
          e.spin = (Math.random() - 0.5) * 2.2;
          e.life = e.max = 1.2 + Math.random() * 1;
        }
        for (let i = 0; i < embers.length; i++) {
          const e = embers[i];
          if (!e.life) continue;
          e.life -= dt;
          if (e.life <= 0) { e.node.visible = false; e.life = 0; continue; }
          e.node.position.x += e.vx * dt;
          e.node.position.y += e.vy * dt;
          e.node.position.z += e.vz * dt;
          e.vy -= 0.2 * dt;
          e.node.rotation.y += e.spin * dt;
          const k = Math.min(1, e.life / 0.5) * (0.6 + e.life * 0.35);
          e.node.scale.x = e.node.scale.y = e.node.scale.z = k;
        }
      }
    };
    return rig;
  };

  BL.blaze = { smooth, smoothPit, flare, createVoxelRig, tongueGeo, emberModel, buildEmberModel, TONGUE_COUNT: TONGUES.length };
})();
