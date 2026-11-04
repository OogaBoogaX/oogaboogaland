import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";
import * as studioPolicy from "../src/studio-policy.js";
const harness = t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  let initialized;
  const writes = [];
  const accepted = [];
  const socket = () => ({
    sent: [], bins: [], closed: null, store: null,
    send(text) { if (typeof text === "string") this.sent.push(JSON.parse(text)); else this.bins.push(text); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; } }
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = {
    ...protocol, ...studioPolicy, sha256Hex, getPlayer, sfuClient: () => null,
    CAST_ROWS: ["a","b","c","d",...Array.from({length:70},(_,i)=>"ooga"+i)].map(login=>({handle:login,github_login:login})),
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, crypto, Date, Map, Set, setTimeout, clearTimeout, console, ArrayBuffer, DataView,
  };
  runInNewContext(source, context);
  const stored = new Map();
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => (initialized = fn()), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: { get: async (key) => structuredClone(Array.isArray(key) ? new Map(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key)), put: async (key, value) => { const copy=structuredClone(value); writes.push({key,value:copy}); stored.set(key,copy); }, getAlarm: async () => null, setAlarm: async () => {} },
  };
  const h = { ctx, stored, writes, advance:ms=>t.mock.timers.tick(ms) };
  h.room = new context.Room(ctx, {});
  const join = async (id, login) => {
    await initialized;
    const before = accepted.length;
    await h.room.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const send = (ws, msg) => h.room.webSocketMessage(ws, JSON.stringify(msg.t === "hockey" ? { v: 4, ...(msg.k === "join" ? { e: 0 } : {}), ...msg } : msg));
  h.join=join;h.send=send;h.wake=async()=>{if(h.room.flushTimer)clearTimeout(h.room.flushTimer);h.room=new context.Room(ctx,{});await initialized;return h.room;};
  return h;
};
const W = protocol.HOCKEY;
const frame = () => [0,660,0,600,0,200,0,2000,0,0,-1,0,-1000,-1000,0,0,1,0];
const messages = ws => ws.sent.filter(m => m.t === "hockey");
const seat = async (h,id,login) => {
  const ws = await h.join(id,login), p = h.room.players.get(id);
  h.send(ws,{t:"body",name:login}); h.send(ws,{t:"zone",name:W.ZONE});
  h.send(ws,{t:"pose",x:16.3,y:0,z:-3.1,yaw:Math.PI});
  return {ws,p};
};
const cmd = (h,p,k,extra={}) => {
  // Refill controls to isolate state/ownership tests; rate bounds have their own adversarial test below.
  if (p.p.hockeyBuckets) p.p.hockeyBuckets.control = {tokens:2,at:Date.now()};
  h.send(p.ws,{t:"hockey",k,i:0,s:h.room.hockeyTables[0]?.s,...extra});
};
test("hockey parser bounds every coordinate, action, sequence and payload", () => {
  const base={t:"hockey",v:4,k:"frame",i:0,s:"0123456789abcdef",q:1,a:frame()};
  assert.ok(protocol.parseClientMessage(JSON.stringify(base)));
  for (const patch of [{i:3},{s:"wrong"},{q:-1},{q:1.1},{a:[]},{a:[...frame(),1]},{a:frame().map(()=>null)},{k:"take-over"}]) assert.equal(protocol.parseClientMessage(JSON.stringify({...base,...patch})),null);
  for (let i=0;i<18;i++) { const a=frame(); a[i]=1e9; assert.equal(protocol.parseClientMessage(JSON.stringify({...base,a})),null,`field ${i}`); }
  assert.equal(protocol.parseClientMessage(JSON.stringify({...base,padding:"x".repeat(256)})),false);
  assert.ok(Buffer.byteLength(JSON.stringify(base))<=protocol.MESSAGE_MAX);
  const join={t:"hockey",v:4,k:"join",i:0,e:1};assert.equal(protocol.parseClientMessage(JSON.stringify(join)).e,1);
  for(const e of [-1,2,null,1.5,"1",undefined])assert.equal(protocol.parseClientMessage(JSON.stringify({...join,e})),null);
  assert.equal(protocol.parseClientMessage(JSON.stringify({...join,v:3})),null,"older clients cannot enter a mirrored game");
  const input={t:"hockey",v:4,k:"input",i:0,s:base.s,q:1,x:0,y:500};
  assert.ok(protocol.parseClientMessage(JSON.stringify(input)));
  for(const patch of [{x:1001},{y:-1},{y:1001},{y:.5},{y:null},{y:undefined,hit:1}]) assert.equal(protocol.parseClientMessage(JSON.stringify({...input,...patch})),null);
  const path={...input,p:[-1000,0,1000,1000,0,500],d:0};
  assert.ok(protocol.parseClientMessage(JSON.stringify(path)));
  for(const patch of [{p:[]},{p:[0]},{p:[0,500,0]},{p:Array(14).fill(0)},{p:[1001,500,0,500]},{p:[0,-1,0,500]},{p:[0,500.1,0,500]},{p:[0,501]},{d:2},{d:true},{d:undefined},{p:undefined,d:0}])
    assert.equal(protocol.parseClientMessage(JSON.stringify({...path,...patch})),null,JSON.stringify(patch));
  const widest={...input,q:2147483647,x:-1000,y:1000,p:Array(6).fill([-1000,1000]).flat(),d:1};
  assert.ok(JSON.stringify(widest).length<=protocol.MESSAGE_MAX);
  const bonus=frame();bonus[14]=10;assert.equal(protocol.parseClientMessage(JSON.stringify({...base,a:bonus})),null);
});
test("an older live attachment is closed on wake and older clients cannot join or drive v4", async t => {
  const h=harness(t), a=await seat(h,1,"a"), b=await seat(h,2,"b");
  h.send(a.ws,{t:"hockey",v:undefined,k:"join",i:0});assert.equal(h.room.hockeyTables[0],null,"old client cannot reserve a v3 table");
  cmd(h,a,"join");assert.ok(h.room.hockeyTables[0]);
  h.send(b.ws,{t:"hockey",v:undefined,k:"join",i:0});assert.deepEqual([...h.room.hockeyTables[0].ids],[1,0],"old client cannot join v3 lobby");
  cmd(h,b,"join");const s=h.room.hockeyTables[0];
  h.send(a.ws,{t:"hockey",v:undefined,k:"ready",i:0,s:s.s});
  assert.deepEqual([...s.ready],[false,false],"old ready cannot start a v3 match");
  cmd(h,a,"ready");cmd(h,b,"ready");
  const before=messages(a.ws).length;
  h.send(a.ws,{t:"hockey",v:2,k:"frame",i:0,s:s.s,q:0,a:frame()});
  assert.equal(s.q,-1,"old host frames cannot drive a v4 match");
  h.send(b.ws,{t:"hockey",v:undefined,k:"input",i:0,s:s.s,q:0,x:1000,y:500});
  assert.equal(messages(a.ws).length,before,"old input cannot drive a v3 match");
  a.ws.store.hockey.wire=3;await h.wake();
  assert.equal(h.room.hockeyTables[0],null,"legacy live attachment cannot restore");
  assert.equal(a.ws.store.hockey,null,"legacy attachment is cleared");
  assert.ok(messages(a.ws).some(m=>m.k==="table"&&m.phase==="closed"),"seats are notified of closure");
  h.room.webSocketClose(a.ws);h.room.webSocketClose(b.ws);
});
test("two authenticated lobby seats require both ready; spectators cannot steal a started solo or human game", async t => {
  const h=harness(t), a=await seat(h,1,"a"), b=await seat(h,2,"b"), c=await seat(h,3,"c");
  const far=W.seat(0,1,0,{}),near=W.seat(0,0,0,{});
  h.send(a.ws,{t:"pose",x:far.x,y:0,z:far.z,yaw:far.yaw});h.send(b.ws,{t:"pose",x:near.x,y:0,z:near.z,yaw:near.yaw});
  cmd(h,a,"join",{e:1}); cmd(h,b,"join",{e:1});
  const s=h.room.hockeyTables[0]; assert.deepEqual([...s.ids],[1,2]);assert.equal(s.e,1,"first player retains the far end");assert.equal(messages(a.ws).at(-1).e,1);assert.equal(messages(b.ws).at(-1).e,1);assert.ok(near.z>W.TABLES[0][1]&&far.z<W.TABLES[0][1],"two seats occupy opposite ends");
  cmd(h,b,"ready"); assert.equal(s.phase,"lobby"); cmd(h,a,"ready"); assert.equal(s.phase,"play");
  cmd(h,c,"join"); assert.equal(messages(c.ws).at(-1).k,"busy"); assert.deepEqual([...s.ids],[1,2]);
  cmd(h,c,"frame",{q:5,a:frame()}); assert.equal(s.q,-1);
  cmd(h,b,"frame",{q:6,a:frame()}); assert.equal(s.q,-1);
  cmd(h,a,"leave"); assert.equal(h.room.hockeyTables[0],null);
  h.advance(5100);cmd(h,a,"join"); cmd(h,a,"ready"); cmd(h,b,"join"); assert.equal(messages(b.ws).at(-1).k,"busy");
  assert.deepEqual([...h.room.hockeyTables[0].ids],[1,0]);
  a.p.hockeyBuckets.control={tokens:0,at:Date.now()};
  h.send(a.ws,{t:"hockey",k:"leave",i:0,s:h.room.hockeyTables[0].s});
  assert.equal(h.room.hockeyTables[0],null,"exit releases the seat even when join + ready exhausted controls");
  h.room.webSocketClose(a.ws); h.room.webSocketClose(b.ws); h.room.webSocketClose(c.ws);
});
test("host frames and guest inputs are sequenced, compact, zone-scoped, rate-bounded and replayed to late spectators", async t => {
  const h=harness(t), a=await seat(h,1,"a"), b=await seat(h,2,"b"), c=await seat(h,3,"c");
  cmd(h,a,"join");cmd(h,b,"join");cmd(h,a,"ready");cmd(h,b,"ready");
  h.send(c.ws,{t:"zone",name:"outside"}); const before=messages(c.ws).length;
  const writesBeforeFrames=h.writes.length;
  cmd(h,a,"frame",{q:0,a:frame()}); const s=h.room.hockeyTables[0];assert.equal(s.q,0);
  cmd(h,a,"frame",{q:0,a:frame()});assert.equal(s.q,0);
  const bad=frame();bad[8]=bad[14]=4;cmd(h,a,"frame",{q:1,a:bad});assert.equal(s.q,0);
  cmd(h,b,"input",{q:1,x:1000,y:500});assert.equal(messages(a.ws).at(-1).k,"input");
  const count=messages(a.ws).length;cmd(h,b,"input",{q:1,x:-1000,y:600});assert.equal(messages(a.ws).length,count);
  cmd(h,b,"input",{q:2,x:1000,y:500,p:[-1000,500,1000,500],d:0});
  assert.deepEqual(messages(a.ws).at(-1).p,[-1000,500,1000,500]);assert.equal(messages(a.ws).at(-1).d,0);
  const pathCount=messages(a.ws).length;cmd(h,b,"input",{q:2,x:0,y:500,p:[0,500],d:1});assert.equal(messages(a.ws).length,pathCount);
  cmd(h,a,"input",{q:3,x:0,y:500,p:[0,500],d:1});assert.equal(messages(a.ws).length,pathCount,"host may not spoof guest paths");
  cmd(h,b,"input",{q:3,x:0,y:500,p:[0,501],d:0});assert.equal(messages(a.ws).length,pathCount,"malformed path is rejected");
  for(let q=2;q<200;q++)cmd(h,a,"frame",{q,a:frame()});
  assert.ok(s.q<12,`burst stopped at ${s.q}`);assert.equal(messages(c.ws).length,before);
  assert.equal(h.writes.length,writesBeforeFrames,"frames/inputs never write storage");
  h.send(c.ws,{t:"zone",name:W.ZONE});assert.equal(messages(c.ws).at(-1).q,s.q);
  assert.deepEqual(messages(c.ws).at(-1).a,frame());
  h.room.webSocketClose(a.ws);h.room.webSocketClose(b.ws);h.room.webSocketClose(c.ws);
});
test("seat release, expiry, body/zone changes, socket replacement and wake restore cannot resurrect an abandoned game",async t=>{
  const h=harness(t),a=await seat(h,1,"a"),b=await seat(h,2,"b");
  cmd(h,a,"join",{e:1});cmd(h,b,"join");
  const original=h.room.hockeyTables[0], wake = await h.wake();assert.equal(wake.hockeyTables[0].e,1,"table orientation survives hibernation");
  assert.deepEqual([...wake.hockeyTables[0].ids],[1,2]);
  assert.notEqual(wake.hockeyTables[0],original,"wake reconstructs from serialized socket attachments");
  h.send(b.ws,{t:"zone",name:"outside"});assert.equal(h.room.hockeyTables[0],null);
  h.advance(5100);cmd(h,a,"join");h.send(a.ws,{t:"body",name:null});assert.equal(h.room.hockeyTables[0],null);
  h.send(a.ws,{t:"body",name:"a"});h.advance(5100);cmd(h,a,"join");h.room.hockeyTables[0].seen[0]=Date.now()-16000;protocol.hockey.sweep(h.room);assert.equal(h.room.hockeyTables[0],null);
  h.advance(5100);cmd(h,a,"join");const replacement=await h.join(1,"a");assert.equal(h.room.hockeyTables[0],null);
  protocol.hockey.restore(h.room);assert.equal(h.room.hockeyTables[0],null);
  h.room.webSocketClose(replacement);h.room.webSocketClose(b.ws);
});
test("joining requires an owned Ooga near a table, and leaving hockey retains Arcade voice eligibility",async t=>{
  const h=harness(t),a=await seat(h,1,"a"),b=await seat(h,2,"b");
  h.send(a.ws,{t:"body",name:"b"});cmd(h,a,"join");assert.equal(h.room.hockeyTables[0],null);
  h.send(a.ws,{t:"body",name:"a"});a.p.x=0;cmd(h,a,"join");assert.equal(h.room.hockeyTables[0],null);
  a.p.x=16.3;cmd(h,a,"join");cmd(h,a,"ready");
  const eligible=()=>protocol.voicePeers([...h.room.players.values()]).get(1);
  a.p.voice.track="audio";b.p.voice.track="audio";a.p.voice.pub="a";b.p.voice.pub="b";a.p.voice.sub="a-sub";b.p.voice.sub="b-sub";
  assert.deepEqual([...eligible()],[2]); const before=JSON.stringify(eligible());cmd(h,a,"leave");assert.equal(JSON.stringify(eligible()),before);assert.equal(a.p.zone,W.ZONE);assert.equal(a.p.body,"a");
  h.room.webSocketClose(a.ws);h.room.webSocketClose(b.ws);
});

