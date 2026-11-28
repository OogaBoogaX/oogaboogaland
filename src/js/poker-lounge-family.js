// Small family objects at the hearth, in metres relative to the lounge.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,tau=Math.PI*2;
  const gardenX=-4.76,gardenZ=seat=>seat-2.24;
  const stems=[[-.22,.03,.88],[-.15,-.09,.72],[-.04,.05,.79],[-.08,-.13,.98],[.03,-.06,.64]];
  const perch=[.28,.65,-.12];
  const garden=M.cached(()=>{
    const parts=[],petals=M.geometry(),pads=M.geometry(),seed=BL.math.mulberry32(781);
    const pot=(profile,ink)=>M.lathe({profile,segments:40,color:ink});
    parts.push(pot([[.25,0],[.31,.025],[.42,.19],[.44,.20],[.44,.235],[.415,.245],[.385,.218],[.375,.185]],"#b86a4e"),
      pot([[0,.202],[.397,.202],[.391,.209],[0,.214]],"#60493a"));
    const stem=(x,y,z,xx,yy,zz,w,c)=>parts.push(M.beam(x,y,z,xx,yy,zz,w,c));
    // Creased double-sided petals and finely divided leaves keep each spike light enough to see through.
    const blade=(x,y,z,dx,dy,dz,wx,wy,wz,ink)=>{
      const indices=[[x,y,z],[x+.53*dx+wx,y+.53*dy+wy,z+.53*dz+wz],[x+dx,y+dy,z+dz],
        [x+.53*dx-wx,y+.53*dy-wy,z+.53*dz-wz],[x+.57*dx,y+.57*dy,z+.57*dz+.003]].map(v=>M.pushVert(petals,...v));
      const color=BL.math.hexToRgb(ink);
      for(let i=0;i<4;i++){
        const f=[indices[i],indices[(i+1)%4],indices[4]];
        M.face(petals,f,color,{emissive:.23});M.face(petals,f.slice().reverse(),color,{emissive:.23});
      }
    };
    for(const [x,z,top] of stems){
      stem(x*.72,.205,z*.76,x,top,z,.008,"#5f8052");
      for(let k=0;k<3;k++){
        const a=k*2.38+x*5,c=Math.cos(a),s=Math.sin(a),y=.28+k*.068;
        for(let l=-2;l<=2;l++){
          const b=a+l*.24;
          blade(x+c*.024,y,z+s*.024,.095*Math.cos(b),.043-Math.abs(l)*.009,.095*Math.sin(b),-.006*s,0,.006*c,"#577946");
        }
      }
      for(let k=0;k<9;k++){
        const a=k*2.4,dx=Math.sin(a),dz=Math.cos(a),y=top-.32+k*.04,size=.046-.0027*k;
        const bx=x+dx*size, bz=z+dz*size;
        stem(x,y-.018,z,bx,y,bz,.0045,"#799354");
        // Five petal-like sepals around a pale bee, plus the long backward nectar spur.
        for(let j=0;j<5;j++){
          const angle=j*tau/5,ac=Math.cos(angle),as=Math.sin(angle);
          blade(bx,y,bz,(dz*ac+.32*dx)*size,as*size,(-dx*ac+.32*dz)*size,
            -dz*as*size*.48,ac*size*.48,dx*as*size*.48,["#a58be8","#7163c6","#d2b9ff","#9984d9","#8272d1"][j]);
        }
        blade(bx,y,bz,-dx*size*1.1,size*.66,-dz*size*1.1,.004,0,.004,"#625594");
        blade(bx+.003*dx,y-.005,bz+.003*dz,.007*dx,.010,.007*dz,.005*dz,0,-.005*dx,"#efe9d7");
      }
    }
    const jade=["#618772","#739a7f","#8caf93","#adbea2"].map(c=>BL.math.hexToRgb(c));
    for(const [x,y,z,rx,ry] of [[.19,.31,.09,.111,.135],[.11,.456,.10,.076,.094],[.25,.495,.095,.080,.13],[.31,.62,.10,.049,.067]]){
      BL.hubModels.puff(pads,x,y,z,rx,ry,.031,jade,seed,6,12);
      for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
        const bx=x+i*rx*.46,by=y+j*ry*.50,bz=z+.031*Math.sqrt(1-i*i*.21-j*j*.25);
        blade(bx,by,bz,.004,.010,.004,.003,0,0,"#dbc99d");
      }
    }
    stem(.31,.212,-.09,.21,.49,-.14,.025,"#82654e");
    stem(.21,.49,-.14,...perch,.014,"#94765a");
    stem(.22,.52,-.14,.135,.60,-.155,.010,"#94765a");
    for(const face of pads.faces)face.emissive=.16;
    return M.merge(...parts,petals,pads);
  });
  const flightStops=seat=>{
    const x=gardenX,z=gardenZ(seat),bloom=i=>[x+stems[i][0]+.176,.036+stems[i][2]-.22-.048,z+stems[i][1]+.040];
    return [bloom(0),[x-.03,.93,z+.47],bloom(2),[x+.30,.90,z+.43],[x+perch[0],.036+perch[1]+.041,z+perch[2]]];
  };
  // Leather patches sewn along the throw, one for each state: its outline in tooled leather, saddle-stitched round
  // the edge, its postal code stamped in. Outlines are simplified [longitude, latitude] rings, the code going on the
  // first; Michigan has two, its peninsulas.
  const STATES=[
    ["MN","Minnesota",[[[-97.24,49],[-95.15,49],[-95.15,49.38],[-94.82,49.3],[-94.6,48.72],[-93.8,48.52],[-93,48.62],
      [-92,48.35],[-91,48.2],[-90,48.1],[-89.5,48],[-90.6,47.6],[-91.5,47.1],[-92.1,46.75],[-92.3,46.7],[-92.3,46.08],
      [-92.9,45.6],[-92.75,45],[-92.8,44.75],[-92.3,44.55],[-91.3,43.95],[-91.22,43.5],[-96.45,43.5],[-96.45,45.3],
      [-96.85,45.6],[-96.55,46],[-96.8,47],[-97,48]]]],
    ["MI","Michigan",[[[-86.82,41.76],[-84.8,41.7],[-83.45,41.73],[-83.1,42.05],[-82.5,42.6],[-82.4,43],[-82.5,43.6],
      [-82.9,44.07],[-83.5,43.9],[-83.9,43.65],[-83.8,44],[-83.3,44.3],[-83.3,44.9],[-83.4,45.05],[-84,45.5],[-84.7,45.78],
      [-85.05,45.65],[-85.4,45.2],[-85.55,44.75],[-85.65,45.1],[-86.1,44.95],[-86.25,44.5],[-86.5,44],[-86.4,43.2],
      [-86.25,42.4],[-86.6,42]],
      [[-90.42,46.57],[-89.6,46.8],[-88.6,47.25],[-87.9,47.45],[-88.3,47],[-88,46.85],[-87.4,46.5],[-86.6,46.45],
      [-85.6,46.75],[-85,46.75],[-84.6,46.45],[-84.1,46.5],[-83.6,46.1],[-84,45.97],[-84.7,45.9],[-85.5,46.1],[-86.3,45.9],
      [-86.6,45.7],[-87,45.75],[-87.6,45.1],[-87.8,45.35],[-88.1,45.8],[-88.7,46],[-89.1,46.1],[-90.1,46.33]]]],
    ["OR","Oregon",[[[-124.05,46.25],[-123.2,46.15],[-122.8,45.9],[-122.25,45.55],[-121.2,45.6],[-120,45.75],[-119,45.95],
      [-116.92,46],[-116.5,45.6],[-116.75,45],[-117.2,44.3],[-116.9,44.1],[-117.03,43.8],[-117.03,42],[-124.2,42],
      [-124.55,42.8],[-124.1,43.7],[-123.95,45]]]],
    ["CA","California",[[[-124.2,42],[-120,42],[-120,39],[-114.63,35],[-114.6,34.3],[-114.4,34.1],[-114.7,33.4],[-114.5,33],
      [-114.72,32.72],[-117.12,32.53],[-117.25,33],[-118,33.7],[-118.5,34],[-119.2,34.15],[-120.6,34.55],[-120.65,35.2],
      [-121.9,36.3],[-121.95,36.95],[-122.5,37.5],[-122.5,37.8],[-123,38],[-123.7,38.95],[-123.85,39.8],[-124.4,40.4],
      [-124.1,41]]]],
    ["WA","Washington",[[[-124.7,48.4],[-123.1,48.15],[-122.75,49],[-117.03,49],[-117.03,46.42],[-116.92,46],[-119,46],
      [-120.9,45.65],[-122.2,45.6],[-122.8,45.9],[-123.2,46.15],[-123.9,46.25],[-124.05,46.6],[-124.1,47],[-124.4,47.8]]]],
    ["AZ","Arizona",[[[-114.05,37],[-109.05,37],[-109.05,31.33],[-111.07,31.33],[-114.81,32.49],[-114.72,32.72],[-114.5,33],
      [-114.7,33.4],[-114.4,34.1],[-114.6,34.3],[-114.63,35],[-114.6,35.6],[-114.74,36],[-114.3,36.1],[-114.05,36.2]]]]];
  const LEATHER=["#9b5f34","#7d4a2b","#b07a4a","#8a5532","#a66b3d","#6f4126"];
  // Two rows of three across the sky of the throw's picture (a 1000 by 1200 frame), north up with it, clear of the
  // moon and the horse.
  const PATCH_AT=[26,22],PATCH_SIZE=152,PATCH_STEP=[176,176];
  const patches=(ctx,w,h)=>{
    const seed=BL.math.mulberry32(512);
    ctx.save();ctx.scale(w/1000,h/1200);ctx.translate(...PATCH_AT);
    STATES.forEach(([code,,rings],k)=>{
      const cx=PATCH_STEP[0]*(k%3+.5),cy=PATCH_STEP[1]*(Math.floor(k/3)+.5);
      let lat=0,n=0;
      for(const ring of rings)for(const p of ring){lat+=p[1];n++;}
      const squeeze=Math.cos(lat/n*Math.PI/180),flat=rings.map(ring=>ring.map(([lo,la])=>[lo*squeeze,-la]));
      const box=pts=>pts.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[1e9,1e9,-1e9,-1e9]);
      const all=box(flat.flat()),scale=PATCH_SIZE/Math.max(all[2]-all[0],all[3]-all[1]);
      const pts=flat.map(ring=>ring.map(([x,y])=>[cx+(x-(all[0]+all[2])/2)*scale,cy+(y-(all[1]+all[3])/2)*scale]));
      const trace=(shrink=0)=>{
        ctx.beginPath();
        for(const ring of pts){
          const b=box(ring),mx=(b[0]+b[2])/2,my=(b[1]+b[3])/2,f=1-shrink/Math.max(b[2]-b[0],b[3]-b[1]);
          ring.forEach(([x,y],i)=>ctx[i?"lineTo":"moveTo"](mx+(x-mx)*f,my+(y-my)*f));ctx.closePath();
        }
      };
      // Sewn on and standing a little proud of the weave.
      ctx.save();ctx.shadowColor="rgba(20,12,6,.45)";ctx.shadowBlur=7;ctx.shadowOffsetX=2;ctx.shadowOffsetY=3;
      trace();ctx.fillStyle="#3a2213";ctx.fill();ctx.restore();
      const grad=ctx.createLinearGradient(cx-80,cy-80,cx+80,cy+80);
      grad.addColorStop(0,"#d7a26a");grad.addColorStop(.35,LEATHER[k]);grad.addColorStop(1,"#4e2d18");
      ctx.save();trace(4);ctx.fillStyle=grad;ctx.fill();ctx.clip();
      for(let i=0;i<260;i++){
        ctx.fillStyle=seed()<.5?"rgba(50,26,12,.22)":"rgba(240,200,150,.12)";
        ctx.fillRect(cx-90+seed()*180,cy-90+seed()*180,1.5+seed()*2,1.2+seed());
      }
      ctx.restore();
      ctx.save();trace(15);ctx.setLineDash([6,5]);ctx.lineWidth=2.4;ctx.lineCap="round";ctx.strokeStyle="#eadbb8";ctx.stroke();ctx.restore();
      // The code sits on the first ring's centroid by area.
      let area=0,tx=0,ty=0;
      pts[0].forEach(([x0,y0],i,ring)=>{
        const [x1,y1]=ring[(i+1)%ring.length],cross=x0*y1-x1*y0;area+=cross;tx+=(x0+x1)*cross;ty+=(y0+y1)*cross;
      });
      tx/=3*area;ty/=3*area;
      ctx.font="bold 32px Georgia, serif";ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle="rgba(255,226,180,.38)";ctx.fillText(code,tx+1.5,ty+2);
      ctx.fillStyle="#3c2112";ctx.fillText(code,tx,ty);
    });
    ctx.restore();
  };
  const sleeve=M.cached(()=>{
    const w=.32,g=M.panel({w,h:w,tilesX:1,tilesY:1,color:"#ddcaa0"});
    const canvas=document.createElement("canvas");canvas.width=canvas.height=384;
    const c=canvas.getContext("2d");c.fillStyle="#dfd2b4";c.fillRect(0,0,384,384);
    c.strokeStyle="#9a8868";c.strokeRect(14,14,356,356);
    c.lineWidth=2;c.strokeStyle="#6c776c";
    for(let i=0;i<3;i++){
      c.beginPath();c.moveTo(22,168+i*9);c.bezierCurveTo(72,150+i*7,108,97+i*20,174,143+i*13);
      c.bezierCurveTo(228,168+i*8,246,95+i*15,362,124+i*13);c.stroke();
    }
    for(let i=0;i<7;i++){
      c.beginPath();c.moveTo(228+i*3,163);c.bezierCurveTo(8+i*5,195,340-i*8,218,49+i*13,277);c.stroke();
    }
    c.strokeStyle="#67513d";c.lineWidth=5;c.beginPath();c.moveTo(94,227);c.quadraticCurveTo(167,179,246,210);c.stroke();
    for(let i=0;i<8;i++){const x=97+i*20,y=225-23*Math.sin(i*Math.PI/7)-2*i;c.fillRect(x,y-14,3,17);}
    c.lineWidth=2;c.beginPath();c.moveTo(95,211);c.quadraticCurveTo(167,163,246,194);c.stroke();
    c.fillStyle="#493f35";c.font="italic 29px Georgia, serif";c.textAlign="center";c.fillText("Pendleton",192,326);
    g.imageSurface={canvas,rect:[-w/2,-w/2,w,w],smooth:true,version:1};return g;
  });
  // Traverse City: a little Great Lakes lighthouse on a stone plinth, white with red bands, its lantern turning. The
  // lamp swells with the morning light each day, as the rose window's sun does.
  const LIGHT_Y=.505;
  const lighthouse=M.cached(()=>{
    const turn=(profile,color,emissive=0)=>M.lathe({profile,segments:28,color,emissive});
    const tower=(y0,y1,color)=>{const r=y=>.085-(y-.06)*.06;return turn([[0,y0],[r(y0),y0],[r(y1),y1],[0,y1]],color);};
    const parts=[turn([[0,0],[.14,0],[.14,.04],[.125,.06],[0,.06]],"#8f8a82"),
      tower(.06,.17,"#f1ece2"),tower(.17,.21,"#b8322a"),tower(.21,.33,"#f1ece2"),tower(.33,.37,"#b8322a"),tower(.37,.46,"#f1ece2"),
      turn([[0,.46],[.084,.46],[.084,.472],[0,.472]],"#2d2a2c"),
      turn([[0,.540],[.066,.540],[0,.598]],"#b8322a"),turn([[0,.596],[.008,.6],[.006,.614],[0,.618]],"#2d2a2c")];
    for(let i=0;i<6;i++){const a=i*Math.PI/3;parts.push(M.beam(.048*Math.cos(a),.472,.048*Math.sin(a),.048*Math.cos(a),.54,.048*Math.sin(a),.006,"#2d2a2c"));}
    for(let i=0;i<12;i++){const a=i*Math.PI/6;parts.push(M.beam(.08*Math.cos(a),.472,.08*Math.sin(a),.08*Math.cos(a),.494,.08*Math.sin(a),.004,"#2d2a2c"));}
    parts.push(M.box({w:.034,h:.06,d:.01,color:"#5a3e2c",offset:{x:0,y:.09,z:.081}}),
      M.box({w:.016,h:.024,d:.008,color:"#3a4a5a",offset:{x:0,y:.27,z:.072}}),M.box({w:.016,h:.024,d:.008,color:"#3a4a5a",offset:{x:0,y:.41,z:.066}}));
    return M.merge(...parts);
  });
  const lamp=M.cached(()=>M.lathe({profile:[[0,-.03],[.026,-.022],[.03,0],[.026,.022],[0,.03]],segments:16,color:"#ffe6a0",emissive:1}));
  const lens=M.cached(()=>M.merge(...[-1,1].map(s=>M.box({w:.006,h:.034,d:.026,color:"#fff6d0",emissive:1,offset:{x:s*.034,y:0,z:0}}))));
  // Petoskey stones from Grand Traverse Bay in a glazed dish before the lighthouse. Dry they are plain grey pebbles;
  // wet them and the six-sided fossil coral shows, then they dry back. One canvas paints both at `wet` 0 to 1.
  const STONES=[[-.062,.036,.052,.040],[.048,.052,.046,.036],[.058,-.040,.050,.041],[-.040,-.052,.044,.036],[.0,.0,.040,.034]];
  const STONE_R=.13,STONE_PX=256,WET_STEPS=16;
  const stoneCanvas=()=>{const c=document.createElement("canvas");c.width=c.height=STONE_PX;return c;};
  const paintStones=(c,wet)=>{
    const ctx=c.getContext("2d"),px=v=>(v/STONE_R*.5+.5)*STONE_PX,rand=BL.math.mulberry32(4471);
    ctx.fillStyle="#8a8478";ctx.fillRect(0,0,STONE_PX,STONE_PX);
    const mix=(a,b)=>a.map((v,i)=>Math.round(v+(b[i]-v)*wet));
    for(const [x,y,rx,ry] of STONES){
      const cx=px(x),cy=px(-y),ex=rx/STONE_R*.5*STONE_PX,ey=ry/STONE_R*.5*STONE_PX;
      ctx.save();ctx.beginPath();ctx.ellipse(cx,cy,ex,ey,0,0,2*Math.PI);ctx.clip();
      const base=mix([190,184,172],[120,112,98]);ctx.fillStyle=`rgb(${base})`;ctx.fillRect(cx-ex,cy-ey,2*ex,2*ey);
      for(let i=0;i<40;i++){const g=mix([205,199,188],[132,124,110]);ctx.fillStyle=`rgba(${g},.5)`;ctx.beginPath();
        ctx.arc(cx+(rand()-.5)*2*ex,cy+(rand()-.5)*2*ey,1+rand()*3,0,2*Math.PI);ctx.fill();}
      if(wet>0){
        // The corallites: six-sided cells with pale walls, a dark eye and fine rays out to the walls.
        ctx.globalAlpha=wet;const cell=7.5,h=cell*Math.sqrt(3);
        for(let row=-6;row<=6;row++)for(let col=-6;col<=6;col++){
          const hx=cx+col*cell*1.5,hy=cy+row*h+(col%2?h/2:0);
          if(Math.hypot((hx-cx)/ex,(hy-cy)/ey)>1.15)continue;
          ctx.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;ctx.lineTo(hx+cell*Math.cos(a),hy+cell*Math.sin(a));}
          ctx.closePath();ctx.fillStyle="#6e6556";ctx.fill();ctx.strokeStyle="#d9ccb1";ctx.lineWidth=1.4;ctx.stroke();
          ctx.strokeStyle="rgba(214,201,176,.55)";ctx.lineWidth=.6;
          for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6;ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+cell*.8*Math.cos(a),hy+cell*.8*Math.sin(a));ctx.stroke();}
          ctx.fillStyle="#2f2a24";ctx.beginPath();ctx.arc(hx,hy,cell*.26,0,2*Math.PI);ctx.fill();
        }
        // The water's gloss along the top of each stone.
        ctx.globalAlpha=.35*wet;ctx.fillStyle="#ffffff";ctx.beginPath();ctx.ellipse(cx-ex*.25,cy-ey*.35,ex*.45,ey*.16,-.3,0,2*Math.PI);ctx.fill();
        ctx.globalAlpha=1;
      }
      ctx.restore();
    }
  };
  const stones=M.cached(()=>{
    const g=M.geometry(),white=[255,255,255];
    for(const [x,y,rx,ry] of STONES){
      const rings=6,sides=18,top=Math.min(rx,ry)*.55,ids=[];
      for(let i=0;i<=rings;i++){
        const phi=i/rings*Math.PI/2,row=[];
        for(let j=0;j<sides;j++){const t=j/sides*2*Math.PI;row.push(M.pushVert(g,x+rx*Math.sin(phi)*Math.cos(t),y+ry*Math.sin(phi)*Math.sin(t),top*Math.cos(phi)));}
        ids.push(row);
      }
      for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const k=(j+1)%sides;M.face(g,[ids[i][j],ids[i+1][j],ids[i+1][k],ids[i][k]],white,{emissive:.12});}
    }
    g.smooth=true;g.castShadow=false;return g;
  });
  const dish=M.cached(()=>M.lathe({profile:[[0,0],[.12,0],[.16,.012],[.175,.045],[.165,.05],[.15,.022],[0,.018]],segments:36,color:"#3f6f8c"}));
  const stoneNote=["Petoskey stones, from Grand Traverse Bay.",
    "Dry, they look like plain grey pebbles. Wet them, and you can see tiny six-sided corals that lived in a warm sea here long, long ago, before there were any people at all."];
  const plank=(x,y,z,w,h,d,color)=>M.bevelBox({w,h,d,color,bevel:.004,offset:{x,y,z}});
  // Larkspur inlaid on the outer face of the left pier: a leaning stem, two leaves, and violet florets shrinking up
  // the spike.
  const sprig=()=>{
    const x=-.23-.0555,parts=[M.beam(x,.034,.012,x,.122,-.006,.0045,"#5f8a4e"),
      M.beam(x,.046,.010,x,.066,.034,.004,"#6f9a5a"),M.beam(x,.052,.009,x,.070,-.020,.004,"#6f9a5a")];
    const violets=["#9a7fe0","#b9a0f0","#8a6fd8","#c9adf5","#a58be8"];
    for(let f=0;f<6;f++){
      const t=f/5,y=.068+t*.052,z=.0075-t*.012,size=.0135-f*.0013;
      for(const side of [-1,1])parts.push(M.box({w:.002,h:size*.8,d:size*.7,color:violets[(f+(side>0?1:0))%5],emissive:.3,offset:{x,y,z:z+side*size*.42}}));
      parts.push(M.box({w:.0024,h:size*.34,d:size*.34,color:"#efe6ff",emissive:.3,offset:{x,y,z}}));
    }
    return M.merge(...parts);
  };
  const piers=M.cached(()=>M.merge(...[-1,1].flatMap(s=>[
    plank(s*.23,.065,0,.11,.13,.17,"#ba8d58"),plank(s*.23,.015,0,.146,.03,.195,"#9c7048")
  ]),sprig()));
  const span=M.cached(()=>{
    const p=[],height=x=>.013+.066*(1-(x/.265)**2);
    for(let i=0;i<12;i++){
      const x=-.265+(i+.5)*.53/12;
      p.push(M.moved(M.turnedZ(plank(0,0,0,.046,.025,.166,i%3===1?"#cba477":"#bc9366"),Math.atan(-1.88*x)),x,height(x),0));
    }
    for(const s of [-1,1]){
      for(let i=0;i<=4;i++){
        const x=-.25+i*.125,y=height(x);
        p.push(plank(x,y+.035,s*.073,.012,.07,.012,"#935e39"));
        if(i<4)p.push(M.beam(x,y+.069,s*.073,x+.125,height(x+.125)+.069,s*.073,.012,"#a36d45"));
      }
    }
    p.push(plank(0,.174,-.074,.035,.049,.032,"#edb453"),plank(0,.201,-.074,.045,.009,.041,"#775534"));
    return M.merge(...p);
  });
  const bridgeShade=M.cached(()=>{
    const w=.68,h=.62,g=M.panel({w,h,tilesX:1,tilesY:1,color:"#594936"});
    const canvas=document.createElement("canvas");canvas.width=240;canvas.height=180;
    const c=canvas.getContext("2d");c.fillStyle="rgba(32,24,23,.34)";c.filter="blur(3px)";
    c.beginPath();c.moveTo(23,172);c.lineTo(23,86);c.quadraticCurveTo(120,16,217,86);
    c.lineTo(217,172);c.lineTo(184,172);c.lineTo(184,111);c.quadraticCurveTo(120,71,56,111);c.lineTo(56,172);c.fill();
    g.imageSurface={canvas,rect:[-w/2,-h/2,w,h],smooth:true,blend:"alpha",soft:true,version:1};g.castShadow=false;return g;
  });
  const install=(room,r,kit,items,blanket)=>{
    const {add,item}=kit,seat=BL.pokerLoungeStone.seatZ(r);
    add(room,garden(),gardenX,.036,gardenZ(seat));
    const jacket=add(room,sleeve(),-BL.pokerLoungeStone.sideTableX-.22,
      BL.pokerLoungeStone.sideTableTop+.167,BL.pokerLoungeStone.sideTableZ(r)-.29);
    jacket.rotation.x=-.19;jacket.rotation.y=.16;
    items.push({title:"The leather state patches",node:blanket,anchor:blanket.parent.position,reach:.76,
      open:ui=>ui.element("p",STATES.map(s=>s[1]).join(", ")+".")});
    const tower=add(room,lighthouse(),-BL.pokerLoungeStone.sideTableX-1.02,.037,BL.pokerLoungeStone.sideTableZ(r)+.12);
    tower.scale.x=tower.scale.y=tower.scale.z=1.5;
    const beacon=add(tower,lamp(),0,LIGHT_Y,0),flash=add(tower,lens(),0,LIGHT_Y,0);
    // The stones wet on Action and dry back after a while; once wet, Action reads them (`act`, `actLabel`).
    const bowl=item("Petoskey stones",dish(),-BL.pokerLoungeStone.sideTableX-1.02,.037,BL.pokerLoungeStone.sideTableZ(r)+.58,
      ui=>{for(const line of stoneNote)ui.element("p",line);});
    const stoneGeo=stones(),pebbles=add(bowl,stoneGeo,0,.02,0);pebbles.rotation.x=-Math.PI/2;
    let wet=0,wetFor=0,shownWet=-1;
    const stoneCanvasEl=typeof document==="undefined"?null:stoneCanvas();
    const showWet=()=>{
      const step=Math.round(wet*WET_STEPS);
      if(!stoneCanvasEl || step===shownWet)return;
      shownWet=step;paintStones(stoneCanvasEl,step/WET_STEPS);
      if(!stoneGeo.imageSurface)stoneGeo.imageSurface={canvas:stoneCanvasEl,rect:[-STONE_R,-STONE_R,2*STONE_R,2*STONE_R],smooth:true,version:1};
      else stoneGeo.imageSurface.version++;
    };
    showWet();
    const stoneProp=items[items.length-1];
    stoneProp.actLabel=()=>wet<.5?"WET THE STONES":null;
    stoneProp.act=()=>{if(wet>=.5)return null;wetFor=24;return "The stones come alive: tiny six-sided corals, millions of years old.";};
    const x=-.78,z=seat-3.32,feet=item("The wooden bridge",piers(),x,.037,z,null);
    const prop=items[items.length-1],arch=add(feet,span()),shade=add(feet,bridgeShade(),0,.002,.29);
    shade.rotation.x=-Math.PI/2;shade.rotation.z=Math.PI;
    let from=0,to=0,age=1,onLand=null;
    const pose=u=>{
      arch.position.z=.23*(1-u);arch.position.y=.014+.12*u+.095*Math.sin(Math.PI*u);
      arch.rotation.y=-.31*(1-u);shade.visible=u>.02;shade.scale.y=Math.max(.02,u);shade.position.z=.29*u;
    };
    pose(0);prop.extraTarget=arch;prop.reach=1.05;
    prop.use=land=>{if(age<1)return false;from=to;to=1-to;age=0;onLand=land;return true;};
    prop.built=()=>to===1;
    let sweep=0;
    return (dt,calm,silent=false)=>{
      if(!calm){
        const light=BL.pokerBirthSky.light(Date.now());
        sweep=(sweep+dt*(.7+.5*light))%tau;flash.rotation.y=sweep;
        beacon.glow=flash.glow=.8+1.2*light;beacon.scale.x=beacon.scale.y=beacon.scale.z=1+.25*light;
        // Wetting takes a moment to soak in; drying takes longer.
        if(wetFor>0){wetFor-=dt;wet=Math.min(1,wet+dt/.6);}
        else if(wet>0)wet=Math.max(0,wet-dt/20);
        showWet();
      }
      if(age>=1)return;
      age=calm?1:Math.min(1,age+dt/.94);
      const t=age*age*(3-2*age);pose(from+(to-from)*t);
      if(age===1){if(!silent)onLand(to);onLand=null;}
    };
  };
  BL.pokerLoungeFamily={install,patches,flightStops,gardenX,gardenZ};
})();
