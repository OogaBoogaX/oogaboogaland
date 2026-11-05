// Source/rig integration only. Never loads or runs scene-hub or a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { managedRigs } from './fixtures/clanker-pose-rig.mjs';
const view = (i, kind = 'clanker') => ({ accountId: i + 1, bodyId: `${kind === 'clanker' ? 'gorilla:' : ''}fixture${i}`,
  kind, generation: i + 1, zone: 'outside', state: 'grace', deadline: 160000, presentation: 'open-hand',
  motion: { x: i + 2, y: 12, z: -4, yaw: .7, vx: 0, vy: 0, vz: 0, grounded: false },
  equipment: { weapon: kind === 'ooga' ? 'gun' : null, mode: 'combat', primaryOwned: true, secondaryOwned: true,
    selectedSlot: 2, unlimited: false, jetpack: kind === 'ooga', jetpackOwned: kind === 'ooga' }, occupancy: null });
const frame = views => ({ v: 1, protocol: 'host-session-v5', world: 'fixture-world', epoch: 1, revision: 1,
  now: 100000, expiresAt: 110000, views, departures: [] });
const departed = v => ({ id: `depart:${v.generation}`, type: 'depart', glyph: 'green', accountId: v.accountId,
  bodyId: v.bodyId, generation: v.generation, reason: 'expired', at: 160000, handback: null, zone: v.zone,
  body: { kind: v.kind, motion: v.motion, equipment: v.equipment }, applied: true });
function fixture(views, { missingNpc = false, hostCharacterFor = null } = {}) {
  const f = managedRigs({ presence: true }), B = f.B, root = B.scene.createNode();
  let now = 100000, snapshot = frame(views), connected = true, hidden = 0, poses = 0, renders = 0, dropped = 0;
  B.characters = { all: () => [], get: () => null };
  const context = { window: { BL: B, matchMedia: () => ({ matches: false }) }, TextEncoder, URLSearchParams, location: { search: '' } };
  for (const name of ['activity-repos', 'contributors', 'crew', 'body-presence', 'host-actor-bindings', 'host-frozen-bodies'])
    runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), 'utf8'), context);
  const source = { sample: () => connected ? { frame: snapshot, now, stale: now >= snapshot.expiresAt } : null };
  const npc = new Map();
  if (!missingNpc) for (const v of views) {
    const actor = f.make(); actor.poseManaged(0, 40 + v.accountId, 0, 20, 0, 0);
    B.scene.addChild(root, actor.root); npc.set(v.bodyId, actor);
  }
  const originalPresence = B.hostPresence.create;
  B.hostPresence.create = options => { const p = originalPresence(options), render = p.render;
    p.render = value => { renders++; return render(value); }; return p; };
  const originalPose = B.crew.poseEquipment;
  B.crew.poseEquipment = (...args) => { poses++; return originalPose(...args); };
  B.net = { remotes: new Map(), state: { selfId: 99, zone: 'outside' }, serverNow: () => now,
    bodyKind: id => id.startsWith('gorilla:') ? 'gorilla' : 'ooga', bodyName: id => id.replace(/^gorilla:/, ''),
    subscribeChat: () => () => {}, subscribeShots: () => () => {}, subscribeSwings: () => () => {} };
  runInNewContext(readFileSync(new URL('../../src/js/remote-players.js', import.meta.url), 'utf8'), context);
  const names = [];
  const pool = B.remotePlayers.create({ root, hostSource: source, hostNpcFor: v => npc.get(v.bodyId) || null, hostCharacterFor,
    createGorilla(name) { names.push(name); const a = f.make(), pose = a.poseManaged, dispose = a.dispose;
      a.poseManaged = (...args) => { poses++; return pose(...args); };
      a.dispose = () => { dropped++; dispose(); }; return a; }, hideGorilla: () => hidden++ });
  return { B, f, root, pool, npc, source, names,
    at: value => { now = value; }, snapshot: value => { snapshot = value; }, connected: value => { connected = value; },
    counters: () => ({ hidden, poses, renders, dropped }),
    close() { pool.dispose(); for (const actor of npc.values()) actor.dispose(); } };
}

