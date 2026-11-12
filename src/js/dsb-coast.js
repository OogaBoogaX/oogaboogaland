// Island-wide shallow wading, excluding harbor and the rear Olympus cliff shoreline.
(() => {
  "use strict";
  const BL=window.BL, LEVEL=-.3, MAX_DEPTH=1.65;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  // Matches the existing furnished sand belt; fades at its ends, never behind Olympus or into the harbor.
  const beach=(x,z)=>smooth((x+3)/6)*smooth((53-x)/6)*smooth((z-61)/3);
  const nearest=(coast,x,z,out)=>{
    let best=Infinity;
    for(let i=0;i<coast.length;i++){
      const a=coast[i],b=coast[(i+1)%coast.length],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz;
      const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/l2,0,1),px=a[0]+dx*t,pz=a[1]+dz*t,d=(x-px)**2+(z-pz)**2;
      if(d<best){best=d;out.x=px;out.z=pz;const length=Math.sqrt(l2);out.nx=dz/length;out.nz=-dx/length;out.segment=i;out.t=t;out.length=length;}
    }
    out.distance=Math.sqrt(best);out.beach=beach(out.x,out.z);return out;
  };
  // Segment indices follow dsb-geography's authored coast polygon. Keep the working
  // harbor and Olympus rear face untouched; transition along neighboring segments.
  // The west flank between harbor and rear cliff remains eligible for wading.
  const REAR_OLYMPUS=[31,32,33,0,1,2,3,4,5];
  const HARBOR=[22,23,24,25,26,27,28];
  const blocked=new Set([...REAR_OLYMPUS,...HARBOR]);
  const wade=(coast,x,z,out={})=>{
    nearest(coast,x,z,out);
    const i=out.segment;
    if(blocked.has(i))return 0;
    // Fade the underwater shelf over the final 2 metres at each excluded boundary.
    const a=blocked.has((i+coast.length-1)%coast.length)?smooth(out.t*out.length/2):1;
    const b=blocked.has((i+1)%coast.length)?smooth((1-out.t)*out.length/2):1;
    return Math.min(a,b);
  };
  const shelfHeight=d=>.4-.13*d-.003*d*d-Math.max(0,d-13)**2*.35;
  const maxDepth=actor=>Math.min(MAX_DEPTH,(actor?.bodyHeight||2.6)*.98);
  const speed=immersion=>1-.66*smooth((immersion-.08)/.92);
  BL.dsbCoast={LEVEL,MAX_DEPTH,beach,nearest,wade,shelfHeight,maxDepth,speed};
})();
