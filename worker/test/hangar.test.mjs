// The Lightning Jet Hangar's hall as the Worker runs it (games/hangar.js): off unless switched on, and on, one schedule
// of engine anomalies for everyone in it, kept from the Jet while someone stands where it would move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameName, gamesOn } from "../src/games.js";
import { hangar } from "../src/games/hangar.js";

const HALL = globalThis.BL.hangarHall, A = HALL.ANOMALY, S = 1000;

// A seeded random, so a schedule replays.
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const at = (game, from, to, step = 250) => { let changed = 0; for (let t = from; t <= to; t += step) if (game.step(t)) changed++; return changed; };
// A showing of the shape as a host describes it, 30 s long.
const SHAPE = { x: 3, z: -4, mirror: 1, slow: 0.2, formed: 2, held: 9, gone: 11, end: 30, nearOn: 1, nearReach: 5, nearShare: 0.3, nearPeak: 0.1, nearSeed: 7,
  catchOn: 0, close: 2, catchShare: 0.2, catchSeed: 9, stirOn: 1, stirReach: 4, stirPeak: 0.3 };

test("the hangar is off unless GAME_FEATURES names it: not offered, and its route names no object", () => {
  assert.deepEqual(gamesOn({}), ["ghost-hunt"]);
  assert.equal(gameName("hangar", "hall", {}), "");
  assert.equal(gameName("hangar", "hall", { GAME_FEATURES: "hangar" }), "hangar:hall:v1");
  assert.equal(gameName("hangar", "lobby", { GAME_FEATURES: "hangar" }), "", "only its own venue");
  assert.equal(gameName("ghost-hunt", "arena", {}), "ghost-hunt:arena:v1", "a kind that is not optional is always on");
});

test("the hall reads only a page's words on the Jet and its hold, and nothing else a page says", () => {
  assert.equal(hangar.parse(null), false);
  assert.equal(hangar.parse([]), false);
  assert.deepEqual(hangar.parse({ t: "jet", on: true, near: false, extra: 1 }), { t: "jet", on: true, near: false, busy: false });
  assert.deepEqual(hangar.parse({ t: "jet", on: false, near: false, busy: true }), { t: "jet", on: false, near: false, busy: true });
  assert.equal(hangar.parse({ t: "jet", on: false, near: false, busy: "yes" }).busy, false, "a hold is a boolean or none");
  assert.equal(hangar.parse({ t: "jet", on: 1, near: false }), null);
  assert.deepEqual(hangar.parse({ t: "fire", by: 9 }), { t: "fire" }, "a press says nothing of who pressed: the hall knows whose page sent it");
  assert.equal(hangar.parse({ t: "shout" }), null);
});

test("anomalies come one at a time for everyone, a gap apart, each kind once a bag, and go out with their start", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded());
  assert.equal(g.running(), false, "an empty hall does not run");
  g.join({ id: 1 }, t0);
  assert.equal(g.running(), true);
  const first = g.debug.nextAt - t0;
  assert.ok(first >= A.gap[0] * S && first <= A.gap[1] * S, `the first comes a gap after the first arrival: ${first}`);
  g.join({ id: 2 }, t0 + 5 * S);
  assert.equal(g.debug.nextAt - t0, first, "a later arrival keeps the hall's wait");
  const seen = [];
  let t = t0;
  while (seen.length < HALL.KINDS.length) {
    t += 250;
    if (!g.step(t) || !g.state().anomaly) continue;
    const a = g.state().anomaly;
    assert.equal(a.at, t);
    seen.push(a.kind);
    const end = a.at + A.length[a.kind] * S;
    at(g, t + 250, end - 250);
    assert.equal(g.state().anomaly, a, "it plays its whole length");
    t = end;
    assert.equal(g.step(t), true);
    assert.equal(g.state().anomaly, null);
    const wait = g.debug.nextAt - t;
    assert.ok(wait >= A.gap[0] * S && wait <= A.gap[1] * S, "the next is a gap after its end");
  }
  assert.deepEqual([...seen].sort(), [...HALL.KINDS].sort(), "a whole bag before any kind comes round again");
  g.leave({ id: 1 }); g.leave({ id: 2 });
  assert.equal(g.running(), false);
  assert.equal(g.save(), null, "an empty hall keeps no record");
});

