// Ooga Chat's privacy boundary (#667): the server's own scope registry against every zone the game reports, the Room's
// side of the outdoor handshake (src/js/outdoor-voice.js on the page) run as the other Room checks run it, and the
// Audience's confirmation that nothing outdoor still holds a publication before the Room says `closed`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import "./cloudflare-host.mjs";

const protocol = await import("../src/protocol.js");
const { OUTDOOR_ZONES, scopeOf } = await import("../src/outdoor-policy.js");
const plain = (value) => JSON.parse(JSON.stringify(value));

test("the registry: only the named outdoor zones are public; every level, room, scene and unknown zone is excluded", () => {
  const body = (zone, extra = {}) => scopeOf({ body: "amy", zone, ...extra }, globalThis.BL.arcadeCabinets);
  assert.deepEqual(Object.entries(OUTDOOR_ZONES).map(([zone]) => [zone, body(zone).scope]),
    [["outside", "main"], ["between", "main"], ["sphere", "main"], ["rainforest", "main"], ["bifrost", "main"], ["dsb-outside", "dsb"]]);
  // Every zone of the island's world is either public by name or excluded: its levels and Merge Rock are not.
  const world = readFileSync(new URL("../../src/js/voice-blend.js", import.meta.url), "utf8").match(/const WORLD = (\[[^\]]+\])/)[1];
  for (const zone of JSON.parse(world.replace(/'/g, '"'))) {
    if (Object.hasOwn(OUTDOOR_ZONES, zone)) continue;
    assert.deepEqual(body(zone), { scope: null, reason: "interior" }, zone);
  }
  // Every DSB Land room, read from the scene itself, so a new one is checked as it lands.
  const dsb = readFileSync(new URL("../../src/js/scene-dsb.js", import.meta.url), "utf8").match(/const VOICE_ZONES=(\{[^}]+\})/)[1];
  const rooms = Object.values(JSON.parse(dsb));
  assert.ok(rooms.length >= 10);
  for (const zone of rooms) assert.equal(body(zone).scope, null, zone);
  for (const zone of ["sphere-0", "sphere-1", "sphere-9", "bifrost.chamber", "lab.hall", "factory.hall", "factory.hangar", "arcade.hall", "ghost-arena", "ember-den",
    "block-frenzy", "hq", "hq-basement", "rainforest-under", "repos", "none", "outside.room", "outsidex", "dsb", "dsb-outside.x", "", undefined])
    assert.equal(body(zone).scope, null, String(zone));
  assert.deepEqual(scopeOf({ body: null, zone: "outside" }), { scope: null, reason: "no-body" });
  assert.deepEqual(body("outside", { blendTo: "hq" }), { scope: null, reason: "descending" }, "on the way down a level, at any depth");
  const cabinet = globalThis.BL.arcadeCabinets.entries[0].id;
  assert.deepEqual(body("outside", { cabinet: { id: cabinet } }), { scope: null, reason: "cabinet" });
  assert.equal(body("outside", { cabinet: { id: `${cabinet}@out` } }).scope, "main", "the cave apron's cabinets are outdoors");
  assert.equal(body("outside", { body: "gorilla:amy" }).scope, "main", "a driven gorilla stands where it stands");
});

