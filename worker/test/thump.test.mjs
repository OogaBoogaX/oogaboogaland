// Ooga thumps: the wire rule, who a thump reaches (everyone in voice in its voice place, by the same predicates as
// voicePeers, so poker tables, other places and `none` hold) and for whom it sounds (`thumpAudible`: those who would hear
// the sender's voice, so the DSB Studio's audience boundary holds), the per-account bucket, and the real room driven through its socket handler with storage, alarms
// and timers that fail the test if anything touches them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studio from "../src/studio-policy.js";
import { sfuClient } from "../src/sfu.js";
import { getPlayer } from "../src/db.js";

const { THUMP_HZ, THUMP_BURST, THUMP_BUCKET_KEEP, MESSAGE_MAX, parseClientMessage, thumpPeers, thumpAudible, thumpBucketFor, voicePeers, takeToken } = protocol;
const listening = { sub: "receive", pub: null, track: null };
const talking = { sub: "receive", pub: "publish", track: "mic" };
const player = (id, zone, voice = listening, extra = {}) => ({ id, zone, body: `ooga-${id}`, voice: { ...voice }, ...extra });
const ids = (list) => list.map((p) => p.id).sort((a, b) => a - b);

test("a thump is {t:\"thump\"} alone: no payload, a tiny frame, and anything more is ignored, never fatal", () => {
  assert.deepEqual(parseClientMessage('{"t":"thump"}'), { t: "thump" });
  for (const extra of [{ id: 9 }, { to: 3 }, { n: 5 }, { text: "yes" }, { t2: 1 }]) assert.equal(parseClientMessage(JSON.stringify({ t: "thump", ...extra })), null, JSON.stringify(extra));
  assert.equal(parseClientMessage(JSON.stringify({ t: "thump", pad: "x".repeat(MESSAGE_MAX) })), false, "an oversized frame closes as any other");
  assert.equal('{"t":"thump"}'.length, 13);
});

test("thump membership: listen-only and talking participants reach their voice group; nobody else sends or receives", () => {
  const players = [
    player(1, "outside"), // listen-only, never a microphone
    player(2, "outside", talking),
    player(3, "outside"),
    player(4, "outside", { sub: null, pub: null, track: null }), // driving, not in voice
    player(5, "lab", talking), // another group
    player(6, "outside", talking, { body: null }), // let go of their Ooga
    player(7, "factory.hall"), player(8, "factory", talking), // one group across its places
  ];
  assert.deepEqual(ids(thumpPeers(players, players[0])), [2, 3], "a listen-only thump reaches everyone in voice in its group");
  assert.deepEqual(ids(thumpPeers(players, players[1])), [1, 3]);
  assert.deepEqual(thumpPeers(players, players[3]), [], "not in voice: nothing is relayed");
  assert.deepEqual(thumpPeers(players, players[5]), [], "bodiless outside the Studio: nothing is relayed");
  assert.deepEqual(ids(thumpPeers(players, players[4])), [], "alone in its group");
  assert.deepEqual(ids(thumpPeers(players, players[6])), [8], "the Factory's tunnel and hall are one voice group");
  for (const q of [players[1], players[2]]) assert.ok(thumpAudible(q, players[0]), "a listen-only sender is heard as any voice would be");
  assert.ok(!thumpAudible(players[4], players[0]), "another group never hears it");
});

test("thump boundaries: `none` shares with nobody and Ember Den tables stay apart", () => {
  const nowhere = [player(1, "none", talking), player(2, "none", talking), player(3, "none")];
  for (const p of nowhere) assert.deepEqual(thumpPeers(nowhere, p), [], "nobody hears anyone `none`");
  const den = [player(1, "ember-den", talking, { pokerVoice: 1 }), player(2, "ember-den", listening, { pokerVoice: 1 }),
    player(3, "ember-den", talking, { pokerVoice: 2 }), player(4, "ember-den", talking, { pokerVoice: null }), player(5, "ember-den", listening)];
  assert.deepEqual(ids(thumpPeers(den, den[1])), [1], "table 1 reaches table 1 alone");
  assert.deepEqual(ids(thumpPeers(den, den[2])), [], "table 2 has nobody else");
  assert.deepEqual(ids(thumpPeers(den, den[3])), [5], "the floor (null, or never set) is its own place");
  assert.deepEqual(ids(thumpPeers(den, den[4])), [4]);
});

