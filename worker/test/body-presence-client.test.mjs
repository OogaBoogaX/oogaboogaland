// Independent receiver contract tests for src/js/body-presence.js (#377 / PR467).
// Presentation only: nothing here grants authority, gameplay or a control lease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/js/npc-authority.js';
import '../../src/js/body-presence.js';
import { SessionRegistry } from '../src/host-sessions.js';

const P = 'host-session-v5', WORLD = 'presence-world', BP = globalThis.BL.bodyPresence;
const body = x => ({ kind: 'ooga', motion: { x, y: 12.5, z: -3, yaw: 1, vx: 2, vy: -4, vz: 0, grounded: false },
  equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1,
    unlimited: false, jetpack: false, jetpackOwned: false } });
// Real public registry output: account 1 frozen midair (grace, open hand, zero
// velocity, deadline 61000); account 2 released (green departure).
const reg = new SessionRegistry({ protocol: P, world: WORLD });
const join = id => reg.connect({ protocol: P, world: WORLD, accountId: id, bodyId: `ooga:${id}`, zone: 'hub', body: body(id) }, 1000).session;
const ref = s => ({ accountId: s.accountId, generation: s.generation, token: s.token });
const s1 = ref(join(1)), s2 = ref(join(2));
assert.equal(reg.disconnect(s1, 1000).ok, true);
assert.equal(reg.release(s2, 1000).ok, true);
assert.equal(reg.markApplied(reg.pending()[0].id), true);
const VIEW = reg.view(1), DEPART = reg.pending()[0];
assert.equal(VIEW.deadline, 61000);

const frame = (o = {}) => ({ v: 1, protocol: P, world: WORLD, epoch: 3, revision: 10, now: 2000, expiresAt: 7000,
  views: [structuredClone(VIEW)], departures: [structuredClone(DEPART)], ...o });
const A = Object.freeze({ v: 1, mode: 'server', world: WORLD, epoch: 2, revision: 5 });
const env = (f = frame(), o = {}) => ({ t: 'body-presence', authority: { ...A }, frame: f, stale: false, sentAt: f.now, ...o });
const ack = (authority, epoch, revision) => ({ t: 'body-presence-ack', authority, epoch, revision });
function harness() {
  const clock = { mono: 50, wall: 1.7e12 + 12345 }, sent = []; let failing = false;
  const client = BP.create({ monotonic: () => clock.mono, wall: () => clock.wall,
    send: m => { if (failing) { failing = false; throw new Error('socket closed'); } sent.push(structuredClone(m)); } });
  return { client, sent, clock, failNext() { failing = true; }, tick(ms, wallMs = ms) { clock.mono += ms; clock.wall += wallMs; } };
}

