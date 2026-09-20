// The island flyby: a camera tour that flies the walkers' own trail graph between
// views. Each leg is routed at departure, resampled and smoothed into fixed arrays,
// then flown at an eased cruise while the view turns toward its heading and settles
// into the next stop's angle. A stop off the trails names the surface point where
// its own approach begins (`entry`, with `entryRoute` from there to its view) and
// where its way out ends (`exit`, with `exitRoute` from its view to there), and the
// leg chains the previous stop's way out, the trail route and the next stop's
// approach; two stops sharing one point chain directly, which is how the tour goes
// down one headquarters ramp into the basement and up the others. Such a stop may
// lower `hover` under its ceiling. It writes the pilot's orbit every frame and reads
// it back: any value it did not write means the visitor took the camera, and it ends.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { lerp, ease } = BL.math;
  const CAPACITY = 4096, SPACING = 0.5, SMOOTH = 6, PASSES = 2, HOVER = 2.4, CRUISE = 9, MIN_LEG = 1.6, AUTHORED = 8;
  const DWELL = 2.2, TURN_RATE = 1.6, TURN_MAX = 1, SWOOP = 5, HEADING_SPAN = 8, LOOK_AHEAD = 3, BLEND_MIN = 4;
  const TWO_PI = Math.PI * 2;
  const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const smoothstep = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const create = ({ paths, island, hover = HOVER }) => {
    const sx = new Float64Array(CAPACITY), sy = new Float64Array(CAPACITY), sz = new Float64Array(CAPACITY), gy = new Float64Array(CAPACITY);
    const px = new Float64Array(CAPACITY), py = new Float64Array(CAPACITY), pz = new Float64Array(CAPACITY), pl = new Float64Array(CAPACITY);
    const target = { x: 0, y: 0, z: 0 };
    let stops = null, arrive = null, leg = -1, count = 0, length = 0, duration = 0, time = 0, dwell = 0, cursor = 0, active = false;
    let holdS = 0, reachS = 0, swoop = 0;
    let yaw = 0, pitch = 0, dist = 0, fromYaw = 0, fromPitch = 0, fromDist = 0, toYaw = 0, toPitch = 0, toDist = 0;
    let lastYaw = NaN, lastPitch = NaN, lastDist = NaN, legs = 0, routed = 0;
    const smooth = (input, output, radius) => {
      for (let i = 0; i < count; i++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += input[Math.max(0, Math.min(count - 1, i + k))];
        output[i] = sum / (radius * 2 + 1);
      }
    };
    // The route is a polyline of the trail nodes between two views, its nodes lifted off
    // the ground; the flown curve is that polyline resampled and box-smoothed, its ends
    // pinned to the exact views. A leg longer than the arrays widens its spacing.
    const lay = (from, to, previous, stop) => {
      const a = previous && previous.exit ? previous : null, b = stop.entry ? stop : null;
      const lift = Math.min(a && a.hover !== undefined ? a.hover : hover, b && b.hover !== undefined ? b.hover : hover);
      const route = [from];
      if (a) for (const point of a.exitRoute) route.push(point);
      const off = a ? a.exit : from, on = b ? b.entry : to, exitAt = route.length - 1;
      if (off !== on) {
        const surface = paths.route(off, on, false);
        for (let i = 1; i < surface.length - 1; i++) route.push(surface[i]);
        if (b) route.push(on);
      }
      const entryAt = route.length - 1;
      if (b) for (let i = 1; i < b.entryRoute.length; i++) route.push(b.entryRoute[i]);
      route.push(to);
      legs++;
      if (route.length > 2) routed++;
      let total = 0, exitS = 0, entryS = 0;
      for (let i = 1; i < route.length; i++) {
        total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
        if (i === exitAt) exitS = total;
        if (i === entryAt) entryS = total;
      }
      // The view holds its angle and boom along a way out and has the next stop's by its entry,
      // so nothing trails into rock; a plain trail leg swoops up and out in the middle.
      holdS = a ? exitS : 0;
      reachS = b ? entryS : total;
      if (reachS - holdS < BLEND_MIN) holdS = Math.max(0, reachS - BLEND_MIN);
      if (reachS - holdS < BLEND_MIN) reachS = Math.min(total, holdS + BLEND_MIN);
      swoop = a || b ? 0 : SWOOP;
      count = Math.min(CAPACITY, Math.ceil(total / SPACING) + 1);
      let segment = 1, start = 0, span = Math.hypot(route[1].x - route[0].x, route[1].z - route[0].z);
      for (let i = 0; i < count; i++) {
        const s = count > 1 ? total * i / (count - 1) : 0;
        while (segment < route.length - 1 && s > start + span) {
          start += span;
          segment++;
          span = Math.hypot(route[segment].x - route[segment - 1].x, route[segment].z - route[segment - 1].z);
        }
        const a = route[segment - 1], b = route[segment], t = span > 0 ? Math.min(1, (s - start) / span) : 1;
        const ay = segment === 1 ? a.y : a.y + lift, by = segment === route.length - 1 ? b.y : b.y + lift;
        sx[i] = lerp(a.x, b.x, t); sy[i] = gy[i] = lerp(ay, by, t); sz[i] = lerp(a.z, b.z, t);
      }
      for (let pass = 0; pass < PASSES; pass++) {
        smooth(sx, px, SMOOTH); smooth(sy, py, SMOOTH); smooth(sz, pz, SMOOTH);
        if (pass + 1 < PASSES) { sx.set(px.subarray(0, count)); sy.set(py.subarray(0, count)); sz.set(pz.subarray(0, count)); }
      }
      px[0] = from.x; py[0] = from.y; pz[0] = from.z;
      px[count - 1] = to.x; py[count - 1] = to.y; pz[count - 1] = to.z;
      // Smoothing can cut a corner through a rise; keep the middle of the curve above the
      // ground where the route itself was above it. Below it the route is a ramp under the
      // terrain, and the approaches are authored views, some inside a mouth under its roof.
      for (let i = AUTHORED; i < count - AUTHORED; i++) {
        if (!island.onLand(px[i], pz[i])) continue;
        const ground = island.surfaceAt(px[i], pz[i]);
        if (gy[i] >= ground) py[i] = Math.max(py[i], ground + lift * 0.5);
      }
      pl[0] = 0;
      for (let i = 1; i < count; i++) pl[i] = pl[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1], pz[i] - pz[i - 1]);
      length = pl[count - 1];
      if (total > 0) { holdS *= length / total; reachS *= length / total; }
      duration = Math.max(MIN_LEG, length / CRUISE);
      time = 0;
      cursor = 0;
    };
    // The cursor only moves forward within a leg, so the search is amortised constant.
    const at = (s, out) => {
      while (cursor < count - 2 && pl[cursor + 1] < s) cursor++;
      let i = cursor;
      while (i > 0 && pl[i] > s) i--;
      if (i >= count - 1) { out.x = px[count - 1]; out.y = py[count - 1]; out.z = pz[count - 1]; return; }
      const span = pl[i + 1] - pl[i], t = span > 0 ? Math.max(0, Math.min(1, (s - pl[i]) / span)) : 0;
      out.x = lerp(px[i], px[i + 1], t); out.y = lerp(py[i], py[i + 1], t); out.z = lerp(pz[i], pz[i + 1], t);
    };
    const AHEAD = { x: 0, y: 0, z: 0 };
    const write = (orbit) => {
      orbit.target = target;
      orbit.tx = target.x; orbit.ty = target.y; orbit.tz = target.z;
      orbit.yaw = orbit.tYaw = lastYaw = yaw;
      orbit.pitch = orbit.tPitch = lastPitch = pitch;
      orbit.dist = orbit.tDist = lastDist = dist;
    };
    const depart = (from) => {
      const stop = stops[leg], view = stop.view;
      fromYaw = yaw; fromPitch = pitch; fromDist = dist;
      toYaw = view.yaw; toPitch = view.pitch; toDist = view.dist;
      lay(from, view.target, leg ? stops[leg - 1] : null, stop);
    };
    const start = (orbit, list, onArrive = null) => {
      stops = list; arrive = onArrive;
      active = true;
      legs = routed = 0;
      leg = 0; dwell = 0;
      yaw = orbit.yaw; pitch = orbit.pitch; dist = orbit.dist;
      target.x = orbit.tx; target.y = orbit.ty; target.z = orbit.tz;
      depart(target);
      write(orbit);
    };
    const stop = () => {
      active = false;
      stops = null; arrive = null;
      leg = -1; count = 0; dwell = 0;
      lastYaw = lastPitch = lastDist = NaN;
    };
    const disturbed = (orbit) => active && (orbit.target !== target || orbit.tYaw !== lastYaw || orbit.tPitch !== lastPitch || orbit.tDist !== lastDist);
    // A damped turn, capped so a hairpin in the trail reads as a pan rather than a whip.
    const steer = (desired, dt) => {
      const delta = turn(yaw, desired) * (1 - Math.exp(-TURN_RATE * dt)), limit = TURN_MAX * dt;
      yaw += Math.max(-limit, Math.min(limit, delta));
      yaw = ((yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    };
    const update = (dt, orbit) => {
      if (!active) return;
      if (dwell > 0) {
        // The view keeps settling on the stop's angle through the dwell; nothing snaps.
        dwell -= dt;
        steer(toYaw, dt);
        if (dwell <= 0) {
          if (leg + 1 >= stops.length) { stop(); return; }
          leg++;
          depart(target);
        }
        write(orbit);
        return;
      }
      time += dt;
      const k = ease.inOutQuad(Math.min(1, time / duration)), s = k * length;
      at(s, target);
      // The view leaves the last stop's angle, follows the heading between the ends, and
      // arrives on the next stop's; a leg shorter than two spans blends straight across.
      let desired = fromYaw + turn(fromYaw, toYaw) * smoothstep(k);
      if (length > LOOK_AHEAD) {
        at(Math.min(length, s + LOOK_AHEAD), AHEAD);
        const dx = AHEAD.x - target.x, dz = AHEAD.z - target.z;
        if (dx * dx + dz * dz > 1e-6) {
          const heading = Math.atan2(-dx, -dz);
          const w = Math.min(smoothstep(s / HEADING_SPAN), smoothstep((length - s) / HEADING_SPAN));
          desired = desired + turn(desired, heading) * w;
        }
      }
      steer(desired, dt);
      const q = smoothstep((s - holdS) / Math.max(1e-6, reachS - holdS));
      pitch = lerp(fromPitch, toPitch, q);
      dist = lerp(fromDist, toDist, q) + swoop * Math.sin(Math.PI * k);
      if (time >= duration) {
        target.x = px[count - 1]; target.y = py[count - 1]; target.z = pz[count - 1];
        pitch = toPitch; dist = toDist;
        dwell = DWELL;
        if (arrive) arrive(stops[leg], leg);
      }
      write(orbit);
    };
    return { start, stop, update, disturbed, target, get active() { return active; }, get index() { return leg; }, get travelling() { return active && dwell <= 0; },
      get at() { return stops ? stops[leg] : null; }, get stops() { return stops; }, get legs() { return legs; }, get routed() { return routed; }, get samples() { return count; }, get length() { return length; }, capacity: CAPACITY };
  };
  BL.flyby = { create, DWELL, CRUISE, HOVER };
})();