test("thump boundaries: everyone in the DSB Studio sees a thump; only those who would hear its sender hear it", () => {
  const s = { ...studio.studioState(1000), hostId: 1, mode: "presentation", restrictedIds: [6] };
  const zone = studio.STUDIO_ZONE;
  const players = [
    player(1, zone, talking), // the host
    player(2, zone, listening, { body: null }), // bodiless audience
    player(3, zone, listening, { body: null }),
    player(4, zone, talking, { studioSeat: 0 }), // seated attendee, not permitted in a presentation
    player(5, "dsb-outside", talking), // outside the Studio
    player(6, zone, talking, { studioSeat: 1 }), // restricted
  ];
  const heardBy = (sender) => ids(thumpPeers(players, sender, s).filter((q) => thumpAudible(q, sender, s)));
  assert.deepEqual(ids(thumpPeers(players, players[0], s)), [2, 3, 4, 6], "the host's thump is seen in the whole Studio");
  assert.deepEqual(heardBy(players[0]), [2, 3, 4, 6], "and heard there, as the host's voice is");
  assert.deepEqual(ids(thumpPeers(players, players[1], s)), [1, 3, 4, 6], "an audience member's thump is seen in the whole Studio");
  assert.deepEqual(heardBy(players[1]), [], "but heard by nobody: an audience is never heard");
  assert.deepEqual(ids(thumpPeers(players, players[3], s)), [1, 2, 3, 6]);
  assert.deepEqual(heardBy(players[3]), [], "an unpermitted attendee is not heard");
  assert.deepEqual(heardBy(players[5]), [], "a restricted attendee is not heard");
  assert.deepEqual(thumpPeers(players, players[4], s), [], "DSB Land outside does not reach the Studio");
  assert.ok(!thumpAudible(players[4], players[0], s), "nor does the Studio's sound reach DSB Land outside");
  assert.deepEqual(thumpPeers([player(2, "dsb-outside", listening, { body: null }), player(1, "dsb-outside", talking)], { id: 2, zone: "dsb-outside", body: null, voice: listening }, s), [],
    "a bodiless listener counts only inside the Studio");
  s.mode = "discussion";
  assert.deepEqual(heardBy(players[3]), [1, 2, 3, 6], "a permitted attendee is heard in the Studio, restricted players included");
  assert.deepEqual(heardBy(players[5]), [], "restriction keeps a speaker unheard in discussion too");
  assert.deepEqual(ids(thumpPeers(players, players[5], s)), [1, 2, 3, 4], "while the restricted player's thump is still seen");
});

test("thump reach and sound are voicePeers' own: seen by every voice participant sharing a place either way, heard by those who would hear the sender", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  // Crossings (BLEND, #392) included: a player part of the way along to an adjacent group.
  const zones = ["outside", "lab", "factory", "factory.hall", "none", "ember-den", studio.STUDIO_ZONE, "rainforest", "hq", "hq-basement", "sphere"];
  const toward = { outside: ["rainforest", "hq", "sphere"], rainforest: ["outside"], hq: ["outside", "hq-basement"], "hq-basement": ["hq"], sphere: ["outside"] };
  const cross = (p) => {
    const ways = toward[p.zone];
    if (ways && rand() < 0.5) { p.blendTo = ways[Math.floor(rand() * ways.length)]; p.blendK = 1 + Math.floor(rand() * protocol.BLEND.STEPS); }
    return p;
  };
  for (let round = 0; round < 600; round++) {
    const s = { ...studio.studioState(1000), hostId: 1 + Math.floor(rand() * 6), mode: ["presentation", "discussion", "qa"][Math.floor(rand() * 3)], invited: [2], restrictedIds: rand() < 0.3 ? [3] : [] };
    const players = Array.from({ length: 2 + Math.floor(rand() * 7) }, (_, i) => player(i + 1, zones[Math.floor(rand() * zones.length)],
      rand() < 0.2 ? { sub: null, pub: null, track: null } : rand() < 0.5 ? listening : talking,
      { body: rand() < 0.2 ? null : `ooga-${i + 1}`, pokerVoice: rand() < 0.5 ? null : Math.floor(rand() * 2), studioSeat: rand() < 0.5 ? i : undefined })).map(cross);
    // Places alone: everyone live, embodied and allowed to speak (a seat, discussion, nobody restricted), so voicePeers
    // says only who shares a voice place, from each listener's side.
    const open = { ...s, mode: "discussion", restrictedIds: [] };
    const shared = voicePeers(players.map((p, i) => ({ ...p, body: p.body || (p.zone === studio.STUDIO_ZONE ? `ooga-${p.id}` : null), studioSeat: i, voice: { ...p.voice, track: "mic" } })), open);
    for (const sender of players) {
      const live = players.map((p) => p === sender ? { ...p, voice: { ...p.voice, track: "mic" } } : p);
      const wouldHear = voicePeers(live, s);
      const listens = (q) => protocol.voiceListener(q, s);
      const want = listens(sender) ? players.filter((q) => q !== sender && listens(q)
        && (shared.get(q.id).includes(sender.id) || shared.get(sender.id).includes(q.id))).map((q) => q.id) : [];
      const got = thumpPeers(players, sender, s);
      assert.deepEqual(ids(got), want.sort((a, b) => a - b), JSON.stringify({ round, sender: sender.id }));
      for (const q of got) assert.equal(thumpAudible(q, sender, s), wouldHear.get(q.id).includes(sender.id), JSON.stringify({ round, sender: sender.id, q: q.id }));
    }
  }
});

