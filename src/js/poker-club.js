// The public portrait court and the private copper-roofed 21 Club.
(() => {
  "use strict";
  const BL=window.BL, M=BL.models, S=BL.scene, tau=2*Math.PI;
  const brass="#c3995f", edge="#f0c888", copper="#a66240", dark="#30272a", enamel="#244b43", opal="#ffe7b4";
  const booth=Object.freeze({x:33,z:-19}), wall=Object.freeze({x:booth.x-1,z:-booth.z,yaw:Math.PI});
  const box=(x,y,z,w,h,d,color,emissive=.18)=>M.box({w,h,d,color,emissive,offset:{x,y,z}});
  const turn=(x,y,z,profile,color,n=12,emissive=.25)=>M.moved(M.lathe({profile,segments:n,color,emissive}),x,y,z);
  const node=(root,geometry,x=0,y=0,z=0)=>{
    const n=S.createNode({geometry,position:{x,y,z}}); S.addChild(root,n); return n;
  };
  const word=(value,cell,x,y,z,color=opal)=>{
    const text=BL.poolModels.carve(value,{ joined:true,cell,color,emissive:.78});
    return M.moved(text.geometry,x-text.width/2+cell/2,y+2*cell,z-.16);
  };
  const beam=M.beam;
  const lamp=(x,y,z,s=1)=>turn(x,y,z,[[0,0],[.18*s,0],[.22*s,.07*s],[.18*s,.45*s],[.09*s,.54*s],[0,.55*s]],opal,8,.87);
  const portraitCourt=(root,lite)=>{
    const frame=[], stand=[],x=booth.x,z=booth.z;
    for(const side of [-1,1]){
      const dx=side*1.83;
      frame.push(box(dx,1.61,0,.25,3.22,.54,brass),box(dx,1.61,.29,.15,2.94,.055,copper),
        box(dx,.18,.15,.46,.35,.69,dark),lamp(dx,1.95,.49));
      for(let i=0;i<5;i++){
        const bx=side*(1.24+i*.104), depth=Math.sin(i*1.6)*.07;
        frame.push(beam(bx,3.06,.15+depth,side*(1.59+i*.038),1.28,.33+depth,.13,i%2?"#60303e":"#824850"),
          beam(side*(1.59+i*.038),1.28,.33+depth,bx,.13,.26+depth,.14,i%2?"#683544":"#854654"));
      }
      frame.push(box(dx-side*.19,1.28,.36,.27,.065,.2,edge));
    }
    frame.push(box(0,1.56,-.16,3.74,3.12,.25,"#25272b"),box(0,3.12,0,4.07,.2,.58,brass),
      box(0,3.30,0,3.57,.18,.50,copper),box(0,3.45,0,2.92,.17,.43,dark),word("MOON PORTRAITS",.044,0,3.46,.25),
      box(0,.035,.65,3.83,.07,1.74,dark),box(0,.082,1.44,3.74,.018,.026,brass),
      M.moved(M.torus(.38,.017,brass,.5,24,4),0,.088,.95));
    for(const side of [-1,1]){
      for(let i=0;i<4;i++){
        const dx=side*(1.61-i*.17);
        frame.push(beam(dx,3.06,.21,dx-side*.45,3.44-i*.064,.21,.041,edge));
      }
      for(const y of [.41,.52,2.72,2.82])frame.push(box(side*1.83,y,.04,.33,.053,.55,copper,.30));
    }
    for(const y of [.12,2.99])frame.push(box(0,y,.09,3.43,.034,.035,edge));
    node(root,M.merge(...frame),x,0,z);
    // The same crater field used on the turning moon, presented here as a shallow relief.
    const moon=node(root,BL.pokerHall.lunarSurface(true,lite),x+.26,1.78,z+.02);
    Object.assign(moon.scale,{x:.047,y:.047,z:.012});
    const camZ=z+3.52;
    for(let i=0;i<3;i++){
      const a=i*tau/3;
      stand.push(beam(.49*Math.cos(a),.07,.49*Math.sin(a),0,1.20,0,.073,brass));
    }
    stand.push(box(0,1.39,0,.54,.39,.37,copper),box(0,1.39,.21,.47,.32,.08,dark),
      box(0,1.64,0,.21,.11,.19,brass));
    for(let i=0;i<5;i++)stand.push(box(0,1.39,-.22-i*.042,.39-i*.027,.31-i*.025,.04,i%2?brass:dark));
    const lens=M.turnedX(turn(0,0,0,[[0,0],[.13,0],[.13,.06],[0,.06]],"#5996a2",12,.59),-Math.PI/2);
    stand.push(M.moved(lens,0,1.39,-.43));
    return node(root,M.merge(...stand),x,0,camZ);
  };
  const roof=(lite)=>{
    const p=[];
    // Offset the loggia to shelter the bar and keep the centre of the roof open to the telescope.
    for(const x of [-7.63,.40]) for(const z of [-6.40,-2.65]){
      p.push(turn(x,0,z,[[0,0],[.26,0],[.27,.12],[.185,.22],[.13,.39],[.13,3.12],[.25,3.23],[.25,3.34],[0,3.34]],brass,8),
        lamp(x,2.51,z+.19,.69));
    }
    for(const z of [-6.4,-2.65]){
      p.push(box(-3.62,3.37,z,8.46,.24,.35,copper),box(-3.62,3.24,z+.17,8.45,.045,.055,edge));
      for(let i=0;i<7;i++)p.push(beam(-7.54+i*1.18,3.49,z,-6.97+i*1.18,3.97,z,.043,brass),
        beam(-6.97+i*1.18,3.97,z,-6.40+i*1.18,3.49,z,.043,brass));
    }
    for(let i=0;i<9;i++){
      const x=-7.65+i; p.push(beam(x,3.42,-6.62,x,4.16,-4.54,.085,brass),beam(x,4.16,-4.54,x,3.42,-2.42,.085,brass));
      if(i<8) for(const side of [-1,1]){
        const pane=box(0,0,0,.94,.07,2.20,(i+side)%2?"#835037":"#a36a46");
        p.push(M.moved(M.turnedX(pane,side*.336),x+.5,3.80,-4.54+side*1.04));
      }
    }
    for(let i=0;i<(lite?12:24);i++){
      const x=-7.28+(i*.618034%1)*7.21,z=-6.05+(i*.3817%1)*3.1;
      p.push(box(x,4.08-Math.abs(z+4.54)*.36,z,.078,.047,.078,opal,.98));
    }
    p.push(box(-3.63,3.41,-2.41,2.42,.57,.11,dark),word("21 CLUB",.066,-3.63,3.42,-2.32));
    for(const side of [-1,1]){
      const x=4.3*side;
      p.push(M.moved(M.torus(1.06,.045,brass,.42,24,5),x,.14,1),
        M.moved(M.torus(1.17,.018,copper,.4,24,4),x,.027,1));
      for(let j=0;j<8;j++){
        const a=j*tau/8,b=a+tau/8;
        p.push(beam(x+.95*Math.cos(a),.18,1+.95*Math.sin(a),x+.95*Math.cos(b),.18,1+.95*Math.sin(b),.06,brass));
      }
    }
    return M.merge(...p);
  };
  const displayFrame=M.cached(()=>{
    const p=[box(0,1.72,0,5.28,3.42,.32,dark),box(0,3.26,.19,5.46,.17,.13,brass),
      box(0,3.59,0,3.38,.42,.27,copper),word("WALL OF FAME",.052,0,3.59,.17),
      word("TONIGHT'S WINS",.033,0,3.02,.21),box(0,.25,.04,5.48,.22,.51,copper)];
    for(let i=0;i<3;i++){
      const x=(i-1)*1.68;
      p.push(box(x,1.59,.21,1.53,2.20,.16,brass),box(x,1.59,.30,1.44,2.11,.07,enamel),
        box(x,1.61,.355,1.25,.021,.026,edge),box(x,.94,.355,1.25,.021,.026,brass),
        M.moved(BL.factoryModels.smoothBitcoin(.32,.032,brass,.61),x,2.21,.38));
      for(const side of [-1,1])for(let j=0;j<4;j++){
        const dx=side*(.23+.033*j); p.push(beam(x+dx,2.02+j*.071,.36,x+dx+side*.079,2.08+j*.071,.36,.027,brass));
      }
    }
    return M.merge(...p);
  });
  const chars=M.scopedMap();
  const glyph=ch=>{
    if(chars.has(ch))return chars.get(ch);
    const rows=BL.jumbotronFont.FONT[ch] || BL.jumbotronFont.FONT["?"], g=M.geometry();
    if(rows) for(let y=0;y<rows.length;y++) for(let x=0;x<5;x++) if(rows[y]&(16>>x)){
      const a=x/6,b=1-y/6,step=.154;
      M.face(g,[[a,b],[a,b-step],[a+step,b-step],[a+step,b]].map(([u,v])=>M.pushVert(g,u,v,0)),[252,214,151],{emissive:.85});
    }
    chars.set(ch,g);return g;
  };
  const line=(parent,x,y,width,max,faceZ=.374)=>{
    const cells=Array.from({length:max},()=>node(parent,null));
    return value=>{
      const str=String(value).toUpperCase().slice(0,max),step=Math.min(.133,width/Math.max(1,str.length));
      cells.forEach((n,j)=>{
        n.visible=j<str.length && str[j]!==" ";
        if(!n.visible)return;
        n.geometry=glyph(str[j]); Object.assign(n.scale,{x:step,y:step,z:1});
        Object.assign(n.position,{x:x+(j-str.length/2)*step,y,z:faceZ});
      });
    };
  };
  const fameWall=(root,x=wall.x,z=wall.z,yaw=wall.yaw)=>{
    const n=node(root,displayFrame(),x,0,z), rows=[]; n.rotation.y=yaw;
    for(let i=0;i<3;i++){
      const x=(i-1)*1.68;
      rows.push([line(n,x,1.77,1.32,16),line(n,x,1.26,1.30,16),line(n,x,.71,1.30,12)]);
    }
    return wins=>rows.forEach(([name,amount,table],i)=>{
      const row=wins[i]; name(row?row.name:"OPEN");amount(row?row.amount+" CHIPS":"");table(row?"TABLE "+(row.table+1):"");
    });
  };
  // A single silhouette makes the nightly rail walk. The local clock determines its position even
  // when a visitor arrives halfway through. No timers survive a visit to the room.
  const nightWalk=root=>{
    const coat="#272d37", lining="#404655";
    const shape=M.merge(turn(0,0,0,[[0,0],[.33,0],[.30,.18],[.23,.79],[.31,1.05],[.18,1.18],[0,1.18]],coat),
      box(0,1.40,-.08,.39,.38,.24,coat),box(0,1.4,.068,.26,.28,.038,"#14151b"),
      beam(-.18,1.23,.12,-.16,1.55,.11,.081,lining),beam(.18,1.23,.12,.16,1.55,.11,.081,lining),
      beam(-.16,1.55,.11,0,1.65,.07,.079,lining),beam(0,1.65,.07,.16,1.55,.11,.079,lining),
      beam(-.24,1.06,0,-.13,.66,.19,.16,coat),beam(.24,1.06,0,.13,.66,.19,.16,coat));
    const n=node(root,shape,0,.19,5.42);n.rotation.y=Math.PI*.5;n.visible=false;
    let next=0, start=0;
    return (now,calm)=>{
      if(now>=next || now<next-61000){
        const d=new Date(now);d.setHours(21,21,0,0);start=d.getTime();
        next=now+60000;
      }
      const s=(now-start)/1000;
      n.visible=s>=0 && s<42;
      if(n.visible){n.position.x=calm?2:-7.4+14.8*s/42;n.position.y=.17+(calm?0:.025*Math.cos(s*4));}
    };
  };
  const weather=(root,lite)=>{
    // A few banks of snow beyond the terrace rail, all flakes in each bank share a single mesh.
    const random=BL.math.mulberry32(7721), banks=[], flecks=[];
    for(let i=0;i<(lite?15:46);i++){
      const size=.019+random()*.036;
      flecks.push(box(random()*13,random()*7,(random()-.5)*45,size,size*1.3,size,"#d8e4eb",.55));
    }
    const g=M.merge(...flecks);g.castShadow=false;
    for(let i=0;i<3;i++)banks.push(node(root,g,53,0,0));
    const fog=turn(0,0,0,[[0,-.07],[.12,-.035],[.15,.018],[.089,.069],[0,.083]],"#becbd4",7,.28);
    fog.smokeOpacity=.19;fog.castShadow=false;
    const breath=node(root,fog);breath.visible=false;
    let cycle=-1,bx=0,by=0,bz=0,dx=0,dz=0;
    return (time,calm,salon,actor)=>{
      for(let i=0;i<banks.length;i++){
        const b=banks[i];b.visible=!calm && (salon<0 || salon===2);
        b.position.y=15-(time*.48+i*7)%21;b.position.z=Math.sin(time*.12+i)*1.3;b.position.x=54+i*3;
      }
      breath.visible=false;
      if(salon!==1 || calm || !actor){cycle=-1;return;}
      const beat=Math.floor(time/4.4),u=(time/4.4-beat)*3.3;
      if(u>=1)return;
      if(beat!==cycle){
        cycle=beat;const p=actor.root.position,yaw=actor.root.rotation.y;
        dx=Math.sin(yaw);dz=Math.cos(yaw);bx=p.x+dx*.24;bz=p.z+dz*.24;by=p.y-actor.baseY+actor.traits.height*.83;
      }
      breath.visible=true;breath.smokeOpacity=.26*(1-u);breath.scale.x=breath.scale.z=.46+u*1.35;breath.scale.y=.4+u;
      breath.position.x=bx+dx*u*.67;breath.position.z=bz+dz*u*.67;breath.position.y=by+u*.21;
    };
  };
  const fixtures=[{x:booth.x,z:booth.z,hx:2.06,hz:.32},{x:booth.x,z:booth.z+3.52,hx:.45,hz:.47},
    {x:wall.x,z:wall.z,hx:2.74,hz:.29}];
  BL.pokerClub=Object.freeze({booth,wall,fixtures,portraitCourt,roof,fameWall,word,line,nightWalk,weather});
})();
