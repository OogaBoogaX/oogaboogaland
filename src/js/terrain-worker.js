// One isolated deterministic build, stored in IndexedDB from here (terrain-cache.js's `write`), then stop. The page
// gets a few bytes back, never the snapshot. This worker never receives code or URLs.
(() => {
  "use strict";
  self.onmessage = async event => {
    const { key, build, options } = event.data || {};
    try {
      if (typeof key !== "string" || typeof build !== "string" || !/^[0-9a-f]{64}$/.test(build) || key !== `${build}:${JSON.stringify(options)}`
        || !Number.isSafeInteger(options?.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error("Invalid terrain request");
      const roof = options.roofHole;
      if (roof && (!/^c(?:11|10|9|730|1|2|3|5)$/.test(roof.id) || ![roof.x, roof.z, roof.radius].every(Number.isFinite)
        || Math.abs(roof.x) > 100 || Math.abs(roof.z) > 100 || roof.radius <= 0 || roof.radius > 16)) throw new Error("Invalid terrain roof");
      const nook = options.nook;
      if (nook && (![nook.x, nook.z, nook.ry, nook.floor, nook.width, nook.depth, nook.height, nook.entry || 0].every(Number.isFinite)
        || Math.abs(nook.x) > 100 || Math.abs(nook.z) > 100 || Math.abs(nook.floor) > 12
        || !(nook.width > 0 && nook.width <= 8) || !(nook.depth > 0 && nook.depth <= 8) || !(nook.height > 0 && nook.height <= 8)
        || (nook.entry || 0) < 0 || (nook.entry || 0) > 4)) throw new Error("Invalid terrain nook");
      // The build's own CPU on this device, stored beside the snapshot for the boot-quality probe of a later restore.
      const start = performance.now(), steps = window.BL.terrain.islandSnapshotSteps(options, null);
      let result;
      do { result = window.BL.models.withScope("terrain-worker", () => steps.next()); } while (!result.done);
      const cpu = performance.now() - start;
      await window.BL.terrainCache.write(key, build, cpu, result.value);
      self.postMessage({ type: "stored", key, cpu });
    } catch {
      self.postMessage({ type: "error", key });
    } finally {
      self.close();
    }
  };
})();
