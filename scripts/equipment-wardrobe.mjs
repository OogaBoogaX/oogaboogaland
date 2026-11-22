// The wardrobe's pieces (src/js/equipment-wardrobe.js), read from the characters' own designs. Maintainer authoring
// only (`--author`): it runs the character files in a sandbox, as the hat's script does, and writes each piece as
// immutable data under src/equipment/wardrobe, named by its hash, with the catalog that lists them. Every other run
// (the build) only checks the committed pieces against their hashes and writes the generated files the page and the
// Worker load; it never runs a character's code. A piece no character makes any more stays in the catalog, retired,
// for whoever wears it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HASH = /^[a-f0-9]{64}$/;
const read = (file) => readFileSync(file, "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const directoryFor = (base) => join(base, "src/equipment/wardrobe");
// Pieces of the stock outfit every Ooga starts in are credited to the project, not to each character wearing them.
const STOCK = "OogaBoogaX";

const sandbox = (base, models) => {
  const context = vm.createContext({ URLSearchParams, location: { search: "" }, console });
  vm.runInContext("window = globalThis", context);
  const names = models ? ["math", "scene", "models", "hero-body", "equipment-wardrobe", "characters"] : ["equipment-wardrobe"];
  for (const name of names) vm.runInContext(read(join(base, "src/js", name + ".js")), context, { timeout: 5000, filename: name + ".js" });
  return context;
};

// Names for colours, for the pieces whose look is a colour (hair, a beard, eyes): the nearest by eye.
const NAMES = [["black", "#151312"], ["charcoal", "#3a3634"], ["dark brown", "#2b1b10"], ["brown", "#4a2c14"], ["chestnut", "#7a2e12"],
  ["auburn", "#8a3b1e"], ["light brown", "#5c4425"], ["sandy", "#a88a5a"], ["blonde", "#d8b860"], ["golden", "#e0a830"], ["ginger", "#c4622a"],
  ["red", "#c42828"], ["pink", "#e070a0"], ["orange", "#f08a20"], ["yellow", "#f2d230"], ["green", "#3a9a48"], ["lime", "#9ad040"],
  ["teal", "#2a9a96"], ["cyan", "#40c8e0"], ["blue", "#3a6ad0"], ["navy", "#1f2f6a"], ["purple", "#7a3fa8"], ["violet", "#a070e0"],
  ["grey", "#8b8279"], ["silver", "#c9c3b9"], ["white", "#f2efe4"]].map(([name, hex]) => [name, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);
const nameOf = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let best = null, d = Infinity;
  for (const [name, n] of NAMES) {
    const e = 2 * (c[0] - n[0]) ** 2 + 4 * (c[1] - n[1]) ** 2 + 3 * (c[2] - n[2]) ** 2;
    if (e < d) { d = e; best = name; }
  }
  return best;
};
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Everything the sandbox reads from one build, as plain data. Runs inside the sandbox.
const EXTRACT = `(() => {
  const B = BL, M = B.models, W = B.equipmentWardrobe, hex = (c) => "#" + c.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
  const build = (traits) => { const capture = {}; const t = M.templateFor({ ...traits, capture, wardrobeKey: "capture:" + Math.random() }); return { t, capture }; };
  const traitsOf = (name, slim) => { const t = { ...B.contributors.traitsFor(name), height: 1 }; if (slim !== undefined) t.slim = slim; return t; };
  const tokenOf = (P) => { const back = new Map(Object.entries(P).map(([name, i]) => [i, name])); return back; };
  const round = (v) => Math.round(v * 1e4) / 1e4;
  const geo = (g, extra) => ({ verts: Array.from(g.verts, round), faces: g.faces.map((f) => ({ i: Array.from(f.i), color: Array.from(f.color).map(Math.round), emissive: round(f.emissive || 0) })), ...extra });
  const one = (name, slim) => {
    const traits = traitsOf(name, slim), dress = traits.dress || {}, out = { name, slim: !!traits.slim, hair: traits.hair, look: {} };
    for (const key of ["eyeColor", "eyeGlow", "wideEyes", "noPupils", "eyeSize", "eyeIn", "face", "flatMouth", "snout", "cleanShaven", "bald", "hairless", "nunchaku", "stoneAxe"])
      if (traits[key] !== undefined) out.look[key] = traits[key];
    out.hooks = Object.keys(dress);
    const { t, capture } = build(traits), P = capture.P, names = tokenOf(P), palette = capture.palette;
    // The blocks a body wore, each part's cells as [x, y, z, colour] with colours as names or hex, normalised the way the
    // modelled body reads them (a darker skin block is skin, a spot among fur is fur, a gap in the hip band is the band).
    out.paint = {};
    if (!dress.model) for (const part of W.PARTS) {
      const map = capture.authored[part];
      if (!map) continue;
      const rows = new Map();
      map.each((x, y, z, c) => { if (!rows.has(y)) rows.set(y, new Set()); rows.get(y).add(c); });
      const colour = (c, y) => {
        if (c === P.skinDk) c = P.skin;
        if (c === P.spot && rows.get(y)?.has(P.fur)) c = P.fur;
        return names.has(c) ? names.get(c) : hex(palette[c]);
      };
      const cells = [];
      map.each((x, y, z, c) => cells.push([x, y, z, colour(c, y)]));
      if (part === "torso") for (let x = 0; x <= 8; x++) for (let z = 0; z <= 5; z++)
        if (!map.has(x, 0, z) && map.has(x, 1, z)) cells.push([x, 0, z, colour(map.get(x, 1, z), 1)]);
      out.paint[part] = cells;
    }
    out.lit = {};
    if (capture.authored?.lit) for (const [i, level] of Object.entries(capture.authored.lit)) out.lit[names.has(Number(i)) ? names.get(Number(i)) : hex(palette[i])] = level;
    // The head: the stock head's own blocks, or (built without its hat) the block head the character drew.
    if (capture.stockHead) {
      const s = capture.stockHeadBlocks, at = ["skin", "skin", "hair", "hairDk"];
      out.head = { stock: true, cells: [] };
      s.v.each((x, y, z, c) => out.head.cells.push([x, y, z, at[c]]));
    } else if (!dress.model && !dress.skull) {
      const bare = build({ ...traits, equipmentBare: true }).capture, BP = bare.P, bn = tokenOf(BP);
      out.head = { stock: false, cells: [] };
      bare.head.each((x, y, z, c) => out.head.cells.push([x, y, z, c === BP.skinDk ? "skin" : bn.has(c) ? bn.get(c) : hex(bare.palette[c])]));
      out.headGlow = {};
      if (bare.head && t.headOpen) for (const f of t.headOpen.faces) if (f.emissive) out.headGlow[hex(f.color)] = round(f.emissive);
    }
    // What it wears on its face beside a hat: whole leaf meshes in the head's frame.
    out.mask = (t.parts.nativeHeadgear || []).filter((n) => n.geometry && !n.children.length).map((n) => ({ position: [n.position.x, n.position.y, n.position.z].map(round),
      rotation: [n.rotation.x, n.rotation.y, n.rotation.z].map(round), scale: [n.scale.x, n.scale.y, n.scale.z].map(round), geometry: geo(n.geometry) }));
    // The weapon in its hand, with anything hung on it merged into its own frame.
    const club = t.parts.club;
    if (club && club.geometry && !traits.nunchaku && !club.children.some((c) => c.swing)) {
      const merged = M.geometry(), add = (g, m) => {
        const base = merged.verts.length / 3;
        for (let i = 0; i < g.verts.length; i += 3) {
          const x = g.verts[i], y = g.verts[i + 1], z = g.verts[i + 2];
          merged.verts.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
        for (const f of g.faces) merged.faces.push({ i: Array.from(f.i, (i) => i + base), color: Array.from(f.color), emissive: f.emissive || 0 });
      };
      add(club.geometry, B.math.mat4.create());
      for (const child of club.children) if (child.geometry && child.visible !== false) { B.scene.updateLocal(child); add(child.geometry, child.local); }
      const extra = {};
      if (club.geometry.slingTurn !== undefined) extra.slingTurn = round(club.geometry.slingTurn);
      if (club.geometry.slingHiltUp) extra.slingHiltUp = true;
      const angles = (a) => { const o = { x: round(a.x), z: round(a.z) }; if (a.y) o.y = round(a.y); return o; };
      out.weapon = { geometry: geo(merged, extra), rest: angles(t.clubRest), carry: angles(t.clubCarry), axe: !!traits.stoneAxe };
    }
    return out;
  };
  return JSON.stringify(names.map(([name, slim]) => one(name, slim)));
})()`;

// Every character's pieces, and the stock outfit's (a file-less Ooga in each build).
const readDesigns = (base) => {
  const context = sandbox(base, true), files = readdirSync(join(base, "src/characters")).filter((f) => f.endsWith(".js")).sort();
  for (const file of files) vm.runInContext(read(join(base, "src/characters", file)), context, { timeout: 5000, filename: file });
  for (const name of ["activity-repos", "roster-panel", "contributors"]) vm.runInContext(read(join(base, "src/js", name + ".js")), context, { timeout: 5000, filename: name + ".js" });
  const handles = vm.runInContext("JSON.stringify(BL.characters.all().map((c) => c.handle))", context);
  const names = [["zz-wardrobe-stock", false], ["zz-wardrobe-stock", true], ...JSON.parse(handles).map((h) => [h, undefined])];
  context.names = names;
  return { designs: JSON.parse(vm.runInContext(EXTRACT, context, { timeout: 120000 })), context };
};

// A design's pieces, slot by slot, as content (or null where it has none to give).
const piecesOf = (d) => {
  const pieces = {}, palette = (list) => {
    const colours = [], glow = {}, cells = [];
    for (const [x, y, z, c] of list) {
      let i = colours.indexOf(c);
      if (i < 0) { i = colours.length; colours.push(c); }
      cells.push(x, y, z, i);
    }
    return { colours, glow, cells };
  };
  const sort = (list) => list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  // Body pieces: the cells of each part in the slot's region; a piece all of bare skin is the same as none.
  for (const slot of ["shirt", "gloves", "belt", "pants", "shoes", "back"]) {
    const parts = {}, colours = [];
    let any = false;
    for (const [part, cells] of Object.entries(d.paint)) {
      const mine = sort(cells.filter(([x, y, z]) => regionOf(part, x, y, z) === slot));
      if (!mine.length) continue;
      parts[part] = [];
      for (const [x, y, z, c] of mine) {
        if (c !== "skin") any = true;
        let i = colours.indexOf(c);
        if (i < 0) { i = colours.length; colours.push(c); }
        parts[part].push(x, y, z, i);
      }
    }
    if (!any) continue;
    // A belt is a row of its own colour, not the middle of a dress.
    if (slot === "belt") {
      const most = (y) => { const n = new Map(); for (const [x, yy, z, c] of d.paint.torso || []) if (yy === y && x >= 0 && x <= 8 && z >= 0 && z <= 5) n.set(c, (n.get(c) || 0) + 1);
        return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]; };
      if (most(3) === most(2) && most(3) === most(4)) continue;
    }
    const content = { format: 1, slot, palette: colours, parts }, glow = {};
    colours.forEach((c, i) => { if (d.lit[c]) glow[i] = d.lit[c]; });
    if (Object.keys(glow).length) content.glow = glow;
    pieces[slot] = content;
  }
  const look = d.look, hex = (h) => h.toLowerCase();
  if (d.head) {
    const beardZone = (x, y, z) => z >= 5 && y <= 1;
    const skull = (x, y, z) => x >= 0 && x <= 6 && y >= 0 && y <= 5 && z >= 0 && z <= 5 || x >= 1 && x <= 5 && y >= 0 && y <= 1 && z === 6;
    const faceColour = new Set(["skin", "skinDk", "nose", "hair", "hairDk", "stubble", "spot"]);
    const front = (x, y, z) => z >= 6 && y >= 1 && y <= 4;
    // Glasses are what stands before both eyes at their height: a lens or frame each side. Anything else on the
    // front over the brow (a headband) goes with the hair.
    const lens = d.head.stock ? [] : sort(d.head.cells.filter(([x, y, z, c]) => front(x, y, z) && x >= -1 && x <= 7 && !faceColour.has(c)));
    const eyeLevel = (x0, x1) => lens.some(([x, y]) => x >= x0 && x <= x1 && y >= 2 && y <= 3);
    const glasses = eyeLevel(-1, 1) && eyeLevel(5, 7);
    const hairCells = sort(d.head.cells.filter(([x, y, z, c]) => c !== "skin" && !skull(x, y, z) && !beardZone(x, y, z)
      && (!front(x, y, z) || !d.head.stock && !glasses && y >= 4 && !faceColour.has(c)) && (d.head.stock ? c === "hair" || c === "hairDk" : true)));
    if (hairCells.length && !look.bald && !look.hairless && !d.stock) {
      const p = palette(hairCells), content = { format: 1, slot: "hair", palette: p.colours, cells: p.cells, color: hex(d.hair) };
      if (d.headGlow) { const glow = {}; p.colours.forEach((c, i) => { if (d.headGlow[c]) glow[i] = d.headGlow[c]; }); if (Object.keys(glow).length) content.glow = glow; }
      pieces.hair = content;
    }
    if (glasses) {
      {
        const p = palette(lens), content = { format: 1, slot: "glasses", palette: p.colours, cells: p.cells };
        if (d.headGlow) { const glow = {}; p.colours.forEach((c, i) => { if (d.headGlow[c]) glow[i] = d.headGlow[c]; }); if (Object.keys(glow).length) content.glow = glow; }
        pieces.glasses = content;
      }
    }
    const kind = look.face || (d.slim || look.cleanShaven ? "nose" : "beard");
    if (!d.slim && kind === "beard" && !d.stock) pieces.beard = { format: 1, slot: "beard", color: hex(d.hair) };
    if (!d.hooks.includes("eyes")) {
      const traits = {};
      for (const key of ["eyeColor", "eyeGlow", "wideEyes", "noPupils", "eyeSize", "eyeIn"]) if (look[key] !== undefined && look[key] !== false && look[key] !== 0)
        traits[key] = key === "eyeColor" ? hex(look[key]) : look[key];
      if (traits.eyeSize === 1) delete traits.eyeSize;
      pieces.eyes = { format: 1, slot: "eyes", traits };
    }
    if (!d.slim && kind !== "beard" && !d.hooks.includes("mark")) {
      const traits = { face: kind };
      if (look.flatMouth) traits.flatMouth = true;
      if (look.snout) traits.snout = true;
      pieces.mouth = { format: 1, slot: "mouth", traits };
    }
  }
  if (d.mask.length) pieces.mask = { format: 1, slot: "mask", nodes: d.mask };
  if (d.weapon) pieces.weapon = { format: 1, slot: "weapon", ...d.weapon };
  return pieces;
};
let regionOf = null;

