// Finite schema/encoding audit, not a CPU, network or provider billing trial.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BODY_VIEW, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { ROOM_BODY_PRESENCE, RoomBodyPresence } from '../src/room-body-presence.js';
import { RoomNpcAuthority, npcAuthorityView } from '../src/room-npc-authority.js';
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const now = 1790000000000, results = [], hashes = {};
const measureReceiver = process.argv.includes('--receiver');
const stats = samples => { const a = samples.slice().sort((x, y) => x - y); return { samples: a.length, p50: a[Math.floor(a.length * .5)], p95: a[Math.floor(a.length * .95)], max: a.at(-1) }; };
for (const path of ['../src/room-body-presence.js', '../src/host-sessions.js', '../src/virtual-host.js', '../../src/js/body-presence.js', './body-presence-size.mjs'])
  hashes[path] = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
for (const worst of [false, true]) for (const departures of [0, 16, 32]) {
  let data = new Map(), puts = 0;
  const storage = { async transaction(fn) {
    const draft = structuredClone(data);
    const out = await fn({ get: async k => structuredClone(draft.get(k)), put: async (k, v) => { draft.set(k, structuredClone(v)); puts++; } });
    data = draft; return out;
  } };
  const name = (prefix, i) => worst ? `${prefix}${i}`.padEnd(64, 'x') : `${prefix}${i}`;
  const world = name('world', 1), owner = 'host-owner', epoch = 1;
  const selected = await new RoomNpcAuthority(storage, () => now).change(0,
    { mode: 'server', world, owner, epoch, runUntil: now + 120000 });
  const authority = { ...npcAuthorityView(selected), owner }, views = [], gone = [];
  for (let i = 0; i < BODY_VIEW.maxBodies; i++) {
    const generation = worst ? Number.MAX_SAFE_INTEGER - 64 + i : i + 1;
    const accountId = worst ? Number.MAX_SAFE_INTEGER - i : i + 1;
    const motion = { x: worst ? -999999.9999999999 : i, y: worst ? -999999.9999999999 : 10, z: worst ? -999999.9999999999 : 2,
      yaw: worst ? -6.283185307179586 : .7, vx: 0, vy: 0, vz: 0, grounded: false };
    const equipment = { weapon: worst ? 'primary' : 'gun', mode: 'combat', primaryOwned: false, secondaryOwned: false,
      selectedSlot: 2, unlimited: false, jetpack: false, jetpackOwned: false };
    const bodyId = name('body', i), zone = name('zone', i);
    if (i < departures) gone.push({ id: `depart:${generation}`, type: 'depart', glyph: 'green', accountId, bodyId,
      generation, reason: 'expired', at: now, handback: worst ? { npc: name('npc', i) } : null,
      zone, body: { kind: 'clanker', motion, equipment }, applied: true });
    else views.push({ accountId, bodyId, kind: 'clanker', generation, zone, state: 'grace', deadline: now + 60000,
      presentation: 'open-hand', motion, equipment, occupancy: worst ? { kind: 'hammock', id: name('slot', i) } : null });
  }
  const frame = { v: 1, protocol: SESSION_PROTOCOL, world, epoch, revision: worst ? Number.MAX_SAFE_INTEGER - 1 : 42,
    now, expiresAt: now + 10000, views, departures: gone };
  const box = new RoomBodyPresence(storage, () => now), before = puts;
  await box.retain(authority, { world, fence: epoch, owner }, frame);
  const row = data.get(ROOM_BODY_PRESENCE.key), snapshot = await box.snapshot(authority);
  const wire = { t: 'body-presence', authority: npcAuthorityView(selected), ...snapshot, sentAt: now };
  assert.equal(puts - before, 1); assert.equal(frame.views.length + frame.departures.length, 32);
  assert.ok(bytes(frame) <= BODY_VIEW.maxBytes); assert.ok(bytes(row) <= ROOM_BODY_PRESENCE.rowBytes);
  let receiver = null;
  if (measureReceiver) {
    let acknowledgements = 0;
    const clients = Array.from({ length: 32 }, () => {
      const c = globalThis.BL.bodyPresence.create({ send: () => acknowledgements++, monotonic: () => performance.now(), wall: () => Date.now() });
      c.setAuthority(wire.authority); c.open(true); return c;
    });
    const durations = [];
    for (let revision = 1; revision <= 120; revision++) {
      const encoded = JSON.stringify({ ...wire, frame: { ...frame, revision } });
      const start = performance.now();
      for (const c of clients) assert.equal(c.message(JSON.parse(encoded)), true);
      if (revision > 20) durations.push(performance.now() - start);
    }
    assert.equal(acknowledgements, 32 * 120);
    for (const c of clients) { assert.equal(c.sample().frame.revision, 120); c.close(); }
    receiver = { scope: '32 serial Node receivers, JSON parse + validation + immutable retention + synchronous ACK sink; no rendering or sockets',
      warmup: 20, totalFrames: 120, acknowledgements, serial32ClientMs: stats(durations) };
  }
  results.push({ ...(receiver ? { receiver } : {}), profile: worst ? 'long-identity-large-number-fields' : 'representative-fields', views: views.length, departures,
    frameBytes: bytes(frame), frameHeadroomBytes: BODY_VIEW.maxBytes - bytes(frame), roomRowBytes: bytes(row),
    rowHeadroomBytes: ROOM_BODY_PRESENCE.rowBytes - bytes(row), socketEnvelopeBytes: bytes(wire),
    full32ViewerSendBytes: 32 * bytes(wire), logicalRoomPuts: puts - before });
}
console.log(JSON.stringify({ sourceHashes: hashes, results, limitations: [
  '32 records, frozen zero-momentum bodies, both current character kinds share the same public schema.',
  'Long-field cases stress bounded identities, generations, positions, occupancy and handback; not a formal exhaustive maximum over JSON numeric encodings.',
  'Optional receiver timings run all 32 decoders serially in one Node process and exclude renderer, event loop, browser and network costs.',
  'Encoding and logical in-memory puts only; no socket latency, durable runtime CPU, provider request/write billing or combined movement/NPC costs.',
  'Full fanout assumes 32 compatible ready viewers; stalled viewers coalesce under one outstanding credit.'
] }, null, 2));
