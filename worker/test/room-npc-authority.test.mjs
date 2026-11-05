import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import * as authority from "../src/room-npc-authority.js";
import "../../src/js/npc-pose.js";
import { createNpcPose } from "../src/npc-pose.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";
import { publishHostPoses } from "../src/host-room.js";
import { compactSimulation } from "../src/simulation-checkpoint.js";
import { rig } from "./fixtures/npc-pose-rig.mjs";
import { managedRigs } from "./fixtures/clanker-pose-rig.mjs";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
const wire = globalThis.BL.npcAuthority;
const frame = (x = 1, signature = 0) => {
  const data = new ArrayBuffer(16 + 112 * 4), h = new Uint32Array(data,0,4), f = new Float32Array(data,16);
  h.set([2,signature,1,0]); f[0]=0; f[1]=1; f[2]=x; f[12]=f[13]=f[14]=f[43]=1;
  return data;
};
const roomSource = readFileSync(new URL('../src/room.js',import.meta.url),'utf8').replace(/import\s+[\s\S]*?from\s+"[^"]+";/g,'').replace('export class Room','class Room')+'\nglobalThis.Room=Room;';
function host() {
  let now=100000, failWrite=false, ready=Promise.resolve(),lastBlock=ready,wraps=0; const accepted=[], alarms=[], stored=new Map();
  const names=['a','b','c',...Array.from({length:31},(_,i)=>'fixture'+i)];
  const socket=()=>({sent:[],closed:null,store:null,send(value){this.sent.push(typeof value==='string'?JSON.parse(value):value.slice(0));},close(code,reason){this.closed={code,reason};},serializeAttachment(a){this.store=structuredClone(a);},deserializeAttachment(){return structuredClone(this.store);}});
  class Clock extends Date {static now(){return now;}}
  class Response {constructor(body,init={}){this.status=init.status;this.body=body;this.webSocket=init.webSocket;}}
  const context={...protocol,...studioPolicy,...authority,sha256Hex,getPlayer,sfuClient:()=>null,
    packNpcSnapshot:r=>{wraps++;return authority.packNpcSnapshot(r);},CAST_ROWS:names.map(handle=>({handle,github_login:handle})),
    DurableObject:class {constructor(ctx,env){this.ctx=ctx;this.env=env;}},
    WebSocketPair:class {constructor(){this[0]=socket();this[1]=socket();}},Response,WebSocketRequestResponsePair:class{},
    URL,crypto,Date:Clock,Map,Set,ArrayBuffer,DataView,Uint8Array,setTimeout,clearTimeout,console};
  runInNewContext(roomSource,context);
  const storage={get:async k=>Array.isArray(k)?new Map(k.filter(x=>stored.has(x)).map(x=>[x,structuredClone(stored.get(x))])):structuredClone(stored.get(k)),
    put:async(k,v)=>stored.set(k,structuredClone(v)),delete:async k=>stored.delete(k),getAlarm:async()=>alarms.at(-1)??null,setAlarm:async t=>alarms.push(t),
    async transaction(fn){const copy=structuredClone(stored);const result=await fn({get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>{if(failWrite){failWrite=false;throw Error('storage unavailable');}copy.set(k,structuredClone(v));}});stored.clear();for(const [k,v]of copy)stored.set(k,v);return result;}};
  const ctx={storage,setWebSocketAutoResponse(){},blockConcurrencyWhile(fn){const result=ready.then(fn);lastBlock=result;ready=result.catch(()=>{});return result;},acceptWebSocket:ws=>accepted.push(ws),getWebSockets:()=>accepted.filter(ws=>!ws.closed),getWebSocketAutoResponseTimestamp:()=>null};
  return {at:t=>{now=t;},fail:()=>{failWrite=true;},stored,accepted,wraps:()=>wraps,async room(enabled=true,mixed=false){const r=new context.Room(ctx,enabled?{VIRTUAL_HOST_PREVIEW:'1',...(mixed?{VIRTUAL_HOST_MIXED_PREVIEW:'1'}:{})}:{});await lastBlock;return r;},
    async join(r,id,version=true){const before=accepted.length;const response=await r.fetch({url:'https://test.invalid/room'+(version?'?npc-authority='+(version===true?1:version):''),headers:new Headers({upgrade:'websocket','x-player-id':String(id),'x-player-login':names[id-1],'x-player-contributor':'0'})});return {ws:accepted[before],response};},
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
  assert.equal((await h.join(r,3,3)).response.status,409);
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
function client(){
  const sockets=[],sent=[],timers=[];class Socket{static OPEN=1;constructor(url){this.url=url;this.readyState=1;sockets.push(this);}send(v){sent.push(typeof v==='string'&&v!=='ping'?JSON.parse(v):v);}close(){this.readyState=3;}}
  const BL={...globalThis.BL,voice:{setPeers(){},restart(){},stop(){}},characters:{get:()=>null},contributors:{addTemporary(){}},donations:{},accountIdentities:{accountForId:()=>null,accountForHandle:()=>null},pilot:{}};
  const context={window:{BL,setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout(){},setInterval:()=>1,clearInterval(){}},document:{hidden:false,cookie:'',addEventListener(){},removeEventListener(){}},
    location:{protocol:'https:',host:'test.invalid',pathname:'/',search:''},fetch:async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({player:{id:1,login:'a',display:'a'}})}),AbortSignal,WebSocket:Socket,performance,Date,ArrayBuffer,DataView,Uint8Array,Uint32Array,Float32Array,URLSearchParams};
  runInNewContext(readFileSync(new URL('../../src/js/net.js',import.meta.url),'utf8'),context);
  return {net:BL.net,sockets,sent,BL,reconnect:()=>timers.at(-1)()};
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
  const a=cave(),b=cave(),crew={list:[a,b],player:b,workSites:[]};
  runInNewContext(readFileSync(new URL('../../src/js/npc-sync.js',import.meta.url),'utf8'),{window:{BL},TextEncoder,TextDecoder,ArrayBuffer,Uint32Array,Float32Array,Uint8Array,Int32Array});
  const sync=BL.npcSync.create({crew,fx:{},onPlan(){},onHit(){},onModelChange(){}});
  assert.equal(a.puppet,true);assert.equal(b.puppet,false);sync.update(.05);assert.equal(sync.role,'server');
  BL.net.state.room='connecting';BL.net.state.hostId=0;a.puppet=false;sync.prepare();assert.equal(a.puppet,true);
  BL.net.npcFrame=frame(1,999);BL.net.state.npcVersion++;sync.update(.05);assert.equal(a.puppet,true,'incompatible roster cannot enable local AI');
  BL.net.state.npcAuthority={mode:'browser',revision:2};sync.prepare();sync.update(.05);assert.equal(a.puppet,false);
  sync.dispose();
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
  h.send(room,a,{t:'npc-ack',revision:room.npcAuthority.revision,sequence:1});
  const latest=(await runner.poses(ticket,options)).frame;assert.deepEqual(readers[0].frame(binary(a).at(-1)),latest);
  const packet=globalThis.BL.npcPosePacket.unpack(latest),follower=f.make();
  assert.equal(new Uint32Array(packet.ooga,0,4)[2],53);assert.equal(packet.clankers.length,53);assert.ok(latest.byteLength<=32768);
  follower.createPoseProjector(world).apply(packet.clankers[52].pose);assert.equal(f.display(follower),f.display(actors[52]));
  const restored=await h.room(true,true);runner=make();
  assert.equal((await publishHostPoses(runner,restored,ticket,options)).duplicate,true);
  const late=(await h.join(restored,3,2)).ws;h.send(restored,late,{t:'hub',on:true});const lateReader=wire.create({mixed:true});
  lateReader.accept(restored.npcAuthorityStatus().authority);assert.deepEqual(lateReader.frame(binary(late)[0]),latest);
  now+=10000;h.at(now);const old=ticket;ticket=await runner.claim('mixed-restart');
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
  assert.equal(saved.simulation.steps, 0); assert.equal(writes, 1, 'publication cannot step or rewrite host state');
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
  const next = await resumed.claim('runner-b');
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
