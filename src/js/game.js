(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { fnv1a } = BL.math;
  const { HANDLE_MAX, MESSAGE_MAX } = BL.donations;
  const STORAGE_KEY = "oogaboogaland.v1";
  const INVENTORY_MAX = 200;
  const STACK_MAX = 9;
  const LOOT_TIERS = [
    { tier: "legendary", minSats: 100000 },
    { tier: "epic", minSats: 21000 },
    { tier: "rare", minSats: 5000 },
    { tier: "common", minSats: 1000 }
  ];
  const SATS_PER_BANANA = 400;
  const tierFor = (sats) => {
    const found = LOOT_TIERS.find((t) => sats >= t.minSats);
    return found ? found.tier : null;
  };
  // Same donation id always yields the same item
  const lootFor = (donation, catalog) => {
    const tier = tierFor(donation.sats);
    if (!tier) return null;
    const pool = catalog.filter((item) => item.tier === tier);
    if (!pool.length) return null;
    return { tier, item: pool[fnv1a(`${donation.id}/loot`) % pool.length] };
  };
  const bananasFor = (sats) => Math.max(1, Math.min(12, Math.round(sats / SATS_PER_BANANA)));
  const LARGE_UNITS = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  // Big counts as 1.2K, 139K, 2.1M, up to T
  const formatLarge = (n) => {
    const unit = LARGE_UNITS.find(([size]) => n >= size);
    if (!unit) return String(n);
    const v = n / unit[0];
    return `${v < 10 ? (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, "") : Math.floor(v)}${unit[1]}`;
  };
  const isString = (v, max) => typeof v === "string" && v.length <= max;
  const isEntry = (e, catalog) => e && typeof e === "object" && isString(e.id, 40) && catalog.some((c) => c.id === e.itemId) && LOOT_TIERS.some((t) => t.tier === e.tier) && isString(e.donationId, 64) && Number.isFinite(e.at);
  const defaults = () => ({ inventory: [], assignments: {}, handle: "", message: "", handFed: 0, totalSats: 0, donations: 0 });
  const load = (catalog) => {
    const state = defaults();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return state;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.inventory)) state.inventory = parsed.inventory.filter((e) => isEntry(e, catalog)).slice(0, INVENTORY_MAX);
      if (parsed.assignments && typeof parsed.assignments === "object") {
        for (const [name, entryId] of Object.entries(parsed.assignments)) {
          if (isString(name, 40) && state.inventory.some((e) => e.id === entryId)) state.assignments[name] = entryId;
        }
      }
      if (isString(parsed.handle, HANDLE_MAX)) state.handle = parsed.handle;
      if (isString(parsed.message, MESSAGE_MAX)) state.message = parsed.message;
      for (const key of ["handFed", "totalSats", "donations"]) {
        if (Number.isFinite(parsed[key]) && parsed[key] >= 0) state[key] = Math.floor(parsed[key]);
      }
    } catch {
      return defaults();
    }
    return state;
  };
  const save = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable, so keep going in memory
    }
  };
  const create = ({ catalog }) => {
    const state = load(catalog);
    let seq = state.inventory.length;
    const countOf = (itemId) => state.inventory.reduce((n, e) => n + (e.itemId === itemId), 0);
    // Full stacks never roll, so a crate only carries an item the locker still has room for
    const lootForVisitor = (donation) => lootFor(donation, catalog.filter((item) => countOf(item.id) < STACK_MAX));
    const addItem = ({ item, tier, donationId }) => {
      if (countOf(item.id) >= STACK_MAX) return null;
      const entry = { id: `${donationId}/${seq++}`, itemId: item.id, tier, donationId, at: Date.now() };
      state.inventory.push(entry);
      if (state.inventory.length > INVENTORY_MAX) {
        const dropped = state.inventory.shift();
        for (const [name, id] of Object.entries(state.assignments)) if (id === dropped.id) delete state.assignments[name];
      }
      save(state);
      return entry;
    };
    const assign = (entryId, name) => {
      if (!state.inventory.some((e) => e.id === entryId)) return false;
      // One item per caveman, so drop the previous wearer
      for (const [other, id] of Object.entries(state.assignments)) if (id === entryId) delete state.assignments[other];
      state.assignments[name] = entryId;
      save(state);
      return true;
    };
    const unassign = (name) => {
      delete state.assignments[name];
      save(state);
    };
    const itemOf = (entryId) => {
      const entry = state.inventory.find((e) => e.id === entryId);
      return entry ? catalog.find((c) => c.id === entry.itemId) : null;
    };
    const assignedTo = (entryId) => Object.keys(state.assignments).find((name) => state.assignments[name] === entryId) || null;
    const recordDonation = (donation) => {
      state.totalSats += donation.sats;
      state.donations += 1;
      save(state);
    };
    const recordHandFed = () => {
      state.handFed += 1;
      save(state);
    };
    const resetAll = () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Storage unavailable, but the reload still resets
      }
    };
    const clearLoot = () => {
      state.inventory.length = 0;
      for (const name of Object.keys(state.assignments)) delete state.assignments[name];
      save(state);
    };
    const setIdentity = ({ handle, message }) => {
      state.handle = handle;
      state.message = message;
      save(state);
    };
    const forecast = (level, workers, eatRatePerWorker) => {
      const rate = workers * eatRatePerWorker;
      if (rate <= 0) return Infinity;
      return level / rate;
    };
    const formatDuration = (seconds) => {
      if (!Number.isFinite(seconds)) return "stable";
      if (seconds < 90) return `${Math.max(1, Math.round(seconds))}s`;
      if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
      return `${(seconds / 3600).toFixed(1)}h`;
    };
    return { state, countOf, lootFor: lootForVisitor, addItem, assign, unassign, itemOf, assignedTo, clearLoot, resetAll, recordDonation, recordHandFed, setIdentity, forecast, formatDuration };
  };
  BL.game = { create, LOOT_TIERS, STACK_MAX, SATS_PER_BANANA, tierFor, lootFor, bananasFor, formatLarge };
})();
