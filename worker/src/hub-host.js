// Concrete finite-host factory. Configuration is supplied by trusted private
// startup storage; this function neither starts a run nor creates a paid loop.
import { VirtualHost, HOST, boundedJSON } from './virtual-host.js';
import { BODY_STORAGE, createHostBodyStorage } from './host-body-storage.js';
import { createHubWorldSimulation } from './hub-world-simulation.js';
import { createHubBodyRecords } from './hub-body-record.js';
import { createHubBodySessions } from './hub-body-sessions.js';

export const HUB_CONFIGURATION_KEY = 'hub-host-configuration-v1';
export function createHubHost({ storage, clock = Date.now, configuration }) {
  boundedJSON(configuration, 32 * 1024, 4096);
  // Existing session/body capacities are coupled. A smaller simulation budget
  // must not silently advertise more body slots than the atomic store supports.
  if (configuration?.checkpointBytes < HOST.checkpointBytes - HOST.metadataBytes
    - BODY_STORAGE.maxBodies * HOST.sessionSlotBytes) throw Error('Hub body capacity/budget mismatch');
  const simulation = createHubWorldSimulation(configuration), records = createHubBodyRecords(simulation.version);
  const now = clock();
  if (!Number.isSafeInteger(now) || now < configuration.source.observedAt) throw Error('future Hub startup source');
  const bodyStorage = createHostBodyStorage({ storage, profile: 'hub-frozen-record-1',
    validate: records.validate,
    capture() {
      // Read-only callers can inspect storage; every actual host mutation must
      // install its transaction-scoped capture, even for an empty body set.
      throw Error('Hub body capture outside host transaction');
    } });
  return new VirtualHost({ storage: bodyStorage, simulation, sessionAdapter: createHubBodySessions(records), clock });
}

export async function openHubHost({ storage, clock }) {
  const configuration = await storage.get(HUB_CONFIGURATION_KEY);
  if (!configuration) throw Error('trusted Hub startup configuration missing');
  return createHubHost({ storage, clock, configuration });
}
