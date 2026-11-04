// Lossless JSON-state packing: object field names live once per ordered shape.
// No quantization, compression dependency, executable schema or object references.
import { boundedJSON } from "./virtual-host.js";
export const PACK = Object.freeze({ version: 1, nodes: 13000, depth: 20, shapes: 128, keys: 64, keyChars: 128,
  stringChars: 4096, expandedBytes: 256 * 1024 });
const encoder = new TextEncoder(), fail = () => { throw new Error("invalid packed checkpoint or capacity"); };
const plain = v => v && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const dense = a => {
  if (!Array.isArray(a) || Reflect.ownKeys(a).length !== a.length + 1) return false;
  for (let i = 0; i < a.length; i++) {
    const d = Object.getOwnPropertyDescriptor(a, i);
    if (!d || !Object.hasOwn(d, "value")) return false;
  }
  return true;
};
const bytes = v => encoder.encode(JSON.stringify(v)).byteLength;
const shapeBytes = keys => 2 + Math.max(0, keys.length - 1) + keys.reduce((n,k) => n + bytes(k) + 1, 0);

export function createCheckpointPack(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256 || maxBytes > 96 * 1024) fail();
  function meter() {
    let nodes = 0, size = 0;
    return (depth, amount) => { if (++nodes > PACK.nodes || depth > PACK.depth || (size += amount) > PACK.expandedBytes) fail(); };
  }
  function primitive(v, depth, charge) {
    if (v !== null && typeof v !== "boolean" && typeof v !== "number" && typeof v !== "string") fail();
    if (typeof v === "number" && !Number.isFinite(v) || typeof v === "string" && v.length > PACK.stringChars) fail();
    charge(depth, bytes(v));
    return v;
  }
  return {
    pack(state) {
      const shapes = [], costs = [], indexes = new Map(), seen = new WeakSet(), charge = meter();
      const visit = (v, depth) => {
        if (v === null || typeof v !== "object") {
          primitive(v, depth, charge); return Object.is(v, -0) ? [-2] : v;
        }
        if (seen.has(v)) fail(); // canonical checkpoints use ids for shared references
        seen.add(v);
        if (Array.isArray(v)) {
          if (!dense(v) || v.length > PACK.nodes) fail();
          charge(depth, 2 + Math.max(0, v.length - 1));
          return [-1, ...v.map(x => visit(x, depth + 1))];
        }
        if (!plain(v)) fail();
        const keys = Object.keys(v);
        if (keys.length > PACK.keys || Reflect.ownKeys(v).length !== keys.length
          || keys.some(k => k.length > PACK.keyChars || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, k), "value"))) fail();
        const name = JSON.stringify(keys);
        let index = indexes.get(name);
        if (index === undefined) {
          if (shapes.length >= PACK.shapes) fail();
          index = shapes.length; indexes.set(name, index); shapes.push(keys); costs.push(shapeBytes(keys));
        }
        charge(depth, costs[index]);
        return [index, ...keys.map(k => visit(v[k], depth + 1))];
      };
      const packed = { v: PACK.version, shapes, data: visit(state, 0) };
      boundedJSON(packed, maxBytes);
      return packed;
    },
    unpack(packed) {
      // Bound the wire tree before allocating its expanded objects. Expansion is
      // separately charged, including every repeated field name, before descent.
      boundedJSON(packed, maxBytes);
      if (!plain(packed) || Object.keys(packed).length !== 3 || packed.v !== PACK.version
        || !Object.hasOwn(packed, "data") || !dense(packed.shapes) || packed.shapes.length > PACK.shapes) fail();
      const costs = packed.shapes.map(keys => {
        if (!dense(keys) || keys.length > PACK.keys || keys.some(k => typeof k !== "string" || k.length > PACK.keyChars)
          || new Set(keys).size !== keys.length) fail();
        return shapeBytes(keys);
      }), charge = meter();
      const visit = (v, depth) => {
        if (!Array.isArray(v)) return primitive(v, depth, charge);
        if (!dense(v) || !v.length) fail();
        const tag = v[0];
        if (tag === -2 && v.length === 1) { charge(depth, 1); return -0; }
        if (tag === -1) {
          charge(depth, 2 + Math.max(0, v.length - 2));
          return v.slice(1).map(x => visit(x, depth + 1));
        }
        if (!Number.isInteger(tag) || tag < 0 || tag >= packed.shapes.length) fail();
        const keys = packed.shapes[tag];
        if (v.length !== keys.length + 1) fail();
        charge(depth, costs[tag]);
        const object = {};
        for (let i = 0; i < keys.length; i++) Object.defineProperty(object, keys[i],
          { value: visit(v[i + 1], depth + 1), enumerable: true, writable: true, configurable: true });
        return object;
      };
      return visit(packed.data, 0);
    },
  };
}
