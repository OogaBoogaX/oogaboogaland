// Free Hardware Wallets' vending machine: two devices as pictures and names alone, and Take. Nothing more is said.
(() => {
  "use strict";
  const BL=window.BL,PX=4;
  // Portraits in the walletBombs.LOOKS order, one character an ink.
  const FACES=[
    {ink:{a:"#ff8a1f",b:"#c96a14",c:"#c9ced6",d:"#121416",e:"#ff5a46"},rows:["........................","aaaaaaaaaaaaaaaaaaaa....","aaaaaaaaaaaaaaaaaaaaccc.","aadddddddddddddddddacccc","aadeeddeeedededeeedacccc","aadedededddededdeddacccc","aadeeddeeddeedddeddacccc","aadedededddededdeddacccc","aadededeeedededdeddacccc","aadddddddddddddddddaccc.","bbbbbbbbbbbbbbbbbbbb....","........................"]},
    {ink:{a:"#f6f1e4",b:"#3aa0ff",c:"#ff5ab0",d:"#121416",e:"#46ff72",f:"#ff2a2a",g:"#ff4b3a",h:"#ffd23a",i:"#46c85a",j:"#c06cff",k:"#ff8a1f"},rows:["..bb........cc..",".bbbb......cccc.",".bbaaaaaaaaaacc.","..aaddddddddaa..","..aadeeeeeedaa..","..aadeeeeeedaa..","..aaddddddddaa..","..aaaaaffaaaaa..","..aaaaffffaaaa..","..aaaaffffaaaa..","..aaaaaffaaaaa..","..aaaaaaaaaaaa..","..aaggahhabbaa..","..aaiiajjakkaa..","..aaaaaaaaaaaa..","................"]}
  ];
  const create=({onOpen=()=>{},onTake=()=>{}}={})=>{
    let root=null,picks=null,disposed=false,look=1;
    const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
    const portrait=i=>{
      const c=el("canvas"),f=FACES[i];c.width=f.rows[0].length*PX;c.height=f.rows.length*PX;const g=c.getContext("2d");
      f.rows.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(f.ink[row[x]]){g.fillStyle=f.ink[row[x]];g.fillRect(x*PX,y*PX,PX,PX);}});
      return c;
    };
    const pick=i=>{look=i;for(const b of picks.children)b.setAttribute("aria-pressed",String(Number(b.dataset.wallet)===i));};
    const close=()=>{if(!root?.open)return;root.close();BL.dsbMenuShell.present(root,false);onOpen(false);};
    const click=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.wallet!==undefined)pick(Number(b.dataset.wallet));else if(b.dataset.take!==undefined){close();onTake(look);}else if(b.dataset.close!==undefined)close();};
    const keys=e=>{e.stopPropagation();if(e.type==="keydown"&&e.key==="Escape"){e.preventDefault();close();}};
    const cancel=e=>{e.preventDefault();close();};
    const ensure=()=>{
      if(root)return;root=el("dialog",null,"wallets-menu");root.setAttribute("aria-label","Free wallets");
      const header=el("header"),title=el("div"),back=el("button","Return to store");back.type="button";back.dataset.close="";
      title.append(el("small","VAC 2 · CHORA"),el("h2","Free Wallets"));header.append(title,back);
      picks=el("div",null,"wallets-picks");picks.setAttribute("aria-label","Pick a free hardware wallet");
      // ClownCard first, as the machine shows it; each button is its picture and its name.
      for(const i of [1,0]){const b=el("button",null,"wallets-pick");b.type="button";b.dataset.wallet=String(i);b.append(portrait(i),el("b",BL.walletBombs.LOOKS[i].name));picks.append(b);}
      const take=el("button","Take","wallets-take");take.type="button";take.dataset.take="";
      const body=el("div",null,"wallets-content");body.append(picks,take);root.append(header,body);document.body.append(root);
      root.addEventListener("click",click);root.addEventListener("keydown",keys);root.addEventListener("keyup",keys);root.addEventListener("cancel",cancel);
    };
    return {close,
      open:()=>{if(disposed)return false;ensure();pick(look);if(!root.open){root.showModal();BL.dsbMenuShell.present(root,true);onOpen(true);}return true;},
      get isOpen(){return !!root?.open;},get stats(){return {open:!!root?.open,look,panels:root?1:0,disposed};},
      dispose:()=>{close();disposed=true;if(root){root.removeEventListener("click",click);root.removeEventListener("keydown",keys);root.removeEventListener("keyup",keys);root.removeEventListener("cancel",cancel);root.remove();root=picks=null;}}
    };
  };
  BL.walletsMenu={create,FACES};
})();
