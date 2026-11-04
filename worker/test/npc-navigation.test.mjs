import { test } from "node:test";
import assert from "node:assert/strict";
import { createNpcNavigation } from "../src/npc-navigation.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";

// Authored test geometry isolates the existing routing algorithm. This is not the hub's
// terrain/collision bundle and its recorded positions do not pretend to implement Ooga AI.
const island = () => ({ path: { version: 4, debug: { active: false, ringCenterRadius: 0 },
  centerlines: [[{ x: 0, z: -5 }, { x: 0, z: 5 }]] }, surfaceAt: () => 0, isPath: () => true });
const actor = state => ({ root: { position: { x: 0, y: 0, z: -4 } }, baseY: 0,
  bodyHeight: 2, bedTravel: { mode: "" }, pathing: state });
const make = world => createNpcNavigation({ island: world, walkable: () => true });

test("real surface routing loads without a DOM and retains its exact lane and progress through restore", () => {
  assert.equal(typeof window, "undefined");
  const world = island(), original = make(world), a = actor(original.createState());
  original.target(a, 0, 4);
  assert.ok(a.pathing.count > 0);
  const checkpoint = JSON.parse(JSON.stringify(original.capture(a.pathing)));
  const restarted = make(world), b = actor(restarted.restore(checkpoint));
  assert.deepEqual(restarted.capture(b.pathing), checkpoint);
  assert.equal(original.buffers, restarted.buffers);
  for (const z of [-3.7, -2.8, -0.5, 0.25, 2, 3.8]) {
    a.root.position.z = b.root.position.z = z;
    original.target(a, 0, 4); restarted.target(b, 0, 4);
    assert.deepEqual(restarted.capture(b.pathing), original.capture(a.pathing));
  }
  assert.equal(b.pathing.plans, 1, "restore does not erase route progress or trigger a replan");
  checkpoint.laneX[0] = 999;
  assert.notEqual(b.pathing.laneX[0], 999, "checkpoint arrays do not alias live routing");
});

test("route restore rejects incompatible topology, invalid cursors and oversized/malformed paths", () => {
  const world = island(), routes = make(world), a = actor(routes.createState());
  const initial = routes.capture(a.pathing);
  assert.equal(routes.restore(initial).count, 0);
  assert.ok(Number.isNaN(routes.restore(initial).tx));
  routes.target(a, 0, 4);
  const saved = routes.capture(a.pathing);
  for (const patch of [{ v: 2 }, { pathVersion: 5 }, { version: -1 }, { index: saved.count + 1 },
    { count: routes.capacity + 1 }, { laneX: [] }, { targetX: Infinity }, { tx: "0" },
    { route: saved.route.map(() => routes.capacity) }, { extra: true }]) {
    assert.throws(() => routes.restore({ ...saved, ...patch }), /checkpoint|node/);
  }
  const sparse = saved.laneX.slice(); delete sparse[0];
  assert.throws(() => routes.restore({ ...saved, laneX: sparse }), /checkpoint/);
  world.path.version++;
  assert.throws(() => make(world).restore(saved), /checkpoint/);
});

test("VirtualHost commits the real route cursor and continues it identically after owner recovery", async () => {
  function harness() {
    let value, now = 100000;
    const storage = { async transaction(fn) {
      let next = structuredClone(value);
      const result = await fn({ get: async () => structuredClone(next), put: async (key, v) => { next = structuredClone(v); } });
      value = next; return result;
    } };
    function host() {
      const paths = make(island());
      const simulation = {
        version: "real-navigation-test-1",
        initial: () => ({ cursor: paths.capture(paths.createState()), steps: 0 }),
        validate(s) { paths.restore(s.cursor); return Number.isSafeInteger(s.steps) && s.steps >= 0; },
        step(s) {
          const a = actor(paths.restore(s.cursor));
          a.root.position.z = Math.min(3.8, -4 + s.steps * 0.03);
          paths.target(a, 0, 4); s.steps++; s.cursor = paths.capture(a.pathing);
        },
        project: () => ({ npcs: [], hub: { pile: 0 } }),
        npcFor: () => null, handoff: () => false,
      };
      return new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now });
    }
    return { host, at: n => { now = n; }, read: () => structuredClone(value) };
  }
  const a = harness(), b = harness(), running = a.host(), original = b.host();
  const ta = await running.begin("a", 60000), tb = await original.begin("b", 60000);
  a.at(101000); b.at(101000); await running.tick(ta); await original.tick(tb);
  for (let now = 102000; now <= 111000; now += 1000) { a.at(now); await running.tick(ta); }
  b.at(111000); const resumed = b.host(), ticket = await resumed.claim("recovered");
  for (let i = 0; i < 5; i++) await resumed.tick(ticket);
  assert.deepEqual(b.read().simulation, a.read().simulation);
  assert.equal(b.read().simulation.cursor.plans, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(b.read())) < HOST.checkpointBytes);
});
