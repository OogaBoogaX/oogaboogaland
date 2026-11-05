// Finite frozen-body/session recovery cost. In-memory atomic storage and
// independent authored meadows; no production world, Room, browser or paid loop.
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage, BODY_STORAGE } from '../src/host-body-storage.js';
import { createClankerBodySessions, CLANKER_BODY_STEPS, CLANKER_BODY_LOADS } from '../src/clanker-body-sessions.js';
import { createClankerBodyCheckpoint } from '../src/clanker-roaming.js';
import { createCheckpointPack } from '../src/checkpoint-pack.js';
import { clankerController } from '../test/fixtures/clanker-controller-fixture.mjs';
const unknownClose = process.argv.includes('--unknown-close'), short = process.argv.includes('--short');
const world = 'body-sessions-eval-2', pack = createCheckpointPack(8192, { intern: true });
const equipment = { weapon: 'gun', mode: 'combat', primaryOwned: true,
  secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true };
const make = () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: 'body-3', start: false });
  return { ...f, codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState) };
};
const prepared = make(), initial = [], claims = [];
try {
  prepared.start(); prepared.sim.possess(prepared.sim.list[0]); prepared.codec.neutralize();
  for (let i=0;i<4;i++) prepared.step();
  prepared.sim.control({ x:.6,z:.8,heading:.7,run:true,jumpHeld:true,jumpPressed:true });
  prepared.step(); prepared.codec.neutralize();
  for(let i=0;i<30;i++) {
    const e=prepared.sim.player; e.root.position.x=-15+6*(i%6); e.root.position.z=-12+6*Math.floor(i/6);
    initial.push(prepared.codec.capture());
    claims.push({ protocol:SESSION_PROTOCOL,world,accountId:i+1,bodyId:`body-${i}`,zone:'outside',
      body:{kind:'clanker',motion:structuredClone(prepared.codec.motion()),equipment} });
  }
} finally { prepared.dispose(); }
let data=new Map(),now=100000,constructions=0,disposals=0,peakControllers=0,active=0,writes=0,writeBytes=0;
const storage={async transaction(fn){
  const pending=structuredClone(data);
  const result=await fn({
    get:async k=>Array.isArray(k)?new Map(k.filter(k=>pending.has(k)).map(k=>[k,structuredClone(pending.get(k))])):structuredClone(pending.get(k)),
    put:async values=>{for(const [k,v]of Object.entries(values)){writes++;writeBytes+=Buffer.byteLength(JSON.stringify(v));pending.set(k,structuredClone(v));}},
    delete:async keys=>{for(const k of keys)pending.delete(k);},
  });data=pending;return result;
}};
const bank=createHostBodyStorage({storage,profile:'clanker-body-3',capture:()=>{throw Error('scoped body capture required');},
  validate:v=>{const s=pack.unpack(v);return s.v===3&&s.world===world;}});
const sessionAdapter=createClankerBodySessions({recordFor:()=>prepared.codec.records,admit:r=>initial[r.accountId-1],create:()=>{
  const f=make();constructions++;active++;peakControllers=Math.max(peakControllers,active);
  return{codec:f.codec,dispose(){f.dispose();disposals++;active--;}};
}});
const simulation={version:world,checkpointBytes:65536,initial:()=>({padding:'x'.repeat(65522)}),
  validate:s=>typeof s.padding==='string',step:()=>{},project:()=>({npcs:[],hub:{pile:0}}),npcFor:()=>null,handoff:()=>false};
