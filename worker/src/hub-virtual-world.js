// Concrete receiving object, intentionally absent from index/wrangler exports
// and bindings until runtime, recovery, delivery and cost gates are satisfied.
import { createVirtualWorldClass } from './virtual-world.js';
import { openHubHost, createHubHost, HUB_CONFIGURATION_KEY } from './hub-host.js';
import { HOST, sameCheckpointValue } from './virtual-host.js';
import { readContributorSnapshot } from './contributor-policy.js';
import { readHubBacklog } from './hub-backlog-source.js';
import { hubActivityUpdate, hubPileUpdate } from './hub-service-sources.js';
const SOURCE_CURSOR = 'hub-activity-source-v1', SOURCE_INTERVAL = 60000;
export class HubVirtualWorld extends createVirtualWorldClass(openHubHost) {
  // A timeout ends this wait, not the underlying RPC. Keep its latch until it
  // settles so an unavailable service cannot accumulate concurrent requests.
  async #readPileSnapshot() {
    if (!this.env.DONATIONS || this.pileRead) throw Error('private pile source unavailable');
    const call = Promise.resolve().then(() => this.env.DONATIONS.pileSnapshot());
    this.pileRead = call;
    const release = () => { if (this.pileRead === call) this.pileRead = null; };
    call.then(release, release);
    let timer;
    try {
      return await Promise.race([call, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('private pile source timeout')), 4000);
      })]);
    } finally { clearTimeout(timer); }
  }
  // At most one Oogatron, aggregate backlog and private pile read per minute, inside the existing
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
            const [activity, pile, backlog] = await Promise.allSettled([
              readContributorSnapshot(), this.#readPileSnapshot(), readHubBacklog(),
            ]);
            if (!current()) return;
            await this.serialLifecycle(async () => {
              if (!current()) return;
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
              if (backlog.status === 'fulfilled' && current()) {
                try { await this.host.worldInput(ticket, backlog.value); }
                catch { /* Keep the durable water reading on failure or a lost lease. */ }
              }
              if (pile.status === 'fulfilled' && current()) {
                try {
                  const input = hubPileUpdate(await this.retained(), pile.value, Date.now());
                  if (input) await this.host.worldInput(ticket, input);
                } catch { /* Retain the last accepted pile and decay schedule. */ }
              }
            });
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
