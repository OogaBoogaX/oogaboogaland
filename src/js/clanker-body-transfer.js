// Minimal browser recovery wire, independent of the host's packed storage.
// Trusted world boot supplies the owner, physics profile and source rules.
// This validates data only; the reclaim coordinator still owns activation.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX_BYTES = 2048, encoder = new TextEncoder();
  const id = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  const fail = () => { throw Error("incompatible Clanker body transfer"); };
  const data = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every(k => {
      const d = Object.getOwnPropertyDescriptor(value, k); return d && Object.hasOwn(d, "value");
    });
  const tuple = values => Array.isArray(values) && values.length === 10 && Reflect.ownKeys(values).length === 11
    && Array.from({ length: 10 }, (_, i) => Object.getOwnPropertyDescriptor(values, i)).every(d => d && Object.hasOwn(d, "value"));
  function create({ world, baseline, owner, rules }) {
    if (!id(world) || !id(owner) || !Array.isArray(baseline) || typeof rules?.validate !== "function") fail();
    const profile = JSON.stringify(baseline);
    if (profile.length > 1024) fail();
    const valid = body => { if (!tuple(body) || body[0] !== owner || rules.validate(body) !== true) fail(); return body; };
    return Object.freeze({
      encode(values) {
        const body = valid(values).map(v => Object.is(v, -0) ? "-0" : v);
        const value = { v: 1, world, profile, body };
        if (encoder.encode(JSON.stringify(value)).byteLength > MAX_BYTES) fail();
        return value;
      },
      read(value) {
        if (!data(value, ["v", "world", "profile", "body"]) || value.v !== 1 || value.world !== world
          || value.profile !== profile || !tuple(value.body)) fail();
        // JSON otherwise loses signed zero. No generic object schema or state
        // expansion is accepted; the source validator bounds exactly ten slots.
        const body = value.body.map((v, i) => i > 0 && v === "-0" ? -0 : v);
        valid(body);
        if (encoder.encode(JSON.stringify(value)).byteLength > MAX_BYTES) fail();
        return body;
      },
    });
  }
  function forBody(sim, world) {
    const bridge = sim?.bodyCheckpoint;
    if (!bridge || sim.list?.length !== 1 || sim.player || bridge.capture()[0] !== 0) fail();
    const codec = create({ world, baseline: bridge.baseline(), owner: sim.list[0].owner.id, rules: bridge.records });
    let consumed = false, restored = false;
    return Object.freeze({
      restore(value, { frozen = false } = {}) {
        if (typeof frozen !== "boolean") fail();
        if (consumed || sim.player || bridge.capture()[0] !== 0) fail();
        consumed = true; // A failed/partial restore also requires a fresh body.
        bridge.restoreBody(codec.read(value), false, frozen);
        if (!sim.player) fail();
        restored = true; return true;
      },
      // Data only: no transmission, authority claim or input neutralization.
      // The authenticated movement path must commit this with its session.
      capture() {
        if (!restored || sim.active !== true || sim.player !== sim.list[0]
          || typeof bridge.liveBodyState !== "function") fail();
        return codec.encode(bridge.liveBodyState());
      },
    });
  }
  function reclaimAdapter({ world, createBody, attach, detach }) {
    if (!id(world) || ![createBody, attach, detach].every(f => typeof f === "function")) fail();
    let held = null, preparing = false;
    const { createNode, addChild, removeChild } = BL.scene;
    const unstage = value => {
      if (!value.stage) return;
      const root = value.actor.root;
      if (root.parent !== value.parent) {
        if (root.parent) removeChild(root.parent, root);
        addChild(value.parent, root);
      }
      if (value.stage.parent) removeChild(value.stage.parent, value.stage);
      value.stage = null;
    };
    const destroy = value => {
      // The source controller disposes against its original scene root.
      // Reparent synchronously before disposal; no provisional rig is rendered.
      try { unstage(value); } finally { value.sim.dispose(); }
    };
    const make = (preparation, preview) => {
      const sim = createBody(JSON.parse(JSON.stringify(preparation)), preview);
      let value;
      try {
        if (!sim || sim.then || !["activate", "suspend", "dispose", "control", "update"].every(k => typeof sim[k] === "function")) fail();
        value = { sim, decoder: forBody(sim, world), actor: sim.list[0], stage: null };
        value.parent = value.actor.root?.parent;
        if (!value.parent || !Array.isArray(value.parent.children)) fail();
        // Keep the source root's visibility invariant for physics/checkpoint
        // validation, but hide its entire subtree from the scene until live ACK.
        value.stage = createNode({ visible: false });
        addChild(value.parent, value.stage);
        removeChild(value.parent, value.actor.root); addChild(value.stage, value.actor.root);
        return value;
      } catch (error) { if (value) destroy(value); else sim?.dispose?.(); throw error; }
    };
    const owned = resource => { if (!held || resource !== held) fail(); return held; };
    return {
      prepare(preparation) {
        if (held || preparing || preparation.world !== world || preparation.kind !== "clanker") fail();
        const copy = JSON.parse(JSON.stringify(preparation));
        preparing = true;
        try { held = { ...make(copy, false), preparation: copy, attached: false }; return held; }
        finally { preparing = false; }
      },
      preflight(resource, transfer) {
        const value = owned(resource), preview = make(value.preparation, true);
        try { return preview.decoder.restore(transfer.checkpoint, { frozen: true }); }
        finally { destroy(preview); }
      },
      apply(resource, transfer) {
        const value = owned(resource);
        const view = JSON.parse(JSON.stringify(transfer.view));
        if (!value.decoder.restore(transfer.checkpoint, { frozen: true })) return false;
        value.view = view;
        value.scope = { world: transfer.world, epoch: transfer.epoch, revision: transfer.revision };
        return true;
      },
      activate(resource) {
        const value = owned(resource);
        if (value.attached) fail();
        if (!value.sim.activate()) return false;
        // Detach must also unwind a partially failed camera/control attachment.
        try {
          unstage(value); value.attached = true;
          const accepted = attach(value.sim, JSON.parse(JSON.stringify(value.preparation)), value.view, { ...value.scope });
          if (held !== value) return false; // A synchronous scene exit already disposed it.
          if (accepted === true) return true;
        } catch (error) {
          if (held === value) { value.actor.root.visible = false; value.sim.suspend(); }
          throw error;
        }
        value.actor.root.visible = false; value.sim.suspend(); return false;
      },
      capture(resource) {
        const value = owned(resource);
        if (!value.attached) fail();
        return value.decoder.capture();
      },
      release(resource) {
        if (resource !== held || !held) return;
        const value = held; held = null;
        try { value.sim.suspend(); }
        finally {
          try { if (value.attached) detach(value.sim, value.preparation); }
          finally { destroy(value); }
        }
      },
    };
  }
  BL.clankerBodyTransfer = { MAX_BYTES, create, forBody, reclaimAdapter };
})();
