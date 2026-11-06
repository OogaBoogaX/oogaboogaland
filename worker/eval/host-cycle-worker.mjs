// Finite local evaluator only. Real SQLite host/Room and managed animation;
// authored trajectories, Ooga display templates and collision world. No deploy.
import "./host-cycle-prelude.mjs";
import "../../src/js/agent.js";
import "../../src/js/clanker-flight.js";
import "../../src/js/clanker-rage.js";
import "../../src/js/clankers.js";
import { DurableObject } from "cloudflare:workers";
import { Room } from "../src/room.js";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { compactSimulation } from "../src/simulation-checkpoint.js";
import { publishHostPoses, claimHostRoom } from "../src/host-room.js";
import { createPassiveBody } from "../src/passive-body.js";
import { createNpcPose } from "../src/npc-pose.js";
import { rosterFixture } from "../test/fixtures/host-roster-fixture.mjs";
import { rig } from "../test/fixtures/npc-pose-rig.mjs";
import { roamingSimulation } from "./clanker-roaming-simulation.mjs";
import { prepare as prepareFlight } from "../test/fixtures/clanker-flight-fixture.mjs";

export { Room };
async function fixture(pairs) {
  const f = await rosterFixture(pairs, 65536, true), B = globalThis.BL, actors = [], oogas = [];
  const mouth = { x: 0, z: 0, ry: .3, floorY: 0 };
  for (let i = 0; i < pairs; i++) {
    actors.push(B.agent.create({ managed: true, groundAt: () => 0, scale: 1.15,
      coatClip: B.agent.labCoatClip(mouth), suitClip: B.agent.suitClip({ ...mouth, x: 20 }), suitColor: i % B.agent.SUIT_COLORS }));
    oogas.push(rig());
  }
  let world, controllers;
  const capture = () => JSON.parse(JSON.stringify(B.clankerState.packRoster(world, controllers.map((c, index) => ({ index, snapshot: c.capture() })), true)));
  const restore = s => {
    const rows = B.clankerState.unpackRoster(s.rigs);
    for (let i = 0; i < pairs; i++) controllers[i].restore(rows[i].snapshot);
  };
  const encode = createNpcPose(123, pairs);
  const source = { version: `cycle-fixture-${pairs}`, initial: () => ({ simulation: f.source.initial(), rigs: capture(), step: 0 }),
    validate(s) { return f.source.validate(s.simulation) && B.clankerState.unpackRoster(s.rigs).length === pairs && Number.isSafeInteger(s.step); },
    step(s, ms) {
      restore(s); f.source.step(s.simulation, ms); s.step++;
      for (let i = 0; i < pairs; i++) {
        const p = s.simulation.clankers[i].root.position;
        actors[i].poseManaged(ms / 1000, p.x, p.y, p.z, i / 11, 2, false, false, "", { roll: .6, rollAngle: s.step / 9 + i / 7, rollSide: .3 });
      }
      s.rigs = capture();
    }, project: s => f.source.project(s.simulation), npcFor: () => null, handoff: () => false,
    poses(s, format) {
      if (format !== "mixed-1") throw Error("fixture requires explicit mixed format");
      restore(s);
      const ooga = encode(oogas.map((actor, index) => {
        Object.assign(actor.root.position, s.simulation.oogas[index].actor.root.position);
        actor.root.rotation.y = s.simulation.oogas[index].actor.root.rotation.y;
        return { index, actor };
      }));
      return B.npcPosePacket.pack(world, ooga, actors.map((actor, index) => ({ index, pose: actor.createPoseProjector(world).capture() })));
    } };
  const simulation = compactSimulation(source, 65536, { intern: true });
  world = simulation.version; controllers = actors.map(a => a.createManagedCheckpoint(world));
  return { simulation, mesh: f.mesh };
}
const equipment = { weapon: "gun", mode: "combat", primaryOwned: true,
  secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true };
