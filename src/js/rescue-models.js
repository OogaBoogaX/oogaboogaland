// Free Puppies Rescue's furniture: plank dog houses with gable roofs, food and water bowls, bones, travel crates, dog
// beds and baskets with puppies asleep in them, toys, food sacks, a pen, the yard's fence, the vet's corner, pendant
// lamps and a trail of paw prints. Immutable shared meshes.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,cache=new Map(),scoped=M.track(()=>cache.clear());
  const ROOFS=["#c8452f","#4f9a38","#2f8c8c","#e0b030","#2f6aa0","#d9822b"];
  const BEDS=["#c8452f","#2f6aa0","#4f9a38","#e0b030"];
  const TOYS=["#e8402f","#2f8cd8","#f2c14e","#6fbf4a"];
  const geometry=(kind,variant=0)=>{
    scoped.use();const key=kind+":"+variant;if(cache.has(key))return cache.get(key);
    const parts=[],b=(c,x,y,z,w,h,d,e=0)=>parts.push(M.box({color:c,w,h,d,emissive:e,offset:{x,y,z}}));
    const plank="#b98552",dark="#2a1d17",bone="#f2e6c8",steel="#9aa3ab",cream="#fff4df";
    // A copy of another of these pieces moved to (x, y, z) and turned by a, to merge into a bigger one.
    const piece=(k,v,x,y,z,a=0)=>parts.push(M.moved(M.turnedY(M.merge(geometry(k,v)),a),x,y,z));
    if(kind==="kennel"){
      // Planked walls on a low plinth, a dark doorway facing +z, a two-pitch roof and a bone over the door.
      b("#8a6a4a",0,.05,0,1.5,.1,1.5);
      for(let i=0;i<5;i++)b(i%2?plank:"#a8784a",0,.18+i*.19,0,1.34,.18,1.34);
      b(dark,0,.42,.672,.52,.62,.02);b(dark,0,.78,.672,.36,.12,.02);
      for(const s of [-1,1]){const r=M.box({color:ROOFS[variant%ROOFS.length],w:.98,h:.08,d:1.56});M.turnedZ(r,-s*.62);parts.push(M.moved(r,s*.36,1.32,0));}
      for(const z of [-.68,.68])b(plank,0,1.24,z,1.1,.3,.06);
      b(bone,0,1.12,.7,.34,.07,.04);for(const x of [-.18,.18])for(const y of [1.08,1.16])b(bone,x,y,.7,.07,.06,.05);
    }else if(kind==="bowl"){
      parts.push(M.lathe({profile:[[.13,0],[.2,.02],[.22,.09],[.19,.1],[.15,.03],[0,.03]],segments:12,color:steel}));
      b(variant?"#4f8fd8":"#7a4a22",0,.075,0,.26,.02,.26,variant?.15:0);
      if(!variant)for(const [x,z] of [[-.05,0],[.04,-.05],[.03,.06]])b("#8a5a2e",x,.095,z,.05,.03,.05);
    }else if(kind==="bone"){
      b(bone,0,.05,0,.42,.08,.09);for(const x of [-.22,.22])for(const z of [-.05,.05])b(bone,x,.05,z,.09,.09,.08);
    }else if(kind==="crate"){
      // A travel crate: timber frame, wire door.
      b("#7b5b3c",0,.36,0,1,.72,.7);b(dark,0,.36,.352,.7,.5,.01);for(let i=0;i<5;i++)b(steel,-.28+i*.14,.36,.36,.02,.5,.02);
    }else if(kind==="bed"){
      // A round dog bed: a raised rim round a sunk cushion.
      parts.push(M.lathe({profile:[[0,.02],[.42,.02],[.47,.1],[.44,.2],[.36,.19],[.33,.1],[0,.09]],segments:16,color:BEDS[variant%BEDS.length]}));
      parts.push(M.lathe({profile:[[0,.09],[.31,.09],[.3,.13],[0,.14]],segments:16,color:cream}));
    }else if(kind==="basket"){
      // A wicker basket: woven bands, a cushion, a handle hoop over the top.
      parts.push(M.lathe({profile:[[0,0],[.38,0],[.44,.26],[.4,.27],[.34,.04],[0,.04]],segments:14,color:"#b07a3e"}));
      for(const y of [.07,.15,.23])parts.push(M.lathe({profile:[[.4+y*.15,y-.012],[.41+y*.15,y],[.4+y*.15,y+.012]],segments:14,color:"#8a5a2a"}));
      parts.push(M.lathe({profile:[[0,.05],[.33,.05],[.32,.1],[0,.11]],segments:14,color:BEDS[variant%BEDS.length]}));
      for(let i=0;i<9;i++){const a=i/8*Math.PI;b("#8a5a2a",Math.cos(a)*.36,.26+Math.sin(a)*.3,0,.06,.06,.06);}
    }else if(kind==="sleeper"){
      // A puppy curled up asleep, in its breed's coat: a rounded loaf of a body, the head on its front paws facing +x
      // with its eyes shut and ears flopped, the tail wrapped round its side.
      const {makeVox,voxelGeometry}=M,v=makeVox(),COAT=0,SHADE=1,CREAM=2,DARK=3;
      v.fill(-5,3,0,3,-3,3,(x,y,z)=>y===0&&z===3?CREAM:COAT);
      for(const x of [-5,3])for(const z of [-3,3])for(let y=0;y<=3;y++)v.del(x,y,z);
      for(let x=-5;x<=3;x++){v.del(x,3,-3);v.del(x,3,3);}for(let z=-3;z<=3;z++){v.del(-5,3,z);v.del(3,3,z);}
      v.fill(4,7,0,3,-2,1,(x,y,z)=>x===7&&y===2&&(z===-2||z===1)?DARK:y===0?CREAM:COAT);
      v.fill(8,9,0,1,-1,0,(x,y,z)=>x===9&&y===1?DARK:CREAM);
      for(const z of [-3,2])v.fill(5,6,1,3,z,z,SHADE);
      v.fill(4,8,0,0,2,3,CREAM);
      for(let x=-4;x<=1;x++)v.set(x,0,4,x===1?CREAM:COAT);v.set(-5,1,3,COAT);
      parts.push(voxelGeometry(v,{unit:.045,palette:BL.rescueDogs.BREEDS[variant%BL.rescueDogs.BREEDS.length].ink,origin:{x:0,y:0,z:0}}));
    }else if(kind==="ball"){
      // A ball with a white band round it.
      parts.push(M.lathe({profile:[[0,0],[.06,.012],[.085,.045],[.09,.08],[.085,.115],[.06,.148],[0,.16]],segments:10,color:TOYS[variant%TOYS.length]}));
      parts.push(M.lathe({profile:[[.091,.07],[.093,.08],[.091,.09]],segments:10,color:"#f6f1e4"}));
    }else if(kind==="rope"){
      // A rope tug toy: twisted bands in two colours between two knots.
      for(let i=0;i<7;i++)b(i&1?"#f6f1e4":TOYS[variant%TOYS.length],-.21+i*.07,.04,0,.07,.06,.06);
      for(const x of [-.29,.29])b(TOYS[(variant+1)%TOYS.length],x,.05,0,.1,.1,.1);
    }else if(kind==="sacks"){
      // Kibble sacks, two lying and one standing: each a fat bag with a folded top and a paw print on its front.
      const sack=(x,y,z,a,lie,tone)=>{
        const g=M.merge(M.bevelBox({w:.56,h:.8,d:.28,color:tone,bevel:.06,offset:{y:.4}}),M.box({color:"#e9dcc0",w:.56,h:.08,d:.3,offset:{y:.82}}),M.box({color:"#c8452f",w:.56,h:.1,d:.29,offset:{y:.62}}),
          M.box({color:dark,w:.12,h:.1,d:.01,offset:{y:.3,z:.146}}),...[[-.08,.42],[-.03,.45],[.03,.45],[.08,.42]].map(([px,py])=>M.box({color:dark,w:.04,h:.05,d:.01,offset:{x:px,y:py,z:.146}})));
        if(lie){M.turnedX(g,-Math.PI/2);M.moved(g,0,.14,.4);}
        parts.push(M.moved(M.turnedY(g,a),x,y,z));
      };
      sack(-.3,0,-.1,.1,true,"#d9b48a");sack(.32,0,-.05,-.08,true,"#e2c79a");sack(0,.28,-.2,.2,false,"#d9b48a");
    }else if(kind==="bowl-row"){
      // A low bench along a wall with a row of four bowls, food and water by turns.
      b("#8a5a32",0,.16,0,1.8,.06,.42);for(const x of [-.82,.82])b("#6a4426",x,.08,0,.08,.16,.38);
      for(let i=0;i<4;i++)piece("bowl",i&1,-.63+i*.42,.19,0);
    }else if(kind==="pen"){
      // Four joined wire panels and corner posts make a closed square within the room's 2.1 m footprint.
      for(let i=0;i<4;i++){
        const g=[];
        for(const y of [.04,.6])g.push(M.box({color:steel,w:2.05,h:.04,d:.04,offset:{y,z:1.025}}));
        for(let k=0;k<17;k++)g.push(M.box({color:"#c9ced6",w:.02,h:.56,d:.02,offset:{x:-.96+k*.12,y:.32,z:1.025}}));
        parts.push(M.turnedY(M.merge(...g),i*Math.PI/2));
      }
      for(const x of [-1.025,1.025])for(const z of [-1.025,1.025])b("#5c6168",x,.33,z,.05,.66,.05);
    }else if(kind==="fence"){
      // A low picket fence `variant` metres long about x: two rails and pointed pickets.
      for(const y of [.18,.48])b("#e9e1d0",0,y,0,variant,.06,.05);
      for(let x=-variant/2+.08;x<variant/2;x+=.22){b("#f6f1e4",x,.3,.03,.1,.6,.03);b("#f6f1e4",x,.62,.03,.06,.05,.03);}
    }else if(kind==="vet-table"){
      // The vet's steel table on four legs, a rubber mat, a stethoscope and a little scale on it, long along z.
      b(steel,0,.82,0,.72,.05,1.3);for(const x of [-.3,.3])for(const z of [-.58,.58])b("#7d838a",x,.4,z,.05,.8,.05);b("#7d838a",0,.2,0,.62,.03,1.2);
      b("#3c6e9c",0,.855,.15,.6,.01,.8);
      for(let i=0;i<10;i++){const a=i/9*Math.PI*1.6;b(dark,-.12+Math.cos(a)*.12,.86,-.35+Math.sin(a)*.12,.03,.015,.03);}b("#c9ced6",-.12,.865,-.2,.05,.02,.05);
      b("#e6e2d6",.2,.86,-.42,.2,.04,.2);b("#2b2d31",.2,.89,-.42,.12,.02,.04);
    }else if(kind==="vet-cabinet"){
      // A white wall cabinet with a red cross, a shelf of bottles under it; face +z.
      b("#f6f1e4",0,.45,0,1,.9,.3);b("#e6e2d6",0,.45,.152,.92,.82,.01);b(dark,.38,.45,.16,.03,.14,.02);
      b("#d8352a",0,.56,.162,.3,.08,.01);b("#d8352a",0,.56,.162,.08,.3,.01);
      b("#8a5a32",0,-.3,.06,1,.04,.18);for(let i=0;i<5;i++)b(["#5aa0d8","#e0b030","#7ac06a","#f6f1e4","#c8452f"][i],-.36+i*.18,-.2,.06,.08,.16+(i%2)*.06,.08);
    }else if(kind==="pendant"){
      // A pendant lamp hung from the ceiling: a cord, an enamel shade, a warm bulb glowing under it.
      b(dark,0,-.55,0,.02,1.1,.02);
      parts.push(M.moved(M.lathe({profile:[[.05,0],[.1,-.04],[.26,-.22],[.28,-.26],[.24,-.24],[0,-.04]],segments:12,color:"#2f6aa0"}),0,-1.1,0));
      parts.push(M.moved(M.lathe({profile:[[0,-.06],[.07,-.12],[.06,-.2],[0,-.22]],segments:8,color:"#ffd9a0",emissive:1}),0,-1.1,0));
    }else if(kind==="paws"){
      // A muddy trail of paw prints from the door to the yard's gate: a pad and four toes a step, left and right by
      // turns, along a gentle weave.
      const step=.42,mud="#6b4a32";
      for(let z=8.4,i=0;z>-.8;z-=step,i++){
        // Toes lead toward -z; turned by the weave's slope, offset sideways to its left or right foot.
        const cx=Math.sin(z*.55)*.9,heading=Math.atan2(Math.cos(z*.55)*.495,1),side=i&1?.09:-.09;
        const g=M.merge(M.box({color:mud,w:.08,h:.006,d:.07,offset:{y:.003}}),...[[-.05,-.05],[-.018,-.075],[.018,-.075],[.05,-.05]].map(([tx,tz])=>M.box({color:mud,w:.028,h:.006,d:.03,offset:{x:tx,y:.003,z:tz}})));
        parts.push(M.moved(M.turnedY(g,heading),cx+Math.cos(heading)*side,0,z-Math.sin(heading)*side));
      }
    }
    const g=M.merge(...parts);cache.set(key,g);return g;
  };
  const prop=(p,kind,x,y,z,variant=0,yaw=0)=>{const n=S.createNode({geometry:geometry(kind,variant),position:{x,y,z},rotation:{x:0,y:yaw,z:0}});S.addChild(p,n);return n;};
  BL.rescueModels={geometry,prop,ROOFS};
})();
