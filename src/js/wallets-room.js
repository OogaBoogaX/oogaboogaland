// VAC 2: Free Hardware Wallets, a crammed, slightly dubious whitewashed giveaway store around one vending machine,
// within the interior contract.
(() => {
  "use strict";
  const BL=window.BL,S=BL.scene,{block}=BL.dsbModels;
  const SOLID_PROPS=new Set(["vendor","shelf","rack","gondola","crate","cartons","vitrine","vitrine-glass","post","register","reader"]);
  // Picks are by sphere: a unit box gives a target its centre.
  const PICK={verts:[-.5,-.5,-.5,.5,.5,.5],faces:[],lines:[]};
  const build=()=>{
    // Only clear tiny surface seams on foot; boxes and furniture must be jumped onto.
    const root=S.createNode({visible:false}),solids=[],fixtures=[],collision=BL.solidProps.create(),step=.02;
    const prop=(parent,kind,x,y,z,variant=0,yaw=0)=>{const node=BL.walletsModels.prop(parent,kind,x,y,z,variant,yaw);if(SOLID_PROPS.has(kind))collision.add(node);return node;};
    const C={wall:"#efe6d4",trim:"#2f6aa0",wood:"#694b34",cream:"#fff4df",red:"#c8352a",gold:"#f2c14e",ink:"#17191c",pink:"#ff4fd8"};
    const label=(p,t,x,y,z,size=.3,c=C.cream)=>{const n=BL.dsbModels.sign(p,t,x,y,z,size,c);n.depthBias=-.2;return n;};
    const solid=(x,z,w,d)=>solids.push([x-w/2,x+w/2,z-d/2,z+d/2]);
    const plant=(x,z)=>{const n=S.createNode({geometry:BL.dressing.withoutRulers("planter"),position:{x,y:0,z}});S.addChild(root,n);collision.add(n);solid(x,z,.7,.7);fixtures.push({node:n,floor:0,kind:"plant"});};
    // A wall piece facing into the room: `yaw` turns its +z face off the wall, `tilt` rolls it askew.
    const onWall=(n,yaw,tilt=0)=>{n.rotation.y=yaw;n.rotation.z=tilt;return n;};
    // Floor/ceiling are segmented for the software renderer and mobile culling: a chequer of cream and blue tiles.
    for(let x=-6;x<=6;x+=2)for(let z=-7;z<=7;z+=2){block(root,(x+z)%4?"#e8dfcc":"#3c6e9c",x,-.08,z,1.985,.16,1.985);block(root,"#e9e1d0",x,4.6,z,2,.14,2);}
    for(const x of [-7,7])for(let z=-6.5;z<8;z+=3)block(root,C.wall,x,2.3,z,.3,4.6,3);
    for(let x=-5.5;x<7;x+=3)block(root,C.wall,x,2.3,-8,3,4.6,.3);
    for(const x of [-4.5,4.5])block(root,C.wall,x,2.3,8,5,4.6,.3);block(root,C.wall,0,3.8,8,4,1.6,.3);
    // The room shell reflects violet light without fluorescing like the pale props and clothing.
    const shell=root.children.map(node=>({node,geometry:node.geometry})),uvShell=BL.dsbModels.cube("#4531b0");
    for(const x of [-6.82,6.82])block(root,C.trim,x,1,0,.05,.14,15.6);block(root,C.trim,0,1,-7.82,13.6,.14,.05);
    for(const z of [-5,0,5])collision.add(block(root,C.wood,0,4.4,z,13.8,.22,.24));
    const exitDoor=block(root,C.trim,0,1.5,7.82,2.8,3,.16);const exitLabel=label(root,"CHORA",0,3.25,7.6,.33,C.gold);exitLabel.rotation.y=Math.PI;
    // The machine at the back under its own name; the small print on the wall beside it.
    const vendor=prop(root,"vendor",0,0,-6.9);solid(0,-6.9,2,1.2);fixtures.push({node:vendor,floor:0,kind:"vendor"});
    // Centre the wall sign between the machine's top (2.85) and the ceiling's underside (4.53).
    const marqueeY=(2.85+4.53)/2;
    const marquee=block(root,C.red,0,marqueeY,-7.78,2.6,.62,.12);marquee.glow=.3;label(root,"FREE WALLETS",0,marqueeY-.14,-7.71,.32,C.gold);
    block(root,C.wood,3.5,1.85,-7.8,3.3,1,.08);block(root,C.trim,3.5,1.85,-7.75,3.1,.84,.03);
    label(root,"100% legit.",3.5,1.96,-7.71,.25,C.cream);label(root,"Trust me bro.",3.5,1.58,-7.71,.25,C.cream);
    // Shelves of boxed devices along the sides, a stock rack at the back, and two freestanding shelves aligned
    // with the right wall's shelves on either side of the staff door, with a wider aisle behind them.
    for(const [x,yaw] of [[-6.6,Math.PI/2],[6.6,-Math.PI/2]])for(const z of [-3.5,1])fixtures.push({node:prop(root,"shelf",x,0,z,z>0?1:0,yaw),floor:0,kind:"shelf"});
    for(const z of [-3.5,1]){solid(-6.6,z,.6,2.5);solid(6.6,z,.6,2.5);}
    fixtures.push({node:prop(root,"rack",-5.4,0,-7.45),floor:0,kind:"shelf"});solid(-5.4,-7.45,2.4,.6);
    for(const [z,v] of [[-3.5,0],[1,1]]){fixtures.push({node:prop(root,"gondola",3.9,0,z,v),floor:0,kind:"shelf"});solid(3.9,z,.9,2.6);}
    for(const [x,z,v] of [[-2.4,-6.8,0],[-3.6,-6.2,1]]){prop(root,"crate",x,0,z,v);solid(x,z,1,.8);}
    for(const [x,z,v,yaw] of [[-5.6,-5.5,0,.3],[6,6.9,2,-.4],[-5,7.1,1,.2]]){prop(root,"cartons",x,0,z,v,yaw);solid(x,z,1.1,1);}
    // The till faces the room's centre; its counter, sign and devices turn together.
    const checkout=S.createNode({position:{x:3.9,y:0,z:4.6},rotation:{x:0,y:-Math.PI/2,z:0}});S.addChild(root,checkout);
    collision.add(block(checkout,C.wood,0,.5,0,2.6,1,1));collision.add(block(checkout,C.cream,0,1.04,0,2.76,.08,1.14));block(checkout,C.trim,0,.5,.52,2.4,.18,.02);solid(3.9,4.6,1,2.6);
    label(checkout,"FREE",0,.42,.54,.3,C.gold);prop(checkout,"register",.8,1.08,-.1);prop(checkout,"reader",-.7,1.08,.15);
    const blacklightSwitch=prop(checkout,"blacklight-switch",0,.72,-.54,0,Math.PI);blacklightSwitch.glow=.12;
    label(checkout,"BLACKLIGHT",-.65,.688,-.565,.10,C.cream).rotation.y=Math.PI;
    const nearBlacklight=(p,feet)=>feet>=-.1&&feet<.3&&p.x>4.44&&Math.hypot(p.x-4.44,p.z-4.6)<1.5;
    // Display cases along the left aisle, lit from below, each named on its plinth.
    const devices=BL.walletBombs.LOOKS,displays=[],jadedEyes=[];
    const passpoorBalances=[],balanceFrames=Array.from({length:100},(_,i)=>BL.walletBombs.passpoorBalanceGeometry(i));
    const addPasspoorBalance=(pivot,parent)=>{
      const digits=S.createNode({geometry:balanceFrames[0]});S.addChild(parent,digits);
      passpoorBalances.push({pivot,digits,x:parent.position.x,z:parent.position.z+.072*parent.scale.z,startedAt:-1});
    };
    const passpoorSlot=BL.walletsModels.vendorLayout(3);
    const passpoorParent=S.createNode({position:{x:passpoorSlot.x-passpoorSlot.cx*passpoorSlot.scale,y:passpoorSlot.y+passpoorSlot.cz*passpoorSlot.scale,z:passpoorSlot.z},rotation:{x:Math.PI/2,y:0,z:0},scale:{x:passpoorSlot.scale,y:passpoorSlot.scale,z:passpoorSlot.scale}});
    S.addChild(vendor,passpoorParent);addPasspoorBalance(vendor,passpoorParent);
    const addJadedEyes=(pivot,parent)=>{
      const eyes=S.createNode({geometry:BL.walletBombs.jadedEyesGeometry()});S.addChild(parent,eyes);
      jadedEyes.push({pivot,eyes,x:parent.position.x-.092*parent.scale.x,z:parent.position.z+.153*parent.scale.z});
    };
    const jadeSlot=BL.walletsModels.vendorLayout(4);
    const jadeParent=S.createNode({position:{x:jadeSlot.x-jadeSlot.cx*jadeSlot.scale,y:jadeSlot.y+jadeSlot.cz*jadeSlot.scale,z:jadeSlot.z},rotation:{x:Math.PI/2,y:0,z:0},scale:{x:jadeSlot.scale,y:jadeSlot.scale,z:jadeSlot.scale}});
    S.addChild(vendor,jadeParent);addJadedEyes(vendor,jadeParent);
    prop(root,"display-row",-4.1,0,-4.5);
    devices.forEach((look,i)=>{
      const z=-4.5+i*1.8;
      fixtures.push({node:prop(root,"vitrine",-4.1,0,z),floor:0,kind:"vitrine"});prop(root,"vitrine-glass",-4.1,0,z);solid(-4.1,z,1.008,1.008);
      // Stand the shared model on its edge and centre its full rotating envelope inside the glass.
      const geometry=BL.walletBombs.geometryOf(i),v=geometry.verts;
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(let k=0;k<v.length;k+=3){minX=Math.min(minX,v[k]);maxX=Math.max(maxX,v[k]);minY=Math.min(minY,v[k+1]);maxY=Math.max(maxY,v[k+1]);minZ=Math.min(minZ,v[k+2]);maxZ=Math.max(maxZ,v[k+2]);}
      const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=(minZ+maxZ)/2;
      let radius=0;for(let k=0;k<v.length;k+=3)radius=Math.max(radius,Math.hypot(v[k]-cx,v[k+1]-cy));
      // Float at the glass's vertical centre. Rektdger centres its body, keeping the enlarged sleeve below it.
      // Fill the larger cube, leaving clearance above and around the full spin.
      const scale=Math.min(i===0?.4/Math.max(.0001,-minZ):.8/(maxZ-minZ),.41/radius);
      const pivot=S.createNode({position:{x:-4.1,y:i===0?1.104-cz*scale:1.104,z},rotation:{x:0,y:Math.PI/2+i*.5,z:0}});
      const device=S.createNode({geometry:i===3?BL.walletBombs.passpoorScreenGeometry():i===4?BL.walletBombs.jadedTrackingGeometry():geometry,position:{x:-cx*scale,y:cz*scale,z:-cy*scale},rotation:{x:Math.PI/2,y:0,z:0},scale:{x:scale,y:scale,z:scale}});
      S.addChild(root,pivot);S.addChild(pivot,device);displays.push(pivot);
      if(i===4)addJadedEyes(pivot,device);
      if(i===3)addPasspoorBalance(pivot,device);
    });
    // A retained photo replaces SeedSnitcher's four tiles flush with the screen, leaving SNITCH above it.
    // Canvas/portrait work happens on the shutter event; the ordinary animation only checks alignment.
    const snitchPhotos=[null,null];
    let snitchFacing=false,snitchShotAt=-Infinity,machineNear=false;
    const paintSnitchPhoto=photo=>{
      photo.context.fillStyle="#000000";photo.context.fillRect(0,0,128,128);
      photo.context.drawImage(blacklightLit?photo.albedo:photo.portrait,0,0,128,128);photo.surface.version++;
    };
    const snapSnitch=(index,actor,t)=>{
      let photo=snitchPhotos[index];
      if(!photo){
        const canvas=document.createElement("canvas"),portrait=document.createElement("canvas"),albedo=document.createElement("canvas");canvas.width=canvas.height=128;
        const surface={canvas,version:0,rect:[-.1,-.092,.2,.184],background:[0,0,0],bright:.6};
        const geometry={verts:[-.1,-.092,0,.1,-.092,0,.1,.092,0,-.1,.092,0],faces:[{i:[0,1,2,3],color:[255,255,255],emissive:1}],lines:[],castShadow:false,imageSurface:surface};
        // The screen face is at .136; a tiny clearance avoids coplanar depth fighting.
        const screen=S.createNode({geometry,position:{x:.025,y:.1365,z:.012},rotation:{x:-Math.PI/2,y:0,z:0}});
        // Under UV, shade the photo's pixels like the Ooga instead of bypassing the room light.
        screen.glow=blacklightLit?0:1;
        let parent=displays[5].children[0];
        if(index===1){
          const {x,y,z,cx,cz,scale}=BL.walletsModels.vendorLayout(5);
          parent=S.createNode({position:{x:x-cx*scale,y:y+cz*scale,z},rotation:{x:Math.PI/2,y:0,z:0},scale:{x:scale,y:scale,z:scale}});S.addChild(vendor,parent);
        }
        S.addChild(parent,screen);
        const device=index===1?vendor:parent,idleGeometry=device.geometry;
        const photoGeometry=index===1?BL.walletsModels.geometry("vendor",1):BL.walletBombs.snitchPhotoGeometry();
        photo=snitchPhotos[index]={portrait,albedo,surface,screen,device,idleGeometry,photoGeometry,context:canvas.getContext("2d"),flashUntil:0,expiresAt:0};
      }
      BL.hud.renderFaceIcon(photo.portrait,actor,null,128);
      // Preserve material whites for the room shader instead of applying UV to an already shaded icon.
      BL.hud.renderFaceIcon(photo.albedo,actor,null,128,true);
      photo.context.fillStyle="#ffffff";photo.context.fillRect(0,0,128,128);photo.surface.version++;
      photo.device.geometry=photo.photoGeometry;photo.screen.visible=true;photo.flashUntil=t+.12;photo.expiresAt=t+4.62;
    };
    // The neon over the left shelves: FREE in pink, flickering (`flicker`).
    const neon=onWall(prop(root,"neon",-6.82,3.4,-1.2),Math.PI/2),neonWord=onWall(label(root,"FREE",-6.8,3.21,-1.2,.5,C.pink),Math.PI/2);
    // Discount stickers slapped on askew.
    for(const [x,y,z,yaw,tilt,lines] of [[-2.2,3.5,-7.83,0,.22,["FREE!"]],[-4.6,2.7,7.83,Math.PI,-.18,["-100%"]],[6.83,3.1,-1.2,-Math.PI/2,.26,["0","SATS"]],[2.5,3.6,-7.83,0,-.3,["100%","OFF"]]]){
      const sticker=onWall(prop(root,"sticker",x,y,z),yaw,tilt);
      const longest=lines.reduce((n,t)=>Math.max(n,t.length),0),size=.62/((longest*4-1)*.16-.025),height=lines.length===1?.4:.3;
      // Centre the glyph bounds on the sticker, keeping both rows at the same letter size and tilt.
      lines.forEach((text,i)=>{
        const n=label(sticker,text,.08*size,((lines.length-1)/2-i)*.29-.32*height,.04,size,C.red);n.scale.y=height;
      });
    }
    // Posters with the shop's assurances.
    for(const [x,y,z,yaw,lines] of [[-5.4,3.55,-7.83,0,["NO REFUNDS"]],[4.6,2.7,7.83,Math.PI,["YOU'LL OWN NOTHING","AND BE HAPPY"]],[6.83,3.35,1,-Math.PI/2,["SEED PHRASE","PRE-FILLED"]],[6.83,3.05,4.6,-Math.PI/2,["SMILE,","YOU'RE ON CCTV"]]]){
      const w=lines.reduce((m,t)=>Math.max(m,t.length),0)*.13+.3,h=lines.length*.32+.2;
      onWall(block(root,C.ink,x,y,z,w,h,.03),yaw);
      lines.forEach((t,k)=>onWall(label(root,t,x+Math.sin(yaw)*.02,y+h/2-.33-k*.32,z+Math.cos(yaw)*.02,.2,k?C.gold:C.cream),yaw));
    }
    // An optimistic poster, corrected with a red marker, opposite the CCTV sign.
    const wagli=S.createNode({position:{x:-6.83,y:3.05,z:4.6},rotation:{x:0,y:Math.PI/2,z:0}});S.addChild(root,wagli);
    block(wagli,C.ink,0,0,0,2,1,.03);
    label(wagli,"WE'RE ALL",0,.18,.025,.2,C.cream);label(wagli,"GONNA MAKE IT",0,-.30,.025,.2,C.gold);
    const marker=(points,depth,scale=1)=>{
      for(let i=1;i<points.length;i++){
        const [x,y]=points[i-1],[xx,yy]=points[i],dx=xx-x,dy=yy-y;
        const stroke=block(wagli,"#ff443b",.195+((x+xx)/2-.195)*scale,-.05+((y+yy)/2+.05)*scale,depth,.018*scale,(Math.hypot(dx,dy)+.009)*scale,.008,.3);
        stroke.rotation.z=-Math.atan2(dx,dy);
      }
    };
    marker([[-.075,-.265],[.17,-.225],[.44,-.185]],.052);
    marker([[-.06,-.19],[.18,-.23],[.43,-.255]],.064);
    // Uneven, slanted strokes spell LOSE above the crossed-out MAKE.
    for(const points of [
      [[-.07,.17],[-.10,-.05],[.015,-.04]],
      [[.15,.16],[.075,.15],[.045,-.02],[.12,-.05],[.17,0],[.18,.13],[.15,.16]],
      [[.34,.16],[.25,.17],[.215,.09],[.31,.04],[.29,-.04],[.20,-.05]],
      [[.49,.17],[.39,.15],[.36,-.05],[.47,-.04]],
      [[.375,.06],[.46,.07]]
    ])marker(points,.052,.7);
    // A fixed bracket in each corner, with an independently aimed head and a light attached to its face.
    const cameras=[];
    for(const x of [-6.6,6.6])for(const z of [-7.6,7.6]){
      const yaw=Math.atan2(-x,-z);prop(root,"cctv-mount",x,4,z,0,yaw);
      const head=prop(root,"cctv",x+Math.sin(yaw)*.12,3.92,z+Math.cos(yaw)*.12,0,yaw);
      head.rotation.x=.3;
      cameras.push({head,led:prop(head,"cctv-led",.083,.04,.38)});
    }
    // The staff door, taped shut, and the corner where one went off: a charred crate behind tape on two posts.
    onWall(prop(root,"door",6.84,0,-1.2),-Math.PI/2);label(root,"STAFF ONLY",6.8,2.35,-1.2,.13,C.red).rotation.y=-Math.PI/2;
    for(const [a,x] of [[.9,6.8],[-.9,6.79]]){const t=prop(root,"tape",x,1.05,-1.2,0,-Math.PI/2);t.rotation.z=a;t.scale.x=1.3;}
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
    lighting.lights.set([0,3.9,-5.6,8,1.2,.75,.6,0,-4.5,4,-1.5,8,1.1,.62,.86,0,4.5,4,-1.5,8,1,.86,.64,0,3.9,3.9,4.6,7,1,.84,.6,0,0,4,6,8,1,.86,.64,0]);
    const normalLights=lighting.lights.slice(0,40),blacklightLights=new Float32Array(40);
    // Keep the unused lamp slots dark without moving the blast's flash slot.
    blacklightLights.set([0,4.15,-5,12,.3,.03,.9,1,0,4.15,0,12,.32,.025,.85,1,0,4.15,5,12,.3,.03,.9,1]);
    lighting.blacklight=new Float32Array(4);
    const normalMood={clear:lighting.clear,sky:lighting.sky,ground:lighting.ground,direct:lighting.direct,directStrength:lighting.directStrength,ambientFloor:lighting.ambientFloor,bloomStrength:lighting.bloomStrength,fog:lighting.fog};
    const blacklightMood={clear:[.009,.002,.022],sky:[.045,.012,.085],ground:[.014,.003,.028],direct:[.2,.025,.45],directStrength:.04,ambientFloor:.006,bloomStrength:.8,fog:[.009,.002,.022]};
    const blacklightTubes=[];
    // One fixture directly beneath each of the three ceiling beams.
    for(const [y,z] of [[4.22,-5],[4.22,0],[4.22,5]]){
      block(root,"#17191c",0,y+.045,z,12.8,.04,.14);
      const tube=block(root,"#7645ff",0,y,z,12.5,.045,.055,1);tube.glow=.03;blacklightTubes.push(tube);
    }
    let blacklightMode=false,blacklightLit=false,blacklightUntil=0;
    const applyBlacklight=on=>{
      if(on===blacklightLit)return;
      blacklightLit=on;Object.assign(lighting,on?blacklightMood:normalMood);lighting.lights.set(on?blacklightLights:normalLights);
      for(const part of shell)part.node.geometry=on?uvShell:part.geometry;
      for(const tube of blacklightTubes)tube.glow=on?1.4:.03;
      for(const photo of snitchPhotos)if(photo){photo.screen.glow=on?0:1;if(photo.screen.visible&&photo.flashUntil===0)paintSnitchPhoto(photo);}
      lighting.blacklight[3]=on?.7:0;
    };
    const toggleBlacklight=()=>{
      blacklightMode=!blacklightMode;applyBlacklight(blacklightMode);
      blacklightUntil=blacklightMode?performance.now()+30000:0;
      blacklightSwitch.glow=blacklightMode?1:.12;return blacklightMode;
    };
    // The neon stutters; all four cameras track the Ooga and blink on staggered cycles.
    const flicker=(t,target=null,aimHeight=0,actor=null)=>{
      if(blacklightMode){
        const left=(blacklightUntil-performance.now())/1000;
        if(left<=0)toggleBlacklight();
        else{
          // Off/on/off/on, one second steady, then off/on and the final shutoff.
          const dim=left<=1.5&&left>1.4||left<=1.3&&left>1.2||left<=.2&&left>.1;
          applyBlacklight(!dim);
        }
      }
      if(target){lighting.blacklight[0]=target.x;lighting.blacklight[1]=target.y+aimHeight;lighting.blacklight[2]=target.z;}
      for(let i=0;i<displays.length;i++)displays[i].rotation.y=Math.PI/2+i*.5+t*Math.PI/10;
      // Lose a sat each half-second while facing the visitor; hold at -99 until turning away.
      for(const balance of passpoorBalances){
        let facing=false;
        if(target){
          const c=Math.cos(balance.pivot.rotation.y),s=Math.sin(balance.pivot.rotation.y),dx=target.x-balance.pivot.position.x,dz=target.z-balance.pivot.position.z;
          const side=c*dx-s*dz-balance.x,front=s*dx+c*dz-balance.z;
          facing=front>.5*Math.max(.1,Math.hypot(side,front));
        }
        if(!facing)balance.startedAt=-1;
        else if(balance.startedAt<0)balance.startedAt=t;
        const elapsed=facing?t-balance.startedAt:0;
        const amount=facing?Math.min(99,1+Math.floor(elapsed*2)):0;
        balance.digits.geometry=balanceFrames[amount];
      }
      // Follow the visitor in each wallet's rotating screen frame, keeping pupils beneath the lids.
      for(const eye of jadedEyes){
        let shift=0;
        if(target){
          const c=Math.cos(eye.pivot.rotation.y),s=Math.sin(eye.pivot.rotation.y),dx=target.x-eye.pivot.position.x,dz=target.z-eye.pivot.position.z;
          const side=c*dx-s*dz-eye.x,front=s*dx+c*dz-eye.z;
          shift=.024*side/Math.max(.5,Math.hypot(side,front));
        }
        eye.eyes.position.x=shift;
      }
      for(const photo of snitchPhotos){
        if(!photo||!photo.screen.visible)continue;
        if(t>=photo.expiresAt){photo.screen.visible=false;photo.device.geometry=photo.idleGeometry;continue;}
        if(photo.flashUntil>0&&t>=photo.flashUntil){
          photo.flashUntil=0;paintSnitchPhoto(photo);
        }
      }
      if(target&&actor){
        const zone=menuZones[0],mx=Math.abs(target.x-zone.x),mz=Math.abs(target.z-zone.z);
        if(mx>zone.rx+.3||mz>zone.rz+.3)machineNear=false;
        if(!machineNear&&mx<=zone.rx&&mz<=zone.rz){machineNear=true;snapSnitch(1,actor,t);}
        const snitch=displays[5],dx=target.x-snitch.position.x,dz=target.z-snitch.position.z,d=Math.hypot(dx,dz);
        const facing=d>.6?(Math.sin(snitch.rotation.y)*dx+Math.cos(snitch.rotation.y)*dz)/d:-1;
        if(facing<.94)snitchFacing=false;
        if(facing>.985&&!snitchFacing&&t-snitchShotAt>5){
          snitchFacing=true;snitchShotAt=t;snapSnitch(0,actor,t);
        }
      }else snitchFacing=false;
      const beat=t*.37%1,off=beat>.9&&Math.sin(t*53)>-.2||beat>.55&&beat<.57;
      neon.glow=neonWord.glow=off?.08:1+.08*Math.sin(t*11);
      if(!blacklightLit){const k=off?.55:1;lighting.lights[12]=normalLights[12]*k;lighting.lights[13]=normalLights[13]*k;lighting.lights[14]=normalLights[14]*k;}
      for(let i=0;i<cameras.length;i++){
        const camera=cameras[i],p=camera.head.position;
        camera.led.glow=(t+i*.23)%1.5<.45?1:.05;
        if(target){
          const dx=target.x-p.x,dz=target.z-p.z;
          camera.head.rotation.y=Math.atan2(dx,dz);
          camera.head.rotation.x=Math.atan2(p.y-target.y-aimHeight,Math.hypot(dx,dz));
        }
      }
    };
    const bounds={minX:-6.7,maxX:6.7,minZ:-7.7,maxZ:7.7};
    const groundAt=(x,z,feet=0,_top,actor)=>Math.max(0,collision.supportAt(x,z,Number.isFinite(feet)?feet:0,step,actor?.bodyRadius||0));
    const clear=(ax,az,bx,bz,y,height,actor,flying)=>{
      const r=actor?.bodyRadius||.4;
      if(bx<bounds.minX+r||bx>bounds.maxX-r||bz<bounds.minZ+r||bz>bounds.maxZ-r)return false;
      const floor=flying?y:Math.max(y,groundAt(bx,bz,y,undefined,actor)),pad=flying?1e-5:step;
      return collision.segmentClear(ax,floor+pad,az,bx,floor+pad,bz,r,Math.max(0,height-pad))
        ||collision.escapeSegmentClear(ax,floor+pad,az,bx,floor+pad,bz,r,Math.max(0,height-pad));
    };
    return {id:"free-wallets",root,lighting,lamps:5,exitDoor,vendor,screen:vendor,blacklightSwitch,toggleBlacklight,nearBlacklight,get blacklightMode(){return blacklightMode;},flicker,cameras,solids,seats:[],reviews,menuZones,fixtures,machine:{x:0,z:-5.6},counts:{lights:5,cases:devices.length,cameras:cameras.length},dimensions:{width:14,depth:16,height:4.6},groundAt,
      walkable:(ax,az,bx,bz,y,h,a)=>clear(ax,az,bx,bz,y,h,a,false),flyable:(ax,az,bx,bz,y,h,a)=>clear(ax,az,bx,bz,y,h,a,true),
      ceilingAt:(x,z,y,a)=>Math.min(4.53,collision.ceilingAt(x,z,y,a?.bodyRadius||.4)),sync:collision.sync,dispose:collision.dispose,
      ceiling:4.53,spawnYaw:0,followDistance:3,spawn:{x:0,y:0,z:5.6},exit:{x:0,y:0,z:7},bounds,browseGoals:Object.values(reviews).map(r=>r.position)};
  };
  // Outside: the beach plaza in front of the store, where devices are thrown and set down.
  const VIEWS={"wallets-plaza":{yaw:.12,pitch:.34,dist:15,target:{x:26,y:4.5,z:66}}};
  BL.walletsRoom={build,PICK,VIEWS};
})();
