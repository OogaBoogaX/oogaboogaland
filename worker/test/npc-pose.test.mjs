import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createNpcPose } from "../src/npc-pose.js";
import { rig } from "./fixtures/npc-pose-rig.mjs";
const pose = globalThis.BL.npcPose;
const original = JSON.parse(readFileSync(new URL("fixtures/npc-pose-original.json", import.meta.url)));

test("shared Ooga display encoding preserves original bytes through pose and equipment transitions", () => {
  assert.equal(createHash("sha256").update(original.source).digest("hex"), original.sha256);
  const source = readFileSync(new URL("../../src/js/npc-pose.js", import.meta.url), "utf8");
  assert.equal(source.slice(source.indexOf("    const writeQuat = ("), source.indexOf("    return encodeCave;")), original.source);
  const a = rig(), outputs = [new Float32Array(112), new Float32Array(112)];
  const holders = [a.parts.armL, a.parts.armR, a.root, a.sleepWeapons, null];
  const holderCode = (i, n) => holders.indexOf(n.parent);
  const old = runInNewContext(original.constants + original.source + "\nencodeCave;", { out: outputs[0], holderCode });
  const shared = pose.create({ out: outputs[1], holderCode });
  for (let step = 0; step < 200; step++) {
    a.root.position.x = step / 3; a.root.quaternion = step % 2 ? [0, .5, 0, .8660254] : null;
    a.parts.head.geometry = step % 3 ? a.headClosed : null;
    a.parts.armL.quaternion = step % 4 ? [0, 0, 0, 1] : null;
    a.parts.gun.parent = holders[step % 5]; a.parts.club.parent = holders[(step + 1) % 5];
    a.parts.gun.visible = step % 2 === 0; a.parts.gunFlash.visible = step % 7 === 0;
    for (let i = 0; i < 30; i++) a.parts.gunBananas[i].visible = i < step % 31;
    a.state = pose.STATES[step % 4]; a.work.phase = pose.PHASES[step % 6];
    a.parts.torso.ember = step / 200; a.parts.armR.scorch = .5;
    a.parts.jetFlame.scale.y = step / 200; a.parts.jetFlame.visible = step % 2 === 0;
    a.bedroll = { outdoor: step % 3 === 0 }; a.stunBirds.visible = step % 3 === 0;
    old(0, 3, a); shared(0, 3, a);
    assert.deepEqual(outputs[1], outputs[0], `transition ${step}`);
  }
});

test("headless projection is canonical after recovery, bounded and excludes malformed or controlled actors", () => {
  const a = rig("a"), b = rig("b"), project = createNpcPose(123, 128);
  a.root.quaternion = [0, 0, 0, 1]; project([{ index: 127, actor: a }]); a.root.quaternion = null;
  const entries = [{ index: 127, actor: a }, { index: 2, actor: b }];
  const frame = project(entries);
  assert.deepEqual(frame, createNpcPose(123, 128)(entries.reverse()));
  assert.equal(new Float32Array(frame, 16)[0], 2);
  assert.equal(new Uint32Array(frame, 0, 4)[3], 0, "no shot/event history on recovery");
  a.controlled = true; assert.throws(() => project(entries), /projection/); a.controlled = false;
  a.root.position.y = NaN; assert.throws(() => project(entries), /projection/); a.root.position.y = 0;
  assert.throws(() => project([{ index: 128, actor: a }]), /projection/);
  assert.throws(() => project([entries[0], entries[0]]), /projection/);
  assert.throws(() => project(new Array(128)), /projection/);
  assert.throws(() => createNpcPose(0, 129), /projection/);
  const oversized = rig(); oversized.parts.gunBananas.push({ visible: true });
  assert.throws(() => project([{ index: 0, actor: oversized }]), /projection/);
  const full = project(Array.from({ length: 128 }, (_, index) => ({ index, actor: rig() })));
  assert.equal(full.byteLength, globalThis.BL.npcAuthority.MAX);
  assert.deepEqual(project([]), createNpcPose(123, 128)([]));
});

test("actual browser host and worker use the same pose record and preserve the driven-body exclusion", () => {
  const a = rig("a"), b = rig("b"), sent = [];
  const BL = { npcPose: pose, math: { quat: { create: () => new Float32Array([0, 0, 0, 1]) }, fnv1a: () => 123 },
    scene: { addChild() {}, removeChild() {} }, net: { state: { room: "live", selfId: 1, hostId: 1, followers: 1 }, sendNpc: bytes => sent.push(bytes.slice().buffer) } };
  runInNewContext(readFileSync(new URL("../../src/js/npc-sync.js", import.meta.url), "utf8"), { window: { BL }, TextEncoder, TextDecoder });
  const sync = BL.npcSync.create({ crew: { list: [a, b], player: b }, fx: {} });
  sync.update(.25);
  assert.equal(sent.length, 1);
  assert.deepEqual(Buffer.from(sent[0]), Buffer.from(createNpcPose(123, 2)([{ index: 0, actor: a }])));
  sync.dispose();
});
