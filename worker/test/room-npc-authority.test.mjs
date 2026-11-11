import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import * as authority from "../src/room-npc-authority.js";
import "../../src/js/npc-pose.js";
import "../../src/js/body-reclaim.js";
import { createNpcPose } from "../src/npc-pose.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";
import { publishHostPoses, claimHostRoom } from "../src/host-room.js";
import { compactSimulation } from "../src/simulation-checkpoint.js";
import { rig } from "./fixtures/npc-pose-rig.mjs";
import { managedRigs } from "./fixtures/clanker-pose-rig.mjs";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import { RoomBodyHandoff, ROOM_BODY } from "../src/room-body-handoff.js";
import { RoomBodyPresence, ROOM_BODY_PRESENCE } from "../src/room-body-presence.js";
import { ROOM_BODY_RELEASE, validateBodyRelease, validBodyQuiescence } from "../src/room-body-release.js";
import { SessionRegistry } from "../src/host-sessions.js";
import { stageWorldBody } from "../src/host-body-room.js";
import { HUB_WORLD_OBJECT, createRoomWorldNotifier } from "../src/room-world-events.js";
const wire = globalThis.BL.npcAuthority;
const frame = (x = 1, signature = 0) => {
  const data = new ArrayBuffer(16 + 112 * 4), h = new Uint32Array(data,0,4), f = new Float32Array(data,16);
  h.set([2,signature,1,0]); f[0]=0; f[1]=1; f[2]=x; f[12]=f[13]=f[14]=f[43]=1;
  return data;
};
const roomSource = readFileSync(new URL('../src/room.js',import.meta.url),'utf8').replace(/import\s+[\s\S]*?from\s+"[^"]+";/g,'').replace('export class Room','class Room')+'\nglobalThis.Room=Room;';
function host({ notifierFactory = createRoomWorldNotifier } = {}) {
  let now=100000, failWrite=0, ready=Promise.resolve(),lastBlock=ready,wraps=0,presenceReads=0; const accepted=[], alarms=[], stored=new Map();
  const names=['a','b','c',...Array.from({length:31},(_,i)=>'fixture'+i)];
  const socket=()=>({sent:[],closed:null,store:null,send(value){this.sent.push(typeof value==='string'?JSON.parse(value):value.slice(0));},close(code,reason){this.closed={code,reason};},serializeAttachment(a){this.store=structuredClone(a);},deserializeAttachment(){return structuredClone(this.store);}});
  class Clock extends Date {static now(){return now;}}
  class Response {constructor(body,init={}){this.status=init.status;this.body=body;this.webSocket=init.webSocket;}}
  const context={...protocol,...studioPolicy,...authority,sha256Hex,getPlayer,RoomBodyHandoff,ROOM_BODY,RoomBodyPresence,ROOM_BODY_PRESENCE,ROOM_BODY_RELEASE,validateBodyRelease,validBodyQuiescence,HUB_WORLD_OBJECT,createRoomWorldNotifier:notifierFactory,sfuClient:()=>null,
    packNpcSnapshot:r=>{wraps++;return authority.packNpcSnapshot(r);},CAST_ROWS:names.map(handle=>({handle,github_login:handle})),
    DurableObject:class {constructor(ctx,env){this.ctx=ctx;this.env=env;}},
    WebSocketPair:class {constructor(){this[0]=socket();this[1]=socket();}},Response,WebSocketRequestResponsePair:class{},
    URL,crypto,Date:Clock,Map,Set,ArrayBuffer,DataView,Uint8Array,setTimeout,clearTimeout,console,structuredClone};
  runInNewContext(roomSource,context);
  const storage={get:async k=>Array.isArray(k)?new Map(k.filter(x=>stored.has(x)).map(x=>[x,structuredClone(stored.get(x))])):structuredClone(stored.get(k)),
    put:async(k,v)=>stored.set(k,structuredClone(v)),delete:async k=>stored.delete(k),getAlarm:async()=>alarms.at(-1)??null,setAlarm:async t=>alarms.push(t),
    async transaction(fn){const copy=structuredClone(stored);const result=await fn({get:async k=>{if(k==='room-body-presence-v1')presenceReads++;return structuredClone(copy.get(k));},put:async(k,v)=>{if(failWrite && --failWrite === 0){throw Error('storage unavailable');}copy.set(k,structuredClone(v));},delete:async k=>copy.delete(k)});stored.clear();for(const [k,v]of copy)stored.set(k,v);return result;}};
  const ctx={storage,setWebSocketAutoResponse(){},blockConcurrencyWhile(fn){const result=ready.then(fn);lastBlock=result;ready=result.catch(()=>{});return result;},acceptWebSocket:ws=>accepted.push(ws),getWebSockets:()=>accepted.filter(ws=>!ws.closed),getWebSocketAutoResponseTimestamp:()=>null};
  return {at:t=>{now=t;},fail:(nth=1)=>{failWrite=nth;},stored,accepted,wraps:()=>wraps,presenceReads:()=>presenceReads,async room(enabled=true,mixed=false,body=false,movement=false){const r=new context.Room(ctx,enabled?{VIRTUAL_HOST_PREVIEW:'1',...(mixed?{VIRTUAL_HOST_MIXED_PREVIEW:'1'}:{}),...(body?{VIRTUAL_HOST_BODY_PREVIEW:'1'}:{}),...(movement?{VIRTUAL_HOST_MOVEMENT_PREVIEW:'1'}:{})}:{});await lastBlock;return r;},
    async join(r,id,version=true,body=false,presence=false,migration=false,motion=false,oogaMotion=false){const before=accepted.length;const response=await r.fetch({url:'https://test.invalid/room'+(version?'?npc-authority='+(version===true?1:version):'')+(body?'&body-reclaim=2':'')+(presence?'&body-presence=1':'')+(migration?'&body-migration=1':'')+(motion?'&body-motion=1':'')+(oogaMotion?'&ooga-motion=1':''),headers:new Headers({upgrade:'websocket','x-player-id':String(id),'x-player-login':names[id-1],'x-player-contributor':'0'})});return {ws:accepted[before],response};},
    send:(r,ws,msg)=>r.webSocketMessage(ws,JSON.stringify(msg))};
}
const start = (r, expected=0, epoch=1, owner='host-a') => r.configureNpcAuthority(expected,{mode:'server',world:'world-1',epoch,owner,runUntil:200000});
const ticket = (a,owner='host-a') => ({...a,owner});
const binary = ws => ws.sent.filter(v=>v instanceof ArrayBuffer);

test('Room commits authority before delivery, refuses browser writes, coalesces slow clients, and restores latest poses',async()=>{
  const h=host(),r=await h.room(),a=(await h.join(r,1)).ws,b=(await h.join(r,2)).ws;
  h.send(r,a,{t:'hub',on:true});h.send(r,b,{t:'hub',on:true});
  const state=await start(r);assert.equal(r.hostId,0);assert.equal(state.mode,'server');
  r.npcFrame(r.players.get(1),frame(999));assert.equal(r.lastNpc,null);
  await r.publishNpcSnapshot(ticket(state),1,frame(1));assert.equal(binary(a).length,1);assert.equal(binary(b).length,1);
  h.at(100250);await r.publishNpcSnapshot(ticket(state),2,frame(2));
  h.at(100500);await r.publishNpcSnapshot(ticket(state),3,frame(3));
  assert.equal(binary(a).length,1,'one outstanding frame, no intermediate queue');
  h.send(r,a,{t:'npc-ack',revision:state.revision,sequence:99});assert.equal(binary(a).length,1);
  h.send(r,a,{t:'npc-ack',revision:state.revision,sequence:1});assert.equal(binary(a).length,2);
  const read=wire.create();read.accept(state);assert.equal(new Float32Array(read.frame(binary(a).at(-1)),16)[2],3);
  await h.room(false);await h.room(false);
  const restored=await h.room(false);assert.equal(binary(b).length,1,'unacknowledged credit survives repeated hibernation wakes');assert.equal(restored.npcAuthority.sequence,3);assert.equal(restored.hostId,0,'removing preview flag cannot restore browser authority');
  const c=await h.join(restored,3);h.send(restored,c.ws,{t:'hub',on:true});
  assert.ok(c.ws.sent.findIndex(m=>m.t==='npc-authority') < c.ws.sent.findIndex(m=>m.t==='welcome'), 'authority precedes welcome/feature negotiation');
  assert.equal(binary(c.ws).length,1);assert.equal(new Float32Array(read.frame(binary(c.ws)[0]),16)[2],3);
  assert.ok(h.stored.get(authority.ROOM_NPC.key).frame.byteLength<=wire.MAX);
  // Current legacy transport release stays immediate; no grace delay on voice/occupancy cleanup.
  restored.webSocketClose(b);assert.equal(restored.players.has(2),false);assert.equal(restored.hostId,0);
});

test('Room failed writes, duplicate publications, takeover and explicit migration retain one authority',async()=>{
  const h=host(),r=await h.room(),a=(await h.join(r,1)).ws;h.send(r,a,{t:'hub',on:true});
  h.fail();await assert.rejects(start(r),/storage/);assert.equal(r.npcAuthority,null);assert.equal(r.hostId,1);
  const first=await start(r);h.fail();await assert.rejects(r.publishNpcSnapshot(ticket(first),1,frame()),/storage/);assert.equal(binary(a).length,0);
  await r.publishNpcSnapshot(ticket(first),1,frame());
  assert.equal(r.npcAuthorityStatus(ticket(first)).sequence,1,'read-only status reconciles a lost RPC reply');
  assert.equal(r.npcAuthorityStatus(ticket(first)).owns,true);
  assert.equal(r.npcAuthorityStatus({...ticket(first),owner:'other'}).owns,false);
  assert.equal((await r.publishNpcSnapshot(ticket(first),1,frame())).duplicate,true);
  await assert.rejects(r.publishNpcSnapshot(ticket(first),1,frame(2)),/fenced/);
  await assert.rejects(start(r,first.revision,2,'host-b'),/fenced/);
  h.at(110000);assert.equal((await r.publishNpcSnapshot(ticket(first),1,frame())).duplicate,true,'ambiguous commit can reconcile after lease expiry');await assert.rejects(r.publishNpcSnapshot(ticket(first),2,frame()),/fenced/);
  const second=await start(r,first.revision,2,'host-b');
  await assert.rejects(r.publishNpcSnapshot(ticket(first),2,frame()),/fenced/);
  await assert.rejects(r.configureNpcAuthority(first.revision,{...ticket(first),mode:'browser'}),/fenced/);
  await r.publishNpcSnapshot(ticket(second,'host-b'),1,frame(4));
  const released=await r.configureNpcAuthority(second.revision,{...ticket(second,'host-b'),mode:'browser'});
  assert.equal(released.mode,'browser');assert.equal(r.hostId,1);
  const control=a.sent.filter(v=>v.t==='host'||v.t==='npc-authority').slice(-2);assert.deepEqual(control.map(v=>v.t),['host','npc-authority']);
  await assert.rejects(r.publishNpcSnapshot(ticket(second,'host-b'),2,frame()),/fenced/);
});

test('explicit Room reacquisition commits before notification, preserves rate debt and leaves voice connected', async () => {
  const h = host(), r = await h.room(), ws = (await h.join(r, 1)).ws;
  const first = await start(r); await r.publishNpcSnapshot(ticket(first), 1, frame());
  const browser = await r.configureNpcAuthority(first.revision, { ...ticket(first), mode: 'browser' });
  const claim = { v: 1, world: 'world-1', previousEpoch: 1, previousOwner: 'host-a', epoch: 2,
    owner: 'host-b', runUntil: 200000, cleanup: false };
  r.players.get(1).voice = 'retained-voice';
  const sent = ws.sent.length, before = structuredClone(h.stored);
  h.fail(); await assert.rejects(r.reacquireNpcAuthority(browser.revision, claim, 'legacy-1'), /storage/);
  assert.deepEqual(h.stored, before); assert.equal(ws.sent.length, sent);
  const recovered = await r.reacquireNpcAuthority(browser.revision, claim, 'legacy-1');
  assert.equal(recovered.epoch, 2); assert.equal(r.hostId, 0);
  assert.equal(r.players.get(1).voice, 'retained-voice'); assert.equal(ws.closed, null);
  await assert.rejects(r.publishNpcSnapshot(ticket(recovered, 'host-b'), 2, frame()), /fenced/);
  h.at(100250); await r.publishNpcSnapshot(ticket(recovered, 'host-b'), 2, frame());
  const restored = await h.room();
  assert.equal(restored.npcAuthority.owner, 'host-b');
  await assert.rejects(restored.reacquireNpcAuthority(browser.revision, claim, 'legacy-1'), /fenced/);
  await assert.rejects(restored.publishNpcSnapshot(ticket(first), 3, frame()), /fenced/);
});

test('released Room recovery refuses incompatible occupants, disabled formats and retained body rollback', async () => {
  const h = host(), r = await h.room(), first = await start(r);
  const browser = await r.configureNpcAuthority(first.revision, { ...ticket(first), mode: 'browser' });
  const claim = { v: 1, world: 'world-1', previousEpoch: 1, previousOwner: 'host-a', epoch: 2,
    owner: 'host-b', runUntil: 200000, cleanup: false };
  const legacy = (await h.join(r, 1, false)).ws;
  await assert.rejects(r.reacquireNpcAuthority(browser.revision, claim, 'legacy-1'), /incompatible/);
  await r.webSocketClose(legacy); legacy.close(1000, 'closed');
  await assert.rejects(r.reacquireNpcAuthority(browser.revision, claim, 'mixed-1'), /format disabled/);
  r.bodyPresenceRequired = true;
  await assert.rejects(r.reacquireNpcAuthority(browser.revision, claim, 'legacy-1'), /body recovery preview/);
  const disabled = await h.room(false);
  await assert.rejects(disabled.reacquireNpcAuthority(browser.revision, claim, 'legacy-1'), /preview disabled/);
  assert.equal(h.stored.get(authority.ROOM_NPC.key).mode, 'browser');
});

test('Room mixed clients and unconfigured preview cannot silently start server authority',async()=>{
  const h=host(),off=await h.room(false);await assert.rejects(start(off),/disabled/);
  const r=await h.room(),old=(await h.join(r,1,false)).ws;
  await assert.rejects(start(r),/incompatible/);assert.equal(r.npcAuthority,null);
  r.webSocketClose(old);old.close(1000,'closed');
  await start(r);assert.equal((await h.join(r,2,false)).response.status,409);
  const invalid=frame();new Uint32Array(invalid,0,4)[3]=1;
  await assert.rejects(r.publishNpcSnapshot(ticket(r.npcAuthority),1,invalid),/invalid/);
  h.stored.set(authority.ROOM_NPC.key,{...h.stored.get(authority.ROOM_NPC.key),v:2});
  await assert.rejects(h.room(),/invalid/);
});

test('Room takeover RPC commits its fence before notifying clients, persists rate debt and rejects delayed old frames', async () => {
  const h = host(), r = await h.room(), a = (await h.join(r, 1)).ws;
  h.send(r, a, { t: 'hub', on: true });
  const first = await start(r), old = ticket(first);
  h.at(109950); await r.publishNpcSnapshot(old, 1, frame());
  const intent = { v: 1, world: 'world-1', previousOwner: 'host-a', previousEpoch: 1,
    owner: 'host-b', epoch: 2, runUntil: 200000, cleanup: false };
  h.at(110001);
  const off = await h.room(false); await assert.rejects(off.fenceNpcAuthority(intent), /preview disabled/);
  h.fail(); await assert.rejects(r.fenceNpcAuthority(intent), /storage/);
  assert.equal(r.npcAuthority.epoch, 1); assert.equal(binary(a).length, 1);
  const next = await r.fenceNpcAuthority(intent), replacement = ticket(next, 'host-b');
  assert.equal(next.epoch, 2); assert.equal(r.npcAuthority.frame, null); assert.equal(r.npcAuthority.gateAt, 110200);
  assert.equal(binary(a).length, 1, 'fencing emits no fabricated replacement pose');
  assert.equal(a.sent.filter(m => m.t === 'npc-authority').at(-1).authority.epoch, 2);
  await assert.rejects(r.publishNpcSnapshot(old, 1, frame()), /fenced/);
  await assert.rejects(r.publishNpcSnapshot(replacement, 1, frame(2)), /fenced/);
  const restored = await h.room(); assert.equal(restored.npcAuthority.gateAt, 110200);
  assert.deepEqual(await restored.fenceNpcAuthority(intent), next, 'lost replies do not allocate another revision');
  h.at(110200); await restored.publishNpcSnapshot(replacement, 1, frame(2));
  assert.equal(binary(a).length, 2);
  await restored.fenceNpcAuthority(intent); assert.equal(binary(a).length, 2, 'duplicate fence cannot grant new delivery credit');
});

