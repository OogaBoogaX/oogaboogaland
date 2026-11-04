import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createNpcPose } from "../src/npc-pose.js";
import { rig } from "./fixtures/npc-pose-rig.mjs";
import { managedRigs } from "./fixtures/clanker-pose-rig.mjs";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import "../../src/js/clanker-pose.js";
import "../../src/js/npc-pose-packet.js";
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

test("actual managed Clanker rig projects exact clothing, eased poses and held glass to two reconstructed followers", () => {
  const f = managedRigs(), host = f.make(), followers = [f.make(), f.make()], world = "clanker-pose-fixture-1";
  const sender = host.createPoseProjector(world);
  let receivers = followers.map(r => r.createPoseProjector(world)), maxBytes = 0, held = null;
  const flask = () => { const node = f.B.scene.createNode({ geometry: f.B.agent.labFlaskGeometry(0) }); f.B.models.attachGlassShell(node); return node; };
  for (let step = 0; step < 90; step++) {
    if (step === 45) {
      followers[1].dispose(); followers[1] = f.make(); receivers[1] = followers[1].createPoseProjector(world);
    }
    if (step === 60) {
      held = "lab:vessel:3"; assert.equal(host.holdLabItem(flask()), true);
      for (const rig of followers) assert.equal(rig.holdLabItem(flask()), true);
    }
    host.setForm(step % 2 ? "ape" : "code");
    const phase = step % 9, x = phase < 2 ? 0 : phase < 4 ? 20 : 40;
    const motion = phase < 2 ? { lab: true, labWork: held ? "carry" : "type", labPhase: step / 7, labReach: .3 }
      : phase < 4 ? { office: true, officeSeat: .8, officeWork: "type", officeHands: [20, 1, 1, 21, 1, 1], officePhase: step / 9 }
        : phase === 4 ? { climb: .8, climbStride: step / 10 }
          : phase === 5 ? { roll: .8, rollAngle: 1.2, rollSide: .5 }
            : phase === 6 ? { swim: true } : phase === 7 ? { groom: .7, groomPhase: step / 8 } : {};
    host.poseManaged(.05, x, phase === 8 ? 2 : 0, .2, .7, phase === 8 ? 2.8 : 0,
      phase === 8, false, phase === 7 ? "sit" : "", motion);
    host.parts.torso.scorch = step / 100; host.parts.armR.ember = .2;
    host.root.matrixNative = step % 3 === 0; host.root.matrixLiving = true;
    host.root.visible = step % 17 !== 0;
    const before = f.display(host), frame = JSON.parse(JSON.stringify(sender.capture(held)));
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(frame)));
    for (let i = 0; i < followers.length; i++) {
      assert.equal(receivers[i].apply(frame, held), true);
      assert.equal(f.display(followers[i]), before, `rendered pose ${step}, follower ${i}`);
      assert.equal(JSON.stringify(receivers[i].capture(held)), JSON.stringify(frame));
    }
    assert.equal(f.display(host), before, "projection cannot advance the host rig");
  }
  assert.ok(maxBytes <= f.B.clankerPose.MAX_BYTES);
  // Repeated latest-frame application is idempotent and cannot replay motion or effects.
  const frame = sender.capture(held), before = f.display(followers[0]);
  receivers[0].apply(frame, held); assert.equal(f.display(followers[0]), before);
  // Rebuild geometry and the decoder in a fresh JS context, as on a late join.
  // Geometry ids are local, so compare the actual mesh/palette/clip data too.
  const fresh = managedRigs(), reconstructed = fresh.make();
  const item = fresh.B.scene.createNode({ geometry: fresh.B.agent.labFlaskGeometry(0) }); fresh.B.models.attachGlassShell(item);
  assert.equal(reconstructed.holdLabItem(item), true);
  const restored = reconstructed.createPoseProjector(world);
  restored.apply(JSON.parse(JSON.stringify(frame)), held);
  assert.equal(JSON.stringify(restored.capture(held)), JSON.stringify(frame));
  const mesh = n => n.geometry ? JSON.stringify({ verts: n.geometry.verts, faces: n.geometry.faces,
    lines: n.geometry.lines, clip: n.geometry.clipPlane }) : null;
  const compare = (a, b) => {
    assert.equal(mesh(a), mesh(b)); assert.equal(a.children.length, b.children.length);
    for (let i = 0; i < a.children.length; i++) compare(a.children[i], b.children[i]);
  };
  compare(host.root, reconstructed.root); reconstructed.dispose();
  for (const rig of [host, ...followers]) rig.dispose();
});

