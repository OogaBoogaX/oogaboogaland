// The Room accepts an authority revision only at a restore, fetch or existing
// sweep. Messages read the accepted index in memory and never refresh storage.
import { catalogFor, CATALOG_MAX_STALE_MS } from "./character-catalog.js";

const KEY = "characterCatalogV1";

export const roomCatalog = {
  key: KEY,
  create(env, embedded, indexOf, clock = Date.now, supplied = null) {
    const enabled = env.CHARACTER_CATALOG_ENABLED === "1";
    const loader = enabled ? supplied || catalogFor(env) : null;
    let accepted = null, index = enabled ? null : indexOf(embedded), pending = null;
    const accept = (snapshot) => {
      if (!accepted || accepted.revision !== snapshot.revision) index = indexOf(snapshot.rows);
      accepted = snapshot;
    };
    const current = () => !enabled || accepted && clock() >= accepted.checkedAt && clock() - accepted.checkedAt < CATALOG_MAX_STALE_MS ? index : null;
    return {
      enabled,
      current,
      roster: () => enabled && current() ? accepted.roster : null,
      metadata() {
        if (!enabled || !current()) return null;
        return { revision: accepted.revision, generation: accepted.generation, baseline: accepted.baseline, engine: accepted.engine, roster: accepted.roster };
      },
      async restore(saved) {
        if (!enabled) return;
        // The Room reads the key through its restoring path: failed reads reset
        // the object rather than risk replacing a stored generation unseen.
        if (await loader.restore(saved)) {
          const snapshot = loader.current();
          if (snapshot) accept(snapshot);
        }
      },
      refresh(storage) {
        if (!enabled) return Promise.resolve(true);
        if (pending) return pending;
        pending = (async () => {
          const snapshot = await loader.read();
          if (!snapshot) return false;
          if (!accepted || accepted.revision !== snapshot.revision || accepted.generation !== snapshot.generation || accepted.checkedAt !== snapshot.checkedAt) {
            // Store before adopting, so a hibernation wake sees the authority
            // under which the room admitted its current players.
            await storage.put(KEY, { catalog: snapshot.catalog, activation: snapshot.activation, checkedAt: snapshot.checkedAt });
            accept(snapshot);
          }
          return !!current();
        })().finally(() => { pending = null; });
        return pending;
      },
    };
  },
};
