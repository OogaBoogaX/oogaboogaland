// Host session lifecycle (#377 draft): the grace deadline and its exact boundary, restarts that never extend it, confirmed
// closes delivered after a restart, the finite run's drain, duplicate connections fencing the old socket, version refusal
// without mutation, the shared slot bound, occupancy, the host's passive stepper, equipment copied in and out, departure
// intents carrying the body and their applied tombstones, and strict checkpoint restore. Every check drives the module's API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionRegistry, CHECKPOINT_VERSION, MAX_SESSIONS, GRACE_MS, HANDOFF_MS, PASSIVE_STEP_MS, LIMITS } from "../src/host-sessions.js";

const PROTOCOL = "host-v1", WORLD = 7, T0 = 1_700_000_000_000;
const motion = (o = {}) => ({ x: 1, y: 10, z: 2, yaw: 0.5, vx: 3, vy: -1, vz: 4, grounded: false, ...o });
const equipment = (o = {}) => ({ weapon: "gun", mode: "combat", primaryOwned: true,
  secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true, ...o });
const body = (o = {}) => ({ kind: "ooga", motion: motion(), equipment: equipment(), ...o });
const claim = (accountId, bodyId, o = {}) => ({ protocol: PROTOCOL, world: WORLD, accountId, bodyId, zone: "outside", body: body(), ...o });
// Lifecycle-only fixtures opt into an explicit no-motion adapter; it is never a production fallback.
const registry = (adapter = {}) => new SessionRegistry({ protocol: PROTOCOL, world: WORLD, adapter: { stepPassive: m => m, ...adapter } });
const ref = (s) => ({ accountId: s.accountId, generation: s.generation, token: s.token });
const json = (v) => JSON.parse(JSON.stringify(v));
const restore = (cp, adapter = {}) => SessionRegistry.restore(json(cp), { protocol: PROTOCOL, world: WORLD, adapter: { stepPassive: m => m, ...adapter } });
const types = (effects) => effects.map((e) => e.type);
const close = (s, at) => ({ ref: ref(s), at });
const departure = (o = {}) => ({ id: "depart:9", type: "depart", glyph: "green", accountId: 3, bodyId: "ooga-c", generation: 9,
  reason: "expired", at: T0, handback: null, zone: "outside", body: body(), applied: false, ...o });

test("a body reconnects strictly before its deadline, and at the exact deadline it departs instead", () => {
  const reg = registry();
  const a = reg.connect(claim(1, "ooga-a"), T0);
  assert.equal(a.ok, true);
  assert.equal(a.resumed, false);
  assert.equal(a.view.kind, "ooga");
  const off = reg.disconnect(ref(a.session), T0 + 1000);
  assert.deepEqual(types(off.effects), ["neutralize"]);
  const grace = reg.view(1);
  assert.equal(grace.state, "grace");
  assert.equal(grace.presentation, "open-hand");
  assert.equal(grace.deadline, T0 + 1000 + GRACE_MS);
  assert.deepEqual(grace.motion, motion({ vx: 0, vz: 0 }), "holds neutralized, vertical velocity, yaw and position kept");

  const back = reg.connect(claim(1, "ooga-a", { body: undefined }), T0 + 1000 + GRACE_MS - 1);
  assert.equal(back.ok, true);
  assert.equal(back.resumed, true);
  assert.equal(back.view.presentation, null);
  assert.equal(back.view.state, "live");
  assert.deepEqual(back.view.motion, motion({ vx: 0, vz: 0 }));
  assert.deepEqual(back.view.equipment, equipment(), "selected equipment and mode survive the reconnect");
  assert.ok(back.session.generation > a.session.generation);

  reg.disconnect(ref(back.session), T0 + 2 * GRACE_MS);
  const deadline = T0 + 3 * GRACE_MS;
  assert.deepEqual(reg.advance(deadline - 1).effects, []);
  const late = reg.connect(claim(1, "ooga-a"), deadline);
  assert.equal(late.ok, false);
  assert.equal(late.reason, "departing", "the old body cannot be reclaimed at the deadline");
  assert.deepEqual(types(late.effects), ["depart"]);
  assert.equal(late.effects[0].at, deadline);
  assert.equal(late.effects[0].id, `depart:${back.session.generation}`);
  assert.deepEqual(late.effects[0].body, { kind: "ooga", motion: motion({ vx: 0, vz: 0 }), equipment: equipment() });
  assert.equal(late.effects[0].zone, "outside");
  assert.equal(late.effects[0].applied, false);
  assert.equal(reg.view(1), null);
});

test("restarts never extend grace: deadlines persist, and live records without transport start from lastSeenAt", () => {
  const reg = registry();
  const a = reg.connect(claim(1, "ooga-a"), T0);
  const b = reg.connect(claim(2, "ooga-b"), T0);
  reg.disconnect(ref(a.session), T0);
  assert.equal(reg.confirm(ref(b.session), T0 + 5000), true);

  assert.throws(() => restore(reg.checkpoint()).connect(claim(3, "ooga-c"), T0), /recover/);

  let next = restore(reg.checkpoint());
  const first = next.recover(T0 + 20000, [b.session.token]);
  assert.deepEqual(first.effects, []);
  assert.equal(next.view(2).state, "live");

  next = restore(next.checkpoint());
  const second = next.recover(T0 + 30000);
  assert.deepEqual(types(second.effects), ["neutralize"]);
  assert.equal(next.view(2).deadline, T0 + 5000 + GRACE_MS, "grace counts from the last confirmed presence");
  assert.equal(next.view(1).deadline, T0 + GRACE_MS);

  for (const at of [T0 + 40000, T0 + 10000, T0 + GRACE_MS - 1]) { // a clock stepping back changes nothing either
    next = restore(next.checkpoint());
    assert.deepEqual(next.recover(at).effects, []);
    assert.equal(next.view(1).deadline, T0 + GRACE_MS);
  }
  next = restore(next.checkpoint());
  const due = next.recover(T0 + GRACE_MS);
  assert.deepEqual(due.effects.map((e) => [e.type, e.accountId, e.at]), [["depart", 1, T0 + GRACE_MS]]);
  assert.equal(next.view(2).state, "grace");
});

