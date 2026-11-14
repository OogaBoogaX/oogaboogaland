// Pure checks on the room's wire format and limits: no Durable Object, no sockets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { castIndex, claimRefusal, BOUND_XZ, BOUND_Y_MIN, BOUND_Y_MAX, CHALK, VISUAL_BODY, VISUAL_LIMITS, VISUAL_LOWS, MESSAGE_MAX, MOVE_HZ, parseClientMessage, playerFromHeaders, spawnPoint, takeToken } from "../src/protocol.js";

test("poses inside the bounds are accepted, rounded and their yaw wrapped", () => {
  const m = parseClientMessage(JSON.stringify({ t: "pose", x: 1.23456, y: -7, z: 3, yaw: 7 }));
  assert.equal(m.t, "pose");
  assert.equal(m.x, 1.235);
  assert.ok(Math.abs(m.yaw - (7 - 2 * Math.PI)) < 1e-3);
  for (const y of [BOUND_Y_MIN, 45, BOUND_Y_MAX]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: BOUND_XZ, y, z: -BOUND_XZ, yaw: 0 })).y, y,
      "climbing and airborne companions use the existing body's full height bounds");
  }
  const g = parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 25, z: 0, yaw: 0, g: [127, 30, -2e6, 2, -2, 3] }));
  assert.deepEqual(g.g, [127, 20, -1e6, 1, -1, 1], "gorilla locomotion, including sleep, is bounded independently of position");
  assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 25, z: 0, yaw: 0, j: 7 })).j, 7, "a worn jetpack at full thrust rides the pose");
  assert.equal("j" in parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 25, z: 0, yaw: 0, j: 0 })), false, "no jetpack adds nothing");
  assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 25, z: 0, yaw: 0, w: 255 })).w, 255, "the gun in hand, aimed, with every round, rides the pose");
  assert.equal("w" in parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 25, z: 0, yaw: 0, w: 0 })), false, "empty hands add nothing");
});

test("presentation phases are bounded integers and fit the existing pose envelope", () => {
  const v = VISUAL_LIMITS.map((n, i) => VISUAL_LOWS[i] < 0 ? VISUAL_LOWS[i] : n);
  const wire = JSON.stringify({ t: "pose", x: -159.999, y: -129.999, z: -159.999, yaw: -3.142, j: 7, w: 255, v });
  assert.ok(wire.length <= MESSAGE_MAX, "the largest bounded Ooga sample must not close its socket");
  assert.deepEqual(parseClientMessage(wire).v, v);
  const r = [0, 3, 255, -577, -577, -577], resting = JSON.stringify({ t: "pose", x: -159.999, y: -129.999, z: -159.999, yaw: -3.142, j: 7, w: 255, v, r });
  assert.ok(resting.length <= MESSAGE_MAX, "all presentation fields plus a hammock transition keep the existing 256-byte cap");
  assert.deepEqual(parseClientMessage(resting).r, r);
  assert.equal(parseClientMessage('{"t":"pose","x":0,"y":0,"z":0,"yaw":0,"r":0}').r, 0);
  for (const r of [null, [], [0, 1, 0], [1, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 4, 0, 0, 0, 0], [0, 1, 256, 0, 0, 0], [0, 1, 0, 1001, 0, 0], [0, 1, 0, 1000, 1000, 1000], [0, 1, 0, 0.5, 0, 0]])
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 0, z: 0, yaw: 0, r })), null, "malformed rest never reserves a seat");
  assert.equal("v" in parseClientMessage('{"t":"pose","x":0,"y":0,"z":0,"yaw":0}'), false);
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 0, z: 0, yaw: 0, v: v.slice(0, VISUAL_BODY) })).v, v.slice(0, VISUAL_BODY), "an older page's pose, without the body's own, still rides");
  for (const bad of [null, [], v.slice(1), [...v, 0], v.slice(0, VISUAL_BODY + 1), v.map((n, i) => i === 3 ? 8192 : n), v.map((n, i) => i === 4 ? -1 : n), v.map((n, i) => i === 0 ? 150.5 : n),
    v.map((n, i) => i === 17 ? 2629 : n), v.map((n, i) => i === 18 ? -51 : n)]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 0, z: 0, yaw: 0, v: bad })), null);
  }
});

