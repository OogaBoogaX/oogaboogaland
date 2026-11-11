// Actual rescue renderer/scene seam on synthetic flat ground, without a browser,
// provider, local database, Factory, or visibility/storage test suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { initialRescue, addPile, projectRescue } from '../src/rescue-world.js';
const routes = Array.from({ length: 300 }, (_, i) => [[(i % 20) * 500 - 4700, 0, Math.floor(i / 20) * 500 - 3500]]);
const frame = (revision = 1) => {
  const state = initialRescue(100000, routes); addPile(state, [0, 0, 0]);
  return projectRescue(state, routes, { world: 'fixture-renderer', epoch: 1, revision, at: 100000 + revision });
};
function rig({ shared = false } = {}) {
  const entries = new Map(), writes = [], context = { window: {}, TextEncoder, AbortController, URLSearchParams, location: { search: '' },
    localStorage: { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { writes.push(key); entries.set(key, value); } } };
  const load = name => runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), 'utf8'), context);
  for (const name of ['math', 'scene', 'models', 'hub-models', 'rescue-shared']) load(name);
  const B = context.window.BL, noop = () => {};
  B.crew = { COMPANION_FLIGHT: { gain: 6 }, JET_SPEED: 15, JET_RISE: 8, JET_SPARKS: [] };
  load('rescue-dogs');
  const root = B.scene.createNode(), targets = new Set(), pickOwners = new Map(), renderer = { quality: 'low' };
  const store = { dogs: {}, poops: [1, 0, 2], scooped: 3, ...(shared ? { shared: 1 } : {}) };
  const options = { root, crew: { player: null, cavemen: new Map() }, pile: { eat: () => false },
    fx: { burst: noop, puff: noop, zzzAt: noop, say: noop, sayAt: noop }, hud: { toast: noop },
    yard: { spots: [], y: 0, x: 0, z: 0, wander: 0 }, door: [0, 0], ground: () => 0, standable: () => true, flyClear: () => true,
    addTarget: (node, owner) => { targets.add(node); pickOwners.set(node, owner); }, removeTarget: node => { targets.delete(node); pickOwners.delete(node); }, pickGeometry: B.models.box({ w: 1, h: 1, d: 1, color: '#ffffff' }),
    strays: { homes: new Float32Array(routes.flatMap(r => r[0].map(n => n / 100))), renderer, clearSegment: () => true },
    camera: { position: { x: 0, y: 2, z: 10 }, target: { x: 0, y: 0, z: 0 } }, store, onRelease: noop };
  return { B, options, root, targets, pickOwners, renderer, store, entries, writes, load, noop };
}

test('real rescue renderer switches atomically, follows host rows, and preserves shared population across tiers', () => {
  const r = rig(), dogs = r.B.rescueDogs.create(r.options), first = frame();
  assert.equal(dogs.stats().strays, 60); assert.equal(dogs.stats().poops, 1);
  const bad = structuredClone(first); bad.dogs[0][4] = NaN;
  assert.equal(dogs.acceptShared(bad), false); assert.equal(dogs.shared, false); assert.equal(r.store.scooped, 3);
  assert.equal(dogs.acceptShared(first), true); assert.equal(dogs.stats().strays, 300);
  dogs.update(.05, 0, 1, r.B.rescueDogs.CHORA);
  const pilePick = [...r.pickOwners.values()].find(o => o.kind === 'poop' && o.poop === 0);
  assert.equal(dogs.sharedPile(pilePick), 1); assert.equal(dogs.sharedPile(.5), null);
  const pos = () => dogs.debug.strays().map(d => [d.x, d.y, d.z]);
  const start = JSON.stringify(pos());
  for (const quality of ['high', 'medium', 'low']) {
    r.renderer.quality = quality;
    for (let i = 0; i < 120; i++) dogs.update(.25, i / 4, 0, r.B.rescueDogs.CHORA);
    assert.equal(dogs.stats().strays, 300); assert.equal(dogs.stats().poops, 1);
    assert.equal(JSON.stringify(pos()), start, 'idle host rows cannot resume local AI');
    assert.ok(dogs.stats().dogsDrawn <= r.B.rescueDogs.DRAWN[quality]);
  }
  assert.equal(dogs.scoop(0), false); assert.equal(dogs.adopt(null, null, 0), false);
  dogs.writeStore(); assert.equal(r.store.poops.length, 0); assert.equal(r.store.scooped, 0);
  for (const node of r.root.children) if (node.instanceData) assert.ok(node.instanceData.every(Number.isFinite));
  dogs.dispose(); dogs.dispose(); assert.equal(r.root.children.length, 0); assert.equal(r.targets.size, 0);
  assert.equal(dogs.acceptShared(frame(2)), false, 'late receiver callback cannot revive a disposed visit');
});

