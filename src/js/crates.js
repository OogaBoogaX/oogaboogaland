(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { lerp, ease, fnv1a, angleDelta } = BL.math;
  const { addChild, removeChild, addTween } = BL.scene;
  const { CONFETTI } = BL.fx;
  const { DROP_HEIGHT } = BL.pile;
  const MAX_CRATES = 3;
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  // Loot crates for one scene
  const create = (ctx) => {
    const { root, input, hud, game, camera } = ctx;
    const crates = [];
    // Twelve landing slots, 30 degrees apart
    const CRATE_SLOTS = Array.from({ length: 12 }, (_, i) => {
      const angle = i / 12 * Math.PI * 2;
      return { angle, x: Math.cos(angle) * 4.4, z: Math.sin(angle) * 4.4, taken: false };
    });
    // Free slot nearest the camera
    const claimCrateSlot = () => {
      const toCamera = Math.atan2(camera.position.z, camera.position.x);
      let best = null;
      for (const slot of CRATE_SLOTS) {
        if (slot.taken) continue;
        if (!best || angleDelta(slot.angle, toCamera) < angleDelta(best.angle, toCamera)) best = slot;
      }
      if (best) best.taken = true;
      return best;
    };
    const removeCrate = (crate) => {
      const i = crates.indexOf(crate);
      if (i >= 0) crates.splice(i, 1);
      if (crate.slot) crate.slot.taken = false;
      input.remove(crate.body);
      removeChild(root, crate.node);
    };
    const openCrate = (crate) => {
      if (crate.opened) return;
      crate.opened = true;
      const entry = game.addItem({ item: crate.loot.item, tier: crate.loot.tier, donationId: crate.donationId });
      const tierColor = models.TIER_COLORS[crate.loot.tier];
      addTween({
        dur: 0.45, ease: ease.outBack, update: (k) => {
          crate.lid.rotation.z = -2.1 * k;
        }
      });
      ctx.fx.burst(crate.node.position.x, crate.node.position.y + 0.5, crate.node.position.z, 18, [models.particleGeometry(tierColor, 0.08, 0.9), ...CONFETTI], 2.4);
      const reveal = crate.loot.item.buildNode();
      Object.assign(reveal.position, { x: 0, y: 0.4, z: 0 });
      addChild(crate.node, reveal);
      addTween({
        dur: 1.5, ease: ease.outQuad, update: (k) => {
          reveal.position.y = 0.4 + k * 1.1;
          reveal.rotation.y = k * Math.PI * 4;
        }, done: () => {
          addTween({
            dur: 0.35, ease: ease.inQuad, update: (k) => {
              const s = Math.max(0.01, 1 - k);
              setVec(crate.node.scale, s, s, s);
            }, done: () => removeCrate(crate)
          });
        }
      });
      hud.toast(entry ? `Loot: ${crate.loot.item.name} (${crate.loot.tier})` : `${crate.loot.item.name}: locker full`);
      ctx.crew.renderLocker();
      hud.selectTab("loot");
      hud.hint("Assign your new swag to a caveman in the Loot tab.", 5000);
      return entry;
    };
    const spawnCrate = (donation, loot, delay) => {
      const unopened = crates.filter((c) => !c.opened);
      if (unopened.length >= MAX_CRATES) openCrate(unopened[0]);
      const spot = claimCrateSlot();
      if (!spot) {
        game.addItem({ item: loot.item, tier: loot.tier, donationId: donation.id });
        ctx.crew.renderLocker();
        return;
      }
      const { node, lid } = models.crate(loot.tier);
      Object.assign(node.position, { x: spot.x, y: DROP_HEIGHT, z: spot.z });
      node.rotation.y = fnv1a(`${donation.id}/ry`) % 100 / 100 * Math.PI;
      node.visible = false;
      addChild(root, node);
      const crate = { node, lid, body: node.children[0], loot, donationId: donation.id, opened: false, phase: fnv1a(donation.id) % 7, slot: spot };
      input.add(crate.body, { kind: "crate", crate, priority: 2 }, { radius: 0.7 });
      crates.push(crate);
      addTween({
        delay, dur: 0.8, ease: ease.outBounce, update: (k) => {
          node.visible = true;
          node.position.y = lerp(DROP_HEIGHT, 0, k);
        }, done: () => ctx.fx.burst(spot.x, 0.2, spot.z, 8, CONFETTI, 1.5)
      });
    };
    const update = (dt, elapsed) => {
      for (const crate of crates) {
        if (crate.opened) continue;
        crate.node.rotation.y += dt * 0.4;
        crate.body.glow = 1 + Math.sin(elapsed * 3 + crate.phase) * 0.5;
      }
    };
    const dispose = () => {
      while (crates.length) removeCrate(crates[crates.length - 1]);
    };
    const stats = () => ({ crates: crates.length });
    return { list: crates, spawnCrate, openCrate, removeCrate, update, dispose, stats };
  };
  BL.crates = { create, MAX_CRATES };
})();