test("Clanker pose rejection preserves the target rig for incompatible versions, worlds, items, topology and malformed tails", () => {
  const f = managedRigs(), host = f.make(), target = f.make(), world = "clanker-pose-fixture-1";
  const sender = host.createPoseProjector(world), receiver = target.createPoseProjector(world);
  host.poseManaged(.1, 1, 2, 3, .6, 2, true);
  const frame = JSON.parse(JSON.stringify(sender.capture())), before = f.display(target);
  const edits = [s => s.v++, s => s.world = "other", s => s.profile[0]++, s => s.held = "unbound-item",
    s => s.nodes[3][0] = 3, s => s.nodes.at(-1)[21] = NaN, s => s.nodes.at(-1).push(0),
    s => s.nodes[0][2] = 2, s => s.nodes[0][9] = -1, s => s.appearance[0] = "unknown",
    s => s.nodes[0][22] = 2, s => Object.defineProperty(s.nodes[0], "extra", { value: 1 }),
    s => { s.nodes[0][2] = 1; s.nodes[0][12] = .123456789; },
    s => { s.nodes[2][0] = 3; s.nodes[3][0] = 2; }, s => s.nodes.push(...s.nodes), s => delete s.nodes[0][3]];
  for (const edit of edits) {
    const invalid = structuredClone(frame); edit(invalid);
    assert.throws(() => receiver.apply(invalid), /projection/); assert.equal(f.display(target), before);
  }
  assert.throws(() => sender.capture("unbound-item"), /projection/);
  const accessor = structuredClone(frame); let reads = 0;
  Object.defineProperty(accessor.nodes[0], "3", { get() { reads++; return 0; } });
  assert.throws(() => receiver.apply(accessor), /projection/); assert.equal(reads, 0); assert.equal(f.display(target), before);
  const extra = f.B.scene.createNode(); f.B.scene.addChild(host.root, extra);
  assert.throws(() => sender.capture(), /projection/, "unrepresented attachments cannot silently disappear");
  f.B.scene.removeChild(host.root, extra);
  const plain = f.B.agent.create({ managed: true, groundAt: () => 0 });
  assert.throws(() => plain.createPoseProjector(world).apply(frame), /projection/);
  const unmanaged = f.B.agent.create({ groundAt: () => 0 });
  assert.throws(() => unmanaged.createPoseProjector(world), /unavailable/);
  for (const rig of [host, target, plain, unmanaged]) rig.dispose();
});

test("bounded mixed packet preserves 53 Ooga and 53 actual Clanker poses without a prior frame or number rounding", () => {
  const f = managedRigs(), rigs = Array.from({ length: 53 }, f.make), world = "mixed-fixture-1";
  const clankers = rigs.map((r, index) => {
    r.poseManaged(.05, index / 7, 0, index / 11, .7, 2.8, false, false, "", { climb: .8, climbStride: index / 10 });
    r.root.position.z = index === 0 ? -0 : r.root.position.z;
    return { index, pose: r.createPoseProjector(world).capture() };
  });
  const ooga = createNpcPose(123, 53)(rigs.map((_, index) => { const actor = rig(); actor.root.position.x = index / 7; return { index, actor }; }));
  const codec = globalThis.BL.npcPosePacket, packet = codec.pack(world, ooga, clankers), decoded = codec.unpack(packet);
  assert.ok(packet.byteLength <= 32768); assert.equal(codec.MAX, 32768);
  assert.deepEqual(decoded.ooga, ooga);
  for (let i = 0; i < clankers.length; i++) {
    const before = clankers[i].pose, after = decoded.clankers[i].pose;
    assert.equal(JSON.stringify(after), JSON.stringify(before));
    for (let n = 0; n < before.nodes.length; n++) for (let k = 0; k < before.nodes[n].length; k++) assert.ok(Object.is(before.nodes[n][k], after.nodes[n][k]));
    const follower = f.make(); follower.createPoseProjector(world).apply(after);
    assert.equal(f.display(follower), f.display(rigs[i])); follower.dispose();
  }
  assert.deepEqual(codec.pack(world, decoded.ooga, decoded.clankers), packet, "canonical after reconstruction");
  assert.deepEqual(codec.pack(world, ooga, [...clankers].reverse()), packet);
  assert.equal(globalThis.BL.npcAuthority.poses(packet), false, "old transport must not silently accept a new format");
  assert.equal(codec.unpack(codec.pack("a", createNpcPose(0, 1)([]), [])).clankers.length, 0);
  for (const r of rigs) r.dispose();
});