const host=()=>new VirtualHost({storage:bank,simulation,sessionAdapter,clock:()=>now});
let ticket=await host().begin('first',120000);
const admissionAt=performance.now();
const joined=[],admissionOperations=[];
for(const claim of claims){
  const at=performance.now(),result=(await host().connect(ticket,joined.map(r=>r.session.token),claim)).result;
  assert.ok(result.ok);joined.push(result);admissionOperations.push(performance.now()-at);
}
const admissionMs=performance.now()-admissionAt;
const refs=joined.map(r=>r.session),closeAt=performance.now();
if (!unknownClose) await host().sessions(ticket,refs.map(r=>r.token),(r,at)=>refs.forEach(ref=>r.disconnect(ref,at)));
const closeMs=unknownClose ? null : performance.now()-closeAt;
assert.equal(active,0); now=short?100250:160000;if(!short)ticket=await host().claim('replacement');
const batches=[];
for(let i=0;i<31;i++){
  const before=constructions,beforeWrites=writes,beforeBytes=writeBytes,cpu=process.cpuUsage(),at=performance.now(),result=await host().tick(ticket,[]);
  const wallMs=performance.now()-at,used=process.cpuUsage(cpu),root=data.get(HOST.key);
  assert.equal(result.work.steps,0);assert.equal(active,0);
  assert.equal(constructions-before,0);
  assert.ok(root.host.sessions.sessions.every(r=>r.deadline===160000));
  batches.push({batch:i,wallMs,cpuUs:used.user+used.system,steps:result.work.steps,pendingSteps:result.work.pendingSteps,
    controllers:constructions-before,keyWrites:writes-beforeWrites,jsonValueWriteBytes:writeBytes-beforeBytes,rootBytes:Buffer.byteLength(JSON.stringify(root)),
    totalStoredBytes:[...data.values()].reduce((sum,v)=>sum+Buffer.byteLength(JSON.stringify(v)),0)});
  if(!result.work.pendingSteps)break;
}
assert.equal(batches.at(-1).pendingSteps,0);assert.equal(constructions,disposals);
const root=data.get(HOST.key).host,rows=await bank.transaction(tx=>tx.bodies());
assert.equal(root.sessions.sessions.length,short?30:0);assert.equal(root.sessions.pending.length,short?0:30);
for(const r of [...root.sessions.pending,...root.sessions.sessions]){
  const body=r.body||r;
  if(!short){assert.equal(r.at,160000);assert.equal(r.reason,'expired');assert.equal(r.handback,null);assert.equal(body.motion.grounded,false);}
  else {assert.equal(r.deadline,160000);assert.equal(r.stepAt,100000);}
  assert.deepEqual(body.equipment,equipment);
  const admitted=claims.find(c=>c.bodyId===r.bodyId).body.motion;
  assert.deepEqual(body.motion,{...admitted,vx:0,vy:0,vz:0});
  const recovered=make();
  try{recovered.codec.restore(rows.find(x=>x.bodyId===r.bodyId).checkpoint);
    assert.deepEqual(structuredClone(recovered.codec.motion()),body.motion);
  }finally{recovered.dispose();}
}
const sorted=batches.map(b=>b.wallMs).sort((a,b)=>a-b);
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,bodies:30,
  unknownClose,short,admissionOperations,bodyLoadLimit:CLANKER_BODY_LOADS,sourceHashes:prepared.hashes,admissionMs,closeMs,constructions,disposals,peakControllers,
  totalPassiveSteps:batches.reduce((n,b)=>n+b.steps,0),recoveryMs:{p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)},
  over250ms:batches.filter(b=>b.wallMs>250).length,componentLimit:BODY_STORAGE.componentBytes,batches,
  limitations:['30 real controlled Clankers, each in an independent empty authored meadow; no peer collisions, island supports, Ooga or full-world AI.',
    'Equipment is preserved registry metadata; this does not restore a browser weapon or jetpack controller.',
    'In-memory transaction copies and cold Node VM/controller construction are included; not SQLite/workerd billed CPU, peak-memory certification or browser latency.',
    'Admissions are separate bounded operations; close stresses all30 together. Short250ms or full60second simultaneous recovery is selected explicitly.',
    'No live route, activation, deployment, provisioning, paid API or permanent loop.']},null,2));
