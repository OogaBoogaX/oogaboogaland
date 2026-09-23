// A checked, scene-owned receiving trajectory; positions are feet, never actor roots.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const RISE = 1.1, OUT = 1.1, LAND = 0.5, DURATION = RISE + OUT + LAND;
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const sample = (plan, time, out) => {
    const rise = smooth(time / RISE), move = smooth((time - RISE) / OUT), land = smooth((time - RISE - OUT) / LAND);
    out.x = plan.start.x + (plan.landing.x - plan.start.x) * move;
    out.z = plan.start.z + (plan.landing.z - plan.start.z) * move;
    out.y = plan.start.y + (plan.high - plan.start.y) * rise + (plan.landing.y - plan.high) * land;
    return out;
  };
  const plan = ({ hole, dialer, radius, height, supportAt, clearAt }) => {
    const distance = Math.hypot(dialer.x - hole.x, dialer.z - hole.z);
    const bearing = Math.atan2(dialer.x - hole.x, dialer.z - hole.z);
    // Offset around the supported annulus, away from the pedestal's own footprint.
    const turn = 2 * Math.asin(Math.min(1, (radius + 0.55 + 0.4) / (2 * distance)));
    const start = { x: hole.x, y: hole.floor - height - 0.2, z: hole.z }, probe = { x: 0, y: 0, z: 0 };
    if (distance <= hole.mouthRadius + radius + 0.2 || radius >= hole.radius) return null;
    for (const offset of [turn, -turn, turn * 1.5, -turn * 1.5]) {
      const angle = bearing + offset, landing = { x: hole.x + Math.sin(angle) * distance, y: hole.floor, z: hole.z + Math.cos(angle) * distance };
      const floor = supportAt(landing.x, landing.z, hole.floor);
      if (!Number.isFinite(floor) || Math.abs(floor - hole.floor) > 1e-5) continue;
      const route = { start, landing, high: hole.floor + hole.rimDepth + 0.1, heading: angle, duration: DURATION };
      let clear = true;
      // Sample the entire short path at <0.1-unit spacing, including vertical headroom.
      for (let i = 0; i <= 256; i++) {
        sample(route, DURATION * i / 256, probe);
        if (!clearAt(probe.x, probe.y + 1e-5, probe.z, radius + 0.05, height + 0.05)) { clear = false; break; }
      }
      if (clear) return route;
    }
    return null;
  };
  BL.stargateArrival = { plan, sample, DURATION };
})();
