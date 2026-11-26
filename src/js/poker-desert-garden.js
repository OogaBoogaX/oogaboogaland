// A desert garden along the lounge's two long marble walls, behind and between the shrine trees. A sandy bed follows
// each wall, narrow behind a trunk and swelling in the gaps; cacti, agaves and their kin grow on it in colonies, the
// tall ones against the marble and the small ones at the front. Every species is a few seeded variants built once,
// so each plant is an instance of a shared geometry. The layout is a pure function of the room, so the lawn can ask
// `inBed` before it scatters grass.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,tau=2*Math.PI,golden=Math.PI*(3-Math.sqrt(5));
  const hex=BL.math.hexToRgb,GROUND=.036,BED=GROUND+.014;
  const cache=M.scopedMap();
  const keep=(key,build)=>{if(cache.has(key))return cache.get(key);const g=build();cache.set(key,g);return g;};
  const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],plus=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],times=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
  // Rodrigues: v turned by `angle` about the unit `axis`.
  const turn=(v,axis,angle)=>{
    const c=Math.cos(angle),s=Math.sin(angle),k=dot(axis,v)*(1-c),x=cross(axis,v);
    return [v[0]*c+x[0]*s+axis[0]*k,v[1]*c+x[1]*s+axis[1]*k,v[2]*c+x[2]*s+axis[2]*k];
  };
  const bez=(a,b,c,d)=>t=>{const u=1-t,h=u*u*u,i=3*t*u*u,j=3*t*t*u,k=t*t*t;
    return [h*a[0]+i*b[0]+j*c[0]+k*d[0],h*a[1]+i*b[1]+j*c[1]+k*d[1],h*a[2]+i*b[2]+j*c[2]+k*d[2]];};
  const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
  // A face whose normal ((b-a)x(c-a), the renderer's outward side) agrees with `want`, wound either way round.
  const quad=(g,ids,color,want,e)=>{
    const v=g.verts,p=i=>[v[i*3],v[i*3+1],v[i*3+2]],a=p(ids[0]);
    const n=cross(sub(p(ids[1]),a),sub(p(ids[2]),a));
    M.face(g,dot(n,want)>=0?ids:ids.slice().reverse(),color,{emissive:e});
  };
  const both=(g,ids,color,e)=>{M.face(g,ids,color,{emissive:e});M.face(g,ids.slice().reverse(),color,{emissive:e});};
  const vert=(g,p)=>M.pushVert(g,p[0],p[1],p[2]);

  // A ribbed tube along `at` (t -> point), wound as `lathe` is: the frame is T, N = T x B, B, with B a fixed unit normal
  // of the path's plane. Even vertices stand on the ribs, odd ones in the grooves; `tone(p, s, t)` colours each face.
  const ribbedPath=(g,at,radius,B,ribs,groove,rings,tone,e,apex=true)=>{
    const n=ribs*2,rows=[],h=1e-3;
    let last=null,tip=null;
    for(let p=0;p<=rings;p++){
      const t=p/rings,c=at(t),T=unit(sub(at(Math.min(1,t+h)),at(Math.max(0,t-h)))),N=unit(cross(T,B)),b=cross(N,T),r=radius(t),row=[];
      for(let s=0;s<n;s++){
        const a=s/n*tau,k=s%2?1-groove:1,ca=Math.cos(a)*r*k,sa=Math.sin(a)*r*k;
        row.push(vert(g,[c[0]+N[0]*ca+b[0]*sa,c[1]+N[1]*ca+b[1]*sa,c[2]+N[2]*ca+b[2]*sa]));
      }
      rows.push(row);last=c;tip=[T,r];
    }
    for(let p=0;p<rings;p++)for(let s=0;s<n;s++){
      const s2=(s+1)%n;M.face(g,[rows[p][s],rows[p+1][s],rows[p+1][s2],rows[p][s2]],tone(p,s,p/(rings-1||1)),{emissive:e});
    }
    if(apex){
      const top=vert(g,plus(last,times(tip[0],tip[1]*.7))),row=rows[rings];
      for(let s=0;s<n;s++)M.face(g,[row[s],top,row[(s+1)%n]],tone(rings,s,1),{emissive:e});
    }
  };
  // An ellipsoid on the basis (ex, ey, ex x ey), each axis carrying its half-length.
  const ellipsoid=(g,c,ex,ey,depth,rows,cols,tone,e)=>{
    const ez=times(unit(cross(ex,ey)),depth),rings=[];
    for(let v=0;v<=rows;v++){
      const phi=-Math.PI/2+Math.PI*v/rows,cy=Math.sin(phi),cr=Math.cos(phi),ring=[];
      for(let u=0;u<cols;u++){
        const a=u/cols*tau,cx=Math.cos(a)*cr,cz=Math.sin(a)*cr;
        ring.push(vert(g,[c[0]+ex[0]*cx+ey[0]*cy+ez[0]*cz,c[1]+ex[1]*cx+ey[1]*cy+ez[1]*cz,c[2]+ex[2]*cx+ey[2]*cy+ez[2]*cz]));
      }
      rings.push(ring);
    }
    for(let v=0;v<rows;v++)for(let u=0;u<cols;u++){
      const u2=(u+1)%cols;M.face(g,[rings[v][u],rings[v+1][u],rings[v+1][u2],rings[v][u2]],tone(v,u),{emissive:e});
    }
  };
  // Copy a part so its +Y follows `dir`, about `pos`; the basis stays right-handed, so faces keep their winding.
  const aimed=(geo,pos,dir,spin=0,k=1)=>{
    const ey=unit(dir),ref=Math.abs(ey[1])<.9?[0,1,0]:[1,0,0];
    let ex=unit(cross(ey,ref));ex=turn(ex,ey,spin);const ez=cross(ex,ey);
    const out=M.geometry(),v=geo.verts;
    for(let i=0;i<v.length;i+=3){
      const x=v[i]*k,y=v[i+1]*k,z=v[i+2]*k;
      out.verts.push(pos[0]+ex[0]*x+ey[0]*y+ez[0]*z,pos[1]+ex[1]*x+ey[1]*y+ez[1]*z,pos[2]+ex[2]*x+ey[2]*y+ez[2]*z);
    }
    for(const f of geo.faces)out.faces.push({...f,i:f.i.slice()});
    return out;
  };
  const finish=(parts,shadow=true)=>{const g=M.merge(...parts);g.smooth=true;g.castShadow=shadow;return g;};

  // A cupped bloom about +Y: petals as two-sided quads round a domed eye.
  const bloom=(petal,eye,radius,count,cup)=>{
    const g=M.geometry(),p=hex(petal),q=mix(p,[255,255,255],.25),c=hex(eye);
    for(let i=0;i<count;i++){
      const a=i/count*tau,w=tau/count*.42,r0=radius*.18;
      const at=(ang,r,y)=>vert(g,[Math.cos(ang)*r,y,Math.sin(ang)*r]);
      both(g,[at(a-w,r0,0),at(a-w*.7,radius*.78,radius*cup*.7),at(a,radius,radius*cup),at(a+w*.7,radius*.78,radius*cup*.7)],i%2?p:q,.34);
      both(g,[at(a-w,r0,0),at(a+w*.7,radius*.78,radius*cup*.7),at(a+w,r0,0)],p,.34);
    }
    return M.merge(g,M.lathe({profile:[[radius*.2,0],[radius*.16,radius*.12],[0,radius*.16]],segments:7,color:eye,emissive:.3}));
  };
  const blooms={
    saguaro:()=>keep("bloom:saguaro",()=>bloom("#f4efe2","#e7c34a",.075,8,.55)),
    gold:()=>keep("bloom:gold",()=>bloom("#f1c43f","#c9762c",.05,10,.5)),
    pink:()=>keep("bloom:pink",()=>bloom("#d6488c","#f2d062",.035,9,.45)),
    pear:()=>keep("bloom:pear",()=>bloom("#f6d34e","#a8b84a",.06,9,.6)),
    coral:()=>keep("bloom:coral",()=>bloom("#e7663a","#f3c05a",.04,8,.5))
  };

  // Columnar cacti tone: a lighter crown, the areoles as dots of spine colour along each rib, a corky foot.
  const columnTone=(body,top,spine,cork,rand)=>{
    const b=hex(body),t=hex(top),sp=hex(spine),ck=hex(cork);
    return (p,s,t01)=>{
      let c=mix(b,t,smooth((t01-.55)/.45)*.6);
      if(t01<.07)c=mix(c,ck,.45*(1-t01/.07));
      // Areoles: dots staggered rib to rib, never a stripe.
      if(s%2===0 && (p+(s>>1))%3===0)c=mix(c,sp,.24);
      return mix(c,[0,0,0],rand()*.06);
    };
  };
  const saguaro=(seed,lite)=>keep("saguaro:"+seed+":"+lite,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),ribs=lite?7:12,R=.19+.05*rand(),H=2.6+1.1*rand();
    const tone=columnTone("#4c7a3c","#6f9a4c","#d8d0a2","#7d6b52",rand),parts=[g];
    ribbedPath(g,t=>[0,t*H,0],t=>R*(t<.08?.9+t*1.2:t>.82?Math.sqrt(Math.max(.02,1-(t-.82)/.18))*1.0:1),[0,0,1],ribs,.14,lite?7:12,tone,.16);
    const arms=Math.floor(rand()*3.4),start=rand()*tau;
    for(let i=0;i<arms;i++){
      const a=start+i*(tau/arms)+(rand()-.5)*.9,dir=[Math.cos(a),0,Math.sin(a)],B=[-dir[2],0,dir[0]];
      const y0=H*(.36+.26*rand()),reach=.32+.28*rand(),rise=.55+.75*rand(),r=R*(.62+.12*rand());
      const at=bez([dir[0]*R*.2,y0,dir[2]*R*.2],[dir[0]*(R+reach*.95),y0-.05,dir[2]*(R+reach*.95)],
        [dir[0]*(R+reach),y0+.2,dir[2]*(R+reach)],[dir[0]*(R+reach*1.02),y0+rise,dir[2]*(R+reach*1.02)]);
      ribbedPath(g,at,t=>r*(t>.8?Math.sqrt(Math.max(.03,1-(t-.8)/.2)):1),B,lite?6:10,.13,lite?6:10,tone,.16);
      if(!lite && rand()<.6)parts.push(aimed(blooms.saguaro(),plus(at(1),[0,r*.55,0]),[0,1,0],rand()*tau));
    }
    if(!lite)for(let i=0;i<3+Math.floor(rand()*3);i++){
      const a=rand()*tau,y=H-.02-.05*rand(),rr=R*.42;
      parts.push(aimed(blooms.saguaro(),[Math.cos(a)*rr,y,Math.sin(a)*rr],[Math.cos(a)*.6,1,Math.sin(a)*.6],rand()*tau,.85));
    }
    return finish(parts);
  });
  const organPipe=(seed,lite)=>keep("organ:"+seed+":"+lite,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),parts=[g],n=(lite?4:6)+Math.floor(rand()*(lite?2:4));
    const tone=columnTone("#55804a","#7aa25a","#e3d6a8","#6b5c47",rand);
    for(let i=0;i<n;i++){
      const a=i*golden+rand()*.5,lean=.12+.32*rand()*(i?1:.3),dir=[Math.cos(a),0,Math.sin(a)],B=[-dir[2],0,dir[0]];
      const H=1.25+1.15*rand()*(i?.85:1),r=.085+.03*rand(),o=.08+.12*rand()*(i?1:0);
      const at=bez([dir[0]*o,0,dir[2]*o],[dir[0]*(o+lean*.55),H*.2,dir[2]*(o+lean*.55)],
        [dir[0]*(o+lean*.9),H*.6,dir[2]*(o+lean*.9)],[dir[0]*(o+lean),H,dir[2]*(o+lean)]);
      ribbedPath(g,at,t=>r*(t<.05?1.15:t>.86?Math.sqrt(Math.max(.03,1-(t-.86)/.14)):1),B,lite?5:9,.15,lite?6:10,tone,.16);
      if(!lite && rand()<.45)parts.push(aimed(blooms.pink(),plus(at(1),[0,r*.4,0]),[dir[0]*.4,1,dir[2]*.4],rand()*tau,1.3));
    }
    return finish(parts);
  });
  // Ocotillo: a fountain of thin grey canes, leafed in green and tipped with red.
  const ocotillo=(seed,lite)=>keep("ocotillo:"+seed+":"+lite,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),parts=[g],n=(lite?6:10)+Math.floor(rand()*5);
    const cane=hex("#6f604c"),young=hex("#7c8a52"),leaf=hex("#6f9a3a");
    const tone=(p,s,t)=>mix(cane,young,t*.7);
    const flower=keep("ocotillo-flower:"+lite,()=>M.lathe({profile:[[.03,0],[.026,.08],[.014,.16],[0,.2]],segments:lite?4:6,
      color:t=>t<.3?"#c8452c":"#f06a2e",emissive:.32}));
    for(let i=0;i<n;i++){
      const a=i*golden+rand()*.4,dir=[Math.cos(a),0,Math.sin(a)],B=[-dir[2],0,dir[0]];
      const L=2.0+1.2*rand(),out=.25+.55*rand(),bend=.15+.2*rand();
      const at=bez([dir[0]*.04,0,dir[2]*.04],[dir[0]*out*.25,L*.35,dir[2]*out*.25],[dir[0]*out*.75,L*.72,dir[2]*out*.75],
        [dir[0]*(out+bend),L,dir[2]*(out+bend)]);
      ribbedPath(g,at,t=>.03*(1-.6*t),B,3,0,lite?4:7,tone,.14,false);
      if(!lite)for(let k=1;k<7;k++){
        const t=.2+k*.11,p=at(t),side=k%2?1:-1,q=plus(p,times(B,.05*side));
        both(g,[vert(g,p),vert(g,plus(q,[0,.05,0])),vert(g,plus(p,times(B,.09*side)))],leaf,.2);
      }
      const tip=at(1),up=unit(sub(tip,at(.94)));
      parts.push(aimed(flower,tip,up,rand()*tau));
    }
    return finish(parts);
  });
  // A trunked yucca: a shaggy grey stem under a silver-blue burst of needles.
  const yucca=(seed,lite)=>keep("yucca:"+seed+":"+lite,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),H=.7+1.1*rand(),R=.12+.04*rand();
    const bark=hex("#7d6c57"),thatch=hex("#a8936f"),blue=hex("#9db9bc"),deep=hex("#6f8f95");
    ribbedPath(g,t=>[Math.sin(t*2.2+seed)*.05,t*H,Math.cos(t*1.7+seed)*.04],t=>R*(1.15-.25*t+.12*Math.sin(t*19)),[0,0,1],lite?4:8,.22,lite?4:9,
      (p,s,t)=>mix(bark,thatch,(p+s)%3===0?.55:.15*t),.14,false);
    const head=[Math.sin(2.2+seed)*.05,H,Math.cos(1.7+seed)*.04],count=lite?26:64;
    for(let i=0;i<count;i++){
      const y=1-1.55*(i+.5)/count,rr=Math.sqrt(Math.max(0,1-y*y)),a=i*golden;
      const d=unit([Math.cos(a)*rr,y+.08,Math.sin(a)*rr]),L=.42+.18*rand(),w=.022;
      const side=unit(cross(d,Math.abs(d[1])<.95?[0,1,0]:[1,0,0])),flat=unit(cross(d,side)),tip=plus(head,times(d,L));
      const c=mix(deep,blue,.4+.6*rand());
      both(g,[vert(g,plus(head,times(side,w))),vert(g,tip),vert(g,plus(head,times(side,-w)))],c,.2);
      if(!lite)both(g,[vert(g,plus(head,times(flat,w))),vert(g,tip),vert(g,plus(head,times(flat,-w)))],c,.2);
    }
    return finish([g]);
  });
  // Prickly pear: paddles budding from the rims of older ones, each on its own twist; magenta fruit and yellow flowers.
  const pear=(seed,lite,purple)=>keep("pear:"+seed+":"+lite+":"+purple,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),parts=[g];
    const body=hex(purple?"#7f7392":"#6c9a46"),rim=hex(purple?"#a7849a":"#8fae55"),areole=hex("#ddd2a0"),fruit=hex("#a3255c");
    const rows=lite?4:6,cols=lite?6:10,maxDepth=lite?2:3+(rand()<.5?1:0);
    const pad=(c,ex,ey,size,depth)=>{
      const w=.19*size,h=.24*size,t=.035*size;
      ellipsoid(g,c,times(ex,w),times(ey,h),t,rows,cols,(v,u)=>(v*3+u)%5===0?mix(body,areole,.16):mix(body,rim,v/rows*.45),.16);
      // Paddles fan from the shoulders of their parent rather than stacking up its middle.
      const children=depth<maxDepth?(rand()<.9?1:0)+(rand()<.68?1:0)+(depth===0 && rand()<.4?1:0):0;
      for(let k=0;k<children;k++){
        const side=children===1?(rand()<.5?-1:1)*(.45+.4*rand()):(k/(children-1)-.5)*1.6,ez=unit(cross(ex,ey));
        const base=plus(plus(c,times(ey,h*.74)),times(ex,side*w*.95));
        let ny=turn(ey,ez,-side*(.75+.55*rand())+(rand()-.5)*.25);
        if(ny[1]<.35)ny=unit([ny[0],.35,ny[2]]);
        let nz=turn(ez,ny,(rand()-.5)*1.9),nx=unit(cross(ny,nz));
        const s=size*(.78+.18*rand());
        pad(plus(base,times(ny,.24*s*.86)),nx,ny,s,depth+1);
      }
      if(!children && !lite){
        const top=plus(c,times(ey,h*.92));
        const n=1+Math.floor(rand()*3);
        for(let k=0;k<n;k++){
          const at=plus(top,times(ex,(k-(n-1)/2)*w*.55));
          if(rand()<.7)ellipsoid(g,plus(at,times(ey,.035)),times(ex,.028),times(ey,.045),.028,3,6,()=>mix(fruit,[255,120,160],rand()*.25),.24);
          else parts.push(aimed(blooms.pear(),at,ey,rand()*tau));
        }
      }
    };
    const roots=1+Math.floor(rand()*(lite?2:3));
    for(let i=0;i<roots;i++){
      const a=rand()*tau,ex=[Math.cos(a),0,Math.sin(a)],ey=unit([Math.cos(a+1.6)*.25*(rand()-.5),1,Math.sin(a+1.6)*.25*(rand()-.5)]);
      const off=i?[Math.cos(a+1)*.22,0,Math.sin(a+1)*.22]:[0,0,0],size=1.05+.3*rand();
      pad(plus(off,[0,.24*size*.85,0]),unit(cross(ey,cross(ex,ey))),ey,size,0);
    }
    return finish(parts);
  });
  // A rosette of keeled, troughed leaves set at the golden angle, upright inside and arching out.
  const rosette=(g,{count,length,width,thick,lift,droop,body,under,margin,tip,fleck},rand,segs)=>{
    const B=hex(body),U=hex(under),Mg=margin?hex(margin):null,T=hex(tip),F=fleck?hex(fleck):null;
    for(let i=0;i<count;i++){
      const f=i/(count-1),yaw=i*golden+(rand()-.5)*.25,L=length*(1-.42*f)*(.9+.2*rand());
      const dir=[Math.cos(yaw),0,Math.sin(yaw)],side=[-dir[2],0,dir[0]],elev=.3+1.05*f+(rand()-.5)*.15,sag=droop*(1-f);
      let p=[dir[0]*.03*(1-f),.03+.09*f,dir[2]*.03*(1-f)];
      const rings=[];
      for(let k=0;k<=segs;k++){
        const t=k/segs,e=elev-sag*t*t,step=L/segs;
        if(k)p=plus(p,plus(times(dir,Math.cos(e)*step),[0,Math.sin(e)*step,0]));
        const tan=unit(plus(times(dir,Math.cos(e)),[0,Math.sin(e),0])),up=unit(cross(side,tan));
        const w=width*(k===segs?0:Math.pow(1-t,.75)*(t<.12?.7+2.5*t:1)),trough=w*.32,keel=thick*(1-t*.8);
        rings.push({p,up,pts:[plus(p,times(side,-w)),plus(plus(p,times(side,-w*.6)),times(up,-trough*.4)),plus(p,times(up,-trough)),
          plus(plus(p,times(side,w*.6)),times(up,-trough*.4)),plus(p,times(side,w)),plus(p,times(up,-trough-keel))]});
      }
      for(let k=0;k<segs;k++){
        const a=rings[k],b=rings[k+1],ia=a.pts.map(q=>vert(g,q)),ib=b.pts.map(q=>vert(g,q)),last=k===segs-1;
        for(let j=0;j<4;j++){
          let c=Mg && (j===0 || j===3)?Mg:B;
          if(last)c=mix(c,T,.7);else if(F && rand()<.22)c=mix(c,F,.55);
          quad(g,[ia[j],ib[j],ib[j+1],ia[j+1]],c,a.up,.17);
        }
        const down=times(a.up,-1);
        quad(g,[ia[4],ib[4],ib[5],ia[5]],last?T:U,down,.14);
        quad(g,[ia[5],ib[5],ib[0],ia[0]],last?T:U,down,.14);
      }
    }
  };
  const AGAVES=[
    {count:24,length:.85,width:.12,thick:.04,droop:.9,body:"#7f9fa0",under:"#6c8a86",tip:"#3b2a22"},
    {count:22,length:.78,width:.11,thick:.04,droop:1.0,body:"#6e9a72",under:"#5f855f",margin:"#d9c766",tip:"#4a3a26"},
    {count:30,length:.46,width:.12,thick:.05,droop:.45,body:"#8fa9a6",under:"#7a948f",tip:"#2c221c"}
  ];
  const agave=(seed,lite,kind)=>keep("agave:"+seed+":"+lite+":"+kind,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),spec=AGAVES[kind];
    rosette(g,{...spec,count:lite?Math.ceil(spec.count*.5):spec.count},rand,lite?3:6);
    return finish([g]);
  });
  const aloe=(seed,lite)=>keep("aloe:"+seed+":"+lite,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),parts=[g];
    rosette(g,{count:lite?9:16,length:.42+.12*rand(),width:.065,thick:.05,droop:.5,body:"#6f8f55",under:"#5f7c49",tip:"#a0603a",fleck:"#c9d3b0"},rand,lite?3:5);
    const spikes=lite?1:1+Math.floor(rand()*3);
    for(let i=0;i<spikes;i++){
      const a=rand()*tau,lean=.08+.12*rand(),H=.65+.35*rand(),dir=[Math.cos(a),0,Math.sin(a)];
      const at=bez([0,.1,0],[dir[0]*lean*.3,H*.4,dir[2]*lean*.3],[dir[0]*lean*.8,H*.8,dir[2]*lean*.8],[dir[0]*lean,H,dir[2]*lean]);
      ribbedPath(g,at,t=>.012*(1-.4*t),[-dir[2],0,dir[0]],3,0,lite?3:5,()=>hex("#7d8a55"),.16,false);
      parts.push(aimed(M.lathe({profile:[[.035,0],[.05,.08],[.042,.18],[.022,.26],[0,.3]],segments:lite?5:8,
        color:t=>t<.45?"#e0602e":t<.8?"#ee8a3a":"#f2c45a",emissive:.34}),at(1),unit(sub(at(1),at(.92))),0));
    }
    return finish(parts);
  });
  // Barrels: a ribbed globe; golden ones are clothed in yellow spines with a woolly crown, fishhooks in red with a ring of flowers.
  const barrel=(seed,lite,fishhook)=>keep("barrel:"+seed+":"+lite+":"+fishhook,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),parts=[g],r=.2+.12*rand(),ribs=lite?8:16+Math.floor(rand()*6);
    const body=hex(fishhook?"#4f7a42":"#5e8b3b"),spine=hex(fishhook?"#c0603e":"#ecc84c"),wool=hex("#e9d9a0");
    const profile=[[r*.78,0],[r*.97,r*.25],[r,r*.6],[r*.92,r*.92],[r*.7,r*1.14],[r*.36,r*1.26],[r*.08,r*1.3]];
    ribbedPath(g,t=>{const k=t*(profile.length-1),i=Math.min(profile.length-2,Math.floor(k)),f=k-i;return [0,profile[i][1]+(profile[i+1][1]-profile[i][1])*f,0];},
      t=>{const k=t*(profile.length-1),i=Math.min(profile.length-2,Math.floor(k)),f=k-i;return profile[i][0]+(profile[i+1][0]-profile[i][0])*f;},
      [0,0,1],ribs,.16,lite?6:12,(p,s,t)=>{
        if(t>.9)return fishhook?mix(body,spine,.3):wool;
        return s%2===0?mix(body,spine,fishhook?.5:.72):mix(body,spine,fishhook?.12:.3);
      },.18);
    if(!lite){
      const n=fishhook?7:4;
      for(let i=0;i<n;i++){
        const a=i/n*tau+rand()*.3,rr=r*.32;
        parts.push(aimed(fishhook?blooms.coral():blooms.gold(),[Math.cos(a)*rr,r*1.27,Math.sin(a)*rr],[Math.cos(a)*.5,1,Math.sin(a)*.5],rand()*tau,fishhook?1:.8));
      }
    }
    return finish(parts,false);
  });
  // Pincushions: a clump of small woolly domes, each crowned with a ring of magenta flowers.
  const pincushion=(seed,lite)=>keep("pin:"+seed+":"+lite,()=>{
    const rand=BL.math.mulberry32(seed),g=M.geometry(),parts=[g],n=(lite?3:5)+Math.floor(rand()*(lite?2:5));
    const body=hex("#6b8c4c"),wool=hex("#ece6d4");
    for(let i=0;i<n;i++){
      const a=i*golden,d=i?.07+.1*Math.sqrt(i/n)+.03*rand():0,r=.06+.05*rand(),x=Math.cos(a)*d,z=Math.sin(a)*d;
      const profile=[[r*.85,0],[r,r*.45],[r*.85,r*.95],[r*.45,r*1.25],[r*.05,r*1.35]];
      ribbedPath(g,t=>[x,t*r*1.35,z],t=>{const k=t*(profile.length-1),j=Math.min(profile.length-2,Math.floor(k)),f=k-j;return profile[j][0]+(profile[j+1][0]-profile[j][0])*f;},
        [0,0,1],lite?5:9,.1,lite?3:6,(p,s)=>(p+s)%2?mix(body,wool,.55):body,.18);
      if(!lite && rand()<.75)for(let k=0;k<5;k++){
        const b=k/5*tau+rand()*.4,rr=r*.62;
        parts.push(aimed(blooms.pink(),[x+Math.cos(b)*rr,r*1.12,z+Math.sin(b)*rr],[Math.cos(b),1.6,Math.sin(b)],rand()*tau,.7));
      }
    }
    return finish(parts,false);
  });
  // A unit sandstone boulder (a pebble when `small`): a coarse ellipsoid pushed in and out by a smooth noise of
  // direction, so its seams stay closed. Nodes scale it to size.
  const rock=(variant,lite,small)=>keep("rock:"+variant+":"+lite+":"+small,()=>{
    const rand=BL.math.mulberry32(311+variant*7+(small?1:0)),g=M.geometry(),tones=["#b98a62","#a0765a","#c9a07a","#8f6a52","#d1ad86"].map(hex);
    const k1=rand()*9,k2=rand()*9;
    ellipsoid(g,[0,0,0],[1,0,0],[0,.62,0],.85,lite || small?3:5,lite || small?5:8,()=>tones[Math.floor(rand()*tones.length)],.16);
    const v=g.verts;
    for(let i=0;i<v.length;i+=3){
      const x=v[i],y=v[i+1],z=v[i+2],l=Math.hypot(x,y,z)||1,n=1+.18*Math.sin(x/l*3.1+k1)*Math.cos(z/l*2.7+k2)+.1*Math.sin(y/l*4.3+k1+k2);
      v[i]*=n;v[i+1]=Math.max(-.25,v[i+1]*n);v[i+2]*=n;
    }
    g.castShadow=!small;return g;
  });

  // The bed: how far it reaches from each wall at z. Narrow behind a trunk, deep between trees, tucked in at the ends.
  const treesOf=r=>{const C=BL.pokerCathedral;return Array.from({length:C.bayCount},(_,i)=>C.bayCenter(r,i));};
  const depthAt=(r,side,z)=>{
    let near=Infinity;for(const t of treesOf(r))near=Math.min(near,Math.abs(z-t));
    const open=smooth((near-1.6)/2.6),wave=.5+.5*Math.sin(z*.61+side*1.9);
    const end=smooth((r.d/2-.5-Math.abs(z))/2.2);
    const d=1.45+open*(1.7+.9*wave)+.13*Math.sin(z*2.3+side*.7)+.06*Math.sin(z*5.7+side*2.1);
    return .3+(d-.3)*end;
  };
  const inBed=(r,x,z)=>Math.abs(z)<r.d/2-.45 && r.w/2-Math.abs(x)<depthAt(r,Math.sign(x)||1,z)+.08;
  const bed=(r,side,lite)=>keep("bed:"+side+":"+lite+":"+r.w+":"+r.d,()=>{
    const g=M.geometry(),rand=BL.math.mulberry32(side>0?71:37),step=lite?.5:.22,L=r.d/2-.45,W=r.w/2;
    const sand=["#c9a982","#bf9d74","#d3b48d","#c4a27b","#b8966e"].map(hex),lip=hex("#a2805c"),up=[0,1,0];
    const n=Math.ceil(2*L/step),rows=[];
    for(let k=0;k<=n;k++){
      const z=-L+2*L*k/n,d=depthAt(r,side,z),q=[.02,d*.45,Math.max(.1,d-.2),d],y=[BED+.004,BED+.008+.006*Math.sin(z*3.1),BED,GROUND+.003];
      rows.push(q.map((qq,j)=>vert(g,[side*(W-qq),y[j],z])));
    }
    for(let k=0;k<n;k++)for(let j=0;j<3;j++)
      quad(g,[rows[k][j],rows[k+1][j],rows[k+1][j+1],rows[k][j+1]],j===2?lip:sand[Math.floor(rand()*sand.length)],up,.12);
    g.castShadow=false;g.receiveProjection=true;return g;
  });

  // Who grows where. Tall plants stand against the marble in the gaps; the colonies set the middle and the front.
  const TALL=["saguaro","organ","ocotillo","yucca"],MID=["pear","agave0","agave1","aloe","organ","agave0"],SMALL=["golden","fishhook","pin","agave2","aloe"];
  const RADIUS={saguaro:.55,organ:.62,ocotillo:.55,yucca:.5,pear:.62,pearPurple:.58,agave0:.62,agave1:.56,agave2:.36,aloe:.36,golden:.3,fishhook:.27,pin:.24,rock:.3};
  const VARIANTS={saguaro:3,organ:2,ocotillo:2,yucca:3,pear:3,pearPurple:2,agave0:2,agave1:2,agave2:2,aloe:3,golden:3,fishhook:2,pin:3,rock:5};
  const geometryOf=(kind,v,lite)=>{
    const seed=1009*(v+1)+kind.length*97;
    switch(kind){
      case "saguaro":return saguaro(seed,lite);
      case "organ":return organPipe(seed,lite);
      case "ocotillo":return ocotillo(seed,lite);
      case "yucca":return yucca(seed,lite);
      case "pear":return pear(seed,lite,false);
      case "pearPurple":return pear(seed+5,lite,true);
      case "agave0":return agave(seed,lite,0);
      case "agave1":return agave(seed,lite,1);
      case "agave2":return agave(seed,lite,2);
      case "aloe":return aloe(seed,lite);
      case "golden":return barrel(seed,lite,false);
      case "fishhook":return barrel(seed,lite,true);
      case "pin":return pincushion(seed,lite);
    }
    throw Error("No desert plant "+kind);
  };
  // Every plant (never a rock) grows at 1.6 times the size of the species models; spacing and solids follow the size.
  const GROWTH=1.6;
  const BLOCKING=new Set(["saguaro","organ","ocotillo","yucca","pear","pearPurple","agave0","agave1"]);
  const layout=(r,side,lite,avoid)=>{
    const rand=BL.math.mulberry32(side>0?4421:9133),W=r.w/2,L=r.d/2-1.0,trees=treesOf(r),C=BL.pokerCathedral,placed=[];
    const piers=Array.from({length:C.bayCount+1},(_,j)=>C.pier(r,1,j).z),treeQ=W-Math.abs(C.shrineAt(r,1,0).x);
    const colonies=[];
    for(let z=-L;z<=L;z+=1.4+rand()*.8)colonies.push({z,mid:MID[Math.floor(rand()*MID.length)],small:SMALL[Math.floor(rand()*SMALL.length)]});
    const colonyAt=z=>{let best=colonies[0];for(const c of colonies)if(Math.abs(c.z-z)<Math.abs(best.z-z))best=c;return best;};
    const fits=(z,q,rad,tall)=>{
      // A plant's radius is its reach (arms, paddles, leaves); its stem keeps clear of trunk, wall and bed edge.
      if(Math.abs(z)+rad*.6>L || q<.4+rad*.4 || q>depthAt(r,side,z)-rad*.3)return false;
      for(const t of trees){const dz=z-t,dq=q-treeQ;if(dz*dz+dq*dq<(2.25+rad*.45)**2)return false;}
      for(const p of piers)if((z-p)**2+(q-.37)**2<(.95+rad*.6)**2)return false;
      const x=side*(W-q);
      for(const a of avoid)if((a.x-x)**2+(a.z-z)**2<(1.15+rad)**2)return false;
      for(const p of placed)if((p.z-z)**2+(p.q-q)**2<((p.rad+rad)*.66)**2)return false;
      return true;
    };
    const sow=(attempts,pick)=>{
      for(let i=0;i<attempts;i++){
        const z=(rand()*2-1)*L,d=depthAt(r,side,z),q=.4+rand()*Math.max(0,d-.4),kind=pick(z,q,d);
        if(!kind)continue;
        const s=kind==="rock"?.12+.38*rand()*rand():(.98+.36*rand())*GROWTH,rad=RADIUS[kind]*(kind==="rock"?s/.3:s);
        if(!fits(z,q,rad,TALL.includes(kind)))continue;
        placed.push({kind,v:Math.floor(rand()*(VARIANTS[kind]||1)),z,q,rad,s,yaw:rand()*tau});
      }
    };
    const k=lite?.4:1;
    sow(Math.round(320*k),(z,q,d)=>q<2.2 && d>2.2?TALL[Math.floor(rand()*TALL.length)]:null);
    // The purple paddles are an accent, never a colony.
    sow(Math.round(1000*k),(z,q,d)=>{const c=colonyAt(z),u=rand();return u<.07?"pearPurple":u<.74?c.mid:MID[Math.floor(rand()*MID.length)];});
    sow(Math.round(1500*k),(z,q,d)=>{if(q<d*.3 && rand()<.4)return null;const c=colonyAt(z);return rand()<.7?c.small:SMALL[Math.floor(rand()*SMALL.length)];});
    sow(Math.round(160*k),()=>"rock");
    return placed;
  };

  const plantSteps=function* (room,r,add,lite,items,solids,slice){
    const avoid=items.slice(0,-8).map(prop=>({x:prop.node.position.x,z:prop.node.position.z}));
    const overlaps=(x,z,w)=>solids.some(s=>Math.abs(s.x-x)<s.w+w && Math.abs(s.z-z)<s.d+w);
    const plants=[];
    for(const side of [-1,1]){
      const ground=add(room,bed(r,side,lite));ground.sightHidden=true;
      yield* BL.buildTasks.pause(slice);
      for(const p of layout(r,side,lite,avoid)){
        const x=side*(r.w/2-p.q);
        const boulder=p.kind==="rock",geometry=boulder?rock(p.v,lite,false):geometryOf(p.kind,p.v,lite);
        const n=add(room,geometry,x,boulder?BED+.12*p.s:BED-.006,p.z);
        n.rotation.y=p.yaw;n.scale.x=n.scale.y=n.scale.z=p.s;n.sightHidden=true;
        if(BLOCKING.has(p.kind) || p.kind==="rock" && p.s>.25){
          const w=p.rad*.62;
          if(!overlaps(x,p.z,w))solids.push({x,z:p.z,w,d:w});
        }
        plants.push(p.kind);
        if(plants.length%12===0)yield* BL.buildTasks.pause(slice);
      }
      if(!lite)for(let i=0;i<70;i++){
        const rand=BL.math.mulberry32(side*131+i*17),z=(rand()*2-1)*(r.d/2-.9),q=.15+rand()*(depthAt(r,side,z)-.35);
        if(q<.15)continue;
        const s=.035+.06*rand(),n=add(room,rock(i%5,lite,true),side*(r.w/2-q),BED+.05*s,z);
        n.rotation.y=rand()*tau;n.scale.x=n.scale.y=n.scale.z=s;n.sightHidden=true;
      }
    }
    return plants;
  };
  BL.pokerDesertGarden=Object.freeze({inBed,depthAt,plantSteps});
})();
