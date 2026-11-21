// Maintainer authoring only: archive the nine approved sources' explicit hat hooks as immutable plain geometry.
// Normal builds use committed archives alone. Source drift is checked only by an explicit maintainer command.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const HAT_SOURCES = Object.freeze([
  ["bitcoin-bill-straw", "Straw hat", "Bitcoin-Bill"],
  ["global-dsb-spiked-helmet", "Spiked helmet", "Global-DSB"],
  ["bc1gui-green-beanie", "Green Bitcoin beanie", "bc1gui"],
  ["hotpixelgroup-flame-crown", "Green flame crown", "hotpixelgroup"],
  ["itsliran-taproot-cap", "Taproot cap", "itsLiran"],
  ["johnstackton21m-helmet", "Gold space helmet", "johnstackton21m"],
  ["midy-machete-crown", "Ruby crown", "midy-machete"],
  ["rules-without-rulers-top-hat", "Orange-band top hat", "rules-without-rulers"],
  ["timechainb-gold-crown", "Gold crown", "timechainb"]
].map(Object.freeze));
export const hatHash = (text) => createHash("sha256").update(text).digest("hex");
const pathFor = (base, handle) => join(base, "src/characters", handle + ".js");
const read = (file) => readFileSync(file, "utf8");
const contextFor = (base, models = false) => {
  const context = vm.createContext({ URLSearchParams, location: { search: "" } });
  vm.runInContext("window = globalThis", context);
  for (const name of [...(models ? ["math", "scene", "models", "characters"] : []), "equipment-hats"])
    vm.runInContext(read(join(base, "src/js", name + ".js")), context, { timeout: 2000, filename: name + ".js" });
  return context;
};

export const extractHat = (base, id) => {
  const row = HAT_SOURCES.find((r) => r[0] === id);
  if (!row) throw new Error("Unknown approved hat source");
  const context = contextFor(base, true), source = read(pathFor(base, row[2]));
  vm.runInContext(source, context, { timeout: 2000, filename: row[2] + ".js" });
  // Only explicit hat hooks are invoked. No body, skull, eyes, hair, weapon, pet or other dress hook is run.
  const raw = vm.runInContext(`(() => {
    const B=BL, M=B.models, S=B.scene, c=B.characters.get(${JSON.stringify(row[2])});
    if (!c?.dress || !(c.dress.hat || c.dress.hatNodes)) throw new Error('Approved character has no hat hook');
    const palette=[], color=(hex)=>{const rgb=B.math.hexToRgb(hex), key=rgb.join(',');let n=palette.findIndex(p=>p.join(',')===key);if(n<0){n=palette.length;palette.push(rgb);}return n;};
    const rand=B.math.mulberry32(B.math.fnv1a(c.handle+'/hat-v1')), head=S.createNode(), u=1/16;
    const kit={h:1,u,traits:c.look||{},P:{},color,rand,parts:{head},root:head,
      jit:(a,b,chance)=>()=>rand()<chance?b:a,
      vg:(v,origin)=>M.voxelGeometry(v,{unit:u,palette,origin})};
    const v=M.makeVox(); if(c.dress.hat)c.dress.hat(kit,v);
    if(v.map.size)S.addChild(head,S.createNode({geometry:M.voxelGeometry(v,{unit:u,palette,origin:{x:-3.5*u,y:0,z:-3*u}})}));
    if(c.dress.hatNodes)c.dress.hatNodes(kit);
    const nodes=head.children.map(n=>{
      if(n.children.length||n.quaternion||!n.geometry)throw new Error('Hat archive requires explicit leaf geometry');
      return {position:Object.values(n.position),rotation:Object.values(n.rotation),scale:Object.values(n.scale),geometry:{
        verts:Array.from(n.geometry.verts),faces:n.geometry.faces.map(f=>({i:Array.from(f.i),color:Array.from(f.color),emissive:f.emissive||0})),lines:[]}};
    });
    return JSON.stringify({format:1,item:${JSON.stringify(id)},fit:'ooga-head-v1',nodes});
  })()`, context, { timeout: 10000 });
  const archive = JSON.parse(raw);
  // At canonical h=1, the Ruby crown's original custom head is smaller than the regular head. Normalize that fit.
  if (id === "midy-machete-crown") for (const node of archive.nodes) {
    for (let i = 0; i < 3; i++) node.scale[i] /= 0.85;
    node.position = node.position.map((n, i) => i === 1 ? (n + (0.85 - 0.7) / 16) / 0.85 : n / 0.85);
  }
  const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)])) : typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value;
  const normalized = normalize(archive);
  // Validate in its own realm just as the browser validates parsed JSON.
  context.archiveText = JSON.stringify(normalized); context.item = id;
  const text = vm.runInContext("BL.equipmentHats.encode(BL.equipmentHats.validate(JSON.parse(archiveText),item))", context);
  if (Buffer.byteLength(text) > context.BL.equipmentHats.MAX_BYTES) throw new Error("Hat exceeds archive byte limit");
  return { text, version: hatHash(text), source: hatHash(source) };
};

