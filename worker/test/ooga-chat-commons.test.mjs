// The Commons and Online Oogas for Ooga Chat's contributors (#670): community members on the island's real Room (run as
// the other Room checks run it), the bridge's gate, and the edge's socket route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { memoryD1 } from "./cloudflare-host.mjs";

const NodeResponse = globalThis.Response;
globalThis.Response = class extends NodeResponse {
  constructor(body, init = {}) { if (init && init.status === 101) { super(null, { status: 200 }); Object.defineProperty(this, "status", { value: 101 }); this.webSocket = init.webSocket; } else super(body, init); }
};
const sock = () => ({ sent: [], closed: null, store: null, readyState: 1, send(t) { if (typeof t === "string") this.sent.push(JSON.parse(t)); },
  close(code, reason) { this.closed = { code, reason }; this.readyState = 3; }, accept() {},
  serializeAttachment(v) { this.store = v === null ? null : JSON.parse(JSON.stringify(v)); }, deserializeAttachment() { return this.store; } });
globalThis.WebSocketPair = class { constructor() { this[0] = sock(); this[1] = sock(); } };

const protocol = await import("../src/protocol.js");
const { commonsFetch } = await import("../src/chat-bridge.js");
const { BRIDGE_VERSION } = await import("../src/chat-bridge-protocol.js");
const { CHAT_BURST, CHAT_HZ, MAX_PLAYERS } = protocol;

const harness = async ({ features = "bridge,commons,commons-send,cloud", accepted = [], start = 1_800_000_000_000 } = {}) => {
  let ready = null, now = start;
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, sha256Hex: async (t) => `h${t.length}:${t}`, getPlayer: async () => null, sfuClient: () => null, deliverHighscores: async () => {},
    CAST_ROWS: [{ handle: "amy", github_login: "amy" }, { handle: "bc1gui", github_login: "ottoz0r" }], DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair: globalThis.WebSocketPair, Response: class { constructor(b, i = {}) { this.status = i.status; } }, WebSocketRequestResponsePair: class {},
    URL, crypto, Date: Clock, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView, Headers, Promise, ...(await import("../src/studio-policy.js")) };
  runInNewContext(source, context);
  const ctx = { setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { ready = fn(); }, acceptWebSocket: (ws) => accepted.push(ws), waitUntil() {},
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (k) => (Array.isArray(k) ? new Map() : undefined), put: async () => {}, getAlarm: async () => null, setAlarm: async () => {} } };
  const env = { OOGA_CHAT_FEATURES: features, AUDIENCE: { getByName: () => ({ world: async () => ({ ok: true, pending: [] }), watch: async () => {} }) } };
  const room = new context.Room(ctx, env);
  await ready;
  const h = { room, accepted, ctx, env, context, advance: (ms) => { now += ms; } };
  h.player = async (id, login) => {
    const before = accepted.length;
    await room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  h.member = async (id, login, extra = {}) => {
    const before = accepted.length;
    const res = await room.fetch(new Request("https://room.invalid/community", { headers: { upgrade: "websocket",
      "x-community-member": JSON.stringify({ principal: `pr_${String(id).padStart(22, "a")}`, provider: "github", providerUserId: String(id), login, display: login.toUpperCase(),
        eligible: true, sessionExpiresAt: now + 7_200_000, ...extra }) } }));
    return { res, ws: accepted[before] };
  };
  h.send = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));
  return h;
};
const lines = (ws) => ws.sent.filter((m) => m.t === "chat");

