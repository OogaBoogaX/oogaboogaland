// A hosted chat's roles (docs/ooga-chat-hosts.md) as functions: ranks, the queue, invites, the stage, removal, the
// host's hold and succession, and a save that restores the same chat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoles, COHOSTS_MAX, QUEUE_MAX, INVITE_MS, DECLINE_MS, ASK_GAP_MS, HOST_HOLD_MS, STAGE_HOLD_MS } from "../src/chat-roles.js";

const H = "gh:1", C = "gh:2", D = "gh:3", L = "x:9", M = "gh:4";
// A co-host as the host makes one: an offer, accepted.
const co = (r, id, now) => { const offered = r.setCohost(H, id, true, now); return offered.ok ? r.answerCohost(id, true, now) : offered; };

test("the host may speak; a listener may not until a host invites them, and an invite lapses", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.equal(r.rankOf(H), "host");
  assert.equal(r.mayLease(H, 0), true);
  assert.equal(r.mayLease(L, 0), false, "joining is not speaking");
  assert.deepEqual(r.invite(L, M, 0), { ok: false, code: "not_host" }, "a listener invites nobody");
  assert.equal(r.invite(H, L, 1000).ok, true);
  assert.equal(r.requestOf(L, 1000), "invited");
  assert.equal(r.mayLease(L, 1000 + INVITE_MS - 1), true);
  assert.equal(r.mayLease(L, 1000 + INVITE_MS), false, "an invite is good for a minute");
  assert.deepEqual(r.tick(1000 + INVITE_MS).expired, [L]);
  assert.equal(r.requestOf(L, 1000 + INVITE_MS), "");
});

test("requests: one an identity, oldest first, a gap between asks, a cooldown after a decline, a full queue refused", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.equal(r.ask(L, 100).ok, true);
  assert.equal(r.ask(L, 200).changed, false, "asking twice is one request");
  assert.equal(r.ask(M, 300).ok, true);
  assert.deepEqual(r.queue().map((q) => q.id), [L, M]);
  assert.equal(r.requestOf(M, 300), "asked");
  assert.equal(r.cancel(L).ok, true);
  assert.equal(r.ask(L, 400).code, "rate_limited", "cancel and ask again is held to the gap");
  assert.equal(r.ask(L, 100 + ASK_GAP_MS).ok, true);
  assert.equal(r.answer(H, M, false, 1000).ok, true, "declined");
  assert.equal(r.requestOf(M, 1000), "");
  const cool = r.ask(M, 1000 + ASK_GAP_MS);
  assert.equal(cool.code, "cooldown");
  assert.ok(cool.retryAfter > 0 && cool.retryAfter <= DECLINE_MS / 1000);
  assert.equal(r.ask(M, 1000 + DECLINE_MS).ok, true, "after the cooldown they may ask again");
  assert.equal(r.answer(H, D, true, 2000).code, "not_asked", "approving needs a request");
  assert.equal(r.ask(H, 3000).code, "already_allowed", "the host never asks");
  const full = createRoles({ host: H, now: 0 });
  for (let i = 0; i < QUEUE_MAX; i++) assert.equal(full.ask(`gh:${100 + i}`, i).ok, true);
  assert.deepEqual(full.ask("gh:999", 0), { ok: false, code: "queue_full", retryable: true });
});

