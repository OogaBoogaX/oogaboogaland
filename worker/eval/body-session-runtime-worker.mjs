// Finite local-only actual body/session/SQLite composition. No deployed binding.
import './host-cycle-prelude.mjs';
import '../../src/js/agent.js';
import '../../src/js/clanker-flight.js';
import '../../src/js/clanker-rage.js';
import '../../src/js/clankers.js';
import { DurableObject } from 'cloudflare:workers';
import { Room } from '../src/room.js';
import { publishHostPoses, claimHostRoom } from '../src/host-room.js';
// Diagnostic timestamp only: use Room's actual commit time for pacing instead
// of adding another 250 ms after the RPC and client validation have completed.
export class MeasuredRoom extends Room {
  async publishNpcSnapshot(...args) {
    const enteredAt = Date.now();
    const result = await super.publishNpcSnapshot(...args);
    return { ...result, publishedAt: this.npcAuthority.at,
      roomTiming: { enteredAt, returnedAt: Date.now() } };
  }
}
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage, BODY_STORAGE } from '../src/host-body-storage.js';
import { createClankerBodyCheckpoint } from '../src/clanker-roaming.js';
import { createClankerBodySessions } from '../src/clanker-body-sessions.js';
import { createCheckpointPack } from '../src/checkpoint-pack.js';
import { roamingSimulation } from './clanker-roaming-simulation.mjs';
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const equipment = { weapon: 'gun', mode: 'combat', primaryOwned: true, secondaryOwned: true,
  selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true };
