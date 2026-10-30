// Block Frenzy's geometry: Fort Chaos, the two stands, the glowing Bitcoin block each team guards (in its colour), paint balls,
// splats and the team rings under the Oogas' feet. Every builder is cached; the scene places nodes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, merge, moved, turnedY, cached, variants, geometry, pushVert, face, tube, lathe } = BL.models;
  const { hexToRgb } = BL.math;
  // Each map's own ground and buildings are `arena(map index)`; its ziplines `zipline(map index * 2 + side)`.
  const SIM = BL.blockSim;
  const TEAM = {
    blue: { paint: "#3a8dff", deep: "#1d4fa8", light: "#9cc8ff" },
    red: { paint: "#ff4a3a", deep: "#a8261d", light: "#ffb0a6" }
  };
  const ORANGE = "#f7931a", CREAM = "#fff3d6", TOP = SIM.CONFIG.TOWER_TOP;
  // The ₿ in a 7 x 9 grid, top row first: the strokes stand proud of the block's faces.
  const GLYPH = [
    "..#.#..",
    "######.",
    ".#....#",
    ".#....#",
    ".#####.",
    ".#....#",
    ".#....#",
    "######.",
    "..#.#.."
  ];

  // The ground: a sandy field with a darker strip down the middle and each half's end tinted to its team, then every
  // wall block in stone with a team-coloured cap near its fort, timber crates for the field's low cover, and the
  // centre tower in dark stone with an orange band.
  // Haunted Hollow's own blocks: the yards' plank floors over the cellars, iron rails, the houses' grey boards with a
  // purple trim, the cellars' mossy stone, headstones, the iron fence, dead trunks and the pale mausoleum. False for
  // anything else (the towers, the junk), which is drawn as on the other maps.
  const hauntedBlock = (parts, b, w, d, h, x, y, z, bottom) => {
    const thin = Math.min(w, d);
    if (b[4] > TOP - 0.5) return false;
    if (bottom > 2.5 && bottom < 2.8 && h <= 0.35) {
      parts.push(bevelBox({ w, h, d, color: "#3e3229", offset: { x, y, z } }));
      for (let k = 1; k < Math.floor(w / 0.9); k++) parts.push(box({ w: 0.05, h: 0.02, d, color: "#2a211b", offset: { x: b[0] + k * 0.9, y: b[4] + 0.005, z } }));
      return true;
    }
    if (bottom >= 2.9 && h <= 0.95 && thin <= 0.25) {
      parts.push(box({ w, h: 0.06, d, color: "#1c1a20", offset: { x, y: b[4] - 0.03, z } }));
      for (let k = (w > d ? b[0] : b[2]) + 0.25; k < (w > d ? b[1] : b[3]); k += 0.5) parts.push(box({ w: 0.05, h, d: 0.05, color: "#1c1a20", offset: { x: w > d ? k : x, y, z: w > d ? z : k } }));
      return true;
    }
    if (bottom >= 2.9) {
      parts.push(bevelBox({ w, h, d, color: "#5a5258", offset: { x, y, z } }));
      for (let k = bottom + 0.4; k < b[4]; k += 0.4) parts.push(box({ w: w + 0.02, h: 0.03, d: d + 0.02, color: "#463f45", offset: { x, y: k, z } }));
      parts.push(box({ w: w + 0.05, h: 0.14, d: d + 0.05, color: "#6a3fa0", emissive: 0.25, offset: { x, y: b[4] - 0.07, z } }));
      return true;
    }
    if (h >= 4.5 && w <= 0.75 && d <= 0.75) {
      parts.push(bevelBox({ w, h, d, color: "#2e2622", offset: { x, y, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(h - 2.7) < 0.05 && Math.abs(z) >= 31.9) {
      parts.push(bevelBox({ w, h, d, color: "#6a6670", offset: { x, y, z } }));
      parts.push(box({ w: w + 0.03, h: 0.35, d: d + 0.03, color: "#4f5a3c", offset: { x, y: 0.18, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(h - 1.1) < 0.05 && thin <= 0.4) {
      // A headstone: a grey slab with a rounded top and a darker plinth.
      parts.push(bevelBox({ w, h: h - 0.15, d, color: "#8e8e98", offset: { x, y: (h - 0.15) / 2, z } }));
      parts.push(bevelBox({ w: w * 0.7, h: 0.18, d, color: "#8e8e98", offset: { x, y: h - 0.09, z } }));
      parts.push(box({ w: w + 0.1, h: 0.12, d: d + 0.12, color: "#55555e", offset: { x, y: 0.06, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(h - 1.3) < 0.05 && thin <= 0.35) {
      // The iron fence: rails and spiked bars.
      parts.push(box({ w, h: 0.06, d, color: "#1c1a20", offset: { x, y: 1.1, z } }), box({ w, h: 0.06, d, color: "#1c1a20", offset: { x, y: 0.3, z } }));
      for (let k = b[0] + 0.15; k < b[1]; k += 0.3) parts.push(box({ w: 0.04, h, d: 0.04, color: "#1c1a20", offset: { x: k, y: h / 2, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(x) <= 3.1 && Math.abs(z) <= 4.5 && h > 0.4) {
      // The mausoleum and its steps: pale stone, a purple band round the tomb.
      parts.push(bevelBox({ w, h, d, color: "#b4aeb8", offset: { x, y, z } }));
      if (h > 2.5) parts.push(box({ w: w + 0.06, h: 0.25, d: d + 0.06, color: "#6a3fa0", emissive: 0.4, offset: { x, y: b[4] - 0.4, z } }));
      return true;
    }
    return false;
  };
  const arena = variants((mapIndex) => {
    const M = SIM.ARENAS[SIM.MAPS[mapIndex]], town = M.id === "town", jungle = M.id === "jungle", haunted = M.id === "haunted", parts = [];
    parts.push(box({ w: M.W * 2 + 4, h: 1, d: M.L * 2 + 4, color: "#6b5a3e", offset: { y: -0.5 } }));
    parts.push(box({ w: M.W * 2, h: 0.04, d: M.L * 2, color: "#c9a96b", offset: { y: 0.02 } }));
    parts.push(box({ w: M.W * 2, h: 0.05, d: 0.6, color: ORANGE, emissive: 0.25, offset: { y: 0.03 } }));
    for (const t of SIM.TEAMS) {
      const s = t === "blue" ? 1 : -1;
      parts.push(box({ w: M.W * 2, h: 0.05, d: 12, color: t === "blue" ? "#b8b894" : "#c8a586", offset: { y: 0.025, z: s * (M.L - 6) } }));
      // A ring of team paint round the stand, flush with the ground.
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        parts.push(box({ w: 0.5, h: 0.06, d: 0.18, color: TEAM[t].paint, emissive: 0.3, offset: { x: M.stands[t].x + Math.sin(a) * SIM.CONFIG.STAND_R, y: 0.03, z: M.stands[t].z + Math.cos(a) * SIM.CONFIG.STAND_R } }));
      }
    }
    // A map's own scoring spots: a wide ring of team paint with an orange ₿-coloured centre.
    if (M.goals) for (const t of SIM.TEAMS) {
      const g = M.goals[t], R = SIM.CONFIG.GOAL_R;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        parts.push(box({ w: 0.6, h: 0.06, d: 0.2, color: TEAM[t].paint, emissive: 0.5, offset: { x: g.x + Math.sin(a) * R, y: 0.04, z: g.z + Math.cos(a) * R } }));
      }
      parts.push(box({ w: 1.2, h: 0.05, d: 1.2, color: ORANGE, emissive: 0.6, offset: { x: g.x, y: 0.035, z: g.z } }));
    }
    // A low rim round the field.
    for (const s of [-1, 1]) {
      parts.push(bevelBox({ w: 0.6, h: 0.8, d: M.L * 2 + 0.6, color: "#7d7468", offset: { x: s * (M.W + 0.3), y: 0.4 } }));
      parts.push(bevelBox({ w: M.W * 2 + 1.2, h: 0.8, d: 0.6, color: "#7d7468", offset: { z: s * (M.L + 0.3), y: 0.4 } }));
    }
    if (jungle) {
      // Jungle floor: moss over the sand, darker patches, and the leaves of every tree (decor: nothing stops in them).
      parts.push(box({ w: M.W * 2, h: 0.045, d: M.L * 2 - 26, color: "#5f7a3a", offset: { y: 0.03 } }));
      const r = (k) => ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
      for (let k = 0; k < 40; k++) parts.push(box({ w: 1 + r(k) * 2.5, h: 0.05, d: 1 + r(k + 50) * 2.5, color: k % 2 ? "#4c6a2e" : "#6e8a44", offset: { x: (r(k + 100) - 0.5) * M.W * 1.9, y: 0.035, z: (r(k + 150) - 0.5) * (M.L * 2 - 28) } }));
      for (const d of M.decor) {
        if (d.kind !== "canopy") continue;
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2 + d.x, rr = d.r * (k % 2 ? 0.55 : 0.75);
          parts.push(bevelBox({ w: d.r * 0.9, h: 0.9, d: d.r * 0.9, color: k % 3 ? "#2f6a2a" : "#3f8a34", offset: { x: d.x + Math.sin(a) * rr, y: d.y + 0.3 + (k % 2) * 0.4, z: d.z + Math.cos(a) * rr } }));
        }
        parts.push(bevelBox({ w: d.r * 1.1, h: 1.1, d: d.r * 1.1, color: "#3a7a30", offset: { x: d.x, y: d.y + 0.9, z: d.z } }));
      }
    }
    if (haunted) {
      // Haunted Hollow: dead grass over the field, bare patches, and each dead tree's crooked branches.
      parts.push(box({ w: M.W * 2, h: 0.045, d: M.L * 2 - 4, color: "#4a5238", offset: { y: 0.03 } }));
      const r = (k) => ((Math.sin(k * 7.233) * 43758.5453) % 1 + 1) % 1;
      for (let k = 0; k < 60; k++) parts.push(box({ w: 1 + r(k) * 3, h: 0.05, d: 1 + r(k + 70) * 3, color: k % 3 ? "#3d4430" : "#5a5a44", offset: { x: (r(k + 140) - 0.5) * M.W * 1.9, y: 0.035, z: (r(k + 210) - 0.5) * (M.L * 2 - 8) } }));
      // Grass: tufts of blades in greens and dry yellows, thicker toward the edges and round the headstones.
      const greens = ["#4f6b34", "#5e7d3a", "#6f8a44", "#7d8a4a", "#8a8a52"];
      for (let k = 0; k < 1100; k++) {
        const gx = (r(k + 400) - 0.5) * M.W * 1.94, gz = (r(k + 900) - 0.5) * M.L * 1.94;
        if (Math.abs(gz) > 31 && Math.abs(gx) < 14.5) continue;
        const c = greens[k % greens.length], hgt = 0.18 + r(k + 1300) * 0.3;
        for (let j = 0; j < 3; j++) parts.push(box({ w: 0.05, h: hgt * (1 - j * 0.2), d: 0.05, color: c, offset: { x: gx + (j - 1) * 0.07, y: hgt * (1 - j * 0.2) / 2, z: gz + ((j * 37) % 3 - 1) * 0.06 } }));
      }
      // Tall grass in clumps, and grey rocks half sunk in it.
      for (let k = 0; k < 46; k++) {
        const cx = (r(k + 2400) - 0.5) * M.W * 1.9, cz = (r(k + 2500) - 0.5) * M.L * 1.6;
        if (Math.abs(cx) < 3.5 && Math.abs(cz) < 6) continue;
        for (let j = 0; j < 9; j++) {
          const hgt = 0.5 + r(k * 9 + j + 2600) * 0.45, ox = (r(k * 9 + j + 2700) - 0.5) * 1.1, oz = (r(k * 9 + j + 2800) - 0.5) * 1.1;
          parts.push(box({ w: 0.06, h: hgt, d: 0.06, color: j % 3 ? "#6a7f3e" : "#8f8a50", offset: { x: cx + ox, y: hgt / 2, z: cz + oz } }));
        }
      }
      for (let k = 0; k < 26; k++) {
        const rx = (r(k + 3000) - 0.5) * M.W * 1.9, rz = (r(k + 3100) - 0.5) * M.L * 1.7, sz = 0.35 + r(k + 3200) * 0.5;
        if (Math.abs(rx) < 3.5 && Math.abs(rz) < 6) continue;
        parts.push(bevelBox({ w: sz * 1.3, h: sz * 0.6, d: sz, color: k % 2 ? "#7a7880" : "#68666e", offset: { x: rx, y: sz * 0.25, z: rz } }));
      }
      // Bushes, dark and lumpy.
      for (let k = 0; k < 28; k++) {
        const bx = (r(k + 1700) - 0.5) * M.W * 1.9, bz = (r(k + 1800) - 0.5) * M.L * 1.7;
        if (Math.abs(bz) > 30 || (Math.abs(bx) < 4 && Math.abs(bz) < 5)) continue;
        parts.push(bevelBox({ w: 0.9, h: 0.6, d: 0.8, color: "#3c5a2c", offset: { x: bx, y: 0.3, z: bz } }), bevelBox({ w: 0.6, h: 0.45, d: 0.6, color: "#4a6a34", offset: { x: bx + 0.35, y: 0.55, z: bz - 0.2 } }));
      }
      // A worn stone path from each house's stairs to the mausoleum, and little white flowers on the graves.
      for (const s of [-1, 1]) for (let k = 0; k < 14; k++) parts.push(box({ w: 1.1 + r(k + s * 50) * 0.5, h: 0.05, d: 0.8, color: k % 2 ? "#8a8478" : "#77716a", offset: { x: Math.sin(k) * 0.4, y: 0.04, z: s * (27.6 - k * 1.7) } }));
      for (let k = 0; k < 60; k++) parts.push(box({ w: 0.07, h: 0.07, d: 0.07, color: k % 3 ? "#f2eee0" : "#c9a0e8", emissive: 0.2, offset: { x: (r(k + 2100) - 0.5) * 30, y: 0.12, z: (r(k + 2200) - 0.5) * 50 } }));
      // Jack-o'-lanterns, glowing, by the stairs and through the graveyard; lanterns on posts along the path.
      const lantern = (lx, lz) => parts.push(box({ w: 0.1, h: 1.8, d: 0.1, color: "#1c1a20", offset: { x: lx, y: 0.9, z: lz } }), box({ w: 0.28, h: 0.32, d: 0.28, color: "#ffcf7a", emissive: 1, offset: { x: lx, y: 1.95, z: lz } }), box({ w: 0.34, h: 0.06, d: 0.34, color: "#1c1a20", offset: { x: lx, y: 2.14, z: lz } }));
      const pumpkin = (px, pz, sz = 0.5) => {
        parts.push(bevelBox({ w: sz, h: sz * 0.8, d: sz, color: "#e8761c", offset: { x: px, y: sz * 0.4, z: pz } }), box({ w: 0.06, h: 0.14, d: 0.06, color: "#3e5a22", offset: { x: px, y: sz * 0.85, z: pz } }));
        parts.push(box({ w: sz * 0.5, h: sz * 0.12, d: 0.02, color: "#ffd84a", emissive: 1, offset: { x: px, y: sz * 0.32, z: pz + sz / 2 * Math.sign(-pz || 1) } }));
        for (const e of [-1, 1]) parts.push(box({ w: sz * 0.14, h: sz * 0.14, d: 0.02, color: "#ffd84a", emissive: 1, offset: { x: px + e * sz * 0.18, y: sz * 0.55, z: pz + sz / 2 * Math.sign(-pz || 1) } }));
      };
      for (const s of [-1, 1]) {
        pumpkin(-3.6, s * 28.2); pumpkin(3.6, s * 28.2, 0.6); pumpkin(-13, s * 19.5, 0.45); pumpkin(8, s * 12.8); pumpkin(17, s * 8, 0.65); pumpkin(-21, s * 30);
        lantern(-2.4, s * 22); lantern(2.4, s * 16); lantern(-2.4, s * 10); lantern(-15, s * 31.2); lantern(15, s * 31.2);
      }
      for (const d of M.decor) {
        if (d.kind !== "deadtree") continue;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + d.x, len = 1.2 + (k % 2) * 0.6, y = d.y - 0.6 - k * 0.7;
          parts.push(box({ w: 0.2, h: 0.2, d: len, color: "#2e2622", offset: { x: d.x + Math.sin(a) * len / 2, y, z: d.z + Math.cos(a) * len / 2 } }));
          parts.push(box({ w: 0.14, h: 0.6, d: 0.14, color: "#2e2622", offset: { x: d.x + Math.sin(a) * len, y: y + 0.3, z: d.z + Math.cos(a) * len } }));
        }
      }
    }
    if (town) {
      // Cobbled streets: a darker band down the middle and across the square.
      parts.push(box({ w: 18, h: 0.05, d: M.L * 2 - 20, color: "#a89270", offset: { y: 0.03 } }));
      parts.push(box({ w: M.W * 2, h: 0.05, d: 8, color: "#a89270", offset: { y: 0.035 } }));
    }
    for (const b of M.BLOCKS) {
      const w = b[1] - b[0], d = b[3] - b[2], bottom = b[5] || 0, h = b[4] - bottom, x = (b[0] + b[1]) / 2, z = (b[2] + b[3]) / 2, y = bottom + h / 2;
      if (M.steps.has(b)) {
        // A stair: stone with a worn lip.
        parts.push(bevelBox({ w, h, d, color: "#8a8178", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.02, h: 0.05, d: 0.12, color: "#b0a698", offset: { x, y: b[4] - 0.02, z: z - d / 2 + 0.06 * Math.sign(z || 1) } }));
        continue;
      }
      if (town && bottom === 0 && h >= 2.9 && !(w < 1 && d < 1) && !(b[4] > TOP - 0.5)) {
        // A town wall: sandstone with a darker plinth, the banks banded in their team's colour under the top.
        const bank = Math.abs(z) > 22 || Math.abs(b[2]) > 33;
        parts.push(bevelBox({ w, h, d, color: "#c4a676", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.03, h: 0.5, d: d + 0.03, color: "#8a7350", offset: { x, y: 0.25, z } }));
        parts.push(box({ w: w + 0.04, h: 0.2, d: d + 0.04, color: bank ? TEAM[z > 0 ? "blue" : "red"].paint : "#7a5a3a", emissive: bank ? 0.15 : 0, offset: { x, y: b[4] - 0.25, z } }));
        continue;
      }
      if (haunted && hauntedBlock(parts, b, w, d, h, x, y, z, bottom)) continue;
      if (jungle && w <= 1.7 && d <= 1.7 && h >= 5) {
        // A tree trunk: bark with paler rings and a vine.
        parts.push(bevelBox({ w, h, d, color: "#5a3e26", offset: { x, y, z } }));
        for (let k = 1; k < h; k += 1.3) parts.push(box({ w: w + 0.04, h: 0.08, d: d + 0.04, color: "#6e4e30", offset: { x, y: k, z } }));
        parts.push(box({ w: 0.08, h: h * 0.8, d: 0.08, color: "#3f8a34", offset: { x: x + w / 2, y: h * 0.45, z: z + d / 4 } }));
        continue;
      }
      if (jungle && bottom > 2.6 && h < 0.4 && Math.min(w, d) <= 1.3) {
        // The rope bridge: planks on ropes.
        parts.push(box({ w, h: 0.1, d, color: "#8a6440", offset: { x, y: b[4] - 0.05, z } }));
        for (let k = b[0]; k < b[1]; k += 0.5) parts.push(box({ w: 0.06, h: 0.11, d: d + 0.02, color: "#5a3a22", offset: { x: k, y: b[4] - 0.04, z } }));
        continue;
      }
      if (jungle && bottom >= 3 && h < 1 && Math.min(w, d) <= 0.25) {
        // A rope rail.
        parts.push(box({ w, h: 0.07, d, color: "#c9a96b", offset: { x, y: b[4] - 0.05, z } }));
        parts.push(box({ w, h: 0.05, d, color: "#a8884e", offset: { x, y: bottom + 0.35, z } }));
        continue;
      }
      const fort = Math.abs(z) > 22 && Math.abs(z) < 34, team = z > 0 ? "blue" : "red";
      const post = w < 1 && d < 1, deck = b[4] === TOP, rail = bottom === TOP, roof = bottom > 4 && !deck && !rail, floor = bottom > 1.5 && h < 0.5 && !roof, hutWall = bottom > 1.5 && !floor && !roof;
      if (rail) {
        // A sniper tower's parapet: planks with a team-painted cap.
        parts.push(bevelBox({ w, h, d, color: "#8a6440", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.04, h: 0.12, d: d + 0.04, color: TEAM[team].paint, emissive: 0.2, offset: { x, y: b[4] + 0.06, z } }));
      } else if (roof) {
        // Thatch: a straw slab with a darker fringe.
        parts.push(bevelBox({ w, h, d, color: "#b8924a", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.1, h: 0.08, d: d + 0.1, color: "#8a6a32", offset: { x, y: bottom + 0.02, z } }));
      } else if (floor) {
        parts.push(bevelBox({ w, h, d, color: "#7a5232", offset: { x, y, z } }));
        for (let k = 1; k < Math.floor(w / 0.8); k++) parts.push(box({ w: 0.04, h: 0.02, d, color: "#5a3a22", offset: { x: b[0] + k * 0.8, y: b[4] + 0.005, z } }));
      } else if (hutWall) {
        parts.push(bevelBox({ w, h, d, color: "#9a7448", offset: { x, y, z } }));
      } else if (post) {
        parts.push(bevelBox({ w, h, d, color: "#5a3a22", offset: { x, y, z } }));
      } else if (fort) {
        parts.push(bevelBox({ w, h, d, color: "#8a8178", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.04, h: 0.18, d: d + 0.04, color: TEAM[team].paint, emissive: 0.15, offset: { x, y: b[4] + 0.09, z } }));
      } else if (h > 3) {
        // The tall walls that break the sight line, banded in orange.
        parts.push(bevelBox({ w, h, d, color: "#4a4440", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.06, h: 0.3, d: d + 0.06, color: ORANGE, emissive: 0.8, offset: { x, y: b[4] - 0.6, z } }));
      } else {
        parts.push(bevelBox({ w, h, d, color: h > 1.5 ? "#7a6a58" : "#8a5a32", offset: { x, y, z } }));
        parts.push(box({ w: w * 0.7, h: 0.05, d: d + 0.02, color: "#5a3a22", offset: { x, y: bottom + h * 0.55, z } }));
      }
    }
    return merge(...parts);
  });
  // The campfire: a ring of stones, crossed logs and three tongues of flame (the scene flickers their node).
  const firePit = cached(() => {
    const parts = [];
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      parts.push(bevelBox({ w: 0.32, h: 0.24, d: 0.26, color: k % 2 ? "#6e6a66" : "#86817a", offset: { x: Math.sin(a) * 0.85, y: 0.12, z: Math.cos(a) * 0.85 } }));
    }
    for (const a of [0.3, 1.9, 3.5]) parts.push(turnedY(box({ w: 1.2, h: 0.16, d: 0.18, color: "#5a3a22", offset: { y: 0.12 } }), a));
    parts.push(box({ w: 0.9, h: 0.04, d: 0.9, color: "#ff6a1a", emissive: 1, offset: { y: 0.05 } }));
    return merge(...parts);
  });
  const flames = cached(() => {
    const geo = merge(
      lathe({ profile: [[0, 0], [0.42, 0.15], [0.3, 0.6], [0, 1.1]], segments: 7, color: "#ff7a1a", emissive: 1 }),
      moved(lathe({ profile: [[0, 0], [0.26, 0.12], [0.18, 0.45], [0, 0.8]], segments: 6, color: "#ffd24a", emissive: 1 }), 0.12, 0.05, 0.08),
      moved(lathe({ profile: [[0, 0], [0.2, 0.1], [0.12, 0.3], [0, 0.55]], segments: 6, color: "#fff3a0", emissive: 1 }), -0.1, 0.05, -0.06)
    );
    geo.castShadow = false;
    return geo;
  });
  // A potato Ooga that dances round the fire: an egg-shaped tan body speckled darker, a leopard-spot loincloth, two
  // stubby legs, two little arms (separate, so the scene waves them), big dark eyes and brows, and an open mouth.
  const potato = cached(() => {
    const parts = [lathe({ profile: [[0, 0.18], [0.36, 0.26], [0.5, 0.55], [0.52, 0.85], [0.44, 1.15], [0.26, 1.33], [0, 1.38]], segments: 10, color: "#c9a06a" })];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, y = 0.45 + (k % 4) * 0.22;
      parts.push(box({ w: 0.05, h: 0.05, d: 0.05, color: "#9a7448", offset: { x: Math.sin(a) * 0.5, y, z: Math.cos(a) * 0.5 } }));
    }
    parts.push(lathe({ profile: [[0.37, 0.2], [0.47, 0.28], [0.5, 0.42], [0.36, 0.42]], segments: 10, color: "#c8954a" }));
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63 + 0.2;
      parts.push(box({ w: 0.07, h: 0.06, d: 0.04, color: "#3a2614", offset: { x: Math.sin(a) * 0.49, y: 0.3 + (k % 2) * 0.07, z: Math.cos(a) * 0.49 } }));
    }
    for (const x of [-0.17, 0.17]) {
      parts.push(box({ w: 0.15, h: 0.24, d: 0.15, color: "#d8b07a", offset: { x, y: 0.1 } }));
      parts.push(box({ w: 0.1, h: 0.13, d: 0.04, color: "#1a1410", offset: { x, y: 0.95, z: 0.5 } }));
      parts.push(box({ w: 0.14, h: 0.04, d: 0.04, color: "#1a1410", offset: { x: x * 1.1, y: 1.1, z: 0.47 } }));
    }
    parts.push(box({ w: 0.14, h: 0.12, d: 0.04, color: "#5a1a14", offset: { y: 0.72, z: 0.52 } }));
    return merge(...parts);
  });
  const potatoArm = cached(() => merge(box({ w: 0.12, h: 0.32, d: 0.12, color: "#d8b07a", offset: { y: -0.14 } }), box({ w: 0.16, h: 0.12, d: 0.14, color: "#d8b07a", offset: { y: -0.3 } })));
  // A stand: a stepped stone plinth with its team's paint round the top, where the block sits.
  const stand = variants((i) => {
    const t = SIM.TEAMS[i];
    return merge(
      bevelBox({ w: 1.6, h: 0.3, d: 1.6, color: "#6e655c", offset: { y: 0.15 } }),
      bevelBox({ w: 1.1, h: 0.5, d: 1.1, color: "#8a8178", offset: { y: 0.55 } }),
      box({ w: 1.16, h: 0.08, d: 1.16, color: TEAM[t].paint, emissive: 0.5, offset: { y: 0.8 } })
    );
  });
  // The block: an orange cube with darker edges and a cream ₿ standing proud on four faces, lit from inside. It
  // centres on its own origin so it can turn and bob; `trim` is the team colour of the band round its middle.
  const SIZE = 0.62;
  const glyphFace = (parts, turn) => {
    const u = SIZE * 0.07, h = SIZE / 2 + 0.012;
    for (let r = 0; r < GLYPH.length; r++) for (let c = 0; c < GLYPH[r].length; c++) {
      if (GLYPH[r][c] !== "#") continue;
      // Negated so the glyph reads the right way round from outside each face.
      const lx = (3 - c) * u, ly = (4 - r) * u;
      const x = Math.cos(turn) * lx + Math.sin(turn) * h, z = -Math.sin(turn) * lx + Math.cos(turn) * h;
      parts.push(box({ w: Math.abs(Math.cos(turn)) > 0.5 ? u : 0.024, h: u, d: Math.abs(Math.cos(turn)) > 0.5 ? 0.024 : u, color: CREAM, emissive: 1, offset: { x, y: ly, z } }));
    }
  };
  // A team's block: a cube in its team's colour, glowing, with darker edges, a cream ₿ standing proud on four faces and
  // a band of Bitcoin orange round its foot, so the two sides' blocks never look alike.
  const block = variants((i) => {
    const t = SIM.TEAMS[i], parts = [], body = TEAM[t].paint, edge = TEAM[t].deep;
    parts.push(box({ w: SIZE, h: SIZE, d: SIZE, color: body, emissive: 0.85 }));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(box({ w: 0.06, h: SIZE + 0.02, d: 0.06, color: edge, emissive: 0.3, offset: { x: sx * SIZE / 2, z: sz * SIZE / 2 } }));
    for (const sy of [1, -1]) {
      parts.push(box({ w: SIZE + 0.02, h: 0.06, d: 0.06, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, z: SIZE / 2 } }));
      parts.push(box({ w: SIZE + 0.02, h: 0.06, d: 0.06, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, z: -SIZE / 2 } }));
      parts.push(box({ w: 0.06, h: 0.06, d: SIZE + 0.02, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, x: SIZE / 2 } }));
      parts.push(box({ w: 0.06, h: 0.06, d: SIZE + 0.02, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, x: -SIZE / 2 } }));
    }
    for (let k = 0; k < 4; k++) glyphFace(parts, k * Math.PI / 2);
    parts.push(box({ w: SIZE + 0.05, h: 0.05, d: SIZE + 0.05, color: ORANGE, emissive: 0.8, offset: { y: -SIZE / 2 + 0.06 } }));
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // The ring of ticks that spins round a dropped block so it is easy to find.
  const tick = cached(() => box({ w: 0.12, h: 0.04, d: 0.3, color: ORANGE, emissive: 1, offset: { z: 1.05 } }));
  // A paint ball, a small chunky cube in its team's colour.
  const ball = variants((i) => {
    const t = SIM.TEAMS[i], geo = merge(bevelBox({ w: 0.2, h: 0.2, d: 0.2, color: TEAM[t].paint, emissive: 0.7 }));
    geo.castShadow = false;
    return geo;
  });
  // A splat: a lumpy flat blot with drips, lying in the xz plane facing up; the scene turns and scales each.
  const splat = variants((i) => {
    const t = SIM.TEAMS[i % 2], geo = geometry(), rgb = hexToRgb(TEAM[t].paint), seed = 1 + i * 7;
    const blot = (cx, cz, r, n, j) => {
      const c = pushVert(geo, cx, 0, cz), ring = [];
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, rr = r * (0.75 + 0.35 * Math.abs(Math.sin(a * (3 + j) + seed)));
        ring.push(pushVert(geo, cx + Math.sin(a) * rr, 0, cz + Math.cos(a) * rr));
      }
      for (let k = 0; k < n; k++) face(geo, [c, ring[k], ring[(k + 1) % n]], rgb, { emissive: 0.15 });
    };
    blot(0, 0, 0.45, 12, i % 3);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + seed, d = 0.55 + (k % 2) * 0.15;
      blot(Math.sin(a) * d, Math.cos(a) * d, 0.09 + (k % 3) * 0.03, 6, 0);
    }
    geo.castShadow = false;
    return geo;
  });
  // The ring under each Ooga's feet that says whose side they're on.
  const ring = variants((i) => {
    const t = SIM.TEAMS[i], parts = [];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      parts.push(moved(box({ w: 0.24, h: 0.03, d: 0.08, color: TEAM[t].paint, emissive: 0.8 }), Math.sin(a) * 0.55, 0.03, Math.cos(a) * 0.55));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A quiz pad: a dark plate with a grid of green Matrix glyph cells and a glowing rim, flush with the ground.
  const GREEN = "#3dff7a";
  const pad = cached(() => {
    const parts = [box({ w: 1.7, h: 0.05, d: 1.7, color: "#0b1a10", offset: { y: 0.03 } })];
    for (const s of [-1, 1]) {
      parts.push(box({ w: 1.8, h: 0.08, d: 0.08, color: GREEN, emissive: 1, offset: { y: 0.05, z: s * 0.86 } }));
      parts.push(box({ w: 0.08, h: 0.08, d: 1.8, color: GREEN, emissive: 1, offset: { y: 0.05, x: s * 0.86 } }));
    }
    // A scatter of lit cells, the same every build.
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if ((i * 7 + j * 3) % 4 === 0) continue;
      parts.push(box({ w: 0.16, h: 0.02, d: (i + j) % 3 ? 0.16 : 0.08, color: (i + j) % 2 ? GREEN : "#b8ffcf", emissive: 0.9, offset: { x: (i - 2) * 0.3, y: 0.065, z: (j - 2) * 0.3 } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // The quiz bubble round a trapped Ooga: a cage of glowing green bars, eight round and two rings, with a question
  // mark over it.
  const bubble = cached(() => {
    const parts = [], R = 0.85, H = 2.3;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      parts.push(box({ w: 0.05, h: H, d: 0.05, color: GREEN, emissive: 1, offset: { x: Math.sin(a) * R, y: H / 2, z: Math.cos(a) * R } }));
    }
    for (const y of [0.08, H]) for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * Math.PI * 2;
      parts.push(moved(turnedY(box({ w: R * 0.4, h: 0.05, d: 0.05, color: GREEN, emissive: 1 }), a), Math.sin(a) * R * 0.98, y, Math.cos(a) * R * 0.98));
    }
    for (const [x, y] of [[-1, 4], [0, 5], [1, 4], [1, 3], [0, 2], [0, 0]]) parts.push(box({ w: 0.11, h: 0.11, d: 0.11, color: "#b8ffcf", emissive: 1, offset: { x: x * 0.11, y: H + 0.35 + y * 0.11 } }));
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A pushable crate: planked sides, darker battens, and a band of its team's paint, centred on its foot.
  const crate = variants((i) => {
    const t = SIM.TEAMS[i], h = SIM.CONFIG.CRATE_H, w = SIM.CONFIG.CRATE_HALF * 2, parts = [bevelBox({ w, h, d: w, color: "#9a6a3a", offset: { y: h / 2 } })];
    for (const s of [-1, 1]) {
      parts.push(box({ w: w + 0.02, h: 0.1, d: 0.1, color: "#5a3a22", offset: { y: h / 2, z: s * (w / 2 - 0.04) } }));
      parts.push(box({ w: 0.1, h: 0.1, d: w + 0.02, color: "#5a3a22", offset: { y: h / 2, x: s * (w / 2 - 0.04) } }));
    }
    parts.push(box({ w: w + 0.03, h: 0.12, d: w + 0.03, color: TEAM[t].paint, emissive: 0.2, offset: { y: h - 0.2 } }));
    return merge(...parts);
  });
  // Throws in flight: a grenade (a fat ball with a pale band), a rocket (a nose, a body in team paint and fins,
  // pointing along +z) and a net (a square of green cords).
  const grenade = variants((i) => {
    const t = SIM.TEAMS[i];
    const geo = merge(bevelBox({ w: 0.32, h: 0.32, d: 0.32, color: TEAM[t].paint, emissive: 0.6 }), box({ w: 0.34, h: 0.07, d: 0.34, color: TEAM[t].light, emissive: 0.8 }));
    geo.castShadow = false;
    return geo;
  });
  const rocket = variants((i) => {
    const t = SIM.TEAMS[i];
    const geo = merge(
      box({ w: 0.22, h: 0.22, d: 0.7, color: TEAM[t].paint, emissive: 0.5 }),
      box({ w: 0.16, h: 0.16, d: 0.18, color: "#f3efe4", emissive: 0.5, offset: { z: 0.42 } }),
      box({ w: 0.5, h: 0.04, d: 0.16, color: TEAM[t].deep, offset: { z: -0.3 } }),
      box({ w: 0.04, h: 0.5, d: 0.16, color: TEAM[t].deep, offset: { z: -0.3 } }),
      box({ w: 0.16, h: 0.16, d: 0.3, color: ORANGE, emissive: 1, offset: { z: -0.5 } })
    );
    geo.castShadow = false;
    return geo;
  });
  const net = cached(() => {
    const parts = [], n = 4, s = 0.9;
    for (let k = 0; k <= n; k++) {
      const o = -s / 2 + k * s / n;
      parts.push(box({ w: s, h: 0.03, d: 0.03, color: "#7fe08a", emissive: 0.5, offset: { z: o } }));
      parts.push(box({ w: 0.03, h: 0.03, d: s, color: "#7fe08a", emissive: 0.5, offset: { x: o } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A net draped over a caught Ooga: cords down its sides and across its top.
  const draped = cached(() => {
    const parts = [], R = 0.5, H = 1.9;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      parts.push(box({ w: 0.03, h: H, d: 0.03, color: "#7fe08a", emissive: 0.4, offset: { x: Math.sin(a) * R, y: H / 2, z: Math.cos(a) * R } }));
    }
    for (const y of [0.5, 1.1, 1.7]) for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * Math.PI * 2;
      parts.push(moved(turnedY(box({ w: R * 0.65, h: 0.03, d: 0.03, color: "#7fe08a", emissive: 0.4 }), a), Math.sin(a) * R * 0.95, y, Math.cos(a) * R * 0.95));
    }
    parts.push(moved(merge(net()), 0, H, 0));
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A rain streak, a thin pale bar the scene leans with the wind.
  const streak = cached(() => {
    const geo = box({ w: 0.025, h: 0.5, d: 0.025, color: "#c8d8ff", emissive: 0.4 });
    geo.castShadow = false;
    return geo;
  });
  // The guns, each in its own frame with the grip at the origin and the muzzle along +z, in team colours (variants by
  // team): a paintball marker with a hopper, a chunky grenade launcher with a drum, a big shoulder rocket launcher, a
  // net gun with a flared mouth and a long sniper rifle with a scope.
  const GUNS = ["paint", "grenade", "rocket", "net", "sniper", "gold", "ak"];
  const GOLD = "#f2c230", GOLD_DK = "#b8901c";
  const METAL = "#3a3a40", DARK = "#24242a";
  const gun = variants((i) => {
    const kind = GUNS[i >> 1], t = SIM.TEAMS[i & 1], c = TEAM[t], parts = [];
    const grip = () => parts.push(box({ w: 0.07, h: 0.18, d: 0.09, color: DARK, offset: { y: -0.08, z: -0.02 } }));
    if (kind === "paint") {
      grip();
      parts.push(bevelBox({ w: 0.1, h: 0.12, d: 0.36, color: METAL, offset: { y: 0.03, z: 0.08 } }));
      parts.push(box({ w: 0.05, h: 0.05, d: 0.32, color: DARK, offset: { y: 0.05, z: 0.4 } }));
      parts.push(bevelBox({ w: 0.16, h: 0.16, d: 0.18, color: c.paint, emissive: 0.4, offset: { y: 0.17, z: 0.06 } }));
      parts.push(box({ w: 0.06, h: 0.07, d: 0.16, color: c.deep, offset: { y: 0.0, z: -0.16 } }));
    } else if (kind === "grenade") {
      grip();
      parts.push(bevelBox({ w: 0.14, h: 0.14, d: 0.4, color: "#4a4a3a", offset: { y: 0.04, z: 0.1 } }));
      parts.push(bevelBox({ w: 0.2, h: 0.2, d: 0.2, color: c.deep, offset: { y: 0.0, z: 0.02 } }));
      parts.push(box({ w: 0.15, h: 0.15, d: 0.24, color: DARK, offset: { y: 0.06, z: 0.38 } }));
      parts.push(box({ w: 0.17, h: 0.04, d: 0.05, color: c.paint, emissive: 0.6, offset: { y: 0.06, z: 0.5 } }));
    } else if (kind === "rocket") {
      // Sits on the shoulder: the grip under its middle, a long fat tube with a sight and an orange warhead peeping out.
      parts.push(box({ w: 0.07, h: 0.16, d: 0.09, color: DARK, offset: { y: -0.12, z: 0.05 } }));
      parts.push(bevelBox({ w: 0.24, h: 0.24, d: 1.25, color: c.deep, offset: { y: 0.04, z: 0.1 } }));
      parts.push(box({ w: 0.27, h: 0.27, d: 0.12, color: c.paint, emissive: 0.4, offset: { y: 0.04, z: 0.68 } }));
      parts.push(box({ w: 0.27, h: 0.27, d: 0.12, color: METAL, offset: { y: 0.04, z: -0.5 } }));
      parts.push(box({ w: 0.14, h: 0.14, d: 0.1, color: ORANGE, emissive: 1, offset: { y: 0.04, z: 0.74 } }));
      parts.push(box({ w: 0.05, h: 0.1, d: 0.14, color: DARK, offset: { x: 0.1, y: 0.2, z: 0.25 } }));
    } else if (kind === "net") {
      grip();
      parts.push(bevelBox({ w: 0.12, h: 0.12, d: 0.34, color: "#3f5a3a", offset: { y: 0.04, z: 0.08 } }));
      parts.push(box({ w: 0.3, h: 0.3, d: 0.08, color: "#7fe08a", emissive: 0.5, offset: { y: 0.04, z: 0.32 } }));
      parts.push(box({ w: 0.2, h: 0.2, d: 0.1, color: "#5a8a52", offset: { y: 0.04, z: 0.26 } }));
      for (const [x, y] of [[-0.13, -0.09], [0.13, -0.09], [-0.13, 0.17], [0.13, 0.17]]) parts.push(box({ w: 0.04, h: 0.04, d: 0.04, color: "#c9b48a", offset: { x, y, z: 0.37 } }));
    } else if (kind === "ak") {
      // The Ooga AK: a wooden stock and grip, a dark receiver, a long barrel with a front sight, and a curved banana
      // magazine in the team's colour.
      grip();
      parts.push(bevelBox({ w: 0.09, h: 0.12, d: 0.36, color: "#7a4e2a", offset: { y: 0.0, z: -0.3 } }));
      parts.push(bevelBox({ w: 0.1, h: 0.13, d: 0.42, color: METAL, offset: { y: 0.04, z: 0.08 } }));
      parts.push(box({ w: 0.08, h: 0.06, d: 0.2, color: "#7a4e2a", offset: { y: 0.0, z: 0.36 } }));
      parts.push(box({ w: 0.04, h: 0.04, d: 0.42, color: DARK, offset: { y: 0.06, z: 0.62 } }));
      parts.push(box({ w: 0.03, h: 0.07, d: 0.03, color: DARK, offset: { y: 0.12, z: 0.8 } }));
      for (let k = 0; k < 3; k++) parts.push(box({ w: 0.07, h: 0.1, d: 0.08, color: k ? c.paint : "#ffd23a", emissive: 0.3, offset: { y: -0.08 - k * 0.09, z: 0.18 + k * 0.045 } }));
    } else if (kind === "gold") {
      // The Golden AK: a gold receiver and stock, a curved magazine, a long barrel with a front sight, and a hopper
      // of gold paint on top. It shines.
      grip();
      parts.push(bevelBox({ w: 0.1, h: 0.14, d: 0.46, color: GOLD, emissive: 0.45, offset: { y: 0.04, z: 0.1 } }));
      parts.push(bevelBox({ w: 0.08, h: 0.12, d: 0.34, color: GOLD_DK, emissive: 0.3, offset: { y: 0.0, z: -0.3 } }));
      parts.push(box({ w: 0.05, h: 0.05, d: 0.5, color: GOLD, emissive: 0.45, offset: { y: 0.07, z: 0.58 } }));
      parts.push(box({ w: 0.03, h: 0.08, d: 0.03, color: GOLD_DK, emissive: 0.3, offset: { y: 0.13, z: 0.78 } }));
      for (let k = 0; k < 3; k++) parts.push(box({ w: 0.07, h: 0.1, d: 0.08, color: GOLD_DK, emissive: 0.3, offset: { y: -0.08 - k * 0.09, z: 0.2 + k * 0.04 } }));
      parts.push(bevelBox({ w: 0.14, h: 0.12, d: 0.14, color: GOLD, emissive: 0.7, offset: { y: 0.17, z: 0.06 } }));
    } else {
      // The sniper rifle: a long stock and barrel, a team-coloured scope with glowing lenses.
      grip();
      parts.push(bevelBox({ w: 0.08, h: 0.1, d: 0.5, color: "#6a4a2a", offset: { y: 0.03, z: -0.12 } }));
      parts.push(bevelBox({ w: 0.09, h: 0.1, d: 0.42, color: METAL, offset: { y: 0.04, z: 0.3 } }));
      parts.push(box({ w: 0.04, h: 0.04, d: 0.62, color: DARK, offset: { y: 0.05, z: 0.8 } }));
      parts.push(box({ w: 0.07, h: 0.07, d: 0.34, color: c.paint, emissive: 0.3, offset: { y: 0.15, z: 0.28 } }));
      parts.push(box({ w: 0.05, h: 0.05, d: 0.02, color: "#bfe8ff", emissive: 1, offset: { y: 0.15, z: 0.46 } }));
    }
    return merge(...parts);
  });
  // A tower's ladder: two rails and rungs up the gap side to the platform, in the tower's own frame (+x away from it).
  const ladder = cached(() => {
    const parts = [], z0 = -0.5, z1 = 0.5;
    for (const z of [z0, z1]) parts.push(box({ w: 0.08, h: TOP + 0.9, d: 0.08, color: "#5a3a22", offset: { y: (TOP + 0.9) / 2, z } }));
    for (let y = 0.35; y < TOP; y += 0.4) parts.push(box({ w: 0.06, h: 0.06, d: z1 - z0, color: "#8a6440", offset: { y, z: 0 } }));
    return merge(...parts);
  });
  // The rifle rack on a tower's platform: a low crossbar with a rifle on it.
  const rack = variants((i) => merge(
    box({ w: 0.08, h: 0.7, d: 0.08, color: "#5a3a22", offset: { x: -0.35, y: 0.35 } }), box({ w: 0.08, h: 0.7, d: 0.08, color: "#5a3a22", offset: { x: 0.35, y: 0.35 } }),
    box({ w: 0.8, h: 0.06, d: 0.1, color: "#8a6440", offset: { y: 0.6 } }),
    moved(turnedY(gun(8 + i), Math.PI / 2), 0, 0.7, 0)
  ));
  // A zipline: a cable sagging a little between its anchors, in the team's colour, and a pole at the low end.
  const zipline = variants((k) => {
    // Keyed by map and side: map index times two, plus the side.
    const i = k & 1, z = SIM.ARENAS[SIM.MAPS[k >> 1]].zips[SIM.TEAMS[i]], c = TEAM[SIM.TEAMS[i]];
    const cable = tube({ path: (t) => ({ x: z.ax + (z.bx - z.ax) * t, y: z.ay + (z.by - z.ay) * t + 0.15, z: z.az + (z.bz - z.az) * t }), radius: () => 0.04, rings: 24, segments: 4, colorFn: () => c.light, emissive: 0.5 });
    return merge(cable,
      box({ w: 0.16, h: z.by + 0.4, d: 0.16, color: "#5a3a22", offset: { x: z.bx, y: (z.by + 0.4) / 2, z: z.bz } }),
      box({ w: 0.3, h: 0.3, d: 0.3, color: c.paint, emissive: 0.6, offset: { x: z.ax, y: z.ay + 0.15, z: z.az } }));
  });
  // A rider's trolley: a pulley block on the cable with a hand bar under it.
  const trolley = cached(() => merge(box({ w: 0.14, h: 0.18, d: 0.3, color: METAL, offset: { y: 0.1 } }), box({ w: 0.6, h: 0.05, d: 0.05, color: DARK, offset: { y: -0.15 } }), box({ w: 0.04, h: 0.3, d: 0.04, color: DARK, offset: { y: 0 } })));
  // An ammo cache: an olive box with an orange band and a glowing lid while it's ready; grey and dark while it rests.
  const cache = variants((i) => {
    const ready = i === 0;
    return merge(
      bevelBox({ w: 0.8, h: 0.45, d: 0.55, color: ready ? "#56603a" : "#4a4844", offset: { y: 0.23 } }),
      box({ w: 0.82, h: 0.08, d: 0.57, color: ready ? ORANGE : "#6a6660", emissive: ready ? 0.9 : 0, offset: { y: 0.3 } }),
      box({ w: 0.5, h: 0.05, d: 0.3, color: ready ? "#fff3a0" : "#5a5852", emissive: ready ? 1 : 0, offset: { y: 0.48 } })
    );
  });
  // A trampoline flush with the ground: a dark frame ring on stubby legs, springs, and an orange-and-black mat.
  const tramp = cached(() => {
    const parts = [], R = SIM.CONFIG.TRAMP_R + 0.15, n = 16;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, x = Math.sin(a), z = Math.cos(a);
      parts.push(box({ w: 0.42, h: 0.14, d: 0.16, color: "#2a2a30", offset: { x: x * R, y: 0.07, z: z * R } }));
      parts.push(box({ w: 0.05, h: 0.05, d: 0.2, color: "#c9ced6", offset: { x: x * (R - 0.15), y: 0.12, z: z * (R - 0.15) } }));
    }
    // The mat: rings of black and orange.
    for (let k = 0; k < 4; k++) {
      const r = SIM.CONFIG.TRAMP_R * (1 - k * 0.24);
      parts.push(box({ w: r * 1.7, h: 0.03, d: r * 1.7, color: k % 2 ? ORANGE : "#18181c", emissive: k % 2 ? 0.5 : 0, offset: { y: 0.1 + k * 0.004 } }));
    }
    return merge(...parts);
  });
  // The power-ups, each a floating glowing token over a little plinth: a lightning bolt (boots), a coin cut in half
  // (the halving), an ice cube (cold storage) and a visor with two red eyes (laser eyes); and the ice over a frozen
  // block.
  const power = variants((i) => {
    const parts = [box({ w: 0.7, h: 0.12, d: 0.7, color: "#3a3430", offset: { y: 0.06 } })], y = 1.1;
    if (i === 0) {
      for (const [x, yy, w, h] of [[0.08, 0.22, 0.14, 0.3], [-0.02, 0.02, 0.26, 0.1], [-0.1, -0.2, 0.14, 0.3]]) parts.push(box({ w, h, d: 0.1, color: "#ffe14a", emissive: 1, offset: { x, y: y + yy } }));
    } else if (i === 1) {
      parts.push(box({ w: 0.24, h: 0.56, d: 0.1, color: ORANGE, emissive: 0.9, offset: { x: -0.16, y } }));
      parts.push(box({ w: 0.24, h: 0.56, d: 0.1, color: "#c9ced6", emissive: 0.5, offset: { x: 0.16, y: y - 0.12 } }));
    } else if (i === 2) {
      parts.push(bevelBox({ w: 0.5, h: 0.5, d: 0.5, color: "#bfe8ff", emissive: 0.7, offset: { y } }));
      parts.push(box({ w: 0.3, h: 0.06, d: 0.52, color: "#ffffff", emissive: 1, offset: { y: y + 0.1 } }));
    } else if (i === 4) {
      parts.push(moved(monkey(), 0, y - 0.35, 0));
    } else {
      parts.push(box({ w: 0.6, h: 0.18, d: 0.14, color: "#24242a", offset: { y } }));
      for (const x of [-0.15, 0.15]) parts.push(box({ w: 0.14, h: 0.1, d: 0.16, color: "#ff2a1a", emissive: 1, offset: { x, y } }));
    }
    return merge(...parts);
  });
  const ice = cached(() => {
    const geo = merge(bevelBox({ w: 1.25, h: 1.25, d: 1.25, color: "#bfe8ff", emissive: 0.35 }), box({ w: 1.27, h: 0.08, d: 1.27, color: "#ffffff", emissive: 0.8, offset: { y: 0.3 } }));
    geo.castShadow = false;
    return geo;
  });
  // Bananas: one to hold (a curved run of yellow segments, a brown tip), a heap of them by the fire, and a peel lying
  // flat, its four flaps splayed.
  const BANANA = "#ffd23a", BANANA_DK = "#e0a81c";
  const banana = cached(() => {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.28;
      parts.push(box({ w: 0.09, h: 0.09, d: 0.1, color: k % 2 ? BANANA : BANANA_DK, offset: { y: Math.cos(a) * 0.32 - 0.32, z: Math.sin(a) * 0.32 } }));
    }
    parts.push(box({ w: 0.05, h: 0.05, d: 0.05, color: "#5a3a22", offset: { y: Math.cos(0.56) * 0.32 - 0.32, z: Math.sin(0.62) * 0.32 + 0.04 } }));
    return merge(...parts);
  });
  const bananaPile = cached(() => {
    const parts = [];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.3, r = k < 5 ? 0.35 : 0.15;
      parts.push(moved(turnedY(banana(), a), Math.sin(a) * r, 0.36 + (k < 5 ? 0 : 0.12), Math.cos(a) * r));
    }
    return merge(...parts);
  });
  const peel = cached(() => {
    const parts = [box({ w: 0.12, h: 0.06, d: 0.12, color: BANANA_DK, offset: { y: 0.04 } })];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4;
      parts.push(turnedY(box({ w: 0.1, h: 0.03, d: 0.34, color: k % 2 ? BANANA : "#f2c62e", offset: { y: 0.02, z: 0.2 } }), a));
      parts.push(turnedY(box({ w: 0.06, h: 0.031, d: 0.06, color: "#5a3a22", offset: { y: 0.02, z: 0.37 } }), a));
    }
    return merge(...parts);
  });
  // A ball of gold paint, for the Golden AK.
  const goldBall = cached(() => { const geo = bevelBox({ w: 0.22, h: 0.22, d: 0.22, color: GOLD, emissive: 0.9 }); geo.castShadow = false; return geo; });
  // A catapult in its team's colours, in its own frame throwing toward +z: a timber base on wheels with two uprights
  // and a crossbar (`catapult`), and its throwing arm with a bucket (`catapultArm`), pivoting at its foot so the scene
  // can swing it.
  const catapult = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]], parts = [];
    for (const x of [-0.7, 0.7]) {
      parts.push(bevelBox({ w: 0.2, h: 0.24, d: 2.2, color: "#6a4a2a", offset: { x, y: 0.3 } }));
      for (const z of [-0.8, 0.8]) parts.push(bevelBox({ w: 0.14, h: 0.5, d: 0.5, color: "#3a2a1a", offset: { x: x * 1.15, y: 0.25, z } }));
      parts.push(bevelBox({ w: 0.16, h: 1.4, d: 0.16, color: "#6a4a2a", offset: { x, y: 1.0, z: 0.25 } }));
    }
    parts.push(bevelBox({ w: 1.6, h: 0.2, d: 0.2, color: c.deep, offset: { y: 1.6, z: 0.25 } }));
    parts.push(box({ w: 1.6, h: 0.16, d: 0.16, color: "#6a4a2a", offset: { y: 0.35, z: -0.85 } }));
    // A pad to stand on, painted in the team's colour so it reads as the way in.
    parts.push(box({ w: 1.5, h: 0.05, d: 1.5, color: c.paint, emissive: 0.35, offset: { y: 0.03, z: -1.6 } }));
    return merge(...parts);
  });
  const catapultArm = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]];
    return merge(
      bevelBox({ w: 0.16, h: 0.16, d: 2.1, color: "#8a6440", offset: { z: -1.0 } }),
      bevelBox({ w: 0.6, h: 0.18, d: 0.6, color: c.paint, emissive: 0.2, offset: { y: 0.1, z: -2.1 } }),
      box({ w: 0.66, h: 0.2, d: 0.08, color: "#5a3a22", offset: { y: 0.2, z: -2.4 } })
    );
  });
  // A parachute: a domed canopy in panels of the team's colour and cream, and four cords down to the shoulders.
  const chute = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]], parts = [];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      parts.push(turnedY(box({ w: 0.95, h: 0.12, d: 0.7, color: k % 2 ? c.paint : "#fff3d6", emissive: 0.15, offset: { y: 3.2, z: 0.85 } }), a));
      parts.push(turnedY(box({ w: 0.7, h: 0.1, d: 0.5, color: k % 2 ? c.light : c.paint, offset: { y: 3.45, z: 0.35 } }), a));
    }
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const n = 6;
      for (let k = 0; k < n; k++) parts.push(box({ w: 0.03, h: 0.32, d: 0.03, color: "#ddd2b8", offset: { x: x * (0.25 + 0.75 * k / n), y: 1.7 + k * 0.25, z: z * (0.25 + 0.75 * k / n) } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A monkey that rides at an Ooga's hip and fires with it (the ghost hunt's drop): a brown body and head, a tan face
  // with dark eyes, round ears, a curled tail and a little orange blaster.
  const monkey = cached(() => merge(
    bevelBox({ w: 0.26, h: 0.3, d: 0.22, color: "#6a4128", offset: { y: 0.15 } }),
    bevelBox({ w: 0.24, h: 0.22, d: 0.22, color: "#6a4128", offset: { y: 0.42 } }),
    box({ w: 0.16, h: 0.13, d: 0.04, color: "#d8a878", offset: { y: 0.4, z: 0.11 } }),
    box({ w: 0.04, h: 0.04, d: 0.02, color: "#140c08", offset: { x: -0.05, y: 0.44, z: 0.13 } }),
    box({ w: 0.04, h: 0.04, d: 0.02, color: "#140c08", offset: { x: 0.05, y: 0.44, z: 0.13 } }),
    box({ w: 0.08, h: 0.08, d: 0.04, color: "#a8704a", offset: { x: -0.15, y: 0.46 } }),
    box({ w: 0.08, h: 0.08, d: 0.04, color: "#a8704a", offset: { x: 0.15, y: 0.46 } }),
    box({ w: 0.05, h: 0.05, d: 0.26, color: "#6a4128", offset: { y: 0.12, z: -0.2 } }),
    box({ w: 0.05, h: 0.18, d: 0.05, color: "#6a4128", offset: { y: 0.22, z: -0.33 } }),
    box({ w: 0.07, h: 0.07, d: 0.24, color: ORANGE, emissive: 0.5, offset: { x: 0.1, y: 0.22, z: 0.18 } })
  ));
  // The jetpack every Ooga wears, in its own frame on the Ooga's back (+z forward): two team-banded tanks with a
  // strap between and a nozzle under each, and the flames that burn under the nozzles while it thrusts.
  // Free Hardware Wallets, after the store's six parodies (`SIM.WALLETS` order): Rektdger's narrow screen and metal
  // sleeve, ClownCard's keypad in clown colours with a red nose, BrickBox02 in brickwork, Passpoor's tall screen with
  // a taped corner, Jaded's landscape screen and wheel, SeedSnitcher's orange case with a joystick. Each 0.3 m or so.
  const walletDevice = variants((look) => {
    const parts = [];
    if (look === 0) {
      parts.push(bevelBox({ w: 0.12, h: 0.36, d: 0.08, color: "#1c1d22" }));
      parts.push(box({ w: 0.135, h: 0.2, d: 0.085, color: "#b8bcc4", offset: { y: -0.06 } }));
      parts.push(box({ w: 0.06, h: 0.13, d: 0.01, color: "#ff3b3b", emissive: 0.8, offset: { y: 0.08, z: 0.042 } }));
    } else if (look === 1) {
      parts.push(bevelBox({ w: 0.24, h: 0.32, d: 0.06, color: "#f2f2f2" }));
      parts.push(box({ w: 0.18, h: 0.09, d: 0.01, color: "#9fe6ff", emissive: 0.7, offset: { y: 0.09, z: 0.032 } }));
      const keys = ["#ff3b3b", "#ffd23a", "#3bd16f", "#3b8bff", "#c03bff", "#ff8a1f"];
      for (let i = 0; i < 9; i++) parts.push(box({ w: 0.045, h: 0.035, d: 0.015, color: keys[i % keys.length], offset: { x: (i % 3 - 1) * 0.06, y: -0.02 - Math.floor(i / 3) * 0.045, z: 0.035 } }));
      parts.push(box({ w: 0.04, h: 0.04, d: 0.03, color: "#ff2020", emissive: 0.6, offset: { y: 0.15, z: 0.035 } }));
    } else if (look === 2) {
      parts.push(bevelBox({ w: 0.32, h: 0.16, d: 0.1, color: "#a0442c" }));
      for (let i = 0; i < 3; i++) parts.push(box({ w: 0.33, h: 0.01, d: 0.105, color: "#d8c8b0", offset: { y: -0.05 + i * 0.05 } }));
      parts.push(box({ w: 0.14, h: 0.06, d: 0.01, color: "#ff3b3b", emissive: 0.7, offset: { x: 0.04, z: 0.052 } }));
      parts.push(box({ w: 0.05, h: 0.03, d: 0.04, color: "#c0c4cc", offset: { x: -0.18 } }));
    } else if (look === 3) {
      parts.push(bevelBox({ w: 0.2, h: 0.36, d: 0.05, color: "#2a2f3a" }));
      parts.push(box({ w: 0.16, h: 0.26, d: 0.01, color: "#7dffb0", emissive: 0.5, offset: { y: 0.02, z: 0.027 } }));
      parts.push(box({ w: 0.08, h: 0.04, d: 0.055, color: "#e6dcc0", offset: { x: 0.07, y: 0.15 } }));
    } else if (look === 4) {
      parts.push(bevelBox({ w: 0.3, h: 0.18, d: 0.07, color: "#1d8a7a" }));
      parts.push(box({ w: 0.16, h: 0.1, d: 0.01, color: "#c8fff4", emissive: 0.6, offset: { x: -0.03, z: 0.037 } }));
      parts.push(box({ w: 0.04, h: 0.08, d: 0.04, color: "#0f4a42", offset: { x: 0.12, y: 0.06 } }));
    } else {
      parts.push(bevelBox({ w: 0.3, h: 0.2, d: 0.08, color: "#ff8a1f" }));
      parts.push(box({ w: 0.11, h: 0.11, d: 0.01, color: "#1a1a1a", offset: { z: 0.042 } }));
      parts.push(box({ w: 0.09, h: 0.09, d: 0.012, color: "#ffe0a0", emissive: 0.6, offset: { z: 0.044 } }));
      parts.push(box({ w: 0.035, h: 0.035, d: 0.03, color: "#2a2a2a", offset: { x: -0.1, z: 0.045 } }));
      for (const y of [0.05, 0, -0.05]) parts.push(box({ w: 0.025, h: 0.025, d: 0.02, color: "#2a2a2a", offset: { x: 0.11, y, z: 0.045 } }));
    }
    return merge(...parts);
  });
  // The laser-eyes beam: a white-hot core in a red glow, one metre long along +z from the origin (the scene stretches
  // it to the beam's length), in two strands a hand apart, one from each eye.
  const beam = cached(() => {
    const parts = [];
    for (const x of [-0.07, 0.07]) {
      parts.push(box({ w: 0.035, h: 0.035, d: 1, color: "#fff4f0", emissive: 1, offset: { x, z: 0.5 } }));
      parts.push(box({ w: 0.09, h: 0.09, d: 1, color: "#ff2a1a", emissive: 1, offset: { x, z: 0.5 } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // Laser eyes lit: two glowing red eyes, set over the Ooga's own.
  const laserEyes = cached(() => merge(box({ w: 0.1, h: 0.07, d: 0.06, color: "#ff3a1a", emissive: 1, offset: { x: -0.07 } }), box({ w: 0.1, h: 0.07, d: 0.06, color: "#ff3a1a", emissive: 1, offset: { x: 0.07 } })));
  // A ghost: a pale glowing sheet, round on top and flaring to a ragged hem, two dark eyes and an open mouth, its arms
  // out. Faces +z, its middle at y 0.
  const ghost = cached(() => {
    const sheet = "#e8eefc", parts = [
      lathe({ profile: [[0, 0.75], [0.3, 0.68], [0.45, 0.45], [0.5, 0.1], [0.56, -0.35], [0.66, -0.62], [0, -0.62]], segments: 10, color: sheet, emissive: 0.55 })
    ];
    // The ragged hem: tatters hanging below.
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; parts.push(box({ w: 0.2, h: 0.22, d: 0.2, color: sheet, emissive: 0.5, offset: { x: Math.sin(a) * 0.55, y: -0.72 - (k % 2) * 0.08, z: Math.cos(a) * 0.55 } })); }
    parts.push(box({ w: 0.11, h: 0.17, d: 0.05, color: "#141018", offset: { x: -0.15, y: 0.35, z: 0.46 } }), box({ w: 0.11, h: 0.17, d: 0.05, color: "#141018", offset: { x: 0.15, y: 0.35, z: 0.46 } }));
    parts.push(box({ w: 0.16, h: 0.2, d: 0.05, color: "#141018", offset: { y: 0.08, z: 0.5 } }));
    for (const s of [-1, 1]) parts.push(box({ w: 0.36, h: 0.14, d: 0.16, color: sheet, emissive: 0.5, offset: { x: s * 0.6, y: 0.08, z: 0.12 } }));
    return merge(...parts);
  });
  // The fuse light on top of every device; the scene blinks it faster as the fuse runs down.
  const walletLight = cached(() => box({ w: 0.06, h: 0.05, d: 0.06, color: "#ff2a1a", emissive: 1 }));
  // The FREE WALLETS machine: a red cabinet on a plinth, a glowing window with the six devices in it, a marquee, a
  // coin slot and the tray. Faces +z.
  const vend = cached(() => {
    const parts = [
      box({ w: 1.3, h: 0.15, d: 0.95, color: "#3a3a40", offset: { y: 0.075 } }),
      bevelBox({ w: 1.2, h: 1.85, d: 0.85, color: "#c8242a", offset: { y: 1.075 } }),
      box({ w: 1.28, h: 0.32, d: 0.9, color: "#ff3b3b", emissive: 0.6, offset: { y: 2.12 } }),
      box({ w: 1.0, h: 0.06, d: 0.92, color: "#fff3d6", emissive: 0.9, offset: { y: 2.12 } }),
      box({ w: 0.78, h: 1.0, d: 0.02, color: "#bfe8ff", emissive: 0.45, offset: { x: -0.12, y: 1.25, z: 0.43 } }),
      box({ w: 0.18, h: 0.3, d: 0.03, color: "#2a2a30", offset: { x: 0.43, y: 1.35, z: 0.43 } }),
      box({ w: 0.06, h: 0.02, d: 0.04, color: "#ffd23a", emissive: 0.8, offset: { x: 0.43, y: 1.42, z: 0.45 } }),
      box({ w: 0.7, h: 0.18, d: 0.08, color: "#1a1a1e", offset: { x: -0.12, y: 0.5, z: 0.44 } })
    ];
    const looks = [0, 1, 2, 3, 4, 5];
    for (let i = 0; i < looks.length; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      parts.push(moved(walletDevice(looks[i]), -0.3 + col * 0.36, 1.58 - row * 0.32, 0.36));
    }
    return merge(...parts);
  });
  const jetpack = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]], parts = [];
    for (const x of [-0.13, 0.13]) {
      parts.push(bevelBox({ w: 0.2, h: 0.5, d: 0.2, color: "#8a8e96", offset: { x, y: 0.25 } }));
      parts.push(box({ w: 0.21, h: 0.08, d: 0.21, color: c.paint, emissive: 0.3, offset: { x, y: 0.36 } }));
      parts.push(box({ w: 0.12, h: 0.1, d: 0.12, color: "#3a3a40", offset: { x, y: -0.04 } }));
    }
    parts.push(box({ w: 0.12, h: 0.32, d: 0.08, color: "#5a3a22", offset: { y: 0.28, z: 0.1 } }));
    return merge(...parts);
  });
  const jetFlames = cached(() => {
    const geo = merge(...[-0.13, 0.13].map((x) => merge(
      moved(lathe({ profile: [[0, 0], [0.1, -0.08], [0.06, -0.3], [0, -0.5]], segments: 6, color: "#ff8a2a", emissive: 1 }), x, -0.08, 0),
      moved(lathe({ profile: [[0, 0], [0.06, -0.06], [0.03, -0.2], [0, -0.3]], segments: 6, color: "#fff3a0", emissive: 1 }), x, -0.08, 0)
    )));
    geo.castShadow = false;
    return geo;
  });
  // A cargo net hung on a climb's face: rope squares from the ground to its top, `w` wide, in its own frame facing +z.
  const net2 = variants((key) => {
    const [w10, top10] = key.split(":").map(Number), w = w10 / 10, top = top10 / 10, parts = [];
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.3) parts.push(box({ w: 0.05, h: top, d: 0.05, color: "#c9a96b", offset: { x, y: top / 2 } }));
    for (let y = 0.15; y <= top; y += 0.3) parts.push(box({ w, h: 0.05, d: 0.05, color: "#b0905a", offset: { y } }));
    return merge(...parts);
  });
  BL.blockModels = { beam, laserEyes, ghost, walletDevice, walletLight, vend, net2, jetpack, jetFlames, monkey, catapult, catapultArm, chute, goldBall, banana, bananaPile, peel, firePit, flames, potato, potatoArm, power, ice, tramp, TEAM, ORANGE, GUNS, arena, stand, block, tick, ball, splat, ring, pad, bubble, crate, grenade, rocket, net, draped, streak, gun, ladder, rack, zipline, trolley, cache, SPLATS: 6 };
})();
