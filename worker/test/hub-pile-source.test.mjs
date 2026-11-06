// The private v2 pile intake: exact aggregate validation, the rendered level, the
// update against retained/pending inputs, and the finite Hub reader's halt on a
// snapshot that can't stand as the current pile. Every value is synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { validateHubPile, hubPileLevel, HUB_PILE_BYTES, HUB_PILE_NODES } from "../src/hub-pile-source.js";
import { hubPileUpdate } from "../src/hub-service-sources.js";
import { hubPileMaximum } from "../src/ooga-crew.js";
import { createHubWorldState } from "../src/hub-world-state.js";
import { HOST } from "../src/virtual-host.js";

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1, 12);
const known = (fields = {}) => ({ v: 2, type: "pile", bananas: 4321.5, at: T0 - 30 * DAY, eatPerHour: 0, revision: 7,
  basis: "credits", cutover: "done", reconciliation: "current", uncertain: { sats: 0, bananas: 0 }, ...fields });
const PENDING = { v: 2, type: "pile", bananas: null, at: null, eatPerHour: 0, revision: 0, basis: "credits",
  cutover: "pending", reconciliation: "review", uncertain: null };
const REVIEW = { ...PENDING, revision: 9, cutover: "done" };
const code = (fn) => { try { fn(); } catch (error) { return error.code ?? "uncoded"; } return "accepted"; };
const nodes = (v) => v !== null && typeof v === "object" ? 1 + Object.values(v).reduce((n, x) => n + nodes(x), 0) : 1;

// The retained checkpoint shape hubPileUpdate reads: simulation inputs v3, state, activity.
function checkpoint({ pile = null, revision = 3, observedAt = T0, pending = null, at = T0 } = {}) {
  return { simulation: { inputs: { v: 3, revision, observedAt, pending },
    state: { at, level: 0, tint: 0, inventory: [], assignments: [], pile }, activity: { v: 1, rows: [] } } };
}
const pendingInput = (pile, observedAt, revision = 4) => ({ acceptedAt: observedAt, effectiveAt: observedAt,
  input: { v: 1, kind: "hub-state", observedAt, revision, state: { level: 0, tint: 0, inventory: [], assignments: [], pile }, activity: { v: 1, rows: [] } } });

test("v2 aggregates validate exactly: keys, types, ranges and null consistency", () => {
  for (const value of [known(), PENDING, REVIEW, known({ bananas: 0, uncertain: null, reconciliation: "review" }),
    known({ reconciliation: "off" }), known({ reconciliation: "behind", uncertain: { sats: 1000, bananas: 1 } })]) {
    assert.equal(code(() => validateHubPile(value)), "accepted", JSON.stringify(value));
  }
  const { uncertain, ...missing } = known();
  for (const [value, expected] of [
    [missing, "invalid"], [{ ...known(), extra: 1 }, "invalid"],
    [{ v: 1, type: "pile", bananas: 1, at: T0, eatPerHour: 0 }, "legacy"], [known({ v: 3 }), "invalid"],
    [known({ type: "tally" }), "invalid"], [known({ eatPerHour: 1 }), "invalid"], [known({ basis: "wallet" }), "invalid"],
    [known({ revision: -1 }), "invalid"], [known({ revision: 1.5 }), "invalid"], [known({ revision: "7" }), "invalid"],
    [known({ cutover: "later" }), "invalid"], [known({ reconciliation: "fine" }), "invalid"],
    [known({ bananas: -0.001 }), "invalid"], [known({ bananas: Number.MAX_SAFE_INTEGER / 1000 + 1 }), "invalid"],
    [known({ bananas: "1" }), "invalid"], [known({ at: 0 }), "invalid"], [known({ at: 1.5 }), "invalid"],
    [known({ at: null }), "invalid"], [known({ cutover: "pending" }), "invalid"],
    [{ ...PENDING, at: T0 }, "invalid"], [{ ...PENDING, reconciliation: "off" }, "invalid"],
    [{ ...PENDING, uncertain: { sats: 0, bananas: 0 } }, "invalid"],
    [known({ uncertain: null }), "invalid"], [known({ uncertain: { sats: 0 } }), "invalid"],
    [known({ uncertain: { sats: 0, bananas: 0, milli: 0 } }), "invalid"], [known({ uncertain: { sats: -1, bananas: 0 } }), "invalid"],
    [known({ uncertain: { sats: 0.5, bananas: 0 } }), "invalid"], [known({ uncertain: { sats: 0, bananas: -1 } }), "invalid"],
    [null, "invalid"], [[], "invalid"],
  ]) assert.equal(code(() => validateHubPile(value)), expected, JSON.stringify(value));
  // Non-finite and non-JSON values never reach the field checks.
  assert.throws(() => validateHubPile(known({ bananas: NaN })));
  assert.throws(() => validateHubPile(known({ bananas: Infinity })));
  // A canonical copy in the producer's order, sharing nothing with the input.
  const input = { uncertain: { bananas: 1, sats: 1000 }, reconciliation: "review", cutover: "done", basis: "credits",
    revision: 7, eatPerHour: 0, at: T0, bananas: 2, type: "pile", v: 2 };
  const copy = validateHubPile(input);
  assert.deepEqual(Object.keys(copy), Object.keys(known()));
  assert.deepEqual(Object.keys(copy.uncertain), ["sats", "bananas"]);
  assert.notEqual(copy.uncertain, input.uncertain);
});

