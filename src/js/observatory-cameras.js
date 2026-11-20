// Thirty-two shared texture slots; one slot changes area periodically. Capture work stays capped
// at one visible feed per frame. Source factories make camera representations, never interactive scenes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SLOTS = 32, SWITCH_SECONDS = 15;
  // Shared curved glass/image strip. X stays in the original UV frame, while depth follows the room's circle.
  const curvedSurface = (width, height, scaleX, scaleZ, radius) => {
    const g = { verts: [], faces: [], lines: [], smooth: true, castShadow: false, architectRoom: true };
    for (let i = 0; i <= 8; i++) {
      const x = width * (i / 8 - 0.5), worldX = x * scaleX;
      const z = (radius - Math.sqrt(radius * radius - worldX * worldX)) / scaleZ;
      g.verts.push(x, -height / 2, z, x, height / 2, z);
      if (i) { const a = (i - 1) * 2; g.faces.push({ i: [a, a + 2, a + 3, a + 1], color: [255, 255, 255], emissive: 1 }); }
    }
    return g;
  };
  const create = ({ renderer, mouths, places }) => {
    const channels = [], feeds = [], renderFeeds = [], sources = new Map(), meshes = new Set(), panelShapes = new Map();
    const debug = new URLSearchParams(location.search).get("debug") === "1";
    let prepared = false, active = false, switchIn = SWITCH_SECONDS, turn = 0, next = SLOTS, portrait = null;
    const channel = (id, label, eye, target, far, fov = 46, build = null, sourceId = id) => {
      const camera = BL.scene.createCamera({ fov, near: 0.5, far });
      Object.assign(camera.position, eye); Object.assign(camera.target, target);
      channels.push({ id, label, camera, build, sourceId });
    };
    const at = (p, x, y, z) => ({ x: p.x + x, y: p.y + y, z: p.z + z });
    // Keep the cave wall behind the pile inside the capture, not just the foreground props.
    channel("pile", "BANANA PILE", { x: 5, y: 4, z: 7 }, { x: 0, y: 0.8, z: 0 }, 60, 38);
    channel("rainforest", "MEMPOOL LAKE", at(places.pool, 0, 11, 4), at(places.pool, 0, -1.5, 0), 28, 60);
    channel("repos", "MERGE ROCK", at(places.repos, 8, 9, -13), at(places.repos, 0, 2, 0), 35, 56);
    channel("bifrost.chamber", "BIFROST CHAMBER", { x: 0, y: 4.2, z: 11.5 }, { x: 0, y: 3.2, z: -2 }, 40, 62,
      () => BL.observatoryBifrost.create(renderer));
    for (const [id, label] of [["c10", "B.C.A."], ["c3", "OOGA ARCADE"], ["c2", "LIGHTNING FACTORY"], ["c11", "ENTROPYLAB"], ["c1", "MIRROR ENTRANCE"]]) {
      const m = mouths.find(mouth => mouth.id === id);
      if (!m) continue;
      const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      channel(id, label, { x: m.x + sr * 13 + cr * 4, y: m.floorY + 6, z: m.z + cr * 13 - sr * 4 },
        { x: m.x, y: m.floorY + 1.5, z: m.z }, 32);
    }
    channel("sphere", "TIMECHAIN SPHERE", at(places.sphere, 20, 17, 30), at(places.sphere, 0, 3, 0), 65, 55);
    if (places.bifrost) channel("bifrost", "BIFROST ISLET", at(places.bifrost, 8, 7, 14), at(places.bifrost, 0, 3, 0), 40, 55);
    for (const id of BL.timechainRooms.OPEN) {
      const room = BL.timechainRooms.get(id);
      if (room.lockable) continue;
      const L = BL.timechainRooms.layout(id);
      const shots = { 2: [6, 3.5, 8, 0, 1, 0], 3: [5, 3.5, -1, 0, 2, -8], 4: [7, 3.5, 6, 0, 1, 0],
        6: [7, 3.5, -4, 0, 1.8, -14], 7: [3, 2.5, 5, 0, 1, 0] };
      const shot = shots[id] || [L.R * 0.12, 3.5, L.doorZ - 2, 0, L.yMin + 1.2, -L.R * 0.2];
      channel(room.zone, "TCS / " + room.name.toUpperCase(), { x: shot[0], y: shot[1], z: shot[2] },
        { x: shot[3], y: shot[4], z: shot[5] }, L.R * 2.5, 64, () => BL.observatoryTimechain.create(renderer, id));
    }
    const local = (m, x, y, z) => ({ x: m.x + x * Math.cos(m.ry) + z * Math.sin(m.ry),
      y: (m.floorY ?? m.y ?? m.floor) + y, z: m.z - x * Math.sin(m.ry) + z * Math.cos(m.ry) });
    for (const [mouth, id, label, depth] of [["c10", "bca-office", "B.C.A. OFFICE", 4.7], ["c11", "lab-floor", "ENTROPYLAB FLOOR", 7]]) {
      const m = mouths.find(m => m.id === mouth);
      if (m) channel(id, label, local(m, 0.8, 2.8, -1), local(m, 0, 1, -depth), 18, 68);
    }
    channel("hq", "HEADQUARTERS", { x: 4, y: places.hq.floor + 2.5, z: 8 }, { x: 0, y: places.hq.floor + 1, z: 0 }, 32, 68);
    channel("hq-basement", "HQ BASEMENT", { x: 4, y: places.hq.basement.floor + 2.5, z: 8 }, { x: 0, y: places.hq.basement.floor + 1, z: 0 }, 30, 68);
    const poolFloor = BL.poolLayout.FLOOR;
    // From the chamber rim, look up beneath the bowl and across the mined cube's drop through the shaft.
    channel("rainforest-under", "MEMPOOL CHAMBER", local(places.pool, 0, poolFloor + 2, 9.5),
      local(places.pool, 0, BL.poolLayout.membraneY(0) - 1, 0), 28, 68);
    channel("library", "LIBRARY NOOK", local(places.library, 0, 2.5, 5), local(places.library, 0, 1.3, 0), 16, 58);
    channel("hq-gallery", "HQ WINDOW GALLERY", { x: -6, y: places.hq.floor + 2, z: -17 }, { x: 5, y: places.hq.floor + 1, z: -22 }, 25, 65);
    channel("north-pass", "NORTH PASS", { x: places.gate.x + 3, y: 7, z: places.gate.z + 10 }, { x: places.gate.x, y: 3, z: places.gate.z }, 32, 60);
    const workshop = (id, label, zone, eye, target, far) => channel(id, label,
      { x: eye[0], y: eye[1], z: eye[2] }, { x: target[0], y: target[1], z: target[2] }, far, 62,
      () => BL.observatoryWorkshops.create(renderer, zone), zone);
    workshop("factory-core", "FACTORY / CORE", "factory.hall", [5, 12, 20], [0, 8, -4], 48);
    workshop("factory-lines", "FACTORY / LINES", "factory.hall", [4, 14, -1], [-11, 12, -13], 34);
    workshop("arcade-floor", "ARCADE / FLOOR", "arcade.hall", [6, 6, 3], [0, 1, -8], 34);
    workshop("arcade-mezzanine", "ARCADE / MEZZANINE", "arcade.hall", [7, 6, -15], [0, 4, -23], 24);
    workshop("hangar-jet", "HANGAR / JET BAY", "factory.hangar", [-3, 10, 14], [15, 3, -10], 64);
    workshop("hangar-workshop", "HANGAR / WORKSHOP", "factory.hangar", [0, 8, 18], [-13, 1, 2], 45);
    workshop("factory-treasury", "FACTORY / TREASURY", "factory.hall", [4, 7, 21], [14, 4, 13], 30);
    workshop("arcade-carnival", "ARCADE / CARNIVAL", "arcade.hall", [-1, 5, -9], [12, 1, -3], 30);
    const quad = (width, height, surface) => ({ verts: [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, width / 2, height / 2, 0, -width / 2, height / 2, 0],
      faces: [{ i: [0, 1, 2, 3], color: [255, 255, 255], emissive: 1 }], lines: [], castShadow: false, architectRoom: true, imageSurface: surface });
    const selected = (id) => { for (const feed of feeds) if (feed.channel.id === id) return true; return false; };
    const select = (feed, choice) => {
      feed.channel = choice; feed.camera = choice.camera; feed.source = null; feed.last = -Infinity;
      feed.pending = true; feed.heaviest = null; feed.geometry.imageSurface.version++;
    };
    const syncSources = () => {
      for (const [id, source] of sources) {
        if (!active || !feeds.some(f => f.channel.sourceId === id)) { source.dispose(); sources.delete(id); }
      }
      for (const feed of feeds) {
        feed.source = null;
        if (!active || !feed.channel.build || renderer.kind !== "webgl2") continue;
        let source = sources.get(feed.channel.sourceId);
        if (!source) {
          source = feed.channel.build(); sources.set(feed.channel.sourceId, source);
          BL.observatoryDetail.attach(source, feed.channel.sourceId, renderer);
          renderer.prepareScene(source.meshes);
          for (const geometry of source.meshes) renderer.prepareGeometry(geometry);
        }
        feed.source = source;
      }
    };
    const makeFeed = choice => {
      const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 144;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, 256, 144);
      const geometry = quad(3.08, 1.72, { canvas, version: 0, rect: [-1.54, -0.86, 3.08, 1.72], smooth: true });
      const feed = { geometry, surfaces: [], tiles: new Map(), camera: choice.camera, channel: choice, source: null,
        pending: true, holdFrame: true, visible: false, forceCapture: false, priority: false,
        captures: 0, last: -Infinity, draws: 0, triangles: 0, profile: debug };
      geometry.imageSurface.feed = feed; meshes.add(geometry); return feed;
    };
    const prepare = () => {
      if (prepared) return; prepared = true;
      for (let i = 0; i < Math.min(SLOTS, channels.length); i++) feeds.push(makeFeed(channels[i]));
      portrait = makeFeed({ id: "portrait", label: "OOGA CLOSE-UP", camera: BL.scene.createCamera({ fov: 36, near: 0.03, far: 4 }) });
      portrait.camera.up = { x: 0, y: 1, z: 0 };
      // One clean prewarm image backs the nested TVs; the separate foreground image stays live.
      portrait.roomBackground = true; portrait.backGeometry = { ...portrait.geometry };
      portrait.holdFrame = false;
      portrait.seedOnly = false;
      meshes.add(portrait.backGeometry);
      portrait.priority = true; portrait.interval = 100;
      portrait.light = { clear: [0.015, 0.015, 0.018], sky: [0.6, 0.58, 0.55], ground: [0.3, 0.27, 0.24],
        direct: [0, 0, 0], directStrength: 0, ambientFloor: 0.75, diffuseFloor: 0 };
      renderFeeds.push(...feeds, portrait);
    };
    // UV windows share one target per feed. Crop to cover without stretching, and account for the
    // bezel gaps so a multi-panel picture continues behind them instead of repeating at every edge.
    const panel = (feed, size, x, y, pitchX, pitchY, scaleX, scaleY, bendRadius = 0) => {
      const shapeKey = [scaleX, bendRadius].join(":"), key = [size, x, y, pitchX, pitchY, scaleX, scaleY, bendRadius].join(":");
      let g = feed.tiles.get(key);
      if (g) return g;
      const width = Math.max((size - 1) * pitchX + 3.08 * scaleX, ((size - 1) * pitchY + 1.72 * scaleY) * 16 / 9);
      const height = width * 9 / 16;
      let shape = panelShapes.get(shapeKey);
      if (!shape) { shape = bendRadius ? curvedSurface(3.08, 1.72, scaleX, 0.71, bendRadius) : feed.geometry; panelShapes.set(shapeKey, shape); }
      g = { ...shape, cameraFeedGrid: size, imageSurface: { ...feed.geometry.imageSurface,
        rect: [(-width / 2 - ((size - 1) / 2 - x) * pitchX) / scaleX,
          (-height / 2 - (y - (size - 1) / 2) * pitchY) / scaleY, width / scaleX, height / scaleY] } };
      feed.tiles.set(key, g); feed.surfaces.push(g); meshes.add(g); return g;
    };
    const setActive = (on) => {
      if (active === on) return;
      active = on;
      if (!on) for (const feed of renderFeeds) feed.forceCapture = false;
      if (on) prepare();
      syncSources();
    };
    const update = (dt) => {
      if (!active || document.hidden) return;
      if (channels.length > feeds.length) {
        switchIn -= dt;
        if (switchIn <= 0) {
          switchIn = SWITCH_SECONDS;
          // Rotate every slot fairly, including those behind the viewer. Their captures stay idle.
          // The old captured picture stays on screen until the selected channel's first capture replaces it.
          let choice;
          do { choice = channels[next++ % channels.length]; } while (selected(choice.id));
          // A chair-selected feed keeps its zone until the player restores it.
          let feed = feeds[turn++ % feeds.length];
          while (feed.enhanced || feed.prewarm) feed = feeds[turn++ % feeds.length];
          select(feed, choice); syncSources();
        }
      }
      // Observer poses update only when the renderer actually captures that source.
    };
    const ready = feed => renderer.kind !== "webgl2" || renderer.cameraFeedReady(feed);
    const warm = () => {
      let complete = true;
      for (const feed of feeds) if (!ready(feed)) { feed.forceCapture = true; complete = false; }
      return complete;
    };
    return { feeds, renderFeeds, channels, prepare, panel, setActive, update, ready, warm, get portrait() { return portrait; },
      observes(id) {
        if (active) for (const feed of feeds) if (feed.visible && feed.channel.id === id) return true;
        return false;
      },
      near(x, y, z, radius2) {
        if (!active) return false;
        for (const f of feeds) if (f.visible && !f.channel.build) {
          const p = f.camera.target;
          if ((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 < radius2) return true;
        }
        return false;
      },
      liveGeometry(set) { for (const g of meshes) set.add(g); for (const source of sources.values()) for (const g of source.meshes) set.add(g); },
      dispose() { setActive(false); for (const g of meshes) renderer.releaseGeometry(g); for (const feed of renderFeeds) { feed.tiles.clear(); feed.surfaces.length = 0; }
        feeds.length = renderFeeds.length = 0; portrait = null; meshes.clear(); panelShapes.clear(); }
    };
  };
  BL.observatoryCameras = { create, curvedSurface, SLOTS, SWITCH_SECONDS };
})();
