// Local evaluator entrypoint only. Never import from the deployed Worker or bind
// to an account. Authored world/clock, real VirtualHost and DO storage transactions.
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createPassiveBody } from "../src/passive-body.js";
import { rosterFixture } from "../test/fixtures/host-roster-fixture.mjs";

const body = { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false },
  equipment: { weapon: "gun", mode: "combat", primaryOwned: true,
    secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true } };
export class HostRuntimeFixture {
  constructor(ctx) { this.ctx = ctx; this.fixture = null; }
  async fetch(request) {
    const input = await request.json(), { command, now, pairs, budget } = input;
    if (![1, 16, 53].includes(pairs) || budget !== (pairs === 53 ? 64 : 30) * 1024
      || !Number.isSafeInteger(now) || now < 100000 || now > 1000000) return new Response("invalid fixture", { status: 400 });
    if (!this.fixture) this.fixture = rosterFixture(pairs, budget);
    const f = await this.fixture, world = { ...f.mesh, radius: 2.25, height: 2.8 };
    let attemptedWrites = 0, attemptedBytes = 0, passiveMs = 0;
    const storage = { transaction: fn => this.ctx.storage.transaction(tx => fn({
      get: key => tx.get(key), put: async (key, value) => {
        attemptedWrites++; attemptedBytes += new TextEncoder().encode(JSON.stringify(value)).byteLength;
        await tx.put(key, value);
        if (command === "fail-tick") throw Error("injected transaction rollback");
      },
    })) };
    const physics = createPassiveBody({ world: () => world, gravity: 9.8 });
    const host = new VirtualHost({ storage, simulation: f.simulation, clock: () => now,
      sessionAdapter: { stepPassive(m, ms) { passiveMs += ms; return physics(m, ms); } } });
    const claim = i => ({ protocol: SESSION_PROTOCOL, world: f.simulation.version,
      accountId: i + 1, bodyId: `body-${i}`, zone: "outside", body });
    let result, error = null;
    try {
      if (command === "begin") result = await host.begin(input.owner, 120000);
      else if (command === "claim") result = await host.claim(input.owner);
      else if (command === "join") result = await host.sessions(input.ticket, [], (r, at) =>
        Array.from({ length: host.maxSessions + 1 }, (_, i) => r.connect(claim(i), at)));
      else if (command === "connect") result = await host.connect(input.ticket, input.liveTokens, claim(input.index));
      else if (command === "disconnect") result = await host.sessions(input.ticket, input.liveTokens, (r, at) => {
        for (const ref of input.refs) r.disconnect(ref, at); return true;
      });
      else if (command === "tick" || command === "fail-tick") result = await host.tick(input.ticket, input.liveTokens);
      else if (command !== "inspect") throw Error("invalid fixture command");
    } catch (e) { error = e.message; }
    const saved = await this.ctx.storage.get(HOST.key), bytes = saved ? new TextEncoder().encode(JSON.stringify(saved)).byteLength : 0;
    // Bounded fixture payloads only. No credentials, account bindings or upstream fetch.
    return Response.json({ result, error, attemptedWrites, attemptedBytes, passiveMs, checkpointBytes: bytes,
      saved: command === "inspect" ? saved : undefined, retainedSlots: host.maxSessions });
  }
}

export default { fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (!/^\/profile-(1|16|53)$/.test(path) || request.method !== "POST") return new Response("fixture only", { status: 404 });
  return env.HOST.get(env.HOST.idFromName(path)).fetch(request);
} };