// Names a piece is listed under. The stock outfit's and the colour pieces' say what they are; a character's own is
// theirs, unless the reviewed names (labels.json, `slot:handle`) give it a better one.
const NOUNS = { hair: "hair", eyes: "eyes", glasses: "glasses", mask: "mask", mouth: "mouth", beard: "beard", shirt: "shirt", gloves: "gloves",
  belt: "belt", pants: "pants", shoes: "shoes", back: "back piece", weapon: "weapon" };
const labelOf = (slot, content, design, stock, reviewed) => {
  if (Object.hasOwn(reviewed, slot + ":" + design.name)) return reviewed[slot + ":" + design.name];
  if (slot === "beard") return cap(nameOf(content.color)) + " beard";
  if (slot === "eyes") {
    const t = content.traits, words = [];
    if (t.eyeGlow) words.push("glowing");
    if (t.wideEyes) words.push("wide");
    if (t.eyeColor) words.push(nameOf(t.eyeColor));
    if (t.noPupils) words.push(t.eyeColor ? "blank" : "blank white");
    if (t.eyeSize) words.push(t.eyeSize < 1 ? "small" : "large");
    return words.length ? cap(words.join(" ")) + " eyes" : "Plain eyes";
  }
  if (slot === "mouth") {
    const t = content.traits;
    return (t.snout ? "Snout, " : "") + (t.face === "smirk" ? "smirk" : t.face === "none" ? "no mouth" : t.flatMouth ? "flat mouth" : "plain mouth")
      .replace(/^./, (c) => t.snout ? c : c.toUpperCase());
  }
  if (stock) {
    if (slot === "hair") return cap(nameOf(content.color)) + (design.slim ? " long hair" : " cap of hair");
    return { shirt: design.slim ? "Leopard top" : "Fur strap", pants: design.slim ? "Leopard skirt" : "Leopard loincloth", belt: "Hide belt with stone buckle",
      weapon: design.slim ? "Slim wooden club" : "Wooden club" }[slot] || "Stock " + NOUNS[slot];
  }
  if (slot === "hair" && !design.custom) return cap(nameOf(content.color)) + (design.slim ? " long hair" : " cap of hair");
  return (design.display || design.name) + "'s " + NOUNS[slot];
};

