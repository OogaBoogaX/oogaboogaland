// Cloud Hopper's wind gusts, on Aurora Heights (its layout's `gusts`). A run's gusts come at seeded shares of the way
// down, one in each of as many even stretches, each from a seeded side across the course. As the rider reaches one it
// warns (`WARN` seconds: a few faint streaks drifting across from the side it comes from, which the HUD's cue and a
// rising whoosh share, the wind already rising to `LEAD` of its push), then blows (`BLOW` seconds, easing up to the
// whole of it over `IN` and out over `OUT`) straight across the course, its streaks racing past the eye; the controller
// pushes the rider along `push` by `strength`. Nothing allocates a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const M = BL.models, { mulberry32 } = BL.math;
  // The warning and the blow (s): the wind rises to LEAD of its push through the warning, then the blow eases up to the
  // whole of it over IN and out over OUT.
  const WARN = 2.5, BLOW = 3, IN = 0.5, OUT = 0.8, LEAD = 0.3;
  // The streaks: how many at the top tier, in a box of these half-sizes [along, up, across] (m) centred AHEAD metres in
  // front of the eye, racing along the wind at SPEED while it blows (m/s) and drifting at a fraction of it as it warns,
  // none within NEAR (m) of the eye, where it would cross the view as a bar.
  const STREAKS = 90, BOX = [13, 5, 9], AHEAD = 12, SPEED = 32, NEAR = 2.2;
  const CALM = 0, WARNING = 1, BLOWING = 2, NAMES = ["calm", "warning", "blowing"];
  const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  // A streak of wind, one unit long along x, pale and glowing a little so it reads under the aurora.
  const streak = M.cached(() => M.noShadow(M.box({ w: 1, h: 0.045, d: 0.045, color: "#dff4ff", emissive: 0.75 })));

  // `root` is the run's own node.
  const create = ({ root, renderer }) => {
    const lite = renderer?.kind === "canvas2d", tier = lite ? 0.3 : renderer?.quality === "low" ? 0.5 : renderer?.quality === "medium" ? 0.75 : 1;
    const count = Math.round(STREAKS * tier), data = new Float32Array(count * 20), seeds = new Float32Array(count * 4);
    for (let o = 16; o < data.length; o += 20) data[o] = 1;
    const batch = createNode({ geometry: streak(), instanceData: data, instanceCount: count, instanceVersion: 0, fixedInstanceCapacity: true,
      sightHidden: true, visible: false });
    addChild(root, batch);
    const keep = mulberry32(5101);
    for (let i = 0; i < seeds.length; i++) seeds[i] = keep();
    // The run's gusts (each its share of the way down and its side) and how many have come; the gust now: its state
    // and age in it, the way it pushes, how hard (0 to 1) and how far its warning has run; and how far its streaks
    // have travelled.
    const gusts = [];
    let rand = mulberry32(1), made = 0, state = CALM, age = 0, total = 1, goalX = 0, goalZ = 0;
    let pushX = 0, pushZ = 0, strength = 0, warning = 0, travel = 0;
    const away = (x, z) => Math.hypot(goalX - x, goalZ - z);
    // A gust comes on as the rider reaches it, blowing across the way from there to the goal from its side.
    const begin = (gust, x, z) => {
      const fx = goalX - x, fz = goalZ - z, d = Math.hypot(fx, fz) || 1;
      pushX = -fz / d * gust.side; pushZ = fx / d * gust.side;
      state = WARNING; age = 0; travel = 0;
    };
    const draw = (eye, look, intensity, shown) => {
      // The wind's frame: along it (pushX, pushZ), across the course and up, about a point ahead of the eye.
      const qx = -pushZ, qz = pushX, span = BOX[0] * 2;
      const fx = look.x - eye.x, fy = look.y - eye.y, fz = look.z - eye.z, f = AHEAD / (Math.hypot(fx, fy, fz) || 1);
      const ox = fx * f, oy = fy * f, oz = fz * f;
      for (let i = 0, o = 0; i < count; i++, o += 20) {
        const h1 = seeds[i * 4], h2 = seeds[i * 4 + 1], h3 = seeds[i * 4 + 2], h4 = seeds[i * 4 + 3];
        const a = ((h1 * span + travel * (0.7 + 0.6 * h4)) % span) - BOX[0], b = (h2 * 2 - 1) * BOX[2], c = (h3 * 2 - 1) * BOX[1];
        const len = (1.2 + 3.4 * h4) * intensity;
        const dx = ox + pushX * a + qx * b, dy = oy + c, dz = oz + pushZ * a + qz * b;
        if (i >= shown || dx * dx + dy * dy + dz * dz < NEAR * NEAR) { for (let k = 0; k < 11; k++) data[o + k] = 0; continue; }
        data[o] = pushX * len; data[o + 1] = 0; data[o + 2] = pushZ * len;
        data[o + 4] = 0; data[o + 5] = 1; data[o + 6] = 0;
        data[o + 8] = qx; data[o + 9] = 0; data[o + 10] = qz;
        data[o + 12] = eye.x + dx; data[o + 13] = eye.y + dy; data[o + 14] = eye.z + dz; data[o + 15] = 1;
      }
      batch.instanceVersion++; batch.visible = shown > 0;
    };
    const hide = () => { batch.visible = false; strength = warning = 0; };
    // Each frame of a run: (x, z) the rider's feet, which brings the next gust on, and `eye` and `look` the camera's
    // place and the point it looks at.
    const update = (dt, x, z, eye, look) => {
      if (state === CALM) {
        if (made === gusts.length || 1 - away(x, z) / total < gusts[made].share) { hide(); return; }
        begin(gusts[made++], x, z);
      } else age += dt;
      if (state === WARNING && age >= WARN) { state = BLOWING; age -= WARN; }
      if (state === BLOWING && age >= BLOW) { state = CALM; age = 0; hide(); return; }
      warning = state === WARNING ? age / WARN : 0;
      strength = state === WARNING ? LEAD * ease(warning)
        : (LEAD + (1 - LEAD) * ease(age / IN)) * (1 - ease((age - (BLOW - OUT)) / OUT));
      const intensity = state === WARNING ? 0.2 + 0.3 * ease(warning) : 0.5 + 0.5 * strength;
      travel += dt * SPEED * intensity;
      draw(eye, look, intensity, Math.round(count * (state === WARNING ? 0.15 + 0.25 * warning : 0.4 + 0.6 * strength)));
    };
    // A run begins: `seed` its course's, `course` the clouds toward `finish`, and `gusts` how many it brings.
    const start = (seed, course, finish, many) => {
      rand = mulberry32(seed ^ 0x6a09e667); gusts.length = made = 0; state = CALM; age = 0; hide();
      goalX = finish.x; goalZ = finish.z; total = 1;
      for (const c of course.clouds) if (c.main) total = Math.max(total, away(c.x, c.z));
      for (let k = 0; k < many; k++) gusts.push({ share: 0.15 + 0.7 * (k + 0.1 + 0.8 * rand()) / many, side: rand() < 0.5 ? -1 : 1 });
    };
    const clear = () => { state = CALM; made = gusts.length; age = 0; hide(); };
    const dispose = () => removeChild(root, batch);
    const liveGeometry = (set) => set.add(streak());
    return { start, update, clear, dispose, liveGeometry,
      get state() { return NAMES[state]; }, get active() { return state !== CALM; }, get strength() { return strength; },
      get warning() { return warning; }, get pushX() { return pushX; }, get pushZ() { return pushZ; } };
  };
  BL.cloudHopperGust = { create, WARN, BLOW };
})();