// The island Room, as the other Room checks run it, with an Audience whose answers the check controls.
const harness = async ({ features = "bridge,outdoor", saved = new Map() } = {}) => {
  const accepted = [];
  let ready = null;
  const sock = () => ({ sent: [], closed: null, store: null, send(t) { if (typeof t === "string") this.sent.push(JSON.parse(t)); }, close(code) { this.closed = { code }; },
    serializeAttachment(v) { this.store = JSON.parse(JSON.stringify(v)); }, deserializeAttachment() { return this.store; } });
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, sha256Hex: async () => "x", getPlayer: async () => null, sfuClient: () => null, deliverHighscores: async () => {},
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair: class { constructor() { this[0] = sock(); this[1] = sock(); } }, Response: class { constructor(b, i = {}) { this.status = i.status; } },
    WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView, Headers, Promise,
    ...(await import("../src/studio-policy.js")) };
  runInNewContext(source, context);
  const audience = { calls: [], pending: [], down: false, hold: null };
  const stub = {
    world: async (seq, speakers, active) => {
      audience.calls.push({ seq, speakers: plain(speakers), active: plain(active) });
      if (audience.hold) await audience.hold;
      if (audience.down) throw new Error("audience unreachable");
      return { ok: true, pending: audience.pending.slice(), listeners: { main: 3, dsb: 0 } };
    },
    watch: async () => {}, snapshot: async () => null,
  };
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { ready = fn(); }, acceptWebSocket: (ws) => accepted.push(ws), waitUntil() {},
    getWebSockets: () => accepted.filter((ws) => !ws.closed), storage: { get: async (k) => (Array.isArray(k) ? new Map() : saved.get(k)), put: async (k, v) => saved.set(k, v), getAlarm: async () => null, setAlarm: async () => {} } };
  const env = { OOGA_CHAT_FEATURES: features, AUDIENCE: { getByName: () => stub } };
  const h = { audience, accepted, ctx, env, context };
  h.room = new context.Room(ctx, env);
  await ready;
  h.room.sfu = { closeTracks: async (s, mids) => ({ tracks: mids.map((mid) => ({ mid })) }), getSession: async () => ({ tracks: [] }), newTracks: async () => ({ tracks: [] }) };
  h.join = async (id, login, zone = "outside") => {
    const before = accepted.length;
    await h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    const ws = accepted[before];
    h.room.players.get(id).voice = { pub: `pub${id}`, sub: `sub${id}`, track: "mic", gen: 1, mids: {}, pubMid: "0" };
    await h.send(ws, { t: "body", name: login });
    await h.send(ws, { t: "zone", name: zone });
    return ws;
  };
  h.send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg));
  h.outdoor = (ws, msg) => h.send(ws, { t: "outdoor", v: 1, ...msg });
  h.frames = (ws) => ws.sent.filter((m) => m.t === "outdoor").map(({ t, v, ...rest }) => rest);
  h.settle = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
  return h;
};

test("the Room admits a scope only where its own view agrees, and refuses everything else with a reason", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  assert.ok(a.sent.find((m) => m.t === "welcome").features.includes("outdoor-voice-v1"));
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "dsb" });
  assert.deepEqual(h.frames(a).at(-1), { op: "refused", epoch: 1, reason: "scope" }, "standing on the island is not DSB Land");
  await h.outdoor(a, { op: "enter", epoch: 2, scope: "main" });
  await h.settle();
  assert.deepEqual(h.frames(a).at(-1), { op: "open", epoch: 2, scope: "main", listeners: 0, sources: [] });
  assert.deepEqual(h.audience.calls.at(-1).speakers.map((s) => [s.id, s.zone, s.pub.session]), [["gh:1", "main", "pub1"]], "now an outdoor speaker, by reference");
  const b = await h.join(2, "b", "hq");
  await h.outdoor(b, { op: "enter", epoch: 1, scope: "main" });
  assert.deepEqual(h.frames(b).at(-1), { op: "refused", epoch: 1, reason: "interior" }, "a page that says it is outdoors in HQ is refused");
  await h.send(b, { t: "zone", name: "outside" });
  await h.send(b, { t: "body", name: null });
  await h.outdoor(b, { op: "enter", epoch: 2, scope: "main" });
  assert.deepEqual(h.frames(b).at(-1), { op: "refused", epoch: 2, reason: "no-body" });
  // Without the island's `outdoor` switch the handshake is not offered, and anything asked is refused.
  const off = await harness({ features: "bridge" });
  const c = await off.join(3, "a");
  assert.ok(!c.sent.find((m) => m.t === "welcome").features.includes("outdoor-voice-v1"));
  await off.outdoor(c, { op: "enter", epoch: 1, scope: "main" });
  assert.deepEqual(off.frames(c).at(-1), { op: "refused", epoch: 1, reason: "unavailable" });
});

