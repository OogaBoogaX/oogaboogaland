(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hubModels } = BL;
  const { mulberry32 } = BL.math;
  const { createNode, addChild, removeChild } = BL.scene;
  const SEED = 9137;
  const BUTTERFLY_CAP = 24, FIREFLY_CAP = 48, EMBER_CAP = 16;
  // The fires breathe a few embers at a time; a tenth of each cycle is a burst of faster-rising ones.
  const EMBER_CALM = 4, EMBER_BURST_COUNT = 10, EMBER_PERIOD = 8, EMBER_BURST = 0.8, EMBER_BURST_STEP = 0.04, EMBER_BURST_SPEED = 1.8;
  // An ember fades as it climbs and is reborn at the foot. Capping how high it climbs keeps that rebirth a
  // small step at the top rather than a leap, so the proximity gate's resumed frame never catches a jump.
  const EMBER_RISE = 1.8;
  // The hearth's ember batch needs its own geometry object: the WebGL renderer keys an instanced batch by
  // geometry, so sharing the plaza batch's would leave one of the two never drawn.
  let hearthEmberGeometry = null;
  const hearthEmber = () => hearthEmberGeometry || (hearthEmberGeometry = BL.blaze.buildEmberModel());
  const FRACTION = { high: 1, medium: 0.5, low: 0.25 };
  // FADE_STEP: seconds between one individual appearing or leaving.
  const FADE_STEP = 0.12;
  const BURST_MAX = 8;
  const BURST_DAMP = 2;
  const makeBatch = (geometry, cap, matrixLiving = false, proximity = false) => {
    const node = createNode({ geometry, screenCull: true, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, matrixLiving });
    return { node, cap, shown: 0, fade: 0, matrixLiving, hx: new Float32Array(cap), hz: new Float32Array(cap), hy: new Float32Array(cap), phase: new Float32Array(cap), speed: new Float32Array(cap), time: proximity ? new Float64Array(cap) : null, active: proximity ? new Uint8Array(cap) : null };
  };
  // writeInstance args: yaw a about y, x-scale sx, translation, glow.
  const writeInstance = (data, o, a, sx, x, y, z, glow, matrixLiving) => {
    const c = Math.cos(a), s = Math.sin(a);
    data[o] = c * sx;
    data[o + 1] = 0;
    data[o + 2] = -s * sx;
    data[o + 3] = 0;
    data[o + 4] = 0;
    data[o + 5] = 1;
    data[o + 6] = 0;
    data[o + 7] = 0;
    data[o + 8] = s;
    data[o + 9] = 0;
    data[o + 10] = c;
    data[o + 11] = 0;
    data[o + 12] = x;
    data[o + 13] = y;
    data[o + 14] = z;
    data[o + 15] = 1;
    data[o + 16] = glow;
    data[o + 17] = 0;
    data[o + 18] = matrixLiving ? 2 : 0;
    data[o + 19] = 0;
  };
  const settle = (batch, target, dt, step = FADE_STEP) => {
    if (batch.shown === target) {
      batch.fade = 0;
      return;
    }
    batch.fade += dt;
    if (batch.fade < step) return;
    batch.fade = 0;
    batch.shown += batch.shown < target ? 1 : -1;
  };
  const create = ({ root, renderer, flowers, fire, secondaryFire = null, meadowRadius, heightAt, activeAt = null }) => {
    const rand = mulberry32(SEED);
    const butterflies = [makeBatch(hubModels.butterfly(0), BUTTERFLY_CAP, true, !!activeAt), makeBatch(hubModels.butterfly(1), BUTTERFLY_CAP, true, !!activeAt)];
    const fireflies = makeBatch(hubModels.firefly(), FIREFLY_CAP, true, !!activeAt);
    const embers = makeBatch(hubModels.ember(), EMBER_CAP, true, !!activeAt);
    const secondaryEmbers = secondaryFire ? makeBatch(hearthEmber(), EMBER_CAP, true, !!activeAt) : null;
    const burstVx = new Float32Array(FIREFLY_CAP), burstVz = new Float32Array(FIREFLY_CAP);
    const emberT = new Float32Array(EMBER_CAP), emberPeriod = new Float32Array(EMBER_CAP);
    const secondaryEmberT = secondaryFire ? new Float32Array(EMBER_CAP) : null, secondaryEmberPeriod = secondaryFire ? new Float32Array(EMBER_CAP) : null;
    let burstNext = 0;
    for (let v = 0; v < 2; v++) {
      const b = butterflies[v];
      for (let i = 0; i < BUTTERFLY_CAP; i++) {
        const flower = flowers[(v * BUTTERFLY_CAP + i) % flowers.length];
        b.hx[i] = flower.x;
        b.hz[i] = flower.z;
        b.hy[i] = heightAt(flower.x, flower.z);
        b.phase[i] = rand() * Math.PI * 2;
        b.speed[i] = 1.2 + rand() * 0.8;
      }
    }
    const spread = meadowRadius - 2;
    for (let i = 0; i < FIREFLY_CAP;) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (heightAt(x, z) !== 0) continue;
      fireflies.hx[i] = x;
      fireflies.hz[i] = z;
      fireflies.phase[i] = rand() * Math.PI * 2;
      fireflies.speed[i] = 0.5 + rand() * 0.5;
      i++;
    }
    const seedEmbers = (batch, source, times, periods) => {
      if (!source) return;
      batch.prevShown = 0;
      const y = Number.isFinite(source.y) ? source.y : heightAt(source.x, source.z);
      for (let i = 0; i < EMBER_CAP; i++) {
        batch.hx[i] = source.x;
        batch.hz[i] = source.z;
        batch.hy[i] = y + 0.5;
        batch.phase[i] = rand() * Math.PI * 2;
        batch.speed[i] = 0.8 + rand() * 0.6;
        periods[i] = 1.2 + rand() * 0.6;
        times[i] = rand() * periods[i];
      }
    };
    seedEmbers(embers, fire, emberT, emberPeriod);
    seedEmbers(secondaryEmbers, secondaryFire, secondaryEmberT, secondaryEmberPeriod);
    // Each fire's burst cycle runs on its own proximity-paused clock: it advances only while that fire is
    // near, so a distant view neither advances the burst nor leaves it to catch up when the view returns.
    const fireX = fire ? fire.x : 0, fireZ = fire ? fire.z : 0;
    const fireY = fire ? (Number.isFinite(fire.y) ? fire.y : heightAt(fire.x, fire.z)) : 0;
    const hearthX = secondaryFire ? secondaryFire.x : 0, hearthZ = secondaryFire ? secondaryFire.z : 0;
    const hearthY = secondaryFire ? (Number.isFinite(secondaryFire.y) ? secondaryFire.y : heightAt(secondaryFire.x, secondaryFire.z)) : 0;
    let emberClock = 0, hearthClock = 0, emberNear = true, hearthNear = true;
    addChild(root, butterflies[0].node, butterflies[1].node, fireflies.node, embers.node);
    if (secondaryEmbers) addChild(root, secondaryEmbers.node);
    // 0 needs placement (also after a burst), 1 rests and 2 moves. Resting instances keep their pose;
    // their clocks count only nearby time, while the day/night population still settles normally.
    const step = (b, i, dt, elapsed) => {
      const data = b.node.instanceData, o = i * 20, state = b.active[i];
      const active = activeAt(state ? data[o + 12] : b.hx[i], state ? data[o + 13] : b.hy[i] + 1, state ? data[o + 14] : b.hz[i], state === 2, 24, 32);
      if (data[o + 15] !== 1) b.time[i] = elapsed;
      else if (active) b.time[i] += dt;
      b.active[i] = active ? 2 : 1;
      return !state || i >= b.node.instanceCount || active;
    };
    const updateButterflies = (b, dt, elapsed) => {
      const data = b.node.instanceData;
      let changed = false;
      for (let i = 0; i < b.shown; i++) {
        if (activeAt && !step(b, i, dt, elapsed)) continue;
        const time = activeAt ? b.time[i] : elapsed, t = time * b.speed[i] + b.phase[i];
        const x = b.hx[i] + Math.cos(t) * 0.8;
        const z = b.hz[i] + Math.sin(t * 1.3) * 0.8;
        const y = b.hy[i] + 0.6 + Math.sin(t * 2.1) * 0.3;
        const yaw = Math.atan2(-Math.sin(t), Math.cos(t * 1.3) * 1.3);
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(time * 22 + b.phase[i]));
        writeInstance(data, i * 20, yaw, flap, x, y, z, 1, b.matrixLiving);
        changed = true;
      }
      return changed;
    };
    const updateFireflies = (dt, elapsed) => {
      const f = fireflies, data = f.node.instanceData;
      const decay = Math.exp(-BURST_DAMP * dt);
      let changed = false;
      for (let i = 0; i < f.shown; i++) {
        if (activeAt && !step(f, i, dt, elapsed)) continue;
        if (!activeAt || f.active[i] === 2) {
          f.hx[i] += burstVx[i] * dt;
          f.hz[i] += burstVz[i] * dt;
          burstVx[i] *= decay;
          burstVz[i] *= decay;
        }
        const time = activeAt ? f.time[i] : elapsed, t = time * f.speed[i] + f.phase[i];
        const x = f.hx[i] + Math.sin(t) * 1.4 + Math.sin(t * 0.37 + f.phase[i]) * 0.6;
        const z = f.hz[i] + Math.cos(t * 0.8 + f.phase[i]) * 1.4 + Math.cos(t * 0.53) * 0.6;
        const y = f.hy[i] + 1 + Math.sin(t * 1.3) * 0.6;
        const blink = Math.max(0, Math.sin(time * 1.7 + f.phase[i]));
        writeInstance(data, i * 20, t, 1, x, y, z, 0.2 + 0.8 * blink * blink * blink, f.matrixLiving);
        changed = true;
      }
      return changed;
    };
    // An ember's speed is dealt when its rise begins, and kept for the whole rise: a burst's embers are fast
    // from the moment they leave the fire, and nothing changes speed mid-flight.
    const updateEmbers = (e, times, periods, dt, clock, burstNow) => {
      const data = e.node.instanceData;
      let changed = false;
      for (let i = 0; i < e.shown; i++) {
        if (activeAt && !step(e, i, dt, clock)) continue;
        if (!activeAt || e.active[i] === 2) times[i] += dt;
        if (times[i] >= periods[i]) {
          times[i] -= periods[i];
          e.speed[i] = (0.8 + rand() * 0.6) * (burstNow ? EMBER_BURST_SPEED : 1);
        }
        const time = activeAt ? e.time[i] : clock, k = times[i] / periods[i];
        const x = e.hx[i] + Math.sin(time * 2.6 + e.phase[i]) * 0.12 * k;
        const z = e.hz[i] + Math.cos(time * 2.1 + e.phase[i]) * 0.12 * k;
        writeInstance(data, i * 20, time * 3 + e.phase[i], 1, x, e.hy[i] + Math.min(times[i] * e.speed[i], EMBER_RISE), z, 1 - k, e.matrixLiving);
        changed = true;
      }
      return changed;
    };
    const finish = (b, changed) => {
      b.node.instanceCount = b.shown;
      b.node.visible = b.shown > 0;
      if (changed) b.node.instanceVersion++;
    };
    const update = (dt, elapsed, day, night, fireLit, secondaryFireLit = 0) => {
      const fraction = FRACTION[renderer.quality];
      const butterflyTarget = Math.round(BUTTERFLY_CAP * fraction * day);
      settle(butterflies[0], butterflyTarget, dt);
      settle(butterflies[1], butterflyTarget, dt);
      settle(fireflies, Math.round(FIREFLY_CAP * fraction * night), dt);
      // The pits breathe two to four embers by day and night; a tenth of the cycle is a burst of more, rising
      // faster, the two fires half a cycle apart. Each cycle runs on its own proximity-paused clock, advanced
      // only while its fire is near, so a distant view neither advances the burst nor catches up on return.
      if (activeAt) {
        if (fire) emberNear = activeAt(fireX, fireY + 1, fireZ, emberNear, 24, 32);
        if (secondaryFire) hearthNear = activeAt(hearthX, hearthY + 1, hearthZ, hearthNear, 24, 32);
      }
      if (!activeAt || fire && emberNear) emberClock += dt;
      if (secondaryFire && (!activeAt || hearthNear)) hearthClock += dt;
      const burst = (emberClock % EMBER_PERIOD) < EMBER_BURST;
      const calm = Math.max(2, Math.round(EMBER_CALM * fraction));
      const emberTarget = fire ? Math.round((burst ? EMBER_BURST_COUNT * fraction : calm) * fireLit) : 0;
      settle(embers, emberTarget, dt, burst || embers.shown > emberTarget ? EMBER_BURST_STEP : FADE_STEP);
      for (let i = embers.prevShown; i < embers.shown; i++) {
        emberT[i] = 0;
        embers.speed[i] = (0.8 + rand() * 0.6) * (burst ? EMBER_BURST_SPEED : 1);
        if (activeAt) { embers.active[i] = 0; embers.node.instanceData[i * 20 + 15] = 0; }
      }
      embers.prevShown = embers.shown;
      const hearthBurst = ((hearthClock + EMBER_PERIOD / 2) % EMBER_PERIOD) < EMBER_BURST;
      if (secondaryEmbers) {
        const hearthTarget = Math.round((hearthBurst ? EMBER_BURST_COUNT * fraction : calm) * secondaryFireLit);
        settle(secondaryEmbers, hearthTarget, dt, hearthBurst || secondaryEmbers.shown > hearthTarget ? EMBER_BURST_STEP : FADE_STEP);
        for (let i = secondaryEmbers.prevShown; i < secondaryEmbers.shown; i++) {
          secondaryEmberT[i] = 0;
          secondaryEmbers.speed[i] = (0.8 + rand() * 0.6) * (hearthBurst ? EMBER_BURST_SPEED : 1);
          if (activeAt) { secondaryEmbers.active[i] = 0; secondaryEmbers.node.instanceData[i * 20 + 15] = 0; }
        }
        secondaryEmbers.prevShown = secondaryEmbers.shown;
      }
      finish(butterflies[0], updateButterflies(butterflies[0], dt, elapsed));
      finish(butterflies[1], updateButterflies(butterflies[1], dt, elapsed));
      finish(fireflies, updateFireflies(dt, elapsed));
      finish(embers, updateEmbers(embers, emberT, emberPeriod, dt, emberClock, burst));
      if (secondaryEmbers) finish(secondaryEmbers, updateEmbers(secondaryEmbers, secondaryEmberT, secondaryEmberPeriod, dt, hearthClock, hearthBurst));
    };
    // Re-homes a few existing fireflies to the shaken tree and scatters them outward; spawns none.
    const burst = (x, z) => {
      const count = Math.min(BURST_MAX, fireflies.shown);
      const y = heightAt(x, z);
      for (let n = 0; n < count; n++) {
        const i = (burstNext + n) % fireflies.shown;
        const a = n / count * Math.PI * 2 + rand() * 0.6, s = 1.5 + rand();
        fireflies.hx[i] = x;
        fireflies.hz[i] = z;
        fireflies.hy[i] = y;
        burstVx[i] = Math.cos(a) * s;
        burstVz[i] = Math.sin(a) * s;
        if (activeAt) fireflies.active[i] = 0;
      }
      burstNext = (burstNext + count) % FIREFLY_CAP;
    };
    const dispose = () => {
      removeChild(root, butterflies[0].node);
      removeChild(root, butterflies[1].node);
      removeChild(root, fireflies.node);
      removeChild(root, embers.node);
      if (secondaryEmbers) removeChild(root, secondaryEmbers.node);
      butterflies[0].shown = butterflies[1].shown = fireflies.shown = embers.shown = 0;
      if (secondaryEmbers) secondaryEmbers.shown = 0;
    };
    const stats = () => ({ butterflies: butterflies[0].shown + butterflies[1].shown, fireflies: fireflies.shown, embers: embers.shown + (secondaryEmbers ? secondaryEmbers.shown : 0), surfaceEmbers: embers.shown, headquartersEmbers: secondaryEmbers ? secondaryEmbers.shown : 0 });
    return { update, burst, dispose, stats };
  };
  BL.critters = { create };
})();