test("serialized session-to-Room transport retries a dropped join, cancels before acknowledgement, relays input and closes both seats",async t=>{
  const h=harness(t), a=await seat(h,1,"a"), b=await seat(h,2,"b"), pending=[];
  const clients=[];
  const connect=(p,preferredEnd=0)=>{
    const listeners=new Set(), row={starts:0,ends:0,closed:0,inputs:[],local:[],paths:[],frames:[],a:frame(),index:p.ws.sent.length};
    const net={state:{selfId:p.p.id,room:"live"},subscribeHockey:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},sendHockey:m=>{pending.push([p.ws,JSON.stringify({t:"hockey",...m,v:4})]);return true;},sendPose:(x,y,z,yaw)=>pending.push([p.ws,JSON.stringify({t:"pose",x,y,z,yaw})])};
    const BL={hockeyWire:W,net};runInNewContext(readFileSync(new URL("../../src/js/hockey-session.js",import.meta.url),"utf8"),{window:{BL},performance:{now:()=>Date.now()}});
    const play={shared(){},multiplayer(){},capture:()=>row.a,receive:a=>row.frames.push([...a]),peerInput:(x,y)=>row.inputs.push([x,y]),localPoint:(x,y)=>row.local.push([x,y]),peerPath:(p,d)=>{row.paths.push({p:[...p],d});row.inputs.push([p[p.length-2]/1000,p[p.length-1]/1000]);},peerIdle(){},act(){},remoteAct(){}};
    row.aim={x:1,depth:.5};row.session=BL.hockeySession.create({slot:0,play,aim:row.aim,preferredEnd,lobby(){},sideChanged(){},start(){row.starts++;},end(){row.ends++;},closed(){row.closed++;}});
    row.deliver=()=>{while(row.index<p.ws.sent.length){const m=JSON.parse(JSON.stringify(p.ws.sent[row.index++]));if(m.t==="hockey")for(const fn of listeners)fn(m);}};
    clients.push(row);return row;
  };
  const pump=()=>{while(pending.length){const [ws,json]=pending.shift();h.room.webSocketMessage(ws,json);}for(const c of clients)c.deliver();};
  let host=connect(a,1);host.session.tick(.1,false);host.session.dispose();pump();
  assert.equal(h.room.hockeyTables[0],null,"queued join followed by cancellation does not strand a lobby");
  a.p.hockeyBuckets.control={tokens:0,at:Date.now()};host=connect(a,1);host.session.tick(.1,false);pump();assert.equal(host.session.table,null);
  h.advance(5100);host.session.tick(1.1,false);pump();assert.ok(host.session.table,"unacknowledged join retries after the real room bucket refills");
  const guest=connect(b,1);guest.session.tick(.1,false);pump();host.session.ready();guest.session.ready();pump();
  assert.equal(host.starts,1);assert.equal(guest.starts,1);
  host.session.tick(.001,false);guest.session.tick(.001,false);pump();
  assert.ok(a.p.z<W.TABLES[0][1]&&b.p.z>W.TABLES[0][1],"host keeps the chosen far end and guest uses the opposite end");
  host.session.point(-1,.5);host.session.point(1,.5);assert.deepEqual(host.local,[[-1,.5],[1,.5]],"host pointer reversals reach local physics");
  guest.session.act();guest.session.point(-1,.5);guest.session.point(1,.5);guest.session.tick(.1,true);pump();assert.deepEqual(host.inputs.at(-1),[1,.5]);
  assert.deepEqual(host.paths.at(-1),{p:[-1000,500,1000,500],d:false},"out-and-back points survive the serialized Worker relay");
  h.advance(100);for(let n=0;n<7;n++)guest.session.point(n/10,n%2?.6:.5);guest.session.tick(.1,true);pump();
  assert.deepEqual(host.paths.at(-1),{p:[600,500,1000,500],d:true},"overflow resynchronizes before later points");
  h.advance(100);guest.aim.x=0;
  for(let n=0;n<=100;n++)guest.session.point(n/100,.5);
  for(let n=99;n>=0;n--)guest.session.point(n/100,.5);
  guest.session.tick(.1,true);pump();
  assert.deepEqual(host.paths.at(-1),{p:[0,500,1000,500,0,500],d:false},"dense collinear out-and-back retains its reversal without overflow");
  h.advance(600);host.session.tick(.1,false);guest.session.point(.7,.5);guest.session.tick(.1,true);pump();
  assert.equal(host.paths.at(-1).d,true,"the first packet after idle resynchronizes even without a sequence gap");
  h.advance(600);guest.session.point(.8,.5);guest.session.tick(.1,true);pump();
  assert.equal(host.paths.at(-1).d,true,"arrival after a host stall resynchronizes even without an intervening host tick");
  h.advance(100);const sessionId=h.room.hockeyTables[0].s;
  h.send(b.ws,{t:"hockey",k:"input",i:0,s:sessionId,q:6,x:0,y:500,p:[0,500],d:0});host.deliver();
  assert.deepEqual(host.paths.at(-1),{p:[0,500],d:true},"a sequence gap resynchronizes without a phantom stroke");
  const received=host.paths.length;h.send(b.ws,{t:"hockey",k:"input",i:0,s:sessionId,q:5,x:-1000,y:500,p:[-1000,500],d:0});host.deliver();
  assert.equal(host.paths.length,received,"out-of-order input never reaches host physics");
  host.session.tick(.1,true);pump();assert.equal(guest.frames.length,1);assert.deepEqual(guest.frames[0],host.a);
  for(let goal=1;goal<=6;goal++){h.advance(100);host.a=frame();host.a[8]=host.a[14]=goal;host.session.tick(.1,true);pump();}
  h.advance(100);host.a=frame();host.a[8]=host.a[14]=7;host.a[16]=0;host.session.finish();pump();assert.equal(guest.ends,1);assert.equal(h.room.hockeyTables[0].phase,"done");
  // A delayed cancellation cannot cancel an active/finished session; it only covers an unacknowledged lobby join.
  h.send(b.ws,{t:"hockey",k:"cancel",i:0});assert.ok(h.room.hockeyTables[0]);
  host.session.dispose();pump();assert.equal(h.room.hockeyTables[0],null);assert.equal(guest.closed,0,"completed result stays visible when the winner leaves");guest.session.dispose();
  h.advance(5100);const nextHost=connect(a), nextGuest=connect(b);
  nextHost.session.tick(.1,false);pump();nextGuest.session.tick(.1,false);pump();
  nextHost.session.ready();nextGuest.session.ready();pump();
  assert.equal(nextHost.starts,1);assert.equal(nextGuest.starts,1);
  nextGuest.session.dispose();pump();assert.equal(h.room.hockeyTables[0],null);
  assert.equal(nextHost.closed,1,"either participant leaving before seven closes the other client's match");
  assert.equal(nextHost.ends,0,"an exit is not a scored finish");nextHost.session.dispose();
  h.room.webSocketClose(a.ws);h.room.webSocketClose(b.ws);
});