test("duel listening receives active pairs on join and only sanitized start/end updates", async () => {
  const h = await harness(), { duel } = await import("../src/duel.js");
  await h.player(1, "amy"); await h.player(2, "ottoz0r");
  const { ws: before } = await h.member(3, "cy");
  duel.start(h.room, h.room.players.get(1), h.room.players.get(2), Date.now());
  const d = [...h.room.duels.values()][0];
  assert.deepEqual(before.sent.filter((m) => m.t === "duel"), [{ t: "duel", op: "start", id: d.id, a: 1, b: 2 }]);
  const { ws: after } = await h.member(4, "dee");
  assert.deepEqual(after.sent[0].duels, [{ id: d.id, a: 1, b: 2 }]);
  for (const op of ["hp", "challenged", "challenging", "refused", "list"]) h.room.broadcast({ t: "duel", op, id: d.id, x: 12, hp: [50, 40] });
  assert.equal(before.sent.filter((m) => m.t === "duel").length, 1);
  assert.equal(after.sent.filter((m) => m.t === "duel").length, 0);
  duel.finish(h.room, d, 1, "forfeit");
  for (const ws of [before, after]) assert.deepEqual(ws.sent.filter((m) => m.t === "duel").at(-1), { t: "duel", op: "end", id: d.id });
  assert.deepEqual((await h.member(5, "eve")).ws.sent[0].duels, []);
});

test("a member joins without a player slot, sees presence without positions, and The Commons' own history", async () => {
  const h = await harness();
  const isle = await h.player(1, "amy");
  await h.send(isle, { t: "body", name: "amy" });
  await h.send(isle, { t: "zone", name: "outside" });
  await h.send(isle, { t: "pose", x: 12.5, y: 0, z: -3, yaw: 1 });
  await h.send(isle, { t: "chat", text: "first", clientId: "c1" });
  const { res, ws } = await h.member(2, "bea");
  assert.equal(res.status, 101);
  assert.equal(h.room.players.size, 1, "no player slot: Online Oogas counts the island's players, not Ooga Chat's sockets");
  const welcome = ws.sent[0];
  assert.deepEqual({ t: welcome.t, op: welcome.op, epoch: welcome.epoch, send: welcome.send, you: welcome.you },
    { t: "community", op: "welcome", epoch: 1_800_000_000_000, send: true, you: { id: 2, login: "bea", display: "BEA" } });
  assert.deepEqual(welcome.players, [{ id: 1, login: "amy", display: "amy", body: "amy", zone: "outside", voice: false, muted: false, hand: false, handTone: 0, handEmoji: "" }]);
  assert.ok(!JSON.stringify(welcome).includes("12.5"), "never a position");
  assert.deepEqual(ws.sent[1].messages.map((m) => m.text), ["first"], "the island's one conversation, as it stands");
  // A curated alias's spelling is no contributor's Ooga: refused before any socket.
  const before = h.accepted.length;
  assert.equal((await h.member(3, "bc1gui")).res.status, 403);
  assert.equal(h.accepted.length, before);
  assert.equal((await h.room.fetch(new Request("https://room.invalid/community", { headers: { upgrade: "websocket", "x-community-member": JSON.stringify({ provider: "x" }) } }))).status, 403);
});

test("one conversation: each line once in both apps with the same id and order; retries ack, conflicts refuse; one bucket an account", async () => {
  const h = await harness();
  const isle = await h.player(1, "amy");
  const { ws: app } = await h.member(1, "amy");
  const { ws: other } = await h.member(2, "bea");
  await h.send(app, { t: "chat", text: "from ooga chat", clientId: "a1" });
  await h.send(isle, { t: "chat", text: "from the island", clientId: "i1" });
  const want = [["amy", "from ooga chat"], ["amy", "from the island"]];
  for (const ws of [isle, app, other]) assert.deepEqual(lines(ws).map((l) => [l.login, l.text]), want, "the same lines, once, in order");
  assert.deepEqual(lines(isle).map((l) => l.id), lines(other).map((l) => l.id), "the same ids");
  assert.ok(app.sent.some((m) => m.t === "chat-ack" && m.clientId === "a1"));
  await h.send(app, { t: "chat", text: "from ooga chat", clientId: "a1" });
  assert.equal(lines(other).length, 2, "a retried line is acknowledged, never appended again");
  await h.send(app, { t: "chat", text: "something else", clientId: "a1" });
  assert.deepEqual(app.sent.filter((m) => m.t === "chat-rejected").at(-1), { t: "chat-rejected", clientId: "a1", reason: "conflict" }, "a conflicting reuse is refused; the page keeps its draft");
  // The account's bucket is shared by its island tab and its Ooga Chat tab: opening another app never doubles the rate.
  h.advance(CHAT_BURST * 1000 / CHAT_HZ);
  for (let i = 0; i < CHAT_BURST + 2; i++) await h.send(i % 2 ? isle : app, { t: "chat", text: `burst ${i}`, clientId: `b${i}` });
  assert.equal(lines(other).length - 2, CHAT_BURST, "the burst across both apps is one account's");
});

