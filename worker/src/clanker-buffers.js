// Fixed Clanker typed-buffer checkpoint component. This is not a controller or
// world checkpoint: clocks, scalar state, references and rig state belong to its
// enclosing transaction. No runtime caller enables it yet.
import { boundedJSON, HOST } from "./virtual-host.js";
export const CLANKER_BUFFERS = Object.freeze({ version: 1, actors: 53, fixedActors: HOST.maxOogas, bytes: 32 * 1024,
  expandedBytes: 1024 * 1024, blockBytes: 64 });
// Fixed source-owned schema; no constructor, property path or allocation length
// comes from a stored checkpoint. A source layout change requires a new version.
const baseSchema = [
  ["rage", "times", Float64Array, 42], ["rage", "hitters", Uint16Array, 42],
  ["rage", "serials", Float64Array, 128], ["rage", "path", Float64Array, 768],
  ["rage", "edgeRejected", Uint8Array, 48], ["rage", "rejectedTargets", Uint8Array, 0],
  ["rage", "agitators", Uint8Array, 0], ["sleep", "path", Float64Array, 48],
  ["office", "path", Float64Array, 12], ["roam", "path", Float64Array, 12],
  ["debugMove", "visited", Float64Array, 96], ["debugMove", "failed", Float64Array, 96],
  ["lab", "path", Float64Array, 48], ["lab", "pathFacings", Float64Array, 16],
  ["lab", "pathWaits", Float64Array, 16], ["motion", "officeHands", Float64Array, 6],
  ["climb", "points", Float64Array, 384], ["climb", "lengths", Float64Array, 128],
  ["climb", "headings", Float64Array, 128], ["jump", "points", Float64Array, 63],
];
// Fixed-path capacity is selected by trusted world construction, never storage.
export const CLANKER_FIXED_PATH_CAPACITY = 512;
const fixedSchema = [...baseSchema, ["pathing", "laneX", Float64Array, CLANKER_FIXED_PATH_CAPACITY],
  ["pathing", "laneZ", Float64Array, CLANKER_FIXED_PATH_CAPACITY]];
export const CLANKER_BUFFER_FIELDS = Object.freeze(fixedSchema.map(s => `${s[0]}.${s[1]}`));
const endian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? "le" : "be";
const hex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
const bad = () => { throw Error("invalid Clanker buffer checkpoint or capacity"); };
const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Reflect.ownKeys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const dense = (a, max) => Array.isArray(a) && a.length <= max && Reflect.ownKeys(a).length === a.length + 1
  && Array.from({ length: a.length }, (_, i) => Object.getOwnPropertyDescriptor(a, i)).every(d => d && Object.hasOwn(d, "value"));
// Intrinsic getters work across the headless VM boundary and reject DataView,
// spoofed constructor names and detached buffers without numeric conversion.
const typed = Object.getPrototypeOf(Uint8Array.prototype);
const typeOf = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
const lengthOf = Object.getOwnPropertyDescriptor(typed, "length").get;
const bufferOf = Object.getOwnPropertyDescriptor(typed, "buffer").get;
const offsetOf = Object.getOwnPropertyDescriptor(typed, "byteOffset").get;