test("the transition gap: a page that keeps saying `main` after its body went indoors is closed by the Room's own view", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  // The page never sends `leave` (the director's gap on #673/#676): its zone reaches the Room as the next scene's.
  await h.send(a, { t: "zone", name: "lab.hall" });
  await h.settle();
  assert.equal(h.room.players.get(1).outdoor.state, "none");
  assert.deepEqual(h.frames(a).at(-1), { op: "closed", epoch: 1, reason: "scope" }, "taken back unprompted");
  assert.deepEqual(h.audience.calls.at(-1).speakers, [], "out of the island's word before anything else");
  await h.outdoor(a, { op: "enter", epoch: 2, scope: "main" });
  assert.deepEqual(h.frames(a).at(-1), { op: "refused", epoch: 2, reason: "interior" }, "and asking again from inside is refused");
  // A crossing down a level, a release of the body and a hall cabinet each close a grant the same way.
  for (const [step, reason] of [[{ t: "blend", to: "hq", k: 3 }, "scope"], [{ t: "body", name: null }, "scope"]]) {
    const ws = await h.join(5, "b");
    await h.outdoor(ws, { op: "enter", epoch: 1, scope: "main" });
    await h.send(ws, step);
    await h.settle();
    assert.deepEqual(h.frames(ws).at(-1), { op: "closed", epoch: 1, reason }, JSON.stringify(step));
  }
});

test("`closed` waits until the Audience confirms every outdoor subscription is closed at the SFU; an outage leaves the page held", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  h.audience.pending = ["gh:1"];
  await h.outdoor(a, { op: "leave", epoch: 1, reason: "interior" });
  assert.equal(h.frames(a).at(-1).op, "open", "no `closed` while a listener's close is unconfirmed");
  assert.equal(h.room.players.get(1).outdoor.state, "closing");
  h.room.audienceConfirmed(["gh:2"]);
  assert.equal(h.frames(a).at(-1).op, "open", "another identity's confirmation is not this one");
  h.room.audienceConfirmed(["gh:1"]);
  assert.deepEqual(h.frames(a).at(-1), { op: "closed", epoch: 1, reason: "interior" });
  // The Audience unreachable: nothing confirmed, nothing said; the page's retry after it is back closes it.
  h.audience.pending = [];
  await h.outdoor(a, { op: "enter", epoch: 2, scope: "main" });
  h.audience.down = true;
  await h.outdoor(a, { op: "leave", epoch: 2, reason: "scene" });
  assert.equal(h.frames(a).at(-1).op, "open");
  h.audience.down = false;
  await h.outdoor(a, { op: "leave", epoch: 2, reason: "scene" });
  assert.deepEqual(h.frames(a).at(-1), { op: "closed", epoch: 2, reason: "scene" });
});

test("epochs: never opened after its leave, a stale leave closes only what is at or below it, frames in order", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  // `enter` then `leave` sent back to back: handled in order, so the grant never stands after its leave.
  h.audience.hold = new Promise((resolve) => setTimeout(resolve, 5));
  const first = h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  const second = h.outdoor(a, { op: "leave", epoch: 1, reason: "interior" });
  await Promise.all([first, second]);
  h.audience.hold = null;
  await h.settle();
  assert.deepEqual(h.frames(a).map((f) => f.op), ["open", "closed"]);
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  assert.equal(h.frames(a).length, 2, "an epoch given up never opens, however it is replayed");
  await h.outdoor(a, { op: "enter", epoch: 3, scope: "main" });
  await h.outdoor(a, { op: "leave", epoch: 2 });
  assert.deepEqual(h.frames(a).at(-1), { op: "closed", epoch: 2 }, "nothing at or below epoch 2 is held");
  assert.equal(h.room.players.get(1).outdoor.state, "open", "epoch 3's grant stands");
  await h.outdoor(a, { op: "enter", epoch: 3, scope: "main" });
  assert.equal(h.frames(a).filter((f) => f.op === "open").length, 2, "a repeated enter of the open epoch opens nothing new");
  for (const bad of [{ op: "enter", epoch: -1, scope: "main" }, { op: "enter", epoch: 4 }, { op: "enter", epoch: 4, scope: "hq" }, { op: "jump", epoch: 4 }])
    assert.equal(protocol.parseClientMessage(JSON.stringify({ t: "outdoor", v: 1, ...bad })), null, JSON.stringify(bad));
  assert.equal(protocol.parseClientMessage(JSON.stringify({ t: "outdoor", v: 2, op: "enter", epoch: 4, scope: "main" })), null);
});

