// Versioned, bounded data only: an appearance snapshot followed by the recorder's Float32 poses.
// Shared by the browser and Worker. This validates a recording's format, not the player's physics.
(() => {
  "use strict";
  const BL = globalThis.BL = globalThis.BL || {};
  const STRIDE = 155, MAX_SAMPLES = 12001, MAX_BYTES = 12 * 1024 * 1024, MAX_META = 4 * 1024 * 1024;
  const level = id => /^cloud-hopper-l[1-4]$/.test(id);
  const finite = (n, max = 100000) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;
  const vector = (a, length, max) => Array.isArray(a) && a.length === length && a.every(n => finite(n, max));
  const validAppearance = a => {
    if (!a || a.version !== 1 || !Array.isArray(a.nodes) || !a.nodes.length || a.nodes.length > 256
      || !Array.isArray(a.parts) || a.parts.length !== 11 || !Array.isArray(a.geometries) || a.geometries.length > 256) return false;
    if (!a.parts.every(i => Number.isInteger(i) && i >= -1 && i < a.nodes.length) || a.parts[0] !== 0 || a.parts[2] < 0) return false;
    let vertices = 0, faces = 0, lines = 0;
    for (let i = 0; i < a.nodes.length; i++) {
      const n = a.nodes[i];
      if (!n || !Number.isInteger(n.parent) || n.parent < -1 || n.parent >= i || (i === 0) !== (n.parent === -1)
        || !Number.isInteger(n.geometry) || n.geometry < -1 || n.geometry >= a.geometries.length || !vector(n.pose, 14)
        || ![0, 1].includes(n.pose[13]) || n.pose.slice(7, 10).some(v => Math.abs(v) > 100)
        || Math.abs(Math.hypot(...n.pose.slice(3, 7)) - 1) > 0.1) return false;
    }
    for (const g of a.geometries) {
      if (!g || !Array.isArray(g.verts) || g.verts.length % 3 || !g.verts.every(n => finite(n, 100))
        || !Array.isArray(g.faces) || !Array.isArray(g.lines)) return false;
      vertices += g.verts.length / 3; faces += g.faces.length; lines += g.lines.length;
      if (vertices > 60000 || faces > 60000 || lines > 60000) return false;
      for (const [list, min, max] of [[g.faces, 3, 8], [g.lines, 2, 2]]) for (const face of list) {
        if (!face || !Array.isArray(face.i) || face.i.length < min || face.i.length > max
          || !face.i.every(i => Number.isInteger(i) && i >= 0 && i < g.verts.length / 3)
          || !vector(face.color, 3, 255) || face.color.some(c => c < 0) || !finite(face.emissive, 1)) return false;
      }
    }
    return true;
  };
  const validate = r => {
    if (!r || r.version !== 1 || !level(r.game) || !Number.isInteger(r.courseVersion) || r.courseVersion < 1
      || !Number.isSafeInteger(r.playerId) || r.playerId <= 0 || typeof r.name !== "string" || !/^[\w-]{1,80}$/.test(r.name)
      || typeof r.username !== "string" || !/^[a-z0-9-]{1,39}$/i.test(r.username)
      || !finite(r.duration, 3600) || r.duration <= 0 || !Number.isInteger(r.count) || r.count < 2 || r.count > MAX_SAMPLES
      || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 4294967295 || !finite(r.driftTime, 1000000000)
      || !validAppearance(r.appearance) || !(r.samples instanceof Float32Array) || r.samples.length !== r.count * STRIDE) return false;
    let last = -1;
    for (let i = 0; i < r.count; i++) {
      const offset = i * STRIDE, at = r.samples[offset];
      if (!finite(at, 3600) || at <= last || (i === 0 && at !== 0)) return false;
      last = at;
      for (let j = 1; j < STRIDE; j++) if (!finite(r.samples[offset + j])) return false;
      for (let j = 0; j < 11; j++) {
        const n = offset + 1 + j * 14, q = Math.hypot(...r.samples.subarray(n + 3, n + 7));
        if (q < 0.9 || q > 1.1 || ![0, 1].includes(r.samples[n + 13])) return false;
        for (let k = 7; k < 10; k++) if (Math.abs(r.samples[n + k]) > 100) return false;
      }
    }
    return Math.abs(last - r.duration) <= 0.001;
  };
  const encode = r => {
    if (!validate(r)) return null;
    const { samples, ...meta } = r, json = new TextEncoder().encode(JSON.stringify(meta));
    if (json.length > MAX_META) return null;
    const start = 12 + Math.ceil(json.length / 4) * 4, out = new ArrayBuffer(start + samples.byteLength), view = new DataView(out);
    if (out.byteLength > MAX_BYTES) return null;
    view.setUint32(0, 0x43485231); view.setUint32(4, json.length, true); view.setUint32(8, samples.length, true);
    new Uint8Array(out, 12, json.length).set(json);
    for (let i = 0; i < samples.length; i++) view.setFloat32(start + i * 4, samples[i], true);
    return out;
  };
  const decode = bytes => {
    try {
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 12 || bytes.byteLength > MAX_BYTES) return null;
      const view = new DataView(bytes), length = view.getUint32(4, true), count = view.getUint32(8, true);
      const start = 12 + Math.ceil(length / 4) * 4;
      if (view.getUint32(0) !== 0x43485231 || length > MAX_META || count > MAX_SAMPLES * STRIDE || start + count * 4 !== bytes.byteLength) return null;
      const r = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes, 12, length)));
      r.samples = new Float32Array(count);
      for (let i = 0; i < count; i++) r.samples[i] = view.getFloat32(start + i * 4, true);
      return validate(r) ? r : null;
    } catch { return null; }
  };
  BL.cloudHopperReplayCodec = { encode, decode, validate, validAppearance, MAX_BYTES, STRIDE, level };
})();
