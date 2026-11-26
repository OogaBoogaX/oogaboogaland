// Ember Den sky, in shadow radii. The far side of the disk folds above and below its shadow.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const bounds = [-3.5,-1.65,6.8,3.3], donor = [-3.08,0.78], donorRadius = 1/100;
  const slope = -.087, cs = Math.cos(slope), sn = Math.sin(slope);
  // Continental shields, in longitude and latitude, shared by both renderers.
  // The narrow southern ends, broken isthmus, islands and ice caps survive a close look.
  const landforms=[
    [.15,.10,.48,.52], [.30,-.31,.27,.34], [-.09,.25,.31,.22], [.30,.79,.52,.20],
    [.82,.91,.76,.32],[1.35,.67,.80,.26],[1.18,.38,.23,.29],[2.30,-.45,.38,.27],
    [.85,-.35,.047,.119],[-1.51,.77,.64,.34],[-1.74,.52,.32,.26],[-1.37,.33,.20,.15],
    [-1.09,-.10,.35,.37],[-1.15,-.45,.18,.36],[-.76,1.20,.20,.21],[-.05,.99,.065,.091]
  ];
  const continents=landforms.map(([x,y,w,h])=>
    `delta=(uv-vec2(${x.toFixed(3)},${y.toFixed(3)}))/vec2(${w.toFixed(3)},${h.toFixed(3)}); coast2=min(coast2,dot(delta,delta));`).join("\n");
  const fragment = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oBright;

