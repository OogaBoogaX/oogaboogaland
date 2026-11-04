import { test } from "node:test";
import assert from "node:assert/strict";
import { createNpcRandom, restoreNpcRandom } from "../src/npc-random.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";

// Recorded from the unmodified math.js at 17659dd before extraction. These
// integer outputs are an independent compatibility fixture, not a second RNG.
const vectors = [
  [0, [1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985, 2642484575, 2787370982]],
  [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403, 1207330352, 2632122864, 3095568220]],
  [2147483648, [3524353788, 1924613307, 3365584844, 2199219949, 3602660773, 1806097541, 3841765038, 4005884542]],
  [4294967295, [3850105811, 813802916, 3073704848, 4054706436, 3630262831, 2315588663, 2922715533, 2042566601]],
  [1351747683, [2696932000, 83220400, 534322570, 1745078227, 765400757, 1492939317, 4243237423, 5487593]],
];

test("NPC RNG preserves browser draws and each actor's future choices across checkpoints", () => {
  assert.equal(typeof window, "undefined");
  assert.equal(globalThis.BL.math.fnv1a("clanker/fixture"), vectors[4][0]);
  for (const [seed, expected] of vectors) {
    const legacy = globalThis.BL.math.mulberry32(seed), actual = createNpcRandom(seed);
    assert.equal(legacy.capture, undefined, "existing callers do not allocate checkpoint closures");
    assert.deepEqual(expected.map(() => legacy() * 4294967296), expected);
    assert.deepEqual(expected.map(() => actual.next() * 4294967296), expected);
    for (const prefix of [0, 1, 37, 1000]) {
      const original = createNpcRandom(seed), other = createNpcRandom(seed + (seed < 0xffffffff ? 1 : -1));
      for (let i = 0; i < prefix; i++) original.next();
      const saved = JSON.parse(JSON.stringify(original.capture()));
      assert.deepEqual(original.capture(), saved, "capture does not draw");
      assert.ok(Buffer.byteLength(JSON.stringify(saved)) <= 25);
      const restarted = restoreNpcRandom(saved);
      saved.word = 0;
      for (let i = 0; i < 200; i++) {
        other.next(); other.next();
        assert.equal(restarted.next(), original.next(), "another actor cannot advance this stream");
      }
    }
  }
});

test("NPC RNG refuses unknown versions and lossy or unbounded words", () => {
  for (const seed of [-1, 0x100000000, 0.1, NaN, Infinity, "1", null, undefined]) {
    assert.throws(() => createNpcRandom(seed), /seed/);
    assert.throws(() => restoreNpcRandom({ v: 1, word: seed }), /checkpoint/);
  }
  for (const saved of [null, [], {}, { v: 2, word: 1 }, { word: 1 }, { v: 1, word: 1, draws: 1 },
    Object.assign(Object.create({ v: 1 }), { word: 1, padding: 0 })]) {
    assert.throws(() => restoreNpcRandom(saved), /checkpoint/);
  }
});

test("VirtualHost retries and owner recovery preserve committed NPC random choices", async () => {
  function harness() {
    let value, now = 100000, fail = false;
    const storage = { async transaction(fn) {
      let next = structuredClone(value);
      const result = await fn({ get: async () => structuredClone(next), put: async (key, v) => { next = structuredClone(v); } });
      if (fail) { fail = false; throw new Error("injected commit failure"); }
      value = next; return result;
    } };
    function host() {
      const simulation = {
        version: "real-rng-test-1", checkpointBytes: 30 * 1024,
        // Authored choice fixture, not a replacement Clanker state machine.
        initial: () => ({ rng: createNpcRandom(vectors[4][0]).capture(), steps: 0, choice: 0 }),
        validate(s) { restoreNpcRandom(s.rng); return Number.isSafeInteger(s.steps) && s.steps >= 0
          && Number.isInteger(s.choice) && s.choice >= 0 && s.choice < 8; },
        step(s) {
          const rng = restoreNpcRandom(s.rng);
          s.choice = Math.floor(rng.next() * 8);
          if (s.choice > 3) rng.next();
          s.rng = rng.capture(); s.steps++;
        },
        project: () => ({ npcs: [], hub: { pile: 0 } }),
        npcFor: () => null, handoff: () => false,
      };
      return new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now });
    }
    return { host, at: n => { now = n; }, read: () => structuredClone(value), fail: () => { fail = true; } };
  }
  const a = harness(), b = harness(), uninterrupted = a.host(), original = b.host();
  const ta = await uninterrupted.begin("a", 60000), tb = await original.begin("b", 60000);
  a.at(101000); b.at(101000);
  const before = b.read(); b.fail();
  await assert.rejects(original.tick(tb), /injected commit failure/);
  assert.deepEqual(b.read(), before, "a rolled-back step cannot consume persisted draws");
  await original.tick(tb); await uninterrupted.tick(ta);
  assert.deepEqual(b.read().simulation, a.read().simulation);
  for (let now = 102000; now <= 111000; now += 1000) { a.at(now); await uninterrupted.tick(ta); }
  b.at(111000); const resumed = b.host(), ticket = await resumed.claim("recovered");
  for (let i = 0; i < 5; i++) await resumed.tick(ticket);
  assert.deepEqual(b.read().simulation, a.read().simulation);
  a.at(112000); b.at(112000); await uninterrupted.tick(ta); await resumed.tick(ticket);
  assert.deepEqual(b.read().simulation, a.read().simulation, "future variable-count draws remain identical");
  assert.ok(Buffer.byteLength(JSON.stringify(b.read())) < HOST.checkpointBytes);
});
