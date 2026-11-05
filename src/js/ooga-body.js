// Independent standard-pose recovery. The trusted scene supplies the fixed
// world/profile and clearance queries; no NPC object or resource map is reused.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, encoder = new TextEncoder();
  const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
    && Reflect.ownKeys(o).length === keys.length && keys.every(k => {
      const d = Object.getOwnPropertyDescriptor(o, k); return d && Object.hasOwn(d, "value");
    });
  const fail = () => { throw Error("incompatible Ooga body recovery"); };
  const equipmentKeys = ["weapon", "mode", "primaryOwned", "secondaryOwned", "selectedSlot", "unlimited", "jetpack", "jetpackOwned"];
  const number = n => n === "-0" ? -0 : n;
  const wireNumber = n => Object.is(n, -0) ? "-0" : n;
  function codec({ world, profile, name }) {
    if (![world, profile, name].every(id)) fail();
    const read = value => {
      if (!exact(value, ["v", "kind", "world", "profile", "name", "position", "equipment"])
        || value.v !== 1 || value.kind !== "ooga" || value.world !== world || value.profile !== profile || value.name !== name
        || !exact(value.position, ["x", "y", "z", "yaw"]) || !exact(value.equipment, equipmentKeys)) fail();
      const p = { x: number(value.position.x), y: number(value.position.y), z: number(value.position.z), yaw: number(value.position.yaw) }, e = value.equipment;
      if (![p.x, p.y, p.z].every(n => Number.isFinite(n) && Math.abs(n) <= 1e6)
        || !Number.isFinite(p.yaw) || Math.abs(p.yaw) > 2 * Math.PI
        || ![null, "primary", "gun"].includes(e.weapon) || !["carry", "combat"].includes(e.mode)
        || ![1, 2].includes(e.selectedSlot)
        || ![e.primaryOwned, e.secondaryOwned, e.unlimited, e.jetpack, e.jetpackOwned].every(v => typeof v === "boolean")
        || e.weapon === "primary" && !e.primaryOwned || e.weapon === "gun" && !e.secondaryOwned
        || e.jetpack && !e.jetpackOwned || encoder.encode(JSON.stringify(value)).byteLength > 2048) fail();
      return { position: p, equipment: Object.fromEntries(equipmentKeys.map(k => [k, e[k]])) };
    };
    return {
      read,
      encode(position, equipment) {
        if (!exact(position, ["x", "y", "z", "yaw"]) || !exact(equipment, equipmentKeys)) fail();
        const value = { v: 1, kind: "ooga", world, profile, name,
          position: { x: wireNumber(position.x), y: wireNumber(position.y), z: wireNumber(position.z), yaw: wireNumber(position.yaw) },
          equipment: Object.fromEntries(equipmentKeys.map(k => [k, equipment[k]])) };
        read(value); return value;
      },
    };
  }
  function create({ world, profile, name, context, clear, jetpack }) {
    const wire = codec({ world, profile, name });
    if (!context?.root || !Array.isArray(context.root.children) || typeof context.groundAt !== "function"
      || typeof clear !== "function" || typeof BL.crew?.create !== "function"
      || ![context.input?.add, context.input?.remove].every(f => typeof f === "function")) fail();
    const { createNode, addChild, removeChild } = BL.scene;
    const group = createNode({ visible: false }), parent = context.root;
    const targets = new Map(), registered = new Set(), input = Object.create(context.input);
    input.add = (node, owner) => { targets.set(node, owner); };
    input.remove = node => {
      targets.delete(node);
      if (registered.has(node)) { context.input.remove(node); registered.delete(node); }
    };
    const unregister = () => {
      let error;
      for (const node of registered) {
        try { context.input.remove(node); registered.delete(node); }
        catch (caught) { error ||= caught; }
      }
      if (error) throw error;
    };
    // The NPC's mutable health, ammunition and legacy magazine are never used.
    const bodyContext = { ...context, root: group, playerName: name, input,
      hud: { ...context.hud, setRosterRow() {} },
      world: { ...context.world, weapons: new Map(), health: new Map(),
        magazine: { owned: false, count: 0, ammo: 0, carrier: null } } };
    let crew, actor, saved = null, gear = null, active = false, disposed = false, consumed = false, attempted = false;
    addChild(parent, group);
    try {
      crew = BL.crew.create(bodyContext); actor = crew.cavemen.get(name);
      if (!actor || crew.cavemen.size !== 1 || crew.player || !Number.isFinite(actor.baseY)
        || !Number.isFinite(actor.bodyRadius) || actor.bodyRadius <= 0 || !Number.isFinite(actor.bodyHeight) || actor.bodyHeight <= 0) fail();
    } catch (error) { try { crew?.dispose(); } finally { removeChild(parent, group); } throw error; }
    const check = position => {
      const floor = bodyContext.groundAt(position.x, position.z, position.y, position.y, actor);
      // The current crew needs finite support to express hop height. Missing
      // support/overlap needs an explicit world policy, never a guessed floor.
      if (!Number.isFinite(floor) || floor > position.y + 1e-6
        || clear(position.x, position.y, position.z, actor.bodyRadius, actor.bodyHeight, actor) !== true) fail();
      return floor;
    };
    const ready = () => { if (disposed) fail(); };
    const equip = e => {
      const w = actor.weapon;
      w.primaryOwned = e.primaryOwned; w.secondaryOwned = e.secondaryOwned; w.unlimited = e.unlimited;
      if (crew.selectWeapon(e.weapon === "primary" ? 1 : e.weapon === "gun" ? 2 : 0, actor) !== true) fail();
      w.selectedSlot = e.selectedSlot; w.aiming = e.mode === "combat";
      crew.setJetpackOwnership(actor, e.jetpackOwned, gear?.geometry, gear?.flameGeometry);
      if (e.jetpack && !crew.wearJetpack(actor, actor.jetpackGeometry, actor.jetpackFlameGeometry)) fail();
      actor.jetFuel = 1; actor.jetRecovering = false;
      if (actor.jet) crew.thrust(false);
      crew.poseWeapon(actor);
    };
    return {
      crew, actor, context: bodyContext,
      restore(value) {
        ready(); if (consumed || active || crew.player) fail();
        const next = wire.read(value); check(next.position); consumed = true;
        if (next.equipment.jetpackOwned && !actor.parts.jetpack) {
          if (typeof jetpack !== "function") fail();
          gear = jetpack(); if (!gear?.geometry || !gear.flameGeometry) fail();
        }
        // Fresh crew construction supplies the standard pose and default
        // resources. Do not run its controller or acquire input during prepare.
        saved = next;
        Object.assign(actor.root.position, { x: next.position.x, y: next.position.y + actor.baseY, z: next.position.z });
        actor.root.rotation.y = next.position.yaw;
        return true;
      },
      activate() {
        ready(); if (!saved || attempted || active || crew.player) fail(); attempted = true;
        const floor = check(saved.position);
        try {
          if (crew.control(actor) !== true) fail();
          equip(saved.equipment);
          // Ordinary control snaps to support. Restore the accepted world
          // height afterward, with zero momentum and no held action replay.
          crew.relocatePlayer(saved.position, saved.position.yaw);
          actor.hop = Math.max(0, saved.position.y - floor); actor.hopV = 0;
          check(saved.position);
          for (const [node, owner] of targets) { registered.add(node); context.input.add(node, owner); }
          active = true; group.visible = true; return true;
        } catch (error) {
          group.visible = false;
          try { crew.release(); } finally { unregister(); }
          throw error;
        }
      },
      capture() {
        ready(); if (!active || crew.player !== actor) fail();
        const p = actor.root.position, w = actor.weapon;
        return wire.encode({ x: p.x, y: p.y - actor.baseY, z: p.z, yaw: actor.root.rotation.y },
          { weapon: w.primaryEquipped ? "primary" : w.equipped ? "gun" : null, mode: w.aiming ? "combat" : "carry",
            primaryOwned: w.primaryOwned, secondaryOwned: w.secondaryOwned, selectedSlot: w.selectedSlot,
            unlimited: w.unlimited, jetpack: !!actor.jet, jetpackOwned: actor.jetpackOwned });
      },
      update(dt, now) {
        ready(); if (!active) return false;
        if (!Number.isFinite(dt) || dt <= 0 || dt > .25 || !Number.isFinite(now)) fail();
        crew.update(dt, now); return true;
      },
      suspend() {
        if (disposed || !active) return; active = false; group.visible = false;
        try { crew.release(); } finally { unregister(); }
      },
      dispose() {
        if (disposed) return; disposed = true; active = false; group.visible = false;
        try { crew.dispose(); }
        finally { try { unregister(); } finally { if (group.parent) removeChild(group.parent, group); } }
      },
      get active() { return active && !disposed; },
    };
  }
  function reclaimAdapter({ createBody, attach, detach }) {
    if (![createBody, attach, detach].every(f => typeof f === "function")) fail();
    let held = null, preparing = false;
    const make = preparation => {
      const body = createBody({ ...preparation });
      if (!body || body.then || !["restore", "activate", "capture", "suspend", "dispose"].every(k => typeof body[k] === "function")) {
        body?.dispose?.(); fail();
      }
      return body;
    };
    const owned = r => { if (!held || held !== r) fail(); return held; };
    return {
      prepare(preparation) {
        if (held || preparing || preparation.kind !== "ooga") fail();
        preparing = true;
        try { held = { body: make(preparation), preparation: { ...preparation }, attached: false }; return held; }
        finally { preparing = false; }
      },
      preflight(resource, transfer) {
        const r = owned(resource), preview = make(r.preparation);
        try { return preview.restore(transfer.checkpoint); } finally { preview.dispose(); }
      },
      apply(resource, transfer) {
        const r = owned(resource), view = transfer.view, e = transfer.checkpoint?.equipment;
        if (view?.kind !== "ooga" || !exact(e, equipmentKeys)
          || !equipmentKeys.every(k => view.equipment?.[k] === e[k])) fail();
        if (r.body.restore(transfer.checkpoint) !== true) return false;
        r.view = JSON.parse(JSON.stringify(view));
        r.scope = { world: transfer.world, epoch: transfer.epoch, revision: transfer.revision }; return true;
      },
      activate(resource) {
        const r = owned(resource); if (r.attached || !r.view || r.body.activate() !== true) fail();
        r.attached = true;
        try {
          const result = attach(r.body, { ...r.preparation }, r.view, { ...r.scope });
          if (held !== r) return false;
          if (result === true) return true;
          r.body.suspend(); return false;
        } catch (error) { if (held === r) r.body.suspend(); throw error; }
      },
      capture: resource => owned(resource).body.capture(),
      release(resource) {
        if (held !== resource || !held) return;
        const r = held; held = null;
        try { r.body.suspend(); }
        finally { try { if (r.attached) detach(r.body, r.preparation); } finally { r.body.dispose(); } }
      },
    };
  }
  BL.oogaBody = { codec, create, reclaimAdapter };
})();
