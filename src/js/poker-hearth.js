// The Cypherpunk Lounge chimney piece. A carved stone crest above a wood-burning hearth.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models;
  const stone="#fffefa", edge="#ffffff", recess="#d4d1c9", high="#ffffff";
  const mineral=BL.pokerMarble.mineralAtlas(()=>BL.pokerHearthMap,640,true);
  const crest=(color=stone,emissive=.10)=>{
    const g=M.geometry(),unit=.0091,loops=BL.pokerDamaskMap.contours;
    const edges=[],levels=new Set();
    for(const ring of loops)for(let i=0;i<ring.length;i++){
      const [x,y]=ring[i],[xx,yy]=ring[(i+1)%ring.length];
      edges.push({x,y,dx:xx-x,dy:yy-y});
      levels.add(y);
    }
    // Relax the relief to a rounded crown inside the traced silhouette. Narrow
    // tips rise less than wide strokes, with a continuous slope between them.
    const points=loops.flat(),step=2;
    const x0=Math.floor(Math.min(...points.map(p=>p[0]))/step)*step-2*step;
    const y0=Math.floor(Math.min(...levels)/step)*step-2*step;
    const cols=Math.ceil((Math.max(...points.map(p=>p[0]))-x0)/step)+3;
    const rows=Math.ceil((Math.max(...levels)-y0)/step)+3;
    const height=new Float32Array(rows*cols),inside=[];
    for(let j=1;j<rows-1;j++){
      const y=y0+j*step,cuts=[];
      for(const e of edges)if((e.y>y)!==(e.y+e.dy>y))cuts.push(e.x+(y-e.y)*e.dx/e.dy);
      cuts.sort((a,b)=>a-b);
      for(let k=0;k<cuts.length;k+=2){
        for(let i=Math.ceil((cuts[k]-x0)/step);x0+i*step<cuts[k+1];i++)inside.push(j*cols+i);
      }
    }
    const peak=.175,weight=(step/9)**2;
    for(let pass=0;pass<64;pass++)for(const i of inside){
      const average=(height[i-1]+height[i+1]+height[i-cols]+height[i+cols]+weight*peak)/(4+weight);
      height[i]+=1.55*(average-height[i]);
    }
    const sample=(x,y)=>{
      const u=(x-x0)/step,v=(y-y0)/step,col=Math.floor(u),row=Math.floor(v);
      const fx=u-col,fy=v-row,i=row*cols+col;
      return (1-fy)*(height[i]*(1-fx)+height[i+1]*fx)+fy*(height[i+cols]*(1-fx)+height[i+cols+1]*fx);
    };
    g.normals=[];
    const vertex=(x,y,boundary)=>{
      const dx=(sample(x-step,y)-sample(x+step,y))/(2*step*unit);
      const dy=(sample(x,y-step)-sample(x,y+step))/(2*step*unit);
      const n=1/Math.hypot(dx,dy,1);
      g.normals.push(dx*n,dy*n,n);
      return M.pushVert(g,x*unit,y*unit,boundary?0:sample(x,y));
    };
    const rgb=BL.math.hexToRgb(color),ys=[...levels].sort((a,b)=>a-b);
    for(let j=1;j<ys.length;j++){
      const lo=ys[j-1],hi=ys[j],mid=(lo+hi)/2,cuts=[];
      for(const e of edges){
        if((e.y>mid)===(e.y+e.dy>mid))continue;
        const slope=e.dx/e.dy;
        cuts.push([e.x+(lo-e.y)*slope,e.x+(hi-e.y)*slope]);
      }
      cuts.sort((a,b)=>a[0]+a[1]-b[0]-b[1]);
      for(let i=0;i<cuts.length;i+=2){
        const left=cuts[i],right=cuts[i+1];
        // Use fixed meridians on adjacent strips, including where a wisp forks.
        const first=Math.floor(Math.min(...left)/4)+1,last=Math.ceil(Math.max(...right)/4);
        let a=vertex(left[0],lo,true),b=vertex(left[1],hi,true);
        for(let k=first;k<=last;k++){
          const x=k*4,lower=Math.min(right[0],Math.max(left[0],x)),upper=Math.min(right[1],Math.max(left[1],x));
          const c=vertex(lower,lo,lower===left[0]||lower===right[0]),d=vertex(upper,hi,upper===left[1]||upper===right[1]);
          M.face(g,[a,c,d,b],rgb,{emissive});a=c;b=d;
        }
      }
    }
    return g;
  };
  const emblemY=5.71, crownY=13.5;
  const bitcoinPanel=()=>{
    // One continuous silhouette, with a wider lower bowl and two open counters.
    const outer=[[-.78,.94],[-.40,.94],[-.40,1.27],[-.22,1.27],[-.22,.94],[-.015,.94],[-.015,1.27],[.165,1.27],[.165,.94]];
    const curve=(ring,b,c,d)=>{
      const a=ring[ring.length-1];
      for(let i=1;i<=12;i++){
        const t=i/12,u=1-t;
        ring.push([0,1].map(k=>u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]));
      }
    };
    curve(outer,[.88,.94],[.92,.27],[.51,.09]);
    curve(outer,[1.04,-.04],[1.01,-.90],[.165,-.94]);
    outer.push([.165,-1.27],[-.015,-1.27],[-.015,-.94],[-.22,-.94],[-.22,-1.27],[-.40,-1.27],[-.40,-.94],[-.83,-.94],[-.78,-.71],[-.65,-.71]);
    curve(outer,[-.55,-.71],[-.53,-.68],[-.53,-.57]);
    outer.push([-.53,.60]);
    curve(outer,[-.53,.69],[-.58,.71],[-.67,.71]);
    outer.push([-.78,.71]);
    const counter=(bottom,top,reach)=>{
      const ring=[[-.17,bottom],[-.02,bottom]];
      curve(ring,[reach,bottom],[reach,top],[-.02,top]);
      ring.push([-.17,top]);
      return ring;
    };
    const rings=[outer,counter(.20,.67,.59),counter(-.66,-.095,.69)];
    const c=Math.cos(.24),s=Math.sin(.24);
    for(const ring of rings)for(const p of ring){
      const [x,y]=p;p[0]=x*c+y*s;p[1]=y*c-x*s;
    }
    const xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]);
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    for(const ring of rings)for(const p of ring){p[0]-=cx;p[1]-=cy;}
    const offset=width=>rings.map(ring=>ring.map(([x,y],i)=>{
      const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];
      const al=Math.hypot(x-a[0],y-a[1]),bl=Math.hypot(b[0]-x,b[1]-y);
      const ax=(a[1]-y)/al,ay=(x-a[0])/al,bx=(y-b[1])/bl,by=(b[0]-x)/bl;
      const scale=width/(1+ax*bx+ay*by);
      return [x+(ax+bx)*scale,y+(ay+by)*scale];
    }));
    const g=M.bevelBox({w:4.66,h:4.86,d:1,bevel:.045,offset:{z:.44},color:stone,emissive:.10});
    const front=g.faces.find(f=>f.i.every(i=>Math.abs(g.verts[i*3+2]-.94)<1e-6));
    const rect=front.i.map(i=>g.verts.slice(i*3,i*3+2));
    g.faces.splice(g.faces.indexOf(front),1);
    // Fill alternating scan spans so the slit passes all the way through the front face.
    const cap=(loops,z,color,emissive)=>{
      const levels=new Set(),edges=[],rgb=BL.math.hexToRgb(color);
      for(const loop of loops)loop.forEach(([x,y],i)=>{
        const [xx,yy]=loop[(i+1)%loop.length];levels.add(y);
        if(y!==yy)edges.push({x,y,yy,slope:(xx-x)/(yy-y)});
      });
      const heights=[...levels].sort((a,b)=>a-b);
      for(let i=1;i<heights.length;i++){
        const lo=heights[i-1],hi=heights[i],mid=(lo+hi)/2;
        if(hi-lo<1e-8)continue;
        const cuts=edges.filter(e=>(e.y>mid)!==(e.yy>mid))
          .map(e=>[e.x+(lo-e.y)*e.slope,e.x+(hi-e.y)*e.slope]).sort((a,b)=>a[0]+a[1]-b[0]-b[1]);
        for(let j=0;j<cuts.length;j+=2){
          const a=cuts[j],b=cuts[j+1],points=[[a[0],lo]];
          if(b[0]-a[0]>1e-8)points.push([b[0],lo]);
          points.push([b[1],hi]);
          if(b[1]-a[1]>1e-8)points.push([a[1],hi]);
          if(points.length>=3)M.face(g,points.map(([x,y])=>M.pushVert(g,x,y,z)),rgb,{emissive});
        }
      }
    };
    const band=(a,z,b,zz,color,emissive)=>{
      const rgb=BL.math.hexToRgb(color);
      a.forEach((ring,k)=>ring.forEach((p,i)=>{
        const j=(i+1)%ring.length;
        M.face(g,[M.pushVert(g,...p,z),M.pushVert(g,...ring[j],z),
          M.pushVert(g,...b[k][j],zz),M.pushVert(g,...b[k][i],zz)],rgb,{emissive});
      }));
    };
    const lip=offset(.083),channel=offset(.064),shoulder=offset(-.014),crown=offset(-.045);
    cap([rect,...lip],.94,stone,.10);
    band(channel,.84,channel,.915,recess,.12);
    band(channel,.915,lip,.94,edge,.14);
    band(rings,1.085,rings,.835,recess,.13);
    band(shoulder,1.12,rings,1.085,edge,.16);
    band(crown,1.14,shoulder,1.12,high,.18);
    cap(crown,1.14,edge,.17);
    return M.moved(g,0,emblemY,0);
  };
  const surround=(height,lite)=>{
    const parts=[];
    const slab=(x,y,z,w,h,d,c=stone)=>parts.push(M.bevelBox({w,h,d,color:c,bevel:Math.min(.045,h*.22,d*.18),emissive:.10,offset:{x,y,z}}));
    const rod=(a,b,w,c=edge)=>parts.push(M.beam(...a,...b,w,c,.12));
    const shaft=(x,y,z,profile,c)=>parts.push(M.moved(M.lathe({profile,color:c,segments:lite?8:12,emissive:.11}),x,y,z));
    const steps=(y,w,z,rows)=>{
      for(const [height,over,depth,c] of rows){slab(0,y+height/2,z,w+over,height,depth,c);y+=height;}
    };
    const leaf=(x,y,z,dx,dy,width)=>{
      const len=Math.hypot(dx,dy),nx=-dy/len*width,ny=dx/len*width;
      const g=M.geometry(),p=[[x,y,z],[x+dx*.4+nx,y+dy*.4+ny,z+.032],
        [x+dx,y+dy,z+.017],[x+dx*.60-nx*.8,y+dy*.60-ny*.8,z+.032],[x+dx*.46,y+dy*.46,z+.112]];
      const v=p.map(q=>M.pushVert(g,...q));
      for(let i=0;i<4;i++) M.face(g,[v[i],v[4],v[(i+1)%4]],BL.math.hexToRgb(i<2?edge:stone),{emissive:.12});
      g.twoSided=true;parts.push(g);
    };
    const molding=[[.07,.06,.90,edge],[.065,.17,1.00,stone],[.055,.22,1.06,high],[.105,.27,1.12,edge]];
    steps(.015,5.43,.86,[[.11,.34,1.60,stone],[.08,.17,1.45,edge],[.10,0,1.26,stone]]);
    // The depth of each arch stone runs back to the firebrick reveal.
    const spring=1.49;
    const arch=(t,r,rise)=>[r*(1-t*t),spring+rise*(1.73*t-.73*t*t)];
    for(const s of [-1,1]){
      slab(s*2.20,1.36,.65,1.17,2.14,.94);
      for(let j=-1;j<=1;j++){
        const x=s*(2.17+.205*j);
        shaft(x,.30,1.15,[[.18,0],[.18,.12],[.145,.17],[.15,.22],[.117,.28],[.103,1.8],[.14,1.86],[.18,1.94],[.19,2.10]],edge);
        for(let i=0;i<4;i++)leaf(x,2.16+i*.07,1.22,s*(i%2?1:-1)*.14,.25,.065);
      }
      for(let j=0;j<14;j++){
        const t=j/14,u=(j+1)/14;
        const point=(t,r,h)=>{const [x,y]=arch(t,r,h);return [s*x,y];};
        const prism=(points,d,z,c)=>{
          if(s<0)points.reverse();
          parts.push(M.moved(M.prism(points,d,c,.10),0,0,z));
        };
        const inner=point(t,1.60,1.11),end=point(u,1.60,1.11);
        prism([end,inner,point(t,1.96,1.43),point(u,1.96,1.43)],.59,.91,j%3?stone:edge);
        const upper=point(t,1.96,1.43),next=point(u,1.96,1.43);
        prism([next,upper,[upper[0],2.99],[next[0],2.99]],.58,.89,stone);
        for(const [r,h,z,width,c] of [[1.6,1.11,1.24,.065,high],[1.73,1.22,1.24,.046,recess],[1.91,1.39,1.25,.058,edge]]){
          rod([...point(t,r,h),z],[...point(u,r,h),z],width,c);
        }
      }
      slab(s*2.1,2.81,.77,1.17,.40,.90);
    }
    // Carved vine frieze across the lintel.
    slab(0,2.99,.81,5.42,.30,.99,recess);
    for(let i=-10;i<=10;i++){
      const x=i*.246,sign=i%2?-1:1;
      rod([x-.123,2.99-sign*.045,1.32],[x+.123,2.99+sign*.045,1.32],.035,stone);
      leaf(x,2.99,1.32,.14*sign,.13,.049);
      leaf(x,2.99,1.32,-.14*sign,-.12,.045);
    }
    steps(3.0,5.50,.89,molding);
    parts.push(bitcoinPanel());
    for(const s of [-1,1]){
      for(const dx of [-.15,.08,.27]){
        const x=s*(2.04+dx);
        shaft(x,3.30,.90,[[.17,0],[.19,.09],[.14,.19],[.10,.24],[.096,3.94],[.134,4.05],[.20,4.25],[.18,4.48]],edge);
        for(let i=0;i<4;i++) leaf(x,7.32+i*.08,1.01,s*(i%2?.17:-.15),.34,.07);
      }
    }
    for(const s of [-1,1]){
      // Two curling acanthus stems flank each jamb and return into carved volutes.
      for(const [x,y,h,spread,z] of [[2.18,.56,1.69,.21,1.34],[1.52,4.05,3.22,.16,1.0]]){
        let prev=null;
        for(let i=0;i<=24;i++){
          const t=i/24,a=t*Math.PI*2.4,u=s*(x+spread*Math.sin(a)),v=y+h*t;
          const next=[u,v,z];
          if(prev)rod(prev,next,.042,edge);
          if(i>0&&i<24&&i%3===0){
            const dir=i%6?1:-1;
            leaf(u,v,z,s*dir*.17,.20,.056);
            leaf(u,v-.02,z,s*dir*.21,.105,.051);
          }
          prev=next;
        }
      }
    }
    steps(7.98,4.68,.60,molding);
    // A recessed lancet and stepped cornice finish the exposed marble chimney breast.
    const flueBase=8.275,flueH=height-flueBase;
    slab(0,flueBase+flueH/2,.38,3.15,flueH,.53);
    for(const s of [-1,1]){
      slab(s*1.49,flueBase+flueH/2,.68,.09,flueH,.09,edge);
      rod([s*.90,flueBase+.31,.68],[s*.90,height-1.67,.68],.066,edge);
      rod([s*.90,height-1.67,.68],[0,height-.53,.68],.066,edge);
    }
    steps(height-.295,3.15,.40,molding);
    const g=M.merge(...parts);g.twoSided=true;
    // The carved surround is one pale stone, including the raised Bitcoin face.
    for(const f of g.faces)f.emissive+=.14;
    if(typeof Image!=="undefined")mineral(g,[-2.9,0,-2.9],[2.9,height,2.9]);
    return g;
  };
  const fire=lite=>{
    // Wrap the moving flame fronts around tapered volumes. Each grows from a
    // different gap in the fuel so the near tongues can pass in front of the far ones.
    const tau=2*Math.PI,sides=lite?20:36,rows=lite?9:14,height=2.12;
    const plume=(x,z,rx,rz,scaleY,phase)=>{
      const g=M.geometry();
      let previous;
      for(let i=0;i<=rows;i++){
        const v=i/rows,radius=(.76+.39*(1-Math.exp(-13*v)))*(1-.80*v);
        const ring=[];
        for(let j=0;j<=sides;j++){
          const a=(j/sides-.5)*tau,r=radius*(1+.09*Math.cos(3*a+phase+3*v))+.14*v*Math.sin(a+phase);
          ring.push(M.pushVert(g,r*Math.sin(a),height*v,1-r*Math.cos(a)));
        }
        if(previous)for(let j=0;j<sides;j++)M.face(g,[previous[j],ring[j],ring[j+1],previous[j+1]],[255,249,232],{emissive:1});
        previous=ring;
      }
      g.smooth=true;g.twoSided=true;g.castShadow=false;
      return {geometry:g,x,z,rx,rz,scaleY,phase};
    };
    const plumes=[plume(.18,1.14,.77,.19,1,0),plume(-.63,1.25,.65,.23,.82,2.3),plume(.56,1.35,.69,.18,.67,4.8)];
    // The face and both counters mask this flame bed. Its depth exposes less of the
    // bright core from a grazing view, just as a cut channel in stone would.
    const behind=M.geometry();
    M.face(behind,[[-1.3,-1.5],[1.3,-1.5],[1.3,1.5],[-1.3,1.5]].map(([x,y])=>M.pushVert(behind,x,y,0)),
      [255,228,201],{emissive:1});
    behind.castShadow=false;
    if(typeof CanvasRenderingContext2D==="undefined")return {plumes,behind,update:()=>0};
    // Reuse the noise tile and interpolation scratch across all three plumes.
    const w=lite?80:128,h=lite?96:144,field=new Float32Array(w),tips=new Float32Array(5);
    const noiseColumn=new Uint8Array(w),noiseFraction=new Float32Array(w);
    for(const p of plumes){
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      p.ctx=canvas.getContext("2d");p.pixels=p.ctx.createImageData(w,h);
      p.geometry.imageSurface={canvas,rect:[-Math.PI,0,tau,height],curve:[1,0,0],version:0,
        smooth:true,tessellated:true,cutout:true,blend:"alpha",softVolume:true,background:[214,47,5]};
    }
    const bed=document.createElement("canvas");bed.width=80;bed.height=96;
    const embers=bed.getContext("2d"),glow=embers.createLinearGradient(0,0,14,96);
    glow.addColorStop(0,"#772608");glow.addColorStop(.48,"#a83b0c");glow.addColorStop(1,"#e16c19");
    behind.imageSurface={canvas:bed,rect:[-1.3,-1.5,2.6,3],smooth:true,version:0};
    const rate=lite?16:24;
    // Advect fine eddies up through the slower plumes rising from the log bed.
    const eddies=new Float32Array(128*128);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const u=x*tau/128,v=y*tau/128;
      eddies[y*128+x]=.50*Math.sin(3*u+v+1.3*Math.sin(2*v-u))+.30*Math.sin(7*u-3*v+.9*Math.cos(3*u+v))+.20*Math.sin(13*u+5*v);
    }
    const paint=(p,time)=>{
      const t=time+p.phase,drift=t*8.7,rise=t*51.3;
      for(let x=0;x<w;x++){
        const u=(x+.5)*128/w+drift,col=Math.floor(u);
        noiseColumn[x]=col&127;noiseFraction[x]=u-col;
      }
      const bytes=p.pixels.data;
      let activity=0;
      for(let j=0;j<tips.length;j++){
        const flicker=.12*Math.sin(2.8*t+1.83*j)+.075*Math.sin(5.43*t-1.13*j);
        tips[j]=.64+.09*Math.cos(1.9*j+p.phase)+flicker;
        activity+=flicker;
      }
      for(let y=0;y<h;y++){
        const v=1-(y+.5)/h,noiseY=(y+.5)*100/h+rise,row=Math.floor(noiseY);
        const base=Math.min(1,v/.085),baseFade=base*base*(3-2*base);
        const upper=(row&127)*128,lower=((row+1)&127)*128,fy=noiseY-row;
        field.fill(-1);
        for(let j=0;j<tips.length;j++){
          const a=v/tips[j],cx=(j+.5)/tips.length+v*(.07*Math.sin(3.17*t-10*v+j*1.57)+.025*Math.sin(5.53*t-16*v+j));
          const radius=(.13+.02*Math.sin(2.67*t+j))*Math.pow(Math.max(0,1-a),.78)-Math.max(0,a-1)*.24;
          const span=radius+.072;
          for(let x=Math.floor((cx-span)*w);x<Math.ceil((cx+span)*w);x++){
            const k=(x+w)%w;
            field[k]=Math.max(field[k],radius-Math.abs((x+.5)/w-cx));
          }
        }
        for(let x=0;x<w;x++){
          const col=noiseColumn[x],next=(col+1)&127,fx=noiseFraction[x];
          const top=eddies[upper+col]+fx*(eddies[upper+next]-eddies[upper+col]);
          const bottom=eddies[lower+col]+fx*(eddies[lower+next]-eddies[lower+col]);
          const noise=top+fy*(bottom-top),f=field[x]+noise*(.018+.035*v);
          const q=(y*w+x)*4;
          // Feather on both sides of the contour. Express the band in plume
          // coordinates so its width stays consistent across quality tiers.
          const coverage=Math.min(1,(f+.014)/.038);
          if(coverage<=0){bytes[q+3]=0;continue;}
          const heat=Math.min(1,Math.max(0,f*6.3+.12*(1-v)+.20*noise));
          bytes[q]=217+38*heat;bytes[q+1]=47+188*heat;
          bytes[q+2]=5+141*heat*heat*heat;bytes[q+3]=255*baseFade*coverage*coverage*(3-2*coverage);
        }
      }
      p.ctx.putImageData(p.pixels,0,0);p.geometry.imageSurface.version++;
      return activity/tips.length;
    };
    let last=-1,pulse=0;
    const update=time=>{
      const frame=Math.floor(time*rate);
      if(frame===last)return pulse;
      last=frame;pulse=0;
      for(const p of plumes)pulse+=paint(p,frame/rate);
      embers.fillStyle=glow;embers.fillRect(0,0,bed.width,bed.height);
      embers.drawImage(plumes[0].geometry.imageSurface.canvas,w*.15,h*.37,w*.70,h*.61,0,0,bed.width,bed.height);
      behind.imageSurface.version++;return pulse;
    };
    update(0);return {plumes,behind,update};
  };
  BL.pokerHearth=Object.freeze({surround,fire,crest,emblemY,crownY});
})();
