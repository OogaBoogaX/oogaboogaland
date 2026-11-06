// Both complete NPC streams, including hidden/away entries and online owners.
// Presence changes their client presentation, never this authoritative roster.
import { createNpcPose } from './npc-pose.js';
import { hubMath } from './ooga-crew.js';
import '../../src/js/clanker-pose.js';
import '../../src/js/npc-lab-pose.js';
import '../../src/js/npc-world-layout.js';
import '../../src/js/npc-pose-packet.js';

const fail = () => { throw Error('invalid Hub NPC projection'); };
export const hubNpcId = (kind, handle) => {
  if (!['ooga', 'clanker'].includes(kind) || typeof handle !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(handle)) fail();
  return `${kind}:${handle.toLowerCase()}`;
};

export function createHubWorldProjection({ version, actors, geometry, world }) {
  const { crew, clankers } = actors, list = crew.list.filter(cave => !cave.contributor.temporary);
  if (!list.length || list.length > 53 || list.length !== crew.list.length || clankers.list.length !== list.length) fail();
  const signature = hubMath.fnv1a(JSON.stringify([list.map(cave => cave.traits.name),
    (crew.workSites || []).map(site => site.mouth?.id || site.repo)])) >>> 0;
  const encode = createNpcPose(signature, list.length);
  const oogas = list.map((actor, index) => ({ index, actor }));
  const companions = list.map((owner, index) => {
    const entry = clankers.list[index];
    if (entry.owner !== owner || entry.index !== index) fail();
    return { entry, projector: entry.gorilla.createPoseProjector(version) };
  });
  const lab = globalThis.BL.npcLabPose.create(() => geometry.lab);
  const yaw = n => Math.atan2(Math.sin(n), Math.cos(n));
  const row = (kind, cave, actor, heading, phase, seed) => ({
    id: hubNpcId(kind, cave.traits.name), kind,
    x: actor.root.position.x, y: actor.root.position.y, z: actor.root.position.z, yaw: yaw(heading),
    activity: cave.state, phase: phase || 'idle', route: 'hub', progress: 0, seed,
  });
  return {
    project() {
      const npcs = [];
      for (let i = 0; i < list.length; i++) {
        const cave = list[i], entry = companions[i].entry;
        npcs.push(row('ooga', cave, cave, cave.root.rotation.y, cave.work.phase, hubMath.fnv1a(cave.traits.name) >>> 0));
        npcs.push(row('clanker', cave, entry, entry.heading, entry.phase, entry.random.capture()));
      }
      return { npcs, hub: { pile: world.level } };
    },
    poses(format) {
      if (format !== 'mixed-3') fail();
      const poses = companions.map(({ entry, projector }, index) => {
        let held = null;
        if (entry.gorilla.labItem) {
          const i = geometry.lab.equipment.findIndex(item => item.node === entry.gorilla.labItem);
          if (i < 0 || geometry.lab.equipment[i].holder !== entry) fail();
          const item = geometry.lab.equipment[i]; held = `${i}:${item.kind}:${item.station}`;
        }
        return { index, pose: projector.capture(held) };
      });
      return globalThis.BL.npcPosePacket.pack(version, encode(oogas), poses, lab.capture(),
        { v: 1, history: geometry.captureLayout(), pile: world.level, count: actors.rosterCount() });
    },
  };
}
