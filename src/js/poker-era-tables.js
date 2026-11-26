// Poker eras are dressing at the rail. All nine seats and all card positions belong to the ordinary table.
(() => {
  "use strict";
  const BL=window.BL, M=BL.models, tau=Math.PI*2;
  const gold="#ce9b50", ink="#1b3030", ivory="#ffdfa0", copper="#926044";
  const box=(x,y,z,w,h,d,color,emissive=0)=>M.box({w,h,d,color,emissive,offset:{x,y,z}});
  const disc=(x,y,z,r,h,color,n=16,emissive=.18)=>M.moved(M.lathe({segments:n,profile:[[0,0],[r,0],[r,h],[0,h]],color,emissive}),x,y,z);
  const polygon=(g,points,color,emissive=.1)=>M.face(g,points.map(p=>M.pushVert(g,...p)),BL.math.hexToRgb(color),{emissive});
  const text=(value,cell,x,y,z,color=ivory,emissive=.88,depth=.08)=>{
    const g=BL.poolModels.carve(value,{ joined:true,cell,color,emissive}).geometry;
    if(depth!==.08)for(let i=2;i<g.verts.length;i+=3)g.verts[i]*=depth/.08;
    if(value.includes(".") && !BL.hubModels.SIGN_GLYPHS["."]){
      const dot=box(8*cell+.5*cell,-4*cell,.16,cell,cell,.08,ivory,.88);
      const joined=M.merge(g,dot);
      return centerText(joined,x,y,z);
    }
    return centerText(g,x,y,z);
  };
  const centerText=(g,x,y,z)=>{
    const b=BL.scene.boundsOf(g);
    return M.moved(g,x-b.center[0],y-b.center[1],z-b.min[2]);
  };
  const names=["SATOSHI","RUNNING BITCOIN","LIGHTNING","PROOF OF WORK","PIZZA DAY","THE HALVING","FEE MARKET","TWENTY ONE MILLION","TAPROOT","MT. GOX"];
  const sign=index=>{
    const name=names[index], cell=Math.min(.049,1.64/BL.poolModels.carveCells(name));
    // Lift the new nameplates just over seated heads, retaining the approved three signs at their original height.
    const lift=newArt[index] ? .54 : 0,feet=[];
    const p=[],front=[text("TABLE "+(index+1),.039,0,1.49,.081),text(name,cell,0,1.22,.081)];
    for(const x of [-.68,.68]){
      feet.push(disc(x,0,0,.17,.055,gold,10),box(x,.54+lift/2,0,.057,1.02+lift,.057,copper));
      if(lift)feet.push(disc(x,1.43,0,.06,.072,gold,8));
    }
    p.push(box(0,1.37,0,1.91,.65,.14,gold),box(0,1.37,0,1.85,.585,.155,ink));
    for(const z of [-.08,.08])p.push(box(0,1.365,z,1.66,.012,.012,gold,.34));
    if(index===5)p.push(M.moved(splitSun(.234),0,1.77,0));
    else if(index===2){
      p.push(M.beam(-.28,1.71,0,.05,1.89,0,.044,blue,.65),M.beam(.05,1.89,0,-.02,1.76,0,.044,blue,.65),M.beam(-.02,1.76,0,.30,1.89,0,.044,blue,.65));
    }else if(index===7){
      const seal=M.turnedX(disc(0,0,0,.199,.048,gold,21,.47),Math.PI/2);
      p.push(M.moved(seal,0,1.78,-.024),text("21",.036,0,1.78,.03));
    }else for(let i=-3;i<=3;i++)p.push(box(i*.085,1.70,0,.055,.31-Math.abs(i)*.055,.07,gold,.2));
    const face=M.merge(...front);
    p.push(face,M.turnedY(M.merge(face),Math.PI));
    return M.merge(...feet,M.moved(M.merge(...p),0,lift,0));
  };
  // Flattened polar coordinates on the outer selvedge. The middle remains available for the deal.
  const edge=(angle,r,y=.792)=>[1.95*r*Math.cos(angle),y,1.25*r*Math.sin(angle)];
  const railLine=(parts,a,b,r,width,color,glow=0)=>{
    const steps=Math.max(2,Math.ceil((b-a)*10));
    let last=edge(a,r);
    for(let j=1;j<=steps;j++){
      const next=edge(a+(b-a)*j/steps,r);
      parts.push(M.beam(...last,...next,width,color,glow));last=next;
    }
  };
  const routeStart=-2.38, routeEnd=-.76;
  const mint="#91e3bc", blue="#70cfff", amber="#ffb34c", enamel="#151e25";
  const terminal=()=>{
    const parts=[box(0,.032,0,.43,.064,.30,"#423a32"),box(0,.092,-.035,.34,.11,.22,"#ae8863"),
      box(0,.23,-.02,.45,.27,.23,"#ccb898"),box(0,.23,.104,.367,.211,.025,enamel),
      box(0,.23,.120,.322,.166,.012,"#3d2a19",.32)];
    for(let i=0;i<3;i++)parts.push(box(-.049,.277-.035*i,.131,.166-i*.026,.012,.009,amber,.91));
    parts.push(box(.054,.207,.131,.031,.012,.009,amber,.96));
    for(let row=0;row<3;row++)for(let col=0;col<8;col++)
      parts.push(box((col-3.5)*.042,.075,.096+row*.038,.031,.017,.026,"#e2c69a"));
    return M.merge(...parts);
  };
  const runningBitcoin=()=>{
    const p=[], device=terminal();
    for(const side of [-1,1]){
      p.push(M.moved(M.turnedY(M.merge(device),-side*.56),side*1.27,.91,-1.08));
      for(let j=0;j<3;j++)railLine(p,side<0?2.02:-.65,side<0?4.0:1.13,.89+j*.035,.011,copper,.37);
    }
    railLine(p,-.7,4.0,.98,.023,amber,.42);
    // Asynchronous serial framing, stamped on the front binding like a paper-tape punch.
    for(let j=0;j<17;j++){
      const a=.42+j*.139, bit=(0x16ac5>>j)&1, pt=edge(a,.925);
      p.push(disc(...pt,.029,.012,bit?amber:"#6e5345",8,bit?.70:.12));
    }
    return M.merge(...p);
  };
  const crystal=(r,h,color,light="#dbfaff",shade="#4191c8")=>{
    const g=M.geometry();
    for(let i=0;i<6;i++){
      const a=i*tau/6,b=(i+1)*tau/6;
      const l=[r*Math.cos(a),h*.68,r*Math.sin(a)],q=[r*Math.cos(b),h*.68,r*Math.sin(b)];
      polygon(g,[[0,h,0],q,l],i%3===0?light:color,.8);
      polygon(g,[l,q,[0,0,0]],i%2?shade:color,.45);
    }
    return g;
  };
  const lightning=()=>{
    const p=[];
    for(const a of [routeStart,routeEnd]){
      const [x,,z]=edge(a,1.12);
      p.push(disc(x,.88,z,.16,.056,"#586879"),disc(x,.935,z,.118,.035,blue,12,.66),
        M.moved(crystal(.132,.345,blue),x,.963,z));
    }
    // Silver conductors, interleaved with short forks and solder pads around the player's rail.
    railLine(p,routeStart,routeEnd,.96,.025,blue,.57);
    for(let i=0;i<12;i++){
      const a=i*tau/12;
      const start=edge(a,.967), fork=edge(a+.09,.91), tip=edge(a+.23,.958), low=edge(a+.18,.865);
      p.push(M.beam(...start,...fork,.020,"#99b5d1",.4),M.beam(...fork,...tip,.024,"#bdeaff",.6),
        M.beam(...fork,...low,.014,blue,.5),disc(...low,.023,.008,blue,8,.73));
    }
    return M.merge(...p);
  };
  const workX=-1.08, workZ=-1.17, wheelX=workX+.24, axleY=1.095;
  const proofOfWork=()=>{
    const p=[box(workX,.931,workZ,.94,.09,.39,"#614d44"),box(workX,.985,workZ,.89,.085,.34,enamel),
      box(workX-.17,axleY,workZ+.054,.44,.23,.205,"#a4754e"),box(workX-.17,axleY,workZ+.16,.414,.207,.018,"#111b1b"),
      text("000",.029,workX-.17,axleY,workZ+.171,"#f4b759",.44,.006)];
    for(const side of [-1,1])p.push(box(workX+side*.431,1.055,workZ,.06,.20,.36,copper));
    for(let k=0;k<11;k++)p.push(box(workX-.38+k*.073,1.14,workZ-.105,.026,.31,.17,k%2?copper:"#c18855"));
    for(const y of [axleY-.118,axleY+.118])
      p.push(box(wheelX,y,workZ+.19,.38,.058,.19,"#73503c"),box(wheelX,y,workZ+.29,.40,.022,.013,gold));
    // The wheel guard faces the aisle at an angle; the spokes and the motor cooling fins read in silhouette.
    const fan=[M.torus(.168,.026,"#be8050",.26,20,6),disc(0,-.027,0,.057,.068,gold,12)];
    for(let k=0;k<6;k++){
      const a=tau*k/6;fan.push(M.beam(0,0,0,.157*Math.cos(a),0,.157*Math.sin(a),.024,copper,.31));
    }
    p.push(M.moved(M.turnedY(M.turnedX(M.merge(...fan),Math.PI/2),-.55),workX-.50,1.105,workZ+.13));
    for(let i=0;i<28;i++){
      const a=i*tau/28,b=a+tau/54;
      const start=edge(a,.91),end=edge(b,.982);
      p.push(M.beam(...start,...end,i%4===0?.039:.019,i%4===0?amber:copper,.26));
    }
    return M.merge(...p);
  };
  const hashWheel=()=>{
    const drum=M.turnedZ(disc(0,-.075,0,.18,.15,enamel,16),Math.PI/2),p=[drum];
    // Two hexadecimal odometer drums share one axle. Each face is lettered at its tangent.
    for(let k=0;k<16;k++){
      const face=text("0123456789ABCDEF"[k],.0135,0,0,.181,"#f7c578",.37,.004);
      p.push(M.turnedX(face,k*tau/16));
    }
    return M.merge(...p);
  };
  const splitSun=(r)=>{
    const g=M.geometry();
    for(const side of [-1,1]){
      const start=side===1?-Math.PI/2:Math.PI/2;
      for(let i=0;i<16;i++){
        const a=start+i*Math.PI/16,b=start+(i+1)*Math.PI/16;
        const x=side*.055*r;
        const at=t=>[x+r*Math.cos(t),r*Math.sin(t),0];
        const triangle=[[x,0,.028],at(a),at(b)];
        polygon(g,triangle,side===1?(i%4?"#ffce6d":"#ffde97"):(i%4?"#986247":"#bc8861"),side===1?.67:.33);
        polygon(g,[...triangle].reverse(),side===1?amber:copper,.48);
      }
    }
    return g;
  };
  const halving=()=>{
    const p=[],x=-1.29,z=-1.09;
    p.push(disc(x,.887,z,.26,.064,copper),box(x,1.05,z,.062,.22,.06,gold),M.moved(splitSun(.243),x,1.28,z));
    const halo=M.turnedX(M.torus(.286,.013,gold,.45,32,6),Math.PI/2);
    p.push(M.moved(halo,x,1.28,z-.018));
    for(let j=0;j<16;j++){
      const a=j*Math.PI/15,dx=Math.cos(a),dy=Math.sin(a),r=j%3===0?.362:.324;
      p.push(M.beam(x+.272*dx,1.28+.272*dy,z-.018,x+r*dx,1.28+r*dy,z-.018,.015,gold,.36));
    }
    for(let i=0;i<4;i++){
      const start=.18,end=start+Math.PI*1.66/2**i,r=.993-i*.036;
      railLine(p,start,end,r,.022,i%2?"#c88d69":"#f7cf81",.45);
      p.push(disc(...edge(end,r),.033,.012,gold,10,.55));
    }
    return M.merge(...p);
  };
  const marketX=-1.18, marketZ=-1.09;
  const roofHeights=[.28,.47,.35,.69,.43,.55,.32,.60,.38];
  const feeMarket=()=>{
    const p=[box(marketX,.915,marketZ,.91,.076,.31,"#875a35"),box(marketX,.963,marketZ,.88,.036,.28,enamel)];
    for(let k=0;k<roofHeights.length;k++){
      const x=marketX+(k-4)*.091;
      p.push(box(x,1.00,marketZ,.078,.055,.105,"#986a3f",.4));
    }
    for(const s of [-1,1]){
      // Dark flanking exchange houses make the unlit skyline recognizable before the first reading.
      const x=marketX+s*.53;
      p.push(box(x,1.035,marketZ,.16,.24,.23,"#755946"),box(x,1.19,marketZ,.129,.085,.18,"#85664a"),
        box(x,1.246,marketZ,.086,.034,.15,gold));
      for(let row=0;row<3;row++)for(let col=-1;col<=1;col++)p.push(box(x+col*.04,1.001+row*.052,marketZ+.119,.018,.024,.008,amber,.39));
    }
    // A bronze cadastral strip follows the felt, with alternating lit windows and dark avenues.
    for(let i=0;i<46;i++){
      const a=i*tau/46,b=a+.071,h=[.037,.070,.042,.085,.050][i%5];
      railLine(p,a,b,.967,.017,"#dfae67",.40);
      p.push(M.beam(...edge(a,.967),...edge(a,.967-h),.017,copper,.26),
        M.beam(...edge(a,.967-h),...edge(b,.967-h),.015,amber,.42));
    }
    return M.merge(...p);
  };
  const towerGlass=()=>M.merge(box(0,.35,0,.066,.70,.105,"#e29232",.69),
    box(-.013,.42,.056,.012,.79,.007,"#ffdf8d",.88),box(0,.74,0,.040,.1,.068,"#ffd481",.78),
    box(0,.82,0,.009,.12,.012,gold,.5),
    ...[.14,.27,.40,.53,.66].map(y=>box(0,y,.058,.067,.024,.008,"#724e39",.18)));
  const capAngle=Math.atan2(-1.52/1.25,3.15/1.95);
  const twentyOne=()=>{
    const p=[];
    railLine(p,0,tau,.936,.027,"#c99049",.37);
    for(let i=0;i<21;i++){
      const a=capAngle+(i+1)*tau/21,[x,,z]=edge(a,.936), last=i===20;
      const setting=box(0,.795,0,last?.20:.136,.022,.106,last?gold:"#9b7556");
      const gem=M.bevelBox({w:last?.164:.105,h:last?.060:.034,d:.077,bevel:.014,color:last?"#f8b538":"#f6e6cb",emissive:last?.72:.52,offset:{x:0,y:.824,z:0}});
      p.push(M.moved(M.turnedY(M.merge(setting,gem),Math.atan2(-1.25*Math.cos(a),-1.95*Math.sin(a))),x,0,z));
    }
    // An assay balance in black lacquer with two hanging gold pans, set into the dealer's rim.
    const x=-1.25,z=-1.04;
    p.push(disc(x,.89,z,.18,.055,enamel),disc(x,.94,z,.12,.029,gold),box(x,1.17,z,.046,.43,.046,gold),
      M.beam(x-.29,1.34,z,x+.29,1.40,z,.032,gold));
    for(const s of [-1,1]){
      const xx=x+s*.25, yy=1.37+s*.026;
      for(let k=0;k<3;k++){const a=k*tau/3;p.push(M.beam(xx,yy,z,xx+.1*Math.cos(a),yy-.20,z+.1*Math.sin(a),.009,gold));}
      p.push(disc(xx,yy-.22,z,.113,.024,"#e5b266",12,.4));
    }
    return M.merge(...p);
  };
  const taproot=()=>{
    const p=[],x=-1.25,z=-1.09;
    p.push(disc(x,.875,z,.30,.062,"#243d35"),disc(x,.935,z,.24,.035,"#875e42"));
    const branch=(ax,ay,az,bx,by,bz,r,depth,turn)=>{
      p.push(M.beam(ax,ay,az,bx,by,bz,r,depth===0?"#72ab8f":"#b87d4d",.30));
      if(!depth){
        const leaf=M.turnedZ(crystal(.067,.14,"#57b99c","#b5eaca","#428974"),turn*.54);
        p.push(M.moved(leaf,bx,by,bz));
        for(const side of [-1,1])p.push(M.moved(M.turnedZ(crystal(.047,.097,"#64b690","#a3ddab","#538775"),side*.95),bx+side*.044,by-.012,bz+.028));
        return;
      }
      const len=depth*.086+.055;
      for(const side of [-1,1]){
        const heading=turn+side*.63;
        branch(bx,by,bz,bx+Math.sin(heading)*len,by+Math.cos(heading)*len,bz+side*len*.29,r*.67,depth-1,heading);
      }
    };
    branch(x,.963,z,x+.033,1.10,z,.066,3,-.12);
    for(let k=0;k<7;k++){
      const a=k*tau/7,dx=Math.cos(a),dz=Math.sin(a);
      p.push(M.beam(x,1.025,z,x+.10*dx,.987,z+.10*dz,.034,copper,.23),
        M.beam(x+.10*dx,.987,z+.10*dz,x+.215*dx,.970,z+.215*dz,.018,"#85a485",.34));
    }
    // The rootlets branch into the outer greenstone ribbon; malachite tips catch the pendant light.
    for(let i=0;i<10;i++){
      const a=i*tau/10,u=edge(a,.992),v=edge(a+.11,.928),w=edge(a+.30,.905);
      p.push(M.beam(...u,...v,.023,copper,.35),M.beam(...v,...w,.017,"#a78c62",.38));
      for(const off of [-.043,.041]){
        const tip=edge(a+.375,.91+off);
        p.push(M.beam(...w,...tip,.013,"#8baf83",.47),disc(...tip,.022,.008,mint,7,.52));
      }
    }
    return M.merge(...p);
  };
  const newArt={1:runningBitcoin,2:lightning,3:proofOfWork,5:halving,6:feeMarket,7:twentyOne,8:taproot};
  // Moving parts belong to this visit's nodes. Only their geometry is shared.
  const instruments=(tables,kit)=>{
    const add=(i,g,x,y,z)=>{
      const n=BL.scene.createNode({geometry:g,position:{x,y,z}});BL.scene.addChild(tables[i].base,n);return n;
    };
    const spark=add(2,kit.spark,0,.82,0);
    const wheels=[add(3,kit.wheel,wheelX-.082,axleY,workZ+.075),add(3,kit.wheel,wheelX+.082,axleY,workZ+.075)];
    const towers=[];
    for(let i=0;i<roofHeights.length;i++){
      const tower=add(6,kit.glass,marketX+(i-4)*.091,1.024,marketZ);
      tower.visible=false;towers.push(tower);
    }
    let lastAt=-1,lastSize=-1;
    return (elapsed,calm,chain)=>{
      const phase=elapsed%4.8/2.4;
      spark.visible=!calm && phase<1;
      if(spark.visible){
        const angle=routeStart+(routeEnd-routeStart)*phase;
        spark.position.x=1.95*.96*Math.cos(angle);spark.position.z=1.25*.96*Math.sin(angle);
        spark.glow=.8+Math.sin(phase*Math.PI)*.65;
      }
      const tick=calm?0:elapsed/1.4,step=Math.floor(tick),f=Math.min(1,(tick-step)*5);
      wheels[1].rotation.x=-(step+f*f*(3-2*f))*tau/16;
      wheels[0].rotation.x=-(Math.floor(step/16)+(step%16===15?f*f*(3-2*f):0))*tau/16;
      if(lastAt===chain.backlogAt && lastSize===chain.vsize)return;
      lastAt=chain.backlogAt;lastSize=chain.vsize;
      // Each successive tower represents twice as much waiting block space, starting at one million vbytes.
      const blocks=Math.max(0,chain.vsize)/1e6;
      for(let i=0;i<towers.length;i++){
        const capacity=2**Math.max(0,i-1);
        const fill=Math.max(0,Math.min(1,blocks/capacity-(i===0?0:1)));
        towers[i].visible=chain.backlogAt>0 && fill>0;
        towers[i].scale.y=roofHeights[i]*fill+.015;
      }
    };
  };
  const instrumentKit=()=>({spark:crystal(.038,.065,"#e8ffff"),wheel:hashWheel(),glass:towerGlass()});

  // Outer-felt details sit above the ring's plane but outside the card and chip positions.
  const decoration=(index,lite,chair)=>{
    if(newArt[index])return newArt[index]();
    const p=[],g=M.geometry(),n=lite?32:64;
    if(index===0){
      for(let k=0;k<12;k++){
        const a=k*tau/12, pts=[edge(a,.90,.789),edge(a+.10,.90,.789),edge(a+.14,.95,.789),edge(a+.31,.95,.789)];
        for(let j=1;j<pts.length;j++)p.push(M.beam(...pts[j-1],...pts[j],.012,gold));
        const [x,y,z]=pts[0];p.push(disc(x,y,z,.026,.006,gold,8));
      }
      p.push(box(0,.91,-1.39,.43,.16,.06,gold),box(0,.91,-1.35,.395,.131,.027,ink),text("0",.021,0,.91,-1.33));
      // A separate empty founder's chair behind the players, with a fan crest and a reading light.
      const arm=[chair,box(0,.93,-.29,.79,.85,.12,"#3d2b23"),box(0,.94,-.21,.69,.74,.10,"#33262a")];
      for(const x of [-.39,.39])arm.push(box(x,.65,0,.10,.09,.65,gold));
      const medal=M.turnedX(disc(0,0,0,.255,.022,gold,24),Math.PI/2);
      arm.push(M.moved(medal,0,.98,-.155),text("B",.065,0,.98,-.13),box(-.035,.98,-.137,.014,.43,.015,gold),box(.043,.98,-.137,.014,.43,.015,gold));
      for(let k=-3;k<=3;k++)arm.push(box(k*.10,1.34,-.28,.084,.19-.033*Math.abs(k),.10,gold));
      const cx=-2.8,cz=-2.76;
      p.push(disc(cx,.005,cz,.78,.11,"#382a26",24),disc(cx,.108,cz,.78,.025,gold,24),M.moved(M.turnedY(M.merge(...arm),.4),cx,.14,cz));
      p.push(box(cx-.83,.58,cz,.055,1.16,.055,gold),disc(cx-.83,.02,cz,.20,.06,gold),disc(cx-.83,1.14,cz,.22,.12,"#ffdd95",12,.82));
    }else if(index===4){
      // Alternating enamel diamonds, then eight separated slices on a low peel at the dealer-side corner.
      for(let k=0;k<n;k++){
        const a=k*tau/n,b=(k+1)*tau/n,m=(a+b)/2;
        polygon(g,[edge(a,.94,.790),edge(m,.975,.790),edge(b,.94,.790),edge(m,.905,.790)].reverse(),k%2?"#e1bf96":"#ab4634");
      }
      const x=-1.31,z=-.92,y=.92,r=.42;
      p.push(disc(x,y-.052,z,r+.055,.035,gold,32),box(x-.38,y-.032,z,.44,.028,.088,gold));
      for(let i=0;i<8;i++){
        const a=i*tau/8+.024,b=(i+1)*tau/8-.024,m=(a+b)/2;
        const point=(ang,rad,h)=>[x+rad*Math.cos(ang),y+h,z+rad*Math.sin(ang)];
        polygon(g,[point(m,.029,0),point(b,r,0),point(m,r,0),point(a,r,0)],"#d99738",.30);
        polygon(g,[point(a,r-.062,.009),point(b,r-.062,.009),point(b,r,.009),point(m,r,.009),point(a,r,.009)],"#bd6e30");
        for(const [angle,rad,size] of [[m,.25,.045],[a+.18,.33,.035]]){
          const [px,py,pz]=point(angle,rad,.009);p.push(disc(px,py,pz,size,.012,"#a63c28",8,.30));
        }
      }
    }else{
      // Outside each broken slab the seam moves sideways before reaching the rim. Brass dogs bridge the fault.
      const shades=["#37413c","#41403a","#263635","#3c4039"],count=lite?16:28;
      const side=(a,y,scale)=>[2.25*scale*Math.cos(a),y,1.535*scale*Math.sin(a)];
      for(let i=0;i<count;i++){
        const a=i*tau/count,b=(i+1)*tau/count, k=(i%3-1)*.041, j=((i+1)%3-1)*.041;
        const hi=side(a,.765,1),mid=side(a+k,.68,1.01),lo=side(a-k,.55,.98);
        polygon(g,[hi,side(b,.765,1),side(b+j,.68,1.01),mid],shades[i%4]);
        polygon(g,[mid,side(b+j,.68,1.01),side(b-j,.55,.98),lo],shades[(i+1)%4]);
        if(i%3===0){
          p.push(M.beam(...hi,...mid,.022,"#171719"),M.beam(...mid,...lo,.023,"#171719"));
          for(const h of [.626,.715])p.push(M.beam(...side(a-.046,h,1.017),...side(a+.046,h,1.017),.028,gold));
        }
      }
      // A band of split slate also reads above the rail from a seated eye. Each brass staple straddles a seam.
      const stone=(a,r)=>edge(a,r,.796);
      for(let k=0;k<count;k++){
        const a=k*tau/count,b=(k+1)*tau/count;
        polygon(g,[stone(a,.995),stone(a+.019,.94),stone(b+.014,.94),stone(b-.005,.995)],shades[k%4],.17);
        if(k%3===1){
          const a0=stone(a-.028,.966),a1=stone(a+.044,.966);
          p.push(M.beam(...a0,...a1,.020,gold));
          for(const pt of [a0,a1])p.push(disc(pt[0],.798,pt[2],.016,.008,copper,6));
        }
      }
      for(let k=0;k<6;k++){
        const x=.57+k*.135,z=.986-k*.072;
        p.push(M.beam(x,.794,z,x+.135,.794,z,.014,gold),M.beam(x+.135,.794,z,x+.135,.794,z-.072,.014,gold));
      }
    }
    return M.merge(g,...p);
  };
  BL.pokerEraTables=Object.freeze({names,sign,decoration,instruments,instrumentKit});
})();
