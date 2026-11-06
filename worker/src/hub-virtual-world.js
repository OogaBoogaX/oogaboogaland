// Concrete receiving object, intentionally absent from index/wrangler exports
// and bindings until runtime, recovery, delivery and cost gates are satisfied.
import { createVirtualWorldClass } from './virtual-world.js';
import { openHubHost, createHubHost, HUB_CONFIGURATION_KEY } from './hub-host.js';
import { HOST, sameCheckpointValue } from './virtual-host.js';
import { readContributorSnapshot } from './contributor-policy.js';
import { hubActivityUpdate, hubPileUpdate } from './hub-service-sources.js';
import { validateHubPile, hubPileLevel } from './hub-pile-source.js';
const SOURCE_CURSOR = 'hub-activity-source-v1', SOURCE_INTERVAL = 60000, BUSY_WAIT = 2000;
// The last private pile read, for one run: { v, world, epoch, observedAt, status,
// kind, revision }. status is 'available' (accepted into the input queue, which
// a later simulation tick applies; already queued; unchanged; or stale and
// ignored), 'deferred' (usable but not queued while the host stayed busy),
// 'unknown' (a valid snapshot with no level) or 'unavailable' (no usable
// snapshot); kind is a fixed classification, never error or source text.
export const PILE_SOURCE = 'hub-pile-source-v1';
const FAILURES = ['binding', 'inflight', 'timeout', 'invalid', 'legacy', 'conflict', 'checkpoint'];
const failure = (error, fallback) => FAILURES.includes(error?.code) ? error.code : fallback;
const unavailable = code => Object.assign(Error('private pile source unavailable'), { code });
export class HubVirtualWorld extends createVirtualWorldClass(openHubHost) {
  // A timeout ends this wait, not the underlying RPC. Keep its latch until it
  // settles so an unavailable service cannot accumulate concurrent requests.
  async #readPileSnapshot() {
    if (!this.env.DONATIONS) throw unavailable('binding');
    if (this.pileRead) throw unavailable('inflight');
    const call = Promise.resolve().then(() => this.env.DONATIONS.pileSnapshot());
    this.pileRead = call;
    const release = () => { if (this.pileRead === call) this.pileRead = null; };
    call.then(release, release);
    let timer;
    try {
      return await Promise.race([call, new Promise((_, reject) => {
        timer = setTimeout(() => reject(unavailable('timeout')), 4000);
      })]);
    } finally { clearTimeout(timer); }
  }
  // Startup and recovery gate, called by the lifecycle before any run is bought,
  // Room acquired, body reclaimed or frame published. One read, through the same
  // latch and timeout. It passes only a known v2 snapshot that is no older than,
  // and doesn't conflict with, the latest accepted or queued pile, and renders the
  // same level as the state the first frame would show. Otherwise it refuses with
  // a fixed code and nothing is exposed.
  // Missing: a queued input is applied only by a simulation tick, which needs an
  // acquired Room, so a fresher level can't be applied before first publication.
  // A snapshot matching only a queued input, or any other level, is refused
  // ('queued', 'mismatch'); that world can't start until this path exists.
  async verifyStartup(saved) {
    const refuse = kind => { throw Object.assign(Error(`private pile source refuses exposure: ${kind}`), { code: kind }); };
    let value;
    try { value = validateHubPile(await this.#readPileSnapshot()); }
    catch (error) { refuse(failure(error, 'transport')); }
    if (value.bananas === null) refuse(value.cutover === 'pending' ? 'pending' : 'review');
    const now = Date.now(), inputs = saved?.simulation?.inputs;
    // The state the first frame shows: retained, or the configured first boot.
    const shown = saved ? saved.simulation?.state : (await this.ctx.storage.get(HUB_CONFIGURATION_KEY))?.state;
    if (!shown || saved && inputs?.v !== 3) refuse('checkpoint');
    const queued = saved ? inputs.pending?.input : null, latest = queued?.state || shown;
    if (queued ? now < queued.observedAt : saved && now < inputs.observedAt) refuse('stale');
    for (const pile of [shown.pile, latest.pile]) if (pile && pile.v !== 2) refuse('legacy');
    const held = latest.pile ?? null;
    if (held && value.revision < held.revision) refuse('stale');
    if (held && value.revision === held.revision
      && (value.bananas !== held.bananas || value.at !== held.at || value.cutover !== held.cutover)) refuse('conflict');
    let fresh, exposed, pending;
    try {
      fresh = hubPileLevel(value, now);
      exposed = shown.pile ? hubPileLevel(shown.pile, now) : shown.level;
      pending = latest.pile ? hubPileLevel(latest.pile, now) : latest.level;
    } catch { refuse('checkpoint'); }
    if (fresh !== exposed) refuse(fresh === pending ? 'queued' : 'mismatch');
  }
  // The lifecycle, tick and publication already in flight, waited on once and
  // for at most BUSY_WAIT. Source reads are none of these, so this never waits on itself.
  async #settleFlights() {
    let timer;
    try {
      await Promise.race([Promise.allSettled([this.lifecycle, this.turn, this.publication].filter(Boolean)),
        new Promise(resolve => { timer = setTimeout(resolve, BUSY_WAIT); })]);
    } finally { clearTimeout(timer); }
  }
  // At most one Oogatron and one private pile read per minute, inside the existing
  // explicitly started finite run. No alarm, automatic start or lease renewal.
  async queueServices(ticket, until) {
    await this.setup();
    const run = await this.host.worldRunState(ticket);
    if (!run.canPublish || run.status !== 'running' || run.publicationProtocol !== 1
      || run.runUntil !== until || !Number.isSafeInteger(until) || until <= Date.now()
      || until - Date.now() > HOST.maxRunMs) throw Error('finite acquired Hub service run required');
    if (this.sourceTimer) clearTimeout(this.sourceTimer);
    const generation = this.sourceGeneration = (this.sourceGeneration || 0) + 1;
    const current = () => generation === this.sourceGeneration && !this.halted && Date.now() < until;
    const schedule = delay => {
      if (!current()) return;
      this.sourceTimer = setTimeout(() => {
        this.sourceTimer = null;
        const work = (async () => {
          if (!current()) return;
          if (this.sourceRead) return;
          this.sourceRead = true;
          try {
            const now = Date.now();
            const allowed = await this.ctx.storage.transaction(async tx => {
              const prior = await tx.get(SOURCE_CURSOR);
              if (prior && now < prior.at + SOURCE_INTERVAL) return false;
              await tx.put(SOURCE_CURSOR, { at: now, generatedAt: prior?.generatedAt || 0 });
              return true;
            });
            if (!allowed || !current()) return;
            const [activity, pile] = await Promise.allSettled([
              readContributorSnapshot(), this.#readPileSnapshot(),
            ]);
            if (!current()) return;
            // The read against retained state, by the same rules as its update:
            // a lower revision is stale before anything is called unknown.
            const judge = (saved, observedAt) => {
              if (pile.status === 'rejected') return { status: 'unavailable', kind: failure(pile.reason, 'transport'), revision: null };
              try {
                const update = hubPileUpdate(saved, pile.value, observedAt), revision = pile.value.revision;
                if (update.status === 'unknown') return { status: 'unknown', kind: pile.value.cutover === 'pending' ? 'pending' : 'review', revision };
                return { status: 'available', kind: update.status, revision, input: update.input };
              } catch (error) { return { status: 'unavailable', kind: failure(error, 'invalid'), revision: null }; }
            };
            // Scoped to this run. Only this run is ever faulted: each await may
            // let a newer run begin. A failed write stops local publication and
            // still attempts the durable fault, so it never silently resumes.
            const record = async (source, observedAt) => {
              if (!current()) return;
              try {
                await this.ctx.storage.put(PILE_SOURCE, { v: 1, world: ticket.world, epoch: ticket.fence, observedAt,
                  status: source.status, kind: source.kind, revision: source.revision });
              } catch {
                if (current()) await this.fault('pile-source').catch(() => {});
                return;
              }
              if ((source.status === 'unknown' || source.status === 'unavailable') && current())
                await this.fault('pile-source').catch(() => {});
            };
            const apply = () => this.serialLifecycle(async () => {
              if (!current()) return 'superseded';
              const cursor = await this.ctx.storage.get(SOURCE_CURSOR);
              // Each source uses the latest retained/pending state. Failure of
              // one must not erase, overwrite or prevent the other's update.
              if (activity.status === 'fulfilled') {
                try {
                  const stats = activity.value, generatedAt = Date.parse(stats?.meta?.generated_at);
                  if (Number.isSafeInteger(generatedAt) && generatedAt >= (cursor?.generatedAt || 0)) {
                    const update = hubActivityUpdate(await this.retained(), stats, Date.now());
                    if (update.input) await this.host.worldInput(ticket, update.input);
                    await this.ctx.storage.put(SOURCE_CURSOR, { at: cursor.at, generatedAt: update.generatedAt });
                  }
                } catch { /* Retain the last accepted activity. */ }
              }
              if (!current()) return 'superseded';
              const observedAt = Date.now();
              let source = null;
              try {
                source = judge(await this.retained(), observedAt);
                if (source.input) {
                  if (!current()) return 'superseded';
                  const receipt = await this.host.worldInput(ticket, source.input);
                  // Only an input the host accepted into its queue, or the same one
                  // already queued, stands. A later tick applies it, not this read.
                  if (receipt?.status === 'retained') source.kind = 'retained';
                  else if (receipt?.status !== 'accepted') source = { status: 'unavailable', kind: 'input', revision: null };
                }
              } catch { source = { status: 'unavailable', kind: source ? 'input' : 'storage', revision: null }; }
              // Never keep publishing the cached level as current without a usable
              // snapshot. The durable fault needs explicit operator recovery.
              await record(source, observedAt);
              return 'done';
            }).catch(async () => { await record({ status: 'unavailable', kind: 'storage', revision: null }, Date.now()); return 'done'; });
            let outcome = await apply();
            // Busy: one bounded wait for the flights already running, then one
            // retry, with the same rate slot. Never this read's own flight.
            if (outcome?.status === 'busy') {
              await this.#settleFlights();
              if (!current()) return;
              outcome = await apply();
            }
            if (outcome?.status === 'busy') {
              // Still busy, so nothing is queued, and the result is never called
              // current. An unknown or failed read still halts this run.
              const observedAt = Date.now();
              let source;
              try { source = judge(await this.retained(), observedAt); }
              catch { source = { status: 'unavailable', kind: 'storage', revision: null }; }
              if (source.status === 'available' && source.input) source = { status: 'deferred', kind: 'busy', revision: source.revision };
              await record(source, observedAt);
            }
          } catch {
            // Keep the last durable activity. Its normal clock-based status
            // continues; a feed outage must not create new work or restart NPCs.
          } finally { this.sourceRead = false; }
        })().finally(() => schedule(SOURCE_INTERVAL));
        this.ctx.waitUntil(work);
      }, delay);
    };
    schedule(0);
  }
  // Private operator initialization only. Never overwrite an existing world's
  // version, geometry, ownership or configuration to bypass migration checks.
  configure(configuration) {
    if (!['VIRTUAL_HOST_PREVIEW', 'VIRTUAL_HOST_BODY_PREVIEW',
      'VIRTUAL_HOST_MOVEMENT_PREVIEW', 'VIRTUAL_HOST_RUNNER_PREVIEW'].every(key => this.env[key] === '1'))
      throw Error('world activation disabled');
    return this.serialLifecycle(async () => {
      createHubHost({ storage: this.ctx.storage, clock: Date.now, configuration });
      const copy = structuredClone(configuration);
      return this.ctx.storage.transaction(async tx => {
        const previous = await tx.get(HUB_CONFIGURATION_KEY);
        if (previous) {
          if (!sameCheckpointValue(previous, copy)) throw Error('Hub configuration already fixed');
          return { status: 'retained', world: previous.version };
        }
        if (await tx.get(HOST.key)) throw Error('retained Hub requires explicit migration');
        await tx.put(HUB_CONFIGURATION_KEY, copy);
        return { status: 'configured', world: copy.version };
      });
    });
  }
}
