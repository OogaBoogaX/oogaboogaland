// A hosted chat's copy of its zone (docs/ooga-chat-hosts.md, the second PR): the pure parts first, the seats a copy's
// clouds offer, a speaker's walking mark on their row, and the island's travel message.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COPY, COPY_SEATS, freeCopySeat, SEATS } from "../src/cloud-seats.js";
import { appRow, createAudience } from "../src/audience-model.js";
import { parseClientMessage, CONTROL_FRAMES, TRAVEL_FEATURE } from "../src/protocol.js";

test("a copy seats thirty-two on clouds, the island's first eight names among them", () => {
  assert.equal(COPY.length, COPY_SEATS);
  assert.equal(COPY_SEATS, 32);
  assert.deepEqual(COPY.slice(0, 8), [...SEATS.main], "the same names as the island's own eight");
  assert.equal(freeCopySeat(new Set(COPY.slice(0, 31))), "main-cloud-32");
  assert.equal(freeCopySeat(new Set(COPY)), null, "a full copy is no cloud, never a shared one");
});

test("a speaker walking the copy says so on their row; a listener never does, and the mark goes as they leave it", () => {
  const a = createAudience({ epoch: 1, clock: () => 1000, seats: () => false, may: () => true });
  a.connect({ connId: "c1", id: "gh:1" }, { provider: "github", login: "amy" });
  a.connect({ connId: "c2", id: "gh:2" }, { provider: "github", login: "bea" });
  a.join("c1", "main"); a.join("c2", "main");
  a.requestSpeaker("c1", { eligible: true, generation: 5, until: 9e15 });
  a.activate("c1", 5);
  a.commit();
  a.setWalking(["gh:1", "gh:2"]);
  const [d] = a.commit();
  assert.deepEqual(d.upsert.map((r) => [r.id, appRow(r).walking]), [["gh:1", true]], "only the speaker's row changes");
  a.setWalking([]);
  const [back] = a.commit();
  assert.equal(appRow(back.upsert[0]).walking, undefined);
  assert.deepEqual(a.commit(), [], "nothing more to say");
});

test("the island's travel message: one shape, a control frame, its own feature", () => {
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "travel" })), { t: "travel" });
  assert.deepEqual(parseClientMessage(JSON.stringify({ t: "travel", to: "anywhere" })), { t: "travel" }, "nothing else it says is read");
  assert.ok(CONTROL_FRAMES.has("travel"));
  assert.equal(TRAVEL_FEATURE, "travel-v1");
});