test("a shot is six numbers inside the room's bounds and a shot's reach, rounded; a swing is just the strike", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "shot", a: [1.23456, 2, 3, 30, 4, -5] })), { t: "shot", a: [1.235, 2, 3, 30, 4, -5] });
  assert.deepEqual(parseClientMessage('{"t":"swing"}'), { t: "swing" });
  for (const a of [null, [], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, "5", 6], [BOUND_XZ + 1, 0, 0, 0, 0, 0],
    [0, BOUND_Y_MAX + 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, -BOUND_XZ - 1], [-100, 0, 0, 100, 0, 0]]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "shot", a })), null, JSON.stringify(a));
  }
});

test("poses out of bounds or not numbers are ignored, not fatal", () => {
  for (const bad of [{ x: BOUND_XZ + 1, y: 0, z: 0, yaw: 0 }, { x: 0, y: 500, z: 0, yaw: 0 }, { x: "1", y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 0 }]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", ...bad })), null, JSON.stringify(bad));
  }
  for (const g of [null, {}, [], [4, 0, 0, 0, 0], [4, 0, 0, 0, 0, 0, 0], [128, 0, 0, 0, 0, 0], [-1, 0, 0, 0, 0, 0],
    [0.5, 0, 0, 0, 0, 0], [4, "1", 0, 0, 0, 0], [4, 0, null, 0, 0, 0]]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 0, z: 0, yaw: 0, g })), null, JSON.stringify(g));
  }
  for (const j of [8, -1, 1.5, "1", null, true]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 0, z: 0, yaw: 0, j })), null, JSON.stringify(j));
  }
  for (const w of [256, -1, 2.5, "2", null, false]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", x: 0, y: 0, z: 0, yaw: 0, w })), null, JSON.stringify(w));
  }
});

test("a body is an Ooga name, its prefixed gorilla, or null; anything else is ignored", () => {
  assert.deepEqual(parseClientMessage('{"t":"body","name":"w-s-bitcoin"}'), { t: "body", name: "w-s-bitcoin" });
  assert.deepEqual(parseClientMessage('{"t":"body","name":"gorilla:w-s-bitcoin"}'), { t: "body", name: "gorilla:w-s-bitcoin" });
  const longest = "gorilla:" + "a".repeat(40);
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "body", name: longest })), { t: "body", name: longest });
  assert.deepEqual(parseClientMessage('{"t":"body","name":null}'), { t: "body", name: null });
  assert.equal(parseClientMessage('{"t":"body","name":"<b>"}'), null);
  assert.equal(parseClientMessage('{"t":"body","name":""}'), null);
  for (const name of ["gorilla:", "gorilla:<b>", "gorilla:gorilla:ooga", "Gorilla:ooga", "gorilla:" + "a".repeat(41)]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "body", name })), null, name);
  }
});

test("unknown types are ignored; unreadable or oversized frames close the socket", () => {
  assert.equal(parseClientMessage('{"t":"teleport","id":1}'), null);
  assert.equal(parseClientMessage("{nope"), false);
  assert.equal(parseClientMessage("[1,2]"), false);
  assert.equal(parseClientMessage(" ".repeat(MESSAGE_MAX + 1)), false);
  assert.equal(parseClientMessage(undefined), false);
});

test("the move bucket allows MOVE_HZ a second and refills with time", () => {
  const b = { tokens: MOVE_HZ, at: 0 };
  let spent = 0;
  for (let i = 0; i < 100; i++) if (takeToken(b, MOVE_HZ, 0)) spent++;
  assert.equal(spent, MOVE_HZ);
  assert.ok(!takeToken(b, MOVE_HZ, 10));
  assert.ok(takeToken(b, MOVE_HZ, 60));
});

test("spawn slots ring the pile, eight apart, facing it", () => {
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const s = spawnPoint(i);
    assert.ok(Math.abs(Math.hypot(s.x, s.z) - 3.5) < 1e-2);
    seen.add(`${s.x},${s.z}`);
  }
  assert.equal(seen.size, 8);
  assert.deepEqual(spawnPoint(8), spawnPoint(0));
});

