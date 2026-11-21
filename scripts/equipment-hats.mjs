// Maintainer authoring only. Normal builds validate committed archives, never execute character sources.
// Item revisions bind attribution, lineage and fitting; complete geometry blobs are shared by content hash.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Legacy fixture/bootstrap defaults. Reviewed registrations beyond these live in sources.json.
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
const HASH = /^[a-f0-9]{64}$/, ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const own = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validId = (value) => typeof value === "string" && value.length <= 64 && value !== "none" && ID.test(value);
const validHash = (value) => typeof value === "string" && HASH.test(value);
const validLogin = (value) => typeof value === "string" && LOGIN.test(value) && !value.includes("--");
const sameParent = (a, b) => a === null ? b === null : b !== null && a.item === b.item && a.version === b.version;
const read = (file) => readFileSync(file, "utf8");
const directoryFor = (base) => join(base, "src/equipment/hats");
const contextFor = (base, models = false) => {
  const context = vm.createContext({ URLSearchParams, location: { search: "" } });
  vm.runInContext("window = globalThis", context);
  for (const name of [...(models ? ["math", "scene", "models", "characters"] : []), "equipment-hats"])
    vm.runInContext(read(join(base, "src/js", name + ".js")), context, { timeout: 2000, filename: name + ".js" });
  return context;
};
const checked = (context, value, expression) => {
  context.valueText = JSON.stringify(value);
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context, { timeout: 2000 }));
};
const encoded = (context, value) => {
  context.valueText = JSON.stringify(value);
  return vm.runInContext("BL.equipmentHats.encode(JSON.parse(valueText))", context, { timeout: 2000 });
};
const sourceDefinitions = (base) => {
  const context = contextFor(base), file = join(directoryFor(base), "sources.json");
  const value = existsSync(file) ? JSON.parse(read(file)) : { format: 1, items: HAT_SOURCES.map(([id, label, creator]) => ({
    id, label, creator, profile: context.BL.equipmentHats.legacyProfile(id), parent: null, source: { kind: "character", handle: creator }
  })) };
  if (!own(value, ["format", "items"]) || value.format !== 1 || !Array.isArray(value.items) || !value.items.length || value.items.length > 32)
    throw new Error("Invalid reviewed hat source registry");
  const seen = new Set();
  for (const row of value.items) {
    if (!own(row, ["id", "label", "creator", "profile", "parent", "source"]) || !validId(row.id) || seen.has(row.id)
      || typeof row.label !== "string" || !row.label || row.label.length > 80 || !validLogin(row.creator)
      || !context.BL.equipmentHats.PROFILES.includes(row.profile)
      || row.parent !== null && (!own(row.parent, ["item", "version"]) || !validId(row.parent.item)
        || row.parent.item === row.id || !validHash(row.parent.version))) throw new Error("Invalid reviewed hat source definition");
    seen.add(row.id);
    if (row.source?.kind === "character") {
      if (!own(row.source, ["kind", "handle"]) || !validLogin(row.source.handle)) throw new Error("Invalid reviewed character source");
    } else if (row.source?.kind === "reuse") {
      if (!own(row.source, ["kind", "item", "version"]) || !validId(row.source.item) || !validHash(row.source.version)
        || !sameParent(row.parent, row.source)) throw new Error("Reused geometry must pin its exact parent revision");
    } else throw new Error("Unknown reviewed hat source kind");
  }
  return value.items;
};

