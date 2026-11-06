// Finite local projection cost experiment. Real managed rigs, authored motion,
// no browser, transport, account, timers, or simulation activation.
import assert from "node:assert/strict";
import { managedRigs } from "../test/fixtures/clanker-pose-rig.mjs";
import { HOST } from "../src/virtual-host.js";
import { createNpcPose } from "../src/npc-pose.js";
import { rig } from "../test/fixtures/npc-pose-rig.mjs";
import "../../src/js/clanker-pose.js";
import "../../src/js/npc-pose-packet.js";

const f = managedRigs(), count = 53, world = "clanker-projection-cost-1";
const make = (_, index) => f.B.agent.create({ ...f.options, suitColor: index % f.B.agent.SUIT_COLORS });
const host = Array.from({ length: count }, make);
const followers = Array.from({ length: 2 }, () => Array.from({ length: count }, make));
const held = host.map((_, i) => i % 7 ? null : `lab:vessel:${i}`);
for (let i = 0; i < count; i++) if (held[i]) for (const actor of [host[i], ...followers.map(list => list[i])]) {
  const node = f.B.scene.createNode({ geometry: f.B.agent.labFlaskGeometry(i % 2) });
  f.B.models.attachGlassShell(node); assert.equal(actor.holdLabItem(node), true);
}
const senders = host.map(r => r.createPoseProjector(world));
const receivers = followers.map(list => list.map(r => r.createPoseProjector(world)));
const oogas = Array.from({ length: count }, (_, index) => ({ index, actor: rig() })), projectOogas = createNpcPose(123, count);
const codec = globalThis.BL.npcPosePacket;
const samples = [], startCPU = process.cpuUsage();
let bytes = 0, maxBytes = 0, maxActorBytes = 0, packetBytes = 0, maxPacketBytes = 0, maxExpandedBytes = 0, final;
for (let frame = 0; frame < 120; frame++) {
  // Pose advancement is measured separately from projection/JSON/application.
  for (let i = 0; i < count; i++) {
    const phase = i % 6, x = phase === 0 ? 0 : phase === 1 ? 20 : i + 40;
    const motion = phase === 0 ? { lab: true, labWork: held[i] ? "carry" : "type", labPhase: frame / 10 + i * .37 }
      : phase === 1 ? { office: true, officeSeat: .8, officeWork: "type", officeHands: [20, 1, 1, 21, 1, 1], officePhase: frame / 9 + i * .13 }
        : phase === 2 ? { climb: .8, climbStride: frame / 10 + i * .17 }
          : phase === 3 ? { roll: .8, rollAngle: 1.2 + i / 9, rollSide: .5 } : phase === 4 ? { swim: true, labPhase: frame / 10 + i * .31 } : {};
    host[i].poseManaged(.05, x, phase === 5 ? 2 + i / 100 : 0, .2 + i / 100, .7 + i * .11,
      phase === 5 ? 2.8 + i / 100 : 0, phase === 5, false, "", motion);
  }
  for (let i = 0; i < count; i++) {
    oogas[i].actor.root.position.x = i + frame / 17; oogas[i].actor.root.rotation.y = frame / 120;
    oogas[i].actor.parts.armR.rotation.x = Math.sin(frame / 10 + i);
    oogas[i].actor.parts.gunBananas.forEach((b, j) => b.visible = j < (i + frame) % 31);
  }
  const at = performance.now(), snapshots = senders.map((s, i) => s.capture(held[i])), ooga = projectOogas(oogas);
  const text = JSON.stringify(snapshots), length = Buffer.byteLength(text);
  bytes += length; maxBytes = Math.max(maxBytes, length);
  for (const s of snapshots) maxActorBytes = Math.max(maxActorBytes, Buffer.byteLength(JSON.stringify(s)));
  const packet = codec.pack(world, ooga, snapshots.map((pose, index) => ({ index, pose })));
  packetBytes += packet.byteLength; maxPacketBytes = Math.max(maxPacketBytes, packet.byteLength);
  maxExpandedBytes = Math.max(maxExpandedBytes, new DataView(packet).getUint32(8, true));
  const received = codec.unpack(packet); assert.deepEqual(received.ooga, ooga);
  for (const client of receivers) for (let i = 0; i < count; i++) client[i].apply(received.clankers[i].pose, held[i]);
  samples.push(performance.now() - at); final = snapshots;
}
const cpu = process.cpuUsage(startCPU);
for (let i = 0; i < count; i++) for (let client = 0; client < followers.length; client++) {
  assert.equal(f.display(host[i]), f.display(followers[client][i]));
  assert.equal(JSON.stringify(receivers[client][i].capture(held[i])), JSON.stringify(final[i]));
}
assert.ok(maxActorBytes <= f.B.clankerPose.MAX_BYTES);
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ clankers: count, oogas: count, followers: 2, frames: samples.length,
  perActorLimit: f.B.clankerPose.MAX_BYTES, maxActorBytes, maxRosterBytes: maxBytes, serializedBytes: bytes,
  packetLimit: codec.MAX, expandedLimit: codec.EXPANDED, maxPacketBytes, maxExpandedBytes, packetBytes,
  existingPublicSnapshotLimit: HOST.snapshotBytes, fitsExistingPublicSnapshot: maxBytes <= HOST.snapshotBytes,
  projectionEncodingDecodingAndTwoApplicationsMs: { p50: samples[60], p95: samples[114], max: samples.at(-1) },
  totalCPUIncludingPoseMs: (cpu.user + cpu.system) / 1000,
  limitations: ["real rig projection over authored motion; not full Clanker AI or physical recovery",
    "mixed packets are a new format; old Ooga transport refuses them and no network delivery was enabled",
    "Oogas use the real encoder over authored rigs; this is not full mixed NPC simulation",
    "two local followers are not browser/network/GPU or production billing measurements",
    "suit colors, phases, headings and 8 bound vessels vary; world/item ownership remains authored"] }, null, 2));
for (const rig of [...host, ...followers.flat()]) rig.dispose();