test("identity comes only from the Worker's headers, all or nothing", () => {
  const h = (o) => new Headers(o);
  assert.deepEqual(playerFromHeaders(h({ "x-player-id": "42", "x-player-login": "ooga" })), { id: 42, login: "ooga", display: "ooga", contributor: false });
  assert.equal(playerFromHeaders(h({ "x-player-id": "42", "x-player-login": "ooga", "x-player-contributor": "1" })).contributor, true);
  assert.equal(playerFromHeaders(h({ "x-player-login": "ooga" })), null);
  assert.equal(playerFromHeaders(h({ "x-player-id": "abc", "x-player-login": "ooga" })), null);
  assert.equal(playerFromHeaders(h({ "x-player-id": "42" })), null);
});

test("body ownership: only an Ooga owner may join and claim their own Ooga or gorilla", async () => {
  const { castIndex, claimRefusal, ownedBody } = await import("../src/protocol.js");
  const cast = castIndex([
    { handle: "bc1gui", github_login: "ottoz0r" },
    { handle: "portlandhodl", github_login: "portlandhodl" },
    { handle: "rules-without-rulers", github_login: "rules-without-rulers" },
  ]);
  const room = (...players) => players.map(([login, body = null]) => ({ login, body }));
  assert.equal(ownedBody(cast, "OTTOZ0R"), "bc1gui");
  assert.equal(ownedBody(cast, "visitor"), null);
  assert.equal(ownedBody(cast, "new-ooga", true), "new-ooga");
  assert.equal(ownedBody(cast, "bc1gui", true), null, "a verified contributor cannot shadow another owner's alias");
  // A contributor, known by GitHub login: their own Ooga, and nothing else.
  assert.equal(claimRefusal(cast, "ottoz0r", "bc1gui", room()), null);
  assert.equal(claimRefusal(cast, "OTTOZ0R", "BC1GUI", room()), null);
  assert.equal(claimRefusal(cast, "ottoz0r", "portlandhodl", room()), "not-yours");
  // A handle is a name, not a login: another account called bc1gui owns nothing.
  assert.equal(claimRefusal(cast, "bc1gui", "bc1gui", room(["ottoz0r"])), "not-yours");
  // An old guest session never gains a body, even if nobody else is present.
  assert.equal(claimRefusal(cast, "visitor", "portlandhodl", room()), "not-yours");
  assert.equal(claimRefusal(cast, "visitor", "nobody-real", room()), "not-yours");
  assert.equal(claimRefusal(cast, "visitor", null, room(["portlandhodl"])), null);
  // Eligibility is a Worker-vouched flag, persisted in the room's attachment.
  assert.equal(claimRefusal(cast, "new-ooga", "new-ooga", room()), "not-yours");
  assert.equal(claimRefusal(cast, "new-ooga", "NEW-OOGA", room(), true), null);
  assert.equal(claimRefusal(cast, "new-ooga", "portlandhodl", room(), true), "not-yours");
  assert.equal(claimRefusal(cast, "visitor", "new-ooga", room(["new-ooga", "new-ooga"])), "not-yours");
  assert.equal(claimRefusal(cast, "ottoz0r", "ottoz0r", room(), true), "not-yours");
  assert.equal(claimRefusal(cast, "ottoz0r", "bc1gui", room(), true), null);
  assert.equal(claimRefusal(cast, "bc1gui", "bc1gui", room(["ottoz0r"]), true), "not-yours");
  // The prefix chooses the companion, never a different identity or permission.
  assert.equal(claimRefusal(cast, "ottoz0r", "gorilla:bc1gui", room()), null);
  assert.equal(claimRefusal(cast, "OTTOZ0R", "gorilla:BC1GUI", room()), null);
  assert.equal(claimRefusal(cast, "ottoz0r", "gorilla:portlandhodl", room()), "not-yours");
  assert.equal(claimRefusal(cast, "ottoz0r", "gorilla:ottoz0r", room(), true), "not-yours", "canonical handle, not its login alias");
  assert.equal(claimRefusal(cast, "visitor", "gorilla:portlandhodl", room()), "not-yours", "a signed-in visitor cannot borrow a gorilla");
  assert.equal(claimRefusal(cast, "visitor", "gorilla:nobody-real", room()), "not-yours");
  assert.equal(claimRefusal(cast, "new-ooga", "gorilla:new-ooga", room()), "not-yours");
  assert.equal(claimRefusal(cast, "new-ooga", "gorilla:NEW-OOGA", room(), true), null);
  assert.equal(claimRefusal(cast, "new-ooga", "gorilla:portlandhodl", room(), true), "not-yours");
  assert.equal(claimRefusal(cast, "bc1gui", "gorilla:bc1gui", room(), true), "not-yours", "temporary identity cannot shadow a curated alias");
});

