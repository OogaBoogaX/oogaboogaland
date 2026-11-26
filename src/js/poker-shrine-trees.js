// Old gold-barked trees grown around the chapter relics. Local +Z faces the aisle.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,pi=Math.PI,tau=2*pi;
  const bark=["#624a37","#70553e","#795e47","#83684c","#8d7052","#977956"].map(c=>BL.math.hexToRgb(c));
  const lining=["#6e4328","#513021","#301e18","#251916","#4e2819"].map(c=>BL.math.hexToRgb(c));
  const ember=["#99552d","#be6833","#b95826","#a34c22"].map(c=>BL.math.hexToRgb(c));
  // Shades of Bitcoin orange (#f7931a): darkened toward the inner leaves, tinted toward the sunlit tips.
  const leafTones=["#995b10","#b76d13","#d78017","#f7931a","#f8a23a","#f9b15a","#fac07a"].map(c=>BL.math.hexToRgb(c));
  const relicY=.425, plaqueY=.21, trunkGirth=1.65, branchGrowth=1.5;
  // The bole uses a shared three-way bark atlas. Short broken ridges stand proud of the darker fissures.
  const barkAtlas=M.cached(()=>{
    const tile=384,canvas=document.createElement("canvas");
    canvas.width=tile*3;canvas.height=tile;
    const c=canvas.getContext("2d"),rand=BL.math.mulberry32(695419);
    c.fillStyle="#decdb6";c.fillRect(0,0,canvas.width,tile);
    c.lineCap="round";
    for(let panel=0;panel<3;panel++){
      c.save();c.translate(panel*tile,0);c.beginPath();c.rect(0,0,tile,tile);c.clip();
      for(let pass=0;pass<3;pass++)for(let i=0;i<450;i++){
        const x=rand()*tile,y=(rand()*1.25-.2)*tile,h=(10+rand()*64)/(1+pass),w=(2+rand()*6)/(1+pass);
        const dx=2.2*Math.sin(y*.024+x*.038),offset=rand()*5-2.5;
        for(const edge of [0,1]){
          c.strokeStyle=edge?"rgba(254,236,204,.30)":"rgba(89,69,54,.21)";c.lineWidth=edge?w*.34:w;
          const u=x+edge*w*.56;c.beginPath();c.moveTo(u,y);
          c.bezierCurveTo(u+dx,y+h*.31,u-offset,y+h*.82,u+offset*.5,y+h);c.stroke();
        }
      }
      c.restore();
    }
    return canvas;
  });
  const path=(a,b,c,d)=>t=>{
    const u=1-t,h=u*u*u,i=3*t*u*u,j=3*t*t*u,k=t*t*t;
    return {x:h*a.x+i*b.x+j*c.x+k*d.x,y:h*a.y+i*b.y+j*c.y+k*d.y,z:h*a.z+i*b.z+j*c.z+k*d.z};
  };
  const point=(x,y,z)=>({x,y,z});
  const polar=(a,y,rx,rz)=>point(Math.sin(a)*rx,y,Math.cos(a)*rz);
  const grow=(parts,curve,base,tip,rings,sides,grain)=>{
    const g=M.tube({path:curve,radius:t=>tip+(base-tip)*(1-t)*(1-.18*t),rings,segments:sides,colorFn:()=>"#936539",emissive:.14});
    for(let i=0;i<g.faces.length;i++){
      const rib=(i%sides)/sides*tau;
      g.faces[i].color=bark[Math.round(2.5+1.4*Math.cos(rib+grain)+.65*Math.cos(3*rib+grain))];
    }
    parts.push(g);
  };
  // `tones` replaces the Bitcoin-orange leaves for one tree (the cherry by the lighthouse, in blossom pinks).
  const createSteps=function* (index,lite,limits,slice,tones=leafTones){
    const rand=BL.math.mulberry32(0x6e6f7400+index*571),phase=rand()*tau,lean=(rand()-.5)*.065;
    const trunk=M.geometry(),cavity=M.geometry(),leaves=M.geometry(),limbs=[],underground=[];
    leaves.sway=.018;
    const mouthBottom=.286,mouthTop=.59,collar=1.53+.10*rand(),crook=(rand()-.5)*.39;
    // The display opening keeps its width as the wood grows around it.
    const gap=y=>y<=mouthBottom||y>=mouthTop?0:Math.asin(Math.sin(.90*Math.pow(Math.sin(pi*(y-mouthBottom)/(mouthTop-mouthBottom)),.69))/trunkGirth);
    const surface=(y,a)=>{
      const foot=.116*Math.exp(-y*13),bulge=.025*Math.exp(-80*(y-relicY)**2);
      const taper=Math.max(.006,1-.43*y-.43*Math.max(0,(y-.80)/(collar-.80)));
      const bow=Math.max(0,y-.46);
      const flute=1+.067*Math.cos(7*a-1.8*y+phase)+.03*Math.cos(15*a+2*y+phase*.6);
      return point(lean*Math.sin(y*3)+crook*bow*bow+Math.sin(a)*(.184+foot+bulge)*flute*taper*trunkGirth,y,
        -.035*y+.105*bow*Math.sin(2.8*bow)+Math.cos(a)*(.17+.77*foot+bulge)*flute*taper*trunkGirth);
    };
    const angle=(y,u)=>gap(y)+(tau-2*gap(y))*u;
    const heights=[0,.035,.083,.14,.21,.25,mouthBottom,.30,.321,.35,.39,.432,.47,.51,.55,.575,mouthTop,.64,.72,.83,.96,1.10,1.22,1.35,1.46,collar];
    const segments=lite?24:44,rimR=[],rimL=[],flareY=.21;
    const fibreAt=(a,y)=>bark[Math.round((.5+.31*Math.cos(8*a-2*y+phase)+.18*Math.cos(13*a+y+phase*.6))*5)];
    for(let k=0;k<heights.length;k++){
      const y=heights[k];
      for(let j=0;j<=segments;j++){
        const a=angle(y,j/segments),p=surface(y,a),v=M.pushVert(trunk,p.x,p.y,p.z);
        if(y>=mouthBottom && y<=mouthTop){
          if(!j)rimR.push(p);
          if(j===segments && gap(y)>0)rimL.push(p);
        }
        if(!j||y<=flareY)continue;
        M.face(trunk,[v-segments-2,v-segments-1,v,v-1],fibreAt(a,y),{emissive:.18});
      }
    }
    // Turn the live edge back into the trunk. The relic sits between the lip and the dark heartwood.
    const rim=rimR.concat(rimL.reverse()),recess=[0,.12,.36,.72,.96];
    for(let k=0;k<recess.length;k++){
      const t=recess[k];
      for(let j=0;j<rim.length;j++){
        const p=rim[j],s=1-t;
        M.pushVert(cavity,p.x*s,relicY+(p.y-relicY)*s,p.z-(p.z+.11)*Math.pow(t,.54));
      }
      if(!k)continue;
      for(let j=0;j<rim.length;j++){
        const a=(k-1)*rim.length+j,b=(k-1)*rim.length+(j+1)%rim.length;
        // Ember light grazes the low inner lip and catches the grain deeper in the pocket.
        const warm=Math.max(0,Math.min(1,(relicY-rim[j].y)*5+.20+.075*Math.cos(j+phase)));
        const from=lining[k-1],to=ember[k-1],colour=from.map((v,i)=>Math.round(v+(to[i]-v)*warm*.68));
        M.face(cavity,[a,b,b+rim.length,a+rim.length],colour,{emissive:.18+.22*warm});
      }
    }
    M.face(cavity,rim.map((_,j)=>(recess.length-1)*rim.length+j),lining[4],{emissive:.44});
    // In the two end bays, growth near the glass curves back into the grove.
    // A quarter circle eases from growing towards a wall to growing along it.
    const bendRadius=.32;
    const aroundWalls=p=>{
      const back=-p.z-limits.back+bendRadius;
      if(back>0){
        const a=Math.min(back/bendRadius,pi/2);
        p.z=-limits.back+bendRadius*(1-Math.sin(a));
        const along=limits.left<limits.right?1:-1;
        p.x+=along*(bendRadius*(1-Math.cos(a))+Math.max(0,back-pi*bendRadius/2));
      }
      const side=p.x<0?-1:1,limit=side<0?limits.left:limits.right;
      const beyond=side*p.x-limit+bendRadius;
      if(beyond>0){
        const a=Math.min(beyond/bendRadius,pi/2);
        p.x=side*(limit-bendRadius*(1-Math.sin(a)));
        p.z+=bendRadius*(1-Math.cos(a))+Math.max(0,beyond-pi*bendRadius/2);
      }
      return p;
    };
    // The buttresses break into crooked laterals, skirt patches of turf, then
    // reappear as smaller root ridges before the deep roots descend.
    const rootRand=BL.math.mulberry32(89431+index*733);
    // Paint the height of each tapered root into one ground surface so shoulders
    // and forks meet as continuous wood. Negative heights disappear under turf.
    const soil=-.018, extent=1.65, grid=lite?128:192, step=2*extent/(grid-1);
    const relief=new Float32Array(grid*grid).fill(soil);
    const ridge=(curve,base,tip)=>{
      let prev=curve(0);
      for(let i=1;i<=20;i++){
        const t=i/20,p=curve(t),dx=p.x-prev.x,dz=p.z-prev.z,length2=dx*dx+dz*dz;
        const width=tip+(base-tip)*(1-(i-1)/20),reach=width*1.85;
        const col=x=>Math.floor((x+extent)/step);
        for(let z=Math.max(0,col(Math.min(prev.z,p.z)-reach));z<=Math.min(grid-1,col(Math.max(prev.z,p.z)+reach));z++){
          for(let x=Math.max(0,col(Math.min(prev.x,p.x)-reach));x<=Math.min(grid-1,col(Math.max(prev.x,p.x)+reach));x++){
            const rx=x*step-extent-prev.x,rz=z*step-extent-prev.z;
            const u=Math.max(0,Math.min(1,(rx*dx+rz*dz)/(length2||1)));
            const radius=width-(base-tip)*u/20;
            const d=((rx-u*dx)**2+(rz-u*dz)**2)/(1.85*radius)**2;
            if(d>=1)continue;
            const crest=prev.y+(p.y-prev.y)*u+radius*.76;
            const at=z*grid+x;
            relief[at]=Math.max(relief[at],soil+(crest-soil)*(1-d)**2);
          }
        }
        prev=p;
      }
    };
    const ground=(x,z)=>{
      const u=(x+extent)/step,v=(z+extent)/step,i=Math.floor(u),j=Math.floor(v);
      if(i<0||j<0||i>=grid-1||j>=grid-1)return soil;
      const k=j*grid+i,f=u-i,h=v-j;
      return (1-h)*((1-f)*relief[k]+f*relief[k+1])+h*((1-f)*relief[k+grid]+f*relief[k+grid+1]);
    };
    const rootCount=8;
    for(let j=0;j<rootCount;j++){
      const a=phase+(j+.3*rand())*tau/rootCount,bend=(rand()-.5)*1.06;
      const reach=.88+.36*rand(),end=aroundWalls(polar(a+bend,-.008,reach,reach*.88));
      const foot=polar(a,.14+.16*rand(),.11,.09);
      if(Math.cos(a)>.70)foot.y*=.58;
      const shoulder=aroundWalls(polar(a+bend*.28,.045+.028*rootRand(),reach*.52,reach*.45));
      const knuckle=path(foot,polar(a-.10,foot.y*.74,.29,.25),
        polar(a+bend*.16,.07,reach*.38,reach*.31),shoulder);
      ridge(knuckle,.146,.076);
      const runner=path(shoulder,aroundWalls(polar(a+bend*.40,.019,reach*.72,reach*.60)),
        aroundWalls(polar(a+bend+.16,.066,reach*.81,reach*.69)),end);
      ridge(runner,.076,.007);
      for(const side of [-1,1]){
        const parent=side<0?knuckle:runner,t=side<0?.78:.46,fork=parent(t),b=a+bend+side*(.29+.24*rootRand());
        const toe=aroundWalls(polar(b,-.018,reach*(.95+.25*rootRand()),reach*.84));
        const lateral=path(fork,parent(t+.13),
          aroundWalls(polar(b-side*.13,.045,reach*.91,reach*.72)),toe);
        ridge(lateral,side<0?.050:.040,.004);
        const split=lateral(.62),tip=aroundWalls(polar(b+side*.28,-.014,reach*1.05,reach*.92));
        ridge(path(split,lateral(.76),
          aroundWalls(polar(b+side*.18,.025,reach*.90,reach*.82)),tip),.028,.003);
      }
      const depth=3.8+rand()*3.1,tip=polar(a+.45,-depth,reach+.38,reach+.22);
      const sink=path(end,polar(a+bend,-.40,reach*1.07,reach*.85),polar(a-.30,-depth*.51,reach*.7,reach*.64),tip);
      grow(underground,sink,.019,.003,8,5,j);
      const from=sink(.36);
      grow(underground,path(from,point(from.x,-depth*.44,from.z+.12),polar(a+.6,-depth*.64,reach,reach),polar(a+.85,-depth*.84,reach*1.38,reach)),.018,.002,5,4,j);
    }
    const roots=M.geometry(),spokes=segments*(lite?4:5),rows=lite?39:57;
    for(let j=0;j<spokes;j++){
      const u=j*segments/spokes,k=Math.floor(u),f=u-k,a=tau*j/spokes;
      // Begin on the exact polygon edge of the bole, including its lean and flutes.
      const start=surface(flareY,tau*k/segments),end=surface(flareY,tau*(k+1)/segments);
      const x=start.x+(end.x-start.x)*f,z=start.z+(end.z-start.z)*f;
      const sn=Math.sin(a),cs=Math.cos(a),r=Math.hypot(x,z),low=surface(flareY-.01,a);
      const above=surface(flareY,a);
      const fall=Math.max(.06,(Math.hypot(low.x,low.z)-Math.hypot(above.x,above.z))/.01*(flareY-soil));
      for(let i=0;i<=rows;i++){
        const distance=(extent-r)*(i/rows)**1.32,px=x+sn*distance,pz=z+cs*distance;
        const base=soil+(flareY-soil)*Math.exp(-distance/fall);
        const weight=1-Math.exp(-((distance/.092)**2));
        const y=base+weight*(ground(px,pz)-soil);
        M.pushVert(roots,px,y,pz);
      }
    }
    for(let j=0;j<spokes;j++)for(let i=0;i<rows;i++){
      const a=j*(rows+1)+i,b=((j+1)%spokes)*(rows+1)+i;
      if(Math.max(roots.verts[3*a+1],roots.verts[3*b+1],roots.verts[3*a+4],roots.verts[3*b+4])<-.003)continue;
      M.face(roots,[a,a+1,b+1,b],fibreAt(tau*(j+1)/spokes,roots.verts[3*a+1]),{emissive:.18});
    }
    roots.smooth=true;roots.receiveProjection=true;
    grow(underground,path(point(0,.04,-.10),point(.21,-1.25,-.25),point(-.42,-3.85,.32),
      point(lean*11,-6.4-rand(),-.28)),.39,.009,15,8,index);
    // Stretch each scaffold about its own trunk junction. Its twigs and leaf stems
    // follow the same transform, so neighbouring crowns meet above the grass.
    let junction,displayBough=null;
    const crown=(x,y,z)=>aroundWalls(point(
      junction.x+branchGrowth*(1.03*Math.tanh(x/1.03)-junction.x),
      junction.y+branchGrowth*(y-junction.y),
      junction.z+branchGrowth*((z<0?.76*Math.tanh(z/.76):1.47*Math.tanh(z/1.47))-junction.z)));
    const offset=(p,a,length,rise)=>point(p.x+Math.sin(a)*length,p.y+rise,p.z+Math.cos(a)*length);
    const twigRand=BL.math.mulberry32(17281+index*733);

    const branch=(curve,radius,endRadius,rings,sides,seed)=>{
      const shaped=t=>{const p=curve(t);return crown(p.x,p.y,p.z);};
      grow(limbs,shaped,radius,endRadius,rings,sides,seed);
    };
    // Alternating leaves on arching young shoots. Blades are angled independently so
    // dappled daylight can pass through both a single spray and the spaces between boughs.
    let sprayIndex=0;
    const foliage=(tip,heading,light)=>{
      // Nine sprays per flush; alternate four and five in the sparse Canvas crown.
      const density=lite?4+sprayIndex++%2:9;
      for(let s=0;s<density;s++){
        const a=heading+(twigRand()-.5)*3.9,span=.095+.14*twigRand(),lift=(twigRand()-.48)*.22;
        const origin=offset(tip,a,twigRand()*.045,(twigRand()-.5)*.075);
        const end=offset(origin,a,span,lift-.035),shoot=path(origin,offset(origin,a,.05,lift*.65),
          offset(end,a,-.045,.065),end);
        if(s%3===0)branch(shoot,.003,.0006,3,3,s);
        const pairs=lite?3:4;
        for(let j=0;j<2*pairs+1;j++){
          const u=.12+.87*j/(2*pairs),birth=shoot(u),base=crown(birth.x,birth.y,birth.z),angle=a+(j%2?-1:1)*(.64+.69*twigRand());
          const len=(.046+.038*twigRand())*(lite?1.32:1),w=len*(.24+.09*twigRand()),dy=len*(twigRand()-.60);
          const blade=offset(base,angle,len,dy),belly=offset(base,angle,len*.47,dy*.45+.006);
          const left=offset(belly,angle-pi/2,w,.005),right=offset(belly,angle+pi/2,w,-.005);
          const ids=[base,right,blade,left].map(p=>M.pushVert(leaves,p.x,p.y,p.z));
          const band=Math.min(6,Math.max(1,Math.floor(light+twigRand()*3)));
          M.face(leaves,ids,tones[band],{emissive:.30});M.face(leaves,ids.slice().reverse(),tones[band-1],{emissive:.24});
        }
      }
    };
    for(let j=0;j<8;j++){
      yield* BL.buildTasks.pause(slice);
      const upright=j>=6,a=phase+j*2.39996+(rand()-.5)*.42;
      const startY=upright?1.16+.10*(j-6):.56+j*.084+.04*rand();
      const far=surface(startY,a),near=surface(startY,a+pi);
      const root=point((far.x+near.x)*.5,startY,(far.z+near.z)*.5),sweep=(rand()-.5)*.94;
      junction=root;
      const length=upright?.32+.32*rand():.86+.65*rand(),rise=upright?.47+.21*rand():.25+.36*rand();
      const end=offset(root,a+sweep,length,rise);
      const leader=path(root,offset(root,a,.08+.11*rand(),rise*.68),
        offset(end,a+sweep,-length*.46,-rise*.13-.11),end);
      branch(leader,(.086-.006*j)*1.34,.012,12,lite?7:11,j);
      // Use the aisle-facing lower bough for a display perch, clear of the relic below.
      if(!upright){
        const tip=leader(.70),outer=crown(tip.x,tip.y,tip.z);
        if(!displayBough || outer.z>displayBough.z)displayBough=outer;
      }
      for(let k=0;k<4;k++){
        const t=.25+k*.215+(rand()-.5)*.06,q=leader(t),side=k%2?1:-1,b=a+sweep+side*(.43+.61*rand());
        const run=.26+.25*rand(),up=.12+.24*rand(),finish=offset(q,b,run,up);
        const fork=path(q,offset(q,a+sweep,.10,up*.24),offset(finish,b,-.09,-.10),finish);
        branch(fork,.045+(1-t)*.031,.005,7,lite?5:7,j+k);
        foliage(finish,b,2.35+(finish.y-1));
        for(let n=0;n<4;n++){
          const v=.29+n*.22,q2=fork(v),c=b+(n%2?-1:1)*(.48+.82*rand());
          const reach=.11+.17*rand(),dy=(rand()-.22)*.19,end2=offset(q2,c,reach,dy);
          const shoot=path(q2,offset(q2,b,.058,.062),offset(end2,c,-.065,.048),end2);
          branch(shoot,.012+.007*(1-v),.0018,4,4,n);
          const light=1.65+(end2.y-1)*2.2;
          foliage(end2,c,light);
          if(n%2===0)foliage(shoot(.38),c+(n?-1.25:1.25),light-.65);
        }
      }
    }
    // Dip beneath the leaf skirt so both birds can be seen from the aisle.
    // Outer boughs curl back toward their own trunk, keeping the pair in its bay.
    const {x,y,z}=displayBough;
    let side=Math.abs(x)>.48?-Math.sign(x):(index%2?1:-1);
    if(x+side*.66>limits.right || x+side*.66 < -limits.left)side=-side;
    const twig=path(displayBough,point(x,y-.18,z+.24),
      point(x+.12*side,y-.47,z+.52),point(x+.66*side,y-.35,z+.53));
    const base=.043,tip=.005;
    grow(limbs,twig,base,tip,16,7,index);
    const perches=[.46,.69,.86].map(t=>{
      const p=twig(t);
      p.y+=tip+(base-tip)*(1-t)*(1-.18*t);
      return p;
    });
    const plaqueFront=surface(plaqueY,0),relicFront=surface(relicY,gap(relicY));
    // The rectangular tablet bridges the ridged bark across its entire width and height.
    for(let j=-5;j<=5;j++)for(const y of [plaqueY-.029,plaqueY,plaqueY+.029])
      plaqueFront.z=Math.max(plaqueFront.z,surface(y,j*.10).z);
    const deep=M.merge(...underground);
    deep.castShadow=false;
    const wood=M.merge(...limbs);
    wood.smooth=true;wood.sway=.016;
    trunk.smooth=true;cavity.smooth=true;
    if(typeof document!=="undefined"){
      for(const g of [trunk,wood,cavity]){
        const bounds=BL.scene.boundsOf(g);
        g.imageSurface={canvas:barkAtlas(),version:1,atlas:true,atlasMin:bounds.min,atlasMax:bounds.max,rect:[0,0,1,1],smooth:true};
      }
    }
    if(trunk.imageSurface)roots.imageSurface=trunk.imageSurface;
    for(const g of [trunk,wood,leaves])g.receiveProjection=true;
    if(BL.compactGeometry?.enabled)for(const g of [leaves,roots,wood])BL.compactGeometry.pack(g,{immutable:true,renderOnly:true,precision:32});
    return {trunk,cavity,wood,leaves,roots,deep,plaqueFront,relicFront,perches};
  };
  BL.pokerShrineTrees={createSteps,grow,barkAtlas,relicY,plaqueY,trunkGirth};
})();
