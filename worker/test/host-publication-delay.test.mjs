// Independent interleaving/recovery regressions for the strict default
// (cadence-less) LatestHostPublication scheduler. Fake clock only: no timers,
// no Room, no Hub, no scene. The fake publish callback models a Room commit
// that waits for notBefore and then lands after a fixed final-commit delay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LatestHostPublication } from "../src/host-publication.js";
import { HOST } from "../src/virtual-host.js";

const GAP = HOST.deliveryMs;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flushMicrotasks = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

// Drive a runner as a caller would: offer a fresh revision, wake at nextAt,
// await the single flight, repeat until the runner closes. The hard cap proves
// termination is caused by the runner's deadline, not by the loop bound.
async function drive({ start, until, delay, cap = 1000 }) {
  let now = start, seq = 0, iterations = 0;
  const attempts = [], publications = [], statuses = [];
  const runner = new LatestHostPublication({ clock: () => now, until,
    publish: async ({ notBefore }) => {
      attempts.push({ start: now, notBefore });
      const commit = Math.max(now, notBefore) + delay;
      // A Room that cannot commit before the run deadline reports closed at it.
      if (commit >= until) { now = until; return { status: "closed" }; }
      now = commit; publications.push(commit);
      return { status: "published", sequence: seq, publishedAt: commit };
    } });
  for (; iterations < cap; iterations++) {
    if (!runner.state().closed) runner.offer(++seq);
    const state = runner.state(); if (state.closed) break;
    now = Math.max(now, state.nextAt);
    const result = await runner.flush(); statuses.push(result.status);
    if (result.status === "closed") break;
  }
  return { runner, attempts, publications, statuses, iterations, cap, now: () => now };
}

const assertHardGuards = ({ attempts, publications }) => {
  for (let i = 1; i < attempts.length; i++)
    assert.ok(attempts[i].start - attempts[i - 1].start >= GAP, "attempt starts stay at least one delivery interval apart");
  for (let i = 1; i < publications.length; i++)
    assert.ok(publications[i] - publications[i - 1] >= GAP, "Room commits stay at least one delivery interval apart");
  for (const end of publications)
    assert.ok(publications.filter(t => t > end - 1000 && t <= end).length <= 4, "never more than four commits in any rolling second");
};

test("strict default: final commit delay adds to every commit gap, so delayed completion cannot sustain four Hz", async () => {
  const start = 1000, until = 11000;
  for (const delay of [0, 40, 300]) {
    const run = await drive({ start, until, delay });
    assert.ok(run.iterations < run.cap, "loop ended by runner closure");
    assert.equal(run.runner.state().closed, true);
    assertHardGuards(run);
    // Each notBefore is exactly the previous commit plus one delivery interval:
    // the commit gate keys off the reported publishedAt, never the attempt start.
    assert.equal(run.attempts[0].notBefore, start);
    for (let i = 1; i < run.publications.length; i++) {
      assert.equal(run.attempts[i].notBefore, run.publications[i - 1] + GAP);
      // Diagnosis: the gap is the delivery interval plus the full commit delay.
      assert.equal(run.publications[i] - run.publications[i - 1], GAP + delay, `delay ${delay} accumulates per frame`);
    }
    let expected = 0;
    while (start + delay + (GAP + delay) * expected < until) expected++;
    const stats = run.runner.state().stats;
    assert.equal(stats.published, expected);
    assert.equal(run.publications.length, expected);
    assert.ok(stats.attempts <= stats.published + 1, "at most one final attempt that could not commit");
    assert.equal(stats.superseded, 0); assert.equal(stats.coalesced, 0);
    if (delay === 0) assert.equal(expected, 40, "zero delay is the four Hz control");
    else assert.ok(expected < 40, "positive delay strictly lowers throughput below four Hz");
  }
});

test("bounded finite shutdown under delay: exact timelines, no attempt at or after the deadline, and loop termination", async () => {
  assert.equal(GAP, 250, "literal timelines below assume a 250 ms delivery interval");
  const cases = [
    { delay: 40, starts: [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2780],
      commits: [1040, 1330, 1620, 1910, 2200, 2490, 2780] },
    // Delay beyond one interval: attempts serialize behind completion, not nextAt.
    { delay: 300, starts: [1000, 1300, 1850, 2400, 2950], commits: [1300, 1850, 2400, 2950] },
  ];
  for (const { delay, starts, commits } of cases) {
    const run = await drive({ start: 1000, until: 3000, delay });
    assert.ok(run.iterations < run.cap);
    assert.deepEqual(run.attempts.map(a => a.start), starts);
    assert.deepEqual(run.publications, commits);
    assert.equal(run.statuses.at(-1), "closed", "final attempt observed the deadline and stopped");
    assert.ok(run.attempts.every(a => a.start < 3000));
    assertHardGuards(run);
    const state = run.runner.state();
    assert.equal(state.closed, true); assert.equal(state.pending, null); assert.equal(state.busy, false);
    assert.equal(state.stats.attempts, starts.length); assert.equal(state.stats.published, commits.length);
    // After shutdown no offer is accepted and no publish call is made.
    const calls = run.attempts.length;
    assert.equal(run.runner.offer(10_000), false);
    assert.equal((await run.runner.flush()).status, "closed");
    assert.equal(run.attempts.length, calls);
  }
});

