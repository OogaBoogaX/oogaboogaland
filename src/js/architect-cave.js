// The mirror's observation chamber shares the island's simulation. Its enclosed volume lives below the
// island, reached only through the mirror; no second crew, feed subscription or player is created.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const { box, bevelBox, beam, lathe, merge, geometry, pushVert, face } = BL.models;
  const FLOOR = -48, RADIUS = 10.8, TAU = Math.PI * 2;
  // Match the island cave's five-metre opening, with its glass reaching the floor.
  const RETURN_HALF_W = 2.5, RETURN_HEIGHT = 3, RETURN_Z = Math.sqrt(RADIUS * RADIUS - RETURN_HALF_W * RETURN_HALF_W);
  const BANKS = 48, ROWS = 12, MIRROR_ROWS = 4, PITCH = RETURN_HEIGHT / MIRROR_ROWS, GAP = 0.025, PORTAL_COLS = 4, WALL = "#080a0b", BEZEL = "#030405";
  // Between images: two facing bezels plus GAP. The outer rows have only
  // one bezel, so add the missing bezel's height at the floor and ceiling.
  const TV_BORDER_Y = (PITCH - GAP) * (1.96 - 1.72) / (2 * 1.96);
  const ROW_OFFSET = GAP / 2 + TV_BORDER_Y, HEIGHT = ROWS * PITCH + 2 * ROW_OFFSET;
  const PORTAL_ANGLE = Math.asin(RETURN_HALF_W / RADIUS), BANK_ANGLE = (TAU - 2 * PORTAL_ANGLE) / BANKS;
  const BANK_RADIUS = RADIUS * Math.cos(BANK_ANGLE / 2);
  const PORTAL_PITCH = RADIUS * (2 * PORTAL_ANGLE / PORTAL_COLS);
  const TV_MOUNT = 0.025, TV_DEPTH = 0.10, TV_FACE = 0.068, TV_GLASS = TV_FACE + 0.004;
  const SEAT_TOP = 0.72, ARC_STEPS = 8, SCREEN_RADIUS = RADIUS - TV_MOUNT - TV_FACE * 0.71;
  // Local chair solids rotate with the upholstery; the low caster base stays underneath it.
  const CHAIR_SOLIDS = [[-0.68, 0, -0.58, 0.68, SEAT_TOP, 0.58],
    [-0.68, SEAT_TOP, -0.8, 0.68, 2.08, -0.35],
    [-0.85, SEAT_TOP, -0.5, -0.7, 1.18, 0.54], [0.7, SEAT_TOP, -0.5, 0.85, 1.18, 0.54]];
  const contains = (x, y, z) => y < -32 && y > -55 && x * x + z * z < 225;
  const returnDepth = x => Math.sqrt(Math.max(0, RADIUS * RADIUS - x * x));
  const clear = (x, z, radius = 0.4) => Math.hypot(x, z) < BANK_RADIUS - radius - 0.25
    || z > RADIUS - 2 && Math.abs(x) < RETURN_HALF_W - radius - 0.08 && z < returnDepth(x) + 0.6;
  const segmentClear = (x, y, z, toX, toY, toZ, radius, height) =>
    clear(toX, toZ, radius) && toY >= FLOOR - 1e-7 && toY + height <= FLOOR + HEIGHT
    && (toZ <= returnDepth(toX) - radius || Math.abs(toX) < RETURN_HALF_W - radius - 0.08 && toY < FLOOR + RETURN_HEIGHT - 0.5);
  const FACE_WAIT = 45, FACE_SWEEP = 2.8, FACE_HOLD = 8, PATCH_SWEEP = 1.1, TILE_FLASH = 0.16;
  const ENHANCEMENT_SIZE = 7;
  const PEN_ARM_REST = -0.75; // The crew's default chair pose; never lower the arm past it.
  // Tile the wall with single screens and square video groups. Independent groups must not repeat
  // a neighboring feed; adjacency within one deliberate mosaic is the only exception.
  const panelLayout = (count, initial = false, previous = null, patch = null) => {
    const cols = BANKS + PORTAL_COLS, cells = new Int16Array(cols * ROWS).fill(-1), groups = [], uses = new Uint16Array(count);
    const fits = (col, row, size) => {
      if (row + size > ROWS || col + size > (col < BANKS ? BANKS : cols)) return false;
      if (patch && (size > patch.maxSize || row + size > patch.row + patch.size || col + size > patch.col + patch.size)) return false;
      for (let y = row; y < row + size; y++) for (let x = col; x < col + size; x++)
        if (y < MIRROR_ROWS && x >= BANKS || cells[y * cols + x] >= 0) return false;
      return true;
    };
    for (let row = patch ? patch.row : 0; row < (patch ? patch.row + patch.size : ROWS); row++)
      for (let col = patch ? patch.col : 0; col < (patch ? patch.col + patch.size : cols); col++) {
      if (!fits(col, row, 1)) continue;
      const roll = Math.random();
      const size = fits(col, row, 3) && (initial && col === 0 && row === 0 || roll < 0.22) ? 3
        : fits(col, row, 2) && (initial && col === 3 && row === 0 || roll < 0.65) ? 2 : 1;
      const id = groups.length;
      groups.push({ col, row, size, slot: -1 });
      for (let y = row; y < row + size; y++) for (let x = col; x < col + size; x++) cells[y * cols + x] = id;
    }
    for (let id = 0; id < groups.length; id++) {
      const g = groups[id], excluded = new Uint8Array(count);
      for (let y = Math.max(0, g.row - 1); y <= Math.min(ROWS - 1, g.row + g.size); y++)
        for (let x = g.col - 1; x <= g.col + g.size; x++) {
          const cell = y * cols + (x + cols) % cols, neighbor = cells[cell];
          if (neighbor >= 0 && neighbor !== id && groups[neighbor].slot >= 0) excluded[groups[neighbor].slot] = 1;
          // Also avoid the outgoing layout, including tiles inside this destination group that have
          // not switched yet. Independent neighbors cannot collide halfway through the wave either.
          if (previous && previous[cell] >= 0) excluded[previous[cell]] = 1;
        }
      let best = Infinity, ties = 0;
      for (let slot = 0; slot < count; slot++) {
        if (excluded[slot] || uses[slot] > best) continue;
        if (uses[slot] < best) { best = uses[slot]; ties = 0; }
        if (Math.random() * ++ties < 1) g.slot = slot;
      }
      if (g.slot < 0 && g.size === 3) {
        // A 3x3 may meet too many old and new channels at once. Singles have at most nine old
        // and eight new neighbors, so splitting this group guarantees a choice within 32 slots.
        g.size = 1;
        for (let y = g.row; y < g.row + 3; y++) for (let x = g.col; x < g.col + 3; x++) {
          if (x === g.col && y === g.row) continue;
          cells[y * cols + x] = groups.length;
          groups.push({ col: x, row: y, size: 1, slot: -1 });
        }
        id--; continue;
      }
      uses[g.slot]++;
    }
    return { cells, groups, cols };
  };
  const disc = (radius, y, color, down = false) => {
    const g = geometry(), rgb = BL.math.hexToRgb(color);
    pushVert(g, 0, y, 0);
    for (let i = 0; i <= 48; i++) pushVert(g, Math.sin(i * TAU / 48) * radius, y, Math.cos(i * TAU / 48) * radius);
    for (let i = 1; i <= 48; i++) face(g, down ? [0, i + 1, i] : [0, i, i + 1], rgb, { emissive: 0.32 });
    g.castShadow = false;
    return g;
  };
  // Rounded upholstery with explicit normals keeps broad leather faces and soft rolled edges.
  const cushion = (w, h, d, radius, color) => {
    const g = geometry(), half = [w / 2, h / 2, d / 2], rgb = BL.math.hexToRgb(color), steps = 8;
    g.normals = [];
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const b = (axis + 1) % 3, c = (axis + 2) % 3, start = g.verts.length / 3;
      for (let y = 0; y <= steps; y++) for (let x = 0; x <= steps; x++) {
        const p = [0, 0, 0]; p[axis] = sign * half[axis]; p[b] = (x / steps * 2 - 1) * half[b]; p[c] = (y / steps * 2 - 1) * half[c];
        const core = p.map((v, i) => Math.max(-half[i] + radius, Math.min(half[i] - radius, v)));
        const n = p.map((v, i) => v - core[i]), length = Math.hypot(...n);
        pushVert(g, ...core.map((v, i) => v + n[i] / length * radius));
        g.normals.push(...n.map(v => v / length));
      }
      for (let y = 0; y < steps; y++) for (let x = 0; x < steps; x++) {
        const i = start + y * (steps + 1) + x, ids = [i, i + 1, i + steps + 2, i + steps + 1];
        face(g, sign > 0 ? ids : ids.reverse(), rgb, { emissive: 0.06 });
      }
    }
    return g;
  };
  // A casing follows the same cylinder as its glass, including its top and bottom rails.
  const curvedCase = (w, h, d, z, scaleX, color) => {
    const g = geometry(), rgb = BL.math.hexToRgb(color);
    for (let i = 0; i <= ARC_STEPS; i++) {
      const x = w * (i / ARC_STEPS - 0.5);
      for (const [y, depth] of [[-h / 2, z - d / 2], [-h / 2, z + d / 2], [h / 2, z + d / 2], [h / 2, z - d / 2]]) {
        const r = RADIUS - TV_MOUNT - depth * 0.71;
        pushVert(g, x, y, depth + (r - Math.sqrt(r * r - (x * scaleX) ** 2)) / 0.71);
      }
      if (i) for (let k = 0; k < 4; k++) {
        const a = (i - 1) * 4 + k, b = (i - 1) * 4 + (k + 1) % 4;
        face(g, [a, a + 4, b + 4, b], rgb, { emissive: 0.12 });
      }
    }
    face(g, [0, 1, 2, 3], rgb); const end = ARC_STEPS * 4;
    face(g, [end + 3, end + 2, end + 1, end], rgb);
    return g;
  };
  // Shared rings through rounded bends: no independently capped beam ends to
  // separate at an elbow. A transported frame also keeps vertical/level runs round.
  const chairTube = (points, width, endWidth = width) => {
    const path = [points[0]], segments = 12, g = geometry(), rgb = BL.math.hexToRgb("#dce3e8");
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const ab = Math.hypot(...b.map((v, k) => v - a[k])), bc = Math.hypot(...c.map((v, k) => v - b[k]));
      const bend = Math.min(0.075, ab * 0.3, bc * 0.3);
      const from = b.map((v, k) => v + (a[k] - v) * bend / ab), to = b.map((v, k) => v + (c[k] - v) * bend / bc);
      for (let j = 0; j <= 4; j++) {
        const t = j / 4;
        path.push(b.map((v, k) => from[k] * (1 - t) ** 2 + 2 * v * t * (1 - t) + to[k] * t * t));
      }
    }
    path.push(points[points.length - 1]);
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < path.length; i++) {
      const p = path[i], a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const tx = (b[0] - a[0]) / length, ty = (b[1] - a[1]) / length, tz = (b[2] - a[2]) / length;
      if (!i) { nx = Math.abs(ty) > 0.9 ? 1 : 0; ny = Math.abs(ty) > 0.9 ? 0 : 1; }
      const dot = nx * tx + ny * ty + nz * tz;
      nx -= dot * tx; ny -= dot * ty; nz -= dot * tz;
      const normalLength = Math.hypot(nx, ny, nz); nx /= normalLength; ny /= normalLength; nz /= normalLength;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const radius = (width + (endWidth - width) * i / (path.length - 1)) / 2;
      for (let j = 0; j < segments; j++) {
        const angle = j * TAU / segments, c = Math.cos(angle), s = Math.sin(angle);
        pushVert(g, p[0] + radius * (nx * c + bx * s), p[1] + radius * (ny * c + by * s), p[2] + radius * (nz * c + bz * s));
        if (i) { const k = i * segments + j, next = i * segments + (j + 1) % segments; face(g, [k - segments, next - segments, next, k], rgb); }
      }
    }
    face(g, Array.from({ length: segments }, (_, i) => segments - 1 - i), rgb);
    face(g, Array.from({ length: segments }, (_, i) => (path.length - 1) * segments + i), rgb);
    return g;
  };
  const chrome = g => { g.chrome = 1; g.smooth = true; return g; };
  const create = ({ root, renderer, camera, pilot, crew, mirror, weather, mouths, places }) => {
    const group = createNode({ position: { x: 0, y: FLOOR, z: 0 }, visible: false });
    const viewRoots = [];
    const cameras = BL.observatoryCameras.create({ renderer, mouths, places }), feeds = cameras.feeds;
    const meshes = [], panels = [], rowJitter = new Float64Array(ROWS), destination = { position: { x: 0, y: FLOOR, z: 7.8 }, yaw: 0, pitch: 0.12, dist: 4, framed: true };
    const tiles = new Array((BANKS + PORTAL_COLS) * ROWS).fill(null);
    const focusMeshes = new Set(), screenTargets = [], screenPicker = BL.weaponTargets.create(screenTargets);
    const screenRay = {}, screenHit = { node: null, owner: null, distance: Infinity };
    let enhancement = null, faceEnhancement = null;
    const hover = { x: -1, y: -1, stable: 0, poll: 0, cooldown: 0, sampled: false, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    let hoverFeed = null;
    const clearHover = () => { if (hoverFeed) hoverFeed.prewarm = false; hoverFeed = null; hover.stable = hover.poll = 0; hover.sampled = false; };
    const hoverAt = (x, y) => { hover.x = x; hover.y = y; };
    const params = new URLSearchParams(location.search);
    const crossingMatrix = BL.math.mat4.create();
    BL.math.mat4.identity(crossingMatrix);
    const arrival = { actor: null, time: 0, duration: 0, x: 0, y: 0, z: 0, dx: 0, dz: 0, lastX: 0, lastZ: 0,
      cameraX: 0, cameraY: 0, cameraZ: 0, heading: 0, back: false };
    let preview = params.get("debug") === "1" && params.get("view") === "architect";
    let active = false, visitor = null, prepared = false, previousAlong = NaN, cooldown = 0, veil = 0, audio = null, returnMirror = null, chairTop = null;
    let broadcast = "feeds", broadcastTime = 0, portraitActor = null, broadcastActor = null;
    let manual = false, manualFace = false, faceWait = FACE_WAIT, faceHold = FACE_HOLD;
    let requestedSweepOrigin = null, sweepOrigin = null;
    let layoutPending = false, layoutStarted = false, layoutFace = false, layoutTime = 0, layoutWait = 3 + Math.random() * 3;
    let parkedActor = null, jetOwned = false, jetWorn = false, pen = null;
    let penButton = null, penHand = null, penArm = null, penArmPitch = NaN, clickTime = 1;
    const penPose = { x: 0, yaw: 0, roll: 0, appliedX: NaN, appliedYaw: NaN, appliedRoll: NaN };
    const penHandPoint = new Float64Array(3);
    const penViewInverse = BL.math.mat4.create(), penCameraView = BL.math.mat4.create();
    const penCameraUp = { x: 0, y: 1, z: 0 };
    const seat = { kind: "architect-chair", combatView: true, x: 0, y: FLOOR + SEAT_TOP, z: 0, ry: 0, floor: FLOOR,
      walkAt: { x: 0, z: 1.7 }, sitter: null, releaseEquipment: () => removePen() };
    const seated = () => active && seat.sitter === pilot.player && !!seat.sitter && seat.sitter.camp.seat === seat;
    const restorePenArm = () => {
      if (!penArm) return;
      // Undo only our last applied pose; standing/another animation may already
      // have supplied a new one. Repeated room updates cannot accumulate offsets.
      if (penArm.position.x === penPose.appliedX) penArm.position.x = penPose.x;
      if (penArm.rotation.y === penPose.appliedYaw) penArm.rotation.y = penPose.yaw;
      if (penArm.rotation.z === penPose.appliedRoll) penArm.rotation.z = penPose.roll;
      if (penArm.rotation.x === penArmPitch) penArm.rotation.x = PEN_ARM_REST;
      penPose.appliedX = penPose.appliedYaw = penPose.appliedRoll = penArmPitch = NaN;
    };
    const removePen = () => {
      if (pen?.parent) removeChild(pen.parent, pen);
      restorePenArm();
      penHand = penArm = null; penArmPitch = NaN;
      clickTime = 1;
    };
    const updatePen = dt => {
      if (!penHand) return;
      clickTime = Math.min(1, clickTime + dt);
      const press = clickTime < 0.05 ? clickTime / 0.05 : clickTime < 0.1 ? 1 : Math.max(0, 1 - (clickTime - 0.1) / 0.07);
      penButton.position.y = 0.19 - press * 0.018;
      restorePenArm();
      const mix = Math.max(0, Math.min(1, pilot.closeMix));
      if (!mix) return;
      penPose.x = penArm.position.x; penPose.yaw = penArm.rotation.y; penPose.roll = penArm.rotation.z;
      // Level the shoulder in first person. Pitch lifts it; yaw/roll never chase
      // the gaze or turn the fist sideways. The authored wrist and elbow stay rigid.
      penArm.rotation.y = penPose.appliedYaw = penPose.yaw * (1 - mix);
      penArm.rotation.z = penPose.appliedRoll = penPose.roll * (1 - mix);
      // Keep the complete bent arm rigid. Solve its shoulder arc against the eye's
      // lower view, rather than aiming from the much lower shoulder toward the horizon.
      const center = BL.scene.boundsOf(penHand.geometry).center;
      penHandPoint.set(center);
      for (let part = penHand; part !== penArm; part = part.parent) {
        BL.scene.updateLocal(part);
        BL.math.mat4.transformPoint(penHandPoint, part.local, penHandPoint[0], penHandPoint[1], penHandPoint[2]);
      }
      const handX = penHandPoint[0], handY = penHandPoint[1], handZ = penHandPoint[2];
      const roll = penArm.rotation.z;
      const y = penHandPoint[0] * penArm.scale.x * Math.sin(roll) + penHandPoint[1] * penArm.scale.y * Math.cos(roll);
      const z = penHandPoint[2] * penArm.scale.z, reach = Math.max(1e-6, Math.hypot(y, z)), angle = Math.atan2(y, z);
      const parent = penArm.parent, math = BL.math.mat4;
      BL.scene.updateLocal(parent);
      if (parent.parent) math.multiply(parent.world, parent.parent.world, parent.local);
      else parent.world.set(parent.local);
      math.invert(penViewInverse, parent.world);
      const eye = camera.position, target = camera.target, pivot = penArm.position;
      const sy = Math.sin(penArm.rotation.y), cy = Math.cos(penArm.rotation.y);
      math.transformPoint(penHandPoint, penViewInverse, eye.x, eye.y, eye.z);
      const eyeY = penHandPoint[1] - pivot.y, eyeZ = (penHandPoint[0] - pivot.x) * sy + (penHandPoint[2] - pivot.z) * cy;
      math.transformPoint(penHandPoint, penViewInverse, target.x, target.y, target.z);
      const forwardY = penHandPoint[1] - pivot.y - eyeY;
      const forwardZ = (penHandPoint[0] - pivot.x) * sy + (penHandPoint[2] - pivot.z) * cy - eyeZ;
      const elevation = Math.atan2(forwardY, forwardZ) - Math.atan(Math.tan(camera.fov / 2) * 0.75);
      const offset = (eyeY * Math.cos(elevation) - eyeZ * Math.sin(elevation)) / reach;
      const aim = angle - elevation - Math.asin(Math.max(-1, Math.min(1, offset)));
      // The upper arm may reach forward, but never overhead or below the seated rest.
      const pitch = Math.max(-Math.PI / 2, Math.min(PEN_ARM_REST, aim));
      penArmPitch = PEN_ARM_REST + (pitch - PEN_ARM_REST) * mix;
      penArm.rotation.x = penArmPitch;
      // Move the whole rigid arm toward the body center instead of yawing it.
      // Project the fist in the actual viewport so wide screens/FOV changes do
      // not crop the pen. Reserve a quarter of the half-view beyond its center.
      BL.scene.updateLocal(penArm);
      math.transformPoint(penHandPoint, penArm.local, handX, handY, handZ);
      math.transformPoint(penHandPoint, parent.world, penHandPoint[0], penHandPoint[1], penHandPoint[2]);
      math.lookAt(penCameraView, eye, target, camera.up || penCameraUp);
      math.transformPoint(penHandPoint, penCameraView, penHandPoint[0], penHandPoint[1], penHandPoint[2]);
      const size = renderer.size, tangent = Math.tan(camera.fov / 2) * size.width / Math.max(1, size.height);
      const edge = (penHandPoint[0] < 0 ? -0.74 : 0.74) * tangent;
      const yaw = penArm.poseYaw || 0, lean = penArm.poseLean || 0;
      const ax = Math.cos(yaw) * Math.cos(lean), ay = Math.cos(yaw) * Math.sin(lean), az = -Math.sin(yaw), w = parent.world;
      const wx = w[0] * ax + w[4] * ay + w[8] * az, wy = w[1] * ax + w[5] * ay + w[9] * az, wz = w[2] * ax + w[6] * ay + w[10] * az;
      const axisX = penCameraView[0] * wx + penCameraView[4] * wy + penCameraView[8] * wz;
      const axisZ = penCameraView[2] * wx + penCameraView[6] * wy + penCameraView[10] * wz;
      const denominator = axisX + edge * axisZ, direction = penPose.x < 0 ? 1 : -1;
      const fit = penHandPoint[2] < -camera.near && Math.abs(denominator) > 1e-5
        ? direction * (-edge * penHandPoint[2] - penHandPoint[0]) / denominator : 0;
      const lift = (PEN_ARM_REST - pitch) / (PEN_ARM_REST + Math.PI / 2), ease = lift * lift * (3 - 2 * lift);
      const width = Math.abs(penPose.x), shift = Math.min(width * 0.75, Math.max(width * 0.25, fit)) * ease * mix;
      penArm.position.x = penPose.appliedX = penPose.x + direction * shift;
    };
    const parkEquipment = actor => {
      if (actor === parkedActor) return;
      removePen();
      if (parkedActor) {
        crew.unparkWeapons(parkedActor);
        crew.setJetpackOwnership(parkedActor, jetOwned);
        if (jetOwned && jetWorn) crew.wearJetpack(parkedActor, parkedActor.jetpackGeometry, parkedActor.jetpackFlameGeometry);
      }
      parkedActor = actor;
      if (actor) {
        jetOwned = !!actor.jetpackOwned; jetWorn = !!actor.jet;
        crew.parkWeapons(actor); crew.setJetpackOwnership(actor, false);
      }
      pilot.refreshCombat();
    };
    const chairClear = (x, y, z, toX, toY, toZ, radius, height) => {
      if (!segmentClear(x, y, z, toX, toY, toZ, radius, height)) return false;
      const sr = Math.sin(seat.ry), cr = Math.cos(seat.ry);
      const lx = x * cr - z * sr, lz = x * sr + z * cr;
      const dx = (toX - x) * cr - (toZ - z) * sr, dz = (toX - x) * sr + (toZ - z) * cr;
      for (const b of CHAIR_SOLIDS) if (!BL.terrain.segmentBoxClear(lx, y - FLOOR, lz, dx, toY - y, dz, radius, height, ...b)) return false;
      return true;
    };
    const supportAt = (x, z, from, rise = 0, radius = 0.3) => {
      const sr = Math.sin(seat.ry), cr = Math.cos(seat.ry), lx = x * cr - z * sr, lz = x * sr + z * cr;
      let floor = FLOOR;
      for (const b of CHAIR_SOLIDS) if (FLOOR + b[4] <= from + rise + 1e-7
        && lx > b[0] - radius && lx < b[3] + radius && lz > b[2] - radius && lz < b[5] + radius) floor = Math.max(floor, FLOOR + b[4]);
      return floor;
    };
    const turnChair = () => {
      chairTop.rotation.y = seat.ry;
      seat.walkAt.x = Math.sin(seat.ry) * 1.7; seat.walkAt.z = Math.cos(seat.ry) * 1.7;
    };
    const sit = () => {
      if (!active || arrival.actor || !crew.sitPlayer(seat)) return false;
      seat.ry = pilot.orbit.yaw + Math.PI; turnChair();
      seat.sitter.root.rotation.y = seat.ry;
      penHand = seat.sitter.parts.fingersR;
      const actor = seat.sitter;
      penArm = actor.parts.armR;
      // Run the barrel through the fist's depth center, behind the thumb on its palm side.
      if (actor.modelled && actor.fist) {
        const unit = actor.fist.palm / (1.1 * actor.armScale);
        pen.position.x = -0.16 * unit; pen.position.y = -0.35 * unit; pen.position.z = 0;
        pen.scale.x = pen.scale.y = pen.scale.z = 14 * unit;
      } else {
        const b = BL.scene.boundsOf(penHand.geometry), h = actor.traits.height;
        pen.position.x = b.center[0] - h * 0.065; pen.position.y = b.center[1]; pen.position.z = 0;
        pen.scale.x = pen.scale.y = pen.scale.z = h;
      }
      penButton.position.y = 0.19;
      addChild(penHand, pen);
      clickTime = 1;
      updateBroadcast(0, seat.sitter);
      return true;
    };
    const add = (g, parent = group, position = null, yaw = 0) => {
      g.architectRoom = true;
      meshes.push(g);
      const n = createNode({ geometry: g, rotation: { x: 0, y: yaw, z: 0 }, ...(position ? { position } : {}) });
      addChild(parent, n);
      return n;
    };
    const prepare = () => {
      if (prepared) return;
      prepared = true;
      addChild(root, group);
      add(disc(RADIUS + 0.3, 0, "#bdc8c7"));
      // The hangar's softened planar reflection, shared by the whole polished floor.
      if (renderer.kind === "webgl2") {
        const polish = disc(RADIUS + 0.2, 0, "#000000");
        for (let i = 0; i < polish.verts.length; i += 3) { polish.verts[i + 1] = -polish.verts[i + 2]; polish.verts[i + 2] = 0; }
        polish.reflector = true; polish.gloss = 0.3;
        add(polish, group, { x: 0, y: 0.014, z: 0 }).rotation.x = -Math.PI / 2;
      }
      const ceiling = disc(RADIUS + 0.3, HEIGHT, "#ffffff", true);
      for (const f of ceiling.faces) f.emissive = 1;
      add(ceiling);
      // Tile seams remain geometry, so both renderers show the floor's scale.
      const seams = [];
      for (let i = -9; i <= 9; i++) {
        const length = Math.sqrt(RADIUS * RADIUS - i * i) * 2;
        seams.push(box({ w: 0.008, h: 0.004, d: length, color: "#8e9d9c", emissive: 0.2, offset: { x: i, y: 0.003 } }));
        seams.push(box({ w: length, h: 0.004, d: 0.008, color: "#8e9d9c", emissive: 0.2, offset: { y: 0.003, z: i } }));
      }
      add(merge(...seams));
      cameras.prepare();
      for (const feed of feeds) feed.focusSize = ENHANCEMENT_SIZE;
      cameras.portrait.focusSize = ENHANCEMENT_SIZE;
      const housings = new Map(), glasses = new Map();
      // Wall and return glass share the same cylinder and exact boundary vertices.
      const walls = geometry(), rgb = BL.math.hexToRgb(WALL);
      const wall = (ax, az, bx, bz, low = 0, high = HEIGHT) => {
        const ids = [pushVert(walls, ax, low, az), pushVert(walls, ax, high, az),
          pushVert(walls, bx, high, bz), pushVert(walls, bx, low, bz)];
        face(walls, ids, rgb, { emissive: 0.05 });
      };
      let ax = RETURN_HALF_W, az = RETURN_Z;
      for (let i = 0; i < BANKS * ARC_STEPS; i++) {
        const a = PORTAL_ANGLE + (i + 1) * BANK_ANGLE / ARC_STEPS;
        const bx = i === BANKS * ARC_STEPS - 1 ? -RETURN_HALF_W : Math.sin(a) * RADIUS;
        const bz = i === BANKS * ARC_STEPS - 1 ? RETURN_Z : Math.cos(a) * RADIUS;
        wall(ax, az, bx, bz); ax = bx; az = bz;
      }
      for (let i = 0; i < PORTAL_COLS * ARC_STEPS; i++) {
        const a = -PORTAL_ANGLE + i * 2 * PORTAL_ANGLE / (PORTAL_COLS * ARC_STEPS);
        const b = -PORTAL_ANGLE + (i + 1) * 2 * PORTAL_ANGLE / (PORTAL_COLS * ARC_STEPS);
        const ax = Math.sin(a) * RADIUS, az = Math.cos(a) * RADIUS, bx = Math.sin(b) * RADIUS, bz = Math.cos(b) * RADIUS;
        wall(ax, az, bx, bz, RETURN_HEIGHT);
      }
      add(walls);
      const layout = panelLayout(feeds.length, true);
      const rackAt = (bank, col, x, row, angle) => {
        const pitchX = col < BANKS ? RADIUS * BANK_ANGLE : PORTAL_PITCH;
        const scaleX = (pitchX - GAP) / 3.36, scaleY = (PITCH - GAP) / 1.96;
        const rack = createNode({ position: { x, y: PITCH * (row + 0.5) + ROW_OFFSET, z: TV_MOUNT },
          scale: { x: scaleX, y: scaleY, z: 0.71 } });
        addChild(bank, rack);
        let housing = housings.get(pitchX), glass = glasses.get(pitchX);
        if (!housing) {
          housing = merge(curvedCase(3.36, 1.96, TV_DEPTH, 0, scaleX, "#08090b"),
            curvedCase(3.18, 1.81, 0.012, 0.056, scaleX, BEZEL));
          glass = BL.observatoryCameras.curvedSurface(3.08, 1.72, scaleX, 0.71, SCREEN_RADIUS - 0.004 * 0.71);
          for (const f of glass.faces) { f.color = [105, 132, 141]; f.emissive = 0.12; }
          glass.glassOpacity = 0.035; glass.glassGrazing = 0.26;
          housings.set(pitchX, housing); glasses.set(pitchX, glass);
        }
        add(housing, rack); add(glass, rack, { x: 0, y: 0, z: TV_GLASS });
        const group = layout.groups[layout.cells[row * layout.cols + col]], feed = feeds[group.slot];
        const normal = cameras.panel(feed, group.size, col - group.col, row - group.row, pitchX, PITCH, scaleX, scaleY, SCREEN_RADIUS);
        const portrait = cameras.panel(cameras.portrait, 1, 0, 0, pitchX, PITCH, scaleX, scaleY, SCREEN_RADIUS);
        const node = add(normal, rack, { x: 0, y: 0, z: TV_FACE });
        // Spread from the mirror around both sides, with a small randomized middle-row lead.
        panels.push({ node, normal, portrait, portraitSingle: portrait, row, col, angle, pitchX, scaleX, scaleY, next: null, previous: null, group: group.row * layout.cols + group.col, size: group.size,
          distance: Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) / Math.PI, delay: 0, flashTime: 0 });
        tiles[row * layout.cols + col] = panels[panels.length - 1];
      };
      for (let i = 0; i < BANKS; i++) {
        const angle = PORTAL_ANGLE + (i + 0.5) * BANK_ANGLE;
        const bank = createNode({ position: { x: Math.sin(angle) * RADIUS, y: 0, z: Math.cos(angle) * RADIUS },
          rotation: { x: 0, y: angle + Math.PI, z: 0 } });
        addChild(group, bank);
        for (let row = 0; row < ROWS; row++) rackAt(bank, i, 0, row, angle);
      }
      const portal = createNode({ position: { x: 0, y: 0, z: RADIUS }, rotation: { x: 0, y: Math.PI, z: 0 } });
      addChild(group, portal);
      // The monitors and feed-only infill follow the same arc as the usable glass.
      for (let col = 0; col < PORTAL_COLS; col++) {
        const angle = TAU - PORTAL_ANGLE + (col + 0.5) * 2 * PORTAL_ANGLE / PORTAL_COLS;
        const bank = createNode({ position: { x: Math.sin(angle) * RADIUS, y: 0, z: Math.cos(angle) * RADIUS },
          rotation: { x: 0, y: angle + Math.PI, z: 0 } });
        addChild(group, bank);
        for (let row = MIRROR_ROWS; row < ROWS; row++) rackAt(bank, BANKS + col, 0, row, angle);
        const infill = createNode({ cameraHidden: true }); addChild(bank, infill);
        const pitchX = PORTAL_PITCH, scaleX = (pitchX - GAP) / 3.36, scaleY = (PITCH - GAP) / 1.96;
        const faceTile = cameras.panel(cameras.portrait, 1, 0, 0, pitchX, PITCH, scaleX, scaleY, SCREEN_RADIUS);
        const infillScreen = { ...faceTile, architectFeedOnly: true, imageSurface: { ...faceTile.imageSurface, seedFeed: feeds[0] } };
        const infillFrame = { ...housings.get(pitchX), castShadow: false, architectFeedOnly: true };
        for (let row = 0; row < MIRROR_ROWS; row++) {
          const rack = createNode({ position: { x: 0, y: PITCH * (row + 0.5) + ROW_OFFSET, z: TV_MOUNT }, scale: { x: scaleX, y: scaleY, z: 0.71 } });
          addChild(infill, rack); add(infillFrame, rack); add(infillScreen, rack, { x: 0, y: 0, z: TV_FACE });
        }
      }
      const frame = geometry(), glass = geometry(), silver = BL.math.hexToRgb("#81919c"), segments = PORTAL_COLS * ARC_STEPS;
      // Match the outer casing edges of the four columns above the opening and
      // rows 0–3 beside it, at the casing's front radius, not a flat chord.
      const frameRadius = RADIUS - TV_MOUNT - TV_DEPTH * 0.5 * 0.71;
      const frameAngle = PORTAL_ANGLE - PORTAL_PITCH / (2 * RADIUS) + Math.asin((PORTAL_PITCH - GAP) / (2 * frameRadius));
      const borderX = (PORTAL_PITCH - GAP) * (3.36 - 3.08) / (2 * 3.36);
      const innerAngle = frameAngle - borderX / frameRadius, low = GAP + TV_BORDER_Y, high = MIRROR_ROWS * PITCH + TV_BORDER_Y;
      const innerLow = low + TV_BORDER_Y, innerHigh = high - TV_BORDER_Y;
      const angles = [-frameAngle];
      for (let i = 0; i <= segments; i++) angles.push(-innerAngle + i * 2 * innerAngle / segments);
      angles.push(frameAngle);
      const trim = BL.math.hexToRgb(BEZEL), surround = BL.math.hexToRgb(WALL);
      const band = (arc, bottom, top, front, back, color) => {
        const start = frame.verts.length / 3;
        for (let i = 0; i < arc.length; i++) {
          const a = arc[i];
          for (const [r, y] of [[front, bottom], [front, top], [back, bottom], [back, top]])
            pushVert(frame, Math.sin(a) * r, y, RADIUS - Math.cos(a) * r);
          if (i) {
            const a = start + (i - 1) * 4, b = a + 4;
            for (const ids of [[a, b, b + 1, a + 1], [a + 2, a + 3, b + 3, b + 2],
              [a, a + 2, b + 2, b], [a + 1, b + 1, b + 3, a + 3]]) face(frame, ids, color, { emissive: 0.12 });
          }
        }
        const end = frame.verts.length / 3 - 4;
        face(frame, [start, start + 1, start + 3, start + 2], color);
        face(frame, [end, end + 2, end + 3, end + 1], color);
      };
      band(angles, low, innerLow, frameRadius, RADIUS, trim);
      band(angles, innerHigh, high, frameRadius, RADIUS, trim);
      band([-frameAngle, -innerAngle], innerLow, innerHigh, frameRadius, RADIUS, trim);
      band([innerAngle, frameAngle], innerLow, innerHigh, frameRadius, RADIUS, trim);
      // Seal the recess up to the original wall opening. The glass stays full
      // sized behind this surround; no exposed reflective sliver or outdoor seam.
      band([-PORTAL_ANGLE, ...angles, PORTAL_ANGLE], 0, low, RADIUS - 0.002, RADIUS, surround);
      band([-PORTAL_ANGLE, -frameAngle], low, high, RADIUS - 0.002, RADIUS, surround);
      band([frameAngle, PORTAL_ANGLE], low, high, RADIUS - 0.002, RADIUS, surround);
      glass.normals = [];
      for (let i = 0; i <= segments; i++) {
        const a = -PORTAL_ANGLE + i * 2 * PORTAL_ANGLE / segments;
        const x = Math.sin(a) * RADIUS, z = RADIUS - Math.cos(a) * RADIUS;
        pushVert(glass, x, -RETURN_HEIGHT / 2, z); pushVert(glass, x, RETURN_HEIGHT / 2, z);
        glass.normals.push(-Math.sin(a), 0, Math.cos(a), -Math.sin(a), 0, Math.cos(a));
        if (i) {
          const j = (i - 1) * 2;
          face(glass, [j, j + 2, j + 3, j + 1], silver);
        }
      }
      glass.reflector = true; glass.reflectorCurved = true; glass.castShadow = false;
      add(frame, portal);
      // One shared tangent-plane capture keeps the curved surface within the existing reflection budget.
      returnMirror = add(glass, portal, { x: 0, y: RETURN_HEIGHT / 2, z: 0 });
      returnMirror.reflectionRevision = 0;
      // Sculpted black leather over a reclining shell, on a real five-spoke swivel pedestal.
      const metal = "#dce3e8", dark = "#171c20";
      const base = [lathe({ profile: [[0, 0.15], [0.18, 0.15], [0.18, 0.25], [0.12, 0.31], [0.075, 0.31], [0.075, 0.56], [0, 0.56]],
        segments: 20, color: metal })];
      const wheel = lathe({ profile: [[0, -0.035], [0.08, -0.035], [0.11, -0.02], [0.11, 0.02], [0.08, 0.035], [0, 0.035]],
        segments: 16, color: "#111518" });
      wheel.smooth = true;
      const hub = chrome(lathe({ profile: [[0, -0.005], [0.035, -0.005], [0.035, 0.005], [0, 0.005]], segments: 12, color: metal }));
      const fork = chrome(bevelBox({ w: 0.18, h: 0.11, d: 0.11, bevel: 0.025, color: metal }));
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5, sx = Math.sin(a), cz = Math.cos(a);
        base.push(chairTube([[sx * 0.12, 0.27, cz * 0.12], [sx * 0.43, 0.2, cz * 0.43], [sx * 0.73, 0.16, cz * 0.73]], 0.1, 0.075));
        const caster = createNode({ position: { x: sx * 0.73, y: 0.115, z: cz * 0.73 }, rotation: { x: 0, y: a + 0.3, z: 0 } });
        addChild(group, caster);
        add(fork, caster, { x: 0, y: 0.07, z: 0 });
        for (const side of [-1, 1]) {
          add(wheel, caster, { x: side * 0.09, y: 0, z: 0 }).rotation.z = Math.PI / 2;
          add(hub, caster, { x: side * 0.127, y: 0, z: 0 }).rotation.z = Math.PI / 2;
        }
      }
      add(chrome(merge(...base)));
      chairTop = createNode(); addChild(group, chairTop);
      const pad = (w, h, d, r, color, x, y, z, recline = 0) => {
        const node = add(cushion(w, h, d, r, color), chairTop, { x, y, z }); node.rotation.x = recline; return node;
      };
      pad(1.32, 0.2, 1.12, 0.085, "#14171a", 0, SEAT_TOP - 0.1, 0);
      pad(1.25, 0.065, 1.05, 0.025, "#080b0e", 0, 0.52, -0.015);
      pad(1.3, 1.38, 0.23, 0.095, "#0b0e11", 0, 1.36, -0.59, -0.09);
      for (let i = 0; i < 3; i++) {
        const y = 0.91 + i * 0.4, z = -0.4 - i * 0.035;
        pad(1.15 + (i === 1 ? 0.025 : 0), 0.375, 0.17, 0.08, i === 1 ? "#1b1e21" : "#16191c", 0, y, z, -0.09);
        // A recessed seam and narrow welt separate the upholstered panels.
        add(beam(-0.51, y - 0.17, z + 0.065, 0.51, y - 0.17, z + 0.065, 0.012, "#080a0c"), chairTop);
      }
      const chairFrame = [];
      for (const side of [-1, 1]) {
        const x = side * 0.77;
        // One continuous arm loop enters the seat at both ends; its top run
        // embeds into the pad. Back stays also begin inside the seat shell.
        chairFrame.push(chairTube([[side * 0.52, 0.53, -0.39], [x, 0.56, -0.39],
          [x, 0.95, -0.48], [x, 1.085, -0.37], [x, 1.085, 0.40],
          [x, 0.56, 0.35], [side * 0.52, 0.53, 0.35]], 0.06));
        chairFrame.push(chairTube([[side * 0.59, 0.53, -0.40], [side * 0.59, 0.70, -0.68],
          [side * 0.59, 1.92, -0.76]], 0.048));
        pad(0.155, 0.11, 1.02, 0.05, "#111518", x, 1.125, 0.015);
      }
      chairFrame.push(chairTube([[0.18, 0.51, 0.05], [0.58, 0.48, 0.13]], 0.028));
      add(chrome(merge(...chairFrame)), chairTop);
      pad(0.19, 0.055, 0.085, 0.025, dark, 0.57, 0.48, 0.13);
      const penGeometry = merge(lathe({ profile: [[0.012, -0.13], [0.016, -0.1], [0.016, 0.15], [0.012, 0.17]],
        segments: 8, color: "#202932", emissive: 0.2 }),
        lathe({ profile: [[0.002, -0.18], [0.012, -0.13]], segments: 8, color: "#c9d0d4", emissive: 0.35 }),
        box({ w: 0.012, h: 0.09, d: 0.012, color: "#c9d0d4", emissive: 0.35, offset: { x: 0.02, y: 0.11 } }));
      penGeometry.characterPart = true;
      pen = add(penGeometry, group); pen.rotation.z = Math.PI / 2; removePen();
      // Close the clicker's top so looking down at the pen never exposes a hollow tube.
      const buttonGeometry = lathe({ profile: [[0.011, -0.02], [0.011, 0.02], [0, 0.02]], segments: 8, color: "#c9d0d4", emissive: 0.35 });
      buttonGeometry.characterPart = true;
      penButton = add(buttonGeometry, pen, { x: 0, y: 0.19, z: 0 });
      const live = new Set(meshes); cameras.liveGeometry(live); renderer.prepareScene(live);
      for (const mesh of live) renderer.prepareGeometry(mesh);
      const byNode = new Map(panels.map(p => [p.node, p]));
      const register = node => {
        if (node.geometry && !node.geometry.glassOpacity && !node.geometry.architectFeedOnly) {
          screenTargets.push({ node, owner: { panel: byNode.get(node) || null } });
          screenPicker.register(node);
        }
        for (const child of node.children) register(child);
      };
      register(group);
    };
    const trimFocus = () => {
      for (const g of focusMeshes) {
        if (panels.some(p => p.normal === g || p.portrait === g || p.previous?.normal === g || p.next?.normal === g)) continue;
        const surfaces = g.imageSurface.feed.surfaces, index = surfaces.indexOf(g);
        if (index >= 0) surfaces.splice(index, 1);
        renderer.releaseGeometry(g); focusMeshes.delete(g);
      }
    };
    const finishLayout = () => {
      layoutPending = layoutStarted = layoutFace = false; layoutTime = 0; layoutWait = 3 + Math.random() * 3;
      for (const p of panels) {
        p.next = p.previous = null;
        if (p.saved && p.normal === p.saved.normal) p.saved = null;
      }
      for (const feed of feeds) feed.forceCapture = false;
      trimFocus();
    };
    const retileFocusEdges = (inside, focusFeed) => {
      const cols = BANKS + PORTAL_COLS, groups = new Map(), repairs = new Map(), loose = [];
      const baseline = p => p.saved || p;
      const plannedFeed = p => inside(p) ? focusFeed : (repairs.get(p) || baseline(p)).normal.imageSurface.feed;
      const neighbors = (p, visit) => {
        for (let y = Math.max(0, p.row - 1); y <= Math.min(ROWS - 1, p.row + 1); y++)
          for (let x = p.col - 1; x <= p.col + 1; x++) {
            const other = tiles[y * cols + (x + cols) % cols];
            if (other && other !== p) visit(other);
          }
      };
      const assign = (p, feed, size, origin) => repairs.set(p, {
        normal: cameras.panel(feed, size, p.col - origin.col, p.row - origin.row, p.pitchX, PITCH, p.scaleX, p.scaleY, SCREEN_RADIUS),
        group: origin.row * cols + origin.col, size
      });
      // Plan against the saved small layout, so moving the enhancement restores
      // its old edge repairs before working out which mosaics the new patch cuts.
      for (const p of panels) {
        const base = baseline(p);
        if (base.size < 2 || base.size > 3) continue;
        let group = groups.get(base.group);
        if (!group) groups.set(base.group, group = []);
        group.push(p);
      }
      for (const members of groups.values()) {
        const remaining = members.filter(p => !inside(p));
        if (!remaining.length || remaining.length === members.length) continue;
        const base = baseline(members[0]), feed = base.normal.imageSurface.feed, available = new Set(remaining);
        let keep = null, keepSize = base.size - 1;
        for (; keepSize > 0; keepSize--) {
          let best = Infinity;
          for (const origin of remaining) {
            const candidate = [];
            for (let y = 0; y < keepSize; y++) for (let x = 0; x < keepSize; x++) {
              const p = tiles[(origin.row + y) * cols + origin.col + x];
              if (available.has(p)) candidate.push(p);
            }
            if (candidate.length !== keepSize * keepSize) continue;
            let score = 0;
            for (const p of candidate) neighbors(p, other => {
              if (!available.has(other) && plannedFeed(other) === feed) score++;
            });
            if (score < best) { best = score; keep = candidate; }
          }
          if (keep) break;
        }
        // Retain the old shot once, in the largest smaller square that fits.
        // Reserve every retained shot before choosing the new neighboring shots.
        for (const p of keep) assign(p, feed, keepSize, keep[0]);
        for (const p of remaining) if (!repairs.has(p)) loose.push(p);
      }
      const uses = new Uint16Array(feeds.length);
      for (const p of loose) {
        const excluded = new Set([focusFeed, baseline(p).normal.imageSurface.feed, p.normal.imageSurface.feed]);
        neighbors(p, other => { excluded.add(plannedFeed(other)); excluded.add(other.normal.imageSurface.feed); });
        let choice = -1, best = Infinity, ties = 0;
        for (let i = 0; i < feeds.length; i++) {
          if (excluded.has(feeds[i]) || uses[i] > best) continue;
          if (uses[i] < best) { best = uses[i]; ties = 0; }
          if (Math.random() * ++ties < 1) choice = i;
        }
        // At most 19 old/new neighboring slots are excluded out of 32.
        uses[choice]++; assign(p, feeds[choice], 1, p);
      }
      return repairs;
    };
    const stageEnhancement = (selected, faceView = false) => {
      const cols = BANKS + PORTAL_COLS, size = ENHANCEMENT_SIZE;
      let patch = null, feed = null;
      if (selected) {
        feed = faceView ? cameras.portrait : selected.normal.imageSurface.feed;
        const fromRow = faceView ? selected.row : Math.floor(selected.group / cols), fromCol = faceView ? selected.col : selected.group % cols;
        const fromSize = faceView ? 1 : selected.size;
        let best = Infinity;
        // Find the closest complete 7x7 on the circular wall, including across
        // its wrap. The four missing mirror rows must never become screens.
        for (let row = 0; row <= ROWS - size; row++) for (let col = 0; col < cols; col++) {
          const offset = (fromCol - col + cols) % cols;
          if (offset + fromSize > size || fromRow < row || fromRow + fromSize > row + size) continue;
          let valid = true;
          for (let y = row; valid && y < row + size; y++) for (let x = 0; x < size; x++)
            if (!tiles[y * cols + (col + x) % cols]) { valid = false; break; }
          if (!valid) continue;
          const distance = (offset + fromSize / 2 - size / 2) ** 2 + (fromRow + fromSize / 2 - row - size / 2) ** 2;
          if (distance < best) { best = distance; patch = { row, col }; }
        }
        if (!patch) return false;
      }
      const insidePatch = p => patch && (p.col - patch.col + cols) % cols < size && p.row >= patch.row && p.row < patch.row + size;
      const repairs = patch && !faceView ? retileFocusEdges(insidePatch, feed) : null;
      if (faceView) cameras.portrait.enhanced = !!patch;
      else for (const f of feeds) f.enhanced = f === feed;
      clearHover();
      if (feed) feed.focusPending = true;
      if (faceView) faceEnhancement = patch && { ...patch, feed };
      else enhancement = patch && { ...patch, feed };
      const pitch = col => col % cols < BANKS ? RADIUS * BANK_ANGLE : PORTAL_PITCH;
      let span = 0;
      if (patch) for (let x = 0; x < size; x++) span += pitch(patch.col + x);
      const firstInset = patch ? (pitch(patch.col) - (pitch(patch.col) - GAP) * 3.08 / 3.36) / 2 : 0;
      const lastInset = patch ? (pitch(patch.col + size - 1) - (pitch(patch.col + size - 1) - GAP) * 3.08 / 3.36) / 2 : 0;
      const height = (size - 1) * PITCH + (PITCH - GAP) * 1.72 / 1.96;
      const width = Math.max(span - firstInset - lastInset, height * 16 / 9), imageHeight = width * 9 / 16;
      for (let row = 0; row < ROWS; row++) rowJitter[row] = Math.random() * 0.05;
      for (const p of panels) {
        const x = patch ? (p.col - patch.col + cols) % cols : -1, y = patch ? p.row - patch.row : -1;
        const inside = patch && x < size && y >= 0 && y < size;
        const repair = repairs?.get(p);
        if (!inside && !repair && !(faceView ? p.portrait !== p.portraitSingle : p.saved)) continue;
        p.previous = { normal: faceView ? p.portrait : p.normal, group: p.group, size: p.size };
        if (!faceView && (inside || repair) && !p.saved) p.saved = p.previous;
        if (inside) {
          let center = p.pitchX / 2;
          for (let i = 0; i < x; i++) center += pitch(patch.col + i);
          // UVs use physical arc widths, including the narrower columns above
          // the mirror. Dedicated temporary surfaces leave the small-grid cache bounded.
          const normal = { ...p.normal, cameraFeedGrid: size, imageSurface: { ...feed.geometry.imageSurface,
            rect: [(-width / 2 + center - (span + firstInset - lastInset) / 2) / p.scaleX,
              (-imageHeight / 2 - (y - (size - 1) / 2) * PITCH) / p.scaleY, width / p.scaleX, imageHeight / p.scaleY] } };
          focusMeshes.add(normal); feed.surfaces.push(normal); renderer.prepareGeometry(normal);
          p.next = { normal, group: patch.row * cols + patch.col, size };
          p.delay = Math.abs(x - (size - 1) / 2) * 0.10 + y * 0.12 + rowJitter[p.row];
        } else if (repair) {
          renderer.prepareGeometry(repair.normal); p.next = repair;
          const localX = x > cols / 2 ? x - cols : x;
          p.delay = Math.abs(localX - (size - 1) / 2) * 0.10 + Math.max(0, y) * 0.12 + rowJitter[p.row];
        } else {
          p.next = faceView ? { normal: p.portraitSingle } : p.saved;
          p.delay = p.distance * 0.35 + p.row / ROWS * 0.55 + rowJitter[p.row];
        }
      }
      layoutPending = true; layoutStarted = false; layoutFace = faceView; layoutTime = 0;
      return true;
    };
    const stageLayout = () => {
      const cols = BANKS + PORTAL_COLS, selected = panels[Math.floor(Math.random() * panels.length)];
      const patch = { col: selected.group % cols, row: Math.floor(selected.group / cols), size: selected.size, maxSize: 1 };
      // A patch may absorb complete existing groups, never slice a neighboring mosaic in half.
      const fits = size => {
        if (patch.row + size > ROWS || patch.col + size > (patch.col < BANKS ? BANKS : cols)) return false;
        for (let row = patch.row; row < patch.row + size; row++) for (let col = patch.col; col < patch.col + size; col++) {
          const p = tiles[row * cols + col];
          if (!p || p.group % cols < patch.col || Math.floor(p.group / cols) < patch.row
            || p.group % cols + p.size > patch.col + size || Math.floor(p.group / cols) + p.size > patch.row + size) return false;
        }
        return true;
      };
      if (selected.size === 1) patch.size = patch.maxSize = fits(3) ? 3 : fits(2) ? 2 : 1;
      else patch.maxSize = selected.size === 3 && Math.random() < 0.35 ? 2 : 1;
      const previous = new Int16Array(cols * ROWS).fill(-1);
      for (const p of panels) previous[p.row * cols + p.col] = feeds.indexOf(p.normal.imageSurface.feed);
      const layout = panelLayout(feeds.length, false, previous, patch);
      let nearest = Infinity, furthest = 0;
      for (let row = patch.row; row < patch.row + patch.size; row++) rowJitter[row] = Math.random() * 0.05;
      for (const p of panels) {
        const id = layout.cells[p.row * layout.cols + p.col], g = layout.groups[id];
        if (!g) continue;
        const normal = cameras.panel(feeds[g.slot], g.size, p.col - g.col, p.row - g.row, p.pitchX, PITCH, p.scaleX, p.scaleY, SCREEN_RADIUS);
        renderer.prepareGeometry(normal);
        p.previous = { normal: p.normal, group: p.group, size: p.size };
        p.next = { normal, group: g.row * cols + g.col, size: g.size };
        nearest = Math.min(nearest, p.distance); furthest = Math.max(furthest, p.distance);
      }
      for (const p of panels) if (p.next) p.delay = (p.distance - nearest) / Math.max(0.001, furthest - nearest) * 0.4
        + (p.row - patch.row) * 0.2 + rowJitter[p.row] + Math.random() * 0.01;
      layoutPending = true; layoutStarted = false; layoutTime = 0;
    };
    const sweepDelays = () => {
      for (let row = 0; row < ROWS; row++) {
        const edge = Math.abs(row * 2 / (ROWS - 1) - 1);
        rowJitter[row] = 2.12 + edge * 0.18 + Math.random() * 0.14;
      }
      // Manual sweeps grow from the clicked tile across the unwrapped curved wall,
      // including vertical distance. Wrap the angle so both routes around the room meet.
      // Automatic sweeps retain their mirror origin; both keep row and tile variation.
      for (const p of panels) {
        const angle = sweepOrigin ? p.angle - sweepOrigin.angle : 0;
        const distance = sweepOrigin ? Math.hypot(Math.atan2(Math.sin(angle), Math.cos(angle)) * SCREEN_RADIUS,
          (p.row - sweepOrigin.row) * PITCH) / (Math.PI * SCREEN_RADIUS) : p.distance;
        p.delay = p === sweepOrigin ? 0 : distance * rowJitter[p.row] + Math.random() * 0.038;
      }
    };
    const showTile = (p, geometry) => {
      if (p.node.geometry === geometry) return;
      p.node.geometry = geometry;
      // Use the existing per-instance highlight: no separate flash geometry or camera target.
      p.flashTime = TILE_FLASH; p.node.highlight = 0.9;
      returnMirror.reflectionRevision++;
    };
    const replaceTile = p => {
      if (!p.next || !cameras.ready(p.next.normal.imageSurface.feed)) return false;
      const geometry = p.next.normal;
      if (layoutFace) p.portrait = geometry;
      else { p.normal = geometry; p.group = p.next.group; p.size = p.next.size; }
      p.next = null;
      showTile(p, geometry);
      return true;
    };
    const updateLayout = dt => {
      let ready = true;
      for (const p of panels) if (p.next && !cameras.ready(p.next.normal.imageSurface.feed)) {
        p.next.normal.imageSurface.feed.forceCapture = true; ready = false;
      }
      if (!layoutStarted) {
        if (!ready) return;
        layoutStarted = true; layoutTime = 0;
      } else layoutTime += dt;
      let remaining = false;
      for (const p of panels) if (p.next) {
        if (layoutTime < p.delay || !replaceTile(p)) remaining = true;
      }
      if (!remaining && layoutTime >= PATCH_SWEEP) finishLayout();
    };
    const resetBroadcast = () => {
      // Travel or an actor change cancels an unfinished layout back to its last complete assignment.
      let changed = false;
      for (const p of panels) {
        if (p.previous && !layoutFace) { p.normal = p.previous.normal; p.group = p.previous.group; p.size = p.previous.size; }
        if (p.saved) { p.normal = p.saved.normal; p.group = p.saved.group; p.size = p.saved.size; p.saved = null; }
        changed ||= p.node.geometry !== p.normal || p.flashTime > 0;
        p.portrait = p.portraitSingle;
        p.node.geometry = p.normal; p.flashTime = 0; p.node.highlight = 0;
      }
      if (changed) returnMirror.reflectionRevision++;
      enhancement = faceEnhancement = null;
      clearHover();
      for (const feed of feeds) feed.enhanced = feed.focusPending = false;
      cameras.portrait.enhanced = cameras.portrait.focusPending = false;
      finishLayout();
      broadcast = "feeds"; broadcastTime = 0; portraitActor = broadcastActor = null;
      manual = manualFace = false;
      requestedSweepOrigin = sweepOrigin = null;
      faceWait = FACE_WAIT * (0.75 + Math.random() * 0.5); faceHold = FACE_HOLD * (0.75 + Math.random() * 0.5);
      if (cameras.portrait) cameras.portrait.forceCapture = false;
    };
    const clearHiddenEnhancement = faceView => {
      if (faceView) {
        faceEnhancement = null;
        cameras.portrait.enhanced = cameras.portrait.focusPending = false;
        for (const p of panels) p.portrait = p.portraitSingle;
      } else {
        enhancement = null;
        for (const feed of feeds) feed.enhanced = feed.focusPending = false;
        for (const p of panels) if (p.saved) {
          p.normal = p.saved.normal; p.group = p.saved.group; p.size = p.saved.size; p.saved = null;
        }
      }
      trimFocus();
    };
    const beginSweep = phase => {
      // Reset the incoming view before its first tile. The outgoing enlargement
      // stays intact until the last tile has left it, so the cascade never pops.
      clearHiddenEnhancement(phase === "to-face");
      broadcast = phase; broadcastTime = 0;
      // A click queued during this sweep must not move its origin mid-animation.
      sweepOrigin = manual ? requestedSweepOrigin : null;
      layoutStarted = false;
      sweepDelays();
    };
    const updateBroadcast = (dt, actor) => {
      if (document.hidden) return;
      let fading = false;
      for (const p of panels) if (p.flashTime > 0 && dt > 0) {
        p.flashTime = Math.max(0, p.flashTime - dt);
        const fade = p.flashTime / TILE_FLASH;
        p.node.highlight = 0.9 * fade * fade;
        fading = true;
      }
      // Include the final unlit frame so a reused reflection cannot retain a stale flash.
      if (fading) returnMirror.reflectionRevision++;
      const face = cameras.portrait;
      if (broadcastActor !== actor) { resetBroadcast(); broadcastActor = actor; }
      const holding = seated();
      if (holding !== manual) {
        manual = holding; manualFace = broadcast === "face" || broadcast === "to-face";
        broadcastTime = 0;
        faceWait = FACE_WAIT * (0.75 + Math.random() * 0.5); faceHold = FACE_HOLD * (0.75 + Math.random() * 0.5);
        if (broadcast === "feeds") { portraitActor = null; face.forceCapture = false; }
      }
      broadcastTime += dt;
      if (broadcast === "feeds") {
        if (!manual && faceEnhancement && !layoutPending) {
          faceEnhancement = null; face.enhanced = face.focusPending = false;
          for (const p of panels) p.portrait = p.portraitSingle;
          trimFocus();
        }
        if (layoutPending) updateLayout(dt);
        else if (!manual && enhancement) stageEnhancement(null);
        else if (!enhancement && !portraitActor && !(manual ? manualFace : broadcastTime >= faceWait - 0.75)) {
          layoutWait -= dt;
          if (layoutWait <= 0) stageLayout();
        }
      }
      if (broadcast === "face") {
        if (layoutPending) updateLayout(dt);
        else if (!manual && faceEnhancement) stageEnhancement(null, true);
      }
      if (broadcast === "feeds" && !layoutPending && (manual ? manualFace : broadcastTime >= faceWait - 0.75) && portraitActor !== actor) {
        portraitActor = actor; face.pending = true; face.last = -Infinity; face.forceCapture = true;
        face.geometry.imageSurface.version++;
      }
      // Face framing follows the authored head transform, including swivel, looking and custom proportions.
      if (broadcast !== "feeds" || portraitActor) {
        BL.scene.updateWorld(actor.root, actor.root.parent?.world);
        const head = actor.parts.head, m = head.world, b = BL.scene.boundsOf(head.geometry), c = b.center, cam = face.camera;
        cam.target.x = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12];
        cam.target.y = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13];
        cam.target.z = m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14];
        const scale = Math.hypot(m[4], m[5], m[6]), widthScale = Math.hypot(m[0], m[1], m[2]);
        const distance = Math.max(0.65, (b.max[1] - b.min[1]) * scale * 2, (b.max[0] - b.min[0]) * widthScale * 1.3);
        const forward = Math.hypot(m[8], m[9], m[10]) || 1, up = scale || 1;
        cam.position.x = cam.target.x + m[8] / forward * distance;
        cam.position.y = cam.target.y + m[9] / forward * distance;
        cam.position.z = cam.target.z + m[10] / forward * distance;
        clampCamera(cam.position);
        cam.up.x = m[4] / up; cam.up.y = m[5] / up; cam.up.z = m[6] / up;
        cam.far = distance + RADIUS * 2 + 1;
      }
      if (broadcast === "feeds" && !layoutPending && (manual ? manualFace : broadcastTime >= faceWait) && cameras.ready(face)) beginSweep("to-face");
      if (broadcast === "face" && !layoutPending && (manual ? !manualFace : broadcastTime >= faceHold)) beginSweep("to-feeds");
      if (broadcast === "to-face" || broadcast === "to-feeds") {
        const toFace = broadcast === "to-face";
        const ready = toFace || cameras.warm();
        if (!toFace && !layoutStarted) {
          if (!ready) return;
          layoutStarted = true; broadcastTime = 0; sweepDelays();
        }
        let remaining = false;
        for (const p of panels) {
          if (broadcastTime < p.delay) { remaining = true; continue; }
          if (toFace) {
            if (cameras.ready(face)) showTile(p, p.portrait);
            else remaining = true;
          } else if (cameras.ready(p.normal.imageSurface.feed)) showTile(p, p.normal);
          else remaining = true;
        }
        if (!remaining && broadcastTime >= FACE_SWEEP) {
          clearHiddenEnhancement(!toFace);
          broadcast = toFace ? "face" : "feeds"; broadcastTime = 0;
          if (!toFace) { finishLayout(); portraitActor = null; faceWait = FACE_WAIT * (0.75 + Math.random() * 0.5); }
          else faceHold = FACE_HOLD * (0.75 + Math.random() * 0.5);
        }
      }
    };
    const toggleView = (x = renderer.size.width / 2, y = renderer.size.height / 2) => {
      if (!seated()) return false;
      renderer.ray(x, y, camera, screenRay);
      if (!screenPicker.ray(screenHit, screenRay.ox, screenRay.oy, screenRay.oz, screenRay.dx, screenRay.dy, screenRay.dz, camera.far, null, null, true)
        || !screenHit.owner.panel) return false;
      const selected = screenHit.owner.panel;
      if (!manual) updateBroadcast(0, pilot.player);
      requestedSweepOrigin = selected;
      manualFace = !manualFace;
      clickTime = 0; audio?.click();
      if (!manualFace && broadcast === "feeds") { portraitActor = null; cameras.portrait.forceCapture = false; }
      return true;
    };
    const enhanceAt = (x = renderer.size.width / 2, y = renderer.size.height / 2) => {
      if (!seated()) return false;
      if (!manual) updateBroadcast(0, pilot.player);
      const faceView = broadcast === "face";
      if (layoutPending || !faceView && (broadcast !== "feeds" || manualFace || portraitActor) || faceView && !manualFace) return true;
      renderer.ray(x, y, camera, screenRay);
      if (!screenPicker.ray(screenHit, screenRay.ox, screenRay.oy, screenRay.oz, screenRay.dx, screenRay.dy, screenRay.dz, camera.far, null, null, true)) return true;
      const selected = screenHit.owner.panel;
      if (!selected) return true;
      const enlarged = faceView ? selected.portrait !== selected.portraitSingle : selected.size === ENHANCEMENT_SIZE;
      if (stageEnhancement(enlarged ? null : selected, faceView)) { clickTime = 0; audio?.click(); }
      return true;
    };
    const updateHover = dt => {
      hover.cooldown = Math.max(0, hover.cooldown - dt);
      const locked = !!document.pointerLockElement;
      if (!seated() || document.hidden || broadcast !== "feeds" || layoutPending || portraitActor || !locked && (hover.x < 0 || hover.y < 0)) { clearHover(); return; }
      if (dt <= 0) return;
      renderer.ray(locked ? renderer.size.width / 2 : hover.x, locked ? renderer.size.height / 2 : hover.y, camera, screenRay);
      const slow = hover.sampled && Math.hypot(screenRay.dx - hover.dx, screenRay.dy - hover.dy, screenRay.dz - hover.dz) < dt * 0.08
        && Math.hypot(screenRay.ox - hover.ox, screenRay.oy - hover.oy, screenRay.oz - hover.oz) < dt * 0.15;
      if (!slow) clearHover();
      hover.sampled = true;
      hover.ox = screenRay.ox; hover.oy = screenRay.oy; hover.oz = screenRay.oz;
      hover.dx = screenRay.dx; hover.dy = screenRay.dy; hover.dz = screenRay.dz;
      hover.stable = slow ? hover.stable + Math.min(dt, 0.1) : 0;
      hover.poll += dt;
      // Only pick after the view settles, and no more than ten times a second.
      // Fast cursor/camera motion cancels speculative detail immediately.
      if (hover.stable < 0.45 || hover.poll < 0.1) return;
      hover.poll = 0;
      const hit = screenPicker.ray(screenHit, screenRay.ox, screenRay.oy, screenRay.oz, screenRay.dx, screenRay.dy, screenRay.dz, camera.far, null, null, true);
      const feed = hit && screenHit.owner.panel?.normal.imageSurface.feed;
      if (feed === hoverFeed) return;
      if (hoverFeed) hoverFeed.prewarm = false;
      hoverFeed = null;
      if (!feed || feed.enhanced || hover.cooldown) return;
      hoverFeed = feed; feed.prewarm = true; hover.cooldown = 1.25;
    };
    const endArrival = () => {
      if (!arrival.actor) return;
      if (pilot.player === arrival.actor) {
        crew.steer(0, 0);
        BL.crew.poseGait(arrival.actor, BL.crew.GAIT.stand);
      }
      arrival.actor = null;
      pilot.setExternalControl(false);
      cooldown = 0.35;
    };
    const updateArrival = (dt) => {
      const actor = arrival.actor;
      if (!actor) return;
      if (actor !== pilot.player) { endArrival(); return; }
      const p = actor.root.position;
      // A respawn or another interaction moving the actor cancels this walk.
      if (Math.hypot(p.x - arrival.lastX, p.z - arrival.lastZ) > 0.5 || Math.abs(p.y - arrival.y) > 1) { endArrival(); return; }
      // Undo only last frame's display clamp before translating the retained
      // view, so approaching the landing does not accumulate a camera offset.
      camera.position.x -= arrival.cameraX; camera.position.y -= arrival.cameraY; camera.position.z -= arrival.cameraZ;
      camera.target.x -= arrival.cameraX; camera.target.y -= arrival.cameraY; camera.target.z -= arrival.cameraZ;
      arrival.time = Math.min(arrival.duration, arrival.time + dt);
      const t = arrival.time / arrival.duration, k = t * t * (3 - 2 * t);
      const x = arrival.x + arrival.dx * k, z = arrival.z + arrival.dz * k;
      // Translate all retained camera anchors with the body: no yaw, pitch,
      // zoom or first/third-person change during the walk or its handoff.
      BL.math.mat4.identity(crossingMatrix);
      crossingMatrix[12] = x - p.x; crossingMatrix[13] = arrival.y - p.y; crossingMatrix[14] = z - p.z;
      p.x = x; p.y = arrival.y; p.z = z;
      arrival.lastX = x; arrival.lastZ = z;
      actor.root.rotation.y = arrival.heading;
      pilot.transformView(crossingMatrix, 0);
      const phase = Math.hypot(arrival.dx, arrival.dz) * k * 4 * (arrival.back ? -1 : 1);
      BL.crew.poseGait(actor, BL.crew.GAIT.walk, phase);
      BL.crew.poseCloseWalk(actor, 0, arrival.back);
      if (active) clampArrivalCamera();
      if (t === 1) endArrival();
    };
    // Explicit relocations/previews stay immediate; physical crossings walk
    // from the glass to the same safe landing used by those relocations.
    const travel = (inside, preserveView = true, walkOut = false) => {
      endArrival();
      const actor = pilot.player, crossing = preserveView && actor && inside !== active;
      if (seat.sitter) crew.standPlayer(seat.sitter);
      prepare(); resetBroadcast(); active = inside; visitor = inside ? actor : null; group.visible = inside; cooldown = 1; veil = 0.45;
      const m = mirror.mouth;
      destination.position.x = inside ? 0 : m.x + Math.sin(m.ry) * 2.4;
      destination.position.y = inside ? FLOOR : m.floorY;
      destination.position.z = inside ? 7.8 : m.z + Math.cos(m.ry) * 2.4;
      if (crossing && walkOut) {
        arrival.dx = destination.position.x; arrival.dz = destination.position.z;
        const outside = mirror.node.position.z + 0.08;
        destination.position.x = inside ? 0 : m.x + Math.sin(m.ry) * outside;
        destination.position.z = inside ? RADIUS - 0.08 : m.z + Math.cos(m.ry) * outside;
        arrival.dx -= destination.position.x; arrival.dz -= destination.position.z;
      }
      destination.yaw = inside ? 0 : m.ry + Math.PI;
      destination.pitch = inside ? 0.08 : pilot.orbit.pitch; destination.dist = Math.min(5, pilot.orbit.dist);
      if (crossing) {
        // Rotate the entire view and body between the two doorway frames. Backing through
        // keeps the mirror in front of the Ooga, with the held movement still pointing away.
        const yaw = inside ? -m.ry : m.ry, c = Math.cos(yaw), s = Math.sin(yaw), p = actor.root.position;
        const lift = actor.viewLift;
        crossingMatrix[0] = crossingMatrix[10] = c;
        crossingMatrix[2] = -s; crossingMatrix[8] = s;
        crossingMatrix[12] = destination.position.x - c * p.x - s * p.z;
        crossingMatrix[13] = destination.position.y + actor.baseY - p.y;
        crossingMatrix[14] = destination.position.z + s * p.x - c * p.z;
        crew.relocatePlayer(destination.position, actor.root.rotation.y + yaw);
        crew.elevate(lift);
        pilot.transformView(crossingMatrix, yaw);
      } else pilot.navigate(destination);
      if (crossing && walkOut) {
        arrival.actor = actor; arrival.time = 0;
        arrival.cameraX = arrival.cameraY = arrival.cameraZ = 0;
        arrival.x = actor.root.position.x; arrival.y = actor.root.position.y; arrival.z = actor.root.position.z;
        arrival.lastX = arrival.x; arrival.lastZ = arrival.z;
        arrival.heading = actor.root.rotation.y;
        arrival.back = Math.sin(arrival.heading) * arrival.dx + Math.cos(arrival.heading) * arrival.dz < 0;
        arrival.duration = Math.hypot(arrival.dx, arrival.dz) / 2.4;
        crew.steer(0, 0);
        pilot.setExternalControl(true);
        if (inside) clampArrivalCamera();
      }
      parkEquipment(inside ? pilot.player : null);
      if (inside && !audio) audio = BL.architectAudio.create();
      audio?.setActive(inside); cameras.setActive(inside); weather.setExterior(!inside);
      previousAlong = NaN;
    };
    const update = (dt) => {
      cooldown = Math.max(0, cooldown - dt); veil = Math.max(0, veil - dt);
      updateArrival(dt);
      const actor = pilot.player;
      if (!actor) { if (active) travel(false); return; }
      if (preview) { preview = false; travel(true, false); }
      const p = actor.root.position, feet = p.y - actor.baseY;
      // This volume overlaps the outdoor abyss. Only travel (or the explicit debug
      // preview above) admits a visitor; falling through these coordinates never does.
      if (active && (actor !== visitor || !contains(p.x, feet, p.z))) { resetBroadcast(); active = false; visitor = null; group.visible = false; audio?.setActive(false); cameras.setActive(false); weather.setExterior(true); }
      parkEquipment(active ? actor : null);
      if (!seated()) removePen();
      if (active) {
        // Room fixtures and the local/remote bodies live directly under the hub.
        // Keep their graph ownership, but collect only roots inside this chamber.
        viewRoots.length = 0;
        for (const node of root.children) {
          const p = node.position;
          if (node.visible && (node === group || contains(p.x, p.y, p.z))) viewRoots.push(node);
        }
        if (seat.sitter && seat.sitter === actor && actor.camp.seat === seat) {
          // Carry's third-person camera orbits independently, including while
          // first person fades out. Combat keeps the camera behind the chair.
          const followView = pilot.closeWanted || pilot.aiming;
          if (followView) { seat.ry = pilot.orbit.yaw + Math.PI; turnChair(); }
          actor.root.rotation.y = seat.ry; actor.parts.head.rotation.y = 0;
          if (!followView) actor.parts.head.rotation.x = 0;
        }
        const rotating = broadcast === "feeds" && !layoutPending && !portraitActor;
        updateBroadcast(dt, actor);
        updateHover(dt);
        updatePen(dt);
        if (rotating && broadcast === "feeds" && !layoutPending && !portraitActor) cameras.update(dt);
        if (audio) audio.update(dt, camera, seated());
        if (!arrival.actor && !cooldown && Math.abs(p.x) < RETURN_HALF_W - 0.4 && p.z >= returnDepth(p.x)
          && feet >= FLOOR - 0.2 && feet < FLOOR + RETURN_HEIGHT - 0.5) travel(false, true, true);
        return;
      }
      const m = mirror.mouth, dx = p.x - m.x, dz = p.z - m.z, sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      const along = dx * sr + dz * cr, across = dx * cr - dz * sr;
      if (dx * dx + dz * dz < 18 * 18 && Math.abs(feet - m.floorY) < 6) prepare();
      if (!arrival.actor && !cooldown && Number.isFinite(previousAlong) && previousAlong > 0.5 && along <= 0.5
        && Math.abs(across) < 2.1 && feet >= m.floorY - 0.2 && feet < m.floorY + 2.5) travel(true, true, true);
      previousAlong = along;
    };
    const clampCamera = (p) => {
      const r = Math.hypot(p.x, p.z), limit = RADIUS - 0.65;
      if (r > limit) { p.x *= limit / r; p.z *= limit / r; }
      p.y = Math.max(FLOOR + 0.25, Math.min(FLOOR + HEIGHT - 0.3, p.y));
    };
    const clampArrivalCamera = () => {
      const p = camera.position, x = p.x, y = p.y, z = p.z;
      clampCamera(p);
      // A third-person camera cannot stand behind the room's wall as the
      // body emerges. Move its target equally to preserve the view direction.
      arrival.cameraX = p.x - x; arrival.cameraY = p.y - y; arrival.cameraZ = p.z - z;
      camera.target.x += arrival.cameraX; camera.target.y += arrival.cameraY; camera.target.z += arrival.cameraZ;
    };
    return { prepare, update, travel, clampCamera, feeds, renderFeeds: cameras.renderFeeds, viewRoots, panels, group, cameras, seat, sit, toggleView, enhanceAt, hoverAt, supportAt, segmentClear: chairClear,
      contains(x, y, z, actor = pilot.player) { return active && actor === visitor && contains(x, y, z); },
      nearbySeat(x, y, z, reach) {
        return active && !seat.sitter && Math.hypot(x, z) < Math.min(reach, 1.7)
          && y >= FLOOR - 0.05 && y <= FLOOR + SEAT_TOP + 0.1 ? seat : null;
      },
      get returnMirror() { return returnMirror; },
      get seated() { return seated(); }, get pen() { return pen; }, get penButton() { return penButton; },
      get layoutPending() { return layoutPending; }, get layoutWait() { return layoutWait; },
      get enhancement() { return enhancement; },
      get faceEnhancement() { return faceEnhancement; },
      get faceWait() { return faceWait; }, get faceHold() { return faceHold; },
      get broadcast() { return broadcast; }, get broadcastTime() { return broadcastTime; },
      observes: cameras.observes, nearFeed: cameras.near,
      get active() { return active; }, get arriving() { return !!arrival.actor; }, get crossing() { return veil > 0 || !!arrival.actor; }, get prepared() { return prepared; },
      drawVeil(context) {
        if (!veil) return;
        context.save(); context.globalAlpha = veil / 0.45; context.fillStyle = "#000000";
        context.fillRect(0, 0, context.canvas.clientWidth, context.canvas.clientHeight); context.restore();
      },
      suspend() { endArrival(); if (active) travel(false); audio?.setActive(false); },
      liveGeometry(set) { for (const mesh of meshes) set.add(mesh); for (const mesh of focusMeshes) set.add(mesh); cameras.liveGeometry(set); },
      dispose() { endArrival(); clearHover(); if (seat.sitter) crew.standPlayer(seat.sitter); active = false; parkEquipment(null); removePen(); audio?.dispose(); audio = null; for (const mesh of focusMeshes) renderer.releaseGeometry(mesh); focusMeshes.clear(); screenTargets.length = 0; cameras.dispose(); removeChild(root, group); meshes.length = panels.length = viewRoots.length = 0; tiles.fill(null); }
    };
  };
  BL.architectCave = { create, contains, clear, segmentClear, FLOOR, RADIUS, HEIGHT, FACE_WAIT, FACE_SWEEP, FACE_HOLD };
})();