test("regression: a confirmed close delivered after its token left the live set applies first and never extends grace", () => {
  const reg = registry();
  const a = reg.connect(claim(1, "ooga-a"), T0).session;
  const b = reg.connect(claim(2, "ooga-b"), T0).session;
  const c = reg.connect(claim(3, "ooga-c"), T0).session;
  reg.confirm(ref(a), T0 + 1000);
  reg.confirm(ref(b), T0 + 1000);
  const saved = reg.checkpoint();

  // a's socket closed at T0 + 5000 and its token is gone from the live set; c's close arrived while its token was still
  // listed. Both closes reached the host only after the restart, a's twice and out of order.
  const late = restore(saved);
  for (const bad of [
    [close(a, T0 + 20001)], // after now
    [close(a, T0 + 500)], // before a's persisted last presence
    [close(a, -1)], [close(a, T0 + 0.5)], [{ ref: ref(a) }], [{ ...close(a, T0 + 2000), extra: 1 }],
    [{ ref: { ...ref(a), token: "NOT-HEX" }, at: T0 + 2000 }], [{ ref: { ...ref(a), generation: 0 }, at: T0 + 2000 }],
    Array.from({ length: MAX_SESSIONS + 1 }, () => close(a, T0 + 2000)), "closes",
  ]) assert.throws(() => late.recover(T0 + 20000, [c.token], bad));
  assert.throws(() => late.recover(Number.MAX_SAFE_INTEGER), /epoch/, "a deadline past the safe range is refused");
  assert.deepEqual(late.checkpoint(), saved, "invalid observations mutate nothing");

  const out = late.recover(T0 + 20000, [c.token], [close(a, T0 + 9000), close(a, T0 + 5000), close(c, T0 + 7000)]);
  assert.deepEqual(out.effects.map((e) => [e.type, e.accountId]), [["neutralize", 1], ["neutralize", 3], ["neutralize", 2]]);
  assert.equal(late.view(1).deadline, T0 + 5000 + GRACE_MS, "the earliest confirmed close wins");
  assert.equal(late.view(3).deadline, T0 + 7000 + GRACE_MS, "a confirmed close outranks a listed token");
  assert.equal(late.view(2).deadline, T0 + 1000 + GRACE_MS, "an unknown close still counts from lastSeenAt");

  let next = restore(late.checkpoint());
  assert.deepEqual(next.recover(T0 + 30000, [], [close(a, T0 + 25000), close(b, T0 + 26000), close(c, T0 + 100)]).effects, [],
    "repeated closes for records already in grace do nothing");
  assert.deepEqual([1, 2, 3].map((id) => next.view(id).deadline),
    [T0 + 5000 + GRACE_MS, T0 + 1000 + GRACE_MS, T0 + 7000 + GRACE_MS], "and never move a deadline");

  const back = next.connect(claim(1, "ooga-a", { body: undefined }), T0 + 31000).session;
  next = restore(next.checkpoint());
  assert.deepEqual(next.recover(T0 + 32000, [back.token], [close(a, T0 + 31500)]).effects, [], "a superseded generation's close does nothing");
  assert.equal(next.view(1).state, "live");
  assert.equal(next.view(1).generation, back.generation);
});

test("drain turns every live record into grace at the run's stop time, keeps earlier grace, and repeats as a no-op", () => {
  const reg = registry();
  const a = reg.connect(claim(1, "ooga-a"), T0).session;
  const b = reg.connect(claim(2, "ooga-b"), T0).session;
  const c = reg.connect(claim(3, "ooga-c"), T0).session;
  reg.disconnect(ref(a), T0 + 1000);
  reg.confirm(ref(b), T0 + 4000);
  reg.confirm(ref(c), T0 + 2000);
  const stop = T0 + 5000;
  assert.throws(() => restore(reg.checkpoint()).drain(stop, stop), /recover/);
  const before = reg.checkpoint();
  assert.throws(() => reg.drain(T0 + 3000, stop), RangeError, "the stop cannot precede a live presence");
  assert.throws(() => reg.drain(stop, stop - 1), TypeError, "nor follow now");
  assert.throws(() => reg.drain(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1), TypeError, "unsafe deadline");
  assert.deepEqual(reg.checkpoint(), before);

  const out = reg.drain(stop, stop + 10);
  assert.deepEqual(out.effects.map((e) => [e.type, e.accountId]), [["neutralize", 2], ["neutralize", 3]]);
  const deadlines = (r) => [1, 2, 3].map((id) => r.view(id).deadline);
  const expected = [T0 + 1000 + GRACE_MS, stop + GRACE_MS, stop + GRACE_MS];
  assert.deepEqual(deadlines(reg), expected, "earlier grace is preserved, drained records count from the stop");
  assert.deepEqual([1, 2, 3].map((id) => reg.view(id).state), ["grace", "grace", "grace"], "drain reconnects nobody");

  let next = restore(reg.checkpoint());
  assert.deepEqual(next.recover(stop + 20).effects, []);
  assert.deepEqual(next.drain(stop, stop + 20).effects, []);
  assert.deepEqual(deadlines(next), expected, "idempotent across a restore");

  next = restore(next.checkpoint());
  assert.deepEqual(next.recover(stop + GRACE_MS - 1).effects.map((e) => [e.type, e.accountId, e.at]), [["depart", 1, T0 + 1000 + GRACE_MS]]);
  assert.deepEqual(next.drain(stop, stop + GRACE_MS - 1).effects, []);
  const gone = next.drain(stop, stop + GRACE_MS).effects;
  assert.deepEqual(gone.map((e) => [e.type, e.accountId, e.at]), [["depart", 2, stop + GRACE_MS], ["depart", 3, stop + GRACE_MS]],
    "departures fall exactly on the run-end deadline");
  assert.deepEqual(gone[0].body, { kind: "ooga", motion: motion({ vx: 0, vz: 0 }), equipment: equipment() });
});

