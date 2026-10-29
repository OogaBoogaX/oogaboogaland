// Free Hardware Wallets' devices in DSB Land (VAC 2, `wallets-room.js`): the store's vending machine gives away six
// parody devices, each with its own silhouette and visual joke. Each is a little bomb: `FUSE` seconds after it is taken it
// explodes, whether carried, set down or thrown. The driven Ooga carries one over its head with its name and countdown
// over it, sets it down where the visitor taps the ground (`setDown`), picks a set-down one up again (tap it) and throws
// it in a short arc (the Throw button, or Y); one still held at zero blows up in its hands, knocks it back and blackens
// it with soot for a few seconds. A blast sets off every other live device within `CHAIN_RADIUS` in the same frame,
// chained, and the merged blast grows with their number (`blastOf`): it knocks the Ooga back (not one in a seat, which
// stays seated, its device on its lap) and leaves a scorch mark that fades. Nobody is hurt and nobody dies; the joke is
// that free hardware wallets are never a gift.
//
// Every device and scorch lives in one space: the Chora (0), or a room by the scene's own number. The scene says each
// frame which space the visitor stands in (`update`'s `here`); one carried goes with its Ooga, and the rest are drawn
// and picked only in their own space, so the rooms and the Chora share coordinates. One left behind keeps its fuse and
// goes off unseen and unheard, setting off only those in its own space.
//
// Fixed pools throughout: `BOMB_CAP` devices in typed arrays, one instanced batch a look (screen and LED glow ride the
// instance's glow) and one of soft glowing rings under the devices on the ground, `SCORCH_CAP` scorch marks in a ring,
// `FIREBALL_CAP` fireballs. The labels are prebuilt strings, the beep and boom two pooled synthesized voices on one
// AudioContext opened only after a gesture and suspended while no device is out (once the last boom has rung out), DSB
// is muted or the tab is hidden. The frame loop writes `instanceData` in place and allocates nothing; the overlay
// returns at once while no device is out. No camera shake (the camera moves only on input): the blast is a flash of point light,
// particles from the fx pool, smoke and the boom.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { fnv1a } = BL.math;
  const BOMB_CAP = 16, SCORCH_CAP = 24, FIREBALL_CAP = 4, FUSE = 21, COOLDOWN = 3, FIREBALL_SECONDS = 0.5;
  const CHAIN_RADIUS = 2.5, BASE_RADIUS = 2.2, BASE_POWER = 2, POWER_CAP = 8;
  // A lob from over the head carries about three and a half metres, bounce included.
  const GRAVITY = 9.8, THROW_SPEED = 3.2, THROW_LIFT = 2.6, FLASH_SECONDS = 0.35, SCORCH_SECONDS = 25;
  // The sound keeps running this long after the last device is gone, so the last boom rings out.
  const TAIL = 2.5;
  // Drawn this much larger than the models, so they read across a lane; a name shows over a device nearer the
  // driven Ooga than NAME_NEAR, and one is picked up from PICK_REACH.
  const SCALE = 1.6, NAME_NEAR = 4, PICK_REACH = 2.5;
  const FREE = 0, CARRIED = 1, FLYING = 2, DROPPED = 3;
  const STATE_NAMES = ["free", "carried", "flying", "dropped"];
  const LOOKS = [{ id: "rektdger", name: "Rektdger" }, { id: "clowncard", name: "ClownCard" },
    { id: "brickbox", name: "BrickBox02" }, { id: "passpoor", name: "Passpoor" },
    { id: "jaded", name: "Jaded" }, { id: "seedsnitcher", name: "SeedSnitcher" }];
  // Left and right casing faces, and their grip height, in each device's model space.
  const GRIPS = [[-.215,.215,.0575],[-.14,.14,.025],[-.267,.19,.0395],[-.135,.135,.027],[-.24,.24,.068],[-.26,.26,.0575]];
  const SECONDS = Array.from({ length: FUSE + 1 }, (_, i) => String(i));
  const NAMED = LOOKS.map((look) => Array.from({ length: FUSE + 1 }, (_, i) => `${look.name} ${i}`));
  // The merged blast of n devices going off together: wider by the square root, stronger by the count (capped).
  const blastOf = (n) => ({ radius: BASE_RADIUS * Math.sqrt(n), power: BASE_POWER * Math.min(n, POWER_CAP) });
  // Marks in `out` every live device the blast from `start` sets off, through every device it sets off in turn;
  // returns how many go. `live` holds 1 for a device that can still explode.
  const chainFrom = (xs, zs, live, count, start, out) => {
    out.fill(0, 0, count);
    out[start] = 1;
    let n = 1;
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < count; i++) {
        if (out[i] !== 1) continue;
        out[i] = 2;
        for (let j = 0; j < count; j++) {
          if (out[j] || !live[j]) continue;
          const dx = xs[j] - xs[i], dz = zs[j] - zs[i];
          if (dx * dx + dz * dz > CHAIN_RADIUS * CHAIN_RADIUS) continue;
          out[j] = 1;
          n++;
          grew = true;
        }
      }
    }
    return n;
  };

  // The parody looks, drawn larger than life so they read at a distance. Faces marked emissive are the screen,
  // the REKT on it, the LED and the clown nose, which blink by the instance glow.
  // Like the other builder caches here, they are dropped when the scenes that used them are left.
  const geometryOf = BL.models.variants((look) => build(look));
  const snitchPhotoGeometry = BL.models.cached(() => build(5, true));
  const passpoorScreenGeometry = BL.models.cached(() => build(3, true));
  const passpoorBalanceGeometry = BL.models.variants(balance=>{
    const text=String(-balance),parts=[],px=.014;
    [...text].forEach((ch,i)=>BL.hubModels.SIGN_GLYPHS[ch].forEach((row,r)=>[...row].forEach((on,c)=>{
      if(on==="1")parts.push(BL.models.box({color:"#4c6e5e",w:px,h:.004,d:px,emissive:1,offset:{x:(i*4+c-(text.length*4-2)/2)*px,y:.072,z:-.105+(r-2)*px}}));
    })));
    return BL.models.merge(...parts);
  });
  const jadedTrackingGeometry = BL.models.cached(() => build(4, false, true));
  const jadedEyesGeometry = BL.models.cached(() => BL.models.merge(...[-.145,-.039].map(x=>BL.models.box({color:"#17191c",w:.009,h:.004,d:.018,offset:{x,y:.153,z:-.011}}))));
  const build = (look, blankScreen = false, trackingEyes = false) => {
    const M=BL.models,parts=[],dark="#17191c",cream="#efe5cd",steel="#aeb6bd";
    const b=(color,x,y,z,w,h,d,emissive=0)=>parts.push(M.box({color,w,h,d,emissive,offset:{x,y,z}}));
    const shell=(color,w,h,d,bevel)=>parts.push(M.bevelBox({color,w,h,d,bevel,offset:{y:h/2}}));
    const pixels=(text,x,y,z,px,color)=>{
      [...text].forEach((ch,i)=>BL.hubModels.SIGN_GLYPHS[ch].forEach((row,r)=>[...row].forEach((on,c)=>{
        if(on==="1")b(color,x+(i*4+c-(text.length*4-2)/2)*px,y,z+(r-2)*px,px,.004,px,1);
      })));
    };
    if(look===0){
      // Nano S: narrow OLED, two top-edge buttons, Micro-USB socket and an opened steel swivel cover.
      shell("#e67b25",.43,.067,.134,.008);
      b(dark,.035,.071,0,.245,.008,.087);b("#15292d",.035,.078,0,.21,.006,.057,.4);
      pixels("REKT",.035,.084,0,.009,"#ff735c");
      for(const x of [-.055,.105])b(dark,x,.041,-.073,.055,.034,.016);
      b(steel,.216,.033,0,.008,.029,.055);b(dark,.222,.033,0,.005,.018,.038);
      // The swivel is one U-shaped sleeve: upper and lower plates joined around the far end.
      // Open it toward the lower edge of the screen rather than away from the device.
      const cover=M.merge(
        M.bevelBox({color:steel,w:.37,h:.012,d:.145,bevel:.005,offset:{x:.155,y:.082}}),
        M.bevelBox({color:steel,w:.37,h:.012,d:.145,bevel:.005,offset:{x:.155,y:-.015}}),
        M.box({color:steel,w:.012,h:.085,d:.135,offset:{x:.334,y:.0335}}));
      parts.push(M.moved(M.turnedY(cover,-.9),-.16,0,0));
      parts.push(M.moved(M.lathe({profile:[[0,-.024],[.039,-.024],[.039,.097],[0,.097]],segments:12,color:steel}),-.16,0,0));
      b(dark,-.16,.1,0,.033,.005,.033);
    }else if(look===1){
      // Mk5 proportions with the original clown's green screen, round red nose and chunky corner tufts.
      shell("#d7d6c9",.28,.05,.482,.008);b("#5a625d",0,.052,0,.253,.006,.453);
      b(dark,0,.059,-.126,.23,.008,.14);b("#46ff72",0,.066,-.126,.207,.006,.117,1);
      const nose=Array.from({length:13},(_,i)=>{const a=i*Math.PI/12;return [i===0||i===12?0:Math.sin(a)*.042,-Math.cos(a)*.042];});
      parts.push(M.moved(M.lathe({profile:nose,segments:20,color:"#ff2a2a",emissive:.15}),0,.105,-.058));
      const keys=["#ff4b3a","#ffd23a","#3aa0ff","#46c85a","#c06cff","#ff8a1f"];
      for(let r=0;r<4;r++)for(let c=0;c<3;c++){
        const x=(c-1)*.075,z=.012+r*.061;
        b(dark,x,.062,z,.064,.014,.056);b(keys[(r*3+c)%keys.length],x,.072,z,.052,.006,.044);
        pixels(r<3?String(r*3+c+1):c===0?"X":c===1?"0":"+",x,.078,z,.005,dark);
      }
      b(steel,0,.025,.242,.061,.026,.006);b(dark,0,.025,.247,.043,.013,.004);
      b(dark,-.142,.026,-.15,.006,.009,.066);
      for(const [x,color] of [[-.13,"#3aa0ff"],[.13,"#ff5ab0"]]){b(color,x,.07,-.225,.06,.05,.06);b(color,x*1.25,.1,-.245,.04,.04,.04);}
    }else if(look===2){
      // BitBox02: almost full-face 2:1 OLED, USB-C plug on the left and flush capacitive edges.
      shell("#ad503a",.38,.079,.21,.009);
      // The back is a miniature brick wall: shallow clay tiles with staggered mortar joints.
      b("#d6b594",0,-.0015,0,.36,.003,.186);
      const clay=["#ad503a","#bc6044","#98432f"];
      for(let r=0;r<3;r++)for(let c=0;c<5;c++){
        const left=Math.max(-.18,-.18+c*.09-(r%2)*.045),right=Math.min(.18,-.18+(c+1)*.09-(r%2)*.045);
        if(right-left<=.006)continue;
        parts.push(M.bevelBox({color:clay[(r+c)%clay.length],w:right-left-.006,h:.005,d:.056,bevel:.001,offset:{x:(left+right)/2,y:-.0045,z:(r-1)*.062}}));
      }
      b(steel,-.227,.039,0,.074,.046,.092);b(dark,-.267,.039,0,.006,.027,.064);
      b(dark,0,.083,0,.35,.006,.185);b("#142021",.012,.09,0,.286,.006,.143,.35);
      for(const z of [-.104,.104])b("#d6b594",0,.041,z,.23,.018,.004);
      for(const z of [-.098,.098])b(cream,0,.085,z,.35,.004,.004);
      for(const [x,z] of [[-.09,-.098],[.08,.098]])b(cream,x,.085,z,.004,.004,.013);
      pixels("ERROR",.012,.096,0,.013,"#ff735c");
      b(dark,.192,.037,0,.004,.008,.07);
    }else if(look===3){
      // Arctic Copper Prime: an inset side band between copper rims, white back and a top power button.
      shell("#b78169",.262,.054,.502,.012);
      for(const y of [.006,.048])parts.push(M.bevelBox({color:"#c99a84",w:.27,h:.012,d:.51,bevel:.005,offset:{y}}));
      b(dark,0,.058,0,.25,.006,.484);
      parts.push(M.bevelBox({color:"#f5f4ef",w:.25,h:.006,d:.49,bevel:.002}));
      b("#e6ecdf",0,.065,-.021,.22,.006,.373,.4);
      if(!blankScreen)pixels("0",0,.072,-.105,.014,"#4c6e5e");pixels("SATS",0,.072,-.04,.008,"#4c6e5e");
      for(const x of [-.063,0,.063])b("#a2b6a4",x,.072,.095,.046,.004,.047,.5);
      b(cream,0,.069,.214,.06,.006,.012,.5);
      parts.push(M.bevelBox({color:"#d7ad95",w:.085,h:.018,d:.012,bevel:.004,offset:{y:.028,z:-.254}}));
      parts.push(M.bevelBox({color:"#b78169",w:.065,h:.024,d:.008,bevel:.003,offset:{y:.027,z:.252}}));
      b(dark,0,.027,.258,.044,.012,.004);
      b(dark,0,-.006,-.13,.064,.004,.075);b("#516967",0,-.011,-.14,.027,.002,.027);
      b("#c6a773",.108,.071,.194,.028,.006,.064);
      for(const z of [.175,.195,.215])b("#8c7148",.108,.077,z,.016,.004,.005);
    }else if(look===4){
      // Original Jade: left-hand landscape screen, front application button and a click-wheel on the top edge.
      shell("#39785b",.48,.136,.192,.012);b(dark,-.092,.14,0,.252,.006,.153);
      b("#9dc9a6",-.092,.147,0,.232,.006,.132,.4);
      for(const x of [-.145,-.039]){b(dark,x,.153,-.024,.059,.004,.009);if(!trackingEyes)b(dark,x+.015,.153,-.011,.009,.004,.018);}
      b(dark,-.092,.153,.035,.06,.004,.008);
      b("#25533f",.104,.143,0,.078,.014,.074);b("#75ac8d",.104,.153,0,.058,.006,.054);
      const wheel=M.lathe({profile:[[0,-.042],[.027,-.042],[.027,.042],[0,.042]],segments:12,color:dark});
      parts.push(M.moved(M.turnedZ(wheel,Math.PI/2),-.025,.08,-.098));
      for(const x of [-.055,-.035,-.015,.005])b(steel,x,.08,-.124,.006,.035,.006);
      b(steel,.242,.068,0,.006,.031,.07);b(dark,.247,.068,0,.004,.018,.052);
      b(dark,.16,.064,.098,.047,.027,.006);
      b(dark,-.12,-.003,0,.055,.004,.055);
    }else{
      // SeedSigner-style orange enclosure: square display between a round joystick and three black keys.
      shell("#f47719",.52,.115,.30,.02);
      parts.push(M.bevelBox({color:"#db5e0d",w:.494,h:.01,d:.274,bevel:.004,offset:{y:.116}}));
      parts.push(M.bevelBox({color:"#ff841f",w:.482,h:.012,d:.262,bevel:.005,offset:{y:.123}}));
      b(dark,.025,.132,0,.226,.008,.234);
      pixels("SNITCH",.025,.138,-.095,.005,cream);
      if(!blankScreen)for(let r=0;r<2;r++)for(let c=0;c<2;c++){
        const x=-.023+c*.098,z=-.039+r*.093;
        b(r===0&&c===0?"#ffb21c":"#353b3e",x,.139,z,.088,.004,.083,.3);
        const ink=r===0&&c===0?dark:cream;
        pixels(r===0?(c===0?"SCAN":"SEED"):(c===0?"TOOL":"SET"),x,.144,z+.022,.004,ink);
        if(r===0&&c===0){b(ink,x,.144,z-.016,.034,.004,.016);b("#ffb21c",x,.147,z-.016,.01,.002,.01,.4);}
        else{b(ink,x,.144,z-.022,.017,.004,.017);b(ink,x,.144,z-.007,.006,.004,.023);}
      }
      const stick=M.lathe({profile:[[0,.128],[.038,.128],[.038,.139],[.03,.144],[.03,.166],[.026,.171],[0,.171]],segments:16,color:dark});
      parts.push(M.moved(stick,-.174,0,0));
      for(const z of [-.075,0,.075]){
        parts.push(M.moved(M.lathe({profile:[[0,.128],[.024,.128],[.024,.147],[.02,.152],[0,.152]],segments:12,color:dark}),.203,0,z));
        b("#dc620e",.162,.131,z,.025,.003,.006);
      }
      // Camera sits on the back instead of protruding above the display face.
      b(dark,.025,-.003,0,.055,.006,.055);b("#36515b",.025,-.008,0,.025,.004,.025);
    }
    return M.moved(M.merge(...parts),0,look===0?.024:0,0);
  };
  const scorchGeometry = BL.models.cached(() => {
    const { makeVox, voxelGeometry } = BL.models;
    const v = makeVox(), rand = BL.math.mulberry32(919);
    for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 8.6 || d > 6.5 && rand() < 0.5) continue;
      v.set(x, 0, z, d < 3 ? 0 : rand() < 0.3 ? 2 : 1);
    }
    const g = voxelGeometry(v, { unit: 1 / 16, palette: ["#141210", "#2b2724", "#3d3a36"], origin: { x: 0, y: 0, z: 0 } });
    g.castShadow = false;
    return g;
  });
  // The blast's ball of fire: a glowing voxel blob, yellow at its heart and orange outside, grown and shrunk by scale.
  const fireballGeometry = BL.models.cached(() => {
    const { makeVox, voxelGeometry } = BL.models;
    const v = makeVox(), rand = BL.math.mulberry32(733);
    for (let x = -6; x <= 5; x++) for (let y = -6; y <= 5; y++) for (let z = -6; z <= 5; z++) {
      const d = Math.hypot(x + 0.5, y + 0.5, z + 0.5);
      if (d > 6 || d > 4.8 && rand() < 0.45) continue;
      v.set(x, y, z, d < 3.5 ? 0 : rand() < 0.5 ? 1 : 2);
    }
    const g = voxelGeometry(v, { unit: 1 / 16, palette: ["#fff1b0", "#ffb02e", "#ff6a1f"], emissive: { 0: 1, 1: 1, 2: 1 } });
    g.castShadow = false;
    return g;
  });
  // One instance: rotation Ry(yaw) Rz(roll), scaled by s, at (x, y, z), with its glow.
  const writeInstance = (data, o, yaw, roll, s, x, y, z, glow) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    data[o] = cy * cr * s; data[o + 1] = sr * s; data[o + 2] = -sy * cr * s; data[o + 3] = 0;
    data[o + 4] = -cy * sr * s; data[o + 5] = cr * s; data[o + 6] = sy * sr * s; data[o + 7] = 0;
    data[o + 8] = sy * s; data[o + 9] = 0; data[o + 10] = cy * s; data[o + 11] = 0;
    data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 15] = 1;
    data[o + 16] = glow; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
  };
  // The soft ring a device on the ground glows in, so it is easy to find: device orange, lit from within.
  const haloGeometry = BL.models.cached(() => {
    const { makeVox, voxelGeometry } = BL.models;
    const v = makeVox();
    for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d >= 7.4 && d <= 9.4) v.set(x, 0, z, d > 8.5 ? 1 : 0);
    }
    const g = voxelGeometry(v, { unit: 1 / 16, palette: ["#ffb02e", "#ff8a1f"], origin: { x: 0, y: 0, z: 0 }, emissive: { 0: 0.9, 1: 0.6 } });
    g.castShadow = false;
    return g;
  });

  // `groundAt(x, z, feet)` is the floor wherever the visitor is, `bounds()` the walls of the room they are in (null
  // outside), which a thrown device bounces back off; `muted()` says whether DSB's sound is off.
  const create = ({ root, crew, fx, hud, groundAt, bounds, addTarget, removeTarget, pickGeometry, muted }) => {
    const { createNode, addChild, removeChild, updateWorld } = BL.scene;
    const batch = (geometry, cap) => createNode({ geometry, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, visible: false, fixedInstanceCapacity: true });
    const devices = LOOKS.map((look, i) => batch(geometryOf(i), BOMB_CAP));
    const halos = batch(haloGeometry(), BOMB_CAP);
    const scorches = batch(scorchGeometry(), SCORCH_CAP), fireballs = batch(fireballGeometry(), FIREBALL_CAP);
    const batches = [...devices, halos, scorches, fireballs];
    for (const node of batches) addChild(root, node);
    const fire = new Float32Array(FIREBALL_CAP * 5);
    let fireNext = 0;
    const state = new Uint8Array(BOMB_CAP), lookOf = new Uint8Array(BOMB_CAP), going = new Uint8Array(BOMB_CAP), live = new Uint8Array(BOMB_CAP), space = new Uint8Array(BOMB_CAP);
    const px = new Float32Array(BOMB_CAP), py = new Float32Array(BOMB_CAP), pz = new Float32Array(BOMB_CAP);
    const vx = new Float32Array(BOMB_CAP), vy = new Float32Array(BOMB_CAP), vz = new Float32Array(BOMB_CAP);
    const timer = new Float32Array(BOMB_CAP), yaw = new Float32Array(BOMB_CAP), roll = new Float32Array(BOMB_CAP);
    const carriers = new Array(BOMB_CAP).fill(null);
    const scorchAt = new Float32Array(SCORCH_CAP * 4), scorchAge = new Float32Array(SCORCH_CAP).fill(SCORCH_SECONDS), scorchSpace = new Uint8Array(SCORCH_CAP);
    const flash = { x: 0, y: 0, z: 0, t: 0, strength: 0 };
    const cursor = new Int32Array(LOOKS.length);
    // A temporary pose layered after the crew's animation. Restore it before the next crew step so
    // walking, seats, throws and disposal never inherit the fitted arm length or wrist rotation.
    const gripPose = [1,-1].map(side=>({side,arm:null,fingers:null,armQ:null,fingerQ:null,scaleY:1,poseYaw:0,poseLean:0,q:BL.math.quat.create(),finger:BL.math.quat.create()}));
    const releasePose = () => {
      for(const pose of gripPose){
        if(!pose.arm)continue;
        pose.arm.quaternion=pose.armQ;pose.arm.scale.y=pose.scaleY;pose.arm.poseYaw=pose.poseYaw;pose.arm.poseLean=pose.poseLean;
        pose.fingers.quaternion=pose.fingerQ;pose.arm=pose.fingers=null;
      }
    };
    const poseGrip = (cave,look,y,z) => {
      const grip=GRIPS[look],u=cave.traits.height/16,centre=(grip[0]+grip[1])*SCALE/2;
      for(let k=0;k<2;k++){
        const pose=gripPose[k],arm=k?cave.parts.armL:cave.parts.armR,fingers=k?cave.parts.fingersL:cave.parts.fingersR;
        pose.arm=arm;pose.fingers=fingers;pose.armQ=arm.quaternion;pose.fingerQ=fingers.quaternion;
        pose.scaleY=arm.scale.y;pose.poseYaw=arm.poseYaw;pose.poseLean=arm.poseLean;
        const dx=grip[k]*SCALE-centre-arm.position.x,dy=y+grip[2]*SCALE-arm.position.y,dz=z-arm.position.z;
        // The fingertips sit 3.5 voxels inward and 9.5 below the shoulder. Fit their contact point
        // to the casing, then rotate that vector onto the target with a shortest-arc quaternion.
        const length=Math.hypot(dx,dy,dz),ax=pose.side*3.5*u*arm.scale.x,ay=-Math.sqrt(Math.max(.0001,length*length-ax*ax));
        arm.scale.y=-ay/(9.5*u);
        const q=pose.q;q[0]=ay*dz;q[1]=-ax*dz;q[2]=ax*dy-ay*dx;q[3]=length*length+ax*dx+ay*dy;
        BL.math.quat.normalize(q);arm.quaternion=q;arm.poseYaw=arm.poseLean=0;
        BL.math.quat.fromEuler(pose.finger,0,pose.side*Math.PI/2,0);fingers.quaternion=pose.finger;
      }
    };
    let serial = 0, cooldown = 0, scorchNext = 0, blasts = 0, chained = 0, shake = 0, beepIn = 0, here = 0;
    const picks = [];
    for (let i = 0; i < BOMB_CAP; i++) {
      const node = createNode({ geometry: pickGeometry, visible: false });
      addTarget(node, { kind: "wallet", wallet: i, weaponType: "none" }, { radius: 0.4 });
      picks.push(node);
    }
    const DEBRIS = [BL.models.particleGeometry("#ff8a1f", 0.07, 1), BL.models.particleGeometry("#ffd66b", 0.06, 1), BL.models.particleGeometry("#3d3d44", 0.07, 0), BL.models.particleGeometry("#efe6cc", 0.05, 0)];
    // Sound: one beep and one boom voice, synthesized, opened after a gesture. The context runs only while a device is
    // out (and a boom rings on, TAIL seconds), DSB's sound is on and the tab is shown; otherwise it is suspended.
    let audio = null, audible = false, tail = 0, out = 0;
    const hear = (on) => {
      if (!audio || on === audible) return;
      audible = on;
      if (on) audio.ctx.resume().catch(() => {});
      else audio.ctx.suspend().catch(() => {});
    };
    const onVisibility = () => hear(!document.hidden && (out > 0 || tail > 0) && !muted());
    document.addEventListener("visibilitychange", onVisibility);
    const openAudio = () => {
      if (audio || muted() || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return !!audio;
      const ctx = new AudioContext(), master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
      const tone = ctx.createOscillator(), beep = ctx.createGain();
      tone.type = "square";
      tone.frequency.value = 1760;
      beep.gain.value = 0;
      tone.connect(beep);
      beep.connect(master);
      tone.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(), low = ctx.createBiquadFilter(), boom = ctx.createGain();
      noise.buffer = buffer;
      noise.loop = true;
      low.type = "lowpass";
      low.frequency.value = 420;
      boom.gain.value = 0;
      noise.connect(low);
      low.connect(boom);
      boom.connect(master);
      noise.start();
      audio = { ctx, beep: beep.gain, boom: boom.gain };
      audible = ctx.state === "running";
      return true;
    };
    const cue = (gain, level, attack, length) => {
      if (!openAudio() || muted() || document.hidden) return;
      hear(true);
      const t = audio.ctx.currentTime;
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(0.0001, t);
      gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack);
      gain.exponentialRampToValueAtTime(0.0001, t + length);
    };
    const slot = () => {
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] === FREE) return i;
      return -1;
    };
    const spawn = (x, y, z, look, s = DROPPED, carrier = null) => {
      const i = slot();
      if (i < 0) return -1;
      serial++;
      state[i] = s; lookOf[i] = look; timer[i] = FUSE; carriers[i] = carrier; space[i] = here;
      px[i] = x; py[i] = y; pz[i] = z; vx[i] = vy[i] = vz[i] = 0; yaw[i] = (fnv1a(`wallet/${serial}/yaw`) % 628) / 100; roll[i] = 0;
      return i;
    };
    const carried = (cave) => {
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] === CARRIED && carriers[i] === cave) return i;
      return -1;
    };
    // The device the driven Ooga holds, -1 for none; its look and whole seconds left.
    const held = () => crew.player ? carried(crew.player) : -1;
    const lookAt = (i) => lookOf[i];
    const secondsLeft = (i) => Math.ceil(timer[i]);
    // Why the driven Ooga cannot take one now, or null: one carried already, the machine still wrapping the last one,
    // or every device out.
    const refusal = () => {
      const player = crew.player;
      if (!player) return "Walk an Ooga in to take one.";
      if (carried(player) >= 0) return "Ooga already holds one. Set it down or throw it first!";
      if (cooldown > 0) return "One free wallet at a time. The next is being wrapped.";
      if (slot() < 0) return "Out of free wallets. Wait for a boom.";
      return null;
    };
    // The driven Ooga takes a device of `look` into its hands; -1 (with a toast) when refused.
    const take = (look) => {
      const why = refusal();
      if (why) {
        hud.toast(why);
        return -1;
      }
      const player = crew.player, i = spawn(0, 0, 0, look, CARRIED, player);
      cooldown = COOLDOWN;
      fx.say(player, "Free wallet! Ooga rich!", 2);
      openAudio();
      return i;
    };
    const throwFrom = (i) => {
      releasePose();
      const cave = carriers[i], h = cave.root.rotation.y;
      state[i] = FLYING; carriers[i] = null;
      vx[i] = Math.sin(h) * THROW_SPEED; vz[i] = Math.cos(h) * THROW_SPEED; vy[i] = THROW_LIFT;
      fx.say(cave, "Ooga no want. YEET!", 1.6);
    };
    const throwCarried = () => {
      const i = held();
      if (i < 0) return false;
      throwFrom(i);
      return true;
    };
    // Sets the carried device down on the ground at (x, z), where the Ooga stands by; false with none carried.
    const setDown = (x, z) => {
      const i = held();
      if (i < 0) return false;
      state[i] = DROPPED; carriers[i] = null;
      releasePose();
      px[i] = x; pz[i] = z; py[i] = groundAt(x, z, py[i] - 1); roll[i] = 0;
      fx.say(crew.player, "Ooga put it here. Tick tick.", 1.6);
      return true;
    };
    // A tap on a device on the ground within reach picks it up. False for one further off with the Ooga's hands free
    // (the scene walks it over), else with a toast of its seconds.
    const tap = (i) => {
      const player = crew.player;
      if (state[i] === DROPPED && player && carried(player) < 0) {
        const dx = px[i] - player.root.position.x, dz = pz[i] - player.root.position.z;
        if (dx * dx + dz * dz >= PICK_REACH * PICK_REACH) return false;
        state[i] = CARRIED; carriers[i] = player;
        fx.say(player, "Ooga pick up. Still ticking?", 1.8);
        return true;
      }
      hud.toast(`${LOOKS[lookOf[i]].name} · ${secondsLeft(i)} s left`);
      return false;
    };
    // Where device i lies on the ground, into `out`; null unless it is on the ground.
    const where = (i, out) => {
      if (state[i] !== DROPPED) return null;
      out.x = px[i]; out.y = py[i]; out.z = pz[i];
      return out;
    };
    // A blast from device `start` and every device in its space it sets off: one merged burst at their middle. Out of
    // the visitor's space it leaves only its scorch.
    const detonate = (start) => {
      const site = space[start], seen = site === here;
      for (let i = 0; i < BOMB_CAP; i++) live[i] = state[i] !== FREE && space[i] === site ? 1 : 0;
      const n = chainFrom(px, pz, live, BOMB_CAP, start, going);
      let x = 0, y = 0, z = 0, victim = null;
      for (let i = 0; i < BOMB_CAP; i++) {
        if (!going[i]) continue;
        x += px[i]; y += py[i]; z += pz[i];
        if (state[i] === CARRIED && !victim) { victim = carriers[i]; releasePose(); }
        state[i] = FREE; carriers[i] = null;
      }
      x /= n; y /= n; z /= n;
      const { radius, power } = blastOf(n);
      blasts++;
      if (n > 1) chained += n;
      const s = scorchNext;
      scorchNext = (scorchNext + 1) % SCORCH_CAP;
      scorchAt[s * 4] = x; scorchAt[s * 4 + 1] = (seen ? groundAt(x, z, y - 0.5) : y) + 0.012; scorchAt[s * 4 + 2] = z; scorchAt[s * 4 + 3] = Math.min(2.4, 0.45 * radius);
      scorchAge[s] = 0; scorchSpace[s] = site;
      if (!seen) return n;
      flash.x = x; flash.y = y + 0.8; flash.z = z; flash.t = FLASH_SECONDS; flash.strength = Math.min(3, 1 + n * 0.4);
      const f = fireNext * 5;
      fireNext = (fireNext + 1) % FIREBALL_CAP;
      fire[f] = x; fire[f + 1] = y + 0.35; fire[f + 2] = z; fire[f + 3] = 0; fire[f + 4] = radius;
      fx.burst(x, y + 0.2, z, Math.min(48, 14 + n * 6), DEBRIS, 3 + Math.sqrt(n));
      for (let k = 0; k < Math.min(12, 4 + n * 2); k++) fx.puff(x + (Math.random() - 0.5) * radius * 0.5, y + 0.3, z + (Math.random() - 0.5) * radius * 0.5, (Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2, 1.6 + Math.random());
      // Oogas in reach are knocked back with a hop, but for one sitting, who stays in its seat; the one holding it is
      // also blackened with soot. Nobody is hurt.
      for (const cave of crew.list) {
        if (!cave.root.visible || cave.health.stunned) continue;
        const p = cave.root.position, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
        if (d > radius && cave !== victim) continue;
        const k = cave === victim ? 1 : 1 - d / radius, away = d > 0.01 ? 1 / d : 0;
        if (!cave.camp.seat) cave.hopV = Math.max(cave.hopV, 2.4 + 2 * k);
        // Only the driven Ooga's hop carries sideways momentum (crew.js moves it).
        if (cave === crew.player && !cave.camp.seat) { cave.leap.vx = dx * away * 2.5 * k; cave.leap.vz = dz * away * 2.5 * k; }
        if (cave === victim) crew.soot(cave, 5);
        else fx.say(cave, "OOGA?!", 1.2);
      }
      if (victim) hud.toast("Rekt");
      else if (n > 1) hud.toast(`${n} free wallets went off together. BOOM!`);
      shake = 0.4;
      if (audio) { tail = TAIL; cue(audio.boom, Math.min(1, 0.55 + n * 0.12), 0.01, 1.1 + Math.min(1, n * 0.15)); }
      return n;
    };
    // `at` is the visitor's space: 0 for the Chora, else the scene's number for the room.
    const update = (dt, elapsed, at) => {
      releasePose();
      here = at;
      if (cooldown > 0) cooldown -= dt;
      if (shake > 0) shake = Math.max(0, shake - dt);
      if (tail > 0) tail = Math.max(0, tail - dt);
      cursor.fill(0);
      let nearest = Infinity, rings = 0;
      out = 0;
      for (let i = 0; i < BOMB_CAP; i++) {
        if (state[i] === FREE) continue;
        if ((timer[i] -= dt) <= 0) {
          detonate(i);
          continue;
        }
        if (state[i] === CARRIED) {
          const cave = carriers[i];
          space[i] = here;
          if (!cave.root.visible || cave.health.stunned || cave !== crew.player) {
            state[i] = FLYING; carriers[i] = null; vx[i] = vz[i] = 0; vy[i] = 1;
          } else if (cave.camp.seat) {
            // Seated, it rests on the Ooga's lap and the arms keep the seated pose.
            const p = cave.root.position, h = cave.root.rotation.y;
            px[i] = p.x + Math.sin(h) * 0.28; pz[i] = p.z + Math.cos(h) * 0.28;
            py[i] = p.y - cave.baseY + cave.bodyHeight * 0.42; yaw[i] = h + Math.PI / 2; roll[i] = 0;
          } else {
            // Fit both hands to the casing above the head; the grip changes with the device's width.
            const p = cave.root.position, h = cave.root.rotation.y, sh = Math.sin(h), ch = Math.cos(h);
            const grip=GRIPS[lookOf[i]],x=-(grip[0]+grip[1])*SCALE/2,y=cave.bodyHeight-cave.baseY+.08,z=.15*cave.traits.height;
            px[i] = p.x + ch*x + sh*z; pz[i] = p.z - sh*x + ch*z;
            py[i] = p.y + y; yaw[i] = h; roll[i] = 0;
            poseGrip(cave,lookOf[i],y,z);
          }
        }
        if (space[i] !== here) {
          if (picks[i].visible) picks[i].visible = false;
          continue;
        }
        out++;
        if (timer[i] < nearest) nearest = timer[i];
        if (state[i] === FLYING) {
          vy[i] -= GRAVITY * dt;
          px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
          roll[i] += dt * 9;
          const b = bounds();
          if (b && (px[i] < b.minX || px[i] > b.maxX)) { px[i] = px[i] < b.minX ? b.minX : b.maxX; vx[i] *= -0.4; }
          if (b && (pz[i] < b.minZ || pz[i] > b.maxZ)) { pz[i] = pz[i] < b.minZ ? b.minZ : b.maxZ; vz[i] *= -0.4; }
          const floor = groundAt(px[i], pz[i], py[i] + 0.3);
          if (py[i] <= floor && vy[i] < 0) {
            py[i] = floor;
            if (vy[i] < -3) { vy[i] *= -0.3; vx[i] *= 0.5; vz[i] *= 0.5; }
            else { state[i] = DROPPED; roll[i] = 0; }
          } else if (py[i] < -60) state[i] = FREE;
        }
        // The lights blink faster as the fuse runs down: quicker under ten seconds, frantic under five.
        const t = timer[i], rate = t < 5 ? 8 : t < 10 ? 4 : 1.5;
        const glow = Math.sin(elapsed * rate * Math.PI * 2) > 0 ? 1 : 0.25;
        const look = lookOf[i], c = cursor[look];
        writeInstance(devices[look].instanceData, c * 20, yaw[i], roll[i], SCALE, px[i], py[i], pz[i], glow);
        cursor[look] = c + 1;
        if (state[i] === DROPPED) {
          writeInstance(halos.instanceData, rings * 20, 0, 0, 1 + 0.06 * Math.sin(elapsed * rate * 2), px[i], py[i] - 0.05, pz[i], 0.6 + 0.4 * glow);
          rings++;
        }
        const pick = picks[i];
        pick.position.x = px[i]; pick.position.y = py[i] + 0.1; pick.position.z = pz[i];
        pick.visible = true;
        updateWorld(pick);
      }
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] === FREE && picks[i].visible) picks[i].visible = false;
      for (let look = 0; look < LOOKS.length; look++) {
        const node = devices[look], n = cursor[look];
        node.instanceCount = n;
        node.visible = n > 0;
        if (n) node.instanceVersion++;
      }
      halos.instanceCount = rings;
      halos.visible = rings > 0;
      if (rings) halos.instanceVersion++;
      const wantSound = (out > 0 || tail > 0) && !muted() && !document.hidden;
      // Taking the first device while muted creates no context; unmuting must still start its sound.
      if (wantSound && !audio) openAudio();
      hear(wantSound);
      // The nearest fuse beeps, in the same steps as the blinking: louder and quicker under ten seconds and under five.
      if (audible && nearest < Infinity && (beepIn -= dt) <= 0) {
        beepIn = nearest < 5 ? 0.14 : nearest < 10 ? 0.4 : 0.9;
        cue(audio.beep, nearest < 5 ? 0.45 : nearest < 10 ? 0.35 : 0.18, 0.004, 0.06);
      }
      let marks = 0;
      const data = scorches.instanceData;
      for (let s = 0; s < SCORCH_CAP; s++) {
        if (scorchAge[s] >= SCORCH_SECONDS) continue;
        scorchAge[s] += dt;
        const k = 1 - Math.max(0, scorchAge[s] - SCORCH_SECONDS * 0.6) / (SCORCH_SECONDS * 0.4);
        if (k <= 0 || scorchSpace[s] !== here) continue;
        writeInstance(data, marks * 20, s * 1.3, 0, scorchAt[s * 4 + 3] * k, scorchAt[s * 4], scorchAt[s * 4 + 1], scorchAt[s * 4 + 2], 0);
        marks++;
      }
      scorches.instanceCount = marks;
      scorches.visible = marks > 0;
      if (marks) scorches.instanceVersion++;
      if (flash.t > 0) flash.t = Math.max(0, flash.t - dt);
      let balls = 0;
      for (let k = 0; k < FIREBALL_CAP; k++) {
        const f = k * 5;
        if (!fire[f + 4]) continue;
        const t = fire[f + 3] += dt;
        if (t >= FIREBALL_SECONDS) { fire[f + 4] = 0; continue; }
        const grow = Math.min(1, t / 0.12), shrink = 1 - Math.max(0, t - 0.2) / (FIREBALL_SECONDS - 0.2);
        writeInstance(fireballs.instanceData, balls * 20, k * 1.7 + t * 2, 0, fire[f + 4] * 0.42 * grow * shrink * (1 + t), fire[f], fire[f + 1] + t * 0.8, fire[f + 2], 1.4);
        balls++;
      }
      fireballs.instanceCount = balls;
      fireballs.visible = balls > 0;
      if (balls) fireballs.instanceVersion++;
    };
    // The blast's point light while it lasts, written into `lights` at `slot` (x, y, z, radius, r, g, b, 0): false when
    // there is none. The scene gives it the slot after its own lamps.
    const flashLight = (lights, slot) => {
      if (flash.t <= 0) return false;
      const k = flash.t / FLASH_SECONDS * flash.strength, o = slot * 8;
      lights[o] = flash.x; lights[o + 1] = flash.y; lights[o + 2] = flash.z; lights[o + 3] = 9 + 3 * flash.strength;
      lights[o + 4] = 1.6 * k; lights[o + 5] = 1.0 * k; lights[o + 6] = 0.45 * k; lights[o + 7] = 0;
      return true;
    };
    // Over each device in view its seconds, white, red from ten down, with its name over the held one and over any on
    // the ground near the driven Ooga; the labels jitter a moment after a blast.
    const drawOverlay = (ctx, project) => {
      if (!out) return;
      ctx.font = "bold 18px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a0f08";
      const player = crew.player, ox = player ? player.root.position.x : 0, oz = player ? player.root.position.z : 0;
      for (let i = 0; i < BOMB_CAP; i++) {
        if (state[i] === FREE || space[i] !== here) continue;
        const pos = project(px[i], py[i] + 0.42, pz[i]);
        if (!pos) continue;
        const left = Math.ceil(timer[i]), jitter = shake > 0 ? Math.sin(shake * 90 + i) * 3 : 0;
        const dx = px[i] - ox, dz = pz[i] - oz, named = state[i] === CARRIED || player && dx * dx + dz * dz < NAME_NEAR * NAME_NEAR;
        const text = named ? NAMED[lookOf[i]][left] : SECONDS[left];
        ctx.fillStyle = left <= 10 ? "#ff4b3a" : "#f6ecd2";
        ctx.strokeText(text, pos.x + jitter, pos.y);
        ctx.fillText(text, pos.x + jitter, pos.y);
      }
      ctx.textAlign = "left";
    };
    const dispose = () => {
      releasePose();
      for (const node of batches) removeChild(root, node);
      for (const node of picks) removeTarget(node);
      fire.fill(0);
      state.fill(FREE);
      carriers.fill(null);
      picks.length = 0;
      flash.t = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      if (audio) audio.ctx.close().catch(() => {});
      audio = null; audible = false;
    };
    const stats = () => {
      let wallets = 0, inHand = 0, placed = 0, marks = 0;
      for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE) { wallets++; if (state[i] === CARRIED) inHand++; if (state[i] === DROPPED) placed++; }
      for (let s = 0; s < SCORCH_CAP; s++) if (scorchAge[s] < SCORCH_SECONDS) marks++;
      return { wallets, walletsHeld: inHand, walletsPlaced: placed, walletBlasts: blasts, walletsChained: chained, scorches: marks, fireballs: fireballs.instanceCount, walletAudio: audio ? 1 : 0, walletAudible: audible ? 1 : 0 };
    };
    const debug = {
      stats, take, refusal, throwCarried, setDown, tap, held, detonate: (i = -1) => {
        for (let k = 0; k < BOMB_CAP; k++) if (state[k] !== FREE && (i < 0 || k === i)) return detonate(k);
        return 0;
      },
      // Lays n devices on the ground in a tight cluster at (x, z) in the visitor's space, so they chain; `look` pins
      // their look (else they cycle through the catalogue). Lets the cooldown run out at once.
      spawn(n, x, z, look = -1) {
        const out = [];
        for (let k = 0; k < n; k++) {
          const a = k * 2.4, r = k ? 0.5 + 0.25 * k : 0, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
          const i = spawn(sx, groundAt(sx, sz, 50), sz, look >= 0 ? look : k % LOOKS.length);
          if (i >= 0) out.push(i);
        }
        return out;
      },
      cool() { cooldown = 0; },
      // Sets the fuse of every live device, or of `slot` alone.
      timer(seconds, slot = -1) {
        for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE && (slot < 0 || i === slot)) timer[i] = Math.max(0.01, Math.min(FUSE, seconds));
      },
      list() {
        const out = [];
        for (let i = 0; i < BOMB_CAP; i++) if (state[i] !== FREE) out.push({ slot: i, look: LOOKS[lookOf[i]].id, state: STATE_NAMES[state[i]], space: space[i], timer: timer[i], x: px[i], y: py[i], z: pz[i] });
        return out;
      },
      flash, get here() { return here; }
    };
    return { update, releasePose, drawOverlay, flashLight, get flashing() { return flash.t > 0; }, take, refusal, throwCarried, setDown, tap, where, held, lookAt, secondsLeft, stats, dispose, debug };
  };
  BL.walletBombs = { create, BOMB_CAP, SCORCH_CAP, FUSE, CHAIN_RADIUS, BASE_RADIUS, BASE_POWER, POWER_CAP, SCALE, LOOKS, geometryOf, snitchPhotoGeometry, passpoorScreenGeometry, passpoorBalanceGeometry, jadedTrackingGeometry, jadedEyesGeometry, blastOf, chainFrom };
})();
