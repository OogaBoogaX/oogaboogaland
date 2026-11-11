// The actual scene's preparation hook, isolated from geometry, rendering and boot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/scene-hub.js', import.meta.url), 'utf8');
const declaration = source.slice(source.indexOf('  const hubScene = {'), source.indexOf('  BL.scenes = BL.scenes || {};'));
const hooks = [...source.matchAll(/\bhubScene\.prepare\s*=[\s\S]*?;/g)];
assert.equal(hooks.length, 1, 'one preparation assignment; a second must not overwrite the layout wait');
assert.doesNotMatch(declaration, /\bprepare\s*:/, 'no earlier object-literal prepare hook hidden by the final assignment');

function pending() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const layout = pending(), code = pending(), calls = [], hubScene = {};
  const BL = {
    net: { waitHostLayout(signal) { calls.push(['layout', signal]); return layout.promise; } },
    deferred: { load(group) { calls.push(['load', group]); return code.promise; } }
  };
  vm.runInNewContext(hooks[0][0], { hubScene, BL });
  return { layout, code, calls, prepare: hubScene.prepare };
}

test('Hub preparation waits for the authoritative layout and forwards the visit signal', async () => {
  const f = fixture(), controller = new AbortController();
  let settled = false;
  const ready = f.prepare(null, { signal: controller.signal });
  ready.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(f.calls, [['layout', controller.signal]]);
  f.layout.resolve({ world: 'current' });
  assert.equal(await ready, null);
  assert.equal(settled, true);
  assert.equal(f.calls.length, 1, 'ordinary entry does not load the cabinet');
});

test('Cloud Hopper entry waits for both layout and its deferred code', async () => {
  const f = fixture(), signal = new AbortController().signal;
  let settled = false;
  const ready = f.prepare('cloud-hopper', { signal });
  ready.then(() => { settled = true; });
  await Promise.resolve();
  assert.deepEqual(f.calls, [['layout', signal]]);
  f.layout.resolve({ world: 'current' });
  await Promise.resolve();
  assert.deepEqual(f.calls, [['layout', signal], ['load', 'cloud-hopper']]);
  assert.equal(settled, false, 'layout alone cannot finish cabinet preparation');
  f.code.resolve(null);
  assert.equal(await ready, null);
  assert.equal(settled, true);
});

test('refused or cancelled layout preparation never loads the cabinet', async () => {
  for (const error of [new Error('World layout snapshot unavailable'), new DOMException('Visit cancelled', 'AbortError')]) {
    const f = fixture(), signal = new AbortController().signal;
    const ready = f.prepare('cloud-hopper', { signal });
    f.layout.reject(error);
    await assert.rejects(ready, actual => actual === error);
    assert.deepEqual(f.calls, [['layout', signal]]);
  }
});

test('deferred cabinet failure remains a preparation failure', async () => {
  const f = fixture(), error = new Error('Cabinet code unavailable');
  const ready = f.prepare('cloud-hopper', { signal: new AbortController().signal });
  f.layout.resolve(null);
  await Promise.resolve();
  f.code.reject(error);
  await assert.rejects(ready, actual => actual === error);
});
