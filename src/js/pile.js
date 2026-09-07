(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { lerp, damp, ease, randomInt } = BL.math;
  const { addChild, removeChild, addTween } = BL.scene;
  const DROP_HEIGHT = 4.3;
  const GROUND_DRAG_Y = 1.05;
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  // The banana pile of one scene
  const create = (ctx) => {
    const { root, input, hooks, hud, game, world, clampDrag, pileScale: SCALE = 1 } = ctx;
    const pileSlots = [];
    {
      // Slots fill by a radius and height key
      const RING_RADII = [0.24, 0.47, 0.72, 0.98, 1.26, 1.55, 1.85].map((r) => r * SCALE);
      const RING_COUNTS = [4, 7, 10, 14, 18, 23, 28];
      const STORY_H = 0.42 * SCALE;
      const STORY_MAX_RING = [6, 5, 4, 3, 2, 1];
      const jitter = (i, k) => Math.sin(i * 127.1 + k * 311.7) * 0.5;
      const candidates = [];
      let index = 0;
      for (let story = 0; story < STORY_MAX_RING.length; story++) {
        const baseY = 0.02 + story * STORY_H;
        for (let ring = 0; ring <= STORY_MAX_RING[story]; ring++) {
          const radius = RING_RADII[ring], count = RING_COUNTS[ring];
          const lift = (RING_RADII[STORY_MAX_RING[story]] - radius) * 0.1;
          for (let k = 0; k < count; k++, index++) {
            const angle = k / count * Math.PI * 2 + ring * 0.45 + story * 0.3;
            candidates.push({
              key: radius + baseY * 1.15 + jitter(index, 6) * 0.05,
              pos: { x: Math.cos(angle) * radius + jitter(index, 1) * 0.08, y: baseY + lift, z: Math.sin(angle) * radius + jitter(index, 2) * 0.08 },
              rot: { x: jitter(index, 3) * 0.18, y: angle + Math.PI / 2 + jitter(index, 4) * 0.5, z: jitter(index, 5) * 0.16 }
            });
          }
        }
      }
      candidates.sort((a, b) => a.key - b.key);
      for (const base of candidates) {
        const node = models.banana();
        Object.assign(node.position, base.pos);
        Object.assign(node.rotation, base.rot);
        node.visible = false;
        const slot = { node, base: { pos: base.pos, rot: base.rot }, token: 0, note: null, dragging: false };
        pileSlots.push(slot);
        addChild(root, node);
        input.add(node, { kind: "banana", slot, grab: true }, { radius: 0.34 * SCALE });
      }
    }
    let shown = 0;
    let deliveries = 0;
    let hatchOpen = 0, hatchTarget = 0;
    const pileEdge = () => {
      let r = 0;
      for (let i = 0; i < shown; i++) {
        const p = pileSlots[i].base.pos;
        r = Math.max(r, Math.hypot(p.x, p.z));
      }
      return r;
    };
    // Park a banana at its resting spot
    const restSlot = (slot) => {
      Object.assign(slot.node.position, slot.base.pos);
      Object.assign(slot.node.rotation, slot.base.rot);
      setVec(slot.node.scale, SCALE, SCALE, SCALE);
    };
    const flyOut = (slot, eater) => {
      const token = ++slot.token;
      const from = { ...slot.node.position };
      const to = eater ? ctx.crew.headWorldOf(eater) : { x: from.x, y: from.y + 1, z: from.z };
      addTween({
        dur: 0.65,
        ease: ease.inQuad,
        update: (k) => {
          if (slot.token !== token) return;
          slot.node.position.x = lerp(from.x, to.x, k);
          slot.node.position.y = lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 0.5;
          slot.node.position.z = lerp(from.z, to.z, k);
          const s = SCALE * (1 - k * 0.95);
          setVec(slot.node.scale, s, s, s);
        },
        done: () => {
          if (slot.token !== token) return;
          slot.node.visible = false;
          restSlot(slot);
          const note = slot.note;
          slot.note = null;
          if (eater && note) ctx.fx.say(eater, note.handle ? `${note.text} · @${note.handle}` : note.text, 3.4);
        }
      });
    };
    const dropIn = (slot, delay) => {
      const token = ++slot.token;
      const { pos, rot } = slot.base;
      slot.note = null;
      deliveries++;
      addTween({
        delay,
        dur: 0.75,
        ease: ease.outBounce,
        update: (k) => {
          if (slot.token !== token) return;
          slot.node.visible = true;
          setVec(slot.node.scale, SCALE, SCALE, SCALE);
          setVec(slot.node.position, lerp(pos.x * 0.3, pos.x, k), lerp(DROP_HEIGHT, pos.y, k), lerp(pos.z * 0.3, pos.z, k));
          setVec(slot.node.rotation, rot.x + (1 - k) * 4, rot.y, rot.z + (1 - k) * 2);
        },
        done: () => {
          deliveries--;
          if (slot.token !== token) return;
          restSlot(slot);
        }
      });
    };
    // Swap two slots to keep the pile contiguous
    const swapSlots = (i, j) => {
      const a = pileSlots[i], b = pileSlots[j];
      pileSlots[i] = b;
      pileSlots[j] = a;
      const base = a.base;
      a.base = b.base;
      b.base = base;
      for (const s of [a, b]) {
        if (s.dragging) continue;
        s.token++;
        s.node.visible = true;
        restSlot(s);
      }
    };
    const syncPile = (settle = false) => {
      const target = Math.floor(world.level);
      let stagger = 0;
      while (shown > target) {
        const topIndex = shown - 1;
        if (pileSlots[topIndex].dragging) {
          let other = -1;
          for (let i = topIndex - 1; i >= 0; i--) {
            if (!pileSlots[i].dragging) {
              other = i;
              break;
            }
          }
          if (other < 0) break;
          swapSlots(other, topIndex);
        }
        shown--;
        const workers = ctx.crew.eatingCavemen();
        flyOut(pileSlots[shown], workers.length ? workers[Math.floor(Math.random() * workers.length)] : null);
      }
      const delivered = [];
      while (shown < target) {
        const slot = pileSlots[shown];
        if (settle) {
          slot.node.visible = true;
        } else {
          dropIn(slot, 0.25 + stagger);
          stagger += 0.11;
          delivered.push(slot);
        }
        shown++;
      }
      if (delivered.length) hatchTarget = 1;
      if (ctx.onShown) ctx.onShown(shown);
      ctx.crew.updateFan();
      // A delivery brings the crew running, one banana does not
      if (delivered.length >= 2) ctx.crew.rush();
      return delivered;
    };
    const dragPoint = { x: 0, y: 0, z: 0 };
    let drag = null;
    let dragHinted = false;
    const nearestFeedable = (x, z, radius) => {
      let best = null, bestD = radius;
      for (const cave of ctx.crew.feedableCavemen()) {
        const d = Math.hypot(cave.root.position.x - x, cave.root.position.z - z);
        if (d < bestD) {
          bestD = d;
          best = cave;
        }
      }
      return best;
    };
    const setFeedTarget = (cave) => {
      if (drag && drag.target === cave) return;
      if (drag && drag.target) drag.target.highlightTarget = 0;
      if (drag) drag.target = cave;
      if (cave) cave.highlightTarget = 1;
    };
    const returnToPile = (slot) => {
      const token = ++slot.token;
      const from = { ...slot.node.position };
      addTween({ dur: 0.35, ease: ease.outQuad, update: (k) => {
        if (slot.token !== token) return;
        slot.node.position.x = lerp(from.x, slot.base.pos.x, k);
        slot.node.position.y = lerp(from.y, slot.base.pos.y, k);
        slot.node.position.z = lerp(from.z, slot.base.pos.z, k);
      }, done: () => {
        if (slot.token !== token) return;
        restSlot(slot);
        slot.dragging = false;
      } });
    };
    // Give the top banana to a caveman
    const giveTop = (slot, cave) => {
      shown--;
      world.level = Math.max(0, world.level - 1);
      if (ctx.onShown) ctx.onShown(shown);
      ctx.crew.updateFan();
      flyOut(slot, cave);
      cave.catchT = 1;
    };
    // A caveman helps itself to the top banana
    const eatFromPile = (cave) => {
      const top = shown - 1;
      if (top < 0 || deliveries > 0 || pileSlots[top].dragging) return false;
      giveTop(pileSlots[top], cave);
      return true;
    };
    const handFeed = (slot, cave) => {
      const idx = pileSlots.indexOf(slot);
      const top = shown - 1;
      if (idx < 0 || top < 0) return returnToPile(slot);
      if (idx !== top) swapSlots(idx, top);
      slot.dragging = false;
      giveTop(slot, cave);
      if (cave.state === "sleeping") ctx.fx.say(cave, "zzz... mmm banana", 2.2);
      else ctx.fx.say(cave, ["OOGA! Thank!", "Nom nom.", "Best banana."][randomInt(3)], 2);
      game.recordHandFed();
      hud.setStats(game.state);
    };
    Object.assign(hooks, {
      onGrabStart: (hit) => {
        const slot = hit.owner.slot;
        if (!slot.node.visible || slot.dragging || deliveries > 0 || pileSlots.indexOf(slot) >= shown) return false;
        slot.dragging = true;
        drag = { slot, target: null };
        hud.tooltip.hide();
        if (!dragHinted) {
          dragHinted = true;
          hud.hint("Drop it on a caveman to hand-feed.");
        }
        return true;
      },
      onGrabMove: (hit, p) => {
        if (!drag) return;
        if (input.groundPoint(p.x, p.y, GROUND_DRAG_Y, dragPoint)) {
          const s = drag.slot.node.position;
          clampDrag(dragPoint);
          s.x = dragPoint.x;
          s.y = GROUND_DRAG_Y;
          s.z = dragPoint.z;
          setFeedTarget(nearestFeedable(s.x, s.z, 1.35));
        }
      },
      onGrabEnd: (hit, p, dropHit, cancelled) => {
        if (!drag) return;
        const { slot } = drag;
        let target = drag.target;
        if (!cancelled && dropHit && dropHit.owner.kind === "caveman") target = dropHit.owner.cave;
        setFeedTarget(null);
        drag = null;
        if (target && !cancelled) handFeed(slot, target);
        else returnToPile(slot);
      }
    });
    const update = (dt) => {
      if (Math.floor(world.level) !== shown) syncPile();
      if (deliveries === 0 && hatchTarget === 1) hatchTarget = 0;
      hatchOpen = damp(hatchOpen, hatchTarget, 7, dt);
      if (drag) drag.slot.node.rotation.y += dt * 2.5;
    };
    const dispose = () => {
      for (const slot of pileSlots) {
        input.remove(slot.node);
        removeChild(root, slot.node);
      }
      pileSlots.length = 0;
      shown = 0;
      deliveries = 0;
      drag = null;
      delete hooks.onGrabStart;
      delete hooks.onGrabMove;
      delete hooks.onGrabEnd;
    };
    const stats = () => ({ slots: pileSlots.length, shown, deliveries });
    return {
      slots: pileSlots, syncPile, pileEdge, eatFromPile, update, dispose, stats,
      get shown() {
        return shown;
      },
      get hatchOpen() {
        return hatchOpen;
      },
      get inMotion() {
        return deliveries > 0 || !!drag;
      }
    };
  };
  BL.pile = { create, DROP_HEIGHT };
})();
