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
  const entries = new Map(), writes = [], context = { window: {}, TextEncoder, URLSearchParams, location: { search: '' },
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