test('source remote pool presents frozen Ooga/Clanker bodies, gear and red names without replay or recurring pose work', () => {
  const views = [view(0, 'ooga'), view(1)], f = fixture(views), { B, pool, npc } = f;
  try {
    // Ordinary Room data disagrees and contains action state: the held body wins.
    B.net.remotes.set(1, { id: 1, body: views[0].bodyId, x: 90, y: 0, z: 90, yaw: 2, zone: 'outside', weapon: 255, voice: true });
    pool.update(.016);
    assert.equal(pool.stats().frozenPresentationFailed, false); assert.equal(pool.stats().reservedPlayers, 2);
    const ooga = pool.body(1), clanker = pool.body(2);
    assert.equal(ooga.root.position.x, 2); assert.equal(clanker.root.position.y, 12);
    assert.equal(ooga.parts.gun.visible, true); assert.equal(ooga.presentationJet.node.visible, true);
    assert.equal(ooga.presentationJet.flame.visible, false); assert.equal(ooga.weapon.recoil, 0);
    assert.equal(B.hostPresence.colorFor(ooga), '#ef4444'); assert.equal(B.hostPresence.colorFor(clanker), '#ef4444');
    assert.ok(ooga.parts.armL.quaternion); assert.ok(clanker.parts.armL.quaternion);
    assert.equal(npc.get(views[1].bodyId).root.smokeOpacity, .28);
    assert.equal(npc.get(views[1].bodyId).root.position.x, 42);
    const before = f.counters(), actorPositions = pool.actors().map(a => [a.x, a.y, a.z]);
    for (let i = 1; i <= 100; i++) { f.at(100000 + i * 16); pool.update(.016); }
    assert.deepEqual(f.counters(), before, 'stationary poses and indicators are retained between events');
    assert.deepEqual(pool.actors().map(a => [a.x, a.y, a.z]), actorPositions);
    assert.ok(pool.actors().every(a => a.dx === 0 && a.dy === 0 && a.dz === 0));
    assert.equal(before.hidden, 0, 'no NPC hide/show or AI mutation');
    assert.equal(B.net.remotes.get(1).voice, true, 'separate voice record is unchanged');
    // Remote live replacement uses the independent ghost binding, not legacy NPC hiding.
    const live = structuredClone(views[1]); live.state = 'live'; live.presentation = live.deadline = null;
    B.net.remotes.set(2, { id: 2, body: live.bodyId, x: 9, y: 12, z: -4, yaw: .7, zone: 'outside', display: 'fixture1' });
    f.snapshot({ ...frame([views[0], live]), revision: 2, now: 101600, expiresAt: 111600 }); pool.update(.016);
    assert.notEqual(pool.body(2), clanker); assert.equal(pool.body(2).root.position.x, 9);
    assert.equal(f.counters().hidden, 0); assert.equal(npc.get(live.bodyId).root.smokeOpacity, .28);
    const liveBody = pool.body(2);
    f.at(111600); pool.update(.016);
    assert.equal(pool.body(2), liveBody, 'presence freshness does not revoke ordinary Room peers');
    assert.equal(B.hostPresence.colorFor(pool.body(1)), '#ef4444');
    f.connected(false); pool.update(.016); assert.equal(pool.body(1), ooga, 'lost observer transport keeps the committed held body');
    B.net.remotes.get(2).x = 10; pool.update(.016);
    assert.ok(liveBody.root.position.x > 9, 'healthy Room movement continues with no presence refresh');
    assert.equal(pool.body(2), liveBody, 'no stale-frame rebuild churn');
    pool.dispose(); assert.equal(npc.get(live.bodyId).root.smokeOpacity, undefined);
    assert.equal(f.root.children.length, 2, 'all replica and indicator resources leave; only original NPCs remain');
  } finally { f.close(); }
});

