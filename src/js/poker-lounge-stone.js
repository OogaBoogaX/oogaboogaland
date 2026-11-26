// Four rib-vaulted bays spring from paired engaged piers along the lounge walls.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene;
  const pale="#ffffff",rib="#faf9f6";
  const mapped=BL.pokerMarble.mineralAtlas(()=>BL.pokerHearthMap,512,true);
  const finish=(g,min,max)=>{
    if(typeof Image!=="undefined")mapped(g,min,max);
    return g;
  };
  const archFlame=M.cached(()=>finish(BL.pokerHearth.crest(pale,.30),[-.82,-1.34,-.09],[.82,1.34,.20]));
  // The two ends are handed versions of one chaise. Each module's origin is its sitting position.
  const seatWidth=1.26,modules=7,back=-.70,seatDepth=1.43,chaiseDepth=2.60;
  const seatZ=r=>8.3-r.d/2,sideTableX=modules*seatWidth/2+.53,sideTableZ=r=>seatZ(r)-.42,sideTableTop=.67;
  const tableRadius=.78,tableZ=r=>seatZ(r)-2.04;
  const felt=M.cached(()=>{
    const size=192,canvas=document.createElement("canvas");canvas.width=3*size;canvas.height=size;
    const ctx=canvas.getContext("2d"),image=ctx.createImageData(canvas.width,size);
    const rand=BL.math.mulberry32(8831);
    for(let i=0;i<image.data.length;i+=4){
      const fibre=218+Math.floor(27*rand());
      image.data[i]=fibre;image.data[i+1]=fibre;image.data[i+2]=fibre-1;image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
    ctx.strokeStyle="rgba(255,252,245,.26)";ctx.lineWidth=.65;ctx.beginPath();
    for(let i=0;i<6400;i++){
      const x=rand()*canvas.width,y=rand()*size;
      ctx.moveTo(x,y);ctx.lineTo(x+1.5+rand()*2,y+rand()*2-1);
    }
    ctx.stroke();return canvas;
  });
  // Soft rectangular profiles with a crowned middle, rounded corners and an inset welt.
  const cushion=(w,h,d,color)=>{
    const g=M.geometry(),rgb=BL.math.hexToRgb(color),welt=rgb.map(v=>Math.round(v*.88));
    const rings=[[.84,0],[.95,.055],[.993,.21],[1,.47],[.992,.53],[1,.58],[.982,.79],[.92,.94],[.64,1]];
    const shape=t=>Math.sign(t)*Math.pow(Math.abs(t),.30);
    let prev;
    for(let j=0;j<rings.length;j++){
      const [scale,y]=rings[j],ring=[];
      for(let k=0;k<32;k++){
        const a=2*Math.PI*k/32,cs=Math.cos(a),sn=Math.sin(a);
        ring.push(M.pushVert(g,w*.5*scale*shape(cs),h*y,d*.5*scale*shape(sn)));
      }
      if(prev)for(let k=0;k<32;k++){
        const n=(k+1)%32;M.face(g,[prev[k],ring[k],ring[n],prev[n]],j===4?welt:rgb);
      }
      if(!prev)M.face(g,ring.slice(),rgb);
      prev=ring;
    }
    M.face(g,prev.reverse(),rgb);return g;
  };
  const moduleGeometry=M.variants(index=>{
    const end=index-1;
    const depth=end?chaiseDepth:seatDepth,to=back+depth,parts=[];
    const pad=(x,y,z,w,h,d,color,lean=0)=>parts.push(M.moved(M.turnedX(cushion(w,h,d,color),lean),x,y,z));
    const top=BL.pokerModels.SEAT_TOP;
    pad(0,.014,(back+to)/2,seatWidth+.008,.245,depth,"#d5cec4");
    pad(0,.25,(back+.19+to)/2,seatWidth-.012,top-.25,depth-.19,"#f2eee6");
    pad(0,.19,back+.12,seatWidth+.006,.67,.27,"#e8e2d9");
    pad(0,top-.08,back+.32,seatWidth-.028,.68,.32,"#f5f1e9",-.14);
    if(end)pad(end*(seatWidth*.5-.095),.275,back+.65,.22,.46,1.27,"#e7e1d8");
    const g=M.shaded(parts);
    if(typeof CanvasRenderingContext2D!=="undefined")g.imageSurface={canvas:felt(),atlas:true,
      atlasMin:[-seatWidth/2,0,back-.04],atlasMax:[seatWidth/2,1.10,to],rect:[0,0,1,1],version:1};
    return g;
  });
  const desertThrow=M.cached(()=>{
    const cloth=M.geometry(),width=1.08,steps=32,diagonal=Math.SQRT1_2;
    // Trace the cushion crown, its rolled edge, then the freely hanging hem.
    // Project along the bisector of the seat and side so the weave stays
    // continuous around the bend, using the renderer's ordinary planar map.
    // Approximately 1.40 m of cloth follows this profile. Most of the added
    // length lies across the chaise, leaving the hem just above the rug.
    const profile=[[-.96,.481],[-.79,.486],[-.60,.480],[-.42,.488],[-.25,.482],
      [-.15,.482],[-.092,.478],[-.043,.463],[-.015,.447],[.004,.420],
      [.014,.386],[.018,.335],[.019,.255],[.021,.17],[.030,.070]];
    const white=BL.math.hexToRgb("#fffdf8");
    let previous;
    for(let i=0;i<profile.length;i++){
      const [out,height]=profile[i],v=i/(profile.length-1),row=[];
      for(let j=0;j<=steps;j++){
        const u=j/steps;
        const fold=.5+.5*Math.cos(19*u+1.5*v+.6*Math.sin(8*u));
        const ripple=(.008+.020*v)*fold+.007*v*Math.sin(9*u);
        row.push(M.pushVert(cloth,(u-.5)*width,(height-out)*diagonal,(height+out)*diagonal+ripple));
        if(i && j)M.face(cloth,[row[j-1],row[j],previous[j],previous[j-1]],white);
      }
      previous=row;
    }
    cloth.smooth=true;
    if(typeof Image!=="undefined"){
      const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
      canvas.width=canvas.height=1;ctx.fillStyle="#23385c";ctx.fillRect(0,0,1,1);
      const [start,end]=[profile[0],profile[profile.length-1]].map(([x,y])=>(y-x)*diagonal);
      const surface=cloth.imageSurface={canvas,rect:[-width/2,end,width,start-end],smooth:true,tessellated:true,version:0};
      const image=new Image();
      image.onload=()=>{
        canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
        ctx.drawImage(image,0,0);BL.pokerLoungeFamily.patches(ctx,canvas.width,canvas.height);surface.version++;
      };
      image.src=BL.pokerDesertThrowArt;
    }
    return cloth;
  });
  const coffeeTable=M.cached(()=>{
    const wood="#6c4935",parts=[];
    const turn=(x,y,z,profile,color,n)=>parts.push(M.moved(M.lathe({profile,segments:n,color}),x,y,z));
    turn(0,0,0,[[0,.435],[.73,.435],[tableRadius,.45],[tableRadius,.471],[.765,.479],[0,.479]],wood,48);
    for(let i=0;i<3;i++){
      const a=i*2*Math.PI/3,c=Math.cos(a),s=Math.sin(a);
      parts.push(M.beam(.64*c,.032,.64*s,-.24*c,.436,-.24*s,.075,wood));
    }
    // A shallow two-tone stoneware bowl and a wooden ring rattle.
    turn(.21,.479,-.08,[[0,0],[.10,0],[.175,.071],[.184,.092],[.171,.093],[.145,.065],[.09,.021],[0,.021]],"#ded3b6",32);
    parts.push(M.moved(M.torus(.071,.013,"#c99759",0,24,8),-.27,.495,.12),
      M.beam(-.32,.495,.072,-.43,.498,-.04,.030,"#be854c"));
    return M.merge(...parts);
  });
  const toyX=2.48,toyZ=r=>seatZ(r)-3.00,trayRadius=.395;
  const playCorner=M.cached(()=>{
    const cream="#f4eee3",maple="#b9885d",mint="#8dbfb3",coral="#d86859",aqua="#79b8bf",ochre="#edbe56";
    const parts=[];
    const turn=(x,y,z,profile,color,segments=16)=>parts.push(M.moved(M.lathe({profile,segments,color}),x,y,z));
    // The activity centre has a dished fabric seat inside an open moulded tray,
    // three splayed wooden legs and a low foot platform.
    turn(0,0,0,[[.18,.425],[.37,.425],[trayRadius,.445],[trayRadius,.479],[.37,.497],[.19,.497],[.18,.477],[.18,.425]],cream,32);
    turn(0,0,0,[[.18,.47],[.157,.44],[.13,.324],[.073,.294],[0,.293]],mint,24);
    turn(0,0,0,[[0,.085],[.225,.085],[.248,.098],[.248,.11],[.23,.119],[0,.119]],"#d9c6a2",24);
    for(let i=0;i<3;i++){
      const angle=.3+i*2*Math.PI/3,c=Math.cos(angle),s=Math.sin(angle);
      parts.push(M.beam(.37*c,.035,.37*s,.289*c,.435,.289*s,.045,maple));
      parts.push(M.beam(.375*c,.012,.375*s,.362*c,.086,.362*s,.052,cream));
      parts.push(M.beam(.23*c,.105,.23*s,.36*c,.15,.36*s,.017,mint));
    }
    // A bent wire and three sliding beads rise above the far rim.
    for(let i=0;i<10;i++){
      const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
      parts.push(M.beam(.15*Math.cos(a),.495+.18*Math.sin(a),-.245,
        .15*Math.cos(b),.495+.18*Math.sin(b),-.245,.018,cream));
    }
    for(const [angle,color] of [[.48,coral],[1.12,ochre],[2.5,aqua]]){
      turn(.15*Math.cos(angle),.495+.18*Math.sin(angle),-.245,[[0,-.032],[.032,-.014],[.034,.011],[.023,.027],[0,.033]],color);
    }
    for(const [i,color] of [aqua,ochre,coral].entries()){
      const rad=.063-i*.012;
      parts.push(M.moved(M.torus(rad,.02,color,0,18,6),-.273,.519+i*.036,.035));
    }
    // A striped blanket lies beside the tray. Shallow ripples continue across
    // colour changes so the selvedge and stripes follow the same loose folds.
    const cloth=M.geometry(),bands=["#e2d7c2","#364755","#e2d7c2","#ad6955","#eee2cc","#817d77","#e2d7c2","#425765"];
    let previous;
    for(let i=0;i<=32;i++){
      const u=i/32,row=[];
      for(let j=0;j<=8;j++){
        const v=j/8,fold=Math.sin(7*v+11*u);
        row.push(M.pushVert(cloth,-1.07+(u-.5)*1.42+.035*fold,.022+.012*fold,
          -.05+(v-.5)*1.12+.09*(u-.5)+.021*Math.cos(14*u)));
        if(i && j)M.face(cloth,[previous[j-1],previous[j],row[j],row[j-1]],BL.math.hexToRgb(bands[(i-1)%8]));
      }
      previous=row;
    }
    parts.push(cloth);
    // A little aqua elephant sits on the blanket beside its board book.
    const plush=(x,y,z,w,h,d)=>parts.push(M.moved(cushion(w,h,d,aqua),x,y,z));
    plush(-1.21,.03,.08,.21,.15,.26);
    plush(-1.21,.127,.168,.19,.15,.17);
    for(const side of [-1,1]){
      plush(-1.21+side*.092,.13,.141,.08,.12,.092);
      plush(-1.21+side*.065,.029,.165,.074,.074,.10);
      turn(-1.21+side*.053,.212,.248,[[0,-.009],[.009,0],[0,.01]],"#384446",8);
    }
    parts.push(M.beam(-1.21,.178,.236,-1.21,.089,.273,.042,aqua),M.beam(-1.21,.09,.27,-1.21,.096,.299,.037,aqua));
    const book=(w,h,d,y,color)=>M.bevelBox({w,h,d,bevel:.004,color,offset:{y}});
    const board=M.merge(book(.21,.016,.19,.008,"#c5794f"),book(.201,.022,.18,.027,cream),
      book(.21,.016,.19,.046,"#cb8757"),M.moved(M.torus(.043,.009,ochre,0,18,6),0,.056,0));
    parts.push(M.moved(M.turnedY(board,.25),-.75,.032,-.23));
    return M.merge(...parts);
  });
  const rugWidth=modules*seatWidth+1.8,rugDepth=5.1,rugZ=r=>seatZ(r)-1.22;
  const rug=M.cached(()=>{
    const w=rugWidth,d=rugDepth,g=M.panel({w,h:d,tilesX:1,tilesY:1,color:"#fcfaf5"});
    if(typeof CanvasRenderingContext2D!=="undefined"){
      const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=Math.round(canvas.width*d/w);
      const c=canvas.getContext("2d"),rand=BL.math.mulberry32(713);
      c.fillStyle="#dedbd3";c.fillRect(0,0,canvas.width,canvas.height);
      const wool=["#fffdf8","#f9f7ef","#f4f2eb","#efece5","#faf9f4"];
      const flecks=["#77563e","#997655","#806952","#b3997c"];
      c.lineCap="round";
      const pitch=4.6;
      for(let row=0;row*pitch<canvas.height;row++){
        const tension=rand()*.5;
        for(let col=0;col*pitch<canvas.width;col++){
          // Alternate which strand crosses on top. Rounded ends and a fine crest give the wool loft.
          const x=(col+.5)*pitch+.37*Math.sin(row*.18+col*.52),y=(row+.5)*pitch+tension;
          const across=(row+col)%2===0,reach=1.48+.32*rand(),drift=(rand()-.5)*.65;
          const dx=across?reach:drift,dy=across?drift:reach;
          c.lineWidth=3.15+.65*rand();c.strokeStyle=wool[Math.floor(rand()*wool.length)];
          c.beginPath();c.moveTo(x-dx,y-dy);c.quadraticCurveTo(x+.35,y-.25,x+dx,y+dy);c.stroke();
          // Short coloured fibres only occupy part of a strand, following the twist of the weave.
          const brown=rand()<.019;
          c.strokeStyle=brown?flecks[Math.floor(rand()*flecks.length)]:"#fffdf8";
          c.lineWidth=brown?.85+rand()*.65:.55;
          c.beginPath();c.moveTo(x-.86*dx-.35,y-.86*dy-.4);
          c.quadraticCurveTo(x-.48,y-.63,x+.60*dx-.2,y+.60*dy-.25);c.stroke();
        }
      }
      g.imageSurface={canvas,rect:[-w/2,-d/2,w,d],smooth:true,version:1};
    }
    g.castShadow=false;g.receiveProjection="matte";return g;
  });
  const sectional=(seats,solid,r)=>{
    for(let i=0;i<modules;i++){
      const x=(i-(modules-1)/2)*seatWidth,end=i===0?1:i===modules-1?-1:0,depth=end?chaiseDepth:seatDepth;
      seats.push({x,z:seatZ(r),yaw:Math.PI,geometry:moduleGeometry(end+1),extension:end?chaiseDepth-seatDepth:0});
      solid(x,seatZ(r)-back-depth/2,seatWidth+.008,depth);
    }
    solid(0,tableZ(r),2*tableRadius,2*tableRadius);
    solid(toyX,toyZ(r),2*trayRadius,2*trayRadius);
    const garden=BL.pokerLoungeFamily;
    solid(garden.gardenX,garden.gardenZ(seatZ(r)),.88,.88);
  };
  const firesideTable=(room,r)=>{
    // Forward of the book cabinet, on the exposed outer edge of the right chaise.
    const corner=S.createNode({position:{x:modules*seatWidth/2,y:0,z:seatZ(r)-1.25},
      rotation:{x:0,y:Math.PI/2,z:0}});
    const blanket=S.createNode({geometry:desertThrow(),rotation:{x:-Math.PI/4,y:0,z:0}});
    S.addChild(corner,blanket);
    S.addChild(room,corner);
    const mat=S.createNode({geometry:rug(),position:{x:0,y:.036,z:rugZ(r)},rotation:{x:-Math.PI/2,y:0,z:0}});
    S.addChild(room,mat);
    const table=S.createNode({geometry:coffeeTable(),position:{x:0,y:.036,z:tableZ(r)}});
    S.addChild(room,table);
    const toys=S.createNode({geometry:playCorner(),position:{x:toyX,y:.036,z:toyZ(r)}});
    S.addChild(room,toys);return {table,toys,blanket};
  };
  const {bayCount,bayWidth,bayCenter}=BL.pokerCathedral;
  const arch=t=>1-.48*t-.52*t*t;
  const ceilingAt=(r,x,z)=>{
    const b=bayWidth(r)/2,a=r.w/2-.37;
    const localZ=Math.abs(Math.abs(z)%(2*b)-b);
    return r.h-.23-9.04*(1-arch(Math.min(1,Math.abs(x)/a,localZ/b)));
  };
  const sill=11.12,shoulder=sill+5.50,lancetTop=sill+8.68;
  const archWidth=t=>1-t*t;
  const archHeight=(t,top)=>shoulder+(top-shoulder)*(1.66*t-.66*t*t);
  // The glass follows the very same twelve chords as the stonework. Each row
  // is a quad so the Canvas renderer can project the texture at oblique angles.
  const glazing=half=>{
    const g=M.geometry(),white=BL.math.hexToRgb("#ffffff");
    const vertex=(x,y)=>M.pushVert(g,x,y,0);
    for(const direction of [-1,1]){
      const radius=half/2,center=direction*radius;
      let left=vertex(center-radius,sill),right=vertex(center+radius,sill);
      for(let i=0;i<=12;i++){
        const t=i/12,span=Math.max(.0001,radius*archWidth(t)),y=archHeight(t,lancetTop);
        const l=vertex(center-span,y),r=vertex(center+span,y);
        M.face(g,[left,right,r,l],white,{emissive:.64});
        M.face(g,[l,r,right,left],white,{emissive:.64});
        left=l;right=r;
      }
    }
    g.castShadow=false;
    return g;
  };
  // Local x follows the old sixteen-chord rib, y crosses the ray, and z
  // rises from the spring to the crown. Every half arch instances this strip.
  const vaultRay=M.cached(()=>{
    const g=M.panel({w:1,h:1,tilesX:16,tilesY:1,color:"#ffffff",emissive:1});
    for(let i=0;i<g.verts.length;i+=3)g.verts[i+2]=arch(.5-g.verts[i]);
    for(const face of g.faces.slice())M.face(g,face.i.slice().reverse(),[255,255,255],{emissive:1});
    const canvas=document.createElement("canvas");canvas.width=96;canvas.height=96;
    const ctx=canvas.getContext("2d"),pixels=ctx.createImageData(96,96);
    for(let y=0;y<96;y++)for(let x=0;x<96;x++){
      const t=(x+.5)/96,h=2*(y+.5)/96-1,k=4*(96*y+x);
      const core=Math.exp(-50*h*h),haze=Math.exp(-5*h*h);
      const strand=h-.24-.024*Math.sin(6*t);
      pixels.data[k]=255;pixels.data[k+1]=212+39*core;pixels.data[k+2]=149+79*core;
      pixels.data[k+3]=166*core+58*haze+24*Math.exp(-180*strand*strand);
    }
    ctx.putImageData(pixels,0,0);
    g.castShadow=false;g.twoSided=true;
    g.imageSurface={canvas,rect:[-.5,-.5,1,1],tessellated:true,smooth:true,blend:"alpha",cutout:true};
    return g;
  });
  const crestGlow=M.cached(()=>{
    const canvas=document.createElement("canvas");canvas.width=canvas.height=192;
    const c=canvas.getContext("2d");c.translate(96,96);c.scale(64,-64);
    c.beginPath();
    for(const ring of BL.pokerDamaskMap.contours){
      ring.forEach(([x,y],i)=>i?c.lineTo(x*.0091,y*.0091):c.moveTo(x*.0091,y*.0091));c.closePath();
    }
    c.fillStyle="#fff3d2";c.shadowColor="#ffda91";c.shadowBlur=10;c.fill("evenodd");
    const g=M.panel({w:1,h:1,tilesX:1,tilesY:1,color:"#ffffff"});
    g.castShadow=false;g.twoSided=true;
    g.imageSurface={rect:[-.5,-.5,1,1],blend:"add",soft:true,cutout:true,fallback:()=>canvas};return g;
  });
  const outfit=(room,r,lite)=>{
    const add=(geometry,x=0,y=0,z=0)=>{
      const n=S.createNode({geometry,position:{x,y,z}});S.addChild(room,n);return n;
    };
    const a=r.w/2-.37,b=bayWidth(r)/2,rise=9.04,spring=r.h-rise-.23;
    const column=[],vault=[];
    const shaft=(x,z,profile,c)=>column.push(M.moved(M.lathe({profile,color:c,segments:lite?8:12,emissive:.33}),x,0,z));
    shaft(0,0,[[.37,.025],[.42,.15],[.40,.23],[.33,.33],[.27,.56],[.247,spring-.70],[.32,spring-.58],[.39,spring-.16],[.39,spring]],pale);
    for(let k=0;k<8;k++){
      const t=k*Math.PI/4,x=.248*Math.cos(t),z=.248*Math.sin(t);
      shaft(x,z,[[.107,.19],[.13,.28],[.08,.48],[.073,spring-.80],[.11,spring-.63],[.16,spring-.34],[.10,spring-.12],[.045,spring+.15]],rib);
    }
    for(const y of [1.36,spring-.53,spring-.17])shaft(0,0,[[.37,y],[.42,y+.05],[.41,y+.105],[.36,y+.14]],pale);
    const pier=finish(M.merge(...column),[-.45,0,-.45],[.45,spring,.45]);
    for(const side of [-1,1])for(let j=0;j<=bayCount;j++){
      const pos=BL.pokerCathedral.pier(r,side,j);const n=add(pier,pos.x,0,pos.z);n.scale.x=n.scale.z=2;
    }
    const ray=vaultRay();
    const archRib=(side,endX,startZ,endZ,width)=>{
      const dx=endX-side*a,dz=endZ-startZ;
      const n=add(ray,side*a+dx/2,spring-.10,startZ+dz/2);
      n.rotation.x=-Math.PI/2;n.rotation.y=Math.atan2(-dz,dx);
      n.scale.x=Math.hypot(dx,dz);n.scale.y=4*width;n.scale.z=rise;
      n.sightHidden=true;
    };
    // The mullion, paired lancets and outer arch stand proud of the glass.
    const half=b-.92;
    for(const s of [-1,1]){
      const x=s*(a+.13);
      const bar=(u,y,v,yy,width,c)=>vault.push(M.beam(x,y,u,x,yy,v,width,c,.29));
      for(const [center,radius,top,thick] of [[0,half,sill+12.00,.24],[-half/2,half/2,lancetTop,.164],[half/2,half/2,lancetTop,.164]]){
        for(const sign of [-1,1]){
          const foot=center+sign*radius;
          bar(foot,sill,foot,shoulder,thick,rib);
          for(let i=0;i<12;i++){
            const t=i/12,u=(i+1)/12;
            bar(center+sign*radius*archWidth(t),archHeight(t,top),
              center+sign*radius*archWidth(u),archHeight(u,top),thick,pale);
          }
        }
      }
      // A dark glazing bead at the back of the marble reveal follows the
      // points of the two lancets. Stop at the sill rather than crossing it.
      const beadX=x+s*.032;
      const bead=(u,y,v,yy)=>vault.push(M.beam(beadX,y,u,beadX,yy,v,.052,"#544d43",.15));
      for(const center of [-half/2,half/2])for(const sign of [-1,1]){
        const radius=half/2-.085;
        bead(center+sign*radius,sill+.10,center+sign*radius,shoulder);
        for(let i=0;i<12;i++){
          const t=i/12,u=(i+1)/12;
          bead(center+sign*radius*archWidth(t),archHeight(t,lancetTop-.10),
            center+sign*radius*archWidth(u),archHeight(u,lancetTop-.10));
        }
      }
      bar(-half,sill,half,sill,.28,rib);
    }
    const bay=finish(M.merge(...vault),[-a,spring,-b],[a,r.h,b]);
    const flame=archFlame(),windows=[];
    const logoX=r.w/2-.152,logoY=sill+10.02,logoScale=.45;
    for(let j=0;j<bayCount;j++){
      const z=bayCenter(r,j);
      add(bay,0,0,z);
      for(const side of [-1,1]){
        for(const end of [-1,1]){
          archRib(side,0,z+end*b,z,.256);
          archRib(side,side*a,z+end*b,z,.256);
        }
        archRib(side,0,z-b,z-b,.36);
      }
      for(const s of [-1,1]){
        // From the entrance, read the left wall toward the hearth and the right wall back.
        const glass=add(glazing(half),s*(a+.185),0,z);
        glass.rotation.y=-s*Math.PI/2;
        windows[s<0?j:2*bayCount-1-j]=glass;
        const ornament=add(flame,s*logoX,logoY,z);
        ornament.rotation.y=-s*Math.PI/2;
        ornament.scale.x=ornament.scale.y=ornament.scale.z=logoScale;
        const glow=add(crestGlow(),s*(logoX-.085),logoY,z);
        glow.scale.x=glow.scale.y=3*logoScale;glow.rotation.y=ornament.rotation.y;glow.sightHidden=true;
      }
    }
    for(const side of [-1,1])archRib(side,0,bayCount*b,bayCount*b,.36);
    const boss=M.lathe({profile:[[0,0],[.115,.057],[.21,.13],[.28,.23],[.21,.28],[0,.28]],segments:12,color:BL.pokerMarble.GOLD,emissive:.46});
    for(let j=0;j<bayCount;j++){const n=add(boss,0,r.h-.65,bayCenter(r,j));n.scale.x=n.scale.y=n.scale.z=2;}
    return {windows,rect:[-half,sill,2*half,lancetTop-sill]};
  };
  BL.pokerLoungeStone=Object.freeze({sectional,firesideTable,seatZ,tableZ,sideTableX,sideTableZ,sideTableTop,rugWidth,rugDepth,rugZ,outfit,ceilingAt,sill});
})();
