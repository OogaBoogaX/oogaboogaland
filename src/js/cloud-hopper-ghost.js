// A page-session best run: bounded pose samples and one non-interactive translucent Ooga.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild, boundsOf } = BL.scene, { quat } = BL.math;
  const PARTS = ["root", "torso", "head", "armL", "armR", "legL", "legR", "fingersL", "fingersR", "jetpack", "jetFlame"];
  // Timestamp, then position, quaternion, scale, body-pose offsets and visibility per part.
  const NODE_STRIDE = 14, STRIDE = 1 + PARTS.length * NODE_STRIDE, SAMPLE_SECONDS = 0.05, MAX_SAMPLES = 12001;
  const create = ({ root, renderer }) => {
    const rotation = quat.create(), nextRotation = quat.create(), sourceNodes = new Array(PARTS.length);
    const readyRotation = quat.create(), readyPosition = { x: 0, y: 0, z: 0 }, screen = { x: 0, y: 0 };
    const geometries = new Map();
    let samples = null, count = 0, interval = SAMPLE_SECONDS, nextAt = 0, lastAt = -1, capturing = false, name = "", username = "";
    let rig = null, nodes = null, rest = null, playback = null, cursor = 0, staged = false;
    const thin = () => {
      // Keep the first and last poses while halving interior samples. Very
      // long successful runs still get a complete ghost at a coarser cadence.
      const last = count - 1;
      let to = 1;
      for (let from = 2; from < count; from += 2) {
        samples.copyWithin(to * STRIDE, from * STRIDE, (from + 1) * STRIDE);
        to++;
      }
      if (last % 2) {
        samples.copyWithin(to * STRIDE, last * STRIDE, (last + 1) * STRIDE);
        to++;
      }
      count = to;
      interval *= 2;
    };
    const writeNode = (node, offset) => {
      if (!node) {
        samples.fill(0, offset, offset + NODE_STRIDE);
        samples[offset + 6] = samples[offset + 7] = samples[offset + 8] = samples[offset + 9] = 1;
        return;
      }
      const p = node.position, s = node.scale;
      const q = node.quaternion || quat.fromEuler(rotation, node.rotation.x, node.rotation.y, node.rotation.z);
      samples[offset] = p.x; samples[offset + 1] = p.y; samples[offset + 2] = p.z;
      for (let i = 0; i < 4; i++) samples[offset + 3 + i] = q[i];
      samples[offset + 7] = s.x; samples[offset + 8] = s.y; samples[offset + 9] = s.z;
      samples[offset + 10] = node.poseYaw || 0;
      samples[offset + 11] = node.poseLean || 0;
      samples[offset + 12] = node.poseLeanY || 0;
      // First-person camera hiding belongs to the live player, never its ghost.
      samples[offset + 13] = node.visible ? 1 : 0;
    };
    const record = (time, actor, force = false) => {
      if (!capturing || !Number.isFinite(time) || time < 0 || !actor) return;
      if (time < lastAt || !force && time + 1e-6 < nextAt) return;
      const replace = count > 0 && Math.abs(time - lastAt) < 1e-6;
      if (!replace && count === MAX_SAMPLES) thin();
      const offset = (replace ? count - 1 : count++) * STRIDE;
      samples[offset] = time;
      sourceNodes[9] = actor.jet?.node || null;
      sourceNodes[10] = actor.jet?.flame || null;
      for (let i = 0; i < PARTS.length; i++) writeNode(sourceNodes[i], offset + 1 + i * NODE_STRIDE);
      lastAt = time; nextAt = time + interval;
    };
    const begin = (actor, handle = actor.traits.name) => {
      if (!samples) samples = new Float32Array(MAX_SAMPLES * STRIDE);
      count = 0; interval = SAMPLE_SECONDS; nextAt = 0; lastAt = -1; capturing = true;
      name = actor.traits.name;
      username = handle || name;
      sourceNodes[0] = actor.root;
      for (let i = 1; i < 9; i++) sourceNodes[i] = actor.parts[PARTS[i]] || null;
      record(0, actor, true);
    };
    const finish = (time, actor) => {
      if (!capturing) return null;
      record(time, actor, true);
      capturing = false;
      sourceNodes.fill(null);
      if (!count) return null;
      // The saved run owns only plain metadata and a compact typed copy, so
      // later captures and scene disposal cannot mutate it or retain actors.
      return { name, username, duration: time, count, samples: samples.slice(0, count * STRIDE) };
    };
    const ghostGeometry = (source) => {
      let geometry = geometries.get(source);
      if (geometry) return geometry;
      geometry = BL.models.merge(source);
      for (const face of geometry.faces) {
        const light = (face.color[0] + face.color[1] + face.color[2]) / 765;
        face.color = [105 + light * 50, 190 + light * 45, 225 + light * 30];
        face.emissive = 0.35;
      }
      for (const line of geometry.lines) line.color = [150, 225, 255];
      geometry.smooth = source.smooth;
      if (source.normals) geometry.normals = source.normals;
      geometry.glass = 0.3;
      geometry.castShadow = false;
      geometry.characterPart = true;
      geometries.set(source, geometry);
      return geometry;
    };
    const dropRig = () => {
      if (rig) removeChild(root, rig.root);
      rig = nodes = rest = null; staged = false;
      for (const geometry of geometries.values()) renderer.releaseGeometry(geometry);
      geometries.clear();
    };
    const build = (recording) => {
      dropRig();
      rig = BL.models.caveman(BL.contributors.traitsFor(recording.name));
      for (const key of ["club", "gun", "snack"]) {
        const node = rig.parts[key];
        if (node?.parent) removeChild(node.parent, node);
      }
      if (!rig.parts.jetpack) {
        const h = rig.traits.height;
        rig.parts.jetpack = createNode({ geometry: BL.hubModels.jetpack(), visible: false,
          position: { x: 0, y: 0.06 * h, z: -0.18 * h }, scale: { x: h, y: h, z: h } });
        rig.parts.jetFlame = createNode({ geometry: BL.hubModels.jetFlame(), visible: false });
        addChild(rig.parts.jetpack, rig.parts.jetFlame);
        addChild(rig.root, rig.parts.jetpack);
      }
      const visit = (node) => {
        node.sightHidden = true; node.cameraHidden = false;
        if (node.geometry) node.geometry = ghostGeometry(node.geometry);
        for (const child of node.children) visit(child);
      };
      visit(rig.root);
      nodes = PARTS.map(key => key === "root" ? rig.root : rig.parts[key]);
      // Keep the model's planted pose separately from the first race sample,
      // which may already be airborne or walking off the cloud.
      rest = nodes.map(node => node && ({ position: { ...node.position }, scale: { ...node.scale },
        quaternion: (node.quaternion || quat.fromEuler(rotation, node.rotation.x, node.rotation.y, node.rotation.z)).slice(),
        poseYaw: node.poseYaw || 0, poseLean: node.poseLean || 0, poseLeanY: node.poseLeanY || 0, visible: node.visible }));
      for (const node of nodes) if (node && !node.quaternion) node.quaternion = quat.create();
      rig.root.visible = false;
      addChild(root, rig.root);
    };
    const update = (time) => {
      if (!playback || !rig) return;
      const data = playback.samples, last = playback.count - 1;
      const at = Math.max(0, Math.min(playback.duration, time));
      if (at < data[cursor * STRIDE]) cursor = 0;
      while (cursor < last && data[(cursor + 1) * STRIDE] <= at) cursor++;
      const a = cursor * STRIDE, b = Math.min(last, cursor + 1) * STRIDE;
      const span = data[b] - data[a], k = span > 0 ? Math.max(0, Math.min(1, (at - data[a]) / span)) : 0;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;
        const x = a + 1 + i * NODE_STRIDE, next = b + 1 + i * NODE_STRIDE;
        // Removed equipment keeps its last pose until it vanishes, rather
        // than sliding toward the absent-node placeholder between samples.
        const y = data[x + 13] > 0 && data[next + 13] === 0 ? x : next;
        node.position.x = data[x] + (data[y] - data[x]) * k;
        node.position.y = data[x + 1] + (data[y + 1] - data[x + 1]) * k;
        node.position.z = data[x + 2] + (data[y + 2] - data[x + 2]) * k;
        for (let j = 0; j < 4; j++) { node.quaternion[j] = data[x + 3 + j]; nextRotation[j] = data[y + 3 + j]; }
        quat.slerpTo(node.quaternion, nextRotation, k);
        node.scale.x = data[x + 7] + (data[y + 7] - data[x + 7]) * k;
        node.scale.y = data[x + 8] + (data[y + 8] - data[x + 8]) * k;
        node.scale.z = data[x + 9] + (data[y + 9] - data[x + 9]) * k;
        const turn = data[y + 10] - data[x + 10];
        node.poseYaw = data[x + 10] + Math.atan2(Math.sin(turn), Math.cos(turn)) * k;
        node.poseLean = data[x + 11] + (data[y + 11] - data[x + 11]) * k;
        node.poseLeanY = data[x + 12] + (data[y + 12] - data[x + 12]) * k;
        node.visible = data[x + 13] > 0;
      }
      if (staged) {
        // Join the exact recorded route without snapping off the waiting rim.
        const t = Math.min(1, at / 0.25), blend = t * t * (3 - 2 * t), p = rig.root.position;
        p.x = readyPosition.x + (p.x - readyPosition.x) * blend;
        p.y = readyPosition.y + (p.y - readyPosition.y) * blend;
        p.z = readyPosition.z + (p.z - readyPosition.z) * blend;
        rotation.set(readyRotation); quat.slerpTo(rotation, rig.root.quaternion, blend); rig.root.quaternion.set(rotation);
        if (t === 1) staged = false;
      }
    };
    const play = (recording, position = null, heading = 0) => {
      if (!recording?.count) { hide(); return; }
      if (!rig || rig.traits.name !== recording.name) build(recording);
      playback = recording; cursor = 0; staged = false;
      update(0);
      if (position) {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i], pose = rest[i];
          if (!node) continue;
          Object.assign(node.position, pose.position); Object.assign(node.scale, pose.scale);
          node.quaternion.set(pose.quaternion);
          node.poseYaw = pose.poseYaw; node.poseLean = pose.poseLean; node.poseLeanY = pose.poseLeanY; node.visible = pose.visible;
        }
        const p = rig.root.position;
        p.x = position.x; p.y = position.y + rest[0].position.y; p.z = position.z;
        quat.fromEuler(rig.root.quaternion, 0, heading, 0);
        rig.parts.jetpack.visible = rig.parts.jetFlame.visible = false;
        rig.root.visible = true;
        Object.assign(readyPosition, p); readyRotation.set(rig.root.quaternion); staged = true;
      }
    };
    let headMinX = Infinity, headMaxX = -Infinity, headTop = Infinity;
    const projectHead = (node) => {
      if (!node.visible) return;
      if (node.geometry) {
        const b = boundsOf(node.geometry), m = node.world;
        for (let i = 0; i < 8; i++) {
          const x = i & 1 ? b.max[0] : b.min[0], y = i & 2 ? b.max[1] : b.min[1], z = i & 4 ? b.max[2] : b.min[2];
          const p = renderer.project(m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], screen);
          if (!p) continue;
          headMinX = Math.min(headMinX, p.x); headMaxX = Math.max(headMaxX, p.x); headTop = Math.min(headTop, p.y);
        }
      }
      for (const child of node.children) projectHead(child);
    };
    const drawName = (ctx) => {
      if (!playback || !rig?.root.visible) return;
      headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
      // Course overlays bypass the hub's interior visibility filter.
      projectHead(rig.parts.head);
      if (headTop === Infinity) return;
      const label = playback.username || playback.name, x = Math.round((headMinX + headMaxX) / 2), y = Math.round(headTop) - 4;
      ctx.save();
      ctx.font = "bold 11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(20, 14, 8, 0.85)"; ctx.fillStyle = "#b7eaff";
      ctx.strokeText(label, x, y); ctx.fillText(label, x, y);
      ctx.restore();
    };
    const hide = () => {
      playback = null; staged = false;
      if (rig) rig.root.visible = false;
    };
    const clear = () => {
      hide(); dropRig(); capturing = false;
      sourceNodes.fill(null);
      samples = null; count = 0; lastAt = -1; name = username = "";
    };
    const liveGeometry = (set) => { for (const geometry of geometries.values()) set.add(geometry); };
    return { begin, record, finish, play, update, drawName, hide, clear, liveGeometry, dispose: clear };
  };
  BL.cloudHopperGhost = { create };
})();