test("a replaced connection's grants are taken back before the account's next welcome; a socket's close takes them back too", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  let release;
  h.audience.hold = new Promise((resolve) => { release = resolve; });
  const before = h.accepted.length;
  const joining = h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": "1", "x-player-login": "a", "x-player-contributor": "0" }) });
  await h.settle();
  const fresh = h.accepted[before];
  assert.equal(fresh.sent.some((m) => m.t === "welcome"), false, "no welcome while the old grant is still being taken back");
  assert.deepEqual(h.audience.calls.at(-1).speakers, [], "the old connection is already out of the island's word");
  release();
  h.audience.hold = null;
  await joining;
  assert.ok(fresh.sent.some((m) => m.t === "welcome"));
  assert.equal(h.room.players.get(1).outdoor, undefined, "the new connection starts with no grant");
});

test("an open grant hears its listeners and its Ooga Chat sources; a redeploy with the switch off takes grants back", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  h.room.audienceListeners({ main: 4, dsb: 0 });
  assert.deepEqual(h.frames(a).at(-1), { op: "audience", epoch: 1, listeners: 4, sources: [] });
  h.room.audienceSources([{ id: 777, zone: "main", session: "chat", track: "mic", gen: 2 }]);
  assert.deepEqual(h.frames(a).at(-1), { op: "audience", epoch: 1, listeners: 4, sources: [777] });
  // The island redeployed with OOGA_CHAT_FEATURES lacking `outdoor`: the attachment's grant is taken back on wake.
  const saved = { store: plain(a.store) };
  const woken = await harness({ features: "bridge" });
  const ws = { sent: [], closed: null, store: saved.store, readyState: 1, send(t) { this.sent.push(JSON.parse(t)); }, serializeAttachment(v) { this.store = plain(v); }, deserializeAttachment() { return this.store; } };
  woken.accepted.push(ws);
  woken.room = new woken.context.Room(woken.ctx, woken.env);
  await woken.settle();
  assert.equal(woken.room.players.get(1).outdoor.state, "none");
  assert.deepEqual(woken.frames(ws).at(-1), { op: "closed", epoch: 1, reason: "unavailable" });
});

test("overhearing: a player not in voice hears the main island's public speakers and Ooga Chat's only while their own grant is open there, never a place, and is in nobody's voice", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  const b = await h.join(2, "b");
  const plan = () => [...(h.room.voicePlan().get(2) || [])];
  // b's page opened a receive session by itself: no microphone, not muted, marked passive.
  const listener = h.room.players.get(2);
  listener.voice = { pub: null, sub: "sub2", track: null, passive: true, gen: 0, mids: {}, pubMid: null };
  assert.deepEqual(plan(), [], "standing beside a speaker is not hearing them: no grant is open");
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  assert.deepEqual(plan(), [], "the listener's own grant is not open yet");
  await h.outdoor(b, { op: "enter", epoch: 1, scope: "main" });
  assert.deepEqual(plan(), [1], "the island speaker who is public there");
  h.room.audienceSources([{ id: 777, zone: "main", session: "chat", track: "mic", gen: 2 }, { id: 888, zone: "dsb", session: "chat2", track: "mic", gen: 2 }]);
  assert.deepEqual(plan(), [1, 777], "and Ooga Chat's speakers of that zone");
  assert.equal(h.context.inVoice(listener), false, "no roster mark");
  assert.equal(h.audience.calls.at(-1).active.includes("gh:2"), false, "and never the island's voice to Ooga Chat, so a lease elsewhere stands");
  assert.deepEqual([...h.room.voicePlan().get(1)], [777], "the speaker does not hear the listener, who publishes nothing");
  // The speaker goes indoors: their grant is taken back, and the listener no longer hears them.
  await h.send(a, { t: "zone", name: "hq" });
  await h.settle();
  assert.deepEqual(plan(), [777]);
  // The listener goes indoors too: nothing public is heard there, and no place either.
  await h.send(b, { t: "zone", name: "hq" });
  await h.settle();
  assert.deepEqual(plan(), [], "indoors an overhearing session hears nobody, the speaker in the same room included");
  // A session of the visitor's own (a returning listener's) hears its place, as ever.
  listener.voice.passive = false;
  assert.deepEqual(plan(), [1]);
});