test("presence relays without positions; a member sends nothing but lines; the island's world stays the island's", async () => {
  const h = await harness();
  const { ws: app } = await h.member(2, "bea");
  const isle = await h.player(1, "amy");
  await h.send(isle, { t: "body", name: "amy" });
  await h.send(isle, { t: "zone", name: "dsb-outside" });
  await h.send(isle, { t: "hand", on: true, tone: 1, e: "" });
  await h.send(isle, { t: "pose", x: 1, y: 2, z: 3, yaw: 0 });
  h.room.snapshot();
  const kinds = app.sent.map((m) => m.t);
  assert.ok(kinds.includes("join") && kinds.includes("body") && kinds.includes("zone") && kinds.includes("hand"));
  assert.ok(!kinds.includes("state"), "no pose snapshot ever reaches a member");
  assert.deepEqual(Object.keys(app.sent.find((m) => m.t === "join").p).sort(), ["body", "display", "hand", "handEmoji", "handTone", "id", "login", "muted", "voice", "zone"]);
  // A member's world actions are ignored: no body, no reaction, no private conversation (a voice link is its own check).
  for (const msg of [{ t: "body", name: "bea" }, { t: "react", e: "🔥" }, { t: "pm", op: "invite", to: 1 }, { t: "zone", name: "outside" }])
    await h.send(app, msg);
  assert.equal(h.room.players.size, 1);
  assert.equal(isle.sent.filter((m) => m.t === "react" || m.t === "pm" || m.t === "links" && m.wants && m.wants.length).length, 0);
  h.room.audienceClouds([{ id: "gh:2", character: "bea", zone: "main", seat: "main-cloud-1" }]);
  assert.deepEqual(app.sent.filter((m) => m.t === "clouds").at(-1).clouds.map((c) => c.id), ["gh:2"], "cloud speakers are in Online Oogas too");
  await h.room.webSocketMessage(app, "not json");
  assert.equal(app.closed.code, 4400);
});

test("a voice link shows and holds in both apps: a member sees its account's links, asks from Ooga Chat, and hears asks made on the island", async () => {
  const h = await harness();
  const isle = await h.player(1, "amy"), mine = await h.player(2, "ottoz0r");
  const { ws: app } = await h.member(2, "ottoz0r");
  assert.deepEqual(app.sent.find((m) => m.op === "welcome").links, { wants: [], linked: [] }, "the welcome carries the account's links");
  const links = (ws) => ws.sent.filter((m) => m.t === "links").at(-1);
  // Asked on the island: the account's Ooga Chat member hears it too.
  await h.send(mine, { t: "link", to: 1, on: true });
  assert.deepEqual(links(app), { t: "links", wants: [1], linked: [] }, "the island's ask, without its words to the asker");
  // Asked back from the other side: both of the account's sockets read it linked.
  await h.send(isle, { t: "link", to: 2, on: true });
  assert.deepEqual(links(app).linked, [1]);
  assert.deepEqual(links(mine).linked, [1]);
  // Taken back from Ooga Chat: the same ask the island keeps, so the island player and amy hear the link broken.
  await h.send(app, { t: "link", to: 1, on: false });
  assert.deepEqual(links(app).wants, []);
  assert.deepEqual(links(mine).wants, [], "the island page of the same account follows");
  assert.deepEqual(links(isle), { t: "links", wants: [2], linked: [], app: [] }, "amy's ask still stands, theirs to cancel");
  // A member can only ask an island player, as the island can.
  await h.send(app, { t: "link", to: 99, on: true });
  assert.deepEqual(links(app).wants, []);
});

