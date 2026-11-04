import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as studioPolicy from "../src/studio-policy.js";
import * as authority from "../src/room-npc-authority.js";
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
  let now=100000, failWrite=false, ready=Promise.resolve(),lastBlock=ready; const accepted=[], alarms=[], stored=new Map();
  const socket=()=>({sent:[],closed:null,store:null,send(value){this.sent.push(typeof value==='string'?JSON.parse(value):value.slice(0));},close(code,reason){this.closed={code,reason};},serializeAttachment(a){this.store=structuredClone(a);},deserializeAttachment(){return structuredClone(this.store);}});
  class Clock extends Date {static now(){return now;}}
  class Response {constructor(body,init={}){this.status=init.status;this.body=body;this.webSocket=init.webSocket;}}
  const context={...protocol,...studioPolicy,...authority,sha256Hex,getPlayer,sfuClient:()=>null,
    CAST_ROWS:['a','b','c'].map(handle=>({handle,github_login:handle})),
    DurableObject:class {constructor(ctx,env){this.ctx=ctx;this.env=env;}},
    WebSocketPair:class {constructor(){this[0]=socket();this[1]=socket();}},Response,WebSocketRequestResponsePair:class{},
    URL,crypto,Date:Clock,Map,Set,ArrayBuffer,DataView,Uint8Array,setTimeout,clearTimeout,console};
  runInNewContext(roomSource,context);
  const storage={get:async k=>Array.isArray(k)?new Map(k.filter(x=>stored.has(x)).map(x=>[x,structuredClone(stored.get(x))])):structuredClone(stored.get(k)),
    put:async(k,v)=>stored.set(k,structuredClone(v)),delete:async k=>stored.delete(k),getAlarm:async()=>alarms.at(-1)??null,setAlarm:async t=>alarms.push(t),
    async transaction(fn){const copy=structuredClone(stored);const result=await fn({get:async k=>structuredClone(copy.get(k)),put:async(k,v)=>{if(failWrite){failWrite=false;throw Error('storage unavailable');}copy.set(k,structuredClone(v));}});stored.clear();for(const [k,v]of copy)stored.set(k,v);return result;}};
  const ctx={storage,setWebSocketAutoResponse(){},blockConcurrencyWhile(fn){const result=ready.then(fn);lastBlock=result;ready=result.catch(()=>{});return result;},acceptWebSocket:ws=>accepted.push(ws),getWebSockets:()=>accepted.filter(ws=>!ws.closed),getWebSocketAutoResponseTimestamp:()=>null};
  return {at:t=>{now=t;},fail:()=>{failWrite=true;},stored,accepted,async room(enabled=true){const r=new context.Room(ctx,enabled?{VIRTUAL_HOST_PREVIEW:'1'}:{});await lastBlock;return r;},
    async join(r,id,version=true){const before=accepted.length;const response=await r.fetch({url:'https://test.invalid/room'+(version?'?npc-authority=1':''),headers:new Headers({upgrade:'websocket','x-player-id':String(id),'x-player-login':['','a','b','c'][id],'x-player-contributor':'0'})});return {ws:accepted[before],response};},
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
  send({t:'welcome',you:{id:1},players:[],features:[],host:1,npcAuthority:a,now:1000});
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
