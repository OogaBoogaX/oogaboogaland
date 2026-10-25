// Focused walking allocations. Stage first; run with one focused game Chrome.
// CHROME_ARCH=arm64 node scripts/profile-allocations.mjs REPO LABEL [--sample] [--covered]
// Sampling attributes transient allocations; use a separate unsampled run for GC/frame acceptance.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(process.argv[2]), label=process.argv[3]||'walking', sample=process.argv.includes('--sample'), covered=process.argv.includes('--covered');
const {launch,dispose}=await import(pathToFileURL(join(root,'test/browser.mjs')));
const out=join(root,'untracked/performance');mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp3':'audio/mpeg'};
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{const body=readFileSync(join(root,'_site',path==='/'?'index.html':path));res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
let b,profile=null,completed=false,error=null,measurement=null,environment=null,stage="launch",logs=[];
try{
 b=await launch({w:1920,h:1080,perf:true,motion:true});await b.focus(true);
 let loaded=false;b.on("Page.loadEventFired",()=>loaded=true);stage="navigate";await b.open(`${base}/?debug=1&nosim=1&net=0&chain=0&hour=12&day=80&bananas=1000&pos=0`);
 stage="document";for(let i=0;!loaded&&i<600;i++)await b.sleep(50);if(!loaded)throw Error("Page load event deadline");stage="ready";const ready=await b.evaluate(`new Promise(resolve=>{const start=performance.now();const tick=()=>{if(window.__ooga?.renderedFrames>=5&&!document.getElementById('curtain'))resolve(true);else if(performance.now()-start>30000)resolve(false);else setTimeout(tick,50);};tick();})`);
 if(!ready)throw Error('Hub not ready');
 stage="environment";environment=await b.evaluate(`(()=>{const gl=document.getElementById('scene').getContext('webgl2'),e=gl?.getExtension('WEBGL_debug_renderer_info');return {agent:navigator.userAgent,memory:navigator.deviceMemory??null,dpr:devicePixelRatio,gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null,renderer:__ooga.renderer.kind};})()`);
 await b.evaluate(`(()=>{const B=__ooga,a=B.cavemen.get('portlandhodl');B.renderer.setQuality('high');if(B.crew.player!==a)B.pilot.possess(a);B.pilot.navigate({position:{x:10,y:B.island.surfaceAt(10,0),z:0},yaw:0,pitch:.4,dist:${covered?55:10}});const S=BL.scenes.hub,update=S.update;
  window.__walkAlloc={actor:a,update,times:new Float64Array(7200),heap:new Float64Array(7200),duration:0,frames:0,draws:0,dropBytes:0,travel:0,outlined:0,qualityStart:null,qualityEnd:null};
  ${covered?`S.update=function(dt,elapsed){const result=update.call(this,dt,elapsed),c=B.camera.position,t=B.camera.target,p=a.root.position;c.x=0;c.y=0;c.z=10;t.x=p.x;t.y=p.y+.7;t.z=p.z;return result;};`:''}
  window.__walkAlloc.run=seconds=>new Promise(resolve=>{const R=window.__walkAlloc,p=a.root.position,x=p.x,z=p.z;let start=0,previous=0,lastHeap=0,held='',count=0,first=0,drop=0;const key=(name,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:name,code:'Key'+name.toUpperCase()}));
   const tick=now=>{if(!start){start=previous=now;first=B.renderedFrames;R.qualityStart=B.renderer.quality;held='d';key(held,true);requestAnimationFrame(tick);return;}
    const heap=performance.memory?.usedJSHeapSize||0;R.times[count]=now-previous;R.heap[count]=heap;if(lastHeap>heap)drop+=lastHeap-heap;lastHeap=heap;previous=now;count++;R.travel=Math.max(R.travel,Math.hypot(p.x-x,p.z-z));if(B.headquarters.sightGuides.objectsEnabled)R.outlined++;
    const next=Math.floor((now-start)/420)%2?'a':'d';if(next!==held){key(held,false);key(next,true);held=next;}
    if(now-start<seconds*1000&&count<R.times.length)requestAnimationFrame(tick);else{key(held,false);R.duration=now-start;R.frames=count;R.draws=B.renderedFrames-first;R.dropBytes=drop;R.qualityEnd=B.renderer.quality;resolve(true);}};requestAnimationFrame(tick);});})()\n//# sourceURL=ooga-walking-alloc-probe.js`);
 stage="warmup";await b.evaluate('__walkAlloc.run(5)');
 // Warm the exact walk/outline path before sampling and GC-rate measurements.
 await b.send('HeapProfiler.enable');await b.send('HeapProfiler.collectGarbage');
 await b.evaluate('__walkAlloc.travel=__walkAlloc.outlined=0');
 if(sample){const reply=await b.send('HeapProfiler.startSampling',{samplingInterval:16384,stackDepth:64,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});if(reply.error)throw Error(JSON.stringify(reply.error));}
 stage="measure";await b.evaluate('__walkAlloc.run(15)');
 if(sample){const reply=await b.send('HeapProfiler.stopSampling');if(reply.error)throw Error(JSON.stringify(reply.error));profile=reply.result.profile;}
 measurement=await b.evaluate(`(()=>{const R=__walkAlloc,t=Array.from(R.times.subarray(0,R.frames)).sort((a,b)=>a-b),B=__ooga;return {durationMs:R.duration,frames:R.frames,drawnFrames:R.draws,fps:R.draws*1000/R.duration,p50:t[Math.floor(t.length*.5)],p95:t[Math.floor(t.length*.95)],p99:t[Math.floor(t.length*.99)],framesOver33:t.filter(x=>x>33).length,gcReclaimedBytes:R.dropBytes,gcMiBPerSecond:R.dropBytes*1000/R.duration/1048576,travel:R.travel,outlinedFrames:R.outlined,qualityStart:R.qualityStart,qualityEnd:R.qualityEnd,heapStart:R.heap[0],heapEnd:R.heap[R.frames-1],timerGranularity:'precise-memory-info Chrome driver flag'};})()`);
 await b.evaluate('BL.scenes.hub.update=__walkAlloc.update;delete window.__walkAlloc');
 if(b.logs.length)throw Error(`Console noise: ${b.logs.join(' | ').slice(0,1000)}`);
 completed=true;
}catch(e){error=String(e.stack||e);}
finally{logs=b?.logs||[];if(b)await b.close(true);await dispose();await new Promise(r=>server.close(r));}
let allocations=null;
if(profile){
 writeFileSync(join(out,`${label}.heapprofile`),JSON.stringify(profile));
 const source=readFileSync(join(root,'_site/index.html'),'utf8').split('\n'),marks=[];
 for(let i=0;i<source.length;i++){const m=source[i].match(/^\/\/ ---- (js\/[^ ]+) ----$/);if(m)marks.push({line:i+1,file:m[1]});}
 const frame=f=>{let file=f.url,line=f.lineNumber+1;if(file.startsWith(base+'/')&&['/','/index.html'].includes(new URL(file).pathname)){let mark=null;for(const m of marks){if(m.line>line)break;mark=m;}if(mark){file=mark.file;line-=mark.line;}}return {name:f.functionName||'(anonymous)',file,line,column:f.columnNumber+1};};
 const rows=[];const walk=(node,stack)=>{const here=frame(node.callFrame),next=[...stack,here];if(node.selfSize)rows.push({bytes:node.selfSize,...here,callers:stack.slice(-8)});let total=node.selfSize;for(const child of node.children)total+=walk(child,next);return total;};
 const bytes=walk(profile.head,[]);rows.sort((a,b)=>b.bytes-a.bytes);
 allocations={estimatedBytes:bytes,estimatedBytesPerFrame:measurement?bytes/measurement.drawnFrames:null,estimatedMiBPerSecond:measurement?bytes*1000/measurement.durationMs/1048576:null,interval:16384,collectedObjectsIncluded:true,top:rows.slice(0,60)};
}
const built=readFileSync(join(root,'_site/index.html'));
const result={label,completed,error,stage,logs,hostRuntime:{arch:process.arch,node:process.version,chromeArchRequested:process.env.CHROME_ARCH||null},startupCpuRecording:false,sample,covered,environment,measurement,allocations,buildSHA256:createHash('sha256').update(built).digest('hex'),caveats:['Sampling is probabilistic and adds overhead; compare GC/frame acceptance using separate unsampled runs.','Heap-drop summation estimates GC reclamation across frame boundaries and is not an allocation total.','The recording buffers are allocated before sampling; real KeyboardEvents still contribute small harness overhead.','No heap snapshot, retained listener wrappers, or forced GC runs during the measured15second window.']};
writeFileSync(join(out,`${label}.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,allocations:allocations?{...allocations,top:allocations.top.slice(0,12)}:null}));if(!completed)process.exitCode=1;
