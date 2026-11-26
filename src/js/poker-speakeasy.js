// Cabinet at the Whitepaper Bar and the joinery and cipher table behind it.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const brass = "#bd894d", copper = "#dd975c";
  const ink = "#28201f";
  const box = (x,y,z,w,h,d,color,emissive=0) => M.box({w,h,d,color,emissive,offset:{x,y,z}});
  const mark = (x,y,z,h) => M.moved(BL.factoryModels.smoothBitcoin(h,.024,copper,.55),x,y,z);
  const wallTiles=M.scopedMap();
  const wallTile=(left,bottom,right,top)=>{
    const key=[left,bottom,right,top].join(":");
    if(wallTiles.has(key))return wallTiles.get(key);
    const g=M.geometry();
    const corners=[[left,bottom],[right,bottom],[right,top],[left,top]];
    M.face(g,corners.map(([x,y])=>M.pushVert(g,x,y,0)),[255,255,253],{emissive:.38});
    g.castShadow=false;
    if(typeof CanvasRenderingContext2D!=="undefined")g.imageSurface=BL.pokerDamaskMap.marble();
    else g.faces[0].color=BL.math.hexToRgb("#fafaf7");
    wallTiles.set(key,g);return g;
  };
  const interior = (lite,w,d) => {
    const parts=[], a=w/2, wallZ=-d/2;
    for(const side of [-1,1]){
      for(const y of [.15,1.34])parts.push(box(side*(a-.19),y,0,.14,.075,d-.24,"#f3f2ed",.25));

    }
    // Staggered firebricks, a coal bed and a low grate inset into the marble surround.
    const bricks=["#54413a","#655146","#59453d","#5f4b40"];
    for(let row=0;row<12;row++)for(let i=0;i<(row%2?8:7);i++){
      const left=Math.max(-1.66,-1.66+(i-(row%2)*.5)*.475);
      const right=Math.min(1.66,-1.66+(i+1-(row%2)*.5)*.475);
      parts.push(box((left+right)/2,.43+row*.217,wallZ+.76,right-left-.014,.205,.065,bricks[(i+row*3)%4],.22));
    }
    parts.push(box(0,1.48,wallZ+.67,3.42,2.64,.09,"#443731",.12));
    parts.push(box(0,.35,wallZ+1,3.15,.14,.85,ink));
    for(let i=-4;i<=4;i++)parts.push(M.beam(i*.32,.37,wallZ+1.40,i*.32,.61,wallZ+.81,.042,brass));
    return M.merge(...parts);
  };
  const passCard = () => M.merge(box(0,0,0,.44,.29,.045,copper,.44),box(0,0,.025,.38,.232,.01,"#624232",.38),
    mark(0,0,.053,.17),...[-1,1].map(s=>box(s*.165,0,.039,.018,.16,.01,brass,.5)));
  const add = (parent,geometry,x=0,y=0,z=0) => {
    const n=S.createNode({geometry,position:{x,y,z}});S.addChild(parent,n);return n;
  };
  const bindings=["#633e30","#285048","#693e42","#9a7953","#373136"];
  const marble=BL.pokerMarble.mineralAtlas(()=>BL.pokerHearthMap,512,true);
  const shelf = (lite, x, z) => {
    const arch=BL.pokerLoungeDoor,half=arch.half,w=2*half,pivot=1.02;
    const shell=[],books=[],stone="#eee7d8",shadow="#918677";
    const finish=g=>{
      if(typeof Image!=="undefined")marble(g,[-half,0,-.3],[half,arch.crown(0),.3]);
      return g;
    };
    const root=S.createNode(),target=add(root,finish(M.turnedY(arch.surround(),Math.PI)),x,0,z);
    // An offset pivot keeps the heavy case balanced and the swing clear of the bar counter.
    const hinge=add(target,null,pivot,0,.07);
    const lip=.055,count=lite?12:18,step=(w-.24)/count,column=Math.floor(count*.6);
    const bookX=-half+.12+(column+.5)*step;
    for(const s of [-1,1]){
      for(let i=0;i<arch.course;i++){
        const a=arch.point(s,i),b=arch.point(s,i+1);
        shell.push(arch.prism([[a[0],.02],[b[0],.02],b,a],-.19,.16,"#aaa398"));
        shell.push(M.beam(a[0],a[1],.08,b[0],b[1],.08,.095,stone));
      }
      shell.push(box(s*(half-lip),arch.spring/2,.03,.10,arch.spring,.34,stone));
    }
    const spanAt=y=>{
      for(let i=1;i<=arch.course;i++){
        const a=arch.point(1,i-1),b=arch.point(1,i);
        if(y<=b[1])return a[0]+(b[0]-a[0])*Math.max(0,(y-a[1])/(b[1]-a[1]));
      }
      return 0;
    };
    for(let row=0;row<9;row++){
      const y=.20+row*.67,span=spanAt(y+.07)-.055;
      shell.push(M.bevelBox({w:2*span,h:.10,d:.41,bevel:.017,color:stone,offset:{x:0,y,z:.02}}),
        box(0,y-.053,.16,2*span-.05,.028,.065,shadow));
      books.push(box(0,y+.009,.230,2*span-.055,.014,.012,brass,.16));
      for(let j=0;j<count;j++){
        const bx=-half+.12+(j+.5)*step,bh=.31+(j*3+row*2)%6*.048,bw=step*(.72+(j%3)*.065);
        if(Math.abs(bx)+bw/2>spanAt(y+bh+.06)-.08 || row===2 && j===column)continue;
        books.push(box(bx,y+.05+bh/2,.057,bw,bh,.28,bindings[(j+2*row)%5]));
        for(const band of [.10,bh+.006])books.push(box(bx,y+band,.201,bw*.84,.016,.013,brass,.12));
      }
      for(const s of [-1,1])shell.push(M.beam(s*(span-.09),y-.15,-.016,s*(span-.09),y-.045,.16,.065,stone));
    }
    add(hinge,finish(M.merge(...shell)),-pivot,0,0);
    add(hinge,M.merge(...books),-pivot,0,0);
    // The book that opens the case is dressed like its neighbours, a shade more orange with a faint ₿, so only a
    // careful eye picks it out.
    const book=add(hinge,M.merge(box(0,0,0,step*.94,.49,.34,"#7b4527"),
      ...[-.145,.251].map(y=>box(0,y,.174,step*.79,.016,.013,brass,.12)),
      M.moved(BL.factoryModels.smoothBitcoin(.11,.024,"#9a6238",.05),0,0,.186)),
      bookX-pivot,.20+2*.67+.05+.245,.12);
    const spillGeo=M.geometry();
    // A translucent taper admits the marble grain through the wash. Grow it with the leaf.
    for(let i=0;i<5;i++){
      const z0=i*.46,z1=z0+.46;
      const side=(d,right)=>-.12+.17*d+(right?1:-1)*(.37+.092*d);
      const ids=[[side(z0,false),z0],[side(z1,false),z1],[side(z1,true),z1],[side(z0,true),z0]]
        .map(([u,v])=>M.pushVert(spillGeo,u,.027,v));
      M.face(spillGeo,ids,BL.math.hexToRgb(["#ffc777","#edb067","#cd945a","#ac8154","#8e7150"][i]),{emissive:.85});
    }
    spillGeo.glassOpacity=.15; spillGeo.glassGrazing=0; spillGeo.castShadow=false;
    const spill=add(target,spillGeo,-.18,0,.11);
    let progress=0, opening=false, closing=false;
    const swing=t=>{
      const v=Math.max(0,(t-.15)/.85);
      return 1.61*v*v*(3-2*v);
    };
    // Include the gilt book as it tips out beyond the front edge of its shelf.
    const bookFront=t=>{
      const pull=Math.min(1,t/.24),tilt=.26*pull;
      return .12+.115*pull+.245*Math.sin(tilt)+.21*Math.cos(tilt);
    };
    const leafBox={x:-pivot,z:-.031,hx:half,hz:.27};
    const bookBox={x:book.position.x,z:0,hx:step*.47,hz:0};
    const pose=()=>{
      const u=Math.min(1,progress/.24),v=Math.max(0,(progress-.15)/.85);
      book.rotation.x=u*.26;book.position.z=.12+.115*u;
      hinge.rotation.y=swing(progress);
      spill.visible=v>.02;spill.scale.x=spill.scale.z=Math.max(.01,v);
    };
    pose();
    const clearAt=(angle,front,ax,az,bx,bz,r)=>{
      const c=Math.cos(angle),s=Math.sin(angle);
      const dx=ax-x-pivot,dz=az-z-.07,ex=bx-x-pivot,ez=bz-z-.07;
      const a=dx*c-dz*s,b=dx*s+dz*c,e=ex*c-ez*s,f=ex*s+ez*c;
      bookBox.z=bookBox.hz=front/2;
      const crosses=BL.pokerModels.crosses;
      return !crosses(a,b,e,f,r,leafBox) && !crosses(a,b,e,f,r,bookBox);
    };
    const clear=(ax,az,bx,bz,r)=>{
      if(Math.min(az,bz)>z+w+.7+r || Math.min(ax,bx)>x+half+.7+r || Math.max(ax,bx)<x-half-.7-r)return true;
      return clearAt(hinge.rotation.y,bookFront(progress),ax,az,bx,bz,r);
    };
    const advance=(dt,actor,walkable)=>{
      const next=Math.min(1,progress+dt/.98),angle=swing(next);
      if(actor){
        const p=actor.root.position,r=actor.bodyRadius;
        const mid=(angle+hinge.rotation.y)/2;
        // Every point on the rotating, body-expanded boxes stays within this
        // distance of its midpoint pose throughout the step, including the tip.
        const pad=(w+.55+2*r)*(angle-hinge.rotation.y)/2;
        const front=bookFront(next),sweptRadius=r+pad;
        if(!clearAt(mid,front,p.x,p.z,p.x,p.z,sweptRadius)){
          const c=Math.cos(mid),s=Math.sin(mid);
          const side=(p.x-x-pivot)*s+(p.z-z-.07)*c>=0?1:-1;
          const stride=5*dt,feet=p.y-actor.baseY;
          const dodge=(dx,dz)=>{
            const bx=p.x+dx*stride,bz=p.z+dz*stride;
            if(!walkable(p.x,p.z,bx,bz,feet,actor.bodyHeight,actor))return false;
            p.x=bx;p.z=bz;return true;
          };
          // Step back into the aisle first, or slide along the face when the
          // jamb blocks that route. The leaf holds until the body has cleared.
          if(!dodge(0,side) && !dodge(side*s,side*c))dodge(-c,s);
          if(!clearAt(mid,front,p.x,p.z,p.x,p.z,sweptRadius))return;
        }
      }
      progress=next;pose();opening=progress<1;
    };
    const pickRay=ray=>{
      if (!ray.dz || opening || progress>0) return Infinity;
      if (ray.dz>0) {
        const t=(z+.07-.297-ray.oz)/ray.dz;
        const u=ray.ox+t*ray.dx-x, y=ray.oy+t*ray.dy;
        return t>=0 && Math.abs(u)<half && y>.04 && y<arch.crown(u) ? t : Infinity;
      }
      const t=(z+.21-ray.oz)/ray.dz;
      if (t<0 || Math.abs(ray.ox+t*ray.dx-x-pivot-book.position.x)>step*.55+.08) return Infinity;
      const y=ray.oy+t*ray.dy;
      return Math.abs(y-book.position.y)<.32 ? t : Infinity;
    };
    return {root,target,hinge,pickRay,clear,open(){if (opening || progress===1) return false; closing=false;opening=true; return true;},get opened(){return opening || progress>0;},get ready(){return progress===1;},
      update(dt,actor,walkable){
        // Measure clearance from the whole passage, including the bookcase swing on
        // the casino side. A returning Ooga reverses the leaves before reaching either sill.
        if(progress>0 && !actor){opening=false;closing=true;}
        if(actor && progress>0){
          const p=actor.root.position,door=BL.pokerSalons.ROOMS[0];
          const dx=Math.max(0,Math.abs(p.x-x)-half);
          const dz=Math.max(door.z+door.d/2-p.z,p.z-(z+pivot+half),0);
          const separation=Math.hypot(dx,dz)-actor.bodyRadius;
          if(separation>=3.2){opening=false;closing=true;}
          else if(closing && separation<1.8){closing=false;opening=true;}
        }
        if(closing){
          progress=Math.max(0,progress-dt/.98);closing=progress>0;pose();return;
        }
        // Check moving geometry before publishing each pose, even on a long frame.
        while(opening && dt>0){
          const step=Math.min(dt,1/60);
          advance(step,actor,walkable);dt-=step;
        }
      }};
  };
  BL.pokerSpeakeasy=Object.freeze({interior,wallTile,passCard,shelf});
})();