test("replays share one persistent budget across zone toggles, watch and repeated joins", async t=>{
  const h=harness(t), players=[];
  for(let i=0;i<3;i++){
    const p=await seat(h,i+1,["a","b","c"][i]);players.push(p);
    const at=W.seat(i,0,0,{});h.send(p.ws,{t:"pose",...at});
    h.send(p.ws,{t:"hockey",k:"join",i});
    if(i===2){assert.equal(h.room.hockeyTables[i],null,"third immediate admission exceeds room burst");h.advance(600);h.send(p.ws,{t:"hockey",k:"join",i});}
    assert.ok(h.room.hockeyTables[i]);
  }
  const observer=await seat(h,4,"d");h.advance(4000);
  const count=()=>[...players,observer].reduce((n,p)=>n+messages(p.ws).filter(m=>m.k==="table").length,0), before=count();
  for(let i=0;i<100;i++){h.send(observer.ws,{t:"zone",name:"outside"});h.send(observer.ws,{t:"zone",name:W.ZONE});h.send(observer.ws,{t:"hockey",k:"watch",i:i%3});}
  assert.equal(count()-before,3,"one account can replay only its three-payload burst");
  for(let i=0;i<3;i++)for(let n=0;n<30;n++)h.send(players[i].ws,{t:"hockey",k:"join",i});
  assert.ok(count()-before<=8,"all replay routes share the room eight-payload burst");
  const debt=structuredClone(h.stored.get("hockeyLimitsV1"));assert.equal(debt.accounts.find(a=>a.id===4).replay.tokens,0);
  await h.wake();const afterWake=count();
  h.send(observer.ws,{t:"zone",name:"outside"});h.send(observer.ws,{t:"zone",name:W.ZONE});assert.equal(count(),afterWake);
  observer.ws.close(1000);h.room.webSocketClose(observer.ws);
  const next=await seat(h,4,"d");assert.equal(messages(next.ws).length,0,"new socket cannot reset replay debt");
  for(const p of [...players,next]){p.ws.close(1000);h.room.webSocketClose(p.ws);}
  await h.wake();const cold=await seat(h,4,"d");h.send(cold.ws,{t:"hockey",k:"watch",i:0});assert.equal(messages(cold.ws).length,0,"cold wake retains debt even without old sockets");
  h.advance(1100);h.send(cold.ws,{t:"body",name:null});h.send(cold.ws,{t:"zone",name:"outside"});h.send(cold.ws,{t:"hockey",k:"watch",i:0});assert.equal(messages(cold.ws).length,0,"outside cannot replay");h.send(cold.ws,{t:"zone",name:W.ZONE});h.send(cold.ws,{t:"hockey",k:"watch",i:0});assert.equal(messages(cold.ws).at(-1).phase,"closed");h.room.webSocketClose(cold.ws);
});

