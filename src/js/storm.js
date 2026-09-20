// Weather driven by the Bitcoin feed: each transaction rains drops sized by its weight,
// each block strikes lightning and rolls thunder, and the next block's median fee sets the
// overcast, sunny at a cheap block and a full storm at an expensive one. One fixed-capacity
// instanced batch for the drops, one polyline bolt, a sky flash and an overcast tint written
// over the clock's colours after it samples (the clock itself, its sun, moon, phases and
// factors are never touched, and sunny leaves every sampled value as it was), and a small
// procedural rumble on the rally's audio pattern.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { createNode, addChild, removeChild } = BL.scene;
  const { clamp, lerp } = math;
  const RAIN_CAP = 480, RAIN_CAP_CANVAS = 120, RAIN_RANGE = 14, RAIN_HEIGHT = 16, RAIN_SPREAD = 6;
  const DROP_MIN = 0.7, DROP_MAX = 4, DROP_BASE_VSIZE = 140, DROPS_MIN = 2, DROPS_MAX = 8;
  const FALL_BASE = 10, FALL_PER_SIZE = 3, SPLASH_SIZE = 1.4;
  const FLASH_MAX = 0.85, FLASH_TAU = 0.12, BOLT_SHOW = 0.25, BOLT_RANGE = 18, BOLT_HEIGHT = 26;
  const THUNDER_DELAY_MIN = 0.5, THUNDER_DELAY_SPREAD = 1, STORAGE_KEY = "oogaboogaland.audio", MASTER = 0.6, NOISE_SECONDS = 2;
  // Overcast from fee pressure on a log scale: an empty mempool or SUNNY_FEE sat/vB and under is clear, STORM_FEE and
  // over is the full storm. Relay floors sit near 0.1 sat/vB, so a quiet night at 0.3 already reads as light cloud.
  const SUNNY_FEE = 0.1, STORM_FEE = 20, OVERCAST_EASE = 1.5, OVERCAST_STEP = 0.05, OVERCAST_MIX = 0.7, OVERCAST_DARKEN = 0.22, OVERCAST_DIM = 0.45;
  const OVERCAST_TINT = [0.9, 0.93, 1], FOG_NEAR = 40, FOG_FAR = 150, FOG_OFF_NEAR = 400, FOG_OFF_FAR = 600;
  // The sky stays clear until the overcast passes a band, wider by day, so the island is sunny more often and
  // the rain can drizzle under a clear sky; the band reads the clock's day factor and never writes it.
  const CLEAR_NIGHT = 0.25, CLEAR_DAY = 0.55;
  const overcastFor = (fee) => clamp(Math.log(Math.max(SUNNY_FEE, fee) / SUNNY_FEE) / Math.log(STORM_FEE / SUNNY_FEE), 0, 1);
  const cloudFor = (overcast, day) => {
    const band = lerp(CLEAR_NIGHT, CLEAR_DAY, clamp(day, 0, 1));
    return clamp((overcast - band) / (1 - band), 0, 1);
  };
  // Desaturate toward a cool grey of the colour's own brightness, so day stays bright and night stays dark.
  const greyen = (c, k) => {
    if (!c) return;
    const grey = (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) * (1 - OVERCAST_DARKEN * k);
    c[0] += (grey * OVERCAST_TINT[0] - c[0]) * k;
    c[1] += (grey * OVERCAST_TINT[1] - c[1]) * k;
    c[2] += (grey * OVERCAST_TINT[2] - c[2]) * k;
  };
  const rainDrop = models.cached(() => models.noShadow(models.box({ w: 0.05, h: 0.6, d: 0.05, color: "#c6dbee", emissive: 0.45 })));
  const SPLASH = [models.particleGeometry("#d8e8f4", 0.07, 0.6)];
  // One jagged trunk with two branches, unit height, built once for every strike.
  const bolt = models.cached(() => {
    const rand = math.mulberry32(7);
    const jag = (x0, z0, y0, y1, steps, spread) => {
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push({ x: x0 + (rand() - 0.5) * spread * (i && i < steps ? 1 : 0.3), y: lerp(y0, y1, t), z: z0 + (rand() - 0.5) * spread * (i && i < steps ? 1 : 0.3) });
      }
      return points;
    };
    const trunk = jag(0, 0, 1, 0, 9, 0.16);
    const b1 = trunk[3], b2 = trunk[6];
    return models.merge(
      models.polyline({ points: trunk, color: "#eef5ff", emissive: 1 }),
      models.polyline({ points: [b1, ...jag(b1.x + 0.12, b1.z, b1.y, b1.y - 0.3, 4, 0.12).slice(1)], color: "#dbe9ff", emissive: 1 }),
      models.polyline({ points: [b2, ...jag(b2.x - 0.1, b2.z + 0.05, b2.y, b2.y - 0.22, 3, 0.1).slice(1)], color: "#dbe9ff", emissive: 1 })
    );
  });
  const brighten = (c, k) => {
    if (!c) return;
    c[0] += (1 - c[0]) * k;
    c[1] += (1 - c[1]) * k;
    c[2] += (1 - c[2]) * k;
  };
  // The flash strobes twice, then decays: full, dip, second bright, tail.
  const flashAt = (t) => t < 0.08 ? 1 : t < 0.14 ? 0.25 : t < 0.22 ? 0.85 : 0.85 * Math.exp(-(t - 0.22) / FLASH_TAU);

  const create = ({ root, renderer, camera, heightAt, fx = null }) => {
    const cap = renderer.kind === "canvas2d" ? RAIN_CAP_CANVAS : RAIN_CAP;
    const node = createNode({ geometry: rainDrop(), instanceData: new Float32Array(cap * 20), instanceCount: 0, drawInstanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    const x = new Float32Array(cap), y = new Float32Array(cap), z = new Float32Array(cap), w = new Float32Array(cap), h = new Float32Array(cap), vy = new Float32Array(cap);
    let count = 0, transactions = 0, strikes = 0, flash = 0, flashT = -1, boltT = -1, thunderAt = -1;
    // Sunny until the feed projects a fee, so an offline page keeps the clock's frame; the first projection snaps, later ones ease.
    let overcast = 0, overcastTarget = 0, projected = false, nextFee = 0, cloud = 0;
    const fog = new Float32Array(3);
    const boltNode = createNode({ geometry: bolt(), visible: false });
    addChild(root, node);
    addChild(root, boltNode);
    // Sound: the context opens only after a real gesture, so a strike on a fresh page stays silent and warns nothing.
    let ctx = null, master = null, noise = null, rainGain = null, muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
    }
    const initAudio = () => {
      if (ctx || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const hiss = ctx.createBiquadFilter();
      hiss.type = "bandpass";
      hiss.frequency.value = 2600;
      hiss.Q.value = 0.5;
      rainGain = ctx.createGain();
      rainGain.gain.value = 0;
      noise.connect(hiss);
      hiss.connect(rainGain);
      rainGain.connect(master);
      noise.start();
      if (ctx.state === "suspended") ctx.resume();
      return true;
    };
    const rumble = () => {
      if (!initAudio() && !ctx) return;
      const t = ctx.currentTime;
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(420, t);
      low.frequency.exponentialRampToValueAtTime(90, t + 2.8);
      low.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      noise.connect(low);
      low.connect(g);
      g.connect(master);
      window.setTimeout(() => {
        low.disconnect();
        g.disconnect();
      }, 3400);
    };
    const weather = (fee) => {
      nextFee = fee;
      const target = overcastFor(fee);
      if (!projected) {
        projected = true;
        overcast = overcastTarget = target;
      } else if (target === 0 || target === 1 || Math.abs(target - overcastTarget) >= OVERCAST_STEP) overcastTarget = target;
    };
    const rain = (vsize) => {
      transactions++;
      const size = clamp(DROP_MIN + Math.log2(Math.max(1, vsize / DROP_BASE_VSIZE)) * 0.5, DROP_MIN, DROP_MAX);
      // Any overcast rains at least one drop a transaction; the full count comes with the full storm.
      const drops = overcast > 0 ? Math.max(1, Math.round(Math.min(DROPS_MAX, DROPS_MIN + Math.floor(vsize / 200)) * overcast)) : 0;
      const t = camera.target;
      for (let n = 0; n < drops && count < cap; n++, count++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * RAIN_RANGE;
        x[count] = t.x + Math.cos(a) * r;
        z[count] = t.z + Math.sin(a) * r;
        y[count] = t.y + RAIN_HEIGHT + Math.random() * RAIN_SPREAD;
        w[count] = size;
        h[count] = 0.8 + size * 0.35;
        vy[count] = FALL_BASE + FALL_PER_SIZE * size;
      }
    };
    const strike = () => {
      strikes++;
      flashT = 0;
      boltT = 0;
      thunderAt = THUNDER_DELAY_MIN + Math.random() * THUNDER_DELAY_SPREAD;
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (BOLT_RANGE - 6), t = camera.target;
      const bx = t.x + Math.cos(a) * r, bz = t.z + Math.sin(a) * r;
      const ground = heightAt(bx, bz);
      boltNode.position.x = bx;
      boltNode.position.z = bz;
      boltNode.position.y = ground;
      boltNode.rotation.y = Math.random() * Math.PI * 2;
      boltNode.scale.x = boltNode.scale.z = 4 + Math.random() * 3;
      boltNode.scale.y = t.y + RAIN_HEIGHT + BOLT_HEIGHT - ground;
      boltNode.visible = true;
    };
    const update = (dt, opts) => {
      const previousCount = node.instanceCount;
      // A steady walk, OVERCAST_EASE seconds across the whole range, so the target is reached exactly.
      if (overcast !== overcastTarget) {
        const step = dt / OVERCAST_EASE;
        overcast = overcast > overcastTarget ? Math.max(overcastTarget, overcast - step) : Math.min(overcastTarget, overcast + step);
      }
      const data = node.instanceData;
      for (let i = 0; i < count; i++) {
        y[i] -= vy[i] * dt;
        if (y[i] <= heightAt(x[i], z[i])) {
          if (fx && w[i] >= SPLASH_SIZE) fx.burst(x[i], y[i] + 0.05, z[i], 2, SPLASH, 0.9);
          count--;
          x[i] = x[count]; y[i] = y[count]; z[i] = z[count]; w[i] = w[count]; h[i] = h[count]; vy[i] = vy[count];
          i--;
          continue;
        }
        const o = i * 20, s = w[i] * 0.5 + 0.5;
        data[o] = s; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0;
        data[o + 4] = 0; data[o + 5] = h[i]; data[o + 6] = 0; data[o + 7] = 0;
        data[o + 8] = 0; data[o + 9] = 0; data[o + 10] = s; data[o + 11] = 0;
        data[o + 12] = x[i]; data[o + 13] = y[i]; data[o + 14] = z[i]; data[o + 15] = 1;
        data[o + 16] = 1; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
      }
      node.instanceCount = node.drawInstanceCount = count;
      if (count || previousCount) node.instanceVersion++;
      if (rainGain) rainGain.gain.setTargetAtTime(Math.min(1, count / 120) * 0.14, ctx.currentTime, 0.2);
      if (boltT >= 0) {
        boltT += dt;
        if (boltT > BOLT_SHOW) {
          boltT = -1;
          boltNode.visible = false;
        }
      }
      if (thunderAt >= 0) {
        thunderAt -= dt;
        if (thunderAt < 0) {
          thunderAt = -1;
          rumble();
        }
      }
      flash = 0;
      if (flashT >= 0) {
        flashT += dt;
        flash = flashAt(flashT);
        if (flash < 0.01) {
          flash = 0;
          flashT = -1;
        }
      }
      if (opts) {
        // A clear sky leaves the clock's colours, light and fog exactly as sampled.
        cloud = cloudFor(overcast, opts.day);
        if (cloud > 0.02) {
          const k = cloud * OVERCAST_MIX;
          greyen(opts.clear, k); greyen(opts.horizon, k); greyen(opts.zenith, k);
          greyen(opts.sky, k); greyen(opts.ground, k); greyen(opts.direct, k);
          opts.directStrength *= 1 - cloud * (1 - OVERCAST_DIM);
          fog[0] = opts.horizon[0]; fog[1] = opts.horizon[1]; fog[2] = opts.horizon[2];
          opts.fog = fog;
          opts.fogNear = lerp(FOG_OFF_NEAR, FOG_NEAR, cloud);
          opts.fogFar = lerp(FOG_OFF_FAR, FOG_FAR, cloud);
        } else opts.fog = null;
      }
      if (flash > 0 && opts) {
        const k = flash * FLASH_MAX;
        brighten(opts.clear, k); brighten(opts.horizon, k); brighten(opts.zenith, k);
        brighten(opts.sky, k); brighten(opts.ground, k); brighten(opts.direct, k);
        opts.ambientFloor = lerp(opts.ambientFloor, 0.9, k);
        opts.directStrength *= 1 + k;
      }
    };
    const setMuted = (on) => {
      muted = !!on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
    };
    const dispose = () => {
      removeChild(root, node);
      removeChild(root, boltNode);
      count = 0;
      if (ctx) ctx.close();
      ctx = master = noise = rainGain = null;
    };
    const state = {
      get drops() { return count; },
      get capacity() { return cap; },
      get flash() { return flash; },
      get bolt() { return boltT >= 0; },
      get thunderPending() { return thunderAt >= 0; },
      get strikes() { return strikes; },
      get overcast() { return overcast; },
      get overcastTarget() { return overcastTarget; },
      get cloud() { return cloud; },
      get nextFee() { return nextFee; },
      get projected() { return projected; },
      get transactions() { return transactions; },
      get audio() { return !!ctx; },
      get muted() { return muted; },
      drop: (i) => i < count ? { x: x[i], y: y[i], z: z[i], size: w[i], fall: vy[i] } : null
    };
    return {
      rain, strike, weather, update, setMuted, dispose, state,
      get active() { return count > 0 || flashT >= 0 || boltT >= 0 || thunderAt >= 0; },
      stats: () => ({ rainDrops: count, strikes })
    };
  };
  BL.storm = { RAIN_CAP, SUNNY_FEE, STORM_FEE, CLEAR_NIGHT, CLEAR_DAY, overcastFor, cloudFor, create };
})();