test("the encoded bound is the measured worst case, in bytes and nodes", () => {
  const long = 0.0000012345678901234567;
  assert.equal(JSON.stringify(long).length, 24, "the longest number in range");
  const worst = known({ bananas: long, at: 8640000000000000, revision: Number.MAX_SAFE_INTEGER,
    uncertain: { sats: Number.MAX_SAFE_INTEGER, bananas: long } });
  assert.equal(Buffer.byteLength(JSON.stringify(worst)), HUB_PILE_BYTES);
  assert.equal(nodes(worst), HUB_PILE_NODES);
  assert.equal(code(() => validateHubPile(worst)), "accepted");
  assert.ok(Buffer.byteLength(JSON.stringify(PENDING)) < HUB_PILE_BYTES);
  // Anything larger fails the bound before any field is read.
  assert.throws(() => validateHubPile({ ...worst, reconciliation: "x".repeat(HUB_PILE_BYTES) }), /state size/);
  assert.throws(() => validateHubPile({ ...worst, uncertain: { sats: 0, bananas: 0, a: 0 } }), /state complexity/);
});

test("unknown is never a level, and a real zero is", () => {
  for (const unknown of [PENDING, REVIEW]) {
    assert.throws(() => hubPileLevel(unknown, T0), /unknown private pile level/);
    assert.deepEqual(hubPileUpdate(checkpoint(), unknown, T0), { status: "unknown", input: null });
  }
  assert.throws(() => hubPileLevel(null, T0));
  assert.throws(() => hubPileLevel({ v: 1, bananas: 5, at: T0, eatPerHour: 0 }, T0), /unknown/);
  const zero = known({ bananas: 0 });
  assert.equal(hubPileLevel(zero, T0), 0);
  const { status, input } = hubPileUpdate(checkpoint(), zero, T0);
  assert.equal(status, "accepted");
  assert.equal(input.state.level, 0);
  assert.deepEqual(input.state.pile, zero);
});

test("an old accounting time is still valid later: no decay, floored and capped", () => {
  const old = known({ bananas: 12.9, at: T0 - 300 * DAY });
  for (const later of [T0, T0 + 365 * DAY]) assert.equal(hubPileLevel(old, later), 12);
  assert.equal(hubPileLevel(known({ bananas: hubPileMaximum * 10 }), T0), hubPileMaximum);
  assert.throws(() => hubPileLevel(old, old.at - 1), /future/);
  assert.throws(() => hubPileLevel(old, 1.5), /future/);
  const { status, input } = hubPileUpdate(checkpoint(), old, T0);
  assert.equal(status, "accepted");
  assert.deepEqual([input.state.level, input.state.pile.at, input.observedAt, input.revision], [12, old.at, T0, 4]);
  // A snapshot whose accounting time is after the host's observation is refused.
  assert.equal(code(() => hubPileUpdate(checkpoint(), known({ at: T0 + 1 }), T0)), "invalid");
});

test("the same revision may change health and uncertainty, never its accounting", () => {
  const held = known();
  const saved = checkpoint({ pile: held });
  assert.deepEqual(hubPileUpdate(saved, known(), T0 + 1), { status: "unchanged", input: null }, "identical aggregate coalesces");
  for (const change of [{ reconciliation: "behind" }, { reconciliation: "review", uncertain: { sats: 1000, bananas: 1 } },
    { reconciliation: "review", uncertain: null }]) {
    const { status, input } = hubPileUpdate(saved, known(change), T0 + 1);
    assert.equal(status, "accepted", JSON.stringify(change));
    assert.deepEqual(input.state.pile, known(change), "every v2 field kept");
  }
  for (const conflict of [known({ bananas: 4321.6 }), known({ at: held.at + 1 }), { ...REVIEW, revision: held.revision }]) {
    assert.equal(code(() => hubPileUpdate(saved, conflict, T0 + 1)), "conflict", JSON.stringify(conflict));
  }
});

