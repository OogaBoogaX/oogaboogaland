// Shared standing-water dynamics, independent of rendering, effects or viewers.
// The host retains this logical state alongside NPCs before publishing a frame.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const L = BL.poolLayout, { clamp, lerp } = BL.math;
  // Tuning. POINTS is [waiting vB, level]: an empty mempool stands at the low water, NORMAL_VB at the normal
  // water, OVERFLOW_VB reaches the spill crest and FULL_VB the highest flood. Between them it is linear.
  const NORMAL_VB = 20e6, OVERFLOW_VB = 60e6, FULL_VB = 200e6;
  const HYDRO = {
    NORMAL_VB, OVERFLOW_VB, FULL_VB,
    POINTS: [[0, L.WATER.low], [NORMAL_VB, L.WATER.normal], [OVERFLOW_VB, L.WATER.spill], [FULL_VB, L.WATER.flood]],
    // The standing level closes on its reading over EASE seconds, never faster than RATE metres a second.
    EASE: 5, RATE: 0.16,
    // A backlog reading older than this is held and called stale.
    FRESH_MS: 120000,
    // Stage hysteresis on the eased level: the shore floods above `on` and drains below `off`, the lowland
    // above `highOn` and below `highOff`. `SHOWN` keeps the drawn level off the terraces' own heights.
    STAGE: { on: 0.04, off: -0.04, highOn: L.LEVEL.lowland + 0.04, highOff: L.LEVEL.lowland - 0.04 },
    SHOWN: { under: -0.03, over: 0.05, belowLowland: L.LEVEL.lowland - 0.05, aboveLowland: L.LEVEL.lowland + 0.05 },
    // How fast the drawn water rises and falls into place, and how far under its bed a drained flood is parked.
    FILL: 0.3, PARK: L.LEVEL.bed - 0.06
  };
  const levelFor = (vsize) => {
    const points = HYDRO.POINTS, v = Math.max(0, vsize);
    for (let i = 1; i < points.length; i++) if (v <= points[i][0]) return lerp(points[i - 1][1], points[i][1], (v - points[i - 1][0]) / (points[i][0] - points[i - 1][0]));
    return points[points.length - 1][1];
  };
  // Cover the cell corners at the stepped banks, as well as their centre-sampled width.
  const BANK_COVER = L.UNIT * Math.SQRT1_2;
  // Bifrost's four quarter-metre streaks establish the shared maximum waterfall width.
  const FALL_WIDTH = 1;
  const channelHalf = (level) => (level > L.LEVEL.lowland ? L.CHANNEL.low : level > L.LEVEL.shore ? L.CHANNEL.bank : L.CHANNEL.bed) + BANK_COVER;
  const outletAt = (channel) => L.channelOutlet(channel) + 0.02;
  const createMouth = channel => {
    const ux = Math.sin(channel.bearing), uz = Math.cos(channel.bearing);
    const mouthHalf = L.CHANNEL.low + BANK_COVER, mouthCount = Math.ceil(mouthHalf / (L.UNIT / 16)) * 2;
    const mouthStep = mouthHalf * 2 / mouthCount, mouth = new Float32Array(mouthCount);
    const back = L.channelOutlet(channel) - L.UNIT / 2, front = channel.inner ? channel.to + L.UNIT * 0.75 : L.edgeAt(channel.bearing) + L.UNIT * 2;
    const samples = Math.ceil((front - back) / (L.UNIT / 8));
    for (let j = 0; j < mouthCount; j++) {
      let high = -Infinity;
      // Sample both edges as well as the centre so a bank corner cannot leak into the sheet.
      for (let side = 0; side <= 2; side++) {
        const across = -mouthHalf + (j + side / 2) * mouthStep;
        for (let k = 0; k <= samples; k++) {
          const along = lerp(back, front, k / samples);
          const x = ux * along + uz * across, z = uz * along - ux * across;
          // A roof over an interior culvert is not a bank covering its opening.
          high = Math.max(high, channel.inner ? (L.solidAt(x, L.WATER.flood, z) ? L.LEVEL.ground : L.LEVEL.bed) : L.groundAt(x, z));
        }
      }
      mouth[j] = high;
    }
    return { mouth, mouthHalf, mouthStep, wetWidth: 0, wetCentre: 0 };
  };
  const measureMouth = (fall, floodY) => {
    let left = fall.mouth.length / 2, right = left;
    while (left > 0 && fall.mouth[left - 1] < floodY - 0.02) left--;
    while (right < fall.mouth.length && fall.mouth[right] < floodY - 0.02) right++;
    const width = Math.min(FALL_WIDTH, (right - left) * fall.mouthStep);
    const centre = -fall.mouthHalf + (left + right) * fall.mouthStep / 2;
    fall.wetWidth = width; fall.wetCentre = centre;
    return fall;
  };
  const createSurfaceQuery = ({ lakeAt, reachAt, floodAt, visible, mouths }) => {
    if (![lakeAt, reachAt, floodAt, visible].every(fn => typeof fn === "function")
      || !Array.isArray(mouths) || mouths.length !== L.CHANNELS.length)
      throw Error("water surface query providers required");
    const levelAt = (x, z) => {
      const r = Math.hypot(x, z), lake = lakeAt(), floodY = floodAt();
      if (r < reachAt()) return lake;
      if (!visible() || r < L.LAKE_R) return -Infinity;
      if (r > L.RING.lowland + 0.25) {
        let inChannel = false;
        for (let i = 0; i < L.CHANNELS.length; i++) {
          const channel = L.CHANNELS[i], fall = mouths[i];
          const ux = Math.sin(channel.bearing), uz = Math.cos(channel.bearing), along = x * ux + z * uz;
          if (channel.inner && Math.abs(x * uz - z * ux - fall.wetCentre) >= fall.wetWidth / 2) continue;
          if (along >= L.RING.lowland && along <= outletAt(channel) && Math.abs(x * uz - z * ux) < channelHalf(floodY)) {
            if (channel.inner && r >= L.RING.ridge) return L.solidAt(x, floodY - 0.02, z) ? -Infinity : floodY;
            inChannel = true; break;
          }
        }
        // Past the cliff the channel has no bed: the water falls there, and holds up no one, on a ledge or in the air.
        if (!inChannel || L.groundAt(x, z) < L.LEVEL.bed) return -Infinity;
      }
      return L.groundAt(x, z) < floodY - 0.02 ? floodY : -Infinity;
    };
    return levelAt;
  };
  const walk = (value, to, step) => value > to ? Math.max(to, value - step) : Math.min(to, value + step);
  const create = ({ authoritative = false } = {}) => {
    if (typeof authoritative !== "boolean") throw Error("invalid hydrology mode");
    let lastNow = 0, used = false;
    const mouths = authoritative ? L.CHANNELS.map(createMouth) : null;
    let measuredFlood = NaN;
    const refreshMouths = () => {
      if (mouths && measuredFlood !== floodY) {
        for (const mouth of mouths) measureMouth(mouth, floodY);
        measuredFlood = floodY;
      }
    };
    let target = L.WATER.low, level = L.WATER.low, shown = L.WATER.low, floodY = HYDRO.PARK, stage = 0, reading = false, observedAt = 0, vsize = 0, status = "unavailable", preview = null, settle = false;
    let fill = null;
    const apply = (snapshot) => {
      if (authoritative) {
        if (!snapshot || !Number.isSafeInteger(snapshot.vsize) || snapshot.vsize < 0
          || !Number.isSafeInteger(snapshot.backlogAt) || snapshot.backlogAt < 0)
          throw Error("invalid authoritative backlog reading");
        if (snapshot.backlogAt < observedAt) return false;
        if (reading && snapshot.backlogAt === observedAt && snapshot.vsize !== vsize)
          throw Error("conflicting authoritative backlog reading");
      }
      used = true;
      if (!snapshot || preview !== null || fill !== null) return;
      const observed = snapshot.backlogAt > 0;
      // A reading restored from the last visit counts as a held one: its stamp is zero until the feed confirms it.
      if (!observed && !(snapshot.vsize > 0)) return;
      vsize = Math.max(0, snapshot.vsize);
      target = levelFor(vsize);
      observedAt = snapshot.backlogAt;
      // The first reading stands where it reads: the lake does not fill from empty in front of the visitor.
      if (!reading) { reading = true; level = target; settle = true; }
    };
    const update = (dt, now) => {
      if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(now)
        || authoritative && (dt > 0.25 || !Number.isSafeInteger(now) || now < lastNow))
        throw Error("invalid hydrology step");
      used = true; lastNow = now;
      status = fill !== null || preview !== null ? "live" : !reading ? "unavailable" : observedAt > 0 && now - observedAt < HYDRO.FRESH_MS ? "live" : "stale";
      // The standing level: toward its reading, bounded.
      level = walk(level, target, Math.min(HYDRO.RATE * dt, Math.abs(target - level) * Math.min(1, dt / HYDRO.EASE) + 1e-4));
      const S = HYDRO.STAGE, D = HYDRO.SHOWN;
      if (stage === 0 && level > S.on) stage = 1;
      else if (stage === 1 && level < S.off) stage = 0;
      else if (stage === 1 && level > S.highOn) stage = 2;
      else if (stage === 2 && level < S.highOff) stage = 1;
      const want = fill !== null ? level : stage === 0 ? Math.min(level, D.under) : stage === 1 ? clamp(level, D.over, D.belowLowland) : Math.max(level, D.aboveLowland);
      shown = settle ? want : walk(shown, want, HYDRO.FILL * dt);
      floodY = settle ? (stage ? shown : HYDRO.PARK) : walk(floodY, stage ? shown : HYDRO.PARK, HYDRO.FILL * dt * (stage ? 2.5 : 1.5));
      settle = false;
      refreshMouths();
    };
    const state = {
      get target() { return target; }, get level() { return level; }, get shown() { return shown; },
      get floodY() { return floodY; }, get stage() { return stage; }, get reading() { return reading; },
      get observedAt() { return observedAt; }, get vsize() { return vsize; }, get status() { return status; },
      get preview() { return preview; }, get settle() { return settle; }, get fill() { return fill; }
    };
    const validate = saved => {
      if (!saved || Object.keys(saved).sort().join() !== "v,values" || saved.v !== 1
        || !Array.isArray(saved.values) || saved.values.length !== 13 || Object.keys(saved.values).length !== 13)
        throw Error("invalid hydrology checkpoint");
      const r = saved.values;
      if (!r.slice(0, 4).every(n => Number.isFinite(n) && n >= -L.MEMBRANE_DEPTH && n <= L.WATER.flood)
        || !Number.isInteger(r[4]) || r[4] < 0 || r[4] > 2 || typeof r[5] !== "boolean"
        || !Number.isSafeInteger(r[6]) || r[6] < 0 || !Number.isSafeInteger(r[7]) || r[7] < 0
        || !["unavailable", "live", "stale"].includes(r[8]) || typeof r[10] !== "boolean"
        || r[9] !== null && (!Number.isFinite(r[9]) || r[9] < 0)
        || r[11] !== null && (!Number.isFinite(r[11]) || r[11] < 0 || r[11] > 200)
        || !Number.isSafeInteger(r[12]) || r[12] < 0 || authoritative && (r[9] !== null || r[11] !== null))
        throw Error("invalid hydrology checkpoint values");
    };
    const checkpoint = {
      capture() {
        const saved = { v: 1, values: [target, level, shown, floodY, stage, reading, observedAt, vsize, status, preview, settle, fill, lastNow] };
        validate(saved); return saved;
      },
      restore(saved) {
        if (used) throw Error("hydrology recovery requires a fresh controller");
        validate(saved);
        [target, level, shown, floodY, stage, reading, observedAt, vsize, status, preview, settle, fill, lastNow] = saved.values;
        used = true; refreshMouths();
      }
    };
    const lakeAt = () => Math.min(shown, stage ? Math.max(floodY, L.WATER.spill - 0.01) : shown);
    const surfaceQuery = authoritative ? createSurfaceQuery({ lakeAt, reachAt: () => L.waterRadius(lakeAt()),
      floodAt: () => floodY, visible: () => floodY > HYDRO.PARK + 0.01, mouths }) : null;
    return { authoritative, apply, update, state, checkpoint,
      levelAt: authoritative ? (x, z) => { refreshMouths(); return surfaceQuery(x, z); } : null,
      resume() {
        if (authoritative) throw Error("authoritative water cannot snap on viewer resume");
        used = true;
        // The feed has updated the target while effects rested; return at that level without replaying the absence.
        level = target;
        stage = level > HYDRO.STAGE.highOn ? 2 : level > HYDRO.STAGE.on ? 1 : 0;
        settle = true;
      },
      preview(vB) {
        if (authoritative) throw Error("authoritative water preview disabled");
        used = true;
        fill = null;
        preview = vB === null || vB === undefined ? null : Math.max(0, vB);
        if (preview !== null) { reading = true; vsize = preview; target = levelFor(preview); }
        else target = reading ? levelFor(vsize) : L.WATER.low;
      },
      // Debug depth runs from 0 to 200: empty bowl through full overflow, including partial trench filling.
      previewFill(value) {
        if (authoritative) throw Error("authoritative water preview disabled");
        used = true;
        if (value !== null && !Number.isFinite(value)) return;
        fill = value === null ? null : clamp(value, 0, 200);
        preview = null;
        target = fill === null ? (reading ? levelFor(vsize) : L.WATER.low) : lerp(-L.MEMBRANE_DEPTH, L.WATER.flood, fill / 200);
        level = target; stage = target > HYDRO.STAGE.highOn ? 2 : target > HYDRO.STAGE.on ? 1 : 0; settle = true;
      },
    };
  };
  BL.poolHydrology = { HYDRO, levelFor, BANK_COVER, FALL_WIDTH, channelHalf, outletAt, createMouth, measureMouth, createSurfaceQuery, create };
})();
