// Local SQLite-only layout measurement. No network access, account configuration,
// deployment, real player identities or permanent runner. Existing runtime only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { BODY_STORAGE } from "../src/host-body-storage.js";
if (!process.env.HOST_RUNTIME_PACKAGE) throw Error("Use an existing Miniflare package.json");
const packagePath = resolve(process.env.HOST_RUNTIME_PACKAGE), requireRuntime = createRequire(packagePath);
const manifest = JSON.parse(await readFile(packagePath, "utf8")); assert.equal(manifest.name, "miniflare");
const runtime = await import(pathToFileURL(join(dirname(packagePath), manifest.main))), { build } = requireRuntime("esbuild");
const dir = await mkdtemp(join(tmpdir(), "body-storage-")), bundle = join(dir, "worker.mjs");
const source = `
import { DurableObject } from 'cloudflare:workers';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage, BODY_STORAGE } from '../src/host-body-storage.js';
import { createCheckpointPack } from '../src/checkpoint-pack.js';
export class BodyStore extends DurableObject {
 async fetch(request) {
  const input=await request.json(),{command,component,now}=input;
  let writes=0,writeBytes=0,reads=0,readBytes=0,error=null,result=null;
  const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).byteLength;
  const storage={transaction:fn=>this.ctx.storage.transaction(tx=>fn({
   get:async k=>{const v=await tx.get(k);const values=v instanceof Map?[...v.values()]:v===undefined?[]:[v];reads+=values.length;for(const item of values)readBytes+=bytes(item);return v;},
   put:async values=>{writes+=Object.keys(values).length;for(const value of Object.values(values))writeBytes+=bytes(value);await tx.put(values);if(command==='fail')throw Error('injected rollback');},
   delete:keys=>tx.delete(keys),
  }))};
  const pack=createCheckpointPack(8192,{intern:true});
  const bank=createHostBodyStorage({storage,profile:'clanker-body-3',validate:v=>typeof v==='string'?input.worst===true:pack.unpack(v).world==='body-store-runtime',
   capture:(r,previous)=>[...(r.sessions?.sessions||[]),...(r.sessions?.pending||[])].sort((a,b)=>a.generation-b.generation).map(s=>({
    accountId:s.accountId,bodyId:s.bodyId,generation:s.generation,kind:s.kind||s.body.kind,checkpoint:component,
   }))});
  const simulation={version:'body-store-runtime',checkpointBytes:65536,initial:()=>({padding:'x'.repeat(65522)}),validate:s=>typeof s.padding==='string',step:()=>{},project:()=>({npcs:[],hub:{pile:0}}),npcFor:()=>null,handoff:()=>false};
  const host=new VirtualHost({storage:bank,simulation,clock:()=>now,sessionAdapter:{stepPassive:m=>m}});
  try {
   if(command==='begin')result=await host.begin('owner',120000);
   else if(command==='join')result=(await host.sessions(input.ticket,[],(r,at)=>Array.from({length:30},(_,i)=>r.connect({protocol:SESSION_PROTOCOL,world:simulation.version,accountId:i+1,bodyId:'body-'+i,zone:'outside',body:{kind:'clanker',motion:{x:0,y:0,z:0,yaw:0,vx:0,vy:0,vz:0,grounded:true},equipment:{weapon:null,mode:'carry',primaryOwned:false,secondaryOwned:false,selectedSlot:1,unlimited:false,jetpack:false,jetpackOwned:false}}},at)))).result;
   else if(command==='claim')result=await host.claim('replacement');
   else if(command==='tick'||command==='fail')result=await host.tick(input.ticket,input.tokens);
   else if(command!=='inspect')throw Error('unknown command');
  }catch(e){error=e.message;}
  const root=await this.ctx.storage.get(HOST.key),keys=Array.from({length:root?.count||0},(_,i)=>BODY_STORAGE.prefix+i);
  const values=keys.length?await this.ctx.storage.get(keys):new Map();
  const exact=[...values.values()].every(v=>JSON.stringify(v.body.checkpoint)===JSON.stringify(component));
  return Response.json({error,result,writes,writeBytes,reads,readBytes,rootBytes:root?bytes(root):0,rowBytes:[...values.values()].map(bytes),exact,revision:root?.host.revision});
 }
}
export default {fetch:(request,env)=>env.BODY.get(env.BODY.idFromName('fixture')).fetch(request)};
`;
let mf, deniedEgress = 0; const logs = [], results = [];
const start = async path => {
  const options = { name: "body-storage-local", modules: true, scriptPath: bundle, modulesRoot: dir,
    compatibilityDate: "2026-10-01", compatibilityFlags: ["nodejs_compat"], host: "127.0.0.1", port: 0, cf: false,
    telemetry: { enabled: false }, logRequests: false, log: new runtime.Log(runtime.LogLevel.ERROR), handleStructuredLogs: l => logs.push(l),
    durableObjects: { BODY: { className: "BodyStore", useSQLite: true } }, resourcePersistencePath: path, isolatedResourcePersistencePath: path,
    outboundService: () => { deniedEgress++; return new Response("forbidden", { status: 503 }); } };
  mf = new runtime.Miniflare(runtime.convertV4MiniflareOptions ? runtime.convertV4MiniflareOptions(options) : options); await mf.ready;
};
const stats = values => { const a = values.slice().sort((a,b)=>a-b); return { p50: a[Math.floor(a.length*.5)], p95: a[Math.floor(a.length*.95)], max: a.at(-1) }; };
const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-3", start: false });
const actual = [];
try {
  const codec = createClankerBodyCheckpoint(f.sim, "body-store-runtime", f.B.clankerState);
  f.start(); f.sim.possess(f.sim.list[0]); codec.neutralize(); for (let i=0;i<4;i++)f.step();
  f.sim.control({x:.6,z:.8,heading:.7,run:true,jumpHeld:true,jumpPressed:true}); f.step(); codec.neutralize();
  for(let i=0;i<48;i++){actual.push(codec.capture());f.step();codec.neutralize();}
} finally { f.dispose(); }
try {
  await build({ stdin: { contents: source, resolveDir: fileURLToPath(new URL('.',import.meta.url)), sourcefile:'body-storage-fixture.mjs' },
    bundle:true,outfile:bundle,format:'esm',platform:'neutral',external:['node:*','cloudflare:*'],define:{window:'globalThis'},logLevel:'silent' });
  for (const [worst,changing] of [[false,false],[false,true],[true,true]]) {
    let component=worst?'x'.repeat(8190):actual[0];
    const scenario=worst?'component-ceiling-changing':changing?'actual-components-changing':'actual-components-unchanged',path=join(dir,scenario);
    await start(path);let now=100000; const times=[],writeBytes=[],readBytes=[];
    const call=async(command,fields={})=>{
      const at=performance.now(),response=await mf.dispatchFetch('http://fixture.invalid/',{method:'POST',body:JSON.stringify({command,component,worst,now,...fields})});
      assert.equal(response.status,200); const out=await response.json();out.wallMs=performance.now()-at;
      assert.ok(out.rootBytes<=BODY_STORAGE.rootBytes);assert.ok(out.rowBytes.every(n=>n<=BODY_STORAGE.rowBytes));assert.equal(out.exact,true);return out;
    };
    let out=await call('begin');assert.equal(out.error,null);let ticket=out.result;
    out=await call('join',{ticket});assert.equal(out.error,null);assert.ok(out.result.every(r=>r.ok));const tokens=out.result.map(r=>r.session.token);
    for(let i=0;i<120;i++){
      if(changing)component=worst?(i%2?'x':'y').repeat(8190):actual[(i+1)%actual.length];
      now+=250;out=await call('tick',{ticket,tokens});assert.equal(out.error,null);times.push(out.wallMs);writeBytes.push(out.writeBytes);readBytes.push(out.readBytes);
    }
    const tickKeysRead=out.reads,tickKeysWritten=out.writes;
    const revision=out.revision;now+=250;out=await call('fail',{ticket,tokens});assert.match(out.error,/injected rollback/);assert.equal(out.revision,revision);
    await mf.dispose();mf=null;await start(path);out=await call('inspect');assert.equal(out.revision,revision);assert.equal(out.rowBytes.length,30);
    now+=10000;out=await call('claim');assert.equal(out.error,null);const replacement=out.result;
    out=await call('tick',{ticket,tokens});assert.match(out.error,/fenced/);
    out=await call('tick',{ticket:replacement,tokens});assert.equal(out.error,null);
    results.push({scenario,samples:120,bodies:30,simulationReservedBytes:65536,
      componentBytes:Buffer.byteLength(JSON.stringify(component)),rootBytes:out.rootBytes,maxRowBytes:Math.max(...out.rowBytes),
      totalStoredBytes:out.rootBytes+out.rowBytes.reduce((s,n)=>s+n,0),wallMs:stats(times),readBytes:stats(readBytes),writeBytes:stats(writeBytes),keysReadPerTick:tickKeysRead,keysWrittenPerTick:tickKeysWritten,
      rollback:true,persistedRestart:true,oldOwnerFenced:true});
    await mf.dispose();mf=null;
  }
  assert.equal(deniedEgress,0);assert.equal(logs.length,0);
  console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,miniflare:manifest.version,deniedEgress,logs:logs.length,results,
    limitations:['Storage-only fixture: one actual restricted Clanker component copied across 30 synthetic identities; no independent body AI or integrated passive physics.',
      'World is a full-size padding fixture, not the full island. Worst body is a ceiling-sized string and is not a valid Clanker component.',
      'Sequential finite samples are not sustained 4Hz, billed CPU, production memory or phone latency. Dispatch, JSON validation/copying and diagnostic reads are included.',
      'Orderly restart is not abrupt eviction. Cached runtime differs from declared Wrangler. No live bindings, provisioning or paid loop.']},null,2));
} finally { if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true}); }
