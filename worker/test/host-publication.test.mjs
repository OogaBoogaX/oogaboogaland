import { test } from "node:test";
import assert from "node:assert/strict";
import { LatestHostPublication } from "../src/host-publication.js";
import { ROLLING_CADENCE, BURST_CADENCE, emptyCadence, advanceCadence, nextCadenceAt, validateCadence } from "../src/host-cadence.js";
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("publication retains one latest revision while a slow request is in flight, then respects Room commit spacing", async () => {
  let now = 1000, calls = 0, request = deferred(), slot;
  const runner = new LatestHostPublication({ clock: () => now, until: 10000,
    publish: ({ notBefore }) => { calls++; slot = notBefore; return request.promise; } });
  runner.offer(1); const first = runner.flush();
  assert.equal(runner.flush(), first);
  await Promise.resolve(); assert.equal(calls, 1);
  for (let sequence = 2; sequence <= 500; sequence++) runner.offer(sequence);
  assert.equal(runner.state().pending, 500); assert.equal(runner.state().stats.coalesced, 498);
  now = 1100; request.resolve({ status: "published", sequence: 1, publishedAt: 1090 }); await first;
  assert.equal((await runner.flush()).status, "paced"); assert.equal(calls, 1);
  now = 1250; request = deferred(); const latest = runner.flush(); await Promise.resolve();
  assert.equal(calls, 2); assert.equal(slot, 1340); assert.equal(runner.state().pending, null);
  now = slot; request.resolve({ status: "published", sequence: 500, publishedAt: now }); await latest;
  assert.equal(runner.offer(499), false); assert.equal(runner.state().stats.published, 2);
  assert.equal((await runner.flush()).status, "idle");
});

test("superseded reads coalesce newer work without a retry loop or an old frame queue", async () => {
  let now = 1000, calls = 0;
  const runner = new LatestHostPublication({ clock: () => now, until: 2000,
    publish: async () => { calls++; return calls === 1 ? { status: "superseded" }
      : { status: "published", sequence: 4, publishedAt: now }; } });
  runner.offer(1); const first = runner.flush(); runner.offer(2); runner.offer(3); await first;
  assert.equal((await runner.flush()).status, "paced"); assert.equal(calls, 1);
  now += 250; const next = runner.flush(); runner.offer(4); await next;
  assert.equal(runner.state().pending, null, 'the committed read already includes the pending signal');
  assert.equal(runner.state().stats.superseded, 1);
});

test("uncertain failure stops publication and cannot be retried by queued offers", async () => {
  const request = deferred(); let calls = 0;
  const runner = new LatestHostPublication({ clock: () => 1000, until: 2000,
    publish: () => { calls++; return request.promise; } });
  runner.offer(1); const active = runner.flush(); await Promise.resolve(); runner.offer(2);
  request.reject(Error('reply lost after possible commit')); await assert.rejects(active, /reply lost/);
  assert.equal(runner.state().pending, null); assert.equal(runner.state().closed, true);
  assert.equal(runner.offer(3), false); assert.equal((await runner.flush()).status, 'closed'); assert.equal(calls, 1);
});

test("explicit close and deadline prevent new work, including a queued microtask", async () => {
  let now = 1000, calls = 0;
  const create = () => new LatestHostPublication({ clock: () => now, until: 1500,
    publish: async () => { calls++; return { status: 'published', sequence: 1, publishedAt: now }; } });
  const stopped = create(); stopped.offer(1); const pending = stopped.flush(); stopped.close();
  assert.equal((await pending).status, 'closed'); assert.equal(calls, 0);
  const expired = create(); expired.offer(1); now = 1500;
  assert.equal((await expired.flush()).status, 'closed'); assert.equal(calls, 0);
  assert.throws(create, /bounded/);
  assert.throws(() => new LatestHostPublication({ clock: () => now, until: now + 900001, publish: () => {} }), /bounded/);
});

test("invalid commit evidence and backwards clocks stop the runner without publishing queued work", async () => {
  for (const result of [{ status: 'published', sequence: 0, publishedAt: 1000 },
    { status: 'published', sequence: 1, publishedAt: 1001 }, { status: 'published', sequence: 1 }, { status: 'unknown' }]) {
    const runner = new LatestHostPublication({ clock: () => 1000, until: 2000, publish: async () => result });
    runner.offer(1); await assert.rejects(runner.flush(), /invalid committed/); assert.equal(runner.state().closed, true);
  }
  let now = 1000;
  const runner = new LatestHostPublication({ clock: () => now, until: 2000, publish: async () => {} });
  runner.offer(1); now = 999; assert.throws(() => runner.flush(), /backwards/);
  now = 1000; assert.equal(runner.state().closed, true); assert.equal(runner.state().pending, null);
});

test("early new commits fail closed while exact duplicate reconciliation retains the original timestamp", async () => {
  for (const duplicate of [false, true]) {
    const runner = new LatestHostPublication({ clock: () => 1000, until: 3000,
      publish: async () => ({ status: 'reconciled', sequence: 1, publishedAt: 900, duplicate }) });
    // A new finite runner may reconcile a frame committed before it started.
    // An ordinary new commit cannot claim that earlier timestamp.
    runner.offer(1);
    if (!duplicate) {
      await assert.rejects(runner.flush(), /invalid committed/);
      assert.equal(runner.state().closed, true);
    } else {
      await runner.flush();
      assert.equal(runner.state().commitAt, 1150);
      assert.equal(runner.state().stats.published, 1);
    }
  }
});

