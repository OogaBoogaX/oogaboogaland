// Build the portable page first. Normal-vsync Map layout and interaction diagnostics.
// CHROME_ARCH=arm64 node scripts/profile-destination-map.mjs
import {launch,dispose} from '../test/browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=new URL('../untracked/performance/destination-map/',import.meta.url);mkdirSync(out,{recursive:true});const rows=[];
for(const [name,w,h,mobile] of [['desktop',1440,900,false],['phone',390,844,true],['narrow',320,640,true],['zoom-equivalent',720,450,false]]){
 let b;try{b=await launch({w,h,mobile,perf:true,motion:true});await b.open(new URL('../oogaboogaland.html?debug=1&nosim=1&net=0&hour=12&day=80',import.meta.url).href);
 for(let i=0;i<600&&!await b.evaluate('!!window.__ooga&&__ooga.renderedFrames>2&&!document.getElementById("curtain")');i++)await b.sleep(50);
 await b.evaluate('BL.scenes.hub.debug.tess.escape();document.getElementById("destination-hud").click()');
 const state=await b.evaluate(`(()=>{const d=document.getElementById('destination-map'),r=d.getBoundingClientRect(),buttons=Array.from(d.querySelectorAll('button')),focus=document.activeElement;return{open:d.open,bounds:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth>innerWidth,focus:focus.id,buttons:buttons.map(b=>({name:b.textContent.trim(),height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),contrast:getComputedStyle(d.querySelector('h3')).color};})()`);
 await b.screenshot(new URL(name+'.png',out).pathname);
 const latency=[];
 for(let i=0;i<10;i++)latency.push(await b.evaluate(`new Promise(resolve=>{BL.destinationMap.close();const start=performance.now();document.getElementById('destination-hud').click();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start)));})`));
 let touch=null;
 if(mobile){
  const point=await b.evaluate(`(()=>{const d=document.getElementById('destination-map');d.scrollTop=d.scrollHeight;const r=document.getElementById('destination-map-close').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,radiusX:5,radiusY:5,force:1,id:1}]});
  await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  touch=await b.evaluate(`!document.getElementById('destination-map').open`);
 }
 rows.push({name,...state,latency,touch,logs:b.logs});
 }finally{if(b)await b.close(true);await dispose();}
}writeFileSync(new URL('results.json',out),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
