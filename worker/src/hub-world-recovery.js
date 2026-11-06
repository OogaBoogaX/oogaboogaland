// One atomic recovery envelope for actual Hub controllers. This module composes
// source-owned state; it does not construct missing terrain/event providers or
// activate a world. The host commits the returned value as one simulation record.
import { boundedJSON, HOST } from './virtual-host.js';
import { createClankerLogicalCheckpoint } from './clanker-roaming.js';
import { createCheckpointPack } from './checkpoint-pack.js';

export function createHubWorldRecovery({ version, checkpointBytes, crew, clankers, roster,
  labEquipment, offices, inputs, bedId, bedFor, placement, worldState, layoutState, validateWorld, syncWorld, disposeWorld }) {
  const fail = () => { throw Error('invalid combined Hub recovery'); };
  if (typeof version !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(version)
    || !Number.isSafeInteger(checkpointBytes) || checkpointBytes < 256 || checkpointBytes > HOST.checkpointBytes
    || crew?.authoritative !== true || roster?.authoritative !== true
    || typeof crew.createLogicalCheckpoint !== 'function' || !clankers?.logicalCheckpoint
    || typeof labEquipment?.createCheckpoint !== 'function'
    || typeof inputs?.capture !== 'function' || typeof inputs?.restore !== 'function'
    || !Array.isArray(offices) || offices.length > 32 || Object.keys(offices).length !== offices.length
    || offices.some(office => typeof office?.checkpoint?.capture !== 'function' || typeof office?.checkpoint?.restore !== 'function')
    || [bedId, bedFor, placement, validateWorld, syncWorld, disposeWorld, worldState?.capture, worldState?.restore,
      layoutState?.capture, layoutState?.restore, roster.capture, roster.restore].some(fn => typeof fn !== 'function')) fail();
  const ooga = crew.createLogicalCheckpoint({ world: version, bedId, bedFor, placement });
  // Ooga's source-owned logical DTO has repeated field names across actors.
  // Reuse the existing bounded lossless codec; do not drop state or round poses.
  const oogaPack = createCheckpointPack(Math.min(checkpointBytes, 64 * 1024), { intern: true });
  const companion = createClankerLogicalCheckpoint(clankers, version);
  const equipment = labEquipment.createCheckpoint(version);
  let poisoned = false, restored = false, restoring = false;
  const sync = value => { if (value && typeof value.then === 'function') fail(); return value; };
  const ready = () => { if (poisoned || restoring) fail(); };
  const bound = saved => {
    boundedJSON(saved, checkpointBytes, HOST.simulationNodes);
    if (!saved || Object.keys(saved).sort().join() !== 'activity,clankers,equipment,inputs,layout,offices,ooga,state,v,world'
      || saved.v !== 7 || saved.world !== version || !Array.isArray(saved.offices)
      || saved.offices.length !== offices.length || Object.keys(saved.offices).length !== offices.length) fail();
  };
  const poison = error => {
    poisoned = true; restoring = false;
    // No partly restored world may survive a storage retry or become visible.
    try { sync(disposeWorld()); } catch { /* Preserve the original recovery failure. */ }
    throw error;
  };
  return {
    version, checkpointBytes,
    capture() {
      ready();
      try {
        if (sync(validateWorld()) !== true) fail();
        const saved = { v: 7, world: version, activity: sync(roster.capture()), layout: sync(layoutState.capture()),
          inputs: sync(inputs.capture()), state: sync(worldState.capture()), ooga: oogaPack.pack(ooga.capture()), clankers: companion.capture(),
          equipment: equipment.capture(), offices: offices.map(office => sync(office.checkpoint.capture())) };
        bound(saved);
        return structuredClone(saved);
      } catch (error) { return poison(error); }
    },
    restore(saved) {
      ready(); if (restored) fail();
      try {
        bound(saved); restoring = true;
        // World state includes the authoritative clock and mutable collision/
        // interaction state. Rebuild it before the actors consult that geometry.
        sync(inputs.restore(saved.inputs));
        sync(worldState.restore(saved.state));
        sync(roster.restore(saved.activity));
        sync(layoutState.restore(saved.layout));
        for (let i = 0; i < offices.length; i++) sync(offices[i].checkpoint.restore(saved.offices[i]));
        // Both source controllers inhibit simulation during partial restoration.
        companion.restore(saved.clankers);
        ooga.restore(oogaPack.unpack(saved.ooga), { deferPlacement: true });
        // Attach held lab objects only after their owners and jobs are restored.
        equipment.restore(saved.equipment);
        // Held equipment and reconstructed resting rigs changed their parents
        // and transforms. Refresh the collision index before admitting either
        // actor stream; stale pre-restore meshes must not approve placement.
        sync(syncWorld());
        companion.finishRecovery();
        ooga.finishRecovery();
        if (sync(validateWorld()) !== true) fail();
        restored = true; restoring = false;
        return true;
      } catch (error) { return poison(error); }
    },
    get usable() { return !poisoned && !restoring; },
  };
}