test("the lowrider waits for an empty Jet and the shuffle for clear ground, and either stops the moment a page says", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(3));
  g.join({ id: 1 }, t0);
  g.message({ id: 1 }, { t: "jet", on: true, near: true }, t0);
  for (let n = 0; n < 40; n++) {
    g.debug.begin(t0 + n * 100 * S);
    assert.ok(!["lowrider", "shuffle"].includes(g.state().anomaly.kind), "never with someone on the Jet or near it");
  }
  g.message({ id: 1 }, { t: "jet", on: false, near: false }, t0);
  let shuffle = null;
  for (let n = 0; n < 40 && !shuffle; n++) { g.debug.begin(t0); if (g.state().anomaly.kind === "shuffle") shuffle = g.state().anomaly; }
  assert.ok(shuffle, "with the ground clear the shuffle comes");
  g.join({ id: 2 }, t0);
  assert.equal(g.message({ id: 2 }, { t: "jet", on: false, near: true }, t0 + S), true, "a page's word goes out at once");
  assert.equal(g.state().anomaly, null, "and the shuffle stops for everyone");
});

test("a lightning jumps to a room only while no room burns, and a restart picks the hall up where it stopped", () => {
  const t0 = 1.7e12, g = hangar.create(t0, () => 0);
  g.join({ id: 1 }, t0);
  g.step(t0);
  let jumps = 0, lightnings = 0;
  for (let n = 0; n < 60; n++) {
    g.debug.begin(t0 + n * 250);
    const a = g.state().anomaly;
    if (a.kind !== "lightning") continue;
    lightnings++;
    if (a.jump) {
      jumps++;
      assert.ok(a.room >= 0 && a.room < 1);
      assert.deepEqual(g.state().room, { id: a.id, at: a.at + A.lands * S, room: a.room }, "its room's fire is named apart, from when the bolt lands");
    }
  }
  assert.ok(lightnings > 1 && jumps === 1, `one jump while its fire burns: ${jumps} of ${lightnings}`);
  const fire = g.state().room;
  g.debug.end(t0 + 15 * S);
  assert.equal(g.step(fire.at + HALL.ROOM_FIRE.done * S - 1), false);
  assert.deepEqual(g.state().room, fire, "the fire burns on after its lightning");
  assert.equal(g.step(fire.at + HALL.ROOM_FIRE.done * S), true);
  assert.equal(g.state().room, null, "and goes out for everyone at its end");
  const saved = g.save(), h = hangar.create(t0, seeded());
  assert.equal(h.restore(saved, t0 + 2 * S), true);
  const without = ({ host, ...rest }) => rest;
  assert.deepEqual(without(h.state()), without(g.state()), "its schedule comes back; its host is chosen again from who reconnects");
  assert.equal(h.restore("{", t0), false);
  assert.equal(h.restore(JSON.stringify({ bag: ["nope"] }), t0), false, "a record it cannot read is refused");
});

test("one press starts the fire test for everyone, none while it runs or cools down, and no anomaly comes near it", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(5));
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  const press = g.debug.nextAt - 2 * S;
  at(g, t0, press - 250);
  assert.equal(g.state().anomaly, null);
  assert.equal(g.message({ id: 2 }, { t: "fire" }, press), true);
  assert.deepEqual(g.state().test, { id: 1, at: press, by: 2 });
  assert.equal(g.message({ id: 1 }, { t: "fire" }, press + S), false, "a second press while it runs does nothing");
  const held = press + (HALL.FIRE.result + A.afterFire) * S;
  at(g, press, held - 250);
  assert.equal(g.state().anomaly, null, "the anomaly due two seconds into the test waits until a while after it hands back");
  at(g, held, held);
  assert.ok(g.state().anomaly, "and comes then");
  at(g, held + 250, press + HALL.FIRE.ready * S);
  assert.equal(g.state().test, null, "ready again after its cooldown");
  g.debug.begin(t0 + 40 * S);
  assert.equal(g.message({ id: 1 }, { t: "fire" }, t0 + 41 * S), false, "nor while an anomaly plays");
});

