// ₿IFRÖST's Dimensional Echo: now and then, a while after a visitor reaches the hall, a spectral double of their Ooga
// separates from it, floats out where the view can see it, turns and looks at the visitor, arcs round the ₿ and goes
// through an open world's window, looking back once from inside its passage before it fades. Nothing explains it,
// nothing asks anything of the visitor, and their Ooga stays theirs to drive throughout; it is this page's alone.
//
// About ten seconds (`PHASES`, in seconds from its start): the stir, the ₿ flickering softly as motes rise from the
// Ooga, and the double drawing out of it (0 to 2); the look, held about a second and a half (2 to 4); the flight,
// accelerating round the mechanism (4 to 7); and the crossing, its window's field rippling, the look back from the
// passage and the fade (7 to 10). The machine answers the double as it answers a traveller: as it nears its window
// it pulls on that window (`pullOf`, its nearness as the scene measures anyone's) so the ₿ charges in that world's
// colour, the window's rim heats and the world's chord sounds, all ebbing as it fades. Only one traveller at a time:
// it does not start while the Ooga stands near an open window (`QUIET`), and if the Ooga walks up to one itself
// before the double looks back (`TURNED`), the double dissolves (`DISSOLVE` seconds) and the machine turns to it.
//
// The double is the visitor's own Ooga, cloned from its model (`models.caveman`, sharing the shape of every part) in a
// spectral copy of each part's geometry: its colours turned to a blue and violet glow by their brightness, drawn as
// glass, which brightens at its rim, and casting no shadow. A copy is made once a page for each part and reused, and a
// visit that will have one builds its double while it is entered, behind the fade.
//
// Whether a visit gets one is rolled when it starts (`roll`): `FIRST` until this browser has seen one and `CHANCE` after,
// never within `COOLDOWN` of the last one seen, which counts from the moment a double appears, so one cut short by
// leaving before it shows is not spent; never when the visitor asks for reduced motion. It waits for the Ooga to reach
// the hall, then `DELAY` seconds and a few more, counted only while the visitor is not leaving or reading a dialog over
// the chamber (`busy`). A test page (`nosim`) gets none. `trigger` plays one at once, and `?debug=1&echo=1` gives
// every visit one after `FORCED` seconds, for review, `nosim` or not.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { clamp } = math;
  const { createNode, addChild, removeChild } = BL.scene;
  const FIRST = 0.5, CHANCE = 0.2, COOLDOWN = 15 * 60 * 1000, DELAY = [8, 6], FORCED = 3, KEY = "ooga-bifrost-echo";
  const QUIET = 0.1, TURNED = 0.35, DISSOLVE = 0.6;
  // A test page (`nosim`) gets none unless it asks for one.
  const params = new URLSearchParams(location.search), FORCE = params.get("debug") === "1" && params.get("echo") === "1", TEST_PAGE = params.has("nosim");
  const PHASES = { emerge: 0.6, out: 2, look: 4, fly: 7, enter: 7.6, back: 9, gone: 10 };
  // How far out the double floats from the Ooga's head (`ahead` along the view, `side` to its right, `up`), and from the
  // eye in first person, where it must not stand in the way of the view.
  const SPOT = { ahead: 0.8, side: 1.3, up: 0.5 }, EYE = { ahead: 2, side: 0.6, up: 0.1 };
  // The double hovers this far over the floor, swings round the core no nearer than `ORBIT`, and goes `IN` metres into
  // the passage past the wall's face.
  const HOVER = 0.55, ORBIT = 3.2, IN = 2.2;
  // Its glass, its glow, how much brighter it glows looking back from the passage, and its colours by brightness: deep
  // violet to the field's blue to a pale blue, never white, so it reads blue under the bloom.
  const GLASS = 0.42, EMISSIVE = 0.8, BACK_GLOW = 1.3;
  const RAMP = [[0, [34, 20, 96]], [0.35, [64, 84, 232]], [0.7, [118, 150, 255]], [1, [182, 204, 255]]];
  const MOTES = ["#7aa8ff", "#b48cff", "#ffffff"].map((c) => models.particleGeometry(c, 0.07, 1));
  // What an Ooga carries, which the double shows or puts away as the Ooga does now (a parked weapon stays away).
  const GEAR = ["club", "gun", "gunFlash", "snack", "jetpack", "jetFlame", "shield", "chuk", "board"];

  // A spectral copy of a part: the same shape, its colours glowing blue and violet by their brightness, as glass.
  // Tones are kept by colour, so one palette's worth serves every Ooga.
  const copies = new WeakMap(), tones = new Map();
  const toneOf = (c) => {
    const r = clamp(Math.round(c[0]), 0, 255), g = clamp(Math.round(c[1]), 0, 255), b = clamp(Math.round(c[2]), 0, 255), key = (r << 16) | (g << 8) | b;
    let out = tones.get(key);
    if (out) return out;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    let k = 1;
    while (k < RAMP.length - 1 && RAMP[k][0] < l) k++;
    const [t0, lo] = RAMP[k - 1], [t1, hi] = RAMP[k], f = clamp((l - t0) / (t1 - t0), 0, 1);
    out = [0, 1, 2].map((i) => Math.round(lo[i] + (hi[i] - lo[i]) * f));
    tones.set(key, out);
    return out;
  };
  // A packed character mesh (compact-geometry.js) gives its faces as fresh records, so copying it never fills its
  // legacy face cache, and its copy is packed the same way.
  const spectral = (src) => {
    let geo = copies.get(src);
    if (geo) return geo;
    const compact = BL.compactGeometry, packed = compact?.storageOf(src);
    geo = models.geometry();
    for (let n = 0, count = packed ? packed.count : src.faces.length; n < count; n++) {
      const f = packed ? compact.copyFace(src, n) : src.faces[n];
      geo.faces.push({ i: f.i, color: toneOf(f.color), emissive: EMISSIVE });
    }
    geo.verts = src.verts;
    if (src.voxel) geo.voxel = src.voxel;
    geo.glass = GLASS;
    geo.castShadow = false;
    // Kept, as the Ooga's own parts are, in the lower tiers' reflections whatever its size.
    if (src.characterPart) geo.characterPart = true;
    if (packed) compact.pack(geo, { immutable: true, renderOnly: true, precision: 64 });
    copies.set(src, geo);
    return geo;
  };
  // The double: a clone of the Ooga in spectral copies, with every node of it listed (`nodes`) for its fade and glow.
  const ghostOf = (traits) => {
    const figure = models.caveman(traits), stack = [figure.root], nodes = [];
    while (stack.length) {
      const node = stack.pop();
      if (node.geometry) node.geometry = spectral(node.geometry);
      node.sightHidden = true;
      nodes.push(node);
      for (let i = 0; i < node.children.length; i++) stack.push(node.children[i]);
    }
    figure.nodes = nodes;
    return figure;
  };

  // Asked when a visit starts, so a setting changed meanwhile counts.
  const reducedMotion = () => {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  };
  // A time in the future (the clock set back since) counts as none, or it would hold the echo off until then.
  const lastSeen = () => {
    try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && v > 0 && v <= Date.now() ? v : 0; } catch { return 0; }
  };
  const markSeen = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch {}
  };
  // Whether this visit gets one.
  const roll = () => {
    if (reducedMotion()) return false;
    const last = lastSeen();
    if (last && Date.now() - last < COOLDOWN) return false;
    return Math.random() < (last ? CHANCE : FIRST);
  };

  // `hall` is { r, inHall(p) }; `windows` the open worlds' windows (`sn`, `c`, `near`, `phase.ripples`); `glyph` the ₿;
  // `nearness(w, p)` how near (0 to 1) a point stands to a window, as the scene measures it; `mine()` the Ooga's own
  // nearness to the nearest open window; `cue` plays the chamber's sound; `pilot` says how the visitor is viewing (its
  // `mode`, and the view's `orbit.yaw` for a view looking straight down); `prepare(geometry)` uploads a mesh ahead of
  // its first draw; `busy()` that the visitor is leaving or reading something over the chamber, which the wait holds for.
  const create = ({ root, fx, camera, avatar, pilot, hall, windows, glyph, nearness, mine, cue, prepare, busy }) => {
    let pending = windows.length > 0 && (FORCE || !TEST_PAGE && roll()), wait = FORCE ? FORCED : DELAY[0] + Math.random() * DELAY[1], t = -1, figure = null, to = null;
    // A visit that will have one builds its double now, while the visit is entered behind the fade, and uploads its
    // meshes, so the moment it appears costs nothing; `liveGeometry` keeps them until then.
    const build = () => {
      const f = ghostOf(avatar.traits);
      for (let i = 0; i < f.nodes.length; i++) if (f.nodes[i].geometry) prepare(f.nodes[i].geometry);
      return f;
    };
    let built = pending ? build() : null;
    let flicker = 0, moteIn = 0, ripples = 0, pull = 0, presence = 0, dissolve = -1, seen = false;
    const S = { x: 0, y: 0, z: 0 }, P = { x: 0, y: 0, z: 0 }, path = { a0: 0, da: 0, r0: 0, r1: 0, dip: 0, y0: 0, y1: 0 };
    const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
    const turnTo = (rot, want, k) => {
      const d = Math.atan2(Math.sin(want - rot.y), Math.cos(want - rot.y));
      rot.y += d * Math.min(1, k);
    };

    const start = () => {
      const q = avatar.root.position, eye = camera.position, look = camera.target;
      // The view's way on the ground; a view looking straight down takes its turn instead.
      let fx2 = look.x - eye.x, fz2 = look.z - eye.z, l = Math.hypot(fx2, fz2);
      if (l < 0.3) { fx2 = -Math.sin(pilot.orbit.yaw); fz2 = -Math.cos(pilot.orbit.yaw); l = 1; }
      fx2 /= l; fz2 /= l;
      // Where the view sees it: beside the Ooga's head, or ahead of the eye in first person.
      const first = pilot.mode === "first-person", o = first ? EYE : SPOT, base = q.y - avatar.baseY;
      const headY = base + avatar.bodyHeight * 0.9;
      S.x = (first ? eye.x : q.x) + fx2 * o.ahead - fz2 * o.side;
      S.z = (first ? eye.z : q.z) + fz2 * o.ahead + fx2 * o.side;
      const r = Math.hypot(S.x, S.z), fit = clamp(r, ORBIT * 0.7, hall.r - 2) / (r || 1);
      S.x *= fit; S.z *= fit;
      S.y = clamp((first ? eye.y : headY) + o.up - avatar.bodyHeight * 0.75, base + HOVER, base + 2.6);
      // The world it goes to: one of the open windows the Ooga is not standing at, else the one it is nearest to least.
      let best = null, count = 0;
      for (let i = 0; i < windows.length; i++) if (windows[i].near < 0.35 && Math.random() * ++count < 1) best = windows[i];
      if (!best) for (let i = 0; i < windows.length; i++) if (!best || windows[i].near < best.near) best = windows[i];
      to = best;
      figure = built || ghostOf(avatar.traits);
      built = null;
      dress();
      const g = figure.root;
      g.position.x = q.x; g.position.y = q.y; g.position.z = q.z;
      g.rotation.y = avatar.root.rotation.y;
      g.scale.x = g.scale.y = g.scale.z = 0.92;
      setFade(0);
      addChild(root, g);
      t = 0; flicker = 1; ripples = 0; pull = 0; dissolve = -1; seen = false;
      cue("echo-stir");
    };
    // Dressed as the Ooga is now; a pet, which walks beside the Ooga rather than on it, stays behind.
    const dress = () => {
      const own = avatar.parts, parts = figure.parts;
      for (const key of GEAR) {
        const part = parts[key], mine = own[key];
        if (part && mine && typeof part.visible === "boolean" && typeof mine.visible === "boolean") part.visible = mine.visible;
      }
      if (parts.dog) parts.dog.visible = false;
    };
    // The double's whole figure at `k` of its full presence, glowing `glow`.
    const setFade = (k, glow = 1) => {
      const nodes = figure.nodes;
      presence = k;
      // The cooldown counts from the first moment the double can be seen.
      if (k > 0 && !seen) { seen = true; markSeen(); }
      for (let i = 0; i < nodes.length; i++) { nodes[i].smokeOpacity = k; nodes[i].glow = glow; }
    };
    const pose = (arms, legs, lean) => {
      const p = figure.parts;
      p.armL.rotation.z = arms; p.armR.rotation.z = -arms;
      p.armL.rotation.x = p.armR.rotation.x = lean * 0.8;
      p.legL.rotation.x = legs; p.legR.rotation.x = legs * 0.6;
      figure.root.rotation.x = lean * 0.35;
    };
    const motes = (x, y, z, n, rise) => {
      for (let i = 0; i < n; i++) {
        fx.spawnParticle(MOTES[Math.floor(Math.random() * MOTES.length)], x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.9, z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.4, rise * (0.4 + Math.random() * 0.6), (Math.random() - 0.5) * 0.4, 1 + Math.random() * 0.8, 2, -0.4, -100);
      }
    };
    const end = () => {
      if (figure) removeChild(root, figure.root);
      figure = null; to = null; t = -1; pull = 0; dissolve = -1;
      glyph.glow = 1;
    };

    const update = (dt) => {
      if (t < 0) {
        if (!pending) return;
        if (!hall.inHall(avatar.root.position) || mine() > QUIET || busy()) return;
        if ((wait -= dt) > 0) return;
        pending = false;
        start();
        return;
      }
      t += dt;
      const g = figure.root, gp = g.position, eye = camera.position;
      // The Ooga walking up to a window itself before the double has looked back: it dissolves, and lets go its pull.
      if (dissolve < 0 && t < PHASES.back && mine() > TURNED) {
        dissolve = DISSOLVE;
        pull = 0;
        motes(gp.x, gp.y - avatar.baseY, gp.z, 8, 0.6);
        cue("echo-fade");
      }
      if (dissolve >= 0) {
        const from = presence;
        dissolve -= dt;
        if (dissolve <= 0) { end(); return; }
        setFade(from * dissolve / (dissolve + dt));
        if (flicker > 0) { flicker = 0; glyph.glow = 1; }
        return;
      }
      // The stir: the ₿ dips softly twice, no more than a breath; motes rise off the Ooga.
      if (flicker > 0) {
        flicker = Math.max(0, flicker - dt / 1.2);
        glyph.glow = 1 - 0.45 * flicker * (0.5 + 0.5 * Math.cos(t * 10.5));
        if (flicker === 0) glyph.glow = 1;
      }
      if ((moteIn -= dt) <= 0) {
        moteIn = 0.07;
        if (t < PHASES.out) motes(avatar.root.position.x, avatar.root.position.y - avatar.baseY + 0.3, avatar.root.position.z, 2, 0.9);
        else if (t < PHASES.back) motes(gp.x, gp.y - avatar.baseY + 0.2, gp.z, t > PHASES.look ? 3 : 1, 0.3);
      }
      if (t < PHASES.out) {
        // Drawing out of the Ooga to where the view sees it, appearing as it goes.
        const k = clamp((t - PHASES.emerge) / (PHASES.out - PHASES.emerge), 0, 1), e = k * k * (3 - 2 * k), q = avatar.root.position;
        if (t >= PHASES.emerge && t - dt < PHASES.emerge) cue("echo-rise");
        gp.x = q.x + (S.x - q.x) * e; gp.y = q.y + (S.y + avatar.baseY - q.y) * e; gp.z = q.z + (S.z - q.z) * e;
        setFade(clamp((t - PHASES.emerge * 0.5) / 0.9, 0, 1));
        g.scale.x = g.scale.y = g.scale.z = 0.92 + 0.08 * e;
        turnTo(g.rotation, yawTo(gp.x, gp.z, eye.x, eye.z), dt * 2.5 * e);
        pose(0.25 + 0.25 * e, 0.15 * e, 0);
      } else if (t < PHASES.look) {
        // The look: hovering, facing the visitor.
        if (t - dt < PHASES.out) { cue("echo-look"); setFade(1); }
        gp.y = S.y + avatar.baseY + Math.sin((t - PHASES.out) * 2.6) * 0.06;
        turnTo(g.rotation, yawTo(gp.x, gp.z, eye.x, eye.z), dt * 6);
        const head = figure.parts.head, dy = eye.y - (gp.y - avatar.baseY + avatar.bodyHeight * 0.85), dh = Math.hypot(eye.x - gp.x, eye.z - gp.z) || 1;
        head.rotation.x = -clamp(Math.atan2(dy, dh), -0.5, 0.5) * 0.7;
        pose(0.5, 0.15, 0);
      } else if (t < PHASES.fly) {
        // The flight: round the core and out to its window, faster and faster, the mechanism flaring as it passes.
        if (t - dt < PHASES.look) {
          cue("echo-fly");
          figure.parts.head.rotation.x = 0;
          const a0 = Math.atan2(gp.x, gp.z), a1 = Math.atan2(to.sn, to.c);
          let da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
          if (Math.abs(da) < 2.6) da -= Math.sign(da || 1) * Math.PI * 2;
          const r0 = Math.hypot(gp.x, gp.z), r1 = hall.r - 1;
          path.a0 = a0; path.da = da; path.r0 = r0; path.r1 = r1; path.dip = Math.max(0, (r0 + r1) / 2 - ORBIT);
          path.y0 = gp.y; path.y1 = avatar.baseY + HOVER + 0.4;
        }
        const k = (t - PHASES.look) / (PHASES.fly - PHASES.look), e = k * k * (2.2 - 1.2 * k), s = Math.sin(Math.PI * e);
        const a = path.a0 + path.da * e, r = path.r0 + (path.r1 - path.r0) * e - path.dip * s;
        P.x = Math.sin(a) * r; P.z = Math.cos(a) * r; P.y = path.y0 + (path.y1 - path.y0) * e + 1.4 * s;
        turnTo(g.rotation, yawTo(gp.x, gp.z, P.x, P.z), dt * 8);
        gp.x = P.x; gp.y = P.y; gp.z = P.z;
        pull = nearness(to, gp);
        pose(0.15, -0.35, 0.6 * Math.min(1, k * 3));
      } else if (t < PHASES.back) {
        // The crossing: through the field into the passage, its field rippling, then turning to look back.
        const k = clamp((t - PHASES.fly) / (PHASES.enter - PHASES.fly), 0, 1), e = 1 - (1 - k) * (1 - k), r = hall.r - 1 + (1 + IN) * e;
        if (t - dt < PHASES.fly) cue("echo-cross");
        gp.x = to.sn * r; gp.z = to.c * r; gp.y += (avatar.baseY + HOVER - gp.y) * Math.min(1, dt * 3);
        pull = nearness(to, gp);
        if (ripples < 3 && r > hall.r + 0.1) {
          ripples++;
          to.phase.ripples.pulse((Math.random() - 0.5) * 0.8, gp.y - avatar.baseY + 0.4 + ripples * 0.3, 0);
        }
        if (t >= PHASES.enter) {
          // Turning to look back, glowing a little brighter, a ring of motes round it.
          if (t - dt < PHASES.enter) motes(gp.x, gp.y - avatar.baseY, gp.z, 10, 0.5);
          turnTo(g.rotation, yawTo(gp.x, gp.z, eye.x, eye.z), dt * 3);
          setFade(1, 1 + (BACK_GLOW - 1) * clamp((t - PHASES.enter) / 0.6, 0, 1));
        }
        pose(0.35, 0.1, 0.6 * (1 - k));
      } else if (t < PHASES.gone) {
        // The fade, still looking back.
        const k = (t - PHASES.back) / (PHASES.gone - PHASES.back);
        setFade(1 - k, BACK_GLOW);
        pull = nearness(to, gp) * (1 - k);
        gp.y += dt * 0.25;
        turnTo(g.rotation, yawTo(gp.x, gp.z, eye.x, eye.z), dt * 3);
      } else end();
    };

    // One now, whatever the roll said (debug).
    const trigger = () => {
      if (t >= 0 || !windows.length) return false;
      pending = false;
      start();
      return true;
    };
    const dispose = () => {
      if (figure) end();
      pending = false;
      built = null;
    };
    // How hard the double pulls on window `w`, as a traveller's nearness would.
    const pullOf = (w) => w === to ? pull : 0;
    // The double's meshes while it waits to appear or plays.
    const liveGeometry = (set) => {
      const f = figure || built;
      if (f) for (let i = 0; i < f.nodes.length; i++) if (f.nodes[i].geometry) set.add(f.nodes[i].geometry);
    };
    return { update, trigger, dispose, pullOf, liveGeometry, get state() { return t >= 0 ? "playing" : pending ? "pending" : "idle"; }, get time() { return t; } };
  };

  BL.bifrostEcho = { create, FIRST, CHANCE, COOLDOWN };
})();
