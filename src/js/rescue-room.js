// VAC 1: Free Puppies Rescue, a whitewashed kennel hall with a fenced grass yard, beds, toys, a pen and a vet's corner,
// within the existing interior contract.
(() => {
  "use strict";
  const BL=window.BL,S=BL.scene,{block}=BL.dsbModels,{prop}=BL.rescueModels;
  // Six dog houses along the back, a puppy's waiting spot in front of each (x, z, heading), the bowls between.
  const KENNELS=[-6.5,-3.9,-1.3,1.3,3.9,6.5],BOWLS=[[-5.2,-4.2,0],[-2.6,-4.2,1],[0,-4.2,0],[2.6,-4.2,1],[5.2,-4.2,0]];
  // The yard as the dogs see it: its floor and middle, the spots the puppies wait on, how far one wanders, the way out.
  const YARD=Object.freeze({x:0,y:0,z:-4.8,spots:new Float32Array(KENNELS.flatMap(x=>[x,-5.6,0])),wander:.9,door:[0,9.4]});
  // Picks are by sphere: a unit box gives a target its centre.
  const PICK={verts:[-.5,-.5,-.5,.5,.5,.5],faces:[],lines:[]};
  const build=()=>{
    const root=S.createNode({visible:false}),solids=[],fixtures=[];
    const C={wall:"#efe6d4",trim:"#2f6aa0",wood:"#8a5a32",cream:"#fff4df",gold:"#f2c14e",ink:"#2a1d17"};
    const label=(p,t,x,y,z,size=.3,c=C.cream)=>{const n=BL.dsbModels.sign(p,t,x,y,z,size,c);n.depthBias=-.2;return n;};
    const solid=(x,z,w,d)=>solids.push([x-w/2,x+w/2,z-d/2,z+d/2]);
    const plant=(x,z)=>{const n=S.createNode({geometry:BL.dressing.withoutRulers("planter"),position:{x,y:0,z}});S.addChild(root,n);solid(x,z,.7,.7);fixtures.push({node:n,floor:0,kind:"plant"});};
    // Floor/ceiling are segmented for the software renderer and mobile culling: terracotta at the front, grass in the yard.
    for(let x=-8;x<=8;x+=2)for(let z=-9;z<=9;z+=2){const yard=z<-1;block(root,yard?((x+z)%4?"#7fae55":"#77a64f"):((x+z)%4?"#c9825a":"#bf7752"),x,-.08,z,1.985,.16,1.985);block(root,"#e9e1d0",x,5,z,2,.14,2);}
    for(const x of [-9,9])for(let z=-8.5;z<10;z+=3)block(root,C.wall,x,2.5,z,.3,5,3);
    for(let x=-7.5;x<9;x+=3)block(root,C.wall,x,2.5,-10,3,5,.3);
    for(const x of [-5.5,5.5])block(root,C.wall,x,2.5,10,7,5,.3);block(root,C.wall,0,4,10,4,2,.3);
    // A blue band round the walls at hand height, timber beams under the ceiling.
    for(const x of [-8.82,8.82])block(root,C.trim,x,1,0,.05,.14,19.6);block(root,C.trim,0,1,-9.82,17.6,.14,.05);
    for(const z of [-7,-2,3,8])block(root,C.wood,0,4.8,z,17.8,.24,.26);
    const exitDoor=block(root,"#2f6aa0",0,1.5,9.82,2.8,3,.16);const exitLabel=label(root,"CHORA",0,3.25,9.6,.33,C.gold);exitLabel.rotation.y=Math.PI;
    // The island's goal over the dog houses: its count is a second line the scene rewrites as Oogas get their dogs.
    block(root,C.wood,0,3.55,-9.78,8.4,1.6,.1);block(root,C.trim,0,3.55,-9.72,8.1,1.36,.04);
    label(root,"EVERY OOGA NEEDS A DOG",0,3.75,-9.68,.42,C.cream);
    const goal=label(root,"0 / 0 OOGAS HAVE A DOG",0,3.12,-9.68,.3,C.gold);
    // Dog houses, a waiting puppy's spot before each, food (0) and water (1) bowls between them.
    KENNELS.forEach((x,i)=>{const n=prop(root,"kennel",x,0,-8.2,i);fixtures.push({node:n,floor:0,kind:"kennel"});solid(x,-8.2,1.5,1.5);});
    for(const [x,z,v] of BOWLS)fixtures.push({node:prop(root,"bowl",x,0,z,v),floor:0,kind:"bowl"});
    prop(root,"bone",-7.6,0,-3.4,0,.6);prop(root,"bone",7.2,0,-2.9,0,-.4);
    // The adoption desk by the door, its sign hung over it.
    const desk=S.createNode({position:{x:5.6,y:0,z:4.2}});S.addChild(root,desk);
    block(desk,C.wood,0,.5,0,3.2,1,1.1);block(desk,C.cream,0,1.04,0,3.36,.08,1.24);block(desk,C.trim,0,.5,.56,3,.18,.02);
    for(const x of [-1.5,1.5])block(desk,C.wood,x,2.6,0,.08,2,.08);const screen=block(desk,C.trim,0,3.25,0,3.1,.62,.1);label(desk,"ADOPT A PUPPY",0,3.12,.07,.3,C.cream);
    solid(5.6,4.2,3.2,1.1);fixtures.push({node:desk,floor:0,kind:"desk"});
    // Travel crates and a bench along the left wall, planters by the door.
    for(const z of [1.2,3])prop(root,"crate",-8.1,0,z,0,Math.PI/2);solid(-8.1,2.1,.8,3);
    block(root,C.wood,-7.9,.45,6.4,.8,.1,2.6);for(const z of [5.3,7.5])block(root,C.wood,-7.9,.22,z,.7,.44,.12);solid(-7.9,6.4,.8,2.6);
    plant(-3.2,8.8);plant(3.2,8.8);plant(8.2,-2.4);plant(-8.2,-2.4);plant(-8.2,8.6);
    // The yard's picket fence, open in the middle where the paw prints from the door lead through.
    for(const x of [-5.5,5.5]){prop(root,"fence",x,0,-1.2,6.6);solid(x,-1.2,6.6,.12);}
    prop(root,"paws",0,0,0);
    // The puppies' pen, two of them asleep in it with a ball; beds and a basket by the wall, one more asleep in each
    // of two. Sleepers are scenery: the dogs that wait to be adopted stand at the dog houses.
    prop(root,"pen",-4.8,0,2);solid(-4.8,2,2.1,2.1);
    const sleepers=[[-5.15,1.75,0,.5],[-4.35,2.35,3,-2.2]];
    for(const [x,z,k,a] of sleepers)prop(root,"sleeper",x,0,z,k,a);prop(root,"ball",-4.35,0,1.5,1);
    for(const [kind,x,z,v,pup] of [["bed",-6.7,0,0,5],["bed",-2.6,4.8,1,-1],["basket",-6.4,6.5,2,1],["bed",3.9,-2.6,3,-1]]){
      prop(root,kind,x,0,z,v);solid(x,z,.9,.9);
      if(pup>=0){sleepers.push([x,z,pup]);prop(root,"sleeper",x+.04,kind==="bed"?.12:.1,z,pup,.8);}
    }
    for(const [x,z,v] of sleepers)label(root,"z Z",x,.62,z,.1,C.cream);
    // Toys about the floor.
    for(const [kind,x,z,v,a] of [["ball",-1.7,-2.9,0,0],["ball",3.6,-6.6,2,0],["ball",-3.4,6.4,3,0],["rope",1.9,-2.5,1,.6],["rope",-2.2,2.6,2,-.4],["bone",5.6,-2.4,0,1.2]])prop(root,kind,x,0,z,v,a);
    // Food: sacks of kibble in the corner by the desk and a row of bowls along the front wall.
    prop(root,"sacks",8.1,0,6.4,0,-Math.PI/2);solid(8.1,6.4,1,1.4);
    prop(root,"bowl-row",7,0,9.3,0,Math.PI);solid(7,9.3,1.9,.5);
    // The vet's corner: the table, a cabinet with a red cross on the wall and its sign.
    prop(root,"vet-table",7.6,0,.5);solid(7.6,.5,.8,1.4);
    prop(root,"vet-cabinet",8.83,1.8,.5,0,-Math.PI/2);label(root,"VET",8.8,2.9,.5,.3,C.trim).rotation.y=-Math.PI/2;
    // Posters on the walls.
    for(const [x,y,z,yaw,lines] of [[-8.83,2.55,2.1,Math.PI/2,["ADOPT,","DON'T SHOP"]],[-8.83,2.55,6.4,Math.PI/2,["EVERY DOG","DESERVES","A HOME"]],[-5.6,2.6,9.83,Math.PI,["ADOPT ME!"]]]){
      const w=lines.reduce((m,t)=>Math.max(m,t.length),0)*.13+.36,h=lines.length*.32+.24;
      block(root,C.trim,x,y,z,Math.abs(Math.sin(yaw))*.03+Math.abs(Math.cos(yaw))*w,h,Math.abs(Math.cos(yaw))*.03+Math.abs(Math.sin(yaw))*w);
      lines.forEach((t,k)=>{const n=label(root,t,x+Math.sin(yaw)*.03,y+h/2-.35-k*.32,z+Math.cos(yaw)*.03,.2,k?C.gold:C.cream);n.rotation.y=yaw;});
    }
    // Warm pendant lamps between the beams; the light itself is the five point lights below.
    for(const [x,z] of [[-5,-5.2],[5,-5.2],[-4.5,.6],[4.5,.6],[-2.5,5.6],[2.5,5.6]])prop(root,"pendant",x,4.93,z);
    const zone=BL.dsbMenuZones.zone,menuZones=[zone("adopt","Adopt a puppy",0,-5.8,8.4,2.6,3),zone("adopt","Adopt a puppy",5.6,2.9,2.3,1.6,3),zone("feed","Feed your dog",0,-4.2,6.6,.5,4)];
    const reviews={
      "rescue-entrance":{position:{x:0,y:0,z:7.6},yaw:0,pitch:.06,dist:3},
      "rescue-yard":{position:{x:0,y:0,z:-2.6},yaw:0,pitch:.16,dist:4},
      "rescue-kennels":{position:{x:-2.6,y:0,z:-3.4},yaw:.25,pitch:.08,dist:3},
      "rescue-desk":{position:{x:4.6,y:0,z:2.6},yaw:-.35,pitch:.08,dist:3},
      "rescue-wide":{position:{x:0,y:0,z:6.4},yaw:0,pitch:.22,dist:4.4}
    };
    const lighting={clear:[.06,.05,.04],sky:[.62,.58,.5],ground:[.42,.36,.28],direct:[1,.92,.78],directStrength:.42,ambientFloor:.5,sun:{x:.3,y:.9,z:.25},shadowCenter:{x:0,y:2.5,z:0},shadowExtent:15,shadowStrength:.16,bloomStrength:.2,fog:[.06,.05,.04],fogNear:40,fogFar:80,lights:new Float32Array([0,4.4,-6.5,11,1,.86,.62,0,-6,4.4,0,9,1,.84,.6,0,6,4.4,0,9,1,.84,.6,0,5.6,4.2,4.2,8,1,.8,.55,0,0,4.4,7.5,9,1,.86,.64,0]),lightCount:5};
    const setGoal=text=>{goal.geometry=BL.dsbModels.text(text,C.gold);};
    return {id:"puppy-rescue",root,lighting,exitDoor,screen,goal,setGoal,solids,seats:[],reviews,menuZones,fixtures,yard:YARD,counts:{kennels:KENNELS.length,bowls:BOWLS.length,lights:5,beds:4,sleepers:4},dimensions:{width:18,depth:20,height:5},groundAt:()=>0,ceiling:4.93,spawnYaw:0,followDistance:3,spawn:{x:0,y:0,z:7.6},exit:{x:0,y:0,z:9},bounds:{minX:-8.7,maxX:8.7,minZ:-9.7,maxZ:9.7},browseGoals:Object.values(reviews).map(r=>r.position)};
  };
  // Outside: the lower Chora's lane where the strays nearest the rescue have their homes, and the Chora from above with
  // the strays all over it.
  const VIEWS={"rescue-strays":{yaw:.35,pitch:.5,dist:12,target:{x:20.3,y:4.3,z:44.1}},"rescue-island":{yaw:.4,pitch:.5,dist:24,target:{x:16,y:4.5,z:50}}};
  BL.rescueRoom={build,KENNELS,BOWLS,YARD,PICK,VIEWS};
})();
