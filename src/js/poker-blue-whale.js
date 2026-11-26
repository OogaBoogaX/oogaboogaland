// A blue whale faces local +x. The lower head splits along the lip and rotates at the jaw joint.
(() => {
  "use strict";
  const BL=window.BL, M=BL.models, S=BL.scene, Q=BL.math.quat, TAU=2*Math.PI;
  const hinge=2.18, lip=-.10;
  // Stations run from the tailstock to the flattened, U-shaped rostrum.
  const body=[[-4.55,.12,.45,.44],[-3.65,.19,.77,.67],[-2.4,.22,1.08,.95],[-.9,.17,1.42,1.27],
    [.65,.065,1.61,1.48],[1.52,0,1.63,1.54],[hinge,lip,1.57,1.53]];
  const head=[body[body.length-1],[3.33,-.07,1.34,1.57],[4.52,-.025,1.12,1.51],[5.54,.055,.86,1.41],
    [6.45,.12,.59,1.17],[7.03,.13,.32,.75],[7.27,.12,.13,.32],[7.33,.12,.065,.09]];
  const stock=[[-2.55,.15,.19,.25],[-1.82,.21,.25,.28],[-1.02,.20,.32,.33],[.11,0,.45,.44]];

  const point=(s,a,lift=0)=>[s[0],s[1]+(s[2]+lift)*Math.cos(a),(s[3]+lift)*Math.sin(a)];
  // Subdivide each station so the mottling changes over the skin independently of its silhouette.
  const skin=(stations,from,to,lite)=>{
    const g=M.geometry(), rings=[], n=Math.round((lite?20:32)*(to-from)/TAU), sub=lite?2:4;
    for(let j=0;j<=(stations.length-1)*sub;j++){
      const m=Math.min(stations.length-2,Math.floor(j/sub)), t=j/sub-m;
      const s=stations[m].map((v,k)=>v+t*(stations[m+1][k]-v)), row=[];
      for(let k=0;k<=n;k++)row.push(M.pushVert(g,...point(s,from+(to-from)*k/n)));
      const prev=rings[rings.length-1];rings.push(row);
      if(!prev)continue;
      for(let k=0;k<n;k++){
        const a=from+(to-from)*(k+.5)/n, h=Math.cos(a), x=s[0], z=Math.sin(a)*s[3];
        const dapples=Math.sin(x*2.8+2.4*Math.sin(3*a))*.52+Math.cos(8.7*a+x*1.75)*.32+Math.sin(5.4*x-z*3)*.16;
        const spot=Math.max(0,dapples-.13)*30, belly=Math.max(0,Math.min(1,(-h-.24)/.68)), slate=spot+5*h;
        const c=[49+slate+73*belly,80+slate+65*belly,104+slate+47*belly].map(Math.round);
        M.face(g,[prev[k],prev[k+1],row[k+1],row[k]],c,{emissive:.62});
      }
    }
    // Caps also close the throat when viewed through the open jaws.
    M.face(g,rings[0].slice().reverse(),[50,61,73]);M.face(g,rings[rings.length-1],[70,90,107]);
    return g;
  };
  const foil=(ribs,side,fin)=>{
    const g=M.geometry();let prev;
    for(const [x,y,z,chord,thick] of ribs){
      const row=[];
      for(let k=0;k<10;k++){
        const a=k*TAU/10;row.push(M.pushVert(g,x+chord*Math.cos(a),y+thick*Math.sin(a),z*side));
      }
      if(prev)for(let k=0;k<10;k++){
        const q=(k+1)%10, ids=[prev[k],prev[q],row[q],row[k]];
        const c=k<5?[55,82,103]:fin?[137,158,165]:[98,126,145];
        M.face(g,side>0?ids:ids.reverse(),c,{emissive:.60});
      }
      prev=row;
    }
    return g;
  };
  const oval=(x,y,z,rx,ry,rz,color)=>{
    const g=M.lathe({profile:[[0,-1],[.78,-.59],[1,0],[.78,.59],[0,1]],segments:10,color,emissive:.61});
    for(let k=0;k<g.verts.length;k+=3){g.verts[k]=x+rx*g.verts[k];g.verts[k+1]=y+ry*g.verts[k+1];g.verts[k+2]=z+rz*g.verts[k+2];}
    return g;
  };
  const geometry=lite=>{
    const nose=[skin(body,0,TAU,lite),skin(head,-Math.PI/2,Math.PI/2,lite)];
    const lower=[skin(head,Math.PI/2,3*Math.PI/2,lite)], palate=M.geometry(), tongue=M.geometry();
    const quad=(g,pts,c)=>M.face(g,pts.map(p=>M.pushVert(g,...p)),c,{emissive:.54});
    for(let j=0;j<head.length-1;j++){
      const a=head[j],b=head[j+1];
      for(const side of [-1,1]){
        const row=s=>[[s[0],s[1],s[3]*side],[s[0],s[1]+.025,0]];
        const p=row(a),q=row(b);
        const fill=[p[0],q[0],q[1],p[1]];
        quad(palate,side>0?fill.slice().reverse():fill,[54,47,65]);
        quad(tongue,side>0?fill:fill.slice().reverse(),[116,77,88]);
        // The baleen curtain sits inside the upper lip. Its leading edge shortens toward the snout.
        if(j<6){
          const cnt=lite?3:6;
          for(let k=0;k<cnt;k++){
            const u=k/cnt,v=(k+.78)/cnt,at=(f,drop)=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f-drop,side*(.84*(a[3]+(b[3]-a[3])*f)-drop*.20)];
            const d=.18+.25*Math.sin(Math.PI*(j+u)/6);
            const teeth=[at(u,0),at(v,0),at(v,d*.89),at(u,d)];
            quad(palate,teeth,[66,65,73]);quad(palate,teeth.slice().reverse(),[72,72,77]);
          }
        }
      }
      nose.push(M.beam(a[0],a[1]+a[2],0,b[0],b[1]+b[2],0,.060,"#7593a1",.6));
    }
    // Ventrally pleated throat, small swept dorsal fin, paired blowholes and a single medial ridge.
    nose.push(M.prism([[-3.33,.98],[-3.04,1.32],[-3.14,1.72],[-2.86,1.65],[-2.46,1.29],[-2.19,1.19]],.14,"#485f72",.57),palate);
    lower.push(tongue);
    for(const side of [-1,1]){
      for(let j=0;j<(lite?6:11);j++){
        const a=side*(1.83+j*(lite?.218:.111));
        for(let k=0;k<head.length-1;k++)lower.push(M.beam(...point(head[k],a,.018),...point(head[k+1],a,.018),.027,"#768d9a",.60));
      }
      nose.push(oval(2.12,.12,side*1.52,.16,.095,.051,"#273947"),
        oval(2.15,.14,side*1.566,.032,.027,.012,"#cbced1"),oval(2.61,1.40,side*.22,.24,.05,.080,"#344858"));
    }
    // Irregular pale islands on the flanks are laid across the skin rings, with the head more uniform.
    const marks=M.geometry(),random=BL.math.mulberry32(1823);
    const onFlank=(x,a)=>{
      let i=1;while(i<body.length-1 && x>body[i][0])i++;
      const lo=body[i-1],hi=body[i],u=(x-lo[0])/(hi[0]-lo[0]);
      return point(lo.map((v,k)=>v+u*(hi[k]-v)),a,.015);
    };
    for(let i=0;i<(lite?45:114);i++){
      const x=-4.1+random()*5.98,a=(i%2?1:-1)*(.36+random()*1.69),rx=.06+random()*.19,da=.03+random()*.065;
      const ids=[];
      for(let j=0;j<7;j++){
        const t=j*TAU/7,r=.73+.33*random();
        ids.push(M.pushVert(marks,...onFlank(x+rx*r*Math.cos(t),a+da*r*Math.sin(t))));
      }
      const k=Math.round(random()*13);
      M.face(marks,ids.reverse(),[72+k,101+k,118+k],{emissive:.63});
    }
    nose.push(marks);
    const fins=[],flukes=[];
    for(const side of [-1,1]){
      fins.push(foil([[0,0,0,.49,.17],[-.18,-.10,.63,.56,.18],[-.48,-.26,1.31,.49,.14],
        [-.96,-.50,2.00,.34,.10],[-1.51,-.66,2.50,.13,.046],[-1.74,-.70,2.65,.022,.014]],side,true));
      flukes.push(foil([[0,0,0,.27,.15],[-.20,.02,.32,.58,.17],[-.35,.08,1.0,.79,.15],
        [-.67,.13,1.85,.69,.11],[-1.03,.20,2.44,.43,.075],[-1.58,.28,3.02,.12,.032],[-1.78,.32,3.15,.02,.012]],side,false));
    }
    const pack=g=>{g.fogPierce=.48;g.castShadow=false;return BL.pokerMarble.staticMesh(g);};
    return {body:pack(M.shaded(nose.slice(0,2),nose.slice(2))),jaw:pack(M.moved(M.shaded([lower[0]],lower.slice(1)),-hinge,-lip,0)),
      stock:pack(skin(stock,0,TAU,lite)),tail:pack(M.merge(...flukes)),fins:fins.map(pack)};
  };
  const build=(parent,mesh,scale)=>{
    const add=(p,g,x,y,z)=>{const n=S.createNode({geometry:g,position:{x,y,z}});S.addChild(p,n);return n;};
    const body=add(parent,mesh.body,0,0,0),stock=add(body,mesh.stock,-4.46,.12,0);
    const tail=add(stock,mesh.tail,-2.48,.15,0),jaw=add(body,mesh.jaw,hinge,lip,0);
    const fins=mesh.fins.map((g,k)=>add(body,g,1.15,-.40,k?1.32:-1.32));
    body.scale.x=body.scale.y=body.scale.z=scale;
    body.quaternion=new Float64Array(4);
    return {body,stock,tail,jaw,fins,bank:new Float64Array(4),velocity:new Float64Array(3)};
  };
  const pose=(w,time,yaw,pitch,roll,gape,effort,calm)=>{
    Q.fromEuler(w.body.quaternion,0,yaw,pitch);
    Q.fromAxisAngle(w.bank,1,0,0,roll);Q.multiply(w.body.quaternion,w.body.quaternion,w.bank);
    const phase=time*.96+.38*Math.sin(time*.27);
    // Bouts of vertical strokes are followed by glides; the flukes lag behind the peduncle.
    const glide=.61+.39*Math.sin(time*.23+.45*Math.sin(time*.31));
    const beat=(calm?.065:.21)*effort*glide;
    w.stock.rotation.z=beat*Math.sin(phase);
    w.tail.rotation.z=1.48*beat*Math.sin(phase-.78);
    w.jaw.rotation.z=-.72*gape;
    w.fins[0].rotation.x=.06+.10*Math.sin(time*.28)+.23*roll;
    w.fins[1].rotation.x=-.08-.09*Math.sin(time*.28+.65)+.20*roll;
  };
  BL.pokerBlueWhale=Object.freeze({geometry,build,pose});
})();
