// The same aggregate REST source used by chain.js. No transaction stream,
// browser relay, credentials or permanent socket; the finite runner owns cadence.
import { validateHubInput } from './hub-world-inputs.js';
const URL = 'https://mempool.space/api/mempool', MAX_BYTES = 32 * 1024;
export async function readHubBacklog(fetcher = fetch, clock = Date.now) {
  const response = await fetcher(URL, { headers: { accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(4000) });
  if (!response.ok || !response.body) throw Error('aggregate backlog unavailable');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('aggregate backlog too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || !Number.isSafeInteger(value.count) || value.count < 0)
    throw Error('invalid aggregate backlog');
  // Source has no observation timestamp: use receipt time, not a claim that
  // this is the node's exact observation time. Outage retains previous state.
  return validateHubInput({ v: 1, kind: 'backlog', observedAt: clock(), vsize: value.vsize });
}
