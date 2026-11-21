import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { catalogRoster } from "../src/character-catalog-schema.js";

const source = (name) => readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), "utf8");
const noop = () => {};
const browser = (current = { status: "ready", roster: "a".repeat(64) }) => {
  const sockets = [], voice = [];
  class WebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor() { this.readyState = 1; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(typeof data === "string" ? JSON.parse(data) : data); }
    close() { this.readyState = 3; }
  }
  const BL = { characterCatalog: { current }, chatPolicy: { MAX: 1000, FEATURE: "chat" }, arcadeCabinets: { FEATURE: "cabinets" },
    audience: { FEATURE: "audience" }, chalkBoard: { FEATURE: "chalk" }, voiceBlend: { STEPS: 10 },
    voice: { restart: () => voice.push("restart"), resumed: () => voice.push("resumed"), stop: () => voice.push("stop") } };
  const window = { BL, addEventListener: noop, removeEventListener: noop, setTimeout: () => 1, clearTimeout: noop, setInterval: () => 1, clearInterval: noop };
  const context = { window, document: { cookie: "", hidden: false, addEventListener: noop, removeEventListener: noop },
    location: { protocol: "https:", host: "island.invalid", search: "" }, navigator: {}, performance, URLSearchParams,
    WebSocket, ArrayBuffer, DataView, console };
  runInNewContext(source("net"), context);
  const net = BL.net;
  net.state.me = { id: 1, login: "owner" }; net.state.resolved = true;
  net.rejoin(); net.setHub(true);
  const message = (data) => sockets.at(-1).onmessage({ data: data instanceof ArrayBuffer ? data : JSON.stringify(data) });
  const welcome = (catalog, feature = true, resumed = false) => message({ t: "welcome", you: { id: 1 }, players: [], host: 2, followers: 1,
    now: Date.now(), features: feature ? ["character-catalog-v1"] : [], catalog, resumed });
  return { BL, net, message, welcome, sockets, voice };
};

test("roster identity is stable across cosmetics and changes with exact order, engine or baseline", async () => {
  const a = await catalogRoster("v1", "1".repeat(40), ["Alice", "Bob"]);
  assert.equal(a, await catalogRoster("v1", "1".repeat(40), ["Alice", "Bob"]));
  for (const args of [["v1", "1".repeat(40), ["Bob", "Alice"]], ["v1", "1".repeat(40), ["alice", "Bob"]],
    ["v2", "1".repeat(40), ["Alice", "Bob"]], ["v1", "2".repeat(40), ["Alice", "Bob"]]]) {
    assert.notEqual(a, await catalogRoster(...args));
  }
});

test("a pinned browser reports its roster and holds on mismatch through no-host and reconnect without disturbing voice", () => {
  const h = browser(), { net } = h, roster = h.BL.characterCatalog.current.roster;
  assert.equal(net.state.npcHold, true, "connecting is no permission to simulate an independent crew");
  h.welcome({ roster, revision: "1".repeat(64) });
  assert.equal(net.state.npcHold, false);
  assert.equal(h.sockets[0].sent.findLast((msg) => msg.t === "hub").roster, roster);
  const frame = new Uint32Array([3, 1, 0, 0]).buffer;
  h.message(frame); assert.equal(net.npcFrame, frame);
  h.message({ t: "catalog", catalog: { roster, revision: "2".repeat(64) } });
  assert.equal(net.state.npcHold, false); assert.equal(net.npcFrame, frame, "a cosmetic revision keeps the current playback");
  h.message({ t: "catalog", catalog: { roster: "b".repeat(64), revision: "3".repeat(64) } });
  assert.equal(net.state.npcHold, true); assert.equal(net.npcFrame, null);
  h.message({ t: "host", id: 0, followers: 0 }); h.message(frame);
  assert.equal(net.npcFrame, null); assert.equal(net.state.npcHold, true);
  assert.deepEqual(h.voice, ["restart"], "catalog updates never end voice or presence");
  h.sockets[0].onclose({ code: 1006, wasClean: false });
  assert.equal(net.state.room, "connecting"); assert.equal(net.state.npcHold, true);
  net.rejoin(); h.welcome({ roster: "b".repeat(64) }, true, true);
  assert.equal(net.state.npcHold, true);
  assert.deepEqual(h.voice, ["restart", "resumed"]);
  net.state.me = null; net.state.room = "off";
  assert.equal(net.state.npcHold, false, "an actual signed-out visitor may use the ordinary solo crew");
  net.dispose();
});