test('mixed authority is explicit, world-bound and version-fenced; loading a codec does not upgrade a client',()=>{
  const a={v:2,format:'mixed-1',revision:1,mode:'server',world:'world-1',epoch:1};
  const packet=globalThis.BL.npcPosePacket.pack(a.world,frame(),[]);
  assert.equal(wire.descriptor(a),false);assert.equal(wire.create().accept(a),false);
  assert.throws(()=>wire.pack(a,1,packet),/invalid/);
  const receiver=wire.create({mixed:true});assert.ok(receiver.accept(a));
  const packed=wire.pack(a,1,packet,true);assert.deepEqual(receiver.frame(packed),packet);
  assert.deepEqual(receiver.frame(packed),packet);
  const invalids=[b=>new DataView(b).setUint32(4,1,true),b=>new DataView(b).setFloat64(24,0,true),
    b=>new DataView(b).setFloat64(16,2,true),b=>new Uint8Array(b)[b.byteLength-1]^=1];
  for(const edit of invalids){const bad=packed.slice(0);edit(bad);assert.equal(receiver.frame(bad),null);}
  assert.equal(wire.posesFor(a,frame(),true),false);
  assert.equal(wire.posesFor(a,globalThis.BL.npcPosePacket.pack('other',frame(),[]),true),false);
  assert.equal(receiver.accept({...a,v:1,format:undefined}),false,'format cannot change within a revision');
  assert.equal(receiver.accept({...a,format:'future'}),false);
  assert.ok(receiver.accept({...a,revision:2,epoch:2}));assert.equal(receiver.frame(packed),null);
  assert.ok(receiver.accept({v:1,revision:3,mode:'browser',world:null,epoch:0}));
  assert.equal(receiver.frame(packed),null);
});

test('mixed Room preview gates occupants and persists exact 106-actor snapshots with bounded delivery across restart',async t=>{
  const h=host(),plain=await h.room(),claim={mode:'server',format:'mixed-1',world:'world-1',epoch:1,owner:'host-a',runUntil:200000};
  await assert.rejects(plain.configureNpcAuthority(0,claim),/disabled/);
  const r=await h.room(true,true),old=(await h.join(r,1)).ws;
  await assert.rejects(r.configureNpcAuthority(0,claim),/incompatible/);
  const a=(await h.join(r,1,2)).ws,b=(await h.join(r,2,2)).ws;
  assert.equal(old.closed.reason,'replaced');h.send(r,a,{t:'hub',on:true});h.send(r,b,{t:'hub',on:true});
  await assert.rejects(r.configureNpcAuthority(0,{...claim,format:'future'}),/invalid/);
  const selected=await r.configureNpcAuthority(0,claim);assert.equal(selected.v,2);assert.equal(selected.format,'mixed-1');
  const watchers=[a,b];for(let id=3;id<=32;id++){const ws=(await h.join(r,id,2)).ws;watchers.push(ws);h.send(r,ws,{t:'hub',on:true});}
  assert.equal((await h.join(r,33,2)).response.status,409,'fanout cap is retained');
  assert.equal((await h.join(r,1,1)).response.status,409);assert.equal(r.players.get(1).ws,a,'incompatible duplicate cannot evict owner');
  assert.equal((await h.join(r,3,5)).response.status,409);
  assert.equal(r.players.get(3).ws,watchers[2],'unknown protocol cannot evict a compatible owner');
  const f=managedRigs(),rigs=Array.from({length:53},f.make),encode=createNpcPose(123,53);
  const make=n=>{
    const ooga=encode(rigs.map((_,index)=>{const actor=rig();actor.root.position.x=index/7+n;return {index,actor};}));
    const clankers=rigs.map((actor,index)=>{actor.poseManaged(.05,index/7+n,0,index/11,index/9,2.8,false);return {index,pose:actor.createPoseProjector(claim.world).capture()};});
    return globalThis.BL.npcPosePacket.pack(claim.world,ooga,clankers);
  };
  const first=make(1),owner=ticket(selected);assert.ok(first.byteLength<=32768);
  await assert.rejects(r.publishNpcSnapshot({...owner,v:1,format:undefined},1,first),/invalid/);
  await assert.rejects(r.publishNpcSnapshot(owner,1,frame()),/invalid/);
  await assert.rejects(r.publishNpcSnapshot(owner,1,globalThis.BL.npcPosePacket.pack('other',frame(),[])),/invalid/);
  h.fail();await assert.rejects(r.publishNpcSnapshot(owner,1,first),/storage/);assert.equal(binary(a).length,0);
  await r.publishNpcSnapshot(owner,1,first);const packed=r.npcPacked;
  assert.equal(h.wraps(),1,'32 viewers share one checked envelope');for(const ws of watchers)assert.equal(binary(ws).length,1);
  const firstBytes=watchers.flatMap(binary).reduce((sum,data)=>sum+data.byteLength,0);assert.equal(firstBytes,32*(first.byteLength+32));
  assert.equal((await r.publishNpcSnapshot(owner,1,first)).duplicate,true);
  const readers=[wire.create({mixed:true}),wire.create({mixed:true})];for(const reader of readers)assert.ok(reader.accept(selected));
  assert.deepEqual(readers[0].frame(binary(a)[0]),first);assert.deepEqual(readers[1].frame(binary(b)[0]),first);
  const second=make(2);h.at(100250);await r.publishNpcSnapshot(owner,2,second);
  const latest=make(3);h.at(100500);await r.publishNpcSnapshot(owner,3,latest);
  assert.equal(binary(a).length,1);assert.equal(binary(b).length,1);assert.notEqual(r.npcPacked,packed);
  h.send(r,a,{t:'npc-ack',revision:selected.revision,sequence:1});assert.equal(binary(a).length,2);
  assert.equal(h.wraps(),2,'skipped intermediate frames are not wrapped or queued');
  assert.deepEqual(readers[0].frame(binary(a).at(-1)),latest);
  const decoded=globalThis.BL.npcPosePacket.unpack(readers[0].frame(binary(a).at(-1)));
  assert.equal(new Uint32Array(decoded.ooga,0,4)[2],53);assert.equal(decoded.clankers.length,53);
  const follower=f.make();follower.createPoseProjector(claim.world).apply(decoded.clankers[52].pose);assert.equal(f.display(follower),f.display(rigs[52]));
  const restored=await h.room(false);await h.room(false);assert.equal(binary(b).length,1,'no renewed credit during hibernation');
  assert.equal(restored.hostId,0);assert.deepEqual(h.stored.get(authority.ROOM_NPC.key).frame,latest);
  await assert.rejects(restored.publishNpcSnapshot(owner,4,latest),/disabled/);
  const noMixed=await h.room();await assert.rejects(noMixed.publishNpcSnapshot(owner,4,latest),/mixed preview disabled/);
  const late=(await h.join(restored,3,2)).ws;h.send(restored,late,{t:'hub',on:true});
  const lateReader=wire.create({mixed:true});lateReader.accept(selected);assert.deepEqual(lateReader.frame(binary(late)[0]),latest);
  const enabled=await h.room(true,true);h.at(110500);
  assert.equal((await enabled.publishNpcSnapshot(owner,3,latest)).duplicate,true,'lost reply reconciles after lease expires');
  const replacement=await enabled.configureNpcAuthority(selected.revision,{...claim,epoch:2,owner:'host-b'});
  await assert.rejects(enabled.publishNpcSnapshot(owner,4,latest),/invalid/);
  await enabled.publishNpcSnapshot(ticket(replacement,'host-b'),1,latest);
  assert.equal(binary(b).length,2,'new revision permits exactly one new snapshot');
  const releaseOnly=await h.room();
  const released=await releaseOnly.configureNpcAuthority(replacement.revision,{...ticket(replacement,'host-b'),mode:'browser'});
  assert.equal(released.v,1);assert.equal(released.format,undefined);assert.notEqual(releaseOnly.hostId,0);
  assert.equal(releaseOnly.npcPacked,null,'explicit release clears the retained mixed wrapper without the mixed preview flag');
  // Old durable records stay readable; unknown versions still fail closed.
  authority.validateNpcAuthority(h.stored.get(authority.ROOM_NPC.key));
  h.stored.set(authority.ROOM_NPC.key,{...h.stored.get(authority.ROOM_NPC.key),v:3});await assert.rejects(h.room(),/invalid/);
  t.diagnostic(JSON.stringify({scope:'authored 106-actor pose, actual Room/codec, mocked storage and sockets',viewers:32,firstPacketBytes:first.byteLength,firstFanoutBytes:firstBytes,firstEnvelopeValidations:1}));
  follower.dispose();for(const actor of rigs)actor.dispose();
});

// Actual browser networking, with only account/voice/platform services authored.
function client({manual=false,bodyPresencePreview=false,bodyMigrationPreview=false,bodyMovementPreview=false}={}){
  let tick=1000;
  const sockets=[],sent=[],timers=[];class Socket{static OPEN=1;constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(v){sent.push(typeof v==='string'&&v!=='ping'?JSON.parse(v):v);}close(){this.readyState=3;}}
  const BL={...globalThis.BL,voice:{setPeers(){},restart(){},stop(){}},characters:{get:()=>null},contributors:{addTemporary(){}},donations:{},accountIdentities:{accountForId:()=>null,accountForHandle:()=>null},pilot:{}};
  const context={window:{BL,setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){},setInterval:()=>1,clearInterval(){}},document:{hidden:false,cookie:'',addEventListener(){},removeEventListener(){}},
    location:{protocol:'https:',host:'test.invalid',pathname:'/',search:''},fetch:async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({player:{id:1,login:'a',display:'a'}})}),AbortSignal,WebSocket:Socket,performance:{now:()=>manual?tick:tick+=200},Date,ArrayBuffer,DataView,Uint8Array,Uint32Array,Float32Array,URLSearchParams};
  runInNewContext(readFileSync(new URL('../../src/js/net.js',import.meta.url),'utf8').replace('const BODY_PRESENCE_PREVIEW = false;', `const BODY_PRESENCE_PREVIEW = ${bodyPresencePreview};`).replace('const BODY_MIGRATION_PREVIEW = false;', `const BODY_MIGRATION_PREVIEW = ${bodyMigrationPreview};`).replace('const BODY_MOVEMENT_PREVIEW = false,', `const BODY_MOVEMENT_PREVIEW = ${bodyMovementPreview},`),context);
  return {net:BL.net,sockets,sent,BL,at:t=>{tick=t;},reconnect:()=>timers.at(-1)()};
}
test('actual net retains authority through close, refuses stale epochs and legacy sends, and acknowledges resumed snapshots',async()=>{
  const c=client();await c.net.start();const ws=c.sockets[0];assert.ok(ws.url.endsWith('?npc-authority=1'));
  const send=m=>ws.onmessage({data:typeof m==='object'&&!(m instanceof ArrayBuffer)?JSON.stringify(m):m});
  const a={v:1,revision:1,mode:'server',world:'world-1',epoch:1};
  send({t:'npc-authority',authority:a});
  assert.equal(c.net.state.npcAuthority.mode,'server','initial authority is latched before welcome');
  send({t:'welcome',you:{id:1},players:[],features:[],host:1,now:1000});
  const packed=wire.pack(a,1,frame());send(packed);assert.equal(c.sent.at(-1).t,'npc-ack');
  const count=c.sent.length;c.net.sendNpc(frame());assert.equal(c.sent.length,count);
  ws.onclose();assert.equal(c.net.state.npcAuthority.mode,'server');
  c.reconnect();const resumed=c.sockets.at(-1);
  resumed.onmessage({data:JSON.stringify({t:'welcome',you:{id:1},players:[],features:[],host:1,now:1100})});
  assert.equal(c.net.state.npcAuthority.mode,'server','older welcome cannot downgrade a retained authority');
  resumed.onmessage({data:packed});assert.equal(c.sent.at(-1).t,'npc-ack');assert.ok(c.net.npcFrame);
  resumed.onmessage({data:JSON.stringify({t:'npc-authority',authority:{v:1,revision:2,mode:'browser',world:null,epoch:0}})});
  assert.equal(c.net.state.npcAuthority.mode,'browser');
  resumed.onmessage({data:JSON.stringify({t:'npc-authority',authority:{...a,v:2,revision:3}})});
  assert.equal(c.net.state.npcAuthority.mode,'server','unknown newer protocol freezes instead of running browser AI');
  resumed.onmessage({data:JSON.stringify({t:'npc-authority',authority:{v:1,revision:2,mode:'browser',world:null,epoch:0}})});
  assert.equal(c.net.state.npcAuthority.mode,'server','an older release cannot clear an incompatible fence');
  // The same shared parser also rejects changed duplicate data and stale epochs.
  const tracker=wire.create();assert.ok(tracker.accept(a));assert.ok(tracker.frame(packed));assert.ok(tracker.frame(packed),'pose-only duplicate can be acknowledged after reconnect');
  const changed=wire.pack(a,1,frame(8));assert.equal(tracker.frame(changed),null);
  const newer={...a,revision:2,epoch:2};assert.ok(tracker.accept(newer));assert.equal(tracker.frame(packed),null);
  assert.equal(tracker.accept({v:1,revision:1,mode:'browser',world:null,epoch:0}),false);
  assert.ok(tracker.accept({v:1,revision:3,mode:'browser',world:null,epoch:0}));
  c.net.dispose();
});

test('net welcome stops at a subscriber disposal or replacement before replaying state or restarting voice', async () => {
  const stopped = client({ manual: true });
  stopped.net.subscribe(state => { if (state.room === 'connecting') stopped.net.dispose(); });
  await stopped.net.start();
  assert.equal(stopped.sockets.length, 0, 'a connecting subscriber can dispose before socket creation');
  assert.equal(stopped.net.state.room, 'off');
  for (const replace of [false, true]) {
    const c = client({ manual: true }); await c.net.start();
    const old = c.sockets[0]; let restarted = 0;
    c.BL.voice.restart = () => { restarted++; };
    c.net.subscribe(state => {
      if (state.room !== 'live') return;
      c.net.dispose();
      if (replace) c.net.rejoin();
    });
    const before = c.sent.length;
    old.onmessage({ data: JSON.stringify({ t: 'welcome', you: { id: 1 }, players: [], features: [],
      host: 0, now: 1000, connectionToken: 'old-connection' }) });
    assert.equal(c.net.state.room, replace ? 'connecting' : 'off');
    assert.equal(c.sent.length, before, 'the old welcome cannot send cached state to a replacement');
    assert.equal(restarted, 0, 'the old welcome cannot restart voice after disposal');
    if (replace) {
      const fresh = c.sockets.at(-1); assert.notEqual(fresh, old);
      fresh.onmessage({ data: JSON.stringify({ t: 'welcome', you: { id: 1 }, players: [], features: [],
        host: 0, now: 1100, connectionToken: 'new-connection' }) });
      assert.equal(c.net.state.room, 'live'); assert.equal(restarted, 1);
      assert.ok(c.sent.some(m => m?.t === 'body'), 'the replacement replays only after its own welcome');
    }
    c.net.dispose();
  }
});

