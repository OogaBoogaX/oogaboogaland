// Backlit painted glass with a dated inscription at the foot of each pair.
(() => {
  "use strict";
  const BL=window.BL;
  const chapters=[
    ["OCTOBER 2008","WHITE PAPER"],["JANUARY 2009","GENESIS BLOCK"],
    ["JANUARY 2009","BITCOIN v0.1"],["JANUARY 2009","SATOSHI TO HAL"],["MAY 2010","BITCOIN PIZZA"],
    ["NOVEMBER 2012","FIRST HALVING"],["AUGUST 2017","SEGWIT ACTIVATES"],["NOVEMBER 2021","TAPROOT"]
  ];
  const M=BL.models,S=BL.scene;
  const canvas=(width,height)=>{
    const c=document.createElement("canvas");c.width=width;c.height=height;return c;
  };
  // One set of texture coordinates across the whole elevation. The real passage
  // cuts only the robe at the foot of the composition.
  const doorwayWall=(width,height,bottom,emissive)=>{
    const g=M.geometry(),half=width/2;
    const door=BL.pokerLoungeDoor;
    const strip=(x,y,xx,yy)=>{
      const corners=[[x,y],[xx,yy],[xx,height],[x,height]];
      M.face(g,corners.map(([u,v])=>M.pushVert(g,u,v,0)),[255,255,255],{emissive});
    };
    strip(-half,bottom,-door.half,bottom);strip(door.half,bottom,half,bottom);
    for(let i=0;i<door.course;i++){
      const [x,y]=door.point(1,i),[xx,yy]=door.point(1,i+1);
      strip(xx,yy,x,y);strip(-x,y,-xx,yy);
    }
    g.castShadow=false;return g;
  };
  const readImage=src=>new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=src;
  });
  const wallImages=new Map();
  const wallTile=art=>{
    if(!wallImages.has(art))wallImages.set(art,readImage(art).then(image=>{
      if(!image)return null;
      const tile=canvas(image.naturalWidth,image.naturalHeight);
      tile.getContext("2d").drawImage(image,0,0);return tile;
    }));
    return wallImages.get(art);
  };
  // The bar end from the floor to the vault, round the bookcase's arch: plain casino glass like every other wall. It
  // closes the hall overhead and the slot between the arch and the hall's panes behind it.
  const facade=(parent,bookX,lite)=>{
    const root=S.createNode();S.addChild(parent,root);
    const vault=BL.pokerVault,door=BL.pokerLoungeDoor,{left,right,z}=BL.pokerGlazing.barGlass;
    const joins=vault.JOINS[lite?"lite":"full"].map(a=>[-vault.RADIUS*Math.sin(a),vault.CENTRE_Y+vault.RADIUS*Math.cos(a)-.18]);
    const top=x=>{
      for(let i=1;i<joins.length;i++){
        const [a,y]=joins[i-1],[b,v]=joins[i];
        if(x>=b)return y+(v-y)*(x-a)/(b-a);
      }
      return joins[joins.length-1][1];
    };
    const cuts=[left,right,...joins.map(p=>p[0])];
    for(let i=0;i<=door.course;i++)for(const side of [-1,1])cuts.push(bookX+door.point(side,i)[0]);
    const xs=cuts.filter(x=>x>=left && x<=right).sort((a,b)=>a-b);
    const wall=M.geometry(),tint=vault.GLAZE.color.match(/\w\w/g).map(h=>parseInt(h,16));
    for(let i=1;i<xs.length;i++){
      const a=xs[i-1],b=xs[i];if(b-a<.00001)continue;
      const opening=Math.abs((a+b)/2-bookX)<door.half;
      const base=x=>opening?door.crown(x-bookX):.015;
      M.face(wall,[[a,base(a)],[b,base(b)],[b,top(b)],[a,top(a)]].map(([x,y])=>M.pushVert(wall,x,y,0)),tint);
    }
    vault.glaze(wall,vault.GLAZE.wall);
    S.addChild(root,S.createNode({geometry:wall,position:{x:0,y:0,z}}));
    return root;
  };
  const wallGlass=(room,r,entrance,surfaces)=>{
    const width=r.w-.24,height=r.h-.12,base=.02;
    const glass=entrance?doorwayWall(width,height,base,.58):M.panel({w:width,h:height-base,tilesX:1,tilesY:1,color:"#ffffff",emissive:.54});
    if(!entrance)M.moved(glass,0,(base+height)/2,0);
    // Both elevations draw the same glass sheet and share its uploaded textures.
    for(const face of glass.faces.slice())M.face(glass,face.i.slice().reverse(),face.color,{emissive:face.emissive});
    glass.castShadow=false;
    const sign=entrance?1:-1,art=entrance?BL.satoshiGlassArt:BL.hearthGlassArt;
    const node=S.createNode({geometry:glass,position:{x:0,y:0,z:sign*(r.d/2-.15)},rotation:{x:0,y:entrance?Math.PI:0,z:0}});
    node.visible=false;S.addChild(room,node);
    surfaces[entrance?"entrance":"hearth"]=node;
    // Saddle bars sit just inside the glass; short returns set it into the reveal.
    // Keep the central figure, doorway and the hearth handoff clear.
    const metal="#423c36",supports=[];
    for(const side of [-1,1]){
      const x=side*width;
      supports.push(M.beam(x*.5,base,.055,x*.5,height,.055,.10,metal));
      const inner=x*(entrance?.19:.32);
      for(const y of [height*.42,height*.83]){
        supports.push(M.beam(inner,y,.034,x*.5,y,.034,.045,metal));
      }
    }
    const bars=S.createNode({geometry:M.merge(...supports)});S.addChild(node,bars);
    const image=wallTile(art);
    image.then(tile=>{
      if(!tile)return;
      glass.imageSurface={canvas:tile,rect:[-width/2,base,width,height-base],smooth:true,version:1};
      BL.pokerGlassMaterial.fit(glass.imageSurface,entrance?"entrance":"hearth");
      node.visible=true;
    });
    return image;
  };
  // Transmission follows the opaque profile of the hearth and the rose above it.
  const hearthFilter=(tile,r)=>{
    const size=192,filter=canvas(size,size),c=filter.getContext("2d");
    if(!tile)return filter;
    c.drawImage(tile,0,0,size,size);
    const width=r.w-.24,height=r.h-.14;
    c.setTransform(size/width,0,0,-size/height,size/2,size*(1+.02/height));
    c.scale(2,2);
    c.clearRect(-2.89,0,5.78,3.30);c.clearRect(-2.53,3.30,5.06,4.98);
    c.clearRect(-1.58,8.275,3.16,BL.pokerHearth.crownY-8.275);
    c.globalCompositeOperation="destination-out";c.beginPath();c.arc(0,10.33,1.70,0,2*Math.PI);c.fill();
    const flower=BL.pokerCathedral.roseGlass().imageSurface?.canvas;
    if(flower){
      c.globalCompositeOperation="source-over";c.translate(0,10.33);c.scale(1,-1);
      c.beginPath();c.arc(0,0,1.55,0,2*Math.PI);c.clip();c.drawImage(flower,-1.55,-1.55,3.1,3.1);
    }
    c.resetTransform();
    filterTransmission(c,size);
    return filter;
  };
  // Beer-Lambert absorption in a thicker piece strengthens the prevailing hue.
  // Keep lead and fired shading in the same mask seen by the meadow and Oogas.
  const filterTransmission=(ctx,size)=>{
    const im=ctx.getImageData(0,0,size,size),p=im.data;
    for(let i=0;i<p.length;i+=4){
      const max=Math.max(p[i],p[i+1],p[i+2])/255;
      const density=1.22-.19*max;
      for(let j=0;j<3;j++)p[i+j]=255*Math.pow(p[i+j]/255,density);
      p[i+3]*=Math.min(1,max*1.25);
    }
    ctx.putImageData(im,0,0);
  };
  const projectHearth=(ctx,filter,r,floorPixel)=>{
    const half=(r.w-.24)/2,z=.15-r.d/2,top=r.h-.12,size=filter.width;
    ctx.save();ctx.globalAlpha=.46/8;
    for(let j=0;j<8;j++){
      const radius=.034*Math.sqrt((j+.5)/8),angle=j*2.39996323;
      const rx=dx+radius*Math.cos(angle),rz=dz+radius*Math.sin(angle);
      const a=floorPixel(-half,top,z,rx,rz),b=floorPixel(half,top,z,rx,rz),d=floorPixel(-half,.02,z,rx,rz);
      ctx.setTransform((b[0]-a[0])/size,(b[1]-a[1])/size,(d[0]-a[0])/size,(d[1]-a[1])/size,a[0],a[1]);
      ctx.drawImage(filter,0,0);
    }
    ctx.restore();
  };
  // Local x/y unwrap onto the ceiling plan. The luminous ribs and the glazing
  // follow the same groin vault, with the glass set just above the rib crowns.
  const ceilingGlass=(room,r,surfaces)=>{
    const width=r.w-.24,depth=r.d-.24;
    const glass=M.panel({w:width,h:depth,tilesX:32,tilesY:48,color:"#ffffff",emissive:.72});
    for(let i=0;i<glass.verts.length;i+=3){
      glass.verts[i+2]=BL.pokerLoungeStone.ceilingAt(r,glass.verts[i],-glass.verts[i+1])+.16;
    }
    for(const face of glass.faces)face.i.reverse();
    glass.castShadow=false;
    const node=S.createNode({geometry:glass,rotation:{x:-Math.PI/2,y:0,z:0}});
    node.visible=false;S.addChild(room,node);
    surfaces.vault=glass;
    if(!vaultImage)vaultImage=readImage(BL.vaultGlassArt).then(image=>{
      if(!image)return null;
      const tile=canvas(image.naturalWidth,image.naturalHeight);
      tile.getContext("2d").drawImage(image,0,0);return tile;
    });
    // The saddle bars follow the underside of the vault. Each stays within its
    // own bay and meets the existing tracery at its ends.
    const braces=[];
    for(let j=0;j<BL.pokerCathedral.bayCount;j++){
      const z=BL.pokerCathedral.bayCenter(r,j);
      for(let i=0;i<32;i++){
        const x=width*(i/32-.5),xx=x+width/32;
        braces.push(M.beam(x,BL.pokerLoungeStone.ceilingAt(r,x,z)+.10,z,
          xx,BL.pokerLoungeStone.ceilingAt(r,xx,z)+.10,z,.042,"#50473d"));
      }
    }
    S.addChild(room,S.createNode({geometry:M.merge(...braces)}));
    vaultImage.then(tile=>{
      if(!tile)return;
      glass.imageSurface={canvas:tile,rect:[-width/2,-depth/2,width,depth],smooth:true,tessellated:true,version:1};
      BL.pokerGlassMaterial.fit(glass.imageSurface,"roof");
      node.visible=true;
    });
    return vaultImage;
  };
  // Broad overhead sky casts a softer, vertical image than the low moon.
  // Use the same transmission map on moving bodies and on the fixed paving.
  const ceilingTransmission=(tile,r)=>{
    const size=192,filter=canvas(size,size),ctx=filter.getContext("2d",{willReadFrequently:true});
    if(!tile)return filter;
    ctx.filter="blur(1.1px)";ctx.drawImage(tile,0,0,size,size);ctx.filter="none";
    filterTransmission(ctx,size);
    // Lead absorbs the sky. The luminous ribs transmit it, while the gold bosses occlude it.
    const image=ctx.getImageData(0,0,size,size),p=image.data;
    for(let i=0;i<p.length;i+=4){
      const transmission=Math.max(p[i],p[i+1],p[i+2])/255;
      p[i+3]*=transmission*transmission;
    }
    ctx.putImageData(image,0,0);
    ctx.setTransform(size/(r.w-.24),0,0,size/(r.d-.24),size/2,size/2);
    ctx.globalCompositeOperation="destination-out";
    const {bayCount,bayCenter}=BL.pokerCathedral;
    for(let i=0;i<bayCount;i++){
      const center=bayCenter(r,i);
      ctx.beginPath();ctx.arc(0,center,.33,0,Math.PI*2);ctx.fill();
    }
    return filter;
  };
  const ceilingSpill=function* (floor,transmission,room,occluders,toPixel,slice){
    const lit=canvas(floor.width,floor.height),ctx=lit.getContext("2d");
    ctx.globalAlpha=.44;ctx.drawImage(transmission,0,0,lit.width,lit.height);
    const overhead=(x,y,z)=>toPixel(x,y,z,0,0);
    ctx.globalAlpha=1;ctx.globalCompositeOperation="destination-out";
    shadow(ctx,room.geometry,0,0,0,1,overhead,6.5);
    for(const node of occluders){
      yield* BL.buildTasks.pause(slice);
      shadow(ctx,node.geometry,node.position.x,node.position.z,node.rotation.y,node.scale.x,overhead,Infinity);
    }
    const c=floor.getContext("2d");c.save();c.globalCompositeOperation="lighter";c.drawImage(lit,0,0);c.restore();
  };
  // This wall faces away from the moon. Diffuse sky carries its glass colours
  // a short distance onto the paving, strongest at the threshold.
  const entranceSpill=(ctx,tile,r)=>{
    const w=48,h=40,soft=canvas(w,h),c=soft.getContext("2d");
    c.drawImage(tile,0,0,w,h);
    const door=BL.pokerLoungeDoor;
    c.save();c.setTransform(w/(r.w-.24),0,0,-h/(r.h-.12),w/2,h);
    c.globalCompositeOperation="destination-out";c.beginPath();c.moveTo(-door.half,0);
    for(let i=0;i<=door.course;i++)c.lineTo(...door.point(-1,i));
    for(let i=door.course;i>=0;i--)c.lineTo(...door.point(1,i));
    c.lineTo(door.half,0);c.closePath();c.fill();c.restore();
    const fade=c.createLinearGradient(0,0,0,h);
    fade.addColorStop(0,"transparent");fade.addColorStop(1,"white");
    c.globalCompositeOperation="destination-in";c.fillStyle=fade;c.fillRect(0,0,w,h);
    ctx.save();ctx.translate(ctx.canvas.width,ctx.canvas.height);ctx.scale(-1,1);
    ctx.globalCompositeOperation="lighter";ctx.globalAlpha=.20;ctx.filter="blur(6px)";
    const reach=ctx.canvas.height*3.4/(r.d-.36);
    ctx.drawImage(soft,0,-reach,ctx.canvas.width,reach);ctx.restore();
  };
  // Cut the colour filter to the stone opening before adding the opaque museum labels.
  const landscapeTop=.585;
  const pane=(img,index,glass,rect,landscape)=>{
    const w=img.naturalWidth/BL.pokerCathedral.bayCount,h=img.naturalHeight/2,tile=canvas(Math.round(w),Math.round(h));
    const c=tile.getContext("2d");
    c.drawImage(img,index%BL.pokerCathedral.bayCount*w,Math.floor(index/BL.pokerCathedral.bayCount)*h,w,h,0,0,tile.width,tile.height);
    const bays=BL.pokerCathedral.bayCount,column=index%bays,row=Math.floor(index/bays);
    const labelY=landscape ? landscapeTop-.065 : .909;
    if(landscape){
      // Preserve the painted lancet tips and run a single landscape beneath all four scenes.
      c.drawImage(img,column*w,row*h,w,.44*h,0,0,w,.36*h);
      c.drawImage(img,column*w,(row+.44)*h,w,.56*h,0,.36*h,w,(landscapeTop-.36)*h);
      const slice=landscape.width/bays,strip=landscape.height/2;
      c.drawImage(landscape,column*slice,row*strip,slice,strip,0,landscapeTop*h,w,(1-landscapeTop)*h);
      c.fillStyle="#473829";c.fillRect(0,landscapeTop*h,w,.005*h);
    }
    const size=192,filter=canvas(size,size),ctx=filter.getContext("2d",{willReadFrequently:true});
    const [left,sill,width,height]=rect,top=sill+height;
    ctx.beginPath();
    for(const {i:ids} of glass.faces){
      for(let i=0;i<ids.length;i++){
        const v=ids[i]*3,x=(glass.verts[v]-left)*size/width,y=(top-glass.verts[v+1])*size/height;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();
    }
    ctx.clip();ctx.drawImage(tile,0,0,size,size);
    filterTransmission(ctx,size);
    ctx.clearRect(size*(.5-.041/width),0,size*.082/width,size);
    ctx.clearRect(0,size*(1-.07/height),size,size*.07/height);
    const pixels=ctx.getImageData(0,0,size,size),data=pixels.data,colour=[0,0,0];
    let weight=0;
    for(let i=0;i<data.length;i+=4){
      // Dark painted details and the lead absorb most of the incident light.
      const transmission=Math.max(data[i],data[i+1],data[i+2])/255;
      data[i+3]*=transmission;
      const a=data[i+3]/255;weight+=a;
      for(let k=0;k<3;k++)colour[k]+=a*data[i+k];
    }
    ctx.putImageData(pixels,0,0);
    for(let k=0;k<3;k++)colour[k]/=255*Math.max(1,weight);
    for(let i=0;i<2;i++){
      const x=w*(.25+.5*i),tag=canvas(640,80);
      BL.pokerCathedral.engrave(tag.getContext("2d"),640,80,chapters[index][i],"",true);
      c.drawImage(tag,x-w*.214,h*labelY,w*.428,h*.056);
      ctx.clearRect(size*(.25+.5*i-.214),size*labelY,size*.428,size*.056);
    }
    return {tile,filter,colour};
  };

  // Bake on fixed receiving surfaces once. Both projections use the same world
  // ray, so a stripe crossing the floor/wall joint keeps its colour and direction.
  // High light across the nave reaches the walking surface even from the upper
  // lancets. Use one unit vector for the air, turf and moving Oogas.
  const length=Math.hypot(.78,.60,-.29);
  const source={x:.78/length,y:.60/length,z:-.29/length},dx=-source.x/source.y,dz=-source.z/source.y;
  const project=(ctx,filter,position,rect,toPixel,rx,rz)=>{
    const side=Math.sign(position.x),[left,sill,width,height]=rect;
    const top=sill+height,z=position.z+side*left;
    const a=toPixel(position.x,top,z,rx,rz),b=toPixel(position.x,top,z+side*width,rx,rz);
    const d=toPixel(position.x,sill,z,rx,rz),size=filter.width;
    ctx.setTransform((b[0]-a[0])/size,(b[1]-a[1])/size,(d[0]-a[0])/size,(d[1]-a[1])/size,a[0],a[1]);
    ctx.drawImage(filter,0,0);
  };
  const bake=function* (windows,panes,rect,image,toPixel,room,occluders,wall,hearth,r,slice){
    const ctx=image.getContext("2d");
    ctx.globalCompositeOperation="lighter";
    for(let i=0;i<windows.length;i++){
      const p=windows[i].position,filter=panes[i].filter;
      if(p.x*source.x<=0)continue;
      // Integrate a small bright disk. A lead line near the sill stays sharper
      // than the same line several metres further down the ray.
      const count=12;
      ctx.globalAlpha=(wall ? .08 : .96)/count;
      for(let j=0;j<count;j++){
        const radius=.027*Math.sqrt((j+.5)/count),angle=j*2.39996323;
        project(ctx,filter,p,rect,toPixel,dx+radius*Math.cos(angle),dz+radius*Math.sin(angle));
      }
    }
    if(!wall)projectHearth(ctx,hearth,r,toPixel);
    const mask=canvas(image.width,image.height),ink=mask.getContext("2d");
    shadow(ink,room.geometry,0,0,0,1,toPixel,6.5);
    for(const node of occluders){
      yield* BL.buildTasks.pause(slice);
      shadow(ink,node.geometry,node.position.x,node.position.z,node.rotation.y,node.scale.x,toPixel,Infinity);
    }
    ctx.resetTransform();ctx.globalCompositeOperation="destination-out";
    ctx.globalAlpha=1;ctx.filter="blur(.9px)";ctx.drawImage(mask,0,0);
    if(!wall){
      ctx.globalCompositeOperation="lighter";
      // The broad night sky supplies a much weaker wash beneath both rows of windows.
      // Downsample before the blur so lettering and individual panes dissolve into it.
      for(let i=0;i<windows.length;i++){
        const p=windows[i].position,soft=canvas(10,10);
        soft.getContext("2d").drawImage(panes[i].filter,0,0,10,10);
        ctx.globalAlpha=.085;ctx.filter="blur(8px)";
        project(ctx,soft,p,rect,toPixel,-Math.sign(p.x)*.43,.12);
      }
    }
    ctx.resetTransform();ctx.filter="none";ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
  };
  // Diffuse return from the turf uses the painted grass beneath each pool of
  // light. A small neutral component models the leaf cuticle reflecting the glass colour.
  const groundLight=(image,ground,r)=>{
    const ctx=image.getContext("2d"),w=image.width,h=image.height,pixels=ctx.getImageData(0,0,w,h),p=pixels.data;
    const sample=canvas(w,h).getContext("2d"),turf=ground.imageSurface.canvas;
    const width=r.w-.36,depth=r.d-.36,rx=.18*turf.width/r.w,rz=.18*turf.height/r.d;
    sample.drawImage(turf,rx,rz,turf.width-2*rx,turf.height-2*rz,0,0,w,h);
    const leaf=sample.getImageData(0,0,w,h).data,glass=BL.pokerCathedral.studioRadius**2;
    for(let y=0,i=0;y<h;y++){
      const z=((y+.5)/h-.5)*depth;
      for(let x=0;x<w;x++,i+=4){
        const east=((x+.5)/w-.5)*width,onGlass=east*east+z*z<=glass;
        const high=Math.max(p[i],p[i+1],p[i+2]),low=Math.min(p[i],p[i+1],p[i+2]);
        const peak=Math.max(1,high),chroma=(high-low)/peak;
        for(let j=0;j<3;j++){
          const reflectance=onGlass?1:.32+.68*leaf[i+j]/160;
          p[i+j]=255*reflectance*Math.pow(p[i+j]/peak,onGlass?1.5:1.16);
        }
        p[i+3]*=(high/255)*(onGlass?.37+.60*chroma:.36+.49*chroma);
      }
    }
    ctx.putImageData(pixels,0,0);
  };
  // Project the furniture and full-size shrine silhouettes along the same rays.
  // Only source-facing polygons contribute so overlapping closed meshes form a union.
  const shadow=(ctx,geometry,px,pz,yaw,scale,toPixel,maxHeight)=>{
    const v=geometry.verts,uv=new Float32Array(v.length/3*2),c=Math.cos(yaw),s=Math.sin(yaw);
    for(let i=0,j=0;i<v.length;i+=3,j+=2){
      const p=toPixel(px+scale*(c*v[i]+s*v[i+2]),scale*v[i+1],pz+scale*(c*v[i+2]-s*v[i]),dx,dz);
      uv[j]=p[0];uv[j+1]=p[1];
    }
    const compact=BL.compactGeometry,cursor=compact?.createCursor(geometry);
    let polygons=0;
    ctx.beginPath();
    for(let i=0;i<geometry.faces.length;i++){
      const ids=(compact?compact.readFace(geometry,i,cursor):geometry.faces[i]).i;
      let area=0,highest=-Infinity,lowest=Infinity;
      for(let j=0,prev=ids[ids.length-1];j<ids.length;j++){
        const id=ids[j],h=v[id*3+1];highest=Math.max(highest,h);lowest=Math.min(lowest,h);
        area+=uv[prev*2]*uv[id*2+1]-uv[id*2]*uv[prev*2+1];prev=id;
      }
      // The room mesh also holds the enclosing walls and the floor itself.
      if(area<=0||highest>maxHeight||lowest<-.001||highest<.10)continue;
      ctx.moveTo(uv[ids[0]*2],uv[ids[0]*2+1]);
      for(let j=1;j<ids.length;j++)ctx.lineTo(uv[ids[j]*2],uv[ids[j]*2+1]);
      ctx.closePath();
      // Bound the native rasterizer work for interleaved branches and foliage.
      if(++polygons===256){ctx.fill();ctx.beginPath();polygons=0;}
    }
    if(polygons)ctx.fill();
  };
  const receive=(parent,g,position,rotation,rect,image,blend="add")=>{
    g.castShadow=false;
    g.imageSurface={rect,blend,cutout:true,soft:true,bright:.035,fallback:()=>image};
    const node=S.createNode({geometry:g,position,rotation,sightHidden:true});
    S.addChild(parent,node);return node;
  };
  // A thin section of illuminated air through a real row of the glass. Local
  // horizontal runs along the wall. The tilt supplies the inward travel, and
  // shifting the coloured row along the sheet supplies the drift down the nave.
  const shafts=(group,window,filter,rect,r,lite)=>{
    const p=window.position;
    if(p.x*source.x<=0)return;
    const [left,sill,width,height]=rect,side=Math.sign(p.x),floor=BL.pokerFloor.Y;
    for(const fraction of lite?[.49]:[.31,.67]){
      const top=sill+height*fraction,drop=top-floor,drift=side*dz*drop;
      const limit=r.d/2-.18,center=side*p.z;
      const lo=Math.max(-limit-center,left+Math.min(0,drift));
      const hi=Math.min(limit-center,left+width+Math.max(0,drift));
      const span=hi-lo,reach=drop*Math.hypot(1,dx);
      const haze=canvas(160,96),c=haze.getContext("2d"),pixels=haze.width/span;
      // Average neighbouring pieces of glass. Dark leading breaks up the
      // shaft, and the narrow bright streaks keep the actual pane colours.
      const strip=canvas(48,1),ink=strip.getContext("2d"),size=filter.width;
      ink.drawImage(filter,0,(1-fraction-.045)*size,size,.09*size,0,0,strip.width,1);
      const edges=ink.createLinearGradient(0,0,strip.width,0);
      edges.addColorStop(0,"transparent");edges.addColorStop(.09,"black");
      edges.addColorStop(.91,"black");edges.addColorStop(1,"transparent");
      ink.globalCompositeOperation="destination-in";ink.fillStyle=edges;ink.fillRect(0,0,strip.width,1);
      for(let row=0;row<haze.height;row++){
        const t=(row+.5)/haze.height;
        c.globalAlpha=.19*(1-.66*t)*Math.min(1,(1-t)*12);
        c.drawImage(strip,(left-lo+drift*t)*pixels,row,width*pixels,1);
      }
      const g=M.panel({w:span,h:reach,tilesX:1,tilesY:1,color:"#ffffff"});
      M.face(g,g.faces[0].i.slice().reverse(),[255,255,255]);
      receive(group,g,{x:p.x+dx*drop/2,y:top-drop/2,z:p.z+side*(lo+hi)/2},
        {x:Math.atan(side*dx),y:-side*Math.PI/2,z:0},[-span/2,-reach/2,span,reach],haze);
    }
  };
  let atlas,vaultImage;
  const layouts=new WeakMap();
  // Store only the sunward lancets in increasing world z. Black leading and
  // the pointed aperture are already in the same transmission masks used by bake().
  const incident=(windows,panes,rect,r,hearth,roof)=>{
    const lit=windows.map((node,i)=>({p:node.position,filter:panes[i].filter}))
      .filter(w=>w.p.x*source.x>0).sort((a,b)=>a.p.z-b.p.z);
    const size=192,map=canvas(size*(lit.length+2),size),c=map.getContext("2d");
    c.fillStyle="black";c.fillRect(0,0,map.width,size);
    for(let i=0;i<lit.length;i++){
      c.save();c.beginPath();c.rect(i*size,0,size,size);c.clip();
      c.drawImage(lit[i].filter,i*size,0);c.restore();
    }
    c.save();c.globalAlpha=.55;c.drawImage(hearth,lit.length*size,0);c.restore();
    c.drawImage(roof,(lit.length+1)*size,0);
    const p=lit[0].p;
    return {map,pixels:c.getImageData(0,0,map.width,size).data,
      vault:new Float32Array([r.x,r.z,r.w-.24,r.d-.24]),
      hearth:new Float32Array([r.x,r.z-r.d/2+.15,r.w-.24,r.h-.14]),
      origin:new Float32Array([r.x+p.x,r.y+rect[1],r.z+p.z,lit[1].p.z-p.z]),
      shape:new Float32Array([rect[2],rect[3],Math.sign(p.x),1/source.x]),
      direction:new Float32Array([source.x,source.y,source.z])};
  };
  const install=(room,r,group,windows,rect,occluders,lite,groundMesh,signal,surfaces={})=>{
    if(typeof Image==="undefined")return [];
    if(!atlas)atlas=readImage(BL.pokerTimelineArt);
    const entrance=wallGlass(room,r,true,surfaces),hearth=wallGlass(room,r,false,surfaces),vault=ceilingGlass(room,r,surfaces);
    const width=r.w-.36,depth=r.d-.36,front=depth/2,height=r.h-.20,floorY=BL.pokerFloor.Y;
    const slice={budget:5,until:0,work:0};
    const illuminate=function* ([img,portrait,transfer,ceiling,landscape]){
      slice.until=performance.now()+slice.budget;
      if(!img)return;
      let maps=layouts.get(room.geometry);
      if(!maps){
        const panes=[];
        for(const [i,node] of windows.entries()){
          yield* BL.buildTasks.pause(slice);
          panes.push(pane(img,i,node.geometry,rect,landscape));
        }
        const floor=canvas(512,Math.round(512*depth/width)),wall=canvas(512,Math.round(512*height/width));
        const floorPixel=(x,y,z,rx,rz)=>[(.5+(x+rx*(y-floorY))/width)*floor.width,(.5+(z+rz*(y-floorY))/depth)*floor.height];
        // The wall faces -z, so its local right is the room's -x.
        const wallPixel=(x,y,z,rx,rz)=>{
          const drop=(front-z)/rz;
          return [(.5-(x+rx*drop)/width)*wall.width,(1-(y-drop)/height)*wall.height];
        };
        const filter=hearthFilter(transfer,r),roof=ceilingTransmission(ceiling,r);
        yield* bake(windows,panes,rect,floor,floorPixel,room,occluders,false,filter,r,slice);
        yield* ceilingSpill(floor,roof,room,occluders,floorPixel,slice);
        if(portrait)entranceSpill(floor.getContext("2d"),portrait,r);
        groundLight(floor,groundMesh,r);
        yield* bake(windows,panes,rect,wall,wallPixel,room,occluders,true,null,r,slice);
        maps={floor,wall,panes,projector:incident(windows,panes,rect,r,filter,roof)};layouts.set(room.geometry,maps);
      }
      for(let i=0;i<windows.length;i++){
        const {tile,filter,colour}=maps.panes[i],win=windows[i],p=win.position,o=i*8;
        win.geometry.imageSurface={canvas:tile,rect,version:1,smooth:true,tessellated:true};
        yield* BL.pokerGlassMaterial.fitSteps(win.geometry.imageSurface,p.x*source.x>0?"sun":"shade",slice);
        shafts(group,win,filter,rect,r,lite);
        const intensity=p.x*source.x>0?.64:.29;
        group.lights.set([r.x+p.x-Math.sign(p.x)*.26,r.y+rect[1]+.48,r.z+p.z,13.2,
          intensity*colour[0]*.84,intensity*colour[1]*.94,intensity*colour[2],0],o);
      }
      const ground=M.panel({w:width,h:depth,tilesX:1,tilesY:1,color:"#ffffff"});
      receive(group,ground,{x:0,y:floorY-.002,z:0},{x:-Math.PI/2,y:0,z:0},[-width/2,-depth/2,width,depth],maps.floor,"alpha");
      const g=doorwayWall(width,height,0,0);
      receive(group,g,{x:0,y:0,z:front},{x:0,y:Math.PI,z:0},[-width/2,0,width,height],maps.wall);
      group.projector=maps.projector;
    };
    Promise.all([atlas,entrance,hearth,vault,wallTile(BL.pokerFamilyGlassArt)]).then(images=>{
      if(!signal.aborted)return BL.buildTasks.run(illuminate(images),"poker",signal);
    }).catch(error=>{if(!signal.aborted)throw error;});
    // The grove can overlap the lower glass from a chaise. Inspect the same
    // continuous painting by picking its strip, excluding the stone mullion.
    return windows.map((node,i)=>{
      const row=Math.floor(i/BL.pokerCathedral.bayCount);
      const title=row?"Scottsdale · McDowell Mountains":"Pendleton · Umatilla River and Blue Mountains";
      return {node,title,pickRay(ray){
        if(!node.geometry.imageSurface || Math.abs(ray.dx)<1e-6)return Infinity;
        const t=(r.x+node.position.x-ray.ox)/ray.dx;
        const z=Math.abs(ray.oz+t*ray.dz-r.z-node.position.z),y=ray.oy+t*ray.dy-r.y;
        return t>0 && z>.06 && z<rect[2]/2 && y>rect[1]+.07 && y<rect[1]+rect[3]*(1-landscapeTop)?t:Infinity;
      },open(ui){
        const view=ui.element("canvas");view.className="lounge-landscape";
        view.setAttribute("role","img");view.setAttribute("aria-label",title);
        wallTile(BL.pokerFamilyGlassArt).then(tile=>{
          if(!tile || !view.isConnected)return;
          view.width=tile.width;view.height=tile.height/2;
          view.getContext("2d").drawImage(tile,0,row*view.height,view.width,view.height,0,0,view.width,view.height);
        });
      }};
    });
  };
  BL.pokerTimelineGlass={install,facade};
})();
