// Kortik's Sis, the Lightning Jet Hangar's chief engineer, after her concept: her rig and her hammer. Geometry only;
// sis.js runs her. She is Kortik's sister and is built as he is (kortik-models.js): in voxels a little under five
// centimetres across, about twice the caveman's detail, a big head on a sturdy body, arms jointed at the elbow and legs
// at the knee, each part in its own frame with the body facing +z. She has his heavy slanting brows and broad nose,
// and her own everything else: the yellow hard hat with big blue goggles on its brim (or down over her eyes when it
// gets serious), messy long brown hair, blue Lightning overalls open over a white shirt with the bolt on her chest,
// sleeves and cuffs rolled, big leather gloves, heavy laced boots, the utility belt with its bolt buckle, a pouch and
// her tools, and an absurdly oversized hammer bearing the bolt. `NAME` is a name no login can have, so nothing ever
// counts her as a contributor.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models;
  const { box, bevelBox, merge, cached, makeVox, voxelGeometry, turn, shaded, prism, moved, turnedY, turnedZ, torus, noShadow } = M;
  const { createNode, addChild } = BL.scene;

  const NAME = "sis/hangar";
  const U = 0.042;
  const C = {
    skin: 0, skinDk: 1, skinLt: 2, hair: 3, hairDk: 4, hairLt: 5, blue: 6, blueDk: 7, blueLt: 8, shirt: 9, shirtDk: 10,
    hat: 11, hatDk: 12, hatLt: 13, black: 14, white: 15, lens: 16, frame: 17, frameDk: 18, glove: 19, gloveDk: 20,
    boot: 21, bootDk: 22, gold: 23, mouth: 24, throat: 25, red: 26, steel: 27, cuff: 28, brow: 29, belt: 30, beltDk: 31, iris: 32, eye: 33
  };
  // Kortik's skin, for the family face.
  const PALETTE = ["#d4945a", "#b0703c", "#e6ad78", "#6b3a1f", "#4a2614", "#8a5230", "#2f62bd", "#22488f", "#4479d6", "#e4e2dc", "#b9b6ae",
    "#f2b51c", "#c48a10", "#ffd34a", "#141212", "#f4f0e6", "#5ab8ff", "#8d939b", "#55595f", "#6a4024", "#47291a",
    "#3a2416", "#24150d", "#e8b23a", "#8a2e22", "#2a0c08", "#c8321e", "#9aa3ad", "#c9ccd1", "#3a2214", "#5c3a20", "#3e2614", "#4a2a14", "#ffffff"];
  // The whites of her eyes glow a little, so they read under the brim's shadow.
  const EMISSIVE = { [C.eye]: 0.25 };
  // Furious, her face goes red: the same cells under a palette with the skin flushed, as her brother's does.
  const FLUSHED = PALETTE.slice();
  FLUSHED[C.skin] = "#e2664c"; FLUSHED[C.skinDk] = "#b8412c"; FLUSHED[C.skinLt] = "#f08a6c";
  // A cell's own small variation, hashed from where it is, never drawn from a random stream.
  const hv = (x, y, z) => ((Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 9;
  const skin = (x, y, z) => (hv(x, y, z) === 0 ? C.skinDk : C.skin);
  const hair = (x, y, z) => { const r = hv(x, y, z); return r < 2 ? C.hairDk : r === 8 ? C.hairLt : C.hair; };
  // The overalls' cloth: seams running down it and a little wear.
  const cloth = (x, y, z) => (x % 5 === 2 ? C.blueDk : hv(x, y, z) === 0 ? C.blueLt : C.blue);
  const hat = (x, y, z) => (hv(x, y, z) === 0 ? C.hatLt : C.hat);
  const vg = (v, ox, oy, oz, palette = PALETTE) => voxelGeometry(v, { unit: U, palette, emissive: EMISSIVE, origin: { x: ox * U, y: oy * U, z: oz * U } });

  // The goggles: two round lenses in their frames and the bridge between, their glass bulging, centred on row `y`.
  const goggles = (v, y, z) => {
    for (const x0 of [1, 8]) {
      v.fill(x0, x0 + 4, y - 2, y + 2, z, z + 1, C.frame);
      for (const [dx, dy] of [[0, -2], [4, -2], [0, 2], [4, 2]]) v.del(x0 + dx, y + dy, z + 1);
      v.fill(x0 + 1, x0 + 3, y - 1, y + 1, z + 2, z + 2, C.lens);
      v.set(x0 + 1, y + 1, z + 2, C.white);
      v.fill(x0, x0 + 4, y - 2, y - 2, z, z, C.frameDk);
    }
    v.fill(6, 7, y - 1, y, z, z, C.frameDk);
  };
  // The head, fourteen cells across, its base on the neck and its face toward +z: Kortik's heavy brows slanting down to
  // a scowl, on her own face, its jaw softer, big eyes glaring in under lashes, a small nose and a frown; messy brown
  // hair falling round it to her shoulders, a fringe under the brim and locks down in front; the hard hat, its ridge,
  // its brim's peak and the goggles' strap round it. `closed` draws the blink, `talk` her mouth open yelling, and
  // `down` the goggles over her eyes instead of on the brim.
  const headVox = (closed, talk, down) => {
    const v = makeVox();
    v.fill(1, 12, 0, 10, 1, 11, skin);
    v.fill(2, 11, 0, 9, 12, 12, C.skin);
    for (const x of [1, 12]) for (let y = 0; y <= 1; y++) for (let z = 1; z <= 11; z++) v.del(x, y, z);
    for (const x of [2, 11]) v.del(x, 0, 12);
    for (const x of [0, 13]) { v.fill(x, x, 4, 6, 5, 7, C.skin); v.set(x, 5, 6, C.skinDk); }
    // Hair: the back of the head in two layers, the sides over the ears, falling below the jaw to her shoulders with
    // loose strands standing off it, locks down in front of her ears, and the fringe under the brim.
    v.fill(0, 13, 0, 11, 0, 0, hair);
    v.fill(1, 12, 1, 11, -1, -1, hair);
    for (let y = -5; y <= 11; y++) for (let z = -1; z <= 10; z++) {
      const low = y < 1 ? (y + 6) / 7 : 1;
      for (const [x, out] of [[0, -1], [13, 14]]) {
        if (y >= 0 || hv(x, y, z) < 7 * low) v.set(x, y, z, hair(x, y, z));
        if (hv(out, y, z) < 4 * low) v.set(out, y, z, hair(out, y, z));
      }
    }
    for (const [x0, x1] of [[0, 1], [12, 13]]) for (let y = -4; y <= 9; y++) for (let x = x0; x <= x1; x++) {
      if (y > 2 && (x === 1 || x === 12)) continue;
      if (y >= -1 || hv(x, y, 11) < 6) v.set(x, y, 11, hair(x, y, 11));
    }
    for (let x = 1; x <= 12; x++) {
      v.set(x, 10, 12, hair(x, 10, 12));
      v.set(x, 10, 13, hair(x, 10, 13));
      if (hv(x, 9, 13) < 4 && (x < 5 || x > 8)) v.set(x, 9, 13, hair(x, 9, 13));
    }
    // The hard hat: its shell over the crown, the ridge along it, the brim all round and its peak over the face.
    v.fill(0, 13, 11, 12, -1, 12, hat);
    v.fill(-1, 14, 11, 11, -2, 13, hat);
    v.fill(1, 12, 11, 11, 14, 14, hat);
    v.fill(1, 12, 13, 14, 0, 11, hat);
    v.fill(2, 11, 15, 15, 1, 10, hat);
    v.fill(4, 9, 16, 16, 3, 8, C.hatLt);
    v.fill(6, 7, 12, 17, -1, 11, C.hatDk);
    v.fill(-1, 14, 11, 11, -2, -2, C.hatDk);
    // The goggles' strap round the shell, and the goggles on the brim, or down over her eyes on their strap.
    if (!down) {
      for (let x = 0; x <= 13; x++) v.set(x, 12, -2, C.black);
      for (let z = -1; z <= 12; z++) { v.set(-1, 12, z, C.black); v.set(14, 12, z, C.black); }
      goggles(v, 14, 12);
    }
    // Brows, his: thick, standing proud of the face and slanting down to the crease between them.
    v.fill(2, 3, 9, 9, 13, 13, C.brow);
    v.fill(3, 5, 8, 8, 13, 13, C.brow);
    v.fill(10, 11, 9, 9, 13, 13, C.brow);
    v.fill(8, 10, 8, 8, 13, 13, C.brow);
    v.fill(6, 7, 8, 8, 12, 12, C.skinDk);
    // Big eyes glaring in, four cells across: the whites, a brown iris toward the nose with its glint, the inner
    // corner's lid pulled down, under lashes that flick out at the corners; or shut.
    for (const [o, s] of [[2, 1], [11, -1]]) {
      for (let i = 0; i < 4; i++) v.set(o + s * i, 7, 12, C.black);
      v.set(o - s, 7, 12, C.black);
      for (let y = 4; y <= 6; y++) for (let i = 0; i < 4; i++) {
        const iris = i >= 2 && y <= 5;
        v.set(o + s * i, y, 12, closed ? (y === 4 ? C.skinDk : C.skin) : iris ? C.iris : C.eye);
      }
      if (!closed) {
        v.set(o + s * 3, 6, 12, C.skinDk);
        v.set(o + s * 2, 5, 13, C.eye);
      }
    }
    // A small nose, and the mouth: a frown turned down at its corners, or wide open yelling, teeth and all.
    v.fill(6, 7, 3, 3, 12, 12, C.skinLt);
    v.fill(6, 7, 3, 3, 13, 13, C.skin);
    v.set(6, 2, 12, C.skinDk);
    v.set(7, 2, 12, C.skinDk);
    if (talk) {
      v.fill(4, 9, 0, 1, 12, 12, C.throat);
      v.fill(5, 8, 1, 1, 12, 12, C.white);
      v.fill(5, 8, 0, 0, 12, 12, C.mouth);
    } else {
      v.fill(5, 8, 1, 1, 12, 12, C.mouth);
      v.set(4, 0, 12, C.mouth);
      v.set(9, 0, 12, C.mouth);
    }
    if (down) {
      for (let x = -1; x <= 14; x++) v.set(x, 5, -2, C.black);
      for (let z = -1; z <= 11; z++) { v.set(-1, 5, z, C.black); v.set(14, 5, z, C.black); }
      goggles(v, 5, 13);
    }
    return v;
  };
  // The body, sixteen cells across from the hip up: the overalls' jacket open over the white shirt, its lapels proud,
  // the bolt patch on her left breast, the neck, the belt round her waist with its bolt buckle, a pouch on her left hip
  // and a wrench and pliers on her right; and her long hair down her back.
  const torsoVox = () => {
    const v = makeVox();
    v.fill(0, 15, 0, 11, 0, 9, cloth);
    v.fill(2, 13, 12, 12, 1, 8, cloth);
    v.fill(6, 9, 5, 12, 9, 9, (x, y) => (y > 10 && (x === 6 || x === 9) ? C.shirtDk : C.shirt));
    v.fill(6, 9, 12, 12, 3, 6, C.skin);
    for (let y = 5; y <= 12; y++) { v.set(5, y, 10, C.blueDk); v.set(10, y, 10, C.blueDk); }
    v.fill(4, 4, 11, 12, 10, 10, C.blueDk);
    v.fill(11, 11, 11, 12, 10, 10, C.blueDk);
    for (const [x, y] of [[12, 11], [11, 10], [12, 10], [11, 9], [12, 9], [13, 9], [12, 8], [13, 8], [12, 7]]) v.set(x, y, 10, C.gold);
    v.fill(-1, 16, 3, 4, -1, 10, (x, y, z) => (y === 3 && hv(x, y, z) < 2 ? C.beltDk : C.belt));
    v.fill(6, 9, 2, 5, 11, 11, C.gold);
    for (const [x, y] of [[8, 5], [7, 4], [8, 4], [7, 3], [7, 2]]) v.set(x, y, 12, C.black);
    // The pouch on her left hip, and on her right a wrench hung head down and the pliers' red handles.
    v.fill(13, 16, 0, 3, 5, 10, C.glove);
    v.fill(13, 16, 3, 3, 5, 10, C.gloveDk);
    v.set(16, 2, 8, C.gold);
    v.fill(-2, -1, -1, 5, 6, 6, C.steel);
    v.fill(-2, -1, -2, -1, 5, 7, C.steel);
    v.del(-2, -2, 6);
    v.del(-1, -2, 6);
    v.fill(0, 1, 0, 2, 10, 11, C.red);
    v.fill(0, 1, 3, 3, 10, 11, C.steel);
    // Her hair down her back to below the shoulder blades, its ends ragged, and a lock over each shoulder.
    for (let x = 1; x <= 14; x++) for (let y = 4; y <= 12; y++) for (let z = -2; z <= -1; z++) {
      if (y === 4 && hv(x, y, z) < 5 || z === -2 && hv(x, y, z) < 2) continue;
      v.set(x, y, z, hair(x, y, z));
    }
    v.fill(2, 3, 9, 12, 7, 9, hair);
    v.fill(12, 13, 9, 12, 7, 9, hair);
    v.fill(2, 2, 7, 8, 8, 9, hair);
    v.fill(13, 13, 7, 8, 8, 9, hair);
    return v;
  };
  // An arm in two pieces jointed at the elbow: the upper arm in its blue sleeve rolled up into a cuff above the
  // elbow, and the forearm coming out of it to a big leather glove and its flared cuff.
  const upperVox = () => {
    const v = makeVox();
    v.fill(0, 6, 9, 17, 0, 6, cloth);
    v.fill(-1, 7, 7, 9, -1, 7, (x, y, z) => (y === 8 ? C.shirtDk : C.cuff));
    return v;
  };
  const foreVox = () => {
    const v = makeVox();
    v.fill(2, 4, 4, 8, 2, 4, skin);
    v.fill(0, 6, 3, 4, 0, 6, C.gloveDk);
    v.fill(0, 6, 0, 3, 0, 6, C.glove);
    v.fill(1, 5, -1, -1, 1, 5, C.glove);
    for (let x = 0; x <= 6; x += 2) v.set(x, 1, 6, C.gloveDk);
    return v;
  };
  // A leg: the thigh in the overalls from the hip to the knee, and the shin to its rolled cuff over a heavy laced boot
  // with its toe cap and sole.
  const thighVox = () => {
    const v = makeVox();
    v.fill(0, 6, 0, 6, 0, 6, cloth);
    return v;
  };
  const shinVox = () => {
    const v = makeVox();
    v.fill(0, 6, 4, 8, 0, 6, cloth);
    v.fill(-1, 7, 3, 4, -1, 7, (x, y) => (y === 4 ? C.cuff : C.shirtDk));
    v.fill(0, 6, 1, 3, 0, 7, C.boot);
    v.fill(0, 6, 0, 0, -1, 9, C.black);
    v.fill(0, 6, 1, 2, 8, 9, C.bootDk);
    v.fill(2, 4, 2, 3, 8, 8, C.gold);
    v.fill(0, 6, 3, 3, 0, 0, C.bootDk);
    return v;
  };

  // The hammer, absurdly oversized and made round where it is round, built up its handle from the grip at the origin:
  // a wooden handle with its wrapped grip and pommel, a yellow collar under the head, and the steel head itself, a big
  // block with darker striking faces, yellow bands at its ends and the bolt on each side. `HAMMER.head` is the head's
  // middle up the handle, `HAMMER.face` how far its striking faces stand out from it.
  const HAMMER = { head: 0.98, face: 0.38, length: 1.18 };
  const hammer = cached(() => {
    const WOOD = "#7a4a26", WRAP = "#2c2420", STEEL = "#7d858f", STEEL_DK = "#4a4f57", STEEL_LT = "#a9b1bc", PAINT = "#ffc61a";
    const round = [
      turn([[0, -0.2], [0.045, -0.2], [0.05, -0.16], [0.04, -0.13], [0.036, 0.8], [0, 0.8]], 14, WOOD),
      turn([[0.045, -0.12], [0.045, 0.2], [0.036, 0.2]], 14, WRAP),
      moved(torus(0.05, 0.016, PAINT, 0, 16, 6), 0, 0.76, 0),
      moved(torus(0.046, 0.012, "#c48a10", 0, 16, 6), 0, 0.18, 0)
    ];
    const H = HAMMER.head, flat = [
      bevelBox({ w: 0.34, h: 0.36, d: 0.62, color: STEEL, bevel: 0.035, offset: { y: H } }),
      bevelBox({ w: 0.38, h: 0.4, d: 0.07, color: STEEL_DK, bevel: 0.02, offset: { y: H, z: 0.34 } }),
      bevelBox({ w: 0.38, h: 0.4, d: 0.07, color: STEEL_DK, bevel: 0.02, offset: { y: H, z: -0.34 } }),
      box({ w: 0.36, h: 0.38, d: 0.05, color: PAINT, offset: { y: H, z: 0.25 } }),
      box({ w: 0.36, h: 0.38, d: 0.05, color: PAINT, offset: { y: H, z: -0.25 } }),
      box({ w: 0.35, h: 0.05, d: 0.5, color: STEEL_LT, offset: { y: H + 0.17 } }),
      box({ w: 0.36, h: 0.14, d: 0.16, color: STEEL_DK, offset: { y: H - 0.14 } })
    ];
    // The bolt on both sides of the head, laid flat on each in two convex pieces: its slanting top and its point.
    const BOLT = [[[0.03, 0.19], [-0.07, -0.01], [0.01, -0.01], [0.11, 0.19]], [[-0.04, 0.03], [-0.08, -0.21], [0.09, 0.03]]];
    for (const s of [-1, 1]) for (const piece of BOLT) flat.push(moved(turnedY(prism(piece, 0.02, PAINT, 0.2), s * Math.PI / 2), s * 0.176, H, 0));
    return shaded(round, flat);
  });

  // Her head casts no shadow, so the hat's brim never darkens her eyes.
  const face = (closed, talk, down, palette) => noShadow(vg(headVox(closed, talk, down), -7, 0, -6.5, palette));
  const geometries = cached(() => ({
    headOpen: face(false, false, false),
    headClosed: face(true, false, false),
    headTalk: face(false, true, false),
    headGoggles: face(false, false, true),
    headGogglesTalk: face(false, true, true),
    redOpen: face(false, false, false, FLUSHED),
    redTalk: face(false, true, false, FLUSHED),
    redGogglesTalk: face(false, true, true, FLUSHED),
    torso: vg(torsoVox(), -8, 0, -5),
    upper: vg(upperVox(), -3.5, -17.5, -3.5),
    fore: vg(foreVox(), -3.5, -8.5, -3.5),
    thigh: vg(thighVox(), -3.5, -6.5, -3.5),
    shin: vg(shinVox(), -3.5, -8.5, -3.5)
  }));
  // A fresh rig over the shared geometry, as Kortik's: the root at her hip (`HIP` above the floor), the head on its
  // neck, arms from the shoulders jointed at the elbow, legs jointed at the knee, and the hammer in her right fist
  // (`hammer`, its grip at the fist, the handle along its local +y). `ARM` is the length from shoulder to elbow and
  // from elbow to the middle of the fist; `heads` the head's faces.
  const ARM = { upper: 9 * U, fore: 6 * U }, LEG = { thigh: 7 * U }, HIP = 15.5 * U;
  const rig = () => {
    const G = geometries(), root = createNode();
    const torso = createNode({ geometry: G.torso });
    const head = createNode({ position: { x: 0, y: 12 * U, z: 0.3 * U }, geometry: G.headOpen });
    const arm = (side) => createNode({ position: { x: side * 10 * U, y: 11 * U, z: 0 }, rotation: { x: -0.1, y: 0, z: side * 0.08 }, geometry: G.upper });
    const fore = () => createNode({ position: { x: 0, y: -ARM.upper, z: 0 }, geometry: G.fore });
    const thigh = (side) => createNode({ position: { x: side * 4 * U, y: 0, z: 0 }, geometry: G.thigh });
    const shin = () => createNode({ position: { x: 0, y: -LEG.thigh, z: 0 }, geometry: G.shin });
    const parts = { torso, head, armR: arm(-1), armL: arm(1), foreR: fore(), foreL: fore(), legR: thigh(-1), legL: thigh(1), shinR: shin(), shinL: shin() };
    parts.hammer = createNode({ position: { x: 0, y: -ARM.fore, z: 0 }, geometry: hammer() });
    addChild(parts.armR, parts.foreR);
    addChild(parts.armL, parts.foreL);
    addChild(parts.foreR, parts.hammer);
    addChild(parts.legR, parts.shinR);
    addChild(parts.legL, parts.shinL);
    addChild(root, torso, parts.legR, parts.legL, parts.armR, parts.armL, head);
    // The Canvas 2D sort keeps her in front of the big floor tiles she stands on.
    for (const n of Object.values(parts)) n.depthBias = -0.4;
    const heads = { open: G.headOpen, closed: G.headClosed, talk: G.headTalk, goggles: G.headGoggles, gogglesTalk: G.headGogglesTalk, redOpen: G.redOpen, redTalk: G.redTalk, redGogglesTalk: G.redGogglesTalk };
    return { root, parts, heads, ARM, HIP };
  };

  BL.sisModels = { NAME, U, HAMMER, HIP, rig, hammer };
})();
