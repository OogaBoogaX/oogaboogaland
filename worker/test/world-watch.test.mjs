// The World Map's push (worker/src/world-watch.js, worker/src/world-report.js): WorldWatch sends each viewer what its
// tier may see as the room reports it, and the room reports only while somebody watches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { routeFixture } from "./routes.mjs";
import { inspectorAllowed, inspectorOn, INSPECTOR_NAME } from "../src/inspect-report.js";
import { worldReporter, WORLD_NAME } from "../src/world-report.js";

const { answerFor } = routeFixture();
const view = (zones = { outside: [{ display: "Bea", login: "bea" }] }) => ({ name: "island", sockets: 3, players: Object.values(zones).flat().length, held: 0,
  maxPlayers: 32, commons: 0, closing: 2, zones, load: { seconds: 2, zones: { outside: { in: 6, out: 6 } } } });

// WorldWatch with a ctx that keeps tagged sockets as the runtime does.
const watchHost = ({ room = view(), ids = "7", down = 0 } = {}) => {
  const accepted = [];
  const socket = () => ({ sent: [], closed: false, code: 0, tags: [], send(t) { this.sent.push(JSON.parse(t)); }, close(code) { this.closed = true; this.code = code; } });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.webSocket = init.webSocket; } }
  const ctx = {
    setWebSocketAutoResponse() {},
    acceptWebSocket: (ws, tags) => { ws.tags = tags; accepted.push(ws); },
    getWebSockets: (tag) => accepted.filter((ws) => !ws.closed && (tag === undefined || ws.tags.includes(tag))),
  };
  const asked = { room: 0, objects: 0 };
  const env = {
    INSPECTOR_IDS: ids,
    INSPECTOR: { getByName: (name) => { assert.equal(name, INSPECTOR_NAME); return { objects: async () => { asked.objects++; return [{ cls: "Room", name: "island", rates: { in: 6, out: 6 } }]; } }; } },
    ROOM: { getByName: () => ({ worldWatch: async () => { asked.room++; if (down-- > 0) throw new Error("room down"); return structuredClone(room); } }) },
  };
  const source = readFileSync(new URL("../src/world-watch.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "").replace(/export const /g, "const ").replace("export class WorldWatch", "class WorldWatch")
    + "\nglobalThis.WorldWatch = WorldWatch; globalThis.MAX_VIEWERS = MAX_VIEWERS;";
  const context = { answerFor, inspectorAllowed, inspectorOn, INSPECTOR_NAME, WebSocketPair, Response, WebSocketRequestResponsePair: class {},
    DurableObject: class { constructor(c, e) { this.ctx = c; this.env = e; } }, JSON, Date, Number, Object };
  runInNewContext(source, context);
  const object = new context.WorldWatch(ctx, env);
  const connect = async (tier, id = 0) => {
    const res = await object.fetch({ headers: new Headers({ upgrade: "websocket", "x-viewer-tier": tier, "x-viewer-id": String(id) }) });
    return { res, ws: accepted.at(-1) };
  };
  return { object, connect, asked, accepted, MAX_VIEWERS: context.MAX_VIEWERS };
};

test("a viewer is sent the room as it stands, only what its tier may see, and the room is asked once for the first", async () => {
  const { connect, asked } = watchHost();
  const pub = await connect("public"), player = await connect("player", 3), inspector = await connect("inspector", 7);
  assert.equal(asked.room, 1, "the first viewer asks the room; the others are sent what it said");
  assert.deepEqual(pub.ws.sent[0].zones, { outside: 1 });
  assert.equal(pub.ws.sent[0].names, undefined, "no names signed out");
  assert.deepEqual(player.ws.sent[0].names.outside, [{ display: "Bea", login: "bea" }]);
  assert.equal(player.ws.sent[0].room, undefined, "no sockets for a player");
  assert.deepEqual({ ...inspector.ws.sent[0].room }, { cls: "Room", name: "island", sockets: 3, players: 1, held: 0, maxPlayers: 32, commons: 0, closing: 2 });
  assert.equal(inspector.ws.sent[0].objects.length, 1);
});

test("a report reaches every viewer at once, tier by tier, and tells the room whether anyone still watches", async () => {
  const { object, connect } = watchHost();
  const pub = await connect("public"), player = await connect("player", 3);
  const moved = view({ "dsb-maxis": [{ display: "Bea", login: "bea" }], outside: [{ display: "Cy", login: "cy" }] });
  assert.equal((await object.report(moved)).watching, true);
  assert.deepEqual(pub.ws.sent.at(-1).zones, { "dsb-maxis": 1, outside: 1 });
  assert.equal(pub.ws.sent.at(-1).names, undefined);
  assert.deepEqual(player.ws.sent.at(-1).names["dsb-maxis"], [{ display: "Bea", login: "bea" }]);
  pub.ws.close(); player.ws.close();
  assert.equal((await object.report(moved)).watching, false, "nobody left: the room goes quiet");
});

test("a room that cannot be asked closes the viewer's socket unsent, so the page polls, and the next viewer asks again", async () => {
  const { object, connect, asked } = watchHost({ down: 1 });
  await object.report(view({ outside: [{ display: "Old", login: "old" }] }));
  const first = await connect("player", 3);
  assert.equal(first.ws.closed, true, "not left open claiming to be live");
  assert.equal(first.ws.code, 1011);
  assert.equal(first.ws.sent.length, 0, "the view held from before is not sent");
  const second = await connect("player", 3);
  assert.equal(asked.room, 2, "asked again");
  assert.equal(second.ws.closed, false);
  assert.deepEqual(second.ws.sent[0].names.outside, [{ display: "Bea", login: "bea" }]);
});

test("WorldWatch refuses a tier the Worker did not name, an Inspector tier off the allowlist, and past its cap", async () => {
  const { connect, accepted, MAX_VIEWERS } = watchHost();
  assert.equal((await connect("admin")).res.status, 404);
  assert.equal((await connect("inspector", 3)).res.status, 404, "the allowlist is checked here too");
  while (accepted.length < MAX_VIEWERS) await connect("public");
  assert.equal((await connect("public")).res.status, 503);
});

// The room's reporter, with WorldWatch as a binding that answers as it would.
const reporterHost = (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000000 });
  const reports = [], pending = [];
  let watching = true;
  const env = { WORLD: { getByName: (name) => { assert.equal(name, WORLD_NAME); return { report: async (v) => { reports.push(v); return { watching }; } }; } } };
  let n = 0;
  const r = worldReporter({ waitUntil: (p) => pending.push(p) }, env, () => ({ n: ++n }));
  const settle = async () => { await Promise.resolve(); await Promise.all(pending.splice(0)); };
  return { r, reports, settle, nobody: () => { watching = false; } };
};