test('actual net negotiates Ooga capture, retries one sample until host ACK and suppresses unchanged accepted state', async () => {
  const c = client({ manual: true, bodyMovementPreview: true }), codec = globalThis.BL.oogaMotion;
  c.BL.characters.get = name => name === 'a' ? { handle: 'a' } : null;
  await c.net.start(); const ws = c.sockets[0], send = m => ws.onmessage({ data: JSON.stringify(m) });
  assert.ok(ws.url.includes('ooga-motion=1'));
  send({ t: 'welcome', you: { id: 1 }, players: [], features: [globalThis.BL.bodyReclaim.FEATURE,
    globalThis.BL.bodyMotion.FEATURE, codec.FEATURE], host: 0, now: 1000, connectionToken: 'fixture-connection' });
  let captured = 0;
  const checkpoint = globalThis.BL.oogaBody.codec({ world: 'world-1', profile: 'standing-1', name: 'a' }).encode(
    { x: 1, y: 8, z: 3, yaw: .5 }, { weapon: null, mode: 'carry', primaryOwned: false,
      secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false });
  c.net.bodyReclaim.setAdapter({ prepare: () => ({}), preflight: () => true, apply: () => true,
    activate: () => true, release() {}, capture() { captured++; return checkpoint; } });
  const request = '8'.repeat(32), now = Math.ceil(c.net.serverNow());
  send({ t: 'body-prepare', v: 2, request, accountId: 1, bodyId: 'player:1', kind: 'ooga',
    world: 'world-1', epoch: 1, expiresAt: now + 10000 });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const transfer = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 1,
    at: now, expiresAt: now + 10000, resetResources: 'defaults',
    view: { accountId: 1, bodyId: 'player:1', kind: 'ooga', generation: 1, state: 'offered', deadline: now + 60000 }, checkpoint };
  send({ t: 'body-grant', request, transfer });
  send({ t: 'body-active', request, transfer: { ...transfer, revision: 2, expiresAt: now + 1000,
    view: { ...transfer.view, state: 'starting' } } });
  c.net.sendPose(1, 8, 3, .5); assert.equal(captured, 0);
  send({ t: 'body-live', request, epoch: 1, generation: 1, revision: 2 });
  c.sent.length = 0; c.net.sendPose(1, 8, 3, .5);
  const message = c.sent.at(-1); assert.equal(message.t, codec.TYPE); assert.equal(captured, 1);
  assert.equal(codec.unpack(message.data, checkpoint).position.y, 8);
  c.at(1100); c.net.sendPose(1, 8, 3, .5); assert.equal(c.sent.length, 1);
  checkpoint.position.y = 10; c.at(1250); c.net.sendPose(1, 10, 3, .5);
  assert.deepEqual(c.sent.at(-1), message); assert.equal(captured, 1, 'pending sample is immutable');
  send({ t: 'body-motion-ack', request, generation: 1, sequence: 1 });
  c.at(1500); c.net.sendPose(1, 10, 3, .5);
  assert.equal(c.sent.at(-1).sequence, 2); assert.equal(codec.unpack(c.sent.at(-1).data, checkpoint).position.y, 10);
  send({ t: 'body-motion-ack', request, generation: 1, sequence: 2 });
  const count = c.sent.length; c.at(1750); c.net.sendPose(1, 10, 3, .5); assert.equal(c.sent.length, count);
  c.net.setMuted(true); assert.equal(c.sent.at(-1).t, 'mute');
  c.net.dispose();
});

test('actual net gates old pose replay until body apply and matching activation, without changing voice', async () => {
  // Other networking fixtures advance 200ms on every clock read. This exchange
  // uses elapsed time, so clock reads themselves must not consume its budget.
  const c=client({manual:true,bodyMovementPreview:true}); await c.net.start(); const ws=c.sockets[0], send=m=>ws.onmessage({data:JSON.stringify(m)});
  const welcome=features=>send({t:'welcome',you:{id:1},players:[],features,host:1,now:1000,connectionToken:'fixture-connection'});
  const visual=[0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,31,31], rest=[0,2,255,0,0,0];
  welcome([]); c.net.setBody('a'); c.net.sendPose(51,0,0,0); assert.equal(c.sent.at(-1).t,'pose');
  c.sent.length=0; welcome([globalThis.BL.bodyReclaim.FEATURE,globalThis.BL.bodyMotion.FEATURE,globalThis.BL.oogaMotion.FEATURE]);
  assert.equal(c.sent.some(m=>m.t==='body'||m.t==='pose'),false,'welcome cannot replay cached body or pose');
  c.net.setMuted(true); assert.equal(c.sent.at(-1).t,'mute');
  let applied=0, enabled=0, released=0, captured=0;
  const checkpoint=globalThis.BL.oogaBody.codec({world:'world-1',profile:'standing-1',name:'a'}).encode(
    {x:51,y:0,z:0,yaw:0},{weapon:'gun',mode:'combat',primaryOwned:true,secondaryOwned:true,
      selectedSlot:2,unlimited:false,jetpack:true,jetpackOwned:true});
  c.net.bodyReclaim.setAdapter({prepare:async()=>({}),preflight:()=>true,apply(){applied++;return true;},activate(){enabled++;return true;},release(){released++;},capture(){captured++;return checkpoint;}});
  const now=Math.ceil(c.net.serverNow()), request='c'.repeat(32);
  send({t:'body-prepare',v:2,request,accountId:1,bodyId:'a',kind:'ooga',world:'world-1',epoch:3,expiresAt:now+5000});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(c.sent.at(-1).t,'body-ready');
  const transfer={v:1,protocol:'host-session-v5',world:'world-1',epoch:3,revision:17,at:now,expiresAt:now+5000,
    resetResources:'defaults',view:{accountId:1,bodyId:'a',kind:'ooga',generation:8,state:'offered',deadline:now+60000},checkpoint};
  send({t:'body-grant',request,transfer}); assert.equal(c.sent.at(-1).t,'body-applied'); assert.equal(applied,0);
  const count=c.sent.length; c.net.sendPose(51,0,0,0,null,1,2,visual,rest); assert.equal(c.sent.length,count);
  const final={...transfer,revision:18,expiresAt:now+1000,view:{...transfer.view,state:'starting'}};
  send({t:'body-active',request,transfer:final}); assert.equal(applied,1); assert.equal(enabled,0);
  c.net.sendPose(51,0,0,0); assert.equal(c.sent.at(-1).t,'body-started');
  send({t:'body-live',request,epoch:3,generation:7,revision:18}); assert.equal(enabled,0);
  send({t:'body-live',request,epoch:3,generation:8,revision:18}); assert.equal(enabled,1);
  c.net.sendPose(51,0,0,0,null,1,2,visual,rest); assert.equal(c.sent.at(-1).t,globalThis.BL.oogaMotion.TYPE,'fresh authenticated capture is not suppressed by old cache');
  assert.equal(captured,1); assert.equal(c.sent.at(-1).request,request); assert.equal(c.sent.at(-1).sequence,1);
  assert.deepEqual(globalThis.BL.oogaMotion.unpack(c.sent.at(-1).data,checkpoint),checkpoint);
  assert.equal(c.sent.some(m=>m.t==='pose'),false,'reclaim never downgrades to legacy pose');
  const activeCount=c.sent.length; c.net.setBody('other'); c.net.sendPose(0,0,0,0); assert.equal(c.sent.length,activeCount);
  ws.onclose(); assert.equal(released,1); c.reconnect();
  c.sockets.at(-1).onmessage({data:JSON.stringify({t:'welcome',you:{id:1},players:[],features:[],now:1100,connectionToken:'older-room'})});
  const legacyCount=c.sent.length; c.net.sendPose(2,0,0,0); assert.equal(c.sent.length,legacyCount,'older Room cannot downgrade retained requirement');
  c.net.dispose();
});

test('actual net fences stale compatible frames after a newer incompatible mixed assignment',async()=>{
  const c=client();await c.net.start();const ws=c.sockets[0];
  const send=m=>ws.onmessage({data:m instanceof ArrayBuffer?m:JSON.stringify(m)});
  const old={v:1,revision:1,mode:'server',world:'world-1',epoch:1},mixed={...old,v:2,format:'mixed-1',revision:2,epoch:2};
  send({t:'npc-authority',authority:old});send({t:'welcome',you:{id:1},players:[],features:[],host:0,now:1000});
  const oldFrame=wire.pack(old,1,frame());send(oldFrame);assert.ok(c.net.npcFrame);
  const count=c.sent.length;
  send({t:'npc-authority',authority:mixed});assert.equal(c.net.state.npcAuthority.incompatible,true);assert.equal(c.net.npcFrame,null);
  send(oldFrame);send(wire.pack(mixed,1,globalThis.BL.npcPosePacket.pack(mixed.world,frame(),[]),true));
  assert.equal(c.sent.length,count,'neither stale nor unsupported snapshots get an acknowledgement');assert.equal(c.net.npcFrame,null);
  send({t:'npc-authority',authority:{v:1,revision:2,mode:'browser',world:null,epoch:0}});
  assert.equal(c.net.state.npcAuthority.incompatible,true);
  ws.onclose();c.reconnect();assert.ok(c.sockets.at(-1).url.endsWith('?npc-authority=1'));
  c.sockets.at(-1).onmessage({data:JSON.stringify({t:'npc-authority',authority:{v:1,revision:3,mode:'browser',world:null,epoch:0}})});
  assert.equal(c.net.state.npcAuthority.mode,'browser');c.net.dispose();
});

