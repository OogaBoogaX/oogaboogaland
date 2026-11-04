// Bounded projection of actual posed Ooga rigs using the browser's encoder.
// No approximate rig from x/y/z, event tail, live player or Clanker conversion.
import "../../src/js/npc-pose.js";
import "../../src/js/npc-authority.js";
const pose = globalThis.BL.npcPose, wire = globalThis.BL.npcAuthority;
const bad = () => { throw new Error("invalid Ooga pose projection"); };

export function createNpcPose(signature, capacity) {
  if (!Number.isInteger(signature) || signature < 0 || signature > 0xffffffff
    || !Number.isInteger(capacity) || capacity < 1 || capacity > 128) bad();
  const out = new Float32Array(pose.HEADER + capacity * pose.RECORD);
  const header = new Uint32Array(out.buffer, 0, pose.HEADER), actors = new Array(capacity);
  const encode = pose.create({ out, holderCode(index, node) {
    const a = actors[index];
    if (node.parent === a.parts.armL) return 0;
    if (node.parent === a.parts.armR) return 1;
    if (node.parent === a.root) return 2;
    if (node.parent === a.sleepWeapons) return 3;
    return 4;
  } });
  return entries => {
    if (!Array.isArray(entries) || entries.length > capacity || Object.keys(entries).length !== entries.length) bad();
    // Canonical ordering/zero padding makes the same checkpoint byte-identical
    // after reconstruction. The browser's reused-buffer encoding stays unchanged.
    actors.fill(null); out.fill(0);
    try {
      for (const entry of entries) {
        const index = entry?.index, a = entry?.actor;
        if (!Number.isInteger(index) || index < 0 || index >= capacity || actors[index]
          || !a || a.controlled || a.remoteControlled || a.contributor?.temporary
          || !pose.STATES.includes(a.state) || !pose.PHASES.includes(a.work?.phase)
          || !Array.isArray(a.parts?.gunBananas) || a.parts.gunBananas.length > 30
          || Object.keys(a.parts.gunBananas).length !== a.parts.gunBananas.length) bad();
        actors[index] = a;
      }
      let count = 0;
      for (let i = 0; i < capacity; i++) if (actors[i]) encode(pose.HEADER + count++ * pose.RECORD, i, actors[i]);
      header.set([pose.FORMAT, signature, count, 0]);
      const frame = out.buffer.slice(0, (pose.HEADER + count * pose.RECORD) * 4);
      if (!wire.poses(frame)) bad();
      return frame;
    } finally {
      // Do not retain world rigs after projection or a malformed actor.
      actors.fill(null);
    }
  };
}