test("access ends: signing out or losing eligibility closes the account's members; the sweep's deadline closes them too", async () => {
  const h = await harness();
  const { ws: one } = await h.member(2, "bea");
  const { ws: two } = await h.member(2, "bea");
  const { ws: keep } = await h.member(3, "cyd");
  assert.deepEqual(h.room.communityRevoke(2, "logout"), { revoked: 2 });
  assert.deepEqual([one.closed.code, two.closed.code, keep.closed], [4401, 4401, null]);
  await h.send(one, { t: "chat", text: "after", clientId: "z" });
  assert.equal(lines(keep).length, 0, "a closed member speaks no more");
  h.advance(2 * 3600 * 1000);
  h.room.sweepAt = 0;
  await h.room.alarm();
  assert.equal(keep.closed.code, 4401, "re-authenticated hourly, so a lost notification cannot keep access");
  // A member silent past STALE_MS goes as a player would; one that spoke lately stays.
  const { ws: quiet } = await h.member(5, "eve");
  const { ws: talker } = await h.member(6, "fay");
  h.advance(protocol.STALE_MS - 1000);
  await h.send(talker, { t: "chat", text: "still here", clientId: "s1" });
  h.advance(2000);
  h.room.sweepAt = 0;
  await h.room.alarm();
  assert.deepEqual([quiet.closed && quiet.closed.code, talker.closed], [4000, null], "a dead socket holds no member slot");
  // Per account and in all, members are bounded.
  const a = await h.member(4, "dee"), b = await h.member(4, "dee"), c = await h.member(4, "dee"), d = await h.member(4, "dee");
  assert.equal([a, b, c].every((m) => m.ws.closed === null), true);
  assert.equal(d.ws.closed.code, 4429);
  // At the limit, the account's own pages that went away without closing make room at once, not at the next sweep:
  // one silent past SILENT_MS goes, one heard from lately stays.
  const { SILENT_MS } = await import("../src/room-commons.js");
  h.advance(SILENT_MS - 1000);
  await h.send(b.ws, { t: "chat", text: "still here", clientId: "b1" });
  h.advance(2000);
  const e = await h.member(4, "dee");
  assert.deepEqual([a.ws.closed && a.ws.closed.code, b.ws.closed, c.ws.closed && c.ws.closed.code, e.ws.closed], [4000, null, 4000, null],
    "a page back after a phone slept gets in, its dead sockets gone");
});

test("with only members here the sweep runs every four minutes, and a player arriving brings it back to one a minute", async () => {
  const start = 1_800_000_000_000, h = await harness({ start });
  await h.member(2, "bea");
  h.room.sweepAt = 0;
  await h.room.alarm();
  assert.equal(h.room.sweepAt, start + protocol.MEMBER_SWEEP_MS, "an idle Ooga Chat tab wakes the room every four minutes, not every minute");
  const { STALE_MS, RECENT_MS } = await import("../src/inspector-logic.js");
  assert.ok(protocol.MEMBER_SWEEP_MS < Math.min(STALE_MS, RECENT_MS), "the room's report, riding its sweep, stays inside the Inspector's windows");
  await h.player(1, "amy");
  assert.equal(h.room.sweepAt, start + protocol.SWEEP_MS, "a player arriving pulls the next sweep in");
  h.room.sweepAt = 0;
  await h.room.alarm();
  assert.equal(h.room.sweepAt, start + protocol.SWEEP_MS, "and keeps it at a minute while a player is here");
});

