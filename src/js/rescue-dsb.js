// Free Puppies Rescue in DSB Land, the scene's side: the rescue's storage, the adoption, its room's desk and board, and
// the dogs (`rescue-dogs.js`). It loads with DSB Land's deferred code and `scene-dsb.js` attaches it on entry, so a
// visitor who never comes to DSB Land fetches and runs none of it, and it writes nothing until they do.
//
// Storage: a key of its own (KEY), read and validated on every visit and kept in memory while it lasts: one dog for
// each signed-in login on this browser (at most LOGINS, the oldest adoption giving way), a separate debug dog, the piles all over DSB Land
// (x, y, z each, oldest first, `POOP_CAP` of them within REACH of the middle) and the scoop count. It is written every
// SAVE_EVERY seconds while there is a dog to keep or a pile has changed, on leaving, and at once for an adoption or a
// dog going back; hunger is kept to three decimals, coordinates to the centimetre. `game.resetAll` (Right Shift+R)
// deletes the key with the island's own save.
//
// Outside debug, adoption is for the signed-in visitor's own Ooga only (`BL.net.ownCharacter`, checked with `BL.net.mayDrive` when
// adopting), one dog a login; the Ooga a signed-out visitor drives belongs to a contributor, so the desk, the dog
// houses and a stray's tap open the dialog on SIGN_IN alone. The dog is out while that login drives its own Ooga in
// DSB Land. Debug visitors may adopt for their driven Ooga without signing in, under a separate saved identity.
// Strays and scooping are everyone's.
(() => {
  "use strict";
  const BL=window.BL,D=BL.rescueDogs;
  const KEY="oogaboogaland.rescue.v1",LOGINS=16,LOGIN=/^[a-z0-9-]{1,39}$/,REACH=200,SAVE_EVERY=15;
  const SIGN_IN="Sign in to adopt a puppy.";
  const DEBUG_LOGIN="@debug"; // Cannot collide with a GitHub login or take one of its saved slots.
  const params=new URLSearchParams(location.search),DEBUG=params.has("debug");
  const isDog=d=>d&&typeof d==="object"&&typeof d.name==="string"&&d.name.length>0&&d.name.length<=BL.rescueMenu.NAME_MAX&&Number.isInteger(d.breed)&&d.breed>=0&&d.breed<D.BREEDS.length
    &&Number.isFinite(d.adoptedAt)&&Number.isFinite(d.hunger)&&d.hunger>=0&&d.hunger<=1;
  // The saved rescue with every bad part dropped alone; nothing readable, an empty one.
  const load=()=>{
    const out={dogs:{},poops:[],scooped:0};
    try{
      const saved=JSON.parse(localStorage.getItem(KEY));
      if(!saved||typeof saved!=="object")return out;
      const dogs=saved.dogs&&typeof saved.dogs==="object"&&!Array.isArray(saved.dogs)?Object.entries(saved.dogs).filter(([login,d])=>LOGIN.test(login)&&isDog(d)):[];
      for(const [login,d] of dogs.sort((a,b)=>b[1].adoptedAt-a[1].adoptedAt).slice(0,LOGINS))out.dogs[login]={name:d.name,breed:d.breed,adoptedAt:d.adoptedAt,hunger:d.hunger};
      const debug=saved.dogs?.[DEBUG_LOGIN];
      if(isDog(debug))out.dogs[DEBUG_LOGIN]={name:debug.name,breed:debug.breed,adoptedAt:debug.adoptedAt,hunger:debug.hunger};
      const p=saved.poops;
      if(Array.isArray(p)&&p.length%3===0&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=REACH))out.poops=p.slice(-D.POOP_CAP*3);
      if(Number.isFinite(saved.scooped)&&saved.scooped>=0&&saved.scooped<1e9)out.scooped=Math.floor(saved.scooped);
    }catch{/* Unreadable: an empty rescue. */}
    return out;
  };
  const save=store=>{
    const dogs={};
    for(const [login,d] of Object.entries(store.dogs))dogs[login]={name:d.name,breed:d.breed,adoptedAt:d.adoptedAt,hunger:Math.round(d.hunger*1000)/1000};
    try{localStorage.setItem(KEY,JSON.stringify({dogs,poops:store.poops,scooped:store.scooped}));}catch{/* Storage unavailable: the rescue lasts the visit. */}
  };
  // DSB Land's stray homes are the same on every visit: laid out on the first and kept for the page's life.
  let homes=null;
  // `groundAt`, `walkable` and `flyable` are the scene's own queries, `reviewed` whether a restored login view already
  // stands where a review link would put it.
  const attach=({root,crew,input,hud,fx,pilot,interiors,vacancies,land,groundAt,walkable,flyable,camera,renderer,world,reviewed})=>{
    const store=load(),DOG={bodyRadius:.3},LEVEL=BL.dsbCoast.LEVEL;
    const dry=(x,z)=>!!interiors.active||land.groundAt(x,z)>LEVEL+.05;
    const clear=(ax,az,bx,bz,y)=>dry(bx,bz)&&walkable(ax,az,bx,bz,y,.6,DOG);
    // Dry open ground with room for a dog, not up on a roof; flying, a dog keeps clear of walls, roofs and the sea.
    const standable=(x,y,z)=>dry(x,z)&&(!!interiors.active||y-land.groundAt(x,z)<.9)&&walkable(x,z,x,z,y,.6,DOG);
    const flyClear=(ax,az,bx,bz,y)=>(y>LEVEL+.25||land.groundAt(bx,bz)>LEVEL)&&flyable(ax,az,bx,bz,y,.6,DOG);
    const rescueDoor=vacancies.resolve(1).approach;
    homes||=D.homesAcross({lanes:land.lanes,groundAt:(x,z)=>groundAt(x,z),clearAt:(x,y,z)=>land.groundAt(x,z)>LEVEL+.4&&clear(x-.5,z,x+.5,z,y)&&clear(x,z-.5,x,z+.5,y),count:D.STRAY_CAP,lane:96,radius:120,seed:5281,near:[rescueDoor.x,rescueDoor.z]});
    const room=()=>interiors.active?.room.id==="puppy-rescue"?interiors.active.room:null;
    // Debug alone lends a signed-out visitor the driven Ooga; signed-in ownership still takes precedence.
    const login=()=>{const me=BL.net.state.me;return typeof me?.login==="string"?me.login.toLowerCase():DEBUG&&!me?DEBUG_LOGIN:null;};
    const ownOoga=()=>{const own=BL.net.ownCharacter(),cave=own?crew.cavemen.get(own.handle):DEBUG&&!BL.net.state.me?crew.player:null;return cave&&!BL.net.mayDrive(cave.traits.name)?cave:null;};
    let changes=0,saveTimer=0,shownFor=undefined,lastLine=null,pick=null,inRoom=null;
    const persist=()=>{dogs.writeStore();save(store);changes=dogs.changes;saveTimer=0;};
    // The visitor's own line, in the dialog and on the board over the dog houses (in sign letters, so without the name).
    const line=()=>{
      button.setDog(dogs.own);
      const who=login(),mine=who&&store.dogs[who],n=store.scooped,scooped=n?` · ${n} poop${n===1?"":"s"} scooped`:"";
      const text=!who?SIGN_IN:mine?`${mine.name} is with you${scooped}`:`A puppy is waiting for you${scooped}`;
      if(text===lastLine)return;lastLine=text;menu.setLine(text);
      interiors.rooms.get("puppy-rescue")?.setLine(!who?"SIGN IN TO ADOPT A PUPPY":mine?"YOUR DOG IS WITH YOU":"A PUPPY IS WAITING FOR YOU");
    };
    const open=(route="adopt",breed=-1,stray=-1)=>{
      if(route==="feed")return dogs.feedOwn()||true;
      const who=login(),cave=ownOoga();
      if(!who||!cave){menu.setLine(SIGN_IN);return menu.open({signIn:true});}
      if(store.dogs[who]){hud.toast(`${store.dogs[who].name} is already with you.`);return true;}
      lastLine=null;line();return menu.open({breed:breed>=0?breed:D.breedFor(cave.traits.name),ooga:cave.traits.display,suggest:D.nameFor(cave.traits.name),stray});
    };
    const adopted=({breed,name,stray})=>{
      const who=login(),cave=ownOoga();
      if(!who||!cave||store.dogs[who]){hud.toast(who&&cave?"You already have a dog.":SIGN_IN);return false;}
      const entry={name,breed,adoptedAt:Date.now(),hunger:0},logins=Object.keys(store.dogs).filter(who=>who!==DEBUG_LOGIN);
      if(who!==DEBUG_LOGIN&&logins.length>=LOGINS)delete store.dogs[logins.reduce((a,b)=>store.dogs[a].adoptedAt<=store.dogs[b].adoptedAt?a:b)];
      store.dogs[who]=entry;dogs.adopt(cave,entry,stray);shownFor=who;persist();line();
      hud.toast(`${name} the ${D.BREEDS[breed].name} now follows ${cave.traits.display}!`);return true;
    };
    const onRelease=entry=>{for(const who of Object.keys(store.dogs))if(store.dogs[who]===entry)delete store.dogs[who];persist();line();};
    const menu=BL.rescueMenu.create({onAdopt:adopted,onOpen:on=>{pilot.setActive(!on&&!interiors.transitioning);pilot.controls.reset();input.reset();crew.setWeaponTrigger(false);}});
    const dogs=D.create({root,crew,fx,hud,pile:{eat:()=>{if(world.level<1)return false;world.level=Math.max(0,world.level-1);return true;}},yard:BL.rescueRoom.YARD,door:[rescueDoor.x,rescueDoor.z],
      ground:(x,z,feet)=>groundAt(x,z,feet,undefined,DOG),standable,flyClear,addTarget:(node,owner,opts)=>input.add(node,owner,opts),removeTarget:node=>input.remove(node),pickGeometry:BL.rescueRoom.PICK,
      strays:{homes,renderer,clearSegment:clear},camera,store,onRelease});
    const button=BL.rescueMenu.createButton({onFeed:()=>dogs.feedOwn(),onRelease:()=>dogs.releaseOwn()});
    changes=dogs.changes;line();
    // The rescue's venue for the scene's menu zones and Space.
    const venue={open:route=>open(route),get isOpen(){return menu.isOpen;}};
    // Follow the account's own Ooga, or the signed-out debug visitor's driven Ooga, when either changes.
    let me,player,sleepTimer=0,sleepIndex=0;
    const follow=()=>{
      const who=login(),cave=ownOoga(),out=cave&&who&&store.dogs[who]?who:null;
      if(out!==shownFor){shownFor=out;dogs.setOwn(cave,out&&store.dogs[out]);}
      line();
    };
    const update=(dt,time,day)=>{
      if(BL.net.state.me!==me||DEBUG&&crew.player!==player){me=BL.net.state.me;player=crew.player;follow();}
      const now=room();
      if(now!==inRoom){
        inRoom=now;sleepTimer=0;sleepIndex=0;if(pick){input.remove(pick.screen);pick=null;}
        if(now){pick=now;input.add(now.screen,{kind:"rescue-desk"});lastLine=null;line();}
      }
      if(DEBUG&&!reviewed&&now&&!interiors.transitioning){
        reviewed=true;const view=params.get("view");
        if(now.reviews[view])pilot.navigate(now.reviews[view]);
        if(view==="rescue-adopt"){pilot.navigate(now.reviews["rescue-kennels"]);open();}
      }
      // The four scenery puppies sleep all day; stagger their rising Zs like the outdoor strays'.
      if(now&&!interiors.transitioning&&(sleepTimer-=dt)<=0){
        const heads=now.sleepHeads,k=sleepIndex*3;
        fx.zzzAt(heads[k],heads[k+1],heads[k+2]);
        sleepIndex=(sleepIndex+1)%(heads.length/3);sleepTimer=1.6/(heads.length/3);
      }
      dogs.update(dt,time,day,!interiors.active?D.CHORA:now?D.YARD:D.ROOM);
      button.update();
      if((saveTimer+=dt)>=SAVE_EVERY){saveTimer=0;if(dogs.own||dogs.changes!==changes)persist();}
    };
    const onTap=hit=>{
      const o=hit?.owner;
      if(o?.kind==="dog"){const breed=dogs.tap(o.dog);if(breed>=0)open("adopt",breed,o.dog);return true;}
      if(o?.kind==="poop"){if(dogs.scoop(o.poop))line();return true;}
      if(o?.kind==="rescue-desk"&&room()){open();return true;}
      return false;
    };
    const onKey=e=>{if(!menu.isOpen)return false;if(e.key==="Escape")menu.close();return true;};
    const dispose=()=>{persist();button.dispose();menu.dispose();if(pick){input.remove(pick.screen);pick=null;}dogs.dispose();};
    return {update,drawOverlay:dogs.drawOverlay,onTap,onKey,menuForRoom:r=>r?.id==="puppy-rescue"?venue:null,stats:dogs.stats,dispose,
      get isOpen(){return menu.isOpen;},debug:{get dogs(){return dogs.debug;},menu,open,store,save:persist,get line(){return lastLine;},clear,standable,flyClear,
      // An adoption as the dialog's Adopt makes it, under the same rules.
      adopt:(breed=0,name="Rex")=>adopted({breed,name,stray:-1})}};
  };
  BL.rescueDsb={attach,load,save,KEY,LOGINS,SIGN_IN};
})();
