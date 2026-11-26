// Review-only hand. The table art and interactions run locally in this gallery.
(() => {
  "use strict";
  const themes = [
    ["Satoshi","founder","#131914","#222c21","#dfbc7b","#fff0ca","Georgia,serif","2px"],
    ["Running Bitcoin","terminal","#141711","#25281d","#ffbd65","#ffe2a8","ui-monospace,monospace","0px"],
    ["Lightning","circuit","#0a1521","#152b40","#8cdcf9","#daf5ff","system-ui,sans-serif","8px"],
    ["Proof of Work","machine","#161511","#2d251e","#eeb47b","#ffe2bc","ui-monospace,monospace","2px"],
    ["Pizza Day","enamel","#1c1812","#332b21","#e7ae87","#fff0cd","Georgia,serif","14px"],
    ["The Halving","solar","#211113","#392125","#efb383","#ffe0b1","Baskerville,Georgia,serif","18px"],
    ["Fee Market","market","#0d1919","#183334","#ebc072","#ffedbb","system-ui,sans-serif","3px"],
    ["Twenty One Million","assay","#12121b","#272632","#e5c58b","#fff1d6","Baskerville,Georgia,serif","3px"],
    ["Taproot","root","#0c1b17","#1a342a","#9ddab8","#dbf9dc","Georgia,serif","13px"],
    ["Mt. Gox","slate","#14181c","#282e33","#d9b888","#f2e3cf","Georgia,serif","1px"]
  ];
  const num = Math.max(1, Math.min(10, Number(new URLSearchParams(location.search).get("table")) || 1));
  const i = Number.isInteger(num) ? num-1 : 0;
  const [name,style,ink,panel,accent,glint,title,radius] = themes[i];
  const $ = selector => document.querySelector(selector), body=document.body;
  const file=String(i+1).padStart(2,"0")+"-"+name.toLowerCase().replaceAll(".","").replaceAll(" ","-");
  body.dataset.style=style;
  for(const [key,value] of Object.entries({ink,panel,accent,glint,title,radius,art:'url("art/'+file+'.jpg")',avatar:[1,3,6,9].includes(i)?"3px":"50%"}))body.style.setProperty("--"+key,value);
  body.style.setProperty("--trim",["repeating-linear-gradient(35deg,transparent 0 9px,var(--accent) 10px 11px,transparent 12px 20px)","repeating-linear-gradient(90deg,var(--accent) 0 2px,transparent 2px 6px)","linear-gradient(90deg,transparent,var(--accent),transparent)","repeating-linear-gradient(115deg,var(--accent) 0 4px,transparent 4px 11px)","repeating-linear-gradient(45deg,#b35442 0 7px,#e6c89f 7px 14px)","linear-gradient(90deg,#a0674f 49%,var(--ink) 49% 51%,#e7bd79 51%)","repeating-linear-gradient(90deg,#a47b49 0 3px,transparent 3px 8px)","repeating-linear-gradient(90deg,var(--accent) 0 6px,transparent 6px 20px)","repeating-linear-gradient(50deg,transparent 0 6px,#81bb98 6px 8px,transparent 8px 20px)","repeating-linear-gradient(108deg,#46484a 0 18px,#b89462 18px 22px)"][i]);
  const positions=[[50,94],[24,84],[8,60],[13,29],[35,8],[65,8],[87,29],[92,60],[76,84]];
  const players=["You","Bot 3","Bot 4","Bot 5","Bot 6","","","","Bot 1"];
  const photos=[1,2,3,4,5,null,null,null,0];
  const initialLog=[["Bot 1","Calls 10"],["You","Call 5"],["Bot 3","Checks"],["Dealer","Deals the flop"]];
  let ended=false,entries=[],sizing=30;
  const dialog=$("#sheet"), content=$("#content");
  const set=(s,t)=>$(s).textContent=t;
  const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
  function button(text,click,cls=""){const b=el("button",cls,text);b.type="button";b.onclick=click;return b;}
  function openSheet(heading){set("#sheet-title",heading);content.replaceChildren();if(!dialog.open)dialog.showModal();}
  $("#close").onclick=()=>dialog.close();
  $("#switch").onclick=()=>{openSheet("Table options");const walk=el("a","","Walk the floor · return to gallery");walk.href="index.html";content.append(walk,button("Hand history",()=>{openSheet("Hand history");log(content);}));content.append(el("h3","","Switch tables"));themes.forEach(([t],j)=>{const a=el("a","",String(j+1).padStart(2,"0")+" · "+t);a.href="?table="+(j+1);content.append(a);});};
  set("h1",name);document.title=name+" · Ember Den concepts";
  set("#edition","Table "+String(i+1).padStart(2,"0")+" / Banana Club");
  const suit=c=>{
    const v=BL.pokerCards.svg(c),card=el("span","card-face");
    card.setAttribute("role","img");card.setAttribute("aria-label",BL.pokerCards.label(c));
    const suitIndex=Math.floor(c/13),large=el("span","mobile-face"+([1,2].includes(suitIndex)?" red":""));
    large.setAttribute("aria-hidden","true");
    large.append(el("b","","23456789TJQKA"[c%13]),el("i","","♣♦♥♠"[suitIndex]));
    card.append(v,large);return card;
  };
  $("#board").append(...[22,45,4].map(suit),el("i","slot"),el("i","slot"));$("#private").append(...[3,26].map(suit));
  function log(container){container.replaceChildren();for(const [who,what] of entries){const row=el("div","entry");row.append(el("i"),el("b","",who),el("span","",what));container.append(row);}}
  $("#history").onclick=()=>{openSheet("Hand history");log(content);};
  function seats(){
    const seats=$(".seats");seats.replaceChildren();
    positions.forEach(([x,y],j)=>{const person=players[j],b=button("",()=>{openSheet(person?"Seat "+(j+1)+" · "+person:"Seat "+(j+1));content.append(el("p","",person?(j===0?$("#stack").textContent:"990")+" chips · "+(j===0?(ended?"Decision recorded":"Your turn"):"In this hand"):"Open seat · Between hands you can take this chair."));},"seat "+(person?(j===0?"own":""):"open"));
      b.style.setProperty("--x",x+"%");b.style.setProperty("--y",y+"%");b.setAttribute("aria-label",(person||"Open seat")+" · Seat "+(j+1));
      if(person){const face=el("img");face.src="art/seat-"+photos[j]+".png";face.alt="";b.append(face);}else b.append(el("span","empty-mark","+"));
      const desc=el("span");desc.append(el("b","",person||"Open"),el("small","",person?(j===0?$("#stack").textContent:"990"):"Seat "+(j+1)));b.append(desc);
      const position=j===8?"D":j===0?"SB":j===1?"BB":"";
      if(position){const badge=el("span","position",position);b.append(badge);b.setAttribute("aria-label",b.getAttribute("aria-label")+" · "+({D:"dealer",SB:"small blind",BB:"big blind"})[position]);}
      if(person && j!==0){const backs=el("span","backs");backs.setAttribute("aria-hidden","true");backs.append(el("i"),el("i"));b.append(backs);}
      seats.append(b);});
  }
  const crest = $(".crest");
  BL.pokerTableHud.paintCrest(crest,i);
  body.style.setProperty("--motif",'url("'+crest.toDataURL()+'")');
  function reset(){
    ended=false;entries=initialLog.slice();set("#pot","60");set("#stack","990");set(".street","Flop");$("#decision").replaceChildren("Your turn ",el("span","","· Check for free or bet"));
    $("#fold").hidden=$("#check").hidden=false;set("#bet","Bet…");seats();log($("#log"));
  }
  function decide(action,amount=0){
    ended=true;const msg=action==="Bet"?"Bet "+amount:action;entries.push(["You",msg]);set("#decision",msg+" recorded");$("#fold").hidden=$("#check").hidden=true;set("#bet","Replay decision");
    if(amount){set("#stack",String(990-amount));set("#pot",String(60+amount));}seats();log($("#log"));
  }
  $("#fold").onclick=()=>decide("Fold");$("#check").onclick=()=>decide("Check");
  $("#bet").onclick=()=>{
    if(ended){reset();return;}openSheet("Size your bet");sizing=30;const label=el("label","","Banana chips"),input=el("input");input.type="number";input.min=10;input.max=990;input.value=sizing;label.append(input);const options=el("div","amounts"),submit=button("Bet 30",()=>{if(!input.reportValidity())return;dialog.close();decide("Bet",sizing);},"primary");
    const refresh=()=>{sizing=input.valueAsNumber;submit.disabled=!Number.isInteger(sizing)||sizing<10||sizing>990;submit.textContent=submit.disabled?"Choose 10–990":"Bet "+sizing;for(const b of options.children)b.setAttribute("aria-pressed",String(+b.value===sizing));};
    for(const [text,n] of [["Min",10],["½ pot",30],["Pot",60],["All in",990]]){const b=button(text,()=>{input.value=n;refresh();});b.value=n;options.append(b);}
    input.oninput=refresh;refresh();const bar=el("div","sheet-actions");bar.append(button("Cancel",()=>dialog.close()),submit);content.append(label,options,bar);
  };
  reset();
})();