test("lower revisions are ignored; a higher one may lower the level, as a reversal does", () => {
  const saved = checkpoint({ pile: known({ revision: 7, bananas: 50 }) });
  assert.deepEqual(hubPileUpdate(saved, known({ revision: 6, bananas: 60 }), T0 + 1), { status: "stale", input: null });
  const { status, input } = hubPileUpdate(saved, known({ revision: 8, bananas: 49 }), T0 + 1);
  assert.deepEqual([status, input.state.level, input.state.pile.revision], ["accepted", 49, 8]);
  // An equal level at a new revision is not coalesced away.
  assert.equal(hubPileUpdate(saved, known({ revision: 8, bananas: 50 }), T0 + 1).status, "accepted");
  // A higher revision that lost its level is unknown, never queued.
  assert.deepEqual(hubPileUpdate(saved, { ...REVIEW, revision: 8 }, T0 + 1), { status: "unknown", input: null });
});

test("the host's observation order holds against accepted and pending inputs", () => {
  assert.deepEqual(hubPileUpdate(checkpoint({ observedAt: T0 + 10 }), known(), T0 + 5), { status: "stale", input: null });
  // A pending input is the base: its pile, revision and observation.
  const pending = pendingInput(known({ revision: 7 }), T0 + 20);
  const saved = checkpoint({ observedAt: T0 + 10, pending });
  assert.deepEqual(hubPileUpdate(saved, known({ revision: 8 }), T0 + 15), { status: "stale", input: null });
  const { status, input } = hubPileUpdate(saved, known({ revision: 8 }), T0 + 20);
  assert.deepEqual([status, input.revision, input.observedAt], ["accepted", 5, T0 + 20]);
  assert.equal(hubPileUpdate(saved, known({ revision: 6 }), T0 + 30).status, "stale", "the pending pile's revision counts");
  // The world's own clock past the observation: the checkpoint can't take it.
  assert.equal(code(() => hubPileUpdate(checkpoint({ at: T0 + 100 }), known(), T0 + 50)), "checkpoint");
  assert.equal(code(() => hubPileUpdate({}, known(), T0)), "checkpoint");
  // A decaying v1 pile left in a checkpoint is never compared or decayed.
  const legacy = checkpoint({ pile: { v: 1, type: "pile", bananas: 5, at: T0, eatPerHour: 1 } });
  assert.equal(code(() => hubPileUpdate(legacy, known(), T0 + 1)), "legacy");
});

// The finite reader, through the real HubVirtualWorld and its real lifecycle base.
// Only the runtime base class, the full Hub host and the activity feed are stood in.
const stub = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { shortCircuit: true,
      url: stub("export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }") };
    if (context.parentURL?.endsWith("/src/hub-virtual-world.js")) {
      if (specifier === "./hub-host.js") return { shortCircuit: true, url: stub(
        "export const HUB_CONFIGURATION_KEY = 'hub-configuration-fixture'; export const createHubHost = () => {};" +
        "export const openHubHost = async () => globalThis.__hubPileFixtureHost;") };
      if (specifier === "./contributor-policy.js") return { shortCircuit: true,
        url: stub("export const readContributorSnapshot = () => Promise.reject(Error('activity feed offline in this fixture'));") };
    }
    return next(specifier, context);
  },
});
const { HubVirtualWorld, PILE_SOURCE } = await import("../src/hub-virtual-world.js");

