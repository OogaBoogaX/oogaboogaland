(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { lerp } = BL.math;
  const PHASES = ["dawn", "morning", "noon", "dusk", "night", "midnight"];
  // Phase starts in hours; midnight wraps past 23
  const PHASE_STARTS = [5, 7, 11, 16, 19, 23];
  const phaseAt = (hour) => {
    let phase = PHASES[5];
    for (let i = 0; i < 6; i++) if (hour >= PHASE_STARTS[i]) phase = PHASES[i];
    return phase;
  };
  const vec = (v) => ({ x: v[0], y: v[1], z: v[2] });
  const key = (hour, clear, horizon, zenith, sky, ground, sun, light, moon, bloom, stars, torch, day) =>
    ({ hour, clear, horizon, zenith, sky, ground, sun, light: vec(light), moon: vec(moon), bloom, stars, torch, day });
  // Today's hub look, held through the middle of the day
  const NOON = [[0.36, 0.56, 0.82], [0.70, 0.82, 0.94], [0.24, 0.46, 0.84], [0.60, 0.64, 0.74], [0.34, 0.34, 0.30], [0.48, 0.44, 0.38]];
  const NIGHT_SUN = [0.26, 0.30, 0.44];
  // Sorted by hour, cyclic; the sun rises in the east (+x) and the moon arcs over the south (-z);
  // the light swings between sun and moon only under full stars, when the disc is invisible
  const KEYFRAMES = [
    key(0, [0.07, 0.08, 0.16], [0.14, 0.16, 0.30], [0.04, 0.05, 0.13], [0.17, 0.20, 0.34], [0.14, 0.14, 0.19], [0.22, 0.26, 0.40], [-0.05, 0.80, -0.55], [-0.05, 0.80, -0.55], 0.9, 1, 1, 0),
    key(4.5, [0.07, 0.08, 0.16], [0.16, 0.17, 0.32], [0.05, 0.06, 0.14], [0.18, 0.21, 0.35], [0.14, 0.14, 0.19], NIGHT_SUN, [-0.45, 0.55, -0.55], [-0.45, 0.55, -0.55], 0.88, 1, 1, 0),
    key(5.1, [0.10, 0.10, 0.20], [0.28, 0.20, 0.32], [0.06, 0.07, 0.18], [0.15, 0.16, 0.28], [0.11, 0.11, 0.14], [0.22, 0.21, 0.27], [0.90, 0.25, -0.30], [-0.52, 0.48, -0.54], 0.85, 1, 1, 0),
    key(5.7, [0.22, 0.20, 0.34], [0.60, 0.36, 0.40], [0.10, 0.12, 0.30], [0.22, 0.22, 0.36], [0.14, 0.13, 0.16], [0.34, 0.24, 0.26], [0.90, 0.25, -0.30], [-0.60, 0.40, -0.52], 0.8, 0.6, 1, 0),
    key(6.1, [0.46, 0.40, 0.52], [0.96, 0.60, 0.42], [0.24, 0.30, 0.56], [0.38, 0.38, 0.52], [0.22, 0.19, 0.20], [0.70, 0.46, 0.30], [0.92, 0.27, -0.28], [-0.70, 0.30, -0.50], 0.68, 0.25, 0, 0),
    key(6.5, [0.54, 0.52, 0.66], [0.92, 0.70, 0.52], [0.28, 0.40, 0.68], [0.46, 0.48, 0.62], [0.26, 0.24, 0.23], [0.64, 0.50, 0.36], [0.90, 0.32, -0.28], [-0.78, 0.25, -0.48], 0.6, 0.05, 0, 1),
    key(8, [0.48, 0.62, 0.84], [0.82, 0.86, 0.92], [0.30, 0.52, 0.86], [0.58, 0.62, 0.74], [0.32, 0.32, 0.29], [0.56, 0.48, 0.38], [0.80, 0.50, -0.25], [-0.85, 0.20, -0.45], 0.52, 0, 0, 1),
    key(10.5, ...NOON, [0.55, 0.78, -0.25], [-0.90, 0.10, -0.40], 0.5, 0, 0, 1),
    key(14.5, ...NOON, [0.55, 0.78, -0.25], [0.90, 0.10, -0.40], 0.5, 0, 0, 1),
    key(16, ...NOON, [-0.08, 0.62, -0.78], [0.86, 0.18, -0.45], 0.5, 0, 0, 1),
    key(17.2, [0.60, 0.50, 0.56], [0.98, 0.72, 0.42], [0.34, 0.38, 0.66], [0.54, 0.48, 0.58], [0.30, 0.26, 0.24], [0.66, 0.46, 0.30], [-0.80, 0.42, -0.25], [0.80, 0.30, -0.50], 0.56, 0, 0, 1),
    key(17.6, [0.56, 0.36, 0.44], [1.00, 0.50, 0.22], [0.32, 0.24, 0.54], [0.44, 0.36, 0.50], [0.26, 0.21, 0.22], [0.74, 0.40, 0.22], [-0.90, 0.30, -0.22], [0.70, 0.40, -0.55], 0.62, 0.1, 0, 0),
    key(18, [0.30, 0.20, 0.36], [0.78, 0.36, 0.30], [0.14, 0.12, 0.36], [0.28, 0.24, 0.40], [0.18, 0.15, 0.18], [0.36, 0.22, 0.22], [-0.92, 0.25, -0.22], [0.65, 0.45, -0.55], 0.72, 0.35, 1, 0),
    key(19, [0.12, 0.12, 0.22], [0.32, 0.22, 0.32], [0.07, 0.07, 0.20], [0.17, 0.18, 0.30], [0.13, 0.12, 0.16], [0.22, 0.20, 0.26], [-0.92, 0.25, -0.22], [0.58, 0.48, -0.55], 0.82, 1, 1, 0),
    key(19.5, [0.09, 0.10, 0.20], [0.22, 0.18, 0.35], [0.06, 0.07, 0.18], [0.20, 0.23, 0.38], [0.15, 0.15, 0.20], NIGHT_SUN, [0.55, 0.50, -0.55], [0.55, 0.50, -0.55], 0.86, 1, 1, 0),
    key(22, [0.07, 0.08, 0.16], [0.15, 0.17, 0.32], [0.05, 0.06, 0.14], [0.19, 0.22, 0.37], [0.14, 0.14, 0.20], NIGHT_SUN, [0.25, 0.75, -0.55], [0.25, 0.75, -0.55], 0.9, 1, 1, 0)
  ];
  const LAST = KEYFRAMES.length - 1;
  const MIN_Y = 0.25;
  const mix3 = (out, a, b, t) => {
    out[0] = lerp(a[0], b[0], t);
    out[1] = lerp(a[1], b[1], t);
    out[2] = lerp(a[2], b[2], t);
  };
  const mixDir = (out, a, b, t, minY) => {
    let x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    const len = Math.hypot(x, y, z) || 1;
    x /= len;
    y /= len;
    z /= len;
    if (y < minY) {
      const s = Math.sqrt((1 - minY * minY) / (x * x + z * z));
      x *= s;
      z *= s;
      y = minY;
    }
    out.x = x;
    out.y = y;
    out.z = z;
  };
  const sample = (hour, out) => {
    let i = LAST;
    while (i > 0 && KEYFRAMES[i].hour > hour) i--;
    const a = KEYFRAMES[i], b = KEYFRAMES[i === LAST ? 0 : i + 1];
    const span = i === LAST ? 24 - a.hour + b.hour : b.hour - a.hour;
    let d = hour - a.hour;
    if (d < 0) d += 24;
    const u = Math.min(1, Math.max(0, d / span));
    const t = u * u * (3 - 2 * u);
    mix3(out.clear, a.clear, b.clear, t);
    mix3(out.horizon, a.horizon, b.horizon, t);
    mix3(out.zenith, a.zenith, b.zenith, t);
    mix3(out.sky, a.sky, b.sky, t);
    mix3(out.ground, a.ground, b.ground, t);
    mix3(out.sun, a.sun, b.sun, t);
    mixDir(out.light, a.light, b.light, t, MIN_Y);
    mixDir(out.moon, a.moon, b.moon, t, -1);
    out.bloomStrength = lerp(a.bloom, b.bloom, t);
    out.stars = lerp(a.stars, b.stars, t);
    out.torch = lerp(a.torch, b.torch, t);
    out.day = lerp(a.day, b.day, t);
    return out;
  };
  const localHour = (date) => date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 + date.getMilliseconds() / 3600000;
  const createClock = ({ hour, daylen, now = new Date() } = {}) => {
    const pinned = Number.isFinite(hour);
    const base = ((pinned ? hour : localHour(now)) % 24 + 24) % 24;
    const running = daylen > 0 || !pinned;
    const rate = daylen > 0 ? 24 / daylen : 1 / 3600;
    const start = performance.now();
    const read = () => running ? (base + (performance.now() - start) * 0.001 * rate) % 24 : base;
    return { read };
  };
  BL.daylight = { PHASES, KEYFRAMES, phaseAt, sample, createClock };
})();
