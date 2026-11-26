// Kiln paint stays on the colour sheet. A small, mipmapped relief plate holds
// the two surface slopes and the raised lead fraction for the moving glints.
(() => {
  "use strict";
  const cache=new WeakMap();
  const relief=function* (source,kind,slice){
    if(cache.has(source))return cache.get(source);
    const scale=Math.min(1,640/Math.max(source.width,source.height));
    const tile=document.createElement("canvas");
    const w=tile.width=Math.max(2,Math.round(source.width*scale));
    const h=tile.height=Math.max(2,Math.round(source.height*scale));
    const ctx=tile.getContext("2d");ctx.drawImage(source,0,0,w,h);
    const pixels=ctx.getImageData(0,0,w,h).data,count=w*h;
    const value=new Uint8Array(count),came=new Float32Array(count);
    const regions=new Int32Array(count),stack=new Int32Array(count);
    for(let i=0;i<count;i++)value[i]=Math.max(pixels[4*i],pixels[4*i+1],pixels[4*i+2]);
    // Broad dark fields remain coloured glass. Narrow dark ridges enclosed by
    // brighter neighbours carry the lead; fine flesh painting stays smooth.
    for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
      if(slice && (i&8191)===0)yield* window.BL.buildTasks.pause(slice);
      const k=4*i,r=pixels[k],g=pixels[k+1],b=pixels[k+2],v=value[i];
      const step=2;
      const across=Math.max(Math.min(value[i-Math.min(step,x)],value[i+Math.min(step,w-1-x)]),
        Math.min(value[i-w*Math.min(step,y)],value[i+w*Math.min(step,h-1-y)]));
      const paint=kind==="hearth" && y<h*.37 && y>h*.16 &&
        ((x>w*.10 && x<w*.235)||(x>w*.725 && x<w*.885));
      came[i]=paint?0:Math.max(0,Math.min(1,(across-v-9)/43,(142-v)/55));
      // Flood contiguous colours bounded by dark cames; use a coarse hue bin
      // to separate pieces even when downsampling interrupted a thin lead line.
      const hue=r>=g && r>=b?(g>b?1:2):g>=b?(r>b?3:4):(g>r?5:6);
      regions[i]=v<65 || came[i]>.3 ? 0 : -hue;
    }
    let seed=0;
    for(let start=0;start<count;start++){
      if(slice && (start&8191)===0)yield* window.BL.buildTasks.pause(slice);
      const colour=regions[start];if(colour>=0)continue;
      const id=++seed;let top=1;stack[0]=start;regions[start]=id;
      while(top){
        const i=stack[--top],x=i%w;
        if(x && regions[i-1]===colour){regions[i-1]=id;stack[top++]=i-1;}
        if(x<w-1 && regions[i+1]===colour){regions[i+1]=id;stack[top++]=i+1;}
        if(i>=w && regions[i-w]===colour){regions[i-w]=id;stack[top++]=i-w;}
        if(i<count-w && regions[i+w]===colour){regions[i+w]=id;stack[top++]=i+w;}
      }
    }
    const bytes=new Uint8Array(count*4);
    for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
      if(slice && (i&8191)===0)yield* window.BL.buildTasks.pause(slice);
      const id=regions[i],angle=kind==="flower"?Math.atan2(y-h/2,x-w/2):id*2.399963;
      const dx=Math.cos(angle),dy=Math.sin(angle),u=x*dx+y*dy,v=y*dx-x*dy;
      const ripple=.32*Math.sin(v*.18+1.4*Math.sin(u*.055)+id)+.15*Math.sin(v*.49-u*.035);
      const skin=kind==="hearth" && pixels[4*i]>pixels[4*i+1] && pixels[4*i+1]>pixels[4*i+2] && pixels[4*i+1]>115;
      const strength=skin?.23:1;
      const sx=came[x?i-1:i]-came[x+1<w?i+1:i],sy=came[y?i-w:i]-came[y+1<h?i+w:i];
      bytes[i*4]=128+Math.round(84*(sx-ripple*dy*strength));
      bytes[i*4+1]=128+Math.round(84*(sy+ripple*dx*strength));
      bytes[i*4+2]=Math.round(255*came[i]);
      bytes[i*4+3]=Math.round(128+100*ripple*strength);
    }
    const map={w,h,bytes};cache.set(source,map);return map;
  };
  const fitSteps=function* (surface,kind,slice){
    if(!surface)return;
    const src=surface.canvas||surface.fallback();
    const room=window.BL.pokerSalons.ROOMS[0];
    surface.glazing={map:yield* relief(src,kind,slice),fire:new Float32Array([room.x,room.y+1.85,room.z-room.d/2+2.2]),
      sky:kind==="roof"?1.04:kind==="hearth"?.99:kind==="entrance"?.84:kind==="shade"?.86:.96};
  };
  const fit=(surface,kind)=>fitSteps(surface,kind,null).next();
  window.BL.pokerGlassMaterial={fit,fitSteps};
})();