test("voice: players driving an Ooga hear each other while in the same place; nobody else does", async () => {
  const { voicePeers, parseClientMessage } = await import("../src/protocol.js");
  const on = { pub: "p", sub: "s", track: "mic" };
  const p = (id, body, zone, voice = on) => ({ id, body, zone, voice });
  const players = [
    p(1, "bc1gui", "outside"), p(2, "portlandhodl", "outside"), p(3, "w-s-bitcoin", "cave-lab"),
    p(4, null, "outside"), p(5, "MrHodlX", "outside", { pub: null, sub: "s", track: null }), p(6, "DrNeski", "outside", { pub: "p", sub: null, track: "mic" }),
    p(7, "timechainb", "cave-lab"), { ...p(8, "Tmmmemcee", "hq"), blendTo: "hq", blendK: 20 },
  ];
  const peers = voicePeers(players);
  assert.deepEqual(peers.get(1), [2, 6]);
  assert.deepEqual(peers.get(2), [1, 6]);
  assert.deepEqual(peers.get(3), [7], "a cave hears only its own");
  assert.deepEqual(peers.get(7), [3]);
  assert.deepEqual(peers.get(8), [], "alone in HQ hears nobody outside it");
  assert.deepEqual(peers.get(4), [], "not driving an Ooga hears nobody");
  assert.deepEqual(peers.get(5), [1, 2, 6], "listening without a microphone is allowed");
  assert.deepEqual(peers.get(6), [], "no receiving session, nothing to hear");
  players[0].body = "gorilla:bc1gui";
  assert.deepEqual(voicePeers(players).get(1), [2, 6], "switching to own gorilla keeps same-zone voice");
  players[0].body = null;
  assert.deepEqual(voicePeers(players).get(1), [], "detaching from a gorilla releases voice eligibility");
  assert.deepEqual(parseClientMessage('{"t":"zone","name":"cave-lab"}'), { t: "zone", name: "cave-lab" });
  assert.equal(parseClientMessage('{"t":"zone","name":"Cave Lab!"}'), null);
  assert.deepEqual(parseClientMessage('{"t":"mute","on":true}'), { t: "mute", on: true }, "a muted microphone reaches every roster");
  assert.equal(parseClientMessage('{"t":"mute","on":"yes"}'), null);
  assert.equal(parseClientMessage('{"t":"mute"}'), null);
});

test("voice zones: a group shares voice across its places; nobody is heard from none", async () => {
  const { voicePeers, parseClientMessage, zoneGroup } = await import("../src/protocol.js");
  const on = { pub: "p", sub: "s", track: "mic" };
  const p = (id, zone) => ({ id, body: `ooga-${id}`, zone, voice: on });
  const peers = voicePeers([p(1, "factory.hangar"), p(2, "factory.hall"), p(3, "outside"), p(4, "sphere"), p(5, "none"), p(6, "none"), p(7, "bifrost"), p(8, "bifrost.chamber")]);
  assert.deepEqual(peers.get(1), [2], "the Factory's hangar hears its hall");
  assert.deepEqual(peers.get(2), [1]);
  assert.deepEqual(peers.get(3), [4, 7], "the main world's surface is one place, whatever the zone");
  assert.deepEqual(peers.get(4), [3, 7]);
  assert.deepEqual(peers.get(5), [], "between scenes hears nobody, not even another between them");
  assert.deepEqual(peers.get(7), [3, 4], "the Bifrost isle is on the surface");
  assert.deepEqual(peers.get(8), [], "and its chamber a room of its own");
  assert.equal(zoneGroup("arcade.hall"), "arcade");
  assert.equal(zoneGroup("dsb-studio"), "dsb-studio");
  assert.deepEqual(parseClientMessage('{"t":"zone","name":"factory.hall"}'), { t: "zone", name: "factory.hall" });
  assert.equal(parseClientMessage('{"t":"zone","name":"a.b.c"}'), null);
  assert.equal(parseClientMessage('{"t":"zone","name":".hall"}'), null);
});