test("approving is an invite; a granted lease puts them on the stage, and once let on they come back without asking until moved off or removed", () => {
  const r = createRoles({ host: H, now: 0 });
  r.presence(H, true, 0);
  r.ask(L, 0);
  assert.equal(r.answer(H, L, true, 10).ok, true);
  assert.equal(r.requestOf(L, 10), "invited");
  assert.equal(r.granted(L, 20).ok, true);
  assert.equal(r.requestOf(L, 20), "", "a speaker has no request");
  assert.equal(r.mayLease(L, 20 + INVITE_MS * 10), true, "the stage lasts while the lease does");
  r.leaseEnded(L, false, 1000);
  assert.deepEqual(r.held(1000 + STAGE_HOLD_MS - 1), [L], "a dropped speaker's place is held for the cap");
  assert.equal(r.nextAt(), 1000 + STAGE_HOLD_MS, "the alarm wakes for a held place");
  r.tick(1000 + STAGE_HOLD_MS);
  assert.deepEqual(r.held(1000 + STAGE_HOLD_MS), []);
  assert.equal(r.mayLease(L, 1000 + STAGE_HOLD_MS), true, "remembered after the hold, too");
  r.granted(L, 5000);
  r.leaseEnded(L, true, 6000);
  assert.equal(r.mayLease(L, 6000), true, "leaving on their own word: Join voice brings them back with no approval");
  assert.equal(r.ask(L, 6000).code, "already_allowed");
  assert.equal(r.invite(H, L, 6000).code, "already_allowed");
  assert.equal(r.demote(H, L).ok, true);
  assert.equal(r.mayLease(L, 6000), false, "moved to listener: they ask again");
  r.invite(H, L, 7000); r.granted(L, 7000);
  r.remove(H, L, 8000); r.allowBack(H, L);
  assert.equal(r.mayLease(L, 8000), false, "removed and let back: a listener, nothing restored");
  assert.equal(r.granted(M, 0).code, "not_allowed", "no lease without leave");
  assert.equal(r.decline(L).changed, false);
  const saved = createRoles({ saved: JSON.parse(JSON.stringify(r.save())) });
  r.invite(H, L, 9000); r.granted(L, 9000);
  assert.equal(createRoles({ saved: JSON.parse(JSON.stringify(r.save())) }).isCleared(L), true, "stored with the roles");
  assert.equal(saved.isCleared(L), false);
});

test("ranks: the host makes up to three co-hosts; a co-host manages listeners but never the host or another co-host", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.equal(co(r, C, 1).ok, true);
  assert.equal(r.setCohost(C, D, true, 2).code, "not_host", "only the host makes co-hosts");
  for (let i = 0; i < COHOSTS_MAX - 1; i++) co(r, `gh:${50 + i}`, 3 + i);
  assert.equal(r.setCohost(H, D, true, 9).code, "cohosts_full");
  assert.equal(r.mayLease(C, 0), true, "a co-host may speak");
  assert.equal(r.invite(C, L, 10).ok, true, "a co-host invites");
  assert.equal(r.mute(C, L).ok, true);
  assert.equal(r.mute(C, H).code, "not_allowed", "a co-host never mutes the host");
  assert.equal(r.demote(C, "gh:50").code, "not_allowed", "nor another co-host");
  assert.equal(r.remove(C, H).code, "not_allowed");
  assert.equal(r.end(C).code, "not_host", "nor ends the chat");
  assert.equal(r.demote(H, C).ok, true, "the host outranks a co-host");
  assert.equal(r.setCohost(H, C, false, 20).ok, true);
  assert.equal(r.rankOf(C), "");
  assert.equal(r.mute(H, H).code, "not_allowed", "nobody acts on themselves this way");
});

test("removed: every role and request goes, and they stay out until the chat ends", () => {
  const r = createRoles({ host: H, now: 0 });
  co(r, C, 0);
  r.ask(L, 0);
  assert.equal(r.remove(C, L).ok, true);
  assert.equal(r.isRemoved(L), true);
  assert.deepEqual(r.queue(), []);
  assert.equal(r.ask(L, ASK_GAP_MS * 5).code, "removed");
  assert.equal(r.invite(H, L, 0).code, "removed");
  assert.equal(r.mayLease(L, 0), false);
  assert.equal(r.remove(H, C).ok, true, "the host removes a co-host");
  assert.equal(r.rankOf(C), "");
});

test("the host's hold: a minute to come back, then the longest-serving co-host (a connected one first), else the end", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.equal(r.nextAt(), HOST_HOLD_MS, "the host must connect within the hold");
  r.presence(H, true, 10);
  assert.equal(r.nextAt(), Infinity, "nothing to wake for");
  co(r, C, 100);
  co(r, D, 200);
  r.presence(H, false, 1000);
  assert.equal(r.tick(1000 + HOST_HOLD_MS - 1).host, null);
  r.presence(H, true, 1500);
  assert.equal(r.tick(1000 + HOST_HOLD_MS).host, null, "back in time, still host");
  r.presence(H, false, 2000);
  const passed = r.tick(2000 + HOST_HOLD_MS, (id) => id === D);
  assert.equal(passed.host, D, "a connected co-host before an older one who is away");
  assert.equal(r.rankOf(D), "host");
  assert.equal(r.rankOf(H), "", "the old host keeps nothing");
  assert.equal(r.hostAway, 0);
  r.presence(D, false, 5000);
  assert.equal(r.tick(5000 + HOST_HOLD_MS).host, C, "an away co-host still takes it");
  assert.equal(r.hostAway, 5000 + HOST_HOLD_MS * 2, "and must come within its own hold");
  assert.equal(r.tick(5000 + HOST_HOLD_MS * 2).ended, true, "with no co-host left, the chat ends");
  assert.equal(r.ended, true);
  assert.equal(r.ask(L, 0).code, "ended");
  assert.equal(r.nextAt(), Infinity);
});