test("a woken Room keeps its members as members, never as players", async () => {
  const accepted = [];
  const first = await harness({ accepted });
  const { ws } = await first.member(2, "bea");
  const woken = await harness({ accepted, start: 1_800_000_600_000 });
  assert.equal(woken.room.players.size, 0);
  assert.equal(woken.room.community.size, 1);
  // A new connection after the wake hears a new epoch: the lines it may have missed are gone, not quiet.
  const { ws: fresh } = await woken.member(3, "cyd");
  assert.deepEqual([ws.sent[0].epoch, fresh.sent[0].epoch], [1_800_000_000_000, 1_800_000_600_000]);
  const isle = await woken.player(1, "amy");
  await woken.send(ws, { t: "chat", text: "still here", clientId: "w1" });
  assert.deepEqual(lines(isle).map((l) => [l.login, l.text]), [["bea", "still here"]]);
});

test("after a wake, an account at its limit still makes room from its own silent sockets", async () => {
  // With only members here the Room hibernates between frames: the page coming back is what wakes it, and its dead
  // sockets must not look heard from at that wake.
  const { SILENT_MS } = await import("../src/room-commons.js");
  const accepted = [], start = 1_800_000_000_000;
  const first = await harness({ accepted, start });
  const pages = [await first.member(4, "dee"), await first.member(4, "dee"), await first.member(4, "dee")];
  const woken = await harness({ accepted, start: start + SILENT_MS + 5000 });
  const back = await woken.member(4, "dee");
  assert.equal(back.ws.closed, null, "the page back after a phone slept gets in");
  assert.ok(pages.every((p) => p.ws.closed && p.ws.closed.code === 4000), "its silent sockets went");
});

test("rolled out reading first: without `commons-send` a member reads the conversation and its lines are refused, draft kept", async () => {
  const h = await harness({ features: "bridge,commons,cloud" });
  const isle = await h.player(1, "amy");
  const { ws } = await h.member(2, "bea");
  assert.equal(ws.sent[0].send, false);
  await h.send(ws, { t: "chat", text: "hello", clientId: "r1" });
  assert.deepEqual(ws.sent.at(-1), { t: "chat-rejected", clientId: "r1", reason: "read_only" });
  assert.equal(lines(isle).length, 0);
  await h.send(isle, { t: "chat", text: "from the island", clientId: "i1" });
  assert.deepEqual(lines(ws).map((l) => l.text), ["from the island"]);
});

test("the bridge lets only an eligible GitHub principal through, with the island's `commons` switch, as a member", async () => {
  const reached = [];
  const env = { ENVIRONMENT: "staging", OOGA_CHAT_FEATURES: "bridge,commons", ROOM: { getByName: () => ({ fetch: async (r) => { reached.push(r); return new Response("ok"); } }) } };
  const assertion = { v: BRIDGE_VERSION, env: "staging", principal: { id: "pr_x", provider: "github", providerUserId: "2", login: "bea", display: "Bea" }, eligible: true, sessionExpiresAt: Date.now() + 1000 };
  const ask = (a, e = env) => commonsFetch(e, new Request("https://b/commons", { headers: { upgrade: "websocket", cookie: "x=1", "x-ooga-chat-assertion": JSON.stringify(a) } }));
  assert.equal((await ask(assertion)).status, 200);
  assert.deepEqual([...reached.at(-1).headers.keys()].sort(), ["upgrade", "x-community-member"]);
  assert.equal(new URL(reached.at(-1).url).pathname, "/community");
  assert.equal((await ask({ ...assertion, eligible: false })).status, 403);
  assert.equal((await ask({ ...assertion, principal: { ...assertion.principal, provider: "x" } })).status, 403);
  assert.equal((await ask({ ...assertion, env: "production" })).status, 403);
  assert.equal((await ask(assertion, { ...env, OOGA_CHAT_FEATURES: "bridge" })).status, 503);
  // The public `/room` never reaches a member's path: the Worker forwards only that one path.
  const room = await harness();
  const res = await room.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-community-member": JSON.stringify({ provider: "github" }) }) });
  assert.equal(res.status, 403, "the island's /room still needs a vouched player");
});