test('presence world fences replace live bindings while new Room peers do not wait for a presence refresh', () => {
  const live = view(0); live.state = 'live'; live.presentation = live.deadline = null;
  const f = fixture([live]);
  try {
    f.B.net.remotes.set(1, { id: 1, body: live.bodyId, x: 2, y: 12, z: -4, yaw: .7, zone: 'outside' });
    f.pool.update(.016); const first = f.pool.body(1);
    f.snapshot({ ...frame([live]), world: 'replacement-world', epoch: 2 }); f.pool.update(.016);
    assert.notEqual(f.pool.body(1), first, 'same numeric generation in a new world gets a new binding');
    assert.equal(f.npc.get(live.bodyId).root.smokeOpacity, .28, 'old ghost layer is restored before replacement');
    f.B.net.remotes.set(2, { id: 2, body: 'gorilla:fixture1', x: 7, y: 12, z: -4, yaw: .7, zone: 'outside' });
    f.connected(false); f.pool.update(.016);
    assert.equal(f.pool.body(2).root.position.x, 7, 'ordinary newcomer remains visible independently');
    assert.equal(f.counters().hidden, 0, 'absence of a presence row never invokes legacy NPC hiding');
    f.pool.dispose(); assert.equal(f.npc.get(live.bodyId).root.smokeOpacity, undefined);
  } finally { f.close(); }
});

test('a full frozen roster remains bounded through replacement, beams, late join and absent NPCs', () => {
  const views = Array.from({ length: 32 }, (_, i) => view(i)), f = fixture(views, { missingNpc: true });
  try {
    for (let i = 0; i < 32; i++) f.B.net.remotes.set(100 + i, { id: 100 + i, body: `gorilla:new${i}`,
      x: i, y: 0, z: 0, yaw: 0, zone: 'outside' });
    f.pool.update(.016); assert.equal(f.pool.stats().reservedPlayers, 32); assert.equal(f.pool.actors().length, 32);
    assert.equal(f.pool.body(100), null, 'held roster reserves capacity before first live newcomer construction');
    f.B.net.state.selfId = 101;
    assert.throws(() => f.pool.acquireLocalBody({ ...view(100), state: 'starting' },
      { world: 'fixture-world', epoch: 1, revision: 2 }, () => {}), /capacity/,
      'private acknowledgement cannot allocate a 33rd visual body beside an older full held roster');
    f.snapshot({ ...frame([]), revision: 2 }); f.pool.update(.016);
    assert.equal(f.pool.stats().reservedPlayers, 32); assert.ok(f.pool.body(100));
    f.snapshot({ ...frame(views), revision: 3 }); f.pool.update(.016);
    assert.equal(f.pool.stats().reservedPlayers, 32); assert.equal(f.pool.body(100), null,
      'existing ordinary replicas retire before a full held roster is allocated');
    f.B.net.remotes.clear();
    const children = f.root.children.length;
    const changed = structuredClone(views); changed[0].generation = 33; changed[0].motion.y = 25;
    const old = f.pool.body(1); f.snapshot({ ...frame(changed), revision: 4 }); f.pool.update(.016);
    assert.notEqual(f.pool.body(1), old); assert.equal(f.pool.body(1).root.position.y, 25);
    assert.equal(f.root.children.length, children, 'one replacement, no second staging roster');
    const expired = { ...frame([]), revision: 5, now: 160000, expiresAt: 170000, departures: changed.map(departed) };
    f.at(160350); f.snapshot(expired); f.pool.update(.016);
    assert.equal(f.pool.stats().reservedPlayers, 32); assert.equal(f.npc.size, 0);
    f.at(160700); f.pool.update(.016); assert.equal(f.pool.stats().reservedPlayers, 0); assert.equal(f.pool.actors().length, 0);
    const builds = f.counters().poses;
    f.pool.dispose(); f.pool.update(.016);
    assert.equal(f.pool.stats().reservedPlayers, 0); assert.equal(f.counters().poses, builds, 'late observer never spawns bodies for expired beams');
    f.pool.dispose(); assert.equal(f.root.children.length, 0);
  } finally { f.close(); }
});

test('malformed frame validation is atomic and unsupported equipment fails once without leaking replicas or ghosts', () => {
  const views = [view(0), view(1)], f = fixture(views);
  try {
    f.pool.update(.016); const first = f.pool.body(1), counts = f.counters();
    const bad = frame([views[0], { ...views[1], token: 'private' }]);
    f.snapshot(bad); assert.throws(() => f.pool.update(.016), /presence/);
    assert.equal(f.pool.body(1), first); assert.deepEqual(f.counters(), counts);
    const unsupported = structuredClone(views); unsupported[1].equipment.jetpack = true;
    f.snapshot({ ...frame(unsupported), revision: 2 }); f.pool.update(.016);
    assert.equal(f.pool.stats().frozenPresentationFailed, true); assert.equal(f.pool.stats().reservedPlayers, 0);
    assert.ok([...f.npc.values()].every(n => n.root.smokeOpacity === undefined));
    const failed = f.counters(); for (let i = 0; i < 20; i++) f.pool.update(.016);
    assert.deepEqual(f.counters(), failed, 'no per-frame reconstruction retry after an adapter failure');
    f.snapshot({ ...frame(views), revision: 3 }); f.pool.update(.016);
    assert.equal(f.pool.stats().frozenPresentationFailed, false); assert.equal(f.pool.stats().reservedPlayers, 2);
  } finally { f.close(); }
});

