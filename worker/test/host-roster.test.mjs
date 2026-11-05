import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { createPassiveBody } from "../src/passive-body.js";
import { rosterFixture } from "./fixtures/host-roster-fixture.mjs";
import { managedRigs } from "./fixtures/clanker-pose-rig.mjs";
import { compactSimulation } from "../src/simulation-checkpoint.js";

test("53 Ooga/Clanker pairs retain exact controller state through full slots, growth, failed commit and recovery", async t => {
  const f = await rosterFixture(53), codec = createCheckpointPack(f.simulation.checkpointBytes);
  let now = 100000, saved, fail = false, peak = 0;
  const storage = { async transaction(fn) {
    let next = structuredClone(saved);
    const out = await fn({ get: async () => structuredClone(next), put: async (_, value) => { next = structuredClone(value); } });
    if (fail) { fail = false; throw Error("roster commit failed"); }
    // Exercise the actual JSON storage representation, not only structuredClone.
    saved = JSON.parse(JSON.stringify(next)); peak = Math.max(peak, Buffer.byteLength(JSON.stringify(saved))); return out;
  } };
  const world = { ...f.mesh, radius: 2.25, height: 2.8 }, passive = createPassiveBody({ world: () => world, gravity: 9.8 });
  const make = () => new VirtualHost({ storage, simulation: f.simulation, clock: () => now, sessionAdapter: { stepPassive: passive } });
  let host = make(), ticket = await host.begin("first", 120000);
  const reference = f.source.initial(), equipment = { weapon: "gun", mode: "combat", primaryOwned: true, secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true };
  const claim = i => ({ protocol: SESSION_PROTOCOL, world: f.simulation.version, accountId: i + 1, bodyId: `body-${i}`, zone: "outside",
    body: { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false }, equipment } });
  const joins = (await host.sessions(ticket, [], (r, at) => Array.from({ length: 31 }, (_, i) => r.connect(claim(i), at)))).result;
  assert.ok(joins.slice(0, 30).every(j => j.ok)); assert.equal(joins[30].reason, "full");
  const tokens = joins.slice(0, 30).map(j => j.session.token);
  for (let i = 0; i < 120; i++) {
    now += 250;
    if (i === 24) {
      const before = structuredClone(saved); fail = true; await assert.rejects(host.tick(ticket, tokens), /roster commit failed/);
      assert.deepEqual(saved, before); host = make();
    }
    const result = await host.tick(ticket, tokens); f.source.step(reference, 250);
    assert.equal(result.snapshot.npcs.length, 106); assert.deepEqual(codec.unpack(saved.simulation), reference);
  }
  const actorsBefore = structuredClone(saved.simulation);
  await host.sessions(ticket, tokens, (r, at) => joins.slice(0, 30).forEach(j => r.disconnect(j.session, at)));
  now += 59999; host = make(); ticket = await host.claim("restart");
  const resumed = await host.connect(ticket, [], claim(29)); assert.equal(resumed.result.resumed, true);
  assert.deepEqual(resumed.result.view.equipment, equipment); assert.equal(resumed.result.view.motion.grounded, true);
  now++; let result, commits = 0;
  do { result = await host.tick(ticket, [resumed.result.session.token]); assert.ok(++commits <= 10); } while (result.work.pendingSteps);
  assert.deepEqual(saved.simulation, actorsBefore, "outage recovery cannot replay NPC shots or decisions");
  assert.equal(saved.sessions.pending.length, 29);
  assert.ok(saved.sessions.pending.every(p => p.applied && p.handback === null && p.at <= now));
  assert.ok(peak < HOST.checkpointBytes);
  await assert.rejects(rosterFixture(54), /remeasure/);
  t.diagnostic(JSON.stringify({ actors: 106, retainedSlots: 30, peakCheckpointBytes: peak, physicalLimit: HOST.checkpointBytes }));
});