test("handover: the host passes the chat to a co-host and becomes one; End chat is the host's alone", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.equal(r.handover(H, C, 1).code, "not_allowed", "only to a co-host");
  co(r, C, 1);
  assert.equal(r.handover(H, C, 2).ok, true);
  assert.equal(r.rankOf(C), "host");
  assert.equal(r.rankOf(H), "cohost");
  assert.equal(r.end(H).code, "not_host");
  assert.equal(r.end(C).ok, true);
  assert.equal(r.end(C).changed, false, "ending twice is one end");
});

test("a save restores the same chat, Maps and all", () => {
  const r = createRoles({ host: H, now: 0 });
  r.presence(H, true, 0);
  co(r, C, 1);
  r.ask(L, 2);
  r.invite(H, M, 3);
  r.answer(H, L, false, 4);
  r.remove(H, D);
  const back = createRoles({ saved: JSON.parse(JSON.stringify(r.save())) });
  assert.deepEqual(back.save(), r.save());
  assert.equal(back.rankOf(C), "cohost");
  assert.equal(back.requestOf(M, 10), "invited");
  assert.equal(back.ask(L, ASK_GAP_MS + 4).code, "cooldown");
  assert.equal(back.isRemoved(D), true);
});

test("allowed back: a host or co-host lets someone removed in again as a listener, with nothing else restored", () => {
  const r = createRoles({ host: H, now: 0 });
  co(r, C, 0);
  r.ask(L, 0);
  r.remove(C, L, 5, { login: "zed", display: "Zed" });
  assert.deepEqual(r.removedList(), [{ id: L, at: 5, login: "zed", display: "Zed" }]);
  assert.equal(r.allowBack(L, L).code, "not_host", "nobody lets themselves back");
  assert.equal(r.allowBack(C, L).ok, true, "a co-host may");
  assert.equal(r.isRemoved(L), false);
  assert.deepEqual(r.removedList(), []);
  assert.equal(r.allowBack(H, L).code, "not_removed");
  assert.equal(r.mayLease(L, 10), false, "back as a listener, not a speaker");
  assert.equal(r.requestOf(L, 10), "", "their old request is gone");
  assert.equal(r.ask(L, 10).ok, true, "and they may ask again");
  const old = createRoles({ saved: { host: H, removed: [M] } });
  assert.equal(old.isRemoved(M), true, "a save from before names read as unnamed removals");
  assert.equal(old.allowBack(H, M).ok, true);
});

test("an open stage: the host's alone, it approves everyone waiting as it opens and every ask after at once", () => {
  const r = createRoles({ host: H, now: 0 });
  co(r, C, 0);
  r.ask(L, 0); r.ask(M, 0);
  assert.equal(r.setOpen(C, true, 1).code, "not_host", "a co-host never opens the stage");
  const opened = r.setOpen(H, true, 1);
  assert.deepEqual(opened.invited.sort(), [M, L].sort(), "everyone waiting is approved");
  assert.equal(r.open, true);
  assert.deepEqual(r.queue(), []);
  assert.equal(r.requestOf(L, 1), "invited");
  const ask = r.ask(D, 5);
  assert.deepEqual([ask.ok, ask.invited], [true, true], "an ask is an invite");
  assert.equal(r.mayLease(D, 5), true);
  r.remove(H, "gh:7", 6);
  assert.equal(r.ask("gh:7", 6).code, "removed", "removed stays removed");
  assert.equal(r.setOpen(H, false, 7).changed, true);
  assert.equal(r.ask("gh:8", 7).invited, undefined, "closed again, an ask waits for a host");
  assert.equal(createRoles({ saved: r.save() }).open, false);
});

