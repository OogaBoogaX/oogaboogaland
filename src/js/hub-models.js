// Hub props, one cached geometry per builder
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb, mulberry32 } = BL.math;
  const { box, lathe, ring, merge, voxelFaces } = BL.models;
  const cached = (build) => {
    let value = null;
    return () => value || (value = build());
  };
  const variants = (build) => {
    const cache = [];
    return (i = 0) => cache[i] || (cache[i] = build(i));
  };
  const vox = () => {
    const map = new Map();
    const key = (x, y, z) => x + "," + y + "," + z;
    return {
      map,
      has: (x, y, z) => map.has(key(x, y, z)),
      set: (x, y, z, c) => map.set(key(x, y, z), c),
      fill(x0, x1, y0, y1, z0, z1, c) {
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) map.set(key(x, y, z), typeof c === "function" ? c(x, y, z) : c);
      }
    };
  };
  // Voxel cells to geometry, palette in hex
  const voxGeo = (v, { unit, palette, origin = { x: 0, y: 0, z: 0 }, emissive = {} }) => {
    const geo = { verts: [], faces: [], lines: [] };
    const rgb = palette.map(hexToRgb);
    const emit = (pts, c) => {
      const i = pts.map(([x, y, z]) => {
        geo.verts.push(origin.x + x * unit, origin.y + y * unit, origin.z + z * unit);
        return geo.verts.length / 3 - 1;
      });
      geo.faces.push({ i, color: rgb[c], emissive: emissive[c] || 0 });
    };
    voxelFaces((fn) => {
      for (const [k, c] of v.map) {
        const [x, y, z] = k.split(",").map(Number);
        fn(x, y, z, c);
      }
    }, v.has, emit);
    return geo;
  };
  // Ellipsoid of cells, chipped and cut off below floor
  const blob = (v, { cx, cy, cz, rx, ry, rz, chip = 0, floor = -Infinity, rand, color }) => {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      for (let y = Math.max(floor, Math.floor(cy - ry)); y <= Math.ceil(cy + ry); y++) {
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > 1 || (d > 0.72 && rand() < chip)) continue;
          v.set(x, y, z, color(x, y, z));
        }
      }
    }
  };
  const pick = (rand, base, alt, p) => () => rand() < p ? alt : base;
  const VOX = 0.5;
  const HALF = { x: -VOX / 2, y: 0, z: -VOX / 2 };
  const STONE = ["#3a3734", "#2d2b28", "#45413d"];
  const CLIFF = ["#7d6f61", "#5e5449", "#877869"];
  const WOOD = "#8a6236", WOOD_DK = "#5c4425", PLANK = "#a9773f";
  // Stone frame around a cave mouth
  const caveMouthRim = cached(() => {
    const rand = mulberry32(31);
    const v = vox();
    const stone = pick(rand, 0, 1, 0.3);
    const light = pick(rand, 2, 0, 0.5);
    v.fill(-6, -6, 0, 5, 0, 1, stone);
    v.fill(5, 5, 0, 5, 0, 1, stone);
    v.fill(-5, 4, 6, 6, 0, 1, light);
    return voxGeo(v, { unit: VOX, palette: CLIFF, origin: { x: 0, y: 0, z: -VOX } });
  });
  // Gateway arch over the pass, trail along z
  const gate = cached(() => {
    const rand = mulberry32(67);
    const v = vox();
    const stone = pick(rand, 0, 1, 0.3);
    const light = pick(rand, 2, 0, 0.5);
    v.fill(-3, -3, 0, 7, 0, 1, stone);
    v.fill(2, 2, 0, 7, 0, 1, stone);
    v.fill(-3, 2, 8, 8, 0, 1, light);
    v.fill(-1, 0, 9, 9, 0, 1, light);
    return voxGeo(v, { unit: VOX, palette: STONE, origin: { x: 0, y: 0, z: -VOX } });
  });
  const SCREEN = (x, y, color) => [
    box({ w: 0.7, h: 0.5, d: 0.12, color: "#1d2326", offset: { x, y, z: 0 } }),
    box({ w: 0.62, h: 0.42, d: 0.02, color, emissive: 0.9, offset: { x, y, z: 0.07 } })
  ];
  // Shelves that glow enough to read in the tunnel
  const caveShelves = cached(() => merge(
    box({ w: 2.4, h: 2.2, d: 0.1, color: "#3a3632", emissive: 0.35, offset: { y: 1.1, z: -0.25 } }),
    box({ w: 0.12, h: 2.2, d: 0.6, color: "#6a4f34", emissive: 0.35, offset: { x: -1.14, y: 1.1 } }),
    box({ w: 0.12, h: 2.2, d: 0.6, color: "#6a4f34", emissive: 0.35, offset: { x: 1.14, y: 1.1 } }),
    ...[0.06, 0.78, 1.5].map((y) => box({ w: 2.3, h: 0.08, d: 0.6, color: "#7a5a3a", emissive: 0.35, offset: { y } })),
    ...SCREEN(-0.6, 1.1, "#3fd1c5"),
    ...SCREEN(0.5, 1.82, "#6f9fca"),
    box({ w: 0.4, h: 0.3, d: 0.3, color: "#1d2326", offset: { x: 0.55, y: 0.97, z: 0.05 } }),
    box({ w: 0.3, h: 0.06, d: 0.02, color: "#22c55e", emissive: 0.9, offset: { x: 0.55, y: 1.05, z: 0.21 } }),
    box({ w: 0.44, h: 0.44, d: 0.44, color: WOOD, offset: { x: -0.7, y: 0.32, z: 0.02 } }),
    box({ w: 0.24, h: 0.3, d: 0.24, color: "#d8892b", offset: { x: 0.2, y: 0.25, z: 0.06 } }),
    box({ w: 0.24, h: 0.2, d: 0.24, color: "#6f9fca", offset: { x: 0.65, y: 0.2, z: 0.02 } })
  ));
  // Jetpack tanks and backplate, flame kept separate
  const JET_UNIT = 0.075;
  const JET_ORIGIN = { x: -3 * JET_UNIT, y: 0, z: -2 * JET_UNIT };
  const jetpack = cached(() => {
    const v = vox();
    for (const x of [0, 4]) {
      v.fill(x, x + 1, 1, 5, 0, 1, 0);
      v.fill(x, x + 1, 6, 6, 0, 1, 1);
      v.fill(x, x + 1, 0, 0, 0, 1, 2);
    }
    v.fill(2, 3, 2, 5, 1, 1, 1);
    v.fill(2, 3, 4, 4, 0, 0, 2);
    return voxGeo(v, { unit: JET_UNIT, palette: ["#c8552f", "#9aa1a8", "#3c3f44"], origin: JET_ORIGIN });
  });
  const jetFlame = cached(() => {
    const v = vox();
    for (const x of [0, 4]) {
      v.fill(x, x + 1, -1, -1, 0, 1, 0);
      v.set(x + (x ? 0 : 1), -2, 1, 1);
      v.set(x + (x ? 1 : 0), -2, 0, 1);
    }
    return voxGeo(v, { unit: JET_UNIT, palette: ["#ffb13b", "#ffe9a8"], origin: JET_ORIGIN, emissive: { 0: 1, 1: 1 } });
  });
  const bedroll = cached(() => merge(box({ w: 1.9, h: 0.09, d: 0.85, color: "#2e2724" }), box({ w: 0.4, h: 0.16, d: 0.6, color: "#40342c", offset: { x: 0.65, y: 0.1 } })));
  const CANOPIES = [["#456d4f", "#365840", "#557f5d"], ["#e8b4c6", "#d697b0", "#f2c9d8"]];
  // Trunk into a 2.5 canopy, 3 units tall
  const tree = variants((i) => {
    const rand = mulberry32(101 + i);
    const v = vox();
    v.fill(0, 0, 0, 2, 0, 0, pick(rand, 0, 1, 0.3));
    const leaf = pick(rand, 2, 3, 0.3);
    const light = pick(rand, 2, 4, 0.5);
    blob(v, { cx: 0.5, cy: 4, cz: 0.5, rx: 2.5, ry: 2.1, rz: 2.5, chip: 0.4, rand, color: (x, y) => y >= 5 ? light() : leaf() });
    return voxGeo(v, { unit: VOX, palette: ["#6b4a2b", "#4e361f", ...CANOPIES[i]], origin: HALF });
  });
  // A small tuft, one unit wide
  const bush = cached(() => {
    const rand = mulberry32(7);
    const v = vox();
    blob(v, { cx: 0, cy: 0.5, cz: 0, rx: 1.0, ry: 1.2, rz: 1.0, chip: 0.25, floor: 0, rand, color: pick(rand, 0, 1, 0.35) });
    return voxGeo(v, { unit: VOX, palette: ["#5b9a3a", "#4a8530"] });
  });
  const ROCK_SHAPES = [{ rx: 1.6, ry: 1.8, rz: 1.4 }, { rx: 2.5, ry: 1.9, rz: 2.1 }];
  const rock = variants((i) => {
    const rand = mulberry32(211 + i);
    const v = vox();
    const { rx, ry, rz } = ROCK_SHAPES[i];
    blob(v, { cx: 0.5, cy: 0.2, cz: 0.5, rx, ry, rz, chip: 0.15, floor: 0, rand, color: pick(rand, 0, 1, 0.3) });
    for (const [k, c] of v.map) if (c === 0 && rand() < 0.15) v.map.set(k, 2);
    return voxGeo(v, { unit: VOX, palette: ["#6b625a", "#57504a", "#7a716a"], origin: HALF });
  });
  const woodCrate = cached(() => merge(
    box({ w: 0.9, h: 0.9, d: 0.9, color: PLANK, offset: { y: 0.45 } }),
    ...[[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([x, z]) => box({ w: 0.1, h: 0.94, d: 0.1, color: WOOD_DK, offset: { x, y: 0.47, z } })),
    box({ w: 0.94, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.89, z: -0.42 } }),
    box({ w: 0.94, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.89, z: 0.42 } }),
    box({ w: 0.1, h: 0.1, d: 0.94, color: WOOD_DK, offset: { x: -0.42, y: 0.89 } }),
    box({ w: 0.1, h: 0.1, d: 0.94, color: WOOD_DK, offset: { x: 0.42, y: 0.89 } })
  ));
  const barrel = cached(() => merge(
    lathe({ profile: [[0.32, 0], [0.4, 0.16], [0.43, 0.45], [0.4, 0.74], [0.32, 0.9], [0, 0.9]], segments: 8, color: "#7a5230" }),
    ring({ r: 0.45, thickness: 0.03, y: 0.24, segments: 8, color: "#3a2a1a" }),
    ring({ r: 0.45, thickness: 0.03, y: 0.66, segments: 8, color: "#3a2a1a" })
  ));
  const flowerTuft = cached(() => merge(
    box({ w: 0.44, h: 0.12, d: 0.14, color: "#5b9a3a", offset: { y: 0.06 } }),
    box({ w: 0.14, h: 0.12, d: 0.44, color: "#4a8530", offset: { y: 0.06 } }),
    ...[[-0.14, 0.05, 0.3, "#e04a3a"], [0.02, -0.12, 0.36, "#f2c94c"], [0.15, 0.1, 0.26, "#f3efe4"]].map(([x, z, h, color]) => merge(
      box({ w: 0.04, h, d: 0.04, color: "#4a8530", offset: { x, y: h / 2, z } }),
      box({ w: 0.12, h: 0.1, d: 0.12, color, offset: { x, y: h + 0.03, z } })
    ))
  ));
  const torch = cached(() => {
    const geo = merge(
      box({ w: 0.14, h: 1.1, d: 0.14, color: WOOD_DK, offset: { y: 0.55 } }),
      box({ w: 0.24, h: 0.16, d: 0.24, color: "#3a2a18", offset: { y: 1.16 } }),
      box({ w: 0.26, h: 0.26, d: 0.26, color: "#ffb13b", emissive: 1, offset: { y: 1.36 } })
    );
    geo.castShadow = false;
    return geo;
  });
  // Three leaf strands, about 1.2 wide
  const vine = cached(() => {
    const rand = mulberry32(53);
    const leaves = [];
    [[-0.42, 5], [0.02, 4], [0.44, 3]].forEach(([x, count]) => {
      for (let n = 0; n < count; n++) leaves.push(box({ w: 0.26, h: 0.34, d: 0.18, color: n % 2 ? "#3e7a2c" : "#4f8a3d", offset: { x: x + (rand() - 0.5) * 0.08, y: -0.17 - n * 0.34 } }));
    });
    const geo = merge(...leaves);
    geo.castShadow = false;
    return geo;
  });
  // Flat cloud blobs from overlapping puffs
  const CLOUD_PUFFS = [
    [[0, 3, 2.6], [3, 4.5, 2]],
    [[-2, 3.4, 3], [2.5, 4.4, 2.6], [6, 3, 2.2]],
    [[-4, 3.6, 3.2], [0, 5, 3.6], [4, 4.4, 3], [7.5, 3, 2.4]]
  ];
  const cloud = variants((i) => {
    const rand = mulberry32(307 + i);
    const v = vox();
    const puffs = CLOUD_PUFFS[i];
    const mid = (puffs[0][0] + puffs[puffs.length - 1][0]) / 2;
    for (const [cx, rx, rz] of puffs) blob(v, { cx: cx - mid + 0.5, cy: 1, cz: 0.5, rx, ry: 1.6, rz, chip: 0.3, rand, color: (x, y) => y > 0 ? 0 : 1 });
    const geo = voxGeo(v, { unit: VOX, palette: ["#f7f9fb", "#dfe6ee"], origin: { x: -VOX / 2, y: -VOX, z: -VOX / 2 } });
    geo.castShadow = false;
    return geo;
  });
  const ladder = cached(() => merge(
    box({ w: 0.1, h: 4, d: 0.1, color: WOOD, offset: { x: -0.4, y: 2 } }),
    box({ w: 0.1, h: 4, d: 0.1, color: WOOD, offset: { x: 0.4, y: 2 } }),
    ...Array.from({ length: 9 }, (_, n) => box({ w: 0.9, h: 0.08, d: 0.08, color: "#7a5630", offset: { y: 0.35 + n * 0.42 } }))
  ));
  const dock = cached(() => merge(
    ...Array.from({ length: 8 }, (_, n) => box({ w: 0.46, h: 0.1, d: 2, color: n % 2 ? "#8f6538" : "#9c7040", offset: { x: 0.25 + n * 0.5, y: -0.05 } })),
    box({ w: 4, h: 0.14, d: 0.16, color: WOOD_DK, offset: { x: 2, y: -0.17, z: -0.92 } }),
    box({ w: 4, h: 0.14, d: 0.16, color: WOOD_DK, offset: { x: 2, y: -0.17, z: 0.92 } }),
    ...[[0.5, -0.8], [0.5, 0.8], [3.5, -0.8], [3.5, 0.8]].map(([x, z]) => box({ w: 0.2, h: 2.2, d: 0.2, color: "#6b4a2b", offset: { x, y: -1.2, z } }))
  ));
  BL.hubModels = { jetpack, jetFlame, caveMouthRim, gate, caveShelves, bedroll, tree, bush, rock, woodCrate, barrel, flowerTuft, torch, vine, cloud, ladder, dock };
})();