export const authorWardrobe = (base = root) => {
  const directory = directoryFor(base), { designs, context } = readDesigns(base);
  regionOf = (part, x, y, z) => vm.runInContext(`BL.equipmentWardrobe.regionOf(${JSON.stringify(part)},${x},${y},${z})`, context);
  // Cache the region lookup by key: a few thousand cells per design.
  const regions = new Map(), slow = regionOf;
  regionOf = (part, x, y, z) => { const key = part + x + "," + y + "," + z; let r = regions.get(key); if (r === undefined) regions.set(key, r = slow(part, x, y, z)); return r; };
  const displays = JSON.parse(vm.runInContext("JSON.stringify(Object.fromEntries(BL.characters.all().map((c) => [c.handle, c.display || c.handle])))", context));
  const reviewedFile = join(directory, "labels.json"), reviewed = existsSync(reviewedFile) ? JSON.parse(read(reviewedFile)) : {};
  const stockPieces = new Map();
  for (const design of designs.filter((d) => d.name === "zz-wardrobe-stock")) for (const _ of [design.stock = true]) for (const [slot, content] of Object.entries(piecesOf(design)))
    stockPieces.set(slot + ":" + design.slim, content);
  const found = new Map();
  const check = (content) => { context.valueText = JSON.stringify(content); return vm.runInContext("BL.equipmentWardrobe.encode(BL.equipmentWardrobe.validateContent(JSON.parse(valueText)))", context); };
  for (const design of designs) {
    const stock = design.stock = design.name === "zz-wardrobe-stock";
    design.display = displays[design.name];
    design.custom = design.head && !design.head.stock;
    for (const [slot, content] of Object.entries(piecesOf(design))) {
      const text = check(content), version = sha(text), stockText = stockPieces.get(slot + ":" + design.slim);
      const isStock = stock || !!stockText && check(stockText) === text;
      let entry = found.get(version);
      if (!entry) found.set(version, entry = { slot, version, text, label: labelOf(slot, content, design, isStock, reviewed), creators: [], stock: isStock });
      const creator = isStock ? STOCK : design.name;
      if (!entry.creators.includes(creator)) entry.creators.push(creator);
    }
  }
  // The bodies are the game's own builds and shapes, not anyone's design.
  for (const [build, shape, label] of [["regular", null, "Male"], ["slim", null, "Female"], ["regular", "lean", "Male, lean"], ["slim", "lean", "Female, lean"],
    ["regular", "big", "Male, big-boned"], ["slim", "big", "Female, big-boned"]]) {
    const content = { format: 1, slot: "body", build, ...(shape ? { shape } : null) }, text = check(content), version = sha(text);
    found.set(version, { slot: "body", version, text, label, creators: [STOCK], stock: true });
  }
  // An Ooga's own colours, as swatches in this order.
  const SWATCHES = {
    skin: [["Fair", "#f6d2b8"], ["Light", "#f1c27d"], ["Peach", "#e8b48c"], ["Tan", "#d9a06b"], ["Warm", "#c98a5b"], ["Golden brown", "#b58057"], ["Brown", "#a9744c"],
      ["Chestnut", "#8a5a3a"], ["Bronze", "#8d5524"], ["Deep brown", "#6b4226"], ["Dark", "#4a2c17"]],
    hairColor: [["Black", "#151312"], ["Dark brown", "#2b1b10"], ["Brown", "#4a2c14"], ["Light brown", "#5c4425"], ["Chestnut", "#7a2e12"], ["Ginger", "#c4622a"],
      ["Blonde", "#d8b860"], ["Platinum", "#ece0b8"], ["Grey", "#8b8279"], ["White", "#f2efe4"], ["Blue", "#3a6ad0"], ["Green", "#3a9a48"], ["Pink", "#e070a0"], ["Purple", "#7a3fa8"]],
    eyeColor: [["Brown", "#5a3a1e"], ["Hazel", "#8a6a2a"], ["Amber", "#d08a20"], ["Green", "#3a9a48"], ["Blue", "#3a6ad0"], ["Ice", "#8fd0ff"], ["Grey", "#8b8279"],
      ["Violet", "#a070e0"], ["Red", "#c42828"], ["Gold", "#e0a830"]]
  };
  for (const [slot, list] of Object.entries(SWATCHES)) for (const [label, color] of list) {
    const text = check({ format: 1, slot, color }), version = sha(text);
    found.set(version, { slot, version, text, label, creators: [STOCK], stock: true });
  }
  const catalogFile = join(directory, "catalog.json"), old = existsSync(catalogFile) ? JSON.parse(read(catalogFile)).items : [];
  const rows = [];
  for (const entry of found.values()) rows.push({ id: entry.slot + "-" + entry.version.slice(0, 16), slot: entry.slot, label: entry.label, creators: entry.creators, version: entry.version, stock: entry.stock });
  for (const row of old) if (!found.has(row.version)) rows.push({ ...row, retired: true });
  const order = new Map(JSON.parse(vm.runInContext("JSON.stringify(BL.equipmentWardrobe.WORN)", context)).map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.slot) - order.get(b.slot) || (b.stock ? 1 : 0) - (a.stock ? 1 : 0) || (a.stock && b.stock ? 0 : a.label.localeCompare(b.label, "en")));
  // Two pieces under one name in a slot are told apart by who made them.
  const seen = new Map();
  for (const row of rows) { const k = row.slot + ":" + row.label; seen.set(k, (seen.get(k) || 0) + 1); }
  for (const row of rows) if (seen.get(row.slot + ":" + row.label) > 1 && !row.stock && !row.retired) row.label = `${row.label} (${displays[row.creators[0]] || row.creators[0]})`;
  mkdirSync(directory, { recursive: true });
  for (const entry of found.values()) {
    const file = join(directory, entry.version + ".json");
    if (existsSync(file) && read(file) !== entry.text) throw new Error("Refusing to overwrite an immutable wardrobe piece");
    if (!existsSync(file)) writeFileSync(file, entry.text, { flag: "wx" });
  }
  const items = rows.map(({ stock, ...row }) => row);
  writeFileSync(catalogFile, JSON.stringify({ format: 1, items }, null, 2) + "\n");
  return writeWardrobe(base);
};

