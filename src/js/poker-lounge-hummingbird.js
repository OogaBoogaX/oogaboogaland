// A single jewel-toned hummingbird ranging between the lounge windows and the hearth.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene,tau=2*Math.PI;
  const rgb=BL.math.hexToRgb;
  // A feather has a narrow leading edge and a raised shaft separating its two vanes.
  const feather=(g,x,y,z,dx,dy,dz,width,light,dark)=>{
    const span=Math.hypot(dx,dz),nx=-dz/span*width,nz=dx/span*width;
    const root=M.pushVert(g,x,y,z),tip=M.pushVert(g,x+dx,y+dy,z+dz);
    const mx=x+.47*dx,my=y+.47*dy,mz=z+.47*dz;
    const ridge=M.pushVert(g,mx,my+width*.20,mz);
    const a=M.pushVert(g,mx+nx,my,mz+nz),b=M.pushVert(g,mx-nx,my,mz-nz);
    for(const [indices,ink] of [[[root,a,ridge],light],[[a,tip,ridge],light],
      [[ridge,tip,b],dark],[[ridge,b,root],dark]]){
      M.face(g,indices,rgb(ink),{emissive:.16});
      M.face(g,indices.slice().reverse(),rgb(ink),{emissive:.16});
    }
  };
  const plumage=M.cached(()=>{
    // Cross sections along the bill axis: tapered rump, full chest, round crown.
    const skin=M.geometry(),parts=[skin],tail=M.geometry();
    const sections=[[-.105,-.025,.002,.003],[-.082,-.016,.022,.022],
      [-.050,-.006,.034,.033],[-.017,.006,.040,.042],[.012,.018,.041,.048],
      [.031,.040,.033,.041],[.049,.054,.032,.033],[.066,.055,.027,.026],[.080,.054,.011,.013]];
    const sides=16;
    for(const [z,y,rx,ry] of sections)for(let j=0;j<sides;j++){
      const a=j*tau/sides;M.pushVert(skin,rx*Math.cos(a),y+ry*Math.sin(a),z);
    }
    const throat=["#ff4986","#ef1679","#cc158b","#ff6685"],back=["#19d490","#05ba9b","#31e89b","#00a89c"];
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<sides;j++){
      const k=(j+1)%sides,a=i*sides+j,b=i*sides+k,up=Math.sin((j+.5)*tau/sides);
      let ink=back[(i+j)%4];
      if(i>=4&&up<-.10)ink=throat[(i+Math.min(j,sides-j))%4];
      else if(i>=5&&up>.2)ink=up>.8?"#25f1cd":"#0088ab";
      else if(up<-.66)ink=i>=3?"#ffe6a7":"#b3ebaf";
      else if(up<.05)ink=i<2?"#145988":"#259e72";
      M.face(skin,[a,b,b+sides,a+sides],rgb(ink),{emissive:.26});
    }
    const bill=M.lathe({profile:[[.008,0],[.004,.052],[.0004,.101]],segments:8,color:"#252535",emissive:.10});
    parts.push(M.moved(M.turnedX(bill,Math.PI/2+.035),0,.054,.076));
    for(const side of [-1,1]){
      const eye=(x,y,z,rx,ry,rz,color)=>{
        const g=M.geometry(),c=rgb(color);g.smooth=true;
        BL.hubModels.puff(g,x*side,y,z,rx,ry,rz,[c,c,c,c],()=>.55,5,10);
        parts.push(g);
      };
      eye(.030,.060,.047,.0028,.004,.006,"#f1ffdc");
      eye(.030,.061,.058,.004,.006,.006,"#11162b");
      eye(.033,.064,.060,.0018,.0018,.002,"#ffffff");
    }
    for(let j=-2;j<=2;j++)feather(tail,j*.005,-.023,-.084,j*.015,-.022,-.080-.006*Math.abs(j),
      .012,Math.abs(j)===2?"#2863be":"#2567a5","#392e68");
    const wing=M.geometry();
    for(let j=0;j<7;j++)feather(wing,.009,.002,-.003*j,.127-.009*j,.009-.001*j,-.042-.004*j,
      .012,j<2?"#80f8e2":"#54b8d9",j<3?"#168caa":"#454e95");
    feather(wing,0,.005,.004,.082,.009,-.024,.022,"#20cdb2","#2482ab");
    // A faint swept silhouette remains visible between sampled wing positions.
    const sweep=M.geometry(),pivot=M.pushVert(sweep,0,0,0);
    let previous;
    for(let j=0;j<=12;j++){
      const a=-1.08+j*.15;
      const tip=M.pushVert(sweep,.126*Math.cos(a),.010+.012*Math.cos(2*a),.126*Math.sin(a));
      if(j){M.face(sweep,[pivot,previous,tip],rgb("#8fdad8"));M.face(sweep,[pivot,tip,previous],rgb("#8fdad8"));}
      previous=tip;
    }
    sweep.glassOpacity=.075;sweep.glassGrazing=.1;sweep.castShadow=false;
    return {body:M.shaded(parts),tail,wing,sweep};
  });
  const create=(room,r)=>{
    const g=plumage(),bird=S.createNode({geometry:g.body}),fan=S.createNode({geometry:g.tail});
    S.addChild(room,bird);S.addChild(bird,fan);
    const wings=[],blurs=[];
    for(const side of [-1,1]){
      const shoulder=S.createNode({position:{x:side*.026,y:.024,z:.005},scale:{x:side,y:1,z:1}});
      const wing=S.createNode({geometry:g.wing}),blur=S.createNode({geometry:g.sweep});
      S.addChild(bird,shoulder);S.addChild(shoulder,blur,wing);wings.push(wing);blurs.push(blur);
    }
    const seat=BL.pokerLoungeStone.seatZ(r),x=r.w*.38,z=r.d*.39;
    // Near visits alternate with long traverses. Only the centreline climbs into the vault.
    const stops=[[.75,1.65,2.15],[-.52,1.85,1.45],[-2.2,1.52,seat-1.35],
      ...BL.pokerLoungeFamily.flightStops(seat),[-3,2.12,seat-1.95],[-x,7,-z],[-x,r.h*.53,-2],[0,r.h*.79,1],
      [x,r.h*.49,5],[x,5,z],[1.5,2.5,z],[-x,6,z],[-4,2.9,1.8],
      [1.9,1.8,seat-2.1],[2.65,1.64,seat-2.45],[x,8,-z],[1,r.h*.69,-z],[3,3.1,.1]];
    // The larkspur is the bird's favourite stop: stops 3 to 7 are its blooms, the air between them and the perch on
    // its stem. When the noon light rises each day (poker-birth-sky.js) a bird elsewhere flies
    // straight to the first bloom (`detour`) and works the plant from there, once a day.
    const BLOOM=3,LAST=7;
    let index=0,age=0,flight=false,duration=3.8,time=0,beat=0,detour=-1,visited=false;
    const rand=BL.math.mulberry32(8271);
    const p=bird.position;[p.x,p.y,p.z]=stops[0];bird.rotation.y=Math.PI*.67;
    for(const wing of wings)wing.rotation.y=.35;
    const update=(dt,calm)=>{
      update.wingHz=0;
      if(calm||document.hidden||!room.visible)return;
      time+=dt;age+=dt;
      const light=BL.pokerBirthSky.light(Date.now());
      if(light===0)visited=false;
      else if(!visited && !flight){
        visited=true;
        if(index<BLOOM-1 || index>LAST)detour=BLOOM;
      }
      const a=stops[index],b=stops[detour>=0?detour:(index+1)%stops.length],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
      const t=Math.min(1,age/duration),u=flight?t*t*(3-2*t):0,arc=4*u*(1-u);
      const feed=!flight && (index===3 || index===5),perched=!flight && index===7;
      const wander=perched?0:feed?.14:flight?arc:1;
      p.x=a[0]+dx*u+wander*.033*Math.sin(3.2*time);
      p.y=a[1]+dy*u+.32*arc+wander*.024*Math.sin(4.1*time);
      p.z=a[2]+dz*u+wander*.028*Math.sin(2.3*time);
      if(feed)p.x-=.018*Math.sin(Math.PI*t)**2;
      const yaw=feed?Math.atan2(-.176,-.040):Math.atan2(dx,dz)+(flight||perched?0:.63*Math.sin(time*1.65));
      bird.rotation.y+=Math.atan2(Math.sin(yaw-bird.rotation.y),Math.cos(yaw-bird.rotation.y))*(1-Math.exp(-6*dt));
      bird.rotation.x=(feed?0:perched?-.38:-.20)+arc*(.44-.55*dy/Math.hypot(dx,dy,dz));
      fan.rotation.y=.13*Math.sin(time*3.1);fan.rotation.x=.11*arc;
      update.wingHz=perched?0:47+2.7*Math.sin(time*2.3);
      beat=(beat+dt*tau*update.wingHz)%tau;
      const stroke=Math.sin(beat),twist=Math.cos(beat);
      for(const blur of blurs)blur.visible=!perched;
      for(const wing of wings){
        if(perched){wing.rotation.y=1.48;wing.rotation.x=.14;wing.rotation.z=-.28;continue;}
        wing.rotation.y=.12+1.04*stroke;
        wing.rotation.x=.50*twist;
        wing.rotation.z=.16+.18*Math.sin(2*beat);
      }
      if(t===1){
        age=0;
        if(flight){index=detour>=0?detour:(index+1)%stops.length;detour=-1;duration=1.2+rand()*2.8;}
        else duration=Math.max(.48,Math.hypot(dx,dy,dz)/(4.6+rand()*1.8));
        flight=!flight;
      }
    };
    update.position=p;update.wingHz=0;return update;
  };
  BL.pokerLoungeHummingbird={create};
})();