const readEquipmentHats = (base, allowOrphans = false) => {
  const directory = directoryFor(base), text = read(join(directory, "catalog.json")), context = contextFor(base);
  if (Buffer.byteLength(text) > 128 * 1024) throw new Error("Archived hat catalog exceeds its bound");
  const catalog = JSON.parse(text);
  if (![1, 2].includes(catalog.format) || !Array.isArray(catalog.items) || catalog.items.length > 32) throw new Error("Invalid archived hat catalog");
  // Refuse unbounded or duplicated references before opening any archive files.
  const ids = new Set(), hashes = new Set(); let total = 0;
  for (const row of catalog.items) {
    if (!row || !validId(row.id) || ids.has(row.id) || !Array.isArray(row.versions) || !row.versions.length
      || (total += row.versions.length) > context.BL.equipmentHats.MAX_VERSIONS || !validHash(row.current) || !row.versions.includes(row.current))
      throw new Error("Invalid archived hat versions");
    ids.add(row.id);
    for (const version of row.versions) {
      if (!validHash(version) || hashes.has(version)) throw new Error("Invalid or duplicated hat revision");
      hashes.add(version);
    }
  }
  const archives = {}, contents = {}, revisions = {}, current = {}, currentContents = {};
  const load = (version) => {
    if (!validHash(version)) throw new Error("Invalid immutable hat hash");
    if (Object.hasOwn(archives, version)) return JSON.parse(archives[version]);
    const text = read(join(directory, version + ".json"));
    if (hatHash(text) !== version || Buffer.byteLength(text) > context.BL.equipmentHats.MAX_BYTES) throw new Error("Immutable hat archive hash/size mismatch");
    const value = JSON.parse(text);
    if (encoded(context, value) !== text) throw new Error("Noncanonical hat archive");
    archives[version] = text; return value;
  };
  for (const row of catalog.items) {
    if (!row || !Array.isArray(row.versions)) throw new Error("Invalid archived hat versions");
    for (const version of row.versions) {
      const value = load(version);
      context.item = row.id;
      checked(context, value, "BL.equipmentHats.validate(JSON.parse(valueText),item)");
      let content, profile, parent;
      if (value.format === 1) {
        const geometry = checked(context, value, "BL.equipmentHats.contentOf(JSON.parse(valueText))");
        content = hatHash(encoded(context, geometry)); profile = context.BL.equipmentHats.legacyProfile(row.id); parent = null;
      } else {
        ({ content, profile, parent } = value);
        const geometry = checked(context, load(content), "BL.equipmentHats.validateContent(JSON.parse(valueText))");
        contents[content] = geometry;
        if (version === row.current) currentContents[content] = geometry;
      }
      if (Object.hasOwn(revisions, version)) throw new Error("Hat revision belongs to another item");
      revisions[version] = { item: row.id, content, profile, parent };
      if (version === row.current) current[version] = value;
    }
  }
  context.rowsText = JSON.stringify(catalog.items); context.revisionsText = JSON.stringify(revisions);
  vm.runInContext("BL.equipmentHats.register(JSON.parse(rowsText),JSON.parse(revisionsText))", context, { timeout: 2000 });
  if (!allowOrphans) for (const name of readdirSync(directory)) if (HASH.test(name.slice(0, -5)) && name.endsWith(".json")
    && !Object.hasOwn(archives, name.slice(0, -5))) throw new Error("Archived hat version was removed from its catalog");
  return { catalog, archives, contents, revisions, current, currentContents };
};