// receipt is the host's worldInput status; onPut runs before each storage write.
function fixtureWorld(pileSnapshot, saved, { receipt = "accepted", onPut = () => {} } = {}) {
  const data = new Map(), waits = [], inputs = [];
  let world;
  const storage = { sql: {}, get: async (k) => structuredClone(data.get(k)),
    put: async (k, v) => { await onPut(k, world); data.set(k, structuredClone(v)); },
    delete: async (k) => data.delete(k), deleteAlarm: async () => {},
    transaction: async (fn) => fn({ get: async (k) => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); } }) };
  const until = Date.now() + HOST.maxRunMs - 1000;
  globalThis.__hubPileFixtureHost = { storage, simulation: { playerSpawn() {}, poses() {} },
    worldRunState: async () => ({ canPublish: true, status: "running", publicationProtocol: 1, runUntil: until }),
    // The host's own receipt shape: only 'accepted' saves the input.
    worldInput: async (ticket, input) => { inputs.push(input); return { status: receipt, revision: 1, world: ticket.world, epoch: ticket.fence }; },
    read: () => structuredClone(saved ?? checkpoint({ observedAt: Date.now() - 1000, at: Date.now() - 1000 })) };
  const env = { VIRTUAL_HOST_PREVIEW: "1", VIRTUAL_HOST_BODY_PREVIEW: "1", VIRTUAL_HOST_MOVEMENT_PREVIEW: "1",
    VIRTUAL_HOST_RUNNER_PREVIEW: "1", ROOM: { getByName: () => ({}) },
    ...(pileSnapshot ? { DONATIONS: { pileSnapshot } } : {}) };
  world = new HubVirtualWorld({ storage, waitUntil: (p) => waits.push(p) }, env);
  const once = async (prepare = () => {}) => {
    await world.setup();
    prepare(world);
    await world.queueServices({ world: "fixture-world", fence: 1, owner: "run-fixture" }, until);
    while (!waits.length) await new Promise((resolve) => setTimeout(resolve, 1));
    await Promise.all(waits);
    // End the fixture run: no minute timer left behind.
    clearTimeout(world.sourceTimer); world.sourceGeneration++;
    return { diagnostic: data.get(PILE_SOURCE) ?? null, fault: data.get("host-world-fault-v1") ?? null,
      halted: world.halted, inputs, stored: JSON.stringify([...data.values()]) };
  };
  return { world, once };
}

test("the finite reader queues a known snapshot as an input and records it as available", async () => {
  const value = known({ at: Date.now() - DAY });
  const { diagnostic, fault, halted, inputs } = await fixtureWorld(async () => value).once();
  assert.deepEqual({ ...diagnostic, observedAt: 0 }, { v: 1, world: "fixture-world", epoch: 1, observedAt: 0,
    status: "available", kind: "accepted", revision: 7 });
  assert.ok(Number.isSafeInteger(diagnostic.observedAt) && diagnostic.observedAt >= value.at);
  assert.deepEqual([fault, halted, inputs.length], [null, false, 1]);
  assert.deepEqual(inputs[0].state.pile, value);
});

test("an unknown, invalid or unreachable snapshot is recorded without its text and halts the run", async () => {
  const secret = "synthetic-transport-detail-never-stored";
  for (const [name, read, status, kind] of [
    ["pending", async () => PENDING, "unknown", "pending"],
    ["review", async () => REVIEW, "unknown", "review"],
    ["legacy v1", async () => ({ v: 1, type: "pile", bananas: 5, at: Date.now(), eatPerHour: 0 }), "unavailable", "legacy"],
    ["invalid", async () => ({ ...known(), extra: secret }), "unavailable", "invalid"],
    ["transport", async () => { throw Error(secret); }, "unavailable", "transport"],
    ["no binding", null, "unavailable", "binding"],
  ]) {
    const { diagnostic, fault, halted, inputs, stored } = await fixtureWorld(read).once();
    assert.deepEqual([diagnostic?.status, diagnostic?.kind], [status, kind], name);
    assert.deepEqual([fault?.phase, halted, inputs.length], ["pile-source", true, 0], `${name}: halted, nothing queued`);
    assert.equal(stored.includes(secret), false, `${name}: no error or source text stored`);
  }
  // A read still in flight from before is a failure too, never a second request.
  const { once } = fixtureWorld(async () => known());
  const { diagnostic, fault } = await once((world) => { world.pileRead = new Promise(() => {}); });
  assert.deepEqual([diagnostic.status, diagnostic.kind, fault?.phase], ["unavailable", "inflight", "pile-source"]);
  // Conflicting accounting at the held revision.
  const held = known({ at: Date.now() - DAY });
  const saved = checkpoint({ pile: held, observedAt: Date.now() - 1000, at: Date.now() - 1000 });
  const conflict = await fixtureWorld(async () => ({ ...held, bananas: held.bananas + 1 }), saved).once();
  assert.deepEqual([conflict.diagnostic.kind, conflict.fault?.phase, conflict.inputs.length], ["conflict", "pile-source", 0]);
});