test("the film show starts and stops for everyone, ends when the first page's film runs out, and starts again once wound up", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(9));
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  assert.deepEqual(hangar.parse({ t: "film", done: "x" }), null);
  assert.equal(g.message({ id: 1 }, { t: "film" }, t0), true);
  const film = g.state().film;
  assert.deepEqual(film, { id: 1, at: t0, by: 1, end: null });
  assert.equal(g.message({ id: 2 }, { t: "film", done: 99 }, t0 + 60 * S), false, "only the film showing ends");
  assert.equal(g.message({ id: 2 }, { t: "film", done: film.id }, t0 + 60 * S), true);
  assert.equal(g.state().film.end, t0 + 60 * S);
  assert.equal(g.message({ id: 1 }, { t: "film", done: film.id }, t0 + 61 * S), false, "the first page to say so is enough");
  assert.equal(g.message({ id: 1 }, { t: "film" }, t0 + 62 * S), false, "not again while it winds up");
  assert.equal(g.step(t0 + 60 * S + HALL.FILM.wind * S), true);
  assert.equal(g.state().film, null);
  assert.equal(g.message({ id: 2 }, { t: "film" }, t0 + 80 * S), true);
  assert.equal(g.message({ id: 1 }, { t: "film" }, t0 + 81 * S), true, "a press while it shows stops it");
  assert.equal(g.state().film.end, t0 + 81 * S);
});

test("one page moves the hall's walkers: the earliest arrival that is showing, handed on as it leaves or hides", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(2));
  assert.deepEqual(hangar.parse({ t: "seen", v: "yes" }), null);
  g.join({ id: 4 }, t0); g.join({ id: 5 }, t0); g.join({ id: 6 }, t0);
  assert.equal(g.state().host, 4);
  const frame = (magic, full = 0) => { const b = new ArrayBuffer(19), v = new DataView(b); v.setUint32(0, magic, true); v.setUint8(5, full); return b; };
  assert.equal(g.relay({ id: 4 }, t0, frame(0x3148474f)), true);
  assert.equal(g.relay({ id: 5 }, t0, frame(0x3148474f)), false, "nobody else's frames go on");
  assert.equal(g.message({ id: 4 }, { t: "seen", v: false }, t0), true, "a hidden host hands on, and the hall says so at once");
  assert.equal(g.state().host, 5);
  assert.equal(g.message({ id: 4 }, { t: "seen", v: true }, t0), false, "and keeps the new one when it comes back");
  g.leave({ id: 5 });
  assert.equal(g.step(t0 + 250), true, "a host leaving is told on the next tick");
  assert.equal(g.state().host, 4);
  g.message({ id: 4 }, { t: "seen", v: false }, t0); g.message({ id: 6 }, { t: "seen", v: false }, t0);
  assert.equal(g.state().host, 0, "with every page hidden, nobody moves them");
});

test("the host's shape is everyone's, and a walk up to it plays the network for everyone by that player's own odds", () => {
  const t0 = 1.7e12, N = HALL.NETWORK, draws = [];
  const g = hangar.create(t0, () => draws.length ? draws.shift() : 0.5);
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  draws.push(0.7, 0.9, 0.1);
  const s = SHAPE;
  assert.equal(hangar.parse({ t: "shape", s: { ...s, end: 999 } }), null, "a showing longer than any is refused");
  const widest = Object.fromEntries(Object.keys(s).map((k) => [k, k.endsWith("Seed") ? 999999 : -123.456]));
  widest.end = 39.999;
  assert.ok(JSON.stringify({ t: "shape", s: widest }).length <= hangar.limits.chars, "a showing at its widest fits a message to the hall");
  assert.equal(g.message({ id: 2 }, hangar.parse({ t: "shape", s }), t0), false, "only from the host");
  assert.equal(g.message({ id: 1 }, hangar.parse({ t: "shape", s }), t0), true);
  const shape = g.state().shape;
  assert.deepEqual(shape.s, s);
  const walk = (who, at) => g.message({ id: who }, hangar.parse({ t: "walkup", id: shape.id, x: 1, z: 1 }), at);
  assert.equal(walk(2, t0 + S), false, "a first walk up misses at 0.7 against 60%");
  assert.equal(walk(2, t0 + 2 * S), false, "one draw a showing");
  assert.equal(walk(1, t0 + 3 * S), false, "the other player's first walk up misses at 0.9");
  g.step(t0 + 30 * S);
  assert.equal(g.state().shape, null, "gone with its afterimage");
  g.message({ id: 1 }, hangar.parse({ t: "shape", s }), t0 + 31 * S);
  const second = g.state().shape;
  assert.equal(g.message({ id: 2 }, hangar.parse({ t: "walkup", id: second.id, x: 1, z: 1 }), t0 + 32 * S), true, "their second walk up plays it at 85%");
  const net = g.state().network;
  assert.deepEqual([net.x, net.z, net.dense], [1, 1, false]);
  assert.ok(g.debug.nextAt >= net.at + (N.end + N.quiet + N.defer[0]) * S, "the next anomaly waits past its quiet");
  assert.equal(g.message({ id: 1 }, { t: "fire" }, net.at + S), false, "no test while it plays");
  g.step(net.at + (N.end + N.quiet) * S);
  assert.equal(g.state().network, null);
  g.step(second.at + 30 * S);
  g.message({ id: 1 }, hangar.parse({ t: "shape", s }), t0 + 90 * S);
  const third = g.state().shape;
  g.join({ id: 3 }, t0 + 90 * S);
  draws.push(0, 0);
  assert.equal(g.message({ id: 1 }, hangar.parse({ t: "walkup", id: third.id, x: 1, z: 1 }), t0 + 91 * S), false, "the showing after it played draws for nobody who saw it");
  assert.equal(g.message({ id: 3 }, hangar.parse({ t: "walkup", id: third.id, x: 1, z: 1 }), t0 + 92 * S), false, "nor for anyone who came in since");
  assert.equal(draws.length, 2, "nothing drawn on it");
});