test("voice on another device: an island page hears when its account speaks from Ooga Chat, at its welcome too, and gives its own voice up when Ooga Chat takes it", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  const b = await h.join(2, "b");
  h.room.audienceSources([{ id: 2, zone: "main", session: "chat", track: "mic", gen: 2 }]);
  assert.deepEqual(b.sent.filter((m) => m.t === "voice-elsewhere").map((m) => m.on), [true]);
  assert.equal(a.sent.some((m) => m.t === "voice-elsewhere"), false, "only the account's own page");
  // The account's next page is told in its welcome, before its voice could come back by itself.
  const again = await h.join(2, "b");
  assert.equal(again.sent.find((m) => m.t === "welcome").voiceElsewhere, true);
  assert.equal(a.sent.find((m) => m.t === "welcome").voiceElsewhere, undefined);
  h.room.audienceSources([]);
  assert.deepEqual(again.sent.filter((m) => m.t === "voice-elsewhere").map((m) => m.on), [false]);
  // Ooga Chat takes a's voice on the visitor's word: the island's page leaves voice, everyone sees the mark go, and the
  // Audience has the island's word without the account before the answer.
  const calls = h.audience.calls.length;
  assert.deepEqual(plain(await h.room.audienceHandoff(1)), { ok: true });
  const p = h.room.players.get(1);
  assert.deepEqual([p.voice.pub, p.voice.sub, p.voice.track, h.context.inVoice(p)], [null, null, null, false]);
  assert.equal(a.sent.filter((m) => m.t === "voice-moved").length, 1);
  assert.deepEqual(plain(again.sent.filter((m) => m.t === "vstate" && m.id === 1).at(-1)), { t: "vstate", id: 1, voice: false, muted: false });
  assert.ok(h.audience.calls.length > calls && !h.audience.calls.at(-1).active.includes("gh:1"));
  // Nobody of that account on the island: still answered from the island's word.
  assert.deepEqual(plain(await h.room.audienceHandoff(99)), { ok: true });
});

// The Audience's side: confirmation after the SFU closes, with a fake SFU that can refuse.
const NodeResponse = globalThis.Response;
globalThis.Response = class extends NodeResponse {
  constructor(body, init = {}) { if (init && init.status === 101) { super(null, { status: 200 }); Object.defineProperty(this, "status", { value: 101 }); this.webSocket = init.webSocket; } else super(body, init); }
};
const fakeSocket = () => ({ sent: [], readyState: 1, attachment: null, send(t) { this.sent.push(JSON.parse(t)); }, close(code) { this.readyState = 3; this.closed = { code }; },
  serializeAttachment(v) { this.attachment = v === null ? null : structuredClone(v); }, deserializeAttachment() { return this.attachment; } });
globalThis.WebSocketPair = class { constructor() { this[0] = fakeSocket(); this[1] = fakeSocket(); } };
globalThis.WebSocketRequestResponsePair = class {};
const sfu = { failClose: false, tracks: new Map() };
let next = 0;
globalThis.fetch = async (input, init = {}) => {
  const rest = new URL(typeof input === "string" ? input : input.url).pathname.split("/").slice(4).join("/");
  const body = init.body ? JSON.parse(init.body) : null;
  const reply = (data, status = 200) => new NodeResponse(JSON.stringify(data), { status });
  if (rest === "sessions/new") return reply({ sessionId: `s${++next}` });
  const [, session, what, verb] = rest.split("/");
  if (what === "tracks" && verb === "new") return reply({ tracks: body.tracks.map((t) => { const mid = `m${++next}`; sfu.tracks.set(`${session}/${mid}`, "active"); return { mid, sessionId: t.sessionId, trackName: t.trackName }; }), sessionDescription: { type: "offer", sdp: "v=0" } });
  if (what === "tracks" && verb === "close") {
    if (sfu.failClose) return reply({ errorCode: "busy" }, 500);
    return reply({ tracks: body.tracks.map(({ mid }) => { sfu.tracks.set(`${session}/${mid}`, "inactive"); return { mid }; }) });
  }
  return reply({ tracks: [] });
};
const { Audience } = await import("../src/audience.js");