test("Sphere rooms 0–9 isolate voice by number, only the Conference Room locks, and doorway frames are strictly bounded", async () => {
  const { voicePeers } = await import("../src/protocol.js");
  const on = { pub: "p", sub: "s", track: "mic" };
  const p = (id, zone) => ({ id, body: `ooga-${id}`, zone, voice: on });
  const peers = voicePeers([p(1, "sphere-1"), p(2, "sphere-1"), p(3, "sphere-2"), p(4, "sphere"), p(5, "sphere-9"), p(6, "sphere-0"), p(7, "sphere-0")]);
  assert.deepEqual(peers.get(1), [2]);
  assert.deepEqual(peers.get(2), [1]);
  assert.deepEqual(peers.get(3), []);
  assert.deepEqual(peers.get(4), []);
  assert.deepEqual(peers.get(5), []);
  assert.deepEqual(peers.get(6), [7], "room 0 is a room of its own too");

  assert.deepEqual(parseClientMessage('{"t":"door","op":"ask","dir":"in","room":7}'), { t: "door", op: "ask", dir: "in", room: 7 });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"ask","dir":"out","room":0}'), { t: "door", op: "ask", dir: "out", room: 0 });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"pass","door":"sphere-0","dir":"in"}'), { t: "door", op: "pass", door: "sphere-0", dir: "in" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"go","cycle":"abc_123"}'), { t: "door", op: "go", cycle: "abc_123" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"done","cycle":"abc-123"}'), { t: "door", op: "done", cycle: "abc-123" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"cancel","extra":true}'), { t: "door", op: "cancel" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"pass","door":"sphere-9","dir":"out"}'), { t: "door", op: "pass", door: "sphere-9", dir: "out" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"lock","room":1,"pin":"0042"}'), { t: "door", op: "lock", room: 1, pin: "0042" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"try","room":1,"pin":"1234","extra":1}'), { t: "door", op: "try", room: 1, pin: "1234" });
  assert.deepEqual(parseClientMessage('{"t":"door","op":"unlock","room":1}'), { t: "door", op: "unlock", room: 1 });
  for (const bad of ['{"t":"door","op":"lock","room":1,"pin":"123"}', '{"t":"door","op":"try","room":1}']) assert.equal(parseClientMessage(bad), null);
  // Every other room has no lock to set, try or open.
  for (const room of [0, 2, 3, 4, 5, 6, 7, 8, 9]) for (const op of ["lock", "try", "unlock"]) assert.equal(parseClientMessage(JSON.stringify({ t: "door", op, room, pin: "1234" })), null, `${op} room ${room}`);
  for (const bad of [
    { t: "door", op: "ask", dir: "in", room: 10 }, { t: "door", op: "ask", dir: "in", room: -1 }, { t: "door", op: "ask", dir: "side", room: 1 },
    { t: "door", op: "go", cycle: "bad cycle" }, { t: "door", op: "done", cycle: "x".repeat(65) },
    { t: "door", op: "pass", door: "sphere-10", dir: "in" }, { t: "door", op: "pass", door: "sphere-1", dir: "side" },
    { t: "door", op: "open" },
  ]) assert.equal(parseClientMessage(JSON.stringify(bad)), null, JSON.stringify(bad));
});