test("a duplicate connect rotates the session and keeps the body; the old socket's input and close do nothing", () => {
  const reg = registry();
  const first = reg.connect(claim(1, "ooga-a"), T0);
  assert.equal(reg.update(ref(first.session), T0 + 10, { motion: motion({ x: 5 }), equipment: equipment({ weapon: "primary", mode: "carry" }) }), true);
  const second = reg.connect(claim(1, "ooga-a", { body: body({ kind: "clanker", motion: motion({ x: -50 }) }) }), T0 + 20);
  assert.equal(second.ok, true);
  assert.equal(second.resumed, false);
  assert.deepEqual(second.effects, [{ type: "replaced", accountId: 1, generation: first.session.generation },
    { type: "neutralize", accountId: 1, bodyId: "ooga-a", generation: first.session.generation }]);
  assert.notEqual(second.session.token, first.session.token);
  assert.ok(second.session.generation > first.session.generation);
  assert.equal(second.view.motion.x, 5, "the claim's body is ignored for an owned body");
  assert.equal(second.view.kind, "ooga", "and so is its kind");
  assert.deepEqual([second.view.motion.vx, second.view.motion.vz], [0, 0], "old held movement cannot carry into the new session");
  assert.deepEqual(second.view.equipment, equipment({ weapon: "primary", mode: "carry" }));

  const before = reg.checkpoint();
  const stale = ref(first.session);
  assert.equal(reg.confirm(stale, T0 + 30), false);
  assert.equal(reg.update(stale, T0 + 30, { motion: motion() }), false);
  assert.equal(reg.disconnect(stale, T0 + 30).ok, false);
  assert.equal(reg.release(stale, T0 + 30).ok, false);
  assert.equal(reg.occupy(stale, { kind: "hammock", id: "h1" }, T0 + 30).ok, false);
  assert.equal(reg.confirm({ ...ref(second.session), token: first.session.token }, T0 + 30), false, "the token takes part");
  assert.deepEqual(reg.checkpoint(), before);
  assert.equal(reg.view(1).state, "live");
  assert.equal(reg.confirm(ref(second.session), T0 + 40), true);

  assert.equal(reg.connect(claim(2, "ooga-a"), T0 + 50).reason, "body-owned");
  assert.equal(reg.connect(claim(1, "ooga-b"), T0 + 50).reason, "account-bound");
});

test("a claim whose protocol or world version differs is refused before any mutation", () => {
  const reg = registry();
  const a = reg.connect(claim(1, "ooga-a"), T0);
  reg.disconnect(ref(a.session), T0);
  const before = reg.checkpoint();
  for (const o of [{ protocol: "host-v2" }, { world: 8 }, { world: "7" }, { protocol: undefined }]) {
    const r = reg.connect(claim(1, "ooga-a", o), T0 + GRACE_MS + 5);
    assert.deepEqual(r, { ok: false, reason: "version", effects: [] });
  }
  assert.deepEqual(reg.checkpoint(), before, "no sweep, clock or deadline change on a mismatch");
  assert.throws(() => SessionRegistry.restore(json(before), { protocol: PROTOCOL, world: 8 }), /mismatch/);
  assert.throws(() => SessionRegistry.restore(json(before), { protocol: "host-v2", world: WORLD }), /mismatch/);
});

test("capacity holds at MAX_SESSIONS across sessions and departures, and frees only on an applied acknowledge", () => {
  const reg = registry();
  const sessions = [];
  for (let i = 1; i <= MAX_SESSIONS; i++) sessions.push(reg.connect(claim(i, `ooga-${i}`), T0).session);
  assert.equal(reg.size, MAX_SESSIONS);
  assert.equal(reg.connect(claim(100, "ooga-100"), T0).reason, "full");
  reg.disconnect(ref(sessions[0]), T0);
  const gone = reg.advance(T0 + GRACE_MS).effects;
  assert.deepEqual(types(gone), ["depart"]);
  assert.equal(reg.size, MAX_SESSIONS - 1);
  assert.equal(reg.connect(claim(100, "ooga-100"), T0 + GRACE_MS).reason, "full", "the intent keeps its slot until published");
  assert.equal(reg.acknowledge(gone[0].id), false, "refused before the host applied it");
  assert.equal(reg.markApplied(gone[0].id), true);
  assert.equal(reg.connect(claim(100, "ooga-100"), T0 + GRACE_MS).reason, "full", "an applied tombstone still holds its slot");
  assert.equal(reg.acknowledge(gone[0].id), true);
  assert.equal(reg.acknowledge(gone[0].id), false);
  assert.equal(reg.markApplied(gone[0].id), false);
  assert.equal(reg.connect(claim(100, "ooga-100"), T0 + GRACE_MS).ok, true);
  assert.equal(reg.connect(claim(1, "ooga-1"), T0 + GRACE_MS).reason, "full");
});

