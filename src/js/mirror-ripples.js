// Weapon contacts disturb the reflective surface. The hub may also consume an
// NPC work round at the exact pane contact while player shots continue through.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, { mat4 } = BL.math;
  const CAPACITY = 8, LIFETIME = 0.72, SPEED = 1.35, START_RADIUS = 0.055, WIDTH = 0.055, GLYPH_THRESHOLD = 0.55;
  const strengthAt = age => Math.exp(-5 * age) * Math.max(0, 1 - age / LIFETIME);
  const create = node => {
    const waves = new Float32Array(CAPACITY * 4), inverse = mat4.create();
    const bounds = BL.scene.boundsOf(node.geometry), a = new Float64Array(3), b = new Float64Array(3);
    const previous = mat4.create(), current = mat4.create(), contact = new Float64Array(2);
    // The entrance is static. Cache its transform once, not for every banana.
    let root = node;
    while (root.parent) root = root.parent;
    BL.scene.updateWorld(root);
    mat4.invert(inverse, node.world);
    let next = 0;
    const state = { waves, active: 0, hits: 0, time: 0, cross, absorb, strike, aimAt, continueShot, pulse, update, dispose };
    const onGlass = (x, y) => x >= bounds.min[0] && x <= bounds.max[0]
      && y >= bounds.min[1] + (bounds.max[1] - bounds.min[1]) * (node.mirrorReveal || 0) && y <= bounds.max[1]
      && (!node.mirrorDamage || node.mirrorDamage.contains(x, y));
    function intersection(ax, ay, az, bx, by, bz) {
      if (!node.visible || node.mirrorPortal) return -1;
      mat4.transformPoint(a, inverse, ax, ay, az);
      mat4.transformPoint(b, inverse, bx, by, bz);
      const fromZ = a[2] - bounds.min[2], toZ = b[2] - bounds.min[2];
      // Count the arrival at the plane once, including a long frame's sweep.
      // A consumed projectile is clamped onto this plane in world space. Its
      // inverse transform may land a few ulps to either side, so accept an
      // endpoint at the pane instead of losing the ripple and damage event.
      if (Math.abs(fromZ) < 1e-7 || fromZ * toZ > 0 && Math.abs(toZ) >= 1e-7 || fromZ === toZ) return -1;
      const t = fromZ / (fromZ - toZ), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      return onGlass(x, y) ? t : -1;
    }
    function aimAt(out, x, y, z) {
      const t = intersection(x, y, z, out.x, out.y, out.z);
      if (t < 0 || a[2] <= bounds.min[2]) return false;
      // Converge the offset muzzle on the visible reflection, not a wall deep
      // inside the cave. Ordinary solids have already shortened this segment.
      out.x = x + (out.x - x) * t; out.y = y + (out.y - y) * t; out.z = z + (out.z - z) * t;
      return true;
    }
    function continueShot(from, to) {
      if (!node.visible || node.mirrorPortal) return;
      mat4.transformPoint(a, inverse, from.x, from.y, from.z);
      mat4.transformPoint(b, inverse, to.x, to.y, to.z);
      if (a[2] <= bounds.min[2] || Math.abs(b[2] - bounds.min[2]) > 1e-4 || !onGlass(b[0], b[1])) return;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const distance = Math.hypot(dx, dy, dz), scale = 60 / distance;
      if (distance < 1e-4 || scale <= 1) return;
      // The mirror is an aiming surface, not a bullet stop. Continue on the
      // same line through the exact impact point; the scene still clips solids.
      to.x = from.x + dx * scale; to.y = from.y + dy * scale; to.z = from.z + dz * scale;
    }
    function cross(ax, ay, az, bx, by, bz, dt = 0) {
      const t = intersection(ax, ay, az, bx, by, bz);
      if (t < 0) return false;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      return emit(x, y, (1 - t) * dt);
    }
    function absorb(ax, ay, az, point) {
      const t = intersection(ax, ay, az, point.x, point.y, point.z);
      if (t < 0) return false;
      point.x = ax + (point.x - ax) * t;
      point.y = ay + (point.y - ay) * t;
      point.z = az + (point.z - az) * t;
      return true;
    }
    function emit(x, y, age) {
      const at = next * 4;
      next = (next + 1) % CAPACITY;
      if (!waves[at + 3]) state.active++;
      waves[at] = x; waves[at + 1] = y; waves[at + 2] = age; waves[at + 3] = strengthAt(age);
      state.hits++;
      return true;
    }
    function pulse(x, y, age = 0) {
      return onGlass(x, y) && emit(x, y, age);
    }
    // Clip a face's section through the mirror plane to the remaining glass.
    // Scratch output avoids allocating contacts during a swing.
    function section(ax, ay, bx, by) {
      let enter = 0, leave = 1;
      for (let axis = 0; axis < 2; axis++) {
        const start = axis ? ay : ax, delta = axis ? by - ay : bx - ax;
        const low = axis ? bounds.min[1] + (bounds.max[1] - bounds.min[1]) * (node.mirrorReveal || 0) : bounds.min[0];
        const high = bounds.max[axis];
        if (Math.abs(delta) < 1e-8) {
          if (start < low || start > high) return false;
        } else {
          const t0 = (low - start) / delta, t1 = (high - start) / delta;
          enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
          if (enter > leave) return false;
        }
      }
      if (node.mirrorDamage?.stage) {
        const verts = node.geometry.verts, dx = bx - ax, dy = by - ay;
        let earliest = Infinity;
        for (const face of node.geometry.faces) {
          const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
          const winding = (verts[b] - verts[a]) * (verts[c + 1] - verts[a + 1]) - (verts[b + 1] - verts[a + 1]) * (verts[c] - verts[a]);
          const sign = winding > 0 ? 1 : -1;
          let first = enter, last = leave;
          for (let edge = 0; edge < 3; edge++) {
            const from = face.i[edge] * 3, to = face.i[(edge + 1) % 3] * 3;
            const ex = verts[to] - verts[from], ey = verts[to + 1] - verts[from + 1];
            const start = sign * (ex * (ay - verts[from + 1]) - ey * (ax - verts[from])), delta = sign * (ex * dy - ey * dx);
            if (Math.abs(delta) < 1e-12) { if (start < 0) { first = Infinity; break; } }
            else {
              const t = -start / delta;
              if (delta > 0) first = Math.max(first, t); else last = Math.min(last, t);
              if (first > last) break;
            }
          }
          if (first <= last) earliest = Math.min(earliest, first);
        }
        if (earliest === Infinity) return false;
        enter = earliest;
      }
      contact[0] = ax + (bx - ax) * enter; contact[1] = ay + (by - ay) * enter;
      return true;
    }
    function overlap(matrix, geometry) {
      const verts = geometry.verts, plane = bounds.min[2];
      for (const face of geometry.faces) {
        const indices = face.i;
        let firstX = 0, firstY = 0, found = false;
        for (let i = 0; i < indices.length; i++) {
          const ai = indices[i] * 3, bi = indices[(i + 1) % indices.length] * 3;
          mat4.transformPoint(a, matrix, verts[ai], verts[ai + 1], verts[ai + 2]);
          mat4.transformPoint(b, matrix, verts[bi], verts[bi + 1], verts[bi + 2]);
          const az = a[2] - plane, bz = b[2] - plane;
          if (Math.abs(az) < 1e-7 && Math.abs(bz) < 1e-7) {
            if (section(a[0], a[1], b[0], b[1])) return true;
          } else if (az * bz <= 0) {
            const t = az / (az - bz), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
            if (onGlass(x, y)) { contact[0] = x; contact[1] = y; return true; }
            if (found && section(firstX, firstY, x, y)) return true;
            firstX = x; firstY = y; found = true;
          }
        }
      }
      return false;
    }
    function strike(previousWorld, currentWorld, geometry, dt = 0) {
      if (!node.visible || node.mirrorPortal || node.mirrorReveal >= 1) return false;
      mat4.multiply(previous, inverse, previousWorld); mat4.multiply(current, inverse, currentWorld);
      const box = BL.scene.boundsOf(geometry), plane = bounds.min[2];
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < 16; i++) {
        mat4.transformPoint(a, i < 8 ? previous : current, (i & 1 ? box.max : box.min)[0], (i & 2 ? box.max : box.min)[1], (i & 4 ? box.max : box.min)[2]);
        minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]);
        minY = Math.min(minY, a[1]); maxY = Math.max(maxY, a[1]);
        minZ = Math.min(minZ, a[2]); maxZ = Math.max(maxZ, a[2]);
      }
      const bottom = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * (node.mirrorReveal || 0);
      if (maxX < bounds.min[0] || minX > bounds.max[0] || maxY < bottom || minY > bounds.max[1] || minZ > plane || maxZ < plane) return false;
      // A swing can start with the visible club already touching the pane.
      if (overlap(previous, geometry)) return emit(contact[0], contact[1], dt);
      const verts = geometry.verts;
      let earliest = 2;
      for (let i = 0; i < verts.length; i += 3) {
        mat4.transformPoint(a, previous, verts[i], verts[i + 1], verts[i + 2]);
        mat4.transformPoint(b, current, verts[i], verts[i + 1], verts[i + 2]);
        const az = a[2] - plane, bz = b[2] - plane;
        if (az * bz > 0 || az === bz) continue;
        const t = az / (az - bz), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        if (t < earliest && onGlass(x, y)) { earliest = t; contact[0] = x; contact[1] = y; }
      }
      if (earliest <= 1) return emit(contact[0], contact[1], (1 - earliest) * dt);
      return overlap(current, geometry) ? emit(contact[0], contact[1], 0) : false;
    }
    function update(dt, time = state.time + dt) {
      state.time = time;
      if (!state.active) return;
      let active = 0;
      for (let at = 0; at < waves.length; at += 4) {
        if (!waves[at + 3]) continue;
        const age = waves[at + 2] + dt;
        waves[at + 2] = age;
        waves[at + 3] = age < LIFETIME ? strengthAt(age) : 0;
        if (waves[at + 3]) active++;
      }
      state.active = active;
    }
    function dispose() {
      waves.fill(0);
      state.active = 0;
      node.mirrorRipples = null;
    }
    node.mirrorRipples = state;
    return state;
  };
  BL.mirrorRipples = { create, CAPACITY, LIFETIME, SPEED, START_RADIUS, WIDTH, GLYPH_THRESHOLD };
})();
