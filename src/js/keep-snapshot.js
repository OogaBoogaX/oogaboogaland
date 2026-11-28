// Valhodl's heavy geometry, built once: the terrain grids, the keep, the curtain and its towers are several seconds of
// voxel carving and meshing every visit (keep-models.js `buildSteps`), and come out the same every time. This keeps
// them as one binary snapshot and hands them back to the builders that ask (`wrap`), from, in turn:
//   - the file `npm run site` baked (`BL.keepGeometry`, scripts/distribution-keep.mjs), fetched from this origin
//     (about 4.5 MB gzipped, opened here);
//   - IndexedDB, where a page that had to build stored its own at idle (`finish`), under this build's key, the hashed
//     address of the keep-scene bundle, so any change to the land's code leaves the stored one unread;
//   - nothing, and the builders build as they always have.
// A snapshot that is missing, of another build or version, or that fails any check is ignored: nothing here can stop
// the land from building. The portable page and the source tree have neither a key nor a file, and always build. A
// debug page reads and writes IndexedDB only with `keepcache=1` (so the suite and development build fresh), and
// `keepcache=0` turns every source off anywhere.
//
// The format (`pack`, `unpack`, pure, loadable in Node): a header of JSON and, for each geometry, its faces as the
// greedy mesher makes them (terrain.js `gridGeometrySteps`): quads of four vertices of their own on the grid, so a
// vertex is three Int16 grid coordinates from the geometry's own `voxel` origin and unit, a face is its four in a row
// with one bit for which way round, and everything else a face carries (colour, emissive, water, the mesher's fields)
// is one of a few `kinds`, an index a face. A geometry that is not of that shape is refused by `pack` (null), and its
// builder is simply not in the snapshot.
(() => {
  "use strict";
  const BL = typeof window !== "undefined" ? window.BL = window.BL || {} : globalThis.BL = globalThis.BL || {};
  const VERSION = 1, MAGIC = 0x4b535031, DB = "ooga-keep-v1", STORE = "snapshots", ENTRY = "geometry", DB_TIMEOUT = 1500, FETCH_TIMEOUT = 8000;
  const CORE = "i";

  // One geometry into `out` (a list of typed arrays) and its description; null when it is not grid quads.
  const packGeometry = (geo, out) => {
    const faces = geo.faces, verts = geo.verts, count = faces.length, voxel = geo.voxel;
    if (!voxel || voxel.length !== 4 || geo.lines && geo.lines.length || verts.length !== count * 12) return null;
    const unit = voxel[0], ox = voxel[1], oy = voxel[2], oz = voxel[3], grid = new Int16Array(count * 12);
    for (let n = 0; n < verts.length; n += 3) {
      const x = Math.round((verts[n] - ox) / unit), y = Math.round((verts[n + 1] - oy) / unit), z = Math.round((verts[n + 2] - oz) / unit);
      if (x < -32768 || x > 32767 || y < -32768 || y > 32767 || z < -32768 || z > 32767 || ox + x * unit !== verts[n] || oy + y * unit !== verts[n + 1] || oz + z * unit !== verts[n + 2]) return null;
      grid[n] = x; grid[n + 1] = y; grid[n + 2] = z;
    }
    const kinds = [], ids = new Map(), codes = new Map(), kind = new Uint16Array(count), flip = new Uint8Array(count);
    let nextCode = 1;
    for (let n = 0; n < count; n++) {
      const f = faces[n], i = f.i, b = n * 4;
      if (i.length !== 4 || i[0] !== b || i[2] !== b + 2) return null;
      if (i[1] === b + 1 && i[3] === b + 3) flip[n] = 0; else if (i[1] === b + 3 && i[3] === b + 1) flip[n] = 1; else return null;
      let key = "";
      for (const k in f) {
        if (k === CORE) continue;
        const v = f[k];
        // Values by identity (a colour is its palette's own array) or by value; each gets a small code.
        const id = typeof v === "object" && v !== null ? v : `${typeof v}:${v}`;
        let code = codes.get(id);
        if (!code) { code = nextCode++; codes.set(id, code); }
        key += `${k}=${code};`;
      }
      let at = ids.get(key);
      if (at === undefined) {
        if (kinds.length >= 65535) return null;
        const entries = [];
        for (const k in f) {
          if (k === CORE) continue;
          const v = f[k];
          if (v === undefined) { entries.push([k]); continue; }
          if (typeof v === "number" && (!Number.isFinite(v) || Object.is(v, -0))) return null;
          if (typeof v === "object" && v !== null && !(Array.isArray(v) && v.every((c) => typeof c === "number" && Number.isFinite(c) && !Object.is(c, -0)))) return null;
          entries.push([k, v]);
        }
        at = kinds.length; kinds.push(entries); ids.set(key, at);
      }
      kind[n] = at;
    }
    const extra = {};
    for (const k in geo) {
      if (k === "verts" || k === "faces" || k === "lines" || k === "voxel") continue;
      const v = geo[k];
      if (typeof v !== "number" && typeof v !== "boolean" && typeof v !== "string") return null;
      extra[k] = v;
    }
    const d = { count, voxel: Array.from(voxel), kinds, extra, grid: out.length, kind: out.length + 1, flip: out.length + 2 };
    out.push(grid, kind, flip);
    return d;
  };
  /** A snapshot being made: `add(name, value)` a geometry or `{ part: geometry }` (false when it cannot be packed), then `done()`, an ArrayBuffer. */
  const packer = (key = "") => {
    const arrays = [], items = {};
    const add = (name, value) => {
      const single = !!value.faces, parts = single ? { "": value } : value, mark = arrays.length, described = {};
      for (const part of Object.keys(parts)) {
        const d = parts[part] && parts[part].faces ? packGeometry(parts[part], arrays) : null;
        if (!d) { arrays.length = mark; return false; }
        described[part] = d;
      }
      items[name] = { single, parts: described };
      return true;
    };
    const done = () => {
      const spans = [];
      let at = 0;
      for (const a of arrays) { at += at % a.BYTES_PER_ELEMENT; spans.push([at, a.length]); at += a.byteLength; }
      const text = JSON.stringify({ v: VERSION, key, items, spans }), bytes = new TextEncoder().encode(text);
      const head = 8 + bytes.length + (8 - (8 + bytes.length) % 8) % 8, buffer = new ArrayBuffer(head + at), u8 = new Uint8Array(buffer), view = new DataView(buffer);
      view.setUint32(0, MAGIC, true); view.setUint32(4, bytes.length, true);
      u8.set(bytes, 8);
      arrays.forEach((a, n) => u8.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), head + spans[n][0]));
      return buffer;
    };
    return { add, done, get names() { return Object.keys(items); } };
  };
  /** `values`: `{ name: value }` packed whole. */
  const pack = (values, key = "") => { const p = packer(key); for (const name of Object.keys(values)) p.add(name, values[name]); return p.done(); };
  /** A snapshot's header and where its arrays start, or null when it is not one of this version (and `key`, if given). */
  const open = (buffer, key = null) => {
    try {
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) return null;
      const view = new DataView(buffer);
      if (view.getUint32(0, true) !== MAGIC) return null;
      const length = view.getUint32(4, true);
      if (8 + length > buffer.byteLength) return null;
      const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)));
      if (header.v !== VERSION || key !== null && header.key !== key || !header.items || !Array.isArray(header.spans)) return null;
      return { header, buffer, base: 8 + length + (8 - (8 + length) % 8) % 8 };
    } catch { return null; }
  };
  const unpackGeometry = function* (snap, d, pause) {
    const { buffer, base, header } = snap, count = d.count, [unit, ox, oy, oz] = d.voxel;
    const span = (n, Type, length) => {
      const s = header.spans[n];
      if (!s || s[1] !== length || base + s[0] + length * Type.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error("keep snapshot: bad span");
      return new Type(buffer, base + s[0], length);
    };
    const grid = span(d.grid, Int16Array, count * 12), kind = span(d.kind, Uint16Array, count), flip = span(d.flip, Uint8Array, count);
    const verts = new Array(count * 12), faces = new Array(count);
    for (let n = 0; n < verts.length; n += 3) {
      if (pause && n % 180000 === 0) yield* pause();
      verts[n] = ox + grid[n] * unit; verts[n + 1] = oy + grid[n + 1] * unit; verts[n + 2] = oz + grid[n + 2] * unit;
    }
    // A kind's fields, laid after `i` in their own order, the same object shape for every face of that kind.
    const makers = d.kinds.map((entries) => {
      const keys = entries.map((e) => e[0]), vals = entries.map((e) => e.length > 1 ? e[1] : undefined);
      return (i) => { const f = { i }; for (let k = 0; k < keys.length; k++) f[keys[k]] = vals[k]; return f; };
    });
    for (let n = 0; n < count; n++) {
      if (pause && n % 40000 === 0) yield* pause();
      const b = n * 4, make = makers[kind[n]];
      if (!make) throw new Error("keep snapshot: bad kind");
      faces[n] = make(flip[n] ? [b, b + 3, b + 2, b + 1] : [b, b + 1, b + 2, b + 3]);
    }
    return { verts, faces, lines: [], voxel: new Float32Array(d.voxel), ...d.extra };
  };
  /** One named value out of an opened snapshot, as a generator (`pause`, a generator to yield through, or null). */
  const unpack = function* (snap, name, pause = null) {
    const item = snap.header.items[name];
    if (!item) return null;
    const out = {};
    for (const part of Object.keys(item.parts)) out[part] = yield* unpackGeometry(snap, item.parts[part], pause);
    return item.single ? out[""] : out;
  };

  if (typeof window === "undefined") { BL.keepSnapshot = { VERSION, pack, packer, open, unpack }; return; }

  // ---------- the page ----------
  const params = new URLSearchParams(window.location.search), flag = params.get("keepcache"), debug = params.get("debug") === "1";
  const key = () => BL.deferredScripts && BL.deferredScripts["keep-scene"] || "";
  const off = flag === "0", stored = () => !off && !!key() && (!debug || flag === "1") && !!window.indexedDB;
  const stats = { source: "", restored: 0, built: 0, stored: 0, failures: 0, bytes: 0 };
  let snap = null, settled = true, run = 0, building = false;
  const fresh = new Map();

  const database = () => new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, db) => { if (done) { if (db) db.close(); return; } done = true; clearTimeout(timer); if (error) reject(error); else resolve(db); };
    const timer = setTimeout(() => finish(new Error("keep snapshot: storage timed out")), DB_TIMEOUT);
    const request = window.indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => finish(null, request.result);
    request.onerror = request.onblocked = () => finish(request.error || new Error("keep snapshot: no storage"));
  });
  const read = async () => {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).get(ENTRY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  };
  const write = async (buffer) => {
    const db = await database();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(buffer, ENTRY);
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  };
  const baked = async () => {
    const response = await fetch(BL.keepGeometry.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!response.ok) throw new Error("keep snapshot: no baked file");
    // The staged file is gzipped (scripts/distribution-keep.mjs); a browser without the stream builds instead.
    return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  };
  /** Look for a snapshot for this build; `settled` once the answer is in (keep-models.js `buildSteps` waits on it). */
  const begin = () => {
    const mine = ++run;
    snap = null; fresh.clear(); stats.source = ""; stats.restored = stats.built = 0; building = true;
    if (off) { settled = true; return; }
    settled = false;
    (async () => {
      let found = null, source = "";
      if (BL.keepGeometry && BL.keepGeometry.url) { try { found = open(await baked(), BL.keepGeometry.key); source = "baked"; } catch { stats.failures++; } }
      if (!found && stored()) { try { found = open(await read(), key()); source = "stored"; } catch { stats.failures++; } }
      if (mine !== run) return;
      if (found) { snap = found; stats.source = source; stats.bytes = found.buffer.byteLength; }
      settled = true;
    })();
  };
  /** A builder's steps, answered from the snapshot when it has `name`. */
  const wrap = (name, build) => function* (slice = null) {
    if (snap && snap.header.items[name]) {
      try {
        const value = yield* unpack(snap, name, slice ? function* () { yield* BL.buildTasks.pause(slice); } : null);
        if (value) { stats.restored++; return value; }
      } catch { stats.failures++; }
    }
    const value = yield* build(slice);
    stats.built++;
    if (building) fresh.set(name, value);
    return value;
  };
  /** The build is over: let the snapshot go, and when anything had to be built, store this build's own at idle. */
  const finish = () => {
    const had = snap, built = [...fresh], mine = run;
    snap = null; fresh.clear(); building = false;
    // A snapshot that answered is this build's already; only a page that built everything itself stores one.
    if (!built.length || had || !stored()) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200)), making = packer(key());
    // One builder's geometry an idle period, so the packing never shows as a hitch.
    const next = () => {
      if (mine !== run || building) return;
      try {
        if (built.length) { const [name, value] = built.pop(); making.add(name, value); idle(next, { timeout: 4000 }); return; }
        const buffer = making.done();
        write(buffer).then(() => { stats.stored++; stats.bytes = buffer.byteLength; }, () => { stats.failures++; });
      } catch { stats.failures++; }
    };
    idle(next, { timeout: 4000 });
  };
  BL.keepSnapshot = { VERSION, pack, packer, open, unpack, begin, wrap, finish, stats, get settled() { return settled; }, get active() { return !!snap; } };
})();
