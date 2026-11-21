// Focus-only authored scenery. Build models, never enter their scenes or start their media,
// NPCs, subscriptions or simulations. The ordinary camera adapters remain the fallback.
(() => {
  "use strict";
  const BL = window.BL, { createNode, addChild } = BL.scene;
  const node = (geometry, position, yaw = 0) => createNode({ geometry, ...(position ? { position } : {}),
    rotation: { x: 0, y: yaw, z: 0 } });
  const parts = object => Object.values(object).filter(g => g?.verts && g?.faces).map(g => node(g));
  // Resumable model builders use a smaller budget here than at a black doorway.
  const build = function* (fn, slice) { return fn.steps ? yield* fn.steps(slice) : fn(); };
  const recipe = function* (id, slice) {
    if (/^sphere-[1-7]$/.test(id)) {
      const room = Number(id.slice(7)), M = BL.timechainRoomModels;
      for (const step of M.prepareSteps(room)) { step(); yield; }
      const made = M.build(room);
      // These patches belong to live lectures, films and room services. Their
      // unpainted canvases must not cover the authored dome or imply playback.
      for (const live of made.live) live.node.visible = false;
      yield { nodes: [made.root], replace: true };
    } else if (id === "factory.hangar") {
      const M = BL.hangarModels, J = BL.jetModels, L = M.LAYOUT;
      const shell = yield* build(M.shell, slice); yield;
      const runway = yield* build(M.runway, slice); yield;
      yield { nodes: [...parts(shell), node(runway.flat), node(M.landing())], replace: true };
      // The actual docked aircraft replaces the rectangular camera stand-in.
      const jet = createNode({ position: { x: L.jet.x, y: 0, z: L.jet.z } });
      for (const g of J.pieces(J.STAGE)) addChild(jet, node(g));
      yield { nodes: [jet] };
      const walks = yield* build(M.catwalks, slice); yield;
      yield { nodes: [node(walks)] };
      const fixtures = yield* build(M.fixtures, slice); yield;
      yield { nodes: parts(fixtures) };
      const dock = yield* build(M.dock, slice); yield;
      yield { nodes: [node(dock)] };
    } else if (id === "factory.hall") {
      const M = BL.factoryModels, L = M.LAYOUT;
      const hall = yield* build(M.hall, slice); yield;
      const chamber = M.coreChamber();
      yield { nodes: [...parts(hall), node(M.coreBody()), node(chamber.lit)], replace: true };
      const scaffold = yield* build(M.scaffold, slice); yield;
      yield { nodes: [node(scaffold)] };
      const conduits = yield* build(M.conduits, slice); yield;
      yield { nodes: parts(conduits) };
      const forge = yield* build(M.forge, slice); yield;
      yield { nodes: [node(forge), node(M.forgeTrack())] };
      const caps = M.capacitor();
      for (const b of L.bays) {
        const bay = createNode({ position: { x: M.stationX(b), y: b.y, z: M.stationZ(b) } }), side = Math.sign(b.x);
        addChild(bay, node(M.stationFrame()), node(caps.blue.dim, { x: side * 1.2, y: 0, z: 0 }),
          node(caps.orange.dim, { x: -side * 1.2, y: 0, z: 0 }));
        yield { nodes: [bay] };
      }
      const treasury = createNode({ position: { x: L.treasury.x, y: L.treasury.y, z: L.treasury.z } }), T = M.TRE;
      addChild(treasury, ...parts(M.treasuryBody()), node(M.goldPile(), { x: 0, y: T.top, z: T.vz }),
        node(M.hopperFill(), { x: T.crate[0], y: 0.1, z: T.crate[1] }));
      for (const [x, z] of T.crates) addChild(treasury, node(M.goldCrate(), { x, y: 0, z }));
      yield { nodes: [treasury] };
    } else if (id === "arcade.hall") {
      const M = BL.arcadeModels, L = M.LAYOUT;
      const hall = yield* build(M.hall, slice); yield;
      const ceiling = yield* build(M.ceiling, slice); yield;
      const mezzanine = yield* build(M.mezzanine, slice); yield;
      yield { nodes: [node(hall.floor), node(hall.rock), node(hall.timber), node(ceiling), node(mezzanine.body)], replace: true };
      const stage = M.stage(), at = { x: M.STAGE.x, y: 0, z: M.STAGE.z };
      yield { nodes: [node(stage.body, at), node(stage.lit, at), ...parts(M.lanterns())] };
      for (const c of L.cabinets) {
        const cabinet = node(M.cabinet(c.index), { x: c.x, y: c.y || 0, z: c.z }, c.turn || 0);
        const frames = c.game >= 0 ? M.attractFrames(c.game) : M.retroFrames(c.retro);
        const screen = node(frames[0], { x: 0, y: M.SCREEN.y, z: M.SCREEN.z }); screen.rotation.x = M.SCREEN.lean;
        addChild(cabinet, screen);
        yield { nodes: [cabinet] };
      }
      const machine = (p, g) => {
        const holder = createNode({ position: { x: p.x, y: p.y || 0, z: p.z }, rotation: { x: 0, y: p.turn || 0, z: 0 } });
        const body = createNode({ position: { x: 0, y: g.dy || 0, z: g.dz || 0 }, rotation: { x: 0, y: g.turn || 0, z: 0 },
          scale: { x: g.scale || 1, y: 1, z: g.scale || 1 } });
        for (const key of ["body", "glow", "glass", "lamp"]) if (g[key]) addChild(body, node(g[key]));
        addChild(holder, body); return holder;
      };
      for (const p of L.skee) yield { nodes: [machine(p, M.skeeLane())] };
      for (const p of L.frames.hockey) {
        const g = M.airHockey();
        yield { nodes: [machine(p, { body: g.body, glow: g.lit, dz: -M.HOCKEY.w * M.HOCKEY.scale / 2 - 0.65, turn: Math.PI / 2, scale: M.HOCKEY.scale })] };
      }
      for (let i = 0; i < L.frames.pool.length; i++) yield { nodes: [machine(L.frames.pool[i], { ...M.poolTable(i), dz: -1.35 })] };
      const snack = M.snackBar(), p = L.snack;
      yield { nodes: [node(snack.body, { x: p.x, y: p.y || 0, z: p.z }, p.turn || 0),
        node(snack.lit, { x: p.x, y: p.y || 0, z: p.z }, p.turn || 0)] };
      const counter = M.prizeCounter(), prizes = L.prizes, shelf = L.shelf;
      yield { nodes: [node(counter.body, { x: prizes.x, y: prizes.y || 0, z: prizes.z }, prizes.turn || 0),
        node(counter.lit, { x: prizes.x, y: prizes.y || 0, z: prizes.z }, prizes.turn || 0),
        node(M.prizeShelf(), { x: shelf.x, y: shelf.y, z: shelf.z }, shelf.turn)] };
      yield { nodes: L.tables.map(([x, z]) => node(M.table(), { x, y: 0, z })) };
      for (const [x, z, i, y = 0, turn = 0] of L.planters) {
        const pot = node(M.planterPot(), { x, y, z }, turn), palm = i % 2 === 0, k = palm ? (y ? 0.42 : 0.55) : 1.5;
        const plant = node(palm ? BL.dressing.palm(i) : BL.hubModels.bush(i % 3), { x: 0, y: 0.58, z: 0 });
        Object.assign(plant.scale, { x: k, y: k, z: k }); addChild(pot, plant);
        yield { nodes: [pot] };
      }
    }
  };
  const attach = (source, id, renderer) => {
    const group = /^sphere-[1-7]$/.test(id) ? "timechain" : id === "factory.hangar" ? "hangar-scene" : id === "factory.hall" ? "factory-scene" : id === "arcade.hall" ? "arcade-scene" : null;
    if (!group) return;
    const scope = "observatory-detail-" + id, root = createNode({ visible: false }), meshes = new Map();
    const base = source.root.children.filter(n => !n.geometry?.cameraFeedVisitor).map(n => ({ node: n, visible: n.visible }));
    addChild(source.root, root);
    const slice = { budget: 2, until: 0, work: 0 };
    let generation = 0, iterator = null, pending = null, upload = 0, lastPublish = -Infinity, replaced = false, showing = false;
    const detail = source.focus = { state: "idle", revision: 0, batches: 0,
      restore() {
        if (showing) for (const b of base) b.node.visible = b.visible;
        showing = false; root.visible = false;
      },
      clear() {
        generation++; detail.restore(); iterator?.return(); iterator = pending = null;
        for (const g of meshes.values()) { renderer.releaseGeometry(g); source.meshes.delete(g); }
        meshes.clear(); root.children.length = 0; replaced = false; detail.state = "idle"; detail.batches = 0;
        lastPublish = -Infinity;
        BL.models.release(scope, ["hub", "timechain", "hangar", "factory", "arcade", "bifrost"]);
      },
      apply(enabled, stamp, headroom) {
        if (!enabled) return;
        if (headroom && detail.state === "idle") {
          detail.state = "loading"; const token = generation;
          const start = () => { if (token !== generation) return; iterator = recipe(id, slice); detail.state = "building"; };
          const loading = BL.deferred.load(group);
          if (loading) loading.then(start, () => { if (token === generation) detail.state = "unavailable"; });
          else start();
        }
        if (headroom && detail.state === "building") {
          if (!pending) {
            slice.until = performance.now() + slice.budget;
            const owner = group === "timechain" ? BL.timechainRoomModels : BL.models;
            const next = owner.withScope(scope, () => iterator.next());
            if (next.done) { iterator = null; detail.state = "ready"; }
            else if (next.value) {
              pending = next.value; pending.meshes = []; upload = 0;
              const wrap = n => {
                if (n.geometry) {
                  const original = n.geometry;
                  let g = meshes.get(original);
                  if (!g) {
                    g = { ...original, foliageLods: null, castShadow: false, cameraFeedSource: source, cameraFeedKeep: true,
                      cameraFeedPicture: !!original.imageSurface && !original.imageSurface.feed && !original.projective };
                    meshes.set(original, g); source.meshes.add(g); pending.meshes.push(g);
                  }
                  n.geometry = g;
                }
                for (const c of n.children) wrap(c);
              };
              for (const n of pending.nodes) wrap(n);
            }
          } else if (upload < pending.meshes.length) {
            // A few small meshes may share a capture's two-millisecond slice;
            // never upload a whole furnished room in one displayed frame.
            const until = performance.now() + 2;
            for (let count = 0; count < 4 && upload < pending.meshes.length; count++) {
              if (!renderer.prepareGeometry(pending.meshes[upload])) break;
              upload++;
              if (performance.now() >= until) break;
            }
          } else if (stamp - lastPublish >= 550) {
            addChild(root, ...pending.nodes); replaced ||= !!pending.replace;
            pending = null; lastPublish = stamp; detail.revision++; detail.batches++;
          }
        }
        root.visible = root.children.length > 0;
        if (root.visible && replaced) {
          for (const b of base) { b.visible = b.node.visible; b.node.visible = false; }
          showing = true;
        }
      }
    };
    const apply = detail.apply;
    detail.apply = (...args) => {
      try { apply(...args); }
      catch (error) {
        // An optional model or deferred chunk must never take down the room.
        detail.clear(); detail.state = "unavailable"; detail.error = String(error);
      }
    };
    const dispose = source.dispose;
    source.dispose = () => { detail.clear(); dispose(); };
  };
  BL.observatoryDetail = { attach };
})();
