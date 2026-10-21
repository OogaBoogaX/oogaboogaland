// Free Puppies Rescue's dogs in DSB Land (VAC 1, `rescue-room.js`): puppies waiting in the rescue's yard, strays roaming
// the Chora's lanes, and the dogs the visitor adopted for any Ooga, one each. A dog adopted for the Ooga walking DSB
// follows it a step behind, through every door and back out; it grows hungry over scene time (`HUNGER_SECONDS` from
// full to empty), sits and whines once it passes `HUNGRY`, eats a banana from the shared pile when tapped, and while
// fed poops in the Chora on a jittered timer wherever it walks. Left empty for `STARVE_SECONDS` it goes back to the
// rescue and is up for adoption again. A puppy adopted for an Ooga that is not here trots out of the yard's door.
//
// Every dog lives in one space: the Chora (`OUT`), the rescue's yard (`YARD`), or with its Ooga (`WITH`), wherever that
// Ooga is. The scene says each frame which space the visitor stands in (`update`'s `at`); a dog in another space is
// neither drawn nor picked, and waits there unmoved, so the rooms and the Chora share coordinates and one floor query.
//
// Hundreds of strays roam all of DSB Land whoever has adopted what: dogs nobody has taken in yet, each round a home the
// scene seeds across the island's walkable ground and its lanes (`homesAcross`, `strays.homes`), as many as the quality
// tier allows (`STRAY_TIER`, up to `STRAY_CAP`). A stray wanders a few metres from home along clear straight lines
// (`strays.clearSegment`), sniffs, sits, poops into the same ring of piles wherever it is, sleeps at home by night and
// now and then trots beside the Ooga passing by for a stretch. A tap on one opens the adoption with that very dog chosen;
// adopted, it follows its Ooga like any other, and a newcomer takes its home `STRAY_RESPAWN` seconds later.
//
// So many cost little: a stray further than the tier's draw distance from the camera (`DRAW`, plus `THINK_NEAR`) thinks
// only one frame in `FAR_SLICES`, with the time it missed, and is not drawn; of those within it and before the camera
// at most `DRAWN` a frame are drawn. Fixed capacity throughout: `DOG_CAP` slots in typed arrays and, per breed, one
// instanced batch each of `DRAWN_CAP` for the bodies, the legs (four instances a dog, swung about the hip) and the tails;
// poop is one batch of `POOP_CAP` cartoon swirls kept oldest first, so a full DSB Land loses its oldest pile, drawn
// within the same distance, with two flies over each of the nearest `FLY_PILES` in one more batch. The frame loop writes
// `instanceData` in place and allocates nothing. Adoptions, hunger and the poop live in `game.state.rescue` (validated in
// `game.load`). Pick targets are made once a visit, one for each dog drawn and one a poop, shown only while in use and in
// view, and removed in `dispose`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { fnv1a } = BL.math;
  // The yard's six waiting puppies, DSB Land's strays, the visitor's own dog and those on their way out.
  const STRAY_CAP = 300, DOG_CAP = STRAY_CAP + 32;
  const POOP_CAP = 512, FLY_PILES = 48, FLY_NEAR = 18;
  const HUNGER_SECONDS = 600, HUNGRY = 0.7, STARVE_SECONDS = 90;
  // Seconds between two poops of a fed dog, jittered by a throwaway roll; a stray goes half as often.
  const POOP_MIN = 120, POOP_SPAN = 120, STRAY_POOP_MIN = 240, STRAY_POOP_SPAN = 240;
  const EAT_SECONDS = 2.6, SQUAT_SECONDS = 1.4, RESTOCK_SECONDS = 4;
  // A dog left further behind than TELEPORT (its Ooga went through a door, or flew off) turns up at its side.
  const WALK = 2.2, RUN = 4.6, TELEPORT = 8;
  const SAVE_EVERY = 15;
  const FREE = 0, KENNEL = 1, FOLLOW = 2, SIT = 3, EAT = 4, SQUAT = 5, NAP = 6, HOME = 7, OUT = 8, STRAY = 9;
  const STATE_NAMES = ["free", "kennel", "follow", "sit", "eat", "poop", "sleep", "home", "out", "stray"];
  // Where a dog is: the Chora, the rescue's yard, or with its Ooga. `update` takes the visitor's as CHORA, YARD or ROOM
  // (any other interior).
  const CHORA = 0, YARD = 1, WITH = 2, ROOM = 3;
  // Strays: how many roam on each quality tier. One roams up to STRAY_ROAM from home, never further than STRAY_LEASH
  // while it tags along beside the Ooga within STRAY_NEAR of it.
  const STRAY_TIER = { high: 300, medium: 150, low: 60 };
  const STRAY_RESPAWN = 45, STRAY_ROAM = 3.5, STRAY_NEAR = 5, STRAY_LEASH = 16;
  // Drawing and thinking by distance from the camera: dogs within DRAW metres and before it are drawn, at most DRAWN
  // strays a frame (DRAWN_CAP holds the most of any tier plus every other dog), and piles within POOP_DRAW, at most
  // POOPS_DRAWN; a stray beyond DRAW + THINK_NEAR thinks one frame in FAR_SLICES.
  const DRAW = { high: 60, medium: 42, low: 28 }, DRAWN = { high: 128, medium: 72, low: 32 }, DRAWN_CAP = 160;
  const POOP_DRAW = { high: 40, medium: 30, low: 22 }, POOPS_DRAWN = { high: 160, medium: 96, low: 48 };
  const THINK_NEAR = 12, FAR_SLICES = 8, VIEW_CONE = 0.45;
  // What a stray is up to, and the pose each draws in: roaming, sniffing, sitting, asleep at home, tagging along,
  // squatting.
  const ROAM = 0, SNIFF = 1, REST = 2, DOZE = 3, TAG = 4, PLOP = 5;
  const MOOD_NAMES = ["roam", "sniff", "sit", "sleep", "tag", "poop"];
  const MOOD_POSE = [FOLLOW, EAT, SIT, NAP, FOLLOW, SQUAT];
  // Each breed's look. Sizes are in voxel cells: `leg` the leg length, `torso` and `head` width, height and
  // length, `snout` the muzzle; colours index `ink` (coat, shade, cream, dark, collar, tongue, patch). `muscle`
  // bulks the shoulders and haunches out a cell, `socks` paints the paws cream.
  const BREEDS = [
    { id: "shiba", name: "Shiba", leg: 5, torso: [6, 6, 12], head: [6, 6, 6], snout: [4, 3, 3], ears: "point", tail: "curl",
      ink: ["#d9822b", "#b86a20", "#f3e3c8", "#2a1d17", "#d9442b", "#e98a9a", "#b86a20"] },
    { id: "dalmatian", name: "Dalmatian", leg: 7, torso: [6, 6, 13], head: [5, 6, 6], snout: [3, 3, 3], ears: "flop", tail: "long", spots: true,
      ink: ["#f2efe8", "#d6d2c8", "#f2efe8", "#1e1e22", "#3a7bd5", "#e98a9a", "#1e1e22"] },
    { id: "bulldog", name: "Bulldog", leg: 4, torso: [8, 6, 11], head: [8, 7, 6], snout: [6, 3, 2], ears: "rose", tail: "stub", jowls: true,
      ink: ["#d9b48a", "#b8936a", "#f3e6d0", "#1d1b1a", "#3b3d42", "#e98a9a", "#8a6a4a"] },
    { id: "corgi", name: "Corgi", leg: 3, torso: [7, 6, 14], head: [6, 6, 6], snout: [4, 3, 3], ears: "tall", tail: "fluff",
      ink: ["#d9893a", "#b8702c", "#f6ead4", "#2a1d17", "#4caf50", "#e98a9a", "#b8702c"] },
    { id: "pitbull", name: "Pit Bull", leg: 6, torso: [8, 7, 12], head: [8, 7, 6], snout: [4, 3, 3], ears: "rose", tail: "whip", muscle: true, socks: true, blaze: true,
      ink: ["#6f7a88", "#56606c", "#f2efe8", "#1d1b1a", "#e0a020", "#e98a9a", "#56606c"] },
    { id: "labrador", name: "Labrador", leg: 6, torso: [7, 7, 14], head: [6, 6, 7], snout: [4, 3, 4], ears: "drop", tail: "otter",
      ink: ["#e2b765", "#c79a4a", "#f2d89c", "#2a1d17", "#c0392b", "#e98a9a", "#b98a40"] }
  ];
  // The adoption dialog's portraits, 10x10 with one character an ink: c coat, s shade, w cream, d dark, p tongue.
  const FACES = [
    ["..s....s..", ".sws..sws.", ".scccccc s", "cccccccccc", "cdwccccwdc", "ccwwwwwwcc", "cwwwddwwwc", ".wwwwwwww.", "..wwppww..", "...wwww..."],
    ["..........", ".dwwwwwwd.", "ddwwddwwdd", "ddwwwwwwdd", "dwdwwwwdwd", "dwwwwwwwwd", ".wwwddwww.", ".wwwwwwww.", "..wwppww..", "...wwww..."],
    ["..........", ".s......s.", "sswwwwwwss", "wwwwwwwwww", "wdwwwwwwdw", "wwwwddwwww", "wwwwddwwww", "swwwwwwwws", "sswwppwwss", ".ssssssss."],
    [".c......c.", ".cw....wc.", "ccwc..cwcc", "cccccccccc", "cdcwwwwcdc", "cccwwwwccc", "cwwwddwwwc", ".wwwwwwww.", "..wwppww..", "...wwww..."],
    ["..........", "ss......ss", "sccccwcccs", "ccccwwcccc", "cdcccwccdc", "ccccwwcccc", "cccwwwwccc", "ccwwddwwcc", "cwwwwwwwwc", ".cwwppwwc."],
    ["..cccccc..", ".cccccccc.", "sccccccccs", "sscdccdcss", "ssccccccss", "sscwwwwcss", ".scwddwcs.", "..wwwwww..", "..wwppww..", "...wwww..."]
  ];
  const FACE_INK = { c: 0, s: 1, w: 2, d: 3, p: 5 };
  const U = 0.04;
  const hungerAfter = (hunger, dt) => Math.min(1, hunger + dt / HUNGER_SECONDS);
  const breedFor = (name) => fnv1a(`${name}/dog`) % BREEDS.length;
  // The name the adoption dialog suggests for an Ooga's dog.
  const NAMES = ["Buddy", "Luna", "Max", "Bella", "Charlie", "Daisy", "Rocky", "Lucy", "Biscuit", "Pepper", "Bruno", "Rosie", "Milo", "Nala", "Teddy", "Coco"];
  const nameFor = (owner) => NAMES[fnv1a(`${owner}/name`) % NAMES.length];
  // DSB Land's stray homes, the same on every page: `lane` spots seeded with mulberry32 along the Chora's lanes, a step
  // off the paving to either side, then spots anywhere on the island within `radius` of its middle until there are
  // `count`, each where `clearAt(x, y, z)` lets a dog stand and at least HOME_GAP from every other. They come shuffled,
  // so the first n of them, the homes a tier fills, spread over the whole island, except that the NEAR_HOMES nearest
  // `near` (the rescue's doorstep) lead, so even the lowest tier's strays roam the rescue's quarter.
  const HOME_GAP = 3, NEAR_HOMES = 4;
  const homesAcross = ({ lanes, groundAt, clearAt, count, lane, radius, seed, near }) => {
    const rand = BL.math.mulberry32(seed), out = new Float32Array(count * 3);
    let n = 0;
    const settle = (x, z) => {
      const y = groundAt(x, z);
      if (!clearAt(x, y, z)) return;
      for (let j = 0; j < n; j++) if (Math.hypot(out[j * 3] - x, out[j * 3 + 2] - z) < HOME_GAP) return;
      out[n * 3] = x; out[n * 3 + 1] = y; out[n * 3 + 2] = z;
      n++;
    };
    let total = 0;
    for (const l of lanes) for (let k = 1; k < l.length; k++) total += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]);
    for (let tries = 0; n < lane && tries < lane * 200; tries++) {
      let along = rand() * total, x = 0, z = 0, nx = 0, nz = 0;
      for (const l of lanes) for (let k = 1; k < l.length; k++) {
        const ax = l[k - 1][0], az = l[k - 1][1], len = Math.hypot(l[k][0] - ax, l[k][1] - az);
        if (along >= 0 && along <= len) { x = ax + (l[k][0] - ax) * along / len; z = az + (l[k][1] - az) * along / len; nx = -(l[k][1] - az) / len; nz = (l[k][0] - ax) / len; }
        along -= len;
      }
      const side = (rand() - 0.5) * 3;
      settle(x + nx * side, z + nz * side);
    }
    for (let tries = 0; n < count && tries < count * 200; tries++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
      settle(Math.cos(a) * r, Math.sin(a) * r);
    }
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
    const from = (i) => Math.hypot(out[i * 3] - near[0], out[i * 3 + 2] - near[1]);
    const lead = order.slice().sort((a, b) => from(a) - from(b)).slice(0, NEAR_HOMES);
    return Float32Array.from([...lead, ...order.filter((i) => !lead.includes(i))].flatMap((i) => [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]));
  };

  // Joins the builder caches that are dropped when the scenes that used them are left (`BL.models.track`).
  const geometryOf = (() => {
    const cache = new Map(), scoped = BL.models.track(() => cache.clear());
    return (breed, part) => {
      scoped.use();
      const key = `${breed}/${part}`;
      let geo = cache.get(key);
      if (!geo) cache.set(key, geo = buildPart(BREEDS[breed], part));
      return geo;
    };
  })();
  // Voxel layout of one breed: the body (torso, head, ears) stands with its origin on the ground under the
  // torso's middle and faces +z; a leg hangs from its hip at the origin; the tail grows from its root.
  const layoutOf = (b) => {
    const [tw, th, tl] = b.torso, [hw, hh, hl] = b.head;
    const bottom = b.leg, top = b.leg + th - 1, back = -(tl >> 1), front = back + tl - 1;
    const headBottom = top - 2, headTop = headBottom + hh - 1, headBack = front - 1, headFront = headBack + hl - 1;
    return { leg: b.leg, tw, th, tl, hw, hh, hl, bottom, top, back, front, headBottom, headTop, headBack, headFront };
  };
  const buildPart = (b, part) => {
    const { makeVox, voxelGeometry } = BL.models;
    const v = makeVox(), L = layoutOf(b);
    const COAT = 0, SHADE = 1, CREAM = 2, DARK = 3, COLLAR = 4, TONGUE = 5, PATCH = 6;
    if (part === "leg") {
      const w = b.torso[0] >= 8 ? 3 : 2;
      v.fill(-(w >> 1), (w >> 1) + (w & 1) - 1, -b.leg, -1, -1, 0, (x, y) => y === -b.leg ? (b.socks || b.id === "dalmatian" ? CREAM : SHADE) : COAT);
      return voxelGeometry(v, { unit: U, palette: b.ink });
    }
    if (part === "tail") {
      const cells = b.tail === "curl" ? [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 1], [0, 3, 2], [0, 2, 3], [-1, 1, 0], [1, 1, 0]]
        : b.tail === "long" ? [[0, 0, 0], [0, 0, -1], [0, -1, -2], [0, -1, -3], [0, -2, -4], [0, -2, -5]]
          : b.tail === "stub" ? [[0, 0, 0], [0, 0, -1]]
            // A pit bull's thin whip, level then tapering down; a labrador's otter tail, thick at the root.
            : b.tail === "whip" ? [[0, 0, 0], [0, 0, -1], [0, 0, -2], [0, -1, -3], [0, -1, -4]]
              : b.tail === "otter" ? [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 0, -1], [-1, 0, -1], [0, -1, -1], [0, -1, -2], [0, -2, -3], [0, -2, -4]]
                : [[0, 0, 0], [0, 0, -1], [-1, 0, -1], [1, 0, -1], [0, 1, -1], [0, 0, -2], [0, 1, -2]];
      cells.forEach(([x, y, z], i) => v.set(x, y, z, b.tail === "curl" && i > 4 ? CREAM : b.tail === "long" && i === cells.length - 1 ? DARK : b.tail === "whip" && i > 2 ? SHADE : COAT));
      return voxelGeometry(v, { unit: U, palette: b.ink, origin: { x: -U / 2, y: -U / 2, z: -U / 2 } });
    }
    if (part === "poop") return poopPart();
    const rand = BL.math.mulberry32(fnv1a(b.id));
    const x0 = -(L.tw >> 1), x1 = x0 + L.tw - 1;
    // Torso: coat with a shaded back stripe, a cream belly and chest, a collar where the neck meets it.
    v.fill(x0, x1, L.bottom, L.top, L.back, L.front, (x, y, z) => {
      if (z === L.front && y > L.bottom && (x === x0 || x === x1 || y === L.top)) return COLLAR;
      if (z === L.front - 1 && y > L.bottom && (x === x0 || x === x1 || y === L.top)) return COLLAR;
      if (y === L.bottom || (z >= L.front - 2 && y < L.bottom + 3 && Math.abs(x + 0.5) < 2)) return b.id === "bulldog" ? COAT : CREAM;
      if (b.spots && rand() < 0.16) return PATCH;
      if (b.id === "bulldog" && x > 0 && z < 0 && y > L.bottom + 2 && rand() < 0.5) return PATCH;
      return y === L.top && Math.abs(x + 0.5) < 2 ? SHADE : COAT;
    });
    // Muscle: shoulders and haunches a cell wider than the barrel, a cream chest between the shoulders.
    if (b.muscle) for (const x of [x0 - 1, x1 + 1]) {
      v.fill(x, x, L.bottom + 2, L.top - 1, L.front - 4, L.front - 2, COAT);
      v.fill(x, x, L.bottom + 1, L.top - 1, L.back + 1, L.back + 3, (xx, y) => y === L.top - 1 ? SHADE : COAT);
    }
    // Head: a block a little above and ahead of the torso, eyes on its front face, cheeks cream.
    const hx0 = -(L.hw >> 1), hx1 = hx0 + L.hw - 1;
    v.fill(hx0, hx1, L.headBottom, L.headTop, L.headBack, L.headFront, (x, y, z) => {
      if (b.spots && rand() < 0.12) return PATCH;
      if (z === L.headFront && y === L.headTop - 2 && (x === hx0 + 1 || x === hx1 - 1)) return DARK;
      if (b.id === "dalmatian" && z === L.headFront && y === L.headTop - 1 && x === hx1 - 1) return PATCH;
      if (b.id === "bulldog" && y >= L.headTop - 3 && x === hx1 - 1 && z >= L.headFront - 1) return PATCH;
      if (b.blaze && z >= L.headFront - 1 && y > L.headBottom + 1 && Math.abs(x + 0.5) < 1) return CREAM;
      if (y <= L.headBottom + 1 && z >= L.headFront - 2) return CREAM;
      return COAT;
    });
    // Muzzle: cream, with the nose on top of its tip and a tongue under it; bulldog jowls hang to the sides.
    const [sw, sh, sl] = b.snout, sx0 = -(sw >> 1), sx1 = sx0 + sw - 1;
    v.fill(sx0, sx1, L.headBottom, L.headBottom + sh - 1, L.headFront + 1, L.headFront + sl, (x, y, z) =>
      z === L.headFront + sl && y === L.headBottom + sh - 1 && Math.abs(x + 0.5) < 1.5 ? DARK : CREAM);
    v.set(0, L.headBottom - 1, L.headFront + sl - 1, TONGUE);
    v.set(-1, L.headBottom - 1, L.headFront + sl - 1, TONGUE);
    if (b.jowls) for (const x of [sx0, sx1]) v.fill(x, x, L.headBottom - 1, L.headBottom, L.headFront + 1, L.headFront + sl, CREAM);
    // Ears.
    for (const side of [-1, 1]) {
      const ex = side < 0 ? hx0 : hx1;
      if (b.ears === "point" || b.ears === "tall") {
        const tall = b.ears === "tall" ? 4 : 3, inner = side < 0 ? ex + 1 : ex - 1;
        for (let k = 0; k < tall; k++) {
          v.set(ex, L.headTop + 1 + k, L.headBack + 2, COAT);
          if (k < tall - 1) v.set(inner, L.headTop + 1 + k, L.headBack + 2, k < tall - 2 ? COAT : SHADE);
          if (k < tall - 1) v.set(ex, L.headTop + 1 + k, L.headBack + 3, CREAM);
        }
      } else if (b.ears === "flop") {
        v.fill(ex + side, ex + side, L.headTop - 3, L.headTop, L.headBack + 2, L.headBack + 3, PATCH);
      } else if (b.ears === "drop") {
        // Long soft ears hanging flat against the cheeks, deeper and lower than a dalmatian's.
        v.fill(ex + side, ex + side, L.headTop - 4, L.headTop, L.headBack + 1, L.headBack + 3, PATCH);
      } else {
        v.set(ex, L.headTop + 1, L.headBack + 2, SHADE);
        v.set(ex - side, L.headTop + 1, L.headBack + 2, SHADE);
      }
    }
    return voxelGeometry(v, { unit: U, palette: b.ink, origin: { x: 0, y: 0, z: 0 } });
  };
  // A pile: a tall cartoon swirl of four tiers with a shine and a curl on top.
  const POOP_INK = ["#6b4423", "#4e3018", "#8a5a32", "#a8703e", "#f2efe8"];
  const poopPart = () => {
    const { makeVox, voxelGeometry } = BL.models;
    const v = makeVox(), lift = 2;
    const tiers = [[4.6, 0, 0], [3.7, 0.4, 0.2], [2.8, 0.7, -0.2], [1.8, 0.4, 0.3]];
    tiers.forEach(([r, ox, oz], tier) => {
      for (let y = tier * lift; y < tier * lift + lift; y++) {
        const rr = r - (y - tier * lift) * 0.35;
        for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
          if (Math.hypot(x + 0.5 - ox, z + 0.5 - oz) > rr) continue;
          v.set(x, y, z, z > 1 && x < 0 && y % 2 ? 3 : (y % 2 ? 2 : 0));
        }
      }
    });
    const peak = tiers.length * lift;
    v.set(0, peak, 0, 0); v.set(1, peak + 1, 0, 2); v.set(1, peak + 1, -1, 0);
    v.set(-2, peak - 2, 2, 4);
    // Flat on the ground, a pile casts no shadow worth its pass.
    return BL.models.noShadow(voxelGeometry(v, { unit: 0.032, palette: POOP_INK, origin: { x: 0, y: 0, z: 0 } }));
  };
  const flyGeometry = BL.models.cached(() => BL.models.noShadow(BL.models.merge(
    BL.models.box({ w: 0.028, h: 0.024, d: 0.036, color: "#1d1b1a" }),
    BL.models.box({ w: 0.05, h: 0.006, d: 0.022, color: "#dfe8f0", offset: { y: 0.016 } }))));

  // One instance: rotation Ry(yaw) Rx(pitch), uniformly scaled by s, at (x, y, z).
  const writeInstance = (data, o, yaw, pitch, s, x, y, z) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    data[o] = cy * s; data[o + 1] = 0; data[o + 2] = -sy * s; data[o + 3] = 0;
    data[o + 4] = sy * sp * s; data[o + 5] = cp * s; data[o + 6] = cy * sp * s; data[o + 7] = 0;
    data[o + 8] = sy * cp * s; data[o + 9] = -sp * s; data[o + 10] = cy * cp * s; data[o + 11] = 0;
    data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 15] = 1;
    data[o + 16] = 0; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
  };

  // `yard` is the rescue room's floor (`y`), the spots its puppies wait on (x, z, heading each), how far one wanders
  // and its `door`, where a puppy leaving for an Ooga that is not here walks out; `door` (outside) is the rescue's
  // doorstep in the Chora, where a stray adopted for such an Ooga goes. `ground(x, z, feet)` is the floor wherever the
  // visitor is. `strays` holds the strays' `homes` (x, y, z each, in the order they are taken), the `renderer` whose
  // tier sets how many roam and how far they are drawn, and `clearSegment(ax, az, bx, bz, y)`, whether a stray may walk
  // that line; `camera` is the scene's, whose distance and facing decide what is drawn and how often a stray thinks.
  // `total` is how many Oogas the goal counts, `onGoal` hears when its count or the scooping changes. `pile.eat()` takes
  // one banana.
  const create = ({ root, game, crew, pile, fx, hud, yard, door, ground, addTarget, removeTarget, pickGeometry, strays, camera, total, onGoal }) => {
    const { createNode, addChild, removeChild, updateWorld } = BL.scene;
    const rescue = game.state.rescue;
    const batch = (geometry, cap) => createNode({ geometry, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, visible: false, fixedInstanceCapacity: true });
    const bodies = BREEDS.map((b, i) => batch(geometryOf(i, "body"), DRAWN_CAP));
    const legs = BREEDS.map((b, i) => batch(geometryOf(i, "leg"), DRAWN_CAP * 4));
    const tails = BREEDS.map((b, i) => batch(geometryOf(i, "tail"), DRAWN_CAP));
    const poops = batch(geometryOf(0, "poop"), POOP_CAP), flies = batch(flyGeometry(), FLY_PILES * 2);
    const batches = [...bodies, ...legs, ...tails, poops, flies];
    for (const node of batches) addChild(root, node);
    const layouts = BREEDS.map(layoutOf);
    const DUST = [BL.models.particleGeometry("#8a5a32", 0.06, 0), BL.models.particleGeometry("#c9b28a", 0.05, 0)];
    const HEARTS = [BL.models.particleGeometry("#ff6b8a", 0.07, 0.8), BL.models.particleGeometry("#ffd0dc", 0.05, 0.8)];
    const STINK = [BL.models.particleGeometry("#9ccc4a", 0.07, 0.4), BL.models.particleGeometry("#6d8a3a", 0.06, 0.2)];
    const state = new Uint8Array(DOG_CAP), breedOf = new Uint8Array(DOG_CAP), space = new Uint8Array(DOG_CAP);
    const px = new Float32Array(DOG_CAP), py = new Float32Array(DOG_CAP), pz = new Float32Array(DOG_CAP);
    const yaw = new Float32Array(DOG_CAP), speed = new Float32Array(DOG_CAP), phase = new Float32Array(DOG_CAP);
    const timer = new Float32Array(DOG_CAP), poopTimer = new Float32Array(DOG_CAP), starve = new Float32Array(DOG_CAP);
    const grow = new Float32Array(DOG_CAP), side = new Float32Array(DOG_CAP), wagT = new Float32Array(DOG_CAP);
    const goalX = new Float32Array(DOG_CAP), goalZ = new Float32Array(DOG_CAP), spotOf = new Int16Array(DOG_CAP).fill(-1);
    const owners = new Array(DOG_CAP).fill(null), entries = new Array(DOG_CAP).fill(null);
    const spotCount = yard.spots.length / 3, restock = new Float32Array(spotCount).fill(-1);
    const poopAt = new Float32Array(POOP_CAP * 3), flyPhase = new Float32Array(POOP_CAP);
    const mood = new Uint8Array(DOG_CAP), homeOf = new Int16Array(DOG_CAP).fill(-1), look = new Float32Array(DOG_CAP), tagged = new Array(DOG_CAP).fill(null);
    // The time a far stray has missed since it last thought, and whether each dog was drawn this frame.
    const lag = new Float32Array(DOG_CAP), drawnAt = new Uint8Array(DOG_CAP);
    // The homes, and the stray at each (-1 while free).
    const homes = strays.homes, homeCount = homes.length / 3, homeDog = new Int16Array(homeCount).fill(-1);
    const flyOf = new Int16Array(FLY_PILES);
    let poopCount = 0, saveTimer = 0, stepCooldown = 0, version = 0, held = false, here = CHORA, frame = 0;
    let strayCount = 0, strayDue = STRAY_RESPAWN, strayBorn = 0, homeNext = 0;
    let drawnCount = 0, picksShown = 0, poopsDrawn = 0, flyCount = 0, redraw = true, poopX = 0, poopY = 0, poopZ = 0;
    const cursor = new Int32Array(BREEDS.length);
    // Pick targets, made once a visit: one for each dog drawn, handed to whichever dog is drawn in its turn each frame,
    // and one a poop, each shown only while in use and in view.
    const dogPicks = [], pickOwners = [], poopPicks = [];
    for (let k = 0; k < DRAWN_CAP; k++) {
      const node = createNode({ geometry: pickGeometry, visible: false }), owner = { kind: "dog", dog: -1, weaponType: "none" };
      addTarget(node, owner, { radius: 0.36 });
      dogPicks.push(node);
      pickOwners.push(owner);
    }
    for (let i = 0; i < POOP_CAP; i++) {
      const node = createNode({ geometry: pickGeometry, visible: false });
      addTarget(node, { kind: "poop", poop: i, weaponType: "none" }, { radius: 0.22 });
      poopPicks.push(node);
    }
    const floorOf = (i, feet) => {
      const y = space[i] === YARD ? yard.y : ground(px[i], pz[i], feet);
      return y > -100 ? y : feet;
    };
    const place = (i, x, z, heading, feet) => {
      px[i] = x; pz[i] = z; yaw[i] = heading; speed[i] = 0; py[i] = feet;
      py[i] = floorOf(i, feet);
    };
    const freeSlot = () => {
      for (let i = 0; i < DOG_CAP; i++) if (state[i] === FREE) return i;
      return -1;
    };
    const spot = (k, axis) => yard.spots[k * 3 + axis];
    // A waiting puppy of the spot's breed (spot k waits a breed k % BREEDS.length), popping in as it grows.
    const stock = (k) => {
      const i = freeSlot();
      if (i < 0) return -1;
      state[i] = KENNEL; space[i] = YARD; breedOf[i] = k % BREEDS.length; spotOf[i] = k; grow[i] = 0; owners[i] = entries[i] = null;
      place(i, spot(k, 0), spot(k, 1), spot(k, 2), yard.y);
      goalX[i] = px[i]; goalZ[i] = pz[i]; timer[i] = 1 + Math.random() * 3; side[i] = 0;
      return i;
    };
    // A dog with its Ooga is out while that Ooga is shown (a released Ooga is hidden, and its dog with it).
    const awake = (cave) => cave.root.visible;
    // A stray taken in or sent off frees its home.
    const unstray = (i) => {
      if (state[i] === STRAY) { strayCount--; homeDog[homeOf[i]] = -1; }
      homeOf[i] = -1; tagged[i] = null;
    };
    const adoptInto = (i, cave, entry) => {
      unstray(i);
      state[i] = FOLLOW; space[i] = WITH; owners[i] = cave; entries[i] = entry; spotOf[i] = -1;
      breedOf[i] = entry.breed; side[i] = fnv1a(entry.owner) & 1 ? 0.55 : -0.55;
      poopTimer[i] = POOP_MIN * 0.5 + Math.random() * POOP_SPAN; starve[i] = 0; grow[i] = 1;
    };
    // The visit's dogs: the saved adoption of the Ooga walking DSB at its side, then a puppy on each yard spot.
    for (const entry of rescue.dogs) {
      const cave = crew.cavemen.get(entry.owner);
      const i = cave ? freeSlot() : -1;
      if (i < 0) continue;
      adoptInto(i, cave, entry);
      const p = cave.root.position, h = cave.root.rotation.y;
      place(i, p.x - Math.sin(h) * 0.9 + Math.cos(h) * side[i], p.z - Math.cos(h) * 0.9 - Math.sin(h) * side[i], h, p.y - cave.baseY);
    }
    for (let k = 0; k < spotCount; k++) {
      const i = stock(k);
      if (i >= 0) grow[i] = 1;
    }
    // A stray at the next free home in turn, of the next breed in turn, so every breed roams; a newcomer pops in as it
    // grows. Their first poops fall due anywhen in a stray's interval, so the island's piles start at once.
    const strayIn = (grown) => {
      const i = freeSlot();
      if (i < 0 || !homeCount) return -1;
      for (let n = 0; n < homeCount && homeDog[homeNext] >= 0; n++) homeNext = (homeNext + 1) % homeCount;
      const h = homeNext;
      homeNext = (homeNext + 1) % homeCount;
      state[i] = STRAY; space[i] = CHORA; mood[i] = REST; homeOf[i] = h; homeDog[h] = i; breedOf[i] = strayBorn++ % BREEDS.length; tagged[i] = null;
      owners[i] = entries[i] = null; spotOf[i] = -1; grow[i] = grown ? 1 : 0; wagT[i] = 0; lag[i] = 0;
      place(i, homes[h * 3], homes[h * 3 + 2], (h * 2.39996) % 6.28, homes[h * 3 + 1]);
      side[i] = h & 1 ? 0.6 : -0.6; timer[i] = 1 + Math.random() * 3; look[i] = Math.random() * 3;
      poopTimer[i] = Math.random() * (STRAY_POOP_MIN + STRAY_POOP_SPAN);
      strayCount++;
      return i;
    };
    const strayWanted = () => Math.min(homeCount, STRAY_TIER[strays.renderer.quality]);
    for (let n = strayWanted(); strayCount < n && strayIn(true) >= 0;);
    poopCount = Math.min(POOP_CAP, rescue.poops.length / 3);
    for (let k = 0; k < poopCount * 3; k++) poopAt[k] = rescue.poops[k];
    for (let k = 0; k < POOP_CAP; k++) flyPhase[k] = Math.random() * 6.28;
    version++;
    // Every pile's pick at its pile once the ring has changed; `updateWorld` skips a hidden node, so each is placed
    // shown and `drawPoops` then shows only those in view.
    const placePoops = () => {
      for (let k = 0; k < poopCount; k++) {
        const node = poopPicks[k];
        node.position.x = poopAt[k * 3]; node.position.y = poopAt[k * 3 + 1] + 0.08; node.position.z = poopAt[k * 3 + 2];
        node.visible = true;
        updateWorld(node);
      }
      for (let k = poopCount; k < POOP_CAP; k++) poopPicks[k].visible = false;
    };
    // The piles within `reach` of the camera, at most `cap`, out in the Chora only, with their picks, and the nearest few
    // the flies circle; redone when the ring changes, the visitor changes space or the camera has moved a couple of metres.
    const drawPoops = (reach, cap) => {
      const data = poops.instanceData, cam = camera.position, near2 = FLY_NEAR * FLY_NEAR;
      let n = 0;
      flyCount = 0;
      for (let k = 0; k < poopCount; k++) {
        const x = poopAt[k * 3], y = poopAt[k * 3 + 1], z = poopAt[k * 3 + 2], dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, d2 = dx * dx + dy * dy + dz * dz;
        const seen = here === CHORA && d2 < reach * reach && n < cap;
        poopPicks[k].visible = seen;
        if (!seen) continue;
        writeInstance(data, n++ * 20, (Math.round(x * 50) * 7 + Math.round(z * 50) * 3) % 7, 0, 1, x, y, z);
        if (d2 < near2 && flyCount < FLY_PILES) flyOf[flyCount++] = k;
      }
      poops.instanceCount = poopsDrawn = n;
      poops.instanceVersion++;
      poops.visible = n > 0;
      flies.instanceCount = flyCount * 2;
      flies.visible = flyCount > 0;
      poopX = cam.x; poopY = cam.y; poopZ = cam.z;
    };
    const dropPoop = (x, y, z) => {
      game.dropPoop(x, y, z);
      if (poopCount === POOP_CAP) poopAt.copyWithin(0, 3);
      else poopCount++;
      poopAt[poopCount * 3 - 3] = x; poopAt[poopCount * 3 - 2] = y; poopAt[poopCount * 3 - 1] = z;
      version++;
    };
    const scoop = (k) => {
      if (k >= poopCount) return false;
      const x = poopAt[k * 3], y = poopAt[k * 3 + 1], z = poopAt[k * 3 + 2];
      poopAt.copyWithin(k * 3, k * 3 + 3, poopCount * 3);
      poopCount--;
      game.scoopPoop(k);
      fx.burst(x, y + 0.1, z, 8, DUST, 1.4);
      hud.toast(`Scooped! · ${rescue.scooped} poop${rescue.scooped === 1 ? "" : "s"} cleaned up`);
      onGoal();
      version++;
      return true;
    };
    // Feeding takes one banana from the shared pile; a full dog only wags.
    const feed = (i) => {
      if (!entries[i] || !owners[i]) return false;
      const e = entries[i];
      if (e.hunger < 0.15) {
        wagT[i] = 2;
        hud.toast(`${e.name} is full. Woof!`);
        return false;
      }
      if (!pile.eat()) {
        hud.toast("The banana pile is empty. Feed the Ooga Boogas first!");
        return false;
      }
      game.feedDog(e.owner);
      starve[i] = 0;
      state[i] = EAT; timer[i] = EAT_SECONDS; wagT[i] = EAT_SECONDS + 2;
      fx.burst(px[i], py[i] + 0.45, pz[i], 7, HEARTS, 1.1);
      hud.toast(`${e.name} ate a banana · thank you!`);
      return true;
    };
    // The visitor's own dog, fed from the yard's bowl.
    const feedOwn = () => {
      for (let i = 0; i < DOG_CAP; i++) if (owners[i] && owners[i] === crew.player) return feed(i);
      hud.toast("Adopt a puppy first, then feed it here.");
      return false;
    };
    // A waiting puppy or a stray answers with its breed, for the adoption dialog; an adopted dog is fed.
    const tap = (i) => {
      if (state[i] === KENNEL || state[i] === STRAY) return breedOf[i];
      if (owners[i]) feed(i);
      return -1;
    };
    // Adopts a dog of `breed` for the Ooga named `owner`: null if that Ooga already has one. `stray` is the stray the
    // adoption was opened on, taken in while it is still out there and of the breed chosen; otherwise a waiting puppy
    // of the breed. The Ooga walking DSB gets it at its side; one for an Ooga that is not here trots out of the door.
    const adopt = (owner, breed, name, stray = -1) => {
      const cave = crew.cavemen.get(owner) || null;
      const entry = game.adoptDog(owner, name, breed);
      if (!entry) return null;
      let i = stray >= 0 && state[stray] === STRAY && breedOf[stray] === breed ? stray : -1;
      if (i < 0) for (let k = 0; k < DOG_CAP; k++) if (state[k] === KENNEL && breedOf[k] === breed) { i = k; break; }
      if (i >= 0 && spotOf[i] >= 0) restock[spotOf[i]] = RESTOCK_SECONDS;
      if (i < 0) {
        i = freeSlot();
        if (i < 0) return entry;
        space[i] = YARD;
        place(i, yard.x, yard.z, 0, yard.y);
      }
      if (cave) adoptInto(i, cave, entry);
      else {
        unstray(i);
        state[i] = OUT; entries[i] = entry; owners[i] = null; spotOf[i] = -1; breedOf[i] = entry.breed;
        goalX[i] = space[i] === YARD ? yard.door[0] : door[0]; goalZ[i] = space[i] === YARD ? yard.door[1] : door[1];
      }
      grow[i] = 1;
      fx.burst(px[i], py[i] + 0.5, pz[i], 10, HEARTS, 1.6);
      onGoal();
      return entry;
    };
    // The dog goes back to the rescue: to a free spot in the yard when it is there, else out by the door.
    const giveUp = (i) => {
      game.releaseDog(entries[i].owner);
      hud.toast(`${entries[i].name} was hungry too long and went back to Free Puppies Rescue.`);
      owners[i] = entries[i] = null;
      state[i] = HOME;
      space[i] = here === CHORA ? CHORA : YARD;
      if (here === ROOM) state[i] = FREE;
      goalX[i] = here === CHORA ? door[0] : yard.x; goalZ[i] = here === CHORA ? door[1] : yard.z;
      onGoal();
    };
    const have = () => rescue.dogs.length;
    const hasDog = (owner) => rescue.dogs.some((d) => d.owner === owner);
    // Steers slot i toward (tx, tz) at up to `top` m/s; true once it stands there. Further off than `jump` it is there
    // at once. A step never overshoots, so a far stray's long step still lands.
    const steer = (i, tx, tz, top, dt, feet, jump = TELEPORT) => {
      const dx = tx - px[i], dz = tz - pz[i], d = Math.sqrt(dx * dx + dz * dz);
      if (d > jump) {
        px[i] = tx; pz[i] = tz; speed[i] = 0; py[i] = floorOf(i, feet);
        return true;
      }
      const want = d < 0.12 ? 0 : Math.min(top, (d - 0.08) * 2.6);
      speed[i] += (want - speed[i]) * Math.min(1, dt * 6);
      if (d > 0.12) {
        let turn = Math.atan2(dx, dz) - yaw[i];
        turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
        yaw[i] += turn * Math.min(1, dt * 7);
      }
      if (speed[i] > 0.01) {
        const go = Math.min(speed[i] * dt, d);
        px[i] += Math.sin(yaw[i]) * go;
        pz[i] += Math.cos(yaw[i]) * go;
        py[i] = floorOf(i, feet);
        phase[i] += speed[i] * dt * 11;
      }
      return d < 0.25;
    };
    const face = (i, heading, dt) => {
      let turn = heading - yaw[i];
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      yaw[i] += turn * Math.min(1, dt * 3);
    };
    // The Ooga walking the Chora when it passes near enough to stray i and on its level; null otherwise.
    const passerBy = (i) => {
      const cave = crew.player;
      if (here !== CHORA || !cave || !awake(cave)) return null;
      const p = cave.root.position, dx = p.x - px[i], dz = p.z - pz[i];
      return dx * dx + dz * dz < STRAY_NEAR * STRAY_NEAR && Math.abs(p.y - cave.baseY - py[i]) < 1 ? cave : null;
    };
    // A stray's next thing: a walk along a clear line to a spot near home on its own level, else a sniff where it stands.
    const strayNext = (i) => {
      const h = homeOf[i], hy = homes[h * 3 + 1], a = Math.random() * 6.28, r = 1 + Math.random() * (STRAY_ROAM - 1);
      const gx = homes[h * 3] + Math.cos(a) * r, gz = homes[h * 3 + 2] + Math.sin(a) * r, gy = ground(gx, gz, hy);
      if (Math.abs(gy - hy) < 0.8 && strays.clearSegment(px[i], pz[i], gx, gz, py[i])) { mood[i] = ROAM; goalX[i] = gx; goalZ[i] = gz; }
      else { mood[i] = SNIFF; timer[i] = 1.5 + Math.random() * 2; }
    };
    const roam = (i, dt, night) => {
      const h = homeOf[i], hx = homes[h * 3], hy = homes[h * 3 + 1], hz = homes[h * 3 + 2], m = mood[i];
      if (m === PLOP) {
        speed[i] = 0;
        if ((timer[i] -= dt) > 0) return;
        const back = layouts[breedOf[i]].tl * U * 0.55;
        dropPoop(px[i] - Math.sin(yaw[i]) * back, py[i], pz[i] - Math.cos(yaw[i]) * back);
        mood[i] = SNIFF; timer[i] = 1.5;
        poopTimer[i] = STRAY_POOP_MIN + Math.random() * STRAY_POOP_SPAN;
        return;
      }
      // By night it goes home and sleeps there, curled up in the lane; it wakes with the day.
      if (night) {
        if (m !== DOZE) { mood[i] = DOZE; tagged[i] = null; }
        if (steer(i, hx, hz, WALK * 0.6, dt, hy, Infinity)) speed[i] = 0;
        return;
      }
      if (m === DOZE) { mood[i] = REST; timer[i] = 1 + Math.random() * 2; }
      if (m === TAG) {
        const cave = tagged[i], p = cave.root.position;
        if ((timer[i] -= dt) > 0 && here === CHORA && awake(cave) && Math.hypot(px[i] - hx, pz[i] - hz) < STRAY_LEASH) {
          const head = cave.root.rotation.y, sh = Math.sin(head), ch = Math.cos(head);
          if (steer(i, p.x + ch * side[i] - sh * 0.2, p.z - sh * side[i] - ch * 0.2, RUN, dt, p.y - cave.baseY, Infinity) && speed[i] < 0.2) face(i, head, dt);
          return;
        }
        // Done with it: back home.
        tagged[i] = null; mood[i] = ROAM; goalX[i] = hx; goalZ[i] = hz;
      }
      if ((poopTimer[i] -= dt) <= 0 && speed[i] < 0.6) {
        mood[i] = PLOP; timer[i] = SQUAT_SECONDS;
        return;
      }
      if (mood[i] === ROAM) {
        if (steer(i, goalX[i], goalZ[i], WALK * 0.6, dt, hy, Infinity)) { mood[i] = Math.random() < 0.55 ? SNIFF : REST; timer[i] = 2 + Math.random() * 4; }
      } else {
        speed[i] *= Math.max(0, 1 - dt * 6);
        if ((timer[i] -= dt) <= 0) strayNext(i);
      }
      // The Ooga passing by now and then takes it along for a stretch.
      if ((look[i] -= dt) > 0) return;
      look[i] = 2 + Math.random() * 2;
      const cave = Math.random() < 0.35 ? passerBy(i) : null;
      if (!cave) return;
      mood[i] = TAG; tagged[i] = cave; timer[i] = 6 + Math.random() * 6; wagT[i] = 2;
    };
    const think = (i, dt, night) => {
      const s = state[i], cave = owners[i], e = entries[i];
      if (grow[i] < 1) grow[i] = Math.min(1, grow[i] + dt * 2.5);
      if (wagT[i] > 0) wagT[i] -= dt;
      if (s === KENNEL) {
        const k = spotOf[i];
        if ((timer[i] -= dt) <= 0) {
          timer[i] = 2 + Math.random() * 4;
          const a = Math.random() * 6.28, r = Math.random() * yard.wander;
          goalX[i] = spot(k, 0) + Math.cos(a) * r; goalZ[i] = spot(k, 1) + Math.sin(a) * r;
        }
        steer(i, goalX[i], goalZ[i], 0.9, dt, yard.y);
        return;
      }
      if (s === STRAY) {
        roam(i, dt, night);
        return;
      }
      if (s === OUT) {
        if (steer(i, goalX[i], goalZ[i], RUN, dt, py[i], Infinity)) { state[i] = FREE; entries[i] = null; }
        return;
      }
      if (s === HOME) {
        if (steer(i, goalX[i], goalZ[i], WALK, dt, py[i])) {
          if (space[i] === YARD) for (let k = 0; k < spotCount; k++) {
            let taken = false;
            for (let j = 0; j < DOG_CAP; j++) if (state[j] === KENNEL && spotOf[j] === k) { taken = true; break; }
            if (taken || restock[k] >= 0) continue;
            state[i] = KENNEL; spotOf[i] = k; timer[i] = 0;
            return;
          }
          state[i] = FREE;
        }
        return;
      }
      if (!awake(cave)) {
        state[i] = NAP; speed[i] = 0;
        return;
      }
      const p = cave.root.position, feet = p.y - cave.baseY;
      if (s === NAP) state[i] = FOLLOW;
      e.hunger = hungerAfter(e.hunger, dt);
      if (e.hunger >= 1) {
        if ((starve[i] += dt) >= STARVE_SECONDS) { giveUp(i); return; }
      }
      if (state[i] === EAT) {
        speed[i] = 0;
        if ((timer[i] -= dt) <= 0) state[i] = FOLLOW;
        return;
      }
      if (state[i] === SQUAT) {
        speed[i] = 0;
        if ((timer[i] -= dt) <= 0) {
          const back = layouts[breedOf[i]].tl * U * 0.55;
          if (here === CHORA) dropPoop(px[i] - Math.sin(yaw[i]) * back, py[i], pz[i] - Math.cos(yaw[i]) * back);
          state[i] = FOLLOW;
          poopTimer[i] = POOP_MIN + Math.random() * POOP_SPAN;
        }
        return;
      }
      if (e.hunger >= HUNGRY) {
        if (state[i] !== SIT) { state[i] = SIT; timer[i] = 0; }
        speed[i] *= Math.max(0, 1 - dt * 8);
        // Left behind (its Ooga went through a door), it still turns up at its side, hungry.
        if (Math.hypot(p.x - px[i], p.z - pz[i]) > TELEPORT) steer(i, p.x, p.z, RUN, dt, feet);
        if ((timer[i] -= dt) <= 0) {
          timer[i] = 9 + Math.random() * 6;
          fx.sayAt(px[i], py[i] + 0.7, pz[i], `${e.name}: whine... banana?`, 2.2);
        }
        return;
      }
      state[i] = FOLLOW;
      const h = cave.root.rotation.y, sh = Math.sin(h), ch = Math.cos(h);
      const tx = p.x - sh * 0.95 + ch * side[i], tz = p.z - ch * 0.95 - sh * side[i];
      if (steer(i, tx, tz, RUN, dt, feet) && speed[i] < 0.2) face(i, h, dt);
      // It poops only out in the Chora, never in a room.
      if (here === CHORA && (poopTimer[i] -= dt) <= 0 && speed[i] < 0.6) {
        state[i] = SQUAT; timer[i] = SQUAT_SECONDS;
      }
    };
    // Whether dog i is in the visitor's space and drawn this frame.
    const shown = (i) => state[i] !== FREE && state[i] !== NAP && (space[i] === WITH || space[i] === here);
    // Legs swing in diagonal pairs while walking; sitting folds the hind legs, napping lays all four flat.
    const draw = (i, elapsed) => {
      const b = breedOf[i], L = layouts[b], s = (spotOf[i] >= 0 || state[i] === HOME ? 0.88 : state[i] === STRAY ? 0.94 : 1) * (0.2 + 0.8 * grow[i]);
      const st = state[i] === STRAY ? MOOD_POSE[mood[i]] : state[i], hunger = entries[i] ? entries[i].hunger : 0;
      let pitch = 0, lift = 0, front = 0, hind = 0;
      const walk = Math.min(1, speed[i] / 1.4), swing = Math.sin(phase[i]) * 0.65 * walk;
      let y = py[i] + Math.abs(Math.cos(phase[i])) * 0.018 * walk;
      if (st === SIT) { pitch = -0.42; front = 0.42; hind = -1.25; y += L.leg * U * 0.1; }
      else if (st === NAP && speed[i] < 0.05) { lift = -L.leg * U * 0.92; front = -1.5; hind = 1.5; }
      else if (st === EAT) { pitch = 0.32 + Math.sin(elapsed * 14) * 0.05; front = -0.32; hind = -0.32; }
      else if (st === SQUAT) { pitch = -0.22; front = 0.22; hind = -0.75; lift = -0.035; }
      else if (st === KENNEL && speed[i] < 0.05 && (i & 1)) { pitch = -0.42; front = 0.42; hind = -1.25; y += L.leg * U * 0.1; }
      y += lift * s;
      const cy = Math.cos(yaw[i]), sy = Math.sin(yaw[i]), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const hipY = L.bottom * U, x0 = px[i], z0 = pz[i], c = cursor[b];
      writeInstance(bodies[b].instanceData, c * 20, yaw[i], pitch, s, x0, y, z0);
      const legData = legs[b].instanceData, lx = ((L.tw >> 1) - 1) * U;
      for (let k = 0; k < 4; k++) {
        const fore = k < 2, hx = k & 1 ? lx : -lx + U, hz = (fore ? L.front - 1.5 : L.back + 1.5) * U;
        const legPitch = pitch + (fore ? front : hind) + ((k === 0 || k === 3) ? swing : -swing);
        const wx = x0 + s * (cy * hx + sy * sp * hipY + sy * cp * hz);
        const wy = y + s * (cp * hipY - sp * hz);
        const wz = z0 + s * (-sy * hx + cy * sp * hipY + cy * cp * hz);
        writeInstance(legData, (c * 4 + k) * 20, yaw[i], legPitch, s, wx, wy, wz);
      }
      const happy = wagT[i] > 0 || st === KENNEL || st === EAT;
      const droop = st === NAP ? -0.9 : hunger >= HUNGRY ? -0.7 : 0;
      const wag = Math.sin(elapsed * (happy ? 16 : 7) + i) * (st === NAP ? 0.05 : happy ? 0.55 : 0.25);
      const ty = (L.top - 0.5) * U, tz = (L.back - 0.5) * U;
      writeInstance(tails[b].instanceData, c * 20, yaw[i] + wag, pitch + droop, s,
        x0 + s * (sy * sp * ty + sy * cp * tz), y + s * (cp * ty - sp * tz), z0 + s * (cy * sp * ty + cy * cp * tz));
      cursor[b] = c + 1;
      const pick = dogPicks[drawnCount];
      pickOwners[drawnCount++].dog = i;
      pick.position.x = x0; pick.position.y = y + 0.3 * s; pick.position.z = z0;
      pick.visible = true;
      updateWorld(pick);
    };
    // `day` is DSB's daylight, 1 at noon: the strays sleep while it is low. `space` is where the visitor stands: CHORA,
    // YARD or ROOM.
    const update = (dt, elapsed, day, at) => {
      if (at !== here) { here = at; redraw = true; }
      for (let k = 0; k < spotCount; k++) if (restock[k] >= 0 && (restock[k] -= dt) < 0) stock(k);
      // The strays settle on the tier's number: one newcomer every STRAY_RESPAWN seconds while short, the extra ones
      // gone at once when the tier drops.
      const wanted = strayWanted();
      if (strayCount >= wanted) strayDue = STRAY_RESPAWN;
      else if ((strayDue -= dt) <= 0) {
        strayIn(false);
        strayDue = STRAY_RESPAWN;
      }
      for (let i = DOG_CAP - 1; i >= 0 && strayCount > wanted; i--) if (state[i] === STRAY) {
        unstray(i);
        state[i] = FREE;
      }
      const night = day < 0.2, quality = strays.renderer.quality, reach = DRAW[quality], cap = DRAWN[quality], think2 = (reach + THINK_NEAR) * (reach + THINK_NEAR);
      // The camera's facing, for the cone a dog must stand in to be drawn.
      const cam = camera.position, tx = camera.target.x - cam.x, ty = camera.target.y - cam.y, tz = camera.target.z - cam.z, tl = Math.hypot(tx, ty, tz) || 1;
      const fx = tx / tl, fy = ty / tl, fz = tz / tl;
      frame++;
      cursor.fill(0);
      drawnCount = 0;
      let straysDrawn = 0;
      for (let i = 0; i < DOG_CAP; i++) {
        drawnAt[i] = 0;
        if (state[i] === FREE || space[i] !== WITH && space[i] !== here) continue;
        const dx = px[i] - cam.x, dy = py[i] - cam.y, dz = pz[i] - cam.z, d2 = dx * dx + dy * dy + dz * dz;
        // A stray far from the camera thinks one frame in FAR_SLICES, with the time it missed.
        if (!held) {
          if (state[i] !== STRAY || d2 < think2) { think(i, dt, night); lag[i] = 0; }
          else if ((i + frame) % FAR_SLICES) lag[i] += dt;
          else { think(i, lag[i] + dt, night); lag[i] = 0; }
        }
        if (!shown(i) || d2 > reach * reach || dx * fx + dy * fy + dz * fz < VIEW_CONE * Math.sqrt(d2) - 1.5) continue;
        if (state[i] === STRAY && straysDrawn++ >= cap) continue;
        drawnAt[i] = 1;
        draw(i, elapsed);
      }
      for (let k = drawnCount; k < picksShown; k++) dogPicks[k].visible = false;
      picksShown = drawnCount;
      for (let b = 0; b < BREEDS.length; b++) {
        const n = cursor[b];
        bodies[b].instanceCount = tails[b].instanceCount = n;
        legs[b].instanceCount = n * 4;
        bodies[b].visible = legs[b].visible = tails[b].visible = n > 0;
        if (!n) continue;
        bodies[b].instanceVersion++;
        legs[b].instanceVersion++;
        tails[b].instanceVersion++;
      }
      if (version) placePoops();
      const mx = cam.x - poopX, my = cam.y - poopY, mz = cam.z - poopZ;
      if (version || redraw || mx * mx + my * my + mz * mz > 4) drawPoops(POOP_DRAW[quality], POOPS_DRAWN[quality]);
      version = 0; redraw = false;
      if (here !== CHORA) return autosave(dt);
      const flyData = flies.instanceData;
      for (let n = 0; n < flyCount; n++) for (let f = 0; f < 2; f++) {
        const k = flyOf[n], t = elapsed * (2.4 + f * 1.3) + flyPhase[k] + f * 3.1, r = 0.14 + f * 0.06;
        writeInstance(flyData, (n * 2 + f) * 20, -t * (f ? 1 : -1), 0, 1, poopAt[k * 3] + Math.cos(t) * r, poopAt[k * 3 + 1] + 0.2 + Math.sin(t * 2.3) * 0.05 + f * 0.06, poopAt[k * 3 + 2] + Math.sin(t) * r);
      }
      if (flyCount) flies.instanceVersion++;
      // The driven Ooga stepping in a pile: a green puff and a word, now and then.
      const player = crew.player;
      if ((stepCooldown -= dt) <= 0 && player && poopCount) {
        const p = player.root.position;
        for (let k = 0; k < poopCount; k++) {
          const dx = p.x - poopAt[k * 3], dz = p.z - poopAt[k * 3 + 2];
          if (dx * dx + dz * dz > 0.09 || Math.abs(p.y - player.baseY - poopAt[k * 3 + 1]) > 0.4) continue;
          fx.burst(poopAt[k * 3], poopAt[k * 3 + 1] + 0.15, poopAt[k * 3 + 2], 6, STINK, 0.7);
          fx.say(player, "Ooga step in poop. Ew!", 2);
          stepCooldown = 8;
          break;
        }
      }
      autosave(dt);
    };
    const autosave = (dt) => {
      if ((saveTimer += dt) < SAVE_EVERY) return;
      saveTimer = 0;
      game.saveRescue();
    };
    // A hungry dog's sign over its head: a small dark bubble with a red "!" beside an empty bowl.
    const drawOverlay = (ctx, project) => {
      for (let i = 0; i < DOG_CAP; i++) {
        if (state[i] !== SIT || !drawnAt[i]) continue;
        const L = layouts[breedOf[i]], pos = project(px[i], py[i] + (L.headTop + 4) * U, pz[i]);
        if (!pos) continue;
        const x = Math.round(pos.x / 3) * 3 - 18, y = Math.round(pos.y / 3) * 3 - 30;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#121212";
        ctx.fillRect(x + 3, y, 30, 24);
        ctx.fillRect(x, y + 3, 36, 18);
        ctx.fillStyle = "#d8892b";
        ctx.fillRect(x + 3, y - 3, 30, 3); ctx.fillRect(x + 3, y + 24, 30, 3);
        ctx.fillRect(x - 3, y + 3, 3, 18); ctx.fillRect(x + 36, y + 3, 3, 18);
        ctx.fillRect(x + 12, y + 27, 9, 3); ctx.fillRect(x + 15, y + 30, 3, 3);
        ctx.fillStyle = "#ff4b3a";
        ctx.fillRect(x + 6, y + 3, 6, 12); ctx.fillRect(x + 6, y + 18, 6, 3);
        ctx.fillStyle = "#c9ced6";
        ctx.fillRect(x + 15, y + 12, 18, 3); ctx.fillRect(x + 18, y + 15, 12, 3); ctx.fillRect(x + 15, y + 9, 3, 3); ctx.fillRect(x + 30, y + 9, 3, 3);
        ctx.globalAlpha = 1;
      }
    };
    const dispose = () => {
      game.saveRescue();
      for (const node of batches) removeChild(root, node);
      for (const node of dogPicks) removeTarget(node);
      for (const node of poopPicks) removeTarget(node);
      state.fill(FREE);
      owners.fill(null);
      entries.fill(null);
      tagged.fill(null);
      homeDog.fill(-1);
      strayCount = 0;
      dogPicks.length = pickOwners.length = poopPicks.length = 0;
      poopCount = 0;
    };
    const stats = () => {
      let dogs = 0, waiting = 0, hungry = 0, roaming = 0;
      for (let i = 0; i < DOG_CAP; i++) {
        if (state[i] === FREE) continue;
        dogs++;
        if (state[i] === KENNEL) waiting++;
        if (state[i] === STRAY) roaming++;
        if (state[i] === SIT) hungry++;
      }
      return { dogs, dogsWaiting: waiting, dogsHungry: hungry, dogsDrawn: drawnCount, strays: roaming, poops: poopCount, poopsDrawn: here === CHORA ? poopsDrawn : 0, flies: here === CHORA ? flies.instanceCount : 0 };
    };
    // Debug: the slot of an Ooga's dog, and its state's name.
    const slotOf = (owner) => {
      for (let i = 0; i < DOG_CAP; i++) if (entries[i] && entries[i].owner === owner) return i;
      return -1;
    };
    const debug = {
      stats, adopt: (owner, breed = breedFor(owner), name = "Rex", stray = -1) => adopt(owner, breed, name, stray),
      hunger(owner, value) {
        const i = slotOf(owner);
        if (i < 0) return false;
        entries[i].hunger = Math.max(0, Math.min(1, value));
        return true;
      },
      // Has the Ooga's dog squat at once (out in the Chora it poops), as its own timer would.
      poop(owner) {
        const i = slotOf(owner);
        if (i < 0 || !owners[i]) return false;
        state[i] = SQUAT; timer[i] = 0.01;
        return true;
      },
      state: (owner) => STATE_NAMES[state[slotOf(owner)]] || null,
      dog(owner) {
        const i = slotOf(owner);
        return i < 0 ? null : { slot: i, x: px[i], y: py[i], z: pz[i], yaw: yaw[i], state: STATE_NAMES[state[i]], hunger: entries[i].hunger, breed: BREEDS[breedOf[i]].id, name: entries[i].name, shown: !!drawnAt[i] };
      },
      // The strays out now: slot, breed, what each is up to, where, its home, and whether it was drawn this frame.
      strays() {
        const out = [];
        for (let i = 0; i < DOG_CAP; i++) if (state[i] === STRAY) {
          const h = homeOf[i];
          out.push({ slot: i, breed: BREEDS[breedOf[i]].id, mood: MOOD_NAMES[mood[i]], with: tagged[i] ? tagged[i].traits.name : null, x: px[i], y: py[i], z: pz[i], home: [homes[h * 3], homes[h * 3 + 1], homes[h * 3 + 2]], shown: !!drawnAt[i] });
        }
        return out;
      },
      // Has stray `slot` squat at its next chance, as its own timer would.
      strayPoop(slot) {
        if (state[slot] !== STRAY) return false;
        poopTimer[slot] = 0;
        return true;
      },
      // Sends stray `slot` along with the driven Ooga at once, as a passer-by would take it.
      tag(slot) {
        if (state[slot] !== STRAY || !crew.player) return false;
        mood[slot] = TAG; tagged[slot] = crew.player; timer[slot] = 8; wagT[slot] = 2;
        return true;
      },
      waiting() {
        const out = [];
        for (let i = 0; i < DOG_CAP; i++) if (state[i] === KENNEL) out.push({ slot: i, breed: BREEDS[breedOf[i]].id, x: px[i], y: py[i], z: pz[i] });
        return out;
      },
      poopAt: (k) => k < poopCount ? { x: poopAt[k * 3], y: poopAt[k * 3 + 1], z: poopAt[k * 3 + 2] } : null,
      scoop, feed: (owner) => feed(slotOf(owner)), feedOwn,
      // Review pictures: hold every dog still and stand one where and how a picture wants it.
      hold(on) { held = !!on; },
      place(slot, x, z, heading) {
        px[slot] = x; pz[slot] = z; yaw[slot] = heading; speed[slot] = 0; py[slot] = floorOf(slot, py[slot]);
        return { x, y: py[slot], z };
      },
      get here() { return here; }
    };
    return { update, drawOverlay, adopt, tap, feed, feedOwn, scoop, have, hasDog, stats, dispose, debug, get total() { return total; } };
  };
  BL.rescueDogs = { create, homesAcross, DOG_CAP, DRAWN_CAP, POOP_CAP, FLY_PILES, STRAY_CAP, STRAY_TIER, DRAW, DRAWN, POOP_DRAW, POOPS_DRAWN, HOME_GAP, NEAR_HOMES, HUNGER_SECONDS, HUNGRY, STARVE_SECONDS, BREEDS, FACES, FACE_INK, CHORA, YARD, ROOM, hungerAfter, breedFor, nameFor };
})();
