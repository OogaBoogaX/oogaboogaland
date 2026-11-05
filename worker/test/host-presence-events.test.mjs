// Event-sequence integration of host presence presentation with independent
// NPC ghost bindings, using the real managed rigs. Source-only: no Hub scene,
// no browser. The renderer does not validate host epoch/revision; callers own
// authority framing, so these frames carry only the presentation contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { managedRigs } from './fixtures/clanker-pose-rig.mjs';

const bindingSource = readFileSync(new URL('../../src/js/host-actor-bindings.js', import.meta.url), 'utf8');
const DEADLINE = 160000;
const view = (i, state, generation = i + 1) => ({ bodyId: `player:${i}`, kind: 'clanker', generation, state,
  presentation: state === 'live' ? null : 'open-hand', deadline: state === 'live' ? null : DEADLINE });
const depart = (bodyId, at, applied = true, generation = typeof bodyId === 'number' ? bodyId + 1 : 1) => ({ type: 'depart', glyph: 'green', applied,
  bodyId: typeof bodyId === 'number' ? `player:${bodyId}` : bodyId, generation, at, body: { kind: 'clanker' } });

// Manually place n fixture player bodies at their independent NPC positions.
// This verifies presentation bindings, not the unfinished first-login mapping.
const roster = (n, bound = n) => {
  const f = managedRigs({ presence: true }), B = f.B, root = B.scene.createNode();
  runInNewContext(bindingSource, { window: { BL: B } });
  const players = [], npcs = [];
  for (let i = 0; i < n; i++) {
    const npc = f.make(), player = f.make();
    npc.poseManaged(.05, i * 3, 0, 4, .3, 0); player.poseManaged(.05, i * 3, 0, 4, .3, 0);
    B.scene.addChild(root, npc.root, player.root); npcs.push(npc); players.push(player);
  }
  const tracks = B.hostActorBindings.create({ root, capacity: B.hostActorBindings.MAX });
  for (let i = 0; i < bound; i++)
    tracks.bind({ bodyId: `player:${i}`, kind: 'clanker', generation: i + 1, actor: players[i], npc: npcs[i], freeArm: 'armR' });
  const statuses = () => players.map(p => B.hostPresence.statusFor(p));
  const ghosts = () => npcs.map(n => n.parts.armR.smokeOpacity);
  const close = () => { tracks.dispose(); for (const a of [...players, ...npcs]) a.dispose(); };
  return { f, B, root, players, npcs, tracks, statuses, ghosts, close };
};
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

test('32-player roster walks offline/offered/starting/live and bounded departures without touching NPC ghost tracks', () => {
  const r = roster(32), { f, B, root, players, npcs, tracks } = r, GHOST = B.hostActorBindings.GHOST;
  const presence = B.hostPresence.create({ root, capacity: 32, resolve: tracks.resolve });
  const npcBefore = npcs.map(f.display), playerBefore = players.map(f.display);
  let now = 100000;
  for (const state of ['grace', 'offered', 'starting']) {
    presence.prepare(); presence.render({ now: now++, views: range(32, i => view(i, state)), departures: [] });
    assert.equal(presence.hands, 32, `${state}: every stationary body raises its free hand`);
    assert.deepEqual(r.statuses(), range(32, () => 'offline'), `${state} is not online`);
    assert.ok(players.every(p => B.hostPresence.colorFor(p) === '#ef4444'));
  }
  presence.prepare(); presence.render({ now: now++, views: range(32, i => view(i, i < 16 ? 'live' : 'starting')), departures: [] });
  assert.equal(presence.hands, 16);
  assert.deepEqual(r.statuses(), range(32, i => i < 16 ? 'online' : 'offline'));
  presence.prepare(); presence.render({ now: now++, views: range(32, i => view(i, 'live')), departures: [] });
  assert.equal(presence.hands, 0); assert.ok(players.every(p => B.hostPresence.colorFor(p) === '#22c55e'));
  // Capacity counts views and departures together; refusal keeps committed colors.
  presence.prepare();
  assert.throws(() => presence.render({ now, views: range(32, i => view(i, 'live')), departures: [depart('gone:x', now)] }), /presentation/);
  assert.deepEqual(r.statuses(), range(32, () => 'online'));
  const at = now;
  const frame = t => ({ now: t, views: range(24, i => view(i, 'live')), departures: range(8, i => depart(24 + i, at)) });
  presence.prepare(); presence.render(frame(at + 350));
  assert.equal(presence.beams, 8); assert.equal(presence.hands, 0); assert.equal(presence.expired, 0);
  assert.deepEqual(r.statuses(), range(32, i => i < 24 ? 'online' : 'offline'));
  presence.prepare(); presence.render(frame(at + B.hostPresence.BEAM_MS));
  assert.equal(presence.beams, 0); assert.equal(presence.expired, 8);
  assert.deepEqual(r.statuses(), range(32, i => i < 24 ? 'online' : null), 'expired departures carry no name status');
  // Presentation never poses, recolors or releases the independent NPC tracks.
  assert.ok(npcs.every(n => B.hostPresence.statusFor(n) === null));
  assert.deepEqual(r.ghosts(), range(32, () => GHOST)); assert.equal(tracks.size, 32);
  presence.prepare();
  assert.deepEqual(npcs.map(f.display), npcBefore); assert.deepEqual(players.map(f.display), playerBefore, 'prepare restores raised arms');
  presence.dispose(); assert.ok(players.every(p => B.hostPresence.statusFor(p) === null));
  r.close(); assert.equal(root.children.length, 0);
});

