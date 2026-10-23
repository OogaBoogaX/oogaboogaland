// One isolated deterministic build, then transfer owned buffers and stop. This worker never receives code or URLs.
(() => {
  "use strict";
  const buffersOf = root => {
    const pending = [root], seen = new Set(), buffers = new Set();
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === "function") throw new Error("Terrain snapshot contains a function");
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
      else if (value instanceof ArrayBuffer) buffers.add(value);
      else for (const key of Object.keys(value)) pending.push(value[key]);
    }
    return [...buffers];
  };
  self.onmessage = event => {
    const { key, options } = event.data || {};
    try {
      if (typeof key !== "string" || key.length > 512 || !Number.isSafeInteger(options?.seed) || options.seed < 0 || options.seed > 0xffffffff) throw new Error("Invalid terrain request");
      const roof = options.roofHole;
      if (roof && (!/^c(?:11|10|9|730|1|2|3|5)$/.test(roof.id) || ![roof.x, roof.z, roof.radius].every(Number.isFinite)
        || Math.abs(roof.x) > 100 || Math.abs(roof.z) > 100 || roof.radius <= 0 || roof.radius > 16)) throw new Error("Invalid terrain roof");
      const steps = window.BL.terrain.islandSnapshotSteps(options, null);
      let result;
      do { result = window.BL.models.withScope("terrain-worker", () => steps.next()); } while (!result.done);
      const snapshot = result.value, buffers = buffersOf(snapshot), bytes = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      self.postMessage({ type: "ready", key, snapshot, bytes }, buffers);
    } catch {
      self.postMessage({ type: "error", key });
    } finally {
      self.close();
    }
  };
})();
