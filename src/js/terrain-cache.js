// On where `npm run site` packaged the Worker and the director's `TERRAIN_CACHE` (the hub's keep rule) allows. A boot
// restores the island from IndexedDB when this build stored it; a miss builds it on the main thread as usual and, once
// the page is ready, `fill` has a same-origin Worker build the same snapshot and store it itself, so the ~28 MB never
// crosses to this thread. The cache is read only at boot, bounded to two snapshots of this build, and skipped when
// storage is missing or throws. The Worker loads this file too, for `write`.
(() => {
  "use strict";
  const BL = window.BL;
  const DB = "ooga-terrain-v1", STORE = "snapshots", LIMIT = 2, DB_TIMEOUT = 1500, FILL_TIMEOUT = 30000;
  // `credit` is what the boot-quality probe adds for a restored island: the build CPU the Worker measured when it
  // stored the snapshot, less the restore's own, so a cached boot is judged on the same work as a direct one.
  const stats = { attempts: 0, hits: 0, misses: 0, workers: 0, stored: 0, failures: 0, cacheFailures: 0, lastSource: "", credit: 0 };
  let pending = null;
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
  // Rejects when storage is missing, blocked or fails; callers decide what a failure means.
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
    } finally { db?.close(); }
  };
  const read = key => storage("readonly", (store, set) => {
    const request = store.get(key); request.onsuccess = () => set(request.result || null);
  });
  const remove = key => storage("readwrite", store => store.delete(key)).catch(() => { stats.cacheFailures++; });
  const write = (key, build, cpu, snapshot) => storage("readwrite", store => {
    store.put({ key, build, cpu, used: Date.now(), snapshot });
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
    const worker = new Worker(url), timer = setTimeout(() => finish(new Error("Terrain build timed out")), FILL_TIMEOUT);
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
      if (message.type !== "stored") { finish(new Error("Terrain worker failed")); return; }
      finish(null, true);
    };
    worker.onerror = event => { event.preventDefault(); finish(new Error("Terrain worker unavailable")); };
    worker.onmessageerror = () => finish(new Error("Terrain worker unavailable"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    else { try { worker.postMessage({ key, build: descriptor.build, options }); } catch (error) { finish(error); } }
  });
  // Boot only. True when the island is in place; false sends the caller to the ordinary build, after which a miss
  // leaves `fill` its job.
  const prepare = async (options, scope, signal = null) => {
    const descriptor = BL.terrainWorker;
    stats.credit = 0; pending = null;
    if (!descriptor || !/^[0-9a-f]{64}$/.test(descriptor.build) || typeof Worker !== "function") return false;
    stats.attempts++;
    try {
      aborted(signal); options = normalize(options);
      if (BL.terrain.hasIsland(options)) {
        BL.buildTasks.measure(() => BL.models.withScope(scope, () => BL.terrain.island(options))); stats.lastSource = "memory"; return true;
      }
      const key = `${descriptor.build}:${JSON.stringify(options)}`;
      let cached;
      try { cached = await read(key); } catch { stats.cacheFailures++; stats.lastSource = "unavailable"; return false; }
      aborted(signal);
      if (cached?.build === descriptor.build && Number.isFinite(cached.cpu) && cached.cpu > 0 && cached.cpu < 60000) {
        const cpu = BL.buildTasks.cpu;
        try {
          BL.buildTasks.measure(() => BL.models.withScope(scope, () => BL.terrain.restoreIslandSnapshot(cached.snapshot, options)));
          stats.credit = Math.max(0, cached.cpu - (BL.buildTasks.cpu - cpu));
          stats.hits++; stats.lastSource = "indexeddb"; return true;
        } catch { await remove(key); }
      } else if (cached) await remove(key);
      stats.misses++; stats.lastSource = "miss"; pending = { descriptor, key, options };
      return false;
    } catch (error) {
      if (signal?.aborted) throw error;
      stats.failures++; stats.lastSource = "fallback"; return false;
    }
  };
  // After a boot miss, once: the Worker builds and stores the snapshot. Null when there is nothing to fill.
  const fill = (signal = null) => {
    if (!pending) return null;
    const { descriptor, key, options } = pending;
    pending = null;
    return construct(descriptor, key, options, signal).then(() => { stats.stored++; stats.lastSource = "stored"; }, error => {
      if (!signal?.aborted) stats.failures++;
      throw error;
    });
  };
  BL.terrainCache = { prepare, fill, normalize, write, stats };
})();
