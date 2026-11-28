// Movable objects in the private marble lounge. Layout is in room-local coordinates.
(() => {
  "use strict";
  const BL=window.BL,M=BL.models,S=BL.scene;
  const walnut="#55382f",brass="#be965c",paper="#d8bf91",ink="#222127";
  const box=(x,y,z,w,h,d,color)=>M.box({w,h,d,color,emissive:.34,offset:{x,y,z}});
  const disc=(x,y,z,r,h,color)=>M.moved(M.lathe({profile:[[0,0],[r,0],[r,h],[0,h]],segments:24,color,emissive:.32}),x,y,z);
  const add=(parent,geometry,x=0,y=0,z=0)=>{
    const n=S.createNode({geometry,position:{x,y,z}});S.addChild(parent,n);return n;
  };
  const createSteps=function* (room,r,lite,solids,blanket,slice,windowLight){
    const items=[],record=BL.pokerFiresideRecord.create();
    const item=(title,geometry,x,y,z,open,footprint=null)=>{
      const node=add(room,geometry,x,y,z);
      items.push({title,node,open,footprint});return node;
    };
    const deck=item("Fireside record",M.merge(box(0,.065,0,.79,.13,.57,walnut),
      box(0,.14,0,.76,.02,.54,brass),box(0,.157,0,.735,.022,.524,walnut),
      box(.24,.30,-.20,.24,.27,.023,paper),box(.24,.24,-.185,.24,.029,.009,"#965e44"),
      box(.24,.365,-.185,.11,.009,.008,ink)), -BL.pokerLoungeStone.sideTableX,BL.pokerLoungeStone.sideTableTop,BL.pokerLoungeStone.sideTableZ(r),record.open);
    deck.scale.x=deck.scale.y=deck.scale.z=.70;
    const vinyl=add(deck,M.merge(disc(0,0,0,.218,.018,ink),disc(0,.019,0,.069,.005,"#af7454"),
      disc(0,.024,0,.009,.016,brass),box(.038,.026,0,.017,.003,.036,paper),
      ...[.11,.15,.19].map(rad=>M.moved(M.torus(rad,.0025,"#746f6c",.42,24,3),0,.018,0))),-.098,.169,0);
    const arm=add(deck,M.merge(disc(0,0,0,.029,.065,brass),M.beam(0,.065,0,-.03,.05,.25,.017,brass,.48),
      box(-.03,.043,.25,.034,.026,.04,ink)),.18,.168,-.16);
    const kit={item,add,box,disc,walnut,brass,paper,ink,windowLight};
    const updateBridge=BL.pokerLoungeFamily.install(room,r,kit,items,blanket);
    const updateCats=BL.pokerLoungeCats.create(room,r);
    const updateBird=BL.pokerLoungeHummingbird.create(room,r);
    let cathedral;
    try{cathedral=yield* BL.pokerCathedral.installSteps(room,r,kit,lite,items,solids,slice);}
    finally{if(!cathedral)record.dispose();}
    const dialog=document.createElement("dialog");dialog.className="modal lounge-heirloom";
    document.body.append(dialog);
    const element=(tag,text)=>{
      const el=document.createElement(tag);if(text!==undefined)el.textContent=text;dialog.append(el);return el;
    };
    const ui={element,button(label,action){const btn=element("button",label);btn.type="button";btn.onclick=action;return btn;},
      status(){const p=element("p");p.setAttribute("role","status");return p;}};
    let active=null,visitor=null;
    const open=(prop,pilot)=>{
      if(dialog.open)return;
      visitor=pilot;visitor.setActive(false);active=prop;dialog.replaceChildren();dialog.setAttribute("aria-label",prop.title);
      element("h2",prop.title);prop.open(ui);ui.button("Close",()=>dialog.close());
      if(document.pointerLockElement)document.exitPointerLock();dialog.showModal();
    };
    const restore=()=>{
      active=null;record.hide();
      if(visitor){visitor.setActive(true);visitor=null;}
    };
    dialog.addEventListener("close",()=>{if(!dialog.open)restore();});
    dialog.addEventListener("keydown",e=>e.stopPropagation());
    const distance=(p,prop)=>{
      const v=prop.anchor || prop.node.position,f=prop.footprint;
      const dx=Math.abs(r.x+v.x-p.x),dz=Math.abs(r.z+v.z-p.z);
      return f?Math.hypot(Math.max(0,dx-f.w),Math.max(0,dz-f.d)):Math.hypot(dx,dz);
    };
    const near=(p,max=1.75)=>{
      let best=null;
      for(const prop of items){
        const d=distance(p,prop);
        if(d<=max && d<=(prop.reach??max)){best=prop;max=d;}
      }
      return best;
    };
    const away=()=>{updateBridge(1,true,true);if(dialog.open)dialog.close();restore();record.stop();};
    return {items,open,near,distance,away,hummingbird:updateBird,sway:cathedral.sway,hollowLights:cathedral.hollowLights,treeOccluders:cathedral.treeOccluders,view:cathedral.view,block:cathedral.block,get modal(){return dialog.open;},update(dt,calm,quality,visitorPosition,audio){
      updateBird(dt,calm);
      updateCats(dt,calm,visitorPosition,updateBird.position);
      updateBridge(dt,calm);
      cathedral.update(dt,calm,quality,audio);
      const on=record.playing,ease=calm?1:Math.min(1,dt*7);
      arm.rotation.y+=((on?-.75:.2)-arm.rotation.y)*ease;
      arm.rotation.x+=((on?.07:-.11)-arm.rotation.x)*ease;
      if(on && !calm)vinyl.rotation.y=(vinyl.rotation.y+dt*3.49)%(2*Math.PI);
    },dispose(){away();record.dispose();dialog.remove();}};
  };
  BL.pokerLoungeHeirlooms={createSteps};
})();
