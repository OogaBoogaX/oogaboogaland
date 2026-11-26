// Rooms off the Ember Den floor. Door landings and walk limits use the same room coordinates as the art.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const GOLD = "#b8893b", LACQUER = "#191713", IVORY = "#efe6d2", WALNUT = "#3c271e", ICE = "#9cc9e3";
  const ROOMS = [
    { name: "Cypherpunk Lounge", x: -BL.pokerGlazing.BOOK_X, z: -56.9, y: 0, w: 32.5, d: 35.2, h: 27 },
    { name: "Cold Storage", x: 1, z: -43, y: 0, w: 13, d: 11, h: 5 },
    { name: "21 Club", x: 10, z: -28, y: 17, w: 18, d: 15, h: 6 }
  ];
  // From, to, local x/z of the control, and local x/z where the player arrives. -1 is the main floor.
  const DOORS = [
    [-1, 0, ROOMS[0].x, -35.87, 0, 3.5, "Whitepaper"],
    [-1, 1, 0, -35.8, 0, 3.5, "Genesis Vault"],
    [-1, 2, 17.4, -34.25, 5.4, -3.4, "Gate 21"],
    [0, -1, 0, 5.1, -19.53, -34.0, "Back to the bar"],
    [1, -1, 0, 5.1, 0, -33, "Back to the hall"],
    [2, -1, 6.4, -4.6, 17.4, -32, "Gaming floor"],
    [0, 0, .035, BL.pokerLoungeStone.tableZ(ROOMS[0])-.43, 0, 0, "Founders pass"]
  ];
  const mesh = (w, h, d, color, x, y, z, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
  const add = (parent, geometry, x = 0, y = 0, z = 0) => {
    const n = S.createNode({ geometry, position: { x, y, z } }); S.addChild(parent, n); return n;
  };
  const letters = (text, cell, color, x, y, z) => {
    const g = BL.poolModels.carve(text, { joined:true, cell, color, emissive: 0.5 }); return M.moved(g.geometry, x - g.width / 2, y, z);
  };
  const cache = M.scopedMap();
  const interior = (id, lite) => {
    const key = id + ":" + lite;
    if (cache.has(key)) return cache.get(key);
    const r = ROOMS[id], a = r.w / 2, b = r.d / 2, ice = id === 1, open = id >= 2;
    const seats=[];
    const trim = ice ? "#7297ae" : GOLD, wall = ice ? "#263c4d" : LACQUER, parts = [], solids = [];
    const slab = (x, y, z, w, h, d, c, glow = 0) => parts.push(mesh(w, h, d, c, x, y, z, glow));
    const solid = (x, z, w, d) => solids.push({ x, z, w: w / 2, d: d / 2 });
    const bevel = (w, h, d, color, x, y, z, radius) => M.bevelBox({ w, h, d, color, bevel: radius, offset: { x, y, z } });
    const rail = (x, y, z, xx, yy, zz, width, color) => parts.push(M.beam(x, y, z, xx, yy, zz, width, color));
    const chair = (x, z, yaw, c) => {
      const seat = M.merge(bevel(0.96, 0.22, 0.88, WALNUT, 0, 0.24, 0, 0.05),
        bevel(0.79, 0.21, 0.69, c, 0, 0.44, 0.07, 0.08), bevel(0.89, 0.8, 0.24, c, 0, 0.71, -0.33, 0.09),
        bevel(0.13, 0.28, 0.7, c, -0.43, 0.54, 0.02, 0.05), bevel(0.13, 0.28, 0.7, c, 0.43, 0.54, 0.02, 0.05),
        mesh(0.73, 0.14, 0.65, trim, 0, 0.1, 0));
      if(ice){
        const tuft=[];
        for(let i=0;i<(lite?5:11);i++){
          const dx=(i/(lite?4:10)-.5)*.7;
          tuft.push(M.beam(dx,.93,-.16,dx*.94,.55+.04*Math.cos(i),-.10,.082,i%3?"#ced8d8":"#a1b6bf"));
        }
        parts.push(M.moved(M.turnedY(M.merge(...tuft),yaw),x,0,z));
      }
      parts.push(M.moved(M.turnedY(seat,yaw),x,0,z));
      solid(x, z, 1.05, 1.05);
    };
    const cylinder = (x, z, profile, c, glow = 0) => parts.push(M.moved(M.lathe({ profile, color: c, segments: lite ? 8 : 16, emissive: glow }), x, 0, z));
    const fire = (x, z, scale) => {
      cylinder(x, z, [[0, 0], [scale, 0], [scale, 0.35], [scale * 0.83, 0.48], [0, 0.48]], wall);
      for (const side of [-1, 1]) {
        rail(x - scale * 0.55, 0.51, z + side * 0.18, x + scale * 0.55, 0.55, z - side * 0.19, 0.14, "#553327");
      }
      for (let k = 0; k < 7; k++) {
        const t = k * 2.4, d = scale * 0.44 * Math.sin(k); cylinder(x + Math.cos(t) * d, z + Math.sin(t) * d,
          [[0, 0.47], [0.22, 0.51], [0.16, 0.78], [0, 0.9 + 0.35 * Math.cos(t)]], k % 2 ? "#e16b26" : "#f7ba55", 0.6);
      }
      solid(x, z, scale * 2, scale * 2);
    };
    slab(0, -0.14, 0, r.w, 0.28, r.d, ice ? "#315267" : open ? "#2b2520" : "#354c32");
    if (open) for (let k = -1; k <= 1; k += 2) {
      slab(k * (a - 0.32), 0.008, 0, 0.045, 0.012, r.d - 0.6, trim);
      slab(0, 0.008, k * (b - 0.32), r.w - 0.6, 0.012, 0.045, trim);
    }
    if (!open && !ice) {
      slab(0, r.h / 2, -b, r.w, r.h, 0.22, wall);
      // The front wall stands separately so the bar shelf can look into the same room.
      for (const s of [-1, 1]) {
        slab(s * a, r.h / 2, 0, 0.22, r.h, r.d, wall);

      }
      // The lounge vault opens between its marble ribs onto the casino sky.
    } else if (open) {
      // Exposed balcony edge, slim brass posts and two continuous rails looking down to the hall.
      for (const sign of [-1, 1]) for (const y of [0.44, 1]) {
        slab(0, y, sign * b, r.w, 0.075, 0.09, trim); slab(sign * a, y, 0, 0.09, 0.075, r.d, trim);
      }
      for (const sign of [-1, 1]) {
        for (let x = -a; x <= a; x += r.w / 6) slab(x, 0.5, sign * b, 0.09, 1, 0.09, trim);
        for (let z = -b; z < b; z += r.d / 4) slab(sign * a, 0.5, z, 0.09, 1, 0.09, trim);
      }
    }
    if (id === 0) {
      // The entrance wall stops BACK past the doorway's line, so its end faces lie inside the jamb blocks: ending on the
      // line itself, they shared the blocks' inner faces and flickered black down both jambs.
      const {half,crown}=BL.pokerLoungeDoor,top=crown(0),BACK=.03,edge=half+BACK;
      for(const side of [-1,1])slab(side*(a+edge)/2,r.h/2,b,a-edge,r.h,.24,WALNUT);
      slab(0,(r.h+top)/2,b,2*edge,r.h-top,.24,WALNUT);
      const firstFitting=parts.length, halfDepth=r.d/4;
      parts.push(BL.pokerSpeakeasy.interior(lite,r.w/2,r.d/2));
      for(const side of [-1,1]){
        for(let j=0;j<=BL.pokerCathedral.bayCount;j++){
          const {x,z}=BL.pokerCathedral.pier(r,side,j);
          solid(x,z,1.7,1.7);
        }
        for(let j=0;j<BL.pokerCathedral.bayCount;j++){
          const shrine=BL.pokerCathedral.shrineAt(r,side,j);
          solid(shrine.x,shrine.z,2*shrine.w,2*shrine.d);
        }
      }
      solid(0,-b+1.76,11.55,3.32);
      // Split wood lies across the sloping grate, with a third log bridging the two.
      parts.push(BL.hubModels.log(-1.16,.54,-halfDepth+1.38,.84,.72,-halfDepth+1.04,.14,"#392922"),
        BL.hubModels.log(-.87,.67,-halfDepth+1.03,1.17,.53,-halfDepth+1.41,.13,"#493027"),
        BL.hubModels.log(-.55,.81,-halfDepth+1.06,.75,.76,-halfDepth+1.39,.105,"#372823"));
      const lounge=BL.pokerLoungeStone;
      lounge.sectional(seats,solid,r);
      for (let i=-3; i<=3; i++) rail(i*.39,.23,-halfDepth+1.54,i*.39,.53,-halfDepth+1.53,.038,GOLD);
      rail(-1.25,.50,-halfDepth+1.53,1.25,.50,-halfDepth+1.53,.038,GOLD);
      // The hearth and surrounding architectural fittings follow the enlarged room.
      for(let i=firstFitting;i<parts.length;i++){
        const verts=parts[i].verts;
        for(let j=0;j<verts.length;j++)verts[j]*=2;
      }
      for(const s of [-1,1]){
        const x=s*lounge.sideTableX,z=lounge.sideTableZ(r);
        parts.push(M.moved(M.merge(BL.pokerCathedral.pedestal()),x,0,z));
        solid(x,z,.98,.91);
      }
    } else if (ice) {
      // Drawer banks sit in shallow recesses in the far ice. Rime and inset metal catches articulate their faces.
      for (const side of [-1, 1]) {
        const x = side * 3.64, z = -b + 0.13;
        parts.push(bevel(2.82,1.83,0.42,"#1d3545",x,1.29,z,0.09));
        for (let row=0;row<3;row++) for (let col=0;col<3;col++) {
          const dx=x+(col-1)*0.91, y=0.73+row*0.56;
          parts.push(bevel(0.86,0.51,0.14,"#4a6479",dx,y,z+0.23,0.045));
          slab(dx,y+0.045,z+0.32,0.30,0.045,0.075,ICE,0.36);
        }
        solid(x,z,2.83,0.75);
        chair(side*4.15,-0.4,-side*1.55,"#aebfca");
        // Bound the lower arch where it meets a walker's shoulder.
        solid(side*(a-0.22),0,1.6,r.d);
        for (let i=0;i<8;i++) {
          const z=3.3-i*0.94, x=side*(1.22+1.08*Math.exp(-(z*z)/3));
          slab(x,0.017,z,0.12,0.026,0.22,"#ec973c",0.74);
        }
      }
      solid(0,0,3.18,3.18);
    } else {
      parts.push(BL.pokerTerrace.roofBar(lite),BL.pokerClub.roof(lite));
      for (const x of [-7.63,.40]) for (const z of [-6.40,-2.65]) solid(x,z,.52,.52); solid(-3.6, -4.8, 6.6, 1.14);
      for (const x of [-6, -4, -2]) solid(x, -3.62, 0.68, 0.68);
      for (const s of [-1, 1]) { fire(s * 4.3, 1, 0.86); chair(s * 6.3, 1.1, -s * 1.4, "#553e30"); chair(s * 4.3, 3.1, Math.PI, "#553e30"); }
      solid(0,-3,1.25,1.25); solid(0,6.96,5.48,.6);
    }
    const built = { seats, geometry: BL.pokerMarble.staticMesh(M.merge(...parts)), solids };
    if (ice) {
      built.cavern = BL.pokerMarble.staticMesh(BL.pokerIce.cavern(r, lite));
      built.glyph = BL.pokerIce.glyph(lite);
    }
    if (id === 2) {
      // Every other marble row repeats exactly. Bake each of the two patterns once.
      const stone = BL.pokerFloor.tiles(lite);
      built.paving = [0, 1].map(row => {
        const tiles = [];
        for (let col = 0; col < 9; col++) {
          const set = (col + row) % 2 ? stone.border : stone.field, tile = M.merge(set[(col + 3 * row) % set.length]);
          const v = tile.verts;
          for (let i = 0; i < v.length; i += 3) {
            v[i] = v[i] * .5 + (col - 4) * 2; v[i+1] *= .12; v[i+2] *= 1.875 / 4;
          }
          tiles.push(tile);
        }
        return BL.pokerMarble.staticMesh(M.merge(...tiles));
      });
    }
    cache.set(key, built);
    return built;
  };
  const fireplace=(room,r,lite)=>{
    const hearth=S.createNode({position:{x:0,y:0,z:-r.d/2},scale:{x:2,y:2,z:2}});
    S.addChild(room,hearth);
    const z=1.1;
    add(hearth,BL.pokerHearth.surround(BL.pokerHearth.crownY,lite),0,0,0);
    const fire=BL.pokerHearth.fire(lite);
    for(const p of fire.plumes){
      const node=add(hearth,p.geometry,p.x,.52,p.z+p.rz);
      node.scale.x=p.rx;node.scale.y=p.scaleY;node.scale.z=p.rz;
      node.rotation.y=Math.PI;
    }
    add(hearth,fire.behind,0,BL.pokerHearth.emblemY,.86);
    const coals=[];
    for(let k=0;k<37;k++){
      const x=1.29*Math.cos(k*2.4)*Math.sqrt((k+.5)/37),dz=.37*Math.sin(k*2.4)*Math.sqrt((k+.5)/37);
      coals.push(mesh(.12+(k%4)*.018,.069,.09,k%3?"#ac3a13":"#ffa13b",x,.45+(k%3)*.013,z+dz,k%3?.48:.88));
    }
    add(hearth,M.merge(...coals));
    const spark=mesh(.016,.034,.016,"#ffba58",0,0,0,1),sparks=[];
    spark.castShadow=false;
    for(let i=0;i<(lite?4:8);i++)sparks.push(add(hearth,spark));
    return (t,calm)=>{
      if(!room.visible)return 0;
      for(let i=0;i<sparks.length;i++){
        const n=sparks[i],life=(t*(.32+.035*(i%3))+i*.371)%1;
        n.visible=!calm && life>.04 && life<.95;
        if(!n.visible)continue;
        n.position.x=.82*Math.sin(i*12.9)+life*.12*Math.sin(t*1.67+i);
        n.position.y=.74+life*(.98+.40*Math.cos(i*2));
        n.position.z=1.25+.17*Math.cos(i*2.4)+.10*life*Math.sin(t+i);
        n.scale.x=n.scale.y=n.scale.z=Math.sin(Math.PI*life);
      }
      return fire.update(calm?0:t);
    };
  };
  const origin = i => i < 0 ? { x: 0, y: 0, z: 0 } : ROOMS[i];
  const build = (lite, vaultDoor, den, onLoungeReady) => {
    let glyph, hearth, heirlooms, entry, wind, landscapes, exterior;
    const glasswork={};
    const chairs=[],windowLight=S.createNode();
    windowLight.lights=new Float32Array(2*BL.pokerCathedral.bayCount*8);
    const root = S.createNode(), solids = [], targets = [], rooms = [];
    // The bookcase hides a whole second scene. Build it once on approach, or immediately for a room spawn.
    const lighting=new AbortController();
    const buildLounge=function* (slice){
      const r=ROOMS[0],room=rooms[0],g=interior(0,lite);
      room.geometry=g.geometry;solids[0]=g.solids;
      entry=BL.pokerLoungeDoor.build(room,r,DOORS[0][3]-r.z-r.d/2);
      S.addChild(room,windowLight);
      if(!g.lawn)g.lawn=yield* BL.pokerLoungeGrass.buildSteps(r,lite,g.solids,slice);
      const meadow=BL.pokerLoungeGrass.install(room,r,g.lawn,lite);
      yield* BL.buildTasks.pause(slice);
      const {windows,rect}=BL.pokerLoungeStone.outfit(room,r,lite);
      glasswork.windows=windows;
      wind=(time,calm,tier)=>{meadow(time,calm,tier);heirlooms.sway(time,calm);};
      // Crop the bookmatched marble at the edges of each wall.
      const pitch=3.64;
      const wall=(cx,cz,yaw,left,right,base,top,halfSpan)=>{
        // Keep a full panel on the centerline.
        // Door openings crop this same grid, so their jambs match on both sides.
        const columns=2*Math.round(halfSpan/pitch-.5)+1;
        const width=2*halfSpan/columns;
        const dx=Math.cos(yaw),dz=-Math.sin(yaw);
        for(let j=Math.floor(base/pitch);j<Math.ceil(top/pitch);j++){
          const v=j*pitch;
          for(let i=Math.floor(left/width+.5);i<Math.ceil(right/width+.5);i++){
            const u=(i-.5)*width;
            const paper=BL.pokerSpeakeasy.wallTile(Math.max(0,(left-u)/width),Math.max(0,(base-v)/pitch),
              Math.min(1,(right-u)/width),Math.min(1,(top-v)/pitch));
            const tile=add(room,paper,cx+dx*u,v,cz+dz*u);
            tile.rotation.y=yaw;tile.scale.x=width;tile.scale.y=pitch;
          }
        }
      };
      const a=r.w/2,b=r.d/2,top=r.h-.12;
      for(const side of [-1,1])wall(side*(a-.15),0,-side*Math.PI/2,.14-b,b-.14,.02,top,b-.14);
      for(const seat of g.seats){
        const chair=add(room,seat.geometry,seat.x,0,seat.z); chair.rotation.y=seat.yaw; chair.chaiseExtension=seat.extension; chairs.push(chair);
      }
      yield* BL.buildTasks.pause(slice);
      hearth=fireplace(room,r,lite);
      const {table,toys,blanket}=BL.pokerLoungeStone.firesideTable(room,r);
      yield* BL.buildTasks.pause(slice);
      heirlooms=yield* BL.pokerLoungeHeirlooms.createSteps(room,r,lite,g.solids,blanket,slice);
      const occluders=chairs.concat(table,toys,heirlooms.treeOccluders,heirlooms.items.filter(prop=>prop.footprint).map(prop=>prop.node));
      landscapes=BL.pokerTimelineGlass.install(room,r,windowLight,windows,rect,occluders,lite,g.lawn.ground,lighting.signal,glasswork);
      gather(room);
      onLoungeReady?.(heirlooms,landscapes,chairs,entry);
    };
    const lounge=BL.doorReady.create({code:"poker",scope:"poker",steps:buildLounge});
    ROOMS.forEach((r, i) => {
      if(i===0){
        rooms.push(add(root,null,r.x,r.y,r.z));solids.push([]);return;
      }
      const g = interior(i, lite), room = add(root, g.geometry, r.x, r.y, r.z);
      rooms.push(room); solids.push(g.solids);
      if (g.paving) for (let row = 0; row < 8; row++)
        add(room, g.paving[row % 2], 0, -.013, (row - 3.5) * 1.875);

      if (g.cavern) {
        add(room, g.cavern);
        glyph = add(room, g.glyph, 0, 2.22, 0);
      }
    });
    // A glazed lift shaft at the far right links the two landings visibly from the tables.
    const lift = [], x = 17.4, z = -35.05;
    for (const dx of [-0.78, 0.78]) for (const dz of [-0.72, 0.72])
      lift.push(mesh(0.095, 19.35, 0.095, GOLD, x + dx, 9.675, z + dz));
    for (const y of [0.02, 2.35, 17.02, 19.35])
      lift.push(mesh(1.68, 0.085, 1.55, GOLD, x, y, z));
    const glazing = mesh(1.51, 19.25, 1.38, "#d7ceb9", x, 9.65, z);
    glazing.glassOpacity = 0.055; glazing.glassGrazing = 0.5; glazing.castShadow = false;
    add(root, M.merge(...lift)); add(root, glazing);
    const roof=ROOMS[2], roofScope=BL.pokerTerrace.mount({x:roof.x,y:roof.y+1.62,z:roof.z-3});
    S.addChild(root,roofScope.root);
    const shelf = BL.pokerSpeakeasy.shelf(lite, DOORS[0][2], DOORS[0][3]);
    S.addChild(root, shelf.root);
    const facade=BL.pokerTimelineGlass.facade(root,DOORS[0][2],lite);
    DOORS.forEach(([from, to, x, z, , , label], i) => {
      if (i === 3) { targets.push(S.createNode()); return; }
      if (i === 1) { targets.push(vaultDoor); return; }
      if (i === 0) { targets.push(shelf.target); return; }
      const p = origin(from);
      if (i === 6) {
        const card = add(root, BL.pokerSpeakeasy.passCard(), p.x + x, .539, p.z + z);
        card.rotation.x=-Math.PI/2;card.rotation.y=.20;
        targets.push(card); return;
      }
      const parts = [mesh(1.9, 0.51, 0.12, LACQUER, 0, 0, 0), mesh(1.94, 0.045, 0.15, GOLD, 0, 0.27, 0),
        letters(label, Math.min(0.072, 0.44 / label.length), IVORY, 0, 0.09, -0.055)];
      const n = add(root, M.merge(...parts), p.x + x, p.y + 1.55, p.z + z);
      if (i === 3 || i === 4) n.rotation.y = Math.PI;
      targets.push(n);
    });
    const sighting=BL.pokerClub.nightWalk(rooms[2]);
    const roofWins=BL.pokerClub.fameWall(rooms[2],0,6.96,Math.PI);
    const gate=targets[2], meter=add(gate,mesh(1.92,.26,.13,LACQUER,0,-.42,0));
    const gateProgress=BL.pokerClub.line(meter,0,-.44,1.74,16,.075);
    let gateText="";
    const refreshGate=()=>{
      const text=den.bigWin||den.visits>=21?"CLUB OPEN":den.visits+"/21 VISITS";
      if(gateText!==text){gateProgress(text);gateText=text;}
    };
    // The two closed rooms have opaque walls behind the bar. The rooftop is visible from outside.
    const show = id => {
      refreshGate();
      if((id===0 || shelf.opened) && !BL.offlineLoungePack && !lounge.ready)lounge.step(Infinity);
      windowLight.visible=id===0;
      facade.visible=id<=0;
      rooms[2].visible = roofScope.root.visible = id !== 1;
      for (let i = 0; i < 2; i++) rooms[i].visible = i === id || i === 0 && id < 0 && shelf.opened;
      for (let i = 0; i < targets.length; i++) targets[i].visible = i === 0 ? id <= 0 : i !== 3 && DOORS[i][0] === id && (i !== 6 || !den.pass);
    };
    // Seen through the open bookcase, the lounge occupies only the angular opening
    // between the jambs. Adjacent casino windows continue to look out onto the ocean.
    const surfaces=new Set(),left=new Float32Array(4),right=new Float32Array(4),lintel=new Float32Array(4);
    const gather=n=>{if(n.geometry)surfaces.add(n.geometry);for(const child of n.children)gather(child);};
    const approach=(position,id)=>{
      if(heirlooms || id!==-1 || BL.offlineLoungePack)return;
      const door=DOORS[0],dx=position.x-door[2],dz=position.z-door[3];
      if(dx*dx+dz*dz<64 && Math.abs(position.y)<6)lounge.step(4);
    };
    let clipped=false;
    const portalView=(eye,id)=>{
      if(rooms[0].visible)heirlooms?.view(eye);
      const door=DOORS[0], dz=eye.z-door[3], outside=id<0 && shelf.opened && dz>.001;
      if(outside!==clipped){
        for(const g of surfaces){g.clipSlab=outside?left:null;g.clipSlab2=outside?right:null;g.clipPlane=outside?lintel:null;}
        clipped=outside;
      }
      if(!outside)return;
      const jamb=(plane,side)=>{
        const x=door[2]+side*BL.pokerLoungeDoor.half, dx=x-eye.x, scale=side/(128*Math.hypot(dx,dz));
        plane[0]=dz*scale;plane[2]=dx*scale;
        plane[3]=1-plane[0]*x-plane[2]*door[3];
      };
      jamb(left,-1);jamb(right,1);
      const slope=(BL.pokerLoungeDoor.crown(0)-eye.y)/dz;
      lintel[1]=1;lintel[2]=slope;lintel[3]=-eye.y-slope*eye.z;
    };
    show(-1);
    const dispose=()=>{lighting.abort();lounge.reset();heirlooms?.dispose();};
    const exteriorView=()=>exterior ??= BL.pokerLoungeExterior.build(ROOMS[0],glasswork,entry,lite);
    return { root, solids, targets, chairs, approach, dispose, exteriorView, get hearth(){return hearth;}, get wind(){return wind;},
      get heirlooms(){return heirlooms;}, get landscapes(){return landscapes;}, get entry(){return entry;}, get projector(){return windowLight.projector;}, windowLights:windowLight.lights, portalView, glyph, shelf, roofScope, roofWins, sighting, refreshGate, show };
  };
  // Test the whole walking segment against furniture expanded by the visitor's body radius.
  const clear = (set, r, ax, az, bx, bz, radius) => {
    ax -= r.x; az -= r.z; bx -= r.x; bz -= r.z;
    if (Math.abs(bx) > r.w / 2 - radius - 0.14 || bz < -r.d / 2 + radius + .14 || r !== ROOMS[0] && bz > r.d / 2 - radius - .14) return false;
    for (const f of set) {
      const dx = bx - ax, dz = bz - az, w = f.w + radius, d = f.d + radius;
      if (Math.max(ax, bx) <= f.x - w || Math.min(ax, bx) >= f.x + w || Math.max(az, bz) <= f.z - d || Math.min(az, bz) >= f.z + d) continue;
      if (Math.abs(dx * (az - f.z) - dz * (ax - f.x)) < Math.abs(dx) * d + Math.abs(dz) * w || !dx && !dz) return false;
    }
    return true;
  };
  // Clip the swept step to hall, narrow passage and lounge. A diagonal cannot cut either jamb.
  const loungeWalk=(salons,ax,az,bx,bz,y,h,actor)=>{
    const radius=actor.bodyRadius,r=ROOMS[0],hall=-35.5+radius,front=r.z+r.d/2-radius-.14;
    if(!salons.shelf.clear(ax,az,bx,bz,radius)) return false;
    if(Math.min(az,bz)>=hall) return BL.pokerModels.walkable(ax,az,bx,bz,y,h,actor);
    if(!salons.shelf.opened && Math.max(az,bz)>=hall) return false;
    const slope=az===bz?0:(bx-ax)/(bz-az);
    const low=Math.max(front,Math.min(az,bz)),high=Math.min(hall,Math.max(az,bz));
    if(low<=high){
      const fits=x=>Math.abs(x-r.x)<=BL.pokerLoungeDoor.half-radius;
      if(!fits(ax+slope*(low-az)) || !fits(ax+slope*(high-az)) || az===bz && !fits(bx))return false;
      const plane=r.z+r.d/2+.085,near=Math.max(low,plane-radius-.14),far=Math.min(high,plane+radius+.14);
      if(near<=far){
        const limit=salons.entry.gap-radius;
        if(Math.abs(ax+slope*(near-az)-r.x)>limit || Math.abs(ax+slope*(far-az)-r.x)>limit ||
          az===bz && Math.abs(bx-r.x)>limit)return false;
      }
    }
    if(Math.max(az,bz)>hall){
      const x=ax+slope*(hall-az);
      if(!BL.pokerModels.walkable(az>hall?ax:x,Math.max(az,hall),bz>hall?bx:x,Math.max(bz,hall),y,h,actor)) return false;
    }
    return Math.min(az,bz)>=front || clear(salons.solids[0],r,az>front?ax+slope*(front-az):ax,Math.min(front,az),
      bz>front?ax+slope*(front-az):bx,Math.min(front,bz),radius);
  };
  BL.pokerSalons = Object.freeze({ ROOMS, DOORS, build, clear, loungeWalk });
})();
