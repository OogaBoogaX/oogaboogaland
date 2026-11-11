// Optional #384 sidecar inside #377's *same* durable transaction and fence.
// No binding, timer, public endpoint or production activation is installed.
// Caller obtains a ready Room census at the named host revision first; changes
// to admission/movement during that read refuse the operation without a write.
import { boundedJSON } from './virtual-host.js';
import { RESCUE, validateRoutes, initialRescue, validateRescue, advanceRescue, reconcileRescue, rescueCommand, projectRescue } from './rescue-world.js';
const { integer, exact } = globalThis.BL.rescueShared;
export const RESCUE_KEY = 'dsb-rescue-v1';
const fail = why => { throw Error(`host rescue: ${why}`); };
const dsb = globalThis.BL.rescueShared.zoneId;
function checkCensus(census) {
  if (!exact(census, ['ready', 'revision', 'tokens']) || typeof census.ready !== 'boolean'
    || !integer(census.revision) || !census.revision || !Array.isArray(census.tokens) || census.tokens.length > 64
    || census.tokens.some(t => typeof t !== 'string' || !/^[0-9a-f]{32}$/.test(t))
    || new Set(census.tokens).size !== census.tokens.length) fail('authenticated Room census required');
}
export class HostRescue {
  constructor({ host, routes }) {
    if (!host || typeof host.transaction !== 'function' || typeof host.read !== 'function' || typeof host.owns !== 'function') fail('virtual host required');
    this.host = host;
    this.layout = boundedJSON(validateRoutes(routes), 64 * 1024, 10000);
    this.routes = JSON.parse(this.layout);
    for (const route of this.routes) { for (const p of route) Object.freeze(p); Object.freeze(route); } Object.freeze(this.routes);
  }
  async operation(ticket, census, fn, { night = false, write = true, advance = false } = {}) {
    checkCensus(census);
    if (typeof night !== 'boolean' || typeof write !== 'boolean' || typeof advance !== 'boolean') fail('options');
    if (!census.ready) return { status: 'blocked' };
    const source = this, owner = { ...ticket }, observation = structuredClone(census);
    return this.host.transaction(async function(tx) {
      const now = this.now(), host = await this.read(tx); this.owns(host, owner, now);
      if (host.status !== 'running' || now >= host.runUntil) fail('finite run ended');
      if (observation.revision !== host.revision) return { status: 'superseded' };
      const sessions = host.sessions?.sessions || [];
      const live = sessions.filter(s => s.state === 'live' && observation.tokens.includes(s.token));
      let r = await tx.get(RESCUE_KEY), changed = false;
      if (!r) {
        if (!write) return { status: 'uninitialized' };
        r = { v: 1, world: host.world, layout: source.layout, revision: 0, at: now, state: initialRescue(now, source.routes) };
        changed = true;
      } else {
        boundedJSON(r, 192 * 1024, 25000);
        if (!exact(r, ['v', 'world', 'layout', 'revision', 'at', 'state']) || r.v !== 1 || r.world !== host.world || r.layout !== source.layout
          || !integer(r.revision) || !r.revision || !integer(r.at) || now < r.at) fail('incompatible checkpoint');
        validateRescue(r.state, source.routes);
      }
      if (write) {
        changed = reconcileRescue(r.state, sessions) || changed;
        if(advance) changed = advanceRescue(r.state, source.routes, now, live.some(s => dsb(s.zone)), night) || changed;
      }
      const output = fn ? fn(r.state, live, now) : {};
      changed = output.changed || changed;
      if (changed && write) {
        r.revision++; r.at = now;
        validateRescue(r.state, source.routes); boundedJSON(r, 192 * 1024, 25000);
        await tx.put(RESCUE_KEY, r);
      }
      // Read-only projections never advance a clock, allocate a new identity or
      // checkpoint player movement. No companion appears in this public frame.
      return { status: 'ok', changed: !!changed,
        frame: projectRescue(r.state, source.routes, { world: r.world, epoch: host.fence, revision: r.revision, at: r.at }),
        ...(output.result ? { result: output.result } : {}),
        ...(output.companions ? { companionRoster: { world: host.world, epoch: host.fence, revision: host.revision, rescueRevision: r.revision, companions: output.companions } } : {}) };
    });
  }
  tick(ticket, census, options) { return this.operation(ticket, census, null, { ...options, advance: true }); }
  snapshot(ticket, census) { return this.operation(ticket, census, null, { write: false }); }
  command(ticket, census, ref, input, options) {
    boundedJSON(input, 512, 32);
    if (!exact(ref, ['accountId', 'generation', 'token']) || !integer(ref.accountId) || !ref.accountId || !integer(ref.generation) || !ref.generation
      || typeof ref.token !== 'string' || !/^[0-9a-f]{32}$/.test(ref.token)) fail('session reference');
    const value = structuredClone(input), sessionRef = { ...ref };
    return this.operation(ticket, census, (state, live, now) => {
      const session = live.find(s => s.accountId === sessionRef.accountId && s.generation === sessionRef.generation && s.token === sessionRef.token);
      if (!session || !dsb(session.zone)) fail('current DSB session required');
      return rescueCommand(state, session, value, now);
    }, options);
  }
  // One private transaction supplies the caller's command cursor and the
  // complete live roster from the same component revision. Never guest-cache it.
  privateSnapshot(ticket, census, ref) {
    if (!exact(ref, ['accountId', 'generation', 'token']) || !integer(ref.accountId) || !ref.accountId
      || !integer(ref.generation) || !ref.generation || typeof ref.token !== 'string' || !/^[0-9a-f]{32}$/.test(ref.token)) fail('session reference');
    const who = { ...ref };
    return this.operation(ticket, census, (state, live) => {
      const session = live.find(s => s.accountId === who.accountId && s.generation === who.generation && s.token === who.token);
      if (!session || !dsb(session.zone)) fail('current DSB session required');
      const owner = state.owners.find(o => o.accountId === who.accountId), sameGeneration = owner?.generation === session.generation;
      return { result: { bodyId: session.bodyId, zone: session.zone, sequence: sameGeneration ? owner.sequence : owner ? 1 : 0, command: sameGeneration && owner.command ? JSON.parse(owner.command) : null,
        receipt: sameGeneration && owner.result ? structuredClone(owner.result) : null, dog: owner?.dog ? { ...owner.dog } : null },
        companions: live.flatMap(s => {
          const dog = state.owners.find(o => o.accountId === s.accountId)?.dog;
          return dog ? [{ accountId: s.accountId, generation: s.generation, bodyId: s.bodyId, zone: s.zone, dog: { ...dog } }] : [];
        }) };
    }, { write: false });
  }
  // Trusted live delivery only. These records contain owner identity. Never
  // pass this method's result to guest cache publication; use snapshot().frame.
  companions(ticket, census) {
    return this.operation(ticket, census, (state, live) => ({ companions: live.flatMap(session => {
      const dog = state.owners.find(o => o.accountId === session.accountId)?.dog;
      return dog ? [{ accountId: session.accountId, generation: session.generation, bodyId: session.bodyId,
        zone: session.zone, dog: { ...dog } }] : [];
    }) }), { write: false });
  }
}