test("a player's odds at the shape outlast a reload: their ladder goes on, and a showing they drew on draws for them no more", () => {
  const t0 = 1.7e12, draws = [];
  const g = hangar.create(t0, () => draws.length ? draws.shift() : 0.5);
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  const show = (t) => { g.message({ id: 1 }, hangar.parse({ t: "shape", s: SHAPE }), t); return g.state().shape; };
  const walk = (who, shape, t) => g.message({ id: who }, hangar.parse({ t: "walkup", id: shape.id, x: 1, z: 1 }), t);
  draws.push(0.7);
  const first = show(t0);
  assert.equal(walk(2, first, t0 + S), false, "a first walk up misses at 0.7 against 60%");
  g.leave({ id: 2 }); g.join({ id: 2 }, t0 + 2 * S);
  assert.equal(walk(2, first, t0 + 3 * S), false, "back in, no second draw on the same showing");
  assert.equal(draws.length, 0);
  g.step(t0 + 30 * S);
  draws.push(0.9);
  const second = show(t0 + 31 * S);
  assert.equal(walk(2, second, t0 + 32 * S), false, "their second at 0.9 misses against 85%, not a fresh 60%");
  g.leave({ id: 2 }); g.join({ id: 2 }, t0 + 33 * S);
  g.step(t0 + 61 * S);
  draws.push(0.99);
  const third = show(t0 + 62 * S);
  assert.equal(walk(2, third, t0 + 63 * S), true, "and their third plays it, as it would have without the reloads");
});

test("no anomaly starts while the shape shows or while the host's page holds them back, as on a page alone", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(3));
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  const due = g.debug.nextAt;
  at(g, t0, due - S);
  assert.equal(g.message({ id: 1 }, hangar.parse({ t: "shape", s: SHAPE }), due - S), true);
  at(g, due - S, due + 20 * S);
  assert.equal(g.state().anomaly, null, "not while the shape shows");
  g.message({ id: 1 }, hangar.parse({ t: "jet", on: false, near: false, busy: true }), due + 21 * S);
  at(g, due + 21 * S, due + 60 * S);
  assert.equal(g.state().shape, null);
  assert.equal(g.state().anomaly, null, "nor while the host holds them back (a meltdown, the shape just gone)");
  g.message({ id: 2 }, hangar.parse({ t: "jet", on: false, near: false, busy: true }), due + 61 * S);
  g.message({ id: 1 }, hangar.parse({ t: "jet", on: false, near: false, busy: false }), due + 61 * S);
  at(g, due + 61 * S, due + 61 * S);
  assert.ok(g.state().anomaly, "a follower's hold is not the hall's: it comes once the host lets go");
});

test("a poke at Sis from any page is kept for the host, numbered, the last few", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(4));
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  assert.equal(hangar.bucketOf("poke"), "poke");
  for (let i = 0; i < 10; i++) assert.equal(g.message({ id: 1 + (i % 2) }, { t: "poke" }, t0 + i), true);
  const pokes = g.state().pokes;
  assert.equal(pokes.length, 8);
  assert.deepEqual(pokes.at(-1), [10, 2]);
  assert.deepEqual(pokes[0], [3, 1]);
});

