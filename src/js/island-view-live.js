// The island view's 3D view (island-view.js; docs/ooga-chat-hosts.md, "The island view"), as the Observatory's screens
// are camera feeds (observatory-cameras.js): the game's own renderer (gl-renderer.js) on the strip's own canvas,
// drawing Main Island as a chat's copy of it shows it, from the baked scenery (island-scene.js: the ground and the
// pile, and as the viewer's tier allows the props, the lawn, the trees and the small details), as it stands now under
// the viewer's own sky: the hub's solar clock (daylight.js, the viewer's local hour and day, as the island's page reads
// them), its lamps and torches ramping up at dusk and lighting the island at night as the hub's do (`lamps`, the
// nearest to the camera's target taking the tier's point lights), the pits' fires burning (blaze.js), the trees and the
// lawn in the wind and the sea and painted clouds moving. Its own clouds go round on their tracks as the chat's copy
// deals them (`cloudAt`, the copy's `layoutClouds` and `placeCloud`), by the copy's clock (the chat's server time, from
// the `clouds` frames' `at`: `offset`), and each speaker not walking the copy sits on their seat (`seat`, the chat's
// `clouds` list: main-cloud-1 to 3 on the first bench cloud, and so on), their own Ooga sitting as a cloud speaker sits
// on the island (remote-players.js `poseCloud`: legs out before it, the fists down on the cloud, empty-handed), facing
// the pile, over the seat's purple glow on a bench that stands only while someone sits on it. Each walking speaker is
// their own Ooga (models.js `caveman` over characters.js `traitsFor`, as the island builds them), standing where the
// chat says they are and swinging its arms and legs as it walks, its pet beside it walking too. Each is dressed as other
// players see it on the island (`dress`, from the chat's `looks`): its saved hat and wardrobe put on by the island's own
// modules (character-equipment.js, character-wardrobe.js), the weapon it has out in its hands (its primary, or the gun
// held before it) and its jetpack on its back. What a look needs that the page has not yet got is fetched once, only
// when a walker first wears it (`fetchGroup`: in Ooga Chat its `hats`, `wardrobe` and `gear` chunks, on the island the
// deferred `wardrobe`). The viewer turns, tips, pans and zooms the camera round the island (`orbit`, `pan`, `zoom`,
// `reset`), held to the island and above the sea. Nothing is captured or sent: it is drawn in the viewer's own browser,
// only when `render` is called, which island-view.js does every frame on the full tier, 30 times a second on lite and
// every few seconds on base (`tick`), and whenever something changed. Ooga Chat fetches this, the renderer's code and
// the scenery only for a device the island view chooses 3D for. `prepare(dir, tier)` resolves to the scenery (`{ tier,
// layers, mbps }`), fetched once a page; `create(canvas, { scenery, data, quality, tier })` returns `{ place(i, x, y, z,
// yaw, on, name, look), seat(list), offset, render(), project(x, y, z, out), walkerHead(i, out), perchHead(i, out), perches, resize(), orbit(dx, dy), pan(dx, dy),
// zoom(k), reset(), setQuality(q), pin(clock), tick, moved, dispose() }`. `cloudPlan(baked)` and `cloudAt(plan, i, t,
// out)` are pure (the bake checks them against the hub's own placing).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SLOTS = 32, SEATS = 32, TAU = Math.PI * 2;
  // Where the camera starts (south of the island and above it, looking at the meadow) and how far it may go.
  const HOME = Object.freeze({ yaw: 0, pitch: 0.69, distance: 94, x: 0, y: -2, z: 2 });
  const DISTANCE_MIN = 10, DISTANCE_MAX = 170, PITCH_MIN = 0.12, PITCH_MAX = 1.5, REACH = 75;
  let scenery = null;
  const prepare = (dir, tier = null) => scenery ||= BL.islandScene.load(dir, tier).catch((error) => { scenery = null; throw error; });
  // A walk's swing: the stride (radians a metre walked) and how far the legs and arms reach.
  const STRIDE = 2.6, LEG_SWING = 0.55, ARM_SWING = 0.4;
  // How often a tier draws with nothing else changing (ms): the full tier every frame the device keeps up with, lite
  // thirty times a second, base every few seconds (its sky, clouds and lamps move on between).
  const TICK = Object.freeze({ full: 0, lite: 1000 / 30, base: 5000 });
  // The hub's lamps (scene-hub.js `LAMP_STAGGER`, `LAMP_RAMP`, `LAMP_OFF`, `PILE_POST_NIGHT_BOOST`, `PILE_POST_NIGHT_REACH`):
  // a lamp's flame comes up over its own stretch of the dusk ramp, in its order.
  const LAMP_STAGGER = 0.12, LAMP_RAMP = 0.4, LAMP_OFF = 0.12, POST_BOOST = 0.25, POST_REACH = 2;
  // The copy's clear air (weather.js held: `FOG_OFF_NEAR`, `FOG_OFF_FAR` and its painted cloud cover).
  const FOG_NEAR = 90, FOG_FAR = 620, COVER = 0.42;
  // The sky resampled only when the hour drifts past what turns the sun under a pixel (scene-hub.js `DAY_RESAMPLE_HOUR`).
  const RESAMPLE_HOUR = 6e-4;
  // What a look may need that a page fetches only once a walker wears it, and how to tell it is here: Ooga Chat's
  // chunks (ooga-chat-chunks.js), or on the island its deferred code (deferred.js, where only the wardrobe waits). One
  // fetch a group a page, forgotten on a failure so the next look that needs it asks again.
  const HERE = { hats: () => !!BL.characterEquipment?.loaded, wardrobe: () => !!BL.equipmentWardrobe?.seeded, gear: () => !!BL.hubModels };
  const fetching = new Map();
  const fetchGroup = (group) => {
    let task = fetching.get(group);
    if (!task) {
      task = Promise.resolve().then(() => BL.oogaChatChunks ? BL.oogaChatChunks.load(group) : BL.deferred.load(group));
      fetching.set(group, task);
      task.catch(() => fetching.delete(group));
    }
    return task;
  };
  // A look's wardrobe as this page knows it, as equipment.js reads one: a choice this page's catalog does not hold (a
  // newer deploy's) is the character's own look here, never a reason to refuse the rest.
  const wardrobeOf = (value) => {
    const W = BL.equipmentWardrobe;
    if (!W || !value || typeof value !== "object" || Array.isArray(value)) return null;
    let out = null;
    for (const id of W.WORN) if (Object.hasOwn(value, id)) { try { (out ||= {})[id] = W.choice(id, value[id]); } catch { /* not this page's */ } }
    return out;
  };
  const wardrobeReady = (w) => { const W = BL.equipmentWardrobe; return !w || W.WORN.every((id) => !w[id] || w[id].item === "none" || w[id].item === "custom" || !!W.content(w[id].version)); };
  const hatOf = (e) => {
    const s = e && e.selection, hats = BL.equipmentHats;
    return hats && s && typeof s === "object" && hats.has(s.item, s.version) ? s : null;
  };
  // The gun held before the chest, its muzzle ahead, both arms raised to it (in heights: across, up and ahead of the
  // hip; the arms' reach forward and in).
  const GUN_AT = { x: 0.06, y: 0.31, z: 0.3 }, GUN_ARM = -1.25, GUN_IN = 0.3;
  // A body sitting on a cloud (crew.js `poseGroundSit`, `SIT_FIST`): its root this share of its height over the seat,
  // its fists this share over it.
  const SIT_ROOT = 0.08, SIT_FIST = 0.1;

  // The copy's clouds as baked (island-scene.js meta `clouds`), checked: each cloud's shape, speed, phase, track radius,
  // base height, swing and bench (its index among the bench clouds, -1 for none), the bridges' angles it swings
  // between, and per shape its meshes, its bench's three seats and the glow under each.
  const cloudPlan = (c) => {
    const finite = (list, n) => Array.isArray(list) && (n === undefined || list.length === n) && list.every(Number.isFinite);
    if (!c || !Number.isFinite(c.epoch) || !finite(c.crossings) || !c.crossings.length || !(c.swing > 0) || !Array.isArray(c.list) || c.list.length > 64
      || !c.list.every((row) => finite(row, 7)) || !Array.isArray(c.seats) || !Array.isArray(c.glows)) throw new Error("island-view: the clouds' deal is not one");
    const clouds = c.list.map(([shape, speed, phase, radius, baseY, waveY, bench]) => {
      const seats = c.seats[shape];
      if (!Array.isArray(seats) || seats.length !== 3 || !seats.every((s) => finite(s, 3))) throw new Error("island-view: a cloud's seats are not three");
      return { shape, speed, phase, radius, baseY, waveY, bench };
    });
    return { epoch: c.epoch, crossings: Float64Array.from(c.crossings), swing: c.swing, clouds, plain: c.plain, bench: c.bench, seats: c.seats, glows: c.glows };
  };
  // Cloud `i` at `t` seconds since the plan's epoch, into `out` (`x`, `y`, `z`, `yaw`): round its track, swinging up or
  // down between two bridges, sin³ of the way across, its long axis along the circle (scene-hub.js `cloudAngle` and
  // `placeCloud`, exactly).
  const cloudAt = (plan, i, t, out) => {
    const cloud = plan.clouds[i], C = plan.crossings, angle = (cloud.phase + cloud.speed * t / cloud.radius) % TAU;
    out.x = Math.cos(angle) * cloud.radius; out.z = Math.sin(angle) * cloud.radius;
    const a = (angle % TAU + TAU) % TAU;
    let from = C[C.length - 1] - TAU, to = C[0];
    for (let k = 0; k < C.length && a >= to; k++) { from = to; to = k + 1 < C.length ? C[k + 1] : C[0] + TAU; }
    out.y = cloud.baseY + cloud.waveY * 4 * ((to - from) / plan.swing * Math.sin(Math.PI * (a - from) / (to - from)) ** 3);
    out.yaw = -angle - Math.PI / 2;
    return out;
  };
  // A seat's place in the copy's catalog (main-cloud-1 to 32), from 0; -1 for none.
  const SEAT = /^main-cloud-([1-9]|[12][0-9]|3[0-2])$/;
  const seatOf = (seat) => { const m = typeof seat === "string" && SEAT.exec(seat); return m ? Number(m[1]) - 1 : -1; };

  const create = (canvas, { scenery: baked, data, quality = "low", tier = "base" }) => {
    const { createNode, addChild, removeChild, updateWorld, createCamera } = BL.scene;
    const daylight = BL.daylight;
    const renderer = BL.glRenderer.createRenderer(canvas, { quality });
    const root = createNode();
    // The island's own models, made once a page and shared by every view made after, each stood in its places: copies
    // of one model are one instanced draw, as on the island. Each layer's nodes by place, for its lamps and glows.
    baked.geometries ||= baked.layers.map((layer) => layer.meshes.map((mesh) => BL.islandScene.geometry(mesh)));
    const standing = baked.layers.map((layer, k) => layer.places.map((place) => {
      const node = BL.islandScene.node(place, baked.geometries[k][place.mesh]);
      addChild(root, node);
      return node;
    }));
    // The lamps, as the hub's (scene-hub.js `addLamp`, `updateLamps`): each its node's glow, if it stands in a layer
    // loaded, and its light; a place's own glow where it is not 1.
    const lamps = [];
    let sky = null, skyLayer = -1;
    const fires = [];
    baked.layers.forEach((layer, k) => {
      const meta = layer.meta || {};
      for (const r of meta.lamps || []) {
        if (!Array.isArray(r) || r.length !== 16 || !r.every(Number.isFinite) || r[0] >= standing[k].length) throw new Error("island-view: a lamp is not one");
        const node = r[0] >= 0 ? standing[k][r[0]] : null;
        if (node) node.glow = r[1] === 2 ? 0 : LAMP_OFF;
        lamps.push({ node, mode: r[1], glow: r[2], order: r[3], light: r[4] === 1, x: r[5], y: r[6], z: r[7], radius: r[8], r: r[9], g: r[10], b: r[11],
          phase: r[12] * 2.3, post: r[13] === 1, center: r[14] === 1, fire: r[15] === 1, k: 0, lit: false, selected: false });
      }
      for (const [place, glow] of meta.glows || []) if (standing[k][place] && Number.isFinite(glow)) standing[k][place].glow = glow;
      // A pit's fire, the island's voxel flame (blaze.js) where it burns.
      for (const at of meta.fires || []) {
        if (!Array.isArray(at) || at.length !== 3 || !at.every(Number.isFinite)) throw new Error("island-view: a fire is not one");
        const rig = BL.blaze.createVoxelRig({ x: at[0], y: at[1], z: at[2], scale: 1 });
        addChild(root, rig.root);
        rig.time = 0;
        fires.push(rig);
      }
      if (meta.clouds) { sky = cloudPlan(meta.clouds); skyLayer = k; }
    });
    // The copy's clouds, each a node moved by the clock, and the glows under seats taken, hung on their cloud's node
    // the first time the seat is taken. `bench[b]` is the cloud carrying seats 3b+1 to 3b+3.
    const clouds = [], benchOf = [], glows = new Array(SEATS).fill(null);
    if (sky) {
      const g = baked.geometries[skyLayer];
      sky.clouds.forEach((c, i) => {
        const node = createNode({ geometry: g[sky.plain[c.shape]] });
        addChild(root, node);
        clouds.push(node);
        if (c.bench >= 0) benchOf[c.bench] = i;
      });
    }
    const AT = { x: 0, y: 0, z: 0, yaw: 0 };
    // The speakers on the clouds (`seat`): an Ooga a seat, built the first time a name comes to it.
    const perches = [];
    // A head's place on the canvas: over the top of every visible mesh of it, centred between the outermost corners of
    // their boxes, as projected with the frame last drawn (remote-players.js lays the island's nameplates the same way).
    const HEAD_AT = { x: 0, y: 0, depth: 0 };
    let headMinX = 0, headMaxX = 0, headTop = 0;
    const headCorners = (node) => {
      if (!node.visible) return;
      if (node.geometry) {
        const b = BL.scene.boundsOf(node.geometry), m = node.world;
        for (let i = 0; i < 8; i++) {
          const x = i & 1 ? b.max[0] : b.min[0], y = i & 2 ? b.max[1] : b.min[1], z = i & 4 ? b.max[2] : b.min[2];
          if (!renderer.project(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], HEAD_AT)) continue;
          if (HEAD_AT.x < headMinX) headMinX = HEAD_AT.x;
          if (HEAD_AT.x > headMaxX) headMaxX = HEAD_AT.x;
          if (HEAD_AT.y < headTop) headTop = HEAD_AT.y;
        }
      }
      for (let i = 0; i < node.children.length; i++) headCorners(node.children[i]);
    };
    // `seen`: false too for a head wholly out of the view, so a bench panned away leaves no names stacked at the edge
    // (remote-players.js skips a cloud speaker's the same way; a walker's keeps to the edge).
    const headOf = (cave, out, seen = false) => {
      if (!cave || !cave.root.visible || !cave.parts.head) return false;
      headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
      headCorners(cave.parts.head);
      if (headTop === Infinity) return false;
      if (seen && (headMaxX < 0 || headMinX > renderer.size.width || headTop > renderer.size.height)) return false;
      out.x = (headMinX + headMaxX) / 2; out.y = headTop;
      return true;
    };
    for (let i = 0; i < SEATS; i++) perches.push({ id: "", name: "", cave: null, seat: -1 });
    // A slot a walker: their Ooga, built the first time a name comes to it (another name builds anew), its hip from the
    // build, and its walk's phase from the ground it has covered.
    const slots = [];
    for (let i = 0; i < SLOTS; i++) slots.push({ name: "", cave: null, hip: 0, phase: 0, pet: 0, x: 0, z: 0, look: undefined, held: -1, jet: null, worn: false, armLZ: 0, armRZ: 0 });
    // An Ooga let go of (another name in its slot or perch) or dressed anew leaves meshes nothing draws: the next
    // render gives the GPU back everything that is neither under the root nor baked (`released`).
    let released = false;
    const KEEP = new Set();
    const gather = (node) => { if (node.geometry) KEEP.add(node.geometry); for (const child of node.children) gather(child); };
    const ooga = (slot, name) => {
      if (slot.cave && slot.name === name) return slot.cave;
      if (slot.cave) { removeChild(root, slot.cave.root); released = true; }
      slot.name = name;
      slot.cave = BL.models.caveman(BL.characters.traitsFor(name));
      slot.hip = slot.cave.root.position.y;
      slot.phase = slot.pet = 0;
      slot.look = undefined; slot.held = -1; slot.jet = null; slot.worn = false;
      slot.armLZ = slot.cave.parts.armL.rotation.z; slot.armRZ = slot.cave.parts.armR.rotation.z;
      addChild(root, slot.cave.root);
      return slot.cave;
    };
    // Dresses a slot's Ooga in a look (null: as it is built). Its hat and wardrobe go on as they go on another player's
    // body on the island; what is not on this page yet is fetched, and the look is put on again once it is here. A piece
    // still unknown then is left off.
    const dress = (slot, look) => {
      slot.look = look;
      const cave = slot.cave, e = look && look.e && typeof look.e === "object" ? look.e : null;
      const wardrobe = wardrobeOf(e && e.wardrobe), hat = hatOf(e), size = e && Number.isInteger(e.size) ? e.size : 100;
      const missing = !wardrobeReady(wardrobe) && !HERE.wardrobe() ? "wardrobe"
        : hat && hat.item !== "none" && !BL.equipmentHats.loaded(hat.item, hat.version) && !HERE.hats() ? "hats"
        : look && look.j === 1 && !cave.parts.jetpack && !HERE.gear() ? "gear" : null;
      if (missing) {
        fetchGroup(missing).then(() => { if (slot.cave === cave && slot.look === look) { slot.look = undefined; self.moved = true; } }, () => {});
        if (missing !== "gear") return;
      }
      // A worn height stands the Ooga on the same feet: its hip moves with it (character-wardrobe.js `swap`).
      const before = cave.root.position.y;
      if (BL.characterWardrobe) BL.characterWardrobe.apply(cave, wardrobe);
      if (BL.characterEquipment) BL.characterEquipment.apply(cave, hat, size);
      slot.hip += cave.root.position.y - before;
      slot.held = -1;
      released = true;
      self.moved = true;
    };
    // What it has out (a look's `w`: 1 its primary, 2 the gun; none, as it is built, its primary in hand): the primary
    // in its right hand, or the gun held before it, the other put away.
    const hold = (cave, held) => {
      const p = cave.parts, gun = held === 2;
      p.club.visible = !gun && held !== 0;
      p.gun.visible = gun;
      if (gun) {
        const h = cave.traits.height;
        p.gun.position.x = GUN_AT.x * h; p.gun.position.y = GUN_AT.y * h; p.gun.position.z = GUN_AT.z * h;
      }
    };
    // Its jetpack on its back while a look says it wears one: the character's own, or the island's (hub-models.js), seated
    // as crew.js `jetpackNode` and `seatJetpack` seat it, its flame out (a look does not say it flies).
    const wearJet = (slot, on) => {
      const cave = slot.cave, p = cave.parts;
      if (on && !slot.jet) {
        if (p.jetpack) slot.jet = p.jetpack;
        else if (BL.hubModels) {
          const geometry = BL.hubModels.jetpack(), h = cave.traits.height;
          slot.jet = createNode({ position: { x: 0, y: 0.06 * h, z: -0.18 * h }, scale: { x: h, y: h, z: h }, geometry });
          if (cave.modelled) slot.jet.position.z = -cave.back - BL.scene.boundsOf(geometry).max[2] * h;
          addChild(cave.root, slot.jet);
        } else return;
      }
      if (slot.jet) slot.jet.visible = on;
      if (on && p.jetFlame) p.jetFlame.visible = false;
      slot.worn = on;
    };
    // The arms swing with the walk but for one holding the gun, raised to it; the pet's legs, its own stride.
    const swing = (slot, k) => {
      const p = slot.cave.parts, a = Math.sin(slot.phase) * k, gun = slot.held === 2;
      if (p.legL) p.legL.rotation.x = a * LEG_SWING;
      if (p.legR) p.legR.rotation.x = -a * LEG_SWING;
      if (p.armL) { p.armL.rotation.x = gun ? GUN_ARM : -a * ARM_SWING; p.armL.rotation.z = slot.armLZ - (gun ? GUN_IN : 0); }
      if (p.armR) { p.armR.rotation.x = gun ? GUN_ARM : a * ARM_SWING; p.armR.rotation.z = slot.armRZ + (gun ? GUN_IN : 0); }
      const dog = p.dog;
      if (dog && dog.legs && dog.parent === slot.cave.root) BL.models.poseQuadruped(dog, 0, 0, Math.sin(slot.phase) * BL.models.QUAD_GAIT.swing * k, 0, 0);
    };
    // An arm of a body sitting on the cloud (crew.js `sitArm`): straight down from the shoulder, the forearm reaching
    // forward until the fist rests on the cloud.
    const sitArm = (cave, arm, fore) => {
      const e = cave.elbow, s = cave.armScale || 1, h = cave.traits.height;
      arm.quaternion = null;
      arm.rotation.x = 0;
      if (!fore || !e) return;
      const length = e.length * s, elbowY = arm.position.y - Math.hypot(e.y, e.z) * s, drop = Math.min(length, elbowY - (SIT_FIST - SIT_ROOT) * h);
      fore.rotation.x = -Math.acos(Math.max(-1, Math.min(1, drop / length)));
    };
    // Sitting as a cloud speaker sits on the island (remote-players.js `poseCloud`): legs out before it, the fists down on
    // the cloud, the head straight, empty-handed, its pet (which walks at the heel on the ground) away. Once a build.
    const sit = (cave) => {
      const p = cave.parts;
      for (const key of ["club", "chuk", "gun", "dog", "jetpack", "jetFlame"]) if (p[key]) p[key].visible = false;
      if (p.legL) p.legL.rotation.x = -Math.PI / 2;
      if (p.legR) p.legR.rotation.x = -Math.PI / 2;
      if (p.armL) sitArm(cave, p.armL, p.forearmL);
      if (p.armR) sitArm(cave, p.armR, p.forearmR);
      if (p.head) { p.head.quaternion = null; p.head.rotation.x = p.head.rotation.y = 0; }
    };
    // Seats the clouds' speakers at the copy's moment `t`: each cloud on its track, a bench on each with someone on it,
    // each speaker sitting on their seat facing the pile over its glow.
    const seatClouds = (t) => {
      if (!sky) return;
      const g = baked.geometries[skyLayer];
      for (let i = 0; i < clouds.length; i++) {
        const node = clouds[i];
        cloudAt(sky, i, t, AT);
        node.position.x = AT.x; node.position.y = AT.y; node.position.z = AT.z;
        node.rotation.y = AT.yaw;
        node.geometry = g[sky.plain[sky.clouds[i].shape]];
      }
      for (let n = 0; n < SEATS; n++) if (glows[n]) glows[n].visible = false;
      for (let i = 0; i < SEATS; i++) {
        const perch = perches[i];
        if (!perch.cave) continue;
        const n = perch.seat, c = n >= 0 ? benchOf[Math.floor(n / 3)] : undefined;
        if (c === undefined) { perch.cave.root.visible = false; continue; }
        const node = clouds[c], shape = sky.clouds[c].shape, spot = sky.seats[shape][n % 3], cs = Math.cos(node.rotation.y), sn = Math.sin(node.rotation.y);
        node.geometry = g[sky.bench[shape]];
        let glow = glows[n];
        if (!glow || glow.parent !== node) {
          if (glow) removeChild(glow.parent, glow);
          glow = glows[n] = createNode({ geometry: g[sky.glows[shape][n % 3]] });
          addChild(node, glow);
        }
        glow.visible = true;
        const x = node.position.x + spot[0] * cs + spot[2] * sn, z = node.position.z - spot[0] * sn + spot[2] * cs, p = perch.cave.root.position;
        p.x = x; p.z = z;
        p.y = node.position.y + spot[1] + perch.cave.traits.height * SIT_ROOT;
        perch.cave.root.rotation.y = Math.atan2(-x, -z);
        perch.cave.root.visible = true;
      }
    };
    const camera = createCamera({ fov: 40, near: 1, far: 900 });
    const view = { ...HOME };
    // The render options as the hub's (scene-hub.js `RENDER_OPTS`), the sky and light from the clock.
    const L = data.light;
    const opts = {
      clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
      light: { x: 0, y: 1, z: 0 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, moonSun: { x: 0, y: -1, z: 0 }, celestialPole: { x: 0, y: 0.34, z: -0.94 }, starMatrix: new Float32Array(9),
      stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, sunStrength: 1, moonStrength: 0, moonIllumination: 1, moonPhase: 0.5,
      ambientFloor: 0.24, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0.3, shadowBias: L.shadowBias ?? 0.0014, time: 0, bloomStrength: 0.5,
      lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 90, sea: L.sea ?? -70,
      fog: new Float32Array(3), fogNear: FOG_NEAR, fogFar: FOG_FAR, clouds: COVER
    };
    opts.starMatrix[0] = opts.starMatrix[4] = opts.starMatrix[8] = 1;
    // The viewer's own clock, as the hub's page reads it (or pinned, `pin`).
    let clock = daylight.createClock(), sampled = NaN, sampledDay = 0, hour = 12;
    const sampleSky = () => {
      hour = clock.read();
      if (Math.abs(hour - sampled) < RESAMPLE_HOUR && clock.dayOfYear === sampledDay) return;
      daylight.sample(hour, opts, clock.dayOfYear, daylight.ISLAND_LATITUDE_DEG, clock.continuousDay, clock.utcMs);
      opts.fog[0] = opts.horizon[0]; opts.fog[1] = opts.horizon[1]; opts.fog[2] = opts.horizon[2];
      sampled = hour; sampledDay = clock.dayOfYear;
    };
    // Each lamp's flame by the clock, and its light for the nearest to the camera's target, the pile's posts first.
    const lightLamps = () => {
      const phase = daylight.phaseAt(hour), lanternsOn = phase === "dusk" || phase === "night" || phase === "midnight";
      const pulse = fires.length ? 1 + (fires[0].light - 1) * 1.5 : 1, t = opts.time;
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        const k = l.mode === 1 ? 1 : l.mode === 2 ? (lanternsOn ? 1 : 0) : Math.min(1, Math.max(0, (opts.torch - l.order * LAMP_STAGGER) / LAMP_RAMP));
        l.k = k; l.lit = k > 0.05; l.selected = false;
        if (!l.node) continue;
        const steady = l.mode === 2 ? 0 : LAMP_OFF, glow = l.glow * (1 + (l.post ? opts.lampFactor * POST_BOOST * 0.25 : 0));
        l.node.glow = k === 0 ? steady : steady + k * (glow + Math.sin(t * 11 + l.phase) * 0.15);
      }
      const limit = Math.min(BL.glRenderer.QUALITY[renderer.quality].lights, BL.glRenderer.POINT_LIGHT_CAPACITY), lights = opts.lights, tx = camera.target.x, ty = camera.target.y, tz = camera.target.z;
      let count = 0;
      for (; count < limit; count++) {
        let nearest = null, best = Infinity;
        for (let i = 0; i < lamps.length; i++) {
          const l = lamps[i];
          if (!l.lit || !l.light || l.selected) continue;
          const score = l.post ? -32 : (l.x - tx) ** 2 + (l.y - ty) ** 2 + (l.z - tz) ** 2 - (l.center ? 16 : 0);
          if (score < best) { nearest = l; best = score; }
        }
        if (!nearest) break;
        const l = nearest, o = count * 8, gain = l.k * (l.post ? 1 + opts.lampFactor * POST_BOOST : 1) * (l.fire ? pulse : 1);
        l.selected = true;
        lights[o] = l.x; lights[o + 1] = l.y; lights[o + 2] = l.z;
        lights[o + 3] = l.radius + (l.post ? opts.lampFactor * POST_REACH : 0);
        lights[o + 4] = l.r * gain; lights[o + 5] = l.g * gain; lights[o + 6] = l.b * gain;
        lights[o + 7] = l.post ? 1 : 0;
      }
      opts.lightCount = count;
    };
    let last = 0;
    const self = {
      moved: true,
      // The chat's clock less this page's (ms), for the clouds; island-view.js keeps it from the `clouds` frames.
      offset: 0,
      // Slot `i`'s walker at their feet (`y`) and heading, as `name`'s Ooga dressed in `look`; `on` false puts it away.
      place(i, x, y, z, yaw, on, name = "", look = null) {
        const slot = slots[i];
        if (!on) { if (slot.cave && slot.cave.root.visible) { slot.cave.root.visible = false; self.moved = true; } return; }
        const cave = ooga(slot, name || "ooga"), node = cave.root;
        if (slot.look !== look) dress(slot, look);
        const held = look ? look.w === 1 || look.w === 2 ? look.w : 0 : -1;
        if (held !== slot.held) { slot.held = held; hold(cave, held); self.moved = true; }
        const jet = !!look && look.j === 1;
        if (jet !== slot.worn) { wearJet(slot, jet); self.moved = true; }
        if (!node.visible) { node.visible = true; slot.x = x; slot.z = z; self.moved = true; }
        const step = Math.hypot(x - slot.x, z - slot.z);
        slot.x = x; slot.z = z;
        if (step > 1e-4 || node.position.y !== y + slot.hip || node.rotation.y !== yaw) self.moved = true;
        node.position.x = x; node.position.y = y + slot.hip; node.position.z = z;
        node.rotation.y = yaw;
        // Walking swings the limbs with the ground covered; standing, they settle.
        slot.phase += step * STRIDE;
        slot.pet += step * BL.models.QUAD_GAIT.stride;
        swing(slot, step > 1e-4 ? 1 : 0);
      },
      // The speakers on the clouds (island-view.js's checked `clouds` list: `{ id, character, seat }`): each keeps the
      // Ooga it sat as while its name stays; one gone frees its perch.
      seat(list) {
        for (const perch of perches) if (perch.cave && !list.some((c) => c.id === perch.id && c.character === perch.name)) { removeChild(root, perch.cave.root); released = true; perch.cave = null; perch.id = perch.name = ""; perch.seat = -1; }
        for (const c of list) {
          let perch = perches.find((p) => p.cave && p.id === c.id);
          if (!perch) {
            perch = perches.find((p) => !p.cave);
            if (!perch) continue;
            perch.id = c.id; perch.name = c.character;
            perch.cave = BL.models.caveman(BL.characters.traitsFor(c.character));
            sit(perch.cave);
            addChild(root, perch.cave.root);
          }
          perch.seat = seatOf(c.seat);
        }
        self.moved = true;
      },
      render() {
        const now = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        opts.time += dt;
        sampleSky();
        seatClouds((Date.now() + self.offset - (sky ? sky.epoch : 0)) / 1000);
        for (let i = 0; i < fires.length; i++) { const rig = fires[i]; rig.time += dt; rig.update(dt, rig.time); }
        lightLamps();
        updateWorld(root);
        if (released) {
          released = false;
          KEEP.clear();
          for (const layer of baked.geometries) for (const g of layer) KEEP.add(g);
          gather(root);
          renderer.releaseUnused(KEEP);
        }
        self.moved = false;
        return renderer.render(root, camera, opts);
      },
      project: (x, y, z, out) => renderer.project(x, y, z, out),
      // Where a walker's head (place `i`) stands on the canvas as last drawn, the middle across and the top, in CSS
      // pixels, written into `out`: false when it isn't shown or is out of the view.
      walkerHead: (i, out) => headOf(slots[i] && slots[i].cave, out),
      // The same for the speaker on cloud perch `i`: their id, or "" for an empty perch or one out of the view.
      perchHead(i, out) { const p = perches[i]; return p && p.cave && headOf(p.cave, out, true) ? p.id : ""; },
      perches: SEATS,
      resize() { renderer.resize(); self.moved = true; },
      // A drag: round the island and up or down (radians).
      orbit(dx, dy) {
        view.yaw -= dx;
        view.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, view.pitch + dy));
        aim();
      },
      // A pan: the target across the ground by a share of the view (dx, dy in view widths).
      pan(dx, dy) {
        const k = view.distance * 0.9, c = Math.cos(view.yaw), s = Math.sin(view.yaw);
        view.x -= (dx * c + dy * s) * k;
        view.z -= (-dx * s + dy * c) * k;
        const r = Math.hypot(view.x, view.z);
        if (r > REACH) { view.x *= REACH / r; view.z *= REACH / r; }
        aim();
      },
      // Zoom: nearer below 1, farther above it.
      zoom(k) { view.distance = Math.max(DISTANCE_MIN, Math.min(DISTANCE_MAX, view.distance * k)); aim(); },
      reset() { Object.assign(view, HOME); aim(); },
      // Pins the clock (daylight.js `createClock`'s `{ hour, day, time }`; null: the viewer's own again), for a check.
      pin(at) { clock = daylight.createClock(at || {}); sampled = NaN; self.moved = true; },
      // How often this tier draws with nothing else changing (ms).
      get tick() { return TICK[tier] ?? TICK.base; },
      get atHome() { return view.yaw === HOME.yaw && view.pitch === HOME.pitch && view.distance === HOME.distance && view.x === HOME.x && view.z === HOME.z; },
      setQuality(q) { renderer.setQuality(q); self.moved = true; },
      get quality() { return renderer.quality; },
      get view() { return { ...view }; },
      // For the checks: what the sky is doing and where each cloud speaker sits (made on call).
      get state() {
        return { hour, torch: opts.torch, lights: opts.lightCount, lamps: lamps.length, fires: fires.length, clouds: clouds.length,
          seated: perches.filter((p) => p.cave && p.cave.root.visible).map((p) => ({ id: p.id, seat: p.seat, x: p.cave.root.position.x, y: p.cave.root.position.y, z: p.cave.root.position.z })) };
      },
      // Where the camera looks from and at, for a check that frames a place (its yaw round the island, pitch and distance).
      look(x, y, z, yaw, pitch, distance) { Object.assign(view, { x, y, z, yaw, pitch, distance }); aim(); },
      dispose() { renderer.dispose(); root.children.length = 0; slots.length = perches.length = lamps.length = fires.length = clouds.length = 0; }
    };
    // The camera from the view: round its target at `distance`, `yaw` round the island from the south, `pitch` up.
    const aim = () => {
      const c = Math.cos(view.pitch), s = Math.sin(view.pitch);
      camera.position = { x: view.x + Math.sin(view.yaw) * c * view.distance, y: view.y + s * view.distance, z: view.z + Math.cos(view.yaw) * c * view.distance };
      camera.target = { x: view.x, y: view.y, z: view.z };
      camera.near = Math.max(0.3, view.distance / 60);
      self.moved = true;
    };
    renderer.resize();
    aim();
    return self;
  };
  BL.islandViewLive = { prepare, create, HOME, TICK, cloudPlan, cloudAt, seatOf };
})();
