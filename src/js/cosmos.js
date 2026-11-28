// The cosmos rig: ₿IFRÖST's night sky (`bifrostModels.sky` and `starship`) assembled and set moving as the ₿IFRÖST
// chamber hangs it over its open dome, for any scene with sky to show. One rig a visit: `create` builds it, the scene
// stands `root` in its graph, calls `update` once a frame and `dispose` in `leave`.
//
// `create({ sparse, scale, tilt, ship, rand })`:
// - `sparse` (false): the builder's lighter sky, as Canvas 2D takes: fewer stars, plain band clouds, still planets.
// - `scale` (1): the whole rig's scale. At 1 the stars stand 320 m from the root (`bifrostModels.SKY.r`), the planets
//   250 to 300 m, the ship's way 304 m; 0.5 brings it all in to half that.
// - `tilt` (0): radians the dome leans about x, its zenith toward +z for a positive tilt (+0.5 takes the sky's +y to
//   (0, 0.878, 0.479)). The sky pass's stars lean with it through `starMatrix`.
// - `ship` (true): the ₿ ship that cruises between its home port, the ringed giant, and the glinting stars round it.
// - `rand` (Math.random): every chance the rig takes (when a shooting star fires and which, the ship's rests, its
//   flame's flicker) comes from it, so a seeded one replays a sky.
// - `below` (false): the sky under the horizon too, for a room seen out of on every side: stars from the nadir up,
//   thinnest straight down, joining ₿IFRÖST's field over the horizon without a seam (its 0 to 6 degree band, empty in
//   ₿IFRÖST's sky, filled), twinkling in the upper sky's groups, and the galaxy's band going on round its great circle
//   through the horizon (see `LOW`). Laid once a page from a fixed seed, as ₿IFRÖST's builder lays its sky. Off, the
//   rig is exactly ₿IFRÖST's.
// The rig is `{ root, update(dt, elapsed, renderOpts), dispose, stats, liveGeometry, parts }`. `update` turns the
// heavens (SKY_TURN radians a second) and writes `renderOpts.starMatrix` in place when given one, twinkles a group of
// stars at a time with their halos, flares the glints, sails the ship, spins the turning planets and their rings,
// takes the moons round and now and then streaks a shooting star; `elapsed` is the scene's time, which the twinkle
// and the moons read. It allocates nothing. `stats()` counts nodes, faces drawn (per node) and distinct geometries;
// `liveGeometry(set)` adds every geometry under the root, the hidden ones too; `parts` holds the moving pieces, for
// debugging and checks. The root must not be turned: `tilt` is the rig's one turn, and `starMatrix` follows it alone.
//
// `place(rig, { giant, red, ice })` stands the planets where a scene composes them, any of the three: each a direction
// `[x, y, z]` in the root's frame (any length), or for the giant also `{ dir: [x, y, z], ring }`. The planet stands at
// its own distance (giant 250, red 280, ice 300, before `scale`); its moons' ways round, and the giant's lean, take the
// turn from ₿IFRÖST's spot for it to the new one, so it shows the root what it shows there: the red and ice worlds' moons still pass in front of them
// and behind, and the giant's rings show the same opening (32 degrees off edge-on), its moons in their plane. `ring`,
// radians, sets that opening as seen from the root instead (the same side of the rings kept toward it). Day and night
// shells keep facing the sun. A placed planet holds still while the stars turn behind it, as the hangar holds its
// planets, so a composition stays framed for a long visit; the ship still sails out of and home to the giant wherever
// it stands. `place` is for composing, once a visit or now and then, never a frame: it allocates, though a second call
// reuses the rig's own shell copies. On Canvas 2D's sparse sky the giant is one mesh with its light baked in, so
// turning it to keep the rings' opening turns its lit side too. A planet may stand at or under the horizon.
// `place` also takes `extra: { dir, kind, size }`, a fourth world: the red or ice world's own geometry (`kind` "red" or
// "ice") hung in the direction `dir` at that world's distance, `size` its radius in metres before `scale` (the
// world's own, 8 or 12, by default), turning on its pole with its own day and night shells, held still, with no moons
// and no port for the ship; placing it again moves the same node (and may change its kind and size), and
// `extra: null` takes it down. `parts.extra` holds it.
//
// The moon is the renderer's sky pass's, not the rig's: a scene lights its face through the render option `moonSun`
// (the way to the sun from the moon), which otherwise falls back to the key light's direction.
//
// Everything under the root pierces fog (`fogPierce` 1 on each geometry, shared with ₿IFRÖST, whose chamber has no
// fog, where the renderers' fog factor is 0 whatever the pierce), is emissive, casts no shadow, is hidden from the
// sight guides, and is no pick target: the rig registers no input.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  // As ₿IFRÖST's chamber: how fast the heavens turn (radians a second), how long a shooting star lasts and the wait
  // between them; how deep a twinkle dips and how far a glint stretches past its star's size.
  const SKY_TURN = 0.0015, METEOR_LIFE = 0.8, METEOR_GAP = [3, 9];
  const TWINKLE_DIP = 1.08, GLINT = 4;
  // The ₿ ship, as ₿IFRÖST's: length, speed (m/s), how far the middle of a trip bends from the root, rests, the share
  // of a trip it takes to flash out of or into a star, its exhaust (puffs, how often, how long, how big), and how far
  // round its home port (radians) the stars it calls at stand.
  const SHIP = { size: 11, speed: 24, bend: 90, rest: [4, 10], warp: 0.06, puffs: 16, every: 0.07, life: 1.1, puff: 1.6, reach: 0.85 };
  // The planets in `bifrostModels.sky`'s order, by the names `place` takes.
  const PLANETS = ["giant", "red", "ice"];
  const states = new WeakMap();
  // The sky under the horizon (`below`), as ₿IFRÖST's builder lays the sky over it, for rooms seen out of on every side.
  // Its stars, `stars` [full, sparse] of them, stand from the nadir up to `top` (sine of elevation): their share of
  // the sky by height rises from `floor` at the nadir to its whole at `rim` (just over ₿IFRÖST's lowest star, 5.7
  // degrees up), then falls away over `fade` as ₿IFRÖST's stars thicken upward, so the two fields join without a seam
  // and the band from 0 to 6 degrees, empty in ₿IFRÖST's sky, is filled. A few are big, round and haloed, and those
  // and one in four of the rest twinkle in the upper sky's groups. The galaxy's band goes on round its great circle
  // below where ₿IFRÖST's stops (`bandCut`, its cut), its clouds and its dust drawn as many times as ₿IFRÖST draws
  // them all round and kept where ₿IFRÖST's are not. Laid from a fixed seed, built once a page for each sky.
  const LOW = { stars: [640, 160], floor: 0.25, rim: 0.1, fade: 0.26, big: 0.06, band: [150, 40], dust: [320, 60], bandCut: 0.05, seed: 2150 };
  // ₿IFRÖST's star colours and their halos', and how its band's clouds are coloured and how much of the night shows
  // through them (bifrost-models.js `sky`).
  const STAR_TONES = ["#f4f6ff", "#bcd4ff", "#ffe6b0", "#ffb8a0"], STAR_HALOS = ["#9ab8ff", "#6f9cff", "#ffc35c", "#ff7a52"];
  const HAZES = ["#3a1f6e", "#5a2a86", "#20507a", "#2a6a8a", "#6a3a9a"], BAND_GLASS = [0.3, 0.16], HALO_GLASS = 0.35;
  const lowSkies = [null, null];

  const pierce = (geometry) => { geometry.fogPierce = 1; return geometry; };
  const piece = (geometry, options) => createNode({ geometry: pierce(geometry), sightHidden: true, ...options });

  // The lower sky's geometry for the full (0) or sparse (1) sky: `stars`, `band`, and `twinkle` and `halos` in the
  // upper sky's groups. Quads and round puffs facing the root, laid as bifrost-models' `facingIn` and `puffIn` lay them
  // (those are private to it; its exported `facing` and `blend` are shared).
  const lowSky = (sparse) => {
    if (lowSkies[sparse]) return lowSkies[sparse];
    const { geometry, noShadow } = BL.models, BM = BL.bifrostModels, TAU = Math.PI * 2, rand = BL.math.mulberry32(LOW.seed + sparse);
    const groups = BM.sky(sparse).twinkle.length, R = BM.SKY.r, E = BM.TWINKLE_EMISSIVE;
    const stars = geometry(), band = geometry(), twinkle = Array.from({ length: groups }, () => geometry()), halos = Array.from({ length: groups }, () => geometry());
    const plane = (d, spin) => {
      const [dx, dy, dz] = d, up = Math.abs(dy) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      let ax = up[1] * dz - up[2] * dy, ay = up[2] * dx - up[0] * dz, az = up[0] * dy - up[1] * dx;
      const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
      const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax, c = Math.cos(spin), s = Math.sin(spin);
      return [ax * c + bx * s, ay * c + by * s, az * c + bz * s, bx * c - ax * s, by * c - ay * s, bz * c - az * s];
    };
    const quad = (geo, d, r, w, h, spin, color, emissive) => {
      const [ax, ay, az, bx, by, bz] = plane(d, spin), ux = ax * w / 2, uy = ay * w / 2, uz = az * w / 2, vx = bx * h / 2, vy = by * h / 2, vz = bz * h / 2, cx = d[0] * r, cy = d[1] * r, cz = d[2] * r;
      BM.facing(geo, [[cx - ux - vx, cy - uy - vy, cz - uz - vz], [cx + ux - vx, cy + uy - vy, cz + uz - vz], [cx + ux + vx, cy + uy + vy, cz + uz + vz], [cx - ux + vx, cy - uy + vy, cz - uz + vz]], color, emissive, 0, 0, 0);
    };
    const PUFF = [[0, 0.45, 0], [0.45, 0.85, 0.5], [0.85, 1.3, 0.82]], DOT = [[0, 1, 0]];
    const puff = (geo, d, r, w, h, spin, color, emissive, steps = PUFF) => {
      const [ax, ay, az, bx, by, bz] = plane(d, spin), n = 10, cx = d[0] * r, cy = d[1] * r, cz = d[2] * r;
      const at = (k, s) => { const t = k / n * TAU, u = Math.cos(t) * s * w / 2, v = Math.sin(t) * s * h / 2; return [cx + ax * u + bx * v, cy + ay * u + by * v, cz + az * u + bz * v]; };
      BM.facing(geo, Array.from({ length: n }, (_, k) => at(k, steps[0][1])), color, emissive, 0, 0, 0);
      for (let j = 1; j < steps.length; j++) {
        const [s0, s1, dark] = steps[j], col = BM.blend(color, "#000000", dark);
        for (let k = 0; k < n; k++) BM.facing(geo, [at(k, s0), at(k + 1, s0), at(k + 1, s1), at(k, s1)], col, emissive, 0, 0, 0);
      }
    };
    // The stars' share of the sky at height y (sine of elevation), 0 to 1, drawn by rejection.
    const top = LOW.rim + LOW.fade, share = (y) => y <= LOW.rim ? LOW.floor + (1 - LOW.floor) * (y + 1) / (LOW.rim + 1) : 1 - (y - LOW.rim) / LOW.fade;
    // The big stars, and the small ones that twinkle, are each dealt round the groups in turn, so no group is empty.
    for (let i = 0, bigs = 0, smalls = 0, n = LOW.stars[sparse]; i < n;) {
      const y = -1 + rand() * (top + 1);
      if (rand() > share(y)) continue;
      const a = rand() * TAU, s = Math.sqrt(1 - y * y), big = rand() < LOW.big, size = big ? 1.4 + rand() * 1.2 : 0.45 + rand() * 0.6;
      const tone = rand(), hue = tone < 0.6 ? 0 : tone < 0.8 ? 1 : tone < 0.93 ? 2 : 3, d = [Math.cos(a) * s, y, Math.sin(a) * s], spin = rand() * TAU;
      if (big) {
        const g = bigs++ % groups;
        puff(twinkle[g], d, R, size, size, spin, STAR_TONES[hue], E, DOT);
        puff(halos[g], d, R * 1.004, size * 3.6, size * 3.6, spin, STAR_HALOS[hue], E);
      } else if (i % 4 === 0) quad(twinkle[smalls++ % groups], d, R, size, size, spin, STAR_TONES[hue], E);
      else quad(stars, d, R, size, size, spin, STAR_TONES[hue], 1);
      i++;
    }
    // The band's great circle, as ₿IFRÖST's: its clouds and dust where ₿IFRÖST's are cut, so the band runs on through
    // the horizon on both sides and round under the room.
    const nb = BM.SKY.band, nl = Math.hypot(nb[0], nb[1], nb[2]), nx = nb[0] / nl, ny = nb[1] / nl, nz = nb[2] / nl, el = Math.hypot(ny, nx), ex = [ny / el, -nx / el, 0];
    const fx = [ny * ex[2] - nz * ex[1], nz * ex[0] - nx * ex[2], nx * ex[1] - ny * ex[0]];
    const along = (a, off) => { const x = ex[0] * Math.cos(a) + fx[0] * Math.sin(a) + nx * off, y = ex[1] * Math.cos(a) + fx[1] * Math.sin(a) + ny * off, z = ex[2] * Math.cos(a) + fx[2] * Math.sin(a) + nz * off, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    for (let i = 0; i < LOW.band[sparse]; i++) {
      const d = along(rand() * TAU, (rand() - 0.5) * 0.42 * (0.5 + rand())), w = 30 + rand() * 50, h = w * (0.5 + rand() * 0.5), spin = rand() * TAU, color = HAZES[Math.floor(rand() * HAZES.length)];
      if (d[1] >= LOW.bandCut) continue;
      (sparse ? quad : puff)(band, d, R * 1.02, w, h, spin, color, 0.7);
    }
    band.glass = BAND_GLASS[sparse];
    for (let i = 0; i < LOW.dust[sparse]; i++) {
      const d = along(rand() * TAU, (rand() - 0.5) * 0.18), size = 0.35 + rand() * 0.7, spin = rand() * TAU, color = rand() < 0.5 ? "#e8ddff" : "#c8f0ff";
      if (d[1] >= LOW.bandCut) continue;
      quad(stars, d, R * 0.99, size, size, spin, color, 1);
    }
    for (const halo of halos) halo.glass = HALO_GLASS;
    return (lowSkies[sparse] = { stars: noShadow(stars), band: noShadow(band), twinkle: twinkle.map(noShadow), halos: halos.map(noShadow) });
  };

  // A placed planet's port, from the root's frame into the turning sky's, where the ship flies: undo the tilt about x,
  // then the turn about y.
  const toSky = (s, port) => {
    const p = port.planet.position, ct = s.ct, st = s.st, a = s.sky.rotation.y, c = Math.cos(a), sn = Math.sin(a);
    const qx = p.x, qy = ct * p.y + st * p.z, qz = ct * p.z - st * p.y;
    port.x = c * qx - sn * qz; port.y = qy; port.z = sn * qx + c * qz;
  };
  // The next glinting star round the home port, after the last one called at (`voyage.star`), or null when none is
  // near: the same stars in the same order as ₿IFRÖST's list filtered once, read as the home port stands now.
  const nextStar = (s) => {
    const home = s.ports[0], homeAt = Math.sqrt(home.x * home.x + home.y * home.y + home.z * home.z), near = Math.cos(SHIP.reach), n = s.stars.length, v = s.voyage;
    for (let k = 0; k < n; k++) {
      const j = (v.star + k) % n, p = s.stars[j];
      if ((p.x * home.x + p.y * home.y + p.z * home.z) / (s.R * homeAt) > near) { v.star = j + 1; return p; }
    }
    return null;
  };

  // The ₿ ship's trip, lifted from ₿IFRÖST's `sail` (its lengths through Math.sqrt where ₿IFRÖST's take Math.hypot,
  // which the optimizer does not inline, so its arguments are boxed on every call): a quadratic from where it sets off, bent toward the root through
  // `bend`, to where it is going, eased in and out, nose along its way, rocking a little, flame flickering; it flashes
  // out of a star and into one, the star flaring each time. Its exhaust puffs shrink away where they were left.
  const sail = (s, dt, elapsed) => {
    for (let i = 0; i < s.puffs.length; i++) {
      const p = s.puffs[i];
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / SHIP.life);
      p.node.scale.x = p.node.scale.y = p.node.scale.z = SHIP.puff * (1 - p.t);
      p.node.glow = 1 - 0.6 * p.t;
      p.node.visible = p.t < 1;
    }
    const v = s.voyage, ship = s.ship;
    if (v.t >= 1) {
      v.rest -= dt;
      if (v.rest > 0) return;
      for (let i = 0; i < s.ports.length; i++) if (s.ports[i].still) toSky(s, s.ports[i]);
      v.from = v.to;
      v.to = v.from.glint ? s.ports[0] : nextStar(s) || s.ports[v.port++ % s.ports.length];
      const mx = v.from.x + v.to.x, my = v.from.y + v.to.y, mz = v.from.z + v.to.z, ml = SHIP.bend / Math.sqrt(mx * mx + my * my + mz * mz);
      v.bend.x = mx * ml; v.bend.y = my * ml; v.bend.z = mz * ml;
      const ax = v.bend.x - v.from.x, ay = v.bend.y - v.from.y, az = v.bend.z - v.from.z, bx = v.to.x - v.bend.x, by = v.to.y - v.bend.y, bz = v.to.z - v.bend.z;
      v.time = (Math.sqrt(ax * ax + ay * ay + az * az) + Math.sqrt(bx * bx + by * by + bz * bz)) / SHIP.speed;
      v.t = 0;
      if (v.from.glint) v.from.glint.flare = 1;
      ship.visible = true;
    }
    v.t = Math.min(1, v.t + dt / v.time);
    const t = v.t, u = t * t * (3 - 2 * t), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u, f = v.from, e = v.to, m = v.bend, p = ship.position;
    p.x = a * f.x + b * m.x + c * e.x; p.y = a * f.y + b * m.y + c * e.y; p.z = a * f.z + b * m.z + c * e.z;
    const dx = (1 - u) * (m.x - f.x) + u * (e.x - m.x), dy = (1 - u) * (m.y - f.y) + u * (e.y - m.y), dz = (1 - u) * (m.z - f.z) + u * (e.z - m.z), dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    ship.rotation.y = Math.atan2(dx, dz);
    ship.rotation.x = -Math.asin(dy / dl);
    ship.rotation.z = 0.3 * Math.sin(elapsed * 1.3);
    const k = Math.min(1, f.glint ? t / SHIP.warp : 1, e.glint ? (1 - t) / SHIP.warp : 1);
    ship.scale.x = ship.scale.y = ship.scale.z = SHIP.size * k;
    s.flame.scale.x = s.flame.scale.y = 0.85 + 0.3 * s.rand();
    s.flame.scale.z = 0.7 + 0.6 * s.rand();
    v.puff -= dt;
    if (v.puff <= 0 && k > 0.5) {
      v.puff = SHIP.every;
      for (let i = 0; i < s.puffs.length; i++) {
        const q = s.puffs[i];
        if (q.t < 1) continue;
        const back = 0.6 * SHIP.size / dl;
        q.node.position.x = p.x - dx * back; q.node.position.y = p.y - dy * back; q.node.position.z = p.z - dz * back;
        q.t = 0; q.node.visible = true;
        break;
      }
    }
    if (t >= 1) {
      ship.visible = false;
      if (e.glint) e.glint.flare = 1;
      v.rest = SHIP.rest[0] + s.rand() * (SHIP.rest[1] - SHIP.rest[0]);
    }
  };

  // The heavens' frame, lifted from ₿IFRÖST's `heavens`.
  const step = (s, dt, elapsed, renderOpts) => {
    const a = (s.sky.rotation.y += dt * SKY_TURN), M = renderOpts && renderOpts.starMatrix;
    if (M) {
      // The sky pass looks its stars up through the inverse of the sky's turn: the turn about y under the tilt about
      // x, laid out row by row (a column-major mat3 of the transpose). With no tilt this is ₿IFRÖST's matrix.
      const c = Math.cos(a), sn = Math.sin(a), ct = s.ct, st = s.st;
      M[0] = c; M[1] = 0; M[2] = sn;
      M[3] = st * sn; M[4] = ct; M[5] = -st * c;
      M[6] = -ct * sn; M[7] = st; M[8] = ct * c;
    }
    for (let i = 0; i < s.twinkle.length; i++) {
      const u = Math.sin(elapsed * (1.1 + 0.29 * i) + i * 2.1) * Math.sin(elapsed * (0.37 + 0.07 * i) + i), d = u * u;
      s.twinkle[i].glow = s.halos[i].glow = s.twinkleFull - TWINKLE_DIP * d * d;
      if (s.low) s.low.twinkle[i].glow = s.low.halos[i].glow = s.twinkle[i].glow;
    }
    for (let i = 0; i < s.glints.length; i++) {
      const g = s.glints[i], u = 0.5 + 0.5 * Math.sin(elapsed * g.rate + g.phase), k = u * u * u * u, f = g.flare = Math.max(0, g.flare - dt * 1.2);
      g.node.scale.x = g.node.scale.y = g.size * (0.3 + 0.9 * k + 2.2 * f);
      g.node.rotation.z = 0.25 * Math.sin(elapsed * 0.1 + g.phase);
      g.node.glow = 1 + (s.twinkleFull - 1) * Math.max(k, f);
    }
    if (s.ship) sail(s, dt, elapsed);
    for (let i = 0; i < s.spins.length; i++) s.spins[i].node.rotation.y += dt * s.spins[i].rate;
    for (let i = 0; i < s.moons.length; i++) {
      const m = s.moons[i], t = elapsed * m.rate + m.phase, x = Math.cos(t) * m.a, y = Math.sin(t) * m.a, p = m.node.position;
      p.x = m.u[0] * x + m.v[0] * y; p.y = m.u[1] * x + m.v[1] * y; p.z = m.u[2] * x + m.v[2] * y;
    }
    s.meteorWait -= dt;
    if (s.meteorWait <= 0) {
      s.meteorWait = METEOR_GAP[0] + s.rand() * (METEOR_GAP[1] - METEOR_GAP[0]);
      const m = s.meteors[Math.floor(s.rand() * s.meteors.length)];
      if (m.t >= 1) { m.t = 0; m.node.visible = true; }
    }
    for (let i = 0; i < s.meteors.length; i++) {
      const m = s.meteors[i];
      if (m.t >= 1) continue;
      m.t = Math.min(1, m.t + dt / METEOR_LIFE);
      const k = m.t * m.len;
      m.node.position.x = m.dir[0] * k; m.node.position.y = m.dir[1] * k; m.node.position.z = m.dir[2] * k;
      m.node.glow = 1.4 * (1 - m.t);
      m.node.smokeOpacity = Math.min(1, 3 * (1 - m.t));
      m.node.visible = m.t < 1;
    }
  };

  const create = ({ sparse = false, scale = 1, tilt = 0, ship = true, rand = Math.random, below = false } = {}) => {
    const BM = BL.bifrostModels, night = BM.sky(sparse ? 1 : 0);
    // The root scales the rig; under it the dome leans by `tilt` and the sky turns in it; placed planets stand in
    // `still`, under the root alone.
    const root = createNode({ scale: { x: scale, y: scale, z: scale } }), dome = createNode({ rotation: { x: tilt, y: 0, z: 0 } });
    const sky = createNode(), still = createNode();
    const s = {
      root, sky, still, rand, ct: Math.cos(tilt), st: Math.sin(tilt), R: BM.SKY.r * 0.95, twinkleFull: 1 / BM.TWINKLE_EMISSIVE,
      twinkle: night.twinkle.map((geometry) => piece(geometry)), halos: night.halos.map((geometry) => piece(geometry)),
      spins: [], moons: [], planets: [], glints: [], meteors: [], meteorWait: METEOR_GAP[0],
      ship: null, flame: null, puffs: [], ports: [], stars: [], voyage: null, disposed: false, night, sparse, low: null, extra: null
    };
    const starNode = piece(night.stars), bandNode = piece(night.band);
    addChild(sky, starNode, ...s.twinkle, ...s.halos, bandNode);
    // The sky under the horizon, turning with the rest, its twinkling stars in the upper sky's groups.
    if (below) {
      const low = lowSky(sparse ? 1 : 0);
      s.low = { stars: piece(low.stars), band: piece(low.band), twinkle: low.twinkle.map((geometry) => piece(geometry)), halos: low.halos.map((geometry) => piece(geometry)) };
      addChild(sky, s.low.stars, ...s.low.twinkle, ...s.low.halos, s.low.band);
    }
    // The planets, as ₿IFRÖST hangs them: a turning one leans on a node of its own, its body and each band of its
    // rings spinning at their own pace, its day and night over it toward the sun; a still one is one shaded mesh. The
    // moons go round it; each keeps its own copy of its ways round, which `place` turns.
    night.planets.forEach((p, i) => {
      const node = createNode({ position: { x: p.at.x, y: p.at.y, z: p.at.z } }), shades = [];
      let ringNode;
      if (p.body) {
        const lean = ringNode = createNode({ rotation: { x: 0, y: 0, z: p.tilt } });
        for (const [geometry, rate] of [[p.body, p.turn], ...p.rings.map((ring) => [ring.geometry, ring.rate])]) {
          const spin = piece(geometry);
          addChild(lean, spin);
          s.spins.push({ node: spin, rate });
        }
        addChild(node, lean);
        for (const geometry of p.shade) {
          const shade = piece(geometry, { scale: { x: p.r, y: p.r, z: p.r } });
          addChild(node, shade);
          shades.push(shade);
        }
      } else addChild(node, ringNode = piece(p.geometry));
      const moons = p.moons.map((m) => {
        const moon = { node: piece(m.geometry), a: m.a, rate: m.rate, phase: m.phase, u: m.u.slice(), v: m.v.slice(), u0: m.u, v0: m.v };
        addChild(node, moon.node);
        s.moons.push(moon);
        return moon;
      });
      const at = Math.hypot(p.at.x, p.at.y, p.at.z);
      // `ringNode` is what leans the planet (a turning one's lean node, a still one's mesh, built leaning), and
      // `ringNormal` its rings' axis in that node's frame; `dir0` where ₿IFRÖST hangs it, in the sky's frame; `lean0`
      // its lean about z, and `leanBase` the part of it that `ringNode` itself carries (all of it on a lean node).
      const dir0 = [p.at.x / at, p.at.y / at, p.at.z / at];
      s.planets.push({ key: PLANETS[i], node, shades, moons, distance: at, dir: dir0, dir0, placed: false, ringNode, ringNormal: p.body ? [0, 1, 0] : [-Math.sin(p.tilt), Math.cos(p.tilt), 0], lean0: [0, 0, Math.sin(p.tilt / 2), Math.cos(p.tilt / 2)], leanBase: p.body ? [0, 0, Math.sin(p.tilt / 2), Math.cos(p.tilt / 2)] : [0, 0, 0, 1] });
      addChild(sky, node);
    });
    s.glints = night.glints.map((g, i) => {
      const node = piece(night.glint, { rotation: { x: -g.elevation, y: g.bearing, z: 0 } });
      addChild(sky, node);
      return { node, size: g.size * GLINT, rate: 0.3 + 0.07 * (i % 5), phase: i * 2.4, flare: 0 };
    });
    // The ₿ ship, out from its home port, the ringed giant, to the glinting stars round it and back; with no star near,
    // round the planets. Ports and stars stand in the turning sky's frame.
    if (ship) {
      const craft = BM.starship();
      s.ship = piece(craft.body, { visible: false });
      s.flame = piece(craft.flame, { position: { x: 0, y: 0, z: -0.53 } });
      addChild(s.ship, s.flame);
      s.puffs = Array.from({ length: SHIP.puffs }, () => {
        const node = piece(craft.puff, { visible: false });
        addChild(sky, node);
        return { node, t: 1 };
      });
      addChild(sky, s.ship);
      s.ports = s.planets.map((p) => ({ x: p.node.position.x, y: p.node.position.y, z: p.node.position.z, glint: null, planet: p.node, still: false }));
      s.stars = night.glints.map((g, i) => ({ x: Math.sin(g.bearing) * Math.cos(g.elevation) * s.R, y: Math.sin(g.elevation) * s.R, z: Math.cos(g.bearing) * Math.cos(g.elevation) * s.R, glint: s.glints[i] }));
      s.voyage = { from: null, to: s.ports[0], bend: { x: 0, y: 0, z: 0 }, t: 1, time: 1, rest: SHIP.rest[0], puff: 0, port: 1, star: 0 };
    }
    s.meteors = night.meteors.map((m) => {
      const node = piece(m.geometry, { visible: false });
      addChild(sky, node);
      return { node, dir: m.dir, len: m.len, t: 1 };
    });
    addChild(dome, sky);
    addChild(root, dome, still);

    const walk = (node, visit) => { visit(node); for (let i = 0; i < node.children.length; i++) walk(node.children[i], visit); };
    const rig = {
      root,
      update: (dt, elapsed, renderOpts) => {
        if (s.disposed) throw new Error("cosmos: update after dispose");
        step(s, dt, elapsed, renderOpts);
      },
      stats: () => {
        let nodes = 0, faces = 0;
        const geometries = new Set();
        walk(root, (node) => { nodes++; if (node.geometry) { faces += node.geometry.faces.length; geometries.add(node.geometry); } });
        return { nodes, faces, geometries: geometries.size };
      },
      liveGeometry: (set) => walk(root, (node) => { if (node.geometry) set.add(node.geometry); }),
      dispose: () => {
        while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
        s.disposed = true;
      },
      parts: { sky, still, stars: starNode, band: bandNode, low: s.low, extra: null, twinkle: s.twinkle, halos: s.halos, planets: s.planets, spins: s.spins, moons: s.moons, glints: s.glints, meteors: s.meteors, ship: s.ship, puffs: s.puffs, ports: s.ports, voyage: s.voyage }
    };
    s.parts = rig.parts;
    states.set(rig, s);
    return rig;
  };

  // Unit quaternions as [x, y, z, w]: the turn that takes the unit `a` to the unit `b` (the shortest; when they are
  // opposite, half a turn about an axis square to `a`: a x up, or a x (1, 0, 0) for `a` near the vertical), the
  // product `q` then `r` (r applied first), and `v` turned by `q`.
  const between = (a, b) => {
    const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (c < -1 + 1e-9) {
      let kx, ky, kz;
      if (Math.abs(a[1]) < 0.9) { kx = -a[2]; ky = 0; kz = a[0]; } else { kx = 0; ky = a[2]; kz = -a[1]; }
      const l = Math.hypot(kx, ky, kz);
      return [kx / l, ky / l, kz / l, 0];
    }
    const q = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + c], l = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };
  const product = (q, r) => [
    q[3] * r[0] + q[0] * r[3] + q[1] * r[2] - q[2] * r[1],
    q[3] * r[1] - q[0] * r[2] + q[1] * r[3] + q[2] * r[0],
    q[3] * r[2] + q[0] * r[1] - q[1] * r[0] + q[2] * r[3],
    q[3] * r[3] - q[0] * r[0] - q[1] * r[1] - q[2] * r[2]
  ];
  const turned = (q, v) => {
    const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
  };

  // A day and night shell's rig-owned copy, its normals toward the root from the unit direction `to` (see
  // bifrostModels' `shade`): made from `source` once, re-aimed in place after, and made again when the source changes
  // (an `extra` world placed again as the other kind).
  const aim = (shade, source, to) => {
    if (shade.source !== source) {
      shade.source = source;
      shade.geometry = pierce({ ...source, normals: new Array(source.verts.length) });
    }
    const normals = shade.geometry.normals;
    for (let k = 0; k < normals.length; k++) normals[k] = -to[k % 3];
  };

  // The fourth world (`extra`): the red or ice world's own geometry hung where asked, at its distance, `size` its
  // radius (both before `scale`); on the full sky it turns on its pole as that world does and wears its own day and
  // night shells, on the sparse sky it is that world's still mesh, its light baked toward the sun. No moons, no port.
  const EXTRA_KINDS = ["red", "ice"];
  const placeExtra = (s, given) => {
    if (given === null) {
      if (s.extra) {
        removeChild(s.still, s.extra.node);
        if (s.extra.spin) s.spins.splice(s.spins.indexOf(s.extra.spin), 1);
      }
      s.extra = s.parts.extra = null;
      return;
    }
    const { dir, kind, ring } = given, i = PLANETS.indexOf(kind);
    if (!EXTRA_KINDS.includes(kind)) throw new Error(`cosmos.place: an extra world is "red" or "ice", not "${kind}"`);
    if (ring !== undefined) throw new Error("cosmos.place: only the giant has rings to open");
    const src = s.night.planets[i], size = given.size ?? src.r, l = Math.hypot(dir[0], dir[1], dir[2]);
    if (!(size > 0)) throw new Error("cosmos.place: an extra world needs a size over 0");
    if (!(l > 0)) throw new Error(`cosmos.place: "extra" needs a direction`);
    const to = [dir[0] / l, dir[1] / l, dir[2] / l], k = size / src.r;
    let e = s.extra;
    if (!e) {
      e = { node: createNode(), lean: null, spin: null, body: null, shades: [], kind: null };
      if (src.body) {
        e.lean = createNode();
        e.spin = { node: piece(src.body), rate: src.turn };
        addChild(e.lean, e.spin.node);
        addChild(e.node, e.lean);
        for (const shade of src.shade) { const node = piece(shade); e.shades.push(node); addChild(e.node, node); }
        s.spins.push(e.spin);
      } else addChild(e.node, e.body = piece(src.geometry));
      addChild(s.still, e.node);
      s.extra = s.parts.extra = e;
    }
    if (e.spin) {
      e.spin.node.geometry = pierce(src.body); e.spin.rate = src.turn;
      e.lean.rotation.z = src.tilt;
      e.lean.scale.x = e.lean.scale.y = e.lean.scale.z = k;
      e.shades.forEach((node, j) => { aim(node, src.shade[j], to); node.scale.x = node.scale.y = node.scale.z = size; });
    } else {
      e.body.geometry = pierce(src.geometry);
      e.body.scale.x = e.body.scale.y = e.body.scale.z = k;
    }
    e.kind = kind;
    const at = s.planets[i].distance;
    e.node.position.x = to[0] * at; e.node.position.y = to[1] * at; e.node.position.z = to[2] * at;
  };

  const place = (rig, placements) => {
    const s = states.get(rig);
    if (!s) throw new Error("cosmos.place: not a cosmos rig");
    if (s.disposed) throw new Error("cosmos.place: the rig is disposed");
    for (const key of Object.keys(placements)) {
      if (key === "extra") { placeExtra(s, placements.extra); continue; }
      const i = PLANETS.indexOf(key), given = placements[key], d = Array.isArray(given) ? given : given.dir, ring = Array.isArray(given) ? null : given.ring ?? null;
      if (i < 0) throw new Error(`cosmos.place: no planet "${key}"`);
      if (ring !== null && key !== "giant") throw new Error(`cosmos.place: only the giant has rings to open`);
      const l = Math.hypot(d[0], d[1], d[2]);
      if (!(l > 0)) throw new Error(`cosmos.place: "${key}" needs a direction`);
      const p = s.planets[i], to = [d[0] / l, d[1] / l, d[2] / l];
      // The turn from where ₿IFRÖST hangs the planet to here: the moons' ways round turn with it, so the red and ice
      // worlds' still pass in front of their planet and behind as seen from the root, and so does the giant's lean,
      // so its rings show the root the opening they show at ₿IFRÖST's spot (or, given `ring`, that opening), its
      // moons in their plane. Always from the planet as built, so placing again does not add up.
      let q = between(p.dir0, to);
      if (key === "giant") {
        const n = turned(q, turned(p.lean0, [0, 1, 0])), dn = n[0] * to[0] + n[1] * to[1] + n[2] * to[2];
        if (ring !== null) {
          // The ring axis tipped, in the plane of the line of sight and itself, to stand `ring` off the rings' plane.
          let tx = n[0] - dn * to[0], ty = n[1] - dn * to[1], tz = n[2] - dn * to[2], tl = Math.hypot(tx, ty, tz);
          if (tl < 1e-9) { const k = between(to, [-to[0], -to[1], -to[2]]); tx = k[0]; ty = k[1]; tz = k[2]; tl = 1; }
          const side = dn < 0 ? -1 : 1, sr = Math.sin(ring) * side, cr = Math.cos(ring);
          q = product(between(n, [sr * to[0] + cr * tx / tl, sr * to[1] + cr * ty / tl, sr * to[2] + cr * tz / tl]), q);
        }
        // A turning giant's lean node, or a still giant's mesh (its rings built leaning), takes the turn.
        p.ringNode.quaternion = product(q, p.leanBase);
      }
      for (const m of p.moons) {
        const u = turned(q, m.u0), v = turned(q, m.v0);
        m.u[0] = u[0]; m.u[1] = u[1]; m.u[2] = u[2]; m.v[0] = v[0]; m.v[1] = v[1]; m.v[2] = v[2];
      }
      // Day and night shells stay facing the sun, and take their normals toward the root from where the planet now
      // stands (see bifrostModels' `shade`): copies the rig makes once and re-aims after, so ₿IFRÖST's stay as built.
      for (const shade of p.shades) aim(shade, shade.source || shade.geometry, to);
      p.dir = to;
      p.node.position.x = to[0] * p.distance; p.node.position.y = to[1] * p.distance; p.node.position.z = to[2] * p.distance;
      if (!p.placed) {
        removeChild(s.sky, p.node);
        addChild(s.still, p.node);
        p.placed = true;
        if (s.ports.length) s.ports[i].still = true;
      }
    }
  };

  // `soften(rig)`: the full sky's soft round puffs, the galaxy band's clouds and the big stars' halos, upper sky and
  // lower, drawn again rounder and fading more gently: SOFT_SIDES sides where ₿IFRÖST's have 10, and SOFT_BAND and
  // SOFT_HALO steps [from, to, darkness] in the puff's own half-widths where ₿IFRÖST's three end in a hard rim (each
  // over the night on glass, so darkness fades it out); the halos also drawn smaller, closer about their stars. Each
  // puff is read back from its geometry (a heart face of 10 points, then two rings of 10 quads) and laid again where
  // it was, as the same colour, glass and pierce, into a copy the rig's node takes (one per source geometry a page, so
  // a second rig shares it). ₿IFRÖST's geometry and every rig that is not softened stay as built. The sparse sky's
  // band is plain quads and its halos too few to matter: it is left alone. Allocates; once a visit.
  const SOFT_SIDES = 16, SOFT_BAND = [[0, 0.32, 0], [0.32, 0.6, 0.28], [0.6, 0.85, 0.52], [0.85, 1.1, 0.72], [1.1, 1.4, 0.88]];
  const SOFT_HALO = [[0, 0.2, 0.1], [0.2, 0.42, 0.4], [0.42, 0.66, 0.68], [0.66, 0.92, 0.88]];
  const softened = new WeakMap();
  const softCopy = (geo, steps) => {
    if (softened.has(geo)) return softened.get(geo);
    const { geometry, noShadow } = BL.models, BM = BL.bifrostModels, v = geo.verts, out = geometry(), TAU = Math.PI * 2;
    const hex = (c) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
    for (let f = 0; f < geo.faces.length; f++) {
      const heart = geo.faces[f], ids = heart.i;
      if (ids.length !== 10) continue;
      // The heart's points lie at angles k/10 of a turn round the middle, 0.45 of the way out to the puff's edge.
      let cx = 0, cy = 0, cz = 0;
      for (const i of ids) { cx += v[i * 3] / 10; cy += v[i * 3 + 1] / 10; cz += v[i * 3 + 2] / 10; }
      const u = [0, 0, 0], w = [0, 0, 0];
      for (let k = 0; k < 10; k++) {
        const i = ids[k] * 3, t = k / 10 * TAU, d = [v[i] - cx, v[i + 1] - cy, v[i + 2] - cz];
        for (let j = 0; j < 3; j++) { u[j] += d[j] * Math.cos(t) / (5 * 0.45); w[j] += d[j] * Math.sin(t) / (5 * 0.45); }
      }
      const at = (k, r) => { const t = k / SOFT_SIDES * TAU, c = Math.cos(t) * r, sn = Math.sin(t) * r; return [cx + u[0] * c + w[0] * sn, cy + u[1] * c + w[1] * sn, cz + u[2] * c + w[2] * sn]; };
      const color = hex(heart.color);
      BM.facing(out, Array.from({ length: SOFT_SIDES }, (_, k) => at(k, steps[0][1])), BM.blend(color, "#000000", steps[0][2]), heart.emissive, 0, 0, 0);
      // Every strip shares its inner and outer rings. Keep the 2π seam vertex as built,
      // including its rounding, so both renderers see the same face corners.
      const heartIds = out.faces[out.faces.length - 1].i, first = out.verts.length / 3 - SOFT_SIDES;
      const reverseStrip = heartIds[0] === first;
      BL.models.pushVert(out, ...at(SOFT_SIDES, steps[0][1]));
      let inner = first;
      for (let j = 1; j < steps.length; j++) {
        const [, r, dark] = steps[j], col = BL.math.hexToRgb(BM.blend(color, "#000000", dark));
        const outer = out.verts.length / 3;
        for (let k = 0; k <= SOFT_SIDES; k++) BL.models.pushVert(out, ...at(k, r));
        for (let k = 0; k < SOFT_SIDES; k++) {
          const ids = [inner + k, inner + k + 1, outer + k + 1, outer + k];
          BL.models.face(out, reverseStrip ? ids.reverse() : ids, col, { emissive: heart.emissive });
        }
        inner = outer;
      }
    }
    out.glass = geo.glass; out.fogPierce = geo.fogPierce;
    noShadow(out);
    if (BL.compactGeometry?.enabled) BL.compactGeometry.pack(out, { immutable: true, renderOnly: true, precision: 64 });
    softened.set(geo, out);
    return out;
  };
  const soften = (rig) => {
    const s = states.get(rig);
    if (!s) throw new Error("cosmos.soften: not a cosmos rig");
    if (s.sparse) return;
    const parts = rig.parts, nodes = [[parts.band, SOFT_BAND], ...parts.halos.map((n) => [n, SOFT_HALO])];
    if (parts.low) nodes.push([parts.low.band, SOFT_BAND], ...parts.low.halos.map((n) => [n, SOFT_HALO]));
    for (const [node, steps] of nodes) if (node.visible) node.geometry = softCopy(node.geometry, steps);
  };

  BL.cosmos = { create, place, soften, SKY_TURN, SHIP, PLANETS };
})();