// Non-durable, latest-only companion poses. Their validated owner-linked
// identity comes from HostRescue.companions(), never from a client-made roster.
// Room must replace the authoritative roster before it accepts another sample.
// Every sample echoes both revisions and the world/epoch/body fence, so a
// delayed packet cannot reappear after takeover or a scene round trip.
// Disconnect/travel/generation/release clears old samples; no stationary dog is
// invented if the owner's new scene has not sent a compatible pose yet.
export class RescueCompanionRelay {
  constructor() { this.owners = new Map(); this.poses = new Map(); this.revision = 0; this.rescueRevision = 0; this.epoch = 0; this.world = null; }
  roster({ world, epoch, revision, rescueRevision, companions }) {
    if (!globalThis.BL.rescueShared.worldId(world) || !integer(epoch) || !epoch || !integer(revision) || !revision
      || !integer(rescueRevision) || !rescueRevision
      || !Array.isArray(companions) || companions.length > 64) fail('companion roster');
    if (this.world && this.world !== world || epoch < this.epoch || epoch === this.epoch && (revision < this.revision || rescueRevision < this.rescueRevision)) return false;
    const next = new Map();
    for (const c of companions) {
      if (!exact(c, ['accountId', 'generation', 'bodyId', 'zone', 'dog']) || !integer(c.accountId) || !c.accountId || next.has(c.accountId)
        || !integer(c.generation) || !c.generation || !globalThis.BL.rescueShared.worldId(c.bodyId)
        || typeof c.zone !== 'string' || !c.zone.length || c.zone.length > 64 || !exact(c.dog, ['id', 'name', 'breed'])
        || typeof c.dog.id !== 'string' || c.dog.id.length > 80 || typeof c.dog.name !== 'string' || c.dog.name.length > 16
        || !integer(c.dog.breed) || c.dog.breed >= 6) fail('companion roster entry');
      next.set(c.accountId, structuredClone(c));
    }
    if (epoch === this.epoch && revision === this.revision && rescueRevision === this.rescueRevision) {
      if (JSON.stringify([...next]) !== JSON.stringify([...this.owners])) fail('changed companion roster retry');
      return true;
    }
    for (const [account, previous] of this.owners) {
      const current = next.get(account);
      if (epoch !== this.epoch || !current || previous.generation !== current.generation || previous.bodyId !== current.bodyId
        || previous.zone !== current.zone || previous.dog.id !== current.dog.id) this.poses.delete(account);
    }
    this.owners = next; this.epoch = epoch; this.revision = revision; this.rescueRevision = rescueRevision; this.world = world; return true;
  }
  offer(ref, pose, now) {
    const owner = this.owners.get(ref?.accountId);
    if (!integer(now) || !owner || ref.world !== this.world || ref.epoch !== this.epoch
      || ref.revision !== this.revision || ref.rescueRevision !== this.rescueRevision
      || ref.bodyId !== owner.bodyId || ref.generation !== owner.generation || ref.dog !== owner.dog.id || ref.zone !== owner.zone) return false;
    if (!exact(pose, ['sequence', 'x', 'y', 'z', 'yaw', 'activity']) || !integer(pose.sequence) || !pose.sequence
      || ![pose.x, pose.y, pose.z].every(n => Number.isFinite(n) && Math.abs(n) <= 200)
      || !Number.isFinite(pose.yaw) || Math.abs(pose.yaw) > 2 * Math.PI
      || !['follow', 'sit', 'eat', 'poop', 'sleep', 'fly', 'land'].includes(pose.activity)) return false;
    const before = this.poses.get(owner.accountId);
    if (before && (pose.sequence <= before.pose.sequence || now - before.at < 250)) return false;
    this.poses.set(owner.accountId, { at: now, pose: { ...pose } }); return true;
  }
  frame(zone, now) {
    if (!integer(now)) fail('companion clock');
    const out = [];
    for (const [accountId, c] of this.owners) {
      const p = this.poses.get(accountId);
      if (!p || now < p.at || now - p.at > 2000 || c.zone !== zone) continue;
      out.push({ ...c, dog: { ...c.dog }, pose: { ...p.pose }, at: p.at });
    }
    return out;
  }
}
