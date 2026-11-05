// Restricted minimal-body controllers inside the same transaction as session motion.
// No Room route or browser enables this. Creation/admission are trusted world
// callbacks, not client snapshots. Live samples require authenticated host admission; occupancy refuses.
import { HOST } from "./virtual-host.js";
import { BODY_STORAGE } from "./host-body-storage.js";
import { GRACE_MS, PASSIVE_STEP_MS } from "./host-sessions.js";
// One complete grace window per operation preserves priority reconnect while
// avoiding the generic adapter's much larger batch of actual rig/controller work.
export const CLANKER_BODY_STEPS = GRACE_MS / PASSIVE_STEP_MS;
export const CLANKER_BODY_LOADS = 1;
// Explicit opt-in for measured batching. The default stays conservative; no
// deployed caller selects a larger batch. This is a work cap, not body capacity.
export const CLANKER_BODY_MAX_LOADS = 4;
const fail = () => { throw Error("incompatible Clanker body session transaction"); };
const records = host => [...(host?.sessions?.sessions || []), ...(host?.sessions?.pending || [])];
const motionOf = row => row.body?.motion || row.motion;
const equipmentOf = row => row.body?.equipment || row.equipment;
const kindOf = row => row.kind || row.body?.kind;
const same = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
};

export function createClankerBodySessions({ create, admit, recordFor, bodyLoads = CLANKER_BODY_LOADS, browserTransfer = false }) {
  if (typeof create !== "function" || typeof admit !== "function" || typeof recordFor !== "function"
    || !Number.isSafeInteger(bodyLoads) || bodyLoads < 1 || bodyLoads > CLANKER_BODY_MAX_LOADS || typeof browserTransfer !== "boolean") fail();
  return {
    passiveSteps: CLANKER_BODY_STEPS,
    stepPassive: fail, // A controller must never outlive its transaction attempt.
    async forTransaction(tx, operation = {}) {
      if (typeof tx?.bodies !== "function" || typeof tx.captureBodies !== "function") fail();
      if (operation.clankerBodyLoads === undefined) operation.clankerBodyLoads = 0;
      const host = await tx.get(HOST.key), rows = await tx.bodies();
      const previous = new Map(records(host).map(r => [r.bodyId, r]));
      const stored = new Map(rows.map(r => [r.bodyId, r])), active = new Map();
      let closed = false, poisoned = false;
      const ready = () => { if (closed || poisoned) fail(); };
      const identity = row => ({ accountId: row.accountId, bodyId: row.bodyId,
        generation: row.generation, kind: kindOf(row), zone: row.zone });
      const load = (row, replacement = null) => {
        ready();
        if (active.has(row.bodyId)) { if (replacement) fail(); return active.get(row.bodyId); }
        if (active.size >= BODY_STORAGE.maxBodies || kindOf(row) !== "clanker" || row.occupancy) fail();
        let controller;
        try {
          if (operation.clankerBodyLoads >= bodyLoads) throw Error("Clanker body construction budget exhausted");
          operation.clankerBodyLoads++;
          const old = stored.get(row.bodyId);
          if (old && (old.accountId !== row.accountId || old.kind !== kindOf(row))) fail();
          const checkpoint = replacement || (old ? old.checkpoint : admit(identity(row)));
          controller = create(identity(row));
          if (!controller || controller.then || typeof controller.dispose !== "function"
            || !["restore", "capture", "motion", "disconnect", "stepPassive"].every(k => typeof controller.codec?.[k] === "function")) fail();
          // Reconcile vanished terrain support in the same physics/registry
          // transaction; an unstepped body cannot be captured or made live.
          controller.codec.restore(structuredClone(checkpoint), { passive: !replacement });
          const value = { controller, stopped: false }; active.set(row.bodyId, value); return value;
        } catch (error) {
          poisoned = true; if (typeof controller?.dispose === "function") controller.dispose(); throw error;
        }
      };
      const stop = value => {
        if (!value.stopped) { value.controller.codec.disconnect(); value.stopped = true; }
      };
      tx.captureBodies(next => {
        ready();
        try {
          return records(next).sort((a, b) => a.generation - b.generation).map(row => {
            const old = previous.get(row.bodyId), saved = stored.get(row.bodyId), body = motionOf(row);
            if (kindOf(row) !== "clanker" || row.occupancy
              || old && (old.accountId !== row.accountId || old.zone !== row.zone || kindOf(old) !== kindOf(row)
                || !same(equipmentOf(old), equipmentOf(row)))) fail();
            // Live browser motion requires its own authenticated complete-body
            // ingestion. Metadata-only updates cannot silently replace physics.
            const stopped = (["grace", "offered"].includes(row.state) || row.type === "depart" && row.reason === "expired") && (!old || old.state === "live")
              || old?.state === "live" && row.generation !== old.generation;
            let value = active.get(row.bodyId), checkpoint;
            if (!value && saved && stopped) {
              // No physics time advances here: all velocities become zero.
              // Source-owned rules bind the trusted world/baseline/owner and
              // verify the old and new registry motion.
              const codec = recordFor(identity(old));
              if (typeof codec?.disconnect !== "function") fail();
              const closed = codec.disconnect(saved.checkpoint, motionOf(old));
              if (!same(closed.motion, body)) fail();
              checkpoint = closed.checkpoint;
            } else if (!value && saved && !stopped && same(motionOf(old), body)) checkpoint = saved.checkpoint;
            else {
              value ||= load(row);
              if (stopped) stop(value);
              if (!same(value.controller.codec.motion(), body)) fail();
              checkpoint = value.controller.codec.capture();
            }
            return { accountId: row.accountId, bodyId: row.bodyId, generation: row.generation, kind: kindOf(row), checkpoint };
          });
        } catch (error) { poisoned = true; throw error; }
      });
      return {
        passiveSteps: CLANKER_BODY_STEPS,
        readMovement(row, wire) {
          ready();
          const old = previous.get(row.bodyId);
          if (!old || old.state !== 'live' || row.state !== 'live' || row.occupancy
            || !same(identity(old), identity(row))) fail();
          const codec = recordFor(identity(row));
          if (typeof codec?.fromTransfer !== 'function' || typeof codec?.motion !== 'function') fail();
          const checkpoint = codec.fromTransfer(wire);
          return { checkpoint, motion: codec.motion(checkpoint) };
        },
        applyMovement(row, candidate) {
          const value = load(row, candidate.checkpoint);
          if (!same(value.controller.codec.motion(), candidate.motion)) { poisoned = true; fail(); }
        },
        ...(browserTransfer ? { transfer(view, checkpoint) {
          ready();
          const codec = recordFor(identity(view));
          if (typeof codec?.transfer !== "function") fail();
          return codec.transfer(checkpoint);
        } } : {}),
        canStep(input) { ready(); return active.has(input.bodyId) || active.size < bodyLoads; },
        stepPassive(input, ms) {
          ready();
          try {
            const row = previous.get(input?.bodyId);
            if (!row || row.type === "depart" || row.zone !== input.zone || kindOf(row) !== input.kind) fail();
            const value = load(row);
            if (row.state === "live") stop(value);
            return value.controller.codec.stepPassive(input, ms);
          } catch (error) { poisoned = true; throw error; }
        },
        validateOccupancy: () => false,
        dispose() {
          if (closed) return; closed = true;
          // Dispose all controllers even if one cleanup fails. Failure still
          // aborts the enclosing transaction rather than publishing its result.
          let error;
          for (const { controller } of active.values()) {
            try { controller.dispose(); } catch (e) { error ||= e; }
          }
          active.clear(); previous.clear(); stored.clear();
          if (error) throw error;
        },
      };
    },
  };
}
