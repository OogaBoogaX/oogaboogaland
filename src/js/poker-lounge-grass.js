// The turf, wind-bent leaf tips and clear aperture around the Minneapolis window.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,tau=2*Math.PI;
  const soilY=.007;
  const turf=function* (r,lite,slice){
    const w=r.w,d=r.d;
    // Match the glazier's polygon at the rim. Extra corner rays carry the sod
    // right out to the rectangular walls without cutting off a corner.
    const g=M.geometry(),angles=Array.from({length:64},(_,i)=>tau*i/64);
    for(const x of [-w,w])for(const y of [-d,d])angles.push((Math.atan2(y,x)+tau)%tau);
    angles.sort((a,b)=>a-b);
    const painted=typeof CanvasRenderingContext2D!=="undefined";
    const rings=lite?3:8,inner=BL.pokerCathedral.studioRadius-.025,white=painted?[255,255,255]:[76,112,61];
    for(const a of angles){
      const x=Math.cos(a),y=Math.sin(a),outer=Math.min(w/2/Math.abs(x),d/2/Math.abs(y));
      for(let j=0;j<=rings;j++){
        const radius=inner+(outer-inner)*j/rings;
        M.pushVert(g,x*radius,y*radius,0);
      }
    }
    for(let i=0;i<angles.length;i++)for(let j=0;j<rings;j++){
      const a=i*(rings+1)+j,b=((i+1)%angles.length)*(rings+1)+j;
      M.face(g,[a,a+1,b+1,b],white,{emissive:.14});
    }
    g.castShadow=false;
    if(!painted)return g;
    const canvas=document.createElement("canvas");
    canvas.width=lite?768:1536;canvas.height=Math.round(canvas.width*d/w);
    const ctx=canvas.getContext("2d"),rand=BL.math.mulberry32(21896),width=canvas.width,height=canvas.height;
    ctx.fillStyle="#49713c";ctx.fillRect(0,0,width,height);
    for(let i=0;i<170;i++){
      const x=rand()*width,y=rand()*height,rad=(.018+.09*rand())*width;
      const wash=ctx.createRadialGradient(x,y,0,x,y,rad);
      wash.addColorStop(0,i%3?"rgba(29,71,50,.46)":"rgba(157,168,76,.47)");
      wash.addColorStop(1,"transparent");ctx.fillStyle=wash;ctx.fillRect(x-rad,y-rad,2*rad,2*rad);
    }
    // Fine overlapping bent leaves supply continuous cover between the taller blades.
    const scale=width/w;
    for(const ink of ["#284f39","#557e43","#365f38","#6d964e","#89a95e","#598547"]){
      ctx.strokeStyle=ink;ctx.globalAlpha=.71;ctx.lineWidth=.027*scale;
      for(let group=0;group<24;group++){
        ctx.beginPath();
        for(let k=0;k<430;k++){
          const x=rand()*width,y=rand()*height,a=1.5*Math.sin(x/width*14+Math.sin(y/height*17))+rand()*2.6;
          const len=(.04+.12*rand())*scale,dx=len*Math.cos(a),dy=len*Math.sin(a);
          ctx.moveTo(x,y);ctx.quadraticCurveTo(x+dx*.55-dy*.17,y+dy*.55+dx*.17,x+dx,y+dy);
        }
        ctx.stroke();
        yield* BL.buildTasks.pause(slice);
      }
    }
    ctx.globalAlpha=1;
    g.imageSurface={canvas,rect:[-w/2,-d/2,w,d],smooth:true,tessellated:true,version:1};
    return g;
  };
  // Small curved ribbons, folded down the midrib so adjacent faces catch
  // different window colours. Each batch shares a single tuft mesh.
  const blades=lite=>{
    const g=M.geometry(),rand=BL.math.mulberry32(3275),count=lite?4:11;
    const palette=["#60844a","#79a456","#83aa63","#5e9455","#97af6f"].map(c=>BL.math.hexToRgb(c));
    for(let i=0;i<count;i++){
      const a=i*2.39996+rand()*.75,x=(rand()-.5)*.28,z=(rand()-.5)*.28;
      const dx=Math.cos(a),dz=Math.sin(a),w=.009+.009*rand(),h=.10+.13*rand(),lean=.04+.085*rand();
      const l=M.pushVert(g,x-dz*w,0,z+dx*w),right=M.pushVert(g,x+dz*w,0,z-dx*w);
      const mid=M.pushVert(g,x+dx*lean*.20,h*.54,z+dz*lean*.20);
      const side=M.pushVert(g,x+dx*lean*.38+dz*w*.68,h*.60,z+dz*lean*.38-dx*w*.68);
      const tip=M.pushVert(g,x+dx*lean,h,z+dz*lean);
      for(const [indices,ink] of [[[l,mid,right],palette[0]],[[right,mid,side],palette[1+i%4]],[[l,tip,mid],palette[1+i%4]],[[mid,tip,side],palette[1+(i+1)%4]]]){
        M.face(g,indices,ink);M.face(g,indices.slice().reverse(),ink);
      }
    }
    g.sway=.88;g.receiveProjection=true;g.castShadow=false;return g;
  };
  const buildSteps=function* (r,lite,solids,slice){
    const rand=BL.math.mulberry32(30129),rug=BL.pokerLoungeStone,margin=.32,radius=BL.pokerCathedral.studioRadius+margin;
    const nx=Math.ceil(r.w/(lite?1.8:.43)),nz=Math.ceil(r.d/(lite?1.8:.43)),cells=nx*nz;
    // Randomize the prefix so lower tiers thin every part of the lawn equally.
    const order=Uint16Array.from({length:cells},(_,i)=>i);
    for(let i=cells-1;i>0;i--){const j=Math.floor(rand()*(i+1)),a=order[i];order[i]=order[j];order[j]=a;}
    const data=new Float32Array(cells*20);
    let count=0;
    for(const cell of order){
      const x=((cell%nx+.08+.84*rand())/nx-.5)*(r.w-.6),z=((Math.floor(cell/nx)+.08+.84*rand())/nz-.5)*(r.d-.6);
      if(x*x+z*z<radius*radius || Math.abs(x)<rug.rugWidth/2+margin && Math.abs(z-rug.rugZ(r))<rug.rugDepth/2+margin)continue;
      if(solids.some(s=>Math.abs(s.x-x)<s.w+.16 && Math.abs(s.z-z)<s.d+.16) || BL.pokerDesertGarden.inBed(r,x,z))continue;
      const facing=rand()*tau,s=.79+.42*rand(),c=Math.cos(facing)*s,sn=Math.sin(facing)*s,o=count++*20;
      data[o]=c;data[o+2]=-sn;data[o+5]=.76+.45*rand();data[o+8]=sn;data[o+10]=c;
      data[o+12]=r.x+x;data[o+13]=r.y+soilY;data[o+14]=r.z+z;data[o+15]=data[o+16]=1;
    }
    return {ground:yield* turf(r,lite,slice),leaves:blades(lite),data:data.subarray(0,count*20),count};
  };
  const install=(room,r,built,lite)=>{
    const ground=S.createNode({geometry:built.ground,position:{x:0,y:soilY,z:0},rotation:{x:-Math.PI/2,y:0,z:0},sightHidden:true});
    const data=lite?built.data.slice():built.data;
    const node=S.createNode({geometry:built.leaves,instanceData:data,instanceCount:built.count,instanceVersion:1,sightHidden:true,
      cullSphere:[r.x,r.y+.14,r.z,Math.hypot(r.w,r.d)/2+.4]});
    S.addChild(room,ground,node);
    let last=-1;
    return (time,calm,tier)=>{
      if(!lite){node.drawInstanceCount=Math.round(built.count*(tier==="high"?1:tier==="medium"?.66:.4));return;}
      // Canvas draws ordinary transforms. Shear its sparse stems about their
      // rooted feet at a limited cadence; WebGL bends the denser batch on the GPU.
      const tick=calm?0:Math.floor(time*10);
      if(tick===last)return;last=tick;
      for(let o=0;o<data.length;o+=20){
        const phase=tick*.19+data[o+12]*.37+data[o+14]*.29;
        const bend=calm?0:.14*(Math.sin(phase)+.35*Math.sin(2.3*phase+1.7));
        data[o+4]=bend*.8;data[o+6]=bend*.6;
      }
      node.instanceVersion++;
    };
  };
  BL.pokerLoungeGrass={buildSteps,install};
})();