test("the Audience names the speakers still held outdoors until the SFU confirms, then tells the Room; the kill switch drops island pulls", async () => {
  const storage = new Map(), sockets = [], tasks = [], room = { confirmed: [], listeners: [] };
  let alarm = null;
  const ctx = { id: { name: "audience" }, setWebSocketAutoResponse() {}, waitUntil: (t) => tasks.push(t), blockConcurrencyWhile(fn) { this.ready = fn(); },
    acceptWebSocket: (ws) => sockets.push(ws), getWebSockets: () => sockets.filter((ws) => ws.readyState <= 1),
    storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); }, delete: async (k) => storage.delete(k),
      list: async ({ prefix }) => new Map([...storage].filter(([k]) => k.startsWith(prefix))), getAlarm: async () => alarm, setAlarm: async (at) => { alarm = at; } } };
  const env = (features) => ({ REALTIME_APP_ID: "app", REALTIME_SECRET: "s", OOGA_CHAT_FEATURES: features,
    ROOM: { getByName: () => ({ audienceConfirmed: async (ids) => room.confirmed.push(...ids), audienceListeners: async (c) => room.listeners.push(c), audienceDelta: async () => {}, audienceSources: async () => {} }) } });
  const make = async (features = "bridge,outdoor") => { const a = new Audience(ctx, env(features)); await ctx.ready; return a; };
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  const a = await make();
  const who = { principal: `pr_${"a".repeat(22)}`, provider: "x", providerUserId: "9", login: "xan", display: "X", avatar: null, eligible: false, sessionExpiresAt: Date.now() + 3600000 };
  await a.fetch(new Request("https://a/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(who) } }));
  const ws = [...a.sockets.values()][0];
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", zone: "main", protocol: 1 }));
  await settle();
  assert.deepEqual(room.listeners.at(-1), { main: 1, dsb: 0 }, "the Room hears that Main Island has a listener");
  const connection = ws.sent.find((m) => m.type === "snapshot").connection;
  const call = (op) => a.fetch(new Request(`https://a/media/${op}`, { method: "POST", headers: { "x-audience-principal": JSON.stringify(who) }, body: JSON.stringify({ connection }) }));
  await a.world(1, [{ id: "gh:1", zone: "main", mic: "on", login: "isle", pub: { session: "island", track: "mic", gen: 1 } }], []);
  await call("receive/open");
  await call("receive/sync");
  sfu.failClose = true;
  const held = await a.world(2, [], ["gh:1"]);
  assert.deepEqual(held.pending, ["gh:1"], "the SFU has not confirmed: the island's `closed` must wait");
  assert.deepEqual(held.listeners, { main: 1, dsb: 0 });
  sfu.failClose = false;
  await a.alarm();
  await settle();
  assert.deepEqual(room.confirmed, ["gh:1"], "confirmed once the retried close succeeds");
  const clear = await a.world(3, [], []);
  assert.deepEqual(clear.pending, []);
  // The switch off: whatever the Room sends, no island publication is listed or pullable.
  const off = await make("bridge");
  const told = await off.world(10, [{ id: "gh:5", zone: "main", mic: "on", login: "isle", pub: { session: "island2", track: "mic", gen: 1 } }], []);
  assert.equal(told.ok, true);
  assert.equal(off.model.zones.main.rows.has("gh:5"), false);
  assert.equal(off.media.authorizedFor(off.model.conns.get(connection)).size, 0);
});

