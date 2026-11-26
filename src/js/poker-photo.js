// A portrait is made from the game canvas immediately after a draw, with the player's own Ooga.
(() => {
  "use strict";
  const BL=window.BL;
  const create=(camera,pilot,canvas,stand)=>{
    const at=BL.pokerClub.booth, dialog=document.createElement("dialog"), controls=document.createElement("div");
    dialog.className="den-portrait";dialog.setAttribute("aria-label","Moon portrait studio");
    controls.className="den-optics";dialog.append(controls);document.body.append(dialog);
    const button=(label,action)=>{
      const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",action);
      controls.append(b);return b;
    };
    let saved=null,pending=false,serial=0,url=null;
    const take=button("Take portrait",()=>{pending=true;take.disabled=true;});
    const download=document.createElement("a");
    download.download="ember-den-moon-portrait.png";download.textContent="Save PNG";download.hidden=true;controls.append(download);
    const release=()=>{if(url)URL.revokeObjectURL(url);url=null;download.hidden=true;download.removeAttribute("href");};
    const close=()=>{
      if(!saved)return;
      const s=saved; saved=null; serial++; pending=false; release(); stand.visible=true; dialog.close();
      pilot.setActive(true);pilot.navigate({position:s.feet,yaw:s.yaw,pitch:s.pitch,dist:s.dist});
      s.actor.root.visible=s.visible; s.actor.root.cameraHidden=s.cameraHidden;
      Object.assign(camera.position,s.eye);Object.assign(camera.target,s.look);
      camera.up=s.up;camera.orthoMix=s.mix;camera.fov=s.fov;
    };
    button("Leave booth",close);
    dialog.addEventListener("cancel",e=>{e.preventDefault();close();});
    dialog.addEventListener("keydown",e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();close();}});
    const pose=()=>{
      if(!saved)return;
      const actor=saved.actor,h=actor.traits.height || 1.7;
      actor.root.visible=true;actor.root.cameraHidden=false;
      Object.assign(camera.position,{x:at.x,y:1.42,z:at.z+4.10});
      Object.assign(camera.target,{x:at.x-.13,y:Math.min(1.63,Math.max(.96,h*.59)),z:at.z+.94});
      camera.fov=55*Math.PI/180;camera.up=null;camera.orthoMix=0;
    };
    const open=()=>{
      const actor=pilot.player;
      if(saved||!actor)return;
      const p=actor.root.position, dx=camera.position.x-camera.target.x,dy=camera.position.y-camera.target.y,dz=camera.position.z-camera.target.z;
      saved={actor,feet:{x:p.x,y:p.y-actor.baseY,z:p.z},yaw:actor.root.rotation.y-Math.PI,
        pitch:Math.atan2(dy,Math.hypot(dx,dz)),dist:Math.hypot(dx,dy,dz),visible:actor.root.visible,cameraHidden:actor.root.cameraHidden,
        eye:{...camera.position},look:{...camera.target},up:camera.up,mix:camera.orthoMix,fov:camera.fov};
      pilot.navigate({position:{x:at.x-.48,y:0,z:at.z+.97},yaw:Math.PI,pitch:.1,dist:2.4});
      stand.visible=false;pilot.setActive(false);take.disabled=false;take.textContent="Take portrait";dialog.showModal();pose();
    };
    const afterDraw=()=>{
      if(!pending||!saved)return;
      pending=false;const generation=++serial;
      canvas.toBlob(blob=>{
        if(generation!==serial||!saved)return;
        take.disabled=false;
        if(!blob){take.textContent="Retry portrait";return;}
        release();url=URL.createObjectURL(blob);download.href=url;download.hidden=false;download.focus();take.textContent="Retake portrait";
      },"image/png");
    };
    return {open,close,pose,afterDraw,get active(){return !!saved;},dispose(){close();dialog.remove();}};
  };
  BL.pokerPhoto=Object.freeze({create});
})();