test("admission cooldown survives reconnect/wake, readiness is idempotent, and first goals have a zero baseline",async t=>{
  const h=harness(t),a=await seat(h,1,"a"),b=await seat(h,2,"b");cmd(h,a,"join");cmd(h,b,"join");
  cmd(h,b,"ready");const count=messages(a.ws).length;
  for(let i=0;i<50;i++)cmd(h,b,"ready");assert.equal(messages(a.ws).length,count,"repeated readiness emits no table broadcast");
  cmd(h,a,"ready");const s=h.room.hockeyTables[0], win=frame();win[8]=win[14]=7;
  cmd(h,a,"frame",{q:0,a:win});assert.equal(s.q,-1);const early=frame();early[16]=0;cmd(h,a,"frame",{q:1,a:early});assert.equal(s.q,-1);
  cmd(h,a,"frame",{q:2,a:frame()});assert.equal(s.q,2);
  a.p.hockeyBuckets.control.tokens=0;cmd(h,a,"leave");assert.equal(h.room.hockeyTables[0],null);
  a.ws.close(1000);h.room.webSocketClose(a.ws);await h.wake();const replacement=await seat(h,1,"a");
  h.advance(600);h.send(replacement.ws,{t:"pose",...W.seat(1,0,0,{})});
  cmd(h,replacement,"join",{i:1});assert.equal(h.room.hockeyTables[1],null,"same account cannot bypass cooldown by reconnecting at another table");
  h.send(replacement.ws,{t:"pose",...W.seat(0,0,0,{})});
  cmd(h,replacement,"join");assert.equal(h.room.hockeyTables[0],null,"same account cannot immediately recreate after reconnect");
  h.advance(2100);cmd(h,replacement,"join");assert.equal(h.room.hockeyTables[0],null,"table cooldown outlasts account admission cooldown");
  h.advance(3100);cmd(h,replacement,"join");assert.ok(h.room.hockeyTables[0]);
  h.room.webSocketClose(replacement.ws);h.room.webSocketClose(b.ws);
});

