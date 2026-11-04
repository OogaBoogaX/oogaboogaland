// Sleep beam: the brief green code cap a stuck gorilla leaves by and arrives in at its reserved bed.
// Short vertical streams of the mirror cave's own glyphs (`hubModels.matrixGlyph`, its eight historical
// shapes and #18dc4a / #46ff70 palette) stand on an ellipse fitted to the gorilla's posed body, starting just
// above its top. A bright head sweeps up the streams on departure and down onto the body on arrival, the trail
// behind it filling the short column and then shrinking away after it.
//
// `create({ root, capacity })` -> { show, hide, clear, liveGeometry, dispose, still }. One slot per reserved bed.
// The caller owns the timing: `show(slot, x, y, z, heading, progress, incoming, body)` draws `progress` (0..1) of
// one beam over the rig root `body` standing at (x, y, z) facing `heading`, every frame it runs; `hide` ends it.
// The footprint and the column's base are measured from `body`'s visible posed parts each call, so a standing
// departure and a lying arrival each get a cap of their own shape; without `body` a nominal standing gorilla is
// assumed. Nothing here moves actors, physics, the camera or sound; measuring only refreshes the rig's local
// matrices from its own pose, as the renderer does. `still` is true under prefers-reduced-motion (read live),
// when nothing is drawn and callers keep their actors' looks unchanged too.
//
// One fixed-capacity instanced batch per glyph variant, shared by every slot: a slot's glyphs are a contiguous
// region of each batch, active slots packed at the front, so the draw is a prefix and hide swaps the last
// region in. Each batch draws a shallow copy of the shared glyph geometry (same arrays, never written) so its
// GPU record is its own. Nodes are sightHidden, never input targets or solids.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAX_CAPACITY = 20, VARIANTS = 8, FLOATS = 20;
  // Streams about the body, glyph rows per stream, row pitch and glyph scale (a glyph is .079 x .121 m about
  // its centre). The column is ROWS * PITCH (about 0.7 m) tall.
  const STREAMS = 12, ROWS = 4, PITCH = 0.17, SCALE = 1.55;
  // Clear air between the body's top and the lowest glyph's bottom edge.
  const GAP = 0.05, BASE = GAP + 0.06 * SCALE;
  // Ellipse radii as fractions of the body's half-extents (glyphs face outward, so a little inside the outline
  // keeps their edges over the body), odd streams on an inner ring, and the smallest radius allowed.
  const FIT = 0.8, INNER = 0.45, MIN_RADIUS = 0.12;
  // Trail length and the latest stream start, as fractions of the column and of progress. A trail as long as the
  // column keeps the lit glyphs on the body through mid-beam: the cap fills from the head end, then drains away.
  const TRAIL = 1, LAG = 0.22, DRIFT = PITCH * 0.4, STEP = 1 / ROWS;
  const PER_SLOT = STREAMS * ROWS;
  // A standing gorilla's posed bounds in its own heading frame (x across, z forward, y up from its feet).
  const NOMINAL = { minX: -0.45, maxX: 0.45, minZ: -0.5, maxZ: 0.5, top: 1.25 };
  const DEPTH = 12;
  const create = ({ root, capacity }) => {
    if (!root || !Array.isArray(root.children)) throw new Error("sleepBeam needs a scene root");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) throw new Error(`sleepBeam capacity must be 1..${MAX_CAPACITY}`);
    const { createNode, addChild, removeChild, updateLocal } = BL.scene;
    const { mat4 } = BL.math;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rand = BL.math.mulberry32(0x5eeb);
    const cosA = new Float32Array(STREAMS), sinA = new Float32Array(STREAMS), ring = new Float32Array(STREAMS), lag = new Float32Array(STREAMS);
    for (let i = 0; i < STREAMS; i++) {
      const angle = (i + 0.5) / STREAMS * Math.PI * 2 + (rand() - 0.5) * 0.14;
      cosA[i] = Math.cos(angle); sinA[i] = Math.sin(angle);
      ring[i] = i & 1 ? INNER : 1;
      lag[i] = rand() * LAG;
    }
    const glyphVariant = new Uint8Array(PER_SLOT), glyphIndex = new Uint16Array(PER_SLOT), perVariant = new Uint16Array(VARIANTS);
    for (let g = 0; g < PER_SLOT; g++) {
      const v = Math.floor(rand() * VARIANTS);
      glyphVariant[g] = v; glyphIndex[g] = perVariant[v]++;
    }
    const geometries = new Array(VARIANTS).fill(null), batches = new Array(VARIANTS).fill(null);
    for (let v = 0; v < VARIANTS; v++) {
      if (!perVariant[v]) continue;
      geometries[v] = { ...BL.hubModels.matrixGlyph(v) };
      batches[v] = createNode({ geometry: geometries[v], instanceData: new Float32Array(capacity * perVariant[v] * FLOATS), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true, visible: false });
      addChild(root, batches[v]);
    }
    // slotAt[position] is the slot drawn in region `position`; positionOf[slot] is -1 while it is hidden.
    const slotAt = new Int8Array(capacity), positionOf = new Int8Array(capacity).fill(-1);
    let active = 0, disposed = false;
    // The body's posed bounds, measured into the heading frame about (x, y, z).
    const fit = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: 0 };
    const stack = Array.from({ length: DEPTH }, () => mat4.create());
    let ox = 0, oy = 0, oz = 0, fc = 1, fs = 0;
    const measureNode = (node, parent, depth) => {
      if (!node.visible || node.sightHidden || depth >= DEPTH) return;
      updateLocal(node);
      const m = stack[depth];
      if (parent) mat4.multiply(m, parent, node.local); else m.set(node.local);
      // Every vertex, not the box corners: the pitched torso and arms would lift a corner's empty air well over
      // the real voxels. Ten-odd frames per beam over a few thousand vertices.
      const verts = node.geometry && node.geometry.verts;
      if (verts && verts.length) {
        for (let i = 0; i < verts.length; i += 3) {
          const lx = verts[i], ly = verts[i + 1], lz = verts[i + 2];
          const dx = m[0] * lx + m[4] * ly + m[8] * lz + m[12] - ox;
          const dy = m[1] * lx + m[5] * ly + m[9] * lz + m[13] - oy;
          const dz = m[2] * lx + m[6] * ly + m[10] * lz + m[14] - oz;
          const across = dx * fc - dz * fs, along = dx * fs + dz * fc;
          if (across < fit.minX) fit.minX = across;
          if (across > fit.maxX) fit.maxX = across;
          if (along < fit.minZ) fit.minZ = along;
          if (along > fit.maxZ) fit.maxZ = along;
          if (dy > fit.top) fit.top = dy;
        }
      }
      for (let i = 0; i < node.children.length; i++) measureNode(node.children[i], m, depth + 1);
    };
    const measure = (body, x, y, z, ch, sh) => {
      fit.minX = fit.minZ = fit.top = Infinity;
      fit.maxX = fit.maxZ = -Infinity;
      if (body && Array.isArray(body.children)) {
        ox = x; oy = y; oz = z; fc = ch; fs = sh;
        fit.top = -Infinity;
        measureNode(body, null, 0);
      }
      if (!(fit.maxX > fit.minX && fit.maxZ > fit.minZ && Number.isFinite(fit.top))) Object.assign(fit, NOMINAL);
      return fit;
    };
    const publish = () => {
      for (let v = 0; v < VARIANTS; v++) {
        const batch = batches[v];
        if (!batch) continue;
        batch.instanceCount = active * perVariant[v];
        batch.instanceVersion++;
        batch.visible = active > 0;
      }
    };
    const checkSlot = (slot) => {
      if (disposed) throw new Error("sleepBeam used after dispose");
      if (!Number.isInteger(slot) || slot < 0 || slot >= capacity) throw new Error(`sleepBeam slot ${slot} outside 0..${capacity - 1}`);
    };
    const hide = (slot) => {
      checkSlot(slot);
      const at = positionOf[slot];
      if (at < 0) return;
      const last = active - 1;
      if (at !== last) {
        for (let v = 0; v < VARIANTS; v++) {
          if (!batches[v]) continue;
          const size = perVariant[v] * FLOATS;
          batches[v].instanceData.copyWithin(at * size, last * size, last * size + size);
        }
        slotAt[at] = slotAt[last];
        positionOf[slotAt[at]] = at;
      }
      positionOf[slot] = -1;
      active = last;
      publish();
    };
    const show = (slot, x, y, z, heading, progress, incoming, body = null) => {
      checkSlot(slot);
      const p = progress > 0 ? progress < 1 ? progress : 1 : 0;
      // Nothing is lit at either end of a beam.
      if (reduced.matches || !(p > 0 && p < 1)) { hide(slot); return; }
      let at = positionOf[slot];
      if (at < 0) { at = active++; slotAt[at] = slot; positionOf[slot] = at; }
      const ch = Math.cos(heading), sh = Math.sin(heading), rise = incoming ? -1 : 1;
      const b = measure(body, x, y, z, ch, sh);
      const cx = (b.minX + b.maxX) * 0.5, cz = (b.minZ + b.maxZ) * 0.5;
      const rx = Math.max(MIN_RADIUS, (b.maxX - b.minX) * 0.5 * FIT), rz = Math.max(MIN_RADIUS, (b.maxZ - b.minZ) * 0.5 * FIT);
      const base = y + b.top + BASE;
      for (let g = 0; g < PER_SLOT; g++) {
        const stream = g % STREAMS, row = (g - stream) / STREAMS, v = glyphVariant[g];
        const data = batches[v].instanceData, o = (at * perVariant[v] + glyphIndex[g]) * FLOATS;
        const travel = Math.min(1, Math.max(0, (p - lag[stream]) / (1 - LAG)));
        const height = (row + 0.5) * STEP, along = incoming ? 1 - height : height;
        // Distance behind the head, in column fractions: 0 at the head, TRAIL at the tail.
        const behind = travel * (1 + TRAIL) - along;
        if (!(behind >= 0 && behind < TRAIL)) {
          for (let i = 0; i < FLOATS; i++) data[o + i] = 0;
          data[o + 19] = 1; // A zero normal also culls the empty instance on Canvas 2D.
          continue;
        }
        const fade = behind / TRAIL, size = SCALE * (fade < 0.55 ? 1 : (1 - fade) / 0.45);
        // Outward from the body, turned by its heading; the glyph's x runs along the ellipse.
        const outX = sinA[stream] * ch + cosA[stream] * sh, outZ = cosA[stream] * ch - sinA[stream] * sh;
        const lx = cx + sinA[stream] * rx * ring[stream], lz = cz + cosA[stream] * rz * ring[stream];
        data[o] = outZ * size; data[o + 1] = 0; data[o + 2] = -outX * size; data[o + 3] = 0;
        data[o + 4] = 0; data[o + 5] = size; data[o + 6] = 0; data[o + 7] = 0;
        data[o + 8] = outX * size; data[o + 9] = 0; data[o + 10] = outZ * size; data[o + 11] = 0;
        data[o + 12] = x + lx * ch + lz * sh;
        data[o + 13] = base + row * PITCH + rise * DRIFT * travel;
        data[o + 14] = z - lx * sh + lz * ch;
        data[o + 15] = 1;
        data[o + 16] = 1 - fade * 0.6;
        data[o + 17] = 0;
        data[o + 18] = Math.max(0, 1 - behind / (STEP * 1.25)) * 0.9;
        // Only the half of the ring facing the camera draws, so the far streams never show through the body.
        data[o + 19] = 1;
      }
      publish();
    };
    const clear = () => {
      if (disposed) return;
      for (let at = 0; at < active; at++) positionOf[slotAt[at]] = -1;
      active = 0;
      publish();
    };
    const liveGeometry = (set) => {
      if (disposed) return set;
      for (let v = 0; v < VARIANTS; v++) if (geometries[v]) set.add(geometries[v]);
      return set;
    };
    const dispose = () => {
      if (disposed) return;
      clear();
      for (let v = 0; v < VARIANTS; v++) {
        const batch = batches[v];
        if (!batch) continue;
        if (batch.parent) removeChild(batch.parent, batch);
        batches[v] = geometries[v] = null;
      }
      disposed = true;
    };
    return { show, hide, clear, liveGeometry, dispose, get still() { return reduced.matches; } };
  };
  BL.sleepBeam = { create, MAX_CAPACITY };
})();
