import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { HOST } from '../src/virtual-host.js';

function fixture(extraQueries = 0) {
  const layout = {}, pool = { layout, place: { x: 1, y: 2, z: 3, ry: 0 } };
  let searches = 0, checked = 0, blocked = false;
  const source = readFileSync(new URL('../src/hub-forest-beds.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function createHubForestBeds', 'function createHubForestBeds');
  const create = runInNewContext(`${source}\ncreateHubForestBeds;`, { HOST, hubPoolLayout: layout,
    createHubOutdoorBeds(pool, clear) {
      searches++;
      const beds = [];
      return { beds, more() {
        for (let i = 0; i < extraQueries; i++) clear(i, 0, 0);
        const x = beds.length * 2 + (clear(0, 0, 0) ? 0 : 1);
        const b = { x, y: 0, z: 0, node: { rotation: { y: pool.place.ry } } };
        beds.push(b); return b;
      } };
    },
  });
  const clear = () => { checked++; return !blocked; };
  return { pool, run: (count = 2) => create(pool, clear, count), block: () => { blocked = true; },
    counts: () => ({ searches, checked }) };
}

test('forest search reuse rechecks current solids and never shares sleeper or node state', () => {
  const f = fixture(), first = f.run(), original = first.beds[0].x;
  first.beds[0].x = 900; first.beds[0].sleeper = {}; first.beds[0].node.rotation.y = 99;
  const next = f.run();
  assert.deepEqual(f.counts(), { searches: 1, checked: 4 });
  assert.equal(next.beds[0].x, original);
  assert.equal(next.beds[0].sleeper, null);
  assert.equal(next.beds[0].node.rotation.y, 0);
  f.block();
  assert.equal(f.run().beds[0].x, 1, 'a changed clearance answer must rerun the source search');
  assert.equal(f.counts().searches, 2);
  f.run(); assert.equal(f.counts().searches, 2);
});

test('forest cache is bounded to one placement/count and never truncates oversized searches', () => {
  const f = fixture(); f.run();
  f.pool.place.x++; f.run(); f.run(1);
  assert.equal(f.counts().searches, 3);
  const large = fixture(16385);
  assert.equal(large.run(1).beds.length, 1);
  assert.equal(large.run(1).beds.length, 1);
  assert.equal(large.counts().searches, 2, 'oversized transcripts disable caching');
  assert.equal(f.run(HOST.maxOogas).beds.length, HOST.maxOogas);
  assert.throws(() => f.run(HOST.maxOogas + 1), /invalid Hub forest/);
  f.pool.layout = {};
  assert.throws(() => f.run(), /invalid Hub forest/);
});

test('rejected candidates keep their blocking witness and accepted footprints keep every sample', () => {
  const layout = {}, pool = { layout, place: { x: 0, y: 0, z: 0, ry: 0 } };
  let searches = 0, blocked = true, calls = [];
  const source = readFileSync(new URL('../src/hub-forest-beds.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function createHubForestBeds', 'function createHubForestBeds');
  const create = runInNewContext(`${source}\ncreateHubForestBeds;`, { HOST, hubPoolLayout: layout,
    createHubOutdoorBeds(pool, clear) {
      searches++;
      const beds = [];
      return { beds, more() {
        // Same short-circuit candidate admission as the source anchor search.
        const first = clear(1, 0, 0) && clear(2, 0, 0);
        if (!first && !(clear(3, 0, 0) && clear(4, 0, 0))) return null;
        const b = { x: first ? 1 : 3, y: 0, z: 0, node: { rotation: { y: 0 } } };
        beds.push(b); return b;
      } };
    },
  });
  const clear = x => { calls.push(x); return x !== 2 || !blocked; };
  assert.equal(create(pool, clear, 1).beds[0].x, 3);
  calls = [];
  assert.equal(create(pool, clear, 1).beds[0].x, 3);
  assert.deepEqual(calls, [2, 3, 4]);
  assert.equal(searches, 1);
  blocked = false;
  assert.equal(create(pool, clear, 1).beds[0].x, 1);
  assert.equal(searches, 2, 'opening an earlier candidate rebuilds the original bed order');
});