test("who may walk a chat's copy: speakers alone, a dropped one held as on the stage, never removed or after the end", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.equal(r.mayWalk(H, 0), false, "a host who has not taken the stage walks nowhere yet");
  assert.equal(r.granted(H, 0).changed, true, "a host's lease is a place on the stage too");
  assert.equal(r.mayWalk(H, 10), true);
  r.leaseEnded(H, false, 100);
  assert.equal(r.mayWalk(H, 100 + STAGE_HOLD_MS - 1), true, "held through a dropped socket");
  assert.equal(r.mayWalk(H, 100 + STAGE_HOLD_MS), false);
  assert.equal(r.mayWalk(L, 0), false, "a listener never walks");
  assert.equal(r.mayWalk(L, 0, true), true, "a lease held now is enough");
  r.remove(H, L, 0);
  assert.equal(r.mayWalk(L, 0, true), false, "never once removed");
  r.end(H);
  assert.equal(r.mayWalk(H, 0, true), false, "nor after the end");
});

test("co-hosting is offered: an offer holds a slot, accepting makes a co-host, leaving the stage brings the offer back, and the host can withdraw or make a co-host a speaker", () => {
  const r = createRoles({ host: H, now: 0 });
  assert.deepEqual(r.setCohost(H, C, true, 1), { ok: true, changed: true, offered: true });
  assert.equal(r.rankOf(C), "", "an offer is no rank yet");
  assert.equal(r.requestOf(C, 1), "cohost");
  assert.equal(r.mayLease(C, 1), false);
  r.setCohost(H, D, true, 2); r.setCohost(H, M, true, 3);
  assert.equal(r.setCohost(H, L, true, 4).code, "cohosts_full", "three slots, offers included");
  assert.deepEqual(r.setCohost(H, M, false, 5), { ok: true, changed: true, retracted: true }, "the host withdraws an offer");
  assert.equal(r.setCohost(H, L, true, 6).ok, true, "its slot is free again");
  assert.equal(r.answerCohost(D, false, 7).ok, true, "Not now frees the slot too");
  assert.equal(r.answerCohost(D, true, 7).code, "not_offered");
  assert.equal(r.answerCohost(C, true, 8).ok, true);
  assert.equal(r.rankOf(C), "cohost");
  assert.equal(r.mayLease(C, 8), true, "a co-host takes the stage at once");
  r.granted(C, 9);
  assert.deepEqual(r.leaseEnded(C, true, 10), { ok: true, changed: true, reinstated: true }, "leaving voice: a listener with the offer back");
  assert.deepEqual([r.rankOf(C), r.requestOf(C, 10)], ["", "cohost"]);
  assert.equal(r.setCohost(H, M, true, 11).ok, true, "one slot left: C's offer and L's hold two");
  assert.equal(r.setCohost(H, D, true, 12).code, "cohosts_full");
  r.answerCohost(C, true, 13); r.granted(C, 13);
  assert.deepEqual(r.setCohost(H, C, false, 14), { ok: true, changed: true, demoted: true }, "the host makes a co-host a plain speaker");
  assert.deepEqual([r.rankOf(C), r.mayLease(C, 14)], ["", true], "who keeps the stage");
  assert.equal(r.dropOffer(L).changed, true, "gone from the chat, an offer frees its slot");
});

test("a co-host whose place lapses: still here, a listener with the offer back; gone, the slot frees", () => {
  const r = createRoles({ host: H, now: 0 });
  co(r, C, 0); co(r, D, 0);
  r.granted(C, 0); r.granted(D, 0);
  r.leaseEnded(C, false, 100); r.leaseEnded(D, false, 100);
  assert.equal(r.rankOf(C), "cohost", "a drop is held first");
  const t = r.tick(100 + STAGE_HOLD_MS, (id) => id === C);
  assert.deepEqual(t.reinstated.sort(), [C, D].sort());
  assert.deepEqual([r.rankOf(C), r.requestOf(C, 0)], ["", "cohost"], "still here: the offer back");
  assert.deepEqual([r.rankOf(D), r.requestOf(D, 0)], ["", ""], "gone: the slot is free");
});