test("compact 106-actor plus rig checkpoints retain all session reservations through rollback, restart and expiry",async t=>{
  const f=await rosterFixture(53,65536,true),rig=managedRigs(),world='combined-rig-fixture',poses=rig.B.clankerState;
  const actors=Array.from({length:53},rig.make),controllers=actors.map(a=>a.createManagedCheckpoint(world));
  const capture=()=>JSON.parse(JSON.stringify(poses.packRoster(world,controllers.map((c,index)=>({index,snapshot:c.capture()})),true)));
  const source={version:'combined-rig-fixture',initial:()=>({simulation:f.source.initial(),rigs:capture(),step:0}),
    validate(s){f.source.validate(s.simulation);const records=poses.unpackRoster(s.rigs);return records.length===53 && Number.isSafeInteger(s.step);},
    step(s,ms){
      const records=poses.unpackRoster(s.rigs);for(let i=0;i<53;i++)controllers[i].restore(records[i].snapshot);
      f.source.step(s.simulation,ms);s.step++;
      for(let i=0;i<53;i++){
        const p=s.simulation.clankers[i].root.position;
        actors[i].poseManaged(ms/1000,p.x,p.y,p.z,i/11,2,false,false,'',{roll:.6,rollAngle:s.step/9+i/7,rollSide:.3});
      }
      s.rigs=capture();
    },project:s=>f.source.project(s.simulation),npcFor:()=>null,handoff:()=>false};
  const simulation=compactSimulation(source,65536,{intern:true}),codec=createCheckpointPack(65536,{intern:true});
  let now=100000,saved,fail=false,peak=0,worldPeak=0;const tickTimes=[];
  const storage={async transaction(fn){let next=structuredClone(saved);const out=await fn({get:async()=>structuredClone(next),put:async(_,v)=>{next=structuredClone(v);}});
    if(fail){fail=false;throw Error('combined write failed');}saved=JSON.parse(JSON.stringify(next));
    peak=Math.max(peak,Buffer.byteLength(JSON.stringify(saved)));worldPeak=Math.max(worldPeak,Buffer.byteLength(JSON.stringify(saved.simulation)));return out;}};
  const passive=createPassiveBody({world:()=>({...f.mesh,radius:2.25,height:2.8}),gravity:9.8});
  const make=()=>new VirtualHost({storage,simulation,clock:()=>now,sessionAdapter:{stepPassive:passive}});
  let host=make(),ticket=await host.begin('first',120000);
  const equipment={weapon:'gun',mode:'combat',primaryOwned:true,secondaryOwned:true,
    selectedSlot:2,unlimited:false,jetpack:true,jetpackOwned:true};
  const claim=i=>({protocol:SESSION_PROTOCOL,world:simulation.version,accountId:i+1,bodyId:`body-${i}`,zone:'outside',
    body:{kind:'clanker',motion:{x:-4,y:4,z:-4,yaw:.7,vx:1,vy:-2,vz:1,grounded:false},equipment}});
  const joins=(await host.sessions(ticket,[],(r,at)=>Array.from({length:31},(_,i)=>r.connect(claim(i),at)))).result;
  assert.ok(joins.slice(0,30).every(j=>j.ok));assert.equal(joins[30].reason,'full');
  const tokens=joins.slice(0,30).map(j=>j.session.token);
  for(let i=0;i<12;i++){
    now+=250;
    if(i===5){const before=structuredClone(saved);fail=true;await assert.rejects(host.tick(ticket,tokens),/combined write failed/);assert.deepEqual(saved,before);host=make();}
    const at=performance.now();await host.tick(ticket,tokens);tickTimes.push(performance.now()-at);
    const decoded=codec.unpack(saved.simulation);assert.equal(decoded.step,i+1);
    const restored=poses.unpackRoster(decoded.rigs);
    for(let n=0;n<53;n++)assert.equal(JSON.stringify(restored[n].snapshot),JSON.stringify(controllers[n].capture()));
  }
  const retained=structuredClone(saved.simulation);
  await host.sessions(ticket,tokens,(r,at)=>joins.slice(0,30).forEach(j=>r.disconnect(j.session,at)));
  now+=59999;host=make();ticket=await host.claim('restart');
  const reclaimed=await host.connect(ticket,[],claim(29));assert.equal(reclaimed.result.resumed,true);assert.deepEqual(reclaimed.result.view.equipment,equipment);
  assert.equal(reclaimed.result.view.motion.grounded,true);now++;
  let result,commits=0;do{result=await host.tick(ticket,[reclaimed.result.session.token]);assert.ok(++commits<=10);}while(result.work.pendingSteps);
  assert.deepEqual(saved.simulation,retained);assert.equal(saved.sessions.pending.length,29);
  assert.ok(saved.sessions.pending.every(p=>p.applied&&p.handback===null));assert.ok(peak<HOST.checkpointBytes);assert.ok(worldPeak<=65536);
  const before=structuredClone(saved),old=compactSimulation(source,65536);
  await assert.rejects(new VirtualHost({storage,simulation:old,clock:()=>now,sessionAdapter:{stepPassive:passive}}).tick(ticket,[]),/incompatible/);
  assert.deepEqual(saved,before);for(const actor of actors)actor.dispose();
  tickTimes.sort((a,b)=>a-b);
  t.diagnostic(JSON.stringify({actors:106,managedRigs:53,retainedSlots:30,peakCheckpointBytes:peak,peakSimulationBytes:worldPeak,
    tickSamples:tickTimes.length,tickMs:{p50:tickTimes[6],p95:tickTimes[11]},timingScope:'Node/mock storage, includes host validation/packing, excludes assertions; not DO CPU'}));
});
