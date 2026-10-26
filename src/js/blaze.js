// The page's fires in one place: the arcade hall's smooth `blaze` (the geometry every merged fire in the hall is
// built from) and the island's flame, a rig of glowing blocks that pour up off a pit's coals.
// A rig also breathes its embers up out of the pit and reports a `light` level so the scene can pulse the pit's
// light with the flame. Nothing here allocates per frame; a rig's blocks and ember pool are built once.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, turn, shaded, moved, turnedY, turnedZ, noShadow, cached, variants } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { mulberry32 } = BL.math;

  // ---- the arcade hall's smooth blaze -------------------------------------------------------------------------
  // A fat teardrop licking up to a point with three smaller tongues leaning out round its foot, the whole twisted a
  // little as it rises, white-gold at the root through yellow and orange to red at the tips. Smooth and unshadowed,
  // its tips sway. The arcade stands it at hall size.
  const BLAZE_INKS = ["#fff2b8", "#ffd24a", "#ffa030", "#ff6420"];
  const buildSmooth = (scale) => {
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
    return noShadow(geo);
  };
  const smooth = cached(() => buildSmooth(1));
  // The one flicker clock every fire in the page reads: the arcade's flames, the pits' fires and lights.
  const flare = (t, phase = 0) => Math.sin(t * 11 + phase) * 0.07 + Math.sin(t * 17.3 + phase * 0.48 + 1.1) * 0.05;

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
  // ---- the island's flame ---------------------------------------------------------------------------------------
  // A fire reads as fire by how it moves: it pours upward, narrows and breaks into licks. So a pit's flame is a
  // stream of small glowing blocks rather than fixed shapes: each rises off the coals, drifts in toward the flame's
  // axis, tumbles, shrinks and dies, and is reborn at the foot. A block's colour is set by where it lives, not by
  // its age: white-gold blocks stay low and short-lived, yellow and orange ones climb further, and small red licks
  // start higher and break off at the top, so the stream shades white to red from root to tip. Each band shares
  // one geometry (four instanced draws) and the bloom softens the edges. A slow gust and a quicker flutter lean the
  // upper stream; nothing allocates per frame.
  const FLAME_BANDS = [
    // Flame band object properties:
    //   color:    hex color string, block color in band
    //   count:    number of blocks to spawn in band
    //   y0:       minimum vertical start height (fraction of flame)
    //   y1:       maximum vertical start height (fraction of flame)
    //   r:        horizontal radius at this band (max distance from axis)
    //   size0:    minimum block size
    //   size1:    maximum block size
    //   life0:    minimum lifespan of a block (seconds)
    //   life1:    maximum lifespan of a block (seconds)
    //   vy0:      minimum upward speed (units/s)
    //   vy1:      maximum upward speed (units/s)
    //   stretch:  block stretch (y axis scale vs x/z)
    //   glow:     how much bloom/glow to add

    // Band 0: White-hot core
    {
      color: "#fff0a8",
      count: 10,
      y0: 0.16,
      y1: 0.20,
      r: 0.3,
      size0: 0.17,
      size1: 0.23,
      life0: 1.45,
      life1: 2.0,
      vy0: 0.1,
      vy1: 0.3,
      stretch: 0.2,
      glow: 2.8
    },
    // Band 1: Yellow body
    {
      color: "#ffd03a",
      count: 8,
      y0: 0.20,
      y1: 0.34,
      r: 0.25,
      size0: 0.16,
      size1: 0.21,
      life0: 0.8,
      life1: 1.3,
      vy0: 0.4,
      vy1: 0.6,
      stretch: 0.5,
      glow: 2.2
    },
    // Band 2: Orange mid-licks
    {
      color: "#ff8a1e",
      count: 6,
      y0: 0.24,
      y1: 0.4,
      r: 0.3,
      size0: 0.12,
      size1: 0.16,
      life0: 1.0,
      life1: 1.5,
      vy0: 0.4,
      vy1: 0.6,
      stretch: 0.9,
      glow: 1.4
    },
    // Band 3: Red tips
    {
      color: "#e0381a",
      count: 7,
      y0: 0.5,
      y1: 0.65,
      r: 0.16,
      size0: 0.12,
      size1: 0.17,
      life0: 0.53,
      life1: 1.1,
      vy0: 0.55,
      vy1: 0.8,
      stretch: 1.2,
      glow: 1.0
    }
  ];
  // A block a little taller than wide, so a rising one reads as a lick, not a cube.
  // How fast a rising block is drawn in toward the flame's axis, per second: what narrows the stream to a point.
  const FLAME_PULL = 1.2;
  // The rise is slowed a little; a block holds its width through the lower half of its climb, then fades quickly
  // to nothing as it rises into the air, so the stream dissolves instead of carrying solid boxes up with it.
  // FLAME_RATE is the flame's own clock: below 1 the whole stream slows — rise, life, sway, spin and light — while
  // its shape and height stay put (a block travels the same distance over a longer wall-clock life). Embers and
  // sparks keep the page's clock, so the fire throws them as often as before.
  const FLAME_RATE = 0.8, FLAME_RISE = 0.72, FLAME_FADE_FROM = 0.5, FLAME_FADE_TO = 0.85;
  const flameBlock = variants((i) => noShadow(box({ w: 1, h: 1.8, d: 1, color: FLAME_BANDS[i].color, emissive: 1 })));
  // The glowing bed the flame stands on: coals wedged in the gaps between the pit's three crossed logs (which lie
  // at 0, 60 and 120 degrees, 0.12 to 0.29 up), and one bright coal where they cross.
  const COALS = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = (30 + 60 * k) * Math.PI / 180, r = k % 2 ? 0.2 : 0.27;
    return [Math.cos(a) * r, 0.09, Math.sin(a) * r, k % 2 ? 0.11 : 0.14, "#d8481a"];
  }).concat([[0, 0.24, 0, 0.17, "#ff8a2a"]]);
  const coalBed = cached(() => noShadow(BL.models.merge(...COALS.map(([x, y, z, s, color]) => moved(box({ w: s, h: s * 0.5, d: s, color, emissive: 1 }), x, y, z)))));
  // The ignition volumes the block flame occupies, in the pit's frame (centre, then half extents): sized from the
  // blocks' outer edges sampled over many seconds, widest just above the logs and narrowing to the licks.
  const FLAME_BOXES = new Float32Array([
    0, 0.29, 0, 0.38, 0.11, 0.38,
    0, 0.5, 0, 0.26, 0.1, 0.26,
    0, 0.7, 0, 0.2, 0.1, 0.2,
    0, 0.9, 0, 0.17, 0.1, 0.17,
    0, 1.12, 0, 0.15, 0.12, 0.15
  ]);
  const EMBER_POOL = 6;
  // `opts`: x, y, z is the rig's own place in its parent; emitX/emitY/emitZ the pit's world place for the fx; scale;
  // sightHidden for the hub's outline registry; embers `{ fx, bits }` to breathe embers (the hub's ember model).
  const createVoxelRig = (opts) => {
    const o = opts || {}, scale = o.scale || 1, rand = mulberry32(o.seed || 7);
    const root = createNode({ position: { x: o.x || 0, y: o.y || 0, z: o.z || 0 }, scale: { x: scale, y: scale, z: scale } });
    if (o.sightHidden) root.sightHidden = true;
    const coals = createNode({ geometry: coalBed(), glow: 1 });
    if (o.sightHidden) coals.sightHidden = true;
    addChild(root, coals);
    // A block is reborn at its band's foot with a fresh place, speed, size, life and spin.
    const spawn = (p) => {
      const B = p.band, a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * B.r;
      p.x = Math.cos(a) * r;
      p.z = Math.sin(a) * r;
      p.y = B.y0 + rand() * (B.y1 - B.y0);
      p.vy = (B.vy0 + rand() * (B.vy1 - B.vy0)) * FLAME_RISE;
      p.size = B.size0 + rand() * (B.size1 - B.size0);
      p.life = B.life0 + rand() * (B.life1 - B.life0);
      p.age = 0;
      p.spin = (rand() - 0.5) * 4.5;
      p.tilt = (rand() - 0.5) * 0.3;
      p.wob = rand() * Math.PI * 2;
      p.node.rotation.y = rand() * Math.PI * 2;
    };
    const blocks = [];
    for (let b = 0; b < FLAME_BANDS.length; b++) {
      const B = FLAME_BANDS[b], geo = flameBlock(b);
      for (let i = 0; i < B.count; i++) {
        const node = createNode({ geometry: geo, glow: B.glow });
        if (o.sightHidden) node.sightHidden = true;
        addChild(root, node);
        const p = { node, band: B, age: 0, life: 1, x: 0, y: 0, z: 0, vy: 1, size: 0.1, spin: 0, tilt: 0, wob: 0 };
        // Start part-way through a life, so the flame is whole from its first frame.
        spawn(p);
        p.age = rand() * p.life;
        p.y += p.vy * p.age;
        const k = Math.exp(-FLAME_PULL * p.age);
        p.x *= k;
        p.z *= k;
        blocks.push(p);
      }
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
      root, blocks, boxes: FLAME_BOXES, light: 1,
      update(dt, elapsed) {
        // The flame runs on its own clock (FLAME_RATE): every motion below is scaled by it, the embers' and sparks'
        // above it are not.
        const sdt = dt * FLAME_RATE, st = elapsed * FLAME_RATE;
        // The whole flame leans with a slow gust and a quicker flutter, more the higher a block has climbed.
        const gx = Math.sin(st * 0.7) * 0.1 + Math.sin(st * 2 + 1.3) * 0.04;
        const gz = Math.cos(st * 0.55 + 0.4) * 0.07 + Math.sin(st * 2.3) * 0.03;
        const pull = Math.exp(-FLAME_PULL * sdt);
        // A click on the pit flares it: the hub's lamp loop raises the root's `flare` and lets it fall back.
        // The lamp loop hands the fire's lit glow and click flare to the rig; the blocks follow both,
        // since the rig root has no geometry of its own.
        const lampK = root.lampK === undefined ? 1 : root.lampK;
        const lampBase = root.lampBase || 1;
        const lampRatio = (root.lampGlow === undefined ? lampBase : root.lampGlow) / lampBase;
        const flared = root.flare > 0 ? root.flare : 0, grow = 1 + flared * 0.35, bright = lampK * (1 + flared) * lampRatio;
        for (let i = 0; i < blocks.length; i++) {
          const p = blocks[i], node = p.node;
          p.age += sdt;
          if (p.age >= p.life) spawn(p);
          const t = p.age / p.life, lift = p.y * p.y;
          p.y += p.vy * sdt;
          p.x *= pull;
          p.z *= pull;
          node.position.x = p.x + gx * lift + Math.sin(st * 6.8 + p.wob) * 0.025 * p.y;
          node.position.y = p.y;
          node.position.z = p.z + gz * lift + Math.cos(st * 5.5 + p.wob) * 0.02 * p.y;
          // Grows in over its first eighth, holds its width through the lower half, then fades quickly to nothing
          // as it climbs into the air, drawn thinner and taller so the upper blocks pull into licks.
          const fade = Math.min(1, Math.max(0, (FLAME_FADE_TO - t) / (FLAME_FADE_TO - FLAME_FADE_FROM)));
          const s = p.size * grow * Math.min(1, t * 8) * fade, stretch = 1 + t * p.band.stretch;
          node.scale.y = s * stretch;
          node.scale.x = node.scale.z = s / Math.sqrt(stretch);
          node.rotation.y += p.spin * sdt;
          node.rotation.x = Math.sin(st * 3.8 + p.wob) * 0.1;
          node.rotation.z = p.tilt + gx * 1.2;
          node.glow = p.band.glow * bright * (0.75 + 0.5 * fade);
        }
        rig.light = 1 + flare(st) + gx * 0.5 + flared * 0.5;
        coals.glow = 1.1 + Math.sin(st * 1.7) * 0.15 + flare(st, 2) * 1.5;
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
          // Embers leave from the top of the fire, clear of the flame's body and the pit stones, and drift outward as
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

  BL.blaze = { smooth, flare, createVoxelRig, emberModel, buildEmberModel };
})();
