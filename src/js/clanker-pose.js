// Exact display projection of an already posed managed Clanker. This is not a
// physics checkpoint, a transport frame, or permission to advance follower AI.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const VERSION = 1, MAX_NODES = 24, MAX_BYTES = 16384, WIDTH = 24;
  const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  const bad = () => { throw new Error("invalid Clanker pose projection"); };
  const dense = (a, n) => {
    if (!Array.isArray(a) || a.length !== n || Reflect.ownKeys(a).length !== n + 1) return false;
    for (let i = 0; i < n; i++) { const d = Object.getOwnPropertyDescriptor(a, i); if (!d || !("value" in d)) return false; }
    return true;
  };
  const number = n => Number.isFinite(n) && Math.abs(n) <= 1000000;
  const bool = n => n === 0 || n === 1;
  const fields = ["v", "world", "profile", "appearance", "held", "nodes"];
  const checked = new WeakSet();
  const validate = s => {
    if (checked.has(s)) return true;
    if (!s || typeof s !== "object" || Reflect.ownKeys(s).length !== fields.length
      || fields.some(k => !Object.getOwnPropertyDescriptor(s, k) || !("value" in Object.getOwnPropertyDescriptor(s, k)))
      || s.v !== VERSION || !id(s.world) || !(s.held === null || id(s.held))
      || !dense(s.profile, 10) || !s.profile.every(number)
      || !dense(s.appearance, 6) || !["ape", "code"].includes(s.appearance[0]) || !s.appearance.slice(1).every(bool)
      || !Array.isArray(s.nodes) || s.nodes.length < 11 || s.nodes.length > MAX_NODES || !dense(s.nodes, s.nodes.length)) bad();
    for (let i = 0; i < s.nodes.length; i++) {
      const r = s.nodes[i];
      if (!dense(r, WIDTH) || !r.every(number) || !Number.isInteger(r[0]) || r[0] < -1 || r[0] >= s.nodes.length || r[0] === i
        || (i === 0) !== (r[0] === -1) || !bool(r[1]) || !bool(r[2])
        || r.slice(9, 12).some(v => v < 0 || v > 100)
        || r.slice(12, 16).some(v => Math.abs(v) > 2 || Math.fround(v) !== v)
        || !r[2] && r.slice(12, 16).some(v => v !== 0) || !bool(r[22]) || !bool(r[23])) bad();
    }
    // Rows are already validated; ancestor traversal only needs their indices.
    // Rechecking every ancestor's 24 descriptors multiplied work for each limb.
    for (let i = 0; i < s.nodes.length; i++) {
      let parent = s.nodes[i][0], steps = 0;
      while (parent !== -1) {
        if (++steps > MAX_NODES) bad();
        parent = s.nodes[parent][0];
      }
    }
    if (new TextEncoder().encode(JSON.stringify(s)).byteLength > MAX_BYTES) bad();
    return true;
  };
  // Only a fully validated, deeply frozen value may skip repeated validation.
  // Weak ownership retains no frame or rig after its consumer releases it.
  const immutable = snapshot => {
    validate(snapshot);
    for (const row of snapshot.nodes) Object.freeze(row);
    Object.freeze(snapshot.nodes); Object.freeze(snapshot.profile); Object.freeze(snapshot.appearance);
    Object.freeze(snapshot); checked.add(snapshot); return snapshot;
  };
  const create = ({ world, profile, nodes, appearance, setAppearance, held }) => {
    if (!id(world) || !dense(profile, 10) || !profile.every(number)) bad();
    profile = profile.slice();
    const current = item => {
      if (held() ? !id(item) : item !== null) bad();
      const list = nodes();
      if (!Array.isArray(list) || list.length > MAX_NODES || new Set(list).size !== list.length) bad();
      return list;
    };
    const capture = (item = null, freeze = false) => {
      if (typeof freeze !== "boolean") bad();
      const list = current(item);
      const result = { v: VERSION, world, profile: profile.slice(), appearance: appearance(), held: item,
        nodes: list.map((n, i) => [i === 0 ? -1 : list.indexOf(n.parent), +n.visible, +!!n.quaternion,
          n.position.x, n.position.y, n.position.z, n.rotation.x, n.rotation.y, n.rotation.z,
          n.scale.x, n.scale.y, n.scale.z, ...(n.quaternion ? Array.from(n.quaternion) : [0, 0, 0, 0]),
          n.poseYaw ?? 0, n.poseLean ?? 0, n.poseLeanY ?? 0, n.glow, n.scorch, n.ember, +!!n.matrixNative, +!!n.matrixLiving]) };
      if (freeze) return immutable(result);
      validate(result); return result;
    };
    const axes = ["x", "y", "z"];
    const apply = (snapshot, item = null) => {
      validate(snapshot);
      const list = current(item);
      if (snapshot.world !== world || snapshot.held !== item || snapshot.nodes.length !== list.length
        || snapshot.profile.some((v, i) => v !== profile[i])
        || snapshot.nodes.some((r, i) => r[0] !== (i === 0 ? -1 : list.indexOf(list[i].parent)))) bad();
      // All input and rig compatibility checks precede mutation. The adapter
      // only selects existing geometry; it must not allocate/reparent world items.
      setAppearance(snapshot.appearance);
      for (let i = 0; i < list.length; i++) {
        const n = list[i], r = snapshot.nodes[i];
        n.visible = !!r[1];
        for (let k = 0; k < 3; k++) {
          const key = axes[k]; n.position[key] = r[3 + k]; n.rotation[key] = r[6 + k]; n.scale[key] = r[9 + k];
        }
        if (!r[2]) n.quaternion = null;
        else { if (!n.quaternion) n.quaternion = new Float32Array(4); for (let k = 0; k < 4; k++) n.quaternion[k] = r[12 + k]; }
        n.poseYaw = r[16]; n.poseLean = r[17]; n.poseLeanY = r[18]; n.glow = r[19]; n.scorch = r[20]; n.ember = r[21];
        n.matrixNative = !!r[22]; n.matrixLiving = !!r[23];
      }
      return true;
    };
    return { capture, apply };
  };
  BL.clankerPose = { VERSION, MAX_NODES, MAX_BYTES, WIDTH, validate, immutable, create };
})();
