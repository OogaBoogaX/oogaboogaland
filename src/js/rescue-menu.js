// Free Puppies Rescue's adoption: six breeds as painted portraits, a name, the Ooga to give it to, and the island's goal.
(() => {
  "use strict";
  const BL=window.BL,D=BL.rescueDogs,NAME_MAX=BL.game.RESCUE.name,PX=4;
  const create=({onOpen=()=>{},onAdopt=()=>null}={})=>{
    let root=null,pups=null,name=null,owner=null,goal=null,goalText="",disposed=false,breed=0,stray=-1;
    const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
    const pick=i=>{breed=i;for(const b of pups.children)b.setAttribute("aria-pressed",String(Number(b.dataset.breed)===i));};
    // Each portrait is painted once from its pixel face in the breed's own inks.
    const portrait=i=>{
      const c=el("canvas"),face=D.FACES[i],ink=D.BREEDS[i].ink;c.width=c.height=face.length*PX;const g=c.getContext("2d");
      face.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(row[x] in D.FACE_INK){g.fillStyle=ink[D.FACE_INK[row[x]]];g.fillRect(x*PX,y*PX,PX,PX);}});
      return c;
    };
    const close=()=>{if(!root?.open)return;root.close();BL.dsbMenuShell.present(root,false);onOpen(false);};
    const adopt=()=>{if(onAdopt({breed,owner:owner.value,name:BL.donations.sanitize(name.value,NAME_MAX)||name.placeholder,stray}))close();};
    const click=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.breed!==undefined)pick(Number(b.dataset.breed));else if(b.dataset.adopt!==undefined)adopt();else if(b.dataset.close!==undefined)close();};
    const keys=e=>{e.stopPropagation();if(e.type!=="keydown")return;if(e.key==="Escape"){e.preventDefault();close();}else if(e.key==="Enter"&&e.target===name){e.preventDefault();adopt();}};
    const cancel=e=>{e.preventDefault();close();};
    const ensure=()=>{
      if(root)return;root=el("dialog",null,"rescue-menu");root.setAttribute("aria-label","Free Puppies Rescue");
      const header=el("header"),title=el("div"),back=el("button","Return to rescue");back.type="button";back.dataset.close="";
      title.append(el("small","VAC 1 · CHORA"),el("h2","Free Puppies Rescue"));header.append(title,back);
      const body=el("div",null,"rescue-content");pups=el("div",null,"rescue-pups");pups.setAttribute("aria-label","Pick a puppy");
      D.BREEDS.forEach((b,i)=>{const button=el("button",null,"rescue-pup");button.type="button";button.dataset.breed=String(i);button.append(portrait(i),el("span",b.name));pups.append(button);});
      const field=(text,input)=>{const l=el("label",null,"rescue-field");l.append(el("span",text),input);return l;};
      name=el("input");name.type="text";name.maxLength=NAME_MAX;name.autocomplete="off";name.spellcheck=false;owner=el("select");
      const go=el("button","Adopt","rescue-adopt");go.type="button";go.dataset.adopt="";goal=el("p",goalText,"rescue-goal");
      body.append(el("p","Every Ooga needs a dog! Dogs eat bananas from the pile, and they poop."),pups,field("Puppy name",name),field("Give it to",owner),go,goal);
      root.append(header,body);document.body.append(root);
      root.addEventListener("click",click);root.addEventListener("keydown",keys);root.addEventListener("keyup",keys);root.addEventListener("cancel",cancel);
    };
    return {close,
      // `owners` are the Oogas still without a dog ({ name, display }), `who` the one chosen first, `suggest` the name
      // offered for its dog, `stray` the stray the adoption was opened on (-1 for none).
      open:({breed:chosen,owners,who,suggest,stray:from=-1})=>{
        if(disposed)return false;ensure();stray=from;
        owner.replaceChildren(...owners.map(o=>Object.assign(el("option",o.display),{value:o.name})));owner.value=who;
        name.value="";name.placeholder=suggest;pick(chosen);
        if(!root.open){root.showModal();BL.dsbMenuShell.present(root,true);onOpen(true);}return true;
      },
      // The goal line is kept until the dialog is first built, so a visit that never adopts builds no dialog.
      setGoal:text=>{goalText=text;if(goal)goal.textContent=text;},
      get isOpen(){return !!root?.open;},get stats(){return {open:!!root?.open,breed,stray,owner:owner?.value||null,panels:root?1:0,disposed};},
      dispose:()=>{close();disposed=true;if(root){root.removeEventListener("click",click);root.removeEventListener("keydown",keys);root.removeEventListener("keyup",keys);root.removeEventListener("cancel",cancel);root.remove();root=pups=name=owner=goal=null;}}
    };
  };
  BL.rescueMenu={create};
})();
