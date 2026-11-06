// Private Durable Object lifecycle. Deliberately absent from index.js and all
// deployment bindings until a complete Hub factory and activation gates exist.
// The factory must construct a VirtualHost over this object's storage using the
// real Hub geometry/roster/AI. Evaluation worlds must never be installed here.
import { DurableObject } from 'cloudflare:workers';
import { HOST } from './virtual-host.js';
import { HostWorldReceiver } from './host-world-receiver.js';
import { openHostWorldRunner } from './host-world-runner.js';
import { publishHostPoses, claimHostRoom, closeHostRoomRun } from './host-room.js';
import { HUB_WORLD_OBJECT } from './room-world-events.js';
import { retireRecoveredBodyHandoff, retainHostBodyPresence } from './host-body-room.js';

const BOOT = 'host-world-bootstrap-v1', FAULT = 'host-world-fault-v1', RETIRE = 'host-world-retirement-v1';
const enabled = env => ['VIRTUAL_HOST_PREVIEW', 'VIRTUAL_HOST_BODY_PREVIEW',
  'VIRTUAL_HOST_MOVEMENT_PREVIEW', 'VIRTUAL_HOST_RUNNER_PREVIEW'].every(key => env[key] === '1');
const fail = message => { throw Error(message); };

export function createVirtualWorldClass(createHost) {
  if (typeof createHost !== 'function') fail('complete Hub host factory required');
  return class VirtualWorld extends DurableObject {
    constructor(ctx, env) {
      super(ctx, env);
      this.ctx = ctx; this.env = env; this.host = null; this.room = null;
      this.receiver = null; this.timer = null; this.turn = null; this.publication = null;
      this.lifecycle = null; this.setupPromise = null; this.halted = false; this.nextTickAt = 0;
    }
    // No public HTTP control surface. Startup is a private operator RPC, not a
    // join side effect, browser election or automatically renewed paid run.
    fetch() { return new Response('Not found', { status: 404 }); }
    async setup() {
      if (!enabled(this.env) || !this.env.ROOM?.getByName) fail('world activation disabled');
      if (this.setupPromise) return this.setupPromise;
      if (!this.host) {
        this.setupPromise = (async () => {
        const host = await createHost({ storage: this.ctx.storage, clock: Date.now });
        if (!host?.storage || !host.simulation?.playerSpawn || !host.simulation?.poses)
          fail('complete Hub host and spawn/projection adapters required');
        this.host = host;
        this.room = this.env.ROOM.getByName(HUB_WORLD_OBJECT);
        this.receiver = new HostWorldReceiver({ storage: this.ctx.storage,
          open: async hint => {
            const ticket = { world: hint.world, fence: hint.epoch, owner: hint.owner };
            const runner = await openHostWorldRunner({ host: this.host, room: this.room, ticket, format: 'mixed-3',
              waitUntil: at => new Promise(resolve => setTimeout(resolve, Math.max(0, at - Date.now()))) });
            // Every newly opened runner, from attach, an alarm, a Room hint or a
            // tick, after its own ownership checks and before any body dispatch,
            // reclaim, tick or publication. A refusal closes it unreturned and is
            // a durable fault: no timer or later wake reaches a refused world.
            if (this.verifyStartup) {
              try { await this.verifyStartup(await this.retained()); }
              catch (error) { runner.close(); await this.fault('source').catch(() => {}); throw error; }
            }
            return { runner, room: this.room, ticket,
              roomTicket: { v: 4, format: 'mixed-3', mode: 'server', world: hint.world,
                epoch: hint.epoch, owner: hint.owner, revision: hint.revision } };
          } });
        })();
        try { await this.setupPromise; } finally { this.setupPromise = null; }
      }
    }
    async retained() {
      return this.host.storage.transaction(tx => this.host.read(tx));
    }
    serialLifecycle(operation) {
      if (this.lifecycle || this.turn || this.publication || this.receiver?.active) return Promise.resolve({ status: 'busy' });
      this.lifecycle = Promise.resolve().then(operation).finally(() => { this.lifecycle = null; });
      return this.lifecycle;
    }
    async attach(ticket) {
      const state = await this.host.worldRunState(ticket), status = await this.room.npcAuthorityStatus();
      const a = status.authority;
      if (a?.mode !== 'server' || a.world !== ticket.world || a.epoch !== ticket.fence
        || a.v !== 4 || a.format !== 'mixed-3') fail('Hub Room mapping mismatch');
      await this.receiver.attach({ v: 1, room: HUB_WORLD_OBJECT, world: ticket.world,
        epoch: ticket.fence, revision: a.revision, owner: ticket.owner, runUntil: state.runUntil });
      this.halted = false;
      this.queue();
      await this.queueServices?.(ticket, state.runUntil);
      return { status: 'attached', world: ticket.world, epoch: ticket.fence, until: state.runUntil };
    }
    startRun(input) {
      if (!input || !['durationMs,request', 'durationMs,previousFence,request'].includes(Object.keys(input).sort().join())
        || !/^[0-9a-f]{32}$/.test(input.request) || !Number.isSafeInteger(input.durationMs)
        || Object.hasOwn(input, 'previousFence') && (!Number.isSafeInteger(input.previousFence) || input.previousFence < 1)
        || input.durationMs < HOST.stepMs || input.durationMs > HOST.maxRunMs) fail('bounded private startup required');
      const request = { ...input };
      return this.serialLifecycle(async () => {
        await this.setup();
        const prior = await this.ctx.storage.get(BOOT);
        const saved = await this.retained();
        const same = prior && prior.request === request.request && prior.durationMs === request.durationMs
          && prior.previousFence === request.previousFence;
        if (prior?.request === request.request && !same) fail('startup request parameters changed');
        const stoppedAt = receipt => receipt && saved?.status === 'stopped' && !saved.room
          && saved.world === receipt.world && saved.fence === receipt.fence
          && !saved.sessions?.sessions.length && !saved.sessions?.pending.length;
        if (same && prior.retired) {
          if (!stoppedAt(prior.retired)) fail('retired startup no longer matches the retained world');
          return { ...prior.retired };
        }
        if (await this.ctx.storage.get(FAULT)) fail('world fault requires explicit operator recovery');
        if (prior && !same && !prior.retired)
          fail('different startup already retained');
        if (prior?.retired && !stoppedAt(prior.retired)) fail('previous world retirement is not complete');
        if (prior?.retired && !same && request.previousFence !== prior.retired.fence)
          fail('new startup must explicitly name the stopped predecessor');
        if (!prior && saved) fail('existing world requires startup reconciliation');
        if (!prior && request.previousFence !== undefined) fail('initial startup has no predecessor');
        // Before any run is bought, Room acquired, body reclaimed or frame
        // published: a world may refuse to expose state its sources contradict.
        await this.verifyStartup?.(saved);
        // Retain the operation identity before beginning. A lost startup reply
        // reuses the same run; it never calls begin a second time blindly.
        // A subsequent explicit start also retains the exact stopped predecessor.
        // Retrying a completed request must never buy another finite run.
        const bootstrap = same ? prior : { ...request, ...(prior?.retired
          ? { previous: { world: prior.retired.world, fence: prior.retired.fence } } : {}) };
        if (!same) await this.ctx.storage.transaction(async tx => {
          await tx.put(BOOT, bootstrap);
          await tx.delete(RETIRE);
        });
        const owner = `run-${request.request}`;
        let ticket;
        if (!saved || stoppedAt(bootstrap.previous)) ticket = await this.host.begin(owner, request.durationMs);
        else {
          if (saved.owner !== owner || saved.status !== 'running' || saved.room?.pending
            || Date.now() >= saved.runUntil || Date.now() >= saved.leaseUntil)
            fail('retained startup requires fenced recovery');
          ticket = this.host.ticket(saved);
        }
        // Acquisition itself keeps the existing compatible-viewer/occupancy
        // checks. A failed migration does not force browser players out.
        await publishHostPoses(this.host, this.room, ticket, { acquire: true, format: 'mixed-3' });
        return this.attach(ticket);
      });
    }
    recoverRun() {
      return this.serialLifecycle(async () => {
        await this.setup();
        const saved = await this.retained();
        if (!saved || Date.now() >= saved.runUntil) fail('no finite run to resume');
        if (await this.ctx.storage.get(FAULT) && Date.now() < saved.leaseUntil)
          fail('fault recovery waits for the prior lease to expire');
        // The same gate before Room takeover, body reclaim or resumed ticks.
        await this.verifyStartup?.(saved);
        let ticket;
        if (!saved.room?.pending && Date.now() < saved.leaseUntil) ticket = this.host.ticket(saved);
        else {
          if (!saved.room) fail('unpublished bootstrap requires explicit reconciliation');
          const intent = saved.room.pending ? saved.room.claim : undefined;
          if (intent && intent.v !== 1) fail('Room release is pending');
          ticket = await claimHostRoom(this.host, this.room,
            intent?.owner ?? `recover-${crypto.randomUUID()}`, intent ? { intent } : {});
        }
        const attached = await this.attach(ticket);
        await this.ctx.storage.delete(FAULT);
        return attached;
      });
    }
    queue() {
      if (this.halted || this.timer !== null) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.ctx.waitUntil(this.step().catch(() => this.fault('production')));
      }, Math.max(0, this.nextTickAt - Date.now()));
    }
    async fault(phase) {
      this.halted = true;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null; this.receiver?.runtime?.runner.close();
      if (this.receiver) this.receiver.runtime = null;
      // A fault is durable so an alarm cannot silently restart a failing loop.
      // Body/session/Room state is retained for explicit recovery or retirement.
      await this.ctx.storage.put(FAULT, { v: 1, at: Date.now(), phase });
      await this.ctx.storage.deleteAlarm();
    }
    async step() {
      if (this.halted || this.turn || this.lifecycle) return { status: 'busy' };
      const started = Date.now();
      this.turn = this.receiver.exclusive(async () => {
        const saved = await this.receiver.read(), now = Date.now();
        if (!saved || saved.status !== 'running' || now >= saved.hint.runUntil) {
          if (saved?.status === 'running') await this.receiver.scan(null);
          this.halted = true; return { status: 'closed' };
        }
        const runtime = await this.receiver.opened(saved.hint);
        if (now >= saved.nextAt || !runtime.runner.state().ready) {
          const result = await this.receiver.scan(null);
          if (result.status === 'stale') { this.halted = true; return { status: 'closed' }; }
          if (result.status === 'busy' || !runtime.runner.state().ready) return { status: 'recovering' };
        }
        const result = await runtime.runner.tick();
        if (result.status === 'closed') this.halted = true;
        // Keep projection/delivery independent of the next host transaction.
        // The existing publisher coalesces and checks ownership after pacing.
        if (!this.publication && !this.halted && runtime.runner.state().ready) {
          this.publication = runtime.runner.publish().catch(() => this.fault('publication'))
            .finally(() => { this.publication = null; });
          this.ctx.waitUntil(this.publication);
        }
        return { status: result.status };
      });
      try { return await this.turn; }
      finally {
        this.turn = null;
        // Never issue catch-up timer bursts. Simulation's own bounded step
        // budget accounts for delay, and Room retains its strict delivery gate.
        this.nextTickAt = Math.max(started + HOST.stepMs, Date.now());
        this.queue();
      }
    }
    async ingestWorldInput(ticket, input) {
      await this.setup();
      // Only a trusted same-application binding can call this RPC. There is no
      // HTTP route and no browser/Room-forwarded data path to it.
      if (this.halted || await this.ctx.storage.get(FAULT)) fail('world input paused');
      return this.serialLifecycle(() => this.host.worldInput(ticket, input));
    }
    async notifyRoomWorld(hint) {
      await this.setup();
      if (this.lifecycle || this.halted || await this.ctx.storage.get(FAULT)) return { status: 'stale', more: false };
      const result = await this.receiver.notifyRoomWorld(hint);
      if (result.status !== 'stale') this.queue();
      return result;
    }
    async alarm() {
      await this.setup();
      if (await this.ctx.storage.get(FAULT)) { await this.ctx.storage.deleteAlarm(); return; }
      // Only a previously attached finite run may resume after eviction. This
      // does not acquire a new lease or manufacture an owner from a Room hint.
      const retained = await this.receiver.read(), saved = await this.retained();
      if (retained?.status === 'running' && saved && Date.now() < saved.runUntil
        && (saved.room?.pending || Date.now() >= saved.leaseUntil)) {
        try { await this.recoverRun(); }
        catch { await this.fault('recovery'); return; }
      }
      const result = await this.receiver.alarm();
      if (result.status !== 'stale') this.queue();
    }
    retireRun() {
      return this.serialLifecycle(async () => {
        await this.setup();
        this.halted = true;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        // This refuses outstanding bodies/outboxes or missing quiescence;
        // it cannot silently discard ownership to make retirement succeed.
        const saved = await this.retained();
        let intent = saved?.room?.pending ? saved.room.claim : await this.ctx.storage.get(RETIRE);
        if (!saved || Date.now() < saved.runUntil) fail('finite run has not ended');
        if (!intent && (saved.sessions?.sessions.length || saved.sessions?.pending.length)) {
          let ticket = this.host.ticket(saved);
          if (Date.now() >= saved.leaseUntil) ticket = await claimHostRoom(this.host, this.room, `cleanup-${crypto.randomUUID()}`);
          const status = await this.room.npcAuthorityStatus(), authority = { ...status.authority, owner: ticket.owner };
          const work = await this.room.bodyRetirementWork(authority);
          if (!Array.isArray(work.identities) || work.identities.length > 4) fail('invalid retirement inventory');
          for (const identity of work.identities) {
            const retired = await retireRecoveredBodyHandoff(this.host, this.room, ticket, authority, identity);
            if (retired.status === 'blocked') return { status: 'pending' };
          }
          await this.host.reconcileBodies(ticket, []);
          await retainHostBodyPresence(this.host, this.room, ticket, authority);
          // One bounded cleanup pass. Caller may explicitly repeat; this does
          // not extend the world run or start a perpetual cleanup alarm loop.
          return { status: 'pending', more: work.more };
        }
        if (intent && intent.v !== 2) fail('Room takeover is pending');
        // Keep the release intent after completeRoomRelease removes r.room.
        // A crash between that commit and our reply must reconcile the same
        // release, not attempt another release or silently start a fresh run.
        if (!intent) intent = await this.host.prepareRoomRelease(`retire-${crypto.randomUUID()}`);
        await this.ctx.storage.put(RETIRE, intent);
        const result = await closeHostRoomRun(this.host, this.room, intent.owner, { connected: true, intent });
        if (result.status !== 'stopped') fail('world retirement did not complete');
        await this.ctx.storage.transaction(async tx => {
          const bootstrap = await tx.get(BOOT);
          if (!bootstrap) fail('world startup identity missing during retirement');
          await tx.put(BOOT, { ...bootstrap, retired: result });
          await tx.delete(FAULT);
        });
        this.receiver?.runtime?.runner.close();
        await this.ctx.storage.deleteAlarm();
        return result;
      });
    }
  };
}