test("managed Clanker continuation preserves subsequent real animation, collision bounds and held items after reconstruction", () => {
  const world="continuation-fixture-1",f=managedRigs(),source=f.make(),bench={name:'fixture-bench'};
  const bind=(fixture,actor)=>{const item=fixture.B.scene.createNode({geometry:fixture.B.agent.labFlaskGeometry(0)});fixture.B.models.attachGlassShell(item);assert.equal(actor.holdLabItem(item),true);};
  bind(f,source);const writer=source.createManagedCheckpoint(world);
  let fresh=managedRigs(),resumed=fresh.make(),otherBench={name:'reconstructed-bench'};bind(fresh,resumed);
  let reader=resumed.createManagedCheckpoint(world),maxBytes=0;
  const options=(actor,table)=>({item:'vessel:1',bench:actor.labPickupBench?{id:'bench:1',value:table}:null});
  reader.restore(JSON.parse(JSON.stringify(writer.capture(options(source,bench)))) ,options(resumed,otherBench));
  for(let step=0;step<144;step++){
    if(step && step%11===0){
      const snapshot=JSON.parse(JSON.stringify(writer.capture(options(source,bench))));resumed.dispose();fresh=managedRigs();resumed=fresh.make();bind(fresh,resumed);
      otherBench={name:'another-reconstructed-bench'};reader=resumed.createManagedCheckpoint(world);
      reader.restore(snapshot,{item:'vessel:1',bench:snapshot.bench?{id:'bench:1',value:otherBench}:null});
    }
    const phase=Math.floor(step/6)%12,x=phase<2?0:phase===2?20:40;
    const motion=table=>phase<2?{lab:true,labWork:'carry',labReach:.7,labBench:table,labRoll:.2,labDie:phase===1}
      :phase===2?{office:true,officeSeat:.9,officeWork:'type',officeHands:[20,1,1,21,1,1]}
        :phase===3?{climb:.8,climbStride:step/10,climbSide:.2}:phase===4?{roll:.8,rollAngle:1.2,rollSide:.5}
          :phase===5?{swim:true}:phase===6?{groom:.7,groomSide:step%2?-1:1,sitLook:.2}:phase===7?{takeoff:.6}
            :phase===8?{landing:.3}:phase===9?{dragging:true,throwProgress:.4}:{};
    for(const [actor,table]of [[source,bench],[resumed,otherBench]]){
      actor.setForm(step%13<5?'code':'ape');
      if(step===60)actor.feed();if(step===66)actor.beat();if(step===72)actor.pound(true,.6);
      actor.poseManaged(.035+(step%3)/100,x,phase===7?2:0,step/13,.7,phase===7?2.8:phase===11?-1:0,
        phase===7,phase===10?'squeeze':false,phase===6?'sit':phase===11?'left':'',motion(table));
    }
    source.root.position.x=step%17===0?-0:source.root.position.x;
    resumed.root.position.x=step%17===0?-0:resumed.root.position.x;
    const a=writer.capture(options(source,bench)),b=reader.capture(options(resumed,otherBench));
    assert.equal(JSON.stringify(a),JSON.stringify(b),`next-step continuation ${step}`);
    const shapeA={},shapeB={};source.envelope(shapeA);resumed.envelope(shapeB);assert.deepEqual(shapeA,shapeB);
    maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(a)));
    const frozen=JSON.stringify(a);reader.restore(JSON.parse(frozen),options(resumed,otherBench));
    assert.equal(JSON.stringify(reader.capture(options(resumed,otherBench))),frozen,'idempotent restore does not advance animation');
    if(step%17===0)assert.ok(Object.is(resumed.root.position.x,-0),'JSON round trip retains signed zero');
  }
  assert.ok(maxBytes<=f.B.clankerState.MAX_BYTES);source.dispose();resumed.dispose();
});

