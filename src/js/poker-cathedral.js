// The eight chapter shrines grow along the side walls' pier grid.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models;
  const white="#faf7ee",shade="#d2cfc7",gold="#d7a34e",wax="#ffe4ae";
  const tau=2*Math.PI;
  const bayCount=4;
  const bayWidth=r=>(r.d-.66)/bayCount;
  // Index zero is nearest the entrance. Shrines, mullions and their light share this axis.
  const bayCenter=(r,index)=>(bayCount/2-.5-index)*bayWidth(r);
  const pier=(r,side,index)=>({x:side*(r.w/2-.37),z:(bayCount/2-index)*bayWidth(r)});
  const shrineScale=4;
  // Four equal bays between the finished end walls. Allow room behind the trunks for the pier bases.
  const shrineAt=(r,side,index)=>({x:side*(r.w/2-3.80),z:bayCenter(r,index),
    w:.31*shrineScale*BL.pokerShrineTrees.trunkGirth,d:.33*shrineScale*BL.pokerShrineTrees.trunkGirth});
  const box=(x,y,z,w,h,d,color,e=.20)=>M.bevelBox({w,h,d,color,emissive:e,bevel:Math.min(.025,h*.13,d*.13),offset:{x,y,z}});
  const turn=(x,y,z,profile,color,e=.25,sides=12)=>M.moved(M.lathe({profile,color,emissive:e,segments:sides}),x,y,z);
  const beam=(a,b,w,c,e=.25)=>M.beam(...a,...b,w,c,e);
  const column=(x,base,z,h,r)=>turn(x,base,z,[[r,0],[r,.06*h],[r*.70,.11*h],[r*.58,.16*h],
    [r*.58,.81*h],[r*.84,.86*h],[r,.90*h],[r*.80,.94*h],[r,.98*h],[r,h]],white,.32);
  // The record and picture book sit on a matched pair of oak and cane cabinets.
  const pedestal=M.cached(()=>{
    const oak="#a67c53",cane="#c7a775";
    const p=[box(0,.08,0,.83,.12,.75,"#76583e"),box(0,.374,0,.92,.49,.84,oak),
      box(0,.643,0,.98,.054,.91,oak)];
    for(const x of [-.22,.22]){
      p.push(box(x,.38,.426,.406,.402,.015,"#5b4634"));
      for(let j=-4;j<=4;j++)p.push(box(x+.041*j,.38,.438,.013,.377,.012,cane));
      for(let j=-4;j<=4;j++)p.push(box(x,.38+.041*j,.443,.386,.012,.012,"#b8996b"));
      p.push(box(x-Math.sign(x)*.154,.50,.459,.017,.073,.024,"#806344"));
    }
    return M.merge(...p);
  });
  // `read` keeps a canvas the code reads back more than once on the CPU (willReadFrequently).
  const sheet=(w,h,cw,ch,paint,e=.6,read=false)=>{
    const g=M.panel({w,h,tilesX:1,tilesY:1,color:"#ffffff",emissive:e});
    if(typeof CanvasRenderingContext2D==="undefined")return g;
    const canvas=document.createElement("canvas");canvas.width=cw;canvas.height=ch;
    paint(canvas.getContext("2d",{willReadFrequently:read}),cw,ch);g.castShadow=false;
    g.imageSurface={canvas,rect:[-w/2,-h/2,w,h],smooth:true,version:1};
    return g;
  };
  // Cut the inscription and border into one height field. The two lips of
  // each groove catch different amounts of light against the brushed metal.
  const engrave=(c,w,h,title,line,single=false)=>{
    c.textAlign="center";c.textBaseline="middle";c.fillStyle="white";c.strokeStyle="white";
    const inset=single?4:7;
    c.lineWidth=2;c.strokeRect(inset,inset,w-2*inset,h-2*inset);
    c.lineWidth=1;c.strokeRect(inset+4,inset+4,w-2*inset-8,h-2*inset-8);
    const face='Palatino, "Palatino Linotype", Georgia, serif';
    c.font="600 "+Math.round(single?h*.51:h*.20)+"px "+face;
    c.fillText(title,w/2,line?h*.32:h*.50,w*.91);
    if(line){
      c.font="italic "+Math.round(h*.16)+"px "+face;
      const lines=[""];
      for(const word of line.split(" ")){
        const i=lines.length-1,candidate=lines[i]?lines[i]+" "+word:word;
        if(lines[i] && c.measureText(candidate).width>w*.88)lines.push(word);else lines[i]=candidate;
      }
      lines.forEach((text,i)=>c.fillText(text,w/2,h*(.66+(i-(lines.length-1)/2)*.18),w*.90));
    }
    const mask=c.getImageData(0,0,w,h).data,pixels=c.createImageData(w,h),rgb=pixels.data;
    const random=BL.math.mulberry32(BL.math.fnv1a(title));
    for(let y=0;y<h;y++){
      const brush=(random()-.5)*3.6;
      for(let x=0;x<w;x++){
        const i=4*(y*w+x),cut=mask[i+3]/255;
        const relief=x>1 && x<w-2 && y>1 && y<h-2?
          (mask[i-4*w-4+3]-mask[i+4*w+4+3])/255:0;
        const grain=brush+(random()-.5)*5;
        const sheen=.5+.5*Math.cos((x/w*.64+y/h*.36-.26)*Math.PI*2);
        const edge=Math.min(1,Math.min(x,w-1-x,y,h-1-y)/9);
        const light=grain+24*sheen+10*edge+relief*47;
        rgb[i]=(single?84:155)+light-cut*(single?-68:92);
        rgb[i+1]=(single?56:113)+light*.87-cut*(single?-58:74);
        rgb[i+2]=(single?35:64)+light*.66-cut*(single?-42:44);
        rgb[i+3]=255;
      }
    }
    c.putImageData(pixels,0,0);
  };
  const plaque=(title,line)=>sheet(.94,.24,768,192,(c,w,h)=>engrave(c,w,h,title,line),.17);
  const relic=i=>{
    const p=[];
    if(i===0){
      p.push(box(0,0,0,.39,.34,.03,wax,.64));
      for(const s of [-1,1])p.push(M.turnedZ(turn(s*.17,0,0,[[.046,-.23],[.057,-.22],[.047,.21],[.05,.23],[0,.24]],wax,.66),.1));
      p.push(box(0,.005,.036,.37,.040,.022,"#9e3232"),turn(0,-.041,.046,[[.048,0],[.055,.047],[0,.054]],"#ba4430"));
    }else if(i===1){
      p.push(box(0,-.19,0,.38,.05,.23,"#996a39"),beam([-.14,-.18,-.08],[-.09,.07,-.11],.037,gold),
        beam([.14,-.18,-.08],[.09,.07,-.11],.037,gold));
      for(let j=0;j<9;j++){
        const a=(j-4)*.15,page=[box(0,.14,0,.21,.34,.013,j%2?"#eed7a7":"#dac49e",.30)];
        for(let k=0;k<6;k++)page.push(box(-.008,.244-k*.036,.008,.149-(k%3)*.016,.007,.002,"#816e54",.22));
        p.push(M.moved(M.turnedZ(M.merge(...page),a),0,-.13,.012*j));
      }
    }else if(i===2||i===6){
      p.push(box(0,0,0,.43,.42,.085,i===2?gold:"#b8c7cc",.65));
      if(i===6)for(let j=0;j<24;j++){const x=(j%4-1.5)*.093,y=(2.5-Math.floor(j/4))*.055;
        p.push(box(x,y,.047,.032+(j*7%11)*.002,.007,.005,"#544f4a"));}
    }else if(i===3){
      p.push(turn(0,-.19,0,[[0,0],[.18,0],[.15,.055],[0,.06]],gold),box(0,-.007,0,.112,.23,.112,wax,.95),
        turn(0,.10,0,[[.17,0],[.17,.032],[.062,.11],[0,.12]],gold));
      for(const s of [-1,1])for(const t of [-1,1])p.push(column(s*.10,-.14,t*.10,.25,.016));
    }else if(i===4){
      for(const s of [-1,1]){const pie=[turn(0,0,0,[[0,0],[.15,0],[.168,.027],[.15,.04],[0,.04]],"#eab25b",.65,20)];
        for(let k=0;k<7;k++)pie.push(turn(.098*Math.sin(k*2.4),.041,.098*Math.cos(k*2.4),[[.024,0],[.024,.006],[0,.007]],"#ad4932",.46,8));
        p.push(M.moved(M.turnedX(M.merge(...pie),1.02),s*.155,s*.037,0));}
    }else if(i===5){
      for(const s of [-1,1]){p.push(box(0,s*.21,0,.31,.035,.23,gold),beam([s*.128,-.195,.078],[s*.128,.195,.078],.017,gold),
        beam([s*.11,.173,.014],[0,0,.014],.014,wax),beam([0,0,.014],[s*.11,-.17,.014],.014,wax));}
      p.push(turn(0,-.19,0,[[.11,0],[.10,.027],[0,.105]],gold,.78),turn(0,.004,0,[[.006,0],[.074,.12],[0,.12]],wax,.68));
    }else{
      // Three separate lines of work merge beneath a single Bitcoin mark.
      p.push(beam([0,-.20,0],[0,.13,0],.026,gold));
      for(const side of [-1,1]){
        const x=side*.17;
        p.push(beam([x,-.16,0],[x,-.07,0],.026,gold),beam([x,-.07,0],[0,.05,0],.026,gold));
      }
      for(const [x,y] of [[-.17,-.16],[0,-.20],[.17,-.16],[0,.05]]){
        const ring=M.turnedX(M.torus(.036,.011,gold,.62,16,6),Math.PI/2);
        p.push(M.moved(ring,x,y,.016));
      }
      p.push(M.moved(BL.factoryModels.smoothBitcoin(.20,.032,wax,.74),0,.21,.018));
    }
    return M.merge(...p);
  };
  const chapters=[
    ["A CYPHERPUNK'S MANIFESTO · 1993", "Privacy is necessary for an open society in the electronic age.", "Eric Hughes's manifesto gave voice to the cypherpunks, who believed strong cryptography could protect individual freedom. Bitcoin grew from their ideas."],
    ["THE WHITE PAPER · OCTOBER 31, 2008", "Bitcoin: A Peer-to-Peer Electronic Cash System", "Satoshi Nakamoto sent a nine-page paper to a cryptography mailing list describing digital cash with no bank or middleman."],
    ["THE GENESIS BLOCK · JANUARY 3, 2009", "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks", "The first block ever mined. Satoshi embedded this newspaper headline in it, a timestamp and a statement about why Bitcoin exists."],
    ["RUNNING BITCOIN · JANUARY 2009", "In honor of Hal Finney, the first to receive bitcoin from Satoshi.", "Hal Finney ran the software from day one and received the first bitcoin transaction from Satoshi, block 170 on January 12, 2009."],
    ["BITCOIN PIZZA DAY · MAY 22, 2010", "10,000 BTC for two pizzas", "Laszlo Hanyecz paid 10,000 bitcoin for two pizzas, the first known real-world purchase with bitcoin."],
    ["THE FIRST HALVING · NOVEMBER 28, 2012", "Block 210,000 · Reward 50 → 25", "Every 210,000 blocks the new-coin reward halves, until about 21 million bitcoin exist. This is the scarcity written into the code."],
    ["THE SEED · SELF-CUSTODY", "Not your keys, not your coins.", "A seed phrase (BIP39, 2013) is the master key to a wallet. Whoever holds the words holds the bitcoin."],
    ["BITCOIN’S OPEN SOURCE CONTRIBUTORS", "For everyone who leaves Bitcoin better for the next person.", "One person writes a patch. Someone else spots a mistake. A third writes the test that keeps it from coming back. Others translate a guide or help a newcomer run their first node. This shrine honors everyone who shares that work. There’s room for your contribution, too."]
  ];
  const disk=(radius,e)=>{
    const g=M.geometry(),v=M.pushVert(g,0,0,0),rim=[];
    for(let i=0;i<64;i++)rim.push(M.pushVert(g,radius*Math.cos(i*tau/64),radius*Math.sin(i*tau/64),0));
    for(let i=0;i<64;i++)M.face(g,[v,rim[i],rim[(i+1)%64]],[255,255,255],{emissive:e});
    g.castShadow=false;return g;
  };
  const circle=(radius,pixels,paint,e,read)=>{
    const g=disk(radius,e);
    g.imageSurface=sheet(2*radius,2*radius,pixels,pixels,paint,e,read).imageSurface;return g;
  };
  const ring=(c,r,color,w)=>{c.beginPath();c.arc(0,0,r,0,tau);c.strokeStyle=color;c.lineWidth=w;c.stroke();};
  // The rose over the hearth is a sky map (poker-birth-sky.js), its sun carrying the morning light.
  const ROSE_RADIUS=1.55;
  const roseGlass=M.cached(()=>BL.pokerBirthSky.window(ROSE_RADIUS));
  // The light: a gold boss over the window's sun, swelling with the morning light (`update`).
  const roseSun=M.cached(()=>{
    const r=BL.pokerBirthSky.sunOn(ROSE_RADIUS).r*1.08,g=M.geometry(),centre=M.pushVert(g,0,0,0),edge=[];
    for(let i=0;i<32;i++)edge.push(M.pushVert(g,r*Math.cos(i*tau/32),r*Math.sin(i*tau/32),0));
    for(let i=0;i<32;i++)M.face(g,[centre,edge[i],edge[(i+1)%32]],[255,232,160],{emissive:1});
    g.castShadow=false;return g;
  });
  // The swell's halo: warm light blooming round the sun, added over the glass, shown only while the light rises.
  const roseHalo=M.cached(()=>circle(BL.pokerBirthSky.sunOn(ROSE_RADIUS).r*3.4,256,(c,w)=>{
    const h=c.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    h.addColorStop(0,"rgba(255,236,170,.95)");h.addColorStop(.3,"rgba(255,206,110,.55)");h.addColorStop(1,"rgba(255,170,60,0)");
    c.fillStyle=h;c.fillRect(0,0,w,w);
  },1));
  // Four roundels read clockwise from the hearth. All dimensions below are in
  // the glazier's 512-unit cartoon; the floor uses a higher-resolution impression.
  const studioRadius=4.60;
  const studioGlass=M.cached(()=>{
    const g=circle(studioRadius,1024,(c,size)=>{
      c.translate(size/2,size/2);c.scale(size/512,size/512);
      c.lineJoin=c.lineCap="round";
      const lead="#14251e",silver="#abc8ac",peridot="#8fc45a",jade="#55bc85";
      const path=(outline,colour)=>{
        const pane=new Path2D(outline);
        c.fillStyle=colour;c.fill(pane);
        c.strokeStyle=lead;c.lineWidth=2.2;c.stroke(pane);
      };
      const disc=(x,y,r,colour)=>{
        c.beginPath();c.arc(x,y,r,0,tau);c.fillStyle=colour;c.fill();
      };
      c.fillStyle=lead;c.fillRect(-256,-256,512,512);
      const facets=["#276541","#549d68","#179460","#1d583a","#75ae62","#358954"];
      // Bent courses of crown glass meet in staggered seams. The narrow peridot
      // border repeats the studio's square pixel between pairs of bottle-green panes.
      for(const [row,inner,outer,count] of [[0,84,141,20],[1,141,193,24],[2,193,224,32],[3,224,249,48]]){
        for(let i=0;i<count;i++){
          const a=tau*(i+.5*(row%2))/count,b=a+tau/count;
          c.beginPath();c.arc(0,0,outer,a,b);c.arc(0,0,inner,b,a,true);c.closePath();
          c.fillStyle=row===3 && i%3===1?peridot:facets[(i*5+row)%facets.length];c.fill();
          c.strokeStyle=lead;c.lineWidth=2.1;c.stroke();
        }
      }
      for(const r of [86,222,250])ring(c,r,silver,2.4);
      for(let i=0;i<4;i++){
        c.save();c.rotate(tau*(i+.5)/4);
        path("M0 -94 Q12 -133 35 -163 Q17 -173 0 -203 Q-17 -173 -35 -163 Q-12 -133 0 -94Z","#399563");
        path("M0 -115 Q7 -144 19 -162 Q5 -175 0 -187 Q-5 -175 -19 -162 Q-7 -144 0 -115Z","#a1c866");
        c.restore();
      }
      // Each pair of delimiters is cut from matching glass. The wide lead joints
      // at the tips run into the fan of darker panes around it.
      const codeLights=[
        { // </> — a slash between two chevrons
          left:"M-15 -23L-11 -17L-26 0L-11 17L-15 23L-34 2V-2Z",
          marks:["M-9 18L3 -19L9 -18L-3 19Z"]
        },
        { // {⋄} — a faceted stone between curled braces
          left:"M-13 -24V-19Q-22 -19 -22 -12V-8Q-22 -2 -27 0Q-22 2 -22 8V12Q-22 19 -13 19V24Q-29 24 -29 13V8Q-29 3 -35 3V-3Q-29 -3 -29 -8V-13Q-29 -24 -13 -24Z",
          marks:["M0 -9L7 0L0 9L-7 0Z"]
        },
        { // [=] — two courses of glass between square brackets
          left:"M-14 -23V-17H-23V17H-14V23H-30V-23Z",
          marks:["M-10 -9H10V-3H-10Z","M-10 3H10V9H-10Z"]
        },
        { // (:) — two lozenges inside curved parentheses
          left:"M-16 -25L-12 -20Q-31 0 -12 20L-16 25Q-43 0 -16 -25Z",
          marks:["M0 -14L5 -9L0 -4L-5 -9Z","M0 4L5 9L0 14L-5 9Z"]
        }
      ];
      for(const [i,glyph] of codeLights.entries()){
        c.save();c.rotate(i*tau/4);c.translate(0,-157);
        disc(0,0,49,lead);
        c.save();c.beginPath();c.arc(0,0,46,0,tau);c.clip();
        c.fillStyle="#347451";c.fillRect(-46,-46,92,92);
        for(const side of [-1,1]){
          c.save();c.scale(side,1);
          path("M-54 -54H0L-15 -21L-30 0H-54Z","#438454");
          path("M-54 54H0L-15 21L-30 0H-54Z","#285f47");
          path(glyph.left,jade);
          c.restore();
        }
        for(const mark of glyph.marks)path(mark,peridot);
        c.restore();ring(c,47,silver,1.6);
        c.restore();
      }
      const field=c.createRadialGradient(0,0,5,0,0,84);
      field.addColorStop(0,"#7fb48d");field.addColorStop(1,"#366c4e");
      disc(0,0,84,field);ring(c,83,silver,2);
      // Some traced wisps are subpixel at floor resolution. Centre the visible
      // silhouette, including every surviving wisp, before adding its soft halo.
      const stamp=document.createElement("canvas");
      const side=stamp.width=stamp.height=Math.ceil(size*168/512);
      const pen=stamp.getContext("2d");
      const logoScale=.423*size/512;
      pen.translate(side/2,side/2);pen.scale(logoScale,-logoScale);
      const flame=new Path2D();
      for(const outline of BL.pokerDamaskMap.contours){
        flame.moveTo(...outline[0]);
        for(let i=1;i<outline.length;i++)flame.lineTo(...outline[i]);
        flame.closePath();
      }
      pen.fillStyle="#fff";pen.fill(flame,"evenodd");
      const glass=pen.getImageData(0,0,side,side),mask=glass.data;
      let left=side,right=0,top=side,bottom=0;
      for(let y=0;y<side;y++)for(let x=0;x<side;x++){
        if(mask[4*(y*side+x)+3]<128)continue;
        left=Math.min(left,x);right=Math.max(right,x+1);
        top=Math.min(top,y);bottom=Math.max(bottom,y+1);
      }
      const cx=(left+right)/2,cy=(top+bottom)/2,scale=size/512;
      // Carry four existing lead joints from the innermost ring to the first
      // edge of the flame they meet. The open parts of the mark stay green.
      for(const joint of [1,6,11,16]){
        const angle=tau*joint/20,dx=Math.cos(angle),dy=Math.sin(angle);
        for(let radius=82;radius>0;radius-=.5){
          const x=Math.floor(cx+radius*scale*dx),y=Math.floor(cy+radius*scale*dy);
          if(x<0 || x>=side || y<0 || y>=side || mask[4*(y*side+x)+3]<128)continue;
          c.beginPath();c.moveTo(82*dx,82*dy);
          c.quadraticCurveTo((82+radius)*.5*dx-3*dy,(82+radius)*.5*dy+3*dx,radius*dx,radius*dy);
          c.strokeStyle=lead;c.lineWidth=1.65;c.stroke();break;
        }
      }
      // Fine undulations and seed bubbles soften the broad areas of coloured glass.
      const rand=BL.math.mulberry32(2011);
      c.globalCompositeOperation="soft-light";
      for(let i=0;i<3600;i++){
        const x=rand()*512-256,y=rand()*512-256;
        c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+2,y-1,x+3+rand()*9,y-2+rand()*3);
        c.strokeStyle=i%3?"rgba(230,255,234,.30)":"rgba(16,40,27,.33)";c.lineWidth=.35+rand()*1.2;c.stroke();
      }
      c.globalCompositeOperation="source-over";
      // The solder stays dense while each coloured pane transmits the city below.
      const pixels=c.getImageData(0,0,size,size),rgba=pixels.data;
      for(let i=0;i<rgba.length;i+=4){
        const green=rgba[i+1];
        rgba[i+3]=green<50?220:Math.round(49+.53*green);
      }
      c.putImageData(pixels,0,0);
      // Milky streaks follow the draw of the glass. The thinner streaks transmit
      // more of the surrounding green, with a few small seed bubbles in the sheet.
      for(let y=0;y<side;y++)for(let x=0;x<side;x++){
        const i=4*(y*side+x);
        if(!mask[i+3])continue;
        const u=(x-cx)/scale,v=(y-cy)/scale;
        const flow=u*.74+v*.35+4*Math.sin(v*.09)+2*Math.sin((u-v)*.16);
        const milk=.5+.32*Math.sin(flow*.35)+.18*Math.sin(flow*1.27);
        const depth=.5+.5*Math.sin((u+v)*.075);
        mask[i]=218+31*milk+4*depth;mask[i+1]=230+22*milk;
        mask[i+2]=225+22*milk+5*depth;mask[i+3]*=.75+.18*milk;
      }
      pen.putImageData(glass,0,0);
      pen.save();pen.clip(flame,"evenodd");pen.setTransform(1,0,0,1,0,0);
      for(let i=0;i<150;i++){
        const x=rand()*side,y=rand()*side;
        pen.beginPath();pen.ellipse(x,y,(.35+rand()*.45)*scale,(.8+rand())*scale,-.44,0,tau);
        pen.strokeStyle="rgba(99,132,118,.25)";pen.lineWidth=.4*scale;pen.stroke();
      }
      pen.restore();
      // A rounded green-patinated came: a muted high lip over a dark edge.
      pen.globalCompositeOperation="destination-over";pen.lineJoin="round";
      const lip=pen.createLinearGradient(-100,130,95,-120);
      lip.addColorStop(0,"#60876c");lip.addColorStop(.45,"#305f47");lip.addColorStop(1,"#204c37");
      pen.strokeStyle=lip;pen.lineWidth=3.6;pen.stroke(flame);
      pen.strokeStyle=lead;pen.lineWidth=6;pen.stroke(flame);
      c.setTransform(1,0,0,1,0,0);
      c.shadowColor="rgba(234,251,235,.32)";c.shadowBlur=size*.006;
      c.drawImage(stamp,size/2-cx,size/2-cy);
    },.55,true);
    if(g.imageSurface){
      const {canvas,rect}=g.imageSurface;
      g.imageSurface={rect,fallback:()=>canvas,cutout:true,soft:true,blend:"alpha",bright:.18};
    }
    return g;
  });
  // Narrow columns of lit air above the opal glass. Anchor each at a filled
  // stroke, so the green openings and the counter of the flame stay clear.
  const logoShaft=M.cached(()=>{
    const g=M.moved(M.panel({w:1,h:1,tilesX:1,tilesY:1,color:"#ffffff"}),0,.5,0);
    const veil=document.createElement("canvas");veil.width=48;veil.height=128;
    const c=veil.getContext("2d"),pixels=c.createImageData(48,128);
    for(let y=0;y<128;y++)for(let x=0;x<48;x++){
      const h=1-(y+.5)/128,u=((x+.5)/48-.5)/(.12+.16*h),i=(48*y+x)*4;
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
      pixels.data[i+3]=Math.round(23*Math.exp(-3*u*u)*(1-h)**1.8);
    }
    c.putImageData(pixels,0,0);
    g.castShadow=false;g.imageSurface={rect:[-.5,0,1,1],blend:"add",soft:true,cutout:true,bright:.03,fallback:()=>veil};
    return g;
  });
  const logoRays=(room,add,y)=>{
    const image=studioGlass().imageSurface?.fallback();
    const rays=[];
    if(!image)return rays;
    const context=image.getContext("2d"),size=image.width,metres=2*studioRadius/size;
    for(const [v,width,height] of [[.423,.29,1.0],[.476,.34,1.45],[.547,.45,1.85],[.588,.27,.86]]){
      const row=Math.floor(v*size),start=Math.floor(.40*size),length=Math.floor(.20*size);
      const strip=context.getImageData(start,row,length,1).data;
      let run=0,longest=0,middle=0;
      for(let x=0;x<length;x++){
        run=strip[x*4]>195 && strip[x*4+2]>195 && strip[x*4+3]>180?run+1:0;
        if(run>longest){longest=run;middle=x+.5-(run-1)/2;}
      }
      if(!longest)continue;
      const n=add(room,logoShaft(),(start+middle-size/2)*metres,y,(row+.5-size/2)*metres);
      n.sightHidden=true;n.scale.x=width;n.scale.y=height;rays.push(n);
    }
    return rays;
  };
  // Look through the stationary leadwork at a twenty-kilometre survey. Keep the
  // photograph's edges outside the aperture, even at a grazing angle from the door.
  const cityView=(room,r,add,y)=>{
    const city=disk(studioRadius,1),rect=[-6,-6,12,12],nadir=new Float32Array([.5,.5]);
    let image,flat,ground,scatter,lastX=-1,lastY=-1,lastSpan=0;
    const asset={load(){
      if(!image){image=new Image();image.src=BL.pokerMinneapolisArt;}
      return image;
    }};
    const fallback=()=>{
      const photo=asset.load();
      if(!flat){flat=document.createElement("canvas");flat.width=flat.height=1;}
      if(!photo.naturalWidth)return flat;
      if(!ground){
        const side=photo.naturalWidth*3/4;
        flat.width=flat.height=Math.min(1536,side);
        const ctx=flat.getContext("2d");
        ctx.drawImage(photo,0,0,side,photo.naturalHeight,0,0,flat.width,flat.height);
        scatter=document.createElement("canvas");scatter.width=scatter.height=96;
        const pen=scatter.getContext("2d"),light=pen.createRadialGradient(48,48,0,48,48,48);
        light.addColorStop(0,"#fff");light.addColorStop(.45,"rgba(255,255,255,.48)");
        light.addColorStop(1,"rgba(255,255,255,0)");pen.fillStyle=light;pen.fillRect(0,0,96,96);
        const half=flat.width/2,radius=.032*flat.width;
        ctx.globalCompositeOperation="screen";ctx.globalAlpha=.34;
        ctx.drawImage(scatter,half-radius,half-radius,2*radius,2*radius);
        ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
        // All camera angles project the shaft inside the middle half of the survey.
        ground=document.createElement("canvas");ground.width=ground.height=half;
        ground.getContext("2d").drawImage(flat,half/2,half/2,half,half,0,0,half,half);
      }
      const w=flat.width,span=rect[2],x=Math.round(-rect[0]*w/span),y=Math.round((1+rect[1]/span)*w);
      if(x!==lastX || y!==lastY || Math.abs(span-lastSpan)>.025){
        const ctx=flat.getContext("2d");
        ctx.drawImage(ground,w/4,w/4);
        ctx.globalCompositeOperation="screen";ctx.globalAlpha=.018;
        for(let i=0;i<16;i++){
          const t=(i+.5)/16,rx=(1-t)*w*.80/span+t*w*.020,ry=(1-t)*w*1.23/span+t*w*.020;
          ctx.drawImage(scatter,x+(w/2-x)*t-rx,y+(w/2-y)*t-ry,2*rx,2*ry);
        }
        ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
        lastX=x;lastY=y;lastSpan=span;
      }
      return flat;
    };
    city.imageSurface={rect,nadir,asset,fallback};
    add(room,city,0,y,0).rotation.x=-Math.PI/2;
    return eye=>{
      const x=eye.x-r.x,north=r.z-eye.z,height=Math.max(.3,eye.y-r.y-y);
      // Preload on approach even when looking away. A visible disk always gets the original survey.
      if(!image && x*x+north*north<100)asset.load();
      const distance=Math.hypot(x,north,height),span=11.8+1.4*height/distance;
      const margin=(span/2-studioRadius)*.94;
      rect[0]=-span/2+margin*x/distance;rect[1]=-span/2+margin*north/distance;
      rect[2]=rect[3]=span;
      nadir[0]=.5+.65*x/distance;nadir[1]=.5-.65*north/distance;
    };
  };
  // Check the built collision rectangles, not just the symmetry of the formula.
  // The central passage, piers and all other
  // furniture (including the fireside pedestals) must remain clear of them.
  const checkLayout=(items,solids,r)=>{
    const shrines=items.slice(-8),spacing=shrineAt(r,1,0).z-shrineAt(r,1,1).z;
    const overlaps=(a,b)=>Math.abs(a.x-b.x)<a.w+b.w-.001 && Math.abs(a.z-b.z)<a.d+b.d-.001;
    for(let i=0;i<8;i++){
      const pos=shrines[i].node.position,twin=shrines[(i+4)%8].node.position;
      const mesh=BL.scene.boundsOf(shrines[i].node.geometry);
      const scale=shrines[i].node.scale;
      const bounds={x:pos.x,z:pos.z,w:scale.z*Math.max(-mesh.min[2],mesh.max[2]),d:scale.x*Math.max(-mesh.min[0],mesh.max[0])};
      if(Math.abs(pos.z)+bounds.d>r.d/2-.65 || Math.abs(pos.x)+bounds.w>r.w/2-.15 || mesh.max[1]*scale.y>=BL.pokerLoungeStone.sill-.14)
        throw Error("Cathedral shrine crosses a wall or window sill");
      const own=solids.find(s=>Math.abs(s.x-pos.x)<.001 && Math.abs(s.z-pos.z)<.001);
      if(!own || own.w+.001<bounds.w || own.d+.001<bounds.d || Math.abs(pos.x+twin.x)>.001 || Math.abs(pos.z-twin.z)>.001 ||
          i%4 && Math.abs(shrines[i-1].node.position.z-pos.z-spacing)>.001)
        throw Error("Cathedral shrine is off its mirrored spacing");
      for(const solid of solids){
        if(solid===own)continue;
        if(overlaps(bounds,solid))throw Error("Cathedral shrine intersects furniture");
      }
      if(Math.abs(pos.x)-bounds.w<1.04 || items.slice(0,-8).some(prop=>{
        const p=prop.node.position;return Math.hypot(pos.x-p.x,pos.z-p.z)<1.75;
      }))throw Error("Cathedral shrine blocks a passage or heirloom");
    }
  };
  // The shrine tree behind the fireside record is a cherry, for Traverse City, the cherry capital: blossom pinks for
  // the orange, petals drifting from its limbs, and its blossom brightest with the morning light (poker-birth-sky.js).
  const CHERRY_BAY=3,PETALS=22;
  const BLOSSOM=["#b84f7a","#d06a92","#e588ab","#f2a5c2","#f8bfd3","#fbd5e2","#ffe9f0"].map(c=>BL.math.hexToRgb(c));
  const petal=M.cached(()=>{
    const g=M.geometry(),ids=[[0,0,0],[.05,.02,.01],[.085,0,0],[.05,-.02,.01]].map(p=>M.pushVert(g,...p)),pink=[247,196,212];
    M.face(g,ids,pink,{emissive:.35});M.face(g,ids.slice().reverse(),pink,{emissive:.35});
    g.castShadow=false;return g;
  });
  // With the light the cherry's wood turns bright white: a pale shell a hair outside each wood mesh (pushed out along
  // its averaged normals), drawn as glass whose alpha `update` raises with the light, so the bark fades to white.
  const SHELL_PUSH=.006;
  const whiteShell=g=>{
    const v=g.verts,count=g.faces.length,n=new Float64Array(v.length),out=M.geometry();
    for(let k=0;k<count;k++){
      const id=g.faces[k].i,m=id.length;
      let nx=0,ny=0,nz=0;
      for(let j=0;j<m;j++){
        const a=3*id[j],b=3*id[(j+1)%m];
        nx+=(v[a+1]-v[b+1])*(v[a+2]+v[b+2]);ny+=(v[a+2]-v[b+2])*(v[a]+v[b]);nz+=(v[a]-v[b])*(v[a+1]+v[b+1]);
      }
      for(let j=0;j<m;j++){const a=3*id[j];n[a]+=nx;n[a+1]+=ny;n[a+2]+=nz;}
    }
    for(let i=0;i<v.length;i+=3){
      const l=Math.hypot(n[i],n[i+1],n[i+2])||1;
      out.verts.push(v[i]+n[i]/l*SHELL_PUSH,v[i+1]+n[i+1]/l*SHELL_PUSH,v[i+2]+n[i+2]/l*SHELL_PUSH);
    }
    const white=[255,253,247];
    for(let k=0;k<count;k++)M.face(out,Array.from(g.faces[k].i),white,{emissive:.55});
    out.smooth=true;out.glass=.01;out.castShadow=false;
    if(g.sway)out.sway=g.sway;
    return out;
  };
  // The light's shaft: three crossed ribbons along local +x, from the rose's sun to the cherry's foot. The beam shader
  // fades each from x=0 toward `lightBeam`; `update` sets the glass by the light.
  const SHAFT_GLASS=.32;
  const shaftGeometry=length=>{
    const g=M.geometry(),gold=[255,222,150];
    for(let plane=0;plane<3;plane++){
      const a=plane*Math.PI/3,cy=Math.cos(a),cz=Math.sin(a),pairs=[];
      for(const [t,w] of [[0,.42],[.25,.68],[.6,1.08],[1,1.5]]){
        pairs.push([-1,1].map(s=>M.pushVert(g,t*length,s*w*cy,s*w*cz)));
      }
      for(let i=1;i<pairs.length;i++){const p=pairs[i-1],q=pairs[i];M.face(g,[p[0],p[1],q[1],q[0]],gold,{emissive:1});}
    }
    g.glass=.01;g.lightBeam=length*4;g.castShadow=false;g.twoSided=true;
    return g;
  };
  // Where the shaft lands: a soft pool of gold, added over the floor.
  const shaftPool=M.cached(()=>circle(2.3,256,(c,w)=>{
    const h=c.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);
    h.addColorStop(0,"rgba(255,226,150,.75)");h.addColorStop(.45,"rgba(255,206,120,.35)");h.addColorStop(1,"rgba(255,180,80,0)");
    c.fillStyle=h;c.fillRect(0,0,w,w);
  },1));
  const installSteps=function* (room,r,{item,add,windowLight},lite,items,solids,slice){
    const relics=[],hollows=[],canopies=[],treeOccluders=[],candles=[],dust=[],runes=[],birdPairs=[];
    let blossom=null,blossomFrom=null,cherryAt=null;
    const whitened=[];
    const hollowLights=new Float32Array(bayCount*2*8);
    // At matching windows keep the relic with its event. Other bays hold its cultural context.
    const shrineOrder=[1,2,0,3,7,6,5,4];
    for(let bay=0;bay<shrineOrder.length;bay++){
      const i=shrineOrder[bay],side=bay<bayCount?-1:1,pos=shrineAt(r,side,bay%bayCount);
      const [title,line,card]=chapters[i];
      // Leave a margin for bark, leaf tips and wind. Local +X follows world Z on the right wall.
      yield* BL.buildTasks.pause(slice);
      const tree=yield* BL.pokerShrineTrees.createSteps(bay,lite,{
        left:(r.d/2+side*pos.z-.52)/shrineScale,right:(r.d/2-side*pos.z-.52)/shrineScale,
        back:(r.w/2-Math.abs(pos.x)-.52)/shrineScale
      },slice,bay===CHERRY_BAY?BLOSSOM:undefined);
      const shrine=item(title,tree.trunk,pos.x,0,pos.z,ui=>{ui.element("p",line);ui.element("p",card);},pos);
      shrine.scale.x=shrine.scale.y=shrine.scale.z=shrineScale;
      shrine.rotation.y=-side*Math.PI/2;
      const perches=tree.perches.map(p=>({x:pos.x-side*p.z*shrineScale,y:p.y*shrineScale,z:pos.z+side*p.x*shrineScale}));
      if(bay===CHERRY_BAY){
        blossomFrom=perches;cherryAt=pos;
        for(const g of [tree.trunk,tree.roots])whitened.push(add(shrine,whiteShell(g)));
        yield* BL.buildTasks.pause(slice);
      }
      birdPairs.push(BL.pokerParadiseBirds.pair(room,r,perches,side,bay));
      hollows.push(add(shrine,tree.cavity));
      // Floor transmission bakes from room-local transforms, including the open spaces between limbs.
      for(const g of [tree.wood,tree.leaves]){
        const node=add(room,g,pos.x,0,pos.z);
        node.rotation.y=shrine.rotation.y;node.scale.x=node.scale.y=node.scale.z=shrineScale;
        treeOccluders.push(node);
        canopies.push(node);
        if(bay===CHERRY_BAY && g===tree.leaves)blossom=node;
        if(bay===CHERRY_BAY && g===tree.wood)whitened.push(add(node,whiteShell(g)));
      }
      add(shrine,tree.roots);
      add(shrine,tree.deep);
      const object=add(shrine,relic(i),tree.plaqueFront.x,BL.pokerShrineTrees.relicY,tree.relicFront.z-.012);
      object.scale.x=object.scale.y=object.scale.z=.245;relics.push(object);
      items[items.length-1].extraTarget=object;
      // A small bronze tablet fastened to the bole below the opening.
      const p=tree.plaqueFront,tablet=add(shrine,plaque(title,line),p.x,p.y,p.z+.020);
      tablet.scale.x=.18;tablet.scale.y=.21;
      add(shrine,box(p.x,p.y,p.z-.003,.169,.051,.041,"#76583c",.16));
      const off=bay*8;
      hollowLights[off]=r.x+pos.x-side*(tree.relicFront.z-.065)*shrineScale;
      hollowLights[off+1]=r.y+BL.pokerShrineTrees.relicY*shrineScale-.08;hollowLights[off+2]=r.z+pos.z;
      hollowLights[off+3]=.94;
      hollowLights[off+4]=.85;hollowLights[off+5]=.34;hollowLights[off+6]=.10;
      if(i===2 || i===3){
        const ins=plaque(i===2?"THE TIMES":"Running bitcoin",i===2?"03/Jan/2009 · Chancellor on brink of second bailout for banks":"");
        const label=add(object,ins,0,i===2?0:-.15,.078);label.scale.x=.42;label.scale.y=.62;
      }
    }
    yield* BL.buildTasks.pause(slice);
    // The desert garden behind the trees; its solids go in before the check, which holds them clear of the shrines.
    yield* BL.pokerDesertGarden.plantSteps(room,r,add,lite,items,solids,slice);
    checkLayout(items,solids,r);
    const roseFrame=BL.scene.createNode({scale:{x:2,y:2,z:2}});
    BL.scene.addChild(windowLight,roseFrame);
    const rear=-r.d/4,roseY=10.33;
    const flower=roseGlass();
    yield* BL.pokerGlassMaterial.fitSteps(flower.imageSurface,"flower",slice);
    add(roseFrame,flower,0,roseY,rear+.96);
    const sunAt=BL.pokerBirthSky.sunOn(ROSE_RADIUS),sun=add(roseFrame,roseSun(),sunAt.x,roseY+sunAt.y,rear+.975);
    const haloGlass=roseHalo();
    if(haloGlass.imageSurface)Object.assign(haloGlass.imageSurface,{blend:"add",soft:true,cutout:true});
    const halo=add(roseFrame,haloGlass,sunAt.x,roseY+sunAt.y,rear+.99);halo.visible=false;
    // The shaft runs from the sun on the glass (room-local, the rose frame doubled) to the floor at the cherry's foot.
    const from={x:2*sunAt.x,y:2*(roseY+sunAt.y),z:2*(rear+1.04)},to={x:cherryAt.x+2.7,y:BL.pokerFloor.Y,z:cherryAt.z};
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz);
    const shaft=add(windowLight,shaftGeometry(length),from.x,from.y,from.z);
    // Turn local +x onto the shaft: about x cross d, by the angle between them.
    const across=Math.hypot(dz,dy);
    shaft.quaternion=BL.math.quat.fromAxisAngle(BL.math.quat.create(),0,-dz/across,dy/across,Math.acos(dx/length));
    shaft.visible=false;
    const pool=shaftPool();
    if(pool.imageSurface)Object.assign(pool.imageSurface,{blend:"add",soft:true,cutout:true});
    const poolNode=add(windowLight,pool,to.x,to.y+.012,to.z);poolNode.rotation.x=-Math.PI/2;poolNode.visible=false;
    for(const n of whitened)n.visible=false;
    for(const [radius,width,color] of [[1.548,.032,"#635545"],[1.57,.072,white],[1.68,.048,shade]]){
      add(roseFrame,M.turnedX(M.torus(radius,width,color,.42,64,8),Math.PI/2),0,roseY,rear+1.04);
    }
    // The room's local origin is the midpoint of both pairs of walls. Set
    // the glass just above the turf where its rim covers the edge of the lawn.
    const inlayY=BL.pokerFloor.Y-.0035;
    const city=cityView(windowLight,r,add,inlayY);
    yield* BL.buildTasks.pause(slice);
    const rays=logoRays(windowLight,add,inlayY+.003);
    yield* BL.buildTasks.pause(slice);
    const view=eye=>{
      city(eye);
      for(const ray of rays)ray.rotation.y=Math.atan2(eye.x-r.x-ray.position.x,eye.z-r.z-ray.position.z);
    };
    const floorGlass=studioGlass();
    yield* BL.pokerGlassMaterial.fitSteps(floorGlass.imageSurface,"floor",slice);
    const med=add(windowLight,floorGlass,0,inlayY+.0008,0);med.rotation.x=-Math.PI/2;
    const flash=circle(studioRadius,512,(c,w)=>{
      c.translate(w/2,w/2);
      for(const radius of [83,222,250])ring(c,radius,"#d8ffe4",1.6);
    },.9);
    if(flash.imageSurface)Object.assign(flash.imageSurface,{blend:"add",soft:true,cutout:true});
    const pulse=add(windowLight,flash,0,inlayY+.001,0);pulse.rotation.x=-Math.PI/2;pulse.visible=false;
    let last=Math.max(BL.mempool.state.height||0,BL.chain?.snapshot?.height||0),age=10,time=0,lastTier="";
    const block=(value,animate)=>{if(value>last){last=value;age=animate?0:10;}};
    if(!lite){
      const fittings=BL.scene.createNode({scale:{x:2,y:2,z:2}});
      BL.scene.addChild(room,fittings);
      const taper=M.merge(turn(0,0,0,[[.034,0],[.043,.018],[.035,.13],[.030,.16],[0,.16]],wax,.60,8),
        turn(0,.151,0,[[.012,0],[.026,.03],[.016,.06],[0,.114]],"#ffcf79",1,8));
      const mote=turn(0,0,0,[[0,0],[.014,.013],[0,.029]],"#f6c477",.96,5);
      const glyphs=[];
      for(let j=0;j<12;j++){const y=j*.22,dir=j%2?1:-1;
        glyphs.push(beam([-.034,y,0],[.028,y+.13,0],.012,gold,.83),beam([.028,y+.07,0],[dir*.074,y+.14,0],.012,gold,.83));}
      const script=M.merge(...glyphs);
      for(const s of [-1,1]){
        for(let j=0;j<=bayCount;j++){const p=pier(r,s,j),n=add(fittings,script,p.x/2-s*.42,4.6,p.z/2);n.rotation.y=-s*Math.PI/2;runes.push(n);}
        for(let j=0;j<bayCount;j++){
          const z=bayCenter(r,j);
          for(let k=0;k<4;k++)candles.push(add(fittings,taper,s*(r.w/4-2.825+k*.31),4.1+j*.32+k*.66,z/2+.48*Math.sin(k*2+j)));
          for(let k=0;k<5;k++)dust.push(add(fittings,mote,s*(r.w/4-4.225+k*.52),2.4+k*.39,z/2+.61*Math.sin(k*2.4+j)));
        }
      }
    }
    // The cherry's falling petals: a fixed pool, each dropping from one of its limbs with a flutter and starting again.
    const petals=[],drift=new Float32Array(PETALS),petalRandom=BL.math.mulberry32(70626);
    const dropFrom=(i,anywhere)=>{
      const n=petals[i];
      const p=blossomFrom[Math.floor(petalRandom()*blossomFrom.length)];
      n.position.x=p.x+(petalRandom()-.5)*2.4;n.position.z=p.z+(petalRandom()-.5)*2.4;
      n.position.y=anywhere?.3+petalRandom()*(p.y-.3):p.y+(petalRandom()-.5)*.6;
      drift[i]=petalRandom()*tau;
    };
    if(blossomFrom?.length)for(let i=0;i<PETALS;i++){petals.push(add(room,petal()));dropFrom(i,true);}
    let petalTime=0;
    const sway=(elapsed,calm)=>{
      if(!lite)return;
      for(const node of canopies){
        const phase=elapsed*1.9+(r.x+node.position.x)*.37+(r.z+node.position.z)*.29;
        const bend=calm?0:.007*(Math.sin(phase)+.35*Math.sin(2.3*phase+1.7));
        node.rotation.z=-bend*.8;node.rotation.x=bend*.6;
      }
    };
    // Visit all eight perches in a staggered order, with a quiet interval between calls.
    const birdRandom=BL.math.mulberry32(35172);
    let displayBay=1,birdRest=9;
    return {block,view,sway,hollowLights,treeOccluders,update(dt,calm,quality,audio){
      if(document.hidden || !room.visible)return;
      const light=BL.pokerBirthSky.light(Date.now());
      sun.glow=.8+1.2*light;sun.scale.x=sun.scale.y=1+.18*light;
      halo.visible=light>.01;halo.glow=light;halo.scale.x=halo.scale.y=.6+.4*light;
      if(blossom)blossom.glow=1+.35*light;
      // The light pours down to the cherry and whitens its wood; all of it hidden while the light is out.
      const lit=light>.01;
      shaft.visible=poolNode.visible=lit;
      shaft.geometry.glass=Math.max(.001,SHAFT_GLASS*light);poolNode.glow=light;
      for(let i=0;i<whitened.length;i++){const n=whitened[i];n.visible=lit;n.geometry.glass=Math.max(.001,Math.min(1,light*1.15));}
      // Petals fall faster and more of them show while the light is up.
      if(!calm){
        petalTime+=dt;
        const showing=Math.round(PETALS*(.45+.55*light)),fall=.32+.22*light;
        for(let i=0;i<petals.length;i++){
          const n=petals[i];n.visible=i<showing;
          if(!n.visible)continue;
          const d=drift[i];
          n.position.y-=dt*fall;n.position.x+=dt*.18*Math.sin(petalTime*1.3+d);n.position.z+=dt*.14*Math.cos(petalTime*1.1+d);
          n.rotation.x=petalTime*2.1+d;n.rotation.y=petalTime*1.4+d*1.7;
          if(n.position.y<.04)dropFrom(i,false);
        }
      }
      if(!calm){
        birdRest-=dt;
        if(birdRest<=0 && birdPairs[displayBay](dt,audio)){
          displayBay=(displayBay+5)%birdPairs.length;
          birdRest=9+birdRandom()*12;
        }
      }
      const tier=lite?"low":quality;
      if(lastTier!==tier){
        lastTier=tier;const high=tier==="high",lit=tier!=="low";
        for(let i=0;i<candles.length;i++)candles[i].visible=lit&&(high||i%2===0);
        for(const n of dust)n.visible=high;for(const n of runes)n.visible=lit;
      }
      last=Math.max(last,BL.mempool.state.height||0,BL.chain?.snapshot?.height||0);
      if(!calm)time+=dt;
      for(let i=0;i<relics.length;i++){
        const flicker=calm?1:1+BL.blaze.flare(time,i*2.17)+.07*Math.sin(time*2.23+i);
        hollows[i].glow=flicker;
        hollowLights[i*8+4]=.85*flicker;hollowLights[i*8+5]=.34*flicker*flicker;
        relics[i].position.y=BL.pokerShrineTrees.relicY+(calm?0:.006*Math.sin(time*.85+i));
        relics[i].rotation.y=calm?0:.13*Math.sin(time*.56+i);
      }
      if(calm||tier==="low"){pulse.visible=false;age=10;return;}
      age+=dt;pulse.visible=age<3;
      if(pulse.visible)pulse.smokeOpacity=.44*Math.sin(Math.PI*age/3);
      for(const n of runes)n.glow=age<3?1+.7*Math.sin(Math.PI*age/3):1;
      for(let i=0;i<candles.length;i++)if(candles[i].visible)candles[i].glow=1+BL.blaze.flare(time,i);
      if(tier==="high")for(let i=0;i<dust.length;i++)dust[i].position.y=2.4+(i%5)*.39+.18*Math.sin(time*.44+i);
    }};
  };
  BL.pokerCathedral={studioRadius,roseGlass,engrave,bayCount,bayWidth,bayCenter,pier,shrineAt,pedestal,installSteps};
})();