test("a late reply after the deadline is reconciled once, closes the runner and drops the queued revision", async () => {
  let now = 1000, calls = 0; const request = deferred();
  const runner = new LatestHostPublication({ clock: () => now, until: 2000,
    publish: () => { calls++; return request.promise; } });
  runner.offer(1); const active = runner.flush(); await flushMicrotasks();
  assert.equal(calls, 1);
  assert.equal(runner.offer(2), true); assert.equal(runner.state().pending, 2);
  now = 2100;
  // Waking after the deadline while busy must not start a second publication.
  assert.equal(runner.flush(), active);
  assert.equal(runner.state().closed, true); assert.equal(runner.state().pending, null);
  request.resolve({ status: "published", sequence: 1, publishedAt: 1990 });
  const result = await active;
  assert.equal(result.status, "published", "a commit made before the deadline is still recorded");
  const state = runner.state();
  assert.equal(state.stats.published, 1); assert.equal(state.commitAt, 1990 + GAP);
  assert.equal(state.busy, false); assert.equal(state.pending, null);
  assert.equal(runner.offer(3), false); assert.equal((await runner.flush()).status, "closed");
  assert.equal(calls, 1);

  // A callback cannot claim "closed" while the runner is still open: fail closed.
  const early = new LatestHostPublication({ clock: () => 1000, until: 2000, publish: async () => ({ status: "closed" }) });
  early.offer(1); await assert.rejects(early.flush(), /invalid committed/);
  assert.equal(early.state().closed, true);
});

test("slow superseded attempts keep attempt pacing, never move the commit gate, and retain newer work", async () => {
  let now = 1000; const requests = [], gates = [];
  const runner = new LatestHostPublication({ clock: () => now, until: 5000,
    publish: ({ notBefore }) => { gates.push(notBefore); const d = deferred(); requests.push(d); return d.promise; } });

  runner.offer(1); const p1 = runner.flush(); await flushMicrotasks();
  now = 1030; requests[0].resolve({ status: "published", sequence: 1, publishedAt: 1030 }); await p1;
  assert.equal(runner.state().commitAt, 1030 + GAP); assert.equal(runner.state().nextAt, 1000 + GAP);

  now = 1250; runner.offer(2); const p2 = runner.flush(); await flushMicrotasks();
  assert.equal(gates[1], 1280);
  runner.offer(3);
  now = 1400; requests[1].resolve({ status: "superseded" });
  assert.equal((await p2).status, "superseded");
  let state = runner.state();
  assert.equal(state.pending, 3, "superseded does not discard the newer revision");
  assert.equal(state.commitAt, 1280, "superseded does not advance the commit gate");
  assert.equal(state.stats.superseded, 1);
  // No retry loop: the superseded attempt still consumed its attempt slot.
  assert.equal((await runner.flush()).status, "paced"); assert.equal(requests.length, 2);

  now = 1500; const p3 = runner.flush(); await flushMicrotasks();
  assert.equal(requests.length, 3); assert.equal(gates[2], 1280);
  runner.offer(5);
  // A newer committed read covers revision 4 but not the queued revision 5.
  now = 1540; requests[2].resolve({ status: "published", sequence: 4, publishedAt: 1520 });
  await p3;
  state = runner.state();
  assert.equal(state.pending, 5, "a commit older than the queued revision must not clear it");
  assert.equal(runner.offer(4), false); assert.equal(runner.offer(5), false);
  assert.equal(state.commitAt, 1520 + GAP);

  now = 1700; assert.equal((await runner.flush()).status, "paced", "attempt pacing holds after a delayed commit");
  now = 1750; const p4 = runner.flush(); await flushMicrotasks();
  assert.equal(gates[3], 1770);
  now = 1770; requests[3].resolve({ status: "published", sequence: 5, publishedAt: 1770 }); await p4;
  state = runner.state();
  assert.equal(state.pending, null);
  assert.deepEqual(state.stats, { offered: 4, coalesced: 0, attempts: 4, published: 3, superseded: 1 });
  assert.equal((await runner.flush()).status, "idle");
});

test("a delayed commit reporting a time before its notBefore gate fails closed instead of tightening pacing", async () => {
  let now = 1000; const requests = [];
  const runner = new LatestHostPublication({ clock: () => now, until: 5000,
    publish: () => { const d = deferred(); requests.push(d); return d.promise; } });
  runner.offer(1); const p1 = runner.flush(); await flushMicrotasks();
  now = 1100; requests[0].resolve({ status: "published", sequence: 1, publishedAt: 1100 }); await p1;
  now = 1250; runner.offer(2); const p2 = runner.flush(); await flushMicrotasks();
  runner.offer(3);
  // Commit gate is 1350; a fresh (non-duplicate) commit claiming 1300 is invalid.
  now = 1400; requests[1].resolve({ status: "published", sequence: 2, publishedAt: 1300 });
  await assert.rejects(p2, /invalid committed/);
  const state = runner.state();
  assert.equal(state.closed, true); assert.equal(state.pending, null);
  assert.equal(state.commitAt, 1350, "rejected evidence never moves the gate");
  assert.equal(state.stats.published, 1);
  assert.equal((await runner.flush()).status, "closed"); assert.equal(requests.length, 2);
});


test("a late response cannot legitimize a commit stamped outside the finite run", async () => {
  for (const publishedAt of [1999, 2000, 2100]) {
    let now = 1000; const request = deferred();
    const runner = new LatestHostPublication({ clock: () => now, until: 2000, publish: () => request.promise });
    runner.offer(1); const active = runner.flush(); await flushMicrotasks();
    now = 2200; request.resolve({ status: 'published', sequence: 1, publishedAt });
    if (publishedAt < 2000) { await active; assert.equal(runner.state().stats.published, 1); }
    else { await assert.rejects(active, /invalid committed/); assert.equal(runner.state().stats.published, 0); }
    assert.equal(runner.state().closed, true); assert.equal(runner.state().pending, null);
  }
});
