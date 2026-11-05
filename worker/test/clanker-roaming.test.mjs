import { test } from "node:test";
import assert from "node:assert/strict";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";
import { createClankerRoamingCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { VirtualHost } from "../src/virtual-host.js";
import { roamingSimulation } from "../eval/clanker-roaming-simulation.mjs";
import { createNpcPose } from "../src/npc-pose.js";
const world = "roaming-recovery-fixture-1";
const make = (count = 3, spacious = false, start = true) => {
  const f = clankerController({ count, spacious, checkpointRandom: true, checkpointProfile: "roaming-1", start: false });
  const codec = createClankerRoamingCheckpoint(f.sim, world, f.B.clankerState);
  if (start) f.start();
  return { ...f, codec };
};
const persist = state => JSON.parse(JSON.stringify(state));

test("actual Clanker roaming, paths, peer bindings, RNG and rigs continue across fresh controller restarts", () => {
  const original = make(); let recovered = make(3, false, false);
  try {
    recovered.codec.restore(persist(original.codec.capture()));
    for (let frame = 0; frame < 64; frame++) {
      original.step(); recovered.step();
      assert.deepEqual(recovered.codec.capture(), original.codec.capture(), `frame ${frame}`);
      if (frame % 8 === 7) {
        const saved = persist(recovered.codec.capture()); recovered.dispose(); recovered = make(3, false, false);
        recovered.codec.restore(saved);
        assert.deepEqual(recovered.codec.capture(), saved, "restart retains exact committed state before advancing");
        for (const e of recovered.sim.list) assert.equal(e.motion.supportEntry, e, "self reference binds to the new body");
      }
    }
    assert.ok(original.sim.stats().elapsed > 15);
    assert.ok(original.sim.list.some(e => e.roam.plans || e.goalX !== e.root.position.x));
  } finally { original.dispose(); recovered.dispose(); }
});

test("roaming restore rejects changed world baselines and malformed state before use", () => {
  const source = make(), pack = createCheckpointPack(64 * 1024, { intern: true });
  try {
    for (let i = 0; i < 8; i++) source.step();
    const saved = source.codec.capture();
    for (const corrupt of [s => { s.world = "other"; }, s => { s.baseline = "wrong"; },
      s => { s.actors[0][0] = -1; }, s => { s.actors[0].push(9999, false); },
      s => { s.actors[0].push(0, [0, 99]); }, s => { s.buffers.ids.reverse(); }]) {
      const target = make(3, false, false);
      try {
        const state = pack.unpack(saved); corrupt(state);
        assert.throws(() => target.codec.restore(pack.pack(state)));
        assert.equal(target.sim.stats().elapsed, 0);
      } finally { target.dispose(); }
    }
    const differentWorld = make(3, true, false);
    try { assert.throws(() => differentWorld.codec.restore(saved)); } finally { differentWorld.dispose(); }
    const target = make(3, false, false);
    try {
      target.codec.restore(saved);
      assert.throws(() => target.codec.restore(saved), "restoration is only into a fresh controller");
    } finally { target.dispose(); }
    const poisoned = make(3, false, false);
    try {
      const state = pack.unpack(saved); state.clocks[0] = -1;
      assert.throws(() => poisoned.codec.restore(pack.pack(state)));
      assert.throws(() => poisoned.codec.capture(), "failed application must be discarded");
    } finally { poisoned.dispose(); }
  } finally { source.dispose(); }
});

test("roaming profile never silently captures player ownership, changed layout or combat", () => {
  const ordinary = clankerController({ checkpointRandom: true });
  try { assert.equal(ordinary.sim.roamingCheckpoint, null); assert.throws(() => createClankerRoamingCheckpoint(ordinary.sim, world, ordinary.B.clankerState)); }
  finally { ordinary.dispose(); }
  assert.throws(() => clankerController({ checkpointRandom: true, checkpointProfile: "unknown-version" }), /unsupported/);
  for (const mutate of [f => { f.sim.possess(f.sim.list[0]); }, f => { f.sim.setCombatEnabled(true); },
    f => { f.sim.list[0].owner.state = "working"; }, f => { f.sim.list[0].unexpectedState = 1; },
    f => { f.sim.list[0].index = 9; }, f => { f.sim.list[0].goalX = NaN; },
    f => { f.sim.list[0].roam.count = 5; }]) {
    const f = make(); try { mutate(f); assert.throws(() => f.codec.capture()); } finally { f.dispose(); }
  }
  const f = make(3, false, false);
  try {
    const before = f.sim.roamingCheckpoint.capture();
    const sparse = before.slice(); delete sparse[1];
    assert.throws(() => f.sim.roamingCheckpoint.restore(sparse));
    assert.deepEqual(f.sim.roamingCheckpoint.capture(), before);
  } finally { f.dispose(); }
});

test("VirtualHost rollback and replacement resume the actual roaming controller from committed state", async () => {
  const reference = make(2), initial = reference.codec.capture();
  let data, now = 100000, failWrite = false;
  const storage = { async transaction(fn) {
    let pending = structuredClone(data);
    const out = await fn({ get: async () => structuredClone(pending), put: async (_, value) => { pending = structuredClone(value); } });
    if (failWrite) { failWrite = false; throw Error("roaming fixture write failed"); }
    data = pending; return out;
  } };
  const withController = (saved, fn) => {
    const f = make(2, false, false); try { f.codec.restore(saved); return fn(f); } finally { f.dispose(); }
  };
  const simulation = { version: world, checkpointBytes: 64 * 1024,
    initial: () => structuredClone(initial), validate: s => withController(s, () => true),
    step(s) {
      const next = withController(s, f => { f.step(); return f.codec.capture(); });
      for (const key of Object.keys(s)) delete s[key]; Object.assign(s, next);
    },
    // This test is controller/host recovery only; no presentation or body claim.
    project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  const makeHost = () => new VirtualHost({ storage, simulation, clock: () => now,
    sessionAdapter: { stepPassive: m => m, validateOccupancy: () => true } });
  try {
    const first = makeHost(), ticket = await first.begin("original", 60000);
    now = 100750; const before = structuredClone(data); failWrite = true;
    await assert.rejects(first.tick(ticket), /roaming fixture write failed/);
    assert.deepEqual(data, before);
    await first.tick(ticket);
    for (let i = 0; i < 3; i++) reference.step();
    assert.deepEqual(data.simulation, reference.codec.capture());
    now = 111000; const replacement = makeHost(), resumed = await replacement.claim("replacement");
    for (let i = 0; i < 6; i++) await replacement.tick(resumed);
    for (let i = 3; i < 44; i++) reference.step();
    assert.deepEqual(data.simulation, reference.codec.capture(), "fixed-step catch-up restores full supported controller state");
    await assert.rejects(first.tick(ticket), /owner|lease|fence|stale/);
  } finally { reference.dispose(); }
});

test("finite runtime adapter projects exact uninterrupted roaming and discards speculative state", () => {
  const reference = clankerController({ count: 3, checkpointRandom: true, checkpointProfile: "roaming-1", start: false });
  try {
    const adapter = roamingSimulation(reference.B, 3), saved = adapter.initial();
    const codec = createClankerRoamingCheckpoint(reference.sim, adapter.version, reference.B.clankerState);
    codec.restore(persist(saved));
    const empty = createNpcPose(123, 1);
    for (let i = 0; i < 24; i++) {
      const speculative = persist(saved); adapter.step(speculative, 250);
      assert.deepEqual(saved, codec.capture(), "discarded speculative work did not mutate committed input");
      adapter.step(saved, 250); reference.step();
      assert.deepEqual(saved, codec.capture(), "retry matches uninterrupted actual controller");
      if (i % 8 !== 7) continue;
      assert.equal(adapter.validate(saved), true);
      const expected = globalThis.BL.npcPosePacket.pack(adapter.version, empty([]), reference.sim.list.map(e => ({
        index: e.index, pose: e.gorilla.createPoseProjector(adapter.version).capture(),
      })));
      assert.deepEqual(adapter.poses(saved, "mixed-1"), expected, "packet projects actual committed rig transforms");
      const projection = adapter.project(saved);
      assert.equal(projection.npcs.length, reference.sim.stats().active);
      for (const npc of projection.npcs) {
        const entry = reference.sim.list[Number(npc.id.split("-")[1])];
        assert.deepEqual([npc.x, npc.y, npc.z], [entry.root.position.x, entry.root.position.y, entry.root.position.z]);
      }
    }
    const before = persist(saved);
    assert.throws(() => adapter.step(saved, 500), /fixed host step/);
    assert.throws(() => adapter.poses(saved, "ooga-1"), /explicit mixed/);
    assert.deepEqual(saved, before);
    assert.equal(adapter.npcFor(saved, "fixture-0"), null);
    assert.equal(adapter.handoff(saved, {}), false);
    const wrongWorld = roamingSimulation(reference.B, 3, true);
    assert.throws(() => wrongWorld.validate(saved));
    assert.equal(adapter.validate(saved), true, "failed other-world restore cannot poison a later operation");
  } finally { reference.dispose(); }
});

test("roaming transaction scopes bound reconstruction, reject mutation and isolate failed writes and retries", async () => {
  const reference = clankerController({ count: 3, checkpointRandom: true, checkpointProfile: "roaming-1", start: false });
  const B = reference.B, create = B.clankers.create; let constructions = 0, failStep = false;
  B.clankers.create = (...args) => {
    constructions++; const sim = create(...args), update = sim.update;
    sim.update = (...a) => {
      const result = update(...a);
      if (failStep) { failStep = false; throw Error("failed after private mutation"); }
      return result;
    };
    return sim;
  };
  try {
    const adapter = roamingSimulation(B, 3), initial = adapter.initial();
    const codec = createClankerRoamingCheckpoint(reference.sim, adapter.version, B.clankerState);
    codec.restore(persist(initial));
    const scope = adapter.forTransaction(), saved = persist(initial), before = constructions;
    Object.freeze(saved.data); // A shallow caller freeze must not leave mutable descendants.
    assert.equal(scope.validate(saved), true);
    const visit = value => { if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(visit); } };
    Object.values(saved).forEach(visit);
    assert.throws(() => { saved.data[0] = null; }, TypeError);
    for (let i = 0; i < 8; i++) {
      scope.step(saved, 250); reference.step();
      scope.validate(saved); scope.project(saved); scope.poses(saved, "mixed-1");
      assert.deepEqual(saved, codec.capture());
    }
    assert.equal(constructions - before, 1, "eight-step recovery must not allocate eight full controllers");
    // Replacing DTO fields on the same object must not reuse a newer private body.
    Object.assign(saved, persist(initial));
    assert.equal(scope.validate(saved), true);
    assert.deepEqual(scope.poses(saved, "mixed-1"), adapter.poses(initial, "mixed-1"));
    saved.v = -1;
    assert.throws(() => scope.validate(saved));
    assert.throws(() => scope.npcFor(saved, "fixture-0"), /closed/);
    scope.dispose(); scope.dispose();
    const failedScope = adapter.forTransaction(), unchanged = persist(initial);
    failedScope.validate(unchanged); failStep = true;
    assert.throws(() => failedScope.step(unchanged, 250), /failed after private mutation/);
    assert.deepEqual(unchanged, initial, "failed private mutation must not change the committed DTO");
    assert.throws(() => failedScope.poses(unchanged, "mixed-1"), /closed/);
    failedScope.dispose();

    let data, now = 100000, fail = false, retry = false;
    const scopes = [], factory = adapter.forTransaction;
    adapter.forTransaction = () => { const s = factory(); scopes.push(s); return s; };
    const storage = { async transaction(fn) {
      const attempt = async () => {
        let pending = structuredClone(data);
        const result = await fn({ get: async () => structuredClone(pending), put: async (_, value) => { pending = structuredClone(value); } });
        return { pending, result };
      };
      if (retry) { retry = false; await attempt(); } // Throw away a completed optimistic attempt.
      const out = await attempt();
      if (fail) { fail = false; throw Error("failed actual adapter commit"); }
      data = out.pending; return out.result;
    } };
    // Fix initial state so the independent uninterrupted controller is the oracle.
    const initialFactory = adapter.forTransaction;
    adapter.forTransaction = () => { const s = initialFactory(); s.initial = () => persist(initial); return s; };
    const host = () => new VirtualHost({ storage, simulation: adapter, clock: () => now,
      sessionAdapter: { stepPassive: m => m, validateOccupancy: () => true } });
    const first = host(), ticket = await first.begin("original", 60000);
    const committed = persist(data); now += 2000; fail = true;
    await assert.rejects(first.tick(ticket), /failed actual adapter commit/);
    assert.deepEqual(data, committed);
    retry = true; await first.tick(ticket);
    assert.deepEqual(data.simulation, codec.capture(), "failed commit and discarded retry cannot double-step the AI");
    now += 10001; const second = host(), replacement = await second.claim("replacement");
    for (let i = 0; i < 5; i++) await second.tick(replacement);
    for (let i = 0; i < 40; i++) reference.step();
    assert.deepEqual(data.simulation, codec.capture());
    await assert.rejects(first.tick(ticket), /fenced/);
    for (const s of scopes) assert.throws(() => s.validate(initial), /closed/);
  } finally { B.clankers.create = create; reference.dispose(); }
});
