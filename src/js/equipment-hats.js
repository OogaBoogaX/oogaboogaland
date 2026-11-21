// The portable hat contract. Item IDs stay fixed; a version names immutable, renderer-independent geometry.
// The Worker shares this metadata and validator, without importing model builders or loading a browser.
(() => {
  "use strict";
  const BL = globalThis.BL = globalThis.BL || {};
  const HASH = /^[a-f0-9]{64}$/, ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const MAX_BYTES = 512 * 1024, MAX_NODES = 12, MAX_VERTICES = 30000, MAX_FACES = 20000, MAX_VERSIONS = 256;
  const own = (v, keys) => !!v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
  const finite = (v, bound) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= bound;
  const vector = (v, bound) => Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, bound));
  const fail = () => { throw new Error("Invalid immutable hat archive"); };
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const encode = (archive) => JSON.stringify(canonical(archive)) + "\n";
  const validate = (archive, item) => {
    if (!own(archive, ["format", "item", "fit", "nodes"]) || archive.format !== 1 || archive.item !== item
      || typeof item !== "string" || item.length > 64 || !ID.test(item) || archive.fit !== "ooga-head-v1"
      || !Array.isArray(archive.nodes) || !archive.nodes.length || archive.nodes.length > MAX_NODES) fail();
    let vertices = 0, faces = 0;
    for (const node of archive.nodes) {
      if (!own(node, ["position", "rotation", "scale", "geometry"]) || !vector(node.position, 4)
        || !vector(node.rotation, Math.PI * 2) || !vector(node.scale, 4) || node.scale.some((n) => n <= 0)) fail();
      const geo = node.geometry;
      if (!own(geo, ["verts", "faces", "lines"]) || !Array.isArray(geo.verts) || !geo.verts.length || geo.verts.length % 3
        || !geo.verts.every((v) => finite(v, 8)) || !Array.isArray(geo.faces) || !geo.faces.length
        || !Array.isArray(geo.lines) || geo.lines.length) fail();
      vertices += geo.verts.length / 3; faces += geo.faces.length;
      if (vertices > MAX_VERTICES || faces > MAX_FACES) fail();
      for (const face of geo.faces) {
        if (!own(face, ["i", "color", "emissive"]) || !Array.isArray(face.i) || face.i.length < 3 || face.i.length > 32
          || !face.i.every((i) => Number.isSafeInteger(i) && i >= 0 && i < geo.verts.length / 3)
          || !vector(face.color, 255) || face.color.some((c) => c < 0) || !finite(face.emissive, 4) || face.emissive < 0) fail();
      }
    }
    return archive;
  };
  const records = new Map(), versions = new Map();
  let items = Object.freeze([]);
  const register = (rows) => {
    if (items.length || !Array.isArray(rows) || rows.length > 32) throw new Error("Hat registry already initialized or invalid");
    let total = 0;
    for (const row of rows) {
      if (!own(row, ["id", "label", "creator", "current", "versions"]) || typeof row.id !== "string" || row.id === "none"
        || row.id.length > 64 || !ID.test(row.id) || records.has(row.id) || typeof row.label !== "string" || !row.label || row.label.length > 80
        || typeof row.creator !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(row.creator) || !HASH.test(row.current)
        || !Array.isArray(row.versions) || !row.versions.includes(row.current) || new Set(row.versions).size !== row.versions.length
        || !row.versions.every((v) => HASH.test(v)) || (total += row.versions.length) > MAX_VERSIONS) throw new Error("Invalid hat registry");
      const entry = Object.freeze({ ...row, versions: Object.freeze([...row.versions]) });
      records.set(row.id, entry);
      for (const version of row.versions) versions.set(row.id + ":" + version, Object.freeze({ id: row.id, version, label: row.label, creator: row.creator, fit: "ooga-head-v1" }));
    }
    items = Object.freeze([...records.values()]);
  };
  const none = Object.freeze({ id: "none", version: null, label: "No hat", creator: null, fit: "ooga-head-v1" });
  const current = (id) => records.get(id)?.current || null;
  const get = (id, version = current(id)) => id === "none" && version === null ? none : versions.get(id + ":" + version) || null;
  const has = (id, version) => (id === "none" ? version === null : typeof version === "string" && HASH.test(version)) && !!get(id, version);
  // A helmet enclosing the apple shell cannot shrink below its reviewed fit. Shared by preview, rendering and saves.
  const minimumSize = (character, item) => item === "johnstackton21m-helmet"
    && typeof character === "string" && character.toLowerCase() === "w-s-bitcoin" ? 100 : 80;
  // A verified newer archive may arrive in an older tab. It extends that tab's immutable versions, not its current pointer.
  const accept = (id, version) => {
    const row = records.get(id);
    if (!row || !HASH.test(version) || versions.size >= MAX_VERSIONS && !has(id, version)) throw new Error("Hat version is not supported");
    if (!has(id, version)) versions.set(id + ":" + version, Object.freeze({ id, version, label: row.label, creator: row.creator, fit: "ooga-head-v1" }));
    return get(id, version);
  };
  BL.equipmentHats = { register, current, get, has, accept, minimumSize, validate, encode, MAX_BYTES, MAX_VERSIONS, get items() { return items; } };
})();