export class CycleHost extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.prepared = null; }
  async fetch(request) {
    const input = await request.json(), { command, pairs, roaming = false, spacious = false } = input;
    if (![1, 53].includes(pairs) || !Number.isSafeInteger(input.now) || input.now < 0) return new Response("fixture only", { status: 400 });
    const key = JSON.stringify([pairs, roaming, spacious]);
    if (typeof roaming !== "boolean" || typeof spacious !== "boolean" || spacious && !roaming
      || this.prepared && this.preparedKey !== key) return new Response("fixture profile mismatch", { status: 400 });
    this.preparedKey = key;
    this.prepared ||= roaming ? prepareFlight().then(f => ({ simulation: roamingSimulation(globalThis.BL, pairs, spacious), mesh: f.mesh })) : fixture(pairs);
    const f = await this.prepared;
    let writes = 0, writeBytes = 0;
    const storage = { transaction: fn => this.ctx.storage.transaction(tx => fn({ get: key => tx.get(key), put: async (key, value) => {
      writes++; writeBytes += new TextEncoder().encode(JSON.stringify(value)).byteLength;
      await tx.put(key, value); if (command === "fail-tick") throw Error("injected cycle rollback");
    } })) };
    const host = new VirtualHost({ storage, simulation: f.simulation, clock: () => input.now, sessionAdapter: {
      stepPassive: createPassiveBody({ world: () => ({ ...f.mesh, radius: 2.25, height: 2.8 }), gravity: 9.8 }) } });
    const claim = i => ({ protocol: SESSION_PROTOCOL, world: f.simulation.version, accountId: i + 1, bodyId: `body-${i}`, zone: "outside",
      body: { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false }, equipment } });
    const room = this.env.ROOM.get(this.env.ROOM.idFromName("cycle"));
    let result, error = null;
    try {
      if (command === "begin") result = await host.begin("cycle-owner", 120000);
      else if (command === "join") result = await host.sessions(input.ticket, [], (r, at) =>
        Array.from({ length: host.maxSessions }, (_, i) => r.connect(claim(i), at)));
      else if (command === "tick" || command === "fail-tick") result = await host.tick(input.ticket, input.tokens);
      else if (command === "publish") result = await publishHostPoses(host, room, input.ticket, { format: "mixed-1", acquire: input.acquire === true });
      else if (command === "room-status") result = await room.npcAuthorityStatus();
      else if (command === "room-publish") result = await room.publishNpcSnapshot(input.ticket, input.sequence, Uint8Array.from(input.frame).buffer);
      else if (command === "disconnect") result = await host.sessions(input.ticket, input.tokens, (r, at) => {
        for (const ref of input.refs) r.disconnect(ref, at); return true;
      });
      else if (command === "claim") result = await claimHostRoom(host, room, "cycle-restarted");
      else if (command === "connect") result = await host.connect(input.ticket, [], claim(input.index));
      else if (command === "poses") { const p = await host.poses(input.ticket, { format: "mixed-1" }); result = { sequence: p.sequence, frame: Array.from(new Uint8Array(p.frame)) }; }
      else if (command === "controller-stats" && roaming) result = f.simulation.stats((await this.ctx.storage.get(HOST.key)).simulation);
      else if (command !== "inspect") throw Error("unknown fixture command");
    } catch (e) { error = e.message; }
    const saved = await this.ctx.storage.get(HOST.key);
    return Response.json({ error, result, writes, writeBytes, checkpointBytes: saved ? new TextEncoder().encode(JSON.stringify(saved)).byteLength : 0,
      saved: command === "inspect" ? saved : undefined, slots: host.maxSessions });
  }
}
export default { fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/host" && request.method === "POST") return env.HOST.get(env.HOST.idFromName("cycle")).fetch(request);
  if (path === "/room") return env.ROOM.get(env.ROOM.idFromName("cycle")).fetch(request);
  return new Response("local fixture only", { status: 404 });
} };
