import { test } from "node:test";
import assert from "node:assert/strict";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";
import { createClankerRoamingCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { VirtualHost } from "../src/virtual-host.js";
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
