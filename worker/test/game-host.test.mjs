// The games the Worker hosts (game-host.js, games.js) and the ghost hunt it hosts (games/ghost-hunt.js, HALLOWEEN): an
// instance is one kind's, its sockets capped and replaced as the room's are, its messages read and limited, its tick
// running only while its game runs and its game picked up again after a restart; and the hunt decides every hit itself,
// from where its players' pages say they stand, rewound to what the shooter's page showed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { ghostHunt } from "../src/games/ghost-hunt.js";
import "../../src/js/game-wire.js";

const WIRE = globalThis.BL.gameWire, SIM = globalThis.BL.ghostSim, ST = SIM.STATE;

// A kind for the host's own checks: it says what it hears, runs from `run` to `stop`, and saves how far it stepped.
const echo = {
  id: "echo", code: 9, version: 1, venues: ["here"], tickMs: 50, stateEvery: 2,
  limits: { sockets: 3, chars: 64 },
  buckets: { say: { rate: 2, burst: 2 } }, bucketOf: () => "say",
  parse: (m) => !m || typeof m !== "object" || typeof m.t !== "string" ? false : ["say", "run", "stop"].includes(m.t) ? m : null,
  create: () => {
    let running = false, steps = 0, restored = null;
    const heard = [];
    return {
      join: (p) => heard.push(`join ${p.id}`), leave: (p) => heard.push(`leave ${p.id}`),
      message: (p, m) => { heard.push(`${m.t} ${p.id}`); if (m.t !== "say") running = m.t === "run"; return m.t !== "say"; },
      step: () => { steps++; return false; }, running: () => running,
      state: () => ({ heard: heard.slice(), steps, running, restored }),
      motion: (f, now) => {
        f.kind = 9; f.serverMs = now; f.gameMs = steps * 50; f.count = 1; f.confirms = 0;
        f.rows.set([0, 0, 7, 1, 2, 3, 0, 1]);
        return running;
      },
      save: () => running ? JSON.stringify({ steps }) : null,
      restore: (data) => { restored = JSON.parse(data); running = true; return true; }
    };
  }
};
const KINDS = new Map([[echo.id, echo], [ghostHunt.id, ghostHunt]]);

const harness = ({ stored = new Map(), env = {} } = {}) => {
  const clock = { now: 1.7e12 };
  const timers = [], accepted = [];
  const socket = () => ({
    sent: [], bins: [], closed: null, store: null,
    send(m) { if (typeof m === "string") this.sent.push(JSON.parse(m)); else this.bins.push(m); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(v) { this.store = v === null ? null : JSON.parse(JSON.stringify(v)); },
    deserializeAttachment() { return this.store; }
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; } }
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } }
  const kindOf = (name) => {
    const [kind, venue, version] = String(name).split(":"), k = KINDS.get(kind);
    return k && k.venues.includes(venue) && version === `v${k.version}` ? k : null;
  };
  const source = readFileSync(new URL("../src/game-host.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace(/import\s+"[^"]+";/g, "")
    .replace("export class GameHost", "class GameHost") + "\nglobalThis.GameHost = GameHost;";
  const context = { ...protocol, kindOf, BL: globalThis.BL, WebSocketPair, Response, WebSocketRequestResponsePair: class {}, Date: Clock,
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    Map, Set, Object, JSON, Promise, ArrayBuffer, DataView, Math, String, Number,
    setTimeout: (fn, ms) => { timers.push({ fn, at: clock.now + ms }); return timers.length; }, clearTimeout: () => {} };
  runInNewContext(source, context);
  let ready = null;
  const alarm = { at: null };
  const storage = { get: async (k) => stored.get(k), put: async (k, v) => { stored.set(k, structuredClone(v)); }, delete: async (k) => { stored.delete(k); },
    getAlarm: async () => alarm.at, setAlarm: async (at) => { alarm.at = at; } };
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => (ready = fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed && ws.store), storage };
  const host = new context.GameHost(ctx, env);
  const join = async (id, name = "echo:here:v1", extra = {}) => {
    await ready;
    const before = accepted.length;
    const res = await host.fetch({ headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": `p${id}`, "x-player-contributor": "1", "x-game-name": name, ...extra }) });
    return { res, ws: accepted[before] };
  };
  const send = (ws, m) => host.webSocketMessage(ws, typeof m === "string" ? m : JSON.stringify(m));
  // Runs every timer due by `ms` from now, in order, the clock moving to each.
  const run = (ms) => {
    const until = clock.now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > until) break;
      const t = timers.shift();
      clock.now = t.at;
      t.fn();
    }
    clock.now = until;
  };
  return { host, join, send, run, timers, stored, clock, alarm, ready: () => ready };
};
const states = (ws) => ws.sent.filter((m) => m.t === "state");

