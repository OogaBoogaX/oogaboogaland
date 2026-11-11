// Explicitly installed same-origin HTTP adapter. The production index and
// Wrangler bindings do not install it. Private routes use the normal verified
// contributor session plus the current Room connection, never x-player-* data.
import { allowed, fromSite, getSessionFromRequest, json } from './http.js';
async function smallJSON(request) {
  const size = Number(request.headers.get('content-length'));
  if (Number.isFinite(size) && size > 1024) throw Error('request too large');
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '') || !request.body) throw Error('JSON required');
  const reader = request.body.getReader(), chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 1024) { await reader.cancel(); throw Error('request too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const value of chunks) { bytes.set(value, offset); offset += value.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function createRescueHandler({ delivery, env, authenticate = request => getSessionFromRequest(request, env),
  admit = id => allowed(env.ROOM_LIMITER, `rescue:${id}`) }) {
  if (!delivery || typeof authenticate !== 'function' || typeof admit !== 'function' || !env?.SITE_ORIGIN) throw Error('explicit rescue HTTP adapters required');
  return async request => {
    const path = new URL(request.url).pathname;
    if (!['/api/rescue/public', '/api/rescue/state', '/api/rescue/command', '/api/rescue/pose'].includes(path)) return json({ error: 'Not found' }, 404);
    const read = path.endsWith('/public') || path.endsWith('/state');
    if (request.method !== (read ? 'GET' : 'POST')) return json({ error: 'Method not allowed' }, 405);
    if (path.endsWith('/public')) {
      try {
        const frame = await delivery.public();
        return frame ? json({ status: 'ok', frame }, 200, { 'cache-control': 'public, max-age=1' }) : json({ status: 'unavailable' }, 503);
      } catch { return json({ status: 'unavailable' }, 503); }
    }
    if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: 'Forbidden' }, 403);
    const found = await authenticate(request);
    if (!Number.isSafeInteger(found?.player?.id) || found.player.id < 1) return json({ error: 'Sign in first' }, 401);
    if (!await admit(found.player.id)) return json({ error: 'Too many rescue requests' }, 429);
    const connection = request.headers.get('x-room-token');
    if (!connection || !/^[A-Za-z0-9-]{1,64}$/.test(connection)) return json({ error: 'Current Room connection required' }, 409);
    const identity = { accountId: found.player.id, connection };
    let input;
    if (!read) { try { input = await smallJSON(request); } catch { return json({ error: 'Invalid rescue request' }, 400); } }
    try {
      const out = read ? await delivery.read(identity) : path.endsWith('/pose')
        ? await delivery.pose(identity, input) : await delivery.command(identity, input);
      return json(out, ['ok', 'accepted', 'paced'].includes(out.status) ? 200 : 409);
    } catch {
      // No host token, private storage content or internal exception reaches a
      // requester. An uncertain command is recovered by its exact sequence.
      return json({ status: 'unavailable' }, 503);
    }
  };
}
