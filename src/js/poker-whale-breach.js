// A lunge-feeding school, a side-slap splash, and the pressure wave that overtops Whale Watch's front weir.
(() => {
  "use strict";
  const BL=window.BL, M=BL.models, S=BL.scene, TAU=Math.PI*2;
  const smooth=(a,b,t)=>{const u=Math.max(0,Math.min(1,(t-a)/(b-a)));return u*u*(3-2*u);};
  const vertexRow=(g,points)=>points.map(p=>M.pushVert(g,...p));
  const patch=(g,a,b,c,d,color,glow)=>{
    const ids=[a,b,c,d];
    M.face(g,ids,color,{emissive:glow});M.face(g,ids.slice().reverse(),color,{emissive:glow});
  };
  const cache=M.scopedMap();
  const feedX=42,feedZ=-50.5,cloudHeight=13;
  const onyx = BL.pokerMarble.mineralAtlas(() => BL.pokerOnyxMap, 192);
  // Cut mineral bands follow each billow around to its underside, where the terrace sees them best.
  const stormGeometry=lite=>{
    const random=BL.math.mulberry32(9275),stone=M.geometry(),filaments=[[],[],[]],segments=lite?12:24;
    const usePhoto=!lite && typeof CanvasRenderingContext2D!=="undefined";
    const layers=[-1,-.88,-.865,-.83,-.68,-.64,-.60,-.38,-.30,-.285,-.09,-.065,-.052,.12,.15,.19,.43,.52,.54,.71,.86,1];
    const swatch=BL.pokerOnyxSwatch;
    let index=0;
    const billow=(x,y,z,w,h,d)=>{
      const seed=random()*TAU,fold=.13+random()*.10;
      const point=(a,v,lift=0)=>{
        const crimp=fold*Math.sin(2*a+seed+v*2)+.09*Math.sin(4*a-seed*.7+v)+.042*Math.cos(7*a+v*3);
        const lat=(v+(1-v*v)*crimp)*Math.PI*.5,rad=Math.cos(lat)*(1+.058*Math.sin(3*a+seed));
        return [x+(w+lift)*rad*Math.cos(a),y+(h+lift)*Math.sin(lat),z+(d+lift)*rad*Math.sin(a)];
      };
      let prev;
      for(let j=0;j<layers.length;j++){
        const row=[];
        for(let k=0;k<segments;k++)row.push(M.pushVert(stone,...point(k*TAU/segments,layers[j])));
        // Sample the specimen around each billow on the texture-free tier; its raw colours
        // are baked into faces once. The rotated billows expose different parts of the cut.
        const latitude=j ? (layers[j-1]+layers[j])*.5 : -1;
        const swatchRow=!usePhoto ? Math.min(swatch.height-1, Math.floor((.5-.5*Math.sin(latitude*Math.PI*.5))*swatch.height))*swatch.width : 0;
        if(prev)for(let k=0;k<segments;k++){
          const angle=(k+.5)*TAU/segments,next=(k+1)%segments;
          const glint=Math.max(0,Math.cos(angle-1.12+.24*layers[j]))**18;
          const v=Math.round(122+15*layers[j]+17*Math.cos(angle+seed)+glint*(10+12*(1+layers[j])));
          const color=[v,v+3,v+10];
          if(!usePhoto){
            const col=Math.floor((.5+.49*Math.sin(angle+seed))*swatch.width);
            const rgb=swatch.palette[swatch.texels.charCodeAt(swatchRow+col)-65];
            color[0]=Math.round(color[0]*(rgb>>16)/255);
            color[1]=Math.round(color[1]*(rgb>>8&255)/255);
            color[2]=Math.round(color[2]*(rgb&255)/255);
          }
          M.face(stone,[prev[k],row[k],row[next],prev[next]],color,{emissive:.60});
        }
        prev=row;
      }
      // Short branching cracks just outside the polished skin can light up independently.
      const group=filaments[index%3],side=index*2.4;
      let last=point(side,-.84,.08);
      for(let k=1;k<=8;k++){
        const a=side+k*.16+.13*Math.sin(k*3+seed),v=-.84+k*.13;
        const end=point(a,v,.08);
        group.push(M.beam(...last,...end,.066,"#cadcff",1));
        if(k===3 || k===6)group.push(M.beam(...end,...point(a+.36,v-.13,.09),.045,"#9eaaff",1));
        last=end;
      }
      index++;
    };
    billow(0,2,0,7.7,2.2,4.2);
    for(let i=0;i<12;i++){
      const a=i*TAU/12;
      billow(6.7*Math.cos(a),2.1+.7*random(),3*Math.sin(a),2.7+1.4*random(),1.9+random(),2+random());
    }
    billow(-2,4.4,-.7,4.7,3.6,3.5);billow(2.3,4,-1,4,2.9,3.2);
    stone.smooth=true;stone.chrome=.12;
    if(usePhoto){
      const bounds=S.boundsOf(stone);
      onyx(stone,bounds.min,bounds.max);
    }
    return {stone,arcs:filaments.map(parts=>M.merge(...parts))};
  };
  // The channel is anchored at the point of impact, with a thicker violet corona around its white core.
  const boltGeometry=()=>{
    const core=[],halo=[];
    const channel=(points,width)=>{
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],w=width*(1-.35*i/points.length);
        core.push(M.beam(...a,...b,w,"#effaff",1));
        halo.push(M.beam(...a,...b,w*3.2,"#927cff",1));
      }
    };
    const trunk=[[-1.3,cloudHeight+1.5,.2],[-.6,11.9,0],[-1.65,10,.35],[-.52,9.25,.28],
      [-.95,7.6,.50],[.84,6.4,.26],[.58,5.15,.52],[1.55,4.55,.23],[-.37,2.65,-.05],[.31,1.62,.18],[0,0,0]];
    channel(trunk,.21);
    channel([trunk[2],[-2.9,9.15,.42],[-3.1,8.06,.60],[-4.5,6.95,.42]],.11);
    channel([trunk[4],[.42,7.9,-.60],[1.64,7.45,-1.20],[2.8,7.62,-1.54]],.09);
    channel([trunk[6],[2.50,4.80,.75],[2.26,3.70,.8],[3.46,2.75,1.19]],.10);
    const glow=M.merge(...halo);glow.glassOpacity=.29;
    return {core:M.merge(...core),halo:glow};
  };
  // Phase zero brings the drifting storm over the feeding site once per minute.
  const geometry=lite=>{
    if(cache.has(lite))return cache.get(lite);
    const fish=M.geometry(), crown=M.geometry(), wave=M.geometry(), lip=M.geometry(), pour=M.geometry();
    const orange=[247,147,26], gold=[255,177,62], copper=[226,110,13];
    const rings=[[-.22,.05,.045],[-.07,.115,.068],[.095,.105,.065],[.22,.024,.026]];
    let prev;
    for(const [x,h,w] of rings){
      const row=[];
      for(let k=0;k<6;k++){const a=k*TAU/6;row.push(M.pushVert(fish,x,h*Math.cos(a),w*Math.sin(a)));}
      if(prev)for(let k=0;k<6;k++){const j=(k+1)%6;M.face(fish,[prev[k],prev[j],row[j],row[k]],k===0||k===5?gold:orange,{emissive:.85});}
      prev=row;
    }
    patch(fish,...vertexRow(fish,[[-.20,.03,0],[-.37,.14,0],[-.35,-.12,0],[-.20,-.03,0]]),copper,.85);
    const foam=[201,239,234], pale=[127,207,217], blue=[51,139,161], deep=[27,101,129];
    // Thin fingers of water fly out of the impact ellipse; their tops break into independent droplets.
    const random=BL.math.mulberry32(70739),segments=lite?26:52;
    let last;
    for(let i=0;i<=segments;i++){
      const a=i*TAU/segments,c=Math.cos(a),s=Math.sin(a);
      const high=.30+.55*Math.sin(a*7+.37)**2+.20*Math.cos(a*11),r=.87+.09*Math.cos(a*5);
      const row=vertexRow(crown,[[.54*c,-.06,.54*s],[r*c,.18,r*s],[(r+.10)*c,high*.70,(r+.10)*s],[(r+.22)*c,high,(r+.22)*s],[(r+.31)*c,high+.055,(r+.31)*s]]);
      if(last){
        patch(crown,last[0],row[0],row[1],last[1],deep,.62);
        patch(crown,last[1],row[1],row[2],last[2],i%4===0?blue:pale,.73);
        patch(crown,last[2],row[2],row[3],last[3],pale,.72);
        if(i%6!==0)patch(crown,last[3],row[3],row[4],last[4],foam,.80);
      }
      last=row;
    }
    // An asymmetric crest with a hollow leading face, white lip and trailing swell, moving toward +z.
    last=null;
    for(let i=0;i<=segments;i++){
      const x=2*i/segments-1, k=Math.max(.015,1-x*x), crest=k*(.92+.08*Math.cos(17*x)), z=-1.2*x*x+.13*Math.sin(12*x);
      const row=[[-4.4,.015],[-2.4,crest*.30],[-.62,crest*.84],[-.16,crest],[.36,crest*.91],[.04,crest*.46],[.81,.015]]
        .map(([d,y])=>M.pushVert(wave,x,y,z+d));
      if(last)for(let j=0;j<row.length-1;j++)patch(wave,last[j],row[j],row[j+1],last[j+1],
        j===3?foam:j===2||j===4?pale:j===1?blue:deep,j===3?.89:.65);
      last=row;
    }
    // In local metres the sheet starts on the lip, bends outward and breaks into streaks down the cliff.
    const ribbons=lite?14:32;
    for(let i=0;i<ribbons;i++){
      const u=-1+2*i/ribbons,v=u+1.94/ribbons,reach=1.7+.8*random(),len=.83+.17*random();
      let last;
      // One end stays submerged while the other lifts the start of this same falling ribbon.
      for(const [z,y] of [[-3.6,-.035],[-2.4,.16],[-1.35,.54],[-.64,.88],[-.18,1.02],[.16*reach,1]]){
        const row=[M.pushVert(lip,u,y,z),M.pushVert(lip,v,y,z+.08)];
        if(last)patch(lip,last[0],last[1],row[1],row[0],i%5===2 && y>.8?pale:blue,.62);
        last=row;
      }
      last=null;
      for(const [out,down] of [[.16,0],[.54,.015],[.86,.075],[1.18,.30],[1.45,.66],[1.70,1]]){
        const z=out<0?out:out*reach, yy=-down*len;
        const row=[M.pushVert(pour,u,yy,z),M.pushVert(pour,v,yy,z+.08)];
        if(last)patch(pour,last[0],last[1],row[1],row[0],i%5===2?foam:i%3===1?pale:blue,.73);
        last=row;
      }
    }
    const drop=M.lathe({profile:[[0,-.4],[.15,-.12],[.12,.19],[0,.4]],segments:5,color:"#daefeb",emissive:.83});
    const pack=g=>{g.castShadow=false;g.fogPierce=.55;return BL.pokerMarble.staticMesh(g);};
    crown.glassOpacity=.78;wave.glassOpacity=.83;lip.glassOpacity=.80;pour.glassOpacity=.77;
    if(!lite){for(const f of pour.faces)f.water="codefall";pour.glass=.91;delete pour.glassOpacity;}
    const storm=stormGeometry(lite),bolt=boltGeometry();
    const kit={cloud:pack(storm.stone),arcs:storm.arcs.map(pack),bolt:pack(bolt.core),halo:pack(bolt.halo),ripple:pack(M.torus(1,.042,"#b3e5e6",.81,16,4)),fish:pack(fish),crown:pack(crown),wave:pack(wave),lip:pack(lip),pour:pack(pour),drop:pack(drop)};
    cache.set(lite,kit);return kit;
  };
  const build=(parent,lite,top,weirX,width)=>{
    const g=geometry(lite),random=BL.math.mulberry32(4971);
    const add=(p,geo=null)=>{const n=S.createNode({geometry:geo});S.addChild(p,n);return n;};
    const event=add(parent),school=add(event),spray=add(event),crown=add(event,g.crown),crest=add(event,g.wave),lip=add(event,g.lip),spill=add(event,g.pour);
    const cloud=add(parent,g.cloud),arcs=g.arcs.map(geo=>add(cloud,geo)),bolt=add(event),ring=add(event,g.ripple);
    add(bolt,g.bolt);add(bolt,g.halo);
    bolt.position.x=ring.position.x=feedX;bolt.position.y=top;ring.position.y=top+.10;bolt.position.z=ring.position.z=feedZ;
    const fish=[],drops=[],mouth=new Float64Array(3);
    const count=lite?30:60;
    for(let i=0;i<count;i++){
      const a=random()*TAU,r=Math.sqrt(random()),x=3.5*r*Math.cos(a),z=2.1*r*Math.sin(a);
      const depth=i%3===0?.055+random()*.09:.30+random()*.67;
      const delay=i/count*.26,heading=a-delay*.62,wag=a-delay*8;
      fish.push({node:add(school,g.fish),x,z,depth,delay,heading,size:1.0+.55*random(),
        sinHeading:Math.sin(heading),cosHeading:Math.cos(heading),sinWag:Math.sin(wag),cosWag:Math.cos(wag)});
    }
    for(let i=0;i<(lite?16:42);i++){
      const a=random()*TAU,v=3+random()*3.6;
      drops.push({n:add(spray,g.drop),vx:Math.cos(a)*v,vy:7+random()*6,vz:Math.sin(a)*v,delay:.21*random(),size:.6+random()});
    }
    const update=(t,w,calm,stormX,stormZ,lipZ)=>{
      const since=t+10,phase=since*TAU/60;
      event.position.x=w?w.offsetX:0;event.position.z=w?w.offsetZ:0;
      cloud.position.x=feedX+stormX;cloud.position.z=feedZ+stormZ;
      cloud.position.y=top+cloudHeight+.35*Math.sin(phase);
      const charging=since>=57.8 && since<60;
      for(let i=0;i<arcs.length;i++){
        const arc=arcs[i],tick=Math.floor((since-57.8)*18);
        arc.visible=charging && (calm?i===1:(tick+i*7)%5<2 || (since>59.45 && (tick+i)%3===0));
        if(arc.visible)arc.glow=calm?.50:1.65;
      }
      bolt.visible=!!w && since>=0 && since<(calm?.22:.42);
      if(bolt.visible){
        bolt.children[0].glow=calm?.62:1.8;
        bolt.children[1].visible=!calm;
        const fading=1-smooth(.17,.42,since);
        bolt.children[0].smokeOpacity=(calm?.65:1)*fading;
        bolt.children[1].smokeOpacity=fading;
      }
      ring.visible=!!w && since>=0 && since<1.5;
      if(ring.visible){
        ring.scale.x=ring.scale.z=.22+3.5*since;ring.smokeOpacity=1-smooth(.52,1.5,since);
      }
      school.visible=!!w && since>=0 && t<1.35;
      if(school.visible){
        const b=w.body,s=b.scale.x,gape=w.jaw.rotation.z*.52;
        BL.math.quat.rotateVec(mouth,b.quaternion,(2.18+4.8*Math.cos(gape))*s,(-.10+4.8*Math.sin(gape))*s,0);
        const mx=b.position.x-w.offsetX+mouth[0],my=b.position.y+mouth[1],mz=b.position.z-w.offsetZ+mouth[2];
        // Every swimmer shares both frequencies. Rotate its baked phase by the school clock.
        const heading=since*.62,sh=Math.sin(heading),ch=Math.cos(heading),sw=Math.sin(since*8),cw=Math.cos(since*8);
        for(const f of fish){
          const n=f.node,age=since-f.delay;
          n.visible=age>=0;
          if(!n.visible)continue;
          // Fish break the water at the contact point and spread into a shoal in the upper metre.
          const fan=smooth(0,1.6,age),sinAngle=f.sinHeading*ch+f.cosHeading*sh,cosAngle=f.cosHeading*ch-f.sinHeading*sh;
          const x=feedX+f.x*(.09+.91*fan)+fan*1.1*cosAngle;
          const z=feedZ+f.z*(.09+.91*fan)+fan*.63*sinAngle;
          const y=top-f.depth*smooth(0,.8,age)-.045*fan*(1+2*sinAngle*cosAngle);
          n.scale.x=n.scale.y=n.scale.z=f.size*(.3+.7*smooth(0,.18,age));
          const into=t>-2?smooth(y-1.05,y+.08,my):0;
          n.visible=into<1;
          n.position.x=x+(mx-x)*into;n.position.z=z+(mz-z)*into;n.position.y=y+(my-y)*into;
          n.rotation.y=-f.heading-heading-Math.PI*.5+.12*(f.sinWag*cw+f.cosWag*sw);
          n.rotation.z=.08*cosAngle;
        }
      }
      const hit=t-5.0, intensity=calm?.72:1, direction=lipZ>-50?1:-1;
      crown.visible=!!w && hit>=0 && hit<2.65;
      spray.visible=crown.visible && !calm;
      if(crown.visible){
        const u=hit/2.65,r=2.8+6.1*u;
        crown.position.x=50.8;crown.position.y=top+.09;crown.position.z=-50;
        crown.scale.x=r*1.32;crown.scale.z=r*.80;crown.scale.y=.02+9.0*Math.sin(Math.PI*u)**.78*intensity;
        crown.smokeOpacity=1-smooth(.56,1,u);
        spray.position.x=50.8;spray.position.y=top+.14;spray.position.z=-50;
        if(spray.visible)for(const d of drops){
          const a=hit-d.delay,n=d.n,y=d.vy*a-4.9*a*a;n.visible=a>0&&y>0;
          if(n.visible){n.position.x=d.vx*(a+.4);n.position.y=y;n.position.z=d.vz*(a+.4);
            n.scale.x=n.scale.z=d.size;n.scale.y=d.size*(1+.13*Math.abs(d.vy-9.8*a));}
        }
      }
      // Shoal at the weir: the front slows and steepens, then feeds the falling sheet.
      crest.visible=!!w && hit>=.18 && hit<5.4;
      if(crest.visible){
        const u=Math.min(1,(hit-.18)/3.45), swell=smooth(.18,1.15,hit)*(1-smooth(3.65,5.4,hit));
        crest.position.x=50.8+(weirX-50.8)*u;crest.position.y=top+.10;crest.position.z=-50+(lipZ+50)*u;
        crest.scale.x=3+(width*.73-3)*u;crest.scale.z=direction*(.55+.64*u);
        crest.scale.y=.02+(2.0+3.4*u*u)*swell*intensity;crest.smokeOpacity=1-smooth(4.4,5.4,hit);
      }
      spill.visible=!!w && hit>=3.34 && hit<13.5;
      lip.visible=spill.visible;
      if(spill.visible){
        const strength=smooth(3.34,4.12,hit)*(1-smooth(6.0,13.5,hit));
        spill.position.x=weirX;spill.position.z=lipZ+.10*direction;
        spill.position.y=top+.08+strength*3.7*intensity;
        spill.scale.x=width*(.50+.36*strength);spill.scale.z=direction*(.95+strength*2.05*intensity);
        lip.position.x=spill.position.x;lip.position.y=top+.08;lip.position.z=spill.position.z;
        lip.scale.x=spill.scale.x;lip.scale.z=spill.scale.z;lip.scale.y=Math.max(.001,strength*3.7*intensity);
        lip.smokeOpacity=strength;
        const fall=hit-3.34;
        spill.scale.y=.03+Math.min(55,2.8*fall+4.9*fall*fall);
        spill.smokeOpacity=strength;
      }
    };
    return {update,cloud,arcs,bolt,ring,school,crown,crest,spill};
  };
  BL.pokerWhaleBreach=Object.freeze({build,smooth});
})();