test("occupancy is one per session, never shared, server admitted, kept through grace and released by every exit", () => {
  const allowed = new Set(["hammock:h1", "cabinet:c1", "cabinet:c2"]);
  const asked = [];
  const reg = registry({ validateOccupancy: (body, res) => { asked.push([body.bodyId, res.kind, res.id]); return allowed.has(`${res.kind}:${res.id}`); } });
  const a = reg.connect(claim(1, "ooga-a"), T0).session;
  const b = reg.connect(claim(2, "ooga-b"), T0).session;
  assert.equal(reg.occupy(ref(a), { kind: "hammock", id: "h1" }, T0).ok, true);
  assert.deepEqual(asked, [["ooga-a", "hammock", "h1"]]);
  assert.equal(reg.occupy(ref(a), { kind: "hammock", id: "h1" }, T0).ok, true, "idempotent");
  assert.equal(reg.occupy(ref(a), { kind: "cabinet", id: "c1" }, T0).reason, "occupied");
  assert.equal(reg.occupy(ref(b), { kind: "hammock", id: "h1" }, T0).reason, "taken");
  assert.equal(reg.occupy(ref(b), { kind: "cabinet", id: "c9" }, T0).reason, "refused");
  assert.equal(reg.occupy(ref(b), { kind: "table", id: "c1" }, T0).reason, "invalid");
  const bare = registry();
  const z = bare.connect(claim(9, "ooga-z"), T0).session;
  assert.equal(bare.occupy(ref(z), { kind: "cabinet", id: "c1" }, T0).reason, "refused", "no adapter fails closed");

  reg.disconnect(ref(a), T0 + 1);
  assert.deepEqual(reg.view(1).occupancy, { kind: "hammock", id: "h1" });
  const back = reg.connect(claim(1, "ooga-a"), T0 + 2).session;
  assert.equal(reg.occupant("hammock", "h1"), 1);
  assert.deepEqual(reg.setZone(ref(back), "outside", T0 + 3).effects, []);
  assert.deepEqual(types(reg.setZone(ref(back), "arcade.hall", T0 + 3).effects), ["vacated"]);
  assert.equal(reg.occupant("hammock", "h1"), null);

  assert.equal(reg.occupy(ref(b), { kind: "hammock", id: "h1" }, T0 + 4).ok, true);
  assert.deepEqual(types(reg.vacate(ref(b), T0 + 5).effects), ["vacated"]);
  assert.equal(reg.occupy(ref(back), { kind: "cabinet", id: "c1" }, T0 + 5).ok, true);
  assert.deepEqual(types(reg.release(ref(back), T0 + 6).effects), ["vacated", "depart"]);
  assert.equal(reg.occupant("cabinet", "c1"), null);
  assert.equal(reg.occupy(ref(b), { kind: "cabinet", id: "c1" }, T0 + 7).ok, true);
  assert.deepEqual(types(reg.revoke(2, T0 + 8).effects), ["vacated", "depart"]);

  const c = reg.connect(claim(3, "ooga-c"), T0 + 9).session;
  reg.occupy(ref(c), { kind: "cabinet", id: "c2" }, T0 + 9);
  reg.disconnect(ref(c), T0 + 9);
  assert.deepEqual(types(reg.advance(T0 + 9 + GRACE_MS).effects), ["vacated", "depart"]);
  assert.equal(reg.occupant("cabinet", "c2"), null);
});

test("the host's passive stepper moves a grace body and touches nothing else", () => {
  const calls = [];
  const adapter = {
    stepPassive(m, dt) { // host-owned gravity against a ledge at y = 4, standing in for the island's collision
      calls.push({ keys: Object.keys(m).sort(), dt, zone: m.zone, kind: m.kind });
      const vy = m.vy - 9.8 * dt / 1000, y = Math.max(4, m.y + vy * dt / 1000);
      const out = { ...m, y, vy: y === 4 ? 0 : vy, grounded: y === 4, magazine: 0, fuel: 0, deadline: 0, accountId: 99,
        kind: "clanker", zone: "elsewhere", spareAmmo: [] };
      m.x = 12345; // mutating its copy reaches nothing
      return out;
    },
  };
  const reg = registry(adapter);
  const a = reg.connect(claim(1, "ooga-a"), T0).session;
  reg.disconnect(ref(a), T0);
  const before = reg.view(1);
  reg.advance(T0 + 500);
  reg.advance(T0 + 500);
  reg.advance(T0 + 1500);
  assert.equal(calls.length, 1500 / PASSIVE_STEP_MS, "no step without elapsed time");
  assert.ok(calls.every(c => c.dt <= PASSIVE_STEP_MS), "recovery never tunnels via one giant timestep");
  assert.deepEqual(calls[0].keys, ["bodyId", "grounded", "kind", "vx", "vy", "vz", "x", "y", "yaw", "z", "zone"]);
  assert.deepEqual([calls[0].zone, calls[0].kind], ["outside", "ooga"]);
  const after = reg.view(1);
  assert.ok(after.motion.y < before.motion.y);
  assert.equal(after.motion.x, 1);
  assert.equal(after.motion.yaw, 0.5, "yaw survives the physics projection");
  assert.deepEqual([after.kind, after.zone], ["ooga", "outside"]);
  assert.deepEqual(after.equipment, equipment(), "equipment selection unchanged");
  assert.equal(after.deadline, before.deadline);
  assert.equal(after.accountId, 1);
  assert.equal(after.generation, a.generation);
  for (let t = 2000; t < 20000; t += 1000) reg.advance(T0 + t);
  assert.deepEqual([reg.view(1).motion.y, reg.view(1).motion.grounded], [4, true]);
  const resumed = reg.connect(claim(1, "ooga-a"), T0 + 20000);
  assert.equal(resumed.view.motion.y, 4, "reconnect returns the resulting position");
  assert.deepEqual(resumed.view.equipment, equipment());

  for (const bad of [() => ({ x: NaN }), (m) => ({ ...m, yaw: 7 }), (m) => { const { yaw, ...rest } = m; return rest; }]) {
    const broken = registry({ stepPassive: bad });
    const s = broken.connect(claim(1, "ooga-a"), T0).session;
    broken.disconnect(ref(s), T0);
    const cp = broken.checkpoint();
    assert.throws(() => broken.advance(T0 + 10), /invalid motion/);
    assert.deepEqual(broken.checkpoint(), cp);
  }

  const still = new SessionRegistry({ protocol: PROTOCOL, world: WORLD });
  const t = still.connect(claim(1, "ooga-a"), T0).session;
  still.disconnect(ref(t), T0);
  const unsupported = still.checkpoint();
  assert.throws(() => still.advance(T0 + 30000), /collision adapter required/);
  assert.deepEqual(still.checkpoint(), unsupported, "missing physics cannot claim to have advanced the body");
});