const pack = createCheckpointPack(8192, { intern: true });
function body(index, world) {
  const B = globalThis.BL, id = `player-fixture-${index}`;
  const sim = B.clankers.createPlayerBody({ profile: 'static-body-3', root: B.scene.createNode(),
    ownerId: id, name: id, groundAt: () => 0, clear: () => true });
  try { return { sim, codec: createClankerBodyCheckpoint(sim, world), dispose: () => sim.dispose() }; }
  catch (error) { sim.dispose(); throw error; }
}
export class BodySessionHost extends DurableObject {
  prepare(roaming) {
    if (this.prepared) {
      if (this.prepared.roaming !== roaming) throw Error('fixture profile changed');
      return this.prepared;
    }
    const simulation = roaming ? Object.assign(roamingSimulation(globalThis.BL, 53, true), { maxSteps: 4 }) : {
      version: 'body-runtime-3', checkpointBytes: 65536, initial: () => ({ padding: 'x'.repeat(65522) }),
      validate: s => typeof s.padding === 'string', step: () => {}, project: () => ({ npcs: [], hub: { pile: 0 } }),
      npcFor: () => null, handoff: () => false,
    };
    const entries = [];
    // Bootstrap is explicitly included in the cold request measurements. The
    // retained codecs are data-only; every bootstrap rig is disposed immediately.
    for (let index = 0; index < 30; index++) {
      const f = body(index, simulation.version);
      try {
        // Authored admission into the same independent factory used by the
        // reclaim contract. No NPC possession or AI-selection transition.
        f.sim.bodyCheckpoint.restoreBody([f.sim.list[0].owner.id, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        f.sim.activate(); f.codec.neutralize();
        for (let i = 0; i < 4; i++) f.sim.update(.25);
        f.sim.player.root.position.x = -15 + 6 * (index % 6);
        f.sim.player.root.position.z = -12 + 6 * Math.floor(index / 6);
        f.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpPressed: true, jumpHeld: true });
        f.sim.update(.25); f.codec.neutralize();
        entries.push({ records: f.codec.records, checkpoint: f.codec.capture(), motion: f.codec.motion() });
      } finally { f.dispose(); }
    }
    return this.prepared = { roaming, simulation, entries };
  }
  async fetch(request) {
    const input = await request.json(), { command, now, roaming = false, bodyLoads = 1 } = input;
    if (!Number.isSafeInteger(now) || now < 0 || typeof roaming !== 'boolean') return new Response('fixture only', { status: 400 });
    // A real host reads current time at each transaction. Concurrent fixture
    // requests share a monotonic logical clock instead of freezing an older
    // publication request's time while a newer simulation sweep commits.
    this.fixtureNow = Math.max(this.fixtureNow ?? now, now);
    const f = this.prepare(roaming), world = f.simulation.version;
    const indexOf = r => {
      const i = r.accountId - 1;
      if (!Number.isInteger(i) || i < 0 || i >= 30 || r.bodyId !== `body-${i}` || r.kind !== 'clanker' || r.zone !== 'outside')
        throw Error('fixture identity mismatch');
      return i;
    };
    let writes = 0, writeBytes = 0, deletes = 0, reads = 0, readBytes = 0, constructed = 0, disposed = 0;
    const storage = { transaction: fn => this.ctx.storage.transaction(tx => fn({
      get: async k => {
        const v = await tx.get(k), values = v instanceof Map ? [...v.values()] : v === undefined ? [] : [v];
        reads += values.length; for (const value of values) readBytes += bytes(value); return v;
      },
      put: async values => {
        writes += Object.keys(values).length; for (const value of Object.values(values)) writeBytes += bytes(value);
        await tx.put(values); if (['fail-tick', 'fail-event', 'fail-ack'].includes(command)) throw Error('injected body rollback');
      }, delete: async keys => { const removed = await tx.delete(keys); deletes += Number(removed); return removed; },
    })) };
    const bank = createHostBodyStorage({ storage, profile: 'clanker-body-3', capture: () => { throw Error('body scope required'); },
      validate: saved => {
        const state = pack.unpack(saved), match = /^player-fixture-(\d+)$/.exec(state.body?.[0]);
        if (!match || !f.entries[Number(match[1])]) return false;
        f.entries[Number(match[1])].records.read(saved); return true;
      } });
    const sessionAdapter = createClankerBodySessions({
      bodyLoads,
      recordFor: r => f.entries[indexOf(r)].records, admit: r => f.entries[indexOf(r)].checkpoint,
      create: r => { const created = body(indexOf(r), world); constructed++;
        return { codec: created.codec, dispose() { created.dispose(); disposed++; } }; },
    });
    const host = new VirtualHost({ storage: bank, simulation: f.simulation, sessionAdapter, clock: () => this.fixtureNow });
    const claim = index => ({ protocol: SESSION_PROTOCOL, world, accountId: index + 1, bodyId: `body-${index}`, zone: 'outside',
      body: { kind: 'clanker', motion: f.entries[index].motion, equipment } });
    let result, error = null;
    const phases = {}, publicationTiming = {};
    const waitForPublication = async deadline => {
      const at = performance.now();
      while (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, deadline - Date.now()));
      phases['runner.pacing'] = [performance.now() - at];
      publicationTiming.notBefore = deadline;
      publicationTiming.gateReleasedAt = Date.now();
    };
    const measured = (target, names, prefix) => Object.fromEntries(names.map(name => [name, async (...args) => {
      // Bounded experimental arm only: capture closer to the existing gate to
      // reduce pose age and the interval in which a new tick can supersede it.
      // 50ms leaves margin over the prior local 28ms p95 projection. This never
      // moves the final ownership check or Room's minimum interval earlier.
      if (input.projectNearGate && prefix === 'host' && name === 'poses' && input.notBefore !== undefined) {
        if (input.rolling || input.burst || !Number.isSafeInteger(input.notBefore)
          || input.notBefore - Date.now() > 250) throw Error('bounded strict projection pacing required');
        const at = performance.now(), captureAt = input.notBefore - 50;
        while (Date.now() < captureAt) await new Promise(resolve => setTimeout(resolve, captureAt - Date.now()));
        phases['runner.projectionPacing'] = [performance.now() - at];
      }
      // The finite runner paces after projection and before the final host
      // ownership check. Waiting before projection adds that CPU time to every
      // Room interval and cannot model a four-Hz pipeline correctly.
      if (prefix === 'host' && name === 'confirmPoses' && input.notBefore !== undefined) {
        // Strict runs use the source bridge's explicit pacing. Preserve the
        // separate, disabled cadence experiments without changing their policy.
        if (input.rolling || input.burst) {
          if (!Number.isSafeInteger(input.notBefore) || input.notBefore - Date.now() > 250) throw Error('bounded publication pacing required');
          await waitForPublication(input.notBefore);
        } else {
          publicationTiming.notBefore ??= input.notBefore;
          publicationTiming.gateReleasedAt ??= Date.now();
          phases['runner.pacing'] ||= [0];
        }
      }
      const started = performance.now();
      if (command === 'publish') publicationTiming[`${prefix}.${name}.startedAt`] = Date.now();
      try { return await target[name](...args); }
      finally {
        (phases[`${prefix}.${name}`] ||= []).push(performance.now() - started);
        if (command === 'publish') publicationTiming[`${prefix}.${name}.returnedAt`] = Date.now();
      }
    }]));
    const operationAt = performance.now();
    try {
      if (command === 'begin') result = await host.begin('first', 120000);
      else if (command === 'join' || command === 'connect') {
        if (!Number.isInteger(input.index) || input.index < 0 || input.index >= 30) throw Error('fixture index');
        result = await host.connect(input.ticket, input.tokens, claim(input.index));
      } else if (command === 'close') result = await host.sessions(input.ticket, input.tokens, (r, at) => {
        for (const ref of input.refs) r.disconnect(ref, at); return true;
      });
      else if (command === 'publish') result = await publishHostPoses(
        measured(host, ['poses', 'bindRoomPublication', 'confirmPoses'], 'host'),
        measured(this.env.ROOM.get(this.env.ROOM.idFromName('fixture')),
          ['npcAuthorityStatus', 'configureNpcAuthority', 'publishNpcSnapshot'], 'room'),
        input.ticket, { acquire: input.acquire === true, format: 'mixed-1', ...(input.roomState ? { roomState: input.roomState } : {}),
          ...(input.notBefore !== undefined && !input.rolling && !input.burst ? { notBefore: input.notBefore, waitUntil: waitForPublication } : {}),
          ...(input.rolling || input.burst ? { cadence: input.burst ? 'rate-4-burst-2-v1' : 'rolling-4-v1' } : {}) });
      else if (command === 'claim') result = (await host.storage.transaction(tx => host.read(tx))).room
        ? await claimHostRoom(host, this.env.ROOM.get(this.env.ROOM.idFromName('fixture')), 'replacement') : await host.claim('replacement');
      else if (command === 'cleanup-claim') result = (await host.storage.transaction(tx => host.read(tx))).room
        ? await claimHostRoom(host, this.env.ROOM.get(this.env.ROOM.idFromName('fixture')), 'departure-cleanup') : await host.claimBodyCleanup('departure-cleanup');
      else if (command === 'ack' || command === 'fail-ack') result = await host.acknowledgeBodyDepartures(input.ticket, input.receipt);
      else if (command === 'retained-close') result = await host.closeRetainedBody(input.ticket, input.ref, input.closedAt);
      else if (command === 'event' || command === 'fail-event') result = await host.reconcileBodies(input.ticket, input.tokens, input.closes || []);
      else if (command === 'presence') result = await host.bodyPresence(input.ticket);
      else if (command === 'tick' || command === 'fail-tick') result = await host.tick(input.ticket, input.tokens);
      else if (!['inspect', 'verify'].includes(command)) throw Error('unknown fixture command');
    } catch (e) { error = e.message; }
    const diagnosticAt = performance.now(), operationMs = diagnosticAt - operationAt;
    const root = await this.ctx.storage.get(HOST.key), keys = Array.from({ length: root?.count || 0 }, (_, i) => BODY_STORAGE.prefix + i);
    const rows = keys.length ? [...(await this.ctx.storage.get(keys)).values()] : [];
    if (command === 'verify') try {
      let verified = 0;
      for (const record of [...root.host.sessions.sessions, ...root.host.sessions.pending]) {
        const component = rows.find(r => r.body.bodyId === record.bodyId).body.checkpoint;
        const fresh = body(record.accountId - 1, world);
        try {
          fresh.codec.restore(component);
          const expected = record.body?.motion || record.motion, actual = fresh.codec.motion();
          if (Object.keys(actual).some(k => !Object.is(actual[k], expected[k]))
            || fresh.sim.player.health.value !== fresh.sim.player.health.max) throw Error('actual body mismatch');
          verified++;
        } finally { fresh.dispose(); }
      }
      let npcSteps = 0;
      if (roaming) {
        npcSteps = (root.host.simulatedAt - input.epoch) / 250;
        if (!Number.isInteger(npcSteps) || npcSteps < 0 || npcSteps > (input.frameCount ?? 40) || ![40, 120].includes(input.frameCount ?? 40)) throw Error('bounded reference steps required');
        const scope = f.simulation.forTransaction();
        try {
          // Compare continuation from the exact pre-outage checkpoint, not a
          // second fresh world boot (initial rig randomization is not recovery).
          const reference = structuredClone(input.reference);
          scope.validate(reference);
          for (let i = 0; i < npcSteps; i++) scope.step(reference, 250);
          if (JSON.stringify(reference) !== JSON.stringify(root.host.simulation)) throw Error('NPC continuation mismatch');
        } finally { scope.dispose(); }
      }
      result = { verified, npcSteps };
    } catch (e) { error = e.message; }
    const rootBytes = root ? bytes(root) : 0, rowBytes = rows.map(bytes);
    const diagnosticMs = performance.now() - diagnosticAt;
    return Response.json({ error, result, phases, publicationTiming, reads, readBytes, writes, writeBytes, deletes, constructed, disposed,
      operationMs, diagnosticMs, rootBytes, rowBytes,
      saved: command === 'inspect' ? root : undefined });
  }
}
export default { fetch: (request, env) => new URL(request.url).pathname === '/room'
  ? env.ROOM.get(env.ROOM.idFromName('fixture')).fetch(request)
  : env.BODY.get(env.BODY.idFromName('fixture')).fetch(request) };
