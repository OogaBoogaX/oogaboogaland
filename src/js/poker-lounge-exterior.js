// Far view of the lounge. The shrine grid locates both the buttresses and their living foundations.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,C=BL.pokerCathedral, tau=2*Math.PI;
  const add=(parent,geometry,x=0,y=0,z=0)=>{
    const n=S.createNode({geometry,position:{x,y,z}});S.addChild(parent,n);return n;
  };
  const box=(x,y,z,w,h,d,color)=>M.box({w,h,d,color,offset:{x,y,z}});
  const stone="#eee5cf",shadow="#b7aa95",copper="#9a724e";
  const rock=(r,lite)=>{
    const g=M.geometry(),N=lite?48:80;
    // Successive shelves pinch in under the lawn. The last ring leaves the city well open.
    const rings=[[1,.05,"#69734a"],[1.015,-.45,"#493c33"],[.99,-1.3,"#966b51"],[.96,-2.5,"#745747"],
      [.982,-2.8,"#bd8a66"],[.954,-3.7,"#96694f"],[.88,-5.6,"#765446"],[.9,-6.05,"#b47b58"],
      [.847,-7.8,"#8d6049"],[.73,-10.1,"#735448"],[.69,-11.3,"#946c55"],[.48,-13.8,"#584a42"],[.29,-15.8,"#58463e"]];
    const inner=[],rows=[];
    for(let i=0;i<N;i++){
      const a=tau*i/N;
      inner.push(M.pushVert(g,5.2*Math.cos(a),.04,5.2*Math.sin(a)));
    }
    for(let k=0;k<rings.length;k++){
      const [scale,y,color]=rings[k],row=[],rgb=BL.math.hexToRgb(color);
      for(let i=0;i<N;i++){
        const a=tau*i/N,c=Math.cos(a),s=Math.sin(a);
        const rim=1+.019*Math.sin(7*a)+.016*Math.cos(11*a)+.011*Math.sin(17*a);
        const weather=Math.min(k/6,1),chisel=weather*(.026*Math.sin(9*a+.27*k)+.035*Math.cos(5*a-.23*k));
        const span=scale*rim+chisel;
        row.push(M.pushVert(g,(r.w/2+5.2)*Math.sign(c)*Math.pow(Math.abs(c),.45)*span,
          y+weather*(.77*Math.sin(4*a+.17*k)+.6*Math.cos(7*a))*(1+k*.08),
          (r.d/2+4.4)*Math.sign(s)*Math.pow(Math.abs(s),.45)*span));
      }
      const prev=k?rows[k-1]:inner;
      for(let i=0;i<N;i++){
        const j=(i+1)%N,tone=.89+.12*Math.sin(i*.82)+.055*Math.cos(i*2.7+k);
        M.face(g,[prev[i],prev[j],row[j],row[i]],rgb.map(v=>Math.min(255,Math.round(v*tone))));
      }
      rows.push(row);
    }
    // Weathered blocks project through the bedding where the roots grip the cliff.
    const random=BL.math.mulberry32(29531);
    const minerals=["#574842","#68554b","#846e59","#a98d70"].map(BL.math.hexToRgb);
    for(let n=0;n<(lite?64:124);n++){
      const k=2+Math.floor(random()*9),i=3*rows[k][Math.floor(random()*N)];
      const v=g.verts,scale=.55+random()*1.65;
      BL.hubModels.puff(g,v[i],v[i+1],v[i+2],scale*(1+random()),scale*(.5+random()*.65),scale*(1+random()),minerals,random,3,7);
    }
    g.twoSided=true;return g;
  };
  // A cubic spine with a common tangent at each knot keeps the branching contours continuous.
  const spline=points=>t=>{
    const u=Math.min(1,t)*(points.length-1),i=Math.min(points.length-2,Math.floor(u)),s=u-i;
    const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
    const axis=j=>b[j]+.5*s*((c[j]-a[j])+s*(2*a[j]-5*b[j]+4*c[j]-d[j]+s*(3*b[j]-3*c[j]+d[j]-a[j])));
    return {x:axis(0),y:axis(1),z:axis(2)};
  };
  const rootWood=(r,lite)=>{
    const wood=[],random=BL.math.mulberry32(78219);
    for(const side of [-1,1])for(let j=0;j<C.bayCount;j++){
      const anchor=C.shrineAt(r,side,j),z=anchor.z,offset=random()*2-1;
      for(let n=0;n<(j%2?1:2);n++){
        const dir=n?-1:(j%2?-1:1),reach=21+random()*1.9,drop=8+random()*9,turn=dir*(2.2+random()*4.1);
        const corner=(j===0?1:j===C.bayCount-1?-1:0)*(n?0:1);
        const toe=turn*.7+corner*7.1;
        const path=spline([[Math.abs(anchor.x),-.18,0],[17,.47,offset+dir*.8],[reach-.8,.4,dir*1.8],
          [reach+.15,-1.6,turn],[reach-.5,-4.2,turn+.5*dir+corner*2],[reach-2.1,-7.3,turn-.9*dir+corner*4],
          [reach-4.6,-drop*.83,toe],[reach-6.7,-drop,toe+.9*dir]]);
        const world=t=>{const p=path(t);return {x:p.x*side,y:p.y,z:z+p.z};};
        const radius=t=>(n?.85:1.24)*Math.pow(1-t,.76)+.035;
        const grain=random()*tau;
        BL.pokerShrineTrees.grow(wood,world,radius(0),.035,lite?16:28,12,grain);
        // Low ridges follow the twists of the parent, disappearing back into it near the toe.
        for(let rib=0;rib<3;rib++){
          const trace=t=>{
            const p=world(t),angle=grain+rib*tau/3+2*t;
            p.x+=side*.80*radius(t)*Math.cos(angle);p.z+=.78*radius(t)*Math.sin(angle);return p;
          };
          BL.pokerShrineTrees.grow(wood,trace,.24*radius(0),.008,16,5,grain+rib);
        }
        for(const branch of [.38,.59]){
          const start=world(branch),end=world(branch+.27),kick=dir*(2.1+random()*1.8);
          const fork=spline([[start.x,start.y,start.z],[start.x+side*.36,start.y-.82,start.z+kick*.33],
            [end.x+side*.65,end.y+.25,end.z+kick],[end.x-side*2,end.y-2.5,end.z+kick*1.35]]);
          BL.pokerShrineTrees.grow(wood,fork,radius(branch)*.48,.012,lite?8:14,7,grain);
        }
      }
    }
    const g=M.merge(...wood),bounds=S.boundsOf(g);g.smooth=true;
    g.imageSurface={canvas:BL.pokerShrineTrees.barkAtlas(),version:1,atlas:true,atlasMin:bounds.min,atlasMax:bounds.max,rect:[0,0,1,1],smooth:true};
    return g;
  };
  const garden=(r,lite)=>{
    const plants=[],tussocks=M.geometry(),grass=M.geometry(),random=BL.math.mulberry32(1627);
    const blade=["#aba665","#83834f","#b9a866","#929c62"].map(BL.math.hexToRgb);
    for(let i=0;i<(lite?80:210);i++){
      const side=i%2?1:-1,end=i%5===0;
      const x=end?(random()-.5)*r.w:side*(r.w/2+1.1+random()*2.75);
      const z=end?side*(r.d/2+1.4+random()*1.7):(random()-.5)*(r.d+1);
      const tall=.4+random()*.7;
      if(i%3===0)BL.hubModels.puff(tussocks,x,.13,z,.38+random()*.45,.32+random()*.27,.35+random()*.5,
        blade,random,3,7);
      for(let j=0;j<10;j++){
        const a=random()*tau,c=Math.cos(a),s=Math.sin(a),span=.25+random()*.56;
        const v=M.pushVert(grass,x-.11*s,.08,z+.11*c);
        M.pushVert(grass,x+.11*s,.08,z-.11*c);M.pushVert(grass,x+c*span,tall*(.5+random()*.65),z+s*span);
        M.face(grass,[v,v+1,v+2],blade[j%4]);
      }
      if(i%8===0){
        const h=tall+1;
        plants.push(M.beam(x,.08,z,x+.12,h,z,.055,"#63805a"));
        for(let k=0;k<5;k++)plants.push(M.moved(M.lathe({profile:[[0,0],[.21-k*.022,.12],[.1,.23],[0,.27]],segments:5,
          color:k%2?"#967dc9":"#7361a6"}),x+.12+.08*Math.sin(k*2),h-.6+k*.17,z+.08*Math.cos(k*2)));
      }
    }
    const x=r.w/2+3.4,z=-r.d*.32;
    const stalk=(points,width)=>plants.push(M.tube({path:spline(points),radius:t=>width*Math.min(1,Math.sqrt((1-t)*26)+.012),rings:18,segments:10,colorFn:()=>"#548168"}));
    stalk([[x,.05,z],[x,2.9,z],[x+.13,5.7,z]],.42);
    stalk([[x,2.4,z],[x+.92,2.7,z],[x+1.04,4.45,z]],.26);
    stalk([[x,1.7,z],[x-.75,2.05,z+.3],[x-.82,3.1,z+.3]],.22);
    grass.twoSided=true;return [grass,M.merge(tussocks,...plants)];
  };
  const build=(r,glasswork,entry,lite)=>{
    const root=S.createNode(),shell=add(root,null,r.x,r.y,r.z),a=r.w/2,b=r.d/2;
    const pack=g=>BL.pokerMarble.staticMesh(g);
    add(shell,pack(rock(r,lite)));add(shell,pack(rootWood(r,lite)));
    for(const g of garden(r,lite)) add(shell,pack(g));
    const parts=[],eave=r.h-.12,ridge=eave+7.8;
    const widthInside=r.w-.24,depthInside=r.d-.24;
    const vaultSurface=()=>glasswork.vault.imageSurface;
    const beam=(p,q,w,color)=>parts.push(M.beam(...p,...q,w,color));
    const masonry=["#e4dbc9","#dfd6c5","#eae1cd","#d9d0c0"];
    // One instanced bay. Its local +Z faces out; jambs sit in front of the glazing plane.
    const bayParts=[],width=C.bayWidth(r);
    const arch=(cx,base,spring,top,rad,depth,girth,color)=>{
      for(const s of [-1,1]){
        let x=cx+s*rad,y=spring;
        bayParts.push(M.beam(x,base,depth,x,y,depth,girth,color));
        for(let j=1;j<=10;j++){
          const t=j/10,xx=cx+s*rad*(1-t*t),yy=spring+(top-spring)*(1.66*t-.66*t*t);
          bayParts.push(M.beam(x,y,depth,xx,yy,depth,girth,color));x=xx;y=yy;
        }
      }
    };
    const rad=width/2-.92;
    const low=BL.pokerLoungeStone.sill,spring=low+5.5,top=low+8.68;
    for(const cx of [-rad/2,rad/2])arch(cx,low,spring,top,rad/2,.28,.18,stone);
    arch(0,low-.3,spring,low+12,rad+.26,.55,.42,stone);
    arch(0,low-.3,spring,low+12.3,rad+.56,.33,.20,shadow);
    for(const y of [.48,1,low-.35,low-.1,eave-.45,eave])bayParts.push(box(0,y,.20,width,.18,.72,stone));
    const bay=pack(M.merge(...bayParts));
    const pierParts=[];
    for(const [level,height,w,d] of [[.4,.8,1.85,3.7],[3.2,4.8,1.55,2.85],[7.6,4,1.32,2.35],[12.3,5.4,1,1.7],[16.95,3.9,.78,1.1]]){
      pierParts.push(box(0,level,d*.39,w,height,d,shadow),box(0,level+height/2,d*.39,w+.18,.23,d+.18,stone));
    }
    pierParts.push(M.moved(M.lathe({profile:[[.67,0],[.76,.16],[.5,.45],[.44,1],[.52,1.14],[.07,3.05],[0,3.32]],segments:8,color:stone}),0,18.9,.47));
    const pier=pack(M.merge(...pierParts));
    for(const s of [-1,1]){
      for(let j=0;j<C.bayCount;j++){
        const z=C.bayCenter(r,j);
        add(shell,bay,s*a,0,z).rotation.y=s*Math.PI/2;
        const source=glasswork.windows[s<0?j:2*C.bayCount-1-j];
        add(shell,source.geometry,s*(a+.12),0,source.position.z).rotation.y=source.rotation.y;
      }
      for(let j=0;j<=C.bayCount;j++)add(shell,pier,s*a,0,C.pier(r,s,j).z).rotation.y=s*Math.PI/2;
      // Broad courses carry the shadows between the eight deep reveals.
      for(let j=0;j<12;j++)parts.push(box(s*(a-.43),eave*(j+.5)/12,0,.81,eave/12-.024,r.d,masonry[j%4]));
      for(let j=0;j<12;j++)parts.push(box(0,eave*(j+.5)/12,s*(b-.3),r.w,eave/12-.024,.60,masonry[(j+2)%4]));
      // Each gable takes a triangular piece from its own end of the vault painting.
      const gable=M.geometry(),hem=-s*depthInside/2;
      M.pushVert(gable,-widthInside/2,hem,0);
      M.pushVert(gable,widthInside/2,hem,0);
      // A narrow fourth corner under the ridge cap keeps a drawable image quad in Canvas 2D.
      M.pushVert(gable,.015,hem+s*(ridge-eave),0);
      M.pushVert(gable,-.015,hem+s*(ridge-eave),0);
      M.face(gable,s>0?[0,1,2,3]:[1,0,3,2],[255,255,255],{emissive:.72});
      gable.castShadow=false;
      Object.defineProperty(gable,"imageSurface",{get:vaultSurface});
      const pane=add(shell,gable,0,eave-s*hem,s*(b+.065));
      pane.rotation.x=s>0?0:Math.PI;
      pane.scale.x=r.w/widthInside;
      const end=s>0?glasswork.entrance:glasswork.hearth;
      const mural=add(shell,end.geometry,0,0,s*(b+.065));
      mural.rotation.y=end.rotation.y;
      if(s<0){
        // The rose belongs to the hearth end alone. Its marble chimney stands
        // in front of the handoff at the same width and height as seen inside.
        const chimney=add(shell,BL.pokerHearth.surround(BL.pokerHearth.crownY,lite),0,0,-b-.1);
        chimney.scale.x=chimney.scale.y=chimney.scale.z=2;chimney.rotation.y=Math.PI;
        const rose=add(shell,C.roseGlass(),0,20.66,-b-2.02);
        rose.rotation.y=Math.PI;rose.scale.x=rose.scale.y=2;
      }else{
        const doorway=add(shell,null,0,0,2*b+.45);doorway.rotation.y=Math.PI;
        add(doorway,BL.pokerLoungeDoor.surround(),0,0,b);
        for(const leaf of entry.leaves)add(doorway,leaf.geometry).position=leaf.position;
      }
      for(const dir of [-1,1]){
        beam([dir*(a+.55),eave,s*(b+.52)],[0,ridge+.14,s*(b+.52)],.28,stone);
      }
      for(let j=0;j<=C.bayCount;j++){
        const z=(b+.52)*(2*j/C.bayCount-1);
        beam([0,ridge+.06,z],[s*(a+.55),eave-.16,z],.13,copper);
      }
    }
    // Local X/Y match the interior vault plan (world X/-Z). Stretch the outer
    // rim to the eaves so the entire painting crosses the ridge exactly once.
    const roof=M.panel({w:widthInside,h:depthInside,tilesX:8,tilesY:8,color:"#ffffff",emissive:.72});
    for(let i=0;i<roof.verts.length;i+=3){
      roof.verts[i+2]=ridge+(eave-.22-ridge)*Math.abs(roof.verts[i])/(widthInside/2);
    }
    roof.castShadow=false;
    Object.defineProperty(roof,"imageSurface",{get:vaultSurface});
    const roofNode=add(shell,roof);roofNode.rotation.x=-Math.PI/2;
    roofNode.scale.x=(r.w+1.1)/widthInside;roofNode.scale.y=(r.d+1.04)/depthInside;
    beam([0,ridge+.23,-b-.57],[0,ridge+.23,b+.57],.49,copper);
    add(shell,pack(M.merge(...parts)));
    return root;
  };
  BL.pokerLoungeExterior=Object.freeze({build});
})();
