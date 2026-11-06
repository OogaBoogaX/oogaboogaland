// Source-owned browser wires inside a small durable identity envelope. These
// records contain no animation continuation and require no server body rig.
import { boundedJSON } from './virtual-host.js';
import { hubCharacters } from './ooga-crew.js';
import '../../src/js/ooga-body.js';
import '../../src/js/clanker-body-transfer.js';

const fail = () => { throw Error('invalid frozen Hub body record'); };
const position = m => ({ x: m.x, y: m.y, z: m.z, yaw: m.yaw });
export function createHubBodyRecords(world) {
  const names = new Set(hubCharacters.all().map(c => c.handle));
  const baseline = globalThis.BL.clankers.bodyBaseline('hub-terrain-body-1');
  const rules = globalThis.BL.clankers.bodyRecords;
  const codec = (kind, name) => {
    if (!names.has(name)) fail();
    if (kind === 'ooga') return globalThis.BL.oogaBody.codec({ world, profile: 'hub-ooga-standing-1', name });
    if (kind !== 'clanker') fail();
    return globalThis.BL.clankerBodyTransfer.create({ world, baseline, owner: name, rules });
  };
  const read = saved => {
    boundedJSON(saved, 4096, 100);
    if (!saved || Object.keys(saved).sort().join() !== 'kind,name,v,wire' || saved.v !== 1) fail();
    const parsed = codec(saved.kind, saved.name).read(saved.wire);
    return saved.kind === 'ooga' ? parsed : { body: parsed, position: position(rules.motion(parsed)), motion: rules.motion(parsed) };
  };
  return {
    read,
    validate(saved) { read(saved); return true; },
    movement(kind, name, wire) {
      const saved = { v: 1, kind, name, wire: structuredClone(wire) };
      return { saved, parsed: read(saved) };
    },
    encode(kind, name, motion, equipment, liveBody = null) {
      let wire;
      if (kind === 'ooga') wire = codec(kind, name).encode(position(motion), equipment);
      else {
        // Fresh/reclaimed bodies use a normal standing/passive-fall pose. Live
        // samples may retain source movement flags until the confirmed close.
        const body = [name, motion.x, motion.y, motion.z, motion.yaw, motion.vx, motion.vy, motion.vz,
          liveBody?.[8] ?? 0, liveBody ? (liveBody[9] & ~1) | +motion.grounded : motion.grounded ? 1 : 2];
        wire = codec(kind, name).encode(body);
      }
      const saved = { v: 1, kind, name, wire }; read(saved); return saved;
    },
  };
}
