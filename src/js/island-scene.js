// The island view's baked scenery (docs/ooga-chat-hosts.md, "The island view"): Main Island as a chat's copy of it
// shows it (scripts/island-scene.mjs bakes it from the built hub in copy mode: the ground, the banana pile, trees,
// paths, props, the lawn, HQ's open ramps and the sealed mouths; no other island, bridge, Oogatron, mirror, sign over a
// sealed mouth, bird, boat or Ooga, nothing buried), in LAYERS, each a gzipped file Ooga Chat serves as lazy art. Each
// layer holds the island's own models, each once, as the hub built them (its faces and colours, its explicit normals,
// smooth shading, block detail, shadow casting and the wind's sway and swing), and every place one stands, so the
// renderer draws them as the hub does, a model's copies one instanced draw; and what the view brings to life over them
// (`meta`): the lamps and the fires the hub lights by its clock, and the clouds the copy deals for its seats. A
// viewer's tier (TIERS) says which layers it fetches: `base` the ground, the pile and the sky's clouds alone, `lite` with
// the props, the lawn and the trees at their medium detail, `full` with the trees whole and every small detail.
// `tierFor(mbps, memory)` picks it from the speed the base layer came at and the device's memory.
// The format, little-endian, each block padded to 4 bytes: "OBLS", version, model count, place count; each model:
// flags (1 smooth, 2 normals, 4 block detail, 8 casts no shadow, 16 its faces are road, 32 drawn over its backing),
// emissive value count, vertices, faces, corners, its
// bounds (6 x f32), its block detail (4 x f32), its sway and swing (2 x f32), the emissive values (f32), positions (u16
// within the bounds), normals (3 x i8), each face's corner count (u8), the corners (u16, or u32 past 65535 vertices),
// each face's colour (3 x u8) and each face's emissive code (u8, 0 for none); then each place: its model (u32) and its
// 3 x 4 matrix (f32, columns); last the meta's length (u32) and the meta, JSON (island-view-live.js reads it):
// `lamps` ([place or -1, mode (0 the dusk ramp, 1 always, 2 lanterns' night), glow, order, light (0 or 1), x, y, z,
// reach, r, g, b, index, pile post (0 or 1), central (0 or 1), fire (0 or 1)] each, the hub's `addLamp`), `glows`
// ([place, glow]: a place's own glow, where it is not 1), `fires` ([x, y, z] each, a pit's flame) and `clouds` (the
// copy's deal, scene-hub.js `layoutClouds`).
// `encode(meshes, places, meta)` writes it (the bake), `decode(buffer)` reads it back as `{ meshes, places, meta }`,
// `geometry(mesh)` makes one an immutable compact mesh (compact-geometry.js `fromColumns`), `node(place, geometry)`
// stands it, and `load(dir, tier, signal)` fetches a tier's layers, the base first, resolving to `{ tier, layers, mbps }`.
// Reads nothing at load but window.BL.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAGIC = 0x534c424f, VERSION = 3, Q = 65535;
  const LAYERS = ["base", "sky", "props", "grass", "trees-medium", "trees", "details"];
  const TIERS = { base: ["base", "sky"], lite: ["base", "sky", "props", "grass", "trees-medium"], full: ["base", "sky", "props", "grass", "trees", "details"] };
  // The base layer's speed (megabits a second) and the device's memory (GiB; unknown counts as enough) each tier needs.
  const FULL_MBPS = 8, LITE_MBPS = 2, FULL_MEMORY = 8, LITE_MEMORY = 4;
  const tierFor = (mbps, memory = 8, saveData = false) => saveData || !(mbps >= LITE_MBPS) || memory < LITE_MEMORY ? "base"
    : mbps >= FULL_MBPS && memory >= FULL_MEMORY ? "full" : "lite";
  const pad = (n) => (n + 3) & ~3;
  const SMOOTH = 1, NORMALS = 2, VOXEL = 4, NO_SHADOW = 8, ROAD = 16, OVERLAY = 32;

  // `meshes`: `{ smooth, castShadow, voxel (4 numbers) | null, sway, swing, road, depthOffset, positions (local, 3 a vertex), normals | null,
  // corners, indices, colors (3 a face), emissive (a face's value, 0 for none) }`; `places`: `{ mesh, matrix (16,
  // column-major) }`; `meta`: a plain object, or null.
  const encode = (meshes, places, meta = null) => {
    const plans = meshes.map((m) => {
      const values = [...new Set(m.emissive.filter((e) => e > 0).map((e) => Math.round(e * 100) / 100))].slice(0, 255);
      const verts = m.positions.length / 3, faces = m.corners.length, corners = m.indices.length, wide = verts > 65535;
      const bytes = 20 + 24 + 16 + 8 + values.length * 4 + pad(verts * 6) + (m.normals ? pad(verts * 3) : 0) + pad(faces) + pad(corners * (wide ? 4 : 2)) + pad(faces * 3) + pad(faces);
      return { m, values, verts, faces, corners, wide, bytes };
    });
    const extra = meta ? new TextEncoder().encode(JSON.stringify(meta)) : new Uint8Array(0);
    const total = 16 + plans.reduce((n, p) => n + p.bytes, 0) + places.length * 52 + 4 + pad(extra.length), buffer = new ArrayBuffer(total), view = new DataView(buffer);
    view.setUint32(0, MAGIC, true); view.setUint16(4, VERSION, true);
    view.setUint32(8, plans.length, true); view.setUint32(12, places.length, true);
    let at = 16;
    for (const { m, values, verts, faces, corners, wide } of plans) {
      view.setUint8(at, (m.smooth ? SMOOTH : 0) | (m.normals ? NORMALS : 0) | (m.voxel ? VOXEL : 0) | (m.castShadow === false ? NO_SHADOW : 0) | (m.road ? ROAD : 0) | (m.depthOffset ? OVERLAY : 0));
      view.setUint8(at + 1, values.length);
      view.setUint32(at + 4, verts, true); view.setUint32(at + 8, faces, true); view.setUint32(at + 12, corners, true);
      at += 20;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < m.positions.length; i++) { lo[i % 3] = Math.min(lo[i % 3], m.positions[i]); hi[i % 3] = Math.max(hi[i % 3], m.positions[i]); }
      for (let k = 0; k < 3; k++) { view.setFloat32(at + k * 4, lo[k], true); view.setFloat32(at + 12 + k * 4, hi[k], true); }
      at += 24;
      for (let k = 0; k < 4; k++) view.setFloat32(at + k * 4, m.voxel ? m.voxel[k] : 0, true);
      at += 16;
      view.setFloat32(at, m.sway || 0, true); view.setFloat32(at + 4, m.swing || 0, true);
      at += 8;
      for (const v of values) { view.setFloat32(at, v, true); at += 4; }
      for (let i = 0; i < verts * 3; i++) {
        const k = i % 3, span = hi[k] - lo[k];
        view.setUint16(at + i * 2, span > 0 ? Math.round((m.positions[i] - lo[k]) / span * Q) : 0, true);
      }
      at += pad(verts * 6);
      if (m.normals) {
        for (let i = 0; i < verts * 3; i++) view.setInt8(at + i, Math.max(-127, Math.min(127, Math.round(m.normals[i] * 127))));
        at += pad(verts * 3);
      }
      for (let f = 0; f < faces; f++) view.setUint8(at + f, m.corners[f]);
      at += pad(faces);
      for (let c = 0; c < corners; c++) wide ? view.setUint32(at + c * 4, m.indices[c], true) : view.setUint16(at + c * 2, m.indices[c], true);
      at += pad(corners * (wide ? 4 : 2));
      for (let k = 0; k < faces * 3; k++) view.setUint8(at + k, m.colors[k]);
      at += pad(faces * 3);
      for (let f = 0; f < faces; f++) { const e = Math.round(m.emissive[f] * 100) / 100; view.setUint8(at + f, e > 0 ? values.indexOf(e) + 1 : 0); }
      at += pad(faces);
    }
    for (const p of places) {
      view.setUint32(at, p.mesh, true);
      at += 4;
      const m = p.matrix;
      for (const [k, i] of [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].entries()) view.setFloat32(at + k * 4, m[i], true);
      at += 48;
    }
    view.setUint32(at, extra.length, true);
    new Uint8Array(buffer, at + 4, extra.length).set(extra);
    return buffer;
  };

  // A layer's models, places and meta, checked as they are read: a file that is not one throws.
  const decode = (buffer) => {
    const view = new DataView(buffer), meshes = [], places = [];
    if (buffer.byteLength < 16 || view.getUint32(0, true) !== MAGIC || view.getUint16(4, true) !== VERSION) throw new Error("island-scene: not a scenery file");
    const count = view.getUint32(8, true), placeCount = view.getUint32(12, true);
    let at = 16;
    const need = (n) => { if (at + n > buffer.byteLength) throw new Error("island-scene: the file is cut short"); };
    for (let k = 0; k < count; k++) {
      need(68);
      const flags = view.getUint8(at), valueCount = view.getUint8(at + 1);
      const verts = view.getUint32(at + 4, true), faces = view.getUint32(at + 8, true), corners = view.getUint32(at + 12, true);
      at += 20;
      const lo = [0, 1, 2].map((i) => view.getFloat32(at + i * 4, true)), hi = [0, 1, 2].map((i) => view.getFloat32(at + 12 + i * 4, true));
      at += 24;
      const voxel = flags & VOXEL ? new Float32Array([0, 1, 2, 3].map((i) => view.getFloat32(at + i * 4, true))) : null;
      at += 16;
      const sway = view.getFloat32(at, true), swing = view.getFloat32(at + 4, true);
      if (!Number.isFinite(sway) || !Number.isFinite(swing)) throw new Error("island-scene: a model's wind is not a number");
      at += 8;
      need(valueCount * 4);
      const values = [];
      for (let i = 0; i < valueCount; i++) values.push(view.getFloat32(at + i * 4, true));
      at += valueCount * 4;
      need(pad(verts * 6));
      const raw = new Uint16Array(buffer, at, verts * 3), positions = new Float32Array(verts * 3);
      for (let i = 0; i < positions.length; i++) { const c = i % 3; positions[i] = lo[c] + raw[i] / Q * (hi[c] - lo[c]); }
      at += pad(verts * 6);
      let normals = null;
      if (flags & NORMALS) {
        need(pad(verts * 3));
        const n = new Int8Array(buffer, at, verts * 3);
        normals = new Float32Array(verts * 3);
        for (let i = 0; i < normals.length; i++) normals[i] = n[i] / 127;
        at += pad(verts * 3);
      }
      need(pad(faces));
      const sizes = new Uint8Array(buffer, at, faces), offsets = new Uint32Array(faces + 1);
      for (let f = 0; f < faces; f++) offsets[f + 1] = offsets[f] + sizes[f];
      if (offsets[faces] !== corners) throw new Error("island-scene: the corners do not add up");
      at += pad(faces);
      const wide = verts > 65535;
      need(pad(corners * (wide ? 4 : 2)));
      const indices = wide ? new Uint32Array(buffer.slice(at, at + corners * 4)) : Uint32Array.from(new Uint16Array(buffer, at, corners));
      for (let c = 0; c < corners; c++) if (indices[c] >= verts) throw new Error("island-scene: a corner past the vertices");
      at += pad(corners * (wide ? 4 : 2));
      need(pad(faces * 3));
      const colors = new Uint8Array(buffer.slice(at, at + faces * 3));
      at += pad(faces * 3);
      need(pad(faces));
      const codes = new Uint8Array(buffer.slice(at, at + faces));
      at += pad(faces);
      meshes.push({ smooth: !!(flags & SMOOTH), castShadow: !(flags & NO_SHADOW), voxel, sway, swing, road: !!(flags & ROAD), depthOffset: !!(flags & OVERLAY), positions, normals, offsets, indices, colors, emissive: valueCount ? { codes, values } : null });
    }
    need(placeCount * 52);
    for (let k = 0; k < placeCount; k++) {
      const mesh = view.getUint32(at, true);
      if (mesh >= meshes.length) throw new Error("island-scene: a place past the models");
      const m = new Float32Array(12);
      for (let i = 0; i < 12; i++) m[i] = view.getFloat32(at + 4 + i * 4, true);
      places.push({ mesh, m });
      at += 52;
    }
    need(4);
    const length = view.getUint32(at, true);
    at += 4;
    need(length);
    const meta = length ? JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at, length))) : {};
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("island-scene: the meta is not an object");
    return { meshes, places, meta };
  };

  // One model as a mesh the renderer draws, with the hub's own sidecars (a road's faces marked as the hub's path tiles').
  const geometry = (mesh) => {
    const columns = mesh.emissive ? [{ key: "emissive", codes: mesh.emissive.codes, values: mesh.emissive.values }] : [];
    if (mesh.road) columns.push({ key: "road", codes: new Uint8Array(mesh.colors.length / 3).fill(1), values: [true] });
    const g = BL.compactGeometry.fromColumns({ positions: mesh.positions, offsets: mesh.offsets, indices: mesh.indices, colors: mesh.colors, columns });
    if (!g) throw new Error("island-scene: compact geometry is off");
    if (mesh.smooth) g.smooth = true;
    if (mesh.normals) g.normals = mesh.normals;
    if (mesh.voxel) g.voxel = mesh.voxel;
    if (!mesh.castShadow) g.castShadow = false;
    if (mesh.sway) g.sway = mesh.sway;
    if (mesh.swing) g.swing = mesh.swing;
    if (mesh.depthOffset) g.depthOffset = true;
    return g;
  };
  // One place as a node: its matrix taken apart into a position, a turn (quaternion) and a scale.
  const node = (place, geometry) => {
    const m = place.m;
    const sx = Math.hypot(m[0], m[1], m[2]) || 1, sy = Math.hypot(m[3], m[4], m[5]) || 1, sz = Math.hypot(m[6], m[7], m[8]) || 1;
    const r00 = m[0] / sx, r10 = m[1] / sx, r20 = m[2] / sx, r01 = m[3] / sy, r11 = m[4] / sy, r21 = m[5] / sy, r02 = m[6] / sz, r12 = m[7] / sz, r22 = m[8] / sz;
    const trace = r00 + r11 + r22;
    let x, y, z, w;
    if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; w = s / 4; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s; }
    else if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1 + r00 - r11 - r22) * 2; w = (r21 - r12) / s; x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s; }
    else if (r11 > r22) { const s = Math.sqrt(1 + r11 - r00 - r22) * 2; w = (r02 - r20) / s; x = (r01 + r10) / s; y = s / 4; z = (r12 + r21) / s; }
    else { const s = Math.sqrt(1 + r22 - r00 - r11) * 2; w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = s / 4; }
    return BL.scene.createNode({ geometry, position: { x: m[9], y: m[10], z: m[11] }, quaternion: [x, y, z, w], scale: { x: sx, y: sy, z: sz } });
  };

  // A layer's bytes, gunzipped by the browser (a file served as it was written, compressed).
  const fetchLayer = async (dir, name, signal) => {
    const response = await fetch(`${dir}/island-scene-${name}.bin.gz`, { signal, cache: "force-cache" });
    if (!response.ok || !response.body) throw new Error(`island-scene: ${name} answered ${response.status}`);
    const plain = response.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(plain).arrayBuffer();
  };
  const supported = () => typeof DecompressionStream === "function";
  // The base layer first, timed: its speed and the device's memory settle the tier, unless one is given.
  const load = async (dir, tier = null, signal = undefined) => {
    const start = performance.now(), base = await fetchLayer(dir, "base", signal), seconds = Math.max(0.05, (performance.now() - start) / 1000);
    const resource = performance.getEntriesByName?.(new URL(`${dir}/island-scene-base.bin.gz`, location.href).href).at?.(-1);
    const bytes = resource && resource.encodedBodySize ? resource.encodedBodySize : base.byteLength / 3;
    const mbps = resource && resource.transferSize === 0 ? Infinity : bytes * 8 / seconds / 1e6;
    const connection = navigator.connection;
    const chosen = tier || tierFor(mbps, navigator.deviceMemory || 8, !!(connection && connection.saveData));
    const layers = [decode(base)];
    for (const name of TIERS[chosen].slice(1)) layers.push(decode(await fetchLayer(dir, name, signal)));
    return { tier: chosen, layers, mbps };
  };
  BL.islandScene = { LAYERS, TIERS, tierFor, encode, decode, geometry, node, load, supported };
})();
