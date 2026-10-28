// Free Puppies Rescue's adoption for the signed-in visitor's own Ooga: six breeds as painted portraits, a name, and a
// personal line. The island panels' wooden frame, stone slab and controls sit in the shared DSB dialog shell.
(() => {
  "use strict";
  const BL=window.BL,D=BL.rescueDogs,NAME_MAX=16,PX=4;
  const create=({onOpen=()=>{},onAdopt=()=>false}={})=>{
    let root=null,pups=null,name=null,who=null,line=null,form=null,lineText="",disposed=false,breed=0,stray=-1;
    const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
    const pick=i=>{breed=i;for(const b of pups.children)b.setAttribute("aria-pressed",String(Number(b.dataset.breed)===i));};
    // Each portrait is painted once from its pixel face in the breed's own inks, at its own size.
    const portrait=i=>{
      const c=el("canvas"),face=D.FACES[i],ink=D.BREEDS[i].ink;c.width=c.height=face.length*PX;c.setAttribute("aria-hidden","true");const g=c.getContext("2d");
      face.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(row[x] in D.FACE_INK){g.fillStyle=ink[D.FACE_INK[row[x]]];g.fillRect(x*PX,y*PX,PX,PX);}});
      return c;
    };
    const close=()=>{if(!root?.open)return;root.close();BL.dsbMenuShell.present(root,false);onOpen(false);};
    const adopt=()=>{if(onAdopt({breed,name:BL.donations.sanitize(name.value,NAME_MAX)||name.placeholder,stray}))close();};
    const click=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.breed!==undefined)pick(Number(b.dataset.breed));else if(b.dataset.adopt!==undefined)adopt();else if(b.dataset.close!==undefined)close();};
    const keys=e=>{e.stopPropagation();if(e.type!=="keydown")return;if(e.key==="Escape"){e.preventDefault();close();}else if(e.key==="Enter"&&e.target===name){e.preventDefault();adopt();}};
    const cancel=e=>{e.preventDefault();close();};
    const ensure=()=>{
      if(root)return;root=el("dialog",null,"sheet-body rescue-menu");root.setAttribute("aria-label","Free Puppies Rescue");
      const panel=el("section",null,"panel"),header=el("header",null,"panel-title"),title=el("h2"),back=el("button","Back","foot-button");back.type="button";back.dataset.close="";
      title.setAttribute("aria-label","Adopt a puppy");title.append(BL.hud.signLettering("Adopt a puppy"));header.append(title,back);
      const intro=el("p","Free Puppies Rescue · Chora","help"),body=el("div",null,"slab rescue-adoption");
      pups=el("div",null,"rescue-breeds");pups.setAttribute("role","group");pups.setAttribute("aria-label","Pick a puppy");
      D.BREEDS.forEach((b,i)=>{const button=el("button",null,"foot-button rescue-breed");button.type="button";button.dataset.breed=String(i);button.append(portrait(i),el("span",b.name));pups.append(button);});
      const label=el("label",null,"field");
      name=el("input");name.type="text";name.maxLength=NAME_MAX;name.autocomplete="off";name.spellcheck=false;name.enterKeyHint="done";
      label.append(el("span","Puppy name"),name);who=el("p",null,"help");
      const go=el("button","Adopt puppy","chat-send");go.type="button";go.dataset.adopt="";line=el("p",lineText,"help rescue-note");line.setAttribute("role","status");
      form=[pups,label,who,go];body.append(el("p","Every Ooga needs a dog! Keep yours fed with bananas from the pile.","help"),pups,label,who);
      panel.append(header,intro,body,go,line);root.append(panel);document.body.append(root);
      root.addEventListener("click",click);root.addEventListener("keydown",keys);root.addEventListener("keyup",keys);root.addEventListener("cancel",cancel);
    };
    return {close,
      // `ooga` is the display name of the visitor's own Ooga, `suggest` the name offered for its dog, `stray` the stray
      // the adoption was opened on (-1 for none). `signIn` opens it without the adoption, on the personal line alone, so
      // a signed-out visitor sees it where they tapped rather than in a passing toast.
      open:({breed:chosen,ooga,suggest,stray:from=-1,signIn=false})=>{
        if(disposed)return false;ensure();stray=signIn?-1:from;
        for(const n of form)n.style.display=signIn?"none":"";
        if(!signIn){who.textContent=`For your Ooga, ${ooga}.`;name.value="";name.placeholder=suggest;pick(chosen);}
        if(!root.open){root.showModal();BL.dsbMenuShell.present(root,true);onOpen(true);}
        return true;
      },
      // The personal line is kept until the dialog is first built, so a visit that never adopts builds no dialog.
      setLine:text=>{lineText=text;if(line)line.textContent=text;},
      get isOpen(){return !!root?.open;},get stats(){return {open:!!root?.open,signIn:pups?.style.display==="none",breed,stray,ooga:who?.textContent||null,panels:root?1:0,disposed};},
      dispose:()=>{close();disposed=true;if(root){root.removeEventListener("click",click);root.removeEventListener("keydown",keys);root.removeEventListener("keyup",keys);root.removeEventListener("cancel",cancel);root.remove();root=pups=name=who=line=form=null;}}
    };
  };
  // The adopted dog's equipment button: a tap feeds it; the Ooga button's 650 ms hold sends it home.
  const createButton=({onFeed,onRelease})=>{
    const button=document.createElement("button"),face=document.createElement("canvas"),name=document.createElement("span"),events=new AbortController();
    const portrait=document.createElement("div"),hunger=document.createElement("span"),fill=document.createElement("span");
    const equipment=document.createElement("div"),readout=document.createElement("span");
    equipment.className="rescue-equipment";equipment.hidden=true;readout.className="equipment-compact";
    button.type="button";button.id="rescue-hud";button.className="rescue-hud";button.hidden=true;
    portrait.className="rescue-portrait";hunger.className="jetpack-compact-fuel rescue-hunger";fill.className="jetpack-compact-fuel-fill";
    hunger.setAttribute("role","meter");hunger.setAttribute("aria-valuemin","0");hunger.setAttribute("aria-valuemax","100");
    face.width=face.height=10;face.setAttribute("aria-hidden","true");hunger.append(fill);readout.append(hunger);portrait.append(face);button.append(portrait,readout);equipment.append(button,name);
    document.getElementById("weapon-hud").after(equipment);
    let dog=null,pointer=-1,timer=0,long=false,food=-1,level="";
    // Full when fed, empty when starving; only a changed percentage or hunger threshold touches the DOM.
    const update=()=>{
      if(!dog)return;const next=Math.round((1-dog.hunger)*100),band=dog.hunger>=D.HUNGRY?"low":dog.hunger>.3?"middle":"full";
      if(next===food&&band===level)return;food=next;level=band;
      fill.style.transform=`scaleY(${food/100})`;hunger.dataset.level=level;
      hunger.setAttribute("aria-valuenow",String(food));hunger.setAttribute("aria-valuetext",`${food}% full`);
      hunger.title=`${food}% full`;button.setAttribute("aria-label",`${button.title} · ${food}% full`);
    };
    const feed=()=>{onFeed();update();};
    const on=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
    const clear=()=>{window.clearTimeout(timer);timer=0;button.dataset.holding="false";};
    const cancel=()=>{const id=pointer;pointer=-1;clear();if(id>=0&&button.hasPointerCapture(id))button.releasePointerCapture(id);};
    on(button,"pointerdown",e=>{
      if(e.button!==0||pointer>=0||!dog)return;
      e.preventDefault();e.stopPropagation();pointer=e.pointerId;long=false;button.dataset.holding="true";
      if(e.isTrusted)button.setPointerCapture(pointer);
      timer=window.setTimeout(()=>{timer=0;long=true;button.dataset.holding="false";onRelease();},650);
    });
    on(button,"pointerup",e=>{
      if(e.pointerId!==pointer)return;e.preventDefault();e.stopPropagation();cancel();
      if(!long&&dog)feed();button.blur();
    });
    on(button,"pointercancel",cancel);on(button,"lostpointercapture",cancel);
    on(button,"click",e=>{e.stopPropagation();if(e.detail===0&&pointer<0&&!long&&dog)feed();});
    on(button,"keydown",e=>{e.stopPropagation();if(e.repeat)e.preventDefault();});
    on(button,"keyup",e=>e.stopPropagation());
    on(button,"contextmenu",e=>e.preventDefault());on(button,"blur",cancel);on(window,"blur",cancel);
    on(document,"visibilitychange",()=>{if(document.hidden)cancel();});
    return {update,
      setDog:entry=>{
        if(entry===dog)return;cancel();dog=entry;button.hidden=equipment.hidden=!dog;if(!dog)return;long=false;food=-1;
        name.textContent=dog.name;button.title=`${dog.name} · Click to feed · Hold to return to Free Puppies Rescue`;
        hunger.setAttribute("aria-label",`${dog.name}'s food remaining`);update();
        const g=face.getContext("2d"),pixels=D.FACES[dog.breed],ink=D.BREEDS[dog.breed].ink;g.clearRect(0,0,10,10);
        for(let y=0;y<pixels.length;y++)for(let x=0;x<pixels[y].length;x++)if(pixels[y][x] in D.FACE_INK){g.fillStyle=ink[D.FACE_INK[pixels[y][x]]];g.fillRect(x,y,1,1);}
      },
      dispose:()=>{cancel();events.abort();equipment.remove();dog=null;}
    };
  };
  BL.rescueMenu={create,createButton,NAME_MAX};
})();
