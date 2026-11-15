// Explicit finite host/Room rescue adapter. No binding, alarm, timer, automatic
// run or client-selected session ref. Public cache reads never call the host.
import { RescueCompanionRelay } from './host-rescue.js';
import { boundedJSON } from './virtual-host.js';
const S = globalThis.BL.rescueShared;
const fail = message => { throw Error(`rescue delivery: ${message}`); };
const key = 'dsb-rescue-public-v1';
export class RescueGuestCache {
  constructor({ storage, world, clock = Date.now, maxAgeMs = 86400000 }) {
    if (typeof storage?.transaction !== 'function' || !S.worldId(world) || typeof clock !== 'function'
      || !S.integer(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 604800000) fail('public cache configuration');
    this.storage = storage; this.world = world; this.clock = clock; this.maxAgeMs = maxAgeMs;
  }
  async publish(frame) {
    if (!S.validate(frame) || frame.world !== this.world) fail('public frame');
    const value = JSON.parse(JSON.stringify(frame)), now = this.clock();
    if (!S.integer(now) || value.at > now) fail('public clock');
    return this.storage.transaction(async tx => {
      const receiver = S.create(this.world), previous = await tx.get(key);
      if (previous && !receiver.accept(previous)) fail('invalid retained public frame');
      if (!receiver.accept(value)) return false;
      if (previous && JSON.stringify(previous) === JSON.stringify(value)) return true;
      await tx.put(key, value); return true;
    });
  }
  async read() {
    const now = this.clock(); if (!S.integer(now)) fail('public clock');
    return this.storage.transaction(async tx => {
      const frame = await tx.get(key);
      if (!frame) return null;
      if (!S.validate(frame) || frame.world !== this.world || now < frame.at) fail('retained public frame');
      return now - frame.at <= this.maxAgeMs ? JSON.parse(JSON.stringify(frame)) : null;
    });
  }
}
export class RescueDelivery {
  constructor({ host, room, rescue, ticket, roomTicket, cache, clock = Date.now }) {
    if (typeof host?.bodyLifecycleRevision !== 'function' || typeof room?.rescueObservation !== 'function'
      || typeof rescue?.privateSnapshot !== 'function' || typeof clock !== 'function'
      || ticket?.world !== roomTicket?.world || ticket?.fence !== roomTicket?.epoch || ticket?.owner !== roomTicket?.owner) fail('host/Room pairing');
    this.host = host; this.room = room; this.rescue = rescue; this.ticket = { ...ticket }; this.roomTicket = { ...roomTicket };
    this.cache = cache; this.clock = clock; this.relay = new RescueCompanionRelay(); this.closed = false;
  }
  async observation(identity = null) {
    if (this.closed) fail('closed');
    const revision = await this.host.bodyLifecycleRevision(this.ticket);
    if (this.closed) fail('closed');
    const observed = await this.room.rescueObservation(this.roomTicket, identity);
    if (this.closed) fail('closed');
    if (!observed || typeof observed.ready !== 'boolean' || !Array.isArray(observed.tokens)) fail('Room observation');
    if (identity && (!observed.ready || !observed.participant)) return null;
    return { census: { ready: observed.ready, revision, tokens: observed.tokens }, participant: observed.participant };
  }
  async publish(frame) {
    // Cache failure cannot turn an already committed command into a failure.
    // The next explicit tick/read-publication can repair it, without replaying
    // a command or starting a new paid run.
    if (!this.cache) return false;
    try { return await this.cache.publish(frame); } catch { return false; }
  }
  async tick(options) {
    const o = await this.observation(), out = await this.rescue.tick(this.ticket, o.census, options);
    if (out.status === 'ok') await this.publish(out.frame);
    return out;
  }
  async read(identity) {
    const o = await this.observation(identity); if (!o) return { status: 'blocked' };
    const out = await this.rescue.privateSnapshot(this.ticket, o.census, o.participant.ref);
    if (this.closed) fail('closed');
    if (out.status !== 'ok') return { status: out.status };
    const r = out.companionRoster, p = o.participant;
    if (out.result.bodyId !== p.bodyId || out.result.zone !== p.zone) return { status: 'superseded' };
    if (!this.relay.roster(r)) return { status: 'superseded' };
    const at = this.clock(); if (!S.integer(at) || at < out.frame.at) fail('private clock');
    // HostRescue verifies this ref is current and in DSB inside its transaction.
    const context = { world: r.world, epoch: r.epoch, revision: r.revision, rescueRevision: r.rescueRevision,
      accountId: p.ref.accountId, generation: p.ref.generation, bodyId: p.bodyId, zone: p.zone };
    return { status: 'ok', frame: out.frame, context, session: out.result,
      companions: { v: 1, world: r.world, epoch: r.epoch, revision: r.revision, rescueRevision: r.rescueRevision,
        zone: p.zone, at, companions: this.relay.frame(p.zone, at) } };
  }
  async command(identity, input) {
    boundedJSON(input, 512, 32);
    const value = structuredClone(input), o = await this.observation(identity); if (!o) return { status: 'blocked' };
    const out = await this.rescue.command(this.ticket, o.census, o.participant.ref, value);
    if (out.status !== 'ok') return { status: out.status };
    await this.publish(out.frame);
    return { status: 'ok', sequence: value.sequence, frame: out.frame, result: out.result };
  }
  async pose(identity, input) {
    boundedJSON(input, 1024, 64);
    if (!S.exact(input, ['context', 'dog', 'pose'])) fail('private pose');
    const snapshot = await this.read(identity); if (this.closed) fail('closed'); if (snapshot.status !== 'ok') return snapshot;
    const c = snapshot.context;
    if (!S.exact(input.context, Object.keys(c)) || Object.keys(c).some(k => input.context[k] !== c[k])
      || input.dog !== snapshot.session.dog?.id) return { status: 'superseded' };
    const ok = this.relay.offer({ ...c, dog: input.dog }, input.pose, this.clock());
    return { status: ok ? 'accepted' : 'paced' };
  }
  public() { return this.cache ? this.cache.read() : Promise.resolve(null); }
  close() { this.closed = true; this.relay = new RescueCompanionRelay(); }
}
