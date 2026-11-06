// Display adapter for the complete authoritative Clanker roster. It never steps
// AI or physics. World items keep their stable lab identity across late joins.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const create = ({ getClankers, getLab, releaseLabItem, onModelChange }) => {
    const labPose = BL.npcLabPose.create(getLab);
    let active = false, world = null, projectors = [], entries = null;
    const roster = () => getClankers?.()?.list || [];
    const reset = (hide = false) => {
      for (const entry of roster()) {
        releaseLabItem?.(entry);
        if (hide) entry.root.visible = false;
      }
      world = null; entries = null; projectors = [];
    };
    const prepare = server => {
      if (server && !active) reset(true);
      if (!server && active) reset();
      active = server;
    };
    const apply = packet => {
      const list = roster(), equipment = getLab?.()?.equipment;
      if (!active || !equipment || packet.clankers.length !== list.length || !list.length) return false;
      try {
        // A partial or differently ordered cast cannot leave a local actor behind.
        const claims = new Set(), items = packet.clankers.map((row, index) => {
          if (row.index !== index || row.pose.world !== packet.world) throw Error("Clanker cast mismatch");
          if (row.pose.held === null) return null;
          const item = equipment.find((item, i) => `${i}:${item.kind}:${item.station}` === row.pose.held);
          if (!item || claims.has(item)) throw Error("Clanker held item mismatch");
          claims.add(item); return item;
        });
        const held = new Set(packet.clankers.map(row => row.pose.held).filter(Boolean));
        if (packet.lab) labPose.validate(packet.lab, held);
        if (world !== packet.world || entries !== list) {
          reset(true); world = packet.world; entries = list;
          projectors = list.map(entry => entry.gorilla.createPoseProjector(world));
        }
        // Release all changed claims first, so swapping hands does not depend
        // on actor order. No frame is rendered between binding and validation.
        for (let i = 0; i < list.length; i++) {
          if (list[i].gorilla.labItem !== (items[i]?.node || null)) releaseLabItem(list[i]);
        }
        for (let i = 0; i < list.length; i++) {
          const item = items[i], entry = list[i];
          if (item && entry.gorilla.labItem !== item.node) {
            if (item.holder || !entry.gorilla.holdLabItem(item.node)) throw Error("Clanker held item unavailable");
            item.holder = entry; item.rolling = false;
          }
          projectors[i].validate(packet.clankers[i].pose, packet.clankers[i].pose.held);
        }
        for (let i = 0; i < list.length; i++) {
          const entry = list[i], pose = packet.clankers[i].pose;
          projectors[i].apply(pose, pose.held);
          entry.active = !!pose.nodes[0][1];
          entry.heading = entry.root.rotation.y;
          onModelChange(entry);
        }
        if (packet.lab) labPose.apply(packet.lab, held);
        return true;
      } catch {
        // Fail closed on incompatible held topology/profile. Keep local AI
        // fenced; the next complete compatible snapshot can rebuild the display.
        reset(true); return false;
      }
    };
    return { prepare, apply, reset, dispose() { reset(); active = false; } };
  };
  BL.npcClankerSync = { create };
})();