test("health: a driven Ooga's health is clamped to 0-100 and needs its knocked-out flag", async () => {
  const { parseClientMessage } = await import("../src/protocol.js");
  assert.deepEqual(parseClientMessage('{"t":"hp","v":63.6,"ko":false}'), { t: "hp", v: 64, ko: false });
  assert.deepEqual(parseClientMessage('{"t":"hp","v":-5,"ko":true}'), { t: "hp", v: 0, ko: true });
  assert.deepEqual(parseClientMessage('{"t":"hp","v":250,"ko":false}'), { t: "hp", v: 100, ko: false });
  assert.equal(parseClientMessage('{"t":"hp","v":"50","ko":false}'), null);
  assert.equal(parseClientMessage('{"t":"hp","v":50}'), null);
});

// Contract: spectators keep floor visibility while hearing only the table they selected.
test("Ember Den voice separates ten tables and the walking floor without changing zones", async () => {
  const { voicePeers } = await import("../src/protocol.js");
  const player = (id, pokerVoice) => ({ id, pokerVoice, zone: "ember-den", body: `fixture-${id}`, voice: { sub: "receive", track: "mic" } });
  const players = [player(1, 0), player(2, 0), player(3, 1), player(4, null), player(5, null), player(6, 9)];
  const peers = voicePeers(players);
  assert.deepEqual(peers.get(1), [2]);
  assert.deepEqual(peers.get(3), []);
  assert.deepEqual(peers.get(4), [5]);
  assert.deepEqual(peers.get(6), []);
  players[2].pokerVoice = 0;
  assert.deepEqual(voicePeers(players).get(3), [1, 2]);
  assert.ok(players.every(p => p.zone === "ember-den"));
  for (const table of [null, 0, 9]) assert.deepEqual(parseClientMessage(JSON.stringify({ t: "poker-voice", table })), { t: "poker-voice", table });
  for (const table of [-1, 10, 0.5, "0", undefined]) assert.equal(parseClientMessage(JSON.stringify({ t: "poker-voice", table })), null);
});

test("NPC host: the sitting host while it shows the island, else the page longest in the room among those that do; nobody when none does", async () => {
  const { electHost, parseClientMessage } = await import("../src/protocol.js");
  const p = (id, joinedAt, inHub) => ({ id, joinedAt, inHub });
  assert.equal(electHost([p(1, 100, true), p(2, 50, true), p(3, 10, false)]), 2);
  assert.equal(electHost([p(1, 100, true), p(2, 100, true)]), 1, "a tie goes to the lower id");
  assert.equal(electHost([p(1, 100, false)]), 0);
  assert.equal(electHost([]), 0);
  // A sitting host keeps the role while it shows the island, even when an older page comes back; it gives it up
  // only by leaving or hiding.
  assert.equal(electHost([p(1, 100, true), p(2, 50, true)], 1), 1, "an older page returning does not take hosting back");
  assert.equal(electHost([p(1, 100, false), p(2, 50, true)], 1), 2);
  assert.equal(electHost([p(2, 50, true)], 9), 2, "a host that has left hands over to the oldest");
  assert.deepEqual(parseClientMessage('{"t":"hub","on":true}'), { t: "hub", on: true });
  assert.equal(parseClientMessage('{"t":"hub","on":"yes"}'), null);
});

test("NPC followers: every other page showing the island, so a lone host sends nothing", async () => {
  const { electHost, npcFollowers } = await import("../src/protocol.js");
  const p = (id, joinedAt, inHub) => ({ id, joinedAt, inHub });
  const alone = [p(1, 10, true), p(2, 20, false)];
  assert.equal(npcFollowers(alone, electHost(alone)), 0, "a page elsewhere or hidden does not follow");
  const two = [p(1, 10, true), p(2, 20, true), p(3, 30, false)];
  assert.equal(npcFollowers(two, electHost(two)), 1);
  assert.equal(npcFollowers(two, 0), 0, "no host, no followers");
});