test("equipment selection survives recovery while resource quantities are absent and return requests normal defaults", () => {
  const reg = registry(), gear = equipment({ selectedSlot: 1 });
  const a = reg.connect(claim(1, "ooga-a", { body: body({ equipment: gear }) }), T0);
  gear.selectedSlot = 2; a.view.equipment.weapon = null; reg.view(1).equipment.mode = "carry";
  assert.deepEqual(reg.view(1).equipment, equipment({ selectedSlot: 1 }), "no alias reaches the record");
  const lone = equipment({ weapon: null, secondaryOwned: false, jetpack: false, jetpackOwned: false });
  reg.connect(claim(2, "gorilla-b", { body: body({ kind: "clanker", equipment: lone }) }), T0);
  const patch = equipment({ selectedSlot: 2, unlimited: true });
  assert.equal(reg.update(ref(a.session), T0 + 1, { equipment: patch }), true);
  patch.selectedSlot = 1;
  const kept = equipment({ selectedSlot: 2, unlimited: true });
  const cp = reg.checkpoint(); cp.sessions[0].equipment.weapon = null;
  assert.deepEqual(reg.view(1).equipment, kept, "a checkpoint is a copy");
  reg.disconnect(ref(a.session), T0 + 2); reg.advance(T0 + 5000);
  const next = restore(reg.checkpoint()); next.recover(T0 + 6000);
  const back = next.connect(claim(1, "ooga-a", { body: undefined }), T0 + 7000);
  assert.equal(back.resumed, true); assert.equal(back.resetResources, "defaults");
  assert.deepEqual(back.view.equipment, kept); assert.deepEqual(next.view(2).equipment, lone);
  for (const key of ["magazine", "spareAmmo", "fuel", "health"])
    assert.equal(Object.hasOwn(back.view.equipment, key), false, `${key} is not recovery state`);
});

test("a departure keeps the actual body, zone and kind, and its applied tombstone survives restarts until acknowledged", () => {
  const reg = registry({ npcFor: () => null });
  const gear = { selectedSlot: 1, weapon: "primary", mode: "carry", unlimited: true, jetpack: false };
  const a = reg.connect(claim(1, "gorilla-a", { zone: "arcade.hall", body: body({ kind: "clanker", motion: motion({ yaw: -6 }), equipment: equipment(gear) }) }), T0).session;
  reg.update(ref(a), T0 + 10, { motion: motion({ x: 7, yaw: 1.25 }) });
  const gone = reg.release(ref(a), T0 + 20).effects;
  const expected = { id: `depart:${a.generation}`, type: "depart", glyph: "green", accountId: 1, bodyId: "gorilla-a",
    generation: a.generation, reason: "release", at: T0 + 20, handback: null, zone: "arcade.hall",
    body: { kind: "clanker", motion: motion({ x: 7, yaw: 1.25 }), equipment: equipment(gear) }, applied: false };
  assert.deepEqual(gone, [expected], "no NPC reported means no handback and no spawn");
  gone[0].body.equipment.weapon = null;
  gone[0].body.motion.x = 0;
  assert.deepEqual(reg.pending(), [expected], "the effect is a copy");

  assert.equal(reg.acknowledge(expected.id), false, "refused before applied");
  let next = restore(reg.checkpoint());
  next.recover(T0 + 30);
  assert.equal(next.acknowledge(expected.id), false, "still refused after a restart");
  assert.equal(next.markApplied("depart:999"), false);
  assert.equal(next.markApplied(expected.id), true);
  assert.equal(next.markApplied(expected.id), true, "idempotent");
  assert.equal(next.connect(claim(2, "gorilla-a"), T0 + 40).reason, "departing", "the tombstone still owns its body");

  next = restore(next.checkpoint());
  assert.throws(() => next.markApplied(expected.id), /recover/);
  next.recover(T0 + 5 * GRACE_MS);
  assert.deepEqual(next.pending(), [{ ...expected, applied: true }], "the applied tombstone survives the restart");
  assert.equal(next.acknowledge(expected.id), true);
  assert.equal(next.acknowledge(expected.id), false);
  assert.deepEqual(next.checkpoint().pending, []);
  assert.equal(next.connect(claim(2, "gorilla-a"), T0 + 5 * GRACE_MS).ok, true);
});

