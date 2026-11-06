// Finite recovery ingress for an already acquired world. Not exported by the
// deployed Worker. The binding must supply the real world factory via open;
// neither a Room hint nor an alarm is allowed to begin/renew/take over a world.
import { dispatchRoomWorldHint, validateRoomWorldHint } from './room-world-events.js';
import { HOST, boundedJSON } from './virtual-host.js';

export const WORLD_RECEIVER = Object.freeze({ key: 'host-world-receiver-v1', scanMs: 1000,
  minMs: HOST.deliveryMs, maxScans: HOST.maxRunMs / HOST.deliveryMs, maxFailures: 3 });
const equal = (a, b) => ['v', 'room', 'world', 'epoch', 'revision', 'owner', 'runUntil'].every(k => a[k] === b[k]);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = message => { throw Error(message); };
function record(value) {
  if (value === undefined) return null;
  boundedJSON(value, 1024, 32);
  if (!value || Object.keys(value).sort().join() !== 'failures,hint,lastAt,nextAt,scans,status,v'
    || value.v !== 1 || !['running', 'expired', 'paused', 'stale', 'exhausted'].includes(value.status)
    || !integer(value.lastAt) || !integer(value.nextAt) || value.nextAt < value.lastAt
    || !integer(value.scans) || value.scans > WORLD_RECEIVER.maxScans
    || !integer(value.failures) || value.failures > WORLD_RECEIVER.maxFailures)
    fail('invalid world receiver record');
  validateRoomWorldHint(value.hint);
  return value;
}

export class HostWorldReceiver {
  constructor({ storage, open, clock = Date.now }) {
    // Alarm and recovery-row updates share the SQLite transaction. This is not
    // a portable KV transaction adapter; no external RPC runs in a transaction.
    if (!storage?.sql || typeof storage.transaction !== 'function' || typeof open !== 'function')
      fail('SQLite receiver storage and trusted world opener required');
    this.storage = storage; this.open = open; this.clock = clock; this.active = false; this.runtime = null;
  }
  async exclusive(operation) {
    if (this.active) return { status: 'busy', more: true };
    this.active = true;
    try { return await operation(); } finally { this.active = false; }
  }
  now(previous = 0) {
    const now = this.clock();
    if (!integer(now) || now < previous) fail('world receiver clock moved backwards');
    return now;
  }
  async read() { return record(await this.storage.get(WORLD_RECEIVER.key)); }
  async save(value) {
    record(value);
    await this.storage.transaction(async () => {
      await this.storage.put(WORLD_RECEIVER.key, value);
      if (value.status === 'running') await this.storage.setAlarm(value.nextAt);
      else await this.storage.deleteAlarm();
    });
  }
  async opened(hint) {
    if (this.runtime && equal(this.runtime.hint, hint)) return this.runtime;
    this.runtime?.runner.close(); this.runtime = null;
    const runtime = await this.open(structuredClone(hint));
    const t = runtime?.ticket, r = runtime?.roomTicket, state = runtime?.runner?.state();
    if (!t || !r || !runtime.room || !state || state.closed || state.until !== hint.runUntil
      || t.world !== hint.world || t.fence !== hint.epoch || t.owner !== hint.owner
      || r.world !== hint.world || r.epoch !== hint.epoch || r.owner !== hint.owner || r.revision !== hint.revision) {
      runtime?.runner?.close(); fail('receiver opener returned a different world');
    }
    this.runtime = { ...runtime, hint: structuredClone(hint) };
    return this.runtime;
  }
  // Private bootstrap call only, after host/Room acquisition. Never invoked by
  // notifyRoomWorld. Reattaching the same run does not erase its failure budget.
  attach(input) {
    const hint = structuredClone(validateRoomWorldHint(input));
    return this.exclusive(async () => {
      const old = await this.read(), now = this.now(old?.lastAt);
      if (hint.runUntil <= now || hint.runUntil - now > HOST.maxRunMs) fail('finite acquired run required');
      if (old && equal(old.hint, hint)) return { status: old.status, retained: true };
      if (old && (hint.epoch <= old.hint.epoch || hint.revision <= old.hint.revision))
        fail('receiver replacement requires a newer fenced Room acquisition');
      await this.opened(hint);
      await this.save({ v: 1, hint, status: 'running', scans: 0, failures: 0, lastAt: now, nextAt: now });
      return { status: 'running', retained: false };
    });
  }
  // Both external hints and alarm redelivery read the durable schedule. A hint
  // cannot install an owner, reset a budget or move the original run deadline.
  notifyRoomWorld(input) {
    const hint = structuredClone(validateRoomWorldHint(input));
    return this.exclusive(() => this.scan(hint));
  }
  alarm() {
    // Do not acknowledge an alarm consumed during an in-flight RPC. The alarm
    // delivery must remain retryable even if this process then disappears.
    if (this.active) return Promise.reject(Error('world receiver alarm overlaps active work'));
    return this.exclusive(() => this.scan(null));
  }
  async scan(hint) {
    const value = await this.read();
    if (!value || value.status !== 'running' || hint && !equal(value.hint, hint)) return { status: 'stale', more: false };
    const now = this.now(value.lastAt);
    if (now >= value.hint.runUntil || value.scans >= WORLD_RECEIVER.maxScans) {
      value.status = now >= value.hint.runUntil ? 'expired' : 'exhausted';
      value.lastAt = now; value.nextAt = now;
      await this.save(value); this.runtime?.runner.close(); this.runtime = null;
      return { status: 'stale', more: false };
    }
    if (now < value.lastAt + WORLD_RECEIVER.minMs && value.scans > 0) {
      // An early/replayed alarm must leave a durable later wake behind.
      await this.storage.setAlarm(value.nextAt);
      return { status: 'busy', more: true };
    }
    // Reserve one bounded attempt and its backstop before the remote calls.
    // A process loss after a successful remote commit re-reads durable work.
    value.scans++; value.lastAt = now;
    value.nextAt = Math.min(value.hint.runUntil, now + WORLD_RECEIVER.scanMs);
    await this.save(value);
    const reserved = JSON.stringify(value);
    let result;
    try {
      const { runner, room, ticket, roomTicket } = await this.opened(value.hint);
      result = await dispatchRoomWorldHint(runner, room, ticket, roomTicket, value.hint);
      value.failures = 0;
      if (result.status === 'stale') value.status = 'stale';
      const state = runner.state(), finished = this.now(now);
      if (finished >= value.hint.runUntil) value.status = 'expired';
      else if (state.closed) value.status = 'stale';
      else {
        const due = state.nextBodyAt;
        if (due !== null && due !== undefined && !integer(due)) fail('invalid body recovery deadline');
        value.nextAt = Math.min(value.hint.runUntil, Math.max(finished + WORLD_RECEIVER.minMs,
          Math.min(now + WORLD_RECEIVER.scanMs, due ?? Infinity,
            result.more || !state.ready ? now + WORLD_RECEIVER.minMs : Infinity)));
      }
    } catch (error) {
      this.runtime?.runner.close(); this.runtime = null;
      if (++value.failures >= WORLD_RECEIVER.maxFailures) value.status = 'paused';
      result = { status: 'busy', more: true };
      // Keep only a counter, not arbitrary exception data or player state.
    }
    // The reservation already durably holds this exact record and wake-up.
    // An unchanged successful scan must not rewrite both once more. Changed
    // deadlines, failure counters and terminal states still commit together.
    if (JSON.stringify(value) !== reserved) await this.save(value);
    if (value.status !== 'running') { this.runtime?.runner.close(); this.runtime = null; return { status: 'stale', more: false }; }
    return result;
  }
}