export const authorEquipmentHats = (base = root) => {
  const directory = join(base, "src/equipment/hats"), indexFile = join(directory, "catalog.json");
  mkdirSync(directory, { recursive: true });
  const previous = existsSync(indexFile) ? JSON.parse(read(indexFile)) : { format: 1, items: [], sources: {} };
  const items = [], sources = {};
  for (const [id, label, handle] of HAT_SOURCES) {
    const result = extractHat(base, id), old = previous.items.find((r) => r.id === id), file = join(directory, result.version + ".json");
    if (existsSync(file)) {
      if (read(file) !== result.text) throw new Error("Refusing to overwrite immutable hat archive");
    } else writeFileSync(file, result.text, { flag: "wx" });
    items.push({ id, label, creator: handle, current: result.version, versions: [...new Set([...(old?.versions || []), result.version])] });
    sources[id] = result.source;
  }
  if (items.reduce((n, row) => n + row.versions.length, 0) > 256) throw new Error("Hat archive capacity reached; retained versions may not be deleted");
  writeFileSync(indexFile, JSON.stringify({ format: 1, items, sources }, null, 2) + "\n");
  return writeEquipmentHats(base);
};

const readEquipmentHats = (base) => {
  const directory = join(base, "src/equipment/hats"), catalog = JSON.parse(read(join(directory, "catalog.json"))), context = contextFor(base);
  if (catalog.format !== 1 || catalog.items.length !== HAT_SOURCES.length) throw new Error("Invalid archived hat catalog");
  context.rowsText = JSON.stringify(catalog.items);
  vm.runInContext("BL.equipmentHats.register(JSON.parse(rowsText))", context);
  const archives = {}, current = {};
  for (const [id] of HAT_SOURCES) {
    const row = catalog.items.find((r) => r.id === id);
    if (!row) throw new Error("Approved hat is missing from its catalog");
    for (const version of row.versions) {
      const text = read(join(directory, version + ".json"));
      if (hatHash(text) !== version || Buffer.byteLength(text) > context.BL.equipmentHats.MAX_BYTES) throw new Error("Immutable hat archive hash/size mismatch");
      context.archiveText = text; context.item = id;
      if (vm.runInContext("BL.equipmentHats.encode(BL.equipmentHats.validate(JSON.parse(archiveText),item))", context) !== text) throw new Error("Noncanonical hat archive");
      archives[version] = text;
      if (version === row.current) current[version] = JSON.parse(text);
    }
  }
  // An old file left out of the index is a lost historical version, not garbage to delete.
  for (const name of readdirSync(directory)) if (/^[a-f0-9]{64}\.json$/.test(name) && !Object.hasOwn(archives, name.slice(0, -5))) throw new Error("Archived hat version was removed from its catalog");
  return { catalog, archives, current };
};

// Like --author, this executes reviewed local character code. It is deliberately outside normal builds:
// unrelated voice/body changes may alter source provenance without changing the published hat at all.
export const checkEquipmentHatSources = (base = root) => {
  const { catalog } = readEquipmentHats(base), sourceChanged = [], geometryChanged = [];
  for (const [id] of HAT_SOURCES) {
    const extracted = extractHat(base, id), row = catalog.items.find((r) => r.id === id);
    if (catalog.sources?.[id] !== extracted.source) sourceChanged.push(id);
    if (row.current !== extracted.version) geometryChanged.push({ id, current: row.current, extracted: extracted.version });
  }
  return { items: catalog.items.length, sourceChanged, geometryChanged };
};

export const writeEquipmentHats = (base = root) => {
  const { catalog, archives, current } = readEquipmentHats(base);
  const header = "// Generated from immutable src/equipment/hats archives by scripts/equipment-hats.mjs; do not edit.\n";
  writeFileSync(join(base, "src/js/equipment-hats.gen.js"), header + `globalThis.BL.equipmentHats.register(${JSON.stringify(catalog.items)});\n`);
  writeFileSync(join(base, "src/js/equipment-hat-data.gen.js"), header + `window.BL.characterEquipment.seed(${JSON.stringify(current)});\n`);
  writeFileSync(join(base, "worker/src/equipment-hat-data.gen.json"), JSON.stringify(archives) + "\n");
  return { items: catalog.items.length, versions: Object.keys(archives).length, currentBytes: Buffer.byteLength(JSON.stringify(current)) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (process.argv.length > 3 || mode && mode !== "--author" && mode !== "--check-sources") throw new Error("Usage: node scripts/equipment-hats.mjs [--author|--check-sources]");
  const result = mode === "--check-sources" ? checkEquipmentHatSources() : mode === "--author" ? authorEquipmentHats() : writeEquipmentHats();
  console.log(JSON.stringify(result));
  if (mode === "--check-sources" && result.geometryChanged.length) process.exitCode = 1;
}
