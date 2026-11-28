// The founder's table and the single west window bay beside it. All fittings are baked at room creation.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, tau = 2 * Math.PI;
  const brass = "#c69856", polish = "#eed39a", bronze = "#765038", ink = "#172e2b", walnut = "#734531";
  const block = (x,y,z,w,h,d,color,emissive=0) => M.box({w,h,d,color,emissive,offset:{x,y,z}});
  const face = (g,pts,color,emissive=0) => M.face(g,pts.map(p=>M.pushVert(g,...p)),BL.math.hexToRgb(color),{emissive});

  // The three projection cells share the same paper. Only the upper face carries the wool and marquetry.
  const cloth = M.cached(() => {
    const size=640, canvas=document.createElement("canvas");
    canvas.width=3*size; canvas.height=size;
    const ctx=canvas.getContext("2d"), rand=BL.math.mulberry32(20090103);
    ctx.fillStyle="#684330"; ctx.fillRect(0,0,canvas.width,size);
    const tile=ctx.createImageData(size,size), bytes=tile.data;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=(x+.5-size/2)/(size*.4922), v=(y+.5-size/2)/(size*.4922);
      const r=Math.hypot(u,v), i=4*(y*size+x), noise=rand()-.5;
      if(r>.868){
        // Adjacent leaves from the same cut of wood meet at each mitre.
        const a=Math.atan2(v,u), leaf=Math.abs(((a+Math.PI)*12/Math.PI)%2-1);
        const grain=leaf*24+8*Math.sin(r*21+leaf*.7)+2*Math.sin(leaf*7+r*28);
        const grainLight=9*Math.sin(grain)+4*Math.sin(grain*3.17)+3*Math.sin(grain*7.1)+noise*11;
        const band=Math.abs(r-.879)<.006||Math.abs(r-.982)<.004;
        bytes[i]=band?212:127+grainLight; bytes[i+1]=band?171:78+grainLight*.7; bytes[i+2]=band?100:48+grainLight*.48;
      }else{
        const wool=noise*13+((x+y)%3===0?2:0)+3*(1-r);
        bytes[i]=41+wool*.7; bytes[i+1]=91+wool; bytes[i+2]=69+wool*.86;
      }
      bytes[i+3]=255;
    }
    ctx.putImageData(tile,2*size,0);
    return {canvas,version:0,atlas:true,atlasMin:[-1,0,-1],atlasMax:[1,1,1],rect:[0,0,1,1]};
  });
  const felt = (g,lite,y,color) => {
    if(lite){
      // Short radial faces sort against the cards in the painter. A single full-length wedge can hide the flop.
      const radii=[1, .985, .97, .89, .877, .868, .73, .57, .41, .25, .12, 0];
      return M.lathe({segments:32, profile:radii.map(r=>[r,y]),
        color:t=>{const r=radii[Math.round(t*(radii.length-1))];return r>.98?brass:r>.89?walnut:r>.877?brass:r>.868?walnut:color;}});
    }
    if(typeof CanvasRenderingContext2D!=="undefined"){
      const white=BL.math.hexToRgb("#ffffff");
      for(const f of g.faces) f.color=white;
      g.imageSurface=cloth();
    }
    return g;
  };

  const table = (angles,A,B,lite) => {
    const p=[],g=M.geometry(), samples=lite?80:176;
    // Stitch the curved crown of the existing cushion. Slanted pairs have a gap between each needle hole.
    const seam=(t,pitch)=>{
      const c=Math.cos(t),s=Math.sin(t),normal=Math.hypot(c/A,s/B), offset=.112*Math.cos(pitch);
      return [A*c+c/A/normal*offset,.832+.086*Math.sin(pitch),B*s+s/B/normal*offset];
    };
    for(let i=0;i<samples;i++)for(const pitch of [1.12,2.01]){
      const t=i*tau/samples,end=t+tau/samples*.53;
      face(g,[seam(t,pitch-.048),seam(t,pitch+.050),seam(end,pitch+.092),seam(end,pitch-.006)],"#d69f77",.25);
    }
    // Chamfered brass escutcheons carry recessed chip flutes and a green enamel mint mark at every place.
    const plate=(w,h,cut,depth,color)=>M.turnedX(M.prism([
      [-w/2+cut,-h/2],[w/2-cut,-h/2],[w/2,-h/2+cut],[w/2,h/2-cut],[w/2-cut,h/2],[-w/2+cut,h/2],[-w/2,h/2-cut],[-w/2,-h/2+cut]
    ],depth,color,.25),-Math.PI/2);
    const hardware=[plate(.38,.132,.038,.014,brass),M.moved(plate(.358,.114,.033,.008,"#513023"),0,.009,0),
      M.moved(plate(.109,.094,.025,.010,ink),0,.015,0)];
    for(const side of [-1,1]){
      for(let j=0;j<3;j++)hardware.push(block(side*.107,.016,(j-1)*.027,.072,.006,.013,"#2b211a"),
        block(side*.107,.020,(j-1)*.027+.008,.071,.004,.005,polish,.27));
      hardware.push(block(side*.153,.018,0,.014,.005,.014,polish,.4));
    }
    for(const side of [-1,1])hardware.push(M.beam(-.027,.023,0,0,.023,side*.032,.009,polish,.47),
      M.beam(0,.023,side*.032,.027,.023,0,.009,polish,.47));
    const die=M.merge(...hardware);
    for(const seatAngle of angles){
      // Set the mark beside the betting line, where a live stack cannot cover it.
      const a=seatAngle+.18;
      const x=1.95*.943*Math.cos(a),z=1.25*.943*Math.sin(a);
      p.push(M.moved(M.turnedY(M.merge(die),Math.atan2(-1.25*Math.cos(a),-1.95*Math.sin(a))),x,.798,z));
    }
    // The oval maker’s plate faces inward from the west arm, below the opposite player's hands.
    const badge=[block(0,0,0,.66,.141,.029,brass,.35),block(0,0,.019,.634,.122,.018,ink,.32)];
    const stamp=BL.poolModels.carve("SATOSHI",{joined:true,cell:.017,color:polish,emissive:.6}).geometry;
    const bounds=BL.scene.boundsOf(stamp);
    for(let i=2;i<stamp.verts.length;i+=3)stamp.verts[i]=(stamp.verts[i]-bounds.min[2])*.14;
    badge.push(M.moved(stamp,-bounds.center[0],-bounds.center[1],.031));
    for(const x of [-.279,.279]){
      const screw=M.turnedX(M.lathe({segments:8,profile:[[.018,0],[.021,.005],[.017,.010],[0,.010]],color:polish,emissive:.4}),Math.PI/2);
      badge.push(M.moved(screw,x,0,.027),M.moved(M.turnedZ(block(0,0,0,.024,.005,.002,bronze),.51),x,0,.038));
    }
    p.push(M.moved(M.turnedY(M.turnedX(M.merge(...badge),-.53),1.35),-A+.046,.952,-.27));
    // Stepped walnut apron and two fine brass beads beneath the cushion.
    const n=lite?32:72,sections=[[.61,1.00,.67,1.026,bronze],[.67,1.026,.69,1.036,brass],
      [.69,1.036,.755,1.036,walnut],[.755,1.036,.77,1.04,polish]];
    for(let i=0;i<n;i++){
      const point=(t,y,r)=>[A*r*Math.cos(t),y,B*r*Math.sin(t)],a=i*tau/n,b=(i+1)*tau/n;
      for(const [lo,r0,hi,r1,color] of sections)face(g,[point(a,lo,r0),point(a,hi,r1),point(b,hi,r1),point(b,lo,r0)],color,.18);
    }
    return M.merge(g,...p);
  };

  const signTrim = () => {
    const p=[];
    for(const x of [-.68,.68]){
      p.push(M.moved(M.lathe({segments:12,profile:[[.15,.05],[.15,.075],[.09,.095],[.08,.15],[.058,.175],[.058,.97],[.092,.99],[.09,1.035]],color:brass}),x,0,0));
    }
    for(const side of [-1,1])for(const dir of [-1,1]){
      const x=.87*side,z=dir*.085;
      for(const y of [1.125,1.60]){
        const sy=y<1.3?1:-1;
        p.push(M.beam(x-side*.13,y,z,x-side*.047,y,z,.017,polish,.38),
          M.beam(x-side*.047,y,z,x,y+sy*.049,z,.017,polish,.38),
          M.beam(x,y+sy*.049,z,x,y+sy*.115,z,.017,polish,.38));
      }
    }
    return M.merge(...p);
  };

  const bay = () => {
    const p=[], height=BL.pokerGlazing.HEAD;
    for(const side of [-1,1]){
      const pier=side*3.60;
      p.push(block(pier,4.45,0,.70,8.42,.30,"#302824"),block(pier,4.28,.18,.53,7.88,.15,walnut),
        block(pier,1.14,.28,.66,1.43,.16,bronze),block(pier,1.16,.37,.51,1.23,.045,ink));
      for(const dx of [-.29,-.22,.22,.29])p.push(block(pier+dx,4.44,.278,.029,7.83,.04,brass,.28));
      for(let j=-2;j<=2;j++)p.push(block(pier+j*.070,5.34,.266,.030,2.70,.064,j%2?bronze:brass,.20));
      for(const y of [.57,1.84,2.02,4.02,6.63,6.78])p.push(block(pier,y,.24,.70,.049,.21,brass,.26));
      // Split opal cylinder, stepped gallery, shadowed escutcheon and dark protective reeds.
      p.push(block(pier,3.03,.28,.52,1.70,.13,ink));
      for(let j=-2;j<=2;j++){
        const k=Math.abs(j),y=3.06;
        p.push(block(pier+j*.079,y,.43-k*.033,.070,1.03-k*.11,.11,k===0?"#ffe6aa":k===1?"#edb760":"#d78a49",.84));
      }
      for(const y of [2.48,3.64])p.push(block(pier,y,.41,.47,.075,.32,bronze),
        block(pier,y+.045,.41,.41,.026,.31,polish,.38));
      for(const y of [2.17,2.29,3.81,3.93])p.push(block(pier,y,.33,.30-Math.abs(y-3.05)*.18,.088,.11,brass,.38));

    }
    for(const [dy,h,d,c] of [[.22,.26,.34,walnut],[.03,.10,.39,brass],[-.105,.13,.31,ink],[-.195,.035,.35,polish]])
      p.push(block(0,height+dy,.02,8.48,h,d,c,.24));
    // The sill echoes the table apron, with dark recessed panels and paired corner keys.
    for(let i=-2;i<=2;i++){
      const x=i*1.30;
      p.push(block(x,.62,.12,1.28,.49,.20,walnut),block(x,.62,.23,1.12,.34,.05,bronze),
        block(x,.62,.262,1.052,.273,.025,ink));
      for(const s of [-1,1])p.push(M.beam(x+s*.47,.55,.287,x+s*.36,.67,.287,.022,brass,.28));
    }
    p.push(block(0,.904,.17,7.55,.065,.33,brass,.28));
    return BL.pokerMarble.staticMesh(M.turnedY(M.merge(...p),Math.PI/2));
  };
  BL.pokerSatoshi=Object.freeze({felt,table,signTrim,bay});
})();