test("embedded pages retain the legacy protocol while a failed catalog page cannot host", () => {
  const embedded = browser({ status: "embedded" });
  embedded.welcome(null, false);
  assert.equal(embedded.net.state.npcHold, false);
  assert.equal(embedded.sockets[0].sent.findLast((msg) => msg.t === "hub").roster, undefined);
  embedded.net.dispose();
  const unexpected = browser(); unexpected.welcome(null, false);
  assert.equal(unexpected.net.state.npcHold, true, "an enabled page cannot assume a legacy Worker's embedded roster matches");
  unexpected.net.dispose();
  for (const status of ["unavailable", "incompatible"]) {
    const h = browser({ status }); h.welcome({ roster: "a".repeat(64) });
    h.message({ t: "host", id: 1, followers: 1 });
    const before = h.sockets[0].sent.length;
    h.net.sendNpc(new Uint8Array(16));
    assert.equal(h.net.state.npcHold, true); assert.equal(h.sockets[0].sent.length, before);
    h.net.dispose();
  }
});

const npc = () => {
  const BL = {}, window = { BL };
  const context = { window, TextEncoder, TextDecoder, ArrayBuffer, Uint32Array, Float32Array, console };
  runInNewContext(source("math"), context); runInNewContext(source("scene"), context);
  BL.net = { state: { room: "live", hostId: 0, selfId: 1, followers: 0, npcVersion: 0, npcHold: true, catalogRequired: true }, sendNpc: noop };
  const cave = { contributor: {}, traits: { name: "Alice" }, parts: { armL: {}, armR: {} }, root: {}, sleepWeapons: {}, puppet: false };
  const crew = { list: [cave], workSites: [], player: null, resumeFromHost: noop }, told = [];
  runInNewContext(source("npc-sync"), context);
  const sync = BL.npcSync.create({ crew, fx: {}, onPlan: noop, onHit: noop, onModelChange: noop, onIncompatible: (reason) => told.push(reason) });
  const signature = BL.math.fnv1a(JSON.stringify([["Alice"], []]));
  return { BL, sync, cave, crew, told, signature };
};

test("NPC catalog and binary mismatches hold before AI, respect driven bodies and wait for compatible frames", () => {
  const h = npc(), { sync, cave, BL, crew } = h;
  sync.prepare(); assert.equal(sync.role, "hold"); assert.equal(cave.puppet, true);
  sync.update(0.1); sync.prepare(); assert.deepEqual(h.told, ["catalog"]);
  crew.player = cave; sync.prepare(); assert.equal(cave.puppet, false, "local player controls are preserved");
  crew.player = null;
  BL.net.state.room = "connecting"; sync.prepare(); assert.equal(cave.puppet, true);
  BL.net.state.room = "live"; BL.net.state.npcHold = false; BL.net.state.hostId = 2;
  sync.prepare(); assert.equal(sync.role, "follow"); assert.equal(cave.puppet, true, "a follower waits rather than running AI before its first frame");
  BL.net.npcFrame = new Uint32Array([3, h.signature + 1, 0, 0]).buffer; BL.net.state.npcVersion++;
  sync.prepare(); assert.equal(sync.incompatible, true); assert.equal(cave.puppet, true);
  sync.update(0.1); assert.equal(sync.frames, 0);
  BL.net.npcFrame = new Uint32Array([3, h.signature, 0, 0]).buffer; BL.net.state.npcVersion++;
  sync.update(0.1); assert.equal(sync.incompatible, false); assert.equal(sync.frames, 1); assert.equal(cave.puppet, true);
  BL.net.state.hostId = 1; sync.prepare(); assert.equal(sync.role, "host"); assert.equal(cave.puppet, false);
  sync.dispose();
});