test('real rescue renderer blends small updates, snaps new identities, and never resurrects removed rows', () => {
  const r = rig(), dogs = r.B.rescueDogs.create(r.options), first = frame(); dogs.acceptShared(first);
  const d = dogs.debug.strays()[0], next = frame(2); next.dogs[0][4] += 100;
  assert.equal(dogs.acceptShared(next), true); dogs.update(.05, 1, 1, r.B.rescueDogs.CHORA);
  let moved = dogs.debug.strays()[0]; assert.ok(moved.x > d.x && moved.x < d.x + 1);
  const dogPick = [...r.pickOwners.entries()].find(([node, owner]) => node.visible && owner.kind === 'dog')[1];
  const shown = dogs.sharedStray(dogPick); assert.equal(shown[1], 1);
  const pilePick = [...r.pickOwners.values()].find(o => o.kind === 'poop' && o.poop === 0);
  assert.equal(dogs.sharedPile(pilePick), 1);
  const birth = frame(3); birth.dogs[0][1] = 2; birth.dogs[shown[0]][1] = 2; birth.dogs[0][4] += 200;
  dogs.acceptShared(birth); moved = dogs.debug.strays()[0]; assert.equal(moved.x, d.x + 2);
  assert.equal(dogs.sharedSource.current.dogs[0][1], 2);
  assert.equal(dogs.sharedStray(dogPick)[1], 1, 'replacement generation must not overwrite a previously drawn pick');
  r.options.strays.clearSegment = () => false;
  const blocked = frame(4); blocked.dogs[0][1] = 2; blocked.dogs[0][4] += 300;
  assert.equal(dogs.acceptShared(blocked), true); assert.equal(dogs.debug.strays()[0].x, d.x + 3, 'blocked correction snaps rather than crossing geometry');
  const removed = frame(5); removed.dogs = []; removed.piles = [[2, 100, 0, 0]];
  assert.equal(dogs.acceptShared(removed), true); assert.equal(dogs.stats().strays, 0); assert.equal(dogs.stats().poops, 1);
  assert.equal(dogs.acceptShared(first), false); assert.equal(dogs.sharedPile(pilePick), 1, 'displayed pile ID survives compaction until picks redraw');
  assert.deepEqual(dogs.sharedStray(dogPick), shown, 'displayed dog identity survives pool reuse until picks redraw');
  const before = JSON.stringify(dogs.debug.strays());
  assert.equal(dogs.acceptShared({ ...removed, world: 'different-layout' }), false);
  assert.equal(JSON.stringify(dogs.debug.strays()), before);
  dogs.update(.05, 2, 1, r.B.rescueDogs.CHORA); assert.equal(dogs.sharedPile(pilePick), 2);
  dogs.dispose(); assert.equal(dogs.sharedStray(dogPick), null);
});

test('shared rescue marker fails closed before a fresh snapshot instead of reviving local piles or strays', () => {
  const r = rig({ shared: true }), dogs = r.B.rescueDogs.create(r.options);
  for (let i = 0; i < 50; i++) dogs.update(1, i, 1, r.B.rescueDogs.CHORA);
  assert.equal(dogs.stats().strays, 0); assert.equal(dogs.stats().poops, 0);
  assert.equal(dogs.acceptShared(frame()), true); assert.equal(dogs.stats().strays, 300); dogs.dispose();
});

