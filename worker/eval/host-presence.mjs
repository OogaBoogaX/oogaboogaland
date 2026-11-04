// Finite maximum retained-body presentation load; actual glyph/rig geometry,
// authored lifecycle records. No browser/GPU, socket, host activation or timers.
import assert from "node:assert/strict";
import { managedRigs } from "../test/fixtures/clanker-pose-rig.mjs";
const f=managedRigs({presence:true}),B=f.B,root=B.scene.createNode(),count=64;
const actors=Array.from({length:count},(_,i)=>{const a=f.make();a.poseManaged(.05,i*3,0,0,i/10,0);B.scene.addChild(root,a.root);return a;});
const bindings=actors.map((actor,i)=>({actor,freeArm:'armR',generation:i+1}));
const presence=B.hostPresence.create({root,capacity:count,resolve:id=>bindings[Number(id.slice(5))]});
const views=actors.map((_,i)=>({bodyId:`body-${i}`,kind:'clanker',generation:i+1,state:'grace',deadline:160000,presentation:'open-hand'}));
const departures=actors.map((_,i)=>({type:'depart',glyph:'green',applied:true,bodyId:`body-${i}`,generation:i+1,at:160000,body:{kind:'clanker'}}));
const geometry=new Set();presence.liveGeometry(geometry);
const batches=root.children.at(-1).children.filter(n=>n.instanceData),allocated=batches.reduce((sum,n)=>sum+n.instanceData.byteLength,0);
const hands=[],beams=[],cpuStart=process.cpuUsage();
for(let i=0;i<120;i++){
  const at=performance.now();presence.prepare();presence.render({now:150000+i*16,views,departures:[]});hands.push(performance.now()-at);assert.equal(presence.hands,count);
}
for(let i=1;i<44;i++){
  const at=performance.now();presence.prepare();presence.render({now:160000+i*16,views:[],departures});beams.push(performance.now()-at);assert.equal(presence.beams,count);
}
presence.prepare();presence.render({now:160700,views:[],departures});assert.equal(presence.beams,0);assert.equal(presence.expired,count);
const cpu=process.cpuUsage(cpuStart),summary=list=>{list.sort((a,b)=>a-b);return {samples:list.length,p50:list[Math.floor(list.length*.5)],p95:list[Math.floor(list.length*.95)],max:list.at(-1)};};
presence.dispose();assert.equal(root.children.length,count);assert.equal(presence.liveGeometry(new Set()).size,0);
console.log(JSON.stringify({bodies:count,glyphBatches:batches.length,glyphInstanceCapacity:count*48,instanceBytes:allocated,uniqueGeometryRecords:geometry.size,
  prepareAndRaiseHandsMs:summary(hands),prepareAndRenderBeamsMs:summary(beams),totalCPUIncludingVerificationMs:(cpu.user+cpu.system)/1000,
  limitations:['real scene matrices, Clanker rigs and existing glyph geometry over authored lifecycle records',
    'no GPU draw/upload, browser or phone, transport timing, production CPU or billing measurement',
    'presentation only; no body ownership transfer, item mutation, NPC spawn or durable departure acknowledgement']},null,2));
for(const actor of actors)actor.dispose();