float hash(vec2 p) {
  vec3 v = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  v += dot(v,v.yzx+33.33);
  return fract((v.x+v.y)*v.z);
}
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
// Differential rotation advects bright knots along each orbit, faster at the inner rim.
// Use periodic azimuth coordinates to keep the orbit continuous across its longitude seam.
float lanes(float r,float a,float time) {
  float phase=a-time*.095/pow(max(1.,r),1.5);
  vec2 arc=vec2(cos(phase),sin(phase));
  float eddy=noise(arc*3.6+vec2(r*4.,r*6.));
  float warp=r+.021*sin(phase*3.+r*8.)+.031*eddy+.008*sin(phase*7.-r*13.);
  float grain=noise(vec2(36.*warp+eddy*1.5,4.*arc.y+2.*arc.x));
  float cloud=noise(vec2(13.*warp+eddy,4.*arc.x+3.*arc.y))+.48*grain;
  float micro=sin(238.*warp+2.7*eddy+1.2*sin(phase*5.));
  return (.42+.55*cloud+.14*sin(81.*warp+4.*eddy+grain)+.081*micro/(1.+fwidth(warp)*140.))*(.76+.30*eddy);
}
vec3 thermal(float heat) {
  vec3 c=mix(vec3(.29,.025,.009),vec3(.97,.26,.028),smoothstep(.12,.63,heat));
  c=mix(c,vec3(1.,.59,.10),smoothstep(.54,.91,heat));
  return mix(c,vec3(1.,.91,.66),smoothstep(.88,1.35,heat));
}
void over(inout vec4 base,vec3 color,float a) {
  a=clamp(a,0.,1.);base=vec4(color*a+base.rgb*(1.-a),a+base.a*(1.-a));
}
void main() {
  vec2 local=vec2(${bounds[0]},${bounds[1]})+vec2(vUv.x,1.-vUv.y)*vec2(${bounds[2]},${bounds[3]});
  vec2 p=mat2(${cs},${-sn},${sn},${cs})*local;
  vec2 source=vec2(${donor[0]},${donor[1]});
  float t=uTime,x=p.x,y=p.y,r=length(p),aa=max(.00015,fwidth(r)),a=atan(y,x);
  vec4 col=vec4(0.);
  // Black shadow and its narrow, resolved photon ring.
  over(col,vec3(.002,.001,.003),1.-smoothstep(1.-aa,1.+aa,r));
  float rim=exp(-abs(r-1.)/max(.006,aa));
  over(col,vec3(1.,.51,.105),rim*.82);
  // Multiple images of the far disk. The lower arc is compressed by lensing.
  float upper=smoothstep(-.04,.04,y);
  float warpedY=y*(1.+mix(.10,.24,upper)*x*x);
  float height=mix(.15,.48,upper), spread=mix(.24,1.8,upper);
  vec2 lens=vec2(x,warpedY), shape=vec2(spread,height);
  // Invert the nested apparent ellipses. Outer images flare away from the
  // photon ring and flatten into the wings of the direct disk.
  float band=clamp((length(lens)-1.)/(.18+spread),0.,2.);
  for(int i=0;i<3;i++){
    vec2 axes=1.+shape*band, uv=lens/axes;
    float delta=(dot(uv,uv)-1.)/max(.025,2.*dot(uv*uv,shape/axes));
    band=clamp(band+delta,-.10,2.);
  }
  if(band>-.075 && band<1.48){
    float rr=1.+2.*band,angle=atan(warpedY/(1.+height*band),x/(1.+spread*band));
    float approaching=.93-.30*cos(angle);
    float envelope=smoothstep(-.045,.085,band)*exp(-max(0.,band)*2.4);
    float gas=lanes(max(1.,rr),angle,t);
    float heat=(.54+.74*envelope)*gas*approaching;
    over(col,thermal(heat),smoothstep(-.055,.06,band)*(1.-smoothstep(.40,1.42,band))*(.73+.21*gas));
  }
  // The donor loses a thin green atmosphere along a bent stream. A moving pattern
  // follows the tangent into the approaching flow, warming to gold at impact.
  float u=(x-source.x)/2.03;
  if(u>=0. && u<=1.) {
    float arc=sin(3.14159265*u);
    float center=mix(source.y,-.19,u)+.22*sin(3.14159265*u)-.16*sin(6.2831853*u);
    float w=.0035+.060*arc+.014*u;
    float along=23.*u-t*.28, offset=(y-center)/w;
    if(abs(offset)<4.) {
      float braid=.48*sin(u*12.-t*.052)+.23*sin(u*19.+t*.037);
      float strand=exp(-abs(offset-braid)*7.)+.57*exp(-abs(offset+.58*sin(11.*u+t*.065))*8.);
      float gas=exp(-offset*offset*.83)*(.40+.35*noise(vec2(along,offset*1.4)));
      float knots=.66+.34*sin(along+.9*sin(along*.57));
      vec3 hue=mix(vec3(.11,.90,.47),vec3(.98,.50,.10),smoothstep(.58,.98,u));
      over(col,mix(hue,vec3(.75,1.,.82),.28*min(1.,strand)),(gas+.55*strand)*knots*(1.-smoothstep(.91,1.,u)));
    }
  }
  // The near side of a shallow inclined annulus crosses in front of the shadow.
  float opening=.135, frontR=length(vec2(x,y/opening));
  if(frontR<3.19 && (y<0. || r>1.01)) {
    float fa=atan(y/opening,x), beam=.96-.27*cos(fa);
    float fade=smoothstep(.96,1.10,frontR)*(1.-smoothstep(2.0,3.18,frontR));
    float gas=lanes(frontR,fa,t);
    float hot=(1.32-.30*(frontR-1.))*gas*beam;
    over(col,mix(thermal(hot),vec3(.97,.51,.085),.42*smoothstep(2.15,3.1,frontR)),min(1.,fade*(.72+.48*gas)));
  }
  // An analytic rotating globe stays spherical and detailed in the eyepiece, even at 1:100.
  vec2 d=(p-source)/${donorRadius.toFixed(3)};
  float dr=length(d), edge=max(.001,fwidth(dr));
  if(dr<1.+edge) {
    vec3 n=vec3(d,sqrt(max(0.,1.-dot(d,d))));
    float lon=atan(n.x,n.z)+t*.019,lat=asin(clamp(n.y,-1.,1.));
    lon=atan(sin(lon),cos(lon));
    vec2 sphere=vec2(sin(lon)*cos(lat)+.37*sin(lat),cos(lon)*cos(lat)-.85*sin(lat));
    vec2 uv=vec2(lon,lat);
    vec2 delta;float coast2=81.;
    ${continents}
    float coast=sqrt(coast2);
    float relief=noise(sphere*17.)+.38*noise(sphere*45.);
    coast+=(relief-.66)*.28;
    float land=1.-smoothstep(.96,1.04,coast);
    vec3 terrain=mix(vec3(.035,.34,.15),vec3(.32,.55,.19),clamp(relief,0.,1.));
    terrain=mix(terrain,vec3(.67,.56,.30),.64*exp(-70.*(lat-.40)*(lat-.40)));
    vec3 earth=mix(mix(vec3(.025,.17,.39),vec3(.035,.49,.65),exp(-5.*max(0.,coast-1.))),terrain,land);
    earth=mix(earth,vec3(.85,.95,1.),smoothstep(1.18,1.38,abs(lat)+relief*.08));
    float clouds=noise(sphere*vec2(9.,17.)+vec2(2.1*sin(lat*5.+sin(lon)),sin(3.*lon)));
    earth=mix(earth,vec3(.94,.97,1.),smoothstep(.59,.77,clouds));
    earth=earth*(.22+.83*max(0.,dot(n,vec3(.73,.40,.55))))+vec3(.10,.48,.69)*pow(1.-n.z,3.);
    over(col,earth,1.-smoothstep(1.-edge,1.+edge,dr));
  }
  if(col.a<.007) discard;
  vec3 rgb=col.rgb/max(.001,col.a);
  oColor=vec4(rgb,col.a);oBright=vec4(rgb*.23,col.a);
}`;
  // Canvas projects the same astronomical plate. Curves are painted only when that
  // renderer actually draws it; several visits never pay for a fallback bitmap.
  const streamOrbit = () => {
    const samples=new Float64Array(71*3);
    for(let j=0;j<=70;j++){
      const u=j/70,arc=Math.sin(Math.PI*u);
      samples[j*3]=donor[0]+2.03*u;
      samples[j*3+1]=donor[1]*(1-u)-.19*u+.22*arc-.16*Math.sin(2*Math.PI*u);
      samples[j*3+2]=.039*arc;
    }
    return samples;
  };
  const paint = (canvas, time, lanes, stream) => {
    const g=canvas.getContext("2d"), unit=canvas.width/bounds[2];
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);
    g.setTransform(unit,0,0,-unit,-bounds[0]*unit,(bounds[1]+bounds[3])*unit);g.rotate(slope);
    g.fillStyle="#010102";g.beginPath();g.arc(0,0,1,0,Math.PI*2);g.fill();
    const orbit=(path,r,kind)=>{
      const disk=kind===0,upper=kind===1;
      for(let i=0;i<=64;i++){
        const a=(disk ? -Math.PI : upper ? 0 : Math.PI)+i*Math.PI/64;
        const x=Math.cos(a)*(upper?1+(r-1)*3.75:kind===2?1+(r-1)*1.6:r);
        const y=Math.sin(a)*r*(disk ? .135 : 1)/(disk?1:1+(upper ? .24 : .10)*x*x);
        if(!i)path.moveTo(x,y);else path.lineTo(x,y);
      }
    };
    const bands=(count,spread,kind)=>{
      const strokeScale=kind===1?3.7:kind===2?1.6:.49;
      for(let k=count;k>=0;k--){
        const u=k/count,r=1+spread*u,hot=.5+.5*Math.sin(k*2.21+.65*Math.sin(time*.09+k*.12));
        const green=Math.round(122+103*hot),blue=Math.round(23+121*hot),redEdge=Math.round(58+89*hot);
        const tint=(green<<16)|(blue<<8)|redEdge;
        let lane=lanes[kind][k];
        if(!lane){
          const path=typeof Path2D==="function"?new Path2D():null;
          if(path)orbit(path,r,kind);
          lane=lanes[kind][k]={path,tint:-1,gradient:null};
        }
        // The endpoints and alphas are fixed. Reuse the native gradient until a quantized colour actually changes.
        if(tint!==lane.tint){
          const grad=g.createLinearGradient(-r,0,r,0);
          grad.addColorStop(0,`rgba(255,${green},${blue},${1-.84*u})`);
          grad.addColorStop(1,`rgba(244,${redEdge},18,${.92-.84*u})`);
          lane.gradient=grad;lane.tint=tint;
        }
        g.strokeStyle=lane.gradient;g.lineWidth=spread/count*strokeScale+.002;
        if(lane.path)g.stroke(lane.path);
        else{g.beginPath();orbit(g,r,kind);g.stroke();}
      }
    };
    bands(54,.48,1);bands(24,.17,2);
    for(let i=0;i<9;i++){
      g.beginPath();
      for(let j=0;j<=70;j++){
        const at=j*3,x=stream[at],y=stream[at+1]+stream[at+2]*Math.sin(14*(j/70)+i*.8-time*.08);
        if(!j)g.moveTo(x,y);else g.lineTo(x,y);
      }
      g.strokeStyle=`rgba(83,233,151,${.36+.17*Math.sin(time*.25+i)})`;g.lineWidth=.006;g.stroke();
    }
    bands(96,2.12,0);
    g.fillStyle="#53a9a6";g.beginPath();g.arc(...donor,donorRadius,0,2*Math.PI);g.fill();
  };
  // A second small plate on Canvas retains the planet's detail through a 64× eyepiece.
  const fallbackPlanet = radius => {
    const geo=M.geometry(),r=radius*donorRadius;
    M.face(geo,[[-r,-r],[r,-r],[r,r],[-r,r]].map(p=>M.pushVert(geo,...p,0)),"#ffffff",{emissive:1});
    geo.castShadow=false;
    const cloud=[224,237,245], land=[57,140,66], sea=[14,66,131], air=[20,84,122];
    const rowForms=[],rowDistance=new Float64Array(landforms.length);
    let canvas,image,last=-Infinity;
    geo.imageSurface={rect:[-r,-r,2*r,2*r],blend:"alpha",cutout:true,time:0,fallback(){
      if(!canvas){canvas=document.createElement("canvas");canvas.width=canvas.height=96;image=canvas.getContext("2d").createImageData(96,96);}
      if(Math.abs(this.time-last)<1.)return canvas;
      last=this.time;
      const turn=2*Math.PI,spin=(last*.019)%turn;
      for(let y=0;y<96;y++){
        const ny=(47.5-y)/48,lat=Math.asin(ny),latitudeWarp=8*Math.sin(lat*15),latitudeShade=Math.cos(21*lat);
        let count=0;
        for(const form of landforms){
          const dy2=((lat-form[1])/form[3])**2;
          // The highest possible perturbed shoreline is 1.2. A shield beyond this latitude cannot cover a pixel.
          if(dy2<1.2){rowDistance[count]=dy2;rowForms[count++]=form;}
        }
        for(let x=0;x<96;x++){
          const nx=(x-47.5)/48,d=nx*nx+ny*ny;
          if(d>=1)continue;
          const nz=Math.sqrt(1-d),a=Math.atan2(nx,nz)+spin,lon=a>Math.PI?a-turn:a< -Math.PI?a+turn:a;
          const clouds=Math.sin(21*lat+2.6*Math.sin(5*lon+3*lat))+.65*Math.cos(13*lon-8*lat);
          let color=cloud,terrain=0;
          if(clouds<=1.04 && Math.abs(lat)<=1.24){
            color=sea;
            terrain=Math.sin(29*lon+latitudeWarp)*latitudeShade;
            for(let k=0;k<count;k++){
              const form=rowForms[k];
              if(((lon-form[0])/form[2])**2+rowDistance[k]+.20*terrain<1){color=land;break;}
            }
          }
          const light=.26+.74*Math.max(0,nx*.73+ny*.40+nz*.55);
          const i=(96*y+x)*4;
          for(let c=0;c<3;c++)image.data[i+c]=(color[c]+(color===land?terrain*12:0))*light+(1-nz)**3*air[c];
          image.data[i+3]=255;
        }
      }
      canvas.getContext("2d").putImageData(image,0,0);
      return canvas;
    }};
    return geo;
  };
  const create = (parent,moonRadius,canvas) => {
    const radius=1.6*moonRadius,geo=M.geometry(),rect=bounds.map(n=>n*radius);
    const [x,y,w,h]=rect;
    M.face(geo,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>M.pushVert(geo,...p,0)),"#ffffff",{emissive:1});
    geo.castShadow=false;geo.fogPierce=1;
    let bitmap,lanes,stream,last=-Infinity;
    const surface={rect,blend:"alpha",cutout:true,accretion:fragment,time:0,
      fallback(){
        if(!bitmap){bitmap=document.createElement("canvas");bitmap.width=816;bitmap.height=396;lanes=[[],[],[]];stream=streamOrbit();}
        if(Math.abs(this.time-last)>=.25){paint(bitmap,this.time,lanes,stream);last=this.time;}
        return bitmap;
      }};
    geo.imageSurface=surface;
    const node=S.createNode({geometry:geo,position:{x:0,y:102,z:216}});
    const tilt=Math.atan2(node.position.y,node.position.z);
    node.rotation.y=Math.PI;node.rotation.x=tilt;S.addChild(parent,node);
    const dx=radius*(cs*donor[0]-sn*donor[1]),dy=radius*(sn*donor[0]+cs*donor[1]);
    const planet={x:node.position.x-dx,y:node.position.y+dy*Math.cos(tilt),z:node.position.z-dy*Math.sin(tilt)};
    const detail=canvas ? fallbackPlanet(radius) : null;
    if(detail)S.addChild(node,S.createNode({geometry:detail,position:{x:dx,y:dy,z:.05}}));
    return {center:node.position,planet,radius,planetRadius:radius*donorRadius,update(dt){
      surface.time+=dt;
      if(detail)detail.imageSurface.time=surface.time;
    }};
  };
  BL.pokerBlackHole=Object.freeze({create});
})();