test("only an input the host accepted or already queued stands", async () => {
  const value = known({ at: Date.now() - DAY });
  const retained = await fixtureWorld(async () => value, undefined, { receipt: "retained" }).once();
  assert.deepEqual([retained.diagnostic.status, retained.diagnostic.kind, retained.fault], ["available", "retained", null]);
  const stale = await fixtureWorld(async () => value, undefined, { receipt: "stale" }).once();
  assert.deepEqual([stale.diagnostic.status, stale.diagnostic.kind, stale.fault?.phase, stale.halted],
    ["unavailable", "input", "pile-source", true], "an input the host refused is never called queued");
});

test("a lower-revision unknown is stale against newer accepted state, never a fault", async () => {
  const held = known({ at: Date.now() - DAY, revision: 7 });
  const saved = checkpoint({ pile: held, observedAt: Date.now() - 1000, at: Date.now() - 1000 });
  for (const older of [{ ...PENDING, revision: 3 }, { ...REVIEW, revision: 6 }]) {
    const { diagnostic, fault, halted, inputs } = await fixtureWorld(async () => older, saved).once();
    assert.deepEqual([diagnostic.status, diagnostic.kind, diagnostic.revision, fault, halted, inputs.length],
      ["available", "stale", older.revision, null, false, 0], JSON.stringify(older));
  }
  // A higher-revision unknown still halts: the newer accounting has no level.
  const newer = await fixtureWorld(async () => ({ ...REVIEW, revision: 8 }), saved).once();
  assert.deepEqual([newer.diagnostic.status, newer.fault?.phase, newer.halted], ["unknown", "pile-source", true]);
});

test("busy: one bounded wait for running flights, one retry, and never called current unqueued", async () => {
  const value = () => known({ at: Date.now() - DAY });
  // A publication that finishes: the retry applies it.
  const finishing = (world) => { world.publication = new Promise((resolve) => setTimeout(resolve, 5)).then(() => { world.publication = null; }); };
  const retried = await fixtureWorld(async () => value()).once(finishing);
  assert.deepEqual([retried.diagnostic.status, retried.diagnostic.kind, retried.inputs.length, retried.fault], ["available", "accepted", 1, null]);
  // Still busy after the retry: recorded as deferred, nothing queued, no fault.
  const stuck = (world) => { world.receiver.active = true; };
  const deferred = await fixtureWorld(async () => value()).once(stuck);
  assert.deepEqual([deferred.diagnostic.status, deferred.diagnostic.kind, deferred.inputs.length, deferred.fault, deferred.halted],
    ["deferred", "busy", 0, null, false]);
  // An unknown read still halts while busy.
  const unknown = await fixtureWorld(async () => PENDING).once(stuck);
  assert.deepEqual([unknown.diagnostic.status, unknown.fault?.phase, unknown.halted], ["unknown", "pile-source", true]);
});

test("a newer run started while the diagnostic is written is never faulted by the old read", async () => {
  const { diagnostic, fault, halted } = await fixtureWorld(async () => PENDING, undefined, {
    onPut: (key, world) => { if (key === PILE_SOURCE) world.sourceGeneration++; },
  }).once();
  assert.equal(diagnostic.status, "unknown", "the old run's own record is written");
  assert.deepEqual([fault, halted], [null, false], "the newer run is not halted or faulted");
});

test("a failed diagnostic write stops local publication and still attempts the durable fault", async () => {
  for (const value of [known({ at: Date.now() - DAY }), PENDING]) {
    const { diagnostic, fault, halted } = await fixtureWorld(async () => value, undefined, {
      onPut: (key) => { if (key === PILE_SOURCE) throw Error("synthetic storage failure"); },
    }).once();
    assert.deepEqual([diagnostic, fault?.phase, halted], [null, "pile-source", true], `revision ${value.revision}`);
  }
  // The durable fault failing too still leaves the run halted locally.
  const { fault, halted } = await fixtureWorld(async () => PENDING, undefined, {
    onPut: (key) => { if (key === PILE_SOURCE || key === "host-world-fault-v1") throw Error("synthetic storage failure"); },
  }).once();
  assert.deepEqual([fault, halted], [null, true]);
});

