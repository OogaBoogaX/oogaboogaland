import { test } from "node:test";
import assert from "node:assert/strict";
import { createPassiveBody, PASSIVE } from "../src/passive-body.js";
import { SessionRegistry, GRACE_MS } from "../src/host-sessions.js";
import { prepare } from "./fixtures/npc-walker-fixture.mjs";
const motion = (o={}) => ({x:0,y:4,z:3,yaw:.7,vx:0,vy:0,vz:0,grounded:false,...o});
const equipment = () => ({weapon:'gun',mode:'combat',magazine:17,spareAmmo:[4,22],primaryOwned:true,secondaryOwned:true,selectedSlot:2,unlimited:false,jetpack:true,jetpackOwned:true,fuel:.37});
const claim = () => ({protocol:'body-test',world:'walker-fixture-1',accountId:1,bodyId:'resident',zone:'outside',body:{kind:'ooga',motion:motion(),equipment:equipment()}});
const withId = m => ({bodyId:'resident',zone:'outside',kind:'ooga',...m});
async function physics(radius=.2,height=1.8){const f=await prepare(),mesh=f.catalog.create();let calls=0;const step=createPassiveBody({gravity:12,world:()=>{calls++;return {...mesh,radius,height};}});return {mesh,step,get calls(){return calls;}};}

test('Clanker flight-sized grace body falls and reclaims without narrowing its collision shape',async()=>{
  const p=await physics(2.25,2.8),options={protocol:'body-test',world:'walker-fixture-1',adapter:{stepPassive:p.step}};
  const reg=new SessionRegistry(options),c=claim();c.body.kind='clanker';c.body.motion=motion({x:-4,z:-4,vy:-2});
  const old=reg.connect(c,100000).session;reg.disconnect(old,100000);
  const resumed=SessionRegistry.restore(reg.checkpoint(),options);resumed.recover(101000,[]);
  const result=resumed.connect({...c,body:undefined},101000);
  assert.equal(result.resumed,true);assert.equal(result.view.kind,'clanker');assert.equal(result.view.motion.y,0);
  assert.deepEqual(result.view.equipment,c.body.equipment);
  assert.throws(()=>p.mesh.clearAt(0,1,0,3.01,2.8),/invalid/);
  const unsupported=await physics(3.01,2.8);
  assert.throws(()=>unsupported.step({...withId(motion()),kind:'clanker'},50),/invalid/);
});

test('passive gravity uses real mesh support, swept walls and ceilings, with no thrust or artificial floor',async()=>{
  const p=await physics();let m=motion();for(let i=0;i<40;i++)m=p.step(withId(m),50);
  assert.equal(m.y,0);assert.equal(m.vy,0);assert.equal(m.grounded,true);assert.equal(m.yaw,.7);
  const grounded=p.step(withId(motion({y:0,vx:1,grounded:true})),50);
  assert.equal(grounded.vx,0);assert.equal(p.step(withId(grounded),50).x,grounded.x,'landed momentum cannot become indefinite walking');
  const pose=p.mesh.capture();pose.poses[1].visible=true;pose.poses[1].position.x=2;pose.poses[1].position.z=3;p.mesh.restore(pose);
  const blocked=p.step(withId(motion({y:0,vx:80,grounded:true})),50);assert.equal(blocked.x,0);assert.equal(blocked.vx,0);
  pose.poses[1].position={x:0,y:3,z:3};pose.poses[1].scale={x:5,y:.2,z:5};p.mesh.restore(pose);
  const up=p.step(withId(motion({y:.7,vy:20})),50);assert.ok(up.y<=1.1+1e-9);assert.equal(up.vy,0);assert.equal(up.grounded,false);
  pose.poses[1].visible=false;pose.poses[0].visible=false;p.mesh.restore(pose);
  const falling=p.step(withId(motion({y:0,grounded:true})),50);assert.ok(falling.y<0);assert.equal(falling.grounded,false,'missing support never creates a floor');
});

test('restart after the deadline advances through its last passive segment before beam/handback',async()=>{
  const p=await physics(),adapter={stepPassive:p.step,npcFor:()=> 'resident-npc'};
  const options={protocol:'body-test',world:'walker-fixture-1',adapter};
  const live=new SessionRegistry(options),s=live.connect(claim(),100000).session;live.disconnect(s,100000);
  const original=live.checkpoint(),restarted=SessionRegistry.restore(structuredClone(original),options);
  restarted.recover(200000,[]);const gone=restarted.pending()[0];
  assert.equal(gone.at,100000+GRACE_MS);assert.equal(gone.body.motion.y,0);assert.equal(gone.body.motion.grounded,true);
  assert.equal(gone.glyph,'green');assert.equal(gone.handback.npc,'resident-npc');assert.deepEqual(gone.body.equipment,equipment());
  assert.equal(p.calls,GRACE_MS/PASSIVE.stepMs,'at most the grace interval, never the full offline duration');
  const baseline=new SessionRegistry(options),t=baseline.connect(claim(),100000).session;baseline.disconnect(t,100000);
  for(let at=100250;at<160000;at+=250)baseline.advance(at);
  baseline.advance(160000);assert.deepEqual(baseline.pending(),restarted.pending());
  const absent=SessionRegistry.restore(original,{...options,adapter:{stepPassive:p.step,npcFor:()=>null}});absent.recover(200000,[]);
  assert.equal(absent.pending()[0].handback,null,'no existing NPC means beam only');
});