test("the thump bucket: about two a second, three in a burst, kept per account and expired lazily", () => {
  const buckets = new Map(), present = new Map([[1, {}]]);
  const bucket = thumpBucketFor(buckets, 1, 0, present);
  assert.equal(thumpBucketFor(buckets, 1, 5, present), bucket, "one bucket per account, reused across sockets");
  const taken = [0, 0, 0, 0].map(() => takeToken(bucket, THUMP_HZ, 0, THUMP_BURST));
  assert.deepEqual(taken, [true, true, true, false], "a burst of three, then nothing");
  assert.equal(takeToken(bucket, THUMP_HZ, 400, THUMP_BURST), false);
  assert.equal(takeToken(bucket, THUMP_HZ, 500, THUMP_BURST), true, "one more every half second");
  // A departed account's bucket stays while it is in debt, so a reconnect cannot refill it, and goes once it is full.
  present.delete(1);
  thumpBucketFor(buckets, 2, 1000, present);
  assert.ok(buckets.has(1), "a departed account in debt keeps its bucket");
  thumpBucketFor(buckets, 3, 3000, present);
  assert.ok(!buckets.has(1), "a departed account's full bucket is dropped on the next new one");
  // Bounded: at the cap, no new debt is made rather than evicting a depleted one.
  const full = new Map(), here = new Map();
  for (let id = 1; id <= THUMP_BUCKET_KEEP; id++) { here.set(id, {}); thumpBucketFor(full, id, 0, here); }
  assert.equal(thumpBucketFor(full, THUMP_BUCKET_KEEP + 1, 0, here), null);
  assert.equal(full.size, THUMP_BUCKET_KEEP);
});

// The real room, its host mocked so that any storage, alarm or timer use fails.
const roomClass = (extra = {}) => {
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = { ...protocol, ...studio, getPlayer, DurableObject: class {}, WebSocketRequestResponsePair: class {}, sfuClient, CAST_ROWS: [], Date, Map, Set, Response, Promise, ...extra };
  runInNewContext(source, context);
  return context.Room;
};
const forbidden = (what) => () => { throw new Error(`a thump touched ${what}`); };
const thumpRoom = (clock) => {
  const Room = roomClass({ Date: { now: () => clock.now }, setTimeout: forbidden("setTimeout"), setInterval: forbidden("setInterval"), clearTimeout: () => {} });
  const room = Object.create(Room.prototype);
  room.ctx = { storage: new Proxy({}, { get: (_, key) => forbidden(`storage.${String(key)}`) }) };
  room.env = {};
  room.players = new Map(); room.chatBuckets = new Map(); room.thumpBuckets = new Map(); room.chat = protocol.chatLog();
  room.studio = studio.studioState(0);
  const join = (id, zone, voice, extra = {}) => {
    const ws = { sent: [], attachments: 0, deserializeAttachment: () => ({ id }), serializeAttachment: () => { ws.attachments++; }, send: (text) => ws.sent.push(text) };
    const p = room.record(ws, { id, login: `player${id}`, display: `P${id}`, contributor: true, body: `player${id}`, x: 0, y: 0, z: 0, yaw: 0, ...extra });
    p.zone = zone; p.voice = { ...p.voice, ...voice };
    room.players.set(id, p);
    return ws;
  };
  return { room, join };
};