const extractDefinition = (base, definition, previous = null) => {
  const { id, profile, parent } = definition, context = contextFor(base, definition.source.kind === "character");
  let content, source;
  if (definition.source.kind === "reuse") {
    const saved = previous || readEquipmentHats(base), { item, version } = definition.source;
    if (!saved.catalog.items.some((row) => row.id === item && row.versions.includes(version))) throw new Error("Reused parent is not a retained item revision");
    const archive = JSON.parse(saved.archives[version]);
    content = archive.format === 1 ? checked(context, archive, "BL.equipmentHats.contentOf(JSON.parse(valueText))") : saved.contents[archive.content];
    source = hatHash(encoded(context, definition.source));
  } else {
    const handle = definition.source.handle, text = read(join(base, "src/characters", handle + ".js"));
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error("Character source is too large");
    source = hatHash(text);
    vm.runInContext(text, context, { timeout: 2000, filename: handle + ".js" });
    // Only reviewed explicit hat hooks run. Body, hair, weapons and pets do not enter the archive.
    const raw = vm.runInContext(`(() => {
      const B=BL, M=B.models, S=B.scene, c=B.characters.get(${JSON.stringify(handle)});
      if (!c?.dress || !(c.dress.hat || c.dress.hatNodes)) throw new Error('Approved character has no hat hook');
      const palette=[], color=(hex)=>{const rgb=B.math.hexToRgb(hex), key=rgb.join(',');let n=palette.findIndex(p=>p.join(',')===key);if(n<0){n=palette.length;palette.push(rgb);}return n;};
      const rand=B.math.mulberry32(B.math.fnv1a(c.handle+'/hat-v1')), head=S.createNode(), u=1/16;
      const kit={h:1,u,traits:c.look||{},P:{},color,rand,parts:{head},root:head,
        jit:(a,b,chance)=>()=>rand()<chance?b:a, vg:(v,origin)=>M.voxelGeometry(v,{unit:u,palette,origin})};
      const v=M.makeVox(); if(c.dress.hat)c.dress.hat(kit,v);
      if(v.map.size)S.addChild(head,S.createNode({geometry:M.voxelGeometry(v,{unit:u,palette,origin:{x:-3.5*u,y:0,z:-3*u}})}));
      if(c.dress.hatNodes)c.dress.hatNodes(kit);
      const nodes=head.children.map(n=>{
        if(n.children.length||n.quaternion||!n.geometry)throw new Error('Hat archive requires explicit leaf geometry');
        return {position:Object.values(n.position),rotation:Object.values(n.rotation),scale:Object.values(n.scale),geometry:{
          verts:Array.from(n.geometry.verts),faces:n.geometry.faces.map(f=>({i:Array.from(f.i),color:Array.from(f.color),emissive:f.emissive||0})),lines:[]}};
      });
      return JSON.stringify({format:2,fit:'ooga-head-v1',nodes});
    })()`, context, { timeout: 10000 });
    content = JSON.parse(raw);
    if (profile === "ruby-crown") for (const node of content.nodes) {
      for (let i = 0; i < 3; i++) node.scale[i] /= 0.85;
      node.position = node.position.map((n, i) => i === 1 ? (n + (0.85 - 0.7) / 16) / 0.85 : n / 0.85);
    }
    const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)])) : typeof value === "number" ? Math.round(value * 1e9) / 1e9 : value;
    content = normalize(content);
  }
  checked(context, content, "BL.equipmentHats.validateContent(JSON.parse(valueText))");
  const contentText = encoded(context, content), digest = hatHash(contentText);
  const archive = { format: 2, item: id, content: digest, profile, parent };
  context.item = id; checked(context, archive, "BL.equipmentHats.validate(JSON.parse(valueText),item)");
  const text = encoded(context, archive);
  if (Buffer.byteLength(contentText) > context.BL.equipmentHats.MAX_BYTES) throw new Error("Hat exceeds archive byte limit");
  return { text, version: hatHash(text), source, content: digest, contentText, profile, parent };
};
export const extractHat = (base, id) => {
  const definition = sourceDefinitions(base).find((row) => row.id === id);
  if (!definition) throw new Error("Unknown approved hat source");
  return extractDefinition(base, definition);
};
const unchanged = (metadata, result) => metadata && metadata.content === result.content && metadata.profile === result.profile && sameParent(metadata.parent, result.parent);
const checkIdentity = (old, definition) => {
  if (old && (old.creator !== definition.creator || !sameParent(old.parent || null, definition.parent))) throw new Error("Published hat creator and lineage are immutable");
};