test("chalkboard edits are small integers in frames under the limit, refused whole when malformed", () => {
  const parse = (m) => parseClientMessage(JSON.stringify({ t: "chalk", v: CHALK.VERSION, ...m }));
  assert.deepEqual(parse({ k: "take" }), { t: "chalk", k: "take" });
  // A page on the first, smaller board sends no layout: none of its frames are taken.
  for (const v of [undefined, 1, "2"]) assert.equal(parse({ v, k: "take" }), null, `layout ${v}`);
  assert.equal(parseClientMessage(JSON.stringify({ t: "chalk", k: "line", m: "c", p: [1, 2, 3, 4] })), null);
  assert.deepEqual(parse({ k: "drop", extra: 1 }), { t: "chalk", k: "drop" });
  assert.deepEqual(parse({ k: "line", m: "e", p: [1, 2, 3, 4] }), { t: "chalk", k: "line", m: "e", p: [1, 2, 3, 4] });
  assert.deepEqual(parse({ k: "type", c: [["é", 10, 20], ["🍌", 1000, 0]] }), { t: "chalk", k: "type", c: [["é", 10, 20], ["🍌", 1000, 0]] });
  assert.deepEqual(parse({ k: "wipe", to: "original" }), { t: "chalk", k: "wipe", to: "original" });
  for (const bad of [{ k: "line", m: "c", p: [1, 2] }, { k: "line", m: "x", p: [1, 2, 3, 4] }, { k: "more", p: [1, 2, 3] },
    { k: "more", p: [1, 1001] }, { k: "more", p: [0.5, 1] }, { k: "type", c: [["ab", 1, 1]] }, { k: "type", c: [["\u0007", 1, 1]] },
    { k: "type", c: [] }, { k: "wipe", to: "all" }, { k: "steal" }])
    assert.equal(parse(bad), null, JSON.stringify(bad));
  // The page's fullest frames: a line's chunk at the board's far corner, and a chunk of characters JSON escapes.
  const line = JSON.stringify({ t: "chalk", v: CHALK.VERSION, k: "line", m: "c", p: Array(CHALK.CHUNK * 2).fill(1000) });
  const typed = JSON.stringify({ t: "chalk", v: CHALK.VERSION, k: "type", c: Array(CHALK.TYPE_CHUNK).fill(["\\", 1000, 1000]) });
  assert.ok(line.length <= MESSAGE_MAX && typed.length <= MESSAGE_MAX, `${line.length} ${typed.length}`);
  assert.equal(parseClientMessage(line).p.length, CHALK.CHUNK * 2);
});

test("a chalkboard edit applies the same anywhere: lines and characters stop at the limits, backspace reaches only its own session", () => {
  const board = CHALK.board(), start = board.marks.length, session = CHALK.session(board);
  assert.equal(CHALK.apply(board, { k: "back" }, session), "nothing", "the original message is not a typed character");
  assert.equal(CHALK.apply(board, { k: "more", p: [1, 1] }, session), "closed", "no line is open");
  assert.equal(CHALK.apply(board, { k: "line", m: "c", p: [0, 0, 500, 1000] }, session), null);
  assert.deepEqual(board.marks.at(-1), { t: "c", s: 2, p: [0, 0, 0.5, 1] });
  assert.equal(CHALK.apply(board, { k: "type", c: [["a", 250, 500]] }, session), null);
  assert.equal(CHALK.apply(board, { k: "back" }, session), null);
  assert.equal(board.marks.length, start + 1);
  const other = CHALK.session(board);
  CHALK.apply(board, { k: "type", c: [["b", 1, 1]] }, session);
  assert.equal(CHALK.apply(board, { k: "back" }, CHALK.session(board)), "nothing", "a later session cannot take back an earlier one's writing");
  assert.equal(other.from, start + 1);
  const long = CHALK.board([]), s = CHALK.session(long);
  CHALK.apply(long, { k: "line", m: "c", p: [0, 0, 1, 1] }, s);
  for (let i = 0; i < CHALK.LINE_POINTS; i++) CHALK.apply(long, { k: "more", p: [i % 1000, 5] }, s);
  assert.equal(long.marks[0].p.length, CHALK.LINE_POINTS * 2, "a line stops at its point limit");
  assert.equal(long.points, CHALK.LINE_POINTS);
  assert.deepEqual(CHALK.restore(long.marks), long.marks, "and a board at its limits reads back");
  assert.equal(CHALK.apply(long, { k: "wipe", to: "clean" }, s), null);
  assert.deepEqual(long, { marks: [], points: 0 });
  assert.equal(CHALK.restore([{ t: "t", ch: "\u0000", p: [0, 0] }]), null);
  // Text is atomic at the total point limit too, even when plenty of mark slots remain.
  for (const [points, characters, accepted] of [[9999, 2, false], [9999, 1, true], [10000, 1, false]]) {
    const marks = Array.from({ length: 10 }, (_, i) => ({ t: "c", s: 2, p: Array((i < 9 ? 1000 : points - 9000) * 2).fill(0.5) }));
    assert.ok(CHALK.restore(marks));
    const b = CHALK.board(marks), session = { open: 9, from: 0 }, before = structuredClone({ b, session });
    const op = CHALK.parse({ k: "type", c: [["a", 100, 100], ["b", 200, 100]].slice(0, characters) });
    assert.equal(CHALK.apply(b, op, session), accepted ? null : "full");
    if (accepted) {
      assert.equal(b.points, CHALK.MAX_POINTS);
      assert.equal(b.marks.length, 11);
      assert.equal(session.open, -1);
    } else assert.deepEqual({ b, session }, before, "refused text changes neither marks, points nor the open line");
    assert.ok(CHALK.restore(b.marks));
  }
});

