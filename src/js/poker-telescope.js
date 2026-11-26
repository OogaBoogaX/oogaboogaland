// Aim the scene camera through the refractor at the actual moving sky. The Moon shortcut solves its bearing from the mount.
(() => {
  "use strict";
  const BL=window.BL, clamp=BL.math.clamp;
  const create = (camera,pilot,rig,moon,hole) => {
    let at=rig.station;
    const dialog=document.createElement("dialog");
    dialog.className="den-eyepiece"; dialog.setAttribute("aria-label","Observatory telescope");
    const controls=document.createElement("div"), instructions=document.createElement("p"), readout=document.createElement("output");
    instructions.textContent="Drag or use the arrow keys to aim";
    controls.className="den-optics";controls.append(instructions);dialog.append(controls);document.body.append(dialog);
    let zoom=2,yaw=0,elevation=0,pointer=-1,lastX=0,lastY=0,saved;
    const bearing=(p=moon.position)=>{
      const dx=p.x-at.x,dy=p.y-at.y,dz=p.z-at.z;
      yaw=Math.atan2(dx,dz);elevation=Math.atan2(dy,Math.hypot(dx,dz));
    };
    const pose=()=>{
      rig.yaw.rotation.y=yaw;rig.pitch.rotation.x=-elevation;
      if(!dialog.open)return;
      const dx=Math.sin(yaw)*Math.cos(elevation),dy=Math.sin(elevation),dz=Math.cos(yaw)*Math.cos(elevation);
      const p=camera.position,t=camera.target;
      p.x=at.x+dx*.86;p.y=at.y+dy*.86;p.z=at.z+dz*.86;
      t.x=p.x+dx*20;t.y=p.y+dy*20;t.z=p.z+dz*20;
      camera.fov=2*Math.atan(Math.tan(55*Math.PI/360)/zoom);camera.orthoMix=0;camera.up=null;
    };
    const magnify=value=>{zoom=clamp(value,1,64);readout.value=Number(zoom.toFixed(1))+"×";pose();};
    const close=()=>{
      if(!dialog.open)return;
      dialog.close();pointer=-1;pilot.setActive(true);
      Object.assign(camera.position,saved.position);Object.assign(camera.target,saved.target);
      camera.fov=saved.fov;camera.up=saved.up;camera.orthoMix=saved.orthoMix;saved=null;
    };
    const button=(label,desc,act)=>{
      const b=document.createElement("button");b.type="button";b.textContent=label;b.setAttribute("aria-label",desc);
      b.addEventListener("click",act);controls.append(b);
    };
    button("−","Zoom out",()=>magnify(zoom/1.4));controls.append(readout);button("+","Zoom in",()=>magnify(zoom*1.4));
    button("Find Moon","Center on the Moon",()=>{bearing();pose();});
    button("Black hole","Center on the black hole",()=>{bearing(hole.center);magnify(1);});
    button("Earth","Center on Earth",()=>{bearing(hole.planet);magnify(48);});
    button("Leave","Leave telescope",close);
    const aim=(dx,dy)=>{yaw-=dx;elevation=clamp(elevation+dy,-.12,Math.PI/2-.01);pose();};
    dialog.addEventListener("pointerdown",e=>{
      if(e.target!==dialog || pointer!==-1 || e.button!==0)return;
      pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;dialog.setPointerCapture(pointer);
    });
    dialog.addEventListener("pointermove",e=>{
      if(e.pointerId!==pointer)return;
      const scale=camera.fov/Math.max(1,dialog.clientHeight);
      aim((e.clientX-lastX)*scale,(lastY-e.clientY)*scale);lastX=e.clientX;lastY=e.clientY;
    });
    dialog.addEventListener("lostpointercapture",()=>{pointer=-1;});
    dialog.addEventListener("wheel",e=>{e.preventDefault();magnify(zoom*Math.exp(-clamp(e.deltaY,-180,180)*.002));},{passive:false});
    dialog.addEventListener("cancel",e=>{e.preventDefault();close();});
    dialog.addEventListener("keydown",e=>{
      e.stopPropagation();const step=camera.fov*.048;
      switch(e.key){
        case "Escape":close();break;
        case "ArrowLeft":aim(-step,0);break;
        case "ArrowRight":aim(step,0);break;
        case "ArrowUp":aim(0,step);break;
        case "ArrowDown":aim(0,-step);break;
        case "+":case "=":magnify(zoom*1.18);break;
        case "-":magnify(zoom/1.18);break;
        default:return;
      }
      e.preventDefault();
    });
    const open=(mount=rig)=>{
      if(dialog.open)return;
      if(mount!==rig){rig=mount;at=rig.station;bearing();}
      saved={position:{...camera.position},target:{...camera.target},up:camera.up,fov:camera.fov,orthoMix:camera.orthoMix};
      pilot.setActive(false);dialog.showModal();pose();
    };
    bearing();magnify(2);
    return {open,close,pose,get active(){return dialog.open;},dispose(){close();dialog.remove();}};
  };
  BL.pokerTelescope=Object.freeze({create});
})();