test("managed continuation rejects unsupported or corrupt state and bindings before touching the destination",()=>{
  const f=managedRigs(),a=f.make(),b=f.make(),world='continuation-validation';
  a.poseManaged(.1,1,2,3,.6,2,true);const sender=a.createManagedCheckpoint(world),receiver=b.createManagedCheckpoint(world),snapshot=sender.capture();
  const before=JSON.stringify(receiver.capture());
  const edits=[s=>s.v++,s=>s.pose.world='other',s=>s.pose.profile[0]++,s=>s.values.pop(),s=>s.values[0]='unknown',
    s=>s.values[s.values.length-1]=Infinity,s=>s.values[0]=null,s=>delete s.values[3],s=>s.hands.push(0),s=>s.hands[0]=NaN,
    s=>s.grip+=.5,s=>s.bench='unbound',s=>s.pose.nodes[3][0]=3,s=>s.extra=true];
  for(const edit of edits){const bad=structuredClone(snapshot);edit(bad);assert.throws(()=>receiver.restore(bad),/continuation|projection/);assert.equal(JSON.stringify(receiver.capture()),before);}
  const accessor=structuredClone(snapshot);let reads=0;Object.defineProperty(accessor.values,'3',{get(){reads++;return 0;}});
  assert.throws(()=>receiver.restore(accessor),/continuation/);assert.equal(reads,0);
  const extra=structuredClone(snapshot);Object.defineProperty(extra.hands,'extra',{value:1});assert.throws(()=>receiver.restore(extra),/continuation/);
  a.walk([{x:1,z:2}]);assert.throws(()=>sender.capture(),/continuation/,'standalone route state is not silently discarded');
  b.onIdle=()=>{throw Error('must not call');};assert.throws(()=>receiver.restore(snapshot),/continuation/);b.onIdle=null;
  const unmanaged=f.B.agent.create({groundAt:()=>0});assert.throws(()=>unmanaged.createManagedCheckpoint(world),/unavailable/);
  for(const actor of[a,b,unmanaged])actor.dispose();
});

test("53 continuing Clanker rigs survive bounded roster and existing host storage packing without a prior frame",()=>{
  const f=managedRigs(),world='continuation-roster',actors=Array.from({length:53},f.make),codec=f.B.clankerState,storage=createCheckpointPack(64*1024);
  const records=actors.map((actor,index)=>{
    actor.poseManaged(.05,index/7,0,index/11,.7+index/10,0,false,false,'',{roll:.8,rollAngle:index/9,rollSide:.5});
    return {index,snapshot:actor.createManagedCheckpoint(world).capture()};
  });
  const packed=JSON.parse(JSON.stringify(codec.packRoster(world,records)));
  const saved=storage.pack(packed),restored=storage.unpack(JSON.parse(JSON.stringify(saved))),decoded=codec.unpackRoster(restored);
  assert.equal(JSON.stringify(decoded),JSON.stringify(records));
  assert.equal(JSON.stringify(codec.packRoster(world,[...records].reverse())),JSON.stringify(packed));
  assert.equal(JSON.stringify(codec.unpackRoster(codec.packRoster(world,[]))),'[]');
  for(const edit of [s=>s.v++,s=>s.world='other',s=>s.actors.pop(),s=>s.actors[1][0]=s.actors[0][0],s=>s.actors[0][1].pop(),
    s=>s.poses[0]='ff'+s.poses[0].slice(2),s=>s.poses.push('00'.repeat(2049)),s=>s.actors[0][2][0]=NaN]){
    const invalid=structuredClone(packed);edit(invalid);assert.throws(()=>codec.unpackRoster(invalid),/continuation|packet/);
  }
  const getter={snapshot:records[0].snapshot};let reads=0;Object.defineProperty(getter,'index',{get(){reads++;return 0;}});
  assert.throws(()=>codec.packRoster(world,[getter]),/continuation/);assert.equal(reads,0);
  assert.throws(()=>codec.packRoster('other',records),/continuation/);
  for(let i=0;i<actors.length;i++){
    const follower=f.make(),checkpoint=follower.createManagedCheckpoint(world);checkpoint.restore(decoded[i].snapshot);
    assert.equal(f.display(follower),f.display(actors[i]));follower.dispose();actors[i].dispose();
  }
});

