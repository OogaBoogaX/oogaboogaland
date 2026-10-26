// Immutable CPU meshes, opt-in while classic face readers are migrated. The compact copy remains available
// for context restoration and Canvas 2D; this does not change either renderer's GPU upload format.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const enabled = new URLSearchParams(window.location.search).get("compactGeometry") === "1";
  const CORE = new Set(["i", "color"]);
  const own = Object.prototype.hasOwnProperty, INDEX = /^(0|[1-9][0-9]*)$/;
  const indexOf = (key) => typeof key === "string" && INDEX.test(key) ? Number(key) : -1;
  const storageOf = (geometry) => {
    const data = geometry.compactGeometry;
    // Some builders spread a template then replace its faces or vertices. A borrowed marker is not that mesh.
    return data && geometry.verts === data.positions && geometry.faces === data.faces ? data : null;
  };
  // Numeric getters share one high-water prototype. A cursor moves two windows into the typed storage;
  // it never creates an index/color subarray, resizes an array or copies a face's graph on a read.
  let windowSlots = 0;
  class ArrayWindow {
    constructor() { this.data = null; this.start = this.length = 0; }
    every(fn) { for (let i = 0; i < this.length; i++) if (!fn(this.data[this.start + i], i, this)) return false; return true; }
    *[Symbol.iterator]() { for (let i = 0; i < this.length; i++) yield this.data[this.start + i]; }
  }
  const reserveWindows = (count) => {
    while (windowSlots < count) {
      const index = windowSlots++;
      Object.defineProperty(ArrayWindow.prototype, index, { get() { return index < this.length ? this.data[this.start + index] : undefined; } });
    }
  };
  const readFace = (geometry, index, out) => {
    const data = storageOf(geometry);
    if (!data) return geometry.faces[index];
    if (index < 0 || index >= data.count) return undefined;
    const start = data.offsets[index], end = data.offsets[index + 1], ids = out.i, color = out.color;
    ids.data = data.indices; ids.start = start; ids.length = end - start;
    const extra = data.colorExtras.get(index);
    color.data = extra || data.colors; color.start = extra ? 0 : index * 3; color.length = extra ? extra.length : 3;
    for (let k = 0; k < data.columns.length; k++) {
      const column = data.columns[k], code = column.codes[index];
      out[column.key] = code ? column.values[code - 1] : undefined;
    }
    return out;
  };
  // One cursor belongs to one synchronous reader, never to the geometry. Reading the next face overwrites it.
  const createCursor = (geometry) => {
    const out = { i: new ArrayWindow(), color: new ArrayWindow() }, data = storageOf(geometry);
    if (data) {
      reserveWindows(Math.max(data.maxCorners, data.maxColor));
      for (const column of data.columns) out[column.key] = undefined;
    }
    return out;
  };
  const plainFace = (data, index) => {
    const extra = data.colorExtras.get(index);
    const face = { i: Array.from(data.indices.subarray(data.offsets[index], data.offsets[index + 1])),
      color: extra ? Array.from(extra) : Array.from(data.colors.subarray(index * 3, index * 3 + 3)) };
    for (const column of data.columns) {
      const code = column.codes[index];
      if (code) face[column.key] = column.values[code - 1];
    }
    return face;
  };
  const legacyFace = (data, index) => {
    let face = data.legacy.get(index);
    if (face) return face;
    face = plainFace(data, index);
    Object.freeze(face.i); Object.freeze(face.color); Object.freeze(face);
    data.legacy.set(index, face);
    return face;
  };
  // A builder copying a packed mesh's faces into a new one (`merge`, a track's sector bake) takes fresh plain records,
  // which leave its legacy cache empty; an unpacked mesh's faces come back as they are.
  const copyFace = (geometry, index) => { const data = storageOf(geometry); return data ? plainFace(data, index) : geometry.faces[index]; };
  // Keep Array.isArray, numeric access and Array prototype readers during migration. Only an unsupported reader
  // asks for a persistent face view; each index materializes once, so repeated access creates nothing further.
  // Renderer and visibility readers use cursors and leave this bounded compatibility cache empty.
  const legacyFaces = (data) => {
    const target = [];
    target.length = data.count;
    return new Proxy(target, {
      get: (array, key, receiver) => {
        const index = indexOf(key);
        return index >= 0 ? index < data.count ? legacyFace(data, index) : undefined : Reflect.get(array, key, receiver);
      },
      has: (array, key) => { const index = indexOf(key); return index >= 0 ? index < data.count : Reflect.has(array, key); },
      getOwnPropertyDescriptor: (array, key) => {
        const index = indexOf(key);
        return index >= 0 && index < data.count ? { value: legacyFace(data, index), enumerable: true, configurable: true, writable: false } : Reflect.getOwnPropertyDescriptor(array, key);
      },
      ownKeys: () => {
        const keys = new Array(data.count + 1);
        for (let index = 0; index < data.count; index++) keys[index] = String(index);
        keys[data.count] = "length";
        return keys;
      },
      preventExtensions: () => { throw new TypeError("Compact geometry is immutable"); },
      set: () => { throw new TypeError("Compact geometry is immutable"); },
      defineProperty: () => { throw new TypeError("Compact geometry is immutable"); },
      deleteProperty: () => { throw new TypeError("Compact geometry is immutable"); }
    });
  };
  const pack = (geometry, { immutable = false, renderOnly = false, precision = 32 } = {}) => {
    if (!enabled || storageOf(geometry)) return geometry;
    if (!immutable || !renderOnly) throw new TypeError("Compact geometry requires immutable render-only ownership");
    if (precision !== 32 && precision !== 64) throw new TypeError("Compact geometry needs 32-bit or 64-bit positions");
    const faces = geometry.faces, verts = geometry.verts, count = faces.length;
    if (!count) return geometry;
    const offsets = new Uint32Array(count + 1), colors = new Uint8Array(count * 3), flags = new Uint8Array(count);
    const columns = [], byKey = new Map(), colorExtras = new Map();
    let corners = 0, maxCorners = 0, maxColor = 3;
    for (let index = 0; index < count; index++) {
      const face = faces[index];
      if (Object.getPrototypeOf(face) !== Object.prototype) throw new TypeError("Compact geometry needs plain face records");
      offsets[index] = corners; corners += face.i.length; maxCorners = Math.max(maxCorners, face.i.length);
      maxColor = Math.max(maxColor, face.color.length);
      let bytes = face.color.length === 3;
      for (let k = 0; k < face.color.length; k++) {
        const value = face.color[k];
        if (!Number.isInteger(value) || value < 0 || value > 255 || Object.is(value, -0)) bytes = false;
        if (k < 3) colors[index * 3 + k] = value;
      }
      // Some authored Matrix colours have a fourth, negative marker; preserve non-byte colours exactly.
      if (!bytes) colorExtras.set(index, Float64Array.from(face.color));
      flags[index] = (face.visibility === false ? 1 : 0) | (face.road ? 2 : 0) | (face.water ? 4 : 0) | (face.lake ? 8 : 0)
        | (face.matrixCave || face.matrixLocalGlyphSurface || face.matrixWorldGlyphSurface || face.matrixPermanentFallback ? 16 : 0);
      for (const key of Reflect.ownKeys(face)) {
        if (CORE.has(key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(face, key);
        if (typeof key !== "string" || !own.call(descriptor, "value")) throw new TypeError("Compact geometry needs data face fields");
        let column = byKey.get(key);
        if (!column) { column = { key, codes: new Uint32Array(count), values: [], ids: new Map() }; byKey.set(key, column); columns.push(column); }
        const value = descriptor.value, valueKey = Object.is(value, -0) ? NEGATIVE_ZERO : value;
        let code = column.ids.get(valueKey);
        if (code === undefined) { code = column.values.length + 1; column.ids.set(valueKey, code); column.values.push(value); }
        column.codes[index] = code;
      }
    }
    offsets[count] = corners;
    const indices = new Uint32Array(corners);
    for (let index = 0; index < count; index++) {
      const ids = faces[index].i;
      for (let k = 0; k < ids.length; k++) {
        const vertex = ids[k];
        if (!Number.isInteger(vertex) || vertex < 0 || vertex * 3 + 2 >= verts.length) throw new RangeError("Compact geometry has an invalid vertex index");
        indices[offsets[index] + k] = vertex;
      }
    }
    let byteLength = offsets.byteLength + indices.byteLength + colors.byteLength + flags.byteLength;
    for (const column of columns) {
      const Type = column.values.length < 256 ? Uint8Array : column.values.length < 65536 ? Uint16Array : Uint32Array;
      if (Type !== Uint32Array) column.codes = Type.from(column.codes);
      delete column.ids;
      byteLength += column.codes.byteLength;
    }
    const positions = precision === 64 ? Float64Array.from(verts) : Float32Array.from(verts);
    for (const color of colorExtras.values()) byteLength += color.byteLength;
    const data = { version: 1, positions, offsets, indices, colors, flags, columns, colorExtras, count, maxCorners, maxColor, byteLength: byteLength + positions.byteLength, legacy: new Map() };
    // Publish atomically after validation, releasing the source face objects and double arrays. Lines, normals,
    // and every geometry-level sidecar stay with their owner. No closure above captures the old arrays.
    data.faces = legacyFaces(data);
    // Reassigning either throws (every module is strict); the typed positions themselves cannot refuse a write.
    Object.defineProperty(geometry, "verts", { value: positions, enumerable: true, writable: false, configurable: false });
    Object.defineProperty(geometry, "faces", { value: data.faces, enumerable: true, writable: false, configurable: false });
    geometry.compactGeometry = data;
    return geometry;
  };
  const NEGATIVE_ZERO = Object.freeze({});
  BL.compactGeometry = { enabled, pack, storageOf, createCursor, readFace, copyFace };
})();
