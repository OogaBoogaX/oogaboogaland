import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { HOST, boundedJSON, sameCheckpointValue } from '../src/virtual-host.js';

// Exercise the actual adapter with a counted world constructor. This regression
// distinguishes cached validity from sharing a mutable world or trusting identity.
function fixture() {
  let constructions = 0, disposed = 0;
  const starts = [];
  const source = readFileSync(new URL('../src/hub-world-simulation.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function createHubWorldSimulation', 'function createHubWorldSimulation');
  const create = runInNewContext(`${source}\ncreateHubWorldSimulation;`, {
    Object, structuredClone, HOST, boundedJSON, sameCheckpointValue,
    hubCharacters: {}, hubSlots: [], hubRepositoryOf: () => null, normalizeHubStats: () => null,
    hubNpcFor: id => id,
    createHubWorldState: () => ({ clock: () => 1000 }),
    createContributorRoster: () => ({ validateCheckpoint: () => true }),
    *buildHubWorld(config, saved) {
      starts.push(constructions - disposed);
      constructions++;
      const state = structuredClone(saved || { value: 0 });
      if (Object.keys(state).join() !== 'value' || !Number.isFinite(state.value) || state.value < 0) throw Error('invalid fixture state');
      yield;
      return { validate: () => true, capture: () => structuredClone(state),
        step: () => { state.value++; }, poses: () => [state.value],
        dispose: () => { disposed++; } };
    },
  });
  const adapter = create({ version: 'validation-test', seed: 1, checkpointBytes: 4096,
    source: { observedAt: 1000, revision: 1 }, activity: { rows: [] },
    state: { elapsed: 0, at: 1000, inventory: [], assignments: [] } });
  return { adapter, starts, counts: () => ({ constructions, disposed }) };
}

test('unchanged validation avoids reconstruction but changed, malformed and disposed reads cannot reuse it', () => {
  const f = fixture(), saved = { value: 0 };
  assert.equal(f.adapter.validate(saved), true);
  assert.equal(f.adapter.validate(structuredClone(saved)), true);
  assert.deepEqual(f.counts(), { constructions: 1, disposed: 1 });
  // JSON text would conflate these, so the cache must use exact scalar values.
  assert.equal(f.adapter.validate({ value: -0 }), true);
  assert.equal(f.counts().constructions, 2);
  saved.value = -1;
  assert.throws(() => f.adapter.validate(saved), /invalid fixture state/);
  assert.throws(() => f.adapter.validate({ value: NaN }), /nonfinite/);
  assert.throws(() => f.adapter.validate({ value: 0, extra: true }), /invalid fixture state/);
  const poisoned = f.adapter.forTransaction();
  assert.throws(() => poisoned.validate({ value: NaN }), /nonfinite/);
  assert.throws(() => poisoned.validate({ value: -0 }), /closed/);
  poisoned.dispose();
  const closed = f.adapter.forTransaction(); closed.dispose();
  assert.throws(() => closed.validate({ value: -0 }), /closed/);
});

test('cached validity cannot transfer speculative mutations between attempts or bypass query lifetime fences', () => {
  const f = fixture(), committed = { value: 0 };
  f.adapter.validate(committed);
  const attempt = f.adapter.forTransaction(), speculative = structuredClone(committed);
  attempt.step(speculative, 250, 1250);
  assert.equal(attempt.validate(speculative), true);
  attempt.dispose(); // Model a failed storage commit: discard its mutable world.
  const retry = f.adapter.forTransaction();
  assert.equal(retry.validate(committed), true);
  const query = retry.readQueries(committed);
  assert.deepEqual(Array.from(query.poses()), [0]);
  retry.step(committed, 250, 1250);
  assert.throws(() => query.poses(), /closed/);
  const fresh = retry.readQueries(committed);
  assert.deepEqual(Array.from(fresh.poses()), [1]);
  retry.dispose();
  assert.throws(() => fresh.poses(), /closed/);
  assert.equal(f.counts().constructions, f.counts().disposed);
});

test('only a committed private world can be lent, with exact-state matching and no overlapping mutable loans', () => {
  const f = fixture(), saved = { value: 0 };
  const first = f.adapter.forTransaction();
  first.validate(saved); first.committed(); first.dispose();
  assert.deepEqual(f.counts(), { constructions: 1, disposed: 0 });
  const borrower = f.adapter.forTransaction(), overlap = f.adapter.forTransaction();
  const changed = structuredClone(saved);
  assert.deepEqual(Array.from(borrower.poses(changed)), [0]);
  assert.equal(f.counts().constructions, 1);
  assert.deepEqual(Array.from(overlap.poses(structuredClone(saved))), [0]);
  assert.equal(f.counts().constructions, 2, 'active loan cannot be shared');
  borrower.step(changed, 250, 1250);
  borrower.dispose(); // Rollback: no commit hook, so the changed world is destroyed.
  overlap.committed(); overlap.dispose();
  assert.deepEqual(Array.from(f.adapter.poses(saved)), [0]);
  assert.equal(f.counts().constructions, 2);
  // A different checkpoint cannot borrow an older runtime, including -0/0.
  const next = f.adapter.forTransaction(); next.poses(saved); next.committed(); next.dispose();
  const before = f.counts();
  assert.deepEqual(Array.from(f.adapter.poses({ value: -0 })), [-0]);
  assert.equal(f.counts().constructions, before.constructions + 1);
  assert.equal(f.starts.at(-1), 0, 'obsolete cache is released before replacement construction starts');
  assert.equal(f.counts().disposed, before.disposed + 2, 'mismatched warm cache and temporary replacement both release');
});
