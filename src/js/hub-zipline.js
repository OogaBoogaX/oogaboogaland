// The island's zipline (zipline.js), where Billy put it: from the top of a tall Mempool rainforest tree near where he
// stood in its canopy, back over the water and across the island to the Headquarters entry beside the BTCPay totem
// (c730, "Headquarters · walk down the ramp"), dropping its rider onto the level ground just out from the head of that
// ramp, turned to face down it. The catapult throws the other way. The top is DSB Land's launch step and post (Billy's
// pick) on a small log deck in the crown; the rope ends in a stake driven into the rock over the doorway, so nothing
// stands on the walk in. The way up is the jetpack every Ooga owns: a crown's upper leaves take a landing.
//
// `crowns(pool)` lists the rainforest's treetops in world metres from the Mempool island's handle. `plan(island, q,
// keepOff, tops)` picks the spot with the hub's own queries (zipline.js `survey`'s `support`, `clear`, `landable`),
// all read-only: of `tops`, nearest Billy's spot (`NEAR`) first and only crowns at least `TOP_MIN` high, the first whose
// deck and post stand clear; then the nearest `DROPS` place round the ramp's head that is level, checked ground, keeps
// `keepOff` (the totems: x, z and a gap) that far from the line, and whose whole ride the survey finds clear. It runs
// after the Mempool island's and the home island's seeded scatter and claims nothing, so not a plant moves for it;
// null when no spot fits.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // Where Billy stood in the canopy, and how far round it, and how high up, a treetop may be.
  const NEAR = { x: 57.37, z: 9.33, reach: 9 }, TOP_MIN = 15;
  // Drop-offs round the ramp's head, nearest first: metres out and degrees either way from straight out of the doorway.
  const DROPS = [];
  for (let out = 2.2; out <= 5; out += 0.3) for (let degrees = 0; degrees <= 120; degrees += 10) DROPS.push([out, degrees], [out, -degrees]);
  // The deck's top over the crown's leaves; the post's room; the sag; heights tried for the eye in the rock; a long
  // line's speed and braking, as DSB Land's.
  const DECK = 0.3, TOP_R = 1.05, TOP_H = 3.5, SAG = 1.2, EYE_Y = [4.2, 3.95, 4.45, 4.7], ROCK_REACH = 4, SPEED = 16, BRAKE = 8;
  const RAMP_ID = "c730";
  // The rock face the line runs into past the drop-off at height `y`: the eye a hand's breadth out of it, or null.
  const rockEye = (island, x, z, ux, uz, y) => {
    for (let d = 0.5; d <= ROCK_REACH; d += 0.05) if (island.solidAt(x + ux * d, y, z + uz * d)) return { x: x + ux * (d - 0.06), y, z: z + uz * (d - 0.06) };
    return null;
  };
  // Every rainforest crown's top in world metres: the tree's own frame turned and scaled onto the Mempool island's.
  const crowns = (pool) => {
    const out = [];
    for (const tree of pool.trees) {
      const c = Math.cos(tree.ry), s = Math.sin(tree.ry);
      for (const [cx, cy, cz, , ry] of tree.geometry.climb.crowns) {
        const lx = tree.x + (cx * c + cz * s) * tree.k, lz = tree.z + (cz * c - cx * s) * tree.k;
        out.push({ x: pool.worldX(lx, lz), y: pool.centre.y + tree.y + (cy + ry) * tree.sy, z: pool.worldZ(lx, lz) });
      }
    }
    return out;
  };
  const plan = (island, q, keepOff = [], tops = []) => {
    const ramp = island.headquarters.ramps.find((r) => r.id === RAMP_ID), head = ramp.from, next = ramp.samples[1];
    // Straight out of the doorway is back up the ramp's first stretch; down it, the way the Ooga turns to face.
    const inX = next.x - head.x, inZ = next.z - head.z, inLen = Math.hypot(inX, inZ), downYaw = Math.atan2(inX, inZ);
    const outA = Math.atan2(-inX / inLen, -inZ / inLen);
    const near = tops.filter((t) => t.y >= TOP_MIN && Math.hypot(t.x - NEAR.x, t.z - NEAR.z) <= NEAR.reach)
      .sort((a, b) => Math.hypot(a.x - NEAR.x, a.z - NEAR.z) - Math.hypot(b.x - NEAR.x, b.z - NEAR.z));
    for (const crown of near) {
      // The deck rests on the crown's leaves where it is highest over the deck's middle.
      const tx = crown.x, tz = crown.z, ty = q.support(tx, tz, crown.y + 1) + DECK;
      if (!(ty >= TOP_MIN) || !q.clear(tx, ty + 0.05, tz, TOP_R, TOP_H)) continue;
      for (const [out, degrees] of DROPS) {
        const a = outA + degrees * Math.PI / 180, dx = head.x + Math.sin(a) * out, dz = head.z + Math.cos(a) * out;
        const len = Math.hypot(dx - tx, dz - tz), ux = (dx - tx) / len, uz = (dz - tz) / len;
        if (keepOff.some(([kx, kz, gap]) => Math.abs((kx - tx) * uz - (kz - tz) * ux) < gap) || !q.landable(dx, q.support(dx, dz, 1), dz)) continue;
        for (const y of EYE_Y) {
          const eye = rockEye(island, dx, dz, ux, uz, y);
          if (!eye) continue;
          const layout = BL.zipline.layout("jungle", { x: tx, y: ty, z: tz }, dx, dz, SAG, { bottomEye: eye });
          const survey = BL.zipline.survey(layout.line, layout.grabS, q);
          if (survey.ok) return { layout, survey, downYaw };
        }
      }
    }
    return null;
  };
  BL.hubZipline = { NEAR, TOP_MIN, DROPS, RAMP_ID, SPEED, BRAKE, crowns, plan };
})();