test("the forklift has one driver, whose frames alone go on, and the last whole one greets a page joining", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(6));
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  const frame = (magic, full = 0) => { const b = new ArrayBuffer(19), v = new DataView(b); v.setUint32(0, magic, true); v.setUint8(5, full); return b; };
  const LIFT = 0x3146474f;
  assert.deepEqual(g.greet({ id: 3 }), [], "nothing kept before anyone drives");
  assert.equal(g.message({ id: 2 }, { t: "seat", on: true }, t0), true);
  assert.equal(g.state().driver, 2);
  assert.equal(g.message({ id: 1 }, { t: "seat", on: true }, t0), false, "one driver at a time");
  assert.equal(g.relay({ id: 1 }, t0, frame(LIFT, 1)), false, "the host does not drive it");
  const whole = frame(LIFT, 1);
  assert.equal(g.relay({ id: 2 }, t0, whole), true);
  assert.equal(g.relay({ id: 2 }, t0, frame(LIFT, 0)), true);
  assert.deepEqual(g.greet({ id: 3 }), [whole], "the last whole frame, not the changes after it");
  assert.equal(g.message({ id: 1 }, { t: "seat", on: false }, t0), false, "only the driver gets out");
  g.leave({ id: 2 });
  assert.equal(g.state().driver, 0, "a driver's page going leaves the seat free");
  assert.deepEqual(g.greet({ id: 3 }), [whole], "and the forklift where they left it");
});

test("Tess in the hall: the island's queue, one turn at a time, and the host's pose of her between turns", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(8)), told = [];
  g.tell = (id, msg) => told.push([id, msg]);
  g.join({ id: 1 }, t0); g.join({ id: 2 }, t0);
  const views = (id) => told.filter(([to, m]) => to === id && m.op === "state").map(([, m]) => m);
  g.message({ id: 2 }, hangar.parse({ t: "tess-guide", op: "join" }), t0);
  const ready = views(2).at(-1);
  assert.equal(ready.phase, "ready", "alone in the queue, it is their turn to accept");
  assert.ok(ready.token, "their own token, told to them alone");
  assert.ok(views(1).every((v) => v.token === ""), "nobody else hears it");
  const a = [1, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 1];
  g.message({ id: 1 }, hangar.parse({ t: "tess-pose", a }), t0);
  assert.deepEqual(told.filter(([to, m]) => to === 2 && m.op === "pose").map(([, m]) => m.a), [a], "the host's pose between turns goes to everyone else");
  g.message({ id: 2 }, hangar.parse({ t: "tess-guide", op: "accept", token: ready.token }), t0);
  assert.equal(views(2).at(-1).phase, "active");
  told.length = 0;
  g.message({ id: 1 }, hangar.parse({ t: "tess-pose", a }), t0 + 500);
  assert.equal(told.length, 0, "not while someone has her");
  assert.equal(hangar.parse({ t: "tess-pose", a: [1, 2] }), null);
  assert.equal(hangar.bucketOf("tess-guide"), "tess");
  assert.equal(hangar.bucketOf("seat"), "seat", "the forklift's seat apart from the presses, so getting out is never dropped behind one");
  assert.ok(hangar.buckets.relay.rate >= 2 * 1000 / 100, "room for the walkers' and the forklift's frames from one page");
});

test("a desk monitor turned on any page is counted for everyone", () => {
  const t0 = 1.7e12, g = hangar.create(t0, seeded(10));
  g.join({ id: 1 }, t0);
  assert.equal(hangar.parse({ t: "desk", i: 99, m: 0 }), null);
  assert.equal(g.message({ id: 1 }, hangar.parse({ t: "desk", i: 2, m: 1 }), t0), true);
  g.message({ id: 1 }, hangar.parse({ t: "desk", i: 2, m: 1 }), t0);
  assert.equal(g.state().desks[5], 2);
  g.message({ id: 1 }, { t: "poke" }, t0);
  const h = hangar.create(t0, seeded(11));
  assert.equal(h.restore(g.save(), t0), true);
  assert.equal(h.state().desks[5], 2, "the counts come back after a restart");
  h.join({ id: 1 }, t0); h.message({ id: 1 }, { t: "poke" }, t0);
  assert.deepEqual(h.state().pokes.at(-1), [2, 1], "and the pokes go on numbering from where they were");
});
