// Free Hardware Wallets' furniture: the vending machine, crates and cartons of parody devices, shelves and racks, the
// till, the display cases, the neon, the camera, the tape. Immutable shared meshes.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,cache=new Map(),scoped=M.track(()=>cache.clear());
  const VENDOR_STOCK=[1,0,2,3,4,5];
  // The baked stock and its live screen overlay share exactly the same fit and placement.
  const vendorLayout=index=>{
    const v=BL.walletBombs.geometryOf(VENDOR_STOCK[index]).verts;
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let k=0;k<v.length;k+=3){minX=Math.min(minX,v[k]);maxX=Math.max(maxX,v[k]);minZ=Math.min(minZ,v[k+2]);maxZ=Math.max(maxZ,v[k+2]);}
    return {x:-.48+(index%2)*.6,y:2.25-Math.floor(index/2)*.49,z:.59,cx:(minX+maxX)/2,cz:(minZ+maxZ)/2,scale:Math.min(.48/(maxX-minX),.38/(maxZ-minZ))};
  };
  const geometry=(kind,variant=0)=>{
    scoped.use();const key=kind+":"+variant;if(cache.has(key))return cache.get(key);
    const parts=[],b=(c,x,y,z,w,h,d,e=0)=>parts.push(M.box({color:c,w,h,d,emissive:e,offset:{x,y,z}}));
    const dark="#17191c",steel="#9aa3ab",orange="#ff8a1f",cream="#f6f1e4",card="#c49a6c",tape="#e0cfa4",red="#c8352a";
    // A taped shipping carton standing on (x, y, z), turned by a, with a red handling mark on its front.
    const carton=(x,y,z,w,h,d,a,tone=card)=>{
      // Thin strips on the outside, rather than a solid band whose top coincides with the cardboard.
      const g=M.merge(M.box({color:tone,w,h,d,offset:{y:h/2}}),M.box({color:tape,w:w+.012,h:.008,d:.1,offset:{y:h+.008}}),M.box({color:tape,w:.1,h:.008,d:d+.012,offset:{y:h+.02}}),
        ...[-1,1].map(side=>M.box({color:tape,w:.1,h:h*.5,d:.006,offset:{y:h*.75,z:side*(d/2+.006)}})),
        M.box({color:red,w:w*.3,h:h*.16,d:.006,offset:{x:-w*.22,y:h*.4,z:d/2+.009}}),M.box({color:dark,w:.05,h:h*.2,d:.006,offset:{x:w*.26,y:h*.4,z:d/2+.009}}));
      parts.push(M.moved(M.turnedY(g,a),x,y,z));
    };
    // A boxed device: an orange or cream product shot on the front.
    const boxed=(x,y,z,w,h,d,i)=>{b(i&1?"#f2efe8":"#ffb46a",x,y+h/2,z,w,h,d);b(i&1?"#ff2a2a":"#121416",x,y+h*.55,z+d/2+.004,w*.42,h*.36,.01,i&1?.6:0);};
    if(kind==="vendor"){
      // A red machine on a plinth: a glowing window of devices in rows, the tray they drop into and a coin slot.
      b("#3a3d42",0,.08,0,2,.16,1.2);b("#c8352a",0,1.45,0,1.9,2.6,1.1);b("#a32a21",0,2.8,0,1.96,.1,1.16);
      b(dark,-.18,1.75,.556,1.3,1.6,.02);b("#2a4a5c",-.18,1.75,.562,1.22,1.52,.01,.35);
      for(let r=0;r<3;r++){b(steel,-.18,2.02-r*.49,.57,1.2,.03,.03);for(let c=0;c<2;c++){
        const index=r*2+c,{x,y,z,cx,cz,scale}=vendorLayout(index),g=M.merge(index===3?BL.walletBombs.passpoorScreenGeometry():index===4?BL.walletBombs.jadedTrackingGeometry():variant===1&&index===5?BL.walletBombs.snitchPhotoGeometry():BL.walletBombs.geometryOf(VENDOR_STOCK[index]));
        for(let k=0;k<g.verts.length;k+=3){g.verts[k]=(g.verts[k]-cx)*scale;g.verts[k+1]*=scale;g.verts[k+2]=(g.verts[k+2]-cz)*scale;}
        parts.push(M.moved(M.turnedX(g,Math.PI/2),x,y,z));
      }}
      b(dark,.68,1.95,.556,.32,.5,.02);b("#ffd66b",.68,2.05,.57,.18,.06,.01,1);b(steel,.68,1.75,.57,.08,.16,.02);
      b(dark,-.18,.62,.556,1.1,.34,.04);b("#2b2d31",-.18,.55,.5,1,.2,.1);
    }else if(kind==="crate"){
      // An open timber crate heaped with devices; variant 2 is the one that went off, charred and split.
      const burnt=variant===2;
      b(burnt?"#2b2420":"#7b5b3c",0,.3,0,1,.6,.8);b(burnt?"#1a1614":"#5c4129",0,.62,0,.9,.04,.7);
      if(burnt){for(const [x,a] of [[-.42,.5],[.38,-.7]]){const g=M.box({color:"#3a2e26",w:.08,h:.7,d:.7});M.turnedZ(g,a);parts.push(M.moved(g,x,.55,0));}for(const [x,z] of [[-.2,.1],[.15,-.15],[.05,.2]])b("#0f0e0d",x,.66,z,.2,.05,.16);}
      else for(let i=0;i<9;i++){const x=-.32+(i%3)*.32,z=-.24+Math.floor(i/3)*.24,card=(i+variant)&1;b(card?cream:orange,x,.68,z,card?.16:.22,.05,card?.2:.07);if(!card)b("#121416",x-.02,.71,z,.12,.01,.05);}
    }else if(kind==="shelf"){
      // A wall shelf of boxed devices, each box a printed product shot.
      for(const y of [.6,1.3,2])b("#694b34",0,y,0,2.4,.06,.5);for(const x of [-1.18,1.18])b("#4b3424",x,1.15,0,.08,2.3,.54);
      for(const y of [.6,1.3,2])for(let i=0;i<5;i++){const x=-.9+i*.45,card=(i+variant+Math.round(y*10))&1;b(card?"#f2efe8":"#ffb46a",x,y+.17,0,.34,.28,.3);b(card?"#ff2a2a":"#121416",x,y+.19,.153,.14,.1,.01,card?.6:0);}
      // Overstock squeezed on top.
      carton(-.6,2.03,0,.7,.36,.42,.06);carton(.35,2.03,0,.6,.3,.4,-.1);boxed(.9,2.03,0,.3,.24,.26,variant);
    }else if(kind==="rack"){
      // A steel stock rack against the back wall, every level packed with cartons and loose boxes.
      for(const x of [-1.16,1.16])for(const z of [-.28,.28])b("#5c6168",x,1.3,z,.06,2.6,.06);
      for(const y of [.12,.82,1.52,2.22])b("#7d838a",0,y,0,2.36,.05,.58);
      [[.12,0],[.82,1],[1.52,2],[2.22,3]].forEach(([y,k])=>{
        let x=-1.02;for(let i=0;x<.95;i++){const w=.34+((i*7+k*3)%4)*.08,h=.28+((i*5+k)%3)*.1;if(x+w>1.1)break;
          if((i+k)%3===2)boxed(x+w/2,y+.025,0,w*.9,h,.42,i+k);else carton(x+w/2,y+.025,(i%2)*.04-.02,w*.95,Math.min(h+.1,.62),.48,((i*3+k)%5-2)*.04,(i+k)&1?card:"#b8895c");x+=w+.03;}
      });
    }else if(kind==="gondola"){
      // A double-sided island shelf, long along z, stocked on both faces, a red topper on each end.
      b("#3c6e9c",0,.08,0,.9,.16,2.6);b("#694b34",0,.8,0,.12,1.44,2.5);
      for(const y of [.18,.64,1.1])b("#8a6a4a",0,y,0,.88,.04,2.56);
      for(const side of [-1,1])for(const [y,k] of [[.2,0],[.66,1],[1.12,2]])for(let i=0;i<6;i++){
        const z=-1.06+i*.42,x=side*.24;if((i+k+variant)%4===3)carton(x,y,z,.32,.3,.36,(i%3-1)*.08);else{const a=(i+k)&1;b(a?"#f2efe8":"#ffb46a",x,y+.14,z,.3,.28,.34);b(a?"#ff2a2a":"#121416",x+side*.153,y+.16,z,.01,.1,.14,a?.6:0);}
      }
      for(const z of [-1.32,1.32]){b(red,0,1.7,z,.86,.36,.04);b("#ffd23a",0,1.7,z*1.016,.7,.2,.01,.5);}
    }else if(kind==="cartons"){
      // A heap of cartons, stacked a little askew.
      const heaps=[[[0,0,0,.7,.5,.6,.04],[.06,.5,.02,.62,.44,.52,-.08],[-.02,.94,-.03,.5,.36,.44,.12]],
        [[0,0,0,.8,.46,.62,0],[.5,0,.08,.5,.4,.5,.2],[.1,.46,0,.66,.42,.56,-.1],[.14,.88,.02,.4,.3,.36,.25]],
        [[0,0,0,.62,.6,.6,.1],[0,.6,0,.56,.5,.56,-.05],[.02,1.1,.02,.46,.4,.46,.15],[.52,0,.3,.42,.36,.42,.6],[-.5,0,-.2,.4,.3,.4,-.3]]];
      heaps[variant%3].forEach(([x,y,z,w,h,d,a],i)=>carton(x,y,z,w,h,d,a,i&1?"#b8895c":card));
    }else if(kind==="register"){
      // The till: a squat dark body, a key pad, a green display reading zeros, a receipt curling out.
      b("#2b2d31",0,.09,0,.56,.18,.44);b("#3a3d42",0,.2,-.06,.5,.06,.3);
      for(let r=0;r<3;r++)for(let c=0;c<4;c++)b(r+c&1?"#c9ced6":"#e6e2d6",-.15+c*.1,.24,-.14+r*.08,.07,.02,.06);
      b("#2b2d31",0,.36,.12,.36,.2,.06);b("#0e2a16",0,.37,.153,.3,.11,.01);for(let i=0;i<4;i++)b("#46ff72",-.09+i*.06,.37,.159,.035,.06,.006,1);
      b(cream,.2,.22,.2,.1,.02,.12);b(dark,-.2,.1,.225,.14,.06,.01);
    }else if(kind==="reader"){
      // A card reader that has seen things: a dark slab on a stand, one red light.
      b("#2b2d31",0,.03,0,.16,.06,.16);const g=M.box({color:"#3a3d42",w:.12,h:.2,d:.03,offset:{y:.1}});M.turnedX(g,-.35);parts.push(M.moved(g,0,.04,0));b("#ff3b2f",0,.17,.055,.02,.02,.01,1);
    }else if(kind==="blacklight-switch"){
      parts.push(M.bevelBox({color:dark,w:.36,h:.28,d:.035,bevel:.012}));
      const ring=M.lathe({profile:[[0,0],[.10,0],[.10,.035],[0,.035]],segments:16,color:steel});
      const button=M.lathe({profile:[[0,.03],[.078,.03],[.078,.055],[.067,.064],[0,.064]],segments:16,color:"#7645ff",emissive:1});
      parts.push(M.moved(M.turnedX(ring,Math.PI/2),0,0,.018),M.moved(M.turnedX(button,Math.PI/2),0,0,.018));
    }else if(kind==="vitrine"){
      // A display case: a timber plinth with a gold rim, a lit top and four slim posts; its glass is "vitrine-glass".
      b("#2b2d31",0,.304,0,.96,.608,.96);b("#d9a63a",0,.608,0,1.008,.04,1.008);b("#fff4df",0,.638,0,.744,.02,.744,.6);
      for(const x of [-.456,.456])for(const z of [-.456,.456])b("#d9a63a",x,1.104,z,.03,.952,.03);b("#d9a63a",0,1.58,0,.96,.04,.96);
    }else if(kind==="display-row"){
      // The plinth labels stay still while the room spins the devices above them.
      BL.walletBombs.LOOKS.forEach((look,i)=>{
        const name=M.merge(BL.dsbModels.text(look.name.toUpperCase(),"#f2c14e")),size=look.name.length>10?.09:.12;
        for(let k=0;k<name.verts.length;k++)name.verts[k]*=size;
        parts.push(M.moved(M.turnedY(name,Math.PI/2),.49,.38,i*1.8));
      });
    }else if(kind==="device"){
      // A display copy of one of the machine's devices (`walletBombs`' own looks), apart from their batches.
      parts.push(BL.walletBombs.geometryOf(variant));
    }else if(kind==="vitrine-glass"){
      b("#d5ece8",0,1.104,0,.912,.912,.912);
      // Only the four glass walls: a glass floor would coincide with the lit top at y=.648,
      // and a glass lid with the underside of the opaque cap at y=1.56.
      const g=M.merge(...parts);g.faces=g.faces.filter(f=>!f.i.every(i=>g.verts[i*3+1]===g.verts[f.i[0]*3+1]));
      g.glass=.22;M.noShadow(g);cache.set(key,g);return g;
    }else if(kind==="neon"){
      // The neon's tube outline and its dark backing board; the word itself is a sign in the same pink.
      b("#141218",0,0,-.03,2.1,.9,.04);
      for(const y of [-.38,.38])b("#ff4fd8",0,y,0,1.96,.04,.04,1);for(const x of [-.98,.98])b("#ff4fd8",x,0,0,.04,.8,.04,1);
      for(const x of [-.7,.7])b("#5c6168",x,.5,-.02,.02,.14,.02);
    }else if(kind==="cctv-mount"){
      // Fixed wall bracket; the camera head pans and tilts separately.
      b("#d8d6cf",0,0,-.12,.18,.24,.06);b("#bdbab1",0,-.02,0,.05,.05,.24);
    }else if(kind==="cctv"){
      // Neutral head looks along +z so its node can aim the lens directly at the player.
      b("#ece9e1",0,0,.14,.2,.18,.44);b("#ece9e1",0,.11,.14,.26,.04,.5);
      b(dark,0,0,.37,.13,.11,.02);b("#2a4a5c",0,0,.382,.07,.07,.01,.3);
    }else if(kind==="cctv-led"){
      b("#ff2a2a",0,0,0,.035,.035,.035,1);
    }else if(kind==="sticker"){
      // A starburst discount sticker, two squares crossed at 45 degrees on a red rim, face +z.
      for(const [c,s,z] of [[red,.74,0],["#ffd23a",.66,.012]])for(const [a,dz] of [[0,0],[Math.PI/4,.004]]){const g=M.box({color:c,w:s,h:s,d:.006,emissive:c===red?0:.25,offset:{z:z+dz}});M.turnedZ(g,a);parts.push(g);}
    }else if(kind==="tape"){
      // Caution tape, one metre of yellow and black, about x; the room stretches it by scale.x.
      for(let i=0;i<10;i++)b(i&1?"#1d1b1a":"#ffd23a",-.45+i*.1,0,0,.1,.08,.006,i&1?0:.2);
    }else if(kind==="post"){
      // A barrier post: a weighted base, a striped pole, a cap.
      b("#2b2d31",0,.03,0,.34,.06,.34);for(let i=0;i<4;i++)b(i&1?"#f2efe8":red,0,.12+i*.22,0,.06,.22,.06);b("#2b2d31",0,1.0,0,.09,.06,.09);
    }else if(kind==="soot"){
      // A scorch on the floor where something free went off.
      const rand=BL.math.mulberry32(2121);for(let i=0;i<14;i++){const a=rand()*6.28,r=rand()*.7,s=.18+rand()*.32;b(i<5?"#0f0e0d":"#2b2420",Math.cos(a)*r,.004+i*.003,Math.sin(a)*r,s,.004,s*(.6+rand()*.6));}
    }else if(kind==="door"){
      // A staff door: dark panels, a steel handle and a kick plate.
      b("#4b3424",0,1.05,0,1.04,2.1,.06);for(const y of [.6,1.5])b("#3a2a1c",0,y,.035,.8,.7,.01);b(steel,.38,1.05,.05,.04,.18,.04);b(steel,0,.12,.035,.96,.2,.01);
    }
    const g=M.merge(...parts);cache.set(key,g);return g;
  };
  const prop=(p,kind,x,y,z,variant=0,yaw=0)=>{const n=S.createNode({geometry:geometry(kind,variant),position:{x,y,z},rotation:{x:0,y:yaw,z:0}});S.addChild(p,n);return n;};
  BL.walletsModels={geometry,prop,vendorLayout};
})();