test('private live acknowledgement replaces the local frozen body before ghost binding; newer public closure fences it once', () => {
  const views = [view(0), view(1)], f = fixture(views);
  let release, ghosts, localActor, fenced = 0;
  try {
    f.B.net.state.selfId = 1; f.pool.update(.016);
    const originalChildren = f.root.children.length, frozen = f.pool.body(1), npc = f.npc.get(views[0].bodyId);
    const scope = { world: 'fixture-world', epoch: 1, revision: 2 }, starting = { ...views[0], state: 'starting' };
    assert.throws(() => f.pool.acquireLocalBody(views[0], scope, () => {}), /receipt/);
    assert.throws(() => f.pool.acquireLocalBody({ ...starting, accountId: 2 }, scope, () => {}), /identity/);
    assert.throws(() => f.pool.acquireLocalBody({ ...starting, kind: 'ooga' }, scope, () => {}), /identity/);
    assert.equal(f.pool.body(1), frozen, 'refused handoffs leave the frozen rig intact');
    localActor = f.f.make(); f.B.scene.addChild(f.root, localActor.root);
    release = f.pool.acquireLocalBody(starting, scope, () => {
      fenced++; ghosts.dispose(); release(); localActor.dispose();
    });
    assert.equal(f.pool.body(1), null); assert.ok(!f.pool.actors().some(a => a.id === 1));
    assert.equal(npc.root.smokeOpacity, undefined, 'frozen ghost layer retires before local binding');
    ghosts = f.B.hostActorBindings.create({ root: f.root, capacity: 1 });
    ghosts.bind({ bodyId: starting.bodyId, kind: starting.kind, generation: starting.generation, actor: localActor, npc });
    for (let i = 0; i < 10; i++) f.pool.update(.016);
    assert.equal(f.pool.body(1), null, 'old public held snapshot cannot recreate a duplicate local body');
    assert.equal(npc.root.smokeOpacity, .28, 'ghost opacity is applied once');
    f.snapshot({ ...frame([starting, views[1]]), revision: 3 }); f.pool.update(.016); assert.equal(fenced, 0,
      'an intermediate starting snapshot can have a revision newer than the private final snapshot');
    const online = { ...starting, state: 'live', presentation: null, deadline: null };
    f.snapshot({ ...frame([online, views[1]]), revision: 4 }); f.pool.update(.016); assert.equal(fenced, 0);
    f.snapshot({ ...frame(views), revision: 5 }); f.pool.update(.016);
    assert.equal(fenced, 1); assert.notEqual(f.pool.body(1), frozen);
    assert.equal(f.B.hostPresence.colorFor(f.pool.body(1)), '#ef4444');
    assert.equal(npc.root.smokeOpacity, .28); assert.equal(f.root.children.length, originalChildren);
    release(); f.pool.update(.016); assert.equal(fenced, 1, 'late old release cannot undo the new held presentation');
    assert.throws(() => f.pool.acquireLocalBody(starting, scope, () => {}), /fenced/);
  } finally { ghosts?.dispose(); release?.(); localActor?.dispose(); f.close(); }
});

