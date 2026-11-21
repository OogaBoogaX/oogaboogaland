// Rigid bodies: a world of loose props that fall, tumble, stack, slide and come to rest, knocked about by blasts,
// shots, blows and walkers, and put back where they started on `reset`. Boxes and spheres; oriented box against box
// by the separating axis test with clipped face manifolds (up to four points) or an edge pair; a fixed 1/120 s step;
// a sequential impulse solver with friction, restitution, Baumgarte correction and warm starting matched by each
// contact's point on its first body; bodies sleep when still and wake on a touch. The static world is the scene's:
// `ground(x, z, y)` the highest surface at or under a point, `clear(x, feet, z, toX, toY, toZ, radius, height)` whether
// a body's way across is free of walls. Walkers are kinematic upright cylinders (`actor`), pushing with a bounded force. Every array is
// fixed at `create`; nothing allocates a frame.
(() => {
  "use strict";
  const BL = window.BL;
  const MAX_BODIES = 64, MAX_CONTACTS = 1536, MAX_ACTORS = 48;
  const STEP = 1 / 120, MAX_SUBSTEPS = 4, ITERATIONS = 10;
  const GRAVITY = -9.81, LINEAR_DAMP = 0.04, ANGULAR_DAMP = 0.12, MAX_SPEED = 30, MAX_SPIN = 40;
  const SLOP = 0.008, BAUMGARTE = 0.25, MAX_BIAS = 3, BOUNCE_MIN = 1.2, WARM_MATCH = 0.06;
  const SLEEP_V = 0.05, SLEEP_W = 0.1, SLEEP_TIME = 0.5;
  // A walker shoves with at most ACTOR_FORCE newtons; one standing within ACTOR_TOP of a body's top stands on it.
  const ACTOR_FORCE = 650, ACTOR_TOP = 0.12;
  // A body that falls this far below where it rests comes home.
  const LOST_DROP = 40;
  const BOX = 0, SPHERE = 1;
  // Pair keys: another body by its index, the static world as MAX_BODIES, a walker as MAX_BODIES + 1.
  const KEYS = MAX_BODIES + 2, WORLD = MAX_BODIES, ACTOR = MAX_BODIES + 1;

  // Water (`water(x, z)`: its surface there, or -Infinity): a body in it is held up by BUOYANCY times its weight for each
  // share of its height under the surface (wood floats a little under half sunk), slowed by WATER_DRAG, kept awake so it bobs
  // on the waves, and one coming down into it faster than SPLASH_SPEED is told to `onSplash(x, y, z, speed, body)`.
  const BUOYANCY = 2.4, WATER_DRAG = 2.2, WATER_SPIN = 3, SPLASH_SPEED = 1.2;
  const create = ({ ground, clear = null, water = null, onSplash = null }) => {
    const N = MAX_BODIES, C = MAX_CONTACTS;
    const P = new Float64Array(3 * N), Q = new Float64Array(4 * N), V = new Float64Array(3 * N), W = new Float64Array(3 * N);
    const H = new Float64Array(3 * N), R = new Float64Array(9 * N), IW = new Float64Array(9 * N), II = new Float64Array(3 * N);
    const IM = new Float64Array(N), MU = new Float64Array(N), REST = new Float64Array(N), BR = new Float64Array(N);
    const RP = new Float64Array(3 * N), RQ = new Float64Array(4 * N), OFF = new Float64Array(3 * N), EXT = new Float64Array(3 * N);
    const PREV = new Float64Array(3 * N), SLEEP_T = new Float64Array(N), MOVED = new Float64Array(N), SINCE_HIT = new Float64Array(N);
    const SHAPE = new Uint8Array(N), ASLEEP = new Uint8Array(N), DIRTY = new Uint8Array(N), WET = new Uint8Array(N);
    const nodes = new Array(N).fill(null), tags = new Array(N).fill(null);
    let count = 0;

    // Contacts this step, and last step's for warm starting.
    const cA = new Int16Array(C), cB = new Int16Array(C), cKey = new Int32Array(C);
    const cN = new Float64Array(3 * C), cP = new Float64Array(3 * C), cD = new Float64Array(C), cVB = new Float64Array(3 * C);
    const cRA = new Float64Array(3 * C), cRB = new Float64Array(3 * C), cT1 = new Float64Array(3 * C), cT2 = new Float64Array(3 * C);
    const cMn = new Float64Array(C), cMt1 = new Float64Array(C), cMt2 = new Float64Array(C), cBias = new Float64Array(C);
    const cLn = new Float64Array(C), cLt1 = new Float64Array(C), cLt2 = new Float64Array(C), cCap = new Float64Array(C), cMu = new Float64Array(C);
    const cLocal = new Float64Array(3 * C);
    const pKey = new Int32Array(C), pLocal = new Float64Array(3 * C), pLn = new Float64Array(C), pLt1 = new Float64Array(C), pLt2 = new Float64Array(C);
    const pairStart = new Int32Array(N * KEYS).fill(-1), pairCount = new Int32Array(N * KEYS), pairTouched = new Int32Array(C);
    let contacts = 0, prevContacts = 0, touched = 0, dropped = 0;

    // Walkers this frame: x, feet, z, radius, height and their velocity.
    const AX = new Float64Array(MAX_ACTORS * 8);
    let actors = 0;

    const stats = { bodies: 0, awake: 0, contacts: 0, dropped: 0, steps: 0 };
    let accumulator = 0;

    // ---- small vector helpers over scratch arrays ----
    const T = new Float64Array(64);
    const rotation = (i) => {
      const x = Q[4 * i], y = Q[4 * i + 1], z = Q[4 * i + 2], w = Q[4 * i + 3], r = 9 * i;
      const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
      R[r] = 1 - 2 * (yy + zz); R[r + 1] = 2 * (xy + wz); R[r + 2] = 2 * (xz - wy);
      R[r + 3] = 2 * (xy - wz); R[r + 4] = 1 - 2 * (xx + zz); R[r + 5] = 2 * (yz + wx);
      R[r + 6] = 2 * (xz + wy); R[r + 7] = 2 * (yz - wx); R[r + 8] = 1 - 2 * (xx + yy);
      // World inverse inertia R diag(II) R^T, and the box's half extent along each world axis.
      const a = II[3 * i], b = II[3 * i + 1], c = II[3 * i + 2], o = 9 * i;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
        IW[o + row * 3 + col] = R[r + row] * a * R[r + col] + R[r + 3 + row] * b * R[r + 3 + col] + R[r + 6 + row] * c * R[r + 6 + col];
      if (SHAPE[i] === BOX) for (let k = 0; k < 3; k++)
        EXT[3 * i + k] = Math.abs(R[r + k]) * H[3 * i] + Math.abs(R[r + 3 + k]) * H[3 * i + 1] + Math.abs(R[r + 6 + k]) * H[3 * i + 2];
      else EXT[3 * i] = EXT[3 * i + 1] = EXT[3 * i + 2] = H[3 * i];
    };
    // out[o..o+2] = IW_i * (x, y, z)
    const inertia = (i, x, y, z, out, o) => {
      const m = 9 * i;
      out[o] = IW[m] * x + IW[m + 1] * y + IW[m + 2] * z;
      out[o + 1] = IW[m + 3] * x + IW[m + 4] * y + IW[m + 5] * z;
      out[o + 2] = IW[m + 6] * x + IW[m + 7] * y + IW[m + 8] * z;
    };
    const wake = (i) => { if (ASLEEP[i]) { ASLEEP[i] = 0; SLEEP_T[i] = 0; } };

    // ---- bodies ----
    // `node` is drawn at the body: its origin sits at `offset` (in the body's frame) from the body's centre. `x, y, z`
    // the centre and `yaw` the turn it rests at; `half` the box's half extents (or `radius` a sphere's).
    const add = ({ node, x, y, z, yaw = 0, half = null, radius = 0, mass = 10, offset = null, friction = 0.6, restitution = 0.15, tag = null }) => {
      if (count >= N) throw new Error("physics: too many bodies");
      const i = count++;
      SHAPE[i] = half ? BOX : SPHERE;
      if (half) { H[3 * i] = half[0]; H[3 * i + 1] = half[1]; H[3 * i + 2] = half[2]; }
      else H[3 * i] = H[3 * i + 1] = H[3 * i + 2] = radius;
      IM[i] = 1 / mass;
      if (half) {
        const [a, b, c] = half;
        II[3 * i] = 3 / (mass * (b * b + c * c)); II[3 * i + 1] = 3 / (mass * (a * a + c * c)); II[3 * i + 2] = 3 / (mass * (a * a + b * b));
        BR[i] = Math.hypot(a, b, c);
      } else {
        II[3 * i] = II[3 * i + 1] = II[3 * i + 2] = 2.5 / (mass * radius * radius);
        BR[i] = radius;
      }
      MU[i] = friction; REST[i] = restitution;
      RP[3 * i] = x; RP[3 * i + 1] = y; RP[3 * i + 2] = z;
      RQ[4 * i] = 0; RQ[4 * i + 1] = Math.sin(yaw / 2); RQ[4 * i + 2] = 0; RQ[4 * i + 3] = Math.cos(yaw / 2);
      OFF[3 * i] = offset ? offset[0] : 0; OFF[3 * i + 1] = offset ? offset[1] : 0; OFF[3 * i + 2] = offset ? offset[2] : 0;
      nodes[i] = node; tags[i] = tag;
      home(i);
      return i;
    };
    // A drawn piece with its box in its own frame (`bounds`: min x, y, z then max x, y, z, as dressing.js `loose`
    // gives), its origin at (x, y, z) turned `yaw`: the body is that box, its weight from its size at `density`.
    const addPiece = ({ node, bounds: b, x, y, z, yaw = 0, density = 120, tag = null }) => {
      const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2, s = Math.sin(yaw), c = Math.cos(yaw);
      const half = [Math.max(0.04, (b[3] - b[0]) / 2), Math.max(0.04, (b[4] - b[1]) / 2), Math.max(0.04, (b[5] - b[2]) / 2)];
      return add({ node, x: x + cx * c + cz * s, y: y + cy, z: z - cx * s + cz * c, yaw, half, offset: [-cx, -cy, -cz],
        mass: Math.max(3, Math.min(40, 8 * half[0] * half[1] * half[2] * density)), tag });
    };
    const home = (i) => {
      for (let k = 0; k < 3; k++) { P[3 * i + k] = PREV[3 * i + k] = RP[3 * i + k]; V[3 * i + k] = W[3 * i + k] = 0; }
      for (let k = 0; k < 4; k++) Q[4 * i + k] = RQ[4 * i + k];
      ASLEEP[i] = 1; SLEEP_T[i] = 0; MOVED[i] = 0; SINCE_HIT[i] = 0; DIRTY[i] = 1; WET[i] = 0;
      rotation(i);
    };
    // Every body back where it rests; `onHome(i)` hears each one that had moved.
    const reset = (onHome = null) => {
      for (let i = 0; i < count; i++) {
        const moved = MOVED[i] || !ASLEEP[i];
        home(i);
        if (moved && onHome) onHome(i);
      }
      prevContacts = 0;
      sync();
    };
    const displaced = (i) => MOVED[i] > 0;

    // ---- forces ----
    const impulseAt = (i, px, py, pz, jx, jy, jz) => {
      wake(i); MOVED[i] = 1; SINCE_HIT[i] = 0;
      const im = IM[i], b = 3 * i;
      V[b] += jx * im; V[b + 1] += jy * im; V[b + 2] += jz * im;
      const rx = px - P[b], ry = py - P[b + 1], rz = pz - P[b + 2];
      inertia(i, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, T, 0);
      W[b] += T[0]; W[b + 1] += T[1]; W[b + 2] += T[2];
    };
    // A blast at (x, y, z): every body within `radius` of it (its own size added) is thrown out from it and a little
    // up, by up to `strength` newton-seconds, falling off with distance, and set spinning by its off-centre push.
    const explode = (x, y, z, radius, strength) => {
      let hit = 0;
      for (let i = 0; i < count; i++) {
        const b = 3 * i, dx = P[b] - x, dy = P[b + 1] - y, dz = P[b + 2] - z, d = Math.hypot(dx, dy, dz), reach = radius + BR[i];
        if (d >= reach) continue;
        const k = 1 - d / reach;
        let nx = d > 1e-3 ? dx / d : 0, ny = d > 1e-3 ? dy / d : 1, nz = d > 1e-3 ? dz / d : 0;
        ny += 0.6;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const j = strength * k * Math.min(1, Math.sqrt(1 / (IM[i] * 20)));
        impulseAt(i, P[b] - nx * BR[i] * 0.35 + (Math.random() - 0.5) * BR[i] * 0.4, P[b + 1] - ny * BR[i] * 0.35, P[b + 2] - nz * BR[i] * 0.35 + (Math.random() - 0.5) * BR[i] * 0.4, nx * j, ny * j, nz * j);
        hit++;
      }
      return hit;
    };
    // A shove in a sphere (a blow): every body overlapping it is pushed along (dx, dy, dz) by `strength`.
    const shove = (x, y, z, radius, dx, dy, dz, strength) => {
      let hit = 0;
      for (let i = 0; i < count; i++) {
        const b = 3 * i;
        if (Math.hypot(P[b] - x, P[b + 1] - y, P[b + 2] - z) >= radius + BR[i]) continue;
        impulseAt(i, x + (P[b] - x) * 0.5, y + (P[b + 1] - y) * 0.5, z + (P[b + 2] - z) * 0.5, dx * strength, dy * strength, dz * strength);
        hit++;
      }
      return hit;
    };

    // A round from `from` to `to`: the first body on its line stops it there (`to` is moved) and is knocked along it.
    // Returns the body, or -1.
    const HIT = { body: -1, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
    const shot = (from, to, power = 20) => {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
      if (!count || len < 1e-4 || !raycast(from.x, from.y, from.z, dx / len, dy / len, dz / len, len, HIT)) return -1;
      to.x = HIT.x; to.y = HIT.y; to.z = HIT.z;
      impulseAt(HIT.body, HIT.x, HIT.y, HIT.z, dx / len * power, dy / len * power + power * 0.15, dz / len * power);
      return HIT.body;
    };
    // A blow (charge 0 to 1; -1 a gun bash) from a body standing at (x, feet, z) `height` tall facing `yaw`: what
    // stands just in front of it is knocked away and a little up.
    const blow = (x, feet, z, height, yaw, charge) => {
      const hx = Math.sin(yaw), hz = Math.cos(yaw);
      return shove(x + hx * 0.9, feet + height * 0.45, z + hz * 0.9, 0.7, hx, 0.35, hz, charge < 0 ? 40 : 45 + 75 * Math.max(0, charge));
    };
    // A poke at body i from (fromX, fromZ): knocked away from there, up, and a little off its middle so it turns.
    const AT = { x: 0, y: 0, z: 0 };
    const knock = (i, fromX, fromZ, power = 20) => {
      position(i, AT);
      const dx = AT.x - fromX, dz = AT.z - fromZ, l = Math.hypot(dx, dz) || 1;
      impulseAt(i, AT.x + dz / l * 0.1, AT.y + 0.15, AT.z - dx / l * 0.1, dx / l * power, power * 0.6, dz / l * power);
    };

    // ---- queries ----
    // The nearest body along a ray within `max`: out.body, out.t, out.x/y/z, out.nx/ny/nz; or false.
    const raycast = (ox, oy, oz, dx, dy, dz, max, out) => {
      let best = max, hit = -1, bn = 0;
      for (let i = 0; i < count; i++) {
        const b = 3 * i, px = P[b] - ox, py = P[b + 1] - oy, pz = P[b + 2] - oz;
        const along = px * dx + py * dy + pz * dz, near = px * px + py * py + pz * pz - along * along;
        if (near > BR[i] * BR[i] || along + BR[i] < 0 || along - BR[i] > best) continue;
        if (SHAPE[i] === SPHERE) {
          const r = H[b], t = along - Math.sqrt(Math.max(0, r * r - near));
          if (t >= 0 && t < best) { best = t; hit = i; bn = -1; }
          continue;
        }
        // The ray in the box's frame, through its slabs.
        const r = 9 * i;
        let t0 = 0, t1 = best, axis = -1;
        for (let k = 0; k < 3; k++) {
          const ax = R[r + 3 * k], ay = R[r + 3 * k + 1], az = R[r + 3 * k + 2];
          const e = -(px * ax + py * ay + pz * az), f = dx * ax + dy * ay + dz * az, h = H[b + k];
          if (Math.abs(f) < 1e-9) { if (Math.abs(e) > h) { t0 = Infinity; break; } continue; }
          let a = (-h - e) / f, c = (h - e) / f, sign = -1;
          if (a > c) { const s = a; a = c; c = s; sign = 1; }
          if (a > t0) { t0 = a; axis = k * 2 + (sign > 0 ? 1 : 0); }
          if (c < t1) t1 = c;
          if (t0 > t1) { t0 = Infinity; break; }
        }
        if (t0 < best && t0 >= 0) { best = t0; hit = i; bn = axis; }
      }
      if (hit < 0) return false;
      out.body = hit; out.t = best;
      out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best;
      if (bn < 0) {
        const b = 3 * hit, l = Math.hypot(out.x - P[b], out.y - P[b + 1], out.z - P[b + 2]) || 1;
        out.nx = (out.x - P[b]) / l; out.ny = (out.y - P[b + 1]) / l; out.nz = (out.z - P[b + 2]) / l;
      } else {
        const r = 9 * hit + 3 * (bn >> 1), s = bn & 1 ? 1 : -1;
        out.nx = R[r] * s; out.ny = R[r + 1] * s; out.nz = R[r + 2] * s;
      }
      return true;
    };
    const DOWN = { body: -1, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
    // The highest body top under (x, z) no higher than `y + rise`, or -Infinity: where a walker can stand on one.
    const supportAt = (x, z, y, rise = 0.5) => {
      const top = y + rise;
      return raycast(x, top + 1e-4, z, 0, -1, 0, top + 1e3, DOWN) && DOWN.ny > 0.5 ? DOWN.y : -Infinity;
    };

    // ---- walkers ----
    const clearActors = () => { actors = 0; };
    const actor = (x, feet, z, radius, height, vx, vz) => {
      if (actors >= MAX_ACTORS) return;
      const a = 8 * actors++;
      AX[a] = x; AX[a + 1] = feet; AX[a + 2] = z; AX[a + 3] = radius; AX[a + 4] = height; AX[a + 5] = vx; AX[a + 6] = vz;
    };

    // ---- contacts ----
    const pairKey = (a, bk) => a * KEYS + bk;
    // A contact on body a from b (-1: the world or a walker, `bk` its pair key), its normal pushing a away from b.
    const contact = (a, b, bk, nx, ny, nz, px, py, pz, depth, vbx = 0, vbz = 0, cap = Infinity) => {
      if (contacts >= C) { dropped++; return; }
      // A sleeping body touched gently stays asleep and holds still, as the world does, for what rests on it.
      if (b >= 0) {
        if (ASLEEP[a] && !ASLEEP[b]) { const s = a; a = b; b = s; bk = s; nx = -nx; ny = -ny; nz = -nz; }
        if (ASLEEP[b]) b = -1;
      }
      const c = contacts++, c3 = 3 * c;
      cA[c] = a; cB[c] = b; cKey[c] = pairKey(a, bk);
      cN[c3] = nx; cN[c3 + 1] = ny; cN[c3 + 2] = nz;
      cP[c3] = px; cP[c3 + 1] = py; cP[c3 + 2] = pz;
      cD[c] = depth; cVB[c3] = vbx; cVB[c3 + 1] = 0; cVB[c3 + 2] = vbz; cCap[c] = cap;
      cMu[c] = b >= 0 ? Math.sqrt(MU[a] * MU[b]) : MU[a];
      // The point in a's own frame, which last step's contact must lie near to lend its impulses.
      const r = 9 * a, rx = px - P[3 * a], ry = py - P[3 * a + 1], rz = pz - P[3 * a + 2];
      cLocal[c3] = rx * R[r] + ry * R[r + 1] + rz * R[r + 2];
      cLocal[c3 + 1] = rx * R[r + 3] + ry * R[r + 4] + rz * R[r + 5];
      cLocal[c3 + 2] = rx * R[r + 6] + ry * R[r + 7] + rz * R[r + 8];
    };

    // A box's corner k (bits pick the sign on each axis) into T[o..o+2].
    const corner = (i, k, o) => {
      const b = 3 * i, r = 9 * i, sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1, sz = k & 4 ? 1 : -1;
      const hx = H[b] * sx, hy = H[b + 1] * sy, hz = H[b + 2] * sz;
      T[o] = P[b] + R[r] * hx + R[r + 3] * hy + R[r + 6] * hz;
      T[o + 1] = P[b + 1] + R[r + 1] * hx + R[r + 4] * hy + R[r + 7] * hz;
      T[o + 2] = P[b + 2] + R[r + 2] * hx + R[r + 5] * hy + R[r + 8] * hz;
    };
    const collideWorld = (i) => {
      const b = 3 * i, low = P[b + 1] - EXT[b + 1];
      const under = ground(P[b], P[b + 2], P[b + 1]);
      if (low > under + 0.6) return;
      if (SHAPE[i] === SPHERE) {
        const g = ground(P[b], P[b + 2], P[b + 1]);
        if (low < g + 0.002) contact(i, -1, WORLD, 0, 1, 0, P[b], low, P[b + 2], g - low);
        return;
      }
      for (let k = 0; k < 8; k++) {
        corner(i, k, 0);
        if (T[1] > under + 0.6) continue;
        const g = ground(T[0], T[2], T[1] + 0.3);
        if (T[1] < g + 0.002) contact(i, -1, WORLD, 0, 1, 0, T[0], T[1], T[2], g - T[1]);
      }
    };
    // The point of box i nearest (x, y, z) into T[o..o+2]; returns whether the point lies inside it.
    const nearestOnBox = (i, x, y, z, o) => {
      const b = 3 * i, r = 9 * i, dx = x - P[b], dy = y - P[b + 1], dz = z - P[b + 2];
      let inside = true;
      T[o] = P[b]; T[o + 1] = P[b + 1]; T[o + 2] = P[b + 2];
      for (let k = 0; k < 3; k++) {
        const ax = R[r + 3 * k], ay = R[r + 3 * k + 1], az = R[r + 3 * k + 2], h = H[b + k];
        let d = dx * ax + dy * ay + dz * az;
        if (d > h) { d = h; inside = false; } else if (d < -h) { d = -h; inside = false; }
        T[o] += ax * d; T[o + 1] += ay * d; T[o + 2] += az * d;
      }
      return inside;
    };
    const collideActor = (i, a, dt) => {
      const b = 3 * i, x = AX[a], feet = AX[a + 1], z = AX[a + 2], rad = AX[a + 3], h = AX[a + 4];
      const top = P[b + 1] + EXT[b + 1], bottom = P[b + 1] - EXT[b + 1];
      if (feet >= top - ACTOR_TOP || feet + h <= bottom) return;
      if (Math.abs(P[b] - x) > rad + EXT[b] || Math.abs(P[b + 2] - z) > rad + EXT[b + 2]) return;
      const y = Math.max(feet, Math.min(feet + h, P[b + 1]));
      let qx, qz, inside;
      if (SHAPE[i] === SPHERE) {
        const dx = P[b] - x, dz = P[b + 2] - z, d = Math.hypot(dx, dz), r = H[b];
        if (d >= rad + r) return;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        contact(i, -1, ACTOR, nx, 0, nz, P[b] - nx * r, P[b + 1], P[b + 2] - nz * r, rad + r - d, AX[a + 5], AX[a + 6], ACTOR_FORCE * dt);
        MOVED[i] = 1; SINCE_HIT[i] = 0;
        return;
      }
      inside = nearestOnBox(i, x, y, z, 0);
      qx = T[0]; qz = T[2];
      const dx = qx - x, dz = qz - z, d = Math.hypot(dx, dz);
      if (!inside && d >= rad) return;
      // Out from the walker's axis, or, with the axis inside the box, out toward the box's middle.
      let nx = dx, nz = dz, l = d;
      if (inside || d < 1e-4) { nx = P[b] - x; nz = P[b + 2] - z; l = Math.hypot(nx, nz); if (l < 1e-6) { nx = 1; nz = 0; l = 1; } }
      nx /= l; nz /= l;
      const depth = inside ? rad + EXT[b] - ((P[b] - x) * nx + (P[b + 2] - z) * nz) : rad - d;
      contact(i, -1, ACTOR, nx, 0, nz, qx, T[1], qz, Math.min(depth, 0.3), AX[a + 5], AX[a + 6], ACTOR_FORCE * dt);
      MOVED[i] = 1; SINCE_HIT[i] = 0;
    };
    const collideSpheres = (a, b) => {
      const pa = 3 * a, pb = 3 * b, dx = P[pa] - P[pb], dy = P[pa + 1] - P[pb + 1], dz = P[pa + 2] - P[pb + 2];
      const d = Math.hypot(dx, dy, dz), r = H[pa] + H[pb];
      if (d >= r) return;
      const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1, nz = d > 1e-6 ? dz / d : 0;
      contact(a, b, b, nx, ny, nz, P[pa] - nx * H[pa], P[pa + 1] - ny * H[pa], P[pa + 2] - nz * H[pa], r - d);
    };
    // Box a, sphere s.
    const collideBoxSphere = (a, s) => {
      const ps = 3 * s, r = H[ps];
      const inside = nearestOnBox(a, P[ps], P[ps + 1], P[ps + 2], 0);
      let nx = P[ps] - T[0], ny = P[ps + 1] - T[1], nz = P[ps + 2] - T[2], d = Math.hypot(nx, ny, nz);
      if (!inside && d >= r) return;
      if (inside || d < 1e-6) { nx = P[ps] - P[3 * a]; ny = P[ps + 1] - P[3 * a + 1]; nz = P[ps + 2] - P[3 * a + 2]; d = Math.hypot(nx, ny, nz) || 1; }
      nx /= d; ny /= d; nz /= d;
      // The sphere is pushed along +n; its contact sits on its surface toward the box.
      contact(s, a, a, nx, ny, nz, P[ps] - nx * r, P[ps + 1] - ny * r, P[ps + 2] - nz * r, inside ? r : r - d);
    };

    // Box against box: the axis of least overlap among the 15, then a clipped face or an edge pair.
    const POLY = new Float64Array(3 * 8), CLIP = new Float64Array(3 * 8), DEPTH = new Float64Array(8);
    const KEEP = new Int8Array(4);
    const clipPlane = (inp, n, ax, ay, az, off, out) => {
      // Keeps the polygon's part where (p · axis) <= off.
      let m = 0;
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n, k3 = 3 * k, j3 = 3 * j;
        const dk = inp[k3] * ax + inp[k3 + 1] * ay + inp[k3 + 2] * az - off, dj = inp[j3] * ax + inp[j3 + 1] * ay + inp[j3 + 2] * az - off;
        if (dk <= 0 && m < 8) { out[3 * m] = inp[k3]; out[3 * m + 1] = inp[k3 + 1]; out[3 * m + 2] = inp[k3 + 2]; m++; }
        if ((dk < 0) !== (dj < 0) && m < 8) {
          const t = dk / (dk - dj);
          out[3 * m] = inp[k3] + (inp[j3] - inp[k3]) * t; out[3 * m + 1] = inp[k3 + 1] + (inp[j3 + 1] - inp[k3 + 1]) * t; out[3 * m + 2] = inp[k3 + 2] + (inp[j3 + 2] - inp[k3 + 2]) * t;
          m++;
        }
      }
      return m;
    };
    const collideBoxes = (a, b) => {
      const pa = 3 * a, pb = 3 * b, ra = 9 * a, rb = 9 * b;
      const dx = P[pb] - P[pa], dy = P[pb + 1] - P[pa + 1], dz = P[pb + 2] - P[pa + 2];
      // C[i][j] = Au_i · Bu_j
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
        T[i * 3 + j] = R[ra + 3 * i] * R[rb + 3 * j] + R[ra + 3 * i + 1] * R[rb + 3 * j + 1] + R[ra + 3 * i + 2] * R[rb + 3 * j + 2];
      for (let k = 0; k < 9; k++) T[9 + k] = Math.abs(T[k]) + 1e-9;
      let best = -Infinity, axis = -1, nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < 3; i++) {
        const ux = R[ra + 3 * i], uy = R[ra + 3 * i + 1], uz = R[ra + 3 * i + 2];
        const s = Math.abs(dx * ux + dy * uy + dz * uz) - (H[pa + i] + H[pb] * T[9 + i * 3] + H[pb + 1] * T[10 + i * 3] + H[pb + 2] * T[11 + i * 3]);
        if (s > 0) return;
        if (s > best) { best = s; axis = i; nx = ux; ny = uy; nz = uz; }
      }
      for (let j = 0; j < 3; j++) {
        const ux = R[rb + 3 * j], uy = R[rb + 3 * j + 1], uz = R[rb + 3 * j + 2];
        // A tie goes to a's face, so the reference face does not flicker between the two.
        const s = (Math.abs(dx * ux + dy * uy + dz * uz) - (H[pb + j] + H[pa] * T[9 + j] + H[pa + 1] * T[12 + j] + H[pa + 2] * T[15 + j])) * 1.0001;
        if (s > 0) return;
        if (s > best) { best = s; axis = 3 + j; nx = ux; ny = uy; nz = uz; }
      }
      const faceBest = best;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const ux = R[ra + 3 * i], uy = R[ra + 3 * i + 1], uz = R[ra + 3 * i + 2], vx = R[rb + 3 * j], vy = R[rb + 3 * j + 1], vz = R[rb + 3 * j + 2];
        let lx = uy * vz - uz * vy, ly = uz * vx - ux * vz, lz = ux * vy - uy * vx;
        const l = Math.hypot(lx, ly, lz);
        if (l < 1e-5) continue;
        lx /= l; ly /= l; lz /= l;
        let rA = 0, rB = 0;
        for (let k = 0; k < 3; k++) {
          rA += H[pa + k] * Math.abs(R[ra + 3 * k] * lx + R[ra + 3 * k + 1] * ly + R[ra + 3 * k + 2] * lz);
          rB += H[pb + k] * Math.abs(R[rb + 3 * k] * lx + R[rb + 3 * k + 1] * ly + R[rb + 3 * k + 2] * lz);
        }
        const s = Math.abs(dx * lx + dy * ly + dz * lz) - (rA + rB);
        if (s > 0) return;
        // An edge axis wins only clearly over the faces, which give steadier manifolds.
        if (s > best && s > faceBest * 0.95 + 0.01) { best = s; axis = 6 + i * 3 + j; nx = lx; ny = ly; nz = lz; }
      }
      // The normal pointing from b to a.
      if (dx * nx + dy * ny + dz * nz > 0) { nx = -nx; ny = -ny; nz = -nz; }
      const depth = -best;
      if (axis >= 6) {
        const i = ((axis - 6) / 3) | 0, j = (axis - 6) % 3;
        // a's edge nearest b, b's edge nearest a.
        let ax0 = P[pa], ay0 = P[pa + 1], az0 = P[pa + 2], bx0 = P[pb], by0 = P[pb + 1], bz0 = P[pb + 2];
        for (let k = 0; k < 3; k++) {
          if (k !== i) {
            const ux = R[ra + 3 * k], uy = R[ra + 3 * k + 1], uz = R[ra + 3 * k + 2], s = (ux * nx + uy * ny + uz * nz) > 0 ? -H[pa + k] : H[pa + k];
            ax0 += ux * s; ay0 += uy * s; az0 += uz * s;
          }
          if (k !== j) {
            const ux = R[rb + 3 * k], uy = R[rb + 3 * k + 1], uz = R[rb + 3 * k + 2], s = (ux * nx + uy * ny + uz * nz) > 0 ? H[pb + k] : -H[pb + k];
            bx0 += ux * s; by0 += uy * s; bz0 += uz * s;
          }
        }
        const ux = R[ra + 3 * i], uy = R[ra + 3 * i + 1], uz = R[ra + 3 * i + 2], vx = R[rb + 3 * j], vy = R[rb + 3 * j + 1], vz = R[rb + 3 * j + 2];
        const wx = ax0 - bx0, wy = ay0 - by0, wz = az0 - bz0;
        const uv = ux * vx + uy * vy + uz * vz, uw = ux * wx + uy * wy + uz * wz, vw = vx * wx + vy * wy + vz * wz, den = 1 - uv * uv;
        let s = 0, t = 0;
        if (den > 1e-8) { s = (uv * vw - uw) / den; t = (vw - uv * uw) / den; }
        s = Math.max(-H[pa + i], Math.min(H[pa + i], s)); t = Math.max(-H[pb + j], Math.min(H[pb + j], t));
        const px = (ax0 + ux * s + bx0 + vx * t) * 0.5, py = (ay0 + uy * s + by0 + vy * t) * 0.5, pz = (az0 + uz * s + bz0 + vz * t) * 0.5;
        contact(a, b, b, nx, ny, nz, px, py, pz, depth);
        return;
      }
      // Face: the reference box owns the axis; its face toward the other is clipped by the incident face.
      const refA = axis < 3, ref = refA ? a : b, inc = refA ? b : a, k = refA ? axis : axis - 3;
      const pr = 3 * ref, pi = 3 * inc, rr = 9 * ref, ri = 9 * inc;
      // The reference face's outward normal, toward the incident box.
      let fx = refA ? -nx : nx, fy = refA ? -ny : ny, fz = refA ? -nz : nz;
      // The incident face: the one facing most against it.
      let inK = 0, inBest = -Infinity, inSign = 1;
      for (let m = 0; m < 3; m++) {
        const d = R[ri + 3 * m] * fx + R[ri + 3 * m + 1] * fy + R[ri + 3 * m + 2] * fz;
        if (Math.abs(d) > inBest) { inBest = Math.abs(d); inK = m; inSign = d > 0 ? -1 : 1; }
      }
      const u = (inK + 1) % 3, v = (inK + 2) % 3;
      const cx = P[pi] + R[ri + 3 * inK] * H[pi + inK] * inSign, cy = P[pi + 1] + R[ri + 3 * inK + 1] * H[pi + inK] * inSign, cz = P[pi + 2] + R[ri + 3 * inK + 2] * H[pi + inK] * inSign;
      for (let m = 0; m < 4; m++) {
        const su = m === 0 || m === 3 ? 1 : -1, sv = m < 2 ? 1 : -1;
        const hu = H[pi + u] * su, hv = H[pi + v] * sv;
        POLY[3 * m] = cx + R[ri + 3 * u] * hu + R[ri + 3 * v] * hv;
        POLY[3 * m + 1] = cy + R[ri + 3 * u + 1] * hu + R[ri + 3 * v + 1] * hv;
        POLY[3 * m + 2] = cz + R[ri + 3 * u + 2] * hu + R[ri + 3 * v + 2] * hv;
      }
      let n = 4, from = POLY, to = CLIP;
      const ru = (k + 1) % 3, rv = (k + 2) % 3;
      for (let plane = 0; plane < 4; plane++) {
        const side = plane < 2 ? ru : rv, sign = plane & 1 ? -1 : 1;
        const ax = R[rr + 3 * side] * sign, ay = R[rr + 3 * side + 1] * sign, az = R[rr + 3 * side + 2] * sign;
        n = clipPlane(from, n, ax, ay, az, P[pr] * ax + P[pr + 1] * ay + P[pr + 2] * az + H[pr + side], to);
        const swap = from; from = to; to = swap;
        if (!n) return;
      }
      const faceD = P[pr] * fx + P[pr + 1] * fy + P[pr + 2] * fz + H[pr + k];
      let m = 0;
      for (let q = 0; q < n; q++) {
        const sep = from[3 * q] * fx + from[3 * q + 1] * fy + from[3 * q + 2] * fz - faceD;
        if (sep > 0.002) continue;
        from[3 * m] = from[3 * q]; from[3 * m + 1] = from[3 * q + 1]; from[3 * m + 2] = from[3 * q + 2]; DEPTH[m] = -sep; m++;
      }
      if (!m) return;
      // At most four points: the deepest, the farthest from it, then the two farthest either side of their line.
      let count4 = m;
      if (m > 4) {
        let p0 = 0;
        for (let q = 1; q < m; q++) if (DEPTH[q] > DEPTH[p0]) p0 = q;
        let p1 = -1, far = -1;
        for (let q = 0; q < m; q++) { const d = (from[3 * q] - from[3 * p0]) ** 2 + (from[3 * q + 1] - from[3 * p0 + 1]) ** 2 + (from[3 * q + 2] - from[3 * p0 + 2]) ** 2; if (d > far) { far = d; p1 = q; } }
        let p2 = -1, p3 = -1, hi = 0, lo = 0;
        for (let q = 0; q < m; q++) {
          const e1x = from[3 * p1] - from[3 * p0], e1y = from[3 * p1 + 1] - from[3 * p0 + 1], e1z = from[3 * p1 + 2] - from[3 * p0 + 2];
          const e2x = from[3 * q] - from[3 * p0], e2y = from[3 * q + 1] - from[3 * p0 + 1], e2z = from[3 * q + 2] - from[3 * p0 + 2];
          const area = (e1y * e2z - e1z * e2y) * fx + (e1z * e2x - e1x * e2z) * fy + (e1x * e2y - e1y * e2x) * fz;
          if (area > hi) { hi = area; p2 = q; }
          if (area < lo) { lo = area; p3 = q; }
        }
        KEEP[0] = p0; KEEP[1] = p1; KEEP[2] = p2; KEEP[3] = p3;
        count4 = 0;
        for (let q = 0; q < 4; q++) {
          const idx = KEEP[q];
          if (idx < 0) continue;
          to[3 * count4] = from[3 * idx]; to[3 * count4 + 1] = from[3 * idx + 1]; to[3 * count4 + 2] = from[3 * idx + 2]; T[40 + count4] = DEPTH[idx]; count4++;
        }
        for (let q = 0; q < count4; q++) { from[3 * q] = to[3 * q]; from[3 * q + 1] = to[3 * q + 1]; from[3 * q + 2] = to[3 * q + 2]; DEPTH[q] = T[40 + q]; }
      }
      // Each point lies on the incident face; the contact sits halfway onto the reference face.
      for (let q = 0; q < count4; q++) {
        const half = DEPTH[q] * 0.5, px = from[3 * q] + fx * half, py = from[3 * q + 1] + fy * half, pz = from[3 * q + 2] + fz * half;
        contact(a, b, b, nx, ny, nz, px, py, pz, DEPTH[q]);
      }
    };

    const collide = (dt) => {
      contacts = 0;
      for (let i = 0; i < count; i++) {
        if (ASLEEP[i]) continue;
        collideWorld(i);
        for (let a = 0; a < actors; a++) collideActor(i, 8 * a, dt);
      }
      // A walker wakes a sleeping body it walks into.
      for (let i = 0; i < count; i++) {
        if (!ASLEEP[i]) continue;
        for (let a = 0; a < actors; a++) {
          const o = 8 * a, b = 3 * i;
          if ((AX[o + 5] || AX[o + 6]) && Math.abs(P[b] - AX[o]) < AX[o + 3] + EXT[b] && Math.abs(P[b + 2] - AX[o + 2]) < AX[o + 3] + EXT[b + 2]
            && AX[o + 1] < P[b + 1] + EXT[b + 1] - ACTOR_TOP && AX[o + 1] + AX[o + 4] > P[b + 1] - EXT[b + 1]) {
            wake(i); MOVED[i] = 1; collideWorld(i);
            for (let other = 0; other < actors; other++) collideActor(i, 8 * other, dt);
            break;
          }
        }
      }
      for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
        if (ASLEEP[a] && ASLEEP[b]) continue;
        const pa = 3 * a, pb = 3 * b;
        if (Math.abs(P[pa] - P[pb]) > EXT[pa] + EXT[pb] || Math.abs(P[pa + 1] - P[pb + 1]) > EXT[pa + 1] + EXT[pb + 1] || Math.abs(P[pa + 2] - P[pb + 2]) > EXT[pa + 2] + EXT[pb + 2]) continue;
        // An awake body touching a sleeping one at speed wakes it (and its contacts with the world come with it);
        // touching it gently, it leans on it as on the world.
        const sleeper = ASLEEP[a] ? a : ASLEEP[b] ? b : -1;
        if (sleeper >= 0) {
          const k = 3 * (sleeper === a ? b : a);
          if (V[k] * V[k] + V[k + 1] * V[k + 1] + V[k + 2] * V[k + 2] > 4 * SLEEP_V * SLEEP_V || W[k] * W[k] + W[k + 1] * W[k + 1] + W[k + 2] * W[k + 2] > 4 * SLEEP_W * SLEEP_W) {
            wake(sleeper); collideWorld(sleeper);
          }
        }
        if (SHAPE[a] === BOX && SHAPE[b] === BOX) collideBoxes(a, b);
        else if (SHAPE[a] === SPHERE && SHAPE[b] === SPHERE) collideSpheres(a, b);
        else if (SHAPE[a] === BOX) collideBoxSphere(a, b);
        else collideBoxSphere(b, a);
      }
    };

    // ---- solver ----
    const relative = (c) => {
      const a = cA[c], b = cB[c], c3 = 3 * c, pa = 3 * a;
      let vx = V[pa] + W[pa + 1] * cRA[c3 + 2] - W[pa + 2] * cRA[c3 + 1];
      let vy = V[pa + 1] + W[pa + 2] * cRA[c3] - W[pa] * cRA[c3 + 2];
      let vz = V[pa + 2] + W[pa] * cRA[c3 + 1] - W[pa + 1] * cRA[c3];
      if (b >= 0) {
        const pb = 3 * b;
        vx -= V[pb] + W[pb + 1] * cRB[c3 + 2] - W[pb + 2] * cRB[c3 + 1];
        vy -= V[pb + 1] + W[pb + 2] * cRB[c3] - W[pb] * cRB[c3 + 2];
        vz -= V[pb + 2] + W[pb] * cRB[c3 + 1] - W[pb + 1] * cRB[c3];
      } else { vx -= cVB[c3]; vy -= cVB[c3 + 1]; vz -= cVB[c3 + 2]; }
      T[20] = vx; T[21] = vy; T[22] = vz;
    };
    // 1 / (the effective mass along d) at contact c.
    const massAlong = (c, dx, dy, dz) => {
      const a = cA[c], b = cB[c], c3 = 3 * c;
      let k = IM[a];
      let rx = cRA[c3 + 1] * dz - cRA[c3 + 2] * dy, ry = cRA[c3 + 2] * dx - cRA[c3] * dz, rz = cRA[c3] * dy - cRA[c3 + 1] * dx;
      inertia(a, rx, ry, rz, T, 24);
      k += (T[25] * cRA[c3 + 2] - T[26] * cRA[c3 + 1]) * dx + (T[26] * cRA[c3] - T[24] * cRA[c3 + 2]) * dy + (T[24] * cRA[c3 + 1] - T[25] * cRA[c3]) * dz;
      if (b >= 0) {
        k += IM[b];
        rx = cRB[c3 + 1] * dz - cRB[c3 + 2] * dy; ry = cRB[c3 + 2] * dx - cRB[c3] * dz; rz = cRB[c3] * dy - cRB[c3 + 1] * dx;
        inertia(b, rx, ry, rz, T, 24);
        k += (T[25] * cRB[c3 + 2] - T[26] * cRB[c3 + 1]) * dx + (T[26] * cRB[c3] - T[24] * cRB[c3 + 2]) * dy + (T[24] * cRB[c3 + 1] - T[25] * cRB[c3]) * dz;
      }
      return k > 1e-12 ? 1 / k : 0;
    };
    const apply = (c, jx, jy, jz) => {
      const a = cA[c], b = cB[c], c3 = 3 * c, pa = 3 * a;
      V[pa] += jx * IM[a]; V[pa + 1] += jy * IM[a]; V[pa + 2] += jz * IM[a];
      inertia(a, cRA[c3 + 1] * jz - cRA[c3 + 2] * jy, cRA[c3 + 2] * jx - cRA[c3] * jz, cRA[c3] * jy - cRA[c3 + 1] * jx, T, 28);
      W[pa] += T[28]; W[pa + 1] += T[29]; W[pa + 2] += T[30];
      if (b >= 0) {
        const pb = 3 * b;
        V[pb] -= jx * IM[b]; V[pb + 1] -= jy * IM[b]; V[pb + 2] -= jz * IM[b];
        inertia(b, cRB[c3 + 1] * jz - cRB[c3 + 2] * jy, cRB[c3 + 2] * jx - cRB[c3] * jz, cRB[c3] * jy - cRB[c3 + 1] * jx, T, 28);
        W[pb] -= T[28]; W[pb + 1] -= T[29]; W[pb + 2] -= T[30];
      }
    };
    const prepare = (dt) => {
      for (let c = 0; c < contacts; c++) {
        const a = cA[c], b = cB[c], c3 = 3 * c;
        for (let k = 0; k < 3; k++) {
          cRA[c3 + k] = cP[c3 + k] - P[3 * a + k];
          cRB[c3 + k] = b >= 0 ? cP[c3 + k] - P[3 * b + k] : 0;
        }
        const nx = cN[c3], ny = cN[c3 + 1], nz = cN[c3 + 2];
        // Two tangents across the normal.
        let tx, ty, tz;
        if (Math.abs(nx) < 0.57) { tx = 0; ty = nz; tz = -ny; } else { tx = nz; ty = 0; tz = -nx; }
        const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
        cT1[c3] = tx; cT1[c3 + 1] = ty; cT1[c3 + 2] = tz;
        cT2[c3] = ny * tz - nz * ty; cT2[c3 + 1] = nz * tx - nx * tz; cT2[c3 + 2] = nx * ty - ny * tx;
        cMn[c] = massAlong(c, nx, ny, nz);
        cMt1[c] = massAlong(c, tx, ty, tz);
        cMt2[c] = massAlong(c, cT2[c3], cT2[c3 + 1], cT2[c3 + 2]);
        relative(c);
        const vn = T[20] * nx + T[21] * ny + T[22] * nz;
        let bias = Math.min(MAX_BIAS, BAUMGARTE / dt * Math.max(0, cD[c] - SLOP));
        const e = b >= 0 ? Math.max(REST[a], REST[b]) : REST[a];
        if (vn < -BOUNCE_MIN && cKey[c] % KEYS !== ACTOR) bias = Math.max(bias, -e * vn);
        cBias[c] = bias;
        // Warm start from last step's contact at the same point on the same pair.
        cLn[c] = cLt1[c] = cLt2[c] = 0;
        const start = pairStart[cKey[c]];
        if (start >= 0) {
          const end = start + pairCount[cKey[c]];
          for (let p = start; p < end; p++) {
            const p3 = 3 * p;
            if (Math.abs(pLocal[p3] - cLocal[c3]) < WARM_MATCH && Math.abs(pLocal[p3 + 1] - cLocal[c3 + 1]) < WARM_MATCH && Math.abs(pLocal[p3 + 2] - cLocal[c3 + 2]) < WARM_MATCH) {
              cLn[c] = Math.min(pLn[p] * 0.9, cCap[c]); cLt1[c] = pLt1[p] * 0.9; cLt2[c] = pLt2[p] * 0.9;
              break;
            }
          }
        }
        if (cLn[c] || cLt1[c] || cLt2[c]) apply(c, nx * cLn[c] + tx * cLt1[c] + cT2[c3] * cLt2[c], ny * cLn[c] + ty * cLt1[c] + cT2[c3 + 1] * cLt2[c], nz * cLn[c] + tz * cLt1[c] + cT2[c3 + 2] * cLt2[c]);
      }
    };
    const solve = () => {
      for (let it = 0; it < ITERATIONS; it++) {
        for (let c = 0; c < contacts; c++) {
          const c3 = 3 * c;
          // Friction first, bounded by the normal impulse so far.
          relative(c);
          const limit = cMu[c] * cLn[c];
          let d = -(T[20] * cT1[c3] + T[21] * cT1[c3 + 1] + T[22] * cT1[c3 + 2]) * cMt1[c];
          let next = Math.max(-limit, Math.min(limit, cLt1[c] + d)); d = next - cLt1[c]; cLt1[c] = next;
          if (d) apply(c, cT1[c3] * d, cT1[c3 + 1] * d, cT1[c3 + 2] * d);
          relative(c);
          d = -(T[20] * cT2[c3] + T[21] * cT2[c3 + 1] + T[22] * cT2[c3 + 2]) * cMt2[c];
          next = Math.max(-limit, Math.min(limit, cLt2[c] + d)); d = next - cLt2[c]; cLt2[c] = next;
          if (d) apply(c, cT2[c3] * d, cT2[c3 + 1] * d, cT2[c3 + 2] * d);
          relative(c);
          const vn = T[20] * cN[c3] + T[21] * cN[c3 + 1] + T[22] * cN[c3 + 2];
          d = (cBias[c] - vn) * cMn[c];
          next = Math.max(0, Math.min(cCap[c], cLn[c] + d)); d = next - cLn[c]; cLn[c] = next;
          if (d) apply(c, cN[c3] * d, cN[c3 + 1] * d, cN[c3 + 2] * d);
        }
      }
    };
    // Keep this step's impulses, grouped by pair, for the next step's warm start.
    const store = () => {
      for (let t = 0; t < touched; t++) { pairStart[pairTouched[t]] = -1; pairCount[pairTouched[t]] = 0; }
      touched = 0;
      // Contacts are written pair by pair, so each pair's run is contiguous.
      for (let c = 0; c < contacts; c++) {
        const key = cKey[c], c3 = 3 * c;
        if (pairStart[key] < 0) { pairStart[key] = c; pairCount[key] = 0; if (touched < C) pairTouched[touched++] = key; }
        pairCount[key]++;
        pKey[c] = key; pLocal[c3] = cLocal[c3]; pLocal[c3 + 1] = cLocal[c3 + 1]; pLocal[c3 + 2] = cLocal[c3 + 2];
        pLn[c] = cLn[c]; pLt1[c] = cLt1[c]; pLt2[c] = cLt2[c];
      }
      prevContacts = contacts;
    };

    const integrate = (dt) => {
      for (let i = 0; i < count; i++) {
        if (ASLEEP[i]) continue;
        const b = 3 * i, q = 4 * i;
        PREV[b] = P[b]; PREV[b + 1] = P[b + 1]; PREV[b + 2] = P[b + 2];
        P[b] += V[b] * dt; P[b + 1] += V[b + 1] * dt; P[b + 2] += V[b + 2] * dt;
        const wx = W[b], wy = W[b + 1], wz = W[b + 2], x = Q[q], y = Q[q + 1], z = Q[q + 2], w = Q[q + 3], h = dt * 0.5;
        Q[q] += h * (wx * w + wy * z - wz * y);
        Q[q + 1] += h * (wy * w + wz * x - wx * z);
        Q[q + 2] += h * (wz * w + wx * y - wy * x);
        Q[q + 3] += h * (-wx * x - wy * y - wz * z);
        const l = Math.hypot(Q[q], Q[q + 1], Q[q + 2], Q[q + 3]);
        Q[q] /= l; Q[q + 1] /= l; Q[q + 2] /= l; Q[q + 3] /= l;
        rotation(i);
        // A wall the scene knows in the way stops the move across the ground.
        if (clear && (Math.abs(P[b] - PREV[b]) > 1e-4 || Math.abs(P[b + 2] - PREV[b + 2]) > 1e-4)) {
          const feet = P[b + 1] - EXT[b + 1] + 0.3, height = Math.max(0.1, 2 * EXT[b + 1] - 0.3), radius = Math.min(0.6, Math.max(EXT[b], EXT[b + 2]));
          if (!clear(PREV[b], feet, PREV[b + 2], P[b], feet, P[b + 2], radius, height)) {
            P[b] = PREV[b]; P[b + 2] = PREV[b + 2]; V[b] *= -0.2; V[b + 2] *= -0.2;
          }
        }
        if (P[b + 1] < RP[b + 1] - LOST_DROP) { home(i); MOVED[i] = 1; continue; }
        DIRTY[i] = 1;
        // Rest: still long enough, it sleeps.
        if (!WET[i] && V[b] * V[b] + V[b + 1] * V[b + 1] + V[b + 2] * V[b + 2] < SLEEP_V * SLEEP_V && wx * wx + wy * wy + wz * wz < SLEEP_W * SLEEP_W) {
          SLEEP_T[i] += dt;
          if (SLEEP_T[i] > SLEEP_TIME) { ASLEEP[i] = 1; V[b] = V[b + 1] = V[b + 2] = W[b] = W[b + 1] = W[b + 2] = 0; }
        } else SLEEP_T[i] = 0;
      }
    };
    // How much of body i lies under the water (0 to 1), and the surface over it into `surface`.
    let surface = -Infinity;
    const submerged = (i) => {
      if (!water) return 0;
      const b = 3 * i;
      surface = water(P[b], P[b + 2]);
      if (surface === -Infinity) return 0;
      return Math.max(0, Math.min(1, (surface - (P[b + 1] - EXT[b + 1])) / (2 * EXT[b + 1])));
    };
    const substep = (dt) => {
      for (let i = 0; i < count; i++) {
        const b = 3 * i, wet = submerged(i);
        // A sleeping body the water reaches wakes to float.
        if (wet > 0 && ASLEEP[i]) wake(i);
        if (ASLEEP[i]) continue;
        V[b + 1] += GRAVITY * dt;
        if (wet > 0) {
          if (!WET[i] && V[b + 1] < -SPLASH_SPEED && onSplash) onSplash(P[b], surface, P[b + 2], -V[b + 1], i);
          V[b + 1] -= GRAVITY * BUOYANCY * wet * dt;
          const drag = Math.max(0, 1 - WATER_DRAG * wet * dt), spin = Math.max(0, 1 - WATER_SPIN * wet * dt);
          V[b] *= drag; V[b + 1] *= drag; V[b + 2] *= drag; W[b] *= spin; W[b + 1] *= spin; W[b + 2] *= spin;
          SLEEP_T[i] = 0;
        }
        WET[i] = wet > 0 ? 1 : 0;
        const ld = Math.max(0, 1 - LINEAR_DAMP * dt), ad = Math.max(0, 1 - ANGULAR_DAMP * dt);
        V[b] *= ld; V[b + 1] *= ld; V[b + 2] *= ld; W[b] *= ad; W[b + 1] *= ad; W[b + 2] *= ad;
        const s = Math.hypot(V[b], V[b + 1], V[b + 2]), w = Math.hypot(W[b], W[b + 1], W[b + 2]);
        if (s > MAX_SPEED) { const k = MAX_SPEED / s; V[b] *= k; V[b + 1] *= k; V[b + 2] *= k; }
        if (w > MAX_SPIN) { const k = MAX_SPIN / w; W[b] *= k; W[b + 1] *= k; W[b + 2] *= k; }
      }
      collide(dt);
      prepare(dt);
      solve();
      store();
      integrate(dt);
      stats.steps++;
    };
    const step = (dt) => {
      accumulator = Math.min(accumulator + dt, STEP * MAX_SUBSTEPS);
      let any = !!water;
      for (let i = 0; !any && i < count; i++) if (!ASLEEP[i]) any = true;
      if (!any && !actors) { accumulator = 0; return; }
      while (accumulator >= STEP) { substep(STEP); accumulator -= STEP; }
      sync();
    };
    // Each moved body's node to where the body is.
    const sync = () => {
      let awake = 0;
      for (let i = 0; i < count; i++) {
        if (!ASLEEP[i]) awake++;
        if (!DIRTY[i]) continue;
        DIRTY[i] = 0;
        const node = nodes[i], b = 3 * i, r = 9 * i, ox = OFF[b], oy = OFF[b + 1], oz = OFF[b + 2];
        node.position.x = P[b] + R[r] * ox + R[r + 3] * oy + R[r + 6] * oz;
        node.position.y = P[b + 1] + R[r + 1] * ox + R[r + 4] * oy + R[r + 7] * oz;
        node.position.z = P[b + 2] + R[r + 2] * ox + R[r + 5] * oy + R[r + 8] * oz;
        node.quaternion[0] = Q[4 * i]; node.quaternion[1] = Q[4 * i + 1]; node.quaternion[2] = Q[4 * i + 2]; node.quaternion[3] = Q[4 * i + 3];
      }
      stats.bodies = count; stats.awake = awake; stats.contacts = contacts; stats.dropped = dropped;
    };
    const dispose = () => {
      count = contacts = prevContacts = actors = 0;
      nodes.fill(null); tags.fill(null);
      for (let t = 0; t < touched; t++) { pairStart[pairTouched[t]] = -1; pairCount[pairTouched[t]] = 0; }
      touched = 0;
    };
    // Each displaced body nothing has hit (a blow, a round, a blast, a walker's push) for `after` seconds goes home;
    // `onHome(i)` hears it, where it lay.
    const settle = (dt, after, onHome = null) => {
      for (let i = 0; i < count; i++) {
        if (!MOVED[i] || (SINCE_HIT[i] += dt) < after) continue;
        if (onHome) onHome(i);
        home(i);
        sync();
      }
    };
    const position = (i, out) => { out.x = P[3 * i]; out.y = P[3 * i + 1]; out.z = P[3 * i + 2]; return out; };
    const asleep = (i) => !!ASLEEP[i];
    // ---- another page's simulation (prop-sync.js) ----
    // Body i's centre and turn into out[o..o+6], and where it rests into out[o..o+2].
    const read = (i, out, o = 0) => {
      out[o] = P[3 * i]; out[o + 1] = P[3 * i + 1]; out[o + 2] = P[3 * i + 2];
      out[o + 3] = Q[4 * i]; out[o + 4] = Q[4 * i + 1]; out[o + 5] = Q[4 * i + 2]; out[o + 6] = Q[4 * i + 3];
    };
    // Whether body i lies where it rests: one a neighbour nudged in passing is out of place without ever being hit.
    const atHome = (i) => {
      const b = 3 * i, q = 4 * i;
      return Math.abs(P[b] - RP[b]) < 1e-3 && Math.abs(P[b + 1] - RP[b + 1]) < 1e-3 && Math.abs(P[b + 2] - RP[b + 2]) < 1e-3
        && Math.abs(Q[q] * RQ[q] + Q[q + 1] * RQ[q + 1] + Q[q + 2] * RQ[q + 2] + Q[q + 3] * RQ[q + 3]) > 1 - 1e-6;
    };
    const restAt = (i, out, o = 0) => { out[o] = RP[3 * i]; out[o + 1] = RP[3 * i + 1]; out[o + 2] = RP[3 * i + 2]; };
    // Body i held where another page's simulation has it: asleep there and out of place, still met by rays and feet.
    const place = (i, x, y, z, qx, qy, qz, qw) => {
      const b = 3 * i, q = 4 * i;
      P[b] = PREV[b] = x; P[b + 1] = PREV[b + 1] = y; P[b + 2] = PREV[b + 2] = z;
      Q[q] = qx; Q[q + 1] = qy; Q[q + 2] = qz; Q[q + 3] = qw;
      V[b] = V[b + 1] = V[b + 2] = W[b] = W[b + 1] = W[b + 2] = 0;
      ASLEEP[i] = 1; SLEEP_T[i] = 0; MOVED[i] = 1; SINCE_HIT[i] = 0; WET[i] = 0; DIRTY[i] = 1;
      rotation(i);
    };
    // What two pages must agree on to speak of body i: how many bodies, and each one's shape, size and resting place.
    const signature = () => {
      let h = Math.imul(2166136261 ^ count, 16777619);
      for (let i = 0; i < count; i++) {
        h = Math.imul(h ^ SHAPE[i], 16777619);
        for (let k = 0; k < 3; k++) {
          h = Math.imul(h ^ Math.round(H[3 * i + k] * 50), 16777619);
          h = Math.imul(h ^ Math.round(RP[3 * i + k] * 10), 16777619);
        }
      }
      return h >>> 0;
    };
    return {
      read, restAt, atHome, place, signature, wake,
      add, addPiece, shot, blow, knock, reset, home, step, sync, settle, impulseAt, explode, shove, raycast, supportAt, clearActors, actor, dispose,
      position, asleep, displaced, tag: (i) => tags[i], node: (i) => nodes[i], radius: (i) => BR[i],
      get count() { return count; }, stats
    };
  };
  BL.physics = { create, MAX_BODIES, STEP };
})();