test("ledger capacity never evicts retained debt, rejected writes fail closed and cleanup remains immediate",async t=>{
  const h=harness(t),a=await seat(h,1,"a");cmd(h,a,"join");
  const limits=h.room.hockeyLimits, expires=Date.now()+60000;
  limits.accounts=Array.from({length:64},(_,i)=>({id:i+100,until:expires,nextSeat:expires,replay:{at:Date.now(),tokens:0,rate:1,burst:3}}));
  const ids=limits.accounts.map(a=>a.id), before=messages(a.ws).length;h.send(a.ws,{t:"hockey",k:"watch",i:0});assert.deepEqual(limits.accounts.map(a=>a.id),ids);assert.equal(messages(a.ws).length,before);
  h.advance(600);limits.accounts=[];h.ctx.storage.put=async()=>{throw new Error("storage unavailable");};
  h.send(a.ws,{t:"hockey",k:"watch",i:0});await Promise.resolve();await Promise.resolve();assert.equal(h.room.hockeyLimitsFailed,true);
  const failedAt=messages(a.ws).length;h.send(a.ws,{t:"zone",name:"outside"});h.send(a.ws,{t:"zone",name:W.ZONE});
  assert.equal(h.room.hockeyTables[0],null,"cleanup never waits for admission/replay storage");
  const closed=messages(a.ws).slice(failedAt).filter(m=>m.phase==="closed");assert.equal(closed.length,1);
  h.advance(5100);cmd(h,a,"join");assert.equal(h.room.hockeyTables[0],null,"new admission remains closed after persistence failure");h.room.webSocketClose(a.ws);
});