test('real DSB scene seam migrates once per visit, never once per snapshot, and rejects late scene callbacks', () => {
  const r = rig(), B = r.B, noop = r.noop;
  B.dsbCoast = { LEVEL: -1 }; B.net = { state: { me: null }, ownCharacter: () => null };
  B.rescueRoom = { YARD: r.options.yard, PICK: r.options.pickGeometry };
  B.rescueMenu = { NAME_MAX: 16, create: () => ({ setLine: noop, dispose: noop, isOpen: false }),
    createButton: () => ({ setDog: noop, update: noop, dispose: noop }) };
  r.load('rescue-dsb'); const D = B.rescueDsb;
  r.entries.set(D.KEY, JSON.stringify({ dogs: {}, poops: [1, 0, 2], scooped: 3 }));
  const visit = D.attach({ root: r.root, crew: r.options.crew, input: { add: r.options.addTarget, remove: r.options.removeTarget },
    hud: r.options.hud, fx: r.options.fx, pilot: {}, interiors: { active: null, rooms: new Map() },
    vacancies: { resolve: () => ({ approach: { x: 0, z: 0 } }) }, land: { groundAt: () => 0, lanes: [] },
    groundAt: () => 0, walkable: () => true, flyable: () => true, camera: r.options.camera, renderer: r.renderer, world: { level: 0 }, reviewed: true });
  assert.equal(visit.acceptShared({}), false); assert.equal(r.writes.length, 0);
  const accepted = visit.acceptShared(frame()); assert.equal(accepted.accepted, true); assert.equal(accepted.persisted, true);
  assert.equal(r.entries.get(D.SHARED_KEY), '1'); assert.equal(r.writes.length, 2);
  for (let revision = 2; revision <= 40; revision++) assert.equal(visit.acceptShared(frame(revision)).accepted, true);
  assert.equal(r.writes.length, 2); assert.equal(visit.debug.adopt(), false);
  visit.dispose(); const writes = r.writes.length; visit.dispose();
  assert.equal(visit.acceptShared(frame(41)), false); assert.equal(r.writes.length, writes);
  assert.equal(r.targets.size, 0); assert.equal(r.root.children.length, 0);
});

const companionRow = (accountId = 2, changes = {}) => ({ accountId, generation: 1, bodyId: `player:${accountId}`, zone: 'dsb',
  dog: { id: `adopted:${accountId}:1:1`, name: 'Buddy', breed: 0 },
  pose: { sequence: 1, x: 0, y: 0, z: 0, yaw: 0, activity: 'follow' }, at: 100000, ...changes });
const companionFrame = (companions = [companionRow()], changes = {}) => ({ v: 1, world: 'fixture-renderer', epoch: 1,
  revision: 1, rescueRevision: 1, zone: 'dsb', at: 100000, companions, ...changes });
const companionContext = f => ({ world: f.world, epoch: f.epoch, revision: f.revision, rescueRevision: f.rescueRevision,
  accountId: 1, generation: 1, bodyId: 'player:1', zone: f.zone });

test('private rescue companions reject unauthenticated, foreign, malformed and stale frames atomically', () => {
  const r = rig({ shared: true }), dogs = r.B.rescueDogs.create(r.options), good = companionFrame();
  assert.equal(dogs.acceptCompanions(good), false);
  assert.equal(dogs.acceptCompanions(good, companionContext(good)), true);
  const invalid = [f => { f.v = 2; }, f => { f.token = 'private'; }, f => { f.epoch = 0; },
    f => { f.companions[0].pose.x = NaN; }, f => { f.companions[0].pose.y = 201; }, f => { f.companions[0].pose.yaw = Infinity; },
    f => { f.companions[0].pose.activity = 'constructor'; }, f => { f.companions[0].pose.sequence = 0; },
    f => { f.companions[0].dog.name = '<script>'; }, f => { f.companions[0].dog.id = 'contributor-pet'; },
    f => { f.companions[0].dog.breed = 6; }, f => { f.companions[0].bodyId = 'player:1'; },
    f => { f.companions[0].zone = 'dsb:other'; }, f => { f.companions[0].at = f.at + 1; },
    f => { f.companions[0].at = f.at - 2001; }, f => { f.companions.push(structuredClone(f.companions[0])); },
    f => { f.companions = Array.from({ length: 65 }, (_, i) => companionRow(i + 2)); }];
  for (const mutate of invalid) {
    const bad = structuredClone(good); mutate(bad);
    assert.equal(dogs.acceptCompanions(bad, companionContext(bad)), false);
    assert.equal(dogs.stats().companions, 1);
  }
  for (const key of ['world', 'zone', 'accountId', 'generation', 'bodyId', 'epoch', 'revision', 'rescueRevision']) {
    const context = companionContext(good); context[key] = typeof context[key] === 'number' ? 0 : '';
    assert.equal(dogs.acceptCompanions(good, context), false, key);
  }
  assert.equal(r.B.rescueShared.validate(good), false, 'private data can never be a public frame');
  assert.equal(r.store.dogs && Object.keys(r.store.dogs).length, 0);
  assert.equal(r.writes.length, 0);
  dogs.dispose();
});