test("a grant the Room takes back while the Audience is unreachable is told again from the Room's alarm until it lands", async () => {
  const h = await harness();
  const a = await h.join(1, "a");
  await h.outdoor(a, { op: "enter", epoch: 1, scope: "main" });
  h.audience.down = true;
  await h.send(a, { t: "zone", name: "lab.hall" });
  await h.settle();
  const room = h.room;
  assert.equal(room.players.get(1).outdoor.state, "closing", "held: the Audience was never told");
  assert.ok(room.audienceRetry && Number.isFinite(room.audienceRetry.at), "a retry is scheduled");
  assert.ok(room.nextAlarm() <= room.audienceRetry.at, "and the alarm wakes for it");
  const calls = h.audience.calls.length;
  h.audience.down = false;
  room.audienceRetry.at = 0;
  room.sweepAt = Date.now() + 3600000;
  await room.alarm();
  await h.settle();
  assert.ok(h.audience.calls.length > calls, "told again by the Room itself, with no `leave` from the page");
  assert.deepEqual(h.audience.calls.at(-1).speakers, []);
  assert.deepEqual(h.frames(a).at(-1), { op: "closed", epoch: 1, reason: "scope" });
  assert.equal(room.audienceRetry, null);
});

test("a retirement finished by a later close, not the alarm, is still confirmed to the Room", async () => {
  const storage = new Map(), sockets = [], tasks = [], room = { confirmed: [] };
  const ctx = { id: { name: "audience" }, setWebSocketAutoResponse() {}, waitUntil: (t) => tasks.push(t), blockConcurrencyWhile(fn) { this.ready = fn(); },
    acceptWebSocket: (ws) => sockets.push(ws), getWebSockets: () => sockets.filter((ws) => ws.readyState <= 1),
    storage: { get: async (k) => structuredClone(storage.get(k)), put: async (k, v) => { storage.set(k, structuredClone(v)); }, delete: async (k) => storage.delete(k),
      list: async ({ prefix }) => new Map([...storage].filter(([k]) => k.startsWith(prefix))), getAlarm: async () => null, setAlarm: async () => {} } };
  const env = { REALTIME_APP_ID: "app", REALTIME_SECRET: "s", OOGA_CHAT_FEATURES: "bridge,outdoor",
    ROOM: { getByName: () => ({ audienceConfirmed: async (ids) => room.confirmed.push(...ids), audienceListeners: async () => {}, audienceDelta: async () => {}, audienceSources: async () => {} }) } };
  const a = new Audience(ctx, env);
  await ctx.ready;
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  const who = { principal: `pr_${"b".repeat(22)}`, provider: "x", providerUserId: "8", login: "lis", display: "L", avatar: null, eligible: false, sessionExpiresAt: Date.now() + 3600000 };
  await a.fetch(new Request("https://a/connect", { headers: { upgrade: "websocket", "x-audience-principal": JSON.stringify(who) } }));
  const ws = [...a.sockets.values()][0];
  await a.webSocketMessage(ws, JSON.stringify({ type: "join", zone: "main", protocol: 1 }));
  const connection = ws.sent.find((m) => m.type === "snapshot").connection;
  const call = (op) => a.fetch(new Request(`https://a/media/${op}`, { method: "POST", headers: { "x-audience-principal": JSON.stringify(who) }, body: JSON.stringify({ connection }) }));
  const speaker = (n) => ({ id: `gh:${n}`, zone: "main", mic: "on", login: `isle${n}`, pub: { session: `island${n}`, track: "mic", gen: 1 } });
  await a.world(100, [speaker(1), speaker(2)], []);
  await call("receive/open");
  await call("receive/sync");
  sfu.failClose = true;
  assert.deepEqual((await a.world(101, [speaker(2)], ["gh:1"])).pending, ["gh:1"], "gh:1's close failed: still held");
  sfu.failClose = false;
  // gh:2 leaves too: its close merges into the same subscriber's job, whose run now closes gh:1's pull as well.
  const answer = await a.world(102, [], ["gh:1", "gh:2"]);
  await settle();
  assert.deepEqual(answer.pending, []);
  assert.ok(room.confirmed.includes("gh:1"), "gh:1's retirement, finished by that run, is confirmed without waiting for an alarm");
});