test("world state captures never share the pile's nested uncertainty", () => {
  const at = Date.now();
  const pile = known({ at: at - DAY, uncertain: { sats: 1000, bananas: 1 }, reconciliation: "review" });
  const state = createHubWorldState({ v: 2, at, elapsed: 0, level: 0, tint: 0, pile, inventory: [], assignments: [] });
  assert.equal(state.world.level, 4321, "the no-decay level from the restored pile");
  pile.uncertain.sats = 1;
  const first = state.capture();
  assert.equal(first.pile.uncertain.sats, 1000, "the initial value was copied");
  first.pile.uncertain.sats = 2; first.pile.uncertain.bananas = 2;
  const second = state.capture();
  assert.notEqual(second.pile.uncertain, first.pile.uncertain);
  assert.deepEqual(second.pile, known({ at: at - DAY, uncertain: { sats: 1000, bananas: 1 }, reconciliation: "review" }));
  // A legacy v1 pile is refused, not migrated.
  assert.throws(() => createHubWorldState({ v: 2, at, elapsed: 0, level: 0, tint: 0,
    pile: { v: 1, type: "pile", bananas: 5, at, eatPerHour: 0 }, inventory: [], assignments: [] }), /legacy/);
});

test("a read superseded by a newer run writes nothing of its own", async () => {
  let fixture;
  fixture = fixtureWorld(async () => { fixture.world.sourceGeneration++; return PENDING; });
  const { diagnostic, fault, halted, inputs } = await fixture.once();
  assert.deepEqual([diagnostic, fault, halted, inputs.length], [null, null, false, 0]);
});

// A cold instance inside a live lease: alarm and Room hints open a fresh runner
// through the real receiver and opener, never through startRun or recoverRun.
const READ_ONLY = ["read", "host.worldRunState", "host.bodyLifecycleRevision", "room.npcAuthorityStatus"];
function coldWorld({ snapshot, saved }) {
  const data = new Map(), calls = [], runUntil = saved.runUntil, revision = 2;
  const hint = { v: 1, room: "island", world: saved.world, epoch: saved.fence, revision, owner: saved.owner, runUntil };
  data.set("host-world-receiver-v1", { v: 1, hint, status: "running", scans: 0, failures: 0, lastAt: Date.now() - 5000, nextAt: Date.now() - 5000 });
  const proxy = (prefix, own) => new Proxy(own, { get: (target, name) => name in target || name === "then" || typeof name !== "string"
    ? target[name] : async () => { calls.push(`${prefix}.${name}`); throw Error(STOP); } });
  const storage = { sql: {}, get: async (k) => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); },
    delete: async (k) => data.delete(k), setAlarm: async (at) => { data.set("alarm", at); }, deleteAlarm: async () => { data.delete("alarm"); },
    transaction: async (fn) => fn({ get: async (k) => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); } }) };
  globalThis.__hubPileFixtureHost = proxy("host", { storage, simulation: { playerSpawn() {}, poses() {} }, read: () => structuredClone(saved),
    worldRunState: async () => { calls.push("host.worldRunState"); return { world: saved.world, epoch: saved.fence, owner: saved.owner, revision: 5,
      status: "running", runUntil, publicationProtocol: 1, canPublish: true }; },
    bodyLifecycleRevision: async () => { calls.push("host.bodyLifecycleRevision"); return 5; } });
  const room = proxy("room", { npcAuthorityStatus: async (ticket) => {
    calls.push("room.npcAuthorityStatus");
    return ticket ? { owns: true, runUntil, cadence: undefined }
      : { authority: { mode: "server", world: saved.world, epoch: saved.fence, v: 4, format: "mixed-3", revision } };
  } });
  const env = { VIRTUAL_HOST_PREVIEW: "1", VIRTUAL_HOST_BODY_PREVIEW: "1", VIRTUAL_HOST_MOVEMENT_PREVIEW: "1",
    VIRTUAL_HOST_RUNNER_PREVIEW: "1", ROOM: { getByName: () => room },
    DONATIONS: { pileSnapshot: async () => { calls.push("read"); return snapshot(); } } };
  const world = new HubVirtualWorld({ storage, waitUntil() {} }, env);
  return { world, data, calls, hint };
}