test('private rescue companions use bounded real batches, all poses, no picks and no own-dog duplicate', () => {
  const r = rig({ shared: true }), D = r.B.rescueDogs, dogs = D.create(r.options);
  const count = r.root.children.length, targets = r.targets.size;
  const activities = ['follow', 'sit', 'eat', 'poop', 'sleep', 'fly', 'land'];
  const rows = Array.from({ length: 64 }, (_, i) => companionRow(i + 1, {
    pose: { sequence: 1, x: (i % 8) - 4, y: 0, z: -Math.floor(i / 8), yaw: 0, activity: activities[i % activities.length] } }));
  const f = companionFrame(rows);
  assert.equal(dogs.acceptCompanions(f, companionContext(f)), true);
  assert.equal(dogs.stats().companions, 63);
  for (const quality of ['low', 'medium', 'high']) {
    r.renderer.quality = quality; dogs.update(.1, 1, 1, D.CHORA);
    assert.equal(dogs.stats().companions, 63); assert.equal(dogs.stats().dogsDrawn, 63);
    assert.equal(r.root.children.length, count); assert.equal(r.targets.size, targets);
    assert.equal([...r.pickOwners.keys()].filter(n => n.visible && r.pickOwners.get(n).kind === 'dog').length, 0);
    for (const node of r.root.children) if (node.instanceData) {
      assert.ok(node.instanceCount * 20 <= node.instanceData.length); assert.ok(node.instanceData.every(Number.isFinite));
    }
  }
  const active = r.root.children.filter(n => n.instanceCount > 0);
  assert.ok(active.some(n => n.instanceCount === 63), 'all remote tags occupy one breed batch');
  assert.ok(active.length >= 8, 'body, limb, tail, tag, jet and flame batches receive actual poses');
  // Neither the caller mutating its rows nor a changed equal envelope can alter
  // the already copied presentation.
  f.companions[1].pose.x = 100;
  assert.equal(dogs.acceptCompanions(f, companionContext(f)), false);
  dogs.update(.1, 2, 1, D.CHORA); assert.equal(dogs.stats().dogsDrawn, 63);
  assert.equal(dogs.acceptShared(frame()), true); assert.equal(dogs.stats().strays, 300);
  assert.equal(dogs.stats().companions, 63, 'public stray slots cannot evict private companion slots');
  dogs.dispose(); assert.equal(r.root.children.length, 0); assert.equal(r.targets.size, 0);
  assert.equal(dogs.acceptCompanions(f, companionContext(f)), false);
});

test('private rescue companions reconcile sequence, release, travel, generation, epoch and timeout fences', () => {
  const r = rig({ shared: true }), D = r.B.rescueDogs, dogs = D.create(r.options);
  const accept = f => dogs.acceptCompanions(f, companionContext(f));
  const first = companionFrame(); assert.equal(accept(first), true);
  dogs.update(.05, 0, 1, D.CHORA);
  const body = r.root.children.find(n => n.instanceCount === 1);
  assert.equal(body.instanceData[12], 0);
  const nextRow = companionRow(2, { pose: { ...first.companions[0].pose, sequence: 2, x: 1 }, at: 100250 });
  const next = companionFrame([nextRow], { at: 100250 });
  assert.equal(accept(next), true); dogs.update(.05, 1, 1, D.CHORA);
  assert.ok(body.instanceData[12] > 0 && body.instanceData[12] < 1, 'small network movements interpolate in existing instanceData');
  assert.equal(accept(first), false);
  assert.equal(accept(companionFrame([companionRow(2, { at: 100500 })], { at: 100500 })), false, 'sequence rollback');
  const swapped = structuredClone(next); swapped.at += 250; swapped.companions[0].generation++;
  assert.equal(accept(swapped), false, 'identity cannot change at the same roster fence');
  const omitted = companionFrame([], { at: 100500 }); assert.equal(accept(omitted), true);
  assert.equal(dogs.stats().companions, 0);
  swapped.at = 100750; assert.equal(accept(swapped), false, 'omission cannot erase identity validation');
  swapped.revision++; swapped.companions[0].pose.sequence = 1; swapped.companions[0].pose.x = 9; swapped.companions[0].at = swapped.at;
  assert.equal(accept(swapped), true); dogs.update(.05, 2, 1, D.CHORA);
  assert.equal(body.instanceData[12], 9, 'new generation snaps rather than blending across owners');
  const released = companionFrame([], { revision: 2, rescueRevision: 2, at: 101000 });
  assert.equal(accept(released), true); assert.equal(dogs.stats().companions, 0); assert.equal(accept(swapped), false);
  const newEpoch = companionFrame([companionRow()], { epoch: 2, at: 101000 });
  assert.equal(accept(newEpoch), true); assert.equal(accept(released), false);
  dogs.update(.6, 3, 1, D.CHORA); assert.equal(dogs.stats().companions, 1);
  assert.equal(accept(newEpoch), true); dogs.update(.5, 4, 1, D.CHORA);
  assert.equal(dogs.stats().companions, 0, 'retries cannot renew a 2-second pose lease');
  const travel = companionFrame([companionRow(2, { zone: 'dsb:puppy-rescue', at: 101250 })], { epoch: 2, revision: 2, zone: 'dsb:puppy-rescue', at: 101250 });
  assert.equal(accept(travel), true); dogs.clearCompanions();
  assert.equal(dogs.stats().companions, 0); assert.equal(accept(travel), false, 'late exact callback cannot undo disconnect cleanup');
  const returning = companionFrame([companionRow(2, { at: 101500 })], { epoch: 2, revision: 3, at: 101500 });
  assert.equal(accept(returning), true);
  const publicFrame = frame(2); publicFrame.epoch = 3;
  assert.equal(dogs.acceptShared(publicFrame), true); assert.equal(dogs.stats().companions, 0);
  assert.equal(accept(returning), false, 'new public epoch clears private data until matching authenticated delivery');
  dogs.dispose();
});