test("expiry hands back only an NPC the host reports, never spawns one, and keeps a stable id across restarts", () => {
  const npcs = new Map([["ooga-a", "npc-7"]]);
  const adapter = { npcFor: (body) => npcs.get(body) ?? null };
  const reg = registry(adapter);
  const a = reg.connect(claim(1, "ooga-a"), T0).session;
  const b = reg.connect(claim(2, "ooga-b"), T0).session;
  reg.disconnect(ref(a), T0);
  reg.disconnect(ref(b), T0);
  const saved = reg.checkpoint();
  const { effects } = reg.advance(T0 + GRACE_MS);
  const left = { kind: "ooga", motion: motion({ vx: 0, vz: 0 }), equipment: equipment() };
  assert.deepEqual(effects, [
    { id: `depart:${a.generation}`, type: "depart", glyph: "green", accountId: 1, bodyId: "ooga-a", generation: a.generation, reason: "expired", at: T0 + GRACE_MS, handback: { npc: "npc-7" }, zone: "outside", body: left, applied: false },
    { id: `depart:${b.generation}`, type: "depart", glyph: "green", accountId: 2, bodyId: "ooga-b", generation: b.generation, reason: "expired", at: T0 + GRACE_MS, handback: null, zone: "outside", body: left, applied: false },
  ]);
  assert.deepEqual(reg.advance(T0 + 2 * GRACE_MS).effects, [], "an expiry happens once");
  assert.deepEqual(reg.pending(), effects);

  const replay = restore(saved, adapter);
  assert.deepEqual(replay.recover(T0 + GRACE_MS + 999).effects.map((e) => e.id), effects.map((e) => e.id), "same keys after a crash");
  const kept = restore(reg.checkpoint(), adapter);
  kept.recover(T0 + 3 * GRACE_MS);
  assert.deepEqual(kept.pending(), effects, "unacknowledged intents survive the checkpoint");
  assert.equal(kept.acknowledge(effects[0].id), false, "not before the host applies it");
  assert.equal(kept.markApplied(effects[0].id), true);
  assert.equal(kept.acknowledge(effects[0].id), true);
  assert.deepEqual(kept.pending().map((p) => p.id), [effects[1].id]);

  const liar = registry({ npcFor: () => ({ spawn: true }) });
  const c = liar.connect(claim(1, "ooga-a"), T0).session;
  liar.disconnect(ref(c), T0);
  const cp = liar.checkpoint();
  assert.throws(() => liar.advance(T0 + GRACE_MS), /NPC id/);
  assert.deepEqual(liar.checkpoint(), cp);
});

