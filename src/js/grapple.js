// The grappling hook's arithmetic, shared by the games that throw one: no scene, renderer, audio or state of its own,
// so a game's fixed-step rules can call it as well as a scene. Cloud Hopper's hook flies its head with `toward` and
// pulls at `pullSpeed`; Block Frenzy adds the rope (`tether`, which makes a pull a swing once the rope is taut) and
// `march`, a ray stepped through a game's own solid test. Nothing here allocates.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // Moves `tip` (any { x, y, z }) `step` metres toward a point; true once it is there.
  const toward = (tip, x, y, z, step) => {
    const dx = x - tip.x, dy = y - tip.y, dz = z - tip.z, d = Math.hypot(dx, dy, dz);
    if (d <= step) { tip.x = x; tip.y = y; tip.z = z; return true; }
    tip.x += dx / d * step; tip.y += dy / d * step; tip.z += dz / d * step;
    return false;
  };
  // The factor that scales the offset `d` metres long to the pull's velocity: `max` metres a second, slowing over the
  // last metres (five times the distance left).
  const pullSpeed = (d, max) => Math.min(max, d * 5) / d;
  // A ray from (ox, oy, oz) along the unit (dx, dy, dz), stepped `step` metres at a time out to `far` through
  // `solid(x, y, z)`: the distance to the first solid point, written into `out` (x, y, z), or -1 for a miss.
  const march = (ox, oy, oz, dx, dy, dz, far, step, solid, out) => {
    for (let t = step; t <= far; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (!solid(x, y, z)) continue;
      out.x = x; out.y = y; out.z = z;
      return t;
    }
    return -1;
  };
  // A rope `len` long from the anchor (ax, ay, az) to a body's point (`body` x, y, z with velocity vx, vy, vz, `oy`
  // metres under the point the rope holds): a body past the rope's length is brought back onto it and loses the speed
  // that carried it outward, so falling under the anchor swings it. True while the rope is taut.
  const tether = (body, oy, ax, ay, az, len) => {
    const dx = body.x - ax, dy = body.y + oy - ay, dz = body.z - az, d = Math.hypot(dx, dy, dz);
    if (d <= len || d < 1e-6) return false;
    const ux = dx / d, uy = dy / d, uz = dz / d;
    body.x = ax + ux * len; body.y = ay + uy * len - oy; body.z = az + uz * len;
    const out = body.vx * ux + body.vy * uy + body.vz * uz;
    if (out > 0) { body.vx -= ux * out; body.vy -= uy * out; body.vz -= uz * out; }
    return true;
  };
  BL.grapple = { toward, pullSpeed, march, tether };
})();