test("hall replay retries wait for connectivity, restart after loss and retire unconfirmed stale cache",()=>{
  const callbacks=new Set(),sent=[],stops=[0,0,0],orientation=[null,null,null],games=stops.map((_,i)=>({stop(){stops[i]++;},receive(){},orientation(side){orientation[i]=side;}}));
  const net={state:{room:"off"},hockeyTables:[{k:"table",i:0,s:"0123456789abcdef",e:1,phase:"play",q:1,a:frame()},null,null],subscribeHockey:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);},sendHockey:m=>sent.push(m)};
  const BL={hockeyWire:W,net};runInNewContext(readFileSync(new URL("../../src/js/hockey-session.js",import.meta.url),"utf8"),{window:{BL},performance:{now:()=>Date.now()}});
  const watch=BL.hockeySession.watch(games);assert.equal(orientation[0],1,"late hall observers restore the first player's chosen end");watch.update(60);assert.equal(sent.length,0);net.state.room="live";watch.update(.1);assert.equal(sent.length,1);
  for(const fn of callbacks)fn({k:"table",i:0,s:"ffffffffffffffff",phase:"closed"});
  const before=stops[0];watch.update(13);assert.equal(stops[0],before+1);watch.update(13);assert.equal(stops[0],before+1,"expiry clears stale presentation only once");
  for(const fn of callbacks)fn({k:"lost"});watch.update(.1);assert.equal(sent.length,2,"reconnect starts a fresh bounded retry window");watch.dispose();assert.equal(callbacks.size,0);
});


