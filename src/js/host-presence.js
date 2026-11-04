// Presentation of committed host session views. Call prepare BEFORE applying
// the next authoritative pose, then render AFTER it. This never claims/spawns a
// body, changes physics/equipment, or acknowledges a durable departure.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, MAX = 64, BEAM_MS = 700, GROUP = 16;
  const WEAPONS = ["club", "gun", "snack", "chuk"];
  const KINDS = new Set(["ooga", "clanker"]);
  const id = value => typeof value === "string" && /^[A-Za-z0-9._:/-]{1,80}$/.test(value);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const fail = () => { throw new Error("invalid host presence presentation"); };
  const handGeometry = BL.models.cached(() => {
    const vox = BL.models.makeVox(); vox.fill(0, 6, 0, 4, 0, 0, 0);
    for (let x = 0; x <= 6; x += 2) vox.fill(x, x, 5, x === 0 || x === 6 ? 8 : 10, 0, 0, 0);
    vox.fill(-2, -1, 2, 4, 0, 0, 0);
    const geometry = BL.models.voxelGeometry(vox, { unit: .025, palette: ["#46ff70"], emissive: { 0: 1 }, origin: { x: -.08, y: 0, z: 0 } });
    geometry.castShadow = false; return geometry;
  });
  const create = ({ root, capacity, resolve }) => {
    if (!root || !Array.isArray(root.children) || root.parent || root.quaternion
      || root.position.x || root.position.y || root.position.z || root.rotation.x || root.rotation.y || root.rotation.z
      || root.scale.x !== 1 || root.scale.y !== 1 || root.scale.z !== 1
      || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX || typeof resolve !== "function") fail();
    const { createNode, addChild, removeChild, updateWorld, boundsOf } = BL.scene;
    const layer = createNode({ sightHidden: true }); addChild(root, layer);
    const beams = Array.from({ length: Math.ceil(capacity / GROUP) }, (_, i) => BL.sleepBeam.create({ root: layer, capacity: Math.min(GROUP, capacity - i * GROUP) }));
    const icons = Array.from({ length: capacity }, () => { const node = createNode({ geometry: handGeometry(), visible: false, sightHidden: true }); node.matrixNative = true; addChild(layer, node); return node; });
    const saved = Array.from({ length: capacity }, () => ({ arm: null, actor: null, x: 0, y: 0, z: 0, quaternion: null }));
    const plan = Array.from({ length: capacity }, () => ({ body: null, kind: null, generation: 0, actor: null, arm: null, at: 0, beam: false, applied: false, rotation: BL.math.quat.create() }));
    const local = BL.math.mat4.create(), inverse = BL.math.mat4.create(), parent = BL.math.mat4.create();
    let prepared = false, disposed = false, previousTime = 0, hands = 0, activeBeams = 0, expired = 0;
    const occupied = (actor, arm) => {
      for (const key of WEAPONS) {
        const node = actor.parts[key]; if (node?.visible && node.parent === arm) return true;
      }
      return !!actor.labItem && actor.labItem.parent === arm;
    };
    const prepare = () => {
      if (disposed) fail();
      for (let i = 0; i < capacity; i++) {
        const s = saved[i];
        if (s.arm) {
          s.arm.rotation.x = s.x; s.arm.rotation.y = s.y; s.arm.rotation.z = s.z; s.arm.quaternion = s.quaternion;
          updateWorld(s.actor.root, s.actor.root.parent?.world); s.arm = s.actor = s.quaternion = null;
        }
        icons[i].visible = false;
        plan[i].actor = plan[i].arm = null;
      }
      for (const beam of beams) beam.clear();
      hands = activeBeams = expired = 0; prepared = true;
    };
    const render = frame => {
      if (disposed || !prepared || !frame || !integer(frame.now) || frame.now < previousTime
        || !Array.isArray(frame.views) || !Array.isArray(frame.departures) || frame.views.length + frame.departures.length > capacity) fail();
      const total = frame.views.length + frame.departures.length;
      // Validate every binding first. A corrupt tail must not leave half the
      // roster with changed limbs. The caller owns world/id resolution.
      for (let i = 0; i < total; i++) {
        const departing = i >= frame.views.length, row = departing ? frame.departures[i - frame.views.length] : frame.views[i], p = plan[i];
        if (!row || !id(row.bodyId) || !integer(row.generation) || !row.generation
          || !(departing ? row.type === "depart" && row.glyph === "green" && typeof row.applied === "boolean" && integer(row.at)
            : (row.state === "live" || row.state === "grace") && KINDS.has(row.kind)
              && (row.state === "live" || row.presentation === "open-hand" && integer(row.deadline)))) fail();
        p.body = row.bodyId; p.generation = row.generation; p.kind = departing ? row.body?.kind : row.kind;
        if (!KINDS.has(p.kind)) fail();
        for (let j = 0; j < i; j++) if (plan[j].body === p.body) fail();
        p.actor = p.arm = null; p.beam = false; p.applied = departing && row.applied; p.at = departing ? row.at : row.deadline;
        if (departing ? !row.applied || frame.now < row.at || frame.now - row.at >= BEAM_MS : row.state !== "grace" || frame.now >= row.deadline) continue;
        const binding = resolve(p.body, p.kind, p.generation);
        if (!binding) continue; // A late observer must never force an absent NPC to spawn.
        if (binding.generation !== p.generation) fail();
        const actor = binding.actor;
        if (!actor?.root || !actor.parts || !Array.isArray(actor.root.children) || actor.root.parent !== root) fail();
        for (let j = 0; j < i; j++) if (plan[j].actor === actor) fail();
        if (!actor.root.visible) continue;
        p.actor = actor; p.beam = departing;
        if (!departing && binding.freeArm !== null) {
          if (binding.freeArm !== "armL" && binding.freeArm !== "armR") fail();
          const arm = actor.parts[binding.freeArm];
          if (!arm?.rotation || !arm.geometry || occupied(actor, arm)) fail();
          p.arm = arm;
          // Account for the torso's tilt, reclining and the Ooga's peek transform.
          // A fixed local angle can leave a Clanker's raised hand below its shoulder.
          updateWorld(actor.root, actor.root.parent.world);
          if (arm.quaternion) BL.math.mat4.fromTQS(local, arm.position, arm.quaternion, arm.scale);
          else BL.math.mat4.fromTRS(local, arm.position, arm.rotation, arm.scale);
          BL.math.mat4.invert(inverse, local); BL.math.mat4.multiply(parent, arm.world, inverse); BL.math.mat4.invert(inverse, parent);
          const side = arm === actor.parts.armL ? .2 : -.2, yaw = actor.root.rotation.y;
          const wx = side * Math.cos(yaw), wz = -side * Math.sin(yaw);
          const x = inverse[0] * wx + inverse[4] + inverse[8] * wz, y = inverse[1] * wx + inverse[5] + inverse[9] * wz, z = inverse[2] * wx + inverse[6] + inverse[10] * wz;
          const length = Math.hypot(x, y, z); if (!(length > 0) || !Number.isFinite(length)) fail();
          const q = p.rotation;
          if (1 - y / length < 1e-6) { q[0] = q[1] = q[3] = 0; q[2] = 1; }
          else { q[0] = -z / length; q[1] = 0; q[2] = x / length; q[3] = 1 - y / length; BL.math.quat.normalize(q); }
        }
      }
      prepared = false; previousTime = frame.now;
      for (let i = 0; i < total; i++) {
        const p = plan[i], actor = p.actor;
        if (p.applied && frame.now - p.at >= BEAM_MS) expired++;
        if (!actor) continue;
        if (p.beam) {
          const pos = actor.root.position;
          beams[Math.floor(i / GROUP)].show(i % GROUP, pos.x, pos.y, pos.z, actor.root.rotation.y, (frame.now - p.at) / BEAM_MS, false, actor.root);
          if (frame.now > p.at && !beams[Math.floor(i / GROUP)].still) activeBeams++;
        } else if (p.arm) {
          const arm = p.arm, s = saved[i], icon = icons[i];
          s.arm = arm; s.actor = actor; s.x = arm.rotation.x; s.y = arm.rotation.y; s.z = arm.rotation.z; s.quaternion = arm.quaternion;
          arm.quaternion = p.rotation;
          updateWorld(actor.root, actor.root.parent?.world);
          const m = arm.world, y = boundsOf(arm.geometry).min[1];
          icon.position.x = m[12] + m[4] * y; icon.position.y = m[13] + m[5] * y + .1; icon.position.z = m[14] + m[6] * y;
          icon.rotation.y = actor.root.rotation.y; icon.visible = true; hands++;
        }
      }
    };
    const liveGeometry = set => { if (!disposed) { for (const beam of beams) beam.liveGeometry(set); set.add(handGeometry()); } return set; };
    const dispose = () => {
      if (disposed) return;
      prepare(); for (const beam of beams) beam.dispose(); removeChild(root, layer); disposed = true;
      for (const p of plan) p.actor = p.arm = null;
    };
    return { prepare, render, liveGeometry, dispose,
      get hands() { return hands; }, get beams() { return activeBeams; }, get expired() { return expired; } };
  };
  BL.hostPresence = { create, MAX, BEAM_MS };
})();
