// Lossless mixed-pose packet, independent of authority/transport negotiation.
// One complete snapshot: no previous-frame dependency or unbounded reassembly.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const MAGIC = 0x3358504e, VERSION = 1, MAX = 32768, EXPANDED = 131072, ACTORS = 128, HEADER = 16;
  const bad = () => { throw new Error("invalid or oversized mixed pose packet"); };
  const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  const hash = bytes => { let n = 2166136261; for (const b of bytes) n = Math.imul(n ^ b, 16777619); return n >>> 0; };
  // Bounded LZ4-style block: a single candidate per hash, 64KiB history, no
  // dictionary search or external dependency. Exact IEEE bytes are preserved.
  const compress = input => {
    const out = new Uint8Array(MAX - HEADER), table = new Int32Array(65536).fill(-1);
    let used = 0, anchor = 0, i = 0;
    const byte = n => { if (used >= out.length) bad(); out[used++] = n; };
    const extra = n => { while (n >= 255) { byte(255); n -= 255; } byte(n); };
    const literals = (from, length) => { if (used + length > out.length) bad(); out.set(input.subarray(from, from + length), used); used += length; };
    while (i + 4 <= input.length) {
      const word = input[i] | input[i + 1] << 8 | input[i + 2] << 16 | input[i + 3] << 24;
      const key = Math.imul(word, -1640531535) >>> 16, previous = table[key]; table[key] = i;
      if (previous < 0 || i - previous > 65535 || input[previous] !== input[i] || input[previous + 1] !== input[i + 1]
        || input[previous + 2] !== input[i + 2] || input[previous + 3] !== input[i + 3]) { i++; continue; }
      let length = 4; while (i + length < input.length && input[previous + length] === input[i + length]) length++;
      const count = i - anchor;
      byte(Math.min(count, 15) << 4 | Math.min(length - 4, 15));
      if (count >= 15) extra(count - 15); literals(anchor, count);
      const offset = i - previous; byte(offset & 255); byte(offset >>> 8);
      if (length >= 19) extra(length - 19);
      i += length; anchor = i;
    }
    const count = input.length - anchor; byte(Math.min(count, 15) << 4);
    if (count >= 15) extra(count - 15); literals(anchor, count);
    return out.slice(0, used);
  };
  const expand = (input, length) => {
    if (!Number.isInteger(length) || length < 23 || length > EXPANDED) bad();
    const out = new Uint8Array(length); let at = 0, used = 0;
    const byte = () => { if (at >= input.length) bad(); return input[at++]; };
    const extra = n => { let b; do { b = byte(); n += b; if (n > length) bad(); } while (b === 255); return n; };
    while (at < input.length) {
      const token = byte(), count = token >>> 4 === 15 ? extra(15) : token >>> 4;
      if (at + count > input.length || used + count > length) bad();
      out.set(input.subarray(at, at + count), used); at += count; used += count;
      if (at === input.length) { if (token & 15) bad(); break; }
      const offset = byte() | byte() << 8;
      if (!offset || offset > used) bad();
      const copies = (token & 15) === 15 ? extra(19) : (token & 15) + 4;
      if (used + copies > length) bad();
      for (let k = 0; k < copies; k++) out[used + k] = out[used + k - offset];
      used += copies;
    }
    if (used !== length) bad(); return out;
  };
  const pack = (world, ooga, clankers) => {
    if (!id(world) || !BL.npcAuthority.poses(ooga) || !Array.isArray(clankers) || clankers.length > ACTORS
      || Object.keys(clankers).length !== clankers.length || new Uint32Array(ooga, 0, 4)[2] + clankers.length > ACTORS) bad();
    const raw = new Uint8Array(EXPANDED), view = new DataView(raw.buffer); let at = 0;
    const reserve = n => { if (at + n > raw.length) bad(); const start = at; at += n; return start; };
    const byte = n => { raw[reserve(1)] = n; };
    const word = n => view.setUint32(reserve(4), n, true);
    const string = s => { byte(s.length); for (let i = 0; i < s.length; i++) byte(s.charCodeAt(i)); };
    const number = n => {
      if (Object.is(n, -0)) byte(3);
      else if (n === 0) byte(0);
      else if (n === 1) byte(1);
      else if (n === -1) byte(2);
      else if (Math.fround(n) === n) { byte(4); view.setFloat32(reserve(4), n, true); }
      else { byte(5); view.setFloat64(reserve(8), n, true); }
    };
    string(world); word(ooga.byteLength); raw.set(new Uint8Array(ooga), reserve(ooga.byteLength)); byte(clankers.length);
    let previous = -1;
    for (const entry of [...clankers].sort((a, b) => a.index - b.index)) {
      if (!entry || Object.keys(entry).sort().join(",") !== "index,pose" || !Number.isInteger(entry.index)
        || entry.index <= previous || entry.index >= ACTORS || entry.pose?.world !== world) bad();
      const p = entry.pose; BL.clankerPose.validate(p); previous = entry.index; byte(entry.index);
      for (const value of p.profile) number(value);
      byte(p.appearance[0] === "code" ? 1 : 0);
      for (let i = 1; i < 6; i++) byte(p.appearance[i]);
      string(p.held || ""); byte(p.nodes.length);
      for (const row of p.nodes) for (const value of row) number(value);
    }
    const content = raw.subarray(0, at), compressed = compress(content), result = new ArrayBuffer(HEADER + compressed.length), header = new DataView(result);
    header.setUint32(0, MAGIC, true); header.setUint32(4, VERSION, true); header.setUint32(8, at, true); header.setUint32(12, hash(content), true);
    new Uint8Array(result, HEADER).set(compressed); return result;
  };
  const unpack = (buffer, immutable = false) => {
    if (typeof immutable !== "boolean") bad();
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= HEADER || buffer.byteLength > MAX) bad();
    const header = new DataView(buffer);
    if (header.getUint32(0, true) !== MAGIC || header.getUint32(4, true) !== VERSION) bad();
    const raw = expand(new Uint8Array(buffer, HEADER), header.getUint32(8, true));
    if (hash(raw) !== header.getUint32(12, true)) bad();
    const view = new DataView(raw.buffer); let at = 0;
    const take = n => { if (at + n > raw.length) bad(); const start = at; at += n; return start; };
    const byte = () => raw[take(1)], word = () => view.getUint32(take(4), true);
    const string = () => { const n = byte(); if (n > 80) bad(); let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(byte()); return s; };
    const number = () => {
      const tag = byte();
      if (tag < 4) return [0, 1, -1, -0][tag];
      if (tag !== 4 && tag !== 5) bad();
      const n = tag === 4 ? view.getFloat32(take(4), true) : view.getFloat64(take(8), true);
      if (!Number.isFinite(n) || Math.abs(n) > 1000000 || n === 0 || n === 1 || n === -1 || tag === 5 && Math.fround(n) === n) bad();
      return n;
    };
    const world = string(); if (!id(world)) bad();
    const bytes = word(); if (bytes > BL.npcAuthority.MAX || bytes < 16) bad();
    const start = take(bytes), ooga = raw.slice(start, start + bytes).buffer;
    if (!BL.npcAuthority.poses(ooga)) bad();
    const count = byte(); if (new Uint32Array(ooga, 0, 4)[2] + count > ACTORS) bad();
    const clankers = []; let previous = -1;
    for (let i = 0; i < count; i++) {
      const index = byte(); if (index <= previous || index >= ACTORS) bad(); previous = index;
      const profile = Array.from({ length: 10 }, number), form = byte(); if (form > 1) bad();
      const appearance = [form ? "code" : "ape", ...Array.from({ length: 5 }, byte)], held = string() || null, nodes = byte();
      if (nodes < 11 || nodes > BL.clankerPose.MAX_NODES) bad();
      const pose = { v: BL.clankerPose.VERSION, world, profile, appearance, held,
        nodes: Array.from({ length: nodes }, () => Array.from({ length: BL.clankerPose.WIDTH }, number)) };
      if (immutable) BL.clankerPose.immutable(pose); else BL.clankerPose.validate(pose);
      clankers.push({ index, pose });
    }
    if (at !== raw.length) bad();
    return { world, ooga, clankers };
  };
  BL.npcPosePacket = { MAGIC, VERSION, MAX, EXPANDED, ACTORS, pack, unpack };
})();