test("surviving socket attachments require a committed admission proof for every seat",async t=>{
  const h=harness(t),a=await seat(h,1,"a"),b=await seat(h,2,"b"), put=h.ctx.storage.put;
  let drop=true;h.ctx.storage.put=async(key,value)=>{if(key!=="hockeyLimitsV1"||!drop)return put(key,value);};
  cmd(h,a,"join");assert.ok(a.ws.store.hockey,"simulate attachment surviving a discarded ledger write");
  await h.wake();assert.equal(h.room.hockeyTables[0],null);assert.equal(a.ws.store.hockey,null,"uncommitted first seat cannot restore");
  drop=false;h.advance(5100);cmd(h,a,"join");assert.ok(h.room.hockeyTables[0]);await h.wake();assert.deepEqual([...h.room.hockeyTables[0].ids],[1,0],"committed first-seat proof restores");
  drop=true;cmd(h,b,"join");assert.deepEqual(a.ws.store.hockey.ids,[1,2]);
  await h.wake();assert.equal(h.room.hockeyTables[0],null,"uncommitted second seat invalidates the whole restored session");
  h.room.webSocketClose(a.ws);h.room.webSocketClose(b.ws);
});

// Prepared for post-deployment validation; no simulation frames are persisted to extend a match.
test("untimed shared matches survive ten minutes and hibernation, then either seat may end both", async t => {
  const h=harness(t), a=await seat(h,1,"a"), b=await seat(h,2,"b");
  assert.ok(a.ws.sent.find(m=>m.t==="welcome").features.includes(W.FEATURE));
  for (const humans of [false,true]) {
    h.advance(5100); cmd(h,a,"join"); if(humans)cmd(h,b,"join");
    cmd(h,a,"ready"); if(humans)cmd(h,b,"ready");
    const writes=h.writes.length, sid=h.room.hockeyTables[0].s;
    for(let n=0;n<301;n++) { h.advance(2000);cmd(h,a,"beat");if(humans)cmd(h,b,"beat"); }
    assert.equal(h.room.hockeyTables[0].s,sid);assert.equal(h.writes.length,writes);
    await h.wake();assert.equal(h.room.hockeyTables[0].s,sid,"proof remains valid beyond the old eight-minute expiry");
    cmd(h,a,"frame",{q:0,a:frame()});const bad=frame();bad[10]=1000;cmd(h,a,"frame",{q:1,a:bad});
    assert.equal(h.room.hockeyTables[0].q,0,"a shared host cannot reintroduce a match clock");
    const end=frame();end[16]=0;cmd(h,a,"frame",{q:2,a:end});assert.equal(h.room.hockeyTables[0].phase,"play","premature terminal frame rejected");
    cmd(h,humans?b:a,"leave");assert.equal(h.room.hockeyTables[0],null);
    assert.equal(messages(a.ws).at(-1).phase,"closed");assert.equal(messages(b.ws).at(-1).phase,"closed");
  }
  h.room.webSocketClose(a.ws);h.room.webSocketClose(b.ws);
});

