// The Hub's actual NPC work approaches and reserved firing positions, shared
// by browser and authoritative worlds. Occupancy comes from the supplied crew.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { clamp } = BL.math;
  const create = ({ slots, island, solids, getCrew, shotClear, radius, abyssFloor }) => {
    if (!Array.isArray(slots) || !Array.isArray(island?.mouths) || !Array.isArray(island?.path?.centerlines)
      || ![island.supportAt, island.clearAt, solids?.segmentClear, getCrew, shotClear].every(f => typeof f === "function")
      || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(abyssFloor)) throw Error("Hub NPC work providers required");
    const sites = slots.map((slot) => {
      const mouth = island.mouths.find((entry) => entry.id === slot.id);
      if (!mouth) throw Error("Hub NPC work mouth missing");
      const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);

      const aimX = mouth.x + sr * 5.8, aimZ = mouth.z + cr * 5.8, approach = { x: aimX, z: aimZ };
      let nearest = Infinity;
      // Rejoin the painted trail itself, rather than an off-path mouth-axis
      // marker that makes every worker step sideways and retrace their steps.
      for (const line of island.path.centerlines) for (let n = 1; n < line.length; n++) {
        const a = line[n - 1], b = line[n], dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
        const t = length2 ? clamp(((aimX - a.x) * dx + (aimZ - a.z) * dz) / length2, 0, 1) : 0;
        const x = a.x + dx * t, z = a.z + dz * t, distance = (x - aimX) ** 2 + (z - aimZ) ** 2;
        if (distance < nearest) { nearest = distance; approach.x = x; approach.z = z; }
      }
      return {
        repo: slot.repo,
        additionalRepo: slot.additionalRepo,
        mouth, sr, cr,
        mirrorRoom: slot.status === "mirror",
        // The namesake cave adopts fresh contributors whose repo has no cave.
        fallback: slot.id === "c1",
        route: [approach],
        approachDistance: 2.5,
        target: (cave, out) => { out.x = mouth.x; out.y = mouth.floorY + 1.5; out.z = mouth.z; return out; },
        position: (cave, out, retry = false) => {
          const crew = getCrew();
          // Reserve the first free place in the fan. Leave the central path
          // open for reload traffic and stagger each extra row behind it.
          const count = crew.cavemen.size * 4 + 16;
          for (let attempt = 0; attempt < count; attempt++) {
            const place = (attempt + (retry ? cave.work.place + 1 : 0)) % count;
            const row = Math.floor(place / 4), side = place & 1 ? 1 : -1;
            // Leave a full-arm companion lane between the inner shooters.
            const x = side * (2.2 + Math.floor(place % 4 / 2) * 1.35 + (row & 1) * 0.6);
            // A wide fan too close to the rim fires diagonally into its stone
            // jambs. Back each row away enough to see across the opening.
            const z = 4.8 + row * 1.35 + Math.abs(x) * 0.32;
            const px = mouth.x + cr * x + sr * z, pz = mouth.z - sr * x + cr * z;
            let occupied = crew.spotOccupied(cave, px, mouth.floorY, pz);
            for (let i = 0; !occupied && i < crew.list.length; i++) {
              const other = crew.list[i];
              if (other === cave) continue;
              if (other === crew.player || other.state !== "working"
                || other.work.phase !== "outbound" && other.work.phase !== "station" && other.work.phase !== "shoot"
                || sites[other.work.site]?.repo !== slot.repo) continue;
              if (Math.hypot(other.work.position.x - px, other.work.position.z - pz) < 0.9) { occupied = true; break; }
            }
            if (occupied || Math.abs(island.supportAt(px, pz, mouth.floorY, 0.05, abyssFloor, radius) - mouth.floorY) > 0.05
              || !island.clearAt(px, mouth.floorY + 0.03, pz, radius, cave.traits.height)
              || !solids.segmentClear(px, mouth.floorY + 0.03, pz, px, mouth.floorY + 0.03, pz, radius, cave.traits.height)) continue;
            let clear = true;
            // Cover either gun shoulder and both sides of the usable doorway,
            // not just a center-to-center ray that misses an obstructed muzzle.
            for (let shoulder = -1; shoulder <= 1 && clear; shoulder += 2) for (let edge = -1; edge <= 1; edge++) {
              const ax = px + cr * shoulder * 0.65 - sr, az = pz - sr * shoulder * 0.65 - cr;
              const bx = mouth.x + cr * edge * 1.65 + sr * 0.5, bz = mouth.z - sr * edge * 1.65 + cr * 0.5;
              if (!shotClear(ax, mouth.floorY + 1.25, az, bx, mouth.floorY + 1.5, bz)) { clear = false; break; }
            }
            if (!clear) continue;
            out.x = px; out.y = mouth.floorY; out.z = pz;
            cave.work.place = place;
            return true;
          }
          return false;
        }
      };
    });
    return sites;
  };
  BL.npcWorkSites = { create };
})();