test("a cold alarm or Room hint inside a live lease gates its newly opened runner before any body work", async () => {
  const held = known({ at: Date.now() - DAY, revision: 7 });
  const saved = () => retainedWorld({ pile: held, owner: "run-cold" });
  for (const [name, wake] of [["alarm", (c) => c.world.alarm()], ["Room hint", (c) => c.world.notifyRoomWorld(c.hint)]]) {
    for (const refused of [() => REVIEW, () => known({ at: held.at, revision: 8, bananas: 5000 })]) {
      const cold = coldWorld({ snapshot: refused, saved: saved() });
      await wake(cold);
      const label = `${name}, ${refused().bananas === null ? "unknown" : "changed level"}`;
      assert.deepEqual(cold.calls.filter((c) => !READ_ONLY.includes(c)), [], `${label}: no body dispatch, reclaim, tick or publication`);
      assert.ok(cold.calls.indexOf("read") > cold.calls.lastIndexOf("host.bodyLifecycleRevision"), `${label}: read after the runner's own ownership checks`);
      assert.equal(cold.data.get(FAULT)?.phase, "source", `${label}: a durable fault`);
      assert.deepEqual([cold.world.halted, cold.world.timer, cold.world.receiver.runtime], [true, null, null], `${label}: no runner or timer left`);
      // A later wake never reaches the refused opener again.
      const reads = cold.calls.length;
      await cold.world.alarm();
      assert.equal((await cold.world.notifyRoomWorld(cold.hint)).status, "stale");
      assert.equal(cold.calls.length, reads, `${label}: nothing after the fault`);
    }
    // A matching snapshot lets the same opener hand its runner to body dispatch.
    const cold = coldWorld({ snapshot: () => held, saved: saved() });
    await wake(cold);
    clearTimeout(cold.world.timer); cold.world.halted = true;
    const firstWork = cold.calls.findIndex((c) => !READ_ONLY.includes(c));
    assert.ok(firstWork > cold.calls.indexOf("read") && cold.calls.indexOf("read") >= 0, `${name}: dispatch only after the gate`);
    assert.equal(cold.data.get(FAULT), undefined);
  }
});

// Startup and recovery, through the real lifecycle: every host and Room step the
// gate must precede is recorded, and the first one past the gate stops the run.
const STOP = "fixture stops at the first exposure step";
const BOOT = "host-world-bootstrap-v1", FAULT = "host-world-fault-v1", REQUEST = "a".repeat(32);
function gateWorld({ snapshot, saved = null, configuration = null, prior = null, fault = null }) {
  const data = new Map(), calls = [];
  if (configuration) data.set("hub-configuration-fixture", configuration);
  if (prior) data.set(BOOT, prior);
  if (fault) data.set(FAULT, fault);
  const step = (name) => async () => { calls.push(name); throw Error(STOP); };
  const storage = { sql: {}, get: async (k) => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); },
    delete: async (k) => data.delete(k), deleteAlarm: async () => {},
    transaction: async (fn) => fn({ get: async (k) => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); },
      delete: async (k) => data.delete(k) }) };
  globalThis.__hubPileFixtureHost = { storage, simulation: { playerSpawn() {}, poses() {} },
    read: () => structuredClone(saved), begin: step("begin"), ticket: () => { calls.push("ticket"); throw Error(STOP); },
    prepareRoomClaim: step("claim"), completeRoomClaim: step("complete") };
  const room = new Proxy({}, { get: (_, name) => typeof name === "string" ? step(`room.${name}`) : undefined });
  const env = { VIRTUAL_HOST_PREVIEW: "1", VIRTUAL_HOST_BODY_PREVIEW: "1", VIRTUAL_HOST_MOVEMENT_PREVIEW: "1",
    VIRTUAL_HOST_RUNNER_PREVIEW: "1", ROOM: { getByName: () => room },
    ...(snapshot === undefined ? {} : { DONATIONS: { pileSnapshot: async () => { calls.push("read"); return snapshot(); } } }) };
  const world = new HubVirtualWorld({ storage, waitUntil() {} }, env);
  const outcome = (operation) => operation.then(() => ({ code: "completed" }), (error) => ({ code: error.code ?? (error.message === STOP ? "passed" : error.message) }));
  return { data, calls, start: () => outcome(world.startRun({ request: REQUEST, durationMs: 60000 })), recover: () => outcome(world.recoverRun()) };
}
// A retained running world as the lifecycle reads it, with its exposed and queued state.
const retainedWorld = ({ pile, level = pile ? Math.floor(pile.bananas) : 0, pending = null, room = { v: 1, pending: false, claim: null },
  owner = `run-${REQUEST}`, leaseUntil = Date.now() + 5000 }) => {
  const at = Date.now() - 1000;
  return { owner, world: "fixture-world", fence: 1, status: "running", runUntil: Date.now() + 60000, leaseUntil, room, sessions: null,
    simulation: { inputs: { v: 3, revision: 3, observedAt: at, pending },
      state: { at, level, tint: 0, inventory: [], assignments: [], pile }, activity: { v: 1, rows: [] } } };
};

