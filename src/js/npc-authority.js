// Explicit NPC authority, separate from player movement and voice. A server lease
// never falls back to browser AI on transport loss; only a newer release does.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const MAGIC = 0x4150434e, HEADER = 32, MAX = 16 + 128 * 112 * 4;
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  // Mixed format is opt-in. Loading its codec must never upgrade an existing
  // browser before both actor families obey the server ownership fence.
  const descriptor = (a, mixed = false) => !!a
    && (a.v === 1 && a.format === undefined || mixed && (a.v === 2 && a.format === "mixed-1" || a.v === 3 && a.format === "mixed-2" || a.v === 4 && a.format === "mixed-3") && a.mode === "server")
    && integer(a.revision) && a.revision > 0
    && (a.mode === "browser" && a.world === null && a.epoch === 0
      || a.mode === "server" && typeof a.world === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(a.world)
        && integer(a.epoch) && a.epoch > 0);
  // A snapshot is poses only. One-shot events need their own acknowledged delivery;
  // replaying a persisted shot on every join/restart would be incorrect.
  const poses = data => {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 16 || data.byteLength > MAX || data.byteLength % 4) return false;
    const h = new Uint32Array(data, 0, 4);
    if (h[0] !== 2 || h[2] > 128 || h[3] !== 0 || data.byteLength !== 16 + h[2] * 112 * 4) return false;
    const f = new Float32Array(data, 16), seen = new Set();
    for (let i = 0; i < f.length; i++) if (!Number.isFinite(f[i])) return false;
    for (let i = 0; i < h[2]; i++) {
      const index = f[i * 112];
      if (!integer(index) || index >= 128 || seen.has(index)) return false;
      seen.add(index);
    }
    return true;
  };
  const posesFor = (a, data, mixed = false) => {
    if (!descriptor(a, mixed) || a.mode !== "server") return false;
    if (a.v === 1) return poses(data);
    try {
      const packet = BL.npcPosePacket.unpack(data);
      return packet.world === a.world && (a.v === 4 ? !!packet.lab && !!packet.layout
        : a.v === 3 ? !!packet.lab && packet.layout == null : packet.lab == null && packet.layout == null);
    } catch { return false; }
  };
  const pack = (a, sequence, data, mixed = false) => {
    if (!integer(sequence) || !sequence || !posesFor(a, data, mixed)) throw new Error("invalid NPC snapshot");
    const out = new ArrayBuffer(HEADER + data.byteLength), h = new DataView(out);
    h.setUint32(0, MAGIC, true); h.setUint32(4, a.v, true);
    h.setFloat64(8, a.revision, true); h.setFloat64(16, a.epoch, true); h.setFloat64(24, sequence, true);
    new Uint8Array(out, HEADER).set(new Uint8Array(data));
    return out;
  };
  const create = ({ mixed = false } = {}) => {
    let current = null, sequence = 0, last = null;
    return {
      get current() { return current; },
      accept(a) {
        if (!descriptor(a, mixed) || current && a.revision < current.revision) return false;
        if (current && a.revision === current.revision) return a.v === current.v && a.format === current.format
          && a.mode === current.mode && a.world === current.world && a.epoch === current.epoch;
        current = Object.freeze({ v: a.v, ...(a.v >= 2 ? { format: a.format } : {}), revision: a.revision, mode: a.mode, world: a.world, epoch: a.epoch });
        sequence = 0; last = null;
        return true;
      },
      frame(data) {
        if (current?.mode !== "server" || !(data instanceof ArrayBuffer) || data.byteLength < HEADER + 16 || data.byteLength > HEADER + MAX) return null;
        const h = new DataView(data), next = h.getFloat64(24, true);
        if (h.getUint32(0, true) !== MAGIC || h.getUint32(4, true) !== current.v || h.getFloat64(8, true) !== current.revision
          || h.getFloat64(16, true) !== current.epoch || !integer(next) || !next || next < sequence) return null;
        const frame = data.slice(HEADER);
        if (!posesFor(current, frame, mixed)) return null;
        if (next === sequence) {
          const bytes = new Uint8Array(frame), old = new Uint8Array(last);
          if (bytes.length !== old.length || bytes.some((v, i) => v !== old[i])) return null;
        }
        sequence = next; last = frame;
        return frame;
      },
    };
  };
  BL.npcAuthority = { MAGIC, MAX, descriptor, poses, posesFor, pack, create };
})();
