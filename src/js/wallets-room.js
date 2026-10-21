// VAC 2: Free Hardware Wallets, a crammed, slightly dubious whitewashed giveaway store around one vending machine,
// within the interior contract.
(() => {
  "use strict";
  const BL=window.BL,S=BL.scene,{block}=BL.dsbModels,{prop}=BL.walletsModels;
  // Picks are by sphere: a unit box gives a target its centre.
  const PICK={verts:[-.5,-.5,-.5,.5,.5,.5],faces:[],lines:[]};
  const build=()=>{
    const root=S.createNode({visible:false}),solids=[],fixtures=[];
    const C={wall:"#efe6d4",trim:"#2f6aa0",wood:"#694b34",cream:"#fff4df",red:"#c8352a",gold:"#f2c14e",ink:"#17191c",pink:"#ff4fd8"};
    const label=(p,t,x,y,z,size=.3,c=C.cream)=>{const n=BL.dsbModels.sign(p,t,x,y,z,size,c);n.depthBias=-.2;return n;};
    const solid=(x,z,w,d)=>solids.push([x-w/2,x+w/2,z-d/2,z+d/2]);
    const plant=(x,z)=>{const n=S.createNode({geometry:BL.dressing.withoutRulers("planter"),position:{x,y:0,z}});S.addChild(root,n);solid(x,z,.7,.7);fixtures.push({node:n,floor:0,kind:"plant"});};
    // A wall piece facing into the room: `yaw` turns its +z face off the wall, `tilt` rolls it askew.
    const onWall=(n,yaw,tilt=0)=>{n.rotation.y=yaw;n.rotation.z=tilt;return n;};
    // Floor/ceiling are segmented for the software renderer and mobile culling: a chequer of cream and blue tiles.
    for(let x=-6;x<=6;x+=2)for(let z=-7;z<=7;z+=2){block(root,(x+z)%4?"#e8dfcc":"#3c6e9c",x,-.08,z,1.985,.16,1.985);block(root,"#e9e1d0",x,4.6,z,2,.14,2);}
    for(const x of [-7,7])for(let z=-6.5;z<8;z+=3)block(root,C.wall,x,2.3,z,.3,4.6,3);
    for(let x=-5.5;x<7;x+=3)block(root,C.wall,x,2.3,-8,3,4.6,.3);
    for(const x of [-4.5,4.5])block(root,C.wall,x,2.3,8,5,4.6,.3);block(root,C.wall,0,3.8,8,4,1.6,.3);
    for(const x of [-6.82,6.82])block(root,C.trim,x,1,0,.05,.14,15.6);block(root,C.trim,0,1,-7.82,13.6,.14,.05);
    for(const z of [-5,0,5])block(root,C.wood,0,4.4,z,13.8,.22,.24);
    const exitDoor=block(root,C.trim,0,1.5,7.82,2.8,3,.16);const exitLabel=label(root,"CHORA",0,3.25,7.6,.33,C.gold);exitLabel.rotation.y=Math.PI;
    // The machine at the back under its own name; the small print on the wall beside it.
    const vendor=prop(root,"vendor",0,0,-6.9);solid(0,-6.9,2,1.2);fixtures.push({node:vendor,floor:0,kind:"vendor"});
    const marquee=block(root,C.red,0,3.25,-7.0,2.6,.62,.12);marquee.glow=.3;label(root,"FREE WALLETS",0,3.11,-6.93,.32,C.gold);
    block(root,C.wood,3.5,1.85,-7.8,3.3,1,.08);block(root,C.trim,3.5,1.85,-7.75,3.1,.84,.03);
    label(root,"100% legit.",3.5,1.96,-7.71,.25,C.cream);label(root,"Trust me bro.",3.5,1.58,-7.71,.25,C.cream);
    // Shelves of boxed devices along the sides, a stock rack packed to the top at the back, two island shelves down
    // the middle, open crates by the machine and heaps of cartons in the corners.
    for(const [x,yaw] of [[-6.6,Math.PI/2],[6.6,-Math.PI/2]])for(const z of [-3.5,1])fixtures.push({node:prop(root,"shelf",x,0,z,z>0?1:0,yaw),floor:0,kind:"shelf"});
    for(const z of [-3.5,1]){solid(-6.6,z,.6,2.5);solid(6.6,z,.6,2.5);}
    fixtures.push({node:prop(root,"rack",-5.4,0,-7.45),floor:0,kind:"shelf"});solid(-5.4,-7.45,2.4,.6);
    for(const [x,v] of [[-3.4,0],[3.4,1]]){fixtures.push({node:prop(root,"gondola",x,0,-1.2,v),floor:0,kind:"shelf"});solid(x,-1.2,.9,2.6);}
    for(const [x,z,v] of [[-2.4,-6.8,0],[-3.6,-6.2,1]]){prop(root,"crate",x,0,z,v);solid(x,z,1,.8);}
    for(const [x,z,v,yaw] of [[-5.6,-5.5,0,.3],[6,6.9,2,-.4],[-5,7.1,1,.2]]){prop(root,"cartons",x,0,z,v,yaw);solid(x,z,1.1,1);}
    // The till: the counter marked FREE, the register and a card reader on it.
    block(root,C.wood,4.2,.5,4.6,2.6,1,1);block(root,C.cream,4.2,1.04,4.6,2.76,.08,1.14);block(root,C.trim,4.2,.5,5.12,2.4,.18,.02);solid(4.2,4.6,2.6,1);
    label(root,"FREE",4.2,.42,5.14,.3,C.gold);prop(root,"register",5,1.08,4.5);prop(root,"reader",3.5,1.08,4.75);
    // Display cases of the two devices themselves, lit from below, each named on its plinth.
    const devices=BL.walletBombs.LOOKS;
    devices.forEach((look,i)=>{
      const z=2.8+i*1.7;
      fixtures.push({node:prop(root,"vitrine",-4.4,0,z),floor:0,kind:"vitrine"});Object.assign(prop(root,"device",-4.4,1.02,z,i,.6+i*.5).scale,{x:1.6,y:1.6,z:1.6});prop(root,"vitrine-glass",-4.4,0,z);solid(-4.4,z,.84,.84);
      onWall(label(root,look.name.toUpperCase(),-3.99,.62,z,.12,C.gold),Math.PI/2);
    });
    // The neon over the left shelves: FREE in pink, flickering (`flicker`).
    const neon=onWall(prop(root,"neon",-6.82,3.4,-1.2),Math.PI/2),neonWord=onWall(label(root,"FREE",-6.8,3.21,-1.2,.5,C.pink),Math.PI/2);
    // Discount stickers slapped on askew.
    for(const [x,y,z,yaw,tilt,text] of [[-2.2,3.5,-7.83,0,.22,"FREE!"],[-4.6,2.7,7.83,Math.PI,-.18,"-100%"],[6.83,3.1,-1.2,-Math.PI/2,.26,"0 SATS"],[2.5,3.6,-7.83,0,-.3,"100% OFF"]]){
      onWall(prop(root,"sticker",x,y,z),yaw,tilt);
      const n=label(root,text,x,y-.08,z,text.length>6?.08:.11,C.red);onWall(n,yaw,tilt);n.position.x+=Math.sin(yaw)*.012;n.position.z+=Math.cos(yaw)*.012;
    }
    // Posters with the shop's assurances.
    for(const [x,y,z,yaw,lines] of [[-5.4,3.55,-7.83,0,["NO REFUNDS"]],[6.83,3.35,1,-Math.PI/2,["SEED PHRASE","PRE-FILLED"]],[6.83,2.6,6.2,-Math.PI/2,["SMILE,","YOU'RE ON CCTV"]]]){
      const w=lines.reduce((m,t)=>Math.max(m,t.length),0)*.13+.3,h=lines.length*.32+.2;
      onWall(block(root,C.ink,x,y,z,w,h,.03),yaw);
      lines.forEach((t,k)=>onWall(label(root,t,x+Math.sin(yaw)*.02,y+h/2-.33-k*.32,z+Math.cos(yaw)*.02,.2,k?C.gold:C.cream),yaw));
    }
    // Two cameras watching the floor from opposite corners, their lights blinking (`flicker`).
    const leds=[];
    for(const [x,z,yaw] of [[6.6,-7.6,-.72],[-6.6,7.6,2.43]]){prop(root,"cctv",x,4,z,0,yaw);const s=Math.sin(yaw),c=Math.cos(yaw);leds.push(prop(root,"cctv-led",x+s*.27,4.02,z+c*.27,0,yaw));}
    // The staff door, taped shut, and the corner where one went off: a charred crate behind tape on two posts.
    onWall(prop(root,"door",6.84,0,-1.2),-Math.PI/2);label(root,"STAFF ONLY",6.8,2.35,-1.2,.13,C.red).rotation.y=-Math.PI/2;
    for(const a of [.9,-.9]){const t=prop(root,"tape",6.8,1.05,-1.2,0,-Math.PI/2);t.rotation.z=a;t.scale.x=1.3;}
    prop(root,"crate",5.7,0,-6.9,2);prop(root,"soot",5.6,0,-6.4);solid(5.7,-6.9,1,.8);
    prop(root,"post",4.6,0,-5.8);solid(4.6,-5.8,.34,.34);
    for(const [y,sag] of [[.92,.02],[.6,-.03]]){const t=prop(root,"tape",5.72,y,-5.8);t.scale.x=2.24;t.rotation.z=sag;}
    plant(-2.8,7.2);plant(2.8,7.2);plant(-6.3,5.8);
    const zone=BL.dsbMenuZones.zone,menuZones=[zone("machine","Free wallets",0,-5.6,1.6,1.1,3)];
    const reviews={
      "wallets-entrance":{position:{x:0,y:0,z:5.6},yaw:0,pitch:.08,dist:3},
      "wallets-machine":{position:{x:0,y:0,z:-5},yaw:0,pitch:.04,dist:3},
      "wallets-sign":{position:{x:3.4,y:0,z:-6},yaw:0,pitch:-.05,dist:2.4},
      "wallets-wide":{position:{x:0,y:0,z:4.6},yaw:0,pitch:.2,dist:4.2}
    };
    // Five lamps and one slot left for a blast's flash; the second lamp, by the neon, takes its pink and its flicker.
    const lighting={clear:[.06,.05,.045],sky:[.6,.56,.5],ground:[.4,.34,.28],direct:[1,.92,.8],directStrength:.4,ambientFloor:.48,sun:{x:.3,y:.9,z:.2},shadowCenter:{x:0,y:2.3,z:0},shadowExtent:12,shadowStrength:.16,bloomStrength:.3,fog:[.06,.05,.045],fogNear:40,fogFar:80,lights:new Float32Array(48),lightCount:5};
    lighting.lights.set([0,3.9,-5.6,8,1.2,.75,.6,0,-4.5,4,-1.5,8,1.1,.62,.86,0,4.5,4,-1.5,8,1,.86,.64,0,4.2,3.9,4.6,7,1,.84,.6,0,0,4,6,8,1,.86,.64,0]);
    // The neon stutters out for a beat now and then; the cameras blink once a second and a half. Allocation-free.
    const flicker=t=>{
      const beat=t*.37%1,off=beat>.9&&Math.sin(t*53)>-.2||beat>.55&&beat<.57;
      neon.glow=neonWord.glow=off?.08:1+.08*Math.sin(t*11);
      const k=off?.55:1;lighting.lights[12]=1.1*k;lighting.lights[13]=.62*k;lighting.lights[14]=.86*k;
      const on=t%1.5<.75;for(let i=0;i<leds.length;i++)leds[i].glow=on?1:.05;
    };
    return {id:"free-wallets",root,lighting,lamps:5,exitDoor,vendor,screen:vendor,flicker,solids,seats:[],reviews,menuZones,fixtures,machine:{x:0,z:-5.6},counts:{lights:5,cases:devices.length,cameras:leds.length},dimensions:{width:14,depth:16,height:4.6},groundAt:()=>0,ceiling:4.53,spawnYaw:0,followDistance:3,spawn:{x:0,y:0,z:5.6},exit:{x:0,y:0,z:7},bounds:{minX:-6.7,maxX:6.7,minZ:-7.7,maxZ:7.7},browseGoals:Object.values(reviews).map(r=>r.position)};
  };
  // Outside: the beach plaza in front of the store, where devices are thrown and set down.
  const VIEWS={"wallets-plaza":{yaw:.12,pitch:.34,dist:15,target:{x:26,y:4.5,z:66}}};
  BL.walletsRoom={build,PICK,VIEWS};
})();
