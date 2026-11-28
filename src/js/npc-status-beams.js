// Local, bounded presentation of the Hub's passive NPC status relocations. The
// pose is applied immediately; glyphs never move an actor, grant control or
// delay a state change.
(() => {
  'use strict';
  const BL = window.BL = window.BL || {}, CAPACITY = 20, DURATION = 0.55;
  const create = ({ root, crew, clankers }) => {
    if (!crew?.list || !clankers?.list || crew.list.length + clankers.list.length > 256)
      throw Error('bounded NPC beam roster required');
    const beams = BL.sleepBeam.create({ root, capacity: CAPACITY });
    const rows = crew.list.map(actor => ({ actor, companion: false }))
      .concat(clankers.list.map(actor => ({ actor, companion: true })));
    for (const row of rows) Object.assign(row, { warm: false, state: '', visible: false,
      x: 0, y: 0, z: 0, yaw: 0, fromX: 0, fromY: 0, fromZ: 0, fromYaw: 0,
      pending: false, departure: false, slot: -1, time: 0 });
    const slots = new Array(CAPACITY).fill(null);
    const cancel = row => {
      if (row.slot >= 0) { beams.hide(row.slot); slots[row.slot] = null; row.slot = -1; }
      row.pending = false;
    };
    return {
      update(dt) {
        if (!Number.isFinite(dt) || dt < 0) return;
        for (const row of rows) {
          const a = row.actor, r = a.root, p = r.position;
          const state = row.companion ? a.owner.state : a.state;
          // Controlled and remote player bodies are never passive, so never beamed.
          const visible = a.nonInteractive && r.visible && state !== 'away';
          // Clanking to chilling while in view is a walk (back along the route via
          // the pile), never a relocation: it shows no glyphs, here or on a
          // follower page reading the same streamed status. Every other change beams.
          const walked = row.visible && row.state === 'working' && state === 'chilling';
          if (row.warm && visible && (row.state !== state || !row.visible) && !walked) {
            cancel(row);
            row.fromX = row.x; row.fromY = row.y; row.fromZ = row.z; row.fromYaw = row.yaw;
            row.departure = row.visible; row.pending = true; row.time = 0;
          } else if (!visible) cancel(row);
          row.warm = true; row.state = state; row.visible = visible;
          row.x = p.x; row.y = row.companion ? p.y : p.y - a.baseY; row.z = p.z;
          row.yaw = row.companion ? a.heading : r.rotation.y;
          if (row.pending && row.slot < 0) {
            const slot = slots.indexOf(null);
            if (slot >= 0) { slots[slot] = row; row.slot = slot; row.pending = false; }
          }
          if (row.slot < 0) continue;
          row.time += Math.min(dt, 0.1);
          const departure = row.departure && row.time < DURATION;
          const phase = row.time - (row.departure ? DURATION : 0);
          if (!departure && phase >= DURATION) { cancel(row); continue; }
          beams.show(row.slot, departure ? row.fromX : row.x, departure ? row.fromY : row.y,
            departure ? row.fromZ : row.z, departure ? row.fromYaw : row.yaw,
            Math.max(0, departure ? row.time : phase) / DURATION, !departure, departure ? null : r);
        }
      },
      clear() { for (const row of rows) { cancel(row); row.warm = false; } },
      liveGeometry: beams.liveGeometry,
      dispose() { beams.dispose(); slots.fill(null); rows.length = 0; },
    };
  };
  BL.npcStatusBeams = { create };
})();