test("claims outside the limits are refused, and malformed checkpoints never restore", () => {
  const reg = registry();
  const { selectedSlot, ...lossy } = equipment();
  for (const bad of [
    claim(0, "ooga-a"), claim("1", "ooga-a"), claim(1.5, "ooga-a"), claim(1, ""), claim(1, "x".repeat(65)), claim(1, "a b"),
    claim(1, "ooga-a", { zone: "" }),
    claim(1, "ooga-a", { body: body({ motion: motion({ y: Infinity }) }) }),
    claim(1, "ooga-a", { body: body({ motion: motion({ vy: LIMITS.velocity * 2 }) }) }),
    claim(1, "ooga-a", { body: body({ motion: motion({ yaw: LIMITS.yaw + 0.01 }) }) }),
    claim(1, "ooga-a", { body: body({ motion: motion({ yaw: NaN }) }) }),
    claim(1, "ooga-a", { body: body({ motion: (({ yaw, ...m }) => m)(motion()) }) }),
    claim(1, "ooga-a", { body: body({ kind: "robot" }) }),
    claim(1, "ooga-a", { body: (({ kind, ...b }) => b)(body()) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ magazine: 30 }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: { ...lossy, reserve: 60 } }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ reserve: 60 }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ spareAmmo: [1, 2, 3] }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ selectedSlot: 0 }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ selectedSlot: 3 }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ primaryOwned: undefined }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ unlimited: "yes" }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ jetpackOwned: 1 }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ fuel: -0.1 }) }) }),
    claim(1, "ooga-a", { body: body({ equipment: equipment({ weapon: "bazooka" }) }) }),
    claim(1, "ooga-a", { body: body({ motion: { ...motion(), shot: true } }) }),
    claim(1, "ooga-a", { body: { ...body(), thrust: 1 } }),
    claim(1, "ooga-a", { body: undefined }),
  ]) assert.equal(reg.connect(bad, T0).reason, "invalid");
  assert.equal(reg.size, 0);
  assert.throws(() => reg.advance(-1), /epoch/);
  assert.throws(() => reg.advance(T0 + 0.5), /epoch/);

  const a = reg.connect(claim(1, "ooga-a"), T0).session;
  const b = reg.connect(claim(2, "ooga-b"), T0).session;
  reg.disconnect(ref(a), T0);
  const good = json(reg.checkpoint());
  assert.equal(good.v, CHECKPOINT_VERSION);
  assert.equal(CHECKPOINT_VERSION, 4);
  restore(good).recover(T0, [b.token]);

  const mutate = (fn) => { const cp = json(good); fn(cp); return cp; };
  const oldDraft = mutate((cp) => { // a version 1 checkpoint: aggregate reserve, no kind or yaw
    cp.v = 1;
    for (const s of cp.sessions) {
      delete s.kind;
      delete s.motion.yaw;
      s.equipment = { weapon: "gun", mode: "combat", magazine: 17, reserve: 60, jetpack: true, fuel: 0.4 };
    }
  });
  const broken = [
    null, [], oldDraft, mutate((cp) => { cp.v = 1; }), mutate((cp) => { cp.v = 2; }), mutate((cp) => { cp.v = 3; }),
    mutate((cp) => { cp.extra = 1; }), mutate((cp) => { delete cp.pending; }),
    mutate((cp) => { cp.clock = -1; }), mutate((cp) => { cp.clock = Number.MAX_SAFE_INTEGER; }),
    mutate((cp) => { cp.nextGeneration = cp.sessions[1].generation; }),
    mutate((cp) => { cp.sessions[1].bodyId = cp.sessions[0].bodyId; }),
    mutate((cp) => { cp.sessions[1].accountId = cp.sessions[0].accountId; }),
    mutate((cp) => { cp.sessions[1].token = cp.sessions[0].token; }),
    mutate((cp) => { cp.sessions[1].generation = cp.sessions[0].generation; }),
    mutate((cp) => { cp.sessions[1].token = "NOT-HEX"; }),
    mutate((cp) => { cp.sessions[1].kind = "robot"; }),
    mutate((cp) => { delete cp.sessions[1].kind; }),
    mutate((cp) => { cp.sessions[0].deadline += 1; }),
    mutate((cp) => { cp.sessions[0].stepAt = cp.sessions[0].deadline; }),
    mutate((cp) => { cp.sessions[1].deadline = T0 + GRACE_MS; }),
    mutate((cp) => { cp.sessions[1].state = "zombie"; }),
    mutate((cp) => { cp.sessions[1].lastSeenAt = cp.clock + 1; cp.sessions[1].stepAt = cp.clock + 1; }),
    mutate((cp) => { cp.sessions[1].equipment.magazine = -1; }),
    mutate((cp) => { cp.sessions[1].equipment.spareAmmo = [1, 2, 3]; }),
    mutate((cp) => { cp.sessions[1].equipment.spareAmmo = [null]; }),
    mutate((cp) => { cp.sessions[1].equipment.reserve = 60; }),
    mutate((cp) => { cp.sessions[1].equipment.selectedSlot = 3; }),
    mutate((cp) => { delete cp.sessions[1].equipment.jetpackOwned; }),
    mutate((cp) => { cp.sessions[1].motion.yaw = 7; }),
    mutate((cp) => { cp.sessions[1].motion.thrust = 1; }),
    mutate((cp) => { cp.sessions[0].occupancy = { kind: "hammock", id: "h1" }; cp.sessions[1].occupancy = { kind: "hammock", id: "h1" }; }),
    mutate((cp) => { cp.sessions[1].occupancy = { kind: "puck", id: "p" }; }),
    mutate((cp) => { cp.sessions = Array.from({ length: MAX_SESSIONS + 1 }, () => cp.sessions[1]); }),
    mutate((cp) => { cp.pending.push(departure({ generation: 1, id: "depart:1" })); }),
    mutate((cp) => { cp.pending.push(departure({ bodyId: "ooga-a" })); cp.nextGeneration = 10; }),
    mutate((cp) => { cp.pending.push(departure({ type: "arrive" })); cp.nextGeneration = 10; }),
    mutate((cp) => { cp.pending.push(departure({ handback: { npc: "" } })); cp.nextGeneration = 10; }),
    mutate((cp) => { cp.pending.push(departure({ applied: "yes" })); cp.nextGeneration = 10; }),
    mutate((cp) => { cp.pending.push(departure({ zone: "" })); cp.nextGeneration = 10; }),
    mutate((cp) => { cp.pending.push(departure({ body: body({ kind: "robot" }) })); cp.nextGeneration = 10; }),
    mutate((cp) => { cp.pending.push(departure({ body: body({ equipment: equipment({ spareAmmo: [99] }) }) })); cp.nextGeneration = 10; }),
    mutate((cp) => { const p = departure(); delete p.body; cp.pending.push(p); cp.nextGeneration = 10; }),
    mutate((cp) => { const p = departure(); delete p.applied; cp.pending.push(p); cp.nextGeneration = 10; }),
  ];
  for (const cp of broken) assert.throws(() => SessionRegistry.restore(cp, { protocol: PROTOCOL, world: WORLD }), TypeError);

  const fine = mutate((cp) => { cp.pending.push(departure({ reason: "revoke", handback: { npc: "npc-1" }, applied: true })); cp.nextGeneration = 10; });
  const restored = SessionRegistry.restore(fine, { protocol: PROTOCOL, world: WORLD });
  restored.recover(T0);
  assert.equal(restored.connect(claim(4, "ooga-c"), T0).reason, "departing");
  assert.equal(restored.connect(claim(4, "ooga-d"), T0).session.generation, 10, "generations continue from the checkpoint");
  assert.throws(() => restored.recover(T0), /only follows restore/);
});


