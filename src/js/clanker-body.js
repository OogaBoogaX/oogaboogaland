// The new clanker's body on every gorilla (docs/clanker-port.md). BL.agent.create still builds and runs the old rig,
// which keeps every behaviour, its collision envelope and everything scenes pose, as a driver kept off the scene; the
// scene sees `root`, a node sharing the driver root's position, rotation and scale that holds the new rig
// (BL.clankerModel). Just before anything reads its world matrices (BL.scene.updateWorld's `beforeWorld`), the new rig
// takes the driver's pose:
// - natively, from the new rig's own poses, sampled once and blended (`pose` is far too slow to run for every gorilla
//   every frame): its stance from the driver's chest pitch, its walk or gallop from the driver's gait phase and speed,
//   in the air, landing, climbing, sitting or lying from the driver's state;
// - its head and limbs retargeted from the driver's joints whenever the driver does something the new rig has no pose
//   for (a pound, a chest beat, a drag, lab or desk work, grooming, a roll, a swim, eating) or a scene has turned the
//   driver's parts itself: each bone takes the driver bone's turn in the body's frame over the new bone's rest.
// Whatever a scene hangs on a driver part is moved onto a socket that follows that part (`socket(name)`, explicitly).
// `?clanker=0` keeps the old body.
(() => {
  "use strict";
  const BL = window.BL;
  const { createNode, addChild, removeChild, updateWorld } = BL.scene;
  const on = typeof location === "undefined" || !/[?&]clanker=0(?:&|$)/.test(location.search);
  // The new body at the old one's height (2.42 m standing against 2.53 m).
  const K = 0.9564;
  // The driver's chest pitch on all fours (agent.js QUAD) and standing (its upright gait's).
  const QUAD = 1.0, UPRIGHT = 0.12;
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // Quaternions [x, y, z, w], written into `o`.
  const qmul = (o, a, b) => { const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = aw * bx + ax * bw + ay * bz - az * by; o[1] = aw * by - ax * bz + ay * bw + az * bx; o[2] = aw * bz + ax * by - ay * bx + az * bw; o[3] = aw * bw - ax * bx - ay * by - az * bz; return o; };
  const qinv = (o, a) => { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; };
  const qset = (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; };
  // a turn by `angle` about the unit axis (x, y, z); the shortest turn taking direction a to direction b
  const qaxis = (o, x, y, z, angle) => { const s = Math.sin(angle / 2); o[0] = x * s; o[1] = y * s; o[2] = z * s; o[3] = Math.cos(angle / 2); return o; };
  const qarc = (o, ax, ay, az, bx, by, bz) => { const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
    ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb; const d = ax * bx + ay * by + az * bz;
    o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx; o[3] = 1 + d;
    if (o[3] < 1e-6) { o[0] = 0; o[1] = 0; o[2] = 1; o[3] = 0; }
    const l = Math.hypot(o[0], o[1], o[2], o[3]); o[0] /= l; o[1] /= l; o[2] /= l; o[3] /= l; return o; };
  // the vector (x, y, z) turned by q, into `o`
  const qrot = (o, q, x, y, z) => { const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    o[0] = x + qw * tx + qy * tz - qz * ty; o[1] = y + qw * ty + qz * tx - qx * tz; o[2] = z + qw * tz + qx * ty - qy * tx; return o; };
  // the rotation of a column-major matrix, its columns normalised (a breathing chest is scaled)
  const qmat = (o, m) => { const sx = Math.hypot(m[0], m[1], m[2]) || 1, sy = Math.hypot(m[4], m[5], m[6]) || 1, sz = Math.hypot(m[8], m[9], m[10]) || 1;
    const a = m[0] / sx, d = m[1] / sx, g = m[2] / sx, b = m[4] / sy, e = m[5] / sy, h = m[6] / sy, c = m[8] / sz, f = m[9] / sz, i = m[10] / sz, tr = a + e + i;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; o[3] = 0.25 * s; o[0] = (h - f) / s; o[1] = (c - g) / s; o[2] = (d - b) / s; }
    else if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; o[3] = (h - f) / s; o[0] = 0.25 * s; o[1] = (b + d) / s; o[2] = (c + g) / s; }
    else if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; o[3] = (c - g) / s; o[0] = (b + d) / s; o[1] = 0.25 * s; o[2] = (f + h) / s; }
    else { const s = Math.sqrt(1 + i - a - e) * 2; o[3] = (d - b) / s; o[0] = (c + g) / s; o[1] = (f + h) / s; o[2] = 0.25 * s; }
    return o; };
  // the shorter way from a toward b by t, normalised
  const qlerp = (o, a, b, t) => { const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
    o[0] = a[0] + (s * b[0] - a[0]) * t; o[1] = a[1] + (s * b[1] - a[1]) * t; o[2] = a[2] + (s * b[2] - a[2]) * t; o[3] = a[3] + (s * b[3] - a[3]) * t;
    const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; o[3] /= l; return o; };

  // Sampled poses, one table a form, made the first time each is asked for on a rig of the form's own off the scene. A
  // pose is, for every node under the rig's root in a fixed walk's order, its quaternion, position, scale and
  // visibility (11 floats), then whether the chest shows its weld and which torso weld shows, then the live sleeve's points.
  const FIELDS = 11, PHASES = 24, TS = 20, LIMIT = 900;
  const walk = (r) => { const out = []; (function w(n) { out.push(n); for (const c of n.children) w(c); })(r.root); return out; };
  const samplers = {};
  const sampler = (form) => { let s = samplers[form]; if (s) return s; const M = BL.clankerModel, r = M.rig(M.sets.B, form), nodes = walk(r);
    const sleeve = r.sleeveLive ? r.sleeveLive.g.verts.length : 0;
    s = samplers[form] = { r, nodes, sleeve, size: nodes.length * FIELDS + 2 + sleeve, cache: new Map(), made: 0, rest: null }; return s; };
  const record = (s, out) => { const N = s.nodes, r = s.r; let k = 0;
    for (let i = 0; i < N.length; i++) { const n = N[i], q = n.quaternion;
      if (q) { out[k] = q[0]; out[k + 1] = q[1]; out[k + 2] = q[2]; out[k + 3] = q[3]; } else { out[k] = 0; out[k + 1] = 0; out[k + 2] = 0; out[k + 3] = 1; }
      out[k + 4] = n.position.x; out[k + 5] = n.position.y; out[k + 6] = n.position.z; out[k + 7] = n.scale.x; out[k + 8] = n.scale.y; out[k + 9] = n.scale.z;
      out[k + 10] = n.visible ? 1 : 0; k += FIELDS; }
    out[k++] = r.chestWeld && r.chest.geometry === r.chestWeld ? 1 : 0;
    out[k++] = r.weldGeos ? Math.max(0, r.weldGeos.indexOf(r.weldNode.geometry)) : 0;
    if (s.sleeve) out.set(r.sleeveLive.g.verts, k); return out; };
  // The inputs a native pose is sampled at, each on its own grid: t the stance (0 all fours, 1 standing) in TS steps,
  // phase the gait's in PHASES steps of a cycle, k how fast (0 still to 1 a full stride) and run in quarters, and the
  // rest (air, land, climb, sit, lay) in quarters; climbing takes its own phase.
  const IN = { t: 0, phase: 0, k: 0, run: 0, air: 0, land: 0, climb: 0, climbPhase: 0, sit: 0, lay: 0 };
  const q4 = (v) => Math.max(0, Math.min(4, Math.round(v * 4)));
  const sample = (s, ti, pi) => { const ki = q4(IN.k), ri = q4(IN.run), ai = q4(IN.air), li = q4(IN.land), ci = q4(IN.climb), si = q4(IN.sit), yi = q4(IN.lay);
    const moving = ki > 0 && ai === 0 && ci === 0 && si === 0 && yi === 0, climbing = ci > 0, p = moving || climbing ? pi % PHASES : 0;
    const key = ((((((((ti * PHASES + p) * 5 + ki) * 5 + ri) * 5 + ai) * 5 + li) * 5 + ci) * 5 + si) * 5 + yi) * 2 + (climbing ? 1 : 0);
    let out = s.cache.get(key); if (out) return out;
    if (s.cache.size >= LIMIT) s.cache.clear();
    const ph = p / PHASES * Math.PI * 2, k = ki / 4;
    const gait = moving ? { phase: ph, amp: 24 * k, lift: 28 * k, sway: 3 * k, run: ri / 4 } : null;
    BL.clankerModel.pose(s.r, ti / TS, gait, { air: ai / 4, land: li / 4, climb: ci / 4, climbPhase: climbing ? ph : 0, sit: si / 4, lay: yi / 4 });
    out = record(s, new Float32Array(s.size)); s.cache.set(key, out); s.made++; return out; };
  // The pose at IN, blended between the samples either side in stance and phase, into `out`; the visibility flags and
  // the chest's weld from the nearest sample.
  const blend = (s, out) => { const tf = Math.max(0, Math.min(1, IN.t)) * TS, t0 = Math.floor(tf), t1 = Math.min(TS, t0 + 1), wt = tf - t0;
    const phased = IN.k > 0.125 || IN.climb > 0.125, pf = phased ? (((IN.climb > 0.125 ? IN.climbPhase : IN.phase) / (Math.PI * 2)) % 1 + 1) % 1 * PHASES : 0, p0 = Math.floor(pf), wp = pf - p0;
    const a = sample(s, t0, p0), b = sample(s, t0, p0 + 1), c = sample(s, t1, p0), d = sample(s, t1, p0 + 1), n = s.size;
    const near = wt < 0.5 ? (wp < 0.5 ? a : b) : (wp < 0.5 ? c : d);
    const wa = (1 - wt) * (1 - wp), wb = (1 - wt) * wp, wc = wt * (1 - wp), wd = wt * wp;
    for (let i = 0; i < n; i++) out[i] = a[i] * wa + b[i] * wb + c[i] * wc + d[i] * wd;
    const N = s.nodes.length;
    for (let i = 0; i < N; i++) { const k = i * FIELDS;
      // quaternions are blended as plain numbers above; samples a step apart keep the same hemisphere, so normalising is enough
      const l = Math.hypot(out[k], out[k + 1], out[k + 2], out[k + 3]) || 1; out[k] /= l; out[k + 1] /= l; out[k + 2] /= l; out[k + 3] /= l;
      out[k + 10] = near[k + 10]; }
    out[N * FIELDS] = near[N * FIELDS]; out[N * FIELDS + 1] = near[N * FIELDS + 1]; return out; };

  // Driver parts the new rig takes bones from, and the new bones they drive: [driver part, new bone, its lower part,
  // the lowest part (a foot) kept level]
  const LIMBS = [["head", "head", null], ["armR", "armR", "foreR"], ["armL", "armL", "foreL"], ["legR", "legR", "shinR"], ["legL", "legL", "shinL"]];
  // Sockets: whatever a scene hangs on these driver parts.
  const SOCKETS = ["hips", "chest", "torso", "head", "jaw", "armR", "armL", "legR", "legL"];
  // The new fist's middle in its forearm's frame (its hole runs along x), and how far over the bottom of the driver's
  // arm its hand is, as the hub measures its grip: the arm sockets carry the old hand onto the new fist.
  const FIST = [0, -0.66, -0.03], HAND_UP = 0.08, HANDS = { handR: "armR", handL: "armL" };
  // The drawn part a driver part stands for, and the region (a driver part's name) each new bone belongs to.
  const DRAWN = { hips: "hips", chest: "chest", torso: "chest", head: "head", jaw: "head", armR: "armR", armL: "armL", legR: "legR", legL: "legL" };
  const REGION = { head: "head", armR: "armR", foreR: "armR", armL: "armL", foreL: "armL", legR: "legR", shinR: "legR", shinRFoot: "legR", legL: "legL", shinL: "legL", shinLFoot: "legL" };

  const TIME = { attach: 0, sync: 0, syncs: 0, rig: 0 };
  // Stand-ins for the outline registry (object-guides.js reads a geometry's `outline` in its place): the smooth body is
  // many times the faces of the old voxel one, and every face of every gorilla is a target there. Each is the mesh's
  // surface in OUTLINE_CELL blocks, merged; every torso weld shares one, as the chest's two meshes do, so a swap never
  // meets a mesh it has not baked; the live sleeve has none (a thin ring at the waist).
  const OUTLINE_CELL = 0.15, NO_OUTLINE = { verts: [], faces: [], lines: [] };
  const blocky = (geo) => { const M = BL.models, V = geo.verts, c = OUTLINE_CELL, cells = new Set();
    const mark = (x, y, z) => cells.add(Math.floor(x / c) + "," + Math.floor(y / c) + "," + Math.floor(z / c));
    for (const f of geo.faces) { let x = 0, y = 0, z = 0; for (const i of f.i) { mark(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); x += V[i * 3]; y += V[i * 3 + 1]; z += V[i * 3 + 2]; } const n = f.i.length; mark(x / n, y / n, z / n); }
    // solid: every cell the outside cannot reach without crossing the surface (a flood from the bounding box's rim), so
    // the stand-in has an outside and no inside faces
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const k of cells) { const [x, y, z] = k.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    x0--; y0--; z0--; x1++; y1++; z1++; const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1, out = new Uint8Array(nx * ny * nz), at = (x, y, z) => (x - x0) + nx * ((y - y0) + ny * (z - z0)), stack = [at(x0, y0, z0)];
    out[stack[0]] = 1;
    while (stack.length) { const i = stack.pop(), x = i % nx + x0, y = Math.floor(i / nx) % ny + y0, z = Math.floor(i / (nx * ny)) + z0;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const X = x + dx, Y = y + dy, Z = z + dz;
        if (X < x0 || X > x1 || Y < y0 || Y > y1 || Z < z0 || Z > z1) continue; const j = at(X, Y, Z); if (out[j] || cells.has(X + "," + Y + "," + Z)) continue; out[j] = 1; stack.push(j); } }
    const vox = M.makeVox(); for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!out[at(x, y, z)]) vox.set(x, y, z, 0);
    const g = M.voxelGeometry(vox, { unit: c, palette: ["#1d1a18"] }); g.characterPart = true; return g; };
  const outlines = (r) => { if (r.outlined) return; r.outlined = true;
    const give = (geo, proxy) => { if (geo && geo.outline === undefined) geo.outline = proxy || blocky(geo); };
    if (r.weldGeos) { const shared = r.weldGeos[0].outline || blocky(r.weldGeos[r.weldGeos.length >> 1]); for (const g of r.weldGeos) give(g, shared); }
    if (r.chestGeo) { give(r.chestGeo); give(r.chestWeld, r.chestGeo.outline); }
    if (r.sleeveNode) r.sleeveNode.geometry.outline = NO_OUTLINE;
    (function w(n) { give(n.geometry); for (const c of n.children) w(c); })(r.root); };
  const now = () => typeof performance !== "undefined" ? performance.now() : 0;
  // The glyph form, made ready in slices a few seconds after the first body shows (the sleep beam and the ghost hunt
  // show it), so its first use does not stall a frame building it.
  let glyphs = false;
  const prepareGlyphs = () => { if (glyphs || !BL.buildTasks || typeof setTimeout === "undefined") return; glyphs = true;
    setTimeout(() => { if (!BL.clankerModel.ready("code")) BL.buildTasks.run(BL.clankerModel.prepareSteps("code", { until: 0, budget: 8, work: 0 }), null).catch(() => {}); }, 5000); };
  const attach = (d) => { const t0 = now(); prepareGlyphs();
    const { root: droot, hips: dhips, state, managed } = d;
    // The scene's root shares the driver root's transform objects, so whatever moves one moves the other.
    const root = createNode();
    root.position = droot.position; root.rotation = droot.rotation; root.scale = droot.scale;
    root.matrixNative = droot.matrixNative;
    // tilt: the driver's whole-body turns at its hips (rolling, the slope underfoot); scaled: the new body's size
    const tilt = createNode(), scaled = createNode({ scale: { x: K, y: K, z: K } });
    tilt.quaternion = [0, 0, 0, 1];
    addChild(root, tilt); addChild(tilt, scaled);
    const dparts = { hips: dhips, chest: d.chest, torso: d.torso, ...d.parts };
    const own = new Set();
    for (const name of SOCKETS) if (dparts[name]) for (const c of dparts[name].children) own.add(c);
    for (const name of SOCKETS) if (dparts[name]) own.add(dparts[name]);
    const sockets = {};
    const socket = (name) => { let s = sockets[name]; if (!s) { s = sockets[name] = createNode(); s.quaternion = [0, 0, 0, 1]; addChild(root, s); } return s; };
    // One rig a form, made as the form is first shown.
    const rigs = {};
    let rig = null, form = null, pose = null, nodes = null, sleeveAt = 0, retargetK = 0;
    let onRig = null;
    const show = (next) => { if (form === next && rig) return; form = next;
      let e = rigs[next]; if (!e) { const tr = now(), M = BL.clankerModel, r = M.rig(M.sets.B, next); outlines(r); TIME.rig += now() - tr; const s = sampler(next); e = rigs[next] = { r, nodes: walk(r), s, buf: new Float32Array(s.size), ...regionsOf(r) }; addChild(scaled, r.root);
        // the new rig's hips stand back of its root; the driver's stand over its root, and so does the body
        scaled.position.z = -r.hips.position.z * K;
        if (onRig) onRig(r.root); }
      for (const f in rigs) rigs[f].r.root.visible = f === next;
      rig = e; nodes = e.nodes; pose = e.buf; sleeveAt = nodes.length * FIELDS + 2; };
    // Scratch, reused every sync.
    const qa = [0, 0, 0, 1], qb = [0, 0, 0, 1], qc = [0, 0, 0, 1], qh = [0, 0, 0, 1], qp = [0, 0, 0, 1];
    const dq = {}; for (const name of SOCKETS) dq[name] = [0, 0, 0, 1];
    const last = new Float32Array(SOCKETS.length * 3 + 8);
    // A pose a scene has written over: each driver part's turn as the driver last left it, compared at sync.
    const posed = new Float32Array(SOCKETS.length * 3);
    const notePosed = () => { let k = 0; for (const name of SOCKETS) { const p = dparts[name]; posed[k++] = p ? p.rotation.x : 0; posed[k++] = p ? p.rotation.y : 0; posed[k++] = p ? p.rotation.z : 0; } };
    const overridden = () => { let k = 0; for (const name of SOCKETS) { const p = dparts[name]; if (p && (Math.abs(posed[k] - p.rotation.x) > 1e-6 || Math.abs(posed[k + 1] - p.rotation.y) > 1e-6 || Math.abs(posed[k + 2] - p.rotation.z) > 1e-6)) return true; k += 3; } return false; };
    // What the driver is doing that the new rig has no pose for.
    const acting = () => state.gait === "beat" || state.beat > 0 || (managed && (state.pound > 0 || state.poundCharge > 0 || state.dragging || state.chewing > 0
      || state.lab && state.labWork || state.officeSeat > 0.5 || state.groomBlend > 0.05 || state.rollBlend > 0.05 || state.swimBlend > 0.05
      || state.lounge === "lean-left" || state.lounge === "lean-right" || state.lounge === "lean-back"));
    let clock = typeof performance !== "undefined" ? performance.now() : 0;
    const sync = (parentWorld) => {
      if (!on) return; const ts = now(); TIME.syncs++;
      show(state.form || "ape");
      const r = rig.r;
      // The driver's parts relative to its root (for the retarget and the sockets), then in the world (for scenes that read them).
      updateWorld(dhips, IDENT);
      for (const name of SOCKETS) { const p = dparts[name]; if (p) qmat(dq[name], p.world); }
      // Native inputs from the driver.
      const lounge = managed ? state.lounge : "", onSide = lounge === "left" || lounge === "right" || lounge === "back";
      // (the driver's chest as it stands, which is its pitch unless a scene has leant it itself)
      IN.t = Math.max(0, Math.min(1, (QUAD - d.chest.rotation.x) / (QUAD - UPRIGHT)));
      const pace = state.gait === "gallop" ? 1 : 0, still = state.air || lounge || (managed && state.climbBlend > 0.05);
      IN.k = still ? 0 : Math.max(0, Math.min(1, state.speed / 1.2)); IN.run = still ? 0 : pace;
      IN.phase = (state.phase || 0) * Math.PI * 2;
      IN.air = state.air ? 1 : 0; IN.land = managed ? Math.min(1, state.crouch || 0) : 0;
      IN.climb = managed ? Math.min(1, state.climbBlend || 0) : 0; IN.climbPhase = managed ? (state.climbStride || 0) / 1.2 * Math.PI * 2 : 0;
      IN.sit = lounge === "sit" ? 1 : 0; IN.lay = onSide ? 1 : 0;
      blend(rig.s, pose);
      // Applied to the rig: every node's turn, place and size, what shows, the chest's weld and the sleeve.
      for (let i = 0; i < nodes.length; i++) { const n = nodes[i], k = i * FIELDS; let q = n.quaternion;
        if (!q) q = n.quaternion = [0, 0, 0, 1];
        q[0] = pose[k]; q[1] = pose[k + 1]; q[2] = pose[k + 2]; q[3] = pose[k + 3];
        n.position.x = pose[k + 4]; n.position.y = pose[k + 5]; n.position.z = pose[k + 6];
        n.scale.x = pose[k + 7]; n.scale.y = pose[k + 8]; n.scale.z = pose[k + 9];
        n.visible = pose[k + 10] > 0.5; }
      r.root.visible = true;
      // the driver's breathing (clankers.js swells its chest asleep)
      r.chest.scale.y *= d.chest.scale.y;
      if (r.chestWeld) swap(r.chest, pose[nodes.length * FIELDS] > 0.5 ? r.chestWeld : r.chestGeo);
      if (r.weldGeos) swap(r.weldNode, r.weldGeos[pose[nodes.length * FIELDS + 1] | 0]);
      if (r.sleeveLive) { const g = r.sleeveLive.g, V = g.verts; for (let i = 0; i < V.length; i++) V[i] = pose[sleeveAt + i]; g.revision = (g.revision || 0) + 1;
        // a look painted over the sleeve (the NPC ghost's twin) takes its live shape too
        const shown = r.sleeveNode.geometry; if (shown !== g && shown.verts.length === V.length) { const W = shown.verts; for (let i = 0; i < V.length; i++) W[i] = V[i]; shown.revision = (shown.revision || 0) + 1; } }
      if (r.rain) r.rain((typeof performance !== "undefined" ? performance.now() : 0) / 1000);
      // The driver's whole-body turn at its hips, but for lying and sitting, which the new rig poses itself.
      if (lounge) { tilt.quaternion[0] = tilt.quaternion[1] = tilt.quaternion[2] = 0; tilt.quaternion[3] = 1; } else qset(tilt.quaternion, dq.hips);
      // and the controller's support offset, which eases the body up or down a step (agent.js adds it to the hips)
      tilt.position.y = managed ? (state.supportOffset || 0) / (droot.scale.y || 1) : 0;
      // Retargeted head and limbs, eased in and out over a fifth of a second.
      const tnow = now() || clock + 16, dt = Math.min(0.1, Math.max(0, (tnow - clock) / 1000)); clock = tnow;
      const want = acting() || overridden() ? 1 : 0;
      retargetK += (want - retargetK) * Math.min(1, dt * 10);
      if (retargetK > 0.002) { const rest = restOf(rig.s);
        for (const [dn, nn, lower] of LIMBS) { const dpart = dparts[dn], bone = r[nn]; if (!dpart || !bone) continue;
          // the driver bone's turn in the body (relative to its hips) over the new bone's rest in the rig
          qinv(qh, dq.hips); qmul(qa, qh, dq[dn]); qmul(qb, qa, rest[nn]);
          // as a local turn under the new bone's parent, from the rig's root down
          worldOf(bone.parent, r, qp); qinv(qc, qp); qmul(qa, qc, qb);
          qlerp(bone.quaternion, bone.quaternion, qa, retargetK);
          if (lower && r[lower]) qlerp(r[lower].quaternion, r[lower].quaternion, rest[lower + "Local"], retargetK); }
        // and each fist brought to where the driver's hand is, the elbow bending to reach it
        updateWorld(tilt, IDENT); reach(r.armR, r.foreR, dparts.armR, retargetK); reach(r.armL, r.foreL, dparts.armL, retargetK); }
      // Anything a scene hung on a driver part goes to its socket, and the sockets follow their driver parts; the hands'
      // (`handR`, `handL`) follow the drawn fists instead, carrying the driver's hand onto the fist's middle.
      for (const name of SOCKETS) { const p = dparts[name]; if (!p) continue; const C = p.children;
        for (let i = C.length - 1; i >= 0; i--) { const c = C[i]; if (own.has(c)) continue; removeChild(p, c); addChild(socket(name), c); } }
      let fresh = false;
      for (const name in sockets) { const hand = HANDS[name], p = dparts[hand || name], s = sockets[name]; if (!p) continue; const W = p.world;
        if (!hand) { qset(s.quaternion, dq[name]); s.position.x = W[12]; s.position.y = W[13]; s.position.z = W[14]; continue; }
        if (!fresh) { updateWorld(tilt, IDENT); fresh = true; }
        const F = (hand === "armR" ? r.foreR : r.foreL).world, b = BL.scene.boundsOf(p.geometry);
        qmat(qa, F); qmul(s.quaternion, qa, restOf(rig.s)[hand === "armR" ? "foreRWorldInv" : "foreLWorldInv"]);
        qrot(PT, s.quaternion, b.center[0], b.min[1] + HAND_UP, b.center[2]);
        BL.math.mat4.transformPoint(HAND, F, FIST[0], FIST[1], FIST[2]);
        s.position.x = HAND[0] - PT[0]; s.position.y = HAND[1] - PT[1]; s.position.z = HAND[2] - PT[2]; }
      // And the driver in the world, for scenes that read its parts.
      updateWorld(droot, parentWorld); TIME.sync += now() - ts;
    };
    root.beforeWorld = sync;
    // A bone's turn in the rig's frame: its parents' turns multiplied from the rig's root down.
    const worldOf = (node, r, out) => { out[0] = out[1] = out[2] = 0; out[3] = 1; const chain = CHAIN; chain.length = 0;
      for (let n = node; n && n !== r.root; n = n.parent) chain.push(n);
      for (let i = chain.length - 1; i >= 0; i--) { const q = chain[i].quaternion; if (q) qmul(out, out, q); }
      return out; };
    const liveGeometry = (set) => { for (const f in rigs) { const r = rigs[f].r;
        (function w(n) { if (n.geometry) set.add(n.geometry); for (const c of n.children) w(c); })(r.root);
        if (r.chestGeo) set.add(r.chestGeo); if (r.chestWeld) set.add(r.chestWeld); if (r.weldGeos) for (const g of r.weldGeos) set.add(g); } };
    const dispose = () => { if (root.parent) removeChild(root.parent, root); root.beforeWorld = null; };
    show(state.form || "ape"); TIME.attach += now() - t0;
    // The drawn part a driver part stands for (`drawn("head")` is the head a nameplate or an eye is measured on), the
    // fist's middle in the world (`grip("armL", out)`, once the world is up to date), a rig's nodes by driver part, the
    // driver part a drawn node stands for, and `onRig(root)`, told of each rig as it is made (the glyph form's later).
    const drawn = (name) => rig.r[DRAWN[name] || name] || null;
    const grip = (side, out) => BL.math.mat4.transformPoint(out, side === "armR" ? rig.r.foreR.world : rig.r.foreL.world, FIST[0], FIST[1], FIST[2]);
    return { root, sync, socket, notePosed, liveGeometry, dispose, drawn, grip, get rig() { return rig && rig.r; }, get retarget() { return retargetK; },
      get rigs() { return Object.values(rigs).map((e) => e.r.root); },
      region: (name) => rig.regions[name] || null, regionOf: (node) => { for (const f in rigs) { const reg = rigs[f].regionOf.get(node); if (reg) return reg; } return null; },
      regionsOf: (root) => { for (const f in rigs) if (rigs[f].r.root === root) return rigs[f].regions; return null; },
      set onRig(fn) { onRig = fn; } };
  };
  const CHAIN = [];
  // A swapped mesh (the chest's weld, the belly's) keeps whatever look is painted over it: a geometry painted on (the NPC
  // ghost's twin) carries `restyle`, which gives the same look of the next one.
  const swap = (node, src) => { const g = node.geometry; node.geometry = g && g !== src && g.restyle ? g.restyle(src) : src; };
  // Every node of a rig by the driver part it stands for (`head`, `torso`, `armR`, `armL`, `legR`, `legL`), for looks
  // laid on a driver part (burns, highlights, hit regions): each with what hangs under it.
  const regionsOf = (r) => { const names = new Map(); for (const k in r) { const v = r[k]; if (v && v !== r.root && Array.isArray(v.children) && v.position) names.set(v, k); }
    const regions = { head: [], torso: [], armR: [], armL: [], legR: [], legL: [] }, regionOf = new Map();
    (function w(n, reg) { const k = names.get(n); if (k && REGION[k]) reg = REGION[k]; regionOf.set(n, reg); regions[reg].push(n); for (const c of n.children) w(c, reg); })(r.root, "torso");
    return { regions, regionOf }; };
  // Scratch for the reach and the arm sockets.
  const HAND = new Float32Array(3), PT = new Float32Array(3), RV = [0, 0, 0];
  const qd = [0, 0, 0, 1], qA = [0, 0, 0, 1], qF = [0, 0, 0, 1], qT = [0, 0, 0, 1], qi = [0, 0, 0, 1], qL = [0, 0, 0, 1], qs = [0, 0, 0, 1];
  // An arm brought to the driver's hand, by `k`: the forearm bent about the elbow until the fist is as far from the
  // shoulder as the hand, keeping the bend's plane, then the whole arm swung about the shoulder onto it. Every world
  // matrix is in the body root's frame (the driver's parts' too), up to date for the arm's own pose.
  const reach = (A, F, dpart, k) => { if (!A || !F || !dpart || !dpart.geometry) return;
    const M4 = BL.math.mat4, b = BL.scene.boundsOf(dpart.geometry), Aw = A.world, Fw = F.world;
    M4.transformPoint(HAND, dpart.world, b.center[0], b.min[1] + HAND_UP, b.center[2]);
    M4.transformPoint(PT, Fw, FIST[0], FIST[1], FIST[2]);
    const sx = Aw[12], sy = Aw[13], sz = Aw[14], ex = Fw[12], ey = Fw[13], ez = Fw[14];
    const ux = sx - ex, uy = sy - ey, uz = sz - ez, vx = PT[0] - ex, vy = PT[1] - ey, vz = PT[2] - ez;
    const tx = HAND[0] - sx, ty = HAND[1] - sy, tz = HAND[2] - sz, L1 = Math.hypot(ux, uy, uz), L2 = Math.hypot(vx, vy, vz);
    if (L1 < 1e-6 || L2 < 1e-6) return;
    const d = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.01, Math.hypot(tx, ty, tz)));
    const c0 = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (L1 * L2))), c1 = Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
    // the bend's axis (u x v turns u toward v, so turning v about it opens the elbow); straight, the forearm's own x
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) { nx = Fw[0]; ny = Fw[1]; nz = Fw[2]; nl = Math.hypot(nx, ny, nz) || 1; }
    qaxis(qd, nx / nl, ny / nl, nz / nl, Math.acos(c1) - Math.acos(c0));
    qmat(qA, Aw); qmat(qF, Fw); qmul(qT, qd, qF); qinv(qi, qA); qmul(qL, qi, qT);
    qlerp(F.quaternion, F.quaternion, qL, k);
    qrot(RV, qd, vx, vy, vz);
    qarc(qs, RV[0] - ux, RV[1] - uy, RV[2] - uz, tx, ty, tz); qmul(qT, qs, qA);
    qmat(qF, A.parent.world); qinv(qi, qF); qmul(qL, qi, qT);
    qlerp(A.quaternion, A.quaternion, qL, k); };
  // A rig's rest for the retarget, once a form: each driven bone's turn in the rig at the standing pose (when the driver's
  // bones hang straight in its body), and each lower part's own local turn there.
  const restOf = (s) => { if (s.rest) return s.rest; const r = s.r, saved = IN.t, rest = {};
    const keep = { ...IN }; IN.t = 1; IN.k = 0; IN.air = IN.land = IN.climb = IN.sit = IN.lay = 0;
    const buf = blend(s, new Float32Array(s.size)); Object.assign(IN, keep); IN.t = saved;
    const local = (node) => { const i = s.nodes.indexOf(node), k = i * FIELDS; return [buf[k], buf[k + 1], buf[k + 2], buf[k + 3]]; };
    const world = (node) => { const out = [0, 0, 0, 1]; const chain = []; for (let n = node; n && n !== r.root; n = n.parent) chain.push(n);
      for (let i = chain.length - 1; i >= 0; i--) qmul(out, out, local(chain[i])); return out; };
    for (const [, nn, lower] of LIMBS) { if (r[nn]) rest[nn] = world(r[nn]); if (lower && r[lower]) { rest[lower + "Local"] = local(r[lower]); rest[lower + "WorldInv"] = qinv([0, 0, 0, 1], world(r[lower])); } }
    return s.rest = rest; };
  BL.clankerBody = { on, attach, K, stats: () => ({ time: { ...TIME }, forms: Object.fromEntries(Object.entries(samplers).map(([f, s]) => [f, { samples: s.cache.size, made: s.made }])) }) };
})();