test('replacement generation rebinding keeps one ghost layer and stale views or releases cannot present either actor', () => {
  const r = roster(1), { f, B, root, players: [old], npcs: [npc], tracks } = r, GHOST = B.hostActorBindings.GHOST;
  const replacement = f.make(); replacement.poseManaged(.05, 0, 0, 4, .3, 0); B.scene.addChild(root, replacement.root);
  const presence = B.hostPresence.create({ root, capacity: 4, resolve: tracks.resolve }), npcBefore = f.display(npc);
  presence.prepare(); presence.render({ now: 100000, views: [view(0, 'grace')], departures: [] });
  assert.equal(presence.hands, 1); assert.equal(B.hostPresence.statusFor(old), 'offline');
  tracks.bind({ bodyId: 'player:0', kind: 'clanker', generation: 2, actor: replacement, npc, freeArm: 'armR' });
  assert.equal(npc.parts.armR.smokeOpacity, GHOST, 'rebinding the same ghost does not compound opacity');
  presence.prepare(); presence.render({ now: 100001, views: [view(0, 'grace', 1)], departures: [] });
  assert.equal(presence.hands, 0, 'a stale generation view cannot raise a hand');
  assert.equal(B.hostPresence.statusFor(old), null); assert.equal(B.hostPresence.statusFor(replacement), null);
  presence.prepare(); presence.render({ now: 100002, views: [], departures: [depart(0, 100000, true, 1)] });
  assert.equal(presence.beams, 0, 'a stale tombstone cannot beam the replacement');
  assert.equal(B.hostPresence.statusFor(replacement), null);
  presence.prepare(); presence.render({ now: 100003, views: [view(0, 'grace', 2)], departures: [] });
  assert.equal(presence.hands, 1); assert.equal(B.hostPresence.statusFor(replacement), 'offline'); assert.equal(B.hostPresence.statusFor(old), null);
  assert.equal(tracks.release('player:0', 1), false, 'stale release is refused');
  assert.equal(npc.parts.armR.smokeOpacity, GHOST); assert.equal(tracks.resolve('player:0', 'clanker', 2).actor, replacement);
  assert.equal(tracks.release('player:0', 2), true); assert.equal(npc.parts.armR.smokeOpacity, undefined);
  presence.prepare(); presence.render({ now: 100004, views: [view(0, 'grace', 2)], departures: [] });
  assert.equal(presence.hands, 0); assert.equal(B.hostPresence.statusFor(replacement), null);
  presence.prepare(); assert.equal(f.display(npc), npcBefore);
  presence.dispose(); replacement.dispose(); r.close();
});

