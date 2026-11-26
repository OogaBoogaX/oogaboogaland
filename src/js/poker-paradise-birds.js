// Paired birds on the display bough of each shrine tree. Distances are in room metres.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,tau=2*Math.PI;
  const rgb=BL.math.hexToRgb;
  const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  // Each vane bows away from the rachis. A slim off-centre shaft and unequal
  // webs keep the overlapping flight feathers legible even with the wing folded.
  const feather=(g,root,tip,bend,across,width,pigment,tipInk,loose=false)=>{
    const base=rgb(pigment),light=rgb(tipInk),steps=loose?12:8;
    const [dx,dy,dz]=tip,[ax,ay,az]=across;
    const nx=dy*az-dz*ay,ny=dz*ax-dx*az,nz=dx*ay-dy*ax;
    const nl=Math.hypot(nx,ny,nz)||1;
    for(let i=0;i<=steps;i++){
      const t=i/steps,arch=t*(1-t)*4,span=width*(.009+Math.sin(t*Math.PI)**.71)*(1-.22*t);
      const x=root[0]+dx*t+bend[0]*arch,y=root[1]+dy*t+bend[1]*arch,z=root[2]+dz*t+bend[2]*arch;
      const notch=loose && i%3===1 && i>3?.78:1;
      const row=g.verts.length/3;
      for(const u of [-.73,-.033,.033,1]){
        const side=u*(u<0?notch:1)*span,ridge=(1-Math.abs(u))*span*.24;
        M.pushVert(g,x+ax*side+nx/nl*ridge,y+ay*side+ny/nl*ridge,z+az*side+nz/nl*ridge);
      }
      if(!i)continue;
      const ink=mix(base,light,.12+.68*t*t);
      for(let j=0;j<3;j++){
        const k=row+j,ids=[k-4,k-3,k+1,k];
        const color=j===1?mix(ink,light,.72):j===0?mix(ink,base,.45):ink;
        M.face(g,ids,color,{emissive:.20});
        M.face(g,ids.slice().reverse(),color,{emissive:.16});
      }
    }
  };
  // Sections from rump to brow give the head, neck and body one silhouette.
  const plumage=(gold,display)=>{
    const skin=M.geometry(),wing=M.geometry(),tail=M.geometry(),fans=[],detail=[];
    const back=rgb(display?(gold?"#dd3e24":"#137dc2"):"#9d6247");
    const crown=rgb(display?(gold?"#ffdd55":"#37d5eb"):"#c78c60");
    const bib=rgb(display?"#0aba93":"#dcc49b"),breast=rgb(display?(gold?"#702651":"#34345f"):"#bb896e");
    const rings=[[-.135,.103,.004,.008],[-.109,.097,.031,.031],[-.063,.098,.052,.053],
      [-.014,.107,.061,.070],[.023,.117,.058,.074],[.050,.135,.045,.063],
      [.059,.167,.041,.046],[.078,.190,.043,.043],[.104,.191,.038,.040],
      [.121,.181,.027,.028],[.129,.180,.013,.016]];
    const edges=24;
    for(let i=0;i<rings.length;i++){
      const [z,y,rx,ry]=rings[i];
      for(let j=0;j<edges;j++){const t=tau*j/edges;M.pushVert(skin,rx*Math.cos(t),y+ry*Math.sin(t),z);}
      if(!i)continue;
      for(let j=0;j<edges;j++){
        const u=Math.sin(tau*(j+.5)/edges),a=(i-1)*edges+j,b=(i-1)*edges+(j+1)%edges;
        let ink=u>.04?back:breast;
        if(i>=6)ink=u>-.10?crown:bib;
        if(i===5 && u>.22)ink=crown;
        if(i>=7 && u<-.44)ink=mix(bib,display?rgb("#176da9"):breast,-u*.72);
        if(!display && i>1 && i<6 && u<-.17)ink=mix(ink,back,.23*(i%2));
        M.face(skin,[a,b,b+edges,a+edges],ink,{emissive:.18});
      }
    }
    const oval=(x,y,z,rx,ry,rz,color)=>{
      const c=rgb(color);BL.hubModels.puff(skin,x,y,z,rx,ry,rz,[c,c,c,c],()=>.5,5,12);
    };
    const bill=M.lathe({profile:[[.013,0],[.014,.014],[.009,.038],[.001,.070]],segments:10,color:"#405566"});
    detail.push(M.moved(M.turnedX(bill,Math.PI*.53),0,.180,.119));
    for(const side of [-1,1]){
      oval(side*.036,.192,.099,.006,.011,.012,"#d3a665");
      oval(side*.040,.192,.100,.005,.0085,.009,"#15191e");
      oval(side*.044,.195,.103,.0016,.0022,.0021,"#fff4d2");
      const foot=side*.026;
      detail.push(M.beam(foot,.064,-.010,foot,.021,-.018,.007,"#525469"),
        M.beam(foot,.021,-.018,foot,.008,.006,.006,"#717688"));
      for(const toe of [-1,0,1])detail.push(M.beam(foot,.008,.006,foot+toe*.015,-.006,.033,.004,"#6f7181"));
      detail.push(M.beam(foot,.008,.006,foot,-.008,-.022,.005,"#57596b"));
      const fan=M.geometry();
      const warm=["#f44b34","#ff822f","#ffa834","#e64758","#fc9f50"];
      const cool=["#147bbb","#22babf","#4e60ca","#738cf0","#ae61ab"];
      for(let i=0;i<(display?13:5);i++){
        const t=i/(display?12:4),length=display?.53-.23*t+.021*Math.sin(2.1*i):.18-.055*t;
        const bow=(display?.108:.025)*(1-.56*t);
        feather(fan,[side*(.019+.009*t),.009*t,.046*t],
          [side*(.025+.089*t),-(display?.20:.06)*(1-.55*t),-length],
          [side*(.022+.028*t),bow,0],[side*.72,.68,0],display?.010+.004*t:.013,
          display?(gold?warm:cool)[i%5]:"#855442",display?(gold?"#ffe6a0":"#94eee0"):"#c4926d",true);
      }
      fan.receiveProjection=true;fans.push(fan);
      // The long paired central ribbons curl beyond the soft flank plumes.
      if(display)feather(tail,[side*.012,0,0],[side*.051,-.146,-.62],
        [side*.065,.096,-.016],[.78,side*.62,0],.0075,gold?"#443273":"#18547d",gold?"#aa75cf":"#689df0");
    }
    // Primaries are the long, narrow points at the wingtip. Two shorter rows
    // of coverts overlap their bases. In repose this surface hugs the flank.
    const flight=display?(gold?"#4c327e":"#233c99"):"#554443";
    const edge=display?(gold?"#7087d9":"#44a7ef"):"#c39770";
    for(let i=0;i<9;i++){
      const t=i/8;
      feather(wing,[.004,.013-.021*t,.025-.022*t],[.020+.014*t,-.010-.055*t,-.223+.073*t],
        [.020,.007,-.005],[.10,.99,-.07],.015+.002*t,flight,edge);
    }
    for(let row=0;row<2;row++)for(let i=0;i<7;i++){
      const t=i/6;
      const color=display?(row?(gold?"#f0a02c":"#32c591"):(gold?"#008f94":"#127eac")):(row?"#a57154":"#7b5445");
      feather(wing,[.006+row*.003,.025-.035*t,.041-.016*t],
        [.034-.010*t,-.011-.040*t,-.147+.048*row+.037*t],
        [.016,.004,0],[.14,.98,-.10],.017,color,display?(row?"#ffe598":"#69d4ce"):"#d5ad82");
    }
    const body=M.shaded([skin],detail);
    body.receiveProjection="matte";wing.receiveProjection=tail.receiveProjection=true;
    return {body,wing,tail,fans};
  };
  const goldFeathers=M.cached(()=>plumage(true,true));
  const tealFeathers=M.cached(()=>plumage(false,true));
  const mateFeathers=M.cached(()=>plumage(false,false));
  const pair=(room,r,perches,side,bay)=>{
    const random=BL.math.mulberry32(35172+bay);
    const add=(parent,geometry,x,y,z)=>{
      const n=S.createNode({geometry,position:{x,y,z}});S.addChild(parent,n);return n;
    };
    const birds=[0,2].map((seat,i)=>{
      const g=i===1?mateFeathers():bay%2?goldFeathers():tealFeathers();
      const p=perches[seat],root=add(room,g.body,p.x,p.y,p.z);
      const mate=perches[2-seat];
      root.rotation.y=Math.atan2(mate.x-p.x,mate.z-p.z);
      const train=add(root,g.tail,0,.111,-.082),wings=[];
      const fans=g.fans.map(mesh=>add(train,mesh,0,0,0));
      for(const hand of [-1,1]){
        const shoulder=add(root,null,hand*.042,.120,.008);
        shoulder.scale.x=hand;
        const wing=add(shoulder,g.wing,0,0,0);
        wing.rotation.y=-.035;wing.rotation.z=-.09;wings.push(wing);
      }
      return {root,train,wings,fans};
    });
    let age=0,actor=0;
    const hop=1.15,displayEnd=4.15,end=displayEnd+hop;
    const sing=(bird,audio)=>{
      const p=bird.root.position;
      audio?.cue("bird",r.x+p.x,r.z+p.z);
    };
    return (dt,audio)=>{
      const before=age;age=Math.min(end,age+dt);
      const bird=birds[actor],mate=birds[1-actor],home=perches[2*actor],near=perches[1];
      const returning=age>=displayEnd,flying=age<hop || returning;
      const t=flying?Math.min(1,(returning?age-displayEnd:age)/hop):1;
      const ease=t*t*(3-2*t),u=returning?1-ease:ease;
      const arc=flying?4*ease*(1-ease):0;
      const p=bird.root.position,oldX=p.x,oldZ=p.z;
      p.x=home.x+(near.x-home.x)*u-side*(returning?1.05:.34)*arc;
      p.y=home.y+(near.y-home.y)*u+(returning?.68:.42)*arc;
      p.z=home.z+(near.z-home.z)*u+.23*side*Math.sin(tau*u)*arc;
      const yaw=flying && t<.78?Math.atan2(p.x-oldX,p.z-oldZ):
        Math.atan2(mate.root.position.x-p.x,mate.root.position.z-p.z);
      const bow=flying?0:Math.sin(Math.PI*(age-hop)/(displayEnd-hop))**2;
      const turn=yaw+.38*bow*Math.sin((age-hop)*3.1)-bird.root.rotation.y;
      bird.root.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-11*dt));
      bird.root.rotation.x=bow*(.15-.18*Math.cos((age-hop)*4));
      mate.root.rotation.x=-bow*.12;
      bird.train.rotation.x=.93*bow+.15*arc;
      for(let i=0;i<2;i++){
        const sign=i?1:-1;
        bird.fans[i].rotation.y=-sign*bow*.59;
        bird.fans[i].rotation.z=sign*bow*(.12+.052*Math.sin(7*age+i*.4));
      }
      for(const wing of bird.wings){
        wing.rotation.y=-.035-1.28*arc-.57*bow;
        wing.rotation.z=-.09+arc*(.25+.98*Math.sin(age*tau*9))+bow*.54;
      }
      if(before<hop && age>=hop)sing(bird,audio);
      if(before<3.2 && age>=3.2 && random()<.56)sing(mate,audio);
      if(age<end)return false;
      age=0;actor=1-actor;return true;
    };
  };
  BL.pokerParadiseBirds={pair};
})();
