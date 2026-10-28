// Free Puppies Rescue's dogs in DSB Land (VAC 1, `rescue-room.js`): puppies waiting in the rescue's yard, strays roaming
// the Chora's lanes, and the signed-in visitor's own dog, one a login (`rescue-dsb.js` keeps the adoptions). The own
// dog follows its Ooga a step behind, through every door and back out, on its own floor: the ground is looked up at the
// dog's height plus a step, never its Ooga's, so it climbs no roof and wades onto no seabed, and every step it takes
// is a clear one (`strays.clearSegment`, the strays' own check). A step it can not take leaves it waiting; it turns up
// beside its Ooga only when that Ooga is out of reach behind a wall or was moved (a door, the deep-water return).
// The dog wears a small jetpack whenever its Ooga wears one. When its Ooga flies, the pack lights and it flies next
// to its Ooga, as fast and as steep as a jetpack goes (`BL.crew.JET_SPEED`, `JET_RISE`), climbing over whatever stands
// in its way (`flyClear`) and never through it. On an ordinary descent it falls under gravity, then runs back to its Ooga. Above a building or water it
// clears the obstacle and lands on dry open ground (`standable`) before walking on. It grows hungry over scene time (`HUNGER_SECONDS` from full to empty), sits and whines
// once it passes `HUNGRY`, eats a banana from the shared pile when tapped, and while fed poops in the Chora on a
// jittered timer, on the ground only. Left empty for `STARVE_SECONDS` it goes back to the rescue (`onRelease`).
//
// Every dog lives in one space: the Chora (`CHORA`), the rescue's yard (`YARD`), or with its Ooga (`WITH`), wherever that
// Ooga is. The scene says each frame which space the visitor stands in (`update`'s `at`); a dog in another space is
// neither drawn nor picked, and waits there unmoved, so the rooms and the Chora share coordinates and one floor query.
//
// Hundreds of strays roam all of DSB Land whoever has adopted what: dogs nobody has taken in yet, each round a home the
// scene seeds across the island's walkable ground and its lanes (`homesAcross`, `strays.homes`), as many as the quality
// tier allows (`STRAY_TIER`, up to `STRAY_CAP`). A stray wanders a few metres from home along clear straight lines
// (`strays.clearSegment`), sniffs, sits, poops into the same ring of piles wherever it is, sleeps at home by night and
// now and then trots beside the Ooga walking by if it has no adopted dog, every step a clear one; strays never fly. A tap on one
// opens the adoption with that very dog chosen; adopted, it follows its Ooga, and a newcomer takes its home
// `STRAY_RESPAWN` seconds later.
//
// So many cost little: a stray further than the tier's draw distance from the camera (`DRAW`, plus `THINK_NEAR`) thinks
// only one frame in `FAR_SLICES`, with the time it missed, and is not drawn; of those within it and before the camera
// at most `DRAWN` a frame are drawn, and only those within `SHADOW_NEAR` cast a shadow. Fixed capacity throughout:
// `DOG_CAP` slots in typed arrays and, per breed, instanced batches for the bodies, the legs (four instances a dog,
// swung about the hip) and the tails, `SHADOW_CAP` dogs in the batches that cast shadows and `DRAWN_CAP` in those that
// do not; poop is one batch of `POOP_CAP` cartoon swirls kept oldest first, so a full DSB Land loses its oldest pile,
// drawn within the same distance, with two flies over each of the nearest `FLY_PILES` in one more batch; the own dog's
// jetpack and flame are two nodes on the Ooga's cached meshes. The frame loop writes `instanceData` in place and
// allocates nothing. The piles and the scoop count are `store`'s (`rescue-dsb.js` saves them). Pick targets are made
// once a visit, one for each dog drawn and one a poop, shown only while in use and in view, and removed in `dispose`.
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
  const EAT_SECONDS = 2.6, FOOD_DROP_SECONDS = 0.4, SQUAT_SECONDS = 1.4, RESTOCK_SECONDS = 4;
  // A dog stopped by a wall further than LEFT_BEHIND from its Ooga, or whose Ooga moved more than MOVED in one frame
  // (a door, the deep-water return), turns up beside it; a hungry one trots after an Ooga further off than TROT.
  const WALK = 2.2, RUN = 4.6, FED_RUN = 6.9, LEFT_BEHIND = 2.5, MOVED = 3, TROT = 4;
  // Flight: the dog takes off once its Ooga thrusts off the ground or is LIFT above what lies under it and flies next to
  // it, FLY_SIDE out on its own side and FLY_UP over its feet, at up to CATCH_UP times a jetpack's speed (`flyTo` closes
  // FLY_GAIN times the gap a second, so to keep abreast at speed it aims a second's FLY_GAIN-th of its Ooga's way ahead,
  // less the step it takes this frame); it turns up there beyond FLY_FAR.
  // Its Ooga down, it lands within LAND_REACH of it on dry open ground; the jetpack sits on its back at JET_SCALE.
  // Held up in the air longer than HELD_UP with no way on (a canopy over it, a wall ahead), it turns up where it is
  // going.
  const LIFT = 1.2, FLY_SIDE = 1.2, FLY_UP = 0.4, FLY_GAIN = 3, CATCH_UP = 1.35, FLY_FAR = 30, LAND_REACH = 14, JET_SCALE = 0.55, HELD_UP = 1.5, CLIMB_OVER = 8;
  const FREE = 0, KENNEL = 1, FOLLOW = 2, SIT = 3, EAT = 4, SQUAT = 5, NAP = 6, HOME = 7, STRAY = 8, FLY = 9, LAND = 10;
  const STATE_NAMES = ["free", "kennel", "follow", "sit", "eat", "poop", "sleep", "home", "stray", "fly", "land"];
  // Where a dog is: the Chora, the rescue's yard, or with its Ooga. `update` takes the visitor's as CHORA, YARD or ROOM
  // (any other interior).
  const CHORA = 0, YARD = 1, WITH = 2, ROOM = 3;
  // Strays: how many roam on each quality tier. One roams up to STRAY_ROAM from home, never further than STRAY_LEASH
  // while it tags along beside the Ooga within STRAY_NEAR of it.
  const STRAY_TIER = { high: 300, medium: 150, low: 60 };
  const STRAY_RESPAWN = 45, STRAY_ROAM = 3.5, STRAY_NEAR = 5, STRAY_LEASH = 16;
  // Drawing and thinking by distance from the camera: dogs within DRAW metres and before it are drawn, at most DRAWN
  // strays a frame (DRAWN_CAP holds the most of any tier plus every other dog), and piles within POOP_DRAW, at most
  // POOPS_DRAWN; a stray beyond DRAW + THINK_NEAR thinks one frame in FAR_SLICES. Of the dogs drawn, the yard's, the own
  // dog and the strays within SHADOW_NEAR cast shadows, at most SHADOW_CAP of a breed.
  const DRAW = { high: 60, medium: 42, low: 28 }, DRAWN = { high: 128, medium: 72, low: 32 }, DRAWN_CAP = 160;
  const SHADOW_NEAR = 16, SHADOW_CAP = 24;
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

  // Joins the builder caches that are dropped when the scenes that used them are left (`BL.models.track`). A part's
  // `flat` twin shares its vertices and casts no shadow.
  const geometryOf = (() => {
    const cache = new Map(), scoped = BL.models.track(() => cache.clear());
    return (breed, part, flat = false) => {
      scoped.use();
      const key = `${breed}/${part}${flat ? "/flat" : ""}`;
      let geo = cache.get(key);
      if (!geo) cache.set(key, geo = flat ? { ...geometryOf(breed, part), castShadow: false } : buildPart(BREEDS[breed], part));
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
    const M = BL.models, thickness = 0.012, height = (L.th + 0.5) * U, throat = 0.7;
    const left = -Math.max(L.tw >> 1, L.hw >> 1) * U, right = Math.max((L.tw + 1) >> 1, (L.hw + 1) >> 1) * U;
    const width = right - left + 0.02, cx = (left + right) / 2, cy = (L.top - 1.4) * U, cz = (L.front + 0.5) * U;
    if (part === "tag") {
      const throatY = cy - height * throat * Math.SQRT1_2 / 2, throatZ = cz + height * throat * Math.SQRT1_2 / 2;
      return M.merge(
        M.box({ w: 0.014, h: 0.028, d: 0.012, color: "#bdc7cf", offset: { x: cx, y: throatY - 0.014, z: throatZ + 0.012 } }),
        M.bevelBox({ w: 0.08, h: 0.08, d: 0.012, bevel: 0.01, color: "#e8b84d", offset: { x: cx, y: throatY - 0.062, z: throatZ + 0.012 } }));
    }
    const rand = BL.math.mulberry32(fnv1a(b.id));
    const x0 = -(L.tw >> 1), x1 = x0 + L.tw - 1;
    // Torso: coat with a shaded back stripe and a cream belly and chest.
    v.fill(x0, x1, L.bottom, L.top, L.back, L.front, (x, y, z) => {
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
    // A thin, rounded strap follows the sloping neck. The matching core fills the throat beneath it.
    // Shape both lathed profiles together, keeping the band close to the voxel neck at its sides.
    const color = b.ink[COLLAR], radius = width / 2, inner = radius - thickness / 2, outer = radius + thickness / 2;
    const strap = M.merge(
      M.lathe({ profile: [[0, -0.025], [inner, -0.025], [inner, 0.025], [0, 0.025]], segments: 32, color: b.ink[COAT] }),
      M.lathe({ profile: [[inner, -0.02], [outer, -0.02], [outer, 0.02], [inner, 0.02], [inner, -0.02]], segments: 32, color })
    );
    // Across the back, the inner strap bridges the head/back corner: its forward edge touches the
    // head's rear plane, its rear edge the back's top plane, with a small clearance for both.
    const backY = (L.top + 1) * U + 0.003 + 0.02 * Math.SQRT1_2;
    const backZ = L.headBack * U - 0.003 - 0.02 * Math.SQRT1_2;
    const backRadius = ((backY - cy) - (backZ - cz)) * Math.SQRT1_2;
    const backShift = ((backY - cy) + (backZ - cz)) * Math.SQRT1_2;
    for (let i = 0; i < strap.verts.length; i += 3) {
      const x = strap.verts[i], z = strap.verts[i + 2], r = Math.hypot(x, z);
      if (!r) continue;
      const upper = Math.max(0, -z / r), blend = Math.min(1, upper * 4), curve = 0.65 - 0.4 * blend;
      strap.verts[i] = Math.sign(x) * Math.pow(Math.abs(x / r), curve) * r;
      strap.verts[i + 1] += backShift * blend;
      strap.verts[i + 2] = Math.sign(z) * Math.pow(Math.abs(z / r), curve) * r * (z > 0 ? height / width * throat : backRadius / inner);
    }
    const buckle = M.merge(
      M.box({ w: 0.009, h: 0.045, d: 0.052, color: "#bdc7cf", offset: { x: width / 2 + 0.008 } }),
      M.box({ w: 0.01, h: 0.025, d: 0.03, color, offset: { x: width / 2 + 0.013 } })
    );
    // Fit only the throat beneath the strap; preserve the upper neck and back silhouette.
    // Split faces at the band's edges before shaping them, so long voxel quads cannot bridge over the collar.
    const body = voxelGeometry(v, { unit: U, palette: b.ink }), neck = M.geometry(), q = Math.SQRT1_2;
    neck.voxel = body.voxel;
    const axial = (p) => ((p[1] - cy) + (p[2] - cz)) * q;
    const clip = (points, plane, sign) => {
      const out = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], da = axial(a) - plane, db = axial(b) - plane;
        if (da * sign >= 0) out.push(a);
        if (da * db < 0) {
          const t = da / (da - db);
          out.push(a.map((x, k) => x + (b[k] - x) * t));
        }
      }
      return out;
    };
    const cuts = [-Infinity, -0.055, -0.022, 0.022, 0.055, Infinity], power = 2 / 0.65;
    for (const face of body.faces) {
      const points = face.i.map((i) => body.verts.slice(i * 3, i * 3 + 3));
      const lo = Math.min(...points.map(axial)), hi = Math.max(...points.map(axial));
      if (hi <= -0.055 || lo >= 0.055) {
        neck.faces.push({ ...face, i: points.map((p) => M.pushVert(neck, p[0], p[1], p[2])) });
        continue;
      }
      for (let k = 0; k < cuts.length - 1; k++) {
        if (hi < cuts[k] || lo > cuts[k + 1]) continue;
        let piece = points;
        if (lo < cuts[k]) piece = clip(piece, cuts[k], 1);
        if (hi > cuts[k + 1]) piece = clip(piece, cuts[k + 1], -1);
        if (piece.length < 3) continue;
        const indices = piece.map((p) => {
          const t = axial(p), blend = Math.min(1, Math.max(0, (0.055 - Math.abs(t)) / 0.033));
          let x = p[0] - cx, z = ((p[2] - cz) - (p[1] - cy)) * q;
          const rx = inner - 0.004, rz = rx * height / width * (z > 0 ? throat : 1);
          const r = Math.pow(Math.pow(Math.abs(x / rx), power) + Math.pow(Math.abs(z / rz), power), 1 / power);
          const scale = r > 1 ? 1 + (1 / r - 1) * blend * Math.min(1, Math.max(0, z / 0.03)) : 1;
          x *= scale; z *= scale;
          return M.pushVert(neck, cx + x, cy + (t - z) * q, cz + (t + z) * q);
        });
        for (let n = 1; n < indices.length - 1; n++) neck.faces.push({ ...face, i: [indices[0], indices[n], indices[n + 1]] });
      }
    }
    return M.merge(neck,
      M.moved(M.turnedX(strap, Math.PI / 4), cx, cy, cz),
      M.moved(M.turnedX(buckle, -Math.PI / 4), cx, cy, cz));
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
  // and its `door`; `door` (outside) is the rescue's doorstep in the Chora, where a dog given back out there trots off
  // to. `ground(x, z, feet)` is the floor wherever the visitor is, the highest surface no more than a step above
  // `feet`; `standable(x, y, z)` whether a dog may land or turn up there (dry open ground, no roof); `flyClear(ax, az,
  // bx, bz, y)` whether a dog flying at height y may cross that line. `strays` holds the strays' `homes` (x, y, z each,
  // in the order they are taken), the `renderer` whose tier sets how many roam and how far they are drawn, and
  // `clearSegment(ax, az, bx, bz, y)`, whether a dog may walk that line; `camera` is the scene's, whose distance and
  // facing decide what is drawn and how often a stray thinks. `store` holds the piles (`poops`, x, y, z each, oldest
  // first) and the `scooped` count, and gets the piles back in `writeStore`; `onRelease(entry)` hears that the own dog
  // went back to the rescue. `pile.eat()` takes one banana.
  const create = ({ root, crew, pile, fx, hud, yard, door, ground, standable, flyClear, addTarget, removeTarget, pickGeometry, strays, camera, store, onRelease }) => {
    const { createNode, addChild, removeChild, updateWorld } = BL.scene;
    const { JET_SPEED, JET_RISE, JET_SPARKS } = BL.crew;
    const batch = (geometry, cap) => createNode({ geometry, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, visible: false, fixedInstanceCapacity: true });
    // Per breed, a batch of each part for the dogs that cast shadows, then one for those that do not: batch k of a set
    // is breed k % BREEDS.length, set k / BREEDS.length.
    const bodies = [], legs = [], tails = [];
    for (const [cap, flat] of [[SHADOW_CAP, false], [DRAWN_CAP, true]]) BREEDS.forEach((b, i) => {
      bodies.push(batch(geometryOf(i, "body", flat), cap));
      legs.push(batch(geometryOf(i, "leg", flat), cap * 4));
      tails.push(batch(geometryOf(i, "tail", flat), cap));
    });
    const poops = batch(geometryOf(0, "poop"), POOP_CAP), flies = batch(flyGeometry(), FLY_PILES * 2);
    const batches = [...bodies, ...legs, ...tails, poops, flies];
    for (const node of batches) addChild(root, node);
    // The own dog's jetpack, the Ooga's tanks and flame on a smaller scale.
    const jet = createNode({ geometry: BL.hubModels.jetpack(), visible: false }), flame = createNode({ geometry: BL.hubModels.jetFlame(), visible: false });
    addChild(jet, flame);
    addChild(root, jet);
    // Only the adopted dog wears a tag; its cached breed geometry follows the body's pose.
    const tag = createNode({ visible: false }), tags = BREEDS.map((b, i) => geometryOf(i, "tag"));
    addChild(root, tag);
    const food = createNode({ geometry: BL.models.bananaGeometry(), visible: false });
    addChild(root, food);
    const layouts = BREEDS.map(layoutOf);
    const DUST = [BL.models.particleGeometry("#8a5a32", 0.06, 0), BL.models.particleGeometry("#c9b28a", 0.05, 0)];
    const HEARTS = [BL.models.particleGeometry("#ff6b8a", 0.07, 0.8), BL.models.particleGeometry("#ffd0dc", 0.05, 0.8)];
    const STINK = [BL.models.particleGeometry("#9ccc4a", 0.07, 0.4), BL.models.particleGeometry("#6d8a3a", 0.06, 0.2)];
    const state = new Uint8Array(DOG_CAP), breedOf = new Uint8Array(DOG_CAP), space = new Uint8Array(DOG_CAP);
    const px = new Float32Array(DOG_CAP), py = new Float32Array(DOG_CAP), pz = new Float32Array(DOG_CAP);
    const yaw = new Float32Array(DOG_CAP), speed = new Float32Array(DOG_CAP), phase = new Float32Array(DOG_CAP);
    const timer = new Float32Array(DOG_CAP), poopTimer = new Float32Array(DOG_CAP), starve = new Float32Array(DOG_CAP);
    const sleepMark = new Float32Array(DOG_CAP);
    const grow = new Float32Array(DOG_CAP), side = new Float32Array(DOG_CAP), wagT = new Float32Array(DOG_CAP);
    const goalX = new Float32Array(DOG_CAP), goalZ = new Float32Array(DOG_CAP), spotOf = new Int16Array(DOG_CAP).fill(-1);
    const owners = new Array(DOG_CAP).fill(null), entries = new Array(DOG_CAP).fill(null);
    const spotCount = yard.spots.length / 3, restock = new Float32Array(spotCount).fill(-1);
    const poopAt = new Float32Array(POOP_CAP * 3), flyPhase = new Float32Array(POOP_CAP);
    const mood = new Uint8Array(DOG_CAP), homeOf = new Int16Array(DOG_CAP).fill(-1), look = new Float32Array(DOG_CAP), tagged = new Array(DOG_CAP).fill(null);
    // The time a far stray has missed since it last thought (for the own dog, how long it has been held up in the
    // air), how long a walking dog has stood at a wall, and whether each dog was drawn this frame.
    const lag = new Float32Array(DOG_CAP), stuck = new Float32Array(DOG_CAP), drawnAt = new Uint8Array(DOG_CAP);
    // The homes, and the stray at each (-1 while free).
    const homes = strays.homes, homeCount = homes.length / 3, homeDog = new Int16Array(homeCount).fill(-1);
    const flyOf = new Int16Array(FLY_PILES);
    // `changes` counts the piles dropped and scooped, for the saving.
    let poopCount = 0, stepCooldown = 0, version = 0, changes = 0, held = false, here = CHORA, frame = 0;
    let strayCount = 0, strayDue = STRAY_RESPAWN, strayBorn = 0, homeNext = 0;
    let drawnCount = 0, picksShown = 0, poopsDrawn = 0, flyCount = 0, redraw = true, poopX = 0, poopY = 0, poopZ = 0;
    // The own dog's slot (-1 for none), where its Ooga was last frame, whether its head is up to an Ooga above it,
    // the ground it is landing on, and the next spark under its jetpack.
    let own = -1, ownX = 0, ownY = 0, ownZ = 0, lookUp = false, landX = 0, landY = 0, landZ = 0, spark = 0;
    let fallSpeed = 0, landingHover = false;
    let mealQueued = false, foodY = 0;
    const cursor = new Int32Array(BREEDS.length * 2);
    // Pick targets, made once a visit: one for each dog drawn, handed to whichever dog is drawn in its turn each frame,
    // and one a poop, each shown only while in use and in view.
    const dogPicks = [], pickOwners = [], poopPicks = [];
    for (let k = 0; k < DRAWN_CAP; k++) {
      // Match Ooga priority so the nearer body wins when their click areas overlap.
      const node = createNode({ geometry: bodies[0].geometry, visible: false }), owner = { kind: "dog", dog: -1, weaponType: "none", priority: 1 };
      addTarget(node, owner);
      dogPicks.push(node);
      pickOwners.push(owner);
    }
    for (let i = 0; i < POOP_CAP; i++) {
      const node = createNode({ geometry: pickGeometry, visible: false });
      addTarget(node, { kind: "poop", poop: i, weaponType: "none" }, { radius: 0.22 });
      poopPicks.push(node);
    }
    // The floor under dog i, looked up at its own height (a step up at most), never its Ooga's.
    const floorOf = (i, feet = py[i]) => {
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
      state[i] = FOLLOW; space[i] = WITH; owners[i] = cave; entries[i] = entry; spotOf[i] = -1; stuck[i] = lag[i] = 0;
      breedOf[i] = entry.breed; side[i] = fnv1a(entry.name) & 1 ? 0.55 : -0.55;
      poopTimer[i] = POOP_MIN * 0.5 + Math.random() * POOP_SPAN; starve[i] = 0; grow[i] = 1;
      fallSpeed = 0; landingHover = false;
      own = i; ownX = cave.root.position.x; ownY = cave.root.position.y; ownZ = cave.root.position.z;
      // Adoption and restoring a saved dog both end any strays' turn tagging along.
      for (let k = 0; k < DOG_CAP; k++) if (state[k] === STRAY && mood[k] === TAG) homeward(k);
    };
    // Dry open ground near (x, z) for a dog to land on or turn up at, behind `heading` first: ground looked up from
    // `feet`, with nothing over it up to `from`, the height the dog comes down from. Writes landX, landY, landZ.
    const LAND_RINGS = [1, 1.8, 2.8, 4, 5.5, 7.5, 10, LAND_REACH];
    const groundNear = (x, z, feet, heading, from) => {
      for (const r of LAND_RINGS) for (let k = 0; k < 12; k++) {
        const a = heading + Math.PI + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6;
        const gx = x + Math.sin(a) * r, gz = z + Math.cos(a) * r, gy = ground(gx, gz, feet + 0.5);
        if (gy < -100 || !standable(gx, gy, gz) || ground(gx, gz, Math.max(from, gy) + 0.5) > gy + 0.05) continue;
        landX = gx; landY = gy; landZ = gz;
        return true;
      }
      return false;
    };
    // The own dog turns up beside its Ooga, on ground of its own; with none near, at the Ooga's feet.
    const beside = (i, p, feet, heading) => {
      if (groundNear(p.x, p.z, feet, heading, feet)) { px[i] = landX; py[i] = landY; pz[i] = landZ; }
      else { px[i] = p.x; py[i] = feet; pz[i] = p.z; }
      yaw[i] = heading; speed[i] = 0; stuck[i] = 0;
    };
    // The visit's dogs: a puppy on each yard spot; the own dog comes with `setOwn`.
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
      owners[i] = entries[i] = null; spotOf[i] = -1; grow[i] = grown ? 1 : 0; wagT[i] = 0; lag[i] = 0; stuck[i] = 0;
      sleepMark[i] = (i * 0.61803398875 % 1) * 1.6;
      place(i, homes[h * 3], homes[h * 3 + 2], (h * 2.39996) % 6.28, homes[h * 3 + 1]);
      side[i] = h & 1 ? 0.6 : -0.6; timer[i] = 1 + Math.random() * 3; look[i] = Math.random() * 3;
      poopTimer[i] = Math.random() * (STRAY_POOP_MIN + STRAY_POOP_SPAN);
      strayCount++;
      return i;
    };
    const strayWanted = () => Math.min(homeCount, STRAY_TIER[strays.renderer.quality]);
    for (let n = strayWanted(); strayCount < n && strayIn(true) >= 0;);
    poopCount = Math.min(POOP_CAP, store.poops.length / 3);
    for (let k = 0; k < poopCount * 3; k++) poopAt[k] = store.poops[k];
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
      if (poopCount === POOP_CAP) poopAt.copyWithin(0, 3);
      else poopCount++;
      poopAt[poopCount * 3 - 3] = x; poopAt[poopCount * 3 - 2] = y; poopAt[poopCount * 3 - 1] = z;
      version++; changes++;
    };
    const scoop = (k) => {
      if (k >= poopCount) return false;
      const x = poopAt[k * 3], y = poopAt[k * 3 + 1], z = poopAt[k * 3 + 2];
      poopAt.copyWithin(k * 3, k * 3 + 3, poopCount * 3);
      poopCount--;
      store.scooped++;
      fx.burst(x, y + 0.1, z, 8, DUST, 1.4);
      hud.toast(`Scooped! · ${store.scooped} poop${store.scooped === 1 ? "" : "s"} cleaned up`);
      version++; changes++;
      return true;
    };
    // The piles back into `store`, rounded to the centimetre, for saving.
    const writeStore = () => {
      store.poops.length = poopCount * 3;
      for (let k = 0; k < poopCount * 3; k++) store.poops[k] = Math.round(poopAt[k] * 100) / 100;
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
      e.hunger = 0;
      starve[i] = 0;
      if (state[i] !== FLY && state[i] !== LAND) state[i] = EAT;
      timer[i] = EAT_SECONDS; wagT[i] = EAT_SECONDS + 2;
      mealQueued = true;
      fx.burst(px[i], py[i] + 0.45, pz[i], 7, HEARTS, 1.1);
      hud.toast(`${e.name} ate a banana · thank you!`);
      return true;
    };
    // The own dog, fed from the yard's bowl.
    const feedOwn = () => {
      if (own >= 0) return feed(own);
      hud.toast("Adopt a puppy first, then feed it here.");
      return false;
    };
    // A waiting puppy or a stray answers with its breed, for the adoption dialog; the own dog is fed.
    const tap = (i) => {
      if (state[i] === KENNEL || state[i] === STRAY) return breedOf[i];
      if (i === own) feed(i);
      return -1;
    };
    // The own dog leaves the visit (signed out, or another login); `entry` and its Ooga `cave`, when given, bring one
    // in at that Ooga's side.
    const setOwn = (cave, entry) => {
      tag.visible = food.visible = false; mealQueued = false;
      if (own >= 0) { state[own] = FREE; owners[own] = entries[own] = null; own = -1; }
      if (!cave || !entry) return;
      const i = freeSlot();
      if (i < 0) return;
      adoptInto(i, cave, entry);
      space[i] = WITH;
      const p = cave.root.position;
      beside(i, p, p.y - cave.baseY, cave.root.rotation.y);
    };
    // The own Ooga `cave` adopts `entry`'s dog: the stray the adoption was opened on, taken in while it is still out
    // there and of the breed chosen, or else, in the yard, a waiting puppy of the breed, or else a new one at its side.
    const adopt = (cave, entry, stray = -1) => {
      setOwn(null, null);
      let i = stray >= 0 && state[stray] === STRAY && breedOf[stray] === entry.breed ? stray : -1;
      if (i < 0 && here === YARD) for (let k = 0; k < DOG_CAP; k++) if (state[k] === KENNEL && breedOf[k] === entry.breed) { i = k; break; }
      if (i >= 0 && spotOf[i] >= 0) restock[spotOf[i]] = RESTOCK_SECONDS;
      if (i < 0) {
        setOwn(cave, entry);
        i = own;
      } else adoptInto(i, cave, entry);
      if (i < 0) return false;
      fx.burst(px[i], py[i] + 0.5, pz[i], 10, HEARTS, 1.6);
      return true;
    };
    // The dog goes back to the rescue: to a free spot in the yard when it is there, else off to the rescue's door.
    const giveUp = (i, hungry = true) => {
      const e = entries[i];
      hud.toast(hungry ? `${e.name} was hungry too long and went back to Free Puppies Rescue.` : `${e.name} went back to Free Puppies Rescue.`);
      owners[i] = entries[i] = null; own = -1; tag.visible = food.visible = false; mealQueued = false;
      state[i] = here === ROOM ? FREE : HOME;
      space[i] = here === CHORA ? CHORA : YARD;
      goalX[i] = here === CHORA ? door[0] : yard.x; goalZ[i] = here === CHORA ? door[1] : yard.z;
      if (py[i] > floorOf(i) + 0.05) state[i] = FREE;
      onRelease(e);
    };
    const releaseOwn = () => { if (own < 0) return false; giveUp(own, false); return true; };
    const turn = (i, heading, k) => {
      let t = heading - yaw[i];
      t -= Math.round(t / (Math.PI * 2)) * Math.PI * 2;
      yaw[i] += t * Math.min(1, k);
    };
    // Steers slot i toward (tx, tz) at up to `top` m/s along a line already known to be clear (the yard, a stray's
    // roam), on its own floor; true once it stands there. A step never overshoots, so a far stray's long step still lands.
    const steer = (i, tx, tz, top, dt) => {
      const dx = tx - px[i], dz = tz - pz[i], d = Math.sqrt(dx * dx + dz * dz);
      const want = d < 0.12 ? 0 : Math.min(top, (d - 0.08) * 2.6);
      speed[i] += (want - speed[i]) * Math.min(1, dt * 6);
      if (d > 0.12) turn(i, Math.atan2(dx, dz), dt * 7);
      if (speed[i] > 0.01) {
        const go = Math.min(speed[i] * dt, d);
        px[i] += Math.sin(yaw[i]) * go;
        pz[i] += Math.cos(yaw[i]) * go;
        py[i] = floorOf(i);
        phase[i] += speed[i] * dt * 11;
      }
      return d < 0.25;
    };
    // Walks slot i toward (tx, tz) at up to `top` m/s on its own floor, every step a clear one: WALKED on its way,
    // ARRIVED once it stands there, BLOCKED while a wall or the water's edge stops it.
    const WALKED = 0, ARRIVED = 1, BLOCKED = 2;
    const walkTo = (i, tx, tz, top, dt) => {
      const dx = tx - px[i], dz = tz - pz[i], d = Math.sqrt(dx * dx + dz * dz);
      const want = d < 0.12 ? 0 : Math.min(top, (d - 0.08) * 2.6);
      speed[i] += (want - speed[i]) * Math.min(1, dt * 6);
      if (d > 0.12) turn(i, Math.atan2(dx, dz), dt * 7);
      if (speed[i] > 0.01) {
        const go = Math.min(speed[i] * dt, d), nx = px[i] + Math.sin(yaw[i]) * go, nz = pz[i] + Math.cos(yaw[i]) * go;
        if (!strays.clearSegment(px[i], pz[i], nx, nz, py[i])) {
          speed[i] = 0;
          return BLOCKED;
        }
        px[i] = nx; pz[i] = nz; py[i] = floorOf(i);
        phase[i] += speed[i] * dt * 11;
      }
      return d < 0.25 ? ARRIVED : WALKED;
    };
    // Flies slot i toward (tx, ty, tz), as fast and as steep as a jetpack goes: a wall or roof in its way it climbs
    // over, up to CLIMB_OVER above where it is going, never through; it keeps clear of the floor under it. True once
    // it is there.
    const flyTo = (i, tx, ty, tz, dt) => {
      const dx = tx - px[i], dz = tz - pz[i], d = Math.sqrt(dx * dx + dz * dz);
      const want = Math.min(JET_SPEED * CATCH_UP, d * FLY_GAIN);
      speed[i] += (want - speed[i]) * Math.min(1, dt * 4);
      if (d > 0.1) turn(i, Math.atan2(dx, dz), dt * 6);
      let rise = Math.max(-JET_RISE, Math.min(JET_RISE, (ty - py[i]) * FLY_GAIN));
      if (d > 0.02 && speed[i] > 0.01) {
        const go = Math.min(speed[i] * dt, d), nx = px[i] + dx / d * go, nz = pz[i] + dz / d * go;
        if (flyClear(px[i], pz[i], nx, nz, py[i])) { px[i] = nx; pz[i] = nz; }
        else { speed[i] = 0; rise = py[i] < ty + CLIMB_OVER ? JET_RISE : Math.min(rise, 0); }
      }
      // The floor under it, not one within a step over its feet: in the air it climbs no mast or crane a step at a time.
      let floor = floorOf(i);
      if (floor > py[i] + 0.05) floor = floorOf(i, py[i] - 0.65);
      const y = Math.max(py[i] + rise * dt, floor + 0.15);
      if (flyClear(px[i], pz[i], px[i], pz[i], y)) py[i] = y;
      phase[i] += dt * 4;
      return d < 0.15 && Math.abs(ty - py[i]) < 0.15;
    };
    // Horizontal steering burns fuel too; Space is only the upward part of a powered flight.
    const jetting = (cave) => !!cave.jet && !cave.jetRecovering && cave.jetFuel > 0 && (cave.jet.power > 0 || cave.jet.thrust);
    // Whether the Ooga is in the air: jetting above what it stands on, or well above it.
    const airborne = (cave, p, feet) => {
      const gap = feet - ground(p.x, p.z, feet);
      return gap > LIFT || jetting(cave) && gap > 0.02;
    };
    // The own dog: FOLLOW a step behind on the ground, FLY after its Ooga in the air, LAND near it once it is down.
    const thinkOwn = (i, dt) => {
      const cave = owners[i], e = entries[i];
      if (!awake(cave)) {
        state[i] = NAP; speed[i] = 0;
        return;
      }
      const p = cave.root.position, feet = p.y - cave.baseY, h = cave.root.rotation.y, sh = Math.sin(h), ch = Math.cos(h);
      const moved = Math.abs(p.x - ownX) + Math.abs(p.z - ownZ) > MOVED, ahead = moved || !(dt > 0) ? 0 : Math.max(0, 1 / (FLY_GAIN * dt) - 1);
      const driftX = moved ? 0 : p.x - ownX, driftZ = moved ? 0 : p.z - ownZ;
      const leadX = (p.x - ownX) * ahead, leadY = (p.y - ownY) * ahead, leadZ = (p.z - ownZ) * ahead;
      const powered = jetting(cave);
      const descending = !powered && (cave.hopV < -0.05 || p.y < ownY - 0.0001);
      const rising = powered || p.y > ownY + 0.0001;
      ownX = p.x; ownY = p.y; ownZ = p.z; lookUp = false;
      if (state[i] === NAP) state[i] = FOLLOW;
      e.hunger = hungerAfter(e.hunger, dt);
      if (e.hunger >= 1 && (starve[i] += dt) >= STARVE_SECONDS) { giveUp(i); return; }
      const up = here === CHORA && airborne(cave, p, feet), across = side[i] < 0 ? -FLY_SIDE : FLY_SIDE, tx = p.x + ch * across, tz = p.z - sh * across;
      if (moved && !up) {
        if (state[i] === EAT) mealQueued = true;
        beside(i, p, feet, h);
        if (state[i] === FLY || state[i] === LAND) state[i] = FOLLOW;
      }
      const flying = up && !descending && (state[i] !== LAND || rising);
      if (!flying && state[i] === FLY) {
        state[i] = LAND; lag[i] = stuck[i] = 0;
        fallSpeed = Math.min(0, cave.hopV || 0); landingHover = false;
      }
      if (flying) {
        if (state[i] === EAT) mealQueued = true;
        if (state[i] !== FLY) { state[i] = FLY; stuck[i] = 0; fallSpeed = 0; landingHover = false; }
        // Left far behind, its Ooga moved, or held up a while with no way on: it catches up in the air next to it,
        // where its Ooga could fly.
        const far = Math.hypot(tx - px[i], tz - pz[i]);
        if ((moved || far > FLY_FAR || (lag[i] += dt) > HELD_UP) && flyClear(p.x, p.z, tx, tz, feet)) { px[i] = tx; pz[i] = tz; py[i] = feet; speed[i] = 0; lag[i] = 0; }
        flyTo(i, tx + leadX, feet + FLY_UP + leadY, tz + leadZ, dt);
        if (far < 4 || Math.hypot(tx - px[i], tz - pz[i]) < far - dt) lag[i] = 0;
        return;
      }
      if (state[i] === LAND) {
        // Share the airborne Ooga's horizontal drift while falling under gravity, then follow on foot. Only a roof, water or
        // other unsafe floor calls for a powered approach to dry ground beside its Ooga.
        let floor = ground(px[i], pz[i], py[i] - 0.65);
        const ownerFloor = ground(p.x, p.z, feet);
        const ownerFalling = feet > ownerFloor + 0.02;
        if (ownerFalling && (driftX || driftZ)) {
          const nx = px[i] + driftX, nz = pz[i] + driftZ, nextFloor = ground(nx, nz, py[i] - 0.65);
          if (flyClear(px[i], pz[i], nx, nz, py[i])) {
            px[i] = nx; pz[i] = nz; floor = nextFloor;
            turn(i, Math.atan2(driftX, driftZ), dt * 6);
          }
        }
        const fallY = py[i] + fallSpeed * dt - 0.5 * BL.pilot.WALK.gravity * dt * dt;
        // Crossing a roof in mid-fall is not a landing. Keep falling above it; divert only as the dog reaches it,
        // or once its Ooga actually stands on a surface where the dog cannot land.
        landingHover = floor < -100 || !standable(px[i], floor, pz[i]) && fallY <= floor + 0.65
          || !ownerFalling && !standable(p.x, ownerFloor, p.z);
        if (!landingHover) {
          speed[i] = 0; stuck[i] = 0;
          const nextY = Math.max(floor, fallY);
          fallSpeed -= BL.pilot.WALK.gravity * dt;
          let clear = true;
          // Sample the vertical sweep so a long frame cannot fall through a wall or overhang.
          for (let y = py[i]; y > nextY;) {
            y = Math.max(nextY, y - 0.2);
            if (!flyClear(px[i], pz[i], px[i], pz[i], y)) { clear = false; break; }
          }
          if (clear) { py[i] = nextY; lag[i] = 0; }
          else if ((lag[i] += dt) > HELD_UP) { beside(i, p, feet, h); state[i] = FOLLOW; fallSpeed = 0; lag[i] = 0; }
          if (py[i] <= floor + 0.001) { py[i] = floor; state[i] = FOLLOW; fallSpeed = 0; stuck[i] = 0; }
          return;
        }
        fallSpeed = 0;
        if (ownerFalling) {
          // Clear an obstacle alongside the falling Ooga instead of peeling away to a ground landing spot.
          flyTo(i, tx, feet + FLY_UP, tz, dt);
          stuck[i] = lag[i] = 0;
          return;
        }
        if ((stuck[i] -= dt) <= 0) {
          if (!groundNear(p.x, p.z, feet, h, py[i])) { flyTo(i, tx, Math.max(py[i], feet + 0.6), tz, dt); return; }
          stuck[i] = 0.5;
        }
        // Clear the obstacle before lowering onto the safe spot. Recover if the clearance query stalls.
        const off = Math.hypot(landX - px[i], landZ - pz[i]) + Math.abs(landY - py[i]), over = Math.hypot(landX - px[i], landZ - pz[i]) < 0.15;
        flyTo(i, landX, over ? landY : Math.max(py[i], landY + 0.6), landZ, dt);
        if (Math.hypot(landX - px[i], landZ - pz[i]) + Math.abs(landY - py[i]) < off - dt * 0.5) lag[i] = 0;
        else if ((lag[i] += dt) > HELD_UP) { px[i] = landX; pz[i] = landZ; py[i] = landY; lag[i] = 0; }
        if (Math.hypot(landX - px[i], landZ - pz[i]) < 0.15 && py[i] - landY < 0.2) { py[i] = landY; state[i] = FOLLOW; speed[i] = 0; stuck[i] = 0; }
        return;
      }
      // A feed offered in flight waits for landing. One retained banana drops just ahead of the muzzle.
      if (mealQueued) {
        const L = layouts[breedOf[i]], ahead = (L.headFront + BREEDS[breedOf[i]].snout[2] + 1) * U + 0.06;
        food.position.x = px[i] + Math.sin(yaw[i]) * ahead;
        food.position.z = pz[i] + Math.cos(yaw[i]) * ahead;
        foodY = py[i] + 0.045;
        food.rotation.x = Math.PI / 2; food.rotation.y = yaw[i];
        state[i] = EAT; timer[i] = EAT_SECONDS; mealQueued = false;
      }
      if (state[i] === EAT) {
        speed[i] = 0;
        if ((timer[i] -= dt) <= 0) state[i] = FOLLOW;
        return;
      }
      if (state[i] === SQUAT) {
        speed[i] = 0;
        if ((timer[i] -= dt) <= 0) {
          // Behind it, or where it stands when a wall is behind it; only ever on dry open ground.
          const back = layouts[breedOf[i]].tl * U * 0.55, x = px[i] - Math.sin(yaw[i]) * back, z = pz[i] - Math.cos(yaw[i]) * back;
          if (here === CHORA && standable(x, py[i], z)) dropPoop(x, py[i], z);
          else if (here === CHORA && standable(px[i], py[i], pz[i])) dropPoop(px[i], py[i], pz[i]);
          state[i] = FOLLOW;
          poopTimer[i] = POOP_MIN + Math.random() * POOP_SPAN;
        }
        return;
      }
      const dx = p.x - px[i], dz = p.z - pz[i], d = Math.sqrt(dx * dx + dz * dz), hungry = e.hunger >= HUNGRY;
      if (hungry && (timer[i] -= dt) <= 0) {
        timer[i] = 9 + Math.random() * 6;
        fx.sayAt(px[i], py[i] + 0.7, pz[i], `${e.name}: whine... banana?`, 2.2);
      }
      // Hungry, it sits and whines while its Ooga is near, and only trots after one further off.
      if (hungry && d < TROT) {
        if (state[i] !== SIT) { state[i] = SIT; timer[i] = 0; }
        speed[i] *= Math.max(0, 1 - dt * 8);
        return;
      }
      state[i] = FOLLOW;
      const step = walkTo(i, p.x - sh * 0.95 + ch * side[i], p.z - ch * 0.95 - sh * side[i], hungry ? WALK : FED_RUN, dt);
      // Stopped by a wall with its Ooga out of reach on its own level, it turns up beside it; an Ooga up on a roof
      // it waits under, looking up.
      if (step === BLOCKED) {
        if (feet - py[i] > LIFT) lookUp = d < LAND_REACH;
        else if ((stuck[i] += dt) > 0.4 && d > LEFT_BEHIND) beside(i, p, feet, h);
      } else stuck[i] = 0;
      if (step === ARRIVED && speed[i] < 0.2) turn(i, h, dt * 3);
      if (!hungry && here === CHORA && (poopTimer[i] -= dt) <= 0 && speed[i] < 0.6) {
        state[i] = SQUAT; timer[i] = SQUAT_SECONDS;
      }
    };
    // The Ooga walking the Chora when it passes near enough to stray i and on its level; null otherwise.
    const passerBy = (i) => {
      const cave = crew.player;
      if (own >= 0 || here !== CHORA || !cave || !awake(cave)) return null;
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
    // Back home from tagging along: along the line there when it is clear, else it is simply home again, popping in.
    const homeward = (i) => {
      const h = homeOf[i], hx = homes[h * 3], hz = homes[h * 3 + 2];
      tagged[i] = null; mood[i] = ROAM; goalX[i] = hx; goalZ[i] = hz;
      if (strays.clearSegment(px[i], pz[i], hx, hz, py[i])) return;
      place(i, hx, hz, yaw[i], homes[h * 3 + 1]);
      grow[i] = 0;
    };
    const roam = (i, dt, night) => {
      const h = homeOf[i], hx = homes[h * 3], hz = homes[h * 3 + 2], m = mood[i];
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
        if (m === TAG) homeward(i);
        if (m !== DOZE) mood[i] = DOZE;
        if (steer(i, hx, hz, WALK * 0.6, dt)) speed[i] = 0;
        return;
      }
      if (m === DOZE) { mood[i] = REST; timer[i] = 1 + Math.random() * 2; }
      if (m === TAG) {
        // Along beside the Ooga while it walks on this level, every step a clear one; done, stopped or left behind
        // in the air, it goes home.
        const cave = tagged[i], p = cave.root.position;
        if ((timer[i] -= dt) > 0 && here === CHORA && awake(cave) && Math.abs(p.y - cave.baseY - py[i]) < 1 && Math.hypot(px[i] - hx, pz[i] - hz) < STRAY_LEASH) {
          const head = cave.root.rotation.y, sh = Math.sin(head), ch = Math.cos(head);
          const step = walkTo(i, p.x + ch * side[i] - sh * 0.2, p.z - sh * side[i] - ch * 0.2, RUN, dt);
          if (step === ARRIVED && speed[i] < 0.2) turn(i, head, dt * 3);
          if (step !== BLOCKED) return;
        }
        homeward(i);
      }
      if ((poopTimer[i] -= dt) <= 0 && speed[i] < 0.6) {
        mood[i] = PLOP; timer[i] = SQUAT_SECONDS;
        return;
      }
      if (mood[i] === ROAM) {
        if (steer(i, goalX[i], goalZ[i], WALK * 0.6, dt)) { mood[i] = Math.random() < 0.55 ? SNIFF : REST; timer[i] = 2 + Math.random() * 4; }
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
      const s = state[i];
      if (grow[i] < 1) grow[i] = Math.min(1, grow[i] + dt * 2.5);
      if (wagT[i] > 0) wagT[i] -= dt;
      if (s === KENNEL) {
        const k = spotOf[i];
        if ((timer[i] -= dt) <= 0) {
          timer[i] = 2 + Math.random() * 4;
          const a = Math.random() * 6.28, r = Math.random() * yard.wander;
          goalX[i] = spot(k, 0) + Math.cos(a) * r; goalZ[i] = spot(k, 1) + Math.sin(a) * r;
        }
        steer(i, goalX[i], goalZ[i], 0.9, dt);
        return;
      }
      if (s === STRAY) {
        roam(i, dt, night);
        return;
      }
      if (s === HOME) {
        // In the yard it settles on a free spot; out in the Chora it trots off towards the rescue's door and is gone
        // there, or at the first wall.
        const done = space[i] === YARD ? steer(i, goalX[i], goalZ[i], WALK, dt) : walkTo(i, goalX[i], goalZ[i], WALK, dt) !== WALKED;
        if (!done) return;
        if (space[i] === YARD) for (let k = 0; k < spotCount; k++) {
          let taken = false;
          for (let j = 0; j < DOG_CAP; j++) if (state[j] === KENNEL && spotOf[j] === k) { taken = true; break; }
          if (taken || restock[k] >= 0) continue;
          state[i] = KENNEL; spotOf[i] = k; timer[i] = 0;
          return;
        }
        state[i] = FREE;
        return;
      }
      thinkOwn(i, dt);
    };
    // Whether dog i is in the visitor's space and drawn this frame.
    const shown = (i) => state[i] !== FREE && state[i] !== NAP && (space[i] === WITH || space[i] === here);
    // Legs swing in diagonal pairs while walking; sitting folds the hind legs, napping lays all four flat, flying
    // stretches them fore and aft under the jetpack. `near` is whether its shadow is worth drawing.
    const draw = (i, elapsed, near, dt) => {
      const b = breedOf[i], L = layouts[b], s = (spotOf[i] >= 0 || state[i] === HOME ? 0.88 : state[i] === STRAY ? 0.94 : 1) * (0.2 + 0.8 * grow[i]);
      const st = state[i] === STRAY ? MOOD_POSE[mood[i]] : state[i], hunger = entries[i] ? entries[i].hunger : 0, aloft = st === FLY || st === LAND, powered = st === FLY || st === LAND && landingHover;
      let pitch = 0, lift = 0, front = 0, hind = 0;
      const walk = aloft ? 0 : Math.min(1, speed[i] / 1.4), swing = Math.sin(phase[i]) * 0.65 * walk;
      let y = py[i] + Math.abs(Math.cos(phase[i])) * 0.018 * walk;
      if (st === SIT) { pitch = -0.42; front = 0.42; hind = -1.25; y += L.leg * U * 0.1; }
      else if (st === NAP && speed[i] < 0.05) { lift = -L.leg * U * 0.92; front = -1.5; hind = 1.5; }
      else if (st === EAT && (i !== own || timer[i] < EAT_SECONDS - FOOD_DROP_SECONDS)) { pitch = 0.32 + Math.sin(elapsed * 14) * 0.05; front = -0.32; hind = -0.32; }
      else if (st === SQUAT) { pitch = -0.22; front = 0.22; hind = -0.75; lift = -0.035; }
      else if (st === KENNEL && speed[i] < 0.05 && (i & 1)) { pitch = -0.42; front = 0.42; hind = -1.25; y += L.leg * U * 0.1; }
      else if (st === LAND && !landingHover) { front = -0.2; hind = 0.2; }
      else if (aloft) { pitch = Math.sin(phase[i]) * 0.04; front = -1.05; hind = 1.1; y += Math.sin(elapsed * 3 + i) * 0.03; }
      else if (i === own && lookUp && speed[i] < 0.05) pitch = -0.3;
      y += lift * s;
      // Nearby strays emit the same rising Z as sleeping Oogas, only once settled at home.
      if (near && st === NAP && speed[i] < 0.05 && homeOf[i] >= 0) {
        const h = homeOf[i];
        if (Math.hypot(px[i] - homes[h * 3], pz[i] - homes[h * 3 + 2]) < 0.3 && (sleepMark[i] -= dt) <= 0) {
          sleepMark[i] = 1.6;
          const headZ = (L.headBack + L.hl * 0.5) * U * s;
          fx.zzzAt(px[i] + Math.sin(yaw[i]) * headZ, y + (L.headTop + 2) * U * s, pz[i] + Math.cos(yaw[i]) * headZ);
        }
      }
      const cy = Math.cos(yaw[i]), sy = Math.sin(yaw[i]), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const hipY = L.bottom * U, x0 = px[i], z0 = pz[i];
      let k = b;
      if (!near || cursor[k] >= SHADOW_CAP) k += BREEDS.length;
      const c = cursor[k];
      writeInstance(bodies[k].instanceData, c * 20, yaw[i], pitch, s, x0, y, z0);
      const legData = legs[k].instanceData, lx = ((L.tw >> 1) - 1) * U;
      for (let n = 0; n < 4; n++) {
        const fore = n < 2, hx = n & 1 ? lx : -lx + U, hz = (fore ? L.front - 1.5 : L.back + 1.5) * U;
        const legPitch = pitch + (fore ? front : hind) + ((n === 0 || n === 3) ? swing : -swing);
        const wx = x0 + s * (cy * hx + sy * sp * hipY + sy * cp * hz);
        const wy = y + s * (cp * hipY - sp * hz);
        const wz = z0 + s * (-sy * hx + cy * sp * hipY + cy * cp * hz);
        writeInstance(legData, (c * 4 + n) * 20, yaw[i], legPitch, s, wx, wy, wz);
      }
      const happy = wagT[i] > 0 || st === KENNEL || st === EAT;
      const droop = st === NAP ? -0.9 : aloft ? 0.35 : hunger >= HUNGRY ? -0.7 : 0;
      const wag = Math.sin(elapsed * (happy ? 16 : 7) + i) * (st === NAP ? 0.05 : happy ? 0.55 : 0.25);
      const ty = (L.top - 0.5) * U, tz = (L.back - 0.5) * U;
      writeInstance(tails[k].instanceData, c * 20, yaw[i] + wag, pitch + droop, s,
        x0 + s * (sy * sp * ty + sy * cp * tz), y + s * (cp * ty - sp * tz), z0 + s * (cy * sp * ty + cy * cp * tz));
      cursor[k] = c + 1;
      if (i === own) {
        tag.geometry = tags[b]; tag.visible = true;
        tag.position.x = x0; tag.position.y = y; tag.position.z = z0;
        tag.rotation.x = pitch; tag.rotation.y = yaw[i];
        tag.scale.x = tag.scale.y = tag.scale.z = s;
        if (st === EAT && !mealQueued) {
          const drop = Math.min(1, (EAT_SECONDS - timer[i]) / FOOD_DROP_SECONDS);
          // Fall first, then disappear in small bites as the dog chews.
          const bite = Math.min(1, Math.ceil(timer[i] / 0.45) / 4);
          food.visible = true; food.position.y = foodY + 0.65 * (1 - drop * drop);
          food.scale.x = food.scale.y = food.scale.z = 0.45 * bite;
        }
      }
      // The pack follows its Ooga's equipment, lying along the back with its flame lit only in flight.
      if (i === own && owners[i].jet) {
        const top = (L.top + 1) * U, mid = (L.back + L.front) * U * 0.5, js = JET_SCALE * s;
        jet.visible = true; flame.visible = powered;
        jet.position.x = x0 + s * (sy * sp * top + sy * cp * mid);
        jet.position.y = y + s * (cp * top - sp * mid);
        jet.position.z = z0 + s * (cy * sp * top + cy * cp * mid);
        jet.rotation.x = pitch + Math.PI / 2; jet.rotation.y = yaw[i];
        jet.scale.x = jet.scale.y = jet.scale.z = js;
        flame.scale.y = 0.7 + Math.sin(elapsed * 40 + i) * 0.3;
      }
      const pick = dogPicks[drawnCount];
      pickOwners[drawnCount++].dog = i;
      // Reuse the drawn body's mesh and pose: a small fixed sphere misses the head and longer breeds.
      pick.geometry = bodies[b].geometry;
      pick.position.x = x0; pick.position.y = y; pick.position.z = z0;
      pick.rotation.x = pitch; pick.rotation.y = yaw[i];
      pick.scale.x = pick.scale.y = pick.scale.z = s;
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
      const fwdX = tx / tl, fwdY = ty / tl, fwdZ = tz / tl;
      frame++;
      cursor.fill(0);
      drawnCount = 0;
      food.visible = tag.visible = jet.visible = flame.visible = false;
      let straysDrawn = 0;
      for (let i = 0; i < DOG_CAP; i++) {
        drawnAt[i] = 0;
        if (state[i] === FREE || space[i] !== WITH && space[i] !== here) continue;
        const dx = px[i] - cam.x, dy = py[i] - cam.y, dz = pz[i] - cam.z, d2 = dx * dx + dy * dy + dz * dz;
        // A stray far from the camera thinks one frame in FAR_SLICES, with the time it missed.
        // The own dog's lag measures blocked flight instead, and must survive between updates.
        if (!held) {
          if (state[i] !== STRAY) think(i, dt, night);
          else if (d2 < think2) { think(i, dt, night); lag[i] = 0; }
          else if ((i + frame) % FAR_SLICES) lag[i] += dt;
          else { think(i, lag[i] + dt, night); lag[i] = 0; }
        }
        if (!shown(i) || d2 > reach * reach || dx * fwdX + dy * fwdY + dz * fwdZ < VIEW_CONE * Math.sqrt(d2) - 1.5) continue;
        if (state[i] === STRAY && straysDrawn++ >= cap) continue;
        drawnAt[i] = 1;
        draw(i, elapsed, state[i] !== STRAY || d2 < SHADOW_NEAR * SHADOW_NEAR, dt);
      }
      for (let k = drawnCount; k < picksShown; k++) dogPicks[k].visible = false;
      picksShown = drawnCount;
      for (let k = 0; k < bodies.length; k++) {
        const n = cursor[k];
        bodies[k].instanceCount = tails[k].instanceCount = n;
        legs[k].instanceCount = n * 4;
        bodies[k].visible = legs[k].visible = tails[k].visible = n > 0;
        if (!n) continue;
        bodies[k].instanceVersion++;
        legs[k].instanceVersion++;
        tails[k].instanceVersion++;
      }
      // Sparks under the jetpack, as under the Ooga's.
      if (flame.visible && (spark -= dt) <= 0) {
        spark = 0.08;
        fx.burst(jet.position.x - Math.sin(yaw[own]) * 0.12, jet.position.y, jet.position.z - Math.cos(yaw[own]) * 0.12, 1, JET_SPARKS, 0.8);
      }
      if (version) placePoops();
      const mx = cam.x - poopX, my = cam.y - poopY, mz = cam.z - poopZ;
      if (version || redraw || mx * mx + my * my + mz * mz > 4) drawPoops(POOP_DRAW[quality], POOPS_DRAWN[quality]);
      version = 0; redraw = false;
      if (here !== CHORA) return;
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
    };
    // A hungry dog's sign over its head: a small dark bubble with a red "!" beside an empty bowl.
    const drawOverlay = (ctx, project) => {
      if (own < 0 || state[own] !== SIT || !drawnAt[own]) return;
      const L = layouts[breedOf[own]], pos = project(px[own], py[own] + (L.headTop + 4) * U, pz[own]);
      if (!pos) return;
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
    };
    const dispose = () => {
      for (const node of batches) removeChild(root, node);
      removeChild(root, jet);
      removeChild(root, tag);
      removeChild(root, food);
      for (const node of dogPicks) removeTarget(node);
      for (const node of poopPicks) removeTarget(node);
      state.fill(FREE);
      owners.fill(null);
      entries.fill(null);
      tagged.fill(null);
      homeDog.fill(-1);
      strayCount = 0; own = -1;
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
      return { dogs, dogsWaiting: waiting, dogsHungry: hungry, dogsDrawn: drawnCount, strays: roaming, poops: poopCount, poopsDrawn: here === CHORA ? poopsDrawn : 0, flies: here === CHORA ? flies.instanceCount : 0, dogJet: jet.visible ? 1 : 0 };
    };
    const debug = {
      stats,
      hunger(value) {
        if (own < 0) return false;
        entries[own].hunger = Math.max(0, Math.min(1, value));
        return true;
      },
      // Has the own dog squat at once (out in the Chora it poops), as its own timer would.
      poop() {
        if (own < 0) return false;
        state[own] = SQUAT; timer[own] = 0.01;
        return true;
      },
      dog: () => own < 0 ? null : { slot: own, x: px[own], y: py[own], z: pz[own], yaw: yaw[own], state: STATE_NAMES[state[own]], hunger: entries[own].hunger, breed: BREEDS[breedOf[own]].id, name: entries[own].name, shown: !!drawnAt[own], jet: jet.visible, flame: flame.visible },
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
        if (own >= 0 || state[slot] !== STRAY || !crew.player) return false;
        mood[slot] = TAG; tagged[slot] = crew.player; timer[slot] = 8; wagT[slot] = 2;
        return true;
      },
      waiting() {
        const out = [];
        for (let i = 0; i < DOG_CAP; i++) if (state[i] === KENNEL) out.push({ slot: i, breed: BREEDS[breedOf[i]].id, x: px[i], y: py[i], z: pz[i] });
        return out;
      },
      // Which shadow set each breed's drawn dogs went to this frame: [casting, not casting] counts.
      shadows: () => BREEDS.map((b, k) => [cursor[k], cursor[k + BREEDS.length]]),
      poopAt: (k) => k < poopCount ? { x: poopAt[k * 3], y: poopAt[k * 3 + 1], z: poopAt[k * 3 + 2] } : null,
      scoop, feed: () => own >= 0 && feed(own), feedOwn,
      // Review pictures: hold every dog still and stand one where and how a picture wants it.
      hold(on) { held = !!on; },
      place(slot, x, z, heading) {
        px[slot] = x; pz[slot] = z; yaw[slot] = heading; speed[slot] = 0; py[slot] = floorOf(slot, py[slot]);
        return { x, y: py[slot], z };
      },
      get here() { return here; }
    };
    return { update, drawOverlay, adopt, setOwn, tap, feed, feedOwn, releaseOwn, scoop, writeStore, stats, dispose, debug, get own() { return own >= 0 ? entries[own] : null; }, get changes() { return changes; } };
  };
  BL.rescueDogs = { create, homesAcross, DOG_CAP, DRAWN_CAP, SHADOW_CAP, SHADOW_NEAR, POOP_CAP, FLY_PILES, FLY_SIDE, FLY_UP, STRAY_CAP, STRAY_TIER, DRAW, DRAWN, POOP_DRAW, POOPS_DRAWN, HOME_GAP, NEAR_HOMES, HUNGER_SECONDS, HUNGRY, STARVE_SECONDS, BREEDS, FACES, FACE_INK, CHORA, YARD, ROOM, hungerAfter, breedFor, nameFor };
})();
