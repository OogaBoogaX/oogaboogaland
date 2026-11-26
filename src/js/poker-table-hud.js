// Each floor table has a matching felt, crest and seated HUD palette.
(() => {
  "use strict";
  const BL = window.BL;
  const tables = [
    ["Satoshi", "founder", "#dfbc7b"],
    ["Running Bitcoin", "terminal", "#ffbd65"],
    ["Lightning", "circuit", "#8cdcf9"],
    ["Proof of Work", "machine", "#eeb47b"],
    ["Pizza Day", "enamel", "#e7ae87"],
    ["The Halving", "solar", "#efb383"],
    ["Fee Market", "market", "#ebc072"],
    ["Twenty One Million", "assay", "#e5c58b"],
    ["Taproot", "root", "#9ddab8"],
    ["Mt. Gox", "slate", "#d9b888"]
  ];
  const TAU = 2 * Math.PI;
  function paintCrest(canvas, index) {
    const c = canvas.getContext("2d");
    c.clearRect(0,0,canvas.width,canvas.height);
    c.save();
    const scale = canvas.height / 84;
    c.translate(canvas.width/2,canvas.height/2); c.scale(scale,scale);
    c.strokeStyle = c.fillStyle = tables[index][2]; c.lineWidth = 3; c.lineJoin = c.lineCap = "round";
    const stroke = (...xy) => { c.beginPath(); c.moveTo(xy[0],xy[1]); for(let j=2;j<xy.length;j+=2)c.lineTo(xy[j],xy[j+1]); c.stroke(); };
    const circle = (x,y,r,solid=false) => { c.beginPath();c.arc(x,y,r,0,TAU); if(solid)c.fill();else c.stroke(); };
    const text = (value,size) => { c.textAlign="center";c.textBaseline="middle";c.font="bold "+size+"px monospace";c.fillText(value,0,1); };
    switch(index) {
      case 0:
        c.rotate(.32); for(let j=0;j<12;j++){c.rotate(TAU/12);stroke(-4,-23,0,-30,4,-23);}
        circle(0,0,21);circle(0,0,17);text("0",18);break;
      case 1:
        c.strokeRect(-31,-21,62,39);stroke(-15,23,15,23);text(">_",19);
        break;
      case 2:
        stroke(-28,12,-3,-20,-8,0,27,-12,3,20,8,0,-28,12);
        break;
      case 3:
        circle(0,0,28);circle(0,0,6);for(let j=0;j<6;j++){c.rotate(TAU/6);stroke(0,-7,0,-27);}
        break;
      case 4: {
        circle(0,0,26);stroke(20,-20,33,-33);
        const slices=8;
        for(let j=0;j<slices;j++){c.globalAlpha=j<5?.9:.2;c.beginPath();c.moveTo(0,0);c.arc(0,0,23,j*TAU/slices+.045,(j+1)*TAU/slices-.045);c.closePath();c.fill();}break;
      }
      case 5:
        for(const side of [-1,1]){const start=side<0?Math.PI/2:-Math.PI/2;c.globalAlpha=side<0?.45:1;c.beginPath();c.arc(side*7,0,20,start,start+Math.PI);c.closePath();c.fill();}
        for(let j=0;j<=10;j++){const a=j*Math.PI/10;stroke(27*Math.cos(a),-27*Math.sin(a),33*Math.cos(a),-33*Math.sin(a));}break;
      case 6: {
        const bars=[4,7,5,9,6], step=10;
        bars.forEach((n,j)=>{const height=2+40*n/9;c.fillRect((j-(bars.length-1)/2)*step-step/3,21-height,step*.66,height);});break;
      }
      case 7:
        stroke(-16,26,16,26,0,23,0,-25);stroke(-28,-12,28,-12);
        for(const side of [-1,1]){const x=side*25,y=-12;stroke(x,y,x-9,y+17,x+9,y+17,x,y);c.beginPath();c.arc(x,y+17,9,0,Math.PI);c.stroke();}break;
      case 8: {
        stroke(0,28,0,2);
        for(let j=0;j<5;j++){const x=(j-2)*13;c.globalAlpha=j<3?1:.25;stroke(0,4,x*.55,-4,x,-22);circle(x,-22,3,true);}break;
      }
      case 9: {
        const n=3,step=17;
        for(let j=0;j<n;j++){const x=(j-(n-1)/2)*step;c.globalAlpha=.55;stroke(x-6,-18,x+4,-7,x-4,3,x+4,18);
          c.globalAlpha=1;stroke(x-6,-4,x+6,-4);circle(x-6,-4,2,true);circle(x+6,-4,2,true);}
        break;
      }
    }
    c.restore();
  }
  function create(el) {
    const art = el.querySelector(".poker-felt"), crest = el.querySelector(".poker-crest");
    let index = -1;
    function update(next, focused) {
      if (index !== next) {
        index = next;
        el.dataset.pokerEra = tables[index][1];
        paintCrest(crest, index);
      }
      if (focused && art.dataset.index !== String(index)) {
        art.src = BL.pokerTableArt[index];
        art.dataset.index = index;
      }
    }
    return { update };
  }
  BL.pokerTableHud = { tables, create, paintCrest };
})();
