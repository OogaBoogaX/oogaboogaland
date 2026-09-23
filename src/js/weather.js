// The island's weather, derived from the chain snapshot rather than pinged by it. Three axes come
// out of chain.js — soak (how full the pool is), chill (how slowly blocks are landing) and gale (how
// fast transactions are arriving) — and they name one of eight standing states, from sunny through
// monsoon and blizzard. Precipitation is a population held at a target, not a burst per transaction,
// so it rains for as long as the mempool is full; a transaction gusts the rate and a block strikes.
//
// One fixed-capacity instanced batch carries rain or snow, never both, with the drop geometry swapped
// between two cached builds. Bolts are eight jagged variants built once at boot and picked at random,
// so a strike allocates nothing. The sky is written over the daylight clock's colours after it
// samples; the clock, its sun, moon, phases and factors are never touched, and a clear sky leaves
// every sampled value exactly as it was.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { createNode, addChild, removeChild } = BL.scene;
  const { clamp, lerp, mulberry32 } = math;

  // Tier-scaled populations: the batch is one draw call at any size, the cost is the simulation.
  const CAP = { high: 720, medium: 480, low: 260 }, CAP_CANVAS = 120;
  // The weather is a cell standing over one place, not a curtain that follows the camera. It falls
  // inside FIELD_R of its centre and the sky only greys for a camera close enough to be under it.
  const FIELD_R = 16, FIELD_TOP = 17, FIELD_SPREAD = 7, RECYCLE_BELOW = 8;
  // Full under the islet, gone by the far end of its bridge, so a storm over there never greys the
  // sky over here: the home island is ~58 out from the cell and the rim head ~29.
  // A distant bolt still flickers the sky and still rolls, both faintly; never zero, because an
  // exponential gain ramp cannot be given one.
  const NEAR_FULL = 16, NEAR_NONE = 30, DISTANT_FLASH = 0.3, DISTANT_THUNDER = 0.12;
  // Sound carries less far than the sky greys, and deliberately so: the rain is only heard around the
  // rainforest itself. The islet is 13 across from its centre and the bridge's near end is 29 out, so
  // full on the island, fading over the far half of the crossing and silent before the home rim.
  const HEARD_FULL = 14, HEARD_NONE = 24;
  // A fixed deck of cloud nodes over the cell, sharing one cached geometry so the whole sky above the
  // island is a single draw call. They are built once and never allocated again: coverage is scale and
  // visibility, colour is a geometry swap, and a strike lights them through each node's own glow.
  // A rainforest is never without cloud, so the deck is always there: CLOUD_FLOOR of it stands even
  // under a clear sky and the weather only thickens and darkens it. Every node shares one cached
  // geometry, so the whole deck is a single instanced draw call whatever its size.
  const CLOUD = { high: 48, medium: 36, low: 22 }, CLOUD_CANVAS = 14;
  const CLOUD_R = 26, CLOUD_LIFT = 3.2, CLOUD_DRIFT = 0.06, CLOUD_EASE = 0.7;
  const CLOUD_FLOOR = 0.62, CLOUD_TIERS = 3;
  const DROP_MIN = 0.7, DROP_MAX = 4, DROP_BASE_VSIZE = 140;
  const RAIN_FALL = 11, RAIN_FALL_PER_SIZE = 3, SNOW_FALL = 1.6, SNOW_FALL_SPREAD = 1.1;
  const SPLASH_SIZE = 1.4, GUST_SECONDS = 2.5, GUST_LIFT = 0.35;
  const WIND_MAX = 9, WIND_TURN = 0.05, SNOW_SWAY = 0.9, SNOW_SWAY_RATE = 1.7;
  const FLASH_MAX = 0.85, FLASH_TAU = 0.12, BOLT_SHOW = 0.25, BOLT_RANGE = 18, BOLT_HEIGHT = 26, BOLT_VARIANTS = 8;
  const THUNDER_DELAY_MIN = 0.5, THUNDER_DELAY_SPREAD = 1;
  const AMBIENT_MIN = 14, AMBIENT_SPREAD = 26;
  // Weather is background, not an event: the whole bed sits well under the rally and drop engines, and
  // a strike is only a few times the rain rather than the loudest thing on the page.
  const STORAGE_KEY = "oogaboogaland.audio", MASTER = 0.3, NOISE_SECONDS = 2;
  const EASE = 1.5, DEAD_BAND = 0.02;
  // The sky stays the clock's until the overcast passes a band, wider by day, so a shower can fall
  // under a clear noon sky and a quiet night stays a clear starry night.
  const CLEAR_NIGHT = 0.25, CLEAR_DAY = 0.55;
  const OVERCAST_MIX = 0.7, OVERCAST_DARKEN = 0.22, OVERCAST_DIM = 0.45;
  const OVERCAST_TINT = [0.9, 0.93, 1], SNOW_TINT = [0.97, 0.98, 1];
  const FOG_NEAR = 40, FOG_FAR = 150, FOG_OFF_NEAR = 400, FOG_OFF_FAR = 600;
  const WHITEOUT_NEAR = 8, WHITEOUT_FAR = 42;
  const COLD = 0.5, WET = 0.1, FAIR = 0.3, HEAVY = 0.6, WINDY = 0.6;

  // Eight standing states. `wet` is how much falls, `snow` its form, `storm` whether it thunders.
  const STATES = {
    sunny: { name: "sunny", wet: 0, snow: false, storm: false },
    "light rain": { name: "light rain", wet: 0.28, snow: false, storm: false },
    rain: { name: "rain", wet: 0.6, snow: false, storm: false },
    thunderstorm: { name: "thunderstorm", wet: 1, snow: false, storm: true },
    monsoon: { name: "monsoon", wet: 1, snow: false, storm: true },
    flurries: { name: "flurries", wet: 0.22, snow: true, storm: false },
    snow: { name: "snow", wet: 0.55, snow: true, storm: false },
    blizzard: { name: "blizzard", wet: 1, snow: true, storm: false }
  };
  const stateFor = (soak, chill, gale) => {
    const cold = chill >= COLD;
    if (soak < WET) return STATES.sunny;
    if (cold) return soak < FAIR ? STATES.flurries : soak < HEAVY ? STATES.snow : gale >= WINDY ? STATES.blizzard : STATES.snow;
    if (soak < FAIR) return STATES["light rain"];
    if (soak < HEAVY) return STATES.rain;
    return gale >= WINDY ? STATES.monsoon : STATES.thunderstorm;
  };
  const cloudFor = (overcast, day) => {
    const band = lerp(CLEAR_NIGHT, CLEAR_DAY, clamp(day, 0, 1));
    return clamp((overcast - band) / (1 - band), 0, 1);
  };
  // Desaturate toward a cool grey of the colour's own brightness, so day stays bright and night dark.
  const greyen = (c, k, tint) => {
    if (!c) return;
    const grey = (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) * (1 - OVERCAST_DARKEN * k);
    c[0] += (grey * tint[0] - c[0]) * k;
    c[1] += (grey * tint[1] - c[1]) * k;
    c[2] += (grey * tint[2] - c[2]) * k;
  };
  const brighten = (c, k) => {
    if (!c) return;
    c[0] += (1 - c[0]) * k;
    c[1] += (1 - c[1]) * k;
    c[2] += (1 - c[2]) * k;
  };
  // A whiteout lifts everything toward a flat bright grey instead of darkening it.
  const whiten = (c, k) => {
    if (!c) return;
    c[0] += (0.88 - c[0]) * k;
    c[1] += (0.9 - c[1]) * k;
    c[2] += (0.94 - c[2]) * k;
  };

  // A drop is a streak, not a bar: the per-drop size scales this cross-section, so a fat one at
  // DROP_MAX is still thin enough to read as rain rather than as a falling block.
  const rainDrop = models.cached(() => models.noShadow(models.box({ w: 0.024, h: 0.6, d: 0.024, color: "#c6dbee", emissive: 0.45 })));
  const snowFlake = models.cached(() => models.noShadow(models.merge(
    models.box({ w: 0.11, h: 0.04, d: 0.04, color: "#f4f9ff", emissive: 0.55 }),
    models.box({ w: 0.04, h: 0.04, d: 0.11, color: "#f4f9ff", emissive: 0.55 }),
    models.box({ w: 0.04, h: 0.11, d: 0.04, color: "#eaf3ff", emissive: 0.55 })
  )));
  const SPLASH = [models.particleGeometry("#d8e8f4", 0.07, 0.6)];
  // Two builds of the same puff: fair weather and a bruised storm deck. Swapping the geometry on every
  // cloud node recolours the whole sky over the island without touching a vertex.
  const puff = (seed, tone) => models.cached(() => {
    const rand = mulberry32(seed), geos = [];
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 3.4;
      // Depth against width: a puff barely a third as tall as it is wide reads as a cut-out.
      const w = 2.6 + rand() * 3.2, h = 1.9 + rand() * 1.4;
      geos.push(models.box({ w, h, d: w * (0.7 + rand() * 0.4), color: i % 2 ? tone[0] : tone[1], emissive: tone[2], offset: { x: Math.cos(a) * r, y: rand() * 0.7, z: Math.sin(a) * r } }));
    }
    return models.noShadow(models.merge(...geos));
  });
  const CLOUD_FAIR = puff(3301, ["#f2f5f8", "#dfe6ee", 0.12]);
  const CLOUD_GREY = puff(3301, ["#6d737c", "#565c66", 0.05]);
  const CLOUD_SNOW = puff(3301, ["#b9c2cc", "#98a3b0", 0.08]);

  // Eight forked bolts, unit height, each from its own seed: a jagged trunk with three branches that
  // fork again. Built once at boot and picked at random with a random turn, scale and mirror, so a
  // strike costs no geometry and no two look alike.
  const bolts = models.cached(() => {
    const out = [];
    for (let v = 0; v < BOLT_VARIANTS; v++) {
      const rand = mulberry32(1013 + v * 977);
      const jag = (x0, z0, y0, y1, steps, spread) => {
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, ends = i && i < steps ? 1 : 0.25;
          points.push({
            x: x0 + (rand() - 0.5) * spread * ends,
            y: lerp(y0, y1, t),
            z: z0 + (rand() - 0.5) * spread * ends
          });
        }
        return points;
      };
      const trunk = jag(0, 0, 1, 0, 12, 0.22);
      const geos = [models.polyline({ points: trunk, color: "#eef5ff", emissive: 1 })];
      for (let b = 0; b < 3; b++) {
        const at = trunk[3 + b * 3], drop = 0.18 + rand() * 0.22;
        const arm = jag(at.x + (rand() - 0.5) * 0.3, at.z + (rand() - 0.5) * 0.3, at.y, at.y - drop, 4, 0.16);
        geos.push(models.polyline({ points: [at, ...arm.slice(1)], color: "#dbe9ff", emissive: 1 }));
        if (rand() < 0.55) {
          const fork = arm[2];
          geos.push(models.polyline({ points: [fork, ...jag(fork.x + (rand() - 0.5) * 0.25, fork.z, fork.y, fork.y - drop * 0.6, 3, 0.12).slice(1)], color: "#cfe0ff", emissive: 1 }));
        }
      }
      out.push(models.merge(...geos));
    }
    return out;
  });
  // The flash strobes twice, then decays: full, dip, second bright, tail.
  const flashAt = (t) => t < 0.08 ? 1 : t < 0.14 ? 0.25 : t < 0.22 ? 0.85 : 0.85 * Math.exp(-(t - 0.22) / FLASH_TAU);

  const create = ({ root, renderer, camera, heightAt, fx = null, centre }) => {
    const canvas2d = renderer.kind === "canvas2d";
    const cap = canvas2d ? CAP_CANVAS : (CAP[renderer.quality] || CAP.medium);
    const node = createNode({ geometry: rainDrop(), instanceData: new Float32Array(cap * 20), instanceCount: 0, drawInstanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    const x = new Float32Array(cap), y = new Float32Array(cap), z = new Float32Array(cap);
    const w = new Float32Array(cap), h = new Float32Array(cap), vy = new Float32Array(cap), phase = new Float32Array(cap);
    let count = 0, form = "rain";
    let flash = 0, flashT = -1, boltT = -1, thunderAt = -1, ambientAt = -1, strikes = 0, transactions = 0, boltVariant = -1;
    // Everything the feed sets is a target; the live value walks there so nothing snaps.
    let soak = 0, soakTarget = 0, chill = 0, chillTarget = 0, gale = 0, galeTarget = 0;
    let gust = 0, cloud = 0, near = 0, heard = 0, windAngle = Math.random() * Math.PI * 2, windX = 0, windZ = 0, swayT = 0;
    let state = STATES.sunny, applied = false;
    const fog = new Float32Array(3);
    const variants = bolts();
    const boltNode = createNode({ geometry: variants[0], visible: false });
    addChild(root, node);
    addChild(root, boltNode);
    // The cloud deck: fixed nodes, seeded once, drifting with the wind and wrapping inside the cell.
    const cloudRand = mulberry32(8821);
    // The fallback rasterizes every face in software, so it carries a thinner deck for the same look.
    const cloudN = canvas2d ? CLOUD_CANVAS : (CLOUD[renderer.quality] || CLOUD.medium);
    const clouds = [], cloudX = new Float32Array(cloudN), cloudZ = new Float32Array(cloudN), cloudBase = new Float32Array(cloudN);
    for (let i = 0; i < cloudN; i++) {
      const a = cloudRand() * Math.PI * 2, r = Math.sqrt(cloudRand()) * CLOUD_R;
      cloudX[i] = Math.cos(a) * r;
      cloudZ[i] = Math.sin(a) * r;
      cloudBase[i] = 0.7 + cloudRand() * 0.85;
      // Three loose tiers so the deck has depth instead of reading as one flat lid.
      const tier = i % CLOUD_TIERS;
      const cloud = createNode({
        position: { x: centre.x + cloudX[i], y: centre.y + FIELD_TOP + CLOUD_LIFT + tier * 2.6 + cloudRand() * 1.8, z: centre.z + cloudZ[i] },
        rotation: { x: 0, y: cloudRand() * Math.PI * 2, z: 0 },
        geometry: CLOUD_FAIR(), scale: { x: 0.01, y: 0.01, z: 0.01 }, visible: false
      });
      clouds.push(cloud);
      addChild(root, cloud);
    }
    let cloudCover = 0, cloudForm = "fair";

    // Sound: the context opens only after a real gesture, so weather on a fresh page stays silent.
    let ctx = null, master = null, noise = null, rainGain = null, windGain = null, muted = false;
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
      // The gale rides the same loop through a low band, so a blizzard howls without a second buffer.
      const howl = ctx.createBiquadFilter();
      howl.type = "bandpass";
      howl.frequency.value = 420;
      howl.Q.value = 0.8;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(howl);
      howl.connect(windGain);
      windGain.connect(master);
      noise.start();
      if (ctx.state === "suspended") ctx.resume();
      return true;
    };
    // The listener's own distance, read when a roll arrives rather than when its bolt was lit.
    const heardNow = () => {
      const dx = camera.target.x - centre.x, dz = camera.target.z - centre.z;
      const k = clamp((HEARD_NONE - Math.sqrt(dx * dx + dz * dz)) / (HEARD_NONE - HEARD_FULL), 0, 1);
      return k * k;
    };
    const rumble = () => {
      if (!initAudio() && !ctx) return;
      const t = ctx.currentTime;
      // Distance takes the crack off a strike before it takes the roll: the opening band falls toward
      // the tail's own frequency as you walk away, so thunder from across the water is a low rumble
      // while thunder overhead still snaps. `near` is read when the roll arrives, not when it was lit.
      const level = lerp(DISTANT_THUNDER, 1, heardNow());
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(lerp(140, 420, level), t);
      low.frequency.exponentialRampToValueAtTime(90, t + 2.8);
      low.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28 * level, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.11 * level, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.2 * level, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      noise.connect(low);
      low.connect(g);
      g.connect(master);
      window.setTimeout(() => {
        low.disconnect();
        g.disconnect();
      }, 3400);
    };

    // One particle placed at the top of the field, in a disk around the camera target.
    const seed = (i, fromTop) => {
      const t = centre;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * FIELD_R;
      x[i] = t.x + Math.cos(a) * r;
      z[i] = t.z + Math.sin(a) * r;
      y[i] = fromTop ? t.y + FIELD_TOP + Math.random() * FIELD_SPREAD : t.y + Math.random() * (FIELD_TOP + FIELD_SPREAD) - RECYCLE_BELOW;
      phase[i] = Math.random() * Math.PI * 2;
      if (state.snow) {
        w[i] = 0.6 + Math.random() * 0.8;
        h[i] = 1;
        vy[i] = SNOW_FALL + Math.random() * SNOW_FALL_SPREAD;
      } else {
        const size = clamp(DROP_MIN + Math.random() * 1.1 + gust * GUST_LIFT, DROP_MIN, DROP_MAX);
        w[i] = size;
        h[i] = 0.8 + size * 0.35;
        vy[i] = RAIN_FALL + RAIN_FALL_PER_SIZE * size;
      }
    };
    const setForm = (snow) => {
      const next = snow ? "snow" : "rain";
      if (next === form) return;
      form = next;
      node.geometry = snow ? snowFlake() : rainDrop();
      // Re-seed in place: the population is the same, only its shape and fall rate change.
      for (let i = 0; i < count; i++) seed(i, false);
    };

    // The feed's standing view of the chain. Targets only; `update` walks the live values there.
    const apply = (snapshot) => {
      if (!snapshot) return;
      soakTarget = clamp(snapshot.soak, 0, 1);
      chillTarget = clamp(snapshot.chill, 0, 1);
      galeTarget = clamp(snapshot.gale, 0, 1);
      if (!applied) {
        applied = true;
        soak = soakTarget;
        chill = chillTarget;
        gale = galeTarget;
      }
    };
    // A transaction no longer is the rain; it gusts it. Bigger transactions gust harder.
    const rain = (vsize) => {
      transactions++;
      gust = Math.min(1, gust + clamp(Math.log2(Math.max(1, vsize / DROP_BASE_VSIZE)) * 0.12 + 0.08, 0.05, 0.4));
    };
    const strike = () => {
      strikes++;
      flashT = 0;
      boltT = 0;
      thunderAt = THUNDER_DELAY_MIN + Math.random() * THUNDER_DELAY_SPREAD;
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * (BOLT_RANGE - 6), t = centre;
      const bx = t.x + Math.cos(a) * r, bz = t.z + Math.sin(a) * r;
      const ground = heightAt(bx, bz);
      boltVariant = (Math.random() * variants.length) | 0;
      boltNode.geometry = variants[boltVariant];
      boltNode.position.x = bx;
      boltNode.position.z = bz;
      boltNode.position.y = ground;
      boltNode.rotation.y = Math.random() * Math.PI * 2;
      // A mirrored x flips the fork side, doubling the variants for free.
      boltNode.scale.x = (4 + Math.random() * 3) * (Math.random() < 0.5 ? -1 : 1);
      boltNode.scale.z = 4 + Math.random() * 3;
      boltNode.scale.y = t.y + FIELD_TOP + BOLT_HEIGHT - ground;
      boltNode.visible = true;
    };

    const walk = (value, target, step) => value > target ? Math.max(target, value - step) : Math.min(target, value + step);

    const update = (dt, opts) => {
      const previousCount = node.instanceCount;
      const step = dt / EASE;
      // How far under the cell the listener is. `camera.target` is the Ooga you are driving when you
      // are in one and the look-at point when you are flying free, so one value serves both. The sky,
      // the fog, the flash and the sound all read it, so they cannot disagree about where you stand.
      const cx = camera.target.x - centre.x, cz = camera.target.z - centre.z;
      const away = Math.sqrt(cx * cx + cz * cz);
      near = clamp((NEAR_NONE - away) / (NEAR_NONE - NEAR_FULL), 0, 1);
      // Loudness on its own shorter curve, then squared: audible only around the rainforest, already
      // almost gone halfway back over the bridge, and exactly zero anywhere else in the world.
      const reach = clamp((HEARD_NONE - away) / (HEARD_NONE - HEARD_FULL), 0, 1);
      heard = reach * reach;
      if (Math.abs(soak - soakTarget) > DEAD_BAND) soak = walk(soak, soakTarget, step); else soak = soakTarget;
      if (Math.abs(chill - chillTarget) > DEAD_BAND) chill = walk(chill, chillTarget, step); else chill = chillTarget;
      if (Math.abs(gale - galeTarget) > DEAD_BAND) gale = walk(gale, galeTarget, step); else gale = galeTarget;
      gust = Math.max(0, gust - dt / GUST_SECONDS);
      state = stateFor(soak, chill, gale);
      setForm(state.snow);

      // Wind turns slowly and never snaps; the gale sets its strength, a gust leans on it.
      windAngle += WIND_TURN * dt;
      const windSpeed = WIND_MAX * gale * (state.snow ? 1 : 0.7) * (0.6 + 0.4 * state.wet);
      windX = Math.cos(windAngle) * windSpeed;
      windZ = Math.sin(windAngle) * windSpeed;
      swayT += dt * SNOW_SWAY_RATE;

      // The deck above: how much of it is there, what colour, and how hard it is lit from below.
      const wantCover = clamp(state.wet * 0.55 + soak * 0.45, 0, 1);
      cloudCover += (wantCover - cloudCover) * Math.min(1, dt / CLOUD_EASE);
      const wantForm = cloudCover < 0.18 ? "fair" : state.snow ? "snow" : "grey";
      if (wantForm !== cloudForm) {
        cloudForm = wantForm;
        const geometry = wantForm === "fair" ? CLOUD_FAIR() : wantForm === "snow" ? CLOUD_SNOW() : CLOUD_GREY();
        for (let i = 0; i < cloudN; i++) clouds[i].geometry = geometry;
      }
      const shown = Math.round(cloudN * clamp(CLOUD_FLOOR + cloudCover * (1 - CLOUD_FLOOR), 0, 1));
      for (let i = 0; i < cloudN; i++) {
        const cloud = clouds[i];
        if (i >= shown) {
          cloud.visible = false;
          continue;
        }
        cloud.visible = true;
        cloudX[i] += windX * CLOUD_DRIFT * dt;
        cloudZ[i] += windZ * CLOUD_DRIFT * dt;
        // Wrap across the cell rather than drifting away, so the deck never leaves and never grows.
        const cr = Math.hypot(cloudX[i], cloudZ[i]);
        if (cr > CLOUD_R) {
          cloudX[i] = -cloudX[i] / cr * CLOUD_R;
          cloudZ[i] = -cloudZ[i] / cr * CLOUD_R;
        }
        cloud.position.x = centre.x + cloudX[i];
        cloud.position.z = centre.z + cloudZ[i];
        const k = cloudBase[i] * (0.8 + cloudCover * 0.6);
        cloud.scale.x = cloud.scale.z = k;
        cloud.scale.y = k * 0.6;
        // Lightning lights the deck from inside before it lights anything else.
        cloud.glow = flash > 0 ? flash * 0.85 : 0;
      }

      // The population is the weather: hold `target` particles alive and the rain lasts as long as
      // the pool is full, instead of stopping the moment a transaction stops arriving.
      const target = Math.min(cap, Math.round(cap * clamp(state.wet * (0.65 + 0.35 * soak) + gust * 0.15, 0, 1)));
      if (count < target) {
        // Fill over about a second so a state change eases in rather than popping a full field.
        const room = Math.min(target - count, Math.max(1, Math.ceil(cap * dt)));
        for (let n = 0; n < room; n++, count++) seed(count, !applied || previousCount > 0);
      }

      const t = centre, data = node.instanceData;
      const snow = state.snow, floorY = t.y - RECYCLE_BELOW;
      for (let i = 0; i < count; i++) {
        y[i] -= vy[i] * dt;
        let dx = windX, dz = windZ;
        if (snow) {
          // Flakes sway across the wind instead of tracking it exactly.
          dx += Math.cos(swayT + phase[i]) * SNOW_SWAY;
          dz += Math.sin(swayT * 0.8 + phase[i]) * SNOW_SWAY;
        }
        x[i] += dx * dt;
        z[i] += dz * dt;
        const ground = heightAt(x[i], z[i]);
        if (y[i] <= ground || y[i] < floorY) {
          if (!snow && fx && w[i] >= SPLASH_SIZE && y[i] <= ground) fx.burst(x[i], y[i] + 0.05, z[i], 2, SPLASH, 0.9);
          // Over target the population shrinks by retiring on landing; otherwise it recycles to the top.
          if (count > target) {
            count--;
            x[i] = x[count]; y[i] = y[count]; z[i] = z[count];
            w[i] = w[count]; h[i] = h[count]; vy[i] = vy[count]; phase[i] = phase[count];
            i--;
            continue;
          }
          seed(i, true);
        }
        // Drops outside the field have drifted past the camera; bring them round rather than lose them.
        const ox = x[i] - t.x, oz = z[i] - t.z;
        if (ox * ox + oz * oz > FIELD_R * FIELD_R * 2.25) seed(i, true);

        const o = i * 20, s = snow ? w[i] : w[i] * 0.5 + 0.5, hy = h[i];
        // A streak lies along the drop's own velocity: down at vy, carried sideways at the wind's speed.
        // Bottom to top is the reverse of that travel, so the head of the streak is upwind of its tail
        // and the rain leans the way the wind is going. The ratio is wind over fall speed, so a heavy
        // drop falls straighter through the same gale than a light one, and the lean is capped so a
        // squall never lays the rain flat.
        const tiltX = snow ? 0 : clamp(-windX / (vy[i] || 1), -0.8, 0.8);
        const tiltZ = snow ? 0 : clamp(-windZ / (vy[i] || 1), -0.8, 0.8);
        data[o] = s; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0;
        data[o + 4] = tiltX * hy; data[o + 5] = hy; data[o + 6] = tiltZ * hy; data[o + 7] = 0;
        data[o + 8] = 0; data[o + 9] = 0; data[o + 10] = s; data[o + 11] = 0;
        data[o + 12] = x[i]; data[o + 13] = y[i]; data[o + 14] = z[i]; data[o + 15] = 1;
        data[o + 16] = 1; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
      }
      node.instanceCount = node.drawInstanceCount = count;
      if (count || previousCount) node.instanceVersion++;
      if (rainGain) {
        rainGain.gain.setTargetAtTime(Math.min(1, count / (cap * 0.6)) * (snow ? 0.035 : 0.09) * heard, ctx.currentTime, 0.25);
        windGain.gain.setTargetAtTime(gale * (state.wet > 0 ? 0.07 : 0.02) * heard, ctx.currentTime, 0.4);
      }

      // A storm strikes on its own as well as on every block; ten minutes between blocks is no storm.
      if (state.storm) {
        if (ambientAt < 0) ambientAt = AMBIENT_MIN + Math.random() * AMBIENT_SPREAD;
        ambientAt -= dt * (0.5 + soak);
        if (ambientAt < 0) {
          ambientAt = AMBIENT_MIN + Math.random() * AMBIENT_SPREAD;
          strike();
        }
      } else ambientAt = -1;

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

      // The storm is a place, so standing on the far side of the world leaves your own sky exactly as
      // the clock painted it while you watch it rain over there.
      if (opts) {
        // A clear sky leaves the clock's colours, light and fog exactly as sampled.
        cloud = cloudFor(soak, opts.day) * near;
        const white = snow ? cloud * clamp((state.wet - FAIR) / (1 - FAIR), 0, 1) : 0;
        if (cloud > 0.02) {
          const k = cloud * OVERCAST_MIX;
          const tint = snow ? SNOW_TINT : OVERCAST_TINT;
          greyen(opts.clear, k, tint); greyen(opts.horizon, k, tint); greyen(opts.zenith, k, tint);
          greyen(opts.sky, k, tint); greyen(opts.ground, k, tint); greyen(opts.direct, k, tint);
          opts.directStrength *= 1 - cloud * (1 - OVERCAST_DIM);
          if (white > 0.02) {
            whiten(opts.clear, white); whiten(opts.horizon, white); whiten(opts.zenith, white);
            whiten(opts.sky, white); whiten(opts.ground, white);
            opts.ambientFloor = lerp(opts.ambientFloor, 0.6, white);
          }
          fog[0] = opts.horizon[0]; fog[1] = opts.horizon[1]; fog[2] = opts.horizon[2];
          opts.fog = fog;
          opts.fogNear = lerp(lerp(FOG_OFF_NEAR, FOG_NEAR, cloud), WHITEOUT_NEAR, white);
          opts.fogFar = lerp(lerp(FOG_OFF_FAR, FOG_FAR, cloud), WHITEOUT_FAR, white);
        } else opts.fog = null;
      }
      if (flash > 0 && opts) {
        // A distant bolt still flickers the sky, just faintly; underneath it the whole sky goes white.
        const k = flash * FLASH_MAX * lerp(DISTANT_FLASH, 1, near);
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
      for (const cloud of clouds) removeChild(root, cloud);
      clouds.length = 0;
      count = 0;
      if (ctx) ctx.close();
      ctx = master = noise = rainGain = windGain = null;
    };
    const state_ = {
      get name() { return state.name; },
      get drops() { return count; },
      get capacity() { return cap; },
      get form() { return form; },
      get flash() { return flash; },
      get bolt() { return boltT >= 0; },
      get boltVariant() { return boltVariant; },
      get boltVariants() { return variants.length; },
      get thunderPending() { return thunderAt >= 0; },
      get strikes() { return strikes; },
      get soak() { return soak; },
      get chill() { return chill; },
      get gale() { return gale; },
      get gust() { return gust; },
      get cloud() { return cloud; },
      get deck() { return cloudCover; },
      get deckForm() { return cloudForm; },
      get deckShown() { return clouds.reduce((n, c) => n + (c.visible ? 1 : 0), 0); },
      get deckCapacity() { return cloudN; },
      get near() { return near; },
      // How much of the weather's sound reaches the listener, and what the bed is actually playing at.
      get heard() { return heard; },
      get rainLevel() { return rainGain ? rainGain.gain.value : 0; },
      get windLevel() { return windGain ? windGain.gain.value : 0; },
      get audible() { return !!ctx; },
      get centre() { return centre; },
      get wind() { return Math.hypot(windX, windZ); },
      // The wind's own travel, and the streak basis a drop is drawn along, so the lean can be checked
      // against the direction rather than eyeballed.
      get windX() { return windX; },
      get windZ() { return windZ; },
      lean: (i) => {
        if (i >= count) return null;
        const o = i * 20, d = node.instanceData;
        return { x: d[o + 4], y: d[o + 5], z: d[o + 6] };
      },
      get transactions() { return transactions; },
      get applied() { return applied; },
      get audio() { return !!ctx; },
      get muted() { return muted; },
      drop: (i) => i < count ? { x: x[i], y: y[i], z: z[i], size: w[i], fall: vy[i] } : null
    };
    return {
      apply, rain, strike, update, setMuted, dispose, state: state_,
      get active() { return count > 0 || flashT >= 0 || boltT >= 0 || thunderAt >= 0; },
      stats: () => ({ rainDrops: count, strikes })
    };
  };

  BL.weather = { STATES, CLEAR_NIGHT, CLEAR_DAY, COLD, WET, FAIR, HEAVY, WINDY, stateFor, cloudFor, create };
})();