test('private rescue companions publish only the local adopted pose and retain crew flight solver ownership', () => {
  const r = rig({ shared: true }), D = r.B.rescueDogs, dogs = D.create(r.options);
  assert.equal(dogs.companionPose(1), null);
  const cave = { root: r.B.scene.createNode(), baseY: 0, jet: null, hopV: 0 };
  const own = { id: 'adopted:1:1:1', name: 'Buddy', breed: 0, hunger: 0, adoptedAt: 1 };
  dogs.setOwn(cave, own);
  const f = companionFrame([companionRow(1), companionRow(2)]);
  assert.equal(dogs.acceptCompanions(f, companionContext(f)), true); assert.equal(dogs.stats().companions, 1);
  dogs.update(.05, 0, 1, D.CHORA);
  const p = dogs.companionPose(1);
  assert.deepEqual(Object.keys(p).sort(), ['activity', 'sequence', 'x', 'y', 'yaw', 'z']);
  assert.equal(p.activity, 'follow'); assert.equal(p.x, dogs.debug.dog().x);
  assert.equal(dogs.companionPose(0), null);
  let flight = 0;
  r.B.crew.flyCompanion = s => { flight++; s.x = 2; s.y = 3; s.z = 4; s.heading = .5; return false; };
  cave.root.position.y = 3; cave.jet = { power: 1, thrust: true }; cave.jetFuel = 1;
  dogs.update(.05, 1, 1, D.CHORA);
  const flying = dogs.companionPose(2);
  assert.equal(flight, 1); assert.equal(flying.activity, 'fly');
  assert.deepEqual([flying.x, flying.y, flying.z, flying.yaw], [2, 3, 4, .5]);
  cave.root.visible = false; assert.equal(dogs.companionPose(3), null);
  dogs.setOwn(null, null); assert.equal(dogs.companionPose(4), null);
  dogs.dispose(); assert.equal(dogs.companionPose(5), null);
});

test('private rescue companions recover a missed remote travel without accepting an old scene stream', () => {
  const r = rig({ shared: true }), D = r.B.rescueDogs, dogs = D.create(r.options);
  const first = companionFrame([companionRow(2, { pose: { sequence: 5, x: 0, y: 0, z: 0, yaw: 0, activity: 'follow' } })]);
  assert.equal(dogs.acceptCompanions(first, companionContext(first)), true); dogs.update(.05, 0, 1, D.CHORA);
  const body = r.root.children.find(n => n.instanceCount === 1);
  // The owner went away and came back while this viewer missed the intermediate
  // roster. Its current host revision proves this is a new relay stream.
  const back = companionFrame([companionRow(2, { at: 100250, pose: { sequence: 1, x: 2, y: 0, z: 0, yaw: 0, activity: 'follow' } })], { revision: 3, at: 100250 });
  assert.equal(dogs.acceptCompanions(back, companionContext(back)), true); dogs.update(.05, 1, 1, D.CHORA);
  assert.equal(body.instanceData[12], 2, 'fresh stream snaps after travel');
  assert.equal(dogs.acceptCompanions(first, companionContext(first)), false);
  dogs.dispose();
});

