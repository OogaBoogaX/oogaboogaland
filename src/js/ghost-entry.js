// HALLOWEEN: only the herald and the arena's channel to the server's hunt live in the arcade's ghost arena until a hunt
// is wanted. A shot (or a click where `tapWakes`) or an active hunt from the server loads the hunt once. Keep the latest
// state and one start while loading; disposal makes a late completion inert, and a failed load can be retried on the
// herald.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const { cached, variants } = BL.models;
  const HEIGHT = 1.7, TAU = Math.PI * 2;
  const sources = [], names = ["front", "back", "side"];
  let preparing = null;
  const prepare = () => preparing || (preparing = Promise.all(names.map((name, i) => {
    const image = new Image();
    image.src = BL.ghostHeraldData[name];
    return image.decode().then(() => { sources[i] = image; }, () => {});
  })));
  const sprite = (canvas, body, foot, bright, soft = false) => {
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const w = canvas.width / body, h = canvas.height / body, x = -w / 2, y = -foot / body;
    return { verts: [x, y, 0, x + w, y, 0, x + w, y + h, 0, x, y + h, 0],
      faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false,
      imageSurface: { asset: { width: canvas.width, height: canvas.height, load: () => image },
        rect: [x, y, w, h], cutout: true, soft, blend: soft ? "add" : null, bright } };
  };
  const picture = variants(key => {
    const image = sources[Math.min(2, key)], canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth + 2; canvas.height = image.naturalHeight + 2;
    const g = canvas.getContext("2d");
    if (key === 3) { g.translate(canvas.width, 0); g.scale(-1, 1); }
    g.drawImage(image, 1, 1);
    return sprite(canvas, image.naturalHeight, 1, 0.35);
  });
  const wisp = cached(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const g = canvas.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(70,255,114,0.9)"); grad.addColorStop(0.45, "rgba(70,255,114,0.45)"); grad.addColorStop(1, "rgba(70,255,114,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return sprite(canvas, 128, 64, 0.9, true);
  });
  const embers = cached(() => ["#ff9a2e", "#ffcf6b", "#ff6a10"].map((c, i) => BL.models.particleGeometry(c, i ? 0.05 : 0.06, 1)));
  const motes = cached(() => ["#7dff9a", "#c8ffd4", "#2fd85a"].map((c, i) => BL.models.particleGeometry(c, i ? 0.05 : 0.06, 1)));
  // The herald as it is drawn, `height` tall in `group`: its picture turned to the camera, front, back or side as it
  // moves across the view, four green wisps circling it and embers off it. `place(dt, x, y, z, now)` stands its foot at
  // (x, y, z) once a frame; `used` holds every geometry it has worn.
  const figure = ({ group, camera, fx, height = HEIGHT }) => {
    const herald = createNode(), wisps = [], used = new Set(), glow = wisp(), sparks = embers(), trail = motes();
    addChild(group, herald);
    used.add(glow);
    for (let i = 0; i < 4; i++) { const node = createNode({ geometry: glow }); addChild(group, node); wisps.push(node); }
    prepare();
    let lastX = NaN, lastZ = NaN, view = 0;
    const place = (dt, x, y, z, now) => {
      if (dt > 0 && Number.isFinite(lastX)) {
        const vx = (x - lastX) / dt, vz = (z - lastZ) / dt, dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz) || 1;
        const sx = (-vx * dz + vz * dx) / d, sy = -(vx * dx + vz * dz) / d;
        if (Math.hypot(sx, sy) > 0.17) view = Math.abs(sy) > Math.abs(sx) * 1.2 ? sy > 0 ? 0 : 1 : sx > 0 ? 3 : 2;
      }
      lastX = x; lastZ = z;
      if (sources[Math.min(2, view)]) { herald.geometry = picture(view); used.add(herald.geometry); }
      const vx = camera.target.x - camera.position.x, vy = camera.target.y - camera.position.y, vz = camera.target.z - camera.position.z;
      const across = Math.hypot(vx, vz), up = camera.up, tip = -Math.atan2(-vy, across), s = Math.sin(tip);
      herald.rotation.y = across > 1e-4 * Math.abs(vy) || !up ? Math.atan2(-vx, -vz) : Math.atan2(-up.x, -up.z);
      herald.rotation.x = tip;
      herald.position.x = x - height / 2 * Math.sin(herald.rotation.y) * s;
      herald.position.y = y + height / 2 * (1 - Math.cos(tip));
      herald.position.z = z - height / 2 * Math.cos(herald.rotation.y) * s;
      herald.scale.x = herald.scale.y = herald.scale.z = height;
      if (Math.random() < dt * 2.5) fx.spawnParticle(sparks[Math.random() * 3 | 0], x + (Math.random() - 0.5) * 0.6, y + 0.2, z + (Math.random() - 0.5) * 0.6, 0, 0.3, 0, 1.2, 1, -0.3, -50);
      for (let i = 0; i < wisps.length; i++) {
        const node = wisps[i], angle = now / 650 + i * TAU / 4, size = 0.42 * (0.8 + 0.2 * Math.sin(now / 130 + i * 2));
        node.position.x = x + Math.cos(angle) * 0.42 * height * 1.15;
        node.position.y = y + (0.55 + 0.18 * Math.sin(angle * 2 + i)) * height;
        node.position.z = z + Math.sin(angle) * 0.42 * height * 1.15;
        node.scale.x = node.scale.y = node.scale.z = size; node.smokeOpacity = 0.95;
        node.rotation.y = Math.atan2(camera.position.x - node.position.x, camera.position.z - node.position.z);
        if (Math.random() < dt * 9) fx.spawnParticle(trail[i % 3], node.position.x, node.position.y, node.position.z, 0, 0.15, 0, 0.6, 2, 0.2, -50);
      }
    };
    return { herald, used, place };
  };
  // The arcade's ghost arena keeps its hunt on the server (worker/src/games/ghost-hunt.js): while this page stands in
  // the arena or its hallway, signed in and offered the game, it holds a socket to the hunt (game-net.js) and follows
  // it, `role` "follow"; anywhere else, signed out or with no backend, it is "solo" and runs its own hunt. The hunt
  // reads each state the server sends through `extra.read` and each motion frame through `onMotion`, and tells the
  // server what its player does with `send`. `update()` once a frame opens and closes the socket as the page comes and
  // goes.
  const KIND = "ghost-hunt", VENUE = "arena", WATCH = new Set(["ghost-arena", "arcade-hunt", "arcade.arena", "arcade.haunt", "ghost-arena.haunt"]);
  const channel = () => {
    const net = BL.net, gameNet = BL.gameNet;
    let extra = null, motion = null, link = null;
    const update = () => {
      const want = gameNet.offers(KIND) && WATCH.has(net.state.zone);
      if (want && !link) link = gameNet.open(KIND, VENUE, { state: (msg) => { if (extra) extra.read(msg.s); }, motion: (frame) => { if (motion) motion(frame); } });
      else if (!want && link) { link.close(); link = null; }
    };
    return {
      update, dispose: () => { if (link) link.close(); link = extra = motion = null; },
      // Following whenever the server offers the hunt to this signed-in page, socket open or not (out in the hall it hears
      // nothing, and a hunt shown drifts away), unless the server refused this page (a newer tab, a full instance).
      get role() { return gameNet.offers(KIND) && !(link && link.refused) ? "follow" : "solo"; },
      get link() { return link; },
      serverNow: () => link && link.synced ? link.serverNow() : net.serverNow(),
      send: (msg) => !!link && link.send(msg),
      get extra() { return extra; }, set extra(value) { extra = value; },
      get onMotion() { return motion; }, set onMotion(value) { motion = value; }
    };
  };
  // The herald before its hunt has loaded, its foot at `heraldAt(now)` on the room's clock, `heraldHeight` tall, woken
  // by a shot and, where `tapWakes`, a click.
  const create = ({ root, camera, npcSync, addTarget, removeTarget, hud, fx, attach, heraldAt, heraldHeight = HEIGHT, tapWakes = false }) => {
    const net = BL.net, group = createNode({ sightHidden: true });
    addChild(root, group);
    const { herald, used, place } = figure({ group, camera, fx, height: heraldHeight });
    let disposed = false, removed = false, loading = false, failed = false, game = null, localStart = false, snapshot = null;
    const detach = () => {
      if (removed) return;
      removed = true;
      removeTarget(herald); removeChild(root, group);
      if (npcSync.extra === extra) npcSync.extra = null;
    };
    const complete = () => {
      if (disposed) return;
      game = attach();
      loading = false;
      detach();
      // The last state the server sent while loading, as a page that had loaded would have it.
      if (snapshot && npcSync.role === "follow") game.restore(snapshot);
      if (localStart) game.start();
      snapshot = null;
    };
    const fail = () => {
      if (disposed) return;
      loading = false; failed = true;
      hud.toast("Ghost hunt couldn't load · click the ghost to retry");
    };
    const wake = (local = false) => {
      if (disposed || game) return;
      if (local) localStart = true;
      if (loading) return;
      loading = true; failed = false;
      hud.toast("Preparing the ghost hunt…");
      const pending = BL.deferred.load("halloween");
      if (pending) pending.then(complete, fail);
      else complete();
    };
    // v1's first state slot is its phase (0 idle, 1..10 an active hunt or lobby). The full simulator validates
    // the snapshot before applying it; this listener only decides whether there is a hunt worth loading.
    const extra = { read: snap => {
      if (disposed || game || npcSync.role !== "follow" || !snap || snap.v !== 1 || !Array.isArray(snap.s)
        || !Number.isInteger(snap.s[0]) || snap.s[0] < 0 || snap.s[0] > 10) return;
      snapshot = snap;
      if (snap.s[0] && !failed) wake();
    } };
    npcSync.extra = extra;
    const owner = { kind: "halloween", role: "herald", priority: 3, weaponType: "object", active: true,
      tooltip: () => loading ? "The ghost hunt is loading…" : failed ? "Ghost hunt couldn't load · click to retry"
        : "A restless ghost · click it to start the ghost hunt",
      tap: () => { if (failed || tapWakes) wake(tapWakes); } };
    addTarget(herald, owner);
    const update = dt => {
      if (disposed || game) return;
      const now = net.serverNow(), at = heraldAt(now);
      place(dt, at.x, at.y, at.z, now);
    };
    const hit = (byPlayer, shot) => { if (byPlayer && shot) wake(true); };
    const dispose = () => { disposed = true; loading = false; detach(); snapshot = game = null; used.clear(); };
    return { update, hit, dispose, herald, liveGeometry: set => { if (!removed) for (const geo of used) set.add(geo); },
      debug: { herald, get state() { return game ? game.debug.state : "IDLE"; }, get loading() { return loading; },
        get loaded() { return !!game; }, start: () => wake(true) } };
  };
  BL.ghostEntry = { create, figure, channel };
})();
