// The Ember Den's Bitcoin showpieces. All motion shares the scene clock and a fixed set of nodes.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const BRASS = "#b8893b", LIGHT = "#e2c88d", BLACK = "#17140f", ORANGE = "#f7931a";
  const MOON_RADIUS = 26;
  const cache = M.scopedMap();
  const box = (x, y, z, w, h, d, color, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
  const turn = (profile, color, segments, emissive = 0) => M.lathe({ profile, color, segments, emissive });
  const child = (root, geometry, x = 0, y = 0, z = 0) => {
    const n = S.createNode({ geometry, position: { x, y, z } });
    S.addChild(root, n);
    return n;
  };

  // The low-resolution map keeps the crater chain visible on Canvas and while the full atlas decodes.
  // Both maps use east-positive longitude, north at the top, with the near side centred on local +z.
  const lunarSurface = (sparse, canvas) => {
    const key = "luna-" + sparse + "-" + canvas;
    if (cache.has(key)) return cache.get(key);
    const map = BL.pokerMoonMap, land = M.geometry();
    const cols = sparse ? 64 : 96, rows = cols / 2, radius = MOON_RADIUS;
    const samples = map.fallback;
    const nibble = offset => {
      const digit = samples.charCodeAt(offset);
      return digit <= 57 ? digit - 48 : (digit | 32) - 87;
    };
    const sample = (u, v, channel) => {
      const x = Math.floor(u * map.width) % map.width, y = Math.min(map.height - 1, Math.floor(v * map.height));
      const at = (y * map.width + x) * 4 + channel * 2;
      return nibble(at) * 16 + nibble(at + 1);
    };
    land.normals = [];
    // The overlapping basins interrupt the silhouette as they turn toward the limb.
    for (let j = 0; j <= rows; j++) {
      const v = j / rows, lat = Math.PI * (0.5 - v), cosLat = Math.cos(lat), y = Math.sin(lat);
      for (let i = 0; i < cols; i++) {
        const u = i / cols, lon = (u - 0.5) * Math.PI * 2;
        const r = radius - 1.6 * sample(u, v, 1) / 255;
        const x = Math.sin(lon) * cosLat, z = Math.cos(lon) * cosLat;
        M.pushVert(land, x*r, y*r, z*r);
        land.normals.push(x, y, z);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = (i + 1) % cols, a = j*cols, b = a+cols;
      const face = j === 0 ? [a+i, b+i, b+k] : j === rows-1 ? [a+i, b+i, a+k] : [a+i, b+i, b+k, a+k];
      const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
      const tone = sample(u, v, 0);
      M.face(land, face, [tone, tone, Math.min(255, tone + 3)], { emissive: 0.76 });
    }
    land.castShadow = false; land.fogPierce = 1;
    if (!canvas && typeof Image === "function") {
      const image = new Image();
      image.onload = () => { land.imageSurface = { canvas: image, version: 1, rect: [0,0,1,1], lunar: true, smooth: true }; };
      image.src = map.jpeg;
    }
    BL.pokerMarble.staticMesh(land);
    cache.set(key, land); return land;
  };
  const hangMoon = (rig, sparse, canvas) => {
    const p = rig.parts.planets.find(planet => planet.key === "giant");
    // Replace Jupiter's complete local assembly, including moons and ring bands, in this room's rig.
    for (let i=rig.parts.spins.length-1;i>=0;i--) {
      if (rig.parts.spins[i].node.parent === p.ringNode) rig.parts.spins.splice(i,1);
    }
    for (const m of p.moons) rig.parts.moons.splice(rig.parts.moons.indexOf(m),1);
    for (const n of p.node.children.slice()) S.removeChild(p.node, n);
    const frame = S.createNode(); S.addChild(p.node, frame);
    frame.rotation.y = Math.atan2(-p.dir[0], -p.dir[2]);
    frame.rotation.x = Math.asin(p.dir[1]);
    const globe = child(frame, lunarSurface(sparse, canvas));
    const hole = rig.parts.blackHole = BL.pokerBlackHole.create(rig.parts.still, MOON_RADIUS, canvas);
    const update = rig.update;
    // The original giant turned 0.05 radians per second. Its polar axis stays fixed as the marking rotates out of sight.
    rig.update = (dt, t, opts) => {
      update(dt, t, opts);
      hole.update(dt);
      globe.rotation.y = (globe.rotation.y + dt * 0.05) % (2 * Math.PI);
    };
  };

  const gallery = lite => {
    const key = lite ? "gallery-lite" : "gallery";
    if (cache.has(key)) return cache.get(key);
    const n = lite ? 16 : 32;
    const plinth = turn([[0, 0], [2.3, 0], [2.3, 0.14], [1.98, 0.24], [1.86, 0.49], [1.78, 0.56], [0, 0.56]], BLACK, n);
    const bronze = BL.pokerMarble.staticMesh(BL.pokerBull.build(lite));
    const base = M.merge(plinth, turn([[1.88, 0.41], [1.91, 0.44], [1.9, 0.48], [1.86, 0.49]], BRASS, n));
    const block = box(0, 0, 0, 1, 1, 1, ORANGE, 0.8);
    block.castShadow = false;
    // The glass channel follows both banks of the island plinth, beneath the floor's single gloss pass.
    const channel = M.merge(), edge = BL.math.hexToRgb(BRASS), bed = BL.math.hexToRgb("#0e0d0b");
    for (const sign of [-1, 1]) for (let z = -35; z < 27; z++) {
      const at = q => sign * 2.7 * Math.max(0, 1 - q * q / 28);
      const quad = (inner, outer, color, emissive = 0) => {
        const pts = [[at(z) + sign * inner, z], [at(z + 1) + sign * inner, z + 1], [at(z + 1) + sign * outer, z + 1], [at(z) + sign * outer, z]];
        const ids = pts.map(([x, q]) => M.pushVert(channel, x, 0.013, q));
        M.face(channel, sign > 0 ? ids : ids.reverse(), color, { emissive });
      };
      quad(0, 0.72, bed); quad(0.72, 0.79, edge, 0.65);
    }
    channel.castShadow = false;
    const g = { base, bronze, block, safe: BL.pokerMarble.staticMesh(BL.pokerIce.door(lite)), channel };
    cache.set(key, g); return g;
  };
  const build = lite => {
    const g = gallery(lite), root = S.createNode(), packets = [], count = lite ? 24 : 72;
    child(root, g.base);
    child(root, g.channel);
    const bandstand = BL.pokerBandstand.build(root,lite);
    const clock = BL.pokerHourglass.build(lite);
    S.addChild(root, clock.root);
    const bronze = child(root, g.bronze, 0, 0.56, 0);
    bronze.scale.x = bronze.scale.z = 1.04;
    bronze.scale.y = 1.10;
    bronze.rotation.y = -0.72;
    const vaultDoor = child(root, g.safe, 0, 0, -35.8);
    const aquarium = BL.pokerAquarium.build(lite);
    const random = BL.math.mulberry32(210000);
    for (let i = 0; i < count; i++) {
      const lane = (i % 4 - 1.5) * 0.33, size = 0.1 + random() * 0.19;
      const n = child(root, g.block);
      n.scale.x = n.scale.z = size; n.scale.y = size * 0.48;
      n.rotation.y = Math.PI / 4; n.position.y = 0.055;
      packets.push({ n, lane, spread: Math.sign(lane) * 2.7, offset: 61 * ((i + random()) / count) });
    }
    const seen=new Set(), ids=new Array(64), streaks=[];
    const streak=box(0,0,0,.042,.23,.042,"#ffe6ad",.82);streak.castShadow=false;
    for(let i=0;i<(lite?6:14);i++){const n=child(root,streak);n.visible=false;streaks.push(n);}
    let cursor=0,nextStar=0;
    const observe=rows=>{
      for(let i=Math.min(rows.length,10)-1;i>=0;i--){
        const tx=rows[i];
        if(!tx || typeof tx.txid!=="string" || !/^[0-9a-f]{64}$/i.test(tx.txid) || seen.has(tx.txid) ||
           !Number.isSafeInteger(tx.value) || tx.value<=0 || tx.value>21e14)continue;
        seen.delete(ids[cursor]);ids[cursor]=tx.txid;seen.add(tx.txid);cursor=(cursor+1)%ids.length;
        const seed=parseInt(tx.txid.slice(-8),16), s=streaks[nextStar];
        nextStar=(nextStar+1)%streaks.length;
        s.position.x=(seed%57)-28;s.position.z=(Math.floor(seed/57)%75)-37;
        s.position.y=21+(seed%11);s.rotation.z=-.32;s.visible=true;
        const p=packets[seed%count], size=.12+Math.min(.32,.037*Math.log1p(tx.value/1e5));
        p.n.scale.x=p.n.scale.z=size;p.n.scale.y=size*.48;
        aquarium.visit(tx.value);
      }
    };
    let drift = 0;
    const update = (dt, time, calm=false, floorVisible=true) => {
      aquarium.update(dt,time,calm);
      for(const s of streaks)if(s.visible){
        s.position.x-=dt*.52;s.position.y-=dt*1.72;
        if(s.position.y<16.8 || calm)s.visible=false;
      }
      const chain = BL.chain.snapshot;
      const now = Date.now();
      const fresh = chain.socketAt > 0 && now - chain.socketAt < 90000;
      drift = (drift + dt * (fresh ? 1 + chain.gale * 2 : 0.65)) % 61;
      if (!floorVisible) return;
      for (let i = 0; i < count; i++) {
        const p = packets[i], z = 27 - (drift + p.offset) % 61;
        const split = Math.max(0, 1 - z * z / 28);
        p.n.position.x = p.lane + p.spread * split;
        p.n.position.z = z;
      }
    };
    update(0, 0);
    const dispose = () => { while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]); };
    return { root, clock, vaultDoor, bandstand, aquarium, observe, update, dispose };
  };
  BL.pokerHall = Object.freeze({ build, hangMoon, lunarSurface });
})();