test("the edge's Commons socket: X, a non-contributor or a stale answer never get one; a contributor goes through the bridge", async () => {
  const { route } = await import("../chat/src/index.js");
  const { forgetHello } = await import("../chat/src/bridge.js");
  const { createSession, upsertPrincipal } = await import("../chat/src/session.js");
  forgetHello();
  const reached = [];
  const answers = { "1": "eligible", "2": "ineligible" };
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: "https://chat.example", DB: memoryD1(new URL("../chat/migrations/", import.meta.url)), FEATURES: "github,x,commons",
    GITHUB_CLIENT_ID: "i", GITHUB_CLIENT_SECRET: "s", X_CLIENT_ID: "i", X_CLIENT_SECRET: "s", ASSETS: { fetch: async () => new Response("app") },
    OBL: { call: async (e) => e.op === "hello" ? { ok: true, requestId: e.requestId, result: { version: BRIDGE_VERSION, environment: "staging", features: { bridge: true, commons: true }, voice: true } }
      : e.op === "capability" ? { ok: true, requestId: e.requestId, result: { state: answers[e.principal.providerUserId], character: null, policy: "p", checkedAt: Date.now() } } : { ok: false, error: { code: "unknown_operation" } },
    fetch: async (r) => { reached.push(r); return new Response("bridged"); } } };
  const tokenFor = async (provider, id, login) => createSession(env.DB, (await upsertPrincipal(env.DB, { provider, providerUserId: id, login, display: login, avatarUrl: null })).id, "t");
  const ask = async (token, e = env) => route(new Request("https://chat.example/api/chat/commons", { headers: { upgrade: "websocket", origin: "https://chat.example",
    ...(token ? { cookie: `__Host-ooga_chat_session=${token}` } : {}) } }), e, { fetch, waitUntil: null, cache: null });
  for (const token of [null, await tokenFor("x", "99", "xan"), await tokenFor("github", "2", "nope")]) {
    const res = await ask(token);
    assert.equal(res.status, 101);
  }
  assert.equal(reached.length, 0, "signed out, X and a non-contributor: nothing reaches the island");
  const contributor = await tokenFor("github", "1", "amy");
  assert.equal(await (await ask(contributor)).text(), "bridged");
  assert.equal(JSON.parse(reached[0].headers.get("x-ooga-chat-assertion")).eligible, true);
  assert.equal(new URL(reached[0].url).pathname, "/commons");
  const off = await ask(contributor, { ...env, FEATURES: "github" });
  assert.equal(off.status, 101);
  assert.equal(reached.length, 1, "the Commons off: nothing reaches the island");
});

test("the bridge's `display`: an eligible contributor's Commons name becomes the island's display name, by the island's rules", async () => {
  const { displayOps } = await import("../src/chat-display.js");
  const { getPlayer } = await import("../src/db.js");
  const db = memoryD1(new URL("../migrations/", import.meta.url));
  const contributorFor = Object.assign(async (login) => login === "amy" ? { handle: "amy" } : null, { fresh: () => true });
  const op = displayOps({ contributorFor }).display;
  const env = { OOGA_CHAT_FEATURES: "bridge,commons", DB: db };
  const principal = (id, login, provider = "github") => ({ id: "pr_x", provider, providerUserId: String(id), login });
  const run = (payload, p = principal(1, "amy"), e = env) => op.run(e, { payload, principal: p });
  const refused = (code) => (error) => error.code === code;
  // An account the island has never seen gets its row, as a first island sign-in would make it, and the name.
  assert.deepEqual(await run({ display: "  Amy   the Great  " }), { display: "Amy the Great" });
  assert.equal((await getPlayer(db, 1)).display, "Amy the Great");
  assert.deepEqual(await run({ display: "Amy" }), { display: "Amy" });
  await assert.rejects(run({ display: "x" }), refused("invalid_display"));
  await assert.rejects(run({ display: "<b>" }), refused("invalid_display"));
  await assert.rejects(run({ display: "Bea" }, principal(2, "bea")), refused("capability_required"));
  await assert.rejects(run({ display: "Amy" }, principal(1, "amy", "x")), refused("capability_required"));
  await assert.rejects(run({ display: "Amy" }, principal(1, "amy"), { ...env, OOGA_CHAT_FEATURES: "bridge" }), refused("disabled"));
  await db.prepare("UPDATE players SET banned_at = 1 WHERE id = 1").run();
  await assert.rejects(run({ display: "Amy Again" }), refused("capability_required"));
  assert.equal((await getPlayer(db, 1)).display, "Amy", "a banned account's name stays as it was");
});

