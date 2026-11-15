// Authored cave dressing shared by browser presentation and private host geometry.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const CAVE_LIGHT_Z = 0.52;
  const THEMES = {
    lab: { glass: 4, icon: "die", banners: [[-1, 1], [1, 1]], string: ["bulb", 4], ceiling: [[-1.6, 1.6, -1.5, -5.6, 3.0, [0.3, 0.72], "tube"]], pieces: [["die", -4.1, 2.8, 0, 1], ["die", -3.5, 3.6, 1, 3], ["die", -4.1, 2.8, 1, 4, 0.5], ["terminal", 3.7, 1.0], ["die", 4.3, 3.2, 1, 2]] },
    matrix: { glass: 2, icon: "glyph", banners: [[1, 2], [-1, 2]], string: ["bulb", 2], pieces: [["monolith", -5.0, 0.9, 0, 0], ["monolith", 5.0, 0.9, 0, 1], ["runeStone", -4.2, 2.8, 0, 0], ["runeStone", 4.4, 2.9, 0, 1]] },
    lightning: { glass: 0, icon: "bolt", banners: [[-1, 0], [1, 0]], string: ["hanging", 0, [0.3, 0.7]], boards: true, pieces: [["gauge", 5.0, 0.9], ["cart", 5.7, 2.4, 1], ["coil", 3.8, 3.4]] },
    arcade: { glass: 3, icon: "invader", banners: [[-1, 3], [1, 3]], string: ["hanging", 3, [0.12, 0.5, 0.88]], ceiling: [[-2.35, 2.35, -1.5, -5.2, 3.72, [0.1, 0.26, 0.42, 0.58, 0.74, 0.9], "bulb"]], pieces: [["tokenStack", -3.45, 1.65, 1, 0], ["bigJoystick", -3.0, 2.8, 0, 0]] },
    bca: { glass: 0, icon: "abacus", banners: [[-1, 4], [1, 4]], string: ["hanging", 0, [0.2, 0.5, 0.8]], ceiling: [[-1.6, 1.6, -2.2, -5.6, 3.1, [0.5]]], pieces: [["abacus", -5.0, 1.0], ["ledger", 5.0, 1.0, 2]] }
  };
  // Themes choose only [side, variant]. The whole standard stays behind and outside the lanterns,
  // on its own cave's rock shoulder. These extents include the kit's crossbar and foot, not just its pole.
  const CAVE_LANTERN_X = 4.4, CAVE_LANTERN_Z = 1.6;
  const CAVE_BANNER_X = 5.25, CAVE_BANNER_Z = -2;
  const BANNER_HALF_X = 9 / 16, BANNER_HALF_Z = 3 / 16, BANNER_GAP = 1 / 16;
  const checkCaveBanner = (island, mouth, side) => {
    const u = BL.dressing.U;
    const lx = Math.round(side * CAVE_BANNER_X / u) * u, lz = Math.round(CAVE_BANNER_Z / u) * u;
    const postX = Math.round(CAVE_LANTERN_X / u) * u, postZ = Math.round(CAVE_LANTERN_Z / u) * u;
    if (Math.abs(side) !== 1 || Math.abs(lx) - BANNER_HALF_X < postX + 4 * u + BANNER_GAP
      || lz + BANNER_HALF_Z > postZ - 4 * u - BANNER_GAP)
      throw new Error(`${mouth.id}: banner must stay behind and outside the lanterns`);
    const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
    // Squared-distance differences are affine: checking every corner covers the entire footprint.
    // Closed mouths participate too; their future facade already owns its side of the gap.
    for (const dx of [-BANNER_HALF_X, BANNER_HALF_X]) for (const dz of [-BANNER_HALF_Z, BANNER_HALF_Z]) {
      const bx = lx + dx, bz = lz + dz, own = bx * bx + bz * bz;
      const x = mouth.x + cr * bx + sr * bz, z = mouth.z - sr * bx + cr * bz;
      for (const other of island.mouths) {
        if (other === mouth) continue;
        const ox = x - other.x, oz = z - other.z;
        if (ox * ox + oz * oz <= own) throw new Error(`${mouth.id}: banner crosses into ${other.id}'s frontage`);
      }
    }
  };
  const bake = (island, slot, m) => {
    const theme = THEMES[slot.theme];
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const set = BL.dressing.set(), ground = [], rig = {};
    // Floor props stay on the apron; banners stand on the raised rock shoulders behind the lamps.
    const stand = (kind, lx, lz, turns = 0, variant = 0, lift = 0) => {
      const x = m.x + cr * lx + sr * lz, z = m.z - sr * lx + cr * lz;
      if ((kind === "barrel" || kind === "bench") && island.overlapsStairs(x, z, 1.7)) return;
      const y = island.surfaceAt(x, z) - m.floorY;
      if (Math.abs(y) > 0.9 && kind !== "banner") return;
      set.put(kind, lx, y + lift, lz, turns, variant);
      // The coil and its gauge charge on a loop of their own (`coilCharge`).
      if (kind === "coil" || kind === "gauge") rig[kind] = [lx, y + lift, lz, turns];
      if (!lift) ground.push(lx, lz);
    };
    stand("lanternPost", -CAVE_LANTERN_X, CAVE_LANTERN_Z, 0, theme.glass);
    stand("lanternPost", CAVE_LANTERN_X, CAVE_LANTERN_Z, 2, theme.glass);
    for (const piece of theme.pieces) {
      if (piece[0] === "banner") throw new Error(`${m.id}: use theme.banners for cave standards`);
      stand(...piece);
    }
    for (const [side, variant] of theme.banners || []) {
      checkCaveBanner(island, m, side);
      stand("banner", side * CAVE_BANNER_X, CAVE_BANNER_Z, 0, variant);
    }
    const [lamp, variant, at] = theme.string;
    set.cable(-3.05, 3.42, CAVE_LIGHT_Z, 3.05, 3.42, CAVE_LIGHT_Z, 0.3, at || [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9], lamp, variant);
    set.cable(-3.65, 3.18, -0.22, -3.05, 3.42, CAVE_LIGHT_Z, 0.08);
    set.cable(3.65, 3.18, -0.22, 3.05, 3.42, CAVE_LIGHT_Z, 0.08);
    set.put("vine", -3.0, 3.5, CAVE_LIGHT_Z, 0, 0);
    set.put("vine", 2.6, 3.5, CAVE_LIGHT_Z, 0, 1);
    // A dark cave's rock stands flush with the rim's face, so the planks go on in front of both.
    if (theme.boards && slot.status === "dark") set.put("boards", 0, 0.2, 1.06);
    // Inside the mouth the floor is the cave's own, level with the doorway.
    for (const [kind, lx, lz, turns = 0, variant = 0, lift = 0] of theme.inside || []) set.put(kind, lx, lift, lz, turns, variant);
    for (const [ax, bx, az, bz, y, lamps, lamp = "hanging"] of theme.ceiling || []) {
      set.cable(ax, y, az, ax, y, bz, 0.15, lamps, lamp, theme.glass);
      set.cable(bx, y, az, bx, y, bz, 0.15, lamps, lamp, theme.glass);
    }
    return { ...set.build(), ground, rig };
  };
  BL.hubMouthDressing = { themes: THEMES, bake,
    chalkboard: { x: 6.41, z: 2.34, yaw: -0.315, scale: 1.4 } };
})();