test("closing during an authorized RPC reconciles its outcome but never starts the queued revision", async () => {
  let now = 1000, calls = 0; const request = deferred();
  const runner = new LatestHostPublication({ clock: () => now, until: 2000,
    publish: () => { calls++; return request.promise; } });
  runner.offer(1); const active = runner.flush(); await Promise.resolve(); runner.offer(2);
  runner.close(); now = 1200;
  request.resolve({ status: 'published', sequence: 1, publishedAt: 1150 });
  assert.equal((await active).status, 'published');
  assert.equal(runner.state().closed, true); assert.equal(runner.state().pending, null);
  assert.equal((await runner.flush()).status, 'closed'); assert.equal(calls, 1);
});

test("opt-in cadence absorbs timing drift with at most four attempts and commits in every rolling second", async () => {
  let now = 1000, sequence = 0, committed = emptyCadence(); const attempts = [], publications = [];
  const runner = new LatestHostPublication({ clock: () => now, until: 10000, cadence: ROLLING_CADENCE,
    publish: async ({ notBefore }) => {
      attempts.push(now); now = Math.max(now + 7, notBefore);
      committed = advanceCadence(committed, now); publications.push(now);
      return { status: 'published', sequence, publishedAt: now, cadence: ROLLING_CADENCE, nextPublishAt: nextCadenceAt(committed) };
    } });
  for (let frame = 0; frame < 24; frame++) {
    now = Math.max(now, 1000 + frame * 250); runner.offer(++sequence);
    const state = runner.state(); now = Math.max(now, state.nextAt); await runner.flush();
  }
  assert.equal(publications.at(-1), 1000 + 23 * 250 + 7, 'seven milliseconds does not accumulate every frame');
  for (const values of [attempts, publications]) for (const end of values)
    assert.ok(values.filter(t => t > end - 1000 && t <= end).length <= 4);
  assert.equal(runner.state().stats.published, 24);
  assert.equal(committed.times.length, 4);
});

test("rolling cadence bounds bursts and rejects corrupt history or silent mode changes", async () => {
  let c = emptyCadence();
  for (const now of [1000, 1125, 1250, 1375]) c = advanceCadence(c, now);
  assert.equal(nextCadenceAt(c), 2000);
  assert.throws(() => advanceCadence(c, 1999), /exceeded/);
  assert.throws(() => advanceCadence(emptyCadence(), -1), /exceeded/);
  for (const bad of [{ ...c, v: 2 }, { ...c, count: 3 }, { ...c, times: [1000, 1001, 1250, 1375] },
    { ...c, times: new Array(4) }, { ...c, extra: 0 }]) assert.throws(() => validateCadence(bad), /invalid/);
  const runner = new LatestHostPublication({ clock: () => 1000, until: 2000, cadence: ROLLING_CADENCE,
    publish: async () => ({ status: 'published', sequence: 1, publishedAt: 1000 }) });
  runner.offer(1); await assert.rejects(runner.flush(), /cadence/); assert.equal(runner.state().closed, true);
});

test("burst preview bounds sustained traffic and debt through jitter, cold restore and saturation", () => {
  let c = emptyCadence(BURST_CADENCE); const times = [];
  for (let now = 1000; now < 11000; now++) {
    if (now < nextCadenceAt(c)) continue;
    c = advanceCadence(JSON.parse(JSON.stringify(c)), now); times.push(now);
    assert.throws(() => advanceCadence(c, now + 124), /exceeded/);
  }
  assert.equal(times.length, 41, 'at most one extra publication in ten saturated seconds');
  for (let i = 0; i < times.length; i++) {
    assert.ok(times.filter(t => t > times[i] - 1000 && t <= times[i]).length <= 5);
    for (let j = i; j < times.length; j++)
      assert.ok(j - i + 1 <= 2 + Math.floor((times[j] - times[i]) / 250), 'two-frame credit plus earned service budget');
  }
  const before = structuredClone(c);
  assert.throws(() => advanceCadence(c, nextCadenceAt(c) - 1), /exceeded/);
  assert.deepEqual(c, before, 'failed attempt cannot modify debt');
  for (const corrupt of [{ ...c, v: 3 }, { ...c, count: 0 }, { ...c, theoreticalAt: c.at + 501 }, { ...c, theoreticalAt: c.at + 249 }])
    assert.throws(() => validateCadence(corrupt), /invalid/);
});

test("burst runner preserves the latest revision during a long publication and reports explicit cadence", async () => {
  let now = 1000, sequence = 1, c = emptyCadence(BURST_CADENCE), calls = 0;
  const slow = deferred();
  const runner = new LatestHostPublication({ clock: () => now, until: 5000, cadence: BURST_CADENCE,
    publish: async () => {
      calls++; if (calls === 1) await slow.promise;
      c = advanceCadence(c, now);
      return { status: 'published', sequence, publishedAt: now, cadence: BURST_CADENCE, nextPublishAt: nextCadenceAt(c) };
    } });
  runner.offer(1); const pending = runner.flush(); await Promise.resolve();
  for (let i = 2; i <= 1000; i++) runner.offer(i);
  assert.equal(runner.state().pending, 1000); assert.equal(runner.state().stats.coalesced, 998);
  now = 1600; slow.resolve(); await pending;
  now = Math.max(now, runner.state().commitAt); sequence = 1000;
  await runner.flush(); assert.equal(calls, 2); assert.equal(runner.state().pending, null);
});
