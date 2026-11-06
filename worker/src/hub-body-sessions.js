// Frozen body lifecycle over the same durable transaction as ownership/deadline.
// Authentication remains in Room/VirtualHost; no NPC or body physics is stepped.
import { HOST, sameCheckpointValue as same } from './virtual-host.js';
import { hubCharacters } from './ooga-crew.js';
import { hubNpcFor } from './hub-world-identity.js';

const fail = () => { throw Error('invalid Hub frozen body transaction'); };
const rowsOf = host => [...(host?.sessions?.sessions || []), ...(host?.sessions?.pending || [])];
const kindOf = row => row.kind || row.body?.kind;
const motionOf = row => row.motion || row.body?.motion;
const equipmentOf = row => row.equipment || row.body?.equipment;
const position = m => ({ x: m.x, y: m.y, z: m.z, yaw: m.yaw });
const sameEntitlements = (a, b) => ['primaryOwned', 'secondaryOwned', 'jetpackOwned', 'unlimited'].every(k => a[k] === b[k]);

export function createHubBodySessions(records) {
  if (typeof records?.read !== 'function') fail();
  return {
    stepPassive: fail,
    async forTransaction(tx, operation, simulation) {
      if (!tx.bodies || !tx.captureBodies || typeof simulation?.bodyPlacement !== 'function') fail();
      let current = await tx.get(HOST.key), closed = false;
      const previous = new Map(rowsOf(current).map(row => [row.bodyId, row]));
      const stored = new Map((await tx.bodies()).map(row => [row.bodyId, row]));
      const names = new Map(), accepted = new Map();
      const ready = () => { if (closed) fail(); };
      for (const [bodyId, row] of stored) {
        const old = previous.get(bodyId), saved = row.checkpoint;
        records.read(saved);
        if (!old || old.accountId !== row.accountId || old.generation !== row.generation || kindOf(old) !== saved.kind
          || row.kind !== saved.kind || !hubNpcFor(bodyId, { accountId: row.accountId, bodyId, kind: row.kind, handle: saved.name })) fail();
        names.set(bodyId, saved.name);
      }
      const nameFor = row => {
        ready();
        const name = names.get(row.bodyId);
        if (!name || row.bodyId !== `player:${row.accountId}` || row.occupancy) fail();
        return name;
      };
      const placed = (row, p, occupied = false) => {
        const name = nameFor(row);
        if (!current) fail();
        const result = simulation.bodyPlacement(current.simulation, name, kindOf(row), p,
          occupied ? rowsOf(current).filter(other => other.bodyId !== row.bodyId).map(other => ({
            kind: kindOf(other), motion: motionOf(other) })) : []);
        if (!result || typeof result.grounded !== 'boolean') fail();
        return result.grounded;
      };
      const matches = (saved, row) => {
        if (saved.kind !== kindOf(row) || saved.name !== nameFor(row)) fail();
        const parsed = records.read(saved);
        if (!same(parsed.position, position(motionOf(row)))
          || parsed.motion && !same(parsed.motion, motionOf(row))
          || parsed.equipment && !same(parsed.equipment, equipmentOf(row))) fail();
        return parsed;
      };
      tx.captureBodies(next => {
        ready(); current = next;
        return rowsOf(next).sort((a, b) => a.generation - b.generation).map(row => {
          const old = previous.get(row.bodyId), saved = stored.get(row.bodyId)?.checkpoint;
          const candidate = accepted.get(row.bodyId), motion = motionOf(row), equipment = equipmentOf(row), name = nameFor(row);
          if (old && (old.accountId !== row.accountId || kindOf(old) !== kindOf(row) || old.zone !== row.zone
            || !sameEntitlements(equipmentOf(old), equipment))) fail();
          if (saved) matches(saved, old);
          if (candidate) {
            if (!same(candidate.motion, motion) || !same(candidate.equipment, equipment)) fail();
          } else if (old) {
            const before = motionOf(old), unchanged = same(before, motion);
            const stopped = same({ ...before, vx: 0, vy: 0, vz: 0 }, motion);
            if ((!unchanged && !((row.state !== 'live' || row.generation !== old.generation) && stopped)) || !same(equipmentOf(old), equipment)) fail();
          } else {
            if (saved || motion.vx !== 0 || motion.vy !== 0 || motion.vz !== 0
              || placed(row, position(motion), true) !== motion.grounded) fail();
          }
          const body = row.state === 'live' && old?.generation === row.generation ? records.read(candidate?.checkpoint || saved ||
            records.encode(kindOf(row), name, motion, equipment)).body : null;
          return { accountId: row.accountId, bodyId: row.bodyId, generation: row.generation, kind: kindOf(row),
            checkpoint: records.encode(kindOf(row), name, motion, equipment, body) };
        });
      });
      return {
        stepPassive: fail, validateOccupancy: () => false,
        bindIdentity(source) {
          ready(); if (!hubNpcFor(source.bodyId, source)) fail();
          const name = hubCharacters.get(source.handle).handle, known = names.get(source.bodyId);
          if (known && known !== name) fail();
          names.set(source.bodyId, name); return true;
        },
        readMovement(row, wire) {
          ready();
          const old = previous.get(row.bodyId), name = nameFor(row);
          if (!old || old.state !== 'live' || row.state !== 'live'
            || old.accountId !== row.accountId || old.generation !== row.generation || old.token !== row.token) fail();
          const { saved, parsed } = records.movement(kindOf(row), name, wire);
          const equipment = parsed.equipment || equipmentOf(row);
          if (!sameEntitlements(equipmentOf(old), equipment)) fail();
          const grounded = placed(row, parsed.position);
          const motion = parsed.motion || { ...parsed.position, vx: 0, vy: 0, vz: 0, grounded };
          if (parsed.motion && parsed.motion.grounded !== grounded) fail();
          return { checkpoint: saved, motion, equipment: structuredClone(equipment) };
        },
        applyMovement(row, candidate) {
          ready();
          const checked = this.readMovement(row, candidate.checkpoint.wire);
          if (!same(checked, candidate)) fail();
          accepted.set(row.bodyId, structuredClone(candidate));
        },
        transfer(view, saved) {
          ready(); matches(saved, view);
          // The saved grounded flag may outlive its support. Clearance must
          // still pass; the browser resumes gravity with zero momentum.
          placed(view, position(view.motion), true);
          return structuredClone(saved.wire);
        },
        dispose() { closed = true; names.clear(); accepted.clear(); previous.clear(); stored.clear(); },
      };
    },
  };
}