test('actual DSB scene waits for shared adoption/release acknowledgements and never persists an optimistic local adoption', async () => {
  const r = rig(), B = r.B, noop = r.noop; r.load('rescue-client');
  const cave = { root: B.scene.createNode(), baseY: 0, traits: { name: 'owner', display: 'Owner' } };
  r.options.crew.cavemen.set('owner', cave);
  B.accountIdentities = { accountForId: () => null, accountForHandle: () => null };
  B.dsbCoast = { LEVEL: -1 }; B.net = { state: { me: { id: 1, login: 'owner' }, room: 'live', connectionToken: 'fixture-connection', zone: 'dsb-outside' },
    ownCharacter: () => ({ handle: 'owner' }), mayDrive: () => false };
  B.rescueRoom = { YARD: r.options.yard, PICK: r.options.pickGeometry }; let releaseDog;
  B.rescueMenu = { NAME_MAX: 16, create: () => ({ setLine: noop, dispose: noop, close: noop, isOpen: false }),
    createButton: options => { releaseDog = options.onRelease; return { setDog: noop, update: noop, dispose: noop }; } };
  r.load('rescue-dsb');
  let current = frame(), own = null, sequence = 0, settle;
  const context = () => ({ world: current.world, epoch: current.epoch, revision: 1, rescueRevision: current.revision,
    accountId: 1, generation: 1, bodyId: 'player:1', zone: 'dsb-outside' });
  const fetcher = async (path, options) => {
    if (path.endsWith('/state')) return Response.json({ status: 'ok', frame: current, context: context(),
      session: { bodyId: 'player:1', zone: 'dsb-outside', sequence, command: null, receipt: null, dog: own },
      companions: { v: 1, world: current.world, epoch: current.epoch, revision: 1, rescueRevision: current.revision, zone: 'dsb-outside', at: current.at, companions: [] } });
    assert.equal(path, '/api/rescue/command'); const input = JSON.parse(options.body);
    await new Promise(resolve => { settle = resolve; }); sequence = input.sequence; current = frame(current.revision + 1);
    own = input.kind === 'adopt' ? { id: `adopted:1:1:${sequence}`, name: input.name, breed: input.breed } : null;
    return Response.json({ status: 'ok', sequence, frame: current, result: { ok: true, reason: input.kind === 'adopt' ? 'adopted' : 'released', dog: own } });
  };
  const visit = B.rescueDsb.attach({ root: r.root, crew: r.options.crew, input: { add: r.options.addTarget, remove: r.options.removeTarget },
    hud: r.options.hud, fx: r.options.fx, pilot: {}, interiors: { active: null, rooms: new Map() },
    vacancies: { resolve: () => ({ approach: { x: 0, z: 0 } }) }, land: { groundAt: () => 0, lanes: [] },
    groundAt: () => 0, walkable: () => true, flyable: () => true, camera: r.options.camera, renderer: r.renderer, world: { level: 0 }, reviewed: true });
  assert.equal(visit.connectShared({ world: current.world, fetcher }), true);
  assert.equal(visit.debug.adopt(2, 'Too soon'), false); assert.equal(visit.debug.store.dogs.owner, undefined); assert.equal(visit.debug.dogs.dog(), null);
  await visit.debug.client.refresh();
  assert.equal(visit.debug.adopt(2, 'Pip'), false); await new Promise(resolve => setImmediate(resolve));
  assert.equal(visit.debug.dogs.dog(), null); assert.equal(visit.debug.store.dogs.owner, undefined);
  settle(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(visit.debug.dogs.dog().name, 'Pip'); assert.equal(visit.debug.store.dogs.owner, undefined);
  releaseDog(); await new Promise(resolve => setImmediate(resolve)); assert.equal(visit.debug.dogs.dog().name, 'Pip');
  settle(); await new Promise(resolve => setImmediate(resolve)); assert.equal(visit.debug.dogs.dog(), null);
  visit.dispose(); assert.equal(r.targets.size, 0); assert.equal(r.root.children.length, 0);
});
