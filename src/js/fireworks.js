// Fireworks: the catalogue and the sprites each launch writes, for the renderers' sprite stage (`opts.sprites`).
// A sprite's whole flight is worked out in the vertex shader from its launch state, so a burst is written once and
// never touched again: 16 floats each, origin and launch time, velocity and life, colour and size, drag, gravity,
// trail delay and kind (0 star, 1 glitter, 2 electric, 3 rocket head, 4 spark, 5 a pattern's star, which holds the
// shape before it fades). Times are seconds from the batch's
// epoch, which restarts whenever the sky empties, so a float32 clock stays exact however long the island runs.
// A launch is written in slices of at most SLICE_MS a frame while its rocket rises, never in one go, and each burst
// draws only what has been written so far. Its randomness comes from its id, so every page writes the same burst;
// only the flat patterns (the ₿, the bolt) turn to face each page's own camera. Bursts open in slots, regions of sky
// over the sea the hub names; a show pack takes three. Each burst also lights the island and the sea while it burns:
// `flash` is the summed light and where it centres, `glints` the four brightest, for the sea's glitter paths and the
// sky's glow. Nothing is allocated before the first launch and nothing runs while the sky is empty; the buffers go
// again after IDLE_RELEASE_S with nothing in it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { fnv1a, mulberry32 } = BL.math;
  const FLOATS = 16, CAPACITY = 65536;
  // Live sprites a tier holds; a launch that would pass its cap waits in the queue. Counts scale by tier too.
  const CAPS = { high: 60000, medium: 30000, low: 15000 };
  const SCALE = { high: 1, medium: 0.5, low: 0.25 };
  const MAX_BURSTS = 64, MAX_FLASHES = 32, MAX_DIRTY = 8, MAX_QUEUE = 32;
  const SLICE_MS = 1, IDLE_RELEASE_S = 30, COLOR_GAIN = 0.9, BRIGHT_GAIN = 0.3;
  const KINDS = ["pop", "bolt", "mega", "show"];
  // The board's own stat colours, as the old contribution shells used, at full saturation.
  const OBL = [[0.06, 1, 0.16], [0.08, 1, 0.88], [0.27, 0.59, 1], [1, 0.61, 0.06], [1, 0.09, 0.06]];
  const GOLDS = [[1, 0.72, 0.25], [1, 0.55, 0.12], [1, 0.84, 0.45]];
  const ELECTRIC = [0.45, 0.68, 1];
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  // The show pack, 300 sats: two Megas, two Bolts and three Pops over about 8 s across its three slots.
  const SHOW = [["pop", 0, 1], ["pop", 0.7, 0], ["pop", 1.3, 2], ["bolt", 2.2, 0], ["bolt", 3, 2], ["mega", 4.6, 1], ["mega", 6.4, 0]];
  // The ₿: stem, two bowls, the bar between them and the four ticks, in a unit box, leaning right as the logo does.
  const arc = (cx, cy, r, a0, a1, n = 20) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(a0 + (a1 - a0) * i / n) * r, cy + Math.sin(a0 + (a1 - a0) * i / n) * r]);
  const BITCOIN = [
    [[-0.3, -0.5], [-0.3, 0.5]],
    [[-0.3, 0.5], [0.08, 0.5]], arc(0.08, 0.26, 0.24, Math.PI / 2, -Math.PI / 2),
    [[-0.3, 0.02], [0.12, 0.02]], arc(0.12, -0.24, 0.26, Math.PI / 2, -Math.PI / 2), [[0.12, -0.5], [-0.3, -0.5]],
    [[-0.14, 0.5], [-0.14, 0.66]], [[0.04, 0.5], [0.04, 0.66]], [[-0.14, -0.5], [-0.14, -0.66]], [[0.04, -0.5], [0.04, -0.66]]
  ].map((s) => s.map(([x, y]) => [x - 0.04, y]));
  // Points spaced evenly along polylines, `count` of them in all.
  const along = (strokes, count) => {
    let total = 0;
    for (const s of strokes) for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    const step = total / Math.max(1, count), out = [];
    for (const s of strokes) for (let i = 1; i < s.length; i++) {
      const [x0, y0] = s[i - 1], [x1, y1] = s[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let t = 0; t < n; t++) out.push(x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n);
    }
    return out;
  };

  // Where a sprite is at `age` seconds of its own life: the vertex shader's flight, for the Canvas fallback and checks.
  const flight = (data, o, age, out) => {
    const k = data[o + 12], g = data[o + 13], e = k > 1e-3 ? (1 - Math.exp(-k * age)) / k : age;
    out[0] = data[o] + data[o + 4] * e;
    out[1] = data[o + 1] + data[o + 5] * e - g * (k > 1e-3 ? (age - e) / k : 0.5 * age * age);
    out[2] = data[o + 2] + data[o + 6] * e;
    return out;
  };

  /**
   * `quality()` names the renderer's tier; `launchPoint` is where rockets leave the island; `slots` the burst centres
   * over the sea, in island coordinates; `onCue(kind, at, x, y, z, size, rise, whistle)` hears each sound to schedule.
   */
  const create = ({ quality, launchPoint, slots, onCue = null }) => {
    const batch = {
      data: null, capacity: CAPACITY, time: 0,
      ranges: new Int32Array(MAX_BURSTS * 2), rangeCount: 0,
      dirty: new Int32Array(MAX_DIRTY * 2), dirtyCount: 0, dirtyAll: false, version: 0,
      // The targets are 8-bit: a sprite's light goes into the colour this much and into the bloom's bright target this
      // much, since a float buffer's headroom is not there to carry it.
      colorGain: COLOR_GAIN, brightGain: BRIGHT_GAIN,
      // The Canvas fallback's reading of sprite `i` at the batch's time: its brightness, or 0 if not shining.
      headAt: (i, out) => {
        const d = batch.data, o = i * FLOATS, age = batch.time - d[o + 3] - d[o + 14], life = d[o + 7];
        if (!(age >= 0 && age <= life) || d[o + 14] > 0) return 0;
        flight(d, o, age, out);
        // The sprite shader's brightness per kind, without its flicker and twinkle.
        const l = age / life, kind = d[o + 15], open = 0.12 + 0.88 * Math.min(1, age / 0.28);
        if (kind === 0) return Math.pow(1 - l, 1.2) * open;
        if (kind === 5) return (l < 0.5 ? 1 : 2 - 2 * l) * open;
        if (kind === 1) return Math.pow(1 - l, 0.7) * Math.min(1, age / 0.35);
        if (kind === 2) return Math.pow(1 - l, 0.6) * 0.75;
        return kind === 3 ? 1 - l * 0.4 : (1 - l) * (1 - l);
      }
    };
    const flash = new Float32Array(8), glints = new Float32Array(32);
    const bursts = [], queue = [], flashes = [];
    for (let i = 0; i < MAX_FLASHES; i++) flashes.push({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, s: 0, t: 0, decay: 1, on: false });
    // The first launch takes a slot near the middle of the arc, where the view toward the show is centred.
    let epoch = 0, now = 0, cursor = 0, nextSlot = Math.floor((slots.length - 1) / 2), flashAt = 0, glintCount = 0, showLevel = 0, idleSince = 0;
    let launched = 0, written = 0, sliceMs = 0;
    const eyeAt = { x: 0, y: 0, z: 0 };

    // Times come in as scene seconds and are stored from the epoch, which holds while any burst is live.
    const put = (job, x, y, z, t0, vx, vy, vz, life, r, g, b, size, k, grav, delay, kind) => {
      const d = batch.data, o = job.cursor++ * FLOATS;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = t0 - epoch;
      d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz; d[o + 7] = life;
      d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = size;
      d[o + 12] = k; d[o + 13] = grav; d[o + 14] = delay; d[o + 15] = kind;
      if (t0 + delay + life > job.burst.end) job.burst.end = t0 + delay + life;
    };
    // A star and its streak: copies on the same path a little later, dimmer and smaller.
    const star = (job, x, y, z, t0, vx, vy, vz, life, col, size, k, grav, kind, trails, gain) => {
      for (let j = 0; j < trails; j++) {
        const f = gain * Math.pow(0.58, j), s = size * Math.pow(0.85, j);
        put(job, x, y, z, t0, vx, vy, vz, life, col[0] * f, col[1] * f, col[2] * f, s, k, grav, j * 0.04, kind);
      }
    };
    // A launch's flashes and sounds wait in its plan and take effect only when it is admitted, so one that queues
    // behind the cap neither lights nor sounds twice.
    let plan = null;
    const addFlash = (x, y, z, col, s, t, decay) => plan.flashes.push(x, y, z, col[0], col[1], col[2], s, t, decay);
    const cue = (kind, at, p, size, rise = 0, whistle = false) => plan.cues.push([kind, at, p[0], p[1], p[2], size, rise, whistle]);
    const apply = (pl) => {
      for (let i = 0; i < pl.flashes.length; i += 9) {
        const f = flashes[flashAt], a = pl.flashes;
        flashAt = (flashAt + 1) % MAX_FLASHES;
        f.x = a[i]; f.y = a[i + 1]; f.z = a[i + 2]; f.r = a[i + 3]; f.g = a[i + 4]; f.b = a[i + 5]; f.s = a[i + 6]; f.t = a[i + 7]; f.decay = a[i + 8]; f.on = true;
      }
      if (onCue) for (const c of pl.cues) onCue(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]);
    };

    // A launch's parts, each `n` items of `per` sprites, written in order so its randomness never depends on slicing.
    const rocket = (parts, rng, T, to, rise, col, q, big) => {
      const k = 0.7, g = 4, e = (1 - Math.exp(-k * rise)) / k, L = launchPoint;
      const vx = (to[0] - L.x) / e, vy = (to[1] - L.y + g * (rise - e) / k) / e, vz = (to[2] - L.z) / e;
      const trails = big ? 4 : 3, sparks = Math.round((big ? 90 : 50) * Math.max(q, 0.4));
      parts.push({ n: 1, per: trails, write: (job) => {
        for (let j = 0; j < trails; j++) {
          const f = 2.4 * Math.pow(0.6, j);
          put(job, L.x, L.y, L.z, T, vx, vy, vz, rise, col[0] * f, col[1] * f, col[2] * f, (big ? 0.42 : 0.32) * Math.pow(0.88, j), k, g, j * 0.05, 3);
        }
      } });
      const p = [0, 0, 0], d = new Float32Array([L.x, L.y, L.z, 0, vx, vy, vz, 0, 0, 0, 0, 0, k, g, 0, 0]);
      parts.push({ n: sparks, per: 1, write: (job) => {
        const tau = rng() * rise * 0.97;
        flight(d, 0, tau, p);
        put(job, p[0], p[1], p[2], T + tau, (rng() - 0.5) * 3, -1 - rng() * 2, (rng() - 0.5) * 3, 0.35 + rng() * 0.55, 1.6, 0.7, 0.3, 0.17, 1.8, 7, 0, 4);
      } });
      cue("launch", T, [L.x, L.y, L.z], big ? 1 : 0.7, rise, rng() < (big ? 0.35 : 0.5));
    };
    const peony = (parts, rng, c, t0, n, speed, palette, life, size, k, grav, trails, gain) => {
      parts.push({ n, per: trails, write: (job, i) => {
        const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * GOLDEN_ANGLE + rng() * 0.3, sp = speed * (0.86 + rng() * 0.18);
        star(job, c[0], c[1], c[2], t0, Math.cos(a) * r * sp, y * sp, Math.sin(a) * r * sp, life * (0.85 + rng() * 0.3), palette[(rng() * palette.length) | 0], size, k, grav, 0, trails, gain);
      } });
    };
    // Stars that fly out into a flat pattern (`pts`, x and y pairs in metres) laid in the plane facing this viewer.
    const pattern = (parts, rng, c, t0, pts, K, life, col, size, grav, kind, trails, gain, jitter) => {
      const f0 = c[0] - eyeAt.x, f1 = c[2] - eyeAt.z, fl = Math.hypot(f0, f1) || 1, rx = -f1 / fl, rz = f0 / fl;
      parts.push({ n: pts.length / 2, per: trails, write: (job, i) => {
        const x = pts[i * 2], y = pts[i * 2 + 1];
        star(job, c[0], c[1], c[2], t0, rx * x * K + (rng() - 0.5) * jitter, y * K + (rng() - 0.5) * jitter, rz * x * K + (rng() - 0.5) * jitter, life + rng() * 0.4, col, size, K, grav, kind, trails, gain);
      } });
      return [rx, rz];
    };
    const glitter = (parts, rng, c, t0, n, speedLo, speedHi, up, life, col, size, k, grav) => {
      parts.push({ n, per: 1, write: (job) => {
        let x = rng() - 0.5, y = rng() * (1 + up) - 0.5, z = rng() - 0.5;
        const l = Math.hypot(x, y, z) || 1, sp = speedLo + rng() * (speedHi - speedLo);
        x /= l; y /= l; z /= l;
        put(job, c[0], c[1], c[2], t0 + rng() * 0.25, x * sp, y * sp, z * sp, life + rng() * 0.6, col[0], col[1], col[2], size, k, grav, 0, 1);
      } });
    };

    const BUILD = {
      pop(parts, rng, T, c, q) {
        const rise = 1.45 + rng() * 0.25, tb = T + rise;
        rocket(parts, rng, T, c, rise, [1, 0.8, 0.55], q, false);
        peony(parts, rng, c, tb, Math.round(170 * Math.max(q, 0.5)), 31, OBL, 2.2, 0.68, 1.35, 4.5, Math.max(2, Math.round(5 * q)), 4);
        glitter(parts, rng, c, tb + 0.25, Math.round(80 * Math.max(q, 0.4)), 8, 18, 0, 0.9, [2.2, 2, 1.6], 0.28, 1.6, 4);
        addFlash(c[0], c[1], c[2], [0.7, 0.8, 0.6], 1.6, tb, 0.35);
        addFlash(c[0], c[1], c[2], [0.7, 0.8, 0.6], 0.5, tb, 1.6);
        cue("boom", tb, c, 0.55);
        cue("crackle", tb + 0.35, c, 0.5);
      },
      bolt(parts, rng, T, c, q) {
        const rise = 1.8 + rng() * 0.25, tb = T + rise, strike = tb + 0.45;
        rocket(parts, rng, T, c, rise, [0.7, 0.85, 1], q, false);
        const main = [[(rng() - 0.5) * 16, 58]];
        for (let i = 1; i <= 9; i++) {
          const last = main[i - 1];
          main.push([Math.max(-30, Math.min(30, last[0] + (rng() - 0.5) * 26)), 58 - (i * 116) / 9 + (rng() - 0.5) * 6]);
        }
        const paths = [main];
        for (let b = 0; b < 3; b++) {
          const pts = [main[2 + ((rng() * 5) | 0)]], dir = rng() < 0.5 ? -1 : 1;
          for (let s = 0; s < 4; s++) { const l = pts[pts.length - 1]; pts.push([l[0] + dir * (5 + rng() * 6), l[1] - (6 + rng() * 5)]); }
          paths.push(pts);
        }
        peony(parts, rng, c, tb, Math.round(120 * Math.max(q, 0.5)), 20, [ELECTRIC], 1.1, 0.5, 1.6, 3, Math.max(2, Math.round(3 * q)), 3);
        const [rx, rz] = pattern(parts, rng, c, tb, along(paths, Math.round(700 * Math.max(q, 0.5))), 4, 1.9, ELECTRIC, 0.7, 0.8, 2, 2, 3.2, 2);
        // The strike: a white core and a blue glow, top to bottom, then a smaller restrike.
        const core = along(paths, Math.round(560 * Math.max(q, 0.5))), glow = along(paths, Math.round(140 * Math.max(q, 0.5)));
        for (const [pts, size, col] of [[core, 0.42, [5, 5.6, 6.5]], [glow, 2.6, [0.12, 0.3, 0.9]]]) {
          parts.push({ n: pts.length / 2, per: 2, write: (job, i) => {
            const x = pts[i * 2], y = pts[i * 2 + 1], px = c[0] + rx * x, py = c[1] + y, pz = c[2] + rz * x, reveal = ((58 - y) / 116) * 0.08;
            put(job, px, py, pz, strike + reveal, 0, 0, 0, 0.5, col[0], col[1], col[2], size, 1, 0, 0, 2);
            put(job, px, py, pz, strike + 0.28 + reveal * 0.5, 0, 0, 0, 0.3, col[0], col[1], col[2], size, 1, 0, 0, 2);
          } });
        }
        parts.push({ n: Math.round(650 * q), per: 1, write: (job) => {
          const j = ((rng() * core.length / 2) | 0) * 2, x = core[j], y = core[j + 1];
          put(job, c[0] + rx * x, c[1] + y, c[2] + rz * x, strike + rng() * 0.5, (rng() - 0.5) * 14, (rng() - 0.5) * 14, (rng() - 0.5) * 14, 0.7 + rng() * 0.7, 1.9, 2.2, 2.6, 0.3, 2, 3, 0, 1);
        } });
        addFlash(c[0], c[1], c[2], [0.45, 0.6, 1], 1.4, tb, 0.3);
        addFlash(c[0], c[1], c[2], [0.7, 0.8, 1], 4.5, strike, 0.18);
        addFlash(c[0], c[1], c[2], [0.7, 0.8, 1], 3, strike + 0.28, 0.15);
        addFlash(c[0], c[1], c[2], [0.5, 0.65, 1], 0.6, strike, 1.2);
        cue("boom", tb, c, 0.35);
        cue("zap", tb + 0.05, c, 0.8);
        cue("thunder", strike, c, 1);
        cue("crackle", strike + 0.1, c, 0.6);
      },
      mega(parts, rng, T, c, q) {
        const rise = 2.3 + rng() * 0.3, tb = T + rise, trails = Math.max(2, Math.round(6 * q));
        rocket(parts, rng, T, c, rise, [1, 0.85, 0.6], q, true);
        peony(parts, rng, c, tb, Math.round(420 * Math.max(q, 0.5)), 54, GOLDS, 3.2, 0.85, 1.15, 5, trails, 3.4);
        const lean = (14 * Math.PI) / 180, cl = Math.cos(lean), sl = Math.sin(lean), glyph = along(BITCOIN, Math.round(760 * Math.max(q, 0.5)));
        for (let i = 0; i < glyph.length; i += 2) {
          const ux = glyph[i], uy = glyph[i + 1];
          glyph[i] = (ux * cl + uy * sl) * 62;
          glyph[i + 1] = (-ux * sl + uy * cl) * 62;
        }
        pattern(parts, rng, c, tb + 0.06, glyph, 2.6, 3.8, [1, 0.8, 0.45], 0.8, 1, 5, 2, 3.6, 1.5);
        const ringN = Math.round(320 * Math.max(q, 0.5)), ring = new Float32Array(ringN * 2);
        for (let i = 0; i < ringN; i++) { ring[i * 2] = Math.cos((i / ringN) * Math.PI * 2) * 46; ring[i * 2 + 1] = Math.sin((i / ringN) * Math.PI * 2) * 46; }
        pattern(parts, rng, c, tb + 0.03, ring, 2.2, 3.2, [1, 0.42, 0.06], 0.7, 1.2, 5, 3, 3.2, 0);
        glitter(parts, rng, c, tb + 0.12, Math.round(2200 * q), 30, 50, 0.2, 4.5, [2.1, 1.5, 0.65], 0.42, 0.85, 7);
        for (let i = 0, m = Math.max(1, Math.round(4 * q)); i < m; i++) {
          const cc = [c[0] + (rng() - 0.5) * 120, c[1] + (rng() - 0.3) * 50, c[2] + (rng() - 0.5) * 40], ts = tb + 0.75 + i * 0.28 + rng() * 0.1, col = OBL[i % OBL.length];
          peony(parts, rng, cc, ts, Math.round(140 * Math.max(q, 0.5)), 22, [col], 2, 0.6, 1.3, 4, Math.max(2, Math.round(4 * q)), 3);
          addFlash(cc[0], cc[1], cc[2], col, 1.4, ts, 0.3);
          addFlash(cc[0], cc[1], cc[2], col, 0.45, ts, 1.4);
          cue("boom", ts, cc, 0.5);
        }
        addFlash(c[0], c[1], c[2], [1, 0.7, 0.3], 4.5, tb, 0.6);
        addFlash(c[0], c[1], c[2], [1, 0.7, 0.3], 1.2, tb, 2.6);
        cue("boom", tb, c, 1);
        cue("crackle", tb + 0.5, c, 1);
        cue("sizzle", tb + 0.4, c, 1);
      }
    };
    // A burst's centre in its slot, from its own randomness: Pops lower, Megas and Bolts high.
    const centre = (kind, slot, rng) => {
      const s = slots[slot % slots.length], lift = kind === "pop" ? -28 : 0;
      return [s.x + (rng() - 0.5) * 30, s.y + lift + (rng() - 0.5) * 24, s.z + (rng() - 0.5) * 30];
    };

    const ensureData = () => { if (!batch.data) batch.data = new Float32Array(CAPACITY * FLOATS); };
    // One burst's launch, planned once: its parts with their exact sprite count, written later in slices, and the
    // flashes and sounds it will set off.
    const planOf = (kind, id, at, slot, q) => {
      const rng = mulberry32(fnv1a(id));
      plan = { kind, parts: [], flashes: [], cues: [], count: 0 };
      BUILD[kind](plan.parts, rng, at, centre(kind, slot, rng), q);
      for (const p of plan.parts) plan.count += p.n * p.per;
      const made = plan;
      plan = null;
      return made;
    };
    // A free run of the ring for `count` sprites, or -1 while live bursts still hold the space.
    const allocate = (count) => {
      let at = cursor + count > CAPACITY ? 0 : cursor;
      for (const b of bursts) if (b.start < at + count && at < b.start + b.count) return -1;
      cursor = at + count;
      return at;
    };
    const capOf = () => CAPS[quality()] || CAPS.low;
    const liveCount = () => { let n = 0; for (const b of bursts) n += b.count; return n; };

    /** Launch `kind` at scene time `at` (default now) into `slot` (default the next); returns false if it is unknown. */
    const launch = (kind, id, { at = now, slot = -1, eye = null } = {}) => {
      if (!BUILD[kind] && kind !== "show") return false;
      if (queue.length >= MAX_QUEUE) return false;
      if (eye) { eyeAt.x = eye.x; eyeAt.y = eye.y; eyeAt.z = eye.z; }
      // A show's three bursts take neighbouring slots, so it starts no later than the third slot from the end.
      const s = kind === "show" ? Math.min(slot >= 0 ? slot : nextSlot, Math.max(0, slots.length - 3)) : slot >= 0 ? slot : nextSlot;
      nextSlot = (s + (kind === "show" ? 3 : 1)) % slots.length;
      if (kind === "show") for (let i = 0; i < SHOW.length; i++) queue.push({ kind: SHOW[i][0], id: `${id}/${i}`, at: at + SHOW[i][1], slot: s + SHOW[i][2] });
      else queue.push({ kind, id, at, slot: s });
      launched++;
      return true;
    };
    // Queued launches start in order while the tier's cap and the ring have room; the rest wait.
    const admit = () => {
      while (queue.length && bursts.length < MAX_BURSTS) {
        const next = queue[0];
        if (!next.plan) next.plan = planOf(next.kind, next.id, next.at, next.slot, SCALE[quality()] || SCALE.low);
        const pl = next.plan;
        if (bursts.length && liveCount() + pl.count > capOf()) return;
        const at = allocate(pl.count);
        if (at < 0) return;
        ensureData();
        if (!bursts.length) epoch = now;
        queue.shift();
        apply(pl);
        bursts.push({ kind: pl.kind, start: at, count: pl.count, written: 0, end: 0, parts: pl.parts, part: 0, item: 0, cursor: at });
      }
    };
    const pendingWork = () => { for (const b of bursts) if (b.parts) return true; return false; };
    // Write the unwritten parts of every burst, oldest first, until this frame's slice is spent.
    const job = { cursor: 0, burst: null };
    const write = () => {
      const t0 = performance.now();
      for (const b of bursts) {
        if (!b.parts) continue;
        const from = b.cursor;
        job.cursor = b.cursor;
        job.burst = b;
        while (b.part < b.parts.length) {
          const p = b.parts[b.part];
          while (b.item < p.n) {
            p.write(job, b.item++);
            if ((b.item & 63) === 0 && performance.now() - t0 > SLICE_MS) break;
          }
          if (b.item < p.n) break;
          b.part++;
          b.item = 0;
        }
        b.cursor = job.cursor;
        b.written = b.cursor - b.start;
        written += b.cursor - from;
        markDirty(from, b.cursor);
        if (b.part >= b.parts.length) b.parts = null;
        if (performance.now() - t0 > SLICE_MS) break;
      }
      job.burst = null;
      sliceMs = performance.now() - t0;
    };
    const markDirty = (from, to) => {
      if (to <= from) return;
      if (batch.dirtyCount >= MAX_DIRTY) { batch.dirtyAll = true; return; }
      batch.dirty[batch.dirtyCount * 2] = from;
      batch.dirty[batch.dirtyCount * 2 + 1] = to;
      batch.dirtyCount++;
    };
    // The summed light of every lit flash and where it centres, and the four brightest as glints.
    const light = () => {
      let r = 0, g = 0, b = 0, w = 0, x = 0, y = 0, z = 0;
      glints.fill(0);
      glintCount = 0;
      for (const f of flashes) {
        if (!f.on) continue;
        const t = now - f.t;
        if (t > f.decay * 8) { f.on = false; continue; }
        if (t < 0) continue;
        const s = f.s * Math.exp(-t / f.decay) * Math.min(1, t / 0.03);
        r += f.r * s; g += f.g * s; b += f.b * s; w += s; x += f.x * s; y += f.y * s; z += f.z * s;
        // The four brightest, brightest first: a new one goes in at the end, or over the dimmest, and moves up.
        let i = glintCount;
        if (i === 4) { if (glints[15] >= s) continue; i = 3; } else glintCount++;
        glints[i * 4] = f.x; glints[i * 4 + 1] = f.y; glints[i * 4 + 2] = f.z; glints[i * 4 + 3] = s;
        glints[16 + i * 4] = f.r; glints[16 + i * 4 + 1] = f.g; glints[16 + i * 4 + 2] = f.b; glints[16 + i * 4 + 3] = 0;
        for (; i > 0 && glints[(i - 1) * 4 + 3] < s; i--) for (let k = 0; k < 4; k++) {
          const a = i * 4 + k, c = (i - 1) * 4 + k;
          let t = glints[a]; glints[a] = glints[c]; glints[c] = t;
          t = glints[16 + a]; glints[16 + a] = glints[16 + c]; glints[16 + c] = t;
        }
      }
      flash[3] = w > 1e-3 ? 1 : 0;
      if (w > 1e-3) { flash[0] = x / w; flash[1] = y / w; flash[2] = z / w; }
      flash[4] = r; flash[5] = g; flash[6] = b;
    };

    /** Once a frame with the scene's time and the camera: admits, writes, retires and lights. Nothing if the sky is empty. */
    const update = (dt, time, eye) => {
      now = time;
      if (eye) { eyeAt.x = eye.x; eyeAt.y = eye.y; eyeAt.z = eye.z; }
      const active = bursts.length || queue.length;
      showLevel += ((active ? 1 : 0) - showLevel) * (1 - Math.exp(-dt / (active ? 0.6 : 2.5)));
      if (showLevel < 1e-3) showLevel = 0;
      if (!active) {
        if (flash[3] || glintCount) light();
        if (batch.data && now - idleSince > IDLE_RELEASE_S) { batch.data = null; batch.version++; }
        return;
      }
      idleSince = now;
      if (queue.length) admit();
      if (pendingWork()) write();
      for (let i = bursts.length - 1; i >= 0; i--) if (!bursts[i].parts && bursts[i].end <= now) bursts.splice(i, 1);
      batch.rangeCount = bursts.length;
      for (let i = 0; i < bursts.length; i++) { batch.ranges[i * 2] = bursts[i].start; batch.ranges[i * 2 + 1] = bursts[i].written; }
      batch.time = now - epoch;
      light();
    };
    const clear = () => {
      bursts.length = queue.length = 0;
      batch.rangeCount = batch.dirtyCount = 0;
      for (const f of flashes) f.on = false;
      flash.fill(0); glints.fill(0); glintCount = 0; showLevel = 0;
    };

    return {
      batch, flash, glints, launch, update, clear, flight,
      get glintCount() { return glintCount; },
      // True while anything is in the sky or waiting to go up: the renderer draws, the governor holds its tier.
      get live() { return bursts.length > 0 || queue.length > 0; },
      get showLevel() { return showLevel; },
      get pending() { return bursts.length + queue.length; },
      stats: () => ({ fireworkBursts: bursts.length, fireworkQueued: queue.length, fireworkSprites: liveCount(), fireworkCap: capOf(), fireworkLaunched: launched, fireworkWritten: written, fireworkSliceMs: sliceMs, fireworkBuffer: !!batch.data }),
      dispose: () => { clear(); batch.data = null; batch.version++; }
    };
  };

  BL.fireworks = { create, KINDS, CAPS, SCALE, FLOATS, CAPACITY, flight };
})();