test("an instance is one game's, named by the Worker; a newer socket replaces the older, a full one refuses, a joiner hears the game at once", async () => {
  const h = harness();
  assert.equal((await h.host.fetch({ headers: new Headers({ "x-game-name": "echo:here:v1" }) })).status, 426);
  assert.equal((await h.join(1, "echo:here:v1", { "x-player-contributor": "0" })).res.status, 403, "contributors with an Ooga only");
  assert.equal((await h.join(1, "echo:there:v1")).res.status, 404, "no venue the registry does not name");
  const first = await h.join(1);
  assert.equal(first.res.status, 101);
  assert.equal(first.ws.sent[0].t, "welcome");
  assert.equal(first.ws.sent[0].you, 1);
  assert.deepEqual(states(first.ws).at(-1).s.heard, ["join 1"], "the game as it stands, at once");
  assert.equal((await h.join(2, "ghost-hunt:arena:v1")).res.status, 404, "an instance is only ever the one game");
  const again = await h.join(1);
  assert.deepEqual(first.ws.sent.at(-1), { t: "kick", reason: "replaced" });
  assert.equal(first.ws.closed.code, protocol.CLOSE_KICK);
  assert.equal(again.res.status, 101);
  await h.join(2); await h.join(3);
  const full = await h.join(4);
  assert.deepEqual(full.ws.sent, [{ t: "kick", reason: "full" }], "past the kind's cap a socket is refused");
  assert.equal(h.host.sockets.size, 3);
});

test("an unreadable message closes its socket, an unknown one is ignored, one past its bucket is dropped, and a change goes out at once", async () => {
  const h = harness();
  const a = (await h.join(1)).ws, b = (await h.join(2)).ws;
  await h.send(a, { t: "nope" });
  assert.equal(a.closed, null, "an unknown message is ignored");
  for (let i = 0; i < 4; i++) await h.send(a, { t: "say" });
  await h.send(a, { t: "run" });
  h.clock.now += 1000;
  await h.send(a, { t: "run" });
  const heard = states(b).at(-1).s.heard;
  assert.deepEqual(heard.filter((w) => w === "say 1").length, 2, "past its bucket a page's messages are dropped");
  assert.ok(heard.includes("run 1"), "a change goes to every page at once");
  await h.send(b, "x".repeat(65));
  assert.equal(b.closed.code, protocol.CLOSE_PROTOCOL, "too long");
  await h.send(a, "{not json");
  assert.equal(a.closed.code, protocol.CLOSE_PROTOCOL, "not a message at all");
  assert.equal(h.host.sockets.size, 0);
});

test("the tick runs only while the game runs: motion every tick, the state every few, saved while running and dropped once it stops", async () => {
  const h = harness();
  const a = (await h.join(1)).ws;
  assert.equal(h.timers.length, 0, "an idle game keeps no timer, so the object can sleep");
  await h.send(a, { t: "run" });
  assert.equal(h.timers.length, 1);
  const before = states(a).length;
  h.run(200);
  assert.equal(a.bins.length, 4, "a motion frame every tick");
  const frame = WIRE.frame();
  assert.ok(WIRE.decode(a.bins[0], frame) && frame.kind === 9 && frame.count === 1 && frame.rows[2] === 7 && frame.rows[3] === 1);
  assert.equal(states(a).length - before, 2, "the whole state every `stateEvery` ticks");
  assert.ok(h.stored.has("game"), "saved as it starts");
  h.run(5000);
  assert.ok(JSON.parse(h.stored.get("game").data).steps > 50, "and again every few seconds while it runs");
  await h.send(a, { t: "stop" });
  h.run(500);
  assert.equal(h.timers.length, 0, "stopped, it keeps no timer");
  assert.equal(h.stored.has("game"), false, "and keeps no record");
});