export const authorEquipmentHats = (base = root, selected = null) => {
  const directory = directoryFor(base), indexFile = join(directory, "catalog.json"), definitions = sourceDefinitions(base);
  const previous = existsSync(indexFile) ? readEquipmentHats(base, true) : { catalog: { format: 2, items: [], sources: {} }, archives: {}, revisions: {}, contents: {} };
  if (selected !== null && (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
    || selected.some((id) => !definitions.some((row) => row.id === id)))) throw new Error("Select reviewed hat item IDs");
  const items = previous.catalog.items.map((row) => ({ ...row, parent: row.parent || null, versions: [...row.versions] }));
  const sources = { ...previous.catalog.sources }, archives = { ...previous.archives }, revisions = { ...previous.revisions };
  for (const definition of definitions) {
    const old = items.find((row) => row.id === definition.id); checkIdentity(old, definition);
    if (selected && !selected.includes(definition.id)) continue;
    const result = extractDefinition(base, definition, previous);
    sources[definition.id] = result.source;
    if (old && unchanged(revisions[old.current], result)) { old.label = definition.label; continue; }
    const row = { id: definition.id, label: definition.label, creator: definition.creator, parent: definition.parent,
      current: result.version, versions: [...new Set([...(old?.versions || []), result.version])] };
    if (old) items[items.indexOf(old)] = row; else items.push(row);
    archives[result.content] = result.contentText; archives[result.version] = result.text;
    revisions[result.version] = { item: row.id, content: result.content, profile: result.profile, parent: result.parent };
  }
  const context = contextFor(base); context.rowsText = JSON.stringify(items); context.revisionsText = JSON.stringify(revisions);
  vm.runInContext("BL.equipmentHats.register(JSON.parse(rowsText),JSON.parse(revisionsText))", context, { timeout: 2000 });
  mkdirSync(directory, { recursive: true });
  // Check the entire plan before writing anything. A retry may finish its own identical unpublished files.
  for (const name of readdirSync(directory)) if (HASH.test(name.slice(0, -5)) && name.endsWith(".json")
    && !Object.hasOwn(archives, name.slice(0, -5))) throw new Error("Archived hat version was removed from its catalog");
  for (const [version, text] of Object.entries(archives)) {
    const file = join(directory, version + ".json");
    if (existsSync(file) && read(file) !== text) throw new Error("Refusing to overwrite immutable hat archive");
  }
  for (const [version, text] of Object.entries(archives)) {
    const file = join(directory, version + ".json"); if (!existsSync(file)) writeFileSync(file, text, { flag: "wx" });
  }
  writeFileSync(indexFile, JSON.stringify({ format: 2, items, sources }, null, 2) + "\n");
  return writeEquipmentHats(base);
};

// Explicit source execution, kept outside ordinary build/CI. Unrelated file changes are provenance only.
export const checkEquipmentHatSources = (base = root) => {
  const saved = readEquipmentHats(base), sourceChanged = [], geometryChanged = [];
  for (const definition of sourceDefinitions(base)) {
    const row = saved.catalog.items.find((item) => item.id === definition.id); checkIdentity(row, definition);
    const extracted = extractDefinition(base, definition, saved);
    if (saved.catalog.sources?.[definition.id] !== extracted.source) sourceChanged.push(definition.id);
    if (!row || !unchanged(saved.revisions[row.current], extracted)) geometryChanged.push({ id: definition.id, current: row?.current || null, extracted: extracted.version });
  }
  return { items: saved.catalog.items.length, sourceChanged, geometryChanged };
};

export const writeEquipmentHats = (base = root) => {
  const { catalog, archives, revisions, current, currentContents } = readEquipmentHats(base);
  const header = "// Generated from immutable src/equipment/hats archives by scripts/equipment-hats.mjs; do not edit.\n";
  writeFileSync(join(base, "src/js/equipment-hats.gen.js"), header + `globalThis.BL.equipmentHats.register(${JSON.stringify(catalog.items)},${JSON.stringify(revisions)});\n`);
  writeFileSync(join(base, "src/js/equipment-hat-data.gen.js"), header + `window.BL.characterEquipment.seed(${JSON.stringify(current)},${JSON.stringify(currentContents)});\n`);
  writeFileSync(join(base, "worker/src/equipment-hat-data.gen.json"), JSON.stringify(archives) + "\n");
  return { items: catalog.items.length, versions: Object.keys(revisions).length, currentBytes: Buffer.byteLength(JSON.stringify(current)) + Buffer.byteLength(JSON.stringify(currentContents)) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, ...selected] = process.argv.slice(2);
  if (mode && !["--author", "--check-sources"].includes(mode) || selected.length && mode !== "--author")
    throw new Error("Usage: node scripts/equipment-hats.mjs [--author [item ...]|--check-sources]");
  const result = mode === "--check-sources" ? checkEquipmentHatSources() : mode === "--author" ? authorEquipmentHats(root, selected.length ? selected : null) : writeEquipmentHats();
  console.log(JSON.stringify(result));
  if (mode === "--check-sources" && result.geometryChanged.length) process.exitCode = 1;
}
