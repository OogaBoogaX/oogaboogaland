// The west-wall jazz trio, its mainnet halving dial and the short shower over a winning table.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const floor = Object.freeze({kind:"bandstand", x:-22.85, z:0, hx:1.04, hz:2.43, solid:true});
  const gold="#deae65", ivory="#f8e6be", wood="#83472e", ebony="#29242a", velvet="#6f2432";
  const box = (x,y,z,w,h,d,color,emissive=.15) => M.box({w,h,d,color,emissive,offset:{x,y,z}});
  const turned = (x,y,z,profile,color,segments=12,e=.22) =>
    M.moved(M.lathe({profile,segments,color,emissive:e}),x,y,z);
  const part = (root,geometry,x=0,y=0,z=0) => {
    const n=S.createNode({geometry,position:{x,y,z}}); S.addChild(root,n); return n;
  };
  const musician = (x,jacket,armHeight) => {
    const p=[turned(x,.72,-.22,[[0,0],[.22,0],[.18,.18],[.28,.56],[.21,.63],[0,.64]],jacket),
      box(x,1.15,-.006,.135,.30,.03,ivory),box(x,1.28,.019,.16,.054,.027,ebony),
      box(x,1.54,-.20,.36,.38,.34,"#9c6750"),box(x,1.55,-.008,.12,.092,.065,"#b87b58"),
      turned(x,1.72,-.20,[[0,0],[.30,0],[.30,.035],[.22,.05],[.18,.19],[0,.19]],ebony)];
    for(const s of [-1,1]){
      p.push(box(x+s*.115,.49,-.22,.164,.46,.19,ebony),box(x+s*.115,.26,-.17,.18,.095,.27,ebony),
        box(x+s*.084,1.61,-.017,.048,.029,.03,ebony),
        M.beam(x+s*.223,1.27,-.21,x+s*.32,armHeight-.13,.02,.135,jacket),
        M.beam(x+s*.32,armHeight-.13,.02,x+s*.13,armHeight,.19,.10,"#aa7255"));
    }
    return M.merge(...p);
  };
  const scenery=M.cached(()=>{
    const p=[box(0,.12,0,4.86,.24,2.08,wood),box(0,.227,0,4.87,.036,2.09,gold),
      box(0,.258,0,4.78,.035,2,velvet),box(0,2.06,-.88,4.68,3.63,.17,ebony),
      box(0,3.88,-.84,4.84,.12,.22,gold),box(0,2.97,-.75,2.98,.05,.08,gold),
      BL.pokerClub.word("NEXT HALVING",.047,0,3.65,-.72)];
    for(const s of [-1,1]){
      for(let k=0;k<4;k++){
        const dx=s*(2.22-k*.12);
        p.push(M.beam(dx,.30,-.71,dx,2.43+k*.13,-.71,.05,gold),
          M.beam(dx,2.43+k*.13,-.71,s*(1.48-k*.075),3.78,-.71,.05,gold));
      }
      p.push(turned(s*1.89,.27,.77,[[0,0],[.16,0],[.12,.06],[.075,.14],[.10,.19],[0,.21]],gold),
        box(s*1.89,.49,.77,.13,.055,.104,ivory,.95));
    }
    for(let j=-5;j<=5;j++){
      const x=j*.42;
      p.push(box(x,.12,1.043,.4,.16,.012,j%2?"#714530":"#845038"));
      for(let k=0;k<3;k++) p.push(M.beam(x-.17,.071+k*.04,1.054,x+.16,.078+k*.04,1.054,.009,"#a56742"));
    }
    // Narrow velvet pleats catch the footlights behind the brass dial.
    for(let i=-12;i<=12;i++){
      const x=i*.162;
      p.push(box(x,1.56,-.75,.143,2.48,.073+(i%2===0?.036:0),i%2===0?"#4d2632":"#60303b",.26));
    }
    const dialY=2.52;
    p.push(M.moved(M.turnedX(M.torus(.39,.025,gold,.53,30,5),Math.PI/2),0,dialY,-.62),
      M.moved(M.turnedX(M.torus(.337,.012,ivory,.41,24,4),Math.PI/2),0,dialY,-.61));
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,x=Math.sin(a),y=Math.cos(a);
      p.push(M.beam(.29*x,dialY+.29*y,-.588,.34*x,dialY+.34*y,-.588,.016,gold));
    }
    // Upright bass, including bridge, fingerboard, tuning machines and four strings.
    const bass=turned(0,0,0,[[0,0],[.12,0],[.28,.09],[.32,.27],[.21,.43],[.19,.54],[.23,.65],[.17,.77],[.067,.81],[0,.81]],wood);
    p.push(M.moved(bass,-1.43,.43,.34),box(-1.43,1.53,.39,.081,.77,.085,ebony),
      box(-1.43,1.96,.38,.12,.17,.10,wood),box(-1.43,.78,.65,.14,.055,.042,ivory));
    for(let i=0;i<4;i++)p.push(M.beam(-1.459+i*.019,.68,.65,-1.459+i*.019,2.01,.445,.009,ivory),
      box(-1.43+(i%2?.09:-.09),1.92+i*.032,.38,.065,.035,.035,gold));
    // Felt-lined kick drum and side toms with rolled brass hoops.
    for(const [x,y,z,r] of [[0,.64,.42,.35],[-.38,.96,.32,.18],[.32,1.02,.38,.206]]){
      const drum=M.turnedX(turned(0,0,0,[[0,0],[r,0],[r,.30],[0,.30]],velvet),Math.PI/2);
      p.push(M.moved(drum,x,y,z),M.moved(M.turnedX(turned(0,0,0,[[0,0],[r,0],[r,.028],[0,.028]],ivory),Math.PI/2),x,y,z+.305));
    }
    for(const s of [-1,1])p.push(box(s*.57,.81,.17,.029,1.06,.029,gold),
      turned(s*.57,1.34,.17,[[0,0],[.22,0],[.085,.027],[.037,.048],[0,.048]],gold));
    // Brushed trumpet bell and visible valve buttons, facing out over the stage.
    p.push(M.moved(M.turnedX(turned(0,0,0,[[.025,0],[.025,.32],[.059,.47],[.15,.54],[.15,.56],[.125,.55],[.027,.43]],gold,16,.48),Math.PI/2),1.47,1.5,.04));
    for(let i=0;i<3;i++)p.push(box(1.47,1.51,.18+i*.055,.054,.16,.032,gold));
    return BL.pokerMarble.staticMesh(M.merge(...p));
  });
  const build = (root,lite) => {
    const stage=part(root,scenery(),floor.x,0,floor.z);
    stage.rotation.y=Math.PI/2;
    const players=[part(stage,musician(-1.60,"#37504d",1.38)),part(stage,musician(0,ebony,1.06)),part(stage,musician(1.47,velvet,1.46))];
    const needle=part(stage,M.beam(0,-.065,0,0,.28,0,.024,ivory),0,2.52,-.56);
    const counter=BL.pokerClub.line(stage,0,3.19,2.6,19,-.74);
    const coin=M.lathe({profile:[[0,0],[.088,0],[.094,.009],[.094,.024],[.085,.032],[0,.032]],segments:lite?8:14,color:gold,emissive:.77});
    const shower=part(root,null), coins=Array.from({length:lite?7:17},()=>part(shower,coin));
    let age=3, shownHeight=-1, highWater=0, party=0;
    shower.visible=false;
    const award = table => {
      const t=BL.pokerModels.TABLES[table];shower.position.x=t.x;shower.position.z=t.z;age=0;
    };
    const update=(dt,time,calm,snap,now)=>{
      const height=snap.heightAt>0 && now-snap.heightAt<150000 ? snap.height : 0;
      if(height!==shownHeight){
        needle.visible=height>0;
        if(height)needle.rotation.z=-2*Math.PI*(height%210000)/210000;
        counter(height ? (210000-height%210000)+" BLOCKS" : "AWAITING TIP");
        if(shownHeight>0 && highWater>0 && Math.floor(height/210000)>Math.floor(highWater/210000))party=12;
        highWater=Math.max(highWater,height);shownHeight=height;
      }
      party=Math.max(0,party-dt);
      for(let i=0;i<players.length;i++)players[i].rotation.z=calm?0:Math.sin(time*(i===1?2.6:1.3)+i)*.012;
      age+=dt;
      if(party>0 && age>=2.1){
        shower.position.x=floor.x;shower.position.z=floor.z;age=0;
      }
      shower.visible=!calm && age<2.1;
      if(shower.visible) for(let i=0;i<coins.length;i++){
        const u=Math.max(0,Math.min(1,(age-(i%5)*.09)/1.68)), a=i*2.39996;
        const n=coins[i]; n.visible=u>0 && u<1;
        n.position.x=Math.cos(a)*u*1.32;n.position.z=Math.sin(a)*u*.84;
        n.position.y=1.23+3.8*u*(1-u)+u*.06;n.rotation.x=a+u*8;n.rotation.z=u*2.8;
      }
      return party/12;
    };
    return {update,award};
  };
  BL.pokerBandstand=Object.freeze({floor,build});
})();
