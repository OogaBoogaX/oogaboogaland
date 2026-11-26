// The open east loggia and the three custom-built bars. All dimensions are in hall metres.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, K = BL.pokerMarble;
  const brass = "#b78b4e", edge = "#e4c594", dark = "#302223", copper = "#b9704a", leather = "#713536", opal = "#ffe5ae";
  // Preserve the 8.5 m throat at the east bay. Scale the chamfered deck to ten times
  // the old walk polygon's area, including that unchanged throat (floor plan in metres).
  const inner=25, halfSpan=7*Math.sqrt(10), flatSpan=3*Math.sqrt(10);
  const throatArea=(inner-23)*2*BL.pokerGlazing.OPEN;
  const formerArea=throatArea+14*(32.2-inner)-4;
  const far=inner+(10*formerArea-throatArea+.25*(halfSpan-flatSpan)**2)/(2*halfSpan);
  const outer=z=>far-.25*Math.max(0,Math.abs(z)-flatSpan);
  const contains=(x,z)=>x>=inner && Math.abs(z)<=halfSpan && x<=outer(z);
  const station=Object.freeze({x:far-2.5,y:1.62,z:-.6});
  const box = (x,y,z,w,h,d,color,emissive=0) => M.box({ w,h,d,color,emissive,offset:{x,y,z} });
  const turned = (x,y,z,profile,color,n=10,emissive=0) => M.moved(M.lathe({profile,color,segments:n,emissive}),x,y,z);
  const beam = M.beam, tau = 2*Math.PI;
  const bottle = (x,y,z,h,color,n) => {
    const r = h*0.23;
    const body=turned(x,y,z,[[0,0],[r,0],[r*1.12,h*.12],[r,h*.58],[r*.38,h*.74],[r*.38,h*.94],[r*.47,h*.94],[r*.47,h],[0,h]],color,n,.36);
    return M.merge(body,
      turned(x,y,z,[[r*1.11,h*.23],[r*1.08,h*.42]],"#ddc9aa",n,.34),
      turned(x,y,z,[[r*.38,h*.94],[r*.42,h*1.035],[0,h*1.04]],brass,n,.34),
      box(x-r*.41,y+h*.48,z+r*.93,.018,h*.21,.017,"#ffde9a",.62));
  };
  const goblet = (x,y,z,n) => turned(x,y,z,[[0,0],[.08,0],[.07,.018],[.016,.028],[.016,.14],[.075,.20],[.089,.29],[.079,.29],[.06,.225]],"#bbe2dc",n,.38);
  const lamp = (x,y,z,h) => M.merge(turned(x,y,z,[[0,0],[.19,0],[.16,.05],[.042,.1],[.034,h*.69],[.2,h*.72]],brass),
    turned(x,y,z,[[.23,h*.72],[.21,h*.86],[.13,h],[0,h]],opal,10,.92));
  const ring = (x,y,z,r,wire,color=brass) => M.moved(M.torus(r,wire,color,.24,20,5),x,y,z);
  const globeLamp = (x,y,z,h) => M.merge(
    turned(x,y,z,[[0,0],[.23,0],[.23,.07],[.09,.14],[.064,h*.77],[.24,h*.80]],brass,12,.19),
    turned(x,y+h*.8,z,[[.16,0],[.24,.08],[.275,.19],[.25,.30],[.17,.38],[0,.42]],opal,14,.93));
  const terraceLamp = (x,y,z) => {
    const p=[turned(x,y,z,[[0,0],[.17,0],[.17,.08],[.12,.11],[.15,.16],[.15,.43],[.19,.46],[.19,.50],[.08,.59],[0,.61]],dark,8,.26),
      turned(x,y,z,[[.152,.17],[.152,.42]],opal,8,.95)];
    for(let i=0;i<6;i++){const a=i*tau/6,dx=.16*Math.cos(a),dz=.16*Math.sin(a);p.push(beam(x+dx,y+.14,z+dz,x+dx,y+.45,z+dz,.034,brass));}
    return M.merge(...p);
  };
  const bar = (cx,cz,lite,sectionsOnly=false) => {
    const sections=[];
    const west = cx<0;
    const p=[], z=cz-1.27, front=cz+1.29, n=lite?5:9;
    const wood = west ? "#53362c" : "#365353", inset = west ? "#32242b" : "#223b40";
    p.push(box(cx,.46,front-.22,15,.92,.7,wood),K.slab({w:15.3,h:.12,d:1.02,color:west?"#342a2a":"#344947",seed:103,veins:12,on:"top",offset:{x:cx,y:.96,z:front-.22}}));
    for(const y of [.12,.82,.94]) p.push(box(cx,y,front+.16,15.15,.035,.045,brass));
    p.push(beam(cx-7.44,.19,front+.41,cx+7.44,.19,front+.41,.054,brass));
    for(let i=0;i<15;i++){
      const x=cx-7+i;
      // Bookmatched veneers reverse their grain at each join. Narrow highlights follow the pores.
      const veneer=west?["#6c4432","#593829","#704b38"]:["#384b42","#3d5145","#324039"];
      p.push(box(x,.47,front+.137,.96,.68,.023,veneer[i%3]));
      for(let g=0;g<(lite?3:8);g++){
        const y=.21+g*(lite?.19:.073), rise=.026+.024*Math.sin(i*3+g);
        for(const side of [-1,1]) p.push(beam(x+side*.46,y+rise,front+.155,x+side*.025,y,front+.155,.012,g%3?wood:edge));
      }
      if(west){
        p.push(box(x,.47,front+.146,.89,.55,.012,inset));
        for(const dx of [-.4,-.2,0,.2,.4]) p.push(box(x+dx,.47,front+.174,.025,.52,.03,wood));
      }else{
        for(let j=0;j<6;j++){
          const a=j*Math.PI/6,b=(j+1)*Math.PI/6;
          p.push(beam(x+.48*Math.cos(a),.72-.52*Math.sin(a),front+.16,x+.48*Math.cos(b),.72-.52*Math.sin(b),front+.16,.034,copper));
        }
      }
      if(i%3===0) p.push(beam(x,.2,front+.15,x,.19,front+.41,.04,brass));
    }
    // Keep the long counter separate from the dense bottle alcoves so a side view
    // can cull each bank of glassware at its own bounds.
    sections.push(K.staticMesh(M.merge(...p)));p.length=0;
    const bays=west?[-4.8,0,4.8]:[-6.65,6.65], rad=west?2.28:.76;
    sections.push(K.staticMesh(BL.pokerIce.shelfIce(cx,bays,rad,z,lite)));
    for(const offset of bays){
      const x=cx+offset;
      if(!west)p.push(box(x,2.3,z-.19,rad*2+.18,4.55,.38,inset));
      for(const side of [-1,1]){
        const dx=x+side*rad;
        p.push(box(dx,1.82,z+.04,.15,3.64,.33,brass));
        for(const shift of [-.09,.09]) p.push(box(dx+shift,1.83,z+.1,.045,3.55,.25,wood));
      }
      for(let j=0;j<12;j++){
        const a=j*Math.PI/12,b=(j+1)*Math.PI/12;
        p.push(beam(x+rad*Math.cos(a),3.46+.96*Math.sin(a),z+.12,x+rad*Math.cos(b),3.46+.96*Math.sin(b),z+.12,.09,edge));
      }
      for(let row=0;row<3;row++){
        const y=1.46+row*.78, qty=west?(lite?4:8):(lite?2:3);
        p.push(box(x,y-.065,z+.12,rad*1.93,.12,.40,wood),box(x,y-.04,z+.33,rad*1.93,.025,.025,opal,.72));
        for(let i=0;i<qty;i++){
          const bx=x+((i+.5)/qty-.5)*rad*1.84, h=.32+((i*7+row*3)%5)*.064;
          p.push(bottle(bx,y,z+.17,h,["#744228","#528778","#995e40","#ae9274"][(i+row)%4],n));
        }
      }
      if(west) for(let i=-3;i<=3;i++){
        const glass=M.turnedZ(goblet(0,0,0,n),Math.PI);
        p.push(M.moved(glass,x+i*.32,3.78,z+.24));
      }
      sections.push(K.staticMesh(M.merge(...p)));p.length=0;
    }
    if(!west){
      // A continuous low bottle rail between the two tall cabinets, behind the bartender's lane.
      const span=2*(6.65-rad), y=.99;
      p.push(box(cx,y-.07,z+.11,span,.14,.46,wood),box(cx,y-.047,z+.348,span,.037,.029,brass));
      for(const dx of [-5.3,-2.65,0,2.65,5.3]){
        p.push(box(cx+dx,y*.45,z+.06,.11,y*.90,.18,inset),
          beam(cx+dx,.64,z-.04,cx+dx,y-.08,z+.28,.055,brass));
      }
      const glass=["#976442","#386854","#a57238","#587d87","#714839"];
      const count=lite?23:31;
      for(let i=0;i<count;i++){
        const u=(i+.55)/count, h=.29+.042*((i*7)%6);
        p.push(bottle(cx+(u-.5)*(span-.30),y,z+.12+.055*Math.sin(i*3.7),h,glass[i%glass.length],n));
      }
      sections.push(K.staticMesh(M.merge(...p)));p.length=0;
    }
    for(const dx of (west?[-4.8,0,4.8]:[-6.65,6.65])){
      const x=cx+dx;
      if(west){
        p.push(box(x,3.83,z+.23,2.45,.055,.21,brass));
      }else{
        for(let j=-4;j<=4;j++) p.push(box(x+j*.132,3.91,z+.22,.055,.9,.13,j%2?brass:copper));
        p.push(terraceLamp(x,3.38,z+.40));
      }
    }
    for(const side of (west?[-1,1]:[-1])){
      const x=cx+side*3.15;
      for(let i=0;i<(lite?3:6);i++) p.push(goblet(x+i*.21,1.034,front-.02-(i%2)*.14,n));
      p.push(ring(x-1,1.06,front-.06,.20,.018));
    }
    for(const dx of [-5.8,.8,5.5]){
      const x=cx+dx;
      p.push(box(x,1.035,front-.18,.80,.024,.39,brass),goblet(x-.18,1.05,front-.15,n),
        turned(x+.14,1.05,front-.22,[[0,0],[.10,0],[.145,.30],[.085,.335],[.06,.42],[0,.43]],"#c1b6a2",n,.23));
    }
    if(west) p.push(lamp(-14.05,1.025,front-.12,.64));
    sections.push(K.staticMesh(M.merge(...p)));
    return sectionsOnly ? sections : M.merge(...sections);
  };
  // The blood-orange peel and basil distinguish the Negroni from the amber rye and cherry.
  const serviceX=13.35;
  const cocktail=(x,y,z,kind)=>{
    const p=[turned(x,y,z,[[0,0],[.085,0],[.097,.02],[.097,.036],[0,.036]],
      "#c9d7cb",10,.43),turned(x,y,z,[[.099,.037],[.103,.155],[.102,.182],[0,.182]],kind?"#c28532":"#ba3927",10,.58)];
    const ice=M.turnedY(box(0,0,0,.079,.064,.079,"#dbe5cc",.52),.51);
    p.push(M.moved(ice,x+.013,y+.183,z+.018));
    if(kind) p.push(turned(x-.047,y+.19,z,[[0,0],[.031,.016],[.031,.046],[0,.058]],"#812835",8,.34),
      beam(x-.049,y+.23,z,x-.08,y+.28,z-.015,.009,dark));
    else {
      for(let i=0;i<5;i++){
        const a=i*.43,b=a+.43;
        p.push(beam(x+.082*Math.cos(a),y+.244-i*.008,z+.082*Math.sin(a),x+.082*Math.cos(b),y+.236-i*.008,z+.082*Math.sin(b),.024,"#ff9e37"));
      }
      p.push(M.moved(M.turnedZ(box(0,0,0,.037,.076,.017,"#638858",.46),-.45),x-.053,y+.232,z));
    }
    return M.merge(...p);
  };
  const service=(root,add)=>{
    const z=-34.82, agent=BL.agent.create({groundAt:()=>0,x:serviceX,z,managed:true,scale:.96});
    agent.poseManaged(1,serviceX,0,z,0,0,false,true);
    const p=agent.parts, d=BL.pokerCrowdModels.staffDress("waiter");
    add(p.torso,d.torso);
    add(p.torso,M.merge(box(0,.32,.36,.65,.36,.058,"#925735",.23),
      box(0,.53,.37,.68,.064,.065,brass,.33),beam(-.28,.91,.36,.14,.56,.38,.056,copper)));
    add(p.armL,d.sleeve); add(p.armR,d.sleeve);
    p.armL.rotation.x=-.83; S.addChild(root,agent.root);
    const silver="#c8d2c9";
    const shaker=turned(0,0,0,[[0,0],[.071,0],[.105,.21],[.108,.265],[.071,.305],[.048,.33],[.05,.375],[0,.375]],silver,12,.55);
    add(p.armR,M.moved(M.turnedX(shaker,.85),0,-.69,.10));
    const lipZ=-33.17;
    const pour=add(root,turned(0,0,0,[[.011,0],[.014,.27]],"#cf7137",6,.67),serviceX-.30,1.23,lipZ);
    const spoon=add(root,M.merge(beam(0,0,0,.04,.27,0,.015,silver),
      turned(.04,.27,0,[[0,0],[.021,.012],[0,.032]],brass,6,.5)),serviceX+.12,1.17,lipZ);
    const counter=[lamp(serviceX-1.16,1.032,-33.60,.64),cocktail(serviceX-.30,1.032,lipZ,0),cocktail(serviceX+.12,1.032,lipZ,1)];
    for(const [dx,name] of [[-.61,"PIZZA DAY NEGRONI"],[.64,"HODL OLD FASHIONED"]]){
      const t=BL.poolModels.carve(name,{ joined:true,cell:.011,color:"#e8c38c",emissive:.45});
      // Carved wall letters have an 8 cm extrusion. These brass strips are flush with the nameplate.
      for(let i=2;i<t.geometry.verts.length;i+=3) t.geometry.verts[i]*=.05;
      counter.push(box(serviceX+dx,1.095,-33.03,1.13,.143,.064,dark),
        M.moved(t.geometry,serviceX+dx-t.width/2,1.12,-32.99));
    }
    add(root,M.merge(...counter));
    return (elapsed,calm)=>{
      const t=elapsed%10, mixing=!calm && elapsed%20>=10;
      const shake=!calm && !mixing && t<4 ? Math.sin(t*14)*.18*Math.sin(Math.PI*t/4) : 0;
      const tip=calm || mixing?0:Math.max(0,Math.min(1,t-4.5,8.5-t));
      p.armR.rotation.x=-1.22+shake-.48*tip;
      p.armR.rotation.z=.10+.28*tip; p.head.rotation.x=.09+.12*tip;
      pour.visible=tip>.95;
      spoon.rotation.y=mixing?t*3:0;
      p.armL.rotation.x=mixing?-1.05+.08*Math.sin(t*3):-.83;
      p.armL.rotation.z=mixing?.18+.07*Math.cos(t*3):.06;
    };
  };
  // Five steam-driven mining engines share castings. The rotor, eccentric and slider of
  // each engine follow one crank angle. The same exhaust strokes feed its stack.
  const pressureRamp=value=>{
    const u=Math.max(0,Math.min(1,value));
    return u*u*(3-2*u);
  };
  const valveOpens=5.5, valveSeconds=4.2;
  const ventLevel=age=>pressureRamp((age-valveOpens)/.45)*(1-pressureRamp((age-valveOpens-valveSeconds+.8)/.8));
  const miningShelf=(parent,add,lite)=>{
    const iron="#34454c", steel="#728381", bronze="#b68147", gold="#ebba76", soot="#232e34";
    const pack=g=>{g.fogPierce=.83;g.castShadow=false;return K.staticMesh(g);};
    const mount=(g,x,y,z)=>add(bank,pack(g),x,y,z);
    const plate=(x,y,z,r,thick,color)=>M.moved(M.turnedX(turned(0,0,0,
      [[0,0],[r,0],[r,thick],[0,thick]],color,lite?10:18,.65),Math.PI/2),x,y,z);
    const hoop=(x,y,z,r,thick,color)=>M.moved(M.turnedX(M.torus(r,thick,color,.64,lite?14:24,5),Math.PI/2),x,y,z);
    const bank=add(parent,null,far+33,0,32);bank.rotation.y=-2.24;
    mount(BL.pokerIce.floe(lite),0,0,0);
    const deck=[box(0,-1.84,.6,31.9,.28,5.05,iron,.47)];
    for(let x=-15;x<=15;x+=2.5){
      deck.push(beam(x,-2.9,-.3,x,-1.99,2.66,.17,bronze),
        box(x,-1.14,2.94,.07,1.15,.07,bronze,.58));
    }
    for(const y of [-1.05,-.62])deck.push(beam(-15,y,2.94,15,y,2.94,.075,gold));
    // The common receiver feeds all five boilers. Its level tube is on the terrace face,
    // where the enamel backing, gauge marks and meniscus read against the dark casings.
    const glassX=-3.14,glassY=.30,glassZ=2.44,travel=2.22;
    deck.push(beam(-14,-.24,glassZ,14,-.24,glassZ,.17,copper),
      beam(glassX,-.24,glassZ,glassX,glassY,glassZ,.19,bronze),
      box(glassX,glassY+travel/2,glassZ,.66,travel,.16,"#213c41",.44));
    for(const side of [-1,1])deck.push(beam(glassX+side*.32,glassY,glassZ+.09,glassX+side*.32,glassY+travel,glassZ+.09,.07,gold));
    for(let k=1;k<10;k++)deck.push(box(glassX+.20,glassY+k*travel/10,glassZ+.125,k%2?.08:.15,.027,.032,gold,.84));
    for(const y of [glassY,glassY+travel])deck.push(turned(glassX,y-.085,glassZ+.10,[[.29,0],[.34,.045],[.34,.14],[.27,.19]],bronze,12,.64));
    mount(M.merge(...deck),0,0,0);
    const liquid=mount(turned(0,0,0,[[.155,0],[.155,1],[0,1]],"#54c7bd",12,.89),glassX,glassY,glassZ+.12);
    const meniscus=mount(turned(0,0,0,[[.156,0],[.16,.047],[.13,.063],[0,.063]],"#c6fff0",12,1),glassX,glassY,glassZ+.12);
    const wheel=[hoop(0,0,.09,.70,.092,gold),hoop(0,0,.035,.59,.039,copper),
      plate(0,0,.09,.19,.15,bronze),plate(.42,0,.23,.10,.07,steel)];
    for(let i=0;i<8;i++){
      const a=i*tau/8,dx=Math.cos(a),dy=Math.sin(a);
      wheel.push(beam(.15*dx,.15*dy,.12,.64*dx-.095*dy,.64*dy+.095*dx,.12,.10,bronze));
    }
    const flywheel=pack(M.merge(...wheel)), blades=[plate(0,0,0,.16,.11,gold)];
    for(let i=0;i<6;i++){
      const blade=M.turnedZ(box(.10,.29,.02,.21,.46,.09,steel,.64),-.47);
      blades.push(M.turnedZ(blade,i*tau/6));
    }
    const fan=pack(M.merge(...blades)),rod=pack(M.merge(box(0,0,0,1.27,.085,.09,gold,.64),
      plate(-.635,0,.035,.10,.075,bronze),plate(.635,0,.035,.10,.075,bronze)));
    const slipper=pack(box(0,0,0,.30,.23,.18,steel,.64));
    const needle=pack(M.merge(box(0,.103,0,.024,.20,.015,soot,.65),plate(0,0,0,.033,.023,bronze)));
    // A single soft density map for the entire bank. Feathered lobes overlap as they
    // rise. Both renderers reuse the same bitmap, including in the single-file build.
    const steam=M.geometry();
    M.face(steam,[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>M.pushVert(steam,x,y,0)),
      [207,218,216],{emissive:.65});
    let steamImage;
    steam.imageSurface={rect:[-1,-1,2,2],blend:"alpha",cutout:true,fallback(){
      if(steamImage)return steamImage;
      steamImage=document.createElement("canvas");steamImage.width=steamImage.height=96;
      const ctx=steamImage.getContext("2d"),rand=BL.math.mulberry32(9481);
      for(let k=0;k<56;k++){
        const a=rand()*tau,r=Math.sqrt(rand()),x=46+24*r*Math.cos(a)+6*Math.sin(2*a),
          y=50+27*r*Math.sin(a),size=7+rand()*12;
        const g=ctx.createRadialGradient(x,y,0,x,y,size);
        g.addColorStop(0,y<50?"rgba(214,224,215,.42)":"rgba(153,172,177,.35)");
        g.addColorStop(.47,"rgba(174,191,192,.21)");g.addColorStop(1,"rgba(155,172,179,0)");
        ctx.fillStyle=g;ctx.fillRect(x-size,y-size,2*size,2*size);
      }
      return steamImage;
    }};
    const vapour=pack(steam),engines=[],sources=[];
    for(let j=0;j<5;j++){
      const x=(j-2)*6.3,z=(j%2)*.78,foot=-1.69,h=2.48+(j%3)*.45,roof=foot+h;
      const wall=z+1.34,axisY=foot+1.08,axisX=x-.41,stackX=x+1.74,stackZ=z-.34;
      const stackH=2.65+[.38,.95,.22,.70,0][j],mouthY=roof+stackH;
      const p=[box(x,foot+h*.5,z,5.48,h,2.67,iron,.49),
        box(x,foot+.12,z,5.64,.22,2.88,bronze,.54),box(x,roof,z,5.62,.16,2.93,bronze,.60),
        box(x,roof-.18,wall,5.41,.07,.10,gold,.60),box(x,axisY,wall+.03,2.62,1.72,.14,soot,.49)];
      // Slotted heat exchangers and bolted fan guards keep the hashboards recognizable.
      for(const dx of [1.04,2.12]){
        p.push(plate(x+dx,axisY,wall+.04,.51,.12,soot),hoop(x+dx,axisY,wall+.25,.52,.052,gold));
        for(const sign of [-1,1])p.push(beam(x+dx-.34,axisY+sign*.34,wall+.28,x+dx+.34,axisY-sign*.34,wall+.28,.025,bronze));
      }
      for(let k=0;k<(lite?6:12);k++){
        const xx=x-1.12+k*(lite?.24:.12);
        p.push(box(xx,roof+.28,z+.53,.052,.49,1.19,steel,.54));
      }
      // A jacketed boiler across the roof, with copper bands, a steam main and flanged uptake.
      p.push(M.moved(M.turnedZ(turned(0,0,0,[[0,-1.72],[.35,-1.69],[.52,-1.47],[.52,1.47],
        [.35,1.69],[0,1.72]],j%2?"#836449":"#86614a",lite?10:16,.61),Math.PI/2),x-.28,roof+.68,z-.47));
      for(const dx of [-1.67,-.82,.15,1.12]){
        p.push(M.moved(M.turnedZ(M.torus(.526,.052,gold,.63,16,5),Math.PI/2),x+dx,roof+.68,z-.47));
      }
      p.push(turned(stackX,roof,stackZ,[[.61,0],[.63,.22],[.40,.4],[.36,stackH-.48],[.49,stackH-.39],
        [.53,stackH-.09],[.51,stackH],[.34,stackH],[.33,stackH-.38],[0,stackH-.4]],soot,lite?10:18,.56),
        beam(x-2.38,roof+.67,z-.45,x-2.38,axisY,z-.45,.21,copper),
        beam(x-2.38,axisY,z-.45,x-2.38,axisY,wall+.18,.21,copper));
      for(const dy of [.31,.85,stackH-.48,stackH-.10]){
        const r=dy>stackH-.52?.505:.407;
        p.push(turned(stackX,roof+dy,stackZ,[[r,0],[r+.021,.04],[r,.09]],gold,12,.63));
      }
      for(const dx of [-2.57,.45,2.55]){
        p.push(box(x+dx,foot+h*.53,wall+.04,.12,h-.25,.13,bronze,.60));
        for(let k=0;k<4;k++)p.push(plate(x+dx,foot+.38+k*(h-.62)/3,wall+.11,.052,.04,gold));
      }
      // Inspection dial, fire grate, brass cylinder and a slide bed on the audience face.
      const dialX=x+1.12,dialY=roof-.44;
      p.push(plate(dialX,dialY,wall+.045,.258,.12,bronze),plate(dialX,dialY,wall+.17,.208,.016,"#e4d5ac"),
        box(x-2.13,axisY,wall+.27,.58,.46,.37,copper,.64),box(x-2.13,axisY,wall+.48,.60,.10,.045,gold,.66),
        box(axisX-1.33,axisY-.20,wall+.34,1.23,.09,.22,bronze,.58),
        box(x-1.93,foot+.39,wall+.09,1.22,.37,.10,"#e77536",.90));
      for(let i=0;i<6;i++)p.push(box(x-2.46+.21*i,foot+.39,wall+.16,.09,.39,.07,soot,.38));
      for(let k=0;k<7;k++){
        const a=k*Math.PI/4-.75*Math.PI;
        p.push(beam(dialX+.15*Math.sin(a),dialY+.15*Math.cos(a),wall+.194,
          dialX+.194*Math.sin(a),dialY+.194*Math.cos(a),wall+.194,.015,soot));
      }
      // The arched maker's panel carries a sight glass, upper steam lines and a relief
      // valve. Their fittings stand proud of the jacket so they catch the terrace light.
      const panelY=roof-.52, faceZ=wall+.20;
      p.push(box(x-1.22,panelY,wall+.06,2.30,.64,.10,"#2e625f",.53),
        box(x-1.22,panelY-.34,wall+.14,2.36,.055,.045,gold,.61));
      for(const side of [-1,1])for(let k=0;k<3;k++){
        const xx=x-1.22+side*(.32+k*.34);
        p.push(beam(xx,panelY-.20,faceZ,xx+side*.20,panelY+.14,faceZ,.061,bronze));
      }
      p.push(hoop(x-1.22,panelY,faceZ+.02,.235,.040,gold),
        plate(x-1.22,panelY,faceZ,.145,.055,"#b76335"));
      const gaugeX=x+2.14;
      p.push(box(gaugeX,roof-.58,wall+.15,.29,.68,.06,soot,.44),
        box(gaugeX,roof-.59,faceZ,.088,.48,.056,"#91cfbb",.84));
      for(const y of [roof-.87,roof-.30])p.push(box(gaugeX,y,faceZ,.30,.085,.11,bronze,.68));
      // Steam from the receiver feeds the exhaust manifold through a swan-neck pipe.
      const pipe=[[x-.55,roof+1.11],[x-.55,roof+1.57],[x-.39,roof+1.72],
        [x+1.43,roof+1.72],[stackX,roof+1.51]];
      for(let i=1;i<pipe.length;i++)p.push(beam(pipe[i-1][0],pipe[i-1][1],stackZ,
        pipe[i][0],pipe[i][1],stackZ,.18,copper));
      for(const dx of [.05,.82])p.push(box(x+dx,roof+1.72,stackZ,.095,.28,.28,gold,.62));
      const valveX=x-1.43,valveY=roof+1.43;
      p.push(turned(valveX,roof+1.03,z-.25,[[.13,0],[.13,.20],[.06,.23],[.06,.42]],bronze,8,.62),
        hoop(valveX,valveY,z-.18,.27,.055,"#bf6143"),
        beam(valveX-.24,valveY,z-.18,valveX+.24,valveY,z-.18,.047,bronze));
      // Main air compressor has a taller twin-fluted cap and two reinforcing stays.
      if(j===2){
        for(const dx of [-.48,.48])p.push(beam(stackX+dx,roof+.55,stackZ,stackX+dx*1.55,mouthY-.27,stackZ,.09,copper));
        p.push(turned(stackX,mouthY-.36,stackZ,[[.56,0],[.64,.11],[.64,.16],[.53,.23]],bronze,16,.64));
      }
      if(j<4)p.push(beam(x+2.68,foot+.7,z,x+3.63,foot+.7,z+(j%2?-.78:.78),.32,copper));
      mount(M.merge(...p),0,0,0);
      const driven=add(bank,flywheel,axisX,axisY,wall+.20);
      const fans=[add(bank,fan,x+1.04,axisY,wall+.18),add(bank,fan,x+2.12,axisY,wall+.18)];
      const link=add(bank,rod,0,0,wall+.53),slide=add(bank,slipper,0,axisY,wall+.47);
      const gauge=add(bank,needle,dialX,dialY,wall+.20),puffs=[];
      for(let k=0;k<(lite?4:8);k++)puffs.push(add(bank,vapour));
      const yaw=bank.rotation.y;
      sources.push({x:bank.position.x+axisX*Math.cos(yaw)+wall*Math.sin(yaw),
        z:bank.position.z-axisX*Math.sin(yaw)+wall*Math.cos(yaw),speed:2.9+j*.19,phase:j*1.62});
      engines.push({axisX,axisY,stackX,stackZ,mouthY,driven,fans,link,slide,gauge,puffs});
    }
    const release=Array.from({length:lite?10:21},()=>{const n=add(bank,vapour);n.visible=false;return n;});
    const update=(time,calm,age)=>{
      const drain=1-pressureRamp((age-valveOpens-1.2)/5.6);
      const fill=pressureRamp(age/1.45)*drain;
      liquid.scale.y=travel*(.19+.74*fill);
      meniscus.position.y=glassY+liquid.scale.y;
      for(let j=0;j<engines.length;j++){
        const e=engines[j],t=calm?0:time,a=t*sources[j].speed+sources[j].phase;
        e.driven.rotation.z=a;e.fans[0].rotation.z=-a*2.3;e.fans[1].rotation.z=a*2.7+.81;
        const dx=.42*Math.cos(a),dy=.42*Math.sin(a),run=Math.sqrt(1.27**2-dy**2);
        e.slide.position.x=e.axisX+dx-run;
        e.link.position.x=e.slide.position.x+run*.5;e.link.position.y=e.axisY+dy*.5;
        e.link.rotation.z=Math.atan2(dy,run);
        const pressure=pressureRamp((age-.92-j*.82)/.82)*drain;
        e.gauge.rotation.z=.72+.12*Math.sin(a-.45)-2.52*pressure;
        for(let k=0;k<e.puffs.length;k++){
          const n=e.puffs[k],u=((a/Math.PI+k)/e.puffs.length+j*.31)%1;
          const curl=Math.sin(u*5.7-j)*u,wide=.54+1.95*u;
          n.position.x=e.stackX+u*u*2.5+curl*.46;
          n.position.z=e.stackZ+u*u*.63+u*.24*Math.cos(u*7+j);
          n.position.y=e.mouthY+.04+u*(4.5+j*.16);
          n.scale.x=wide*(1+.37*u);n.scale.y=wide*.95;n.scale.z=wide;
          n.rotation.z=.30*Math.sin(u*3.7+j)+.75*k;
          n.smokeOpacity=Math.min(1,u*18)*(1-u)**.90;
        }
      }
      // One finite discharge. Each parcel leaves the final stack at its own time,
      // then drifts and thins independently after the valve has shut.
      const last=engines[engines.length-1];
      for(let k=0;k<release.length;k++){
        const n=release[k],born=valveOpens+k*valveSeconds/release.length,u=(age-born)/3.9;
        n.visible=u>=0 && u<1;
        if(!n.visible)continue;
        const bend=calm?0:.28*Math.sin(7*u+.53*k)*u;
        n.position.x=last.stackX+4.5*u*u+bend;
        n.position.z=last.stackZ+.92*u*u;
        n.position.y=last.mouthY+.12+9.8*u-1.6*u*u;
        n.scale.x= .56+2.3*u;n.scale.y=.84+2.5*u;
        n.rotation.z=.71*k+.24*u;
        n.smokeOpacity=pressureRamp(u*16)*(1-u*u)*.95;
      }
    };
    return {update,sources,ventLevel};
  };
  const roofBar = lite => {
    const p=[], x=-3.6,z=-4.8;
    p.push(box(x,.6,z,6.45,1.20,.92,copper),K.slab({w:6.65,h:.14,d:1.16,seed:81,color:"#44312e",offset:{x,y:1.26,z}}));
    for(let k=0;k<9;k++){
      const dx=x+(k-4)*.68;
      p.push(box(dx,.61,z+.472,.60,.78,.05,k%2?"#a45d40":"#b47855"));
      // Engraved moon phases: a lit disc with a travelling dark chord cut into the copper panel.
      const disc=turned(0,0,0,[[0,0],[.21,0],[.21,.032],[0,.032]],edge,16,.27);
      const face=M.turnedX(disc,Math.PI/2);p.push(M.moved(face,dx,.66,z+.50));
      if(k!==4){
        const shade=M.merge(), pts=[];
        for(let j=0;j<=12;j++){const a=-Math.PI/2+j*Math.PI/12;pts.push([Math.cos(a)*.208,Math.sin(a)*.208]);}
        for(let j=12;j>=0;j--){const a=-Math.PI/2+j*Math.PI/12;pts.push([(.96-Math.abs(k-4)*.47)*Math.cos(a)*.208,Math.sin(a)*.208]);}
        const ids=pts.map(([u,v])=>M.pushVert(shade,dx+Math.sign(k-4)*u,.66+v,z+.537));
        M.face(shade,k<4?ids.reverse():ids,BL.math.hexToRgb("#604032"),{doubleSided:true});p.push(shade);
      }
    }
    for(const dx of [-2.8,2.8]){
      p.push(globeLamp(x+dx,1.33,z,1.20));
      p.push(beam(x+dx,1.36,z-.35,x+dx,2.54,z-.35,.055,brass));
    }
    p.push(box(x,2.47,z-.36,5.8,.10,.44,dark),box(x,2.53,z-.36,5.96,.045,.46,edge));
    for(const dx of [-2.08,-1.78,-1.48,-1.18,1.18,1.48,1.78,2.08])
      p.push(M.moved(M.turnedZ(goblet(0,0,0,8),Math.PI),x+dx,2.42,z-.18));
    for(const angle of [0,1.07,-.7])
      p.push(M.moved(M.turnedZ(M.turnedX(M.torus(.34,.015,edge,.43,24,5),1.13),angle),x,2.92,z-.34));
    p.push(turned(x,2.54,z-.34,[[.14,0],[.05,.10],[.045,.24],[0,.27]],brass));
    for(const dx of [-1.8,1.8]) for(let i=0;i<3;i++) p.push(goblet(x+dx+i*.18,1.33,z+.27,8));

    for(let i=0;i<(lite?28:82);i++){
      const xx=x-3.1+(i*.618034%1)*6.2, yy=.2+(i*.3817%1)*.6;
      p.push(box(xx,yy,z+.47,.044+(i%3)*.012,.025,.014,i%2?"#e19b67":"#854e38",.23));
    }
    for(const sy of [.14,1.17]) p.push(box(x,sy,z+.48,6.5,.044,.045,edge));
    p.push(beam(x-3.17,.21,z+.72,x+3.17,.21,z+.72,.065,brass));
    for(const rr of [1.52,1.62,2.15]) p.push(ring(1.5,.045,2,rr,.026,edge));
    for(let i=0;i<8;i++) p.push(bottle(x-1.65+i*.44,1.33,z-.15,.32+(i%3)*.11,["#744128","#3b7166","#a57b4a"][i%3],lite?5:9));
    for(const sx of [-6,-4,-2]) p.push(turned(sx,0,-3.62,[[0,0],[.3,0],[.26,.06],[.065,.13],[.065,.68],[.29,.7]],brass),
      turned(sx,0,-3.62,[[.29,.7],[.33,.75],[.31,.85],[0,.87]],leather));
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8, b=a+Math.PI/16, r=i%2?1.3:2.0;
      p.push(beam(1.5+.37*Math.cos(b),.025,2+.37*Math.sin(b),1.5+r*Math.cos(a),.025,2+r*Math.sin(a),.042,brass));
    }
    return M.merge(...p);
  };
  const booths=[];
  const fixtures=[{x:station.x,z:station.z,r:.55}];
  for(const side of [-1,1]) for(const [x,offset] of [[30.6,9],[40,17.8],[far-5.7,8.4]]){
    const z=side*offset, planterX=x-2.36, planterZ=z+side*1.60;
    booths.push({x,z,side,planterX,planterZ});
    fixtures.push({x,z,r:.50},{x:planterX,z:planterZ,r:.50});
    for(let i=0;i<7;i++){const a=.12+i*(Math.PI-.24)/6;fixtures.push({x:x+1.48*Math.cos(a),z:z+side*1.48*Math.sin(a),r:.52});}
  }
  // Reject a sweep through the wall beside the opening, including diagonal steps from the terrace.
  const clear = (ax,az,bx,bz,r) => {
    if(Math.max(ax,bx)<=23-r) return true;
    for(const f of BL.pokerClub.fixtures) if(BL.pokerModels.crosses(ax,az,bx,bz,r,f)) return false;
    const opening=BL.pokerGlazing.OPEN-r;
    if(bx>outer(bz)-r || (bx>23-r && Math.abs(bz)>(bx<inner+r?opening:halfSpan-r))) return false;
    for(let i=0;i<2;i++){
      const x=i?inner+r:23-r;
      if((ax-x)*(bx-x)<0 && Math.abs(az+(bz-az)*(x-ax)/(bx-ax))>opening) return false;
    }
    const dx=bx-ax,dz=bz-az,dd=dx*dx+dz*dz;
    for(const f of fixtures){
      const u=dd?Math.max(0,Math.min(1,((f.x-ax)*dx+(f.z-az)*dz)/dd)):0;
      if((ax+dx*u-f.x)**2+(az+dz*u-f.z)**2<(f.r+r)**2) return false;
    }
    return true;
  };
  // Seated guests and roaming waiters use the crowd graph. These parties stay at their rail or bar.
  const company=(root,lite)=>{
    const models=BL.pokerCrowdModels, guests=models.CAST.filter(m=>m.rig==="caveman" && m.type==="businessman");
    const cast=models.LOUNGE, parties=[], couples=[];
    const person=(x,z,yaw,actor,role,phase)=>{
      const body=M.caveman(actor.traits),p=body.parts;
      for(const key of ["club","gun","snack","jetpack","jetFlame"]) if(p[key]) p[key].visible=false;
      body.root.position.x=x;body.root.position.z=z;body.root.rotation.y=yaw;
      p.head.rotation.x=role==="rail"?-.21:.02;
      p.armR.rotation.x=role==="rail"?-.56:-.87;
      S.addChild(root,body.root);
      const guest={p,role,phase,x,z}; parties.push(guest);return guest;
    };
    for(const side of [-1,1]){
      for(let j=0;j<(lite?1:2);j++){
        const x=side*(6.9+j*6.05), z=-31.67+j*.18, beat=j*2.3+(side+1)*.8;
        const first=person(x-.65,z,1.72,cast[(j+(side+1))%cast.length],"talk",beat);
        const second=person(x+.65,z-.13,-1.78,guests[(j+(side+1))%guests.length],"talk",beat+Math.PI);
        couples.push([first,second]);
      }
      for(let j=0;j<(lite?2:4);j++){
        const z=side*(5.3+j*3.9);
        person(outer(z)-.97-(j%2)*.36,z,Math.PI/2+side*(.16+j*.055),
          j%2?guests[(j+(side+1))%guests.length]:cast[(j+(side+1))%cast.length],"rail",j*1.73+side);
      }
    }
    person(-11.4,-34.81,.06,guests[0],"serve",2.12);
    const lines=[["You saved me a seat?","Only if you stay for the next set."],
      ["One more dance?","I thought you’d never ask."],["You know the pianist?","Only his favorite request."]];
    let nextLine=0,partner=null,exchange=0;
    const update=(t,calm,listener,fx)=>{
      if(listener && fx && t>=nextLine){
        const p=listener.root.position;
        if(partner){
          if(Math.hypot(p.x-partner.x,p.z-partner.z)<5)fx.sayAt(partner.x,1.88,partner.z,lines[exchange%lines.length][1],2.8);
          partner=null;exchange++;nextLine=t+15;
        }else{
          nextLine=t+1.2;
          for(const pair of couples){
            const speaker=pair[0];
            if(Math.hypot(p.x-speaker.x,p.z-speaker.z)>=4.6) continue;
            fx.sayAt(speaker.x,1.88,speaker.z,lines[exchange%lines.length][0],2.5);
            partner=pair[1];nextLine=t+3;break;
          }
        }
      }
      for(const guest of parties){
        const {p,role,phase}=guest, turn=calm?0:Math.sin(t*(role==="rail"?.21:.79)+phase);
        if(role==="rail"){
          p.head.rotation.x=-.24+.09*turn;p.head.rotation.y=.19*turn;
          p.armR.rotation.x=-.45-.97*Math.max(0,turn)**5;
        }else{
          p.head.rotation.z=.07*turn;p.head.rotation.y=.11*turn;
          p.head.rotation.x=.055*turn;p.armR.rotation.x=-.58-.66*Math.max(0,turn);
          p.armL.rotation.z=.12+.09*turn;
        }
      }
    };
    const clear=(ax,az,bx,bz,r)=>{
      if(Math.max(ax,bx)<far-5 && Math.min(az,bz)>-30)return true;
      const dx=bx-ax,dz=bz-az,dd=dx*dx+dz*dz,rr=(r+.29)**2;
      for(const g of parties){
        const x=ax-g.x,z=az-g.z,t=dd?Math.max(0,Math.min(1,-(x*dx+z*dz)/dd)):0;
        if((x+t*dx)**2+(z+t*dz)**2<rr && (x*x+z*z>=rr || x*dx+z*dz<=0))return false;
      }
      return true;
    };
    return {update,clear};
  };
  const build = lite => {
    const root=S.createNode(), p=[], glass=M.merge();
    const add=(parent,geometry,x=0,y=0,z=0)=>{const n=S.createNode({geometry,position:{x,y,z}});S.addChild(parent,n);n.glow=1;return n;};
    // Short stretches of railing and each booth have small independent view bounds.
    const install = () => {
      const g=K.staticMesh(M.merge(...p));g.castShadow=false;add(root,g);p.length=0;
    };
    const floor=BL.pokerFloor.tiles(lite);
    // Reuse full-size casino marble. At the two chamfers only the outermost tile is tapered.
    const rows=14, dz=2*halfSpan/rows, columns=Math.ceil((far-inner)/4);
    const tileWidth=(outer(halfSpan)-inner)/(columns-1);
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const z0=-halfSpan+row*dz, z=z0+dz/2, x0=inner+col*tileWidth;
      const set=(row+col)%2?floor.border:floor.field, tile=set[(row*3+col)%set.length];
      if(col===columns-1){
        const g=M.merge(tile),v=g.verts;
        for(let k=0;k<v.length;k+=3){
          const wz=z+v[k+2]*dz/4;
          v[k]=x0+(v[k]/4+.5)*(outer(wz)-x0);
          v[k+2]=wz;
        }
        add(root,g,0,-.112,0);
      }else{
        const n=add(root,tile,x0+tileWidth/2,-.112,z);n.scale.x=tileWidth/4;n.scale.z=dz/4;
      }
    }
    // Continue the marble through the open bay, overlapping the indoor threshold.
    for(const side of [-1,1]){
      const n=add(root,floor.field[0],(22.2+inner)/2,-.122,side*BL.pokerGlazing.OPEN/2);
      n.scale.x=(inner-22.2)/4;n.scale.z=BL.pokerGlazing.OPEN/4;
    }
    const apron=M.merge(),rim=[[inner,-halfSpan],[outer(halfSpan),-halfSpan],[far,-flatSpan],[far,flatSpan],[outer(halfSpan),halfSpan],[inner,halfSpan]];
    for(let i=0;i<rim.length;i++){
      const [x,z]=rim[i],[xx,zz]=rim[(i+1)%rim.length];
      const ids=[[x,.04,z],[xx,.04,zz],[xx,-.54,zz],[x,-.54,z]].map(q=>M.pushVert(apron,...q));
      M.face(apron,ids,BL.math.hexToRgb("#654d40"));
      p.push(beam(x,-.075,z,xx,-.075,zz,.065,brass));
    }
    p.push(apron);install();
    const perimeter=[[inner,-BL.pokerGlazing.OPEN],...rim,[inner,BL.pokerGlazing.OPEN]],points=[];
    for(let i=0;i<perimeter.length-1;i++){
      const [x,z]=perimeter[i],[xx,zz]=perimeter[i+1],n=Math.ceil(Math.hypot(xx-x,zz-z)/3.4);
      for(let k=0;k<n;k++)points.push([x+(xx-x)*k/n,z+(zz-z)*k/n]);
    }
    points.push(perimeter[perimeter.length-1]);
    points.forEach(([x,z],i)=>{
      p.push(turned(x,.06,z,[[0,0],[.14,0],[.095,.10],[.055,.16],[.055,1.05],[.11,1.08],[.07,1.16],[0,1.18]],brass,lite?5:8,.3));
      if(i%2===1) p.push(terraceLamp(x,1.23,z));
      if(!i)return;const [xx,zz]=points[i-1];
      for(const y of [.13,1.10])p.push(beam(x,y,z,xx,y,zz,y>1?.073:.06,edge));
      for (const level of [.22,.97]) p.push(beam(x,level,z,xx,level,zz,.025,brass));
      const ids=[[x,.19,z],[xx,.19,zz],[xx,1.03,zz],[x,1.03,z]].map(v=>M.pushVert(glass,...v));
      M.face(glass,ids,BL.math.hexToRgb("#8ba8aa"));M.face(glass,ids.slice().reverse(),BL.math.hexToRgb("#8ba8aa"));
      if(i%5===0 || i===points.length-1)install();
    });
    glass.glassOpacity=.10;glass.glassGrazing=.42;glass.castShadow=false;add(root,glass);
    for(const s of [-1,1]){
      const z=s*BL.pokerGlazing.OPEN;
      p.push(turned(24.4,.03,z,[[0,0],[.40,0],[.40,.18],[.30,.32],[.26,3.95],[.36,4.11],[.4,4.25],[0,4.25]],"#a18568",12,.20));
      for(let i=0;i<10;i++){const a=i*tau/10;p.push(beam(24.4+.26*Math.cos(a),.36,z+.26*Math.sin(a),24.4+.26*Math.cos(a),3.94,z+.26*Math.sin(a),.037,brass));}
      p.push(lamp(24.15,2.26,z-s*.22,.68));
    }
    install();
    for(const {x:cx,z:bz,side:s,planterX:px,planterZ:pz} of booths){
      for(let i=0;i<7;i++){
        const a=.12+i*(Math.PI-.24)/6, x=cx+1.48*Math.cos(a),zz=bz+s*1.48*Math.sin(a);
        const padded=(w,h,d,y,z,color)=>M.bevelBox({w,h,d,color,bevel:.064,offset:{x:0,y,z}});
        const cushion=M.merge(box(0,.28,0,.76,.35,.87,dark),box(0,.235,0,.78,.036,.89,edge),
          padded(.76,.19,.84,.50,0,leather),padded(.75,.72,.23,.83,.36,leather),
          box(0,1.19,.36,.74,.032,.20,brass),box(0,.87,.23,.028,.04,.018,brass));
        p.push(M.moved(M.turnedY(cushion,Math.atan2(Math.cos(a),s*Math.sin(a))),x,0,zz));
      }
      p.push(turned(cx,0,bz,[[0,.06],[.31,.06],[.29,.13],[.075,.20],[.075,.68],[.48,.70],[.5,.76],[0,.76]],brass),lamp(cx,.76,bz,.33));
      p.push(turned(px,0,pz,[[0,.06],[.31,.06],[.45,.49],[.48,.53],[.47,.60],[0,.60]],copper));
      for(let i=0;i<(lite?8:17);i++){
        const a=i*2.40,len=.72+(i%4)*.15,h=.9+(i%3)*.24,leaf=M.merge();
        const pts=[[0,.58,0],[.32,.62+h,-.12],[len,.62+h*.72,0],[.32,.65+h,.12],[.34,.73+h,0]];
        const v=pts.map(q=>M.pushVert(leaf,...q));
        for(let j=0;j<4;j++)M.face(leaf,[v[4],v[j],v[(j+1)%4]],BL.math.hexToRgb(j%2?"#345545":"#587057"),{emissive:.22,doubleSided:true});
        p.push(M.moved(M.turnedY(leaf,a),px,0,pz));
      }
      install();
    }
    p.push(beam(24.4,4.26,-4.6,24.4,4.26,4.6,.22,brass));
    const ins=BL.poolModels.carve("TERRACE",{ joined:true,cell:.092,color:opal,emissive:.67});
    p.push(box(24.4,4.42,0,.27,.6,3.6,dark),M.moved(M.turnedY(M.moved(ins.geometry,-ins.width/2,0,0),-Math.PI/2),24.245,4.605,0));
    // Brass compass in the marble marks the observation court from the threshold.
    install();
    const court=station.x-3.8;
    for(const r of [2.7,2.84,3.38])p.push(ring(court,.075,0,r,.023,brass));
    for(let i=0;i<16;i++){
      const a=i*tau/16,r=i%4===0?2.65:i%2===0?1.93:1.12, star=M.geometry();
      const point=(along,across)=>[court+along*Math.cos(a)-across*Math.sin(a),.081,along*Math.sin(a)+across*Math.cos(a)];
      for(const side of [-1,1]){
        const vertices=[point(.17,0),point(.52,side*.23),point(r,0)];
        if(side<0)vertices.reverse();
        M.face(star,vertices.map(v=>M.pushVert(star,...v)),BL.math.hexToRgb(side>0?edge:copper),{emissive:.28});
      }
      p.push(star);
    }
    install();
    const engines=miningShelf(root,add,lite);
    const bartender=service(root,add), guests=company(root,lite);
    const updateService=(t,calm,listener,fx,pressureAge=Infinity)=>{bartender(t,calm);guests.update(t,calm,listener,fx);engines.update(t,calm,pressureAge);};
    const scope=mount(station); S.addChild(root,scope.root);
    return {root,engines,updateService,guestsClear:guests.clear,yaw:scope.yaw,pitch:scope.pitch,target:scope.target,station};
  };
  const mount=station=>{
    const root=S.createNode(), p=[];
    const add=(parent,geometry,x=0,y=0,z=0)=>{
      const n=S.createNode({geometry,position:{x,y,z}}); S.addChild(parent,n); return n;
    };
    for(let i=0;i<3;i++){
      const a=i*tau/3;
      p.push(beam(station.x+.62*Math.cos(a),.07,station.z+.62*Math.sin(a),station.x,1.34,station.z,.106,brass));
    }
    p.push(turned(station.x,1.05,station.z,[[.13,0],[.22,.04],[.22,.12],[.12,.18],[.12,.52],[0,.54]],dark));
    const dial=ring(station.x,1.12,station.z,.32,.035,edge);
    p.push(dial,ring(station.x,.68,station.z,.33,.025));
    for(let i=0;i<16;i++){
      const a=i*tau/16,dx=Math.cos(a),dz=Math.sin(a);
      p.push(beam(station.x+dx*.25,1.14,station.z+dz*.25,station.x+dx*.31,1.14,station.z+dz*.31,.015,edge));
    }
    add(root,M.merge(...p),0,station.y-1.62,0);
    const yaw=add(root,null,station.x,station.y,station.z),pitch=add(yaw,null);
    const tube=M.merge(turned(0,0,0,[[0,-.68],[.066,-.68],[.066,-.49],[.10,-.45],[.12,-.30],[.13,.22],[.16,.28],[.16,.61],[.19,.64],[.19,.78],[0,.78]],brass,16,.25),
      turned(0,0,0,[[.17,.782],[.15,.793],[0,.793]],"#4399a5",16,.62));
    for(const y of [-.43,-.13,.23,.60]){const r=y>.2?.165:.134;const band=turned(0,0,0,[[r,y],[r+.007,y+.016],[r,y+.044]],dark,16);S.addChild(pitch,S.createNode({geometry:M.turnedX(band,Math.PI/2)}));}
    const target=add(pitch,M.turnedX(tube,Math.PI/2));return {root,yaw,pitch,target,station};
  };
  BL.pokerTerrace=Object.freeze({station,halfSpan,outer,contains,clear,serviceX,cocktail,bar,roofBar,mount,build});
})();
