// Actual built-page shoreline smoke test in headless Chrome, desktop and phone.
// Uses the repository's DevTools driver without introducing dependencies.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, dispose } from "./browser.mjs";

const shots=resolve("shoreline-browser-artifacts");
mkdirSync(shots,{recursive:true});
const url=pathToFileURL(resolve("oogaboogaland.html")).href+
  "?scene=dsb&debug=1&view=water-rocks";
const viewpoints=[
  {name:"original-chora",sector:19},
  {name:"east-rocks",sector:14},
  {name:"west-flank",sector:29},
  {name:"harbor-excluded",sector:24},
  {name:"olympus-rear-excluded",sector:2,fromSea:true}
];
async function ready(browser,label) {
  let last;
  for(let i=0;i<75;i++){
    last=await browser.evaluate(`(() => ({
      loaded:document.readyState,
      state:typeof window.__ooga,
      dsb:!!window.__ooga?.dsb?.land,
      water:!!window.__ooga?.dsb?.water,
      active:!!window.__ooga?.dsb?.waterInteraction,
      canvas:!!document.querySelector('#scene'),
      location:location.href
    }))()`).catch(e=>({error:String(e)}));
    if(last?.dsb&&last?.water&&last?.active&&last?.canvas)return;
    await browser.sleep(1000);
  }
  throw new Error(label+" DSB scene did not become ready: "+JSON.stringify(last)+
    " logs="+browser.logs.slice(-8).join(" | "));
}
async function check(browser,label,width,height){
  await browser.open(url);
  await ready(browser,label);
  const inspection=await browser.evaluate(`(() => {
    const d=window.__ooga.dsb,C=window.BL.dsbCoast,land=d.land;
    const excluded=new Set([0,1,2,3,4,5,22,23,24,25,26,27,28,31,32,33]);
    let allowed=0,blocked=0,depthStops=0;
    for(let i=0;i<land.coast.length;i++){
      const a=land.coast[i],b=land.coast[(i+1)%land.coast.length];
      const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,out={};
      const access=C.wade(land.coast,x,z,out);
      if(excluded.has(i)){
        if(access!==0)return {error:"excluded coast accessible",i,access};
        blocked++;
      }else{
        if(access<.99)return {error:"accessible coast disabled",i,access};
        allowed++;
        const px=x+out.nx*7,pz=z+out.nz*7;
        if(land.heightAt(px,pz)>=C.LEVEL)return {error:"no shallow seabed",i};
        const dx=x+out.nx*23,dz=z+out.nz*23;
        const sx=x+out.nx*8,sz=z+out.nz*8;
        if(!land.walkable(sx,sz,dx,dz,land.heightAt(sx,sz),d.avatar.bodyHeight,d.avatar))
          depthStops++;
      }
    }
    const node=document.querySelector('#scene');
    return {allowed,blocked,depthStops,viewport:[innerWidth,innerHeight],
      canvas:[node.width,node.height],effectBudget:d.waterInteraction.stats.capacity,
      waterTextures:d.water?.depths?.length,
      controls:!!window.__ooga.pilot,graphics:window.__ooga?.renderer?.kind||null};
  })()`);
  assert.ok(!inspection.error,label+" "+JSON.stringify(inspection));
  assert.equal(inspection.allowed,18);
  assert.equal(inspection.blocked,16);
  assert.equal(inspection.depthStops,18);
  assert.equal(inspection.effectBudget,24);
  assert.ok(inspection.canvas[0]>0&&inspection.canvas[1]>0);
  console.log(label+" runtime checks: "+JSON.stringify(inspection));
  // The donation drawer hides most of the desktop viewport. Hide it only in
  // review screenshots; this does not change gameplay, layout code or saved UI.
  await browser.evaluate(`(() => {
    const drawer=document.getElementById('sheet');
    if(drawer)drawer.style.setProperty('display','none','important');
    const debug=document.getElementById('position-debug');
    if(debug)debug.style.setProperty('display','none','important');
  })()`);
  for(const view of viewpoints){
    const result=await browser.evaluate(`(() => {
      const d=window.__ooga.dsb,coast=d.land.coast,i=${view.sector};
      const a=coast[i],b=coast[(i+1)%coast.length],t=.5;
      const sx=a[0]+(b[0]-a[0])*t,sz=a[1]+(b[1]-a[1])*t,near={};
      window.BL.dsbCoast.nearest(coast,sx,sz,near);
      const fromSea=${!!view.fromSea},depth=fromSea?-4:2;
      const x=sx-near.nx*depth,z=sz-near.nz*depth,y=d.land.heightAt(x,z);
      const yaw=Math.atan2((fromSea?1:-1)*near.nx,(fromSea?1:-1)*near.nz);
      window.__ooga.pilot.navigate({position:{x,y,z},yaw,pitch:.25,dist:fromSea?18:10});
      return {cameraReady:!!window.__ooga.camera,shore:[sx,sz],position:[x,y,z],
        wadingAllowed:window.BL.dsbCoast.wade(coast,sx,sz)>0};
    })()`);
    assert.equal(result.cameraReady,true,label+" "+view.name);
    assert.equal(result.wadingAllowed,!view.fromSea&&view.name!=="harbor-excluded",
      label+" "+view.name+" access rule");
    console.log(label+" "+view.name+" camera="+JSON.stringify(result));
    await browser.sleep(950);
    const path=resolve(shots,label+"-"+view.name+".png");
    await browser.screenshot(path);
    const png=readFileSync(path);
    assert.ok(png.length>2500,label+" "+view.name+" screenshot empty");
    assert.equal(png.toString("hex",0,8),"89504e470d0a1a0a");
    console.log(label+" "+view.name+" image="+png.length+" bytes");
  }
  const issues=browser.logs.filter(x=>/\[exception\]|\[log\.error\]|\[console\.error\]/.test(x));
  // Nonfatal network/CDN lookups can fail in a file:// review; actual runtime
  // exceptions or shader failures must still be reported.
  const fatal=issues.filter(x=>/Uncaught|Shader|WebGL|TypeError|ReferenceError|RangeError|SyntaxError/i.test(x));
  assert.equal(fatal.length,0,label+" browser runtime errors: "+fatal.slice(0,8).join(" | "));
}
try {
  for(const v of [{label:"desktop",w:800,h:500,mobile:false},
                   {label:"phone",w:390,h:844,mobile:true}]){
    const browser=await launch(v);
    try{await check(browser,v.label,v.w,v.h);}
    finally{await browser.close(true);}
  }
  console.log("Shoreline Chrome review passed: desktop + mobile screenshots recorded.");
} finally {
  await dispose();
}
