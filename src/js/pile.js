(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { mat4, lerp, damp, ease, mulberry32 } = BL.math;
  const { createNode, addChild, removeChild, addTween } = BL.scene;
  const DROP_HEIGHT = 4.3;
  const BANANA_DROP_HEIGHT = (BL.terrain.MAX_HEIGHT + BL.hubModels.TREE_HEIGHT) * 2;
  const BANANA_SCALE = models.BANANA_AMMO_SCALE;
  const DISK_BANANAS = 302;
  const MAX_BANANAS = 10000000;
  const BASE_HEIGHT = 0.48;
  // Extra height plus the fuller profile represents air between loosely settled fruit
  // without widening the pile into the bounded outer meadow at very large levels.
  const PACKING_HEIGHT = 1.2;
  const SHELL_EDGE = 0.28;
  const CORE_FACE_SIZE = 0.16;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  // The large-pile shell keeps its established layered spacing and orientation.
  const BANANA_LENGTH_SPACE = 0.3;
  const BANANA_ROW_SPACE = 0.1;
  const BANANA_YAW_SPREAD = 0.5;
  const BANANA_UNDERLAYER_SINK = 0.03;
  const BANANA_SURFACE_CLEARANCE = 0.008;
  const PLATFORM_CLEARANCE = 0.004;
  const SURFACE_OUTER_RADIUS = 1;
  const DROP_POOL_SIZE = 96;
  const DROP_RATE = 72;
  const DROP_DURATION_MIN = 1.05;
  const DROP_DURATION_RANGE = 0.3;
  const DROP_DURATION_MAX = DROP_DURATION_MIN + DROP_DURATION_RANGE;
  const BACKLOG_SECONDS = 10;
  const FRAME_TIME_MAX = 0.1;
  const DROP_THROUGHPUT = Math.min(DROP_RATE, DROP_POOL_SIZE / DROP_DURATION_MAX);
  const BACKLOG_VISUAL_CAPACITY = Math.max(1, Math.floor((BACKLOG_SECONDS - DROP_DURATION_MAX - FRAME_TIME_MAX) * DROP_THROUGHPUT));
  const MAX_WEBGL_TILES = 65536;
  const MAX_CANVAS_TILES = 512;
  const footprintFor = (count, scale = 0.45) => scale * (count > DISK_BANANAS ? Math.cbrt(count / DISK_BANANAS) : 1);
  const visualFootprintFor = (count, scale = 0.45) => {
    const mix = Math.min(1, Math.max(0, (count - DISK_BANANAS) / DISK_BANANAS));
    return footprintFor(count, scale) + BANANA_SCALE * SHELL_EDGE * mix;
  };
  const heightGrowthFor = (count) => footprintFor(count, 1) * PACKING_HEIGHT;
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const domeSurface = (radius, out) => {
    const profile = models.BANANA_PILE_PROFILE;
    for (let i = 0; i < profile.length - 1; i++) {
      const outer = profile[i], inner = profile[i + 1];
      if (radius < inner[0]) continue;
      const span = outer[0] - inner[0];
      const t = (outer[0] - radius) / span;
      out.y = lerp(outer[1], inner[1], t);
      out.slope = (outer[1] - inner[1]) / span;
      return out;
    }
    out.y = profile[profile.length - 1][1];
    out.slope = 0;
    return out;
  };
  // The banana pile of one scene
  const create = (ctx) => {
    const { root, world, pileScale: SCALE = 0.45, pileY: BASE_Y = 0.02 } = ctx;
    const matrixLiving = !!ctx.matrixLivingPile;
    const pileSlots = [];
    const coreFaceSize = ctx.renderer.kind === "canvas2d" ? CORE_FACE_SIZE * 1.75 : CORE_FACE_SIZE;
    // A yellow-paneled mound under the shell uses one geometry scaled to every level.
    const core = createNode({ geometry: models.bananaPileCoreGeometry(SCALE * 6, BASE_HEIGHT * 6, coreFaceSize), visible: false, matrixLiving });
    const bananaGeometry = models.bananaGeometry();
    const shellGeometry = models.bananaTileGeometry();
    let shellMinZ = Infinity, shellReach = 0;
    for (let i = 0; i < shellGeometry.verts.length; i += 3) {
      shellMinZ = Math.min(shellMinZ, shellGeometry.verts[i + 2]);
      shellReach = Math.max(shellReach, Math.hypot(shellGeometry.verts[i], shellGeometry.verts[i + 1], shellGeometry.verts[i + 2]));
    }
    shellReach *= BANANA_SCALE;
    const bananaSurfaceLift = -shellMinZ * BANANA_SCALE + BANANA_SURFACE_CLEARANCE;
    const shell = createNode({
      geometry: shellGeometry,
      instanceData: new Float32Array(20),
      instanceCount: 0,
      instanceVersion: 0,
      visible: false,
      matrixLiving
    });
    const maxTiles = ctx.renderer.kind === "canvas2d" ? MAX_CANVAS_TILES : MAX_WEBGL_TILES;
    const surfaceSample = { y: 0, slope: 0 };
    const instanceMatrix = mat4.create();
    const restingMatrix = mat4.create();
    const restingScale = { x: BANANA_SCALE, y: BANANA_SCALE, z: BANANA_SCALE };
    const tilePosition = { x: 0, y: 0, z: 0 };
    const keepAbovePlatform = (position, rotation, scale, geometry) => {
      setVec(restingScale, scale, scale, scale);
      mat4.fromTRS(restingMatrix, position, rotation, restingScale);
      let minY = Infinity;
      for (let i = 0; i < geometry.verts.length; i += 3) {
        minY = Math.min(minY, restingMatrix[1] * geometry.verts[i] + restingMatrix[5] * geometry.verts[i + 1] + restingMatrix[9] * geometry.verts[i + 2] + restingMatrix[13]);
      }
      position.y += Math.max(0, BASE_Y + PLATFORM_CLEARANCE - minY);
    };
    const keepInstanceAbovePlatform = (matrix) => {
      if (matrix[13] - BASE_Y - PLATFORM_CLEARANCE >= shellReach) return;
      let minY = Infinity;
      for (let i = 0; i < shellGeometry.verts.length; i += 3) {
        minY = Math.min(minY, matrix[1] * shellGeometry.verts[i] + matrix[5] * shellGeometry.verts[i + 1] + matrix[9] * shellGeometry.verts[i + 2] + matrix[13]);
      }
      matrix[13] += Math.max(0, BASE_Y + PLATFORM_CLEARANCE - minY);
    };
    addChild(root, core, shell);
    {
      const surfaceRand = mulberry32(0x51face);
      const bases = [];
      for (let i = 0; i < DISK_BANANAS; i++) {
        const base = {
          pos: { x: 0, y: BASE_Y, z: 0 },
          rot: { x: -Math.PI * 0.5, y: 0, z: 0 }
        };
        bases.push(base);
      }
      for (let i = 0; i < bases.length; i++) {
        const base = bases[i];
        // The same bounded pool becomes deterministic shell reference points at 303.
        const surfaceRadius = Math.sqrt((i + 0.5) / DISK_BANANAS) * 0.985;
        const surfaceAngle = i * GOLDEN_ANGLE + (surfaceRand() - 0.5) * 0.08;
        const profile = domeSurface(surfaceRadius, surfaceSample);
        const radialNormal = -profile.slope * BASE_HEIGHT * PACKING_HEIGHT / SCALE;
        const normalLength = Math.hypot(radialNormal, 1);
        const nx = Math.cos(surfaceAngle) * radialNormal / normalLength;
        const ny = 1 / normalLength;
        const nz = Math.sin(surfaceAngle) * radialNormal / normalLength;
        const surface = {
          x: Math.cos(surfaceAngle) * surfaceRadius,
          y: profile.y,
          z: Math.sin(surfaceAngle) * surfaceRadius,
          nx, ny, nz,
          rot: { x: -Math.asin(ny), y: Math.atan2(nx, nz), z: surfaceRand() * Math.PI * 2 }
        };
        const node = models.banana();
        setVec(node.scale, BANANA_SCALE, BANANA_SCALE, BANANA_SCALE);
        Object.assign(node.position, base.pos);
        Object.assign(node.rotation, base.rot);
        node.visible = false;
        const slot = {
          node,
          base: { pos: { ...base.pos }, rot: { ...base.rot } },
          small: base,
          surface,
          restScale: BANANA_SCALE,
          token: 0,
          note: null,
          moving: false
        };
        pileSlots.push(slot);
        addChild(root, node);
      }
    }
    const dropSlots = [];
    for (let i = 0; i < DROP_POOL_SIZE; i++) {
      const node = models.banana();
      setVec(node.scale, BANANA_SCALE, BANANA_SCALE, BANANA_SCALE);
      node.visible = false;
      dropSlots.push({
        node,
        landing: { pos: { x: 0, y: BASE_Y, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
        token: 0,
        note: null,
        moving: false,
        bananaValue: 0,
        restScale: BANANA_SCALE,
        tween: null
      });
      addChild(root, node);
    }
    let shown = 0, counted = 0;
    let footprint = SCALE, layoutCount = -1, shellWanted = 0;
    const delivery = world.delivery || (world.delivery = {
      pendingValue: 0,
      pendingTokens: 0,
      airborneValue: 0,
      airborneCount: 0,
      activeTime: 0,
      drainDeadline: 0,
      totalAcceptedValue: 0,
      totalLandedValue: 0,
      visualDropsStarted: 0,
      visualDropsLanded: 0,
      visualDropsCanceled: 0,
      replanCount: 0,
      launchCredit: 0,
      maxConcurrentDrops: 0,
      lastDrainSeconds: 0
    });
    let hatchOpen = 0, hatchTarget = 0;
    const pileEdge = () => footprint;
    // Park a banana at its resting spot
    const restSlot = (slot) => {
      Object.assign(slot.node.position, slot.base.pos);
      Object.assign(slot.node.rotation, slot.base.rot);
      setVec(slot.node.scale, slot.restScale, slot.restScale, slot.restScale);
    };
    // Write one flat banana on the mound surface at (angle, normalizedRadius), turned by yaw about the normal.
    // seed is stable across relays, so a banana keeps its look while the mound grows under it.
    const writeTile = (data, instance, seed, angle, normalizedRadius, yaw, sink, growth, coreFootprint, radialScale, edgeBand) => {
      const profile = domeSurface(normalizedRadius, surfaceSample);
      const radialNormal = -profile.slope * radialScale;
      const normalLength = Math.hypot(radialNormal, 1);
      const ny = 1 / normalLength;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const nx = cos * radialNormal / normalLength;
      const nz = sin * radialNormal / normalLength;
      const yx = ny * cos, yy = -radialNormal / normalLength, yz = ny * sin;
      const radialJitter = edgeBand ? 0 : Math.sin(seed * 4.229) * 0.008;
      const lift = bananaSurfaceLift - sink + (edgeBand ? 0 : Math.sin(seed * 5.731) * 0.004);
      const warpedRadius = normalizedRadius * (edgeBand ? 1 : models.bananaPileRadiusScale(angle, normalizedRadius));
      const warpedY = profile.y + models.bananaPileHeightOffset(angle, normalizedRadius);
      setVec(tilePosition,
        cos * warpedRadius * coreFootprint + nx * lift + yx * radialJitter,
        BASE_Y + warpedY * BASE_HEIGHT * growth + ny * lift + yy * radialJitter,
        sin * warpedRadius * coreFootprint + nz * lift + yz * radialJitter);
      const tx = -sin, tz = cos;
      const ct = Math.cos(yaw), st = Math.sin(yaw);
      const xx = tx * ct + yx * st, xy = yy * st, xz = tz * ct + yz * st;
      const bx = -tx * st + yx * ct, by = yy * ct, bz = -tz * st + yz * ct;
      const flip = Math.sin(seed * 3.731) < 0 ? -BANANA_SCALE : BANANA_SCALE;
      instanceMatrix[0] = xx * flip;
      instanceMatrix[1] = xy * flip;
      instanceMatrix[2] = xz * flip;
      instanceMatrix[3] = 0;
      instanceMatrix[4] = bx * flip;
      instanceMatrix[5] = by * flip;
      instanceMatrix[6] = bz * flip;
      instanceMatrix[7] = 0;
      instanceMatrix[8] = nx * BANANA_SCALE;
      instanceMatrix[9] = ny * BANANA_SCALE;
      instanceMatrix[10] = nz * BANANA_SCALE;
      instanceMatrix[11] = 0;
      instanceMatrix[12] = tilePosition.x;
      instanceMatrix[13] = tilePosition.y;
      instanceMatrix[14] = tilePosition.z;
      instanceMatrix[15] = 1;
      keepInstanceAbovePlatform(instanceMatrix);
      const offset = instance * 20;
      data.set(instanceMatrix, offset);
      data[offset + 16] = 1;
      data[offset + 17] = 0;
      data[offset + 18] = matrixLiving ? 2 : 0;
      data[offset + 19] = 0;
    };
    // Preserve the established layered shell: bands run from rim to apex, with a
    // slightly sunken second layer filling gaps while keeping visible 3D depth.
    const rebuildSurface = (target, growth, coreFootprint) => {
      const building = target <= DISK_BANANAS;
      if (!target) {
        shell.visible = false;
        shell.instanceCount = 0;
        shellWanted = 0;
        return;
      }
      const radialScale = BASE_HEIGHT * growth / coreFootprint;
      const rowStep = (normalizedRadius, spacing) => BANANA_ROW_SPACE * spacing / (coreFootprint * Math.hypot(1, domeSurface(normalizedRadius, surfaceSample).slope * radialScale));
      const bandCountAt = (normalizedRadius, spacing) => Math.max(1, Math.floor(Math.PI * 2 * normalizedRadius * coreFootprint / (BANANA_LENGTH_SPACE * spacing)));
      const stepAt = (normalizedRadius, spacing) => Math.min(Math.PI * 2, BANANA_LENGTH_SPACE * spacing / (normalizedRadius * coreFootprint));
      const extraAt = (normalizedRadius, spacing) => Math.PI * 2 - bandCountAt(normalizedRadius, spacing) * stepAt(normalizedRadius, spacing) > stepAt(normalizedRadius, spacing) * 0.5 ? 1 : 0;
      let spacing = 1, fullWanted;
      for (;;) {
        // The platform-contact ring never inherits adaptive shell thinning. Its
        // complete circumference is the visual seal over the core's foot.
        fullWanted = bandCountAt(SURFACE_OUTER_RADIUS, 1);
        for (let normalizedRadius = SURFACE_OUTER_RADIUS - rowStep(SURFACE_OUTER_RADIUS, spacing); normalizedRadius > 0; normalizedRadius -= rowStep(normalizedRadius, spacing)) fullWanted += bandCountAt(normalizedRadius, spacing) * 2 + extraAt(normalizedRadius, spacing);
        if (fullWanted <= maxTiles) break;
        spacing *= Math.sqrt(fullWanted / maxTiles) * 1.02;
      }
      const wanted = building ? Math.min(target, fullWanted) : fullWanted;
      if (!building && wanted === shellWanted) return;
      shellWanted = wanted;
      const need = wanted * 20;
      if (shell.instanceData.length < need) {
        let capacity = shell.instanceData.length;
        while (capacity < need) capacity *= 2;
        shell.instanceData = new Float32Array(Math.min(maxTiles * 20, capacity));
      }
      const data = shell.instanceData;
      let instance = 0, candidate = 0, band = 0;
      const all = wanted === fullWanted;
      // Start at the true foot of the profile. An inset that is imperceptible on a
      // small pile scales into an exposed skirt at million-banana sizes.
      for (let normalizedRadius = SURFACE_OUTER_RADIUS; normalizedRadius > 0; normalizedRadius -= rowStep(normalizedRadius, spacing), band++) {
        const edgeBand = band === 0;
        const bandSpacing = edgeBand ? 1 : spacing;
        const bandCount = bandCountAt(normalizedRadius, bandSpacing);
        const phase = (band * GOLDEN_ANGLE) % (Math.PI * 2);
        // Close the contact ring with equal angular spacing; carrying the ordinary
        // row remainder into its final gap can expose the backing at large radii.
        const step = edgeBand ? Math.PI * 2 / bandCount : stepAt(normalizedRadius, bandSpacing);
        const last = bandCount - 1 + (edgeBand ? 0 : extraAt(normalizedRadius, bandSpacing));
        const underRadius = Math.max(0, normalizedRadius - rowStep(normalizedRadius, bandSpacing) * 0.5);
        for (let j = 0; j <= last; j++) {
          const seed = band * 7919 + j + 1;
          const jitter = Math.sin(seed * 12.9898) * 0.015 / Math.max(0.05, normalizedRadius * coreFootprint);
          const angle = phase + j * step + jitter;
          if (j < bandCount) {
            if (instance < wanted && (all || candidate === Math.floor((instance + 0.5) * fullWanted / wanted))) writeTile(data, instance++, seed, angle, normalizedRadius, Math.sin(seed * 7.133) * (edgeBand ? 0.18 : BANANA_YAW_SPREAD), 0, growth, coreFootprint, radialScale, edgeBand);
            candidate++;
          }
          if (!edgeBand) {
            if (instance < wanted && (all || candidate === Math.floor((instance + 0.5) * fullWanted / wanted))) writeTile(data, instance++, -seed, angle + step * 0.5, underRadius, Math.sin(seed * 9.271) * BANANA_YAW_SPREAD, BANANA_UNDERLAYER_SINK, growth, coreFootprint, radialScale, false);
            candidate++;
          }
        }
      }
      shell.instanceCount = instance;
      shell.instanceVersion++;
      shell.visible = true;
    };
    const reflow = (target) => {
      if (target === layoutCount) return;
      layoutCount = target;
      const growth = target <= DISK_BANANAS ? PACKING_HEIGHT * target / DISK_BANANAS : heightGrowthFor(target);
      const coreFootprint = footprintFor(target, SCALE);
      footprint = visualFootprintFor(target, SCALE);
      core.visible = target > 0;
      core.position.y = BASE_Y;
      setVec(core.scale, coreFootprint, BASE_HEIGHT * growth, coreFootprint);
      rebuildSurface(target, growth, coreFootprint);
      if (ctx.onLayout) ctx.onLayout(footprint, target);
      for (let i = 0; i < pileSlots.length; i++) {
        const slot = pileSlots[i], surface = slot.surface;
        const lift = BANANA_SCALE * 0.07;
        slot.restScale = BANANA_SCALE;
        setVec(slot.base.pos,
          surface.x * coreFootprint + surface.nx * lift,
          BASE_Y + surface.y * BASE_HEIGHT * growth + surface.ny * lift,
          surface.z * coreFootprint + surface.nz * lift);
        Object.assign(slot.base.rot, surface.rot);
        keepAbovePlatform(slot.base.pos, slot.base.rot, slot.restScale, bananaGeometry);
        if (slot.node.visible && !slot.moving) restSlot(slot);
      }
    };
    const chooseLanding = (slot) => {
      const landing = slot.landing;
      if (counted <= DISK_BANANAS) {
        const base = pileSlots[Math.floor(Math.random() * Math.max(1, counted))].base;
        Object.assign(landing.pos, base.pos);
        Object.assign(landing.rot, base.rot);
        return landing;
      }
      let x, z, normalizedRadius;
      do {
        const magnitude = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, Math.random()))) * 0.38;
        const angle = Math.random() * Math.PI * 2;
        x = Math.cos(angle) * magnitude;
        z = Math.sin(angle) * magnitude;
        normalizedRadius = magnitude;
      } while (normalizedRadius > 0.96);
      const angle = Math.atan2(z, x);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const growth = heightGrowthFor(counted);
      const coreFootprint = footprintFor(counted, SCALE);
      const profile = domeSurface(normalizedRadius, surfaceSample);
      const radialNormal = -profile.slope * BASE_HEIGHT * growth / coreFootprint;
      const normalLength = Math.hypot(radialNormal, 1);
      const nx = cos * radialNormal / normalLength;
      const ny = 1 / normalLength;
      const nz = sin * radialNormal / normalLength;
      const warpedRadius = normalizedRadius * models.bananaPileRadiusScale(angle, normalizedRadius);
      setVec(landing.pos,
        cos * warpedRadius * coreFootprint + nx * bananaSurfaceLift,
        BASE_Y + (profile.y + models.bananaPileHeightOffset(angle, normalizedRadius)) * BASE_HEIGHT * growth + ny * bananaSurfaceLift,
        sin * warpedRadius * coreFootprint + nz * bananaSurfaceLift);
      setVec(landing.rot, -Math.asin(ny), Math.atan2(nx, nz), Math.random() * Math.PI * 2);
      keepAbovePlatform(landing.pos, landing.rot, BANANA_SCALE, bananaGeometry);
      return landing;
    };
    const outstandingValue = () => delivery.pendingValue + delivery.airborneValue;
    const visualCapacityForDeadline = () => {
      const remaining = Math.max(0, delivery.drainDeadline - delivery.activeTime);
      const occupiedDelay = delivery.airborneCount ? DROP_DURATION_MAX : 0;
      const launchCapacity = Math.max(0, remaining - DROP_DURATION_MAX - FRAME_TIME_MAX - occupiedDelay) * DROP_THROUGHPUT;
      return Math.max(1, Math.min(BACKLOG_VISUAL_CAPACITY, Math.floor(launchCapacity + 1e-9)));
    };
    const replanPending = () => {
      delivery.pendingTokens = Math.min(delivery.pendingValue, visualCapacityForDeadline());
      delivery.replanCount++;
    };
    const dropIn = (slot, bananaValue) => {
      const token = ++slot.token;
      const landing = chooseLanding(slot);
      const { pos, rot } = landing;
      const fromX = pos.x + (Math.random() - 0.5) * 0.7;
      const fromY = BANANA_DROP_HEIGHT + Math.random() * 1.2;
      const fromZ = pos.z + (Math.random() - 0.5) * 0.7;
      const spinX = (Math.random() - 0.5) * 12;
      const spinY = (Math.random() - 0.5) * 10;
      const spinZ = (Math.random() - 0.5) * 12;
      slot.note = null;
      slot.moving = true;
      slot.bananaValue = bananaValue;
      delivery.airborneValue += bananaValue;
      delivery.airborneCount++;
      delivery.visualDropsStarted++;
      delivery.maxConcurrentDrops = Math.max(delivery.maxConcurrentDrops, delivery.airborneCount);
      slot.tween = addTween({
        dur: DROP_DURATION_MIN + Math.random() * DROP_DURATION_RANGE,
        ease: ease.outBounce,
        update: (k) => {
          if (slot.token !== token) return;
          slot.node.visible = true;
          const scale = lerp(BANANA_SCALE, slot.restScale, k);
          setVec(slot.node.scale, scale, scale, scale);
          setVec(slot.node.position, lerp(fromX, pos.x, k), lerp(fromY, pos.y, k), lerp(fromZ, pos.z, k));
          setVec(slot.node.rotation, rot.x + (1 - k) * spinX, rot.y + (1 - k) * spinY, rot.z + (1 - k) * spinZ);
        },
        done: () => {
          if (slot.token !== token) return;
          delivery.airborneValue -= slot.bananaValue;
          delivery.airborneCount--;
          delivery.visualDropsLanded++;
          delivery.totalLandedValue += slot.bananaValue;
          slot.moving = false;
          slot.node.visible = false;
          slot.tween = null;
          world.level += slot.bananaValue;
          slot.bananaValue = 0;
          syncPile(true);
          if (!outstandingValue()) {
            delivery.lastDrainSeconds = delivery.activeTime - (delivery.drainDeadline - BACKLOG_SECONDS);
            delivery.drainDeadline = 0;
            delivery.pendingTokens = 0;
          }
        }
      });
    };
    const pumpDrops = (dt) => {
      if (!delivery.pendingValue) return;
      if (!delivery.pendingTokens) replanPending();
      delivery.launchCredit = Math.min(DROP_POOL_SIZE, delivery.launchCredit + dt * DROP_RATE);
      let budget = Math.floor(delivery.launchCredit), launched = 0;
      for (let i = 0; i < dropSlots.length && delivery.pendingValue && launched < budget; i++) {
        const slot = dropSlots[i];
        if (slot.moving) continue;
        const bananaValue = Math.ceil(delivery.pendingValue / delivery.pendingTokens);
        delivery.pendingValue -= bananaValue;
        delivery.pendingTokens--;
        dropIn(slot, bananaValue);
        launched++;
      }
      delivery.launchCredit -= launched;
      if (launched < budget) delivery.launchCredit = Math.min(1, delivery.launchCredit);
    };
    const cancelAirborne = (restorePending) => {
      for (let i = 0; i < dropSlots.length; i++) {
        const slot = dropSlots[i];
        if (slot.moving && restorePending) {
          delivery.pendingValue += slot.bananaValue;
          delivery.visualDropsCanceled++;
        }
        if (slot.tween) slot.tween.alive = false;
        slot.token++;
        slot.moving = false;
        slot.node.visible = false;
        slot.tween = null;
        slot.bananaValue = 0;
      }
      delivery.airborneValue = 0;
      delivery.airborneCount = 0;
      if (restorePending && delivery.pendingValue) replanPending();
    };
    const clearDrops = () => {
      cancelAirborne(false);
      delivery.pendingValue = 0;
      delivery.pendingTokens = 0;
      delivery.drainDeadline = 0;
      delivery.totalAcceptedValue = 0;
      delivery.totalLandedValue = 0;
      delivery.visualDropsStarted = 0;
      delivery.visualDropsLanded = 0;
      delivery.visualDropsCanceled = 0;
      delivery.replanCount = 0;
      delivery.launchCredit = 0;
      delivery.maxConcurrentDrops = 0;
      delivery.lastDrainSeconds = 0;
    };
    const syncPile = (settle = false) => {
      if (world.level > MAX_BANANAS) world.level = MAX_BANANAS;
      const target = Math.max(0, Math.floor(world.level));
      const additions = Math.max(0, target - counted);
      reflow(target);
      const targetShown = 0;
      while (shown > targetShown) {
        shown--;
        const slot = pileSlots[shown];
        slot.node.visible = false;
        restSlot(slot);
      }
      while (shown < targetShown) {
        const slot = pileSlots[shown];
        slot.node.visible = true;
        slot.moving = false;
        restSlot(slot);
        shown++;
      }
      counted = target;
      if (additions) hatchTarget = 1;
      if (ctx.onShown) ctx.onShown(target);
      ctx.crew.updateFan();
      // A delivery brings the crew running, one banana does not
      if (additions >= 2) ctx.crew.rush();
    };
    const deliverBananas = (amount) => {
      const room = MAX_BANANAS - Math.floor(world.level) - outstandingValue();
      const additions = Math.max(0, Math.min(room, Math.floor(Number(amount) || 0)));
      if (!additions) return 0;
      delivery.pendingValue += additions;
      delivery.totalAcceptedValue += additions;
      delivery.drainDeadline = delivery.activeTime + BACKLOG_SECONDS;
      replanPending();
      hatchTarget = 1;
      if (additions >= 2) ctx.crew.rush();
      return additions;
    };
    // A driven caveman eats from the logical pile; its hand animation owns the banana.
    const eatFromPile = (cave) => {
      if (counted < 1) return false;
      world.level = Math.max(0, world.level - 1);
      syncPile(true);
      return true;
    };
    const update = (dt) => {
      delivery.activeTime += dt;
      const target = Math.floor(world.level);
      if (target !== counted) syncPile();
      pumpDrops(dt);
      if (!outstandingValue() && hatchTarget === 1) hatchTarget = 0;
      hatchOpen = damp(hatchOpen, hatchTarget, 7, dt);
    };
    const dispose = () => {
      cancelAirborne(true);
      for (const slot of pileSlots) {
        removeChild(root, slot.node);
      }
      for (const slot of dropSlots) removeChild(root, slot.node);
      removeChild(root, core);
      removeChild(root, shell);
      pileSlots.length = 0;
      dropSlots.length = 0;
      shell.instanceData = new Float32Array(20);
      shell.instanceCount = 0;
      shown = 0;
      counted = 0;
    };
    const currentWeightRange = () => {
      let min = Infinity, max = 0;
      if (delivery.pendingTokens) {
        min = Math.floor(delivery.pendingValue / delivery.pendingTokens);
        max = Math.ceil(delivery.pendingValue / delivery.pendingTokens);
      }
      for (let i = 0; i < dropSlots.length; i++) {
        const value = dropSlots[i].bananaValue;
        if (!value) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return { min: min === Infinity ? 0 : min, max };
    };
    const deliveryDebug = {
      get logicalOutstandingValue() { return outstandingValue(); },
      get pendingLogicalValue() { return delivery.pendingValue; },
      get pendingVisualDropCount() { return delivery.pendingTokens; },
      get airborneVisualDropCount() { return delivery.airborneCount; },
      get airborneLogicalValue() { return delivery.airborneValue; },
      get minDropWeight() { return currentWeightRange().min; },
      get maxDropWeight() { return currentWeightRange().max; },
      get visualDropsStarted() { return delivery.visualDropsStarted; },
      get visualDropsLanded() { return delivery.visualDropsLanded; },
      get visualDropsCanceled() { return delivery.visualDropsCanceled; },
      get totalAcceptedValue() { return delivery.totalAcceptedValue; },
      get totalLandedValue() { return delivery.totalLandedValue; },
      get activeTime() { return delivery.activeTime; },
      get drainDeadline() { return delivery.drainDeadline; },
      get estimatedActiveTimeRemaining() { return Math.max(0, delivery.drainDeadline - delivery.activeTime); },
      get visualCapacity() { return BACKLOG_VISUAL_CAPACITY; },
      get replanCount() { return delivery.replanCount; },
      get maxConcurrentDrops() { return delivery.maxConcurrentDrops; },
      get lastDrainSeconds() { return delivery.lastDrainSeconds; },
      enqueue: deliverBananas
    };
    const stats = () => ({ slots: pileSlots.length, shown: counted, rendered: shell.instanceCount, deliveries: delivery.airborneValue, pendingDrops: delivery.pendingValue, dropsStarted: delivery.visualDropsStarted, dropsLanded: delivery.visualDropsLanded, landedBananaValue: delivery.totalLandedValue, dropPool: dropSlots.length, dropRate: DROP_RATE });
    const setLevel = (level) => {
      clearDrops();
      world.level = Math.max(0, Math.min(MAX_BANANAS, Number(level) || 0));
      syncPile(true);
    };
    return {
      slots: pileSlots, drops: dropSlots, core, shell, syncPile, deliverBananas, pileEdge, eatFromPile, update, dispose, stats, setLevel, delivery: deliveryDebug,
      get shown() {
        return counted;
      },
      get rendered() {
        return shell.instanceCount;
      },
      get footprintEdge() {
        return footprint;
      },
      get hatchOpen() {
        return hatchOpen;
      },
      get inMotion() {
        return outstandingValue() > 0;
      }
    };
  };
  BL.pile = { create, DROP_HEIGHT, BANANA_DROP_HEIGHT, DROP_POOL_SIZE, DROP_RATE, DROP_DURATION_MAX, BACKLOG_SECONDS, BACKLOG_VISUAL_CAPACITY, MAX_BANANAS, DISK_BANANAS, PACKING_HEIGHT, footprintFor, visualFootprintFor, MAX_WEBGL_TILES, MAX_CANVAS_TILES };
})();