test("the room's changes in one turn go out as one report, a burst's last one after a short gap, and none is lost", async (t) => {
  const { r, reports, settle } = reporterHost(t);
  r.changed(); r.changed(); r.changed();
  await settle();
  assert.equal(reports.length, 1, "three changes, one report");
  r.changed();
  await settle();
  assert.equal(reports.length, 1, "held for the gap");
  t.mock.timers.tick(250);
  await settle();
  assert.equal(reports.length, 2, "then sent, with the view as it stands then");
});

test("once nobody watches the room sends nothing, until a viewer connects", async (t) => {
  const { r, reports, settle, nobody } = reporterHost(t);
  nobody();
  r.changed();
  await settle();
  assert.equal(reports.length, 1, "the first report learns nobody watches");
  t.mock.timers.tick(5000);
  r.changed(); r.tick();
  await settle();
  assert.equal(reports.length, 1, "quiet: no reports, no ticks");
  assert.ok(r.watch().n > 0, "a connecting viewer is handed the view");
  t.mock.timers.tick(5000);
  r.changed();
  await settle();
  assert.equal(reports.length, 2, "and the room reports again");
});

test("a watched room refreshes its CPU and sockets on calls it already makes, at most every two seconds", async (t) => {
  const { r, reports, settle } = reporterHost(t);
  r.tick();
  await settle();
  assert.equal(reports.length, 1);
  t.mock.timers.tick(1000);
  r.tick();
  await settle();
  assert.equal(reports.length, 1, "too soon");
  t.mock.timers.tick(1000);
  r.tick();
  await settle();
  assert.equal(reports.length, 2);
});

test("a room without the WORLD binding reports nothing", () => {
  const r = worldReporter({ waitUntil: () => assert.fail("reported") }, {}, () => ({}));
  r.changed(); r.tick();
  assert.equal(r.stats().sent, 0);
});