test('late join with expired or absent departure tombstones replays no beam and spawns nothing', () => {
  const r = roster(6), { B, root, players, tracks } = r;
  let calls = 0; const resolve = (...a) => { calls++; return tracks.resolve(...a); };
  const late = B.hostPresence.create({ root, capacity: 16, resolve }), children = root.children.length, size = tracks.size;
  const positions = players.map(p => [p.root.position.x, p.root.position.y, p.root.position.z, p.root.visible]);
  const now = 200000;
  late.prepare(); late.render({ now, views: range(4, i => view(i, 'live')), departures: [
    depart(4, 160000), depart(5, 160000), depart('gone:a', 160000), // long expired
    depart('gone:b', now - 100, false), // unapplied intent
    depart('gone:c', now + 500), // not yet started
    depart('gone:d', now - 200), // active window but no actor exists
  ] });
  assert.equal(calls, 5, 'only views and the in-window tombstone are resolved');
  assert.equal(late.beams, 0); assert.equal(late.expired, 3); assert.equal(late.hands, 0);
  assert.deepEqual(r.statuses(), ['online', 'online', 'online', 'online', null, null]);
  assert.equal(root.children.length, children, 'no actor spawned'); assert.equal(tracks.size, size);
  assert.deepEqual(players.map(p => [p.root.position.x, p.root.position.y, p.root.position.z, p.root.visible]), positions);
  late.dispose(); r.close();
});

test('corrupt tails and overcapacity refuse atomically: committed names, clock and ghost ownership unchanged', () => {
  const r = roster(32), { f, B, root, players, npcs, tracks } = r, GHOST = B.hostActorBindings.GHOST;
  const presence = B.hostPresence.create({ root, capacity: 32, resolve: tracks.resolve });
  const committed = range(32, i => view(i, i < 16 ? 'live' : 'grace'));
  const flipped = range(31, i => view(i, i < 16 ? 'grace' : 'live'));
  presence.prepare(); presence.render({ now: 100000, views: committed, departures: [] });
  assert.equal(presence.hands, 16);
  const names = r.statuses(), playerBefore = (presence.prepare(), players.map(f.display));
  const corrupt = [
    { views: [...flipped, { ...view(31, 'live'), bodyId: 'bad id!' }], departures: [] },
    { views: [...flipped, view(0, 'live')], departures: [] },
    { views: flipped, departures: [{ ...depart(31, 100000), body: { kind: 'npc' } }] },
    { views: flipped, departures: [{ ...depart(31, 100000), glyph: 'red' }] },
    { views: [...flipped, view(31, 'grace', 0)], departures: [] },
    { views: range(32, i => view(i, 'live')), departures: [depart('gone:x', 100000)] },
  ];
  for (const [k, frame] of corrupt.entries()) {
    presence.prepare();
    assert.throws(() => presence.render({ now: 100500, ...frame }), /presentation/, `corrupt frame ${k}`);
    assert.deepEqual(r.statuses(), names, `frame ${k} left half-updated names`);
    assert.equal(presence.hands, 0); assert.deepEqual(players.map(f.display), playerBefore, `frame ${k} left a raised arm`);
    assert.deepEqual(r.ghosts(), range(32, () => GHOST));
  }
  // A 33rd ghost binding and an aliased same-generation replacement are refused without side effects.
  const extraNpc = f.make(), extra = f.make(); B.scene.addChild(root, extraNpc.root, extra.root);
  assert.throws(() => tracks.bind({ bodyId: 'player:32', kind: 'clanker', generation: 1, actor: extra, npc: extraNpc }), /independent/);
  assert.throws(() => tracks.bind({ bodyId: 'player:0', kind: 'clanker', generation: 1, actor: extra, npc: npcs[0] }), /independent/);
  assert.equal(extraNpc.parts.armR.smokeOpacity, undefined); assert.equal(tracks.size, 32);
  assert.equal(tracks.resolve('player:0', 'clanker', 1).actor, players[0]); assert.deepEqual(r.ghosts(), range(32, () => GHOST));
  // Refusals did not advance the frame clock: an earlier, still monotonic frame commits.
  presence.prepare(); presence.render({ now: 100100, views: [...flipped, view(31, 'live')], departures: [] });
  assert.deepEqual(r.statuses(), range(32, i => i < 16 ? 'offline' : 'online')); assert.equal(presence.hands, 16);
  presence.dispose(); extra.dispose(); extraNpc.dispose(); r.close(); assert.equal(root.children.length, 0);
});
