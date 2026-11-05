// Minimal Ooga records share the host/session transaction. The world supplies
// identity and standing-shape clearance; frozen bodies run no controller.
import { HOST, sameCheckpointValue } from './virtual-host.js';
import '../../src/js/ooga-body.js';
const fail = () => { throw Error('incompatible Ooga body session'); };
const records = host => [...(host?.sessions?.sessions || []), ...(host?.sessions?.pending || [])];
const motion = row => row.motion || row.body?.motion;
const equipment = row => row.equipment || row.body?.equipment;
const kind = row => row.kind || row.body?.kind;
const identity = row => ({ accountId: row.accountId, bodyId: row.bodyId, generation: row.generation, zone: row.zone, kind: kind(row) });
const position = row => { const m = motion(row); return { x: m.x, y: m.y, z: m.z, yaw: m.yaw }; };
// An authenticated live body may select owned equipment and its carry/combat
// mode. Motion samples cannot grant/revoke ownership or unlimited resources.
const sameEntitlements = (a, b) => ['primaryOwned', 'secondaryOwned', 'jetpackOwned', 'unlimited'].every(k => a[k] === b[k]);

export function createOogaBodySessions({ identityFor, placement }) {
  if (typeof identityFor !== 'function' || typeof placement !== 'function') fail();
  const codec = row => {
    if (kind(row) !== 'ooga' || row.occupancy) fail();
    const mapped = identityFor(identity(row));
    if (!mapped || mapped.then) fail();
    return globalThis.BL.oogaBody.codec(mapped);
  };
  const placed = (row, p) => {
    const result = placement(identity(row), { ...p });
    if (!result || result.then || Object.keys(result).join() !== 'grounded' || typeof result.grounded !== 'boolean') fail();
    return result.grounded;
  };
  return {
    stepPassive: fail,
    async forTransaction(tx) {
      if (typeof tx.bodies !== 'function' || typeof tx.captureBodies !== 'function') fail();
      const host = await tx.get(HOST.key), previous = new Map(records(host).map(r => [r.bodyId, r]));
      const stored = new Map((await tx.bodies()).map(r => [r.bodyId, r])), accepted = new Map();
      let closed = false;
      const ready = () => { if (closed) fail(); };
      tx.captureBodies(next => {
        ready();
        return records(next).sort((a, b) => a.generation - b.generation).map(row => {
          const wire = codec(row), old = previous.get(row.bodyId), saved = stored.get(row.bodyId), candidate = accepted.get(row.bodyId);
          if (old && (old.accountId !== row.accountId || old.zone !== row.zone || kind(old) !== kind(row)
            || !sameEntitlements(equipment(old), equipment(row))
            || !sameCheckpointValue(equipment(old), equipment(row))
              && (!candidate || !sameCheckpointValue(candidate.equipment, equipment(row))))) fail();
          if (saved) {
            if (saved.accountId !== row.accountId || saved.kind !== 'ooga') fail();
            const prior = wire.read(saved.checkpoint);
            if ((!sameCheckpointValue(prior.position, position(row)) || !sameCheckpointValue(prior.equipment, equipment(row)))
              && (!candidate || !sameCheckpointValue(candidate.position, position(row))
                || !sameCheckpointValue(candidate.equipment, equipment(row)))) fail();
          } else placed(row, position(row));
          return { accountId: row.accountId, bodyId: row.bodyId, generation: row.generation, kind: 'ooga',
            checkpoint: wire.encode(position(row), equipment(row)) };
        });
      });
      return {
        stepPassive: fail, validateOccupancy: () => false,
        readMovement(row, input) {
          ready();
          const old = previous.get(row.bodyId), wire = codec(row);
          if (!old || old.state !== 'live' || row.state !== 'live' || !sameCheckpointValue(identity(old), identity(row))) fail();
          const candidate = wire.read(input);
          if (!sameEntitlements(candidate.equipment, equipment(row))) fail();
          return { checkpoint: wire.encode(candidate.position, candidate.equipment),
            equipment: candidate.equipment,
            motion: { ...candidate.position, vx: 0, vy: 0, vz: 0, grounded: placed(row, candidate.position) } };
        },
        applyMovement(row, candidate) {
          ready(); const parsed = codec(row).read(candidate.checkpoint);
          const expected = { ...parsed.position, vx: 0, vy: 0, vz: 0, grounded: placed(row, parsed.position) };
          if (!sameCheckpointValue(expected, candidate.motion) || !sameCheckpointValue(parsed.equipment, candidate.equipment)
            || !sameEntitlements(parsed.equipment, equipment(row))) fail();
          accepted.set(row.bodyId, parsed);
        },
        transfer(view, checkpoint) {
          ready(); const wire = codec(view), parsed = wire.read(checkpoint);
          if (!sameCheckpointValue(parsed.position, position(view)) || !sameCheckpointValue(parsed.equipment, equipment(view))) fail();
          placed(view, parsed.position);
          return wire.encode(parsed.position, parsed.equipment);
        },
        dispose() { closed = true; previous.clear(); stored.clear(); accepted.clear(); },
      };
    },
  };
}
