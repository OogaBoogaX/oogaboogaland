// Build the portable page first. Normal-vsync Map layout and interaction diagnostics.
// CHROME_ARCH=arm64 node scripts/profile-destination-map.mjs
import {launch,dispose} from '../test/browser.mjs';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
const out=new URL('../untracked/performance/destination-map/',import.meta.url);mkdirSync(out,{recursive:true});
const filter=process.env.MAP_CAPTURE,results=new URL('results.json',out),rows=filter&&existsSync(results)?JSON.parse(readFileSync(results,'utf8')).filter(r=>r.name!==filter):[];
for(const [name,w,h,mobile,query='',target='mempool'] of [['desktop',1440,900,false],['phone',390,844,true],['narrow',320,640,true],['zoom-equivalent',720,450,false],['gorilla',1440,900,false,'&character=gorilla-portlandhodl&status=clankin','lab'],['dsb',1440,900,false,'&scene=dsb','coastal-harbor']]){
 if(filter&&name!==filter)continue;
 let b;try{b=await launch({w,h,mobile,perf:true,motion:true});await b.open(new URL('../oogaboogaland.html?debug=1&nosim=1&net=0&hour=12&day=80'+query,import.meta.url).href);
 for(let i=0;i<600&&!await b.evaluate('!!window.__ooga&&__ooga.renderedFrames>2&&!document.getElementById("curtain")');i++)await b.sleep(50);
 await b.evaluate('if(__ooga.scene==="hub")BL.scenes.hub.debug.tess.escape();else __ooga.dsb.entrance?.skip();__ooga.advance(.5,1/60);document.getElementById("destination-hud").click()');
 if(name==='gorilla'&&!await b.evaluate('!!__ooga.clankerPlay?.player'))throw new Error('Gorilla fixture did not acquire a driven body');
 const state=await b.evaluate(`(()=>{const d=document.getElementById('destination-map'),r=d.getBoundingClientRect(),buttons=Array.from(d.querySelectorAll('button')),focus=document.activeElement;return{open:d.open,bounds:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,focus:focus.id,buttons:buttons.map(b=>({name:b.textContent.trim(),height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),contrast:getComputedStyle(d.querySelector('h3')).color};})()`);
 await b.screenshot(new URL(name+'.png',out).pathname);
 const latency=[];
 for(let i=0;i<10;i++)latency.push(await b.evaluate(`new Promise(resolve=>{BL.destinationMap.close();const start=performance.now();document.getElementById('destination-hud').click();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));})`));
 const preview=await b.evaluate(`(()=>{const B=__ooga,p=(B.clankerPlay?.player||B.pilot.player)?.root.position;window.__atlasBefore=p?{x:p.x,y:p.y,z:p.z}:null;document.querySelector('[data-map-destination="${target}"]').click();return{mode:document.getElementById('destination-map-mode').textContent,action:document.getElementById('destination-map-go').textContent,detail:document.getElementById('destination-map-detail').textContent,pins:[...document.querySelectorAll('[data-map-destination]')].map(e=>{const r=e.getBoundingClientRect();return{name:e.dataset.mapDestination,x:r.x,y:r.y,w:r.width,h:r.height};})};})()`);
 await b.screenshot(new URL(name+'-preview.png',out).pathname);
 const result=await b.evaluate(`(()=>{document.getElementById('destination-map-go').click();const B=__ooga,p=(B.clankerPlay?.player||B.pilot.player)?.root.position,q=window.__atlasBefore;delete window.__atlasBefore;return{open:document.getElementById('destination-map').open,receipt:document.getElementById('destination-map-receipt').textContent,notice:document.getElementById('destination-map-status').textContent,moved:p&&q?Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z):null};})()`);
 await b.sleep(350); await b.screenshot(new URL(name+'-result.png',out).pathname);
 await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const reduced=await b.evaluate(`({receipt:getComputedStyle(document.getElementById('destination-map-receipt')).animationName,effect:getComputedStyle(document.getElementById('destination-map-effect')).display})`);
 await b.send('Emulation.setEmulatedMedia',{features:[]});
 let touch=null;
 await b.evaluate(`BL.destinationMap.close();document.getElementById('destination-hud').click()`);
 if(mobile){
  const point=await b.evaluate(`(()=>{const d=document.getElementById('destination-map');d.scrollTop=d.scrollHeight;const r=document.getElementById('destination-map-close').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:5,radiusY:5,force:1,id:1}]});
  await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  touch=await b.evaluate(`!document.getElementById('destination-map').open`);
 }
 rows.push({name,...state,latency,preview,result,reduced,touch,logs:b.logs});
 }finally{if(b)await b.close(true);await dispose();}
}writeFileSync(new URL('results.json',out),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