test("a record left behind (a restart nobody came back to) is swept once it is past resuming", async () => {
  const h = harness();
  const a = (await h.join(1)).ws;
  await h.send(a, { t: "run" });
  assert.ok(h.stored.has("game") && h.alarm.at === h.clock.now + 10 * 60000, "the first save sets the sweep");
  h.stored.get("game").at = h.clock.now;
  h.clock.now += 5 * 60000;
  await h.host.alarm();
  assert.ok(h.stored.has("game") && h.alarm.at > h.clock.now, "a record still being saved waits for the next sweep");
  h.clock.now += 6 * 60000;
  await h.host.alarm();
  assert.equal(h.stored.has("game"), false, "one past resuming goes");
});

test("an instance started again picks its game up where it was saved, unless the save is long gone", async () => {
  const fresh = harness({ stored: new Map([["game", { name: "echo:here:v1", at: 1.7e12 - 2000, data: JSON.stringify({ steps: 5 }) }]]) });
  await fresh.ready();
  assert.deepEqual(fresh.host.game.state().restored, { steps: 5 });
  assert.equal(fresh.timers.length, 1, "and runs it on");
  const stale = harness({ stored: new Map([["game", { name: "echo:here:v1", at: 1.7e12 - 11 * 60000, data: JSON.stringify({ steps: 5 }) }]]) });
  await stale.ready();
  assert.equal(stale.host.game.state().restored, null);
  assert.equal(stale.timers.length, 0);
  assert.equal(stale.stored.has("game"), false, "and the stale record goes");
});

// ---------- the ghost hunt (HALLOWEEN) ----------
const T0 = 1.7e12;
const hunt = () => {
  const g = ghostHunt.create(T0), sim = g.debug.sim, S = sim.state, rows = new Float64Array(SIM.TARGET_SLOTS * SIM.TARGET_WIDTH);
  const frame = WIRE.frame();
  const t = { now: T0, safe: new Set(), poses: new Map() };
  const say = (p, m) => {
    const parsed = ghostHunt.parse(m);
    return parsed ? g.message(p, parsed, t.now) : parsed;
  };
  const pose = (p, x, y, z, yaw = 0) => { t.poses.set(p, [x, y, z, yaw]); return say(p, { t: "pose", p: [x, y, z, yaw, 1.5] }); };
  const tick = (ms = 50) => {
    t.now += ms;
    for (const [p, [x, y, z, yaw]] of t.poses) say(p, { t: "pose", p: [x, y, z, yaw, 1.5] });
    g.step(t.now);
    for (const id of t.safe) { const q = sim.playerById(id); if (q) q.invulnUntil = S.now + 1e6; }
  };
  const until = (done, ms = 120000) => { for (let i = 0; i < ms / 50 && !done(); i++) tick(); return done(); };
  // The confirmations the hunt's next motion frame carries.
  const confirmations = () => {
    g.motion(frame, t.now);
    const out = [];
    for (let i = 0; i < frame.confirms; i++) out.push(Array.from(frame.confirm.subarray(i * 5, i * 5 + 5)));
    return out;
  };
  const past = (at) => { g.debug.history.sample(at, rows); return rows; };
  let q = 0;
  const shoot = (p, from, to, at, h = [-1, -1, -1]) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], l = Math.hypot(...d);
    return say(p, { t: "shot", q: ++q, at, o: from, d: d.map((v) => v / l), l, h, damage: 60 });
  };
  return { g, sim, S, t, say, pose, tick, until, confirmations, past, shoot };
};
const page = (id, debug = false) => ({ id, debug });
// A hunt under way: two hunters standing in the arena, kept from harm, a round on with a ghost to shoot.
const fight = () => {
  const H = hunt(), a = page(1), b = page(2);
  H.pose(a, 0, 0, 4); H.pose(b, 3, 0, -3);
  H.say(a, { t: "start" }); H.say(b, { t: "ready" }); H.say(a, { t: "ready" });
  H.t.safe.add(1); H.t.safe.add(2);
  assert.ok(H.until(() => H.S.state === ST.ACTIVE && H.sim.ghosts.some((g) => g.on && !g.dying)), "a round comes");
  return { H, a, b };
};
// What a line from `from` toward the middle of each open ghost meets, by the rules' own test (ghost-sim.js
// `resolveShot`): the first ghost it meets in the table `ms` ago and, when `clearNow`, meets nothing now, ticking on
// until one does. Its slot, id, middle then and that time.
const MET = { slot: -1, id: 0, along: 0, x: 0, y: 0, z: 0 };
const aimAt = (H, from, ms = 0, clearNow = false) => {
  for (let i = 0; i < 600; i++) {
    const then = H.past(H.S.now - ms).slice(), now = H.past(H.S.now).slice();
    for (let s = 0; s < SIM.TARGET_BRUTES; s++) {
      const o = s * SIM.TARGET_WIDTH;
      if (!(then[o + 5] & SIM.TARGET_OPEN)) continue;
      const c = [then[o + 1], then[o + 2], then[o + 3]], l = Math.hypot(c[0] - from[0], c[1] - from[1], c[2] - from[2]);
      const u = [(c[0] - from[0]) / l, (c[1] - from[1]) / l, (c[2] - from[2]) / l];
      if (!SIM.resolveShot(then, ...from, ...u, SIM.HIT.range, -1, 0, 0.15, MET) || MET.id !== then[o]) continue;
      if (clearNow && SIM.resolveShot(now, ...from, ...u, SIM.HIT.range, -1, 0, 0.15, MET)) continue;
      return { slot: s, id: then[o], r: then[o + 4], then: c, at: H.S.now - ms };
    }
    H.tick();
  }
  return null;
};