test("shared hockey presentation derives one solo Clanker and head scores from table state, with complete cleanup", () => {
  const root={children:[]}, rigs=[], tables=[null,null,null];
  const node=()=>({visible:true,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},children:[],world:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
  const addChild=(parent,...children)=>{for(const child of children){parent.children.push(child);child.parent=parent;}};
  const removeChild=(parent,child)=>{parent.children.splice(parent.children.indexOf(child),1);child.parent=null;};
  const cave=()=>{const r=node(),head=node();head.geometry={};addChild(r,head);return {root:r,parts:{head,armR:node()},headOpen:{},headClosed:{}};};
  const humans=new Map([[1,cave()],[2,cave()]]);
  let now=10000;
  const BL={hockeyWire:W,net:{state:{me:{id:1},body:"a",selfId:1},hockeyTables:tables,serverNow:()=>now},
    scene:{addChild,removeChild,createNode:opts=>Object.assign(node(),opts),boundsOf:()=>({min:[-.2,0,-.2],max:[.2,1,.2]})},
    models:{caveman:cave},contributors:{traitsFor:()=>({})},crew:{bodyHeightOf:()=>2},arcadeModels:{staffHat:()=>({})},
    agent:{create:()=>{const r=cave();r.poseManaged=(dt,x,y,z,yaw,speed)=>{Object.assign(r.root.position,{x,y,z});r.speed=speed;};r.dispose=()=>removeChild(root,r.root);r.liveGeometry=()=>{};rigs.push(r);return r;}}};
  runInNewContext(readFileSync(new URL("../../src/js/hockey-players.js",import.meta.url),"utf8"),{window:{BL}});
  const view=BL.hockeyPlayers.create({root,games:[{rivalU:0}],body:id=>humans.get(id)});
  view.update(.1);assert.equal(rigs.length,0,"no session means no fake opponent");
  tables[0]={s:"0123456789abcdef",ids:[1,0],phase:"lobby",start:now,a:null};view.update(.1);assert.equal(rigs.length,0);
  tables[0].phase="play";view.update(.1);assert.equal(rigs.length,1);assert.ok(rigs[0].root.position.x<W.TABLES[0][0]);
  now+=2400;view.update(.1);assert.equal(rigs[0].root.position.x,W.TABLES[0][0]);assert.equal(rigs[0].speed,0);
  const a=frame();a[8]=a[14]=2;a[9]=a[15]=3;tables[0].a=a;
  const scores=[],ctx={save(){},restore(){},strokeText(){},fillText:s=>scores.push(s)};view.draw(ctx,(x,y)=>({x,y}));assert.deepEqual(scores,["2","3"]);
  tables[0].ids=[1,2];view.update(.1);assert.equal(root.children.length,0,"two humans never retain a Clanker");
  tables[0].ids=[1,0];view.update(.1);assert.equal(rigs[1].root.position.x,W.TABLES[0][0],"late viewers use server start time rather than replaying the approach");
  tables[0]=null;view.update(.1);assert.equal(root.children.length,0);
  view.dispose();assert.equal(root.children.length,0);
});


test("every video cabinet arbitrates simultaneous players, pins presence and releases only its own request", async t => {
  const h = harness(t), a = await seat(h, 1, "a"), b = await seat(h, 2, "b");
  let q = 0;
  for (const cabinet of protocol.CABINETS.entries) {
    const claim = { t: "cabinet", op: "take", id: cabinet.id, q: ++q };
    h.advance(1000);
    await Promise.all([h.send(a.ws, claim), h.send(b.ws, claim)]);
    assert.equal(h.room.players.get(1).cabinet.id, cabinet.id);
    assert.ok(!h.room.players.get(2).cabinet);
    assert.equal(b.ws.sent.filter(m => m.t === "cabinet").at(-1).ok, false);
    h.send(a.ws, { t: "pose", x: 99, y: 20, z: 99, yaw: 0 });
    h.send(a.ws, { t: "zone", name: "outside" });
    h.send(a.ws, { t: "body", name: null });
    const p = h.room.players.get(1);
    assert.deepEqual([p.x, p.y, p.z, p.yaw, p.body, p.zone], [cabinet.x, cabinet.y, cabinet.z, cabinet.yaw, "a", "arcade.hall"]);
    // Playing a cabinet keeps the hall's two-way voice; the active ghost hunt stays in its separate group.
    const listener = h.room.players.get(2), voice = { sub: "listen", track: "mic" };
    p.voice = listener.voice = voice;
    const ghost = { id: 3, body: "c", zone: "arcade-hunt", voice };
    const peers = protocol.voicePeers([p, listener, ghost]);
    assert.deepEqual(peers.get(1), [2]);
    assert.deepEqual(peers.get(2), [1]);
    assert.deepEqual(peers.get(3), []);
    h.send(b.ws, { ...claim, op: "leave" });
    h.send(a.ws, { ...claim, op: "leave", q: q + 1 });
    assert.equal(p.cabinet.id, cabinet.id);
    h.send(a.ws, { ...claim, op: "leave" });
    assert.equal(p.cabinet, null);
    h.advance(1000); h.send(b.ws, claim);
    assert.equal(h.room.players.get(2).cabinet.id, cabinet.id);
    h.send(b.ws, { ...claim, op: "leave" });
  }
  for (const patch of [{ id: "race" }, { id: "hockey" }, { q: 0 }, { q: 1.5 }, { op: "steal" }]) {
    assert.equal(protocol.parseClientMessage(JSON.stringify({ t: "cabinet", id: "mine", q: 1, op: "take", ...patch })), null);
  }
  if (h.room.flushTimer) clearTimeout(h.room.flushTimer);
});

test("cabinet ownership survives hibernation but not disconnect, body revocation or socket replacement", async t => {
  const h = harness(t), a = await seat(h, 1, "a"), b = await seat(h, 2, "b");
  const claim = { t: "cabinet", op: "take", id: "mine", q: 1 };
  h.send(a.ws, claim);
  await h.wake();
  h.send(b.ws, claim);
  assert.equal(h.room.players.get(1).cabinet.id, "mine");
  h.room.drop(h.room.players.get(1), "closed");
  h.advance(1000); h.send(b.ws, claim);
  assert.equal(h.room.players.get(2).cabinet.id, "mine");
  h.room.release(h.room.players.get(2), "revoked");
  assert.equal(h.room.players.get(2).cabinet, null);
  h.send(b.ws, claim);
  assert.equal(b.ws.sent.filter(m => m.t === "cabinet").at(-1).ok, false);
  h.send(b.ws, { t: "body", name: "b" }); h.advance(1000); h.send(b.ws, claim);
  const replaced = await h.join(2, "b");
  assert.notEqual(replaced, b.ws);
  assert.ok(!h.room.players.get(2).cabinet);
  if (h.room.flushTimer) clearTimeout(h.room.flushTimer);
});
