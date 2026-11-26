// The three family cats share one articulated rig. Coat markings are baked into
// the skin once; only joint transforms change while the lounge is occupied.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,pi=Math.PI;
  const coats=[
    ["#232829","#3d4241","#616563","#979993","#c3bfae"],
    ["#252525","#302e2b","#47403a","#6e5a45","#a08868"],
    ["#302c2c","#4c4038","#796453","#a78b6d","#cbb493"]
  ].map(row=>row.map(BL.math.hexToRgb));
  // Five fur tones sampled from the reference photos: silver flank, brindled
  // cheek and long flank fur. Mirror the small swatches at their edges.
  const swatches=[
    [
      "00001123311122342222",
      "01112211221312232244",
      "01103321233421112244",
      "00001233311222122434",
      "00011343332211121323",
      "01012344222121123332",
      "01102232112210111144",
      "00001110010121122344",
      "00000011110111022244",
      "10000100000001121144",
      "00100110000000011233",
      "00000000000000012344",
    ],
    [
      "01101111110011211234",
      "00000011111134322311",
      "00001112323432322111",
      "00001113344343112211",
      "00000111442333332233",
      "00000012124444333222",
      "00011111112232334444",
      "00111111111233223444",
      "11122111111112332123",
      "22111211111111111122",
      "33111111111112321213",
      "41111111111113321222",
    ],
    [
      "00000011212210020033",
      "10111101021122011214",
      "00000122101112232011",
      "21001100011110122423",
      "11111112221101022334",
      "11111232111234113323",
      "02322121110002234430",
      "11221012232233112431",
      "24322441343333224443",
      "22323233333333223343",
      "22344344444344123343",
      "33444444344324311233",
    ]
  ];
  const sculpt=M.variants(id=>{
    const kitten=id===0,long=id===2,coat=coats[id],base=coat[0];
    const markings=swatches[id];
    const marking=(x,y,z)=>{
      const along=Math.floor((z+.28)*45+2*Math.sin(24*y+16*x));
      const around=Math.floor((x+.23)*42+1.7*Math.sin(22*y-13*z));
      const u=((along%40)+40)%40,v=((around%24)+24)%24;
      let tone=markings[v<12?v:23-v].charCodeAt(u<20?u:39-u)-48;
      if(id===1 && Math.sin(14*z+11*y+16*x)<.55)tone=Math.max(0,tone-2);
      return coat[tone];
    };
    // Sample coherent streaks on the curved skin, across shared triangle edges.
    const lobe=(x,y,z,rx,ry,rz,ink=null,rows=8,sides=14)=>{
      const g=M.geometry();g.smooth=true;
      BL.hubModels.puff(g,x,y,z,rx,ry,rz,[base,base,base,base],()=>.57,rows,sides);
      const solid=typeof ink==="string"?BL.math.hexToRgb(ink):null;
      for(const face of g.faces){
        let a=0,b=0,d=0;
        for(const index of face.i){a+=g.verts[3*index];b+=g.verts[3*index+1];d+=g.verts[3*index+2];}
        face.color=solid || (ink || marking)(a/3,b/3,d/3);face.emissive=.10;
      }
      return g;
    };
    const wedge=(points,color)=>{
      const g=M.geometry(),v=points.map(p=>M.pushVert(g,...p)),rgb=BL.math.hexToRgb(color);
      M.face(g,v,rgb,{emissive:.12});M.face(g,v.slice().reverse(),rgb,{emissive:.12});return g;
    };
    const faceCoat=(x,y,z)=>{
      const ink=marking(x,y,z);
      if(kitten && z>.044 && y>.021 && y<.045 && x>-.014)return coat[3];
      if(!long && z>.049 && Math.abs(x)<.022)return coat[0];
      return ink;
    };
    const torso=[lobe(0,0,.015,long?.115:.096,.107,.196,null,13,22),
      lobe(0,.008,-.115,long?.124:.100,.115,.130,null,11,18),
      lobe(0,.012,.13,.085,long?.115:.105,.103,null,10,16)];
    if(id===1)torso.push(lobe(0,.013,.225,.024,.035,.012,"#bdb7a8"));
    const skull=lobe(0,0,0,.096,.083,.084,faceCoat,12,22);
    // Narrow the lower jaw beneath broad cheekbones; leave room for the two whisker pads.
    for(let v=0;v<skull.verts.length;v+=3){
      const jaw=Math.max(0,-skull.verts[v+1]/.083);
      skull.verts[v]*=1-.29*jaw;
    }
    const face=[skull];
    for(const side of [-1,1]){
      const a=[side*.037,.042,.033],b=[side*.091,.027,.009],
        tip=[side*(kitten?.093:.089),kitten?.153:.137,-.007],back=[side*.059,.046,-.040];
      face.push(wedge([a,b,tip],"#393532"),wedge([tip,b,back],"#27282a"),wedge([a,tip,back],"#49433c"),
        wedge([[side*.050,.052,.034],[side*.084,.044,.020],[side*.084,tip[1]-.023,.003]],long?"#82665c":"#8c736c"));
      face.push(lobe(side*.023,-.025,.074,.030,.020,.026,faceCoat),
        M.polyline({points:[{x:0,y:-.017,z:.101},{x:0,y:-.030,z:.098},
          {x:side*.015,y:-.036,z:.096},{x:side*.030,y:-.032,z:.095}],color:"#332e2c"}));
      for(let j=0;j<3;j++){
        const z=.088+j*.002,yy=-.024+j*.006;
        face.push(M.polyline({points:[{x:side*.023,y:yy,z},{x:side*.077,y:yy+.004,z:z+.009},
          {x:side*(id===1?.152:.129),y:yy-.005+j*.008,z:z+.002}],color:"#bdb6a7",emissive:.19}));
      }
      if(long){
        // Pointed locks give the ruff its ragged silhouette against the fire.
        for(let j=0;j<5;j++)face.push(wedge([[side*.064,.022-j*.012,.024],[side*.077,.030-j*.012,-.034],
          [side*(.115-j*.003),-.013-j*.014,-.045]],["#594a40","#88715d","#51453e"][j%3]));
      }
    }
    face.push(lobe(0,-.046,.065,.026,.016,.021,id===1?"#e2dcca":long?"#8c7764":"#666761"),
      wedge([[-.014,-.005,.093],[.014,-.005,.093],[0,-.018,.100]],long?"#604d4a":"#303032"));
    const eyes=[],lids=[];
    for(const side of [-1,1]){
      const x=side*.046;
      const eyeRim=lobe(0,0,0,.024,kitten?.018:.014,.011,"#252824");
      for(let v=0;v<eyeRim.verts.length;v+=3){
        const corner=eyeRim.verts[v]/.024;
        eyeRim.verts[v+1]=eyeRim.verts[v+1]*(1-.52*Math.abs(corner))+side*.006*corner;
      }
      eyes.push(M.moved(eyeRim,x,.011,.072),
        lobe(x,.012,.081,.016,kitten?.015:.011,.005,kitten?"#a4b490":id===1?"#b1ab68":"#a39963"),
        lobe(x,.012,.086,.005,.010,.002,"#201e1c"),
        lobe(x-.004,.017,.089,.003,.003,.0015,"#e0e4ce",4,6));
      lids.push(M.polyline({points:[{x:x-side*.020,y:.013,z:.079},{x,y:.008,z:.085},
        {x:x+side*.019,y:.017,z:.078}],color:"#211e1e",emissive:.15}));
    }
    const foot=(hind)=>M.shaded([lobe(0,-.065,hind?-.018:0,hind?.042:.029,.077,hind?.057:.034),
      lobe(0,-.135,-.006,.024,.060,.026),lobe(0,-.183,.015,.030,.020,.046)]);
    // The shorthairs taper from the rump. The longhair's guard hairs fan out
    // midway along the brush and sweep past its tip.
    const tail=[],length=long?.080:.065;
    const radii=long?[.032,.043,.055,.060,.058,.052,.039,.011]:[.022,.021,.019,.017,.014,.007];
    for(let j=0;j<radii.length-1;j++){
      const a=radii[j],b=radii[j+1],last=j===radii.length-2;
      const skin=M.turnedX(M.lathe({profile:[[a*.65,-a*.65],[a,0],[(a+b)/2,length*.52],
        [b,length],[last?.001:b*.68,length+b*.68]],segments:14,color:"#393533",emissive:.10}),-pi/2);
      for(const f of skin.faces){
        const v=f.i[0]*3;
        f.color=marking(skin.verts[v],skin.verts[v+1],skin.verts[v+2]-j*length);
      }
      const sections=[skin];
      if(long)for(let k=0;k<9;k++){
        const angle=2*pi*k/9+.48*j,c=Math.cos(angle),s=Math.sin(angle);
        const tip=b*(last?.76:1.19),reach=length*(1.34+.16*Math.sin(3*k+j));
        sections.push(wedge([[a*(c-.35*s),a*(s+.35*c),-.012],
          [a*(c+.35*s),a*(s-.35*c),-.012],[tip*c,tip*s,-reach]],
          ["#68564a","#97806c","#aa9581","#584940"][(j+k)%4]));
      }
      tail.push(M.shaded(sections));
    }
    return {body:M.shaded(torso),head:M.shaded(face),eyes:M.shaded(eyes),lids:M.merge(...lids),
      fore:foot(false),hind:foot(true),tail,tailStep:length};
  });
  const joint=(parent,geometry,x=0,y=0,z=0)=>{
    const n=S.createNode({geometry,position:{x,y,z},sightHidden:true});S.addChild(parent,n);return n;
  };
  const routes=[
    [[1.89,-.39],[2.02,-1.25],[2.86,-2.12],[3.58,-2.56],[3.62,-3.79],[1.46,-4.05]],
    [[-1.89,-.39],[-1.88,-1.26],[-1.57,-2.46],[-1.08,-3.66]],
    [[-3.42,-2.67],[-4.45,-3.03],[-4.04,-3.57],[-2.80,-3.96]]
  ];
  const ease=t=>t*t*(3-2*t);
  const turn=(from,to,rate)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*rate;
  const makeCat=(room,r,id)=>{
    const g=sculpt(id),root=joint(room,null),body=joint(root,g.body),head=joint(root,g.head),
      eyes=joint(head,g.eyes),lids=joint(head,g.lids),legs=[],tail=[];
    const size=[.77,.99,1.08][id],seat=BL.pokerLoungeStone.seatZ(r),route=routes[id];
    root.scale.x=root.scale.y=root.scale.z=size;
    for(let n=0;n<4;n++)legs.push(joint(root,n<2?g.fore:g.hind));
    for(let n=0;n<g.tail.length;n++)tail.push(joint(n?tail[n-1]:root,g.tail[n],0,0,n?-g.tailStep:0));
    const level=i=>i===0 && id<2?BL.pokerModels.SEAT_TOP:route[i][1]<-3.77?.018:.038;
    const rand=BL.math.mulberry32(1989+id*103);
    const speed=[.47,.33,.28][id],nap=[65,103,140][id],homeYaw=[2.8,-2.65,2.32][id];
    let nextBreath=0,state="sleep",age=0,duration=[25,51,78][id],time=id*5,index=0,dir=1,stride=0;
    root.position.x=route[0][0];root.position.z=seat+route[0][1];root.position.y=level(0);root.rotation.y=homeYaw;
    const start=(next,seconds)=>{state=next;age=0;duration=seconds;};
    const pose=(lie,sit,stretch,walk,sniff,jump)=>{
      const breath=Math.sin(time*(id===0?2.1:1.65))*.003;
      const y=.21-.093*lie-.009*sit+.018*stretch+breath;
      body.position.y=y;body.rotation.x=-.57*sit+.28*stretch;
      body.scale.z=1+.11*stretch;body.scale.y=1-.12*lie;
      head.position.x=.064*lie;head.position.y=.315-.185*lie+.023*sit-.155*stretch-.063*sniff+breath;
      head.position.z=.186-.058*lie-.046*sit+.045*stretch;
      head.rotation.y=-2.10*lie+(1-lie)*(.12+.28*sit)*Math.sin(time*.71+id);
      head.rotation.z=-.23*lie;head.rotation.x=.21*lie+.46*sniff+.12*stretch;
      const shut=lie>.73 || (time+id*4)%7.1<.16;
      eyes.visible=!shut;lids.visible=shut;
      for(let n=0;n<4;n++){
        const fore=n<2,side=n%2?1:-1,leg=legs[n],phase=stride+(n===0||n===3?0:pi)+(fore?0:.40);
        leg.position.x=side*(.057+.009*lie);
        leg.position.z=(fore?.144:-.134)+(fore?.04:-.012)*lie+(fore?.075:0)*stretch;
        const hip=.203-.123*lie-(fore?.026:.112)*sit+(fore?-.074:.015)*stretch;
        leg.position.y=hip+walk*.014*Math.max(0,Math.sin(phase));
        leg.rotation.x=(fore?-.94:.99)*lie+(fore?-.22:.87)*sit-(fore?.83:0)*stretch+
          walk*.48*Math.sin(phase)+(fore?-.5:.6)*jump;
        leg.scale.y=hip/(.203*Math.max(.50,Math.cos(leg.rotation.x)));
      }
      const plume=id===2,free=1-lie-sit;
      tail[0].position.y=y+.017-(plume?.052:.078)*lie-.131*sit;tail[0].position.z=-.203;
      for(let n=0;n<tail.length;n++){
        const wave=Math.sin(time*(plume?.86:1.5)-n*.46);
        // Curve around the folded paws at rest; lift from the base on a walk,
        // letting the long plume trail behind and turn gently up at the tip.
        tail[n].rotation.y=-(n===0?1.06:plume?.43:.58)*(lie+.78*sit)+(.10+.08*wave)*free;
        const pitch=plume?(n===0?.39:n<4?-.14:.24):(n===0?.80:n<3?.12:-.24);
        tail[n].rotation.x=free*(pitch*(.7+.3*walk)+.035*wave)+(plume&&n>4?.10:0)*(lie+sit);
      }
    };
    const walkNext=()=>{
      const a=route[index],b=route[index+dir],hop=level(index+dir)-level(index);
      start("walk",Math.abs(hop)>.20?.78:Math.hypot(b[0]-a[0],b[1]-a[1])/speed);
    };
    pose(1,0,0,0,0,0);
    let attention=0;
    return (dt,visitor,bird)=>{
      const p=root.position,next=index+dir;
      let blocked=false;
      if(state==="walk" && visitor && Math.abs(level(next)-level(index))<.2){
        const aheadX=r.x+p.x+.27*Math.sin(root.rotation.y),aheadZ=r.z+p.z+.27*Math.cos(root.rotation.y);
        blocked=Math.hypot(visitor.x-aheadX,visitor.z-aheadZ)<.4;
      }
      time+=dt;if(!blocked)age+=dt;
      if(state==="sleep" && age<duration){
        if(time<nextBreath)return;
        nextBreath=time+.10;
      }
      const t=Math.min(1,age/duration),blend=ease(t);
      let lie=0,sit=0,stretch=0,walk=0,sniff=0,jump=0;
      switch(state){
        case "sleep":lie=1;if(t===1)start("wake",3.5);break;
        case "wake":lie=1-blend;if(t===1)start("stretch",4);break;
        case "stretch":stretch=Math.sin(pi*t)**2;if(t===1)walkNext();break;
        case "walk":{
          const a=route[index],b=route[next],dy=level(next)-level(index),hop=Math.abs(dy)>.2;
          const u=hop?blend:t;
          p.x=a[0]+(b[0]-a[0])*u;p.z=seat+a[1]+(b[1]-a[1])*u;
          jump=hop?Math.sin(pi*u):0;p.y=level(index)+dy*u+.26*jump;
          root.rotation.y=turn(root.rotation.y,Math.atan2(b[0]-a[0],b[1]-a[1]),1-Math.exp(-dt*8));
          walk=hop?0:blocked?0:Math.min(1,age*5,Math.max(0,duration-age)*5);
          stride+=dt*walk*speed*22;sniff=blocked?.3:0;
          if(t===1){
            index=next;
            if(index===route.length-1)start("hearth",20+id*9+rand()*16);
            else if(index===0)start("curl",4);
            else if(dir===1 && index===(id===0?3:1))start("look",id===0?5:3.3);
            else walkNext();
          }
          break;
        }
        case "look":sniff=Math.sin(pi*t)**2;if(t===1)walkNext();break;
        case "hearth":
          sit=ease(Math.min(1,age/2,(duration-age)/2));
          root.rotation.y=turn(root.rotation.y,Math.atan2(-p.x,-r.d/2-p.z),1-Math.exp(-dt*2));
          if(t===1){dir=-1;walkNext();}break;
        case "curl":
          lie=blend;root.rotation.y=turn(root.rotation.y,homeYaw,1-Math.exp(-dt*2));
          if(t===1){dir=1;start("sleep",nap*(.8+.5*rand()));}break;
      }
      pose(lie,sit,stretch,walk,sniff,jump);
      if(id===2 && bird){
        const dx=bird.x-p.x,dz=bird.z-p.z;
        const near=Math.hypot(dx,dz)<1.75 && bird.y<1.3 && !walk && !jump;
        attention+=((near?1:0)-attention)*(1-Math.exp(-(state==="sleep"?.10:dt)*2.6));
        const yaw=Math.atan2(dx,dz)-root.rotation.y;
        head.rotation.y=turn(head.rotation.y,Math.max(-1.28,Math.min(1.28,Math.atan2(Math.sin(yaw),Math.cos(yaw)))),attention);
        head.position.y+=.035*attention;head.rotation.x-=.22*attention;
        if(attention>.45){eyes.visible=true;lids.visible=false;}
      }
      if(id===1 && state==="hearth"){
        const wash=ease(Math.max(0,Math.min(1,(age-7)/1.5,(16-age)/1.5)));
        legs[0].position.y+=.075*wash;legs[0].rotation.x-=1.04*wash;
        head.rotation.x+=wash*(.36+.13*Math.cos(age*4));
        head.rotation.y-=.37*wash;
      }
    };
  };
  const create=(room,r)=>{
    const cats=[0,1,2].map(id=>makeCat(room,r,id));
    return (dt,calm,visitor,bird)=>{
      if(calm || document.hidden || !room.visible)return;
      for(const update of cats)update(dt,visitor,bird);
    };
  };
  BL.pokerLoungeCats={create};
})();
