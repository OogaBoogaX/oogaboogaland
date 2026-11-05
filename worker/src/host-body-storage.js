// Opt-in storage layout for complete controlled-body components. No deployed
// binding uses this adapter. The existing VirtualHost still owns fencing and
// sessions; this layer only commits its record and bounded body rows atomically.
import { HOST, boundedJSON, sameCheckpointValue } from "./virtual-host.js";
import { createInlineBodyMovementJournal, validateMovementReceipt } from './host-body-movement.js';
import { createBodyOperationJournal } from "./host-body-operations.js";

export const BODY_STORAGE = Object.freeze({ version: 2, maxBodies: 32,
  componentBytes: 8 * 1024, componentNodes: 128, rowBytes: 9 * 1024,
  rootBytes: HOST.checkpointBytes + 1024, prefix: "virtual-host-body-v1:" });
const fail = () => { throw Error("incompatible or incomplete host body storage"); };
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const key = i => BODY_STORAGE.prefix + i;
const movementFor = (receipt, body) => {
  if (receipt === null) return null;
  const r = validateMovementReceipt(receipt);
  if (!body) fail();
  if (r.accountId !== body.accountId || r.bodyId !== body.bodyId || r.generation !== body.generation) fail();
  return r;
};
const identities = host => {
  if (!host || host.schema !== HOST.schema || typeof host.world !== "string"
    || !Number.isSafeInteger(host.fence) || host.fence < 1
    || !Number.isSafeInteger(host.revision) || host.revision < 1
    || !Number.isSafeInteger(host.budget)
    || host.budget < HOST.checkpointBytes - HOST.metadataBytes - BODY_STORAGE.maxBodies * HOST.sessionSlotBytes) fail();
  boundedJSON(host, HOST.checkpointBytes);
  const s = host.sessions;
  if (s !== null && (!Array.isArray(s?.sessions) || !Array.isArray(s.pending))) fail();
  const rows = s ? [...s.sessions, ...s.pending] : [];
  if (rows.length > BODY_STORAGE.maxBodies) fail();
  const bodies = new Set(), generations = new Set();
  return rows.map(r => {
    const kind = r.kind ?? r.body?.kind;
    if (!Number.isSafeInteger(r.accountId) || r.accountId < 1
      || typeof r.bodyId !== "string" || !/^[A-Za-z0-9._:/-]{1,64}$/.test(r.bodyId) || bodies.has(r.bodyId)
      || !Number.isSafeInteger(r.generation) || r.generation < 1 || generations.has(r.generation)
      || kind !== "clanker") fail();
    bodies.add(r.bodyId); generations.add(r.generation);
    return [r.accountId, r.bodyId, r.generation, kind];
  }).sort((a, b) => a[2] - b[2]);
};