test('actual npc-sync freezes before crew update, including no frame, mismatched roster and reconnect',()=>{
  const BL={...globalThis.BL,math:{quat:{create:()=>new Float32Array([0,0,0,1])},fnv1a:()=>123},scene:{addChild(){},removeChild(){}},
    net:{state:{room:'live',selfId:1,hostId:1,followers:1,npcVersion:0,npcAuthority:{mode:'server',revision:1}},npcFrame:null,sendNpc(){throw Error('browser must not publish');}}};
  const cave=()=>({contributor:{},traits:{name:'a'},parts:{armL:{},armR:{}},root:{},sleepWeapons:{},puppet:false});
  const resumed=[];
  const a=cave(),b=cave(),player=cave(),crew={list:[a,b],player,workSites:[],resumeFromHost(actor){
    assert.ok(actor===a || actor===b,'only roster NPCs resume');
    assert.equal(actor.puppet,false,'release clears the puppet before resuming');
    resumed.push(actor);
  }};
  for (const name of ['npc-lab-pose', 'npc-clanker-sync', 'npc-sync'])
    runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`,import.meta.url),'utf8'),{window:{BL},TextEncoder,TextDecoder,ArrayBuffer,Uint32Array,Float32Array,Uint8Array,Int32Array});
  const sync=BL.npcSync.create({crew,fx:{},onPlan(){},onHit(){},onModelChange(){}});
  assert.equal(a.puppet,true);assert.equal(b.puppet,true);assert.equal(player.puppet,false);
  sync.update(.05);assert.equal(sync.role,'server');
  BL.net.state.room='connecting';BL.net.state.hostId=0;a.puppet=b.puppet=false;sync.prepare();
  assert.equal(a.puppet,true);assert.equal(b.puppet,true);assert.equal(player.puppet,false);
  BL.net.npcFrame=frame(1,999);BL.net.state.npcVersion++;sync.update(.05);
  assert.equal(a.puppet,true,'incompatible roster cannot enable local AI');assert.equal(b.puppet,true);assert.equal(player.puppet,false);
  BL.net.state.npcAuthority={mode:'browser',revision:2};sync.prepare();sync.update(.05);
  assert.equal(a.puppet,false);assert.equal(b.puppet,false);assert.equal(player.puppet,false);
  assert.deepEqual(resumed,[a,b,a,b],'host replacement and authority release each return the prior puppets once');
  sync.dispose();
  assert.equal(resumed.length,4,'disposing an already released crew does not resume it twice');
});

test('committed mixed host poses reach two clients and a late join with exact Clanker recovery and explicit format fencing',async t=>{
  const h=host(),room=await h.room(true,true),a=(await h.join(room,1,2)).ws,b=(await h.join(room,2,2)).ws;
  h.send(room,a,{t:'hub',on:true});h.send(room,b,{t:'hub',on:true});
  const f=managedRigs(),actors=Array.from({length:53},f.make),states=f.B.clankerState,encode=createNpcPose(123,53);
  let world,controllers,now=100000,saved,failWrite=false,wrongWorld=false;
  const capture=()=>JSON.parse(JSON.stringify(states.packRoster(world,controllers.map((c,index)=>({index,snapshot:c.capture()})),true)));
  const source={version:'mixed-bridge-fixture',initial:()=>({x:0,rigs:capture()}),validate(s){return Number.isFinite(s.x)&&states.unpackRoster(s.rigs).length===53;},
    step(s,ms){const records=states.unpackRoster(s.rigs);s.x++;
      for(let i=0;i<53;i++){controllers[i].restore(records[i].snapshot);actors[i].poseManaged(ms/1000,i/7+s.x,0,i/11,.7,2.8,false,false,'',{climb:.8,climbStride:s.x/10+i/7});}s.rigs=capture();},
    project:()=>({npcs:[],hub:{pile:0}}),npcFor:()=>null,handoff:()=>false,
    poses(s,format){const ooga=encode(actors.map((_,index)=>{const actor=rig();actor.root.position.x=s.x+index/7;return {index,actor};}));
      if(format===undefined)return ooga;
      assert.equal(format,'mixed-1');return globalThis.BL.npcPosePacket.pack(wrongWorld?'other':world,ooga,
        states.unpackRoster(s.rigs).map(({index,snapshot})=>{controllers[index].restore(snapshot);return {index,pose:actors[index].createPoseProjector(wrongWorld?'other':world).capture()};}));}};
  const simulation=compactSimulation(source,65536,{intern:true});world=simulation.version;controllers=actors.map(actor=>actor.createManagedCheckpoint(world));
  const storage={async transaction(fn){let next=structuredClone(saved);const out=await fn({get:async()=>structuredClone(next),put:async(_,v)=>{next=structuredClone(v);}});
    if(failWrite){failWrite=false;throw Error('mixed host write failed');}saved=JSON.parse(JSON.stringify(next));return out;}};
  const make=()=>new VirtualHost({storage,simulation,clock:()=>now,sessionAdapter:{stepPassive:m=>m}});
  let runner=make(),ticket=await runner.begin('mixed-runner',60000),lost=true;
  const rpc={npcAuthorityStatus:v=>room.npcAuthorityStatus(v),configureNpcAuthority:(...args)=>room.configureNpcAuthority(...args),
    async publishNpcSnapshot(...args){const result=await room.publishNpcSnapshot(...args);if(lost){lost=false;throw Error('mixed reply lost');}return result;}};
  const options={format:'mixed-1'};
  await assert.rejects(runner.poses(ticket,{format:'future'}),/format/);
  await assert.rejects(publishHostPoses(runner,rpc,ticket,{format:'future',acquire:true}),/format/);
  assert.equal(room.npcAuthority,null);
  assert.equal((await publishHostPoses(runner,rpc,ticket,{...options,acquire:true})).status,'reconciled');
  const first=(await runner.poses(ticket,options)).frame,readers=[wire.create({mixed:true}),wire.create({mixed:true})];
  for(const reader of readers)reader.accept(room.npcAuthorityStatus().authority);
  assert.deepEqual(readers[0].frame(binary(a)[0]),first);assert.deepEqual(readers[1].frame(binary(b)[0]),first);
  await assert.rejects(publishHostPoses(runner,room,ticket,{acquire:true}),/format mismatch/);
  assert.equal(room.npcAuthority.v,2,'format cannot change inside the current authority epoch');
  wrongWorld=true;await assert.rejects(publishHostPoses(runner,room,ticket,options),/invalid/);wrongWorld=false;
  const before=structuredClone(saved);now+=250;h.at(now);failWrite=true;
  await assert.rejects(runner.tick(ticket),/write failed/);assert.deepEqual(saved,before);
  assert.equal((await publishHostPoses(runner,room,ticket,options)).duplicate,true);
  await runner.tick(ticket);await publishHostPoses(runner,room,ticket,options);
  assert.equal(binary(a).length,1);assert.equal(binary(b).length,1,'stalled clients retain one delivery credit');
  h.send(room,a,{t:'npc-ack',revision:room.npcAuthority.revision,sequence:room.players.get(1).npcSent.sequence});
  const latest=(await runner.poses(ticket,options)).frame;assert.deepEqual(readers[0].frame(binary(a).at(-1)),latest);
  const packet=globalThis.BL.npcPosePacket.unpack(latest),follower=f.make();
  assert.equal(new Uint32Array(packet.ooga,0,4)[2],53);assert.equal(packet.clankers.length,53);assert.ok(latest.byteLength<=32768);
  follower.createPoseProjector(world).apply(packet.clankers[52].pose);assert.equal(f.display(follower),f.display(actors[52]));
  const restored=await h.room(true,true);runner=make();
  assert.equal((await publishHostPoses(runner,restored,ticket,options)).duplicate,true);
  const late=(await h.join(restored,3,2)).ws;h.send(restored,late,{t:'hub',on:true});const lateReader=wire.create({mixed:true});
  lateReader.accept(restored.npcAuthorityStatus().authority);assert.deepEqual(lateReader.frame(binary(late)[0]),latest);
  now+=10000;h.at(now);const old=ticket;ticket=await claimHostRoom(runner,restored,'mixed-restart');
  await assert.rejects(publishHostPoses(runner,restored,old,options),/fenced/);
  assert.equal((await publishHostPoses(runner,restored,ticket,{...options,acquire:true})).status,'published');
  assert.deepEqual((await runner.poses(ticket,options)).frame,latest,'host replacement cannot advance animation or replay actions');
  t.diagnostic(JSON.stringify({scope:'authored trajectories, actual managed animation/host/Room; mock storage and sockets',actors:106,
    packetBytes:latest.byteLength,checkpointBytes:Buffer.byteLength(JSON.stringify(saved)),stalledFramesBeforeTakeover:1}));
  follower.dispose();for(const actor of actors)actor.dispose();
});

test('committed host poses reach actual Room, reconcile lost replies and recover without replaying simulation', async t => {
  const h = host(), room = await h.room(), a = (await h.join(room, 1)).ws, b = (await h.join(room, 2)).ws;
  h.send(room, a, { t: 'hub', on: true }); h.send(room, b, { t: 'hub', on: true });
  let now = 100000, saved, writes = 0, failWrite = false;
  const store = { async transaction(fn) {
    let next = structuredClone(saved), changed = false;
    const result = await fn({ get: async () => structuredClone(next), put: async (_, value) => { next = structuredClone(value); changed = true; } });
    if (changed && failWrite) { failWrite = false; throw Error('host write failed'); }
    if (changed) { saved = next; writes++; }
    return result;
  } };
  // The world step is deliberately authored; projection and both authority implementations are real.
  const project = createNpcPose(123, 1), actor = rig(); let projections = 0;
  const simulation = { checkpointBytes: 30 * 1024, version: 'bridge-fixture-1', initial: () => ({ x: 0, steps: 0 }), validate: s => Number.isFinite(s.x) && Number.isInteger(s.steps),
    step(s) { s.x++; s.steps++; }, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false,
    poses(s) { projections++; actor.root.position.x = s.x; return project([{ index: 0, actor }]); } };
  const make = () => new VirtualHost({ storage: store, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now });
  const first = make(), ticket = await first.begin('runner-a', 60000);
  let lostClaim = true, lostPublish = true;
  const rpc = { npcAuthorityStatus: value => room.npcAuthorityStatus(value),
    async configureNpcAuthority(...args) { const result = await room.configureNpcAuthority(...args); if (lostClaim) { lostClaim = false; throw Error('claim reply lost'); } return result; },
    async publishNpcSnapshot(...args) { const result = await room.publishNpcSnapshot(...args); if (lostPublish) { lostPublish = false; throw Error('publish reply lost'); } return result; } };
  await assert.rejects(publishHostPoses(first, rpc, ticket), /explicit Room/);
  assert.equal(room.npcAuthority, null);
  await assert.rejects(publishHostPoses({poses:()=>{throw Error('must not project');}},rpc,ticket,{acquire:true}),/confirmation required/);
  const projectedBefore = projections;
  assert.equal((await publishHostPoses(first, rpc, ticket, { acquire: true })).status, 'reconciled');
  assert.equal(projections, projectedBefore + 1, 'lost replies reconcile one validated projection, not two full rig rebuilds');
  assert.equal(saved.simulation.steps, 0); assert.equal(writes, 2, 'first Room binding writes once; projection cannot step simulation');
  assert.equal(binary(a).length, 1); assert.equal(binary(b).length, 1);
  const read = wire.create(); read.accept(room.npcAuthorityStatus().authority);
  const x = ws => new Float32Array(read.frame(binary(ws).at(-1)), 16)[2];
  assert.equal(x(a), 0);
  now = 100250; h.at(now); failWrite = true;
  await assert.rejects(first.tick(ticket), /host write failed/);
  await publishHostPoses(first, room, ticket);
  assert.equal(x(a), 0, 'failed simulation write cannot appear in a frame');
  for (let i = 1; i <= 20; i++) {
    now = 100000 + i * 250; h.at(now);
    await first.tick(ticket); await publishHostPoses(first, room, ticket);
    h.send(room, a, { t: 'npc-ack', revision: room.npcAuthority.revision, sequence: room.players.get(1).npcSent.sequence });
  }
  assert.equal(saved.simulation.steps, 20); assert.equal(binary(b).length, 1, 'stalled follower still owns just one delivery credit');
  assert.equal(x(a), 20);
  const late = (await h.join(room, 3)).ws; h.send(room, late, { t: 'hub', on: true });
  assert.equal(x(late), 20);
  const restoredRoom = await h.room(), resumed = make();
  assert.equal((await publishHostPoses(resumed, restoredRoom, ticket)).duplicate, true);
  assert.equal(binary(b).length, 1);
  now += 10000; h.at(now);
  const next = await claimHostRoom(resumed, restoredRoom, 'runner-b');
  await assert.rejects(publishHostPoses(first, restoredRoom, ticket), /fenced/);
  await resumed.tick(next);
  assert.equal((await publishHostPoses(resumed, restoredRoom, next, { acquire: true })).status, 'published');
  assert.equal(saved.simulation.steps, 28, 'bounded catch-up occurs only in tick');
  assert.equal(restoredRoom.npcAuthority.epoch, next.fence);
  assert.equal(binary(b).length, 2, 'one new credit after explicit authority replacement');
  const deliveries = binary(a).length; let intervening = true;
  const interleaved = { npcAuthorityStatus: async value => {
    if (intervening) { intervening = false; now += 250; h.at(now); await resumed.tick(next); }
    return restoredRoom.npcAuthorityStatus(value);
  }, publishNpcSnapshot: (...args) => restoredRoom.publishNpcSnapshot(...args) };
  assert.equal((await publishHostPoses(resumed,interleaved,next)).status,'superseded');
  assert.equal(binary(a).length, deliveries, 'a commit during Room RPCs cannot publish the previously projected revision');
  const beforeRelease = restoredRoom.npcAuthorityStatus().authority, latestRoomFrameBytes = h.stored.get(authority.ROOM_NPC.key).frame.byteLength;
  await restoredRoom.configureNpcAuthority(beforeRelease.revision, { mode: 'browser', world: next.world, epoch: next.fence, owner: next.owner });
  await assert.rejects(publishHostPoses(resumed, restoredRoom, next), /explicit Room/);
  assert.equal(restoredRoom.npcAuthority.mode, 'browser', 'ordinary publication cannot undo explicit release');
  now = 160000; h.at(now);
  await assert.rejects(publishHostPoses(resumed, restoredRoom, next), /fenced|closed/);
  t.diagnostic(JSON.stringify({ scope: 'authored one-actor world, actual encoder/host/Room, mocked storage and sockets',
    hostWrites: writes, hostCheckpointBytes: Buffer.byteLength(JSON.stringify(saved)),
    latestRoomFrameBytes,
    deliveredBytes: [a, b, late].flatMap(binary).reduce((n, frame) => n + frame.byteLength, 0),
    stalledFollowerFramesBeforeTakeover: 1 }));
});


test('publication defers an interleaved pending-body read before touching Room authority', async () => {
  const host = { poses: async (_, options) => { assert.equal(options.skipPending, true); return null; },
    confirmPoses: () => { throw Error('no projected revision'); } };
  const room = { npcAuthorityStatus: () => { throw Error('must not touch Room'); } };
  assert.deepEqual(await publishHostPoses(host, room, { owner: 'a', world: 'world-1', fence: 1 }), { status: 'superseded' });
});

test('Room rolling preview retains a four-per-second bound, persisted debt, duplicate credit and explicit negotiation', async () => {
  const h = host(), r = await h.room();
  const claim = { mode: 'server', world: 'world-1', epoch: 1, owner: 'host-a', runUntil: 200000, cadence: 'rolling-4-v1' };
  await assert.rejects(r.configureNpcAuthority(0, claim), /preview disabled/);
  r.env.VIRTUAL_HOST_ROLLING_PREVIEW = '1';
  const a = await r.configureNpcAuthority(0, claim), t = ticket(a);
  for (const [i, now] of [100000, 100250, 100505, 100760].entries()) {
    h.at(now); await r.publishNpcSnapshot(t, i + 1, frame(i + 1));
  }
  const before = structuredClone(h.stored.get(authority.ROOM_NPC.key));
  assert.equal(r.npcAuthorityStatus(t).nextPublishAt, 101000);
  h.at(100999); await assert.rejects(r.publishNpcSnapshot(t, 5, frame(5)), /fenced/);
  assert.equal((await r.publishNpcSnapshot(t, 4, frame(4))).duplicate, true);
  assert.deepEqual(h.stored.get(authority.ROOM_NPC.key), before, 'duplicate consumes no cadence credit');
  h.at(101000); h.fail(); await assert.rejects(r.publishNpcSnapshot(t, 5, frame(5)), /storage/);
  assert.deepEqual(h.stored.get(authority.ROOM_NPC.key), before, 'failed commit consumes no cadence credit');
  const restarted = await h.room();
  assert.equal(restarted.npcAuthorityStatus(t).nextPublishAt, 101000);
  await assert.rejects(restarted.publishNpcSnapshot(t, 5, frame(5)), /preview disabled/);
  restarted.env.VIRTUAL_HOST_ROLLING_PREVIEW = '1';
  const committed = await restarted.publishNpcSnapshot(t, 5, frame(5));
  assert.equal(committed.nextPublishAt, 101250); assert.equal(committed.cadence, 'rolling-4-v1');
  const projection = { publicationProtocol: 1, format: undefined, sequence: 6, at: 101000, runUntil: 200000, frame: frame(6) };
  await assert.rejects(publishHostPoses({ poses: async () => projection, confirmPoses: async () => true }, restarted,
    { owner: 'host-a', world: 'world-1', fence: 1 }), /cadence mismatch/);
  for (const cadence of [{ ...before.cadence, v: 2 }, { ...before.cadence, times: [100000] },
    { ...before.cadence, times: [100000, 100250, 100505, 100759] }])
    assert.throws(() => authority.validateNpcAuthority({ ...before, cadence }));
  h.at(101125); await assert.rejects(restarted.publishNpcSnapshot(t, 6, frame(6)), /fenced/);
  const released = await restarted.configureNpcAuthority(a.revision, { ...t, mode: 'browser' });
  await assert.rejects(restarted.configureNpcAuthority(released.revision, { ...claim, epoch: 2, cadence: undefined }), /fenced/);
  const reacquired = await restarted.configureNpcAuthority(released.revision, { ...claim, epoch: 2 });
  await assert.rejects(restarted.publishNpcSnapshot(ticket(reacquired), 1, frame(1)), /fenced/);
  h.at(101250); await restarted.publishNpcSnapshot(ticket(reacquired), 1, frame(1));
  const legacyRelease = await restarted.configureNpcAuthority(reacquired.revision, { ...ticket(reacquired), mode: 'browser' });
  h.at(102250);
  const legacy = await restarted.configureNpcAuthority(legacyRelease.revision, { ...claim, epoch: 3, cadence: undefined });
  await restarted.publishNpcSnapshot(ticket(legacy), 1, frame(1));
  assert.equal(restarted.npcAuthorityStatus(ticket(legacy)).cadence, undefined);
});

test('rolling publication refuses an older Room that silently ignores cadence negotiation', async () => {
  const h = host(), room = await h.room();
  const older = { npcAuthorityStatus: (...args) => room.npcAuthorityStatus(...args),
    configureNpcAuthority: (revision, next) => { const { cadence, ...legacy } = next; return room.configureNpcAuthority(revision, legacy); },
    publishNpcSnapshot: () => { throw Error('must not send a frame before negotiation'); } };
  const projector = { poses: async () => ({ publicationProtocol: 1, sequence: 1, at: 100000, runUntil: 200000, frame: frame() }),
    confirmPoses: () => { throw Error('must not confirm before negotiation'); } };
  await assert.rejects(publishHostPoses(projector, older, { world: 'world-1', owner: 'host-a', fence: 1 },
    { acquire: true, cadence: 'rolling-4-v1' }), /cadence mismatch/);
  assert.equal(room.npcAuthority.sequence, 0);
});

test('Room burst preview persists debt across restart and migration without increasing queue credit', async () => {
  const h = host(), r = await h.room();
  const claim = { mode: 'server', world: 'world-1', epoch: 1, owner: 'host-a', runUntil: 200000, cadence: 'rate-4-burst-2-v1' };
  await assert.rejects(r.configureNpcAuthority(0, claim), /preview disabled/);
  r.env.VIRTUAL_HOST_BURST_PREVIEW = '1';
  const state = await r.configureNpcAuthority(0, claim), t = ticket(state);
  for (const [i, now] of [100000, 100125, 100250, 100500, 100750].entries()) {
    h.at(now); await r.publishNpcSnapshot(t, i + 1, frame(i + 1));
  }
  const before = structuredClone(h.stored.get(authority.ROOM_NPC.key));
  h.at(100999); await assert.rejects(r.publishNpcSnapshot(t, 6, frame(6)), /fenced/);
  assert.equal((await r.publishNpcSnapshot(t, 5, frame(5))).duplicate, true);
  assert.deepEqual(h.stored.get(authority.ROOM_NPC.key), before);
  const restored = await h.room(); restored.env.VIRTUAL_HOST_BURST_PREVIEW = '1';
  assert.equal(restored.npcAuthorityStatus(t).nextPublishAt, 101000);
  const released = await restored.configureNpcAuthority(state.revision, { ...t, mode: 'browser' });
  const next = await restored.configureNpcAuthority(released.revision, { ...claim, epoch: 2 });
  await assert.rejects(restored.publishNpcSnapshot(ticket(next), 1, frame(1)), /fenced/);
  h.at(101000); h.fail(); await assert.rejects(restored.publishNpcSnapshot(ticket(next), 1, frame(1)), /storage/);
  assert.equal(restored.npcAuthorityStatus(ticket(next)).nextPublishAt, 101000);
  await restored.publishNpcSnapshot(ticket(next), 1, frame(1));
  assert.equal(restored.npcAuthorityStatus(ticket(next)).nextPublishAt, 101250);
});

const bodyRequest = '1'.repeat(32);
const bodyPrep = { v: 1, world: 'world-1', epoch: 1, accountId: 1, bodyId: 'player:1', generation: 0, nextGeneration: 1, expiresAt: 110000 };
const bodyClaim = { protocol: 'host-session-v5', world: 'world-1', accountId: 1, bodyId: 'player:1', zone: 'outside' };
test('Room world event binding derives bounded current admissions and signals committed work only behind the disabled gate', async () => {
  let signals = 0, options, routed;
  const h = host({ notifierFactory: configured => {
    options = configured; return { notify() { signals++; return true; }, dispose() {} };
  } }), r = await h.room(true, false, true, true);
  const first = (await h.join(r, 1, true, true, true, false, true, true)).ws;
  for (let id = 2; id <= 5; id++) await h.join(r, id, true, true, true, false, true, true);
  const t = ticket(await start(r));
  assert.equal(r.notifyWorld(), false); assert.equal(signals, 0);
  r.env.VIRTUAL_HOST_RUNNER_PREVIEW = '1';
  assert.equal(r.notifyWorld(), false, 'a preview flag cannot create a missing binding');
  r.env.VIRTUAL_WORLD = { getByName(name) {
    assert.equal(name, 'island'); return { notifyRoomWorld(hint) { routed = hint; return { status: 'handled', more: false }; } };
  } };
  await h.join(r, 6, true, true, true, false, true, true);
  assert.equal(signals, 1);
  await options.send(options.current());
  assert.deepEqual(structuredClone(routed), { v: 1, room: 'island', world: 'world-1', epoch: 1, revision: t.revision, owner: 'host-a', runUntil: 200000 });
  let inventory = await r.bodyAdmissionCandidates(t);
  assert.deepEqual(Array.from(inventory.identities, i => i.accountId), [1, 2, 3, 4]); assert.equal(inventory.more, true);
  const identity = { accountId: 1, connection: r.players.get(1).connectionToken };
  await r.stageBodyHandoff(t, identity, bodyPrep, 'ooga', bodyRequest, bodyClaim);
  r.players.get(2).bodyClosedAt = 100000; r.players.get(3).bodyQuiescence = { acknowledged: false };
  inventory = await r.bodyAdmissionCandidates(t);
  assert.deepEqual(Array.from(inventory.identities, i => i.accountId), [4, 5, 6]); assert.equal(inventory.more, false);
  const before = signals;
  const received = await h.send(r, first, { t: 'body-ready', request: bodyRequest });
  assert.equal(received.status, 'dispatch'); assert.equal(signals, before + 1);
  assert.ok(await r.pendingBodyHandoff(t, identity), 'notification follows the durable pending command');
  await r.webSocketClose(first); assert.equal(signals, before + 2);
  assert.equal((await r.bodyHandoffController().read(identity)).phase, 'closed');
  const prior = r.players.get(4).connectionToken;
  await h.join(r, 4, true, true, true, false, true, true);
  inventory = await r.bodyAdmissionCandidates(t);
  assert.equal(inventory.identities.find(i => i.accountId === 4).connection, r.players.get(4).connectionToken);
  assert.notEqual(r.players.get(4).connectionToken, prior);
  await assert.rejects(r.bodyAdmissionCandidates({ ...t, epoch: 99 }), /fenced|authority/);
});
test('Room world admission binds its current account and reconciles uncertain staging without a second preparation', async () => {
  const h = host(), r = await h.room(true, false, true, true);
  const ws = (await h.join(r, 1, true, true, false, false, true, true)).ws;
  const t = ticket(await start(r)), owner = { world: t.world, fence: t.epoch, owner: t.owner };
  const who = { accountId: 1, connection: r.players.get(1).connectionToken };
  const candidate = await r.bodyCandidate(t, who);
  assert.deepEqual(structuredClone(candidate), { status: 'available', candidate: { accountId: 1, bodyId: 'player:1', handle: 'a', kind: 'ooga' } });
  await assert.rejects(r.bodyCandidate(t, { ...who, connection: 'stale' }), /connection/);
  const claim = { protocol: bodyClaim.protocol, world: t.world, accountId: 1, bodyId: 'player:1', source: { handle: 'a', kind: 'ooga' } };
  await assert.rejects(r.stageBodyHandoff(t, who, bodyPrep, 'ooga', bodyRequest,
    { ...claim, source: { ...claim.source, handle: 'b' } }), /identity/);
  let preparations = 0;
  const authoritative = { async prepareWorldBody(given, observed) {
    assert.deepEqual(given, owner); assert.deepEqual(structuredClone(observed), structuredClone(candidate.candidate));
    preparations++; return { preparation: bodyPrep, kind: 'ooga', claim };
  } };
  const stage = r.stageBodyHandoff.bind(r);
  r.stageBodyHandoff = async (...args) => { await stage(...args); throw Error('reply lost after commit'); };
  assert.equal((await stageWorldBody(authoritative, r, owner, t, who)).status, 'reconciled');
  const retained = await r.bodyCandidate(t, who);
  assert.equal(retained.status, 'retained');
  assert.equal((await stageWorldBody(authoritative, r, owner, t, who)).status, 'retained');
  assert.equal(preparations, 1, 'an existing outbox owns the request and preparation');
  assert.equal((await r.bodyCandidate(t, who)).request, retained.request);
  assert.ok(ws.sent.some(message => message.t === 'body-prepare'));
  await assert.rejects(stageWorldBody(authoritative, r, { ...owner, fence: owner.fence + 1 }, t, who), /authorities/);
  const old = { ...who }; await h.join(r, 1, true, true, false, false, true, true);
  await assert.rejects(r.bodyCandidate(t, old), /connection/);
  const incompatible = host(), room = await incompatible.room(true, false, true, true);
  await incompatible.join(room, 1, true, true, false, false, true, false);
  const authority = ticket(await start(room));
  await assert.rejects(room.bodyCandidate(authority, { accountId: 1, connection: room.players.get(1).connectionToken }), /incompatible/);
});
test('Room projects committed Ooga feet position for socket delivery, late join and wake without accepting uncommitted motion', async () => {
  const h = host(), r = await h.room(true, false, true, true), ws = (await h.join(r, 1, true, true, false, false, true, true)).ws;
  const t = ticket(await start(r)), p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'ooga', bodyRequest, bodyClaim);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  const session = { accountId: 1, bodyId: 'player:1', generation: 1, token: '2'.repeat(32) };
  const checkpoint = { v: 1, kind: 'ooga', world: 'world-1', profile: 'standing-1', name: 'a',
    position: { x: 1, y: 8, z: 3, yaw: .5 }, equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } };
  const transfer = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 2,
    at: 100000, expiresAt: 110000, resetResources: 'defaults',
    view: { state: 'offered', accountId: 1, bodyId: 'player:1', kind: 'ooga', generation: 1, deadline: 160000, zone: 'outside' }, checkpoint };
  let pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, session }, transfer });
  await h.send(r, ws, { t: 'body-applied', request: bodyRequest, epoch: 1, generation: 1, revision: 2 });
  pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, session },
    transfer: { ...transfer, revision: 3, expiresAt: 101000, view: { ...transfer.view, state: 'starting' } } });
  await h.send(r, ws, { t: 'body-started', request: bodyRequest, epoch: 1, generation: 1, revision: 3 });
  pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision,
    { result: { ok: true, view: { ...transfer.view, state: 'live', deadline: null } } });
  assert.equal(p.y, 8); assert.equal(p.body, 'player:1');
  const codec = globalThis.BL.oogaMotion, message = { t: codec.TYPE, request: bodyRequest, sequence: 1,
    data: codec.pack({ ...checkpoint, position: { ...checkpoint.position, y: 12 } }) };
  assert.ok(ws.sent.find(m => m.t === 'welcome').features.includes(codec.FEATURE));
  p.oogaMotionProtocol = 0; await h.send(r, ws, message);
  assert.equal(await r.pendingBodyMovement(t, i), null, 'unnegotiated format cannot write');
  p.oogaMotionProtocol = 1; await h.send(r, ws, message);
  const staged = await r.pendingBodyMovement(t, i);
  assert.equal(staged.sample.checkpoint.name, 'a'); assert.equal(staged.sample.checkpoint.world, 'world-1');
  assert.equal(ws.sent.filter(m => m.t === 'body-motion-ack').length, 0);
  assert.equal(p.y, 8);
  await r.completeBodyMovement(t, i, 1, { sequence: 1, at: 100000 });
  assert.equal(p.y, 12); assert.equal(ws.store.y, 12);
  const restored = await h.room(true, false, true, true); assert.equal(restored.players.get(1).y, 12);
  assert.equal(restored.players.get(1).oogaMotionProtocol, 1);
  const late = (await h.join(restored, 2, true, true, false, false, true)).ws;
  assert.equal(late.sent.find(m => m.t === 'welcome').players.find(p => p.id === 1).y, 12);
  assert.ok(!late.sent.find(m => m.t === 'welcome').features.includes(codec.FEATURE));
  h.at(100100); await h.send(restored, ws, { ...message, sequence: 2 });
  assert.equal(await restored.pendingBodyMovement(t, i), null, 'pacing survives wake');
  h.at(100250); await h.send(restored, ws, { ...message, sequence: 2 });
  assert.equal((await restored.pendingBodyMovement(t, i)).sample.sequence, 2);
  for (const room of [r, restored]) clearTimeout(room.flushTimer);
});

test('Room event inventory closes expired preparation at its original deadline and never admits a replacement', async () => {
  const h = host(), r = await h.room(true, false, true);
  const ws = (await h.join(r, 1, true, true)).ws, t = ticket(await start(r));
  const p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  await r.stageBodyHandoff(t, i, { ...bodyPrep, expiresAt: 100500 }, 'clanker', bodyRequest, bodyClaim);
  let work = await r.bodyWork(t);
  assert.equal(work.events.length, 0); assert.equal(work.nextDeadline, 100500);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  work = await r.bodyWork(t); assert.equal(work.events[0].kind, 'handoff');
  h.at(100750); work = await r.bodyWork(t);
  assert.equal(work.events[0].kind, 'close'); assert.equal(work.nextDeadline, null);
  assert.equal((await r.bodyHandoffController().read(i)).closedAt, 100500);
  assert.equal((await r.pendingBodyHandoff(t, i)).closed, true, 'uncertain command is retained for cancellation/recovery');
  const writes = structuredClone(h.stored);
  await r.bodyWork(t); assert.deepEqual(h.stored, writes, 'idle retry does not extend or rewrite the expired window');
  await assert.rejects(r.bodyWork({ ...t, epoch: 2 }), /fenced/);
  assert.equal(ws.closed, null, 'body preparation expiry does not drop voice transport');
  const first = await r.beginBodyEventBatch(t), second = await r.beginBodyEventBatch(t);
  assert.equal(await r.completeBodyEventBatch(t, first), false, 'an older pass cannot clear newer publication debt');
  const restored = await h.room(true, false, true);
  assert.equal((await restored.bodyWork(t)).publicationPending, second);
  h.fail(); await assert.rejects(restored.completeBodyEventBatch(t, second), /storage/);
  assert.equal((await restored.bodyWork(t)).publicationPending, second);
  assert.equal(await restored.completeBodyEventBatch(t, second), true);
  assert.equal((await restored.bodyWork(t)).publicationPending, null);
});

test('compact socket movement publishes only host receipts and preserves last position across pending-sample wake', async () => {
  const h = host(), r = await h.room(true, false, true, true);
  const ws = (await h.join(r, 1, true, true, false, false, true)).ws;
  assert.ok(ws.sent.find(m => m.t === 'welcome').features.includes('host-body-motion-v1'));
  const t = ticket(await start(r)), p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  const session = { accountId: 1, bodyId: 'player:1', generation: 1, token: '2'.repeat(32) };
  const checkpoint = { v: 1, world: 'world-1', profile: '["trusted-profile"]', body: ['owner', 1, 2, 3, 0, 0, 0, 0, 0, 1] };
  const transfer = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 2,
    at: 100000, expiresAt: 110000, resetResources: 'defaults',
    view: { state: 'offered', accountId: 1, bodyId: 'player:1', kind: 'clanker', generation: 1, deadline: 160000, zone: 'outside' }, checkpoint };
  let pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, session }, transfer });
  await h.send(r, ws, { t: 'body-applied', request: bodyRequest, epoch: 1, generation: 1, revision: 2 });
  pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, session },
    transfer: { ...transfer, revision: 3, expiresAt: 101000, view: { ...transfer.view, state: 'starting' } } });
  await h.send(r, ws, { t: 'body-started', request: bodyRequest, epoch: 1, generation: 1, revision: 3 });
  pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision,
    { result: { ok: true, view: { ...transfer.view, state: 'live', deadline: null } } });
  assert.equal(p.body, 'player:1'); assert.equal(p.x, 1);
  const motion = (sequence, x) => ({ t: 'body-motion-1', request: bodyRequest, sequence,
    data: globalThis.BL.bodyMotion.pack(['owner', x, 2, 3, 0, 0, 0, 0, 0, 1]) });
  await h.send(r, ws, motion(1, 8)); assert.equal(p.x, 1);
  assert.equal(ws.sent.filter(m => m.t === 'body-motion-ack').length, 0);
  await r.completeBodyMovement(t, i, 1, { sequence: 1, at: 100000 });
  assert.equal(p.x, 8); assert.equal(ws.store.x, 8);
  assert.equal(ws.sent.at(-1).t, 'body-motion-ack');
  h.at(100250); await h.send(r, ws, motion(2, 12)); assert.equal(p.x, 8);
  const restored = await h.room(true, false, true, true);
  assert.equal(restored.players.get(1).x, 8, 'pending movement cannot rewind to grant or publish itself');
  await restored.completeBodyMovement(t, i, 2, { sequence: 2, at: 100250 });
  assert.equal(restored.players.get(1).x, 12);
  h.at(100500); await h.send(restored, ws, motion(3, 16));
  const serialize = ws.serializeAttachment, beforeAcks = ws.sent.filter(m => m.t === 'body-motion-ack').length;
  ws.serializeAttachment = () => { throw Error('attachment unavailable'); };
  await assert.rejects(restored.completeBodyMovement(t, i, 3, { sequence: 3, at: 100500 }), /attachment unavailable/);
  assert.equal(restored.players.get(1).x, 12);
  assert.equal(ws.sent.filter(m => m.t === 'body-motion-ack').length, beforeAcks);
  ws.serializeAttachment = serialize;
  await h.send(restored, ws, motion(3, 16));
  assert.equal(restored.players.get(1).x, 16, 'retry repairs public attachment before acknowledging host receipt');
  const beforeClose = structuredClone(h.stored);
  await h.send(restored, ws, { t: 'body-decline', request: bodyRequest });
  assert.equal(restored.players.get(1).body, null); assert.equal(ws.closed, null, 'body release keeps transport connected');
  // Alternate crash: the socket vanishes before a close callback can persist.
  h.stored.clear(); for (const [k, v] of beforeClose) h.stored.set(k, v);
  ws.close(1006, 'lost'); h.at(100900);
  const missing = await h.room(true, false, true, true);
  assert.equal((await missing.bodyHandoffController().read(i)).closedAt, 100500,
    'missing socket closes at latest durable movement observation, never old handoff time or restart time');
  for (const room of [r, restored]) clearTimeout(room.flushTimer);
});

test('Room stop commits before sending, survives wake and retains voice and authority until explicit cleanup', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const t = ticket(await start(r)), p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  const session = { accountId: 1, bodyId: 'player:1', generation: 1, token: '2'.repeat(32) };
  const transfer = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 2,
    at: 100000, expiresAt: 110000, resetResources: 'defaults',
    view: { state: 'offered', accountId: 1, bodyId: 'player:1', kind: 'clanker', generation: 1, deadline: 160000 }, checkpoint: {} };
  let pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, session }, transfer });
  await h.send(r, ws, { t: 'body-applied', request: bodyRequest, epoch: 1, generation: 1, revision: 2 });
  pending = await r.pendingBodyHandoff(t, i);
  const starting = { ...transfer, revision: 3, expiresAt: 101000, view: { ...transfer.view, state: 'starting' } };
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, session }, transfer: starting });
  await h.send(r, ws, { t: 'body-started', request: bodyRequest, epoch: 1, generation: 1, revision: 3 });
  pending = await r.pendingBodyHandoff(t, i);
  await r.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: true, view: { ...transfer.view, state: 'live', deadline: null } } });
  p.voice = 'retained-voice'; ws.serializeAttachment(r.attachment(p));
  const sent = ws.sent.length, before = structuredClone(h.stored);
  h.at(100100); h.fail(); await assert.rejects(r.requestBodyStop(t, i), /storage/);
  assert.deepEqual(h.stored, before); assert.equal(ws.sent.length, sent);
  await assert.rejects(r.requestBodyStop({ ...t, epoch: 2 }, i), /fenced/);
  await assert.rejects(r.requestBodyStop(t, { ...i, connection: 'old' }), /connection/);
  const stop = await r.requestBodyStop(t, i);
  assert.equal(stop.requestedAt, 100100); assert.equal(stop.delivered, true);
  assert.deepEqual(ws.sent.at(-1), { t: 'body-stop', request: bodyRequest });
  assert.equal(p.bodyClosedAt, undefined); assert.equal(ws.closed, null);
  h.at(112000); const restart = await h.room(true, false, true);
  assert.equal((await restart.requestBodyStop(t, i)).requestedAt, 100100);
  assert.equal(restart.npcAuthority.mode, 'server');
  await h.send(restart, ws, { t: 'body-decline', request: bodyRequest });
  assert.equal(restart.players.get(1).bodyClosedAt, 112000);
  assert.equal(restart.players.get(1).voice, 'retained-voice'); assert.equal(ws.closed, null);
  await h.send(restart, ws, { t: 'mute', on: true }); assert.equal(restart.players.get(1).muted, true);
  assert.equal((await restart.bodyHandoffController().cleanup(i)).kind, 'disconnect');
  assert.equal(restart.bodyHandoffRequired, true, 'stop acknowledgement does not authorize legacy controls or release');
});

test('Room stages only authenticated compatible body work and persists close before a late claim result can be delivered', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const a = await start(r), t = ticket(a), p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  await assert.rejects(r.stageBodyHandoff(t, { ...i, connection: 'old' }, bodyPrep, 'clanker', bodyRequest, bodyClaim), /connection/);
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  assert.equal(ws.sent.at(-1).t, 'body-prepare'); assert.equal(ws.sent.at(-1).v, 2);
  assert.equal(ws.sent.find(m => m.t === 'welcome').features.includes('host-body-reclaim-v2'), false, 'preview does not advertise unfinished activation');
  assert.equal(Object.hasOwn(ws.store, 'transfer'), false);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  const pending = await r.pendingBodyHandoff(t, i); assert.equal(pending.command.accountId, 1); assert.equal(pending.closed, false);
  const uncertain = await r.bodyCensus(t);
  assert.equal(uncertain.ready, false); assert.deepEqual(structuredClone(uncertain.pending), [i]); assert.equal(uncertain.tokens.length, 0);
  h.send(r, ws, { t: 'pose', x: 999, y: 1, z: 999, yaw: 0 }); assert.notEqual(p.x, 999);
  h.at(100300); const closed = r.webSocketClose(ws);
  assert.equal(r.players.has(1), false, 'ordinary presence/voice release is immediate');
  assert.equal(p.bodyClosing, true); assert.equal(ws.store.bodyClosedAt, 100300); await closed; ws.close(1000, 'closed');
  const restart = await h.room(true, false, true);
  const closing = await restart.bodyCensus(t);
  assert.equal(closing.ready, false); assert.deepEqual(structuredClone(closing.closed), [i]);
  const after = await restart.pendingBodyHandoff(t, i); assert.equal(after.closed, true); assert.deepEqual(after.command, pending.command);
  const answer = { result: { ok: true, session: { accountId: 1, bodyId: 'player:1', generation: 1, token: '2'.repeat(32) } }, transfer: {
    v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 2, at: 100000, expiresAt: 110000,
    resetResources: 'defaults', view: { state: 'offered', accountId: 1, bodyId: 'player:1', kind: 'clanker', generation: 1, deadline: 160000 }, checkpoint: {} } };
  const sent = ws.sent.length;
  const completed = await restart.completeBodyHandoff(t, i, pending.command.revision, answer);
  const retained = await restart.bodyCensus(t);
  assert.equal(retained.ready, false); assert.deepEqual(structuredClone(retained.tokens), [answer.result.session.token]);
  assert.equal(retained.pending.length, 0, 'known refs stay protected until explicit closed-row cleanup');
  assert.equal(completed.phase, 'closed'); assert.equal(completed.delivered, false); assert.equal(ws.sent.length, sent);
  assert.equal((await restart.bodyHandoffController().read(i)).closedAt, 100300);
  await assert.rejects(restart.bodyCensus({ ...t, epoch: t.epoch + 1 }), /disabled or fenced/);
  h.at(110001); await assert.rejects(restart.bodyCensus(t), /disabled or fenced/, 'census cannot silently renew an expired Room lease');
  const rollback = await h.room(false); assert.equal((await h.join(rollback, 1)).response.status, 409, 'removing configuration cannot reopen legacy body claims');
});

test('Room wake infers a missing transport from its last persisted observation; cancellation retains no new body', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const t = ticket(await start(r)), i = { accountId: 1, connection: r.players.get(1).connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  ws.close(1006, 'lost'); h.at(100800);
  const restart = await h.room(true, false, true), pending = await restart.pendingBodyHandoff(t, i);
  assert.equal(pending.closed, true); assert.equal((await restart.bodyHandoffController().read(i)).closedAt, 100000);
  await restart.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: false, reason: 'cancelled' }, transfer: null });
  assert.equal((await restart.bodyHandoffController().cleanup(i)).kind, 'retire');
  assert.equal((await restart.bodyHandoffController().read(i)).ref, null);
});

test('body receipt parser refuses extra identity, snapshot and token fields', () => {
  for (const t of ['body-ready', 'body-applied', 'body-started', 'body-decline']) {
    const m = { t, request: bodyRequest, ...(['body-ready', 'body-decline'].includes(t) ? {} : { epoch: 1, generation: 2, revision: 3 }) };
    assert.deepEqual(protocol.parseClientMessage(JSON.stringify(m)), m);
    for (const field of ['accountId', 'token', 'transfer']) assert.equal(protocol.parseClientMessage(JSON.stringify({ ...m, [field]: 1 })), null);
  }
});

test('Room body decline preserves the socket and voice through restart while retaining durable cleanup', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const t = ticket(await start(r)), p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  const pending = await r.pendingBodyHandoff(t, i), decline = { t: 'body-decline', request: bodyRequest };
  p.voice = 'existing-voice-session'; p.muted = false;
  p.v = [0,0,0,7,0,0,0,0,0,0,0,0,0,0,0,31,31]; p.va = 100000; p.r = [0,2,255,0,0,0];
  ws.serializeAttachment(r.attachment(p));
  const before = structuredClone(h.stored);
  assert.equal((await h.send(r, ws, { ...decline, request: 'f'.repeat(32) })).status, 'refused');
  assert.deepEqual(h.stored, before); assert.equal(p.bodyClosedAt, undefined);
  h.at(100400); h.fail(); await assert.rejects(h.send(r, ws, decline), /storage/);
  assert.equal(p.bodyClosedAt, undefined); assert.equal(ws.closed, null);
  assert.equal((await h.send(r, ws, decline)).status, 'closed');
  assert.equal(p.bodyClosedAt, 100400); assert.equal(ws.closed, null); assert.equal(r.players.get(1), p);
  assert.equal(p.voice, 'existing-voice-session'); assert.equal(ws.sent.some(m => m.t === 'leave' || m.t === 'kick'), false);
  // Simulate a crash after durable close but before attachment update.
  ws.store.bodyClosedAt = null;
  const restored = await h.room(true, false, true), after = await restored.pendingBodyHandoff(t, i);
  assert.equal(after.closed, true); assert.deepEqual(after.command, pending.command);
  assert.equal(restored.players.get(1).bodyClosedAt, 100400); assert.equal(ws.store.bodyClosedAt, 100400);
  assert.equal(restored.players.get(1).voice, 'existing-voice-session'); assert.equal(ws.closed, null);
  assert.deepEqual(restored.players.get(1).v, p.v); assert.equal(restored.players.get(1).va, p.va);
  assert.deepEqual(restored.players.get(1).r, p.r, 'hibernation retains upstream visual/rest data alongside body fencing');
  h.at(100600); assert.equal((await h.send(restored, ws, decline)).status, 'closed');
  assert.equal((await restored.bodyHandoffController().read(i)).closedAt, 100400);
  await h.send(restored, ws, { t: 'mute', on: true }); assert.equal(restored.players.get(1).muted, true);
  await h.send(restored, ws, { t: 'pose', x: 999, y: 1, z: 999, yaw: 0 }); assert.notEqual(restored.players.get(1).x, 999);
  await assert.rejects(restored.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim), /connection/);
  await restored.completeBodyHandoff(t, i, pending.command.revision, { result: { ok: false, reason: 'cancelled' }, transfer: null });
  const cleanup = await restored.closedBodyHandoff(t, i);
  assert.equal(cleanup.kind, 'retire'); await restored.resolveBodyHandoff(t, i, cleanup.revision, null);
  const ready = await h.room(true, false, true); // Stale attachment persists until explicit server retry.
  assert.equal(ready.players.get(1).bodyClosedAt, 100400);
  const nextRequest = '3'.repeat(32);
  await ready.stageBodyHandoff(t, i, bodyPrep, 'clanker', nextRequest, bodyClaim);
  assert.equal(ready.players.get(1).bodyClosedAt, null); assert.equal(ws.store.bodyClosedAt, null);
  assert.equal(ready.players.get(1).voice, 'existing-voice-session'); assert.equal(ws.closed, null);
  assert.equal((await h.send(ready, ws, decline)).status, 'refused', 'old request cannot close the new body exchange');
  assert.equal((await ready.bodyHandoffController().read(i)).phase, 'prepared');
});

test('an empty retained body index still fences legacy joins and browser-authority rollback', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const a = await start(r), t = ticket(a), i = { accountId: 1, connection: r.players.get(1).connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await r.webSocketClose(ws); ws.close(1000, 'closed');
  const cleanup = await r.closedBodyHandoff(t, i);
  await r.resolveBodyHandoff(t, i, cleanup.revision, null);
  assert.deepEqual(h.stored.get('room-body-handoff-v1'), []);
  const restored = await h.room(true, false, true);
  assert.equal((await h.join(restored, 1)).response.status, 409);
  await assert.rejects(restored.configureNpcAuthority(a.revision, { ...t, mode: 'browser' }), /body handoff drain/);
  const next = (await h.join(restored, 1, true, true)).ws;
  h.send(restored, next, { t: 'body', name: 'a' });
  assert.equal(restored.players.get(1).body, null, 'compatible reconnect remains fenced until body integration');
});

test('drained release atomically retires body compatibility markers only after outbox and occupants are gone', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const a = await start(r), t = ticket(a), identity = { accountId: 1, connection: r.players.get(1).connectionToken };
  await r.stageBodyHandoff(t, identity, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  const intent = { v: 2, action: 'release', world: 'world-1', previousOwner: 'host-a', previousEpoch: 1,
    owner: 'closer', epoch: 2, runUntil: 200000, cleanup: false };
  await assert.rejects(r.releaseDrainedNpcAuthority(a.revision, intent), /occupants/);
  await r.webSocketClose(ws); ws.close(1000, 'closed');
  await assert.rejects(r.releaseDrainedNpcAuthority(a.revision, intent), /handoff drain/);
  const close = await r.closedBodyHandoff(t, identity);
  await r.resolveBodyHandoff(t, identity, close.revision, null);
  await r.retainBodyPresence(t, { owner: 'host-a', fence: 1, world: 'world-1' },
    { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 1,
      now: 100000, expiresAt: 110000, views: [], departures: [] });
  const restored = await h.room(true, false, true);
  const before = structuredClone(h.stored);
  h.fail(); await assert.rejects(restored.releaseDrainedNpcAuthority(a.revision, intent), /storage/);
  assert.deepEqual(h.stored, before); assert.equal(restored.bodyHandoffRequired, true);
  await assert.rejects(restored.releaseDrainedNpcAuthority(a.revision, { ...intent, previousOwner: 'wrong' }), /fenced/);
  const released = await restored.releaseDrainedNpcAuthority(a.revision, intent);
  assert.equal(released.mode, 'browser'); assert.equal(h.stored.has(ROOM_BODY.key), false);
  assert.equal(h.stored.has(ROOM_BODY_PRESENCE.key), false);
  const restarted = await h.room(false);
  assert.equal(restarted.bodyHandoffRequired, false); assert.equal(restarted.bodyPresenceRequired, false);
  assert.equal((await h.join(restarted, 1)).response.status, 101, 'legacy joins resume only after durable body retirement');
});

test('connected drained release commits its recipient journal before notification and recovers stale attachments without closing voice', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true, false, true)).ws;
  const a = await start(r), t = ticket(a), p = r.players.get(1), i = { accountId: 1, connection: p.connectionToken };
  const intent = { v: 2, action: 'release', world: 'world-1', previousOwner: 'host-a', previousEpoch: 1,
    owner: 'closer', epoch: 2, runUntil: 200000, cleanup: false };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await assert.rejects(r.releaseConnectedNpcAuthority(a.revision, intent), /unstopped/);
  await h.send(r, ws, { t: 'body-decline', request: bodyRequest });
  await assert.rejects(r.releaseConnectedNpcAuthority(a.revision, intent), /handoff drain/);
  const close = await r.closedBodyHandoff(t, i); await r.resolveBodyHandoff(t, i, close.revision, null);
  p.voice = 'connected-voice'; ws.serializeAttachment(r.attachment(p));
  p.bodyMigrationProtocol = 0;
  await assert.rejects(r.releaseConnectedNpcAuthority(a.revision, intent), /incompatible/);
  p.bodyMigrationProtocol = 1;
  const before = structuredClone(h.stored), sent = ws.sent.length;
  for (const write of [1, 2]) {
    h.fail(write); await assert.rejects(r.releaseConnectedNpcAuthority(a.revision, intent), /storage/);
    assert.deepEqual(h.stored, before); assert.equal(ws.sent.length, sent); assert.equal(p.bodyHandoff, true);
  }
  const oldAttachment = structuredClone(ws.store);
  r.applyBodyRelease = () => { throw Error('crash before release notification'); };
  await assert.rejects(r.releaseConnectedNpcAuthority(a.revision, intent), /crash/);
  assert.equal(h.stored.has(ROOM_BODY.key), false); assert.equal(h.stored.get(ROOM_BODY_RELEASE.key).clients.length, 1);
  assert.equal(ws.sent.some(m => m.t === 'body-release'), false);
  ws.store = oldAttachment;
  const restored = await h.room(true, false, true), q = restored.players.get(1);
  assert.equal(q.bodyHandoff, false); assert.equal(q.voice, 'connected-voice'); assert.equal(ws.closed, null);
  assert.equal(restored.bodyHandoffRequired, false);
  const receipt = ws.sent.find(m => m.t === 'body-release');
  assert.equal(receipt.connection, i.connection); assert.equal(receipt.authority.mode, 'browser');
  assert.equal(ws.sent.filter(m => m.t === 'npc-authority').at(-1).authority.revision, receipt.authority.revision);
  await h.send(restored, ws, { t: 'body', name: 'a' }); assert.equal(q.body, 'a');
  await restored.deliverBodyRelease(receipt.authority.revision); assert.equal(q.body, 'a', 'receipt retry keeps the new ordinary claim');
  const wake = await h.room(true, false, true); assert.equal(wake.players.get(1).body, 'a');
  await h.send(wake, ws, { t: 'mute', on: true }); assert.equal(wake.players.get(1).muted, true);
  const replacement = (await h.join(wake, 1, true, true, false, true)).ws;
  await wake.deliverBodyRelease(receipt.authority.revision);
  assert.equal(replacement.sent.some(m => m.t === 'body-release'), false, 'old receipt is connection-bound');
  await start(wake, receipt.authority.revision, 2, 'next-host');
  await assert.rejects(wake.deliverBodyRelease(receipt.authority.revision), /fenced/);
});

test('connected release journal bounds full-width recipients and rejects malformed or duplicate identity', () => {
  const row = { v: 1, authority: { v: 1, revision: Number.MAX_SAFE_INTEGER, mode: 'browser', world: null, epoch: 0 },
    clients: Array.from({ length: 32 }, (_, i) => ({ accountId: Number.MAX_SAFE_INTEGER - i, connection: 'a'.repeat(64) })) };
  assert.equal(validateBodyRelease(row), row);
  assert.ok(Buffer.byteLength(JSON.stringify(row)) <= ROOM_BODY_RELEASE.bytes);
  for (const bad of [{ ...row, clients: [...row.clients, row.clients[0]] }, { ...row, clients: [row.clients[0], row.clients[0]] },
    { ...row, authority: { ...row.authority, mode: 'server' } }, { ...row, clients: [{ ...row.clients[0], connection: 'x'.repeat(65) }] }])
    assert.throws(() => validateBodyRelease(bad), /release/);
});

test('untouched viewer quiescence persists before send and ACK, survives wake and retains voice through drained release', async testContext => {
  const h = host(), r = await h.room(true, false, true);
  const first = (await h.join(r, 1, true, true, false, true)).ws, viewer = (await h.join(r, 2, true, true, false, true)).ws;
  const a = await start(r), t = ticket(a), i = { accountId: 1, connection: r.players.get(1).connectionToken };
  const p = r.players.get(2), who = { accountId: 2, connection: p.connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await assert.rejects(r.requestBodyQuiescence(t, i), /untouched/);
  p.voice = 'viewer-voice'; viewer.serializeAttachment(r.attachment(p));
  const save = viewer.serializeAttachment.bind(viewer), initial = structuredClone(viewer.store), sent = viewer.sent.length;
  viewer.serializeAttachment = () => { throw Error('attachment unavailable'); };
  await assert.rejects(r.requestBodyQuiescence(t, who), /attachment/);
  assert.equal(p.bodyQuiescence, undefined); assert.deepEqual(viewer.store, initial); assert.equal(viewer.sent.length, sent);
  viewer.serializeAttachment = save;
  const q = await r.requestBodyQuiescence(t, who);
  assert.equal(q.acknowledged, false); assert.equal(viewer.sent.at(-1).t, 'body-quiesce');
  testContext.diagnostic(JSON.stringify({ scope: 'complete authored Room viewer attachment, JSON only; provider serialization excluded',
    beforeBytes: Buffer.byteLength(JSON.stringify(initial)), quiescentBytes: Buffer.byteLength(JSON.stringify(viewer.store)) }));
  assert.equal(viewer.store.bodyQuiescence.request, q.request);
  const restored = await h.room(true, false, true), v = restored.players.get(2);
  assert.equal((await restored.requestBodyQuiescence(t, who)).request, q.request);
  const ack = { t: 'body-quiescent', request: q.request, revision: a.revision };
  for (const bad of [{ ...ack, accountId: 2 }, { ...ack, revision: 0 }, { ...ack, request: 'bad' }])
    assert.equal(protocol.parseClientMessage(JSON.stringify(bad)), null);
  assert.equal((await h.send(restored, viewer, { ...ack, request: 'f'.repeat(32) })).status, 'refused');
  viewer.serializeAttachment = () => { throw Error('ACK attachment unavailable'); };
  await assert.rejects(h.send(restored, viewer, ack), /attachment/);
  assert.equal(v.bodyQuiescence.acknowledged, false); assert.equal(viewer.store.bodyQuiescence.acknowledged, false);
  viewer.serializeAttachment = save;
  assert.equal((await h.send(restored, viewer, ack)).status, 'acknowledged');
  const accepted = structuredClone(viewer.store); await h.send(restored, viewer, ack); assert.deepEqual(viewer.store, accepted);
  await assert.rejects(restored.stageBodyHandoff(t, who, { ...bodyPrep, accountId: 2, bodyId: 'player:2' }, 'clanker', 'e'.repeat(32),
    { ...bodyClaim, accountId: 2, bodyId: 'player:2' }), /connection/);
  await h.send(restored, first, { t: 'body-decline', request: bodyRequest });
  const close = await restored.closedBodyHandoff(t, i); await restored.resolveBodyHandoff(t, i, close.revision, null);
  const wake = await h.room(true, false, true);
  assert.equal(wake.players.get(2).bodyQuiescence.acknowledged, true);
  const changed = await wake.fenceNpcAuthority({ v: 1, world: 'world-1', previousOwner: 'host-a', previousEpoch: 1,
    owner: 'host-b', epoch: 2, runUntil: 200000, cleanup: false });
  const intent = { v: 2, action: 'release', world: 'world-1', previousOwner: 'host-b', previousEpoch: 2,
    owner: 'closer', epoch: 3, runUntil: 200000, cleanup: false };
  await assert.rejects(wake.releaseConnectedNpcAuthority(changed.revision, intent), /unstopped/);
  assert.equal((await h.send(wake, viewer, ack)).status, 'refused');
  const renewed = await wake.requestBodyQuiescence(ticket(changed, 'host-b'), who);
  assert.notEqual(renewed.request, q.request); assert.equal(renewed.acknowledged, false);
  await h.send(wake, viewer, { t: 'body-quiescent', request: renewed.request, revision: changed.revision });
  await wake.releaseConnectedNpcAuthority(changed.revision, intent);
  assert.equal(wake.players.get(2).bodyHandoff, false); assert.equal(wake.players.get(2).bodyQuiescence, null);
  assert.equal(wake.players.get(2).voice, 'viewer-voice'); assert.equal(viewer.closed, null);
  assert.equal(viewer.sent.at(-1).t, 'body-release'); assert.equal((await h.send(wake, viewer, ack)).status, 'refused');
});

test('quiescence receipts cannot cross replacement connections or bypass an outstanding account handoff', async () => {
  const h = host(), r = await h.room(true, false, true);
  await h.join(r, 1, true, true, false, true);
  const ws = (await h.join(r, 2, true, true, false, true)).ws;
  const a = await start(r), t = ticket(a);
  await r.stageBodyHandoff(t, { accountId: 1, connection: r.players.get(1).connectionToken }, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  const i = { accountId: 2, connection: r.players.get(2).connectionToken }, q = await r.requestBodyQuiescence(t, i);
  const next = (await h.join(r, 2, true, true, false, true)).ws, who = { accountId: 2, connection: r.players.get(2).connectionToken };
  assert.equal(r.players.get(2).bodyQuiescence, undefined);
  const ack = { t: 'body-quiescent', request: q.request, revision: q.revision };
  await h.send(r, ws, ack);
  assert.equal((await h.send(r, next, ack)).status, 'refused');
  await assert.rejects(r.requestBodyQuiescence(t, i), /untouched/);
  const fresh = await r.requestBodyQuiescence(t, who); assert.notEqual(fresh.request, q.request);
  await assert.rejects(r.requestBodyQuiescence({ ...t, epoch: 99 }, who), /fenced/);
});

test('starting body preview refuses mixed occupants and fences every compatible occupant before staging', async () => {
  const h = host(), r = await h.room(true, false, true);
  await h.join(r, 1, true, true); const old = (await h.join(r, 2)).ws;
  const t = ticket(await start(r)), i = { accountId: 1, connection: r.players.get(1).connectionToken };
  await assert.rejects(r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim), /incompatible occupants/);
  assert.equal(r.bodyHandoffRequired, false); assert.equal(h.stored.has('room-body-handoff-v1'), false);
  r.webSocketClose(old); old.close(1000, 'closed'); const peer = (await h.join(r, 2, true, true)).ws;
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  assert.equal(r.players.get(2).bodyHandoff, true); assert.equal(peer.store.bodyHandoff, true);
  h.send(r, peer, { t: 'body', name: 'b' }); assert.equal(r.players.get(2).body, null);
});

test('retained publication receipt removes status reads but preserves fresh host confirmation, restart and lost-reply reconciliation', async () => {
  const h = host(); let room = await h.room(), reads = 0, confirms = 0, lost = false, fresh = true, sequence = 1;
  const hostTicket = { world: 'world-1', fence: 1, owner: 'host-a' };
  const source = { poses: async () => ({ publicationProtocol: 1, sequence, at: 100000 + sequence * 250, runUntil: 200000, frame: frame(sequence) }),
    confirmPoses: async (_, revision) => { confirms++; assert.equal(revision.sequence, sequence); return fresh; } };
  const rpc = { npcAuthorityStatus: value => { reads++; return room.npcAuthorityStatus(value); },
    configureNpcAuthority: (...args) => room.configureNpcAuthority(...args),
    async publishNpcSnapshot(...args) { const result = await room.publishNpcSnapshot(...args);
      if (lost) { lost = false; throw Error('lost reply'); } return result; } };
  let result = await publishHostPoses(source, rpc, hostTicket, { acquire: true });
  const receipt = JSON.parse(JSON.stringify(result.roomState)); reads = 0;
  sequence++; h.at(100250);
  result = await publishHostPoses(source, rpc, hostTicket, { roomState: receipt });
  assert.equal(reads, 0); assert.equal(confirms, 2); assert.equal(result.sequence, 2);
  room = await h.room(); sequence++; h.at(100500); lost = true;
  result = await publishHostPoses(source, rpc, hostTicket, { roomState: receipt });
  assert.equal(result.status, 'reconciled'); assert.equal(result.duplicate, true); assert.equal(reads, 1);
  assert.equal(room.npcAuthority.sequence, 3);
  fresh = false; sequence++; h.at(100750); reads = 0;
  assert.equal((await publishHostPoses(source, rpc, hostTicket, { roomState: receipt })).status, 'superseded');
  assert.equal(reads, 0); assert.equal(room.npcAuthority.sequence, 3);
  fresh = true;
  for (const changed of [{ owner: 'other' }, { runUntil: 200001 }, { cadence: 'rolling-4-v1' },
    { authority: { ...receipt.authority, epoch: 2 } }, { authority: { ...receipt.authority, revision: 0 } },
    { authority: { ...receipt.authority, v: 2, format: 'mixed-1' } }])
    await assert.rejects(publishHostPoses(source, rpc, hostTicket, { roomState: { ...receipt, ...changed } }), /retained/);
  assert.equal(reads, 0, 'mismatched saved metadata cannot trigger a Room claim');
});

test('retained publication receipt cannot undo release or takeover even with acquire requested', async () => {
  const h = host(), room = await h.room(); let sequence = 1, claims = 0;
  const hostTicket = { world: 'world-1', fence: 1, owner: 'host-a' };
  const source = { poses: async () => ({ publicationProtocol: 1, sequence, at: 100000, runUntil: 200000, frame: frame(sequence) }), confirmPoses: async () => true };
  const rpc = { npcAuthorityStatus: value => room.npcAuthorityStatus(value),
    configureNpcAuthority: (...args) => { claims++; return room.configureNpcAuthority(...args); },
    publishNpcSnapshot: (...args) => room.publishNpcSnapshot(...args) };
  const { roomState } = await publishHostPoses(source, rpc, hostTicket, { acquire: true });
  await room.configureNpcAuthority(roomState.authority.revision, { mode: 'browser', world: hostTicket.world, epoch: 1, owner: hostTicket.owner });
  sequence++; h.at(101000);
  await assert.rejects(publishHostPoses(source, rpc, hostTicket, { acquire: true, roomState }), /fenced/);
  assert.equal(room.npcAuthority.mode, 'browser'); assert.equal(claims, 1);
  await room.configureNpcAuthority(room.npcAuthority.revision, { mode: 'server', world: hostTicket.world, epoch: 2, owner: 'host-b', runUntil: 200000 });
  await assert.rejects(publishHostPoses(source, rpc, hostTicket, { acquire: true, roomState }), /fenced/);
  assert.equal(room.npcAuthority.owner, 'host-b'); assert.equal(claims, 1);
});


test('closed-only recovery survives Room lease/run expiry but cannot send grants or cross an authority takeover', async () => {
  const h = host(), r = await h.room(true, false, true), ws = (await h.join(r, 1, true, true)).ws;
  const a = await start(r), t = ticket(a), i = { accountId: 1, connection: r.players.get(1).connectionToken };
  await r.stageBodyHandoff(t, i, bodyPrep, 'clanker', bodyRequest, bodyClaim);
  await h.send(r, ws, { t: 'body-ready', request: bodyRequest });
  assert.equal(await r.closedBodyRecovery(t, i), null);
  const cancel = { result: { ok: false, reason: 'cancelled' }, transfer: null };
  await assert.rejects(r.completeClosedBodyRecovery(t, i, 2, cancel), /closed body/);
  h.at(100200); await h.send(r, ws, { t: 'body-decline', request: bodyRequest });
  const before = structuredClone(r.npcAuthority), sent = ws.sent.length;
  h.at(210000); const restarted = await h.room(true, false, true);
  assert.equal(ws.sent.slice(sent).some(m => ['body-grant', 'body-active', 'body-live'].includes(m.t)), false);
  const afterWake = ws.sent.length;
  const work = await restarted.closedBodyRecovery(t, i);
  assert.equal(work.pending.closed, true); assert.equal(work.close.kind, 'reconcile');
  await assert.rejects(restarted.pendingBodyHandoff(t, i), /disabled or fenced/);
  await assert.rejects(restarted.deliverBodyHandoff(t, i), /disabled or fenced/);
  await restarted.completeClosedBodyRecovery(t, i, work.pending.command.revision, cancel);
  assert.equal(ws.sent.length, afterWake);
  assert.deepEqual(structuredClone(restarted.npcAuthority), before, 'cleanup never renews simulation authority');
  assert.equal(restarted.players.has(1), true, 'body cleanup does not close voice');
  const closed = await restarted.closedBodyRecovery(t, i);
  assert.equal(closed.close.kind, 'retire');
  h.fail(); await assert.rejects(restarted.resolveClosedBodyRecovery(t, i, closed.close.revision, null), /storage unavailable/);
  assert.ok(await restarted.closedBodyRecovery(t, i));
  const newer = await restarted.configureNpcAuthority(a.revision, { mode: 'server', world: 'world-1', epoch: 2, owner: 'new', runUntil: 300000 });
  await assert.rejects(restarted.resolveClosedBodyRecovery(t, i, closed.close.revision, null), /disabled or fenced/);
  await restarted.resolveClosedBodyRecovery(ticket(newer, 'new'), i, closed.close.revision, null);
  assert.equal(await restarted.closedBodyRecovery(ticket(newer, 'new'), i), null);
  const disabled = await h.room(false);
  await assert.rejects(disabled.closedBodyRecovery(ticket(newer, 'new'), i), /disabled or fenced/);
});


test('Room body presence persists before sending, bounds stalled credit across wake, and gives late joiners the latest frame', async () => {
  const h = host(), room = await h.room(true, false, true);
  const a = (await h.join(room, 1, true, false, true)).ws, b = (await h.join(room, 2, true, false, true)).ws;
  h.send(room, a, { t: 'hub', on: true }); h.send(room, b, { t: 'hub', on: true });
  const selected = await start(room), owner = ticket(selected), hostTicket = { owner: 'host-a', fence: 1, world: 'world-1' };
  const registry = new SessionRegistry({ protocol: 'host-session-v5', world: 'world-1' });
  const admitted = registry.connect({ protocol: 'host-session-v5', world: 'world-1', accountId: 1, bodyId: 'body-a', zone: 'outside',
    body: { kind: 'ooga', motion: { x: 1, y: 10, z: 2, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: false },
      equipment: { weapon: 'gun', mode: 'combat', primaryOwned: true, secondaryOwned: false, selectedSlot: 1,
        unlimited: false, jetpack: false, jetpackOwned: false } } }, 100000);
  registry.disconnect({ accountId: admitted.session.accountId, generation: admitted.session.generation, token: admitted.session.token }, 100000);
  const frame = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 1,
    now: 100000, expiresAt: 110000, views: [registry.view(1)], departures: [] };
  const delivered = ws => ws.sent.filter(m => m?.t === 'body-presence');
  h.fail(); await assert.rejects(room.retainBodyPresence(owner, hostTicket, frame), /storage/);
  assert.equal((await room.deliverBodyPresence(owner)).delivered, 0);
  assert.equal(delivered(a).length, 0);
  await room.retainBodyPresence(owner, hostTicket, frame);
  assert.equal((await room.deliverBodyPresence(owner)).delivered, 2);
  assert.equal(delivered(a).length, 1); assert.equal(delivered(b).length, 1);
  assert.equal(JSON.stringify(delivered(a)).includes(admitted.session.token), false);
  const initialReads = h.presenceReads();
  const exposed = await room.bodyPresenceStatus(owner); exposed.frame.views[0].motion.x = 999;
  assert.equal((await room.bodyPresenceStatus(owner)).frame.views[0].motion.x, 1, 'external status cannot mutate the cache');
  assert.equal(h.presenceReads(), initialReads, 'repeated status reuses the single retained frame');

  h.at(100250);
  const next = { ...structuredClone(frame), revision: 2, now: 100250 }; next.views[0].motion.x = 2;
  await room.retainBodyPresence(owner, hostTicket, next);
  assert.equal((await room.deliverBodyPresence(owner)).delivered, 0, 'one outstanding frame per socket');
  await h.send(room, a, { t: 'body-presence-ack', authority: owner.revision, epoch: 1, revision: 999 });
  assert.equal(delivered(a).length, 1, 'forged ACK cannot free credit');
  await h.send(room, a, { t: 'body-presence-ack', authority: owner.revision, epoch: 1, revision: 1 });
  assert.equal(delivered(a).length, 2); assert.equal(delivered(a).at(-1).frame.revision, 2);
  assert.equal(delivered(b).length, 1, 'stalled viewer never receives a queue');
  const restored = await h.room(true, false, true);
  assert.equal((await restored.deliverBodyPresence(owner)).delivered, 0, 'credit survives hibernation');
  const late = (await h.join(restored, 3, true, false, true)).ws;
  assert.equal((await h.join(restored, 4)).response.status, 409, 'retained presence refuses incompatible late joins');
  await h.send(restored, late, { t: 'hub', on: true });
  assert.equal(delivered(late).length, 1, 'hub entry automatically receives retained bodies');
  assert.equal((await restored.deliverBodyPresence(owner)).delivered, 0);
  assert.equal(delivered(late).at(-1).frame.views[0].motion.x, 2);

  h.at(110001);
  const later = (await h.join(restored, 5, true, false, true)).ws; await h.send(restored, later, { t: 'hub', on: true });
  assert.equal((await restored.deliverBodyPresence(owner)).delivered, 0);
  assert.equal(delivered(later).at(-1).stale, true, 'expired view is marked stale and grants no control');
  assert.equal(delivered(later).at(-1).sentAt, 110001, 'late arrival is aged from send time, not snapshot creation');
  assert.equal(delivered(later).at(-1).frame.now, 100250);
  const disabled = await h.room(true, false, false);
  await assert.rejects(disabled.deliverBodyPresence(owner), /disabled/);
  assert.equal((await h.join(disabled, 4, true, false, true)).response.status, 409, 'rollback cannot silently omit retained presence');
  await assert.rejects(restored.configureNpcAuthority(owner.revision, { mode: 'browser', owner: 'host-a', epoch: 1, world: 'world-1' }), /presence drain/);
  const taken = await restored.configureNpcAuthority(owner.revision, { mode: 'server', world: 'world-1', epoch: 2,
    owner: 'host-b', runUntil: 200000 });
  await assert.rejects(restored.deliverBodyPresence(owner), /fenced/);
  const replacement = { ...next, epoch: 2, revision: 3, now: 110001, expiresAt: 120001 };
  await restored.retainBodyPresence(ticket(taken, 'host-b'), { owner: 'host-b', fence: 2, world: 'world-1' }, replacement);
  assert.equal((await restored.deliverBodyPresence(ticket(taken, 'host-b'))).delivered, 4);
  assert.equal(delivered(b).length, 2, 'Room takeover replaces the old credit');
  const cohort = [], beforeJoinReads = h.presenceReads();
  for (const id of [4, ...Array.from({ length: 27 }, (_, i) => i + 6)]) {
    const ws = (await h.join(restored, id, true, false, true)).ws; cohort.push(ws);
    await h.send(restored, ws, { t: 'hub', on: true });
  }
  const current = ticket(taken, 'host-b');
  assert.equal((await restored.deliverBodyPresence(current)).delivered, 0, 'all late joiners received state on hub entry');
  assert.equal(h.presenceReads(), beforeJoinReads, 'late joiners reuse the current committed cache');
  for (let i = 0; i < 20; i++) {
    await h.send(restored, late, { t: 'hub', on: false }); await h.send(restored, late, { t: 'hub', on: true });
  }
  assert.equal(h.presenceReads(), beforeJoinReads, 'hub toggles neither re-read storage nor reset delivery credit');
  assert.ok(cohort.every(ws => delivered(ws).length === 1));
  await restored.retainBodyPresence(current, { owner: 'host-b', fence: 2, world: 'world-1' }, { ...replacement, revision: 4 });
  assert.equal((await restored.deliverBodyPresence(current)).delivered, 0, '32 connections do not create per-viewer queues');
  assert.ok(cohort.every(ws => delivered(ws).length === 1));
});

test('net routes public body frames only after explicit preview negotiation and preserves the authority fence through reconnect', async () => {
  const h = host(), room = await h.room(true, false, true), viewer = (await h.join(room, 1, true, false, true)).ws;
  h.send(room, viewer, { t: 'hub', on: true });
  const selected = await start(room), owner = ticket(selected);
  const registry = new SessionRegistry({ protocol: 'host-session-v5', world: 'world-1' });
  const connected = registry.connect({ protocol: 'host-session-v5', world: 'world-1', accountId: 1, bodyId: 'body-a', zone: 'outside',
    body: { kind: 'clanker', motion: { x: 3, y: 12, z: 4, yaw: 1, vx: 2, vy: -4, vz: 1, grounded: false },
      equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1,
        unlimited: false, jetpack: false, jetpackOwned: false } } }, 100000);
  const { accountId, generation, token } = connected.session;
  registry.disconnect({ accountId, generation, token }, 100000);
  const f = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 1,
    now: 100000, expiresAt: 110000, views: [registry.view(1)], departures: [] };
  await room.retainBodyPresence(owner, { world: 'world-1', owner: 'host-a', fence: 1 }, f);
  await room.deliverBodyPresence(owner);
  const message = viewer.sent.find(m => m?.t === 'body-presence');
  const descriptor = viewer.sent.filter(m => m?.t === 'npc-authority').at(-1);
  const welcome = viewer.sent.find(m => m?.t === 'welcome');
  assert.ok(welcome.features.includes('host-body-presence-v1'));
  for (const enabled of [false, true]) {
    const c = client({ manual: true, bodyPresencePreview: enabled }); await c.net.start();
    let ws = c.sockets[0]; const receive = m => ws.onmessage({ data: JSON.stringify(m) });
    assert.equal(ws.url.includes('body-presence=1'), enabled);
    receive(descriptor); receive(welcome); receive(message);
    assert.equal(c.sent.filter(m => m?.t === 'body-presence-ack').length, enabled ? 1 : 0);
    if (!enabled) { assert.equal(c.net.bodyPresence.sample(), null); c.net.dispose(); continue; }
    const view = c.net.bodyPresence.sample();
    assert.equal(view.now >= message.sentAt, true); assert.equal(view.frame.views[0].motion.y, 12);
    assert.equal(view.frame.views[0].motion.vy, 0); assert.equal(c.net.bodyReclaim.active, false);
    const count = c.sent.length, bad = structuredClone(message); bad.frame.views[0].token = token;
    receive(bad); assert.equal(c.sent.length, count); assert.equal(c.net.bodyPresence.sample().frame.revision, 1);
    const retiredMessage = ws.onmessage, retiredClose = ws.onclose, retiredOpen = ws.onopen;
    ws.onclose(); assert.equal(c.net.bodyPresence.sample(), null);
    c.reconnect(); ws = c.sockets.at(-1); receive(welcome);
    const beforeRetry = c.sent.length;
    retiredMessage({ data: JSON.stringify(message) });
    retiredMessage({ data: JSON.stringify({ t: 'kick', reason: 'replaced' }) });
    retiredOpen(); retiredClose();
    assert.equal(c.net.state.room, 'live', 'retired callbacks cannot close the replacement');
    assert.equal(c.sent.length, beforeRetry, 'retired public body delivery cannot ACK on the new socket');
    assert.equal(c.net.bodyPresence.sample(), null);
    receive(message);
    assert.equal(c.net.bodyPresence.sample().frame.revision, 1);
    receive({ t: 'npc-authority', authority: { ...descriptor.authority, v: 2, format: 'mixed-1', revision: 2 } });
    assert.equal(c.net.bodyPresence.sample(), null, 'net-incompatible mixed authority also fences presentation');
    receive(message); assert.equal(c.net.bodyPresence.sample(), null);
    c.net.dispose();
  }
});

test('host character lookup separates account body IDs from authenticated character identity and form', async () => {
  const c = client({ manual: true }), self = { handle: 'self-character', github: 'a' }, offline = { handle: 'offline-character', github: 'b' };
  c.BL.characters.get = name => [self, offline].find(row => row.handle === name || row.github === name) || null;
  c.BL.accountIdentities.accountForId = id => id === 2 ? { handle: offline.handle } : null;
  c.BL.accountIdentities.accountForHandle = handle => handle === offline.handle ? { id: 2 } : null;
  await c.net.start();
  const view = (id, kind = 'clanker') => ({ accountId: id, bodyId: `player:${id}`, kind });
  assert.equal(c.net.hostCharacter(view(1)), self);
  assert.equal(c.net.hostCharacter(view(1, 'ooga')), self, 'form is separate from stable account identity');
  assert.equal(c.net.hostCharacter(view(2)), offline, 'canonical mapping survives absent viewer/roster entry');
  c.net.remotes.set(3, { id: 3, login: 'b' });
  assert.equal(c.net.hostCharacter(view(3)), null, 'another account cannot take a canonically mapped character');
  for (const wrong of [{ ...view(1), bodyId: 'player:2' }, { ...view(1), bodyId: 'gorilla:a' },
    { ...view(1), kind: 'future' }, { ...view(1), accountId: '1' }, view(999)]) assert.equal(c.net.hostCharacter(wrong), null);
  c.net.dispose();
});

test('actual net quiescence blocks ordinary possession, keeps voice and requires the final migration receipt', async () => {
  for (const preview of [false, true]) {
    const c = client({ manual: true, bodyMigrationPreview: preview });
    const owner = { handle: 'a' }; c.BL.characters.get = () => owner;
    await c.net.start(); const ws = c.sockets[0], send = m => ws.onmessage({ data: JSON.stringify(m) });
    const authority = { v: 1, revision: 1, mode: 'server', world: 'world-1', epoch: 1 };
    send({ t: 'npc-authority', authority });
    send({ t: 'welcome', you: { id: 1 }, players: [], features: [], host: 0, now: 1000, connectionToken: 'viewer-connection' });
    const q = { t: 'body-quiesce', v: 1, accountId: 1, connection: 'viewer-connection', request: '7'.repeat(32), authority };
    c.sent.length = 0; send(q); assert.equal(c.sent.length, 0, 'missing scene proof cannot acknowledge');
    let idle = false; const remove = c.net.bodyReclaim.setQuiescer(() => idle);
    send(q); assert.equal(c.sent.length, 0);
    idle = true; send(q);
    if (!preview) { assert.equal(c.sent.length, 0); assert.equal(c.net.bodyReclaim.quiescing, false); remove(); c.net.dispose(); continue; }
    assert.equal(c.sent.at(-1).t, 'body-quiescent'); assert.ok(c.net.mayDrive('a')); assert.ok(c.net.mayDriveGorilla('a'));
    const sent = c.sent.length; c.net.setBody('a'); c.net.sendPose(9, 8, 7, 0); assert.equal(c.sent.length, sent);
    c.net.setMuted(true); assert.equal(c.sent.at(-1).t, 'mute'); assert.equal(ws.readyState, 1);
    const released = { v: 1, revision: 2, mode: 'browser', world: null, epoch: 0 };
    send({ t: 'npc-authority', authority: released }); assert.ok(c.net.mayDrive('a'));
    send({ t: 'body-release', v: 1, accountId: 1, connection: 'viewer-connection', authority: released });
    assert.equal(c.net.mayDrive('a'), null); assert.equal(c.net.state.body, null);
    c.net.setBody('a'); assert.equal(c.sent.at(-1).t, 'body'); assert.equal(ws.readyState, 1);
    remove(); c.net.dispose();
  }
});

test('canonical Clanker live receipt sets local form without a legacy body claim or replaying cached movement', async () => {
  const c = client({ manual: true, bodyMigrationPreview: true, bodyMovementPreview: true }); c.BL.characters.get = name => name === 'a' ? { handle: 'a' } : null;
  await c.net.start(); const ws = c.sockets[0], send = m => ws.onmessage({ data: JSON.stringify(m) });
  assert.ok(ws.url.includes('body-migration=1'));
  send({ t: 'welcome', you: { id: 1 }, players: [], features: [globalThis.BL.bodyReclaim.FEATURE, globalThis.BL.bodyMotion.FEATURE],
    host: 0, now: 1000, connectionToken: 'fixture-connection' });
  let released = 0, captured = 0;
  const checkpoint = {body:['a',2,8,3,.7,0,0,0,0,1]};
  c.net.bodyReclaim.setAdapter({ prepare: () => ({}), preflight: () => true, apply: () => true, activate: () => true, release() { released++; }, capture() { captured++; return checkpoint; } });
  const request = '8'.repeat(32), now = Math.ceil(c.net.serverNow());
  send({ t: 'body-prepare', v: 2, request, accountId: 1, bodyId: 'player:1', kind: 'clanker',
    world: 'world-1', epoch: 1, expiresAt: now + 10000 });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const transfer = { v: 1, protocol: 'host-session-v5', world: 'world-1', epoch: 1, revision: 1,
    at: now, expiresAt: now + 10000, resetResources: 'defaults',
    view: { accountId: 1, bodyId: 'player:1', kind: 'clanker', generation: 1, state: 'offered', deadline: now + 60000 }, checkpoint };
  send({ t: 'body-grant', request, transfer });
  send({ t: 'body-active', request, transfer: { ...transfer, revision: 2, expiresAt: now + 1000,
    view: { ...transfer.view, state: 'starting' } } });
  c.sent.length = 0;
  send({ t: 'body-live', request, epoch: 1, generation: 1, revision: 2 });
  assert.equal(c.net.state.body, 'player:1'); assert.equal(c.net.state.bodyKind, 'gorilla'); assert.equal(c.net.state.bodyName, 'a');
  assert.equal(c.sent.some(m => m.t === 'body' || m.t === 'pose'), false);
  const g = [2, 0, 0, 0, 0, 0]; c.net.sendPose(2, 8, 3, .7, g);
  assert.equal(c.sent.at(-1).t, globalThis.BL.bodyMotion.TYPE); assert.equal(captured, 1);
  assert.equal(c.sent.at(-1).request, request); assert.equal(c.sent.at(-1).sequence, 1);
  assert.deepEqual(globalThis.BL.bodyMotion.unpack(c.sent.at(-1).data, 'a'), checkpoint.body);
  assert.equal(c.sent.some(m => m.t === 'body' || m.t === 'pose'), false);
  const migratedRequest = '9'.repeat(32);
  send({ t: 'body-prepare', v: 2, request: migratedRequest, accountId: 1, bodyId: 'player:1', kind: 'ooga',
    world: 'world-1', epoch: 2, expiresAt: now + 10000 });
  assert.equal(released, 1); assert.equal(c.net.bodyReclaim.active, false);
  c.net.setMuted(true); assert.equal(c.sent.at(-1).t, 'mute', 'body migration preserves voice transport');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const migrated = { ...transfer, epoch: 2, view: { ...transfer.view, kind: 'ooga', generation: 2 } };
  send({ t: 'body-grant', request: migratedRequest, transfer: migrated });
  send({ t: 'body-active', request: migratedRequest, transfer: { ...migrated, revision: 2, expiresAt: now + 1000,
    view: { ...migrated.view, state: 'starting' } } });
  send({ t: 'body-live', request, epoch: 1, generation: 1, revision: 2 });
  assert.equal(c.net.bodyReclaim.active, false, 'old live receipt cannot enable the replacement');
  send({ t: 'body-live', request: migratedRequest, epoch: 2, generation: 2, revision: 2 });
  assert.equal(c.net.state.bodyKind, 'ooga', 'same stable account body ID refreshes its newly granted form');
  assert.equal(c.net.state.bodyName, 'a'); assert.equal(ws.readyState, 1);
  send({ t: 'body-stop', request: migratedRequest });
  assert.equal(c.net.bodyReclaim.active, false); assert.equal(released, 2);
  assert.equal(c.sent.at(-1).t, 'body-decline');
  const sent = c.sent.length; c.net.sendPose(9, 8, 3, .7); assert.equal(c.sent.length, sent);
  c.net.setMuted(false); assert.equal(c.sent.at(-1).t, 'mute'); assert.equal(ws.readyState, 1);
  const authority = { v: 1, revision: 3, mode: 'browser', world: null, epoch: 0 };
  const receipt = { t: 'body-release', v: 1, accountId: 1, connection: 'fixture-connection', authority };
  send(receipt); assert.equal(c.net.bodyReclaim.required, true, 'release requires the separately accepted authority fence');
  send({ t: 'npc-authority', authority });
  assert.equal(c.net.bodyReclaim.required, true, 'NPC release alone never clears body mode');
  send({ ...receipt, connection: 'old' }); assert.equal(c.net.bodyReclaim.required, true);
  c.sent.length = 0; send(receipt);
  assert.equal(c.net.bodyReclaim.required, false); assert.equal(c.net.state.body, null);
  assert.equal(c.sent.some(m => m.t === 'pose' || m.t === 'shot'), false);
  assert.deepEqual(c.sent.filter(m => m.t === 'body').map(m => m.name), [null]);
  c.net.setBody('a'); const fresh = c.sent.length;
  send(receipt); assert.equal(c.net.state.body, 'a'); assert.equal(c.sent.length, fresh);
  ws.onclose(); assert.equal(c.net.bodyReclaim.active, false);
  assert.equal(released, 2);
  c.net.dispose();
});