test('private acquire checks pending public fences before exposing its callback', () => {
  for (const changed of ['epoch', 'world', 'closed', 'generation', 'starting']) {
    const initial = view(0), starting = { ...initial, state: 'starting' }, f = fixture([initial]);
    let calls = 0, release;
    try {
      f.B.net.state.selfId = 1; f.pool.update(.016);
      const pending = { ...frame([starting]), revision: 3 };
      if (changed === 'epoch') pending.epoch = 2;
      if (changed === 'world') pending.world = 'replacement-world';
      if (changed === 'closed') pending.views = [initial];
      if (changed === 'generation') pending.views = [{ ...starting, generation: 2 }];
      f.snapshot(pending); // Accepted by the receiver, no scene update yet.
      const acquire = () => f.pool.acquireLocalBody(starting,
        { world: 'fixture-world', epoch: 1, revision: 2 }, () => { calls++; });
      if (changed === 'starting') {
        release = acquire(); assert.equal(f.pool.body(1), null);
      } else assert.throws(acquire, /fenced/);
      assert.equal(calls, 0, 'refused acquire cannot invoke an unassigned release handle');
    } finally { release?.(); f.close(); }
  }
});

test('a local reservation retires excess ordinary bodies before attachment and cannot duplicate itself', () => {
  const f = fixture([], { missingNpc: true }); let release;
  try {
    f.B.net.state.selfId = 101;
    for (let i = 0; i < 32; i++) f.B.net.remotes.set(101 + i, { id: 101 + i, body: `gorilla:fixture${100 + i}`,
      x: i, y: 0, z: 0, yaw: 0, zone: 'outside' });
    f.pool.update(.016); assert.equal(f.pool.stats().reservedPlayers, 32);
    const starting = { ...view(100), state: 'starting' };
    release = f.pool.acquireLocalBody(starting, { world: 'fixture-world', epoch: 1, revision: 2 }, () => {});
    assert.equal(f.pool.stats().reservedPlayers, 31); assert.equal(f.pool.actors().length, 31);
    assert.equal(f.pool.body(101), null); assert.equal(f.root.children.length, 31);
    f.snapshot({ ...frame([{ ...starting, state: 'live', presentation: null, deadline: null }]), revision: 3 });
    f.pool.update(.016); assert.equal(f.pool.body(101), null); assert.equal(f.pool.stats().reservedPlayers, 31);
  } finally { release?.(); f.close(); }
});

test('public fencing rejects nested acquire and dispose cleans up even if the fence callback throws', () => {
  for (const throwing of [false, true]) {
    const views = [view(0), view(1)], f = fixture(views); let release, calls = 0;
    const starting = { ...views[0], state: 'starting' }, scope = { world: 'fixture-world', epoch: 1, revision: 2 };
    try {
      f.B.net.state.selfId = 1; f.pool.update(.016);
      release = f.pool.acquireLocalBody(starting, scope, () => {
        calls++;
        assert.throws(() => f.pool.acquireLocalBody(starting, scope, () => {}), /receipt/);
        if (throwing) throw Error('fixture fence callback');
        release();
      });
      if (throwing) {
        assert.throws(() => f.pool.dispose(), /fixture fence callback/);
        assert.equal(f.root.children.length, 2); assert.equal(f.pool.actors().length, 0);
        assert.ok([...f.npc.values()].every(n => n.root.smokeOpacity === undefined));
      } else {
        f.snapshot({ ...frame(views), epoch: 2, revision: 3 }); f.pool.update(.016);
        assert.ok(f.pool.body(1)); assert.equal(f.pool.stats().reservedPlayers, 2);
      }
      assert.equal(calls, 1);
    } finally { release?.(); f.close(); }
  }
});

test('failed public rendering refuses local attachment without callback, leaked reservation or stale collisions', () => {
  const views = [view(0), view(1)], f = fixture(views); let release, calls = 0;
  try {
    f.B.net.state.selfId = 1; f.pool.update(.016);
    const starting = { ...views[0], state: 'starting' }, scope = { world: 'fixture-world', epoch: 1, revision: 2 };
    const broken = structuredClone(views[1]); broken.equipment.jetpack = true;
    f.snapshot({ ...frame([starting, broken]), revision: 3 });
    const acquire = () => f.pool.acquireLocalBody(starting, scope, () => { calls++; });
    assert.throws(acquire, /refused/);
    assert.equal(f.pool.actors().length, 0); assert.equal(f.pool.stats().reservedPlayers, 0);
    assert.equal(f.root.children.length, 2); assert.equal(calls, 0);
    assert.throws(acquire, /refused/, 'same failed frame does not silently authorize incomplete presentation');
    f.snapshot({ ...frame([starting, views[1]]), revision: 4 });
    release = acquire(); assert.equal(f.pool.body(1), null); assert.ok(f.pool.body(2));
  } finally { release?.(); f.close(); }
});

