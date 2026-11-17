// The Lightning Jet Hangar's walkers relayed between pages: one page in the hall moves them (the host the hall on the
// Worker elects, `worker/src/games/hangar.js`) and writes frames of them that the hall passes on unread to every other
// page in the hangar, which plays them back a little behind (`DELAY`), eased between frames, with their systems not
// moving them there. What a frame carries, all registered in the same order on every page as the scene builds:
//
// - nodes (`node(n, alts)`): each one's position, rotation (its quaternion if it has one, else its Euler rotation),
//   scale, whether it shows, its glow, and which of `alts` (geometries it may show) it shows; only those changed since
//   the last frame, and all of them every `KEY_MS`, so a page joining has them all within that;
// - values (`values(array)`): a system's own few numbers other systems read (a Float32Array it keeps current on the
//   host and reads on the others), sent whole when changed;
// - events: what a system does that is not a node (a line said, a sound, a spark), recorded on the host through
//   `proxy(target, names, refs)` (an object whose methods call the target's and, while hosting, record the call) and
//   called on the others' targets when playback reaches the frame. An argument is sent as it is when it is a number, a
//   string, a boolean, null or a plain object of numbers, and as its index among `refs` (objects every page registers
//   alike: a geometry, a speaker); a call with any other argument is not recorded.
//
// Bytes, little-endian: the magic "OGH1", the format, whether the frame is whole, how many nodes, the time (the
// server's clock, ms), how many values, how many bytes of events; then each node (its index, its flags and alt, its
// glow, its position in cm, its rotation, its scale in thousandths), each value (its index, its length, its floats),
// and the events as JSON text. `write(now)` on the host, at most every `FRAME_MS` (null between), `read(bytes)` and
// `play(now)` on the others; `hosting` says which this page is, starting afresh whenever it changes. Nothing allocates
// a frame but the bytes and the events.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const MAGIC = 0x3148474f, FORMAT = 1, HEADER = 19, NODE = 24, FRAME_MS = 100, KEY_MS = 2000, DELAY = 180, MAX_BYTES = 16384;
  const ANGLE = 32767 / Math.PI, POS = 100, SCALE = 1000, GLOW = 50, EVENTS = 64;
  // A node's state: position, rotation (Euler x, y, z and 0, or a quaternion), scale, glow.
  const NV = 11;

  const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  const plain = (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return false;
    for (const k in v) if (typeof v[k] !== "number") return false;
    return true;
  };

  const create = () => {
    const nodes = [], alts = [], quats = [], vals = [], refList = [], handlers = new Map();
    // The host's: each node's state as last sent (quantized), and scratch; the events since the last frame.
    let sent = new Int16Array(0), scratch = new Int16Array(12);
    const events = [];
    let lastAt = -Infinity, keyAt = -Infinity, hosting = false;
    const valSent = [];
    // The others': each node's state from (A, at ta) and to (B, at tb), its flags before and after tb; each value's
    // next numbers and when they apply; the events waiting to play, with their times.
    let A = new Float32Array(0), B = new Float32Array(0), ta = new Float64Array(0), tb = new Float64Array(0), fa = new Uint8Array(0), fb = new Uint8Array(0), known = new Uint8Array(0);
    const valNext = [], valAt = [];
    const queue = [];
    let bytes = new ArrayBuffer(MAX_BYTES);
    const enc = new TextEncoder(), dec = new TextDecoder();

    const grow = () => {
      const n = nodes.length;
      sent = new Int16Array(n * 12).fill(-32768);
      A = new Float32Array(n * NV); B = new Float32Array(n * NV);
      ta = new Float64Array(n); tb = new Float64Array(n); fa = new Uint8Array(n); fb = new Uint8Array(n); known = new Uint8Array(n);
    };
    // A node's state now, quantized into `q`: flags, glow, position, rotation, scale.
    const quantize = (i, q) => {
      const n = nodes[i], list = alts[i];
      let alt = 0;
      if (list) { const k = list.indexOf(n.geometry); alt = k < 0 ? 0 : k; }
      q[0] = (n.visible === false ? 0 : 1) | (alt << 1);
      q[1] = Math.max(0, Math.min(255, Math.round((n.glow === undefined ? 1 : n.glow) * GLOW)));
      const p = n.position;
      q[2] = Math.round(p.x * POS); q[3] = Math.round(p.y * POS); q[4] = Math.round(p.z * POS);
      if (quats[i]) { const r = n.quaternion; q[5] = Math.round(r[0] * 32767); q[6] = Math.round(r[1] * 32767); q[7] = Math.round(r[2] * 32767); q[8] = Math.round(r[3] * 32767); }
      else { const r = n.rotation; q[5] = Math.round(wrap(r.x) * ANGLE); q[6] = Math.round(wrap(r.y) * ANGLE); q[7] = Math.round(wrap(r.z) * ANGLE); q[8] = 0; }
      const s = n.scale || null;
      q[9] = Math.round((s ? s.x : 1) * SCALE); q[10] = Math.round((s ? s.y : 1) * SCALE); q[11] = Math.round((s ? s.z : 1) * SCALE);
    };
    const encodeArg = (v) => {
      if (v === null || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
      const k = refList.indexOf(v);
      if (k >= 0) return { $: k };
      if (plain(v)) return v;
      return undefined;
    };
    const decodeArg = (v) => v && typeof v === "object" && typeof v.$ === "number" ? refList[v.$] : v;

    const api = {
      FRAME_MS, DELAY,
      get hosting() { return hosting; },
      set hosting(on) {
        if (on === hosting) return;
        hosting = on;
        keyAt = -Infinity; lastAt = -Infinity; events.length = 0; queue.length = 0;
        sent.fill(-32768);
        valSent.forEach((v) => v.fill(NaN));
        known.fill(0);
      },
      node: (n, list = null) => {
        nodes.push(n); alts.push(list); quats.push(!!n.quaternion);
        grow();
        return nodes.length - 1;
      },
      values: (array) => {
        vals.push(array); valSent.push(new Float32Array(array.length).fill(NaN)); valNext.push(new Float32Array(array.length)); valAt.push(-1);
        return vals.length - 1;
      },
      refs: (list) => { for (const r of list) refList.push(r); },
      on: (name, fn) => { handlers.set(name, fn); },
      record: (name, args) => {
        if (!hosting || events.length >= EVENTS) return;
        const out = [name];
        for (let i = 0; i < args.length; i++) {
          const v = encodeArg(args[i]);
          if (v === undefined) return;
          out.push(v);
        }
        events.push(out);
      },
      // `target`'s methods `names`, each also recorded as `<prefix>.<name>` while hosting, and played on the others'
      // `target` by the same name.
      proxy: (target, names, prefix) => {
        const out = Object.create(target);
        for (const name of names) {
          const key = `${prefix}.${name}`;
          out[name] = (...args) => { api.record(key, args); return target[name](...args); };
          handlers.set(key, (...args) => target[name](...args));
        }
        return out;
      },
      // The host's frame at `now`, or null before FRAME_MS has passed or when nothing changed.
      write: (now) => {
        if (!hosting || now - lastAt < FRAME_MS) return null;
        lastAt = now;
        const full = now - keyAt >= KEY_MS;
        if (full) keyAt = now;
        const v = new DataView(bytes);
        let o = HEADER, count = 0;
        for (let i = 0; i < nodes.length && o + NODE <= MAX_BYTES; i++) {
          quantize(i, scratch);
          let same = !full;
          if (same) for (let k = 0; k < 12; k++) if (scratch[k] !== sent[i * 12 + k]) { same = false; break; }
          if (same) continue;
          sent.set(scratch, i * 12);
          v.setUint16(o, i, true); v.setUint8(o + 2, scratch[0]); v.setUint8(o + 3, scratch[1]);
          for (let k = 0; k < 3; k++) v.setInt16(o + 4 + k * 2, scratch[2 + k], true);
          for (let k = 0; k < 4; k++) v.setInt16(o + 10 + k * 2, scratch[5 + k], true);
          for (let k = 0; k < 3; k++) v.setUint16(o + 18 + k * 2, Math.max(0, Math.min(65535, scratch[9 + k])), true);
          o += NODE; count++;
        }
        let valCount = 0;
        for (let j = 0; j < vals.length; j++) {
          const a = vals[j], s = valSent[j];
          let same = !full;
          if (same) for (let k = 0; k < a.length; k++) if (a[k] !== s[k]) { same = false; break; }
          if (same || o + 2 + a.length * 4 > MAX_BYTES) continue;
          s.set(a);
          v.setUint8(o, j); v.setUint8(o + 1, a.length);
          for (let k = 0; k < a.length; k++) v.setFloat32(o + 2 + k * 4, a[k], true);
          o += 2 + a.length * 4; valCount++;
        }
        let evBytes = 0;
        if (events.length) {
          const text = enc.encode(JSON.stringify(events));
          events.length = 0;
          if (o + text.length <= MAX_BYTES) { new Uint8Array(bytes, o, text.length).set(text); evBytes = text.length; o += text.length; }
        }
        if (!count && !valCount && !evBytes) return null;
        v.setUint32(0, MAGIC, true); v.setUint8(4, FORMAT); v.setUint8(5, full ? 1 : 0); v.setUint16(6, count, true);
        v.setFloat64(8, now, true); v.setUint8(16, valCount); v.setUint16(17, evBytes, true);
        return new Uint8Array(bytes, 0, o);
      },
      // A frame from the host: its nodes eased to from where they were, its values and events kept for playback.
      read: (buffer) => {
        if (hosting || !(buffer instanceof ArrayBuffer) || buffer.byteLength < HEADER) return false;
        const v = new DataView(buffer);
        if (v.getUint32(0, true) !== MAGIC || v.getUint8(4) !== FORMAT) return false;
        const count = v.getUint16(6, true), at = v.getFloat64(8, true), valCount = v.getUint8(16), evBytes = v.getUint16(17, true);
        let o = HEADER;
        if (o + count * NODE > buffer.byteLength) return false;
        for (let c = 0; c < count; c++, o += NODE) {
          const i = v.getUint16(o, true);
          if (i >= nodes.length) continue;
          const b = i * NV, quat = quats[i];
          if (known[i]) { for (let k = 0; k < NV; k++) A[b + k] = B[b + k]; fa[i] = fb[i]; ta[i] = Math.max(tb[i], at - FRAME_MS); }
          fb[i] = v.getUint8(o + 2);
          B[b + 10] = v.getUint8(o + 3) / GLOW;
          for (let k = 0; k < 3; k++) B[b + k] = v.getInt16(o + 4 + k * 2, true) / POS;
          for (let k = 0; k < 4; k++) B[b + 3 + k] = v.getInt16(o + 10 + k * 2, true) / (quat ? 32767 : ANGLE);
          for (let k = 0; k < 3; k++) B[b + 7 + k] = v.getUint16(o + 18 + k * 2, true) / SCALE;
          if (!known[i]) { for (let k = 0; k < NV; k++) A[b + k] = B[b + k]; fa[i] = fb[i]; ta[i] = at - FRAME_MS; known[i] = 1; }
          tb[i] = at;
        }
        for (let c = 0; c < valCount && o + 2 <= buffer.byteLength; c++) {
          const j = v.getUint8(o), n = v.getUint8(o + 1);
          if (j < vals.length && n === vals[j].length && o + 2 + n * 4 <= buffer.byteLength) {
            for (let k = 0; k < n; k++) valNext[j][k] = v.getFloat32(o + 2 + k * 4, true);
            valAt[j] = at;
          }
          o += 2 + n * 4;
        }
        if (evBytes && o + evBytes <= buffer.byteLength && queue.length < EVENTS) {
          let list = null;
          try { list = JSON.parse(dec.decode(new Uint8Array(buffer, o, evBytes))); } catch { list = null; }
          if (Array.isArray(list)) for (const e of list) if (Array.isArray(e) && typeof e[0] === "string" && queue.length < EVENTS) { e.at = at; queue.push(e); }
        }
        return true;
      },
      // The others' walkers as they stood `DELAY` before `now`: each node eased between its two latest states, each
      // value once its frame is due, and each event once playback reaches it.
      play: (now) => {
        if (hosting) return;
        const t = now - DELAY;
        for (let i = 0; i < nodes.length; i++) {
          if (!known[i]) continue;
          const n = nodes[i], b = i * NV, span = tb[i] - ta[i], u = span > 0 ? Math.max(0, Math.min(1, (t - ta[i]) / span)) : 1;
          const f = u >= 1 ? fb[i] : fa[i];
          n.visible = (f & 1) === 1;
          const list = alts[i];
          if (list) { const g = list[f >> 1]; if (g && n.geometry !== g) n.geometry = g; }
          n.position.x = A[b] + (B[b] - A[b]) * u; n.position.y = A[b + 1] + (B[b + 1] - A[b + 1]) * u; n.position.z = A[b + 2] + (B[b + 2] - A[b + 2]) * u;
          if (quats[i]) {
            const q = n.quaternion, dot = A[b + 3] * B[b + 3] + A[b + 4] * B[b + 4] + A[b + 5] * B[b + 5] + A[b + 6] * B[b + 6], s = dot < 0 ? -1 : 1;
            let x = A[b + 3] + (s * B[b + 3] - A[b + 3]) * u, y = A[b + 4] + (s * B[b + 4] - A[b + 4]) * u, z = A[b + 5] + (s * B[b + 5] - A[b + 5]) * u, w = A[b + 6] + (s * B[b + 6] - A[b + 6]) * u;
            const len = Math.hypot(x, y, z, w) || 1;
            q[0] = x / len; q[1] = y / len; q[2] = z / len; q[3] = w / len;
          } else {
            const r = n.rotation;
            r.x = A[b + 3] + wrap(B[b + 3] - A[b + 3]) * u; r.y = A[b + 4] + wrap(B[b + 4] - A[b + 4]) * u; r.z = A[b + 5] + wrap(B[b + 5] - A[b + 5]) * u;
          }
          if (n.scale) { n.scale.x = A[b + 7] + (B[b + 7] - A[b + 7]) * u; n.scale.y = A[b + 8] + (B[b + 8] - A[b + 8]) * u; n.scale.z = A[b + 9] + (B[b + 9] - A[b + 9]) * u; }
          if (n.glow !== undefined || B[b + 10] !== 1) n.glow = A[b + 10] + (B[b + 10] - A[b + 10]) * u;
        }
        for (let j = 0; j < vals.length; j++) if (valAt[j] >= 0 && valAt[j] <= t) { vals[j].set(valNext[j]); valAt[j] = -1; }
        while (queue.length && queue[0].at <= t) {
          const e = queue.shift(), fn = handlers.get(e[0]);
          if (!fn) continue;
          for (let k = 1; k < e.length; k++) e[k] = decodeArg(e[k]);
          fn(...e.slice(1));
        }
      },
      get count() { return nodes.length; }
    };
    return api;
  };

  BL.hangarRelay = { create, MAGIC };
})();
