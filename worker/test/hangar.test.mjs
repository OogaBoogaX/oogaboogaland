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

test("the hangar is off unless GAME_FEATURES names it: not offered, and its route names no object", () => {
  assert.deepEqual(gamesOn({}), ["ghost-hunt"]);
  assert.equal(gameName("hangar", "hall", {}), "");
  assert.equal(gameName("hangar", "hall", { GAME_FEATURES: "hangar" }), "hangar:hall:v1");
  assert.equal(gameName("hangar", "lobby", { GAME_FEATURES: "hangar" }), "", "only its own venue");
  assert.equal(gameName("ghost-hunt", "arena", {}), "ghost-hunt:arena:v1", "a kind that is not optional is always on");
});

test("the hall reads only the Jet's two words, and nothing else a page says", () => {
  assert.equal(hangar.parse(null), false);
  assert.equal(hangar.parse([]), false);
  assert.deepEqual(hangar.parse({ t: "jet", on: true, near: false, extra: 1 }), { t: "jet", on: true, near: false });
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
  assert.equal(g.message({ id: 2 }, { t: "fire" }, t0 + S), true);
  assert.deepEqual(g.state().test, { id: 1, at: t0 + S, by: 2 });
  assert.equal(g.message({ id: 1 }, { t: "fire" }, t0 + 2 * S), false, "a second press while it runs does nothing");
  const held = t0 + S + (HALL.FIRE.result + A.afterFire) * S, nextAt = g.debug.nextAt;
  at(g, Math.max(t0, nextAt - 250), held - 250);
  if (nextAt < held) assert.equal(g.state().anomaly, null, "an anomaly due during the test waits");
  assert.equal(g.step(t0 + S + HALL.FIRE.ready * S), true);
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
  assert.equal(g.relay({ id: 4 }), true);
  assert.equal(g.relay({ id: 5 }), false, "nobody else's frames go on");
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
  const s = { x: 3, z: -4, mirror: 1, slow: 0.2, formed: 2, held: 9, gone: 11, end: 30, nearOn: 1, nearReach: 5, nearShare: 0.3, nearPeak: 0.1, nearSeed: 7,
    catchOn: 0, close: 2, catchShare: 0.2, catchSeed: 9, stirOn: 1, stirReach: 4, stirPeak: 0.3 };
  assert.equal(hangar.parse({ t: "shape", s: { ...s, end: 999 } }), null, "a showing longer than any is refused");
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
  assert.equal(g.message({ id: 1 }, hangar.parse({ t: "walkup", id: third.id, x: 1, z: 1 }), t0 + 91 * S), false, "the showing after it played draws for nobody who saw it");
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
