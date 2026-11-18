// The voice cleanup queue (room.js `retryCleanup`, audience-media.js `runCleanup`) against a fake SFU: what counts as a
// session gone, and an alarm's pass bounded in time and run a few jobs at once, after the sweep.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { sfuClient, turnCredentials, sessionGone, cleanupPass, CLEANUP_PARALLEL, CLEANUP_BUDGET_MS } from "../src/sfu.js";
import { getPlayer } from "../src/db.js";

const roomClass = () => {
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, getPlayer, DurableObject: class {}, WebSocketRequestResponsePair: class {}, sfuClient, turnCredentials,
    CAST_ROWS: [{ handle: "YellowBrokeIt", github_login: "YellowBrokeIt" }], Date, Map, Set, Response, Promise, setTimeout, clearTimeout };
  runInNewContext(source, context);
  context.Room.prototype.inspect = protocol.inspectReporter(null, {}, "Room", () => "", () => null);
  return context.Room;
};
const room = (sfu) => {
  const Room = roomClass(), r = Object.create(Room.prototype);
  Object.assign(r, { sockets: new Map(), players: new Map(), chatBuckets: new Map(), pinTries: new Map(), studio: studio.studioState(1000), env: {},
    cleanupJobs: [], doorQueue: [], doorActive: null, doorPasses: new Map(), roomLocks: new Map(), sweepAt: 0, sfu });
  r.ctx = { waitUntil: () => {}, storage: { put: async () => {}, getAlarm: async () => null, setAlarm: async () => {} } };
  return r;
};
const job = (session, at = Date.now()) => ({ session, at, revision: 0, mids: ["0"], midVersions: { 0: 0 }, inspect: false, inspectUntil: 0 });
const gone410 = () => Object.assign(new Error("SFU request failed: 410"), { status: 410, code: undefined });

test("a session the SFU answers 410 or 404 for is gone, with or without its error code", () => {
  assert.ok(sessionGone({ status: 410, code: "session_error" }));
  assert.ok(sessionGone({ status: 410 }), "a 410 whose body carried no code: the slow answers that kept jobs for an hour");
  assert.ok(sessionGone({ status: 404 }));
  for (const status of [0, 400, 425, 500, 503]) assert.ok(!sessionGone({ status }), String(status));
});

test("a cleanup pass runs at most CLEANUP_PARALLEL jobs at once and starts none past CLEANUP_BUDGET_MS", async () => {
  let clock = 0, running = 0, most = 0;
  const started = [];
  const jobs = Array.from({ length: 64 }, (_, i) => i);
  // Each job takes 5 s of the pass's clock, as a slow 410 does.
  const run = async (i) => { started.push(i); running++; most = Math.max(most, running); await Promise.resolve(); clock += 5000 / CLEANUP_PARALLEL; running--; };
  const count = await cleanupPass(jobs, run, () => clock);
  assert.equal(most, CLEANUP_PARALLEL);
  assert.ok(count < jobs.length, "the rest waits for the next wake");
  assert.equal(count, started.length);
  assert.ok(clock <= CLEANUP_BUDGET_MS + 5000, "no job starts past the budget");
  assert.equal(await cleanupPass([], run, () => clock), 0);
});

test("regression: a 410 without its code ends the room's job instead of retrying it every wake for an hour", async () => {
  const r = room({ closeTracks: async () => { throw gone410(); }, getSession: async () => { throw gone410(); } });
  r.cleanupJobs = [job("a"), { ...job("b"), inspect: true, inspectUntil: Date.now() + 20000 }];
  await r.retryCleanup();
  assert.deepEqual(r.cleanupJobs, []);
});

test("regression: an alarm's cleanup runs after its sweep, a few jobs at once, never all 64 in a row", async () => {
  let inFlight = 0, most = 0;
  const release = [];
  const r = room({ closeTracks: (_s, mids) => new Promise((resolve) => { inFlight++; most = Math.max(most, inFlight); release.push(() => { inFlight--; resolve({ tracks: mids.map((mid) => ({ mid })) }); }); }), getSession: async () => ({ tracks: [] }) });
  for (let i = 0; i < 64; i++) r.cleanupJobs.push(job(`s${i}`));
  const order = [];
  r.refreshHighscores = async () => { order.push("sweep"); };
  r.retryCleanup = ((orig) => async function (...args) { order.push("cleanup"); return orig.apply(this, args); })(r.retryCleanup);
  r.ctx.getWebSocketAutoResponseTimestamp = () => null;
  const alarm = r.alarm();
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["sweep", "cleanup"], "the sweep's account and stale checks never wait behind the SFU");
  assert.equal(inFlight, CLEANUP_PARALLEL, "a few jobs at once");
  while (release.length) { release.shift()(); await new Promise((resolve) => setImmediate(resolve)); }
  await alarm;
  assert.equal(most, CLEANUP_PARALLEL);
  assert.equal(r.cleanupJobs.length, 0);
});

test("a merge keeps the job's first time, so a job the SFU keeps refusing is given up after CLEANUP_MS", async () => {
  const r = room({ closeTracks: async () => { throw Object.assign(new Error("no answer"), { status: 0 }); }, getSession: async () => ({ tracks: [] }) });
  const first = Date.now() - protocol.CLEANUP_MS - 1000;
  r.cleanupJobs = [job("busy", first)];
  await r.queueClose("busy", ["1"], false, true);
  assert.ok(!r.cleanupJobs.some((j) => j.session === "busy"), "given up, not kept young by the merge");
});

// Regression (Watchtower on #790): every pass started at the queue's head and a failed job kept its place, so a dozen
// slow failures there spent each wake's budget and the jobs behind them were never tried, for up to an hour.
test("slow failures at the head of the queue cannot keep the jobs behind them from being tried", async () => {
  let clock = 0;
  const queue = Array.from({ length: 64 }, (_, i) => ({ i, slow: i < 16 }));
  const tried = new Set();
  // A slow job fails after 5 s and stays queued; any other closes at once and leaves the queue.
  const run = async (job) => {
    tried.add(job.i);
    if (job.slow) { await Promise.resolve(); clock += 5000 / CLEANUP_PARALLEL; return; }
    queue.splice(queue.indexOf(job), 1);
  };
  const first = await cleanupPass(queue, run, () => clock);
  assert.ok(first < 64, "the first pass runs out of budget on the slow head");
  assert.ok(queue[0].i >= 16 || !queue[0].slow, "the next pass starts with jobs this one never reached");
  for (let wake = 0; wake < 4 && queue.some((job) => !job.slow); wake++) await cleanupPass(queue, run, () => clock);
  assert.deepEqual(queue.map((job) => job.i).sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i), "every other job got its turn and closed");
  assert.equal(tried.size, 64);
});