test('malformed tails, private fields and bounds are rejected atomically without replacing the sample or ACKing', () => {
  assert.equal(BP.FEATURE, 'host-body-presence-v1'); assert.equal(BP.MAX, 32); assert.equal(BP.MAX_BYTES, 32768);
  assert.deepEqual(BP.validate(frame()), frame());
  const many = n => Array.from({ length: n }, (_, i) => ({ ...structuredClone(VIEW), accountId: 100 + i, bodyId: `ooga:${100 + i}`, generation: 100 + i }));
  assert.equal(BP.validate(frame({ views: many(31) })).views.length, 31); // 31 views + 1 departure = MAX
  const bad = [
    frame({ token: 'a'.repeat(32) }),
    frame({ views: [{ ...structuredClone(VIEW), token: 'a'.repeat(32) }] }),
    frame({ departures: [{ ...structuredClone(DEPART), token: 'a'.repeat(32) }] }),
    frame({ departures: [structuredClone(DEPART), { ...structuredClone(DEPART), id: 'depart:9', generation: 9, bodyId: 'ooga:9', reason: 'bogus' }] }),
    frame({ views: [structuredClone(VIEW), { ...structuredClone(VIEW), accountId: 7, bodyId: 'ooga:7', generation: 7, equipment: { ...VIEW.equipment, ammo: 3 } }] }),
    frame({ views: [{ ...structuredClone(VIEW), motion: { ...VIEW.motion, vy: -1 } }] }), // held body must not move
    frame({ views: many(32) }), // 33 bodies
    frame({ expiresAt: 2000 }), frame({ expiresAt: 12001 }), frame({ now: 55000, expiresAt: 61001 }), // past held deadline
    frame({ protocol: 'host-session-v4' }), frame({ v: 2 }), frame({ revision: 10.5 }), frame({ now: -1 }),
  ];
  for (const f of bad) assert.throws(() => BP.validate(f));

  const h = harness(), c = h.client; c.setAuthority(A); c.open(true);
  const input = env();
  assert.equal(c.message(input), true); assert.deepEqual(h.sent, [ack(5, 3, 10)]);
  const before = c.sample();
  assert.deepEqual(before, { frame: frame(), now: 2000, stale: false });
  input.frame.views[0].motion.x = 99; // stored copy is detached and immutable
  try { before.frame.views[0].motion.x = 98; } catch {}
  try { before.frame.departures.length = 0; } catch {}
  assert.deepEqual(c.sample().frame, frame());

  const next = frame({ revision: 11 });
  const badEnv = [
    ...bad.map(f => env({ ...f, revision: f.revision === 10 ? 11 : f.revision })),
    { ...env(next), extra: 1 }, env(next, { t: 'body-presence-ack' }),
    env(next, { stale: true }), env(next, { sentAt: 7000 }), // stale must equal sentAt >= expiresAt
    env(next, { sentAt: 1999 }), env(next, { sentAt: 2000.5 }),
    env(next, { authority: { ...A, revision: 6 } }), env(next, { authority: { ...A, extra: 1 } }),
    env({ ...next, world: 'other-world' }), env({ ...next, epoch: 1 }), // host epoch below Room epoch
  ];
  for (const e of badEnv) assert.equal(c.message(e), false);
  assert.deepEqual(c.sample(), before); assert.equal(h.sent.length, 1);
  assert.equal(c.message(env(next)), true); assert.deepEqual(h.sent.at(-1), ack(5, 3, 11));
});

test('authority descriptors fence order, same-tuple content, generations and send failures', () => {
  const h = harness(), c = h.client;
  assert.deepEqual(Object.keys(c).sort(), ['close', 'message', 'open', 'sample', 'setAuthority']);
  c.open(true);
  assert.equal(c.message(env()), false); // no accepted descriptor; never adopted from an envelope
  assert.equal(c.sample(), null);
  c.setAuthority(A);
  h.failNext();
  try { c.message(env()); } catch {}
  assert.deepEqual(c.sample().frame, frame()); assert.deepEqual(h.sent, []); // no rollback
  assert.equal(c.message(env()), true); assert.deepEqual(h.sent, [ack(5, 3, 10)]); // exact retry ACKs
  c.setAuthority({ ...A, revision: 4 }); c.setAuthority({ ...A, epoch: 9 }); // regression, incompatible tuple
  assert.equal(c.message(env(frame(), { authority: { ...A, revision: 4 } })), false);
  assert.equal(c.message(env(frame(), { authority: { ...A, epoch: 9 } })), false);
  assert.equal(c.message(env()), true); assert.equal(h.sent.length, 2);

  c.setAuthority({ ...A, v: 3, revision: 6 }); // unknown future version fails closed
  assert.equal(c.sample(), null);
  assert.equal(c.message(env()), false);
  assert.equal(c.message(env(frame(), { authority: { ...A, v: 3, revision: 6 } })), false);
  c.setAuthority(A); assert.equal(c.message(env()), false); // fence holds until a higher valid descriptor

  const B = { v: 2, format: 'mixed-1', mode: 'server', world: WORLD, epoch: 2, revision: 7 };
  const envB = f => env(f, { authority: { ...B } });
  c.setAuthority(B);
  assert.equal(c.sample(), null); // newer descriptor clears display, keeps prior frame fence
  assert.equal(c.message(envB(frame({ revision: 9 }))), false);
  assert.equal(c.message(envB(frame({ views: [{ ...structuredClone(VIEW), motion: { ...VIEW.motion, x: 9 } }] }))), false);
  assert.equal(c.message(envB(frame({ now: 3000, expiresAt: 8000 }))), true); // same tuple may refresh times
  assert.deepEqual(h.sent.at(-1), ack(7, 3, 10));
  const newer = { ...structuredClone(VIEW), generation: 5 };
  assert.equal(c.message(envB(frame({ epoch: 4, revision: 1, now: 3000, expiresAt: 8000, views: [newer] }))), true);
  assert.equal(c.message(envB(frame({ epoch: 5, revision: 1, now: 3000, expiresAt: 8000 }))), false); // generation 5 -> 1
  assert.equal(c.message(envB(frame({ epoch: 3, revision: 20, now: 3000, expiresAt: 8000 }))), false); // host epoch regression
  assert.equal(h.sent.length, 4);

  c.setAuthority({ v: 1, mode: 'browser', world: null, epoch: 0, revision: 8 }); // browser release
  assert.equal(c.sample(), null);
  assert.equal(c.message(envB(frame({ epoch: 4, revision: 2, now: 3000, expiresAt: 8000, views: [newer] }))), false);
  assert.equal(h.sent.length, 4);
});

