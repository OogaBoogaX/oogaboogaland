// The cathedral end of the bookcase passage. All cuts follow the same two-centred arch.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene;
  const half=2.24,spring=3.32,offset=1.04,radius=half+offset;
  const crown=x=>spring+Math.sqrt(Math.max(0,radius*radius-(Math.abs(x)+offset)**2));
  const course=14;
  const point=(side,i,extra=0)=>{
    const t=i/course*Math.acos(offset/radius),r=radius+extra;
    return [side*(r*Math.cos(t)-offset*(r/radius)),spring+r*Math.sin(t)];
  };
  const block=(x,y,z,w,h,d,color)=>M.bevelBox({w,h,d,color,bevel:Math.min(.024,d/5),offset:{x,y,z}});
  const rail=(a,b,z,w,color)=>M.beam(a[0],a[1],z,b[0],b[1],z,w,color);
  const stone="#e9e0d0",ivory="#faf2df",bronze="#8e6437";
  const orangePlates=["#f7931a","#ed8618","#ff9d2b","#f48c19"];
  const seam="#924710",moulding="#bc610e",copper="#df781a",polished="#ffc26b";
  // Quad winding follows the section, so both mirrored leaves have their finished face inside.
  const prism=(corners,z,depth,color)=>{
    const g=M.geometry(),rgb=BL.math.hexToRgb(color);
    let area=0;
    for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4];area+=p[0]*q[1]-q[0]*p[1];}
    if(area<0)corners.reverse();
    for(const dz of [0,depth])for(const [x,y] of corners)M.pushVert(g,x,y,z+dz);
    M.face(g,[3,2,1,0],rgb);M.face(g,[4,5,6,7],rgb);
    for(let i=0;i<4;i++){const j=(i+1)%4;M.face(g,[i,j,j+4,i+4],rgb);}
    return g;
  };
  const surround=()=>{
    const frame=[];
    for(const side of [-1,1]){
      for(let i=0;i<course;i++){
        const a=point(side,i),c=point(side,i+1),outer=point(side,i,.54),next=point(side,i+1,.54);
        frame.push(prism([a,c,next,outer],-.29,.40,i%3===0?ivory:stone));
        for(const [extra,z,w,color] of [[.035,-.34,.085,bronze],[.14,-.37,.12,ivory],[.48,-.34,.12,ivory]])
          frame.push(rail(point(side,i,extra),point(side,i+1,extra),z,w,color));
      }
      for(const d of [.14,.47]){
        const x=side*(half+d);
        frame.push(M.moved(M.lathe({profile:[[.20,0],[.20,.18],[.15,.22],[.16,.30],[.107,.38],[.107,spring-.24],[.16,spring-.16],[.19,spring-.10],[.19,spring]],segments:14,color:ivory}),x,0,-.31));
      }
      frame.push(block(side*(half+.27),spring/2,-.05,.54,spring,.42,stone),
        block(side*(half+.27),spring-.07,-.22,.68,.18,.54,ivory));
    }
    frame.push(prism([[-.12,crown(0)-.07],[.12,crown(0)-.07],[.24,crown(0)+.44],[-.24,crown(0)+.44]],-.42,.32,ivory));
    return M.merge(...frame);
  };
  const build=(room,r,throat)=>{
    const b=r.d/2, frame=[],leaves=[];
    const node=(parts,z)=>{
      const n=S.createNode({geometry:M.merge(...parts),position:{x:0,y:0,z}});
      S.addChild(room,n);return n;
    };
    frame.push(surround());
    for(const side of [-1,1]){
      const leaf=[];
      const edges=Array.from({length:13},(_,i)=>i*half/12);
      for(let i=1;i<course;i++)edges.push(point(1,i)[0]);
      edges.sort((a,b)=>a-b);
      for(let i=1;i<edges.length;i++){
        const x=side*edges[i-1],xx=side*edges[i],stave=Math.floor((edges[i]+edges[i-1])*6/half);
        leaf.push(prism([[x,.015],[xx,.015],[xx,crown(xx)],[x,crown(x)]],0,.14,
          orangePlates[stave%4]));
      }
      for(let i=1;i<12;i++){
        const x=side*i*half/12;leaf.push(rail([x,.07],[x,crown(x)-.045],-.008,.020,seam));
      }
      // Paired lancets carved into each leaf, with recessed panels below the lock rail.
      for(const cx of [.59,1.61]){
        const upper=3.41+(1.61-cx)*.55;
        for(const hand of [-1,1]){
          const edge=cx+hand*.408;
          leaf.push(rail([side*edge,.35],[side*edge,upper],-.036,.084,moulding));
          let prev=[side*edge,upper];
          for(let j=1;j<=8;j++){
            const t=j/8,next=[side*(cx+hand*.408*Math.cos(t*Math.PI/2)),upper+.78*Math.sin(t*1.11)];
            leaf.push(rail(prev,next,-.042,.075,moulding));prev=next;
          }
        }
        for(const y of [.35,1.72])leaf.push(rail([side*(cx-.42),y],[side*(cx+.42),y],-.04,.10,moulding));
      }
      const rosetteY=4.76,rosetteX=side*.66;
      const ring=(x,y,radius,tube,color)=>M.moved(M.turnedX(M.torus(radius,tube,color,0,20,6),Math.PI/2),x,y,-.085);
      leaf.push(ring(rosetteX,rosetteY,.342,.027,copper));
      for(let k=0;k<4;k++){
        const angle=k*Math.PI/2;
        leaf.push(ring(rosetteX+.132*Math.cos(angle),rosetteY+.132*Math.sin(angle),.132,.020,polished));
      }
      for(const y of [.63,2.42]){
        leaf.push(block(side*1.60,y,-.066,1.11,.089,.056,copper));
        for(let k=0;k<4;k++)leaf.push(block(side*(1.21+k*.246),y,-.104,.04,.04,.034,polished));
        for(const hand of [-1,1])leaf.push(rail([side*1.27,y],[side*.98,y+hand*.13],-.073,.038,copper));
      }
      leaf.push(block(side*.264,1.41,-.073,.145,.28,.075,copper),
        M.moved(M.turnedX(M.torus(.113,.024,polished,0,18,8),Math.PI/2),side*.264,1.32,-.134));
      const door=node(leaf,b+.085);
      door.geometry.tintedMetal=.62;
      leaves.push(door);
    }
    // The barrel of the passage retains the same pointed section at both thresholds.
    const reveal=M.geometry();
    const quad=(coords,color)=>{
      const ids=coords.map(p=>M.pushVert(reveal,...p)),rgb=BL.math.hexToRgb(color);
      M.face(reveal,ids,rgb);M.face(reveal,ids.slice().reverse(),rgb);
    };
    for(const s of [-1,1]){
      quad([[s*half,0,0],[s*half,spring,0],[s*half,spring,throat],[s*half,0,throat]],stone);
      for(let i=0;i<course;i++){
        const a=point(s,i),c=point(s,i+1);
        quad([[...a,0],[...c,0],[...c,throat],[...a,throat]],stone);
      }
    }
    quad([[-half,.012,0],[half,.012,0],[half,.012,throat],[-half,.012,throat]],"#584139");
    frame.push(reveal);
    const target=node(frame,b);
    let gap=0;
    return {target,leaves,get gap(){return gap;},slide(t){
      const next=(half+.10)*Math.min(1,Math.max(0,t));
      if(next===gap)return;
      gap=next;leaves[0].position.x=-gap;leaves[1].position.x=gap;
    },pickRay(ray){
      if(ray.dz<=0 || gap>0)return Infinity;
      const t=(r.z+b+.085-ray.oz)/ray.dz,x=ray.ox+t*ray.dx-r.x,y=ray.oy+t*ray.dy;
      return t>=0 && Math.abs(x)<=half && y>=0 && y<=crown(x)?t:Infinity;
    }};
  };
  BL.pokerLoungeDoor=Object.freeze({half,spring,crown,point,course,prism,surround,build});
})();
