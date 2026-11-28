// A server-hosted game's motion frame, shared unchanged by the page and the Worker (worker/src/game-host.js sends what
// a kind writes into one every tick; game-net.js reads it into one it keeps): where everything that moves stands at one
// moment, and which of each shooter's rounds the server took. Bytes, little-endian: the magic "OGM1", the kind's code
// (u8), the format (u8), the row count (u16), the server's clock (f64, ms), the game's own (f64, ms) and the
// confirmation count (u16); then `ROW` bytes a row: its type (u8, the kind's own numbering), slot (u8), id (u16, its
// low 16 bits), x, y, z (i16, centimetres, ±327 m about the game's own middle), heading (u8, of a whole turn) and
// flags (u8); then `CONFIRM` bytes a confirmation: the shooter's account id (u32), the round's number (u16), what it met
// (u16, an id's low 16 bits) and the damage it did (u8) and flags (u8, the kind's). A frame object (`frame`) holds the
// same as numbers: rows as [type, slot, id, x, y, z, heading, flags] (metres, radians) and confirmations as
// [shooter, round, target, damage, flags]. `decode` refuses anything that is not a whole frame of this format.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};

  const MAGIC = 0x314d474f, FORMAT = 1, HEADER = 26, ROW = 12, CONFIRM = 10, ROW_WIDTH = 8, CONFIRM_WIDTH = 5;
  const MAX_ROWS = 255, MAX_CONFIRMS = 64, CM = 100, TAU = Math.PI * 2;
  /** A frame to fill or read into, with room for `rows` rows and `confirms` confirmations. */
  const frame = (rows = MAX_ROWS, confirms = MAX_CONFIRMS) => ({ kind: 0, serverMs: 0, gameMs: 0, count: 0, confirms: 0,
    rows: new Float64Array(rows * ROW_WIDTH), confirm: new Float64Array(confirms * CONFIRM_WIDTH) });
  /** The bytes a frame of `rows` rows and `confirms` confirmations takes. */
  const size = (rows, confirms) => HEADER + rows * ROW + confirms * CONFIRM;
  const cm = (v) => Math.max(-32768, Math.min(32767, Math.round(v * CM)));
  const turn = (h) => Math.round((h % TAU + TAU) % TAU / TAU * 256) & 255;
  /** Writes frame `f` into `buffer` (an ArrayBuffer of at least `size` bytes); returns the bytes it took. */
  const encode = (f, buffer) => {
    const v = new DataView(buffer), n = Math.min(f.count, MAX_ROWS), c = Math.min(f.confirms, MAX_CONFIRMS);
    v.setUint32(0, MAGIC, true); v.setUint8(4, f.kind); v.setUint8(5, FORMAT); v.setUint16(6, n, true);
    v.setFloat64(8, f.serverMs, true); v.setFloat64(16, f.gameMs, true); v.setUint16(24, c, true);
    let o = HEADER;
    for (let i = 0; i < n; i++, o += ROW) {
      const r = f.rows, k = i * ROW_WIDTH;
      v.setUint8(o, r[k]); v.setUint8(o + 1, r[k + 1]); v.setUint16(o + 2, r[k + 2] & 0xffff, true);
      v.setInt16(o + 4, cm(r[k + 3]), true); v.setInt16(o + 6, cm(r[k + 4]), true); v.setInt16(o + 8, cm(r[k + 5]), true);
      v.setUint8(o + 10, turn(r[k + 6])); v.setUint8(o + 11, r[k + 7]);
    }
    for (let i = 0; i < c; i++, o += CONFIRM) {
      const r = f.confirm, k = i * CONFIRM_WIDTH;
      v.setUint32(o, r[k] >>> 0, true); v.setUint16(o + 4, r[k + 1] & 0xffff, true); v.setUint16(o + 6, r[k + 2] & 0xffff, true);
      v.setUint8(o + 8, Math.max(0, Math.min(255, Math.round(r[k + 3])))); v.setUint8(o + 9, r[k + 4]);
    }
    return o;
  };
  /** Reads `buffer` into frame `f`; false, `f` untouched, when it is not a whole frame of this format that `f` can hold. */
  const decode = (buffer, f) => {
    if (Object.prototype.toString.call(buffer) !== "[object ArrayBuffer]" || buffer.byteLength < HEADER) return false;
    const v = new DataView(buffer);
    if (v.getUint32(0, true) !== MAGIC || v.getUint8(5) !== FORMAT) return false;
    const n = v.getUint16(6, true), c = v.getUint16(24, true);
    if (buffer.byteLength !== size(n, c) || n * ROW_WIDTH > f.rows.length || c * CONFIRM_WIDTH > f.confirm.length) return false;
    const serverMs = v.getFloat64(8, true), gameMs = v.getFloat64(16, true);
    if (!Number.isFinite(serverMs) || !Number.isFinite(gameMs)) return false;
    f.kind = v.getUint8(4); f.serverMs = serverMs; f.gameMs = gameMs; f.count = n; f.confirms = c;
    let o = HEADER;
    for (let i = 0; i < n; i++, o += ROW) {
      const r = f.rows, k = i * ROW_WIDTH;
      r[k] = v.getUint8(o); r[k + 1] = v.getUint8(o + 1); r[k + 2] = v.getUint16(o + 2, true);
      r[k + 3] = v.getInt16(o + 4, true) / CM; r[k + 4] = v.getInt16(o + 6, true) / CM; r[k + 5] = v.getInt16(o + 8, true) / CM;
      r[k + 6] = v.getUint8(o + 10) / 256 * TAU; r[k + 7] = v.getUint8(o + 11);
    }
    for (let i = 0; i < c; i++, o += CONFIRM) {
      const r = f.confirm, k = i * CONFIRM_WIDTH;
      r[k] = v.getUint32(o, true); r[k + 1] = v.getUint16(o + 4, true); r[k + 2] = v.getUint16(o + 6, true);
      r[k + 3] = v.getUint8(o + 8); r[k + 4] = v.getUint8(o + 9);
    }
    return true;
  };

  BL.gameWire = { MAGIC, FORMAT, HEADER, ROW, CONFIRM, ROW_WIDTH, CONFIRM_WIDTH, MAX_ROWS, MAX_CONFIRMS, frame, size, encode, decode };
})();
