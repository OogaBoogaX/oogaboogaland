// Free Puppies Rescue's dogs: puppies waiting in the yard inside the 10 o'clock cave (scene-rescue.js), and the dogs
// the visitor adopted for any Ooga, one each, which follow their Ooga there and out on the island (scene-hub.js). A
// dog follows its Ooga a step behind, grows hungry over scene time (`HUNGER_SECONDS` from full to empty), sits and
// whines once it passes `HUNGRY`, eats a banana from the pile when tapped, and while fed poops on the island on a
// jittered timer wherever it walks. Left empty for `STARVE_SECONDS` it walks back to the rescue and is up for adoption
// again. While its Ooga sleeps or is away it goes home through the rescue's door and naps out of sight. A puppy
// adopted in the yard for an Ooga out on the island trots out of the door to find it.
//
// Strays roam the island and the Mempool island whoever has adopted what: dogs nobody has taken in yet, each round a
// home the scene seeds (`strays.homes`), up to `STRAY_CAP` of them scaled by the quality tier as `critters.js` scales
// its own. A stray wanders a few metres from home, sniffs, sits, poops into the same ring of piles, sleeps at home by
// night and now and then trots beside an Ooga passing by for a stretch. A tap on one opens the adoption with that very
// dog chosen; adopted, it follows its Ooga like any other, and a newcomer takes its home `STRAY_RESPAWN` seconds later.
//
// Fixed capacity throughout: `DOG_CAP` slots in typed arrays and, per breed, one instanced batch each for the
// bodies, the legs (four instances a dog, swung about the hip) and the tails; poop is one batch of `POOP_CAP`
// cartoon swirls kept oldest first, so a full island loses its oldest pile, with two flies a pile in one more batch. The frame loop writes `instanceData` in place and
// allocates nothing. Adoptions, hunger and the poop live in `game.state.rescue` (validated in `game.load`).
// Pick targets are pre-made, one a dog and one a poop, and only shown while in use.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { fnv1a } = BL.math;
  // Every Ooga on a full roster (128 characters) plus the yard's waiting puppies and the island's strays.
  const DOG_CAP = 148;
  const POOP_CAP = 96;
  const HUNGER_SECONDS = 600, HUNGRY = 0.7, STARVE_SECONDS = 90;
  // Seconds between two poops of a fed dog, jittered by a throwaway roll.
  const POOP_MIN = 120, POOP_SPAN = 120;
  const EAT_SECONDS = 2.6, SQUAT_SECONDS = 1.4, RESTOCK_SECONDS = 4;
  // A dog left further behind than TELEPORT (its Ooga came out of a cave, or flew off) turns up at its side.
  const WALK = 2.2, RUN = 4.6, TELEPORT = 8;
  const SAVE_EVERY = 15;
  const FREE = 0, KENNEL = 1, FOLLOW = 2, SIT = 3, EAT = 4, SQUAT = 5, NAP = 6, HOME = 7, OUT = 8, STRAY = 9;
  const STATE_NAMES = ["free", "kennel", "follow", "sit", "eat", "poop", "sleep", "home", "out", "stray"];
  // Strays: at most STRAY_CAP, that many on the high tier, half on medium and a quarter on low. One roams up to
  // STRAY_ROAM from home, never further than STRAY_LEASH while it tags along beside an Ooga within STRAY_NEAR of it.
  const STRAY_CAP = 12, STRAY_RESPAWN = 45, STRAY_ROAM = 3.5, STRAY_NEAR = 5, STRAY_LEASH = 16;
  const STRAY_SHARE = { high: 1, medium: 0.5, low: 0.25 };
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

  const geometryOf = (() => {
    const cache = new Map();
    return (breed, part) => {
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
    return voxelGeometry(v, { unit: 0.032, palette: POOP_INK, origin: { x: 0, y: 0, z: 0 } });
  };
  const flyGeometry = (() => {
    let geo = null;
    return () => geo || (geo = BL.models.merge(
      BL.models.box({ w: 0.028, h: 0.024, d: 0.036, color: "#1d1b1a" }),
      BL.models.box({ w: 0.05, h: 0.006, d: 0.022, color: "#dfe8f0", offset: { y: 0.016 } })));
  })();

  // One instance: rotation Ry(yaw) Rx(pitch), uniformly scaled by s, at (x, y, z).
  const writeInstance = (data, o, yaw, pitch, s, x, y, z) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    data[o] = cy * s; data[o + 1] = 0; data[o + 2] = -sy * s; data[o + 3] = 0;
    data[o + 4] = sy * sp * s; data[o + 5] = cp * s; data[o + 6] = cy * sp * s; data[o + 7] = 0;
    data[o + 8] = sy * cp * s; data[o + 9] = -sp * s; data[o + 10] = cy * cp * s; data[o + 11] = 0;
    data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 15] = 1;
    data[o + 16] = 0; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
  };

  // `yard` is the rescue's: its middle, the spots puppies wait on (none on the island) and its door, where a dog going
  // home leaves and a napping one lies out of sight. `island` says the dogs are out on the island, where they poop;
  // `total` is how many Oogas the island's goal counts. `strays` (the island's alone) holds the strays' `homes` (x, y,
  // z each, in the order they are taken), the `renderer` whose tier sets how many roam, and `clearAt(x, y, z)`, whether
  // a dog may stand there.
  const create = ({ root, game, crew, pile, fx, hud, yard, island, total, groundAt, addTarget, pickGeometry, strays = null }) => {
    const { createNode, addChild, removeChild, updateWorld } = BL.scene;
    const rescue = game.state.rescue;
    const batch = (geometry, cap) => createNode({ geometry, instanceData: new Float32Array(cap * 20), instanceCount: 0, instanceVersion: 0, visible: false, fixedInstanceCapacity: true });
    const bodies = BREEDS.map((b, i) => batch(geometryOf(i, "body"), DOG_CAP));
    const legs = BREEDS.map((b, i) => batch(geometryOf(i, "leg"), DOG_CAP * 4));
    const tails = BREEDS.map((b, i) => batch(geometryOf(i, "tail"), DOG_CAP));
    const poops = batch(geometryOf(0, "poop"), POOP_CAP), flies = batch(flyGeometry(), POOP_CAP * 2);
    for (const node of [...bodies, ...legs, ...tails, poops, flies]) addChild(root, node);
    const layouts = BREEDS.map(layoutOf);
    const DUST = [BL.models.particleGeometry("#8a5a32", 0.06, 0), BL.models.particleGeometry("#c9b28a", 0.05, 0)];
    const HEARTS = [BL.models.particleGeometry("#ff6b8a", 0.07, 0.8), BL.models.particleGeometry("#ffd0dc", 0.05, 0.8)];
    const STINK = [BL.models.particleGeometry("#9ccc4a", 0.07, 0.4), BL.models.particleGeometry("#6d8a3a", 0.06, 0.2)];
    const state = new Uint8Array(DOG_CAP), breedOf = new Uint8Array(DOG_CAP);
    const px = new Float32Array(DOG_CAP), py = new Float32Array(DOG_CAP), pz = new Float32Array(DOG_CAP);
    const yaw = new Float32Array(DOG_CAP), speed = new Float32Array(DOG_CAP), phase = new Float32Array(DOG_CAP);
    const timer = new Float32Array(DOG_CAP), poopTimer = new Float32Array(DOG_CAP), starve = new Float32Array(DOG_CAP);
    const grow = new Float32Array(DOG_CAP), side = new Float32Array(DOG_CAP), wagT = new Float32Array(DOG_CAP);
    const goalX = new Float32Array(DOG_CAP), goalZ = new Float32Array(DOG_CAP), spotOf = new Int16Array(DOG_CAP).fill(-1);
    const owners = new Array(DOG_CAP).fill(null), entries = new Array(DOG_CAP).fill(null);
    const restock = new Float32Array(yard.spots.length / 3).fill(-1);
    const poopAt = new Float32Array(POOP_CAP * 3), flyPhase = new Float32Array(POOP_CAP);
    const indoors = new Uint8Array(DOG_CAP);
    const mood = new Uint8Array(DOG_CAP), homeOf = new Int16Array(DOG_CAP).fill(-1), look = new Float32Array(DOG_CAP), tagged = new Array(DOG_CAP).fill(null);
    let poopCount = 0, saveTimer = 0, stepCooldown = 0, version = 0, held = false;
    let strayCount = 0, strayDue = STRAY_RESPAWN, strayBorn = 0, homeNext = 0;
    const cursor = new Int32Array(BREEDS.length);
    // Pick targets, made once a visit: one a dog, one a poop, each shown only while its slot is in use.
    const dogPicks = [], poopPicks = [];
    for (let i = 0; i < DOG_CAP; i++) {
      const node = createNode({ geometry: pickGeometry, visible: false });
      addTarget(node, { kind: "dog", dog: i, weaponType: "none" }, { radius: 0.36 });
      dogPicks.push(node);
    }
    // Poop is the island's only: the rescue's yard needs no poop targets.
    for (let i = 0; i < (island ? POOP_CAP : 0); i++) {
      const node = createNode({ geometry: pickGeometry, visible: false });
      addTarget(node, { kind: "poop", poop: i, weaponType: "none" }, { radius: 0.22 });
      poopPicks.push(node);
    }
    const ground = (i, fallback) => {
      const y = groundAt(px[i], pz[i], py[i]);
      return y > -100 ? y : fallback;
    };
    const place = (i, x, z, heading, fallbackY) => {
      px[i] = x; pz[i] = z; yaw[i] = heading; speed[i] = 0; py[i] = fallbackY;
      py[i] = ground(i, fallbackY);
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
      state[i] = KENNEL; breedOf[i] = k % BREEDS.length; spotOf[i] = k; grow[i] = 0; owners[i] = entries[i] = null; indoors[i] = 0;
      place(i, spot(k, 0), spot(k, 1), spot(k, 2), yard.y);
      goalX[i] = px[i]; goalZ[i] = pz[i]; timer[i] = 1 + Math.random() * 3; side[i] = 0;
      return i;
    };
    // Napping dogs lie round the yard on a sunflower spiral, slot by slot; on the island they nap behind its door.
    const bedOf = (i, axis) => {
      if (island) return yard.door[axis];
      const a = i * 2.39996, r = yard.bedRadius + 0.42 * Math.sqrt(i);
      return axis ? yard.z + Math.sin(a) * r : yard.x + Math.cos(a) * r;
    };
    // The driven Ooga is always awake, whatever its contributor's activity says.
    const awake = (cave) => cave === crew.player || cave.root.visible && crew.stateOf(cave) !== "sleeping" && crew.stateOf(cave) !== "away";
    const adoptInto = (i, cave, entry) => {
      if (state[i] === STRAY) strayCount--;
      homeOf[i] = -1; tagged[i] = null;
      state[i] = awake(cave) ? FOLLOW : NAP; owners[i] = cave; entries[i] = entry; spotOf[i] = -1; indoors[i] = 0;
      breedOf[i] = entry.breed; side[i] = fnv1a(entry.owner) & 1 ? 0.55 : -0.55;
      poopTimer[i] = POOP_MIN * 0.5 + Math.random() * POOP_SPAN; starve[i] = 0; grow[i] = 1;
    };
    // The visit's dogs: every saved adoption whose Ooga is on the island, then a puppy on each yard spot.
    for (const entry of rescue.dogs) {
      const cave = crew.cavemen.get(entry.owner);
      const i = cave ? freeSlot() : -1;
      if (i < 0) continue;
      adoptInto(i, cave, entry);
      if (state[i] === NAP) {
        place(i, bedOf(i, 0), bedOf(i, 1), Math.random() * 6.28, yard.y);
        if (island) indoors[i] = 1;
      }
      else {
        const p = cave.root.position, h = cave.root.rotation.y;
        place(i, p.x - Math.sin(h) * 0.9 + Math.cos(h) * side[i], p.z - Math.cos(h) * 0.9 - Math.sin(h) * side[i], h, p.y - cave.baseY);
      }
    }
    for (let k = 0; k < restock.length; k++) {
      const i = stock(k);
      if (i >= 0) grow[i] = 1;
    }
    // A stray at the next free home in turn, of the next breed in turn, so every breed roams; a newcomer pops in as it
    // grows.
    const homes = strays ? strays.homes : null, homeCount = homes ? homes.length / 3 : 0;
    const homeTaken = (h) => {
      for (let j = 0; j < DOG_CAP; j++) if (state[j] === STRAY && homeOf[j] === h) return true;
      return false;
    };
    const strayIn = (grown) => {
      const i = freeSlot();
      if (i < 0) return -1;
      for (let n = 0; n < homeCount && homeTaken(homeNext); n++) homeNext = (homeNext + 1) % homeCount;
      const h = homeNext;
      homeNext = (homeNext + 1) % homeCount;
      state[i] = STRAY; mood[i] = REST; homeOf[i] = h; breedOf[i] = strayBorn++ % BREEDS.length; tagged[i] = null;
      owners[i] = entries[i] = null; spotOf[i] = -1; indoors[i] = 0; grow[i] = grown ? 1 : 0; wagT[i] = 0;
      place(i, homes[h * 3], homes[h * 3 + 2], (h * 2.39996) % 6.28, homes[h * 3 + 1]);
      side[i] = h & 1 ? 0.6 : -0.6; timer[i] = 1 + Math.random() * 3; look[i] = Math.random() * 3;
      poopTimer[i] = POOP_MIN + Math.random() * POOP_SPAN;
      strayCount++;
      return i;
    };
    const strayWanted = () => strays ? Math.round(STRAY_CAP * STRAY_SHARE[strays.renderer.quality]) : 0;
    for (let n = strayWanted(); strayCount < n && strayIn(true) >= 0;);
    const loadPoops = () => {
      poopCount = Math.min(POOP_CAP, rescue.poops.length / 3);
      poopAt.set(rescue.poops.slice(0, poopCount * 3));
      for (let k = 0; k < POOP_CAP; k++) flyPhase[k] = Math.random() * 6.28;
      version++;
    };
    if (island) loadPoops();
    const writePoops = () => {
      const data = poops.instanceData;
      for (let k = 0; k < poopCount; k++) {
        const x = poopAt[k * 3], y = poopAt[k * 3 + 1], z = poopAt[k * 3 + 2];
        writeInstance(data, k * 20, fnv1a(`${Math.round(x * 50)}/${Math.round(z * 50)}`) % 7, 0, 1, x, y, z);
        const node = poopPicks[k];
        node.position.x = x; node.position.y = y + 0.08; node.position.z = z;
        node.visible = true;
        updateWorld(node);
      }
      for (let k = poopCount; k < POOP_CAP; k++) poopPicks[k].visible = false;
      poops.instanceCount = poopCount;
      poops.visible = poopCount > 0;
      poops.instanceVersion++;
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
      refreshGoal();
      version++;
      return true;
    };
    const nameOf = (i) => entries[i] ? entries[i].name : BREEDS[breedOf[i]].name;
    // Feeding takes one banana from the shared pile; a full dog only wags.
    const feed = (i) => {
      if (!entries[i]) return false;
      const e = entries[i];
      if (e.hunger < 0.15) {
        wagT[i] = 2;
        hud.toast(`${e.name} is full. Woof!`);
        return false;
      }
      if (!pile.eatFromPile(owners[i])) {
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
    const hungriest = () => {
      let best = -1;
      for (let i = 0; i < DOG_CAP; i++) if (entries[i] && (state[i] === FOLLOW || state[i] === SIT) && (best < 0 || entries[i].hunger > entries[best].hunger)) best = i;
      return best;
    };
    const feedHungriest = () => {
      const i = hungriest();
      if (i < 0 || entries[i].hunger < 0.15) {
        hud.toast("Every dog on the island is full.");
        return false;
      }
      return feed(i);
    };
    // A waiting puppy or a stray answers with its breed, for the adoption dialog; an adopted dog is fed.
    const tap = (i) => {
      if (state[i] === KENNEL || state[i] === STRAY) return breedOf[i];
      if (owners[i]) feed(i);
      return -1;
    };
    // Adopts a waiting puppy of `breed` for the Ooga named `owner`: null if that Ooga already has a dog. In the rescue
    // an Ooga out on the island gets its puppy too: it trots out of the door to find it. On the island `stray` is the
    // stray the adoption was opened on, taken in when it is still out there and of the breed chosen.
    const adopt = (owner, breed, name, stray = -1) => {
      const cave = crew.cavemen.get(owner) || null;
      if (!cave && island) return null;
      const entry = game.adoptDog(owner, name, breed);
      if (!entry) return null;
      let i = stray >= 0 && state[stray] === STRAY && breedOf[stray] === breed ? stray : -1;
      if (i < 0) for (let k = 0; k < DOG_CAP; k++) if (state[k] === KENNEL && breedOf[k] === breed) { i = k; break; }
      if (i >= 0 && spotOf[i] >= 0) restock[spotOf[i]] = RESTOCK_SECONDS;
      if (i < 0) {
        i = freeSlot();
        if (i < 0) return null;
        place(i, yard.x, yard.z, 0, yard.y);
      }
      if (cave) adoptInto(i, cave, entry);
      else {
        state[i] = OUT; entries[i] = entry; owners[i] = null; spotOf[i] = -1; breedOf[i] = entry.breed;
        goalX[i] = yard.door[0]; goalZ[i] = yard.door[1];
      }
      grow[i] = 1;
      fx.burst(px[i], py[i] + 0.5, pz[i], 10, HEARTS, 1.6);
      refreshGoal();
      return entry;
    };
    // The dog walks home to the yard and becomes a waiting puppy again, or leaves if the yard is full.
    const giveUp = (i) => {
      game.releaseDog(entries[i].owner);
      hud.toast(`${entries[i].name} was hungry too long and went back to Free Puppies Rescue.`);
      owners[i] = entries[i] = null;
      state[i] = HOME;
      goalX[i] = island ? yard.door[0] : yard.x; goalZ[i] = island ? yard.door[1] : yard.z;
      refreshGoal();
    };
    // The island's goal counts every adoption, wherever its dog is.
    const have = () => rescue.dogs.length;
    const hasDog = (owner) => rescue.dogs.some((d) => d.owner === owner);
    const refreshGoal = () => hud.setDogGoal(have(), total, rescue.scooped);
    // Steers slot i toward (tx, tz) at up to `top` m/s; true once it stands there. Further off than `jump` it is there
    // at once.
    const steer = (i, tx, tz, top, dt, fallbackY, jump = TELEPORT) => {
      const dx = tx - px[i], dz = tz - pz[i], d = Math.hypot(dx, dz);
      if (d > jump) {
        px[i] = tx; pz[i] = tz; py[i] = fallbackY; speed[i] = 0;
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
        px[i] += Math.sin(yaw[i]) * speed[i] * dt;
        pz[i] += Math.cos(yaw[i]) * speed[i] * dt;
        py[i] = ground(i, fallbackY);
        phase[i] += speed[i] * dt * 11;
      }
      return d < 0.25;
    };
    const face = (i, heading, dt) => {
      let turn = heading - yaw[i];
      turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
      yaw[i] += turn * Math.min(1, dt * 3);
    };
    // An awake Ooga near enough to stray i and on its level, the nearest; null for none.
    const passerBy = (i) => {
      let best = null, bestD = STRAY_NEAR * STRAY_NEAR;
      for (const cave of crew.list) {
        if (!awake(cave)) continue;
        const p = cave.root.position, dx = p.x - px[i], dz = p.z - pz[i], d = dx * dx + dz * dz;
        if (d < bestD && Math.abs(p.y - cave.baseY - py[i]) < 1) { best = cave; bestD = d; }
      }
      return best;
    };
    // A stray's next thing: a walk to a clear spot near home on its own level, else a sniff where it stands.
    const strayNext = (i) => {
      const h = homeOf[i], hy = homes[h * 3 + 1], a = Math.random() * 6.28, r = 1 + Math.random() * (STRAY_ROAM - 1);
      const gx = homes[h * 3] + Math.cos(a) * r, gz = homes[h * 3 + 2] + Math.sin(a) * r, gy = groundAt(gx, gz, hy);
      if (gy > -100 && Math.abs(gy - hy) < 0.8 && strays.clearAt(gx, gy, gz)) { mood[i] = ROAM; goalX[i] = gx; goalZ[i] = gz; }
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
        poopTimer[i] = POOP_MIN * 1.5 + Math.random() * POOP_SPAN;
        return;
      }
      // By night it goes home and sleeps there, curled up in the open; it wakes with the day.
      if (night) {
        if (m !== DOZE) { mood[i] = DOZE; tagged[i] = null; }
        if (steer(i, hx, hz, WALK * 0.6, dt, hy, Infinity)) speed[i] = 0;
        return;
      }
      if (m === DOZE) { mood[i] = REST; timer[i] = 1 + Math.random() * 2; }
      if (m === TAG) {
        const cave = tagged[i], p = cave.root.position;
        if ((timer[i] -= dt) > 0 && awake(cave) && Math.hypot(px[i] - hx, pz[i] - hz) < STRAY_LEASH) {
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
      // An Ooga passing by now and then takes it along for a stretch.
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
        if (steer(i, goalX[i], goalZ[i], RUN, dt, yard.y, Infinity)) { state[i] = FREE; entries[i] = null; }
        return;
      }
      if (s === HOME) {
        if (steer(i, goalX[i], goalZ[i], WALK, dt, yard.y)) {
          for (let k = 0; k < restock.length; k++) {
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
      const p = cave.root.position, feet = p.y - cave.baseY;
      if (!awake(cave)) {
        if (s !== NAP) state[i] = NAP;
        if (!steer(i, bedOf(i, 0), bedOf(i, 1), WALK, dt, yard.y)) return;
        speed[i] = 0;
        // On the island the bed is behind the rescue's door: the dog naps out of sight.
        if (island) indoors[i] = 1;
        return;
      }
      if (s === NAP) { state[i] = FOLLOW; indoors[i] = 0; }
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
          dropPoop(px[i] - Math.sin(yaw[i]) * back, py[i], pz[i] - Math.cos(yaw[i]) * back);
          state[i] = FOLLOW;
          poopTimer[i] = POOP_MIN + Math.random() * POOP_SPAN;
        }
        return;
      }
      if (e.hunger >= HUNGRY) {
        if (state[i] !== SIT) { state[i] = SIT; timer[i] = 0; }
        speed[i] *= Math.max(0, 1 - dt * 8);
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
      if (island && (poopTimer[i] -= dt) <= 0 && speed[i] < 0.6) {
        state[i] = SQUAT; timer[i] = SQUAT_SECONDS;
      }
    };
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
      const pick = dogPicks[i];
      pick.position.x = x0; pick.position.y = y + 0.3 * s; pick.position.z = z0;
      pick.visible = true;
      updateWorld(pick);
    };
    // `day` is the hub's daylight, 1 at noon: the strays sleep while it is low.
    const update = (dt, elapsed, day = 1) => {
      for (let k = 0; k < restock.length; k++) if (restock[k] >= 0 && (restock[k] -= dt) < 0) stock(k);
      // The strays settle on the tier's number: one newcomer every STRAY_RESPAWN seconds while short, the last one gone
      // at once when the tier drops.
      if (strays) {
        const wanted = strayWanted();
        if (strayCount >= wanted) strayDue = STRAY_RESPAWN;
        else if ((strayDue -= dt) <= 0) {
          strayIn(false);
          strayDue = STRAY_RESPAWN;
        }
        if (strayCount > wanted) for (let i = DOG_CAP - 1; i >= 0; i--) if (state[i] === STRAY) {
          state[i] = FREE; tagged[i] = null; strayCount--;
          break;
        }
      }
      const night = day < 0.2;
      cursor.fill(0);
      for (let i = 0; i < DOG_CAP; i++) {
        if (state[i] === FREE) {
          if (dogPicks[i].visible) dogPicks[i].visible = false;
          continue;
        }
        if (!held) think(i, dt, night);
        if (state[i] === FREE) continue;
        if (indoors[i]) {
          if (dogPicks[i].visible) dogPicks[i].visible = false;
          continue;
        }
        draw(i, elapsed);
      }
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
      if (version) {
        version = 0;
        writePoops();
      }
      const flyData = flies.instanceData;
      for (let k = 0; k < poopCount; k++) for (let f = 0; f < 2; f++) {
        const t = elapsed * (2.4 + f * 1.3) + flyPhase[k] + f * 3.1, r = 0.14 + f * 0.06;
        writeInstance(flyData, (k * 2 + f) * 20, -t * (f ? 1 : -1), 0, 1, poopAt[k * 3] + Math.cos(t) * r, poopAt[k * 3 + 1] + 0.2 + Math.sin(t * 2.3) * 0.05 + f * 0.06, poopAt[k * 3 + 2] + Math.sin(t) * r);
      }
      flies.instanceCount = poopCount * 2;
      flies.visible = poopCount > 0;
      flies.instanceVersion++;
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
      if ((saveTimer += dt) >= SAVE_EVERY) {
        saveTimer = 0;
        game.saveRescue();
      }
    };
    // A hungry dog's sign over its head: a small dark bubble with a red "!" beside an empty bowl.
    const drawOverlay = (ctx, project) => {
      for (let i = 0; i < DOG_CAP; i++) {
        if (state[i] !== SIT) continue;
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
    const tooltip = (i) => {
      if (state[i] === KENNEL) return `${BREEDS[breedOf[i]].name} puppy · tap to adopt`;
      if (state[i] === STRAY) return `Stray ${BREEDS[breedOf[i]].name} · ${mood[i] === DOZE ? "asleep" : "tap to adopt"}`;
      if (state[i] === OUT) return `${entries[i].name} · off to find ${entries[i].owner} on the island`;
      if (state[i] === HOME || !entries[i]) return "Going back to the rescue";
      const e = entries[i], owner = owners[i].traits.display;
      if (state[i] === NAP) return `${e.name} · ${owner}'s dog · napping`;
      return `${e.name} · ${owner}'s dog · ${e.hunger >= HUNGRY ? "hungry! tap to feed" : e.hunger < 0.15 ? "full" : "tap to feed"}`;
    };
    const dispose = () => {
      game.saveRescue();
      for (const node of [...bodies, ...legs, ...tails, poops, flies]) removeChild(root, node);
      state.fill(FREE);
      owners.fill(null);
      entries.fill(null);
      tagged.fill(null);
      strayCount = 0;
      dogPicks.length = poopPicks.length = 0;
      poopCount = 0;
    };
    const stats = () => {
      let dogs = 0, waiting = 0, hungry = 0, napping = 0, roaming = 0;
      for (let i = 0; i < DOG_CAP; i++) {
        if (state[i] === FREE) continue;
        dogs++;
        if (state[i] === KENNEL) waiting++;
        if (state[i] === STRAY) roaming++;
        if (state[i] === SIT) hungry++;
        if (state[i] === NAP) napping++;
      }
      return { dogs, dogsWaiting: waiting, dogsHungry: hungry, dogsNapping: napping, strays: roaming, poops: poopCount, flies: flies.instanceCount };
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
      poop(n = 1) {
        for (let k = 0; k < n; k++) {
          let i = -1;
          for (let j = 0; j < DOG_CAP; j++) if (entries[j] && state[j] !== NAP) { i = j; break; }
          const a = Math.random() * 6.28, r = 3 + Math.random() * 9;
          if (i >= 0 && k === 0) { state[i] = SQUAT; timer[i] = 0.01; continue; }
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          dropPoop(x, groundAt(x, z, 2), z);
        }
        return poopCount;
      },
      state: (owner) => STATE_NAMES[state[slotOf(owner)]] || null,
      dog(owner) {
        const i = slotOf(owner);
        return i < 0 ? null : { x: px[i], y: py[i], z: pz[i], yaw: yaw[i], state: STATE_NAMES[state[i]], hunger: entries[i].hunger, breed: BREEDS[breedOf[i]].id, name: entries[i].name };
      },
      // The strays out now: slot, breed, what each is up to, where, and its home.
      strays() {
        const out = [];
        for (let i = 0; i < DOG_CAP; i++) if (state[i] === STRAY) {
          const h = homeOf[i];
          out.push({ slot: i, breed: BREEDS[breedOf[i]].id, mood: MOOD_NAMES[mood[i]], with: tagged[i] ? tagged[i].traits.name : null, x: px[i], y: py[i], z: pz[i], home: [homes[h * 3], homes[h * 3 + 1], homes[h * 3 + 2]] });
        }
        return out;
      },
      // Has stray `slot` squat at its next chance, as its own timer would.
      strayPoop(slot) {
        if (state[slot] !== STRAY) return false;
        poopTimer[slot] = 0;
        return true;
      },
      // Sends stray `slot` along with the Ooga named `owner` at once, as a passer-by would take it.
      tag(slot, owner) {
        const cave = crew.cavemen.get(owner);
        if (state[slot] !== STRAY || !cave) return false;
        mood[slot] = TAG; tagged[slot] = cave; timer[slot] = 8; wagT[slot] = 2;
        return true;
      },
      waiting() {
        const out = [];
        for (let i = 0; i < DOG_CAP; i++) if (state[i] === KENNEL) out.push({ slot: i, breed: BREEDS[breedOf[i]].id, x: px[i], y: py[i], z: pz[i] });
        return out;
      },
      poopAt: (k) => k < poopCount ? { x: poopAt[k * 3], y: poopAt[k * 3 + 1], z: poopAt[k * 3 + 2] } : null,
      scoop, feed: (owner) => feed(slotOf(owner)), feedHungriest,
      // Review pictures: hold every dog still, stand one where and how a picture wants it, and take every stray home
      // the tier allows at once.
      hold(on) { held = !!on; },
      strayFill() {
        for (let n = strayWanted(); strayCount < n && strayIn(true) >= 0;);
        return strayCount;
      },
      place(slot, x, z, heading, pose = null) {
        px[slot] = x; pz[slot] = z; yaw[slot] = heading; speed[slot] = 0; py[slot] = groundAt(x, z, 2);
        if (pose) state[slot] = STATE_NAMES.indexOf(pose);
        return { x, y: py[slot], z };
      }
    };
    refreshGoal();
    return { update, drawOverlay, adopt, tap, feed, feedHungriest, scoop, tooltip, have, hasDog, stats, dispose, debug };
  };
  BL.dogs = { create, DOG_CAP, POOP_CAP, STRAY_CAP, STRAY_SHARE, HUNGER_SECONDS, HUNGRY, STARVE_SECONDS, BREEDS, FACES, FACE_INK, hungerAfter, breedFor, nameFor };
})();