test("the room relays a thump as one tiny frame to the sender's voice place alone, marked for those who would hear it, with no storage, alarm, timer or reply", () => {
  const clock = { now: 1000 };
  const { room, join } = thumpRoom(clock);
  const a = join(1, "outside", listening), b = join(2, "outside", talking), c = join(3, "outside", listening);
  const off = join(4, "outside", {}), lab = join(5, "lab", talking), nowhere = join(6, "none", talking);
  room.webSocketMessage(a, '{"t":"thump"}');
  assert.deepEqual(b.sent, ['{"t":"thump","id":1,"a":1}']);
  assert.deepEqual(c.sent, ['{"t":"thump","id":1,"a":1}']);
  for (const ws of [a, off, lab, nowhere]) assert.deepEqual(ws.sent, [], "never the sender, nobody outside voice or the group");
  room.webSocketMessage(off, '{"t":"thump"}');
  room.webSocketMessage(nowhere, '{"t":"thump"}');
  assert.equal(b.sent.length, 1, "a thump from outside voice, or from `none`, goes nowhere");
  room.webSocketMessage(a, '{"t":"thump","n":40}');
  assert.equal(b.sent.length, 1, "a frame carrying anything more is ignored");
  for (const ws of [a, b, c, off, lab, nowhere]) assert.equal(ws.attachments, 0, "the attachment is untouched");
  assert.equal(room.chat.size, 0, "no history");
  // The DSB Studio: an audience member's thump is seen there, and heard by nobody; the host's is heard by everyone.
  room.studio = { ...studio.studioState(0), hostId: 11, mode: "presentation" };
  const host = join(11, studio.STUDIO_ZONE, talking), seat = join(12, studio.STUDIO_ZONE, listening, { body: null }), other = join(13, studio.STUDIO_ZONE, listening, { body: null });
  room.webSocketMessage(seat, '{"t":"thump"}');
  assert.deepEqual([host.sent, other.sent], [['{"t":"thump","id":12}'], ['{"t":"thump","id":12}']], "seen without sound");
  room.webSocketMessage(host, '{"t":"thump"}');
  assert.deepEqual([seat.sent, other.sent.at(-1)], [['{"t":"thump","id":11,"a":1}'], '{"t":"thump","id":11,"a":1}'], "the host is heard");
});

test("the room spends the sender's bucket: three at once, then two a second, and a reconnect does not refill it", () => {
  const clock = { now: 5000 };
  const { room, join } = thumpRoom(clock);
  let a = join(1, "outside", listening);
  const b = join(2, "outside", listening);
  for (let i = 0; i < 6; i++) room.webSocketMessage(a, '{"t":"thump"}');
  assert.equal(b.sent.length, THUMP_BURST, "the burst, then nothing");
  clock.now += 500;
  room.webSocketMessage(a, '{"t":"thump"}');
  room.webSocketMessage(a, '{"t":"thump"}');
  assert.equal(b.sent.length, THUMP_BURST + 1, "one more after half a second");
  // The same account on a fresh socket keeps its debt.
  room.players.delete(1);
  a = join(1, "outside", listening);
  room.webSocketMessage(a, '{"t":"thump"}');
  assert.equal(b.sent.length, THUMP_BURST + 1, "reconnecting does not refill the bucket");
  clock.now += 2000;
  for (let i = 0; i < 6; i++) room.webSocketMessage(a, '{"t":"thump"}');
  assert.equal(b.sent.length, THUMP_BURST * 2 + 1, "refilled to the burst, never past it");
  // A thump that reaches nobody spends nothing.
  const { room: lone, join: joinLone } = thumpRoom(clock);
  const solo = joinLone(1, "outside", listening);
  for (let i = 0; i < 5; i++) lone.webSocketMessage(solo, '{"t":"thump"}');
  assert.equal(lone.thumpBuckets.size, 0);
});