test("offers keep physics, occupancy and the original deadline across replacement and restart", () => {
  let calls = 0;
  const adapter = { validateOccupancy: () => true, stepPassive: (m, ms) => {
    calls++; return { ...m, y: m.y + m.vy * ms / 1000 };
  } };
  const reg = registry(adapter), live = reg.connect(claim(1, "ooga-a"), T0).session;
  reg.occupy(ref(live), { kind: "hammock", id: "bed-a" }, T0);
  reg.disconnect(ref(live), T0);
  const offered = reg.offer(claim(1, "ooga-a"), T0 + 1000), held = ref(offered.session);
  assert.equal(offered.view.state, "offered"); assert.equal(offered.view.deadline, T0 + GRACE_MS);
  assert.ok(Math.abs(offered.view.motion.y - 9) < 1e-12); assert.equal(reg.confirm(held, T0 + 1000), false);
  assert.equal(reg.update(held, T0 + 1000, { motion: motion() }), false);
  assert.equal(reg.authorizedView(held), null); assert.equal(reg.transferView(held).state, "offered");
  assert.equal(reg.occupant("hammock", "bed-a"), 1);
  const next = restore(reg.checkpoint(), adapter); next.recover(T0 + 2000, [held.token]);
  assert.ok(calls > 0); assert.ok(Math.abs(next.view(1).motion.y - 8) < 1e-12);
  assert.equal(next.view(1).deadline, T0 + GRACE_MS);
  const newer = next.offer(claim(1, "ooga-a"), T0 + 2000);
  assert.equal(newer.view.deadline, T0 + GRACE_MS); assert.ok(newer.session.generation > held.generation);
  assert.equal(next.activate(held, T0 + 2000).ok, false);
  const due = next.advance(T0 + GRACE_MS).effects;
  assert.equal(next.occupant("hammock", "bed-a"), null);
  assert.deepEqual(types(due), ["vacated", "depart"]);
  assert.equal(due[1].at, T0 + GRACE_MS); assert.equal(due[1].handback, null);
});

test("lost activation ACK never creates dual ownership or renews the disconnect deadline", () => {
  let steps = 0;
  const adapter = { stepPassive: (m, ms) => { steps++; return { ...m, y: m.y + m.vy * ms / 1000 }; } };
  const reg = registry(adapter), offered = reg.offer(claim(1, "ooga-a"), T0), held = ref(offered.session);
  assert.equal(offered.view.motion.vx, 0); assert.equal(offered.view.motion.vz, 0);
  assert.equal(offered.view.motion.vy, -1); assert.ok(types(offered.effects).includes("neutralize"));
  const activated = reg.activate(held, T0 + 250);
  assert.equal(activated.ok, true); assert.equal(activated.controlUntil, T0 + 250 + HANDOFF_MS);
  assert.ok(activated.view.motion.y < offered.view.motion.y, "activation carries the latest falling pose");
  const atLease = steps, saved = reg.checkpoint();
  let next = restore(saved, adapter); next.recover(T0 + 500, []);
  assert.equal(next.view(1).state, "starting"); assert.equal(steps, atLease, "restart cannot take physics during a browser lease");
  assert.equal(next.offer(claim(1, "ooga-a"), T0 + 500).reason, "handoff");
  assert.equal(next.revoke(1, T0 + 500).reason, "handoff");
  next.disconnect(held, T0 + 500);
  assert.equal(next.view(1).state, "starting", "socket close does not prove the controller has stopped");
  assert.equal(next.confirm(held, T0 + 500), false);
  next = restore(next.checkpoint(), adapter); next.recover(activated.controlUntil, []);
  assert.equal(next.view(1).state, "grace"); assert.ok(steps > atLease);
  assert.equal(next.view(1).deadline, T0 + GRACE_MS);
  assert.equal(next.started(held, activated.controlUntil).ok, false);
  assert.equal(next.advance(T0 + GRACE_MS).effects[0].at, T0 + GRACE_MS);
});

test("a final snapshot ACK alone restores live ownership; duplicate ACKs do not keep an absent player alive", () => {
  const reg = registry(), offered = reg.offer(claim(1, "ooga-a"), T0), held = ref(offered.session);
  assert.equal(reg.started(held, T0).ok, false);
  const active = reg.activate(held, T0 + 250); assert.equal(active.ok, true);
  assert.equal(reg.started({ ...held, token: "0".repeat(32) }, T0 + 300).ok, false);
  const done = reg.started(held, T0 + 300);
  assert.equal(done.ok, true); assert.equal(done.duplicate, false); assert.equal(done.view.state, "live");
  assert.equal(done.view.presentation, null); assert.equal(done.view.deadline, null);
  const before = reg.checkpoint();
  assert.equal(reg.started(held, T0 + 500).duplicate, true); assert.deepEqual(reg.checkpoint(), before);
  const next = restore(reg.checkpoint()); next.recover(T0 + 900);
  assert.equal(next.view(1).deadline, T0 + 300 + GRACE_MS);
});

test("handoff lease is clipped to the original grace boundary and finite drain cannot extend it", () => {
  const reg = registry(), held = ref(reg.offer(claim(1, "ooga-a"), T0).session);
  const active = reg.activate(held, T0 + GRACE_MS - 1);
  assert.equal(active.controlUntil, T0 + GRACE_MS);
  const cp = reg.checkpoint(), next = restore(cp);
  next.recover(T0 + GRACE_MS - 1);
  next.drain(T0 + GRACE_MS - 1, T0 + GRACE_MS - 1);
  assert.equal(next.view(1).state, "starting");
  assert.equal(next.started(held, T0 + GRACE_MS).ok, false);
  const out = next.drain(T0 + GRACE_MS - 1, T0 + GRACE_MS);
  assert.equal(out.effects[0].at, T0 + GRACE_MS); assert.equal(next.size, 0);
});
