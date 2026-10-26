// Default-off experiment: same-origin deterministic construction in a worker, with native structured-clone storage.
// The cache is bounded to two snapshots of this build. A failed/unavailable cache or worker falls back to ordinary terrain.
(() => {
  "use strict";
  const BL = window.BL;
  const DB = "ooga-terrain-v1", STORE = "snapshots", LIMIT = 2, DB_TIMEOUT = 1500, BUILD_TIMEOUT = 10000;
  const stats = { attempts: 0, hits: 0, misses: 0, workers: 0, failures: 0, cacheFailures: 0, lastSource: "", transferredBytes: 0 };
  const aborted = signal => { if (signal?.aborted) throw signal.reason || new DOMException("Terrain cancelled", "AbortError"); };
  const normalize = ({ seed = 1, roofHole = null } = {}) => {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Invalid terrain seed");
    if (!roofHole) return { seed, roofHole: null };
    const { id, x, z, radius } = roofHole;
    if (!/^c(?:11|10|9|730|1|2|3|5)$/.test(id) || ![x, z, radius].every(Number.isFinite)
      || Math.abs(x) > 100 || Math.abs(z) > 100 || radius <= 0 || radius > 16) throw new Error("Invalid terrain roof");
    return { seed, roofHole: { id, x, z, radius } };
  };
  const open = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("No terrain storage")); return; }
    let settled = false;
    const finish = (error, db) => {
      if (settled) { db?.close(); return; }
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(db);
    };
    const timer = setTimeout(() => finish(new Error("Terrain storage timed out")), DB_TIMEOUT);
    let request;
    try { request = window.indexedDB.open(DB, 1); } catch (error) { finish(error); return; }
    request.onupgradeneeded = () => {
      try {
        const store = request.result.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("used", "used");
      } catch (error) { try { request.transaction.abort(); } catch {} finish(error); }
    };
    request.onsuccess = () => finish(null, request.result);
    request.onerror = request.onblocked = () => finish(new Error("Terrain storage unavailable"));
  });
  const storage = async (mode, action) => {
    let db;
    try {
      db = await open();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode), store = transaction.objectStore(STORE);
        let result = null, finished = false;
        const finish = error => {
          if (finished) return;
          finished = true; clearTimeout(timer);
          if (error) reject(error); else resolve(result);
        };
        const timer = setTimeout(() => { try { transaction.abort(); } catch {} finish(new Error("Terrain transaction timed out")); }, DB_TIMEOUT);
        transaction.oncomplete = () => finish(null);
        transaction.onerror = transaction.onabort = () => finish(new Error("Terrain transaction unavailable"));
        try { action(store, value => { result = value; }); } catch (error) { try { transaction.abort(); } catch {} finish(error); }
      });
    } catch { stats.cacheFailures++; return null; }
    finally { db?.close(); }
  };
  const read = key => storage("readonly", (store, set) => {
    const request = store.get(key); request.onsuccess = () => set(request.result || null);
  });
  const remove = key => storage("readwrite", store => store.delete(key));
  const write = (key, build, snapshot) => storage("readwrite", store => {
    store.put({ key, build, used: Date.now(), snapshot });
    let kept = 0;
    // An index key cursor reads no snapshot bodies while dropping old builds and excess variants.
    const request = store.index("used").openKeyCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result; if (!cursor) return;
      const current = String(cursor.primaryKey);
      if (!current.startsWith(`${build}:`) || ++kept > LIMIT) store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
  const construct = (descriptor, key, options, signal) => new Promise((resolve, reject) => {
    aborted(signal);
    const url = new URL(descriptor.url, location.origin);
    if (url.origin !== location.origin || !/^\/js\/terrain-worker-[0-9a-f]{16}\.js$/.test(url.pathname) || url.search || url.hash) throw new Error("Invalid terrain worker");
    const worker = new Worker(url), timer = setTimeout(() => finish(new Error("Terrain build timed out")), BUILD_TIMEOUT);
    stats.workers++;
    let finished = false;
    const onAbort = () => finish(signal.reason || new DOMException("Terrain cancelled", "AbortError"));
    const finish = (error, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    worker.onmessage = event => {
      const message = event.data;
      if (message?.key !== key) return;
      if (message.type !== "ready") { finish(new Error("Terrain worker failed")); return; }
      stats.transferredBytes = message.bytes;
      finish(null, message.snapshot);
    };
    worker.onerror = event => { event.preventDefault(); finish(new Error("Terrain worker unavailable")); };
    worker.onmessageerror = () => finish(new Error("Terrain worker unavailable"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else { try { worker.postMessage({ key, options }); } catch (error) { finish(error); } }
  });
  const prepare = async (options, scope, signal = null) => {
    const descriptor = BL.terrainWorker;
    if (!descriptor || !/^[0-9a-f]{64}$/.test(descriptor.build) || typeof Worker !== "function") return false;
    stats.attempts++;
    try {
      aborted(signal); options = normalize(options);
      if (BL.terrain.hasIsland(options)) {
        BL.buildTasks.measure(() => BL.models.withScope(scope, () => BL.terrain.island(options))); stats.lastSource = "memory"; return true;
      }
      const key = `${descriptor.build}:${JSON.stringify(options)}`, cached = await read(key);
      aborted(signal);
      if (cached?.build === descriptor.build) {
        try {
          BL.buildTasks.measure(() => BL.models.withScope(scope, () => BL.terrain.restoreIslandSnapshot(cached.snapshot, options)));
          stats.hits++; stats.lastSource = "indexeddb"; return true;
        } catch { await remove(key); }
      }
      stats.misses++;
      const snapshot = await construct(descriptor, key, options, signal);
      aborted(signal);
      BL.buildTasks.measure(() => BL.models.withScope(scope, () => BL.terrain.restoreIslandSnapshot(snapshot, options)));
      await write(key, descriptor.build, snapshot);
      aborted(signal); stats.lastSource = "worker"; return true;
    } catch (error) {
      if (signal?.aborted) throw error;
      stats.failures++; stats.lastSource = "fallback"; return false;
    }
  };
  BL.terrainCache = { prepare, normalize, stats };
})();
