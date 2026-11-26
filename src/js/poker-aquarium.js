// Whale Watch. The bar and the terrace look into the same basin, in hall metres.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const TOP=BL.pokerFloor.TOP, BED=TOP-26, G=BL.pokerGlazing;
  const rear=-G.END_Z, west=-G.SIDE_X, outerWest=west-1800, outerRear=rear-90, outerEast=G.SIDE_X+3*(82-G.SIDE_X);
  const [lounge,vault]=BL.pokerSalons.ROOMS;
  // The two dry rooms interrupt the inner shore. The first five edges face open space:
  // terrace-side spillway, east end, rear cliff, band-side cliff and the return at the far end of the hall.
  const innerShore=room=>{
    const half=room.w/2+.65;
    return [[room.x-half,rear],[room.x-half,room.z-room.d/2-.65],
      [room.x+half,room.z-room.d/2-.65],[room.x+half,rear]];
  };
  const bookShore=innerShore(lounge),iceShore=innerShore(vault);
  // The enlarged lounge extends behind the vault. Their overlapping dry areas
  // form one stepped shoreline and share just one exterior water surface.
  const outline=[[G.SIDE_X,rear],[outerEast,rear],[outerEast,outerRear],[outerWest,outerRear],
    [outerWest,G.END_Z],[west,G.END_Z],[west,rear],...bookShore.slice(0,3),
    [bookShore[2][0],iceShore[1][1]],iceShore[2],iceShore[3]];
  const spillX=54, spillWidth=12;
  const cache = M.scopedMap();
  const face = (g, pts, color, glow) => M.face(g, pts.map(p => M.pushVert(g,...p)), color.map(Math.round), {emissive:glow});
  const add = (root, geometry, x=0, y=0, z=0) => {
    const n = S.createNode({geometry,position:{x,y,z}}); S.addChild(root,n); return n;
  };
  const pebble = (x,y,z,rx,ry,rz,color) => {
    const g=M.lathe({profile:[[0,-1],[.78,-.59],[1,0],[.78,.59],[0,1]],segments:8,color,emissive:.54});
    for(let k=0;k<g.verts.length;k+=3){
      g.verts[k]=x+rx*g.verts[k]; g.verts[k+1]=y+ry*g.verts[k+1]; g.verts[k+2]=z+rz*g.verts[k+2];
    }
    return g;
  };
  const scenery=lite=>{
    const reef=M.geometry(), surface=M.geometry(), roomWater=M.geometry(), falls=M.geometry();
    const random=BL.math.mulberry32(60138);
    // Slice the concave footprint between successive shoreline corners. Each strip is wholly wet
    // or dry, so the return has no diagonal crossing the hall, the bookcase passage or the ice cave.
    const levels=[...new Set(outline.map(p=>p[1]))].sort((a,b)=>a-b), patches=[];
    for(let k=1;k<levels.length;k++){
      const back=levels[k-1],front=levels[k],mid=(back+front)/2,cuts=[];
      for(let i=0;i<outline.length;i++){
        const a=outline[i],b=outline[(i+1)%outline.length];
        if((a[1]>mid)!==(b[1]>mid))cuts.push(a[0]);
      }
      cuts.sort((a,b)=>a-b);
      for(let j=0;j<cuts.length;j+=2){
        const left=cuts[j],right=cuts[j+1];
        patches.push({left,right,back,front,area:(right-left)*(front-back)});
        // Short faces keep the Canvas painter's depth local to the whale passing underneath.
        const cols=Math.ceil((right-left)/(right-left>600?(lite?64:44):right-left>150?(lite?26:16):9)),rows=Math.ceil((front-back)/9);
        for(let ix=0;ix<cols;ix++)for(let iz=0;iz<rows;iz++){
          const x=left+(right-left)*ix/cols,xx=left+(right-left)*(ix+1)/cols;
          const z=back+(front-back)*iz/rows,zz=back+(front-back)*(iz+1)/rows;
          const quad=y=>[[x,y,z],[x,y,zz],[xx,y,zz],[xx,y,z]];
          face(surface,quad(TOP),[29,91,103],.50);
          face(reef,quad(BED),[24,71,83],.60);
        }
      }
    }
    // The two rooms are staged behind these windows and have their own dry floors.
    // From outside, water and a submerged bed continue over their projected footprints.
    // This branch disappears with the aquarium when the visitor enters either room.
    for(const shore of [bookShore,iceShore]){
      const left=shore===iceShore?bookShore[2][0]:shore[0][0],right=shore[2][0],back=shore[1][1];
      for(let x=left;x<right;x+=4)for(let z=back;z<rear;z+=4){
        const xx=Math.min(right,x+4),zz=Math.min(rear,z+4);
        const quad=y=>[[x,y,z],[x,y,zz],[xx,y,zz],[xx,y,z]];
        face(roomWater,quad(TOP),[29,91,103],.50);
        face(reef,quad(BED),[24,71,83],.60);
      }
    }
    // Scatter only inside wet rectangles, weighted by area. Reeds can use an inset from the glass.
    const totalArea=patches.reduce((sum,r)=>sum+r.area,0);
    const bedPoint=()=>{
      let area=random()*totalArea,r=patches[0];
      for(const patch of patches){r=patch;if((area-=r.area)<=0)break;}
      const dx=Math.min(2,(r.right-r.left)/3),dz=Math.min(2,(r.front-r.back)/3);
      return [r.left+dx+random()*(r.right-r.left-2*dx),r.back+dz+random()*(r.front-r.back-2*dz)];
    };
    // Each outer corner shares a mitre with the following sheet. Near the top the roll is continuous;
    // farther down the curtain separates into translucent streams against open sky.
    const normal=i=>{
      const a=outline[i],b=outline[(i+1)%outline.length],n=Math.hypot(b[0]-a[0],b[1]-a[1]);
      return [(a[1]-b[1])/n,(b[0]-a[0])/n];
    };
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      const [nx,nz]=normal(i), exposed=i<5, n=Math.ceil(len/(len>600?(lite?32:18):len>180?(lite?12:6):(lite?3.1:1.6)));
      if(!exposed)continue;
      const first=i>0?normal(i-1):[0,0],last=i<4?normal(i+1):[0,0];
      let prevWater;
      for(let j=0;j<=n;j++){
        const u=j/n,x=a[0]+dx*u,z=a[1]+dz*u;
        const edgeX=nx+(j===0?first[0]:j===n?last[0]:0),edgeZ=nz+(j===0?first[1]:j===n?last[1]:0);
        const at=(out,y)=>[x+edgeX*out,y,z+edgeZ*out];
        const waterRow=[at(0,TOP),at(.27,TOP-.055),at(.65,TOP-.43),at(1.05,TOP-1.8),at(1.36,TOP-6.2)];
        if(!lite)waterRow.push(at(1.62,TOP-24),at(1.78,TOP-150));
        const vertices=waterRow.map(p=>M.pushVert(falls,...p));
        if(prevWater)for(let k=1;k<vertices.length;k++){
          const c=k===1?[169,221,216]:j%7===0?[124,200,207]:[75,158,181];
          M.face(falls,[prevWater[k-1],prevWater[k],vertices[k],vertices[k-1]],c,{emissive:k===1?.78:.64});
        }
        prevWater=vertices;
      }
    }
    for(const [g,alpha] of [[surface,.53],[roomWater,.53],[falls,.72]]){
      for(const f of g.faces) f.water=g===falls?(lite?true:"codefall"):"moonlit";
      g.glass=alpha;g.twoSided=true;g.castShadow=false;
    }
    // Keep the basin walls together, but cull the detailed bed by region. From the bar
    // most kelp is outside the view, and from the terrace the western ledge is behind the eye.
    const beds=Array.from({length:5},()=>({plants:M.geometry(),stones:[]}));
    for(let i=0;i<(lite?36:75);i++){
      const [x,z]=bedPoint(),y=BED-.42,h=1+random()*2.9;
      // Low outcrops on the sandy bed and ribbon kelp with a visible midrib.
      const r=M.lathe({segments:6,profile:[[0,0],[1,0],[.85,h*.55],[.4,h],[0,h*.93]],color:i%2?"#345b63":"#42666a",emissive:.57});
      const wide=1.4+random()*2.1;
      for(let j=0;j<r.verts.length;j+=3){r.verts[j]=x+r.verts[j]*wide;r.verts[j+1]+=y;r.verts[j+2]=z+r.verts[j+2]*wide*.71;}
      const bed=beds[(x>=west?1:0)+(z<rear?2:0)],plants=bed.plants;
      bed.stones.push(r);
      for(let blade=0;blade<3;blade++){
        let last;
        for(let k=0;k<5;k++){
          const t=k/4,xx=x+blade*.42+t*(blade-1)+Math.sin(t*5+i)*t*.8, yy=y+(4+h+blade*.68)*t,zz=z+.55*blade+t*.75;
          const w=(.15+.12*Math.sin(t*3))*(1-t*.94),row=[M.pushVert(plants,xx-w,yy,zz),M.pushVert(plants,xx+w,yy,zz)];
          if(last)M.face(plants,[last[0],last[1],row[1],row[0]],[29,94+i%19,89],{emissive:.67});
          last=row;
        }
      }
    }
    // Kelp on a submerged basalt ledge can be seen through the band-side water.
    const ledge=beds[4],kelp=(x,y,z,h,phase)=>{
      let last;
      for(let k=0;k<=8;k++){
        const t=k/8,xx=x+.19*Math.sin(phase+6*t)+.29*t,zz=z+.40*Math.sin(phase+4*t),yy=y+h*t;
        const w=(.06+.14*Math.sin(Math.PI*t))*(1-.77*t);
        const row=[M.pushVert(ledge.plants,xx-w,yy,zz),M.pushVert(ledge.plants,xx,yy+.02,zz+.055),M.pushVert(ledge.plants,xx+w,yy,zz)];
        if(last)for(let q=0;q<2;q++){
          const f=[last[q],last[q+1],row[q+1],row[q]];
          const col=q?[38,109,98]:[48,136,112];
          M.face(ledge.plants,f,col,{emissive:.64});M.face(ledge.plants,[row[q],row[q+1],last[q+1],last[q]],col,{emissive:.64});
        }
        last=row;
      }
    };
    for(let i=0;i<(lite?18:38);i++){
      const z=rear+2+random()*(G.END_Z-rear-4), x=west-5-random()*3.9,y=TOP-6-random()*2.1;
      ledge.stones.push(pebble(x,y,z,1.1+random(),.6+random(),.8+random(),"#385c61"));
      for(let j=0;j<3;j++)kelp(x+j*.28,y+.77,z+.18*j,1.3+random()*3.2,i*.91+j);
    }
    // Submerged mineral seams pick up the moving surface light at the narrow western end.
    const shafts=M.geometry();
    for(let i=0;i<(lite?24:52);i++){
      const [x,z]=bedPoint(),h=7+random()*13,r=.20+random()*.80;
      face(shafts,[[x-r,TOP-.2,z],[x+r,TOP-.2,z],[x+3+r*2,TOP-h,z-2],[x+3-r*2,TOP-h,z-2]],
        [99,177,179],.83);
    }
    shafts.glassOpacity=.048;shafts.glassGrazing=0;shafts.castShadow=false;
    // Most of the distant bed vanishes into the dark water. Leave just a wash of
    // colour under the solid reef outcrops so its perimeter cannot outline the falls.
    reef.glassOpacity=.13;reef.glassGrazing=0;reef.castShadow=false;
    const pack=g=>{g.fogPierce=.76;return BL.pokerMarble.staticMesh(g);};
    const bedMeshes=beds.map(bed=>{
      const mesh=M.merge(...bed.stones,bed.plants);mesh.castShadow=false;return pack(mesh);
    });
    const whale=BL.pokerBlueWhale.geometry(lite);
    return {bedMeshes,shafts:pack(shafts),reef:pack(reef),surface:pack(surface),roomWater:pack(roomWater),falls:pack(falls),whale,offshoreWhale:lite?whale:BL.pokerBlueWhale.geometry(true)};
  };

  // One circuit per resident per three minutes. Timestamps keep the lunge, flight and return
  // continuous with ordinary swimming. The opening leg passes the bar and the return clears the dry vault.
  const PERIOD=180, INTERVAL=60;
  // This circuit fits the rear basin. Offshore pods follow the same lunge at their own feeding sites.
  const course=[[0,29,-6,-52],[11,37,-5.8,-52],[24,55,-9.8,-55],[36,47,-13.8,-58],[47,29,-17.8,-53],
    [52,28,-17.8,-53],[56,32,-16,-52.5],[58.5,35.9,-13.25,-51.4],[60,38.2,-8.55,-50.9],
    [61.7,41.6,1.1,-50.3],[63.1,45.2,5.8,-50],[64,47.8,4.2,-49.9],[65.1,50.9,.2,-50],
    [66.2,53.1,-6.3,-50.3],[68.5,57,-11.8,-51.4],[76,66,-13.8,-53],[85,67,-14.8,-53.5],
    [95,58,-13,-56],[110,47,-11,-57],[127,36,-10,-55],[143,30,-7,-52],
    [153,32,-11,-51.5],[165,38,-9,-51],[174,31,-7,-53]];
  // Hermite velocities are in metres per second, including across the loop seam.
  const tangents=course.map((p,i)=>{
    const a=course[(i+course.length-1)%course.length],b=course[(i+1)%course.length];
    const dt=(b[0]-a[0]+PERIOD)%PERIOD;
    return [(b[1]-a[1])/dt,(b[2]-a[2])/dt,(b[3]-a[3])/dt];
  });
  const swim=(w,phase,time,turn,calm)=>{
    let i=course.length-1;
    while(i && phase<course[i][0])i--;
    const j=(i+1)%course.length,a=course[i],b=course[j],duration=(b[0]-a[0]+PERIOD)%PERIOD;
    const u=(phase-a[0])/duration, vel=w.velocity, p=w.body.position;
    let ax=0,az=0;
    for(let axis=0;axis<3;axis++){
      const start=a[axis+1],delta=b[axis+1]-start,va=tangents[i][axis]*duration,vb=tangents[j][axis]*duration;
      const h=3*delta-2*va-vb,k=va+vb-2*delta,value=start+u*(va+u*(h+u*k));
      if(axis===0)p.x=value;else if(axis===1)p.y=TOP+value;else p.z=value;
      vel[axis]=(va+u*(2*h+3*u*k))/duration;
      const acceleration=(2*h+6*u*k)/(duration*duration);
      if(axis===0)ax=acceleration;else if(axis===2)az=acceleration;
    }
    // A new visit starts underwater throughout the first minute.
    const smooth=BL.pokerWhaleBreach.smooth;
    if(!turn && phase>=52 && phase<76){
      const u=(phase-52)/24;
      p.y=TOP-17.8+4*smooth(0,1,u);vel[1]=u*(1-u);
    }
    const cruise=1-smooth(45,52,phase)*(1-smooth(70,82,phase));
    p.y+=cruise*(w.lane*.64+.10*Math.sin(time*.94));
    p.z+=cruise*w.lane*.65;
    p.x+=w.offsetX;p.z+=w.offsetZ;
    const horizontal=Math.hypot(vel[0],vel[2]);
    const tilt=Math.atan2(vel[1],horizontal);
    const turnBank=Math.atan2(vel[0]*az-vel[2]*ax,Math.max(.2,horizontal)*2.4);
    const flop=turn?smooth(61.4,64.9,phase)*(1-smooth(65.6,70.1,phase)):0;
    const effort=.80+.23*Math.sin(time*.22)+.54*smooth(51,57,phase)*(1-smooth(59,61,phase));
    const airborne=turn?smooth(59.7,62,phase)*(1-smooth(65.8,69,phase)):0;
    const gape=turn?smooth(52.2,57.1,phase)*(1-smooth(60.55,61.35,phase)):0;
    const bank=.072*Math.sin(time*.17)+cruise*.30*turnBank+w.side*1.40*flop;
    BL.pokerBlueWhale.pose(w,time,Math.atan2(-vel[2],vel[0]),tilt*(1-.93*flop),bank,gape,effort*(1-.9*airborne),calm);
  };
  // Canvas shares one lazily painted tile across the perimeter. Its height is in
  // metres so the streams accelerate down past the same depth bands as the GL sheet.
  const canvasTails=root=>{
    const width=32,height=144,g=M.geometry(),random=BL.math.mulberry32(33015);
    const chars="0123456789ABCDEF",smooth=BL.pokerWhaleBreach.smooth;
    const lanes=Array.from({length:32},()=>({speed:1.7+1.9*random(),phase:64*random(),end:74+72*random(),
      letters:Array.from({length:64},()=>chars[Math.floor(random()*chars.length)]).join("")}));
    let bitmap,ctx,last=-Infinity,time=0;
    M.face(g,[[0,0],[width,0],[width,-height],[0,-height]].map(([x,y])=>M.pushVert(g,x,y,0)),[76,160,176],{emissive:.7});
    g.castShadow=false;g.twoSided=true;
    g.imageSurface={rect:[0,-height,width,height],blend:"alpha",cutout:true,fallback(){
      if(!bitmap){
        bitmap=document.createElement("canvas");bitmap.width=256;bitmap.height=height*8;
        ctx=bitmap.getContext("2d");ctx.font="bold 8px monospace";ctx.textBaseline="top";
      }
      if(Math.abs(time-last)<.12)return bitmap;
      last=time;ctx.clearRect(0,0,bitmap.width,bitmap.height);
      for(let i=0;i<lanes.length;i++){
        const lane=lanes[i],phase=lane.phase+time*lane.speed;
        const water=ctx.createLinearGradient(0,0,0,184+(lane.phase%18)*8);
        water.addColorStop(0,"rgba(73,157,174,.93)");water.addColorStop(1,"rgba(58,145,167,0)");
        ctx.fillStyle=water;ctx.fillRect(i*8,0,8,360);
        for(let row=-Math.ceil(phase);row<lane.end-phase;row++){
          const y=row+phase,d=y+6.2,train=((row%24)+24)%24;
          const alpha=smooth(5,24,d)*(1-smooth(28,lane.end,d))*smooth(1,6,train)*(1-smooth(18,19,train));
          if(alpha<=.006)continue;
          ctx.globalAlpha=alpha;ctx.fillStyle=train>14?"#8edce2":"#50a7b9";
          ctx.fillText(lane.letters[row&63],i*8+1,y*8);ctx.globalAlpha=1;
        }
      }
      return bitmap;
    }};
    for(let i=0;i<5;i++){
      const a=outline[i],b=outline[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      const tx=dx/len,tz=dz/len,steps=Math.ceil(len/width),join=1.36;
      const start=i===0?0:-join,span=len+(i===4?0:join)-start;
      for(let j=0;j<steps;j++){
        const along=start+span*j/steps;
        const tile=add(root,g,a[0]+tx*along-tz*join,TOP-6.2,a[1]+tz*along+tx*join);
        tile.rotation.y=-Math.atan2(dz,dx);tile.scale.x=span/(steps*width);
      }
    }
    return dt=>{time+=dt;};
  };
  const build=lite=>{
    if(!cache.has(lite))cache.set(lite,scenery(lite));
    const g=cache.get(lite),root=S.createNode();
    for(const geom of [g.reef,...g.bedMeshes,g.surface,g.roomWater,g.falls])add(root,geom);
    const tails=lite?canvasTails(root):null;
    const rays=add(root,g.shafts);
    // Offsets from the bar feeding site, ordered as one outward and returning storm track.
    // Each resident swims locally while the single school, wave and waterfall surge follow the cloud.
    const sites=[[0,0],[-115,3],[-110,70],[-265,71],[-430,69],[-595,65],
      [-550,8],[-417,4],[-288,7],[-151,4],[0,0],[0,0]];
    const sizes=[1.43,1.32,1.01];
    const residents=sites.map(([x,z],i)=>{
      const w=BL.pokerBlueWhale.build(root,x < -200?g.offshoreWhale:g.whale,sizes[i%3]);
      w.offsetX=x;w.offsetZ=x && z<40?z-60:z;w.spillZ=x===0?rear:z>40?G.END_Z:outerRear;w.lane=i%3-1;w.side=i%2?-1:1;
      return w;
    });
    const breach=BL.pokerWhaleBreach.build(root,lite,TOP,spillX,spillWidth);
    const guest=BL.pokerBlueWhale.build(root,g.whale,.87);guest.body.visible=false;
    let age=12,peak=0,clock=0;
    const visit=value=>{
      if(value<1e9 || age<12 && value<=peak)return;
      age=0;peak=value;
      const scale=Math.min(1.10,.82+.09*Math.log10(value/1e9));
      guest.body.scale.x=guest.body.scale.y=guest.body.scale.z=scale;
    };
    const update=(dt,time,calm)=>{
      clock+=dt;age=Math.min(12,age+dt);
      // Interior rooms hide the whole tank. Its poses are analytic on these clocks and resume on the first visible frame.
      if(!root.visible)return;
      if(tails && !calm)tails(dt);
      // Lightning brings the school to the surface on the minute. The swim course reaches the surface ten seconds later.
      const turn=Math.floor(clock/INTERVAL)-1,active=turn<0?-1:turn%residents.length;
      for(let i=0;i<residents.length;i++){
        const phase=(clock+PERIOD-10-i%3*INTERVAL)%PERIOD;
        swim(residents[i],phase,clock+i*2.4,i===active,calm);
      }
      const since=clock-(turn+1)*INTERVAL,u=since/INTERVAL,blend=u*u*(3-2*u);
      const from=turn<0?residents[1]:residents[active],to=residents[(turn+1)%residents.length];
      const wind=Math.sin(Math.PI*u)**2;
      const x=from.offsetX+(to.offsetX-from.offsetX)*blend+wind*3*Math.sin(2*Math.PI*u);
      const z=from.offsetZ+(to.offsetZ-from.offsetZ)*blend-wind*8;
      const w=residents[active];
      breach.update(since-10,w,calm,x,z,w?w.spillZ-w.offsetZ:rear);
      rays.position.x=calm?0:.38*Math.sin(time*.16);
      guest.body.visible=age<12;
      if(guest.body.visible){
        const u=age/12,s=Math.sin(Math.PI*u),c=Math.cos(Math.PI*u),p=guest.body.position;
        p.x=29+32*u;p.y=TOP-21.6+4*s;p.z=-60+3*s;
        BL.pokerBlueWhale.pose(guest,time+.4,-Math.atan2(3*Math.PI*c,32),Math.atan2(4*Math.PI*c,32),.12*s,0,.8,calm);
      }
    };
    update(0,0,false);return {root,visit,update,residents,breach,get impactAge(){return clock<INTERVAL?Infinity:clock%INTERVAL-15;}};
  };
  BL.pokerAquarium=Object.freeze({build});
})();