test("mixed packet bounds reject malformed compression, expansion, counts, versions and corrupted or incomplete frames", () => {
  const f = managedRigs(), actor = f.make(), codec = globalThis.BL.npcPosePacket, world = "packet-bounds";
  const ooga = createNpcPose(1, 1)([{ index: 0, actor: rig() }]);
  const clankers = [{ index: 0, pose: actor.createPoseProjector(world).capture() }], packet = codec.pack(world, ooga, clankers);
  const edits = [b => new DataView(b).setUint32(4, 9, true), b => new DataView(b).setUint32(8, codec.EXPANDED + 1, true),
    b => new DataView(b).setUint32(8, 1, true), b => new Uint8Array(b)[12] ^= 1, b => new Uint8Array(b)[b.byteLength - 1] ^= 1,
    b => { const bytes = new Uint8Array(b); bytes[16] = 0; bytes[17] = 0; bytes[18] = 0; }];
  for (const edit of edits) { const bad = packet.slice(0); edit(bad); assert.throws(() => codec.unpack(bad), /packet/); }
  for (let end = 0; end < packet.byteLength; end += Math.max(1, Math.floor(packet.byteLength / 20))) assert.throws(() => codec.unpack(packet.slice(0, end)), /packet/);
  assert.throws(() => codec.unpack(new ArrayBuffer(codec.MAX + 1)), /packet/);
  assert.throws(() => codec.pack(world, ooga, [clankers[0], clankers[0]]), /packet/);
  assert.throws(() => codec.pack("other", ooga, clankers), /packet/);
  assert.throws(() => codec.pack(world, ooga, Array.from({ length: 128 }, (_, index) => ({ ...clankers[0], index }))), /packet/);
  // Valid legacy scalar records with incompressible mantissas must refuse the
  // complete frame, never exceed the byte cap or silently drop trailing actors.
  const noisy = new ArrayBuffer(16 + 128 * 112 * 4), header = new Uint32Array(noisy, 0, 4), values = new Float32Array(noisy, 16);
  header.set([2, 123, 128, 0]); let seed = 7;
  for (let i = 0; i < values.length; i++) { seed = Math.imul(seed, 1664525) + 1013904223 >>> 0; values[i] = seed / 4294967296; }
  for (let i = 0; i < 128; i++) values[i * 112] = i;
  assert.equal(globalThis.BL.npcAuthority.poses(noisy), true);
  assert.throws(() => codec.pack(world, noisy, []), /packet/);
  const empty = createNpcPose(1, 1)([]), full = Array.from({ length: 128 }, (_, index) => ({ index, pose: clankers[0].pose }));
  assert.equal(codec.unpack(codec.pack(world, empty, full)).clankers.length, 128);
  const heavy = structuredClone(clankers[0].pose);
  for (const row of heavy.nodes) for (let k = 3; k < 12; k++) row[k] = Math.PI / (k + 1);
  assert.equal(globalThis.BL.clankerPose.validate(heavy), true);
  assert.throws(() => codec.pack(world, empty, full.map(e => ({ ...e, pose: heavy }))), /packet/, "expanded-state cap applies even to highly compressible poses");
  assert.deepEqual(codec.unpack(packet).ooga, ooga, "bad input cannot poison the next independent full snapshot"); actor.dispose();
});