test("only a page standing in the arena wakes the herald or readies up, and only a debug account starts past round 1", () => {
  const H = hunt(), a = page(1), b = page(2), dev = page(3, true);
  assert.equal(H.say(a, { t: "start" }), false, "a page that has said nowhere");
  H.pose(a, 40, 0, 0);
  assert.equal(H.say(a, { t: "start" }), false, "a page in the hallway");
  H.pose(a, 0, 0, 4);
  assert.equal(H.say(a, { t: "start" }), false, "nor one that jumped there farther than an Ooga runs, for half a second");
  H.tick(600);
  assert.equal(H.say(a, { t: "start", r: 5 }), true);
  assert.equal(H.S.state, ST.GATHER);
  assert.equal(H.S.round, 1, "a round past the first only for a debug account");
  H.pose(b, 40, 0, 0);
  assert.equal(H.say(b, { t: "ready" }), false, "a spectator cannot ready up");
  const D = hunt();
  D.pose(dev, 0, 0, 4);
  D.say(dev, { t: "start", r: 5 });
  assert.equal(D.S.round, 5);
  assert.equal(D.say(page(4), { t: "pause" }), false, "nor pause");
});

test("the server decides every hit: a page's own damage counts for nothing, a round rewound to what its page showed lands, the same line now misses", () => {
  const { H, a } = fight();
  const from = [0, 1.2, 4], m = aimAt(H, from, 500, true);
  assert.ok(m, "a ghost a line met half a second ago that it meets no longer");
  const g = H.sim.ghosts[m.slot], hp = g.hp, damage = H.sim.shotDamage();
  H.shoot(a, from, m.then, H.S.now + 10);
  assert.equal(g.hp, hp, "aimed where it stood then, but saying it is now: a miss");
  assert.deepEqual(H.confirmations(), []);
  H.shoot(a, from, m.then, m.at);
  assert.ok(g.dying || g.hp === hp - damage, "rewound to then it lands, for the rules' damage, not the page's 60");
  const [c] = H.confirmations();
  assert.deepEqual(c.slice(0, 4), [1, c[1], m.id & 0xffff, damage]);
});

test("a shot from someone not in the hunt, down, or far from where their page said they stand lands nothing", () => {
  const { H, a } = fight();
  const from = [0, 1.2, 4], m = aimAt(H, from), c = page(3);
  assert.ok(m);
  H.pose(c, 0, 0, 4);
  H.shoot(c, from, m.then, m.at);
  H.shoot(a, [12, 1.2, 4], m.then, m.at);
  assert.deepEqual(H.confirmations(), [], "a stranger, and a round from 12 m off its hunter");
  H.sim.playerById(1).frozenUntil = 1e12;
  H.shoot(a, from, m.then, m.at);
  assert.deepEqual(H.confirmations(), [], "a hunter who is down");
});