// capture(host, previousRows) must synchronously provide a complete body set for
// the new host revision, including pending departures. validate(checkpoint) is
// the source-owned profile validator, not authentication. Both callbacks must be
// retry-safe and side-effect free. A missing body aborts the entire host commit.
// This is not a browser command API or a substitute for full-body passive physics.
export function createHostBodyStorage({ storage, profile, capture, validate }) {
  if (typeof storage?.transaction !== "function" || typeof capture !== "function" || typeof validate !== "function"
    || typeof profile !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(profile)) fail();
  const check = (host, rows) => {
    const ids = identities(host);
    if (!Array.isArray(rows) || rows.length !== ids.length || Object.keys(rows).length !== rows.length) fail();
    const result = [];
    for (let i = 0; i < ids.length; i++) {
      const r = rows[i], expected = ids[i];
      if (!exact(r, ["accountId", "bodyId", "generation", "kind", "checkpoint"])
        || [r.accountId, r.bodyId, r.generation, r.kind].some((v, j) => v !== expected[j])) fail();
      boundedJSON(r.checkpoint, BODY_STORAGE.componentBytes, BODY_STORAGE.componentNodes);
      if (validate(structuredClone(r.checkpoint)) !== true) fail();
      result.push(structuredClone(r));
    }
    return result;
  };
  return {
    transaction(callback) {
      return storage.transaction(async tx => {
        let loaded = false, poisoned = false, host, rows = [], revisions = [], movements = [], scopedCapture = null, wrote = false, pendingMovement = null;
        const load = async () => {
          if (loaded) return;
          const root = await tx.get(HOST.key);
          if (root === undefined) {
            const orphans = await tx.get(Array.from({ length: BODY_STORAGE.maxBodies }, (_, i) => key(i)));
            if (!(orphans instanceof Map) || orphans.size) fail();
            loaded = true; return;
          }
          // Old raw records and another profile are refused. Conversely an old
          // VirtualHost refuses this envelope; mixed writers cannot drop bodies.
          boundedJSON(root, BODY_STORAGE.rootBytes);
          if (!exact(root, ["v", "profile", "host", "count", "revisions"]) || root.v !== BODY_STORAGE.version
            || root.profile !== profile || root.count !== identities(root.host).length
            || !Array.isArray(root.revisions) || root.revisions.length !== root.count || Object.keys(root.revisions).length !== root.count
            || root.revisions.some(r => !Number.isSafeInteger(r) || r < 1 || r > root.host.revision)) fail();
          const keys = Array.from({ length: root.count }, (_, i) => key(i));
          const values = keys.length ? await tx.get(keys) : new Map();
          if (!(values instanceof Map) || values.size !== keys.length) fail();
          const next = keys.map((k, i) => {
            const value = values.get(k);
            boundedJSON(value, BODY_STORAGE.rowBytes, BODY_STORAGE.componentNodes + 24);
            if (!exact(value, ["v", "profile", "world", "fence", "revision", "body", "movement"])
              || value.v !== BODY_STORAGE.version || value.profile !== profile || value.world !== root.host.world
              || !Number.isSafeInteger(value.fence) || value.fence < 1 || value.fence > root.host.fence
              || value.revision !== root.revisions[i]) fail();
            movements.push(structuredClone(movementFor(value.movement, value.body)));
            return value.body;
          });
          rows = check(root.host, next); revisions = root.revisions.slice(); host = structuredClone(root.host); loaded = true;
        };
        const movementJournal = createInlineBodyMovementJournal({
            read: async accountId => {
              await load(); const i = rows.findIndex(r => r.accountId === accountId);
              if (i < 0) fail(); return structuredClone(movements[i]);
            },
            stage: receipt => {
              if (!loaded || wrote || pendingMovement || poisoned) fail();
              const body = rows.find(r => r.accountId === receipt.accountId);
              pendingMovement = structuredClone(movementFor(receipt, body));
            },
          });
        const result = await callback({
          bodyOperations: createBodyOperationJournal(tx),
          bodyMovements: { async run(...args) {
            try {
              if (poisoned) fail();
              return await movementJournal.run(...args);
            } catch (error) { poisoned = true; throw error; }
          } },
          get: async k => {
            if (k !== HOST.key) fail(); await load(); return structuredClone(host);
          },
          put: async (k, value) => {
            try {
              if (poisoned) fail();
              if (k !== HOST.key) fail(); await load();
              // A valid host save increments once. Ownership/world validation is
              // still VirtualHost's responsibility inside this same transaction.
              if (value?.revision !== (host?.revision || 0) + 1
                || host && (value.world !== host.world || value.fence < host.fence)) fail();
              const nextHost = structuredClone(value);
              wrote = true;
              const nextRows = check(nextHost, (scopedCapture || capture)(structuredClone(nextHost), structuredClone(rows)));
              const nextRevisions = [], nextMovements = [], writes = {};
              for (let i = 0; i < nextRows.length; i++) {
                const body = nextRows[i], previous = rows.findIndex(r => r.accountId === body.accountId
                  && r.bodyId === body.bodyId && r.generation === body.generation);
                const movement = pendingMovement?.accountId === body.accountId ? movementFor(pendingMovement, body)
                  : previous < 0 ? null : movements[previous];
                nextMovements.push(movement);
                // The root commits the exact version of every row. An unchanged
                // body need not be rewritten merely to renew the host lease.
                if (rows[i] && sameCheckpointValue(rows[i], nextRows[i]) && sameCheckpointValue(movements[i], movement)) {
                  nextRevisions.push(revisions[i]); continue;
                }
                nextRevisions.push(nextHost.revision);
                const row = { v: BODY_STORAGE.version, profile, world: nextHost.world, fence: nextHost.fence,
                  revision: nextHost.revision, body: nextRows[i], movement };
                boundedJSON(row, BODY_STORAGE.rowBytes, BODY_STORAGE.componentNodes + 24); writes[key(i)] = row;
              }
              const root = { v: BODY_STORAGE.version, profile, host: nextHost, count: nextRows.length, revisions: nextRevisions };
              boundedJSON(root, BODY_STORAGE.rootBytes); writes[HOST.key] = root;
              // Validate all rows before the first write; at most 33 fixed keys.
              await tx.put(writes);
              if (rows.length > nextRows.length) await tx.delete(Array.from({ length: rows.length - nextRows.length }, (_, i) => key(nextRows.length + i)));
              rows = nextRows; revisions = nextRevisions; movements = nextMovements; host = nextHost;
            } catch (error) { poisoned = true; throw error; }
          },
          // Server-only recovery access; no token, deadline or inventory is
          // exported into public snapshots by this storage adapter.
          bodies: async () => { await load(); return structuredClone(rows); },
          // A transaction-local body controller may replace the pure fallback
          // capture exactly once, before any write. Never cache it on storage.
          captureBodies: fn => {
            if (poisoned || scopedCapture || wrote || typeof fn !== "function") { poisoned = true; fail(); }
            scopedCapture = fn;
          },
        });
        if (poisoned) fail();
        return result;
      });
    },
  };
}
