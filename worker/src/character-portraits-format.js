// The immutable face sheet paired with one catalog. Shared by the trusted renderer, publisher and Worker.
const HASH = /^[a-f0-9]{64}$/;
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const fail = () => { throw new Error("Invalid character portrait manifest"); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;
export const createPortraitManifest = (catalog, revision, image) => {
  const names = catalog.entries.map((entry) => entry.identity.handle.toLowerCase()).sort();
  const manifest = { version: 1, revision, baseline: catalog.baseline, engine: catalog.engine, environment: catalog.environment,
    image, size: 80, columns: 8, rows: Math.ceil((names.length + 1) / 8),
    cells: Object.fromEntries(names.map((name, index) => [name, index])), fallback: names.length };
  return validatePortraitManifest(manifest, catalog, revision);
};
export const validatePortraitManifest = (manifest, catalog, revision) => {
  if (!exact(manifest, ["version", "revision", "baseline", "engine", "environment", "image", "size", "columns", "rows", "cells", "fallback"])
    || manifest.version !== 1 || !HASH.test(revision) || manifest.revision !== revision || !HASH.test(manifest.image)
    || !["baseline", "engine", "environment"].every((key) => manifest[key] === catalog[key])
    || manifest.size !== 80 || manifest.columns !== 8 || !exact(manifest.cells, catalog.entries.map((entry) => entry.identity.handle.toLowerCase()))
    || manifest.fallback !== catalog.entries.length || manifest.rows !== Math.ceil((manifest.fallback + 1) / 8)) fail();
  const names = Object.keys(manifest.cells).sort();
  if (names.some((name, index) => manifest.cells[name] !== index)) fail();
  return manifest;
};
export const pngDimensions = (bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 33 || bytes.byteLength > PORTRAIT_MAX_BYTES
    || ![137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].every((byte, i) => bytes[i] === byte)) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width !== 640 || height < 80 || height > 1360 || height % 80 || bytes[24] !== 8
    || ![2,6].includes(bytes[25]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) fail();
  let image = false, end = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length || end) fail();
    const length = view.getUint32(offset), next = offset + 12 + length;
    if (next > bytes.length) fail();
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(kind) || kind === "IHDR" && offset !== 8) fail();
    let crc = 0xffffffff;
    for (let i = offset + 4; i < next - 4; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(next - 4)) fail();
    if (kind === "IDAT") image = true;
    if (kind === "IEND") { if (length || !image) fail(); end = true; }
    offset = next;
  }
  if (!end) fail();
  return { width, height };
};