export function createClankerBufferCheckpoint(world, ids, identity = e => e?.owner?.id, fixedPaths = false) {
  if (typeof identity !== "function" || typeof fixedPaths !== "boolean") bad();
  const schema = fixedPaths ? fixedSchema : baseSchema, version = fixedPaths ? 2 : CLANKER_BUFFERS.version;
  if (!id(world) || !dense(ids, fixedPaths ? CLANKER_BUFFERS.fixedActors : CLANKER_BUFFERS.actors) || ids.some(s => !id(s)) || new Set(ids).size !== ids.length) bad();
  ids = [...ids];
  const length = spec => spec[3] || ids.length;
  const byteLength = spec => length(spec) * spec[2].BYTES_PER_ELEMENT;
  const optional = spec => spec[1] === "rejectedTargets" ? 1 : spec[1] === "agitators" ? 2 : 0;
  const maxRow = 1 + schema.reduce((n, spec) => n + Math.ceil(byteLength(spec) / CLANKER_BUFFERS.blockBytes) * 3, 0);
  // At 64 paired actors: base 1,036,032 B + lanes 524,288 B =
  // 1,560,320 B, below the explicit 1 MiB base plus lane allocation bound.
  // Encoded payload admission remains 32 KiB regardless of roster size.
  if (ids.length * schema.reduce((n, spec) => n + byteLength(spec), 0) > CLANKER_BUFFERS.expandedBytes + (fixedPaths ? ids.length * CLANKER_FIXED_PATH_CAPACITY * 16 : 0)) bad();
  return {
    capture(entries) {
      if (!Array.isArray(entries) || entries.length !== ids.length) bad();
      let size = 0;
      const buffers = entries.map((e, i) => {
        // Active rage searches have a separate large workspace and closure
        // cursor. Refuse that unsupported profile instead of dropping it.
        if (identity(e) !== ids[i] || e.rage?.search !== null) bad();
        // One allocation mask, then sorted field/block/hex triples. Zero blocks
        // are implicit, so empty paths consume no per-field generic tree nodes.
        const row = [0];
        for (let field = 0; field < schema.length; field++) {
          const spec = schema[field];
          const value = e[spec[0]]?.[spec[1]];
          if (!spec[3] && value === null) continue;
          row[0] |= optional(spec);
          if (!ArrayBuffer.isView(value) || typeOf.call(value) !== spec[2].name || lengthOf.call(value) !== length(spec)) bad();
          const buffer = bufferOf.call(value);
          // A concurrent writer would make a torn checkpoint possible.
          if (Object.prototype.toString.call(buffer) !== "[object ArrayBuffer]") bad();
          const bytes = new Uint8Array(buffer, offsetOf.call(value), byteLength(spec));
          for (let start = 0; start < bytes.length; start += CLANKER_BUFFERS.blockBytes) {
            let end = Math.min(start + CLANKER_BUFFERS.blockBytes, bytes.length);
            while (end > start && bytes[end - 1] === 0) end--;
            if (end === start) continue;
            let text = "";
            for (let j = start; j < end; j++) text += hex[bytes[j]];
            size += text.length + 12;
            if (size > CLANKER_BUFFERS.bytes) bad();
            row.push(field, start / CLANKER_BUFFERS.blockBytes, text);
          }
        }
        return row;
      });
      const saved = { v: version, world, endian, ids: [...ids], buffers };
      boundedJSON(saved, CLANKER_BUFFERS.bytes, 13000);
      return saved;
    },
    restore(saved) {
      if (!exact(saved, ["v", "world", "endian", "ids", "buffers"]) || saved.v !== version
        || saved.world !== world || saved.endian !== endian || !dense(saved.ids, ids.length) || saved.ids.length !== ids.length
        || saved.ids.some((s, i) => s !== ids[i]) || !dense(saved.buffers, ids.length) || saved.buffers.length !== ids.length) bad();
      // Validate the complete input before allocating any expanded buffers.
      for (const row of saved.buffers) {
        if (!dense(row, maxRow) || row.length % 3 !== 1 || !Number.isInteger(row[0])
          || Object.is(row[0], -0) || row[0] < 0 || row[0] > 3) bad();
        let previousField = -1, previousBlock = -1;
        for (let j = 1; j < row.length; j += 3) {
          const field = row[j], index = row[j + 1], text = row[j + 2];
          if (!Number.isInteger(field) || Object.is(field, -0) || field < 0 || field >= schema.length) bad();
          const spec = schema[field], bytes = byteLength(spec), start = index * CLANKER_BUFFERS.blockBytes;
          if (!spec[3] && !(row[0] & optional(spec)) || field < previousField
            || !Number.isInteger(index) || Object.is(index, -0) || index < 0 || start >= bytes
            || field === previousField && index <= previousBlock || typeof text !== "string" || !text.length || text.length % 2
            || text.length > Math.min(CLANKER_BUFFERS.blockBytes, bytes - start) * 2
            || !/^[0-9a-f]+$/.test(text) || text.endsWith("00")) bad();
          previousField = field; previousBlock = index;
        }
      }
      boundedJSON(saved, CLANKER_BUFFERS.bytes, 13000);
      return saved.buffers.map(row => {
        const state = {};
        for (const spec of schema) (state[spec[0]] ||= {})[spec[1]] = spec[3] || row[0] & optional(spec)
          ? new spec[2](length(spec)) : null;
        for (let j = 1; j < row.length; j += 3) {
          const spec = schema[row[j]], value = state[spec[0]][spec[1]], bytes = new Uint8Array(value.buffer);
          const start = row[j + 1] * CLANKER_BUFFERS.blockBytes, text = row[j + 2];
          for (let at = 0; at < text.length; at += 2) bytes[start + at / 2] = parseInt(text.slice(at, at + 2), 16);
        }
        return state;
      });
    },
  };
}
