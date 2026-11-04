// Finite recovery/capacity measurement. Real animation and work/flight kernels
// over authored world inputs; no account, network, timer or production runner.
import assert from "node:assert/strict";
import { managedRigs } from "../test/fixtures/clanker-pose-rig.mjs";
import { rosterFixture } from "../test/fixtures/host-roster-fixture.mjs";
import { createCheckpointPack, PACK } from "../src/checkpoint-pack.js";

const f=managedRigs(),count=53,world="continuation-cost-1",codec=f.B.clankerState;
const fixture=await rosterFixture(count),simulation=fixture.source.initial(),storage=createCheckpointPack(64*1024);
const make=(_,i)=>f.B.agent.create({...f.options,suitColor:i%f.B.agent.SUIT_COLORS});
const actors=Array.from({length:count},make),resumed=Array.from({length:count},make);
const held=actors.map((_,i)=>i%7?null:`vessel:${i}`),benches=actors.map((_,i)=>({id:i}));
for(let i=0;i<count;i++)if(held[i])for(const actor of [actors[i],resumed[i]]){
  const item=f.B.scene.createNode({geometry:f.B.agent.labFlaskGeometry(i%2)});f.B.models.attachGlassShell(item);assert.equal(actor.holdLabItem(item),true);
}
const writers=actors.map(a=>a.createManagedCheckpoint(world)),readers=resumed.map(a=>a.createManagedCheckpoint(world));
const binding=(actor,i)=>({item:held[i],bench:actor.labPickupBench?{id:`bench:${i}`,value:benches[i]}:null});
const samples=[],cpuStart=process.cpuUsage();let maxRaw=0,maxRoster=0,maxStored=0,maxCombinedRaw=0,maxCombinedNodes=0,combinedRefusals=0,maxCombinedStored=0;
const nodes=value=>value&&typeof value==='object'?1+Object.values(value).reduce((n,v)=>n+nodes(v),0):1;
for(let frame=0;frame<120;frame++){
  fixture.source.step(simulation,50);
  for(let i=0;i<count;i++){
    const phase=i%6,x=phase===0?0:phase===1?20:i+40;
    const motion=phase===0?{lab:true,labWork:held[i]?'carry':'type',labPhase:frame/10+i*.37,labBench:held[i]?benches[i]:null}
      :phase===1?{office:true,officeSeat:.8,officeWork:'type',officeHands:[20,1,1,21,1,1],officePhase:frame/9+i*.13}
        :phase===2?{climb:.8,climbStride:frame/10+i*.17}:phase===3?{roll:.8,rollAngle:1.2+i/9,rollSide:.5}
          :phase===4?{swim:true,labPhase:frame/10+i*.31}:{};
    actors[i].poseManaged(.05,x,phase===5?2+i/100:0,.2+i/100,.7+i*.11,phase===5?2.8+i/100:0,phase===5,false,'',motion);
  }
  const at=performance.now(),records=writers.map((writer,index)=>({index,snapshot:writer.capture(binding(actors[index],index))}));
  maxRaw=Math.max(maxRaw,Buffer.byteLength(JSON.stringify(records)));
  const packed=codec.packRoster(world,records),plain=JSON.parse(JSON.stringify(packed));
  maxRoster=Math.max(maxRoster,Buffer.byteLength(JSON.stringify(plain)));
  const saved=storage.pack(plain);maxStored=Math.max(maxStored,Buffer.byteLength(JSON.stringify(saved)));
  const restored=codec.unpackRoster(storage.unpack(JSON.parse(JSON.stringify(saved))));
  for(let i=0;i<count;i++){
    const snapshot=restored[i].snapshot;
    readers[i].restore(snapshot,{item:held[i],bench:snapshot.bench?{id:`bench:${i}`,value:benches[i]}:null});
  }
  samples.push(performance.now()-at);
  for(let i=0;i<count;i++){
    assert.equal(JSON.stringify(readers[i].capture(binding(resumed[i],i))),JSON.stringify(records[i].snapshot));
    assert.equal(f.display(resumed[i]),f.display(actors[i]));
  }
  const combined={simulation,rigs:plain};maxCombinedRaw=Math.max(maxCombinedRaw,Buffer.byteLength(JSON.stringify(combined)));maxCombinedNodes=Math.max(maxCombinedNodes,nodes(combined));
  try {const value=storage.pack(combined);maxCombinedStored=Math.max(maxCombinedStored,Buffer.byteLength(JSON.stringify(value)));}
  catch(error){assert.match(error.message,/capacity/);combinedRefusals++;}
}
const cpu=process.cpuUsage(cpuStart);samples.sort((a,b)=>a-b);
console.log(JSON.stringify({clankers:count,frames:120,animationRecordLimit:codec.MAX_BYTES,rosterLimit:codec.ROSTER_BYTES,
  maxRawAnimationRosterBytes:maxRaw,maxPosePackedRosterBytes:maxRoster,maxStoragePackedRosterBytes:maxStored,
  combinedWithExisting106ActorFixture:{maxRawBytes:maxCombinedRaw,maxNodes:maxCombinedNodes,existingNodeLimit:PACK.nodes,
    simulationBudget:64*1024,maxStoredBytes:maxCombinedStored,refusedFrames:combinedRefusals},
  capturePackStorageRestoreMs:{p50:samples[60],p95:samples[114],max:samples.at(-1)},totalCPUIncludingWorldRigAndVerificationMs:(cpu.user+cpu.system)/1000,
  limitations:['authored work/flight/world inputs, not the full hub or player body state',
    'animation continuation is exact but outer Clanker AI, health, reservations and input authority are not included',
    'mock-free actual rig and packer in Node/VM; not Durable Object CPU, browser GPU or account billing',
    'combined capacity refusal is an activation blocker, not permission to increase limits']},null,2));
for(const actor of [...actors,...resumed])actor.dispose();