test("a player row a Commons name made goes with the Ooga Chat account, while it never signed in on the island", async () => {
  const { displayOps } = await import("../src/chat-display.js");
  const { revokeOps } = await import("../src/chat-bridge.js");
  const { getPlayer, upsertPlayerFromGitHub } = await import("../src/db.js");
  const db = memoryD1(new URL("../migrations/", import.meta.url));
  const contributorFor = Object.assign(async (login) => ["amy", "bea"].includes(login) ? { handle: login } : null, { fresh: () => true });
  const forgot = [];
  const env = { OOGA_CHAT_FEATURES: "bridge,commons", DB: db,
    ROOM: { getByName: () => ({ communityRevoke: async () => ({ revoked: 0 }), forgetVoiceLinks: async (id) => { forgot.push(id); } }) } };
  const principal = (id, login) => ({ id: `pr_${login}`, provider: "github", providerUserId: String(id), login });
  const name = (p, display) => displayOps({ contributorFor }).display.run(env, { payload: { display }, principal: p });
  const revoke = (p, reason) => revokeOps.revoke.run(env, { payload: { reason }, principal: p });
  await name(principal(1, "amy"), "Amy");
  assert.equal((await getPlayer(db, 1)).last_login_at, 0, "marked as never signed in on the island");
  await revoke(principal(1, "amy"), "logout");
  assert.ok(await getPlayer(db, 1), "signing out keeps it");
  await revoke(principal(1, "amy"), "deleted");
  assert.equal(await getPlayer(db, 1), null, "deleting the Ooga Chat account removes it");
  assert.deepEqual(forgot, [1], "and the voice links it asked for from Ooga Chat");
  // Signed in on the island first, or after: the island's own account, which Ooga Chat deletion leaves alone.
  await name(principal(2, "bea"), "Bea");
  await upsertPlayerFromGitHub(db, { id: 2, login: "bea", avatar_url: null });
  assert.equal((await getPlayer(db, 2)).display, "Bea");
  await revoke(principal(2, "bea"), "deleted");
  assert.equal((await getPlayer(db, 2)).display, "Bea", "an island account stays");
  assert.deepEqual(forgot, [1], "with its own voice links, which only deleting the island account takes");
});

