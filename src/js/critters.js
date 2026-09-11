(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hubModels } = BL;
  const { mulberry32 } = BL.math;
  const { createNode, addChild, removeChild } = BL.scene;
  const SEED = 9137;
  const BUTTERFLY_CAP = 24, FIREFLY_CAP = 48, EMBER_CAP = 16;
  const FRACTION = { high: 1, medium: 0.5, low: 0.25 };
  // Seconds between one individual appearing or leaving
  const FADE_STEP = 0.12;
  const BURST_MAX = 8;
  const BURST_DAMP = 2;
  const makeBatch = (geometry, cap, matrixLiving = false) => {
    const node = createNode({ geometry, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, matrixLiving });
    return { node, cap, shown: 0, fade: 0, matrixLiving, hx: new Float32Array(cap), hz: new Float32Array(cap), hy: new Float32Array(cap), phase: new Float32Array(cap), speed: new Float32Array(cap) };
  };
  // Yaw a about y, x-scale sx, translation, glow
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
  const settle = (batch, target, dt) => {
    if (batch.shown === target) {
      batch.fade = 0;
      return;
    }
    batch.fade += dt;
    if (batch.fade < FADE_STEP) return;
    batch.fade = 0;
    batch.shown += batch.shown < target ? 1 : -1;
  };
  // Butterflies, fireflies and embers for one scene
  const create = ({ root, renderer, flowers, fire, meadowRadius, heightAt }) => {
    const rand = mulberry32(SEED);
    const butterflies = [makeBatch(hubModels.butterfly(0), BUTTERFLY_CAP, true), makeBatch(hubModels.butterfly(1), BUTTERFLY_CAP, true)];
    const fireflies = makeBatch(hubModels.firefly(), FIREFLY_CAP, true);
    const embers = makeBatch(hubModels.ember(), EMBER_CAP, true);
    const burstVx = new Float32Array(FIREFLY_CAP), burstVz = new Float32Array(FIREFLY_CAP);
    const emberT = new Float32Array(EMBER_CAP), emberPeriod = new Float32Array(EMBER_CAP);
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
    if (fire) {
      const y = heightAt(fire.x, fire.z);
      for (let i = 0; i < EMBER_CAP; i++) {
        embers.hx[i] = fire.x;
        embers.hz[i] = fire.z;
        embers.hy[i] = y + 0.5;
        embers.phase[i] = rand() * Math.PI * 2;
        embers.speed[i] = 0.8 + rand() * 0.6;
        emberPeriod[i] = 1.2 + rand() * 0.6;
        emberT[i] = rand() * emberPeriod[i];
      }
    }
    addChild(root, butterflies[0].node, butterflies[1].node, fireflies.node, embers.node);
    const updateButterflies = (b, elapsed) => {
      const data = b.node.instanceData;
      for (let i = 0; i < b.shown; i++) {
        const t = elapsed * b.speed[i] + b.phase[i];
        const x = b.hx[i] + Math.cos(t) * 0.8;
        const z = b.hz[i] + Math.sin(t * 1.3) * 0.8;
        const y = b.hy[i] + 0.6 + Math.sin(t * 2.1) * 0.3;
        const yaw = Math.atan2(-Math.sin(t), Math.cos(t * 1.3) * 1.3);
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(elapsed * 22 + b.phase[i]));
        writeInstance(data, i * 20, yaw, flap, x, y, z, 1, b.matrixLiving);
      }
    };
    const updateFireflies = (dt, elapsed) => {
      const f = fireflies, data = f.node.instanceData;
      const decay = Math.exp(-BURST_DAMP * dt);
      for (let i = 0; i < f.shown; i++) {
        f.hx[i] += burstVx[i] * dt;
        f.hz[i] += burstVz[i] * dt;
        burstVx[i] *= decay;
        burstVz[i] *= decay;
        const t = elapsed * f.speed[i] + f.phase[i];
        const x = f.hx[i] + Math.sin(t) * 1.4 + Math.sin(t * 0.37 + f.phase[i]) * 0.6;
        const z = f.hz[i] + Math.cos(t * 0.8 + f.phase[i]) * 1.4 + Math.cos(t * 0.53) * 0.6;
        const y = f.hy[i] + 1 + Math.sin(t * 1.3) * 0.6;
        const blink = Math.max(0, Math.sin(elapsed * 1.7 + f.phase[i]));
        writeInstance(data, i * 20, t, 1, x, y, z, 0.2 + 0.8 * blink * blink * blink, f.matrixLiving);
      }
    };
    const updateEmbers = (dt, elapsed) => {
      const e = embers, data = e.node.instanceData;
      for (let i = 0; i < e.shown; i++) {
        emberT[i] += dt;
        if (emberT[i] >= emberPeriod[i]) emberT[i] -= emberPeriod[i];
        const k = emberT[i] / emberPeriod[i];
        const x = e.hx[i] + Math.sin(elapsed * 2.6 + e.phase[i]) * 0.12 * k;
        const z = e.hz[i] + Math.cos(elapsed * 2.1 + e.phase[i]) * 0.12 * k;
        writeInstance(data, i * 20, elapsed * 3 + e.phase[i], 1, x, e.hy[i] + emberT[i] * e.speed[i], z, 1 - k, e.matrixLiving);
      }
    };
    const finish = (b) => {
      b.node.instanceCount = b.shown;
      b.node.visible = b.shown > 0;
      if (b.shown > 0) b.node.instanceVersion++;
    };
    const update = (dt, elapsed, day, night, fireLit) => {
      const fraction = FRACTION[renderer.quality];
      const butterflyTarget = Math.round(BUTTERFLY_CAP * fraction * day);
      settle(butterflies[0], butterflyTarget, dt);
      settle(butterflies[1], butterflyTarget, dt);
      settle(fireflies, Math.round(FIREFLY_CAP * fraction * night), dt);
      settle(embers, fire ? Math.round(EMBER_CAP * fraction * night * fireLit) : 0, dt);
      updateButterflies(butterflies[0], elapsed);
      updateButterflies(butterflies[1], elapsed);
      updateFireflies(dt, elapsed);
      updateEmbers(dt, elapsed);
      finish(butterflies[0]);
      finish(butterflies[1]);
      finish(fireflies);
      finish(embers);
    };
    // Re-home a few fireflies to a shaken tree and scatter them outward
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
      }
      burstNext = (burstNext + count) % FIREFLY_CAP;
    };
    const dispose = () => {
      removeChild(root, butterflies[0].node);
      removeChild(root, butterflies[1].node);
      removeChild(root, fireflies.node);
      removeChild(root, embers.node);
      butterflies[0].shown = butterflies[1].shown = fireflies.shown = embers.shown = 0;
    };
    const stats = () => ({ butterflies: butterflies[0].shown + butterflies[1].shown, fireflies: fireflies.shown, embers: embers.shown });
    return { update, burst, dispose, stats };
  };
  BL.critters = { create };
})();
