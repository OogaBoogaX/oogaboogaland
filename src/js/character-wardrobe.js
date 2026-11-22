// What an Ooga wears besides its hat (equipment-wardrobe.js), put on one body: the visitor's driven Ooga or another
// player's. Its character is built again with the worn pieces as data (models.js `templateFor`, keyed by what is worn;
// the character's own hooks run as ever, and nobody else's), and each of the body's nodes takes the geometry of the
// same node in that build, so its nodes, poses, gear, controls and companions keep their identities. A mask is a node
// of its own on the head, as a hat is (character-equipment.js), whose hat is lifted off while the body changes and put
// back on it. Unsupported pieces (a head of the character's own, a body it models itself) leave that part alone.
(() => {
  "use strict";
  const BL = window.BL, W = BL.equipmentWardrobe, { createNode, addChild, removeChild } = BL.scene;
  const worn = new WeakMap(), maps = new WeakMap(), weapons = new Map(), masks = new Map(), CACHE_MAX = 64;
  const own = (cave) => cave?.traits?.dress || {};
  // A character that models its own body wears a body and a height only once its model has been seen in every build,
  // shape and height: built while `heroBody.dressed` gives its trunk and builder the build worn, so it follows it.
  const REVIEWED_BODIES = new Set(["w-s-bitcoin", "bitcoin-bill", "yellowbrokeit", "natalievarty", "tiffanyvarty", "rules-without-rulers"]);
  const stockHead = (dress) => !(dress.model || dress.skull || dress.hat || dress.crown || dress.eyes || dress.mark || dress.refine);
  // Whether this body can wear a slot's pieces: head pieces only on the stock head, a beard and a mouth only on the
  // regular build's face, a mask on any head the character did not shape itself, body pieces on a body it does not model.
  // `slim` is the build the body is (or is about to be) drawn in, a worn body's or its own.
  const supports = (cave, id, slim = cave?.template?.traits.slim) => {
    const slot = W.SLOT.get(id), dress = own(cave);
    if (!slot || id === "hat" || !cave?.template || !cave.parts?.head) return false;
    if (id === "pet") return !!cave.parts.dog;
    if (id === "body" || id === "height") return !dress.model || REVIEWED_BODIES.has(cave.traits.name.toLowerCase());
    // An Ooga's own colours, where its file does not paint its body itself; eyes only where it draws none of its own.
    if (id === "skin" || id === "hairColor") return !dress.model;
    if (id === "eyeColor") return !dress.model && !dress.eyes;
    if (id === "mask") return !(dress.model || dress.skull);
    if (slot.place === "head") return stockHead(dress) && (id !== "beard" && id !== "mouth" || !slim);
    if (slot.place === "body") return !dress.model;
    return !cave.traits.nunchaku;
  };
  const bounded = (map, key, make) => {
    let value = map.get(key);
    if (!value) {
      if (map.size >= CACHE_MAX) map.delete(map.keys().next().value);
      map.set(key, value = make());
    }
    return value;
  };
  const meshOf = (g, s) => {
    const geo = BL.models.geometry();
    for (let i = 0; i < g.verts.length; i++) geo.verts.push(g.verts[i] * s);
    for (const f of g.faces) geo.faces.push({ i: f.i.slice(), color: f.color.slice(), emissive: f.emissive });
    if (g.slingTurn !== undefined) geo.slingTurn = g.slingTurn;
    if (g.slingHiltUp) geo.slingHiltUp = true;
    return BL.models.characterGeometry(geo);
  };
  const EYES = Object.freeze({ eyeColor: undefined, eyeGlow: undefined, wideEyes: false, noPupils: false, eyeSize: undefined, eyeIn: undefined });
  const MOUTH = Object.freeze({ flatMouth: false, snout: false });
  // What a saved wardrobe means for this body: the build's `wardrobe` trait and its key, and the mask apart. Null while
  // a piece it wears is not on this page yet.
  const resolve = (cave, value) => {
    const head = {}, paint = [], keys = [], state = worn.get(cave), base = (state ? state.base : cave.template).traits;
    let weapon = null, axe, mask = null, body = null;
    // The body first: what it is drawn as decides what else fits (a female build's face has no beard).
    const bodyChoice = value && value.body && supports(cave, "body") ? value.body : null, bodyPiece = bodyChoice && W.content(bodyChoice.version);
    if (bodyChoice && !bodyPiece) return null;
    const slim = bodyPiece ? bodyPiece.build === "slim" : !!base.slim;
    // A chosen height builds everything at that height, the pieces too.
    const tall = value && value.height && supports(cave, "height") ? value.height.height : 0, h = tall ? tall / 100 : base.height;
    for (const id of W.WORN) {
      const choice = value && value[id];
      if (!choice || !supports(cave, id, slim)) continue;
      if (id === "height") { keys.push("height:" + tall); body = { ...body, height: h }; continue; }
      if (id === "pet") continue;
      const piece = choice.item === "none" ? "none" : choice.item === "custom" ? { color: choice.color } : W.content(choice.version);
      if (!piece) return null;
      if (id === "mask") { mask = { piece, version: choice.version, size: choice.size || 100 }; continue; }
      if (id === "body") { keys.push("body:" + choice.version); body = { ...body, slim: piece.build === "slim", bodyShape: piece.shape }; continue; }
      // The Ooga's own colours are its traits: the whole build is drawn from them.
      if (id === "skin" || id === "hairColor" || id === "eyeColor") {
        keys.push(id + ":" + piece.color);
        // An eye colour on the stock head is an iris (hero-body.js `head`); a block head's eyes take it whole.
        if (id === "eyeColor" && stockHead(own(cave))) head.iris = piece.color;
        else body = { ...body, [id === "skin" ? "skin" : id === "hairColor" ? "hair" : "eyeColor"]: piece.color };
        continue;
      }
      keys.push(id + ":" + (choice.version || "none"));
      const slot = W.SLOT.get(id);
      if (slot.place === "body") paint.push([id, piece]);
      else if (id === "weapon") {
        weapon = { default: bounded(weapons, choice.version + ":" + h, () => meshOf(piece.geometry, h)), rest: piece.rest, carry: piece.carry };
        axe = piece.axe;
      } else if (piece === "none") head[id] = "none";
      else if (id === "eyes") head.eyes = { ...EYES, ...piece.traits };
      else if (id === "mouth") head.mouth = { ...MOUTH, ...piece.traits };
      else if (id === "beard") head.beard = { color: W.hexRgb(piece.color) };
      else if (id === "hair") head.hair = { ...piece, color: W.hexRgb(piece.color) };
      else head[id] = piece;
    }
    // A chosen hair colour colours a worn hairstyle too, and a chosen eye colour worn eyes.
    if (body?.hair && head.hair && head.hair !== "none") head.hair = { ...head.hair, color: W.hexRgb(body.hair) };
    if (body?.eyeColor && head.eyes) head.eyes = { ...head.eyes, eyeColor: body.eyeColor };
    const traits = {};
    if (Object.keys(head).length) traits.head = head;
    if (paint.length) traits.paint = paint;
    if (weapon) traits.weapon = weapon;
    // The pet's size is its own, set on its node (`setPet`), so it builds nothing again.
    const pet = value && value.pet && supports(cave, "pet") ? value.pet.size : 0;
    return { key: keys.join(","), traits, body, axe, mask, maskKey: mask ? (mask.version || "none") + "@" + mask.size + "@" + h : "", pet };
  };
  // Each node of a build, by the node of the character's first build it was made beside: two builds of one character
  // have the same nodes in the same places. Null where they do not.
  const IDENTITY = null;
  const mapping = (base, other) => {
    if (base === other) return IDENTITY;
    const known = maps.get(other);
    if (known && known.base === base) return known.map;
    const map = new Map();
    const walk = (a, b) => {
      if (a.children.length !== b.children.length) return false;
      map.set(a, b);
      for (let i = 0; i < a.children.length; i++) if (!walk(a.children[i], b.children[i])) return false;
      return true;
    };
    if (!walk(base.root, other.root)) return undefined;
    maps.set(other, { base, map });
    return map;
  };
  const at = (map, node) => map === IDENTITY ? node : map.get(node);
  const swap = (cave, state, target) => {
    const from = state.current, base = state.base, mapFrom = mapping(base, from), mapTo = mapping(base, target);
    if (mapFrom === undefined || mapTo === undefined) return false;
    const closed = cave.parts.head.geometry === cave.headClosed;
    // A part where the old build left it (or turned it) goes where the new one puts it: a female build's arms and legs
    // stand closer in. One the crew has posed away keeps its pose, and the next pose reads the new build's measures.
    const resting = (v, w) => v.x === w.x && v.y === w.y && v.z === w.z;
    const follow = (v, w) => { v.x = w.x; v.y = w.y; v.z = w.z; };
    const visit = (node) => {
      // The pet keeps the size its file built it at, whatever height its Ooga is worn at (its own is the Pet slot's).
      if (node === cave.parts.dog) return;
      const source = BL.models.templateNode(node);
      if (source) {
        const a = at(mapFrom, source), b = at(mapTo, source);
        if (a && b && a !== b) {
          if (node.geometry === a.geometry) node.geometry = b.geometry;
          else if (from.tint && node.geometry && from.tint.get(a.geometry) === node.geometry) node.geometry = target.tint?.get(b.geometry) || b.geometry;
          if (node !== cave.root) {
            if (resting(node.position, a.position)) follow(node.position, b.position);
            if (resting(node.scale, a.scale)) follow(node.scale, b.scale);
            if (resting(node.rotation, a.rotation)) follow(node.rotation, b.rotation);
          }
        }
      }
      for (const child of node.children) visit(child);
    };
    visit(cave.root);
    const weaponChanged = from.skins.club.default !== target.skins.club.default;
    cave.headOpen = target.headOpen; cave.headClosed = target.headClosed;
    cave.parts.head.geometry = closed ? target.headClosed : target.headOpen;
    cave.template = target; cave.portraitHead = undefined;
    // A new height: the body stands on the same feet, and what reads its height (its eyes, its seat, its hat) reads
    // this one. The crew measures the rest again (crew.js `refreshBody`).
    // (or a build with longer legs: a male one's shins, models.js `SHIN`)
    if (target.traits.height !== from.traits.height || target.root.position.y !== from.root.position.y) {
      const lift = target.root.position.y - from.root.position.y;
      // Its own traits object: a first copy shares its build's, which must keep the character's own height.
      cave.traits = { ...cave.traits, height: target.traits.height }; cave.headOffset = target.headOffset; cave.hip = target.hip;
      cave.root.position.y += lift;
      if (Number.isFinite(cave.baseY)) cave.baseY += lift;
      // The pet stands on the ground, which its Ooga's hip is now `lift` further over (crew.js `attachPet`).
      if (cave.pet) cave.pet.lift -= lift;
    }
    cave.tint = target.tint; cave.gunHeadBounds = target.gunHeadBounds;
    if (cave.skins.club.default === from.skins.club.default) cave.skins.club.default = target.skins.club.default;
    cave.clubRest = target.clubRest; cave.clubCarry = target.clubCarry;
    cave.modelled = target.modelled; cave.elbow = target.elbow; cave.back = target.back; cave.armScale = target.armScale; cave.fist = target.fist;
    // Where the crew puts the arms and head back after a pose (crew.js `sleepParts`): the new build's own places.
    const shownOf = (key) => { const node = cave.parts[key], source = node && BL.models.templateNode(node); return source ? at(mapTo, source) : null; };
    const rest = cave.sleepParts, armR = shownOf("armR"), armL = shownOf("armL"), head = shownOf("head");
    if (rest && armR && armL && head) {
      rest.armRX = armR.position.x; rest.armLX = armL.position.x;
      rest.headX = head.position.x; rest.headY = head.position.y; rest.headZ = head.position.z;
    }
    // What the character's own hooks hung on its club shows only on its own club (models.js hides it off a worn weapon).
    const club = cave.parts.club, clubSource = club && BL.models.templateNode(club), clubShown = clubSource && at(mapTo, clubSource);
    if (clubShown) for (let i = 0; i < club.children.length; i++) club.children[i].visible = clubShown.children[i].visible;
    if (weaponChanged) for (const key of ["club", "forearmR"]) {
      const node = cave.parts[key], source = node && BL.models.templateNode(node), shown = source && at(mapTo, source);
      if (!shown) continue;
      node.position.x = shown.position.x; node.position.y = shown.position.y; node.position.z = shown.position.z;
      node.rotation.x = shown.rotation.x; node.rotation.y = shown.rotation.y; node.rotation.z = shown.rotation.z;
    }
    return true;
  };
  // The pet at `size` per cent of the size its file built it (0: that size), its lying-down drop with it.
  const setPet = (cave, state, size) => {
    const node = cave.parts.dog;
    if (!node) return;
    if (!state.petScale) state.petScale = { x: node.scale.x, y: node.scale.y, z: node.scale.z };
    const k = size ? size / 100 : 1;
    node.scale.x = state.petScale.x * k; node.scale.y = state.petScale.y * k; node.scale.z = state.petScale.z * k;
    if (cave.pet && node.legs) cave.pet.drop = 0.75 * node.legs[0].position.y * node.scale.y;
  };
  const MASK_AT = [0, 2.5, 3];
  const setMask = (cave, state, mask) => {
    const head = cave.parts.head, native = cave.parts.nativeHeadgear || [], h = cave.traits.height;
    if (state.mask) { removeChild(head, state.mask); state.mask = null; }
    if (mask && !state.nativeVisible) state.nativeVisible = native.map((node) => node.visible);
    if (state.nativeVisible) for (let i = 0; i < native.length; i++) native[i].visible = mask ? false : state.nativeVisible[i];
    if (!mask) state.nativeVisible = null;
    else if (mask.piece !== "none") {
      const q = mask.size / 100, u = h / 16, node = createNode({ position: { x: MASK_AT[0] * u * (1 - q), y: MASK_AT[1] * u * (1 - q), z: MASK_AT[2] * u * (1 - q) },
        scale: { x: h * q, y: h * q, z: h * q } }), meshes = bounded(masks, mask.version, () => mask.piece.nodes.map((n) => meshOf(n.geometry, 1)));
      mask.piece.nodes.forEach((n, i) => addChild(node, createNode({ position: { x: n.position[0], y: n.position[1], z: n.position[2] },
        rotation: { x: n.rotation[0], y: n.rotation[1], z: n.rotation[2] }, scale: { x: n.scale[0], y: n.scale[1], z: n.scale[2] }, geometry: meshes[i] })));
      addChild(head, state.mask = node);
    }
  };
  // Dresses the body in a saved wardrobe (null: its own look). False while a piece is not on this page yet, or when the
  // body cannot be built again the same way (a likeness made otherwise), which leaves it as it was.
  const apply = (cave, value) => {
    if (!cave?.template) return value === null;
    let state = worn.get(cave);
    const r = resolve(cave, value);
    if (!r) return false;
    if (!state && !r.key && !r.maskKey && !r.pet) return true;
    if (state && state.key === r.key && state.maskKey === r.maskKey && state.pet === r.pet) return true;
    if (!state) worn.set(cave, state = { base: cave.template, current: cave.template, key: "", maskKey: "", mask: null, nativeVisible: null, axe: cave.traits.stoneAxe, pet: 0, petScale: null });
    if (state.key !== r.key) {
      let target = state.base;
      if (r.key) {
        const fresh = BL.contributors.traitsFor(cave.traits.name);
        if (fresh.height !== state.base.traits.height || !!fresh.slim !== !!state.base.traits.slim) return false;
        target = BL.models.templateFor({ ...fresh, ...(r.body || null), wardrobe: r.traits, wardrobeKey: r.key, ...(r.axe === undefined ? null : { stoneAxe: r.axe }) });
      }
      const hat = BL.characterEquipment.detach(cave);
      const done = swap(cave, state, target);
      if (done) {
        state.current = target; state.key = r.key;
        cave.traits.stoneAxe = r.axe === undefined ? state.axe : r.axe;
      }
      if (hat) BL.characterEquipment.apply(cave, hat.selection, hat.size);
      if (!done) return false;
    }
    if (state.maskKey !== r.maskKey) { setMask(cave, state, r.mask); state.maskKey = r.maskKey; }
    if (state.pet !== r.pet) { setPet(cave, state, r.pet); state.pet = r.pet; }
    BL.crew?.refreshBody(cave);
    return true;
  };
  const wearing = (cave) => { const state = worn.get(cave); return state && (state.key || state.maskKey || state.pet) ? state.key + "|" + state.maskKey + (state.pet ? "|pet@" + state.pet : "") : ""; };
  BL.characterWardrobe = { apply, clear: (cave) => apply(cave, null), supports, wearing };
})();