test("first boot reads a fresh known pile before buying a run, and refuses one it would contradict", async () => {
  const configuration = { state: { v: 1, at: 1, elapsed: 0, level: 4321, tint: 0, inventory: [], assignments: [] } };
  const matching = gateWorld({ snapshot: () => known({ at: Date.now() - DAY }), configuration });
  assert.equal((await matching.start()).code, "passed");
  assert.deepEqual(matching.calls, ["read", "begin"], "the read precedes the run, and no Room call precedes either");
  assert.ok(matching.data.has(BOOT));
  for (const [name, snapshot, code] of [
    ["another level", () => known({ bananas: 5000, at: Date.now() - DAY }), "mismatch"],
    ["pending", () => PENDING, "pending"], ["review", () => REVIEW, "review"],
    ["legacy v1", () => ({ v: 1, type: "pile", bananas: 4321, at: Date.now(), eatPerHour: 0 }), "legacy"],
    ["transport", () => { throw Error("synthetic transport failure"); }, "transport"],
    ["no binding", undefined, "binding"],
  ]) {
    const refused = gateWorld({ snapshot, configuration });
    assert.equal((await refused.start()).code, code, name);
    assert.deepEqual(refused.calls.filter((c) => c !== "read"), [], `${name}: no run, Room call or frame`);
    assert.equal(refused.data.has(BOOT), false, `${name}: no startup identity retained`);
  }
});

test("a retained restart checks the shown state: old accounting, health changes and an unchanged level pass", async () => {
  const held = known({ at: Date.now() - 300 * DAY, revision: 7 });
  const prior = { request: REQUEST, durationMs: 60000 };
  for (const [name, snapshot] of [["identical", held], ["health changed", { ...held, reconciliation: "behind" }],
    ["newer revision, same level", { ...held, revision: 8, bananas: held.bananas + 0.4 }]]) {
    const restart = gateWorld({ snapshot: () => snapshot, saved: retainedWorld({ pile: held }), prior });
    assert.equal((await restart.start()).code, "passed", name);
    assert.deepEqual(restart.calls, ["read", "ticket"], `${name}: gate before the retained ticket`);
  }
  for (const [name, snapshot, code] of [
    ["older revision", { ...held, revision: 6 }, "stale"],
    ["same revision, other amount", { ...held, bananas: held.bananas + 1 }, "conflict"],
    ["same revision, other time", { ...held, at: held.at + 1 }, "conflict"],
    ["reversal below", { ...held, revision: 8, bananas: held.bananas - 2 }, "mismatch"],
  ]) {
    const refused = gateWorld({ snapshot: () => snapshot, saved: retainedWorld({ pile: held }), prior });
    assert.equal((await refused.start()).code, code, name);
    assert.deepEqual(refused.calls, ["read"], `${name}: nothing past the gate`);
  }
});

test("a fresher level waiting in the input queue is refused at startup, not shown stale first", async () => {
  const held = known({ at: Date.now() - DAY, revision: 7 });
  const newer = known({ at: Date.now() - 1000, revision: 8, bananas: 4400 });
  const pending = pendingInput(newer, Date.now() - 500);
  const prior = { request: REQUEST, durationMs: 60000 };
  const queued = gateWorld({ snapshot: () => newer, saved: retainedWorld({ pile: held, pending }), prior });
  assert.equal((await queued.start()).code, "queued", "the queued level can't reach the first frame yet");
  assert.deepEqual(queued.calls, ["read"]);
  // The queued revision is the latest: anything older than it is stale.
  const older = gateWorld({ snapshot: () => held, saved: retainedWorld({ pile: held, pending }), prior });
  assert.equal((await older.start()).code, "stale");
});

test("fault recovery refuses before Room takeover, leaving the fault for the operator", async () => {
  const held = known({ at: Date.now() - DAY, revision: 7 });
  const expired = () => retainedWorld({ pile: held, leaseUntil: Date.now() - 1 });
  const fault = { v: 1, at: Date.now() - 2000, phase: "pile-source" };
  const refused = gateWorld({ snapshot: () => REVIEW, saved: expired(), fault });
  assert.equal((await refused.recover()).code, "review");
  assert.deepEqual(refused.calls, ["read"], "no takeover, reclaim or tick");
  assert.deepEqual(refused.data.get(FAULT), fault, "the durable fault stays");
  const passed = gateWorld({ snapshot: () => held, saved: expired(), fault });
  assert.equal((await passed.recover()).code, "passed");
  assert.deepEqual(passed.calls, ["read", "claim"], "the read precedes the Room takeover");
  // A live lease resumes its own ticket only after the same gate.
  const live = gateWorld({ snapshot: () => held, saved: retainedWorld({ pile: held }) });
  assert.equal((await live.recover()).code, "passed");
  assert.deepEqual(live.calls, ["read", "ticket"]);
});