test("a wallet event is a device number, its fuse and, where it lies or flies, a bounded place; anything else is ignored", () => {
  const parse = (m) => parseClientMessage(JSON.stringify({ t: "wallet", ...m }));
  assert.deepEqual(parse({ k: "take", u: 7, l: 2, f: 21 }), { t: "wallet", k: "take", u: 7, l: 2, f: 21 });
  assert.deepEqual(parse({ k: "down", u: 7, f: 12.34567, x: 1.23456, y: 0, z: -3 }), { t: "wallet", k: "down", u: 7, f: 12.346, x: 1.235, y: 0, z: -3 });
  assert.deepEqual(parse({ k: "throw", u: 7, f: 3, x: 1, y: 2, z: 3, vx: 3.2, vy: 2.6, vz: -1 }), { t: "wallet", k: "throw", u: 7, f: 3, x: 1, y: 2, z: 3, vx: 3.2, vy: 2.6, vz: -1 });
  assert.deepEqual(parse({ k: "up", u: 7, f: 9 }), { t: "wallet", k: "up", u: 7, f: 9 });
  assert.deepEqual(parse({ k: "blast", u: [7, 8] }), { t: "wallet", k: "blast", u: [7, 8] });
  for (const bad of [{ k: "take", u: 0, l: 1, f: 21 }, { k: "take", u: 7, l: 16, f: 21 }, { k: "take", u: 7, l: 1, f: 61 }, { k: "up", u: 7 },
    { k: "down", u: 7, f: 1, x: BOUND_XZ + 1, y: 0, z: 0 }, { k: "throw", u: 7, f: 1, x: 0, y: 0, z: 0, vx: 21, vy: 0, vz: 0 },
    { k: "blast", u: [] }, { k: "blast", u: Array(17).fill(1) }, { k: "steal", u: 7, f: 1 }])
    assert.equal(parse(bad), null, JSON.stringify(bad));
});


test("numeric owner retains the same Ooga and gorilla while a reused login cannot drive either", () => {
  const index = castIndex([{ handle: "Bitcoin-Bill", github_login: "Bitcoin-Bill" }]);
  for (const login of ["Bitcoin-Bill", "Bitclank-Bill"])
    for (const body of ["Bitcoin-Bill", "gorilla:Bitcoin-Bill"])
      assert.equal(claimRefusal(index, login, body, [], true, 185141343), null);
  for (const body of ["Bitcoin-Bill", "gorilla:Bitcoin-Bill"])
    assert.equal(claimRefusal(index, "Bitcoin-Bill", body, [], true, 99), "not-yours");
});