test('timely reconnect reclaims the fallen body and exact equipment, and duplicate sockets cannot update it',async()=>{
  const p=await physics(),options={protocol:'body-test',world:'walker-fixture-1',adapter:{stepPassive:p.step}};
  const reg=new SessionRegistry(options),old=reg.connect(claim(),100000).session;reg.disconnect(old,100000);
  let restored=SessionRegistry.restore(reg.checkpoint(),options);restored.recover(100500,[]);
  assert.ok(restored.view(1).motion.y<4);assert.equal(restored.view(1).presentation,'open-hand');
  restored=SessionRegistry.restore(restored.checkpoint(),options);restored.recover(101000,[]);
  const back=restored.connect({...claim(),body:undefined},101000);assert.equal(back.resumed,true);assert.equal(back.view.motion.y,0);
  assert.deepEqual(back.view.equipment,equipment());assert.equal(back.view.presentation,null);
  assert.equal(restored.update(old,101001,{motion:motion({y:99})}),false);
  assert.equal(restored.disconnect(old,101002).ok,false);assert.equal(restored.view(1).state,'live');
});

test('invalid physics and failed final sweep preserve the caller and uncommitted registry',()=>{
  const input=withId(motion()),before=structuredClone(input);
  const world={radius:.2,height:1.8,supportAt:()=>0,ceilingAt:()=>Infinity,segmentClear:()=>true};
  for(const mutate of [w=>{w.supportAt=()=>Promise.resolve(0);},w=>{w.segmentClear=()=>1;},w=>{w.ceilingAt=()=>NaN;},w=>{w.height=100;}]){
    const w={...world};mutate(w);const step=createPassiveBody({world:()=>w,gravity:12});assert.throws(()=>step(input,50),/invalid/);assert.deepEqual(input,before);
  }
  const step=createPassiveBody({world:()=>world,gravity:12});assert.throws(()=>step(input,51),/invalid/);assert.throws(()=>step({...input,vy:101},50),/invalid/);
  let calls=0;const reg=new SessionRegistry({protocol:'body-test',world:'walker-fixture-1',adapter:{stepPassive(m){if(++calls===1200)throw Error('collision unavailable');return m;}}});
  const s=reg.connect(claim(),100000).session;reg.disconnect(s,100000);const cp=reg.checkpoint();
  assert.throws(()=>reg.advance(160000),/collision unavailable/);assert.deepEqual(reg.checkpoint(),cp);
});

test('VirtualHost commits real passive landing with handback and rolls both back on a failed write',async()=>{
  const {VirtualHost,HOST,SESSION_PROTOCOL}=await import('../src/virtual-host.js'),p=await physics();
  let data=new Map(),now=100000,fail=false;
  const storage={async transaction(fn){const draft=structuredClone(data);const result=await fn({get:async k=>structuredClone(draft.get(k)),put:async(k,v)=>{if(fail){fail=false;throw Error('storage unavailable');}draft.set(k,structuredClone(v));}});data=draft;return result;}};
  // Authored NPC ownership only; physics is the actual passive/mesh integration.
  const simulation={checkpointBytes:30*1024,version:'walker-fixture-1',initial:()=>({handbacks:0,body:null}),validate:s=>Number.isInteger(s.handbacks),step(){},project:()=>({npcs:[],hub:{pile:0}}),
    npcFor:(_s,id)=>id==='resident'?'resident-npc':null,handoff(s,intent){s.handbacks++;s.body=intent.body;return true;}};
  const create=()=>new VirtualHost({storage,simulation,sessionAdapter:{stepPassive:p.step},clock:()=>now});
  const host=create(),first=await host.begin('runner-a',120000);
  const joined=(await host.sessions(first,[],(reg,t)=>reg.connect({...claim(),protocol:SESSION_PROTOCOL},t))).result;
  await host.disconnect(first,[],joined.session,now);
  now=160000;const restarted=create(),fresh=await restarted.claim('runner-b'),before=structuredClone(data.get(HOST.key));
  fail=true;await assert.rejects(restarted.tick(fresh,[]),/storage unavailable/);assert.deepEqual(data.get(HOST.key),before);
  await restarted.tick(fresh,[]);const saved=data.get(HOST.key);
  assert.equal(saved.simulation.handbacks,1);assert.equal(saved.simulation.body.motion.y,0);assert.deepEqual(saved.simulation.body.equipment,equipment());
  assert.equal(saved.sessions.pending[0].applied,true);assert.equal(saved.sessions.pending[0].at,160000);
  now=200000;const again=await create().begin('runner-c',60000,{resumePaused:true});await create().tick(again,[]);
  assert.equal(data.get(HOST.key).simulation.handbacks,1,'committed handback never replays after restart');
});