test('scene model-change hooks refresh added NPC gear for held and live ghosts without recurring pose work', () => {
  const held = view(0), f = fixture([held]), npc = f.npc.get(held.bodyId);
  const gear = f.B.scene.createNode({ smokeOpacity: .5 });
  try {
    f.pool.update(.016); const counts = f.counters();
    f.B.scene.addChild(npc.root, gear);
    assert.equal(f.pool.refreshNpc(npc.root), true); assert.equal(gear.smokeOpacity, .5 * f.B.hostActorBindings.GHOST);
    f.pool.refreshNpc(npc.root);
    assert.equal(gear.smokeOpacity, .5 * f.B.hostActorBindings.GHOST, 'no second ghost layer');
    assert.equal(f.pool.refreshNpc(f.pool.body(1).root), false, 'physical replica is not the NPC');
    assert.deepEqual(f.counters(), counts, 'model event does not step, re-pose or recreate the held player');
    const live = { ...held, state: 'live', presentation: null, deadline: null };
    f.B.net.remotes.set(1, { id: 1, body: held.bodyId, x: 4, y: 12, z: -4, yaw: 0, zone: 'outside' });
    f.snapshot({ ...frame([live]), revision: 2 }); f.pool.update(.016);
    assert.equal(gear.smokeOpacity, .5 * f.B.hostActorBindings.GHOST);
    f.B.scene.removeChild(npc.root, gear); assert.equal(f.pool.refreshNpc(npc.root), true);
    assert.equal(gear.smokeOpacity, .5, 'removed equipment leaves the live ghost binding');
    f.B.scene.addChild(npc.root, gear); f.pool.refreshNpc(npc.root);
    f.pool.dispose(); assert.equal(gear.smokeOpacity, .5); assert.equal(f.pool.refreshNpc(npc.root), false);
  } finally { f.close(); }
});

test('account-keyed host bodies use resolved character and explicit form across frozen, live and local reclaim', () => {
  const held = { ...view(0), bodyId: 'player:1' };
  const resolve = v => v.accountId === 1 && v.bodyId === 'player:1' ? { handle: 'fixture0' } : null;
  const f = fixture([held], { hostCharacterFor: resolve }); let release;
  try {
    f.pool.update(.016);
    assert.deepEqual(f.names, ['fixture0']); assert.equal(typeof f.pool.body(1).poseManaged, 'function');
    assert.equal(f.npc.get(held.bodyId).root.smokeOpacity, .28);
    const live = { ...held, state: 'live', presentation: null, deadline: null };
    f.B.net.remotes.set(1, { id: 1, body: held.bodyId, bodyName: 'wrong-character', bodyKind: 'ooga',
      x: 4, y: 12, z: -4, yaw: 0, zone: 'outside' });
    f.snapshot({ ...frame([live]), revision: 2 }); f.pool.update(.016);
    assert.deepEqual(f.names, ['fixture0', 'fixture0'], 'ordinary name/form fields cannot override host identity');
    assert.equal(f.npc.get(held.bodyId).root.smokeOpacity, .28);
    f.B.net.state.selfId = 1;
    release = f.pool.acquireLocalBody({ ...held, state: 'starting' }, { world: 'fixture-world', epoch: 1, revision: 2 }, () => {});
    assert.equal(f.pool.body(1), null, 'local reclaim removes the matching replica before attaching controls');
    assert.throws(() => f.pool.acquireLocalBody({ ...held, bodyId: 'player:2' },
      { world: 'fixture-world', epoch: 1, revision: 2 }, () => {}), /identity/);
  } finally { release?.(); f.close(); }
});

test('unknown account-keyed body never guesses a model from player ID or a neighbouring NPC', () => {
  for (const hostCharacterFor of [null, () => null]) {
    const held = { ...view(0), bodyId: 'player:1' }, f = fixture([held], { hostCharacterFor });
    try {
      f.pool.update(.016);
      assert.equal(f.pool.stats().frozenPresentationFailed, true); assert.equal(f.pool.body(1), null);
      assert.deepEqual(f.names, []); assert.equal(f.npc.get(held.bodyId).root.smokeOpacity, undefined);
    } finally { f.close(); }
  }
});
