// The wardrobe's contract beside the hat's (equipment-hats.js): every slot an Ooga can wear something in, what each
// worn piece is as data, and the saved choice. A piece is the immutable data the authoring script read from a
// character's own design (scripts/equipment-wardrobe.mjs): blocks, traits, a colour or a mesh, never a hook, so no
// character's code runs for another's Ooga. An item is one such piece, named by its content's hash; a creator's edit
// makes a new item and every old one stays registered for whoever wears it. Pure: loaded by the page, the Worker and
// the authoring script alike.
(() => {
  "use strict";
  const BL = globalThis.BL = globalThis.BL || {};
  const HASH = /^[a-f0-9]{64}$/, HEX = /^#[0-9a-f]{6}$/, LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
  const MAX_ITEMS = 1024, MAX_BYTES = 256 * 1024, MAX_CELLS = 4096, MAX_COLOURS = 64, MAX_VERTICES = 20000, MAX_FACES = 12000;
  // In the order the studio lists them. The body is the build an Ooga is drawn in, male or female and its shape
  // (hero-body.js `SHAPES`), never its height; skin, hair and eye colour are its own colours, each a swatch. `kind` says what a piece is; `none` names taking it off where an Ooga can go
  // without one; `sized` slots save a size as the hat does; `head` slots draw on the stock head (hero-body.js `head`),
  // `body` slots on the authored blocks a body wears (`paint`), and the mask and weapon are meshes of their own.
  const SLOTS = Object.freeze([
    ["body", "Body", "body", null, false, "frame"],
    ["skin", "Skin", "colour", null, false, "tone"],
    ["hairColor", "Hair color", "colour", null, false, "tone"],
    ["eyeColor", "Eye color", "colour", null, false, "tone"],
    ["hat", "Hat", "hat", "No hat", true, "hat"],
    ["hair", "Hair", "cells", "Bald", false, "head"],
    ["eyes", "Eyes", "traits", null, false, "head"],
    ["glasses", "Glasses", "cells", "No glasses", false, "head"],
    ["mask", "Mask", "mesh", "No mask", true, "head"],
    ["mouth", "Mouth", "traits", null, false, "head"],
    ["beard", "Beard", "colour", "Clean-shaven", false, "head"],
    ["shirt", "Shirt", "paint", "No shirt", false, "body"],
    ["gloves", "Gloves", "paint", "Bare hands", false, "body"],
    ["belt", "Belt", "paint", "No belt", false, "body"],
    ["pants", "Pants", "paint", null, false, "body"],
    ["shoes", "Shoes", "paint", "Barefoot", false, "body"],
    ["back", "Back", "paint", "Nothing on the back", false, "body"],
    ["weapon", "Primary weapon", "weapon", null, false, "hand"]
  ].map(([id, label, kind, none, sized, place]) => Object.freeze({ id, label, kind, none, sized, place })));
  const SLOT = new Map(SLOTS.map((slot) => [slot.id, slot]));
  // The slots this module keeps; the hat keeps its own registry and history.
  const WORN = Object.freeze(SLOTS.filter((slot) => slot.id !== "hat").map((slot) => slot.id));
  // The authored colours an Ooga's own palette names (models.js `P`): a piece in one of them takes the wearer's own.
  const TOKENS = Object.freeze(["skin", "skinDk", "hair", "hairDk", "fur", "spot", "white", "black", "nose", "stubble", "wood", "stone", "stoneDk"]);
  const TRAITS = Object.freeze({
    eyes: { eyeColor: "hex", eyeGlow: "level", wideEyes: "flag", noPupils: "flag", eyeSize: "scale", eyeIn: "offset" },
    mouth: { face: ["nose", "smirk", "none"], flatMouth: "flag", snout: "flag" }
  });
  const PARTS = Object.freeze(["torso", "armR", "armL", "legR", "legL"]);
  // Which body slot an authored block belongs to, by the part and the block (models.js's grids: the torso a box nine
  // wide, eight tall and six deep, its flaps under it; an arm's rows from the fist up to the shoulder; a leg's from
  // the sole up). What a hook built out past the torso's box goes with the row it is in on the front, and on its
  // back, sides and over its shoulders is worn on the back.
  const regionOf = (part, x, y, z) => {
    if (part === "torso") {
      const inside = x >= 0 && x <= 8 && z >= 0 && z <= 5 && y <= 7;
      if (!inside && !(z > 5 && y <= 7)) return "back";
      return y >= 4 ? "shirt" : y === 3 ? "belt" : "pants";
    }
    if (part === "armR" || part === "armL") return y <= 1 ? "gloves" : "shirt";
    return y <= 1 ? "shoes" : "pants";
  };
  const plain = (v) => !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
  const own = (v, keys, optional = []) => plain(v) && keys.every((key) => Object.hasOwn(v, key))
    && Object.keys(v).every((key) => keys.includes(key) || optional.includes(key));
  const fail = (why = "Invalid wardrobe piece") => { throw new Error(why); };
  const finite = (v, bound) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= bound;
  const vector = (v, bound) => Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, bound));
  const angles = (v) => own(v, ["x", "z"], ["y"]) && finite(v.x, Math.PI * 2) && finite(v.z, Math.PI * 2) && (v.y === undefined || finite(v.y, Math.PI * 2));
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const encode = (value) => JSON.stringify(canonical(value)) + "\n";
  const colours = (palette, glow) => {
    if (!Array.isArray(palette) || !palette.length || palette.length > MAX_COLOURS || new Set(palette).size !== palette.length
      || !palette.every((c) => TOKENS.includes(c) || typeof c === "string" && HEX.test(c))) fail();
    if (glow !== undefined && (!plain(glow) || !Object.entries(glow).every(([i, level]) => /^(0|[1-9][0-9]?)$/.test(i)
      && Number(i) < palette.length && finite(level, 4) && level > 0))) fail();
  };
  const cells = (list, palette, bound) => {
    if (!Array.isArray(list) || list.length % 4 || list.length / 4 > MAX_CELLS) fail();
    const seen = new Set();
    for (let n = 0; n < list.length; n += 4) {
      const x = list[n], y = list[n + 1], z = list[n + 2], c = list[n + 3];
      if (![x, y, z].every((v) => Number.isInteger(v) && Math.abs(v) <= bound) || !Number.isInteger(c) || c < 0 || c >= palette.length) fail();
      const key = x + "," + y + "," + z;
      if (seen.has(key)) fail();
      seen.add(key);
    }
    return list.length / 4;
  };
  const mesh = (geo, bound) => {
    if (!own(geo, ["verts", "faces"], ["slingTurn", "slingHiltUp"]) || !Array.isArray(geo.verts) || !geo.verts.length || geo.verts.length % 3
      || geo.verts.length / 3 > MAX_VERTICES || !geo.verts.every((v) => finite(v, bound)) || !Array.isArray(geo.faces) || !geo.faces.length
      || geo.faces.length > MAX_FACES || geo.slingTurn !== undefined && !finite(geo.slingTurn, Math.PI * 2)
      || geo.slingHiltUp !== undefined && geo.slingHiltUp !== true) fail();
    const n = geo.verts.length / 3;
    for (const face of geo.faces) if (!own(face, ["i", "color", "emissive"]) || !Array.isArray(face.i) || face.i.length < 3 || face.i.length > 32
      || !face.i.every((i) => Number.isSafeInteger(i) && i >= 0 && i < n) || !vector(face.color, 255) || face.color.some((c) => c < 0)
      || !finite(face.emissive, 4) || face.emissive < 0) fail();
  };
  // A piece's content, checked whole: a bad one is refused, never half worn.
  const validateContent = (content, slotId = content?.slot) => {
    const slot = SLOT.get(slotId);
    if (!slot || slot.id === "hat" || !plain(content) || content.format !== 1 || content.slot !== slot.id) fail();
    if (slot.kind === "cells") {
      if (!own(content, ["format", "slot", "palette", "cells"], slot.id === "hair" ? ["glow", "color"] : ["glow"])) fail();
      colours(content.palette, content.glow);
      if (!cells(content.cells, content.palette, 16)) fail();
      if (slot.id === "hair" && !(typeof content.color === "string" && HEX.test(content.color))) fail();
    } else if (slot.kind === "traits") {
      if (!own(content, ["format", "slot", "traits"]) || !plain(content.traits)) fail();
      const allowed = TRAITS[slot.id];
      for (const [key, value] of Object.entries(content.traits)) {
        const rule = allowed[key];
        if (!rule || !(Array.isArray(rule) ? rule.includes(value) : rule === "hex" ? typeof value === "string" && HEX.test(value)
          : rule === "flag" ? value === true : rule === "level" ? finite(value, 4) && value > 0
          : rule === "scale" ? finite(value, 2) && value >= 0.5 : finite(value, 1))) fail();
      }
      if (slot.id === "mouth" && !Object.hasOwn(content.traits, "face")) fail();
    } else if (slot.kind === "colour") {
      if (!own(content, ["format", "slot", "color"]) || typeof content.color !== "string" || !HEX.test(content.color)) fail();
    } else if (slot.kind === "paint") {
      if (!own(content, ["format", "slot", "palette", "parts"], ["glow"]) || !plain(content.parts)) fail();
      colours(content.palette, content.glow);
      let total = 0;
      for (const [part, list] of Object.entries(content.parts)) {
        if (!PARTS.includes(part)) fail();
        total += cells(list, content.palette, 24);
        for (let n = 0; n < list.length; n += 4) if (regionOf(part, list[n], list[n + 1], list[n + 2]) !== slot.id) fail();
      }
      if (!total) fail();
    } else if (slot.kind === "mesh") {
      if (!own(content, ["format", "slot", "nodes"]) || !Array.isArray(content.nodes) || !content.nodes.length || content.nodes.length > 8) fail();
      for (const node of content.nodes) {
        if (!own(node, ["position", "rotation", "scale", "geometry"]) || !vector(node.position, 4) || !vector(node.rotation, Math.PI * 2)
          || !vector(node.scale, 4) || node.scale.some((n) => n <= 0)) fail();
        mesh(node.geometry, 8);
      }
    } else if (slot.kind === "body") {
      if (!own(content, ["format", "slot", "build"], ["shape"]) || !["regular", "slim"].includes(content.build) || content.shape !== undefined && !["lean", "big"].includes(content.shape)) fail();
    } else if (slot.kind === "weapon") {
      if (!own(content, ["format", "slot", "geometry", "rest", "carry", "axe"]) || !angles(content.rest) || !angles(content.carry) || typeof content.axe !== "boolean") fail();
      mesh(content.geometry, 8);
    }
    return content;
  };
  let items = Object.freeze([]), byId = new Map(), bySlot = new Map(), seeded = false;
  const contents = new Map();
  // The registry: every item ever published, `retired` once no character's design makes it any more (still worn, never
  // offered). Rows are in the order the studio lists them within their slot.
  const register = (rows) => {
    if (items.length || !Array.isArray(rows) || rows.length > MAX_ITEMS) fail("Wardrobe registry already initialized or invalid");
    const next = new Map(), slots = new Map(WORN.map((id) => [id, []]));
    for (const row of rows) {
      if (!own(row, ["id", "slot", "label", "creators", "version"], ["retired"]) || !WORN.includes(row.slot) || !HASH.test(row.version)
        || row.id !== row.slot + "-" + row.version.slice(0, 16) || next.has(row.id) || typeof row.label !== "string" || !row.label || row.label.length > 80
        || !Array.isArray(row.creators) || !row.creators.length || row.creators.length > 128 || new Set(row.creators).size !== row.creators.length
        || !row.creators.every((c) => typeof c === "string" && LOGIN.test(c)) || row.retired !== undefined && row.retired !== true) fail("Invalid wardrobe registry");
      const entry = Object.freeze({ ...row, creators: Object.freeze([...row.creators]) });
      next.set(row.id, entry);
      if (!row.retired) slots.get(row.slot).push(entry);
    }
    byId = next; items = Object.freeze([...next.values()]);
    bySlot = new Map([...slots].map(([id, list]) => [id, Object.freeze(list)]));
  };
  const get = (id) => byId.get(id) || null;
  const has = (id, version) => typeof id === "string" && typeof version === "string" && byId.get(id)?.version === version;
  // One saved choice for a slot: an item, or taking the slot's piece off, or for an Ooga's own colour (skin, hair or
  // eyes) any colour the player mixed (`custom`, its `color` a lower-case hex). The character's own look is no entry at all.
  const choice = (slotId, value) => {
    const slot = SLOT.get(slotId);
    if (!slot || slot.id === "hat" || !plain(value)) fail("Invalid wardrobe choice");
    if (value.item === "custom") {
      if (slot.place !== "tone" || !own(value, ["item", "version", "color"]) || value.version !== null || typeof value.color !== "string" || !HEX.test(value.color)) fail("Invalid wardrobe choice");
      return Object.freeze({ item: "custom", version: null, color: value.color });
    }
    const keys = slot.sized ? ["size"] : [];
    if (!own(value, ["item", "version"], keys) || value.size !== undefined && !(Number.isInteger(value.size) && value.size >= 80 && value.size <= 120)) fail("Invalid wardrobe choice");
    if (value.item === "none") {
      if (!slot.none || value.version !== null || value.size !== undefined) fail("Invalid wardrobe choice");
      return Object.freeze({ item: "none", version: null });
    }
    if (!has(value.item, value.version) || byId.get(value.item).slot !== slot.id) fail("Unknown wardrobe item");
    return Object.freeze(value.size === undefined || value.size === 100 ? { item: value.item, version: value.version }
      : { item: value.item, version: value.version, size: value.size });
  };
  // A whole saved wardrobe, in slot order: null when it changes nothing.
  const selection = (value) => {
    if (value === null) return null;
    if (!plain(value) || !Object.keys(value).every((key) => WORN.includes(key))) fail("Invalid wardrobe");
    const out = {};
    for (const id of WORN) if (Object.hasOwn(value, id)) out[id] = choice(id, value[id]);
    return Object.keys(out).length ? Object.freeze(out) : null;
  };
  const key = (value) => value ? WORN.filter((id) => value[id]).map((id) => id + ":" + (value[id].color || value[id].version || "none") + (value[id].size ? "@" + value[id].size : "")).join(",") : "";
  // Content the page holds (equipment-wardrobe-data.gen.js), checked against its hash once on arrival by the caller.
  const seed = (map) => {
    for (const [version, content] of Object.entries(map)) {
      if (!HASH.test(version) || contents.has(version)) continue;
      validateContent(content);
      contents.set(version, content);
    }
    seeded = true;
  };
  // Lays body pieces over a build's authored blocks (models.js): each clears its own slot's blocks from every part and
  // lays its own. `wear` lists [slot, content or "none"]; `P` is the build's palette names, `add` adds a colour.
  // Taking a piece off leaves the body's own shape bare: its blocks turn skin (a belt's turn the cloth over it, or under
  // it), and only what was built out past the torso goes. A row left empty would read as whatever else stands in it.
  const paint = (authored, wear, P, add) => {
    let lit = null;
    for (const [slot, content] of wear) {
      for (const part of PARTS) {
        const map = authored[part];
        if (!map) continue;
        const mine = [];
        map.each((x, y, z) => { if (regionOf(part, x, y, z) === slot) mine.push(x, y, z); });
        for (let n = 0; n < mine.length; n += 3) {
          const x = mine[n], y = mine[n + 1], z = mine[n + 2], built = part === "torso" && !(x >= 0 && x <= 8 && z >= 0 && z <= 5);
          if (content !== "none" || built || slot === "back") map.del(x, y, z);
          else if (slot === "belt") map.set(x, y, z, map.has(x, 4, z) ? map.get(x, 4, z) : map.has(x, 2, z) ? map.get(x, 2, z) : P.skin);
          else map.set(x, y, z, P.skin);
        }
      }
      if (content === "none") continue;
      const at = content.palette.map((c) => TOKENS.includes(c) ? P[c] : add(hexRgb(c)));
      if (content.glow) for (const [i, level] of Object.entries(content.glow)) (lit ||= { ...(authored.lit || null) })[at[i]] = level;
      for (const [part, list] of Object.entries(content.parts)) {
        const map = authored[part];
        if (map) for (let n = 0; n < list.length; n += 4) map.set(list[n], list[n + 1], list[n + 2], at[list[n + 3]]);
      }
    }
    if (lit) authored.lit = lit;
  };
  const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  BL.equipmentWardrobe = { SLOTS, SLOT, WORN, TOKENS, TRAITS, PARTS, MAX_BYTES, regionOf, validateContent, register, get, has, choice, selection, key,
    seed, paint, encode, canonical, hexRgb, content: (version) => contents.get(version) || null, slotItems: (id) => bySlot.get(id) || Object.freeze([]),
    get items() { return items; }, get seeded() { return seeded; } };
})();
