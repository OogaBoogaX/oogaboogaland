// One Timechain Sphere room, entered through the island's keypad (timechain-gate.js) and the scene shell
// (scene-timechain.js), which has already resolved the visit: the room's number and whether it is shared (signed in,
// `sphere-<id>`) or a solo copy (signed out: no presence, poses, voice or remote players at all). Only the room
// entered is built; it starts its own readers, sound and inputs on entry and drops every one of them on leaving.
//
// First person, shoulder and orbit share the pilot's usual controls. The Ooga walks empty-handed, with no jetpack (a
// built-in pack is taken off for the visit; the island gives the visitor's pack back on the way out). A guided arrival
// starts where the island's crossing handed over, from the same eye, and walks in from the vestibule as the doors
// close behind; Space at the Exit button (or Leave, or Escape) walks back out through them into the vestibule, comes to
// rest where the island's view out of its passage (hung at the vestibule's end) fills the eye, and hands the same Ooga
// to the island without a fade, which walks it out onto the bridge. A room the island prepared after Enter (`prepare`)
// is adopted as it stands, built, painted and on the GPU.
//
// Each room is its own kind of place (timechain-room-*.js), built on the shell every room shares
// (timechain-room-models.js): the dome is the screen, painted once, and a kind's live pictures on it (the Conference
// Room's native charts of mempool.space's public block and mining data, timechain-blocks.js, and its holdings desk) are
// repainted only when what they print changes, one picture a frame at most. Only the Conference Room has a lock.
(() => {
  "use strict";
  const BL = window.BL;
  const { math, models, contributors, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod } = BL;
  const { clamp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const ROOMS = BL.timechainRooms, RM = BL.timechainRoomModels, CH = BL.timechainCharts, DOOR = ROOMS.DOOR;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The doors take DOOR_TIME to slide; a guided walk goes at WALK_SPEED of a walk (the island's doorway's own, so a
  // crossing keeps its pace through the hand over) and gives up after GUIDE_LIMIT.
  // The way out stands still EXIT_HOLD at the handover point before the island takes over.
  const DOOR_TIME = 0.7, WALK_SPEED = 0.6, GUIDE_LIMIT = 7, TURN_RATE = 6, EXIT_HOLD = 0.12;
  // What the HUD's jetpack button shows in here: no pack at all.
  const NO_JETPACK = { owned: false, equipped: false, fuel: 1, blocked: false };
  // The light every room starts from; a kind's `render` changes what it needs (timechain-room-models.js `render`).
  const RENDER_BASE = {
    clear: [0.018, 0.016, 0.02], sky: [0.5, 0.46, 0.42], ground: [0.24, 0.2, 0.17], direct: [0.52, 0.46, 0.4], directStrength: 0.2,
    ambientFloor: 0.4, bloomStrength: 0.65
  };
  const RENDER_OPTS = {
    ...RENDER_BASE, sun: { x: 0.2, y: 0.95, z: 0.25 }, shadowCenter: { x: 0, y: 2, z: 0 }, shadowExtent: 14,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0
  };
  // A room's light into `opts`: the base, its kind's changes and its point lights, the fixed ones first.
  const lightRoom = (opts, built) => {
    Object.assign(opts, RENDER_BASE, built.render || {});
    opts.shadowExtent = built.layout.R * 1.2;
    opts.shadowCenter.y = Math.max(2, built.layout.c);
    const count = Math.min(built.lights.length, BL.glRenderer.POINT_LIGHT_CAPACITY);
    for (let n = 0; n < count; n++) { const l = built.lights[n]; opts.lights.set([l[0], l[1], l[2], l[3], l[4], l[5], l[6], 0], n * 8); }
    opts.lightCount = count;
  };
  // The room's hum: a low drone and a soft fan hiss, pitched a little apart in each room, honouring the page-wide
  // mute; a context only after a gesture, closed on leaving.
  const ambience = (room, signal) => {
    let context = null, bus = null, sources = [], nodes = [], connected = false, disposed = false, muted = false;
    muted = BL.sound.muted;
    const gate = () => {
      if (!bus) return;
      const on = !muted && !disposed;
      if (on && !connected) { bus.connect(context.destination); connected = true; }
      if (!on && connected) { bus.disconnect(); connected = false; }
    };
    const wake = () => {
      if (context || disposed || muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      context = new AudioContext();
      bus = context.createGain();
      bus.gain.value = 0.5;
      const pitch = 1 + (room.id - 5) * 0.012;
      for (const [hz, level] of [[49 * pitch, 0.03], [73.5 * pitch, 0.016]]) {
        const tone = context.createOscillator(), gain = context.createGain();
        tone.type = "sine"; tone.frequency.value = hz; gain.gain.value = level;
        tone.connect(gain); gain.connect(bus); tone.start();
        sources.push(tone); nodes.push(gain);
      }
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate), data = buffer.getChannelData(0);
      let seed = 4111 + room.id * 97;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1103515245) + 12345) | 0; data[i] = (seed >>> 0) / 2147483648 - 1; }
      const noise = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      noise.buffer = buffer; noise.loop = true;
      filter.type = "lowpass"; filter.frequency.value = 520 * pitch;
      gain.gain.value = 0.012;
      noise.connect(filter); filter.connect(gain); gain.connect(bus); noise.start();
      sources.push(noise); nodes.push(filter, gain);
      gate();
    };
    const gesture = () => { wake(); if (context && context.state === "suspended") context.resume().catch(() => {}); };
    document.addEventListener("pointerdown", gesture, { signal });
    document.addEventListener("keydown", gesture, { signal });
    const offSound = BL.sound.subscribe(on => { muted = on; gate(); if (!on) gesture(); });
    wake();
    return {
      get stats() { return { contexts: context ? 1 : 0, sources: sources.length, connected }; },
      dispose() {
        offSound();
        disposed = true;
        gate();
        document.removeEventListener("pointerdown", gesture);
        document.removeEventListener("keydown", gesture);
        for (const source of sources) { source.stop(); source.disconnect(); }
        for (const node of [...nodes, bus]) if (node) node.disconnect();
        sources = []; nodes = [];
        if (context) context.close().catch(() => {});
        context = bus = null;
      }
    };
  };

  // A live picture: its node, its canvas and what it last printed. Its geometry is made for its canvas the first time
  // it is painted (or comes painted from a room prepared at the doorway); after that a repaint only bumps its version.
  const slot = (L, live, painted = null) => ({ spec: live.spec, node: live.node, L, canvas: painted ? painted.canvas : CH.canvas(live.spec.w, live.spec.h), key: painted ? painted.key : "" });
  const hang = (renderer, s) => {
    const old = s.node.geometry;
    if (old && old.imageSurface.canvas === s.canvas) { old.imageSurface.version++; return; }
    const geometry = RM.liveGeometry(s.L, s.spec, s.canvas);
    geometry.imageSurface.version = 1;
    s.node.geometry = geometry;
    if (old) renderer.releaseGeometry(old);
  };
  // A ray against a picture's own faces (the patch of the dome it covers), rather than its bounding sphere.
  const INVERSE = math.mat4.create();
  const facePick = (node) => (ray) => {
    const geometry = node.geometry;
    if (!geometry) return Infinity;
    math.mat4.invert(INVERSE, node.world);
    const m = INVERSE, v = geometry.verts;
    const ox = m[0] * ray.ox + m[4] * ray.oy + m[8] * ray.oz + m[12], oy = m[1] * ray.ox + m[5] * ray.oy + m[9] * ray.oz + m[13], oz = m[2] * ray.ox + m[6] * ray.oy + m[10] * ray.oz + m[14];
    const dx = m[0] * ray.dx + m[4] * ray.dy + m[8] * ray.dz, dy = m[1] * ray.dx + m[5] * ray.dy + m[9] * ray.dz, dz = m[2] * ray.dx + m[6] * ray.dy + m[10] * ray.dz;
    let nearest = Infinity;
    for (const face of geometry.faces) {
      const ix = face.i, a = ix[0] * 3, b = ix[1] * 3, c = ix[2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, denominator = nx * dx + ny * dy + nz * dz;
      if (Math.abs(denominator) < 1e-12) continue;
      const t = (nx * (v[a] - ox) + ny * (v[a + 1] - oy) + nz * (v[a + 2] - oz)) / denominator;
      if (t < 0 || t >= nearest) continue;
      const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
      let inside = true;
      for (let k = 0; k < ix.length && inside; k++) {
        const p = ix[k] * 3, q = ix[(k + 1) % ix.length] * 3, ex = v[q] - v[p], ey = v[q + 1] - v[p + 1], ez = v[q + 2] - v[p + 2];
        if (ex === 0 && ey === 0 && ez === 0) continue;
        const rx = px - v[p], ry = py - v[p + 1], rz = pz - v[p + 2];
        if ((ey * rz - ez * ry) * nx + (ez * rx - ex * rz) * ny + (ex * ry - ey * rx) * nz < -1e-9) inside = false;
      }
      if (inside) nearest = t;
    }
    return nearest;
  };

  // A mesh's triangles in the cells of a coarse grid over its own frame, each cell with its triangles and the box round
  // them, made once a geometry in one pass over its faces (nothing sorted), so a ray tests only the triangles of the
  // cells it passes through.
  const GRIDS = new WeakMap();
  const gridOf = (geometry) => {
    let grid = GRIDS.get(geometry);
    if (grid) return grid;
    const v = geometry.verts, faces = geometry.faces;
    let tris = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const face of faces) tris += Math.max(0, face.i.length - 2);
    for (let i = 0; i < v.length; i += 3) {
      if (v[i] < x0) x0 = v[i];
      if (v[i] > x1) x1 = v[i];
      if (v[i + 1] < y0) y0 = v[i + 1];
      if (v[i + 1] > y1) y1 = v[i + 1];
      if (v[i + 2] < z0) z0 = v[i + 2];
      if (v[i + 2] > z1) z1 = v[i + 2];
    }
    // About a dozen triangles a cell, and no more than 24 cells along any side.
    const ex = x1 - x0 + 1e-6, ey = y1 - y0 + 1e-6, ez = z1 - z0 + 1e-6, size = Math.max(Math.max(ex, ey, ez) / 24, Math.cbrt(ex * ey * ez * 12 / Math.max(1, tris)));
    const nx = Math.ceil(ex / size), ny = Math.ceil(ey / size), nz = Math.ceil(ez / size), cells = nx * ny * nz;
    const corners = new Uint32Array(tris * 3), cellOf = new Uint32Array(tris), start = new Uint32Array(cells + 1);
    let n = 0;
    for (const face of faces) for (let k = 1; k + 1 < face.i.length; k++, n++) {
      const a = face.i[0] * 3, b = face.i[k] * 3, c = face.i[k + 1] * 3;
      corners[n * 3] = a; corners[n * 3 + 1] = b; corners[n * 3 + 2] = c;
      const cx = Math.min(nx - 1, Math.floor(((v[a] + v[b] + v[c]) / 3 - x0) / size));
      const cy = Math.min(ny - 1, Math.floor(((v[a + 1] + v[b + 1] + v[c + 1]) / 3 - y0) / size));
      const cz = Math.min(nz - 1, Math.floor(((v[a + 2] + v[b + 2] + v[c + 2]) / 3 - z0) / size));
      cellOf[n] = (cx * ny + cy) * nz + cz;
      start[cellOf[n] + 1]++;
    }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const order = new Uint32Array(tris), fill = start.slice(0, cells), box = new Float64Array(cells * 6);
    for (let c = 0; c < cells; c++) for (let axis = 0; axis < 3; axis++) { box[c * 6 + axis] = Infinity; box[c * 6 + 3 + axis] = -Infinity; }
    for (let t = 0; t < tris; t++) {
      const c = cellOf[t], o = c * 6;
      order[fill[c]++] = t;
      for (let k = 0; k < 3; k++) {
        const p = corners[t * 3 + k];
        for (let axis = 0; axis < 3; axis++) { const q = v[p + axis]; if (q < box[o + axis]) box[o + axis] = q; if (q > box[o + 3 + axis]) box[o + 3 + axis] = q; }
      }
    }
    grid = { v, corners, order, start, box, cells, all: [x0, y0, z0, x1, y1, z1] };
    GRIDS.set(geometry, grid);
    return grid;
  };
  // Whether a ray (its direction not necessarily a unit) passes through the box at `o` in `b` before `limit`.
  const crosses = (b, o, ox, oy, oz, dx, dy, dz, limit) => {
    let near = 0, far = limit;
    for (let axis = 0; axis < 3; axis++) {
      const p = axis === 0 ? ox : axis === 1 ? oy : oz, d = axis === 0 ? dx : axis === 1 ? dy : dz, lo = b[o + axis] - 1e-6, hi = b[o + 3 + axis] + 1e-6;
      if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) return false; continue; }
      let a = (lo - p) / d, c = (hi - p) / d;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > near) near = a;
      if (c < far) far = c;
      if (near > far) return false;
    }
    return true;
  };
  // Where a ray in a grid's frame first meets one of its triangles, if nearer than `limit`; `limit` otherwise.
  const gridRay = (g, ox, oy, oz, dx, dy, dz, limit) => {
    if (!crosses(g.all, 0, ox, oy, oz, dx, dy, dz, limit)) return limit;
    const v = g.v, C = g.corners;
    let nearest = limit;
    for (let c = 0; c < g.cells; c++) {
      if (g.start[c] === g.start[c + 1] || !crosses(g.box, c * 6, ox, oy, oz, dx, dy, dz, nearest)) continue;
      for (let k = g.start[c]; k < g.start[c + 1]; k++) {
        const t = g.order[k], a = C[t * 3], b = C[t * 3 + 1], e = C[t * 3 + 2];
        const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[e] - v[a], wy = v[e + 1] - v[a + 1], wz = v[e + 2] - v[a + 2];
        const px = dy * wz - dz * wy, py = dz * wx - dx * wz, pz = dx * wy - dy * wx, det = ux * px + uy * py + uz * pz;
        if (Math.abs(det) < 1e-14) continue;
        const sx = ox - v[a], sy = oy - v[a + 1], sz = oz - v[a + 2], u = (sx * px + sy * py + sz * pz) / det;
        if (u < 0 || u > 1) continue;
        const qx = sy * uz - sz * uy, qy = sz * ux - sx * uz, qz = sx * uy - sy * ux, w = (dx * qx + dy * qy + dz * qz) / det;
        if (w < 0 || u + w > 1) continue;
        const along = (wx * qx + wy * qy + wz * qz) / det;
        if (along > 1e-5 && along < nearest) nearest = along;
      }
    }
    return nearest;
  };
  // Clicks that land where they are drawn: the meshes of every target that asks for it (`pick` in a kind's target, and
  // then the live pictures) and the room's own body in their way, cast once a ray each frame. A target is hit only where
  // its own mesh is the nearest of them, so it neither reaches past its edges nor through a wall or a roof in front of
  // it. A node marked `pickProxy` stands in for a part too fine to test; it is never drawn, and is tested all the same.
  const sharpPicker = () => {
    const meshes = [], INV = math.mat4.create(), last = { ox: NaN, oy: NaN, oz: NaN, dx: NaN, dy: NaN, dz: NaN, frame: -1 }, hit = { owner: null, t: Infinity };
    let frame = 0, warmed = 0;
    const shown = (node) => { for (let n = node; n; n = n.parent) if (!n.visible) return false; return true; };
    const add = (node, owner) => { meshes.push({ node, owner }); for (const child of node.children) add(child, owner); };
    const cast = (ray) => {
      hit.owner = null; hit.t = Infinity;
      for (const m of meshes) {
        const node = m.node, geometry = node.geometry;
        if (!geometry || !geometry.faces.length || !node.pickProxy && !shown(node)) continue;
        // A stand-in is never drawn, so the renderer never places it: it is placed here, under its drawn parent.
        if (node.pickProxy) { BL.scene.updateLocal(node); if (node.parent) math.mat4.multiply(node.world, node.parent.world, node.local); else node.world.set(node.local); }
        math.mat4.invert(INV, node.world);
        const M = INV;
        const ox = M[0] * ray.ox + M[4] * ray.oy + M[8] * ray.oz + M[12], oy = M[1] * ray.ox + M[5] * ray.oy + M[9] * ray.oz + M[13], oz = M[2] * ray.ox + M[6] * ray.oy + M[10] * ray.oz + M[14];
        const dx = M[0] * ray.dx + M[4] * ray.dy + M[8] * ray.dz, dy = M[1] * ray.dx + M[5] * ray.dy + M[9] * ray.dz, dz = M[2] * ray.dx + M[6] * ray.dy + M[10] * ray.dz;
        const t = gridRay(gridOf(geometry), ox, oy, oz, dx, dy, dz, hit.t);
        if (t < hit.t) { hit.t = t; hit.owner = m.owner; }
      }
    };
    return {
      add,
      // The scene moves between frames, so a ray asked again in a later frame is cast again. A second in, the grids
      // are made a mesh a frame, so the first pointer over the room finds them ready.
      tick() {
        if (++frame > 60 && warmed < meshes.length) { const g = meshes[warmed++].node.geometry; if (g && g.faces.length) gridOf(g); }
      },
      pickRay: (owner) => (ray) => {
        if (ray.ox !== last.ox || ray.oy !== last.oy || ray.oz !== last.oz || ray.dx !== last.dx || ray.dy !== last.dy || ray.dz !== last.dz || frame !== last.frame) {
          last.ox = ray.ox; last.oy = ray.oy; last.oz = ray.oz; last.dx = ray.dx; last.dy = ray.dy; last.dz = ray.dz; last.frame = frame;
          cast(ray);
        }
        return hit.owner === owner ? hit.t : NaN;
      }
    };
  };

  // What the room's own body is to the picker: in the way, and never anything to tap.
  const BODY = { kind: "body" };

  const TIPS = {
    exit: "Exit · press Space beside it to walk out",
    door: "The way out · use the Exit button",
    lockkey: "Room lock · walk up and press Space",
    chair: COARSE ? " · tap SIT beside it" : " · Space beside it sits"
  };
  // How close to a seat an Ooga reaches to sit in it (past its own body and the seat's) and how squarely the view
  // must face it (the cosine of the angle off), so Space between two seats still jumps.
  const SIT_REACH = 0.45, SIT_FACING = Math.cos(0.7), CHAIR_R = 0.48;

  // The visit. `shell` is the scene object the director knows (scene-timechain.js), `visit` what the shell resolved.
  const create = (shell, ctx, visit) => {
    const { renderer, game, world, go, canvas } = ctx;
    const room = ROOMS.get(visit.room), L = ROOMS.layout(room.id), shared = visit.mode === "shared", kind = RM.KINDS[room.kind];
    const camera = createCamera({ fov: 58, near: 0.12, far: L.R * 3 + 20 });
    const root = createNode();
    const hud = hudMod.create({ signal: ctx.signal, roster: contributors.activeRoster });
    const hooks = {};
    const input = interactMod.create({ canvas, renderer, camera, hooks });
    // A room the island's doorway prepared for this visit (`prepare`) is taken as it stands: built, painted and already
    // on the GPU, so arriving costs no build, no paint and no upload.
    const prepared = visit.prepared && visit.prepared.room.id === room.id && visit.prepared.built ? visit.prepared : null;
    if (visit.prepared && !prepared) visit.prepared.dispose();
    visit.prepared = null;
    const built = prepared ? prepared.built : RM.build(room.id);
    addChild(root, built.root);
    lightRoom(RENDER_OPTS, built);

    // Walking: inside the sphere, short of the closed doors and clear of the room's solids, some only for feet below
    // their tops; the doorway and the vestibule open to the guided walk alone.
    let guided = false;
    const solids = built.solids, tops = solids.filter((o) => o.top !== undefined);
    const walkable = (ax, az, bx, bz, y, height, actor) => {
      const r = actor && actor.bodyRadius || 0.35, steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
      for (let i = 1; i <= steps; i++) if (!ROOMS.clearAt(L, ax + (bx - ax) * i / steps, az + (bz - az) * i / steps, r, guided, y, solids)) return false;
      return true;
    };
    // What a body stands on: the floor (a raked hall's terrace), or a solid's top once its feet are within a step of
    // it, as far out as the solid stands in its way below, so stepping off the edge lands it clear.
    const groundAt = (x, z, feet, _, actor) => {
      let y = ROOMS.floorAt(L, x, z);
      const r = actor ? actor.bodyRadius : 0.35;
      for (let i = 0; i < tops.length; i++) {
        const o = tops[i];
        if (feet < o.top - ROOMS.STEP_UP || o.top <= y) continue;
        if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + r) y = o.top; continue; }
        // A box in its own turned frame, as clearAt reads it (timechain-rooms.js).
        const c = o.ry ? Math.cos(o.ry) : 1, s = o.ry ? Math.sin(o.ry) : 0, dx = x - o.x, dz = z - o.z;
        if (Math.abs(dx * c - dz * s) < o.hx + r && Math.abs(dx * s + dz * c) < o.hz + r) y = o.top;
      }
      return y;
    };
    // The island's shoulder pass (crew.js `shoulderStep`): walking into something taller than a step, the Ooga turns
    // a shoulder and slides round it rather than stopping dead. The nearest solid its body would meet along its line
    // within `reach`, as the solid's extents in the walker's frame (along the line, and across it to the right).
    const SHOULDER_SIDE = 0.315;
    const blocks = (o, feet) => !(o.top !== undefined && feet >= o.top - ROOMS.STEP_UP) && !(o.below !== undefined && feet + 1.8 <= o.below);
    const shoulderObstacle = (cave, fx, fz, reach, out) => {
      const p = cave.root.position, feet = p.y - cave.baseY, r = cave.bodyRadius;
      let best = reach;
      out.node = null;
      for (let i = 0; i < solids.length; i++) {
        const o = solids[i];
        if (!blocks(o, feet)) continue;
        const dx = o.x - p.x, dz = o.z - p.z, along = dx * fx + dz * fz, across = dx * fz - dz * fx;
        let a0, a1, c0, c1, hit;
        if (o.r !== undefined) {
          const reachR = o.r + r;
          if (Math.abs(across) >= reachR) continue;
          a0 = along - o.r; a1 = along + o.r; c0 = across - o.r; c1 = across + o.r;
          hit = along - Math.sqrt(reachR * reachR - across * across);
        } else {
          // Its corners: clearAt's turned frame (u across its x, v across its z) back into the world, then the walker's.
          const c = o.ry ? Math.cos(o.ry) : 1, s = o.ry ? Math.sin(o.ry) : 0;
          a0 = c0 = Infinity; a1 = c1 = -Infinity;
          for (let k = 0; k < 4; k++) {
            const u = k & 1 ? o.hx : -o.hx, v = k & 2 ? o.hz : -o.hz, wx = dx + u * c + v * s, wz = dz - u * s + v * c;
            const ka = wx * fx + wz * fz, kc = wx * fz - wz * fx;
            if (ka < a0) a0 = ka; if (ka > a1) a1 = ka; if (kc < c0) c0 = kc; if (kc > c1) c1 = kc;
          }
          if (c0 >= r || c1 <= -r) continue;
          hit = a0 - r;
        }
        if (hit < -r || hit > best) continue;
        // The crew sidesteps to a hub walker's width past either edge (SHOULDER_SIDE); a wider Ooga needs its own.
        const wide = Math.max(0, r - SHOULDER_SIDE);
        best = hit; out.node = o;
        out.minAlong = a0; out.maxAlong = a1; out.minAcross = out.minContactAcross = c0 - wide; out.maxAcross = out.maxContactAcross = c1 + wide;
      }
      if (!out.node) return false;
      // Only a pass that can be made, to one side (away from the solid's middle, as the crew takes it, `side` 1 to its
      // left edge and -1 to its right) or the other (a solid further on gets a pass of its own). When only the other side is open,
      // the solid's edge on the blocked side is reported further out, so its middle lies there and the crew goes the
      // open way (its sidestep reads only the open edge); when neither is, the Ooga stops at the solid as it always has
      // rather than wedge itself beside the next one.
      // The crew slants out as it closes, so it is beside the solid as it reaches it: the spot beside the solid's near
      // edge must be clear, and the way on from there past its far edge.
      const open = (side, past = 0.1) => {
        const across = side > 0 ? out.minAcross - SHOULDER_SIDE : out.maxAcross + SHOULDER_SIDE, near = Math.max(0, out.minAlong), on = out.maxAlong - near + past;
        const sx = p.x + fx * near + fz * across, sz = p.z + fz * near - fx * across;
        return walkable(sx, sz, sx, sz, feet, cave.bodyHeight, cave) && walkable(sx, sz, sx + fx * on, sz + fz * on, feet, cave.bodyHeight, cave);
      };
      const mid = (out.minAcross + out.maxAcross) / 2, natural = Math.abs(mid) < 0.02 ? 1 : Math.sign(mid);
      let side = natural;
      // Nearly head on, either way would do: take the one that stays clear further on.
      if (Math.abs(mid) < 0.25 && !open(side, 1.5) && open(-side, 1.5)) side = -side;
      if (!open(side)) {
        if (!open(-side)) { out.node = null; return false; }
        side = -side;
      }
      if (side !== natural) {
        if (natural > 0) out.minAcross = Math.min(out.minAcross, -out.maxAcross - 0.05);
        else out.maxAcross = Math.max(out.maxAcross, -out.minAcross + 0.05);
      }
      return true;
    };
    // The room's solids never move, and a pass lets go once the line past one is walkable.
    const shoulderObstacleActive = () => true;
    const shoulderPropClear = (cave, x, z) => {
      const p = cave.root.position;
      return walkable(p.x, p.z, x, z, p.y - cave.baseY, cave.bodyHeight, cave);
    };
    // Under the dome: the ceiling `margin` lower than it stands over (x, z), read that far further out too, so a
    // point keeps clear of the curve above. The vestibule's flat ceiling is the doorway's.
    const roof = (x, z, margin) => {
      if (z > L.doorZ) return DOOR.height - margin;
      const r = Math.hypot(x, z), k = r > 1e-6 ? (r + margin) / r : 1;
      return ROOMS.ceilingAt(L, x * k, z * k) - margin;
    };
    // A guided walk takes the view through the doorway into the vestibule; otherwise it stays inside the sphere.
    const corridor = (p) => guided && Math.abs(p.x) < DOOR.halfW - 0.2 && p.z > L.doorZ - 1;
    const clampTarget = (p) => {
      const r = Math.hypot(p.x, p.z), max = ROOMS.wallAt(L, Math.max(L.yMin, p.y - 1.6)) - 0.2;
      if (r > max && !corridor(p)) { p.x *= max / r; p.z *= max / r; }
      if (!guided) p.z = Math.min(p.z, L.doorZ - 0.3);
      p.y = clamp(p.y, ROOMS.floorAt(L, p.x, p.z) + 0.4, roof(p.x, p.z, 0.5));
    };
    // The eye stays inside the sphere, over the floor and short of the doors. The floor and the dome meet the wall (in
    // the theater at a shallow angle, its sphere's middle under the landing), so the eye is pulled in from the wall at
    // its height, then put between the floor and the dome over where it stands, and where they leave it no room it is
    // pulled further in, until it is inside all three.
    const clampCamera = (p) => {
      const x = p.x, y = p.y, z = p.z;
      if (!guided || Math.abs(p.x) > DOOR.halfW - 0.2) p.z = Math.min(p.z, L.doorZ - 0.2);
      else p.z = Math.min(p.z, L.doorZ + DOOR.vestibule - 0.3);
      const walled = !corridor(p), R = L.R - 0.3;
      for (let pass = 0; pass < 8; pass++) {
        if (walled) {
          const dy = clamp(p.y - L.c, -R + 0.1, R - 0.1), max = Math.sqrt(R * R - dy * dy), r = Math.hypot(p.x, p.z);
          if (r > max) { p.x *= max / r; p.z *= max / r; }
        }
        const lo = ROOMS.floorAt(L, p.x, p.z) + 0.3, hi = roof(p.x, p.z, 0.3);
        if (lo <= hi) { p.y = clamp(p.y, lo, hi); if (!walled || Math.hypot(p.x, p.y - L.c, p.z) <= R + 1e-9) break; continue; }
        const r = Math.hypot(p.x, p.z), k = r > 0.25 ? (r - 0.25) / r : 0;
        p.x *= k; p.z *= k; p.y = lo;
      }
      return p.x !== x || p.y !== y || p.z !== z;
    };
    const keepCameraInside = () => {
      const p = camera.position, x = p.x, y = p.y, z = p.z;
      if (!clampCamera(p)) return;
      // Orbit solvers and acquisition blends can move the eye after collision. Keep their look direction at the wall.
      camera.target.x += p.x - x; camera.target.y += p.y - y; camera.target.z += p.z - z;
    };
    const view = { yaw: 0, pitch: 0.05, dist: 4, target: { x: L.arrival.x, y: 1.6, z: L.arrival.z } };
    const pilot = pilotMod.create({
      renderer, canvas, camera, hud, presets: { entrance: view }, landing: "entrance", pitch: [-0.2, 1.2], dist: [3, 8],
      follow: { y: 0.9, min: 3, max: 6, pitch: [0.2, 0.7] },
      clampTarget, clampCamera, observeOrbit: keepCameraInside, ceilingAt: (x, z) => roof(x, z, 0), coarse: COARSE, mayPossess: (cave) => BL.net.mayDrive(cave.traits.name),
      jetpackStatus: () => NO_JETPACK,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt }
    });
    const fx = fxMod.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 4, z: 0 } });
    const targets = [];
    const target = (node, owner, radius = 0) => { input.add(node, owner, { radius }); targets.push(node); return owner; };

    // The room's live pictures, each a slot repainted through its key (what it would print), never by callback, from
    // what the scene reads: mempool.space's blocks and mining, and the six holdings readings the desk shows one of.
    const reader = BL.timechainBlocks.create();
    const holdingsCanvases = BL.timechainData.TITLES.map(() => CH.canvas(CH.PANEL_W, CH.PANEL_H));
    const holdingsKeys = holdingsCanvases.map(() => "");
    const feeds = { reader, holdingsCanvases, holdingsKeys, holdingsIndex: 0 };
    const all = built.live.map((live, i) => slot(L, live, prepared && prepared.slots[i]));
    // The charts' close-up pages through every live picture that names the charts' board.
    const charts = all.filter((s) => s.spec.board === "charts" && s.spec.panel !== undefined);
    // A room whose targets name their meshes (`pick`, true for the target's own node) is picked where things are drawn
    // (`sharpPicker`): those meshes, its live pictures and its body in their way.
    const sharp = built.targets.some((t) => t.pick) ? sharpPicker() : null;
    all.forEach((s) => {
      if (!s.spec.tip && !s.spec.board) return;
      const owner = target(s.node, { kind: "live", slot: s, tip: s.spec.tip || "" });
      if (sharp) { sharp.add(s.node, owner); owner.pickRay = sharp.pickRay(owner); } else owner.pickRay = facePick(s.node);
    });
    let holdingsVersion = 0, chartIndex = 0, chartVersion = 0;
    const holdings = BL.timechainData.create(() => { holdingsDirty = true; });
    let holdingsDirty = true;
    // The kind's own targets (its furniture and exhibits) and the doorway's.
    for (const t of built.targets) {
      const owner = target(t.node, { kind: t.kind, tip: t.tip, index: t.index, data: t.data }, t.radius);
      if (!t.pick) continue;
      for (const name of t.pick === true ? [""] : t.pick) sharp.add(name ? built.nodes[name] : t.node, owner);
      owner.pickRay = sharp.pickRay(owner);
    }
    if (sharp && built.body) sharp.add(built.body, BODY);
    target(built.exitButton, { kind: "exit" }, 0.45);
    for (const leaf of built.doors) target(leaf, { kind: "door" }, 1.6);
    // Each of the room's seats takes the visitor's Ooga, facing the way it faces; standing up leaves it behind it.
    const seats = built.seats;

    // Slots are looked at only after a reading, a new second (the ages printed) or a new holdings page: `sweep` runs
    // until no key moved, so a quiet frame builds no key and paints nothing.
    let seenVersion = -1, seenSecond = -1, paintAt = 0, sweep = true;
    // At most one picture a frame; rotate so a slow frame rate cannot starve the cards behind ticking charts.
    const paintNext = () => {
      if (!all.length) return;
      const now = Date.now(), second = Math.floor(now / 1000);
      if (reader.version !== seenVersion || second !== seenSecond || holdingsDirty) { seenVersion = reader.version; seenSecond = second; sweep = true; }
      if (!sweep) return;
      if (holdingsDirty) {
        holdingsDirty = false;
        holdings.boards.forEach((board, i) => {
          const k = `${board.status}|${board.asof}|${board.lines.join("|")}`;
          if (k === holdingsKeys[i]) return;
          holdingsKeys[i] = k;
          CH.holdings(holdingsCanvases[i].getContext("2d"), board);
          holdingsVersion++;
        });
      }
      for (let n = 0; n < all.length; n++) {
        const i = (paintAt + n) % all.length, s = all[i], k = s.spec.key(feeds, now);
        if (k === s.key) continue;
        s.key = k;
        s.spec.paint(s.canvas.getContext("2d"), feeds, now);
        if (s.spec.panel !== undefined) chartVersion++;
        hang(renderer, s);
        paintAt = (i + 1) % all.length;
        return;
      }
      sweep = false;
    };
    const chartBoard = {
      title: "Timechain Sphere", help: "Live block and mining charts, drawn here from mempool.space's public API. Arrow keys flip the charts.", wide: true,
      get canvas() { return charts[chartIndex].canvas; }, get count() { return charts.length; }, get index() { return chartIndex; },
      get caption() { return CH.PANELS[charts[chartIndex].spec.panel].title; }, get note() { return CH.PANELS[charts[chartIndex].spec.panel].note; }, get version() { return chartVersion; },
      go: (i) => { chartIndex = i; chartVersion++; }
    };
    const holdingsBoard = {
      title: "Holdings desk", help: "Timechain Index holdings and distributions. Arrow keys flip the readings.", wide: true,
      get canvas() { return holdingsCanvases[feeds.holdingsIndex]; }, get count() { return holdingsCanvases.length; }, get index() { return feeds.holdingsIndex; },
      get caption() { return BL.timechainData.TITLES[feeds.holdingsIndex]; },
      get note() { const b = holdings.boards[feeds.holdingsIndex]; return `${b.note ? b.note + "\n" : ""}Source: ${b.source}`; },
      get version() { return holdingsVersion; },
      go: (i) => { feeds.holdingsIndex = i; holdingsVersion++; sweep = true; }
    };
    // A kind's own moving parts, driven every frame from its nodes (timechain-room-*.js `animate`), its taps, and
    // what it lets go of on leaving (`dispose`, the Block Party's radio). `built.ear` is where the visitor hears from
    // (their Ooga, else the view's target), kept current every frame for a kind's sounds.
    const ear = built.ear = { x: 0, y: 0, z: 0 };
    const motion = kind.animate ? kind.animate(built.nodes, built) : null;

    const NO_ACTORS = [], actors = [];

    // The visitor's Ooga: the one handed over, else the visit's, else `character=` on a page that opens here, else
    // their own or assigned one (`preferredCharacter`), else the roster's first they may drive.
    const mayPick = (entry) => !BL.net.mayDrive(entry.name);
    const asked = ctx.from === null ? new URLSearchParams(location.search).get("character")?.trim().toLowerCase() : null;
    const own = BL.net.preferredCharacter();
    const wanted = [visit.character, world.pilot, asked && contributors.roster.find((c) => c.name.toLowerCase() === asked)?.name, own && own.handle];
    let playerName = null;
    for (const name of wanted) {
      const entry = name && contributors.roster.find((c) => c.name === name);
      if (entry && mayPick(entry)) { playerName = entry.name; break; }
    }
    if (!playerName) playerName = contributors.activeRoster.find(mayPick)?.name || null;
    world.pilot = null;
    const playerWorld = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    let remotes = null, people = null, avatar = null;
    const outsideActors = () => {
      actors.length = 0;
      if (remotes) { const list = remotes.actors(); for (let i = 0; i < list.length; i++) actors.push(list[i]); }
      return actors.length ? actors : NO_ACTORS;
    };
    // Space beside the Exit button walks out, beside a free chair and facing it (standing on the floor) sits in it;
    // anywhere else it jumps. Seated, Space or a step stands up (the crew's own).
    const nearExit = () => {
      if (!avatar) return false;
      const p = avatar.root.position, E = L.exitButton;
      return Math.hypot(p.x - E.x, p.z - E.z) < L.exitReach;
    };
    // A free seat beside the Ooga and in front of the view, on the floor the Ooga stands on (a raked hall's own row).
    const nearChair = () => {
      if (!avatar || avatar.camp.seat || avatar.hop > 0) return null;
      const p = avatar.root.position, feet = p.y - avatar.baseY, c = camera.position, t = camera.target, fx = t.x - c.x, fz = t.z - c.z, f = Math.hypot(fx, fz) || 1;
      let near = null, best = CHAIR_R + avatar.bodyRadius + SIT_REACH;
      for (const s of seats) {
        const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
        if (!s.sitter && Math.abs(feet - s.floor) < 0.25 && d < best && (dx * fx + dz * fz) / (d * f) > SIT_FACING) { near = s; best = d; }
      }
      return near;
    };
    // The Conference Room's lock, shared visits only: Space beside its keypad takes the view and the keys. Four digits and LOCK lock the
    // room (`net.lockRoom`); UNLOCK opens it for anyone inside, and it opens by itself once nobody is inside. Locked, the
    // keypad shows its PIN to whoever is using it (`net.state.roomPin`, which the room tells only those inside).
    const lockPad = built.lockPad, LOCK_ANSWER = 4, LOCK_NOTE = 1.4, LOCKED_RED = "#ff4a3d";
    let pinShown = "", pinWords = "";
    const pinLine = () => {
      const pin = BL.net.state.roomPinRoom === room.id ? BL.net.state.roomPin : "";
      if (pin !== pinShown) { pinShown = pin; pinWords = pin ? `PIN ${pin}` : ""; }
      return pinWords;
    };
    const DOTS = ["", "*", "**", "***", "****"], lock = { on: false, digits: "", sent: 0, note: "", noteLeft: 0, locked: false, hidden: false, ease: 1, from: { x: 0, y: 0, z: 0 }, fromLook: { x: 0, y: 0, z: 0 } };
    const isLocked = () => room.lockable && shared && !!BL.net.state.lockedRooms[room.id];
    const nearLock = () => {
      if (!lockPad || !avatar || avatar.camp.seat) return false;
      const p = avatar.root.position;
      return Math.hypot(p.x - L.lockPad.x, p.z - L.lockPad.z) < L.lockReach;
    };
    const lockNote = (words) => { lock.note = words; lock.noteLeft = LOCK_NOTE; };
    const lockLetGo = () => {
      if (!lock.on) return;
      lock.on = false; lock.digits = ""; lock.sent = 0;
      if (avatar) avatar.root.cameraHidden = lock.hidden;
      pilot.setExternalControl(false);
      hud.el.act.hidden = !avatar;
      pilot.showAct();
      // Combat's mouse-look comes back as it does when a menu closes (pilot.js `setMenuOpen`).
      pilot.focusAim(!!navigator.userActivation?.isActive);
    };
    const lockEngage = () => {
      if (!lockPad || lock.on || !avatar || guide.stage) return false;
      if (!shared) { hud.toast("A solo copy is yours alone: nobody else can come in"); return true; }
      if (!BL.net.state.roomLocks) { hud.toast("This room can't be locked just now"); return true; }
      lock.on = true; lock.digits = ""; lock.sent = 0; lock.noteLeft = 0; lock.ease = 0;
      people.steer(0, 0, 0, 0, 0);
      pilot.setExternalControl(true);
      if (document.pointerLockElement) document.exitPointerLock();
      hud.el.act.hidden = true;
      hud.tooltip.hide();
      // The view stands in front of the pad, where the visitor's own Ooga would only be in the way of the keys, to the
      // eye and to the picks. Its head alone is the pilot's to hide in first person, so the whole Ooga goes instead.
      lock.hidden = avatar.root.cameraHidden;
      avatar.root.cameraHidden = true;
      const c = camera.position, t = camera.target;
      lock.from.x = c.x; lock.from.y = c.y; lock.from.z = c.z;
      lock.fromLook.x = t.x; lock.fromLook.y = t.y; lock.fromLook.z = t.z;
      const pin = isLocked() && pinLine();
      hud.hint(isLocked() ? `${pin ? `${pin} · ` : ""}Press UNLOCK to open the room · move or Esc to step back` : "Type a 4-digit PIN, then press LOCK · move or Esc to step back", 7000);
      return true;
    };
    const lockSend = () => {
      if (isLocked() ? BL.net.unlockRoom(room.id) : BL.net.lockRoom(room.id, lock.digits)) lock.sent = LOCK_ANSWER;
      else { lock.digits = ""; lockNote("NO SIGNAL"); }
    };
    const lockPress = (key) => {
      if (!lock.on || lock.sent) return;
      if (key === "back") {
        if (lock.digits) lock.digits = lock.digits.slice(0, -1);
        else lockLetGo();
      } else if (key === "enter") {
        if (isLocked() || lock.digits.length === 4) lockSend();
      } else if (/^[0-9]$/.test(key) && !isLocked() && lock.digits.length < 4) lock.digits += key;
    };
    // A step steps back from the keypad, as from any look (pilot.js), and goes on to the Ooga, unless an answer is due.
    const LOCK_STEPS = new Set(BL.controls.keysFor("forward", "back", "left", "right"));
    const lockKeys = (e) => {
      if (!lock.on || e.metaKey || e.ctrlKey || e.altKey || e.target && e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
      if (!lock.sent && LOCK_STEPS.has(e.key.toLowerCase())) { lockLetGo(); return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (/^[0-9]$/.test(e.key)) lockPress(e.key);
      else if (e.key === "Backspace") lockPress("back");
      else if (e.key === "Enter") lockPress("enter");
      else if (e.key === "Escape" && !lock.sent) lockLetGo();
    };
    window.addEventListener("keydown", lockKeys, { capture: true, signal: ctx.signal });
    // While the keypad has the keys the view stands square in front of it, gliding there and held; everything else follows
    // from the room's own word on the lock.
    const LOCK_EYE = 0.82, LOCK_GLIDE = 0.35;
    const lockUpdate = (dt) => {
      if (!lockPad) return;
      lock.noteLeft = Math.max(0, lock.noteLeft - dt);
      if (lock.sent > 0 && (lock.sent -= dt) <= 0) { lock.digits = ""; lockNote("NO ANSWER"); }
      const locked = isLocked();
      if (locked !== lock.locked) {
        lock.locked = locked;
        hud.toast(locked ? `${room.name} is locked · players outside need its PIN` : `${room.name} is unlocked`);
      }
      built.lockSign.visible = locked && doors.open < 0.05;
      const words = lock.noteLeft > 0 ? lock.note : locked ? lock.on && pinLine() || "LOCKED" : lock.on ? lock.digits ? DOTS[lock.digits.length] : "SET 4-DIGIT PIN" : !shared ? "SOLO" : "UNLOCKED";
      lockPad.say(words, locked ? LOCKED_RED : undefined);
      lockPad.actAs(locked ? "UNLOCK" : "LOCK", locked || lock.digits.length === 4);
      lockPad.tick(dt);
      if (!lock.on) return;
      lock.ease = Math.min(1, lock.ease + dt / LOCK_GLIDE);
      const e = lock.ease * lock.ease * (3 - 2 * lock.ease), P = L.lockPad, eyeZ = P.z - LOCK_EYE;
      camera.position.x = lock.from.x + (P.x - lock.from.x) * e;
      camera.position.y = lock.from.y + (P.y - lock.from.y) * e;
      camera.position.z = lock.from.z + (eyeZ - lock.from.z) * e;
      camera.target.x = lock.fromLook.x + (P.x - lock.fromLook.x) * e;
      camera.target.y = lock.fromLook.y + (P.y - lock.fromLook.y) * e;
      camera.target.z = lock.fromLook.z + (P.z - lock.fromLook.z) * e;
      camera.up = null;
    };
    const lockHeard = (event) => {
      if (event.op !== "lock-result" || event.room !== room.id || !lock.sent) return;
      lock.sent = 0; lock.digits = "";
      // Done, the view goes straight back to the Ooga; the keypad's window and a toast say what changed.
      if (event.ok) lockLetGo();
      else lockNote(event.reason === "already-locked" ? "LOCKED" : "TRY AGAIN");
    };
    // Over the door leaves' broad pick spheres, which reach across the pad from where its view stands, and over the
    // Ooga's own (priority 1), as the island keypad's keys are (scene-hub.js).
    if (lockPad) for (const key of lockPad.keys) target(key.node, { kind: "lockkey", key: key.key, priority: 2 }, key.key.length === 1 ? 0.055 : 0.09);
    // A kind's own Space action where the Ooga stands and looks (the Temple's bell, gong and bowl): `motion.near(x, z,
    // fx, fz)` names one, `{ key, label, hint, tap, run(hud) }`, or null.
    const kindNear = () => {
      if (!motion || !motion.near || !avatar || avatar.camp.seat || avatar.hop > 0) return null;
      const p = avatar.root.position, c = camera.position, t = camera.target;
      return motion.near(p.x, p.z, t.x - c.x, t.z - c.z);
    };
    const useNear = () => {
      if (guide.stage) return false;
      if (nearExit()) { walkOut(); return true; }
      if (nearLock()) return lockEngage();
      const chair = nearChair();
      if (chair) return people.sitPlayer(chair);
      const action = kindNear();
      if (!action) return false;
      action.run(hud);
      return true;
    };
    if (playerName) {
      const sharedCtx = { root, input, hud, game, world: playerWorld, playerName, fx, viewYaw: 0, outsideActors, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt, walkable, useNear, jetpackAllowed: () => false,
        shoulderObstacle, shoulderObstacleActive, shoulderPropClear };
      people = sharedCtx.crew = BL.crew.create(sharedCtx);
      pilot.bind(sharedCtx);
      avatar = people.cavemen.get(playerName);
      // This visit owns a separate weapon map: leave both weapons outside, along with any jetpack.
      avatar.weapon.primaryOwned = avatar.weapon.secondaryOwned = false;
      people.selectWeapon(0, avatar);
      avatar.weapon.aiming = false;
      avatar.parts.club.visible = avatar.parts.gun.visible = false;
      if (avatar.jet) people.removeJetpack(avatar);
      avatar.root.position.y = avatar.baseY;
      pilot.possess(avatar);
      pilot.enterClose();
    }
    // In the room, as the visit has it: a guided arrival from the vestibule, or (a reload, a link, a history step)
    // standing at the arrival facing the screens.
    const arrive = (at, yaw = 0, pitch = 0.04) => pilot.navigate({ position: { x: at.x, y: 0, z: at.z }, yaw, pitch, dist: 4 });
    const guide = { stage: visit.guided && avatar ? "arrive" : null, t: 0, hold: 0, quick: false };
    const doors = { open: guide.stage ? 1 : 0, want: guide.stage ? 1 : 0, until: 0 };
    const eyeForward = (cave, pitch) => 0.16 * cave.traits.height * Math.cos(pitch);
    // Guided, the doorway and vestibule are walkable for the arrival, before it is placed in them.
    if (guide.stage) guided = true;
    if (avatar) {
      const e = guide.stage && visit.entry;
      // Handed over mid-stride by the island: the same eye, heading and pitch it last drew, in the vestibule facing the
      // room through the open doors (`entry`, offset as the island's eye stood from its handover point), so the
      // crossing has no cut. A reload or a link lands at the old spots.
      if (e) arrive({ x: e.x + Math.sin(e.heading) * eyeForward(avatar, e.pitch), z: L.entry.z + e.dz + Math.cos(e.heading) * eyeForward(avatar, e.pitch) }, e.heading, -e.pitch);
      else arrive(guide.stage ? L.threshold : L.arrival);
    }
    keepCameraInside();
    // The island's view back out of its passage (taken there before this crossing), hung at the vestibule's far end so
    // the walk out sees it fill the view as it reaches the handover point; without one, the hand over is between two
    // dark corridors.
    const outView = world.sphereOutView;
    let exitEye = L.doorZ + 1;
    if (avatar && outView) {
      const eye = avatar.headOffset * 0.95 + avatar.viewLift, q = ROOMS.fill(outView.fov, outView.aspect, eye, 2 * DOOR.halfW, 0, DOOR.height, DOOR.vestibule - 0.63);
      const node = createNode({ geometry: RM.picture(outView.canvas, outView.canvas.width, outView.canvas.height, q.w, q.h), position: { x: 0, y: eye, z: L.veil }, rotation: { x: 0, y: Math.PI, z: 0 } });
      addChild(root, node);
      exitEye = L.veil - q.D;
    }
    if (guide.stage) pilot.setActive(false);
    // Presence: a shared room is its own zone, published once the Ooga stands in it, and a guided arrival opens the
    // doors for whoever is already here; a solo copy publishes nothing at all.
    if (shared) {
      BL.net.setBody(avatar ? avatar.traits.name : null);
      if (avatar) {
        const p = avatar.root.position;
        BL.net.sendPose(p.x, p.y - avatar.baseY, p.z, avatar.root.rotation.y, null, 0, 0, BL.crew.visualState(avatar));
      }
      BL.net.setZone(room.zone);
      if (guide.stage) BL.net.passDoor(room.zone, "in");
    } else { BL.net.setBody(null); BL.net.setZone("none"); }
    remotes = shared ? BL.remotePlayers.create({ root, crew: people, fx,
      posed: (cave) => { cave.parts.club.visible = cave.parts.gun.visible = false; }
    }) : null;
    const footsteps = BL.footsteps.create();
    const sound = ambience(room, ctx.signal);
    // Another player crossing this room's own doorway opens its doors here too (net.js `subscribeDoor`).
    const unsubscribeDoor = shared ? BL.net.subscribeDoor((event) => {
      if (event.op === "denied" && event.reason === "locked") {
        hud.toast(`${room.name} is locked from inside`);
        handOff();
        return;
      }
      lockHeard(event);
      if (event.t !== "transit" || event.door !== room.zone) return;
      doors.until = Math.max(doors.until, performance.now() + Math.max(0, Math.min(8000, event.exp - BL.net.serverNow())));
    }) : null;
    let leaving = false;
    // Leaving: the same Ooga goes back out to the island's passage behind the sphere's doors.
    const exitNote = (signedOut) => ({ room: room.id, mode: signedOut ? "solo" : visit.mode, character: avatar ? avatar.traits.name : null, jetpack: visit.jetpack || null });
    // The view and mode the room was in when the visitor pressed Exit, which the island gives back once the walk out
    // is done.
    let exitView = null;
    // A walked-out exit hands over mid-stride without the fade, with where its eye stood from the handover point
    // (`pose`), so the island starts from the same view; any other way out (signed out, Leave far from the doors)
    // fades as before. Under the `release` hub policy the island is built again on the way out, so that build happens
    // behind the fade too rather than freezing the room's last frame.
    const handOff = (signedOut = false, pose = null) => {
      if (leaving) return;
      world.sphereExit = { ...exitNote(signedOut), pose, view: pose ? exitView : null };
      world.pilot = avatar ? avatar.traits.name : null;
      BL.net.setBody(null);
      BL.net.setZone("none");
      leaving = go("hub", "timechain", !!pose && ctx.hubPolicy === "keep");
      if (!leaving) world.sphereExit = null;
    };
    // A way out the island could not be built for (the director's `stay`): back in the room with the walk-out undone, so
    // Space at the button can try again.
    const stay = () => {
      leaving = false;
      world.sphereExit = null;
      if (shared) BL.net.setZone(room.zone);
      if (guide.stage) {
        // The vestibule is walkable only while guided: return inside before closing the doors and giving control back.
        arrive(L.doorStep);
        doors.want = 0;
        finishGuide();
      }
    };
    const exitPose = () => {
      const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      return { x: p.x, dz: p.z - exitEye, heading: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    };
    // Space at the button: turn to the doorway, the doors part, walk through into the vestibule, then the island.
    const walkOut = () => {
      if (guide.stage || leaving) return;
      if (!avatar || !nearExit() && Math.hypot(avatar.root.position.x - L.doorStep.x, avatar.root.position.z - L.doorStep.z) > 3) { handOff(); return; }
      // The doorway hands the island an eye pose, even when the room was explored in orbit or detached.
      if (pilot.player !== avatar && !pilot.possess(avatar)) return;
      exitView = pilot.viewState();
      pilot.enterClose();
      guide.stage = "toDoor"; guide.t = 0;
      guided = true;
      pilot.setActive(false);
      hud.tooltip.hide();
      if (shared) BL.net.passDoor(room.zone, "out");
    };
    const accountChanged = () => {
      if (shared && !BL.net.state.me && !leaving) {
        hud.toast("Signed out · back outside");
        handOff(true);
      }
    };
    const unsubscribeAccount = BL.net.subscribe(accountChanged);
    // Weapon shortcuts do nothing in here (a dialog, such as the model viewer, keeps its own keys); right-click and
    // scroll keep the pilot's camera controls.
    const WEAPON_KEYS = new Set(["1", "2", "r", "f", "g"]);
    const armsKeys = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !WEAPON_KEYS.has(e.key.toLowerCase()) || e.target && e.target.closest && e.target.closest("input, textarea, [contenteditable], dialog")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", armsKeys, { capture: true, signal: ctx.signal });

    const tipFor = (hit) => {
      const o = hit.owner;
      return o.kind === "chair" ? `${o.tip}${TIPS.chair}` : o.tip || TIPS[o.kind] || "";
    };
    // The ray under a tap, handed to a kind's own tap so it can tell where on a thing the tap fell (the Temple's koi pond).
    const tapRay = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    Object.assign(hooks, {
      onHover: (hit, p) => { if (hit && !guide.stage && !lock.on) hud.tooltip.show(tipFor(hit), p.x, p.y); else hud.tooltip.hide(); },
      onHoverMove: (hit, p) => { if (!guide.stage && !lock.on) hud.tooltip.show(tipFor(hit), p.x, p.y); },
      onTap: (hit, p) => {
        if (!hit || guide.stage) return;
        const o = hit.owner;
        if (o.kind === "exit") { if (nearExit()) walkOut(); else hud.toast("Walk up to the Exit button, then press it"); }
        else if (o.kind === "lockkey") {
          if (lock.on) lockPress(o.key);
          else if (!nearLock()) hud.toast("Walk up to the keypad, then press Space");
          else { lockEngage(); lockPress(o.key); }
        }
        else if (o.kind === "live" && o.slot.spec.board === "charts" && charts.length) {
          // A chart opens on itself; a card on the last 144 blocks.
          const own = charts.indexOf(o.slot);
          chartIndex = own >= 0 ? own : Math.max(0, charts.findIndex((c) => CH.PANELS[c.spec.panel].id === "window"));
          chartVersion++; hud.openBoard(chartBoard);
        } else if (o.kind === "terminal" || o.kind === "live" && o.slot.spec.board === "holdings") { holdingsVersion++; hud.openBoard(holdingsBoard); }
        else if (o.kind === "door") hud.toast(COARSE ? "Tap EXIT beside the doors to walk out" : "Press Space at the Exit button to walk out");
        else if (o.kind === "chair") {
          const s = seats[o.index], p = avatar && avatar.root.position;
          if (!p || !s || s.sitter || nearChair() !== s || !people.sitPlayer(s)) hud.toast(COARSE ? "Walk up to a free seat, then tap SIT" : "Walk up to a free seat and press Space to sit");
        } else if (o.kind === "table") hud.toast(`${room.name} · ${shared ? "shared with whoever chose it" : "a solo copy, just for you"}`);
        else if (motion && motion.tap && motion.tap(o, hud, p ? (renderer.ray(p.x, p.y, camera, tapRay), tapRay) : null)) return;
        else if (o.data && o.data.say) hud.toast(o.data.say);
      },
      ...pilot.hooks,
      // A key pressed twice quickly is pressed twice (a PIN may repeat a digit), never a double tap.
      onDoubleTap: (hit, p) => { if (hit && hit.owner.kind === "lockkey") hooks.onTap(hit, p); else pilot.hooks.onDoubleTap(hit, p); },
      onZoom: (factor, gesture, px, py) => { if (!guide.stage) pilot.hooks.onZoom(factor, gesture, px, py); }
    });
    hud.onAction((action) => {
      if (action === "leave") walkOut();
      else if (action === "reset-view" && !guide.stage) pilot.resetCamera();
      else if (action === "jetpack-toggle") hud.toast("No jetpacks in the Sphere");
      else if (action.startsWith("mode-") && !guide.stage) pilot.modeAction(action);
    });
    // The room's name under the banner's title; nothing beside its buttons.
    const subtitle = document.getElementById("sphere-subtitle");
    if (subtitle) subtitle.textContent = `TCS · ${room.name}`;
    if (guide.stage) hud.hint(`Entering ${room.name}`, 5000);

    // The guided walks, steered as a held stick would steer them; the view turns with the walk, its pitch easing to
    // `pitch` (level on the way out, so the island's view, hung level, lines up).
    const steerTo = (x, z, dt, pitch = 0.04) => {
      const p = avatar.root.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), o = pilot.orbit, k = Math.min(1, dt * TURN_RATE);
      o.pitch = o.tPitch = o.pitch + (pitch - o.pitch) * k;
      if (d < 0.12) { people.steer(0, 0, 0, 0, 0); return true; }
      people.steer(dx / d, dz / d, 0, 1, 0, WALK_SPEED);
      const yaw = Math.atan2(-dx, -dz);
      o.yaw = o.tYaw = o.yaw + Math.atan2(Math.sin(yaw - o.yaw), Math.cos(yaw - o.yaw)) * k;
      return false;
    };
    // Square to the doors and level, the view with the body.
    const faceDoor = (dt) => {
      const o = pilot.orbit, k = Math.min(1, dt * TURN_RATE), r = avatar.root.rotation;
      o.yaw = o.tYaw = o.yaw + Math.atan2(Math.sin(Math.PI - o.yaw), Math.cos(Math.PI - o.yaw)) * k;
      o.pitch = o.tPitch = o.pitch * (1 - k);
      r.y += Math.atan2(Math.sin(-r.y), Math.cos(-r.y)) * k;
    };
    const finishGuide = () => {
      guide.stage = null;
      guided = false;
      people.steer(0, 0, 0, 0, 0);
      pilot.setActive(true);
    };
    const runGuide = (dt) => {
      guide.t += dt;
      const p = avatar.root.position;
      if (guide.stage === "arrive") {
        if (p.z < L.doorZ - 0.9) doors.want = 0;
        if (steerTo(L.arrival.x, L.arrival.z, dt) || guide.t > GUIDE_LIMIT) {
          if (guide.t > GUIDE_LIMIT) arrive(L.arrival);
          doors.want = 0;
          finishGuide();
          // In, the view and mode the visitor walked up to the keypad in (first person and carry only for the walk).
          if (visit.view) pilot.adopt(visit.view);
        }
      } else if (guide.stage === "toDoor") {
        if (steerTo(L.doorStep.x, L.doorStep.z, dt) || guide.t > GUIDE_LIMIT) { guide.stage = "open"; guide.t = 0; doors.want = 1; }
      } else if (guide.stage === "open") {
        faceDoor(dt);
        if (doors.open >= 0.85) { guide.stage = "through"; guide.t = 0; guide.hold = 0; }
      } else if (guide.stage === "through") {
        // Straight on through the doors into the vestibule, to where the island's view fills the eye, and still there a
        // moment: the island builds itself on a frame that does not move, then walks on from the same view.
        if (camera.position.z < exitEye && guide.t < GUIDE_LIMIT) steerTo(0, L.veil, dt, 0);
        else {
          people.steer(0, 0, 0, 0, 0);
          if ((guide.hold += dt) > EXIT_HOLD) { guide.stage = "out"; handOff(false, exitPose()); }
        }
      } else if (guide.stage === "out") people.steer(0, 0, 0, 0, 0);
    };
    const update = (dt, elapsed) => {
      pilot.readInput(dt);
      if (guide.stage && avatar) runGuide(dt);
      if (people) people.update(dt, elapsed);
      pilot.update(dt);
      keepCameraInside();
      // The doors: open for a guided walk or another player's crossing here, closed otherwise.
      const want = Math.max(doors.want, performance.now() < doors.until ? 1 : 0);
      const step = REDUCED.matches ? 1 : dt / DOOR_TIME;
      doors.open = doors.open < want ? Math.min(want, doors.open + step) : Math.max(want, doors.open - step);
      const slide = doors.open * doors.open * (3 - 2 * doors.open) * DOOR.halfW;
      built.doors[0].position.x = -DOOR.halfW / 2 - slide;
      built.doors[1].position.x = DOOR.halfW / 2 + slide;
      // A shared room hears and shows whoever drives an Ooga in it; a solo copy reports nothing.
      const driven = people && people.player;
      if (shared && !leaving) {
        BL.net.setBody(driven ? driven.traits.name : null);
        if (driven) {
          const p = driven.root.position;
          BL.net.sendPose(p.x, p.y - driven.baseY, p.z, driven.root.rotation.y, null, 0, 0, BL.crew.visualState(driven));
          BL.net.setHealth(driven.health.value, driven.health.stunned);
        }
      }
      if (remotes) remotes.update(dt);
      footsteps.update(driven);
      lockUpdate(dt);
      if (avatar && !guide.stage) {
        let action = null;
        const near = lock.on ? null : avatar.camp.seat ? "stand" : nearExit() ? "exit" : nearLock() ? "lock" : nearChair() ? "sit" : (action = kindNear()) ? action.key : null;
        if (near !== guide.near) {
          guide.near = near;
          if (near === "exit") { hud.setAct("EXIT"); hud.hint(COARSE ? "Tap EXIT to walk out" : "Space · Exit"); }
          else if (near === "lock") { hud.setAct(isLocked() ? "UNLOCK" : "LOCK"); hud.hint(COARSE ? "Tap to use the room's lock" : isLocked() ? "Space · Unlock the room" : "Space · Lock the room"); }
          else if (near === "sit") { hud.setAct("SIT"); hud.hint(COARSE ? "Tap SIT to take the chair" : "Space · Sit"); }
          else if (near === "stand") { hud.setAct("STAND UP!"); hud.hint(COARSE ? "Move or tap STAND UP! to get up" : "Move or press Space to stand up"); }
          else if (action) { hud.setAct(action.label); hud.hint(COARSE ? action.tap : action.hint); }
          else pilot.showAct();
        }
      }
      paintNext();
      const heard = avatar ? avatar.root.position : camera.target;
      ear.x = heard.x; ear.y = heard.y; ear.z = heard.z;
      if (motion) motion.update(dt, elapsed);
      if (sharp) sharp.tick();
      stepTweens(dt);
      fx.update(dt, elapsed);
    };
    const drawExtra = (ctx2d, project) => { if (remotes) remotes.drawNames(ctx2d, project); };
    const overlay = (dt) => fx.drawOverlay(dt, drawExtra);
    const onKey = (e) => {
      if (BL.controls.matches(e, "resetView") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !guide.stage) return pilot.resetCamera();
      if (e.key.toLowerCase() === "x" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !guide.stage) {
        e.preventDefault();
        return pilot.modeAction("mode-toggle");
      }
      if (BL.controls.matches(e, "escape")) {
        if (!guide.stage && !pilot.escape()) walkOut();
        return true;
      }
      return false;
    };
    const onDonation = (donation, counted = null) => {
      game.recordDonation(donation, counted && counted.exact);
      world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
      hud.toast(`${donation.handle || "anon"} tipped ${BL.game.formatLarge(donation.sats)} sats · the island's pile grows`);
    };
    reader.start();
    holdings.start();

    shell.controlsHelp = touch => {
      const help = pilot.controlsHelp(touch);
      // The room intercepts these bindings before the pilot, including R/F in
      // free-camera mode. Keep its reference under the same input policy.
      help.rows = help.rows.flatMap(row => {
        const keys = row.keys.filter(key => !WEAPON_KEYS.has(key));
        return row.keys.length && !keys.length ? [] : [{ ...row, keys }];
      });
      help.title = "Timechain Sphere · " + help.title;
      return help;
    };
    shell.controlsHelpHold = on => { pilot.controls.reset(); pilot.setMenuOpen(on, false); };
    shell.root = root;
    shell.camera = camera;
    shell.input = input;
    shell.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people ? people.cavemen : null,
      timechain: {
        room, visit, layout: L, built, reader, holdings, guide, doors, seats,
        get avatar() { return avatar; }, get remotes() { return remotes; }, get sound() { return sound.stats; },
        get motion() { return motion && motion.stats; },
        get slots() { return all.map((s) => ({ key: s.key, shown: !!s.node.geometry })); }, get exitEye() { return exitEye; },
        exit: walkOut, chartBoard, holdingsBoard
      }
    };

    const leave = () => {
      // Left by Back or Forward rather than the doors, the Ooga still goes out by the passage if the island is next.
      if (!leaving) {
        world.pilot = avatar ? avatar.traits.name : null;
        world.sphereExit = exitNote(!BL.net.state.me);
      }
      world.sphereKeep = null;
      reader.dispose();
      holdings.dispose();
      sound.dispose();
      if (motion && motion.dispose) motion.dispose();
      if (unsubscribeDoor) unsubscribeDoor();
      unsubscribeAccount();
      window.removeEventListener("keydown", armsKeys, true);
      BL.net.setBody(null);
      for (const s of all) {
        if (s.node.geometry) renderer.releaseGeometry(s.node.geometry);
        s.node.geometry = null;
      }
      if (remotes) remotes.dispose();
      footsteps.dispose();
      if (people) people.dispose();
      fx.dispose();
      pilot.dispose();
      for (const node of targets) input.remove(node);
      targets.length = 0;
      while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
      const count = input.targetCount;
      input.dispose();
      hud.dispose();
      shell.input = shell.debug = null;
      return { targets: count };
    };
    // The island's own meshes stay on the GPU while the visit lasts (`world.sphereKeep`, set as it handed over), so
    // walking back out does not upload the whole island again in the frame it appears.
    const liveGeometry = (set) => {
      if (avatar) set.add(avatar.headOpen).add(avatar.headClosed);
      if (remotes) remotes.liveGeometry(set);
      if (world.sphereKeep) for (const geometry of world.sphereKeep) set.add(geometry);
    };
    const stats = () => {
      let visible = 0;
      traverseVisible(root, () => visible++);
      const count = (node) => 1 + node.children.reduce((sum, c) => sum + count(c), 0);
      return { visibleNodes: visible, allNodes: count(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...(remotes ? remotes.stats() : {}), requests: reader.pending, timers: reader.timers };
    };
    return { update, overlay, onKey, onDonation, stay, leave, liveGeometry, stats, renderOpts: RENDER_OPTS, get inMotion() { return true; } };
  };

  // A room readied at the island's doorway once Enter commits to it, so that arriving costs no build, paint or upload:
  // its plan, dome and floor built a step a frame, its nodes made, its live pictures painted from the page's cache a
  // picture a frame, so the island keeps its frames (`ready`), then seen once from its handover point (`capture`),
  // which uploads it, and kept on the GPU (`liveGeometry`) until the visit takes it (`create`) or it is let go
  // (`dispose`).
  const frame = () => new Promise(resolve => window.requestAnimationFrame(resolve));
  const prepare = (roomId, renderer) => {
    const room = ROOMS.get(roomId), L = ROOMS.layout(room.id), reader = BL.timechainBlocks.create(), pictures = [], slots = [];
    let live = true, built = null;
    const lights = { ...RENDER_OPTS, shadowCenter: { ...RENDER_OPTS.shadowCenter }, lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8) };
    const ready = (async () => {
      // A step that finds nothing left to do (false) takes no frame.
      let idle = false;
      for (const step of RM.prepareSteps(room.id)) {
        if (!idle) await frame();
        if (!live) return;
        idle = step() === false;
      }
      built = RM.build(room.id);
      lightRoom(lights, built);
      // The holdings desk paints on arrival; every other live picture from the page's cache, one a frame.
      const feeds = { reader, holdingsCanvases: [], holdingsKeys: [], holdingsIndex: 0 };
      for (const item of built.live) {
        if (item.spec.board === "holdings") { slots.push(null); continue; }
        const now = Date.now(), canvas = CH.canvas(item.spec.w, item.spec.h), key = item.spec.key(feeds, now);
        item.spec.paint(canvas.getContext("2d"), feeds, now);
        await frame();
        if (!live) return;
        item.node.geometry = RM.liveGeometry(L, item.spec, canvas);
        item.node.geometry.imageSurface.version = 1;
        pictures.push(item.node.geometry);
        slots.push({ key, canvas });
      }
    })();
    const shot = createCamera({ fov: 50, near: 0.12, far: L.R * 3 + 20 });
    return {
      room, ready, slots, get built() { return built; },
      // The room from its handover point (`L.entry`), level and facing the front through its open doors, the eye `eye`
      // metres up and the view `fov` high (radians), drawn into the page's canvas before that frame's own render and
      // copied out: the picture the island hangs at the end of its passage.
      capture: (canvas, eye, fov) => {
        if (!live || !built || !renderer.ready || !canvas.width || !canvas.height) return null;
        built.doors[0].position.x = -DOOR.halfW * 1.5;
        built.doors[1].position.x = DOOR.halfW * 1.5;
        shot.fov = fov;
        shot.position.x = 0; shot.position.y = eye; shot.position.z = L.entry.z;
        shot.target.x = 0; shot.target.y = eye; shot.target.z = L.entry.z - 1;
        if (!renderer.render(built.root, shot, lights)) return null;
        const k = Math.min(1, 1280 / canvas.width), out = CH.canvas(Math.round(canvas.width * k), Math.round(canvas.height * k)), g = out.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(canvas, 0, 0, out.width, out.height);
        // Both renderers hang a picture once it reads as a loaded image; a canvas is one already.
        out.complete = true;
        out.naturalWidth = out.width;
        return out;
      },
      liveGeometry: (set) => {
        if (!live || !built) return;
        for (const geometry of RM.geometries(room.id)) set.add(geometry);
        for (const geometry of pictures) set.add(geometry);
      },
      dispose: () => {
        if (!live) return;
        live = false;
        if (built) for (const geometry of [...RM.geometries(room.id), ...pictures]) renderer.releaseGeometry(geometry);
      }
    };
  };
  BL.timechainInterior = { create, prepare };
})();
