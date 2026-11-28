// One accepted block lights the three fixtures from the hourglass to the vault.
// Geometry and scratch are shared across frames. Each visitor selects their own visible detail.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, P = BL.pokerModels;
  const DURATION = 15000;
  const ramp = x => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  const reflection = M.cached(() => {
    const g = M.panel({ w: 1, h: 1, tilesX: 1, tilesY: 1, color: "#ffab50", emissive: .8 });
    g.castShadow = false;
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const pen = canvas.getContext("2d"), glow = pen.createRadialGradient(32,32,0,32,32,32);
    glow.addColorStop(0,"#ffd599"); glow.addColorStop(.32,"rgba(255,170,65,.76)");
    glow.addColorStop(.72,"rgba(246,109,24,.22)"); glow.addColorStop(1,"rgba(246,109,24,0)");
    pen.fillStyle = glow; pen.fillRect(0,0,64,64);
    g.imageSurface = { rect: [-.5,-.5,1,1], fallback: () => canvas, cutout: true, soft: true, blend: "add", bright: .24 };
    return g;
  });
  const chipEdge = M.cached(() => M.merge(P.geometry().chip, M.lathe({
    segments: 24, color: "#ffc270", emissive: .84, profile: [[.171,.036],[.171,.049],[.163,.0555]]
  })));
  const patch = (parent,x,y,z,width,length,floor = true) => {
    const n = S.createNode({geometry:reflection(),position:{x,y,z}});
    if (floor) n.rotation.x = -Math.PI/2;
    n.scale.x = width; n.scale.y = length; n.visible = false;
    S.addChild(parent,n); return n;
  };
  const intensity = (node, value) => {
    node.visible = value > .002;
    node.smokeOpacity = value;
  };
  const create = (room, shelf) => {
    const fixtures = new Float32Array(3), tables = new Float32Array(room.tables.length);
    const surfaces = room.tables.map(table => ({
      felt: patch(table.root,0,P.FELT_Y+.006,0,1.85,.94),
      rail: patch(table.root,0,P.RAIL_TOP+.003,0,.46,.065),
      brass: patch(table.pinstripe,0,P.FELT_Y+.008,0,.26,.023),
      marble: patch(room.hall.root,table.root.position.x*.66,.035,table.root.position.z,2.7,5)
    }));
    const vault = patch(room.hall.vaultDoor,0,2.35,.76,1.15,3.65,false);
    const sill = patch(shelf.target,0,.046,-2.35,.6,6.8);
    const originalChip = room.tables[0].chips[0].geometry, brightChip = chipEdge();
    let seed = 0, startTime = -Infinity, height = 0, hash = "", active = false;
    const start = (now, value) => { startTime = now; height = value; hash = ""; seed = value >>> 0; };
    const update = (now, elapsed, calm, narrow, salon, camera, watched) => {
      const age = Math.max(0, now-startTime), on = age < DURATION;
      if (!on && !active) {
        for (const n of room.sparkle) n.glow = .92 + (calm ? 0 : .12*Math.sin(elapsed*.78+n.ring*1.7+n.fixture));
        return;
      }
      active = on;
      // A socket header and a REST header can arrive in either order. Accept only this height's hash.
      if (on && !hash) {
        const socket = BL.mempool.state, chain = BL.chain.snapshot;
        hash = (socket.height === height && socket.tipHash) || (chain.height === height && chain.tipHash) || "";
        if (hash) seed = BL.math.fnv1a(hash) >>> 0;
      }
      const firstBank = seed & 1, cut = (seed >>> 1) & 3;
      const settle = ramp((DURATION-age)/(calm ? 2700 : 2100));
      for (let i = 0; i < 3; i++) {
        const delay = calm ? 0 : (2-i)*850;
        fixtures[i] = salon < 0 ? ramp((age-delay)/(calm ? 1300 : 500)) * settle : 0;
      }
      for (const n of room.sparkle) {
        const rise = calm ? 1 : ramp((age-(2-n.fixture)*850-((n.ring+cut)&3)*95)/320);
        const power = rise * fixtures[n.fixture];
        n.geometry = power > .008 ? n.amber : n.prism;
        n.glow = .92 + (calm ? 0 : .12*Math.sin(elapsed*.78+n.ring*1.7+n.fixture)) + 1.7*power;
      }
      const eye = camera.position, fx = camera.target.x-eye.x, fy = camera.target.y-eye.y, fz = camera.target.z-eye.z;
      let bestRay = -1, bestScore = -Infinity, nearest = watched, nearDistance = Infinity;
      if (narrow && on && salon < 0) {
        // Pick the lit shaft whose middle is most nearly in the view. A chair looking
        // down still gets its tabletop reflection when the whole fixture is above the screen.
        for (let i = 0; i < room.rays.length; i++) {
          const n = room.rays[i]; if (fixtures[n.fixture] < .01) continue;
          const x = n.midX-eye.x, y = n.midY-eye.y, z = n.midZ-eye.z;
          const score = (x*fx+y*fy+z*fz)/Math.max(.01,Math.hypot(x,y,z));
          if (score > bestScore) { bestScore=score; bestRay=i; }
        }
        if (watched < 0) for (let i=0;i<P.TABLES.length;i++) {
          const p=P.TABLES[i], d=(eye.x-p.x)**2+(eye.z-p.z)**2;
          if (d<nearDistance) { nearest=i; nearDistance=d; }
        }
      }
      for (let i=0;i<room.rays.length;i++) {
        const n=room.rays[i], power=fixtures[n.fixture];
        n.visible=power>.002 && (!narrow || i===bestRay);
        n.smokeOpacity=power; n.glow=1+.8*power;
      }
      for (let i=0;i<tables.length;i++) {
        const table=room.tables[i], p=P.TABLES[i], s=surfaces[i];
        const delay=calm ? 0 : (24-p.z)/48*1800 + ((i&1)===firstBank ? 100 : 500);
        const local=age-delay;
        const power=salon<0 ? ramp(local/(calm ? 1300 : 550))*settle : 0;
        tables[i]=power;
        const detail=(!narrow || i===nearest) ? power : 0;
        // The travelling highlight settles along the outer edge, clear of the dealer's board.
        const side=(i&1) ? -1 : 1, sweep=calm ? .5 : ramp(local/2400);
        const angle=(side<0 ? Math.PI : 0) + ((seed&8) ? 1 : -1)*(sweep*2.6-1.3);
        const x=Math.cos(angle), z=Math.sin(angle);
        s.rail.position.x=P.RAIL_A*x; s.rail.position.z=P.RAIL_B*z;
        s.rail.rotation.y=Math.atan2(-P.RAIL_B*x,-P.RAIL_A*z);
        s.brass.position.x=.994*x; s.brass.position.z=.994*z;
        s.brass.rotation.y=Math.atan2(-x,-z);
        s.felt.position.x=P.FELT_A*.58*x; s.felt.position.z=P.FELT_B*.54*z;
        s.marble.position.z=p.z+z*1.6; s.marble.rotation.y=side*.27;
        intensity(s.rail,detail*.96); intensity(s.brass,detail); intensity(s.felt,detail*.26); intensity(s.marble,detail*.42);
        for (const chip of table.chips) {
          const dx=chip.position.x/P.FELT_A-x*.68, dz=chip.position.z/P.FELT_B-z*.68;
          const glint=detail*ramp(1-(dx*dx+dz*dz)*1.7);
          chip.geometry=glint>.012 ? brightChip : originalChip; chip.glow=glint>.012 ? glint : 1;
        }
      }
      // The vault catches the last reflection as the table banks dim.
      const vaultLight=salon<0 ? ramp((age-(calm?0:2500))/(calm?1300:1000))*ramp((DURATION-age)/950) : 0;
      vault.position.x=calm ? 0 : ((seed&1)?1:-1)*(.75-1.5*ramp((age-11200)/3800));
      intensity(vault,.62*vaultLight);
      const aperture=Math.min(1, Math.max(0, shelf.hinge.rotation.y/1.61));
      sill.scale.x=.68*aperture; sill.position.x=(1-aperture)*-.75;
      intensity(sill,salon<=0 ? .78*ramp(age/650)*settle*aperture : 0);
    };
    return { start, update, fixtures, tables };
  };
  BL.pokerBlockLight = { create };
})();
