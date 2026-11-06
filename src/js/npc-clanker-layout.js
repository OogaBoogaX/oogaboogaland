// Authored gorilla rest/climb destinations, shared with authoritative startup.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = (island, slots, sites) => {
    const loungeRoofs = [], loungeAreas = [], climbRoofs = [], chillZones = [], descentWalls = [];
    for (const mouth of island.mouths) {
      const slot = slots.find(slot => slot.id === mouth.id);
      const site = sites.find(site => site.mouth === mouth), room = site?.room || mouth.room;
      const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
      // Reserve cave interiors at every lower level, leaving the roof above
      // the room ceiling available. Working and controlled gorillas bypass it.
      chillZones.push({
        x: mouth.x, z: mouth.z, sr, cr, half: room.w / 2 + 0.6,
        from: -room.to - 0.6, to: 0.5, top: mouth.floorY + room.h - 0.1
      });
      if (slot.status !== "dark") chillZones.push({
        x: mouth.x, z: mouth.z, sr, cr,
        half: 3.5, from: -0.5, to: 6.5, top: mouth.floorY + 2.6
      });
      const x = mouth.x - Math.sin(mouth.ry) * 4.8, z = mouth.z - Math.cos(mouth.ry) * 4.8;
      const y = island.surfaceAt(x, z);
      if (!Number.isFinite(y)) continue;
      const roof = { x, y, z, angle: mouth.ry };
      climbRoofs.push(roof);
      if (slot.status === "open" || slot.status === "mirror") descentWalls.push({
        x: mouth.x, z: mouth.z, sr, cr, half: room.w / 2 + 2,
        floor: mouth.floorY, middle: (y + mouth.floorY) * 0.5
      });
      if (slot.status === "dark" || slot.status === "headquarters") loungeRoofs.push(roof);
      if (slot.status === "dark") {
        loungeAreas.push({ x: mouth.x + sr * 6, z: mouth.z + cr * 6, radius: 9 });
      }
    }
    // The dressed gaps between neighbouring active caves are working space,
    // not chill routes. The same swept zones allow a former worker to leave.
    for (let i = 0; i < island.mouths.length; i++) {
      const a = island.mouths[i], b = island.mouths[(i + 1) % island.mouths.length];
      const active = m => { const status = slots.find(slot => slot.id === m.id).status; return status === "open" || status === "mirror"; };
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      if (!active(a) || !active(b) || distance > 16) continue;
      const x = (a.x + b.x) * 0.5, z = (a.z + b.z) * 0.5, radius = Math.hypot(x, z);
      chillZones.push({
        x, z, sr: -x / radius, cr: -z / radius,
        half: distance * 0.5 + 1.5, from: -2, to: 9, top: Infinity
      });
    }
    return { loungeRoofs, loungeAreas, climbRoofs, chillZones, descentWalls };
  };
  BL.npcClankerLayout = { create };
})();
