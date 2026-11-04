// Finite offline measurements over the authored mesh fixture. No network,
// timers, accounts, Cloudflare runtime or permission to activate a runner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { initial, prepare, capture } from "../test/fixtures/clanker-flight-fixture.mjs";
import { createPassiveBody } from "../src/passive-body.js";
import { SessionRegistry, GRACE_MS, MAX_SESSIONS } from "../src/host-sessions.js";
import { HOST } from "../src/virtual-host.js";
const original = JSON.parse(readFileSync(new URL("../test/fixtures/clanker-flight-original.json", import.meta.url)));
const baseline = hooks => runInNewContext(original.blocks.join("") + "\n({ prepareJump, updateJump });", hooks);
const rows = [];
const summarize = (name, times, cpu, extra) => {
  times.sort((a,b) => a-b);
  rows.push({ name, samples: times.length, p50ms: times[Math.floor(times.length*.5)],
    p95ms: times[Math.floor(times.length*.95)], maxMs: times.at(-1), cpuMs: (cpu.user+cpu.system)/1000, ...extra });
};
let checkpointBytes = 0;
for (const [name, create] of [["original browser flight", baseline], ["bounded shared flight", undefined]]) {
  const f = await prepare(create), entries = Array.from({length:128}, initial), times = [];
  for (const e of entries) assert.equal(f.controller.prepareJump(e,0,0,-4,1.5),true);
  checkpointBytes = Buffer.byteLength(JSON.stringify(entries.map(capture)));
  const beforeCalls=f.control.calls, startCPU=process.cpuUsage();
  for (let sample=0;sample<120;sample++) {
    const start=performance.now();
    for (const e of entries) {
      if (!e.jump.active) {
        const target=e.root.position.x < -2 ? 0 : -4;
        assert.equal(f.controller.prepareJump(e,target,0,-4,1.5),true);
      }
      f.controller.updateJump(e,.05);
    }
    times.push(performance.now()-start);
  }
  summarize(name,times,process.cpuUsage(startCPU),{ actors:128, collisionCalls:f.control.calls-beforeCalls });
}
// Worst permitted grace interval, all 64 records reconstructed at expiry.
// This fixture is a static platform: it does not stand in for island complexity.
const f=await prepare(), world={...f.mesh,radius:2.25,height:2.8};
let steps=0;
const physics=createPassiveBody({world:()=>world,gravity:9.8});
const options={protocol:"cost-fixture",world:"clanker-flight-fixture-1",adapter:{stepPassive(m,dt){steps++;return physics(m,dt);}}};
const reg=new SessionRegistry(options);
for(let i=0;i<MAX_SESSIONS;i++){
  const joined=reg.connect({protocol:options.protocol,world:options.world,accountId:i+1,bodyId:`body-${i}`,zone:"outside",
    body:{kind:"clanker",motion:{x:-4,y:4,z:-4,yaw:.7,vx:0,vy:-2,vz:0,grounded:false},
      equipment:{weapon:null,mode:"carry",magazine:0,spareAmmo:[],primaryOwned:false,secondaryOwned:false,
        selectedSlot:1,unlimited:false,jetpack:false,jetpackOwned:false,fuel:.37}}},100000);
  assert.equal(joined.ok,true); reg.disconnect(joined.session,100000);
}
const saved=reg.checkpoint(),times=[],startCPU=process.cpuUsage();
let departureBytes=0;
for(let sample=0;sample<5;sample++){
  const start=performance.now(),rebuilt=SessionRegistry.restore(saved,options);
  rebuilt.recover(100000+GRACE_MS+100000,[]);times.push(performance.now()-start);
  const pending=rebuilt.pending(); assert.equal(pending.length,MAX_SESSIONS);
  assert.ok(pending.every(p=>p.body.motion.grounded&&p.body.motion.y===0&&p.handback===null));
  departureBytes=Buffer.byteLength(JSON.stringify(rebuilt.checkpoint()));
}
assert.equal(steps,5*MAX_SESSIONS*GRACE_MS/50);
summarize("full grace restart",times,process.cpuUsage(startCPU),{ bodies:MAX_SESSIONS,substepsPerRecovery:steps/5,
  sessionCheckpointBytes:Buffer.byteLength(JSON.stringify(saved)),departureCheckpointBytes:departureBytes });
console.log(JSON.stringify({scope:"local Node; authored static platform; serial bounded runs; original baseline uses vm context",
  baseline:original.baseline,node:process.version,platform:process.platform,arch:process.arch,rows,
  flightFixtureCheckpointBytesAt128:checkpointBytes,hostCheckpointLimitBytes:HOST.checkpointBytes,
  flightFixtureFitsBeforeOtherState:checkpointBytes<=HOST.checkpointBytes,
  rssBytes:process.memoryUsage().rss,
  excluded:["full AI and rigs","world and peer complexity","scene construction","Room delivery","storage and RPC",
    "DO CPU/duration/billing","account allowances","browser rendering","retained-memory bound"]},null,2));