test("a round the page saw meet a target lands on it when the line passes near; with no such hint the same line misses", () => {
  const { H, a } = fight();
  const from = [0, 1.2, 4];
  let m = null, wide = null;
  for (let i = 0; i < 400 && !wide; i++) {
    m = aimAt(H, from);
    const rows = H.past(H.S.now), [cx, cy, cz] = m.then, dx = cx - from[0], dz = cz - from[2], flat = Math.hypot(dx, dz);
    // A line from the hunter passing about 0.22 m outside the ball: within the hint's pad, outside the nearest test's,
    // and meeting nothing else.
    const e = m.r + 0.22, end = [cx - dz / flat * e, cy, cz + dx / flat * e], l = Math.hypot(end[0] - from[0], end[1] - from[1], end[2] - from[2]);
    const u = [(end[0] - from[0]) / l, (end[1] - from[1]) / l, (end[2] - from[2]) / l];
    if (!SIM.resolveShot(rows, ...from, ...u, SIM.HIT.range, -1, 0, 0.15, MET) && SIM.resolveShot(rows, ...from, ...u, SIM.HIT.range, m.id, 0.3, 0.15, MET)) wide = end;
    else H.tick();
  }
  assert.ok(wide, "a near miss to try");
  H.shoot(a, from, wide, H.S.now);
  assert.deepEqual(H.confirmations(), [], "no hint, no hit");
  H.shoot(a, from, wide, H.S.now, [m.id, -1, -1]);
  assert.equal(H.confirmations().length, 1, "the page's target, near enough the line");
});

test("a hunter's monkeys fire with them from where the rules have them, and a page that drops and comes back is still in the hunt", () => {
  const { H, a } = fight();
  const me = H.sim.playerById(1), from = [0, 1.2, 4], at = { x: 0, y: 0, z: 0 }, aim = { x: 0, y: 0, z: 0 };
  // The left monkey stands where the rules have it; a ghost its rock reaches, and the hunter's own line 1.2 m beside it.
  SIM.monkeyOrigin(0, 0, 4, 0, 1.5, 1, at);
  const m = aimAt(H, [at.x, at.y, at.z]);
  assert.ok(m);
  let end = m.then.slice();
  for (let i = 0; i < 8; i++) {
    SIM.monkeyAim(from[0], from[2], end[0], end[1], end[2], 1, aim);
    end = [end[0] + m.then[0] - aim.x, end[1] + m.then[1] - aim.y, end[2] + m.then[2] - aim.z];
  }
  const monkey = () => H.confirmations().filter((c) => c[4] & 2);
  H.shoot(a, from, end, H.S.now);
  assert.equal(monkey().length, 0, "no monkeys, no monkey's rock");
  me.monkeys = 1;
  H.shoot(a, from, end, H.S.now);
  const [c] = monkey();
  assert.ok(c && c[2] === (m.id & 0xffff), "the left monkey's rock meets what its aim lines up on");
  H.g.leave(a);
  H.t.poses.delete(a);
  H.tick(); H.tick();
  assert.equal(H.sim.playerById(1).here, false, "a page gone is not in the arena");
  H.pose(a, 0, 0, 4);
  H.tick();
  assert.equal(H.sim.playerById(1).inGame, 1, "back again, still in the hunt");
  assert.equal(H.sim.playerById(1).here, true);
});

test("a hunt saved by the server is picked up again with its clock going on from where it stopped", () => {
  const { H } = fight();
  const saved = H.g.save(), at = H.S.now, round = H.S.round;
  const again = ghostHunt.create(T0);
  assert.equal(again.restore(saved, H.t.now + 30000), true);
  const S = again.debug.sim.state;
  assert.equal(S.now, at);
  assert.equal(S.round, round);
  assert.equal(S.epoch, H.t.now + 30000 - at, "thirty seconds down are not thirty seconds of hunt");
  assert.equal(ghostHunt.create(T0).save(), null, "an idle hunt saves nothing");
});
