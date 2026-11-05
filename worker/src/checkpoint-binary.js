// Exact scalar/tree encoding for opt-in checkpoint v2. Its caller validates the
// source tree first and supplies the SAME node/depth/expanded-byte meter on read.
// No compression dictionary history, references to objects or executable schema.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", CHUNK = 3072;
const VALUES = [null, false, true, 0, 1, -1, -0];
const fail = () => { throw Error("invalid binary checkpoint or capacity"); };
export const scalarCost = v => typeof v === "string" ? 3 + v.length * 2 : typeof v !== "number" || v === 0 || v === 1 || v === -1 ? 1
  : Number.isInteger(v) && Math.abs(v) <= 65535 ? 3 : Math.fround(v) === v ? 5 : 9;
const base64 = bytes => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
    out += ALPHABET[a >>> 2] + ALPHABET[(a & 3) << 4 | b >>> 4]
      + (i + 1 < bytes.length ? ALPHABET[(b & 15) << 2 | c >>> 6] : "=") + (i + 2 < bytes.length ? ALPHABET[c & 63] : "=");
  }
  return out;
};
const unbase64 = chunks => {
  if (!Array.isArray(chunks) || !chunks.length || chunks.length > 86) fail();
  let length = 0;
  for (let i = 0; i < chunks.length; i++) {
    const s = chunks[i];
    if (typeof s !== "string" || !s.length || s.length > 4096 || s.length % 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)
      || i < chunks.length - 1 && (s.length !== 4096 || s.endsWith("="))) fail();
    length += s.length / 4 * 3 - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
  }
  if (length > 256 * 1024) fail();
  const bytes = new Uint8Array(length); let at = 0;
  for (const s of chunks) for (let i = 0; i < s.length; i += 4) {
    const a = ALPHABET.indexOf(s[i]), b = ALPHABET.indexOf(s[i + 1]);
    const c = s[i + 2] === "=" ? 0 : ALPHABET.indexOf(s[i + 2]), d = s[i + 3] === "=" ? 0 : ALPHABET.indexOf(s[i + 3]);
    bytes[at++] = a << 2 | b >>> 4;
    if (s[i + 2] !== "=") bytes[at++] = b << 4 | c >>> 2;
    if (s[i + 3] !== "=") bytes[at++] = c << 6 | d;
    if (s[i + 2] === "=" ? b & 15 : s[i + 3] === "=" ? c & 3 : false) fail();
  }
  return bytes;
};

export function encodeCheckpoint(tree, scalars, limits) {
  const data = new Uint8Array(limits.expandedBytes), view = new DataView(data.buffer), ids = new Map(scalars.map((v, i) => [v, i]));
  let at = 0;
  const reserve = n => { if (at + n > data.length) fail(); const start = at; at += n; return start; };
  const byte = n => { data[reserve(1)] = n; }, word = n => view.setUint16(reserve(2), n, true);
  const write = v => {
    if (Array.isArray(v)) {
      if (v[0] === -2) { byte(6); return; }
      if (v[0] === -1) { byte(11); word(v.length - 1); }
      else { byte(12); byte(v[0]); }
      for (let i = 1; i < v.length; i++) write(v[i]); return;
    }
    const index = ids.get(v); if (index !== undefined) { byte(10); byte(index); return; }
    if (v === null) byte(0);
    else if (typeof v === "boolean") byte(v ? 2 : 1);
    else if (typeof v === "string") {
      // UTF-16 code units preserve lone surrogates as well as Unicode pairs.
      byte(9); word(v.length); for (let i = 0; i < v.length; i++) word(v.charCodeAt(i));
    } else if (v === 0) byte(3);
    else if (v === 1) byte(4);
    else if (v === -1) byte(5);
    else if (Number.isInteger(v) && Math.abs(v) <= 65535) { byte(v < 0 ? 14 : 13); word(Math.abs(v)); }
    else if (Math.fround(v) === v) { byte(7); view.setFloat32(reserve(4), v, true); }
    else { byte(8); view.setFloat64(reserve(8), v, true); }
  };
  write(tree); const chunks = [];
  for (let i = 0; i < at; i += CHUNK) chunks.push(base64(data.subarray(i, Math.min(at, i + CHUNK))));
  return chunks;
}

export function decodeCheckpoint(chunks, shapes, scalars, costs, limits, charge) {
  const bytes = unbase64(chunks), view = new DataView(bytes.buffer), encoder = new TextEncoder(); let at = 0;
  const take = n => { if (at + n > bytes.length) fail(); const start = at; at += n; return start; };
  const byte = () => bytes[take(1)], word = () => view.getUint16(take(2), true);
  const read = depth => {
    if (depth > limits.depth) fail();
    const tag = byte(); let value;
    if (tag === 11) {
      const count = word(); if (count > limits.nodes) fail();
      charge(depth, 2 + Math.max(0, count - 1)); const out = [];
      for (let i = 0; i < count; i++) out.push(read(depth + 1)); return out;
    }
    if (tag === 12) {
      const index = byte(); if (index >= shapes.length) fail();
      charge(depth, costs[index]); const out = {};
      for (const key of shapes[index]) Object.defineProperty(out, key, { value: read(depth + 1), enumerable: true, writable: true, configurable: true });
      return out;
    }
    if (tag < 7) value = VALUES[tag];
    else if (tag === 7 || tag === 8) {
      value = tag === 7 ? view.getFloat32(take(4), true) : view.getFloat64(take(8), true);
      if (!Number.isFinite(value) || value === 0 || value === 1 || value === -1 || Number.isInteger(value) && Math.abs(value) <= 65535
        || tag === 8 && Math.fround(value) === value) fail();
    } else if (tag === 9) {
      const count = word(); if (count > limits.stringChars) fail();
      take(count * 2); value = "";
      for (let i = at - count * 2; i < at; i += 2) value += String.fromCharCode(view.getUint16(i, true));
    } else if (tag === 10) { const index = byte(); if (index >= scalars.length) fail(); value = scalars[index]; }
    else if (tag === 13 || tag === 14) { value = word(); if (value < 2) fail(); if (tag === 14) value = -value; }
    else fail();
    charge(depth, encoder.encode(JSON.stringify(value)).byteLength); return value;
  };
  const result = read(0); if (at !== bytes.length) fail(); return result;
}