test('render time is a monotonic lower bound across late join, duplicates, offsets, suspension and clock faults', () => {
  const h = harness(), c = h.client; c.setAuthority(A); c.open(true);
  const first = env(); // late join: local clocks carry an arbitrary offset
  assert.equal(c.message(first), true);
  assert.deepEqual(c.sample(), { frame: frame(), now: 2000, stale: false });
  h.tick(1000); assert.equal(c.sample().now, 3000);
  h.tick(0, 3000); assert.deepEqual([c.sample().now, c.sample().stale], [6000, false]); // forward wall jump ages
  h.tick(1000, 0); assert.equal(c.sample().now, 6000);
  h.tick(3000, 0); assert.deepEqual([c.sample().now, c.sample().stale], [7000, true]);
  assert.equal(c.message(first), true); assert.equal(h.sent.length, 2); // exact duplicate ACKs again
  assert.deepEqual([c.sample().now, c.sample().stale], [7000, true]); // but neither rewinds nor refreshes
  assert.equal(c.message(env(frame({ now: 8000, expiresAt: 13000 }))), true);
  assert.deepEqual([c.sample().now, c.sample().stale], [8000, false]); // later sentAt advances
  h.tick(2000);
  assert.equal(c.message(env(frame({ now: 8500, expiresAt: 13000 }))), true);
  assert.equal(c.sample().now, 10000); // earlier than render time: never rewinds

  const after = env(frame({ revision: 11, now: 10000, expiresAt: 15000, departures: [] }));
  assert.equal(c.message(after), true);
  assert.equal(c.message(env(frame({ now: 10000, expiresAt: 15000 }))), false); // departed beam is not replayed
  assert.deepEqual(c.sample().frame.departures, []);
  const late = env(frame({ revision: 12, now: 10000, expiresAt: 15000, departures: [] }), { sentAt: 15000, stale: true });
  assert.equal(c.message(late), true);
  assert.deepEqual([c.sample().now, c.sample().stale], [15000, true]);
  assert.equal(h.sent.length, 6);

  c.close(); assert.equal(c.sample(), null); assert.equal(c.message(late), false);
  c.open(true); assert.equal(c.sample(), null);
  assert.equal(c.message(after), false); // fence survives suspension
  assert.equal(c.message(late), true); assert.equal(c.sample().now, 15000); // clock restarts at sentAt
  h.tick(-1); // monotonic reversal latches failure for this connection
  assert.equal(c.sample(), null); assert.equal(c.message(late), false);
  h.tick(5000); assert.equal(c.sample(), null);
  assert.equal(h.sent.length, 7);
  c.close(); c.open(true);
  assert.equal(c.message(late), true); assert.equal(c.sample().now, 15000);
  h.clock.wall = NaN; // nonfinite wall reading also latches
  assert.equal(c.sample(), null); assert.equal(c.message(late), false);
  assert.equal(h.sent.length, 8);
  for (const m of h.sent) assert.deepEqual(Object.keys(m).sort(), ['authority', 'epoch', 'revision', 't']);
  assert.deepEqual(h.sent.at(-1), ack(5, 3, 12));
});