test("the edge's Commons name: only an eligible GitHub contributor's save from the app's own page reaches the island", async () => {
  const { route } = await import("../chat/src/index.js");
  const { forgetHello } = await import("../chat/src/bridge.js");
  const { createSession, upsertPrincipal } = await import("../chat/src/session.js");
  forgetHello();
  const asked = [];
  const answers = { "1": "eligible", "2": "ineligible" };
  const env = { ENVIRONMENT: "staging", SITE_ORIGIN: "https://chat.example", DB: memoryD1(new URL("../chat/migrations/", import.meta.url)), FEATURES: "github,x,commons",
    GITHUB_CLIENT_ID: "i", GITHUB_CLIENT_SECRET: "s", X_CLIENT_ID: "i", X_CLIENT_SECRET: "s", ASSETS: { fetch: async () => new Response("app") },
    OBL: { call: async (e) => {
      if (e.op === "hello") return { ok: true, requestId: e.requestId, result: { version: BRIDGE_VERSION, environment: "staging", features: { bridge: true, commons: true }, voice: true } };
      if (e.op === "capability") return { ok: true, requestId: e.requestId, result: { state: answers[e.principal.providerUserId], character: null, policy: "p", checkedAt: Date.now() } };
      if (e.op === "display") {
        asked.push(e);
        const clean = e.payload.display.trim();
        return clean.length >= 3 ? { ok: true, requestId: e.requestId, result: { display: clean } } : { ok: false, error: { code: "invalid_display", retryable: false } };
      }
      return { ok: false, error: { code: "unknown_operation" } };
    } } };
  const tokenFor = async (provider, id, login) => createSession(env.DB, (await upsertPrincipal(env.DB, { provider, providerUserId: id, login, display: login, avatarUrl: null })).id, "t");
  const save = (token, body, { origin = "https://chat.example", method = "POST", e = env } = {}) => route(new Request("https://chat.example/api/chat/commons/name", {
    method, headers: { origin, "content-type": "application/json", ...(token ? { cookie: `__Host-ooga_chat_session=${token}` } : {}) },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) }), e, { fetch, waitUntil: null, cache: null });
  const amy = await tokenFor("github", "1", "amy");
  assert.equal((await save(null, { display: "Amy" })).status, 401);
  assert.equal((await save(await tokenFor("x", "99", "xan"), { display: "Xan" })).status, 403);
  assert.equal((await save(await tokenFor("github", "2", "nope"), { display: "Nope" })).status, 403);
  assert.equal((await save(amy, { display: "Amy" }, { origin: "https://elsewhere.example" })).status, 403);
  assert.equal((await save(amy, null, { method: "GET" })).status, 405);
  assert.equal((await save(amy, "{not json")).status, 400);
  assert.equal((await save(amy, { display: 7 })).status, 400);
  assert.equal(asked.length, 0, "nothing reaches the island but an eligible contributor's well-formed save");
  const ok = await save(amy, { display: " Amy B " });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { display: "Amy B" });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].principal.providerUserId, "1");
  assert.equal(asked[0].principal.provider, "github");
  assert.equal((await save(amy, { display: "x" })).status, 400, "the island's rules refuse it");
  forgetHello();
  assert.equal((await save(amy, { display: "Amy" }, { e: { ...env, FEATURES: "github" } })).status, 503, "the Commons off");
});

test("a member hears how many are in hosted chats through Ooga Chat, as the island's pages do", async () => {
  const h = await harness({ features: "bridge,commons,commons-send,chats" });
  const { ws: first } = await h.member(4, "dee");
  assert.equal(first.sent[0].chatOnline, undefined, "no chats, no number");
  await h.room.chatMembers("AAAAAAAAAAAAAAAA", "Dev call", 2, 3, ["x:9", "gh:7"]);
  assert.deepEqual(first.sent.filter((m) => m.t === "chat-online").at(-1), { t: "chat-online", n: 2, mine: false });
  const { ws: next } = await h.member(5, "eve");
  assert.deepEqual([next.sent[0].chatOnline, next.sent[0].chatMine], [2, false], "a member's welcome carries it");
  // Another page of dee's in a chat: dee is among the number, so dee's pages count them once; nobody's id goes out.
  await h.room.chatMembers("AAAAAAAAAAAAAAAA", "Dev call", 2, 3, ["x:9", "gh:4"]);
  assert.deepEqual(first.sent.filter((m) => m.t === "chat-online").at(-1), { t: "chat-online", n: 2, mine: true }, "the same total, now with dee among it");
  assert.deepEqual(next.sent.filter((m) => m.t === "chat-online").at(-1), { t: "chat-online", n: 2, mine: false });
  const { ws: again } = await h.member(4, "dee");
  assert.equal(again.sent[0].chatMine, true);
});