// The committed pieces, checked whole, and the generated files from them.
export const readWardrobe = (base = root) => {
  const directory = directoryFor(base), context = sandbox(base, false);
  if (!existsSync(join(directory, "catalog.json"))) return { items: [], contents: {} };
  const catalog = JSON.parse(read(join(directory, "catalog.json")));
  if (catalog.format !== 1 || !Array.isArray(catalog.items)) throw new Error("Invalid wardrobe catalog");
  context.rowsText = JSON.stringify(catalog.items);
  vm.runInContext("BL.equipmentWardrobe.register(JSON.parse(rowsText))", context);
  const contents = {};
  for (const row of catalog.items) {
    const text = read(join(directory, row.version + ".json"));
    if (sha(text) !== row.version || Buffer.byteLength(text) > 256 * 1024) throw new Error(`Wardrobe piece ${row.id} does not match its hash`);
    context.valueText = text; context.slot = row.slot;
    if (vm.runInContext("BL.equipmentWardrobe.encode(BL.equipmentWardrobe.validateContent(JSON.parse(valueText), slot))", context) !== text)
      throw new Error(`Wardrobe piece ${row.id} is not canonical`);
    contents[row.version] = JSON.parse(text);
  }
  for (const name of readdirSync(directory)) if (HASH.test(name.slice(0, -5)) && !Object.hasOwn(contents, name.slice(0, -5)))
    throw new Error(`Wardrobe piece ${name} was removed from its catalog`);
  return { items: catalog.items, contents };
};

export const writeWardrobe = (base = root) => {
  const { items, contents } = readWardrobe(base), header = "// Generated from src/equipment/wardrobe by scripts/equipment-wardrobe.mjs; do not edit.\n";
  writeFileSync(join(base, "src/js/equipment-wardrobe.gen.js"), header + `globalThis.BL.equipmentWardrobe.register(${JSON.stringify(items)});\n`);
  writeFileSync(join(base, "src/js/equipment-wardrobe-data.gen.js"), header + `globalThis.BL.equipmentWardrobe.seed(${JSON.stringify(contents)});\n`);
  return { items: items.length, bytes: Buffer.byteLength(JSON.stringify(contents)) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode && mode !== "--author") throw new Error("Usage: node scripts/equipment-wardrobe.mjs [--author]");
  console.log(JSON.stringify(mode === "--author" ? authorWardrobe() : writeWardrobe()));
}
