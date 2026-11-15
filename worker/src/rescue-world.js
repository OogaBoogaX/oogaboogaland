// Deterministic shared DSB strays and the existing 512-pile oldest-first ring.
// All mutation is in a host transaction; this module owns no timer or socket.
// Routes are trusted, pre-cleared DSB ground segments, never client coordinates.
import '../../src/js/rescue-shared.js';
const { LIMITS, integer, exact, point } = globalThis.BL.rescueShared;
export const RESCUE = Object.freeze({ ...LIMITS, checkpointBytes: 96 * 1024, owners: 64, respawnMs: 45000, commandMs: 250 });
const fail = why => { throw Error(`rescue: ${why}`); };
const nameOk = name => typeof name === 'string' && name.length >= 1 && name.length <= 16 && !/[\x00-\x1f\x7f<>]/.test(name);
const breedOk = n => integer(n) && n < 6;
// Dog rows: generation, rng, breed, available, from node, to node, activity,
// phase start, phase end, next poop, respawn. Logical milliseconds freeze empty.
const G = 0, RNG = 1, BREED = 2, AVAILABLE = 3, FROM = 4, TO = 5, ACT = 6, START = 7, END = 8, POOP = 9, RESPAWN = 10;
const ROAM = 0, SNIFF = 1, SIT = 2, SLEEP = 3, SQUAT = 4;
export function validateRoutes(routes) {
  if (!Array.isArray(routes) || routes.length !== RESCUE.dogs) fail('300 authoritative routes required');
  for (const route of routes) {
    if (!Array.isArray(route) || route.length < 1 || route.length > 8) fail('route size');
    for (const p of route) if (!Array.isArray(p) || p.length !== 3 || !p.every(point)
      || Math.hypot(p[0] - route[0][0], p[2] - route[0][2]) > 350) fail('route point');
  }
  return routes;
}
const random = d => { d[RNG] = (Math.imul(d[RNG], 1664525) + 1013904223) >>> 0; return d[RNG] / 4294967296; };
export function initialRescue(now, routes) {
  if (!integer(now)) fail('clock');
  validateRoutes(routes);
  return { v: 1, wallAt: now, clock: 0, active: false, nextPile: 1, owners: [], piles: [],
    dogs: routes.map((_, i) => {
      const d = [1, (5281 + Math.imul(i + 1, 2654435761)) >>> 0, i % 6, 1, 0, 0, SIT, 0, 0, 0, 0];
      d[END] = 1000 + Math.floor(random(d) * 7000); d[POOP] = Math.floor(random(d) * 480000); return d;
    }) };
}
export function validateRescue(s, routes) {
  if (!exact(s, ['v', 'wallAt', 'clock', 'active', 'nextPile', 'owners', 'piles', 'dogs']) || s.v !== 1
    || !integer(s.wallAt) || !integer(s.clock) || s.clock > s.wallAt || typeof s.active !== 'boolean'
    || !integer(s.nextPile) || s.nextPile < 1 || !Array.isArray(s.dogs) || s.dogs.length !== RESCUE.dogs
    || !Array.isArray(s.piles) || s.piles.length > RESCUE.piles || !Array.isArray(s.owners) || s.owners.length > RESCUE.owners) fail('checkpoint');
  for (let i = 0; i < s.dogs.length; i++) {
    const d = s.dogs[i];
    if (!Array.isArray(d) || d.length !== 11 || !d.every(integer) || d[G] < 1 || d[RNG] > 0xffffffff
      || !breedOk(d[BREED]) || d[AVAILABLE] > 1 || d[FROM] >= routes[i].length || d[TO] >= routes[i].length
      || d[ACT] > SQUAT || d[START] > s.clock || d[END] < d[START]) fail('dog checkpoint');
  }
  let previous = 0;
  for (const p of s.piles) {
    if (!Array.isArray(p) || p.length !== 4 || !integer(p[0]) || p[0] <= previous || p[0] >= s.nextPile
      || !p.slice(1).every(point)) fail('pile checkpoint');
    previous = p[0];
  }
  const owners = new Set(), dogs = new Set();
  for (const o of s.owners) {
    if (!exact(o, ['accountId', 'generation', 'sequence', 'at', 'command', 'result', 'dog'])
      || !integer(o.accountId) || !o.accountId || owners.has(o.accountId) || !integer(o.generation) || !o.generation
      || !integer(o.sequence) || !o.sequence || !integer(o.at)
      || typeof o.command !== 'string' || o.command.length > 512
      || !exact(o.result, ['ok', 'reason', 'dog']) || typeof o.result.ok !== 'boolean'
      || typeof o.result.reason !== 'string' || o.result.reason.length > 32) fail('owner checkpoint');
    for (const dog of [o.dog, o.result.dog]) if (dog !== null && (!exact(dog, ['id', 'name', 'breed'])
      || typeof dog.id !== 'string' || !/^(?:stray:[0-9]+:[0-9]+|adopted:[0-9]+:[0-9]+:[0-9]+)$/.test(dog.id)
      || dog.id.length > 80 || !nameOk(dog.name) || !breedOk(dog.breed))) fail('companion checkpoint');
    if (o.dog && dogs.has(o.dog.id)) fail('duplicate companion');
    owners.add(o.accountId); if (o.dog) dogs.add(o.dog.id);
  }
  if (new TextEncoder().encode(JSON.stringify(s)).byteLength > RESCUE.checkpointBytes) fail('checkpoint size');
  return s;
}
function position(d, route, clock) {
  const a = route[d[FROM]], b = route[d[TO]], t = d[ACT] === ROAM ? Math.max(0, Math.min(1, (clock - d[START]) / Math.max(1, d[END] - d[START]))) : 0;
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
export function addPile(s, xyz) {
  if (!Array.isArray(xyz) || xyz.length !== 3 || !xyz.every(point) || !Number.isSafeInteger(s.nextPile + 1)) fail('pile');
  const p = [s.nextPile++, ...xyz];
  if (s.piles.length === RESCUE.piles) s.piles.shift();
  s.piles.push(p); return p[0];
}
function step(s, routes, night) {
  for (let i = 0; i < s.dogs.length; i++) {
    const d = s.dogs[i], route = routes[i];
    if (!d[AVAILABLE]) {
      if (s.clock < d[RESPAWN]) continue;
      if (!Number.isSafeInteger(d[G] + 1)) fail('dog generation exhausted');
      d[G]++; d[AVAILABLE] = 1; d[FROM] = d[TO] = 0; d[ACT] = SIT; d[START] = s.clock; d[END] = s.clock + 1000;
      d[POOP] = s.clock + 240000 + Math.floor(random(d) * 240000); d[RESPAWN] = 0;
    }
    if (s.clock >= d[END]) {
      d[FROM] = d[TO]; d[START] = s.clock;
      if (night) { d[ACT] = SLEEP; d[END] = s.clock + 1000; }
      else if (random(d) < .5 && route.length > 1) {
        d[TO] = (d[FROM] + 1) % route.length; d[ACT] = ROAM;
        const a = route[d[FROM]], b = route[d[TO]];
        d[END] = s.clock + Math.max(1000, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 220 * 1000));
      } else { d[ACT] = random(d) < .5 ? SNIFF : SIT; d[END] = s.clock + 2000 + Math.floor(random(d) * 6000); }
    }
    if (!night && d[ACT] !== ROAM && s.clock >= d[POOP]) {
      addPile(s, position(d, route, s.clock)); d[ACT] = SQUAT; d[START] = s.clock; d[END] = s.clock + 1400;
      d[POOP] = s.clock + 240000 + Math.floor(random(d) * 240000);
    }
  }
}
// No occupied DSB, no simulation and no repeated writes. Arrival preserves the
// last committed clock/RNG; an unknown outage >8 s also freezes rather than
// manufacturing an unbounded catch-up or hundreds of overdue piles.
export function advanceRescue(s, routes, now, occupied, night = false) {
  if (!integer(now) || now < s.wallAt || typeof occupied !== 'boolean' || typeof night !== 'boolean') fail('advance');
  if (!occupied) {
    if (!s.active) return false;
    s.active = false; s.wallAt = now; return true;
  }
  if (!s.active || now - s.wallAt > RESCUE.gapMs) { s.active = true; s.wallAt = now; return true; }
  const steps = Math.floor((now - s.wallAt) / RESCUE.stepMs);
  if (!steps) return false;
  for (let i = 0; i < steps; i++) { s.clock += RESCUE.stepMs; step(s, routes, night); }
  s.wallAt += steps * RESCUE.stepMs; return true;
}
// Keep receipts through disconnect grace. New generations inherit the owner's
// companion but cannot replay the old generation's command or sequence.
export function reconcileRescue(s, sessions) {
  let changed = false;
  s.owners = s.owners.filter(o => {
    const session = sessions.find(v => v.accountId === o.accountId);
    if (!session) { changed = true; return false; }
    if (session.generation !== o.generation) {
      o.generation = session.generation; o.sequence = 1; o.command = ''; o.result = { ok: false, reason: 'generation', dog: null };
      changed = true;
    }
    return true;
  });
  return changed;
}
const result = (ok, reason, dog = null) => ({ ok, reason, dog: dog && { ...dog } });
export function rescueCommand(s, session, input, now) {
  if (!integer(now) || now < s.wallAt || !integer(session.accountId) || !session.accountId || !integer(session.generation) || !session.generation) fail('command owner');
  const fields = input?.kind === 'adopt' ? ['kind', 'sequence', 'stray', 'name', 'breed']
    : input?.kind === 'release' ? ['kind', 'sequence', 'dog'] : ['kind', 'sequence', 'pile'];
  if (!exact(input, fields) || !integer(input.sequence) || !input.sequence || !['adopt', 'release', 'scoop'].includes(input.kind)) fail('command');
  if (input.kind === 'adopt' && (!nameOk(input.name) || !breedOk(input.breed)
    || input.stray !== null && (!Array.isArray(input.stray) || input.stray.length !== 2 || !input.stray.every(integer)
      || input.stray[0] >= RESCUE.dogs || input.stray[1] < 1))) fail('adoption');
  if (input.kind === 'release' && (typeof input.dog !== 'string' || input.dog.length > 80)) fail('release');
  if (input.kind === 'scoop' && (!integer(input.pile) || input.pile < 1)) fail('scoop');
  let owner = s.owners.find(o => o.accountId === session.accountId);
  const text = JSON.stringify(input);
  if (owner) {
    if (owner.generation !== session.generation) fail('generation requires reconciliation');
    if (input.sequence === owner.sequence && owner.command) {
      if (owner.command !== text) fail('changed retry');
      return { changed: false, result: structuredClone(owner.result) };
    }
    if (input.sequence <= owner.sequence && owner.command) return { changed: false, result: result(false, 'stale') };
    if (now - owner.at < RESCUE.commandMs) return { changed: false, result: result(false, 'paced') };
  } else {
    if (s.owners.length >= RESCUE.owners) fail('owner capacity');
    owner = { accountId: session.accountId, generation: session.generation, sequence: 0, at: 0, command: '', result: null, dog: null };
    s.owners.push(owner);
  }
  let out;
  if (input.kind === 'adopt') {
    const d = input.stray && s.dogs[input.stray[0]];
    if (owner.dog) out = result(false, 'already adopted');
    else if (d && (!d[AVAILABLE] || d[G] !== input.stray[1] || d[BREED] !== input.breed)) out = result(false, 'stray unavailable');
    else {
      const dog = { id: d ? `stray:${input.stray[0]}:${d[G]}` : `adopted:${session.accountId}:${session.generation}:${input.sequence}`, name: input.name, breed: input.breed };
      if (d) { d[AVAILABLE] = 0; d[RESPAWN] = s.clock + RESCUE.respawnMs; }
      owner.dog = dog; out = result(true, 'adopted', dog);
    }
  } else if (input.kind === 'release') {
    if (owner.dog?.id !== input.dog) out = result(false, 'companion unavailable');
    else { owner.dog = null; out = result(true, 'released'); }
  } else {
    const i = s.piles.findIndex(p => p[0] === input.pile);
    if (i < 0) out = result(false, 'pile unavailable');
    else { s.piles.splice(i, 1); out = result(true, 'scooped'); }
  }
  owner.sequence = input.sequence; owner.at = now; owner.command = text; owner.result = out;
  return { changed: true, result: structuredClone(out) };
}
export function projectRescue(s, routes, { world, epoch, revision, at }) {
  const dogs = [];
  for (let i = 0; i < s.dogs.length; i++) {
    const d = s.dogs[i]; if (!d[AVAILABLE]) continue;
    const a = routes[i][d[FROM]], b = routes[i][d[TO]];
    dogs.push([i, d[G], d[BREED], d[ACT], ...position(d, routes[i], s.clock), Math.round(Math.atan2(b[0] - a[0], b[2] - a[2]) * 1000)]);
  }
  const frame = { v: 1, world, epoch, revision, at, dogs, piles: s.piles.map(p => [...p]) };
  if (!globalThis.BL.rescueShared.validate(frame)) fail('public projection');
  return frame;
}
